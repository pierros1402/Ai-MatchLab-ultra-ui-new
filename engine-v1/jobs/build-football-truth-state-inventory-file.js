#!/usr/bin/env node

import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

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
    daysAhead: 7,
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") {
      args.selfTest = true;
    } else if (arg === "--date") {
      args.date = argv[++i] || "";
    } else if (arg.startsWith("--date=")) {
      args.date = arg.slice("--date=".length);
    } else if (arg === "--season-key") {
      args.seasonKey = argv[++i] || "";
    } else if (arg.startsWith("--season-key=")) {
      args.seasonKey = arg.slice("--season-key=".length);
    } else if (arg === "--data-root") {
      args.dataRoot = path.resolve(argv[++i] || "");
    } else if (arg.startsWith("--data-root=")) {
      args.dataRoot = path.resolve(arg.slice("--data-root=".length));
    } else if (arg === "--output") {
      args.output = argv[++i] || "";
    } else if (arg.startsWith("--output=")) {
      args.output = arg.slice("--output=".length);
    } else if (arg === "--days-ahead") {
      args.daysAhead = Number(argv[++i] || 7);
    } else if (arg.startsWith("--days-ahead=")) {
      args.daysAhead = Number(arg.slice("--days-ahead=".length));
    } else {
      throw new Error("unknown argument: " + arg);
    }
  }

  args.date = normalizeDate(args.date) || todayIsoDate();
  args.seasonKey = asText(args.seasonKey) || deriveSeasonKey(args.date);
  args.daysAhead = Number.isFinite(args.daysAhead) && args.daysAhead >= 0 ? Math.floor(args.daysAhead) : 7;

  if (!args.output) {
    args.output = path.join(args.dataRoot, "football-truth", "_diagnostics", "football-truth-state-inventory-" + args.date + ".json");
  }

  return args;
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
    row && row.rawStatus,
    row && row.statusType,
    row && row.statusName,
    row && row.shortStatus,
    row && row.state
  ].map(asText).join(" ").toUpperCase();

  if (/\b(FT|AET|AP|FINAL|FULL_TIME|STATUS_FINAL|STATUS_FULL_TIME|FINISHED|ENDED|COMPLETE|COMPLETED)\b/.test(text)) return true;
  if (row && (row.final === true || row.isFinal === true || row.completed === true)) return true;
  return false;
}

function getLeagueStat(map, leagueSlug) {
  if (!map.has(leagueSlug)) {
    map.set(leagueSlug, {
      leagueSlug,
      leagueName: "",
      canonicalFixtureCountByDate: {},
      canonicalFixtureCountTotal: 0,
      finalFixtureDates: []
    });
  }
  return map.get(leagueSlug);
}

