import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const LINK_SURFACE_PATTERNS = [
  /fixtures?/i,
  /schedule/i,
  /calendar/i,
  /calendrier/i,
  /kalender/i,
  /spielplan/i,
  /terminliste/i,
  /results?/i,
  /resultats?/i,
  /standings?/i,
  /tables?/i,
  /table/i,
  /tabelle/i,
  /classement/i,
  /classification/i,
  /matchday/i,
  /matches?/i,
  /competition/i,
  /competitions/i,
  /season/i,
  /saison/i,
  /2025/i,
  /2026/i,
  /league/i,
  /cup/i,
  /pokal/i,
  /liga/i,
  /ligue/i,
  /serie/i,
  /division/i
];

const BLOCKED_LINK_PATTERNS = [
  /\/news(\/|\?|$)/i,
  /\/team-news/i,
  /\/videos?(\/|\?|$)/i,
  /\/photos?(\/|\?|$)/i,
  /\/tickets?(\/|\?|$)/i,
  /\/shop/i,
  /\/store/i,
  /\/privacy/i,
  /\/terms/i,
  /\/cookies/i,
  /\/login/i,
  /\/register/i,
  /\/account/i,
  /\/contact/i,
  /\/media/i,
  /\/press/i,
  /\/sponsors?/i,
  /\/partners?/i,
  /\/hospitality/i,
  /\/fantasy/i,
  /\/gaming/i,
  /\/esports/i,
  /\/team(\/|\?|$)/i,
  /\/teams(\/|\?|$)/i,
  /\/club(\/|\?|$)/i,
  /\/clubs(\/|\?|$)/i,
  /\/klubber(\/|\?|$)/i,
  /\/billetter(\/|\?|$)/i,
  /\/akkreditering(\/|\?|$)/i,
  /\/simulator(\/|\?|$)/i,
  /\/kaaringer(\/|\?|$)/i,
  /\/nyheder(\/|\?|$)/i,
  /\/running-competitions\/financial-distribution/i,
  /\/running-competitions\/our-competitions/i,
  /\/_next\//i,
  /\/_nuxt\//i,
  /\/static\//i,
  /\/assets?\//i,
  /\/resources\//i,
  /\/favicons?\//i,
  /editorial\.uefa\.com/i,
  /img\.uefa\.com/i,
  /akkreditering\.superliga\.dk/i,
  /\.(css|js|mjs|map|json|png|jpe?g|gif|webp|svg|ico|webmanifest|woff2?|ttf|eot)(\?|$)/i,
  /facebook\.com/i,
  /instagram\.com/i,
  /twitter\.com/i,
  /x\.com/i,
  /youtube\.com/i,
  /tiktok\.com/i,
  /linkedin\.com/i
];

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    output: "",
    limit: 120,
    perSnapshotLimit: 20,
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = String(argv[++i] || "").trim();
    else if (arg.startsWith("--input=")) args.input = arg.slice("--input=".length);
    else if (arg === "--output") args.output = String(argv[++i] || "").trim();
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else if (arg === "--limit") args.limit = Number(argv[++i] || 120);
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.slice("--limit=".length));
    else if (arg === "--per-snapshot-limit") args.perSnapshotLimit = Number(argv[++i] || 20);
    else if (arg.startsWith("--per-snapshot-limit=")) args.perSnapshotLimit = Number(arg.slice("--per-snapshot-limit=".length));
    else throw new Error(`unknown argument: ${arg}`);
  }

  if (!args.selfTest && !args.input) throw new Error("--input is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");

  args.limit = Number.isFinite(args.limit) && args.limit > 0 ? Math.floor(args.limit) : 120;
  args.perSnapshotLimit = Number.isFinite(args.perSnapshotLimit) && args.perSnapshotLimit > 0 ? Math.floor(args.perSnapshotLimit) : 20;

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

function snapshotsFrom(input) {
  return Array.isArray(input?.fetchedSourceSnapshots)
    ? input.fetchedSourceSnapshots
    : Array.isArray(input?.snapshots)
      ? input.snapshots
      : Array.isArray(input?.rows)
        ? input.rows
        : [];
}

