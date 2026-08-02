import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createProductionIdentityResolverRuntime,
  getProductionIdentityResolverRuntime,
  resetProductionIdentityResolverRuntimeForTests,
} from "./production-identity-resolver-runtime.js";

function required(name) {
  const value = process.env[name];
  assert.ok(value, `${name} is required`);
  return value;
}

function sourcePaths() {
  return {
    contract:
      required("AIML_P0C_RESOLVER_CONTRACT"),
    registry:
      required("AIML_P0C_REGISTRY"),
    retentionLedger:
      required("AIML_P0C_RETENTION"),
    sourceLedger:
      required("AIML_P0C_SOURCE_LEDGER"),
  };
}

function copyInputs() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "aiml-p0c-runtime-loader-"),
  );
  const paths = {};

  for (const [key, source] of Object.entries(
    sourcePaths(),
  )) {
    const destination =
      path.join(root, `${key}.json`);
    fs.copyFileSync(source, destination);
    paths[key] = destination;
  }

  return { root, paths };
}

test("exact committed artifacts build a read-only runtime resolver", () => {
  const runtime =
    createProductionIdentityResolverRuntime({
      paths: sourcePaths(),
    });

  assert.equal(runtime.readOnly, true);
  assert.deepEqual(runtime.counts, {
    identityBindings: 70,
    retainedFixtureIds: 53,
    suppressedFixtureAliases: 53,
    sourceFixtureIds: 106,
  });
  assert.equal(
    runtime.authorization.writePlanGenerated,
    false,
  );
});

test("tampered artifact hash fails closed", () => {
  const copied = copyInputs();
  try {
    fs.appendFileSync(
      copied.paths.registry,
      "\n",
      "utf8",
    );

    assert.throws(
      () =>
        createProductionIdentityResolverRuntime({
          paths: copied.paths,
        }),
      /production_identity_artifact_hash_mismatch:registry/,
    );
  }
  finally {
    fs.rmSync(
      copied.root,
      { recursive: true, force: true },
    );
  }
});

test("missing artifact fails closed", () => {
  const copied = copyInputs();
  try {
    fs.rmSync(copied.paths.retentionLedger);

    assert.throws(
      () =>
        createProductionIdentityResolverRuntime({
          paths: copied.paths,
        }),
    );
  }
  finally {
    fs.rmSync(
      copied.root,
      { recursive: true, force: true },
    );
  }
});

test("default runtime cache is stable until explicitly reset", () => {
  resetProductionIdentityResolverRuntimeForTests();

  const first =
    getProductionIdentityResolverRuntime();
  const second =
    getProductionIdentityResolverRuntime();

  assert.equal(first, second);

  resetProductionIdentityResolverRuntimeForTests();

  const third =
    getProductionIdentityResolverRuntime();

  assert.notEqual(first, third);

  resetProductionIdentityResolverRuntimeForTests();
});

test("runtime loading does not modify decision artifacts", () => {
  const paths = sourcePaths();
  const before = Object.fromEntries(
    Object.entries(paths).map(([key, filePath]) => [
      key,
      fs.readFileSync(filePath),
    ]),
  );

  createProductionIdentityResolverRuntime({
    paths,
  });

  for (const [key, filePath] of Object.entries(paths)) {
    assert.deepEqual(
      fs.readFileSync(filePath),
      before[key],
    );
  }
});