function scanCanonicalFixtures(dataRoot) {
  const result = new Map();
  const root = path.join(dataRoot, "canonical-fixtures");

  for (const dayDir of dirList(root)) {
    const dayKey = path.basename(dayDir);
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(dayKey)) continue;

    for (const filePath of fileList(dayDir)) {
      if (!filePath.endsWith(".json")) continue;

      let json;
      try {
        json = readJson(filePath);
      } catch {
        continue;
      }

      const rows = fixtureRows(json);
      const leagueSlug = asText((json && json.leagueSlug) || path.basename(filePath, ".json"));
      if (!leagueSlug) continue;

      const stat = getLeagueStat(result, leagueSlug);
      stat.leagueName = asText(stat.leagueName || (json && json.leagueName) || (rows[0] && rows[0].leagueName));
      stat.canonicalFixtureCountByDate[dayKey] = (stat.canonicalFixtureCountByDate[dayKey] || 0) + rows.length;
      stat.canonicalFixtureCountTotal += rows.length;

      for (const row of rows) {
        const rowDate = normalizeDate((row && (row.dayKey || row.date || row.kickoffUtc || row.startTime))) || dayKey;
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
    if (!filePath.endsWith(".json")) continue;

    let json;
    try {
      json = readJson(filePath);
    } catch {
      continue;
    }

    const leagueSlug = asText((json && json.leagueSlug) || path.basename(filePath, ".json"));
    if (!leagueSlug) continue;

    const table = asArray((json && json.table) || (json && json.rows) || (json && json.standings));
    const phaseTables = json && typeof json.phaseTables === "object" && json.phaseTables ? json.phaseTables : {};
    const phaseKeys = Object.keys(phaseTables);

    result.set(leagueSlug, {
      standingsFileExists: true,
      standingsSeason: asText((json && (json.season || json.seasonKey)) || ""),
      standingsTableCount: table.length,
      standingsPhaseKeys: phaseKeys,
      standingsMtime: fs.statSync(filePath).mtime.toISOString()
    });
  }

  return result;
}

function historyRows(json) {
  const output = [];

  function inheritedDateFrom(value) {
    return normalizeDate(value && (value.dayKey || value.date || value.matchDate || value.updatedAt));
  }

  function pushCandidate(candidate, inherited) {
    if (!candidate || typeof candidate !== "object") return;

    const inheritedDayKey = asText(inherited && inherited.dayKey);
    const ownDayKey = inheritedDateFrom(candidate) || inheritedDayKey;

    for (const key of ["days", "rows", "historyRows", "matches", "fixtures", "results", "games", "leagueRows", "matchRows"]) {
      if (Array.isArray(candidate[key])) {
        for (const child of candidate[key]) {
          if (child && typeof child === "object") {
            pushCandidate({ ...child, dayKey: normalizeDate(child.dayKey || child.date || child.matchDate) || ownDayKey }, { dayKey: ownDayKey });
          }
        }
        return;
      }
    }

    output.push({
      ...candidate,
      dayKey: normalizeDate(candidate.dayKey || candidate.date || candidate.matchDate || candidate.kickoffUtc) || ownDayKey
    });
  }

  if (Array.isArray(json)) {
    for (const row of json) {
      pushCandidate(row, {});
    }
    return output;
  }

  if (json && typeof json === "object") {
    pushCandidate(json, { dayKey: inheritedDateFrom(json) });

    if (output.length === 0) {
      for (const value of Object.values(json)) {
        if (Array.isArray(value)) {
          for (const row of value) pushCandidate(row, {});
        } else if (value && typeof value === "object") {
          pushCandidate(value, {});
        }
      }
    }
  }

  return output;
}

function scanHistory(dataRoot, seasonKey) {
  const result = new Map();
  const filePath = path.join(dataRoot, "history", seasonKey + ".json");

  if (!existsFile(filePath)) return result;

  let json;
  try {
    json = readJson(filePath);
  } catch {
    return result;
  }

  for (const row of historyRows(json)) {
    const leagueSlug = asText(row && (row.leagueSlug || row.league || row.competitionSlug));
    if (!leagueSlug) continue;

    if (!result.has(leagueSlug)) {
      result.set(leagueSlug, {
        historyRowsCount: 0,
        historyFinalRowsCount: 0,
        historyDates: []
      });
    }

    const stat = result.get(leagueSlug);
    stat.historyRowsCount += 1;
    if (isFinal(row)) stat.historyFinalRowsCount += 1;

    const date = normalizeDate(row && (row.dayKey || row.date || row.kickoffUtc || row.matchDate));
    if (date) stat.historyDates.push(date);
  }

  return result;
}

function extractRows(json) {
  if (Array.isArray(json)) return json;
  for (const key of ["leagueDayActivityRows", "dayActivityRows", "leagueSeasonWatchRows", "seasonWatchRows", "leagueSeasonStatusRows", "seasonStatusRows", "rows"]) {
    if (Array.isArray(json && json[key])) return json[key];
  }
  return [];
}

function scanDayActivity(dataRoot, date) {
  const result = new Map();
  const filePath = path.join(dataRoot, "football-truth", "_state", "league-day-activity", date + ".json");
  if (!existsFile(filePath)) return result;

  let json;
  try {
    json = readJson(filePath);
  } catch {
    return result;
  }

  for (const row of extractRows(json)) {
    const leagueSlug = asText(row && row.leagueSlug);
    if (!leagueSlug) continue;
    result.set(leagueSlug, {
      dayActivityState: asText(row.activityState),
      dayActivityEvidenceState: asText(row.dayActivityEvidenceState),
      dayActivityReason: asText(row.reason || row.activityReason),
      dayActivityNextKnownFixtureDate: normalizeDate(row.nextKnownFixtureDate)
    });
  }

  return result;
}

function scanSeasonWatch(dataRoot) {
  const result = new Map();
  const filePath = path.join(dataRoot, "football-truth", "_state", "league-season-watch", "league-season-watch.json");
  if (!existsFile(filePath)) return result;

  let json;
  try {
    json = readJson(filePath);
  } catch {
    return result;
  }

  for (const row of extractRows(json)) {
    const leagueSlug = asText(row && row.leagueSlug);
    if (!leagueSlug) continue;
    result.set(leagueSlug, {
      seasonWatchNextKnownFixtureDate: normalizeDate(row.nextKnownFixtureDate),
      seasonWatchReason: asText(row.reason || row.activityReason)
    });
  }

  return result;
}

function scanSeasonStatus(dataRoot, seasonKey) {
  const result = new Map();
  const filePath = path.join(dataRoot, "football-truth", "_state", "league-season-status", seasonKey + ".json");
  if (!existsFile(filePath)) return result;

  let json;
  try {
    json = readJson(filePath);
  } catch {
    return result;
  }

  for (const row of extractRows(json)) {
    const leagueSlug = asText(row && row.leagueSlug);
    if (!leagueSlug) continue;
    result.set(leagueSlug, {
      seasonStatusStateExists: true,
      seasonStatus: asText(row.seasonStatus),
      seasonStatusEvidenceState: asText(row.seasonStatusEvidenceState)
    });
  }

  return result;
}

function maxDate(values) {
  const list = values.filter(Boolean).sort();
  return list.length ? list[list.length - 1] : "";
}

function minDate(values) {
  const list = values.filter(Boolean).sort();
  return list.length ? list[0] : "";
}

function buildInventory(args) {
  const canonical = scanCanonicalFixtures(args.dataRoot);
  const standings = scanStandings(args.dataRoot);
  const history = scanHistory(args.dataRoot, args.seasonKey);
  const dayActivity = scanDayActivity(args.dataRoot, args.date);
  const seasonWatch = scanSeasonWatch(args.dataRoot);
  const seasonStatus = scanSeasonStatus(args.dataRoot, args.seasonKey);

  const leagueSlugs = new Set();
  for (const map of [canonical, standings, history, dayActivity, seasonWatch, seasonStatus]) {
    for (const leagueSlug of map.keys()) leagueSlugs.add(leagueSlug);
  }

  const windowEnd = addDays(args.date, args.daysAhead);

  const inventoryRows = Array.from(leagueSlugs).sort().map((leagueSlug) => {
    const c = canonical.get(leagueSlug) || {};
    const s = standings.get(leagueSlug) || {};
    const h = history.get(leagueSlug) || {};
    const d = dayActivity.get(leagueSlug) || {};
    const w = seasonWatch.get(leagueSlug) || {};
    const ss = seasonStatus.get(leagueSlug) || {};

    const counts = c.canonicalFixtureCountByDate || {};
    const dates = Object.keys(counts).sort();

    let nextWindowCount = 0;
    for (const date of dates) {
      if (date >= args.date && date <= windowEnd) nextWindowCount += Number(counts[date] || 0);
    }

    const pastFixtureCount = dates
      .filter((date) => date < args.date)
      .reduce((sum, date) => sum + Number(counts[date] || 0), 0);

    const pastFinalCount = asArray(c.finalFixtureDates).filter((date) => date < args.date).length;
    const missingFTCount = Math.max(0, pastFixtureCount - pastFinalCount);

    const canonicalFixtureCountToday = Number(counts[args.date] || 0);
    const dayState = asText(d.dayActivityState);
    const standingsExists = s.standingsFileExists === true;
    const seasonStatusExists = ss.seasonStatusStateExists === true;

    const needsFixtureAcquisition = canonicalFixtureCountToday === 0 && dayState !== "no_expected_fixtures_for_day";
    const needsDayActivityEvidence = !dayState;
    const needsFTRepair = missingFTCount > 0;
    const needsStandingsRefresh = !standingsExists || Number(s.standingsTableCount || 0) === 0;
    const needsSeasonStatus = !seasonStatusExists;

    let priority = "monitor";
    if (needsSeasonStatus) priority = "season_status";
    if (needsFTRepair) priority = "ft_repair";
    if (needsFixtureAcquisition) priority = "fixture_acquisition";
    if (needsFixtureAcquisition && needsSeasonStatus) priority = "fixture_acquisition_and_season_status";
    if (needsFTRepair && needsSeasonStatus) priority = "ft_repair_and_season_status";

    return {
      leagueSlug,
      leagueName: asText(c.leagueName),
      targetDate: args.date,
      seasonKey: args.seasonKey,
      canonicalFixtureCountToday,
      canonicalFixtureCountNextWindow: nextWindowCount,
      canonicalFixtureCountTotal: Number(c.canonicalFixtureCountTotal || 0),
      lastKnownFixtureDate: maxDate(dates.filter((date) => date <= args.date)),
      nextKnownCanonicalFixtureDate: minDate(dates.filter((date) => date > args.date)),
      verifiedFTCount: asArray(c.finalFixtureDates).length,
      lastVerifiedFTDate: maxDate(asArray(c.finalFixtureDates)),
      missingFTCount,
      standingsFileExists: standingsExists,
      standingsSeason: asText(s.standingsSeason),
      standingsTableCount: Number(s.standingsTableCount || 0),
      standingsPhaseKeys: asArray(s.standingsPhaseKeys),
      historyRowsCount: Number(h.historyRowsCount || 0),
      historyFinalRowsCount: Number(h.historyFinalRowsCount || 0),
      lastHistoryDate: maxDate(asArray(h.historyDates)),
      dayActivityState: dayState,
      dayActivityEvidenceState: asText(d.dayActivityEvidenceState),
      dayActivityNextKnownFixtureDate: asText(d.dayActivityNextKnownFixtureDate),
      seasonWatchNextKnownFixtureDate: asText(w.seasonWatchNextKnownFixtureDate),
      seasonStatusStateExists: seasonStatusExists,
      seasonStatus: asText(ss.seasonStatus),
      seasonStatusEvidenceState: asText(ss.seasonStatusEvidenceState),
      needsFixtureAcquisition,
      needsDayActivityEvidence,
      needsFTRepair,
      needsStandingsRefresh,
      needsSeasonStatus,
      priority
    };
  });

  const priorityCounts = {};
  for (const row of inventoryRows) {
    priorityCounts[row.priority] = (priorityCounts[row.priority] || 0) + 1;
  }

  return {
    ok: true,
    job: "build-football-truth-state-inventory-file",
    mode: "read_only_inventory",
    generatedAt: new Date().toISOString(),
    summary: {
      targetDate: args.date,
      seasonKey: args.seasonKey,
      daysAhead: args.daysAhead,
      leagueCount: inventoryRows.length,
      canonicalFixtureTodayLeagueCount: inventoryRows.filter((row) => row.canonicalFixtureCountToday > 0).length,
      canonicalFixtureNextWindowLeagueCount: inventoryRows.filter((row) => row.canonicalFixtureCountNextWindow > 0).length,
      missingFTLeagueCount: inventoryRows.filter((row) => row.needsFTRepair).length,
      standingsFileCount: inventoryRows.filter((row) => row.standingsFileExists).length,
      historyLeagueCount: inventoryRows.filter((row) => row.historyRowsCount > 0).length,
      dayActivityStateCount: inventoryRows.filter((row) => row.dayActivityState).length,
      seasonWatchStateCount: inventoryRows.filter((row) => row.seasonWatchNextKnownFixtureDate).length,
      seasonStatusStateCount: inventoryRows.filter((row) => row.seasonStatusStateExists).length,
      needsFixtureAcquisitionCount: inventoryRows.filter((row) => row.needsFixtureAcquisition).length,
      needsDayActivityEvidenceCount: inventoryRows.filter((row) => row.needsDayActivityEvidence).length,
      needsFTRepairCount: inventoryRows.filter((row) => row.needsFTRepair).length,
      needsStandingsRefreshCount: inventoryRows.filter((row) => row.needsStandingsRefresh).length,
      needsSeasonStatusCount: inventoryRows.filter((row) => row.needsSeasonStatus).length,
      priorityCounts,
      canonicalWrites: 0,
      productionWrite: false
    },
    inventoryRows,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      noFixtureWrites: true,
      noHistoryWrites: true,
      noValueWrites: true,
      noDetailsWrites: true
    }
  };
}

