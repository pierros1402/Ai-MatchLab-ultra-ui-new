import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const AUTHORITY_RULES = [
  { prefix: "eng.1", hosts: [/premierleague\.com$/i] },
  { prefix: "eng.2", hosts: [/efl\.com$/i] },
  { prefix: "eng.3", hosts: [/efl\.com$/i] },
  { prefix: "eng.4", hosts: [/efl\.com$/i] },
  { prefix: "eng.fa", hosts: [/thefa\.com$/i] },
  { prefix: "eng.league_cup", hosts: [/efl\.com$/i] },
  { prefix: "eng.trophy", hosts: [/efl\.com$/i] },

  { prefix: "sco.", hosts: [/spfl\.co\.uk$/i, /scottishfa\.co\.uk$/i] },
  { prefix: "ger.", hosts: [/bundesliga\.com$/i, /dfb\.de$/i] },
  { prefix: "esp.", hosts: [/laliga\.com$/i, /rfef\.es$/i] },
  { prefix: "ita.", hosts: [/legaseriea\.it$/i, /legab\.it$/i, /figc\.it$/i] },
  { prefix: "fra.", hosts: [/ligue1\.com$/i, /fff\.fr$/i, /epreuves\.fff\.fr$/i] },
  { prefix: "por.", hosts: [/ligaportugal\.pt$/i, /fpf\.pt$/i] },
  { prefix: "ned.", hosts: [/eredivisie\.com$/i, /eredivisie\.eu$/i, /knvb\.nl$/i] },
  { prefix: "bel.", hosts: [/proleague\.be$/i, /rbfa\.be$/i] },
  { prefix: "cro.", hosts: [/hnl\.com\.hr$/i, /hns\.family$/i] },
  { prefix: "cyp.", hosts: [/cfa\.com\.cy$/i] },
  { prefix: "gre.", hosts: [/slgr\.gr$/i] },
  { prefix: "aut.", hosts: [/bundesliga\.at$/i, /oefbl\.at$/i] },
  { prefix: "den.", hosts: [/superliga\.dk$/i, /dbu\.dk$/i] },
  { prefix: "fin.", hosts: [/veikkausliiga\.com$/i, /palloliitto\.fi$/i] },
  { prefix: "nor.", hosts: [/eliteserien\.no$/i, /fotball\.no$/i] },
  { prefix: "swe.", hosts: [/allsvenskan\.se$/i, /svenskfotboll\.se$/i] },
  { prefix: "irl.", hosts: [/fai\.ie$/i] },

  { prefix: "arg.", hosts: [/afa\.com\.ar$/i] },
  { prefix: "bra.", hosts: [/cbf\.com\.br$/i] },
  { prefix: "col.", hosts: [/dimayor\.com\.co$/i] },
  { prefix: "ecu.", hosts: [/ligapro\.ec$/i] },
  { prefix: "uru.", hosts: [/auf\.org\.uy$/i] },
  { prefix: "usa.1", hosts: [/mlssoccer\.com$/i] },
  { prefix: "mex.", hosts: [/ligamx\.net$/i, /fmf\.mx$/i] },

  { prefix: "uefa.", hosts: [/uefa\.com$/i] },
  { prefix: "afc.", hosts: [/the-afc\.com$/i] },
  { prefix: "caf.", hosts: [/cafonline\.com$/i] },
  { prefix: "conmebol.", hosts: [/conmebol\.com$/i] },
  { prefix: "concacaf.", hosts: [/concacaf\.com$/i] },

  { prefix: "ind.1", hosts: [/indiansuperleague\.com$/i] },
  { prefix: "ind.2", hosts: [/the-aiff\.com$/i] },
  { prefix: "ksa.", hosts: [/spl\.com\.sa$/i] },
  { prefix: "rsa.", hosts: [/psl\.co\.za$/i] },
  { prefix: "uga.", hosts: [/upl\.co\.ug$/i] }
];

