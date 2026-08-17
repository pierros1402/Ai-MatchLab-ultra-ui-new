import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  derivedFoundationFileFingerprintSync,
  normalizeDerivedFoundationBytes,
} from "./derived-history-foundation.js";

test("derived foundation fingerprint is stable across LF and CRLF", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "aiml-foundation-eol-"),
  );

  try {
    const lfFile = path.join(root, "lf.json");
    const crlfFile = path.join(root, "crlf.json");

    const lf = [
      "{",
      '  "schema": "test",',
      '  "rows": [1, 2, 3]',
      "}",
      "",
    ].join("\n");

    const crlf = lf.replace(/\n/g, "\r\n");

    fs.writeFileSync(lfFile, lf, "utf8");
    fs.writeFileSync(crlfFile, crlf, "utf8");

    assert.notEqual(
      fs.statSync(lfFile).size,
      fs.statSync(crlfFile).size,
    );

    const lfFingerprint =
      derivedFoundationFileFingerprintSync(lfFile);
    const crlfFingerprint =
      derivedFoundationFileFingerprintSync(crlfFile);

    assert.deepEqual(
      crlfFingerprint,
      lfFingerprint,
    );
    assert.equal(
      lfFingerprint.bytes,
      Buffer.byteLength(lf, "utf8"),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("derived foundation EOL normalization changes CRLF only", () => {
  const input = Buffer.from(
    "a\\rb\\r\\nc\\n".replace(/\\r/g, "\r").replace(/\\n/g, "\n"),
    "utf8",
  );
  const normalized =
    normalizeDerivedFoundationBytes(input);

  assert.equal(
    normalized.toString("utf8"),
    "a\rb\nc\n",
  );
});
