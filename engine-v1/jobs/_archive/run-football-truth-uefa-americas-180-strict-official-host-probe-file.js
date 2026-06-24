import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const allowFetch = process.argv.includes("--allow-fetch");

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-uefa-americas-180-strict-official-host-probe-${today}`);
const outPath = path.join(outDir, `football-truth-uefa-americas-180-strict-official-host-probe-${today}.json`);
const rowsPath = path.join(outDir, `football-truth-uefa-americas-180-strict-official-host-probe-rows-${today}.jsonl`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
function shaText(text) { return crypto.createHash("sha256").update(String(text || "")).digest("hex"); }
function stripHtml(value) { return String(value || "").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&#x([0-9a-f]+);/gi,(_,h)=>String.fromCodePoint(parseInt(h,16))).replace(/&#(\d+);/g,(_,d)=>String.fromCodePoint(parseInt(d,10))).replace(/\s+/g," ").trim(); }
function norm(value) { return stripHtml(value).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu,"").replace(/[^\p{L}\p{N}]+/gu," ").replace(/\s+/g," ").trim(); }
function titleOf(html) { const m = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i); return stripHtml(m?.[1] || "").slice(0,180); }
function hostOf(url) { try { return new URL(url).host.toLowerCase().replace(/^www\./,""); } catch { return ""; } }
function uniq(values) { return [...new Set((values || []).filter(Boolean))]; }

const officialHosts = {
  alb:["fshf.org"], and:["faf.ad"], arm:["ffa.am"], aut:["oefb.at","oefbl.at"], aze:["affa.az"], bel:["proleague.be","rbfa.be"], bih:["nfsbih.ba"], blr:["abff.by"], bul:["bfunion.bg"], cro:["hns.family"], cyp:["cfa.com.cy"], cze:["fotbal.cz"], den:["dbu.dk","superliga.dk"], eng:["efl.com","premierleague.com","thenationalleague.org.uk"], esp:["laliga.com","rfef.es"], est:["jalgpall.ee"], fin:["palloliitto.fi"], fra:["fff.fr","ligue1.com"], fro:["football.fo"], geo:["gff.ge"], ger:["dfb.de","bundesliga.com"], gib:["gibraltarfa.com"], gre:["epo.gr","slgr.gr"], hun:["mlsz.hu"], irl:["leagueofireland.ie","fai.ie"], isl:["ksi.is"], isr:["football.org.il"], ita:["legaseriea.it","legab.it"], kaz:["kff.kz"], kos:["ffk-kosova.com"], lie:["lfv.li"], ltu:["lff.lt"], lux:["flf.lu"], lva:["lff.lv"], mda:["fmf.md"], mkd:["ffm.mk"], mlt:["mfa.com.mt"], mne:["fscg.me"], ned:["eredivisie.nl","keukenkampioendivisie.nl","knvb.nl"], nir:["nifootballleague.com","irishfa.com"], nor:["fotball.no","eliteserien.no"], pol:["pzpn.pl","ekstraklasa.org"], por:["ligaportugal.pt","fpf.pt"], rou:["frf.ro"], rus:["rfs.ru"], sco:["spfl.co.uk","scottishfa.co.uk"], smr:["fsgc.sm"], srb:["fss.rs"], sui:["sfl.ch","football.ch"], svk:["futbalsfz.sk"], svn:["nzs.si"], swe:["svenskfotboll.se"], tur:["tff.org"], ukr:["upl.ua","uaf.ua"], wal:["faw.cymru"],
  arg:["afa.com.ar","ligaprofesional.ar"], bol:["fbf.com.bo"], bra:["cbf.com.br"], can:["canpl.ca","canadasoccer.com"], chi:["anfp.cl","campeonatochileno.cl"], col:["dimayor.com.co"], crc:["unafut.com","fedefutbol.com"], ecu:["ligapro.ec","fef.ec"], slv:["fesfut.org.sv"], gua:["fedefutguate.gt"], hai:["fhf.ht"], hon:["fenafuth.org.hn"], jam:["jff.football"], mex:["ligamx.net","fmf.mx"], nca:["fenifut.org.ni"], pan:["fepafut.com"], par:["apf.org.py"], per:["fpf.org.pe"], tri:["ttfootball.org"], uru:["auf.org.uy"], usa:["mlssoccer.com","uslchampionship.com","ussoccer.com"], ven:["fvf.com.ve"]
};

const countryNames = {
  alb:"Albania",and:"Andorra",arm:"Armenia",aut:"Austria",aze:"Azerbaijan",bel:"Belgium",bih:"Bosnia and Herzegovina",blr:"Belarus",bul:"Bulgaria",cro:"Croatia",cyp:"Cyprus",cze:"Czechia",den:"Denmark",eng:"England",esp:"Spain",est:"Estonia",fin:"Finland",fra:"France",fro:"Faroe Islands",geo:"Georgia",ger:"Germany",gib:"Gibraltar",gre:"Greece",hun:"Hungary",irl:"Ireland",isl:"Iceland",isr:"Israel",ita:"Italy",kaz:"Kazakhstan",kos:"Kosovo",lie:"Liechtenstein",ltu:"Lithuania",lux:"Luxembourg",lva:"Latvia",mda:"Moldova",mkd:"North Macedonia",mlt:"Malta",mne:"Montenegro",ned:"Netherlands",nir:"Northern Ireland",nor:"Norway",pol:"Poland",por:"Portugal",rou:"Romania",rus:"Russia",sco:"Scotland",smr:"San Marino",srb:"Serbia",sui:"Switzerland",svk:"Slovakia",svn:"Slovenia",swe:"Sweden",tur:"Turkey",ukr:"Ukraine",wal:"Wales",
  arg:"Argentina",bol:"Bolivia",bra:"Brazil",can:"Canada",chi:"Chile",col:"Colombia",crc:"Costa Rica",ecu:"Ecuador",slv:"El Salvador",gua:"Guatemala",hai:"Haiti",hon:"Honduras",jam:"Jamaica",mex:"Mexico",nca:"Nicaragua",pan:"Panama",par:"Paraguay",per:"Peru",tri:"Trinidad and Tobago",uru:"Uruguay",usa:"United States",ven:"Venezuela"
};

const uefaPrefixes = ["eng","esp","ger","ita","fra","ned","por","bel","sco","aut","sui","den","swe","nor","fin","isl","cyp","cro","srb","bih","mne","gre","tur","pol","rou","cze","svk","svn","hun","bul","geo","arm","aze","isr","lux","mlt","and","fro","kos","ltu","lva","est","mda","mkd","alb","blr","ukr","kaz","gib","lie","nir","smr","rus","wal"];
const americasPrefixes = ["usa","mex","arg","bra","col","chi","uru","ecu","par","per","ven","bol","crc","pan","gua","hon","slv","jam","tri","hai","nca","can"];

function confederation(prefix) {
  if (uefaPrefixes.includes(prefix)) return "UEFA";
  if (americasPrefixes.includes(prefix)) return "AMERICAS";
  return "OTHER";
}

function levelName(level) {
  if (level === 1) return "top division";
  if (level === 2) return "second division";
  if (level === 3) return "third division";
  return `level ${level}`;
}

function priority(prefix, level) {
  let score = confederation(prefix) === "UEFA" ? 1000 : 900;
  if (level === 1) score += 100;
  if (level === 2) score += 80;
  if (level === 3) score += 50;
  if (["eng","esp","ger","ita","fra","ned","por","bel","sco","usa","mex","arg","bra","col","chi","uru"].includes(prefix)) score += 100;
  if ((officialHosts[prefix] || []).length > 1) score += 20;
  return score;
}

function buildTargets() {
  const targets = [];
  for (const prefix of [...uefaPrefixes, ...americasPrefixes]) {
    const levels = ["eng","esp","ger","ita","fra","ned","por","bel","sco","usa","arg","bra","mex","col","chi"].includes(prefix) ? [1,2,3] : [1,2];
    for (const level of levels) {
      targets.push({
        slug: `${prefix}.${level}`,
        countryPrefix: prefix,
        countryName: countryNames[prefix] || prefix.toUpperCase(),
        confederation: confederation(prefix),
        level,
        displayName: `${countryNames[prefix] || prefix.toUpperCase()} ${levelName(level)}`,
        priorityScore: priority(prefix, level),
        officialHosts: officialHosts[prefix] || []
      });
    }
  }
  return targets
    .filter(target => target.officialHosts.length > 0)
    .sort((a,b) => b.priorityScore - a.priorityScore || a.slug.localeCompare(b.slug))
    .slice(0, 180);
}

function plannedUrls(target) {
  const parts = [];
  const hints = [
    "/standings",
    "/standings/",
    "/table",
    "/tables",
    "/league-table",
    "/competitions",
    "/fixtures",
    "/results"
  ];
  for (const host of target.officialHosts.slice(0, 2)) {
    parts.push(`https://${host}/`);
    for (const hint of hints) parts.push(`https://${host}${hint}`);
  }
  return uniq(parts).slice(0, 8);
}

