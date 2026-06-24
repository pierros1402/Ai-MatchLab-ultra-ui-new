#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const EXPECTED_SLUGS = ["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"];

const DEFAULTS = {
  date: "2026-06-14",
  gateInput: "data/football-truth/_diagnostics/no-write-structured-season-state-stats-extractor-quality-gate-2026-06-14/no-write-structured-season-state-stats-extractor-quality-gate-2026-06-14.json",
  structuredInput: "data/football-truth/_diagnostics/no-write-structured-season-state-stats-extractor-2026-06-14/no-write-structured-season-state-stats-extractor-2026-06-14.json",
  snapshotInput: "data/football-truth/_diagnostics/final-explicit-scoped-controlled-route-acquisition-run-2026-06-14/final-explicit-scoped-controlled-route-acquisition-run-2026-06-14.json",
  output: "data/football-truth/_diagnostics/no-write-family-structured-stats-parser-normalizer-2026-06-14/no-write-family-structured-stats-parser-normalizer-2026-06-14.json"
};

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--gate-input") args.gateInput = argv[++i];
    else if (arg === "--structured-input") args.structuredInput = argv[++i];
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

function validateGate(gate) {
  const s = gate.summary || {};
  assertSummary(s, "structuredExtractorQualityGateCompetitionCount", 6);
  assertSummary(s, "structuredExtractorQualityGatePassedCount", 6);
  assertSummary(s, "structuredExtractorQualityGateBlockedCount", 0);
  assertSummary(s, "qualityGateReadyForFamilyStructuredParserCount", 6);
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
  assertSummary(s, "canonicalWrites", 0);
  assertSummary(s, "productionWrite", false);

  const rows = Array.isArray(gate.qualityGateRows) ? gate.qualityGateRows : [];
  if (rows.length !== 6) throw new Error("Expected 6 qualityGateRows.");
  return rows;
}

function validateStructured(input) {
  const s = input.summary || {};
  assertSummary(s, "structuredSeasonStateStatsExtractorCompetitionCount", 6);
  assertSummary(s, "structuredSeasonStateStatsExtractorReadyCount", 6);
  assertSummary(s, "structuredSeasonStateStatsExtractorBlockedCount", 0);
  assertSummary(s, "structuredSeasonCandidateCompetitionCount", 6);
  assertSummary(s, "structuredStandingsCandidateCompetitionCount", 6);
  assertSummary(s, "structuredFixtureResultCandidateCompetitionCount", 6);
  assertSummary(s, "fetchExecutedNowCount", 0);
  assertSummary(s, "searchExecutedNowCount", 0);
  assertSummary(s, "broadSearchExecutedNowCount", 0);
  assertSummary(s, "classifierExecutedNowCount", 0);
  assertSummary(s, "canonicalWriteExecutedNowCount", 0);
  assertSummary(s, "productionWriteExecutedNowCount", 0);
  assertSummary(s, "seasonStateTruthAssertedCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  assertSummary(s, "productionWrite", false);

  const rows = Array.isArray(input.structuredRows) ? input.structuredRows : [];
  if (rows.length !== 6) throw new Error("Expected 6 structuredRows.");
  return rows;
}

function validateSnapshots(run) {
  const s = run.summary || {};
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

  const rows = Array.isArray(run.fetchedSourceSnapshots) ? run.fetchedSourceSnapshots : [];
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
    .replace(/&aring;/gi, "å")
    .replace(/&auml;/gi, "ä")
    .replace(/&ouml;/gi, "ö")
    .replace(/&Aring;/g, "Å")
    .replace(/&Auml;/g, "Ä")
    .replace(/&Ouml;/g, "Ö");
}

function stripHtml(value) {
  return decodeEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cellText(value) {
  return stripHtml(value).replace(/\s+/g, " ").trim();
}

function getRaw(snapshot) {
  return String(snapshot.rawText || snapshot.text || snapshot.body || snapshot.textPreview || "");
}

function routeRole(routeKind) {
  if (String(routeKind).includes("standing")) return "standings";
  if (String(routeKind).includes("result")) return "results";
  if (/(calendar|schedule|matches)/.test(String(routeKind))) return "fixtures";
  return "source";
}

function parseHtmlTableRows(raw) {
  const rows = [];
  const trRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRegex.exec(raw)) !== null && rows.length < 500) {
    const body = trMatch[1];
    const cells = [];
    const cellRegex = /<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(body)) !== null) {
      const text = cellText(cellMatch[1]);
      if (text) cells.push(text);
    }
    if (cells.length >= 2) rows.push(cells);
  }
  return rows;
}

