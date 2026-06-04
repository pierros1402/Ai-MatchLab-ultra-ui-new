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
  /(^|\.)tribuna\./i,
  /(^|\.)worldfootball\.net$/i,
  /(^|\.)futbol24\.com$/i,
  /(^|\.)soccer365\.net$/i,
  /(^|\.)globalsportsarchive\.com$/i,
  /(^|\.)transfermarkt\./i,
  /(^|\.)wikipedia\.org$/i,
  /(^|\.)wikidata\.org$/i,
  /(^|\.)youtube\.com$/i,
  /(^|\.)facebook\.com$/i,
  /(^|\.)twitter\.com$/i,
  /(^|\.)x\.com$/i,
  /(^|\.)instagram\.com$/i,
  /(^|\.)rottentomatoes\./i,
  /(^|\.)imdb\./i,
  /(^|\.)netflix\./i,
  /(^|\.)justwatch\./i,
  /(^|\.)allocine\./i,
  /(^|\.)senscritique\./i,
  /(^|\.)cinetrafic\./i,
  /(^|\.)programme-tv\./i,
  /(^|\.)leagueoflegends\.com$/i,
  /(^|\.)riotgames\.com$/i,
  /(^|\.)op\.gg$/i,
  /(^|\.)u\.gg$/i,
  /(^|\.)casino/i,
  /betting/i,
  /bookmaker/i,
  /odds/i
];

const NON_FOOTBALL_PATTERNS = [
  /\b(series?|streaming|netflix|movie|cinema|tv programme|tourism|travel|government|president|country facts|visit norway|visitnorway|france\.fr|italia\.it|nationsonline|countryreports|britannica)\b/i,
  /\bleague of legends\b/i,
  /\bvalorant\b/i,
  /\briot games\b/i
];

const SURFACE_PATTERNS = [
  /fixtures?/i,
  /calendar/i,
  /calendrier/i,
  /kalender/i,
  /schedule/i,
  /terminliste/i,
  /results?/i,
  /resultats?/i,
  /resultater/i,
  /standings?/i,
  /table/i,
  /tabell/i,
  /tablica/i,
  /classification/i,
  /classement/i,
  /competitions?/i,
  /competition/i,
  /natjecanja/i,
  /turneringer/i,
  /coupe/i,
  /pokal/i,
  /cup/i,
  /jogos/i,
  /matches?/i
];

const OFFICIAL_HINT_PATTERNS = [
  /official website/i,
  /official/i,
  /officiel/i,
  /hjemmeside/i,
  /association/i,
  /federation/i,
  /football association/i,
  /football federation/i,
  /\bfa\b/i
];

const HOST_HINTS_BY_COUNTRY = {
  belgium: [/proleague\.be$/i, /rbfa\.be$/i, /acff\.be$/i],
  cyprus: [/cfa\.com\.cy$/i],
  denmark: [/superliga\.dk$/i, /dbu\.dk$/i],
  norway: [/eliteserien\.no$/i, /fotball\.no$/i],
  portugal: [/ligaportugal\.pt$/i, /fpf\.pt$/i],
  croatia: [/hns\.family$/i, /hnl\.com\.hr$/i],
  france: [/fff\.fr$/i, /ligue1\.com$/i],
  germany: [/dfb\.de$/i, /bundesliga\.com$/i],
  austria: [/oefbl\.at$/i, /bundesliga\.at$/i],
  finland: [/veikkausliiga\.com$/i, /palloliitto\.fi$/i],
  spain: [/laliga\.com$/i, /rfef\.es$/i],
  italy: [/legaseriea\.it$/i, /figc\.it$/i],
  turkey: [/tff\.org$/i],
  england: [/premierleague\.com$/i, /efl\.com$/i, /thefa\.com$/i],
  scotland: [/spfl\.co\.uk$/i, /scottishfa\.co\.uk$/i],
  greece: [/slgr\.gr$/i, /epo\.gr$/i],
  sweden: [/allsvenskan\.se$/i, /svenskfotboll\.se$/i],
  uefa: [/uefa\.com$/i],
  caf: [/cafonline\.com$/i],
  afc: [/the-afc\.com$/i],
  conmebol: [/conmebol\.com$/i]
};

