import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const DATA_ROOT = path.join(ROOT, "data", "football-truth");
const DIAG_ROOT = path.join(DATA_ROOT, "_diagnostics");
const OUT_DIR = path.join(DIAG_ROOT, `host-first-bulk-execution-board-${DATE}`);

const CONTROLLED_FETCH_PACK_SIZE = 180;

const NOISE_HOSTS = new Set([
  "fifa.com","flashscore.com","soccerway.com","transfermarkt.com","sofascore.com","aiscore.com","livesport.com",
  "worldfootball.net","footystats.org","besoccer.com","scores24.live","forebet.com","oddsportal.com","betexplorer.com",
  "wikipedia.org","wikidata.org","facebook.com","instagram.com","x.com","twitter.com","youtube.com","reddit.com",
  "linkedin.com","tiktok.com","tennisexplorer.com","tennis.com","icloud.com","windows.net","lingus.com","generalblue.com",
  "tripadvisor.com","espn.com","bbc.co.uk","europeanleague.football","visitbosniaandherzegovina.net"
]);

const OFFICIAL_HOST_SEEDS = {
  "alb.1": ["fshf.org"],
  "alb.2": ["fshf.org"],
  "and.1": ["faf.ad"],
  "and.2": ["faf.ad"],
  "arg.1": ["afa.com.ar","ligaafa.com.ar"],
  "arg.2": ["afa.com.ar","ligaafa.com.ar"],
  "arm.1": ["ffa.am"],
  "arm.2": ["ffa.am"],
  "aus.1": ["aleagues.com.au"],
  "aus.2": ["footballaustralia.com.au"],
  "aut.1": ["bundesliga.at"],
  "aut.2": ["2liga.at","bundesliga.at"],
  "aze.1": ["affa.az","pfl.az"],
  "aze.2": ["affa.az","pfl.az"],
  "bel.1": ["proleague.be"],
  "bel.2": ["proleague.be"],
  "bih.1": ["nfsbih.ba"],
  "bih.2": ["nfsbih.ba"],
  "blr.1": ["abff.by"],
  "blr.2": ["abff.by"],
  "bra.1": ["cbf.com.br"],
  "bra.2": ["cbf.com.br"],
  "bul.1": ["bfunion.bg"],
  "bul.2": ["bfunion.bg"],
  "can.1": ["canpl.ca"],
  "can.2": ["canadasoccer.com"],
  "chn.1": ["csl-china.com","thecfa.cn"],
  "chn.2": ["thecfa.cn"],
  "cro.1": ["hnl.hr"],
  "cro.2": ["hnl.hr"],
  "cyp.1": ["cfa.com.cy"],
  "cyp.2": ["cfa.com.cy"],
  "cze.1": ["chanceliga.cz","fotbal.cz"],
  "cze.2": ["fotbal.cz"],
  "den.1": ["superliga.dk","api.superliga.dk"],
  "den.2": ["division.dk"],
  "eng.1": ["premierleague.com"],
  "eng.2": ["efl.com"],
  "eng.3": ["efl.com"],
  "eng.4": ["efl.com"],
  "eng.5": ["thenationalleague.org.uk"],
  "esp.1": ["laliga.com"],
  "esp.2": ["laliga.com"],
  "est.1": ["jalgpall.ee"],
  "est.2": ["jalgpall.ee"],
  "fin.1": ["veikkausliiga.com","palloliitto.fi"],
  "fin.2": ["palloliitto.fi"],
  "fra.1": ["ligue1.com","lfp.fr"],
  "fra.2": ["ligue2.fr","lfp.fr"],
  "fro.1": ["fsf.fo"],
  "fro.2": ["fsf.fo"],
  "geo.1": ["gff.ge","erovnuliliga.ge"],
  "geo.2": ["gff.ge","erovnuliliga.ge"],
  "ger.1": ["bundesliga.com"],
  "ger.2": ["bundesliga.com"],
  "ger.3": ["dfb.de"],
  "gib.1": ["gibraltarfa.com"],
  "gib.2": ["gibraltarfa.com"],
  "gre.1": ["slgr.gr"],
  "gre.2": ["sl2.gr"],
  "hun.1": ["mlsz.hu"],
  "hun.2": ["mlsz.hu"],
  "irl.1": ["leagueofireland.ie"],
  "irl.2": ["leagueofireland.ie"],
  "isl.1": ["ksi.is"],
  "isl.2": ["ksi.is"],
  "isr.1": ["football.co.il"],
  "isr.2": ["football.co.il"],
  "ita.1": ["legaseriea.it"],
  "ita.2": ["legab.it"],
  "jpn.1": ["jleague.co"],
  "jpn.2": ["jleague.co"],
  "kaz.1": ["pflk.kz"],
  "kaz.2": ["pflk.kz"],
  "kor.1": ["kleague.com"],
  "kor.2": ["kleague.com"],
  "kos.1": ["ffk-kosova.com"],
  "kos.2": ["ffk-kosova.com"],
  "ksa.1": ["spl.com.sa"],
  "ksa.2": ["saff.com.sa"],
  "ltu.1": ["alyga.lt","lff.lt"],
  "ltu.2": ["lff.lt"],
  "lux.1": ["flf.lu"],
  "lux.2": ["flf.lu"],
  "lva.1": ["virsliga.lv","lff.lv"],
  "lva.2": ["lff.lv"],
  "mda.1": ["fmf.md"],
  "mda.2": ["fmf.md"],
  "mex.1": ["ligamx.net"],
  "mex.2": ["ligamx.net"],
  "mkd.1": ["ffm.mk"],
  "mkd.2": ["ffm.mk"],
  "mlt.1": ["mfa.com.mt"],
  "mlt.2": ["mfa.com.mt"],
  "mne.1": ["fscg.me"],
  "mne.2": ["fscg.me"],
  "ned.1": ["eredivisie.nl"],
  "ned.2": ["keukenkampioendivisie.nl"],
  "nir.1": ["nifootballleague.com"],
  "nir.2": ["nifootballleague.com"],
  "nor.1": ["fotball.no","eliteserien.no"],
  "nor.2": ["fotball.no"],
  "pol.1": ["ekstraklasa.org"],
  "pol.2": ["1liga.org"],
  "por.1": ["ligaportugal.pt"],
  "por.2": ["ligaportugal.pt"],
  "qat.1": ["qsl.qa"],
  "qat.2": ["qfa.qa"],
  "rus.1": ["premierliga.ru"],
  "rus.2": ["1fnl.ru"],
  "sco.1": ["spfl.co.uk"],
  "sco.2": ["spfl.co.uk"],
  "ser.1": ["superliga.rs","fss.rs"],
  "sui.1": ["sfl.ch"],
  "sui.2": ["sfl.ch"],
  "svk.1": ["futbalsfz.sk","nikeliga.sk"],
  "svk.2": ["futbalsfz.sk"],
  "svn.1": ["prvaliga.si","nzslovenija.si"],
  "svn.2": ["nzslovenija.si"],
  "swe.1": ["allsvenskan.se","svenskfotboll.se"],
  "swe.2": ["superettan.se","svenskfotboll.se"],
  "tur.1": ["tff.org"],
  "tur.2": ["tff.org"],
  "ukr.1": ["upl.ua"],
  "ukr.2": ["pfl.ua"],
  "usa.1": ["mlssoccer.com"],
  "usa.2": ["uslchampionship.com"],
  "wal.1": ["faw.cymru"],
  "wal.2": ["faw.cymru"]
};

