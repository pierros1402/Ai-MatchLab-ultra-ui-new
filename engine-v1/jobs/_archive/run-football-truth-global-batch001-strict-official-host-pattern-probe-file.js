import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const allowFetch = process.argv.includes("--allow-fetch");

const reconciledPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-reconciled-classification-ledger-${today}`, `football-truth-global-reconciled-classification-ledger-${today}.json`);
const batchPlanPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-no-current-discovery-batches-${today}`, `football-truth-global-no-current-discovery-batches-${today}.json`);
const outDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-strict-official-host-pattern-probe-${today}`);
const outPath = path.join(outDir, `football-truth-global-batch001-strict-official-host-pattern-probe-${today}.json`);
const rowsPath = path.join(outDir, `football-truth-global-batch001-strict-official-host-pattern-probe-rows-${today}.jsonl`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
function shaText(text) { return crypto.createHash("sha256").update(String(text || "")).digest("hex"); }
function country(slug) { return String(slug || "").split(".")[0]; }
function level(slug) { return Number.parseInt(String(slug || "").split(".")[1] || "99", 10); }
function stripHtml(value) { return String(value || "").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim(); }
function norm(value) { return stripHtml(value).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu,"").replace(/\s+/g," ").trim(); }
function titleOf(html) { const m=String(html||"").match(/<title[^>]*>([\s\S]*?)<\/title>/i); return stripHtml(m?.[1]||"").slice(0,180); }
function hostOf(url) { try { return new URL(url).host.toLowerCase().replace(/^www\./,""); } catch { return ""; } }
function uniq(values) { return [...new Set((values || []).filter(Boolean))]; }

const officialHostsByCountry = {
  arg:["afa.com.ar"], aus:["aleagues.com.au","footballaustralia.com.au"], aut:["bundesliga.at","2liga.at"], bel:["proleague.be"], bra:["cbf.com.br"], cyp:["cfa.com.cy"], cze:["chanceliga.cz","fnliga.cz","fotbal.cz"], fin:["palloliitto.fi","veikkausliiga.com","ykkosliiga.fi"], fra:["ligue1.fr","ligue2.fr","lfp.fr"], gre:["slgr.gr"], kor:["kleague.com"], mex:["ligamx.net"], nor:["eliteserien.no","fotball.no"], pol:["ekstraklasa.org","1liga.org"], por:["ligaportugal.pt"], sui:["sfl.ch"], tur:["tff.org"], ukr:["upl.ua"], usa:["mlssoccer.com","uslsoccer.com"], wal:["faw.cymru"], bul:["fpleague.bg","bfunion.bg"], hun:["mlsz.hu"], svn:["nzs.si"], chn:["thecfa.cn"], svk:["nike-liga.sk","futbalsfz.sk"], rou:["lpf.ro","frf.ro"], mys:["malaysianfootballleague.com","mfl.my"], tha:["thaileague.co.th"], cro:["hnl.com.hr","hns.family","semafor.hns.family"], den:["superliga.dk","divisionsforeningen.dk","dbu.dk"], eng:["efl.com"], ita:["legab.it"], ned:["keukenkampioendivisie.nl","knvb.nl"], ksa:["saff.com.sa","spl.com.sa"], per:["liga2.pe","fpf.org.pe"], srb:["prvaliga.rs","fss.rs"], ind:["the-aiff.com"], alb:["fshf.org"], arm:["ffa.am"], aze:["pfl.az","affa.az"], bih:["nfsbih.ba"], blr:["abff.by"], geo:["erovnuliliga.ge","gff.ge"], irl:["leagueofireland.ie","fai.ie"], alg:["lnfp.dz","faf.dz"], est:["jalgpall.ee"], lva:["lff.lv"], mda:["fmf.md"], mkd:["ffm.mk"], mne:["fscg.me"], qat:["qsl.qa"], ltu:["lff.lt"], egy:["efa.com.eg"], gha:["ghanafa.org"]
};

const explicitRouteSeeds = {
  "arg.1":["https://www.afa.com.ar/es/pages/primera-division","https://www.afa.com.ar/es/torneo/primera-division"],
  "aut.1":["https://www.bundesliga.at/de/tabelle","https://www.bundesliga.at/de/statistik/tabelle"],
  "aut.2":["https://www.2liga.at/de/2liga/tabelle","https://www.2liga.at/de/statistik/tabelle"],
  "bel.1":["https://www.proleague.be/en/jupiler-pro-league/standings","https://www.proleague.be/fr/jupiler-pro-league/classement"],
  "cyp.1":["https://www.cfa.com.cy/En/competitions/65403824"],
  "eng.2":["https://www.efl.com/competitions/sky-bet-championship/","https://www.efl.com/competitions/sky-bet-championship/standings/"],
  "eng.3":["https://www.efl.com/competitions/sky-bet-league-one/","https://www.efl.com/competitions/sky-bet-league-one/standings/"],
  "ind.2":["https://www.the-aiff.com/competitions/i-league"],
  "irl.1":["https://www.leagueofireland.ie/standings","https://www.leagueofireland.ie/matches"]
};

const genericPaths = [
  "/", "/standings", "/table", "/tables", "/league-table", "/competition/standings", "/competitions/standings",
  "/fixtures", "/schedule", "/results", "/matches", "/season", "/statistics", "/en/standings", "/en/table",
  "/en/fixtures", "/en/schedule", "/en/results", "/de/tabelle", "/de/spielplan", "/fr/classement",
  "/fr/calendrier", "/es/clasificacion", "/es/calendario"
];

function buildUrls(slug) {
  const c = country(slug);
  const hosts = officialHostsByCountry[c] || [];
  const seeded = explicitRouteSeeds[slug] || [];
  const urls = [...seeded];
  for (const host of hosts) {
    for (const p of genericPaths) urls.push(`https://${host}${p}`);
  }
  return uniq(urls).slice(0, 8);
}

