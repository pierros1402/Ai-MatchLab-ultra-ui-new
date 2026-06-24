#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function parseArgs(argv) {
  const out = {
    selfTest: false,
    board: "",
    output: "",
    topLimit: 0
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") {
      out.selfTest = true;
      continue;
    }

    if (arg === "--board") {
      out.board = argv[i + 1] || "";
      i += 1;
      continue;
    }

    if (arg === "--output") {
      out.output = argv[i + 1] || "";
      i += 1;
      continue;
    }

    if (arg === "--top-limit") {
      out.topLimit = Number(argv[i + 1] || 0);
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return out;
}

function rowsFromBoard(board) {
  if (Array.isArray(board.rows)) return board.rows;
  if (Array.isArray(board.boardRows)) return board.boardRows;
  return [];
}

function priorityFor(row) {
  const slug = asText(row.leagueSlug);
  const type = asText(row.coverageType).toLowerCase();
  const region = asText(row.coverageRegion).toLowerCase();
  const country = asText(row.coverageCountry).toLowerCase();

  let score = 0;
  const reasons = [];

  if (/^(eng|esp|ita|ger|fra|por|ned|bel|sco|tur|usa|bra|arg|mex|jpn|kor|aus|aut|sui|den|nor|swe|fin|irl)\./.test(slug)) {
    score += 100;
    reasons.push("high_value_country_or_known_market");
  }

  if (/\.(1)$/.test(slug)) {
    score += 90;
    reasons.push("top_domestic_tier");
  } else if (/\.(2)$/.test(slug)) {
    score += 55;
    reasons.push("second_domestic_tier");
  } else if (/cup$/.test(slug)) {
    score += 40;
    reasons.push("national_cup");
  }

  if (/uefa|conmebol|concacaf|afc|caf|ofc|fifa/.test(slug) || /continental|global/.test(type)) {
    score += 85;
    reasons.push("continental_or_global_competition");
  }

  if (/europe/.test(region)) {
    score += 35;
    reasons.push("europe_region");
  } else if (/north america|south america/.test(region)) {
    score += 25;
    reasons.push("americas_region");
  } else if (/asia/.test(region)) {
    score += 18;
    reasons.push("asia_region");
  }

  if (/england|spain|italy|germany|france|portugal|netherlands|belgium|scotland|turkey|united states|brazil|argentina|mexico|japan|south korea|australia/.test(country)) {
    score += 25;
    reasons.push("priority_country_name");
  }

  if (!score) {
    score = 10;
    reasons.push("long_tail_registry_gap");
  }

  return { score, reasons };
}

function batchNameFor(row, score) {
  const slug = asText(row.leagueSlug);
  const region = asText(row.coverageRegion).toLowerCase();

  if (score >= 160) return "batch_01_high_value_official_routes";
  if (/uefa|conmebol|concacaf|afc|caf|ofc|fifa/.test(slug)) return "batch_02_confederation_and_global_routes";
  if (/europe/.test(region)) return "batch_03_european_domestic_routes";
  if (/north america|south america/.test(region)) return "batch_04_americas_domestic_routes";
  if (/asia|oceania/.test(region)) return "batch_05_asia_oceania_domestic_routes";
  if (/africa/.test(region)) return "batch_06_africa_domestic_routes";
  return "batch_07_long_tail_routes";
}

