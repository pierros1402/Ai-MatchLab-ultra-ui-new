import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildHistoryBackedStandingsArtifact,
  isStrictStandingsHistoryRow,
  loadStandingsFoundationRegistry,
  readHistoryRows,
  sha256FileOrMissing,
  validateStandingsFoundationArtifact,
} from "./standings-foundation.js";

test("standings JSON fingerprints are checkout-newline invariant", () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "aiml-standings-fingerprint-")
  );
  const lf = path.join(dir, "lf.json");
  const crlf = path.join(dir, "crlf.json");

  try {
    const payload = "{\n  \"Silkeborg IF\": [\n    \"Silkeborg\"\n  ]\n}\n";
    fs.writeFileSync(lf, payload, "utf8");
    fs.writeFileSync(crlf, payload.replace(/\n/g, "\r\n"), "utf8");

    assert.equal(
      sha256FileOrMissing(lf),
      sha256FileOrMissing(crlf)
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("standings history rows reject scheduled/null score contamination", () => {
  assert.equal(isStrictStandingsHistoryRow({
    leagueSlug: "arg.1",
    status: "STATUS_SCHEDULED",
    homeTeam: "A",
    awayTeam: "B",
    scoreHome: 0,
    scoreAway: 0,
  }, "arg.1"), false);

  assert.equal(isStrictStandingsHistoryRow({
    leagueSlug: "arg.1",
    status: "FT",
    homeTeam: "A",
    awayTeam: "B",
    scoreHome: null,
    scoreAway: null,
  }, "arg.1"), false);

  assert.equal(isStrictStandingsHistoryRow({
    leagueSlug: "arg.1",
    status: "FT",
    homeTeam: "A",
    awayTeam: "B",
    scoreHome: 2,
    scoreAway: 1,
  }, "arg.1"), true);
});

test("real repaired history exposes only current contract-PASS standings", () => {
  const historyRows = readHistoryRows("2026-2027");
  const registryBundle = loadStandingsFoundationRegistry();
  const slugs = [
    "arg.1",
    "col.1",
    "den.1",
    "mex.1",
    "aus.1",
    "bol.1",
    "per.1",
    "rus.1",
  ];

  let usableCount = 0;

  for (const slug of slugs) {
    const artifact = buildHistoryBackedStandingsArtifact({
      slug,
      historySeason: "2026-2027",
      historyRows,
      registryBundle,
      builtAt: "TEST",
    });

    assert.equal(
      artifact.foundation.status === "PASS",
      artifact.foundation.usable,
      slug,
    );
    assert.equal(
      artifact.table.length > 0,
      artifact.foundation.usable,
      slug,
    );

    if (artifact.foundation.usable) {
      usableCount += 1;
      const validation =
        validateStandingsFoundationArtifact(artifact, {
          slug,
          historyRows,
        });
      assert.equal(validation.ok, true, slug);
    }
    else {
      assert.equal(artifact.table.length, 0, slug);
      assert.ok(
        artifact.foundation.reasonCodes.length > 0,
        slug,
      );
    }
  }

  assert.ok(usableCount > 0);
});
test("source lineage invalidates an artifact when league history changes", () => {
  const historyRows = readHistoryRows("2026-2027");
  const artifact = buildHistoryBackedStandingsArtifact({
    slug: "arg.1",
    historySeason: "2026-2027",
    historyRows,
    registryBundle: loadStandingsFoundationRegistry(),
    builtAt: "TEST",
  });
  assert.equal(artifact.foundation.status, "PASS");

  const changedRows = [...historyRows, {
    id: "test_lineage_change",
    leagueSlug: "arg.1",
    dayKey: "2026-08-09",
    status: "FT",
    homeTeam: "Boca Juniors",
    awayTeam: "River Plate",
    scoreHome: 9,
    scoreAway: 9,
    kickoff_ms: 9999999999999,
  }];

  const validation = validateStandingsFoundationArtifact(artifact, {
    slug: "arg.1",
    historyRows: changedRows,
  });
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.includes("HISTORY_FINGERPRINT_STALE"));
});
