#!/usr/bin/env node

import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { LEAGUES_COVERAGE } from "../../workers/_shared/leagues-coverage.js";
import { leagueName } from "../../workers/_shared/leagues-registry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function existsFile(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function existsDir(dirPath) {
  try {
    return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function fileList(dirPath) {
  if (!existsDir(dirPath)) return [];
  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(dirPath, entry.name));
}

function dirList(dirPath) {
  if (!existsDir(dirPath)) return [];
  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(dirPath, entry.name));
}

function normalizeDate(value) {
  const text = asText(value);
  const match = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  return match ? match[0] : "";
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dayKey, days) {
  const date = new Date(dayKey + "T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function deriveSeasonKey(dayKey) {
  const date = normalizeDate(dayKey) || todayIsoDate();
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return "";
  return month >= 7 ? String(year) + "-" + String(year + 1) : String(year - 1) + "-" + String(year);
}

function parseArgs(argv) {
  const args = {
    date: "",
    seasonKey: "",
    dataRoot: path.join(repoRoot, "data"),
    output: "",
    daysAhead: 14,
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--date") args.date = argv[++i] || "";
    else if (arg.startsWith("--date=")) args.date = arg.slice("--date=".length);
    else if (arg === "--season-key") args.seasonKey = argv[++i] || "";
    else if (arg.startsWith("--season-key=")) args.seasonKey = arg.slice("--season-key=".length);
    else if (arg === "--data-root") args.dataRoot = path.resolve(argv[++i] || "");
    else if (arg.startsWith("--data-root=")) args.dataRoot = path.resolve(arg.slice("--data-root=".length));
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else if (arg === "--days-ahead") args.daysAhead = Number(argv[++i] || 14);
    else if (arg.startsWith("--days-ahead=")) args.daysAhead = Number(arg.slice("--days-ahead=".length));
    else throw new Error("unknown argument: " + arg);
  }

  args.date = normalizeDate(args.date) || todayIsoDate();
  args.seasonKey = asText(args.seasonKey) || deriveSeasonKey(args.date);
  args.daysAhead = Number.isFinite(args.daysAhead) && args.daysAhead >= 0 ? Math.floor(args.daysAhead) : 14;

  if (!args.output) {
    args.output = path.join(args.dataRoot, "football-truth", "_diagnostics", "coverage-competition-state-inventory-" + args.date + ".json");
  }

  return args;
}

function cleanCoverageRows(rows = LEAGUES_COVERAGE) {
  const seen = new Set();
  const output = [];

  for (const row of rows) {
    const slug = asText(row && row.slug);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);

    output.push({
      competitionSlug: slug,
      competitionName: leagueName(slug),
      competitionType: asText(row.type) || "unknown",
      region: asText(row.region),
      country: asText(row.country),
      tier: Number(row.tier || 0),
      trust: Number(row.trust || 0)
    });
  }

  return output.sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));
}

function fixtureRows(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json && json.fixtures)) return json.fixtures;
  if (Array.isArray(json && json.rows)) return json.rows;
  if (Array.isArray(json && json.matches)) return json.matches;
  return [];
}

function isFinal(row) {
  const text = [
    row && row.status,
    row && row.statusText,
    row && row.shortStatus,
    row && row.state,
    row && row.phase
  ].map(asText).join(" ").toUpperCase();

  if (/\b(FT|AET|AP|FINAL|FULL_TIME|STATUS_FINAL|STATUS_FULL_TIME|FINISHED|ENDED|COMPLETE|COMPLETED)\b/.test(text)) return true;
  return !!(row && (row.final === true || row.isFinal === true || row.completed === true));
}

function getStat(map, slug) {
  if (!map.has(slug)) {
    map.set(slug, {
      competitionSlug: slug,
      canonicalFixtureCountByDate: {},
      canonicalFixtureCountTotal: 0,
      finalFixtureDates: []
    });
  }
  return map.get(slug);
}

