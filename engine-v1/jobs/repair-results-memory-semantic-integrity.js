/**
 * Repair results-memory semantic duplicates and mirror conflicts.
 *
 * Dry-run by default. --write is explicit.
 * Scope is deliberately narrow:
 *  - same-score semantic duplicate groups already identified by the shared audit
 *  - mirror conflicts where exactly one pair of stored sides is mutually consistent
 *
 * It does NOT repair/remove ordinary one-sided/orphan matchIds; those are handled
 * by the separate match-level retention/reconstruction step.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { auditResultsMemoryPayload, semanticTeamKey } from "./audit-history-semantic-integrity.js";

const __filename = fileURLToPath(import.meta.url);

function safeNum(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function sha256(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }
function sourcePriority(id) {
  const x = String(id || "");
  if (x.startsWith("cid_")) return 0;
  if (!x.startsWith("espn_") && !x.startsWith("sofa_") && !/^\d+$/.test(x)) return 1;
  if (x.startsWith("espn_") || /^\d+$/.test(x)) return 2;
  if (x.startsWith("sofa_")) return 3;
  return 4;
}
function entryKey(teamName, e) {
  return [teamName, e?.matchId, e?.date, e?.opp, e?.ha, e?.gf, e?.ga].map(x => String(x ?? "")).join("|");
}
function sidesById(payload) {
  const out = new Map();
  for (const [teamName, list] of Object.entries(payload?.teams || {})) {
    for (const entry of Array.isArray(list) ? list : []) {
      const id = String(entry?.matchId || "").trim();
      if (!id) continue;
      if (!out.has(id)) out.set(id, []);
      out.get(id).push({ teamName, entry });
    }
  }
  return out;
}
function mirrorPairOk(slug, a, b) {
  if (!a || !b || a.entry?.ha === b.entry?.ha) return false;
  const home = a.entry?.ha === "H" ? a : b;
  const away = a.entry?.ha === "A" ? a : b;
  return Boolean(
    semanticTeamKey(slug, home.teamName) === semanticTeamKey(slug, away.entry?.opp)
    && semanticTeamKey(slug, away.teamName) === semanticTeamKey(slug, home.entry?.opp)
    && safeNum(home.entry?.gf) === safeNum(away.entry?.ga)
    && safeNum(home.entry?.ga) === safeNum(away.entry?.gf)
  );
}
function completenessScore(sides) {
  const hasH = sides.some(x => x.entry?.ha === "H");
  const hasA = sides.some(x => x.entry?.ha === "A");
  let mirror = false;
  for (let i = 0; i < sides.length; i++) for (let j = i + 1; j < sides.length; j++) {
    if (mirrorPairOk("", sides[i], sides[j])) mirror = true;
  }
  return Number(hasH) + Number(hasA) + Number(mirror) * 2;
}
function chooseRetainedId(slug, ids, payload) {
  const map = sidesById(payload);
  const candidates = [...new Set(ids)].map(id => {
    const sides = map.get(id) || [];
    let mirror = 0;
    for (let i = 0; i < sides.length; i++) for (let j = i + 1; j < sides.length; j++) {
      if (mirrorPairOk(slug, sides[i], sides[j])) mirror = 1;
    }
    return {
      id,
      sides: sides.length,
      mirror,
      priority: sourcePriority(id),
    };
  });
  candidates.sort((a, b) =>
    b.mirror - a.mirror
    || b.sides - a.sides
    || a.priority - b.priority
    || a.id.localeCompare(b.id)
  );
  if (!candidates.length || candidates[0].sides === 0) throw new Error(`no_retained_candidate:${slug}`);
  return candidates[0].id;
}

export function buildResultsSemanticRepairPlan({ reports }) {
  const actions = [];
  for (const report of reports || []) {
    const slug = report.slug;
    for (const dup of report?.semantic?.examples?.semanticDuplicates || []) {
      const ids = [...new Set((dup.rows || []).map(r => String(r.id || "")).filter(Boolean))];
      if (ids.length < 2) continue;
      actions.push({
        type: "same_truth_semantic_dedup",
        slug,
        pair: dup.pair,
        score: dup.score,
        ids,
      });
    }
    for (const mirror of report?.examples?.mirrorConflicts || []) {
      actions.push({
        type: "mirror_conflict",
        slug,
        matchId: String(mirror.matchId || ""),
      });
    }
  }
  actions.sort((a, b) => `${a.slug}|${a.type}|${a.matchId || a.pair}`.localeCompare(`${b.slug}|${b.type}|${b.matchId || b.pair}`));
  return { schema: "ai-matchlab.results-memory-semantic-repair-plan.v1", actions };
}

export function applyResultsSemanticRepairPlan(plan, { write = false, backupDir = null } = {}) {
  if (plan?.schema !== "ai-matchlab.results-memory-semantic-repair-plan.v1") throw new Error("bad_plan_schema");
  const bySlug = new Map();
  for (const a of plan.actions || []) {
    if (!bySlug.has(a.slug)) bySlug.set(a.slug, []);
    bySlug.get(a.slug).push(a);
  }
  const reports = [];
  const backups = [];

  for (const [slug, actions] of bySlug) {
    const file = resolveDataPath("league-memory", "results", `${slug}.json`);
    const raw = fs.readFileSync(file);
    const payload = JSON.parse(raw.toString("utf8"));
    let removed = 0;
    const decisions = [];

    for (const action of actions) {
      if (action.type === "same_truth_semantic_dedup") {
        const retainId = chooseRetainedId(slug, action.ids, payload);
        const suppress = new Set(action.ids.filter(id => id !== retainId));
        let actionRemoved = 0;
        for (const [team, list] of Object.entries(payload.teams || {})) {
          const next = (Array.isArray(list) ? list : []).filter(e => {
            if (!suppress.has(String(e?.matchId || ""))) return true;
            actionRemoved += 1;
            return false;
          });
          if (next.length) payload.teams[team] = next;
          else delete payload.teams[team];
        }
        if (actionRemoved === 0) throw new Error(`dedup_selector_not_found:${slug}:${[...suppress].join(",")}`);
        removed += actionRemoved;
        decisions.push({ ...action, retainId, suppressedIds: [...suppress].sort(), removed: actionRemoved });
      } else if (action.type === "mirror_conflict") {
        const map = sidesById(payload);
        const sides = map.get(action.matchId) || [];
        const validPairs = [];
        for (let i = 0; i < sides.length; i++) for (let j = i + 1; j < sides.length; j++) {
          if (mirrorPairOk(slug, sides[i], sides[j])) validPairs.push([sides[i], sides[j]]);
        }
        if (validPairs.length !== 1) throw new Error(`mirror_pair_not_unique:${slug}:${action.matchId}:${validPairs.length}`);
        const keep = new Set(validPairs[0].map(x => entryKey(x.teamName, x.entry)));
        let actionRemoved = 0;
        for (const [team, list] of Object.entries(payload.teams || {})) {
          const next = (Array.isArray(list) ? list : []).filter(e => {
            if (String(e?.matchId || "") !== action.matchId) return true;
            if (keep.has(entryKey(team, e))) return true;
            actionRemoved += 1;
            return false;
          });
          if (next.length) payload.teams[team] = next;
          else delete payload.teams[team];
        }
        if (actionRemoved === 0) throw new Error(`mirror_extra_side_not_found:${slug}:${action.matchId}`);
        removed += actionRemoved;
        decisions.push({ ...action, keptSides: validPairs[0].map(x => ({ teamName: x.teamName, ...x.entry })), removed: actionRemoved });
      }
    }

    const afterAudit = auditResultsMemoryPayload(slug, payload, { maxExamples: 100000 });
    if (afterAudit.mirrorConflictCount !== 0 || afterAudit.semantic.scoreConflictGroups !== 0 || afterAudit.semantic.duplicateGroups !== 0) {
      throw new Error(`post_repair_semantic_failure:${slug}:mirror=${afterAudit.mirrorConflictCount}:score=${afterAudit.semantic.scoreConflictGroups}:dups=${afterAudit.semantic.duplicateGroups}`);
    }

    if (write && removed) {
      const dir = backupDir || resolveDataPath("history-integrity", "backups", "results-semantic-repair");
      ensureDir(dir);
      const hash = sha256(raw);
      const backup = path.join(dir, `${slug}.${hash.slice(0, 12)}.json`);
      if (!fs.existsSync(backup)) fs.writeFileSync(backup, raw);
      backups.push({ slug, source: `league-memory/results/${slug}.json`, backup, sha256: hash });
      payload.semanticRepair = {
        schema: "ai-matchlab.results-memory-semantic-repair.v1",
        repairedAt: new Date().toISOString(),
        decisionHash: sha256(Buffer.from(JSON.stringify(decisions))),
      };
      const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
      fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
      fs.renameSync(tmp, file);
    }

    reports.push({ slug, removed, decisions, postAudit: {
      entries: afterAudit.entryCount,
      orphans: afterAudit.orphanMatchIdCount,
      mirror: afterAudit.mirrorConflictCount,
      semanticDuplicates: afterAudit.semantic.duplicateGroups,
      scoreConflicts: afterAudit.semantic.scoreConflictGroups,
    }});
  }
  return { ok: true, write, files: reports.length, removed: reports.reduce((n, x) => n + x.removed, 0), reports, backups };
}

function collectCurrentReports() {
  const dir = resolveDataPath("league-memory", "results");
  const reports = [];
  for (const name of fs.readdirSync(dir).filter(x => x.endsWith(".json") && !x.startsWith("_")).sort()) {
    const slug = name.slice(0, -5);
    const payload = readJson(path.join(dir, name));
    const report = auditResultsMemoryPayload(slug, payload, { maxExamples: 100000 });
    if (report.mirrorConflictCount || report.semantic.duplicateGroups || report.semantic.scoreConflictGroups) reports.push(report);
  }
  return reports;
}

function parseArgs(argv) {
  const value = key => (argv.find(x => x.startsWith(`${key}=`)) || "").slice(key.length + 1) || null;
  return { write: argv.includes("--write"), report: value("--report"), backupDir: value("--backup-dir") };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const reports = collectCurrentReports();
    const plan = buildResultsSemanticRepairPlan({ reports });
    const result = applyResultsSemanticRepairPlan(plan, { write: args.write, backupDir: args.backupDir });
    const output = { ...result, plan };
    if (args.report) {
      ensureDir(path.dirname(path.resolve(args.report)));
      fs.writeFileSync(path.resolve(args.report), `${JSON.stringify(output, null, 2)}\n`, "utf8");
    }
    console.log(JSON.stringify({ ok: true, write: args.write, actions: plan.actions.length, files: result.files, removed: result.removed }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: String(error?.stack || error?.message || error) }, null, 2));
    process.exitCode = 2;
  }
}
