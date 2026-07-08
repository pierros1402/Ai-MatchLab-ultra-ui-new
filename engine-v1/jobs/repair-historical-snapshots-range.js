/**
 * repair-historical-snapshots-range.js
 *
 * Batch repair for old snapshot days. It repairs each day independently and
 * continues after failures, then writes a range summary. Use this for historical
 * cleanup before trusting cumulative/settlement/backtesting evidence.
 *
 * Usage:
 *   node engine-v1/jobs/repair-historical-snapshots-range.js --from=2026-07-01 --to=2026-07-08
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { repairHistoricalSnapshotDay } from "./repair-historical-snapshot-day.js";
import { auditHistoricalIntegrityRange } from "./audit-historical-integrity-range.js";

const __filename = fileURLToPath(import.meta.url);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/u;

function parseArgs(argv) {
  const out = { from: null, to: null, rebuildValue: false };
  for (const arg of argv) {
    if (arg.startsWith("--from=")) out.from = arg.slice("--from=".length);
    else if (arg.startsWith("--to=")) out.to = arg.slice("--to=".length);
    else if (arg === "--rebuild-value") out.rebuildValue = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function usage() {
  return [
    "Usage:",
    "  node engine-v1/jobs/repair-historical-snapshots-range.js --from=YYYY-MM-DD --to=YYYY-MM-DD [--rebuild-value]",
    "",
    "Default preserves historical value picks. Add --rebuild-value only when you intentionally want to recompute production value/value-audit."
  ].join("\n");
}

function writeJson(file, payload) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return { ok: true };
  }
  if ((args.from && !DAY_RE.test(args.from)) || (args.to && !DAY_RE.test(args.to))) {
    throw new Error("Invalid --from/--to. Expected YYYY-MM-DD.");
  }

  const before = auditHistoricalIntegrityRange({ from: args.from, to: args.to, write: true });
  const repairRequiredDays = before.summary.repairRequiredDays;
  const repairs = [];

  for (const dayKey of repairRequiredDays) {
    try {
      const result = await repairHistoricalSnapshotDay(dayKey, { rebuildValue: args.rebuildValue });
      repairs.push({ dayKey, ok: result.ok, hardFailures: result.integrity.hardFailures, warnings: result.integrity.warnings });
    } catch (error) {
      repairs.push({ dayKey, ok: false, error: error?.message || String(error) });
    }
  }

  const after = auditHistoricalIntegrityRange({ from: args.from, to: args.to, write: true });
  const summary = {
    ok: after.summary.ok,
    schema: "ai-matchlab.historical-repair-range.v1",
    generatedAt: new Date().toISOString(),
    from: args.from || before.summary.from,
    to: args.to || before.summary.to,
    rebuildValue: args.rebuildValue,
    before: before.summary,
    repairs,
    after: after.summary
  };

  writeJson(resolveDataPath("historical-integrity", "repair-range-latest.json"), summary);
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isCli) {
  main().then(result => {
    process.exit(result.ok ? 0 : 2);
  }).catch(error => {
    console.error("[repair-historical-snapshots-range] fatal", error);
    process.exit(1);
  });
}
