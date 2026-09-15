import path from "node:path";
import {
  fileURLToPath
} from "node:url";

import {
  buildDayTruthLedger
} from "../core/day-truth-ledger.js";

import {
  readDayTruthLedgerInputs,
  readPublicationObservationForDay,
  readSystemHealthObservationForDay
} from "../core/day-truth-ledger-filesystem.js";

import {
  readHistoryObservationForDay,
  readSettlementObservationForDay
} from "../core/day-truth-ledger-downstream-filesystem.js";

import {
  buildDayTruthLedgerDownstreamConvergence
} from "../core/day-truth-ledger-convergence.js";

import {
  writeDayTruthLedgerArtifact
} from "../core/day-truth-ledger-writer.js";

export function parseDayTruthLedgerCliArgs(
  argv = []
) {
  const out = {
    dayKey: "",
    generatedAt: "",
    dryRun: true,
    write: false,
    json: false,
    includePublication: true,
    includeSystemHealth: true
  };

  let explicitMode = null;

  for (
    let index = 0;
    index < argv.length;
    index++
  ) {
    const arg =
      String(
        argv[index] ?? ""
      ).trim();

    if (
      /^\d{4}-\d{2}-\d{2}$/u
        .test(arg)
    ) {
      if (out.dayKey) {
        throw new Error(
          "duplicate_date_argument"
        );
      }

      out.dayKey = arg;
      continue;
    }

    if (
      arg === "--date"
    ) {
      const value =
        String(
          argv[index + 1] ??
          ""
        ).trim();

      if (!value) {
        throw new Error(
          "missing_date_argument"
        );
      }

      if (out.dayKey) {
        throw new Error(
          "duplicate_date_argument"
        );
      }

      out.dayKey = value;
      index++;
      continue;
    }

    if (
      arg.startsWith(
        "--date="
      )
    ) {
      if (out.dayKey) {
        throw new Error(
          "duplicate_date_argument"
        );
      }

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
      arg === "--generated-at"
    ) {
      const value =
        String(
          argv[index + 1] ??
          ""
        ).trim();

      if (!value) {
        throw new Error(
          "missing_generated_at_argument"
        );
      }

      out.generatedAt =
        value;

      index++;
      continue;
    }

    if (
      arg === "--dry-run"
    ) {
      if (
        explicitMode ===
        "write"
      ) {
        throw new Error(
          "day_truth_ledger_conflicting_write_mode"
        );
      }

      explicitMode =
        "dry-run";

      out.dryRun =
        true;

      out.write =
        false;

      continue;
    }

    if (
      arg === "--json"
    ) {
      out.json = true;
      continue;
    }

    if (
      arg === "--no-publication"
    ) {
      out.includePublication =
        false;

      continue;
    }

    if (
      arg === "--no-system-health"
    ) {
      out.includeSystemHealth =
        false;

      continue;
    }

    if (
      arg === "--write"
    ) {
      if (
        explicitMode ===
        "dry-run"
      ) {
        throw new Error(
          "day_truth_ledger_conflicting_write_mode"
        );
      }

      explicitMode =
        "write";

      out.dryRun =
        false;

      out.write =
        true;

      continue;
    }

    /*
     * Output override remains forbidden.
     * The writer owns exactly one fixed data path.
     */
    if (
      arg === "--output" ||
      arg.startsWith(
        "--output="
      )
    ) {
      throw new Error(
        "day_truth_ledger_output_override_forbidden"
      );
    }

    if (arg) {
      throw new Error(
        `unknown_argument:${arg}`
      );
    }
  }

  if (!out.dayKey) {
    throw new Error(
      "day_key_required"
    );
  }

  return out;
}