function bodyTextOf(snapshot) {
  const direct = asText(
    snapshot.body ||
    snapshot.text ||
    snapshot.html ||
    snapshot.snapshotText ||
    snapshot.bodyText ||
    snapshot.rawBody ||
    snapshot.rawText ||
    snapshot.htmlText ||
    snapshot.responseBody ||
    snapshot.pageText ||
    snapshot.http?.body ||
    snapshot.http?.text ||
    snapshot.http?.html ||
    snapshot.http?.bodyText ||
    snapshot.http?.rawBody ||
    snapshot.http?.rawText ||
    snapshot.http?.content ||
    snapshot.response?.body ||
    snapshot.response?.text ||
    snapshot.response?.html ||
    ""
  );

  if (direct) return direct;

  if (typeof snapshot.content === "string") return snapshot.content;

  if (snapshot.content && typeof snapshot.content === "object") {
    return asText(
      snapshot.content.body ||
      snapshot.content.text ||
      snapshot.content.html ||
      snapshot.content.rawBody ||
      snapshot.content.rawText ||
      ""
    );
  }

  return "";
}

function finalUrlOf(snapshot) {
  return asText(snapshot.finalUrl || snapshot.resolvedUrl || snapshot.candidateUrl || snapshot.url);
}

function hostOfUrl(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function sameRegistrableHost(leftUrl, rightUrl) {
  const left = hostOfUrl(leftUrl);
  const right = hostOfUrl(rightUrl);
  if (!left || !right) return false;
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}

function canonicalizeUrl(value, baseUrl) {
  const raw = asText(value)
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/g, "/")
    .replace(/\\\//g, "/");

  if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("javascript:")) {
    return "";
  }

  try {
    const parsed = new URL(raw, baseUrl);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function extractLinksFromHtmlLikeText(text, baseUrl) {
  const links = [];
  const patterns = [
    /href\s*=\s*["']([^"']+)["']/gi,
    /"url"\s*:\s*"([^"]+)"/gi,
    /"href"\s*:\s*"([^"]+)"/gi,
    /\bhttps?:\/\/[^\s"'<>\\]+/gi
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const url = canonicalizeUrl(match[1] || match[0], baseUrl);
      if (url) links.push(url);
    }
  }

  return links;
}


function isBlockedExpandedUrl(url) {
  const raw = asText(url).toLowerCase();

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return true;
  }

  const host = parsed.hostname.replace(/^www\./, "");
  const pathname = parsed.pathname || "/";
  const fullPath = `${pathname}${parsed.search || ""}`;

  if (!host || !pathname) return true;

  if (/^(editorial|img)\.uefa\.com$/i.test(host)) return true;
  if (/^akkreditering\.superliga\.dk$/i.test(host)) return true;

  if (/\.(css|js|mjs|map|json|png|jpe?g|gif|webp|svg|ico|webmanifest|woff2?|ttf|eot)(\?|$)/i.test(fullPath)) return true;

  if (/\/(?:_next|_nuxt|static|assets?|resources|favicons?)(?:\/|$)/i.test(pathname)) return true;

  if (/\/(?:news|newsletter|nyheder|video|videos|photo|photos|ticket|tickets|billetter|shop|store|privacy|terms|cookies|login|register|account|contact|media|press|sponsor|sponsors|partner|partners|hospitality|fantasy|gaming|esports|team|teams|club|clubs|klub|klubs|klubber|akkreditering|simulator|kaaringer|kontakt|cookiepolitik|privatlivspolitik|nyhedsbrev|impressum|agb|datenschutz)(?:\/|\?|$)/i.test(pathname)) return true;

  if (/\/running-competitions\/(?:financial-distribution|our-competitions)/i.test(pathname)) return true;

  if (/u002f|betano|bookmaker|casino|odds/i.test(raw)) return true;

  return false;
}

function isRootOrLocaleOnlyExpandedUrl(url) {
  try {
    const parsed = new URL(asText(url).toLowerCase());
    const pathname = parsed.pathname || "/";
    return pathname === "/" || /^\/[a-z]{2}(-[a-z]{2})?\/?$/.test(pathname);
  } catch {
    return true;
  }
}

