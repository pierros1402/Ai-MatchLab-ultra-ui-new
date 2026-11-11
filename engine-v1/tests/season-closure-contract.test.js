import assert from "node:assert/strict";
import { test } from "node:test";
import { certifyPromotion, fingerprint, reconcileSeason, reconcileRegisteredSeason } from "../core/season-closure-contract.js";

const cutoff = "2026-11-10T09:27:00Z";
const start = "2026-07-24T00:00:00Z";
const sha = "a".repeat(64);
const evidence = (sourceId, availableAt = start) => ({
  sourceId, availableAt, url: "https://example.invalid/" + sourceId, sha256: sha
});
const result = (officialId, kickoff, availableAt, data) => ({
  officialId,
  canonicalId: "canonical:" + officialId,
  providerIds: ["test:" + officialId],
  home: "club:home:seniors", away: "club:away:reserves",
  phase: "Clausura", round: 1, kickoff, status: "FT", score: [4, 1],
  evidence: evidence(officialId, availableAt),
  identityEvidence: evidence("identity-" + officialId),
  valuePolicy: "ELIGIBLE", ...data
});
const earlier = () => result("test-831", "2026-07-30T21:30:00Z", "2026-07-30T23:30:00Z", { storageBucket: "2025-2026" });
const later = () => result("test-835", "2026-08-02T21:30:00Z", "2026-08-02T23:30:00Z", { round: 2, score: [0, 0], storageBucket: "2026-2027" });
function dataset() {
  const official = [earlier(), later()];
  const table = {
    "club:home:seniors": { P: 2, W: 1, D: 1, L: 0, GF: 4, GA: 1, GD: 3, points: 4 },
    "club:away:reserves": { P: 2, W: 0, D: 1, L: 1, GF: 1, GA: 4, GD: -3, points: 1 }
  };
  return {
    checkpoint: { asOf: cutoff, sourceTreeSha256: sha },
    contract: { competitionId: "test:league", seasonId: "2026", startsAt: start, scope: "IN_SCOPE",
      evidence: evidence("contract"), phases: [{ id: "Clausura", startsAt: start, expectedCount: 2,
        censusEvidence: evidence("schedule"), censusComplete: true, tableKind: "POINTS",
        rulesSupported: true, rankCertified: true, rulesEvidence: evidence("rules"),
        points: { win: 3, draw: 1, loss: 0 }, teams: Object.keys(table), adjustments: [],
        tableAsOf: cutoff, tableEvidence: evidence("official-table", cutoff), officialTable: table }] },
    official,
    canonical: structuredClone(official), verified: structuredClone(official),
    history: structuredClone(official), index: structuredClone(official),
    standings: { Clausura: structuredClone(table) },
    valueCensusComplete: true, valueCensusEvidence: evidence("issuance-register"), expectedValueEvaluations: [],
    value: []
  };
}
function hold(change, code) {
  const input = dataset();
  change(input);
  const result = reconcileSeason(input);
  assert.equal(result.verdict, "HOLD");
  assert.ok(result.issues.some(issue => issue.code === code), JSON.stringify(result.issues));
}
test("both global August buckets feed the same official Clausura table", () => {
  const input = dataset();
  const result = reconcileSeason(input);
  assert.equal(result.verdict, "VERIFIED_INPUTS");
  assert.deepEqual(result.standings.Clausura, input.standings.Clausura);
  assert.equal(fingerprint(result), fingerprint(reconcileSeason(input)));
});
test("verified FT omitted from history and index are separately detected", () => {
  hold(input => { input.history.shift(); input.index.shift(); }, "MISSING_REQUIRED_STAGE");
});
test("canonical goal mismatch fails even if both teams' table points agree", () => {
  hold(input => { input.canonical[0].score = [5, 1]; }, "EVENT_FIELD_CONFLICT");
});
test("canonical aliases cannot substitute for a reviewed identity", () => {
  hold(input => { input.official[0].identityEvidence = null; }, "OFFICIAL_EVENT_IDENTITY_OR_STATE_UNPROVEN");
});
test("provider namespace collision and duplicate stage rows fail closed", () => {
  hold(input => { input.official[1].providerIds = input.official[0].providerIds; }, "PROVIDER_ID_COLLISION_OR_INVALID");
  hold(input => { input.history.push(input.history[0]); }, "NON_UNIQUE_EVENT_ID");
});
test("provider-local IDs in distinct namespaces may coexist", () => {
  const input = dataset();
  input.official[1].providerIds = ["different:test-831"];
  assert.equal(reconcileSeason(input).verdict, "VERIFIED_INPUTS");
});
test("source or phase incompleteness blocks certification", () => {
  hold(input => { input.contract.phases[0].censusComplete = false; }, "PHASE_CENSUS_OR_RULE_UNPROVEN");
  hold(input => { input.official.pop(); }, "PHASE_CONSERVATION_FAILURE");
});
test("missed fixture with a past scheduled kickoff cannot clear the gate", () => {
  hold(input => { input.official[0].status = "SCHEDULED"; delete input.official[0].score; },
    "OFFICIAL_EVENT_IDENTITY_OR_STATE_UNPROVEN");
});
test("a future schedule stays in canonical without a fabricated FT", () => {
  const input = dataset();
  const future = result("future", "2026-12-01T20:00:00Z", cutoff, { status: "SCHEDULED", score: null });
  input.official.push(future);
  input.canonical.push(future);
  input.contract.phases[0].expectedCount++;
  assert.equal(reconcileSeason(input).verdict, "VERIFIED_INPUTS");
  input.verified.push(future);
  assert.ok(reconcileSeason(input).issues.some(issue => issue.code === "NON_PLAYED_IN_PLAYED_STORE"));
});
test("administrative score affects table once and must stay outside played stores", () => {
  const input = dataset();
  const award = { ...input.official[0], status: "AWARDED", score: null, awardScore: [4, 1],
    adjudication: evidence("tribunal", cutoff) };
  input.official[0] = input.canonical[0] = award;
  for (const stage of ["verified", "history", "index"]) input[stage].shift();
  assert.equal(reconcileSeason(input).verdict, "VERIFIED_INPUTS");
  input.history.push(award);
  assert.equal(reconcileSeason(input).verdict, "HOLD");
});
test("verified points adjustments propagate to official and project tables", () => {
  const input = dataset();
  const phase = input.contract.phases[0];
  const team = phase.teams[0];
  phase.adjustments.push({ id: "sanction", team, points: -1, evidence: evidence("sanction", cutoff) });
  phase.officialTable[team].points--;
  input.standings.Clausura[team].points--;
  assert.equal(reconcileSeason(input).verdict, "VERIFIED_INPUTS");
  phase.adjustments.push(phase.adjustments[0]);
  assert.ok(reconcileSeason(input).issues.some(issue => issue.code === "UNVERIFIED_TABLE_ADJUSTMENT"));
});
test("stale official tables and unsupported tie rules remain HOLD", () => {
  hold(input => { input.contract.phases[0].tableAsOf = start; }, "TABLE_RULE_OR_SNAPSHOT_UNPROVEN");
  hold(input => { input.contract.phases[0].rankCertified = false; }, "TABLE_RULE_OR_SNAPSHOT_UNPROVEN");
});
test("future-known results do not leak into a frozen Value input", () => {
  const input = dataset();
  input.official[0].evidence.availableAt = cutoff;
  input.value.push({ id: "issued", officialId: "test-835", asOf: "2026-08-02T20:00:00Z" });
  input.expectedValueEvaluations.push("issued");
  const result = reconcileSeason(input);
  assert.deepEqual(result.evaluations[0].shared.home, []);
  assert.equal(result.evaluations[0].shared.minimumSampleMet, false);
  assert.equal(result.verdict, "HOLD");
});
test("pre-August FT is available to both plans through one shared input hash", () => {
  const input = dataset();
  input.value.push({ id: "issued", officialId: "test-835", asOf: "2026-08-02T20:00:00Z" });
  input.expectedValueEvaluations.push("issued");
  const draft = reconcileSeason(input).evaluations[0];
  assert.equal(draft.shared.home[0].officialId, "test-831");
  assert.equal(draft.shared.homeAtHome[0].officialId, "test-831");
  input.value[0].planAInputHash = input.value[0].planBInputHash = draft.inputHash;
  assert.equal(reconcileSeason(input).verdict, "VERIFIED_INPUTS");
  input.value[0].planBInputHash = sha;
  assert.equal(reconcileSeason(input).verdict, "HOLD");
});
test("an empty Value list cannot stand in for a known issuance registry", () => {
  hold(input => { input.expectedValueEvaluations.push("missing"); }, "VALUE_EVALUATION_CENSUS_UNPROVEN");
});
test("Value exclusion needs policy evidence and preserves the FT", () => {
  const input = dataset();
  input.official[0].valuePolicy = "EXCLUDED";
  assert.equal(reconcileSeason(input).verdict, "HOLD");
  input.official[0].valuePolicyEvidence = evidence("policy");
  assert.equal(reconcileSeason(input).verdict, "VERIFIED_INPUTS");
});
test("readback demands all artifacts at one pinned base", () => {
  const artifacts = { "snapshot.json": sha, "manifest.json": sha };
  const input = dataset();
  const registry = approvedRegistry(input);
  const p = { reconciliation: reconcileRegisteredSeason(input, registry, fingerprint(registry)), expectedBase: sha, currentBase: sha,
    artifacts, requiredPaths: Object.keys(artifacts), local: artifacts, github: artifacts, publicReadback: artifacts };
  assert.equal(certifyPromotion(p).verdict, "VERIFIED_READBACK");
  assert.equal(certifyPromotion({ ...p, currentBase: "b".repeat(64) }).verdict, "HOLD");
  assert.equal(certifyPromotion({ ...p, artifacts: { "snapshot.json": sha } }).verdict, "HOLD");
  assert.equal(certifyPromotion({ ...p, publicReadback: {} }).verdict, "HOLD");
  assert.equal(certifyPromotion({ ...p, reconciliation: { verdict: "HOLD" } }).verdict, "HOLD");
});

