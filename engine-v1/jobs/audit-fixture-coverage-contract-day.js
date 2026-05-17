import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { LEAGUES_COVERAGE } from "../../workers/_shared/leagues-coverage.js";
import { getFixtureProviderPlan } from "../adapters/registry.js";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";

function readJson(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    dayKey: null,
    strictSingleProvider: true,
    minTrust: 0,
    valueTier: 1,
    uiTier: 2
  };

  for (const arg of argv) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
      out.dayKey = arg;
      continue;
    }

    if (arg.startsWith("--date=")) {
      out.dayKey = arg.slice("--date=".length);
      continue;
    }

    if (arg.startsWith("--min-trust=")) {
      out.minTrust = Number(arg.slice("--min-trust=".length));
      continue;
    }

    if (arg.startsWith("--value-tier=")) {
      out.valueTier = Number(arg.slice("--value-tier=".length));
      continue;
    }

    if (arg.startsWith("--ui-tier=")) {
      out.uiTier = Number(arg.slice("--ui-tier=".length));
      continue;
    }

    if (arg === "--allow-single-provider") {
      out.strictSingleProvider = false;
      continue;
    }
  }

  out.minTrust = Number.isFinite(out.minTrust) ? out.minTrust : 0;
  out.valueTier = Number.isFinite(out.valueTier) ? out.valueTier : 1;
  out.uiTier = Number.isFinite(out.uiTier) ? out.uiTier : 2;

  return out;
}

function cleanCoverageRows(minTrust = 0) {
  return (Array.isArray(LEAGUES_COVERAGE) ? LEAGUES_COVERAGE : [])
    .filter(row => row && typeof row === "object" && row.slug)
    .map(row => ({
      ...row,
      slug: String(row.slug || "").trim(),
      trust: Number(row.trust || 0),
      tier: Number(row.tier || 0),
      type: String(row.type || "").trim(),
      region: String(row.region || "").trim(),
      country: String(row.country || "").trim()
    }))
    .filter(row => row.slug && row.trust >= minTrust)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

function canonicalLeagueFile(dayKey, slug) {
  return resolveDataPath("canonical-fixtures", dayKey, `${slug}.json`);
}

function readCanonicalLeague(dayKey, slug) {
  const file = canonicalLeagueFile(dayKey, slug);
  const payload = readJson(file, null);
  const fixtures = Array.isArray(payload?.fixtures) ? payload.fixtures : [];

  return {
    exists: fs.existsSync(file),
    file,
    count: fixtures.length,
    sourceMeta: payload?.sourceMeta || null
  };
}

function readSnapshotLeagueCounts(dayKey) {
  const file = resolveDataPath("deploy-snapshots", dayKey, "fixtures.json");
  const payload = readJson(file, null);
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.fixtures)
      ? payload.fixtures
      : Array.isArray(payload?.rows)
        ? payload.rows
        : [];

  const counts = new Map();

  for (const row of rows) {
    const slug = String(
      row?.leagueSlug ||
      row?.league ||
      row?.competitionSlug ||
      row?.competition?.slug ||
      ""
    ).trim();

    if (!slug) continue;
    counts.set(slug, (counts.get(slug) || 0) + 1);
  }

  return {
    exists: fs.existsSync(file),
    file,
    totalRows: rows.length,
    counts
  };
}

function classifyCoverageBucket(row, options) {
  const type = String(row?.type || "").trim();
  const tier = Number(row?.tier || 0);
  const trust = Number(row?.trust || 0);
  const minTrust = Number(options?.minTrust || 0);
  const valueTier = Number(options?.valueTier || 1);
  const uiTier = Number(options?.uiTier || 2);

  if (type === "cup") {
    return "cup_seasonal";
  }

  if (type === "continental") {
    if (trust >= minTrust && tier <= valueTier + 1) return "must_have_for_value";
    return "must_have_for_ui";
  }

  if (type === "league" && tier <= valueTier) {
    return "must_have_for_value";
  }

  if (type === "league" && tier <= uiTier) {
    return "must_have_for_ui";
  }

  return "optional";
}

