import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

import {
  inspectHistoricalPromotionSandbox,
  promoteHistoricalReleaseGuardedSandbox as underlyingPromote,
  recoverHistoricalReleaseGuardedSandbox
} from "./historical-release-promotion-adapter.js";

function promoteHistoricalReleaseGuardedSandbox(options) {
  if (!options?.simulateCrashAt) {
    return underlyingPromote(options);
  }

  const parentDir = options.parentDir;
  const crash = options.simulateCrashAt;
  const moduleUrl = new URL(
    "./historical-release-promotion-adapter.js",
    import.meta.url
  ).href;

  const childCode = [
    'import { inspectHistoricalPromotionSandbox,',
    'promoteHistoricalReleaseGuardedSandbox } from ' +
      JSON.stringify(moduleUrl) + ';',
    'const parentDir = process.argv[1];',
    'const crash = process.argv[2];',
    'const baseline = inspectHistoricalPromotionSandbox({ parentDir });',
    'const result = promoteHistoricalReleaseGuardedSandbox({',
    '  parentDir, expectedTargetInventory: baseline.before,',
    '  simulateCrashAt: crash',
    '});',
    'if (result.recoveryRequired !== true) process.exit(71);',
    'process.kill(process.pid, "SIGKILL");',
    'process.exit(72);'
  ].join("\n");

  const child = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", childCode, parentDir, crash],
    { encoding: "utf8", timeout: 15000, windowsHide: true }
  );

  if (child.error) throw child.error;
  if (child.status === 0 ||
      (!fs.existsSync(
        path.join(parentDir, ".historical-promotion-journal.json")
      ))) {
    throw Error("TEST_CHILD_TERMINATION_NOT_ESTABLISHED:" +
      (child.stderr || ""));
  }

  return {
    ok: false,
    simulatedCrash: true,
    recoveryRequired: true
  };
}

function setup() {
  const parentDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "aiml-v35-adapter-")
  );

  for (const name of ["target", "stage"]) {
    const dir = path.join(parentDir, name);
    fs.mkdirSync(path.join(dir, "details"), {
      recursive: true
    });

    const files = {
      "fixtures.json": '{"status":"PRE"}',
      "manifest.json": '{"hash":"original"}',
      "value.json": '{"frozen":true}',
      "value-audit.json": '{"frozen":true}',
      "plan-c-shadow.json": '{"frozen":true}',
      "plan-c-shadow-audit.json": '{"frozen":true}',
      "details/match.json": '{"status":"PRE"}'
    };

    for (const [file, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, file), content);
    }
  }

  fs.writeFileSync(
    path.join(parentDir, "stage", "fixtures.json"),
    '{"status":"FT"}'
  );
  fs.writeFileSync(
    path.join(parentDir, "stage", "manifest.json"),
    '{"hash":"updated"}'
  );
  fs.writeFileSync(
    path.join(parentDir, "stage", "details", "match.json"),
    '{"status":"FT"}'
  );

  return parentDir;
}

function runScenario(callback) {
  const parentDir = setup();

  try {
    return callback(parentDir);
  } finally {
    fs.rmSync(parentDir, {
      recursive: true,
      force: true
    });
  }
}

test("guarded promotion succeeds with pinned preimage", () =>
  runScenario(parentDir => {
    const inspected = inspectHistoricalPromotionSandbox({
      parentDir
    });

    const result = promoteHistoricalReleaseGuardedSandbox({
      parentDir,
      expectedTargetInventory: inspected.before
    });

    assert.equal(result.ok, true);
    assert.equal(result.sandboxOnly, true);
    assert.equal(result.changedFiles.length, 3);

    assert.equal(
      fs.readFileSync(
        path.join(parentDir, "target", "fixtures.json"),
        "utf8"
      ),
      '{"status":"FT"}'
    );

    assert.equal(
      fs.existsSync(
        path.join(parentDir, ".historical-promotion.lock")
      ),
      false
    );
  })
);

