import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getTeamNewsSourcesForTask } from "../ai-match-intelligence/team-news-source-registry.js";

const __filename = fileURLToPath(import.meta.url);
const MODULE_DIR = path.dirname(__filename);
const ROOT_DIR = path.resolve(MODULE_DIR, "..", "..");

function argValue(name, fallback = "") {
  const prefix = `--${name}=`;
  const direct = process.argv.find(arg => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length).trim();

  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith("--")) {
    return process.argv[idx + 1].trim();
  }

  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const leagueSlug = String(argValue("league", "") || argValue("leagueSlug", "")).trim().toLowerCase();
const shouldFetch = hasFlag("fetch");
const shouldAuditCandidateMap = hasFlag("candidate-map");
const candidateFetchLimit = Number(argValue("candidate-fetch-limit", "120")) || 120;
const fetchLimit = Number(argValue("fetch-limit", "80")) || 80;
const fetchTimeoutMs = Number(argValue("fetch-timeout-ms", "5500")) || 5500;

if (!leagueSlug) {
  console.error("Usage: node engine-v1/jobs/audit-team-news-league-source-map.js --league=cyp.1 [--fetch] [--candidate-map]");
  process.exit(2);
}

function resolveDataPath(...parts) {
  return path.join(ROOT_DIR, "data", ...parts);
}

function readJson(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    return { __readError: err?.message || String(err), file };
  }
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function normalizeTeamKey(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function leagueOfMatch(match = {}) {
  return lower(
    match.leagueSlug ||
    match.league ||
    match.competitionSlug ||
    match.competition?.slug ||
    match.meta?.leagueSlug ||
    match.context?.leagueSlug ||
    ""
  );
}

function homeOf(match = {}) {
  return text(
    match.homeTeam ||
    match.home ||
    match.home_name ||
    match.homeName ||
    match.teams?.home?.name ||
    match.home?.name ||
    match.match?.homeTeam ||
    ""
  );
}

function awayOf(match = {}) {
  return text(
    match.awayTeam ||
    match.away ||
    match.away_name ||
    match.awayName ||
    match.teams?.away?.name ||
    match.away?.name ||
    match.match?.awayTeam ||
    ""
  );
}

function matchIdOf(match = {}) {
  return text(match.matchId || match.id || match.fixtureId || match.eventId || match.match?.matchId || "") || null;
}

function addTeam(teams, team, source, extra = {}) {
  const name = text(team);
  if (!name) return;

  const key = normalizeTeamKey(name);
  if (!key) return;

  if (!teams.has(key)) {
    teams.set(key, {
      key,
      team: name,
      aliasesSeen: new Set(),
      sourceHits: new Map(),
      sampleMatches: []
    });
  }

  const row = teams.get(key);
  row.aliasesSeen.add(name);
  row.sourceHits.set(source, (row.sourceHits.get(source) || 0) + 1);

  if (extra.matchId || extra.opponent || extra.day) {
    row.sampleMatches.push({
      day: extra.day || null,
      matchId: extra.matchId || null,
      opponent: text(extra.opponent) || null,
      source
    });
  }
}

function collectFromMatchArray(teams, matches, source, day = null) {
  if (!Array.isArray(matches)) return;

  for (const match of matches) {
    if (leagueOfMatch(match) !== leagueSlug) continue;

    const home = homeOf(match);
    const away = awayOf(match);
    const matchId = matchIdOf(match);

    addTeam(teams, home, source, { day, matchId, opponent: away });
    addTeam(teams, away, source, { day, matchId, opponent: home });
  }
}

function collectFromFixturePayload(teams, payload, source, day = null) {
  if (Array.isArray(payload)) collectFromMatchArray(teams, payload, source, day);
  collectFromMatchArray(teams, payload?.fixtures, source, day);
  collectFromMatchArray(teams, payload?.matches, source, day);
  collectFromMatchArray(teams, payload?.items, source, day);
}

function collectFromDetailsObject(teams, detail, source, day, fileMatchId) {
  const candidates = [
    detail,
    detail?.match,
    detail?.fixture,
    detail?.context?.match,
    detail?.context?.fixture,
    detail?.meta?.match
  ].filter(Boolean);

  for (const match of candidates) {
    if (leagueOfMatch(match) !== leagueSlug) continue;

    const home = homeOf(match);
    const away = awayOf(match);
    const matchId = matchIdOf(match) || fileMatchId || null;

    addTeam(teams, home, source, { day, matchId, opponent: away });
    addTeam(teams, away, source, { day, matchId, opponent: home });
  }
}

function collectFixturesAndSnapshots(teams) {
  for (const rel of ["fixtures.json", "active-leagues.json"]) {
    const payload = readJson(resolveDataPath(rel));
    collectFromFixturePayload(teams, payload, `data/${rel}`);
  }

  const snapshotsDir = resolveDataPath("deploy-snapshots");
  if (!fs.existsSync(snapshotsDir)) return;

  const days = fs.readdirSync(snapshotsDir)
    .filter(name => /^\d{4}-\d{2}-\d{2}$/.test(name))
    .sort();

  for (const day of days) {
    const fixturesPayload = readJson(path.join(snapshotsDir, day, "fixtures.json"));
    collectFromFixturePayload(teams, fixturesPayload, `snapshot:${day}:fixtures`, day);

    const detailsDir = path.join(snapshotsDir, day, "details");
    if (!fs.existsSync(detailsDir)) continue;

    for (const file of fs.readdirSync(detailsDir).filter(name => name.endsWith(".json"))) {
      const detail = readJson(path.join(detailsDir, file));
      if (!detail || detail.__readError) continue;
      collectFromDetailsObject(teams, detail, `snapshot:${day}:details`, day, file.replace(/\.json$/, ""));
    }
  }
}

function rowTeamName(row = {}) {
  return text(row.team || row.teamName || row.name || row.club || row.squad || row.entry?.team || row.entry?.name || "");
}

function collectStandings(teams) {
  const standingsDir = resolveDataPath("standings");
  if (!fs.existsSync(standingsDir)) return;

  const stack = [standingsDir];

  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }

      if (!entry.name.endsWith(".json")) continue;

      const payload = readJson(full);
      if (!payload || payload.__readError) continue;

      const rows = Array.isArray(payload) ? payload : (payload.standings || payload.table || payload.teams || payload.rows || []);
      if (!Array.isArray(rows)) continue;

      const rel = path.relative(ROOT_DIR, full).replace(/\\/g, "/");
      const fileLooksRelevant = rel.toLowerCase().includes(leagueSlug) || rel.toLowerCase().includes(leagueSlug.replace(".", "-"));
      const payloadLeague = lower(payload.leagueSlug || payload.league || payload.competitionSlug || payload.competition?.slug || "");

      if (payloadLeague && payloadLeague !== leagueSlug) continue;
      if (!payloadLeague && !fileLooksRelevant) continue;

      for (const row of rows) {
        const rowLeague = lower(row.leagueSlug || row.league || row.competitionSlug || row.competition?.slug || "");
        if (rowLeague && rowLeague !== leagueSlug) continue;
        addTeam(teams, rowTeamName(row), `standings:${rel}`);
      }
    }
  }
}

