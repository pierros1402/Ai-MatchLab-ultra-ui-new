import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const memoryPath = path.join("data", "football-truth", "source-authority-memory.json");

const writeDiagnosticPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-controlled-write-runner-2026-06-15",
  "six-league-controlled-write-runner-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-controlled-write-verification-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "six-league-controlled-write-verification-2026-06-15.json"
);

const expected = {
  "esp.1": ["nextActiveRestartDate"],
  "esp.2": ["nextActiveRestartDate"],
  "nor.1": ["standingsStats", "fixturesResults", "seasonState", "nextActiveRestartDate"],
  "nor.2": ["standingsStats", "fixturesResults", "seasonState", "nextActiveRestartDate"],
  "swe.1": ["standingsStats", "fixturesResults", "seasonState", "nextActiveRestartDate"],
  "swe.2": ["standingsStats", "fixturesResults", "seasonState", "nextActiveRestartDate"]
};

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required input file: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertZero(value, name) {
  if (value !== undefined && value !== null && value !== 0) {
    throw new Error(`Expected ${name}=0, got ${value}`);
  }
}

function recordSlug(record) {
  for (const key of ["competitionSlug", "slug", "competitionId", "competition"]) {
    if (typeof record?.[key] === "string") return record[key];
  }
  return null;
}

function countWhere(rows, predicate) {
  return rows.filter(predicate).length;
}

function validateWriteDiagnostic(diagnostic) {
  const s = diagnostic.summary || {};

  if (s.allowWriteFlagPresent !== true) throw new Error("Expected allowWriteFlagPresent=true");
  if (s.controlledWriteRowCount !== 18) throw new Error(`Expected controlledWriteRowCount=18, got ${s.controlledWriteRowCount}`);
  if (s.canonicalWriteExecutedNowCount !== 18) throw new Error(`Expected canonicalWriteExecutedNowCount=18, got ${s.canonicalWriteExecutedNowCount}`);
  if (s.truthAssertionExecutedNowCount !== 18) throw new Error(`Expected truthAssertionExecutedNowCount=18, got ${s.truthAssertionExecutedNowCount}`);
  if (s.targetCompetitionRecordCountAfter !== 6) throw new Error(`Expected targetCompetitionRecordCountAfter=6, got ${s.targetCompetitionRecordCountAfter}`);
  if (s.productionWriteExecutedNowCount !== 0) throw new Error(`Expected productionWriteExecutedNowCount=0, got ${s.productionWriteExecutedNowCount}`);
  if (s.productionWrite !== false) throw new Error("Expected productionWrite=false");

  [
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount"
  ].forEach((key) => assertZero(s[key], `writeDiagnostic.summary.${key}`));
}

const memory = readJson(memoryPath);
const writeDiagnostic = readJson(writeDiagnosticPath);

validateWriteDiagnostic(writeDiagnostic);

if (!Array.isArray(memory.records)) {
  throw new Error("source-authority-memory.json must contain records array");
}