for (const crash of ["after_backup", "after_promote"]) {
  test("durable recovery restores exact preimage: " + crash, () =>
    runScenario(parentDir => {
      const inspected = inspectHistoricalPromotionSandbox({
        parentDir
      });

      const interrupted = promoteHistoricalReleaseGuardedSandbox({
        parentDir,
        expectedTargetInventory: inspected.before,
        simulateCrashAt: crash
      });

      assert.equal(interrupted.recoveryRequired, true);

      assert.throws(
        () => promoteHistoricalReleaseGuardedSandbox({
          parentDir,
          expectedTargetInventory: inspected.before
        }),
        /promotion_existing_transaction_requires_recovery/
      );

      const recovered = recoverHistoricalReleaseGuardedSandbox({
        parentDir
      });

      assert.equal(recovered.ok, true);
      assert.equal(recovered.restoredPreimage, true);

      const after = inspectHistoricalPromotionSandbox({
        parentDir
      });

      assert.deepEqual(after.before, inspected.before);
    })
  );
}

test("preimage drift is rejected before lock acquisition", () =>
  runScenario(parentDir => {
    const inspected = inspectHistoricalPromotionSandbox({
      parentDir
    });

    fs.writeFileSync(
      path.join(parentDir, "target", "fixtures.json"),
      "unauthorized drift"
    );

    assert.throws(
      () => promoteHistoricalReleaseGuardedSandbox({
        parentDir,
        expectedTargetInventory: inspected.before
      }),
      /promotion_preimage_drift/
    );
  })
);

test("tampered backup blocks recovery and preserves evidence", () =>
  runScenario(parentDir => {
    const inspected = inspectHistoricalPromotionSandbox({
      parentDir
    });

    promoteHistoricalReleaseGuardedSandbox({
      parentDir,
      expectedTargetInventory: inspected.before,
      simulateCrashAt: "after_backup"
    });

    const journal = JSON.parse(
      fs.readFileSync(
        path.join(
          parentDir,
          ".historical-promotion-journal.json"
        ),
        "utf8"
      )
    );

    fs.writeFileSync(
      path.join(
        parentDir,
        journal.backupName,
        "fixtures.json"
      ),
      "tampered"
    );

    assert.throws(
      () => recoverHistoricalReleaseGuardedSandbox({
        parentDir
      }),
      /promotion_recovery_backup_mismatch/
    );

    assert.equal(
      fs.existsSync(
        path.join(
          parentDir,
          ".historical-promotion-journal.json"
        )
      ),
      true
    );
  })
);

test("real repository is denied as promotion parent", () => {
  assert.throws(
    () => inspectHistoricalPromotionSandbox({
      parentDir: process.cwd()
    }),
    /promotion_production_path_denied/
  );
});
function exactDirectoryInventory(folder) {
  const output = new Map();

  function scan(dir, prefix = "") {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const name = prefix ? prefix + "/" + entry.name : entry.name;
      const file = path.join(dir, entry.name);

      if (entry.isSymbolicLink()) {
        throw Error("TEST_SYMLINK_FORBIDDEN");
      }
      if (entry.isDirectory()) {
        scan(file, name);
      } else if (entry.isFile()) {
        output.set(name, crypto.createHash("sha256")
          .update(fs.readFileSync(file)).digest("hex"));
      } else {
        throw Error("TEST_UNSUPPORTED_ENTRY");
      }
    }
  }

  scan(folder);
  return output;
}

for (const crash of ["after_commit", "after_cleanup"]) {
  test("durable recovery finalizes committed release: " + crash, () =>
    runScenario(parentDir => {
      const inspected = inspectHistoricalPromotionSandbox({
        parentDir
      });

      const interrupted = promoteHistoricalReleaseGuardedSandbox({
        parentDir,
        expectedTargetInventory: inspected.before,
        simulateCrashAt: crash
      });

      assert.equal(interrupted.simulatedCrash, true);
      assert.equal(interrupted.recoveryRequired, true);

      const journalFile = path.join(
        parentDir, ".historical-promotion-journal.json"
      );

      const journal = JSON.parse(
        fs.readFileSync(journalFile, "utf8")
      );

      assert.equal(journal.state, "COMMITTED");

      const recovered = recoverHistoricalReleaseGuardedSandbox({
        parentDir
      });

      assert.equal(recovered.ok, true);
      assert.equal(recovered.restoredPreimage, false);
      assert.equal(recovered.committedRelease, true);

      // Compare target bytes directly with the pinned staged postimage.
      // inspectHistoricalPromotionSandbox requires DIFFERING directories
      // and therefore is not appropriate after a committed promotion.
      assert.deepEqual(
        exactDirectoryInventory(path.join(parentDir, "target")),
        inspected.staged
      );

      assert.equal(fs.existsSync(journalFile), false);
      assert.equal(
        fs.existsSync(path.join(parentDir, ".historical-promotion.lock")),
        false
      );
    })
  );
}