function classifyLeague({
  coverageRow,
  canonical,
  snapshotCount,
  providerPlan,
  strictSingleProvider,
  bucket
}) {
  const mode = String(providerPlan?.mode || "none");
  const providerCount = Array.isArray(providerPlan?.providers)
    ? providerPlan.providers.length
    : 0;

  const hasCanonicalFixtures = canonical.count > 0;
  const hasSnapshotFixtures = snapshotCount > 0;
  const hasAnyFixtures = hasCanonicalFixtures || hasSnapshotFixtures;

  const unsupported = mode === "none" || providerCount === 0;
  const singleProvider = mode === "single" || providerCount === 1;

  let status = "ok";
  const reasons = [];

  if (unsupported) {
    status = "unsupported";
    reasons.push("no_fixture_provider_for_required_league");
  } else if (singleProvider && strictSingleProvider) {
    status = "single_provider_risk";
    reasons.push("only_one_fixture_provider_available");
  }

  if (!canonical.exists && !hasSnapshotFixtures) {
    if (status === "ok") status = "unknown_coverage";
    reasons.push("no_canonical_file_and_no_snapshot_rows");
  } else if (canonical.exists && canonical.count === 0 && !hasSnapshotFixtures) {
    if (status === "ok") status = "empty_coverage";
    reasons.push("canonical_file_empty_and_no_snapshot_rows");
  }

  const productionRelevant =
    bucket === "must_have_for_value" ||
    bucket === "must_have_for_ui" ||
    hasAnyFixtures;

  const unsafeForValue =
    bucket === "must_have_for_value" &&
    status !== "ok";

  const unsafeForUi =
    (bucket === "must_have_for_value" || bucket === "must_have_for_ui") &&
    status !== "ok";

  const unsafeForFinalization =
    productionRelevant &&
    status !== "ok";

  return {
    slug: coverageRow.slug,
    type: coverageRow.type,
    tier: coverageRow.tier,
    trust: coverageRow.trust,
    region: coverageRow.region,
    country: coverageRow.country,
    bucket,
    providerMode: mode,
    providerCount,
    providers: Array.isArray(providerPlan?.providers)
      ? providerPlan.providers.map(p => p.id)
      : [],
    canonicalExists: canonical.exists,
    canonicalCount: canonical.count,
    snapshotCount,
    hasAnyFixtures,
    productionRelevant,
    unsafeForValue,
    unsafeForUi,
    unsafeForFinalization,
    status,
    reasons
  };
}

