import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { validateRuntimeCoverageFoundationArtifact } from "./sync-deploy-snapshot-from-github.js";
const DAY = "2026-11-11";
function encoded(value) { return Buffer.from(JSON.stringify(value)); }
function coverage(overrides = {}) { return { dayKey: DAY,
  activeCompetitionCompleteness: { schema: "ai-matchlab.active-competition-completeness.v1", proven: false }, ...overrides }; }
function foundation(overrides = {}) { return {dayKey: DAY, modelReady:false, publicationReady:false, ...overrides}; }
test("quarantined provider candidates remain valid coverage evidence without false proof", () => {
  assert.equal(validateRuntimeCoverageFoundationArtifact(encoded(coverage()), {kind:"coverage",day:DAY}).activeCompetitionCompleteness.proven,false);
});
test("valid HOLD foundation is preserved as HOLD", () => {
  assert.equal(validateRuntimeCoverageFoundationArtifact(encoded(foundation()), {kind:"foundation",day:DAY}).publicationReady,false);
});
test("coverage/foundation reject a wrong day", () => {
  for(const kind of ["coverage","foundation"]) {
    const value=kind==="coverage"?coverage({dayKey:"2026-11-10"}):foundation({dayKey:"2026-11-10"});
    assert.throws(()=>validateRuntimeCoverageFoundationArtifact(encoded(value),{kind,day:DAY}),/day_mismatch/);
  }
});
test("missing coverage proof and malformed foundation are rejected", () => {
  assert.throws(()=>validateRuntimeCoverageFoundationArtifact(encoded(coverage({activeCompetitionCompleteness:null})),{kind:"coverage",day:DAY}),/contract_invalid/);
  assert.throws(()=>validateRuntimeCoverageFoundationArtifact(encoded(foundation({modelReady:"true"})),{kind:"foundation",day:DAY}),/contract_invalid/);
});
test("non-json, invalid kind and array content fail closed", () => {
  assert.throws(()=>validateRuntimeCoverageFoundationArtifact(Buffer.from("{"),{kind:"coverage",day:DAY}));
  assert.throws(()=>validateRuntimeCoverageFoundationArtifact(encoded([]),{kind:"coverage",day:DAY}),/not_object/);
  assert.throws(()=>validateRuntimeCoverageFoundationArtifact(encoded(foundation()),{kind:"unknown",day:DAY}),/kind_unknown/);
});
test("same commit-pinned release stages both required diagnostics and never silently roots-mirrors them", () => {
  const src=fs.readFileSync(new URL("./sync-deploy-snapshot-from-github.js",import.meta.url),"utf8");
  assert.match(src,/data\/coverage-readiness\/\$\{day\}\.json/);
  assert.match(src,/data\/foundation-integrity\/\$\{day\}\.json/);
  assert.match(src,/\["coverage-readiness\.json", coverageBuffer\]/);
  assert.match(src,/\["foundation-integrity\.json", foundationBuffer\]/);
  assert.match(src,/optional: !requireDiagnostics/);
  const start=src.indexOf("async function mirrorRuntimeReleaseArtifacts");
  const end=src.indexOf("async function syncValueComparison",start);
  assert.ok(start>0&&end>start);
  const mirror=src.slice(start,end);
  assert.doesNotMatch(mirror,/coverage-readiness|foundation-integrity/);
});
test("runtime resolves both diagnostic files from staged immutable release", () => {
  const src=fs.readFileSync(new URL("../index.js",import.meta.url),"utf8");
  assert.match(src,/preferRuntimeReleaseArtifact\(\s*day, "coverage-readiness\.json"/);
  assert.match(src,/preferRuntimeReleaseArtifact\(\s*day, "foundation-integrity\.json"/);
  assert.match(src,/valueGate\?\.valueFreshAgainstCanonical === false/);
});
