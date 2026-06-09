#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv = process.argv) {
  const args = {
    input: "",
    output: "",
    selfTest: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++i] || "";
    else if (arg.startsWith("--input=")) args.input = arg.slice("--input=".length);
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else throw new Error(`unknown argument: ${arg}`);
  }

  if (!args.selfTest && !args.input) throw new Error("--input is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");

  return args;
}

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function normalizeWhitespace(value) {
  return asText(value).replace(/\s+/g, " ").trim();
}

function stripHtml(value) {
  return normalizeWhitespace(asText(value).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
}

function readJson(filePath, label) {
  if (!filePath) throw new Error(`${label} path is required`);
  if (!fs.existsSync(filePath)) throw new Error(`${label} not found: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function statusOf(snapshot) {
  if (snapshot?.http?.status != null) return Number(snapshot.http.status);
  if (snapshot?.status != null && /^\d+$/.test(String(snapshot.status))) return Number(snapshot.status);
  return null;
}

function textOf(snapshot) {
  return asText(
    snapshot?.rawText ||
    snapshot?.rawHtml ||
    snapshot?.rawBody ||
    snapshot?.html ||
    snapshot?.http?.body ||
    snapshot?.http?.text ||
    snapshot?.bodyText ||
    snapshot?.body ||
    snapshot?.text ||
    snapshot?.plainText
  );
}

function sourceUrlOf(row, snapshot) {
  return asText(
    row?.finalUrl ||
    row?.resolvedUrl ||
    row?.sourceUrl ||
    snapshot?.http?.finalUrl ||
    snapshot?.finalUrl ||
    snapshot?.resolvedUrl ||
    snapshot?.candidateUrl ||
    snapshot?.url
  );
}

function hostnameOf(row, snapshot) {
  const explicit = asText(row?.hostname || snapshot?.hostname || snapshot?.host);
  if (explicit) return explicit;
  try {
    return new URL(sourceUrlOf(row, snapshot)).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function snapshotKey(snapshot) {
  return [
    asText(snapshot.taskId),
    asText(snapshot.leagueSlug || snapshot.competitionSlug),
    sourceUrlOf({}, snapshot),
    asText(snapshot.dayKey || snapshot.targetDate)
  ].join("::");
}

function classifiedKey(row) {
  return [
    asText(row.taskId),
    asText(row.leagueSlug || row.competitionSlug),
    sourceUrlOf(row, {}),
    asText(row.dayKey || row.targetDate)
  ].join("::");
}

function snapshotLooksLikeSeasonStatusRegistryCandidate(snapshot) {
  const fetchPurpose = asText(snapshot?.fetchPurpose);
  const reviewerDecision = asText(snapshot?.reviewerDecision);
  const sourceClass = asText(snapshot?.sourceClass);
  const sourceFamily = asText(snapshot?.sourceFamily);

  return (
    fetchPurpose === "season_status_official_registry_candidate_snapshot" ||
    reviewerDecision === "candidate_official_url_pending_fetch" ||
    sourceClass.includes("official") ||
    sourceFamily === "official_league"
  );
}

function classifiedRowFromFetchedSnapshot(snapshot) {
  if (!snapshotLooksLikeSeasonStatusRegistryCandidate(snapshot)) return null;

  const leagueSlug = asText(snapshot?.leagueSlug || snapshot?.competitionSlug);
  if (!leagueSlug) return null;

  return {
    taskId: asText(snapshot?.fetchTaskId || snapshot?.sourceTaskId || snapshot?.taskId),
    leagueSlug,
    competitionSlug: asText(snapshot?.competitionSlug || snapshot?.leagueSlug),
    name: asText(snapshot?.name || snapshot?.competitionName),
    competitionName: asText(snapshot?.competitionName || snapshot?.name),
    dayKey: asText(snapshot?.dayKey || snapshot?.targetDate),
    targetDate: asText(snapshot?.targetDate || snapshot?.dayKey),
    seasonKey: asText(snapshot?.seasonKey),
    sourceType: "season_status_official_primary",
    sourceClass: asText(snapshot?.sourceClass || "official_governing_or_competition_operator"),
    fetchPurpose: "season_activity_status_calendar",
    classification: "candidate_league_season_activity_evidence_needs_validation",
    finalUrl: sourceUrlOf({}, snapshot),
    resolvedUrl: asText(snapshot?.resolvedUrl || snapshot?.finalUrl || snapshot?.candidateUrl),
    candidateUrl: asText(snapshot?.candidateUrl || snapshot?.finalUrl || snapshot?.resolvedUrl),
    hostname: hostnameOf({}, snapshot),
    status: statusOf(snapshot),
    readyForFetch: snapshot?.readyForFetch === true,
    sourceFetch: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function dedupeRows(rows) {
  const seen = new Set();
  const out = [];

  for (const row of rows) {
    const key = [
      asText(row?.taskId),
      asText(row?.leagueSlug || row?.competitionSlug),
      asText(row?.finalUrl || row?.resolvedUrl || row?.candidateUrl || row?.sourceUrl),
      asText(row?.dayKey || row?.targetDate)
    ].join("::");

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out;
}

function selectRows(input) {
  const classifiedRows = Array.isArray(input?.classifiedRows) ? input.classifiedRows : [];
  const selectedClassifiedRows = classifiedRows.filter((row) => row.classification === "candidate_league_season_activity_evidence_needs_validation");

  const snapshotRows = (Array.isArray(input?.fetchedSourceSnapshots) ? input.fetchedSourceSnapshots : [])
    .map(classifiedRowFromFetchedSnapshot)
    .filter(Boolean);

  return dedupeRows([
    ...selectedClassifiedRows,
    ...snapshotRows
  ]);
}

function snapshotsByKey(input) {
  const out = new Map();
  const snapshots = Array.isArray(input?.fetchedSourceSnapshots) ? input.fetchedSourceSnapshots : [];
  for (const snapshot of snapshots) out.set(snapshotKey(snapshot), snapshot);
  return out;
}

function fallbackSnapshot(row, input) {
  const snapshots = Array.isArray(input?.fetchedSourceSnapshots) ? input.fetchedSourceSnapshots : [];
  const rowLeague = asText(row.leagueSlug || row.competitionSlug);
  const rowUrl = sourceUrlOf(row, {});
  return snapshots.find((snapshot) => {
    const sameLeague = asText(snapshot.leagueSlug || snapshot.competitionSlug) === rowLeague;
    const sameUrl = !rowUrl || sourceUrlOf({}, snapshot) === rowUrl;
    return sameLeague && sameUrl;
  }) || {};
}

function sentenceAround(text, regex) {
  const match = regex.exec(text);
  if (!match) return "";
  const start = Math.max(0, match.index - 180);
  const end = Math.min(text.length, match.index + 320);
  return normalizeWhitespace(text.slice(start, end));
}

function signalFlags(plainText) {
  const text = normalizeWhitespace(plainText);
  const lower = text.toLowerCase();

  const fixturesSignal = /\b(fixtures?|matches|schedule|games|results|standings|tables?|fixtures? & results|spielplan|tabelle|program(?:ma)?|uitslagen|stand|matcher|resultat|resultater|terminliste|tabell|kalender|kampe|kamp|stilling|stillinger|zapasy|zapas|tabulka|tabulky|terminarz|tabela|wyniki|ottelut|tulokset|sarjataulukko|calendario|calendário|classificacao|classificação|resultados|jornada|raspored|tablica|utakmice|rezultati|leikir|urslit|úrslit|stada|staða|fikstur|puan|maclar|maçlar|sonuclar|sonuçlar)\b/i.test(text);
  const calendarSignal = /\b(calendar|dates?|matchday|round|qualifying|qualification|draw|program|programme|schedule|fixture list|match calendar|spielplan|tabelle|program(?:ma)?|uitslagen|stand|matcher|resultat|resultater|terminliste|tabell|kalender|final|kampprogram|turnering|turneringer|souteze|soutěže|rozgrywki|moot|mót|lig|liga|sezon|season)\b/i.test(text);
  const seasonLabelVisible = /\b20\d{2}\s*[-/]\s*\d{2,4}\b|\bseason\b|\bsezon\b|\bsæson\b|\bkausi\b|\btemporada\b|\bsezona\b/i.test(text);
  const restartSignal = /\b(restart|starts?|begins?|opening match|kick-?off|commences|returns|startuje|inicia|başlıyor|begynder|alkaa)\b/i.test(text);
  const noFixtureSignal = /\b(no fixtures?|no matches?|not scheduled|schedule not available|fixtures? to be confirmed|to be confirmed|tbc)\b/i.test(text);
  const officialCompetitionSignal = /\b(official|competition|league|cup|champions league|europa league|fixtures? & results|superliga|super lig|ekstraklasa|veikkausliiga|hnl|prva nl|fnliga|1\. liga|liga portugal|primeira liga|taca|taça|pokal|beker|cup|liga|lig|süper lig|ziraat)\b/i.test(text);

  return {
    fixturesSignal,
    calendarSignal,
    seasonLabelVisible,
    restartSignal,
    noFixtureSignal,
    officialCompetitionSignal,
    signalScore: [fixturesSignal, calendarSignal, seasonLabelVisible, restartSignal, noFixtureSignal, officialCompetitionSignal].filter(Boolean).length,
    bestEvidenceSnippet:
      sentenceAround(text, /\b(fixtures? & results|fixtures?|schedule|calendar|matchday|qualifying|season|restart|starts?|begins?)\b/i) ||
      text.slice(0, 600),
    lowerLength: lower.length
  };
}


function normalizeHtmlForFixtureParsing(value) {
  return asText(value)
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/&quot;/gi, '"')
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#xE5;/gi, "å")
    .replace(/&#xE6;/gi, "æ")
    .replace(/&#xF8;/gi, "ø")
    .replace(/&#229;/gi, "å")
    .replace(/&#230;/gi, "æ")
    .replace(/&#248;/gi, "ø");
}

function stripFixtureHtml(value) {
  return normalizeWhitespace(
    normalizeHtmlForFixtureParsing(value)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

function fieldFromHtml(block, regex) {
  const match = block.match(regex);
  return match ? match[1] || "" : "";
}

function extractEliteserienOfficialScheduleRows(row, snapshot, rawText) {
  const host = hostnameOf(row, snapshot).toLowerCase();
  if (!host.includes("eliteserien.no")) return [];

  const html = normalizeHtmlForFixtureParsing(rawText);
  const rowRegex = /<tr[^>]*class=["'][^"']*future__match__terminlist[^"']*schedule__match[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi;
  const rowBlocks = Array.from(html.matchAll(rowRegex)).map((match) => match[1] || "");

  const out = [];

  for (const block of rowBlocks) {
    const round = stripFixtureHtml(fieldFromHtml(block, /schedule__match__item--round[\s\S]*?<span>\s*#?([^<]+)<\/span>/i));

    const teamsBlock = fieldFromHtml(block, /schedule__match__item--teams[^>]*>([\s\S]*?)<\/td>/i);
    const teamsText = stripFixtureHtml(teamsBlock);
    const teamsParts = teamsText
      .replace(/\s+/g, " ")
      .split(/\s+-\s+/)
      .map((x) => x.trim())
      .filter(Boolean);

    const dateMatch = block.match(/<span>\s*(\d{2})\.(\d{2})\.<span[^>]*schedule__match__item--date__year[^>]*>(\d{4})<\/span>\s*<\/span>\s*<span[^>]*schedule__time[^>]*>([\s\S]*?)<\/span>/i);
    const venue = stripFixtureHtml(fieldFromHtml(block, /schedule__match__item--date[\s\S]*?<br\s*\/?>\s*([^<\n\r]+)/i));

    const day = dateMatch?.[1] || "";
    const month = dateMatch?.[2] || "";
    const year = dateMatch?.[3] || "";
    const time = stripFixtureHtml(dateMatch?.[4] || "").replace(/\*/g, "").trim();

    const parsedRow = {
      date: year && month && day ? `${year}-${month}-${day}` : "",
      localTime: time,
      round,
      homeTeam: teamsParts[0] || "",
      awayTeam: teamsParts[1] || "",
      venue
    };

    if (parsedRow.date && parsedRow.homeTeam && parsedRow.awayTeam) out.push(parsedRow);
  }

  return out;
}

function extractBundesligaAtOfficialScheduleRows(row, snapshot, rawText) {
  const host = hostnameOf(row, snapshot).toLowerCase();
  if (!host.includes("bundesliga.at")) return [];

  const plain = stripFixtureHtml(rawText);
  const out = [];

  const matchRegex = /(\d{1,2})\s+(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})\s+([A-ZÄÖÜ]{2,4})\s+(.+?)\s+([A-ZÄÖÜ]{2,4})\s+(.+?)\s+(\d+\s*:\s*\d+(?:\s*\(\d+\s*:\s*\d+\))?)/g;

  for (const match of plain.matchAll(matchRegex)) {
    const round = match[1] || "";
    const dateText = match[2] || "";
    const time = match[3] || "";
    const homeCode = match[4] || "";
    const homeTeam = normalizeWhitespace(match[5] || "");
    const awayCode = match[6] || "";
    const awayTeam = normalizeWhitespace(match[7] || "");
    const score = normalizeWhitespace(match[8] || "");

    const dateParts = dateText.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    const date = dateParts ? `${dateParts[3]}-${dateParts[2]}-${dateParts[1]}` : "";

    if (!round || !date || !time || !homeTeam || !awayTeam) continue;

    out.push({
      round,
      date,
      time,
      homeCode,
      homeTeam,
      awayCode,
      awayTeam,
      score,
      source: "bundesliga.at_plain_text_schedule"
    });
  }

  return out;
}
function extractStructuredFixtureCalendar(row, snapshot, rawText) {
  const parsedRows = [
    ...extractEliteserienOfficialScheduleRows(row, snapshot, rawText),
    ...extractBundesligaAtOfficialScheduleRows(row, snapshot, rawText)
  ];
  const dates = parsedRows.map((item) => item.date).filter(Boolean).sort();
  const rounds = Array.from(new Set(parsedRows.map((item) => item.round).filter(Boolean))).sort((a, b) => Number(a) - Number(b));

  return {
    structuredFixtureCalendarVisible: parsedRows.length > 0,
    parsedFixtureRowCount: parsedRows.length,
    parsedFixtureFirstDate: dates[0] || "",
    parsedFixtureLastDate: dates[dates.length - 1] || "",
    parsedFixtureRoundCount: rounds.length,
    parsedFixtureFirstRows: parsedRows.slice(0, 10),
    fixtureSignalText: parsedRows.length > 0
      ? "official league fixtures calendar schedule matches matchday rounds season competition"
      : ""
  };
}
function evidenceRow(row, snapshot) {
  const rawEvidenceText = textOf(snapshot);
  const plainText = stripHtml(rawEvidenceText);
  const structuredFixtureCalendar = extractStructuredFixtureCalendar(row, snapshot, rawEvidenceText);
  const signals = signalFlags(`${plainText} ${structuredFixtureCalendar.fixtureSignalText}`);
  const status = statusOf(snapshot);
  const extractionState = status && status >= 400
    ? "rejected_candidate_http_status"
    : signals.signalScore > 0
      ? "candidate_season_status_calendar_evidence_needs_validation"
      : "season_status_snapshot_needs_manual_review";

  return {
    taskId: asText(row.taskId || snapshot?.taskId),
    leagueSlug: asText(row.leagueSlug || row.competitionSlug || snapshot?.leagueSlug || snapshot?.competitionSlug),
    competitionSlug: asText(row.competitionSlug || row.leagueSlug || snapshot?.competitionSlug || snapshot?.leagueSlug),
    name: asText(row.name || row.competitionName || snapshot?.name || snapshot?.competitionName),
    competitionName: asText(row.competitionName || row.name || snapshot?.competitionName || snapshot?.name),
    dayKey: asText(row.dayKey || row.targetDate || snapshot?.dayKey || snapshot?.targetDate),
    targetDate: asText(row.targetDate || row.dayKey || snapshot?.targetDate || snapshot?.dayKey),
    seasonKey: asText(row.seasonKey || snapshot?.seasonKey),
    sourceType: asText(row.sourceType || snapshot?.sourceType),
    sourceClass: asText(row.sourceClass || snapshot?.sourceClass),
    fetchPurpose: asText(row.fetchPurpose || snapshot?.fetchPurpose),
    hostname: hostnameOf(row, snapshot),
    sourceUrl: sourceUrlOf(row, snapshot),
    finalUrl: sourceUrlOf(row, snapshot),
    status,
    classification: asText(row.classification),
    fixtureLanguageVisible: row.fixtureLanguageVisible === true,
    targetDateVisible: row.targetDateVisible === true,
    explicitNoFixtureEvidence: row.explicitNoFixtureEvidence === true,
    fixturesSignal: signals.fixturesSignal,
    calendarSignal: signals.calendarSignal,
    seasonLabelVisible: signals.seasonLabelVisible,
    restartSignal: signals.restartSignal,
    noFixtureSignal: signals.noFixtureSignal,
    officialCompetitionSignal: signals.officialCompetitionSignal,
    signalScore: signals.signalScore,
    evidenceTextSnippet: signals.bestEvidenceSnippet,
    structuredFixtureCalendarVisible: structuredFixtureCalendar.structuredFixtureCalendarVisible,
    parsedFixtureRowCount: structuredFixtureCalendar.parsedFixtureRowCount,
    parsedFixtureFirstDate: structuredFixtureCalendar.parsedFixtureFirstDate,
    parsedFixtureLastDate: structuredFixtureCalendar.parsedFixtureLastDate,
    parsedFixtureRoundCount: structuredFixtureCalendar.parsedFixtureRoundCount,
    parsedFixtureFirstRows: structuredFixtureCalendar.parsedFixtureFirstRows,
    validationState: extractionState,
    extractionState,
    reason: extractionState === "candidate_season_status_calendar_evidence_needs_validation"
      ? "season_calendar_or_activity_signals_found_needs_validation"
      : extractionState === "rejected_candidate_http_status"
        ? "candidate source returned rejected http status"
        : "season status snapshot needs manual review",
    acceptedForSeasonStatusEvidence: false,
    sourceFetch: false,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function buildReport(input, options = {}) {
  const rows = selectRows(input);
  const byKey = snapshotsByKey(input);
  const seasonStatusEvidenceRows = rows.map((row) => {
    const snapshot = byKey.get(classifiedKey(row)) || fallbackSnapshot(row, input);
    return evidenceRow(row, snapshot);
  });

  const byExtractionState = {};
  const byLeague = {};
  for (const row of seasonStatusEvidenceRows) {
    byExtractionState[row.extractionState] = (byExtractionState[row.extractionState] || 0) + 1;
    byLeague[row.leagueSlug || "unknown"] = {
      competitionName: row.competitionName || row.name,
      targetDate: row.targetDate,
      seasonKey: row.seasonKey,
      extractionState: row.extractionState,
      signalScore: row.signalScore,
      hostname: row.hostname
    };
  }

  return {
    ok: true,
    job: "extract-football-truth-season-status-evidence-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_football_truth_season_status_evidence_extraction",
    sourceInput: options.input || "",
    summary: {
      inputClassifiedRowCount: Array.isArray(input?.classifiedRows) ? input.classifiedRows.length : 0,
      selectedSeasonActivityRowCount: rows.length,
      extractedRowCount: seasonStatusEvidenceRows.length,
      candidateSeasonStatusEvidenceCount: seasonStatusEvidenceRows.filter((row) => row.extractionState === "candidate_season_status_calendar_evidence_needs_validation").length,
      manualReviewCount: seasonStatusEvidenceRows.filter((row) => row.extractionState === "season_status_snapshot_needs_manual_review").length,
      rejectedHttpStatusCount: seasonStatusEvidenceRows.filter((row) => row.extractionState === "rejected_candidate_http_status").length,
      acceptedForSeasonStatusEvidenceCount: seasonStatusEvidenceRows.filter((row) => row.acceptedForSeasonStatusEvidence === true).length,
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    byExtractionState,
    byLeague,
    seasonStatusEvidenceRows,
    evidenceRows: seasonStatusEvidenceRows,
    fetchedSourceSnapshots: Array.isArray(input?.fetchedSourceSnapshots) ? input.fetchedSourceSnapshots : [],
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyProvidedClassifiedSnapshots: true,
      noReviewDecisionApplied: true,
      noCanonicalPromotion: true,
      noFixtureWrites: true,
      noHistoryWrites: true,
      noValueWrites: true,
      noDetailsWrites: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true
    },
    canonicalWrites: 0,
    productionWrite: false
  };
}

function selfTest() {
  const input = {
    classifiedRows: [
      {
        taskId: "uefa",
        leagueSlug: "uefa.europa",
        competitionSlug: "uefa.europa",
        name: "UEFA Europa League",
        competitionName: "UEFA Europa League",
        dayKey: "2026-06-03",
        targetDate: "2026-06-03",
        seasonKey: "2025-2026",
        sourceType: "season_status_official_primary",
        sourceClass: "official_governing_or_competition_operator",
        fetchPurpose: "season_activity_status_calendar",
        classification: "candidate_league_season_activity_evidence_needs_validation",
        finalUrl: "https://www.uefa.com/uefaeuropaleague/fixtures-results/",
        hostname: "uefa.com",
        status: 200,
        fixtureLanguageVisible: true
      },
      {
        taskId: "nor",
        leagueSlug: "nor.1",
        competitionSlug: "nor.1",
        name: "Eliteserien",
        competitionName: "Eliteserien",
        dayKey: "2026-06-05",
        targetDate: "2026-06-05",
        seasonKey: "2026",
        sourceType: "season_status_official_primary",
        sourceClass: "official_governing_or_competition_operator",
        fetchPurpose: "season_activity_status_calendar",
        classification: "candidate_league_season_activity_evidence_needs_validation",
        finalUrl: "https://www.eliteserien.no/terminliste",
        hostname: "www.eliteserien.no",
        status: 200,
        fixtureLanguageVisible: true
      },
      {
        taskId: "fixture",
        leagueSlug: "eng.1",
        classification: "candidate_fixture_evidence_needs_validation"
      }
    ],
    fetchedSourceSnapshots: [
      {
        taskId: "uefa",
        leagueSlug: "uefa.europa",
        competitionSlug: "uefa.europa",
        name: "UEFA Europa League",
        dayKey: "2026-06-03",
        seasonKey: "2025-2026",
        sourceType: "season_status_official_primary",
        sourceClass: "official_governing_or_competition_operator",
        fetchPurpose: "season_activity_status_calendar",
        candidateUrl: "https://www.uefa.com/uefaeuropaleague/fixtures-results/",
        hostname: "uefa.com",
        http: {
          status: 200,
          finalUrl: "https://www.uefa.com/uefaeuropaleague/fixtures-results/",
          bytes: 1200,
          contentType: "text/html"
        },
        plainText: "Fixtures & results UEFA Europa League 2025/26 official competition calendar matchday schedule qualifying season."
      },
      {
        taskId: "nor",
        leagueSlug: "nor.1",
        competitionSlug: "nor.1",
        name: "Eliteserien",
        dayKey: "2026-06-05",
        seasonKey: "2026",
        sourceType: "season_status_official_primary",
        sourceClass: "official_governing_or_competition_operator",
        fetchPurpose: "season_activity_status_calendar",
        candidateUrl: "https://www.eliteserien.no/terminliste",
        hostname: "www.eliteserien.no",
        http: {
          status: 200,
          finalUrl: "https://www.eliteserien.no/terminliste",
          bytes: 1200,
          contentType: "text/html"
        },
        rawText: "<tr class=\"future__match__terminlist schedule__match\"><td class=\"schedule__match__item schedule__match__item--round\"><span>#13</span></td><td class=\"schedule__match__item schedule__match__item--teams\">Aalesund - <span class=\"schedule__team--opponent\">Molde</span></td><td class=\"schedule__match__item schedule__match__item--date\"><span>11.07.<span class=\"schedule__match__item--date__year\">2026</span></span> <span class=\"schedule__time\">16:00 </span><span class=\"schedule__match__item--match-round-number\">#13</span><br />Color Line Stadion</td></tr>"
      }
    ]
  };

  const report = buildReport(input, { input: "self-test" });

  if (report.summary.inputClassifiedRowCount !== 3) throw new Error("expected three classified input rows");
  if (report.summary.selectedSeasonActivityRowCount !== 2) throw new Error("expected two selected season activity rows");
  if (report.summary.candidateSeasonStatusEvidenceCount !== 2) throw new Error("expected two candidate season status evidence rows");
  if (report.summary.acceptedForSeasonStatusEvidenceCount !== 0) throw new Error("expected no accepted final review decision");

  const norRow = report.seasonStatusEvidenceRows.find((row) => row.leagueSlug === "nor.1");
  if (!norRow) throw new Error("expected Eliteserien extracted evidence row");
  if (norRow.parsedFixtureRowCount !== 1) throw new Error("expected one parsed Eliteserien fixture row");
  if (norRow.structuredFixtureCalendarVisible !== true) throw new Error("expected structured fixture calendar visible");

  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) throw new Error("read-only guarantees failed");

  return {
    ok: true,
    selfTest: "extract-football-truth-season-status-evidence-file",
    summary: report.summary,
    guarantees: report.guarantees
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(selfTest(), null, 2));
    return;
  }

  const input = readJson(args.input, "input");
  const report = buildReport(input, { input: args.input });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();
