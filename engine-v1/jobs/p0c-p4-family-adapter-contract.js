export const P0C_P4_FAMILY_ADAPTER_CONTRACT_SCHEMA =
  "ai-matchlab.p0c-p4-family-adapter-contract.v1";

export const P0C_P4_FAMILY_ADAPTER_DISCOVERY_BINDING =
  Object.freeze({
    branch:
      "work/p0c-identity-duplicate-ledger-20260801",
    head:
      "bf7c9bde7f076b52cf13d59f0499480f7e738099",
    tree:
      "e356769f348e74fbd70ccc4a99d3dbaef7de2b09",
    sourcePreflightSha256:
      "57410324df20897c525af6dcb8b903b05885cd634fd9765d9aa87b26ca401291",
    wholeRepositoryDiscoverySha256:
      "62c198c177477775995c8c09eaeeedf07dfbd1223086a0dd8a3511a9809aeef3",
    inventoryPathCount: 1291,
    familyCount: 13,
    trackedPathCount: 28586,
    scannedTextSourceCount: 656,
    candidateRowCount: 332,
    uniqueCandidateFileCount: 144,
    bundledSourceFileCount: 332,
    importEdgeCount: 876,
    unresolvedRelativeImportCount: 0,
  });


export const P0C_P4_FAMILY_ADAPTER_APPLICATION_BINDING_V2 =
  Object.freeze({
    schema:
      "ai-matchlab.p0c-p4-family-adapter-application-binding.v2",
    branch:
      "work/p0c-identity-duplicate-ledger-20260801",
    sourceHead:
      "20317c767ab10bae13f3bca42671fa490406334c",
    sourceTree:
      "177c1ef6d7db783ced93a15257bdc181c063b7f2",
    authoritativeCanonicalResultSha256:
      "3fd00f8e59343765bab48ae750854692b84863e6b374ec94936dcc9e63bef11f",
    originalInventoryPathCount: 1291,
    originalInventorySha256:
      "6e4bcb5209ed8e5e49b55c809cbf0d53617ad4971bec73f56d4f7cf37b66d5cc",
    applicationInventoryPath:
      "engine-v1/contracts/p0c-p4-normalized-inventory.v2.jsonl",
    applicationInventoryPathCount: 1294,
    applicationInventorySha256:
      "acac6db0c2b928dff8700d76448838d3138b0acb7734cc6dc72a282d879c41ef",
    addedRetainedDetailCreatePaths: Object.freeze([
      "data/deploy-snapshots/2026-07-29/details/cid_uefachampions_crvenazvezdasrb_larnenir_20260729.json",
      "data/deploy-snapshots/2026-07-29/details/cid_uefachampions_univcraiovarou_levskisofiabul_20260729.json",
      "data/deploy-snapshots/2026-08-01/details/cid_arg2_colegiales_gimnasiajujuy_20260801.json",
    ]),
    externalCompositionManifestSha256:
      "e8a78e16de4dfd90a210532570a4b3791f4858b13016dce5c465ec6f8b0793ea",
    externalApplicationGatePackageSha256:
      "30d21472e68dd782ed68970813b11cc52a0393b200ccb62c007cc3f2550186b7",
    expectedWriteCount: 1128,
    expectedDeleteCount: 166,
    expectedIdentityDetailDeleteCount: 41,
    expectedCanonicalStaleDetailDeleteCount: 10,
    expectedH2HStaleDeleteCount: 115,
    repositoryApplicationAuthorized: false,
    commitAuthorized: false,
    pushAuthorized: false,
    workflowAuthorized: false,
    deployAuthorized: false,
  });