function parseIntLoose(value) {
  const s = stripHtml(value).replace(/[^\d\-+]/g,"");
  if (!s || s === "-" || s === "+") return null;
  const n = Number.parseInt(s,10);
  return Number.isFinite(n) ? n : null;
}

function parseSigned(value) {
  const m = stripHtml(value).match(/[+\-]?\d+/);
  if (!m) return null;
  const n = Number.parseInt(m[0],10);
  return Number.isFinite(n) ? n : null;
}

function isHeaderLike(row) {
  const n = norm(row.teamName || "");
  const noNums = [row.played,row.wins,row.draws,row.losses,row.points].every(v => v == null);
  return noNums || ["team","club","teams","pos","position","name","naam","joukkue","lið","tim","klub"].includes(n);
}

function withArithmetic(row, rawCells) {
  if (!row || !row.teamName || isHeaderLike(row)) return null;
  if (row.goalDifference == null && row.goalsFor != null && row.goalsAgainst != null) row.goalDifference = row.goalsFor - row.goalsAgainst;
  const playedOk = row.played != null && row.wins != null && row.draws != null && row.losses != null ? row.played === row.wins + row.draws + row.losses : null;
  const gdOk = row.goalsFor != null && row.goalsAgainst != null && row.goalDifference != null ? row.goalDifference === row.goalsFor - row.goalsAgainst : null;
  const ptsOk = row.wins != null && row.draws != null && row.points != null ? row.points === row.wins * 3 + row.draws : null;
  return {
    position: row.position ?? null,
    teamName: stripHtml(row.teamName),
    played: row.played ?? null,
    wins: row.wins ?? null,
    draws: row.draws ?? null,
    losses: row.losses ?? null,
    goalsFor: row.goalsFor ?? null,
    goalsAgainst: row.goalsAgainst ?? null,
    goalDifference: row.goalDifference ?? null,
    points: row.points ?? null,
    playedArithmeticPassed: playedOk,
    goalDifferenceArithmeticPassed: gdOk,
    pointsArithmeticPassed: ptsOk,
    arithmeticPassed: playedOk !== false && gdOk !== false && ptsOk !== false && (playedOk === true || gdOk === true || ptsOk === true),
    rawCells
  };
}

