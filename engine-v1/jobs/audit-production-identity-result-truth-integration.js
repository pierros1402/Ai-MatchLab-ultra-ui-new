#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  pathToFileURL,
} from "node:url";

import {
  createProductionIdentityResolverRuntime,
} from "../core/production-identity-resolver-runtime.js";

import {
  bindProductionResultIdentity,
  captureResultTruth,
} from "../core/production-result-identity-binding.js";

function fail(message) {
  throw new Error(message);
}

export function parseArgs(argv) {
  const args = {};

  for (
    let index = 2;
    index < argv.length;
    index += 1
  ) {
    const token =
      argv[index];

    if (!token.startsWith("--")) {
      fail(
        `unexpected_argument:${token}`,
      );
    }

    const key =
      token.slice(2);

    const value =
      argv[index + 1];

    if (
      !value ||
      value.startsWith("--")
    ) {
      fail(
        `missing_value:${key}`,
      );
    }

    args[key] =
      value;

    index += 1;
  }

  for (const key of [
    "repo-root",
    "final-results-root",
    "results-memory-root",
    "contract",
    "registry",
    "retention",
    "source-ledger",
    "output",
  ]) {
    if (!args[key]) {
      fail(
        `missing_argument:${key}`,
      );
    }
  }

  return args;
}

function sha256File(filePath) {
  return crypto
    .createHash("sha256")
    .update(
      fs.readFileSync(filePath),
    )
    .digest("hex");
}

function readJsonBomSafe(
  filePath,
) {
  return JSON.parse(
    fs.readFileSync(
      filePath,
      "utf8",
    ).replace(/^\uFEFF/u, ""),
  );
}

function listJsonFiles(root) {
  if (!fs.existsSync(root)) {
    return [];
  }

  const out = [];
  const stack = [root];

  while (stack.length > 0) {
    const current =
      stack.pop();

    for (const entry of fs.readdirSync(
      current,
      {
        withFileTypes: true,
      },
    )) {
      const fullPath =
        path.join(
          current,
          entry.name,
        );

      if (entry.isDirectory()) {
        stack.push(fullPath);
      }
      else if (
        entry.isFile() &&
        entry.name.endsWith(".json")
      ) {
        out.push(fullPath);
      }
    }
  }

  return out.sort();
}

function rowsFromPayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (
    !payload ||
    typeof payload !== "object"
  ) {
    return [];
  }

  for (const key of [
    "results",
    "fixtures",
    "matches",
    "rows",
    "items",
  ]) {
    if (
      Array.isArray(
        payload[key],
      )
    ) {
      return payload[key];
    }
  }

  return [payload];
}

export function auditIdentityRows(
  rows,
  {
    resolver,
  },
) {
  const summary = {
    rowsScanned: 0,
    managedRows: 0,
    retainedRows: 0,
    suppressedRows: 0,
    unmanagedRows: 0,
    truthChangedRows: 0,
    bindingErrors: 0,
  };

  const issues = [];
  const details = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    summary.rowsScanned += 1;

    const beforeTruth =
      captureResultTruth(row);

    try {
      const identity =
        bindProductionResultIdentity(
          row,
          { resolver },
        );

      if (!identity.managed) {
        summary.unmanagedRows += 1;
        continue;
      }

      summary.managedRows += 1;

      if (
        identity.sourceFixtureRole ===
        "retained"
      ) {
        summary.retainedRows += 1;
      }
      else if (
        identity.sourceFixtureRole ===
        "suppressed_lineage_alias"
      ) {
        summary.suppressedRows += 1;
      }
      else {
        throw new Error(
          `unexpected_source_fixture_role:${identity.sourceFixtureRole}`,
        );
      }

      const afterTruth =
        captureResultTruth(
          identity.row,
        );

      if (
        JSON.stringify(beforeTruth) !==
        JSON.stringify(afterTruth)
      ) {
        summary.truthChangedRows += 1;

        issues.push({
          code:
            "RESULT_TRUTH_CHANGED_DURING_IDENTITY_BINDING",
          fixtureId:
            identity.sourceFixtureId,
        });
      }

      details.push({
        sourceFixtureId:
          identity.sourceFixtureId,
        resolvedFixtureId:
          identity.resolvedFixtureId,
        sourceFixtureRole:
          identity.sourceFixtureRole,
        scoreTruthChanged:
          identity.scoreTruthChanged,
        statusTruthChanged:
          identity.statusTruthChanged,
      });
    }
    catch (error) {
      summary.bindingErrors += 1;

      issues.push({
        code:
          "RESULT_IDENTITY_BINDING_ERROR",
        error:
          error.message,
      });
    }
  }

  return {
    summary,
    details,
    issues,
  };
}