function scanCanonicalFixtures(dataRoot) {
  const result = new Map();
  const root = path.join(dataRoot, "canonical-fixtures");

  for (const dayDir of dirList(root)) {
    const dayKey = path.basename(dayDir);

    for (const filePath of fileList(dayDir)) {
      let json;
      try {
        json = readJson(filePath);
      } catch {
        continue;
      }

      const rows = fixtureRows(json);
      const slug = asText((json && (json.leagueSlug || json.competitionSlug)) || path.basename(filePath, ".json"));
      if (!slug) continue;

      const stat = getStat(result, slug);
      stat.canonicalFixtureCountByDate[dayKey] = (stat.canonicalFixtureCountByDate[dayKey] || 0) + rows.length;
      stat.canonicalFixtureCountTotal += rows.length;

      for (const row of rows) {
        const rowDate = normalizeDate(row && (row.dayKey || row.date || row.kickoffUtc || row.startTime)) || dayKey;
        if (isFinal(row)) stat.finalFixtureDates.push(rowDate);
      }
    }
  }

  return result;
}

function scanStandings(dataRoot) {
  const result = new Map();
  const root = path.join(dataRoot, "standings");

  for (const filePath of fileList(root)) {
    let json;
    try {
      json = readJson(filePath);
    } catch {
      continue;
    }

    const slug = asText((json && (json.leagueSlug || json.competitionSlug)) || path.basename(filePath, ".json"));
    if (!slug) continue;

    const table = asArray((json && json.table) || (json && json.rows) || (json && json.standings));
    const phaseTables = json && typeof json.phaseTables === "object" && json.phaseTables ? json.phaseTables : {};

    result.set(slug, {
      standingsFileExists: true,
      standingsSeason: asText(json && (json.season || json.seasonKey)),
      standingsTableCount: table.length,
      standingsPhaseKeys: Object.keys(phaseTables),
      standingsMtime: fs.statSync(filePath).mtime.toISOString()
    });
  }

  return result;
}

function extractRows(json) {
  if (Array.isArray(json)) return json;

  for (const key of [
    "competitionStateRows",
    "competitionRows",
    "leagueDayActivityRows",
    "dayActivityRows",
    "leagueSeasonWatchRows",
    "seasonWatchRows",
    "leagueSeasonStatusRows",
    "seasonStatusRows",
    "rows"
  ]) {
    if (Array.isArray(json && json[key])) return json[key];
  }

  return [];
}

function scanJsonRows(filePath) {
  if (!existsFile(filePath)) return new Map();

  let json;
  try {
    json = readJson(filePath);
  } catch {
    return new Map();
  }

  const result = new Map();

  for (const row of extractRows(json)) {
    const slug = asText(row && (row.competitionSlug || row.leagueSlug));
    if (!slug) continue;
    result.set(slug, row);
  }

  return result;
}

function scanDayActivity(dataRoot, date) {
  return scanJsonRows(path.join(dataRoot, "football-truth", "_state", "league-day-activity", date + ".json"));
}

function scanSeasonStatus(dataRoot, seasonKey) {
  return scanJsonRows(path.join(dataRoot, "football-truth", "_state", "league-season-status", seasonKey + ".json"));
}

function scanSeasonWatch(dataRoot) {
  return scanJsonRows(path.join(dataRoot, "football-truth", "_state", "league-season-watch", "league-season-watch.json"));
}

function maxDate(values) {
  const list = values.filter(Boolean).sort();
  return list.length ? list[list.length - 1] : "";
}

function minDate(values) {
  const list = values.filter(Boolean).sort();
  return list.length ? list[0] : "";
}

function pushUnique(list, value) {
  if (value && !list.includes(value)) list.push(value);
}

function classifyCompetition(row) {
  const type = row.competitionType;
  if (type === "league") return "league";
  if (type === "cup") return "cup";
  if (type === "continental") return "continental";
  if (type === "global") return "global";
  return "unknown";
}

