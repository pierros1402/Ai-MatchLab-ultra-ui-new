import {
  createPublicKey,
  verify as verifySignature
} from "node:crypto";

import {
  AUTONOMOUS_REPAIR_AUTHORIZATION_TRUSTED_PUBLIC_KEYS,
  publicKeySpkiSha256,
  resolveAutonomousRepairTrustedPublicKey,
  validateAutonomousRepairTrustedPublicKeyRecord
} from "./autonomous-repair-authorization-trusted-public-keys.js";

import {
  checkpointAwareValueComparisonAuthorizationSigningBytes,
  validateCheckpointAwareValueComparisonAuthorizationBinding
} from "./checkpoint-aware-targeted-value-comparison-authorization-validator-binding.js";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_PINNED_TRUST_VERIFICATION_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-pinned-trust-signature-verification.v1";

const CANONICAL_UTC =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function canonicalUtcMillis(value) {
  const text =
    clean(
      value
    );

  if (
    !CANONICAL_UTC.test(
      text
    )
  ) {
    return null;
  }

  const millis =
    Date.parse(
      text
    );

  if (
    !Number.isFinite(
      millis
    ) ||
    new Date(
      millis
    )
      .toISOString() !==
        text
  ) {
    return null;
  }

  return millis;
}

function canonicalBase64(value) {
  const text =
    clean(
      value
    );

  if (
    !text ||
    text.length % 4 !==
      0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/u.test(
      text
    )
  ) {
    return false;
  }

  const bytes =
    Buffer.from(
      text,
      "base64"
    );

  return (
    bytes.length >
      0 &&
    bytes
      .toString(
        "base64"
      ) ===
        text
  );
}

export function verifyCheckpointAwareValueComparisonEd25519Bytes({
  messageBytes,
  publicKeyPem,
  signatureBase64
} = {}) {
  if (
    !Buffer.isBuffer(
      messageBytes
    ) ||
    !clean(
      publicKeyPem
    ) ||
    !canonicalBase64(
      signatureBase64
    )
  ) {
    throw new Error(
      "value_comparison_ed25519_verification_input_invalid"
    );
  }

  return verifySignature(
    null,
    messageBytes,
    createPublicKey(
      publicKeyPem
    ),
    Buffer.from(
      signatureBase64,
      "base64"
    )
  );
}

export function inspectCheckpointAwareValueComparisonPinnedTrustRegistry() {
  const records =
    AUTONOMOUS_REPAIR_AUTHORIZATION_TRUSTED_PUBLIC_KEYS
      .map(
        record => {
          validateAutonomousRepairTrustedPublicKeyRecord(
            record
          );

          return {
            issuerId:
              record.issuerId,

            keyId:
              record.keyId,

            publicKeySpkiSha256:
              record.publicKeySpkiSha256,

            computedPublicKeySpkiSha256:
              publicKeySpkiSha256(
                record.publicKeyPem
              ),

            recordValid:
              true,

            privateKeyMaterialPresent:
              false
          };
        }
      );

  return {
    schema:
      "ai-matchlab.checkpoint-aware-value-comparison-pinned-trust-registry-inspection.v1",

    readOnly:
      true,

    recordCount:
      records.length,

    allRecordsValid:
      records.length >
        0 &&
      records.every(
        record =>
          record.recordValid ===
            true &&
          record.publicKeySpkiSha256 ===
            record.computedPublicKeySpkiSha256 &&
          record.privateKeyMaterialPresent ===
            false
      ),

    records
  };
}

export function verifyCheckpointAwareValueComparisonAuthorizationAgainstPinnedTrust({
  authorization,
  preflight,
  candidateSet,
  now
} = {}) {
  const binding =
    validateCheckpointAwareValueComparisonAuthorizationBinding({
      authorization,
      preflight,
      candidateSet
    });

  const trustedKey =
    resolveAutonomousRepairTrustedPublicKey({
      issuerId:
        authorization
          ?.signature
          ?.issuerId,

      keyId:
        authorization
          ?.signature
          ?.keyId
    });

  if (!trustedKey) {
    throw new Error(
      "value_comparison_authorization_pinned_trust_key_not_found"
    );
  }

  validateAutonomousRepairTrustedPublicKeyRecord(
    trustedKey
  );

  const computedSpki =
    publicKeySpkiSha256(
      trustedKey.publicKeyPem
    );

  if (
    authorization.signature.publicKeySpkiSha256 !==
      trustedKey.publicKeySpkiSha256 ||
    authorization.signature.publicKeySpkiSha256 !==
      computedSpki
  ) {
    throw new Error(
      "value_comparison_authorization_pinned_trust_spki_mismatch"
    );
  }

  const nowText =
    now instanceof Date
      ? now.toISOString()
      : clean(
          now
        );

  const nowMillis =
    canonicalUtcMillis(
      nowText
    );

  const notBefore =
    canonicalUtcMillis(
      authorization.notBefore
    );

  const expiresAt =
    canonicalUtcMillis(
      authorization.expiresAt
    );

  if (
    nowMillis ===
      null ||
    notBefore ===
      null ||
    expiresAt ===
      null
  ) {
    throw new Error(
      "value_comparison_authorization_pinned_trust_time_invalid"
    );
  }

  if (
    nowMillis <
      notBefore ||
    nowMillis >=
      expiresAt
  ) {
    throw new Error(
      "value_comparison_authorization_pinned_trust_not_current"
    );
  }

  const verified =
    verifyCheckpointAwareValueComparisonEd25519Bytes({
      messageBytes:
        checkpointAwareValueComparisonAuthorizationSigningBytes(
          authorization
        ),

      publicKeyPem:
        trustedKey.publicKeyPem,

      signatureBase64:
        authorization.signature.value
    });

  if (!verified) {
    throw new Error(
      "value_comparison_authorization_signature_invalid"
    );
  }

  return {
    schema:
      CHECKPOINT_AWARE_VALUE_COMPARISON_PINNED_TRUST_VERIFICATION_SCHEMA,

    validationState:
      "SIGNATURE_AND_PINNED_TRUST_VERIFIED_READ_ONLY",

    ok:
      true,

    dayKey:
      authorization.dayKey,

    operationCount:
      authorization.operationScope.length,

    authorizationFingerprint:
      authorization.authorizationFingerprint,

    candidateSetFingerprint:
      candidateSet.candidateSetFingerprint,

    mutationPreflightFingerprint:
      preflight.preflightFingerprint,

    pinnedTrust: {
      issuerId:
        trustedKey.issuerId,

      keyId:
        trustedKey.keyId,

      publicKeySpkiSha256:
        trustedKey.publicKeySpkiSha256,

      recordValidated:
        true,

      spkiRecomputed:
        true,

      callerSuppliedTrustUsed:
        false
    },

    signature: {
      algorithm:
        "Ed25519",

      cryptographicallyVerified:
        true,

      pinnedTrustVerified:
        true,

      verificationTime:
        nowText
    },

    sourceBinding: {
      structureAndBindingsValidated:
        binding.ok ===
          true,

      authorizationToPreflightExact:
        true,

      authorizationToCandidateSetExact:
        true
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
}
