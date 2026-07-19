import { fileURLToPath } from "node:url";
import path from "node:path";

import { athensDayKey } from "../core/daykey.js";
import { refreshValueArtifactsDay } from "./refresh-value-artifacts-day.js";
import { deriveValueFromOdds } from "./derive-value-from-odds.js";

export function parseArgs(argv) {
  const out = {
    date: null,
    rebuild: false,
    freeze: false,
    planBObservation: false
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

    if (arg === "--plan-b-observation" || arg === "--plan-b") {
      out.planBObservation = true;
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

export function usage() {
  return [
    "Usage:",
    "  node ./engine-v1/jobs/build-value-standalone-day.js --date YYYY-MM-DD --rebuild",
    "  node ./engine-v1/jobs/build-value-standalone-day.js --date YYYY-MM-DD --plan-b-observation [--freeze]",
    "",
    "Contract:",
    "  - Production mode delegates to the canonical-only Plan A refresh pipeline.",
    "  - Production mode rebuilds value/audit, snapshot value/audit, comparison, freshness, invariant, and build report artifacts.",
    "  - Production mode preserves snapshot fixtures.json and does not update latest.json.",
    "  - Plan B remains an independent observation path backed by deriveValueFromOdds.",
    "  - Real bookmaker odds remain display-only and do not enter Plan A decisions.",
    "  - --freeze is supported only with --plan-b-observation."
  ].join("\n");
}

export function isDayKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(String(value || ""));
}

export async function runStandaloneValueDay(dayKey, args = {}, dependencies = {}) {
  const runPlanARefresh = dependencies.refreshValueArtifactsDay || refreshValueArtifactsDay;
  const runPlanBObservation = dependencies.deriveValueFromOdds || deriveValueFromOdds;

  if (args.planBObservation) {
    return runPlanBObservation(dayKey, {
      freeze: args.freeze === true && args.rebuild !== true,
      outputMode: "plan-b-observation"
    });
  }

  if (args.freeze) {
    throw new Error("--freeze is supported only with --plan-b-observation.");
  }

  if (args.rebuild !== true) {
    throw new Error("Production standalone Value requires --rebuild.");
  }

  return runPlanARefresh(dayKey, {
    updateLatest: false
  });
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

  const result = await runStandaloneValueDay(dayKey, args);
  const planBMode = args.planBObservation === true;
  const source = planBMode ? result?.source || null : result?.planA?.source || null;
  const valuePicks = planBMode
    ? Number(result?.count || 0)
    : Number(result?.planA?.count || 0);

  console.log(JSON.stringify({
    ok: result?.ok !== false,
    mode: planBMode ? "standalone-value-plan-b-observation" : "standalone-value-plan-a-refresh",
    date: dayKey,
    valuePicks,
    source,
    policyVersion: result?.policyVersion || null,
    sourceContract: planBMode
      ? (result?.sourceContract || {
          deploySnapshotInput: false,
          realBookmakerOddsUsed: false
        })
      : {
          canonicalOnly: source === "canonical_fixtures",
          deploySnapshotInput: false,
          realBookmakerOddsUsed: false
        },
    outputs: result?.outputs || null,
    result
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
