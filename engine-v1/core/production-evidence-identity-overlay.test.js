import test from "node:test";
import assert from "node:assert/strict";
import {
  createProductionEvidenceIdentityOverlay,
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