test("committed recovery refuses a tampered postimage", () =>
  runScenario(parentDir => {
    const inspected = inspectHistoricalPromotionSandbox({
      parentDir
    });

    promoteHistoricalReleaseGuardedSandbox({
      parentDir,
      expectedTargetInventory: inspected.before,
      simulateCrashAt: "after_cleanup"
    });

    fs.writeFileSync(
      path.join(parentDir, "target", "fixtures.json"),
      "tampered"
    );

    assert.throws(
      () => recoverHistoricalReleaseGuardedSandbox({ parentDir }),
      /promotion_recovery_committed_postimage_invalid/
    );

    assert.equal(
      fs.existsSync(
        path.join(parentDir, ".historical-promotion-journal.json")
      ),
      true
    );
  })
);

test("committed journal without lock recovers safely", () =>
  runScenario(parentDir => {
    const inspected = inspectHistoricalPromotionSandbox({
      parentDir
    });

    const interrupted = promoteHistoricalReleaseGuardedSandbox({
      parentDir,
      expectedTargetInventory: inspected.before,
      simulateCrashAt: "after_unlock"
    });

    assert.equal(interrupted.recoveryRequired, true);

    const journalFile = path.join(
      parentDir, ".historical-promotion-journal.json"
    );
    const lockFile = path.join(
      parentDir, ".historical-promotion.lock"
    );

    assert.equal(fs.existsSync(journalFile), true);
    assert.equal(fs.existsSync(lockFile), false);

    const journal = JSON.parse(
      fs.readFileSync(journalFile, "utf8")
    );
    assert.equal(journal.state, "COMMITTED");

    const recovered = recoverHistoricalReleaseGuardedSandbox({
      parentDir
    });

    assert.equal(recovered.committedRelease, true);
    assert.equal(recovered.restoredPreimage, false);

    assert.deepEqual(
      exactDirectoryInventory(path.join(parentDir, "target")),
      inspected.staged
    );

    assert.equal(fs.existsSync(journalFile), false);
  })
);

test("prepared journal without lock fails closed", () =>
  runScenario(parentDir => {
    const inspected = inspectHistoricalPromotionSandbox({
      parentDir
    });

    promoteHistoricalReleaseGuardedSandbox({
      parentDir,
      expectedTargetInventory: inspected.before,
      simulateCrashAt: "after_backup"
    });

    const lockFile = path.join(
      parentDir, ".historical-promotion.lock"
    );
    const journalFile = path.join(
      parentDir, ".historical-promotion-journal.json"
    );

    fs.rmSync(lockFile);

    assert.throws(
      () => recoverHistoricalReleaseGuardedSandbox({
        parentDir
      }),
      /promotion_recovery_prepared_lock_missing/
    );

    assert.equal(fs.existsSync(journalFile), true);
  })
);

test("orphan lock without journal remains untouched", () =>
  runScenario(parentDir => {
    const lockFile = path.join(
      parentDir, ".historical-promotion.lock"
    );
    const journalFile = path.join(
      parentDir, ".historical-promotion-journal.json"
    );

    fs.writeFileSync(lockFile, "orphan");

    assert.throws(
      () => recoverHistoricalReleaseGuardedSandbox({
        parentDir
      }),
      /promotion_recovery_evidence_missing/
    );

    assert.equal(fs.existsSync(lockFile), true);
    assert.equal(fs.existsSync(journalFile), false);
  })
);

