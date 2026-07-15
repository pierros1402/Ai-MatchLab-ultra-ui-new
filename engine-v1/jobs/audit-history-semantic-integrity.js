/**
 * audit-history-semantic-integrity.js
 *
 * Read-only semantic integrity audit for the result/history truth layers.
 * It never rewrites results, history archives, current history or H2H memory.
 * `--write` writes only the generated audit report.
 *
 * Usage:
 *   node engine-v1/jobs/audit-history-semantic-integrity.js
 *   node engine-v1/jobs/audit-history-semantic-integrity.js --write
 *   node engine-v1/jobs/audit-history-semantic-integrity.js --output=data/history-integrity/custom.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { normalizeTeamKey } from "../core/normalize.js";
import { athensDayFromKickoff } from "../core/daykey.js";
import {
  canonicalTeamName,
  globalCanonicalTeamName
} from "../storage/team-aliases-db.js";
import { canonicalH2HPairIdentity } from "../core/h2h-canonical-key-policy.js";

const __filename = fileURLToPath(import.meta.url);
const KICKOFF_TOLERANCE_MS = 6 * 60 * 60 * 1000;
const RESULTS_MAX_AGE_DAYS = 1825;
const DEFAULT_MAX_EXAMPLES = 30;

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function listJsonFiles(dirPath) {
  try {
    return fs.readdirSync(dirPath)
      .filter(name => name.endsWith(".json") && !name.startsWith("_"))
      .map(name => path.join(dirPath, name))
      .sort();
  } catch {
    return [];
  }
}

function safeNum(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeTextKey(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "") || "unknown";
}

export function semanticTeamKey(leagueSlug, teamName) {
  const canonical = canonicalTeamName(leagueSlug, teamName)
    || globalCanonicalTeamName(teamName)
    || teamName;

  // normalizeTeamKey deliberately strips generic club tokens. A real club named
  // only "AFC" would therefore become an empty key; semantic auditing must retain
  // a non-empty fallback so it can expose, rather than hide, that degradation.
  return normalizeTeamKey(canonical) || normalizeTextKey(canonical);
}

function kickoffMsOf(row) {
  const direct = safeNum(row?.kickoff_ms ?? row?.kickoffTs, null);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const text = row?.kickoff || row?.kickoffUtc || row?.date || row?.startTime || null;
  const parsed = text ? Date.parse(text) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function declaredDayOf(row, fallback = null) {
  return String(row?.dayKey || row?.__bucketDay || fallback || "").slice(0, 10) || null;
}

function operationalDayFromKickoff(row) {
  const text = row?.kickoff || row?.kickoffUtc || row?.date || row?.startTime || null;
  if (!text) return null;
  try {
    return athensDayFromKickoff(text);
  } catch {
    return null;
  }
}

function sourceFamily(matchId) {
  const id = String(matchId || "").toLowerCase();
  if (id.startsWith("espn_") || /^\d+$/.test(id)) return "espn";
  if (id.startsWith("sofa_")) return "sofascore";
  return "flashscore_or_native";
}

function pushExample(target, value, maxExamples) {
  if (target.length < maxExamples) target.push(value);
}

function pairIdentity(slug, homeTeam, awayTeam) {
  return `${slug}|${semanticTeamKey(slug, homeTeam)}|${semanticTeamKey(slug, awayTeam)}`;
}

function unorderedPairIdentity(slug, homeTeam, awayTeam) {
  const a = semanticTeamKey(slug, homeTeam);
  const b = semanticTeamKey(slug, awayTeam);
  return a <= b ? `${slug}|${a}|${b}` : `${slug}|${b}|${a}`;
}

function sameKickoffWindow(a, b) {
  const ta = kickoffMsOf(a);
  const tb = kickoffMsOf(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false;
  return Math.abs(ta - tb) <= KICKOFF_TOLERANCE_MS;
}

function clusterByKickoff(records) {
  const sorted = [...records].sort((a, b) => (kickoffMsOf(a) || 0) - (kickoffMsOf(b) || 0));
  const clusters = [];

  for (const row of sorted) {
    const ts = kickoffMsOf(row);
    let cluster = null;
    for (const candidate of clusters) {
      if (Number.isFinite(ts) && Math.abs(ts - candidate.anchorMs) <= KICKOFF_TOLERANCE_MS) {
        cluster = candidate;
        break;
      }
    }
    if (!cluster) {
      cluster = { anchorMs: ts, rows: [] };
      clusters.push(cluster);
    }
    cluster.rows.push(row);
  }

  return clusters;
}

function auditSemanticMatchRecords(records, { maxExamples = DEFAULT_MAX_EXAMPLES } = {}) {
  const byPair = new Map();
  const byUnorderedPair = new Map();

  for (const row of records) {
    const slug = String(row?.leagueSlug || "unknown");
    const oriented = pairIdentity(slug, row?.homeTeam, row?.awayTeam);
    const unordered = unorderedPairIdentity(slug, row?.homeTeam, row?.awayTeam);
    if (!byPair.has(oriented)) byPair.set(oriented, []);
    if (!byUnorderedPair.has(unordered)) byUnorderedPair.set(unordered, []);
    byPair.get(oriented).push(row);
    byUnorderedPair.get(unordered).push(row);
  }

  let duplicateGroups = 0;
  let duplicateExtraRecords = 0;
  let scoreConflictGroups = 0;
  let flippedOrientationGroups = 0;
  let crossOperationalDayGroups = 0;
  const examples = {
    semanticDuplicates: [],
    scoreConflicts: [],
    flippedOrientation: [],
    crossOperationalDay: []
  };

  for (const [pair, pairRows] of byPair) {
    for (const cluster of clusterByKickoff(pairRows)) {
      if (cluster.rows.length < 2) continue;
      const byScore = new Map();
      for (const row of cluster.rows) {
        const score = `${safeNum(row?.scoreHome)}|${safeNum(row?.scoreAway)}`;
        if (!byScore.has(score)) byScore.set(score, []);
        byScore.get(score).push(row);
      }

      if (byScore.size > 1) {
        scoreConflictGroups += 1;
        pushExample(examples.scoreConflicts, {
          pair,
          scores: [...byScore.entries()].map(([score, rows]) => ({
            score,
            rows: rows.map(compactRecord)
          }))
        }, maxExamples);
      }

      for (const [score, rows] of byScore) {
        if (rows.length < 2) continue;
        duplicateGroups += 1;
        duplicateExtraRecords += rows.length - 1;
        pushExample(examples.semanticDuplicates, {
          pair,
          score,
          rows: rows.map(compactRecord)
        }, maxExamples);

        const operationalDays = new Set(rows.map(operationalDayFromKickoff).filter(Boolean));
        const declaredDays = new Set(rows.map(row => declaredDayOf(row)).filter(Boolean));
        if (operationalDays.size > 1 || declaredDays.size > 1) {
          crossOperationalDayGroups += 1;
          pushExample(examples.crossOperationalDay, {
            pair,
            score,
            operationalDays: [...operationalDays],
            declaredDays: [...declaredDays],
            rows: rows.map(compactRecord)
          }, maxExamples);
        }
      }
    }
  }

  // Same unordered pair and kickoff window, but providers disagree about which
  // team was home. This is distinct from ordinary score disagreement.
  for (const [pair, pairRows] of byUnorderedPair) {
    for (const cluster of clusterByKickoff(pairRows)) {
      const orientations = new Set(cluster.rows.map(row => pairIdentity(
        String(row?.leagueSlug || "unknown"),
        row?.homeTeam,
        row?.awayTeam
      )));
      if (orientations.size <= 1) continue;
      flippedOrientationGroups += 1;
      pushExample(examples.flippedOrientation, {
        pair,
        rows: cluster.rows.map(compactRecord)
      }, maxExamples);
    }
  }

  return {
    duplicateGroups,
    duplicateExtraRecords,
    scoreConflictGroups,
    flippedOrientationGroups,
    crossOperationalDayGroups,
    examples
  };
}

function compactRecord(row) {
  return {
    id: String(row?.id || row?.matchId || "") || null,
    sourceFamily: sourceFamily(row?.id || row?.matchId),
    declaredDay: declaredDayOf(row),
    operationalDay: operationalDayFromKickoff(row),
    kickoff: row?.kickoff || row?.kickoffUtc || row?.date || null,
    homeTeam: row?.homeTeam || null,
    awayTeam: row?.awayTeam || null,
    scoreHome: safeNum(row?.scoreHome),
    scoreAway: safeNum(row?.scoreAway),
    container: row?.__container || null
  };
}

export function auditResultsMemoryPayload(slug, payload, options = {}) {
  const maxExamples = options.maxExamples || DEFAULT_MAX_EXAMPLES;
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const cutoffMs = nowMs - RESULTS_MAX_AGE_DAYS * 86400000;
  const teams = payload?.teams || {};
  const byId = new Map();

  let entryCount = 0;
  let expiredEntryCount = 0;
  let invalidEntryCount = 0;
  const examples = {
    invalidEntries: [],
    orphanMatchIds: [],
    mirrorConflicts: []
  };

  for (const [teamName, list] of Object.entries(teams)) {
    for (const entry of Array.isArray(list) ? list : []) {
      entryCount += 1;
      const id = String(entry?.matchId || "").trim();
      const dateMs = Date.parse(entry?.date || "");
      if (Number.isFinite(dateMs) && dateMs < cutoffMs) expiredEntryCount += 1;

      const valid = Boolean(
        id && teamName && entry?.opp
        && safeNum(entry?.gf) !== null
        && safeNum(entry?.ga) !== null
        && (entry?.ha === "H" || entry?.ha === "A")
      );
      if (!valid) {
        invalidEntryCount += 1;
        pushExample(examples.invalidEntries, { teamName, entry }, maxExamples);
        continue;
      }

      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push({ teamName, ...entry });
    }
  }

  let orphanMatchIdCount = 0;
  let multiSideMatchIdCount = 0;
  let mirrorConflictCount = 0;
  const records = [];

  for (const [matchId, sides] of byId) {
    if (sides.length === 1) {
      orphanMatchIdCount += 1;
      pushExample(examples.orphanMatchIds, { slug, matchId, side: sides[0] }, maxExamples);
    }
    if (sides.length > 2) multiSideMatchIdCount += 1;

    if (sides.length >= 2) {
      const home = sides.find(side => side.ha === "H") || sides[0];
      const away = sides.find(side => side.ha === "A") || sides[1];
      const mirrorOk = Boolean(
        home && away
        && semanticTeamKey(slug, home.teamName) === semanticTeamKey(slug, away.opp)
        && semanticTeamKey(slug, away.teamName) === semanticTeamKey(slug, home.opp)
        && safeNum(home.gf) === safeNum(away.ga)
        && safeNum(home.ga) === safeNum(away.gf)
      );
      if (!mirrorOk) {
        mirrorConflictCount += 1;
        pushExample(examples.mirrorConflicts, { slug, matchId, sides }, maxExamples);
      }
    }

    const chosen = sides.find(side => side.ha === "H") || sides[0];
    if (!chosen) continue;
    const isHome = chosen.ha === "H";
    records.push({
      id: matchId,
      matchId,
      leagueSlug: slug,
      dayKey: null,
      kickoff: chosen.date || null,
      homeTeam: isHome ? chosen.teamName : chosen.opp,
      awayTeam: isHome ? chosen.opp : chosen.teamName,
      scoreHome: isHome ? safeNum(chosen.gf) : safeNum(chosen.ga),
      scoreAway: isHome ? safeNum(chosen.ga) : safeNum(chosen.gf),
      __container: `${slug}.json`
    });
  }

  const semantic = auditSemanticMatchRecords(records, { maxExamples });
  return {
    slug,
    teamKeyCount: Object.keys(teams).length,
    entryCount,
    reconstructedMatchIdCount: byId.size,
    expiredEntryCount,
    invalidEntryCount,
    orphanMatchIdCount,
    multiSideMatchIdCount,
    mirrorConflictCount,
    semantic,
    examples
  };
}

function collectHistoryRows(payload, container) {
  if (Array.isArray(payload?.matches)) {
    return payload.matches.map(row => ({ ...row, __container: container }));
  }
  if (Array.isArray(payload?.days)) {
    return payload.days.flatMap(day => (Array.isArray(day?.rows) ? day.rows : []).map(row => ({
      ...row,
      __bucketDay: day?.dayKey || null,
      __container: container
    })));
  }
  if (Array.isArray(payload)) {
    return payload.map(row => ({ ...row, __container: container }));
  }
  return [];
}

export function auditHistoryRows(rows, options = {}) {
  const maxExamples = options.maxExamples || DEFAULT_MAX_EXAMPLES;
  let invalidRowCount = 0;
  let duplicateIdCount = 0;
  let selfPairCount = 0;
  let operationalDayMismatchCount = 0;
  const ids = new Map();
  const validRows = [];
  const examples = {
    invalidRows: [],
    duplicateIds: [],
    selfPairs: [],
    operationalDayMismatch: []
  };

  for (const row of rows || []) {
    const slug = String(row?.leagueSlug || "unknown");
    const homeTeam = String(row?.homeTeam || "").trim();
    const awayTeam = String(row?.awayTeam || "").trim();
    const scoreHome = safeNum(row?.scoreHome);
    const scoreAway = safeNum(row?.scoreAway);
    const kickoffMs = kickoffMsOf(row);

    if (!homeTeam || !awayTeam || scoreHome === null || scoreAway === null || !Number.isFinite(kickoffMs)) {
      invalidRowCount += 1;
      pushExample(examples.invalidRows, compactRecord(row), maxExamples);
      continue;
    }

    const id = String(row?.id || row?.matchId || "").trim();
    if (id) {
      const idKey = `${slug}|${id}`;
      if (ids.has(idKey)) {
        duplicateIdCount += 1;
        pushExample(examples.duplicateIds, {
          key: idKey,
          first: compactRecord(ids.get(idKey)),
          duplicate: compactRecord(row)
        }, maxExamples);
      } else {
        ids.set(idKey, row);
      }
    }

    if (semanticTeamKey(slug, homeTeam) === semanticTeamKey(slug, awayTeam)) {
      selfPairCount += 1;
      pushExample(examples.selfPairs, compactRecord(row), maxExamples);
    }

    const declaredDay = declaredDayOf(row);
    const operationalDay = operationalDayFromKickoff(row);
    if (declaredDay && operationalDay && declaredDay !== operationalDay) {
      operationalDayMismatchCount += 1;
      pushExample(examples.operationalDayMismatch, compactRecord(row), maxExamples);
    }

    validRows.push({
      ...row,
      scoreHome,
      scoreAway,
      kickoff_ms: kickoffMs
    });
  }

  return {
    rowCount: (rows || []).length,
    validRowCount: validRows.length,
    invalidRowCount,
    duplicateIdCount,
    selfPairCount,
    operationalDayMismatchCount,
    semantic: auditSemanticMatchRecords(validRows, { maxExamples }),
    examples
  };
}

export function auditH2HPayload(fileName, payload, options = {}) {
  const maxExamples = options.maxExamples || DEFAULT_MAX_EXAMPLES;
  const pair = canonicalH2HPairIdentity(payload?.teamA, payload?.teamB);
  const expectedFileName = pair.valid && pair.key ? `${pair.key}.json` : null;
  const actualFileName = path.basename(fileName);
  const degradedPairKey = !pair.valid || pair.degraded;
  const rows = (Array.isArray(payload?.matches) ? payload.matches : []).map(row => ({
    ...row,
    leagueSlug: row?.leagueSlug || "unknown",
    kickoff: row?.date || null,
    __container: actualFileName
  }));
  const historyAudit = auditHistoryRows(rows, { maxExamples });

  let storedPairMismatchCount = 0;
  const storedPairMismatch = [];
  const expectedUnordered = unorderedPairIdentity("", payload?.teamA, payload?.teamB);
  for (const row of rows) {
    if (unorderedPairIdentity("", row?.homeTeam, row?.awayTeam) !== expectedUnordered) {
      storedPairMismatchCount += 1;
      pushExample(storedPairMismatch, compactRecord(row), maxExamples);
    }
  }

  return {
    actualFileName,
    expectedFileName,
    nonCanonicalFileName: !expectedFileName || actualFileName !== expectedFileName,
    degradedPairKey,
    storedPairMismatchCount,
    historyAudit,
    examples: { storedPairMismatch }
  };
}

function sumSemantic(target, semantic) {
  target.duplicateGroups += semantic.duplicateGroups;
  target.duplicateExtraRecords += semantic.duplicateExtraRecords;
  target.scoreConflictGroups += semantic.scoreConflictGroups;
  target.flippedOrientationGroups += semantic.flippedOrientationGroups;
  target.crossOperationalDayGroups += semantic.crossOperationalDayGroups;
}

function makeSemanticSummary() {
  return {
    duplicateGroups: 0,
    duplicateExtraRecords: 0,
    scoreConflictGroups: 0,
    flippedOrientationGroups: 0,
    crossOperationalDayGroups: 0
  };
}

function auditResultsMemory(options) {
  const dir = resolveDataPath("league-memory", "results");
  const files = listJsonFiles(dir);
  const summary = {
    fileCount: 0,
    teamKeyCount: 0,
    entryCount: 0,
    reconstructedMatchIdCount: 0,
    expiredEntryCount: 0,
    invalidEntryCount: 0,
    orphanMatchIdCount: 0,
    multiSideMatchIdCount: 0,
    mirrorConflictCount: 0,
    semantic: makeSemanticSummary(),
    affectedLeagues: []
  };

  for (const file of files) {
    const slug = path.basename(file, ".json");
    const payload = readJsonSafe(file, null);
    if (!payload?.teams) continue;
    const report = auditResultsMemoryPayload(slug, payload, options);
    summary.fileCount += 1;
    for (const key of [
      "teamKeyCount", "entryCount", "reconstructedMatchIdCount",
      "expiredEntryCount", "invalidEntryCount", "orphanMatchIdCount",
      "multiSideMatchIdCount", "mirrorConflictCount"
    ]) summary[key] += report[key];
    sumSemantic(summary.semantic, report.semantic);

    const actionable = report.invalidEntryCount
      + report.orphanMatchIdCount
      + report.mirrorConflictCount
      + report.semantic.duplicateGroups
      + report.semantic.scoreConflictGroups
      + report.semantic.flippedOrientationGroups;
    if (actionable > 0) {
      summary.affectedLeagues.push({
        slug,
        actionable,
        expiredEntryCount: report.expiredEntryCount,
        invalidEntryCount: report.invalidEntryCount,
        orphanMatchIdCount: report.orphanMatchIdCount,
        mirrorConflictCount: report.mirrorConflictCount,
        semantic: report.semantic,
        examples: report.examples
      });
    }
  }

  summary.affectedLeagues.sort((a, b) => b.actionable - a.actionable || a.slug.localeCompare(b.slug));
  return summary;
}

function auditHistoryCollection(rootDir, kind, options) {
  const files = [];
  if (kind === "history-archive") {
    try {
      for (const child of fs.readdirSync(rootDir).sort()) {
        const childPath = path.join(rootDir, child);
        if (fs.statSync(childPath).isDirectory()) files.push(...listJsonFiles(childPath));
      }
    } catch { /* empty */ }
  } else {
    files.push(...listJsonFiles(rootDir).filter(file => !file.endsWith(".report.json")));
  }

  const rows = [];
  for (const file of files) {
    const payload = readJsonSafe(file, null);
    rows.push(...collectHistoryRows(payload, path.relative(resolveDataPath(), file)));
  }

  return {
    kind,
    fileCount: files.length,
    ...auditHistoryRows(rows, options)
  };
}

