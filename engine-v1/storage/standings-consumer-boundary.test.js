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

test("consumer boundary exposes exactly the four PASS history-backed leagues", () => {
  assert.deepEqual(
    listTrustedStandingsSlugs(),
    ["arg.1", "col.1", "den.1", "mex.1"],
  );
});

test("legacy research evidence cannot masquerade as consumer standings", () => {
  const bolEvidence = readStandingsEvidence("bol.1");
  assert.ok((bolEvidence?.accepted?.rows?.length || 0) > 0);

  const bolConsumer = readStandings("bol.1");
  assert.equal(bolConsumer.accepted, null);
  assert.equal(bolConsumer.gate.status, "GATED");
  assert.equal(readTrustedStandingsState("bol.1").status, "GATED");
});

test("trusted consumer view ignores larger stale league-memory tables", () => {
  assert.equal(readStandingsEvidence("den.1")?.accepted?.rows?.length, 20);
  assert.equal(readStandings("den.1")?.accepted?.rows?.length, 12);

  assert.equal(readStandingsEvidence("mex.1")?.accepted?.rows?.length, 22);
  assert.equal(readStandings("mex.1")?.accepted?.rows?.length, 18);
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
