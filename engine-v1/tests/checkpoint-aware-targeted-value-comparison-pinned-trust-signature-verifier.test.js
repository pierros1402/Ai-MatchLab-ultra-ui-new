import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  AUTONOMOUS_REPAIR_AUTHORIZATION_TRUSTED_PUBLIC_KEYS
} from "../core/autonomous-repair-authorization-trusted-public-keys.js";

import {
  buildCheckpointAwareValueComparisonCandidateSetFromPreflight,
  checkpointAwareValueComparisonAuthorizationFingerprint
} from "../core/checkpoint-aware-targeted-value-comparison-authorization-validator-binding.js";

import {
  inspectCheckpointAwareValueComparisonPinnedTrustRegistry,
  verifyCheckpointAwareValueComparisonAuthorizationAgainstPinnedTrust,
  verifyCheckpointAwareValueComparisonEd25519Bytes
} from "../core/checkpoint-aware-targeted-value-comparison-pinned-trust-signature-verifier.js";

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
  candidateSet,
  trustedKey,
  signatureValue,
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
        trustedKey
          ?.issuerId ||
        "ai-matchlab-external-control-plane-v1",

      keyId:
        trustedKey
          ?.keyId ||
        "arkey_v1_missing",

      publicKeySpkiSha256:
        trustedKey
          ?.publicKeySpkiSha256 ||
        "3".repeat(64),

      value:
        signatureValue ||
        Buffer.from(
          "synthetic-invalid-signature",
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
  "RFC8032 Ed25519 positive vector verifies without any private-key material",
  () => {
    const publicKeyPem =
      "-----BEGIN PUBLIC KEY-----\n" +
      "MCowBQYDK2VwAyEA11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=\n" +
      "-----END PUBLIC KEY-----\n";

    const signatureBase64 =
      "5VZDAMNgrHKQhuLMgG6CioSHfx645dl02HPgZSJJAVVfuIIVkKM7rMYeOXAc+bRr0lv18FlbviRlUUFDjnoQCw==";

    assert.equal(
      verifyCheckpointAwareValueComparisonEd25519Bytes({
        messageBytes:
          Buffer.alloc(
            0
          ),

        publicKeyPem,

        signatureBase64
      }),
      true
    );
  }
);

test(
  "RFC8032 signature rejects a changed message",
  () => {
    const publicKeyPem =
      "-----BEGIN PUBLIC KEY-----\n" +
      "MCowBQYDK2VwAyEA11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=\n" +
      "-----END PUBLIC KEY-----\n";

    const signatureBase64 =
      "5VZDAMNgrHKQhuLMgG6CioSHfx645dl02HPgZSJJAVVfuIIVkKM7rMYeOXAc+bRr0lv18FlbviRlUUFDjnoQCw==";

    assert.equal(
      verifyCheckpointAwareValueComparisonEd25519Bytes({
        messageBytes:
          Buffer.from(
            "changed",
            "utf8"
          ),

        publicKeyPem,

        signatureBase64
      }),
      false
    );
  }
);

test(
  "pinned trust registry inspection validates public SPKI and exposes no private-key material",
  () => {
    const result =
      inspectCheckpointAwareValueComparisonPinnedTrustRegistry();

    assert.equal(
      result.readOnly,
      true
    );

    assert.ok(
      result.recordCount >=
        1
    );

    assert.equal(
      result.allRecordsValid,
      true
    );

    assert.equal(
      result.records.every(
        row =>
          row.privateKeyMaterialPresent ===
            false &&
          row.publicKeySpkiSha256 ===
            row.computedPublicKeySpkiSha256
      ),
      true
    );
  }
);

test(
  "unknown issuer or key fails closed before cryptographic verification",
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
        candidateSet,
        trustedKey:
          null
      });

    assert.throws(
      () =>
        verifyCheckpointAwareValueComparisonAuthorizationAgainstPinnedTrust({
          authorization:
            artifact,

          preflight:
            pf,

          candidateSet,

          now:
            "2026-09-23T06:15:00.000Z"
        }),
      /pinned_trust_key_not_found/u
    );
  }
);