function collectCoverageBacklog(teams) {
  const coverageDir = resolveDataPath("team-news", "_coverage-reports");
  if (!fs.existsSync(coverageDir)) return;

  const files = fs.readdirSync(coverageDir)
    .filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort();

  for (const file of files) {
    const day = file.replace(/\.json$/, "");
    const payload = readJson(path.join(coverageDir, file));
    const rows = Array.isArray(payload?.priorityBacklog) ? payload.priorityBacklog : [];

    for (const row of rows) {
      if (lower(row.league) !== leagueSlug) continue;

      addTeam(teams, row.team, `coverage:${day}`, { day, opponent: row.opponent });
      addTeam(teams, row.opponent, `coverage:${day}`, { day, opponent: row.team });
    }
  }
}

function isOfficialSource(source = {}) {
  const haystack = `${source.id || ""} ${source.label || ""} ${source.type || ""} ${source.trustTier || ""}`.toLowerCase();
  return /official|club_news|team_official/.test(haystack);
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function summarizeSource(source = {}) {
  return {
    id: source.id || null,
    label: source.label || null,
    type: source.type || null,
    trustTier: source.trustTier || null,
    url: source.url || null,
    host: hostOf(source.url),
    sourceMode: source.sourceMode || null
  };
}

function uniqueByUrl(rows) {
  const seen = new Set();
  const out = [];

  for (const row of rows) {
    const key = lower(row.url || JSON.stringify(row));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out;
}

async function fetchUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), fetchTimeoutMs);

  try {
    const started = Date.now();
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 Ai-MatchLab source-map-audit",
        "accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8"
      }
    });

    const body = await res.text();

    return {
      ok: true,
      url,
      finalUrl: res.url,
      status: res.status,
      contentType: res.headers.get("content-type"),
      elapsedMs: Date.now() - started,
      textLength: body.length,
      textPreview: body.replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 240)
    };
  } catch (err) {
    return {
      ok: false,
      url,
      error: err?.name || err?.message || String(err)
    };
  } finally {
    clearTimeout(timer);
  }
}


