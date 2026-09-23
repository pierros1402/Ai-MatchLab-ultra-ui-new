import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  AUTONOMOUS_REPAIR_AUTHORIZATION_TRUSTED_PUBLIC_KEYS
} from "../core/autonomous-repair-authorization-trusted-public-keys.js";

import {
  checkpointAwareValueComparisonAuthorizationFingerprint
} from "../core/checkpoint-aware-targeted-value-comparison-authorization-validator-binding.js";

import {
  buildCheckpointAwareValueComparisonExternalAuthorizationIngressReadinessContract,
  buildCheckpointAwareValueComparisonProductionConfiguration,
  checkpointAwareValueComparisonIngressReadinessFingerprint,
  readCheckpointAwareValueComparisonExternallySignedAuthorization
} from "../core/checkpoint-aware-targeted-value-comparison-external-authorization-ingress-production-configuration.js";

const DAY =
  "2026-09-23";

const HEAD =
  "8".repeat(40);

function sourceR20() {
  return {
    mode:
      "DISABLED_PRODUCTION_ADAPTER_READINESS_CONTRACT",

    dayKey:
      DAY,

    remoteHead:
      HEAD,

    contract: {
      currentState: {
        productionReadinessState:
          "DISABLED_PREREQUISITES_INCOMPLETE"
      },

      blockerCount:
        4,

      requiredNextGate: {
        name:
          "DEDICATED_VALUE_COMPARISON_EXTERNAL_AUTHORIZATION_INGRESS_AND_PRODUCTION_CONFIGURATION_CONTRACT_READ_ONLY"
      },

      authority: {
        productionAdapterEnabled:
          false,

        authorizationIngressAuthorized:
          false,

        authorizationArtifactCreationAuthorized:
          false,

        signerUseAuthorized:
          false,

        privateKeyReadAuthorized:
          false,

        productionKernelInvocationAuthorized:
          false,

        repairExecutionAuthorized:
          false
      }
    },

    safety: {
      repositoryWritePerformed:
        false,

      productionKernelEnabled:
        false
    }
  };
}

function tempRoots(
  label
) {
  const base =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        `aiml-r21-${label}-`
      )
    );

  const projectRoot =
    path.join(
      base,
      "project"
    );

  const authorizationIngressRoot =
    path.join(
      base,
      "authorization-inbox"
    );

  const externalStateRoot =
    path.join(
      base,
      "external-state"
    );

  fs.mkdirSync(
    projectRoot
  );

  fs.mkdirSync(
    authorizationIngressRoot
  );

  fs.mkdirSync(
    externalStateRoot
  );

  return {
    base,
    projectRoot,
    authorizationIngressRoot,
    externalStateRoot
  };
}

function cleanup(
  roots
) {
  fs.rmSync(
    roots.base,
    {
      recursive:
        true,
      force:
        true
    }
  );
}