const SLUG_NAME_OVERRIDES = {
  "aut.1": "Austrian Bundesliga", "aut.2": "Austrian 2. Liga",
  "bel.1": "Belgian Pro League", "bel.2": "Challenger Pro League",
  "cro.1": "Croatian HNL", "cro.2": "Croatian Prva NL",
  "cze.1": "Czech First League", "cze.2": "Czech National League",
  "den.1": "Danish Superliga", "den.2": "Danish 1st Division",
  "eng.1": "Premier League", "eng.2": "EFL Championship", "eng.3": "EFL League One", "eng.4": "EFL League Two", "eng.5": "National League",
  "esp.1": "LaLiga", "esp.2": "LaLiga 2",
  "fin.1": "Veikkausliiga", "fin.2": "Ykkosliiga",
  "fra.1": "Ligue 1", "fra.2": "Ligue 2",
  "ger.1": "Bundesliga", "ger.2": "2. Bundesliga", "ger.3": "3. Liga",
  "gre.1": "Super League Greece", "gre.2": "Super League 2 Greece",
  "ita.1": "Serie A", "ita.2": "Serie B",
  "ned.1": "Eredivisie", "ned.2": "Eerste Divisie",
  "nor.1": "Eliteserien", "nor.2": "OBOS-ligaen",
  "pol.1": "Ekstraklasa", "pol.2": "I Liga",
  "por.1": "Primeira Liga", "por.2": "Liga Portugal 2",
  "rus.1": "Russian Premier League", "rus.2": "Russian First League",
  "sco.1": "Scottish Premiership", "sco.2": "Scottish Championship",
  "ser.1": "Serbian SuperLiga",
  "sui.1": "Swiss Super League", "sui.2": "Swiss Challenge League",
  "swe.1": "Allsvenskan", "swe.2": "Superettan",
  "tur.1": "Super Lig", "tur.2": "1. Lig",
  "ukr.1": "Ukrainian Premier League", "ukr.2": "Ukrainian First League"
};

