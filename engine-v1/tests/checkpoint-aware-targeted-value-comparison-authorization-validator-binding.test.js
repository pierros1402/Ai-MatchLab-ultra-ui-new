import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildCheckpointAwareValueComparisonCandidateSetFromPreflight,
  checkpointAwareValueComparisonAuthorizationFingerprint,
  checkpointAwareValueComparisonAuthorizationSigningBytes,
  validateCheckpointAwareValueComparisonAuthorizationArtifactStructure,
  validateCheckpointAwareValueComparisonAuthorizationBinding
} from "../core/checkpoint-aware-targeted-value-comparison-authorization-validator-binding.js";

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
          true,

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
      },

      {
        order:
          2,
        targetPath:
          "data/value-comparison/cumulative.json",
        mutationMode:
          "REPLACE",
        preimageSha256:
          SHA_C,
        candidateMaterialSha256:
          SHA_D,
        exactBytesNotYetAuthorityBound:
          true
      }
    ],

    preflightFingerprint:
      "1".repeat(64)
  };
}

function authorization({
  candidateSet,
  overrides = {}
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
    },

    ...overrides
  };

  artifact.authorizationFingerprint =
    checkpointAwareValueComparisonAuthorizationFingerprint(
      artifact
    );

  return artifact;
}

test(
  "candidate set derives deterministic operation IDs and exact two-target scope from preflight",
  () => {
    const first =
      buildCheckpointAwareValueComparisonCandidateSetFromPreflight({
        preflight:
          preflight()
      });

    const second =
      buildCheckpointAwareValueComparisonCandidateSetFromPreflight({
        preflight:
          preflight()
      });

    assert.deepEqual(
      first,
      second
    );

    assert.equal(
      first.operationScope.length,
      2
    );

    assert.match(
      first.operationScope[0].operationId,
      /^vcrop_v1_[0-9a-f]{24}$/u
    );

    assert.deepEqual(
      first.operationScope.map(
        row =>
          row.targetPath
      ),
      [
        `data/value-comparison/${DAY}.json`,
        "data/value-comparison/cumulative.json"
      ]
    );
  }
);

test(
  "structural validator accepts exact dedicated authorization envelope but does not verify signature",
  () => {
    const pf =
      preflight();

    const candidateSet =
      buildCheckpointAwareValueComparisonCandidateSetFromPreflight({
        preflight:
          pf
      });

    const artifact =
      authorization({
        candidateSet
      });

    assert.equal(
      validateCheckpointAwareValueComparisonAuthorizationArtifactStructure(
        artifact
      ),
      true
    );

    assert.ok(
      checkpointAwareValueComparisonAuthorizationSigningBytes(
        artifact
      ) instanceof
        Buffer
    );

    const result =
      validateCheckpointAwareValueComparisonAuthorizationBinding({
        authorization:
          artifact,
        preflight:
          pf,
        candidateSet
      });

    assert.equal(
      result.validationState,
      "STRUCTURE_AND_BINDINGS_VALID_SIGNATURE_UNVERIFIED"
    );

    assert.equal(
      result.signature.cryptographicallyVerified,
      false
    );

    assert.equal(
      result.authority.authorizationGranted,
      false
    );
  }
);

test(
  "candidate-set fingerprint mismatch fails closed",
  () => {
    const pf =
      preflight();

    const candidateSet =
      buildCheckpointAwareValueComparisonCandidateSetFromPreflight({
        preflight:
          pf
      });

    const artifact =
      authorization({
        candidateSet
      });

    artifact.bindings.candidateSetFingerprint =
      "9".repeat(64);

    artifact.authorizationFingerprint =
      checkpointAwareValueComparisonAuthorizationFingerprint(
        artifact
      );

    assert.throws(
      () =>
        validateCheckpointAwareValueComparisonAuthorizationBinding({
          authorization:
            artifact,
          preflight:
            pf,
          candidateSet
        }),
      /exact_binding_mismatch/u
    );
  }
);

test(
  "operation hash drift fails closed even when outer binding fingerprints match",
  () => {
    const pf =
      preflight();

    const candidateSet =
      buildCheckpointAwareValueComparisonCandidateSetFromPreflight({
        preflight:
          pf
      });

    const artifact =
      authorization({
        candidateSet
      });

    artifact.operationScope[0].postimageSha256 =
      "9".repeat(64);

    artifact.authorizationFingerprint =
      checkpointAwareValueComparisonAuthorizationFingerprint(
        artifact
      );

    assert.throws(
      () =>
        validateCheckpointAwareValueComparisonAuthorizationBinding({
          authorization:
            artifact,
          preflight:
            pf,
          candidateSet
        }),
      /exact_operation_binding_mismatch/u
    );
  }
);

test(
  "authorization lifetime greater than fifteen minutes fails closed",
  () => {
    const candidateSet =
      buildCheckpointAwareValueComparisonCandidateSetFromPreflight({
        preflight:
          preflight()
      });

    const artifact =
      authorization({
        candidateSet
      });

    artifact.expiresAt =
      "2026-09-23T06:30:00.000Z";

    artifact.authorizationFingerprint =
      checkpointAwareValueComparisonAuthorizationFingerprint(
        artifact
      );

    assert.throws(
      () =>
        validateCheckpointAwareValueComparisonAuthorizationArtifactStructure(
          artifact
        ),
      /validity_window_invalid/u
    );
  }
);

test(
  "malformed signature encoding fails structurally without performing crypto verification",
  () => {
    const candidateSet =
      buildCheckpointAwareValueComparisonCandidateSetFromPreflight({
        preflight:
          preflight()
      });

    const artifact =
      authorization({
        candidateSet
      });

    artifact.signature.value =
      "not base64***";

    assert.throws(
      () =>
        validateCheckpointAwareValueComparisonAuthorizationArtifactStructure(
          artifact
        ),
      /signature_envelope_invalid/u
    );
  }
);

test(
  "candidate set rejects an unexpected target or operation scope widening",
  () => {
    const pf =
      preflight();

    pf.exactTargetScope = [
      ...pf.exactTargetScope,
      "data/deploy-snapshots/2026-09-23/value.json"
    ];

    assert.throws(
      () =>
        buildCheckpointAwareValueComparisonCandidateSetFromPreflight({
          preflight:
            pf
        }),
      /exact_target_scope_invalid/u
    );
  }
);

test(
  "R15 runner contains no signature verification signer private-key kernel write push or deploy machinery",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-value-comparison-authorization-validator-binding-contract-day.js",
          import.meta.url
        ),
        "utf8"
      );

    const forbiddenPatterns = [
      /\bcreatePrivateKey\b/u,
      /\bprivateKey(?:Pem|Path)?\s*[:=]/u,
      /\bsign\s*\(/u,
      /\bverify\s*\(/u,
      /\bverifySignature\b/u,
      /\bresolveAutonomousRepairTrustedPublicKey\b/u,
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
        `R15 runner must not match ${pattern}`
      );
    }
  }
);
