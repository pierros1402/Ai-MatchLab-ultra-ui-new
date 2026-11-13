import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promoteDirectory } from "./sync-deploy-snapshot-from-github.js";

async function withSandbox(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "aiml-v33-"));
  const stage = path.join(root, "stage");
  const target = path.join(root, "target");
  const backup = path.join(root, "backup");

  try {
    await fs.mkdir(stage);
    await fs.mkdir(target);
    await fs.writeFile(path.join(stage, "state.txt"), "NEW");
    await fs.writeFile(path.join(target, "state.txt"), "OLD");
    await run({ stage, target, backup });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test("V33 successful promotion publishes new state", async () => {
  await withSandbox(async ({ stage, target, backup }) => {
    await promoteDirectory(stage, target, backup);
    assert.equal(await fs.readFile(path.join(target, "state.txt"), "utf8"), "NEW");
    await assert.rejects(fs.stat(backup), { code: "ENOENT" });
  });
});

test("V33 failed second rename restores previous state", async () => {
  await withSandbox(async ({ stage, target, backup }) => {
    let calls = 0;

    await assert.rejects(
      promoteDirectory(stage, target, backup, {
        rename: async (from, to) => {
          calls++;
          if (calls === 2) {
            const error = new Error("injected_stage_rename_failure");
            error.code = "EACCES";
            throw error;
          }
          return fs.rename(from, to);
        }
      }),
      /injected_stage_rename_failure/
    );

    assert.equal(await fs.readFile(path.join(target, "state.txt"), "utf8"), "OLD");
    await assert.rejects(fs.stat(backup), { code: "ENOENT" });
  });
});

test("V33 failed rename rollback preserves original backup", async () => {
  await withSandbox(async ({ stage, target, backup }) => {
    let calls = 0;

    await assert.rejects(
      promoteDirectory(stage, target, backup, {
        rename: async (from, to) => {
          calls++;
          if (calls === 2) {
            throw Object.assign(new Error("injected_promotion_failure"), {
              code: "EACCES"
            });
          }
          return fs.rename(from, to);
        },
        restoreBackup: async () => {
          throw new Error("injected_restore_failure");
        }
      }),
      /snapshot_promotion_rollback_failed/
    );

    assert.equal(
      await fs.readFile(path.join(backup, "state.txt"), "utf8"),
      "OLD"
    );
  });
});

test("V33 failed EXDEV fallback rollback preserves original backup", async () => {
  await withSandbox(async ({ stage, target, backup }) => {
    await fs.rm(stage, { recursive: true, force: true });

    await assert.rejects(
      promoteDirectory(stage, target, backup, {
        rename: async () => {
          throw Object.assign(new Error("injected_exdev"), {
            code: "EXDEV"
          });
        },
        restoreBackup: async () => {
          throw new Error("injected_restore_failure");
        }
      }),
      /snapshot_promotion_rollback_failed/
    );

    assert.equal(
      await fs.readFile(path.join(backup, "state.txt"), "utf8"),
      "OLD"
    );
  });
});
