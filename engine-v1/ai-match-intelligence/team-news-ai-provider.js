import { getTeamNewsSourcesForTask } from "./team-news-source-registry.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function buildUnresolved(reason, extra = {}) {
  return {
    status: "unresolved",
    absences: [],
    notes: [],
    evidence: [],
    reason,
    ...extra
  };
}

function buildPrompt(task) {
  const team = normalizeText(task?.target?.team);
  const opponent = normalizeText(task?.target?.opponent);
  const side = normalizeText(task?.target?.side);
  const match = task?.match || {};

  return {
    team,
    opponent,
    side,
    leagueSlug: normalizeText(match?.leagueSlug),
    kickoffUtc: normalizeText(match?.kickoffUtc),
    venue: normalizeText(match?.venue),
    query: [
      team,
      opponent,
      normalizeText(match?.leagueSlug),
      "team news injuries suspensions expected lineup"
    ].filter(Boolean).join(" ")
  };
}

function decodeHtml(value) {
  return normalizeText(value)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

function stripHtml(value) {
  return decodeHtml(
    normalizeText(value)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
  );
}

function decodeMaybeBase64Url(value) {
  const raw = normalizeText(value);
  if (!raw) return null;

  try {
    const padded = raw + "=".repeat((4 - (raw.length % 4)) % 4);
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    if (/^https?:\/\//i.test(decoded)) return decoded;
  } catch {
    return null;
  }

  return null;
}

function normalizeUrl(value) {
  const raw = normalizeText(value);
  if (!raw) return null;

  try {
    const decoded = decodeURIComponent(raw);

    const ddgMatch = decoded.match(/[?&]uddg=([^&]+)/i);
    if (ddgMatch) {
      const target = decodeURIComponent(ddgMatch[1]);
      const url = new URL(target);
      if (!/^https?:$/.test(url.protocol)) return null;
      url.hash = "";
      return url.toString();
    }

    const bingMatch = decoded.match(/[?&]u=([^&]+)/i);
    if (bingMatch) {
      let target = decodeURIComponent(bingMatch[1]);

      if (target.startsWith("a1")) {
        const maybeDecoded = decodeMaybeBase64Url(target.slice(2));
        if (maybeDecoded) target = maybeDecoded;
      }

      const url = new URL(target);
      if (!/^https?:$/.test(url.protocol)) return null;
      url.hash = "";
      return url.toString();
    }

    const url = new URL(decoded);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function getPublisherFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

const BLOCKED_SOURCE_DOMAIN_PATTERNS = [
  /(^|\.)pornhub\./i,
  /(^|\.)theporndude\./i,
  /(^|\.)xvideos\./i,
  /(^|\.)xnxx\./i,
  /(^|\.)redtube\./i,
  /(^|\.)youporn\./i,
  /(^|\.)xhamster\./i,
  /(^|\.)spankbang\./i,
  /(^|\.)tube8\./i,
  /(^|\.)adult/i,
  /(^|\.)casino/i,
  /(^|\.)bet365\./i,
  /(^|\.)1xbet\./i
];

function isBlockedSourceDomain(urlOrDomain) {
  const raw = normalizeText(urlOrDomain);
  if (!raw) return false;

  let host = raw;

  try {
    host = new URL(raw).hostname;
  } catch {
    host = raw;
  }

  host = host.replace(/^www\./i, "").toLowerCase();

  return BLOCKED_SOURCE_DOMAIN_PATTERNS.some(pattern => pattern.test(host));
}

function isBlockedNoisePublisher(urlOrPublisher) {
  const value = normalizeText(urlOrPublisher).toLowerCase();

  return (
    value.includes("baidu.com") ||
    value.includes("zhidao.baidu.com") ||
    value.includes("zhihu.com") ||
    value.includes("pinterest.") ||
    value.includes("facebook.com") ||
    value.includes("x.com") ||
    value.includes("twitter.com") ||
    value.includes("reddit.com") ||
    value.includes("github.com") ||
    value.includes("frontporchforum.com") ||
    value.includes("openai.com") ||
    value.includes("npmjs.com") ||
    value.includes("stackoverflow.com")
  );
}

function isSearchPageSource(source) {
  const title = normalizeText(source?.title).toLowerCase();
  const url = normalizeText(source?.url).toLowerCase();
  const sourceType = normalizeText(source?.sourceType || source?.type).toLowerCase();

  return (
    sourceType === "search_url" ||
    title.includes("search result") ||
    title.includes("search results") ||
    title.includes("transfermarkt search") ||
    url.includes("/search/") ||
    url.includes("/schnellsuche/") ||
    url.includes("schnellsuche") ||
    url.includes("search?") ||
    url.includes("?q=") ||
    url.includes("?query=")
  );
}

function normalizeSourceItem(item = {}) {
  const url = normalizeUrl(item?.url || item?.href);

  const title = normalizeText(item?.title || item?.label);

  const publisher = normalizeText(
    item?.publisher ||
    item?.site ||
    item?.domain ||
    getPublisherFromUrl(url)
  );

  if (
    isBlockedSourceDomain(url) ||
    isBlockedSourceDomain(publisher) ||
    isBlockedNoisePublisher(url) ||
    isBlockedNoisePublisher(publisher) ||
    isSearchPageSource({
      title,
      url,
      publisher,
      sourceType: item?.sourceType || item?.type
    })
  ) {
    return null;
  }
  const publishedAt = normalizeText(item?.publishedAt || item?.date);

  const text = normalizeText(
    item?.text ||
    item?.snippet ||
    item?.body
  );

  if (!title && !url && !publisher && !text) {
    return null;
  }

  return {
    title: title || null,
    url: url || null,
    publisher: publisher || null,
    publishedAt: publishedAt || null,
    text: text || null,

    sourceMode: item?.sourceMode || null,
    sourceId: item?.sourceId || item?.id || null,
    sourceType: item?.sourceType || item?.type || null,
    trustTier: item?.trustTier || null,
    query: item?.query || null
  };
}
function hasRealSource(item = {}) {
  const source = normalizeSourceItem(item);
  return !!(source?.url && (source?.title || source?.text || source?.publisher));
}

function candidateLooksLikeFootballSearchHit(source, input) {
  const title = normalizeText(source?.title);
  const url = normalizeText(source?.url);
  const publisher = normalizeText(source?.publisher);

  if (
    isBlockedNoisePublisher(url) ||
    isBlockedNoisePublisher(publisher) ||
    isSearchPageSource(source)
  ) {
    return false;
  }

  const haystack = [
    title,
    url,
    publisher
  ].filter(Boolean).join(" ").toLowerCase();

  const team = normalizeText(input?.team).toLowerCase();
  const opponent = normalizeText(input?.opponent).toLowerCase();

  if (!haystack || !team) return false;

  if (isBlockedSourceDomain(url) || isBlockedSourceDomain(publisher)) return false;

  const hasTeam = haystack.includes(team);
  const hasOpponent = opponent ? haystack.includes(opponent) : false;

  const hasFootballSignal =
    /\bfootball\b/i.test(haystack) ||
    /\bsoccer\b/i.test(haystack) ||
    /\bfutbol\b/i.test(haystack) ||
    /\bfútbol\b/i.test(haystack) ||
    /\bteam-news\b/i.test(haystack) ||
    /\bpreview\b/i.test(haystack) ||
    /\binjur/i.test(haystack) ||
    /\bsuspend/i.test(haystack) ||
    /\blineup\b/i.test(haystack) ||
    /\bsquad\b/i.test(haystack) ||
    /\bmatch\b/i.test(haystack) ||
    /\bfc\b/i.test(haystack);

  const blockedNoise =
    /\bapp store\b/i.test(haystack) ||
    /\bgoogle play\b/i.test(haystack) ||
    /\bbank\b/i.test(haystack) ||
    /\bcasino\b/i.test(haystack) ||
    /\bdownload\b/i.test(haystack);

  if (blockedNoise && !hasTeam && !hasOpponent) return false;

  return hasTeam || hasOpponent || hasFootballSignal;
}

function sourceLooksRelevant(source, input) {
  const normalizedSource = normalizeSourceItem(source);
  if (!normalizedSource) return false;

  const haystack = normalizeText([
    normalizedSource.title,
    normalizedSource.publisher,
    normalizedSource.url,
    normalizedSource.text
  ].filter(Boolean).join(" ")).toLowerCase();

  const team = normalizeText(input?.team).toLowerCase();
  const opponent = normalizeText(input?.opponent).toLowerCase();

  if (!haystack || !team) return false;

  const isRegistrySource =
    normalizedSource.sourceMode === "registry" ||
    normalizedSource.query === "registry";

  const isDirectSource =
    normalizedSource.sourceMode === "direct" ||
    normalizedSource.query === "direct" ||
    /^direct_/i.test(normalizedSource.sourceType || "");

  const isTrustedRegistrySource =
    isRegistrySource &&
    (
      normalizedSource.trustTier === "official" ||
      normalizedSource.trustTier === "league" ||
      normalizedSource.trustTier === "reference"
    );

  const isTrustedDirectSource =
    isDirectSource &&
    (
      normalizedSource.trustTier === "official" ||
      normalizedSource.trustTier === "league" ||
      normalizedSource.trustTier === "local_media" ||
      normalizedSource.trustTier === "reference"
    );

  const hasTeam = haystack.includes(team);

  const hasOpponent = opponent
    ? haystack.includes(opponent)
    : true;

  const hasTeamNewsSignal =
    /team news|injur|suspend|lineup|line-up|starting xi|absent|doubt|fitness|squad|convocados|lesion|lesión|sancion|alineaci|noticias|plantel|convocatoria|previa|bajas|citados|n[oó]mina|formaci[oó]n|once inicial|tropp|skader|lagoppstilling/i.test(haystack);

  const isSearchUrl =
    normalizedSource.sourceType === "search_url" ||
    /\/search\b|\/schnellsuche\b|\?q=|\?query=|\?s=/i.test(normalizedSource.url || "");

  const isOfficialOrLeague =
    normalizedSource.trustTier === "official" ||
    normalizedSource.trustTier === "league";

  const isArticleLike =
    normalizedSource.sourceType === "registry_article" ||
    /\/news\/|\/noticias\/|\/previa-|\/preview-|\/match-|\/article\/|\/actualidad\/|\/futbol\/|\/club\/|\/equipo\//i.test(normalizedSource.url || "");

  const textLength = normalizeText(normalizedSource.text).length;

  if (isSearchUrl) {
    return false;
  }

  if (isTrustedRegistrySource && isOfficialOrLeague && hasTeam && textLength >= 120) {
    return true;
  }

  if (isTrustedRegistrySource && isArticleLike && textLength >= 120 && (hasTeam || hasOpponent || hasTeamNewsSignal)) {
    return true;
  }

  if (isTrustedRegistrySource && hasTeam && (hasOpponent || hasTeamNewsSignal)) {
    return true;
  }

  if (isTrustedDirectSource && isOfficialOrLeague && hasTeam && textLength >= 120) {
    return true;
  }

  if (isTrustedDirectSource && hasTeam && (hasOpponent || hasTeamNewsSignal)) {
    return true;
  }

  return hasTeam && hasTeamNewsSignal;
}

async function fetchTextResult(url, { timeoutMs = 10000, maxChars = 120000 } = {}) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
        "accept-language": "en-US,en;q=0.9,el;q=0.7,es;q=0.7,pt;q=0.7",
        "cache-control": "no-cache",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
      }
    });

    const contentType = normalizeText(res.headers.get("content-type")).toLowerCase();
    const finalUrl = res.url || url;

    if (!res.ok) {
      return {
        ok: false,
        url,
        finalUrl,
        status: res.status,
        statusText: res.statusText,
        contentType,
        text: null,
        textLength: 0,
        durationMs: Date.now() - startedAt,
        reason: "http_not_ok"
      };
    }

    if (
      contentType &&
      !contentType.includes("text/") &&
      !contentType.includes("html") &&
      !contentType.includes("xml")
    ) {
      return {
        ok: false,
        url,
        finalUrl,
        status: res.status,
        statusText: res.statusText,
        contentType,
        text: null,
        textLength: 0,
        durationMs: Date.now() - startedAt,
        reason: "unsupported_content_type"
      };
    }

    const text = await res.text();
    const clipped = text.slice(0, maxChars);

    return {
      ok: true,
      url,
      finalUrl,
      status: res.status,
      statusText: res.statusText,
      contentType,
      text: clipped,
      textLength: clipped.length,
      durationMs: Date.now() - startedAt,
      reason: null
    };
  } catch (error) {
    const isAbort = error?.name === "AbortError";

    return {
      ok: false,
      url,
      finalUrl: null,
      status: null,
      statusText: null,
      contentType: null,
      text: null,
      textLength: 0,
      durationMs: Date.now() - startedAt,
      reason: isAbort ? "timeout" : "fetch_error",
      errorName: error?.name || null,
      errorMessage: error?.message || String(error || "")
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, options = {}) {
  const result = await fetchTextResult(url, options);
  return result.ok ? result.text : null;
}

function parseDuckDuckGoResults(html) {
  const out = [];
  const safeHtml = String(html || "");

  const resultRe = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of safeHtml.matchAll(resultRe)) {
    const url = normalizeUrl(decodeHtml(match[1]));
    const title = stripHtml(match[2]);
    if (!url || !title) continue;
    out.push({ title, url, publisher: getPublisherFromUrl(url), text: null });
    if (out.length >= 8) break;
  }

  if (out.length > 0) return out;

  const hrefRe = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of safeHtml.matchAll(hrefRe)) {
    const url = normalizeUrl(decodeHtml(match[1]));
    const title = stripHtml(match[2]);
    if (!url || !title) continue;
    if (/duckduckgo\.com/i.test(url)) continue;
    out.push({ title, url, publisher: getPublisherFromUrl(url), text: null });
    if (out.length >= 8) break;
  }

  return out;
}

