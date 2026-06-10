#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    selfTest: false,
    output: "",
    providerRegistry: path.join(repoRoot, "docs/engineering/provider-contract-registry/football-truth-provider-contract-registry-seed-2026-06-10.json"),
    jobGovernance: path.join(repoRoot, "docs/engineering/job-governance/engine-v1-jobs-governance-board-2026-06-10.json"),
    intelligenceManifest: path.join(repoRoot, "docs/engineering/football-truth-intelligence-engine/football-truth-intelligence-engine-manifest-2026-06-10.json"),
    canonicalFixturesRoot: path.join(repoRoot, "data/canonical-fixtures"),
    standingsRoot: path.join(repoRoot, "data/standings"),
    winnerFinalState: path.join(repoRoot, "data/football-truth/_state/competition-state-winner-final/competition-state-winner-final.json"),
    norwayEvidence: path.join(repoRoot, "data/football-truth/_diagnostics/uefa-current-readiness-check-2026-06-09/uefa-tier1-season-status-fullbody-extraction-2026-06-09/official-route-norway-provider-fixture-result-evidence-rows-2026-06-10.json"),
    tableParserEvidence: path.join(repoRoot, "data/football-truth/_diagnostics/uefa-current-readiness-check-2026-06-09/uefa-tier1-season-status-fullbody-extraction-2026-06-09/official-route-table-parser-provider-batch-evidence-rows-2026-06-10.json")
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--output") args.output = argv[++i];
    else if (arg === "--provider-registry") args.providerRegistry = argv[++i];
    else if (arg === "--job-governance") args.jobGovernance = argv[++i];
    else if (arg === "--intelligence-manifest") args.intelligenceManifest = argv[++i];
    else if (arg === "--canonical-fixtures-root") args.canonicalFixturesRoot = argv[++i];
    else if (arg === "--standings-root") args.standingsRoot = argv[++i];
    else if (arg === "--winner-final-state") args.winnerFinalState = argv[++i];
    else if (arg === "--norway-evidence") args.norwayEvidence = argv[++i];
    else if (arg === "--table-parser-evidence") args.tableParserEvidence = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function exists(filePath) {
  return fs.existsSync(filePath);
}

function readJsonIfExists(filePath, fallback = null) {
  if (!exists(filePath)) return fallback;
  return readJson(filePath);
}

function rowsOf(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.rows)) return input.rows;
  if (Array.isArray(input?.table)) return input.table;
  if (Array.isArray(input?.fixtures)) return input.fixtures;
  if (Array.isArray(input?.matches)) return input.matches;
  if (Array.isArray(input?.standings)) return input.standings;
  if (Array.isArray(input?.data?.rows)) return input.data.rows;
  if (Array.isArray(input?.data?.standings)) return input.data.standings;
  return [];
}

function rowPathOf(input) {
  if (Array.isArray(input)) return "root";
  if (Array.isArray(input?.rows)) return "rows";
  if (Array.isArray(input?.table)) return "table";
  if (Array.isArray(input?.fixtures)) return "fixtures";
  if (Array.isArray(input?.matches)) return "matches";
  if (Array.isArray(input?.standings)) return "standings";
  if (Array.isArray(input?.data?.rows)) return "data.rows";
  if (Array.isArray(input?.data?.standings)) return "data.standings";
  return null;
}

function walkJsonFiles(dir) {
  const files = [];

  if (!exists(dir)) return files;

  function walk(current) {
    for (const name of fs.readdirSync(current)) {
      const full = path.join(current, name);
      const stat = fs.statSync(full);

      if (stat.isDirectory()) walk(full);
      else if (full.endsWith(".json")) files.push(full);
    }
  }

  walk(dir);
  return files.sort();
}

function statusBucket(row) {
  const value = asText(row.status || row.rawStatus || row.fixtureStatus).toUpperCase();

  if (["FT", "FINISHED", "AET", "PEN", "PLAYED"].includes(value)) return "finished";
  if (["PRE", "SCHEDULED", "STATUS_SCHEDULED", "UPCOMING", "FIXTURE", "PLANNED"].includes(value)) return "scheduled";
  if (value.includes("LIVE") || value.includes("IN_PROGRESS")) return "live";

  return "unknown";
}

