#!/usr/bin/env node

import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);

function parseArgs(argv) {
  const args = {
    input: "",
    date: "",
    outputDir: "",
    leagueDayActivityOutput: "",
    seasonWatchOutput: "",
    selfTest: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") {
      args.selfTest = true;
    } else if (arg === "--input") {
      args.input = argv[++i] || "";
    } else if (arg.startsWith("--input=")) {
      args.input = arg.slice("--input=".length);
    } else if (arg === "--date") {
      args.date = argv[++i] || "";
    } else if (arg.startsWith("--date=")) {
      args.date = arg.slice("--date=".length);
    } else if (arg === "--output-dir") {
      args.outputDir = argv[++i] || "";
    } else if (arg.startsWith("--output-dir=")) {
      args.outputDir = arg.slice("--output-dir=".length);
    } else if (arg === "--league-day-activity-output") {
      args.leagueDayActivityOutput = argv[++i] || "";
    } else if (arg.startsWith("--league-day-activity-output=")) {
      args.leagueDayActivityOutput = arg.slice("--league-day-activity-output=".length);
    } else if (arg === "--season-watch-output") {
      args.seasonWatchOutput = argv[++i] || "";
    } else if (arg.startsWith("--season-watch-output=")) {
      args.seasonWatchOutput = arg.slice("--season-watch-output=".length);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return args;
}

function asText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDate(value) {
  const text = asText(value);
  if (!text) return "";
  const match = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function rowText(row) {
  const fields = [
    row.title,
    row.url,
    row.resolvedUrl,
    row.finalUrl,
    row.host,
    row.hostname,
    row.classification,
    row.reason,
    row.evidenceTextSnippet,
    row.textSnippet,
    row.snippet,
    row.summary,
    row.description,
    row.bodyText,
    row.plainText,
    row.text,
    row.rawText,
    row.fixtureText,
    row.evidenceText
  ];

  return fields
    .flatMap((value) => {
      if (Array.isArray(value)) return value.map(asText);
      if (value && typeof value === "object") return Object.values(value).map(asText);
      return [asText(value)];
    })
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function seasonActivitySourceHint(row) {
  const text = [
    row.fetchPurpose,
    row.sourceType,
    row.extractionState,
    row.classification,
    row.reason,
    row.sourceTitle,
    row.title,
    row.sourceUrl,
    row.resolvedUrl,
    row.finalUrl,
    row.host,
    row.hostname
  ].map(asText).join(" ").toLowerCase();

  return /season_activity|season|restart|calendar|no_fixture|no-fixture|schedule_release|fixtures_released|candidate_league_season_activity/.test(text);
}

function noFixtureDaySignal(text) {
  const lower = asText(text).toLowerCase();
  return /\b(no fixtures|no matches|no games|no scheduled matches|no scheduled fixtures|no upcoming fixtures|season has ended|season ended|end of season|league has finished|competition has finished|regular season complete|campaign concluded)\b/.test(lower);
}

function restartSignal(text) {
  const lower = asText(text).toLowerCase();
  return /\b(fixtures released|fixture list|schedule released|season starts|season begins|season kicks off|opening day|restart|restarts|resumes|returns|next season|new season)\b/.test(lower);
}

function parseMonthDateCandidates(text, referenceDate) {
  const lower = asText(text).toLowerCase();
  const referenceYear = Number((normalizeDate(referenceDate) || todayIsoDate()).slice(0, 4));

  const monthMap = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12
  };

  const candidates = [];

  const patterns = [
    /\b(?:starts|start|begins|begin|resumes|resume|restart|restarts|returns|return|kicks off|kick off|opening day|season starts|season begins)\s+(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)(?:\s+(20\d{2}))?\b/g,
    /\b(?:starts|start|begins|begin|resumes|resume|restart|restarts|returns|return|kicks off|kick off|opening day|season starts|season begins)\s+(?:on\s+)?([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*|\s+)?(20\d{2})?\b/g,
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s+(20\d{2})\b/g,
    /\b([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*|\s+)(20\d{2})\b/g
  ];

  function pushDate(year, month, day) {
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return;
    if (month < 1 || month > 12 || day < 1 || day > 31) return;
    candidates.push(`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(lower)) !== null) {
      if (monthMap[match[2]]) {
        pushDate(Number(match[3] || referenceYear), monthMap[match[2]], Number(match[1]));
      } else if (monthMap[match[1]]) {
        pushDate(Number(match[3] || referenceYear), monthMap[match[1]], Number(match[2]));
      }
    }
  }

  return unique(candidates).sort();
}

function parseIsoDateCandidates(text) {
  const matches = asText(text).match(/\b20\d{2}-\d{2}-\d{2}\b/g);
  return unique(matches || []).sort();
}

function targetDateVisible(row, targetDate, text) {
  if (row.targetDateVisible === true) return true;
  if (row.dayKey === targetDate || row.targetDate === targetDate || row.date === targetDate) return true;
  return asText(text).includes(targetDate);
}

function hasFixtureEvidence(row, targetDate, text) {
  if (Number(row.embeddedFixtureEvidenceCount || 0) > 0) return true;
  if (Number(row.fixtureEvidenceCount || 0) > 0) return true;
  if (Array.isArray(row.fixtureEvidenceRows) && row.fixtureEvidenceRows.length > 0) return true;
  if (Array.isArray(row.fixtures) && row.fixtures.length > 0) return true;

  const classification = asText(row.classification).toLowerCase();
  const reason = asText(row.reason).toLowerCase();
  const lower = asText(text).toLowerCase();

  if (
    classification.includes("no_match") ||
    classification.includes("no_fixture") ||
    classification.includes("no_matches") ||
    classification.includes("no_fixtures") ||
    classification.includes("calendar") ||
    classification.includes("standings")
  ) {
    return false;
  }

  if (
    classification.includes("embedded_fixture") ||
    classification.includes("fixture_surface_embedded_fixtures") ||
    classification.includes("fixture_rows")
  ) {
    return targetDateVisible(row, targetDate, text) || /\b\d{1,2}:\d{2}\b/.test(lower);
  }

  if (
    reason.includes("target date fixture rows detected") ||
    reason.includes("embedded fixture") ||
    reason.includes("fixture rows detected")
  ) {
    return targetDateVisible(row, targetDate, text) || /\b\d{1,2}:\d{2}\b/.test(lower);
  }

  return false;
}

function classifyRow(row, targetDate) {
  const text = rowText(row);
  const lower = text.toLowerCase();
  const isoDates = parseIsoDateCandidates(text);
  const monthDates = parseMonthDateCandidates(text, targetDate);
  const nextDateCandidates = unique([...isoDates, ...monthDates])
    .filter((date) => !targetDate || date > targetDate)
    .sort();

  const fixtureEvidence = hasFixtureEvidence(row, targetDate, text);
  const visibleTarget = targetDateVisible(row, targetDate, text);

  const outOfSeasonSignals = [
    /\bseason\s+(has\s+)?ended\b/,
    /\bend of season\b/,
    /\boff[-\s]?season\b/,
    /\bclosed season\b/,
    /\bnew season\b/,
    /\b2026\/27\b/,
    /\b2026-27\b/,
    /\bfixtures? (?:will be|are) released\b/,
    /\bfixture list\b.*\breleased\b/
  ];

  const restartSignals = [
    /\bseason\s+(starts|begins|resumes|restarts)\b/,
    /\b(opening day|kick[-\s]?off|kicks off)\b/,
    /\breturns on\b/,
    /\bstarts on\b/,
    /\bbegins on\b/,
    /\bresumes on\b/
  ];

  const noExpectedSignals = [
    /\bno fixtures?\b/,
    /\bno matches?\b/,
    /\bno games?\b/,
    /\bnot scheduled\b/,
    /\bno scheduled matches?\b/,
    /\bthere are no\b.*\b(fixtures|matches|games)\b/
  ];

  const breakSignals = [
    /\binternational break\b/,
    /\bwinter break\b/,
    /\bmid[-\s]?season break\b/,
    /\bcalendar gap\b/,
    /\bbreak\b.*\b(fixtures|matches|league)\b/
  ];

  const outOfSeason = outOfSeasonSignals.some((regex) => regex.test(lower));
  const restart = restartSignals.some((regex) => regex.test(lower));
  const noExpected = noExpectedSignals.some((regex) => regex.test(lower));
  const breakGap = breakSignals.some((regex) => regex.test(lower));

  const evidenceSignals = [];
  if (fixtureEvidence) evidenceSignals.push("fixture_evidence_signal");
  if (visibleTarget) evidenceSignals.push("target_date_visible");
  if (outOfSeason) evidenceSignals.push("out_of_season_signal");
  if (restart) evidenceSignals.push("restart_signal");
  if (noExpected) evidenceSignals.push("no_expected_fixture_signal");
  if (breakGap) evidenceSignals.push("break_or_calendar_gap_signal");
  if (nextDateCandidates.length > 0) evidenceSignals.push("next_date_candidate");

  return {
    leagueSlug: asText(row.leagueSlug),
    leagueName: asText(row.leagueName || row.name),
    country: asText(row.country),
    targetDate,
    sourceUrl: asText(row.resolvedUrl || row.finalUrl || row.url || row.candidateUrl),
    host: asText(row.hostname || row.host),
    classification: asText(row.classification),
    reason: asText(row.reason),
    evidenceTextSnippet: text.slice(0, 500),
    targetDateVisible: visibleTarget,
    fixtureEvidence,
    outOfSeason,
    restart,
    noExpected,
    breakGap,
    nextDateCandidates,
    evidenceSignals
  };
}

function selectInputRows(input) {
  if (Array.isArray(input)) return input;

  for (const key of [
    "dayActivityEvidenceRows",
    "evidenceRows",
    "fixtureEvidenceRows",
    "classifiedRows",
    "fetchedSourceSnapshots",
    "fetchedSnapshots",
    "rows",
    "snapshots"
  ]) {
    if (Array.isArray(input?.[key])) return input[key];
  }

  return [];
}

function decideLeagueActivity(leagueSlug, rows, targetDate) {
  const parsed = rows.map((row) => classifyRow(row, targetDate));
  const fixtureRows = parsed.filter((row) => row.fixtureEvidence && (row.targetDateVisible || row.evidenceSignals.includes("target_date_visible")));
  const outRows = parsed.filter((row) => row.outOfSeason || row.restart);
  const noExpectedRows = parsed.filter((row) => row.noExpected);
  const breakRows = parsed.filter((row) => row.breakGap);
  const nextKnownFixtureDate = unique(parsed.flatMap((row) => row.nextDateCandidates)).sort()[0] || null;

  let activityState = "needs_more_day_activity_evidence";
  let dayActivityEvidenceState = "insufficient_day_activity_evidence";
  let activeForDay = false;
  let noExpectedFixturesForDay = false;
  let outOfSeasonForDay = false;
  let restartEvidenceState = nextKnownFixtureDate ? "restart_date_candidate_needs_second_source" : "no_restart_date_candidate";
  let activityReason = "no_decisive_day_activity_evidence";

  if (fixtureRows.length >= 1) {
    activityState = "active_for_day";
    dayActivityEvidenceState = fixtureRows.length >= 2 ? "fixture_evidence_verified" : "fixture_evidence_candidate";
    activeForDay = true;
    restartEvidenceState = "not_applicable_active_for_day";
    activityReason = "target_date_fixture_evidence_found";
  } else if (outRows.length >= 1 && nextKnownFixtureDate) {
    activityState = "no_expected_fixtures_for_day";
    dayActivityEvidenceState = outRows.length >= 2 ? "target_date_no_fixture_calendar_context_verified" : "target_date_no_fixture_calendar_context_candidate";
    outOfSeasonForDay = false;
    noExpectedFixturesForDay = true;
    activityReason = "target_date_no_fixture_calendar_or_restart_context_found";
  } else if (noExpectedRows.length >= 1) {
    activityState = "no_expected_fixtures_for_day";
    dayActivityEvidenceState = noExpectedRows.length >= 2 ? "no_fixture_day_verified" : "no_fixture_day_candidate";
    noExpectedFixturesForDay = true;
    activityReason = "no_expected_fixture_evidence_found";
  } else if (breakRows.length >= 1) {
    activityState = "break_or_calendar_gap";
    dayActivityEvidenceState = breakRows.length >= 2 ? "calendar_gap_verified" : "calendar_gap_candidate";
    noExpectedFixturesForDay = true;
    activityReason = "break_or_calendar_gap_evidence_found";
  }

  const seasonCandidateRows = parsed.filter((row) => seasonActivitySourceHint(row.rawRow || row) || seasonActivitySourceHint(row));
  const noFixtureSeasonRows = seasonCandidateRows.filter((row) => noFixtureDaySignal(row.text || row.evidenceText || row.rawText || row.snippet || row.evidenceTextSnippet || row.reason));
  const restartSeasonRows = seasonCandidateRows.filter((row) => restartSignal(row.text || row.evidenceText || row.rawText || row.snippet || row.evidenceTextSnippet || row.reason));

  if (!activeForDay && seasonCandidateRows.length >= 1 && noExpectedRows.length === 0 && breakRows.length === 0) {
    activityState = "no_expected_fixtures_for_day";
    dayActivityEvidenceState = seasonCandidateRows.length >= 2 ? "target_date_no_fixture_context_verified" : "target_date_no_fixture_context_candidate";
    outOfSeasonForDay = false;
    noExpectedFixturesForDay = true;
    activityReason = restartSeasonRows.length > 0
      ? "target_date_no_fixture_restart_or_calendar_context_found"
      : "target_date_no_fixture_season_context_found";
  }

  if (!activeForDay && noFixtureSeasonRows.length >= 1) {
    activityState = "no_expected_fixtures_for_day";
    dayActivityEvidenceState = noFixtureSeasonRows.length >= 2 ? "no_fixture_on_target_date_verified" : "no_fixture_on_target_date_candidate";
    outOfSeasonForDay = false;
    noExpectedFixturesForDay = true;
    activityReason = "target_date_no_fixture_evidence_found";
  }

  const sourceUrls = unique(parsed.map((row) => row.sourceUrl));
  const hosts = unique(parsed.map((row) => row.host));

  return {
    leagueSlug,
    targetDate,
    activityState,
    dayActivityEvidenceState,
    activeForDay,
    noExpectedFixturesForDay,
    outOfSeasonForDay,
    nextKnownFixtureDate,
    restartEvidenceState,
    sourceCount: sourceUrls.length,
    hostCount: hosts.length,
    activityReason,
    evidenceSignals: unique(parsed.flatMap((row) => row.evidenceSignals)),
    evidenceRows: parsed,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function buildReport(input, options = {}) {
  const targetDate = normalizeDate(options.date || input?.date || input?.targetDate || input?.dayKey) || todayIsoDate();
  const rows = selectInputRows(input);

  const byLeague = new Map();

  for (const row of rows) {
    const leagueSlug = asText(row.leagueSlug || row.competitionSlug || row.slug);
    if (!leagueSlug) continue;
    if (!byLeague.has(leagueSlug)) byLeague.set(leagueSlug, []);
    byLeague.get(leagueSlug).push(row);
  }

  const dayActivityRows = Array.from(byLeague.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([leagueSlug, leagueRows]) => decideLeagueActivity(leagueSlug, leagueRows, targetDate));

  const seasonWatchRows = dayActivityRows
    .filter((row) => row.nextKnownFixtureDate)
    .map((row) => ({
      leagueSlug: row.leagueSlug,
      lastCheckedDate: targetDate,
      activityState: row.activityState,
      dayActivityEvidenceState: row.dayActivityEvidenceState,
      outOfSeasonForDay: row.outOfSeasonForDay,
      nextKnownFixtureDate: row.nextKnownFixtureDate,
      restartEvidenceState: row.restartEvidenceState,
      sourceCount: row.sourceCount,
      activityReason: row.activityReason,
      updatedAt: new Date().toISOString(),
      canonicalWrites: 0,
      productionWrite: false
    }));

  return {
    ok: true,
    job: "evaluate-fixture-league-day-activity-evidence-file",
    mode: "read_only_fixture_league_day_activity_evidence",
    generatedAt: new Date().toISOString(),
    date: targetDate,
    summary: {
      inputRowCount: rows.length,
      leagueCount: dayActivityRows.length,
      activeForDayCount: dayActivityRows.filter((row) => row.activeForDay).length,
      noExpectedFixturesForDayCount: dayActivityRows.filter((row) => row.noExpectedFixturesForDay).length,
      outOfSeasonForDayCount: dayActivityRows.filter((row) => row.outOfSeasonForDay).length,
      nextKnownFixtureDateCount: dayActivityRows.filter((row) => row.nextKnownFixtureDate).length,
      needsMoreEvidenceCount: dayActivityRows.filter((row) => row.activityState === "needs_more_day_activity_evidence").length,
      canonicalWrites: 0,
      productionWrite: false
    },
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      noFixtureWrites: true,
      noHistoryWrites: true,
      noValueWrites: true,
      noDetailsWrites: true,
      dryRun: true
    },
    dayActivityRows,
    seasonWatchRows
  };
}

function readExistingSeasonWatch(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      ok: true,
      job: "league-season-watch-state",
      rows: []
    };
  }

  const existing = readJson(filePath);
  return {
    ok: true,
    job: asText(existing.job) || "league-season-watch-state",
    rows: Array.isArray(existing.rows) ? existing.rows : []
  };
}

function mergeSeasonWatch(existing, newRows) {
  const byLeague = new Map();

  for (const row of asArray(existing.rows)) {
    const leagueSlug = asText(row.leagueSlug);
    if (leagueSlug) byLeague.set(leagueSlug, row);
  }

  for (const row of newRows) {
    const leagueSlug = asText(row.leagueSlug);
    if (leagueSlug) byLeague.set(leagueSlug, row);
  }

  return {
    ok: true,
    job: "league-season-watch-state",
    mode: "read_only_league_restart_watch_state",
    generatedAt: new Date().toISOString(),
    summary: {
      watchedLeagueCount: byLeague.size,
      nextKnownFixtureDateCount: Array.from(byLeague.values()).filter((row) => row.nextKnownFixtureDate).length,
      canonicalWrites: 0,
      productionWrite: false
    },
    rows: Array.from(byLeague.values()).sort((a, b) => asText(a.leagueSlug).localeCompare(asText(b.leagueSlug))),
    guarantees: {
      canonicalWrites: 0,
      productionWrite: false,
      noCanonicalPromotion: true
    }
  };
}

function run(input, options = {}) {
  const report = buildReport(input, options);
  const targetDate = report.date;

  const outputDir = options.outputDir || path.join("data", "football-truth", "_diagnostics", "day-activity", targetDate);
  const reportOutput = path.join(outputDir, "day-activity-evidence-report.json");
  const leagueDayActivityOutput = options.leagueDayActivityOutput || path.join("data", "football-truth", "_state", "league-day-activity", `${targetDate}.json`);
  const seasonWatchOutput = options.seasonWatchOutput || path.join("data", "football-truth", "_state", "league-season-watch", "league-season-watch.json");

  writeJson(reportOutput, report);

  writeJson(leagueDayActivityOutput, {
    ok: true,
    job: "league-day-activity-state",
    mode: "read_only_league_day_activity_state",
    generatedAt: report.generatedAt,
    date: targetDate,
    summary: report.summary,
    rows: report.dayActivityRows.map((row) => ({
      leagueSlug: row.leagueSlug,
      targetDate: row.targetDate,
      activityState: row.activityState,
      dayActivityEvidenceState: row.dayActivityEvidenceState,
      activeForDay: row.activeForDay,
      noExpectedFixturesForDay: row.noExpectedFixturesForDay,
      outOfSeasonForDay: row.outOfSeasonForDay,
      nextKnownFixtureDate: row.nextKnownFixtureDate,
      restartEvidenceState: row.restartEvidenceState,
      sourceCount: row.sourceCount,
      hostCount: row.hostCount,
      activityReason: row.activityReason,
      evidenceSignals: row.evidenceSignals,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    })),
    guarantees: report.guarantees
  });

  const seasonWatch = mergeSeasonWatch(readExistingSeasonWatch(seasonWatchOutput), report.seasonWatchRows);
  writeJson(seasonWatchOutput, seasonWatch);

  return {
    ...report,
    paths: {
      reportOutput,
      leagueDayActivityOutput,
      seasonWatchOutput
    }
  };
}

function runSelfTest() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-day-activity-"));
  const input = {
    date: "2026-05-31",
    evidenceRows: [
      {
        leagueSlug: "eng.1",
        targetDate: "2026-05-31",
        title: "Premier League fixtures",
        evidenceTextSnippet: "The Premier League season has ended. The new season starts on 15 August 2026.",
        resolvedUrl: "https://www.premierleague.com/fixtures"
      },
      {
        leagueSlug: "usa.1",
        targetDate: "2026-05-31",
        targetDateVisible: true,
        embeddedFixtureEvidenceCount: 2,
        evidenceTextSnippet: "MLS fixtures 2026-05-31 LA Galaxy 19:30 San Jose",
        resolvedUrl: "https://www.mlssoccer.com/schedule"
      },
      {
        leagueSlug: "test.2",
        targetDate: "2026-05-31",
        evidenceTextSnippet: "There are no fixtures scheduled on 2026-05-31.",
        resolvedUrl: "https://example.com/no-fixtures"
      }
    ]
  };

  const result = run(input, {
    date: "2026-05-31",
    outputDir: path.join(tmpRoot, "diagnostics"),
    leagueDayActivityOutput: path.join(tmpRoot, "state", "league-day-activity", "2026-05-31.json"),
    seasonWatchOutput: path.join(tmpRoot, "state", "league-season-watch", "league-season-watch.json")
  });

  const eng = result.dayActivityRows.find((row) => row.leagueSlug === "eng.1");
  const usa = result.dayActivityRows.find((row) => row.leagueSlug === "usa.1");
  const test = result.dayActivityRows.find((row) => row.leagueSlug === "test.2");

  if (!eng || eng.activityState !== "no_expected_fixtures_for_day" || eng.outOfSeasonForDay !== false || eng.nextKnownFixtureDate !== "2026-08-15") {
    throw new Error("self-test failed: expected eng.1 no_expected_fixtures_for_day with restart date context only");
  }

  if (!usa || usa.activityState !== "active_for_day" || usa.activeForDay !== true) {
    throw new Error("self-test failed: expected usa.1 active_for_day");
  }

  if (!test || test.activityState !== "no_expected_fixtures_for_day" || test.noExpectedFixturesForDay !== true) {
    throw new Error("self-test failed: expected test.2 no_expected_fixtures_for_day");
  }

  for (const filePath of Object.values(result.paths)) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`self-test failed: missing output file ${filePath}`);
    }
  }

  if (result.guarantees.canonicalWrites !== 0 || result.guarantees.productionWrite !== false) {
    throw new Error("self-test failed: read-only guarantees changed");
  }

  return {
    ok: true,
    selfTest: "evaluate-fixture-league-day-activity-evidence-file",
    summary: result.summary,
    pathsWritten: result.paths,
    guarantees: result.guarantees
  };
}

function main() {
  const args = parseArgs(process.argv);

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  if (!args.input) {
    throw new Error("missing --input");
  }

  const input = readJson(args.input);
  const result = run(input, {
    date: args.date,
    outputDir: args.outputDir,
    leagueDayActivityOutput: args.leagueDayActivityOutput,
    seasonWatchOutput: args.seasonWatchOutput
  });

  console.log(JSON.stringify({
    ok: result.ok,
    job: result.job,
    mode: result.mode,
    date: result.date,
    summary: result.summary,
    paths: result.paths,
    guarantees: result.guarantees
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    main();
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  }
}

export {
  buildReport,
  run,
  classifyRow,
  decideLeagueActivity
};