function approvedRegistry(input) {
  const phase = input.contract.phases[0];
  const sourceIds = new Set([input.contract.evidence.sourceId, phase.censusEvidence.sourceId,
    phase.rulesEvidence.sourceId, phase.tableEvidence.sourceId,
    ...input.official.map(row => row.evidence.sourceId)]);
  return { schema: "ai-matchlab.official-competition-evidence-registry.v1", version: "test",
    competitions: [{ competitionId: input.contract.competitionId, organizer: "Test federation",
      scope: "APPROVED", effectiveFrom: start, scopeEvidence: evidence("scope"),
      seasons: [{ id: input.contract.seasonId, startsAt: start, calendar: input.contract.evidence,
        sources: [...sourceIds].map(id => ({ id, accessMethod: "OFFICIAL_API", authority: "OFFICIAL_ORGANIZER", grant: {
          status: "APPROVED", from: start, until: "2027-01-01T00:00:00Z",
          scopes: ["AUTOMATED_INGEST", "RETAIN_EVIDENCE", "DERIVE_INTERNAL_PROJECTIONS", "PUBLISH_DERIVED"],
          competitionIds: [input.contract.competitionId], seasonIds: [input.contract.seasonId], evidence: evidence("license")
        } })),
        phases: [{ id: phase.id, startsAt: phase.startsAt, tableKind: phase.tableKind, status: "COMPLETE_VERIFIED",
          asOf: cutoff, census: phase.censusEvidence, rules: phase.rulesEvidence,
          officialIds: input.official.map(row => row.officialId), censusFingerprint: fingerprint(input.official) }],
        identityDecisions: input.official.map(row => ({ officialId: row.officialId, canonicalId: row.canonicalId,
          home: row.home, away: row.away, providerIds: row.providerIds, status: "APPROVED",
          reviewId: "review-" + row.officialId, evidence: row.identityEvidence }))
      }] }] };
}
test("registered census requires an external pin and one reviewed mapping per event", () => {
  const input = dataset();
  const registry = approvedRegistry(input);
  assert.equal(reconcileRegisteredSeason(input, registry, fingerprint(registry)).verdict, "VERIFIED_INPUTS");
  assert.equal(reconcileRegisteredSeason(input, registry, sha).verdict, "HOLD");
  registry.competitions[0].seasons[0].identityDecisions.pop();
  assert.ok(reconcileRegisteredSeason(input, registry, fingerprint(registry)).issues.some(x =>
    x.code === "OFFICIAL_IDENTITY_LINK_UNVERIFIED" && x.officialId === "test-835"));
});
test("public visibility and expired grants cannot authorize automated use", () => {
  const input = dataset();
  const registry = approvedRegistry(input);
  const source = registry.competitions[0].seasons[0].sources.find(source => source.id === "test-831");
  source.accessMethod = "PUBLIC_REFERENCE";
  assert.ok(reconcileRegisteredSeason(input, registry, fingerprint(registry)).issues.some(x =>
    x.code === "OFFICIAL_SOURCE_ACCESS_UNVERIFIED" && x.officialId === "test-831"));
  source.accessMethod = "LICENSED_FEED";
  source.grant.until = cutoff;
  assert.equal(reconcileRegisteredSeason(input, registry, fingerprint(registry)).verdict, "HOLD");
});
test("a substitute official ID or changed evidence cannot pass an equal-size census", () => {
  const input = dataset();
  const registry = approvedRegistry(input);
  input.official[1].officialId = "substitute";
  const issue = reconcileRegisteredSeason(input, registry, fingerprint(registry)).issues
    .find(x => x.code === "OFFICIAL_CENSUS_NOT_RECONCILED");
  assert.deepEqual(issue.missingOfficialIds, ["test-835"]);
  assert.deepEqual(issue.unexpectedOfficialIds, ["substitute"]);
});
test("internal processing rights never authorize public promotion by themselves", () => {
  const input = dataset();
  const registry = approvedRegistry(input);
  registry.competitions[0].seasons[0].sources[0].grant.scopes.pop();
  const reconciliation = reconcileRegisteredSeason(input, registry, fingerprint(registry));
  assert.equal(reconciliation.verdict, "VERIFIED_INPUTS");
  assert.equal(reconciliation.registryBinding.publicReleaseAllowed, false);
  const artifacts = { "snapshot.json": sha };
  assert.equal(certifyPromotion({ reconciliation, expectedBase: sha, currentBase: sha,
    artifacts, requiredPaths: Object.keys(artifacts), local: artifacts, github: artifacts, publicReadback: artifacts
  }).verdict, "HOLD");
});
