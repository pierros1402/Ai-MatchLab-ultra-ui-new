import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { promoteIdentityRecoveryArtifact } from "./identity-extension-promoter.js";
import { discoverIdentityRecoveryCandidates } from "./identity-extension-recovery.js";
import { evaluateIndependentFixtureConfirmation } from "./independent-fixture-confirmer.js";
import { getProductionIdentityResolverRuntime } from "./production-identity-resolver-runtime.js";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const RECOVERY = path.join(ROOT, "data", "identity-recovery", "2026-08-08.json");
const LEDGER = path.join(
  ROOT,
  "data",
  "identity-decisions",
  "production-identity-extension-ledger.v1.json",
);
const CANONICAL = path.join(ROOT, "data", "canonical-fixtures");
const AUTO_FIXTURE_DECISION_IDS = new Set([
  "p0xfix_f9f21801566b3db2618b",
  "p0xfix_e78adee0201b788fa007",
  "p0xfix_bcb5b8160a01a187e38f",
]);
const AUTO_BINDING_DECISION_IDS = new Set([
  "p0xbind_4a9cd509ead3cd44be24",
  "p0xbind_e166d053a030618eb560",
]);

function run(extensionLedgerPath, write) {
  const runtime = getProductionIdentityResolverRuntime();
  return promoteIdentityRecoveryArtifact({
    runDayKey: "2026-08-08",
    recoveryArtifactPath: RECOVERY,
    extensionLedgerPath,
    canonicalRoot: CANONICAL,
    baseResolver: runtime.baseResolver,
    write,
  });
}

function prePromotionLedgerPath() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-id-promoter-pre-"));
  const tempLedger = path.join(tempDir, "extension.json");
  const ledger = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  ledger.teamBindings = ledger.teamBindings.filter(
    item => !AUTO_BINDING_DECISION_IDS.has(item.bindingDecisionId)
  );
  ledger.fixtureLineageDecisions = ledger.fixtureLineageDecisions.filter(
    item => !AUTO_FIXTURE_DECISION_IDS.has(item.fixtureRetentionDecisionId)
  );
  ledger.extensionVersion = "2026-08-08.1-test-pre-promotion";
  ledger.summary = {
    promotedTeamBindings: ledger.teamBindings.length,
    fixtureLineageDecisions: ledger.fixtureLineageDecisions.length,
    suppressedFixtureAliases: ledger.fixtureLineageDecisions.reduce(
      (sum, item) => sum + item.suppressedRepositoryFixtureIds.length,
      0,
    ),
  };
  fs.writeFileSync(tempLedger, `${JSON.stringify(ledger, null, 2)}\n`);
  return tempLedger;
}

test("current permanent ledger already contains the three proven 09-10 Aug promotions", () => {
  const result = run(LEDGER, false);
  assert.equal(result.changed, false);
  assert.equal(result.promoted.length, 0);
  assert.equal(result.alreadyApplied.length, 3);
  assert.equal(result.blocked.length, 0);
  assert.deepEqual(result.validation.counts, {
    promotedTeamBindings: 13,
    fixtureLineageDecisions: 12,
    suppressedFixtureAliases: 12,
  });
});

test("pre-promotion ledger accepts exactly the three proven 09-10 Aug lineages", () => {
  const result = run(prePromotionLedgerPath(), false);
  assert.equal(result.changed, true);
  assert.equal(result.promoted.length, 3);
  assert.equal(result.blocked.length, 0);
  assert.equal(result.refusedRecoveryStates.pendingIndependentConfirmation, 0);
  assert.equal(result.refusedRecoveryStates.ambiguous, 2);
  assert.equal(result.refusedRecoveryStates.conflictRejected, 0);
  assert.equal(result.validation.ok, true);
  assert.deepEqual(result.validation.counts, {
    promotedTeamBindings: 13,
    fixtureLineageDecisions: 12,
    suppressedFixtureAliases: 12,
  });
  assert.equal(
    result.promoted.reduce((sum, item) => sum + item.newTeamBindingDecisionIds.length, 0),
    2,
  );
});

test("promoter is idempotent after an atomic ledger write", () => {
  const tempLedger = prePromotionLedgerPath();

  const first = run(tempLedger, true);
  const second = run(tempLedger, true);
  assert.equal(first.changed, true);
  assert.equal(first.promoted.length, 3);
  assert.equal(second.changed, false);
  assert.equal(second.promoted.length, 0);
  assert.equal(second.alreadyApplied.length, 3);
  assert.equal(second.blocked.length, 0);
});

test("stale/tampered auto candidate cannot bypass raw source revalidation", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-id-promoter-stale-"));
  const artifactPath = path.join(tempDir, "recovery.json");
  const tempLedger = prePromotionLedgerPath();
  const artifact = JSON.parse(fs.readFileSync(RECOVERY, "utf8"));
  const report = artifact.targetDays
    .flatMap(day => day.recoveryLeagueReports)
    .find(item => item.autoPromotable?.length);
  const candidate = report.autoPromotable[0];
  candidate.left.canonicalId = `${candidate.left.canonicalId}_tampered`;
  fs.writeFileSync(artifactPath, JSON.stringify(artifact));

  const runtime = getProductionIdentityResolverRuntime();
  const result = promoteIdentityRecoveryArtifact({
    runDayKey: "2026-08-08",
    recoveryArtifactPath: artifactPath,
    extensionLedgerPath: tempLedger,
    canonicalRoot: CANONICAL,
    baseResolver: runtime.baseResolver,
    write: false,
  });
  assert.ok(result.blocked.some(item => item.reason === "RAW_SOURCE_REVALIDATION_FAILED"));
});

