import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildLegacyFixturesAggregateP0C,
  writeLegacyFixturesAggregate,
} from "./rebuild-legacy-fixtures-aggregate-p0c.js";

function overlayStub() {
  return {
    overlayEvidenceMatchRow(row, options = {}) {
      const sourceId = row.canonicalId;
      const resolvedId = sourceId === "suppressed"
        ? "retained"
        : sourceId;
      if (
        options.requireMembership &&
        !options.canonicalFixtureIds.has(resolvedId)
      ) {
        return { ok: false, status: "NOT_IN_UNIVERSE" };
      }
      const role = sourceId === "suppressed"
        ? "suppressed_lineage_alias"
        : sourceId === "retained"
          ? "retained"
          : "unmanaged";
      return {
        ok: true,
        view: {
          ...row,
          canonicalId: resolvedId,
          matchId: resolvedId,
          productionIdentityBinding: {
            sourceFixtureId: sourceId,
            resolvedFixtureId: resolvedId,
            sourceFixtureRole: role,
          },
        },
        fixtureResolution: {
          sourceFixtureId: sourceId,
          resolvedFixtureId: resolvedId,
          sourceRole: role,
        },
      };
    },
  };
}

function row(id, dayKey, kickoffUtc) {
  return {
    canonicalId: id,
    matchId: id,
    dayKey,
    kickoffUtc,
    leagueSlug: "test.1",
    homeTeam: "Alpha",
    awayTeam: "Beta",
    status: "PRE",
  };
}

test("rebuild preserves exact operational day set and canonical membership", () => {
  const artifact = buildLegacyFixturesAggregateP0C({
    overlay: overlayStub(),
    existingAggregate: {
      fixtures: [
        { ...row("suppressed", "2026-08-01", "2026-08-01T12:00:00Z"), minute: 10 },
        row("old-outside", "2026-08-02", "2026-08-02T12:00:00Z"),
      ],
    },
    canonicalByDay: {
      "2026-08-01": [
        row("suppressed", "2026-08-01", "2026-08-01T12:00:00Z"),
        row("retained", "2026-08-01", "2026-08-01T12:00:00Z"),
      ],
      "2026-08-02": [
        row("new-canonical", "2026-08-02", "2026-08-02T13:00:00Z"),
      ],
      "2026-08-03": [
        row("must-not-appear", "2026-08-03", "2026-08-03T12:00:00Z"),
      ],
    },
  });

  assert.deepEqual(
    artifact.rebuild.operationalDayKeys,
    ["2026-08-01", "2026-08-02"],
  );
  assert.deepEqual(
    artifact.fixtures.map(f => f.canonicalId),
    ["retained", "new-canonical"],
  );
  assert.equal(artifact.fixtures[0].minute, 10);
  assert.equal(artifact.rebuild.newOperationalDayCreated, false);
  assert.equal(artifact.rebuild.runtimeOnlyMembershipCreated, false);
});

test("missing canonical source for an operational day fails closed", () => {
  assert.throws(
    () => buildLegacyFixturesAggregateP0C({
      overlay: overlayStub(),
      existingAggregate: {
        fixtures: [row("x", "2026-08-01", "2026-08-01T12:00:00Z")],
      },
      canonicalByDay: {},
    }),
    /p0c_legacy_fixtures_missing_canonical_day:2026-08-01/,
  );
});

test("writer never creates backup or lock artifacts", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "aiml-p0c-legacy-fixtures-"),
  );
  const output = path.join(root, "fixtures.json");
  try {
    const artifact = buildLegacyFixturesAggregateP0C({
      overlay: overlayStub(),
      existingAggregate: {
        fixtures: [row("x", "2026-08-01", "2026-08-01T12:00:00Z")],
      },
      canonicalByDay: {
        "2026-08-01": [row("x", "2026-08-01", "2026-08-01T12:00:00Z")],
      },
    });
    const report = writeLegacyFixturesAggregate({
      artifact,
      outputPath: output,
    });
    assert.equal(report.backupWritten, false);
    assert.equal(fs.existsSync(`${output}.bak`), false);
    assert.equal(fs.existsSync(`${output}.lock`), false);
  }
  finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
