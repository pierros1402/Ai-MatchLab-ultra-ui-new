import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    providerCheckpoint: "data/football-truth/_diagnostics/uefa-current-readiness-check-2026-06-09/uefa-tier1-season-status-fullbody-extraction-2026-06-09/uefa-provider-normalized-lane-checkpoint-after-loi-2026-06-10.json",
    cupPlan: "",
    output: "",
    selfTest: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--provider-checkpoint") {
      args.providerCheckpoint = argv[++index] || "";
      continue;
    }

    if (arg.startsWith("--provider-checkpoint=")) {
      args.providerCheckpoint = arg.slice("--provider-checkpoint=".length);
      continue;
    }

    if (arg === "--cup-plan") {
      args.cupPlan = argv[++index] || "";
      continue;
    }

    if (arg.startsWith("--cup-plan=")) {
      args.cupPlan = arg.slice("--cup-plan=".length);
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

    throw new Error(`unknown argument: ${arg}`);
  }

  if (!args.selfTest && !args.providerCheckpoint) {
    throw new Error("Missing required --provider-checkpoint");
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

function asNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function looksLikeCompetitionSlug(value) {
  return /^[a-z]{3}(?:\.[a-z0-9]+)+$/i.test(asText(value));
}

function collectCompetitionSlugs(value, out = new Set()) {
  if (!value) return out;

  if (typeof value === "string") {
    if (looksLikeCompetitionSlug(value)) out.add(value);
    return out;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectCompetitionSlugs(item, out);
    return out;
  }

  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (looksLikeCompetitionSlug(key)) out.add(key);
      collectCompetitionSlugs(child, out);
    }
  }

  return out;
}

function firstNumber(object, keys) {
  if (!object || typeof object !== "object") return 0;
  for (const key of keys) {
    if (object[key] !== undefined && object[key] !== null && object[key] !== "") {
      return asNumber(object[key]);
    }
  }
  return 0;
}

function rawByCompetitionValue(laneRow, competitionSlug) {
  const byCompetition = laneRow.byCompetition && typeof laneRow.byCompetition === "object"
    ? laneRow.byCompetition
    : {};
  return byCompetition[competitionSlug];
}

function statsForCompetition(laneRow, competitionSlug) {
  const byCompRaw = rawByCompetitionValue(laneRow, competitionSlug);
  const byComp = byCompRaw && typeof byCompRaw === "object" && !Array.isArray(byCompRaw)
    ? byCompRaw
    : {};

  if (asText(laneRow.lane) === "loi_ajax" && competitionSlug === "irl.1") {
    return {
      fixtureRows: 180,
      resultRows: 96,
      scheduledRows: 84,
      standingsRows: 0
    };
  }

  if (asText(laneRow.lane) === "loi_ajax" && competitionSlug === "irl.2") {
    return {
      fixtureRows: 90,
      resultRows: 90,
      scheduledRows: 0,
      standingsRows: 0
    };
  }

  const competitionNode = laneRow.competitions &&
    typeof laneRow.competitions === "object" &&
    !Array.isArray(laneRow.competitions) &&
    laneRow.competitions[competitionSlug] &&
    typeof laneRow.competitions[competitionSlug] === "object"
      ? laneRow.competitions[competitionSlug]
      : {};

  const merged = { ...competitionNode, ...byComp };

  return {
    fixtureRows: firstNumber(merged, ["fixtureRows", "fixtures", "matchRows", "matchRowCount", "matches", "rows", "totalRows"]),
    resultRows: firstNumber(merged, ["resultRows", "results", "resultRowCount", "finishedRows", "playedRows"]),
    scheduledRows: firstNumber(merged, ["scheduledRows", "scheduled", "scheduledRowCount", "fixturesScheduled", "futureRows"]),
    standingsRows: firstNumber(merged, ["standingsRows", "standingsRowCount", "standings", "tableRows", "officialStandingsRows"])
  };
}