function parseBingResults(html) {
  const out = [];
  const safeHtml = String(html || "");

  const blockRe = /<li[^>]+class="[^"]*b_algo[^"]*"[\s\S]*?<\/li>/gi;

  for (const blockMatch of safeHtml.matchAll(blockRe)) {
    const block = blockMatch[0];
    const linkMatch = block.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;

    const url = normalizeUrl(decodeHtml(linkMatch[1]));
    const title = stripHtml(linkMatch[2]);
    if (!url || !title) continue;
    if (isBlockedSourceDomain(url)) continue;

    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const snippet = snippetMatch ? stripHtml(snippetMatch[1]) : null;

    out.push({
      title,
      url,
      publisher: getPublisherFromUrl(url),
      text: snippet
    });

    if (out.length >= 8) break;
  }

  return out;
}

function parseDuckDuckGoLiteResults(html) {
  const out = [];
  const safeHtml = String(html || "");

  const linkRe = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of safeHtml.matchAll(linkRe)) {
    const href = decodeHtml(match[1]);
    const title = stripHtml(match[2]);
    const url = normalizeUrl(href);

    if (!url || !title) continue;
    if (/duckduckgo\.com/i.test(url)) continue;
    if (title.length < 4) continue;

    out.push({
      title,
      url,
      publisher: getPublisherFromUrl(url),
      text: null
    });

    if (out.length >= 8) break;
  }

  return out;
}

function normalizeLinkedUrl(href, baseUrl) {
  const raw = normalizeText(href);

  if (!raw) {
    return null;
  }

  if (
    raw.startsWith("#") ||
    raw.startsWith("mailto:") ||
    raw.startsWith("tel:") ||
    raw.startsWith("javascript:")
  ) {
    return null;
  }

  try {
    const url = new URL(decodeHtml(raw), baseUrl);

    if (!/^https?:$/.test(url.protocol)) {
      return null;
    }

    url.hash = "";

    return url.toString();
  } catch {
    return null;
  }
}

function getRegistryArticleTeamAliases(teamName) {
  const raw = normalizeText(teamName).toLowerCase();
  const aliases = new Set();

  if (!raw) {
    return [];
  }

  aliases.add(raw);

  const compact = raw.replace(/[^a-z0-9]+/g, "");

  if (compact === "kaizerchiefs") {
    aliases.add("chiefs");
    aliases.add("amakhosi");
    aliases.add("kaizer-chiefs");
    aliases.add("kaizer chiefs");
  }

  if (compact === "orlandopirates") {
    aliases.add("pirates");
    aliases.add("bucs");
    aliases.add("orlando-pirates");
    aliases.add("orlando pirates");
  }

  if (compact === "mamelodisundowns") {
    aliases.add("sundowns");
    aliases.add("masandawana");
    aliases.add("mamelodi-sundowns");
    aliases.add("mamelodi sundowns");
  }

  if (compact === "richardsbay") {
    aliases.add("richards-bay");
    aliases.add("richards bay");
    aliases.add("richards bay fc");
  }

  if (compact === "tsgalaxy") {
    aliases.add("ts-galaxy");
    aliases.add("ts galaxy");
    aliases.add("ts galaxy fc");
  }

  if (compact === "polokwanecity") {
    aliases.add("polokwane-city");
    aliases.add("polokwane city");
    aliases.add("polokwane city fc");
  }

  if (compact === "stellenbosch") {
    aliases.add("stellenbosch fc");
    aliases.add("stellies");
  }

  return Array.from(aliases).filter(alias => alias.length >= 4);
}

function registryArticleHaystackIncludesAny(haystack, aliases = []) {
  const value = normalizeText(haystack).toLowerCase();

  if (!value) {
    return false;
  }

  return aliases.some(alias => value.includes(normalizeText(alias).toLowerCase()));
}

function shouldKeepRegistryArticleLink(link, input) {
  const title = normalizeText(link?.title);
  const url = normalizeText(link?.url);

  const haystack = [
    title,
    url
  ].filter(Boolean).join(" ").toLowerCase();

  const teamAliases = getRegistryArticleTeamAliases(input?.team);
  const opponentAliases = getRegistryArticleTeamAliases(input?.opponent);

  if (!haystack || teamAliases.length === 0) {
    return false;
  }

  const blockedNavTitle =
    /^(home|news|latest news|fixtures|results|standings|table|tickets|shop|store|club|team|squad|players|contact|media|videos|gallery|login|register|search|about|history|academy|development|membership)$/i.test(title) ||
    /^(el equipo|club|plantel masculino|plantel femenino|fútbol joven|futbol joven|ramas deportivas|escuelas oficiales|noticias|contacto|socios|tienda|iniciar sesión|iniciar sesion|buscar|fútbol masculino|futbol masculino|fútbol femenino|futbol femenino)$/i.test(title);

  const blockedCategoryUrl =
    /\/category\/(campeonato-masculino|campeonato-femenino|futbol-joven|fútbol-joven)\/?$/i.test(url) ||
    /\/futbol-joven\/?$/i.test(url) ||
    /\/noticias\/?$/i.test(url) ||
    /\/news\/?$/i.test(url) ||
    /\/media\/?$/i.test(url) ||
    /\/fixtures\/?$/i.test(url) ||
    /\/results\/?$/i.test(url) ||
    /\/squad\/?$/i.test(url) ||
    /\/team\/?$/i.test(url) ||
    /\/team-news\/?$/i.test(url) ||
    /\/team-news\/articles\/?$/i.test(url) ||
    /\/articles\/?$/i.test(url);

  const blockedSoftContent =
    /\b(birthday|anniversary|century|100\s+not\s+out|wallpaper|gallery|photos|pictures|tickets|store|shop|competition|giveaway)\b/i.test(haystack);

  if (blockedNavTitle || blockedCategoryUrl || blockedSoftContent) {
    return false;
  }

  const hasTeam = registryArticleHaystackIncludesAny(haystack, teamAliases);
  const hasOpponent = registryArticleHaystackIncludesAny(haystack, opponentAliases);

  const isPslMatchcentreDetail =
    /psl\.co\.za\/matchcentre\/detail\//i.test(url);

  if (isPslMatchcentreDetail && !(hasTeam && hasOpponent)) {
    return false;
  }

  if (isPslMatchcentreDetail && /^match summary$/i.test(title)) {
    return false;
  }

  const hasStrongArticleSignal =
    /\bpreview\b/i.test(haystack) ||
    /\bmatch\s+preview\b/i.test(haystack) ||
    /\bteam\s+news\b/i.test(haystack) ||
    /\bline[-\s]?up\b/i.test(haystack) ||
    /\bstarting\s+xi\b/i.test(haystack) ||
    /\bsquad\b/i.test(haystack) ||
    /\binjury\b/i.test(haystack) ||
    /\binjuries\b/i.test(haystack) ||
    /\binjured\b/i.test(haystack) ||
    /\bsuspended\b/i.test(haystack) ||
    /\bsuspension\b/i.test(haystack) ||
    /\bunavailable\b/i.test(haystack) ||
    /\bdoubtful\b/i.test(haystack) ||
    /\bvs\b/i.test(haystack) ||
    /\bversus\b/i.test(haystack) ||
    /\bprevia\b/i.test(haystack) ||
    /\bfecha\b/i.test(haystack) ||
    /\bjornada\b/i.test(haystack) ||
    /\bconvocados\b/i.test(haystack) ||
    /\bconvocatoria\b/i.test(haystack) ||
    /\bn[oó]mina\b/i.test(haystack) ||
    /\balineaci[oó]n\b/i.test(haystack) ||
    /\blesi[oó]n\b/i.test(haystack) ||
    /\blesionados\b/i.test(haystack) ||
    /\bsuspendidos\b/i.test(haystack) ||
    /\bbajas\b/i.test(haystack);

  return (
    (hasTeam && hasOpponent) ||
    (hasTeam && hasStrongArticleSignal) ||
    (hasOpponent && hasStrongArticleSignal)
  );
}

