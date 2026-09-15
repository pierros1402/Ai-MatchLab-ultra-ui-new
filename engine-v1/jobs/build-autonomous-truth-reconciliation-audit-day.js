import {
  pathToFileURL
} from "node:url";

import {
  readAutonomousTruthReconciliationAuditDay
} from "../core/autonomous-truth-reconciliation-audit-filesystem.js";

export function parseAutonomousTruthReconciliationAuditCliArgs(
  argv
) {
  const out = {
    dayKey:
      null,

    generatedAt:
      null,

    ledgerGeneratedAt:
      null,

    json:
      false,

    includePublication:
      true,

    includeSystemHealth:
      true
  };

  for (
    const rawArg of
    Array.isArray(argv)
      ? argv
      : []
  ) {
    const arg =
      String(
        rawArg ?? ""
      ).trim();

    if (!arg) {
      continue;
    }

    if (
      arg.startsWith(
        "--date="
      )
    ) {
      out.dayKey =
        arg.slice(
          "--date=".length
        );

      continue;
    }

    if (
      arg.startsWith(
        "--generated-at="
      )
    ) {
      out.generatedAt =
        arg.slice(
          "--generated-at=".length
        );

      continue;
    }

    if (
      arg.startsWith(
        "--ledger-generated-at="
      )
    ) {
      out.ledgerGeneratedAt =
        arg.slice(
          "--ledger-generated-at=".length
        );

      continue;
    }

    if (
      arg ===
      "--json"
    ) {
      out.json =
        true;

      continue;
    }

    if (
      arg ===
      "--no-publication"
    ) {
      out.includePublication =
        false;

      continue;
    }

    if (
      arg ===
      "--no-system-health"
    ) {
      out.includeSystemHealth =
        false;

      continue;
    }

    if (
      arg ===
        "--write" ||
      arg.startsWith(
        "--output"
      ) ||
      arg ===
        "--repair" ||
      arg.startsWith(
        "--repair="
      )
    ) {
      throw new Error(
        "autonomous_truth_reconciliation_audit_mutation_not_authorized"
      );
    }

    throw new Error(
      `autonomous_truth_reconciliation_audit_unknown_argument:${arg}`
    );
  }

  if (
    !out.dayKey
  ) {
    throw new Error(
      "autonomous_truth_reconciliation_audit_date_required"
    );
  }

  return out;
}

export function buildAutonomousTruthReconciliationAuditDay({
  dayKey,
  generatedAt =
    new Date().toISOString(),
  ledgerGeneratedAt =
    generatedAt,
  includePublication =
    true,
  includeSystemHealth =
    true
} = {}) {
  const result =
    readAutonomousTruthReconciliationAuditDay({
      dayKey,
      generatedAt,
      ledgerGeneratedAt,
      includePublication,
      includeSystemHealth
    });

  return {
    ok:
      true,

    dayKey:
      result.dayKey,

    dryRun:
      true,

    sourceBound:
      true,

    writeAuthorized:
      false,

    artifactWritten:
      false,

    repairAuthorized:
      false,

    audit:
      result.audit,

    evidenceIndex:
      result.evidenceIndex,

    ledger:
      result.ledger,

    sourceSummary:
      result.sourceSummary,

    authority:
      result.authority
  };
}

function summary(
  result
) {
  return {
    ok:
      result.ok,

    dayKey:
      result.dayKey,

    dryRun:
      result.dryRun,

    sourceBound:
      result.sourceBound,

    writeAuthorized:
      result.writeAuthorized,

    artifactWritten:
      result.artifactWritten,

    repairAuthorized:
      result.repairAuthorized,

    ledgerState:
      result.ledger
        .ledgerState,

    truthFingerprint:
      result.ledger
        .truthFingerprint,

    auditState:
      result.audit
        .auditState,

    auditFingerprint:
      result.audit
        .auditFingerprint,

    anomalyCount:
      result.audit
        .summary
        .anomalyCount,

    blockingCount:
      result.audit
        .summary
        .blockingCount,

    reconciliationRequiredCount:
      result.audit
        .summary
        .reconciliationRequiredCount,

    observationGapCount:
      result.audit
        .summary
        .observationGapCount,

    diagnosticOnlyCount:
      result.audit
        .summary
        .diagnosticOnlyCount,

    canonicalIds:
      result.evidenceIndex
        .canonicalIds,

    reasonCodes:
      result.evidenceIndex
        .reasonCodes,

    evidenceRefs:
      result.evidenceIndex
        .evidenceRefs
  };
}

function isMain() {
  const entry =
    process.argv[1];

  if (!entry) {
    return false;
  }

  return (
    import.meta.url ===
    pathToFileURL(
      entry
    ).href
  );
}

if (isMain()) {
  try {
    const args =
      parseAutonomousTruthReconciliationAuditCliArgs(
        process.argv.slice(2)
      );

    const generatedAt =
      args.generatedAt ||
      new Date().toISOString();

    const result =
      buildAutonomousTruthReconciliationAuditDay({
        dayKey:
          args.dayKey,

        generatedAt,

        ledgerGeneratedAt:
          args.ledgerGeneratedAt ||
          generatedAt,

        includePublication:
          args.includePublication,

        includeSystemHealth:
          args.includeSystemHealth
      });

    console.log(
      JSON.stringify(
        args.json
          ? result
          : summary(result),
        null,
        2
      )
    );
  }
  catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : String(error)
    );

    process.exitCode =
      1;
  }
}