function slugifyHostPart(value) {
  return normalizeTeamKey(value)
    .replace(/\bfc\b/g, "")
    .replace(/\bsc\b/g, "")
    .replace(/\bac\b/g, "")
    .replace(/\bclub\b/g, "")
    .replace(/\bfootball\b/g, "")
    .replace(/\bthe\b/g, "")
    .replace(/\s+/g, "")
    .trim();
}

const LEAGUE_CANDIDATE_SOURCE_MAP = {
  "cyp.1": {
    "aek larnaca": [
      "https://www.aek.com.cy/",
      "https://www.aek.com.cy/news/",
      "https://aek.com.cy/"
    ],
    "ael": [
      "https://www.aelfc.com.cy/",
      "https://aelfc.com.cy/",
      "https://www.ael-fc.com/",
      "https://ael-fc.com/",
      "https://ael.org.cy/"
    ],
    "ael limassol": [
      "https://www.aelfc.com.cy/",
      "https://aelfc.com.cy/",
      "https://www.ael-fc.com/",
      "https://ael-fc.com/",
      "https://ael.org.cy/"
    ],
    "akritas chlorakas": [
      "https://akritasfc.com/",
      "https://akritasfc.com/news/"
    ],
    "anorthosis": [
      "https://anorthosisfc.com.cy/",
      "https://anorthosisfc.com.cy/news/",
      "https://www.anorthosisfc.com.cy/"
    ],
    "apoel nicosia": [
      "https://www.apoelfc.com.cy/",
      "https://apoelfc.com.cy/",
      "https://www.apoelfc.com.cy/news/"
    ],
    "apollon limassol": [
      "https://www.apollon.com.cy/",
      "https://apollon.com.cy/",
      "https://www.apollon.com.cy/news/"
    ],
    "aris limassol": [
      "https://arisfc.com/",
      "https://arisfc.com/news/",
      "https://www.arisfc.com/"
    ],
    "enosis neon paralimni": [
      "https://enpfc.com/",
      "https://enpfc.com/news/",
      "https://www.enpfc.com/",
      "https://enosisneonparalimni.com/"
    ],
    "ethnikos achnas": [
      "https://ethnikosachnasfc.com/",
      "https://ethnikosachnasfc.com/news/",
      "https://www.ethnikosachnasfc.com/"
    ],
    "krasava": [
      "https://krasavafc.com/",
      "https://krasavafc.com/news/",
      "https://www.krasavafc.com/"
    ],
    "olympiakos nicosia": [
      "https://olympiakosnicosia.com/",
      "https://olympiakosnicosia.com/news/",
      "https://www.olympiakosnicosia.com/"
    ],
    "omonia aradippou": [
      "https://omonoiaaradippou.com/",
      "https://omonoiaaradippou.com/news/",
      "https://www.omonoiaaradippou.com/"
    ],
    "omonoia aradippou": [
      "https://omonoiaaradippou.com/",
      "https://omonoiaaradippou.com/news/",
      "https://www.omonoiaaradippou.com/"
    ],
    "omonia nicosia": [
      "https://www.omonoiafc.com.cy/",
      "https://omonoiafc.com.cy/",
      "https://www.omonoiafc.com.cy/news/"
    ],
    "omonoia nicosia": [
      "https://www.omonoiafc.com.cy/",
      "https://omonoiafc.com.cy/",
      "https://www.omonoiafc.com.cy/news/"
    ],
    "pafos": [
      "https://pafosfc.com.cy/",
      "https://pafosfc.com.cy/news/",
      "https://www.pafosfc.com.cy/"
    ]
  }
};

function genericCandidateUrlsForTeam(team) {
  const compact = slugifyHostPart(team);
  if (!compact || compact.length < 3) return [];

  return [
    `https://${compact}.com/`,
    `https://${compact}.com/news/`,
    `https://www.${compact}.com/`,
    `https://www.${compact}.com/news/`,
    `https://${compact}.com.cy/`,
    `https://${compact}.com.cy/news/`,
    `https://www.${compact}.com.cy/`,
    `https://www.${compact}.com.cy/news/`
  ];
}

