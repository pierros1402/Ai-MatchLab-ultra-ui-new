import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  loadSemanticDuplicateDecisionLedger,
  sha256Canonical,
  validateSemanticDuplicateDecisionLedger,
} from "./semantic-duplicate-decision-ledger.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ledgerPath = path.resolve(
  here,
  "../../data/identity-decisions/semantic-duplicate-decision-ledger.v1.json",
);

function cloneLedger() {
  return structuredClone(loadSemanticDuplicateDecisionLedger(ledgerPath));
}

function rehashDecision(decision) {
  const copy = { ...decision };
  delete copy.immutableDecisionHash;
  decision.immutableDecisionHash = sha256Canonical(copy);
}

function issueCodes(result) {
  return new Set(result.issues.map(item => item.code));
}

test("production P0-C foundation validates exact immutable coverage", () => {
  const result = validateSemanticDuplicateDecisionLedger(cloneLedger());
  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert.deepEqual(result.summary, {
    decisionRecords: 53,
    ledgerTeamIdentities: 70,
    sourceFixtureIds: 106,
    confirmedSemanticDuplicates: 53,
    reviewCandidatesResolved: 1,
    scoreConflicts: 6,
    terminalStatusConflicts: 5,
    truthConflictUnionResolved: 7,
    repositoryFixtureIdSelectionsDeferred: 53,
    productionGlobalClubIdsBound: 0,
  });
  assert.deepEqual(result.applicationAuthorization, {
    repositoryApplicationAuthorized: false,
    mutationAllowed: false,
    writePlanGenerated: false,
  });
});

test("every team and decision immutable hash validates independently", () => {
  const ledger = cloneLedger();
  for (const team of ledger.teamIdentities) {
    const copy = { ...team };
    delete copy.identityHash;
    assert.equal(team.identityHash, sha256Canonical(copy));
  }
  for (const decision of ledger.decisions) {
    const copy = { ...decision };
    delete copy.immutableDecisionHash;
    assert.equal(decision.immutableDecisionHash, sha256Canonical(copy));
  }
});

test("provider team IDs cannot be fabricated from the source bundle", () => {
  const ledger = cloneLedger();
  ledger.decisions[0].sourceFixtures[0].providerHomeTeamId = "provider-team-1";
  rehashDecision(ledger.decisions[0]);
  const result = validateSemanticDuplicateDecisionLedger(ledger);
  assert.equal(result.ok, false);
  assert(issueCodes(result).has("PROVIDER_TEAM_ID_FALSE_BINDING"));
});

test("repository mutation authorization is rejected even with a recomputed hash", () => {
  const ledger = cloneLedger();
  ledger.decisions[0].applicationAuthorization.mutationAllowed = true;
  rehashDecision(ledger.decisions[0]);
  const result = validateSemanticDuplicateDecisionLedger(ledger);
  assert.equal(result.ok, false);
  assert(issueCodes(result).has("DECISION_APPLICATION_AUTHORIZED"));
});

test("decision content tampering invalidates the immutable hash", () => {
  const ledger = cloneLedger();
  ledger.decisions[0].identityDecision.reasonCodes.push("attacker_added_reason");
  const result = validateSemanticDuplicateDecisionLedger(ledger);
  assert.equal(result.ok, false);
  assert(issueCodes(result).has("IMMUTABLE_DECISION_HASH_MISMATCH"));
});

test("a truth conflict cannot be changed back to unresolved", () => {
  const ledger = cloneLedger();
  const decision = ledger.decisions.find(item => item.scoreConflict);
  decision.truthDecision.status = "NO_CONFLICT_RECORDED";
  decision.truthDecision.terminalStatus = null;
  decision.truthDecision.scoreHome = null;
  decision.truthDecision.scoreAway = null;
  rehashDecision(decision);
  const result = validateSemanticDuplicateDecisionLedger(ledger);
  assert.equal(result.ok, false);
  assert(issueCodes(result).has("TRUTH_CONFLICT_UNRESOLVED"));
});

test("truth evidence must semantically support the exact resolved score", () => {
  const ledger = cloneLedger();
  const decision = ledger.decisions.find(item => item.clusterOrdinal === 4);
  for (const evidence of decision.externalEvidence) {
    evidence.supports = evidence.supports.map(token =>
      token === "SCORE_1_1" ? "SCORE_2_1" : token
    );
  }
  rehashDecision(decision);
  const result = validateSemanticDuplicateDecisionLedger(ledger);
  assert.equal(result.ok, false);
  assert(issueCodes(result).has("TRUTH_EVIDENCE_SEMANTIC_BINDING_MISSING"));
});

test("the review candidate requires referenced primary fixture evidence", () => {
  const ledger = cloneLedger();
  const decision = ledger.decisions.find(
    item => item.sourceAuditClassification === "POSSIBLE_DUPLICATE_REQUIRES_REVIEW",
  );
  decision.identityDecision.evidenceRefs = [];
  decision.externalEvidence = [];
  rehashDecision(decision);
  const result = validateSemanticDuplicateDecisionLedger(ledger);
  assert.equal(result.ok, false);
  assert(issueCodes(result).has("REVIEW_CANDIDATE_PRIMARY_EVIDENCE_MISSING"));
});

test("repository fixture retention remains deferred until production identity binding", () => {
  const ledger = cloneLedger();
  const decision = ledger.decisions[0];
  decision.repositoryFixtureIdDecision.status = "SELECTED";
  decision.repositoryFixtureIdDecision.retainedRepositoryFixtureId =
    decision.sourceFixtures[0].repositoryFixtureId;
  decision.repositoryFixtureIdDecision.suppressedRepositoryFixtureIds = [
    decision.sourceFixtures[1].repositoryFixtureId,
  ];
  rehashDecision(decision);
  const result = validateSemanticDuplicateDecisionLedger(ledger);
  assert.equal(result.ok, false);
  assert(issueCodes(result).has("REPOSITORY_FIXTURE_SELECTION_PREMATURE"));
});

test("stored summary cannot be forged independently of ledger contents", () => {
  const ledger = cloneLedger();
  ledger.summary.ledgerTeamIdentities = 69;
  const result = validateSemanticDuplicateDecisionLedger(ledger);
  assert.equal(result.ok, false);
  assert(issueCodes(result).has("LEDGER_SUMMARY_MISMATCH"));
});

test("home and away cannot collapse to one ledger identity", () => {
  const ledger = cloneLedger();
  const decision = ledger.decisions[0];
  decision.awayTeamIdentityKey = decision.homeTeamIdentityKey;
  for (const sourceFixture of decision.sourceFixtures) {
    sourceFixture.awayTeamIdentityKey = decision.homeTeamIdentityKey;
  }
  rehashDecision(decision);
  const result = validateSemanticDuplicateDecisionLedger(ledger);
  assert.equal(result.ok, false);
  assert(issueCodes(result).has("HOME_AWAY_TEAM_IDENTITY_COLLISION"));
});
