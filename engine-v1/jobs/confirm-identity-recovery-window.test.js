import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { confirmIdentityRecoveryWindow } from "./confirm-identity-recovery-window.js";

function pendingCandidate() {
  return {
    leagueSlug: "test.1",
    kickoffUtc: "2026-08-08T18:45:00.000Z",
    recoveryStatus: "PENDING_INDEPENDENT_CONFIRMATION",
    promotionAuthorized: false,
    requiresIndependentConfirmation: true,
    left: {
      source: "flashscore",
      sourceId: "fs-provider-1",
      canonicalId: "fs-1",
      kickoffUtc: "2026-08-08T18:45:00.000Z",
      homeTeam: "Alpha Town",
      awayTeam: "Short Beta",
    },
    right: {
      source: "espn",
      sourceId: "espn-provider-1",
      canonicalId: "espn-1",
      kickoffUtc: "2026-08-08T18:45:00.000Z",
      homeTeam: "Long Alpha United",
      awayTeam: "Beta Athletic",
    },
  };
}

function artifactPath() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-confirm-recovery-"));
  const file = path.join(root, "2026-08-08.json");
  fs.writeFileSync(file, JSON.stringify({
    schema: "ai-matchlab.identity-recovery-window.v1",
    runDayKey: "2026-08-08",
    status: "REVIEW_REQUIRED",
    summary: {
      autoPromotable: 0,
      pendingIndependentConfirmation: 1,
      ambiguous: 0,
      conflictRejected: 0,
    },
    targetDays: [{
      dayKey: "2026-08-08",
      recoveryLeagueReports: [{
        leagueSlug: "test.1",
        autoPromotable: [],
        pendingIndependentConfirmation: [pendingCandidate()],
        ambiguous: [],
        conflictRejected: [],
        summary: { autoPromotable: 0, pendingIndependentConfirmation: 1 },
      }],
    }],
  }, null, 2));
  return file;
}

function providerRows() {
  return [{
    source: "api_football",
    sourceFamily: "api_football",
    providerMatchId: "998877",
    providerLeagueId: 777,
    leagueSlug: "test.1",
    requestedDayKey: "2026-08-08",
    kickoffUtc: "2026-08-08T18:45:00.000Z",
    homeTeam: "Alpha Town FC",
    awayTeam: "Beta Athletic Club",
    homeTeamId: "101",
    awayTeamId: "202",
    evidenceUrl: "https://v3.football.api-sports.io/fixtures?id=998877",
    oddsRequested: false,
  }];
}

test("confirmed pending candidate becomes promotion eligible with durable third-source proof", async () => {
  const recoveryArtifactPath = artifactPath();
  const result = await confirmIdentityRecoveryWindow("2026-08-08", {
    recoveryArtifactPath,
    fetchFixtures: async () => ({
      ok: true,
      status: "OK",
      oddsRequested: false,
      rows: providerRows(),
    }),
    now: () => "2026-08-08T19:00:00.000Z",
  });
  assert.equal(result.confirmed, 1);
  assert.equal(result.retryPending, 0);
  const report = result.artifact.targetDays[0].recoveryLeagueReports[0];
  assert.equal(report.pendingIndependentConfirmation.length, 0);
  assert.equal(report.autoPromotable.length, 1);
  assert.equal(report.autoPromotable[0].recoveryStatus, "AUTO_PROMOTABLE_INDEPENDENT_CONFIRMATION");
  assert.equal(report.autoPromotable[0].promotionAuthorized, true);
  assert.equal(report.autoPromotable[0].independentConfirmation.oddsUsed, false);
});

test("provider failure stays pending and persists retry state instead of guessing", async () => {
  const recoveryArtifactPath = artifactPath();
  const result = await confirmIdentityRecoveryWindow("2026-08-08", {
    recoveryArtifactPath,
    fetchFixtures: async () => ({
      ok: false,
      status: "MISSING_API_KEY",
      retryable: true,
      oddsRequested: false,
      rows: [],
    }),
    now: () => "2026-08-08T19:00:00.000Z",
  });
  assert.equal(result.confirmed, 0);
  assert.equal(result.retryPending, 1);
  const candidate = result.artifact.targetDays[0]
    .recoveryLeagueReports[0]
    .pendingIndependentConfirmation[0];
  assert.equal(candidate.promotionAuthorized, false);
  assert.equal(candidate.independentConfirmation.status, "PENDING_RETRY");
  assert.equal(candidate.independentConfirmation.providerStatus, "MISSING_API_KEY");
  assert.equal(candidate.independentConfirmation.oddsUsed, false);
});

test("confirmer rejects any provider adapter that violates the no-odds contract", async () => {
  await assert.rejects(
    confirmIdentityRecoveryWindow("2026-08-08", {
      recoveryArtifactPath: artifactPath(),
      fetchFixtures: async () => ({ ok: true, oddsRequested: true, rows: providerRows() }),
    }),
    /identity_confirmer_odds_contract_violation/u,
  );
});
