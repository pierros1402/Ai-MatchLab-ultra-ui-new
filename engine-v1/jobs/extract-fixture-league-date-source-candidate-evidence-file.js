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
  return asText(snapshot?.http?.text || snapshot?.text || snapshot?.bodyText || snapshot?.body || "");
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

function extractRows(snapshot) {
  const leagueSlug = asText(snapshot.leagueSlug);
  const dayKey = asText(snapshot.dayKey);
  const rawText = textOf(snapshot);
  const plainText = stripHtml(rawText);
  const targetBlock = extractTargetDateBlock(plainText, dayKey);
  const allRows = leagueSlug === "ukr.1" ? parseUkrRowsFromDateBlock(targetBlock) : [];

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
  } else if (targetBlock && targetCompetitionRows.length > 0) {
    extractionState = "candidate_target_competition_fixture_rows_needs_validation";
    acceptedForEvidence = false;
    reason = "target_competition_rows_found_needs_validation";
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
    targetCompetitionRowCount: targetCompetitionRows.length,
    nonTargetCompetitionRowCount: nonTargetCompetitionRows.length,
    targetCompetitionRows,
    nonTargetCompetitionRows,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function extract(input, options = {}) {
  const snapshots = Array.isArray(input.fetchedSourceSnapshots) ? input.fetchedSourceSnapshots : [];
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
      }
    ]
  };

  const report = extract(input, { input: "self-test" });

  if (report.summary.inputSnapshotCount !== 2) {
    throw new Error(`self-test failed: expected 2 snapshots, got ${report.summary.inputSnapshotCount}`);
  }

  if (report.summary.nonTargetCompetitionOnlyCount !== 1) {
    throw new Error(`self-test failed: expected 1 non-target competition row, got ${report.summary.nonTargetCompetitionOnlyCount}`);
  }

  if (report.summary.targetCompetitionEvidenceCandidateCount !== 1) {
    throw new Error(`self-test failed: expected 1 target competition evidence candidate, got ${report.summary.targetCompetitionEvidenceCandidateCount}`);
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
