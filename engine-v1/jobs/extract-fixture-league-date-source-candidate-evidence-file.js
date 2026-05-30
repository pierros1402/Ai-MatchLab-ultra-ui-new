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
    const arg = String(argv[i] || "").trim();

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--input" && argv[i + 1]) {
      args.input = String(argv[++i] || "").trim();
      continue;
    }

    if (arg.startsWith("--input=")) {
      args.input = arg.slice("--input=".length).trim();
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      args.output = String(argv[++i] || "").trim();
      continue;
    }

    if (arg.startsWith("--output=")) {
      args.output = arg.slice("--output=".length).trim();
      continue;
    }
  }

  return args;
}

function readJson(filePath, label) {
  if (!filePath) throw new Error(`missing --${label}`);
  if (!fs.existsSync(filePath)) throw new Error(`missing ${label} file: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  if (!filePath) throw new Error("missing --output");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function asText(value) {
  return String(value || "").trim();
}

function normalizeWhitespace(value) {
  return asText(value).replace(/\s+/g, " ").trim();
}

function stripHtml(value) {
  return normalizeWhitespace(
    asText(value)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
      .replace(/<path\b[^>]*>/gi, " ")
      .replace(/data:image\/svg\+xml[^\s"']+/gi, " ")
      .replace(/%3Csvg[\s\S]{0,4000}?%3E/gi, " ")
      .replace(/%3Cpath[\s\S]{0,2500}?%3E/gi, " ")
      .replace(/\b(?:cls|path|transform|translate|fill|stroke|viewbox|xmlns)-?\d*\b/gi, " ")
      .replace(/\b[MLHVCSQTAZmlhvcsqtaz]\s*-?\d+(?:\.\d+)?(?:\s*,?\s*-?\d+(?:\.\d+)?){1,8}\b/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&#x27;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
  );
}

function textOf(snapshot) {
  return asText(snapshot?.http?.text || snapshot?.rawText || snapshot?.text || snapshot?.plainText || snapshot?.bodyText || snapshot?.body || "");
}

function statusOf(snapshot) {
  if (snapshot?.http && Number.isFinite(Number(snapshot.http.status))) return Number(snapshot.http.status);
  if (Number.isFinite(Number(snapshot.status))) return Number(snapshot.status);
  if (Number.isFinite(Number(snapshot.statusCode))) return Number(snapshot.statusCode);
  return null;
}

function dayTokens(dayKey) {
  const value = asText(dayKey);
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return [value].filter(Boolean);

  const [, yyyy, mm, dd] = match;
  const day = String(Number(dd));
  const monthNames = {
    "01": ["jan", "january"],
    "02": ["feb", "february"],
    "03": ["mar", "march"],
    "04": ["apr", "april"],
    "05": ["may"],
    "06": ["jun", "june"],
    "07": ["jul", "july"],
    "08": ["aug", "august"],
    "09": ["sep", "sept", "september"],
    "10": ["oct", "october"],
    "11": ["nov", "november"],
    "12": ["dec", "december"]
  };

  const tokens = [
    `${yyyy}-${mm}-${dd}`,
    `${dd}/${mm}/${yyyy}`,
    `${day}/${Number(mm)}/${yyyy}`,
    `${dd}.${mm}.${yyyy}`,
    `${day}.${Number(mm)}.${yyyy}`,
    `${dd}-${mm}-${yyyy}`,
    `${day}-${Number(mm)}-${yyyy}`,
    `${dd}.${mm}`,
    `${day}.${Number(mm)}`
  ];

  for (const month of monthNames[mm] || []) {
    tokens.push(`${day} ${month} ${yyyy}`);
    tokens.push(`${month} ${day} ${yyyy}`);
    tokens.push(`${day} ${month}`);
    tokens.push(`${month} ${day}`);
  }

  return [...new Set(tokens.map((token) => token.toLowerCase()))];
}

function dateHeaderRegexForDay(dayKey) {
  const value = asText(dayKey);
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, yyyy, mm, dd] = match;
  const day = String(Number(dd));
  const numericMonth = String(Number(mm));
  const monthNames = {
    "01": "jan(?:uary)?",
    "02": "feb(?:ruary)?",
    "03": "mar(?:ch)?",
    "04": "apr(?:il)?",
    "05": "may",
    "06": "jun(?:e)?",
    "07": "jul(?:y)?",
    "08": "aug(?:ust)?",
    "09": "sep(?:t|tember)?",
    "10": "oct(?:ober)?",
    "11": "nov(?:ember)?",
    "12": "dec(?:ember)?"
  };

  const monthWord = monthNames[mm] || mm;
  const month = `(?:${mm}|${numericMonth}|${monthWord})`;

  return new RegExp(
    `(?:mon|tue|wed|thu|fri|sat|sun)?[,]?\\s*(?:${dd}|${day})(?:\\.|\\/|\\-|\\s+)${month}(?:\\.|\\/|\\-|\\s+)?${yyyy}`,
    "i"
  );
}

function nextDateHeaderRegex() {
  return /\b(?:mon|tue|wed|thu|fri|sat|sun)[,]?\s+\d{1,2}(?:\.|\/|\-|\s+)(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|\d{1,2})(?:\.|\/|\-|\s+)?\d{4}\b/i;
}

function extractTargetDateBlock(plainText, dayKey) {
  const text = normalizeWhitespace(plainText);
  const regex = dateHeaderRegexForDay(dayKey);
  if (!regex) return "";

  const match = regex.exec(text);
  if (!match) {
    const lower = text.toLowerCase();
    const token = dayTokens(dayKey).find((candidate) => lower.includes(candidate));
    if (!token) return "";

    const idx = lower.indexOf(token);
    const start = Math.max(0, idx - 120);
    return text.slice(start, Math.min(text.length, idx + 2200));
  }

  const start = match.index;
  const rest = text.slice(start + match[0].length);
  const nextMatch = nextDateHeaderRegex().exec(rest);
  const end = nextMatch ? start + match[0].length + nextMatch.index : Math.min(text.length, start + 2500);
  return text.slice(start, end);
}

function targetCompetitionPatterns(leagueSlug) {
  if (leagueSlug === "ukr.1") {
    return [/VBET\s+UPL\b/i, /\bUkrainian\s+Premier\s+League\b/i];
  }

  if (leagueSlug === "bel.1") {
    return [
      /\bJupiler\s+Pro\s+League\b/i,
      /\bBelgian\s+Jupiler\s+Pro\s+League\b/i,
      /\bBelgian\s+Pro\s+League\b/i,
      /\bFirst\s+Division\s+A\b/i
    ];
  }

  return [];
}

function nonTargetCompetitionPatterns() {
  return [
    /\bU-?19\b/i,
    /\bU21\b/i,
    /\bU-?21\b/i,
    /\bCup\b/i,
    /\bFinal\b/i,
    /\bWomen\b/i,
    /\bYouth\b/i,
    /\bReserve\b/i
  ];
}

function parseUkrRowsFromDateBlock(block) {
  const rows = [];
  const pattern = /\b(?<competition>VBET\s+UPL|U19|VBET\s+Cup)\s+(?<round>[A-Za-zА-Яа-яІіЇїЄєҐґ0-9]+)\s+(?<home>[\p{L}0-9 .'’\-]+?)\s+(?<homeScore>\d+)\s*:\s*(?<awayScore>\d+)\s+(?<away>[\p{L}0-9 .'’\-]+?)(?=\s+(?:VBET\s+UPL|U19|VBET\s+Cup)\s+|\s*$)/giu;

  for (const match of block.matchAll(pattern)) {
    const groups = match.groups || {};
    rows.push({
      competition: normalizeWhitespace(groups.competition),
      round: normalizeWhitespace(groups.round),
      homeTeam: normalizeWhitespace(groups.home),
      awayTeam: normalizeWhitespace(groups.away),
      homeScore: Number(groups.homeScore),
      awayScore: Number(groups.awayScore),
      rawText: normalizeWhitespace(match[0])
    });
  }

  return rows;
}

function decodeHtmlEntities(text) {
  return asText(text)
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseNextData(rawText) {
  const match = asText(rawText).match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;

  try {
    return JSON.parse(decodeHtmlEntities(match[1]));
  } catch {
    return null;
  }
}

function collectEmbeddedMatchArrays(value, out = []) {
  if (!value || typeof value !== "object") return out;

  if (Array.isArray(value)) {
    const fixtureLike = value.filter((row) => {
      return row && typeof row === "object" &&
        row.homeTeam && row.awayTeam &&
        (row.date || row.time) &&
        row.competition;
    });

    if (fixtureLike.length > 0) {
      out.push(fixtureLike);
    }

    for (const item of value) collectEmbeddedMatchArrays(item, out);
    return out;
  }

  for (const child of Object.values(value)) {
    collectEmbeddedMatchArrays(child, out);
  }

  return out;
}

function parseEmbeddedFixtureRowsFromNextData(rawText) {
  const nextData = parseNextData(rawText);
  if (!nextData) return [];

  return collectEmbeddedMatchArrays(nextData).flat().map((match) => ({
    competition: normalizeWhitespace(match?.competition?.name || match?.edition?.name || ""),
    round: normalizeWhitespace(match?.gameweek?.name || match?.gameweek?.shortName || ""),
    homeTeam: normalizeWhitespace(match?.homeTeam?.name || match?.homeTeam?.shortName || ""),
    awayTeam: normalizeWhitespace(match?.awayTeam?.name || match?.awayTeam?.shortName || ""),
    homeScore: Number.isFinite(Number(match?.homeScore)) ? Number(match.homeScore) : null,
    awayScore: Number.isFinite(Number(match?.awayScore)) ? Number(match.awayScore) : null,
    date: asText(match?.date),
    time: asText(match?.time),
    periodType: asText(match?.period?.type || match?.period?.shortName || match?.period?.name),
    venue: normalizeWhitespace(match?.venue?.name || match?.venueName || ""),
    rawText: normalizeWhitespace([
      match?.competition?.name,
      match?.gameweek?.name,
      match?.homeTeam?.name,
      match?.homeScore,
      match?.awayScore,
      match?.awayTeam?.name,
      match?.date,
      match?.time,
      match?.period?.type
    ].filter((value) => value !== null && value !== undefined && value !== "").join(" "))
  }));
}

function extractRows(snapshot) {
  const leagueSlug = asText(snapshot.leagueSlug);
  const dayKey = asText(snapshot.dayKey);
  const rawText = textOf(snapshot);
  const plainText = stripHtml(rawText);
  const targetBlock = extractTargetDateBlock(plainText, dayKey);
  const embeddedRows = parseEmbeddedFixtureRowsFromNextData(rawText);
  const textRows = leagueSlug === "ukr.1" ? parseUkrRowsFromDateBlock(targetBlock) : [];
  const allRows = [...embeddedRows, ...textRows];

  const targetPatterns = targetCompetitionPatterns(leagueSlug);
  const nonTargetPatterns = nonTargetCompetitionPatterns();

  const targetCompetitionRows = allRows.filter((row) => {
    const competition = asText(row.competition);
    return targetPatterns.some((pattern) => pattern.test(competition));
  });

  const nonTargetCompetitionRows = allRows.filter((row) => {
    const competition = asText(row.competition);
    return nonTargetPatterns.some((pattern) => pattern.test(competition));
  });

  let extractionState = "no_target_date_block";
  let acceptedForEvidence = false;
  let reason = "target_date_block_missing";

  if (statusOf(snapshot) !== 200) {
    extractionState = "rejected_candidate_http_status";
    reason = `http_status_${statusOf(snapshot) ?? "missing"}`;
  } else if (targetCompetitionRows.length > 0) {
    extractionState = "candidate_target_competition_fixture_rows_needs_validation";
    acceptedForEvidence = false;
    reason = embeddedRows.length > 0
      ? "embedded_next_data_target_competition_rows_found_needs_validation"
      : "target_competition_rows_found_needs_validation";
  } else if (targetBlock && nonTargetCompetitionRows.length > 0) {
    extractionState = "target_date_visible_but_only_non_target_competition_rows";
    reason = "non_target_competition_rows_only";
  } else if (targetBlock) {
    extractionState = "target_date_visible_but_no_parseable_fixture_rows";
    reason = "target_date_block_without_parseable_target_rows";
  }

  return {
    taskId: asText(snapshot.taskId),
    leagueSlug,
    name: asText(snapshot.name),
    dayKey,
    sourceType: asText(snapshot.sourceType),
    sourceTitle: asText(snapshot.sourceTitle),
    resolvedUrl: asText(snapshot.resolvedUrl),
    finalUrl: asText(snapshot?.http?.finalUrl || snapshot.finalUrl || snapshot.resolvedUrl),
    status: statusOf(snapshot),
    extractionState,
    acceptedForEvidence,
    reason,
    targetDateBlockFound: Boolean(targetBlock),
    targetDateBlockSnippet: targetBlock.slice(0, 1400),
    embeddedFixtureRowCount: embeddedRows.length,
    targetCompetitionRowCount: targetCompetitionRows.length,
    nonTargetCompetitionRowCount: nonTargetCompetitionRows.length,
    targetCompetitionRows,
    nonTargetCompetitionRows,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function selectSnapshotsForExtraction(input) {
  if (Array.isArray(input?.fetchedSourceSnapshots)) return input.fetchedSourceSnapshots;

  if (Array.isArray(input?.classifiedRows) && input.classifiedRows.length > 0) {
    throw new Error("extractor input has classifiedRows but no fetchedSourceSnapshots; run classifier that preserves fetchedSourceSnapshots or pass fetched snapshots directly");
  }

  return [];
}

function extract(input, options = {}) {
  const snapshots = selectSnapshotsForExtraction(input);
  const evidenceRows = snapshots.map(extractRows);

  const byExtractionState = {};
  const byLeague = {};

  for (const row of evidenceRows) {
    byExtractionState[row.extractionState] = (byExtractionState[row.extractionState] || 0) + 1;
    byLeague[row.leagueSlug] = {
      name: row.name,
      dayKey: row.dayKey,
      status: row.status,
      extractionState: row.extractionState,
      targetCompetitionRowCount: row.targetCompetitionRowCount,
      nonTargetCompetitionRowCount: row.nonTargetCompetitionRowCount
    };
  }

  return {
    ok: true,
    job: "extract-fixture-league-date-source-candidate-evidence-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_fixture_league_date_source_candidate_evidence_extraction",
    sourceInput: options.input || "",
    summary: {
      inputSnapshotCount: snapshots.length,
      extractedRowCount: evidenceRows.length,
      targetCompetitionEvidenceCandidateCount: evidenceRows.filter((row) => row.extractionState === "candidate_target_competition_fixture_rows_needs_validation").length,
      nonTargetCompetitionOnlyCount: evidenceRows.filter((row) => row.extractionState === "target_date_visible_but_only_non_target_competition_rows").length,
      rejectedHttpStatusCount: evidenceRows.filter((row) => row.extractionState === "rejected_candidate_http_status").length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    byExtractionState,
    byLeague,
    evidenceRows,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noReviewDecisionApplied: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function selfTest() {
  const input = {
    fetchedSourceSnapshots: [
      {
        leagueSlug: "ukr.1",
        name: "Ukrainian Premier League",
        dayKey: "2026-05-22",
        resolvedUrl: "https://upl.ua/en/tournaments/games",
        http: {
          status: 200,
          finalUrl: "https://upl.ua/en/tournaments/games",
          text: "Fri, 22.05.2026 U19 30 Karpaty 1 : 4 Zorya SKIF U19 30 Dynamo 7 : 2 Kudrivka TC Sat, 23.05.2026 VBET UPL 30 Olexandriya 1 : 1 Kryvbas CSC"
        }
      },
      {
        leagueSlug: "ukr.1",
        name: "Ukrainian Premier League",
        dayKey: "2026-05-23",
        resolvedUrl: "https://upl.ua/en/tournaments/games",
        http: {
          status: 200,
          finalUrl: "https://upl.ua/en/tournaments/games",
          text: "Sat, 23.05.2026 VBET UPL 30 Olexandriya 1 : 1 Kryvbas CSC U19 30 Obolon 1 : 0 LNZ TC"
        }
      },
      {
        leagueSlug: "bel.1",
        name: "Belgian Pro League",
        dayKey: "2026-05-27",
        resolvedUrl: "https://www.proleague.be/fr/jupliler-pro-league-20252026-kalender",
        http: {
          status: 200,
          finalUrl: "https://www.proleague.be/fr/jupliler-pro-league-20252026-kalender",
          text: "<html><script id=\"__NEXT_DATA__\" type=\"application/json\">{\"props\":{\"pageProps\":{\"data\":{\"matches\":[{\"competition\":{\"name\":\"Jupiler Pro League\"},\"gameweek\":{\"name\":\"Journée 30\"},\"homeTeam\":{\"name\":\"OH Leuven\"},\"awayTeam\":{\"name\":\"Royal Antwerp FC\"},\"homeScore\":1,\"awayScore\":0,\"date\":\"2026-03-22\",\"time\":\"2026-03-22T17:30:00Z\",\"period\":{\"type\":\"FullTime\"}}]}}}}</script></html>"
        }
      }
    ]
  };

  const report = extract(input, { input: "self-test" });

  if (report.summary.inputSnapshotCount !== 3) {
    throw new Error(`self-test failed: expected 3 snapshots, got ${report.summary.inputSnapshotCount}`);
  }

  if (report.summary.nonTargetCompetitionOnlyCount !== 1) {
    throw new Error(`self-test failed: expected 1 non-target competition row, got ${report.summary.nonTargetCompetitionOnlyCount}`);
  }

  let classifiedRowsOnlyRejected = false;
  try {
    extract({ classifiedRows: [{ leagueSlug: "test.1" }] }, { input: "classified-only-self-test" });
  } catch (error) {
    classifiedRowsOnlyRejected = /classifiedRows but no fetchedSourceSnapshots/.test(String(error?.message || error));
  }
  if (!classifiedRowsOnlyRejected) {
    throw new Error("self-test failed: classifiedRows-only input must fail loudly instead of producing false zero evidence");
  }

  if (report.summary.targetCompetitionEvidenceCandidateCount !== 2) {
    throw new Error(`self-test failed: expected 2 target competition evidence candidates, got ${report.summary.targetCompetitionEvidenceCandidateCount}`);
  }

  const embeddedRow = report.evidenceRows.find((row) => row.leagueSlug === "bel.1");
  if (!embeddedRow) {
    throw new Error("self-test failed: expected embedded Belgian Pro League evidence row");
  }

  if (embeddedRow.embeddedFixtureRowCount !== 1) {
    throw new Error(`self-test failed: expected 1 embedded fixture row, got ${embeddedRow.embeddedFixtureRowCount}`);
  }

  if (embeddedRow.targetCompetitionRowCount !== 1) {
    throw new Error(`self-test failed: expected 1 embedded target competition row, got ${embeddedRow.targetCompetitionRowCount}`);
  }

  if (embeddedRow.extractionState !== "candidate_target_competition_fixture_rows_needs_validation") {
    throw new Error(`self-test failed: expected embedded candidate extraction state, got ${embeddedRow.extractionState}`);
  }

  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false || report.guarantees.noFetch !== true) {
    throw new Error("self-test failed: safety guarantees missing");
  }

  return report;
}

async function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "extract-fixture-league-date-source-candidate-evidence-file",
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  const input = readJson(args.input, "input");
  const report = extract(input, { input: args.input });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    job: "extract-fixture-league-date-source-candidate-evidence-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
});
