import {
  pathToFileURL
} from "node:url";

import {
  buildAutonomousRepairPolicyVerificationFromSources
} from "./build-autonomous-repair-policy-verification-day.js";

import {
  evaluateAutonomousRepairAuthorizationGate
} from "../core/autonomous-repair-authorization-gate.js";

import {
  buildAutonomousRepairPlan
} from "../core/autonomous-repair-plan.js";

function clean(
  value
) {
  return String(
    value ?? ""
  ).trim();
}

export function parseAutonomousRepairPlanCliArgs(
  argv
) {
  const args =
    Array.from(
      argv ?? []
    );

  let dayKey =
    null;

  for (
    let index = 0;
    index < args.length;
    index += 1
  ) {
    const arg =
      clean(
        args[index]
      );

    if (
      arg === "--write" ||
      arg === "--repair" ||
      arg === "--authorize" ||
      arg === "--execute" ||
      arg === "--apply" ||
      arg === "--rollback" ||
      arg === "--output" ||
      arg.startsWith(
        "--output="
      )
    ) {
      throw new Error(
        "autonomous_repair_plan_cli_mutation_mode_forbidden"
      );
    }

    if (
      arg === "--day"
    ) {
      dayKey =
        clean(
          args[index + 1]
        );

      index +=
        1;

      continue;
    }

    throw new Error(
      `autonomous_repair_plan_cli_unknown_argument:${arg}`
    );
  }

  if (
    !dayKey ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(
      dayKey
    )
  ) {
    throw new Error(
      "autonomous_repair_plan_cli_valid_day_required"
    );
  }

  return {
    dayKey
  };
}

export function buildAutonomousRepairPlanFromSources({
  dayKey,
  generatedAt =
    new Date().toISOString()
} = {}) {
  const sourceBound =
    buildAutonomousRepairPolicyVerificationFromSources({
      dayKey,
      generatedAt
    });

  const gate =
    evaluateAutonomousRepairAuthorizationGate({
      policy:
        sourceBound.policy,

      verification:
        sourceBound.verification,

      generatedAt
    });

  const plan =
    buildAutonomousRepairPlan({
      policy:
        sourceBound.policy,

      verification:
        sourceBound.verification,

      gate,

      targetsByDecisionId:
        {},

      generatedAt
    });

  return {
    ...sourceBound,
    gate,
    plan
  };
}

async function main() {
  const {
    dayKey
  } =
    parseAutonomousRepairPlanCliArgs(
      process.argv.slice(
        2
      )
    );

  const {
    plan
  } =
    buildAutonomousRepairPlanFromSources({
      dayKey
    });

  process.stdout.write(
    `${JSON.stringify(
      plan,
      null,
      2
    )}\n`
  );
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(
      process.argv[1]
    ).href;

if (invokedDirectly) {
  main().catch(
    error => {
      console.error(
        error?.stack ||
        error
      );

      process.exitCode =
        1;
    }
  );
}
