import test from "node:test";
import assert from "node:assert/strict";

import {
  buildActiveCompetitionCompleteness,
  collectActiveCompetitionCompletenessIssues
} from "./active-competition-completeness-policy.js";

const DAY = "2026-08-07";

function competition(overrides = {}) {
  return {
    provider: "flashscore",
    providerCompetitionId: "comp-1",
    providerPath:
      "/football/argentina/liga-profesional/",
    providerCountry: "Argentina",
    providerName: "Liga Profesional",
    classification: "known_active",
    reasonCode:
      "resolved_exact_provider_path",
    canonicalSlug: "arg.1",
    publicationEligible: true,
    acquisitionEligible: true,
    targetDayFixtureCount: 2,
    targetDaySourceIds: ["fs-1", "fs-2"],
    ...overrides
  };
}

function discovery(rows = [competition()]) {
  return {
    schema:
      "ai-matchlab.provider-competition-discovery.v1",
    ok: true,
    dayKey: DAY,
    hash: "discovery-hash",
    competitions: rows
  };
}

function build(overrides = {}) {
  return buildActiveCompetitionCompleteness({
    dayKey: DAY,
    discovery: discovery(),
    effectiveSlugs: ["arg.1"],
    acquisitionRows: [{
      dayKey: DAY,
      slug: "arg.1",
      provider: "espn",
      rawEvents: 2,
      accepted: 2,
      error: null
    }],
    canonicalCounts:
      new Map([["arg.1", 2]]),
    ...overrides
  });
}

test(
  "known target-day provider fixtures are proven when canonical count covers them",
  () => {
    const result = build();

    assert.equal(result.ok, true);
    assert.equal(result.proven, true);
    assert.equal(result.status, "PASS");
    assert.equal(
      result.summary.targetDayProviderFixtures,
      2
    );
    assert.equal(
      result.bySlug["arg.1"]
        .canonicalFixtureCount,
      2
    );
    assert.deepEqual(
      result.blockingIssues,
      []
    );
  }
);

test(
  "known provider fixtures missing from canonical coverage fail closed",
  () => {
    const result = build({
      canonicalCounts:
        new Map([["arg.1", 1]])
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "ERROR");
    assert.equal(
      result.blockingIssues[0].reason,
      "canonical_fixture_shortfall"
    );
    assert.equal(
      result.blockingIssues[0].shortfall,
      1
    );

    const issues =
      collectActiveCompetitionCompletenessIssues({
        dayKey: DAY,
        coverageReadiness: {
          activeCompetitionCompleteness:
            result
        }
      });

    assert.equal(
      issues.some(issue =>
        issue.severity === "error" &&
        issue.type ===
          "active_competition_coverage_shortfall"
      ),
      true
    );
  }
);

test(
  "provider candidates remain quarantined and make the proof explicit warning",
  () => {
    const result = build({
      discovery: discovery([
        competition(),
        competition({
          providerCompetitionId:
            "unknown-1",
          providerPath:
            "/football/example/new-league/",
          providerCountry:
            "Example",
          providerName:
            "New League",
          classification: "candidate",
          reasonCode:
            "unmapped_provider_competition",
          canonicalSlug: null,
          publicationEligible: false,
          acquisitionEligible: false,
          targetDayFixtureCount: 3,
          targetDaySourceIds:
            ["x-1", "x-2", "x-3"]
        })
      ])
    });

    assert.equal(result.ok, true);
    assert.equal(result.proven, false);
    assert.equal(result.status, "WARNING");
    assert.equal(
      result.providerCandidates.length,
      1
    );

    const issues =
      collectActiveCompetitionCompletenessIssues({
        dayKey: DAY,
        coverageReadiness: {
          activeCompetitionCompleteness:
            result
        }
      });

    assert.equal(
      issues.some(issue =>
        issue.type ===
          "active_competition_scope_unresolved"
      ),
      true
    );
  }
);

test(
  "no-adapter acquisition is visible even when supplemental canonical coverage is complete",
  () => {
    const result = build({
      acquisitionRows: [{
        dayKey: DAY,
        slug: "arg.1",
        rawEvents: 0,
        accepted: 0,
        error:
          "no_enabled_adapter_for_league"
      }]
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "WARNING");
    assert.deepEqual(
      result.structuralNoAdapterSlugs,
      ["arg.1"]
    );
  }
);

test(
  "known covered slug outside effective seeds is visible without inventing a fixture loss",
  () => {
    const result = build({
      effectiveSlugs: []
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "WARNING");
    assert.deepEqual(
      result.knownActiveNotEffectiveSlugs,
      ["arg.1"]
    );
  }
);

test(
  "missing target-day discovery contract is a blocking proof failure",
  () => {
    const row = competition();
    delete row.targetDayFixtureCount;

    const result = build({
      discovery: discovery([row])
    });

    assert.equal(result.ok, false);
    assert.equal(result.proven, false);
    assert.equal(
      result.blockingIssues[0].reason,
      "provider_discovery_target_day_contract_missing"
    );
  }
);

test(
  "coverage artifact is required by System Health only from activation day",
  () => {
    assert.deepEqual(
      collectActiveCompetitionCompletenessIssues({
        dayKey: "2026-08-06",
        coverageReadiness: null
      }),
      []
    );

    const issues =
      collectActiveCompetitionCompletenessIssues({
        dayKey: DAY,
        coverageReadiness: null
      });

    assert.equal(issues.length, 1);
    assert.equal(issues[0].severity, "error");
    assert.equal(
      issues[0].type,
      "active_competition_completeness_missing"
    );
  }
);
