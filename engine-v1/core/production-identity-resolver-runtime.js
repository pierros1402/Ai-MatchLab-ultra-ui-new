import path from "node:path";
import {
  getProjectRoot,
} from "../storage/data-root.js";
import {
  buildProductionIdentityResolverFromCommittedDecisions,
  loadJsonBomSafe,
  sha256File,
} from "./production-identity-resolver.js";

export const EXPECTED_PRODUCTION_IDENTITY_ARTIFACTS =
  Object.freeze({
    contract: Object.freeze({
      relativePath:
        "data/identity-decisions/production-identity-resolver-contract.v1.json",
      sha256:
        "1865651eba19916053c3bb62c915284909dcf1ac955546cd63a8e814f62c116a",
    }),
    registry: Object.freeze({
      relativePath:
        "data/identity-decisions/production-global-club-id-registry.v1.json",
      sha256:
        "2e10c9eb3c3e0c5f606777711a148c5eb73fc5203449e3a9e3439982a9bc9387",
    }),
    retentionLedger: Object.freeze({
      relativePath:
        "data/identity-decisions/fixture-retention-decision-ledger.v1.json",
      sha256:
        "ad5b28d1e15d989b069035d9092cb31e6620b609d5dbd1ed1d1df3783ac1330b",
    }),
    sourceLedger: Object.freeze({
      relativePath:
        "data/identity-decisions/semantic-duplicate-decision-ledger.v1.json",
      sha256:
        "a0bc336e1df2f1913fed90cd6574aee94ba8d7e502addc8c0d1626e966347574",
    }),
  });

let cachedRuntime = null;

function normalizePaths(paths = {}) {
  const projectRoot =
    String(paths.projectRoot || getProjectRoot());

  return Object.freeze(
    Object.fromEntries(
      Object.entries(
        EXPECTED_PRODUCTION_IDENTITY_ARTIFACTS,
      ).map(([key, artifact]) => [
        key,
        path.resolve(
          paths[key] ||
          path.join(
            projectRoot,
            artifact.relativePath,
          ),
        ),
      ]),
    ),
  );
}

function readVerifiedArtifacts(paths) {
  const values = {};
  const hashes = {};

  for (const [key, artifact] of Object.entries(
    EXPECTED_PRODUCTION_IDENTITY_ARTIFACTS,
  )) {
    const filePath = paths[key];
    const beforeHash = sha256File(filePath);

    if (beforeHash !== artifact.sha256) {
      throw new Error(
        `production_identity_artifact_hash_mismatch:${key}`,
      );
    }

    values[key] = loadJsonBomSafe(filePath);

    const afterHash = sha256File(filePath);
    if (afterHash !== beforeHash) {
      throw new Error(
        `production_identity_artifact_changed_during_read:${key}`,
      );
    }

    hashes[key] = beforeHash;
  }

  return {
    values: Object.freeze(values),
    hashes: Object.freeze(hashes),
  };
}

export function createProductionIdentityResolverRuntime({
  paths = {},
} = {}) {
  const resolvedPaths = normalizePaths(paths);
  const loaded = readVerifiedArtifacts(resolvedPaths);

  const resolver =
    buildProductionIdentityResolverFromCommittedDecisions({
      contract: loaded.values.contract,
      registry: loaded.values.registry,
      retentionLedger:
        loaded.values.retentionLedger,
      sourceLedger:
        loaded.values.sourceLedger,
    });

  return Object.freeze({
    schema:
      "ai-matchlab.production-identity-resolver-runtime.v1",
    resolver,
    paths: resolvedPaths,
    hashes: loaded.hashes,
    counts: resolver.counts,
    readOnly: true,
    authorization: Object.freeze({
      productionDataApplicationAuthorized: false,
      repositoryRepairAuthorized: false,
      fixtureDeletionAuthorized: false,
      historyRewriteAuthorized: false,
      writePlanGenerated: false,
    }),
  });
}

export function getProductionIdentityResolverRuntime() {
  if (!cachedRuntime) {
    cachedRuntime =
      createProductionIdentityResolverRuntime();
  }
  return cachedRuntime;
}

export function getProductionIdentityResolver() {
  return getProductionIdentityResolverRuntime().resolver;
}

export function resetProductionIdentityResolverRuntimeForTests() {
  cachedRuntime = null;
}
