import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const argv = process.argv.slice(2);
const allowFetch = argv.includes("--allow-fetch");
const maxTargets = Number(argv.find(arg => arg.startsWith("--max-targets="))?.split("=")[1] || "24");

if (!allowFetch) {
  throw new Error("Refusing official-host direct route probing without --allow-fetch");
}

const planRowsPath = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `high-yield-previous-completed-official-route-search-batches-${today}`,
  `high-yield-previous-completed-official-route-search-batch-rows-${today}.jsonl`
);

const outputDir = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `direct-official-host-previous-completed-route-probe-${today}`
);

const outputPath = path.join(
  outputDir,
  `direct-official-host-previous-completed-route-probe-${today}.json`
);

const rowsOutputPath = path.join(
  outputDir,
  `direct-official-host-previous-completed-route-probe-rows-${today}.jsonl`
);

const hostMeta = new Map(Object.entries({
  "arg.1": { league: "Liga Profesional Argentina", expectedHosts: ["ligaprofesional.ar", "afa.com.ar"], terms: ["liga profesional", "argentina", "posiciones", "tabla"] },
  "aus.1": { league: "A-League Men", expectedHosts: ["aleagues.com.au"], terms: ["a-league men", "ladder", "standings"] },
  "aut.1": { league: "Austrian Bundesliga", expectedHosts: ["bundesliga.at"], terms: ["bundesliga", "tabelle", "austria"] },
  "bel.1": { league: "Jupiler Pro League", expectedHosts: ["proleague.be"], terms: ["jupiler pro league", "standings", "classement"] },
  "bra.1": { league: "Brasileirão Série A", expectedHosts: ["cbf.com.br"], terms: ["brasileiro", "série a", "classificação"] },
  "fra.1": { league: "Ligue 1", expectedHosts: ["ligue1.com", "ligue1.fr", "lfp.fr"], terms: ["ligue 1", "classement", "france"] },
  "gre.1": { league: "Super League Greece", expectedHosts: ["slgr.gr", "superleaguegreece.net"], terms: ["super league", "greece", "standings", "βαθμολογία"] },
  "kor.1": { league: "K League 1", expectedHosts: ["kleague.com"], terms: ["k league", "rank", "standings"] },
  "ksa.1": { league: "Saudi Pro League", expectedHosts: ["spl.com.sa"], terms: ["saudi pro league", "standings", "table"] },
  "mex.1": { league: "Liga MX", expectedHosts: ["ligamx.net"], terms: ["liga mx", "tabla", "general"] },
  "nor.1": { league: "Eliteserien", expectedHosts: ["eliteserien.no", "fotball.no"], terms: ["eliteserien", "tabell", "standings"] },
  "pol.1": { league: "Ekstraklasa", expectedHosts: ["ekstraklasa.org"], terms: ["ekstraklasa", "tabela", "standings"] },
  "por.1": { league: "Liga Portugal", expectedHosts: ["ligaportugal.pt"], terms: ["liga portugal", "classificação", "standings"] },
  "sui.1": { league: "Swiss Super League", expectedHosts: ["sfl.ch"], terms: ["super league", "swiss", "tabelle"] },
  "swe.1": { league: "Allsvenskan", expectedHosts: ["allsvenskan.se", "svenskfotboll.se"], terms: ["allsvenskan", "tabell", "standings"] },
  "tur.1": { league: "Süper Lig", expectedHosts: ["tff.org"], terms: ["süper lig", "super lig", "puan cetveli"] },
  "usa.1": { league: "Major League Soccer", expectedHosts: ["mlssoccer.com"], terms: ["mls", "standings", "major league soccer"] },
  "arg.2": { league: "Primera Nacional", expectedHosts: ["afa.com.ar"], terms: ["primera nacional", "argentina", "posiciones"] },
  "aus.2": { league: "National Premier Leagues", expectedHosts: ["footballaustralia.com.au"], terms: ["national premier leagues", "standings"] },
  "aut.2": { league: "2. Liga Austria", expectedHosts: ["2liga.at", "bundesliga.at"], terms: ["2. liga", "tabelle"] },
  "bel.2": { league: "Challenger Pro League", expectedHosts: ["proleague.be"], terms: ["challenger pro league", "standings"] },
  "bra.2": { league: "Brasileirão Série B", expectedHosts: ["cbf.com.br"], terms: ["brasileiro", "série b", "classificação"] },
  "cro.2": { league: "Prva NL", expectedHosts: ["hns.family"], terms: ["prva nl", "tablica"] },
  "den.2": { league: "1st Division Denmark", expectedHosts: ["divisionsforeningen.dk"], terms: ["1. division", "stilling"] }
}));

