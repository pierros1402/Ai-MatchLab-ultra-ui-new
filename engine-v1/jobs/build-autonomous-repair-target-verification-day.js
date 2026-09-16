import path from "node:path";
import {
  fileURLToPath,
  pathToFileURL
} from "node:url";

import {
  buildAutonomousRepairPlanFromSources
} from "./build-autonomous-repair-plan-day.js";

import {
  validateAutonomousRepairTargetVerificationArtifact,
  verifyAutonomousRepairPlanTargets
} from "../core/autonomous-repair-target-verifier.js";

const PROJECT_ROOT =
  path.resolve(
    fileURLToPath(
      new URL(
        "../../",
        import.meta.url
      )
    )
  );

function clean(
  value
) {
  return String(
    value ?? ""
  ).trim();
}

export function parseAutonomousRepairTargetVerificationCliArgs(
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
      ) ||
      arg === "--project-root" ||
      arg.startsWith(
        "--project-root="
      )
    ) {
      throw new Error(
        "autonomous_repair_target_verification_cli_mutation_or_root_override_forbidden"
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
      `autonomous_repair_target_verification_cli_unknown_argument:${arg}`
    );
  }

  if (
    !dayKey ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(
      dayKey
    )
  ) {
    throw new Error(
      "autonomous_repair_target_verification_cli_valid_day_required"
    );
  }

  return {
    dayKey
  };
}

export function buildAutonomousRepairTargetVerificationFromSources({
  dayKey,
  generatedAt =
    new Date().toISOString()
} = {}) {
  const sourceBound =
    buildAutonomousRepairPlanFromSources({
      dayKey,
      generatedAt
    });

  const targetVerification =
    verifyAutonomousRepairPlanTargets({
      plan:
        sourceBound.plan,
      projectRoot:
        PROJECT_ROOT,
      generatedAt
    });

  validateAutonomousRepairTargetVerificationArtifact(
    targetVerification
  );

  if (
    targetVerification.dayKey !==
      sourceBound.plan.dayKey ||
    targetVerification.planFingerprint !==
      sourceBound.plan.planFingerprint
  ) {
    throw new Error(
      "autonomous_repair_target_verification_source_binding_mismatch"
    );
  }

  return {
    ...sourceBound,
    targetVerification
  };
}

async function main() {
  const {
    dayKey
  } =
    parseAutonomousRepairTargetVerificationCliArgs(
      process.argv.slice(
        2
      )
    );

  const {
    targetVerification
  } =
    buildAutonomousRepairTargetVerificationFromSources({
      dayKey
    });

  process.stdout.write(
    `${JSON.stringify(
      targetVerification,
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
