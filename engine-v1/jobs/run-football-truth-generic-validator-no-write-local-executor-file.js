#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";
const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/generic-validator-ready-controlled-local-proof-2026-06-14/generic-validator-ready-controlled-local-proof-2026-06-14.json";
const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/generic-validator-no-write-local-executor-2026-06-14/generic-validator-no-write-local-executor-2026-06-14.json";

const EXPECTED_SLUGS = ["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"];

const EXPECTED_FAMILIES = {
  "esp.1": "laliga",
  "esp.2": "laliga",
  "nor.1": "norway_ntf",
  "nor.2": "norway_ntf",
  "swe.1": "sportomedia",
  "swe.2": "sportomedia"
};

function parseArgs(argv) {
  const args = { date: DEFAULT_DATE, input: DEFAULT_INPUT, output: DEFAULT_OUTPUT };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--input") args.input = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error("Unknown argument: " + arg);
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

function validateProof(proof) {
  const summary = proof.summary || {};

  assertSummary(summary, "proofCompetitionCount", 6);
  assertSummary(summary, "proofReadyCompetitionCount", 6);
  assertSummary(summary, "proofBlockedCompetitionCount", 0);
  assertSummary(summary, "genericValidatorReadyCompetitionCount", 6);
  assertSummary(summary, "laligaProofCompetitionCount", 2);
  assertSummary(summary, "norwayNtfProofCompetitionCount", 2);
  assertSummary(summary, "sportomediaProofCompetitionCount", 2);
  assertSummary(summary, "controlledLocalProofRowsEmitted", 6);
  assertSummary(summary, "controlledLocalProofHasConcreteSlugs", true);
  assertSummary(summary, "controlledLocalProofHasReusableFamilies", true);
  assertSummary(summary, "controlledLocalProofHasLocalEvidenceFiles", true);
  assertSummary(summary, "fetchAllowedNowCount", 0);
  assertSummary(summary, "searchAllowedNowCount", 0);
  assertSummary(summary, "broadSearchAllowedNowCount", 0);
  assertSummary(summary, "controlledDiscoveryAllowedNowCount", 0);
  assertSummary(summary, "canonicalPromotionAllowedNowCount", 0);
  assertSummary(summary, "canonicalWriteEligibleNowCount", 0);
  assertSummary(summary, "truthAssertionsAllowedNowCount", 0);
  assertSummary(summary, "canonicalWrites", 0);
  assertSummary(summary, "productionWrite", false);

  const rows = Array.isArray(proof.proofRows) ? proof.proofRows : [];
  if (rows.length !== 6) throw new Error("Expected 6 proofRows, got " + rows.length);

  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Proof slugs mismatch. Got " + slugs.join(", "));
  }

  for (const row of rows) {
    if (row.controlledLocalProofStatus !== "controlled_local_proof_ready_from_existing_local_evidence") {
      throw new Error(row.competitionSlug + ": proof row is not ready");
    }
    if (row.reusableFamily !== EXPECTED_FAMILIES[row.competitionSlug]) {
      throw new Error(row.competitionSlug + ": family mismatch");
    }
    if (!Array.isArray(row.localEvidenceFiles) || row.localEvidenceFiles.length < 1) {
      throw new Error(row.competitionSlug + ": localEvidenceFiles must be non-empty");
    }
    if (row.fetchAllowedNow !== false || row.searchAllowedNow !== false || row.canonicalWriteEligibleNow !== false) {
      throw new Error(row.competitionSlug + ": unsafe proof flag");
    }
  }

  return rows;
}

function safeJsonRead(filePath) {
  try {
    return readJson(filePath);
  } catch (error) {
    return {
      __readError: String(error.message || error),
      __filePath: filePath
    };
  }
}

function textContainsSlug(value, slug) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value === slug || value.includes(slug);
  if (typeof value === "number" || typeof value === "boolean") return String(value) === slug;
  return false;
}

function objectReferencesSlug(obj, slug) {
  if (!obj || typeof obj !== "object") return false;

  const directKeys = [
    "slug",
    "competitionSlug",
    "competition",
    "competitionId",
    "id",
    "targetSlug",
    "leagueSlug",
    "sourceSlug"
  ];

  for (const key of directKeys) {
    if (textContainsSlug(obj[key], slug)) return true;
  }

  const arrayKeys = ["competitionSlugs", "slugs", "targetSlugs", "competitions"];
  for (const key of arrayKeys) {
    if (Array.isArray(obj[key])) {
      for (const item of obj[key]) {
        if (typeof item === "string" && textContainsSlug(item, slug)) return true;
        if (item && typeof item === "object" && objectReferencesSlug(item, slug)) return true;
      }
    }
  }

  return false;
}

