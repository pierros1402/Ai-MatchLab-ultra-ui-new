#!/usr/bin/env bash
# Fail-fast, read-only-to-repository replay of existing Plan C terminal rows.
set -euo pipefail
DAY_KEY="${1:?usage: preflight-plan-c-terminal.sh YYYY-MM-DD}"
if [[ ! "$DAY_KEY" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "invalid_day_key:$DAY_KEY" >&2
  exit 2
fi
PREDICTION_ROOT="data/plan-c-shadow/frozen/i2b-20260825"
EXISTING="data/plan-c-shadow/settlement/latest.json"
test -f "$EXISTING"
test -f "$PREDICTION_ROOT/PREDICTION_INDEX.json"
PREFLIGHT_ROOT="$(mktemp -d)"
trap 'rm -rf "$PREFLIGHT_ROOT"' EXIT
cp "$EXISTING" "$PREFLIGHT_ROOT/settlement.json"
node ./engine-v1/jobs/settle-plan-c-shadow.js "$DAY_KEY" \
  --prediction-root "$PREDICTION_ROOT" \
  --output "$PREFLIGHT_ROOT/settlement.json" \
  --audit "$PREFLIGHT_ROOT/audit.json" \
  --repair-legacy-pending-terminal
node --input-type=module - "$PREFLIGHT_ROOT" <<'NODE'
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const root = process.argv[2];
const report = JSON.parse(fs.readFileSync(path.join(root, "settlement.json"), "utf8"));
const audit = JSON.parse(fs.readFileSync(path.join(root, "audit.json"), "utf8"));
assert.equal(report.ok, true);
assert.equal(report.accounting.balanced, true);
assert.equal(
  report.accounting.total,
  report.accounting.settled + report.accounting.pending + report.accounting.voidExcluded
);
assert.ok(Array.isArray(audit.explicitLegacyPendingTerminalRecovery));
console.log("PLAN_C_EARLY_PREFLIGHT_PASS=" + JSON.stringify({
  accounting: report.accounting,
  legacyRecoveryCount: audit.explicitLegacyPendingTerminalRecovery.length
}));
NODE
