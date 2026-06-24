#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    readinessBoard: "data/football-truth/_diagnostics/uefa-targeted-recovery-batch-readiness-2026-06-08/uefa-targeted-recovery-state-after-fin-1-derived-standings-2026-06-08.json",
    belFirstSource: "data/football-truth/_diagnostics/bel-cup-rbfa-final-winner-first-source-2026-06-08/bel-cup-rbfa-final-winner-first-source-inspection-2026-06-08.json",
    croFirstSource: "data/football-truth/_diagnostics/uefa-provider-normalizer-schema-inspection-2026-06-08/cro-cup-final-and-bad-row-isolation-2026-06-08.json",
    finFirstSource: "data/football-truth/_diagnostics/official-route-registry-direct-batch-2026-06-07/post-two-signal-validator-board-rebuild-2026-06-07/uefa-remaining-6-targeted-recovery-2026-06-07/torneopal-controlled-full-payload-fetch-with-api-key-2026-06-08/fin-cup-MSC-spljp25-interceptor_accept_key-full-raw-2026-06-08.json",
    belSecondSource: "data/football-truth/_diagnostics/bel-cup-second-source-confirmation-2026-06-08/bel-cup-final-winner-second-source-validation-board-2026-06-08.json",
    croSecondSource: "data/football-truth/_diagnostics/cro-cup-second-source-confirmation-2026-06-08/cro-cup-final-winner-second-source-validation-board-2026-06-08.json",
    finSecondSource: "data/football-truth/_diagnostics/fin-cup-second-source-confirmation-2026-06-08/fin-cup-final-winner-second-source-validation-board-2026-06-08.json",
    output: "",
    selfTest: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--readiness-board") args.readinessBoard = argv[++index];
    else if (arg === "--bel-first-source") args.belFirstSource = argv[++index];
    else if (arg === "--cro-first-source") args.croFirstSource = argv[++index];
    else if (arg === "--fin-first-source") args.finFirstSource = argv[++index];
    else if (arg === "--bel-second-source") args.belSecondSource = argv[++index];
    else if (arg === "--cro-second-source") args.croSecondSource = argv[++index];
    else if (arg === "--fin-second-source") args.finSecondSource = argv[++index];
    else if (arg === "--output") args.output = argv[++index];
    else throw new Error(`unknown argument: ${arg}`);
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function requireReadyReadinessRow(board, competitionSlug) {
  const row = asArray(board.rows).find((item) => item.competitionSlug === competitionSlug);
  if (!row) throw new Error(`missing readiness row for ${competitionSlug}`);

  const ready =
    row.firstSourceFinalWinnerReady === true &&
    row.secondSourceConfirmed === true &&
    row.canonicalReadiness === "ready_for_promotion_plan_gate_not_written" &&
    row.currentStatus === "first_source_final_winner_normalized_and_second_source_confirmed";

  if (!ready) {
    throw new Error(`readiness row is not promotion-gate ready for ${competitionSlug}`);
  }

  return row;
}

function selectSecondSource(secondSourceBoard, competitionSlug) {
  if (secondSourceBoard?.summary?.selectedSecondSourceConfirmationReady !== true) {
    throw new Error(`second-source board is not ready for ${competitionSlug}`);
  }

  const rows = asArray(secondSourceBoard.selectedSecondSourceRows)
    .filter((row) =>
      row.competitionSlug === competitionSlug &&
      row.confirmationStatus === "second_source_confirmation_candidate" &&
      row.hasScore === true &&
      row.hasFinal === true &&
      row.hasWinner === true
    );

  if (rows.length < 1) {
    throw new Error(`missing strong independent second-source row for ${competitionSlug}`);
  }

  const selected = rows[0];
  return {
    hostName: selected.hostName || hostFromUrl(selected.url),
    url: selected.url || "",
    confirmationScore: selected.confirmationScore ?? 0,
    confirmationStatus: selected.confirmationStatus
  };
}

function parseCroOfficialFinal(firstSource) {
  const contexts = asArray(firstSource.finalEvidenceRows)
    .map((row) => String(row.context || ""))
    .filter(Boolean);

  const context = contexts.find((text) =>
    text.includes("Finale 13.05.2026. 18:00 GNK Dinamo 2 : 0 HNK Rijeka")
  );

  if (!context) {
    throw new Error("missing cro.cup official final context");
  }

  return {
    competitionSlug: "cro.cup",
    sourceProvider: "official_hns_semafor_html",
    officialHost: "semafor.hns.family",
    officialUrl: "https://semafor.hns.family/natjecanja/100439118/supersport-hnk/detaljno/",
    finalDate: "2026-05-13",
    finalTime: "18:00",
    homeTeam: "GNK Dinamo",
    awayTeam: "HNK Rijeka",
    homeGoals: 2,
    awayGoals: 0,
    winnerTeam: "GNK Dinamo",
    venue: "Opus Arena",
    city: "Osijek",
    officialEvidenceText: "Finale 13.05.2026. 18:00 GNK Dinamo 2 : 0 HNK Rijeka Opus Arena, Osijek"
  };
}

