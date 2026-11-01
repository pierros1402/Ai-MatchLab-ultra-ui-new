import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("./history-preservation.js", import.meta.url), "utf8");

test("archive tip fetch is bounded and its advertised SHA checked", () => {
  assert.match(source, /"ls-remote", "--heads", remote/);
  assert.match(source, /"fetch", "--quiet", "--filter=blob:none", "--depth=1", "--no-tags"/);
  assert.match(source, /history_archive_remote_tip_changed_during_fetch/);
  assert.match(source, /"rev-parse", `refs\/remotes\/\$\{remote\}/);
});
test("archive remains fail-closed and never force pushes", () => {
  assert.match(source, /history_checkpoint_identity_conflict/);
  assert.match(source, /verifyHistoryCheckpoint\(\{ root, ref: durableRef, manifestPath \}\)/);
  assert.match(source, /"push", "--quiet", remote/);
  assert.doesNotMatch(source, /"push", "--force"/);
  assert.match(source, /"write-tree", "--missing-ok"/);
});
