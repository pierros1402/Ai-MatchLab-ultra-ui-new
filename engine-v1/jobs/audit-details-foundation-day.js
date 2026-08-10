import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDataPath } from "../storage/data-root.js";
import { resolveDayFixtureRows } from "../core/day-fixture-universe.js";
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

export function auditDetailsFoundationDay(dayKey) {
  const fixtures = resolveDayFixtureRows(dayKey);
  const expected = new Map(fixtures.map(row => [canonicalId(row), row]).filter(([id]) => id));
  const dir = resolveDataPath("details", dayKey);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(name => name.endsWith(".json")).sort() : [];
  const issues = [];
  const seen = new Set();
  const indexFoundationBySeason = new Map();
  const h2hFoundation = validateH2HFoundationSync();
  let checked = 0;

  function historyIndexFoundation(season) {
    const key = clean(season);
    if (!indexFoundationBySeason.has(key)) {
      indexFoundationBySeason.set(key, validateHistoryIndexFoundationSync(key));
    }
    return indexFoundationBySeason.get(key);
  }

  for (const name of files) {
    const file = path.join(dir, name);
    const detail = readJson(file);
    if (!detail) { issues.push({ code: "DETAIL_PARSE_FAILED", file: name }); continue; }
    checked += 1;
    const id = clean(detail.matchId || detail?.basic?.canonicalId || path.basename(name, ".json"));
    if (!expected.has(id)) issues.push({ code: "DETAIL_NOT_IN_RESOLVED_FIXTURE_UNIVERSE", file: name, id });
    if (seen.has(id)) issues.push({ code: "DETAIL_DUPLICATE_CANONICAL_ID", file: name, id });
    seen.add(id);
    const kickoff = clean(detail?.basic?.kickoffUtc);
    const season = currentSeason(new Date(kickoff));
    const index = historyIndexFoundation(season);
    const h2h = h2hFoundation;
    const foundation = detail?.meta?.foundation;
    if (!index.ok || !h2h.ok) issues.push({ code: "CURRENT_DERIVED_FOUNDATION_NOT_READY", file: name });
    if (clean(foundation?.historyIndexFingerprint) !== clean(index.artifact?.foundationFingerprint) ||
        clean(foundation?.h2hFingerprint) !== clean(h2h.artifact?.foundationFingerprint)) {
      issues.push({ code: "DETAIL_FOUNDATION_FINGERPRINT_STALE", file: name, id });
    }
    if (!sameInstant(detail?.form?.cutoffUtc, kickoff)) issues.push({ code: "DETAIL_FORM_CUTOFF_MISMATCH", file: name, id });
    if (!sameInstant(detail?.leagueForm5?.cutoffUtc, kickoff)) issues.push({ code: "DETAIL_LEAGUE_FORM_CUTOFF_MISMATCH", file: name, id });
    if (!["empty","gated"].includes(detail?.h2h?.status) && !sameInstant(detail?.h2h?.cutoffUtc, kickoff)) {
      issues.push({ code: "DETAIL_H2H_CUTOFF_MISMATCH", file: name, id });
    }
    for (const bucket of [detail?.h2h?.all, detail?.h2h?.atHome, detail?.h2h?.atAway]) {
      for (const row of Array.isArray(bucket) ? bucket : []) {
        if (!h2hBefore(row, kickoff)) issues.push({ code: "DETAIL_H2H_FUTURE_OR_SELF_LEAK", file: name, id, date: row?.date || null });
      }
    }
  }
  for (const id of expected.keys()) if (!seen.has(id)) issues.push({ code: "DETAIL_MISSING_FOR_RESOLVED_FIXTURE", id });
  return {
    schema: "ai-matchlab.details-foundation-audit.v1",
    generatedAt: new Date().toISOString(),
    dayKey,
    ok: issues.length === 0,
    summary: { expectedFixtures: expected.size, detailFiles: files.length, checked, issueCount: issues.length },
    issues: issues.slice(0, 500),
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const report = auditDetailsFoundationDay(process.argv[2]);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
