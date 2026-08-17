import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDataPath } from "../storage/data-root.js";
import { fixturesForSnapshotDay } from "../core/day-fixture-universe.js";
import { currentSeason } from "../core/season.js";
import {
  validateHistoryIndexFoundationSync,
  validateH2HFoundationSync,
} from "../core/derived-history-foundation.js";

function clean(v) { return String(v ?? "").trim(); }
function normalizedUtc(value) {
  const ts = Date.parse(value || "");
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
}
function sameInstant(a, b) {
  const x = normalizedUtc(a);
  const y = normalizedUtc(b);
  return Boolean(x && y && x === y);
}
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } }
function canonicalId(row) { return clean(row?.canonicalId || row?.matchId || row?.id); }
function h2hBefore(row, kickoff) {
  const raw = clean(row?.date || row?.kickoffUtc || row?.kickoff);
  const cutoff = Date.parse(kickoff || "");
  if (!raw || !Number.isFinite(cutoff)) return false;
  const day = new Date(cutoff).toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw < day;
  const ts = Date.parse(raw);
  return Number.isFinite(ts) && ts < cutoff;
}

function duplicateIds(rows) {
  const counts = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = canonicalId(row);
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id).sort();
}

function uniqueIds(rows) {
  return [...new Set((Array.isArray(rows) ? rows : []).map(canonicalId).filter(Boolean))].sort();
}

function setDifference(left, right) {
  const r = right instanceof Set ? right : new Set(right || []);
  return [...(left instanceof Set ? left : new Set(left || []))].filter(id => !r.has(id)).sort();
}

export function evaluatePublicationUniverseContract({
  manifest,
  currentFixtures = [],
  publishedFixtures = [],
} = {}) {
  const issues = [];
  const publication = manifest?.publicationUniverse;
  const mode = clean(publication?.mode);
  const currentIds = uniqueIds(currentFixtures);
  const publishedIds = uniqueIds(publishedFixtures);
  const currentSet = new Set(currentIds);
  const publishedSet = new Set(publishedIds);
  const deferredIds = Array.isArray(publication?.deferredFixtureIds)
    ? publication.deferredFixtureIds.map(clean).filter(Boolean)
    : [];
  const deferredSet = new Set(deferredIds);

  const currentDuplicates = duplicateIds(currentFixtures);
  const publishedDuplicates = duplicateIds(publishedFixtures);
  const deferredDuplicates = deferredIds.filter((id, index) => deferredIds.indexOf(id) !== index)
    .filter((id, index, arr) => arr.indexOf(id) === index)
    .sort();

  if (!manifest || typeof manifest !== "object") {
    issues.push({ code: "PUBLICATION_MANIFEST_MISSING_OR_INVALID" });
  }
  if (!publication || typeof publication !== "object") {
    issues.push({ code: "PUBLICATION_UNIVERSE_MISSING" });
  }
  if (!["full_current_universe", "intraday_status_only"].includes(mode)) {
    issues.push({ code: "PUBLICATION_MODE_INVALID", mode: mode || null });
  }
  if (manifest?.files?.fixtures !== "fixtures.json" || manifest?.files?.detailsDir !== "details") {
    issues.push({ code: "PUBLICATION_FILE_LAYOUT_INVALID", fixtures: manifest?.files?.fixtures || null, detailsDir: manifest?.files?.detailsDir || null });
  }
  if (currentDuplicates.length) issues.push({ code: "CURRENT_FIXTURE_DUPLICATE_CANONICAL_ID", ids: currentDuplicates });
  if (publishedDuplicates.length) issues.push({ code: "PUBLISHED_FIXTURE_DUPLICATE_CANONICAL_ID", ids: publishedDuplicates });
  if (deferredDuplicates.length) issues.push({ code: "DEFERRED_FIXTURE_DUPLICATE_CANONICAL_ID", ids: deferredDuplicates });

  const publishedOutsideCurrent = setDifference(publishedSet, currentSet);
  const deferredOutsideCurrent = setDifference(deferredSet, currentSet);
  const overlap = publishedIds.filter(id => deferredSet.has(id));
  const unaccountedCurrent = currentIds.filter(id => !publishedSet.has(id) && !deferredSet.has(id));

  if (publishedOutsideCurrent.length) issues.push({ code: "PUBLISHED_FIXTURE_NOT_IN_CURRENT_UNIVERSE", ids: publishedOutsideCurrent });
  if (deferredOutsideCurrent.length) issues.push({ code: "DEFERRED_FIXTURE_NOT_IN_CURRENT_UNIVERSE", ids: deferredOutsideCurrent });
  if (overlap.length) issues.push({ code: "PUBLISHED_DEFERRED_OVERLAP", ids: overlap });
  if (unaccountedCurrent.length) issues.push({ code: "CURRENT_FIXTURE_UNACCOUNTED", ids: unaccountedCurrent });

  if (mode === "full_current_universe") {
    if (deferredSet.size !== 0) issues.push({ code: "FULL_MODE_DEFERRED_FIXTURES_FORBIDDEN", ids: [...deferredSet].sort() });
    const missingPublished = setDifference(currentSet, publishedSet);
    if (missingPublished.length) issues.push({ code: "FULL_MODE_PUBLISHED_SET_MISMATCH", ids: missingPublished });
  }

  const countChecks = [
    ["currentFixtureCount", publication?.currentFixtureCount, currentIds.length],
    ["publishedFixtureCount", publication?.publishedFixtureCount, publishedIds.length],
    ["deferredFixtureCount", publication?.deferredFixtureCount, deferredSet.size],
  ];
  for (const [field, declared, actual] of countChecks) {
    if (!Number.isInteger(declared) || declared !== actual) {
      issues.push({ code: "PUBLICATION_COUNT_MISMATCH", field, declared: declared ?? null, actual });
    }
  }
  const manifestFixtureCount = manifest?.counts?.fixtures;
  if (!Number.isInteger(manifestFixtureCount) || manifestFixtureCount !== publishedIds.length) {
    issues.push({ code: "MANIFEST_FIXTURE_COUNT_MISMATCH", declared: manifestFixtureCount ?? null, actual: publishedIds.length });
  }

  return {
    ok: issues.length === 0,
    mode: mode || null,
    currentIds,
    publishedIds,
    deferredIds: [...deferredSet].sort(),
    issues,
  };
}