function runSelfTest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-truth-inventory-"));
  const dataRoot = path.join(root, "data");

  writeJson(path.join(dataRoot, "canonical-fixtures", "2026-05-30", "eng.1.json"), {
    dayKey: "2026-05-30",
    leagueSlug: "eng.1",
    leagueName: "Premier League",
    fixtures: [
      { leagueSlug: "eng.1", dayKey: "2026-05-30", status: "PRE" }
    ]
  });

  writeJson(path.join(dataRoot, "canonical-fixtures", "2026-06-01", "swe.1.json"), {
    dayKey: "2026-06-01",
    leagueSlug: "swe.1",
    leagueName: "Allsvenskan",
    fixtures: [
      { leagueSlug: "swe.1", dayKey: "2026-06-01", status: "FT" }
    ]
  });

  writeJson(path.join(dataRoot, "standings", "eng.1.json"), {
    leagueSlug: "eng.1",
    season: "2025-2026",
    table: [{ team: "A", played: 38 }]
  });

  writeJson(path.join(dataRoot, "history", "2025-2026.json"), [
    { leagueSlug: "eng.1", dayKey: "2026-05-29", status: "FT" }
  ]);

  writeJson(path.join(dataRoot, "football-truth", "_state", "league-day-activity", "2026-06-01.json"), {
    dayActivityRows: [
      { leagueSlug: "eng.1", activityState: "no_expected_fixtures_for_day", nextKnownFixtureDate: "2026-08-15" }
    ]
  });

  const report = buildInventory({
    date: "2026-06-01",
    seasonKey: "2025-2026",
    dataRoot,
    daysAhead: 7
  });

  const eng = report.inventoryRows.find((row) => row.leagueSlug === "eng.1");
  const swe = report.inventoryRows.find((row) => row.leagueSlug === "swe.1");

  if (!eng) throw new Error("self-test failed: missing eng.1");
  if (!swe) throw new Error("self-test failed: missing swe.1");
  if (eng.dayActivityState !== "no_expected_fixtures_for_day") throw new Error("self-test failed: day activity not loaded");
  if (!eng.standingsFileExists) throw new Error("self-test failed: standings not loaded");
  if (eng.missingFTCount !== 1) throw new Error("self-test failed: expected missing FT count 1");
  if (swe.canonicalFixtureCountToday !== 1) throw new Error("self-test failed: expected swe today fixture count 1");
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) throw new Error("self-test failed: guarantees");

  return {
    ok: true,
    selfTest: "build-football-truth-state-inventory-file",
    summary: report.summary
  };
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
    job: report.job,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();