function extractTables(html) {
  const tables = [];
  const tableRx = /<table\b[\s\S]*?<\/table>/gi;
  let tm;
  while ((tm = tableRx.exec(html)) !== null) {
    const rows = [];
    const rowRx = /<tr\b[\s\S]*?<\/tr>/gi;
    let rm;
    while ((rm = rowRx.exec(tm[0])) !== null) {
      const cells = [];
      const cellRx = /<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi;
      let cm;
      while ((cm = cellRx.exec(rm[0])) !== null) cells.push(stripHtml(cm[1]));
      if (cells.length) rows.push(cells);
    }
    tables.push({ tableIndex: tables.length, rows });
  }
  return tables;
}

function candidateFromCells(cells) {
  const c = cells.map(stripHtml).filter(Boolean);
  const candidates = [];
  for (let offset = 0; offset <= Math.min(2, c.length - 7); offset++) {
    if (c.length - offset >= 10) {
      candidates.push(withArithmetic({
        position: parseIntLoose(c[offset]), teamName: c[offset+1],
        played: parseIntLoose(c[offset+2]), wins: parseIntLoose(c[offset+3]), draws: parseIntLoose(c[offset+4]), losses: parseIntLoose(c[offset+5]),
        goalsFor: parseIntLoose(c[offset+6]), goalsAgainst: parseIntLoose(c[offset+7]), goalDifference: parseSigned(c[offset+8]), points: parseIntLoose(c[offset+9])
      }, c));
    }
    if (c.length - offset >= 7) {
      candidates.push(withArithmetic({
        position: parseIntLoose(c[offset]), teamName: c[offset+1],
        played: parseIntLoose(c[offset+2]), wins: parseIntLoose(c[offset+3]), draws: parseIntLoose(c[offset+4]), losses: parseIntLoose(c[offset+5]), points: parseIntLoose(c[offset+6])
      }, c));
    }
  }
  return candidates.filter(Boolean).sort((a,b) => Number(b.arithmeticPassed) - Number(a.arithmeticPassed))[0] || null;
}