const SOURCE_BINDINGS = Object.freeze({
  compositionApplicationInventoryV2: Object.freeze({
    path:
      "engine-v1/contracts/p0c-p4-normalized-inventory.v2.jsonl",
    sha256:
      "acac6db0c2b928dff8700d76448838d3138b0acb7734cc6dc72a282d879c41ef",
    exports: Object.freeze([]),
  }),
  identitySafeCompositionLoaders: Object.freeze({
    path:
      "engine-v1/jobs/p0c-p4-identity-safe-composition-loaders.js",
    sha256:
      "f5d7dc5f9d573ae73320eda665449d35852ca5cc182043a3bfde6dbc05e09d7a",
    exports: Object.freeze([
      "P0C_P4_IDENTITY_SAFE_COMPOSITION_LOADERS_SCHEMA",
      "P0C_P4_CANONICAL_ALIAS_RECONCILIATION_SCHEMA",
      "P0C_P4_H2H_FIXTURE_ONLY_FALLBACK_SCHEMA",
      "p0cP4TruthVector",
      "p0cP4TruthVectorKey",
      "reconcileP0CP4CanonicalAliasGroup",
      "createP0CP4H2HFixtureIdOnlyOverlay",
    ]),
  }),
  deploySnapshotManifestPureBuilder: Object.freeze({
    path:
      "engine-v1/jobs/p0c-p4-build-deploy-snapshot-manifest.js",
    sha256:
      "4e5adf8f3dbe80913e05fe05caaa3d5e4eb1e23c922f432b701eda0da4e21676",
    exports: Object.freeze([
      "P0C_P4_DEPLOY_SNAPSHOT_MANIFEST_SCHEMA",
      "P0C_P4_DEPLOY_SNAPSHOT_MANIFEST_REQUIRED_FAMILIES",
      "buildP0CP4DeploySnapshotManifest",
    ]),
  }),
  deploySnapshotExporter: Object.freeze({
    path: "engine-v1/jobs/export-deploy-snapshot-day.js",
    sha256:
      "b60038124aabba2e545f462fbd403078571f7afaedc0ca90abebf2a4109bbd61",
    exports: Object.freeze(["exportDeploySnapshotDay"]),
  }),
  deploySnapshotFixturesPureBuilder: Object.freeze({
    path:
      "engine-v1/jobs/p0c-p4-build-deploy-snapshot-fixtures.js",
    sha256:
      "94971cf7df8ed93b0e29aa3cb4a1f7deb0c3c9321c770d7bac8bbbbc34bc34d0",
    exports: Object.freeze([
      "P0C_P4_DEPLOY_SNAPSHOT_FIXTURES_SCHEMA",
      "buildP0CP4DeploySnapshotFixtures",
      "buildP0CP4DeploySnapshotFixturesFromArtifacts",
    ]),
  }),
  detailsBuilder: Object.freeze({
    path: "engine-v1/jobs/build-details-day.js",
    sha256:
      "889dd0c6faabf7efdf320c19e5de971442636e70ddcc931c3d6121e37714af02",
    exports: Object.freeze([
      "buildDetailsDay",
      "buildDetailsForMatch",
      "ensureDetailsForFixtures",
    ]),
  }),
  deploySnapshotDetailsPureBuilder: Object.freeze({
    path:
      "engine-v1/jobs/p0c-p4-build-deploy-snapshot-details.js",
    sha256:
      "ad02d716813f046f1b8ea161a543417013db7361e709f1a60114b8fbfb5a0529",
    exports: Object.freeze([
      "P0C_P4_DEPLOY_SNAPSHOT_DETAILS_SCHEMA",
      "p0cP4DetailIdCandidates",
      "p0cP4DeployDetailOutputId",
      "p0cP4DeployDetailCanonicalBytes",
      "p0cP4DeployDetailCanonicalSha256",
      "buildP0CP4DeploySnapshotDetails",
    ]),
  }),
  fixturesAllRebuilder: Object.freeze({
    path:
      "engine-v1/jobs/rebuild-fixtures-all-from-canonical-evidence-day.js",
    sha256:
      "19772a15dfc8db2bb9c31c72bc0f1f72de2d943a8d910361a5ac2a52892e2800",
    exports: Object.freeze([
      "buildFixturesAllFromCanonicalEvidenceDay",
      "writeFixturesAllArtifact",
    ]),
  }),
  oddsSnapshotExporter: Object.freeze({
    path: "engine-v1/jobs/export-odds-snapshot-day.js",
    sha256:
      "368d806c2e02277d3c9cee32ef87a05166bb4517b5929c36f979c95266c35e01",
    exports: Object.freeze(["exportOddsSnapshotDay"]),
  }),
  deploySnapshotOddsPureBuilder: Object.freeze({
    path:
      "engine-v1/jobs/p0c-p4-build-deploy-snapshot-odds.js",
    sha256:
      "15193d61b127dc4624310ff579c6d60887c4a6c48845a16763255c24030901b7",
    exports: Object.freeze([
      "P0C_P4_DEPLOY_SNAPSHOT_ODDS_SCHEMA",
      "P0C_P4_DEPLOY_SNAPSHOT_ODDS_SOURCE",
      "computeP0CP4DeploySnapshotOddsContentHash",
      "buildP0CP4DeploySnapshotOdds",
      "buildP0CP4DeploySnapshotOddsFromMatches",
    ]),
  }),
  existingValueArtifactPureBuilder: Object.freeze({
    path:
      "engine-v1/jobs/p0c-p4-build-existing-value-artifact.js",
    sha256:
      "a5185ed6635c2ac9809d801f114a7193c943fe44f417f937550f2d705da23c4c",
    exports: Object.freeze([
      "P0C_P4_EXISTING_VALUE_ARTIFACT_SCHEMA",
      "P0C_P4_VALUE_IDENTITY_OVERLAY_SCHEMA",
      "buildP0CP4ExistingValueArtifact",
    ]),
  }),
  valueRefreshPipeline: Object.freeze({
    path: "engine-v1/jobs/refresh-value-artifacts-day.js",
    sha256:
      "440cddc693962366d4a9b7634c2afc9cff70a052cbc056e4ddbc40cec9cdc04b",
    exports: Object.freeze(["refreshValueArtifactsDay"]),
  }),
  expectedMatchRecorder: Object.freeze({
    path: "engine-v1/jobs/record-expected-day.js",
    sha256:
      "6cca3a560b0c7aac88811a3d59032d9582638312dccedb6db82f0f8ccf5dbd8a",
    exports: Object.freeze(["recordExpectedDay"]),
  }),
  expectedMatchPureBuilder: Object.freeze({
    path:
      "engine-v1/jobs/p0c-p4-build-expected-match-view.js",
    sha256:
      "44b1f37f370ca39a344c0d844a0f2e5b2d815213e26c3c6f7007cc622e534cda",
    exports: Object.freeze([
      "P0C_P4_EXPECTED_MATCH_VIEW_SCHEMA",
      "buildP0CP4ExpectedMatchView",
      "buildP0CP4ExpectedMatchViewFromExisting",
    ]),
  }),
  h2hRebuilder: Object.freeze({
    path:
      "engine-v1/jobs/rebuild-h2h-index-from-identity-resolved-history.js",
    sha256:
      "d588f772277c2d4d4c53bcd995cd801d510a52ad199a87ee87ce7f6b7f46c6ba",
    exports: Object.freeze([
      "buildH2HArtifactsFromHistory",
      "materializeH2HArtifacts",
    ]),
  }),
  legacyFixturesRebuilder: Object.freeze({
    path:
      "engine-v1/jobs/rebuild-legacy-fixtures-aggregate-p0c.js",
    sha256:
      "7fc194e1d3f2acad0bb54ddcd44108c29255dcf5795b118579e30be21ba3441e",
    exports: Object.freeze([
      "buildLegacyFixturesAggregateP0C",
      "writeLegacyFixturesAggregate",
    ]),
  }),
  valueBuilder: Object.freeze({
    path: "engine-v1/core/build-value-day.js",
    sha256:
      "39453e7e92761a572de45e374fc3bbb18558c7d1c9ef9b5f2a98d3d18696ca92",
    exports: Object.freeze(["buildValueDay"]),
  }),
  planBBuilder: Object.freeze({
    path: "engine-v1/jobs/derive-value-from-odds.js",
    sha256:
      "076a4d199d5363153e0b98270759f195129d23b8634b9a9c487cf538745e7c1a",
    exports: Object.freeze(["deriveValueFromOdds"]),
  }),
  planA2B2Builder: Object.freeze({
    path: "engine-v1/jobs/build-value-a2-b2-day.js",
    sha256:
      "141d32651a969e583875a74580478f4675b0a2da4e054ea69fedc3c560476ca3",
    exports: Object.freeze(["buildValueA2B2Day"]),
  }),
  valueComparisonBuilder: Object.freeze({
    path:
      "engine-v1/jobs/build-value-plan-comparison-day.js",
    sha256:
      "0a247fd6dc9e6b4106b96f32d0564a8f97afbb7b621a2ff1abfdee891ab3ede0",
    exports: Object.freeze(["buildValuePlanComparisonDay"]),
  }),
  standaloneValuePipeline: Object.freeze({
    path: "engine-v1/jobs/build-value-standalone-day.js",
    sha256:
      "510258351e532669525d7c4d49dd3b84a9898dda6c1524554f63a362096c6dfd",
    exports: Object.freeze(["runStandaloneValueDay"]),
  }),
  planAIdentityMigration: Object.freeze({
    path: "engine-v1/core/p0c-plan-a-identity-migration.js",
    sha256:
      "12fa28ceb5ab441717357a42150ded766af5f8fa51145ec21e46074a2efcc227",
    exports: Object.freeze([
      "buildPlanAIdentityOverlay",
      "writePlanAIdentityOverlay",
    ]),
  }),
  evidenceOverlay: Object.freeze({
    path:
      "engine-v1/core/production-evidence-identity-overlay.js",
    sha256:
      "8035b378e63ad89c5a45d16bb639fc5062ac71bb8cad02f6a5cef68ce356967e",
    exports: Object.freeze([
      "createProductionEvidenceIdentityOverlay",
      "overlayProductionEvidenceDocumentReadView",
    ]),
  }),
});