function auditH2HCollection(options) {
  const files = listJsonFiles(resolveDataPath("h2h"));
  const summary = {
    fileCount: 0,
    matchCount: 0,
    nonCanonicalFileNameCount: 0,
    degradedPairKeyCount: 0,
    storedPairMismatchCount: 0,
    duplicateIdCount: 0,
    semantic: makeSemanticSummary(),
    examples: {
      nonCanonicalFileNames: [],
      degradedPairKeys: [],
      storedPairMismatch: []
    }
  };

  for (const file of files) {
    const payload = readJsonSafe(file, null);
    if (!payload) continue;
    const report = auditH2HPayload(file, payload, options);
    summary.fileCount += 1;
    summary.matchCount += report.historyAudit.rowCount;
    summary.duplicateIdCount += report.historyAudit.duplicateIdCount;
    sumSemantic(summary.semantic, report.historyAudit.semantic);

    if (report.nonCanonicalFileName) {
      summary.nonCanonicalFileNameCount += 1;
      pushExample(summary.examples.nonCanonicalFileNames, {
        actual: report.actualFileName,
        expected: report.expectedFileName
      }, options.maxExamples);
    }
    if (report.degradedPairKey) {
      summary.degradedPairKeyCount += 1;
      pushExample(summary.examples.degradedPairKeys, {
        actual: report.actualFileName,
        expected: report.expectedFileName,
        teamA: payload?.teamA || null,
        teamB: payload?.teamB || null
      }, options.maxExamples);
    }
    if (report.storedPairMismatchCount) {
      summary.storedPairMismatchCount += report.storedPairMismatchCount;
      for (const row of report.examples.storedPairMismatch) {
        pushExample(summary.examples.storedPairMismatch, row, options.maxExamples);
      }
    }
  }

  return summary;
}

