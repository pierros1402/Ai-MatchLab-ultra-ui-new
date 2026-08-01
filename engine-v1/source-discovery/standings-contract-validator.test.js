import fs from "fs";
import path from "path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "url";

import { validateCompetitionFormatRegistry } from "../core/competition-format-registry.js";
import {
  validateStandingsContract,
  validateStandingsContractsBatch
} from "./standings-contract-validator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const registryPath = path.resolve(__dirname, "..", "..", "data", "competition-format-registry", "registry.v1.json");

function loadRegistry() {
  return JSON.parse(fs.readFileSync(registryPath, "utf8"));
}

function table(count, prefix = "team") {
  return Array.from({ length: count }, (_, index) => ({
    canonicalTeamId: `${prefix}-${index + 1}`,
    teamId: `${prefix}-${index + 1}`,
    team: `${prefix.toUpperCase()} ${index + 1}`,
    teamName: `${prefix.toUpperCase()} ${index + 1}`,
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

function phaseSplitRegistry() {
  return {
    schema: "ai-matchlab.competition-format-registry.v1",
    registryVersion: "2026-08-01.1",
    generatedAt: "2026-08-01T15:30:00.000Z",
    status: "PARTIAL_AUTHORITY_READ_ONLY",
    policy: {
      readOnlyValidation: true,
      mutationAllowed: false,
      unverifiedContractMode: "REPORT_ONLY",
      verifiedContractMode: "STRICT_REPORT_ONLY"
    },
    coverage: {
      contractCount: 1,
      enabledContractCount: 1,
      disabledContractCount: 0,
      teamCountAuthorityCount: 1,
      phaseAuthorityCount: 1,
      unverifiedContractCount: 0
    },
    contracts: [
      {
        contractId: "tst.1@2026-2027#v1",
        contractVersion: 1,
        competition: {
          slug: "tst.1",
          name: "Synthetic Phase League",
          country: "testland",
          region: "test",
          kind: "DOMESTIC_LEAGUE",
          enabled: true,
          coverageTier: 1
        },
        season: {
          reference: "2026-2027",
          model: "CROSS_YEAR",
          validFrom: "2026-07-01",
          validTo: "2027-06-30"
        },
        authority: {
          status: "VERIFIED",
          scopes: ["TEAM_COUNT", "PHASE_STRUCTURE"],
          verifiedAt: "2026-08-01",
          evidence: [
            {
              sourceClass: "PRIMARY_REGULATION",
              publisher: "Synthetic Test Federation",
              title: "Synthetic verified competition regulation",
              url: "https://example.com/test-league-format",
              retrievedAt: "2026-08-01",
              supports: ["TEAM_COUNT", "PHASE_STRUCTURE"]
            }
          ]
        },
        teamCount: {
          rule: { mode: "EXACT", value: 12, minimum: null, maximum: null },
          enforcement: "STRICT_REPORT_ONLY",
          sourceLabel: "synthetic verified contract"
        },
        tableModel: {
          format: "PHASE_SPLIT",
          primaryTableSource: "TABLE",
          allowUnknownPhaseKeys: false,
          phases: [
            {
              key: "regular",
              required: true,
              participantScope: "FULL_COMPETITION",
              teamCount: { mode: "EXACT", value: 12, minimum: null, maximum: null },
              authority: "VERIFIED"
            },
            {
              key: "championship",
              required: true,
              participantScope: "SUBSET",
              teamCount: { mode: "EXACT", value: 6, minimum: null, maximum: null },
              authority: "VERIFIED"
            },
            {
              key: "relegation",
              required: true,
              participantScope: "SUBSET",
              teamCount: { mode: "EXACT", value: 6, minimum: null, maximum: null },
              authority: "VERIFIED"
            }
          ],
          partitionGroups: [
            {
              id: "post-split",
              phaseKeys: ["championship", "relegation"],
              requireDisjoint: true,
              coversPrimaryUniverse: true,
              expectedUnionTeamCount: { mode: "EXACT", value: 12, minimum: null, maximum: null }
            }
          ]
        },
        rules: {
          promotion: { status: "UNVERIFIED" },
          relegation: { status: "UNVERIFIED" },
          continentalQualification: { status: "UNVERIFIED" },
          tieBreak: { status: "UNVERIFIED" },
          summary: "Synthetic contract used only by tests."
        },
        provenance: {
          seedSchema: "synthetic.test.v1",
          seedGeneratedAt: "2026-08-01T15:30:00.000Z",
          seedVerificationStatus: "VERIFIED_TEST_FIXTURE",
          observedPhaseKeys: ["regular", "championship", "relegation"]
        }
      }
    ]
  };
}

test("22 rows fail against a verified 20-team contract", () => {
  const registry = loadRegistry();
  const standings = { league: "col.1", table: table(22, "col") };
  const before = JSON.stringify(standings);
  const result = validateStandingsContract({
    registry,
    leagueSlug: "col.1",
    seasonReference: "2026",
    standings
  });

  assert.equal(result.status, "FAIL");
  assert.equal(result.summary.teamCountEvaluation.observed, 22);
  assert.equal(result.summary.teamCountEvaluation.expected.value, 20);
  assert.ok(result.issues.some(item => item.code === "TEAM_COUNT_ABOVE_CONTRACT"));
  assert.equal(result.publicationDecision, "NOT_APPLIED_READ_ONLY");
  assert.deepEqual(result.mutationGuard, {
    readOnly: true,
    mutationAttempted: false,
    mutations: []
  });
  assert.equal(JSON.stringify(standings), before, "validator must not mutate standings");
});

test("20 rows fail against a verified 16-team contract", () => {
  const registry = loadRegistry();
  const result = validateStandingsContract({
    registry,
    leagueSlug: "bol.1",
    seasonReference: "2026",
    standings: { league: "bol.1", table: table(20, "bol") }
  });

  assert.equal(result.status, "FAIL");
  assert.equal(result.summary.teamCountEvaluation.observed, 20);
  assert.equal(result.summary.teamCountEvaluation.expected.value, 16);
  assert.ok(result.issues.some(item => item.code === "TEAM_COUNT_ABOVE_CONTRACT"));
});

test("phase-split league validates each phase and does not sum phase rows as league size", () => {
  const registry = phaseSplitRegistry();
  const registryValidation = validateCompetitionFormatRegistry(registry);
  assert.equal(registryValidation.ok, true, JSON.stringify(registryValidation.issues, null, 2));

  const primary = table(12, "split");
  const standings = {
    league: "tst.1",
    table: primary,
    phaseTables: {
      regular: structuredClone(primary),
      championship: structuredClone(primary.slice(0, 6)).map((row, index) => ({ ...row, position: index + 1, rank: index + 1 })),
      relegation: structuredClone(primary.slice(6)).map((row, index) => ({ ...row, position: index + 1, rank: index + 1 }))
    }
  };

  const result = validateStandingsContract({
    registry,
    leagueSlug: "tst.1",
    seasonReference: "2026-2027",
    standings
  });

  assert.equal(result.status, "PASS", JSON.stringify(result.issues, null, 2));
  assert.equal(result.summary.primaryUniqueTeamCount, 12);
  assert.equal(result.summary.teamCountEvaluation.observed, 12);
  assert.equal(result.summary.phaseTableCount, 3);
  assert.equal(result.issues.some(item => item.code === "TEAM_COUNT_ABOVE_CONTRACT"), false);
});

test("unverified seed contract is reported as UNVERIFIED, not silently enforced", () => {
  const registry = loadRegistry();
  const contract = registry.contracts.find(item => item.authority.status === "UNVERIFIED");
  assert.ok(contract);
  const result = validateStandingsContract({
    registry,
    leagueSlug: contract.competition.slug,
    seasonReference: contract.season.reference,
    standings: { league: contract.competition.slug, table: table(22, "unverified") }
  });

  assert.equal(result.status, "UNVERIFIED");
  assert.equal(result.summary.teamCountEvaluation.evaluated, false);
  assert.ok(result.issues.some(item => item.code === "TEAM_COUNT_CONTRACT_UNVERIFIED"));
  assert.equal(result.issues.some(item => item.code === "TEAM_COUNT_ABOVE_CONTRACT"), false);
});

test("duplicate canonical team IDs fail even when names differ", () => {
  const registry = loadRegistry();
  const rows = table(20, "col");
  rows[1] = {
    ...rows[1],
    canonicalTeamId: rows[0].canonicalTeamId,
    teamId: rows[0].teamId,
    team: "Alias Name",
    teamName: "Alias Name"
  };
  const result = validateStandingsContract({
    registry,
    leagueSlug: "col.1",
    seasonReference: "2026",
    standings: { league: "col.1", table: rows }
  });

  assert.equal(result.status, "FAIL");
  assert.ok(result.issues.some(item => item.code === "DUPLICATE_TEAM_IDENTITY"));
});


test("batch output cannot look fully complete while contracts remain unverified", () => {
  const registry = loadRegistry();
  const contract = registry.contracts.find(item => item.authority.status === "UNVERIFIED");
  const batch = validateStandingsContractsBatch({
    registry,
    artifacts: [
      {
        leagueSlug: contract.competition.slug,
        seasonReference: contract.season.reference,
        standings: { league: contract.competition.slug, table: table(12, "batch-unverified") }
      }
    ]
  });

  assert.equal(batch.status, "COMPLETE_WITH_UNVERIFIED");
  assert.equal(batch.ok, true);
  assert.equal(batch.authorityComplete, false);
  assert.equal(batch.summary.unverified, 1);
});

test("provider-local teamId cannot masquerade as canonical identity", () => {
  const registry = loadRegistry();
  const rows = table(20, "col").map(row => {
    const copy = { ...row };
    delete copy.canonicalTeamId;
    copy.teamId = `provider:${copy.teamId}`;
    return copy;
  });

  const result = validateStandingsContract({
    registry,
    leagueSlug: "col.1",
    seasonReference: "2026",
    standings: { league: "col.1", table: rows }
  });

  assert.equal(result.status, "FAIL");
  assert.equal(result.summary.teamCountEvaluation.pass, true);
  assert.equal(result.summary.primaryCanonicalIdCount, 0);
  assert.equal(result.summary.primaryFallbackIdentityCount, 20);
  assert.equal(result.summary.primaryCanonicalIdentityComplete, false);
  assert.ok(result.issues.some(item => item.code === "CANONICAL_TEAM_ID_REQUIRED_FOR_TEAM_COUNT_AUTHORITY"));
});

test("globalClubId establishes canonical identity for authoritative team-count validation", () => {
  const registry = loadRegistry();
  const rows = table(20, "col").map(row => {
    const copy = { ...row, globalClubId: `global:${row.canonicalTeamId}` };
    delete copy.canonicalTeamId;
    copy.teamId = `provider:${row.teamId}`;
    return copy;
  });

  const result = validateStandingsContract({
    registry,
    leagueSlug: "col.1",
    seasonReference: "2026",
    standings: { league: "col.1", table: rows }
  });

  assert.equal(result.status, "PASS", JSON.stringify(result.issues, null, 2));
  assert.equal(result.summary.primaryCanonicalIdCount, 20);
  assert.equal(result.summary.primaryFallbackIdentityCount, 0);
  assert.equal(result.summary.primaryCanonicalIdentityComplete, true);
  assert.equal(result.issues.some(item => item.code === "CANONICAL_TEAM_ID_REQUIRED_FOR_TEAM_COUNT_AUTHORITY"), false);
});