const FAMILY_DESCRIPTORS = Object.freeze([
  Object.freeze({
    family: "DEPLOY_SNAPSHOT_DETAILS",
    inventoryPathCount: 631,
    pathPattern:
      "^data/deploy-snapshots/\\d{4}-\\d{2}-\\d{2}/details/[^/]+\\.json$",
    executionGroup: "DEPLOY_SNAPSHOT_BUNDLE",
    adapterState: "PURE_BUILDER_READY",
    strategy:
      "Use the P0-C deploy-snapshot details pure builder over canonical detail sources, preserved deploy details and published fixture evidence, with deletion-aware complete-family output.",
    sourceBindings: Object.freeze([
      "deploySnapshotDetailsPureBuilder",
      "detailsBuilder",
      "deploySnapshotExporter",
      "evidenceOverlay",
    ]),
  }),
  Object.freeze({
    family: "DEPLOY_SNAPSHOT_FIXTURES",
    inventoryPathCount: 61,
    pathPattern:
      "^data/deploy-snapshots/\\d{4}-\\d{2}-\\d{2}/fixtures\\.json$",
    executionGroup: "DEPLOY_SNAPSHOT_BUNDLE",
    adapterState: "PURE_BUILDER_READY",
    strategy:
      "Use the P0-C deploy-snapshot fixtures pure builder over the rebuilt fixture universe and fixtures-all display evidence.",
    sourceBindings: Object.freeze([
      "deploySnapshotFixturesPureBuilder",
      "deploySnapshotExporter",
      "fixturesAllRebuilder",
      "evidenceOverlay",
    ]),
  }),
  Object.freeze({
    family: "DEPLOY_SNAPSHOT_FIXTURES_ALL",
    inventoryPathCount: 40,
    pathPattern:
      "^data/deploy-snapshots/\\d{4}-\\d{2}-\\d{2}/fixtures-all\\.json$",
    executionGroup: "FIXTURE_FOUNDATION",
    adapterState: "PURE_BUILDER_READY",
    strategy:
      "Use the P0-C canonical-evidence in-memory rebuild and emit one artifact per inventory day.",
    sourceBindings: Object.freeze([
      "fixturesAllRebuilder",
      "identitySafeCompositionLoaders",
      "evidenceOverlay",
    ]),
  }),
  Object.freeze({
    family: "DEPLOY_SNAPSHOT_MANIFEST",
    inventoryPathCount: 15,
    pathPattern:
      "^data/deploy-snapshots/\\d{4}-\\d{2}-\\d{2}/manifest\\.json$",
    executionGroup: "DEPLOY_SNAPSHOT_BUNDLE",
    adapterState: "PURE_BUILDER_READY",
    strategy:
      "Use the P0-C pure manifest builder only after the complete fixed fixtures, details, Value and Value-audit output sets are supplied for the day; preserve source operational metadata and recompute all output-bound counts, hashes, coverage and release hash.",
    sourceBindings: Object.freeze([
      "deploySnapshotManifestPureBuilder",
      "deploySnapshotExporter",
      "evidenceOverlay",
    ]),
  }),
  Object.freeze({
    family: "DEPLOY_SNAPSHOT_ODDS",
    inventoryPathCount: 34,
    pathPattern:
      "^data/deploy-snapshots/\\d{4}-\\d{2}-\\d{2}/odds\\.json$",
    executionGroup: "ODDS_VIEW",
    adapterState: "PURE_BUILDER_READY",
    strategy:
      "Use the P0-C deploy-snapshot odds pure builder over identity-resolved odds-memory evidence with an injected deterministic build timestamp.",
    sourceBindings: Object.freeze([
      "deploySnapshotOddsPureBuilder",
      "oddsSnapshotExporter",
      "evidenceOverlay",
    ]),
  }),
  Object.freeze({
    family: "DEPLOY_SNAPSHOT_VALUE",
    inventoryPathCount: 12,
    pathPattern:
      "^data/deploy-snapshots/\\d{4}-\\d{2}-\\d{2}/value\\.json$",
    executionGroup: "VALUE_BUNDLE",
    adapterState: "PURE_BUILDER_READY",
    strategy:
      "Apply the source-bound identity overlay to the existing snapshot Value artifact without re-running model evaluation or changing pick truth.",
    sourceBindings: Object.freeze([
      "existingValueArtifactPureBuilder",
      "evidenceOverlay",
    ]),
  }),
  Object.freeze({
    family: "DEPLOY_SNAPSHOT_VALUE_AUDIT",
    inventoryPathCount: 10,
    pathPattern:
      "^data/deploy-snapshots/\\d{4}-\\d{2}-\\d{2}/value-audit\\.json$",
    executionGroup: "VALUE_BUNDLE",
    adapterState: "PURE_BUILDER_READY",
    strategy:
      "Apply the source-bound identity overlay to the existing snapshot Value audit while preserving rejection and evaluation accounting truth.",
    sourceBindings: Object.freeze([
      "existingValueArtifactPureBuilder",
      "evidenceOverlay",
    ]),
  }),
  Object.freeze({
    family: "EXPECTED_MATCH_VIEW",
    inventoryPathCount: 25,
    pathPattern:
      "^data/expected-matches/\\d{4}-\\d{2}-\\d{2}\\.json$",
    executionGroup: "EXPECTED_MATCH_PROJECTION",
    adapterState: "PURE_BUILDER_READY",
    strategy:
      "Use the P0-C expected-match in-memory builder over rebuilt fixtures-all while preserving existing record metadata.",
    sourceBindings: Object.freeze([
      "expectedMatchPureBuilder",
      "expectedMatchRecorder",
      "fixturesAllRebuilder",
    ]),
  }),
  Object.freeze({
    family: "H2H_INDEX",
    inventoryPathCount: 425,
    pathPattern:
      "^data/h2h/[^/]+\\.json$",
    executionGroup: "HISTORY_INDEX",
    adapterState: "PURE_BUILDER_READY",
    strategy:
      "Use identity-resolved history to build the complete retained H2H index in memory.",
    sourceBindings: Object.freeze([
      "h2hRebuilder",
      "identitySafeCompositionLoaders",
      "evidenceOverlay",
    ]),
  }),
  Object.freeze({
    family: "LEGACY_FIXTURES_AGGREGATE",
    inventoryPathCount: 1,
    pathPattern:
      "^data/fixtures\\.json$",
    executionGroup: "FIXTURE_FOUNDATION",
    adapterState: "PURE_BUILDER_READY",
    strategy:
      "Rebuild the legacy aggregate from canonical day partitions and the retained fixture universe.",
    sourceBindings: Object.freeze([
      "legacyFixturesRebuilder",
      "fixturesAllRebuilder",
      "evidenceOverlay",
    ]),
  }),
  Object.freeze({
    family: "VALUE_AUDIT_ARTIFACT",
    inventoryPathCount: 10,
    pathPattern:
      "^data/value/_audit/\\d{4}-\\d{2}-\\d{2}\\.json$",
    executionGroup: "VALUE_BUNDLE",
    adapterState: "PURE_BUILDER_READY",
    strategy:
      "Apply the source-bound identity overlay to the existing canonical Value audit without re-evaluating candidates or rejection gates.",
    sourceBindings: Object.freeze([
      "existingValueArtifactPureBuilder",
      "evidenceOverlay",
    ]),
  }),
  Object.freeze({
    family: "VALUE_COMPARISON",
    inventoryPathCount: 3,
    pathPattern:
      "^data/value-comparison/\\d{4}-\\d{2}-\\d{2}\\.json$",
    executionGroup: "VALUE_BUNDLE",
    adapterState: "PURE_BUILDER_READY",
    strategy:
      "Apply the source-bound identity overlay to the existing four-plan comparison after settlement truth is fixed, without recomputing plan results.",
    sourceBindings: Object.freeze([
      "existingValueArtifactPureBuilder",
      "evidenceOverlay",
    ]),
  }),
  Object.freeze({
    family: "VALUE_PLAN_ARTIFACT",
    inventoryPathCount: 27,
    pathPattern:
      "^data/value-plans/\\d{4}-\\d{2}-\\d{2}/(?:plan-a|plan-b|plan-a2|plan-a2-audit|plan-b-audit|plan-b2|plan-b2-audit)\\.json$",
    executionGroup: "VALUE_BUNDLE",
    adapterState: "PURE_BUILDER_READY",
    strategy:
      "Apply the source-bound identity overlay to existing plan and audit artifacts; preserve immutable Plan A bytes and all historic pick, score, status and settlement truth.",
    sourceBindings: Object.freeze([
      "existingValueArtifactPureBuilder",
      "evidenceOverlay",
    ]),
  }),
]);

