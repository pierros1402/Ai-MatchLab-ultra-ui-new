import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const DIAG_ROOT = path.join(ROOT, "data", "football-truth", "_diagnostics");
const OUT_DIR = path.join(DIAG_ROOT, `route-identity-contract-discovery-${DATE}`);

const args = new Set(process.argv.slice(2));
if (!args.has("--allow-fetch")) throw new Error("Refusing route-identity discovery without --allow-fetch");

const MAX_FAMILIES = Number(process.env.ROUTE_IDENTITY_DISCOVERY_MAX_FAMILIES || "8");
const MAX_FETCHES = Number(process.env.ROUTE_IDENTITY_DISCOVERY_MAX_FETCHES || "240");
const CONCURRENCY = Number(process.env.ROUTE_IDENTITY_DISCOVERY_CONCURRENCY || "16");
const TIMEOUT_MS = Number(process.env.ROUTE_IDENTITY_DISCOVERY_TIMEOUT_MS || "8500");

const COMMON_PATHS = [
  "/", "/standings", "/standings/", "/table", "/tables", "/league-table", "/rankings", "/ranking",
  "/competitions", "/competitions/", "/competition", "/competition/", "/leagues", "/leagues/",
  "/fixtures", "/schedule", "/results", "/stats", "/statistics"
];