function isNumericCell(value) {
  return /^-?\d+(?:[.,]\d+)?$/.test(String(value).trim());
}

function chooseTeamName(cells) {
  const candidates = cells
    .map((cell) => String(cell).trim())
    .filter((cell) =>
      /[A-Za-zÀ-ÖØ-öø-ÿÅÄÖåäö]/.test(cell) &&
      !/^(pos|position|rank|team|club|played|points|pts|w|d|l|gf|ga|gd|p|v|o|f|m|goals?)$/i.test(cell) &&
      cell.length >= 2 &&
      cell.length <= 80
    );

  return candidates[0] || null;
}

function normalizeStandingCells(cells, meta) {
  const numericCells = cells.filter(isNumericCell).map((v) => Number(String(v).replace(",", ".")));
  const teamName = chooseTeamName(cells);
  if (!teamName || numericCells.length < 3 || cells.length < 4) return null;

  const possiblePosition = numericCells.find((n) => Number.isInteger(n) && n >= 1 && n <= 40) ?? null;
  const possiblePoints = numericCells[numericCells.length - 1] ?? null;

  return {
    parser: "html_table_cells_generic_family_normalizer",
    competitionSlug: meta.competitionSlug,
    reusableFamily: meta.reusableFamily,
    routeKind: meta.routeKind,
    sourceUrl: meta.sourceUrl,
    finalUrl: meta.finalUrl,
    teamName,
    positionCandidate: possiblePosition,
    pointsCandidate: possiblePoints,
    numericCells,
    rawCells: cells.slice(0, 16),
    normalizedRowIsTruth: false
  };
}

function normalizeFixtureCells(cells, meta) {
  const joined = cells.join(" ");
  const score = joined.match(/\b\d{1,2}\s*[-–:]\s*\d{1,2}\b/)?.[0] || null;
  const date = joined.match(/\b20[2-3][0-9][-/\.]\d{1,2}[-/\.]\d{1,2}\b|\b\d{1,2}[-/\.]\d{1,2}[-/\.]20[2-3][0-9]\b/)?.[0] || null;
  const names = cells.filter((cell) => /[A-Za-zÀ-ÖØ-öø-ÿÅÄÖåäö]/.test(cell) && cell.length >= 2 && cell.length <= 80);
  if (!score && names.length < 2) return null;

  return {
    parser: "html_table_cells_generic_family_normalizer",
    competitionSlug: meta.competitionSlug,
    reusableFamily: meta.reusableFamily,
    routeKind: meta.routeKind,
    sourceUrl: meta.sourceUrl,
    finalUrl: meta.finalUrl,
    homeTeamCandidate: names[0] || null,
    awayTeamCandidate: names[1] || null,
    scoreCandidate: score,
    dateCandidate: date,
    rawCells: cells.slice(0, 16),
    normalizedRowIsTruth: false
  };
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractJsonBodies(raw) {
  const bodies = [];
  const trimmed = String(raw || "").trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) bodies.push(trimmed);

  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(raw)) !== null && bodies.length < 100) {
    const body = String(match[1] || "").trim();
    if (!body) continue;

    const startObj = body.indexOf("{");
    const endObj = body.lastIndexOf("}");
    const startArr = body.indexOf("[");
    const endArr = body.lastIndexOf("]");

    if (startObj >= 0 && endObj > startObj) bodies.push(body.slice(startObj, endObj + 1));
    if (startArr >= 0 && endArr > startArr) bodies.push(body.slice(startArr, endArr + 1));
  }

  return bodies.slice(0, 120);
}

function objectName(value) {
  if (!value || typeof value !== "object") return null;
  return value.name || value.fullName || value.shortName || value.displayName || value.teamName || value.clubName || value.title || null;
}

function lowerKeys(obj) {
  const map = {};
  for (const [key, value] of Object.entries(obj || {})) map[String(key).toLowerCase()] = value;
  return map;
}