export function evaluateDetailFoundationRecord({
  detail,
  expectedFixture,
  indexValidation,
  h2hValidation,
  file = null,
} = {}) {
  const issues = [];
  const id = clean(detail?.matchId || detail?.basic?.canonicalId || (file ? path.basename(file, ".json") : ""));
  const expectedId = canonicalId(expectedFixture);
  const kickoff = clean(expectedFixture?.kickoffUtc || expectedFixture?.kickoff);
  const detailKickoff = clean(detail?.basic?.kickoffUtc);
  const foundation = detail?.meta?.foundation;

  if (!detail || typeof detail !== "object") {
    return [{ code: "DETAIL_PARSE_FAILED", file }];
  }
  if (!expectedId || id !== expectedId) issues.push({ code: "DETAIL_CANONICAL_ID_MISMATCH", file, id: id || null, expectedId: expectedId || null });
  if (!sameInstant(detailKickoff, kickoff)) issues.push({ code: "DETAIL_KICKOFF_MISMATCH", file, id: expectedId || id || null });
  if (indexValidation?.ok !== true || h2hValidation?.ok !== true) {
    issues.push({ code: "CURRENT_DERIVED_FOUNDATION_NOT_READY", file, id: expectedId || id || null });
  }
  if (clean(foundation?.historyIndexFingerprint) !== clean(indexValidation?.artifact?.foundationFingerprint)) {
    issues.push({ code: "DETAIL_HISTORY_INDEX_FINGERPRINT_STALE", file, id: expectedId || id || null });
  }
  if (clean(foundation?.h2hFingerprint) !== clean(h2hValidation?.artifact?.foundationFingerprint)) {
    issues.push({ code: "DETAIL_H2H_FINGERPRINT_STALE", file, id: expectedId || id || null });
  }
  if (!sameInstant(detail?.form?.cutoffUtc, kickoff)) issues.push({ code: "DETAIL_FORM_CUTOFF_MISMATCH", file, id: expectedId || id || null });
  if (!sameInstant(detail?.leagueForm5?.cutoffUtc, kickoff)) issues.push({ code: "DETAIL_LEAGUE_FORM_CUTOFF_MISMATCH", file, id: expectedId || id || null });
  if (!["empty", "gated"].includes(detail?.h2h?.status) && !sameInstant(detail?.h2h?.cutoffUtc, kickoff)) {
    issues.push({ code: "DETAIL_H2H_CUTOFF_MISMATCH", file, id: expectedId || id || null });
  }
  for (const bucket of [detail?.h2h?.all, detail?.h2h?.atHome, detail?.h2h?.atAway]) {
    for (const row of Array.isArray(bucket) ? bucket : []) {
      if (!h2hBefore(row, kickoff)) issues.push({ code: "DETAIL_H2H_FUTURE_OR_SELF_LEAK", file, id: expectedId || id || null, date: row?.date || null });
    }
  }
  return issues;
}

