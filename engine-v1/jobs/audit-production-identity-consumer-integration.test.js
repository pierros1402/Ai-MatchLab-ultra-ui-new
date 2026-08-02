import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parseArgs,
  runConsumerIntegrationAudit,
} from "./audit-production-identity-consumer-integration.js";

function required(name) {
  const value = process.env[name];
  assert.ok(value, `${name} is required`);
  return value;
}

function artifactArgs() {
  return {
    contract:
      required("AIML_P0C_RESOLVER_CONTRACT"),
    registry:
      required("AIML_P0C_REGISTRY"),
    retention:
      required("AIML_P0C_RETENTION"),
    "source-ledger":
      required("AIML_P0C_SOURCE_LEDGER"),
  };
}

function firstDecision() {
  const ledger = JSON.parse(
    fs.readFileSync(
      required("AIML_P0C_RETENTION"),
      "utf8",
    ),
  );
  return ledger.decisions[0];
}

function fixture(
  fixtureId,
  decision,
) {
  return {
    canonicalId: fixtureId,
    matchId: fixtureId,
    leagueSlug: decision.leagueSlug,
    dayKey: decision.dayKey,
    kickoffUtc:
      `${decision.dayKey}T12:00:00.000Z`,
    homeTeam: "Home",
    awayTeam: "Away",
    status: "PRE",
    scoreHome: null,
    scoreAway: null,
  };
}

test("CLI parser requires explicit source-bound inputs", () => {
  const parsed = parseArgs([
    "node",
    "audit.js",
    "--canonical-root",
    "canonical",
    "--contract",
    "contract.json",
    "--registry",
    "registry.json",
    "--retention",
    "retention.json",
    "--source-ledger",
    "source.json",
    "--expected-affected-files",
    "1",
    "--output",
    "audit.json",
  ]);

  assert.equal(parsed["canonical-root"], "canonical");
  assert.equal(parsed.output, "audit.json");
});

test("paired retained and suppressed rows resolve read-only", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "aiml-t1a-audit-"),
  );

  try {
    const decision = firstDecision();
    const canonicalRoot =
      path.join(root, "canonical");
    const dayRoot =
      path.join(canonicalRoot, decision.dayKey);

    fs.mkdirSync(dayRoot, { recursive: true });

    const filePath =
      path.join(
        dayRoot,
        `${decision.leagueSlug}.json`,
      );

    fs.writeFileSync(
      filePath,
      JSON.stringify({
        fixtures: [
          fixture(
            decision.retainedRepositoryFixtureId,
            decision,
          ),
          fixture(
            decision.suppressedRepositoryFixtureIds[0],
            decision,
          ),
          fixture(
            "cid_unmanaged_test_20260708",
            decision,
          ),
        ],
      }),
      "utf8",
    );

    const before =
      fs.readFileSync(filePath);

    const output =
      path.join(root, "audit.json");

    const report =
      runConsumerIntegrationAudit({
        "canonical-root": canonicalRoot,
        ...artifactArgs(),
        "expected-affected-files": "1",
        output,
      });

    assert.equal(report.ok, true);
    assert.equal(
      report.status,
      "PASS_T1A_LOCAL_INTEGRATION_NO_DATA_WRITES",
    );
    assert.equal(
      report.summary.affectedCanonicalFiles,
      1,
    );
    assert.equal(
      report.summary.retainedRowsPresent,
      1,
    );
    assert.equal(
      report.summary.suppressedRowsPresent,
      1,
    );
    assert.equal(
      report.summary.suppressedWithRetainedTarget,
      1,
    );
    assert.equal(
      report.summary.identityOverlayRows,
      1,
    );
    assert.equal(
      report.summary.productionArtifactsUpdated,
      0,
    );
    assert.deepEqual(
      fs.readFileSync(filePath),
      before,
    );
  }
  finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("suppressed-only canonical row is reported but never written", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "aiml-t1a-audit-"),
  );

  try {
    const decision = firstDecision();
    const canonicalRoot =
      path.join(root, "canonical");
    const dayRoot =
      path.join(canonicalRoot, decision.dayKey);

    fs.mkdirSync(dayRoot, { recursive: true });

    const filePath =
      path.join(
        dayRoot,
        `${decision.leagueSlug}.json`,
      );

    fs.writeFileSync(
      filePath,
      JSON.stringify({
        fixtures: [
          fixture(
            decision.suppressedRepositoryFixtureIds[0],
            decision,
          ),
        ],
      }),
      "utf8",
    );

    const before =
      fs.readFileSync(filePath);

    const output =
      path.join(root, "audit.json");

    const report =
      runConsumerIntegrationAudit({
        "canonical-root": canonicalRoot,
        ...artifactArgs(),
        "expected-affected-files": "1",
        output,
      });

    assert.equal(report.ok, true);
    assert.equal(
      report.summary.suppressedWithoutRetainedTarget,
      1,
    );
    assert.equal(
      report.affectedFiles[0]
        .diagnostics.outputRows,
      0,
    );
    assert.equal(
      report.summary.fixtureRowsDeleted,
      0,
    );
    assert.deepEqual(
      fs.readFileSync(filePath),
      before,
    );
  }
  finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