function ensureDir(dirPath) { fs.mkdirSync(dirPath, { recursive: true }); }
function rel(filePath) { return path.relative(ROOT, filePath).replaceAll("\\", "/"); }

function walk(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function readJsonSafe(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return null; }
}

function parseJsonlSafe(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

function latestFile(pattern) {
  const files = walk(DIAG_ROOT).filter((file) => pattern.test(file));
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || null;
}

function hostFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; }
}

function cleanHost(host) {
  return String(host || "").replace(/^www\./, "").toLowerCase().trim();
}

function isNoiseHost(host) {
  const h = cleanHost(host);
  return !h || [...NOISE_HOSTS].some((noise) => h === noise || h.endsWith(`.${noise}`));
}

function hostMatchesSeed(host, seeds) {
  const h = cleanHost(host);
  return seeds.some((seed) => h === cleanHost(seed) || h.endsWith(`.${cleanHost(seed)}`));
}

function cleanName(raw, slug) {
  if (SLUG_NAME_OVERRIDES[slug]) return SLUG_NAME_OVERRIDES[slug];
  let s = String(raw || slug);
  s = s.replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&#39;/g, "'");
  s = s.replace(/\|.*$/g, " ");
  s = s.replace(/^homepage\s*-\s*/i, " ");
  s = s.replace(/\bofficial\b/gi, " ");
  s = s.replace(/\bfixtures?\b/gi, " ");
  s = s.replace(/\bresults?\b/gi, " ");
  s = s.replace(/\bcalendar\b/gi, " ");
  s = s.replace(/\bstandings?\b/gi, " ");
  s = s.replace(/\bleague table\b/gi, " ");
  s = s.replace(/\bclassifica aggiornata\b/gi, " ");
  s = s.replace(/\bclassifica\b/gi, " ");
  s = s.replace(/\bstand\b/gi, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s || slug;
}

function taskDisplayName(task, lifecycleBySlug) {
  const row = lifecycleBySlug.get(task.competitionSlug) || {};
  return cleanName(row.competitionName || row.name || row.displayName || task.competitionName || task.competitionSlug, task.competitionSlug);
}

function taskCountry(task, lifecycleBySlug) {
  const row = lifecycleBySlug.get(task.competitionSlug) || {};
  return row.country || task.country || "";
}

function taskPriority(task) {
  return (task.highValuePrefix ? 100000 : 0) + (task.uefaLikePrefix ? 50000 : 0) + Number(task.score || 0) - Number(task.priority || 999);
}

function taskKind(task) {
  if (task.taskType === "acquire_next_season_start_date" || task.executionLane === "official_start_date_evidence_discovery") return "next_season_start_date";
  if (task.taskType === "acquire_previous_completed_standings" || task.executionLane === "official_rendered_or_provider_standings_expansion") return "previous_completed_standings";
  return "other";
}

function appendConfigHosts(registry, configPath, sourceKind) {
  const config = fs.existsSync(configPath) ? readJsonSafe(configPath) : null;
  if (!config?.families) return;
  for (const family of config.families || []) {
    for (const competition of family.competitions || []) {
      const slug = competition.competitionSlug;
      if (!slug) continue;
      const host = competition.sourceHost || family.sourceHost || hostFromUrl(competition.sourceUrl || competition.endpointUrl);
      if (!host || isNoiseHost(host)) continue;
      if (!registry.has(slug)) registry.set(slug, new Map());
      const byHost = registry.get(slug);
      const h = cleanHost(host);
      byHost.set(h, {
        competitionSlug: slug,
        host: h,
        confidence: 100,
        sourceKind,
        sourceUrl: competition.sourceUrl || competition.endpointUrl || null,
        familyId: family.familyId || null,
        adapter: competition.adapter || family.adapter || null
      });
    }
  }
}

function appendSeedHosts(registry) {
  for (const [slug, hosts] of Object.entries(OFFICIAL_HOST_SEEDS)) {
    if (!registry.has(slug)) registry.set(slug, new Map());
    const byHost = registry.get(slug);
    for (const host of hosts) {
      const h = cleanHost(host);
      if (!h || isNoiseHost(h)) continue;
      if (!byHost.has(h)) {
        byHost.set(h, {
          competitionSlug: slug,
          host: h,
          confidence: 80,
          sourceKind: "seed_registry_needs_fetch_verification",
          sourceUrl: `https://${h}/`,
          familyId: null,
          adapter: null
        });
      }
    }
  }
}

function appendDiscoveryCandidateHosts(registry, candidates) {
  for (const row of candidates) {
    const slug = row.competitionSlug;
    const host = cleanHost(row.host);
    if (!slug || !host || isNoiseHost(host)) continue;
    const seeds = OFFICIAL_HOST_SEEDS[slug] || [];
    const matchesSeed = seeds.length > 0 && hostMatchesSeed(host, seeds);
    if (!matchesSeed && Number(row.score || 0) < 95) continue;
    if (!registry.has(slug)) registry.set(slug, new Map());
    const byHost = registry.get(slug);
    const confidence = matchesSeed ? 95 : Math.min(90, Number(row.score || 0));
    const existing = byHost.get(host);
    if (!existing || confidence > existing.confidence) {
      byHost.set(host, {
        competitionSlug: slug,
        host,
        confidence,
        sourceKind: matchesSeed ? "enhanced_discovery_seed_matched" : "enhanced_discovery_strong_candidate",
        sourceUrl: row.link || `https://${host}/`,
        familyId: null,
        adapter: null,
        candidateTitle: row.title || null,
        candidateScore: row.score || null
      });
    }
  }
}

function bestHostForTask(task, registry) {
  const hosts = [...(registry.get(task.competitionSlug)?.values() || [])];
  hosts.sort((a, b) => b.confidence - a.confidence || a.host.localeCompare(b.host));
  return hosts[0] || null;
}

function routeTemplatesFor(task, hostInfo, name) {
  const kind = taskKind(task);
  const host = hostInfo.host;
  const urls = new Set();

  if (hostInfo.sourceUrl && /^https?:\/\//i.test(hostInfo.sourceUrl)) urls.add(hostInfo.sourceUrl);
  urls.add(`https://${host}/`);

  if (kind === "next_season_start_date") {
    urls.add(`https://${host}/fixtures`);
    urls.add(`https://${host}/matches`);
    urls.add(`https://${host}/calendar`);
    urls.add(`https://${host}/schedule`);
    urls.add(`https://${host}/news`);
  }

  if (kind === "previous_completed_standings") {
    urls.add(`https://${host}/standings`);
    urls.add(`https://${host}/table`);
    urls.add(`https://${host}/ranking`);
    urls.add(`https://${host}/competition`);
  }

  if (host === "laliga.com") {
    if (task.competitionSlug === "esp.1") urls.add("https://www.laliga.com/en-GB/laliga-easports/standing");
    if (task.competitionSlug === "esp.2") urls.add("https://www.laliga.com/en-GB/laliga-hypermotion/standing");
  }
  if (host === "bundesliga.com") {
    if (task.competitionSlug === "ger.1") urls.add("https://www.bundesliga.com/en/bundesliga/table");
    if (task.competitionSlug === "ger.2") urls.add("https://www.bundesliga.com/en/2bundesliga/table");
  }
  if (host === "dfb.de" && task.competitionSlug === "ger.3") urls.add("https://www.dfb.de/3-liga/tabelle/");
  if (host === "hnl.hr" && task.competitionSlug === "cro.1") urls.add("https://hnl.hr/supersport-hnl/ljestvica/");
  if (host === "spfl.co.uk") {
    if (task.competitionSlug === "sco.1") urls.add("https://spfl.co.uk/league/premiership/table");
    if (task.competitionSlug === "sco.2") urls.add("https://spfl.co.uk/league/championship/table");
  }
  if (host === "eredivisie.nl" && task.competitionSlug === "ned.1") urls.add("https://eredivisie.nl/competitie/stand/");
  if (host === "premierleague.com" && task.competitionSlug === "eng.1") urls.add("https://www.premierleague.com/en/tables/premier-league/2025-26/all-matchweeks");
  if (host === "ligaportugal.pt") {
    if (task.competitionSlug === "por.1") urls.add("https://www.ligaportugal.pt/pt/liga/classificacao/20252026/ligaportugalbetclic");
    if (task.competitionSlug === "por.2") urls.add("https://www.ligaportugal.pt/pt/liga/classificacao/20252026/ligaportugalmeusuper");
  }

  return [...urls].slice(0, 8).map((url) => ({
    url,
    routeIntent: kind,
    expectedSeasonLabel:
      kind === "next_season_start_date" ? "2026-2027" :
      kind === "previous_completed_standings" ? "2025-2026" :
      null,
    name
  }));
}

ensureDir(OUT_DIR);

const acceptedTasksPath = latestFile(/accepted-prioritized-lifecycle-tasks-\d{4}-\d{2}-\d{2}\.jsonl$/);
const lifecycleRowsPath = latestFile(/permanent-season-lifecycle-rows-\d{4}-\d{2}-\d{2}\.jsonl$/);
const enhancedCandidatesPath = latestFile(/enhanced-bulk-high-value-source-discovery-candidates-\d{4}-\d{2}-\d{2}\.jsonl$/);
if (!acceptedTasksPath) throw new Error("Missing accepted prioritized lifecycle tasks");
if (!lifecycleRowsPath) throw new Error("Missing lifecycle rows");

const acceptedTasks = parseJsonlSafe(acceptedTasksPath);
const lifecycleRows = parseJsonlSafe(lifecycleRowsPath);
const lifecycleBySlug = new Map(lifecycleRows.map((row) => [row.competitionSlug, row]));
const enhancedCandidates = enhancedCandidatesPath ? parseJsonlSafe(enhancedCandidatesPath) : [];

const registry = new Map();
appendConfigHosts(registry, path.join(ROOT, "engine-v1", "config", "football-truth-browser-rendered-official-route-families.json"), "verified_browser_rendered_config");
appendConfigHosts(registry, path.join(ROOT, "engine-v1", "config", "football-truth-official-api-route-families.json"), "verified_official_api_config");
appendSeedHosts(registry);
appendDiscoveryCandidateHosts(registry, enhancedCandidates);

const supportedTasks = acceptedTasks
  .filter((task) => ["next_season_start_date", "previous_completed_standings"].includes(taskKind(task)))
  .map((task) => {
    const bestHost = bestHostForTask(task, registry);
    const name = taskDisplayName(task, lifecycleBySlug);
    const country = taskCountry(task, lifecycleBySlug);
    const routeTemplates = bestHost ? routeTemplatesFor(task, bestHost, name) : [];
    const hostResolutionStatus =
      bestHost && bestHost.confidence >= 100 ? "verified_config_host" :
      bestHost && bestHost.confidence >= 80 ? "seed_or_discovery_host_needs_fetch_verification" :
      "unresolved_needs_host_mining";
    return {
      ...task,
      taskKind: taskKind(task),
      displayName: name,
      country,
      hostResolutionStatus,
      officialHost: bestHost?.host || null,
      officialHostConfidence: bestHost?.confidence || 0,
      officialHostSourceKind: bestHost?.sourceKind || null,
      officialHostSourceUrl: bestHost?.sourceUrl || null,
      routeTemplates,
      taskPriority: taskPriority(task)
    };
  });

supportedTasks.sort((a, b) =>
  b.officialHostConfidence - a.officialHostConfidence ||
  b.taskPriority - a.taskPriority ||
  a.competitionSlug.localeCompare(b.competitionSlug) ||
  a.taskKind.localeCompare(b.taskKind)
);

const controlledFetchPack = supportedTasks
  .filter((task) => task.officialHost && task.routeTemplates.length > 0 && task.officialHostConfidence >= 80)
  .slice(0, CONTROLLED_FETCH_PACK_SIZE);

const unresolvedHostMiningPack = supportedTasks
  .filter((task) => !task.officialHost || task.officialHostConfidence < 80)
  .slice(0, 240);

const registryRows = [...registry.entries()].flatMap(([slug, byHost]) => [...byHost.values()]);
registryRows.sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug) || b.confidence - a.confidence || a.host.localeCompare(b.host));

