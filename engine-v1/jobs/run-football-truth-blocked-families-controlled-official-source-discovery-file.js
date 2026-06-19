import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = `data/football-truth/_diagnostics/blocked-families-controlled-official-source-discovery-${DATE}`;
const OUT = `${OUT_DIR}/blocked-families-controlled-official-source-discovery-${DATE}.json`;

if (!process.argv.includes("--allow-fetch")) throw new Error("Missing --allow-fetch");

const FAMILIES = {
  ksi: {
    competitionSlugs: ["isl.1", "isl.2"],
    hosts: ["www.ksi.is", "ksi.is"],
    seeds: [
      "https://www.ksi.is/",
      "https://www.ksi.is/mot/",
      "https://www.ksi.is/mot/stakt-mot/",
      "https://www.ksi.is/mot/motalisti/",
      "https://www.ksi.is/urslit-stada/"
    ],
    routeWords: ["stada", "staða", "tafla", "deild", "besta", "urslit", "úrslit", "mot", "mót", "standings", "table"]
  },
  torneopal: {
    competitionSlugs: ["fin.1", "fin.2"],
    hosts: ["tulospalvelu.palloliitto.fi", "www.palloliitto.fi", "palloliitto.fi", "www.veikkausliiga.com", "veikkausliiga.com", "www.ykkosliiga.fi", "ykkosliiga.fi"],
    seeds: [
      "https://tulospalvelu.palloliitto.fi/",
      "https://www.palloliitto.fi/",
      "https://www.veikkausliiga.com/",
      "https://www.veikkausliiga.com/tilastot",
      "https://www.ykkosliiga.fi/",
      "https://www.ykkosliiga.fi/tilastot"
    ],
    routeWords: ["sarjataulukko", "tilastot", "taulukko", "standings", "table", "veikkausliiga", "ykkosliiga", "tulospalvelu", "torneopal"]
  },
  cfa_cyprus_html: {
    competitionSlugs: ["cyp.1", "cyp.2"],
    hosts: ["www.cfa.com.cy", "cfa.com.cy", "www.cfa.org.cy", "cfa.org.cy"],
    seeds: [
      "https://www.cfa.com.cy/",
      "https://www.cfa.com.cy/En/competitions",
      "https://www.cfa.com.cy/En/competitions/1",
      "https://www.cfa.com.cy/En/competitions/2",
      "https://www.cfa.com.cy/Gr/competitions",
      "https://www.cfa.com.cy/Gr/competitions/1",
      "https://www.cfa.com.cy/Gr/competitions/2"
    ],
    routeWords: ["standings", "table", "ranking", "classification", "fixtures", "results", "competition", "division", "championship", "βαθμο", "πρωταθλημα", "πρωτάθλημα"]
  }
};

function abs(p) { return path.join(ROOT, p); }
function writeJson(p, v) { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), JSON.stringify(v, null, 2) + "\n"); }
function sha256Text(t) { return crypto.createHash("sha256").update(t).digest("hex"); }
function hostOf(u) { try { return new URL(u).host.toLowerCase(); } catch { return ""; } }
function normalizeUrl(u, base) { try { const x = new URL(u, base); x.hash = ""; return x.toString(); } catch { return null; } }
function stripHtml(s) { return String(s ?? "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }

async function fetchText(url, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 FootballTruthDiagnosticBot/1.0",
        "accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8"
      }
    });
    const text = await res.text();
    clearTimeout(timer);
    return { url, finalUrl: res.url, status: res.status, ok: res.ok, contentType: res.headers.get("content-type") ?? "", bytes: Buffer.byteLength(text), elapsedMs: Date.now() - started, text };
  } catch (error) {
    clearTimeout(timer);
    return { url, finalUrl: url, status: 0, ok: false, contentType: "", bytes: 0, elapsedMs: Date.now() - started, error: error.name === "AbortError" ? "timeout" : error.message, text: "" };
  }
}

function extractLinks(html, baseUrl, family) {
  const links = [];
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    const u = normalizeUrl(m[1], baseUrl);
    if (!u) continue;
    if (!family.hosts.includes(hostOf(u))) continue;
    links.push(u);
  }
  return [...new Set(links)];
}

function scoreUrl(url, family) {
  const lower = decodeURIComponent(url).toLowerCase();
  let score = 0;
  for (const w of family.routeWords) if (lower.includes(w.toLowerCase())) score += 20;
  if (/standings|table|classification|ranking|sarjataulukko|stada|staða|βαθμο/.test(lower)) score += 50;
  if (/fixture|fixtures|results|urslit|úrslit/.test(lower)) score += 10;
  if (/[?&](competition|season|stage|league|cid|sid|comp|mot|motsnumer|motnumer)=/i.test(lower)) score += 25;
  if (/\.(jpg|jpeg|png|gif|svg|css|js|pdf|zip)$/i.test(lower)) score -= 100;
  return score;
}

