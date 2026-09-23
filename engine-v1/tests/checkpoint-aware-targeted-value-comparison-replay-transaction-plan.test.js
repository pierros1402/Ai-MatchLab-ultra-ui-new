import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildCheckpointAwareValueComparisonCandidateSetFromPreflight,
  checkpointAwareValueComparisonAuthorizationFingerprint
} from "../core/checkpoint-aware-targeted-value-comparison-authorization-validator-binding.js";

import {
  buildCheckpointAwareValueComparisonReadOnlyTransactionPlan,
  checkpointAwareValueComparisonTransactionPlanFingerprint,
  deriveCheckpointAwareValueComparisonReplayKey,
  validateCheckpointAwareValueComparisonReplayLedgerAdapter,
  validateCheckpointAwareValueComparisonTransactionPlanArtifact
} from "../core/checkpoint-aware-targeted-value-comparison-replay-transaction-plan.js";

const DAY =
  "2026-09-23";

const HEAD =
  "8".repeat(40);

const SHA_A =
  "a".repeat(64);

const SHA_B =
  "b".repeat(64);

const SHA_C =
  "c".repeat(64);

const SHA_D =
  "d".repeat(64);

const SHA_E =
  "e".repeat(64);

const SHA_F =
  "f".repeat(64);

function preflight() {
  return {
    schema:
      "ai-matchlab.checkpoint-aware-value-comparison-mutation-preflight.v1",

    version:
      "1.0.0",

    role:
      "read_only_mutation_bridge_preflight",

    mode:
      "MUTATION_PREFLIGHT_ONLY",

    dayKey:
      DAY,

    remoteHead:
      HEAD,

    preflightState:
      "MUTATION_CANDIDATE_READY",

    bindings: {
      decisionFingerprint:
        SHA_E,

      executorContractFingerprint:
        SHA_F
    },

    exactTargetScope: [
      `data/value-comparison/${DAY}.json`,
      "data/value-comparison/cumulative.json"
    ],

    targets: [
      {
        targetPath:
          `data/value-comparison/${DAY}.json`,

        proposedMutation:
          true,

        preimage: {
          sha256:
            SHA_A,
          bytes:
            100
        },

        candidateMaterial: {
          sha256:
            SHA_B,
          bytes:
            120
        }
      },

      {
        targetPath:
          "data/value-comparison/cumulative.json",

        proposedMutation:
          false,

        preimage: {
          sha256:
            SHA_C,
          bytes:
            200
        },

        candidateMaterial: {
          sha256:
            SHA_D,
          bytes:
            240
        }
      }
    ],

    operations: [
      {
        order:
          1,

        targetPath:
          `data/value-comparison/${DAY}.json`,

        mutationMode:
          "REPLACE",

        preimageSha256:
          SHA_A,

        candidateMaterialSha256:
          SHA_B,

        exactBytesNotYetAuthorityBound:
          true
      }
    ],

    preflightFingerprint:
      "1".repeat(64)
  };
}

function authorization({
  candidateSet
}) {
  const artifact = {
    schema:
      "ai-matchlab.checkpoint-aware-value-comparison-execution-authorization.v1",

    version:
      "1.0.0",

    role:
      "externally_signed_bounded_value_comparison_execution_authorization",

    dayKey:
      DAY,

    generatedAt:
      "2026-09-23T06:10:00.000Z",

    authorizationId:
      "vcrauth_v1_0123456789abcdef0123456789abcdef",

    nonce:
      "vcrnonce_v1_" +
      "2".repeat(64),

    issuedAt:
      "2026-09-23T06:10:00.000Z",

    notBefore:
      "2026-09-23T06:10:00.000Z",

    expiresAt:
      "2026-09-23T06:20:00.000Z",

    repairClass:
      "REBUILD_VALUE_COMPARISON_ONLY",

    bindings: {
      dayKey:
        DAY,

      remoteHead:
        HEAD,

      controllerDecisionFingerprint:
        candidateSet
          .controllerDecisionFingerprint,

      executorContractFingerprint:
        candidateSet
          .executorContractFingerprint,

      mutationPreflightFingerprint:
        candidateSet
          .mutationPreflightFingerprint,

      candidateSetFingerprint:
        candidateSet
          .candidateSetFingerprint
    },

    operationScope:
      candidateSet
        .operationScope
        .map(
          row => ({
            ...row
          })
        ),

    safety: {
      exactRequestScopeOnly:
        true,
      exactPreimageReverificationRequired:
        true,
      exactPostimageVerificationRequired:
        true,
      atomicWriteRequired:
        true,
      verifiedBackupRequired:
        true,
      reverseRollbackRequired:
        true,
      allOrNothingRequired:
        true,
      singleUseRequired:
        true,
      externalGlobalLockRequired:
        true,
      durableExternalJournalRequired:
        true,
      partialExecutionForbidden:
        true
    },

    authorizationFingerprint:
      null,

    signature: {
      algorithm:
        "Ed25519",
      encoding:
        "base64",
      issuerId:
        "ai-matchlab-external-control-plane-v1",
      keyId:
        "arkey_v1_test",
      publicKeySpkiSha256:
        "3".repeat(64),
      value:
        Buffer.from(
          "synthetic-signature-envelope-only",
          "utf8"
        )
          .toString(
            "base64"
          )
    }
  };

  artifact.authorizationFingerprint =
    checkpointAwareValueComparisonAuthorizationFingerprint(
      artifact
    );

  return artifact;
}

