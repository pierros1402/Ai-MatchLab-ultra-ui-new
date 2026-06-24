import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `bulk-volume-league-expansion-clean-plan-${today}`);
const outPath = path.join(outDir, `bulk-volume-league-expansion-clean-plan-${today}.json`);
const rowsPath = path.join(outDir, `bulk-volume-league-expansion-clean-plan-rows-${today}.jsonl`);

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function shaText(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

async function listFiles(dir, exts, limit = 15000) {
  const out = [];
  async function walk(current) {
    if (out.length >= limit) return;
    let entries = [];
    try { entries = await fs.readdir(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (["node_modules", ".git", "dist", "build", ".next"].includes(entry.name)) continue;
        await walk(full);
      } else if (exts.includes(path.extname(entry.name).toLowerCase())) {
        out.push(full);
      }
    }
  }
  await walk(dir);
  return out;
}

async function readText(file) {
  try { return await fs.readFile(file, "utf8"); } catch { return ""; }
}

const alreadyCoveredOrCandidate = new Set([
  "esp.1","esp.2","ger.1","ger.2","ger.3","cro.1","sco.1","sco.2","ned.1","den.1","jpn.1","eng.1",
  "cyp.1","fin.1","fin.2","isl.1","isl.2","nor.1","swe.1","swe.2","geo.1"
]);

const blocked = new Set(["ita.1","nor.2","cyp.2"]);

const prioritySeeds = [
  ["eng.2","England Championship","A"],["eng.3","England League One","A"],["eng.4","England League Two","A"],
  ["fra.1","France Ligue 1","A"],["fra.2","France Ligue 2","A"],["ita.2","Italy Serie B","A"],
  ["por.1","Portugal Primeira Liga","A"],["por.2","Portugal Liga 2","A"],["bel.1","Belgium First Division A","A"],["bel.2","Belgium Challenger Pro League","A"],
  ["aut.1","Austria Bundesliga","A"],["aut.2","Austria 2. Liga","A"],["sui.1","Switzerland Super League","A"],["sui.2","Switzerland Challenge League","A"],
  ["pol.1","Poland Ekstraklasa","A"],["pol.2","Poland I Liga","A"],["cze.1","Czech First League","A"],["cze.2","Czech Second League","A"],
  ["tur.1","Turkey Super Lig","A"],["tur.2","Turkey 1. Lig","A"],["gre.1","Greece Super League","A"],["gre.2","Greece Super League 2","A"],
  ["den.2","Denmark 1st Division","A"],["usa.1","United States MLS","A"],["usa.2","United States USL Championship","A"],
  ["mex.1","Mexico Liga MX","A"],["mex.2","Mexico Expansion/Ascenso","A"],["bra.1","Brazil Serie A","A"],["bra.2","Brazil Serie B","A"],
  ["arg.1","Argentina Primera Division","A"],["arg.2","Argentina Primera Nacional","A"],["ksa.1","Saudi Pro League","A"],
  ["kor.1","Korea K League 1","A"],["kor.2","Korea K League 2","A"],["aus.1","Australia A-League Men","A"],["aus.2","Australia National Second Tier","A"],
  ["chn.1","China Super League","A"],["chn.2","China League One","A"],["jpn.2","Japan J2 League","A"],["rou.1","Romania Liga I","A"],

  ["rou.2","Romania Liga II","B"],["hun.1","Hungary NB I","B"],["hun.2","Hungary NB II","B"],["srb.1","Serbia SuperLiga","B"],["srb.2","Serbia First League","B"],
  ["svn.1","Slovenia PrvaLiga","B"],["svn.2","Slovenia 2. SNL","B"],["svk.1","Slovakia Fortuna Liga","B"],["svk.2","Slovakia 2. Liga","B"],
  ["bul.1","Bulgaria First League","B"],["bul.2","Bulgaria Second League","B"],["ukr.1","Ukraine Premier League","B"],["ukr.2","Ukraine First League","B"],
  ["rus.1","Russia Premier League","B"],["rus.2","Russia First League","B"],["alb.1","Albania Superliga","B"],["alb.2","Albania First Division","B"],
  ["arm.1","Armenia Premier League","B"],["arm.2","Armenia First League","B"],["aze.1","Azerbaijan Premier League","B"],["aze.2","Azerbaijan First Division","B"],
  ["bih.1","Bosnia Premier League","B"],["bih.2","Bosnia First League","B"],["blr.1","Belarus Premier League","B"],["blr.2","Belarus First League","B"],
  ["est.1","Estonia Meistriliiga","B"],["est.2","Estonia Esiliiga","B"],["lva.1","Latvia Virsliga","B"],["lva.2","Latvia First League","B"],
  ["ltu.1","Lithuania A Lyga","B"],["ltu.2","Lithuania I Lyga","B"],["mda.1","Moldova Super Liga","B"],["mda.2","Moldova Liga 1","B"],
  ["mkd.1","North Macedonia First League","B"],["mkd.2","North Macedonia Second League","B"],["mne.1","Montenegro First League","B"],["mne.2","Montenegro Second League","B"],
  ["irl.1","Ireland Premier Division","B"],["irl.2","Ireland First Division","B"],["wal.1","Wales Cymru Premier","B"],["wal.2","Wales Cymru North/South","B"],
  ["nzl.1","New Zealand National League","B"],["nzl.2","New Zealand second tier","B"],

  ["col.1","Colombia Primera A","C"],["col.2","Colombia Primera B","C"],["chi.1","Chile Primera Division","C"],["chi.2","Chile Primera B","C"],
  ["ecu.1","Ecuador Serie A","C"],["ecu.2","Ecuador Serie B","C"],["per.1","Peru Liga 1","C"],["per.2","Peru Liga 2","C"],
  ["uru.1","Uruguay Primera Division","C"],["uru.2","Uruguay Segunda Division","C"],["par.1","Paraguay Primera Division","C"],["par.2","Paraguay Segunda Division","C"],
  ["bol.1","Bolivia Primera Division","C"],["bol.2","Bolivia second division","C"],["ven.1","Venezuela Primera Division","C"],["ven.2","Venezuela Segunda Division","C"],
  ["crc.1","Costa Rica Primera Division","C"],["crc.2","Costa Rica Liga de Ascenso","C"],["pan.1","Panama LPF","C"],["pan.2","Panama second tier","C"],
  ["hon.1","Honduras Liga Nacional","C"],["hon.2","Honduras second tier","C"],["slv.1","El Salvador Primera Division","C"],["slv.2","El Salvador second tier","C"],
  ["gua.1","Guatemala Liga Nacional","C"],["gua.2","Guatemala Primera Division","C"],["can.1","Canada Premier League","C"],["can.2","Canada second tier","C"],

  ["ind.1","India Super League","D"],["ind.2","India I-League","D"],["idn.1","Indonesia Liga 1","D"],["idn.2","Indonesia Liga 2","D"],
  ["tha.1","Thailand League 1","D"],["tha.2","Thailand League 2","D"],["vie.1","Vietnam V.League 1","D"],["vie.2","Vietnam V.League 2","D"],
  ["mys.1","Malaysia Super League","D"],["mys.2","Malaysia second tier","D"],["irn.1","Iran Pro League","D"],["irn.2","Iran Azadegan League","D"],
  ["irq.1","Iraq Stars League","D"],["irq.2","Iraq second tier","D"],["uae.1","UAE Pro League","D"],["uae.2","UAE First Division","D"],
  ["qat.1","Qatar Stars League","D"],["qat.2","Qatar Second Division","D"],["bhr.1","Bahrain Premier League","D"],["bhr.2","Bahrain Second Division","D"],
  ["kwt.1","Kuwait Premier League","D"],["kwt.2","Kuwait Division One","D"],["oma.1","Oman Professional League","D"],["oma.2","Oman First Division","D"],
  ["jor.1","Jordan Pro League","D"],["jor.2","Jordan First Division","D"],["isr.1","Israel Premier League","D"],["isr.2","Israel Liga Leumit","D"],
  ["kaz.1","Kazakhstan Premier League","D"],["kaz.2","Kazakhstan First Division","D"],["uzb.1","Uzbekistan Super League","D"],["uzb.2","Uzbekistan Pro League","D"],

  ["egy.1","Egypt Premier League","E"],["egy.2","Egypt Second Division","E"],["mar.1","Morocco Botola Pro","E"],["mar.2","Morocco Botola 2","E"],
  ["tun.1","Tunisia Ligue Professionnelle 1","E"],["tun.2","Tunisia Ligue Professionnelle 2","E"],["alg.1","Algeria Ligue 1","E"],["alg.2","Algeria Ligue 2","E"],
  ["rsa.1","South Africa Premiership","E"],["rsa.2","South Africa Championship","E"],["nga.1","Nigeria Premier League","E"],["nga.2","Nigeria second tier","E"],
  ["gha.1","Ghana Premier League","E"],["gha.2","Ghana Division One","E"],["cmr.1","Cameroon Elite One","E"],["cmr.2","Cameroon Elite Two","E"],
  ["civ.1","Ivory Coast Ligue 1","E"],["civ.2","Ivory Coast second tier","E"],["sen.1","Senegal Ligue 1","E"],["sen.2","Senegal Ligue 2","E"],
  ["ken.1","Kenya Premier League","E"],["ken.2","Kenya second tier","E"],["tan.1","Tanzania Premier League","E"],["tan.2","Tanzania Championship","E"]
];

const scanFiles = [
  ...(await listFiles(path.join(root, "engine-v1", "config"), [".json", ".js"], 4000)),
  ...(await listFiles(path.join(root, "engine-v1", "jobs"), [".js"], 8000)),
  ...(await listFiles(path.join(root, "data", "football-truth", "_diagnostics"), [".json", ".jsonl"], 12000))
];

const seen = new Map();
for (const f of scanFiles) {
  const text = await readText(f);
  for (const [slug] of prioritySeeds) {
    if (!seen.has(slug) && text.includes(slug)) seen.set(slug, rel(f));
  }
}

const priorityWeight = { A: 500, B: 400, C: 320, D: 260, E: 220 };

const rows = prioritySeeds
  .map(([slug, name, band], index) => ({
    slug,
    displayName: name,
    priorityBand: band,
    rank: index + 1,
    score: priorityWeight[band] - index / 1000,
    seenInRepo: seen.has(slug),
    sampleEvidenceFile: seen.get(slug) || null,
    alreadyCoveredOrCandidate: alreadyCoveredOrCandidate.has(slug),
    blocked: blocked.has(slug),
    proposedProofLane: "controlled_official_route_discovery_or_existing_route_reuse",
    requiredEvidenceLanes: [
      "previous_completed_standings",
      "current_active_standings_when_active",
      "current_active_or_next_fixture_window",
      "next_start_or_restart_date_for_fixture_poll_suppression"
    ],
    fetchAllowedByThisPlan: false,
    productionWriteAllowedByThisPlan: false,
    truthAssertionAllowedByThisPlan: false
  }))
  .filter(row => !row.alreadyCoveredOrCandidate && !row.blocked)
  .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug))
  .slice(0, 160);

