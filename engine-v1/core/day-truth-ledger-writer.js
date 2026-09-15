import fs from "node:fs";
import path from "node:path";
import {
  randomUUID
} from "node:crypto";

import {
  resolveDataPath
} from "../storage/data-root.js";

import {
  DAY_TRUTH_LEDGER_SCHEMA,
  DAY_TRUTH_LEDGER_VERSION,
  DAY_TRUTH_LEDGER_ROLE,
  DAY_TRUTH_LEDGER_AUTHORITY
} from "./day-truth-ledger.js";

const LEDGER_STATES =
  new Set([
    "EMPTY",
    "OPEN",
    "INCOMPLETE",
    "CLOSED",
    "CONFLICT"
  ]);

const WRITE_AUTHORIZATION_FIELDS =
  Object.freeze([
    "canonicalWriteAuthorized",
    "verifiedFinalWriteAuthorized",
    "historyWriteAuthorized",
    "valueSettlementWriteAuthorized",
    "publicationWriteAuthorized",
    "repairAuthorized"
  ]);

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function exactDayKey(value) {
  const dayKey =
    clean(value);

  if (
    !/^20\d{2}-\d{2}-\d{2}$/u
      .test(dayKey)
  ) {
    throw new Error(
      "day_truth_ledger_write_invalid_day_key"
    );
  }

  const [
    year,
    month,
    day
  ] =
    dayKey
      .split("-")
      .map(Number);

  const parsed =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  if (
    parsed.getUTCFullYear() !==
      year ||
    parsed.getUTCMonth() + 1 !==
      month ||
    parsed.getUTCDate() !==
      day
  ) {
    throw new Error(
      "day_truth_ledger_write_invalid_day_key"
    );
  }

  return dayKey;
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(
      stableValue
    );
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(
          key => [
            key,
            stableValue(
              value[key]
            )
          ]
        )
    );
  }

  return value;
}

function semanticProjection(
  ledger
) {
  const projection =
    structuredClone(
      ledger
    );

  /*
   * generatedAt describes when the artifact was materially
   * produced. It must not cause timestamp-only rewrites.
   */
  delete projection.generatedAt;

  return stableValue(
    projection
  );
}

function semanticKey(
  ledger
) {
  return JSON.stringify(
    semanticProjection(
      ledger
    )
  );
}

function serializedArtifact(
  ledger
) {
  return (
    JSON.stringify(
      ledger,
      null,
      2
    ) +
    "\n"
  );
}

export function validateDayTruthLedgerArtifactForWrite(
  ledger
) {
  if (
    !ledger ||
    typeof ledger !==
      "object" ||
    Array.isArray(ledger)
  ) {
    throw new Error(
      "day_truth_ledger_write_artifact_required"
    );
  }

  if (
    ledger.schema !==
      DAY_TRUTH_LEDGER_SCHEMA ||
    ledger.ledgerVersion !==
      DAY_TRUTH_LEDGER_VERSION ||
    ledger.role !==
      DAY_TRUTH_LEDGER_ROLE
  ) {
    throw new Error(
      "day_truth_ledger_write_contract_identity_invalid"
    );
  }

  const dayKey =
    exactDayKey(
      ledger.dayKey
    );

  const generatedAt =
    clean(
      ledger.generatedAt
    );

  if (
    !generatedAt ||
    !Number.isFinite(
      Date.parse(
        generatedAt
      )
    )
  ) {
    throw new Error(
      "day_truth_ledger_write_generated_at_invalid"
    );
  }

  if (
    !LEDGER_STATES.has(
      ledger.ledgerState
    )
  ) {
    throw new Error(
      "day_truth_ledger_write_state_invalid"
    );
  }

  if (
    !/^[0-9a-f]{64}$/u
      .test(
        clean(
          ledger.truthFingerprint
        )
      )
  ) {
    throw new Error(
      "day_truth_ledger_write_truth_fingerprint_invalid"
    );
  }

  if (
    !ledger.authority ||
    typeof ledger.authority !==
      "object"
  ) {
    throw new Error(
      "day_truth_ledger_write_authority_missing"
    );
  }

  for (
    const [
      key,
      expected
    ] of Object.entries(
      DAY_TRUTH_LEDGER_AUTHORITY
    )
  ) {
    if (
      ledger
        .authority
        ?.[key] !==
      expected
    ) {
      throw new Error(
        `day_truth_ledger_write_authority_invalid:${key}`
      );
    }
  }

  if (
    !Array.isArray(
      ledger.fixtures
    ) ||
    !ledger.summary ||
    typeof ledger.summary !==
      "object"
  ) {
    throw new Error(
      "day_truth_ledger_write_structure_invalid"
    );
  }

  if (
    Number(
      ledger
        .summary
        .canonicalRows
    ) !==
    ledger.fixtures.length
  ) {
    throw new Error(
      "day_truth_ledger_write_canonical_count_mismatch"
    );
  }

  for (
    const row of
    ledger.fixtures
  ) {
    if (
      !clean(
        row?.canonicalId
      ) ||
      row
        ?.decision
        ?.repairAuthorized !==
      false
    ) {
      throw new Error(
        "day_truth_ledger_write_fixture_contract_invalid"
      );
    }
  }

  const authorization =
    ledger.authorization;

  if (
    !authorization ||
    typeof authorization !==
      "object"
  ) {
    throw new Error(
      "day_truth_ledger_write_authorization_missing"
    );
  }

  for (
    const field of
    WRITE_AUTHORIZATION_FIELDS
  ) {
    if (
      authorization[field] !==
      false
    ) {
      throw new Error(
        `day_truth_ledger_write_authorization_invalid:${field}`
      );
    }
  }

  const convergence =
    ledger
      ?.downstream
      ?.convergence;

  if (
    !convergence ||
    typeof convergence !==
      "object" ||
    Array.isArray(
      convergence
    )
  ) {
    throw new Error(
      "day_truth_ledger_write_convergence_required"
    );
  }

  if (
    convergence
      .truthFingerprint !==
    ledger.truthFingerprint
  ) {
    throw new Error(
      "day_truth_ledger_write_convergence_fingerprint_mismatch"
    );
  }

  const convergenceAuthority =
    convergence.authority;

  if (
    !convergenceAuthority ||
    convergenceAuthority
      .footballTruthMutable !==
      false ||
    convergenceAuthority
      .downstreamMutationAuthorized !==
      false ||
    convergenceAuthority
      .repairAuthorized !==
      false ||
    convergenceAuthority
      .observationsAffectTruthFingerprint !==
      false
  ) {
    throw new Error(
      "day_truth_ledger_write_convergence_authority_invalid"
    );
  }

  return {
    ok: true,
    dayKey
  };
}

