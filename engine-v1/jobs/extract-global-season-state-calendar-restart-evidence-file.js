#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

function parseArgs(argv) {
  const args = {
    input: "",
    output: "",
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--self-test") {
      args.selfTest = true;
    } else if (arg === "--input") {
      args.input = argv[++i] || "";
    } else if (arg === "--output") {
      args.output = argv[++i] || "";
    } else {
      throw new Error(`unknown or incomplete argument: ${arg}`);
    }
  }

  return args;
}

function hostClass(hostname) {
  const host = asText(hostname).toLowerCase();

  if (!host) return "unknown";
  if (
    host === "premierleague.com" ||
    host === "laliga.com" ||
    host === "bundesliga.com" ||
    host === "uefa.com" ||
    host.endsWith(".uefa.com")
  ) {
    return "official_competition";
  }

  if (
    host === "skysports.com" ||
    host === "bbc.co.uk" ||
    host === "bbc.com" ||
    host === "espn.com" ||
    host === "kicker.de" ||
    host === "kicker.at"
  ) {
    return "trusted_sports_media";
  }

  if (
    host === "livesport.com" ||
    host === "flashscore.com" ||
    host.includes("flashscore")
  ) {
    return "trusted_fixture_aggregator";
  }

  if (
    host === "manutd.com" ||
    host.endsWith(".com") && host.includes("manutd")
  ) {
    return "club_source_mentions_competition_calendar";
  }

  if (
    host.includes("imdb") ||
    host.includes("fandom") ||
    host.includes("seriale")
  ) {
    return "non_football_noise";
  }

  return "other";
}

function hasCalendarSignal(row) {
  const text = `${asText(row.query)} ${asText(row.title)} ${asText(row.snippet)} ${asText(row.url || row.candidateUrl)}`.toLowerCase();

  return (
    text.includes("fixture") ||
    text.includes("fixtures") ||
    text.includes("schedule") ||
    text.includes("calendar") ||
    text.includes("season start") ||
    text.includes("start date") ||
    text.includes("restart") ||
    text.includes("dates confirmed") ||
    text.includes("key dates") ||
    text.includes("scores-fixtures") ||
    text.includes("matches")
  );
}

function hasCompetitionSignal(row) {
  const slug = asText(row.leagueSlug);
  const text = `${asText(row.query)} ${asText(row.title)} ${asText(row.snippet)} ${asText(row.url || row.candidateUrl)}`.toLowerCase();

  const signalsBySlug = {
    "eng.1": ["premier league", "english premier league", "eng.1"],
    "esp.1": ["laliga", "la liga", "spanish la liga", "esp.1"],
    "ger.1": ["bundesliga", "german bundesliga", "ger.1"],
    "ita.1": ["serie a", "italian serie a", "ita.1"],
    "fra.1": ["ligue 1", "fra.1"],
    "ned.1": ["eredivisie", "ned.1"],
    "por.1": ["primeira liga", "por.1"],
    "uefa.champions": ["champions league", "uefa champions league", "uefa.champions"]
  };

  const signals = signalsBySlug[slug] || [];
  return signals.some((signal) => text.includes(signal));
}

function extractExplicitDates(row) {
  const text = `${asText(row.title)} ${asText(row.snippet)} ${asText(row.url || row.candidateUrl)}`;
  const results = [];

  const isoMatches = text.match(/\b20\d{2}-\d{2}-\d{2}\b/g) || [];
  for (const value of isoMatches) {
    results.push({
      dateText: value,
      normalizedDate: value,
      evidenceType: "iso_date"
    });
  }

  const monthPattern = /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/gi;
  const monthMap = {
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12"
  };

  for (const match of text.matchAll(monthPattern)) {
    const day = String(match[1]).padStart(2, "0");
    const month = monthMap[String(match[2]).toLowerCase()];
    const year = match[3];
    results.push({
      dateText: match[0],
      normalizedDate: `${year}-${month}-${day}`,
      evidenceType: "english_long_date"
    });
  }

  return results;
}

