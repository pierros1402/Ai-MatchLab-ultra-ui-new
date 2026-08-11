import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const guardPath = fileURLToPath(new URL("./guard-staged-data-boundary.js", import.meta.url));

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function canonicalPayload(rawStatus = "STATUS_FULL_TIME") {
  return {
    dayKey: "2026-08-10",
    leagueSlug: "ecu.1",
    fixtures: [
      {
        canonicalId: "cid_ecu1_delfin_orense_20260810",
        matchId: "cid_ecu1_delfin_orense_20260810",
        status: "FT",
        statusType: "STATUS_FINAL",
        rawStatus,
        operationalState: "TERMINAL_CONFIRMED",
        scoreHome: 1,
        scoreAway: 1
      }
    ]
  };
}

function withRepo(fn) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-status-guard-"));
  try {
    git(cwd, ["init", "-q"]);
    git(cwd, ["config", "user.email", "test@example.invalid"]);
    git(cwd, ["config", "user.name", "AI MatchLab Test"]);
    fs.mkdirSync(path.join(cwd, "data", "canonical-fixtures", "2026-08-10"), { recursive: true });
    const file = path.join(cwd, "data", "canonical-fixtures", "2026-08-10", "ecu.1.json");
    fs.writeFileSync(file, `${JSON.stringify(canonicalPayload(), null, 2)}\n`, "utf8");
    git(cwd, ["add", "."]);
    git(cwd, ["commit", "-qm", "baseline"]);
    return fn({ cwd, file });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

function runGuard(cwd) {
  return spawnSync(
    process.execPath,
    [
      guardPath,
      "--label=test-status-coherence",
      "--dayKey=2026-08-10",
      "--allow=^data/canonical-fixtures/2026-08-10/[^/]+\\.json$"
    ],
    { cwd, encoding: "utf8" }
  );
}

test("staged canonical coherence guard passes coherent index blob", () => {
  withRepo(({ cwd, file }) => {
    const payload = canonicalPayload("STATUS_FULL_TIME");
    payload.fixtures[0].minute = "FT";
    fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    git(cwd, ["add", "data/canonical-fixtures/2026-08-10/ecu.1.json"]);

    const result = runGuard(cwd);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);
  });
});

test("staged canonical coherence guard blocks exact production conflict", () => {
  withRepo(({ cwd, file }) => {
    fs.writeFileSync(
      file,
      `${JSON.stringify(canonicalPayload("STATUS_SCHEDULED"), null, 2)}\n`,
      "utf8"
    );
    git(cwd, ["add", "data/canonical-fixtures/2026-08-10/ecu.1.json"]);

    const result = runGuard(cwd);
    assert.equal(result.status, 2, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.equal(output.violations.length, 1);
    assert.equal(output.violations[0].reason, "staged_canonical_status_conflict");
    assert.equal(output.violations[0].matchId, "cid_ecu1_delfin_orense_20260810");
    assert.equal(output.violations[0].rawStatus, "STATUS_SCHEDULED");
  });
});