test("restored journal finalizes a verified preimage", () =>
  runScenario(parentDir => {
    const inspected = inspectHistoricalPromotionSandbox({
      parentDir
    });

    promoteHistoricalReleaseGuardedSandbox({
      parentDir,
      expectedTargetInventory: inspected.before,
      simulateCrashAt: "after_backup"
    });

    // Preserve the actual transaction owner before recovery
    // removes the original journal.
    const originalJournalFile = path.join(
      parentDir, ".historical-promotion-journal.json"
    );

    const originalTransaction = JSON.parse(
      fs.readFileSync(originalJournalFile, "utf8")
    );

    const originalOwner = originalTransaction.owner;

    assert.equal(
      Number.isSafeInteger(originalOwner?.pid),
      true
    );

    assert.match(
      originalOwner.token,
      /^[a-f0-9-]{36}$/u
    );

    const restored = recoverHistoricalReleaseGuardedSandbox({
      parentDir
    });

    assert.equal(restored.restoredPreimage, true);

    const journalFile = path.join(
      parentDir, ".historical-promotion-journal.json"
    );

    // Recreate only the terminal journal state in this sandbox.
    // The original preimage was already fully verified.
    fs.writeFileSync(journalFile, JSON.stringify({
      version: 1,
      state: "RESTORED",
      owner: originalOwner,
      targetName: "target",
      stageName: "stage",
      backupName: "rollback_test",
      before: [...inspected.before],
      after: [...inspected.staged]
    }));

    const finalized = recoverHistoricalReleaseGuardedSandbox({
      parentDir
    });

    assert.equal(finalized.restoredPreimage, true);
    assert.equal(finalized.committedRelease, false);

    assert.deepEqual(
      exactDirectoryInventory(path.join(parentDir, "target")),
      inspected.before
    );

    assert.equal(fs.existsSync(journalFile), false);
  })
);


test("post-unlock active owner is denied", () =>
  runScenario(parentDir => {
    const inspected = inspectHistoricalPromotionSandbox({
      parentDir
    });

    const interrupted = underlyingPromote({
      parentDir,
      expectedTargetInventory: inspected.before,
      simulateCrashAt: "after_unlock"
    });

    assert.equal(interrupted.recoveryRequired, true);

    const lock = path.join(
      parentDir, ".historical-promotion.lock"
    );
    const journal = path.join(
      parentDir, ".historical-promotion-journal.json"
    );
    const claim = path.join(
      parentDir, ".historical-recovery.claim"
    );

    assert.equal(fs.existsSync(lock), false);
    assert.equal(fs.existsSync(journal), true);

    const record = JSON.parse(
      fs.readFileSync(journal, "utf8")
    );

    assert.equal(record.state, "COMMITTED");
    assert.equal(record.owner.pid, process.pid);

    assert.throws(
      () => recoverHistoricalReleaseGuardedSandbox({
        parentDir
      }),
      /promotion_recovery_owner_still_alive/
    );

    assert.equal(fs.existsSync(journal), true);
    assert.equal(fs.existsSync(claim), false);
  })
);

test("post-unlock malformed journal owner fails closed", () =>
  runScenario(parentDir => {
    const inspected = inspectHistoricalPromotionSandbox({
      parentDir
    });

    underlyingPromote({
      parentDir,
      expectedTargetInventory: inspected.before,
      simulateCrashAt: "after_unlock"
    });

    const journal = path.join(
      parentDir, ".historical-promotion-journal.json"
    );
    const claim = path.join(
      parentDir, ".historical-recovery.claim"
    );

    const record = JSON.parse(
      fs.readFileSync(journal, "utf8")
    );

    record.owner = {
      pid: -1,
      token: "invalid"
    };

    fs.writeFileSync(
      journal,
      JSON.stringify(record, null, 2)
    );

    assert.throws(
      () => recoverHistoricalReleaseGuardedSandbox({
        parentDir
      }),
      /promotion_recovery_owner_binding_invalid/
    );

    assert.equal(fs.existsSync(journal), true);
    assert.equal(fs.existsSync(claim), false);
  })
);


test("linux owner identity is bound to the journal", () =>
  runScenario(parentDir => {
    if (process.platform !== "linux") return;

    const baseline = inspectHistoricalPromotionSandbox({
      parentDir
    });

    const interrupted = underlyingPromote({
      parentDir,
      expectedTargetInventory: baseline.before,
      simulateCrashAt: "after_unlock"
    });

    assert.equal(interrupted.recoveryRequired, true);

    const journalFile = path.join(
      parentDir, ".historical-promotion-journal.json"
    );

    const claimFile = path.join(
      parentDir, ".historical-recovery.claim"
    );

    const record = JSON.parse(
      fs.readFileSync(journalFile, "utf8")
    );

    assert.equal(
      record.owner.identity.kind,
      "linux_proc_start_v1"
    );
    assert.match(
      record.owner.identity.startTicks,
      /^[0-9]+$/u
    );

    record.owner.identity.startTicks =
      String(BigInt(record.owner.identity.startTicks) + 1n);

    fs.writeFileSync(
      journalFile,
      JSON.stringify(record, null, 2)
    );

    assert.throws(
      () => recoverHistoricalReleaseGuardedSandbox({
        parentDir
      }),
      /promotion_recovery_owner_still_alive|promotion_recovery_pid_identity_mismatch_hold/
    );

    assert.equal(fs.existsSync(journalFile), true);
    assert.equal(fs.existsSync(claimFile), false);
  })
);


