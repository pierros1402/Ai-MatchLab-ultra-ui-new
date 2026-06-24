import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const inputPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-reconciled-classification-ledger-${today}`, `football-truth-global-reconciled-classification-ledger-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-reconciled-classification-ledger-${today}`, `football-truth-global-reconciled-classification-ledger-rows-${today}.jsonl`);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-macro-official-host-wave-plan-${today}`);
const outPath = path.join(outDir, `football-truth-global-macro-official-host-wave-plan-${today}.json`);
const outRowsPath = path.join(outDir, `football-truth-global-macro-official-host-wave-plan-rows-${today}.jsonl`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
function parseJsonl(text) { return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }
function country(slug) { return String(slug || "").split(".")[0]; }
function level(slug) { return Number.parseInt(String(slug || "").split(".")[1] || "99", 10); }
function uniq(values) { return [...new Set((values || []).filter(Boolean))]; }

const hosts = {
  arg:["afa.com.ar"], aus:["aleagues.com.au","footballaustralia.com.au"], aut:["bundesliga.at","2liga.at"], bel:["proleague.be","rbfa.be"],
  bra:["cbf.com.br"], cyp:["cfa.com.cy"], cze:["chanceliga.cz","fnliga.cz","fotbal.cz"], fin:["palloliitto.fi","veikkausliiga.com","ykkosliiga.fi"],
  fra:["ligue1.fr","ligue2.fr","lfp.fr","fff.fr"], gre:["slgr.gr","epo.gr"], kor:["kleague.com","kfa.or.kr"], mex:["ligamx.net"],
  nor:["eliteserien.no","fotball.no","ntf.no"], pol:["ekstraklasa.org","1liga.org","pzpn.pl"], por:["ligaportugal.pt","fpf.pt"],
  sui:["sfl.ch","football.ch"], tur:["tff.org"], ukr:["upl.ua","uaf.ua"], usa:["mlssoccer.com","uslsoccer.com","ussoccer.com"],
  wal:["faw.cymru"], bul:["fpleague.bg","bfunion.bg"], hun:["mlsz.hu"], svn:["nzs.si"], chn:["thecfa.cn"], svk:["nike-liga.sk","futbalsfz.sk"],
  rou:["lpf.ro","frf.ro"], mys:["malaysianfootballleague.com","mfl.my","fam.org.my"], tha:["thaileague.co.th"], cro:["hnl.com.hr","hns.family","semafor.hns.family"],
  den:["superliga.dk","divisionsforeningen.dk","dbu.dk"], eng:["efl.com","premierleague.com"], ita:["legab.it","legaseriea.it","figc.it"],
  ned:["keukenkampioendivisie.nl","eredivisie.nl","knvb.nl"], ksa:["saff.com.sa","spl.com.sa"], per:["liga1.pe","liga2.pe","fpf.org.pe"],
  srb:["superliga.rs","prvaliga.rs","fss.rs"], ind:["the-aiff.com","indiansuperleague.com"], alb:["fshf.org"], arm:["ffa.am"], aze:["pfl.az","affa.az"],
  bih:["nfsbih.ba"], blr:["abff.by"], geo:["erovnuliliga.ge","gff.ge"], irl:["leagueofireland.ie","fai.ie"], alg:["lnfp.dz","faf.dz"],
  est:["jalgpall.ee"], lva:["lff.lv"], mda:["fmf.md"], mkd:["ffm.mk"], mne:["fscg.me"], qat:["qsl.qa","qfa.qa"], ltu:["lff.lt"],
  egy:["efa.com.eg"], gha:["ghanafa.org"], col:["dimayor.com.co","fcf.com.co"], chi:["campeonatochileno.cl","anfp.cl"], ecu:["ligapro.ec","fef.ec"],
  uru:["auf.org.uy"], par:["apf.org.py"], bol:["fbf.com.bo"], ven:["ligafutve.org","federacionvenezolanadefutbol.org"], crc:["unafut.com"],
  pan:["fepafut.com","lpf.com.pa"], gua:["fedefutguate.gt"], can:["canpl.ca","cplsoccer.com"], nzl:["nzfootball.co.nz"], idn:["ligaindonesiabaru.com"],
  vie:["vpf.vn"], hon:["fenafuth.org.hn"], slv:["fesfut.org.sv"]
};

const paths = [
  "/", "/standings", "/table", "/tables", "/league-table", "/competition/standings", "/competitions/standings",
  "/fixtures", "/schedule", "/results", "/matches", "/en/standings", "/en/table", "/en/fixtures",
  "/de/tabelle", "/de/spielplan", "/fr/classement", "/fr/calendrier", "/es/clasificacion", "/es/calendario"
];

function buildUrls(slug) {
  const c = country(slug);
  const hs = hosts[c] || [];
  const urls = [];
  for (const host of hs.slice(0, 2)) {
    for (const p of paths.slice(0, 10)) urls.push(`https://${host}${p}`);
  }
  return uniq(urls).slice(0, 16);
}

const input = JSON.parse(await fs.readFile(inputPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));

const blocks = [];
if (input.status !== "passed") blocks.push("input_not_passed");

const targets = rows
  .filter(row => row.reconciledClassificationLane === "no_current_factory_evidence")
  .map(row => {
    const urls = buildUrls(row.slug);
    return {
      slug: row.slug,
      displayName: row.displayName,
      country: country(row.slug),
      level: level(row.slug),
      officialHostCount: hosts[country(row.slug)]?.length || 0,
      plannedUrlCount: urls.length,
      plannedUrls: urls,
      macroLane: urls.length ? "macro_official_host_probe_ready" : "macro_missing_official_host_allowlist",
      sourceLocalEvidenceReuseAllowed: false,
      acceptedNow: false,
      canonicalWriteExecutedNow: false,
      lifecycleWriteExecutedNow: false,
      productionWriteExecutedNow: false,
      truthAssertionExecutedNow: false
    };
  });

const batchSize = 100;
const batches = [];
for (let i = 0; i < targets.length; i += batchSize) {
  const batchTargets = targets.slice(i, i + batchSize);
  batches.push({
    batchId: `global-macro-official-host-wave-${String(batches.length + 1).padStart(3, "0")}`,
    targetCount: batchTargets.length,
    plannedUrlCount: batchTargets.reduce((sum, row) => sum + row.plannedUrlCount, 0),
    slugs: batchTargets.map(row => row.slug)
  });
}

const laneCounts = targets.reduce((acc, row) => {
  acc[row.macroLane] = (acc[row.macroLane] || 0) + 1;
  return acc;
}, {});

const report = {
  status: blocks.length ? "failed" : "passed",
  runner: "football_truth_global_macro_official_host_wave_plan",
  contractVersion: 1,
  generatedAt: new Date().toISOString(),
  output: rel(outPath),
  rowsOutput: rel(outRowsPath),
  inputPath: rel(inputPath),
  inputRowsPath: rel(rowsPath),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    localEvidenceReuseAllowed: false,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    inputNoCurrentUnprocessedCount: input.summary?.noCurrentUnprocessedCount,
    plannedTargetCount: targets.length,
    plannedBatchCount: batches.length,
    batchSize,
    plannedUrlCount: targets.reduce((sum, row) => sum + row.plannedUrlCount, 0),
    macroLaneCounts: laneCounts,
    firstBatchId: batches[0]?.batchId || null,
    firstBatchTargetCount: batches[0]?.targetCount || 0,
    firstBatchPlannedUrlCount: batches[0]?.plannedUrlCount || 0
  },
  executionPolicy: {
    nextRunnerMode: "single_macro_batch_fetch_then_internal_extract_salvage_classify",
    doNotReuseContaminatedLocalEvidence: true,
    noMicroGateBetweenFetchAndClassification: true,
    writeOnlyReviewBoardAfterBatch: true,
    productionWriteRequiresSeparateApproval: true
  },
  batches,
  rows: targets,
  blocks
};

await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(outRowsPath, targets.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  summary: report.summary,
  executionPolicy: report.executionPolicy,
  blocks: report.blocks
}, null, 2));

if (blocks.length) process.exitCode = 1;
