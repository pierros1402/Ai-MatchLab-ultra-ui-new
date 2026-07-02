/**
 * run-snapshot-invariant-check.js
 *
 * Runs before every deploy commit. Checks the current day's snapshot for
 * internal consistency, auto-fixes what it safely can, and blocks on anything
 * that requires human attention.
 *
 * Returns a structured report written to:
 *   data/deploy-snapshots/{dayKey}/invariant-report.json
 *
 * Report shape:
 * {
 *   ok: bool,           // false = at least one blocked issue
 *   valueSafe: bool,    // false = value pipeline should not run for affected matches
 *   autoFixed: [...],   // issues that were corrected automatically
 *   warnings:  [...],   // non-critical anomalies (deploy continues)
 *   blocked:   [...],   // critical issues that prevent a clean deploy
 *   checkedAt: ISO,
 *   dayKey: string
 * }
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { athensDayKey } from "../core/daykey.js";
import { buildCanonicalId } from "../core/canonical-id.js";

const __filename = fileURLToPath(import.meta.url);

function readJsonSafe(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch { return fallback; }
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

// ── GitHub Actions annotations ────────────────────────────────────────────────
function ciWarning(msg) {
  if (process.env.GITHUB_ACTIONS) console.log(`::warning::${msg}`);
  else console.warn("[invariant:warning]", msg);
}
function ciError(msg) {
  if (process.env.GITHUB_ACTIONS) console.log(`::error::${msg}`);
  else console.error("[invariant:error]", msg);
}
function ciNotice(msg) {
  if (process.env.GITHUB_ACTIONS) console.log(`::notice::${msg}`);
  else console.log("[invariant:notice]", msg);
}

// ── Patch helpers (safe auto-fixes) ──────────────────────────────────────────
function patchDetailBasicStatus(detailFile, fixture) {
  const detail = readJsonSafe(detailFile);
  if (!detail?.basic) return false;

  detail.basic.status    = fixture.status;
  detail.basic.rawStatus = fixture.rawStatus;
  detail.basic.minute    = fixture.minute ?? null;
  detail.basic.scoreHome = fixture.scoreHome ?? null;
  detail.basic.scoreAway = fixture.scoreAway ?? null;
  detail.basic.lastStatusPatchedAt = new Date().toISOString();

  try {
    fs.writeFileSync(detailFile, JSON.stringify(detail, null, 2), "utf8");
    return true;
  } catch { return false; }
}

// ── Main check ────────────────────────────────────────────────────────────────
export async function runSnapshotInvariantCheck(dayKey = athensDayKey()) {
  const snapshotDir  = resolveDataPath("deploy-snapshots", dayKey);
  const detailsDir   = path.join(snapshotDir, "details");
  const fixturesFile = path.join(snapshotDir, "fixtures.json");
  const valueFile    = path.join(snapshotDir, "value.json");
  const manifestFile = path.join(snapshotDir, "manifest.json");

  const report = {
    ok: true,
    valueSafe: true,
    valueCount: null,   // # of value picks in value.json (null = no value.json)
    autoFixed: [],
    warnings:  [],
    blocked:   [],
    checkedAt: new Date().toISOString(),
    dayKey
  };

  const fixtures  = readJsonSafe(fixturesFile);
  const value     = readJsonSafe(valueFile);
  const manifest  = readJsonSafe(manifestFile);
  const fixtureList = Array.isArray(fixtures?.fixtures) ? fixtures.fixtures : [];

  // Expose the actual pick count so the health UI can tell "integrity OK" apart
  // from "0 picks generated" (valueSafe only measures count-integrity, not that
  // picks exist — a SAFE pipeline can still legitimately have 0 picks).
  if (value !== null) {
    report.valueCount = Array.isArray(value?.picks) ? value.picks.length : (value?.count ?? 0);
  }

  // ── CHECK 1: status agreement between fixtures and details ───────────────
  for (const fx of fixtureList) {
    const cid = fx.canonicalId || buildCanonicalId(fx.leagueSlug, fx.homeTeam || fx.home, fx.awayTeam || fx.away, fx.dayKey || fx.kickoffUtc);
    if (!cid) continue;

    const detailFile = path.join(detailsDir, `${cid}.json`);
    // Also try legacy ESPN numeric ID as fallback filename
    const legacyFile = fx.matchId && fx.matchId !== cid
      ? path.join(detailsDir, `${fx.matchId}.json`)
      : null;

    const resolvedFile = fs.existsSync(detailFile) ? detailFile
      : (legacyFile && fs.existsSync(legacyFile) ? legacyFile : null);

    if (!resolvedFile) continue;

    const detail = readJsonSafe(resolvedFile);
    const detailStatus = detail?.basic?.status;
    const fixtureStatus = fx.status;

    if (detailStatus && fixtureStatus && detailStatus !== fixtureStatus) {
      const label = `${fx.homeTeam || fx.home} v ${fx.awayTeam || fx.away} (${cid})`;
      const wasPatched = patchDetailBasicStatus(resolvedFile, fx);

      if (wasPatched) {
        report.autoFixed.push({
          type: "status_mismatch",
          match: label,
          before: detailStatus,
          after: fixtureStatus,
          file: path.relative(snapshotDir, resolvedFile)
        });
        ciNotice(`[auto-fixed] status mismatch patched: ${label} ${detailStatus}→${fixtureStatus}`);
      } else {
        report.blocked.push({
          type: "status_mismatch_unpatchable",
          match: label,
          fixtureStatus,
          detailStatus
        });
        ciError(`[blocked] status mismatch unpatchable: ${label}`);
      }
    }
  }

  // ── CHECK 2: manifest.valuePicks must equal value.json.count ─────────────
  const manifestValuePicks = manifest?.counts?.valuePicks ?? manifest?.valuePicks ?? null;
  const valueJsonCount = value?.count ?? null;

  if (manifestValuePicks !== null && valueJsonCount !== null) {
    if (manifestValuePicks !== valueJsonCount) {
      // value layer inconsistency — cannot auto-fix, value pipeline is unsafe
      report.blocked.push({
        type: "manifest_value_count_mismatch",
        manifestValuePicks,
        valueJsonCount,
        impact: "value_pipeline_unsafe"
      });
      report.valueSafe = false;
      ciError(`[blocked] manifest.valuePicks=${manifestValuePicks} ≠ value.json.count=${valueJsonCount} — value pipeline marked unsafe`);
    }
  }

  // ── CHECK 3: value.json picks array must match count ─────────────────────
  if (value !== null) {
    const declaredCount = value?.count ?? 0;
    const actualCount   = Array.isArray(value?.picks) ? value.picks.length : 0;
    if (declaredCount !== actualCount) {
      report.blocked.push({
        type: "value_count_array_mismatch",
        declaredCount,
        actualCount,
        impact: "value_pipeline_unsafe"
      });
      report.valueSafe = false;
      ciError(`[blocked] value.json count=${declaredCount} but picks.length=${actualCount}`);
    }
  }

  // ── CHECK 4: coverage floor silent drop ──────────────────────────────────
  const staticFloor  = manifest?.staticMinTargetFixtures ?? null;
  const actualTarget = manifest?.minTargetFixtures ?? null;
  const actualCount  = fixtureList.length;

  if (staticFloor !== null && actualTarget !== null && actualTarget < staticFloor) {
    const drop = staticFloor - actualTarget;
    report.warnings.push({
      type: "coverage_floor_drop",
      staticFloor,
      effectiveFloor: actualTarget,
      actualFixtures: actualCount,
      drop,
      reason: "canonical_fixture_count_below_static_floor"
    });
    ciWarning(`[warning] coverage floor dropped ${staticFloor}→${actualTarget} (actual fixtures: ${actualCount})`);
  }

  // ── CHECK 5: fixture minute double-apostrophe ─────────────────────────────
  for (const fx of fixtureList) {
    const min = String(fx.minute || "");
    if (min.endsWith("''") || (min.includes("'") && min.endsWith("'"))) {
      const raw = min.replace(/'+$/, "");
      if (raw.endsWith("'")) {
        report.warnings.push({
          type: "minute_double_apostrophe",
          matchId: fx.canonicalId || fx.matchId,
          minute: min
        });
      }
    }
  }

  // ── Finalize ─────────────────────────────────────────────────────────────
  if (report.blocked.length > 0) {
    report.ok = false;
    ciError(`[invariant] ${report.blocked.length} blocked issue(s) — deploy should not proceed`);
  }

  if (report.autoFixed.length > 0) {
    ciNotice(`[invariant] ${report.autoFixed.length} issue(s) auto-fixed`);
  }

  if (report.warnings.length > 0) {
    ciWarning(`[invariant] ${report.warnings.length} warning(s) — deploy continues`);
  }

  // Write report to snapshot dir
  writeJson(path.join(snapshotDir, "invariant-report.json"), report);

  return report;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const arg = process.argv.slice(2).find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) || athensDayKey();
  runSnapshotInvariantCheck(arg).then(r => {
    console.log(JSON.stringify(r, null, 2));
    if (!r.ok) process.exit(1);
  }).catch(err => { console.error("fatal", err); process.exit(1); });
}
