import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkPublicationFT } from "./check-publication-ft.mjs";

const day = "2026-11-04";
const ft = (extra = {}) => ({
  canonicalId: "cid_example_20261104", matchId: "cid_example_20261104",
  status: "FT", rawStatus: "STATUS_FULL_TIME", scoreHome: 2, scoreAway: 1, ...extra
});
function fixture({ canonical = [ft()], published = [ft()], manifest = { ok: true }, includeAll = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-p0-ft-"));
  const cdir = path.join(root, "data", "canonical-fixtures", day);
  const sdir = path.join(root, "data", "deploy-snapshots", day);
  fs.mkdirSync(cdir, { recursive: true });
  fs.mkdirSync(sdir, { recursive: true });
  fs.writeFileSync(path.join(cdir, "test.json"), JSON.stringify({ fixtures: canonical }));
  fs.writeFileSync(path.join(sdir, "fixtures.json"), JSON.stringify({ date: day, count: published.length, fixtures: published }));
  fs.writeFileSync(path.join(sdir, "manifest.json"), JSON.stringify(manifest));
  if (includeAll) fs.writeFileSync(path.join(sdir, "fixtures-all.json"), JSON.stringify({ fixtures: published }));
  return { root, close: () => fs.rmSync(root, { recursive: true, force: true }) };
}
function codes(o) { return o.errors.map(x => x.code); }
function examine(opts) {
  const f = fixture(opts);
  try { return checkPublicationFT({ root: f.root, day }); } finally { f.close(); }
}
test("exact verified FT parity passes", () => {
  const result = examine();
  assert.equal(result.ok, true);
  assert.equal(result.canonicalTerminalCount, 1);
});
test("published PRE against canonical FT fails", () => {
  assert.ok(codes(examine({ published: [ft({status:"PRE",rawStatus:"STATUS_SCHEDULED"})] })).includes("TERMINAL_STATUS_REGRESSION"));
});
test("published SECOND_HALF against canonical FT fails", () => {
  assert.ok(codes(examine({ published: [ft({status:"SECOND_HALF",rawStatus:"STATUS_SECOND_HALF"})] })).includes("TERMINAL_STATUS_REGRESSION"));
});
test("different final score fails", () => {
  assert.ok(codes(examine({published: [ft({scoreAway:0})]})).includes("TERMINAL_SCORE_REGRESSION"));
});
test("missing canonical FT from snapshot fails", () => {
  assert.ok(codes(examine({published: []})).includes("CANONICAL_TERMINAL_NOT_PUBLISHED"));
});
test("canonical terminal declaration without valid scores fails", () => {
  assert.ok(codes(examine({canonical: [ft({scoreAway:null})]})).includes("CANONICAL_TERMINAL_UNVERIFIABLE"));
});
test("duplicate canonical identity fails closed", () => {
  assert.ok(codes(examine({canonical: [ft(),ft()]})).includes("DUPLICATE_CANONICAL_ID"));
});
test("missing fixtures-all fails closed", () => {
  assert.ok(codes(examine({includeAll:false})).includes("SNAPSHOT_ARTIFACT_MISSING"));
});
test("knockout namespace does not confuse FT with PEN", () => {
  const pen=ft({status:"FT",rawStatus:"STATUS_FINAL_PEN",penalties:{home:4,away:3}});
  assert.equal(examine({canonical:[pen],published:[pen]}).ok,true);
  assert.ok(codes(examine({canonical:[pen],published:[ft()]})).includes("TERMINAL_STATUS_REGRESSION"));
});
test("knockout penalty details must match", () => {
  const p=ft({status:"FT",rawStatus:"STATUS_FINAL_PEN",penalties:{home:4,away:3}});
  const wrong=ft({status:"FT",rawStatus:"STATUS_FINAL_PEN",penalties:{home:3,away:4}});
  assert.ok(codes(examine({canonical:[p],published:[wrong]})).includes("TERMINAL_SCORE_NAMESPACE_MISMATCH"));
});
