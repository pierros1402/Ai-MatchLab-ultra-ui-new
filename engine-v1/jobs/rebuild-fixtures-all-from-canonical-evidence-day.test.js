import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildFixturesAllFromCanonicalEvidenceDay,
  writeFixturesAllArtifact,
} from "./rebuild-fixtures-all-from-canonical-evidence-day.js";

function overlayStub() {
  return {
    overlayEvidenceMatchRow(row, options = {}) {
      const sourceId = row.canonicalId;
      const resolvedId = sourceId === "suppressed-1"
        ? "retained-1"
        : sourceId;
      if (
        options.requireMembership &&
        !options.canonicalFixtureIds.has(resolvedId)
      ) {
        return {
          ok: false,
          status: "RESOLVED_FIXTURE_NOT_IN_CANONICAL_UNIVERSE",
        };
      }
      const role = sourceId === "suppressed-1"
        ? "suppressed_lineage_alias"
        : sourceId === "retained-1"
          ? "retained"
          : "unmanaged";
      const view = {
        ...row,
        canonicalId: resolvedId,
        matchId: resolvedId,
        productionIdentityBinding: {
          sourceFixtureId: sourceId,
          resolvedFixtureId: resolvedId,
          sourceFixtureRole: role,
        },
      };
      return {
        ok: true,
        view,
        fixtureResolution: {
          sourceFixtureId: sourceId,
          resolvedFixtureId: resolvedId,
          sourceRole: role,
        },
      };
    },
  };
}

function canonical(id) {
  return {
    canonicalId: id,
    matchId: id,
    dayKey: "2026-08-01",
    leagueSlug: "test.1",
    homeTeam: "Alpha",
    awayTeam: "Beta",
    kickoffUtc: "2026-08-01T12:00:00.000Z",
    status: "PRE",
    scoreHome: null,
    scoreAway: null,
  };
}

test("retained membership wins over suppressed duplicate and provider cannot create membership", () => {
  const artifact = buildFixturesAllFromCanonicalEvidenceDay({
    dayKey: "2026-08-01",
    overlay: overlayStub(),
    canonicalRows: [
      canonical("suppressed-1"),
      canonical("retained-1"),
      {
        ...canonical("unmanaged-2"),
        kickoffUtc: "2026-08-01T13:00:00.000Z",
      },
    ],
    providerEvidenceRows: [
      {
        id: "suppressed-1",
        home: "Provider Alpha",
        away: "Provider Beta",
        round: "Round 1",
        status: "WRONG",
      },
      {
        id: "outside-3",
        round: "Outside",
      },
    ],
  });

  assert.equal(artifact.matchCount, 2);
  assert.deepEqual(
    artifact.matches.map(row => row.canonicalId),
    ["retained-1", "unmanaged-2"],
  );
  const retained = artifact.matches[0];
  assert.equal(retained.round, "Round 1");
  assert.equal(retained.homeTeam, "Alpha");
  assert.equal(retained.status, "PRE");
  assert.equal(
    retained.productionIdentityBinding
      .providerEvidenceSelectedSourceFixtureId,
    "suppressed-1",
  );
  assert.equal(artifact.diagnostics.providerEvidenceSkipped, 1);
  assert.equal(artifact.diagnostics.fixtureMembershipCreated, 0);
});

test("canonical duplicate with conflicting truth fails closed", () => {
  assert.throws(
    () => buildFixturesAllFromCanonicalEvidenceDay({
      dayKey: "2026-08-01",
      overlay: overlayStub(),
      canonicalRows: [
        canonical("suppressed-1"),
        {
          ...canonical("retained-1"),
          homeTeam: "Different",
        },
      ],
    }),
    /p0c_fixtures_all_canonical_truth_conflict:retained-1/,
  );
});

test("artifact order is deterministic by kickoff then retained ID", () => {
  const artifact = buildFixturesAllFromCanonicalEvidenceDay({
    dayKey: "2026-08-01",
    overlay: overlayStub(),
    canonicalRows: [
      { ...canonical("b"), kickoffUtc: "2026-08-01T13:00:00Z" },
      { ...canonical("c"), kickoffUtc: "2026-08-01T12:00:00Z" },
      { ...canonical("a"), kickoffUtc: "2026-08-01T13:00:00Z" },
    ],
  });
  assert.deepEqual(
    artifact.matches.map(row => row.canonicalId),
    ["c", "a", "b"],
  );
  assert.equal(artifact.diagnostics.wallClockTimestampUsed, false);
  assert.equal(artifact.diagnostics.networkUsed, false);
});

test("writer requires explicit replacement and writes matches shape", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "aiml-p0c-fixtures-all-"),
  );
  const output = path.join(root, "fixtures-all.json");
  try {
    const artifact = buildFixturesAllFromCanonicalEvidenceDay({
      dayKey: "2026-08-01",
      overlay: overlayStub(),
      canonicalRows: [canonical("one")],
    });
    writeFixturesAllArtifact({ artifact, outputPath: output });
    const stored = JSON.parse(fs.readFileSync(output, "utf8"));
    assert.equal(stored.matches.length, 1);
    assert.throws(
      () => writeFixturesAllArtifact({ artifact, outputPath: output }),
      /p0c_fixtures_all_output_exists/,
    );
  }
  finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