function buildFixtureCoverage(canonicalFixturesRoot, registeredCompetitions) {
  const byCompetition = new Map();

  for (const file of walkJsonFiles(canonicalFixturesRoot)) {
    const competitionSlug = path.basename(file, ".json");
    if (!registeredCompetitions.has(competitionSlug)) continue;

    const dayKey = path.basename(path.dirname(file));
    const json = readJson(file);
    const rows = rowsOf(json);

    if (!byCompetition.has(competitionSlug)) {
      byCompetition.set(competitionSlug, {
        competitionSlug,
        fileCount: 0,
        rowCount: 0,
        firstDayKey: dayKey,
        lastDayKey: dayKey,
        finishedRows: 0,
        scheduledRows: 0,
        liveRows: 0,
        unknownStatusRows: 0
      });
    }

    const item = byCompetition.get(competitionSlug);
    item.fileCount += 1;
    item.rowCount += rows.length;

    if (dayKey < item.firstDayKey) item.firstDayKey = dayKey;
    if (dayKey > item.lastDayKey) item.lastDayKey = dayKey;

    for (const row of rows) {
      const bucket = statusBucket(row);

      if (bucket === "finished") item.finishedRows += 1;
      else if (bucket === "scheduled") item.scheduledRows += 1;
      else if (bucket === "live") item.liveRows += 1;
      else item.unknownStatusRows += 1;
    }
  }

  return [...byCompetition.values()].sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));
}

function buildStandingsCoverage(standingsRoot, registeredCompetitions) {
  const rows = [];

  for (const slug of [...registeredCompetitions].sort()) {
    const file = path.join(standingsRoot, `${slug}.json`);
    if (!exists(file)) continue;

    const json = readJson(file);
    const tableRows = rowsOf(json);

    rows.push({
      competitionSlug: slug,
      file,
      rowPath: rowPathOf(json),
      rowCount: tableRows.length,
      sampleKeys: tableRows[0] && typeof tableRows[0] === "object" ? Object.keys(tableRows[0]) : []
    });
  }

  return rows;
}

function buildWinnerFinalCoverage(winnerFinalStatePath, registeredCompetitions) {
  const json = readJsonIfExists(winnerFinalStatePath, { rows: [] });
  const rows = rowsOf(json);

  return rows
    .map((row) => ({
      competitionSlug: asText(row.competitionSlug || row.leagueSlug || row.slug || row.competition),
      winnerTeam: asText(row.winnerTeam || row.winner || row.winnerName),
      runnerUpTeam: asText(row.runnerUpTeam || row.runnerUp || row.runnerUpName),
      score: asText(row.score || row.finalScore),
      sourceRow: row
    }))
    .filter((row) => row.competitionSlug && registeredCompetitions.has(row.competitionSlug))
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));
}

function evidenceSummary(filePath, sourceKind) {
  const json = readJsonIfExists(filePath, { rows: [] });
  const rows = rowsOf(json);
  const byCompetition = {};

  for (const row of rows) {
    const slug = asText(row.competitionSlug || row.leagueSlug || row.slug || row.competition) || "unknown";
    byCompetition[slug] ||= {
      competitionSlug: slug,
      rowCount: 0,
      finishedRows: 0,
      scheduledRows: 0,
      unknownStatusRows: 0
    };

    const item = byCompetition[slug];
    item.rowCount += 1;

    const bucket = statusBucket(row);
    if (bucket === "finished") item.finishedRows += 1;
    else if (bucket === "scheduled") item.scheduledRows += 1;
    else item.unknownStatusRows += 1;
  }

  return {
    sourceKind,
    file: filePath,
    exists: exists(filePath),
    rowPath: rowPathOf(json),
    rowCount: rows.length,
    byCompetition: Object.values(byCompetition).sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug))
  };
}

function inferSeasonState({ fixtureCoverage, provider, hasWinnerFinal }) {
  const status = `${provider.capabilityStatus || ""} ${provider.promotionStatus || ""}`.toLowerCase();

  if (status.includes("blocked")) return "blocked";
  if (hasWinnerFinal) return "completed_cup";

  if (!fixtureCoverage || fixtureCoverage.rowCount === 0) {
    if (status.includes("not_promoted") || status.includes("partial")) return "unknown_or_partial";
    return "unknown";
  }

  if (fixtureCoverage.scheduledRows > 0 && fixtureCoverage.finishedRows > 0) return "active";
  if (fixtureCoverage.scheduledRows > 0 && fixtureCoverage.finishedRows === 0) return "upcoming";
  if (fixtureCoverage.finishedRows > 0 && fixtureCoverage.scheduledRows === 0) return "completed_or_results_only";

  return "unknown";
}

