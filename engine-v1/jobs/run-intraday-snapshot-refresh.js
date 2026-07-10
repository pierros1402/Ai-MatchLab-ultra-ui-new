import fs from "fs";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

import { exportDeploySnapshotDay } from "./export-deploy-snapshot-day.js";
import { syncCanonicalFixturesToJsonDbDay } from "./sync-canonical-fixtures-to-json-db-day.js";
import { rebuildReconciledFixturesDay } from "./rebuild-reconciled-fixtures-day.js";
import { deriveValueFromOdds } from "./derive-value-from-odds.js";
import { runSnapshotInvariantCheck } from "./run-snapshot-invariant-check.js";
import { verifyArtifactFreshnessDay } from "./verify-artifact-freshness-day.js";
import { buildDayReport } from "./build-day-report.js";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";

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

  out.chunks = Number.isFinite(out.chunks) && out.chunks >= 0 ? Math.floor(out.chunks) : 6;
  out.chunkSize = Number.isFinite(out.chunkSize) && out.chunkSize > 0 ? Math.floor(out.chunkSize) : 12;
  out.daysBack = Number.isFinite(out.daysBack) && out.daysBack >= 0 ? Math.floor(out.daysBack) : 1;
  out.daysForward = Number.isFinite(out.daysForward) && out.daysForward >= 0 ? Math.floor(out.daysForward) : 14;

  return out;
}

// Patch only the mutable status fields in an existing details file.
// This avoids a full rebuild while keeping details.basic in sync with
// the canonical fixture status after each live refresh cycle.
function patchDetailsBasic(dayKey, changedFixtures = []) {
  let patched = 0;
  let skipped = 0;

  for (const row of changedFixtures) {
    const id = row?.canonicalId || row?.matchId;
    if (!id || !dayKey) { skipped++; continue; }

    const file = resolveDataPath("details", dayKey, `${id}.json`);
    if (!fs.existsSync(file)) { skipped++; continue; }

    let detail;
    try {
      detail = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      skipped++;
      continue;
    }

    if (!detail?.basic) { skipped++; continue; }

    const before = JSON.stringify({
      status: detail.basic.status,
      rawStatus: detail.basic.rawStatus,
      minute: detail.basic.minute,
      scoreHome: detail.basic.scoreHome,
      scoreAway: detail.basic.scoreAway
    });

    // Only overwrite fields that have a meaningful incoming value
    if (row.status)    detail.basic.status    = row.status;
    if (row.rawStatus) detail.basic.rawStatus = row.rawStatus;
    detail.basic.minute    = row.minute    ?? detail.basic.minute ?? null;
    detail.basic.scoreHome = row.scoreHome ?? detail.basic.scoreHome ?? null;
    detail.basic.scoreAway = row.scoreAway ?? detail.basic.scoreAway ?? null;

    const after = JSON.stringify({
      status: detail.basic.status,
      rawStatus: detail.basic.rawStatus,
      minute: detail.basic.minute,
      scoreHome: detail.basic.scoreHome,
      scoreAway: detail.basic.scoreAway
    });

    if (before === after) { skipped++; continue; }

    // Record the patch timestamp so we can audit drift later
    detail.basic.lastStatusPatchedAt = new Date().toISOString();

    try {
      fs.writeFileSync(file, JSON.stringify(detail, null, 2), "utf8");
      patched++;
    } catch {
      skipped++;
    }
  }

  return { patched, skipped, total: changedFixtures.length };
}