function fixture() {
  const pf =
    preflight();

  const candidateSet =
    buildCheckpointAwareValueComparisonCandidateSetFromPreflight({
      preflight:
        pf
    });

  const auth =
    authorization({
      candidateSet
    });

  const pinnedTrustVerification = {
    schema:
      "ai-matchlab.checkpoint-aware-value-comparison-pinned-trust-signature-verification.v1",

    validationState:
      "SIGNATURE_AND_PINNED_TRUST_VERIFIED_READ_ONLY",

    ok:
      true,

    dayKey:
      DAY,

    operationCount:
      1,

    authorizationFingerprint:
      auth.authorizationFingerprint,

    candidateSetFingerprint:
      candidateSet.candidateSetFingerprint,

    mutationPreflightFingerprint:
      pf.preflightFingerprint,

    signature: {
      algorithm:
        "Ed25519",

      cryptographicallyVerified:
        true,

      pinnedTrustVerified:
        true,

      verificationTime:
        "2026-09-23T06:15:00.000Z"
    },

    authority: {
      readOnly:
        true,

      authorizationGranted:
        false,

      signerUseAuthorized:
        false,

      privateKeyReadAuthorized:
        false,

      productionKernelInvocationAuthorized:
        false,

      filesystemRepositoryWriteAuthorized:
        false,

      repairExecutionAuthorized:
        false
    }
  };

  return {
    pf,
    candidateSet,
    auth,
    pinnedTrustVerification,

    currentTargetIdentities: [
      {
        targetPath:
          `data/value-comparison/${DAY}.json`,
        sha256:
          SHA_A,
        bytes:
          100
      }
    ]
  };
}

test(
  "dedicated replay key is deterministic and bound to authorization id nonce and fingerprint",
  () => {
    const first =
      deriveCheckpointAwareValueComparisonReplayKey({
        authorizationId:
          "vcrauth_v1_0123456789abcdef0123456789abcdef",

        nonce:
          "vcrnonce_v1_" +
          "2".repeat(64),

        authorizationFingerprint:
          "3".repeat(64)
      });

    const second =
      deriveCheckpointAwareValueComparisonReplayKey({
        authorizationId:
          "vcrauth_v1_0123456789abcdef0123456789abcdef",

        nonce:
          "vcrnonce_v1_" +
          "2".repeat(64),

        authorizationFingerprint:
          "3".repeat(64)
      });

    assert.equal(
      first,
      second
    );

    assert.match(
      first,
      /^[0-9a-f]{64}$/u
    );

    assert.notEqual(
      first,
      deriveCheckpointAwareValueComparisonReplayKey({
        authorizationId:
          "vcrauth_v1_0123456789abcdef0123456789abcdef",

        nonce:
          "vcrnonce_v1_" +
          "4".repeat(64),

        authorizationFingerprint:
          "3".repeat(64)
      })
    );
  }
);

test(
  "external replay ledger adapter contract requires atomic consume and read methods",
  () => {
    assert.equal(
      validateCheckpointAwareValueComparisonReplayLedgerAdapter({
        consumeOnceAtomically() {},
        readReplayConsumption() {}
      }),
      true
    );

    assert.throws(
      () =>
        validateCheckpointAwareValueComparisonReplayLedgerAdapter({
          readReplayConsumption() {}
        }),
      /replay_ledger_adapter_invalid/u
    );
  }
);

test(
  "read-only transaction plan binds exact preimage postimage and replay identity",
  () => {
    const f =
      fixture();

    const plan =
      buildCheckpointAwareValueComparisonReadOnlyTransactionPlan({
        authorization:
          f.auth,

        preflight:
          f.pf,

        candidateSet:
          f.candidateSet,

        pinnedTrustVerification:
          f.pinnedTrustVerification,

        currentTargetIdentities:
          f.currentTargetIdentities
      });

    assert.equal(
      validateCheckpointAwareValueComparisonTransactionPlanArtifact(
        plan
      ),
      true
    );

    assert.equal(
      plan.summary.operationCount,
      1
    );

    assert.equal(
      plan.operations[0].preimage.reverifiedCurrent,
      true
    );

    assert.equal(
      plan.operations[0].postimage.materialBindingState,
      "HASH_AND_SIZE_ONLY_REMATERIALIZATION_REQUIRED"
    );

    assert.equal(
      plan.replayContract.consumptionState,
      "NOT_CONSUMED_READ_ONLY_PLAN"
    );

    assert.equal(
      plan.authority.replayConsumptionAuthorized,
      false
    );
  }
);

