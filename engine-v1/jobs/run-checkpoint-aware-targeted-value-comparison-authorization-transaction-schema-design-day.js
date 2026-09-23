import fs from "node:fs";
import path from "node:path";
import {
  fileURLToPath
} from "node:url";

import {
  buildCheckpointAwareValueComparisonAuthTransactionSchemaDesign
} from "../core/checkpoint-aware-targeted-value-comparison-authorization-transaction-schema-design.js";

import {
  runCheckpointAwareValueComparisonDisabledProductionAdapterContractDay
} from "./run-checkpoint-aware-targeted-value-comparison-disabled-production-adapter-contract-day.js";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const SHA_RE =
  /^[0-9a-f]{40}$/u;

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function sourceText(
  relativePath
) {
  return fs.readFileSync(
    new URL(
      `../core/${relativePath}`,
      import.meta.url
    ),
    "utf8"
  );
}

function assertLegacySurfacesRemainUnmodifiedForValueRoute() {
  const authorizationSource =
    sourceText(
      "autonomous-repair-execution-authorization-v2.js"
    );

  const transactionSource =
    sourceText(
      "autonomous-repair-execution-transaction-plan.js"
    );

  const planSource =
    sourceText(
      "autonomous-repair-plan.js"
    );

  const verifierSource =
    sourceText(
      "autonomous-repair-target-verifier.js"
    );

  if (
    authorizationSource.includes(
      '"REBUILD_VALUE_COMPARISON_ONLY"'
    ) ||
    transactionSource.includes(
      '"REBUILD_VALUE_COMPARISON_ONLY"'
    )
  ) {
    throw new Error(
      "value_comparison_schema_design_legacy_repair_class_was_modified"
    );
  }

  if (
    !planSource.includes(
      'lower.includes("/value-comparison/")'
    ) ||
    !verifierSource.includes(
      'lower.includes("/value-comparison/")'
    )
  ) {
    throw new Error(
      "value_comparison_schema_design_legacy_protected_path_rule_changed"
    );
  }

  return {
    authorizationV2UnmodifiedForDedicatedClass:
      true,

    transactionPlanUnmodifiedForDedicatedClass:
      true,

    genericPlanValueComparisonProtectionPresent:
      true,

    targetVerifierValueComparisonProtectionPresent:
      true
  };
}

export function runCheckpointAwareValueComparisonAuthTransactionSchemaDesignDay({
  dayKey,
  remoteHead,
  generatedAt =
    new Date().toISOString()
} = {}) {
  const day =
    clean(
      dayKey
    );

  const head =
    clean(
      remoteHead
    )
      .toLowerCase();

  if (
    !DAY_RE.test(
      day
    )
  ) {
    throw new Error(
      "value_comparison_schema_design_day_invalid"
    );
  }

  if (
    !SHA_RE.test(
      head
    )
  ) {
    throw new Error(
      "value_comparison_schema_design_remote_head_invalid"
    );
  }

  const legacyEvidence =
    assertLegacySurfacesRemainUnmodifiedForValueRoute();

  const r13 =
    runCheckpointAwareValueComparisonDisabledProductionAdapterContractDay({
      dayKey:
        day,

      remoteHead:
        head,

      generatedAt
    });

  if (
    r13
      ?.contract
      ?.authority
      ?.adapterEnabled !==
        false ||
    r13
      ?.contract
      ?.authority
      ?.mutableExecutionAuthorized !==
        false ||
    r13
      ?.contract
      ?.authority
      ?.signerUseAuthorized !==
        false ||
    r13
      ?.contract
      ?.authority
      ?.protectedPathBypassAuthorized !==
        false
  ) {
    throw new Error(
      "value_comparison_schema_design_r13_disabled_boundary_not_preserved"
    );
  }

  const design =
    buildCheckpointAwareValueComparisonAuthTransactionSchemaDesign({
      dayKey:
        day,

      disabledAdapterContract:
        r13.contract
    });

  return {
    schema:
      "ai-matchlab.checkpoint-aware-value-comparison-authorization-transaction-schema-design-day.v1",

    mode:
      "SCHEMA_DESIGN_ONLY",

    dayKey:
      day,

    generatedAt,

    remoteHead:
      head,

    design,

    sourceR13: {
      adapterState:
        r13
          .contract
          .adapterState,

      proposedMutationCount:
        r13
          .contract
          .sourceEvidence
          .proposedMutationCount,

      productionKernelEnabled:
        r13
          .contract
          .productionExecutionBoundary
          .productionKernelEnabled
    },

    legacyEvidence,

    safety: {
      repositoryWritePerformed:
        false,

      authorizationArtifactCreated:
        false,

      signatureVerificationPerformed:
        false,

      signerUse:
        false,

      privateKeyRead:
        false,

      productionKernelInvoked:
        false,

      productionKernelEnabled:
        false,

      protectedPathBypassUsed:
        false,

      commitPerformed:
        false,

      pushPerformed:
        false,

      deployPerformed:
        false
    }
  };
}

function parseArg(name) {
  const prefix =
    `--${name}=`;

  const value =
    process.argv
      .slice(2)
      .find(
        arg =>
          arg.startsWith(
            prefix
          )
      );

  return value
    ? value
        .slice(
          prefix.length
        )
        .trim()
    : "";
}

const isCli =
  process.argv[1] &&
  fileURLToPath(
    import.meta.url
  ) ===
    path.resolve(
      process.argv[1]
    );

if (
  isCli
) {
  try {
    const result =
      runCheckpointAwareValueComparisonAuthTransactionSchemaDesignDay({
        dayKey:
          parseArg(
            "date"
          ),

        remoteHead:
          parseArg(
            "remote-head"
          )
      });

    console.log(
      JSON.stringify(
        result,
        null,
        2
      )
    );
  }
  catch (
    error
  ) {
    console.error(
      JSON.stringify(
        {
          ok:
            false,

          reason:
            String(
              error?.message ||
              error ||
              "unknown_value_comparison_schema_design_error"
            )
        },
        null,
        2
      )
    );

    process.exitCode =
      1;
  }
}
