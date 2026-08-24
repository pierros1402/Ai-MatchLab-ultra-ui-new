import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");

function readNormalized(relativePath) {
  return fs
    .readFileSync(path.join(root, relativePath), "utf8")
    .replace(/\r\n/g, "\n");
}

test(
  "daily publication promotes DAY_KEY before FINALIZE_DAY_KEY comparison settlement",
  () => {
    const source = readNormalized(
      ".github/workflows/daily-deploy-snapshot.yml"
    );

    const dayToken =
      'bash tools/sync-public-snapshot.sh "${DAY_KEY}" "${PUBLISHED_REF}"';

    const finalizeComparisonToken =
      'node tools/sync-public-value-comparison.mjs "${FINALIZE_DAY_KEY}" "${PUBLISHED_REF}"';

    const forbiddenFinalizeSnapshotToken =
      'bash tools/sync-public-snapshot.sh "${FINALIZE_DAY_KEY}" "${PUBLISHED_REF}"';

    const dayIndex =
      source.indexOf(dayToken);

    const finalizeComparisonIndex =
      source.indexOf(finalizeComparisonToken);

    assert.ok(
      dayIndex >= 0,
      "DAY_KEY public snapshot sync must exist"
    );

    assert.ok(
      finalizeComparisonIndex >= 0,
      "FINALIZE_DAY_KEY comparison-only sync must exist"
    );

    assert.ok(
      dayIndex < finalizeComparisonIndex,
      "release day must be promoted before prior-day comparison settlement"
    );

    assert.equal(
      source.includes(forbiddenFinalizeSnapshotToken),
      false,
      "FINALIZE_DAY_KEY must not use strict historical full-snapshot sync"
    );
  }
);

test(
  "snapshot status polling retries transient transport failures",
  () => {
    const source = readNormalized(
      "tools/sync-public-snapshot.sh"
    );

    for (const token of [
      'POLL_TIMEOUT_SECONDS="${SNAPSHOT_SYNC_POLL_TIMEOUT_SECONDS:-15}"',
      'if ! FINAL_RESPONSE="$(',
      'STATUS=poll_transport_error',
      'snapshot sync status transport failed until retry budget exhausted'
    ]) {
      assert.ok(
        source.includes(token),
        `missing retry contract token: ${token}`
      );
    }

    const errorIndex =
      source.indexOf("STATUS=poll_transport_error");

    const continueIndex =
      source.indexOf("continue", errorIndex);

    const terminalCaseIndex =
      source.indexOf('case "$STATUS" in', errorIndex);

    assert.ok(errorIndex >= 0);
    assert.ok(continueIndex > errorIndex);
    assert.ok(
      terminalCaseIndex > continueIndex,
      "transport failure must continue polling before terminal status handling"
    );
  }
);

test(
  "snapshot sync remains fail-closed on terminal binding and public verification",
  () => {
    const source = readNormalized(
      "tools/sync-public-snapshot.sh"
    );

    for (const token of [
      "sync child did not report success",
      "sync result binding mismatch",
      "invalid synchronized manifest hash",
      "/deploy-snapshot?date=${DAY_KEY}",
      "/deploy-snapshot/latest",
      "SNAPSHOT_SYNC_VERIFIED=true",
      "SNAPSHOT_SYNC_REF=${REF,,}",
      "SNAPSHOT_SYNC_LATEST_PROMOTED=${LATEST_PROMOTED}"
    ]) {
      assert.ok(
        source.includes(token),
        `missing fail-closed verification token: ${token}`
      );
    }
  }
);