function resultMemoryRows(payload) {
  const rows = [];

  for (
    const [teamName, entries]
    of Object.entries(
      payload?.teams || {},
    )
  ) {
    for (
      const entry of
      Array.isArray(entries)
        ? entries
        : []
    ) {
      if (
        entry?.ha !== "H"
      ) {
        continue;
      }

      rows.push({
        canonicalId:
          entry?.canonicalId,
        matchId:
          entry?.matchId,
        sourceFixtureId:
          entry?.sourceFixtureId,
        homeTeam:
          teamName,
        awayTeam:
          entry?.opp,
        scoreHome:
          entry?.gf,
        scoreAway:
          entry?.ga,
      });
    }
  }

  return rows;
}

const STRUCTURAL_REQUIREMENTS =
  Object.freeze([
    Object.freeze({
      file:
        "engine-v1/core/results-truth-overlay.js",
      anchors:
        Object.freeze([
          "production-result-identity-binding.js",
          "resolvedFixtureId",
          "suppressed_lineage_alias",
        ]),
    }),

    Object.freeze({
      file:
        "engine-v1/jobs/export-verified-final-results-day.js",
      anchors:
        Object.freeze([
          "bindProductionResultIdentity",
          "bindVerifiedFinalResultPayloadIdentity",
          "requireCanonicalMembership",
        ]),
    }),

    Object.freeze({
      file:
        "engine-v1/storage/results-memory-db.js",
      anchors:
        Object.freeze([
          "bindProductionResultIdentity",
          "resultMemoryIdentityFields",
          "sourceMatchId",
        ]),
    }),

    Object.freeze({
      file:
        "engine-v1/storage/result-dedup.js",
      anchors:
        Object.freeze([
          "bindProductionResultIdentity",
          "resultMemoryIdentityFields",
          "sourceMatchId",
        ]),
    }),
  ]);

export function structuralIntegrationStatus(
  repoRoot,
) {
  const missing = [];
  const files = [];

  for (
    const requirement of
    STRUCTURAL_REQUIREMENTS
  ) {
    const filePath =
      path.join(
        repoRoot,
        requirement.file,
      );

    if (
      !fs.existsSync(filePath)
    ) {
      missing.push({
        file:
          requirement.file,
        anchor:
          "__file_missing__",
      });

      continue;
    }

    const text =
      fs.readFileSync(
        filePath,
        "utf8",
      );

    const missingAnchors =
      requirement.anchors.filter(
        anchor =>
          !text.includes(anchor),
      );

    for (
      const anchor of
      missingAnchors
    ) {
      missing.push({
        file:
          requirement.file,
        anchor,
      });
    }

    files.push({
      file:
        requirement.file,
      requiredAnchors:
        requirement.anchors.length,
      missingAnchors:
        missingAnchors.length,
    });
  }

  return {
    ok:
      missing.length === 0,
    productionConsumersIntegrated:
      STRUCTURAL_REQUIREMENTS.length,
    files,
    missing,
  };
}