function signedEnvelope() {
  const trusted =
    AUTONOMOUS_REPAIR_AUTHORIZATION_TRUSTED_PUBLIC_KEYS[0];

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
        "3".repeat(64),

      executorContractFingerprint:
        "4".repeat(64),

      mutationPreflightFingerprint:
        "5".repeat(64),

      candidateSetFingerprint:
        "6".repeat(64)
    },

    operationScope: [
      {
        operationId:
          "vcrop_v1_" +
          "7".repeat(24),

        targetPath:
          `data/value-comparison/${DAY}.json`,

        preimageSha256:
          "a".repeat(64),

        preimageBytes:
          100,

        postimageSha256:
          "b".repeat(64),

        postimageBytes:
          120
      }
    ],

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
        trusted.issuerId,

      keyId:
        trusted.keyId,

      publicKeySpkiSha256:
        trusted.publicKeySpkiSha256,

      value:
        Buffer.from(
          "already-signed-envelope-placeholder",
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

test(
  "R20 healthy state advances to implemented read-only ingress but remains configuration-unbound and disabled",
  () => {
    const contract =
      buildCheckpointAwareValueComparisonExternalAuthorizationIngressReadinessContract({
        dayKey:
          DAY,

        remoteHead:
          HEAD,

        sourceR20:
          sourceR20(),

        productionConfiguration:
          null
      });

    assert.equal(
      contract.state,
      "INGRESS_IMPLEMENTED_CONFIGURATION_NOT_BOUND_DISABLED"
    );

    assert.equal(
      contract.implementation.externalSignedAuthorizationIngressReadOnlyImplemented,
      true
    );

    assert.deepEqual(
      contract.blockers.map(
        row =>
          row.code
      ),
      [
        "PRODUCTION_CONFIGURATION_NOT_BOUND",
        "DEDICATED_PRODUCTION_EXTERNAL_STATE_ADAPTER_NOT_IMPLEMENTED",
        "DEDICATED_PRODUCTION_KERNEL_ADAPTER_NOT_IMPLEMENTED",
        "END_TO_END_PRODUCTION_ORCHESTRATOR_NOT_IMPLEMENTED"
      ]
    );

    assert.equal(
      contract.authority.productionAdapterEnabled,
      false
    );
  }
);

test(
  "production configuration validates disjoint external roots with repository-pinned public trust only",
  () => {
    const roots =
      tempRoots(
        "config"
      );

    try {
      const config =
        buildCheckpointAwareValueComparisonProductionConfiguration({
          projectRoot:
            roots.projectRoot,

          authorizationIngressRoot:
            roots.authorizationIngressRoot,

          externalStateRoot:
            roots.externalStateRoot
        });

      assert.equal(
        config.state,
        "CONFIGURATION_VALIDATED_PRODUCTION_DISABLED"
      );

      assert.equal(
        config.pinnedTrust.recordCount >=
          1,
        true
      );

      assert.equal(
        config.pinnedTrust.callerSuppliedTrustForbidden,
        true
      );

      assert.equal(
        config.authority.privateKeyReadAuthorized,
        false
      );
    }
    finally {
      cleanup(
        roots
      );
    }
  }
);

test(
  "production configuration rejects roots inside the project or overlapping each other",
  () => {
    const roots =
      tempRoots(
        "containment"
      );

    const insideProject =
      path.join(
        roots.projectRoot,
        "inside"
      );

    fs.mkdirSync(
      insideProject
    );

    try {
      assert.throws(
        () =>
          buildCheckpointAwareValueComparisonProductionConfiguration({
            projectRoot:
              roots.projectRoot,

            authorizationIngressRoot:
              insideProject,

            externalStateRoot:
              roots.externalStateRoot
          }),
        /roots_not_disjoint/u
      );

      assert.throws(
        () =>
          buildCheckpointAwareValueComparisonProductionConfiguration({
            projectRoot:
              roots.projectRoot,

            authorizationIngressRoot:
              roots.authorizationIngressRoot,

            externalStateRoot:
              roots.authorizationIngressRoot
          }),
        /roots_not_disjoint/u
      );
    }
    finally {
      cleanup(
        roots
      );
    }
  }
);

test(
  "read-only configuration contract refuses production-adapter enablement",
  () => {
    const roots =
      tempRoots(
        "enabled"
      );

    try {
      assert.throws(
        () =>
          buildCheckpointAwareValueComparisonProductionConfiguration({
            projectRoot:
              roots.projectRoot,

            authorizationIngressRoot:
              roots.authorizationIngressRoot,

            externalStateRoot:
              roots.externalStateRoot,

            productionAdapterEnabled:
              true
          }),
        /must_remain_disabled/u
      );
    }
    finally {
      cleanup(
        roots
      );
    }
  }
);

test(
  "external ingress reads an already-signed dedicated authorization envelope without moving deleting or granting authority",
  () => {
    const roots =
      tempRoots(
        "ingress"
      );

    try {
      const config =
        buildCheckpointAwareValueComparisonProductionConfiguration({
          projectRoot:
            roots.projectRoot,

          authorizationIngressRoot:
            roots.authorizationIngressRoot,

          externalStateRoot:
            roots.externalStateRoot
        });

      const file =
        path.join(
          roots.authorizationIngressRoot,
          "authorization.json"
        );

      fs.writeFileSync(
        file,
        `${JSON.stringify(
          signedEnvelope(),
          null,
          2
        )}\n`,
        "utf8"
      );

      const before =
        fs.readFileSync(
          file
        );

      const result =
        readCheckpointAwareValueComparisonExternallySignedAuthorization({
          authorizationFile:
            file,

          productionConfiguration:
            config
        });

      const after =
        fs.readFileSync(
          file
        );

      assert.equal(
        before.equals(
          after
        ),
        true
      );

      assert.equal(
        result.artifact.signature.envelopeStructurallyValid,
        true
      );

      assert.equal(
        result.artifact.signature.pinnedTrustIdentityMatched,
        true
      );

      assert.equal(
        result.artifact.signature.cryptographicallyVerified,
        false
      );

      assert.equal(
        result.artifact.authority.fileMoved,
        false
      );

      assert.equal(
        result.artifact.authority.fileDeleted,
        false
      );

      assert.equal(
        result.artifact.authority.authorizationGranted,
        false
      );
    }
    finally {
      cleanup(
        roots
      );
    }
  }
);

test(
  "external ingress rejects a file outside the configured authorization inbox",
  () => {
    const roots =
      tempRoots(
        "outside"
      );

    try {
      const config =
        buildCheckpointAwareValueComparisonProductionConfiguration({
          projectRoot:
            roots.projectRoot,

          authorizationIngressRoot:
            roots.authorizationIngressRoot,

          externalStateRoot:
            roots.externalStateRoot
        });

      const file =
        path.join(
          roots.base,
          "outside.json"
        );

      fs.writeFileSync(
        file,
        `${JSON.stringify(
          signedEnvelope()
        )}\n`,
        "utf8"
      );

      assert.throws(
        () =>
          readCheckpointAwareValueComparisonExternallySignedAuthorization({
            authorizationFile:
              file,

            productionConfiguration:
              config
          }),
        /containment_invalid/u
      );
    }
    finally {
      cleanup(
        roots
      );
    }
  }
);

test(
  "external ingress rejects an authorization envelope that does not match pinned trust identity",
  () => {
    const roots =
      tempRoots(
        "trust"
      );

    try {
      const config =
        buildCheckpointAwareValueComparisonProductionConfiguration({
          projectRoot:
            roots.projectRoot,

          authorizationIngressRoot:
            roots.authorizationIngressRoot,

          externalStateRoot:
            roots.externalStateRoot
        });

      const artifact =
        signedEnvelope();

      artifact.signature.keyId =
        "arkey_v1_unknown";

      const file =
        path.join(
          roots.authorizationIngressRoot,
          "authorization.json"
        );

      fs.writeFileSync(
        file,
        `${JSON.stringify(
          artifact,
          null,
          2
        )}\n`,
        "utf8"
      );

      assert.throws(
        () =>
          readCheckpointAwareValueComparisonExternallySignedAuthorization({
            authorizationFile:
              file,

            productionConfiguration:
              config
          }),
        /pinned_trust_identity_mismatch/u
      );
    }
    finally {
      cleanup(
        roots
      );
    }
  }
);

test(
  "ingress readiness fingerprint is deterministic and points only to the production external-state adapter configuration gate",
  () => {
    const first =
      buildCheckpointAwareValueComparisonExternalAuthorizationIngressReadinessContract({
        dayKey:
          DAY,

        remoteHead:
          HEAD,

        sourceR20:
          sourceR20()
      });

    const second =
      buildCheckpointAwareValueComparisonExternalAuthorizationIngressReadinessContract({
        dayKey:
          DAY,

        remoteHead:
          HEAD,

        sourceR20:
          sourceR20()
      });

    assert.equal(
      first.readinessFingerprint,
      second.readinessFingerprint
    );

    assert.equal(
      first.readinessFingerprint,
      checkpointAwareValueComparisonIngressReadinessFingerprint(
        first
      )
    );

    assert.equal(
      first.requiredNextGate.name,
      "DEDICATED_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_ADAPTER_CONFIGURATION_CONTRACT_READ_ONLY"
    );
  }
);

test(
  "R21 observation runner contains no signer private-key file writer replay consumption kernel invocation push or deploy machinery",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-value-comparison-external-authorization-ingress-production-configuration-day.js",
          import.meta.url
        ),
        "utf8"
      );

    const forbiddenPatterns = [
      /\bconsumeOnceAtomically\s*\(/u,
      /\bcreatePrivateKey\b/u,
      /\bprivateKey(?:Pem|Path)?\s*[:=]/u,
      /\bsign\s*\(/u,
      /\bwriteFileSync\b/u,
      /\brenameSync\b/u,
      /\bunlinkSync\b/u,
      /\bexecuteAutonomousRepairProductionExecution\s*\(/u,
      /\bexecuteAutonomousRepairFilesystemTransaction\s*\(/u,
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
        `R21 runner must not match ${pattern}`
      );
    }
  }
);
