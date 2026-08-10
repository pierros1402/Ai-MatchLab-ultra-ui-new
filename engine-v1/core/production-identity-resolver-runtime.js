import path from "node:path";
import {
  getProjectRoot,
} from "../storage/data-root.js";
import {
  buildProductionIdentityResolverFromCommittedDecisions,
  loadJsonBomSafe,
  sha256File,
} from "./production-identity-resolver.js";
import {
  buildExtendedProductionIdentityResolver,
} from "./production-identity-extension.js";
import {
  mergeProductionIdentityExtensionLedgers,
} from "./production-identity-extension-composite.js";

export const PRODUCTION_IDENTITY_EXTENSION_RELATIVE_PATH =
  "data/identity-decisions/production-identity-extension-ledger.v1.json";

export const PRODUCTION_IDENTITY_RECOVERY_SUPPLEMENT_RELATIVE_PATH =
  "data/identity-decisions/production-identity-recovery-supplement.v1.json";

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

  return Object.freeze({
    ...Object.fromEntries(
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
    extensionLedger: path.resolve(
      paths.extensionLedger ||
      path.join(
        projectRoot,
        PRODUCTION_IDENTITY_EXTENSION_RELATIVE_PATH,
      ),
    ),
    recoverySupplementLedger: path.resolve(
      paths.recoverySupplementLedger ||
      path.join(
        projectRoot,
        PRODUCTION_IDENTITY_RECOVERY_SUPPLEMENT_RELATIVE_PATH,
      ),
    ),
  });
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

function readStableExtensionLedger(filePath) {
  let beforeHash;
  try {
    beforeHash = sha256File(filePath);
  }
  catch {
    throw new Error(
      "production_identity_extension_ledger_missing",
    );
  }

  const value = loadJsonBomSafe(filePath);
  const afterHash = sha256File(filePath);

  if (afterHash !== beforeHash) {
    throw new Error(
      "production_identity_extension_changed_during_read",
    );
  }

  return Object.freeze({
    value,
    sha256: beforeHash,
  });
}

export function createProductionIdentityResolverRuntime({
  paths = {},
} = {}) {
  const resolvedPaths = normalizePaths(paths);
  const loaded = readVerifiedArtifacts(resolvedPaths);
  const extension =
    readStableExtensionLedger(
      resolvedPaths.extensionLedger,
    );
  const recoverySupplement =
    readStableExtensionLedger(
      resolvedPaths.recoverySupplementLedger,
    );

  const baseResolver =
    buildProductionIdentityResolverFromCommittedDecisions({
      contract: loaded.values.contract,
      registry: loaded.values.registry,
      retentionLedger:
        loaded.values.retentionLedger,
      sourceLedger:
        loaded.values.sourceLedger,
    });

  const composite =
    mergeProductionIdentityExtensionLedgers({
      primary: extension.value,
      supplement: recoverySupplement.value,
      baseResolver,
    });

  const resolver =
    buildExtendedProductionIdentityResolver({
      baseResolver,
      ledger: composite.ledger,
    });

  return Object.freeze({
    schema:
      "ai-matchlab.production-identity-resolver-runtime.v2",
    resolver,
    // Exposed read-only for the source-bound extension promoter. Promotion
    // validation must be anchored to the immutable P0-C resolver, not to a
    // candidate ledger that could otherwise prove its own new identities.
    baseResolver,
    paths: resolvedPaths,
    hashes: Object.freeze({
      ...loaded.hashes,
      extensionLedger:
        extension.sha256,
      recoverySupplementLedger:
        recoverySupplement.sha256,
    }),
    counts: resolver.counts,
    effectiveCounts:
      resolver.effectiveCounts,
    extension:
      resolver.extension,
    recoverySupplement: Object.freeze({
      mergeStatus: "PASS_PRODUCTION_IDENTITY_RECOVERY_SUPPLEMENT_MERGE",
      sha256: recoverySupplement.sha256,
      diagnostics: composite.diagnostics,
    }),
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
