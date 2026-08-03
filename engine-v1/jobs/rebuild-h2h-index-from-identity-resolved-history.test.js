import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildH2HArtifactsFromHistory,
  materializeH2HArtifacts,
} from "./rebuild-h2h-index-from-identity-resolved-history.js";

function overlayStub() {
  return {
    overlayEvidenceMatchRow(row) {
      const sourceId = row.canonicalId;
      const suppressed = sourceId === "suppressed-1";
      const resolved = suppressed ? "retained-1" : sourceId;
      const home = row.homeTeam || row.home;
      const away = row.awayTeam || row.away;
      return {
        ok: true,
        fixtureResolution: {
          sourceFixtureId: sourceId,
          resolvedFixtureId: resolved,
          sourceRole: suppressed
            ? "suppressed_lineage_alias"
            : "unmanaged",
          managed: suppressed,
        },
        homeResolution: {
          preferredDisplayName: home,
          sourceAlias: home,
          globalClubId: null,
        },
        awayResolution: {
          preferredDisplayName: away,
          sourceAlias: away,
          globalClubId: null,
        },
        binding: {
          sourceFixtureId: sourceId,
          resolvedFixtureId: resolved,
          sourceFixtureRole: suppressed
            ? "suppressed_lineage_alias"
            : "unmanaged",
          scoreTruthChanged: false,
          statusTruthChanged: false,
        },
      };
    },
  };
}

test("build resolves suppressed IDs, deduplicates, sorts and avoids wall clock", () => {
  const historyDocuments = [{
    days: [{
      dayKey: "2026-07-01",
      rows: [
        {
          id: "suppressed-1",
          homeTeam: "Alpha FC",
          awayTeam: "Beta FC",
          scoreHome: 1,
          scoreAway: 0,
          leagueSlug: "test.1",
        },
        {
          id: "retained-1",
          homeTeam: "Alpha FC",
          awayTeam: "Beta FC",
          scoreHome: 1,
          scoreAway: 0,
          leagueSlug: "test.1",
        },
      ],
    }, {
      dayKey: "2026-07-03",
      rows: [{
        id: "other-2",
        homeTeam: "Beta FC",
        awayTeam: "Alpha FC",
        scoreHome: 2,
        scoreAway: 2,
        leagueSlug: "test.1",
      }],
    }],
  }];

  const build = buildH2HArtifactsFromHistory({
    historyDocuments,
    overlay: overlayStub(),
  });

  assert.equal(build.ok, true);
  assert.equal(build.artifactCount, 1);
  assert.equal(build.stats.duplicateRows, 1);
  assert.equal(build.stats.suppressedAliasesResolved, 1);
  const payload = build.artifacts[0].payload;
  assert.deepEqual(
    payload.matches.map(row => row.matchId),
    ["other-2", "retained-1"],
  );
  assert.equal(payload.updatedAt, "2026-07-03T00:00:00.000Z");
  assert.equal(payload.rebuild.wallClockTimestampUsed, false);
});

test("conflicting duplicate retained truth fails closed", () => {
  assert.throws(
    () => buildH2HArtifactsFromHistory({
      overlay: overlayStub(),
      historyDocuments: [{
        rows: [
          {
            id: "suppressed-1",
            dayKey: "2026-07-01",
            homeTeam: "Alpha",
            awayTeam: "Beta",
            scoreHome: 1,
            scoreAway: 0,
          },
          {
            id: "retained-1",
            dayKey: "2026-07-01",
            homeTeam: "Alpha",
            awayTeam: "Beta",
            scoreHome: 3,
            scoreAway: 0,
          },
        ],
      }],
    }),
    /p0c_h2h_duplicate_truth_conflict:retained-1/,
  );
});

test("materializer writes exact deterministic files to explicit root", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "aiml-p0c-h2h-"),
  );
  const output = path.join(root, "h2h");
  try {
    const build = buildH2HArtifactsFromHistory({
      overlay: overlayStub(),
      historyDocuments: [{
        rows: [{
          id: "m1",
          dayKey: "2026-07-01",
          homeTeam: "Alpha",
          awayTeam: "Beta",
          scoreHome: 0,
          scoreAway: 0,
        }],
      }],
    });
    const report = materializeH2HArtifacts({
      build,
      outputRoot: output,
    });
    assert.equal(report.artifactCount, 1);
    const files = fs.readdirSync(output);
    assert.equal(files.length, 1);
    const data = JSON.parse(
      fs.readFileSync(path.join(output, files[0]), "utf8"),
    );
    assert.equal(data.matches[0].matchId, "m1");
    assert.equal(report.repositoryApplicationAuthorized, false);
  }
  finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("materializer refuses implicit replacement", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "aiml-p0c-h2h-"),
  );
  try {
    assert.throws(
      () => materializeH2HArtifacts({
        build: { ok: true, artifacts: [] },
        outputRoot: root,
      }),
      /p0c_h2h_output_root_exists/,
    );
  }
  finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
