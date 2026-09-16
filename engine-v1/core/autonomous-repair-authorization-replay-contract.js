import {
  createHash
} from "node:crypto";

const VALID_AUTHORIZATION_ID =
  /^arauth_v2_[0-9a-f]{32}$/u;

const VALID_NONCE =
  /^arnonce_v2_[0-9a-f]{64}$/u;

const VALID_SHA =
  /^[0-9a-f]{64}$/u;

function clean(value) {
  return String(value ?? "").trim();
}

export const AUTONOMOUS_REPAIR_AUTHORIZATION_REPLAY_CONTRACT =
  Object.freeze({
    version:
      "1.0.0",

    ledgerLocation:
      "outside_repository_and_planning_pipeline",

    atomicConsumeRequired:
      true,

    releaseAfterFailure:
      false,

    retryRequiresNewAuthorization:
      true
  });

export function deriveAutonomousRepairAuthorizationReplayKey({
  authorizationId,
  nonce,
  authorizationFingerprint
} = {}) {
  const id =
    clean(authorizationId);

  const token =
    clean(nonce);

  const fingerprint =
    clean(authorizationFingerprint);

  if (
    !VALID_AUTHORIZATION_ID.test(id) ||
    !VALID_NONCE.test(token) ||
    !VALID_SHA.test(fingerprint)
  ) {
    throw new Error(
      "autonomous_repair_authorization_replay_identity_invalid"
    );
  }

  return createHash("sha256")
    .update(
      [
        id,
        token,
        fingerprint
      ].join("\u0000")
    )
    .digest("hex");
}

export function validateAutonomousRepairAuthorizationReplayLedgerAdapter(
  adapter
) {
  if (
    !adapter ||
    typeof adapter !== "object" ||
    Array.isArray(adapter) ||
    typeof adapter.consumeOnceAtomically !==
      "function"
  ) {
    throw new Error(
      "autonomous_repair_authorization_replay_ledger_adapter_invalid"
    );
  }

  return true;
}