const HOST_ROUTE_HINTS = {
  "ksi.is": ["/mot/stada/", "/mot/", "/motamal/", "/um-ksi/motamal/"],
  "leagueofireland.ie": ["/standings/", "/fixtures-results/", "/mens/sse-airtricity-mens-premier-division/", "/mens/sse-airtricity-mens-first-division/"],
  "ligaportugal.pt": ["/pt/liga/classificacao/20252026/ligaportugalbetclic", "/pt/liga/classificacao/20252026/ligaportugalmeusuper", "/competition/854/liga-portugal-betclic/round/20252026?tab=standings", "/competition/855/liga-portugal-meu-super/round/20252026?tab=standings"],
  "sfl.ch": ["/en/superleague/table/", "/en/challengeleague/table/", "/de/superleague/tabelle/", "/de/challengeleague/tabelle/"],
  "afa.com.ar": ["/es/pages/primera-division", "/es/pages/primera-nacional", "/es/torneo/primera-division", "/es/torneo/primera-nacional"],
  "erovnuliliga.ge": ["/en/tables", "/en/league/highest-league/table", "/en/league/second-league/table"]
};

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function rel(p) { return path.relative(ROOT, p).replaceAll("\\", "/"); }
function sha(v) { return crypto.createHash("sha256").update(String(v)).digest("hex"); }
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}
function latestFile(re) {
  const files = walk(DIAG_ROOT).filter((f) => re.test(f));
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || null;
}
function readJsonl(file) {
  if (!file || !fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}
function norm(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function hostFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}
function absUrl(host, p) {
  if (/^https?:\/\//i.test(p)) return p;
  return `https://${host}${p.startsWith("/") ? "" : "/"}${p}`;
}
function extractLinks(html, baseUrl, host) {
  const out = [];
  for (const m of String(html || "").matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const u = new URL(m[1], baseUrl);
      const h = u.hostname.replace(/^www\./, "").toLowerCase();
      if (h !== host && !h.endsWith(`.${host}`)) continue;
      const s = u.toString().split("#")[0];
      if (/(stand|table|classifica|classement|tabelle|ranking|rank|competition|league|liga|mot|fixtures|results|schedule|stada)/i.test(s)) out.push(s);
    } catch {}
  }
  return out;
}
function signalCounts(text) {
  const n = norm(text);
  const standing = ["standings","standing","table","ranking","rank","classification","classifica","classement","tabelle","played","won","draw","lost","points","pts","goals","club","team"];
  const season = ["2025","2026","2025 2026","2025 26","2026 2027","2026 27"];
  return {
    standingSignalCount: standing.filter((x) => n.includes(norm(x))).length,
    seasonSignalCount: season.filter((x) => n.includes(norm(x))).length,
    tableCount: (String(text || "").match(/<table\b/gi) || []).length,
    trCount: (String(text || "").match(/<tr\b/gi) || []).length,
    title: (String(text || "").match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim().slice(0, 160)
  };
}
function slugRouteRule(slug, url) {
  const u = String(url || "").toLowerCase();
  if (slug === "isl.1" && /(besta|urvals|premier|efsta|pepsi|stada)/.test(u)) return "possible_isl1";
  if (slug === "isl.2" && /(lengju|1[-_]?deild|fyrsta|stada)/.test(u)) return "possible_isl2";
  if (slug === "irl.1" && /(premier|sse-airtricity-mens-premier|loi-premier)/.test(u)) return "possible_irl1";
  if (slug === "irl.2" && /(first|sse-airtricity-mens-first|loi-first)/.test(u)) return "possible_irl2";
  if (slug === "por.1" && /(854|betclic|primeira|liga-portugal-betclic)/.test(u)) return "possible_por1";
  if (slug === "por.2" && /(855|meu-super|segunda|liga-portugal-meu-super)/.test(u)) return "possible_por2";
  if (slug === "sui.1" && /(superleague|super-league|super league)/.test(u)) return "possible_sui1";
  if (slug === "sui.2" && /(challengeleague|challenge-league|challenge league)/.test(u)) return "possible_sui2";
  if (slug === "arg.1" && /(primera-division|primera_division|primera division|liga-profesional)/.test(u)) return "possible_arg1";
  if (slug === "arg.2" && /(primera-nacional|primera_nacional|primera nacional)/.test(u)) return "possible_arg2";
  if (slug === "geo.1" && /(tables|highest|erovnuli)/.test(u)) return "possible_geo1";
  if (slug === "geo.2" && /(second|liga-2|league-2|tables)/.test(u)) return "possible_geo2";
  return null;
}
async function fetchOne(target) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(target.url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 football-truth-route-identity-discovery/1.0",
        "accept": "text/html,application/json,text/plain,*/*"
      }
    });
    const contentType = res.headers.get("content-type") || "";
    const text = /html|json|text|javascript/i.test(contentType) ? await res.text() : "";
    const sig = signalCounts(text);
    return {
      ...target,
      fetchStatus: res.ok ? "fetched_2xx" : "fetched_non_2xx",
      httpStatus: res.status,
      finalUrl: res.url || target.url,
      contentType,
      contentLength: text.length,
      ...sig,
      links: text && /html/i.test(contentType) ? extractLinks(text, res.url || target.url, target.sourceHost).slice(0, 80) : []
    };
  } catch (error) {
    return {
      ...target,
      fetchStatus: "fetch_failed",
      errorName: error?.name || "Error",
      errorMessage: String(error?.message || error).slice(0, 240),
      links: []
    };
  } finally {
    clearTimeout(timer);
  }
}
async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let next = 0, done = 0;
  async function loop() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
      done++;
      if (done % 40 === 0 || done === items.length) console.error(`ROUTE_IDENTITY_DISCOVERY_PROGRESS ${done}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, loop));
  return results;
}
function dedupe(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, r);
  }
  return [...map.values()];
}

ensureDir(OUT_DIR);

const registryDiscoveryPath = latestFile(/registry-discovery-needed-families-\d{4}-\d{2}-\d{2}\.jsonl$/);
if (!registryDiscoveryPath) throw new Error("Missing registry discovery-needed families file");

const registryFamilies = readJsonl(registryDiscoveryPath)
  .filter((f) => f.adapterKind === "candidate_official_html_or_route" && f.sourceHost && (f.unsatisfiedDueSlugCount || 0) >= 2)
  .sort((a, b) => (b.unsatisfiedDueSlugCount || 0) - (a.unsatisfiedDueSlugCount || 0) || (b.candidateSlugCount || 0) - (a.candidateSlugCount || 0))
  .slice(0, MAX_FAMILIES);

const seedTargets = [];
for (const fam of registryFamilies) {
  const host = fam.sourceHost;
  const slugs = fam.candidateSlugs || fam.unsatisfiedDueSlugs || [];
  const urls = new Set();
  for (const p of COMMON_PATHS) urls.add(absUrl(host, p));
  for (const p of HOST_ROUTE_HINTS[host] || []) urls.add(absUrl(host, p));
  for (const ev of fam.evidenceSample || []) {
    const u = ev.finalUrl || ev.sourceUrl || ev.apiUrl;
    if (u) urls.add(u);
  }
  for (const u of urls) {
    seedTargets.push({
      targetKind: "seed_or_known_route",
      sourceHost: host,
      familyId: fam.familyId,
      candidateSlugs: slugs,
      url: u
    });
  }
}

const firstWave = dedupe(seedTargets, (r) => `${r.sourceHost}|${r.url}`).slice(0, Math.min(MAX_FETCHES, seedTargets.length));
const firstResults = await runPool(firstWave, fetchOne, CONCURRENCY);

const linkTargets = [];
for (const r of firstResults) {
  for (const link of r.links || []) {
    linkTargets.push({
      targetKind: "same_host_discovered_link",
      sourceHost: r.sourceHost,
      familyId: r.familyId,
      candidateSlugs: r.candidateSlugs,
      url: link,
      parentUrl: r.finalUrl || r.url
    });
  }
}

const remaining = Math.max(0, MAX_FETCHES - firstResults.length);
const secondWave = dedupe(linkTargets, (r) => `${r.sourceHost}|${r.url}`)
  .sort((a, b) => {
    const score = (u) => /(stand|table|classifica|classement|tabelle|ranking|stada)/i.test(u.url) ? 2 : /(competition|league|liga|mot)/i.test(u.url) ? 1 : 0;
    return score(b) - score(a) || a.url.localeCompare(b.url);
  })
  .slice(0, remaining);

const secondResults = await runPool(secondWave, fetchOne, CONCURRENCY);
const allResults = [...firstResults, ...secondResults];

const contractCandidates = [];
for (const r of allResults) {
  if (r.fetchStatus !== "fetched_2xx") continue;
  const routeRules = [];
  for (const slug of r.candidateSlugs || []) {
    const rule = slugRouteRule(slug, r.finalUrl || r.url);
    if (rule) routeRules.push({ competitionSlug: slug, routeIdentityHint: rule });
  }
  const useful = (r.tableCount > 0 && r.trCount >= 8) || r.standingSignalCount >= 6;
  if (!useful && routeRules.length === 0) continue;
  contractCandidates.push({
    sourceHost: r.sourceHost,
    familyId: r.familyId,
    finalUrl: r.finalUrl || r.url,
    title: r.title,
    tableCount: r.tableCount,
    trCount: r.trCount,
    standingSignalCount: r.standingSignalCount,
    seasonSignalCount: r.seasonSignalCount,
    hasRouteIdentityHints: routeRules.length > 0,
    routeRules,
    candidateSlugs: r.candidateSlugs,
    recommendedStatus:
      routeRules.length > 0 && useful ? "route_identity_contract_candidate" :
      routeRules.length > 0 ? "route_identity_hint_without_table_confirmation" :
      "standing_table_route_without_slug_identity",
    evidenceHash: sha(JSON.stringify({ url: r.finalUrl || r.url, title: r.title, tableCount: r.tableCount, trCount: r.trCount, standingSignalCount: r.standingSignalCount, routeRules }))
  });
}

const grouped = {};
for (const c of contractCandidates) {
  grouped[c.sourceHost] ||= {
    sourceHost: c.sourceHost,
    candidateCount: 0,
    routeIdentityContractCandidateCount: 0,
    tableRouteWithoutSlugIdentityCount: 0,
    slugs: new Set(),
    bestCandidates: []
  };
  grouped[c.sourceHost].candidateCount++;
  for (const s of c.candidateSlugs || []) grouped[c.sourceHost].slugs.add(s);
  if (c.recommendedStatus === "route_identity_contract_candidate") grouped[c.sourceHost].routeIdentityContractCandidateCount++;
  if (c.recommendedStatus === "standing_table_route_without_slug_identity") grouped[c.sourceHost].tableRouteWithoutSlugIdentityCount++;
  grouped[c.sourceHost].bestCandidates.push(c);
}
const familySummaries = Object.values(grouped).map((g) => ({
  sourceHost: g.sourceHost,
  candidateCount: g.candidateCount,
  routeIdentityContractCandidateCount: g.routeIdentityContractCandidateCount,
  tableRouteWithoutSlugIdentityCount: g.tableRouteWithoutSlugIdentityCount,
  slugs: [...g.slugs].sort(),
  bestCandidates: g.bestCandidates.sort((a, b) =>
    Number(b.recommendedStatus === "route_identity_contract_candidate") - Number(a.recommendedStatus === "route_identity_contract_candidate") ||
    b.tableCount - a.tableCount ||
    b.standingSignalCount - a.standingSignalCount ||
    b.trCount - a.trCount
  ).slice(0, 12)
})).sort((a, b) =>
  b.routeIdentityContractCandidateCount - a.routeIdentityContractCandidateCount ||
  b.tableRouteWithoutSlugIdentityCount - a.tableRouteWithoutSlugIdentityCount ||
  b.candidateCount - a.candidateCount
);

const summary = {
  status: "passed",
  runner: "route_identity_contract_discovery",
  contractVersion: 1,
  sourceRegistryDiscoveryPath: rel(registryDiscoveryPath),
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: allResults.length,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  rawPayloadWriteExecutedNowCount: 0,
  inputDiscoveryFamilyCount: registryFamilies.length,
  seedFetchCount: firstResults.length,
  discoveredLinkFetchCount: secondResults.length,
  fetched2xxCount: allResults.filter((r) => r.fetchStatus === "fetched_2xx").length,
  fetchFailureCount: allResults.filter((r) => r.fetchStatus === "fetch_failed").length,
  contractCandidateCount: contractCandidates.length,
  routeIdentityContractCandidateCount: contractCandidates.filter((c) => c.recommendedStatus === "route_identity_contract_candidate").length,
  tableRouteWithoutSlugIdentityCount: contractCandidates.filter((c) => c.recommendedStatus === "standing_table_route_without_slug_identity").length,
  routeIdentityHintWithoutTableCount: contractCandidates.filter((c) => c.recommendedStatus === "route_identity_hint_without_table_confirmation").length,
  familyWithContractCandidateCount: familySummaries.filter((f) => f.routeIdentityContractCandidateCount > 0).length,
  topFamilies: familySummaries.slice(0, 12).map((f) => ({
    sourceHost: f.sourceHost,
    routeIdentityContractCandidateCount: f.routeIdentityContractCandidateCount,
    tableRouteWithoutSlugIdentityCount: f.tableRouteWithoutSlugIdentityCount,
    slugs: f.slugs
  })),
  recommendedNextLane:
    contractCandidates.some((c) => c.recommendedStatus === "route_identity_contract_candidate")
      ? "generate_family_manifests_from_route_identity_contract_candidates"
      : "expand_official_host_registry_with_search_not_candidate_reviews"
};

const outPath = path.join(OUT_DIR, `route-identity-contract-discovery-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `route-identity-contract-discovery-rows-${DATE}.jsonl`);
const candidatesPath = path.join(OUT_DIR, `route-identity-contract-candidates-${DATE}.jsonl`);
const familiesPath = path.join(OUT_DIR, `route-identity-contract-family-summaries-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({ summary, familySummaries, contractCandidates, fetchRows: allResults.map(({ links, ...r }) => ({ ...r, discoveredLinkCount: links?.length || 0 })) }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, allResults.map(({ links, ...r }) => JSON.stringify({ ...r, discoveredLinkCount: links?.length || 0 })).join("\n") + (allResults.length ? "\n" : ""), "utf8");
fs.writeFileSync(candidatesPath, contractCandidates.map((r) => JSON.stringify(r)).join("\n") + (contractCandidates.length ? "\n" : ""), "utf8");
fs.writeFileSync(familiesPath, familySummaries.map((r) => JSON.stringify(r)).join("\n") + (familySummaries.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  candidatesOutput: rel(candidatesPath),
  familiesOutput: rel(familiesPath),
  summary
}, null, 2));
