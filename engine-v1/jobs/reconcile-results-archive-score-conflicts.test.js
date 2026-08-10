import assert from "node:assert/strict";
import test from "node:test";

import { backupFileNameForActionFile } from "./reconcile-results-archive-score-conflicts.js";

test("backup filename is identical for POSIX and Windows action paths", () => {
  const sha = "4de522d4c5d7";
  const expected = "history-archive__can.1__2026.json.4de522d4c5d7.json";
  assert.equal(
    backupFileNameForActionFile("history-archive/can.1/2026.json", sha),
    expected,
  );
  assert.equal(
    backupFileNameForActionFile("history-archive\\can.1\\2026.json", sha),
    expected,
  );
});

test("backup filename cannot escape or create nested backup directories", () => {
  const name = backupFileNameForActionFile(
    "..\\history-archive/can.1/2026.json",
    "4de522d4c5d7",
  );
  assert.equal(name.includes("/"), false);
  assert.equal(name.includes("\\"), false);
});

test("backup filename rejects malformed inputs fail closed", () => {
  assert.throws(
    () => backupFileNameForActionFile("", "4de522d4c5d7"),
    /repair_backup_action_file_invalid/u,
  );
  assert.throws(
    () => backupFileNameForActionFile("history-archive/can.1/2026.json", "BAD"),
    /repair_backup_sha_prefix_invalid/u,
  );
});