function scoreRegistryArticleLink(link, input) {
  const title = normalizeText(link?.title).toLowerCase();
  const url = normalizeText(link?.url).toLowerCase();

  const haystack = [
    title,
    url
  ].filter(Boolean).join(" ");

  const teamAliases = getRegistryArticleTeamAliases(input?.team);
  const opponentAliases = getRegistryArticleTeamAliases(input?.opponent);

  let score = 0;

  if (registryArticleHaystackIncludesAny(haystack, teamAliases)) {
    score += 5;
  }

  if (registryArticleHaystackIncludesAny(haystack, opponentAliases)) {
    score += 7;
  }

  if (/\bpreview\b|\bmatch\s+preview\b/i.test(haystack)) {
    score += 10;
  }

  if (/\bteam\s+news\b|\bline[-\s]?up\b|\bstarting\s+xi\b|\bsquad\b/i.test(haystack)) {
    score += 10;
  }

  if (/\binjury\b|\binjuries\b|\binjured\b|\bsuspended\b|\bsuspension\b|\bunavailable\b|\bdoubtful\b/i.test(haystack)) {
    score += 12;
  }

  if (/\bvs\b|\bversus\b/i.test(haystack)) {
    score += 5;
  }

  if (/\bprevia\b/i.test(haystack)) {
    score += 8;
  }

  if (/\bfecha\b|\bjornada\b/i.test(haystack)) {
    score += 4;
  }

  if (/convocados|convocatoria|n[oó]mina|citados|alineaci[oó]n|formaci[oó]n|lesion|lesi[oó]n|suspend|bajas/i.test(haystack)) {
    score += 10;
  }

  if (/\/category\//i.test(url)) {
    score -= 6;
  }

  if (
    /\/noticias\/?$/i.test(url) ||
    /\/news\/?$/i.test(url) ||
    /\/media\/?$/i.test(url) ||
    /\/team-news\/?$/i.test(url) ||
    /\/team-news\/articles\/?$/i.test(url) ||
    /\/articles\/?$/i.test(url)
  ) {
    score -= 30;
  }

  if (/psl\.co\.za\/matchcentre\/detail\//i.test(url) && /^match summary$/i.test(title)) {
    score -= 50;
  }

  if (/\/futbol-joven\/?$/i.test(url)) {
    score -= 6;
  }

  if (/\b(birthday|anniversary|century|100\s+not\s+out|wallpaper|gallery|tickets|store|shop|giveaway)\b/i.test(haystack)) {
    score -= 20;
  }

  return score;
}

function extractRegistryArticleLinksFromHtml(html, baseUrl, row, input) {
  const collected = [];
  const safeHtml = String(html || "");

  let baseHost = null;

  try {
    baseHost = new URL(baseUrl).hostname.replace(/^www\./i, "");
  } catch {
    baseHost = null;
  }

  const seen = new Set();

  const linkRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of safeHtml.matchAll(linkRe)) {
    const url = normalizeLinkedUrl(match[1], baseUrl);
    const title = stripHtml(match[2]);

    if (!url || !title) {
      continue;
    }

    let host = null;

    try {
      host = new URL(url).hostname.replace(/^www\./i, "");
    } catch {
      host = null;
    }

    if (baseHost && host && host !== baseHost) {
      continue;
    }

    if (/\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|rar)$/i.test(url)) {
      continue;
    }

    const key = url.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    const link = {
      title,
      url,
      publisher: getPublisherFromUrl(url),
      sourceMode: "registry",
      sourceId: `${row.id}:article`,
      sourceType: "registry_article",
      trustTier: row.trustTier,
      parentSourceId: row.id,
      parentUrl: baseUrl
    };

    if (!shouldKeepRegistryArticleLink(link, input)) {
      continue;
    }

    collected.push({
      ...link,
      score: scoreRegistryArticleLink(link, input)
    });
  }

  return collected
    .filter(link => link.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ score, ...link }) => link);
}
async function fetchRegistrySources(input) {
  const registryRows = getTeamNewsSourcesForTask(input);
  const maxRegistrySources = clamp(process.env.AIML_TEAM_NEWS_MAX_REGISTRY_SOURCES || 3, 1, 6);
  const registryFetchTimeoutMs = clamp(process.env.AIML_TEAM_NEWS_REGISTRY_FETCH_TIMEOUT_MS || 2500, 1000, 8000);

  const diagnostics = {
    registrySourceCount: registryRows.length,
    fetchedRegistryCount: 0,
    usableRegistryCount: 0,
    registrySamples: registryRows.slice(0, 8).map(row => ({
      id: row.id,
      label: row.label,
      type: row.type,
      trustTier: row.trustTier,
      url: row.url
    })),
    registryTextSamples: [],
    registryArticleSamples: []
  };
  const out = [];

  for (const row of registryRows.slice(0, maxRegistrySources)) {
    if (isSearchPageSource({
      title: row.label,
      url: row.url,
      sourceType: row.type
    })) {
      if (diagnostics.registryTextSamples.length < 6) {
        diagnostics.registryTextSamples.push({
          id: row.id,
          label: row.label,
          type: row.type,
          trustTier: row.trustTier,
          url: row.url,
          fetched: false,
          skipped: true,
          skipReason: "search_page_source_not_team_news"
        });
      }
      continue;
    }

    const fetchResult = await fetchTextResult(row.url, {
      timeoutMs: registryFetchTimeoutMs,
      maxChars: 90000
    });

    const html = fetchResult.ok ? fetchResult.text : null;
    diagnostics.fetchedRegistryCount += html ? 1 : 0;

    const text = html
      ? stripHtml(html).slice(0, 8000)
      : "";

    if (diagnostics.registryTextSamples.length < 6) {
      diagnostics.registryTextSamples.push({
        id: row.id,
        label: row.label,
        type: row.type,
        trustTier: row.trustTier,
        url: row.url,
        fetched: !!html,
        fetchStatus: fetchResult.status,
        fetchReason: fetchResult.reason,
        fetchContentType: fetchResult.contentType,
        fetchDurationMs: fetchResult.durationMs,
        fetchFinalUrl: fetchResult.finalUrl,
        fetchErrorName: fetchResult.errorName || null,
        fetchErrorMessage: fetchResult.errorMessage || null,
        textLength: text.length,
        textPreview: text
          .replace(/\s+/g, " ")
          .slice(0, 700)
      });
    }

    const source = normalizeSourceItem({
      title: row.label,
      url: row.url,
      publisher: getPublisherFromUrl(row.url),
      text,
      sourceMode: "registry",
      sourceId: row.id,
      sourceType: row.type,
      trustTier: row.trustTier
    });

    const articleLinks = html
      ? extractRegistryArticleLinksFromHtml(html, row.url, row, input)
      : [];

    for (const articleLink of articleLinks) {
      const articleFetchResult = await fetchTextResult(articleLink.url, {
        timeoutMs: 5000,
        maxChars: 120000
      });

      const articleHtml = articleFetchResult.ok ? articleFetchResult.text : null;

      const articleText = articleHtml
        ? stripHtml(articleHtml).slice(0, 9000)
        : "";

      if (diagnostics.registryArticleSamples.length < 8) {
        diagnostics.registryArticleSamples.push({
          title: articleLink.title,
          url: articleLink.url,
          publisher: articleLink.publisher,
          parentUrl: articleLink.parentUrl,
          fetched: !!articleHtml,
          fetchStatus: articleFetchResult.status,
          fetchReason: articleFetchResult.reason,
          fetchContentType: articleFetchResult.contentType,
          fetchDurationMs: articleFetchResult.durationMs,
          fetchFinalUrl: articleFetchResult.finalUrl,
          fetchErrorName: articleFetchResult.errorName || null,
          fetchErrorMessage: articleFetchResult.errorMessage || null,
          textLength: articleText.length,
          textPreview: articleText
            .replace(/\s+/g, " ")
            .slice(0, 900)
        });
      }

      if (articleText.length < 120) {
        continue;
      }

      const articleSource = normalizeSourceItem({
        title: articleLink.title,
        url: articleLink.url,
        publisher: articleLink.publisher,
        text: articleText,
        sourceMode: "registry",
        sourceId: articleLink.sourceId,
        sourceType: articleLink.sourceType,
        trustTier: articleLink.trustTier
      });

      if (!articleSource) {
        continue;
      }

      diagnostics.usableRegistryCount += 1;

      out.push(articleSource);
    }

    if (!source) continue;

    const compact = [
      source.title,
      source.publisher,
      source.text
    ].filter(Boolean).join(" ");

    if (normalizeText(compact).length < 80) continue;

    diagnostics.usableRegistryCount += 1;

    out.push({
      ...source,
      sourceMode: "registry",
      sourceId: row.id,
      sourceType: row.type,
      trustTier: row.trustTier
    });
  }

  return {
    sources: out,
    diagnostics
  };
}

async function searchWeb(query) {
  const attempts = [];
  const searchFetchTimeoutMs = clamp(process.env.AIML_TEAM_NEWS_SEARCH_FETCH_TIMEOUT_MS || 2500, 1000, 8000);

  const ddgHtmlUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const ddgHtml = await fetchText(ddgHtmlUrl, { timeoutMs: searchFetchTimeoutMs, maxChars: 120000 });
  const ddgRows = ddgHtml ? parseDuckDuckGoResults(ddgHtml) : [];

  attempts.push({
    engine: "duckduckgo_html",
    ok: !!ddgHtml,
    htmlLength: ddgHtml ? ddgHtml.length : 0,
    resultCount: ddgRows.length
  });

  if (ddgRows.length > 0) {
    return { rows: ddgRows, attempts };
  }

  const ddgLiteUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
  const ddgLiteHtml = await fetchText(ddgLiteUrl, { timeoutMs: searchFetchTimeoutMs, maxChars: 120000 });
  const ddgLiteRows = ddgLiteHtml ? parseDuckDuckGoLiteResults(ddgLiteHtml) : [];

  attempts.push({
    engine: "duckduckgo_lite",
    ok: !!ddgLiteHtml,
    htmlLength: ddgLiteHtml ? ddgLiteHtml.length : 0,
    resultCount: ddgLiteRows.length
  });

  if (ddgLiteRows.length > 0) {
    return { rows: ddgLiteRows, attempts };
  }

  const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  const bingHtml = await fetchText(bingUrl, { timeoutMs: searchFetchTimeoutMs, maxChars: 120000 });
  const bingRows = bingHtml ? parseBingResults(bingHtml) : [];

  attempts.push({
    engine: "bing_html",
    ok: !!bingHtml,
    htmlLength: bingHtml ? bingHtml.length : 0,
    resultCount: bingRows.length
  });

  return {
    rows: bingRows,
    attempts
  };
}


