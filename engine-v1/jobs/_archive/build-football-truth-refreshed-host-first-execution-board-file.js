import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const DATA_ROOT = path.join(ROOT, "data", "football-truth");
const DIAG_ROOT = path.join(DATA_ROOT, "_diagnostics");
const OUT_DIR = path.join(DIAG_ROOT, `refreshed-host-first-execution-board-${DATE}`);

const MAX_CONTROLLED_TASKS = Number(process.env.REFRESHED_HOST_FIRST_MAX_TASKS || "220");
const MAX_URLS_PER_TASK = Number(process.env.REFRESHED_HOST_FIRST_MAX_URLS_PER_TASK || "8");

const OFFICIAL_HOST_REGISTRY = {
  "esp.1": ["laliga.com"],
  "esp.2": ["laliga.com"],
  "ger.1": ["bundesliga.com"],
  "ger.2": ["bundesliga.com"],
  "ger.3": ["dfb.de"],
  "cro.1": ["hnl.hr"],
  "cro.2": ["hnl.hr"],
  "sco.1": ["spfl.co.uk"],
  "sco.2": ["spfl.co.uk"],
  "ned.1": ["eredivisie.nl"],
  "den.1": ["superliga.dk", "api.superliga.dk"],
  "ksa.1": ["spl.com.sa"],
  "eng.1": ["premierleague.com"],
  "eng.2": ["efl.com"],
  "eng.3": ["efl.com"],
  "eng.4": ["efl.com"],
  "eng.5": ["thenationalleague.org.uk"],
  "ita.1": ["legaseriea.it"],
  "ita.2": ["legab.it"],
  "fra.1": ["lfp.fr", "ligue1.com"],
  "fra.2": ["lfp.fr", "ligue2.fr"],
  "por.1": ["ligaportugal.pt"],
  "por.2": ["ligaportugal.pt"],
  "swe.1": ["allsvenskan.se"],
  "swe.2": ["superettan.se"],
  "nor.1": ["eliteserien.no"],
  "nor.2": ["fotball.no"],
  "fin.1": ["veikkausliiga.com", "palloliitto.fi"],
  "fin.2": ["palloliitto.fi"],
  "pol.1": ["ekstraklasa.org"],
  "pol.2": ["1liga.org"],
  "aut.1": ["bundesliga.at"],
  "aut.2": ["2liga.at"],
  "sui.1": ["sfl.ch"],
  "sui.2": ["sfl.ch"],
  "jpn.1": ["jleague.co"],
  "jpn.2": ["jleague.co"],
  "kor.1": ["kleague.com"],
  "kor.2": ["kleague.com"],
  "mex.1": ["ligamx.net"],
  "mex.2": ["ligamx.net"],
  "usa.1": ["mlssoccer.com"],
  "usa.2": ["uslchampionship.com"],
  "geo.1": ["erovnuliliga.ge"],
  "geo.2": ["erovnuliliga.ge"],
  "gre.1": ["slgr.gr"],
  "gre.2": ["sl2.gr"],
  "ser.1": ["fss.rs"],
  "ukr.1": ["upl.ua"],
  "ukr.2": ["pfl.ua"],
  "irl.1": ["leagueofireland.ie"],
  "irl.2": ["leagueofireland.ie"],
  "isl.1": ["ksi.is"],
  "isl.2": ["ksi.is"],
  "cze.1": ["chance-liga.cz", "fotbal.cz"],
  "cze.2": ["fotbal.cz"],
  "arg.1": ["afa.com.ar"],
  "arg.2": ["afa.com.ar"],
  "aus.1": ["aleagues.com.au"],
  "aus.2": ["footballaustralia.com.au"],
  "can.1": ["cplsoccer.com"],
  "can.2": ["canadasoccer.com"],
  "qat.1": ["qsl.qa"],
  "wal.1": ["faw.cymru"]
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

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hostRoot(host) {
  return String(host || "").replace(/^www\./, "").toLowerCase();
}

function https(host, pathValue = "/") {
  const h = hostRoot(host);
  const p = String(pathValue || "/");
  return `https://${h}${p.startsWith("/") ? p : `/${p}`}`;
}

function slugPrefix(slug) {
  return String(slug || "").split(".")[0] || "";
}

function taskPriority(task) {
  const slug = task.competitionSlug;
  const high = new Set(["eng.2","eng.3","eng.4","ita.1","ita.2","fra.1","fra.2","por.1","por.2","aut.1","aut.2","sui.1","sui.2","nor.1","nor.2","swe.1","swe.2","pol.1","jpn.1","jpn.2","usa.1","mex.1","kor.1","gre.1","ser.1","ukr.1","geo.1","geo.2"]);
  const isStart = task.taskType === "acquire_next_season_start_date";
  const isStandings = task.taskType === "acquire_previous_completed_standings";
  let score = 0;
  if (high.has(slug)) score += 1000;
  if (OFFICIAL_HOST_REGISTRY[slug]) score += 500;
  if (isStart) score += 120;
  if (isStandings) score += 100;
  if (task.sourceHostHint) score += 180;
  if (["eng","ita","fra","por","aut","sui","nor","swe","pol","jpn","usa","mex","kor","gre","ser","ukr","geo"].includes(slugPrefix(slug))) score += 200;
  if (["gib","smr","and","lie","mlt","lux"].includes(slugPrefix(slug))) score -= 500;
  return score;
}

function buildUrls(task, host) {
  const h = hostRoot(host);
  const urls = [];
  const type = task.taskType;

  if (type === "acquire_previous_completed_standings") {
    urls.push(https(h, "/standings"));
    urls.push(https(h, "/table"));
    urls.push(https(h, "/ranking"));
    urls.push(https(h, "/standings/2025"));
    urls.push(https(h, "/standings/2025-2026"));
    urls.push(https(h, "/table/2025"));
    urls.push(https(h, "/ranking/2025"));
  }

  if (type === "acquire_next_season_start_date") {
    urls.push(https(h, "/calendar"));
    urls.push(https(h, "/fixtures"));
    urls.push(https(h, "/schedule"));
    urls.push(https(h, "/matches"));
    urls.push(https(h, "/news"));
    urls.push(https(h, "/news/2026"));
    urls.push(https(h, "/calendar/2026"));
    urls.push(https(h, "/fixtures/2026"));
  }

  if (h === "laliga.com") {
    if (task.competitionSlug === "esp.1") urls.push("https://www.laliga.com/en-GB/laliga-easports/calendar", "https://www.laliga.com/laliga-easports/calendario");
    if (task.competitionSlug === "esp.2") urls.push("https://www.laliga.com/en-GB/laliga-hypermotion/calendar", "https://www.laliga.com/laliga-hypermotion/calendario");
  }

  if (h === "bundesliga.com") {
    if (task.competitionSlug === "ger.1") urls.push("https://www.bundesliga.com/en/bundesliga/matchday", "https://www.bundesliga.com/en/bundesliga/table");
    if (task.competitionSlug === "ger.2") urls.push("https://www.bundesliga.com/en/2bundesliga/matchday", "https://www.bundesliga.com/en/2bundesliga/table");
  }

  if (h === "dfb.de") urls.push("https://www.dfb.de/3-liga/tabelle/", "https://www.dfb.de/3-liga/spieltagtabelle/");
  if (h === "spfl.co.uk") urls.push("https://spfl.co.uk/league/premiership/table", "https://spfl.co.uk/league/championship/table", "https://spfl.co.uk/news/spfl-fixtures-for-202627");
  if (h === "ligaportugal.pt") urls.push("https://www.ligaportugal.pt/pt/liga/classificacao/20252026/ligaportugalbetclic", "https://www.ligaportugal.pt/pt/liga/classificacao/20252026/ligaportugalmeusuper");
  if (h === "lfp.fr") urls.push("https://www.lfp.fr/ligue-1/classement", "https://www.lfp.fr/ligue-2/classement");
  if (h === "legaseriea.it") urls.push("https://www.legaseriea.it/serie-a/classifica", "https://www.legaseriea.it/serie-a/calendario-e-risultati");
  if (h === "legab.it") urls.push("https://www.legab.it/seriebkt/classifica", "https://www.legab.it/seriebkt/calendario");
  if (h === "eliteserien.no") urls.push("https://www.eliteserien.no/tabell", "https://www.eliteserien.no/terminliste");
  if (h === "erovnuliliga.ge") urls.push("https://erovnuliliga.ge/en/tables", "https://erovnuliliga.ge/ge/tables", "https://erovnuliliga.ge/en/calendar", "https://erovnuliliga.ge/ge/calendar");
  if (h === "jleague.co") urls.push("https://www.jleague.co/standings/j1/2025/", "https://www.jleague.co/standings/j2/2025/", "https://www.jleague.co/fixtures/j1/2026/latest/", "https://www.jleague.co/fixtures/j2/2026/latest/");
  if (h === "mlssoccer.com") urls.push("https://www.mlssoccer.com/standings/2025/supporters-shield", "https://www.mlssoccer.com/standings/2025/conference", "https://www.mlssoccer.com/schedule/");
  if (h === "spl.com.sa") urls.push("https://www.spl.com.sa/en/table", "https://www.spl.com.sa/en/fixtures");

  return [...new Set(urls)].slice(0, MAX_URLS_PER_TASK);
}

ensureDir(OUT_DIR);

const dueTasksPath = latestFile(/permanent-season-lifecycle-due-tasks-\d{4}-\d{2}-\d{2}\.jsonl$/);
if (!dueTasksPath) throw new Error("Missing lifecycle due tasks");

const dueTasks = parseJsonlSafe(dueTasksPath);
const hostFirstTasks = [];
const unresolvedTasks = [];

for (const task of dueTasks) {
  const slug = task.competitionSlug;
  const hosts = OFFICIAL_HOST_REGISTRY[slug] || (task.sourceHostHint ? [task.sourceHostHint] : []);
  if (!hosts.length) {
    unresolvedTasks.push({ ...task, taskPriority: taskPriority(task), reason: "no_official_host_registry_or_hint" });
    continue;
  }
  hostFirstTasks.push({
    ...task,
    taskPriority: taskPriority(task),
    officialHosts: hosts.map(hostRoot),
    reason: "official_host_available_after_current_lifecycle_refresh"
  });
}

hostFirstTasks.sort((a, b) => b.taskPriority - a.taskPriority || String(a.competitionSlug).localeCompare(String(b.competitionSlug)) || String(a.taskType).localeCompare(String(b.taskType)));
unresolvedTasks.sort((a, b) => b.taskPriority - a.taskPriority || String(a.competitionSlug).localeCompare(String(b.competitionSlug)));

const controlledTasks = hostFirstTasks.slice(0, MAX_CONTROLLED_TASKS);
const controlledFetchPack = [];

for (const task of controlledTasks) {
  for (const host of task.officialHosts) {
    for (const url of buildUrls(task, host)) {
      controlledFetchPack.push({
        competitionSlug: task.competitionSlug,
        taskType: task.taskType,
        targetSeasonLabel: task.targetSeasonLabel || null,
        officialHost: host,
        fetchUrl: url,
        taskPriority: task.taskPriority,
        source: "refreshed_host_first_execution_board"
      });
    }
  }
}

const dedupedPack = [];
const seen = new Set();
for (const row of controlledFetchPack) {
  const key = `${row.competitionSlug}|${row.taskType}|${row.fetchUrl}`;
  if (seen.has(key)) continue;
  seen.add(key);
  dedupedPack.push(row);
}

const summary = {
  status: "passed",
  runner: "refreshed_host_first_execution_board",
  sourceDueTasksPath: rel(dueTasksPath),
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  rawPayloadWriteExecutedNowCount: 0,
  inputDueTaskCount: dueTasks.length,
  hostFirstTaskCount: hostFirstTasks.length,
  unresolvedTaskCount: unresolvedTasks.length,
  controlledTaskCount: controlledTasks.length,
  controlledFetchUrlCount: dedupedPack.length,
  officialRegistrySlugCount: Object.keys(OFFICIAL_HOST_REGISTRY).length,
  alreadySatisfiedStartDateSlugsExpectedExcluded: ["eng.1", "ksa.1"],
  controlledPackIncludesSatisfiedStartDateTaskCount: dedupedPack.filter((row) => row.taskType === "acquire_next_season_start_date" && ["eng.1","ksa.1"].includes(row.competitionSlug)).length,
  standingsTaskCount: controlledTasks.filter((task) => task.taskType === "acquire_previous_completed_standings").length,
  startDateTaskCount: controlledTasks.filter((task) => task.taskType === "acquire_next_season_start_date").length,
  recommendedNextLane: "run_controlled_refreshed_host_first_fetch_pack_no_raw_payload_writes"
};

const outPath = path.join(OUT_DIR, `refreshed-host-first-execution-board-${DATE}.json`);
const tasksPath = path.join(OUT_DIR, `refreshed-host-first-tasks-${DATE}.jsonl`);
const fetchPackPath = path.join(OUT_DIR, `refreshed-host-first-controlled-fetch-pack-${DATE}.jsonl`);
const unresolvedPath = path.join(OUT_DIR, `refreshed-host-first-unresolved-tasks-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({
  summary,
  topControlledTasks: controlledTasks.slice(0, 120),
  topFetchPackRows: dedupedPack.slice(0, 160),
  unresolvedSample: unresolvedTasks.slice(0, 160)
}, null, 2) + "\n", "utf8");

fs.writeFileSync(tasksPath, hostFirstTasks.map((row) => JSON.stringify(row)).join("\n") + (hostFirstTasks.length ? "\n" : ""), "utf8");
fs.writeFileSync(fetchPackPath, dedupedPack.map((row) => JSON.stringify(row)).join("\n") + (dedupedPack.length ? "\n" : ""), "utf8");
fs.writeFileSync(unresolvedPath, unresolvedTasks.map((row) => JSON.stringify(row)).join("\n") + (unresolvedTasks.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  tasksOutput: rel(tasksPath),
  controlledFetchPackOutput: rel(fetchPackPath),
  unresolvedTasksOutput: rel(unresolvedPath),
  summary
}, null, 2));