function buildEvidenceNeeds({ coverageRow, canonical, standings, dayActivity, seasonStatus, seasonWatch, date, windowEnd }) {
  const family = classifyCompetition(coverageRow);
  const counts = canonical.canonicalFixtureCountByDate || {};
  const fixtureDates = Object.keys(counts).sort();
  const fixtureDatesInWindow = fixtureDates.filter((day) => day >= date && day <= windowEnd);

  const canonicalFixtureCountToday = Number(counts[date] || 0);
  const canonicalFixtureCountNextWindow = fixtureDatesInWindow.reduce((sum, day) => sum + Number(counts[day] || 0), 0);
  const finalFixtureDates = asArray(canonical.finalFixtureDates);

  const lastKnownFixtureDate = maxDate(fixtureDates.filter((day) => day <= date));
  const nextKnownCanonicalFixtureDate = minDate(fixtureDates.filter((day) => day > date));

  const dayActivityState = asText(dayActivity.dayActivityState || dayActivity.activityState);
  const seasonStatusState = asText(seasonStatus.seasonStatusState || seasonStatus.seasonStatus || seasonStatus.activityState);
  const seasonStatusEvidenceState = asText(seasonStatus.seasonStatusEvidenceState || seasonStatus.evidenceState);
  const seasonWatchNextKnownFixtureDate = normalizeDate(seasonWatch.nextKnownFixtureDate || seasonWatch.seasonWatchNextKnownFixtureDate);

  const standingsFileExists = standings.standingsFileExists === true;
  const standingsTableCount = Number(standings.standingsTableCount || 0);

  const hasTargetDateFixtureEvidence = canonicalFixtureCountToday > 0 || dayActivityState === "active_for_day";
  const hasFutureFixtureEvidence = canonicalFixtureCountNextWindow > 0 || !!seasonWatchNextKnownFixtureDate;
  const hasSeasonStatusEvidence = !!seasonStatusState || !!seasonStatusEvidenceState;

  const evidenceNeeds = [];
  const recommendedNextEvidenceSearch = [];

  if (family === "league") {
    if (!standingsFileExists || standingsTableCount === 0) {
      pushUnique(evidenceNeeds, "standings_evidence");
      pushUnique(recommendedNextEvidenceSearch, "standings_search");
    } else {
      pushUnique(evidenceNeeds, "standings_currency_or_final_table_verification");
      pushUnique(recommendedNextEvidenceSearch, "standings_currency_or_final_table_search");
    }

    if (!hasSeasonStatusEvidence) {
      pushUnique(evidenceNeeds, "season_calendar_evidence");
      pushUnique(recommendedNextEvidenceSearch, "season_calendar_search");
      pushUnique(evidenceNeeds, "next_season_start_or_current_round_evidence");
      pushUnique(recommendedNextEvidenceSearch, "next_season_start_or_current_round_search");
    }
  } else if (family === "cup") {
    pushUnique(evidenceNeeds, "cup_phase_evidence");
    pushUnique(evidenceNeeds, "cup_calendar_evidence");
    pushUnique(evidenceNeeds, "cup_final_or_winner_evidence");
    pushUnique(recommendedNextEvidenceSearch, "cup_status_search");
    pushUnique(recommendedNextEvidenceSearch, "cup_calendar_search");
    pushUnique(recommendedNextEvidenceSearch, "cup_winner_search");
  } else if (family === "continental") {
    pushUnique(evidenceNeeds, "continental_phase_evidence");
    pushUnique(evidenceNeeds, "continental_calendar_evidence");
    pushUnique(evidenceNeeds, "continental_final_or_winner_evidence");
    pushUnique(recommendedNextEvidenceSearch, "continental_status_search");
    pushUnique(recommendedNextEvidenceSearch, "continental_calendar_search");
    pushUnique(recommendedNextEvidenceSearch, "continental_winner_search");

    if (coverageRow.competitionSlug.startsWith("uefa.")) {
      pushUnique(evidenceNeeds, "uefa_qualifier_start_date_evidence");
      pushUnique(recommendedNextEvidenceSearch, "uefa_qualifier_calendar_search");
    }
  } else if (family === "global") {
    pushUnique(evidenceNeeds, "global_tournament_status_evidence");
    pushUnique(evidenceNeeds, "global_tournament_calendar_evidence");
    pushUnique(evidenceNeeds, "global_tournament_winner_evidence");
    pushUnique(recommendedNextEvidenceSearch, "global_tournament_status_search");
    pushUnique(recommendedNextEvidenceSearch, "global_tournament_calendar_search");
    pushUnique(recommendedNextEvidenceSearch, "global_tournament_winner_search");
  } else {
    pushUnique(evidenceNeeds, "competition_type_evidence");
    pushUnique(recommendedNextEvidenceSearch, "competition_identity_search");
  }

  if (hasTargetDateFixtureEvidence) {
    pushUnique(recommendedNextEvidenceSearch, "target_date_fixture_verification");
  } else if (dayActivityState && dayActivityState !== "no_expected_fixtures_for_day") {
    pushUnique(recommendedNextEvidenceSearch, "target_date_fixture_search");
  }

  let competitionState = "unknown_needs_competition_state_evidence";
  if (hasTargetDateFixtureEvidence) competitionState = "known_target_date_fixture_activity";
  else if (dayActivityState === "no_expected_fixtures_for_day") competitionState = "known_no_expected_fixtures_for_target_date";
  else if (hasFutureFixtureEvidence) competitionState = "known_future_fixture_activity";
  else if (seasonStatusState) competitionState = "season_status_evidence_available_needs_review";

  return {
    family,
    competitionState,
    evidenceNeeds,
    recommendedNextEvidenceSearch,
    canonicalFixtureCountToday,
    canonicalFixtureCountNextWindow,
    canonicalFixtureCountTotal: Number(canonical.canonicalFixtureCountTotal || 0),
    lastKnownFixtureDate,
    nextKnownCanonicalFixtureDate,
    verifiedFTCount: finalFixtureDates.length,
    lastVerifiedFTDate: maxDate(finalFixtureDates),
    standingsFileExists,
    standingsSeason: asText(standings.standingsSeason),
    standingsTableCount,
    standingsPhaseKeys: asArray(standings.standingsPhaseKeys),
    dayActivityState,
    dayActivityEvidenceState: asText(dayActivity.dayActivityEvidenceState || dayActivity.evidenceState),
    dayActivityNextKnownFixtureDate: normalizeDate(dayActivity.nextKnownFixtureDate),
    seasonWatchNextKnownFixtureDate,
    seasonWatchReason: asText(seasonWatch.reason || seasonWatch.activityReason),
    seasonStatusState,
    seasonStatusEvidenceState,
    needsTargetDateFixtureEvidence: !hasTargetDateFixtureEvidence && !!dayActivityState && dayActivityState !== "no_expected_fixtures_for_day"
  };
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = asText(typeof key === "function" ? key(row) : row[key]) || "unknown";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function countNeeds(rows) {
  const out = {};
  for (const row of rows) {
    for (const need of asArray(row.evidenceNeeds)) out[need] = (out[need] || 0) + 1;
  }
  return out;
}

function buildInventory(args) {
  const coverageRows = cleanCoverageRows();
  const canonical = scanCanonicalFixtures(args.dataRoot);
  const standings = scanStandings(args.dataRoot);
  const dayActivity = scanDayActivity(args.dataRoot, args.date);
  const seasonStatus = scanSeasonStatus(args.dataRoot, args.seasonKey);
  const seasonWatch = scanSeasonWatch(args.dataRoot);
  const windowEnd = addDays(args.date, args.daysAhead);

  const rows = coverageRows.map((coverageRow) => {
    const slug = coverageRow.competitionSlug;

    const state = buildEvidenceNeeds({
      coverageRow,
      canonical: canonical.get(slug) || {},
      standings: standings.get(slug) || {},
      dayActivity: dayActivity.get(slug) || {},
      seasonStatus: seasonStatus.get(slug) || {},
      seasonWatch: seasonWatch.get(slug) || {},
      date: args.date,
      windowEnd
    });

    return {
      ...coverageRow,
      targetDate: args.date,
      seasonKey: args.seasonKey,
      ...state
    };
  });

  const summary = {
    targetDate: args.date,
    seasonKey: args.seasonKey,
    daysAhead: args.daysAhead,
    coverageRowCount: rows.length,
    byCompetitionType: countBy(rows, "competitionType"),
    byFamily: countBy(rows, "family"),
    byCompetitionState: countBy(rows, "competitionState"),
    evidenceNeedCounts: countNeeds(rows),
    rowsWithTargetDateFixtureEvidence: rows.filter((row) => row.competitionState === "known_target_date_fixture_activity").length,
    rowsWithFutureFixtureEvidence: rows.filter((row) => row.competitionState === "known_future_fixture_activity").length,
    rowsWithStandingsArtifacts: rows.filter((row) => row.standingsFileExists).length,
    rowsNeedingStandingsEvidence: rows.filter((row) => row.evidenceNeeds.includes("standings_evidence")).length,
    rowsNeedingCupStatusEvidence: rows.filter((row) => row.evidenceNeeds.includes("cup_phase_evidence")).length,
    rowsNeedingContinentalCalendarEvidence: rows.filter((row) => row.evidenceNeeds.includes("continental_calendar_evidence")).length,
    canonicalWrites: 0,
    productionWrite: false,
    sourceFetch: false
  };

  return {
    ok: true,
    job: "build-coverage-competition-state-inventory-file",
    generatedAt: new Date().toISOString(),
    summary,
    rows,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      noFixtureWrites: true,
      noStandingsWrites: true,
      noCanonicalPromotion: true
    }
  };
}

