import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
const registryPath = path.join(projectRoot, "data", "competition-format-registry", "registry.v1.json");
const cliPath = path.join(__dirname, "audit-standings-contracts.js");

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function table(count) {
  return Array.from({ length: count }, (_, index) => ({
    canonicalTeamId: `team-${index + 1}`,
    teamId: `team-${index + 1}`,
    team: `Team ${index + 1}`,
    teamName: `Team ${index + 1}`,
    position: index + 1,
    rank: index + 1,
    played: 10,
    wins: 3,
    draws: 3,
    losses: 4,
    goalsFor: 10,
    goalsAgainst: 11,
    goalDiff: -1,
    points: 12
  }));
}

test("CLI writes an audit report without changing standings input", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-p0b-cli-"));
  const standingsDir = path.join(temp, "standings");
  const reportPath = path.join(temp, "report.json");
  fs.mkdirSync(standingsDir, { recursive: true });
  const standingsPath = path.join(standingsDir, "col.1.json");
  fs.writeFileSync(standingsPath, JSON.stringify({ league: "col.1", table: table(22) }, null, 2), "utf8");
  const before = sha256(standingsPath);

  const run = spawnSync(process.execPath, [
    cliPath,
    "--registry", registryPath,
    "--standings-dir", standingsDir,
    "--season", "2026",
    "--league", "col.1",
    "--output", reportPath
  ], { encoding: "utf8" });

  assert.equal(run.status, 0, run.stderr);
  assert.equal(sha256(standingsPath), before);
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(report.status, "ISSUES_FOUND");
  assert.equal(report.batch.summary.fail, 1);
  assert.equal(report.readOnlyEvidence.standingsFilesChanged, false);
  assert.equal(report.publicationDecision, "NOT_APPLIED_READ_ONLY");
});

test("CLI strict mode returns exit code 2 on a contract mismatch", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-p0b-cli-strict-"));
  const standingsDir = path.join(temp, "standings");
  fs.mkdirSync(standingsDir, { recursive: true });
  fs.writeFileSync(
    path.join(standingsDir, "bol.1.json"),
    JSON.stringify({ league: "bol.1", table: table(20) }, null, 2),
    "utf8"
  );

  const run = spawnSync(process.execPath, [
    cliPath,
    "--registry", registryPath,
    "--standings-dir", standingsDir,
    "--season", "2026",
    "--league", "bol.1",
    "--strict"
  ], { encoding: "utf8" });

  assert.equal(run.status, 2, run.stderr);
  const report = JSON.parse(run.stdout);
  assert.equal(report.batch.summary.fail, 1);
  assert.equal(report.readOnlyEvidence.standingsFilesChanged, false);
});

test("CLI reports a specifically requested standings artifact that is missing", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-p0b-cli-missing-"));
  const standingsDir = path.join(temp, "standings");
  fs.mkdirSync(standingsDir, { recursive: true });

  const run = spawnSync(process.execPath, [
    cliPath,
    "--registry", registryPath,
    "--standings-dir", standingsDir,
    "--season", "2026",
    "--league", "bol.1"
  ], { encoding: "utf8" });

  assert.equal(run.status, 0, run.stderr);
  const report = JSON.parse(run.stdout);
  assert.equal(report.status, "REQUESTED_ARTIFACTS_MISSING");
  assert.equal(report.ok, false);
  assert.deepEqual(report.missingRequestedLeagues, ["bol.1"]);
  assert.equal(report.batch.summary.artifacts, 0);
});