export function planDayTruthLedgerArtifactWrite({
  ledger,
  existingText = null
} = {}) {
  const validation =
    validateDayTruthLedgerArtifactForWrite(
      ledger
    );

  const incomingText =
    serializedArtifact(
      ledger
    );

  if (
    existingText === null ||
    existingText === undefined
  ) {
    return {
      writeRequired:
        true,

      unchanged:
        false,

      reason:
        "artifact_missing",

      dayKey:
        validation.dayKey,

      artifact:
        structuredClone(
          ledger
        ),

      outputText:
        incomingText
    };
  }

  let existing;

  try {
    existing =
      JSON.parse(
        String(
          existingText
        ).replace(
          /^\uFEFF/u,
          ""
        )
      );
  }
  catch {
    throw new Error(
      "day_truth_ledger_existing_artifact_json_invalid"
    );
  }

  const existingValidation =
    validateDayTruthLedgerArtifactForWrite(
      existing
    );

  if (
    existingValidation.dayKey !==
    validation.dayKey
  ) {
    throw new Error(
      "day_truth_ledger_existing_artifact_day_mismatch"
    );
  }

  if (
    semanticKey(
      existing
    ) ===
    semanticKey(
      ledger
    )
  ) {
    return {
      writeRequired:
        false,

      unchanged:
        true,

      reason:
        "semantic_noop",

      dayKey:
        validation.dayKey,

      artifact:
        structuredClone(
          existing
        ),

      outputText:
        null
    };
  }

  return {
    writeRequired:
      true,

    unchanged:
      false,

    reason:
      "semantic_change",

    dayKey:
      validation.dayKey,

    artifact:
      structuredClone(
        ledger
      ),

    outputText:
      incomingText
  };
}

export function writeDayTruthLedgerArtifact({
  ledger
} = {}) {
  const validation =
    validateDayTruthLedgerArtifactForWrite(
      ledger
    );

  /*
   * No caller-supplied output path is accepted.
   * This writer has exactly one mutation surface.
   */
  const directory =
    resolveDataPath(
      "day-truth-ledger"
    );

  const outputFile =
    path.join(
      directory,
      `${validation.dayKey}.json`
    );

  const relativeOutputPath =
    `data/day-truth-ledger/${validation.dayKey}.json`;

  const existingText =
    fs.existsSync(
      outputFile
    )
      ? fs.readFileSync(
          outputFile,
          "utf8"
        )
      : null;

  const plan =
    planDayTruthLedgerArtifactWrite({
      ledger,
      existingText
    });

  if (!plan.writeRequired) {
    return {
      ok: true,

      artifactWritten:
        false,

      unchanged:
        true,

      reason:
        plan.reason,

      atomicWrite:
        false,

      outputPath:
        relativeOutputPath,

      generatedAt:
        plan.artifact
          .generatedAt,

      artifact:
        plan.artifact
    };
  }

  fs.mkdirSync(
    directory,
    {
      recursive: true
    }
  );

  const tempFile =
    `${outputFile}.tmp-${process.pid}-${randomUUID()}`;

  try {
    fs.writeFileSync(
      tempFile,
      plan.outputText,
      {
        encoding: "utf8",
        flag: "wx"
      }
    );

    fs.renameSync(
      tempFile,
      outputFile
    );

    const persisted =
      fs.readFileSync(
        outputFile,
        "utf8"
      );

    if (
      persisted !==
      plan.outputText
    ) {
      throw new Error(
        "day_truth_ledger_post_write_byte_mismatch"
      );
    }
  }
  finally {
    if (
      fs.existsSync(
        tempFile
      )
    ) {
      fs.unlinkSync(
        tempFile
      );
    }
  }

  return {
    ok: true,

    artifactWritten:
      true,

    unchanged:
      false,

    reason:
      plan.reason,

    atomicWrite:
      true,

    outputPath:
      relativeOutputPath,

    generatedAt:
      plan.artifact
        .generatedAt,

    artifact:
      plan.artifact
  };
}
