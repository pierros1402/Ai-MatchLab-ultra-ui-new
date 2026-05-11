#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_LOCAL_API = "http://localhost:3010";
const DEFAULT_RENDER_API = "https://ai-matchlab-engine.onrender.com";

function parseArgs(argv) {
  const out = {};

  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;

    const eq = arg.indexOf("=");

    if (eq === -1) {
      out[arg.slice(2)] = true;
    } else {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
    }
  }

  return out;
}

function athensDayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function readJsonFile(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function fetchJson(url, label) {
  const res = await fetch(url, {
    headers: {
      accept: "application/json"
    }
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const preview = body ? " :: " + body.slice(0, 500) : "";
    throw new Error(label + " fetch failed: " + res.status + " " + res.statusText + preview);
  }

  return res.json();
}

function snapshotSummaryFromManifest(manifest) {
  return {
    generatedAt: manifest?.generatedAt ?? null,
    hash: manifest?.hash ?? null,
    fixtures: manifest?.counts?.fixtures ?? null,
    valuePicks: manifest?.counts?.valuePicks ?? null,
    details: manifest?.counts?.details ?? null
  };
}

function snapshotSummaryFromRuntime(payload) {
  return {
    generatedAt: payload?.snapshot?.generatedAt ?? null,
    hash: payload?.snapshot?.hash ?? null,
    fixtures: payload?.snapshot?.fixturesCount ?? null,
    valuePicks: payload?.snapshot?.valueCount ?? null,
    details: payload?.snapshot?.detailsCount ?? null,
    matches: Array.isArray(payload?.matches) ? payload.matches.length : null
  };
}

function sameSnapshot(fileSummary, apiSummary) {
  return (
    fileSummary.generatedAt === apiSummary.generatedAt &&
    fileSummary.hash === apiSummary.hash &&
    fileSummary.fixtures === apiSummary.fixtures &&
    fileSummary.valuePicks === apiSummary.valuePicks &&
    fileSummary.details === apiSummary.details
  );
}

function sameRuntime(left, right) {
  return (
    left.generatedAt === right.generatedAt &&
    left.hash === right.hash &&
    left.fixtures === right.fixtures &&
    left.valuePicks === right.valuePicks &&
    left.details === right.details &&
    left.matches === right.matches
  );
}

function printUsage() {
  console.log([
    "Usage:",
    "  node ./engine-v1/jobs/audit-snapshot-mirror-day.js --day=YYYY-MM-DD",
    "",
    "Options:",
    "  --day=YYYY-MM-DD",
    "  --local-api=http://localhost:3010",
    "  --render-api=https://ai-matchlab-engine.onrender.com",
    "  --skip-local-api",
    "  --skip-render-api"
  ].join("\n"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.h) {
    printUsage();
    return;
  }

  const day = String(args.day || athensDayKey()).trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new Error("Invalid --day value: " + day);
  }

  const localApiBase = String(args["local-api"] || DEFAULT_LOCAL_API).replace(/\/+$/, "");
  const renderApiBase = String(args["render-api"] || DEFAULT_RENDER_API).replace(/\/+$/, "");

  const manifestPath = path.join(process.cwd(), "data", "deploy-snapshots", day, "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    throw new Error("Missing local snapshot manifest: " + manifestPath);
  }

  const manifest = readJsonFile(manifestPath);
  const fileSummary = snapshotSummaryFromManifest(manifest);

  const result = {
    ok: false,
    day,
    manifestPath,
    file: fileSummary,
    localApi: null,
    renderApi: null,
    checks: {
      fileVsLocalApi: null,
      fileVsRenderApi: null,
      localApiVsRenderApi: null
    },
    hints: []
  };

  if (!args["skip-local-api"]) {
    const localUrl = localApiBase + "/fixtures-runtime?mode=today&date=" + encodeURIComponent(day);
    const localPayload = await fetchJson(localUrl, "local API");

    result.localApi = {
      baseUrl: localApiBase,
      url: localUrl,
      ...snapshotSummaryFromRuntime(localPayload)
    };

    result.checks.fileVsLocalApi = sameSnapshot(fileSummary, result.localApi);
  }

  if (!args["skip-render-api"]) {
    const renderUrl = renderApiBase + "/fixtures-runtime?mode=today&date=" + encodeURIComponent(day);
    const renderPayload = await fetchJson(renderUrl, "Render API");

    result.renderApi = {
      baseUrl: renderApiBase,
      url: renderUrl,
      ...snapshotSummaryFromRuntime(renderPayload)
    };

    result.checks.fileVsRenderApi = sameSnapshot(fileSummary, result.renderApi);
  }

  if (result.localApi && result.renderApi) {
    result.checks.localApiVsRenderApi = sameRuntime(result.localApi, result.renderApi);
  }

  const checks = Object.values(result.checks).filter(v => v !== null);
  result.ok = checks.length > 0 && checks.every(Boolean);

  if (result.localApi && !result.checks.fileVsLocalApi) {
    result.hints.push("Local API is not serving the same deploy snapshot as local files. Restart local engine with APP_MODE=SNAPSHOT_ONLY after git pull.");
  }

  if (result.renderApi && !result.checks.fileVsRenderApi) {
    result.hints.push("Render API is not serving the same deploy snapshot as Git/local files. Check daily/intraday Render deploy hook execution.");
  }

  if (result.localApi && result.renderApi && !result.checks.localApiVsRenderApi) {
    result.hints.push("Local API and Render API differ. Do not compare UI behavior until APIs mirror each other.");
  }

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error(JSON.stringify({
    ok: false,
    error: err?.message || String(err)
  }, null, 2));

  process.exitCode = 1;
});
