import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createProductionEvidenceIdentityOverlay,
  overlayProductionEvidenceDocumentReadView,
  overlayProductionEvidenceFixtureIdReadView,
  overlayProductionEvidenceMatchRowReadView,
  overlayProductionEvidenceTeamKeyedEntriesReadView,
  overlayProductionEvidenceTeamRowReadView,
} from "./production-evidence-identity-overlay.js";

function fakeResolver() {
  const fixtureMap = new Map([
    ["retained-1", {
      ok: true,
      status: "RETAINED_FIXTURE_IDEMPOTENT",
      sourceFixtureId: "retained-1",
      resolvedFixtureId: "retained-1",
      sourceRole: "retained",
    }],
    ["suppressed-1", {
      ok: true,
      status: "SUPPRESSED_FIXTURE_LINEAGE_ALIAS_RESOLVED",
      sourceFixtureId: "suppressed-1",
      resolvedFixtureId: "retained-1",
      sourceRole: "suppressed_lineage_alias",
    }],
  ]);

  const teamMap = new Map([
    ["home", {
      globalClubId: "club-home",
      ledgerTeamIdentityKey: "team-home",
      preferredDisplayName: "Home FC",
    }],
    ["away", {
      globalClubId: "club-away",
      ledgerTeamIdentityKey: "team-away",
      preferredDisplayName: "Away FC",
    }],
  ]);

  return {
    isManagedFixtureId(id) {
      return fixtureMap.has(id);
    },
    resolveFixtureId(id) {
      return fixtureMap.get(id) || {
        ok: false,
        status: "UNKNOWN_FIXTURE_ID",
      };
    },
    resolveFixtureMembership({
      repositoryFixtureId,
      canonicalFixtureIds,
    }) {
      const resolved = this.resolveFixtureId(repositoryFixtureId);
      if (!resolved.ok) return resolved;
      const set = canonicalFixtureIds instanceof Set
        ? canonicalFixtureIds
        : new Set(canonicalFixtureIds);
      if (!set.has(resolved.resolvedFixtureId)) {
        return {
          ok: false,
          status: "RESOLVED_FIXTURE_NOT_IN_CANONICAL_UNIVERSE",
          ...resolved,
        };
      }
      return {
        ...resolved,
        ok: true,
      };
    },
    resolveTeamReference(reference = {}) {
      const alias = String(reference.alias || "").trim().toLowerCase();
      const key = alias.includes("home") ? "home"
        : alias.includes("away") ? "away"
        : null;
      if (reference.globalClubId === "club-home") key;
      const value = key ? teamMap.get(key) : null;
      return value
        ? {
            ok: true,
            status: "RESOLVED_EXACT_IDENTITY",
            ...value,
            matchedSignals: ["normalizedExactGenesisAlias"],
          }
        : {
            ok: false,
            status: reference.globalClubId
              ? "GLOBAL_CLUB_ID_NOT_FOUND"
              : "NORMALIZED_EXACT_ALIAS_NOT_FOUND",
          };
    },
  };
}

test("suppressed fixture resolves to retained identity without mutating source", () => {
  const overlay = createProductionEvidenceIdentityOverlay({
    resolver: fakeResolver(),
  });
  const source = {
    canonicalId: "suppressed-1",
    matchId: "suppressed-1",
    homeTeam: "Home FC",
    awayTeam: "Away FC",
    scoreHome: 2,
    scoreAway: 1,
    status: "FT",
  };
  const before = JSON.stringify(source);
  const result = overlay.overlayEvidenceMatchRow(source);

  assert.equal(result.ok, true);
  assert.equal(result.view.canonicalId, "retained-1");
  assert.equal(result.view.matchId, "retained-1");
  assert.equal(result.binding.sourceFixtureId, "suppressed-1");
  assert.equal(result.binding.resolvedFixtureId, "retained-1");
  assert.equal(result.view.scoreHome, 2);
  assert.equal(result.view.scoreAway, 1);
  assert.equal(result.view.status, "FT");
  assert.equal(JSON.stringify(source), before);
  assert.equal(result.sourceEvidenceRewritten, false);
});

test("unmanaged fixture and team aliases are preserved read-only", () => {
  const overlay = createProductionEvidenceIdentityOverlay({
    resolver: fakeResolver(),
  });
  const result = overlay.overlayEvidenceMatchRow({
    id: "external-9",
    home: "Alpha Club",
    away: "Beta Club",
    scoreHome: null,
    scoreAway: null,
    status: "PRE",
  });

  assert.equal(result.ok, true);
  assert.equal(result.view.id, "external-9");
  assert.equal(result.fixtureResolution.managed, false);
  assert.equal(result.homeResolution.managed, false);
  assert.equal(result.awayResolution.managed, false);
});