function collectMatchingObjects(value, slug, filePath, matches = [], location = "$") {
  if (matches.length >= 250) return matches;

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectMatchingObjects(item, slug, filePath, matches, location + "[" + index + "]");
    });
    return matches;
  }

  if (value && typeof value === "object") {
    if (objectReferencesSlug(value, slug)) {
      matches.push({
        filePath,
        location,
        keys: Object.keys(value).slice(0, 40),
        sample: summarizeObject(value)
      });
    }

    for (const [key, child] of Object.entries(value)) {
      collectMatchingObjects(child, slug, filePath, matches, location + "." + key);
      if (matches.length >= 250) return matches;
    }
  }

  return matches;
}

function summarizeObject(obj) {
  const out = {};
  const preferred = [
    "slug",
    "competitionSlug",
    "competitionSlugs",
    "reusableFamily",
    "family",
    "provider",
    "source",
    "sourceUrl",
    "route",
    "routeUrl",
    "status",
    "engineStatus",
    "compilerStatus",
    "workstreamStatus",
    "fixtureContract",
    "standingsContract",
    "seasonStateContract",
    "fixtureReady",
    "standingsReady",
    "seasonStateReady",
    "canValidate",
    "validationStatus",
    "blockedReason"
  ];

  for (const key of preferred) {
    if (key in obj) out[key] = obj[key];
  }

  if (Object.keys(out).length === 0) {
    for (const key of Object.keys(obj).slice(0, 10)) {
      const value = obj[key];
      if (value === null || value === undefined) out[key] = value;
      else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") out[key] = value;
      else if (Array.isArray(value)) out[key] = "[array:" + value.length + "]";
      else if (typeof value === "object") out[key] = "[object]";
    }
  }

  return out;
}

function inferObservationSignals(matches, family) {
  const text = JSON.stringify(matches).toLowerCase();

  return {
    mentionsReusableFamily: text.includes(String(family).toLowerCase()),
    mentionsFixture: text.includes("fixture"),
    mentionsStanding: text.includes("standing"),
    mentionsSeasonState: text.includes("season") || text.includes("state"),
    mentionsValidator: text.includes("validator"),
    mentionsContract: text.includes("contract"),
    mentionsReady: text.includes("ready"),
    mentionsBlocked: text.includes("blocked"),
    mentionsFetch: text.includes("fetch"),
    mentionsSearch: text.includes("search"),
    mentionsCanonical: text.includes("canonical")
  };
}

