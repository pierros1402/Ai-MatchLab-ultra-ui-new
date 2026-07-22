import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  applyMutableStatusFields,
  authoritativePreKickoffNonPlayedRows
} from "../jobs/run-intraday-snapshot-refresh.js";

test("authoritative selector keeps only pre-kickoff non-played rows", () => {
  const rows = [
    {
      canonicalId: "postponed",
      status: "SPECIAL",
      rawStatus: "STATUS_POSTPONED",
      minute: 0,
      scoreHome: 0,
      scoreAway: 0
    },
    {
      canonicalId: "cancelled",
      status: "SPECIAL",
      rawStatus: "STATUS_CANCELLED",
      minute: "0'",
      scoreHome: 0,
      scoreAway: 0
    },
    {
      canonicalId: "scheduled",
      status: "PRE",
      rawStatus: "STATUS_SCHEDULED",
      scoreHome: 0,
      scoreAway: 0
    },
    {
      canonicalId: "final",
      status: "FT",
      rawStatus: "STATUS_FINAL",
      minute: "FT",
      scoreHome: 0,
      scoreAway: 0
    },
    {
      canonicalId: "interrupted",
      status: "SPECIAL",
      rawStatus: "STATUS_INTERRUPTED",
      minute: "64'",
      scoreHome: 2,
      scoreAway: 1
    },
    {
      canonicalId: "delayed",
      status: "SPECIAL",
      rawStatus: "STATUS_DELAYED",
      minute: null,
      scoreHome: null,
      scoreAway: null
    },
    {
      canonicalId: "void",
      status: "SPECIAL",
      rawStatus: "STATUS_VOID",
      minute: "FT",
      scoreHome: 2,
      scoreAway: 1
    },
    {
      canonicalId: "conflict",
      status: "FT",
      rawStatus: "STATUS_POSTPONED",
      statusType: "STATUS_FINAL",
      minute: "FT",
      scoreHome: 1,
      scoreAway: 0
    }
  ];

  const selected =
    authoritativePreKickoffNonPlayedRows(rows);

  assert.deepEqual(
    selected.map(row => row.canonicalId),
    ["postponed", "cancelled"]
  );

  for (const row of selected) {
    assert.equal(row.scoreHome, null);
    assert.equal(row.scoreAway, null);
    assert.equal(row.minute, null);
    assert.equal(row.isDisplayFinal, false);
  }

  assert.equal(rows[0].scoreHome, 0);
  assert.equal(rows[1].scoreAway, 0);
});

test("authoritative postponed state clears stale detail scores", () => {
  const basic = {
    status: "SPECIAL",
    rawStatus: "STATUS_POSTPONED",
    statusType: null,
    minute: null,
    scoreHome: 0,
    scoreAway: 0
  };

  const [canonical] =
    authoritativePreKickoffNonPlayedRows([
      {
        status: "SPECIAL",
        rawStatus: "STATUS_POSTPONED",
        statusType: null,
        minute: null,
        scoreHome: 0,
        scoreAway: 0
      }
    ]);

  const changed = applyMutableStatusFields(
    basic,
    canonical
  );

  assert.equal(changed, true);

  assert.deepEqual(basic, {
    status: "SPECIAL",
    rawStatus: "STATUS_POSTPONED",
    statusType: null,
    minute: null,
    scoreHome: null,
    scoreAway: null
  });
});

test("ordinary live patch still preserves real zero-zero final scores", () => {
  const basic = {
    status: "PRE",
    rawStatus: "STATUS_SCHEDULED",
    statusType: "PRE",
    minute: null,
    scoreHome: null,
    scoreAway: null
  };

  const changed = applyMutableStatusFields(
    basic,
    {
      status: "FT",
      rawStatus: "STATUS_FINAL",
      statusType: "FT",
      minute: 90,
      scoreHome: 0,
      scoreAway: 0
    }
  );

  assert.equal(changed, true);
  assert.equal(basic.status, "FT");
  assert.equal(basic.minute, 90);
  assert.equal(basic.scoreHome, 0);
  assert.equal(basic.scoreAway, 0);
});

test("intraday applies the narrow non-played sweep before export", () => {
  const source = fs.readFileSync(
    new URL(
      "../jobs/run-intraday-snapshot-refresh.js",
      import.meta.url
    ),
    "utf8"
  ).replace(/\r\n/g, "\n");

  const reconciliationIndex = source.indexOf(
    "rebuild-reconciled-fixtures:done"
  );

  const canonicalRowsIndex = source.indexOf(
    "const canonicalStatusRows ="
  );

  const selectorIndex = source.indexOf(
    "const authoritativeNonPlayedRows ="
  );

  const patchIndex = source.indexOf(
    "patchDetailsBasic(\n      safeDayKey,\n      authoritativeNonPlayedRows"
  );

  const logIndex = source.indexOf(
    "patch-details-basic-authoritative-nonplayed:done"
  );

  const exportIndex = source.indexOf(
    "export-snapshot:start"
  );

  assert.ok(reconciliationIndex >= 0);
  assert.ok(canonicalRowsIndex > reconciliationIndex);
  assert.ok(selectorIndex > canonicalRowsIndex);
  assert.ok(patchIndex > selectorIndex);
  assert.ok(logIndex > patchIndex);
  assert.ok(exportIndex > logIndex);

  assert.match(
    source,
    /authoritativePreKickoffNonPlayedRows\([\s\S]*?canonicalStatusRows/
  );

  assert.doesNotMatch(
    source,
    /patchDetailsBasic\(\s*safeDayKey,\s*canonicalStatusRows/
  );
});
test("intraday detail patch synchronizes basic state and signature before export", () => {
  const source = fs.readFileSync(
    new URL(
      "../jobs/run-intraday-snapshot-refresh.js",
      import.meta.url
    ),
    "utf8"
  ).replace(/\r\n/g, "\n");

  assert.match(
    source,
    /synchronizeDetailStatusState\(\s*detail,\s*row\s*\)/
  );

  assert.doesNotMatch(
    source,
    /detail\.basic\.lastStatusPatchedAt\s*=\s*new Date\(\)\.toISOString\(\)/
  );

  const patchIndex = source.indexOf("synchronizeDetailStatusState(");
  const exportIndex = source.indexOf("export-snapshot:start");
  assert.ok(patchIndex >= 0);
  assert.ok(exportIndex > patchIndex);
});