function clean(value) {
  return String(value ?? "").trim();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizedRelativePath(value) {
  const text = clean(value).replaceAll("\\", "/");
  if (
    !text ||
    text.startsWith("/") ||
    /^[A-Za-z]:/u.test(text) ||
    text.split("/").includes("..")
  ) {
    throw new Error("p0c_p4_adapter_contract_path_invalid");
  }
  return text;
}

function descriptorMap() {
  return new Map(
    FAMILY_DESCRIPTORS.map(row => [row.family, row]),
  );
}

function producerMap() {
  return new Map(
    Object.values(SOURCE_BINDINGS).map(row => [row.path, row]),
  );
}

export function getP0CP4FamilyAdapterContract() {
  return Object.freeze({
    schema: P0C_P4_FAMILY_ADAPTER_CONTRACT_SCHEMA,
    discoveryBinding: clone(
      P0C_P4_FAMILY_ADAPTER_DISCOVERY_BINDING,
    ),
    applicationBindingV2: clone(
      P0C_P4_FAMILY_ADAPTER_APPLICATION_BINDING_V2,
    ),
    sourceBindings: clone(SOURCE_BINDINGS),
    families: clone(FAMILY_DESCRIPTORS),
    invariants: Object.freeze({
      repositoryApplicationAuthorized: false,
      producerDiscoveryComplete: true,
      unresolvedRelativeImports: 0,
      inventoryPathCount: 1294,
      familyCount: 13,
      directArtifactEditingAuthorized: false,
    }),
  });
}

export function validateP0CP4FamilyAdapterInventory({
  inventoryRows,
  expectedInventoryCount = 1294,
} = {}) {
  if (!Array.isArray(inventoryRows)) {
    throw new Error("p0c_p4_adapter_contract_inventory_required");
  }
  if (inventoryRows.length !== expectedInventoryCount) {
    throw new Error(
      `p0c_p4_adapter_contract_inventory_count_mismatch:${inventoryRows.length}:${expectedInventoryCount}`,
    );
  }

  const descriptors = descriptorMap();
  const paths = new Set();
  const counts = new Map();

  for (let index = 0; index < inventoryRows.length; index++) {
    const row = inventoryRows[index];
    if (!row || typeof row !== "object") {
      throw new Error(
        `p0c_p4_adapter_contract_inventory_row_invalid:${index}`,
      );
    }

    const relativePath = normalizedRelativePath(row.file);
    const family = clean(row.rebuildFamily);
    const descriptor = descriptors.get(family);

    if (!descriptor) {
      throw new Error(
        `p0c_p4_adapter_contract_family_unknown:${family || "missing"}`,
      );
    }
    if (clean(row.phase) !== "P4_DERIVED_REBUILD") {
      throw new Error(
        `p0c_p4_adapter_contract_phase_invalid:${relativePath}`,
      );
    }
    if (
      row.rebuildRequired !== true ||
      row.directFileEditAuthorized === true ||
      row.manualEditAuthorized === true ||
      row.producerDiscoveryRequired !== true ||
      row.applicationAuthorized === true
    ) {
      throw new Error(
        `p0c_p4_adapter_contract_fail_closed_violation:${relativePath}`,
      );
    }
    if (!new RegExp(descriptor.pathPattern, "u").test(relativePath)) {
      throw new Error(
        `p0c_p4_adapter_contract_path_family_mismatch:${family}:${relativePath}`,
      );
    }
    if (paths.has(relativePath)) {
      throw new Error(
        `p0c_p4_adapter_contract_inventory_duplicate:${relativePath}`,
      );
    }

    paths.add(relativePath);
    counts.set(family, (counts.get(family) || 0) + 1);
  }

  for (const descriptor of FAMILY_DESCRIPTORS) {
    const actual = counts.get(descriptor.family) || 0;
    if (actual !== descriptor.inventoryPathCount) {
      throw new Error(
        `p0c_p4_adapter_contract_family_count_mismatch:${descriptor.family}:${actual}:${descriptor.inventoryPathCount}`,
      );
    }
  }

  return Object.freeze({
    ok: true,
    status: "PASS_P0C_P4_FAMILY_ADAPTER_INVENTORY_CONTRACT",
    schema: P0C_P4_FAMILY_ADAPTER_CONTRACT_SCHEMA,
    inventoryPathCount: paths.size,
    familyCount: counts.size,
    families: Object.freeze(
      FAMILY_DESCRIPTORS.map(descriptor => Object.freeze({
        family: descriptor.family,
        inventoryPathCount:
          counts.get(descriptor.family) || 0,
        adapterState: descriptor.adapterState,
        executionGroup: descriptor.executionGroup,
      })),
    ),
    repositoryApplicationAuthorized: false,
  });
}

export function validateP0CP4ProducerEvidence({
  sourceRecords,
} = {}) {
  if (!Array.isArray(sourceRecords)) {
    throw new Error(
      "p0c_p4_adapter_contract_source_records_required",
    );
  }

  const expected = producerMap();
  const observed = new Map();

  for (const row of sourceRecords) {
    if (!row || typeof row !== "object") {
      throw new Error(
        "p0c_p4_adapter_contract_source_record_invalid",
      );
    }
    const relativePath = normalizedRelativePath(row.path);
    const sha256 = clean(row.sha256).toLowerCase();

    if (!/^[a-f0-9]{64}$/u.test(sha256)) {
      throw new Error(
        `p0c_p4_adapter_contract_source_hash_invalid:${relativePath}`,
      );
    }
    if (observed.has(relativePath)) {
      throw new Error(
        `p0c_p4_adapter_contract_source_record_duplicate:${relativePath}`,
      );
    }
    observed.set(relativePath, sha256);
  }

  for (const [relativePath, binding] of expected) {
    const actual = observed.get(relativePath);
    if (!actual) {
      throw new Error(
        `p0c_p4_adapter_contract_source_missing:${relativePath}`,
      );
    }
    if (actual !== binding.sha256) {
      throw new Error(
        `p0c_p4_adapter_contract_source_hash_mismatch:${relativePath}`,
      );
    }
  }

  return Object.freeze({
    ok: true,
    status: "PASS_P0C_P4_FAMILY_ADAPTER_PRODUCER_BINDINGS",
    schema: P0C_P4_FAMILY_ADAPTER_CONTRACT_SCHEMA,
    requiredSourceCount: expected.size,
    observedSourceCount: observed.size,
    repositoryApplicationAuthorized: false,
  });
}

export function buildP0CP4FamilyRunnerRegistry({
  implementations,
} = {}) {
  if (
    !implementations ||
    typeof implementations !== "object" ||
    Array.isArray(implementations)
  ) {
    throw new Error(
      "p0c_p4_adapter_contract_implementations_required",
    );
  }

  const descriptors = descriptorMap();
  const supplied = Object.keys(implementations).sort();
  const expected = [...descriptors.keys()].sort();

  for (const family of supplied) {
    if (!descriptors.has(family)) {
      throw new Error(
        `p0c_p4_adapter_contract_implementation_unknown:${family}`,
      );
    }
  }

  for (const family of expected) {
    if (typeof implementations[family] !== "function") {
      throw new Error(
        `p0c_p4_adapter_contract_implementation_missing:${family}`,
      );
    }
  }

  const registry = Object.fromEntries(
    expected.map(family => [
      family,
      implementations[family],
    ]),
  );

  return Object.freeze({
    schema: P0C_P4_FAMILY_ADAPTER_CONTRACT_SCHEMA,
    familyCount: expected.length,
    familyRunners: Object.freeze(registry),
    repositoryApplicationAuthorized: false,
  });
}
