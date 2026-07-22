import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  canonicalDetailBytesOfFile
} from "../jobs/export-deploy-snapshot-day.js";

test("deploy manifest detail bytes are canonical across LF and CRLF checkouts", () => {
  const dir = fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "aiml-detail-bytes-"
    )
  );

  try {
    const lfFile = path.join(dir, "lf.json");
    const crlfFile = path.join(dir, "crlf.json");

    const lf = '{\n  "ok": true\n}\n';
    const crlf = lf.replace(/\n/g, "\r\n");

    fs.writeFileSync(lfFile, lf, "utf8");
    fs.writeFileSync(crlfFile, crlf, "utf8");

    assert.equal(
      canonicalDetailBytesOfFile(lfFile),
      canonicalDetailBytesOfFile(crlfFile)
    );

    assert.notEqual(
      fs.statSync(lfFile).size,
      fs.statSync(crlfFile).size
    );
  } finally {
    fs.rmSync(
      dir,
      {
        recursive: true,
        force: true
      }
    );
  }
});

test("preserveValue keeps existing snapshot value and audit bytes", () => {
  const source = fs.readFileSync(
    new URL(
      "../jobs/export-deploy-snapshot-day.js",
      import.meta.url
    ),
    "utf8"
  ).replace(/\r\n/g, "\n");

  assert.match(
    source,
    /preserveSnapshotValueBytes/
  );

  assert.match(
    source,
    /if \(!preserveSnapshotValueBytes\) \{[\s\S]*writeJsonStable\(snapshotValueFile, valueOut\)/
  );

  assert.match(
    source,
    /preserveSnapshotValueAuditBytes/
  );

  assert.match(
    source,
    /valueAuditPresent &&[\s\S]*!preserveSnapshotValueAuditBytes/
  );
});
