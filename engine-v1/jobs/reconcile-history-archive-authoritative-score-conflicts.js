/**
 * Reconcile history-archive score conflicts from authoritative final truth.
 *
 * Authority order:
 *   1. manual/versioned final-truth adjudication materialized in final-results
 *   2. unanimous verified-final result evidence
 *   3. fail closed
 *
 * Additional safety:
 *   - current history must independently contain exactly the same authoritative score
 *   - only rows participating in an actual semantic archive score conflict are changed
 *   - no heuristic score selection and no orientation repair
 *   - write is explicit, backed up, atomic, and post-audited
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { semanticTeamKey } from "./audit-history-semantic-integrity.js";

const __filename = fileURLToPath(import.meta.url);
const TOLERANCE_MS = 6 * 60 * 60 * 1000;

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function clean(v) { return String(v ?? "").trim(); }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function kickoffMs(row) {
  const direct = num(row?.kickoff_ms ?? row?.kickoffTs);
  if (direct != null && direct > 0) return direct;
  const text = row?.kickoff || row?.kickoffUtc || row?.date || row?.startTime || null;
  const parsed = text ? Date.parse(text) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}
function pairKey(slug, home, away) {
  return `${slug}|${semanticTeamKey(slug, home)}|${semanticTeamKey(slug, away)}`;
}
function scoreKey(h, a) { return `${h}|${a}`; }
function sha256(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }
function resultFor(h, a) { return h > a ? "HOME" : h < a ? "AWAY" : "DRAW"; }

function listJsonRecursive(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...listJsonRecursive(full));
    else if (entry.isFile() && entry.name.endsWith(".json")) out.push(full);
  }
  return out.sort();
}

function loadArchiveState() {
  const root = resolveDataPath("history-archive");
  const byContainer = new Map();
  const rows = [];
  for (const file of listJsonRecursive(root)) {
    const payload = readJson(file);
    const container = path.relative(resolveDataPath(), file).replaceAll("\\", "/");
    const matches = Array.isArray(payload?.matches) ? payload.matches : [];
    byContainer.set(container, { file, payload, matches });
    for (const row of matches) rows.push({ ...row, __container: container });
  }
  return { byContainer, rows };
}

function clusterRows(rows) {
  const sorted = [...rows].sort((a, b) => a.ts - b.ts);
  const out = [];
  let current = null;
  for (const row of sorted) {
    if (!current || row.ts - current.anchor > TOLERANCE_MS) {
      current = { anchor: row.ts, rows: [] };
      out.push(current);
    }
    current.rows.push(row);
  }
  return out;
}

export function findArchiveScoreConflicts(rows) {
  const oriented = new Map();
  for (const row of rows) {
    const slug = clean(row?.leagueSlug);
    const home = clean(row?.homeTeam);
    const away = clean(row?.awayTeam);
    const sh = num(row?.scoreHome);
    const sa = num(row?.scoreAway);
    const ts = kickoffMs(row);
    if (!slug || !home || !away || sh == null || sa == null || ts == null) continue;
    const key = pairKey(slug, home, away);
    if (!oriented.has(key)) oriented.set(key, []);
    oriented.get(key).push({ row, slug, home, away, sh, sa, ts });
  }

  const conflicts = [];
  for (const [pair, list] of oriented) {
    for (const cluster of clusterRows(list)) {
      if (cluster.rows.length < 2) continue;
      const byScore = new Map();
      for (const item of cluster.rows) {
        const key = scoreKey(item.sh, item.sa);
        if (!byScore.has(key)) byScore.set(key, []);
        byScore.get(key).push(item.row);
      }
      if (byScore.size <= 1) continue;
      conflicts.push({
        pair,
        slug: cluster.rows[0].slug,
        kickoffMs: cluster.rows[0].ts,
        scores: [...byScore.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([score, scoreRows]) => ({ score, rows: scoreRows })),
      });
    }
  }
  conflicts.sort((a, b) => `${a.pair}|${a.kickoffMs}`.localeCompare(`${b.pair}|${b.kickoffMs}`));
  return conflicts;
}

function loadVerifiedFinals() {
  const root = resolveDataPath("final-results");
  const rows = [];
  for (const file of listJsonRecursive(root)) {
    let value;
    try { value = readJson(file); } catch { continue; }
    if (value?.verifiedFinalTruth !== true) continue;
    const slug = clean(value?.leagueSlug);
    const home = clean(value?.homeTeam);
    const away = clean(value?.awayTeam);
    const sh = num(value?.homeScore ?? value?.scoreHome ?? value?.finalScore?.homeScore ?? value?.finalScore?.home);
    const sa = num(value?.awayScore ?? value?.scoreAway ?? value?.finalScore?.awayScore ?? value?.finalScore?.away);
    const ts = kickoffMs(value);
    if (!slug || !home || !away || sh == null || sa == null || ts == null) continue;
    const adjudicated =
      value?.source === "manual_versioned_truth_adjudication" ||
      value?.verification?.authority === "final_truth_adjudication_ledger" ||
      value?.verification?.method === "manual_versioned_truth_adjudication";
    rows.push({
      file,
      matchId: clean(value?.matchId),
      slug,
      home,
      away,
      sh,
      sa,
      ts,
      adjudicated,
      source: clean(value?.source),
      adjudicationId: clean(value?.verification?.adjudicationId) || null,
    });
  }
  return rows;
}

function loadTrustedCurrentHistory() {
  const root = resolveDataPath("history");
  const rows = [];
  if (!fs.existsSync(root)) return rows;
  for (const name of fs.readdirSync(root).filter(x => x.endsWith(".json") && !x.endsWith(".report.json")).sort()) {
    const payload = readJson(path.join(root, name));
    for (const day of Array.isArray(payload?.days) ? payload.days : []) {
      for (const row of Array.isArray(day?.rows) ? day.rows : []) {
        const trusted = row?.source === "manual_versioned_truth_adjudication" || row?.truthContract?.verifiedFinalTruth === true;
        if (!trusted) continue;
        const slug = clean(row?.leagueSlug);
        const home = clean(row?.homeTeam);
        const away = clean(row?.awayTeam);
        const sh = num(row?.scoreHome);
        const sa = num(row?.scoreAway);
        const ts = kickoffMs(row);
        if (!slug || !home || !away || sh == null || sa == null || ts == null) continue;
        rows.push({ row, slug, home, away, sh, sa, ts });
      }
    }
  }
  return rows;
}

export function resolveAuthoritativeScoreForConflict(conflict, { verifiedFinals, currentHistory }) {
  const finalCandidates = verifiedFinals.filter(row =>
    pairKey(row.slug, row.home, row.away) === conflict.pair &&
    Math.abs(row.ts - conflict.kickoffMs) <= TOLERANCE_MS
  );
  if (!finalCandidates.length) throw new Error(`archive_conflict_verified_final_missing:${conflict.pair}:${conflict.kickoffMs}`);

  const adjudicated = finalCandidates.filter(row => row.adjudicated);
  const authorityPool = adjudicated.length ? adjudicated : finalCandidates;
  const scoreMap = new Map();
  for (const row of authorityPool) {
    const key = scoreKey(row.sh, row.sa);
    if (!scoreMap.has(key)) scoreMap.set(key, []);
    scoreMap.get(key).push(row);
  }
  if (scoreMap.size !== 1) {
    throw new Error(`archive_conflict_authoritative_final_not_unique:${conflict.pair}:${scoreMap.size}`);
  }
  const [chosenScore, chosenRows] = [...scoreMap.entries()][0];
  const [sh, sa] = chosenScore.split("|").map(Number);

  const historyCandidates = currentHistory.filter(row =>
    pairKey(row.slug, row.home, row.away) === conflict.pair &&
    Math.abs(row.ts - conflict.kickoffMs) <= TOLERANCE_MS
  );
  const historyScores = new Set(historyCandidates.map(row => scoreKey(row.sh, row.sa)));
  if (historyScores.size !== 1 || !historyScores.has(chosenScore)) {
    throw new Error(`archive_conflict_current_history_disagrees:${conflict.pair}:${[...historyScores].sort().join(",") || "none"}:${chosenScore}`);
  }

  return {
    scoreHome: sh,
    scoreAway: sa,
    score: chosenScore,
    authority: adjudicated.length ? "approved_adjudication" : "verified_final",
    finalMatchIds: [...new Set(chosenRows.map(row => row.matchId).filter(Boolean))].sort(),
    finalSources: [...new Set(chosenRows.map(row => row.source).filter(Boolean))].sort(),
    adjudicationIds: [...new Set(chosenRows.map(row => row.adjudicationId).filter(Boolean))].sort(),
    currentHistoryIds: [...new Set(historyCandidates.map(item => clean(item.row?.id)).filter(Boolean))].sort(),
  };
}

function repairId(conflict, authority) {
  const raw = ["history-archive-authoritative-score-reconcile-v1", conflict.pair, conflict.kickoffMs, authority.score, authority.authority, ...authority.finalMatchIds].join("|");
  return `haar_${crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24)}`;
}

export function buildArchiveAuthoritativeScoreRepairPlan({ archiveRows, verifiedFinals, currentHistory }) {
  const conflicts = findArchiveScoreConflicts(archiveRows);
  const actions = conflicts.map(conflict => {
    const authority = resolveAuthoritativeScoreForConflict(conflict, { verifiedFinals, currentHistory });
    const repair = repairId(conflict, authority);
    const targets = [];
    for (const score of conflict.scores) {
      for (const row of score.rows) {
        if (score.score === authority.score) continue;
        targets.push({
          container: clean(row?.__container || row?.container),
          id: clean(row?.id || row?.matchId),
          kickoff: row?.kickoff || row?.kickoffUtc || row?.date || null,
          homeTeam: clean(row?.homeTeam),
          awayTeam: clean(row?.awayTeam),
          fromScore: score.score,
        });
      }
    }
    if (!targets.length) throw new Error(`archive_conflict_no_stale_target:${conflict.pair}:${authority.score}`);
    return { conflict, authority, repairId: repair, targets };
  });
  return { schema: "ai-matchlab.history-archive-authoritative-score-repair-plan.v1", conflictCount: conflicts.length, actions };
}

function selector(row) {
  return [clean(row?.id || row?.matchId), row?.kickoff || row?.kickoffUtc || row?.date || null, clean(row?.homeTeam), clean(row?.awayTeam)].join("|");
}

export function applyArchiveAuthoritativeScoreRepairPlan(plan, state, { write = false, backupDir = null } = {}) {
  const targetByContainer = new Map();
  for (const action of plan.actions) {
    for (const target of action.targets) {
      if (!target.container) throw new Error(`archive_conflict_target_container_missing:${target.id}`);
      if (!targetByContainer.has(target.container)) targetByContainer.set(target.container, []);
      targetByContainer.get(target.container).push({ action, target });
    }
  }

  const reports = [];
  const backups = [];
  for (const [container, targets] of targetByContainer) {
    const info = state.byContainer.get(container);
    if (!info) throw new Error(`archive_conflict_container_missing:${container}`);
    const raw = fs.readFileSync(info.file);
    const payload = JSON.parse(raw.toString("utf8"));
    const targetMap = new Map(targets.map(item => [selector(item.target), item]));
    let matched = 0;
    let changed = 0;

    for (const row of Array.isArray(payload?.matches) ? payload.matches : []) {
      const key = selector(row);
      const item = targetMap.get(key);
      if (!item) continue;
      matched += 1;
      const { action, target } = item;
      const current = scoreKey(num(row?.scoreHome), num(row?.scoreAway));
      if (current !== target.fromScore) throw new Error(`archive_conflict_source_drift:${container}:${target.id}:${current}:${target.fromScore}`);
      row.scoreHome = action.authority.scoreHome;
      row.scoreAway = action.authority.scoreAway;
      row.outcome = resultFor(action.authority.scoreHome, action.authority.scoreAway);
      row.truthRepairId = action.repairId;
      row.truthRepair = {
        schema: "ai-matchlab.history-archive-authoritative-score-repair.v1",
        authority: action.authority.authority,
        finalMatchIds: action.authority.finalMatchIds,
        finalSources: action.authority.finalSources,
        adjudicationIds: action.authority.adjudicationIds,
        currentHistoryIds: action.authority.currentHistoryIds,
        previousScore: target.fromScore.replace("|", "-"),
        correctedScore: action.authority.score.replace("|", "-"),
      };
      changed += 1;
      reports.push({ container, id: target.id, fromScore: target.fromScore, toScore: action.authority.score, authority: action.authority.authority, repairId: action.repairId });
    }
    if (matched !== targets.length) throw new Error(`archive_conflict_target_match_count:${container}:${matched}:${targets.length}`);

    if (write && changed) {
      const root = backupDir || resolveDataPath("history-integrity", "backups", "history-archive-authoritative-score-reconcile");
      ensureDir(root);
      const backup = path.join(root, container.replace(/^history-archive\//, ""));
      ensureDir(path.dirname(backup));
      if (!fs.existsSync(backup)) fs.writeFileSync(backup, raw);
      backups.push({ container, backup, sha256: sha256(raw) });
      const tmp = `${info.file}.tmp-${process.pid}-${Date.now()}`;
      fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
      fs.renameSync(tmp, info.file);
    }
  }

  return { ok: true, write, changed: reports.length, reports, backups };
}

export function reconcileHistoryArchiveAuthoritativeScoreConflicts({ write = false, backupDir = null } = {}) {
  const state = loadArchiveState();
  const verifiedFinals = loadVerifiedFinals();
  const currentHistory = loadTrustedCurrentHistory();
  const plan = buildArchiveAuthoritativeScoreRepairPlan({ archiveRows: state.rows, verifiedFinals, currentHistory });
  const applied = applyArchiveAuthoritativeScoreRepairPlan(plan, state, { write, backupDir });
  const post = write ? findArchiveScoreConflicts(loadArchiveState().rows) : findArchiveScoreConflicts(state.rows);
  if (write && post.length !== 0) throw new Error(`archive_authoritative_score_post_conflicts:${post.length}`);
  return { ok: true, schema: "ai-matchlab.history-archive-authoritative-score-reconcile.v1", mode: write ? "write" : "dry-run", plan, applied, postConflictCount: post.length };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq >= 0) out[arg.slice(2, eq)] = arg.slice(eq + 1);
    else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) out[arg.slice(2)] = argv[++i];
    else out[arg.slice(2)] = true;
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const args = parseArgs(process.argv.slice(2));
  try {
    const result = reconcileHistoryArchiveAuthoritativeScoreConflicts({ write: Boolean(args.write), backupDir: args["backup-dir"] || null });
    const text = JSON.stringify(result, null, 2);
    if (args.report) {
      ensureDir(path.dirname(path.resolve(args.report)));
      fs.writeFileSync(path.resolve(args.report), text, "utf8");
    }
    console.log(text);
  } catch (error) {
    const text = JSON.stringify({ ok: false, error: String(error?.message || error) }, null, 2);
    if (args.report) {
      ensureDir(path.dirname(path.resolve(args.report)));
      fs.writeFileSync(path.resolve(args.report), text, "utf8");
    }
    console.error(text);
    process.exitCode = 1;
  }
}