const pathTemplates = [
  "",
  "/",
  "/standings",
  "/standings/",
  "/table",
  "/table/",
  "/tables",
  "/tables/",
  "/ladder",
  "/ladder/",
  "/ranking",
  "/ranking/",
  "/rankings",
  "/rankings/",
  "/classement",
  "/classement/",
  "/tabelle",
  "/tabelle/",
  "/tabell",
  "/tabell/",
  "/tabla",
  "/tabla/",
  "/classificacao",
  "/classificacao/",
  "/classificação",
  "/classificação/",
  "/competition/standings",
  "/competitions/standings",
  "/league-table",
  "/league-table/",
  "/en/standings",
  "/en/table",
  "/en/ranking",
  "/en/classement",
  "/en/tabelle",
  "/en/competition/standings",
  "/en/league-table",
  "/2025/standings",
  "/2025-2026/standings",
  "/2025-26/standings"
];

const explicitRouteSeeds = {
  "aus.1": ["https://aleagues.com.au/a-league-men/ladder/"],
  "aut.1": ["https://www.bundesliga.at/de/bundesliga/tabelle/"],
  "bra.1": ["https://www.cbf.com.br/futebol-brasileiro/competicoes/campeonato-brasileiro-serie-a/2025"],
  "fra.1": ["https://www.ligue1.com/ranking", "https://www.ligue1.fr/classement"],
  "mex.1": ["https://ligamx.net/cancha/estadisticahistorica", "https://ligamx.net/cancha/tablaGeneral"],
  "pol.1": ["https://www.ekstraklasa.org/tabela"],
  "por.1": ["https://www.ligaportugal.pt/en/liga/classificacao"],
  "sui.1": ["https://www.sfl.ch/en/superleague/table/"],
  "swe.1": ["https://allsvenskan.se/tabell/", "https://www.svenskfotboll.se/serier-cuper/tabell-och-resultat/allsvenskan-2025/115765/"],
  "tur.1": ["https://www.tff.org/default.aspx?pageID=198"],
  "usa.1": ["https://www.mlssoccer.com/standings/"]
};

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function hostMatches(host, expectedHost) {
  const a = String(host || "").replace(/^www\./, "").toLowerCase();
  const b = String(expectedHost || "").replace(/^www\./, "").toLowerCase();
  return a === b || a.endsWith(`.${b}`);
}

function buildUrls(slug) {
  const meta = hostMeta.get(slug);
  if (!meta) return [];

  const urls = [];
  for (const seed of explicitRouteSeeds[slug] || []) urls.push(seed);

  for (const host of meta.expectedHosts) {
    for (const protocol of ["https"]) {
      for (const p of pathTemplates) {
        urls.push(`${protocol}://${host}${p}`);
        if (!host.startsWith("www.")) urls.push(`${protocol}://www.${host}${p}`);
      }
    }
  }

  return [...new Set(urls)].slice(0, 36);
}

function extractText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function titleOf(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? extractText(match[1]).slice(0, 200) : "";
}

function countMatches(text, terms) {
  const lower = text.toLowerCase();
  return terms.filter(term => lower.includes(term.toLowerCase())).length;
}

function classifyProbe({ slug, url, status, finalUrl, body }) {
  const meta = hostMeta.get(slug);
  const title = titleOf(body);
  const text = extractText(body).slice(0, 12000);
  const lower = text.toLowerCase();
  let host = "";
  try { host = new URL(finalUrl || url).hostname.replace(/^www\./, ""); } catch {}

  const expectedHostMatch = meta.expectedHosts.some(expected => hostMatches(host, expected));
  const termHitCount = countMatches(`${title} ${text}`, meta.terms);
  const tableTagCount = (String(body || "").match(/<table\b/gi) || []).length;
  const rowTagCount = (String(body || "").match(/<tr\b/gi) || []).length;
  const standingWordHit = ["standings", "table", "ranking", "classement", "tabelle", "tabell", "tabla", "classificação", "classificacao", "βαθμολογία"].some(term => lower.includes(term));
  const seasonHit = ["2025", "2025/26", "2025-26", "2025-2026"].some(term => lower.includes(term));
  const teamLikeSignalCount = (text.match(/\b[A-Z][a-zA-ZÀ-ÿ.'-]+(?:\s+[A-Z][a-zA-ZÀ-ÿ.'-]+){0,3}\b/g) || []).length;

  let score = 0;
  const signals = [];

  if (status >= 200 && status < 300) { score += 10; signals.push("http_2xx"); }
  if (expectedHostMatch) { score += 30; signals.push("expected_official_host"); }
  if (termHitCount > 0) { score += termHitCount * 12; signals.push(`term_hits_${termHitCount}`); }
  if (standingWordHit) { score += 15; signals.push("standing_word_hit"); }
  if (seasonHit) { score += 12; signals.push("season_2025_hit"); }
  if (tableTagCount > 0) { score += Math.min(25, tableTagCount * 8); signals.push(`table_tags_${tableTagCount}`); }
  if (rowTagCount >= 10) { score += 12; signals.push(`row_tags_${rowTagCount}`); }
  if (teamLikeSignalCount >= 20) { score += 8; signals.push("many_team_like_tokens"); }

  const routeProbeCandidate = score >= 55 && expectedHostMatch && status >= 200 && status < 300;

  return {
    host,
    title,
    bodyLength: String(body || "").length,
    textLength: text.length,
    tableTagCount,
    rowTagCount,
    termHitCount,
    standingWordHit,
    seasonHit,
    teamLikeSignalCount,
    candidateScore: score,
    signals,
    routeProbeCandidate,
    acceptanceAllowedNow: false,
    reviewOnly: true
  };
}

