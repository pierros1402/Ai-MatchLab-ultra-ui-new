import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  canonicalDetailBytesOfFile,
  selectValueArtifactForSnapshot,
  validatedPersistedSnapshotValueArtifact
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

test("preserveValue keeps manifest semantics on the frozen 7-pick artifact when current value shrinks to 5", () => {
  const snapshotPayload = {
    ok: true,
    date: "2099-08-17",
    source: "canonical_fixtures",
    count: 7,
    picks: Array.from(
      { length: 7 },
      (_, index) => ({ id: `frozen-${index + 1}` })
    )
  };

  const currentPayload = {
    ok: true,
    date: "2099-08-17",
    source: "canonical_fixtures",
    count: 5,
    picks: Array.from(
      { length: 5 },
      (_, index) => ({ id: `current-${index + 1}` })
    )
  };

  const selected = selectValueArtifactForSnapshot({
    currentPayload,
    snapshotPayload,
    preserveValue: true
  });

  assert.equal(selected, snapshotPayload);
  assert.equal(selected.count, 7);
  assert.equal(selected.picks.length, 7);
});

test("snapshot Value is not selected when preservation is disabled", () => {
  const snapshotPayload = {
    ok: true,
    source: "canonical_fixtures",
    count: 7,
    picks: Array.from({ length: 7 }, (_, index) => ({ id: `frozen-${index + 1}` }))
  };

  const currentPayload = {
    ok: true,
    source: "canonical_fixtures",
    count: 5,
    picks: Array.from({ length: 5 }, (_, index) => ({ id: `current-${index + 1}` }))
  };

  const selected = selectValueArtifactForSnapshot({
    currentPayload,
    snapshotPayload,
    preserveValue: false
  });

  assert.equal(selected, currentPayload);
});

test("invalid frozen Value cannot override the current artifact", () => {
  const snapshotPayload = {
    ok: false,
    source: "canonical_fixtures",
    count: 7,
    picks: Array.from({ length: 7 }, (_, index) => ({ id: `invalid-${index + 1}` }))
  };

  const currentPayload = {
    ok: true,
    source: "canonical_fixtures",
    count: 5,
    picks: Array.from({ length: 5 }, (_, index) => ({ id: `current-${index + 1}` }))
  };

  const selected = selectValueArtifactForSnapshot({
    currentPayload,
    snapshotPayload,
    preserveValue: true
  });

  assert.equal(selected, currentPayload);
});

test("persisted snapshot Value accepts coherent frozen 7-pick bytes", () => {
  const persisted = {
    ok: true,
    date: "2099-08-17",
    source: "canonical_fixtures",
    count: 7,
    picks: Array.from(
      { length: 7 },
      (_, index) => ({ id: `persisted-${index + 1}` })
    )
  };

  const validated = validatedPersistedSnapshotValueArtifact(
    persisted,
    "2099-08-17"
  );

  assert.equal(validated, persisted);
  assert.equal(validated.count, 7);
  assert.equal(validated.picks.length, 7);
});

test("persisted snapshot Value fails closed when declared 5 but bytes contain 7 picks", () => {
  const persisted = {
    ok: true,
    date: "2099-08-17",
    source: "canonical_fixtures",
    count: 5,
    picks: Array.from(
      { length: 7 },
      (_, index) => ({ id: `persisted-${index + 1}` })
    )
  };

  assert.throws(
    () => validatedPersistedSnapshotValueArtifact(
      persisted,
      "2099-08-17"
    ),
    /snapshot_value_count_mismatch_after_export:2099-08-17:declared=5:actual=7/
  );
});

test("manifest Value metadata is sourced from the persisted snapshot artifact", () => {
  const source = fs.readFileSync(
    new URL(
      "../jobs/export-deploy-snapshot-day.js",
      import.meta.url
    ),
    "utf8"
  ).replace(/\r\n/g, "\n");

  assert.match(
    source,
    /const persistedValueOut =[\s\S]*validatedPersistedSnapshotValueArtifact\([\s\S]*readJsonSafe\(snapshotValueFile, null\)/
  );

  assert.match(
    source,
    /valuePicks: persistedValueOut\.count/
  );

  assert.match(
    source,
    /valueSource: String\(persistedValueOut\?\.source \|\| "local_value_file"\)/
  );
});
