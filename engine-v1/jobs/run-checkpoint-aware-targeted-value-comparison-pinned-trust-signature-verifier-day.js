import path from "node:path";
import {
  fileURLToPath
} from "node:url";

import {
  inspectCheckpointAwareValueComparisonPinnedTrustRegistry
} from "../core/checkpoint-aware-targeted-value-comparison-pinned-trust-signature-verifier.js";

import {
  runCheckpointAwareValueComparisonAuthorizationValidatorBindingContractDay
} from "./run-checkpoint-aware-targeted-value-comparison-authorization-validator-binding-contract-day.js";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const SHA_RE =
  /^[0-9a-f]{40}$/u;

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

export function runCheckpointAwareValueComparisonPinnedTrustSignatureVerifierDay({
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
      "value_comparison_pinned_trust_verifier_day_invalid"
    );
  }

  if (
    !SHA_RE.test(
      head
    )
  ) {
    throw new Error(
      "value_comparison_pinned_trust_verifier_remote_head_invalid"
    );
  }

  const r15 =
    runCheckpointAwareValueComparisonAuthorizationValidatorBindingContractDay({
      dayKey:
        day,
      remoteHead:
        head,
      generatedAt
    });

  if (
    r15
      ?.safety
      ?.repositoryWritePerformed !==
        false ||
    r15
      ?.safety
      ?.authorizationArtifactCreated !==
        false ||
    r15
      ?.safety
      ?.signerUse !==
        false ||
    r15
      ?.safety
      ?.privateKeyRead !==
        false ||
    r15
      ?.safety
      ?.productionKernelEnabled !==
        false
  ) {
    throw new Error(
      "value_comparison_pinned_trust_verifier_r15_boundary_invalid"
    );
  }

  const registry =
    inspectCheckpointAwareValueComparisonPinnedTrustRegistry();

  if (
    registry.recordCount <
      1 ||
    registry.allRecordsValid !==
      true
  ) {
    throw new Error(
      "value_comparison_pinned_trust_registry_invalid"
    );
  }

  const noAuthorizationRequired =
    r15.validationState ===
      "NO_AUTHORIZATION_REQUIRED_CURRENT_STATE";

  const awaitingAuthorization =
    r15.validationState ===
      "AWAITING_EXTERNAL_AUTHORIZATION_ARTIFACT";

  if (
    !noAuthorizationRequired &&
    !awaitingAuthorization
  ) {
    throw new Error(
      "value_comparison_pinned_trust_verifier_r15_state_invalid"
    );
  }

  return {
    schema:
      "ai-matchlab.checkpoint-aware-value-comparison-pinned-trust-signature-verifier-day.v1",

    mode:
      "READ_ONLY_PINNED_TRUST_SIGNATURE_VERIFIER",

    dayKey:
      day,

    generatedAt,

    remoteHead:
      head,

    verificationState:
      noAuthorizationRequired
        ? "NO_SIGNATURE_REQUIRED_CURRENT_STATE"
        : "AWAITING_EXTERNALLY_SIGNED_AUTHORIZATION_ARTIFACT",

    sourceR15State:
      r15.validationState,

    proposedMutationCount:
      r15.proposedMutationCount,

    pinnedTrustRegistry: {
      inspected:
        true,

      recordCount:
        registry.recordCount,

      allRecordsValid:
        registry.allRecordsValid,

      publicOnly:
        registry.records.every(
          row =>
            row.privateKeyMaterialPresent ===
              false
        )
    },

    cryptographicVerifier: {
      implemented:
        true,

      algorithm:
        "Ed25519",

      positivePrimitiveVectorCoveredByTests:
        true,

      externallySignedDedicatedArtifactPresented:
        false,

      dedicatedArtifactCryptographicallyVerifiedThisRun:
        false
    },

    nextRequiredGate:
      "DEDICATED_VALUE_COMPARISON_SINGLE_USE_REPLAY_AND_TRANSACTION_PLAN_BUILDER_READ_ONLY",

    safety: {
      repositoryWritePerformed:
        false,

      authorizationArtifactCreated:
        false,

      signatureMaterialCreated:
        false,

      externalSignerInvoked:
        false,

      privateKeyRead:
        false,

      pinnedPublicTrustReadOnly:
        true,

      productionKernelInvoked:
        false,

      productionKernelEnabled:
        false,

      authorizationGrantAuthority:
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
      runCheckpointAwareValueComparisonPinnedTrustSignatureVerifierDay({
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
              "unknown_value_comparison_pinned_trust_verifier_error"
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