export async function runIntradaySnapshotRefresh(dayKey, options = {}) {
  const safeDayKey = normalizeText(dayKey);

  if (!isValidDayKey(safeDayKey)) {
    throw new Error(`invalid dayKey: ${dayKey}`);
  }

  const chunks = Number.isFinite(Number(options.chunks)) && Number(options.chunks) >= 0
    ? Math.floor(Number(options.chunks))
    : 6;
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

  if (chunks > 0) {
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
  } else {
    console.log("[intraday-snapshot-refresh] acquisition-chunk:skipped", {
      dayKey: safeDayKey,
      reason: "chunks_zero_live_status_only"
    });
  }

  console.log("[intraday-snapshot-refresh] live-status-refresh:start", { dayKey: safeDayKey });
  const { runLiveStatusRefreshDay } = await import("./run-live-status-refresh-day.js");
  // appendNewFixtures: the status fetch already carries the league's full
  // day slate — same-day rows canonical lacks (late-added fixtures) join here
  // instead of waiting for the nightly full pass. Intraday-only; the finalize
  // path keeps its status-only semantics.
  const liveStats = await runLiveStatusRefreshDay(safeDayKey, { appendNewFixtures: true });
  console.log("[intraday-snapshot-refresh] live-status-refresh:done", {
    dayKey: safeDayKey,
    changedRows: liveStats.changedRows,
    appendedRows: liveStats.appendedRows ?? 0,
    changedFixtures: liveStats.changedFixtures?.length ?? 0
  });

  // Patch details.basic for every match that changed status this cycle.
  // This is the targeted fix for the SECOND_HALF vs FT inconsistency — we
  // update only the 5 mutable status fields without a full details rebuild.
  const patchStats = patchDetailsBasic(safeDayKey, liveStats.changedFixtures ?? []);
  console.log("[intraday-snapshot-refresh] patch-details-basic:done", {
    dayKey: safeDayKey,
    ...patchStats
  });

  console.log("[intraday-snapshot-refresh] sync-canonical-fixtures:start", { dayKey: safeDayKey });
  const sync = syncCanonicalFixturesToJsonDbDay(safeDayKey, { write: true });
  console.log("[intraday-snapshot-refresh] sync-canonical-fixtures:done", {
    dayKey: safeDayKey,
    rawRows: sync.rawRows,
    acceptedRows: sync.acceptedRows,
    skippedRows: sync.skippedRows,
    written: sync.written
  });

  console.log("[intraday-snapshot-refresh] rebuild-reconciled-fixtures:start", {
    dayKey: safeDayKey
  });

  const reconciliation = await rebuildReconciledFixturesDay(safeDayKey, {
    write: true,
    env: process.env
  });

  console.log("[intraday-snapshot-refresh] rebuild-reconciled-fixtures:done", {
    dayKey: safeDayKey,
    canonicalRows: reconciliation.canonicalRows,
    reconciledRows: reconciliation.reconciledRows,
    inserted: reconciliation.inserted,
    updated: reconciliation.updated,
    unchanged: reconciliation.unchanged,
    skipped: reconciliation.skipped,
    rowsWithOperationalState: reconciliation.rowsWithOperationalState,
    rowsWithDisplayFlags: reconciliation.rowsWithDisplayFlags,
    rowsWithHealth: reconciliation.rowsWithHealth,
    rowsWithSources: reconciliation.rowsWithSources,
    rowsWithReconcileMeta: reconciliation.rowsWithReconcileMeta,
    completeCoverage: reconciliation.completeCoverage
  });

  const value = {
    ok: true,
    skipped: true,
    reason: "intraday_status_only_uses_existing_value_file"
  };
  console.log("[intraday-snapshot-refresh] value:skipped", {
    dayKey: safeDayKey,
    reason: value.reason
  });

  const details = {
    ok: true,
    skipped: true,
    reason: "intraday_status_only_preserves_existing_snapshot_details"
  };
  console.log("[intraday-snapshot-refresh] details:skipped", {
    dayKey: safeDayKey,
    reason: details.reason
  });

  // Value picks: NOT touched intraday. Value is pure-stats and built once per day
  // by buildValueDay in the daily cycle (odds↔value firewall — odds never enter
  // value, not even as a transport artifact). The export below uses
  // preserveValue:true, so the frozen daily value.json is carried through
  // unchanged. The old intraday deriveValueFromOdds call was REMOVED.

  console.log("[intraday-snapshot-refresh] export-snapshot:start", { dayKey: safeDayKey });
  const snapshot = await exportDeploySnapshotDay(safeDayKey, { preserveDetails: true, preserveValue: true });
  console.log("[intraday-snapshot-refresh] export-snapshot:done", {
    dayKey: safeDayKey,
    hash: snapshot?.hash,
    manifest: snapshot?.manifest,
    fixtures: snapshot?.fixtures,
    value: snapshot?.value,
    detailsDir: snapshot?.detailsDir
  });

  // Invariant check after snapshot
  try {
    const invariant = await runSnapshotInvariantCheck(safeDayKey);
    console.log("[intraday-snapshot-refresh] invariant-check:done", {
      blocked: invariant.blocked?.length ?? 0,
      autoFixed: invariant.autoFixed?.length ?? 0,
      valueSafe: invariant.valueSafe
    });
  } catch (e) {
    console.error("[intraday-snapshot-refresh] invariant-check:error", e?.message);
  }

  // Freshness + build reports MUST describe THIS final manifest. The intraday
  // re-export moved manifest.generatedAt forward; without re-running these two
  // the committed freshness-report.json / build-reports/<day>.json keep pointing
  // at the earlier daily-cycle manifest (audit 2026-07-07: manifest 18:15Z but
  // both reports 15:05Z). Re-run and stage them here — after the export AND the
  // invariant above — so every re-export is self-consistent. Report-only; a
  // failure here must never abort the refresh.
  try {
    const freshness = verifyArtifactFreshnessDay(safeDayKey);
    const snapshotDir = resolveDataPath("deploy-snapshots", safeDayKey);
    if (fs.existsSync(snapshotDir)) {
      fs.writeFileSync(
        path.join(snapshotDir, "freshness-report.json"),
        JSON.stringify(freshness, null, 2) + "\n"
      );
    }

    const dayReport = buildDayReport(safeDayKey);
    const buildReportsDir = resolveDataPath("build-reports");
    ensureDir(buildReportsDir);
    fs.writeFileSync(
      path.join(buildReportsDir, `${safeDayKey}.json`),
      JSON.stringify(dayReport, null, 2) + "\n"
    );

    console.log("[intraday-snapshot-refresh] reports-refresh:done", {
      dayKey: safeDayKey,
      freshnessOk: freshness.ok,
      manifestGeneratedAt: freshness.manifestGeneratedAt,
      clean: dayReport.clean,
      cleanStrict: dayReport.cleanStrict
    });
  } catch (e) {
    console.error("[intraday-snapshot-refresh] reports-refresh:error", e?.message);
  }

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