function slugifyUrlPart(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function compactTeamKey(value) {
  return slugifyUrlPart(value).replace(/-/g, "");
}

function buildDirectTeamNewsSources(input) {
  const team = normalizeText(input?.team);
  const opponent = normalizeText(input?.opponent);
  const leagueSlug = normalizeText(input?.leagueSlug);
  const teamKey = compactTeamKey(team);
  const opponentKey = compactTeamKey(opponent);
  const rows = [];

  function add(row) {
    const url = normalizeUrl(row?.url);
    if (!url) return;
    if (isBlockedSourceDomain(url) || isBlockedNoisePublisher(url)) return;

    rows.push({
      title: row.title,
      url,
      publisher: getPublisherFromUrl(url),
      sourceMode: "direct",
      sourceId: row.sourceId,
      sourceType: row.sourceType || "direct_page",
      trustTier: row.trustTier || "reference",
      targetTeam: team,
      opponent,
      leagueSlug
    });
  }

  function addTeamSourceSet(countryKey, clubKey, urls, trustTier = "official") {
    for (const [title, url, sourceType] of urls) {
      add({
        title,
        url,
        sourceType,
        sourceId: `direct:${countryKey}:${clubKey}:${sourceType}`,
        trustTier
      });
    }
  }

  if (/^mex\./i.test(leagueSlug) || /\b(Puebla|Quer[eé]taro|Queretaro)\b/i.test(`${team} ${opponent}`)) {
    const mexicoTeams = {
      puebla: [
        ["Puebla official site", "https://www.clubpuebla.com/", "direct_official_home"],
        ["Puebla official news", "https://www.clubpuebla.com/noticias", "direct_official_news"]
      ],
      queretaro: [
        ["Querétaro official site", "https://clubqueretaro.com/", "direct_official_home"],
        ["Querétaro official news", "https://clubqueretaro.com/noticias", "direct_official_news"]
      ]
    };

    for (const [key, urls] of Object.entries(mexicoTeams)) {
      if (!teamKey.includes(key) && !opponentKey.includes(key)) continue;
      addTeamSourceSet("mex", key, urls, "official");
    }

    add({
      title: "Liga MX official site",
      url: "https://ligamx.net/",
      sourceType: "direct_league_home",
      sourceId: "direct:mex:ligamx:home",
      trustTier: "league"
    });
  }

  if (
    /^rsa\./i.test(leagueSlug) ||
    /\b(Orlando Pirates|Kaizer Chiefs|Richards Bay|Mamelodi Sundowns|Stellenbosch|Sekhukhune|Golden Arrows|AmaZulu|SuperSport United|TS Galaxy|Chippa United|Marumo Gallants|Polokwane City|Cape Town City)\b/i.test(`${team} ${opponent}`)
  ) {
    const southAfricaTeams = {
      orlandopirates: [
        ["Orlando Pirates official site", "https://www.orlandopiratesfc.com/", "direct_official_home"],
        ["Orlando Pirates official news", "https://www.orlandopiratesfc.com/news/", "direct_official_news"],
        ["Orlando Pirates first team", "https://www.orlandopiratesfc.com/team/first-team/", "direct_official_team"]
      ],
      kaizerchiefs: [
        ["Kaizer Chiefs official site", "https://www.kaizerchiefs.com/", "direct_official_home"],
        ["Kaizer Chiefs official news", "https://www.kaizerchiefs.com/news/", "direct_official_news"],
        ["Kaizer Chiefs team", "https://www.kaizerchiefs.com/club/team/", "direct_official_team"]
      ],
      richardsbay: [
        ["Richards Bay official site", "https://richardsbayfc.co.za/", "direct_official_home"],
        ["Richards Bay official news", "https://richardsbayfc.co.za/news/", "direct_official_news"]
      ],
      mamelodisundowns: [
        ["Mamelodi Sundowns official site", "https://sundownsfc.co.za/", "direct_official_home"],
        ["Mamelodi Sundowns official news", "https://sundownsfc.co.za/news/", "direct_official_news"],
        ["Mamelodi Sundowns first team", "https://sundownsfc.co.za/teams/", "direct_official_team"]
      ],
      stellenbosch: [
        ["Stellenbosch official site", "https://www.stellenboschfc.com/", "direct_official_home"],
        ["Stellenbosch official news", "https://www.stellenboschfc.com/news/", "direct_official_news"]
      ],
      sekhukhuneunited: [
        ["Sekhukhune United official site", "https://sekhukhuneunitedfc.co.za/", "direct_official_home"],
        ["Sekhukhune United official news", "https://sekhukhuneunitedfc.co.za/news/", "direct_official_news"]
      ],
      goldenarrows: [
        ["Golden Arrows official site", "https://goldenarrowsfc.com/", "direct_official_home"],
        ["Golden Arrows official news", "https://goldenarrowsfc.com/news/", "direct_official_news"]
      ],
      amazulu: [
        ["AmaZulu official site", "https://amazulufc.com/", "direct_official_home"],
        ["AmaZulu official news", "https://amazulufc.com/news/", "direct_official_news"]
      ],
      supersportunited: [
        ["SuperSport United official site", "https://supersportunited.co.za/", "direct_official_home"],
        ["SuperSport United official news", "https://supersportunited.co.za/news/", "direct_official_news"]
      ],
      tsgalaxy: [
        ["TS Galaxy official site", "https://tsgalaxyfc.com/", "direct_official_home"],
        ["TS Galaxy official news", "https://tsgalaxyfc.com/news/", "direct_official_news"]
      ],
      chippaunited: [
        ["Chippa United official site", "https://chippaunitedfc.co.za/", "direct_official_home"],
        ["Chippa United official news", "https://chippaunitedfc.co.za/news/", "direct_official_news"]
      ],
      marumogallants: [
        ["Marumo Gallants official site", "https://marumogallantsfc.co.za/", "direct_official_home"]
      ],
      polokwanecity: [
        ["Polokwane City official site", "https://polokwanecityfc.co.za/", "direct_official_home"]
      ],
      capetowncity: [
        ["Cape Town City official site", "https://capetowncityfc.co.za/", "direct_official_home"],
        ["Cape Town City official news", "https://capetowncityfc.co.za/news/", "direct_official_news"]
      ]
    };

    for (const [key, urls] of Object.entries(southAfricaTeams)) {
      if (!teamKey.includes(key) && !opponentKey.includes(key)) continue;
      addTeamSourceSet("rsa", key, urls, "official");
    }

    add({
      title: "Premier Soccer League official site",
      url: "https://www.psl.co.za/",
      sourceType: "direct_league_home",
      sourceId: "direct:rsa:psl:home",
      trustTier: "league"
    });

    add({
      title: "Premier Soccer League fixtures",
      url: "https://www.psl.co.za/matchcentre",
      sourceType: "direct_league_matchcentre",
      sourceId: "direct:rsa:psl:matchcentre",
      trustTier: "league"
    });

    add({
      title: "SAFA official site",
      url: "https://www.safa.net/",
      sourceType: "direct_federation_home",
      sourceId: "direct:rsa:safa:home",
      trustTier: "reference"
    });
  }

  return rows;
}

function shouldKeepDirectArticleLink(link, input) {
  const title = normalizeText(link?.title);
  const url = normalizeText(link?.url);

  const haystack = [
    title,
    url
  ].filter(Boolean).join(" ").toLowerCase();

  const team = normalizeText(input?.team).toLowerCase();
  const opponent = normalizeText(input?.opponent).toLowerCase();

  if (!haystack || !team) {
    return false;
  }

  const blockedNavTitle =
    /^(home|news|latest news|team news|articles|fixtures|results|standings|table|tickets|shop|store|club|team|squad|players|contact|media|videos|gallery|login|register|search|about|history|academy|development|membership)$/i.test(title);

  const blockedStaticUrl =
    /\/(fixtures|results|tickets|shop|store|contact|privacy|terms|history|honours|academy|women)\/?$/i.test(url);

  if (blockedNavTitle || blockedStaticUrl) {
    return false;
  }

  const hasTeam = haystack.includes(team);

  const hasOpponent = opponent
    ? haystack.includes(opponent)
    : false;

  const hasArticlePath =
    /\/news\/|\/article\/|\/articles\/|\/match-|\/preview|preview-|team-news|club-news|latest-news|\/202\d\//i.test(url);

  const hasStrongArticleSignal =
    /\bpreview\b/i.test(haystack) ||
    /\bmatch preview\b/i.test(haystack) ||
    /\bteam news\b/i.test(haystack) ||
    /\binjur/i.test(haystack) ||
    /\bsuspend/i.test(haystack) ||
    /\bline-?up\b/i.test(haystack) ||
    /\bstarting xi\b/i.test(haystack) ||
    /\bsquad\b/i.test(haystack) ||
    /\bselection\b/i.test(haystack) ||
    /\bfitness\b/i.test(haystack) ||
    /\bdoubt\b/i.test(haystack) ||
    /\babsent\b/i.test(haystack) ||
    /\bmiss(?:es|ing)?\b/i.test(haystack) ||
    /\bvs\b|\bversus\b/i.test(haystack);

  return (
    (hasTeam && hasOpponent) ||
    (hasTeam && hasStrongArticleSignal) ||
    (hasOpponent && hasStrongArticleSignal) ||
    (hasArticlePath && (hasTeam || hasOpponent || hasStrongArticleSignal))
  );
}

function scoreDirectArticleLink(link, input) {
  const title = normalizeText(link?.title).toLowerCase();
  const url = normalizeText(link?.url).toLowerCase();

  const haystack = [
    title,
    url
  ].filter(Boolean).join(" ");

  const team = normalizeText(input?.team).toLowerCase();
  const opponent = normalizeText(input?.opponent).toLowerCase();

  let score = 0;

  const hasTeam = !!team && haystack.includes(team);
  const hasOpponent = !!opponent && haystack.includes(opponent);

  if (hasTeam) {
    score += 10;
  }

  if (hasOpponent) {
    score += 22;
  }

  if (hasTeam && hasOpponent) {
    score += 35;
  }

  if (/\bpreview\b|\bmatch preview\b/i.test(haystack)) {
    score += 14;
  }

  if (/\bteam news\b|\binjur|\bsuspend|\bline-?up\b|\bstarting xi\b|\bsquad\b|\bselection\b|\bfitness\b|\bdoubt\b|\babsent\b|\bmissing\b/i.test(haystack)) {
    score += 18;
  }

  if (/\bvs\b|\bversus\b/i.test(haystack)) {
    score += 8;
  }

  if (/\/news\/|\/article\/|\/articles\/|\/match-|\/preview|preview-|team-news|club-news|latest-news|\/202\d\//i.test(url)) {
    score += 6;
  }

  const knownSouthAfricaTeamMatches = [
    "kaizer chiefs",
    "orlando pirates",
    "richards bay",
    "mamelodi sundowns",
    "amazulu",
    "stellenbosch",
    "polokwane city",
    "ts galaxy",
    "magesi",
    "baroka",
    "kruger united",
    "hungry lions",
    "gomora united",
    "venda",
    "midlands wanderers"
  ].filter(name => haystack.includes(name));

  const hasThirdTeamMention = knownSouthAfricaTeamMatches.some(name => {
    if (team && name === team) return false;
    if (opponent && name === opponent) return false;
    return true;
  });

  const looksLikeOtherFixturePreview =
    /\bpreview\b/i.test(haystack) &&
    hasThirdTeamMention &&
    !hasOpponent;

  if (looksLikeOtherFixturePreview) {
    score -= 35;
  }

  if (!hasOpponent && !/\bteam news\b|\binjur|\bsuspend|\bline-?up\b|\bstarting xi\b|\bsquad\b|\bselection\b|\bfitness\b|\bdoubt\b|\babsent\b|\bmissing\b/i.test(haystack)) {
    score -= 12;
  }

  if (/\/category\/|\/tag\/|\/author\/|\/page\/\d+\/?$/i.test(url)) {
    score -= 10;
  }

  if (/\/news\/?$/i.test(url)) {
    score -= 12;
  }

  if (/\/team\/first-team\/?$/i.test(url)) {
    score -= 12;
  }

  if (/academy|women|u-?\d+|under-\d+/i.test(haystack)) {
    score -= 18;
  }

  return score;
}

function extractDirectArticleLinksFromHtml(html, baseUrl, row, input) {
  const collected = [];
  const safeHtml = String(html || "");
  const seen = new Set();

  let baseHost = null;

  try {
    baseHost = new URL(baseUrl).hostname.replace(/^www\./i, "");
  } catch {
    baseHost = null;
  }

  const linkRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of safeHtml.matchAll(linkRe)) {
    const url = normalizeLinkedUrl(match[1], baseUrl);
    const title = stripHtml(match[2]);

    if (!url || !title) {
      continue;
    }

    let host = null;

    try {
      host = new URL(url).hostname.replace(/^www\./i, "");
    } catch {
      host = null;
    }

    if (baseHost && host && host !== baseHost) {
      continue;
    }

    if (/\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|rar|mp4|mp3)$/i.test(url)) {
      continue;
    }

    const key = url.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    const link = {
      title,
      url,
      publisher: getPublisherFromUrl(url),
      sourceMode: "direct",
      sourceId: `${row.sourceId || "direct"}:article`,
      sourceType: "direct_article",
      trustTier: row.trustTier || "official",
      parentSourceId: row.sourceId || null,
      parentUrl: baseUrl
    };

    if (!shouldKeepDirectArticleLink(link, input)) {
      continue;
    }

    collected.push({
      ...link,
      score: scoreDirectArticleLink(link, input)
    });
  }

  return collected
    .filter(link => link.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ score, ...link }) => link);
}

