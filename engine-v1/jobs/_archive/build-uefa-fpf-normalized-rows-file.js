#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    output: "",
    selfTest: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--input") {
      args.input = argv[++index] || "";
      continue;
    }

    if (arg.startsWith("--input=")) {
      args.input = arg.slice("--input=".length);
      continue;
    }

    if (arg === "--output") {
      args.output = argv[++index] || "";
      continue;
    }

    if (arg.startsWith("--output=")) {
      args.output = arg.slice("--output=".length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.selfTest && !args.input) {
    throw new Error("Missing required --input");
  }

  if (!args.selfTest && !args.output) {
    throw new Error("Missing required --output");
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeSpace(value) {
  return asText(value).replace(/\s+/g, " ").trim();
}

function toIsoDate(portugueseDate) {
  const match = asText(portugueseDate).match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return "";
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function parseFpfPlainText(value) {
  const text = normalizeSpace(value);

  const dateMatch = text.match(/Data:\s*(?<date>\d{2}-\d{2}-\d{4})/u);
  const timeMatch = text.match(/Hora:\s*(?<time>\d{1,2}:\d{2})/u);

  const scoreMatch = text.match(
    /TAÇA DE PORTUGAL(?:\s+GENERALI\s+TRANQUILIDADE)?\s+(?<homeTeam>.+?)\s+(?<homeScore>\d+)\s*-\s*(?<awayScore>\d+)\s+(?<awayTeam>.+?)\s+Data:/iu
  );

  const homeTeamName = normalizeSpace(scoreMatch?.groups?.homeTeam || "");
  const awayTeamName = normalizeSpace(scoreMatch?.groups?.awayTeam || "");
  const homeScore = scoreMatch ? Number(scoreMatch.groups.homeScore) : null;
  const awayScore = scoreMatch ? Number(scoreMatch.groups.awayScore) : null;
  const localDateRaw = asText(dateMatch?.groups?.date || "");
  const localTimeRaw = asText(timeMatch?.groups?.time || "");
  const date = toIsoDate(localDateRaw);

  let winnerTeamName = "";
  let winnerResolution = "";
  if (Number.isFinite(homeScore) && Number.isFinite(awayScore)) {
    if (homeScore > awayScore) {
      winnerTeamName = homeTeamName;
      winnerResolution = "normal_time_or_page_score_home";
    } else if (awayScore > homeScore) {
      winnerTeamName = awayTeamName;
      winnerResolution = "normal_time_or_page_score_away";
    } else {
      winnerResolution = "draw_or_extra_time_required";
    }
  }

  return {
    homeTeamName,
    awayTeamName,
    homeScore,
    awayScore,
    localDateRaw,
    localTimeRaw,
    date,
    startTime: date && localTimeRaw ? `${date}T${localTimeRaw}:00` : "",
    winnerTeamName,
    winnerResolution,
    parseOk:
      Boolean(homeTeamName) &&
      Boolean(awayTeamName) &&
      Boolean(date) &&
      Boolean(localTimeRaw) &&
      Number.isFinite(homeScore) &&
      Number.isFinite(awayScore)
  };
}

function fetchedRowsOf(input) {
  for (const key of ["fetchedRows", "promisingRows", "rows", "items"]) {
    if (Array.isArray(input?.[key])) return input[key];
  }

  if (Array.isArray(input)) return input;
  return [];
}

function buildReport(input, inputPath = "") {
  const fetchedRows = fetchedRowsOf(input);
  const discoveredMatchIdCount = Number(input?.summary?.discoveredMatchIdCount || fetchedRows.length || 0);
  const sampleMatchIdCount = Number(input?.summary?.sampleMatchIdCount || fetchedRows.length || 0);
  const targetCompetitionSlug = asText(input?.summary?.targetCompetitionSlug || "");

  const normalizedFixtureRows = [];
  const invalidRows = [];

  for (const sourceRow of fetchedRows) {
    const competitionSlug = asText(sourceRow.competitionSlug || targetCompetitionSlug || "por.taca.portugal");
    const sourceMatchId = asText(sourceRow.matchId || sourceRow.sourceMatchId);
    const plainText = asText(sourceRow.plainTextPrefix || sourceRow.plainText || sourceRow.rawTextPrefix || "");
    const parsed = parseFpfPlainText(plainText);

    const normalizedRow = {
      competitionSlug,
      sourceProvider: "FPF Centro de Resultados",
      sourceMatchId,
      sourceUrl: asText(sourceRow.url || sourceRow.finalUrl || sourceRow.sourceUrl),
      finalUrl: asText(sourceRow.finalUrl),
      httpStatus: Number(sourceRow.httpStatus || 0),
      requestOk: sourceRow.requestOk === true,
      rawTextLength: Number(sourceRow.rawTextLength || 0),
      plainTextLength: Number(sourceRow.plainTextLength || 0),
      homeTeamName: parsed.homeTeamName,
      awayTeamName: parsed.awayTeamName,
      homeScore: parsed.homeScore,
      awayScore: parsed.awayScore,
      date: parsed.date,
      localDateRaw: parsed.localDateRaw,
      localTimeRaw: parsed.localTimeRaw,
      startTime: parsed.startTime,
      normalizedStatus: parsed.parseOk ? "finished" : "unknown",
      winnerTeamName: parsed.winnerTeamName,
      winnerResolution: parsed.winnerResolution,
      winnerResolutionRequired: parsed.winnerResolution === "draw_or_extra_time_required",
      rawHasResult: Number.isFinite(parsed.homeScore) && Number.isFinite(parsed.awayScore),
      parseOk: parsed.parseOk,
      diagnosticSource: "plainTextPrefix"
    };

    normalizedFixtureRows.push(normalizedRow);

    if (!normalizedRow.parseOk || !normalizedRow.competitionSlug || !normalizedRow.sourceMatchId) {
      invalidRows.push(normalizedRow);
    }
  }

  const normalizedResultRows = normalizedFixtureRows.filter((row) => row.rawHasResult === true);
  const winnerEvidenceRows = normalizedResultRows.filter((row) => row.winnerTeamName && !row.winnerResolutionRequired);
  const winnerNeedsResolutionRows = normalizedResultRows.filter((row) => row.winnerResolutionRequired);
  const sortedByDate = [...normalizedResultRows].filter((row) => row.date).sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    return asText(a.startTime).localeCompare(asText(b.startTime));
  });
  const latestResultRow = sortedByDate[sortedByDate.length - 1] || null;

  const cupFinalEvidenceRows = latestResultRow
    ? [{
        ...latestResultRow,
        finalEvidenceState: "latest_fetched_result_row_candidate_needs_full_fetch_or_second_source",
        finalInferenceBasis: "latest_available_fpf_match_info_row",
        canonicalPromotionReady: false
      }]
    : [];

  const sourceComplete = fetchedRows.length > 0 && discoveredMatchIdCount > 0 && fetchedRows.length >= discoveredMatchIdCount;

  return {
    ok: invalidRows.length === 0,
    job: "build-uefa-fpf-normalized-rows-file",
    generatedAt: new Date().toISOString(),
    inputPath,
    summary: {
      targetCompetitionSlug: targetCompetitionSlug || "por.taca.portugal",
      fetchedRowCount: fetchedRows.length,
      discoveredMatchIdCount,
      sampleMatchIdCount,
      sourceComplete,
      normalizedFixtureRowCount: normalizedFixtureRows.length,
      normalizedResultRowCount: normalizedResultRows.length,
      winnerEvidenceRowCount: winnerEvidenceRows.length,
      winnerNeedsResolutionRowCount: winnerNeedsResolutionRows.length,
      cupFinalEvidenceRowCount: cupFinalEvidenceRows.length,
      invalidRowCount: invalidRows.length,
      conclusion: sourceComplete
        ? "FPF match-info rows normalized from fetched detail pages."
        : "FPF sample match-info rows normalized. Full competition normalization still requires complete fetched detail rows.",
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    normalizedFixtureRows,
    normalizedResultRows,
    winnerEvidenceRows,
    winnerNeedsResolutionRows,
    cupFinalEvidenceRows,
    invalidRows,
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noCanonicalPromotion: true,
      noFixtureWrites: true,
      noHistoryWrites: true,
      noValueWrites: true,
      noDetailsWrites: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true
    }
  };
}

function runSelfTest() {
  const input = {
    summary: {
      targetCompetitionSlug: "por.taca.portugal",
      discoveredMatchIdCount: 1,
      sampleMatchIdCount: 1
    },
    fetchedRows: [{
      competitionSlug: "por.taca.portugal",
      matchId: "2353242",
      url: "https://resultados.fpf.pt/Match/GetMatchInformation?matchId=2353242",
      httpStatus: 200,
      requestOk: true,
      rawTextLength: 62968,
      plainTextLength: 3012,
      plainTextPrefix:
        "FPF - Centro de Resultados Competições TAÇA DE PORTUGAL GENERALI TRANQUILIDADE Sc Maria Fonte 1 - 2 Brito Sc Data: 31-08-2025 Hora: 17:00 Estádio: Estádio Dos Moinhos Novos"
    }]
  };

  const report = buildReport(input, "self-test-input");
  if (!report.ok) throw new Error("self-test report was not ok");
  if (report.summary.normalizedFixtureRowCount !== 1) throw new Error("expected one normalized fixture row");
  if (report.normalizedFixtureRows[0].homeTeamName !== "Sc Maria Fonte") throw new Error("unexpected home team");
  if (report.normalizedFixtureRows[0].awayTeamName !== "Brito Sc") throw new Error("unexpected away team");
  if (report.normalizedFixtureRows[0].date !== "2025-08-31") throw new Error("unexpected ISO date");
  if (report.normalizedFixtureRows[0].winnerTeamName !== "Brito Sc") throw new Error("unexpected winner");
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("read-only guarantees failed");
  }

  return {
    ok: true,
    selfTest: "build-uefa-fpf-normalized-rows-file",
    summary: report.summary
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const input = readJson(args.input);
  const report = buildReport(input, args.input);
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

export {
  buildReport,
  parseFpfPlainText,
  fetchedRowsOf
};
