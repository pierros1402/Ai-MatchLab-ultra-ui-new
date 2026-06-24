import fs from "node:fs";
import path from "node:path";

const outPath = "data/football-truth/_diagnostics/existing-reusable-adapter-bulk-execution-inventory-2026-06-17/existing-reusable-adapter-bulk-execution-inventory-2026-06-17.json";

function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function clean(s){ return String(s ?? "").replace(/\s+/g," ").trim(); }
function listFiles(dir,out=[]){
  if(!fs.existsSync(dir)) return out;
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const p = path.join(dir,e.name);
    if(e.isDirectory()) listFiles(p,out);
    else out.push(p);
  }
  return out;
}

const familyDefs = [
  {family:"laliga", slugs:["esp.1","esp.2"], terms:[/laliga/i,/esp\.1|esp\.2/i,/liga/i], knownStrong:true},
  {family:"bundesliga", slugs:["ger.1","ger.2"], terms:[/bundesliga/i,/ger\.1|ger\.2/i], knownStrong:true},
  {family:"norway_ntf", slugs:["nor.1","nor.2"], terms:[/norway|ntf|eliteserien|obos/i,/nor\.1|nor\.2/i], knownStrong:true},
  {family:"sportomedia_sef", slugs:["swe.1","swe.2"], terms:[/sportomedia|sef-leagues|allsvenskan|superettan/i,/swe\.1|swe\.2/i], knownStrong:true},
  {family:"torneopal", slugs:["fin.1","fin.2","por.taca.portugal"], terms:[/torneopal|palloliitto/i,/fin\.1|fin\.2|por\.taca\.portugal/i], knownStrong:false},
  {family:"ksi", slugs:["isl.1"], terms:[/ksi\.is|knattspyrnusamband|besta deild/i,/isl\.1/i], knownStrong:false},
  {family:"loi_ajax", slugs:["irl.1","irl.2"], terms:[/league of ireland|loi|sse airtricity|irl\.1|irl\.2/i], knownStrong:false},
  {family:"spfl_opta", slugs:["sco.1","sco.2"], terms:[/spfl|opta|statsperform|sco\.1|sco\.2/i], knownStrong:false},
  {family:"cfa_cyprus_html", slugs:["cyp.1"], terms:[/cfa\.com\.cy|cypriot first division|cyp\.1/i], knownStrong:false}
];

const sourceFiles = [
  ...listFiles("engine-v1").filter(f=>/\.(js|mjs|cjs|ts|json)$/i.test(f)),
  ...listFiles("data/football-truth").filter(f=>/\.(json)$/i.test(f))
];

const rows = [];
for(const fam of familyDefs){
  const matchingFiles = [];
  for(const file of sourceFiles){
    let text = "";
    try { text = fs.readFileSync(file,"utf8"); } catch { continue; }
    const hits = fam.terms.filter(re=>re.test(text)).length;
    if(hits){
      const lower = text.toLowerCase();
      matchingFiles.push({
        file,
        hitCount:hits,
        hasAllowFetch:/allow-fetch|allowFetch|sourceFetch/i.test(text),
        hasAllowSearch:/allow-search|allowSearch/i.test(text),
        hasCanonicalWrite:/canonicalWrite|canonical.*write|writeCanonical/i.test(text),
        hasDryExtract:/dry extract|dryExtract|extract/i.test(text),
        hasReconcile:/reconcile|pointsFormula|playedEquals|arithmetic/i.test(text),
        hasRunner:/process\.argv|spawnSync|node |commander|yargs/i.test(text),
        mentionsSlugs:fam.slugs.filter(s=>lower.includes(s.toLowerCase()))
      });
    }
  }
  const jobFiles = matchingFiles.filter(r=>r.file.includes(`${path.sep}jobs${path.sep}`) || r.file.includes("/jobs/"));
  const extractorFiles = matchingFiles.filter(r=>r.hasDryExtract || r.hasReconcile);
  const runnableFiles = matchingFiles.filter(r=>r.hasRunner && r.file.includes(`${path.sep}jobs${path.sep}`));
  const canonicalRiskFiles = matchingFiles.filter(r=>r.hasCanonicalWrite);
  let executionReadiness = "not_executable_without_contract_repair";
  if(fam.knownStrong) executionReadiness = "already_strong_candidate_family_needs_bulk_refresh_runner";
  else if(runnableFiles.length && extractorFiles.length) executionReadiness = "existing_runnable_family_needs_safety_wrapped_bulk_execution";
  else if(matchingFiles.length >= 3) executionReadiness = "contract_present_but_runner_unclear";
  rows.push({
    family:fam.family,
    slugs:fam.slugs,
    slugCount:fam.slugs.length,
    knownStrong:fam.knownStrong,
    matchingFileCount:matchingFiles.length,
    jobFileCount:jobFiles.length,
    runnableFileCount:runnableFiles.length,
    extractorFileCount:extractorFiles.length,
    canonicalRiskFileCount:canonicalRiskFiles.length,
    executionReadiness,
    sampleJobFiles:jobFiles.slice(0,12),
    sampleRunnableFiles:runnableFiles.slice(0,12),
    sampleExtractorFiles:extractorFiles.slice(0,12),
    sampleMatchingFiles:matchingFiles.slice(0,20)
  });
}

const executableNowRows = rows.filter(r => r.executionReadiness === "existing_runnable_family_needs_safety_wrapped_bulk_execution" || r.executionReadiness === "already_strong_candidate_family_needs_bulk_refresh_runner");
const repairRows = rows.filter(r => !executableNowRows.includes(r));

const summary = {
  status:"passed",
  scannedFileCount:sourceFiles.length,
  familyCount:rows.length,
  executableOrRefreshableFamilyCount:executableNowRows.length,
  executableOrRefreshableSlugCount:[...new Set(executableNowRows.flatMap(r=>r.slugs))].length,
  repairFamilyCount:repairRows.length,
  recommendedNextLane:"build_safety_wrapped_bulk_execution_runner_for_existing_reusable_families",
  recommendedFamilyOrder:executableNowRows.map(r=>r.family),
  searchExecutedNowCount:0,
  fetchExecutedNowCount:0,
  canonicalWriteExecutedNowCount:0,
  productionWriteExecutedNowCount:0,
  truthAssertionExecutedNowCount:0
};

writeJson(outPath,{
  generatedAtUtc:new Date().toISOString(),
  status:"passed",
  summary,
  executableNowRows,
  repairRows,
  familyRows:rows,
  rules:[
    "No more single-league probes.",
    "Only existing reusable adapter/contract families can enter the next execution runner.",
    "The next runner must be safety-wrapped: no canonical/truth writes, no broad search, fetch only if family runner explicitly supports it.",
    "Batch-yield is the metric: competitions producing current extractable/reconciled standings."
  ],
  policy:{
    localInventoryOnly:true,
    noSearch:true,
    noFetch:true,
    noCanonicalCandidateWrite:true,
    noProductionTruth:true
  }
});
console.log(JSON.stringify(summary,null,2));
