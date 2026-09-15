import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.resolve(here, "../jobs/run-daily-cycle.js"), "utf8");

test("recent history catch-up imports verified-final canonical convergence", () => {
  assert.match(
    source,
    /import\s+\{\s*promoteVerifiedFinalTruthToCanonicalDay\s*\}\s+from\s+"\.\/promote-verified-final-truth-to-canonical-day\.js";/u
  );
});

test("recent history catch-up converges verified-final nonterminal contradictions before parity summary and append", () => {
  const refresh = source.indexOf("historyTruthRefreshStatus = historyTruthRefresh?.status ?? null");
  const convergence = source.indexOf("promoteVerifiedFinalTruthToCanonicalDay(day, { write: true })");
  const summary = source.indexOf("const historyParitySummary = summarizeHistoryTruthParity(historyParity)");
  const append = source.indexOf("append = await appendFinalizedDayToHistory(day)");
  assert.ok(refresh >= 0);
  assert.ok(convergence > refresh);
  assert.ok(summary > convergence);
  assert.ok(append > summary);
});

test("convergence reruns canonical sync, readiness and history parity before append", () => {
  assert.match(
    source,
    /verifiedFinalCanonicalConvergence\?\.promotedRows[\s\S]*syncCanonicalFixturesToJsonDbDay\(day\)[\s\S]*readiness\s*=\s*auditFinalizationReadinessDay\(day\)[\s\S]*historyParity\s*=\s*buildHistoryDayFromTruth\(day\)/u
  );
});
