import {
  pathToFileURL
} from "node:url";

import {
  buildDayTruthLedgerDay
} from "./build-day-truth-ledger-day.js";

import {
  buildAutonomousTruthReconciliationAudit
} from "../core/autonomous-truth-reconciliation-audit.js";

import {
  buildAutonomousTruthReconciliationEvidenceExpansion
} from "../core/autonomous-truth-reconciliation-evidence-expansion.js";

import {
  buildAutonomousTruthReconciliationPrimaryEvidence
} from "../core/autonomous-truth-reconciliation-primary-evidence.js";

import {
  buildAutonomousRepairPolicyDay
} from "../core/autonomous-repair-policy-day.js";

function clean(
  value
) {
  return String(
    value ?? ""
  ).trim();
}

export function parseAutonomousRepairPolicyDayCliArgs(
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
      arg === "--output" ||
      arg.startsWith(
        "--output="
      )
    ) {
      throw new Error(
        "autonomous_repair_policy_day_cli_mutation_mode_forbidden"
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
      `autonomous_repair_policy_day_cli_unknown_argument:${arg}`
    );
  }

  if (
    !dayKey ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(
      dayKey
    )
  ) {
    throw new Error(
      "autonomous_repair_policy_day_cli_valid_day_required"
    );
  }

  return {
    dayKey
  };
}

export function buildAutonomousRepairPolicyDayFromSources({
  dayKey,
  generatedAt =
    new Date().toISOString()
} = {}) {
  const ledgerResult =
    buildDayTruthLedgerDay({
      dayKey,
      generatedAt
    });

  const ledger =
    ledgerResult?.ledger ??
    ledgerResult;

  const audit =
    buildAutonomousTruthReconciliationAudit({
      ledger,
      generatedAt
    });

  const downstreamEvidence =
    buildAutonomousTruthReconciliationEvidenceExpansion({
      ledger,
      audit
    });

  const primaryEvidence =
    buildAutonomousTruthReconciliationPrimaryEvidence({
      ledger,
      audit
    });

  const policy =
    buildAutonomousRepairPolicyDay({
      ledger,
      audit,
      downstreamEvidence,
      primaryEvidence,
      generatedAt
    });

  return {
    ledger,
    audit,
    downstreamEvidence,
    primaryEvidence,
    policy
  };
}

async function main() {
  const {
    dayKey
  } =
    parseAutonomousRepairPolicyDayCliArgs(
      process.argv.slice(
        2
      )
    );

  const result =
    buildAutonomousRepairPolicyDayFromSources({
      dayKey
    });

  process.stdout.write(
    `${JSON.stringify(
      result.policy,
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