async function fetchUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 AI-MatchLab-FootballTruth/1.0"
      }
    });
    const body = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      body
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      finalUrl: url,
      body: "",
      error: `${error.name || "Error"}: ${error.message || String(error)}`
    };
  } finally {
    clearTimeout(timeout);
  }
}

await fs.mkdir(outputDir, { recursive: true });

if (!(await exists(planRowsPath))) {
  throw new Error(`Missing plan rows: ${path.relative(root, planRowsPath)}`);
}

const planRows = parseJsonl(await fs.readFile(planRowsPath, "utf8"));
const selectedSlugs = [...new Set(planRows.map(row => row.slug))]
  .filter(slug => hostMeta.has(slug))
  .slice(0, maxTargets);

const probeRows = [];
let fetchExecutedNowCount = 0;

for (const slug of selectedSlugs) {
  const urls = buildUrls(slug);
  console.log(`TARGET ${slug} urls=${urls.length}`);

  for (let i = 0; i < urls.length; i += 1) {
    const url = urls[i];
    console.log(`FETCH ${slug} ${i + 1}/${urls.length} ${url}`);

    const result = await fetchUrl(url);
    fetchExecutedNowCount += 1;

    const classified = classifyProbe({
      slug,
      url,
      status: result.status,
      finalUrl: result.finalUrl,
      body: result.body
    });

    probeRows.push({
      slug,
      league: hostMeta.get(slug).league,
      probeRank: i + 1,
      url,
      finalUrl: result.finalUrl,
      fetchOk: result.ok,
      status: result.status,
      error: result.error || null,
      ...classified
    });

    await new Promise(resolve => setTimeout(resolve, 120));
  }
}

const bySlug = {};
for (const slug of selectedSlugs) {
  const rows = probeRows.filter(row => row.slug === slug);
  const candidates = rows
    .filter(row => row.routeProbeCandidate)
    .sort((a, b) => b.candidateScore - a.candidateScore || a.probeRank - b.probeRank);

  bySlug[slug] = {
    probeCount: rows.length,
    fetched2xxCount: rows.filter(row => row.status >= 200 && row.status < 300).length,
    routeProbeCandidateCount: candidates.length,
    topCandidates: rows
      .slice()
      .sort((a, b) => b.candidateScore - a.candidateScore || a.probeRank - b.probeRank)
      .slice(0, 8)
      .map(row => ({
        url: row.url,
        finalUrl: row.finalUrl,
        status: row.status,
        host: row.host,
        title: row.title,
        candidateScore: row.candidateScore,
        routeProbeCandidate: row.routeProbeCandidate,
        signals: row.signals,
        tableTagCount: row.tableTagCount,
        rowTagCount: row.rowTagCount
      }))
  };
}

const routeProbeCandidateCount = probeRows.filter(row => row.routeProbeCandidate).length;

const report = {
  status: "passed",
  runner: "direct_official_host_previous_completed_route_probe",
  contractVersion: 1,
  purpose: "Controlled direct official-host route probing for previous_completed standings route discovery. Fetches only expected official hosts/templates; no search engine; no canonical/truth/production writes.",
  inputPlanRowsPath: path.relative(root, planRowsPath).replaceAll("\\", "/"),
  inputPlanRowsSha256: await sha256(planRowsPath),
  output: path.relative(root, outputPath).replaceAll("\\", "/"),
  rowsOutput: path.relative(root, rowsOutputPath).replaceAll("\\", "/"),
  guardrails: {
    allowFetch,
    searchExecutedNowCount: 0,
    fetchExecutedNowCount,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    selectedTargetCount: selectedSlugs.length,
    probeRowCount: probeRows.length,
    fetched2xxCount: probeRows.filter(row => row.status >= 200 && row.status < 300).length,
    routeProbeCandidateCount,
    reviewOnly: true,
    selectedSlugs
  },
  acceptance: {
    acceptedNowCount: 0,
    reason: "Direct probe candidates are route-level review evidence only. Acceptance still requires rendered/fetched table extraction, exact competition identity, previous_completed season label, expected row count, team signals, W/D/L/points arithmetic, GD arithmetic, non-trivial and duplicate gates."
  },
  bySlug
};

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsOutputPath, probeRows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary,
  bySlug: report.bySlug
}, null, 2));
