import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { athensDayKey, shiftDay } from "../core/daykey.js";
import { fixturesForSnapshotDay, canonicalFixturesForDay } from "../core/day-fixture-universe.js";
import { resolveDataPath } from "../storage/data-root.js";
import { exportDeploySnapshotDay } from "./export-deploy-snapshot-day.js";
import { validateStagedRelease } from "./sync-deploy-snapshot-from-github.js";
import { stageHistoricalStatusRelease } from "./stage-historical-status-release.js";
import { resolveFederationNonPlayedDecision } from "../source-discovery/federation-nonplayed-decisions.js";

const idOf = row => String(row?.canonicalId || row?.matchId || "");
const final = row => [row?.status, row?.statusType, row?.rawStatus].some(x => /^(FT|FINAL|FULL_TIME|STATUS_FINAL|STATUS_FULL_TIME|STATUS_FINAL_AET|STATUS_FINAL_PEN|AET|PEN)$/u.test(String(x || "").toUpperCase()));
const score = row => [row?.scoreHome, row?.scoreAway];
const sameScore = (a, b) => JSON.stringify(score(a)) === JSON.stringify(score(b));
const validScore = row => score(row).every(x => Number.isInteger(x) && x >= 0);
const rowsOf = payload => Array.isArray(payload) ? payload : payload?.fixtures || [];
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

// Discovery only: matching a later fixture never authorizes a
// retrospective status, membership or settlement mutation.
export function discoverMissingReschedules({ day, published, canonical,
  lookupDay = canonicalFixturesForDay, windowDays = 21 }) {
  const currentIds = new Set(canonical.map(idOf));
  const missing = published.filter(row => !currentIds.has(idOf(row)));
  if (!missing.length) return [];
  if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 31)
    throw Error('reschedule_window_invalid');
  const candidates = [];
  for (let offset = 1; offset <= windowDays; offset++) {
    const candidateDay = shiftDay(day, offset);
    const rows = lookupDay(candidateDay);
    if (!Array.isArray(rows)) throw Error('reschedule_lookup_invalid');
    for (const row of rows) candidates.push({ ...row, candidateDay });
  }
  return missing.flatMap(previous => {
    const provider = String(previous.sourceId || '').trim();
    if (!provider || !previous.leagueSlug || !previous.homeTeam || !previous.awayTeam)
      return [];
    const matches = candidates.filter(row =>
      String(row.sourceId || '').trim() === provider &&
      row.leagueSlug === previous.leagueSlug &&
      row.homeTeam === previous.homeTeam &&
      row.awayTeam === previous.awayTeam &&
      Boolean(idOf(row)) && idOf(row) !== idOf(previous) &&
      row.dayKey === row.candidateDay &&
      Number.isFinite(Date.parse(row.kickoffUtc || '')) &&
      athensDayKey(new Date(row.kickoffUtc)) === row.candidateDay &&
      !final(row) &&
      row.scoreHome == null && row.scoreAway == null &&
      (row.status === 'SPECIAL' ||
       row.status === 'STATUS_POSTPONED' ||
       row.status === 'STATUS_SCHEDULED' ||
       row.status === 'PRE'));
    const unique = new Set(matches.map(row => row.candidateDay + ':' + idOf(row)));
    if (unique.size !== matches.length)
      throw Error('reschedule_duplicate_candidate:' + idOf(previous));
    return matches.map(row => ({
      originalId: idOf(previous),
      candidateId: idOf(row),
      providerId: provider,
      originalDay: day,
      candidateDay: row.candidateDay,
      candidateStatus: row.status
    }));
  });
}