async function fetchDirectSources(input) {
  const maxDirectSources = clamp(process.env.AIML_TEAM_NEWS_MAX_DIRECT_SOURCES || 5, 1, 10);
  const maxDirectArticleLinks = clamp(process.env.AIML_TEAM_NEWS_MAX_DIRECT_ARTICLE_LINKS || 8, 0, 20);
  const maxDirectArticleFetches = clamp(process.env.AIML_TEAM_NEWS_MAX_DIRECT_ARTICLE_FETCHES || 4, 0, 12);
  const timeoutMs = clamp(process.env.AIML_TEAM_NEWS_DIRECT_FETCH_TIMEOUT_MS || 3500, 1000, 9000);

  const rows = buildDirectTeamNewsSources(input);

  const diagnostics = {
    directSourceCount: rows.length,
    fetchedDirectCount: 0,
    usableDirectCount: 0,
    discoveredDirectArticleCount: 0,
    fetchedDirectArticleCount: 0,
    usableDirectArticleCount: 0,
    directSamples: rows.slice(0, 10).map(row => ({
      title: row.title,
      url: row.url,
      publisher: row.publisher,
      sourceType: row.sourceType,
      trustTier: row.trustTier
    })),
    fetchSamples: [],
    articleSamples: []
  };

  const sources = [];
  const articleCandidates = [];
  const seenArticleUrls = new Set();

  for (const row of rows.slice(0, maxDirectSources)) {
    if (isSearchPageSource(row)) continue;

    const result = await fetchTextResult(row.url, { timeoutMs, maxChars: 120000 });
    const html = result.ok ? result.text : null;
    const text = html ? stripHtml(html).slice(0, 10000) : "";

    if (html) diagnostics.fetchedDirectCount += 1;

    if (diagnostics.fetchSamples.length < 10) {
      diagnostics.fetchSamples.push({
        title: row.title,
        url: row.url,
        publisher: row.publisher,
        sourceType: row.sourceType,
        trustTier: row.trustTier,
        fetched: !!html,
        fetchStatus: result.status,
        fetchReason: result.reason,
        fetchContentType: result.contentType,
        fetchDurationMs: result.durationMs,
        fetchFinalUrl: result.finalUrl,
        fetchErrorName: result.errorName || null,
        fetchErrorMessage: result.errorMessage || null,
        textLength: text.length,
        textPreview: text.replace(/\s+/g, " ").slice(0, 900)
      });
    }

    if (html && maxDirectArticleLinks > 0) {
      const articleLinks = extractDirectArticleLinksFromHtml(
        html,
        result.finalUrl || row.url,
        row,
        input
      );

      for (const link of articleLinks) {
        if (!link?.url) continue;

        const key = link.url.toLowerCase();

        if (seenArticleUrls.has(key)) continue;

        seenArticleUrls.add(key);
        articleCandidates.push(link);
      }
    }

    const source = normalizeSourceItem({
      ...row,
      text,
      query: "direct"
    });

    if (!source || !source.url || normalizeText([source.title, source.publisher, source.text].filter(Boolean).join(" ")).length < 80) {
      continue;
    }

    diagnostics.usableDirectCount += 1;
    sources.push(source);
  }

  const rankedArticles = articleCandidates
    .map(link => ({
      link,
      score: scoreDirectArticleLink(link, input)
    }))
    .sort((a, b) => b.score - a.score)
    .map(row => row.link)
    .slice(0, maxDirectArticleLinks);

  diagnostics.discoveredDirectArticleCount = rankedArticles.length;

  diagnostics.articleSamples = rankedArticles.slice(0, 10).map(link => ({
    title: link.title,
    url: link.url,
    publisher: link.publisher,
    sourceType: link.sourceType,
    trustTier: link.trustTier,
    parentUrl: link.parentUrl
  }));

  for (const article of rankedArticles.slice(0, maxDirectArticleFetches)) {
    const result = await fetchTextResult(article.url, { timeoutMs, maxChars: 120000 });
    const html = result.ok ? result.text : null;
    const text = html ? stripHtml(html).slice(0, 12000) : "";

    if (html) diagnostics.fetchedDirectArticleCount += 1;

    if (diagnostics.fetchSamples.length < 16) {
      diagnostics.fetchSamples.push({
        title: article.title,
        url: article.url,
        publisher: article.publisher,
        sourceType: article.sourceType,
        trustTier: article.trustTier,
        parentUrl: article.parentUrl,
        fetched: !!html,
        fetchStatus: result.status,
        fetchReason: result.reason,
        fetchContentType: result.contentType,
        fetchDurationMs: result.durationMs,
        fetchFinalUrl: result.finalUrl,
        fetchErrorName: result.errorName || null,
        fetchErrorMessage: result.errorMessage || null,
        textLength: text.length,
        textPreview: text.replace(/\s+/g, " ").slice(0, 900)
      });
    }

    const source = normalizeSourceItem({
      ...article,
      text,
      query: "direct"
    });

    if (!source || !source.url || normalizeText([source.title, source.publisher, source.text].filter(Boolean).join(" ")).length < 120) {
      continue;
    }

    diagnostics.usableDirectArticleCount += 1;
    sources.push(source);
  }

  return { sources, diagnostics };
}

function scoreDirectSourceForTask(source, input) {
  const haystack = [source?.title, source?.url, source?.publisher, source?.text]
    .map(normalizeText)
    .join(" ")
    .toLowerCase();
  const team = normalizeText(input?.team).toLowerCase();
  const opponent = normalizeText(input?.opponent).toLowerCase();
  let score = 0;

  if (source?.sourceMode === "direct" || source?.query === "direct") score += 10;
  if (source?.trustTier === "official") score += 25;
  if (source?.trustTier === "league") score += 16;
  if (team && haystack.includes(team)) score += 12;
  if (opponent && haystack.includes(opponent)) score += 18;
  if (/convocad|convocatoria|citados|n[oó]mina|alineaci[oó]n|formaci[oó]n|lesion|lesi[oó]n|bajas|suspend|sancion|previa|jornada|partido|vs|versus/i.test(haystack)) score += 20;
  if (/femenil|femenino|femenina|sub-\d+|academy|cantera/i.test(haystack)) score -= 30;

  return score;
}

function sortDirectSourcesForTask(sources, input) {
  return (Array.isArray(sources) ? sources : [])
    .map(source => ({ source, score: scoreDirectSourceForTask(source, input) }))
    .sort((a, b) => b.score - a.score)
    .map(row => row.source);
}

function buildSearchQueries(input) {
  const team = normalizeText(input?.team);
  const opponent = normalizeText(input?.opponent);
  const leagueSlug = normalizeText(input?.leagueSlug);

  const pair = [team, opponent].filter(Boolean).join(" ");

  const isSpanishContext =
    /^mex\./i.test(leagueSlug) ||
    /^arg\./i.test(leagueSlug) ||
    /^esp\./i.test(leagueSlug) ||
    /^chi\./i.test(leagueSlug) ||
    /^col\./i.test(leagueSlug) ||
    /^per\./i.test(leagueSlug) ||
    /^uru\./i.test(leagueSlug) ||
    /^ecu\./i.test(leagueSlug) ||
    /^par\./i.test(leagueSlug) ||
    /^bol\./i.test(leagueSlug) ||
    /\b(Puebla|Quer[eé]taro|Queretaro|Temperley|Patronato|San Telmo|All Boys)\b/i.test(`${team} ${opponent}`);

  const isMexicoContext =
    /^mex\./i.test(leagueSlug) ||
    /\b(Puebla|Quer[eé]taro|Queretaro)\b/i.test(`${team} ${opponent}`);

  const isNorwegianContext =
    /^nor\./i.test(leagueSlug) ||
    /\b(Fredrikstad|Viking FK|Rosenborg|SK Brann|Brann)\b/i.test(`${team} ${opponent}`);

  const mexicoPriorityQueries = [
    `site:ligamx.net "${team}" "${opponent}"`,
    `site:clubpuebla.com "${opponent}" convocatoria`,
    `"${team}" "${opponent}" previa bajas lesionados`,
    `"${team}" "${opponent}" convocatoria alineacion`,
    `"${team}" "${opponent}" posible once`,
    `${pair} previa bajas lesionados`,
    `${pair} convocatoria alineacion`,
    `${pair} Liga MX previa`
  ];

  const spanishQueries = [
    `"${team}" "${opponent}" previa bajas lesionados suspendidos alineacion`,
    `"${team}" "${opponent}" previa convocados lesionados suspendidos`,
    `"${team}" "${opponent}" posible once bajas lesionados`,
    `"${team}" "${opponent}" convocatoria`,
    `"${team}" lesionados suspendidos convocados`,
    `"${team}" bajas lesionados convocatoria`,
    `"${team}" alineacion probable`,
    pair ? `${pair} previa lesionados convocados` : null
  ];

  const norwegianQueries = [
    `"${team}" "${opponent}" lagnyheter skader suspensjoner tropp`,
    `"${team}" "${opponent}" forventet lagoppstilling`,
    `"${team}" "${opponent}" preview team news`,
    `"${team}" skader suspensjoner tropp`,
    `"${team}" forventet lagoppstilling`
  ];

  const englishQueries = [
    `"${team}" "${opponent}" football team news injuries suspensions expected lineup`,
    `"${team}" "${opponent}" football preview team news`,
    `"${team}" "${opponent}" preview injuries lineup`,
    `"${team}" "${opponent}" match preview`,
    `"${team}" injuries suspensions squad news`,
    `"${team}" team news lineup`,
    `"${team}" expected lineup`,
    pair ? `${pair} injuries suspensions lineup` : null,
    pair ? `${pair} preview team news` : null
  ];

  const leagueQueries = [
    leagueSlug ? `"${team}" ${leagueSlug} injuries suspensions squad news` : null,
    leagueSlug ? `"${team}" ${leagueSlug} previa lesionados convocados` : null
  ];

  const queries = [
    ...(isMexicoContext ? mexicoPriorityQueries : []),
    ...(isSpanishContext && !isMexicoContext ? spanishQueries : []),
    ...(isNorwegianContext ? norwegianQueries : []),
    ...englishQueries,
    ...leagueQueries,
    ...(!isSpanishContext ? spanishQueries.slice(0, 2) : []),
    ...(!isNorwegianContext ? norwegianQueries.slice(0, 1) : [])
  ];

  return [...new Set(queries.filter(Boolean))];
}

