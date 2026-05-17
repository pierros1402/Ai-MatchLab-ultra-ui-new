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
    minTrust: 0
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

    if (arg === "--allow-single-provider") {
      out.strictSingleProvider = false;
      continue;
    }
  }

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

function classifyLeague({ coverageRow, canonical, snapshotCount, providerPlan, strictSingleProvider }) {
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

  return {
    slug: coverageRow.slug,
    type: coverageRow.type,
    tier: coverageRow.tier,
    trust: coverageRow.trust,
    region: coverageRow.region,
    country: coverageRow.country,
    providerMode: mode,
    providerCount,
    providers: Array.isArray(providerPlan?.providers)
      ? providerPlan.providers.map(p => p.id)
      : [],
    canonicalExists: canonical.exists,
    canonicalCount: canonical.count,
    snapshotCount,
    hasAnyFixtures,
    status,
    reasons
  };
}

export function auditFixtureCoverageContractDay(dayKey, options = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dayKey || ""))) {
    throw new Error(`invalid dayKey: ${dayKey}`);
  }

  const strictSingleProvider = options.strictSingleProvider !== false;
  const minTrust = Number.isFinite(Number(options.minTrust)) ? Number(options.minTrust) : 0;

  const coverageRows = cleanCoverageRows(minTrust);
  const snapshot = readSnapshotLeagueCounts(dayKey);

  const leagues = coverageRows.map(row => {
    const canonical = readCanonicalLeague(dayKey, row.slug);
    const providerPlan = getFixtureProviderPlan(row.slug);
    const snapshotCount = snapshot.counts.get(row.slug) || 0;

    return classifyLeague({
      coverageRow: row,
      canonical,
      snapshotCount,
      providerPlan,
      strictSingleProvider
    });
  });

  const missingRequiredLeagues = leagues.filter(row =>
    row.reasons.includes("no_canonical_file_and_no_snapshot_rows")
  );

  const unsupportedLeagues = leagues.filter(row => row.status === "unsupported");
  const singleProviderRiskLeagues = leagues.filter(row => row.status === "single_provider_risk");
  const emptyRequiredLeagues = leagues.filter(row => row.status === "empty_coverage");
  const unknownCoverageLeagues = leagues.filter(row => row.status === "unknown_coverage");

  const unsafeLeagues = leagues.filter(row => row.status !== "ok");

  const coverageSafeForValue = unsafeLeagues.length === 0;
  const coverageSafeForFinalization = unsafeLeagues.length === 0;

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    dayKey,
    strictSingleProvider,
    minTrust,
    counts: {
      expectedRequiredLeagues: coverageRows.length,
      okLeagues: leagues.filter(row => row.status === "ok").length,
      unsafeLeagues: unsafeLeagues.length,
      unsupportedLeagues: unsupportedLeagues.length,
      singleProviderRiskLeagues: singleProviderRiskLeagues.length,
      missingRequiredLeagues: missingRequiredLeagues.length,
      emptyRequiredLeagues: emptyRequiredLeagues.length,
      unknownCoverageLeagues: unknownCoverageLeagues.length,
      snapshotTotalRows: snapshot.totalRows
    },
    safety: {
      coverageSafeForValue,
      coverageSafeForFinalization,
      reason: coverageSafeForValue
        ? "coverage_contract_satisfied"
        : "coverage_contract_has_unsupported_missing_or_single_provider_leagues"
    },
    sources: {
      snapshot: {
        exists: snapshot.exists,
        file: snapshot.file
      },
      canonicalRoot: resolveDataPath("canonical-fixtures", dayKey)
    },
    unsupportedLeagues,
    singleProviderRiskLeagues,
    missingRequiredLeagues,
    emptyRequiredLeagues,
    unknownCoverageLeagues,
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
      usage: "node engine-v1/jobs/audit-fixture-coverage-contract-day.js --date=YYYY-MM-DD [--min-trust=0.8] [--allow-single-provider]"
    }, null, 2));
    process.exitCode = 1;
  } else {
    const result = auditFixtureCoverageContractDay(args.dayKey, args);

    console.log(JSON.stringify({
      ok: result.ok,
      dayKey: result.dayKey,
      strictSingleProvider: result.strictSingleProvider,
      minTrust: result.minTrust,
      counts: result.counts,
      safety: result.safety,
      reportFile: result.reportFile,
      sampleUnsupportedLeagues: result.unsupportedLeagues.slice(0, 25).map(x => x.slug),
      sampleSingleProviderRiskLeagues: result.singleProviderRiskLeagues.slice(0, 25).map(x => x.slug),
      sampleMissingRequiredLeagues: result.missingRequiredLeagues.slice(0, 25).map(x => x.slug)
    }, null, 2));

    if (!result.safety.coverageSafeForValue) {
      process.exitCode = 2;
    }
  }
}