export function buildDayTruthLedgerDay({
  dayKey,
  generatedAt =
    new Date().toISOString(),
  includePublication = true,
  includeSystemHealth = true
} = {}) {
  const inputs =
    readDayTruthLedgerInputs(
      dayKey,
      {
        includePublication,
        includeSystemHealth
      }
    );

  const baseLedger =
    buildDayTruthLedger({
      dayKey:
        inputs.dayKey,

      generatedAt,

      canonicalRows:
        inputs.canonicalRows,

      verifiedFinalRows:
        inputs.verifiedFinalRows,

      downstream:
        inputs.downstream,

      provenance:
        inputs.provenance
    });

  const historyObservation =
    readHistoryObservationForDay(
      inputs.dayKey
    );

  const settlementObservation =
    readSettlementObservationForDay(
      inputs.dayKey
    );

  const publicationObservation =
    includePublication
      ? readPublicationObservationForDay(
          inputs.dayKey
        )
      : {
          observed: false,
          file: null,
          fixtureRows: 0,
          fixtureIds: []
        };

  const systemHealthObservation =
    includeSystemHealth
      ? readSystemHealthObservationForDay(
          inputs.dayKey
        )
      : {
          observed: false,
          file: null,
          payload: null
        };

  const downstreamConvergence =
    buildDayTruthLedgerDownstreamConvergence({
      ledger:
        baseLedger,

      historyObservation,

      settlementObservation,

      publicationObservation,

      systemHealthObservation
    });

  const ledger =
    buildDayTruthLedger({
      dayKey:
        inputs.dayKey,

      generatedAt,

      canonicalRows:
        inputs.canonicalRows,

      verifiedFinalRows:
        inputs.verifiedFinalRows,

      downstream:
        inputs.downstream,

      downstreamConvergence,

      provenance:
        inputs.provenance
    });

  if (
    ledger.truthFingerprint !==
    baseLedger.truthFingerprint
  ) {
    throw new Error(
      "downstream_convergence_changed_truth_fingerprint"
    );
  }

  return {
    ok: true,

    dryRun: true,

    writeAuthorized: false,

    artifactWritten: false,

    outputPath:
      `data/day-truth-ledger/${inputs.dayKey}.json`,

    sourceSummary:
      inputs.sourceSummary,

    ledger
  };
}

export function executeDayTruthLedgerDay({
  dayKey,
  generatedAt =
    new Date().toISOString(),
  includePublication = true,
  includeSystemHealth = true,
  write = false
} = {}) {
  const built =
    buildDayTruthLedgerDay({
      dayKey,
      generatedAt,
      includePublication,
      includeSystemHealth
    });

  if (write !== true) {
    return built;
  }

  const persisted =
    writeDayTruthLedgerArtifact({
      ledger:
        built.ledger
    });

  return {
    ...built,

    dryRun:
      false,

    writeAuthorized:
      true,

    artifactWritten:
      persisted
        .artifactWritten,

    artifactUnchanged:
      persisted
        .unchanged,

    writeReason:
      persisted.reason,

    outputPath:
      persisted.outputPath,

    ledger:
      persisted.artifact
  };
}

function cliSummary(result) {
  return {
    ok:
      result.ok,

    dryRun:
      result.dryRun,

    writeAuthorized:
      result.writeAuthorized,

    artifactWritten:
      result.artifactWritten,

    artifactUnchanged:
      result.artifactUnchanged ??
      false,

    writeReason:
      result.writeReason ??
      null,

    outputPath:
      result.outputPath,

    dayKey:
      result.ledger.dayKey,

    ledgerState:
      result.ledger.ledgerState,

    truthFingerprint:
      result.ledger.truthFingerprint,

    summary:
      result.ledger.summary,

    sourceSummary:
      result.sourceSummary,

    convergence: {
      overallState:
        result.ledger
          .downstream
          .convergence
          ?.overallState ??
        null,

      historyState:
        result.ledger
          .downstream
          .convergence
          ?.history
          ?.state ??
        null,

      settlementState:
        result.ledger
          .downstream
          .convergence
          ?.settlement
          ?.state ??
        null,

      publicationState:
        result.ledger
          .downstream
          .convergence
          ?.publication
          ?.state ??
        null,

      systemHealthState:
        result.ledger
          .downstream
          .convergence
          ?.systemHealth
          ?.state ??
        null
    }
  };
}

const isMain =
  process.argv[1] &&
  fileURLToPath(
    import.meta.url
  ) ===
    path.resolve(
      process.argv[1]
    );

if (isMain) {
  try {
    const args =
      parseDayTruthLedgerCliArgs(
        process.argv.slice(2)
      );

    const result =
      executeDayTruthLedgerDay({
        dayKey:
          args.dayKey,

        generatedAt:
          args.generatedAt ||
          new Date().toISOString(),

        includePublication:
          args.includePublication,

        includeSystemHealth:
          args.includeSystemHealth,

        write:
          args.write
      });

    console.log(
      JSON.stringify(
        args.json
          ? result
          : cliSummary(result),
        null,
        2
      )
    );
  }
  catch (error) {
    console.error(
      error?.message ||
      String(error)
    );

    process.exitCode = 1;
  }
}
