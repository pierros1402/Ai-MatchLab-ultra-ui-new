#!/usr/bin/env node
"use strict";

/**
 * Read-only Fixture Acquisition V2 readiness/workset builder.
 *
 * Purpose:
 * - Compare the declared league coverage contract with the canonical fixture store for one day.
 * - Mark leagues as unsafe for value when fixtures are missing, supplemental-only, or unsupported by
 *   a verified fixture acquisition provider.
 * - Produce a concrete workset for Fixture Acquisition V2 without fetching sources and without
 *   writing production fixture/value/details/final-result data.
 */

import fs from "fs";
import path from "path";

import { summarizeFixtureProviderCapability } from "../adapters/fixture-provider-capabilities.js";

function parseArgs(argv) {
  const args = {
    date: null,
    output: null,
    selfTest: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--self-test") {
      args.selfTest = true;
    } else if (a === "--date") {
      args.date = argv[++i];
    } else if (a === "--output") {
      args.output = argv[++i];
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }

  return args;
}

function todayAthensDate() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return fmt.format(new Date());
}

function assertDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
}

function readJsonIfExists(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDirForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean).map(String))].sort();
}

function extractDeclaredLeagueSlugsFromRegistry() {
  const registryPath = path.join("workers", "_shared", "leagues-registry.js");
  if (!fs.existsSync(registryPath)) {
    return {
      registryPath,
      declaredLeagueSlugs: [],
      registryReadError: "workers/_shared/leagues-registry.js not found"
    };
  }

  const text = fs.readFileSync(registryPath, "utf8");
  const slugs = new Set();

  const patterns = [
    /\bslug\s*:\s*["']([^"']+)["']/g,
    /\bleagueSlug\s*:\s*["']([^"']+)["']/g,
    /\bid\s*:\s*["']([a-z0-9]+(?:[._-][a-z0-9]+)+)["']/g,
    /["']([a-z]{2,}\.[a-z0-9_]+|[a-z]{2,}\.\d+|uefa\.[a-z0-9_.]+|conmebol\.[a-z0-9_.]+|afc\.[a-z0-9_.]+|caf\.[a-z0-9_.]+)["']\s*:/g
  ];

  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const slug = String(m[1] || "").trim();
      if (slug && !slug.includes("example")) slugs.add(slug);
    }
  }

  return {
    registryPath,
    declaredLeagueSlugs: [...slugs].sort(),
    registryReadError: null
  };
}

function bucketForLeague(slug) {
  const s = String(slug || "");

  if (/^eng\.[1-5]$/.test(s)) return "must_have_for_value";
  if (/^ger\.[1-3]$/.test(s)) return "must_have_for_value";
  if (/^[a-z]{3}\.[12]$/.test(s)) return "must_have_for_value";
  if (/^(uefa|conmebol|afc|caf)\./.test(s)) return "must_have_for_value";
  if (/\.(cup|fa|league_cup|dfb_pokal|copa_del_rey|coppa_italia|taca|super_cup|trophy|challenge|tennents)$/.test(s)) {
    return "must_have_for_ui";
  }

  return "declared";
}

function readCanonicalDay(dayKey) {
  const dir = path.join("data", "canonical-fixtures", dayKey);
  const byLeague = new Map();

  if (!fs.existsSync(dir)) {
    return {
      dir,
      files: [],
      byLeague
    };
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();

  for (const file of files) {
    const fullPath = path.join(dir, file);
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    } catch (err) {
      const slug = file.replace(/\.json$/i, "");
      byLeague.set(slug, {
        leagueSlug: slug,
        file: fullPath,
        rows: [],
        parseError: err.message
      });
      continue;
    }

    const rows = Array.isArray(parsed)
      ? parsed
      : (parsed.fixtures || parsed.rows || parsed.matches || parsed.items || []);

    const leagueSlug = String(parsed.leagueSlug || file.replace(/\.json$/i, ""));
    byLeague.set(leagueSlug, {
      leagueSlug,
      leagueName: parsed.leagueName || null,
      file: fullPath,
      sourceMeta: parsed.sourceMeta || null,
      rows: Array.isArray(rows) ? rows : [],
      parseError: null
    });
  }

  return { dir, files, byLeague };
}

function detectSources(entry) {
  const sources = new Set();

  for (const row of entry.rows || []) {
    const source = row && (row.source || row.provider || row.sourceProvider || row.sourceName);
    if (source) sources.add(String(source).toLowerCase());
  }

  const meta = entry.sourceMeta || {};
  for (const key of ["source", "provider", "primaryProvider", "providerId"]) {
    if (meta && meta[key]) sources.add(String(meta[key]).toLowerCase());
  }

  return [...sources].sort();
}

