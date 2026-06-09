import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const BLOCKED_HOST_PATTERNS = [
  /(^|\.)flashscore\./i,
  /(^|\.)sofascore\./i,
  /(^|\.)aiscore\./i,
  /(^|\.)soccerway\./i,
  /(^|\.)livesport\./i,
  /(^|\.)livescore\./i,
  /(^|\.)365scores\./i,
  /(^|\.)espn\./i,
  /(^|\.)bbc\./i,
  /(^|\.)worldfootball\.net$/i,
  /(^|\.)transfermarkt\./i,
  /(^|\.)wikipedia\.org$/i,
  /(^|\.)wikidata\.org$/i,
  /(^|\.)youtube\.com$/i,
  /(^|\.)facebook\.com$/i,
  /(^|\.)instagram\.com$/i,
  /(^|\.)twitter\.com$/i,
  /(^|\.)x\.com$/i,
  /betting/i,
  /bookmaker/i,
  /casino/i,
  /odds/i,
  /rottentomatoes/i,
  /imdb/i,
  /netflix/i,
  /justwatch/i,
  /leagueoflegends/i,
  /riotgames/i,
  /op\.gg/i
];

const NON_FOOTBALL_SURFACE_PATTERNS = [
  /\b(movie|cinema|streaming|netflix|tourism|travel|government|league of legends|valorant|riot games)\b/i,
  /\bworld cup\b/i,
  /\bcanadamexicousa2026\b/i,
  /\bteam-news\b/i
];

const SURFACE_PATH_PATTERNS = [
  /fixtures?/i,
  /calendar/i,
  /calendrier/i,
  /kalender/i,
  /schedule/i,
  /spielplan/i,
  /terminliste/i,
  /results?/i,
  /resultats?/i,
  /standings?/i,
  /table/i,
  /tabell/i,
  /classement/i,
  /classification/i,
  /competitions?/i,
  /competition/i,
  /natjecanja/i,
  /turneringer/i,
  /matches?/i,
  /matchday/i,
  /league-two/i,
  /championship/i,
  /national-league/i,
  /fa-cup/i,
  /efl-cup/i,
  /copa/i,
  /supercopa/i,
  /cup/i,
  /pokal/i,
  /liga/i,
  /ligue/i,
  /serie/i,
  /division/i
];