function scoreRegistrySourceForTask(source, input) {
  const title = normalizeText(source?.title).toLowerCase();

  const url = normalizeText(source?.url).toLowerCase();

  const publisher = normalizeText(source?.publisher).toLowerCase();

  const haystack = [
    title,
    url,
    publisher
  ].filter(Boolean).join(" ");

  const team = normalizeText(input?.team).toLowerCase();

  const opponent = normalizeText(input?.opponent).toLowerCase();

  let score = 0;

  if (source?.sourceMode === "registry" || source?.query === "registry") {
    score += 5;
  }

  if (source?.trustTier === "official") {
    score += 20;
  }

  if (source?.trustTier === "league") {
    score += 10;
  }

  if (source?.sourceType === "registry_article") {
    score += 20;
  }

  if (team && haystack.includes(team)) {
    score += 8;
  }

  if (opponent && haystack.includes(opponent)) {
    score += 18;
  }

  if (/\bprevia\b/i.test(haystack)) {
    score += 16;
  }

  if (/\bfecha\b/i.test(haystack)) {
    score += 8;
  }

  if (/\bvs\b|\bversus\b/i.test(haystack)) {
    score += 8;
  }

  if (/liga-de-primera|liga de primera|campeonato-masculino|fútbol masculino|futbol masculino/i.test(haystack)) {
    score += 6;
  }

  if (/convocados|convocatoria|n[oó]mina|citados|alineaci[oó]n|formaci[oó]n|lesion|lesi[oó]n|suspend|bajas/i.test(haystack)) {
    score += 20;
  }

  if (/sub-\d+/i.test(haystack)) {
    score -= 30;
  }

  if (/\bfem\b|\bfemenino\b|\bfemenina\b/i.test(haystack)) {
    score -= 30;
  }

  if (/\/category\//i.test(url)) {
    score -= 12;
  }

  if (/\/noticias\/?$/i.test(url)) {
    score -= 12;
  }

  if (/\/futbol-joven\/?$/i.test(url)) {
    score -= 20;
  }

  return score;
}

function sortRegistrySourcesForTask(sources, input) {
  return (Array.isArray(sources) ? sources : [])
    .map(source => ({
      source,
      score: scoreRegistrySourceForTask(source, input)
    }))
    .sort((a, b) => b.score - a.score)
    .map(row => row.source);
}

async function collectTeamNewsSources(input) {
  const maxSearchResults = clamp(process.env.AIML_TEAM_NEWS_MAX_SEARCH_RESULTS || 5, 1, 12);
  const maxFetchedPages = clamp(process.env.AIML_TEAM_NEWS_MAX_FETCHED_PAGES || 1, 0, 5);
  const maxSearchQueries = clamp(process.env.AIML_TEAM_NEWS_MAX_SEARCH_QUERIES || 2, 1, 4);
  const enrichedFetchTimeoutMs = clamp(process.env.AIML_TEAM_NEWS_ENRICH_FETCH_TIMEOUT_MS || 3500, 1000, 10000);
  const queries = buildSearchQueries(input).slice(0, maxSearchQueries);
  const seen = new Set();
  const candidates = [];
  const diagnostics = {
    queries,
    rawSearchCount: 0,
    candidateCount: 0,
    realSourceCount: 0,
    relevantSourceCount: 0,
    sampleCandidates: [],
    rejectedSamples: [],
    searchAttempts: [],
    direct: null,
    registry: null
  };

  const directResult = await fetchDirectSources(input);

  diagnostics.direct = directResult?.diagnostics || null;

  const directSources = sortDirectSourcesForTask(
    (Array.isArray(directResult?.sources) ? directResult.sources : [])
      .map(normalizeSourceItem)
      .filter(Boolean)
      .filter(hasRealSource),
    input
  );

  if (diagnostics.direct) {
    diagnostics.direct.rankedDirectSamples = directSources.slice(0, 8).map(source => ({
      title: source.title,
      url: source.url,
      publisher: source.publisher,
      sourceType: source.sourceType,
      trustTier: source.trustTier,
      score: scoreDirectSourceForTask(source, input)
    }));
  }

  for (const source of directSources) {
    if (!source?.url) continue;
    if (seen.has(source.url)) continue;
    seen.add(source.url);
    candidates.push({ ...source, query: "direct", sourceMode: "direct" });

    if (diagnostics.sampleCandidates.length < 5) {
      diagnostics.sampleCandidates.push({
        title: source.title,
        url: source.url,
        publisher: source.publisher,
        query: "direct"
      });
    }

    if (candidates.length >= maxSearchResults) break;
  }

  const registryResult = await fetchRegistrySources(input);

  diagnostics.registry = registryResult?.diagnostics || null;

  const registrySources = sortRegistrySourcesForTask(
    (Array.isArray(registryResult?.sources)
      ? registryResult.sources
      : []
    )
      .map(normalizeSourceItem)
      .filter(Boolean)
      .filter(hasRealSource),
    input
  );

  if (diagnostics.registry) {
    diagnostics.registry.rankedRegistrySamples = registrySources
      .slice(0, 8)
      .map(source => ({
        title: source.title,
        url: source.url,
        publisher: source.publisher,
        sourceType: source.sourceType,
        trustTier: source.trustTier,
        score: scoreRegistrySourceForTask(source, input)
      }));
  }

  for (const source of registrySources) {
    if (!source?.url) continue;
    if (seen.has(source.url)) continue;

    seen.add(source.url);

    candidates.push({
      ...source,
      query: "registry",
      sourceMode: "registry"
    });

    if (diagnostics.sampleCandidates.length < 5) {
      diagnostics.sampleCandidates.push({
        title: source.title,
        url: source.url,
        publisher: source.publisher,
        query: "registry"
      });
    }

    if (candidates.length >= maxSearchResults) break;
  }

  for (const query of queries) {
    const searchResult = await searchWeb(query);
    const rows = Array.isArray(searchResult?.rows) ? searchResult.rows : [];

    diagnostics.rawSearchCount += rows.length;
    diagnostics.searchAttempts.push({
      query,
      attempts: searchResult?.attempts || []
    });

    for (const row of rows) {
      const source = normalizeSourceItem(row);
      if (!source?.url) continue;
      if (seen.has(source.url)) continue;

      const candidateOk = candidateLooksLikeFootballSearchHit(source, input);

      if (!candidateOk) {
        if (diagnostics.rejectedSamples.length < 8) {
          diagnostics.rejectedSamples.push({
            title: source.title,
            url: source.url,
            publisher: source.publisher,
            query,
            reason: "failed_football_candidate_prefilter"
          });
        }
        continue;
      }

      seen.add(source.url);
      candidates.push({ ...source, query });

      if (diagnostics.sampleCandidates.length < 5) {
        diagnostics.sampleCandidates.push({
          title: source.title,
          url: source.url,
          publisher: source.publisher,
          query
        });
      }

      if (candidates.length >= maxSearchResults) break;
    }

    if (candidates.length >= maxSearchResults) break;
  }

  diagnostics.candidateCount = candidates.length;

  const enriched = [];
  for (const source of candidates.slice(0, maxFetchedPages)) {
    const html = await fetchText(source.url, { timeoutMs: enrichedFetchTimeoutMs, maxChars: 90000 });
    const text = html ? stripHtml(html).slice(0, 6000) : source.text;
    enriched.push({ ...source, text: text || source.text || source.title });
  }

  for (const source of candidates.slice(maxFetchedPages)) {
    enriched.push(source);
  }

  const normalized = enriched
    .map(normalizeSourceItem)
    .filter(Boolean);

  const realSources = normalized.filter(hasRealSource);
  const relevantSources = realSources.filter(source => sourceLooksRelevant(source, input));

  diagnostics.realSourceCount = realSources.length;
  diagnostics.relevantSourceCount = relevantSources.length;

  return {
    sources: relevantSources,
    diagnostics
  };
}

const BAD_ABSENCE_PLAYER_PATTERNS = [
  /team news/i,
  /expected lineup/i,
  /starting xi/i,
  /injury news/i,
  /the match/i,
  /match preview/i,
  /preview/i,
  /lineups?/i,
  /squad news/i,
  /latest news/i,
  /club news/i,
  /first team/i,
  /fixtures?/i,
  /results?/i,
  /standings?/i,
  /table/i,
  /tickets?/i,
  /shop/i,
  /store/i,
  /honours?/i,
  /history/i,
  /historical/i,
  /academy/i,
  /women/i,
  /women's/i,
  /u-?\d+/i,
  /under\s+\d+/i
];

function looksLikeBadAbsencePlayerName(player) {
  const value = normalizeText(player);

  if (!value) {
    return true;
  }

  if (value.length < 4 || value.length > 55) {
    return true;
  }

  if (BAD_ABSENCE_PLAYER_PATTERNS.some(pattern => pattern.test(value))) {
    return true;
  }

  const words = value.split(/\s+/).filter(Boolean);

  if (words.length > 4) {
    return true;
  }

  const lower = value.toLowerCase();

  if (
    /\b(home|away|match|club|news|preview|lineup|fixtures|results|standings|table|tickets|shop|history|honours)\b/i.test(lower)
  ) {
    return true;
  }

  if (!/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(value)) {
    return true;
  }

  return false;
}

function extractNamedAbsences(text, source) {
  const out = [];
  const safeText = normalizeText(text).replace(/\s+/g, " ");

  const playerNamePattern = "[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+(?:\\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+){0,3}";

  const patterns = [
    new RegExp(
      "(" + playerNamePattern + ")\\s+(?:is|are|was|were|remains?|remain|continues?\\s+to\\s+be)?\\s*(?:ruled\\s+out|sidelined|injured|suspended|doubtful|a\\s+doubt|unavailable)",
      "g"
    ),
    new RegExp(
      "(?:without|missing|absent)\\s+(?:(?:the\\s+services\\s+of|the\\s+injured|the\\s+suspended|injured|suspended|defender|midfielder|striker|forward|goalkeeper|keeper)\\s+){0,4}(" + playerNamePattern + ")",
      "g"
    ),
    new RegExp(
      "(" + playerNamePattern + ")\\s+(?:will|is\\s+expected\\s+to|set\\s+to)\\s+miss",
      "g"
    )
  ];

  for (const pattern of patterns) {
    for (const match of safeText.matchAll(pattern)) {
      const player = normalizeText(match[1]);
      if (looksLikeBadAbsencePlayerName(player)) continue;

      const lowerWindow = safeText.slice(Math.max(0, match.index - 80), match.index + 160).toLowerCase();
      const type = lowerWindow.includes("suspend") ? "suspension" : "injury";
      const status = lowerWindow.includes("doubt") ? "doubtful" : "out";

      out.push({
        player,
        type,
        status,
        source: source?.url || source?.publisher || source?.title || null
      });
    }
  }

  const unique = new Map();
  for (const row of out) {
    const key = `${row.player.toLowerCase()}|${row.type}|${row.status}`;
    if (!unique.has(key)) unique.set(key, row);
  }

  return Array.from(unique.values()).slice(0, 8);
}