const fetchRows = controlledFetchPack.flatMap((task) => task.routeTemplates.map((route, index) => ({
  competitionSlug: task.competitionSlug,
  taskType: task.taskType,
  taskKind: task.taskKind,
  displayName: task.displayName,
  country: task.country,
  officialHost: task.officialHost,
  officialHostConfidence: task.officialHostConfidence,
  officialHostSourceKind: task.officialHostSourceKind,
  routeIndex: index,
  url: route.url,
  routeIntent: route.routeIntent,
  expectedSeasonLabel: route.expectedSeasonLabel,
  guardrails: {
    fetchOnlyWithAllowFetch: true,
    noCanonicalWrites: true,
    noProductionWrites: true,
    rawPayloadCommitsForbidden: true,
    startDateRequiresGovernedDateMention: true,
    standingsRequiresExpectedRowsArithmeticAndNonZeroGate: true
  }
})));

const summary = {
  status: "passed",
  runner: "host_first_bulk_execution_board",
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  hostFirstBoardWriteExecutedNowCount: 1,
  acceptedTasksPath: rel(acceptedTasksPath),
  lifecycleRowsPath: rel(lifecycleRowsPath),
  enhancedCandidatesPath: enhancedCandidatesPath ? rel(enhancedCandidatesPath) : null,
  acceptedTaskCount: acceptedTasks.length,
  supportedTaskCount: supportedTasks.length,
  registrySlugCount: registry.size,
  registryHostRowCount: registryRows.length,
  verifiedConfigHostTaskCount: supportedTasks.filter((task) => task.hostResolutionStatus === "verified_config_host").length,
  seedOrDiscoveryHostTaskCount: supportedTasks.filter((task) => task.hostResolutionStatus === "seed_or_discovery_host_needs_fetch_verification").length,
  unresolvedNeedsHostMiningTaskCount: supportedTasks.filter((task) => task.hostResolutionStatus === "unresolved_needs_host_mining").length,
  controlledFetchPackTaskCount: controlledFetchPack.length,
  controlledFetchUrlCount: fetchRows.length,
  unresolvedHostMiningPackTaskCount: unresolvedHostMiningPack.length,
  permanentPolicyRepeatsEverySeason: true,
  recommendedNextLane: "run_controlled_host_first_bulk_fetch_pack_then_extract_start_dates_and_standings_without_canonical_or_production_writes"
};