function missingDataFor({ competitionSlug, provider, fixtureCoverage, standingsCoverage, winnerFinalCoverage }) {
  const missing = [];

  const caps = provider.capabilities || {};
  const typeHint = competitionSlug.includes(".cup") || competitionSlug.includes("taca") || competitionSlug.includes("challenge")
    ? "cup"
    : "league";

  if (typeHint === "league") {
    if (!fixtureCoverage) missing.push("canonicalFixtures");
    if (!standingsCoverage) missing.push("canonicalStandings");
  } else {
    if (!winnerFinalCoverage && caps.cupWinner !== "not_applicable") missing.push("cupWinnerFinalState");
  }

  if (/promotion_contract_missing/.test(`${provider.capabilityStatus} ${provider.promotionStatus}`)) {
    missing.push("genericPromotionContract");
  }

  if (/blocked/.test(`${provider.capabilityStatus} ${provider.promotionStatus}`)) {
    missing.push("contractRepairOrUnblock");
  }

  return missing;
}

function nextAllowedActionFor({ provider, missingData }) {
  const status = `${provider.capabilityStatus || ""} ${provider.promotionStatus || ""}`.toLowerCase();

  if (status.includes("blocked")) return "blocked_no_action";
  if (missingData.includes("genericPromotionContract")) return "provider_contract_repair";
  if (status.includes("not_promoted") || status.includes("partial")) return "registry_only_review";
  if (missingData.length === 0) return "no_action_covered";

  return "registry_only_review";
}

