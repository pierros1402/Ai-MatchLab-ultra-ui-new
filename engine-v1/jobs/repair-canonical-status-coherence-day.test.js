import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { repairCanonicalStatusCoherenceDay } from "./repair-canonical-status-coherence-day.js";

function fixture() {
  return {
    canonicalId: "cid_ecu1_delfin_orense_20260810",
    matchId: "cid_ecu1_delfin_orense_20260810",
    source: "espn",
    sourceId: "401859651",
    sourceMatchId: "401859651",
    leagueSlug: "ecu.1",
    dayKey: "2026-08-10",
    kickoffUtc: "2026-08-09T21:00Z",
    homeTeam: "Delfín",
    awayTeam: "Orense",
    scoreHome: 1,
    scoreAway: 1,
    status: "FT",
    statusType: "STATUS_FINAL",
    rawStatus: "STATUS_SCHEDULED",
    operationalState: "TERMINAL_CONFIRMED",
    minute: "FT",
    authoritativeTerminalWriteback: {
      observation: {
        status: "FT",
        statusType: "STATUS_FINAL",
        rawStatus: "STATUS_SCHEDULED",
        scoreHome: 1,
        scoreAway: 1
      }
    }
  };
}

function verifiedFinal() {
  return {
    verifiedFinalTruth: true,
    dayKey: "2026-08-10",
    matchId: "cid_ecu1_delfin_orense_20260810",
    leagueSlug: "ecu.1",
    homeTeam: "Delfín",
    awayTeam: "Orense",
    kickoffUtc: "2026-08-09T21:00Z",
    scoreHome: 1,
    scoreAway: 1,
    generatedAt: "2026-08-09T23:48:33.897Z",
    sources: [{
      provider: "espn",
      providerMatchId: "401859651",
      home: "Delfín",
      away: "Orense",
      kickoffUtc: "2026-08-09T21:00Z",
      scoreHome: 1,
      scoreAway: 1,
      rawStatus: "STATUS_FULL_TIME",
      terminalObservedAt: "2026-08-09T23:40:44.016Z"
    }]
  };
}

function withRoots(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-coherence-repair-"));
  const canonicalRoot = path.join(root, "canonical-fixtures");
  const finalRoot = path.join(root, "final-results");
  const canonicalDay = path.join(canonicalRoot, "2026-08-10");
  const finalDay = path.join(finalRoot, "2026-08-10");
  fs.mkdirSync(canonicalDay, { recursive: true });
  fs.mkdirSync(finalDay, { recursive: true });
  const canonicalFile = path.join(canonicalDay, "ecu.1.json");
  fs.writeFileSync(canonicalFile, `${JSON.stringify({ dayKey: "2026-08-10", fixtures: [fixture()] }, null, 2)}\n`);
  fs.writeFileSync(path.join(finalDay, "cid_ecu1_delfin_orense_20260810.json"), `${JSON.stringify(verifiedFinal(), null, 2)}\n`);

  try {
    return fn({ canonicalRoot, finalRoot, canonicalFile });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("dry-run reports repair without mutating canonical file", () => {
  withRoots(({ canonicalRoot, finalRoot, canonicalFile }) => {
    const before = fs.readFileSync(canonicalFile, "utf8");
    const report = repairCanonicalStatusCoherenceDay("2026-08-10", {
      canonicalRoot,
      finalRoot,
      write: false,
      repairedAt: "2026-08-11T05:00:00.000Z"
    });

    assert.equal(report.ok, true);
    assert.equal(report.conflictRows, 1);
    assert.equal(report.repairedRows, 1);
    assert.equal(report.filesWritten, 0);
    assert.equal(fs.readFileSync(canonicalFile, "utf8"), before);
  });
});

test("write mode repairs conflict and second pass is fixed point", () => {
  withRoots(({ canonicalRoot, finalRoot, canonicalFile }) => {
    const first = repairCanonicalStatusCoherenceDay("2026-08-10", {
      canonicalRoot,
      finalRoot,
      write: true,
      repairedAt: "2026-08-11T05:00:00.000Z"
    });

    assert.equal(first.ok, true);
    assert.equal(first.repairedRows, 1);
    assert.equal(first.filesWritten, 1);

    const payload = JSON.parse(fs.readFileSync(canonicalFile, "utf8"));
    assert.equal(payload.fixtures[0].rawStatus, "STATUS_FULL_TIME");
    assert.equal(payload.fixtures[0].authoritativeTerminalWriteback.observation.rawStatus, "STATUS_FULL_TIME");

    const second = repairCanonicalStatusCoherenceDay("2026-08-10", {
      canonicalRoot,
      finalRoot,
      write: true,
      repairedAt: "2026-08-11T05:05:00.000Z"
    });
    assert.equal(second.ok, true);
    assert.equal(second.conflictRows, 0);
    assert.equal(second.repairedRows, 0);
    assert.equal(second.filesWritten, 0);
  });
});
