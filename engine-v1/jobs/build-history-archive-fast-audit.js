/**
 * Fast, complete history-archive semantic audit compatible with
 * repair-history-archive-integrity.js --audit-report.
 * Read-only. It emits every semantic duplicate group, never truncates examples.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { athensDayFromKickoff } from "../core/daykey.js";
import { semanticTeamKey } from "./audit-history-semantic-integrity.js";

const __filename = fileURLToPath(import.meta.url);
const WINDOW_MS = 6 * 60 * 60 * 1000;

function clean(v) { return String(v ?? "").trim(); }
function number(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function kickoffText(row) { return row?.kickoff || row?.kickoffUtc || row?.date || row?.startTime || null; }
function kickoffMs(row) { const t = kickoffText(row); const n = t ? Date.parse(t) : NaN; return Number.isFinite(n) ? n : null; }
function listArchiveFiles() {
  const root = resolveDataPath("history-archive");
  const out = [];
  if (!fs.existsSync(root)) return out;
  for (const slug of fs.readdirSync(root).sort()) {
    const dir = path.join(root, slug);
    let st; try { st = fs.statSync(dir); } catch { continue; }
    if (!st.isDirectory()) continue;
    for (const name of fs.readdirSync(dir).filter(x => x.endsWith(".json")).sort()) out.push(path.join(dir, name));
  }
  return out;
}
function clusters(list) {
  const sorted = [...list].sort((a, b) => a.__ts - b.__ts);
  const out = [];
  let current = null;
  for (const row of sorted) {
    if (!current || row.__ts - current.anchor > WINDOW_MS) {
      current = { anchor: row.__ts, rows: [] };
      out.push(current);
    }
    current.rows.push(row);
  }
  return out;
}
function publicRow(row) {
  const out = { ...row };
  out.container = row.__container;
  delete out.__container;
  delete out.__ts;
  delete out.__hk;
  delete out.__ak;
  delete out.__operationalDay;
  delete out.__declaredDay;
  return out;
}

export function buildHistoryArchiveFastAudit() {
  const rows = [];
  const oriented = new Map();
  const unordered = new Map();
  const ids = new Set();
  const teamCache = new Map();
  const teamKey = (slug, name) => {
    const key = `${slug}\0${name}`;
    if (!teamCache.has(key)) teamCache.set(key, semanticTeamKey(slug, name));
    return teamCache.get(key);
  };

  let invalidRowCount = 0;
  let duplicateIdCount = 0;
  let selfPairCount = 0;
  let operationalDayMismatchCount = 0;
  let validRowCount = 0;
  const invalidRows = [];
  const duplicateIds = [];
  const selfPairs = [];
  const operationalDayMismatch = [];

  for (const file of listArchiveFiles()) {
    const payload = JSON.parse(fs.readFileSync(file, "utf8"));
    const container = path.relative(resolveDataPath(), file).replaceAll("\\", "/");
    for (const raw of Array.isArray(payload?.matches) ? payload.matches : []) {
      const slug = clean(raw?.leagueSlug) || "unknown";
      const home = clean(raw?.homeTeam);
      const away = clean(raw?.awayTeam);
      const sh = number(raw?.scoreHome);
      const sa = number(raw?.scoreAway);
      const ts = kickoffMs(raw);
      if (!home || !away || sh == null || sa == null || ts == null) {
        invalidRowCount += 1;
        invalidRows.push({ ...raw, container });
        continue;
      }
      validRowCount += 1;
      const hk = teamKey(slug, home);
      const ak = teamKey(slug, away);
      const id = clean(raw?.id || raw?.matchId);
      if (id) {
        const idKey = `${slug}|${id}`;
        if (ids.has(idKey)) { duplicateIdCount += 1; duplicateIds.push({ id, slug, container }); }
        else ids.add(idKey);
      }
      if (hk === ak) { selfPairCount += 1; selfPairs.push({ id, slug, homeTeam: home, awayTeam: away, container }); }
      let op = null;
      try { op = athensDayFromKickoff(kickoffText(raw)); } catch { op = null; }
      const declared = clean(raw?.dayKey).slice(0, 10) || null;
      if (declared && op && declared !== op) {
        operationalDayMismatchCount += 1;
        operationalDayMismatch.push({ id, slug, declaredDay: declared, operationalDay: op, container });
      }
      const row = { ...raw, __container: container, __ts: ts, __hk: hk, __ak: ak, __operationalDay: op, __declaredDay: declared };
      rows.push(row);
      const oKey = `${slug}|${hk}|${ak}`;
      const uKey = hk <= ak ? `${slug}|${hk}|${ak}` : `${slug}|${ak}|${hk}`;
      if (!oriented.has(oKey)) oriented.set(oKey, []);
      if (!unordered.has(uKey)) unordered.set(uKey, []);
      oriented.get(oKey).push(row);
      unordered.get(uKey).push(row);
    }
  }

  const semanticDuplicates = [];
  const scoreConflicts = [];
  const crossOperationalDay = [];
  let duplicateExtraRecords = 0;

  for (const [pair, list] of oriented) {
    for (const cluster of clusters(list)) {
      if (cluster.rows.length < 2) continue;
      const byScore = new Map();
      for (const row of cluster.rows) {
        const score = `${Number(row.scoreHome)}|${Number(row.scoreAway)}`;
        if (!byScore.has(score)) byScore.set(score, []);
        byScore.get(score).push(row);
      }
      if (byScore.size > 1) {
        scoreConflicts.push({
          pair,
          scores: [...byScore.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([score, scoreRows]) => ({ score, rows: scoreRows.map(publicRow) })),
        });
      }
      for (const [score, same] of byScore) {
        if (same.length < 2) continue;
        duplicateExtraRecords += same.length - 1;
        const group = { pair, score, rows: same.map(publicRow) };
        semanticDuplicates.push(group);
        const op = new Set(same.map(x => x.__operationalDay).filter(Boolean));
        const dec = new Set(same.map(x => x.__declaredDay).filter(Boolean));
        if (op.size > 1 || dec.size > 1) crossOperationalDay.push(group);
      }
    }
  }

  const flippedOrientation = [];
  for (const [pair, list] of unordered) {
    for (const cluster of clusters(list)) {
      if (cluster.rows.length < 2) continue;
      const orientations = new Set(cluster.rows.map(row => `${row.__hk}|${row.__ak}`));
      if (orientations.size > 1) flippedOrientation.push({ pair, rows: cluster.rows.map(publicRow) });
    }
  }

  return {
    schema: "ai-matchlab.history-archive-fast-semantic-audit.v1",
    generatedAt: new Date().toISOString(),
    rowCount: rows.length + invalidRowCount,
    validRowCount,
    invalidRowCount,
    duplicateIdCount,
    selfPairCount,
    operationalDayMismatchCount,
    semantic: {
      duplicateGroups: semanticDuplicates.length,
      duplicateExtraRecords,
      scoreConflictGroups: scoreConflicts.length,
      flippedOrientationGroups: flippedOrientation.length,
      crossOperationalDayGroups: crossOperationalDay.length,
      examples: { semanticDuplicates, scoreConflicts, flippedOrientation, crossOperationalDay },
    },
    examples: { invalidRows, duplicateIds, selfPairs, operationalDayMismatch },
  };
}

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]; if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq >= 0) out[a.slice(2, eq)] = a.slice(eq + 1);
    else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) out[a.slice(2)] = argv[++i];
    else out[a.slice(2)] = true;
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const options = args(process.argv.slice(2));
    const report = buildHistoryArchiveFastAudit();
    const text = JSON.stringify(report, null, 2);
    if (options.output || options.report) {
      const target = path.resolve(options.output || options.report);
      ensureDir(path.dirname(target));
      fs.writeFileSync(target, text, "utf8");
    }
    console.log(JSON.stringify({
      ok: true,
      rowCount: report.rowCount,
      invalidRowCount: report.invalidRowCount,
      duplicateIdCount: report.duplicateIdCount,
      selfPairCount: report.selfPairCount,
      operationalDayMismatchCount: report.operationalDayMismatchCount,
      duplicateGroups: report.semantic.duplicateGroups,
      scoreConflictGroups: report.semantic.scoreConflictGroups,
      flippedOrientationGroups: report.semantic.flippedOrientationGroups,
      crossOperationalDayGroups: report.semantic.crossOperationalDayGroups,
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: String(error?.message || error) }, null, 2));
    process.exitCode = 1;
  }
}
