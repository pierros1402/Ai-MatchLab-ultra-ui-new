import {
  createHash,
  createPublicKey
} from "node:crypto";

export const AUTONOMOUS_REPAIR_AUTHORIZATION_TRUSTED_PUBLIC_KEYS =
  Object.freeze([]);

const VALID_KEY_ID =
  /^arkey_v1_[a-z0-9][a-z0-9._-]{0,63}$/u;

const VALID_SHA =
  /^[0-9a-f]{64}$/u;

function clean(value) {
  return String(value ?? "").trim();
}

export function publicKeySpkiSha256(
  publicKey
) {
  const keyObject =
    createPublicKey(publicKey);

  const der =
    keyObject.export({
      type: "spki",
      format: "der"
    });

  return createHash("sha256")
    .update(der)
    .digest("hex");
}

export function validateAutonomousRepairTrustedPublicKeyRecord(
  record
) {
  if (
    !record ||
    typeof record !== "object" ||
    Array.isArray(record)
  ) {
    throw new Error(
      "autonomous_repair_authorization_trusted_key_record_invalid"
    );
  }

  const keys =
    Object.keys(record).sort();

  const expected =
    [
      "issuerId",
      "keyId",
      "publicKeyPem",
      "publicKeySpkiSha256"
    ].sort();

  if (
    keys.length !== expected.length ||
    !keys.every(
      (key, index) =>
        key === expected[index]
    ) ||
    !clean(record.issuerId) ||
    !VALID_KEY_ID.test(
      clean(record.keyId)
    ) ||
    !clean(record.publicKeyPem) ||
    !VALID_SHA.test(
      clean(record.publicKeySpkiSha256)
    )
  ) {
    throw new Error(
      "autonomous_repair_authorization_trusted_key_record_invalid"
    );
  }

  if (
    publicKeySpkiSha256(
      record.publicKeyPem
    ) !==
      record.publicKeySpkiSha256
  ) {
    throw new Error(
      "autonomous_repair_authorization_trusted_key_spki_mismatch"
    );
  }

  return true;
}

export function resolveAutonomousRepairTrustedPublicKey({
  issuerId,
  keyId
} = {}) {
  const issuer =
    clean(issuerId);

  const key =
    clean(keyId);

  if (!issuer || !key) {
    return null;
  }

  const matches =
    AUTONOMOUS_REPAIR_AUTHORIZATION_TRUSTED_PUBLIC_KEYS
      .filter(
        row =>
          row.issuerId === issuer &&
          row.keyId === key
      );

  if (matches.length !== 1) {
    return null;
  }

  validateAutonomousRepairTrustedPublicKeyRecord(
    matches[0]
  );

  return matches[0];
}