function buildSourceNote(source) {
  const text = normalizeText(source?.text || source?.title);
  if (!text) return null;

  const compact = text.replace(/\s+/g, " ").slice(0, 360);
  return {
    type: "selection_note",
    value: compact,
    source: source?.url || source?.publisher || source?.title || null
  };
}

function detectTeamNewsSignal(text, input = {}) {
  const value = normalizeText(text).toLowerCase();

  if (!value) {
    return null;
  }

  const team = normalizeText(input?.team).toLowerCase();

  const opponent = normalizeText(input?.opponent).toLowerCase();

  const hasTeam = team
    ? value.includes(team)
    : false;

  const hasOpponent = opponent
    ? value.includes(opponent)
    : false;

  const hasMatchContext =
    hasOpponent ||
    /\bpartido\b/i.test(value) ||
    /\bprevia\b/i.test(value) ||
    /\bfecha\b/i.test(value) ||
    /\bjornada\b/i.test(value) ||
    /\bversus\b/i.test(value) ||
    /\bvs\.?\b/i.test(value) ||
    /\bcampeonato\b/i.test(value) ||
    /\bcopa\b/i.test(value) ||
    /\bliga\b/i.test(value) ||
    /\bmatch\b/i.test(value) ||
    /\bpreview\b/i.test(value);

  const strongSignalChecks = [
    {
      type: "injury_signal",
      pattern: /injur|lesionad|lesión|lesion|doubt|fitness|out injured|baja por lesión|baja por lesion/i
    },
    {
      type: "suspension_signal",
      pattern: /suspend|suspended|suspension|sancionad|sanción|sancion/i
    },
    {
      type: "squad_signal",
      pattern: /convocados|convocatoria|citados|n[oó]mina|lista de citados|lista de convocados/i
    },
    {
      type: "lineup_signal",
      pattern: /lineup|line-up|starting xi|alineaci[oó]n|formaci[oó]n|titulares|once inicial/i
    },
    {
      type: "selection_signal",
      pattern: /team news|unavailable|absent|baja|bajas|alta médica|alta medica/i
    }
  ];

  for (const check of strongSignalChecks) {
    if (!check.pattern.test(value)) {
      continue;
    }

    if (hasTeam || hasMatchContext) {
      return check.type;
    }
  }

  return null;
}

function buildCredibleSearchHitNote(source, input) {
  const normalizedSource = normalizeSourceItem(source);

  if (!normalizedSource) {
    return null;
  }

  const team = normalizeText(input?.team);
  const opponent = normalizeText(input?.opponent);
  const title = normalizeText(normalizedSource.title);
  const publisher = normalizeText(normalizedSource.publisher);
  const url = normalizeText(normalizedSource.url);
  const text = normalizeText(normalizedSource.text);

  if (!team || !url) {
    return null;
  }

  const haystack = [
    title,
    publisher,
    url,
    text
  ].filter(Boolean).join(" ");

  const signalType = detectTeamNewsSignal(haystack, input);

  if (!signalType) {
    return null;
  }

  const lowerTitle = title.toLowerCase();
  const lowerUrl = url.toLowerCase();

  const isGenericSearchPage =
    normalizedSource.sourceType === "search_url" ||
    /\/search\/?\b/i.test(lowerUrl) ||
    /schnellsuche|buscar|busqueda|search/i.test(lowerUrl) ||
    /transfermarkt search/i.test(lowerTitle);

  if (isGenericSearchPage) {
    return null;
  }

  return {
    type: "credible_selection_note",
    value: `${team}${opponent ? ` vs ${opponent}` : ""}: source reports team-news signal (${signalType}) from ${title || publisher || url}`,
    source: url,
    confidence: 0.58,
    meta: {
      sourceMode: normalizedSource.sourceMode || null,
      sourceId: normalizedSource.sourceId || null,
      sourceType: normalizedSource.sourceType || null,
      trustTier: normalizedSource.trustTier || null,
      publisher,
      signalType
    }
  };
}

function buildTrustedRegistrySourceNote(source, input) {
  const normalizedSource = normalizeSourceItem(source);

  if (!normalizedSource) {
    return null;
  }

  const isRegistrySource =
    normalizedSource.sourceMode === "registry" ||
    normalizedSource.query === "registry";

  const isTrustedRegistrySource =
    isRegistrySource &&
    (
      normalizedSource.trustTier === "official" ||
      normalizedSource.trustTier === "league" ||
      normalizedSource.trustTier === "reference"
    );

  if (!isTrustedRegistrySource) {
    return null;
  }

  const team = normalizeText(input?.team);
  const opponent = normalizeText(input?.opponent);
  const title = normalizeText(normalizedSource.title);
  const publisher = normalizeText(normalizedSource.publisher);
  const url = normalizeText(normalizedSource.url);
  const text = normalizeText(normalizedSource.text);

  if (!team || !url) {
    return null;
  }

  const isSearchUrl =
    normalizedSource.sourceType === "search_url" ||
    /\/search\b|\/schnellsuche\b|\?q=|\?query=|\?s=/i.test(url);

  const isOfficialOrLeague =
    normalizedSource.trustTier === "official" ||
    normalizedSource.trustTier === "league";

  const isArticleLike =
    normalizedSource.sourceType === "registry_article" ||
    /\/news\/|\/noticias\/|\/previa-|\/preview-|\/match-|\/article\/|\/actualidad\/|\/futbol\/|\/club\/|\/equipo\//i.test(url);

  if (isSearchUrl) {
    return {
      type: "source_available_note",
      value: `${team} has a trusted registry search source available for review: ${title || publisher || url}`,
      source: url,
      confidence: 0.24,
      meta: {
        sourceMode: normalizedSource.sourceMode,
        sourceId: normalizedSource.sourceId,
        sourceType: normalizedSource.sourceType,
        trustTier: normalizedSource.trustTier,
        publisher,
        signalType: null,
        blockedAsEvidence: true,
        blockReason: "registry_search_url_not_team_news_evidence"
      }
    };
  }

  if (!isOfficialOrLeague && !isArticleLike) {
    return null;
  }

  const signalType = detectTeamNewsSignal([
    title,
    publisher,
    text
  ].filter(Boolean).join(" "), input);

  if (signalType) {
    return {
      type: "credible_selection_note",
      value: `${team}${opponent ? ` vs ${opponent}` : ""}: trusted registry source contains team-news signal (${signalType}): ${title || publisher || url}`,
      source: url,
      confidence: normalizedSource.trustTier === "official" ? 0.66 : 0.58,
      meta: {
        sourceMode: normalizedSource.sourceMode,
        sourceId: normalizedSource.sourceId,
        sourceType: normalizedSource.sourceType,
        trustTier: normalizedSource.trustTier,
        publisher,
        signalType
      }
    };
  }

  if (text.length >= 120) {
    return {
      type: "source_available_note",
      value: `${team}${opponent ? ` vs ${opponent}` : ""}: trusted registry source was fetched and kept for team-news review: ${title || publisher || url}`,
      source: url,
      confidence: normalizedSource.trustTier === "official" ? 0.48 : 0.40,
      meta: {
        sourceMode: normalizedSource.sourceMode,
        sourceId: normalizedSource.sourceId,
        sourceType: normalizedSource.sourceType,
        trustTier: normalizedSource.trustTier,
        publisher,
        signalType: null,
        textLength: text.length
      }
    };
  }

  return null;
}


function buildTrustedDirectSourceNote(source, input) {
  const normalizedSource = normalizeSourceItem(source);

  if (!normalizedSource) return null;

  const isDirectSource =
    normalizedSource.sourceMode === "direct" ||
    normalizedSource.query === "direct" ||
    /^direct_/i.test(normalizedSource.sourceType || "");

  const isTrustedDirectSource =
    isDirectSource &&
    (
      normalizedSource.trustTier === "official" ||
      normalizedSource.trustTier === "league" ||
      normalizedSource.trustTier === "local_media" ||
      normalizedSource.trustTier === "reference"
    );

  if (!isTrustedDirectSource) return null;

  const team = normalizeText(input?.team);
  const opponent = normalizeText(input?.opponent);
  const title = normalizeText(normalizedSource.title);
  const publisher = normalizeText(normalizedSource.publisher);
  const url = normalizeText(normalizedSource.url);
  const text = normalizeText(normalizedSource.text);
  const sourceType = normalizeText(normalizedSource.sourceType);

  if (!team || !url || text.length < 120) return null;

  const haystack = [
    title,
    publisher,
    url,
    text
  ].filter(Boolean).join(" ").toLowerCase();

  const teamLc = team.toLowerCase();
  const opponentLc = opponent.toLowerCase();

  const hasTeam = haystack.includes(teamLc);
  const hasOpponent = opponentLc ? haystack.includes(opponentLc) : true;

  const isHomeLikeSource =
    sourceType === "direct_official_home" ||
    sourceType === "direct_league_home" ||
    sourceType === "direct_federation_home" ||
    /\/$/.test(url.replace(/^https?:\/\/[^/]+/i, ""));

  const isArticleLikeSource =
    sourceType === "direct_article" ||
    /\/news\/.+/i.test(url) ||
    /\/football-news\/.+/i.test(url) ||
    /\/article\/.+/i.test(url) ||
    /\/articles\/.+/i.test(url) ||
    /\/preview/i.test(url) ||
    /\bpreview\b/i.test(title) ||
    /\bteam news\b/i.test(title) ||
    /\binjur/i.test(title) ||
    /\bsuspend/i.test(title);

  if (isHomeLikeSource) {
    return null;
  }

  if (!isArticleLikeSource) {
    return null;
  }

  if (!hasTeam && !hasOpponent) {
    return null;
  }

  const signalType = detectTeamNewsSignal([title, publisher, text].filter(Boolean).join(" "), input);

  if (!signalType) {
    return null;
  }

  return {
    type: "credible_selection_note",
    value: team + (opponent ? " vs " + opponent : "") + ": trusted direct article contains team-news signal (" + signalType + "): " + (title || publisher || url),
    source: url,
    confidence: normalizedSource.trustTier === "official" ? 0.66 : 0.56,
    meta: {
      sourceMode: normalizedSource.sourceMode,
      sourceId: normalizedSource.sourceId,
      sourceType: normalizedSource.sourceType,
      trustTier: normalizedSource.trustTier,
      publisher,
      signalType,
      textLength: text.length
    }
  };
}