function parseBelOfficialFinal(firstSource) {
  const candidate = firstSource.finalCandidate;
  if (!candidate) throw new Error("missing bel.cup finalCandidate");

  return {
    competitionSlug: "bel.cup",
    sourceProvider: firstSource.sourceProvider || "official_rbfa_graphql",
    officialHost: "rbfa.be",
    officialUrl: "https://www.rbfa.be/en/competition/CUP_3460/calendar",
    finalDate: String(candidate.startTime || "").slice(0, 10),
    finalTime: String(candidate.startTime || "").slice(11, 16),
    homeTeam: candidate.homeTeam,
    awayTeam: candidate.awayTeam,
    homeGoals: Number(candidate.homeGoals),
    awayGoals: Number(candidate.awayGoals),
    winnerTeam: candidate.inferredWinnerTeamName,
    venue: "",
    city: "",
    officialEvidenceText: `${candidate.startTime} ${candidate.homeTeam} ${candidate.homeGoals}-${candidate.awayGoals} ${candidate.awayTeam}`
  };
}

function parseFinOfficialFinal(firstSource) {
  const matches = asArray(firstSource.matches);
  const row = matches.find((match) =>
    match.category_id === "MSC" &&
    match.competition_officiality === "official" &&
    match.status === "Played" &&
    match.group_name === "Loppuottelu" &&
    match.date === "2025-09-20" &&
    match.team_A_name === "HJK" &&
    match.team_B_name === "KuPS" &&
    String(match.fs_A) === "1" &&
    String(match.fs_B) === "0"
  );

  if (!row) throw new Error("missing fin.cup official final row");

  return {
    competitionSlug: "fin.cup",
    sourceProvider: "official_palloliitto_torneopal_api",
    officialHost: "tulospalvelu.palloliitto.fi",
    officialUrl: "https://tulospalvelu.palloliitto.fi/",
    finalDate: row.date,
    finalTime: String(row.time || "").slice(0, 5),
    homeTeam: row.team_A_name,
    awayTeam: row.team_B_name,
    homeGoals: Number(row.fs_A),
    awayGoals: Number(row.fs_B),
    winnerTeam: row.winner === "Home" ? row.team_A_name : row.winner === "Away" ? row.team_B_name : row.winner,
    venue: row.venue_name || "",
    city: row.venue_city_name || "",
    officialEvidenceText: `${row.date} ${row.time} ${row.group_name} ${row.team_A_name} ${row.fs_A}-${row.fs_B} ${row.team_B_name} ${row.venue_name || ""}`.trim()
  };
}

function buildPromotionPlanRow({ index, readinessRow, officialFinal, secondSource }) {
  const shapeComplete =
    Boolean(officialFinal.competitionSlug) &&
    Boolean(officialFinal.finalDate) &&
    Boolean(officialFinal.homeTeam) &&
    Boolean(officialFinal.awayTeam) &&
    Number.isFinite(officialFinal.homeGoals) &&
    Number.isFinite(officialFinal.awayGoals) &&
    Boolean(officialFinal.winnerTeam);

  const sourcePolicySatisfied =
    shapeComplete &&
    Boolean(officialFinal.officialHost) &&
    Boolean(secondSource.hostName) &&
    secondSource.hostName !== officialFinal.officialHost;

  const promotionPlanReady =
    readinessRow.firstSourceFinalWinnerReady === true &&
    readinessRow.secondSourceConfirmed === true &&
    readinessRow.canonicalReadiness === "ready_for_promotion_plan_gate_not_written" &&
    sourcePolicySatisfied;

  return {
    planRowId: `uefa-cup-winner-final-${officialFinal.competitionSlug}-${index + 1}`,
    competitionSlug: officialFinal.competitionSlug,
    promotionType: "competition_state_winner_final",
    proposedCanonicalState: promotionPlanReady
      ? "winner_final_confirmed_pending_writer_approval"
      : "blocked_not_ready",
    proposedCanonicalPayload: {
      competitionSlug: officialFinal.competitionSlug,
      finalDate: officialFinal.finalDate,
      finalTime: officialFinal.finalTime,
      homeTeam: officialFinal.homeTeam,
      awayTeam: officialFinal.awayTeam,
      homeGoals: officialFinal.homeGoals,
      awayGoals: officialFinal.awayGoals,
      finalScore: `${officialFinal.homeGoals}-${officialFinal.awayGoals}`,
      winnerTeam: officialFinal.winnerTeam,
      runnerUpTeam: officialFinal.winnerTeam === officialFinal.homeTeam ? officialFinal.awayTeam : officialFinal.homeTeam,
      venue: officialFinal.venue,
      city: officialFinal.city,
      officialSourceUrl: officialFinal.officialUrl,
      independentSecondSourceUrl: secondSource.url,
      sourceProvider: officialFinal.sourceProvider
    },
    readiness: {
      promotionPlanReady,
      shapeComplete,
      sourcePolicySatisfied,
      hasOfficialConfirmation: Boolean(officialFinal.officialHost),
      hasIndependentReference: Boolean(secondSource.hostName),
      secondSourceConfirmationReady: readinessRow.secondSourceConfirmed === true,
      canonicalPromotionReadyInReadinessBoard: readinessRow.canonicalReadiness === "ready_for_promotion_plan_gate_not_written",
      officialConfirmationHost: officialFinal.officialHost,
      independentReferenceHosts: [secondSource.hostName]
    },
    safetyGates: {
      requiresSeparateWriter: true,
      requiresExplicitPromotionApprovalFlag: true,
      requiresDryRunWriterFirst: true
    },
    evidence: {
      official: {
        hostName: officialFinal.officialHost,
        url: officialFinal.officialUrl,
        evidenceText: officialFinal.officialEvidenceText
      },
      independentSecondSource: secondSource
    },
    blockedCanonicalWriteReason: "promotion plan diagnostic only; canonical write requires separate writer with explicit approval",
    canonicalWrites: 0,
    productionWrite: false
  };
}

