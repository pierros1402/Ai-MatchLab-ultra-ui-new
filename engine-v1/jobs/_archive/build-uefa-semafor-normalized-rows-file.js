#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    conservative: "",
    evidence: "",
    output: "",
    selfTest: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--conservative") {
      args.conservative = argv[++index] || "";
      continue;
    }

    if (arg.startsWith("--conservative=")) {
      args.conservative = arg.slice("--conservative=".length);
      continue;
    }

    if (arg === "--evidence") {
      args.evidence = argv[++index] || "";
      continue;
    }

    if (arg.startsWith("--evidence=")) {
      args.evidence = arg.slice("--evidence=".length);
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

  if (!args.selfTest && !args.conservative) {
    throw new Error("Missing required --conservative");
  }

  if (!args.selfTest && !args.evidence) {
    throw new Error("Missing required --evidence");
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

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function normalizeSpace(value) {
  return asText(value).replace(/\s+/g, " ").trim();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toIsoDate(croatianDate) {
  const match = asText(croatianDate).match(/^(\d{2})\.(\d{2})\.(\d{4})\.$/);
  if (!match) return "";
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function winnerFromScore(row) {
  const homeGoals = numberOrNull(row.homeGoals);
  const awayGoals = numberOrNull(row.awayGoals);
  const homePenalties = numberOrNull(row.homePenalties);
  const awayPenalties = numberOrNull(row.awayPenalties);

  if (homeGoals === null || awayGoals === null) {
    return { winnerTeamName: "", winnerResolution: "score_missing" };
  }

  if (homeGoals > awayGoals) {
    return { winnerTeamName: asText(row.homeTeam), winnerResolution: "regular_or_extra_time_home" };
  }

  if (awayGoals > homeGoals) {
    return { winnerTeamName: asText(row.awayTeam), winnerResolution: "regular_or_extra_time_away" };
  }

  if (homePenalties !== null && awayPenalties !== null) {
    if (homePenalties > awayPenalties) {
      return { winnerTeamName: asText(row.homeTeam), winnerResolution: "penalties_home" };
    }

    if (awayPenalties > homePenalties) {
      return { winnerTeamName: asText(row.awayTeam), winnerResolution: "penalties_away" };
    }
  }

  return { winnerTeamName: "", winnerResolution: "draw_or_resolution_required" };
}

function rowKey(row) {
  return [
    asText(row.competitionSlug),
    toIsoDate(row.date),
    asText(row.time),
    normalizeSpace(row.homeTeam).toLowerCase(),
    normalizeSpace(row.awayTeam).toLowerCase(),
    numberOrNull(row.homeGoals),
    numberOrNull(row.awayGoals),
    numberOrNull(row.homePenalties),
    numberOrNull(row.awayPenalties)
  ].join("|");
}

function normalizeFixtureRow(row, sourceBucket) {
  const date = toIsoDate(row.date);
  const time = asText(row.time);
  const winner = winnerFromScore(row);

  return {
    competitionSlug: asText(row.competitionSlug || "cro.cup"),
    sourceProvider: "HNS Semafor",
    sourceBucket,
    source: asText(row.source || "official_hns_semafor_html"),
    sourceUrl: asText(row.sourceUrl),
    competitionId: asText(row.competitionId || "100439118"),
    competitionName: asText(row.competitionName || "SuperSport Hrvatski nogometni kup 2025/26"),
    round: normalizeSpace(row.round),
    date,
    localDateRaw: asText(row.date),
    localTimeRaw: time,
    startTime: date && time ? `${date}T${time}:00` : "",
    homeTeamName: normalizeSpace(row.homeTeam),
    awayTeamName: normalizeSpace(row.awayTeam),
    homeScore: numberOrNull(row.homeGoals),
    awayScore: numberOrNull(row.awayGoals),
    homePenalties: numberOrNull(row.homePenalties),
    awayPenalties: numberOrNull(row.awayPenalties),
    normalizedStatus: asText(row.status) === "completed" ? "finished" : "unknown",
    winnerTeamName: winner.winnerTeamName,
    winnerResolution: winner.winnerResolution,
    rawMatchText: asText(row.rawMatchText),
    rawHasResult: numberOrNull(row.homeGoals) !== null && numberOrNull(row.awayGoals) !== null,
    parseOk:
      Boolean(date) &&
      Boolean(time) &&
      Boolean(normalizeSpace(row.homeTeam)) &&
      Boolean(normalizeSpace(row.awayTeam)) &&
      numberOrNull(row.homeGoals) !== null &&
      numberOrNull(row.awayGoals) !== null
  };
}

function parseFinalEvidenceRow(evidenceRows) {
  const contexts = asArray(evidenceRows)
    .map((row) => asText(row.context))
    .filter((context) => (
      /Finale/u.test(context) &&
      /13\.05\.2026\./u.test(context) &&
      /GNK Dinamo\s+2\s*:\s*0\s+HNK Rijeka/u.test(context)
    ));

  if (contexts.length === 0) return null;

  const context = contexts[0];
  const finalMatch = context.match(
    /Finale\s+(?<date>13\.05\.2026\.)\s+(?<time>18:00)\s+(?<homeTeam>GNK Dinamo)\s+(?<homeGoals>2)\s*:\s*(?<awayGoals>0)\s+(?<awayTeam>HNK Rijeka)\s+(?<venue>Opus Arena,\s*Osijek)/u
  );

  if (!finalMatch?.groups) return null;

  return {
    competitionSlug: "cro.cup",
    source: "official_hns_semafor_html",
    sourceUrl: "https://semafor.hns.family/natjecanja/100439118/supersport-hnk/detaljno/",
    competitionId: "100439118",
    competitionName: "SuperSport Hrvatski nogometni kup 2025/26",
    round: "Finale",
    date: finalMatch.groups.date,
    time: finalMatch.groups.time,
    homeTeam: finalMatch.groups.homeTeam,
    awayTeam: finalMatch.groups.awayTeam,
    homeGoals: Number(finalMatch.groups.homeGoals),
    awayGoals: Number(finalMatch.groups.awayGoals),
    homePenalties: null,
    awayPenalties: null,
    status: "completed",
    rawMatchText: `Finale ${finalMatch.groups.date} ${finalMatch.groups.time} ${finalMatch.groups.homeTeam} ${finalMatch.groups.homeGoals} : ${finalMatch.groups.awayGoals} ${finalMatch.groups.awayTeam} ${finalMatch.groups.venue}`,
    evidenceContext: context
  };
}

function buildReport(conservativeInput, evidenceInput, inputPaths = {}) {
  const conservativeRows = asArray(conservativeInput.structuredFixtureRows);
  const badStructuredRows = asArray(conservativeInput.badStructuredRows);
  const evidenceRows = asArray(evidenceInput.evidenceRows);

  const rowsByKey = new Map();

  for (const row of conservativeRows) {
    const normalized = normalizeFixtureRow(row, "conservative_structured_rows");
    rowsByKey.set(rowKey(row), normalized);
  }

  for (const row of badStructuredRows) {
    const normalized = normalizeFixtureRow(row, "bad_structured_rows_recovered_if_valid");
    if (normalized.parseOk) {
      rowsByKey.set(rowKey(row), normalized);
    }
  }

  const finalEvidenceSourceRow = parseFinalEvidenceRow(evidenceRows);
  let finalEvidenceNormalizedRow = null;

  if (finalEvidenceSourceRow) {
    finalEvidenceNormalizedRow = normalizeFixtureRow(finalEvidenceSourceRow, "final_evidence_context_fallback");
    rowsByKey.set(rowKey(finalEvidenceSourceRow), {
      ...finalEvidenceNormalizedRow,
      finalEvidenceState: "official_hns_semafor_context_extracted",
      evidenceContext: finalEvidenceSourceRow.evidenceContext
    });
  }

  const normalizedFixtureRows = [...rowsByKey.values()]
    .sort((a, b) => {
      const dateCompare = asText(a.date).localeCompare(asText(b.date));
      if (dateCompare !== 0) return dateCompare;
      const timeCompare = asText(a.localTimeRaw).localeCompare(asText(b.localTimeRaw));
      if (timeCompare !== 0) return timeCompare;
      return asText(a.homeTeamName).localeCompare(asText(b.homeTeamName));
    });

  const normalizedResultRows = normalizedFixtureRows.filter((row) => row.rawHasResult);
  const invalidRows = normalizedFixtureRows.filter((row) => !row.parseOk);
  const winnerEvidenceRows = normalizedResultRows.filter((row) => row.winnerTeamName);
  const winnerNeedsResolutionRows = normalizedResultRows.filter((row) => !row.winnerTeamName);

  const cupFinalEvidenceRows = normalizedResultRows.filter((row) => {
    return row.round === "Finale" &&
      row.date === "2026-05-13" &&
      row.localTimeRaw === "18:00" &&
      row.homeTeamName === "GNK Dinamo" &&
      row.awayTeamName === "HNK Rijeka" &&
      row.homeScore === 2 &&
      row.awayScore === 0;
  });

  const finalWinnerEvidenceRows = cupFinalEvidenceRows
    .filter((row) => row.winnerTeamName === "GNK Dinamo")
    .map((row) => ({
      ...row,
      cupWinnerTeamName: row.winnerTeamName,
      cupWinnerEvidenceState: "official_first_source_final_result_extracted_needs_second_source",
      canonicalPromotionReady: false
    }));

  const summary = {
    ok: invalidRows.length === 0 && cupFinalEvidenceRows.length === 1 && finalWinnerEvidenceRows.length === 1,
    targetCompetitionSlug: "cro.cup",
    officialSource: "HNS Semafor",
    conservativeInputRowCount: conservativeRows.length,
    recoveredBadStructuredRowCount: badStructuredRows.filter((row) => normalizeFixtureRow(row, "test").parseOk).length,
    evidenceRowCount: evidenceRows.length,
    finalEvidenceContextFound: Boolean(finalEvidenceSourceRow),
    normalizedFixtureRowCount: normalizedFixtureRows.length,
    normalizedResultRowCount: normalizedResultRows.length,
    invalidRowCount: invalidRows.length,
    winnerEvidenceRowCount: winnerEvidenceRows.length,
    winnerNeedsResolutionRowCount: winnerNeedsResolutionRows.length,
    cupFinalEvidenceRowCount: cupFinalEvidenceRows.length,
    finalWinnerEvidenceRowCount: finalWinnerEvidenceRows.length,
    conclusion:
      invalidRows.length === 0 && cupFinalEvidenceRows.length === 1 && finalWinnerEvidenceRows.length === 1
        ? "HNS Semafor Cro Cup official rows normalized with one final/winner evidence row. This is first-source evidence only."
        : "HNS Semafor Cro Cup normalization still has unresolved validation issues.",
    sourceFetch: false,
    noSearch: true,
    noFetch: true,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };

  return {
    ok: summary.ok,
    job: "build-uefa-semafor-normalized-rows-file",
    generatedAt: new Date().toISOString(),
    inputPaths,
    summary,
    normalizedFixtureRows,
    normalizedResultRows,
    winnerEvidenceRows,
    winnerNeedsResolutionRows,
    cupFinalEvidenceRows,
    finalWinnerEvidenceRows,
    invalidRows,
    guarantees: {
      sourceFetch: false,
      searchUsed: false,
      noSearch: true,
      noFetch: true,
      noPost: true,
      noPatch: true,
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
  const conservativeInput = {
    structuredFixtureRows: [{
      competitionSlug: "cro.cup",
      source: "official_hns_semafor_html",
      sourceUrl: "https://semafor.hns.family/natjecanja/100439118/supersport-hnk/detaljno/",
      competitionId: "100439118",
      competitionName: "SuperSport Hrvatski nogometni kup 2025/26",
      round: "Četvrtfinale",
      date: "04.03.2026.",
      time: "18:00",
      homeTeam: "GNK Dinamo",
      awayTeam: "NK Kurilovec",
      homeGoals: 2,
      awayGoals: 0,
      homePenalties: null,
      awayPenalties: null,
      status: "completed",
      rawMatchText: "04.03.2026. 18:00 GNK Dinamo 2 : 0 NK Kurilovec Stadion Maksimir, Zagreb"
    }],
    badStructuredRows: []
  };

  const evidenceInput = {
    evidenceRows: [{
      pattern: "Dinamo",
      context: "Polufinale 08.04.2026. 18:30 HNK Gorica s.d.d. 3 : 6 GNK Dinamo Gradski stadion, Velika Gorica Finale 13.05.2026. 18:00 GNK Dinamo 2 : 0 HNK Rijeka Opus Arena, Osijek 1 Mounsef Bakrar GNK Dinamo 5"
    }]
  };

  const report = buildReport(conservativeInput, evidenceInput, {
    conservative: "self-test-conservative",
    evidence: "self-test-evidence"
  });

  if (!report.ok) throw new Error("self-test report was not ok");
  if (report.summary.cupFinalEvidenceRowCount !== 1) throw new Error("expected one final evidence row");
  if (report.finalWinnerEvidenceRows[0].cupWinnerTeamName !== "GNK Dinamo") {
    throw new Error("unexpected cup winner");
  }
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("read-only guarantees failed");
  }

  return {
    ok: true,
    selfTest: "build-uefa-semafor-normalized-rows-file",
    summary: report.summary
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const conservativeInput = readJson(args.conservative);
  const evidenceInput = readJson(args.evidence);

  const report = buildReport(conservativeInput, evidenceInput, {
    conservative: args.conservative,
    evidence: args.evidence
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: report.ok,
    output: path.relative(repoRoot, args.output).replace(/\\/g, "/"),
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));

  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (path.resolve(process.argv[1] || "") === __filename) {
  main();
}

export {
  buildReport,
  normalizeFixtureRow,
  parseFinalEvidenceRow
};
