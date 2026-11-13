import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

import {
  inspectHistoricalPromotionSandbox,
  promoteHistoricalReleaseGuardedSandbox,
  recoverHistoricalReleaseGuardedSandbox
} from "./historical-release-promotion-adapter.js";

const sha = file => crypto
  .createHash("sha256")
  .update(fs.readFileSync(file))
  .digest("hex");

function inventory(folder) {
  const result = new Map();

  function scan(dir, prefix = "") {
    for (const entry of fs.readdirSync(dir, {
      withFileTypes: true
    })) {
      const relative = prefix
        ? prefix + "/" + entry.name
        : entry.name;

      const absolute = path.join(dir, entry.name);

      if (entry.isSymbolicLink()) {
        throw Error("TEST_SYMLINK_FORBIDDEN");
      }

      if (entry.isDirectory()) {
        scan(absolute, relative);
      } else if (entry.isFile()) {
        result.set(relative, sha(absolute));
      } else {
        throw Error("TEST_UNSUPPORTED_ENTRY");
      }
    }
  }

  scan(folder);
  return result;
}

function createScenario() {
  const parentDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "aiml-v35-process-")
  );

  for (const name of ["target", "stage"]) {
    const root = path.join(parentDir, name);

    fs.mkdirSync(path.join(root, "details"), {
      recursive: true
    });

    const status = name === "target" ? "PRE" : "FT";

    const payload = {
      "fixtures.json": JSON.stringify({
        fixtures: [{ canonicalId: "match", status }]
      }),
      "manifest.json": JSON.stringify({
        status,
        hash: name === "target" ? "original" : "updated"
      }),
      "value.json": '{"immutable":true}',
      "value-audit.json": '{"immutable":true}',
      "plan-c-shadow.json": '{"immutable":true}',
      "plan-c-shadow-audit.json": '{"immutable":true}',
      "details/match.json": JSON.stringify({ status })
    };

    for (const [file, content] of Object.entries(payload)) {
      fs.writeFileSync(path.join(root, file), content);
    }
  }

  return parentDir;
}

const adapterUrl = new URL(
  "./historical-release-promotion-adapter.js",
  import.meta.url
).href;

const childSource = `
import {
  inspectHistoricalPromotionSandbox,
  promoteHistoricalReleaseGuardedSandbox
} from ${JSON.stringify(adapterUrl)};

const parentDir = process.argv[1];
const crash = process.argv[2];

const inspected = inspectHistoricalPromotionSandbox({
  parentDir
});

const result = promoteHistoricalReleaseGuardedSandbox({
  parentDir,
  expectedTargetInventory: inspected.before,
  simulateCrashAt: crash
});

if (result.simulatedCrash !== true ||
    result.recoveryRequired !== true) {
  process.exit(71);
}

// Terminate the actual child OS process, not just the
// transaction function. No cleanup handler is invoked.
process.kill(process.pid, "SIGKILL");

// This point must never be reached.
process.exit(72);
`;

const scenarios = [
  {
    crash: "after_backup",
    expectedState: "PREPARED",
    committed: false
  },
  {
    crash: "after_promote",
    expectedState: "PREPARED",
    committed: false
  },
  {
    crash: "after_commit",
    expectedState: "COMMITTED",
    committed: true
  },
  {
    crash: "after_cleanup",
    expectedState: "COMMITTED",
    committed: true
  },
  {
    crash: "after_unlock",
    expectedState: "COMMITTED",
    committed: true
  }
];

for (const scenario of scenarios) {
  test(
    "real child-process termination: " + scenario.crash,
    () => {
      const parentDir = createScenario();

      try {
        const target = path.join(parentDir, "target");
        const lock = path.join(
          parentDir, ".historical-promotion.lock"
        );
        const journalFile = path.join(
          parentDir, ".historical-promotion-journal.json"
        );

        const before = inventory(target);
        const expectedStage = inventory(
          path.join(parentDir, "stage")
        );

        const child = spawnSync(
          process.execPath,
          [
            "--input-type=module",
            "-e",
            childSource,
            parentDir,
            scenario.crash
          ],
          {
            encoding: "utf8",
            timeout: 15000,
            windowsHide: true
          }
        );

        if (child.error) {
          throw child.error;
        }

        assert.notEqual(
          child.status,
          0,
          "child must not exit successfully"
        );

        assert.ok(
          child.signal !== null ||
          child.status !== null,
          "child termination must be observable"
        );

        assert.equal(
          fs.existsSync(journalFile),
          true,
          "transaction journal must survive process termination"
        );

        const journal = JSON.parse(
          fs.readFileSync(journalFile, "utf8")
        );

        assert.equal(
          journal.state,
          scenario.expectedState
        );

        // No new transaction may start while the
        // interrupted transaction remains unresolved.
        assert.throws(
          () => promoteHistoricalReleaseGuardedSandbox({
            parentDir,
            expectedTargetInventory: before
          }),
          /promotion_existing_transaction_requires_recovery/
        );

        if (scenario.crash === "after_unlock") {
          assert.equal(fs.existsSync(lock), false);
        } else {
          assert.equal(fs.existsSync(lock), true);
        }

        const recovered =
          recoverHistoricalReleaseGuardedSandbox({
            parentDir
          });

        assert.equal(recovered.ok, true);
        assert.equal(recovered.sandboxOnly, true);

        if (scenario.committed) {
          assert.equal(recovered.committedRelease, true);
          assert.equal(recovered.restoredPreimage, false);
          assert.deepEqual(inventory(target), expectedStage);
        } else {
          assert.equal(recovered.restoredPreimage, true);
          assert.deepEqual(inventory(target), before);
        }

        assert.equal(fs.existsSync(lock), false);
        assert.equal(fs.existsSync(journalFile), false);

        console.log(
          "PROCESS_TERMINATION_" +
          scenario.crash.toUpperCase() +
          "=PASS"
        );
      } finally {
        fs.rmSync(parentDir, {
          recursive: true,
          force: true
        });
      }
    }
  );
}