function wantedTerms(slug, displayName) {
  const out = [slug, country(slug)];
  if (displayName) {
    out.push(displayName);
    for (const part of String(displayName).split(/\s+/)) {
      const p = part.replace(/[^\p{L}\p{N}.]/gu, "");
      if (p.length >= 4) out.push(p);
    }
  }
  return uniq(out);
}

function termHits(text, terms) {
  const n = norm(text);
  return uniq(terms.filter(t => n.includes(norm(t))));
}

async function fetchWithTimeout(url, timeoutMs=9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method:"GET", redirect:"follow", signal:controller.signal, headers:{ "user-agent":"Mozilla/5.0 (compatible; AI-MatchLab-FootballTruth/1.0; +strict-official-host-pattern-probe)", "accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.7", "accept-language":"en-US,en;q=0.9" } });
    const text = await response.text();
    clearTimeout(timer);
    return { response, text, error:null, timedOut:false };
  } catch (error) {
    clearTimeout(timer);
    return { response:null, text:"", error:String(error?.name || error?.message || error), timedOut:String(error?.name || "") === "AbortError" };
  }
}

function scoreFetched(target, url, fetched) {
  const html = fetched.text || "";
  const finalUrl = fetched.response?.url || url;
  const finalHost = hostOf(finalUrl);
  const title = titleOf(html);
  const text = `${finalUrl} ${title} ${stripHtml(html).slice(0,70000)}`;
  const hits = termHits(text, wantedTerms(target.slug, target.displayName));
  const status = fetched.response?.status ?? null;
  const tableCount = (html.match(/<table\b/gi) || []).length;
  const trCount = (html.match(/<tr\b/gi) || []).length;
  const standingHintCount = (text.match(/standings|table|classification|classifica|clasificacion|clasificación|posiciones|tabla|tabela|rank|points|pts|puntos|played|wins|draws|losses|pj|pg|pe|pp/gi) || []).length;
  const fixtureHintCount = (text.match(/fixture|fixtures|schedule|calendar|calendario|resultados|results|matches|matchday|spielplan|kalender/gi) || []).length;
  const newsHintCount = (text.match(/news|latest|article|noticias|ειδήσεις|actualit|nieuws/gi) || []).length;
  const hasChallenge = /just a moment|are you not a robot|showcaptcha|access denied|forbidden/i.test(`${title} ${html.slice(0,8000)} ${finalUrl}`);
  const allowedHost = (officialHostsByCountry[country(target.slug)] || []).some(h => finalHost === h || finalHost.endsWith(`.${h}`));

  let score = 0;
  if ((status ?? 0) >= 200 && (status ?? 0) < 400) score += 45;
  if (allowedHost) score += 80;
  if (hasChallenge) score -= 150;
  score += hits.length * 20;
  score += Math.min(standingHintCount, 30) * 5;
  if (tableCount >= 1 && trCount >= 8) score += 60;
  if (/standings|table|classement|clasificacion|tabelle/i.test(finalUrl)) score += 50;
  if (/fixtures|schedule|calendar|spielplan|kalender/i.test(finalUrl) && standingHintCount < 8) score -= 20;
  if (newsHintCount >= 5 && standingHintCount < 10) score -= 40;

  let lane = "official_route_not_found";
  if (!allowedHost) lane = "official_host_redirected_outside_allowlist";
  else if (!((status ?? 0) >= 200 && (status ?? 0) < 400) || hasChallenge) lane = "official_route_fetch_failed_or_blocked";
  else if (score >= 210 && tableCount >= 1 && trCount >= 8 && standingHintCount >= 8) lane = "official_html_table_surface_candidate";
  else if (score >= 180 && standingHintCount >= 15) lane = "official_rendered_or_api_surface_candidate";
  else if (fixtureHintCount >= 3 && standingHintCount < 8) lane = "official_fixture_or_schedule_surface_only";
  else if (score >= 140) lane = "official_surface_review_required";

  return { url, finalUrl, finalHost, fetchStatus:status, title, bodyLength:html.length, bodySha256:html ? shaText(html) : null, fetchError:fetched.error, timedOut:fetched.timedOut, tableCount, trCount, standingHintCount, fixtureHintCount, newsHintCount, termHits:hits, hasChallenge, score, lane };
}

