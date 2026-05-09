import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

import { buildDetailsDay } from "./build-details-day.js";
import { exportDeploySnapshotDay } from "./export-deploy-snapshot-day.js";
import { syncCanonicalFixturesToJsonDbDay } from "./sync-canonical-fixtures-to-json-db-day.js";
import { buildValueDay } from "../core/build-value-day.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function isValidDayKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizeText(value));
}

function runNodeScript(scriptPath, args = []) {
  const result = spawnSync(
    process.execPath,
    [scriptPath, ...args.map(String)],
    {
      stdio: "inherit",
      shell: false
    }
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${scriptPath} failed with exit code ${result.status}`);
  }
}

function parseArgs(argv = []) {
  const out = {
    dayKey: normalizeText(argv[0]),
    chunks: 6,
    chunkSize: 12,
    daysBack: 1,
    daysForward: 14,
    rebuildDetails: false
  };

  for (const arg of argv.slice(1)) {
    const value = normalizeText(arg);

    if (value.startsWith("--chunks=")) {
      out.chunks = Number(value.slice("--chunks=".length));
    } else if (value.startsWith("--chunk-size=")) {
      out.chunkSize = Number(value.slice("--chunk-size=".length));
    } else if (value.startsWith("--days-back=")) {
      out.daysBack = Number(value.slice("--days-back=".length));
    } else if (value.startsWith("--days-forward=")) {
      out.daysForward = Number(value.slice("--days-forward=".length));
    } else if (value === "--no-rebuild-details") {
      out.rebuildDetails = false;
    }
  }

  out.chunks = Number.isFinite(out.chunks) && out.chunks > 0 ? Math.floor(out.chunks) : 6;
  out.chunkSize = Number.isFinite(out.chunkSize) && out.chunkSize > 0 ? Math.floor(out.chunkSize) : 12;
  out.daysBack = Number.isFinite(out.daysBack) && out.daysBack >= 0 ? Math.floor(out.daysBack) : 1;
  out.daysForward = Number.isFinite(out.daysForward) && out.daysForward >= 0 ? Math.floor(out.daysForward) : 14;

  return out;
}

export async function runIntradaySnapshotRefresh(dayKey, options = {}) {
  const safeDayKey = normalizeText(dayKey);

  if (!isValidDayKey(safeDayKey)) {
    throw new Error(`invalid dayKey: ${dayKey}`);
  }

  const chunks = Number.isFinite(Number(options.chunks)) ? Number(options.chunks) : 6;
  const chunkSize = Number.isFinite(Number(options.chunkSize)) ? Number(options.chunkSize) : 12;
  const daysBack = Number.isFinite(Number(options.daysBack)) ? Number(options.daysBack) : 1;
  const daysForward = Number.isFinite(Number(options.daysForward)) ? Number(options.daysForward) : 14;
  const rebuildDetails = options.rebuildDetails !== false;

  const startedAt = new Date().toISOString();

  console.log("[intraday-snapshot-refresh] start", {
    dayKey: safeDayKey,
    chunks,
    chunkSize,
    daysBack,
    daysForward,
    rebuildDetails
  });

  const thisFile = fileURLToPath(import.meta.url);
  const jobsDir = path.dirname(thisFile);
  const acquisitionScript = path.join(jobsDir, "run-fixture-acquisition-chunk.js");

  for (let i = 1; i <= chunks; i += 1) {
    console.log("[intraday-snapshot-refresh] acquisition-chunk:start", {
      dayKey: safeDayKey,
      chunk: i,
      chunks
    });

    runNodeScript(acquisitionScript, [
      safeDayKey,
      "--chunk-size",
      chunkSize,
      "--days-back",
      daysBack,
      "--days-forward",
      daysForward
    ]);
  }

  console.log("[intraday-snapshot-refresh] sync-canonical-fixtures:start", { dayKey: safeDayKey });
  const sync = syncCanonicalFixturesToJsonDbDay(safeDayKey, { write: true });
  console.log("[intraday-snapshot-refresh] sync-canonical-fixtures:done", {
    dayKey: safeDayKey,
    rawRows: sync.rawRows,
    acceptedRows: sync.acceptedRows,
    skippedRows: sync.skippedRows,
    written: sync.written
  });

  console.log("[intraday-snapshot-refresh] value:start", { dayKey: safeDayKey });
  const value = await buildValueDay(safeDayKey);
  console.log("[intraday-snapshot-refresh] value:done", {
    dayKey: safeDayKey,
    ok: value?.ok,
    count: value?.count,
    picks: Array.isArray(value?.picks) ? value.picks.length : null
  });

  console.log("[intraday-snapshot-refresh] details:start", {
    dayKey: safeDayKey,
    rebuild: rebuildDetails
  });
  const details = await buildDetailsDay(safeDayKey, { rebuild: rebuildDetails });
  console.log("[intraday-snapshot-refresh] details:done", {
    dayKey: safeDayKey,
    ok: details?.ok,
    built: details?.built,
    skipped: details?.skipped,
    fixtureSource: details?.fixtureSource
  });

  console.log("[intraday-snapshot-refresh] export-snapshot:start", { dayKey: safeDayKey });
  const snapshot = exportDeploySnapshotDay(safeDayKey);
  console.log("[intraday-snapshot-refresh] export-snapshot:done", {
    dayKey: safeDayKey,
    hash: snapshot?.hash,
    manifest: snapshot?.manifest,
    fixtures: snapshot?.fixtures,
    value: snapshot?.value,
    detailsDir: snapshot?.detailsDir
  });

  return {
    ok: true,
    dayKey: safeDayKey,
    startedAt,
    finishedAt: new Date().toISOString(),
    sync,
    value: {
      ok: value?.ok,
      count: value?.count,
      picks: Array.isArray(value?.picks) ? value.picks.length : null
    },
    details: {
      ok: details?.ok,
      built: details?.built,
      skipped: details?.skipped,
      fixtureSource: details?.fixtureSource
    },
    snapshot
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  const options = parseArgs(process.argv.slice(2));

  runIntradaySnapshotRefresh(options.dayKey, options)
    .then(result => {
      console.log("[intraday-snapshot-refresh] cli:done", JSON.stringify({
        ok: result.ok,
        dayKey: result.dayKey,
        snapshotHash: result.snapshot?.hash,
        snapshotManifest: result.snapshot?.manifest
      }, null, 2));
    })
    .catch(err => {
      console.error("[intraday-snapshot-refresh] cli:fatal", err);
      process.exit(1);
    });
}