function classifyLeague({ slug, canonicalEntry, providerCapabilities }) {
  const bucket = bucketForLeague(slug);
  const fixtureRows = canonicalEntry?.rows?.length || 0;
  const sources = canonicalEntry ? detectSources(canonicalEntry) : [];
  const hasCanonicalFixtures = fixtureRows > 0;
  const hasSupplementalScoreboardSource = sources.some((s) => s.includes("espn"));
  const hasNonSupplementalCanonicalSource = sources.some((s) => s && !s.includes("espn"));

  // Backward-compatible aliases for existing report fields while language moves
  // toward provider-agnostic verified fixture acquisition.
  const hasEspn = hasSupplementalScoreboardSource;
  const hasNonEspnCanonicalSource = hasNonSupplementalCanonicalSource;
  const configuredProviders = providerCapabilities[slug] || [];
  const capabilitySummary = summarizeFixtureProviderCapability(slug, configuredProviders);
  const hasValueReadyVerifiedProvider = capabilitySummary.hasValueReadyVerifiedProvider === true || capabilitySummary.hasValueReadyNonEspnProvider === true;

  let readiness = "ready";
  let priority = "none";
  const reasons = [];

  if (!hasCanonicalFixtures) {
    readiness = "blocked";
    priority = bucket === "must_have_for_value" ? "p0" : "p1";
    reasons.push("missing_canonical_fixtures");
  }

  if (hasCanonicalFixtures && hasSupplementalScoreboardSource && !hasNonSupplementalCanonicalSource) {
    readiness = "unsafe";
    priority = bucket === "must_have_for_value" ? "p0" : "p1";
    reasons.push("supplemental_only_canonical_fixtures");
  }

  if (bucket === "must_have_for_value" && !hasValueReadyVerifiedProvider) {
    if (readiness === "ready") readiness = "unsafe";
    if (priority === "none") priority = "p0";
    reasons.push("missing_verified_fixture_provider_capability");
  }

  return {
    leagueSlug: slug,
    bucket,
    readiness,
    priority,
    reasons,
    canonical: {
      hasFixtures: hasCanonicalFixtures,
      fixtureRows,
      file: canonicalEntry?.file || null,
      sources,
      leagueName: canonicalEntry?.leagueName || null,
      parseError: canonicalEntry?.parseError || null
    },
    providerCapabilities: {
      configuredProviders,
      providerIds: capabilitySummary.providerIds,
      providers: capabilitySummary.providers,
      hasSupplementalScoreboardCapability: capabilitySummary.hasSupplementalScoreboardCapability === true || capabilitySummary.hasEspnCapability === true,
      hasEspnCapability: capabilitySummary.hasEspnCapability,
      hasValueReadyVerifiedProvider,
      valueReadyVerifiedProviderIds: capabilitySummary.valueReadyVerifiedProviderIds || capabilitySummary.valueReadyNonEspnProviderIds || [],
      supplementalProviderIds: capabilitySummary.supplementalProviderIds,
      diagnosticOnlyProviderIds: capabilitySummary.diagnosticOnlyProviderIds
    }
  };
}

function readProviderCapabilities() {
  const candidates = [
    path.join("data", "fixture-provider-capabilities.json"),
    path.join("data", "fixture-acquisition", "provider-capabilities.json"),
    path.join("data", "football-truth", "_diagnostics", "fixture-provider-capabilities.json")
  ];

  for (const p of candidates) {
    const parsed = readJsonIfExists(p);
    if (!parsed) continue;

    const out = {};
    const rows = Array.isArray(parsed) ? parsed : (parsed.rows || parsed.leagues || parsed.capabilities || []);
    if (Array.isArray(rows)) {
      for (const row of rows) {
        const slug = row.leagueSlug || row.slug || row.id;
        if (!slug) continue;
        const providers = row.providers || row.providerIds || row.sources || [];
        out[String(slug)] = Array.isArray(providers) ? providers.map(String) : [String(providers)];
      }
    } else if (parsed && typeof parsed === "object") {
      for (const [slug, value] of Object.entries(parsed)) {
        const providers = Array.isArray(value) ? value : (value.providers || value.sources || []);
        out[String(slug)] = Array.isArray(providers) ? providers.map(String) : [String(providers)];
      }
    }

    return { path: p, providerCapabilities: out };
  }

  return { path: null, providerCapabilities: {} };
}