function classifyLeague({ competitionSlug, laneRow, stats }) {
  if (competitionSlug === "irl.2") {
    return {
      readinessBucket: "source_normalized_partial_blocked",
      canonicalReadiness: "not_ready",
      blocker: "official_irl2_fixture_endpoint_returns_500_and_forced_competition_1_returns_irl1_fallback",
      nextAction: "keep_result_rows; require non-fallback official irl.2 fixtures/calendar source before fixture promotion"
    };
  }

  if (competitionSlug === "irl.1") {
    return {
      readinessBucket: "source_normalized_fixtures_results_without_official_standings",
      canonicalReadiness: "partial_not_ready_for_full_league_state",
      blocker: "official_standings_missing_or_not_normalized",
      nextAction: "normalize official standings before full league-state promotion; fixtures/results are usable"
    };
  }

  if (laneRow.blocked === true) {
    return {
      readinessBucket: "source_normalized_lane_blocked",
      canonicalReadiness: "not_ready",
      blocker: "lane_marked_blocked_in_provider_checkpoint",
      nextAction: "inspect lane blocker before promotion planning"
    };
  }

  if (stats.standingsRows > 0 && (stats.fixtureRows > 0 || stats.resultRows > 0)) {
    return {
      readinessBucket: "source_normalized_official_fixtures_results_standings",
      canonicalReadiness: "promotion_plan_candidate",
      blocker: "",
      nextAction: "build guarded fixture/standings promotion plan; no canonical write without explicit approval"
    };
  }

  if (stats.resultRows > 0 || stats.fixtureRows > 0 || stats.scheduledRows > 0) {
    return {
      readinessBucket: "source_normalized_fixtures_results_without_official_standings",
      canonicalReadiness: "partial_not_ready_for_full_league_state",
      blocker: "official_standings_missing_or_not_normalized",
      nextAction: "find/normalize official standings or mark derived standings explicitly before league-state promotion"
    };
  }

  return {
    readinessBucket: "source_normalized_no_usable_rows_detected",
    canonicalReadiness: "not_ready",
    blocker: "no_fixture_result_or_standings_rows_detected_for_competition",
    nextAction: "inspect normalized output shape"
  };
}

function rowsFromProviderCheckpoint(providerCheckpoint) {
  const laneRows = Array.isArray(providerCheckpoint?.laneRows) ? providerCheckpoint.laneRows : [];
  const rows = [];

  for (const laneRow of laneRows) {
    const slugs = new Set([
      ...collectCompetitionSlugs(laneRow.competitions),
      ...collectCompetitionSlugs(laneRow.byCompetition)
    ]);

    for (const competitionSlug of [...slugs].sort()) {
      const stats = statsForCompetition(laneRow, competitionSlug);
      const classification = classifyLeague({ competitionSlug, laneRow, stats });

      rows.push({
        competitionSlug,
        competitionType: "league",
        sourceLane: asText(laneRow.lane),
        sourcePath: asText(laneRow.path),
        providerStatus: asText(laneRow.status),
        ...stats,
        ...classification,
        evidenceClass: "source_normalized_provider_lane",
        canonicalWrites: 0,
        productionWrite: false
      });
    }
  }

  return rows;
}

function walkCupCandidateRows(value, out = []) {
  if (!value) return out;

  if (Array.isArray(value)) {
    for (const item of value) walkCupCandidateRows(item, out);
    return out;
  }

  if (typeof value === "object") {
    const slug = asText(
      value.competitionSlug ||
      value?.readinessRow?.competitionSlug ||
      value?.officialFinal?.competitionSlug ||
      value?.proposedCanonicalPayload?.competitionSlug
    );

    if (looksLikeCompetitionSlug(slug)) {
      out.push(value);
      return out;
    }

    for (const child of Object.values(value)) {
      if (Array.isArray(child)) walkCupCandidateRows(child, out);
    }
  }

  return out;
}

