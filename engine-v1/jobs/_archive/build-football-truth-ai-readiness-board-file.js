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
    inventory: "",
    registryAudit: "",
    calendarValidation: "",
    calendarProbeSummary: "",
    output: ""
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") {
      out.selfTest = true;
      continue;
    }

    if (arg === "--inventory") {
      out.inventory = argv[i + 1] || "";
      i += 1;
      continue;
    }

    if (arg === "--registry-audit") {
      out.registryAudit = argv[i + 1] || "";
      i += 1;
      continue;
    }

    if (arg === "--calendar-validation") {
      out.calendarValidation = argv[i + 1] || "";
      i += 1;
      continue;
    }

    if (arg === "--calendar-probe-summary") {
      out.calendarProbeSummary = argv[i + 1] || "";
      i += 1;
      continue;
    }

    if (arg === "--output") {
      out.output = argv[i + 1] || "";
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return out;
}

function inventoryRowsFrom(input) {
  if (Array.isArray(input.inventoryRows)) return input.inventoryRows;
  if (Array.isArray(input.rows)) return input.rows;
  if (Array.isArray(input.leagueRows)) return input.leagueRows;
  return [];
}

function validationRowsFrom(input) {
  if (Array.isArray(input.validatedSeasonStatusEvidenceRows)) return input.validatedSeasonStatusEvidenceRows;
  if (Array.isArray(input.seasonStatusValidationRows)) return input.seasonStatusValidationRows;
  if (Array.isArray(input.rows)) return input.rows;
  return [];
}

function groupCounts(rows, key) {
  const counts = new Map();

  for (const row of rows) {
    const value = asText(row[key]) || "unknown";
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([name, count]) => ({ [key]: name, count }))
    .sort((a, b) => b.count - a.count || String(a[key]).localeCompare(String(b[key])));
}

function buildBoard({ inventory, registryAudit, calendarValidation, calendarProbeSummary }, options = {}) {
  const inventoryRows = inventoryRowsFrom(inventory);
  const registrySlugs = Array.isArray(registryAudit.registrySlugs) ? registryAudit.registrySlugs : [];
  const registrySet = new Set(registrySlugs.map(asText).filter(Boolean));

  const validationRows = validationRowsFrom(calendarValidation);

  const acceptedSet = new Set(
    validationRows
      .filter((row) => (
        row.validationState === "season_calendar_validated_from_official_source" &&
        row.validationConfidence === "high" &&
        row.requiresSecondSource === false
      ))
      .map((row) => asText(row.leagueSlug))
      .filter(Boolean)
  );

  const needsMoreSet = new Set(
    validationRows
      .filter((row) => (
        row.validationState !== "season_calendar_validated_from_official_source" ||
        row.validationConfidence !== "high" ||
        row.requiresSecondSource === true
      ))
      .map((row) => asText(row.leagueSlug))
      .filter(Boolean)
  );

  const rows = inventoryRows
    .map((row) => {
      const leagueSlug = asText(row.leagueSlug || row.competitionSlug || row.slug);
      if (!leagueSlug) return null;

      const hasOfficialRouteRegistry = registrySet.has(leagueSlug);
      const calendarAccepted = acceptedSet.has(leagueSlug);
      const calendarNeedsMore = needsMoreSet.has(leagueSlug);

      const standingsState = asText(row.standingsState)
        || (row.hasStandings === true ? "usable_or_present" : "")
        || (row.needsStandingsRefresh === true ? "needs_refresh" : "")
        || "unknown_or_missing";

      const historyCompletenessState = asText(row.historyCompletenessState)
        || (row.hasHistory === true ? "present_unverified" : "")
        || (row.needsFTRepair === true ? "needs_ft_repair" : "")
        || "unknown_or_missing";

      const seasonState = asText(row.seasonState)
        || asText(row.competitionSeasonState)
        || (row.needsSeasonStatus === true ? "unknown_needs_calendar_evidence" : "")
        || "unknown";

      const calendarState = calendarAccepted
        ? "accepted_official_calendar"
        : calendarNeedsMore
          ? "calendar_candidate_needs_more_or_second_source"
          : hasOfficialRouteRegistry
            ? "registry_known_not_validated"
            : "registry_missing";

      const aiGate = (
        calendarAccepted &&
        !/missing|unknown/i.test(standingsState) &&
        !/missing|unknown|needs/i.test(historyCompletenessState)
      )
        ? "candidate_ready_for_ai_value_review"
        : "blocked";

      const nextAction = !hasOfficialRouteRegistry
        ? "expand_official_route_registry"
        : !calendarAccepted && calendarNeedsMore
          ? "improve_route_or_validation_for_existing_candidate"
          : !calendarAccepted
            ? "run_registry_first_calendar_probe"
            : /unknown/i.test(seasonState)
              ? "classify_season_state"
              : /missing|unknown|refresh/i.test(standingsState)
                ? "refresh_or_materialize_standings"
                : /missing|unknown|needs/i.test(historyCompletenessState)
                  ? "estimate_or_repair_fixture_history_completeness"
                  : "ai_value_gate_review";

      return {
        leagueSlug,
        competitionName: asText(row.competitionName || row.name),
        coverageType: asText(row.coverageType || row.competitionFamily || row.competitionType),
        coverageRegion: asText(row.coverageRegion || row.region),
        coverageCountry: asText(row.coverageCountry || row.country),
        hasOfficialRouteRegistry,
        calendarState,
        seasonState,
        standingsState,
        historyCompletenessState,
        aiGate,
        nextAction
      };
    })
    .filter(Boolean)
    .sort((a, b) => (
      a.nextAction.localeCompare(b.nextAction) ||
      a.coverageRegion.localeCompare(b.coverageRegion) ||
      a.coverageCountry.localeCompare(b.coverageCountry) ||
      a.leagueSlug.localeCompare(b.leagueSlug)
    ));

  const summary = {
    ok: true,
    date: options.date || "",
    head: options.head || "",
    totalLeagueCount: rows.length,
    officialRouteRegistryCount: rows.filter((row) => row.hasOfficialRouteRegistry).length,
    acceptedOfficialCalendarCount: rows.filter((row) => row.calendarState === "accepted_official_calendar").length,
    calendarNeedsMoreOrSecondSourceCount: rows.filter((row) => row.calendarState === "calendar_candidate_needs_more_or_second_source").length,
    registryKnownNotValidatedCount: rows.filter((row) => row.calendarState === "registry_known_not_validated").length,
    registryMissingCount: rows.filter((row) => row.calendarState === "registry_missing").length,
    aiValueReadyCandidateCount: rows.filter((row) => row.aiGate === "candidate_ready_for_ai_value_review").length,
    byCalendarState: groupCounts(rows, "calendarState"),
    byNextAction: groupCounts(rows, "nextAction"),
    patchedCalendarProbe: {
      acceptedLeagueCount: calendarProbeSummary.acceptedLeagueCount ?? 0,
      fetchedSnapshotCount: calendarProbeSummary.fetchedSnapshotCount ?? 0,
      http200Count: calendarProbeSummary.http200Count ?? 0,
      http404Count: calendarProbeSummary.http404Count ?? 0,
      acceptedRateVsProbeLeagues: calendarProbeSummary.acceptedRateVsProbeLeagues ?? 0,
      acceptedRateVsFetchedSnapshots: calendarProbeSummary.acceptedRateVsFetchedSnapshots ?? 0
    },
    guarantees: {
      noSearch: true,
      noFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      diagnosticOnly: true
    }
  };

  return {
    ok: true,
    summary,
    rows
  };
}