const outPath = path.join(OUT_DIR, `host-first-bulk-execution-board-${DATE}.json`);
const registryPath = path.join(OUT_DIR, `official-host-registry-rows-${DATE}.jsonl`);
const tasksPath = path.join(OUT_DIR, `host-first-supported-tasks-${DATE}.jsonl`);
const fetchPackPath = path.join(OUT_DIR, `host-first-controlled-fetch-pack-${DATE}.jsonl`);
const unresolvedPath = path.join(OUT_DIR, `host-first-unresolved-host-mining-pack-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({
  summary,
  topControlledFetchPackTasks: controlledFetchPack.slice(0, 80).map((task) => ({
    competitionSlug: task.competitionSlug,
    taskKind: task.taskKind,
    displayName: task.displayName,
    officialHost: task.officialHost,
    officialHostConfidence: task.officialHostConfidence,
    officialHostSourceKind: task.officialHostSourceKind,
    routeTemplateCount: task.routeTemplates.length
  })),
  unresolvedHostMiningSample: unresolvedHostMiningPack.slice(0, 80).map((task) => ({
    competitionSlug: task.competitionSlug,
    taskKind: task.taskKind,
    displayName: task.displayName,
    country: task.country
  }))
}, null, 2) + "\n", "utf8");

fs.writeFileSync(registryPath, registryRows.map((row) => JSON.stringify(row)).join("\n") + (registryRows.length ? "\n" : ""), "utf8");
fs.writeFileSync(tasksPath, supportedTasks.map((row) => JSON.stringify(row)).join("\n") + (supportedTasks.length ? "\n" : ""), "utf8");
fs.writeFileSync(fetchPackPath, fetchRows.map((row) => JSON.stringify(row)).join("\n") + (fetchRows.length ? "\n" : ""), "utf8");
fs.writeFileSync(unresolvedPath, unresolvedHostMiningPack.map((row) => JSON.stringify(row)).join("\n") + (unresolvedHostMiningPack.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  registryOutput: rel(registryPath),
  supportedTasksOutput: rel(tasksPath),
  controlledFetchPackOutput: rel(fetchPackPath),
  unresolvedHostMiningPackOutput: rel(unresolvedPath),
  summary
}, null, 2));