function collectObjectRows(value, meta, out, depth = 0) {
  if (!value || depth > 14 || out.standings.length + out.fixtures.length > 1000) return;

  if (Array.isArray(value)) {
    for (const item of value) collectObjectRows(item, meta, out, depth + 1);
    return;
  }

  if (typeof value !== "object") return;

  const keys = lowerKeys(value);
  const keyNames = Object.keys(keys).join(" ");
  const teamCandidate =
    objectName(value) ||
    objectName(value.team) ||
    objectName(value.club) ||
    objectName(value.competitor) ||
    objectName(value.participant);

  const points = keys.points ?? keys.pts ?? keys.point;
  const played = keys.played ?? keys.matchesplayed ?? keys.gamesplayed ?? keys.p;
  const position = keys.position ?? keys.rank ?? keys.pos;
  const wins = keys.wins ?? keys.w;
  const draws = keys.draws ?? keys.d;
  const losses = keys.losses ?? keys.l;

  if (teamCandidate && (points !== undefined || played !== undefined || position !== undefined) && /(point|pts|played|rank|position|standing|table|wins|draws|losses)/i.test(keyNames)) {
    out.standings.push({
      parser: "json_object_family_normalizer",
      competitionSlug: meta.competitionSlug,
      reusableFamily: meta.reusableFamily,
      routeKind: meta.routeKind,
      sourceUrl: meta.sourceUrl,
      finalUrl: meta.finalUrl,
      teamName: String(teamCandidate),
      positionCandidate: position ?? null,
      playedCandidate: played ?? null,
      winsCandidate: wins ?? null,
      drawsCandidate: draws ?? null,
      lossesCandidate: losses ?? null,
      pointsCandidate: points ?? null,
      normalizedRowIsTruth: false
    });
  }

  const home =
    objectName(value.homeTeam) ||
    objectName(value.home) ||
    objectName(value.localTeam) ||
    objectName(value.teamHome) ||
    keys.hometeam ||
    keys.home_name;
  const away =
    objectName(value.awayTeam) ||
    objectName(value.away) ||
    objectName(value.visitorTeam) ||
    objectName(value.teamAway) ||
    keys.awayteam ||
    keys.away_name;
  const date = keys.date ?? keys.startdate ?? keys.kickoff ?? keys.matchdate ?? keys.utcdate ?? keys.starttime ?? null;
  const homeScore = keys.homescore ?? keys.homegoals ?? keys.scorehome ?? keys.home_score ?? null;
  const awayScore = keys.awayscore ?? keys.awaygoals ?? keys.scoreaway ?? keys.away_score ?? null;

  if ((home || away) && (date || homeScore !== null || awayScore !== null || /fixture|match|result|score|home|away/i.test(keyNames))) {
    out.fixtures.push({
      parser: "json_object_family_normalizer",
      competitionSlug: meta.competitionSlug,
      reusableFamily: meta.reusableFamily,
      routeKind: meta.routeKind,
      sourceUrl: meta.sourceUrl,
      finalUrl: meta.finalUrl,
      homeTeamCandidate: home ? String(home) : null,
      awayTeamCandidate: away ? String(away) : null,
      dateCandidate: date ? String(date) : null,
      homeScoreCandidate: homeScore,
      awayScoreCandidate: awayScore,
      normalizedRowIsTruth: false
    });
  }

  for (const child of Object.values(value)) {
    if (child && typeof child === "object") collectObjectRows(child, meta, out, depth + 1);
  }
}

function parseRouteSnapshot(snapshot) {
  const raw = getRaw(snapshot);
  const role = routeRole(snapshot.routeKind);
  const meta = {
    competitionSlug: snapshot.competitionSlug,
    reusableFamily: snapshot.reusableFamily,
    routeKind: snapshot.routeKind,
    sourceUrl: snapshot.sourceUrl,
    finalUrl: snapshot.finalUrl
  };

  const tableRows = parseHtmlTableRows(raw);
  const standings = [];
  const fixtures = [];

  for (const cells of tableRows) {
    if (role === "standings") {
      const row = normalizeStandingCells(cells, meta);
      if (row) standings.push(row);
    } else if (role === "fixtures" || role === "results") {
      const row = normalizeFixtureCells(cells, meta);
      if (row) fixtures.push(row);
    }
  }

  for (const body of extractJsonBodies(raw)) {
    const parsed = safeJsonParse(body);
    if (!parsed) continue;
    const out = { standings: [], fixtures: [] };
    collectObjectRows(parsed, meta, out);
    standings.push(...out.standings);
    fixtures.push(...out.fixtures);
  }

  const dedupe = (rows, keyFn) => {
    const seen = new Set();
    const out = [];
    for (const row of rows) {
      const key = keyFn(row);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
      if (out.length >= 120) break;
    }
    return out;
  };

  return {
    routeKind: snapshot.routeKind,
    routeRole: role,
    sourceUrl: snapshot.sourceUrl,
    finalUrl: snapshot.finalUrl,
    standingRowCandidates: dedupe(standings, (r) => `${r.teamName}|${r.positionCandidate}|${r.pointsCandidate}`),
    fixtureResultRowCandidates: dedupe(fixtures, (r) => `${r.homeTeamCandidate}|${r.awayTeamCandidate}|${r.dateCandidate}|${r.scoreCandidate}|${r.homeScoreCandidate}|${r.awayScoreCandidate}`)
  };
}