test("two-sided unknown pair promotes only with independently revalidated non-odds evidence", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-id-promoter-independent-"));
  const canonicalRoot = path.join(tempDir, "canonical");
  const dayKey = "2026-08-11";
  const leagueSlug = "test.independent";
  const dayDir = path.join(canonicalRoot, dayKey);
  fs.mkdirSync(dayDir, { recursive: true });
  const kickoffUtc = "2026-08-11T18:45:00.000Z";
  const fixtures = [
    {
      canonicalId: "cid_test_independent_fs",
      source: "flashscore",
      sourceId: "fs-independent-1",
      dayKey,
      leagueSlug,
      kickoffUtc,
      homeTeam: "Synthetic Alpha Town",
      awayTeam: "Synthetic Short Beta",
    },
    {
      canonicalId: "cid_test_independent_espn",
      source: "espn",
      sourceId: "espn-independent-1",
      dayKey,
      leagueSlug,
      kickoffUtc,
      homeTeam: "Synthetic Long Alpha United",
      awayTeam: "Synthetic Beta Athletic",
    },
  ];
  fs.writeFileSync(path.join(dayDir, `${leagueSlug}.json`), JSON.stringify({
    leagueSlug,
    fixtures,
  }));

  const runtime = getProductionIdentityResolverRuntime();
  const currentLedger = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  const currentResolver = runtime.resolver;
  const rawReport = discoverIdentityRecoveryCandidates(fixtures, {
    leagueSlug,
    resolver: currentResolver,
  });
  assert.equal(rawReport.pendingIndependentConfirmation.length, 1);
  const pending = {
    ...rawReport.pendingIndependentConfirmation[0],
    dayKey,
  };
  const confirmation = evaluateIndependentFixtureConfirmation(pending, [{
    source: "api_football",
    sourceFamily: "api_football",
    providerMatchId: "99887766",
    providerLeagueId: 777,
    leagueSlug,
    requestedDayKey: dayKey,
    kickoffUtc,
    homeTeam: "Synthetic Alpha Town FC",
    awayTeam: "Synthetic Beta Athletic Club",
    homeTeamId: "10101",
    awayTeamId: "20202",
    evidenceUrl: "https://v3.football.api-sports.io/fixtures?id=99887766",
    oddsRequested: false,
  }], { observedAt: "2026-08-08T20:00:00.000Z" });
  assert.equal(confirmation.ok, true);

  const promotedCandidate = {
    ...rawReport.pendingIndependentConfirmation[0],
    originRecoveryStatus: "PENDING_INDEPENDENT_CONFIRMATION",
    recoveryStatus: "AUTO_PROMOTABLE_INDEPENDENT_CONFIRMATION",
    promotionAuthorized: true,
    requiresIndependentConfirmation: true,
    independentConfirmation: confirmation.evidence,
  };
  const recoveryArtifactPath = path.join(tempDir, "recovery.json");
  fs.writeFileSync(recoveryArtifactPath, JSON.stringify({
    schema: "ai-matchlab.identity-recovery-window.v1",
    runDayKey: "2026-08-08",
    summary: {
      autoPromotable: 1,
      pendingIndependentConfirmation: 0,
      ambiguous: 0,
      conflictRejected: 0,
    },
    targetDays: [{
      dayKey,
      recoveryLeagueReports: [{
        leagueSlug,
        autoPromotable: [promotedCandidate],
        pendingIndependentConfirmation: [],
      }],
    }],
  }));
  const extensionLedgerPath = path.join(tempDir, "extension.json");
  fs.writeFileSync(extensionLedgerPath, `${JSON.stringify(currentLedger, null, 2)}\n`);

  const result = promoteIdentityRecoveryArtifact({
    runDayKey: "2026-08-08",
    recoveryArtifactPath,
    extensionLedgerPath,
    canonicalRoot,
    baseResolver: runtime.baseResolver,
    write: false,
  });
  assert.equal(result.blocked.length, 0);
  assert.equal(result.promoted.length, 1);
  assert.equal(result.validation.ok, true);
  const addedDecision = result.proposedLedger.fixtureLineageDecisions.find(
    item => item.retainedRepositoryFixtureId === "cid_test_independent_espn",
  );
  assert.equal(addedDecision.promotionBasis, "TWO_PROVIDER_PLUS_INDEPENDENT_FIXTURE_CONFIRMATION");
  assert.equal(addedDecision.independentConfirmationContract, "api_football_exact_bridge_v1");
  assert.equal(addedDecision.independentConfirmations[0].oddsUsed, false);
});
