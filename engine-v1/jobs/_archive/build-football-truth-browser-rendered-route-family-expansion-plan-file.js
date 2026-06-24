#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = path.join(ROOT, "data", "football-truth", "_diagnostics", `browser-rendered-route-family-expansion-plan-${DATE}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.isFile()) out.push(p);
  }
  return out;
}

function readJsonSafe(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function rel(p) {
  return path.relative(ROOT, p).replaceAll("\\", "/");
}

function uniq(xs) {
  return [...new Set(xs.filter(Boolean))];
}

const files = walk(path.join(ROOT, "data", "football-truth")).filter((p) => p.endsWith(".json"));
const slugSet = new Set();
const slugRows = [];

for (const file of files) {
  const j = readJsonSafe(file);
  if (!j) continue;
  const text = JSON.stringify(j);
  const matches = text.match(/\b[a-z]{3}\.(?:\d+|cup)\b/g) || [];
  for (const slug of matches) {
    slugSet.add(slug);
    slugRows.push({ slug, evidenceFile: rel(file) });
  }
}

const knownVerifiedFamilies = [
  {
    familyId: "laliga_official_rendered",
    routeType: "official_browser_rendered_text",
    sourceHost: "laliga.com",
    currentVerifiedSlugs: ["esp.1", "esp.2"],
    currentVerifiedRows: 42,
    routeTemplate: "https://www.laliga.com/en-GB/{competitionPath}/standing",
    expansionMode: "provider_family_complete_for_current_known_spanish_top_two",
    nextAction: "keep_family_as_verified_template_and_only_expand_if_more_laliga_slugs_exist"
  },
  {
    familyId: "bundesliga_official_rendered",
    routeType: "official_browser_rendered_text",
    sourceHost: "bundesliga.com",
    currentVerifiedSlugs: ["ger.1", "ger.2"],
    currentVerifiedRows: 36,
    routeTemplate: "https://www.bundesliga.com/en/{competitionPath}/table",
    expansionMode: "provider_family_partial",
    knownGapSlugs: ["ger.3"],
    nextAction: "discover_or_configure_separate_3_liga_official_family_not_assume_bundesliga_com"
  },
  {
    familyId: "hnl_official_rendered",
    routeType: "official_browser_rendered_table",
    sourceHost: "hnl.hr",
    currentVerifiedSlugs: ["cro.1"],
    currentVerifiedRows: 10,
    routeTemplate: "https://hnl.hr/{competitionPath}/ljestvica/",
    expansionMode: "national_official_family_partial",
    knownGapSlugs: ["cro.2"],
    nextAction: "discover_if_same_hnl_family_has_second_tier_or mark separate federation route"
  }
];

const explicitNearTermRouteCandidates = [
  {
    slug: "ger.3",
    country: "Germany",
    tier: 3,
    reason: "User explicitly requires third category; not covered by bundesliga.com family result.",
    candidateFamilyNeeded: "dfb_or_3_liga_official_rendered",
    status: "needs_official_route_discovery",
    mustNotAssumeExistingFamily: true
  },
  {
    slug: "eng.1",
    country: "England",
    tier: 1,
    reason: "High-value league; likely official/provider route family can cover several English tiers.",
    candidateFamilyNeeded: "premierleague_or_efl_official_rendered_or_api",
    status: "needs_family_route_discovery",
    mustNotProbeAsSingleton: true
  },
  {
    slug: "fra.1",
    country: "France",
    tier: 1,
    reason: "High-value league; likely LFP family may cover top two tiers.",
    candidateFamilyNeeded: "lfp_official_rendered_or_api",
    status: "needs_family_route_discovery",
    mustNotProbeAsSingleton: true
  },
  {
    slug: "ita.1",
    country: "Italy",
    tier: 1,
    reason: "High-value league; likely Lega Serie A separate from Serie B/C providers.",
    candidateFamilyNeeded: "lega_serie_a_official_rendered_or_api",
    status: "needs_family_route_discovery",
    mustNotProbeAsSingleton: true
  },
  {
    slug: "ned.1",
    country: "Netherlands",
    tier: 1,
    reason: "High-value league; likely official route family can cover Eredivisie and maybe Eerste Divisie via provider.",
    candidateFamilyNeeded: "eredivisie_or_keukenkampioen_official_rendered_or_provider",
    status: "needs_family_route_discovery",
    mustNotProbeAsSingleton: true
  },
  {
    slug: "por.1",
    country: "Portugal",
    tier: 1,
    reason: "High-value league; likely Liga Portugal family can cover top two.",
    candidateFamilyNeeded: "liga_portugal_official_rendered_or_api",
    status: "needs_family_route_discovery",
    mustNotProbeAsSingleton: true
  }
];

const familyExpansionRules = [
  "Expand by source/provider family, not by one league at a time.",
  "A family is worth promoting only if it can verify multiple competitions or covers a strategically high-value singleton.",
  "Every rendered route must pass expected-row count and arithmetic gates before verified status.",
  "Do not count raw DOM/table extraction as coverage before quality gate.",
  "Do not reuse a family across a tier unless the source host and route semantics prove the tier belongs to that family.",
  "For global scale, prefer providers/federation route families with reusable templates over manual country probing.",
  "If a country has multiple tiers split across different governing bodies/providers, split them into separate families."
];

const discoveredCompetitionCount = slugSet.size;
const slugs = [...slugSet].sort();
const detectedGerSlugs = slugs.filter((s) => s.startsWith("ger."));
const detectedUefaStyleSlugs = slugs.filter((s) => /^[a-z]{3}\.(?:1|2|3|cup)$/.test(s));

const summary = {
  status: "passed",
  runner: "browser_rendered_route_family_expansion_plan",
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  discoveredCompetitionSlugCount: discoveredCompetitionCount,
  detectedGerSlugs,
  knownVerifiedFamilyCount: knownVerifiedFamilies.length,
  knownVerifiedCompetitionCount: uniq(knownVerifiedFamilies.flatMap((f) => f.currentVerifiedSlugs)).length,
  knownVerifiedRows: knownVerifiedFamilies.reduce((a, f) => a + Number(f.currentVerifiedRows || 0), 0),
  explicitNearTermRouteCandidateCount: explicitNearTermRouteCandidates.length,
  recommendedNextLane: "build_family_route_discovery_for_high_value_provider_families_starting_with_ger_3_dfb_or_3_liga"
};

const report = {
  summary,
  familyExpansionRules,
  knownVerifiedFamilies,
  explicitNearTermRouteCandidates,
  detectedGerSlugs,
  detectedUefaStyleSlugs: detectedUefaStyleSlugs.slice(0, 300),
  evidenceFilesScanned: files.length,
  slugEvidenceSample: slugRows.slice(0, 200)
};

const outPath = path.join(OUT_DIR, `browser-rendered-route-family-expansion-plan-${DATE}.json`);
fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  summary
}, null, 2));