test("linux boot ID mismatch denies recovery regardless of PID state", () =>
  runScenario(parentDir => {
    if (process.platform !== "linux") return;

    for (const mode of ["LIVE_OWNER", "ABSENT_PID"]) {
      const scenarioDir = path.join(
        parentDir, "bootid_" + mode.toLowerCase()
      );

      fs.mkdirSync(scenarioDir);

      for (const name of ["target", "stage"]) {
        const source = path.join(parentDir, name);
        const destination = path.join(scenarioDir, name);

        fs.cpSync(source, destination, { recursive: true });
      }

      const baseline = inspectHistoricalPromotionSandbox({
        parentDir: scenarioDir
      });

      const interrupted = underlyingPromote({
        parentDir: scenarioDir,
        expectedTargetInventory: baseline.before,
        simulateCrashAt: "after_unlock"
      });

      assert.equal(interrupted.recoveryRequired, true);

      const journalFile = path.join(
        scenarioDir, ".historical-promotion-journal.json"
      );

      const claimFile = path.join(
        scenarioDir, ".historical-recovery.claim"
      );

      const record = JSON.parse(
        fs.readFileSync(journalFile, "utf8")
      );

      assert.equal(record.state, "COMMITTED");
      assert.equal(
        record.owner.identity.kind,
        "linux_proc_start_v1"
      );

      const currentBoot = fs.readFileSync(
        "/proc/sys/kernel/random/boot_id", "utf8"
      ).trim().toLowerCase();

      assert.equal(record.owner.identity.bootId, currentBoot);

      const alteredBoot = currentBoot ===
        "00000000-0000-4000-8000-000000000001"
          ? "00000000-0000-4000-8000-000000000002"
          : "00000000-0000-4000-8000-000000000001";

      record.owner.identity.bootId = alteredBoot;

      if (mode === "ABSENT_PID") {
        // Linux PID maximum is below this valid integer.
        // The no-lock journal represents an absent owner PID.
        record.owner.pid = 99999999;
      }

      fs.writeFileSync(
        journalFile,
        JSON.stringify(record, null, 2)
      );

      assert.throws(
        () => recoverHistoricalReleaseGuardedSandbox({
          parentDir: scenarioDir
        }),
        /promotion_recovery_boot_id_mismatch_hold/
      );

      assert.equal(fs.existsSync(journalFile), true);
      assert.equal(fs.existsSync(claimFile), false);
    }
  })
);

test("linux missing journal boot identity denies recovery", () =>
  runScenario(parentDir => {
    if (process.platform !== "linux") return;

    const baseline = inspectHistoricalPromotionSandbox({
      parentDir
    });

    const interrupted = underlyingPromote({
      parentDir,
      expectedTargetInventory: baseline.before,
      simulateCrashAt: "after_unlock"
    });

    assert.equal(interrupted.recoveryRequired, true);

    const journalFile = path.join(
      parentDir, ".historical-promotion-journal.json"
    );

    const claimFile = path.join(
      parentDir, ".historical-recovery.claim"
    );

    const record = JSON.parse(
      fs.readFileSync(journalFile, "utf8")
    );

    delete record.owner.identity.bootId;

    fs.writeFileSync(
      journalFile,
      JSON.stringify(record, null, 2)
    );

    assert.throws(
      () => recoverHistoricalReleaseGuardedSandbox({
        parentDir
      }),
      /promotion_recovery_linux_identity_binding_invalid/
    );

    assert.equal(fs.existsSync(journalFile), true);
    assert.equal(fs.existsSync(claimFile), false);
  })
);