// No provider calls, model execution, fixture admission, score revision or
// retrospective observation creation. Only already verified canonical finals.
export function planPublishedFinalRefresh({ day, published = [], canonical = [], results = new Map(), rescheduled = [], missingReschedules = [] }) {
  const current = new Map(canonical.map(row => [idOf(row), row]));
  if (current.size !== canonical.length || new Set(published.map(idOf)).size !== published.length) throw Error("final_refresh_duplicate_identity");
  const upgrades = [];
  const nonplayed = [];
  const retainedReschedules = [];
  const newDay = new Map(rescheduled.map(row => [String(row?.sourceId || ""), row]));
  for (const previous of published) {
    const id = idOf(previous), next = current.get(id);
    if (!id) throw Error(`final_refresh_missing_canonical:${id}`);
    if (!next) {
      const matches = missingReschedules.filter(x => x.originalId === id);
      if (final(previous) || matches.length === 0)
        throw Error(`final_refresh_missing_canonical:${id}`);
      retainedReschedules.push(...matches);
      continue;
    }
    if (final(previous) && (!final(next) || !sameScore(previous, next))) throw Error(`final_refresh_terminal_revision_forbidden:${id}`);
    if (final(previous)) continue;
    if (!final(next)) {
      const decision = resolveFederationNonPlayedDecision({
        day, published: previous, canonical: next,
        rescheduled: newDay.get(String(previous.sourceId || ""))
      });
      if (decision) {
        nonplayed.push(id);
        upgrades.push(id);
      }
      continue;
    }
    const result = results.get(id);
    if (!validScore(next) || result?.verifiedFinalTruth !== true || result.date !== day || result.matchId !== id ||
        !sameScore(result, next) || result.homeTeam !== next.homeTeam || result.awayTeam !== next.awayTeam ||
        previous.homeTeam !== next.homeTeam || previous.awayTeam !== next.awayTeam) {
      throw Error(`final_refresh_verified_binding_required:${id}`);
    }
    upgrades.push(id);
  }
  return { upgrades, nonplayed, retainedReschedules, fixtureIds: published.map(idOf) };
}

export function assertPublishedFinalRefreshPublicationSafety(plan, { apply = false } = {}) {
  if (!plan || !Array.isArray(plan.retainedReschedules) || !Array.isArray(plan.upgrades))
    throw Error('final_refresh_publication_plan_invalid');
  if (apply && plan.retainedReschedules.length > 0 && plan.upgrades.length > 0)
    throw Error('final_refresh_mixed_reschedule_publication_blocked');
  return true;
}

