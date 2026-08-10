/**
 * Repair one-sided results-memory matchIds and enforce match-level retention.
 *
 * A one-sided entry contains enough information to reconstruct the opposite
 * perspective (opponent, home/away role, score and kickoff). We first create
 * that mirror side, then apply the shared match-level retention contract so a
 * match is retained or removed from both teams together.
 *
 * Dry-run by default. --write is explicit. Files without orphans are untouched.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDataPath, ensureDir } from '../storage/data-root.js';
import { applyMatchLevelRetention } from '../storage/result-dedup.js';
import { auditResultsMemoryPayload } from './audit-history-semantic-integrity.js';

const __filename = fileURLToPath(import.meta.url);
const PER_TEAM_CAP = 250;
const MAX_AGE_DAYS = 1825;

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function result(gf, ga) { return gf > ga ? 'W' : gf < ga ? 'L' : 'D'; }
function sideGroups(teams) {
  const map = new Map();
  for (const [teamName, list] of Object.entries(teams || {})) {
    for (const entry of Array.isArray(list) ? list : []) {
      const id = String(entry?.matchId || '').trim();
      if (!id) continue;
      if (!map.has(id)) map.set(id, []);
      map.get(id).push({ teamName, entry });
    }
  }
  return map;
}

export function repairOrphanResultsPayload(payload, { nowMs = Date.now() } = {}) {
  const teams = structuredClone(payload?.teams || {});
  const beforeGroups = sideGroups(teams);
  const reconstructed = [];

  for (const [matchId, sides] of beforeGroups) {
    if (sides.length !== 1) continue;
    const { teamName, entry } = sides[0];
    const opponent = String(entry?.opp || '').trim();
    const gf = Number(entry?.gf);
    const ga = Number(entry?.ga);
    if (!opponent || (entry?.ha !== 'H' && entry?.ha !== 'A') || !Number.isFinite(gf) || !Number.isFinite(ga)) {
      throw new Error(`orphan_not_reconstructable:${matchId}`);
    }

    const mirror = {
      ...entry,
      opp: teamName,
      ha: entry.ha === 'H' ? 'A' : 'H',
      gf: ga,
      ga: gf,
      res: result(ga, gf),
      reconstructedMirror: true,
      reconstructedFromResultsMemory: true,
    };
    if (!teams[opponent]) teams[opponent] = [];
    teams[opponent].push(mirror);
    reconstructed.push({ matchId, sourceTeam: teamName, reconstructedTeam: opponent, date: entry.date || null });
  }

  const afterReconstructionGroups = sideGroups(teams);
  for (const item of reconstructed) {
    if ((afterReconstructionGroups.get(item.matchId) || []).length !== 2) {
      throw new Error(`orphan_reconstruction_not_two_sided:${item.matchId}`);
    }
  }

  const retainedTeams = applyMatchLevelRetention(teams, {
    perTeamCap: PER_TEAM_CAP,
    maxAgeDays: MAX_AGE_DAYS,
    nowMs,
  });
  const retainedGroups = sideGroups(retainedTeams);
  const dropped = [];
  for (const [matchId, sides] of afterReconstructionGroups) {
    if (retainedGroups.has(matchId)) continue;
    const dates = sides.map(x => x.entry?.date).filter(Boolean).sort();
    dropped.push({ matchId, date: dates.at(-1) || null, sideCount: sides.length });
  }
  dropped.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || a.matchId.localeCompare(b.matchId));

  const repaired = { ...payload, teams: retainedTeams };
  const audit = auditResultsMemoryPayload(String(payload?.slug || ''), repaired, { maxExamples: 100000, nowMs });
  if (audit.orphanMatchIdCount || audit.mirrorConflictCount || audit.semantic.duplicateGroups || audit.semantic.scoreConflictGroups || audit.semantic.flippedOrientationGroups) {
    throw new Error(`post_orphan_repair_integrity_failure:orphans=${audit.orphanMatchIdCount}:mirror=${audit.mirrorConflictCount}:dups=${audit.semantic.duplicateGroups}:scores=${audit.semantic.scoreConflictGroups}:flipped=${audit.semantic.flippedOrientationGroups}`);
  }

  return {
    payload: repaired,
    report: {
      reconstructedCount: reconstructed.length,
      reconstructed,
      droppedMatchCount: dropped.length,
      dropped,
      entriesBefore: Object.values(payload?.teams || {}).reduce((n, x) => n + (Array.isArray(x) ? x.length : 0), 0),
      entriesAfterReconstruction: Object.values(teams).reduce((n, x) => n + (Array.isArray(x) ? x.length : 0), 0),
      entriesAfter: audit.entryCount,
      postAudit: {
        orphans: audit.orphanMatchIdCount,
        mirror: audit.mirrorConflictCount,
        duplicates: audit.semantic.duplicateGroups,
        scoreConflicts: audit.semantic.scoreConflictGroups,
        flipped: audit.semantic.flippedOrientationGroups,
      }
    }
  };
}

export function runResultsOrphanRepair({ write = false, backupDir = null, nowMs = Date.now() } = {}) {
  const dir = resolveDataPath('league-memory', 'results');
  const reports = [];
  const backups = [];
  for (const name of fs.readdirSync(dir).filter(x => x.endsWith('.json') && !x.startsWith('_')).sort()) {
    const slug = name.slice(0, -5);
    const file = path.join(dir, name);
    const raw = fs.readFileSync(file);
    const payload = JSON.parse(raw.toString('utf8'));
    if (!payload?.teams) continue;
    const beforeAudit = auditResultsMemoryPayload(slug, payload, { maxExamples: 5, nowMs });
    if (!beforeAudit.orphanMatchIdCount) continue;

    const { payload: repaired, report } = repairOrphanResultsPayload({ ...payload, slug }, { nowMs });
    if (report.reconstructedCount !== beforeAudit.orphanMatchIdCount) {
      throw new Error(`orphan_count_mismatch:${slug}:${beforeAudit.orphanMatchIdCount}:${report.reconstructedCount}`);
    }

    if (write) {
      const bdir = backupDir || resolveDataPath('history-integrity', 'backups', 'results-orphan-repair');
      ensureDir(bdir);
      const hash = sha256(raw);
      const backup = path.join(bdir, `${slug}.${hash.slice(0, 12)}.json`);
      if (!fs.existsSync(backup)) fs.writeFileSync(backup, raw);
      backups.push({ slug, source: `league-memory/results/${slug}.json`, backup, sha256: hash });
      repaired.orphanRepair = {
        schema: 'ai-matchlab.results-memory-orphan-repair.v1',
        repairedAt: new Date(nowMs).toISOString(),
        reconstructedCount: report.reconstructedCount,
        droppedMatchCount: report.droppedMatchCount,
      };
      const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
      fs.writeFileSync(tmp, `${JSON.stringify(repaired, null, 2)}\n`, 'utf8');
      fs.renameSync(tmp, file);
    }
    reports.push({ slug, beforeOrphans: beforeAudit.orphanMatchIdCount, ...report });
  }
  return {
    ok: true,
    write,
    now: new Date(nowMs).toISOString(),
    files: reports.length,
    reconstructed: reports.reduce((n, x) => n + x.reconstructedCount, 0),
    droppedMatches: reports.reduce((n, x) => n + x.droppedMatchCount, 0),
    entriesBefore: reports.reduce((n, x) => n + x.entriesBefore, 0),
    entriesAfter: reports.reduce((n, x) => n + x.entriesAfter, 0),
    reports,
    backups,
  };
}

function parseArgs(argv) {
  const value = key => (argv.find(x => x.startsWith(`${key}=`)) || '').slice(key.length + 1) || null;
  const nowText = value('--now');
  const nowMs = nowText ? Date.parse(nowText) : Date.now();
  if (!Number.isFinite(nowMs)) throw new Error(`invalid_now:${nowText}`);
  return { write: argv.includes('--write'), report: value('--report'), backupDir: value('--backup-dir'), nowMs };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = runResultsOrphanRepair(args);
    if (args.report) {
      ensureDir(path.dirname(path.resolve(args.report)));
      fs.writeFileSync(path.resolve(args.report), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    }
    console.log(JSON.stringify({ ok: true, write: args.write, files: result.files, reconstructed: result.reconstructed, droppedMatches: result.droppedMatches, entriesBefore: result.entriesBefore, entriesAfter: result.entriesAfter }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: String(error?.stack || error?.message || error) }, null, 2));
    process.exitCode = 2;
  }
}
