import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import {
  validateAutonomousRepairFilesystemTransactionCoreRoots
} from "./autonomous-repair-filesystem-transaction-core.js";

function mkRoots() {
  const root =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        "aiml-p1-core-"
      )
    );

  const projectRoot =
    path.join(root, "project");

  const externalStateRoot =
    path.join(root, "state");

  const externalBackupRoot =
    path.join(root, "backup");

  for (const directory of [
    projectRoot,
    externalStateRoot,
    externalBackupRoot
  ]) {
    fs.mkdirSync(directory);
  }

  return {
    root,
    projectRoot,
    externalStateRoot,
    externalBackupRoot
  };
}

test(
  "shared transaction core accepts canonical disjoint roots without applying sandbox or production location policy",
  () => {
    const roots = mkRoots();

    try {
      const validated =
        validateAutonomousRepairFilesystemTransactionCoreRoots({
          projectRoot: roots.projectRoot,
          externalStateRoot: roots.externalStateRoot,
          externalBackupRoot: roots.externalBackupRoot
        });

      assert.equal(
        validated.projectRoot,
        fs.realpathSync(roots.projectRoot)
      );

      assert.equal(
        validated.externalStateRoot,
        fs.realpathSync(roots.externalStateRoot)
      );

      assert.equal(
        validated.externalBackupRoot,
        fs.realpathSync(roots.externalBackupRoot)
      );
    } finally {
      fs.rmSync(
        roots.root,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);

test(
  "shared transaction core rejects overlapping roots independently of environment policy",
  () => {
    const roots = mkRoots();
    const nested =
      path.join(
        roots.projectRoot,
        "state"
      );

    fs.mkdirSync(nested);

    try {
      assert.throws(
        () =>
          validateAutonomousRepairFilesystemTransactionCoreRoots({
            projectRoot: roots.projectRoot,
            externalStateRoot: nested,
            externalBackupRoot: roots.externalBackupRoot
          }),
        /roots_not_disjoint/
      );
    } finally {
      fs.rmSync(
        roots.root,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);

test(
  "shared transaction core source contains no OS-temp sandbox policy or production entrypoint policy",
  () => {
    const source =
      fs.readFileSync(
        fileURLToPath(
          new URL(
            "./autonomous-repair-filesystem-transaction-core.js",
            import.meta.url
          )
        ),
        "utf8"
      );

    for (const forbidden of [
      "node:os",
      "os.tmpdir",
      "validateAutonomousRepairFilesystemTransactionSandboxRoots",
      "sandboxOnly",
      "production_entrypoint_not_implemented"
    ]) {
      assert.equal(
        source.includes(forbidden),
        false,
        forbidden
      );
    }

    assert.match(
      source,
      /executeAutonomousRepairFilesystemTransactionCore/u
    );

    assert.match(
      source,
      /recoverAutonomousRepairFilesystemTransactionCore/u
    );
  }
);

test(
  "sandbox kernel is a root-policy wrapper over the shared transaction core",
  () => {
    const source =
      fs.readFileSync(
        fileURLToPath(
          new URL(
            "./autonomous-repair-filesystem-transaction-kernel.js",
            import.meta.url
          )
        ),
        "utf8"
      );

    assert.match(
      source,
      /autonomous-repair-filesystem-transaction-core\.js/u
    );

    assert.match(
      source,
      /validateAutonomousRepairFilesystemTransactionSandboxRoots/u
    );

    assert.match(
      source,
      /must_be_sandboxed_under_os_tmpdir/u
    );

    assert.doesNotMatch(
      source,
      /function executeCore/u
    );

    assert.doesNotMatch(
      source,
      /consumeOnceAtomically\(/u
    );
  }
);
