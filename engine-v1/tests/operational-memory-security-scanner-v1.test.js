import test from "node:test";
import assert from "node:assert/strict";
import { SECURITY_CONTRACT } from "../core/operational-memory/contract-v1.js";
import { assertOperationalMemoryTextSafe, scanOperationalMemoryText } from "../core/operational-memory/security-scanner-v1.js";
test("five secret rules detect positive examples", () => {
  for (const value of ["-----BEGIN PRIVATE KEY-----","password=12345678","Bearer abcdefghijklmnop","ghp_abcdefghijklmnop","AKIAABCDEFGHIJKLMNOP"]) {
    assert.equal(scanOperationalMemoryText(value).ok, false, value);
    assert.throws(() => assertOperationalMemoryTextSafe(value));
  }
});
test("safe near misses", () => {
  for (const value of ["normal operational summary","password=short","Bearer short","ghp_short","XAKIAABCDEFGHIJKLMNOPY"]) assert.equal(scanOperationalMemoryText(value).ok, true, value);
});
test("scanner fail closed contract errors", () => {
  const base = structuredClone(SECURITY_CONTRACT.freeTextSecretScanner);
  const unknown = structuredClone(base); unknown.rules[0].algorithm = "UNKNOWN"; assert.throws(() => scanOperationalMemoryText("safe", unknown));
  const missing = structuredClone(base); delete missing.rules[0].parameters.needles; assert.throws(() => scanOperationalMemoryText("safe", missing));
  const extra = structuredClone(base); extra.rules[0].parameters.extra = true; assert.throws(() => scanOperationalMemoryText("safe", extra));
  const version = structuredClone(base); version.version = 2; assert.throws(() => scanOperationalMemoryText("safe", version));
});