const WRONG_HOST_RULES = [
  { slug: /^eng\.[234]$/, host: /premierleague\.com$/i, reason: "efl_tier_mapped_to_premier_league_host" },
  { slug: /^eng\.5$/, host: /(premierleague\.com|englandfootball\.com|thefa\.com|efl\.com)$/i, reason: "national_league_wrong_operator_host" },
  { slug: /^afc\.cup$/, url: /afc_asian_cup|asian-cup/i, reason: "afc_cup_mapped_to_asian_cup_page" },
  { slug: /^uefa\.europa\.conf$/, url: /\/running-competitions\/?$|\/match-calendar\/?$/i, reason: "generic_uefa_surface_not_conference_specific" }
];

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    inventory: "",
    registrySummary: "",
    mergedSummary: "",
    registry: "",
    output: "",
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();
    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--inventory") args.inventory = String(argv[++i] || "").trim();
    else if (arg === "--registry-summary") args.registrySummary = String(argv[++i] || "").trim();
    else if (arg === "--merged-summary") args.mergedSummary = String(argv[++i] || "").trim();
    else if (arg === "--registry") args.registry = String(argv[++i] || "").trim();
    else if (arg === "--output") args.output = String(argv[++i] || "").trim();
    else throw new Error(`unknown argument: ${arg}`);
  }

  if (!args.selfTest && !args.inventory) throw new Error("--inventory is required");
  if (!args.selfTest && !args.registrySummary) throw new Error("--registry-summary is required");
  if (!args.selfTest && !args.mergedSummary) throw new Error("--merged-summary is required");
  if (!args.selfTest && !args.registry) throw new Error("--registry is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(repoRoot, filePath), "utf8"));
}

function readText(filePath) {
  return fs.readFileSync(path.resolve(repoRoot, filePath), "utf8");
}