await fs.mkdir(outDir, { recursive:true });

const blocks = [];
if (!allowFetch) blocks.push("missing_allow_fetch");

const reconciled = JSON.parse(await fs.readFile(reconciledPath, "utf8"));
const batchPlan = JSON.parse(await fs.readFile(batchPlanPath, "utf8"));
if (reconciled.status !== "passed") blocks.push("reconciled_not_passed");

const batch = batchPlan.batches?.find(b => b.batchId === "global-no-current-discovery-001");
if (!batch || batch.targetCount !== 80) blocks.push("batch001_missing");

const displayBySlug = new Map((batchPlan.rows || []).map(row => [row.slug, row.displayName]));
const targets = (batch?.slugs || []).map(slug => ({ slug, displayName: displayBySlug.get(slug) || null, urls: buildUrls(slug) }));
if (targets.length !== 80) blocks.push("targets_not_80");

let fetchCount = 0;
const rows = [];

if (allowFetch && blocks.length === 0) {
  let i = 0;
  for (const target of targets) {
    i += 1;
    console.log(`[${i}/${targets.length}] ${target.slug} urls=${target.urls.length}`);
    const fetches = [];
    for (const url of target.urls) {
      console.log(`  ${url}`);
      const fetched = await fetchWithTimeout(url);
      fetchCount += 1;
      fetches.push(scoreFetched(target, url, fetched));
    }
    const selected = [...fetches].sort((a,b) => b.score - a.score || (b.bodyLength || 0) - (a.bodyLength || 0))[0] || null;
    rows.push({
      slug: target.slug,
      displayName: target.displayName,
      candidateUrlCount: target.urls.length,
      fetchedCandidateCount: fetches.length,
      selectedLane: selected?.lane || "official_route_not_found",
      selectedUrl: selected?.url || null,
      selectedFinalUrl: selected?.finalUrl || null,
      selectedHost: selected?.finalHost || null,
      selectedFetchStatus: selected?.fetchStatus ?? null,
      selectedTitle: selected?.title || null,
      selectedScore: selected?.score ?? null,
      selectedTableCount: selected?.tableCount ?? 0,
      selectedTrCount: selected?.trCount ?? 0,
      selectedStandingHintCount: selected?.standingHintCount ?? 0,
      selectedFixtureHintCount: selected?.fixtureHintCount ?? 0,
      selectedTermHits: selected?.termHits || [],
      fetches,
      acceptedNow:false,
      routeClaimMadeNow:false,
      familyClaimMadeNow:false,
      canonicalWriteExecutedNow:false,
      lifecycleWriteExecutedNow:false,
      productionWriteExecutedNow:false,
      truthAssertionExecutedNow:false,
      rawPayloadCommitted:false,
      fullRawPayloadWritten:false
    });
  }
}

const laneCounts = rows.reduce((acc,row) => { acc[row.selectedLane] = (acc[row.selectedLane] || 0) + 1; return acc; }, {});
const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "global_batch001_strict_official_host_pattern_probe",
  contractVersion: 1,
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  inputReconciledPath: rel(reconciledPath),
  inputBatchPlanPath: rel(batchPlanPath),
  guardrails: {
    searchExecutedNowCount:0,
    fetchExecutedNowCount:fetchCount,
    controlledOfficialHostPatternFetchExecutedNowCount:fetchCount,
    routeClaimMadeNowCount:0,
    familyClaimMadeNowCount:0,
    canonicalWriteExecutedNowCount:0,
    lifecycleWriteExecutedNowCount:0,
    productionWriteExecutedNowCount:0,
    truthAssertionExecutedNowCount:0,
    rawPayloadCommitted:false,
    fullRawPayloadWritten:false
  },
  summary: {
    targetCount: targets.length,
    attemptedFetchCount: fetchCount,
    selectedLaneCounts: laneCounts,
    officialHtmlTableSurfaceCandidateSlugs: rows.filter(r => r.selectedLane === "official_html_table_surface_candidate").map(r => r.slug),
    officialRenderedOrApiSurfaceCandidateSlugs: rows.filter(r => r.selectedLane === "official_rendered_or_api_surface_candidate").map(r => r.slug),
    officialFixtureOrScheduleOnlySlugs: rows.filter(r => r.selectedLane === "official_fixture_or_schedule_surface_only").map(r => r.slug),
    officialSurfaceReviewRequiredSlugs: rows.filter(r => r.selectedLane === "official_surface_review_required").map(r => r.slug),
    officialRouteNotFoundOrBlockedSlugs: rows.filter(r => r.selectedLane === "official_route_not_found" || r.selectedLane === "official_route_fetch_failed_or_blocked" || r.selectedLane === "official_host_redirected_outside_allowlist").map(r => r.slug),
    acceptedNowCount: 0,
    nextRecommendedLane: "identity/surface or extraction only for official_html_table_surface_candidate; rendered/API planning for rendered/API candidates"
  },
  rows,
  blocks
};

await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary,
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
