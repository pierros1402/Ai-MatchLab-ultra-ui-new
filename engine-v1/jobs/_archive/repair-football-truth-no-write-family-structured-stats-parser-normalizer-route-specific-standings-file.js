#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const EXPECTED_SLUGS = ["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"];
const REPAIR_SLUGS = ["esp.1", "esp.2", "swe.1", "swe.2"];

const DEFAULTS = {
  date: "2026-06-14",
  parserInput: "data/football-truth/_diagnostics/no-write-family-structured-stats-parser-normalizer-2026-06-14/no-write-family-structured-stats-parser-normalizer-2026-06-14.json",
  repairInput: "data/football-truth/_diagnostics/no-write-family-standings-parser-repair-inspector-2026-06-14/no-write-family-standings-parser-repair-inspector-2026-06-14.json",
  snapshotInput: "data/football-truth/_diagnostics/final-explicit-scoped-controlled-route-acquisition-run-2026-06-14/final-explicit-scoped-controlled-route-acquisition-run-2026-06-14.json",
  output: "data/football-truth/_diagnostics/no-write-family-structured-stats-parser-normalizer-route-specific-standings-repair-2026-06-14/no-write-family-structured-stats-parser-normalizer-route-specific-standings-repair-2026-06-14.json"
};

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--parser-input") args.parserInput = argv[++i];
    else if (arg === "--repair-input") args.repairInput = argv[++i];
    else if (arg === "--snapshot-input") args.snapshotInput = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error("Unknown argument: " + arg);
  }
  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error("Missing JSON input: " + filePath);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function uniqueSorted(values) {
  return [...new Set(values.filter((v) => v !== null && v !== undefined).map((v) => String(v).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value = row[key] === null || row[key] === undefined || String(row[key]).trim() === "" ? "__missing__" : String(row[key]).trim();
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function assertSummary(summary, key, expected) {
  if (!(key in summary)) throw new Error("Missing summary key: " + key);
  if (summary[key] !== expected) throw new Error("Guardrail failed for " + key + ": expected " + expected + ", got " + summary[key]);
}

function validateParserRun(input) {
  const s = input.summary || {};
  assertSummary(s, "familyStructuredStatsParserNormalizerCompetitionCount", 6);
  assertSummary(s, "familyStructuredStatsParserNormalizerReadyCount", 2);
  assertSummary(s, "familyStructuredStatsParserNormalizerNeedsRepairCount", 4);
  assertSummary(s, "rowLevelStandingRowsExtractedCompetitionCount", 2);
  assertSummary(s, "rowLevelFixtureResultRowsExtractedCompetitionCount", 4);
  assertSummary(s, "qualityGateReadyForClassifierCount", 0);
  assertSummary(s, "qualityGateReadyForCanonicalWriteCount", 0);
  assertSummary(s, "qualityGateReadyForTruthAssertionCount", 0);
  assertSummary(s, "fetchExecutedNowCount", 0);
  assertSummary(s, "searchExecutedNowCount", 0);
  assertSummary(s, "broadSearchExecutedNowCount", 0);
  assertSummary(s, "classifierExecutedNowCount", 0);
  assertSummary(s, "canonicalWriteExecutedNowCount", 0);
  assertSummary(s, "productionWriteExecutedNowCount", 0);
  assertSummary(s, "activeAssertedCount", 0);
  assertSummary(s, "inactiveAssertedCount", 0);
  assertSummary(s, "completedAssertedCount", 0);
  assertSummary(s, "seasonStateTruthAssertedCount", 0);
  assertSummary(s, "rowLevelStatsExtractionTruthCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  assertSummary(s, "productionWrite", false);

  const rows = Array.isArray(input.parserRows) ? input.parserRows : [];
  if (rows.length !== 6) throw new Error("Expected 6 parserRows.");
  return rows;
}

function validateRepairInspector(input) {
  const s = input.summary || {};
  assertSummary(s, "standingsParserRepairInspectorCompetitionCount", 4);
  assertSummary(s, "repairTargetCompetitionCount", 4);
  assertSummary(s, "laligaRepairTargetCount", 2);
  assertSummary(s, "sportomediaRepairTargetCount", 2);
  assertSummary(s, "officialStandingsSnapshotAvailableCount", 4);
  assertSummary(s, "readyToRepairParserSourceCount", 4);
  assertSummary(s, "fetchExecutedNowCount", 0);
  assertSummary(s, "searchExecutedNowCount", 0);
  assertSummary(s, "broadSearchExecutedNowCount", 0);
  assertSummary(s, "classifierExecutedNowCount", 0);
  assertSummary(s, "canonicalWriteExecutedNowCount", 0);
  assertSummary(s, "productionWriteExecutedNowCount", 0);
  assertSummary(s, "seasonStateTruthAssertedCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  assertSummary(s, "productionWrite", false);

  const rows = Array.isArray(input.repairRows) ? input.repairRows : [];
  if (rows.length !== 4) throw new Error("Expected 4 repairRows.");
  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(REPAIR_SLUGS)) {
    throw new Error("Unexpected repair slugs: " + slugs.join(", "));
  }
  return rows;
}

function validateSnapshots(input) {
  const s = input.summary || {};
  assertSummary(s, "finalScopedControlledRouteAcquisitionRunCompetitionCount", 6);
  assertSummary(s, "finalScopedControlledRouteAcquisitionRunTargetCount", 18);
  assertSummary(s, "fetchedSourceSnapshotCount", 18);
  assertSummary(s, "fetchedOkSnapshotCount", 18);
  assertSummary(s, "searchExecutedCount", 0);
  assertSummary(s, "broadSearchExecutedCount", 0);
  assertSummary(s, "classifierExecutedCount", 0);
  assertSummary(s, "canonicalWriteExecutedCount", 0);
  assertSummary(s, "productionWriteExecutedCount", 0);
  assertSummary(s, "seasonStateTruthAssertedCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  assertSummary(s, "productionWrite", false);

  const rows = Array.isArray(input.fetchedSourceSnapshots) ? input.fetchedSourceSnapshots : [];
  if (rows.length !== 18) throw new Error("Expected 18 fetchedSourceSnapshots.");

  for (const row of rows) {
    if (row.fetchStatus !== "fetched_ok" || row.status !== 200 || row.ok !== true) {
      throw new Error(row.competitionSlug + " " + row.routeKind + ": snapshot must be fetched_ok HTTP 200.");
    }
  }

  return rows;
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&ntilde;/gi, "ñ")
    .replace(/&aring;/gi, "å")
    .replace(/&auml;/gi, "ä")
    .replace(/&ouml;/gi, "ö")
    .replace(/&Aacute;/g, "Á")
    .replace(/&Eacute;/g, "É")
    .replace(/&Iacute;/g, "Í")
    .replace(/&Oacute;/g, "Ó")
    .replace(/&Uacute;/g, "Ú")
    .replace(/&Ntilde;/g, "Ñ")
    .replace(/&Aring;/g, "Å")
    .replace(/&Auml;/g, "Ä")
    .replace(/&Ouml;/g, "Ö");
}

function htmlToLines(raw) {
  return decodeEntities(raw)
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<(?:tr|li|article|section|div|p|span|td|th|br)\b[^>]*>/gi, "\n")
    .replace(/<\/(?:tr|li|article|section|div|p|span|td|th)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function stripHtml(raw) {
  return decodeEntities(raw)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getRaw(snapshot) {
  return String(snapshot.rawText || snapshot.text || snapshot.body || snapshot.textPreview || "");
}

function isBadTeamName(value) {
  return /^(pos|position|rank|team|club|equipo|lag|played|points|pts|p|j|g|e|d|v|o|f|gf|ga|gd|dg|form|last|next|home|away|total|all)$/i.test(String(value).trim());
}

function cleanTeamName(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^[\.\-\–\|\:\s]+/, "")
    .replace(/[\.\-\–\|\:\s]+$/, "")
    .trim();
}

function dedupeRows(rows) {
  const seen = new Set();
  const out = [];

  for (const row of rows) {
    const key = [
      row.competitionSlug,
      row.teamName,
      row.positionCandidate ?? "",
      row.pointsCandidate ?? "",
      row.playedCandidate ?? ""
    ].join("|").toLowerCase();

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out.slice(0, 80);
}

function parseNumericTextStandings({ raw, meta, parser }) {
  const textLines = htmlToLines(raw);
  const joinedLines = [];

  for (let i = 0; i < textLines.length; i += 1) {
    joinedLines.push(textLines[i]);
    if (i + 1 < textLines.length) joinedLines.push(textLines[i] + " " + textLines[i + 1]);
    if (i + 2 < textLines.length) joinedLines.push(textLines[i] + " " + textLines[i + 1] + " " + textLines[i + 2]);
  }

  const rows = [];
  const rowPatterns = [
    /(?:^|\s)(?<position>[1-9]|[12][0-9])\s+(?<team>[A-Za-zÀ-ÖØ-öø-ÿÅÄÖåäöÑñ0-9\.\'\- ]{2,64}?)\s+(?<played>\d{1,2})\s+(?<wins>\d{1,2})\s+(?<draws>\d{1,2})\s+(?<losses>\d{1,2})\s+(?<gf>\d{1,3})\s+(?<ga>\d{1,3})\s+(?<gd>[+-]?\d{1,3})\s+(?<points>\d{1,3})(?:\s|$)/g,
    /(?<team>[A-Za-zÀ-ÖØ-öø-ÿÅÄÖåäöÑñ0-9\.\'\- ]{2,64}?)\s+(?<played>\d{1,2})\s+(?<wins>\d{1,2})\s+(?<draws>\d{1,2})\s+(?<losses>\d{1,2})\s+(?<gf>\d{1,3})\s+(?<ga>\d{1,3})\s+(?<gd>[+-]?\d{1,3})\s+(?<points>\d{1,3})(?:\s|$)/g,
    /(?:^|\s)(?<position>[1-9]|[12][0-9])\s+(?<team>[A-Za-zÀ-ÖØ-öø-ÿÅÄÖåäöÑñ0-9\.\'\- ]{2,64}?)\s+(?<played>\d{1,2})\s+(?<wins>\d{1,2})\s+(?<draws>\d{1,2})\s+(?<losses>\d{1,2})\s+(?<points>\d{1,3})(?:\s|$)/g
  ];

  for (const line of joinedLines) {
    for (const pattern of rowPatterns) {
      let match;
      const re = new RegExp(pattern.source, pattern.flags);
      while ((match = re.exec(line)) !== null) {
        const groups = match.groups || {};
        const teamName = cleanTeamName(groups.team);
        if (!teamName || isBadTeamName(teamName) || teamName.length > 70) continue;

        const played = Number(groups.played);
        const points = Number(groups.points);
        if (!Number.isFinite(played) || !Number.isFinite(points)) continue;
        if (played < 0 || played > 60 || points < 0 || points > 160) continue;

        rows.push({
          parser,
          competitionSlug: meta.competitionSlug,
          reusableFamily: meta.reusableFamily,
          routeKind: meta.routeKind,
          sourceUrl: meta.sourceUrl,
          finalUrl: meta.finalUrl,
          teamName,
          positionCandidate: groups.position ? Number(groups.position) : null,
          playedCandidate: played,
          winsCandidate: groups.wins !== undefined ? Number(groups.wins) : null,
          drawsCandidate: groups.draws !== undefined ? Number(groups.draws) : null,
          lossesCandidate: groups.losses !== undefined ? Number(groups.losses) : null,
          goalsForCandidate: groups.gf !== undefined ? Number(groups.gf) : null,
          goalsAgainstCandidate: groups.ga !== undefined ? Number(groups.ga) : null,
          goalDifferenceCandidate: groups.gd !== undefined ? Number(groups.gd) : null,
          pointsCandidate: points,
          rawLine: line.slice(0, 260),
          normalizedRowIsTruth: false
        });
      }
    }
  }

  return dedupeRows(rows);
}

function parseEmbeddedJsonObjects(raw) {
  const jsonBodies = [];
  const scripts = [];
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch;

  while ((scriptMatch = scriptRegex.exec(String(raw || ""))) !== null && scripts.length < 120) {
    scripts.push(String(scriptMatch[1] || "").trim());
  }

  const candidates = [String(raw || ""), ...scripts];

  for (const candidate of candidates) {
    const text = candidate.trim();
    if (!text) continue;

    const firstObj = text.indexOf("{");
    const lastObj = text.lastIndexOf("}");
    if (firstObj >= 0 && lastObj > firstObj) jsonBodies.push(text.slice(firstObj, lastObj + 1));

    const firstArr = text.indexOf("[");
    const lastArr = text.lastIndexOf("]");
    if (firstArr >= 0 && lastArr > firstArr) jsonBodies.push(text.slice(firstArr, lastArr + 1));
  }

  const parsed = [];
  for (const body of jsonBodies.slice(0, 160)) {
    try {
      parsed.push(JSON.parse(body));
    } catch {
      // Keep conservative; failed hydration parse is not absence.
    }
  }

  return parsed;
}

function objectName(value) {
  if (!value || typeof value !== "object") return null;
  return value.name || value.fullName || value.shortName || value.displayName || value.teamName || value.clubName || value.title || value.abbreviation || null;
}

function lowerObject(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj || {})) out[String(key).toLowerCase()] = value;
  return out;
}

function collectStandingJsonRows(value, meta, out = [], depth = 0) {
  if (out.length >= 200 || depth > 16 || value === null || value === undefined) return out;

  if (Array.isArray(value)) {
    for (const item of value) collectStandingJsonRows(item, meta, out, depth + 1);
    return out;
  }

  if (typeof value !== "object") return out;

  const keys = lowerObject(value);
  const keyNames = Object.keys(keys).join(" ");

  const teamName =
    objectName(value) ||
    objectName(value.team) ||
    objectName(value.club) ||
    objectName(value.competitor) ||
    objectName(value.participant) ||
    objectName(value.contestant) ||
    objectName(value.squad);

  const stats =
    value.stats ||
    value.statistics ||
    value.standing ||
    value.standings ||
    value.table ||
    value.record ||
    value.total ||
    value.overall ||
    value;

  const statKeys = lowerObject(stats);

  const points = statKeys.points ?? statKeys.pts ?? statKeys.poäng ?? statKeys.poang ?? keys.points ?? keys.pts;
  const played = statKeys.played ?? statKeys.matchesplayed ?? statKeys.gamesplayed ?? statKeys.p ?? statKeys.spelade ?? keys.played;
  const position = statKeys.position ?? statKeys.rank ?? statKeys.pos ?? keys.position ?? keys.rank;
  const wins = statKeys.wins ?? statKeys.w ?? statKeys.won ?? statKeys.vunna ?? keys.wins;
  const draws = statKeys.draws ?? statKeys.d ?? statKeys.oavgjorda ?? keys.draws;
  const losses = statKeys.losses ?? statKeys.l ?? statKeys.lost ?? statKeys.förlorade ?? statKeys.forlorade ?? keys.losses;
  const goalsFor = statKeys.goalsfor ?? statKeys.gf ?? statKeys.scored ?? statKeys.goals_for ?? keys.goalsfor;
  const goalsAgainst = statKeys.goalsagainst ?? statKeys.ga ?? statKeys.conceded ?? statKeys.goals_against ?? keys.goalsagainst;
  const goalDifference = statKeys.goaldifference ?? statKeys.gd ?? statKeys.diff ?? statKeys.målskillnad ?? statKeys.malskillnad ?? keys.goaldifference;

  const hasStandingKeys = /(standing|standings|table|rank|position|points|pts|played|wins|draws|losses|poang|poäng|spelade)/i.test(keyNames);

  if (teamName && hasStandingKeys && (points !== undefined || played !== undefined || position !== undefined)) {
    out.push({
      parser: meta.parser,
      competitionSlug: meta.competitionSlug,
      reusableFamily: meta.reusableFamily,
      routeKind: meta.routeKind,
      sourceUrl: meta.sourceUrl,
      finalUrl: meta.finalUrl,
      teamName: String(teamName),
      positionCandidate: position ?? null,
      playedCandidate: played ?? null,
      winsCandidate: wins ?? null,
      drawsCandidate: draws ?? null,
      lossesCandidate: losses ?? null,
      goalsForCandidate: goalsFor ?? null,
      goalsAgainstCandidate: goalsAgainst ?? null,
      goalDifferenceCandidate: goalDifference ?? null,
      pointsCandidate: points ?? null,
      normalizedRowIsTruth: false
    });
  }

  for (const child of Object.values(value)) {
    if (child && typeof child === "object") collectStandingJsonRows(child, meta, out, depth + 1);
  }

  return out;
}

function parseSportomediaGraphqlStandings({ raw, meta }) {
  const parsedBodies = parseEmbeddedJsonObjects(raw);
  const rows = [];

  for (const parsed of parsedBodies) {
    collectStandingJsonRows(parsed, { ...meta, parser: "sportomedia_graphql_hydration_standings_parser" }, rows);
  }

  if (rows.length > 0) return dedupeRows(rows);

  return parseNumericTextStandings({
    raw,
    meta,
    parser: "sportomedia_swedish_text_window_standings_parser_fallback"
  });
}

function parseLaligaTextWindowStandings({ raw, meta }) {
  const rows = parseNumericTextStandings({
    raw,
    meta,
    parser: "laliga_span_div_text_window_standings_parser"
  });

  if (rows.length > 0) return rows;

  const text = stripHtml(raw);
  const fallbackRows = [];
  const knownWindowRegex = /(?:Clasificaci[oó]n|Puntos|PTS|Equipo|J|G|E|P)[\s\S]{0,12000}/gi;
  let match;
  while ((match = knownWindowRegex.exec(text)) !== null && fallbackRows.length < 80) {
    fallbackRows.push(...parseNumericTextStandings({
      raw: match[0],
      meta,
      parser: "laliga_span_div_text_window_standings_parser_keyword_window"
    }));
  }

  return dedupeRows(fallbackRows);
}

function groupBySlug(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.competitionSlug)) map.set(row.competitionSlug, []);
    map.get(row.competitionSlug).push(row);
  }
  return map;
}

function buildRepairedRow({ parserRow, snapshots }) {
  const standingsSnapshot = snapshots.find((row) => row.routeKind === "official_standings");
  if (!standingsSnapshot) throw new Error(parserRow.competitionSlug + ": missing official_standings snapshot.");

  const meta = {
    competitionSlug: parserRow.competitionSlug,
    reusableFamily: parserRow.reusableFamily,
    routeKind: standingsSnapshot.routeKind,
    sourceUrl: standingsSnapshot.sourceUrl,
    finalUrl: standingsSnapshot.finalUrl
  };

  const raw = getRaw(standingsSnapshot);

  let repairedStandingRows = [];
  let routeSpecificParserUsed = null;

  if (parserRow.reusableFamily === "laliga") {
    routeSpecificParserUsed = "laliga_span_div_text_window_standings_parser";
    repairedStandingRows = parseLaligaTextWindowStandings({ raw, meta });
  } else if (parserRow.reusableFamily === "sportomedia") {
    routeSpecificParserUsed = "sportomedia_graphql_hydration_standings_parser";
    repairedStandingRows = parseSportomediaGraphqlStandings({ raw, meta });
  } else {
    routeSpecificParserUsed = "not_needed";
    repairedStandingRows = parserRow.standingRowCandidateSamples || [];
  }

  const existingStandingRows = Array.isArray(parserRow.standingRowCandidateSamples) ? parserRow.standingRowCandidateSamples : [];
  const existingFixtureRows = Array.isArray(parserRow.fixtureResultRowCandidateSamples) ? parserRow.fixtureResultRowCandidateSamples : [];

  const standingRows =
    existingStandingRows.length > 0
      ? existingStandingRows
      : repairedStandingRows;

  const fixtureRows = existingFixtureRows;

  const status =
    standingRows.length > 0 && fixtureRows.length > 0
      ? "ready_for_no_write_repaired_family_parser_quality_gate"
      : "still_needs_parser_repair_or_fixture_normalization";

  const blockingReasons = [];
  if (standingRows.length === 0) blockingReasons.push("standing_rows_still_missing_after_route_specific_repair");
  if (fixtureRows.length === 0) blockingReasons.push("fixture_result_rows_missing_after_repair");

  return {
    competitionSlug: parserRow.competitionSlug,
    reusableFamily: parserRow.reusableFamily,
    repairedParserNormalizerStatus: status,
    blockingReasons,

    routeSpecificParserUsed,
    standingRowCandidateCountBeforeRepair: parserRow.standingRowCandidateCount,
    standingRowCandidateCountAfterRepair: standingRows.length,
    fixtureResultRowCandidateCountAfterRepair: fixtureRows.length,

    standingRowCandidateSamples: standingRows.slice(0, 20),
    fixtureResultRowCandidateSamples: fixtureRows.slice(0, 20),

    rowLevelStatsExtractionCompleteCandidate: standingRows.length > 0 && fixtureRows.length > 0,
    rowLevelStatsExtractionTruth: false,

    qualityGateReadyForClassifier: false,
    qualityGateReadyForCanonicalWrite: false,
    qualityGateReadyForTruthAssertion: false,

    fetchExecutedNow: false,
    searchExecutedNow: false,
    broadSearchExecutedNow: false,
    classifierExecutedNow: false,
    canonicalWriteExecutedNow: false,
    productionWriteExecutedNow: false,
    activeAssertedNow: false,
    inactiveAssertedNow: false,
    completedAssertedNow: false,
    seasonStateTruthAssertedNow: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    repairedRowsAreTruth: false,
    noMatchTodayDoesNotImplyInactive: true,
    zeroResultDoesNotImplyAbsence: true,
    missingRowCandidatesDoNotProveAbsence: true,

    nextAllowedStep:
      status === "ready_for_no_write_repaired_family_parser_quality_gate"
        ? "run_no_write_repaired_family_structured_stats_parser_normalizer_quality_gate"
        : "repair_remaining_family_specific_parser_gap",
    nextBlockedStep: "season_state_classifier_canonical_write_and_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);

  const parserRun = readJson(args.parserInput);
  const parserRows = validateParserRun(parserRun);

  const repairInspector = readJson(args.repairInput);
  validateRepairInspector(repairInspector);

  const snapshotRun = readJson(args.snapshotInput);
  const snapshots = validateSnapshots(snapshotRun);
  const snapshotsBySlug = groupBySlug(snapshots);

  const slugs = uniqueSorted(parserRows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected parser slugs: " + slugs.join(", "));
  }

  const repairedRows = parserRows
    .map((parserRow) => buildRepairedRow({
      parserRow,
      snapshots: snapshotsBySlug.get(parserRow.competitionSlug) || []
    }))
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const readyRows = repairedRows.filter((row) => row.repairedParserNormalizerStatus === "ready_for_no_write_repaired_family_parser_quality_gate");
  const stillRepairRows = repairedRows.filter((row) => row.repairedParserNormalizerStatus !== "ready_for_no_write_repaired_family_parser_quality_gate");
  const repairedTargetRows = repairedRows.filter((row) => REPAIR_SLUGS.includes(row.competitionSlug));

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "repair-football-truth-no-write-family-structured-stats-parser-normalizer-route-specific-standings-file",
    mode: "repair_no_write_family_structured_stats_parser_normalizer_route_specific_standings_no_fetch_no_search_no_classifier_no_truth_assertion_no_write",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      familyStructuredStatsParserNormalizer: args.parserInput,
      standingsParserRepairInspector: args.repairInput,
      finalScopedControlledRouteAcquisitionRun: args.snapshotInput
    },
    summary: {
      routeSpecificStandingsRepairCompetitionCount: repairedRows.length,
      routeSpecificStandingsRepairReadyCount: readyRows.length,
      routeSpecificStandingsRepairStillNeedsRepairCount: stillRepairRows.length,

      routeSpecificRepairTargetCompetitionCount: repairedTargetRows.length,
      routeSpecificRepairTargetRowsExtractedCount: repairedTargetRows.filter((row) => row.standingRowCandidateCountAfterRepair > 0).length,
      laligaRouteSpecificRepairTargetCount: repairedTargetRows.filter((row) => row.reusableFamily === "laliga").length,
      sportomediaRouteSpecificRepairTargetCount: repairedTargetRows.filter((row) => row.reusableFamily === "sportomedia").length,

      rowLevelStandingRowsExtractedCompetitionCount: repairedRows.filter((row) => row.standingRowCandidateCountAfterRepair > 0).length,
      rowLevelFixtureResultRowsExtractedCompetitionCount: repairedRows.filter((row) => row.fixtureResultRowCandidateCountAfterRepair > 0).length,
      rowLevelStatsExtractionCompleteCandidateCompetitionCount: repairedRows.filter((row) => row.rowLevelStatsExtractionCompleteCandidate).length,

      totalStandingRowCandidateCountAfterRepair: repairedRows.reduce((sum, row) => sum + row.standingRowCandidateCountAfterRepair, 0),
      totalFixtureResultRowCandidateCountAfterRepair: repairedRows.reduce((sum, row) => sum + row.fixtureResultRowCandidateCountAfterRepair, 0),

      qualityGateReadyForClassifierCount: 0,
      qualityGateReadyForCanonicalWriteCount: 0,
      qualityGateReadyForTruthAssertionCount: 0,

      fetchExecutedNowCount: 0,
      searchExecutedNowCount: 0,
      broadSearchExecutedNowCount: 0,
      classifierExecutedNowCount: 0,
      canonicalWriteExecutedNowCount: 0,
      productionWriteExecutedNowCount: 0,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      seasonStateTruthAssertedCount: 0,
      rowLevelStatsExtractionTruthCount: 0,
      repairedRowsTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        stillRepairRows.length === 0
          ? "run_no_write_repaired_family_structured_stats_parser_normalizer_quality_gate"
          : "repair_remaining_family_specific_parser_gap"
    },
    counts: {
      byReusableFamily: countBy(repairedRows, "reusableFamily"),
      byRepairedParserNormalizerStatus: countBy(repairedRows, "repairedParserNormalizerStatus"),
      byRouteSpecificParserUsed: countBy(repairedRows, "routeSpecificParserUsed"),
      byNextAllowedStep: countBy(repairedRows, "nextAllowedStep")
    },
    guardrails: [
      "This repair reads already-acquired official standings snapshots only.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not classify season state.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Repaired row candidates are not truth assertions.",
      "Missing row candidates does not prove absence.",
      "No match today must not imply inactive.",
      "Zero result must not imply absence."
    ],
    repairedRows,
    stillRepairRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    routeSpecificStandingsRepairCompetitionCount: output.summary.routeSpecificStandingsRepairCompetitionCount,
    routeSpecificStandingsRepairReadyCount: output.summary.routeSpecificStandingsRepairReadyCount,
    routeSpecificStandingsRepairStillNeedsRepairCount: output.summary.routeSpecificStandingsRepairStillNeedsRepairCount,
    routeSpecificRepairTargetCompetitionCount: output.summary.routeSpecificRepairTargetCompetitionCount,
    routeSpecificRepairTargetRowsExtractedCount: output.summary.routeSpecificRepairTargetRowsExtractedCount,
    laligaRouteSpecificRepairTargetCount: output.summary.laligaRouteSpecificRepairTargetCount,
    sportomediaRouteSpecificRepairTargetCount: output.summary.sportomediaRouteSpecificRepairTargetCount,
    rowLevelStandingRowsExtractedCompetitionCount: output.summary.rowLevelStandingRowsExtractedCompetitionCount,
    rowLevelFixtureResultRowsExtractedCompetitionCount: output.summary.rowLevelFixtureResultRowsExtractedCompetitionCount,
    rowLevelStatsExtractionCompleteCandidateCompetitionCount: output.summary.rowLevelStatsExtractionCompleteCandidateCompetitionCount,
    totalStandingRowCandidateCountAfterRepair: output.summary.totalStandingRowCandidateCountAfterRepair,
    totalFixtureResultRowCandidateCountAfterRepair: output.summary.totalFixtureResultRowCandidateCountAfterRepair,
    qualityGateReadyForClassifierCount: output.summary.qualityGateReadyForClassifierCount,
    qualityGateReadyForCanonicalWriteCount: output.summary.qualityGateReadyForCanonicalWriteCount,
    qualityGateReadyForTruthAssertionCount: output.summary.qualityGateReadyForTruthAssertionCount,
    fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
    searchExecutedNowCount: output.summary.searchExecutedNowCount,
    broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
    classifierExecutedNowCount: output.summary.classifierExecutedNowCount,
    canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
    productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
    activeAssertedCount: output.summary.activeAssertedCount,
    inactiveAssertedCount: output.summary.inactiveAssertedCount,
    completedAssertedCount: output.summary.completedAssertedCount,
    seasonStateTruthAssertedCount: output.summary.seasonStateTruthAssertedCount,
    rowLevelStatsExtractionTruthCount: output.summary.rowLevelStatsExtractionTruthCount,
    repairedRowsTruthCount: output.summary.repairedRowsTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    userHintUsedCount: output.summary.userHintUsedCount,
    hardcodedSeasonStateOverrideUsedCount: output.summary.hardcodedSeasonStateOverrideUsedCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
