import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ensurePlanAObservationAtPaths
} from "./plan-a-observation.js";

test("Plan A observation audit hash is invariant across LF and CRLF checkouts", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-plan-a-eol-"));
  const observationFile = path.join(root, "plan-a.json");
  const auditFile = path.join(root, "plan-a-audit.json");

  try {
    const dayKey = "2026-08-15";
    const sourcePayload = {
      ok: true,
      date: dayKey,
      source: "canonical_fixtures",
      count: 1,
      picks: [
        {
          matchId: "cid_test_home_away_20260815",
          market: "Over / Under 2.5",
          pick: "Over 2.5"
        }
      ]
    };

    const first = ensurePlanAObservationAtPaths({
      dayKey,
      sourcePayload,
      sourcePath: `data/value/${dayKey}.json`,
      observationFile,
      auditFile,
      frozenAt: "2026-08-15T07:00:00.000Z"
    });

    assert.equal(first.ok, true);
    assert.equal(first.created, true);

    const auditBefore = JSON.parse(fs.readFileSync(auditFile, "utf8"));

    const lfText = fs.readFileSync(observationFile, "utf8")
      .replace(/\r\n?/gu, "\n");

    fs.writeFileSync(
      observationFile,
      lfText.replace(/\n/gu, "\r\n"),
      "utf8"
    );

    const second = ensurePlanAObservationAtPaths({
      dayKey,
      sourcePayload,
      sourcePath: `data/value/${dayKey}.json`,
      observationFile,
      auditFile,
      frozenAt: "2026-08-15T08:00:00.000Z"
    });

    assert.equal(second.ok, true);
    assert.equal(second.created, false);
    assert.equal(second.preservedExisting, true);

    const auditAfter = JSON.parse(fs.readFileSync(auditFile, "utf8"));

    assert.equal(
      auditAfter.observationFileSha256,
      auditBefore.observationFileSha256
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