test(
  "transaction plan fails closed on current preimage drift",
  () => {
    const f =
      fixture();

    f.currentTargetIdentities[0].sha256 =
      "9".repeat(64);

    assert.throws(
      () =>
        buildCheckpointAwareValueComparisonReadOnlyTransactionPlan({
          authorization:
            f.auth,

          preflight:
            f.pf,

          candidateSet:
            f.candidateSet,

          pinnedTrustVerification:
            f.pinnedTrustVerification,

          currentTargetIdentities:
            f.currentTargetIdentities
        }),
      /preimage_reverification_failed/u
    );
  }
);

test(
  "transaction plan refuses unverified or authorization-granting trust evidence",
  () => {
    const f =
      fixture();

    const bad = {
      ...f.pinnedTrustVerification,

      signature: {
        ...f
          .pinnedTrustVerification
          .signature,

        cryptographicallyVerified:
          false
      }
    };

    assert.throws(
      () =>
        buildCheckpointAwareValueComparisonReadOnlyTransactionPlan({
          authorization:
            f.auth,

          preflight:
            f.pf,

          candidateSet:
            f.candidateSet,

          pinnedTrustVerification:
            bad,

          currentTargetIdentities:
            f.currentTargetIdentities
        }),
      /pinned_trust_verification_invalid/u
    );

    const granting = {
      ...f.pinnedTrustVerification,

      authority: {
        ...f
          .pinnedTrustVerification
          .authority,

        authorizationGranted:
          true
      }
    };

    assert.throws(
      () =>
        buildCheckpointAwareValueComparisonReadOnlyTransactionPlan({
          authorization:
            f.auth,

          preflight:
            f.pf,

          candidateSet:
            f.candidateSet,

          pinnedTrustVerification:
            granting,

          currentTargetIdentities:
            f.currentTargetIdentities
        }),
      /pinned_trust_verification_invalid/u
    );
  }
);

test(
  "transaction plan fingerprint is deterministic and self-consistent",
  () => {
    const f =
      fixture();

    const first =
      buildCheckpointAwareValueComparisonReadOnlyTransactionPlan({
        authorization:
          f.auth,

        preflight:
          f.pf,

        candidateSet:
          f.candidateSet,

        pinnedTrustVerification:
          f.pinnedTrustVerification,

        currentTargetIdentities:
          f.currentTargetIdentities
      });

    const second =
      buildCheckpointAwareValueComparisonReadOnlyTransactionPlan({
        authorization:
          f.auth,

        preflight:
          f.pf,

        candidateSet:
          f.candidateSet,

        pinnedTrustVerification:
          f.pinnedTrustVerification,

        currentTargetIdentities:
          f.currentTargetIdentities
      });

    assert.equal(
      first.transactionPlanFingerprint,
      second.transactionPlanFingerprint
    );

    assert.equal(
      first.transactionPlanFingerprint,
      checkpointAwareValueComparisonTransactionPlanFingerprint(
        first
      )
    );
  }
);

test(
  "postimage bytes remain deliberately unresolved and no production execution authority is granted",
  () => {
    const f =
      fixture();

    const plan =
      buildCheckpointAwareValueComparisonReadOnlyTransactionPlan({
        authorization:
          f.auth,

        preflight:
          f.pf,

        candidateSet:
          f.candidateSet,

        pinnedTrustVerification:
          f.pinnedTrustVerification,

        currentTargetIdentities:
          f.currentTargetIdentities
      });

    assert.equal(
      Object.prototype.hasOwnProperty.call(
        plan.operations[0].postimage,
        "contentBase64"
      ),
      false
    );

    assert.equal(
      plan.authority.postimageMaterialResolutionAuthorized,
      false
    );

    assert.equal(
      plan.authority.filesystemRepositoryWriteAuthorized,
      false
    );

    assert.equal(
      plan.authority.productionKernelInvocationAuthorized,
      false
    );
  }
);

test(
  "R17 runner contains no replay consumption signer private-key writer kernel push or deploy machinery",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-value-comparison-replay-transaction-plan-builder-day.js",
          import.meta.url
        ),
        "utf8"
      );

    const forbiddenPatterns = [
      /\bconsumeOnceAtomically\s*\(/u,
      /\bcreatePrivateKey\b/u,
      /\bprivateKey(?:Pem|Path)?\s*[:=]/u,
      /\bsign\s*\(/u,
      /\bexecuteAutonomousRepairProductionExecution\b/u,
      /\bexecuteAutonomousRepairFilesystemTransaction\b/u,
      /\bwriteFileSync\b/u,
      /\brenameSync\b/u,
      /\bgit\s+push\b/u,
      /\bgit\s+commit\b/u,
      /\bworkflow_dispatch\b/u,
      /\bRENDER_/u
    ];

    for (
      const pattern of
        forbiddenPatterns
    ) {
      assert.equal(
        pattern.test(
          source
        ),
        false,
        `R17 runner must not match ${pattern}`
      );
    }
  }
);