function buildReport(options) {
  const providerRegistry = readJson(options.providerRegistry);
  const jobGovernance = readJson(options.jobGovernance);
  const intelligenceManifest = readJson(options.intelligenceManifest);

  const providers = Array.isArray(providerRegistry.providerContracts) ? providerRegistry.providerContracts : [];
  const registeredCompetitions = new Set();

  for (const provider of providers) {
    for (const slug of provider.competitions || []) registeredCompetitions.add(slug);
  }

  const fixtureCoverage = buildFixtureCoverage(options.canonicalFixturesRoot, registeredCompetitions);
  const standingsCoverage = buildStandingsCoverage(options.standingsRoot, registeredCompetitions);
  const winnerFinalCoverage = buildWinnerFinalCoverage(options.winnerFinalState, registeredCompetitions);

  const fixtureBySlug = new Map(fixtureCoverage.map((row) => [row.competitionSlug, row]));
  const standingsBySlug = new Map(standingsCoverage.map((row) => [row.competitionSlug, row]));
  const winnerBySlug = new Map(winnerFinalCoverage.map((row) => [row.competitionSlug, row]));

  const evidenceReports = [
    evidenceSummary(options.norwayEvidence, "official_route_norway_normalized_evidence"),
    evidenceSummary(options.tableParserEvidence, "official_route_table_parser_provider_evidence")
  ];

  const providerContractBoard = providers.map((provider) => ({
    providerId: provider.providerId,
    competitions: provider.competitions || [],
    capabilityStatus: provider.capabilityStatus,
    promotionStatus: provider.promotionStatus,
    allowedRunnerPolicy: provider.allowedRunnerPolicy,
    sourceJobs: provider.sourceJobs || [],
    capabilities: provider.capabilities || {}
  }));

  const competitionStateBoard = [];
  const missingDataBoard = [];
  const promotionReadinessBoard = [];

  for (const provider of providers) {
    for (const competitionSlug of provider.competitions || []) {
      const fixture = fixtureBySlug.get(competitionSlug) || null;
      const standings = standingsBySlug.get(competitionSlug) || null;
      const winner = winnerBySlug.get(competitionSlug) || null;
      const missingData = missingDataFor({
        competitionSlug,
        provider,
        fixtureCoverage: fixture,
        standingsCoverage: standings,
        winnerFinalCoverage: winner
      });
      const nextAllowedAction = nextAllowedActionFor({ provider, missingData });
      const seasonState = inferSeasonState({
        fixtureCoverage: fixture,
        provider,
        hasWinnerFinal: Boolean(winner)
      });

      competitionStateBoard.push({
        competitionSlug,
        providerId: provider.providerId,
        seasonState,
        hasCanonicalFixtures: Boolean(fixture),
        canonicalFixtureRows: fixture?.rowCount || 0,
        canonicalFixtureFinishedRows: fixture?.finishedRows || 0,
        canonicalFixtureScheduledRows: fixture?.scheduledRows || 0,
        hasCanonicalStandings: Boolean(standings),
        canonicalStandingsRows: standings?.rowCount || 0,
        hasCupWinnerFinalState: Boolean(winner),
        providerCapabilityStatus: provider.capabilityStatus,
        providerPromotionStatus: provider.promotionStatus,
        nextAllowedAction
      });

      missingDataBoard.push({
        competitionSlug,
        providerId: provider.providerId,
        missingData,
        nextAllowedAction,
        reason: missingData.length
          ? "missing_or_blocked_items_detected_from_registry_and_local_coverage"
          : "covered_by_current_registry_and_local_canonical_state"
      });

      promotionReadinessBoard.push({
        competitionSlug,
        providerId: provider.providerId,
        readiness: nextAllowedAction === "no_action_covered"
          ? "already_covered"
          : nextAllowedAction === "provider_contract_repair"
            ? "blocked_until_contract_repair"
            : nextAllowedAction === "blocked_no_action"
              ? "blocked"
              : "not_promotion_ready",
        allowedPromotionNow: false,
        reason: "This board is read-only and does not authorize promotion; promotion requires dedicated dry-run gate."
      });
    }
  }

  const blockedProviderBoard = providerContractBoard
    .filter((provider) => /blocked|missing/.test(`${provider.capabilityStatus} ${provider.promotionStatus}`.toLowerCase()))
    .map((provider) => ({
      providerId: provider.providerId,
      competitions: provider.competitions,
      capabilityStatus: provider.capabilityStatus,
      promotionStatus: provider.promotionStatus,
      allowedRunnerPolicy: provider.allowedRunnerPolicy
    }));

  const actionGroups = {};
  for (const row of missingDataBoard) {
    actionGroups[row.nextAllowedAction] ||= [];
    actionGroups[row.nextAllowedAction].push(row.competitionSlug);
  }

  const nextBatchActionPlan = Object.entries(actionGroups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([actionType, competitions]) => ({
      actionType,
      competitions: [...new Set(competitions)].sort(),
      providerIds: [...new Set(missingDataBoard
        .filter((row) => row.nextAllowedAction === actionType)
        .map((row) => row.providerId))].sort(),
      allowedNow: ["no_action_covered", "registry_only_review", "provider_contract_repair", "blocked_no_action"].includes(actionType),
      productionWritesAllowed: false
    }));

  return {
    ok: true,
    job: "build-football-truth-intelligence-board-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_football_truth_intelligence_board",
    inputs: {
      providerRegistry: options.providerRegistry,
      jobGovernance: options.jobGovernance,
      intelligenceManifest: options.intelligenceManifest,
      canonicalFixturesRoot: options.canonicalFixturesRoot,
      standingsRoot: options.standingsRoot,
      winnerFinalState: options.winnerFinalState,
      evidenceReports: [
        options.norwayEvidence,
        options.tableParserEvidence
      ]
    },
    summary: {
      providerCount: providers.length,
      registeredCompetitionCount: registeredCompetitions.size,
      providerContractBoardRows: providerContractBoard.length,
      competitionStateBoardRows: competitionStateBoard.length,
      missingDataBoardRows: missingDataBoard.length,
      blockedProviderBoardRows: blockedProviderBoard.length,
      nextBatchActionPlanRows: nextBatchActionPlan.length,
      promotionReadinessBoardRows: promotionReadinessBoard.length,
      canonicalFixtureCoveredCompetitionCount: fixtureCoverage.length,
      standingsCoveredCompetitionCount: standingsCoverage.length,
      cupWinnerFinalCoveredCompetitionCount: winnerFinalCoverage.length,
      evidenceReportCount: evidenceReports.length,
      governedJobCount: jobGovernance.summary?.jobCount || jobGovernance.rows?.length || 0,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    providerContractBoard,
    competitionStateBoard: competitionStateBoard.sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug)),
    missingDataBoard: missingDataBoard.sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug)),
    blockedProviderBoard,
    nextBatchActionPlan,
    promotionReadinessBoard: promotionReadinessBoard.sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug)),
    localCoverageEvidence: {
      fixtureCoverage,
      standingsCoverage,
      winnerFinalCoverage,
      evidenceReports
    },
    guardrails: {
      noProviderFetchAllowed: true,
      noSearchAllowed: true,
      noPromotionPlanningBeyondReadinessClassification: true,
      noCanonicalWritesAllowed: true,
      noActualWriteAllowed: true
    },
    guarantees: {
      noFetch: true,
      noSearch: true,
      noCanonicalWrites: true,
      canonicalWrites: 0,
      productionWrite: false,
      sourceFetch: false
    },
    notes: [
      "This job reads local registry/governance/canonical/evidence files only.",
      "This job does not run acquisition, search, fetch, promotion planning, or canonical writes.",
      "The board is an intelligence decision layer; provider repair/promotion jobs must be separate and gated."
    ]
  };
}

