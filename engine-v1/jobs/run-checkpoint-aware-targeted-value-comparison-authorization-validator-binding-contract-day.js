import path from "node:path";
import {
  fileURLToPath
} from "node:url";

import {
  buildCheckpointAwareValueComparisonCandidateSetFromPreflight
} from "../core/checkpoint-aware-targeted-value-comparison-authorization-validator-binding.js";

import {
  runCheckpointAwareValueComparisonAuthTransactionSchemaDesignDay
} from "./run-checkpoint-aware-targeted-value-comparison-authorization-transaction-schema-design-day.js";

import {
  runCheckpointAwareValueComparisonMutationPreflightDay
} from "./run-checkpoint-aware-targeted-value-comparison-mutation-preflight-day.js";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const SHA_RE =
  /^[0-9a-f]{40}$/u;

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

export function runCheckpointAwareValueComparisonAuthorizationValidatorBindingContractDay({
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
      "value_comparison_authorization_validator_day_invalid"
    );
  }

  if (
    !SHA_RE.test(
      head
    )
  ) {
    throw new Error(
      "value_comparison_authorization_validator_remote_head_invalid"
    );
  }

  const designReport =
    runCheckpointAwareValueComparisonAuthTransactionSchemaDesignDay({
      dayKey:
        day,
      remoteHead:
        head,
      generatedAt
    });

  if (
    designReport
      ?.design
      ?.designState !==
        "SCHEMA_DESIGN_READY_DISABLED" ||
    designReport
      ?.design
      ?.authority
      ?.signerUseAuthorized !==
        false ||
    designReport
      ?.design
      ?.authority
      ?.productionKernelInvocationAuthorized !==
        false ||
    designReport
      ?.design
      ?.authority
      ?.mutableExecutionAuthorized !==
        false
  ) {
    throw new Error(
      "value_comparison_authorization_validator_design_boundary_invalid"
    );
  }

  const preflightReport =
    runCheckpointAwareValueComparisonMutationPreflightDay({
      dayKey:
        day,
      remoteHead:
        head,
      generatedAt
    });

  const preflight =
    preflightReport
      .preflight;

  if (
    preflight
      ?.preflightState ===
        "NO_MUTATION_REQUIRED"
  ) {
    return {
      schema:
        "ai-matchlab.checkpoint-aware-value-comparison-authorization-validator-binding-day.v1",

      mode:
        "READ_ONLY_AUTHORIZATION_VALIDATOR_BINDING_CONTRACT",

      dayKey:
        day,

      generatedAt,

      remoteHead:
        head,

      validationState:
        "NO_AUTHORIZATION_REQUIRED_CURRENT_STATE",

      sourcePreflightState:
        preflight
          .preflightState,

      proposedMutationCount:
        0,

      candidateSet:
        null,

      expectedAuthorizationBinding:
        null,

      nextRequiredGate:
        "DEDICATED_VALUE_COMPARISON_PINNED_TRUST_SIGNATURE_VERIFIER_READ_ONLY",

      safety: {
        repositoryWritePerformed:
          false,

        authorizationArtifactCreated:
          false,

        signatureVerificationPerformed:
          false,

        pinnedTrustLookupPerformed:
          false,

        signerUse:
          false,

        privateKeyRead:
          false,

        productionKernelInvoked:
          false,

        productionKernelEnabled:
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

  if (
    preflight
      ?.preflightState !==
        "MUTATION_CANDIDATE_READY"
  ) {
    throw new Error(
      "value_comparison_authorization_validator_preflight_state_invalid"
    );
  }

  const candidateSet =
    buildCheckpointAwareValueComparisonCandidateSetFromPreflight({
      preflight
    });

  return {
    schema:
      "ai-matchlab.checkpoint-aware-value-comparison-authorization-validator-binding-day.v1",

    mode:
      "READ_ONLY_AUTHORIZATION_VALIDATOR_BINDING_CONTRACT",

    dayKey:
      day,

    generatedAt,

    remoteHead:
      head,

    validationState:
      "AWAITING_EXTERNAL_AUTHORIZATION_ARTIFACT",

    sourcePreflightState:
      preflight
        .preflightState,

    proposedMutationCount:
      candidateSet
        .operationScope
        .length,

    candidateSet,

    expectedAuthorizationBinding: {
      dayKey:
        day,

      remoteHead:
        head,

      controllerDecisionFingerprint:
        preflight
          .bindings
          .decisionFingerprint,

      executorContractFingerprint:
        preflight
          .bindings
          .executorContractFingerprint,

      mutationPreflightFingerprint:
        preflight
          .preflightFingerprint,

      candidateSetFingerprint:
        candidateSet
          .candidateSetFingerprint,

      operationScope:
        candidateSet
          .operationScope
    },

    nextRequiredGate:
      "DEDICATED_VALUE_COMPARISON_PINNED_TRUST_SIGNATURE_VERIFIER_READ_ONLY",

    safety: {
      repositoryWritePerformed:
        false,

      authorizationArtifactCreated:
        false,

      signatureVerificationPerformed:
        false,

      pinnedTrustLookupPerformed:
        false,

      signerUse:
        false,

      privateKeyRead:
        false,

      productionKernelInvoked:
        false,

      productionKernelEnabled:
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
      runCheckpointAwareValueComparisonAuthorizationValidatorBindingContractDay({
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
              "unknown_value_comparison_authorization_validator_error"
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
