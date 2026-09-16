import {
  pathToFileURL
} from "node:url";

import {
  buildAutonomousRepairPolicyDayFromSources
} from "./build-autonomous-repair-policy-day.js";

import {
  verifyAutonomousRepairPolicyIndependently
} from "../core/autonomous-repair-policy-independent-verifier.js";

function clean(
  value
) {
  return String(
    value ?? ""
  ).trim();
}

export function parseAutonomousRepairPolicyVerificationCliArgs(
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
      arg === "--output" ||
      arg.startsWith("--output=")
    ) {
      throw new Error(
        "autonomous_repair_policy_verification_cli_mutation_mode_forbidden"
      );
    }

    if (arg === "--day") {
      dayKey =
        clean(
          args[index + 1]
        );

      index +=
        1;

      continue;
    }

    throw new Error(
      `autonomous_repair_policy_verification_cli_unknown_argument:${arg}`
    );
  }

  if (
    !dayKey ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(
      dayKey
    )
  ) {
    throw new Error(
      "autonomous_repair_policy_verification_cli_valid_day_required"
    );
  }

  return {
    dayKey
  };
}

export function buildAutonomousRepairPolicyVerificationFromSources({
  dayKey,
  generatedAt =
    new Date().toISOString()
} = {}) {
  const sourceBound =
    buildAutonomousRepairPolicyDayFromSources({
      dayKey,
      generatedAt
    });

  const verification =
    verifyAutonomousRepairPolicyIndependently({
      ledger:
        sourceBound.ledger,

      audit:
        sourceBound.audit,

      downstreamEvidence:
        sourceBound.downstreamEvidence,

      primaryEvidence:
        sourceBound.primaryEvidence,

      policy:
        sourceBound.policy,

      generatedAt
    });

  return {
    ...sourceBound,
    verification
  };
}

async function main() {
  const {
    dayKey
  } =
    parseAutonomousRepairPolicyVerificationCliArgs(
      process.argv.slice(2)
    );

  const {
    verification
  } =
    buildAutonomousRepairPolicyVerificationFromSources({
      dayKey
    });

  process.stdout.write(
    `${JSON.stringify(
      verification,
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