function selfTest() {
  const board = buildBoard({
    inventory: {
      inventoryRows: [
        { leagueSlug: "eng.1", needsSeasonStatus: true, hasStandings: true, hasHistory: true },
        { leagueSlug: "bel.1", needsSeasonStatus: true, needsStandingsRefresh: true, needsFTRepair: true },
        { leagueSlug: "missing.1", needsSeasonStatus: true }
      ]
    },
    registryAudit: {
      registrySlugs: ["eng.1", "bel.1"]
    },
    calendarValidation: {
      validatedSeasonStatusEvidenceRows: [
        {
          leagueSlug: "eng.1",
          validationState: "season_calendar_validated_from_official_source",
          validationConfidence: "high",
          requiresSecondSource: false
        },
        {
          leagueSlug: "bel.1",
          validationState: "season_calendar_candidate_needs_official_confirmation",
          validationConfidence: "medium",
          requiresSecondSource: true
        }
      ]
    },
    calendarProbeSummary: {
      acceptedLeagueCount: 1,
      fetchedSnapshotCount: 2,
      http200Count: 1,
      http404Count: 1
    }
  });

  if (board.summary.totalLeagueCount !== 3) throw new Error("expected 3 board rows");
  if (board.summary.officialRouteRegistryCount !== 2) throw new Error("expected 2 registry rows");
  if (board.summary.acceptedOfficialCalendarCount !== 1) throw new Error("expected 1 accepted calendar row");
  if (board.summary.registryMissingCount !== 1) throw new Error("expected 1 registry missing row");
  if (board.summary.aiValueReadyCandidateCount !== 1) throw new Error("expected 1 ai value candidate");

  return {
    ok: true,
    selfTest: true,
    summary: board.summary,
    guarantees: board.summary.guarantees
  };
}

function main() {
  const args = parseArgs(process.argv);

  if (args.selfTest) {
    console.log(JSON.stringify(selfTest(), null, 2));
    return;
  }

  if (!args.inventory) throw new Error("Missing required --inventory <path>");
  if (!args.registryAudit) throw new Error("Missing required --registry-audit <path>");
  if (!args.calendarValidation) throw new Error("Missing required --calendar-validation <path>");
  if (!args.calendarProbeSummary) throw new Error("Missing required --calendar-probe-summary <path>");
  if (!args.output) throw new Error("Missing required --output <path>");

  const board = buildBoard(
    {
      inventory: readJson(args.inventory),
      registryAudit: readJson(args.registryAudit),
      calendarValidation: readJson(args.calendarValidation),
      calendarProbeSummary: readJson(args.calendarProbeSummary)
    },
    {
      date: "",
      head: ""
    }
  );

  writeJson(args.output, board);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: board.summary,
    guarantees: board.summary.guarantees
  }, null, 2));
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main();
}

export {
  buildBoard,
  selfTest
};