const COMPETITION_HOST_HINTS = [
  { slug: /^bel\.1$/i, hosts: [/proleague\.be$/i] },
  { slug: /^cyp\.1$/i, hosts: [/cfa\.com\.cy$/i] },
  { slug: /^den\.1$/i, hosts: [/superliga\.dk$/i] },
  { slug: /^nor\.1$/i, hosts: [/eliteserien\.no$/i, /fotball\.no$/i] },
  { slug: /^por\.1$/i, hosts: [/ligaportugal\.pt$/i] },
  { slug: /^cro\.1$/i, hosts: [/hns\.family$/i, /hnl\.com\.hr$/i] },
  { slug: /^fra\.coupe_de_france$/i, hosts: [/fff\.fr$/i] },
  { slug: /^ger\.dfb_pokal$/i, hosts: [/dfb\.de$/i, /bundesliga\.com$/i] }
];

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    targets: "",
    searchResults: "",
    output: "",
    perLeagueLimit: 3,
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--targets") args.targets = String(argv[++i] || "").trim();
    else if (arg.startsWith("--targets=")) args.targets = arg.slice("--targets=".length);
    else if (arg === "--search-results") args.searchResults = String(argv[++i] || "").trim();
    else if (arg.startsWith("--search-results=")) args.searchResults = arg.slice("--search-results=".length);
    else if (arg === "--output") args.output = String(argv[++i] || "").trim();
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else if (arg === "--per-league-limit") args.perLeagueLimit = Number(argv[++i] || 3);
    else if (arg.startsWith("--per-league-limit=")) args.perLeagueLimit = Number(arg.slice("--per-league-limit=".length));
    else throw new Error(`unknown argument: ${arg}`);
  }

  if (!args.selfTest && !args.targets) throw new Error("--targets is required");
  if (!args.selfTest && !args.searchResults) throw new Error("--search-results is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");

  args.perLeagueLimit = Number.isFinite(args.perLeagueLimit) && args.perLeagueLimit > 0 ? Math.floor(args.perLeagueLimit) : 3;
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(repoRoot, filePath), "utf8"));
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
  const host = normalizeHost(row.hostname || row.host);
  if (host) return host;

  try {
    return normalizeHost(new URL(urlOf(row)).hostname);
  } catch {
    return "";
  }
}

function targetRowsFrom(input) {
  return Array.isArray(input?.searchTargetRows)
    ? input.searchTargetRows
    : Array.isArray(input?.targetRows)
      ? input.targetRows
      : Array.isArray(input?.rows)
        ? input.rows
        : [];
}

function resultRowsFrom(input) {
  return Array.isArray(input?.searchResultRows)
    ? input.searchResultRows
    : Array.isArray(input?.resultRows)
      ? input.resultRows
      : Array.isArray(input?.rows)
        ? input.rows
        : [];
}

function targetKey(row) {
  return asText(row.searchTargetId || row.targetId);
}

function slugOf(row) {
  return asText(row.competitionSlug || row.leagueSlug || row.targetLeagueSlug || row.slug);
}

function textOf(row) {
  return [
    row.title,
    row.snippet,
    row.url,
    row.candidateUrl,
    row.hostname
  ].map(asText).join(" ");
}

function isBlockedHost(host) {
  return BLOCKED_HOST_PATTERNS.some((rx) => rx.test(host));
}

function hasNonFootballIntent(text) {
  return NON_FOOTBALL_PATTERNS.some((rx) => rx.test(text));
}

function hasSurfaceSignal(text) {
  return SURFACE_PATTERNS.some((rx) => rx.test(text));
}

function hasOfficialSignal(text) {
  return OFFICIAL_HINT_PATTERNS.some((rx) => rx.test(text));
}

function hostMatchesAny(host, patterns = []) {
  return patterns.some((rx) => rx.test(host));
}