function analyze(row, familyId, family) {
  const html = row.text ?? "";
  const lower = `${row.url}\n${row.finalUrl}\n${html.slice(0, 140000)}`.toLowerCase();
  const textPreview = stripHtml(html).slice(0, 700);
  const routeWordHits = family.routeWords.filter(w => lower.includes(w.toLowerCase()));
  const tableTagCount = (html.match(/<table\b/gi) ?? []).length;
  const trTagCount = (html.match(/<tr\b/gi) ?? []).length;
  const jsonScriptCount = (html.match(/application\/ld\+json|__next_data__|window\.__|dataLayer|json|api|ajax/gi) ?? []).length;
  const standingSignals = ["standings", "standing", "table", "classification", "ranking", "sarjataulukko", "taulukko", "staða", "stada", "βαθμο"].filter(w => lower.includes(w));
  const statSignals = ["played", "won", "drawn", "lost", "points", "pts", "goals", "position", "rank", "matches"].filter(w => lower.includes(w));
  const fixtureSignals = ["fixtures", "results", "schedule", "match", "matches", "urslit", "úrslit"].filter(w => lower.includes(w));
  let score = 0;
  if (row.ok) score += 20;
  score += routeWordHits.length * 15;
  score += standingSignals.length * 20;
  score += statSignals.length * 8;
  score += Math.min(tableTagCount, 10) * 15;
  score += Math.min(trTagCount, 40) * 2;
  if (jsonScriptCount) score += 10;
  if (!family.hosts.includes(hostOf(row.finalUrl || row.url))) score -= 60;
  return {
    familyId,
    competitionSlugs: family.competitionSlugs,
    url: row.url,
    finalUrl: row.finalUrl,
    host: hostOf(row.finalUrl || row.url),
    status: row.status,
    ok: row.ok,
    contentType: row.contentType,
    bytes: row.bytes,
    elapsedMs: row.elapsedMs,
    error: row.error ?? null,
    sha256Prefix: row.text ? sha256Text(row.text).slice(0, 16) : null,
    routeWordHits,
    standingSignals,
    statSignals,
    fixtureSignals,
    tableTagCount,
    trTagCount,
    jsonScriptCount,
    score,
    textPreview
  };
}

async function pool(items, limit, fn) {
  const out = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const fetchRows = [];
const familyResults = [];

for (const [familyId, family] of Object.entries(FAMILIES)) {
  const seedUrls = [...new Set(family.seeds)];
  const seedFetches = await pool(seedUrls, 8, u => fetchText(u));
  fetchRows.push(...seedFetches.map(r => ({ familyId, phase: "seed", ...analyze(r, familyId, family) })));

  const discovered = [];
  for (const row of seedFetches) if (row.ok && row.text) discovered.push(...extractLinks(row.text, row.finalUrl || row.url, family));

  const ranked = [...new Set(discovered)]
    .map(url => ({ url, score: scoreUrl(url, family) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url))
    .slice(0, 72);

  const discoveredFetches = await pool(ranked.map(x => x.url), 16, u => fetchText(u));
  fetchRows.push(...discoveredFetches.map(r => ({ familyId, phase: "discovered", discoveryUrlScore: ranked.find(x => x.url === r.url)?.score ?? 0, ...analyze(r, familyId, family) })));

  const familyFetchRows = fetchRows.filter(r => r.familyId === familyId);
  const strongCandidates = familyFetchRows
    .filter(r => r.ok && r.score >= 80 && (r.standingSignals.length || r.tableTagCount || r.statSignals.length >= 3))
    .sort((a, b) => b.score - a.score || b.bytes - a.bytes)
    .slice(0, 20);

  familyResults.push({
    familyId,
    competitionSlugs: family.competitionSlugs,
    seedUrlCount: seedUrls.length,
    discoveredCandidateUrlCount: ranked.length,
    fetchedUrlCount: familyFetchRows.length,
    fetched2xxCount: familyFetchRows.filter(r => r.ok).length,
    strongCandidateCount: strongCandidates.length,
    topStrongCandidates: strongCandidates.map(r => ({
      url: r.url,
      finalUrl: r.finalUrl,
      status: r.status,
      host: r.host,
      score: r.score,
      standingSignals: r.standingSignals,
      statSignals: r.statSignals,
      tableTagCount: r.tableTagCount,
      trTagCount: r.trTagCount,
      routeWordHits: r.routeWordHits,
      textPreview: r.textPreview
    })),
    recommendedNext: strongCandidates.length ? "build_exact_route_table_or_json_shape_probe_for_top_strong_candidates" : "no_strong_official_route_candidate_from_seed_and_same_host_link_fetch"
  });
}

const summary = {
  status: "passed",
  runner: "blocked_families_controlled_official_source_discovery",
  contractVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  purpose: "bulk controlled official-host discovery for blocked exact-runner-missing families; metadata/signals only, no raw payload commit",
  familyCount: Object.keys(FAMILIES).length,
  fetchExecutedNowCount: fetchRows.length,
  fetched2xxCount: fetchRows.filter(r => r.ok).length,
  strongCandidateFamilyCount: familyResults.filter(f => f.strongCandidateCount > 0).length,
  totalStrongCandidateCount: familyResults.reduce((a, f) => a + f.strongCandidateCount, 0),
  familyResults,
  fetchRows: fetchRows.map(r => ({ ...r, textPreview: r.textPreview?.slice(0, 500) ?? "" })),
  nextRecommendedLane: {
    lane: "exact_route_shape_probe_for_strong_candidates",
    orderedFamilies: familyResults.slice().sort((a, b) => b.strongCandidateCount - a.strongCandidateCount).map(f => f.familyId),
    rule: "only continue to proof runner after exact route identity, row shape, season scope, expected rows/team signals, arithmetic, non-triviality and duplicate guard are explicit"
  },
  policy: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: fetchRows.length,
    browserExecutedNowCount: 0,
    rawPayloadCommitted: false,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    stateLaneWriteExecutedNowCount: 0
  },
  searchExecutedNowCount: 0,
  browserExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
};

writeJson(OUT, summary);
console.log(JSON.stringify({
  status: summary.status,
  fetchExecutedNowCount: summary.fetchExecutedNowCount,
  fetched2xxCount: summary.fetched2xxCount,
  strongCandidateFamilyCount: summary.strongCandidateFamilyCount,
  totalStrongCandidateCount: summary.totalStrongCandidateCount,
  familyResults: summary.familyResults,
  nextRecommendedLane: summary.nextRecommendedLane,
  output: OUT,
  rawPayloadCommitted: false,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
}, null, 2));
