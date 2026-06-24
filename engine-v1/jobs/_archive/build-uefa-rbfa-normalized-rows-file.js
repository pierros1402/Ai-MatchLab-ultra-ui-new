import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const out = {
    input: "",
    output: "",
    selfTest: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") {
      out.selfTest = true;
      continue;
    }

    if (arg === "--input") {
      out.input = argv[++i] || "";
      continue;
    }

    if (arg === "--output") {
      out.output = argv[++i] || "";
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return out;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeTeamName(value) {
  return String(value || "").trim();
}

function normalizeDateTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return { date: "", localTimeRaw: "" };

  const match = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (match) {
    return {
      date: match[1],
      localTimeRaw: match[2],
    };
  }

  return {
    date: "",
    localTimeRaw: raw,
  };
}

function hasScore(row) {
  return row.homeGoals !== null &&
    row.homeGoals !== undefined &&
    row.awayGoals !== null &&
    row.awayGoals !== undefined &&
    String(row.homeGoals) !== "" &&
    String(row.awayGoals) !== "";
}

function inferWinner(row) {
  if (!hasScore(row)) {
    return {
      winnerTeamName: "",
      winnerResolution: "no_score",
    };
  }

  const homeGoals = Number(row.homeGoals);
  const awayGoals = Number(row.awayGoals);

  if (Number.isNaN(homeGoals) || Number.isNaN(awayGoals)) {
    return {
      winnerTeamName: "",
      winnerResolution: "invalid_score",
    };
  }

  if (homeGoals > awayGoals) {
    return {
      winnerTeamName: normalizeTeamName(row.homeTeam),
      winnerResolution: "normal_time_score",
    };
  }

  if (awayGoals > homeGoals) {
    return {
      winnerTeamName: normalizeTeamName(row.awayTeam),
      winnerResolution: "normal_time_score",
    };
  }

  const homePenalties = row.homePenalties === null || row.homePenalties === undefined || String(row.homePenalties) === ""
    ? null
    : Number(row.homePenalties);
  const awayPenalties = row.awayPenalties === null || row.awayPenalties === undefined || String(row.awayPenalties) === ""
    ? null
    : Number(row.awayPenalties);

  if (homePenalties !== null && awayPenalties !== null && !Number.isNaN(homePenalties) && !Number.isNaN(awayPenalties)) {
    if (homePenalties > awayPenalties) {
      return {
        winnerTeamName: normalizeTeamName(row.homeTeam),
        winnerResolution: "penalties",
      };
    }

    if (awayPenalties > homePenalties) {
      return {
        winnerTeamName: normalizeTeamName(row.awayTeam),
        winnerResolution: "penalties",
      };
    }
  }

  return {
    winnerTeamName: "",
    winnerResolution: "draw_or_penalty_resolution_required",
  };
}

function languagePriority(language) {
  if (language === "en") return 0;
  if (language === "nl") return 1;
  if (language === "fr") return 2;
  return 3;
}

function dedupeById(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const id = String(row.id || "");
    if (!id) continue;

    const previous = grouped.get(id);
    if (!previous || languagePriority(row.language) < languagePriority(previous.language)) {
      grouped.set(id, row);
    }
  }

  return [...grouped.values()];
}

function normalizeRows(inputJson) {
  const sourceRows = Array.isArray(inputJson.uniqueFixtureRows)
    ? inputJson.uniqueFixtureRows
    : [];

  const dedupedRows = dedupeById(sourceRows);

  const normalizedFixtureRows = dedupedRows.map((row) => {
    const dateTime = normalizeDateTime(row.startTime);
    const winner = inferWinner(row);

    const normalizedStatus = row.state === "finished"
      ? "finished"
      : row.startDateTimeInThePassed === true
        ? "finished_or_past_state_unknown"
        : "scheduled";

    return {
      competitionSlug: "bel.cup",
      competitionName: "Croky Cup",
      sourceProvider: "RBFA GraphQL",
      sourceMatchId: String(row.id || ""),
      sourceSeriesId: String(row.seriesId || ""),
      sourceSeriesName: String(row.seriesName || ""),
      language: String(row.language || ""),
      date: dateTime.date,
      localTimeRaw: dateTime.localTimeRaw,
      startTimeRaw: String(row.startTime || ""),
      homeTeamName: normalizeTeamName(row.homeTeam),
      awayTeamName: normalizeTeamName(row.awayTeam),
      homeScore: hasScore(row) ? Number(row.homeGoals) : null,
      awayScore: hasScore(row) ? Number(row.awayGoals) : null,
      homePenalties: row.homePenalties === null || row.homePenalties === undefined || String(row.homePenalties) === "" ? null : Number(row.homePenalties),
      awayPenalties: row.awayPenalties === null || row.awayPenalties === undefined || String(row.awayPenalties) === "" ? null : Number(row.awayPenalties),
      rawState: String(row.state || ""),
      outcomeStatus: row.outcomeStatus ?? null,
      outcomeSubscript: row.outcomeSubscript ?? null,
      showScore: row.showScore === true,
      startDateTimeInThePassed: row.startDateTimeInThePassed === true,
      normalizedStatus,
      winnerTeamName: winner.winnerTeamName,
      winnerResolution: winner.winnerResolution,
      rawRow: row,
    };
  });

  const normalizedResultRows = normalizedFixtureRows.filter((row) =>
    row.normalizedStatus === "finished" &&
    row.homeScore !== null &&
    row.awayScore !== null
  );

  const normalizedScheduledRows = normalizedFixtureRows.filter((row) =>
    row.normalizedStatus !== "finished"
  );

  const winnerEvidenceRows = normalizedResultRows.filter((row) =>
    row.winnerTeamName &&
    row.winnerResolution !== "draw_or_penalty_resolution_required"
  );

  const winnerNeedsResolutionRows = normalizedResultRows.filter((row) =>
    !row.winnerTeamName ||
    row.winnerResolution === "draw_or_penalty_resolution_required"
  );

  const sortedFinishedRows = [...normalizedResultRows].sort((a, b) => {
    const aKey = `${a.date}T${a.localTimeRaw}`;
    const bKey = `${b.date}T${b.localTimeRaw}`;
    return bKey.localeCompare(aKey);
  });

  const cupFinalEvidenceRows = sortedFinishedRows.length > 0
    ? [sortedFinishedRows[0]]
    : [];

  const finalWinnerEvidenceRows = cupFinalEvidenceRows.filter((row) =>
    row.winnerTeamName
  );

  const invalidRows = normalizedFixtureRows.filter((row) =>
    !row.sourceMatchId ||
    !row.homeTeamName ||
    !row.awayTeamName ||
    !row.date
  );

  return {
    sourceInputRowCount: sourceRows.length,
    dedupedFixtureRowCount: dedupedRows.length,
    normalizedFixtureRows,
    normalizedResultRows,
    normalizedScheduledRows,
    winnerEvidenceRows,
    winnerNeedsResolutionRows,
    cupFinalEvidenceRows,
    finalWinnerEvidenceRows,
    invalidRows,
  };
}