function buildObservation(row) {
  const slug = row.competitionSlug;
  const family = row.reusableFamily;
  const existingEvidenceFiles = uniqueSorted((row.localEvidenceFiles || []).filter((file) => fs.existsSync(file)));

  const fileObservations = existingEvidenceFiles.map((filePath) => {
    const json = safeJsonRead(filePath);
    const matches = collectMatchingObjects(json, slug, filePath);
    return {
      filePath,
      jsonReadable: !json.__readError,
      readError: json.__readError || null,
      matchedObjectCount: matches.length,
      matchedObjects: matches.slice(0, 20)
    };
  });

  const totalMatchedObjectCount = fileObservations.reduce((sum, item) => sum + item.matchedObjectCount, 0);
  const filesWithMatches = fileObservations.filter((item) => item.matchedObjectCount > 0);
  const signals = inferObservationSignals(fileObservations, family);

  let observationStatus = "local_validation_observation_ready_no_write";
  if (filesWithMatches.length === 0) observationStatus = "blocked_no_slug_match_in_local_evidence";
  else if (!signals.mentionsValidator && !signals.mentionsContract && !signals.mentionsReady) {
    observationStatus = "local_evidence_seen_but_validator_contract_signal_weak";
  }

  return {
    competitionSlug: slug,
    reusableFamily: family,
    observationStatus,
    existingLocalEvidenceFileCount: existingEvidenceFiles.length,
    filesWithSlugMatchesCount: filesWithMatches.length,
    totalMatchedObjectCount,
    signals,
    fileObservations,
    noWriteExecutorResultType: "local_validation_observation",
    fetchAllowedNow: false,
    searchAllowedNow: false,
    broadSearchAllowedNow: false,
    controlledDiscoveryAllowedNow: false,
    canonicalPromotionAllowedNow: false,
    canonicalWriteEligibleNow: false,
    truthAssertionsAllowedNow: false,
    activeAssertedNow: false,
    inactiveAssertedNow: false,
    completedAssertedNow: false,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function main() {
  const args = parseArgs(process.argv);
  const proof = readJson(args.input);
  const proofRows = validateProof(proof);

  const observationRows = proofRows.map(buildObservation);

  const readyRows = observationRows.filter((row) =>
    row.observationStatus === "local_validation_observation_ready_no_write"
  );
  const weakRows = observationRows.filter((row) =>
    row.observationStatus === "local_evidence_seen_but_validator_contract_signal_weak"
  );
  const blockedRows = observationRows.filter((row) =>
    row.observationStatus === "blocked_no_slug_match_in_local_evidence"
  );

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-generic-validator-no-write-local-executor-file",
    mode: "no_write_local_executor_for_generic_validator_ready_lane_6_competitions_no_fetch_no_search_no_truth_assertions",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      controlledLocalProof: args.input
    },
    summary: {
      localExecutorCompetitionCount: observationRows.length,
      localExecutorReadyObservationCount: readyRows.length,
      localExecutorWeakObservationCount: weakRows.length,
      localExecutorBlockedObservationCount: blockedRows.length,

      laligaObservationCount: observationRows.filter((row) => row.reusableFamily === "laliga").length,
      norwayNtfObservationCount: observationRows.filter((row) => row.reusableFamily === "norway_ntf").length,
      sportomediaObservationCount: observationRows.filter((row) => row.reusableFamily === "sportomedia").length,

      localEvidenceFileReferenceCount: observationRows.reduce((sum, row) => sum + row.existingLocalEvidenceFileCount, 0),
      localEvidenceFilesWithMatchesCount: observationRows.reduce((sum, row) => sum + row.filesWithSlugMatchesCount, 0),
      localEvidenceMatchedObjectCount: observationRows.reduce((sum, row) => sum + row.totalMatchedObjectCount, 0),

      concreteObservationRowsEmitted: observationRows.length,
      fetchAllowedNowCount: 0,
      searchAllowedNowCount: 0,
      broadSearchAllowedNowCount: 0,
      controlledDiscoveryAllowedNowCount: 0,
      canonicalPromotionAllowedNowCount: 0,
      canonicalWriteEligibleNowCount: 0,
      truthAssertionsAllowedNowCount: 0,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      canonicalWrites: 0,
      productionWrite: false,

      recommendedNextLane:
        blockedRows.length === 0
          ? "run_no_write_generic_validator_local_executor_quality_gate_then_review_observation_strength"
          : "repair_generic_validator_local_evidence_matching_before_quality_gate"
    },
    counts: {
      byReusableFamily: countBy(observationRows, "reusableFamily"),
      byObservationStatus: countBy(observationRows, "observationStatus")
    },
    guardrails: [
      "This is a no-write local executor.",
      "It reads existing local diagnostics only.",
      "It does not fetch.",
      "It does not search.",
      "It does not write canonical data.",
      "It does not assert active/inactive/completed truth.",
      "It does not update production.",
      "It emits validation observations for review."
    ],
    observationRows,
    blockedRows,
    weakRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    localExecutorCompetitionCount: output.summary.localExecutorCompetitionCount,
    localExecutorReadyObservationCount: output.summary.localExecutorReadyObservationCount,
    localExecutorWeakObservationCount: output.summary.localExecutorWeakObservationCount,
    localExecutorBlockedObservationCount: output.summary.localExecutorBlockedObservationCount,
    laligaObservationCount: output.summary.laligaObservationCount,
    norwayNtfObservationCount: output.summary.norwayNtfObservationCount,
    sportomediaObservationCount: output.summary.sportomediaObservationCount,
    localEvidenceFileReferenceCount: output.summary.localEvidenceFileReferenceCount,
    localEvidenceFilesWithMatchesCount: output.summary.localEvidenceFilesWithMatchesCount,
    localEvidenceMatchedObjectCount: output.summary.localEvidenceMatchedObjectCount,
    concreteObservationRowsEmitted: output.summary.concreteObservationRowsEmitted,
    fetchAllowedNowCount: output.summary.fetchAllowedNowCount,
    searchAllowedNowCount: output.summary.searchAllowedNowCount,
    broadSearchAllowedNowCount: output.summary.broadSearchAllowedNowCount,
    controlledDiscoveryAllowedNowCount: output.summary.controlledDiscoveryAllowedNowCount,
    canonicalPromotionAllowedNowCount: output.summary.canonicalPromotionAllowedNowCount,
    canonicalWriteEligibleNowCount: output.summary.canonicalWriteEligibleNowCount,
    truthAssertionsAllowedNowCount: output.summary.truthAssertionsAllowedNowCount,
    activeAssertedCount: output.summary.activeAssertedCount,
    inactiveAssertedCount: output.summary.inactiveAssertedCount,
    completedAssertedCount: output.summary.completedAssertedCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
