import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const CHECKPOINT_AWARE_TARGETED_DETAILS_ORPHAN_PLAN_SCHEMA =
  "ai-matchlab.checkpoint-aware-targeted-details-orphan-plan.v1";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const SAFE_DETAIL_FILE_RE =
  /^[A-Za-z0-9._~-]+\.json$/u;

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function expectedDetailFileName(
  fixture
) {
  const id =
    clean(
      fixture?.canonicalId
    ) ||
    clean(
      fixture?.matchId
    );

  return id
    ? `${id}.json`
    : "";
}

function sha256Buffer(
  buffer
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      buffer
    )
    .digest(
      "hex"
    );
}

function sortedUnique(
  values
) {
  return [
    ...new Set(
      values
    )
  ]
    .sort();
}

function sameStrings(
  left,
  right
) {
  return (
    JSON.stringify(
      sortedUnique(left)
    ) ===
    JSON.stringify(
      sortedUnique(right)
    )
  );
}

function baseArtifact({
  dayKey,
  planState,
  reason
}) {
  return {
    schema:
      CHECKPOINT_AWARE_TARGETED_DETAILS_ORPHAN_PLAN_SCHEMA,

    dayKey,

    planState,

    reason:
      reason || null,

    candidateCount:
      0,

    candidates:
      [],

    allowedRepositoryDeletionsAfterFutureAuthorization:
      [],

    safety: {
      readOnly:
        true,

      repositoryWritePerformed:
        false,

      fileDeletionPerformed:
        false,

      snapshotDetailDeletionAuthorized:
        false,

      fullDetailsRebuildAuthorized:
        false,

      valueRebuildAuthorized:
        false,

      fullDailyCycleAuthorized:
        false
    }
  };
}

