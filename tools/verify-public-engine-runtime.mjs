#!/usr/bin/env node

import { setTimeout as delay } from "node:timers/promises";

const expectedSha = String(process.argv[2] || "").trim().toLowerCase();
const base = String(process.env.ENGINE_BASE || "https://ai-matchlab-engine.onrender.com").replace(/\/+$/, "");
const rounds = Number(process.env.ENGINE_STABILITY_ROUNDS || 3);
const pauseMs = Number(process.env.ENGINE_STABILITY_PAUSE_MS || 5000);
const timeoutMs = Number(process.env.ENGINE_ENDPOINT_TIMEOUT_MS || 30000);
const maxEndpointMs = Number(process.env.ENGINE_ENDPOINT_MAX_MS || 11000);

if (!/^[0-9a-f]{40}$/u.test(expectedSha)) {
  console.error("ERROR: expected 40-hex commit SHA");
  process.exit(2);
}

async function fetchJson(pathname) {
  const url = `${base}${pathname}`;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`endpoint_timeout:${pathname}`));
  }, timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal
    });
    const text = await response.text();
    const elapsedMs = Date.now() - startedAt;
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`invalid_json:${pathname}:http_${response.status}`);
    }

    if (!response.ok) {
      throw new Error(`http_${response.status}:${pathname}:${JSON.stringify(payload).slice(0, 300)}`);
    }
    if (elapsedMs > maxEndpointMs) {
      throw new Error(`endpoint_slow:${pathname}:${elapsedMs}ms>${maxEndpointMs}ms`);
    }

    return { pathname, payload, elapsedMs, bytes: Buffer.byteLength(text) };
  } finally {
    clearTimeout(timer);
  }
}

function validDay(value) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(String(value || ""));
}

async function verifyRound(round) {
  const verifyToken = `${expectedSha}-${round}-${Date.now()}`;
  const [health, release, ready] = await Promise.all([
    fetchJson(`/health?verify=${verifyToken}`),
    fetchJson(`/release?verify=${verifyToken}`),
    fetchJson(`/ready?verify=${verifyToken}`)
  ]);

  if (health.payload?.ok !== true) throw new Error("health_not_ok");
  if (String(release.payload?.gitCommit || "").toLowerCase() !== expectedSha) {
    throw new Error(`release_sha_mismatch:${release.payload?.gitCommit || "missing"}`);
  }
  if (release.payload?.runtimeDisplay?.requestTimeOverlaysEnabled !== false) {
    throw new Error("request_time_overlays_not_disabled");
  }
  if (ready.payload?.ok !== true || ready.payload?.ready !== true) {
    throw new Error(`engine_not_ready:${JSON.stringify(ready.payload).slice(0, 300)}`);
  }

  const day = String(ready.payload?.day || "");
  if (!validDay(day)) throw new Error(`invalid_ready_day:${day}`);

  const endpoints = [
    `/deploy-snapshot/latest?verify=${verifyToken}`,
    `/deploy-snapshot?date=${encodeURIComponent(day)}&verify=${verifyToken}`,
    `/fixtures-runtime?mode=active&date=${encodeURIComponent(day)}&verify=${verifyToken}`,
    `/fixtures-runtime?mode=today&date=${encodeURIComponent(day)}&verify=${verifyToken}`,
    `/value-picks?date=${encodeURIComponent(day)}&verify=${verifyToken}`,
    `/value-comparison?date=${encodeURIComponent(day)}&verify=${verifyToken}`
  ];

  const results = await Promise.all(endpoints.map(fetchJson));
  for (const result of results) {
    if (result.payload?.ok !== true) {
      throw new Error(`payload_not_ok:${result.pathname}`);
    }
    if (result.pathname.includes("fixtures-runtime")) {
      if (String(result.payload?.date || "") !== day || !Array.isArray(result.payload?.matches)) {
        throw new Error(`fixtures_contract_invalid:${result.pathname}`);
      }
      if (result.payload?.runtimeOverlay?.enabled !== false) {
        throw new Error(`fixtures_request_overlay_enabled:${result.pathname}`);
      }
    }
  }

  const latest = results.find(result => result.pathname.startsWith("/deploy-snapshot/latest"));
  const snapshot = results.find(result => result.pathname.startsWith("/deploy-snapshot?"));
  if (String(latest?.payload?.date || "") !== day) throw new Error("latest_day_mismatch");
  if (String(snapshot?.payload?.date || "") !== day) throw new Error("snapshot_day_mismatch");
  if (String(latest?.payload?.hash || "").toLowerCase() !== String(snapshot?.payload?.manifest?.hash || "").toLowerCase()) {
    throw new Error("snapshot_hash_mismatch");
  }

  const postHealth = await fetchJson(`/health?verify=${verifyToken}-post`);
  if (postHealth.payload?.ok !== true) throw new Error("post_load_health_not_ok");

  const timing = [...results, health, release, ready, postHealth]
    .map(result => `${result.pathname}=${result.elapsedMs}ms`)
    .join(" ");
  console.log(`ENGINE_STABILITY_ROUND=${round} DAY=${day} ${timing}`);
}

for (let round = 1; round <= rounds; round += 1) {
  await verifyRound(round);
  if (round < rounds) await delay(pauseMs);
}

console.log(`ENGINE_RUNTIME_STABILITY_VERIFIED=true SHA=${expectedSha} ROUNDS=${rounds}`);
