import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  mergeSameDayAdmissionSupplemental
} from "../jobs/run-fixture-acquisition-chunk.js";


const workflow =
  fs.readFileSync(
    new URL(
      "../../.github/workflows/daily-deploy-snapshot.yml",
      import.meta.url
    ),
    "utf8"
  )
    .replace(/\\r\\n/gu, "\\n");

test(
  "daily acquisition commit persists competition admission artifacts",
  () => {
    assert.match(
      workflow,
      /git add data\/competition-admission/u
    );

    assert.match(
      workflow,
      /git add data\/identity-recovery/u
    );

    assert.match(
      workflow,
      /promote-identity-recovery-window\.js/u
    );

    const buildRecovery = workflow.indexOf("build-identity-recovery-window.js");
    const confirmRecovery = workflow.indexOf("confirm-identity-recovery-window.js");
    const promoteRecovery = workflow.indexOf("promote-identity-recovery-window.js");
    assert.ok(buildRecovery >= 0);
    assert.ok(confirmRecovery > buildRecovery);
    assert.ok(promoteRecovery > confirmRecovery);
    assert.match(workflow, /API_FOOTBALL_KEY: \$\{\{ secrets\.API_FOOTBALL_KEY \}\}/u);

    assert.match(
      workflow,
      /git add data\/identity-decisions\/production-identity-extension-ledger\.v1\.json/u
    );

    assert.match(
      workflow,
      /--allow='\^\(data\/canonical-fixtures\/\|data\/coverage-reports\/\|data\/ingest-state\/\|data\/competition-admission\/\|data\/identity-recovery\/\|data\/identity-decisions\/production-identity-extension-ledger\\\.v1\\\.json\$\)'/u
    );

    assert.match(
      workflow,
      /grep -Ev '\^\(data\/canonical-fixtures\/\|data\/coverage-reports\/\|data\/ingest-state\/\|data\/competition-admission\/\|data\/identity-recovery\/\|data\/identity-decisions\/production-identity-extension-ledger\\\.v1\\\.json\$\)'/u
    );
  }
);

test(
  "same-day retry removes newly admitted slugs from skipped diagnostics",
  () => {
    const merged =
      mergeSameDayAdmissionSupplemental(
        {
          accepted: 4,
          normalized: 4,
          skippedOutOfTargetSeeds: 5,
          skippedSlugSample: {
            "par.1": 2,
            "hon.1": 3
          },
          byLeague: {
            "eng.1": 4
          }
        },
        {
          ok: true,
          accepted: 2,
          normalized: 2,
          existingCanonicalUpdates: 0,
          byLeague: {
            "par.1": 2
          },
          writtenByDay: {
            "2026-07-31": 2
          }
        },
        [
          "par.1"
        ]
      );

    assert.equal(merged.accepted, 6);
    assert.equal(
      merged.skippedOutOfTargetSeeds,
      3
    );

    assert.deepEqual(
      merged.skippedSlugSample,
      {
        "hon.1": 3
      }
    );

    assert.deepEqual(
      merged.byLeague,
      {
        "eng.1": 4,
        "par.1": 2
      }
    );

    assert.deepEqual(
      merged.sameDayAdmissionRetry.newlyAdmittedSlugs,
      [
        "par.1"
      ]
    );
  }
);

test(
  "same-day retry is ordered after provisional coverage persistence",
  () => {
    const acquisitionSource =
      fs.readFileSync(
        new URL(
          "../jobs/run-fixture-acquisition-chunk.js",
          import.meta.url
        ),
        "utf8"
      )
        .replace(/\\r\\n/gu, "\\n");

    const provisional =
      acquisitionSource.indexOf(
        "Persist first-pass evidence"
      );

    const rebuild =
      acquisitionSource.indexOf(
        "const refreshedArtifact"
      );

    const retry =
      acquisitionSource.indexOf(
        "recordSkippedSlugs:"
      );

    const finalCoverageWrite =
      acquisitionSource.indexOf(
        "Keep refreshedArtifact as the authoritative admission decision"
      );

    assert.ok(provisional >= 0);
    assert.ok(rebuild > provisional);
    assert.ok(retry > rebuild);
    assert.ok(finalCoverageWrite > retry);
  }
);

test(
  "final coverage write does not rebuild admission from cleared skipped evidence",
  () => {
    const acquisitionSource =
      fs.readFileSync(
        new URL(
          "../jobs/run-fixture-acquisition-chunk.js",
          import.meta.url
        ),
        "utf8"
      )
        .replace(/\r\n/gu, "\n");

    const marker =
      acquisitionSource.indexOf(
        "Keep refreshedArtifact as the authoritative admission decision"
      );

    assert.ok(marker >= 0);

    assert.doesNotMatch(
      acquisitionSource.slice(marker),
      /buildAndWriteDailyLeagueAdmission\(/u
    );
  }
);

test(
  "build report and System Health expose admission classifications",
  () => {
    const buildReportSource =
      fs.readFileSync(
        new URL(
          "../jobs/build-day-report.js",
          import.meta.url
        ),
        "utf8"
      );

    const systemHealthSource =
      fs.readFileSync(
        new URL(
          "../jobs/build-system-health-alerts-day.js",
          import.meta.url
        ),
        "utf8"
      );

    assert.match(buildReportSource, /competition-admission/u);
    assert.match(buildReportSource, /pendingSlugs/u);
    assert.match(buildReportSource, /rejectedSlugs/u);
    assert.match(systemHealthSource, /competition_admission_active/u);
    assert.match(systemHealthSource, /competition_admission_pending/u);
    assert.match(systemHealthSource, /competition_admission_rejected/u);
  }
);