function groupBySlug(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.competitionSlug)) map.set(row.competitionSlug, []);
    map.get(row.competitionSlug).push(row);
  }
  return map;
}

function buildCompetitionRow({ gateRow, structuredRow, snapshots }) {
  const routeParserResults = snapshots.map(parseRouteSnapshot);

  const standingRows = routeParserResults.flatMap((route) => route.standingRowCandidates);
  const fixtureRows = routeParserResults.flatMap((route) => route.fixtureResultRowCandidates);

  const standingsRouteCount = snapshots.filter((row) => routeRole(row.routeKind) === "standings").length;
  const fixtureOrResultRouteCount = snapshots.filter((row) => ["fixtures", "results"].includes(routeRole(row.routeKind))).length;

  const hasStandingRows = standingRows.length > 0;
  const hasFixtureRows = fixtureRows.length > 0;

  const parserNormalizerStatus =
    hasStandingRows && hasFixtureRows
      ? "ready_for_no_write_family_parser_quality_gate"
      : "family_parser_needs_repair_or_more_route_specific_normalization";

  const blockingReasons = [];
  if (!hasStandingRows) blockingReasons.push("row_level_standings_candidates_missing");
  if (!hasFixtureRows) blockingReasons.push("row_level_fixture_result_candidates_missing");

  return {
    competitionSlug: gateRow.competitionSlug,
    reusableFamily: gateRow.reusableFamily,
    parserNormalizerStatus,
    blockingReasons,

    standingsRouteCount,
    fixtureOrResultRouteCount,
    standingRowCandidateCount: standingRows.length,
    fixtureResultRowCandidateCount: fixtureRows.length,

    standingRowCandidateSamples: standingRows.slice(0, 12),
    fixtureResultRowCandidateSamples: fixtureRows.slice(0, 12),
    routeParserResults,

    rowLevelStatsExtractionCompleteCandidate: hasStandingRows && hasFixtureRows,
    rowLevelStatsExtractionTruth: false,

    qualityGateReadyForClassifier: false,
    qualityGateReadyForCanonicalWrite: false,
    qualityGateReadyForTruthAssertion: false,

    activeAssertedNow: false,
    inactiveAssertedNow: false,
    completedAssertedNow: false,
    seasonStateTruthAssertedNow: false,
    classifierExecutedNow: false,
    canonicalWriteExecutedNow: false,
    productionWriteExecutedNow: false,
    fetchExecutedNow: false,
    searchExecutedNow: false,
    broadSearchExecutedNow: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    noMatchTodayDoesNotImplyInactive: true,
    zeroResultDoesNotImplyAbsence: true,
    missingRowCandidatesDoNotProveAbsence: true,

    nextAllowedStep:
      hasStandingRows && hasFixtureRows
        ? "run_no_write_family_structured_stats_parser_normalizer_quality_gate"
        : "repair_family_specific_standings_or_fixture_parser",
    nextBlockedStep: "season_state_classifier_canonical_write_and_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);

  const gate = readJson(args.gateInput);
  const gateRows = validateGate(gate);

  const structured = readJson(args.structuredInput);
  const structuredRows = validateStructured(structured);
  const structuredBySlug = new Map(structuredRows.map((row) => [row.competitionSlug, row]));

  const snapshotRun = readJson(args.snapshotInput);
  const snapshots = validateSnapshots(snapshotRun);
  const snapshotsBySlug = groupBySlug(snapshots);

  const slugs = uniqueSorted(gateRows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected gate slugs: " + slugs.join(", "));
  }

  const parserRows = gateRows
    .map((gateRow) => buildCompetitionRow({
      gateRow,
      structuredRow: structuredBySlug.get(gateRow.competitionSlug),
      snapshots: snapshotsBySlug.get(gateRow.competitionSlug) || []
    }))
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const readyRows = parserRows.filter((row) => row.parserNormalizerStatus === "ready_for_no_write_family_parser_quality_gate");
  const repairRows = parserRows.filter((row) => row.parserNormalizerStatus !== "ready_for_no_write_family_parser_quality_gate");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-no-write-family-structured-stats-parser-normalizer-file",
    mode: "build_no_write_family_structured_stats_parser_normalizer_no_fetch_no_search_no_classifier_no_truth_assertion_no_write",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      structuredExtractorQualityGate: args.gateInput,
      structuredExtractor: args.structuredInput,
      finalScopedControlledRouteAcquisitionRun: args.snapshotInput
    },
    summary: {
      familyStructuredStatsParserNormalizerCompetitionCount: parserRows.length,
      familyStructuredStatsParserNormalizerReadyCount: readyRows.length,
      familyStructuredStatsParserNormalizerNeedsRepairCount: repairRows.length,

      rowLevelStandingRowsExtractedCompetitionCount: parserRows.filter((row) => row.standingRowCandidateCount > 0).length,
      rowLevelFixtureResultRowsExtractedCompetitionCount: parserRows.filter((row) => row.fixtureResultRowCandidateCount > 0).length,
      rowLevelStatsExtractionCompleteCandidateCompetitionCount: parserRows.filter((row) => row.rowLevelStatsExtractionCompleteCandidate).length,

      totalStandingRowCandidateCount: parserRows.reduce((sum, row) => sum + row.standingRowCandidateCount, 0),
      totalFixtureResultRowCandidateCount: parserRows.reduce((sum, row) => sum + row.fixtureResultRowCandidateCount, 0),

      laligaParserNormalizerCompetitionCount: parserRows.filter((row) => row.reusableFamily === "laliga").length,
      norwayNtfParserNormalizerCompetitionCount: parserRows.filter((row) => row.reusableFamily === "norway_ntf").length,
      sportomediaParserNormalizerCompetitionCount: parserRows.filter((row) => row.reusableFamily === "sportomedia").length,

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
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        repairRows.length === 0
          ? "run_no_write_family_structured_stats_parser_normalizer_quality_gate"
          : "repair_family_specific_standings_or_fixture_parser"
    },
    counts: {
      byReusableFamily: countBy(parserRows, "reusableFamily"),
      byParserNormalizerStatus: countBy(parserRows, "parserNormalizerStatus"),
      byNextAllowedStep: countBy(parserRows, "nextAllowedStep")
    },
    guardrails: [
      "This parser/normalizer reads already-acquired snapshots only.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a season-state classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Extracted row candidates are not truth assertions.",
      "Missing row candidates does not prove absence.",
      "No match today must not imply inactive.",
      "Zero result must not imply absence."
    ],
    parserRows,
    repairRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    familyStructuredStatsParserNormalizerCompetitionCount: output.summary.familyStructuredStatsParserNormalizerCompetitionCount,
    familyStructuredStatsParserNormalizerReadyCount: output.summary.familyStructuredStatsParserNormalizerReadyCount,
    familyStructuredStatsParserNormalizerNeedsRepairCount: output.summary.familyStructuredStatsParserNormalizerNeedsRepairCount,
    rowLevelStandingRowsExtractedCompetitionCount: output.summary.rowLevelStandingRowsExtractedCompetitionCount,
    rowLevelFixtureResultRowsExtractedCompetitionCount: output.summary.rowLevelFixtureResultRowsExtractedCompetitionCount,
    rowLevelStatsExtractionCompleteCandidateCompetitionCount: output.summary.rowLevelStatsExtractionCompleteCandidateCompetitionCount,
    totalStandingRowCandidateCount: output.summary.totalStandingRowCandidateCount,
    totalFixtureResultRowCandidateCount: output.summary.totalFixtureResultRowCandidateCount,
    laligaParserNormalizerCompetitionCount: output.summary.laligaParserNormalizerCompetitionCount,
    norwayNtfParserNormalizerCompetitionCount: output.summary.norwayNtfParserNormalizerCompetitionCount,
    sportomediaParserNormalizerCompetitionCount: output.summary.sportomediaParserNormalizerCompetitionCount,
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
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    userHintUsedCount: output.summary.userHintUsedCount,
    hardcodedSeasonStateOverrideUsedCount: output.summary.hardcodedSeasonStateOverrideUsedCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
