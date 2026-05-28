#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { LEAGUES_COVERAGE } from "../../workers/_shared/leagues-coverage.js";
import { leagueName } from "../../workers/_shared/leagues-registry.js";
import { getFixtureProviderPlan } from "../adapters/registry.js";
import { summarizeFixtureProviderCapability } from "../adapters/fixture-provider-capabilities.js";

const __filename = fileURLToPath(import.meta.url);

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    date: "",
    output: "",
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if ((arg === "--date" || arg === "--day") && argv[i + 1]) {
      args.date = String(argv[++i] || "").trim();
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      args.output = String(argv[++i] || "").trim();
      continue;
    }

    throw new Error(`unknown or incomplete argument: ${arg}`);
  }

  if (!args.selfTest && !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error("--date YYYY-MM-DD is required");
  }

  if (!args.output && args.date) {
    args.output = path.join(
      "data",
      "football-truth",
      "_diagnostics",
      "fixture-acquisition-stability",
      `${args.date}.active-league-acquisition-plan.json`
    );
  }

  return args;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function clean(value) {
  return String(value || "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeCoverageRows(rows = LEAGUES_COVERAGE) {
  return asArray(rows)
    .map((row, index) => ({
      sourceIndex: index,
      slug: clean(row?.slug || row?.leagueSlug || row?.id),
      name: clean(row?.name || row?.leagueName || row?.label),
      country: clean(row?.country || row?.countryCode || row?.region),
      region: clean(row?.region),
      type: clean(row?.type || "league"),
      tier: Number.isFinite(Number(row?.tier)) ? Number(row.tier) : null,
      trust: Number.isFinite(Number(row?.trust)) ? Number(row.trust) : null,
      raw: row
    }))
    .filter((row) => row.slug);
}

function providerIdsFromPlan(plan) {
  const ids = [];

  if (Array.isArray(plan?.providers)) {
    ids.push(...plan.providers.map((row) => clean(row?.id || row?.providerId || row)));
  }

  if (plan?.primary) {
    ids.push(clean(plan.primary.id || plan.primary.providerId || plan.primary));
  }

  if (Array.isArray(plan?.fallbacks)) {
    ids.push(...plan.fallbacks.map((row) => clean(row?.id || row?.providerId || row)));
  }

  return [...new Set(ids.filter(Boolean))];
}

function classifyRoute({ plan, capability }) {
  const providerIds = providerIdsFromPlan(plan);
  const hasEspn = providerIds.includes("espn") || capability.hasEspnCapability === true;
  const hasVerifiedNonEspn =
    capability.hasVerifiedFixtureProviderCapability === true ||
    capability.hasValueReadyVerifiedProvider === true ||
    capability.hasValueReadyNonEspnProvider === true;

  if (hasVerifiedNonEspn) {
    return {
      route: "verified_non_espn_provider_available",
      espnRole: hasEspn ? "supplemental_crosscheck_only" : "not_required",
      requiresAutonomousSearch: false,
      requiresSecondSourceConfirmation: false,
      valueReadyCandidate: true,
      reason: "league_has_explicit_value_ready_non_espn_fixture_provider"
    };
  }

  if (hasEspn) {
    return {
      route: "autonomous_search_with_supplemental_crosscheck",
      espnRole: "supplemental_crosscheck_only",
      requiresAutonomousSearch: true,
      requiresSecondSourceConfirmation: true,
      valueReadyCandidate: false,
      reason: "espn_is_supplemental_only_and_cannot_define_coverage_or_value_truth"
    };
  }

  return {
    route: "autonomous_search_required",
    espnRole: "not_available",
    requiresAutonomousSearch: true,
    requiresSecondSourceConfirmation: true,
    valueReadyCandidate: false,
    reason: "no_structured_verified_provider_configured_for_active_league"
  };
}

function buildLeaguePlanRow(row, date) {
  const slug = row.slug;
  const plan = getFixtureProviderPlan(slug);
  const capability = summarizeFixtureProviderCapability(slug, providerIdsFromPlan(plan));
  const route = classifyRoute({ plan, capability });

  return {
    leagueSlug: slug,
    leagueName: row.name || leagueName(slug),
    country: row.country || null,
    region: row.region || null,
    type: row.type || "league",
    tier: row.tier,
    trust: row.trust,
    targetDate: date,
    acquisitionRoute: route.route,
    espnRole: route.espnRole,
    providerMode: clean(plan?.mode || "none"),
    providerExecution:
      route.route === "autonomous_search_required" ||
      route.route === "autonomous_search_with_supplemental_crosscheck"
        ? "autonomous_acquisition_required"
        : clean(plan?.execution || "verified_provider_available"),
    providerIds: capability.providerIds,
    supplementalProviderIds: capability.supplementalProviderIds,
    valueReadyVerifiedProviderIds: capability.valueReadyVerifiedProviderIds,
    hasSupplementalScoreboardCapability: capability.hasSupplementalScoreboardCapability === true,
    hasVerifiedFixtureProviderCapability: capability.hasVerifiedFixtureProviderCapability === true,
    requiresAutonomousSearch: route.requiresAutonomousSearch,
    requiresSecondSourceConfirmation: route.requiresSecondSourceConfirmation,
    valueReadyCandidate: route.valueReadyCandidate,
    reason: route.reason,
    nextStage: route.requiresAutonomousSearch
      ? "build_fixture_league_date_autonomous_source_discovery_workset"
      : "verified_provider_fetch_or_review_gate",
    productionWrite: false,
    canonicalWrites: 0,
    dryRun: true
  };
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = clean(row?.[key] || "unknown");
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function buildReport({ date, coverageRows = LEAGUES_COVERAGE } = {}) {
  const normalizedCoverageRows = normalizeCoverageRows(coverageRows);
  const invalidLeagueSeedRows = asArray(coverageRows)
    .map((row, index) => ({
      index,
      type: row === null ? "null" : Array.isArray(row) ? "array" : typeof row,
      value: row
    }))
    .filter((entry) => !clean(entry.value?.slug || entry.value?.leagueSlug || entry.value?.id));

  const planRows = normalizedCoverageRows.map((row) => buildLeaguePlanRow(row, date));

  const autonomousRows = planRows.filter((row) => row.requiresAutonomousSearch);
  const supplementalOnlyRows = planRows.filter(
    (row) => row.espnRole === "supplemental_crosscheck_only" && row.valueReadyCandidate !== true
  );
  const verifiedProviderRows = planRows.filter((row) => row.valueReadyCandidate === true);

  return {
    ok: true,
    job: "build-active-league-acquisition-plan-file",
    mode: "read_only_provider_agnostic_active_league_acquisition_plan",
    generatedAt: new Date().toISOString(),
    targetDate: date,
    policy: {
      coverageAuthority: "LEAGUES_COVERAGE",
      providerPolicy:
        "Provider output can support verification; it cannot define coverage. Coverage is defined by the active league map.",
      espnPolicy:
        "ESPN is supplemental verification/crosscheck evidence only, not an acquisition dependency and not value-ready authority.",
      noAdapterPolicy:
        "No structured adapter must become autonomous acquisition required, not skip.",
      valuePolicy:
        "Supplemental-only evidence is not value-ready without independent verified non-ESPN or official-source confirmation."
    },
    summary: {
      totalActiveLeagues: planRows.length,
      invalidLeagueSeedCount: invalidLeagueSeedRows.length,
      verifiedNonEspnProviderAvailableLeagues: verifiedProviderRows.length,
      supplementalOnlyLeagues: supplementalOnlyRows.length,
      autonomousRequiredLeagues: autonomousRows.length,
      requiresSecondSourceConfirmationLeagues: planRows.filter((row) => row.requiresSecondSourceConfirmation).length,
      valueReadyCandidateLeagues: verifiedProviderRows.length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    byAcquisitionRoute: countBy(planRows, "acquisitionRoute"),
    byEspnRole: countBy(planRows, "espnRole"),
    byProviderExecution: countBy(planRows, "providerExecution"),
    guarantees: {
      readOnly: true,
      sourceFetch: false,
      noFetch: true,
      noCanonicalPromotion: true,
      fixtureWrites: false,
      historyWrites: false,
      valueWrites: false,
      detailsWrites: false,
      finalTruthWrites: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    nextStages: {
      autonomousDiscoveryInputRows: autonomousRows.map((row) => ({
        leagueSlug: row.leagueSlug,
        leagueName: row.leagueName,
        country: row.country,
        region: row.region,
        type: row.type,
        tier: row.tier,
        trust: row.trust,
        targetDate: row.targetDate,
        dayKey: row.targetDate,
        name: row.leagueName,
        acquisitionRoute: row.acquisitionRoute,
        espnRole: row.espnRole,
        previousAnalystStatus: row.reason
      })),
      verifiedProviderRows
    },
    invalidLeagueSeedRows,
    planRows
  };
}

function runSelfTest() {
  const sampleCoverageRows = [
    { slug: "eng.1", name: "Premier League", country: "england", region: "europe", tier: 1, trust: 1 },
    { slug: "ger.3", name: "3. Liga", country: "germany", region: "europe", tier: 2, trust: 0.82 },
    { slug: "zzz.test", name: "Synthetic Test League", country: "testland", region: "test", tier: 3, trust: 0.5 }
  ];

  const report = buildReport({
    date: "2026-05-28",
    coverageRows: sampleCoverageRows
  });

  if (report.summary.totalActiveLeagues !== 3) {
    throw new Error("expected 3 active leagues");
  }

  const eng = report.planRows.find((row) => row.leagueSlug === "eng.1");
  const ger3 = report.planRows.find((row) => row.leagueSlug === "ger.3");
  const synthetic = report.planRows.find((row) => row.leagueSlug === "zzz.test");

  if (!eng || eng.espnRole !== "supplemental_crosscheck_only") {
    throw new Error("expected ESPN-supported league to be supplemental crosscheck only");
  }

  if (!eng.requiresAutonomousSearch || !eng.requiresSecondSourceConfirmation) {
    throw new Error("ESPN-only league must still require autonomous/second-source confirmation");
  }

  if (!ger3 || ger3.acquisitionRoute !== "autonomous_search_required") {
    throw new Error("no-adapter known league must become autonomous_search_required");
  }

  if (!synthetic || synthetic.providerExecution !== "autonomous_acquisition_required") {
    throw new Error("unknown/no-adapter league must not become skip");
  }

  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("read-only guarantees failed");
  }

  return {
    ok: true,
    selfTest: "build-active-league-acquisition-plan-file",
    summary: report.summary,
    byAcquisitionRoute: report.byAcquisitionRoute,
    byEspnRole: report.byEspnRole,
    guarantees: report.guarantees
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const report = buildReport({ date: args.date });
  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    byAcquisitionRoute: report.byAcquisitionRoute,
    byEspnRole: report.byEspnRole,
    guarantees: report.guarantees
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main();
}

export {
  buildReport,
  classifyRoute,
  normalizeCoverageRows
};