const batches = [];
for (let i = 0; i < rows.length; i += 40) {
  const slice = rows.slice(i, i + 40);
  batches.push({
    batchIndex: batches.length + 1,
    targetCount: slice.length,
    slugs: slice.map(row => row.slug),
    priorityBandMix: slice.reduce((acc, row) => {
      acc[row.priorityBand] = (acc[row.priorityBand] || 0) + 1;
      return acc;
    }, {}),
    proposedProofLane: "controlled_official_route_discovery_or_existing_route_reuse"
  });
}

await fs.mkdir(outDir, { recursive: true });

const report = {
  status: rows.length >= 120 && batches.length >= 3 ? "passed" : "needs_more_targets",
  runner: "bulk_volume_league_expansion_clean_plan",
  contractVersion: 2,
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    providerFetchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  inventory: {
    scannedFileCount: scanFiles.length,
    prioritySeedCount: prioritySeeds.length,
    selectedBulkTargetCount: rows.length,
    selectedBatchCount: batches.length,
    seenInRepoCount: rows.filter(row => row.seenInRepo).length,
    notSeenButPlannedCount: rows.filter(row => !row.seenInRepo).length,
    alreadyCoveredOrCandidateSuppressedCount: prioritySeeds.filter(([slug]) => alreadyCoveredOrCandidate.has(slug)).length,
    blockedSuppressedCount: prioritySeeds.filter(([slug]) => blocked.has(slug)).length,
    planSha256: shaText(JSON.stringify({ rows, batches }))
  },
  policy: {
    reasonForReplacingPreviousPlan: "previous plan was co-occurrence polluted by historical diagnostics and falsely attached all source families to many unrelated slugs",
    targetMode: "high_volume_curated_medium_high_value",
    targetCountGoal: 160,
    batchSize: 40,
    suppressTinyPlaceholderLeagues: true,
    noFamilyClaimWithoutPerSlugRouteEvidence: true,
    noFetchInThisPlan: true,
    noProductionWriteInThisPlan: true,
    noTruthAssertionInThisPlan: true
  },
  nextRecommendedLane: {
    name: "bulk_controlled_official_route_discovery_wave",
    batchToRunFirst: 1,
    firstBatchTargetCount: batches[0]?.targetCount || 0,
    currentPlanDoesNotAuthorizeFetch: true,
    nextRunnerShouldRequireAllowFetch: true,
    nextRunnerShouldEmitOnlyDiagnostics: true
  },
  batches,
  rows
};

await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  inventory: report.inventory,
  policy: report.policy,
  nextRecommendedLane: report.nextRecommendedLane,
  batches: report.batches,
  firstBatch: report.rows.slice(0, 40)
}, null, 2));

if (report.status !== "passed") process.exitCode = 1;