test("membership resolution never creates membership", () => {
  const overlay = createProductionEvidenceIdentityOverlay({
    resolver: fakeResolver(),
  });

  const missing = overlay.resolveEvidenceFixtureMembership({
    repositoryFixtureId: "suppressed-1",
    canonicalFixtureIds: new Set(["other"]),
  });
  assert.equal(missing.ok, false);
  assert.equal(
    missing.status,
    "RESOLVED_FIXTURE_NOT_IN_CANONICAL_UNIVERSE",
  );
  assert.equal(missing.fixtureMembershipCreated, false);

  const present = overlay.resolveEvidenceFixtureMembership({
    repositoryFixtureId: "suppressed-1",
    canonicalFixtureIds: new Set(["retained-1"]),
  });
  assert.equal(present.ok, true);
  assert.equal(present.resolvedFixtureId, "retained-1");
  assert.equal(present.fixtureMembershipCreated, false);
});

test("conflicting fixture signals fail closed", () => {
  const resolver = fakeResolver();
  resolver.isManagedFixtureId = () => true;
  resolver.resolveFixtureId = id => ({
    ok: true,
    sourceFixtureId: id,
    resolvedFixtureId: id,
    sourceRole: "retained",
  });
  const overlay = createProductionEvidenceIdentityOverlay({ resolver });
  const result = overlay.overlayEvidenceMatchRow({
    canonicalId: "one",
    matchId: "two",
    homeTeam: "Home FC",
    awayTeam: "Away FC",
  });
  assert.equal(result.ok, false);
  assert.equal(
    result.status,
    "CONFLICTING_EVIDENCE_FIXTURE_IDENTITIES",
  );
});

test("explicit unknown global club ID fails closed", () => {
  const overlay = createProductionEvidenceIdentityOverlay({
    resolver: fakeResolver(),
  });
  assert.throws(
    () => overlay.overlayEvidenceTeamIdentity({
      globalClubId: "missing-club",
      alias: "Unknown",
    }),
    /explicit_team_identity_resolution_failed/,
  );
});

test("fixture-only read view resolves suppressed IDs without source mutation", () => {
  const overlay = createProductionEvidenceIdentityOverlay({
    resolver: fakeResolver(),
  });
  const source = {
    matchId: "suppressed-1",
    market: "OU25",
  };
  const before = JSON.stringify(source);
  const view = overlayProductionEvidenceFixtureIdReadView(
    source,
    { overlay },
  );

  assert.equal(view.matchId, "retained-1");
  assert.equal(
    view.productionIdentityBinding.sourceFixtureId,
    "suppressed-1",
  );
  assert.equal(
    view.productionIdentityBinding.resolvedFixtureId,
    "retained-1",
  );
  assert.equal(JSON.stringify(source), before);
});

test("recursive document read view overlays nested match evidence only", () => {
  const overlay = createProductionEvidenceIdentityOverlay({
    resolver: fakeResolver(),
  });
  const source = {
    player: {
      id: "player-7",
      name: "Player Seven",
    },
    task: {
      match: {
        matchId: "suppressed-1",
        homeTeam: "Home FC",
        awayTeam: "Away FC",
        scoreHome: 2,
        scoreAway: 1,
        status: "FT",
      },
    },
  };
  const before = JSON.stringify(source);
  const view = overlayProductionEvidenceDocumentReadView(
    source,
    { overlay },
  );

  assert.equal(view.player.id, "player-7");
  assert.equal(
    view.task.match.matchId,
    "retained-1",
  );
  assert.equal(view.task.match.scoreHome, 2);
  assert.equal(view.task.match.scoreAway, 1);
  assert.equal(view.task.match.status, "FT");
  assert.equal(JSON.stringify(source), before);
});

test("team row read view adds identity binding without renaming source team", () => {
  const overlay = createProductionEvidenceIdentityOverlay({
    resolver: fakeResolver(),
  });
  const source = {
    teamName: "Home FC",
    points: 40,
  };
  const view =
    overlayProductionEvidenceTeamRowReadView(
      source,
      { overlay },
    );

  assert.equal(view.teamName, "Home FC");
  assert.equal(
    view.productionIdentityBinding.globalClubId,
    "club-home",
  );
  assert.equal(
    view.productionIdentityBinding.overlayOnly,
    true,
  );
  assert.equal(source.productionIdentityBinding, undefined);
});