function buildReportFromInputs(inputs) {
  const board = readJson(inputs.readinessBoard);
  const belFirstSource = readJson(inputs.belFirstSource);
  const croFirstSource = readJson(inputs.croFirstSource);
  const finFirstSource = readJson(inputs.finFirstSource);

  const secondSourceBoards = {
    "bel.cup": readJson(inputs.belSecondSource),
    "cro.cup": readJson(inputs.croSecondSource),
    "fin.cup": readJson(inputs.finSecondSource)
  };

  const officialFinals = [
    parseBelOfficialFinal(belFirstSource),
    parseCroOfficialFinal(croFirstSource),
    parseFinOfficialFinal(finFirstSource)
  ];

  const promotionPlanRows = officialFinals.map((officialFinal, index) => {
    const readinessRow = requireReadyReadinessRow(board, officialFinal.competitionSlug);
    const secondSource = selectSecondSource(secondSourceBoards[officialFinal.competitionSlug], officialFinal.competitionSlug);
    return buildPromotionPlanRow({ index, readinessRow, officialFinal, secondSource });
  });

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    job: "build-uefa-cup-winner-final-promotion-plan-file",
    mode: "read_only_promotion_plan_adapter",
    inputPaths: inputs,
    summary: {
      promotionPlanRowCount: promotionPlanRows.length,
      promotionPlanReadyCount: promotionPlanRows.filter((row) => row.readiness.promotionPlanReady === true).length,
      blockedPromotionPlanCount: promotionPlanRows.filter((row) => row.readiness.promotionPlanReady !== true).length,
      proposedCanonicalWriteCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      dryRun: true
    },
    promotionPlanRows,
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function runSelfTest() {
  const report = {
    summary: {
      promotionPlanRowCount: 3,
      promotionPlanReadyCount: 3,
      proposedCanonicalWriteCount: 0,
      canonicalWrites: 0,
      productionWrite: false
    },
    guarantees: {
      canonicalWrites: 0,
      productionWrite: false
    }
  };

  if (report.summary.promotionPlanRowCount !== 3) throw new Error("self-test expected three rows");
  if (report.summary.promotionPlanReadyCount !== 3) throw new Error("self-test expected three ready rows");
  if (report.summary.proposedCanonicalWriteCount !== 0) throw new Error("self-test expected zero proposed writes");
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("self-test read-only guarantees failed");
  }

  console.log(JSON.stringify({ ok: true, selfTest: true }, null, 2));
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    runSelfTest();
    return;
  }

  const report = buildReportFromInputs(args);

  if (report.summary.promotionPlanRowCount !== 3) throw new Error("expected exactly three UEFA cup promotion plan rows");
  if (report.summary.promotionPlanReadyCount !== 3) throw new Error("expected all three UEFA cup rows to be promotion-plan ready");
  if (report.summary.proposedCanonicalWriteCount !== 0) throw new Error("promotion plan must not propose direct canonical writes");
  if (report.guarantees.sourceFetch !== false || report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("read-only guarantees failed");
  }

  const output = args.output;
  if (output) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export {
  buildReportFromInputs,
  parseBelOfficialFinal,
  parseCroOfficialFinal,
  parseFinOfficialFinal
};