const verificationRows = Object.entries(expected).map(([competitionSlug, requiredAreas]) => {
  const matchingRecords = memory.records.filter((record) => recordSlug(record) === competitionSlug);
  const record = matchingRecords[0] || null;

  const missingAreas = [];
  const invalidAreas = [];

  for (const area of requiredAreas) {
    if (!record?.[area]) {
      missingAreas.push(area);
      continue;
    }

    const areaObject = record[area];

    if (areaObject.status !== "trusted_source_authority_evidence_promoted") {
      invalidAreas.push({ area, reason: `unexpected_status:${areaObject.status}` });
    }

    if (areaObject.competitionSlug !== competitionSlug) {
      invalidAreas.push({ area, reason: "competition_slug_mismatch" });
    }

    if (areaObject.productionWrite !== false) {
      invalidAreas.push({ area, reason: "production_write_not_false" });
    }

    if (!areaObject.sourceRawPayloadFile || !fs.existsSync(areaObject.sourceRawPayloadFile)) {
      invalidAreas.push({ area, reason: "missing_source_raw_payload_file" });
    }

    if (!areaObject.writeApprovalRowId) {
      invalidAreas.push({ area, reason: "missing_write_approval_row_id" });
    }

    if (!areaObject.promotionCandidateRowId) {
      invalidAreas.push({ area, reason: "missing_promotion_candidate_row_id" });
    }
  }

  const hasControlledPromotionMarker =
    record?.controlledSixLeagueEvidencePromotion?.status === "six_league_controlled_evidence_promoted";

  const hasLastControlledWriteMarker =
    memory.lastControlledWrite?.status === "six_league_controlled_write_completed";

  const failures = [
    ...(matchingRecords.length !== 1 ? [`expected_exactly_one_record_found_${matchingRecords.length}`] : []),
    ...(!hasControlledPromotionMarker ? ["missing_controlled_promotion_marker"] : []),
    ...(!hasLastControlledWriteMarker ? ["missing_last_controlled_write_marker"] : []),
    ...missingAreas.map((area) => `missing_area:${area}`),
    ...invalidAreas.map((item) => `invalid_area:${item.area}:${item.reason}`)
  ];

  return {
    competitionSlug,
    requiredAreas,
    recordFoundCount: matchingRecords.length,
    promotedAreaCount: requiredAreas.length - missingAreas.length,
    missingAreas,
    invalidAreas,
    verificationStatus:
      failures.length === 0
        ? "verified_controlled_source_authority_memory_write"
        : "blocked_controlled_source_authority_memory_write_verification",
    failures,
    noWriteVerificationOnly: true
  };
});

const blockedRows = verificationRows.filter((row) => row.failures.length > 0);

const summary = {
  sixLeagueControlledWriteVerificationReadCount: 1,
  targetCompetitionCount: Object.keys(expected).length,
  verificationRowCount: verificationRows.length,
  verifiedCompetitionCount: countWhere(
    verificationRows,
    (row) => row.verificationStatus === "verified_controlled_source_authority_memory_write"
  ),
  blockedCompetitionVerificationCount: blockedRows.length,

  verifiedLaligaCompetitionCount: countWhere(
    verificationRows,
    (row) => row.verificationStatus === "verified_controlled_source_authority_memory_write" && row.competitionSlug.startsWith("esp.")
  ),
  verifiedNorwayNtfCompetitionCount: countWhere(
    verificationRows,
    (row) => row.verificationStatus === "verified_controlled_source_authority_memory_write" && row.competitionSlug.startsWith("nor.")
  ),
  verifiedSportomediaCompetitionCount: countWhere(
    verificationRows,
    (row) => row.verificationStatus === "verified_controlled_source_authority_memory_write" && row.competitionSlug.startsWith("swe.")
  ),

  verifiedPromotedAreaCount: verificationRows.reduce((sum, row) => sum + row.promotedAreaCount, 0),
  expectedPromotedAreaCount: Object.values(expected).reduce((sum, areas) => sum + areas.length, 0),

  mayResumePostSixLeagueFullMapMaterializationCount: blockedRows.length === 0 ? 1 : 0,

  verificationIsExecutionPermissionNowCount: 0,
  verificationIsFetchPermissionNowCount: 0,
  verificationIsSearchPermissionNowCount: 0,
  verificationIsBroadSearchPermissionNowCount: 0,
  verificationIsClassifierPermissionNowCount: 0,
  verificationIsCanonicalWritePermissionNowCount: 0,
  verificationIsProductionWritePermissionNowCount: 0,
  verificationIsTruthAssertionPermissionNowCount: 0,

  fetchExecutedNowCount: 0,
  searchExecutedNowCount: 0,
  broadSearchExecutedNowCount: 0,
  classifierExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  canonicalWrites: 0,
  productionWrite: false
};

const artifact = {
  job: "verify-football-truth-six-league-controlled-write-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_write_verification_gate",
  dryRun: true,
  inputs: {
    sourceAuthorityMemory: memoryPath,
    controlledWriteDiagnostic: writeDiagnosticPath
  },
  policy: {
    verificationOnly: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  verificationRows,
  blockedRows,
  sourceFetch: { allowed: false, executed: false },
  searchProviderUsed: false,
  broadSearchUsed: false,
  classifierExecuted: false,
  canonicalWrites: 0,
  productionWrite: false
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

console.log(JSON.stringify({ output: outputPath, ...summary }, null, 2));

if (blockedRows.length > 0) {
  throw new Error(`Controlled write verification blocked ${blockedRows.length} competitions`);
}