function selfTest() {
  const tmp = fs.mkdtempSync(path.join(process.cwd(), ".tmp-football-truth-intelligence-"));
  const providerRegistry = path.join(tmp, "provider.json");
  const jobGovernance = path.join(tmp, "jobs.json");
  const manifest = path.join(tmp, "manifest.json");
  const fixtureRoot = path.join(tmp, "fixtures");
  const standingsRoot = path.join(tmp, "standings");
  const winner = path.join(tmp, "winner.json");
  const norway = path.join(tmp, "norway.json");
  const table = path.join(tmp, "table.json");

  writeJson(providerRegistry, {
    providerContracts: [
      {
        providerId: "test_provider",
        competitions: ["test.1", "test.cup"],
        capabilityStatus: "proven_promoted",
        promotionStatus: "canonical_written",
        capabilities: {
          fixtures: "proven_promoted",
          standings: "proven_promoted",
          cupWinner: "proven_promoted"
        },
        sourceJobs: [],
        allowedRunnerPolicy: "normalizer_and_guarded_writer_only"
      }
    ]
  });

  writeJson(jobGovernance, { summary: { jobCount: 1 }, rows: [] });
  writeJson(manifest, { ok: true });

  writeJson(path.join(fixtureRoot, "2026-01-01", "test.1.json"), [
    { status: "FT", homeTeam: "A", awayTeam: "B" },
    { status: "PRE", homeTeam: "C", awayTeam: "D" }
  ]);

  writeJson(path.join(standingsRoot, "test.1.json"), {
    table: [{ team: "A", points: 3 }]
  });

  writeJson(winner, {
    rows: [{ competitionSlug: "test.cup", winnerTeam: "A", runnerUpTeam: "B", score: "1-0" }]
  });

  writeJson(norway, { rows: [] });
  writeJson(table, { rows: [] });

  const report = buildReport({
    providerRegistry,
    jobGovernance,
    intelligenceManifest: manifest,
    canonicalFixturesRoot: fixtureRoot,
    standingsRoot,
    winnerFinalState: winner,
    norwayEvidence: norway,
    tableParserEvidence: table
  });

  fs.rmSync(tmp, { recursive: true, force: true });

  if (report.summary.providerCount !== 1) throw new Error("expected one provider");
  if (report.summary.competitionStateBoardRows !== 2) throw new Error("expected two competition rows");
  if (report.summary.canonicalFixtureCoveredCompetitionCount !== 1) throw new Error("expected fixture coverage");
  if (report.summary.standingsCoveredCompetitionCount !== 1) throw new Error("expected standings coverage");
  if (report.summary.cupWinnerFinalCoveredCompetitionCount !== 1) throw new Error("expected winner coverage");
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("read-only guarantees failed");
  }

  return {
    ok: true,
    selfTest: "build-football-truth-intelligence-board-file",
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

  if (!args.output) throw new Error("Missing required --output");

  const report = buildReport(args);
  writeJson(args.output, report);

  console.log(JSON.stringify({
    output: args.output,
    summary: report.summary,
    nextBatchActionPlan: report.nextBatchActionPlan,
    blockedProviderBoard: report.blockedProviderBoard,
    guarantees: report.guarantees
  }, null, 2));
}

main();
