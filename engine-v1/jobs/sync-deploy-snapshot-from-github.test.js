import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promoteDirectory } from "./sync-deploy-snapshot-from-github.js";

async function makeFixture() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "aiml-exdev-"));
  const stage = path.join(root, "stage", "2026-08-06");
  const target = path.join(root, "served", "2026-08-06");
  const backup = path.join(root, "served", ".backup-2026-08-06");

  await fsp.mkdir(path.join(stage, "details"), { recursive: true });
  await fsp.mkdir(path.join(target, "details"), { recursive: true });
  await fsp.writeFile(path.join(stage, "manifest.json"), "new-manifest\n");
  await fsp.writeFile(path.join(stage, "details", "new.json"), "new-detail\n");
  await fsp.writeFile(path.join(target, "manifest.json"), "old-manifest\n");
  await fsp.writeFile(path.join(target, "details", "old.json"), "old-detail\n");
  await fsp.writeFile(path.join(target, "stale.json"), "stale\n");

  return { root, stage, target, backup };
}

async function assertPromoted({ stage, target, backup }) {
  assert.equal(await fsp.readFile(path.join(target, "manifest.json"), "utf8"), "new-manifest\n");
  assert.equal(await fsp.readFile(path.join(target, "details", "new.json"), "utf8"), "new-detail\n");
  assert.equal(fs.existsSync(path.join(target, "details", "old.json")), false);
  assert.equal(fs.existsSync(path.join(target, "stale.json")), false);
  assert.equal(fs.existsSync(stage), false);
  assert.equal(fs.existsSync(backup), false);
  assert.deepEqual((await fsp.readdir(target)).sort(), ["details", "manifest.json"]);
}

test("promoteDirectory falls back safely when target-to-backup rename returns EXDEV", async t => {
  const fixture = await makeFixture();
  t.after(() => fsp.rm(fixture.root, { recursive: true, force: true }));
  let injected = false;
  const rename = async (source, destination) => {
    if (!injected && source === fixture.target && destination === fixture.backup) {
      injected = true;
      const error = new Error("cross-device target move");
      error.code = "EXDEV";
      throw error;
    }
    return fsp.rename(source, destination);
  };

  await promoteDirectory(fixture.stage, fixture.target, fixture.backup, { rename });
  assert.equal(injected, true);
  await assertPromoted(fixture);
});

test("promoteDirectory restores backup then falls back when stage-to-target rename returns EXDEV", async t => {
  const fixture = await makeFixture();
  t.after(() => fsp.rm(fixture.root, { recursive: true, force: true }));
  let injected = false;
  const rename = async (source, destination) => {
    if (!injected && source === fixture.stage && destination === fixture.target) {
      injected = true;
      const error = new Error("cross-device staged move");
      error.code = "EXDEV";
      throw error;
    }
    return fsp.rename(source, destination);
  };

  await promoteDirectory(fixture.stage, fixture.target, fixture.backup, { rename });
  assert.equal(injected, true);
  await assertPromoted(fixture);
});