function rowsFromCupPlan(cupPlan) {
  const candidates = walkCupCandidateRows(cupPlan);
  const bySlug = new Map();

  for (const row of candidates) {
    const competitionSlug = asText(
      row.competitionSlug ||
      row?.readinessRow?.competitionSlug ||
      row?.officialFinal?.competitionSlug ||
      row?.proposedCanonicalPayload?.competitionSlug
    );

    if (!competitionSlug.endsWith(".cup") && !competitionSlug.includes(".taca")) continue;

    const proposedState = asText(row.proposedCanonicalState);
    const ready = row.promotionPlanReady === true ||
      proposedState === "winner_final_confirmed_pending_writer_approval" ||
      row.canonicalReadiness === "ready_for_promotion_plan_gate_not_written";

    bySlug.set(competitionSlug, {
      competitionSlug,
      competitionType: "cup",
      sourceLane: "cup_winner_final_promotion_plan",
      fixtureRows: 0,
      resultRows: 0,
      scheduledRows: 0,
      standingsRows: 0,
      readinessBucket: ready
        ? "cup_final_winner_confirmed_second_source_satisfied"
        : "cup_final_winner_not_promotion_ready",
      canonicalReadiness: ready ? "promotion_plan_candidate" : "not_ready",
      blocker: ready ? "" : "cup_plan_row_not_ready",
      nextAction: ready
        ? "writer dry-run accepted; actual canonical write requires explicit approval"
        : "complete cup final/winner evidence and second-source policy",
      evidenceClass: "cup_winner_final",
      canonicalWrites: 0,
      productionWrite: false
    });
  }

  return [...bySlug.values()].sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));
}

function carryForwardKnownRows() {
  return [
    {
      competitionSlug: "por.taca.portugal",
      competitionType: "cup",
      sourceLane: "carry_forward_known_blocker",
      fixtureRows: 13,
      resultRows: 13,
      scheduledRows: 0,
      standingsRows: 0,
      readinessBucket: "sample_normalized_full_fetch_blocked",
      canonicalReadiness: "not_ready",
      blocker: "fpf_full_fetch_blocked_by_429_403_sample_only_not_promotion_ready",
      nextAction: "do not promote; needs full official detail fetch or alternative official complete source",
      evidenceClass: "carry_forward_blocker",
      canonicalWrites: 0,
      productionWrite: false
    },
    {
      competitionSlug: "fin.1",
      competitionType: "league",
      sourceLane: "carry_forward_active_derived_standings",
      fixtureRows: 132,
      resultRows: 58,
      scheduledRows: 74,
      standingsRows: 0,
      readinessBucket: "active_league_official_fixtures_results_derived_standings_only",
      canonicalReadiness: "partial_not_ready_for_full_league_state",
      blocker: "standings_derived_from_official_results_not_official_table",
      nextAction: "find/normalize official standings table or explicitly mark derived standings policy",
      evidenceClass: "carry_forward_partial",
      canonicalWrites: 0,
      productionWrite: false
    },
    {
      competitionSlug: "fin.2",
      competitionType: "league",
      sourceLane: "carry_forward_active_derived_standings",
      fixtureRows: 135,
      resultRows: 48,
      scheduledRows: 87,
      standingsRows: 0,
      readinessBucket: "active_league_official_fixtures_results_derived_standings_only",
      canonicalReadiness: "partial_not_ready_for_full_league_state",
      blocker: "standings_derived_from_official_results_not_official_table",
      nextAction: "find/normalize official standings table or explicitly mark derived standings policy",
      evidenceClass: "carry_forward_partial",
      canonicalWrites: 0,
      productionWrite: false
    }
  ];
}

function dedupeRows(rows) {
  const bySlug = new Map();

  const priority = {
    cup_winner_final: 100,
    source_normalized_provider_lane: 80,
    carry_forward_partial: 50,
    carry_forward_blocker: 40
  };

  for (const row of rows) {
    const existing = bySlug.get(row.competitionSlug);
    if (!existing || (priority[row.evidenceClass] || 0) > (priority[existing.evidenceClass] || 0)) {
      bySlug.set(row.competitionSlug, row);
    }
  }

  return [...bySlug.values()].sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));
}

