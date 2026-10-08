import test from "node:test";
import assert from "node:assert/strict";
import { assertExactKeys, assertPortableRegexDefinition, assertRawUtf8, assertUnicodeScalarString, matchPortablePattern, parseStrictJson, unicodeScalarLength } from "../core/operational-memory/primitive-validation.js";
import { NORMATIVE_REGEX_PATTERNS } from "../core/operational-memory/contract-v1.js";
test("Unicode scalar and strict UTF-8", () => {
  assert.equal(unicodeScalarLength("😀a"), 2);
  assert.throws(() => assertUnicodeScalarString("\ud800"));
  assert.equal(assertRawUtf8(Buffer.from("ok")), "ok");
  assert.throws(() => assertRawUtf8(Uint8Array.from([0xff])));
  assert.throws(() => assertRawUtf8(Uint8Array.from([0xef,0xbb,0xbf,0x7b,0x7d])));
});
test("strict JSON duplicate handling", () => {
  assert.throws(() => parseStrictJson('{"a":1,"a":2}'));
  assert.throws(() => parseStrictJson('{"é":1,"e\\u0301":2}'));
  assert.deepEqual({ ...parseStrictJson('{"b":2,"a":1}') }, { b: 2, a: 1 });
});
test("closed keys and portable regex", () => {
  assert.doesNotThrow(() => assertExactKeys({ a: 1 }, ["a"], [], "x"));
  assert.throws(() => assertExactKeys({ a: 1, b: 2 }, ["a"], [], "x"));
  for (const pattern of Object.values(NORMATIVE_REGEX_PATTERNS)) assert.doesNotThrow(() => assertPortableRegexDefinition(pattern));
  assert.equal(NORMATIVE_REGEX_PATTERNS.SHA256_HEX, "^[0-9abcdef]{64}$");
  assert.equal(NORMATIVE_REGEX_PATTERNS.GIT_SHA1, "^[0-9abcdef]{40}$");
  assert.equal(NORMATIVE_REGEX_PATTERNS.EVIDENCE_REF_ID, "^ev1_[0-9abcdef]{64}$");
  assert.equal(NORMATIVE_REGEX_PATTERNS.CASE_ID, "^case2_[0-9abcdef]{64}$");
  for (const bad of ["abc","^a+$","^(a)$","^a|b$","^.$","^\\d$","^[^a]$","^[a-z]{4097}$"]) assert.throws(() => assertPortableRegexDefinition(bad), bad);
  assert.equal(matchPortablePattern("abc-1", NORMATIVE_REGEX_PATTERNS.STABLE_ID), true);
  assert.equal(matchPortablePattern("BAD SPACE", NORMATIVE_REGEX_PATTERNS.STABLE_ID), false);
});
