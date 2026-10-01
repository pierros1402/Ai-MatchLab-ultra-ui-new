import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { resolveDataPath } from "../storage/data-root.js";
import { recoverValueDataDay } from "./recover-value-data-day.js";

test("bounded detail recovery verifies results, preserves frozen bytes, and rolls back forbidden mutation", async () => {
  const day = "2099-01-01";
  const id = "cid_recovery_contract_20990101";
  const snapshot = resolveDataPath("deploy-snapshots", day);
  const detailRoot = resolveDataPath("details", day);
  assert.ok(!fs.existsSync(snapshot), "test must never overwrite a real day");
  const write = (file, payload) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(payload)); };
  try {
    write(path.join(snapshot, "fixtures.json"), { fixtures: [{ canonicalId: id, kickoffUtc: "2099-01-01T10:00Z" }] });
    write(path.join(snapshot, "manifest.json"), {});
    write(path.join(snapshot, "value.json"), { picks: [{ canonicalId: id, pick: "over" }] });
    write(path.join(snapshot, "details", `${id}.json`), { marker: "old" });
    const valueBefore = fs.readFileSync(path.join(snapshot, "value.json"));
    const audit = () => {
      const ok = JSON.parse(fs.readFileSync(path.join(snapshot, "details", `${id}.json`))).marker === "new";
      return { ok, summary: { issueCount: ok ? 0 : 1 }, issues: ok ? [] : [{ code: "DETAIL_H2H_FINGERPRINT_STALE", id }] };
    };
    const build = async (_day, fixtures) => { assert.equal(fixtures.length, 1); write(path.join(detailRoot, `${id}.json`), { marker: "new" }); return { ok: true }; };
    const exportSnapshot = async () => ({ ok: true });
    const options = { nowMs: Date.parse("2100-01-01"), dependencies: { audit, build, exportSnapshot } };
    assert.equal((await recoverValueDataDay(day, options)).status, "DRY_RUN");
    assert.equal(audit().ok, false);
    const result = await recoverValueDataDay(day, { ...options, apply: true });
    assert.equal(result.status, "ARTIFACTS_VERIFIED_HISTORICAL_EVIDENCE_UNAVAILABLE");
    assert.ok(valueBefore.equals(fs.readFileSync(path.join(snapshot, "value.json"))));
    write(path.join(snapshot, "details", `${id}.json`), { marker: "old" });
    const corrupt = async () => { write(path.join(snapshot, "value.json"), { picks: [] }); return { ok: true }; };
    await assert.rejects(() => recoverValueDataDay(day, { ...options, apply: true, dependencies: { audit, build, exportSnapshot: corrupt } }), /frozen_value_mutation_forbidden/);
    assert.ok(valueBefore.equals(fs.readFileSync(path.join(snapshot, "value.json"))));
    assert.equal(audit().ok, false, "failed repair restores detail preimage too");
    const unknown = () => ({ ok: false, issues: [{ code: "CURRENT_DERIVED_FOUNDATION_NOT_READY", id }] });
    assert.equal((await recoverValueDataDay(day, { ...options, apply: true, dependencies: { audit: unknown } })).status, "BLOCKED");
    write(path.join(snapshot, "details", `${id}.json`), { marker: "new" });
    const noEvidence = await recoverValueDataDay(day, { apply: true, nowMs: Date.parse("2099-01-01T09:00Z"), dependencies: { audit, supplement: () => ({ assessmentRowsWritten: 0 }) } });
    assert.equal(noEvidence.status, "UPSTREAM_DATA_UNAVAILABLE");
    assert.equal(noEvidence.mutation, false);
    let supplements = 0;
    const restoreAssessment = await recoverValueDataDay(day, { apply: true, nowMs: Date.parse("2099-01-01T09:00Z"), dependencies: {
      audit, supplement: (_day, options) => { assert.equal(options.canonicalFixtures.length, 1); supplements++; return { assessmentRowsWritten: 1 }; },
      exportOdds: async () => write(path.join(snapshot, "odds.json"), { matches: [{ canonicalId: id, dayKey: day,
        aiAssessment: { markets: { OU25: { probs: { over: 0.64 } } } } }] })
    } });
    assert.equal(restoreAssessment.status, "VERIFIED");
    assert.equal(supplements, 1);
    assert.ok(valueBefore.equals(fs.readFileSync(path.join(snapshot, "value.json"))));
    await recoverValueDataDay(day, { apply: true, nowMs: Date.parse("2099-01-01T09:00Z"), dependencies: {
      audit, supplement: () => { throw new Error("healthy assessment must not be regenerated"); }
    } });
  } finally {
    const dataRoot = path.resolve(resolveDataPath());
    for (const root of [snapshot, detailRoot, resolveDataPath("value-plans", day)]) {
      assert.ok(path.resolve(root).startsWith(dataRoot + path.sep));
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});
