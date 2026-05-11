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

function buildFallbackRequired(reason, extra = {}) {
  return {
    status: "fallback_required",
    absences: [],
    notes: [],
    evidence: [
      {
        type: "fallback_team_news_required",
        label: "fallback team-news intelligence required",
        value: {
          reason,
          nextLayer: "recent_lineups_usage_analysis",
          description: "No reliable team-news article sources were found; fallback should infer availability from recent lineups and player usage."
        },
        source: "team-news-ai-provider.fallback",
        confidence: 0.35
      }
    ],
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
  const text = normalizeText(source?.text);

  if (
    isBlockedNoisePublisher(url) ||
    isBlockedNoisePublisher(publisher) ||
    isBlockedSourceDomain(url) ||
    isBlockedSourceDomain(publisher) ||
    isSearchPageSource(source)
  ) {
    return false;
  }

  const haystack = [
    title,
    url,
    publisher,
    text
  ].filter(Boolean).join(" ").toLowerCase();

  const team = normalizeText(input?.team).toLowerCase();
  const opponent = normalizeText(input?.opponent).toLowerCase();

  if (!haystack || !team) return false;

  const hasTeam = haystack.includes(team);
  const hasOpponent = opponent ? haystack.includes(opponent) : false;

  const hasFootballSignal =
    /\bfootball\b/i.test(haystack) ||
    /\bsoccer\b/i.test(haystack) ||
    /\bfutbol\b/i.test(haystack) ||
    /\bfútbol\b/i.test(haystack) ||
    /\bteam-news\b/i.test(haystack) ||
    /\bteam news\b/i.test(haystack) ||
    /\bpreview\b/i.test(haystack) ||
    /\bmatch preview\b/i.test(haystack) ||
    /\binjur/i.test(haystack) ||
    /\bsuspend/i.test(haystack) ||
    /\blineup\b/i.test(haystack) ||
    /\bline-up\b/i.test(haystack) ||
    /\bsquad\b/i.test(haystack) ||
    /\bmatch\b/i.test(haystack) ||
    /\bfc\b/i.test(haystack) ||
    /\bpremier league\b/i.test(haystack) ||
    /\bskysports\b/i.test(haystack) ||
    /\bbbc\b/i.test(haystack) ||
    /\bflashscore\b/i.test(haystack);

  const blockedNoise =
    /\bapp store\b/i.test(haystack) ||
    /\bgoogle play\b/i.test(haystack) ||
    /\bbank\b/i.test(haystack) ||
    /\bcasino\b/i.test(haystack) ||
    /\bdownload\b/i.test(haystack);

  if (blockedNoise && !hasTeam && !hasOpponent) return false;

  return hasTeam || hasOpponent || hasFootballSignal;
}

function hasPortugueseTeamNewsSignal(value) {
  const text = normalizeText(value).toLowerCase();

  return (
    /\bdesfalque\b/i.test(text) ||
    /\bdesfalques\b/i.test(text) ||
    /\bescalação\b/i.test(text) ||
    /\bescalacao\b/i.test(text) ||
    /\brelacionados\b/i.test(text) ||
    /\bprovável escalação\b/i.test(text) ||
    /\bprovavel escalacao\b/i.test(text) ||
    /\bprovável time\b/i.test(text) ||
    /\bprovavel time\b/i.test(text) ||
    /\bsuspenso\b/i.test(text) ||
    /\bsuspensos\b/i.test(text) ||
    /\blesionado\b/i.test(text) ||
    /\blesionados\b/i.test(text) ||
    /\bdepartamento médico\b/i.test(text) ||
    /\bdepartamento medico\b/i.test(text) ||
    /\bnão joga\b/i.test(text) ||
    /\bnao joga\b/i.test(text) ||
    /\bnão enfrenta\b/i.test(text) ||
    /\bnao enfrenta\b/i.test(text) ||
    /\bfora\b/i.test(text)
  );
}

function hasPortugueseAbsenceSignal(value) {
  const text = normalizeText(value).toLowerCase();

  return (
    hasPortugueseTeamNewsSignal(text) ||
    /\bnão terá\b/i.test(text) ||
    /\bnao tera\b/i.test(text) ||
    /\blesão\b/i.test(text) ||
    /\blesao\b/i.test(text) ||
    /\blesões\b/i.test(text) ||
    /\blesoes\b/i.test(text) ||
    /\bmachucado\b/i.test(text) ||
    /\bmachucados\b/i.test(text) ||
    /\bsuspensão\b/i.test(text) ||
    /\bsuspensao\b/i.test(text) ||
    /\bcartão\b/i.test(text) ||
    /\bcartao\b/i.test(text) ||
    /\bdúvida\b/i.test(text) ||
    /\bduvida\b/i.test(text) ||
    /\bdúvidas\b/i.test(text) ||
    /\bduvidas\b/i.test(text)
  );
}

function sourceLooksRelevant(source, input) {
  const text = normalizeText(
    `${source?.title || ""} ${source?.snippet || ""} ${source?.text || ""} ${source?.url || ""}`
  ).toLowerCase();

  const title = normalizeText(source?.title).toLowerCase();
  const url = normalizeText(source?.url).toLowerCase();

  const team = normalizeText(input?.team).toLowerCase();
  const opponent = normalizeText(input?.opponent).toLowerCase();

  if (!text || !team) return false;

  const hasTeam = text.includes(team);
  const hasOpponent = opponent ? text.includes(opponent) : false;

  // Πρέπει να υπάρχει τουλάχιστον η ομάδα-στόχος.
  // Δεν δεχόμαστε πλέον generic football pages μόνο επειδή γράφουν football/BBC/Sky.
  if (!hasTeam) {
    return false;
  }

  // Reject γνωστές παγίδες similar names.
  if (
    text.includes("deportivo la coruna") ||
    text.includes("rc deportivo") ||
    text.includes("deportivo coruna")
  ) {
    return false;
  }

  // Reject generic/listing/stat pages.
  if (
    /live score|livescore|h2h|head to head|standings|table|history|club info|team profile|squad overview|match stats|prediction/i.test(text)
  ) {
    return false;
  }

  // Reject league landing pages.
  if (
    /^bbc sport$/i.test(title) ||
    /championship - football - bbc sport/i.test(title) ||
    /league one - bbc sport/i.test(title) ||
    /league two - bbc sport/i.test(title) ||
    /premier league - football - bbc sport/i.test(title) ||
    /sky sports homepage/i.test(title) ||
    /football news, fixtures, results, table/i.test(title) ||
    /news, fixtures, results, table/i.test(title)
  ) {
    return false;
  }

  if (
    /bbc\.com\/sport\/football\/(premier-league|championship|league-one|league-two)\/?$/i.test(url) ||
    /skysports\.com\/(premier-league|championship|league-1|league-2)\/?$/i.test(url)
  ) {
    return false;
  }

  const hasTeamNewsSignal =
    /\bteam news\b/i.test(text) ||
    /\binjury\b/i.test(text) ||
    /\binjuries\b/i.test(text) ||
    /\binjury update\b/i.test(text) ||
    /\bsuspension\b/i.test(text) ||
    /\bsuspended\b/i.test(text) ||
    /\blineup\b/i.test(text) ||
    /\bline-up\b/i.test(text) ||
    /\bexpected lineup\b/i.test(text) ||
    /\bpredicted lineup\b/i.test(text) ||
    /\bstarting xi\b/i.test(text) ||
    /\bsquad news\b/i.test(text) ||
    /\bmatch preview\b/i.test(text) ||
    /\bpreview\b/i.test(text) ||
    /\bconfirmed absences\b/i.test(text) ||
    /\bunavailable\b/i.test(text) ||
    /\bruled out\b/i.test(text) ||
    /\bdoubtful\b/i.test(text) ||
    /\bconvocados\b/i.test(text) ||
    /\bconvocatoria\b/i.test(text) ||
    /\bnomina\b/i.test(text) ||
    /\bnómina\b/i.test(text) ||
    /\blineacion\b/i.test(text) ||
    /\balineación\b/i.test(text) ||
    /\blesion\b/i.test(text) ||
    /\blesión\b/i.test(text) ||
    /\blesionados\b/i.test(text) ||
    /\bsuspendidos\b/i.test(text) ||
    /\bbajas\b/i.test(text);

  const hasMatchSignal =
    hasOpponent ||
    /\bvs\b/i.test(text) ||
    /\bversus\b/i.test(text) ||
    /\bv\b/i.test(text);

  return hasTeamNewsSignal || hasPortugueseTeamNewsSignal(text) || hasMatchSignal;
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


function decodeJsonishScalar(value) {
  const raw = normalizeText(value);

  if (!raw) {
    return "";
  }

  try {
    return JSON.parse(`"${raw.replace(/`/g, "\\`")}"`);
  } catch {
    return decodeHtml(raw)
      .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\\//g, "/")
      .replace(/\\"/g, '"')
      .replace(/\\n|\\r|\\t/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
}

function extractJsonishRegistryLinks(html, baseUrl, row) {
  const out = [];
  const safeHtml = decodeHtml(String(html || ""));
  const patterns = [
    /"title"\s*:\s*"((?:\\.|[^"\\]){4,240})"[\s\S]{0,700}?"url"\s*:\s*"((?:\\.|[^"\\]){2,700})"/gi,
    /"url"\s*:\s*"((?:\\.|[^"\\]){2,700})"[\s\S]{0,700}?"title"\s*:\s*"((?:\\.|[^"\\]){4,240})"/gi,
    /"headline"\s*:\s*"((?:\\.|[^"\\]){4,240})"[\s\S]{0,700}?"url"\s*:\s*"((?:\\.|[^"\\]){2,700})"/gi,
    /"url"\s*:\s*"((?:\\.|[^"\\]){2,700})"[\s\S]{0,700}?"headline"\s*:\s*"((?:\\.|[^"\\]){4,240})"/gi
  ];

  for (const pattern of patterns) {
    const reversed = pattern.source.startsWith('"url"');

    for (const match of safeHtml.matchAll(pattern)) {
      const rawTitle = reversed ? match[2] : match[1];
      const rawUrl = reversed ? match[1] : match[2];
      const title = stripHtml(decodeJsonishScalar(rawTitle));
      const url = normalizeLinkedUrl(decodeJsonishScalar(rawUrl), baseUrl);

      if (!title || !url) {
        continue;
      }

      out.push({
        title,
        url,
        publisher: getPublisherFromUrl(url),
        sourceMode: "registry",
        sourceId: `${row.id}:article`,
        sourceType: "registry_article",
        trustTier: row.trustTier,
        parentSourceId: row.id,
        parentUrl: baseUrl
      });
    }
  }

  return out;
}

function shouldKeepRegistryArticleLink(link, input) {
  const title = normalizeText(link?.title);
  const url = normalizeText(link?.url);

  const haystack = [
    title,
    url
  ].filter(Boolean).join(" ").toLowerCase();

  const team = normalizeText(input?.team).toLowerCase();
  const opponent = normalizeText(input?.opponent).toLowerCase();

  if (!haystack) {
    return false;
  }

  const blockedNavTitle =
    /^(home|news|latest|latest news|all news|first team|first team news|fixtures|results|tickets|shop|store|players|fans|contact|login|sign up|search|club|teams|women|academy)$/i.test(title) ||
    /^(el equipo|club|plantel masculino|plantel femenino|fútbol joven|futbol joven|ramas deportivas|escuelas oficiales|noticias|contacto|socios|tienda|iniciar sesión|iniciar sesion|buscar|fútbol masculino|futbol masculino|fútbol femenino|futbol femenino)$/i.test(title);

  const blockedListingUrl =
    /\/news\/?$/i.test(url) ||
    /\/news\/latest\/?$/i.test(url) ||
    /\/news\/first-team\/?$/i.test(url) ||
    /\/en\/news\/?$/i.test(url) ||
    /\/en\/news\/all-news\/?$/i.test(url) ||
    /\/en\/news\/latest-mens-news\/?$/i.test(url) ||
    /\/category\/(campeonato-masculino|campeonato-femenino|futbol-joven|fútbol-joven)\/?$/i.test(url) ||
    /\/futbol-joven\/?$/i.test(url) ||
    /\/noticias\/?$/i.test(url);

  if (blockedNavTitle || blockedListingUrl) {
    return false;
  }

  const hasTeam = team ? haystack.includes(team) : false;
  const hasOpponent = opponent ? haystack.includes(opponent) : false;

  const hasStrongArticleSignal =
    /\bteam news\b/i.test(haystack) ||
    /\binjury\b/i.test(haystack) ||
    /\binjuries\b/i.test(haystack) ||
    /\binjury update\b/i.test(haystack) ||
    /\binjury latest\b/i.test(haystack) ||
    /\bsuspension\b/i.test(haystack) ||
    /\bsuspended\b/i.test(haystack) ||
    /\blineup\b/i.test(haystack) ||
    /\bline-up\b/i.test(haystack) ||
    /\bpredicted lineup\b/i.test(haystack) ||
    /\bexpected lineup\b/i.test(haystack) ||
    /\bstarting xi\b/i.test(haystack) ||
    /\bxi vs\b/i.test(haystack) ||
    /\bpreview\b/i.test(haystack) ||
    /\bmatch preview\b/i.test(haystack) ||
    /\bsquad\b/i.test(haystack) ||
    /\bprevia\b/i.test(haystack) ||
    /\bfecha\b/i.test(haystack) ||
    /\bjornada\b/i.test(haystack) ||
    /\bvs\b/i.test(haystack) ||
    /\bversus\b/i.test(haystack) ||
    /\bconvocados\b/i.test(haystack) ||
    /\bconvocatoria\b/i.test(haystack) ||
    /\bn[oó]mina\b/i.test(haystack) ||
    /\balineaci[oó]n\b/i.test(haystack) ||
    /\blesi[oó]n\b/i.test(haystack) ||
    /\blesionados\b/i.test(haystack) ||
    /\bsuspendidos\b/i.test(haystack) ||
    /\bbajas\b/i.test(haystack);

  const looksLikeArticleUrl =
    /\/news\/[^/?#]+/i.test(url) ||
    /\/en\/news\/[^/?#]+/i.test(url) ||
    /\/article\/[^/?#]+/i.test(url) ||
    /\/sport\/football\//i.test(url) ||
    /\/football\//i.test(url);

  const blockedGenericArticleUrl =
    /bbc\.com\/sport\/football\/(premier-league|championship|league-one|league-two)\/?$/i.test(url) ||
    /skysports\.com\/(premier-league|championship|league-1|league-2)\/?$/i.test(url) ||
    /\/football\/?$/i.test(url) ||
    /\/sport\/football\/?$/i.test(url);

  if (blockedGenericArticleUrl) {
    return false;
  }

  return (
    looksLikeArticleUrl &&
    (
      hasStrongArticleSignal ||
      (hasTeam && hasOpponent) ||
      (hasTeam && /\bvs\b|\bversus\b|\bv\b|\bpreview\b|\bmatch preview\b/i.test(haystack))
    )
  );
}

function scoreRegistryArticleLink(link, input) {
  const title = normalizeText(link?.title).toLowerCase();

  const url = normalizeText(link?.url).toLowerCase();

  const haystack = [
    title,
    url
  ].filter(Boolean).join(" ");

  const team = normalizeText(input?.team).toLowerCase();

  const opponent = normalizeText(input?.opponent).toLowerCase();

  let score = 0;

  if (team && haystack.includes(team)) {
    score += 4;
  }

  if (opponent && haystack.includes(opponent)) {
    score += 6;
  }

  if (/\bprevia\b/i.test(haystack)) {
    score += 8;
  }

  if (/\bfecha\b/i.test(haystack)) {
    score += 4;
  }

  if (/\bvs\b|\bversus\b/i.test(haystack)) {
    score += 4;
  }

  if (/convocados|convocatoria|n[oó]mina|citados|alineaci[oó]n|formaci[oó]n|lesion|lesi[oó]n|suspend|bajas|team news|injury update|injuries|suspensions|squad news|expected lineup|predicted lineup|match preview/i.test(haystack) || hasPortugueseTeamNewsSignal(haystack)) {
    score += 10;
  }

  if (/\/category\//i.test(url)) {
    score -= 6;
  }

  if (/\/noticias\/?$/i.test(url)) {
    score -= 6;
  }

  if (/\/futbol-joven\/?$/i.test(url)) {
    score -= 6;
  }

  return score;
}

function extractRegistryArticleLinksFromHtml(html, baseUrl, row, input) {
  const collected = [];
  const safeHtml = String(html || "");

  const rejectedLinks = [];

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
      if (rejectedLinks.length < 12) {
        rejectedLinks.push({
          title: link.title,
          url: link.url,
          reason: "shouldKeepRegistryArticleLink_false"
        });
      }
      continue;
    }

    collected.push({
      ...link,
      score: scoreRegistryArticleLink(link, input)
    });
  }



  for (const jsonLink of extractJsonishRegistryLinks(safeHtml, baseUrl, row)) {
    let host = null;

    try {
      host = new URL(jsonLink.url).hostname.replace(/^www\./i, "");
    } catch {
      host = null;
    }

    if (baseHost && host && host !== baseHost) {
      continue;
    }

    if (/\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|rar)$/i.test(jsonLink.url)) {
      continue;
    }

    const key = jsonLink.url.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    if (!shouldKeepRegistryArticleLink(jsonLink, input)) {
      if (rejectedLinks.length < 12) {
        rejectedLinks.push({
          title: jsonLink.title,
          url: jsonLink.url,
          reason: "shouldKeepRegistryArticleLink_false_json"
        });
      }
      continue;
    }

    collected.push({
      ...jsonLink,
      score: scoreRegistryArticleLink(jsonLink, input) + 3
    });
  }

    const kept = collected
      .filter(link => link.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map(({ score, ...link }) => link);

    kept.rejectedLinks = rejectedLinks;

    return kept;
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

    if (diagnostics.registryRejectedArticleSamples === undefined) {
      diagnostics.registryRejectedArticleSamples = [];
    }

    if (Array.isArray(articleLinks.rejectedLinks)) {
      diagnostics.registryRejectedArticleSamples.push(
        ...articleLinks.rejectedLinks.slice(0, 12 -     diagnostics.registryRejectedArticleSamples.length)
      );
    }

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

    // Μην χρησιμοποιείς registry landing/listing pages σαν evidence.
    // Οι registry σελίδες είναι μόνο για να βρούμε πραγματικά article links.
    // Canonical team-news πρέπει να βασίζεται σε article-level ή match/team-specific πηγή.
    const directRegistrySourceIsArticle = shouldKeepRegistryArticleLink(
      {
        title: source.title,
        url: source.url
      },
      input
    );

    if (!directRegistrySourceIsArticle) {
      continue;
    }

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

function classifySearchHtmlFailure(html) {
  const value = String(html || "");
  const lower = value.toLowerCase();

  const challengeSignals = [
    "challenges.cloudflare.com/turnstile",
    "cf-turnstile",
    "captcha",
    "verify you are human",
    "unusual traffic",
    "are you a robot",
    "enable javascript and cookies",
    "challenge-platform"
  ];

  if (challengeSignals.some(signal => lower.includes(signal))) {
    return "blocked_or_challenge_search_page";
  }

  if (/no results|nenhum resultado|não encontramos|n[aã]o encontramos|sem resultados/i.test(value)) {
    return "search_no_results_page";
  }

  return null;
}

function buildSearchAttempt(engine, html, rows) {
  const failureReason = classifySearchHtmlFailure(html);
  const resultCount = Array.isArray(rows) ? rows.length : 0;

  return {
    engine,
    ok: Boolean(html) && !failureReason,
    blocked: failureReason === "blocked_or_challenge_search_page",
    failureReason,
    htmlLength: html ? html.length : 0,
    resultCount
  };
}

async function searchWeb(query) {
  const attempts = [];
  const searchFetchTimeoutMs = Math.max(1000, Number(process.env.AIML_TEAM_NEWS_SEARCH_FETCH_TIMEOUT_MS || 12000));

  const ddgUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const ddgHtml = await fetchText(ddgUrl, { timeoutMs: searchFetchTimeoutMs, maxChars: 120000 });
  const ddgFailureReason = classifySearchHtmlFailure(ddgHtml);
  const ddgRows = ddgHtml && !ddgFailureReason ? parseDuckDuckGoResults(ddgHtml) : [];
  attempts.push(buildSearchAttempt("duckduckgo_html", ddgHtml, ddgRows));

  if (ddgRows.length > 0) {
    return { rows: ddgRows, attempts };
  }

  const ddgLiteUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
  const ddgLiteHtml = await fetchText(ddgLiteUrl, { timeoutMs: searchFetchTimeoutMs, maxChars: 120000 });
  const ddgLiteFailureReason = classifySearchHtmlFailure(ddgLiteHtml);
  const ddgLiteRows = ddgLiteHtml && !ddgLiteFailureReason ? parseDuckDuckGoLiteResults(ddgLiteHtml) : [];
  attempts.push(buildSearchAttempt("duckduckgo_lite", ddgLiteHtml, ddgLiteRows));

  if (ddgLiteRows.length > 0) {
    return { rows: ddgLiteRows, attempts };
  }

  const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  const bingHtml = await fetchText(bingUrl, { timeoutMs: searchFetchTimeoutMs, maxChars: 120000 });
  const bingFailureReason = classifySearchHtmlFailure(bingHtml);
  const bingRows = bingHtml && !bingFailureReason ? parseBingResults(bingHtml) : [];
  attempts.push(buildSearchAttempt("bing_html", bingHtml, bingRows));

  return {
    rows: bingRows,
    attempts
  };
}

function buildSearchQueries(input) {
  const team = normalizeText(input?.team);
  const opponent = normalizeText(input?.opponent);
  const leagueSlug = normalizeText(input?.leagueSlug);

  const teamAliases = team === "Manchester United"
    ? ["Manchester United", "Man Utd", "Man United"]
    : [team];

  const opponentAliases = opponent === "Manchester United"
    ? ["Manchester United", "Man Utd", "Man United"]
    : [opponent];

  const primaryTeam = teamAliases[0];
  const primaryOpponent = opponentAliases[0];

  const pair = [primaryTeam, primaryOpponent].filter(Boolean).join(" ");

  const aliasPairs = [];

  for (const t of teamAliases) {
    for (const o of opponentAliases) {
      if (t && o) aliasPairs.push([t, o]);
    }
  }

  const isBrazilContext =
    /^bra\./i.test(leagueSlug) ||
    /\b(Coritiba|Internacional|Palmeiras|Flamengo|Fluminense|Botafogo|Santos|Sao Paulo|São Paulo|Vasco|Gremio|Grêmio|Cruzeiro|Atletico Mineiro|Atlético Mineiro|Bahia|Fortaleza|Ceara|Ceará|Sport Recife|Vitoria|Vitória)\b/i.test(`${team} ${opponent}`);

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

  const brazilPriorityQueries = [
    `"${primaryTeam}" "${primaryOpponent}" desfalques relacionados provável escalação`,
    `"${primaryTeam}" "${primaryOpponent}" desfalques escalação provável`,
    `"${primaryTeam}" "${primaryOpponent}" relacionados desfalques`,
    `"${primaryTeam}" "${primaryOpponent}" provável time`,
    `"${primaryTeam}" "${primaryOpponent}" ge globo escalação desfalques`,
    `"${primaryTeam}" "${primaryOpponent}" lance escalação desfalques`,
    `"${primaryTeam}" desfalques relacionados escalação`,
    `"${primaryTeam}" provável escalação`,
    `site:ge.globo.com "${primaryTeam}" "${primaryOpponent}" desfalques`,
    `site:ge.globo.com "${primaryTeam}" provável escalação`,
    `site:lance.com.br "${primaryTeam}" "${primaryOpponent}" desfalques`,
    pair ? `${pair} desfalques escalação provável` : null,
    pair ? `${pair} relacionados desfalques` : null
  ];

  const englishQueries = aliasPairs.flatMap(([t, o]) => [
    `"${t}" "${o}" football team news injuries suspensions expected lineup`,
    `"${t}" "${o}" football preview team news`,
    `"${t}" "${o}" preview injuries lineup`,
    `"${t}" "${o}" match preview`,
    `"${t}" "${o}" confirmed team news injury latest`,
    `"${t}" "${o}" predicted lineup injury latest`,
    `${t} ${o} team news injury latest`,
    `${t} ${o} predicted lineup team news`
  ]);

  const simpleQueries = aliasPairs.flatMap(([t, o]) => [
    `${t} ${o} team news`,
    `${t} ${o} injuries`,
    `${t} ${o} lineup`,
    `${t} ${o} preview`,
    `${t} vs ${o} team news`,
    `${t} vs ${o} injuries`,
    `${t} squad news`,
    `${t} injury update`
  ]);

  const mexicoPriorityQueries = [
    `site:ligamx.net "${primaryTeam}" "${primaryOpponent}"`,
    `site:clubpuebla.com "${primaryOpponent}" convocatoria`,
    `"${primaryTeam}" "${primaryOpponent}" previa bajas lesionados`,
    `"${primaryTeam}" "${primaryOpponent}" convocatoria alineacion`,
    `"${primaryTeam}" "${primaryOpponent}" posible once`,
    pair ? `${pair} previa bajas lesionados` : null,
    pair ? `${pair} convocatoria alineacion` : null,
    pair ? `${pair} Liga MX previa` : null
  ];

  const spanishQueries = [
    `"${primaryTeam}" "${primaryOpponent}" previa bajas lesionados suspendidos alineacion`,
    `"${primaryTeam}" "${primaryOpponent}" previa convocados lesionados suspendidos`,
    `"${primaryTeam}" "${primaryOpponent}" posible once bajas lesionados`,
    `"${primaryTeam}" "${primaryOpponent}" convocatoria`,
    `"${primaryTeam}" lesionados suspendidos convocados`,
    `"${primaryTeam}" bajas lesionados convocatoria`,
    `"${primaryTeam}" alineacion probable`,
    pair ? `${pair} previa lesionados convocados` : null
  ];

  const norwegianQueries = [
    `"${primaryTeam}" "${primaryOpponent}" lagnyheter skader suspensjoner tropp`,
    `"${primaryTeam}" "${primaryOpponent}" forventet lagoppstilling`,
    `"${primaryTeam}" "${primaryOpponent}" preview team news`,
    `"${primaryTeam}" skader suspensjoner tropp`,
    `"${primaryTeam}" forventet lagoppstilling`
  ];

  const leagueQueries = [
    leagueSlug ? `"${primaryTeam}" ${leagueSlug} injuries suspensions squad news` : null,
    leagueSlug ? `"${primaryTeam}" ${leagueSlug} previa lesionados convocados` : null
  ];

  const baselineQueries = [
    `"${team}" "${opponent}" team news`,
    `"${team}" ${opponent} preview`,
    `"${team}" lineup`,
    `"${team}" injuries`,
    `"${team}" squad`,
    `${team} match preview`,
    `${team} squad`,
    `${team} lineup`,
    `${team} injuries`
  ];

  const prioritized = [
    ...(isBrazilContext ? brazilPriorityQueries : []),
    ...(isMexicoContext ? mexicoPriorityQueries : []),
    ...(isSpanishContext ? spanishQueries : []),
    ...(isNorwegianContext ? norwegianQueries : []),
    ...englishQueries,
    ...simpleQueries,
    ...leagueQueries,
    ...baselineQueries
  ];

  return [...new Set(prioritized.filter(Boolean).map(q => normalizeText(q)).filter(Boolean))];
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

  if (/convocados|convocatoria|n[oó]mina|citados|alineaci[oó]n|formaci[oó]n|lesion|lesi[oó]n|suspend|bajas/i.test(haystack) || hasPortugueseTeamNewsSignal(haystack)) {
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

function scoreFetchCandidateForTask(source, input) {
  const title = normalizeText(source?.title).toLowerCase();
  const url = normalizeText(source?.url).toLowerCase();
  const publisher = normalizeText(source?.publisher).toLowerCase();
  const sourceType = normalizeText(source?.sourceType).toLowerCase();
  const sourceMode = normalizeText(source?.sourceMode || source?.query).toLowerCase();
  const haystack = [title, url, publisher, sourceType].filter(Boolean).join(" ");
  const team = normalizeText(input?.team).toLowerCase();
  const opponent = normalizeText(input?.opponent).toLowerCase();

  let score = 0;

  if (team && haystack.includes(team)) score += 8;
  if (opponent && haystack.includes(opponent)) score += 12;

    if (/team news|injury update|injury latest|injuries|suspensions|squad news|confirmed team news|predicted lineup|expected lineup|lineups?|starting xi|xi vs|match preview|preview/i.test(haystack)) {
    score += 60;
  }

  if (/standard\.co\.uk|sports\.yahoo\.com|bbc\.co\.uk|skysports\.com|premierleague\.com|premierinjuries\.com|football\.london|manchestereveningnews\.co\.uk|theathletic\.com/i.test(haystack)) {
    score += 20;
  }

  if (/sofascore|flashscore|365scores|aiscore|besoccer|livesoccertv/i.test(haystack)) {
    score -= 45;
  }

  if (/preview|match preview|previa|bajas|lesionados|lesión|lesion|convocados|convocatoria|suspendidos|injuries|suspensions|team news|squad news/i.test(haystack) || hasPortugueseTeamNewsSignal(haystack)) {
    score += 40;
  }

  if (/official_club_news|official|registry/i.test(`${sourceType} ${sourceMode}`)) {
    score += 4;
  }

  if (/\/news\/?$|\/news\/latest\/?$|\/news\/first-team\/?$|\/en\/news\/?$|\/en\/news\/all-news\/?$|\/en\/news\/latest-mens-news\/?$/i.test(url)) {
    score -= 35;
  }

  if (/latest news|all news|first team news|club news/i.test(title) && !/team news|injury|lineup|preview|squad/i.test(title)) {
    score -= 25;
  }

  if (/\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|rar)$/i.test(url)) {
    score -= 100;
  }

  return score;
}

function sortFetchCandidatesForTask(candidates, input) {
  return (Array.isArray(candidates) ? candidates : [])
    .map((source, index) => ({
      source,
      index,
      score: scoreFetchCandidateForTask(source, input)
    }))
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .map(row => row.source);
}

async function collectTeamNewsSources(input) {
  const maxSearchResults = clamp(process.env.AIML_TEAM_NEWS_MAX_SEARCH_RESULTS || 8, 1, 12);
  const maxFetchedPages = clamp(process.env.AIML_TEAM_NEWS_MAX_FETCHED_PAGES || 6, 0, 10);
  const maxSearchQueries = clamp(process.env.AIML_TEAM_NEWS_MAX_SEARCH_QUERIES || 5, 1, 8);
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
    registry: null
  };

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

  // 1) ΠΡΩΤΑ search results, γιατί αυτά δίνουν πραγματικά articles.
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
      candidates.push({ ...source, query, sourceMode: "search" });

      if (diagnostics.sampleCandidates.length < 8) {
        diagnostics.sampleCandidates.push({
          title: source.title,
          url: source.url,
          publisher: source.publisher,
          query
        });
      }

      if (candidates.length >= maxSearchResults * 1.5) break;
    }

    if (candidates.length >= maxSearchResults) break;
  }

  // 2) Μετά registry, μόνο ως fallback / trusted enrichment.
  for (const source of registrySources) {
    if (!source?.url) continue;
    if (seen.has(source.url)) continue;

    seen.add(source.url);

    candidates.push({
      ...source,
      query: "registry",
      sourceMode: "registry"
    });

    if (diagnostics.sampleCandidates.length < 8) {
      diagnostics.sampleCandidates.push({
        title: source.title,
        url: source.url,
        publisher: source.publisher,
        query: "registry"
      });
    }

    if (candidates.length >= maxSearchResults) break;
  }

  diagnostics.candidateCount = candidates.length;

  const fetchOrderedCandidates = sortFetchCandidatesForTask(candidates, input);

  diagnostics.fetchPrioritySamples = fetchOrderedCandidates
    .slice(0, 8)
    .map(source => ({
      title: source.title,
      url: source.url,
      publisher: source.publisher,
      query: source.query,
      sourceMode: source.sourceMode,
      sourceType: source.sourceType,
      trustTier: source.trustTier,
      score: scoreFetchCandidateForTask(source, input)
    }));

  const enriched = [];

  for (const source of fetchOrderedCandidates.slice(0, maxFetchedPages)) {
    const html = await fetchText(source.url, {
      timeoutMs: enrichedFetchTimeoutMs,
      maxChars: 120000
    });

    const text = html
      ? stripHtml(html).slice(0, 12000)
      : source.text;

    enriched.push({
      ...source,
      text: text || source.text || source.title
    });
  }

  for (const source of fetchOrderedCandidates.slice(maxFetchedPages)) {
    enriched.push(source);
  }

  const normalized = enriched
    .map(normalizeSourceItem)
    .filter(Boolean);

  const realSources = normalized.filter(hasRealSource);
  const relevantSources = realSources
    .filter(source => sourceLooksRelevant(source, input))
    .filter(source => scoreFetchCandidateForTask(source, input) >= 0);

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
  /under\s+\d+/i,
  /sky\s+sports/i,
  /sky\s+bet/i,
  /watch\s+sky/i,
  /sports\s+homepage/i,
  /skip\s+to/i,
  /cricket\s+rugby/i,
  /rugby\s+union/i,
  /rugby\s+league/i,
  /racing\s+darts/i,
  /darts\s+netball/i
];

const BAD_ABSENCE_NAVIGATION_TEXT_RE =
  /\b(skip|homepage|watch|bet|cricket|rugby|union|league|golf|racing|darts|netball|tennis|boxing|nfl|nba|formula\s*1|f1|more\s+sports|sports\s+news|live\s+scores|video|podcast|newsletter|sign\s+in|log\s+in|subscribe|advertisement|privacy|cookies?)\b/i;



function looksLikeBadAbsencePlayerName(player) {
  const value = normalizeText(player);
  const lower = value.toLowerCase();

  if (!value) return true;
  if (value.length < 4 || value.length > 55) return true;

  if (BAD_ABSENCE_PLAYER_PATTERNS.some(pattern => pattern.test(value))) {
    return true;
  }

  if (BAD_ABSENCE_NAVIGATION_TEXT_RE.test(value)) {
    return true;
  }

  if (
    lower === "background" ||
    lower === "foreground" ||
    lower === "color" ||
    lower === "font" ||
    lower === "standard" ||
    lower.includes("var(") ||
    lower.includes("--") ||
    lower.includes("_base") ||
    lower.includes("component") ||
    lower.includes("siteheader") ||
    lower.includes("footer")
  ) {
    return true;
  }

  if (value === lower) {
    return true;
  }

  const words = value.split(/\s+/).filter(Boolean);

  if (words.length < 2 || words.length > 4) {
    return true;
  }

  if (words.some(word => word.length < 2)) {
    return true;
  }

  const sportsMenuWordCount = words.map(word => word.toLowerCase()).filter(word =>
    [
      "sky",
      "sports",
      "skip",
      "homepage",
      "watch",
      "bet",
      "cricket",
      "rugby",
      "union",
      "league",
      "golf",
      "racing",
      "darts",
      "netball",
      "tennis",
      "boxing"
    ].includes(word)
  ).length;

  if (sportsMenuWordCount >= 2) {
    return true;
  }

  if (
    /\b(home|away|match|club|news|preview|lineup|fixtures|results|standings|table|tickets|shop|history|honours|background|foreground|component|footer|header)\b/i.test(lower)
  ) {
    return true;
  }

  if (!/[A-Za-z?-??-??-?]/.test(value)) {
    return true;
  }

  return false;
}

function classifyAbsenceFromText(value) {
  const text = normalizeText(value).toLowerCase();

  if (/red card|κόκκινη|suspend|suspended|suspension|ban|banned|τιμωρ/i.test(text)) {
    return { type: "suspension", status: "out" };
  }

  if (/doubt|doubtful|αμφίβολος|questionable|χτύπημα|knock/i.test(text)) {
    return { type: "injury", status: "doubtful" };
  }

  if (/injur|τραυματισ|muscle|hamstring|knee|groin|back|ankle|thigh|acl|μέση|γόνατο|βουβων|μηρια|πόδι|μυϊκ/i.test(text)) {
    return { type: "injury", status: "out" };
  }

  if (/unavailable|ruled out|sidelined|absent|εκτός|δεν θα αγωνισ/i.test(text)) {
    return { type: "absence", status: "out" };
  }

  return null;
}

function normalizeCompactPlayerName(player) {
  const value = normalizeText(player)
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, " ")
    .trim();

  return value;
}

function extractNamedAbsences(text, source) {
  const out = [];
  const safeText = normalizeText(text).replace(/\s+/g, " ");

  const sentencePatterns = [
    /([A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+(?:\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+){0,3})\s+(?:is|are|was|were)?\s*(?:ruled out|sidelined|injured|suspended|doubtful|a doubt|unavailable)/g,
    /(?:without|missing|absent)\s+([A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+(?:\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+){0,3})/g,
    /([A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+(?:\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+){0,3})\s+will\s+miss/g
  ];

  for (const pattern of sentencePatterns) {
    for (const match of safeText.matchAll(pattern)) {
      const player = normalizeCompactPlayerName(match[1]);
      if (looksLikeBadAbsencePlayerName(player)) continue;

      const context = safeText.slice(Math.max(0, match.index - 100), match.index + 180);
      const classified = classifyAbsenceFromText(context);
      if (!classified) continue;

      out.push({
        player,
        type: classified.type,
        status: classified.status,
        reason: normalizeText(context).slice(0, 220),
        source: source?.url || source?.publisher || source?.title || null,
        confidence: 0.66
      });
    }
  }

  const compactPatterns = [
    /([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+(?:\s+[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+){0,2}\s+[A-Z]\.)\s+([^.;|]{0,90}(?:injur|τραυματισ|red card|κόκκινη|suspend|τιμωρ|doubt|χτύπημα|muscle|hamstring|knee|groin|back|acl|μέση|γόνατο|βουβων|μηρια|πόδι|μυϊκ)[^.;|]{0,90})/gi,
    /([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+(?:\s+[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+){0,3})\s*[-–—:]\s*([^.;|]{0,90}(?:injur|τραυματισ|red card|κόκκινη|suspend|τιμωρ|doubt|χτύπημα|muscle|hamstring|knee|groin|back|acl|μέση|γόνατο|βουβων|μηρια|πόδι|μυϊκ)[^.;|]{0,90})/gi
  ];

  for (const pattern of compactPatterns) {
    for (const match of safeText.matchAll(pattern)) {
      const player = normalizeCompactPlayerName(match[1]);
      const reason = normalizeText(match[2]);

      if (looksLikeBadAbsencePlayerName(player)) continue;

      const classified = classifyAbsenceFromText(reason);
      if (!classified) continue;

      out.push({
        player,
        type: classified.type,
        status: classified.status,
        reason: reason.slice(0, 220),
        source: source?.url || source?.publisher || source?.title || null,
        sourceTitle: source?.title || null,
        sourcePublisher: source?.publisher || null,
        sourceTrustTier: source?.trustTier || null,
        confidence: 0.62
      });
    }
  }

  const unique = new Map();

  for (const row of out) {
    const key = `${row.player.toLowerCase()}|${row.type}|${row.status}`;
    if (!unique.has(key)) unique.set(key, row);
  }

  return Array.from(unique.values()).slice(0, 12);
}


function validateExtractedAbsences(absences, sources, input) {
  if (!Array.isArray(absences) || absences.length === 0) return [];

  const targetTeam = normalizeText(input?.team).toLowerCase();
  const opponentTeam = normalizeText(input?.opponent).toLowerCase();

  const trustedDomains = [
    "manutd.com",
    "brentfordfc.com",
    "premierleague.com",
    "bbc",
    "sky",
    "skysports",
    "theguardian",
    "espn",
    "football.london",
    "manchestereveningnews",
    "ge.globo.com",
    "globo.com",
    "lance.com.br",
    "uol.com.br",
    "gazetaesportiva.com",
    "90min.com",
    "sportingnews.com",
    "esportenewsmundo.com.br",
    "santistas.net",
    "msn.com"
  ];

  const teamTokens = targetTeam
    .split(/\s+/)
    .map(v => v.trim())
    .filter(v => v.length >= 4);

  const opponentTokens = opponentTeam
    .split(/\s+/)
    .map(v => v.trim())
    .filter(v => v.length >= 4);

  const hasTeamSignal = (text, tokens) => {
    const value = normalizeText(text).toLowerCase();
    if (!value || tokens.length === 0) return false;
    if (targetTeam && value.includes(targetTeam)) return true;
    return tokens.some(token => value.includes(token));
  };

  const hasOpponentSignal = (text) => {
    const value = normalizeText(text).toLowerCase();
    if (!value || opponentTokens.length === 0) return false;
    if (opponentTeam && value.includes(opponentTeam)) return true;
    return opponentTokens.some(token => value.includes(token));
  };

  const valid = [];

  for (const a of absences) {
    const player = normalizeText(a?.player);
    const reason = normalizeText(a?.reason);
    const source = normalizeText(a?.source).toLowerCase();
    const sourceTitle = normalizeText(a?.sourceTitle).toLowerCase();
    const sourcePublisher = normalizeText(a?.sourcePublisher).toLowerCase();
    const sourceTrustTier = normalizeText(a?.sourceTrustTier).toLowerCase();

    if (!player) continue;
    if (looksLikeBadAbsencePlayerName(player)) continue;

    if (
      BAD_ABSENCE_NAVIGATION_TEXT_RE.test(player) ||
      BAD_ABSENCE_NAVIGATION_TEXT_RE.test(reason) ||
      BAD_ABSENCE_NAVIGATION_TEXT_RE.test(sourceTitle) ||
      BAD_ABSENCE_NAVIGATION_TEXT_RE.test(sourcePublisher)
    ) {
      continue;
    }

    if (!/^[\p{L}'’.\- ]+$/u.test(player)) continue;

    const normalizedPlayer = normalizeText(player).toLowerCase();
    const normalizedTargetTeam = normalizeText(targetTeam).toLowerCase();
    const normalizedOpponent = normalizeText(input?.opponent || "").toLowerCase();

    const playerWords = normalizedPlayer.split(/\s+/).filter(Boolean);
    if (playerWords.length < 1 || playerWords.length > 3) continue;

    if (normalizedTargetTeam && normalizedPlayer === normalizedTargetTeam) continue;
    if (normalizedOpponent && normalizedPlayer === normalizedOpponent) continue;
    if (normalizedTargetTeam && normalizedTargetTeam.includes(normalizedPlayer) && playerWords.length > 1) continue;
    if (normalizedOpponent && normalizedOpponent.includes(normalizedPlayer) && playerWords.length > 1) continue;
    if (normalizedTargetTeam && normalizedPlayer.startsWith(normalizedTargetTeam + " ")) continue;
    if (normalizedOpponent && normalizedPlayer.startsWith(normalizedOpponent + " ")) continue;

    const blockedPlayerPhrasePattern =
      /\b(entrar|cadastrar|cadastre|sócio|socio|torcedor|torcedores|conheça|conheca|benef[ií]cios|destaques|últimas|ultimas|notícias|noticias|brasileir[aã]o|jogos|simulador|mundo|lance|campe[oõ]es|categorias|times|v[ií]deos|videos|tabelas|futebol|internacional|colunistas|galerias|assinar|newsletter|publicidade|cookies|privacidade|termos|menu|clube|história|historia|vila|belmiro|mascote|jogadores|elenco|ex-jogadores|ídolos|idolos|classificação|classificacao|onde|enquetes|expediente|contato|rodapé|rodape|conteúdo|conteudo|principal|pular|coluna|sobre|títulos|titulos|escalações|escalacoes|apita|institucional|anuncie|conosco|mídia|midia|política|politica|carreiras|business|negócios|negocios|esportivo|lutas|tênis|tenis|vôlei|volei)\b/i;

    if (blockedPlayerPhrasePattern.test(normalizedPlayer)) continue;

    if (
      /team|player|squad|coach|manager|background|foreground|component|footer|header|var\(|--|_base/i.test(player)
    ) {
      continue;
    }

    if (
      /var\(|--|_base|data-component|siteheader|footer|background|foreground/i.test(reason)
    ) {
      continue;
    }

    const hasAbsenceReason =
      /injur|suspend|sidelined|ruled out|unavailable|absent|doubt|doubtful|knock|hamstring|knee|ankle|groin|muscle|acl|red card|ban|banned/i.test(reason) ||
      hasPortugueseAbsenceSignal(reason);

    if (!hasAbsenceReason) continue;

    const isTrusted = trustedDomains.some(domain => source.includes(domain));
    if (!isTrusted) continue;

    const textualEvidence = [
      reason,
      sourceTitle,
      sourcePublisher
    ].filter(Boolean).join(" ").toLowerCase();

    const urlOnlyEvidence = source;

    const reasonHasTargetTeam = hasTeamSignal(reason, teamTokens);
    const textualHasTargetTeam = hasTeamSignal(textualEvidence, teamTokens);
    const textualHasOpponentTeam = hasOpponentSignal(textualEvidence);

    const isOfficialOrClubSource =
      sourceTrustTier === "official" ||
      sourceTrustTier === "club" ||
      sourceTrustTier === "team_official";

    if (!reasonHasTargetTeam && !isOfficialOrClubSource) {
      if (!textualHasTargetTeam) {
        continue;
      }

      if (textualHasOpponentTeam && !reasonHasTargetTeam) {
        continue;
      }
    }

    if (
      targetTeam &&
      !reasonHasTargetTeam &&
      !textualHasTargetTeam &&
      urlOnlyEvidence.includes(targetTeam)
    ) {
      continue;
    }

    valid.push({
      ...a,
      player,
      reason: reason.slice(0, 220),
      source: a.source || null
    });
  }

  const unique = new Map();

  for (const row of valid) {
    const key = `${row.player.toLowerCase()}|${row.type}|${row.status}`;
    if (!unique.has(key)) unique.set(key, row);
  }

  return Array.from(unique.values()).slice(0, 12);
}




function buildSourceNote(source = {}) {
  if (typeof source === "string") {
    const value = normalizeText(source);
    return value || "source";
  }

  const title = normalizeText(source?.title || source?.sourceTitle || source?.label || source?.name);
  const publisher = normalizeText(source?.publisher || source?.sourcePublisher || source?.domain || source?.site);
  const url = normalizeText(source?.url || source?.source || source?.href || source?.link);
  const snippet = normalizeText(source?.snippet || source?.description || source?.text || source?.summary);

  const parts = [];

  if (title) parts.push(title);
  if (publisher) parts.push("publisher: " + publisher);
  if (url) parts.push("source: " + url);
  if (snippet) parts.push("snippet: " + snippet.slice(0, 220));

  return parts.length > 0
    ? parts.join(" | ")
    : "source";
}

function buildCredibleSearchHitNote(source = {}) {
  if (typeof source === "string") {
    const value = normalizeText(source);
    return value || "credible search hit";
  }

  const title = normalizeText(source?.title || source?.sourceTitle || source?.label);
  const publisher = normalizeText(source?.publisher || source?.sourcePublisher || source?.domain);
  const url = normalizeText(source?.url || source?.source || source?.href);
  const snippet = normalizeText(source?.snippet || source?.description || source?.text);

  const parts = [];

  if (title) parts.push(title);
  if (publisher) parts.push("publisher: " + publisher);
  if (url) parts.push("source: " + url);
  if (snippet) parts.push("snippet: " + snippet.slice(0, 220));

  return parts.length > 0
    ? parts.join(" | ")
    : "credible search hit";
}

function buildTrustedRegistrySourceNote(source = {}) {
  const title = normalizeText(source?.title || source?.sourceTitle || source?.label);
  const publisher = normalizeText(source?.publisher || source?.sourcePublisher || source?.domain);
  const url = normalizeText(source?.url || source?.source || source?.href);

  const parts = [];

  if (title) parts.push(title);
  if (publisher) parts.push("publisher: " + publisher);
  if (url) parts.push("source: " + url);

  return parts.length > 0
    ? parts.join(" | ")
    : "trusted registry source";
}

function extractStructuredFactsFromSources(input, sources = []) {
  const absences = [];
  const notes = [];
  const evidenceSources = [];

  for (const rawSource of Array.isArray(sources) ? sources : []) {
    const source = normalizeSourceItem(rawSource);
    if (!source) continue;

    if (!sourceLooksRelevant(source, input)) continue;

    const text = normalizeText(source.text || source.title);
    evidenceSources.push(source);

    // --- Named extraction (existing)
    for (const absence of extractNamedAbsences(text, source)) {
      absences.push(absence);
    }

    // --- Simple sentence extraction (NEW)
    const sentences = text.split(/[\.\n]/);

    for (const rawSentence of sentences) {
      const sentence = normalizeText(rawSentence);
      if (!sentence) continue;

      if (
        !(/injur|suspend|ruled out|unavailable|miss|out|doubt|doubtful|knock|hamstring|knee|ankle|muscle/i.test(sentence) || hasPortugueseAbsenceSignal(sentence))
      ) {
        continue;
      }

      const matches = sentence.match(/\b\p{Lu}[\p{L}'’.\-]+(?:\s\p{Lu}[\p{L}'’.\-]+){1,2}\b/gu);
      if (!matches) continue;

      for (const name of matches) {
        if (looksLikeBadAbsencePlayerName(name)) continue;

        absences.push({
          player: name,
          type: /suspend|ban/i.test(sentence) ? "suspension" : "injury",
          status: /doubt|doubtful/i.test(sentence) ? "doubtful" : "out",
          reason: sentence.slice(0, 220),
          source: source.url || source.publisher || source.title || null,
          sourceTitle: source.title || null,
          sourcePublisher: source.publisher || null,
          sourceTrustTier: source.trustTier || null,
          confidence: 0.55
        });
      }
    }

    // --- Notes logic (unchanged)
    const trustedRegistryNote = buildTrustedRegistrySourceNote(source, input);
    if (trustedRegistryNote) {
      notes.push(trustedRegistryNote);
      if (trustedRegistryNote.type === "credible_selection_note") continue;
    }

    const credibleSearchHitNote = buildCredibleSearchHitNote(source, input);
    if (credibleSearchHitNote) {
      notes.push(credibleSearchHitNote);
      continue;
    }

    const note = buildSourceNote(source);
    if (note) notes.push(note);
  }

  // --- Dedup absences
  const uniqueAbsences = new Map();
  for (const row of absences) {
    const key = `${normalizeText(row.player).toLowerCase()}|${normalizeText(row.type).toLowerCase()}`;
    if (!uniqueAbsences.has(key)) {
      uniqueAbsences.set(key, row);
    }
  }

  // --- Dedup notes
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

  const rawAbsences = Array.from(uniqueAbsences.values());
  const validatedAbsences = validateExtractedAbsences(rawAbsences, evidenceSources, input);
  const finalNotes = Array.from(uniqueNotes.values()).slice(0, 6);
  const finalEvidenceSources = evidenceSources.slice(0, 6);

  return {
    absences: validatedAbsences,
    notes: finalNotes,
    evidenceSources: finalEvidenceSources,
    diagnostics: {
      evidenceSourceCount: finalEvidenceSources.length,
      rawAbsenceCount: rawAbsences.length,
      validatedAbsenceCount: validatedAbsences.length,
      rejectedAbsenceCount: Math.max(0, rawAbsences.length - validatedAbsences.length),
      noteCount: finalNotes.length
    }
  };
}

function deriveNoRealSourceReason(diagnostics) {
  const searchAttempts = Array.isArray(diagnostics?.searchAttempts)
    ? diagnostics.searchAttempts
    : [];

  const flatAttempts = searchAttempts.flatMap(item =>
    Array.isArray(item?.attempts) ? item.attempts : []
  );

  const blockedAttemptCount = flatAttempts.filter(attempt =>
    attempt?.blocked === true ||
    normalizeText(attempt?.failureReason) === "blocked_or_challenge_search_page"
  ).length;

  const attemptedSearchCount = flatAttempts.length;
  const successfulResultAttemptCount = flatAttempts.filter(attempt =>
    Number(attempt?.resultCount || 0) > 0
  ).length;

  const rawSearchCount = Number(diagnostics?.rawSearchCount || 0);
  const candidateCount = Number(diagnostics?.candidateCount || 0);
  const registryUsableCount = Number(diagnostics?.registry?.usableRegistryCount || 0);

  if (rawSearchCount === 0 && candidateCount === 0 && blockedAttemptCount > 0) {
    return {
      reason: "search_blocked_or_empty",
      fallbackReason: "search_access_blocked_or_empty_results",
      searchAvailability: {
        attemptedSearchCount,
        blockedAttemptCount,
        successfulResultAttemptCount,
        rawSearchCount,
        candidateCount,
        registryUsableCount
      }
    };
  }

  if (rawSearchCount === 0 && candidateCount === 0 && attemptedSearchCount > 0) {
    return {
      reason: "search_empty_no_team_news_sources",
      fallbackReason: "search_returned_no_usable_team_news_results",
      searchAvailability: {
        attemptedSearchCount,
        blockedAttemptCount,
        successfulResultAttemptCount,
        rawSearchCount,
        candidateCount,
        registryUsableCount
      }
    };
  }

  return {
    reason: "no_real_team_news_sources",
    fallbackReason: "no_reliable_team_news_article_sources",
    searchAvailability: {
      attemptedSearchCount,
      blockedAttemptCount,
      successfulResultAttemptCount,
      rawSearchCount,
      candidateCount,
      registryUsableCount
    }
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
    const noSourceReason = deriveNoRealSourceReason(diagnostics);

    return buildFallbackRequired(noSourceReason.reason, {
      input,
      provider: "team-news-ai-provider",
      mode: "source_agnostic_web_research_v1",
      sourceCount: 0,
      diagnostics,
      searchAvailability: noSourceReason.searchAvailability,
      fallback: {
        required: true,
        type: "recent_lineups_usage_analysis",
        reason: noSourceReason.fallbackReason,
        nextStep: "infer_missing_regular_players_from_recent_lineups"
      }
    });
  }

  const extracted = extractStructuredFactsFromSources(input, realSources);

  const sourceAvailableNotes = extracted.notes.filter(note =>
    note?.type === "source_available_note"
  );

  const canonicalNotes = extracted.notes.filter(note => {
    const type = normalizeText(note?.type).toLowerCase();
    const value = normalizeText(note?.value);
    const blocked = note?.meta?.blockedAsEvidence === true;

    if (blocked) {
      return false;
    }

    if (!value) {
      return false;
    }

    // Search/registry source availability is not canonical team news.
    // It only proves that a source exists, not that there is a verified absence,
    // confirmed lineup, or concrete team-news fact.
    if (/source reports team-news signal/i.test(value)) {
      return false;
    }

    if (/trusted registry source/i.test(value)) {
      return false;
    }

    if (/source was fetched/i.test(value)) {
      return false;
    }

    return (
      type === "credible_expected_lineup_note" ||
      type === "expected_lineup" ||
      type === "confirmed_absence_note" ||
      type === "confirmed_team_news_note" ||
      type === "reviewed_team_news_note"
    );
  });

  const writeNotes = canonicalNotes;
  const extractionDiagnostics = {
    ...(extracted.diagnostics || {}),
    realSourceCount: realSources.length,
    sourceAvailableNoteCount: sourceAvailableNotes.length,
    canonicalNoteCount: writeNotes.length,
    nonCanonicalNoteCount: Math.max(0, extracted.notes.length - writeNotes.length)
  };

  const hasOnlyNonCanonicalSignals =
    extracted.absences.length === 0 &&
    writeNotes.length === 0 &&
    extracted.notes.length > 0;

  if (hasOnlyNonCanonicalSignals) {
    return buildFallbackRequired("only_lineup_or_low_quality_selection_signals", {
      input,
      provider: "team-news-ai-provider",
      mode: "source_agnostic_web_research_v1",
      sourceCount: realSources.length,
      diagnostics,
      extractionDiagnostics,
      nonCanonicalNotes: extracted.notes.slice(0, 6),
      fallback: {
        required: true,
        type: "recent_lineups_usage_analysis",
        reason: "lineup_signals_found_but_no_confirmed_team_news_or_named_absences",
        nextStep: "infer_missing_regular_players_from_recent_lineups"
      }
    });
  }

  if (extracted.absences.length === 0 && writeNotes.length === 0) {
    return buildUnresolved("no_canonical_team_news_facts_extracted", {
      input,
      sourceCount: realSources.length,
      provider: "team-news-ai-provider",
      mode: "source_agnostic_web_research_v1",
      diagnostics,
      extractionDiagnostics,
      sourceAvailableNotes
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
      }))
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
    diagnostics
  };
}