const COMPETITION_HOSTS = [
  { prefix: "eng.1", hosts: [/premierleague\.com$/i] },
  { prefix: "eng.2", hosts: [/efl\.com$/i] },
  { prefix: "eng.3", hosts: [/efl\.com$/i] },
  { prefix: "eng.4", hosts: [/efl\.com$/i] },
  { prefix: "eng.5", hosts: [/nationalleague\.org\.uk$/i] },
  { prefix: "eng.fa", hosts: [/thefa\.com$/i] },
  { prefix: "eng.league_cup", hosts: [/efl\.com$/i] },
  { prefix: "eng.trophy", hosts: [/efl\.com$/i] },
  { prefix: "eng.", hosts: [/efl\.com$/i, /thefa\.com$/i, /premierleague\.com$/i] },
  { prefix: "esp.", hosts: [/laliga\.com$/i, /rfef\.es$/i] },
  { prefix: "ita.", hosts: [/legaseriea\.it$/i, /figc\.it$/i, /legab\.it$/i] },
  { prefix: "ger.", hosts: [/bundesliga\.com$/i, /dfb\.de$/i] },
  { prefix: "fra.", hosts: [/fff\.fr$/i, /ligue1\.com$/i] },
  { prefix: "por.", hosts: [/ligaportugal\.pt$/i, /fpf\.pt$/i] },
  { prefix: "aut.", hosts: [/bundesliga\.at$/i, /oefbl\.at$/i] },
  { prefix: "den.", hosts: [/superliga\.dk$/i, /dbu\.dk$/i] },
  { prefix: "ned.", hosts: [/eredivisie\.eu$/i, /eredivisie\.com$/i, /knvb\.nl$/i] },
  { prefix: "sco.", hosts: [/spfl\.co\.uk$/i, /scottishfa\.co\.uk$/i] },
  { prefix: "swe.", hosts: [/allsvenskan\.se$/i, /svenskfotboll\.se$/i] },
  { prefix: "nor.", hosts: [/fotball\.no$/i, /eliteserien\.no$/i] },
  { prefix: "bel.", hosts: [/proleague\.be$/i, /rbfa\.be$/i] },
  { prefix: "cro.", hosts: [/hnl\.com\.hr$/i, /hns\.family$/i] },
  { prefix: "cyp.", hosts: [/cfa\.com\.cy$/i] },
  { prefix: "irl.", hosts: [/fai\.ie$/i] },
  { prefix: "fin.", hosts: [/veikkausliiga\.com$/i, /palloliitto\.fi$/i] },
  { prefix: "tur.", hosts: [/tff\.org$/i] },
  { prefix: "usa.", hosts: [/mlssoccer\.com$/i, /ussoccer\.com$/i] },
  { prefix: "mex.", hosts: [/ligamx\.net$/i] },
  { prefix: "bra.", hosts: [/cbf\.com\.br$/i] },
  { prefix: "arg.", hosts: [/afa\.com\.ar$/i] },
  { prefix: "jpn.", hosts: [/jleague\.co$/i, /jfa\.jp$/i] },
  { prefix: "uefa.", hosts: [/uefa\.com$/i] },
  { prefix: "caf.", hosts: [/cafonline\.com$/i] },
  { prefix: "afc.", hosts: [/the-afc\.com$/i] },
  { prefix: "conmebol.", hosts: [/conmebol\.com$/i] }
];

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    targets: "",
    searchResults: "",
    registry: "engine-v1/ai-match-intelligence/team-news-source-registry.js",
    output: "",
    limit: 80,
    perLeagueLimit: 2,
    allowOfficialHomepageFallback: false,
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();
    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--targets") args.targets = String(argv[++i] || "").trim();
    else if (arg.startsWith("--targets=")) args.targets = arg.slice("--targets=".length);
    else if (arg === "--search-results") args.searchResults = String(argv[++i] || "").trim();
    else if (arg.startsWith("--search-results=")) args.searchResults = arg.slice("--search-results=".length);
    else if (arg === "--registry") args.registry = String(argv[++i] || "").trim();
    else if (arg.startsWith("--registry=")) args.registry = arg.slice("--registry=".length);
    else if (arg === "--output") args.output = String(argv[++i] || "").trim();
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else if (arg === "--limit") args.limit = Number(argv[++i] || 80);
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.slice("--limit=".length));
    else if (arg === "--per-league-limit") args.perLeagueLimit = Number(argv[++i] || 2);
    else if (arg.startsWith("--per-league-limit=")) args.perLeagueLimit = Number(arg.slice("--per-league-limit=".length));
    else if (arg === "--allow-official-homepage-fallback") args.allowOfficialHomepageFallback = true;
    else throw new Error(`unknown argument: ${arg}`);
  }

  if (!args.selfTest && !args.targets) throw new Error("--targets is required");
  if (!args.selfTest && !args.searchResults) throw new Error("--search-results is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");

  args.limit = Number.isFinite(args.limit) && args.limit > 0 ? Math.floor(args.limit) : 80;
  args.perLeagueLimit = Number.isFinite(args.perLeagueLimit) && args.perLeagueLimit > 0 ? Math.floor(args.perLeagueLimit) : 2;

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

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function normalizeHost(value) {
  return asText(value).toLowerCase().replace(/^www\./, "");
}

function urlOf(row) {
  return asText(row.url || row.candidateUrl || row.link || row.resolvedUrl || row.finalUrl);
}

function hostOf(row) {
  const explicit = normalizeHost(row.hostname || row.host);
  if (explicit) return explicit;

  try {
    return normalizeHost(new URL(urlOf(row)).hostname);
  } catch {
    return "";
  }
}

function pathOfUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname || ""}${parsed.search || ""}`.toLowerCase();
  } catch {
    return "";
  }
}

function isRootishUrl(url) {
  const pathValue = pathOfUrl(url);
  return !pathValue || pathValue === "/" || /^\/[a-z]{2}(-[a-z]{2})?\/?$/.test(pathValue);
}

function targetRowsFrom(input) {
  return Array.isArray(input?.searchTargetRows)
    ? input.searchTargetRows
    : Array.isArray(input?.targetRows)
      ? input.targetRows
      : [];
}

function searchRowsFrom(input) {
  return Array.isArray(input?.searchResultRows)
    ? input.searchResultRows
    : Array.isArray(input?.resultRows)
      ? input.resultRows
      : [];
}

function targetKey(row) {
  return asText(row.searchTargetId || row.targetId);
}

function slugOf(row) {
  return asText(row.competitionSlug || row.leagueSlug || row.slug);
}

function existingRegistryUrls(registryText) {
  return new Set([...registryText.matchAll(/["'](https?:\/\/[^"']+)["']/g)].map((match) => match[1].toLowerCase()));
}

function existingRegistryIds(registryText) {
  return new Set([...registryText.matchAll(/id:\s*["']([^"']+)["']/g)].map((match) => match[1]));
}

function cleanIdPart(value) {
  return asText(value)
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function sourceIdFor(row) {
  return `${cleanIdPart(row.leagueSlug)}-${cleanIdPart(row.hostname)}-${sourceTypeFor(row).replace(/_/g, "-")}`;
}

function sourceTypeFor(row) {
  const family = asText(row.competitionFamily).toLowerCase();
  const type = asText(row.competitionType).toLowerCase();
  if (family.includes("cup") || type === "cup") return "competition_news";
  if (family.includes("continental") || type === "continental") return "competition_news";
  return "league_news";
}

function labelFor(row) {
  const name = asText(row.competitionName || row.name || row.leagueSlug);
  const sourceType = sourceTypeFor(row) === "competition_news" ? "official competition source" : "official league source";
  return `${name} ${sourceType}`;
}

function isBlockedHost(host, text) {
  return BLOCKED_HOST_PATTERNS.some((rx) => rx.test(host) || rx.test(text));
}

function isNonFootballSurface(text) {
  return NON_FOOTBALL_SURFACE_PATTERNS.some((rx) => rx.test(text));
}

function hasSurfacePath(url) {
  const pathValue = pathOfUrl(url);
  return SURFACE_PATH_PATTERNS.some((rx) => rx.test(pathValue));
}

function expectedHostForSlug(slug, host) {
  const item = COMPETITION_HOSTS
    .filter((entry) => slug.startsWith(entry.prefix))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];

  if (!item) return false;
  return item.hosts.some((rx) => rx.test(host));
}

function hardMismatch(slug, host, text) {
  if (slug === "usa.1" && /mlsnextpro\.com$/i.test(host)) return "mls_next_pro_is_not_mls";
  if ((slug === "eng.fa" || slug === "eng.league_cup" || slug === "eng.trophy") && /fifa\.com$/i.test(host)) return "fifa_team_page_not_english_cup";
  if (!slug.startsWith("por.") && /ligaportugal\.pt$/i.test(host)) return "portugal_host_mismatch";
  if (!slug.startsWith("esp.") && /(laliga\.com|rfef\.es)$/i.test(host)) return "spain_host_mismatch";
  if (!slug.startsWith("ger.") && /(dfb\.de|bundesliga\.com)$/i.test(host)) return "germany_host_mismatch";
  if (!slug.startsWith("fra.") && /(fff\.fr|ligue1\.com)$/i.test(host)) return "france_host_mismatch";
  if (!slug.startsWith("eng.") && /(efl\.com|thefa\.com|premierleague\.com)$/i.test(host)) return "england_host_mismatch";
  if (/worldcup|canadamexicousa2026|team-news/i.test(text) && !slug.startsWith("fifa.")) return "world_cup_team_page_mismatch";
  return "";
}

function scoreCandidate(target, result, options = {}) {
  const url = urlOf(result);
  const host = hostOf(result);
  const slug = slugOf(target) || slugOf(result);
  const text = [result.title, result.snippet, url, host].map(asText).join(" ");
  const rejectionReasons = [];
  const scoreReasons = [];

  const rootish = isRootishUrl(url);
  const specificSurfacePath = hasSurfacePath(url);
  const expectedHost = expectedHostForSlug(slug, host);
  const officialHomepageFallback = Boolean(options.allowOfficialHomepageFallback && expectedHost && rootish);

  if (!url) rejectionReasons.push("missing_url");
  if (!host) rejectionReasons.push("missing_hostname");
  if (rootish && !officialHomepageFallback) rejectionReasons.push("root_or_locale_url");
  if (isBlockedHost(host, text)) rejectionReasons.push("blocked_supplemental_or_noise_host");
  if (isNonFootballSurface(text)) rejectionReasons.push("non_football_surface");
  if (!specificSurfacePath && !officialHomepageFallback) rejectionReasons.push("missing_specific_surface_path");
  if (!expectedHost) rejectionReasons.push("host_not_expected_for_slug");

  const mismatch = hardMismatch(slug, host, text);
  if (mismatch) rejectionReasons.push(mismatch);

  let score = 0;
  if (expectedHost) {
    score += 90;
    scoreReasons.push("expected_competition_host");
  }

  if (specificSurfacePath) {
    score += 60;
    scoreReasons.push("specific_surface_path");
  } else if (officialHomepageFallback) {
    score += 35;
    scoreReasons.push("official_homepage_fallback");
  }

  const rank = Number(result.rank || 99);
  if (rank <= 3) {
    score += 15;
    scoreReasons.push("top_3_search_rank");
  } else if (rank <= 6) {
    score += 8;
    scoreReasons.push("top_6_search_rank");
  }

  if (/official|federation|association|league|competition|cup|fixtures|results|standings|table/i.test(text)) {
    score += 20;
    scoreReasons.push("official_or_competition_text_signal");
  }

  return {
    ok: rejectionReasons.length === 0 && score >= 120,
    score,
    scoreReasons,
    rejectionReasons,
    slug,
    host,
    url,
    text
  };
}

function dedupeRows(rows) {
  const seen = new Set();
  const out = [];

  for (const row of rows.sort((a, b) => b.compositeScore - a.compositeScore)) {
    const key = `${row.leagueSlug}|${row.hostname}|${row.candidateUrl}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out;
}