test(
  "pinned key SPKI mismatch fails closed",
  () => {
    const pf =
      preflight();

    const candidateSet =
      buildCheckpointAwareValueComparisonCandidateSetFromPreflight({
        preflight:
          pf
      });

    const trustedKey =
      AUTONOMOUS_REPAIR_AUTHORIZATION_TRUSTED_PUBLIC_KEYS[0];

    const artifact =
      authorization({
        candidateSet,
        trustedKey
      });

    artifact.signature.publicKeySpkiSha256 =
      "9".repeat(64);

    assert.throws(
      () =>
        verifyCheckpointAwareValueComparisonAuthorizationAgainstPinnedTrust({
          authorization:
            artifact,

          preflight:
            pf,

          candidateSet,

          now:
            "2026-09-23T06:15:00.000Z"
        }),
      /pinned_trust_spki_mismatch/u
    );
  }
);

test(
  "authorization outside its time window fails before signature acceptance",
  () => {
    const pf =
      preflight();

    const candidateSet =
      buildCheckpointAwareValueComparisonCandidateSetFromPreflight({
        preflight:
          pf
      });

    const trustedKey =
      AUTONOMOUS_REPAIR_AUTHORIZATION_TRUSTED_PUBLIC_KEYS[0];

    const artifact =
      authorization({
        candidateSet,
        trustedKey
      });

    assert.throws(
      () =>
        verifyCheckpointAwareValueComparisonAuthorizationAgainstPinnedTrust({
          authorization:
            artifact,

          preflight:
            pf,

          candidateSet,

          now:
            "2026-09-23T06:25:00.000Z"
        }),
      /pinned_trust_not_current/u
    );
  }
);

test(
  "invalid dedicated signature is rejected against the real pinned public key",
  () => {
    const pf =
      preflight();

    const candidateSet =
      buildCheckpointAwareValueComparisonCandidateSetFromPreflight({
        preflight:
          pf
      });

    const trustedKey =
      AUTONOMOUS_REPAIR_AUTHORIZATION_TRUSTED_PUBLIC_KEYS[0];

    const artifact =
      authorization({
        candidateSet,
        trustedKey
      });

    assert.throws(
      () =>
        verifyCheckpointAwareValueComparisonAuthorizationAgainstPinnedTrust({
          authorization:
            artifact,

          preflight:
            pf,

          candidateSet,

          now:
            "2026-09-23T06:15:00.000Z"
        }),
      /signature_invalid/u
    );
  }
);

test(
  "authorization binding remains mandatory before pinned-trust signature evaluation",
  () => {
    const pf =
      preflight();

    const candidateSet =
      buildCheckpointAwareValueComparisonCandidateSetFromPreflight({
        preflight:
          pf
      });

    const trustedKey =
      AUTONOMOUS_REPAIR_AUTHORIZATION_TRUSTED_PUBLIC_KEYS[0];

    const artifact =
      authorization({
        candidateSet,
        trustedKey
      });

    artifact.bindings.remoteHead =
      "7".repeat(40);

    artifact.authorizationFingerprint =
      checkpointAwareValueComparisonAuthorizationFingerprint(
        artifact
      );

    assert.throws(
      () =>
        verifyCheckpointAwareValueComparisonAuthorizationAgainstPinnedTrust({
          authorization:
            artifact,

          preflight:
            pf,

          candidateSet,

          now:
            "2026-09-23T06:15:00.000Z"
        }),
      /exact_binding_mismatch/u
    );
  }
);

test(
  "R16 runner contains no signer private-key kernel mutation push or deploy machinery",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-value-comparison-pinned-trust-signature-verifier-day.js",
          import.meta.url
        ),
        "utf8"
      );

    const forbiddenPatterns = [
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
        `R16 runner must not match ${pattern}`
      );
    }
  }
);