function surfaceScore(url, labelText = "") {
  const pathText = `${url} ${labelText}`.toLowerCase();
  let score = 0;
  const reasons = [];

  if (isBlockedExpandedUrl(url)) {
    return { score: -100, reasons: ["blocked_link_surface"] };
  }

  if (isRootOrLocaleOnlyExpandedUrl(url)) {
    return { score: -50, reasons: ["root_or_locale_link_surface"] };
  }

  const checks = [
    ["fixtures", /fixtures?|matches?|matchday/i, 45],
    ["schedule_calendar", /schedule|calendar|calendrier|kalender|spielplan|terminliste/i, 45],
    ["results", /results?|resultats?/i, 35],
    ["standings_table", /standings?|tables?|table|tabelle|classement|classification/i, 35],
    ["competition_surface", /competition|competitions|league|cup|pokal|liga|ligue|serie|division/i, 25],
    ["season_surface", /2025|2026|season|saison/i, 20],
    ["danish_standings", /stilling/i, 35],
    ["stats_surface", /stats/i, 20]
  ];

  for (const [reason, rx, points] of checks) {
    if (rx.test(pathText)) {
      score += points;
      reasons.push(reason);
    }
  }

  if (BLOCKED_LINK_PATTERNS.some((rx) => rx.test(pathText))) {
    score -= 100;
    reasons.push("blocked_link_surface");
  }

  return { score, reasons };
}

function snapshotMeta(snapshot) {
  return {
    leagueSlug: asText(snapshot.leagueSlug || snapshot.competitionSlug || snapshot.slug),
    competitionSlug: asText(snapshot.competitionSlug || snapshot.leagueSlug || snapshot.slug),
    name: asText(snapshot.name || snapshot.competitionName || snapshot.leagueSlug || snapshot.competitionSlug),
    competitionName: asText(snapshot.competitionName || snapshot.name || snapshot.leagueSlug || snapshot.competitionSlug),
    hostname: asText(snapshot.hostname || hostOfUrl(finalUrlOf(snapshot))).toLowerCase().replace(/^www\./, ""),
    sourceId: asText(snapshot.sourceId),
    sourceClass: asText(snapshot.sourceClass || "official_governing_or_competition_operator"),
    type: asText(snapshot.type || snapshot.sourceType),
    trustTier: asText(snapshot.trustTier || "league")
  };
}

