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
import { sameTeamName } from "../core/fixture-dedup.js";
import {
  hasMatchStateConflict,
  hasPreKickoffNonPlayedDisplayViolation,
  isPreKickoffNonPlayed
} from "../core/non-played-state.js";

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

  // Which manifest this report describes — the gate compares this (and
  // checkedAt) against the committed manifest to catch a stale report.
  report.manifestGeneratedAt = manifest?.generatedAt || null;

  // Expose the actual pick count so the health UI can tell "integrity OK" apart
  // from "0 picks generated" (valueSafe only measures count-integrity, not that
  // picks exist — a SAFE pipeline can still legitimately have 0 picks).
  if (value !== null) {
    report.valueCount = Array.isArray(value?.picks) ? value.picks.length : (value?.count ?? 0);
  }

  // ── CHECK 0: explicit pre-kickoff non-played rows carry no result/display state ──
  for (const fx of fixtureList) {
    if (hasMatchStateConflict(fx)) {
      const conflictId =
        fx.canonicalId ||
        fx.matchId ||
        null;

      report.blocked.push({
        type: "fixture_status_truth_conflict",
        matchId: conflictId,
        status: fx.status ?? null,
        rawStatus: fx.rawStatus ?? null,
        impact: "verified_final_truth_unsafe"
      });
      report.valueSafe = false;
      ciError(
        `[blocked] fixture has conflicting terminal/non-played status evidence: ${conflictId || "unknown"}`
      );
    }

    if (!hasPreKickoffNonPlayedDisplayViolation(fx)) continue;

    const cid =
      fx.canonicalId ||
      buildCanonicalId(
        fx.leagueSlug,
        fx.homeTeam || fx.home,
        fx.awayTeam || fx.away,
        fx.dayKey || fx.kickoffUtc
      );

    report.blocked.push({
      type: "pre_kickoff_nonplayed_fixture_state_violation",
      matchId: cid || fx.matchId || null,
      status: fx.status ?? null,
      rawStatus: fx.rawStatus ?? null,
      scoreHome: fx.scoreHome ?? null,
      scoreAway: fx.scoreAway ?? null,
      minute: fx.minute ?? null,
      penalties: fx.penalties ?? null,
      decidedBy: fx.decidedBy ?? null,
      isDisplayFinal: fx.isDisplayFinal ?? null,
      impact: "result_truth_and_display_unsafe"
    });
    report.valueSafe = false;
    ciError(
      `[blocked] pre-kickoff non-played fixture carries score/minute/final state: ${cid || fx.matchId || "unknown"}`
    );
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

    if (hasMatchStateConflict(detail?.basic)) {
      report.blocked.push({
        type: "detail_status_truth_conflict",
        matchId: cid,
        file: path.relative(snapshotDir, resolvedFile),
        status: detail.basic.status ?? null,
        rawStatus: detail.basic.rawStatus ?? null,
        impact: "verified_final_truth_unsafe"
      });
      report.valueSafe = false;
      ciError(
        `[blocked] detail has conflicting terminal/non-played status evidence: ${cid}`
      );
    }

    if (
      isPreKickoffNonPlayed(detail?.basic) &&
      hasPreKickoffNonPlayedDisplayViolation(detail.basic)
    ) {
      report.blocked.push({
        type: "pre_kickoff_nonplayed_detail_state_violation",
        matchId: cid,
        file: path.relative(snapshotDir, resolvedFile),
        status: detail.basic.status ?? null,
        rawStatus: detail.basic.rawStatus ?? null,
        scoreHome: detail.basic.scoreHome ?? null,
        scoreAway: detail.basic.scoreAway ?? null,
        minute: detail.basic.minute ?? null,
        penalties: detail.basic.penalties ?? null,
        decidedBy: detail.basic.decidedBy ?? null,
        isDisplayFinal: detail.basic.isDisplayFinal ?? null,
        impact: "detail_truth_and_display_unsafe"
      });
      report.valueSafe = false;
      ciError(
        `[blocked] pre-kickoff non-played detail carries score/minute/final state: ${cid}`
      );
    }

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

  // ── CHECK 6: duplicate canonicalId in fixtures.json ───────────────────────
  // Same cid twice means the dedup choke points failed — details/value join
  // ambiguously and the UI double-counts the match. Blocked, never auto-fixed
  // here (the fix belongs in fixture-dedup, not in a report-time guess).
  const cidCounts = new Map();
  for (const fx of fixtureList) {
    const cid = String(fx?.canonicalId || "").trim();
    if (!cid) continue;
    cidCounts.set(cid, (cidCounts.get(cid) || 0) + 1);
  }
  const duplicateCids = [...cidCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([cid, count]) => ({ cid, count }));

  if (duplicateCids.length > 0) {
    report.blocked.push({
      type: "duplicate_canonical_id",
      duplicates: duplicateCids
    });
    ciError(`[blocked] ${duplicateCids.length} duplicate canonicalId(s) in fixtures.json: ${duplicateCids.map(d => d.cid).join(", ")}`);
  }

  // ── CHECK 7: every published fixture must ship a detail ───────────────────
  // The export backfills missing details at publish time (see
  // day-fixture-universe.js + ensureDetailsForFixtures), so a non-empty list
  // here means the backfill genuinely could not build a detail — a real failure
  // a human must see, not a silently-shippable gap. Audit 2026-07-06: manifest
  // reported 1 missing detail while the invariant still said ok:true.
  const missingDetails = Array.isArray(manifest?.detailsMissingForFixtures)
    ? manifest.detailsMissingForFixtures
    : [];

  if (missingDetails.length > 0) {
    report.blocked.push({
      type: "fixtures_missing_details",
      count: missingDetails.length,
      fixtures: missingDetails.slice(0, 25)
    });
    ciError(`[blocked] ${missingDetails.length} fixture(s) published without a detail: ${missingDetails.slice(0, 10).join(", ")}`);
  }

  // ── CHECK 8: one detail file per published fixture (strict bijection) ─────
  // The exporter names each detail after a published fixture's canonicalId and
  // prunes anything else, so on a clean day detailFiles === publishedIds exactly.
  // A mismatch means a stale wrong-day twin (…20260708 beside …20260707) or a
  // dropped cross-source duplicate's detail rode along, or a fixture shipped with
  // no detail. CHECK 7 uses the manifest's own list; this one re-derives from
  // disk so a wrong manifest can't hide the gap. Blocked — a duplicate/orphan
  // detail is exactly what "32 fixtures / 33 details" was.
  const publishedIds = new Set();
  for (const fx of fixtureList) {
    const cid = String(fx?.canonicalId || "").trim();
    const name = cid || String(fx?.matchId || "").trim();
    if (name) publishedIds.add(name);
  }
  const detailBasenames = fs.existsSync(detailsDir)
    ? fs.readdirSync(detailsDir).filter(n => n.endsWith(".json")).map(n => n.slice(0, -".json".length))
    : [];
  const detailsWithoutFixture = detailBasenames.filter(name => !publishedIds.has(name));
  const fixturesWithoutDetail = [...publishedIds].filter(name => !detailBasenames.includes(name));

  if (detailsWithoutFixture.length > 0 || fixturesWithoutDetail.length > 0) {
    report.blocked.push({
      type: "details_fixtures_not_bijective",
      publishedFixtures: publishedIds.size,
      detailFiles: detailBasenames.length,
      detailsWithoutFixture: detailsWithoutFixture.slice(0, 25),
      fixturesWithoutDetail: fixturesWithoutDetail.slice(0, 25)
    });
    ciError(`[blocked] details/fixtures not 1:1 — ${detailBasenames.length} details vs ${publishedIds.size} fixtures (extra details: ${detailsWithoutFixture.slice(0, 5).join(", ")}; missing: ${fixturesWithoutDetail.slice(0, 5).join(", ")})`);
  }

  // ── CHECK 9: cross-source alias duplicates that ID-dedup missed ────────────
  // CHECK 6 only catches an IDENTICAL canonicalId twice. The real 2026-07-07 bug
  // was the SAME match under two provider spellings ("Drita (Kos)" vs "Drita
  // Gjilan") with DIFFERENT cids — invisible to a cid equality check. Re-run the
  // dedup predicate (same league + same kickoff minute + identity-matched teams)
  // over the SURVIVING fixtures: any hit means fixture-dedup failed and the same
  // match is published twice. Blocked, not a warning.
  const kickoffMinute = (ko) => {
    const ts = new Date(ko || 0).getTime();
    return Number.isFinite(ts) && ts > 0 ? Math.floor(ts / 60000) : null;
  };
  const byLeague = new Map();
  for (const fx of fixtureList) {
    const slug = String(fx?.leagueSlug || "unknown");
    if (!byLeague.has(slug)) byLeague.set(slug, []);
    byLeague.get(slug).push(fx);
  }
  const aliasDuplicatePairs = [];
  for (const [slug, rows] of byLeague) {
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i];
        const b = rows[j];
        const ma = kickoffMinute(a?.kickoffUtc);
        const mb = kickoffMinute(b?.kickoffUtc);
        if (ma === null || mb === null || ma !== mb) continue;
        if (!sameTeamName(slug, a?.homeTeam, b?.homeTeam)) continue;
        if (!sameTeamName(slug, a?.awayTeam, b?.awayTeam)) continue;
        aliasDuplicatePairs.push({
          slug,
          a: `${a?.homeTeam} v ${a?.awayTeam} (${a?.canonicalId || a?.matchId})`,
          b: `${b?.homeTeam} v ${b?.awayTeam} (${b?.canonicalId || b?.matchId})`
        });
      }
    }
  }
  if (aliasDuplicatePairs.length > 0) {
    report.blocked.push({
      type: "alias_duplicate_fixtures",
      count: aliasDuplicatePairs.length,
      pairs: aliasDuplicatePairs.slice(0, 25)
    });
    ciError(`[blocked] ${aliasDuplicatePairs.length} cross-source alias duplicate fixture pair(s) survived dedup: ${aliasDuplicatePairs.slice(0, 3).map(p => `${p.a} == ${p.b}`).join(" | ")}`);
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

/**
 * Read-only gate: verifies the COMMITTED report is fresh for the committed
 * manifest and carries no blocked issues, without re-running the checks.
 * Runs post-commit in the workflow (data has landed; a failure turns the run
 * red for a human) — the audit found the report permanently stale because the
 * in-cycle check predates the geo rebuild + final re-export.
 * Exit codes: 0 ok · 1 manifest missing · 2 report missing · 3 stale · 4 blocked.
 */
export function evaluateInvariantGate({ dayKey, report, manifest }) {
  if (!manifest) return { ok: false, code: 1, reason: "manifest_missing", dayKey };
  if (!report) return { ok: false, code: 2, reason: "invariant_report_missing", dayKey };

  const checkedAt = Date.parse(report.checkedAt || "");
  const generatedAt = Date.parse(manifest.generatedAt || "");

  if (!Number.isFinite(checkedAt) || (Number.isFinite(generatedAt) && checkedAt < generatedAt)) {
    return {
      ok: false, code: 3, reason: "invariant_report_stale", dayKey,
      checkedAt: report.checkedAt || null,
      manifestGeneratedAt: manifest.generatedAt || null
    };
  }

  const blockedCount = Array.isArray(report.blocked) ? report.blocked.length : 0;
  if (blockedCount > 0) {
    return { ok: false, code: 4, reason: "blocked_issues", dayKey, blocked: report.blocked };
  }

  if (report.ok !== true) {
    return {
      ok: false,
      code: 5,
      reason: "invariant_report_not_ok",
      dayKey,
      reportOk: report.ok ?? null
    };
  }

  if (report.valueSafe === false) {
    return {
      ok: false,
      code: 6,
      reason: "value_unsafe",
      dayKey,
      valueSafe: false
    };
  }

  return {
    ok: true, code: 0, dayKey,
    checkedAt: report.checkedAt,
    manifestGeneratedAt: manifest.generatedAt || null,
    valueSafe: true,
    warnings: Array.isArray(report.warnings) ? report.warnings.length : 0
  };
}

export function gateSnapshotInvariants(dayKey = athensDayKey()) {
  const snapshotDir = resolveDataPath("deploy-snapshots", dayKey);
  const report = readJsonSafe(path.join(snapshotDir, "invariant-report.json"));
  const manifest = readJsonSafe(path.join(snapshotDir, "manifest.json"));

  return evaluateInvariantGate({ dayKey, report, manifest });
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const arg = process.argv.slice(2).find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) || athensDayKey();

  if (process.argv.includes("--gate")) {
    const r = gateSnapshotInvariants(arg);
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.code);
  }

  runSnapshotInvariantCheck(arg).then(r => {
    console.log(JSON.stringify(r, null, 2));
    if (!r.ok) process.exit(1);
  }).catch(err => { console.error("fatal", err); process.exit(1); });
}