export function runResultTruthIntegrationAudit(
  args,
) {
  const repoRoot =
    path.resolve(
      args["repo-root"],
    );

  const finalResultsRoot =
    path.resolve(
      args["final-results-root"],
    );

  const resultsMemoryRoot =
    path.resolve(
      args["results-memory-root"],
    );

  const artifactPaths = {
    contract:
      path.resolve(
        args.contract,
      ),

    registry:
      path.resolve(
        args.registry,
      ),

    retentionLedger:
      path.resolve(
        args.retention,
      ),

    sourceLedger:
      path.resolve(
        args["source-ledger"],
      ),
  };

  const finalResultFiles =
    listJsonFiles(
      finalResultsRoot,
    );

  const resultsMemoryFiles =
    listJsonFiles(
      resultsMemoryRoot,
    );

  const inputFiles = [
    ...Object.values(
      artifactPaths,
    ),
    ...finalResultFiles,
    ...resultsMemoryFiles,
  ];

  const beforeHashes =
    Object.fromEntries(
      inputFiles.map(
        filePath => [
          filePath,
          sha256File(
            filePath,
          ),
        ],
      ),
    );

  const runtime =
    createProductionIdentityResolverRuntime({
      paths:
        artifactPaths,
    });

  const finalRows = [];

  for (
    const filePath of
    finalResultFiles
  ) {
    const payload =
      readJsonBomSafe(
        filePath,
      );

    finalRows.push(
      ...rowsFromPayload(
        payload,
      ),
    );
  }

  const memoryRows = [];

  for (
    const filePath of
    resultsMemoryFiles
  ) {
    memoryRows.push(
      ...resultMemoryRows(
        readJsonBomSafe(
          filePath,
        ),
      ),
    );
  }

  const finalAudit =
    auditIdentityRows(
      finalRows,
      {
        resolver:
          runtime.resolver,
      },
    );

  const memoryAudit =
    auditIdentityRows(
      memoryRows,
      {
        resolver:
          runtime.resolver,
      },
    );

  const structural =
    structuralIntegrationStatus(
      repoRoot,
    );

  const afterHashes =
    Object.fromEntries(
      inputFiles.map(
        filePath => [
          filePath,
          sha256File(
            filePath,
          ),
        ],
      ),
    );

  const changedInputs =
    inputFiles.filter(
      filePath =>
        beforeHashes[filePath] !==
        afterHashes[filePath],
    );

  const issues = [
    ...finalAudit.issues.map(
      issue => ({
        ...issue,
        surface:
          "verified_final_results",
      }),
    ),

    ...memoryAudit.issues.map(
      issue => ({
        ...issue,
        surface:
          "results_memory",
      }),
    ),
  ];

  if (!structural.ok) {
    issues.push({
      code:
        "T1B_PRODUCTION_CONSUMER_INTEGRATION_INCOMPLETE",
      missing:
        structural.missing,
    });
  }

  if (
    changedInputs.length > 0
  ) {
    issues.push({
      code:
        "T1B_AUDIT_INPUT_CHANGED",
      changedInputs,
    });
  }

  const report = {
    schema:
      "ai-matchlab.p0c-t1b-result-truth-integration-audit.v1",

    generatedAt:
      new Date().toISOString(),

    ok:
      issues.length === 0,

    status:
      issues.length === 0
        ? "PASS_T1B_LOCAL_INTEGRATION_NO_DATA_WRITES"
        : "FAIL_T1B_LOCAL_INTEGRATION_AUDIT",

    summary: {
      managedFixtureIds:
        runtime.resolver
          .listManagedFixtureIds()
          .length,

      finalResultFilesScanned:
        finalResultFiles.length,

      finalResultRowsScanned:
        finalAudit.summary.rowsScanned,

      finalResultManagedRows:
        finalAudit.summary.managedRows,

      finalResultRetainedRows:
        finalAudit.summary.retainedRows,

      finalResultSuppressedRows:
        finalAudit.summary.suppressedRows,

      resultMemoryFilesScanned:
        resultsMemoryFiles.length,

      resultMemoryRowsScanned:
        memoryAudit.summary.rowsScanned,

      resultMemoryManagedRows:
        memoryAudit.summary.managedRows,

      resultMemoryRetainedRows:
        memoryAudit.summary.retainedRows,

      resultMemorySuppressedRows:
        memoryAudit.summary.suppressedRows,

      resultTruthChangedRows:
        finalAudit.summary.truthChangedRows +
        memoryAudit.summary.truthChangedRows,

      bindingErrors:
        finalAudit.summary.bindingErrors +
        memoryAudit.summary.bindingErrors,

      productionConsumersIntegrated:
        structural
          .productionConsumersIntegrated,

      productionArtifactsUpdated:
        0,

      canonicalFilesModified:
        0,

      finalResultFilesModified:
        0,

      resultMemoryFilesModified:
        0,

      historyRowsRewritten:
        0,

      writePlanRows:
        0,
    },

    structural,

    finalResultIdentityRows:
      finalAudit.details,

    resultMemoryIdentityRows:
      memoryAudit.details,

    readOnlyEvidence: {
      inputFilesChecked:
        inputFiles.length,

      inputFilesChanged:
        changedInputs.length,

      changedInputs,
    },

    pendingMandatoryObligations: {
      canonicalPropagationP2Pending:
        true,

      resultBindingAndReferenceCrosswalkP3Pending:
        true,

      suppressedReferenceFilesPending:
        216,

      derivedRebuildArtifactsPending:
        1291,

      fullRepositoryClosurePending:
        true,

      p0cPropagationComplete:
        false,
    },

    authorization: {
      productionDataApplicationAuthorized:
        false,

      repositoryRepairAuthorized:
        false,

      fixtureRetentionApplicationAuthorized:
        false,

      fixtureDeletionAuthorized:
        false,

      resultTruthMutationAuthorized:
        false,

      terminalStatusMutationAuthorized:
        false,

      resultMemoryRewriteAuthorized:
        false,

      historyRewriteAuthorized:
        false,

      writePlanGenerated:
        false,

      commitAuthorized:
        false,

      pushAuthorized:
        false,

      workflowAuthorized:
        false,

      deployAuthorized:
        false,
    },

    issueCount:
      issues.length,

    issues,
  };

  fs.writeFileSync(
    path.resolve(
      args.output,
    ),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  console.log(
    JSON.stringify(report),
  );

  return report;
}

const invokedAsCli =
  Boolean(process.argv[1]) &&
  import.meta.url ===
    pathToFileURL(
      path.resolve(
        process.argv[1],
      ),
    ).href;

if (invokedAsCli) {
  try {
    runResultTruthIntegrationAudit(
      parseArgs(
        process.argv,
      ),
    );
  }
  catch (error) {
    console.error(
      JSON.stringify({
        ok: false,
        error:
          error.message,
        stack:
          error.stack,
      }),
    );

    process.exitCode = 1;
  }
}