function expectedHostPatterns(target) {
  const country = asText(target.country).toLowerCase();
  const slug = slugOf(target);

  const patterns = [...(HOST_HINTS_BY_COUNTRY[country] || [])];

  for (const item of COMPETITION_HOST_HINTS) {
    if (item.slug.test(slug)) patterns.push(...item.hosts);
  }

  if (Array.isArray(target.officialRegistryHostnames)) {
    for (const host of target.officialRegistryHostnames) {
      const normalized = normalizeHost(host).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (normalized) patterns.push(new RegExp(`(^|\\.)${normalized}$`, "i"));
    }
  }

  return patterns;
}

function crossCompetitionMismatch(target, host, text) {
  const slug = slugOf(target);
  const country = asText(target.country).toLowerCase();

  if (slug !== "eng.1" && /premierleague\.com$/i.test(host)) return "premierleague_only_valid_for_eng_1";
  if (!slug.startsWith("gre.") && /slgr\.gr$/i.test(host)) return "slgr_only_valid_for_greece";
  if (!slug.startsWith("esp.") && /laliga\.com$/i.test(host)) return "laliga_only_valid_for_spain";
  if (!slug.startsWith("por.") && /ligaportugal\.pt$/i.test(host)) return "ligaportugal_only_valid_for_portugal";
  if (!slug.startsWith("ger.") && /dfb\.de$/i.test(host)) return "dfb_only_valid_for_germany";
  if (!slug.startsWith("fra.") && /fff\.fr$/i.test(host)) return "fff_only_valid_for_france";
  if (slug === "fra.coupe_de_france" && /ligue1\.com$/i.test(host)) return "coupe_de_france_requires_fff_source";
  if (!slug.startsWith("bel.") && /proleague\.be$/i.test(host)) return "proleague_only_valid_for_belgium";
  if (!slug.startsWith("cro.") && (/hns\.family$/i.test(host) || /hnl\.com\.hr$/i.test(host))) return "croatian_host_mismatch";
  if (!slug.startsWith("nor.") && (/eliteserien\.no$/i.test(host) || /fotball\.no$/i.test(host))) return "norwegian_host_mismatch";

  if (country === "romania" && /(spain|laliga|liga portugal|portugal|la liga)/i.test(text)) return "country_competition_mismatch_romania";
  if (country === "austria" && /german bundesliga|bundesliga\.com\/en\/bundesliga/i.test(text)) return "country_competition_mismatch_austria_germany";

  return "";
}

function urlClassFor(row) {
  const text = textOf(row).toLowerCase();

  if (/(fixtures?|calendar|calendrier|kalender|schedule|terminliste|results?|resultats?|standings?|table|tabell|tablica|classement|classification|competitions?|natjecanja|turneringer|matches?)/i.test(text)) {
    return "fixture_calendar_or_competition_specific";
  }

  if (/(news|nieuws|nyheter|noticias|actualites|notizie|media|press)/i.test(text)) return "news_or_media";

  try {
    const url = new URL(urlOf(row));
    if (url.pathname === "/" || url.pathname === "") return "homepage";
  } catch {
    // ignored
  }

  return "generic_official_page";
}

function scoreCandidate(target, result) {
  const host = hostOf(result);
  const text = textOf(result);
  const url = urlOf(result);
  const reasons = [];
  const rejectReasons = [];
  const expectedPatterns = expectedHostPatterns(target);

  if (!url) rejectReasons.push("missing_url");
  if (!host) rejectReasons.push("missing_hostname");
  if (isBlockedHost(host)) rejectReasons.push("blocked_supplemental_or_noise_host");
  if (hasNonFootballIntent(text)) rejectReasons.push("non_football_intent_surface");

  const mismatch = crossCompetitionMismatch(target, host, text);
  if (mismatch) rejectReasons.push(mismatch);

  const onExpectedHost = expectedPatterns.length > 0 && hostMatchesAny(host, expectedPatterns);
  const surfaceSignal = hasSurfaceSignal(text);
  const officialSignal = hasOfficialSignal(text);
  const urlClass = urlClassFor(result);

  if (!onExpectedHost && !officialSignal) rejectReasons.push("missing_official_host_or_signal");
  if (!surfaceSignal) rejectReasons.push("missing_fixture_calendar_competition_surface");

  if (urlClass !== "fixture_calendar_or_competition_specific") {
    rejectReasons.push("not_fixture_calendar_or_competition_specific_url");
  }

  let score = 0;

  if (onExpectedHost) {
    score += 70;
    reasons.push("expected_official_host");
  }

  if (officialSignal) {
    score += 25;
    reasons.push("official_signal");
  }

  if (surfaceSignal) {
    score += 35;
    reasons.push("fixture_calendar_competition_surface");
  }

  if (urlClass === "fixture_calendar_or_competition_specific") {
    score += 35;
    reasons.push("specific_url_class");
  } else if (urlClass === "homepage") {
    score += 5;
    reasons.push("homepage_secondary_candidate");
  }

  const rank = Number(result.rank || 99);
  if (rank <= 3) score += 12;
  else if (rank <= 6) score += 6;

  if (rejectReasons.length) {
    return {
      ok: false,
      score,
      reasons,
      rejectReasons,
      host,
      url,
      urlClass
    };
  }

  return {
    ok: score >= 45,
    score,
    reasons,
    rejectReasons: score >= 45 ? [] : ["score_below_acceptance_threshold"],
    host,
    url,
    urlClass
  };
}

