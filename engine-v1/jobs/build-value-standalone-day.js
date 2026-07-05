import { fileURLToPath } from "node:url";
import path from "node:path";

import { athensDayKey } from "../core/daykey.js";
import { deriveValueFromOdds } from "./derive-value-from-odds.js";

function parseArgs(argv) {
  const out = {
    date: null,
    rebuild: false,
    freeze: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") {
      out.date = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith("--date=")) {
      out.date = arg.slice("--date=".length);
      continue;
    }

    if (arg === "--rebuild") {
      out.rebuild = true;
      continue;
    }

    if (arg === "--freeze") {
      out.freeze = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return out;
}

function usage() {
  return [
    "Usage:",
    "  node ./engine-v1/jobs/build-value-standalone-day.js --date YYYY-MM-DD --rebuild",
    "",
    "Contract:",
    "  - Builds only the Value layer for the selected date.",
    "  - Does not run full daily ingest/details/snapshot build.",
    "  - Uses the existing model-assessment value bridge.",
    "  - Does not read deploy-snapshot odds.json as value input.",
    "  - Real bookmaker odds must remain display-only and must not enter value decisions."
  ].join("\n");
}

function isDayKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(String(value || ""));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(usage());
    return;
  }

  const dayKey = args.date || athensDayKey();

  if (!isDayKey(dayKey)) {
    throw new Error(`Invalid date: ${dayKey}. Expected YYYY-MM-DD.`);
  }

  const result = deriveValueFromOdds(dayKey, {
    freeze: args.freeze && !args.rebuild
  });

  console.log(JSON.stringify({
    ok: result?.ok !== false,
    mode: "standalone-value",
    date: dayKey,
    valuePicks: Number(result?.count || 0),
    source: result?.source || null,
    policyVersion: result?.policyVersion || null,
    sourceContract: result?.sourceContract || {
      deploySnapshotInput: false,
      realBookmakerOddsUsed: false
    },
    outputs: {
      canonicalValue: `data/value/${dayKey}.json`,
      canonicalAudit: `data/value/_audit/${dayKey}.json`,
      snapshotValue: `data/deploy-snapshots/${dayKey}/value.json`,
      snapshotAudit: `data/deploy-snapshots/${dayKey}/value-audit.json`
    }
  }, null, 2));
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      mode: "standalone-value",
      stage: "standalone_value_failed",
      message: error?.message || String(error)
    }, null, 2));
    process.exitCode = 1;
  });
}

