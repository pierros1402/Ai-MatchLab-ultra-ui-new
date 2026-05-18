import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { LEAGUES_COVERAGE } from "../../workers/_shared/leagues-coverage.js";
import { getFixtureProviderPlan } from "../adapters/registry.js";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    minTrust: 0,
    valueTier: 1,
    uiTier: 2,
    warnOnly: false
  };

  for (const arg of argv) {
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

    if (arg === "--warn-only" || arg === "--exit-zero") {
      out.warnOnly = true;
      continue;
    }
  }

  out.minTrust = Number.isFinite(out.minTrust) ? out.minTrust : 0;
  out.valueTier = Number.isFinite(out.valueTier) ? out.valueTier : 1;
  out.uiTier = Number.isFinite(out.uiTier) ? out.uiTier : 2;

  return out;
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
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

function classifyCoverageBucket(row, options) {
  const type = String(row?.type || "").trim();
  const tier = Number(row?.tier || 0);
  const trust = Number(row?.trust || 0);
  const minTrust = Number(options?.minTrust || 0);
  const valueTier = Number(options?.valueTier || 1);
  const uiTier = Number(options?.uiTier || 2);

  if (type === "cup") return "cup_seasonal";

  if (type === "continental") {
    if (trust >= minTrust && tier <= valueTier + 1) return "value_critical";
    return "ui_coverage";
  }

  if (type === "league" && tier <= valueTier) return "value_critical";
  if (type === "league" && tier <= uiTier) return "ui_coverage";

  return "optional";
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

function providerIds(plan) {
  return Array.isArray(plan?.providers)
    ? plan.providers.map(provider => provider.id).filter(Boolean)
    : [];
}

function providerFamilies(plan) {
  return Array.isArray(plan?.providers)
    ? [...new Set(plan.providers.map(provider => provider.family || "unknown").filter(Boolean))]
    : [];
}

function classifyCapability(row, plan) {
  const providers = providerIds(plan);
  const families = providerFamilies(plan);
  const mode = String(plan?.mode || "none");

  if (mode === "none" || providers.length === 0) {
    return {
      capabilityStatus: "unsupported",
      capabilityReason: "no_fixture_adapter_supports_entry"
    };
  }

  if (providers.length === 1) {
    return {
      capabilityStatus: "single_provider",
      capabilityReason: `only_${providers[0]}_supports_entry`
    };
  }

  if (families.length < 2) {
    return {
      capabilityStatus: "single_family_multi_provider",
      capabilityReason: "multiple_providers_but_same_source_family"
    };
  }

  return {
    capabilityStatus: "multi_provider",
    capabilityReason: "multiple_independent_fixture_providers_available"
  };
}

function shortEntry(row) {
  return {
    slug: row.slug,
    type: row.type,
    tier: row.tier,
    trust: row.trust,
    region: row.region,
    country: row.country,
    bucket: row.bucket,
    capabilityStatus: row.capabilityStatus,
    providerMode: row.providerMode,
    providers: row.providers,
    families: row.families,
    capabilityReason: row.capabilityReason
  };
}

export function auditFixtureProviderCapability(options = {}) {
  const minTrust = Number.isFinite(Number(options.minTrust)) ? Number(options.minTrust) : 0;
  const valueTier = Number.isFinite(Number(options.valueTier)) ? Number(options.valueTier) : 1;
  const uiTier = Number.isFinite(Number(options.uiTier)) ? Number(options.uiTier) : 2;

  const coverageRows = cleanCoverageRows(minTrust);

  const entries = coverageRows.map(row => {
    const bucket = classifyCoverageBucket(row, { minTrust, valueTier, uiTier });
    const plan = getFixtureProviderPlan(row.slug);
    const providers = providerIds(plan);
    const families = providerFamilies(plan);
    const capability = classifyCapability(row, plan);

    return {
      slug: row.slug,
      type: row.type,
      tier: row.tier,
      trust: row.trust,
      region: row.region,
      country: row.country,
      bucket,
      providerMode: String(plan?.mode || "none"),
      execution: String(plan?.execution || "skip"),
      providers,
      families,
      primary: plan?.primary || null,
      fallbacks: Array.isArray(plan?.fallbacks) ? plan.fallbacks : [],
      ...capability
    };
  });

  const unsupportedEntries = entries.filter(row => row.capabilityStatus === "unsupported");
  const singleProviderEntries = entries.filter(row => row.capabilityStatus === "single_provider");
  const singleFamilyMultiProviderEntries = entries.filter(row => row.capabilityStatus === "single_family_multi_provider");
  const multiProviderEntries = entries.filter(row => row.capabilityStatus === "multi_provider");

  const valueCriticalEntries = entries.filter(row => row.bucket === "value_critical");
  const uiCoverageEntries = entries.filter(row => row.bucket === "ui_coverage");

  const valueCriticalUnsupportedEntries = valueCriticalEntries.filter(row => row.capabilityStatus === "unsupported");
  const valueCriticalSingleProviderEntries = valueCriticalEntries.filter(row => row.capabilityStatus === "single_provider");
  const uiUnsupportedEntries = uiCoverageEntries.filter(row => row.capabilityStatus === "unsupported");
  const uiSingleProviderEntries = uiCoverageEntries.filter(row => row.capabilityStatus === "single_provider");

  const sourceFamilies = [...new Set(entries.flatMap(row => row.families))].sort();
  const providerIdsSeen = [...new Set(entries.flatMap(row => row.providers))].sort();

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    minTrust,
    valueTier,
    uiTier,
    counts: {
      coverageEntries: entries.length,
      byType: countBy(entries, "type"),
      byBucket: countBy(entries, "bucket"),
      byCapabilityStatus: countBy(entries, "capabilityStatus"),
      byProviderMode: countBy(entries, "providerMode"),
      unsupportedEntries: unsupportedEntries.length,
      singleProviderEntries: singleProviderEntries.length,
      singleFamilyMultiProviderEntries: singleFamilyMultiProviderEntries.length,
      multiProviderEntries: multiProviderEntries.length,
      valueCriticalEntries: valueCriticalEntries.length,
      valueCriticalUnsupportedEntries: valueCriticalUnsupportedEntries.length,
      valueCriticalSingleProviderEntries: valueCriticalSingleProviderEntries.length,
      uiCoverageEntries: uiCoverageEntries.length,
      uiUnsupportedEntries: uiUnsupportedEntries.length,
      uiSingleProviderEntries: uiSingleProviderEntries.length
    },
    safety: {
      providerCapabilitySafeForAutonomousValue:
        valueCriticalUnsupportedEntries.length === 0 &&
        valueCriticalSingleProviderEntries.length === 0,
      providerCapabilitySafeForAutonomousUi:
        uiUnsupportedEntries.length === 0 &&
        uiSingleProviderEntries.length === 0,
      reason:
        "fixture ingest is autonomous only when critical entries have independent multi-provider or validated official-source capability"
    },
    providerInventory: {
      providers: providerIdsSeen,
      families: sourceFamilies
    },
    debt: {
      valueCriticalUnsupportedEntries: valueCriticalUnsupportedEntries.map(shortEntry),
      valueCriticalSingleProviderEntries: valueCriticalSingleProviderEntries.map(shortEntry),
      uiUnsupportedEntries: uiUnsupportedEntries.map(shortEntry),
      uiSingleProviderEntries: uiSingleProviderEntries.map(shortEntry)
    },
    entries
  };

  const outFile = resolveDataPath("fixture-provider-capability-reports", `mintrust-${String(minTrust).replace(".", "_")}.json`);
  writeJson(outFile, report);

  return {
    ...report,
    reportFile: outFile
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  const args = parseArgs(process.argv.slice(2));
  const result = auditFixtureProviderCapability(args);

  console.log(JSON.stringify({
    ok: result.ok,
    minTrust: result.minTrust,
    valueTier: result.valueTier,
    uiTier: result.uiTier,
    warnOnly: args.warnOnly,
    counts: result.counts,
    safety: result.safety,
    providerInventory: result.providerInventory,
    reportFile: result.reportFile,
    sampleValueCriticalUnsupportedEntries: result.debt.valueCriticalUnsupportedEntries.slice(0, 25).map(x => x.slug),
    sampleValueCriticalSingleProviderEntries: result.debt.valueCriticalSingleProviderEntries.slice(0, 25).map(x => x.slug),
    sampleUiUnsupportedEntries: result.debt.uiUnsupportedEntries.slice(0, 25).map(x => x.slug),
    sampleUiSingleProviderEntries: result.debt.uiSingleProviderEntries.slice(0, 25).map(x => x.slug)
  }, null, 2));

  if (!args.warnOnly && !result.safety.providerCapabilitySafeForAutonomousValue) {
    process.exitCode = 2;
  }
}
