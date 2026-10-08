import test from "node:test";
import assert from "node:assert/strict";
import { canonicalJson, canonicalUtf8Bytes, sha256Canonical } from "../core/operational-memory/canonical-json.js";
test("canonical JSON deterministic, NFC and ordered", () => {
  assert.equal(canonicalJson({ b: 2, a: 1 }), '{"a":1,"b":2}');
  assert.equal(canonicalJson({ x: -0 }), '{"x":0}');
  assert.equal(canonicalJson({ x: "e\u0301" }), '{"x":"é"}');
  assert.deepEqual(canonicalUtf8Bytes({ a: "é" }), Buffer.from('{"a":"é"}', "utf8"));
  assert.equal(sha256Canonical({ b: 2, a: 1 }), sha256Canonical({ a: 1, b: 2 }));
});
test("canonical JSON rejects invalid domain values", () => {
  assert.throws(() => canonicalJson({ x: NaN }));
  assert.throws(() => canonicalJson({ x: Infinity }));
  assert.throws(() => canonicalJson({ x: 2n }));
  const sparse = []; sparse.length = 1; assert.throws(() => canonicalJson(sparse));
  const cyclic = {}; cyclic.self = cyclic; assert.throws(() => canonicalJson(cyclic));
  assert.throws(() => canonicalJson("\ud800"));
});
