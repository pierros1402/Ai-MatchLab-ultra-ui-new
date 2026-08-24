import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import {
  canonicalBufferSha256
} from "../engine-v1/core/deploy-snapshot-release-contract.js";

const day =
  String(process.argv[2] || "").slice(0, 10);

const ref =
  String(process.argv[3] || "")
    .trim()
    .toLowerCase();

const engineBase =
  String(
    process.env.ENGINE_BASE ||
    "https://ai-matchlab-engine.onrender.com"
  ).replace(/\/+$/u, "");

const repo =
  String(
    process.env.SNAPSHOT_SYNC_REPO ||
    "pierros1402/Ai-MatchLab-ultra-ui-new"
  );

const secret =
  String(process.env.CRON_SECRET || "");

const maxAttempts =
  Math.max(
    1,
    Number(
      process.env.VALUE_COMPARISON_SYNC_MAX_ATTEMPTS ||
      90
    )
  );

const pollMs =
  Math.max(
    500,
    Number(
      process.env.VALUE_COMPARISON_SYNC_POLL_MS ||
      5000
    )
  );

if (!/^\d{4}-\d{2}-\d{2}$/u.test(day)) {
  throw new Error(`invalid_day_key:${day}`);
}

if (!/^[0-9a-f]{40}$/u.test(ref)) {
  throw new Error("immutable_ref_required");
}

if (!secret) {
  throw new Error("CRON_SECRET_required");
}

async function fetchWithTimeout(
  url,
  init = {},
  timeoutMs = 45000
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(
          new Error("request_timeout")
        ),
      timeoutMs
    );

  try {
    return await fetch(
      url,
      {
        ...init,
        signal: controller.signal,
        headers: {
          "cache-control": "no-cache",
          ...(init.headers || {})
        }
      }
    );
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(
  url,
  init = {},
  timeoutMs = 45000
) {
  const response =
    await fetchWithTimeout(
      url,
      init,
      timeoutMs
    );

  const text =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `http_${response.status}:${url}:${text.slice(0, 500)}`
    );
  }

  return JSON.parse(text);
}

const start =
  await fetchJson(
    `${engineBase}/ops/sync-value-comparison?date=${encodeURIComponent(day)}&ref=${encodeURIComponent(ref)}`,
    {
      method: "POST",
      headers: {
        "x-cron-secret": secret
      }
    },
    Number(
      process.env.VALUE_COMPARISON_SYNC_START_TIMEOUT_MS ||
      300000
    )
  );

const jobId =
  String(start?.job?.id || "");

if (
  start?.ok !== true ||
  !jobId
) {
  throw new Error(
    "comparison_sync_start_invalid"
  );
}

console.log(
  `VALUE_COMPARISON_SYNC_JOB_ID=${jobId}`
);

let finalJob = null;

for (
  let attempt = 1;
  attempt <= maxAttempts;
  attempt += 1
) {
  const status =
    await fetchJson(
      `${engineBase}/ops/sync-value-comparison/status?id=${encodeURIComponent(jobId)}`,
      {
        headers: {
          "x-cron-secret": secret
        }
      }
    );

  const job =
    status?.job || null;

  const state =
    String(job?.status || "unknown");

  console.log(
    `VALUE_COMPARISON_SYNC_ATTEMPT=${attempt} STATUS=${state}`
  );

  if (state === "failed") {
    throw new Error(
      `comparison_sync_failed:${JSON.stringify(job)}`
    );
  }

  if (state === "succeeded") {
    finalJob = job;
    break;
  }

  if (attempt < maxAttempts) {
    await sleep(pollMs);
  }
}

if (!finalJob) {
  throw new Error(
    "comparison_sync_poll_budget_exhausted"
  );
}

const result =
  finalJob.result || {};

assert.equal(
  result.ok,
  true,
  "comparison sync result must be ok"
);

assert.equal(
  result.dayKey,
  day,
  "comparison sync day binding mismatch"
);

assert.equal(
  result.ref,
  ref,
  "comparison sync ref binding mismatch"
);

assert.equal(
  result.valueComparisonWritten,
  true,
  "comparison sync did not write comparison"
);

assert.match(
  String(result.comparisonSha256 || ""),
  /^[0-9a-f]{64}$/u,
  "comparison sync SHA invalid"
);

const rawUrl =
  `https://raw.githubusercontent.com/${repo}/${ref}/data/value-comparison/${day}.json`;

const rawResponse =
  await fetchWithTimeout(
    rawUrl,
    {},
    45000
  );

if (!rawResponse.ok) {
  throw new Error(
    `source_comparison_fetch_failed:${rawResponse.status}`
  );
}

const sourceBuffer =
  Buffer.from(
    await rawResponse.arrayBuffer()
  );

const sourceSha =
  canonicalBufferSha256(
    sourceBuffer
  );

assert.equal(
  result.comparisonSha256,
  sourceSha,
  "comparison sync result/source SHA mismatch"
);

const source =
  JSON.parse(
    sourceBuffer.toString("utf8")
  );

const served =
  await fetchJson(
    `${engineBase}/value-comparison?date=${encodeURIComponent(day)}&_sync=${encodeURIComponent(ref)}`,
    {},
    45000
  );

assert.equal(source.ok, true);
assert.equal(source.date, day);
assert.equal(served.ok, true);
assert.equal(served.date, day);

for (
  const plan of ["A", "A2", "B", "B2"]
) {
  if (source.plans?.[plan] !== null) {
    assert.ok(
      source.plans?.[plan] &&
      typeof source.plans[plan] === "object",
      `source missing plan ${plan}`
    );
  }

  if (served.plans?.[plan] !== null) {
    assert.ok(
      served.plans?.[plan] &&
      typeof served.plans[plan] === "object",
      `public missing plan ${plan}`
    );
  }
}

const normalizedSource =
  structuredClone(source);

const normalizedServed =
  structuredClone(served);

delete normalizedSource.source;
delete normalizedSource.runtimeMirror;

delete normalizedServed.source;
delete normalizedServed.runtimeMirror;

assert.deepStrictEqual(
  normalizedServed,
  normalizedSource,
  "public comparison differs from immutable source"
);

console.log(
  "VALUE_COMPARISON_SYNC_VERIFIED=true"
);

console.log(
  `VALUE_COMPARISON_SYNC_DAY=${day}`
);

console.log(
  `VALUE_COMPARISON_SYNC_REF=${ref}`
);

console.log(
  `VALUE_COMPARISON_SYNC_SHA256=${sourceSha}`
);