function extractBest(html) {
  const tables = extractTables(html);
  const candidates = tables.map(table => {
    const rows = table.rows.map(candidateFromCells).filter(Boolean);
    const duplicateTeamNameCount = rows.length - new Set(rows.map(row => norm(row.teamName))).size;
    const arithmeticPassedRowCount = rows.filter(row => row.arithmeticPassed).length;
    const playedValues = rows.map(row => row.played).filter(v => v != null);
    const maxPlayed = playedValues.length ? Math.max(...playedValues) : null;
    const score = rows.length * 25 + arithmeticPassedRowCount * 40 - duplicateTeamNameCount * 80 + (maxPlayed && maxPlayed > 0 ? 80 : 0);
    return { tableIndex: table.tableIndex, tableRowCount: table.rows.length, rows, duplicateTeamNameCount, arithmeticPassedRowCount, score };
  }).sort((a,b) => b.score - a.score);

  const selected = candidates[0] || { tableIndex:null, tableRowCount:0, rows:[], duplicateTeamNameCount:0, arithmeticPassedRowCount:0, score:0 };
  const rows = selected.rows;
  const playedValues = rows.map(row => row.played).filter(v => v != null);
  const pointsValues = rows.map(row => row.points).filter(v => v != null);
  const minPlayed = playedValues.length ? Math.min(...playedValues) : null;
  const maxPlayed = playedValues.length ? Math.max(...playedValues) : null;
  const allRowsZeroPlayed = rows.length > 0 && playedValues.length === rows.length && playedValues.every(v => v === 0);
  const allRowsZeroPoints = rows.length > 0 && pointsValues.length === rows.length && pointsValues.every(v => v === 0);

  let lane = "strict_official_no_extractable_table";
  if (rows.length >= 8 && selected.duplicateTeamNameCount === 0 && selected.arithmeticPassedRowCount >= Math.ceil(rows.length * 0.7) && maxPlayed != null && maxPlayed > 0) lane = "strict_official_proof_shape_nonzero_candidate_after_review";
  else if (rows.length >= 8 && selected.duplicateTeamNameCount === 0 && allRowsZeroPlayed && allRowsZeroPoints) lane = "strict_official_zero_played_start_date_lane";
  else if (rows.length >= 4) lane = "strict_official_extraction_review_required";

  return {
    tableCount: tables.length,
    selectedTableIndex: selected.tableIndex,
    selectedTableRowCount: selected.tableRowCount,
    extractedStandingRowCount: rows.length,
    arithmeticPassedRowCount: selected.arithmeticPassedRowCount,
    duplicateTeamNameCount: selected.duplicateTeamNameCount,
    minPlayed,
    maxPlayed,
    lane,
    sampleRows: rows.slice(0, 5).map(row => {
      const { rawCells, ...rest } = row;
      return rest;
    })
  };
}