function getTeamAttributionAliases(teamName) {
  const team = normalizeText(teamName).toLowerCase();
  const compact = compactTeamKey(team);

  const aliases = new Set();

  if (team) aliases.add(team);
  if (compact) aliases.add(compact);

  if (compact === "kaizerchiefs") {
    aliases.add("chiefs");
    aliases.add("amakhosi");
    aliases.add("kaizer chiefs");
  }

  if (compact === "orlandopirates") {
    aliases.add("pirates");
    aliases.add("bucs");
    aliases.add("orlando pirates");
  }

  if (compact === "mamelodisundowns") {
    aliases.add("sundowns");
    aliases.add("mamelodi sundowns");
  }

  if (compact === "richardsbay") {
    aliases.add("richards bay");
  }

  if (compact === "tsgalaxy") {
    aliases.add("ts galaxy");
  }

  if (compact === "polokwanecity") {
    aliases.add("polokwane city");
  }

  if (compact === "stellenbosch") {
    aliases.add("stellenbosch");
  }

  return Array.from(aliases).filter(Boolean);
}

function looseIncludesTeamName(value, teamName) {
  const text = normalizeText(value).toLowerCase();
  const compactText = compactTeamKey(text);

  if (!text || !teamName) return false;

  for (const alias of getTeamAttributionAliases(teamName)) {
    const normalizedAlias = normalizeText(alias).toLowerCase();
    const compactAlias = compactTeamKey(normalizedAlias);

    if (normalizedAlias.length >= 4 && text.includes(normalizedAlias)) {
      return true;
    }

    if (compactAlias.length >= 4 && compactText.includes(compactAlias)) {
      return true;
    }
  }

  return false;
}

function getSourceTitleTeamBias(source, input = {}) {
  const title = normalizeText(source?.title);
  const team = normalizeText(input?.team);
  const opponent = normalizeText(input?.opponent);

  const hasTargetInTitle = looseIncludesTeamName(title, team);
  const hasOpponentInTitle = opponent ? looseIncludesTeamName(title, opponent) : false;

  if (hasTargetInTitle && !hasOpponentInTitle) return "target";
  if (hasOpponentInTitle && !hasTargetInTitle) return "opponent";
  if (hasTargetInTitle && hasOpponentInTitle) return "both";

  return "unknown";
}

function absenceLooksAttributedToTarget(absence, source, input = {}) {
  const player = normalizeText(absence?.player);
  const text = normalizeText(source?.text || source?.title);
  const team = normalizeText(input?.team);
  const opponent = normalizeText(input?.opponent);

  if (!player || !text || !team) return false;

  const titleBias = getSourceTitleTeamBias(source, input);

  if (titleBias === "opponent") {
    return false;
  }

  if (titleBias === "target") {
    return true;
  }

  const lowerText = text.toLowerCase();
  const lowerPlayer = player.toLowerCase();
  const playerIndex = lowerText.indexOf(lowerPlayer);

  if (playerIndex < 0) {
    return false;
  }

  const windowText = text.slice(
    Math.max(0, playerIndex - 220),
    Math.min(text.length, playerIndex + 260)
  );

  const hasTargetNearPlayer = looseIncludesTeamName(windowText, team);
  const hasOpponentNearPlayer = opponent
    ? looseIncludesTeamName(windowText, opponent)
    : false;

  if (hasTargetNearPlayer && !hasOpponentNearPlayer) {
    return true;
  }

  if (hasOpponentNearPlayer && !hasTargetNearPlayer) {
    return false;
  }

  return false;
}

function buildExtractionSnippets(text, terms = []) {
  const value = normalizeText(text);
  const lower = value.toLowerCase();
  const snippets = [];
  const seen = new Set();

  for (const term of terms) {
    const needle = normalizeText(term).toLowerCase();
    if (!needle) continue;

    let index = lower.indexOf(needle);

    while (index >= 0 && snippets.length < 20) {
      const start = Math.max(0, index - 260);
      const end = Math.min(value.length, index + needle.length + 320);
      const snippet = value.slice(start, end).replace(/\s+/g, " ").trim();
      const key = `${needle}:${start}:${end}`;

      if (!seen.has(key)) {
        seen.add(key);
        snippets.push({
          term,
          snippet
        });
      }

      index = lower.indexOf(needle, index + needle.length);
    }
  }

  return snippets;
}



function extractStructuredFactsFromSources(input, sources = []) {
  const absences = [];
  const notes = [];
  const extractionSnippets = [];
  const evidenceSources = [];

  const extractionTerms = [
    input?.team,
    input?.opponent,

    "injury",
    "injuries",
    "injured",
    "suspended",
    "suspension",
    "doubt",
    "doubtful",
    "fitness",
    "team news",
    "lineup",
    "line-up",
    "starting xi",
    "squad",
    "absent",
    "available",
    "unavailable",
    "missing",
    "without"
  ].filter(Boolean);

  for (const rawSource of Array.isArray(sources) ? sources : []) {
    const source = normalizeSourceItem(rawSource);

    if (!source) {
      continue;
    }

    if (!sourceLooksRelevant(source, input)) {
      continue;
    }

    const text = normalizeText(source.text || source.title);

    evidenceSources.push(source);

    const snippets = buildExtractionSnippets(text, extractionTerms);

    for (const snippet of snippets) {
      extractionSnippets.push({
        ...snippet,
        source: source.url,
        title: source.title,
        publisher: source.publisher,
        sourceMode: source.sourceMode || null,
        sourceId: source.sourceId || null,
        sourceType: source.sourceType || null,
        trustTier: source.trustTier || null
      });
    }

    for (const absence of extractNamedAbsences(text, source)) {
      if (
        typeof absenceLooksAttributedToTarget === "function" &&
        !absenceLooksAttributedToTarget(absence, source, input)
      ) {
        continue;
      }

      absences.push(absence);
    }

    const trustedRegistryNote = buildTrustedRegistrySourceNote(source, input);

    if (trustedRegistryNote) {
      notes.push(trustedRegistryNote);

      if (trustedRegistryNote.type === "credible_selection_note") {
        continue;
      }
    }

    const credibleSearchHitNote = buildCredibleSearchHitNote(source, input);

    if (credibleSearchHitNote) {
      notes.push(credibleSearchHitNote);
      continue;
    }

    const note = buildSourceNote(source);

    if (note) {
      notes.push(note);
    }
  }

  const uniqueAbsences = new Map();

  for (const row of absences) {
    const key = `${normalizeText(row.player).toLowerCase()}|${normalizeText(row.type).toLowerCase()}`;

    if (!uniqueAbsences.has(key)) {
      uniqueAbsences.set(key, row);
    }
  }

  const uniqueNotes = new Map();

  for (const row of notes) {
    const key = [
      normalizeText(row.type).toLowerCase(),
      normalizeText(row.source).toLowerCase(),
      normalizeText(row.value).slice(0, 160).toLowerCase()
    ].join("|");

    if (!uniqueNotes.has(key)) {
      uniqueNotes.set(key, row);
    }
  }

  const uniqueSnippets = new Map();

  for (const row of extractionSnippets) {
    const key = [
      normalizeText(row.term).toLowerCase(),
      normalizeText(row.source).toLowerCase(),
      normalizeText(row.snippet).slice(0, 220).toLowerCase()
    ].join("|");

    if (!uniqueSnippets.has(key)) {
      uniqueSnippets.set(key, row);
    }
  }

  return {
    absences: Array.from(uniqueAbsences.values()).slice(0, 10),
    notes: Array.from(uniqueNotes.values()).slice(0, 6),
    extractionSnippets: Array.from(uniqueSnippets.values()).slice(0, 12),
    evidenceSources: evidenceSources.slice(0, 6)
  };
}
export async function runTeamNewsAIProvider(task) {
  const input = buildPrompt(task);

  if (!input.team || !input.opponent) {
    return buildUnresolved("missing_team_or_opponent", { input });
  }

  const collection = await collectTeamNewsSources(input);
  const sources = Array.isArray(collection) ? collection : collection?.sources;
  const diagnostics = Array.isArray(collection) ? null : collection?.diagnostics;

  const realSources = (Array.isArray(sources) ? sources : [])
    .map(normalizeSourceItem)
    .filter(Boolean)
    .filter(hasRealSource)
    .filter(source => sourceLooksRelevant(source, input));

  if (realSources.length === 0) {
    return buildUnresolved("no_real_team_news_sources", {
      input,
      provider: "team-news-ai-provider",
      mode: "source_agnostic_web_research_v1",
      sourceCount: 0,
      diagnostics
    });
  }

  const extracted = extractStructuredFactsFromSources(input, realSources);

  const sourceAvailableNotes = extracted.notes.filter(note =>
    note?.type === "source_available_note"
  );

  const canonicalNotes = extracted.notes.filter(note => {
    const type = note?.type;
    const blocked = note?.meta?.blockedAsEvidence === true;

    if (blocked) {
      return false;
    }

    return (
      type === "credible_selection_note" ||
      type === "credible_expected_lineup_note" ||
      type === "source_available_note"
    );
  });

  const writeNotes = [
    ...canonicalNotes,
    ...sourceAvailableNotes
  ];

  if (extracted.absences.length === 0 && writeNotes.length === 0) {
    return buildUnresolved("no_canonical_team_news_facts_extracted", {
      input,
      sourceCount: realSources.length,
      provider: "team-news-ai-provider",
      mode: "source_agnostic_web_research_v1",
      diagnostics,
      sourceAvailableNotes,
      extractionSnippets: extracted.extractionSnippets || [],
      evidenceSources: extracted.evidenceSources || []
    });
  }

  const factsValue = {
    key: "team_news",
    status: "resolved",
    data: {
      team: input.team,
      opponent: input.opponent,
      absences: extracted.absences,
      notes: writeNotes,
      sourceAvailableNotes,
      sources: extracted.evidenceSources.map(source => ({
        title: source.title,
        url: source.url,
        publisher: source.publisher,
        publishedAt: source.publishedAt,
        sourceMode: source.sourceMode || null,
        sourceId: source.sourceId || null,
        sourceType: source.sourceType || null,
        trustTier: source.trustTier || null
      })),
      extractionSnippets: extracted.extractionSnippets || []
    },
    confidence: extracted.absences.length > 0 ? 0.64 : 0.56,
    source: "source-agnostic-web-research"
  };

  return {
    status: "resolved",
    absences: extracted.absences,
    notes: canonicalNotes,
    evidence: [
      {
        type: writeNotes[0]?.type || "credible_selection_note",
        label: `trusted registry team-news note for ${input.team}`,
        value: writeNotes[0] || null,
        source: writeNotes[0]?.source || "team-news-ai-provider.source_agnostic_web_research_v1",
        confidence: writeNotes[0]?.confidence || factsValue.confidence
      },
      {
        type: "researched_facts_team_news",
        label: `source-agnostic team news for ${input.team}`,
        value: factsValue,
        source: "team-news-ai-provider.source_agnostic_web_research_v1",
        confidence: factsValue.confidence
      }
    ],
    input,
    sourceCount: realSources.length,
    provider: "team-news-ai-provider",
    mode: "source_agnostic_web_research_v1",
    diagnostics,
    extractionSnippets: extracted.extractionSnippets || [],
    evidenceSources: extracted.evidenceSources || []
  };
}