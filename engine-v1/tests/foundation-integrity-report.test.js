import test from "node:test";
import assert from "node:assert/strict";

import { buildFoundationIntegrityReport, foundationIntegrityCliSummary } from "../jobs/build-foundation-integrity-report.js";

function cleanOptions(overrides = {}) {
  return {
    season: "2026-2027",
    buildSemanticHistoryAudit: () => ({
      ok: true,
      clean: true,
      issueCounts: { error: 0, warning: 0, info: 1 },
      resultsMemory: { expiredEntryCount: 288 },
      ...overrides.history,
    }),
    auditStandingsFoundation: () => ({
      ok: true,
      summary: { artifacts: 157, pass: 4, gated: 153, invalid: 0, unsafeGatedConsumerTables: 0 },
      ...overrides.standings,
    }),
    validateHistoryIndexFoundationSync: () => ({ ok: true, artifact: { foundationFingerprint: "index" }, ...overrides.index }),
    validateModelPriorsFoundationSync: () => ({ ok: true, artifact: { foundationFingerprint: "priors" }, ...overrides.priors }),
    validateH2HFoundationSync: () => ({ ok: true, artifact: { foundationFingerprint: "h2h" }, ...overrides.h2h }),
    auditDetailsFoundationDay: () => ({ ok: true, summary: { expectedFixtures: 291, detailFiles: 291, issueCount: 0 }, ...overrides.details }),
  };
}

test("clean foundation is model-ready and publication-ready even with safely gated standings", () => {
  const report = buildFoundationIntegrityReport("2026-08-09", cleanOptions());
  assert.equal(report.modelReady, true);
  assert.equal(report.publicationReady, true);
  assert.equal(report.ok, true);
  assert.deepEqual(report.blocked, []);
  assert.equal(report.components.standings.detail.summary.gated, 153);
});

test("history warnings fail closed for model and publication readiness", () => {
  const options = cleanOptions({ history: { clean: false, ok: true, issueCounts: { error: 0, warning: 1, info: 0 } } });
  const report = buildFoundationIntegrityReport("2026-08-09", options);
  assert.equal(report.modelReady, false);
  assert.equal(report.publicationReady, false);
  assert.ok(report.blocked.some(row => row.component === "historySemantic"));
});

test("unsafe standings foundation blocks model readiness", () => {
  const options = cleanOptions({ standings: { ok: false, summary: { invalid: 1, unsafeGatedConsumerTables: 1 } } });
  const report = buildFoundationIntegrityReport("2026-08-09", options);
  assert.equal(report.modelReady, false);
  assert.ok(report.blocked.some(row => row.component === "standings"));
});

test("stale derived foundation blocks model readiness", () => {
  const options = cleanOptions({ index: { ok: false, reason: "history_index_foundation_stale" } });
  const report = buildFoundationIntegrityReport("2026-08-09", options);
  assert.equal(report.modelReady, false);
  assert.equal(report.publicationReady, false);
  assert.ok(report.blocked.some(row => row.component === "historyIndex"));
});

test("details failure blocks publication but not model foundation", () => {
  const options = cleanOptions({ details: { ok: false, issues: [{ code: "DETAIL_FOUNDATION_FINGERPRINT_STALE" }] } });
  const report = buildFoundationIntegrityReport("2026-08-09", options);
  assert.equal(report.modelReady, true);
  assert.equal(report.publicationReady, false);
  assert.ok(report.blocked.some(row => row.component === "details"));
});

test("CLI summary preserves exact details audit issues", () => {
  const issue = {
    code: "DETAIL_HISTORY_INDEX_FINGERPRINT_STALE",
    file: "cid_example.json",
    id: "cid_example"
  };
  const report = buildFoundationIntegrityReport(
    "2026-08-09",
    cleanOptions({
      details: {
        ok: false,
        summary: { expectedFixtures: 1, detailFiles: 1, checked: 1, issueCount: 1 },
        issues: [issue]
      }
    })
  );
  const summary = foundationIntegrityCliSummary(report);
  assert.equal(summary.modelReady, true);
  assert.equal(summary.publicationReady, false);
  assert.equal(summary.details.ok, false);
  assert.equal(summary.details.reason, "details_foundation_not_ready");
  assert.deepEqual(summary.details.issues, [issue]);
});