function writeJson(filePath, value) {
  const resolved = path.resolve(repoRoot, filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function rowsFrom(input, keys) {
  for (const key of keys) {
    if (Array.isArray(input?.[key])) return input[key];
  }
  return [];
}

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function slugOf(row) {
  return asText(row.leagueSlug || row.competitionSlug || row.slug);
}

function nameOf(row) {
  return asText(row.competitionName || row.name || row.leagueName || slugOf(row));
}

function hostOfUrl(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function urlsForSlugFromRegistry(registryText, slug) {
  const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blockRx = new RegExp(`["']${escaped}["']\\s*:\\s*\\[([\\s\\S]*?)\\n\\s*\\]`, "m");
  const block = registryText.match(blockRx)?.[1] || "";
  return [...block.matchAll(/["'](https?:\/\/[^"']+)["']/g)].map((m) => m[1]);
}

function authorityRuleFor(slug) {
  return AUTHORITY_RULES
    .filter((rule) => slug === rule.prefix || slug.startsWith(rule.prefix))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0] || null;
}

function compatibleHost(slug, host) {
  const rule = authorityRuleFor(slug);
  if (!rule || !host) return false;
  return rule.hosts.some((rx) => rx.test(host));
}

function wrongReason(slug, host, url) {
  for (const rule of WRONG_HOST_RULES) {
    if (rule.slug.test(slug) && (!rule.host || rule.host.test(host)) && (!rule.url || rule.url.test(url))) {
      return rule.reason;
    }
  }
  return "";
}

function sampleUrls(row) {
  return Array.isArray(row.sampleUrls) ? row.sampleUrls : [];
}

function buildAuthorityMap({ inventory, registrySummary, mergedSummary, registryText }) {
  const inventoryRows = rowsFrom(inventory, ["inventoryRows", "competitionRows", "rows"]);
  const registryCoverageRows = rowsFrom(registrySummary, ["leagueCoverageRows"]);
  const mergedCoverageRows = rowsFrom(mergedSummary, ["leagueCoverageRows"]);

  const registryBySlug = new Map(registryCoverageRows.map((row) => [slugOf(row), row]));
  const mergedBySlug = new Map(mergedCoverageRows.map((row) => [slugOf(row), row]));

  const authorityRows = [];

  for (const inv of inventoryRows) {
    const slug = slugOf(inv);
    if (!slug) continue;

    const registryRow = registryBySlug.get(slug) || {};
    const mergedRow = mergedBySlug.get(slug) || {};
    const registryUrls = urlsForSlugFromRegistry(registryText, slug);
    const samples = [...new Set([...sampleUrls(registryRow), ...sampleUrls(mergedRow), ...registryUrls])].slice(0, 12);

    const compatibleUrls = samples.filter((url) => compatibleHost(slug, hostOfUrl(url)));
    const wrongSamples = samples
      .map((url) => ({ url, host: hostOfUrl(url), reason: wrongReason(slug, hostOfUrl(url), url) }))
      .filter((row) => row.reason);

    let authorityState = "missing_operator_host";
    if (wrongSamples.length > 0) authorityState = "wrong_operator_host_detected";
    else if (compatibleUrls.length > 0 && (registryRow.officialSeedCount || 0) > 0) authorityState = "verified_operator_host";
    else if (compatibleUrls.length > 0) authorityState = "candidate_operator_host";
    else if ((mergedRow.seasonActivityEvidenceCount || 0) > 0) authorityState = "generic_or_weak_evidence_only";

    authorityRows.push({
      leagueSlug: slug,
      competitionName: nameOf(inv),
      authorityState,
      hasAuthorityRule: Boolean(authorityRuleFor(slug)),
      registryOfficialSeedCount: registryRow.officialSeedCount || 0,
      mergedSeasonActivityEvidenceCount: mergedRow.seasonActivityEvidenceCount || 0,
      compatibleOperatorUrls: compatibleUrls.slice(0, 5),
      wrongOperatorSamples: wrongSamples.slice(0, 5),
      sampleUrls: samples.slice(0, 5),
      sourceFetch: false,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    });
  }

  const summary = {
    inventoryLeagueCount: inventoryRows.length,
    authorityRowCount: authorityRows.length,
    byAuthorityState: authorityRows.reduce((acc, row) => {
      acc[row.authorityState] = (acc[row.authorityState] || 0) + 1;
      return acc;
    }, {}),
    verifiedOperatorHostCount: authorityRows.filter((row) => row.authorityState === "verified_operator_host").length,
    candidateOperatorHostCount: authorityRows.filter((row) => row.authorityState === "candidate_operator_host").length,
    missingOperatorHostCount: authorityRows.filter((row) => row.authorityState === "missing_operator_host").length,
    wrongOperatorHostDetectedCount: authorityRows.filter((row) => row.authorityState === "wrong_operator_host_detected").length,
    genericOrWeakEvidenceOnlyCount: authorityRows.filter((row) => row.authorityState === "generic_or_weak_evidence_only").length,
    sourceFetch: false,
    noFetch: true,
    noUrlFetch: true,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };

  return {
    ok: true,
    job: "build-football-truth-season-status-authority-map-file",
    mode: "read_only_authority_mapping",
    generatedAt: new Date().toISOString(),
    summary,
    guarantees: {
      noWebSearch: true,
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noRegistryWrites: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true
    },
    authorityRows
  };
}

function runSelfTest() {
  const inventory = {
    inventoryRows: [
      { leagueSlug: "eng.3", competitionName: "League One" },
      { leagueSlug: "eng.1", competitionName: "Premier League" }
    ]
  };

  const registrySummary = {
    leagueCoverageRows: [
      { leagueSlug: "eng.1", officialSeedCount: 1, sampleUrls: ["https://www.premierleague.com/en/matches"] },
      { leagueSlug: "eng.3", officialSeedCount: 1, sampleUrls: ["https://www.premierleague.com/en/matches"] }
    ]
  };

  const mergedSummary = {
    leagueCoverageRows: [
      { leagueSlug: "eng.1", seasonActivityEvidenceCount: 3, sampleUrls: ["https://www.premierleague.com/en/tables"] },
      { leagueSlug: "eng.3", seasonActivityEvidenceCount: 3, sampleUrls: ["https://www.premierleague.com/en/tables"] }
    ]
  };

  const report = buildAuthorityMap({
    inventory,
    registrySummary,
    mergedSummary,
    registryText: ""
  });

  const eng1 = report.authorityRows.find((row) => row.leagueSlug === "eng.1");
  const eng3 = report.authorityRows.find((row) => row.leagueSlug === "eng.3");

  if (eng1.authorityState !== "verified_operator_host") throw new Error("expected eng.1 verified");
  if (eng3.authorityState !== "wrong_operator_host_detected") throw new Error("expected eng.3 wrong operator");
  if (report.guarantees.canonicalWrites !== 0) throw new Error("canonicalWrites guarantee failed");

  return { ok: true, selfTest: "build-football-truth-season-status-authority-map-file", summary: report.summary, guarantees: report.guarantees };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const report = buildAuthorityMap({
    inventory: readJson(args.inventory),
    registrySummary: readJson(args.registrySummary),
    mergedSummary: readJson(args.mergedSummary),
    registryText: readText(args.registry)
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    job: report.job,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();