export function auditDetailsFoundationDay(dayKey) {
  const snapshotRoot = resolveDataPath("deploy-snapshots", dayKey);
  const manifest = readJson(path.join(snapshotRoot, "manifest.json"));
  const snapshotFixturesPayload = readJson(path.join(snapshotRoot, "fixtures.json"));
  const publishedFixtures = Array.isArray(snapshotFixturesPayload?.fixtures) ? snapshotFixturesPayload.fixtures : [];
  const currentFixtures = fixturesForSnapshotDay(dayKey).fixtures;
  const publicationAudit = evaluatePublicationUniverseContract({ manifest, currentFixtures, publishedFixtures });
  const dir = path.join(snapshotRoot, "details");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(name => name.endsWith(".json")).sort() : [];
  const issues = [...publicationAudit.issues];
  const expected = new Map(publishedFixtures.map(row => [canonicalId(row), row]).filter(([id]) => id));
  const seen = new Set();
  const indexFoundationBySeason = new Map();
  const h2hFoundation = validateH2HFoundationSync();
  let checked = 0;

  function historyIndexFoundation(season) {
    const key = clean(season);
    if (!indexFoundationBySeason.has(key)) indexFoundationBySeason.set(key, validateHistoryIndexFoundationSync(key));
    return indexFoundationBySeason.get(key);
  }

  for (const name of files) {
    const file = path.join(dir, name);
    const detail = readJson(file);
    if (!detail) { issues.push({ code: "DETAIL_PARSE_FAILED", file: name }); continue; }
    checked += 1;
    const fileId = path.basename(name, ".json");
    const id = clean(detail.matchId || detail?.basic?.canonicalId || fileId);
    if (!expected.has(fileId)) issues.push({ code: "DETAIL_NOT_IN_PUBLISHED_FIXTURE_UNIVERSE", file: name, id: fileId });
    if (seen.has(fileId)) issues.push({ code: "DETAIL_DUPLICATE_CANONICAL_ID", file: name, id: fileId });
    seen.add(fileId);
    const fixture = expected.get(fileId);
    if (!fixture) continue;
    const kickoff = clean(fixture?.kickoffUtc || fixture?.kickoff);
    const season = currentSeason(new Date(kickoff));
    issues.push(...evaluateDetailFoundationRecord({
      detail,
      expectedFixture: fixture,
      indexValidation: historyIndexFoundation(season),
      h2hValidation: h2hFoundation,
      file: name,
    }));
    if (id !== fileId) issues.push({ code: "DETAIL_FILENAME_ID_MISMATCH", file: name, id, expectedId: fileId });
  }

  for (const id of expected.keys()) if (!seen.has(id)) issues.push({ code: "DETAIL_MISSING_FOR_PUBLISHED_FIXTURE", id });

  const declaredDetailsCount = manifest?.counts?.details;
  if (!Number.isInteger(declaredDetailsCount) || declaredDetailsCount !== files.length) {
    issues.push({ code: "MANIFEST_DETAIL_COUNT_MISMATCH", declared: declaredDetailsCount ?? null, actual: files.length });
  }

  return {
    schema: "ai-matchlab.details-foundation-audit.v2",
    generatedAt: new Date().toISOString(),
    dayKey,
    ok: issues.length === 0,
    publicationUniverse: {
      mode: publicationAudit.mode,
      currentFixtureCount: publicationAudit.currentIds.length,
      publishedFixtureCount: publicationAudit.publishedIds.length,
      deferredFixtureCount: publicationAudit.deferredIds.length,
      deferredFixtureIds: publicationAudit.deferredIds,
    },
    summary: {
      expectedFixtures: expected.size,
      detailFiles: files.length,
      checked,
      issueCount: issues.length,
    },
    issues: issues.slice(0, 500),
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const report = auditDetailsFoundationDay(process.argv[2]);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}