function buildRows(input, options = {}) {
  const snapshots = snapshotsFrom(input);
  const candidates = [];
  const rejected = [];

  for (const snapshot of snapshots) {
    const baseUrl = finalUrlOf(snapshot);
    const body = bodyTextOf(snapshot);
    const meta = snapshotMeta(snapshot);

    if (!baseUrl || !body) {
      rejected.push({
        ...meta,
        baseUrl,
        rejectionReasons: ["missing_base_url_or_body"],
        snapshotKeys: Object.keys(snapshot).sort(),
        httpKeys: snapshot.http && typeof snapshot.http === "object" ? Object.keys(snapshot.http).sort() : [],
        contentKeys: snapshot.content && typeof snapshot.content === "object" ? Object.keys(snapshot.content).sort() : []
      });
      continue;
    }

    const rawLinks = extractLinksFromHtmlLikeText(body, baseUrl);
    const seenSnapshotUrls = new Set();
    const perSnapshot = [];

    for (const url of rawLinks) {
      if (seenSnapshotUrls.has(url.toLowerCase())) continue;
      seenSnapshotUrls.add(url.toLowerCase());

      if (!sameRegistrableHost(baseUrl, url)) {
        rejected.push({
          ...meta,
          baseUrl,
          candidateUrl: url,
          rejectionReasons: ["external_host"]
        });
        continue;
      }

      const scored = surfaceScore(url);
      if (scored.reasons.includes("blocked_link_surface") || scored.reasons.includes("root_or_locale_link_surface")) {
        rejected.push({
          ...meta,
          baseUrl,
          candidateUrl: url,
          score: scored.score,
          scoreReasons: scored.reasons,
          rejectionReasons: scored.reasons.includes("root_or_locale_link_surface") ? ["root_or_locale_link_surface"] : ["blocked_link_surface"]
        });
        continue;
      }

      if (scored.score < 25) {
        rejected.push({
          ...meta,
          baseUrl,
          candidateUrl: url,
          score: scored.score,
          scoreReasons: scored.reasons,
          rejectionReasons: ["missing_season_status_link_surface"]
        });
        continue;
      }

      perSnapshot.push({
        ...meta,
        candidateUrl: url,
        resolvedUrl: url,
        finalUrl: url,
        baseUrl,
        hostname: hostOfUrl(url),
        truthRole: "season_status_same_domain_expanded_link",
        readyForFetch: true,
        fetchPurpose: "season_status_same_domain_expanded_link_validation",
        validationIntent: "season_status_same_domain_expanded_link_validation",
        compositeScore: scored.score,
        scoreReasons: scored.reasons,
        urlClass: "fixture_calendar_results_standings_or_competition_link",
        sourceFetch: false,
        fetchState: "not_fetched",
        canonicalWrites: 0,
        productionWrite: false,
        dryRun: true
      });
    }

    perSnapshot.sort((a, b) => b.compositeScore - a.compositeScore);
    candidates.push(...perSnapshot.slice(0, options.perSnapshotLimit || 20));
  }

  const selected = [];
  const seen = new Set();

  for (const row of candidates.sort((a, b) => b.compositeScore - a.compositeScore)) {
    const key = `${row.leagueSlug}|${row.finalUrl}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(row);
    if (selected.length >= (options.limit || 120)) break;
  }

  return { selected, rejected, snapshotCount: snapshots.length };
}

function buildReport(input, options = {}) {
  const { selected, rejected, snapshotCount } = buildRows(input, options);

  return {
    ok: true,
    job: "extract-football-truth-season-status-links-from-official-snapshots-file",
    mode: "read_only_same_domain_link_expansion",
    generatedAt: new Date().toISOString(),
    summary: {
      inputSnapshotCount: snapshotCount,
      expandedCandidateUrlCount: selected.length,
      rejectedLinkCount: rejected.length,
      byLeague: selected.reduce((acc, row) => {
        acc[row.leagueSlug] = (acc[row.leagueSlug] || 0) + 1;
        return acc;
      }, {}),
      byHostname: selected.reduce((acc, row) => {
        acc[row.hostname] = (acc[row.hostname] || 0) + 1;
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
      usesOnlyFetchedOfficialSnapshots: true,
      sameDomainLinksOnly: true,
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
    candidateUrlRows: selected,
    rejectedLinkRows: rejected
  };
}

function runSelfTest() {
  const input = {
    fetchedSourceSnapshots: [
      {
        leagueSlug: "aut.1",
        competitionName: "Austrian Bundesliga",
        finalUrl: "https://www.bundesliga.at/",
        hostname: "www.bundesliga.at",
        body: `
          <a href="/de/spielplan/saison-2025-2026">Spielplan</a>
          <a href="/de/tabelle">Tabelle</a>
          <a href="https://external.example.com/fixtures">External</a>
          <a href="/de/news">News</a>
          <a href="/de/video">Video</a>
          <a href="/de/tickets">Tickets</a>
          <a href="/_next/static/app.js">Asset</a>
          <a href="/de/team/example">Team</a>
        `
      }
    ]
  };

  const report = buildReport(input, { limit: 10, perSnapshotLimit: 10 });
  if (!report.rankedCandidateUrlRows.find((row) => /spielplan/.test(row.finalUrl))) throw new Error("expected spielplan link");
  if (!report.rankedCandidateUrlRows.find((row) => /tabelle/.test(row.finalUrl))) throw new Error("expected tabelle link");
  if (report.rankedCandidateUrlRows.find((row) => /external\.example\.com/.test(row.finalUrl))) throw new Error("external link should be rejected");
  if (report.rankedCandidateUrlRows.find((row) => /\/news/.test(row.finalUrl))) throw new Error("news link should be rejected");
  if (report.rankedCandidateUrlRows.find((row) => /\/video/.test(row.finalUrl))) throw new Error("video link should be rejected");
  if (report.rankedCandidateUrlRows.find((row) => /\/tickets/.test(row.finalUrl))) throw new Error("tickets link should be rejected");
  if (report.rankedCandidateUrlRows.find((row) => /_next/.test(row.finalUrl))) throw new Error("asset link should be rejected");
  if (report.rankedCandidateUrlRows.find((row) => /\/team\//.test(row.finalUrl))) throw new Error("team link should be rejected");
  if (report.summary.expandedCandidateUrlCount < 2) throw new Error("expected at least two expanded links");
  if (report.guarantees.sameDomainLinksOnly !== true || report.guarantees.canonicalWrites !== 0) throw new Error("guarantees failed");

  return {
    ok: true,
    selfTest: "extract-football-truth-season-status-links-from-official-snapshots-file",
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

  const report = buildReport(readJson(args.input), {
    limit: args.limit,
    perSnapshotLimit: args.perSnapshotLimit
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