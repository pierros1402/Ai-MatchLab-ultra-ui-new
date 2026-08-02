#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  createProductionIdentityResolverRuntime,
} from "../core/production-identity-resolver-runtime.js";
import {
  applyProductionIdentityMembershipGate,
  repositoryFixtureIdForRow,
} from "../core/day-fixture-universe.js";

function fail(message) {
  throw new Error(message);
}

export function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      fail(`unexpected_argument:${token}`);
    }
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      fail(`missing_value:${key}`);
    }
    args[key] = value;
    index += 1;
  }

  for (const key of [
    "canonical-root",
    "contract",
    "registry",
    "retention",
    "source-ledger",
    "expected-affected-files",
    "output",
  ]) {
    if (!args[key]) {
      fail(`missing_argument:${key}`);
    }
  }

  return args;
}

function sha256File(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function readJsonBomSafe(filePath) {
  return JSON.parse(
    fs.readFileSync(filePath, "utf8")
      .replace(/^\uFEFF/, ""),
  );
}

function listJsonFiles(root) {
  if (!fs.existsSync(root)) return [];

  const out = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();

    for (const entry of fs.readdirSync(
      current,
      { withFileTypes: true },
    )) {
      const fullPath =
        path.join(current, entry.name);

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

function fixtureRows(payload) {
  return Array.isArray(payload?.fixtures)
    ? payload.fixtures
    : Array.isArray(payload)
      ? payload
      : [];
}

export function runConsumerIntegrationAudit(args) {
  const canonicalRoot =
    path.resolve(args["canonical-root"]);
  const expectedAffectedFiles =
    Number(args["expected-affected-files"]);

  if (
    !Number.isInteger(expectedAffectedFiles) ||
    expectedAffectedFiles < 0
  ) {
    fail("expected_affected_files_invalid");
  }

  const artifactPaths = {
    contract: path.resolve(args.contract),
    registry: path.resolve(args.registry),
    retentionLedger:
      path.resolve(args.retention),
    sourceLedger:
      path.resolve(args["source-ledger"]),
  };

  const canonicalFiles =
    listJsonFiles(canonicalRoot);

  const inputFiles = [
    ...Object.values(artifactPaths),
    ...canonicalFiles,
  ];

  const beforeHashes =
    Object.fromEntries(
      inputFiles.map(filePath => [
        filePath,
        sha256File(filePath),
      ]),
    );

  const runtime =
    createProductionIdentityResolverRuntime({
      paths: artifactPaths,
    });

  const resolver = runtime.resolver;
  const managedFixtureIds =
    resolver.listManagedFixtureIds();
  const foundManagedFixtureIds =
    new Set();

  const fileReports = [];
  let affectedCanonicalFiles = 0;
  let retainedRowsPresent = 0;
  let suppressedRowsPresent = 0;
  let suppressedWithRetainedTarget = 0;
  let suppressedWithoutRetainedTarget = 0;
  let identityOverlayRows = 0;
  let unmanagedRows = 0;

  for (const filePath of canonicalFiles) {
    const payload =
      readJsonBomSafe(filePath);

    const rows =
      fixtureRows(payload).map(row => ({
        ...row,
        leagueSlug:
          row?.leagueSlug ||
          path.basename(filePath, ".json"),
      }));

    const managedRows =
      rows.filter(row => {
        const fixtureId =
          repositoryFixtureIdForRow(row);

        if (
          fixtureId &&
          resolver.isManagedFixtureId(
            fixtureId,
          )
        ) {
          foundManagedFixtureIds.add(
            fixtureId,
          );
          return true;
        }

        return false;
      });

    if (managedRows.length === 0) {
      continue;
    }

    affectedCanonicalFiles += 1;

    for (const row of managedRows) {
      const resolution =
        resolver.resolveFixtureId(
          repositoryFixtureIdForRow(row),
        );

      if (
        resolution.sourceRole ===
        "retained"
      ) {
        retainedRowsPresent += 1;
      }
      else if (
        resolution.sourceRole ===
        "suppressed_lineage_alias"
      ) {
        suppressedRowsPresent += 1;
      }
    }

    const gate =
      applyProductionIdentityMembershipGate(
        rows,
        { resolver },
      );

    suppressedWithRetainedTarget +=
      gate.diagnostics
        .suppressedWithRetainedTarget;

    suppressedWithoutRetainedTarget +=
      gate.diagnostics
        .suppressedWithoutRetainedTarget;

    identityOverlayRows +=
      gate.diagnostics.identityOverlayRows;

    unmanagedRows +=
      gate.diagnostics.unmanagedRows;

    fileReports.push({
      file:
        path.relative(
          canonicalRoot,
          filePath,
        ).replace(/\\/g, "/"),
      inputRows:
        rows.length,
      outputRows:
        gate.rows.length,
      managedRows:
        managedRows.length,
      diagnostics:
        gate.diagnostics,
    });
  }

  const missingManagedFixtureIds =
    managedFixtureIds.filter(
      fixtureId =>
        !foundManagedFixtureIds.has(
          fixtureId,
        ),
    );

  const afterHashes =
    Object.fromEntries(
      inputFiles.map(filePath => [
        filePath,
        sha256File(filePath),
      ]),
    );

  const changedInputs =
    inputFiles.filter(
      filePath =>
        beforeHashes[filePath] !==
        afterHashes[filePath],
    );

  const issues = [];

  if (
    affectedCanonicalFiles !==
    expectedAffectedFiles
  ) {
    issues.push({
      code:
        "AFFECTED_CANONICAL_FILE_COUNT_MISMATCH",
      severity: "error",
      expected:
        expectedAffectedFiles,
      actual:
        affectedCanonicalFiles,
    });
  }

  if (changedInputs.length > 0) {
    issues.push({
      code: "AUDIT_INPUT_CHANGED",
      severity: "error",
      changedInputs,
    });
  }

  const report = {
    schema:
      "ai-matchlab.p0c-t1a-consumer-integration-audit.v1",
    generatedAt:
      new Date().toISOString(),
    ok:
      issues.length === 0,
    status:
      issues.length === 0
        ? "PASS_T1A_LOCAL_INTEGRATION_NO_DATA_WRITES"
        : "FAIL_T1A_LOCAL_INTEGRATION_AUDIT",
    summary: {
      managedFixtureIds:
        managedFixtureIds.length,
      managedFixtureIdsFound:
        foundManagedFixtureIds.size,
      managedFixtureIdsMissing:
        missingManagedFixtureIds.length,
      canonicalFilesScanned:
        canonicalFiles.length,
      affectedCanonicalFiles,
      retainedRowsPresent,
      suppressedRowsPresent,
      suppressedWithRetainedTarget,
      suppressedWithoutRetainedTarget,
      identityOverlayRows,
      unmanagedRows,
      productionConsumersIntegrated: 1,
      productionArtifactsUpdated: 0,
      canonicalFilesModified: 0,
      fixtureRowsDeleted: 0,
      historyRowsRewritten: 0,
      writePlanRows: 0,
    },
    missingManagedFixtureIds,
    affectedFiles: fileReports,
    readOnlyEvidence: {
      inputFilesChecked:
        inputFiles.length,
      inputFilesChanged:
        changedInputs.length,
      changedInputs,
    },
    authorization: {
      productionDataApplicationAuthorized: false,
      repositoryRepairAuthorized: false,
      fixtureRetentionApplicationAuthorized: false,
      fixtureDeletionAuthorized: false,
      historyRewriteAuthorized: false,
      writePlanGenerated: false,
      commitAuthorized: false,
      pushAuthorized: false,
      workflowAuthorized: false,
      deployAuthorized: false,
    },
    issueCount:
      issues.length,
    issues,
  };

  fs.writeFileSync(
    path.resolve(args.output),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  console.log(JSON.stringify(report));
  return report;
}

const invokedAsCli =
  Boolean(process.argv[1]) &&
  import.meta.url ===
    pathToFileURL(
      path.resolve(process.argv[1]),
    ).href;

if (invokedAsCli) {
  try {
    runConsumerIntegrationAudit(
      parseArgs(process.argv),
    );
  }
  catch (error) {
    console.error(JSON.stringify({
      ok: false,
      error: error.message,
      stack: error.stack,
    }));
    process.exitCode = 1;
  }
}