function issue(type, severity, count, detail = null) {
  return { type, severity, count, detail };
}

export function buildSemanticHistoryAudit(options = {}) {
  const maxExamples = Number(options.maxExamples) > 0
    ? Number(options.maxExamples)
    : DEFAULT_MAX_EXAMPLES;
  const shared = { maxExamples, nowMs: options.nowMs };

  const resultsMemory = auditResultsMemory(shared);
  const historyArchive = auditHistoryCollection(
    resolveDataPath("history-archive"),
    "history-archive",
    shared
  );
  const currentHistory = auditHistoryCollection(
    resolveDataPath("history"),
    "current-history",
    shared
  );
  const h2h = auditH2HCollection(shared);

  const issues = [
    issue("results_invalid_entries", "error", resultsMemory.invalidEntryCount),
    issue("results_mirror_conflicts", "error", resultsMemory.mirrorConflictCount),
    issue("results_score_conflicts", "error", resultsMemory.semantic.scoreConflictGroups),
    issue("history_archive_invalid_rows", "error", historyArchive.invalidRowCount),
    issue("history_archive_score_conflicts", "error", historyArchive.semantic.scoreConflictGroups),
    issue("current_history_invalid_rows", "error", currentHistory.invalidRowCount),
    issue("current_history_score_conflicts", "error", currentHistory.semantic.scoreConflictGroups),
    issue("current_history_self_pairs", "error", currentHistory.selfPairCount),
    issue("h2h_stored_pair_mismatch", "error", h2h.storedPairMismatchCount),

    issue("results_orphan_match_ids", "warning", resultsMemory.orphanMatchIdCount),
    issue("results_semantic_duplicates", "warning", resultsMemory.semantic.duplicateGroups),
    issue("results_flipped_orientation", "warning", resultsMemory.semantic.flippedOrientationGroups),
    issue("history_archive_semantic_duplicates", "warning", historyArchive.semantic.duplicateGroups),
    issue("history_archive_duplicate_ids", "warning", historyArchive.duplicateIdCount),
    issue("current_history_semantic_duplicates", "warning", currentHistory.semantic.duplicateGroups),
    issue("current_history_duplicate_ids", "warning", currentHistory.duplicateIdCount),
    issue("current_history_operational_day_mismatch", "warning", currentHistory.operationalDayMismatchCount),
    issue("h2h_noncanonical_filenames", "warning", h2h.nonCanonicalFileNameCount),
    issue("h2h_degraded_pair_keys", "warning", h2h.degradedPairKeyCount),
    issue("h2h_semantic_duplicates", "warning", h2h.semantic.duplicateGroups),

    issue("results_expired_entries", "info", resultsMemory.expiredEntryCount,
      "Age-expired rows are reported separately and are not treated as duplicates.")
  ].filter(item => item.count > 0);

  const issueCounts = issues.reduce((acc, item) => {
    acc[item.severity] += 1;
    return acc;
  }, { error: 0, warning: 0, info: 0 });

  return {
    ok: issueCounts.error === 0,
    clean: issueCounts.error === 0 && issueCounts.warning === 0,
    schema: "ai-matchlab.history-semantic-integrity.v1",
    generatedAt: new Date().toISOString(),
    sourceContract: {
      readOnlyTruthLayers: true,
      truthWrites: 0,
      reportWriteOnly: true,
      timezone: "Europe/Athens",
      kickoffToleranceHours: KICKOFF_TOLERANCE_MS / 3600000,
      resultsMaxAgeDays: RESULTS_MAX_AGE_DAYS
    },
    issueCounts,
    issues,
    resultsMemory,
    historyArchive,
    currentHistory,
    h2h
  };
}

