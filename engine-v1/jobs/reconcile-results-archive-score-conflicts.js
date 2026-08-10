/**
 * Reconcile semantic score conflicts in results-memory/history-archive from
 * already-clean current-history truth. Dry-run by default; --write is explicit.
 *
 * Safety:
 * - only touches conflict rows exposed by the semantic audit
 * - requires exactly one unambiguous current-history score in the same league,
 *   ordered semantic team pair and +/- 6h kickoff window
 * - never invents a score and never resolves orientation conflicts
 * - backs up every file before write and writes atomically
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { buildSemanticHistoryAudit, semanticTeamKey } from "./audit-history-semantic-integrity.js";

const __filename = fileURLToPath(import.meta.url);
const TOLERANCE_MS = 6 * 60 * 60 * 1000;

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function safeNum(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function kickoffMs(row) {
  const n = safeNum(row?.kickoff_ms ?? row?.kickoffTs);
  if (n != null && n > 0) return n;
  const v = row?.kickoff || row?.kickoffUtc || row?.date || null;
  const p = v ? Date.parse(v) : NaN;
  return Number.isFinite(p) ? p : null;
}
function pairKey(slug, home, away) {
  return `${slug}|${semanticTeamKey(slug, home)}|${semanticTeamKey(slug, away)}`;
}
function historyRows() {
  const dir = resolveDataPath("history");
  const rows = [];
  for (const name of fs.readdirSync(dir).filter(x => x.endsWith(".json") && !x.endsWith(".report.json")).sort()) {
    const payload = readJson(path.join(dir, name));
    for (const day of Array.isArray(payload?.days) ? payload.days : []) {
      for (const row of Array.isArray(day?.rows) ? day.rows : []) rows.push({ ...row, __dayKey: day.dayKey });
    }
  }
  return rows;
}
function makeTruthIndex(rows) {
  const map = new Map();
  for (const row of rows) {
    const sh = safeNum(row?.scoreHome), sa = safeNum(row?.scoreAway), ts = kickoffMs(row);
    const slug = String(row?.leagueSlug || "");
    if (!slug || sh == null || sa == null || ts == null) continue;
    const key = pairKey(slug, row?.homeTeam, row?.awayTeam);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ row, ts, sh, sa });
  }
  return map;
}
function resolveTruth(index, slug, sample) {
  const key = pairKey(slug, sample.homeTeam, sample.awayTeam);
  const ts = kickoffMs(sample);
  const candidates = (index.get(key) || []).filter(x => ts != null && Math.abs(x.ts - ts) <= TOLERANCE_MS);
  const scores = new Map();
  for (const c of candidates) scores.set(`${c.sh}|${c.sa}`, c);
  if (scores.size !== 1) {
    throw new Error(`authoritative_history_truth_not_unique:${key}:${scores.size}`);
  }
  return [...scores.values()][0];
}
function repairId(slug, truth) {
  const raw = ["results-archive-score-reconcile-v1", slug, truth.row?.id || "", truth.ts, truth.sh, truth.sa].join("|");
  return `rar_${crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24)}`;
}
function resultFor(gf, ga) { return gf > ga ? "W" : gf < ga ? "L" : "D"; }

export function buildScoreConflictRepairPlan({ audit, currentHistoryRows }) {
  const index = makeTruthIndex(currentHistoryRows);
  const actions = [];

  for (const league of audit?.resultsMemory?.affectedLeagues || []) {
    for (const conflict of league?.semantic?.examples?.scoreConflicts || []) {
      const sample = conflict?.scores?.[0]?.rows?.[0];
      if (!sample) continue;
      const truth = resolveTruth(index, league.slug, sample);
      actions.push({
        layer: "results-memory",
        slug: league.slug,
        file: `league-memory/results/${league.slug}.json`,
        ids: [...new Set(conflict.scores.flatMap(s => s.rows.map(r => String(r.id))))].sort(),
        scoreHome: truth.sh,
        scoreAway: truth.sa,
        historyId: truth.row?.id || null,
        historyDay: truth.row?.dayKey || truth.row?.__dayKey || null,
        repairId: repairId(league.slug, truth),
      });
    }
  }

  for (const conflict of audit?.historyArchive?.semantic?.examples?.scoreConflicts || []) {
    const sample = conflict?.scores?.[0]?.rows?.[0];
    if (!sample) continue;
    const slug = String(conflict.pair || "").split("|")[0];
    const truth = resolveTruth(index, slug, sample);
    const byFile = new Map();
    for (const score of conflict.scores || []) {
      for (const row of score.rows || []) {
        if (!byFile.has(row.container)) byFile.set(row.container, []);
        byFile.get(row.container).push(String(row.id));
      }
    }
    for (const [file, ids] of byFile) {
      actions.push({
        layer: "history-archive",
        slug,
        file,
        ids: [...new Set(ids)].sort(),
        scoreHome: truth.sh,
        scoreAway: truth.sa,
        historyId: truth.row?.id || null,
        historyDay: truth.row?.dayKey || truth.row?.__dayKey || null,
        repairId: repairId(slug, truth),
      });
    }
  }

  actions.sort((a, b) => `${a.layer}|${a.file}|${a.repairId}`.localeCompare(`${b.layer}|${b.file}|${b.repairId}`));
  return { schema: "ai-matchlab.results-archive-score-conflict-repair-plan.v1", actions };
}

export function backupFileNameForActionFile(actionFile, shaPrefix) {
  const normalized = String(actionFile || "")
    .replace(/[\\/]+/gu, "__")
    .replace(/[^A-Za-z0-9._-]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
  if (!normalized) throw new Error("repair_backup_action_file_invalid");

  const suffix = String(shaPrefix || "").trim();
  if (!/^[a-f0-9]{12}$/u.test(suffix)) {
    throw new Error("repair_backup_sha_prefix_invalid");
  }

  return `${normalized}.${suffix}.json`;
}

export function applyScoreConflictRepairPlan(plan, { write = false, backupDir = null } = {}) {
  const reports = [];
  const backups = [];
  for (const action of plan.actions) {
    const file = resolveDataPath(...action.file.split("/"));
    const raw = fs.readFileSync(file);
    const payload = JSON.parse(raw.toString("utf8"));
    let changed = 0;
    let matched = 0;
    const ids = new Set(action.ids);

    if (action.layer === "results-memory") {
      for (const list of Object.values(payload?.teams || {})) {
        for (const entry of Array.isArray(list) ? list : []) {
          if (!ids.has(String(entry?.matchId || ""))) continue;
          matched += 1;
          const gf = entry.ha === "A" ? action.scoreAway : action.scoreHome;
          const ga = entry.ha === "A" ? action.scoreHome : action.scoreAway;
          if (safeNum(entry.gf) !== gf || safeNum(entry.ga) !== ga || entry.truthRepairId !== action.repairId) {
            entry.gf = gf; entry.ga = ga; entry.res = resultFor(gf, ga); entry.truthRepairId = action.repairId; changed += 1;
          }
        }
      }
    } else {
      for (const row of Array.isArray(payload?.matches) ? payload.matches : []) {
        if (!ids.has(String(row?.id || row?.matchId || ""))) continue;
        matched += 1;
        if (safeNum(row.scoreHome) !== action.scoreHome || safeNum(row.scoreAway) !== action.scoreAway || row.truthRepairId !== action.repairId) {
          row.scoreHome = action.scoreHome;
          row.scoreAway = action.scoreAway;
          row.outcome = action.scoreHome > action.scoreAway ? "HOME" : action.scoreHome < action.scoreAway ? "AWAY" : "DRAW";
          row.truthRepairId = action.repairId;
          changed += 1;
        }
      }
    }
    if (matched === 0) throw new Error(`repair_selector_not_found:${action.layer}:${action.file}:${action.ids.join(",")}`);

    if (write && changed) {
      const bdir = backupDir || resolveDataPath("history-integrity", "backups", "results-archive-score-reconcile");
      ensureDir(bdir);
      const sha = crypto.createHash("sha256").update(raw).digest("hex");
      const target = path.join(
        bdir,
        backupFileNameForActionFile(action.file, sha.slice(0, 12)),
      );
      ensureDir(path.dirname(target));
      if (!fs.existsSync(target)) fs.writeFileSync(target, raw);
      backups.push({ file: action.file, backup: target, sha256: sha });
      const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
      fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
      fs.renameSync(tmp, file);
    }
    reports.push({ ...action, matched, changed });
  }
  return { ok: true, write, actions: reports, backups };
}

function parseArgs(argv) {
  return {
    write: argv.includes("--write"),
    report: (argv.find(x => x.startsWith("--report=")) || "").slice("--report=".length) || null,
    backupDir: (argv.find(x => x.startsWith("--backup-dir=")) || "").slice("--backup-dir=".length) || null,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const audit = buildSemanticHistoryAudit({ maxExamples: 100000 });
    const plan = buildScoreConflictRepairPlan({ audit, currentHistoryRows: historyRows() });
    const result = applyScoreConflictRepairPlan(plan, { write: args.write, backupDir: args.backupDir });
    const output = { ...result, plan };
    if (args.report) {
      ensureDir(path.dirname(path.resolve(args.report)));
      fs.writeFileSync(path.resolve(args.report), `${JSON.stringify(output, null, 2)}\n`, "utf8");
    }
    console.log(JSON.stringify({ ok: true, write: args.write, actionCount: plan.actions.length, changed: result.actions.reduce((n, x) => n + x.changed, 0), actions: result.actions }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: String(error?.message || error) }, null, 2));
    process.exitCode = 2;
  }
}
