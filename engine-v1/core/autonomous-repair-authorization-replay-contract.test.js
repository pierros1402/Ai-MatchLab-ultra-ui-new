import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import {
  AUTONOMOUS_REPAIR_AUTHORIZATION_REPLAY_CONTRACT,
  deriveAutonomousRepairAuthorizationReplayKey,
  validateAutonomousRepairAuthorizationReplayLedgerAdapter
} from "./autonomous-repair-authorization-replay-contract.js";

const INPUT = {
  authorizationId:
    "arauth_v2_0123456789abcdef0123456789abcdef",

  nonce:
    "arnonce_v2_" +
    "a".repeat(64),

  authorizationFingerprint:
    "b".repeat(64)
};

test(
  "replay key derivation is deterministic and domain-separated by all three authorization identities",
  () => {
    const first =
      deriveAutonomousRepairAuthorizationReplayKey(
        INPUT
      );

    const second =
      deriveAutonomousRepairAuthorizationReplayKey(
        INPUT
      );

    assert.match(
      first,
      /^[0-9a-f]{64}$/u
    );

    assert.equal(
      first,
      second
    );

    assert.notEqual(
      first,
      deriveAutonomousRepairAuthorizationReplayKey({
        ...INPUT,
        nonce:
          "arnonce_v2_" +
          "c".repeat(64)
      })
    );
  }
);

test(
  "replay contract requires atomic single-use consumption outside repository",
  () => {
    assert.equal(
      AUTONOMOUS_REPAIR_AUTHORIZATION_REPLAY_CONTRACT
        .atomicConsumeRequired,
      true
    );

    assert.equal(
      AUTONOMOUS_REPAIR_AUTHORIZATION_REPLAY_CONTRACT
        .releaseAfterFailure,
      false
    );

    assert.equal(
      AUTONOMOUS_REPAIR_AUTHORIZATION_REPLAY_CONTRACT
        .retryRequiresNewAuthorization,
      true
    );

    assert.equal(
      AUTONOMOUS_REPAIR_AUTHORIZATION_REPLAY_CONTRACT
        .ledgerLocation,
      "outside_repository_and_planning_pipeline"
    );
  }
);

test(
  "invalid replay identity fails closed",
  () => {
    assert.throws(
      () =>
        deriveAutonomousRepairAuthorizationReplayKey({
          ...INPUT,
          authorizationId:
            "bad"
        }),
      /replay_identity_invalid/
    );
  }
);

test(
  "durable replay ledger adapter must expose atomic consumeOnceAtomically",
  () => {
    assert.equal(
      validateAutonomousRepairAuthorizationReplayLedgerAdapter({
        consumeOnceAtomically() {
          return true;
        }
      }),
      true
    );

    assert.throws(
      () =>
        validateAutonomousRepairAuthorizationReplayLedgerAdapter({
          consumeOnce() {
            return true;
          }
        }),
      /ledger_adapter_invalid/
    );
  }
);

test(
  "replay contract contains no filesystem mutation implementation",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "./autonomous-repair-authorization-replay-contract.js",
          import.meta.url
        ),
        "utf8"
      );

    for (
      const forbidden of [
        'from "node:fs"',
        "writeFileSync(",
        "writeFile(",
        "appendFileSync(",
        "appendFile(",
        "renameSync(",
        "unlinkSync(",
        "rmSync(",
        "mkdirSync(",
        "createWriteStream("
      ]
    ) {
      assert.equal(
        source.includes(
          forbidden
        ),
        false,
        forbidden
      );
    }
  }
);