function buildPlan(board, options = {}) {
  const boardRows = rowsFromBoard(board);
  const missingRows = boardRows.filter((row) => row.nextAction === "expand_official_route_registry");

  const planRows = missingRows
    .map((row) => {
      const priority = priorityFor(row);
      const batchName = batchNameFor(row, priority.score);

      return {
        leagueSlug: asText(row.leagueSlug),
        competitionName: asText(row.competitionName),
        coverageType: asText(row.coverageType),
        coverageRegion: asText(row.coverageRegion),
        coverageCountry: asText(row.coverageCountry),
        currentCalendarState: asText(row.calendarState),
        currentNextAction: asText(row.nextAction),
        priorityScore: priority.score,
        priorityReasons: priority.reasons,
        recommendedBatch: batchName,
        registryPatchState: "not_started",
        expectedSourceWork: "identify_official_host_and_specific_calendar_routes",
        sourceFetch: false,
        noSearch: true,
        noFetch: true,
        canonicalWrites: 0,
        productionWrite: false,
        dryRun: true
      };
    })
    .sort((a, b) => (
      b.priorityScore - a.priorityScore ||
      a.recommendedBatch.localeCompare(b.recommendedBatch) ||
      a.coverageRegion.localeCompare(b.coverageRegion) ||
      a.coverageCountry.localeCompare(b.coverageCountry) ||
      a.leagueSlug.localeCompare(b.leagueSlug)
    ));

  const batchRows = Array.from(new Map(
    planRows.map((row) => [row.recommendedBatch, row.recommendedBatch])
  ).values()).map((batchName) => {
    const rows = planRows.filter((row) => row.recommendedBatch === batchName);

    return {
      batchName,
      rowCount: rows.length,
      sampleLeagueSlugs: rows.slice(0, 40).map((row) => row.leagueSlug),
      maxPriorityScore: rows.length ? Math.max(...rows.map((row) => row.priorityScore)) : 0,
      minPriorityScore: rows.length ? Math.min(...rows.map((row) => row.priorityScore)) : 0
    };
  });

  const topLimit = Number(options.topLimit || 0);
  const actionBatchRows = topLimit > 0 ? planRows.slice(0, topLimit) : [];
  const actionBatchByBatch = Array.from(new Map(
    actionBatchRows.map((row) => [row.recommendedBatch, row.recommendedBatch])
  ).values()).map((batchName) => {
    const rows = actionBatchRows.filter((row) => row.recommendedBatch === batchName);

    return {
      batchName,
      rowCount: rows.length,
      sampleLeagueSlugs: rows.slice(0, 40).map((row) => row.leagueSlug),
      maxPriorityScore: rows.length ? Math.max(...rows.map((row) => row.priorityScore)) : 0,
      minPriorityScore: rows.length ? Math.min(...rows.map((row) => row.priorityScore)) : 0
    };
  });

  const summary = {
    ok: true,
    date: options.date || "",
    inputBoardRowCount: boardRows.length,
    registryMissingRowCount: missingRows.length,
    plannedRegistryExpansionRowCount: planRows.length,
    actionBatchLimit: topLimit,
    actionBatchRowCount: actionBatchRows.length,
    actionBatchByBatch,
    batchCount: batchRows.length,
    byBatch: batchRows,
    topPrioritySample: planRows.slice(0, 80).map((row) => ({
      leagueSlug: row.leagueSlug,
      competitionName: row.competitionName,
      coverageRegion: row.coverageRegion,
      coverageCountry: row.coverageCountry,
      priorityScore: row.priorityScore,
      recommendedBatch: row.recommendedBatch,
      priorityReasons: row.priorityReasons
    })),
    guarantees: {
      noSearch: true,
      noFetch: true,
      noCanonicalPromotion: true,
      noRegistryWrite: true,
      canonicalWrites: 0,
      productionWrite: false,
      diagnosticOnly: true
    }
  };

  return {
    ok: true,
    summary,
    actionBatchRows,
    planRows
  };
}

function selfTest() {
  const plan = buildPlan({
    rows: [
      {
        leagueSlug: "eng.1",
        coverageRegion: "Europe",
        coverageCountry: "England",
        coverageType: "league",
        calendarState: "registry_missing",
        nextAction: "expand_official_route_registry"
      },
      {
        leagueSlug: "ben.2",
        coverageRegion: "Africa",
        coverageCountry: "Benin",
        coverageType: "league",
        calendarState: "registry_missing",
        nextAction: "expand_official_route_registry"
      },
      {
        leagueSlug: "esp.1",
        coverageRegion: "Europe",
        coverageCountry: "Spain",
        coverageType: "league",
        calendarState: "accepted_official_calendar",
        nextAction: "classify_season_state"
      }
    ]
  });

  if (plan.summary.inputBoardRowCount !== 3) throw new Error("expected 3 input rows");
  if (plan.summary.registryMissingRowCount !== 2) throw new Error("expected 2 registry missing rows");
  if (plan.planRows[0].leagueSlug !== "eng.1") throw new Error("expected eng.1 as top priority");

  return {
    ok: true,
    selfTest: true,
    summary: plan.summary,
    guarantees: plan.summary.guarantees
  };
}

function main() {
  const args = parseArgs(process.argv);

  if (args.selfTest) {
    console.log(JSON.stringify(selfTest(), null, 2));
    return;
  }

  if (!args.board) throw new Error("Missing required --board <path>");
  if (!args.output) throw new Error("Missing required --output <path>");

  const plan = buildPlan(readJson(args.board), { topLimit: args.topLimit });
  writeJson(args.output, plan);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: plan.summary,
    guarantees: plan.summary.guarantees
  }, null, 2));
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main();
}

export {
  buildPlan,
  selfTest
};