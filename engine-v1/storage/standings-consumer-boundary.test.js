import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  readStandings,
  readStandingsEvidence,
} from "./standings-memory-db.js";
import {
  listTrustedStandingsSlugs,
  readTrustedStandingsState,
} from "./trusted-standings-db.js";

test("consumer boundary exposes every currently PASS history-backed league", () => {
  const slugs = listTrustedStandingsSlugs();

  assert.ok(slugs.length > 0);
  assert.deepEqual(
    slugs,
    [...slugs].sort(),
  );

  for (const slug of slugs) {
    const state = readTrustedStandingsState(slug);
    const consumer = readStandings(slug);

    assert.equal(state.ok, true, slug);
    assert.equal(state.status, "PASS", slug);
    assert.equal(consumer.gate.status, "PASS", slug);
    assert.ok(
      (consumer.accepted?.rows?.length || 0) > 0,
      slug,
    );
  }
});
test("legacy research evidence cannot masquerade as consumer standings", () => {
  const bolEvidence = readStandingsEvidence("bol.1");
  assert.ok((bolEvidence?.accepted?.rows?.length || 0) > 0);

  const bolConsumer = readStandings("bol.1");
  assert.equal(bolConsumer.accepted, null);
  assert.equal(bolConsumer.gate.status, "GATED");
  assert.equal(readTrustedStandingsState("bol.1").status, "GATED");
});

test("trusted consumer view is sourced from validated foundation rather than raw evidence counts", () => {
  const slugs = listTrustedStandingsSlugs();
  assert.ok(slugs.length > 0);

  for (const slug of slugs) {
    const evidence = readStandingsEvidence(slug);
    const consumer = readStandings(slug);

    assert.equal(
      consumer.accepted?.source,
      "history-backed-standings-foundation",
      slug,
    );
    assert.equal(
      consumer.accepted?.rowCount,
      consumer.accepted?.rows?.length,
      slug,
    );

    if (evidence?.accepted?.rows) {
      assert.ok(
        Array.isArray(evidence.accepted.rows),
        slug,
      );
    }
  }
});
test("source collectors cannot write the consumer standings directory", () => {
  const collectSource = fs.readFileSync(
    new URL("../jobs/collect-standings.js", import.meta.url),
    "utf8",
  );
  assert.match(collectSource, /standings-research\/collected/);
  assert.doesNotMatch(collectSource, /path\.resolve\("\.\/data\/standings"\)/);

  const deriveSource = fs.readFileSync(
    new URL("../jobs/derive-standings-from-results.js", import.meta.url),
    "utf8",
  );
  assert.match(deriveSource, /readStandingsEvidence/);
});