export function buildCheckpointAwareTargetedDetailsOrphanCleanupPlan({
  dayKey,
  sourceDir,
  fixtures,
  mirrorReport
} = {}) {
  const day =
    clean(
      dayKey
    );

  if (
    !DAY_RE.test(
      day
    )
  ) {
    throw new Error(
      "details_orphan_plan_day_invalid"
    );
  }

  const dir =
    clean(
      sourceDir
    );

  if (
    !dir ||
    !fs.existsSync(
      dir
    )
  ) {
    return baseArtifact({
      dayKey:
        day,

      planState:
        "SOURCE_TREE_UNAVAILABLE_NO_ACTION",

      reason:
        "source_details_tree_unavailable"
    });
  }

  const stat =
    fs.statSync(
      dir
    );

  if (
    !stat.isDirectory()
  ) {
    return baseArtifact({
      dayKey:
        day,

      planState:
        "FAIL_CLOSED_MIRROR_STATE",

      reason:
        "source_details_path_not_directory"
    });
  }

  if (
    !mirrorReport ||
    typeof mirrorReport !==
      "object" ||
    Array.isArray(
      mirrorReport
    )
  ) {
    throw new Error(
      "details_orphan_plan_mirror_report_required"
    );
  }

  if (
    mirrorReport.ok ===
      true
  ) {
    return baseArtifact({
      dayKey:
        day,

      planState:
        "NO_REPAIR_REQUIRED",

      reason:
        "details_mirror_already_clean"
    });
  }

  const violations =
    Array.isArray(
      mirrorReport
        ?.violations
    )
      ? mirrorReport.violations
      : [];

  const extras =
    violations.filter(
      row =>
        clean(
          row?.code
        ) ===
          "source_detail_extra_file"
    );

  const otherViolations =
    violations.filter(
      row =>
        clean(
          row?.code
        ) !==
          "source_detail_extra_file"
    );

  if (
    extras.length ===
      0
  ) {
    return {
      ...baseArtifact({
        dayKey:
          day,

        planState:
          "FAIL_CLOSED_MIRROR_STATE",

        reason:
          "no_exact_source_extra_violation"
      }),

      observedViolationCodes:
        sortedUnique(
          violations.map(
            row =>
              clean(
                row?.code
              )
          )
            .filter(
              Boolean
            )
        )
    };
  }

  if (
    otherViolations.length >
      0
  ) {
    return {
      ...baseArtifact({
        dayKey:
          day,

        planState:
          "FAIL_CLOSED_MIRROR_STATE",

        reason:
          "mixed_details_mirror_violations"
      }),

      observedViolationCodes:
        sortedUnique(
          violations.map(
            row =>
              clean(
                row?.code
              )
          )
            .filter(
              Boolean
            )
        )
    };
  }

  const fixtureRows =
    Array.isArray(
      fixtures
    )
      ? fixtures
      : [];

  const expectedFiles =
    fixtureRows
      .map(
        expectedDetailFileName
      )
      .filter(
        Boolean
      );

  const expectedSet =
    new Set(
      expectedFiles
    );

  const actualFiles =
    fs.readdirSync(
      dir
    )
      .filter(
        name =>
          name.endsWith(
            ".json"
          )
      )
      .sort();

  const actualExtras =
    actualFiles.filter(
      file =>
        !expectedSet.has(
          file
        )
    );

  const violationFiles =
    extras.map(
      row =>
        clean(
          row?.file
        )
    );

  if (
    !sameStrings(
      actualExtras,
      violationFiles
    )
  ) {
    return {
      ...baseArtifact({
        dayKey:
          day,

        planState:
          "FAIL_CLOSED_MIRROR_STATE",

        reason:
          "verifier_extra_set_does_not_match_filesystem"
      }),

      verifierExtraFiles:
        sortedUnique(
          violationFiles
        ),

      filesystemExtraFiles:
        sortedUnique(
          actualExtras
        )
    };
  }

  if (
    Number.isFinite(
      Number(
        mirrorReport
          ?.counts
          ?.fixtures
      )
    ) &&
    Number(
      mirrorReport
        .counts
        .fixtures
    ) !==
      fixtureRows.length
  ) {
    return {
      ...baseArtifact({
        dayKey:
          day,

        planState:
          "FAIL_CLOSED_MIRROR_STATE",

        reason:
          "mirror_fixture_count_mismatch"
      }),

      mirrorFixtureCount:
        Number(
          mirrorReport
            .counts
            .fixtures
        ),

      suppliedFixtureCount:
        fixtureRows.length
    };
  }

  const candidates = [];

  for (
    const file of
      sortedUnique(
        actualExtras
      )
  ) {
    if (
      !SAFE_DETAIL_FILE_RE.test(
        file
      ) ||
      file.includes(
        ".."
      ) ||
      path.basename(
        file
      ) !==
        file
    ) {
      return {
        ...baseArtifact({
          dayKey:
            day,

          planState:
            "FAIL_CLOSED_MIRROR_STATE",

          reason:
            "unsafe_orphan_detail_filename"
        }),

        unsafeFile:
          file
      };
    }

    if (
      expectedSet.has(
        file
      )
    ) {
      return {
        ...baseArtifact({
          dayKey:
            day,

          planState:
            "FAIL_CLOSED_MIRROR_STATE",

          reason:
            "candidate_is_expected_fixture_detail"
        }),

        conflictingFile:
          file
      };
    }

    const absolutePath =
      path.join(
        dir,
        file
      );

    const candidateStat =
      fs.statSync(
        absolutePath
      );

    if (
      !candidateStat.isFile()
    ) {
      return {
        ...baseArtifact({
          dayKey:
            day,

          planState:
            "FAIL_CLOSED_MIRROR_STATE",

          reason:
            "candidate_not_regular_file"
        }),

        candidate:
          file
      };
    }

    const buffer =
      fs.readFileSync(
        absolutePath
      );

    candidates.push({
      file,

      relativePath:
        `data/details/${day}/${file}`,

      bytes:
        buffer.length,

      sha256:
        sha256Buffer(
          buffer
        )
    });
  }

  if (
    candidates.length ===
      0
  ) {
    return baseArtifact({
      dayKey:
        day,

      planState:
        "NO_REPAIR_REQUIRED",

      reason:
        "no_source_detail_orphans_after_reobservation"
    });
  }

  return {
    schema:
      CHECKPOINT_AWARE_TARGETED_DETAILS_ORPHAN_PLAN_SCHEMA,

    dayKey:
      day,

    planState:
      "EXACT_ORPHAN_CLEANUP_PLAN",

    reason:
      "verified_source_detail_extra_files_only",

    candidateCount:
      candidates.length,

    candidates,

    allowedRepositoryDeletionsAfterFutureAuthorization:
      candidates.map(
        row =>
          row.relativePath
      ),

    verification: {
      mirrorReportOk:
        false,

      onlyViolationCode:
        "source_detail_extra_file",

      verifierExtraFiles:
        sortedUnique(
          violationFiles
        ),

      filesystemExtraFiles:
        sortedUnique(
          actualExtras
        ),

      fixtureExpectedFileCount:
        expectedSet.size,

      candidateHashesBound:
        true
    },

    safety: {
      readOnly:
        true,

      repositoryWritePerformed:
        false,

      fileDeletionPerformed:
        false,

      snapshotDetailDeletionAuthorized:
        false,

      fullDetailsRebuildAuthorized:
        false,

      valueRebuildAuthorized:
        false,

      fullDailyCycleAuthorized:
        false
    }
  };
}