function countBy(rows, key) {
  const out = {};

  for (const row of rows) {
    const value = String(row?.[key] || "unknown");
    out[value] = (out[value] || 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(out).sort((a, b) => a[0].localeCompare(b[0]))
  );
}

function sample(rows, n = 25) {
  return rows.slice(0, n).map(row => ({
    slug: row.slug,
    bucket: row.bucket,
    status: row.status,
    providerMode: row.providerMode,
    providers: row.providers,
    canonicalCount: row.canonicalCount,
    snapshotCount: row.snapshotCount,
    reasons: row.reasons
  }));
}

export function auditFixtureCoverageContractDay(dayKey, options = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dayKey || ""))) {
    throw new Error(`invalid dayKey: ${dayKey}`);
  }

  const strictSingleProvider = options.strictSingleProvider !== false;
  const minTrust = Number.isFinite(Number(options.minTrust)) ? Number(options.minTrust) : 0;
  const valueTier = Number.isFinite(Number(options.valueTier)) ? Number(options.valueTier) : 1;
  const uiTier = Number.isFinite(Number(options.uiTier)) ? Number(options.uiTier) : 2;

  const coverageRows = cleanCoverageRows(minTrust);
  const snapshot = readSnapshotLeagueCounts(dayKey);

  const leagues = coverageRows.map(row => {
    const canonical = readCanonicalLeague(dayKey, row.slug);
    const providerPlan = getFixtureProviderPlan(row.slug);
    const snapshotCount = snapshot.counts.get(row.slug) || 0;
    const bucket = classifyCoverageBucket(row, { minTrust, valueTier, uiTier });

    return classifyLeague({
      coverageRow: row,
      canonical,
      snapshotCount,
      providerPlan,
      strictSingleProvider,
      bucket
    });
  });

  const unsupportedCoverageEntries = leagues.filter(row => row.status === "unsupported");
  const singleProviderRiskEntries = leagues.filter(row => row.status === "single_provider_risk");
  const missingCoverageEntries = leagues.filter(row =>
    row.reasons.includes("no_canonical_file_and_no_snapshot_rows")
  );
  const emptyCoverageEntries = leagues.filter(row => row.status === "empty_coverage");
  const unknownCoverageEntries = leagues.filter(row => row.status === "unknown_coverage");

  const unsafeForValueEntries = leagues.filter(row => row.unsafeForValue);
  const unsafeForUiEntries = leagues.filter(row => row.unsafeForUi);
  const unsafeForFinalizationEntries = leagues.filter(row => row.unsafeForFinalization);
  const unsafeCoverageEntries = leagues.filter(row => row.status !== "ok");

  const coverageSafeForValue = unsafeForValueEntries.length === 0;
  const coverageSafeForUi = unsafeForUiEntries.length === 0;
  const coverageSafeForFinalization = unsafeForFinalizationEntries.length === 0;

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    dayKey,
    strictSingleProvider,
    minTrust,
    valueTier,
    uiTier,
    counts: {
      expectedCoverageEntries: coverageRows.length,
      expectedByType: countBy(leagues, "type"),
      byBucket: countBy(leagues, "bucket"),
      byStatus: countBy(leagues, "status"),
      okCoverageEntries: leagues.filter(row => row.status === "ok").length,
      unsafeCoverageEntries: unsafeCoverageEntries.length,
      unsupportedCoverageEntries: unsupportedCoverageEntries.length,
      singleProviderRiskEntries: singleProviderRiskEntries.length,
      missingCoverageEntries: missingCoverageEntries.length,
      emptyCoverageEntries: emptyCoverageEntries.length,
      unknownCoverageEntries: unknownCoverageEntries.length,
      unsafeForValueEntries: unsafeForValueEntries.length,
      unsafeForUiEntries: unsafeForUiEntries.length,
      unsafeForFinalizationEntries: unsafeForFinalizationEntries.length,
      snapshotTotalRows: snapshot.totalRows
    },
    safety: {
      coverageSafeForValue,
      coverageSafeForUi,
      coverageSafeForFinalization,
      reason: coverageSafeForValue
        ? "value_required_coverage_satisfied"
        : "value_required_coverage_has_unsupported_missing_or_single_provider_entries"
    },
    policy: {
      buckets: {
        must_have_for_value: "league entries with tier <= valueTier, plus high-priority continental competition entries",
        must_have_for_ui: "league entries with tier <= uiTier but not value bucket",
        cup_seasonal: "cup entries; not assumed active every day until schedule evidence exists",
        optional: "lower-priority coverage entries"
      },
      singleProviderHandling: strictSingleProvider
        ? "single provider entries are unsafe until provider diversity or explicit exception exists"
        : "single provider entries are allowed for this audit run"
    },
    sources: {
      snapshot: {
        exists: snapshot.exists,
        file: snapshot.file
      },
      canonicalRoot: resolveDataPath("canonical-fixtures", dayKey)
    },
    unsafeForValueEntries,
    unsafeForUiEntries,
    unsafeForFinalizationEntries,
    unsupportedCoverageEntries,
    singleProviderRiskEntries,
    missingCoverageEntries,
    emptyCoverageEntries,
    unknownCoverageEntries,
    leagues
  };

  const outFile = resolveDataPath("fixture-coverage-contract-reports", `${dayKey}.json`);
  writeJson(outFile, report);

  return {
    ...report,
    reportFile: outFile
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  const args = parseArgs(process.argv.slice(2));

  if (!args.dayKey) {
    console.error(JSON.stringify({
      ok: false,
      reason: "missing_day",
      usage: "node engine-v1/jobs/audit-fixture-coverage-contract-day.js --date=YYYY-MM-DD [--min-trust=0.8] [--value-tier=1] [--ui-tier=2] [--allow-single-provider]"
    }, null, 2));
    process.exitCode = 1;
  } else {
    const result = auditFixtureCoverageContractDay(args.dayKey, args);

    console.log(JSON.stringify({
      ok: result.ok,
      dayKey: result.dayKey,
      strictSingleProvider: result.strictSingleProvider,
      minTrust: result.minTrust,
      valueTier: result.valueTier,
      uiTier: result.uiTier,
      counts: result.counts,
      safety: result.safety,
      reportFile: result.reportFile,
      sampleUnsafeForValue: sample(result.unsafeForValueEntries),
      sampleUnsafeForUi: sample(result.unsafeForUiEntries),
      sampleUnsupportedEntries: result.unsupportedCoverageEntries.slice(0, 25).map(x => x.slug),
      sampleSingleProviderRiskEntries: result.singleProviderRiskEntries.slice(0, 25).map(x => x.slug),
      sampleMissingCoverageEntries: result.missingCoverageEntries.slice(0, 25).map(x => x.slug)
    }, null, 2));

    if (!result.safety.coverageSafeForValue) {
      process.exitCode = 2;
    }
  }
}
