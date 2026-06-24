#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULT_DATE = "2026-06-14";
const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/final-explicit-scoped-controlled-route-acquisition-run-approval-2026-06-14/final-explicit-scoped-controlled-route-acquisition-run-approval-2026-06-14.json";
const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/final-explicit-scoped-controlled-route-acquisition-run-2026-06-14/final-explicit-scoped-controlled-route-acquisition-run-2026-06-14.json";

const EXPECTED_SLUGS = ["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"];

const ROUTE_TARGETS = {
  "esp.1": [
    { routeKind: "official_results", url: "https://www.laliga.com/en-GB/laliga-easports/results" },
    { routeKind: "official_calendar", url: "https://www.laliga.com/en-GB/laliga-easports/calendar" },
    { routeKind: "official_standings", url: "https://www.laliga.com/en-GB/laliga-easports/standing" }
  ],
  "esp.2": [
    { routeKind: "official_results", url: "https://www.laliga.com/en-GB/laliga-hypermotion/results" },
    { routeKind: "official_calendar", url: "https://www.laliga.com/en-GB/laliga-hypermotion/calendar" },
    { routeKind: "official_standings", url: "https://www.laliga.com/en-GB/laliga-hypermotion/standing" }
  ],
  "nor.1": [
    { routeKind: "official_schedule", url: "https://www.eliteserien.no/terminliste" },
    { routeKind: "official_results", url: "https://www.eliteserien.no/resultater" },
    { routeKind: "official_standings", url: "https://www.eliteserien.no/tabell" }
  ],
  "nor.2": [
    { routeKind: "official_schedule", url: "https://www.obos-ligaen.no/terminliste" },
    { routeKind: "official_results", url: "https://www.obos-ligaen.no/resultater" },
    { routeKind: "official_standings", url: "https://www.obos-ligaen.no/tabell" }
  ],
  "swe.1": [
    { routeKind: "official_source_page", url: "https://www.allsvenskan.se/" },
    { routeKind: "official_matches", url: "https://www.allsvenskan.se/matcher" },
    { routeKind: "official_standings", url: "https://www.allsvenskan.se/tabell" }
  ],
  "swe.2": [
    { routeKind: "official_source_page", url: "https://www.superettan.se/" },
    { routeKind: "official_matches", url: "https://www.superettan.se/matcher" },
    { routeKind: "official_standings", url: "https://www.superettan.se/tabell" }
  ]
};

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    allowControlledFetch: false,
    timeoutMs: 20000
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--input") args.input = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else if (arg === "--allow-controlled-fetch") args.allowControlledFetch = true;
    else if (arg === "--timeout-ms") args.timeoutMs = Number(argv[++i]);
    else throw new Error("Unknown argument: " + arg);
  }

  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 5000 || args.timeoutMs > 60000) {
    throw new Error("Invalid --timeout-ms. Expected 5000..60000");
  }

  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error("Missing JSON input: " + filePath);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function stableJson(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

function uniqueSorted(values) {
  return [...new Set(
    values
      .filter((value) => value !== null && value !== undefined)
      .map((value) => String(value).trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value =
      row[key] === null || row[key] === undefined || String(row[key]).trim() === ""
        ? "__missing__"
        : String(row[key]).trim();

    counts[value] = (counts[value] || 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
  );
}

function assertSummary(summary, key, expected) {
  if (!(key in summary)) throw new Error("Missing summary key: " + key);
  if (summary[key] !== expected) {
    throw new Error("Guardrail failed for " + key + ": expected " + expected + ", got " + summary[key]);
  }
}

function validateFinalApproval(input) {
  const summary = input.summary || {};

  assertSummary(summary, "finalScopedControlledRouteAcquisitionRunApprovalCompetitionCount", 6);
  assertSummary(summary, "finalScopedControlledRouteAcquisitionRunApprovalApprovedCount", 6);
  assertSummary(summary, "finalScopedControlledRouteAcquisitionRunApprovalBlockedCount", 0);
  assertSummary(summary, "mayRunFinalScopedControlledAcquisitionNextCount", 6);
  assertSummary(summary, "finalRunWouldAllowControlledRouteAcquisitionCount", 6);
  assertSummary(summary, "finalRunWouldAllowConfiguredRouteFetchCount", 6);
  assertSummary(summary, "finalRunWouldAllowSearchCount", 0);
  assertSummary(summary, "finalRunWouldAllowBroadSearchCount", 0);
  assertSummary(summary, "finalRunWouldAllowClassifierCount", 0);
  assertSummary(summary, "finalRunWouldAllowCanonicalWriteCount", 0);
  assertSummary(summary, "finalRunWouldAllowProductionWriteCount", 0);
  assertSummary(summary, "approvalPreparedNowCount", 6);
  assertSummary(summary, "runnerExecutedNowCount", 0);
  assertSummary(summary, "evidenceAcquisitionExecutedNowCount", 0);
  assertSummary(summary, "fetchExecutedNowCount", 0);
  assertSummary(summary, "searchExecutedNowCount", 0);
  assertSummary(summary, "broadSearchExecutedNowCount", 0);
  assertSummary(summary, "classifierExecutedNowCount", 0);
  assertSummary(summary, "canonicalWriteExecutedNowCount", 0);
  assertSummary(summary, "productionWriteExecutedNowCount", 0);
  assertSummary(summary, "laligaFinalRunApprovalCompetitionCount", 2);
  assertSummary(summary, "norwayNtfFinalRunApprovalCompetitionCount", 2);
  assertSummary(summary, "sportomediaFinalRunApprovalCompetitionCount", 2);
  assertSummary(summary, "userHintUsedCount", 0);
  assertSummary(summary, "hardcodedSeasonStateOverrideUsedCount", 0);
  assertSummary(summary, "validatorReadinessDoesNotImplyActiveCount", 6);
  assertSummary(summary, "executionAllowedNowCount", 0);
  assertSummary(summary, "fetchAllowedNowCount", 0);
  assertSummary(summary, "searchAllowedNowCount", 0);
  assertSummary(summary, "broadSearchAllowedNowCount", 0);
  assertSummary(summary, "controlledDiscoveryAllowedNowCount", 0);
  assertSummary(summary, "controlledRouteAcquisitionAllowedNowCount", 0);
  assertSummary(summary, "classifierAllowedNowCount", 0);
  assertSummary(summary, "canonicalPromotionAllowedNowCount", 0);
  assertSummary(summary, "canonicalWriteEligibleNowCount", 0);
  assertSummary(summary, "truthAssertionsAllowedNowCount", 0);
  assertSummary(summary, "activeAssertedCount", 0);
  assertSummary(summary, "inactiveAssertedCount", 0);
  assertSummary(summary, "completedAssertedCount", 0);
  assertSummary(summary, "canonicalWrites", 0);
  assertSummary(summary, "productionWrite", false);

  const rows = Array.isArray(input.finalApprovalRows) ? input.finalApprovalRows : [];
  if (rows.length !== 6) throw new Error("Expected 6 finalApprovalRows, got " + rows.length);

  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected final approval slugs: " + slugs.join(", "));
  }

  for (const row of rows) {
    if (row.finalRunApprovalStatus !== "approved_for_next_explicit_scoped_controlled_route_acquisition_run_not_executed_now") {
      throw new Error(row.competitionSlug + ": final run approval did not pass");
    }
    if (row.mayRunFinalScopedControlledAcquisitionNext !== true) {
      throw new Error(row.competitionSlug + ": mayRunFinalScopedControlledAcquisitionNext must be true");
    }
    if (row.finalRunWouldAllowControlledRouteAcquisition !== true) {
      throw new Error(row.competitionSlug + ": final controlled acquisition must be true");
    }
    if (row.finalRunWouldAllowConfiguredRouteFetch !== true) {
      throw new Error(row.competitionSlug + ": final configured route fetch must be true");
    }
    if (
      row.finalRunWouldAllowSearch !== false ||
      row.finalRunWouldAllowBroadSearch !== false ||
      row.finalRunWouldAllowClassifier !== false ||
      row.finalRunWouldAllowCanonicalWrite !== false ||
      row.finalRunWouldAllowProductionWrite !== false
    ) {
      throw new Error(row.competitionSlug + ": forbidden future operation flag not false");
    }
    if (row.userHintUsed !== false || row.hardcodedSeasonStateOverrideUsed !== false) {
      throw new Error(row.competitionSlug + ": hints/overrides must remain false");
    }
  }

  return rows;
}

function textHash(text) {
  return crypto.createHash("sha256").update(text || "").digest("hex");
}

function trimSnapshotText(text) {
  const value = String(text || "");
  if (value.length <= 250000) return value;
  return value.slice(0, 250000);
}

function cleanPreview(text) {
  return String(text || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);
}

async function fetchOne({ row, target, timeoutMs }) {
  const startedAt = new Date().toISOString();

  const base = {
    competitionSlug: row.competitionSlug,
    reusableFamily: row.reusableFamily,
    routeAcquisitionType: row.routeAcquisitionType,
    routeScope: row.routeScope,
    routeKind: target.routeKind,
    sourceUrl: target.url,
    method: "GET",
    controlledRouteAcquisitionExecuted: true,
    fetchExecuted: true,
    searchExecuted: false,
    broadSearchExecuted: false,
    classifierExecuted: false,
    canonicalWriteExecuted: false,
    productionWriteExecuted: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,
    zeroResultDoesNotImplyAbsence: true,
    startedAt
  };

  try {
    const response = await fetch(target.url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "user-agent": "Ai-MatchLab-FootballTruth-ControlledRouteAcquisition/1.0",
        "accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8"
      }
    });

    const contentType = response.headers.get("content-type") || "";
    const finalUrl = response.url || target.url;
    const rawText = await response.text();
    const storedText = trimSnapshotText(rawText);

    return {
      ...base,
      completedAt: new Date().toISOString(),
      fetchStatus: response.ok ? "fetched_ok" : "fetched_http_not_ok",
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      finalUrl,
      contentType,
      rawTextLength: rawText.length,
      storedTextLength: storedText.length,
      rawTextSha256: textHash(rawText),
      storedTextSha256: textHash(storedText),
      textPreview: cleanPreview(storedText),
      rawText: storedText,
      canonicalWrites: 0,
      productionWrite: false
    };
  } catch (error) {
    return {
      ...base,
      completedAt: new Date().toISOString(),
      fetchStatus: "fetch_error",
      ok: false,
      status: 0,
      statusText: "",
      finalUrl: target.url,
      contentType: "",
      rawTextLength: 0,
      storedTextLength: 0,
      rawTextSha256: "",
      storedTextSha256: "",
      textPreview: "",
      rawText: "",
      errorName: error?.name || "Error",
      errorMessage: error?.message || String(error),
      canonicalWrites: 0,
      productionWrite: false
    };
  }
}

function buildRunRows(approvalRows) {
  const rows = [];

  for (const row of approvalRows) {
    const targets = ROUTE_TARGETS[row.competitionSlug] || [];
    if (!targets.length) throw new Error(row.competitionSlug + ": no controlled route targets defined");

    for (const target of targets) {
      rows.push({ row, target });
    }
  }

  return rows;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.allowControlledFetch) {
    throw new Error("Refusing to run controlled acquisition without --allow-controlled-fetch");
  }

  const input = readJson(args.input);
  const approvalRows = validateFinalApproval(input);
  const runTargets = buildRunRows(approvalRows);

  const fetchedSourceSnapshots = [];
  for (const runTarget of runTargets) {
    const result = await fetchOne({ ...runTarget, timeoutMs: args.timeoutMs });
    fetchedSourceSnapshots.push(result);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-final-explicit-scoped-controlled-route-acquisition-file",
    mode: "final_explicit_scoped_controlled_route_acquisition_executed_no_search_no_broad_search_no_classifier_no_write",
    sourceFetch: true,
    controlledRouteAcquisitionExecuted: true,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: false,
    inputs: {
      finalExplicitScopedControlledRouteAcquisitionRunApproval: args.input
    },
    summary: {
      finalScopedControlledRouteAcquisitionRunCompetitionCount: approvalRows.length,
      finalScopedControlledRouteAcquisitionRunTargetCount: runTargets.length,
      fetchedSourceSnapshotCount: fetchedSourceSnapshots.length,
      fetchedOkSnapshotCount: fetchedSourceSnapshots.filter((row) => row.fetchStatus === "fetched_ok").length,
      fetchedHttpNotOkSnapshotCount: fetchedSourceSnapshots.filter((row) => row.fetchStatus === "fetched_http_not_ok").length,
      fetchErrorSnapshotCount: fetchedSourceSnapshots.filter((row) => row.fetchStatus === "fetch_error").length,

      controlledRouteAcquisitionExecutedCount: fetchedSourceSnapshots.filter((row) => row.controlledRouteAcquisitionExecuted).length,
      fetchExecutedCount: fetchedSourceSnapshots.filter((row) => row.fetchExecuted).length,
      searchExecutedCount: fetchedSourceSnapshots.filter((row) => row.searchExecuted).length,
      broadSearchExecutedCount: fetchedSourceSnapshots.filter((row) => row.broadSearchExecuted).length,
      classifierExecutedCount: fetchedSourceSnapshots.filter((row) => row.classifierExecuted).length,
      canonicalWriteExecutedCount: fetchedSourceSnapshots.filter((row) => row.canonicalWriteExecuted).length,
      productionWriteExecutedCount: fetchedSourceSnapshots.filter((row) => row.productionWriteExecuted).length,

      laligaAcquisitionRunCompetitionCount: approvalRows.filter((row) => row.reusableFamily === "laliga").length,
      norwayNtfAcquisitionRunCompetitionCount: approvalRows.filter((row) => row.reusableFamily === "norway_ntf").length,
      sportomediaAcquisitionRunCompetitionCount: approvalRows.filter((row) => row.reusableFamily === "sportomedia").length,

      userHintUsedCount: fetchedSourceSnapshots.filter((row) => row.userHintUsed).length,
      hardcodedSeasonStateOverrideUsedCount: fetchedSourceSnapshots.filter((row) => row.hardcodedSeasonStateOverrideUsed).length,

      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      seasonStateTruthAssertedCount: 0,
      canonicalWrites: 0,
      productionWrite: false,

      recommendedNextLane: "review_scoped_controlled_route_acquisition_snapshots_no_classifier_no_write"
    },
    counts: {
      byReusableFamily: countBy(fetchedSourceSnapshots, "reusableFamily"),
      byCompetitionSlug: countBy(fetchedSourceSnapshots, "competitionSlug"),
      byRouteKind: countBy(fetchedSourceSnapshots, "routeKind"),
      byFetchStatus: countBy(fetchedSourceSnapshots, "fetchStatus"),
      byHttpStatus: countBy(fetchedSourceSnapshots, "status")
    },
    guardrails: [
      "This run executed only scoped controlled route acquisition targets.",
      "It did not use search.",
      "It did not use broad search.",
      "It did not run a season-state classifier.",
      "It did not assert active/inactive/completed truth.",
      "It did not write canonical data.",
      "It did not write production data.",
      "No user-provided season-state hints were used.",
      "No hardcoded season-state overrides were used.",
      "Fetch errors or zero results do not imply source absence.",
      "Match status alone must not be used as season-state truth."
    ],
    fetchedSourceSnapshots
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    finalScopedControlledRouteAcquisitionRunCompetitionCount: output.summary.finalScopedControlledRouteAcquisitionRunCompetitionCount,
    finalScopedControlledRouteAcquisitionRunTargetCount: output.summary.finalScopedControlledRouteAcquisitionRunTargetCount,
    fetchedSourceSnapshotCount: output.summary.fetchedSourceSnapshotCount,
    fetchedOkSnapshotCount: output.summary.fetchedOkSnapshotCount,
    fetchedHttpNotOkSnapshotCount: output.summary.fetchedHttpNotOkSnapshotCount,
    fetchErrorSnapshotCount: output.summary.fetchErrorSnapshotCount,
    controlledRouteAcquisitionExecutedCount: output.summary.controlledRouteAcquisitionExecutedCount,
    fetchExecutedCount: output.summary.fetchExecutedCount,
    searchExecutedCount: output.summary.searchExecutedCount,
    broadSearchExecutedCount: output.summary.broadSearchExecutedCount,
    classifierExecutedCount: output.summary.classifierExecutedCount,
    canonicalWriteExecutedCount: output.summary.canonicalWriteExecutedCount,
    productionWriteExecutedCount: output.summary.productionWriteExecutedCount,
    laligaAcquisitionRunCompetitionCount: output.summary.laligaAcquisitionRunCompetitionCount,
    norwayNtfAcquisitionRunCompetitionCount: output.summary.norwayNtfAcquisitionRunCompetitionCount,
    sportomediaAcquisitionRunCompetitionCount: output.summary.sportomediaAcquisitionRunCompetitionCount,
    userHintUsedCount: output.summary.userHintUsedCount,
    hardcodedSeasonStateOverrideUsedCount: output.summary.hardcodedSeasonStateOverrideUsedCount,
    activeAssertedCount: output.summary.activeAssertedCount,
    inactiveAssertedCount: output.summary.inactiveAssertedCount,
    completedAssertedCount: output.summary.completedAssertedCount,
    seasonStateTruthAssertedCount: output.summary.seasonStateTruthAssertedCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