function applyPerLeagueLimit(rows, limit) {
  const counts = new Map();
  const out = [];

  for (const row of rows) {
    const count = counts.get(row.leagueSlug) || 0;
    if (count >= limit) continue;
    counts.set(row.leagueSlug, count + 1);
    out.push(row);
  }

  return out;
}

function buildReport(targetInput, searchInput, registryText, options = {}) {
  const targetRows = targetRowsFrom(targetInput);
  const searchRows = searchRowsFrom(searchInput);
  const targetsById = new Map(targetRows.map((row) => [targetKey(row), row]));
  const urls = existingRegistryUrls(registryText);
  const ids = existingRegistryIds(registryText);

  const accepted = [];
  const rejected = [];

  for (const result of searchRows) {
    const id = targetKey(result);
    const target = targetsById.get(id);
    if (!target) continue;

    const scored = scoreCandidate(target, result, options);
    const sourceType = sourceTypeFor(target);
    const base = {
      searchTargetId: id,
      leagueSlug: scored.slug,
      competitionSlug: scored.slug,
      competitionName: asText(target.competitionName || result.name || scored.slug),
      name: asText(target.competitionName || result.name || scored.slug),
      country: asText(target.country),
      region: asText(target.region),
      competitionFamily: asText(target.competitionFamily),
      competitionType: asText(target.competitionType),
      tier: asText(target.tier),
      priority: asText(target.priority),
      candidateUrl: scored.url,
      resolvedUrl: scored.url,
      finalUrl: scored.url,
      hostname: scored.host,
      sourceClass: "official_governing_or_competition_operator",
      truthRole: "bulk_registry_validation_candidate",
      readyForFetch: true,
      fetchPurpose: "bulk_registry_validation_candidate",
      validationIntent: "bulk_registry_validation_candidate",
      compositeScore: scored.score,
      scoreReasons: scored.scoreReasons,
      urlClass: "fixture_calendar_or_competition_specific",
      sourceFetch: false,
      fetchState: "not_fetched",
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    };

    base.type = sourceType;
    base.trustTier = "league";
    base.label = labelFor(base);
    base.sourceId = sourceIdFor(base);

    const duplicateReasons = [];
    if (urls.has(scored.url.toLowerCase())) duplicateReasons.push("duplicate_source_url");
    if (ids.has(base.sourceId)) duplicateReasons.push("duplicate_source_id");

    if (scored.ok && duplicateReasons.length === 0) {
      accepted.push(base);
    } else {
      rejected.push({
        ...base,
        readyForFetch: false,
        rejectionReasons: [...scored.rejectionReasons, ...duplicateReasons]
      });
    }
  }

  const selected = applyPerLeagueLimit(dedupeRows(accepted), options.perLeagueLimit || 2).slice(0, options.limit || 80);
  const selectedKeys = new Set(selected.map((row) => `${row.leagueSlug}|${row.hostname}|${row.candidateUrl}`.toLowerCase()));

  for (const row of accepted) {
    const key = `${row.leagueSlug}|${row.hostname}|${row.candidateUrl}`.toLowerCase();
    if (!selectedKeys.has(key)) {
      rejected.push({
        ...row,
        readyForFetch: false,
        rejectionReasons: ["not_selected_due_to_limit_or_per_league_limit"]
      });
    }
  }

  const rejectedReasonCounts = {};
  for (const row of rejected) {
    for (const reason of row.rejectionReasons || ["unknown"]) {
      rejectedReasonCounts[reason] = (rejectedReasonCounts[reason] || 0) + 1;
    }
  }

  return {
    ok: true,
    job: "build-football-truth-season-status-bulk-registry-validation-candidates-file",
    mode: "read_only_bulk_registry_validation_candidates",
    generatedAt: new Date().toISOString(),
    summary: {
      searchTargetCount: targetRows.length,
      searchResultInputCount: searchRows.length,
      acceptedCandidateUrlCount: selected.length,
      rejectedCandidateUrlCount: rejected.length,
      rejectedReasonCounts,
      byLeague: selected.reduce((acc, row) => {
        acc[row.leagueSlug] = (acc[row.leagueSlug] || 0) + 1;
        return acc;
      }, {}),
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    guarantees: {
      usesOnlyProvidedSearchResults: true,
      usesOnlyExistingRegistryForDuplicateChecks: true,
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
    rankedCandidateUrlRows: selected,
    acceptedCandidateUrlRows: selected,
    rejectedCandidateUrlRows: rejected
  };
}

function runSelfTest() {
  const targets = {
    searchTargetRows: [
      {
        searchTargetId: "eng.4::official",
        competitionSlug: "eng.4",
        competitionName: "League Two",
        country: "england",
        region: "europe",
        competitionFamily: "domestic_league",
        competitionType: "league",
        tier: "1"
      },
      {
        searchTargetId: "eng.fa::official",
        competitionSlug: "eng.fa",
        competitionName: "FA Cup",
        country: "england",
        region: "europe",
        competitionFamily: "domestic_cup",
        competitionType: "cup",
        tier: "2"
      }
    ]
  };

  const search = {
    searchResultRows: [
      {
        searchTargetId: "eng.4::official",
        rank: 1,
        title: "EFL League Two table, results, fixtures",
        url: "https://www.efl.com/competitions/efl-league-two/",
        hostname: "efl.com"
      },
      {
        searchTargetId: "eng.fa::official",
        rank: 1,
        title: "England team news World Cup",
        url: "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/teams/england/team-news",
        hostname: "fifa.com"
      },
      {
        searchTargetId: "eng.3::official",
        rank: 1,
        title: "Premier League homepage",
        url: "https://www.premierleague.com/",
        hostname: "premierleague.com"
      }
    ]
  };

  const registry = `
const LEAGUE_SOURCE_REGISTRY = {
  "eng.1": [
    { id: "eng-1-premierleague-com-league-news", buildUrls() { return ["https://www.premierleague.com/news"]; } }
  ]
};
`;

  const report = buildReport(targets, search, registry, { limit: 10, perLeagueLimit: 2 });
  if (report.summary.acceptedCandidateUrlCount !== 1) throw new Error("expected one accepted candidate");
  if (report.rankedCandidateUrlRows[0].leagueSlug !== "eng.4") throw new Error("expected eng.4 accepted");
  if (!report.rejectedCandidateUrlRows.find((row) => row.leagueSlug === "eng.fa" && row.rejectionReasons.includes("fifa_team_page_not_english_cup"))) {
    throw new Error("expected FIFA FA Cup mismatch rejection");
  }
  if (!report.rejectedCandidateUrlRows.find((row) => row.leagueSlug === "eng.3" && row.hostname === "premierleague.com" && row.rejectionReasons.includes("host_not_expected_for_slug"))) {
    throw new Error("expected Premier League host rejection for League One");
  }
  if (report.guarantees.noRegistryWrites !== true || report.guarantees.canonicalWrites !== 0) throw new Error("read-only guarantees failed");

  return {
    ok: true,
    selfTest: "build-football-truth-season-status-bulk-registry-validation-candidates-file",
    summary: report.summary,
    guarantees: report.guarantees
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const report = buildReport(readJson(args.targets), readJson(args.searchResults), readText(args.registry), {
    limit: args.limit,
    perLeagueLimit: args.perLeagueLimit,
    allowOfficialHomepageFallback: args.allowOfficialHomepageFallback
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