function parseArgs(argv) {
  const out = { write: false, output: null, maxExamples: DEFAULT_MAX_EXAMPLES };
  for (const arg of argv) {
    if (arg === "--write") out.write = true;
    else if (arg.startsWith("--output=")) out.output = arg.slice("--output=".length);
    else if (arg.startsWith("--max-examples=")) out.maxExamples = Number(arg.slice("--max-examples=".length));
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function usage() {
  return [
    "Usage:",
    "  node engine-v1/jobs/audit-history-semantic-integrity.js",
    "  node engine-v1/jobs/audit-history-semantic-integrity.js --write",
    "  node engine-v1/jobs/audit-history-semantic-integrity.js --output=data/history-integrity/custom.json",
    "",
    "Guarantee: truthWrites=0. --write writes only the report artifact."
  ].join("\n");
}

function compactCliSummary(report, outputPath = null) {
  return {
    ok: report.ok,
    clean: report.clean,
    schema: report.schema,
    generatedAt: report.generatedAt,
    outputPath,
    issueCounts: report.issueCounts,
    issues: report.issues,
    counts: {
      resultsMemory: {
        files: report.resultsMemory.fileCount,
        entries: report.resultsMemory.entryCount,
        expiredEntries: report.resultsMemory.expiredEntryCount,
        orphanMatchIds: report.resultsMemory.orphanMatchIdCount,
        semanticDuplicateGroups: report.resultsMemory.semantic.duplicateGroups,
        scoreConflictGroups: report.resultsMemory.semantic.scoreConflictGroups
      },
      historyArchive: {
        files: report.historyArchive.fileCount,
        rows: report.historyArchive.rowCount,
        semanticDuplicateGroups: report.historyArchive.semantic.duplicateGroups,
        scoreConflictGroups: report.historyArchive.semantic.scoreConflictGroups
      },
      currentHistory: {
        files: report.currentHistory.fileCount,
        rows: report.currentHistory.rowCount,
        duplicateIds: report.currentHistory.duplicateIdCount,
        semanticDuplicateGroups: report.currentHistory.semantic.duplicateGroups,
        scoreConflictGroups: report.currentHistory.semantic.scoreConflictGroups,
        operationalDayMismatches: report.currentHistory.operationalDayMismatchCount
      },
      h2h: {
        files: report.h2h.fileCount,
        matches: report.h2h.matchCount,
        degradedPairKeys: report.h2h.degradedPairKeyCount,
        semanticDuplicateGroups: report.h2h.semantic.duplicateGroups
      }
    },
    guarantees: { truthWrites: 0 }
  };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isCli) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }

  const report = buildSemanticHistoryAudit(args);
  let outputPath = null;
  if (args.write || args.output) {
    outputPath = args.output
      ? path.resolve(args.output)
      : resolveDataPath("history-integrity", "semantic-latest.json");
    ensureDir(path.dirname(outputPath));
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  console.log(JSON.stringify(compactCliSummary(report, outputPath), null, 2));
  process.exit(report.ok ? 0 : 2);
}