function runSelfTest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-coverage-competition-state-"));
  const dataRoot = path.join(root, "data");

  try {
    writeJson(path.join(dataRoot, "standings", "eng.1.json"), {
      leagueSlug: "eng.1",
      season: "2025-2026",
      table: [{ team: "Alpha", played: 38 }]
    });

    writeJson(path.join(dataRoot, "canonical-fixtures", "2026-06-03", "swe.1.json"), {
      leagueSlug: "swe.1",
      fixtures: [{ leagueSlug: "swe.1", dayKey: "2026-06-03", status: "PRE" }]
    });

    const report = buildInventory({
      date: "2026-06-03",
      seasonKey: "2025-2026",
      dataRoot,
      daysAhead: 14,
      output: path.join(root, "out.json")
    });

    if (report.summary.coverageRowCount < 600) throw new Error("expected coverage-wide inventory rows");
    if (report.summary.byCompetitionType.league < 400) throw new Error("expected league coverage rows");
    if (report.summary.byCompetitionType.cup < 200) throw new Error("expected cup coverage rows");

    const eng = report.rows.find((row) => row.competitionSlug === "eng.1");
    const swe = report.rows.find((row) => row.competitionSlug === "swe.1");
    const ucl = report.rows.find((row) => row.competitionSlug === "uefa.champions");

    if (!eng || !eng.standingsFileExists) throw new Error("expected standings artifact to be detected");
    if (!eng.evidenceNeeds.includes("season_calendar_evidence")) throw new Error("league standings must still need season calendar evidence");
    if (!swe || swe.competitionState !== "known_target_date_fixture_activity") throw new Error("expected target-date fixture activity");
    if (!ucl || !ucl.evidenceNeeds.includes("uefa_qualifier_start_date_evidence")) throw new Error("expected UEFA qualifier evidence need");
    if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) throw new Error("read-only guarantees changed");

    return { ok: true, selfTest: "build-coverage-competition-state-inventory-file", summary: report.summary };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const report = buildInventory(args);
  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: path.relative(repoRoot, args.output).replace(/\\/g, "/"),
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

if (path.resolve(process.argv[1] || "") === __filename) {
  main();
}

export { buildInventory, buildEvidenceNeeds, cleanCoverageRows };