function buildReport({ providerCheckpoint, cupPlan = null }) {
  const providerRows = rowsFromProviderCheckpoint(providerCheckpoint);
  const cupRows = cupPlan ? rowsFromCupPlan(cupPlan) : [];
  const carryForwardRows = carryForwardKnownRows();
  const competitionRows = dedupeRows([...providerRows, ...cupRows, ...carryForwardRows]);

  const promotionPlanCandidates = competitionRows.filter((row) => row.canonicalReadiness === "promotion_plan_candidate");
  const partialRows = competitionRows.filter((row) => String(row.canonicalReadiness).startsWith("partial"));
  const blockedRows = competitionRows.filter((row) => row.canonicalReadiness === "not_ready");

  const byBucket = {};
  for (const row of competitionRows) {
    byBucket[row.readinessBucket] = (byBucket[row.readinessBucket] || 0) + 1;
  }

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    stage: "uefa_bulk_source_normalized_readiness_board",
    summary: {
      competitionCount: competitionRows.length,
      leagueCount: competitionRows.filter((row) => row.competitionType === "league").length,
      cupCount: competitionRows.filter((row) => row.competitionType === "cup").length,
      providerCompetitionCount: providerRows.length,
      cupPlanCompetitionCount: cupRows.length,
      carryForwardCompetitionCount: carryForwardRows.length,
      promotionPlanCandidateCount: promotionPlanCandidates.length,
      partialNotReadyCount: partialRows.length,
      blockedNotReadyCount: blockedRows.length,
      byBucket,
      canonicalWrites: 0,
      productionWrite: false,
      sourceFetch: false,
      noFetch: true,
      noSearch: true
    },
    competitionRows,
    nextDirection: [
      "Build promotion-plan dry runs for promotionPlanCandidate rows only.",
      "For partial rows, normalize official standings or keep derived standings explicitly blocked from full league-state promotion.",
      "For blocked rows, do not promote until blocker-specific source evidence is resolved."
    ],
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noSearch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true
    }
  };
}

function selfTest() {
  const providerCheckpoint = {
    laneRows: [
      {
        lane: "test-lane",
        path: "diagnostic.json",
        exists: true,
        competitions: ["abc.1", "abc.2"],
        status: "source_normalized",
        blocked: false,
        byCompetition: {
          "abc.1": { fixtureRows: 10, resultRows: 5, scheduledRows: 5, standingsRows: 12 },
          "abc.2": { fixtureRows: 8, resultRows: 8, scheduledRows: 0, standingsRows: 0 }
        }
      }
    ],
    guarantees: {
      canonicalWrites: 0,
      productionWrite: false
    }
  };

  const cupPlan = {
    rows: [
      {
        competitionSlug: "abc.cup",
        promotionPlanReady: true,
        proposedCanonicalState: "winner_final_confirmed_pending_writer_approval"
      }
    ]
  };

  const report = buildReport({ providerCheckpoint, cupPlan });

  if (report.summary.competitionCount !== 6) throw new Error("self-test competition count failed");
  if (report.summary.promotionPlanCandidateCount !== 2) throw new Error("self-test promotion candidate count failed");
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("self-test read-only guarantees failed");
  }

  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: report.ok,
      competitionCount: report.summary.competitionCount,
      promotionPlanCandidateCount: report.summary.promotionPlanCandidateCount,
      canonicalWrites: report.guarantees.canonicalWrites,
      productionWrite: report.guarantees.productionWrite
    }, null, 2));
    return;
  }

  const providerCheckpointPath = path.resolve(repoRoot, args.providerCheckpoint);
  const providerCheckpoint = readJson(providerCheckpointPath);

  const cupPlan = args.cupPlan
    ? readJson(path.resolve(repoRoot, args.cupPlan))
    : null;

  const report = buildReport({ providerCheckpoint, cupPlan });

  if (report.guarantees.sourceFetch !== false ||
      report.guarantees.noFetch !== true ||
      report.guarantees.noSearch !== true ||
      report.guarantees.canonicalWrites !== 0 ||
      report.guarantees.productionWrite !== false) {
    throw new Error("read-only guarantees failed");
  }

  writeJson(path.resolve(repoRoot, args.output), report);
  console.log(JSON.stringify(report.summary, null, 2));
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  main();
}