export async function refreshPublishedFinalStatusDay(day, { apply = false, today = athensDayKey(), historicalStageObservation = false } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day >= today) throw Error("final_refresh_closed_day_required");
  const root = resolveDataPath("deploy-snapshots", day);
  const manifestFile = path.join(root, "manifest.json");
  if (!fs.existsSync(manifestFile)) return { day, skipped: true, reason: "no_existing_snapshot" };
  const latest = JSON.parse(fs.readFileSync(resolveDataPath("deploy-snapshots", "latest.json"), "utf8"));
  // Daily alone owns current/latest publication. Never change its pointer here.
  if (!latest?.date || day >= latest.date) return { day, skipped: true, reason: "latest_release_owned_by_daily" };
  const beforeManifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  await validateStagedRelease(root, beforeManifest);
  const published = rowsOf(JSON.parse(fs.readFileSync(path.join(root, "fixtures.json"), "utf8")));
  const canonical = fixturesForSnapshotDay(day).fixtures;
  const results = new Map();
  for (const row of published) {
    const id = idOf(row);
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw Error("final_refresh_unsafe_fixture_id");
    const file = resolveDataPath("final-results", day, `${id}.json`);
    if (fs.existsSync(file)) results.set(id, JSON.parse(fs.readFileSync(file, "utf8")));
  }
  const rescheduled = day === "2026-10-30" ? fixturesForSnapshotDay("2026-11-01").fixtures : [];
  const missingReschedules = discoverMissingReschedules({ day, published, canonical });
  const plan = planPublishedFinalRefresh({ day, published, canonical, results, rescheduled, missingReschedules });
  if (historicalStageObservation === true) {
    if (apply !== false) {
      throw Error("final_refresh_observation_apply_forbidden");
    }

    // Explicit observation never invokes the publication exporter.
    // The stage builder validates and removes its temporary stage.
    const observation = await stageHistoricalStatusRelease({ day });

    if (observation.ok !== true ||
        observation.publicationAuthorized !== false ||
        observation.originalUnchanged !== true ||
        observation.latestUnchanged !== true) {
      throw Error("final_refresh_observation_contract_invalid");
    }

    return {
      ...observation,
      day,
      changed: false,
      available: true,
      observationOnly: true,
      publicationAuthorized: false
    };
  }

  assertPublishedFinalRefreshPublicationSafety(plan, { apply });
  if (!apply || !plan.upgrades.length) return { day, changed: false, plannedUpgrades: plan.upgrades, retainedReschedules: plan.retainedReschedules, available: true, hash: beforeManifest.hash };
  const protectedFiles = ["value.json", "value-audit.json", "plan-c-shadow.json", "plan-c-shadow-audit.json"]
    .map(name => path.join(root, name)).filter(file => fs.existsSync(file));
  const protectedHashes = new Map(protectedFiles.map(file => [file, hash(file)]));
  const latestFile = resolveDataPath("deploy-snapshots", "latest.json"), latestHash = hash(latestFile);
  await exportDeploySnapshotDay(day, {
    updateLatest: false, preserveDetails: true, preserveValue: true, preserveShadow: true,
    publicationMode: "intraday_status_only", fixtureIdAllowlist: plan.fixtureIds,
    buildMissingDetails: false, failOnMissingDetails: true
  });
  for (const [file, before] of protectedHashes) if (hash(file) !== before) throw Error(`final_refresh_frozen_bytes_changed:${path.basename(file)}`);
  if (hash(latestFile) !== latestHash) throw Error("final_refresh_latest_changed");
  const after = rowsOf(JSON.parse(fs.readFileSync(path.join(root, "fixtures.json"), "utf8")));
  if (JSON.stringify(after.map(idOf).sort()) !== JSON.stringify([...plan.fixtureIds].sort())) throw Error("final_refresh_membership_changed");
  const afterMap = new Map(after.map(row => [idOf(row), row]));
  for (const id of plan.upgrades) {
    const afterRow = afterMap.get(id);
    if (plan.nonplayed.includes(id)) {
      const beforeRow = published.find(row => idOf(row) === id);
      const canonicalRow = canonical.find(row => idOf(row) === id);
      const decision = resolveFederationNonPlayedDecision({
        day, published: beforeRow, canonical: canonicalRow,
        rescheduled: rescheduled.find(row => row.sourceId === beforeRow.sourceId)
      });
      if (!decision || afterRow?.status !== "STATUS_POSTPONED" || !sameScore(afterRow, beforeRow)) throw Error(`final_refresh_nonplayed_output_mismatch:${id}`);
    } else if (!final(afterRow) || !sameScore(afterRow, results.get(id))) {
      throw Error(`final_refresh_output_mismatch:${id}`);
    }
  }
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  await validateStagedRelease(root, manifest);
  return { day, changed: true, upgraded: plan.upgrades, retainedReschedules: plan.retainedReschedules, available: true, hash: manifest.hash };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const count = Number(process.argv.find(x => x.startsWith("--days-back="))?.split("=")[1] || 7);
  if (!Number.isInteger(count) || count < 1 || count > 7) throw Error("final_refresh_window_invalid");
  const reports = [];
  for (let back = 1; back <= count; back++) {
    const day = shiftDay(athensDayKey(), -back);
    try { reports.push(await refreshPublishedFinalStatusDay(day, { apply: process.argv.includes("--apply") })); }
    catch (error) { reports.push({ day, error: error.message }); }
  }
  console.log(JSON.stringify({ reports }, null, 2));
  if (process.env.RUNNER_TEMP) fs.writeFileSync(path.join(process.env.RUNNER_TEMP, "final-status-refresh.json"), JSON.stringify({ reports }, null, 2));
  if (process.env.GITHUB_ENV) {
    fs.appendFileSync(process.env.GITHUB_ENV, `FINAL_STATUS_CHANGED_DAYS=${reports.filter(r => r.changed).map(r => r.day).join(",")}\nFINAL_STATUS_AVAILABLE_DAYS=${reports.filter(r => r.available).map(r => r.day).join(",")}\n`);
  }
  // Per-day failures are retained; the workflow still converges other valid
  // days, then surfaces all failed days in its final verification step.
}