function seasonLabelFromText(row) {
  const text = `${asText(row.title)} ${asText(row.snippet)} ${asText(row.url || row.candidateUrl)}`;
  const match = text.match(/\b(20\d{2})\s*[\/-]\s*(\d{2})\b/);
  if (!match) return "";
  return `${match[1]}/${match[2]}`;
}

function evidenceNeed(row) {
  const query = asText(row.query).toLowerCase();
  const targetId = asText(row.searchTargetId).toLowerCase();

  if (query.includes("season start") || query.includes("start date")) return "season_start_date";
  if (query.includes("next fixture") || targetId.includes("::02")) return "next_known_fixture_date";
  if (query.includes("restart")) return "restart_date";
  return "competition_calendar";
}

function sourceDecision(row, sourceSet) {
  const cls = hostClass(row.hostname);
  const calendarSignal = hasCalendarSignal(row);
  const competitionSignal = hasCompetitionSignal(row);
  const officialOrTrusted = [
    "official_competition",
    "trusted_sports_media",
    "trusted_fixture_aggregator",
    "club_source_mentions_competition_calendar"
  ].includes(cls);

  if (cls === "non_football_noise") {
    return {
      accepted: false,
      state: "rejected_noise",
      reasons: ["non_football_noise_host"]
    };
  }

  if (officialOrTrusted && calendarSignal && (competitionSignal || cls === "official_competition")) {
    return {
      accepted: true,
      state: sourceSet === "rejectedRows" ? "rescued_calendar_restart_candidate" : "accepted_calendar_restart_candidate",
      reasons: [
        `hostClass:${cls}`,
        calendarSignal ? "calendar_signal_present" : "",
        competitionSignal ? "competition_signal_present" : "",
        sourceSet === "rejectedRows" ? "rescued_from_fixture_validator_rejection" : ""
      ].filter(Boolean)
    };
  }

  if (officialOrTrusted && calendarSignal) {
    return {
      accepted: true,
      state: "needs_fetch_confirmation",
      reasons: [
        `hostClass:${cls}`,
        "calendar_signal_present",
        "competition_signal_not_confirmed_from_search_surface"
      ]
    };
  }

  return {
    accepted: false,
    state: "rejected_weak_calendar_restart_signal",
    reasons: [
      `hostClass:${cls}`,
      calendarSignal ? "calendar_signal_present" : "calendar_signal_missing",
      competitionSignal ? "competition_signal_present" : "competition_signal_missing"
    ]
  };
}

