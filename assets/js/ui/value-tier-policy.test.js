import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./value-picks.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../../css/right-panels.css", import.meta.url), "utf8");
const start = source.indexOf("function unifiedPolicyTier(p) {");
const end = source.indexOf("function renderComparisonRow(p) {", start);
assert.ok(start >= 0 && end > start, "tier policy helpers must be present");
const tier = vm.runInNewContext(source.slice(start, end) + "\ncomparisonTier", {});

test("unified policy tier reflects explicit strict-high vs medium-only reasons", () => {
  assert.equal(tier({unified:true, meta:{policyReason:"over25_strict_high"}}), "HIGH");
  assert.equal(tier({unified:true, meta:{policyReason:"over25_near_high_medium_only"}}), "MEDIUM");
});
test("unified policy must not fabricate a band from raw confidence or source scores", () => {
  assert.equal(tier({unified:true, rawConfidence:0.99, readiness:0.99, sourceScores:{A:0.99}}), null);
  assert.equal(tier({unified:true, meta:{policyReason:"unrecognized"}, band:"HIGH"}), null);
});
test("non-unified comparison accepts only explicit source bands", () => {
  assert.equal(tier({unified:false, band:"medium"}), "MEDIUM");
  assert.equal(tier({unified:false, confidence:"HIGH"}), "HIGH");
  assert.equal(tier({unified:false, confidence:0.99}), null);
});
test("renderer preserves settlement authority and displays tier separately from consensus", () => {
  assert.match(source, /const resultBadge = resultBadgeHtml\(p\?\.result\)/);
  assert.match(source, /const unifiedLabel = p\?\.unified/);
  assert.match(source, /'    <div class="value-conf">' \+ esc\(tier \|\| '—'\)/);
  assert.match(source, /conf-' \+ esc\(String\(conf\)\.toLowerCase\(\)\)/);
  assert.match(css, /\.value-row\.conf-high::before/);
  assert.match(css, /\.value-row\.conf-medium::before/);
});