function buildOutput(inputJson) {
  const normalized = normalizeRows(inputJson);

  const summary = {
    ok: normalized.invalidRows.length === 0,
    targetCompetitionSlug: "bel.cup",
    officialSource: "RBFA GraphQL",
    sourceInputRowCount: normalized.sourceInputRowCount,
    dedupedFixtureRowCount: normalized.dedupedFixtureRowCount,
    normalizedFixtureRowCount: normalized.normalizedFixtureRows.length,
    normalizedResultRowCount: normalized.normalizedResultRows.length,
    normalizedScheduledRowCount: normalized.normalizedScheduledRows.length,
    invalidRowCount: normalized.invalidRows.length,
    winnerEvidenceRowCount: normalized.winnerEvidenceRows.length,
    winnerNeedsResolutionRowCount: normalized.winnerNeedsResolutionRows.length,
    cupFinalEvidenceRowCount: normalized.cupFinalEvidenceRows.length,
    finalWinnerEvidenceRowCount: normalized.finalWinnerEvidenceRows.length,
    conclusion: "RBFA Croky Cup rows normalized with first-source final/winner evidence. This is first-source evidence only.",
    sourceFetch: false,
    noSearch: true,
    noFetch: true,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
  };

  return {
    ok: summary.ok,
    generatedAt: new Date().toISOString(),
    summary,
    normalizedFixtureRows: normalized.normalizedFixtureRows,
    normalizedResultRows: normalized.normalizedResultRows,
    normalizedScheduledRows: normalized.normalizedScheduledRows,
    winnerEvidenceRows: normalized.winnerEvidenceRows,
    winnerNeedsResolutionRows: normalized.winnerNeedsResolutionRows,
    cupFinalEvidenceRows: normalized.cupFinalEvidenceRows,
    finalWinnerEvidenceRows: normalized.finalWinnerEvidenceRows,
    invalidRows: normalized.invalidRows,
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
      diagnosticOnly: true,
    },
  };
}

function runSelfTest() {
  const input = {
    uniqueFixtureRows: [
      {
        language: "fr",
        competitionSlug: "bel.cup",
        seriesId: "CUP_3460",
        seriesName: "Croky Cup",
        id: "final-1",
        state: "finished",
        startTime: "2026-05-14T15:00:00",
        homeTeam: "R. UNION ST-GILLOISE",
        awayTeam: "R.S.C. ANDERLECHT",
        homeGoals: 3,
        awayGoals: 1,
        homePenalties: null,
        awayPenalties: null,
        outcomeStatus: "finished",
        outcomeSubscript: null,
        showScore: true,
        startDateTimeInThePassed: true,
      },
      {
        language: "en",
        competitionSlug: "bel.cup",
        seriesId: "CUP_3460",
        seriesName: "Croky Cup",
        id: "final-1",
        state: "finished",
        startTime: "2026-05-14T15:00:00",
        homeTeam: "R. UNION ST-GILLOISE",
        awayTeam: "R.S.C. ANDERLECHT",
        homeGoals: 3,
        awayGoals: 1,
        homePenalties: null,
        awayPenalties: null,
        outcomeStatus: "finished",
        outcomeSubscript: null,
        showScore: true,
        startDateTimeInThePassed: true,
      },
    ],
  };

  const output = buildOutput(input);

  if (output.summary.dedupedFixtureRowCount !== 1) {
    throw new Error("self-test dedupe failed");
  }

  if (output.summary.finalWinnerEvidenceRowCount !== 1) {
    throw new Error("self-test final winner evidence failed");
  }

  if (output.finalWinnerEvidenceRows[0].winnerTeamName !== "R. UNION ST-GILLOISE") {
    throw new Error("self-test winner failed");
  }

  return {
    ok: true,
    selfTest: "build-uefa-rbfa-normalized-rows-file",
    summary: output.summary,
  };
}

function main() {
  const args = parseArgs(process.argv);

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  if (!args.input) throw new Error("Missing required --input");
  if (!args.output) throw new Error("Missing required --output");

  const inputJson = readJson(args.input);
  const output = buildOutput(inputJson);

  writeJson(args.output, output);

  console.log(JSON.stringify({
    ok: output.ok,
    output: args.output,
    summary: output.summary,
    guarantees: output.guarantees,
  }, null, 2));
}

main();