function normalizeRow(row, sourceSet, index) {
  const url = asText(row.url || row.candidateUrl);
  const dates = extractExplicitDates(row);
  const decision = sourceDecision(row, sourceSet);
  const need = evidenceNeed(row);
  const seasonLabel = seasonLabelFromText(row);

  let evidenceState = decision.state;
  if (decision.accepted && dates.length === 0) {
    evidenceState = "needs_fetch_confirmation";
  }

  return {
    calendarRestartEvidenceId: `${asText(row.searchTargetId) || "unknown"}::${sourceSet}::${String(index + 1).padStart(3, "0")}`,
    searchTargetId: asText(row.searchTargetId),
    leagueSlug: asText(row.leagueSlug),
    competitionSlug: asText(row.competitionSlug || row.leagueSlug),
    dayKey: asText(row.dayKey),
    query: asText(row.query),
    evidenceNeed: need,
    evidenceState,
    acceptedForFetchPlanning: decision.accepted,
    seasonLabel,
    extractedDates: dates,
    proposedDateField: need,
    proposedDate: dates.length === 1 ? dates[0].normalizedDate : null,
    proposedDateConfidence: dates.length === 1 && decision.accepted ? "search_surface_exact_date" : "needs_fetch_confirmation",
    source: {
      title: asText(row.title),
      snippet: asText(row.snippet),
      url,
      hostname: asText(row.hostname),
      provider: asText(row.provider),
      hostClass: hostClass(row.hostname),
      sourceSet
    },
    decisionReasons: decision.reasons,
    originalErrors: Array.isArray(row.errors) ? row.errors : [],
    originalWarnings: Array.isArray(row.warnings) ? row.warnings : [],
    sourceFetch: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function buildReport(input, options = {}) {
  const validRows = Array.isArray(input.validSearchResultRows) ? input.validSearchResultRows : [];
  const rejectedRows = Array.isArray(input.rejectedRows) ? input.rejectedRows : [];

  const normalized = [
    ...validRows.map((row, index) => normalizeRow(row, "validSearchResultRows", index)),
    ...rejectedRows.map((row, index) => normalizeRow(row, "rejectedRows", index))
  ];

  const accepted = normalized.filter((row) => row.acceptedForFetchPlanning);
  const rejected = normalized.filter((row) => !row.acceptedForFetchPlanning);

  const countBy = (rows, key) => rows.reduce((acc, row) => {
    const value = asText(row[key]) || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});

  return {
    ok: true,
    job: "extract-global-season-state-calendar-restart-evidence-file",
    generatedAt: new Date().toISOString(),
    inputPath: options.inputPath || "",
    summary: {
      inputValidSearchResultRowCount: validRows.length,
      inputRejectedRowCount: rejectedRows.length,
      calendarRestartEvidenceRowCount: normalized.length,
      acceptedForFetchPlanningCount: accepted.length,
      rejectedEvidenceRowCount: rejected.length,
      exactDateCandidateCount: accepted.filter((row) => row.proposedDate).length,
      needsFetchConfirmationCount: accepted.filter((row) => row.evidenceState === "needs_fetch_confirmation").length,
      rescuedFromFixtureValidatorCount: accepted.filter((row) => row.source.sourceSet === "rejectedRows").length,
      byLeague: countBy(accepted, "leagueSlug"),
      byEvidenceNeed: countBy(accepted, "evidenceNeed"),
      byEvidenceState: countBy(accepted, "evidenceState"),
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    calendarRestartEvidenceRows: accepted,
    rejectedCalendarRestartEvidenceRows: rejected,
    guarantees: {
      noWebSearch: true,
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function runSelfTest() {
  const input = {
    validSearchResultRows: [
      {
        searchTargetId: "eng.1::calendar_restart_discovery::03",
        leagueSlug: "eng.1",
        query: "Premier League season start date",
        title: "Premier League 26/27 season start date is 22 August 2026",
        url: "https://www.skysports.com/example",
        hostname: "skysports.com",
        provider: "self"
      }
    ],
    rejectedRows: [
      {
        searchTargetId: "eng.1::calendar_restart_discovery::03",
        leagueSlug: "eng.1",
        query: "Premier League season start date",
        title: "Dates for 2026/27 Premier League season confirmed",
        candidateUrl: "https://www.premierleague.com/en/news/4468487/dates-for-202627-premier-league-season-confirmed",
        hostname: "premierleague.com",
        provider: "self",
        errors: ["target_competition_not_confirmed", "fixture_source_signal_missing"]
      },
      {
        searchTargetId: "ita.1::calendar_restart_discovery::03",
        leagueSlug: "ita.1",
        query: "Serie A season start date",
        title: "imdb.com chart top tv",
        candidateUrl: "https://www.imdb.com/chart/toptv/",
        hostname: "imdb.com",
        provider: "self",
        errors: ["target_competition_not_confirmed"]
      }
    ]
  };

  const report = buildReport(input, { inputPath: "self-test" });

  if (report.summary.calendarRestartEvidenceRowCount !== 3) throw new Error("expected 3 evidence rows");
  if (report.summary.acceptedForFetchPlanningCount !== 2) throw new Error("expected 2 accepted rows");
  if (report.summary.rescuedFromFixtureValidatorCount !== 1) throw new Error("expected 1 rescued official row");
  if (report.summary.exactDateCandidateCount !== 1) throw new Error("expected 1 exact date candidate");
  if (report.summary.needsFetchConfirmationCount !== 1) throw new Error("expected 1 needs fetch confirmation row");
  if (report.guarantees.sourceFetch !== false || report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("read-only guarantees failed");
  }

  console.log(JSON.stringify({
    ok: true,
    selfTest: "extract-global-season-state-calendar-restart-evidence-file",
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.selfTest) {
    runSelfTest();
    return;
  }

  if (!args.input) throw new Error("--input is required");
  if (!args.output) throw new Error("--output is required");

  const input = readJson(args.input);
  const report = buildReport(input, { inputPath: args.input });
  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();