function buildReport(dayKey) {
  assertDate(dayKey, "date");

  const declared = extractDeclaredLeagueSlugsFromRegistry();
  const canonical = readCanonicalDay(dayKey);
  const providerInfo = readProviderCapabilities();

  const allLeagueSlugs = uniqueSorted([
    ...declared.declaredLeagueSlugs,
    ...canonical.byLeague.keys()
  ]);

  const rows = allLeagueSlugs.map((slug) => classifyLeague({
    slug,
    canonicalEntry: canonical.byLeague.get(slug) || null,
    providerCapabilities: providerInfo.providerCapabilities
  }));

  const actionRows = rows.filter((r) => r.readiness !== "ready");

  const summary = {
    declaredLeagueCount: declared.declaredLeagueSlugs.length,
    canonicalLeagueCount: canonical.byLeague.size,
    canonicalFixtureRows: rows.reduce((sum, r) => sum + (r.canonical.fixtureRows || 0), 0),
    rows: rows.length,
    readyRows: rows.filter((r) => r.readiness === "ready").length,
    unsafeRows: rows.filter((r) => r.readiness === "unsafe").length,
    blockedRows: rows.filter((r) => r.readiness === "blocked").length,
    p0Rows: rows.filter((r) => r.priority === "p0").length,
    p1Rows: rows.filter((r) => r.priority === "p1").length,
    missingCanonicalFixtures: rows.filter((r) => r.reasons.includes("missing_canonical_fixtures")).length,
    supplementalOnlyCanonicalFixtures: rows.filter((r) => r.reasons.includes("supplemental_only_canonical_fixtures")).length,
    missingVerifiedProviderCapability: rows.filter((r) => r.reasons.includes("missing_verified_fixture_provider_capability")).length,
    missingValueReadyVerifiedProviderCapability: rows.filter((r) => r.reasons.includes("missing_verified_fixture_provider_capability")).length
  };

  return {
    ok: true,
    schema: "ai-matchlab.fixture-acquisition-v2-readiness.v1",
    stage: "fixture_acquisition_v2_readiness_ready",
    dayKey,
    generatedAt: new Date().toISOString(),
    inputs: {
      registryPath: declared.registryPath,
      registryReadError: declared.registryReadError,
      canonicalFixturesDir: canonical.dir,
      canonicalFixtureFiles: canonical.files.length,
      providerCapabilitiesPath: providerInfo.path,
      providerCapabilityPolicy: "fixture-provider-capabilities.js"
    },
    summary,
    actionRows,
    rows,
    guarantees: {
      canonicalWrites: 0,
      productionWrite: false,
      sourceFetch: false,
      fixtureWrites: false,
      valueWrites: false,
      detailsWrites: false,
      finalResultWrites: false,
      supplementalOnlyIsUnsafeForValue: true,
      valueRequiresVerifiedFixtureProviderCapability: true,
      marketInputIsNotRequired: true
    }
  };
}

function runSelfTest() {
  const tmpRoot = path.join("data", "football-truth", "_diagnostics", "fixture-acquisition-v2-readiness", "self-test");
  fs.mkdirSync(tmpRoot, { recursive: true });

  const report = buildReport("2099-01-01");
  return {
    ok: true,
    selfTest: "build-fixture-acquisition-v2-readiness",
    stage: "fixture_acquisition_v2_readiness_self_test_ok",
    declaredLeagueCount: report.summary.declaredLeagueCount,
    canonicalLeagueCount: report.summary.canonicalLeagueCount,
    canonicalWrites: report.guarantees.canonicalWrites,
    productionWrite: report.guarantees.productionWrite,
    sourceFetch: report.guarantees.sourceFetch
  };
}

function main() {
  const args = parseArgs(process.argv);

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const dayKey = args.date || todayAthensDate();
  const output = args.output || path.join(
    "data",
    "football-truth",
    "_diagnostics",
    "fixture-acquisition-v2-readiness",
    `${dayKey}.fixture-acquisition-v2-readiness.json`
  );

  const report = buildReport(dayKey);
  report.output = output;

  ensureDirForFile(output);
  fs.writeFileSync(output, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({
    ok: report.ok,
    stage: report.stage,
    output,
    dayKey,
    summary: report.summary,
    canonicalWrites: report.guarantees.canonicalWrites,
    productionWrite: report.guarantees.productionWrite,
    sourceFetch: report.guarantees.sourceFetch
  }, null, 2));
}

try {
  main();
} catch (err) {
  console.error(JSON.stringify({
    ok: false,
    stage: "fixture_acquisition_v2_readiness_failed",
    error: err.message,
    stack: err.stack
  }, null, 2));
  process.exitCode = 1;
}