async function fetchWithTimeout(url, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; AI-MatchLab-FootballTruth/1.0; +uefa-americas-strict-official-host-probe)",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.7",
        "accept-language": "en-US,en;q=0.9"
      }
    });
    const text = await response.text();
    clearTimeout(timer);
    return { response, text, error: null, timedOut: false };
  } catch (error) {
    clearTimeout(timer);
    return { response: null, text: "", error: String(error?.name || error?.message || error), timedOut: String(error?.name || "") === "AbortError" };
  }
}

function pageScore(url, fetched, extraction, expectedHosts) {
  const text = fetched.text || "";
  const finalUrl = fetched.response?.url || url;
  const finalHost = hostOf(finalUrl);
  const strictHostOk = expectedHosts.some(host => finalHost === host || finalHost.endsWith(`.${host}`));
  const title = titleOf(text);
  const standingHints = (text.match(/standings|table|league table|ladder|points|played|wins|draws|losses|tabelle|classement|clasificacion|classifica|posiciones|sarjataulukko/gi) || []).length;
  let score = 0;
  if (strictHostOk) score += 500;
  if ((fetched.response?.status ?? 0) >= 200 && (fetched.response?.status ?? 0) < 400) score += 40;
  score += Math.min(standingHints, 40) * 4;
  if (extraction.lane === "strict_official_proof_shape_nonzero_candidate_after_review") score += 700;
  if (extraction.lane === "strict_official_zero_played_start_date_lane") score += 450;
  if (extraction.lane === "strict_official_extraction_review_required") score += 150;
  if (!strictHostOk) score -= 1000;
  return { score, finalHost, title, standingHints, strictHostOk };
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

await fs.mkdir(outDir, { recursive: true });

const blocks = [];
if (!allowFetch) blocks.push("missing_allow_fetch");

const targets = buildTargets();
if (targets.length < 150) blocks.push("target_count_below_150");

const tasks = [];
for (const target of targets) {
  for (const url of plannedUrls(target)) tasks.push({ target, url });
}

let taskResults = [];
if (blocks.length === 0) {
  console.log(`strict UEFA/Americas targets=${targets.length} official-host fetches=${tasks.length}`);
  taskResults = await mapLimit(tasks, 10, async (task, index) => {
    if ((index + 1) % 50 === 0) console.log(`[${index + 1}/${tasks.length}]`);
    const fetched = await fetchWithTimeout(task.url);
    const extraction = extractBest(fetched.text || "");
    const score = pageScore(task.url, fetched, extraction, task.target.officialHosts);
    return { task, fetched, extraction, score };
  });
}

const grouped = new Map();
for (const result of taskResults) {
  const key = result.task.target.slug;
  const list = grouped.get(key) || [];
  list.push(result);
  grouped.set(key, list);
}

const rows = targets.map(target => {
  const results = (grouped.get(target.slug) || []).sort((a,b) => b.score.score - a.score.score || (b.fetched.text || "").length - (a.fetched.text || "").length);
  const best = results[0] || null;
  const extraction = best?.extraction || extractBest("");
  let finalLane = extraction.lane;
  if (!best || best.score.strictHostOk !== true) finalLane = "strict_official_host_failed";
  if (finalLane === "strict_official_no_extractable_table" && (best?.score.standingHints || 0) >= 12) finalLane = "strict_official_surface_no_table";

  return {
    slug: target.slug,
    countryPrefix: target.countryPrefix,
    countryName: target.countryName,
    confederation: target.confederation,
    level: target.level,
    displayName: target.displayName,
    officialHosts: target.officialHosts,
    plannedUrlCount: plannedUrls(target).length,
    attemptedFetchCount: results.length,
    selectedUrl: best?.task.url || null,
    selectedFinalUrl: best?.fetched.response?.url || best?.task.url || null,
    selectedHost: best?.score.finalHost || null,
    selectedStrictHostOk: best?.score.strictHostOk || false,
    selectedFetchStatus: best?.fetched.response?.status ?? null,
    selectedTitle: best?.score.title || null,
    selectedScore: best?.score.score ?? null,
    selectedBodyLength: (best?.fetched.text || "").length,
    selectedBodySha256: best?.fetched.text ? shaText(best.fetched.text) : null,
    selectedStandingHints: best?.score.standingHints ?? 0,
    tableCount: extraction.tableCount,
    selectedTableIndex: extraction.selectedTableIndex,
    selectedTableRowCount: extraction.selectedTableRowCount,
    extractedStandingRowCount: extraction.extractedStandingRowCount,
    arithmeticPassedRowCount: extraction.arithmeticPassedRowCount,
    duplicateTeamNameCount: extraction.duplicateTeamNameCount,
    minPlayed: extraction.minPlayed,
    maxPlayed: extraction.maxPlayed,
    strictOfficialFinalLane: finalLane,
    sampleRows: extraction.sampleRows,
    acceptedNow: false,
    reviewOnlyCandidateWriteExecutedNow: false,
    canonicalCandidateWriteExecutedNow: false,
    lifecycleWriteExecutedNow: false,
    productionWriteExecutedNow: false,
    truthAssertionExecutedNow: false,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  };
});

const strictOfficialFinalLaneCounts = rows.reduce((acc, row) => {
  acc[row.strictOfficialFinalLane] = (acc[row.strictOfficialFinalLane] || 0) + 1;
  return acc;
}, {});

const confederationCounts = rows.reduce((acc, row) => {
  acc[row.confederation] = (acc[row.confederation] || 0) + 1;
  return acc;
}, {});

const report = {
  status: blocks.length ? "failed" : "passed",
  runner: "football_truth_uefa_americas_180_strict_official_host_probe",
  contractVersion: 1,
  generatedAt: new Date().toISOString(),
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  guardrails: {
    searchExecutedNowCount: 0,
    routeDiscoverySearchExecutedNowCount: 0,
    fetchExecutedNowCount: taskResults.length,
    controlledStrictOfficialHostFetchExecutedNowCount: taskResults.length,
    browserRenderExecutedNowCount: 0,
    reviewOnlyCandidateWriteExecutedNowCount: 0,
    canonicalCandidateWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    selectedPriorityTargetCount: targets.length,
    attemptedStrictOfficialHostFetchCount: taskResults.length,
    confederationCounts,
    strictOfficialFinalLaneCounts,
    proofShapeNonzeroCandidateSlugs: rows.filter(row => row.strictOfficialFinalLane === "strict_official_proof_shape_nonzero_candidate_after_review").map(row => row.slug),
    zeroPlayedStartDateLaneSlugs: rows.filter(row => row.strictOfficialFinalLane === "strict_official_zero_played_start_date_lane").map(row => row.slug),
    extractionReviewRequiredSlugs: rows.filter(row => row.strictOfficialFinalLane === "strict_official_extraction_review_required").map(row => row.slug),
    surfaceNoTableSlugs: rows.filter(row => row.strictOfficialFinalLane === "strict_official_surface_no_table").map(row => row.slug),
    hostFailedSlugs: rows.filter(row => row.strictOfficialFinalLane === "strict_official_host_failed").map(row => row.slug),
    acceptedNowCount: 0,
    nextRecommendedLane: "bulk season/league review for proofShapeNonzeroCandidateSlugs; start-date lane for zero-played; parser family work for extractionReviewRequired"
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
  firstProofRows: rows.filter(row => row.strictOfficialFinalLane === "strict_official_proof_shape_nonzero_candidate_after_review").slice(0, 20).map(row => ({
    slug: row.slug,
    displayName: row.displayName,
    selectedUrl: row.selectedUrl,
    selectedTitle: row.selectedTitle,
    extractedStandingRowCount: row.extractedStandingRowCount,
    arithmeticPassedRowCount: row.arithmeticPassedRowCount,
    minPlayed: row.minPlayed,
    maxPlayed: row.maxPlayed
  })),
  blocks: report.blocks
}, null, 2));

if (blocks.length) process.exitCode = 1;