function candidateUrlsForTeam(team) {
  const key = normalizeTeamKey(team);
  const map = LEAGUE_CANDIDATE_SOURCE_MAP[leagueSlug] || {};
  const mapped = map[key] || [];
  return [...new Set([...mapped, ...genericCandidateUrlsForTeam(team)])];
}

function stripHtmlForAudit(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function looksLikeTeamNewsAnchor(title, url) {
  const haystack = `${title || ""} ${url || ""}`.toLowerCase();
  return (
    /news|announcement|match|preview|squad|injury|training|press|team|fixture|αποστολή|απουσίες|τραυματ|προπόνηση|αγώνα|αγωνας|ανακοίνωση|νέα|ειδήσεις/i.test(haystack) ||
    /\/news\/[^/?#]+/i.test(url || "") ||
    /\/article\//i.test(url || "") ||
    /\/category\/news/i.test(url || "") ||
    /\/\d{4}\/\d{2}\//i.test(url || "")
  );
}

function inspectFetchedHtml(fetchResult) {
  const html = fetchResult?.body || "";
  const baseUrl = fetchResult?.finalUrl || fetchResult?.url || "";
  const baseHost = hostOf(baseUrl);
  const anchors = [];
  const seen = new Set();

  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = absoluteUrl(match[1], baseUrl);
    const title = stripHtmlForAudit(match[2]);
    if (!url || !title) continue;
    if (hostOf(url) !== baseHost) continue;

    const key = `${url} ${title}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    anchors.push({ title, url, interesting: looksLikeTeamNewsAnchor(title, url) });
  }

  return {
    textPreview: stripHtmlForAudit(html).slice(0, 260),
    anchorCount: anchors.length,
    interestingCount: anchors.filter(anchor => anchor.interesting).length,
    interestingAnchors: anchors.filter(anchor => anchor.interesting).slice(0, 12),
    firstAnchors: anchors.slice(0, 8)
  };
}

async function fetchUrlWithBody(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), fetchTimeoutMs);

  try {
    const started = Date.now();
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 Ai-MatchLab source-map-audit",
        "accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8"
      }
    });

    const body = await res.text();

    return {
      ok: true,
      url,
      finalUrl: res.url,
      status: res.status,
      contentType: res.headers.get("content-type"),
      elapsedMs: Date.now() - started,
      textLength: body.length,
      body
    };
  } catch (err) {
    return {
      ok: false,
      url,
      error: err?.name || err?.message || String(err)
    };
  } finally {
    clearTimeout(timer);
  }
}

function scoreCandidateFetch(fetchResult, inspection, candidateUrl) {
  if (!fetchResult?.ok) return 0;

  const statusScore = fetchResult.status >= 200 && fetchResult.status < 300 ? 30 : (fetchResult.status >= 300 && fetchResult.status < 400 ? 12 : 0);
  const sizeScore = Math.min(20, Math.floor((fetchResult.textLength || 0) / 5000));
  const anchorScore = Math.min(35, (inspection?.interestingCount || 0) * 3);
  const listingScore = /news|νέα|ειδήσεις|announcements/i.test(candidateUrl || "") ? 10 : 0;
  const badScore = /parked|domain|coming soon|connectyourdomain|for sale/i.test(inspection?.textPreview || "") ? -30 : 0;

  return statusScore + sizeScore + anchorScore + listingScore + badScore;
}

function candidateQualitySignals(candidate = {}) {
  const haystack = `${candidate.url || ""} ${candidate.finalUrl || ""} ${candidate.contentType || ""} ${candidate.textPreview || ""} ${(candidate.interestingAnchors || []).map(anchor => `${anchor.title || ""} ${anchor.url || ""}`).join(" ")}`.toLowerCase();
  const host = hostOf(candidate.finalUrl || candidate.url || "");

  return {
    host,
    okStatus: Number(candidate.status || 0) >= 200 && Number(candidate.status || 0) < 400,
    htmlLike: /html|xhtml/i.test(candidate.contentType || "") || !candidate.contentType,
    parkingOrSale: /hugedomains|sedo|dan\.com|afternic|namecheap|godaddy|parked|domain for sale|buy this domain|connectyourdomain|coming soon|under construction/i.test(haystack),
    weakPlaceholder: Number(candidate.textLength || 0) > 0 && Number(candidate.textLength || 0) < 1800 && Number(candidate.anchorCount || 0) < 4,
    newsListingUrl: /news|νέα|ειδήσεις|announcements|ανακοινώσεις/i.test(candidate.url || ""),
    enoughContent: Number(candidate.textLength || 0) >= 3500,
    hasAnchors: Number(candidate.anchorCount || 0) >= 5,
    hasInterestingAnchors: Number(candidate.interestingCount || 0) >= 2,
    hasAnyInterestingAnchor: Number(candidate.interestingCount || 0) >= 1,
    noiseHeavy: /tickets?|εισιτήρια|ticketing|shop|store|academy|ακαδημ|cantera|youth|women|femenino|sponsors?|χορηγ|board|διοικητικ|annual report|complaints|privacy|terms/i.test(haystack) && Number(candidate.interestingCount || 0) < 3
  };
}

function classifyBestCandidate(bestCandidate = null, candidateFetches = []) {
  if (!bestCandidate) {
    const hasFetchFailure = candidateFetches.some(row => row && row.ok === false);
    return {
      classification: hasFetchFailure ? "blocked_or_fetch_failed" : "needs_manual_source",
      registryReady: false,
      recommendedAction: hasFetchFailure ? "manual_check_or_add_known_official_source" : "find_official_source_manually",
      reasons: hasFetchFailure ? ["candidate_fetches_failed_or_timed_out"] : ["no_candidate_url_tested_successfully"]
    };
  }

  const signals = candidateQualitySignals(bestCandidate);
  const reasons = [];

  if (!signals.okStatus) reasons.push("non_2xx_3xx_status");
  if (!signals.htmlLike) reasons.push("non_html_content_type");
  if (signals.parkingOrSale) reasons.push("parking_or_domain_for_sale_signal");
  if (signals.weakPlaceholder) reasons.push("weak_placeholder_low_content_low_links");
  if (signals.noiseHeavy) reasons.push("noise_heavy_low_team_news_signal");
  if (!signals.enoughContent) reasons.push("low_content_length");
  if (!signals.hasAnyInterestingAnchor) reasons.push("no_team_news_like_anchors");

  if (signals.parkingOrSale) {
    return { classification: "parking_or_domain_for_sale", registryReady: false, recommendedAction: "do_not_add_find_manual_official_source", reasons, signals };
  }

  if (!signals.okStatus) {
    return { classification: "blocked_or_fetch_failed", registryReady: false, recommendedAction: "manual_check_or_find_alternate_source", reasons, signals };
  }

  if (signals.weakPlaceholder) {
    return { classification: "weak_placeholder", registryReady: false, recommendedAction: "do_not_add_without_manual_confirmation", reasons, signals };
  }

  if (signals.noiseHeavy) {
    return { classification: "noise_heavy", registryReady: false, recommendedAction: "manual_review_source_or_add_provider_guard", reasons, signals };
  }

  if (signals.newsListingUrl && signals.enoughContent && signals.hasAnyInterestingAnchor) {
    return { classification: "registry_ready", registryReady: true, recommendedAction: "add_official_registry_source", reasons: ["news_listing_url_with_fetchable_content_and_team_news_like_anchors"], signals };
  }

  if (signals.enoughContent && signals.hasInterestingAnchors) {
    return { classification: "registry_ready", registryReady: true, recommendedAction: "add_official_registry_source", reasons: ["fetchable_site_with_multiple_team_news_like_anchors"], signals };
  }

  if (signals.enoughContent && signals.hasAnyInterestingAnchor) {
    return { classification: "manual_review", registryReady: false, recommendedAction: "manual_review_before_registry_add", reasons, signals };
  }

  return { classification: "needs_manual_source", registryReady: false, recommendedAction: "find_official_source_manually", reasons, signals };
}

async function auditCandidateSources(rows) {
  let count = 0;

  for (const row of rows) {
    const urls = candidateUrlsForTeam(row.team);
    row.candidateUrls = urls;
    row.candidateFetches = [];
    row.bestCandidate = null;
    row.needsRegistrySource = row.officialSourceCount === 0;

    for (const url of urls) {
      if (count >= candidateFetchLimit) break;

      const fetched = await fetchUrlWithBody(url);
      count += 1;

      if (!fetched.ok) {
        row.candidateFetches.push(fetched);
        continue;
      }

      const inspection = inspectFetchedHtml(fetched);
      const summary = {
        ok: true,
        url: fetched.url,
        finalUrl: fetched.finalUrl,
        status: fetched.status,
        contentType: fetched.contentType,
        elapsedMs: fetched.elapsedMs,
        textLength: fetched.textLength,
        ...inspection
      };

      summary.score = scoreCandidateFetch(fetched, inspection, url);
      row.candidateFetches.push(summary);

      if (!row.bestCandidate || summary.score > row.bestCandidate.score) {
        row.bestCandidate = {
          url: summary.url,
          finalUrl: summary.finalUrl,
          status: summary.status,
          contentType: summary.contentType,
          textLength: summary.textLength,
          textPreview: summary.textPreview,
          anchorCount: summary.anchorCount,
          interestingCount: summary.interestingCount,
          score: summary.score,
          sampleInterestingAnchors: summary.interestingAnchors.slice(0, 6)
        };
      }
    }

    row.candidateQuality = classifyBestCandidate(row.bestCandidate, row.candidateFetches);
    row.bestCandidateClassification = row.candidateQuality.classification;
    row.bestCandidateRegistryReady = row.candidateQuality.registryReady;
    row.recommendedSourceAction = row.candidateQuality.recommendedAction;
  }

  return count;
}

async function fetchOfficialSources(rows) {
  let count = 0;

  for (const row of rows) {
    row.officialFetches = [];

    for (const source of row.officialSources) {
      if (count >= fetchLimit) break;
      if (!source.url) continue;

      row.officialFetches.push(await fetchUrl(source.url));
      count += 1;
    }
  }

  return count;
}

const teams = new Map();
collectFixturesAndSnapshots(teams);
collectStandings(teams);
collectCoverageBacklog(teams);

const rows = [...teams.values()]
  .sort((a, b) => a.team.localeCompare(b.team))
  .map(team => {
    const sources = getTeamNewsSourcesForTask({ leagueSlug, team: team.team, opponent: "" });
    const officialSources = uniqueByUrl(sources.filter(isOfficialSource).map(summarizeSource));
    const registrySources = uniqueByUrl(sources.map(summarizeSource));

    return {
      team: team.team,
      aliasesSeen: [...team.aliasesSeen].sort(),
      sourceHits: [...team.sourceHits.entries()].sort((a, b) => b[1] - a[1]).map(([source, count]) => ({ source, count })),
      sampleMatches: team.sampleMatches.slice(0, 8),
      registrySourceCount: registrySources.length,
      officialSourceCount: officialSources.length,
      officialSources,
      nonOfficialSources: registrySources.filter(source => !isOfficialSource(source)).slice(0, 8),
      status: officialSources.length > 0 ? "has_official_source" : "missing_official_source"
    };
  });

if (shouldFetch) {
  await fetchOfficialSources(rows);
}

let candidateFetchCount = 0;
if (shouldAuditCandidateMap) {
  candidateFetchCount = await auditCandidateSources(rows);
}

const missingOfficial = rows.filter(row => row.officialSourceCount === 0).map(row => row.team);
const withOfficial = rows.filter(row => row.officialSourceCount > 0).map(row => row.team);
const candidateClassifications = {};
for (const row of rows) {
  const key = row.bestCandidateClassification || (row.officialSourceCount > 0 ? "has_official_source" : "not_audited");
  candidateClassifications[key] = (candidateClassifications[key] || 0) + 1;
}
const registryReadyTeams = rows.filter(row => row.bestCandidateRegistryReady).map(row => row.team);
const manualSourceTeams = rows.filter(row => row.needsRegistrySource && !row.bestCandidateRegistryReady).map(row => row.team);
const outputPath = resolveDataPath("team-news", "_source-map-audits", `${leagueSlug}.json`);

const payload = {
  ok: true,
  leagueSlug,
  generatedAt: new Date().toISOString(),
  options: {
    fetch: shouldFetch,
    candidateMap: shouldAuditCandidateMap,
    fetchLimit,
    candidateFetchLimit,
    fetchTimeoutMs
  },
  summary: {
    teamCount: rows.length,
    withOfficialSourceCount: withOfficial.length,
    missingOfficialSourceCount: missingOfficial.length,
    candidateClassifications,
    registryReadyCount: registryReadyTeams.length,
    manualSourceCount: manualSourceTeams.length,
    withOfficial,
    missingOfficial,
    registryReadyTeams,
    manualSourceTeams
  },
  rows
};

writeJson(outputPath, payload);

console.log(JSON.stringify({
  ok: true,
  leagueSlug,
  outputPath: path.relative(ROOT_DIR, outputPath).replace(/\\/g, "/"),
  summary: payload.summary,
  fetched: shouldFetch ? rows.reduce((sum, row) => sum + (Array.isArray(row.officialFetches) ? row.officialFetches.length : 0), 0) : 0,
  candidateFetched: candidateFetchCount
}, null, 2));
