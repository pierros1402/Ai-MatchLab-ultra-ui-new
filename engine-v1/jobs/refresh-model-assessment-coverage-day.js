import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { athensDayKey } from "../core/daykey.js";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { supplementCanonicalAssessments } from "./canonical-assessment-supplement.js";
import {
  assessmentRowCount,
  exportOddsSnapshotDay
} from "./export-odds-snapshot-day.js";

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

export function modelAssessmentCoverageVerdict(
  supplement = {},
  exportResult = {},
  persistedMatches = []
) {
  const eligibleUpcomingFixtures = Number(
    supplement?.eligibleUpcomingFixtures || 0
  );
  const assessmentRowsWritten = Number(
    supplement?.assessmentRowsWritten || 0
  );
  const insufficientTeamEvidence = Number(
    supplement?.skippedInsufficientTeamEvidence || 0
  );
  const emptyAssessment = Number(
    supplement?.skippedEmptyAssessment || 0
  );

  const accountedUpcomingFixtures =
    assessmentRowsWritten +
    insufficientTeamEvidence +
    emptyAssessment;

  const unexplainedUpcomingFixtures = Math.max(
    0,
    eligibleUpcomingFixtures - accountedUpcomingFixtures
  );

  const persistedAssessmentRows = assessmentRowCount(persistedMatches);
  const persistenceGap = Math.max(
    0,
    assessmentRowsWritten - persistedAssessmentRows
  );

  const ok = Boolean(
    exportResult?.ok === true &&
    unexplainedUpcomingFixtures === 0 &&
    emptyAssessment === 0 &&
    persistenceGap === 0
  );

  return {
    ok,
    eligibleUpcomingFixtures,
    assessmentRowsWritten,
    insufficientTeamEvidence,
    emptyAssessment,
    accountedUpcomingFixtures,
    unexplainedUpcomingFixtures,
    persistedAssessmentRows,
    persistenceGap,
    assessableCoverageRatio:
      eligibleUpcomingFixtures > 0
        ? Number((assessmentRowsWritten / eligibleUpcomingFixtures).toFixed(6))
        : 1,
    explicitUnassessableRatio:
      eligibleUpcomingFixtures > 0
        ? Number((insufficientTeamEvidence / eligibleUpcomingFixtures).toFixed(6))
        : 0
  };
}

export async function refreshModelAssessmentCoverageDay(dayKey = athensDayKey()) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(dayKey || ""))) {
    return {
      ok: false,
      date: dayKey,
      reason: "invalid_day_key"
    };
  }

  const supplement = await supplementCanonicalAssessments(dayKey);
  const exportResult = exportOddsSnapshotDay(dayKey);
  const oddsFile = resolveDataPath("deploy-snapshots", dayKey, "odds.json");
  const oddsPayload = readJsonSafe(oddsFile, null);
  const persistedMatches = Array.isArray(oddsPayload?.matches)
    ? oddsPayload.matches
    : [];

  const coverage = modelAssessmentCoverageVerdict(
    supplement,
    exportResult,
    persistedMatches
  );

  const report = {
    ok: coverage.ok,
    schema: "ai-matchlab.value-assessment-coverage.v1",
    date: dayKey,
    generatedAt: new Date().toISOString(),
    source: "canonical_assessment_supplement",
    supplement,
    exportResult,
    coverage,
    contract: {
      fixtureMembershipSource: "canonical_fixtures",
      assessedOrExplicitlyUnassessableRequired: true,
      unexplainedUpcomingFixturesMustBeZero: true,
      emptyAssessmentMustBeZero: true,
      assessedRowsMustPersist: true,
      bookmakerOddsRequired: false
    }
  };

  const outFile = resolveDataPath(
    "value-plans",
    dayKey,
    "assessment-coverage.json"
  );
  ensureDir(path.dirname(outFile));
  fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  return {
    ...report,
    file: outFile
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const dayKey = process.argv.slice(2).find(value => /^\d{4}-\d{2}-\d{2}$/u.test(value)) || athensDayKey();
  const gate = process.argv.includes("--gate");

  refreshModelAssessmentCoverageDay(dayKey)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      if (gate && result.ok !== true) process.exitCode = 1;
    })
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
}