function dedupeAccepted(rows) {
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
    const slug = row.leagueSlug;
    const count = counts.get(slug) || 0;
    if (count >= limit) continue;

    counts.set(slug, count + 1);
    out.push(row);
  }

  return out;
}

function buildReport(targetInput, searchInput, options = {}) {
  const targets = targetRowsFrom(targetInput);
  const searchRows = resultRowsFrom(searchInput);

  const targetsById = new Map(targets.map((row) => [targetKey(row), row]));
  const accepted = [];
  const rejected = [];

  for (const result of searchRows) {
    const id = targetKey(result);
    const target = targetsById.get(id);

    if (!target) {
      rejected.push({
        rejectionReason: "missing_matching_target",
        searchTargetId: id,
        candidateUrl: urlOf(result),
        hostname: hostOf(result),
        canonicalWrites: 0,
        productionWrite: false,
        dryRun: true
      });
      continue;
    }

    const scored = scoreCandidate(target, result);

    const base = {
      searchTargetId: id,
      targetType: target.targetType,
      enrichmentState: target.enrichmentState,
      leagueSlug: slugOf(target),
      competitionSlug: slugOf(target),
      name: asText(target.competitionName || result.name),
      competitionName: asText(target.competitionName || result.name),
      country: asText(target.country),
      region: asText(target.region),
      competitionFamily: asText(target.competitionFamily),
      competitionType: asText(target.competitionType),
      tier: asText(target.tier),
      priority: asText(target.priority),
      query: asText(result.query || target.query),
      candidateUrl: scored.url,
      finalUrl: scored.url,
      resolvedUrl: scored.url,
      hostname: scored.host,
      title: asText(result.title),
      snippet: asText(result.snippet),
      rank: Number(result.rank || 0),
      urlClass: scored.urlClass,
      compositeScore: scored.score,
      scoreReasons: scored.reasons,
      sourceClass: "official_governing_or_competition_operator",
      truthRole: "season_status_registry_enrichment_candidate",
      readyForFetch: true,
      fetchPurpose: "season_status_registry_enrichment_candidate_snapshot",
      validationIntent: "season_status_registry_enrichment_candidate",
      manualCandidateUrlUsed: false,
      inventedUrls: false,
      sourceFetch: false,
      fetchState: "not_fetched",
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    };

    if (scored.ok) {
      accepted.push(base);
    } else {
      rejected.push({
        ...base,
        readyForFetch: false,
        rejectionReasons: scored.rejectReasons,
        sourceClass: "rejected_registry_enrichment_candidate"
      });
    }
  }

  const dedupedAccepted = applyPerLeagueLimit(dedupeAccepted(accepted), options.perLeagueLimit || 3);

  const rejectedReasonCounts = {};
  for (const row of rejected) {
    for (const reason of row.rejectionReasons || [row.rejectionReason || "unknown"]) {
      rejectedReasonCounts[reason] = (rejectedReasonCounts[reason] || 0) + 1;
    }
  }

  const byLeague = {};
  for (const row of dedupedAccepted) {
    if (!byLeague[row.leagueSlug]) {
      byLeague[row.leagueSlug] = {
        name: row.name,
        candidateUrlCount: 0,
        topCompositeScore: row.compositeScore,
        hostnames: []
      };
    }

    byLeague[row.leagueSlug].candidateUrlCount += 1;
    byLeague[row.leagueSlug].topCompositeScore = Math.max(byLeague[row.leagueSlug].topCompositeScore, row.compositeScore);
    if (!byLeague[row.leagueSlug].hostnames.includes(row.hostname)) byLeague[row.leagueSlug].hostnames.push(row.hostname);
  }

  return {
    ok: true,
    job: "rank-football-truth-season-status-registry-enrichment-search-results-file",
    mode: "read_only_season_status_registry_enrichment_candidate_ranking",
    generatedAt: new Date().toISOString(),
    options: {
      perLeagueLimit: options.perLeagueLimit || 3
    },
    summary: {
      searchTargetCount: targets.length,
      searchResultInputCount: searchRows.length,
      rawAcceptedCandidateCount: accepted.length,
      candidateUrlCount: dedupedAccepted.length,
      rejectedResultCount: rejected.length,
      rejectedReasonCounts,
      byLeague,
      manualCandidateUrlsRequired: false,
      manualCandidateUrlsUsed: false,
      inventedUrls: false,
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    guarantees: {
      noWebSearch: true,
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyProvidedSearchResults: true,
      noRegistryWrites: true,
      noReviewDecisionApplied: true,
      noCanonicalPromotion: true,
      noFixtureWrites: true,
      noHistoryWrites: true,
      noValueWrites: true,
      noDetailsWrites: true,
      manualCandidateUrlsRequired: false,
      manualCandidateUrlsUsed: false,
      inventedUrls: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true
    },
    rankedCandidateUrlRows: dedupedAccepted,
    acceptedCandidateUrlRows: dedupedAccepted,
    rejectedRows: rejected
  };
}

function runSelfTest() {
  const targets = {
    searchTargetRows: [
      {
        searchTargetId: "bel.1::t::1",
        targetType: "season-status-official-registry-missing",
        enrichmentState: "missing_official_registry_candidate",
        competitionSlug: "bel.1",
        competitionName: "Belgian Pro League",
        country: "belgium",
        region: "europe",
        competitionFamily: "domestic_league",
        competitionType: "league",
        tier: "1",
        priority: "ft_repair_and_season_status"
      }
    ]
  };

  const search = {
    searchResultRows: [
      {
        searchTargetId: "bel.1::t::1",
        leagueSlug: "bel.1",
        rank: 1,
        title: "Jupiler Pro League 2025/2026 Calendrier | Pro League | Official website",
        snippet: "",
        url: "https://www.proleague.be/fr/jupliler-pro-league-20252026-kalender",
        hostname: "proleague.be"
      },
      {
        searchTargetId: "bel.1::t::1",
        leagueSlug: "bel.1",
        rank: 2,
        title: "Jupiler Pro League live scores",
        snippet: "",
        url: "https://www.flashscore.com/football/belgium/jupiler-pro-league/",
        hostname: "flashscore.com"
      }
    ]
  };

  const report = buildReport(targets, search, { perLeagueLimit: 3 });

  if (report.summary.candidateUrlCount !== 1) throw new Error("expected one accepted candidate");
  if (report.rankedCandidateUrlRows[0].hostname !== "proleague.be") throw new Error("expected proleague.be accepted");
  if (report.rejectedRows.find((row) => row.hostname === "flashscore.com")?.rejectionReasons?.includes("blocked_supplemental_or_noise_host") !== true) {
    throw new Error("expected flashscore rejection");
  }
  if (report.guarantees.noFetch !== true || report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("read-only guarantees failed");
  }

  return {
    ok: true,
    selfTest: "rank-football-truth-season-status-registry-enrichment-search-results-file",
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

  const report = buildReport(readJson(args.targets), readJson(args.searchResults), {
    perLeagueLimit: args.perLeagueLimit
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