test("team-keyed evidence view resolves entry fixture IDs without changing keys", () => {
  const overlay = createProductionEvidenceIdentityOverlay({
    resolver: fakeResolver(),
  });
  const source = {
    slug: "league.1",
    teams: {
      "Home FC": [
        {
          matchId: "suppressed-1",
          date: "2026-08-01",
        },
      ],
    },
  };
  const view =
    overlayProductionEvidenceTeamKeyedEntriesReadView(
      source,
      { overlay },
    );

  assert.deepEqual(
    Object.keys(view.teams),
    ["Home FC"],
  );
  assert.equal(
    view.teams["Home FC"][0].matchId,
    "retained-1",
  );
  assert.equal(
    view.productionIdentityBindings
      .teams["Home FC"].globalClubId,
    "club-home",
  );
  assert.equal(
    source.teams["Home FC"][0].matchId,
    "suppressed-1",
  );
});

test("P5 integration contract binds all 18 selected consumer read boundaries", () => {
  const here = path.dirname(
    fileURLToPath(import.meta.url),
  );
  const projectRoot = path.resolve(
    here,
    "..",
    "..",
  );
  const consumers = [
    "engine-v1/jobs/build-team-news-research-tasks-day.js",
    "engine-v1/jobs/run-team-news-research-tasks-day.js",
    "engine-v1/jobs/build-team-news-research-review-day.js",
    "engine-v1/jobs/promote-team-news-review-day.js",
    "engine-v1/jobs/build-team-news-day.js",
    "engine-v1/storage/odds-memory-db.js",
    "engine-v1/jobs/build-value-plan-comparison-day.js",
    "engine-v1/jobs/export-odds-snapshot-day.js",
    "engine-v1/jobs/build-current-season-indexes.js",
    "engine-v1/jobs/build-model-priors.js",
    "engine-v1/jobs/bootstrap-h2h-from-history.js",
    "engine-v1/ai-match-intelligence/load-intelligence-support.js",
    "engine-v1/storage/standings-memory-db.js",
    "engine-v1/storage/standings-history-db.js",
    "engine-v1/storage/discipline-memory-db.js",
    "engine-v1/storage/lineups-memory-db.js",
    "engine-v1/core/value-engine-v1.js",
    "engine-v1/storage/observations-db.js",
  ];

  assert.equal(consumers.length, 18);

  for (const relativePath of consumers) {
    const source = fs.readFileSync(
      path.join(projectRoot, relativePath),
      "utf8",
    );
    assert.match(
      source,
      /P0-C P5 READ BOUNDARY:/,
      relativePath,
    );
    assert.match(
      source,
      /production-evidence-identity-overlay\.js/,
      relativePath,
    );
  }
});

test("fixture-only read view fails closed on conflicting managed signals", () => {
  const resolver = fakeResolver();
  resolver.isManagedFixtureId = () => true;
  resolver.resolveFixtureId = id => ({
    ok: true,
    sourceFixtureId: id,
    resolvedFixtureId: id,
    sourceRole: "retained",
  });
  const overlay = createProductionEvidenceIdentityOverlay({
    resolver,
  });

  assert.throws(
    () =>
      overlayProductionEvidenceFixtureIdReadView(
        {
          matchId: "one",
          canonicalId: "two",
        },
        { overlay },
      ),
    /production_evidence_read_conflicting_fixture_identities/,
  );
});

test("P5 write-capable stores keep source writes on raw reads", () => {
  const here = path.dirname(
    fileURLToPath(import.meta.url),
  );
  const projectRoot = path.resolve(
    here,
    "..",
    "..",
  );
  const contracts = [
    {
      path: "engine-v1/storage/odds-memory-db.js",
      required: [
        "function readOddsRaw",
        "const rec = readOddsRaw(matchId)",
        "const cur = readOddsRaw(matchId)",
      ],
    },
    {
      path: "engine-v1/storage/standings-memory-db.js",
      required: [
        "function readStandingsRaw",
        "const cur = readStandingsRaw(slug)",
      ],
    },
    {
      path: "engine-v1/storage/standings-history-db.js",
      required: [
        "function readHistoryRaw",
        "const h = readHistoryRaw(slug)",
      ],
    },
    {
      path: "engine-v1/storage/discipline-memory-db.js",
      required: [
        "function readDisciplineRaw",
        "const data = readDisciplineRaw(slug)",
      ],
    },
    {
      path: "engine-v1/storage/lineups-memory-db.js",
      required: [
        "function readLineupsRaw",
        "const data = readLineupsRaw(slug)",
      ],
    },
    {
      path: "engine-v1/storage/observations-db.js",
      required: [
        "function readObservationsRaw",
        "const current = readObservationsRaw()",
      ],
    },
  ];

  for (const contract of contracts) {
    const source = fs.readFileSync(
      path.join(projectRoot, contract.path),
      "utf8",
    );

    for (const required of contract.required) {
      assert.ok(
        source.includes(required),
        `${contract.path}: ${required}`,
      );
    }
  }
});
