import fs from "node:fs";
import path from "node:path";

const outPath = "data/football-truth/_diagnostics/bulk-provider-contract-breakthrough-board-2026-06-17/bulk-provider-contract-breakthrough-board-2026-06-17.json";

function readJsonMaybe(p){ try { return JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"")); } catch { return null; } }
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
function walk(x, cb, depth=0){
  if(!x || depth > 10) return;
  if(Array.isArray(x)){ for(const v of x) walk(v,cb,depth+1); return; }
  if(typeof x === "object"){
    cb(x);
    for(const v of Object.values(x).slice(0,220)){
      if(v && typeof v === "object") walk(v,cb,depth+1);
    }
  }
}
function slugOf(o){ return clean(o.competitionSlug || o.normalizedCompetitionSlug || o.slug || o.competitionId || o.id); }
function nameOf(o){ return clean(o.competitionName || o.name || o.leagueName || o.displayName || o.title || o.competition || o.league); }
function isLeagueSlug(s){ return /^[a-z]{2,3}\.\d+$/.test(s) && !/\.cup$/.test(s); }

const covered = new Set(["ger.1","ger.2","esp.1","esp.2","nor.1","nor.2","aut.1","aut.2","fin.1","swe.1","swe.2"]);
const parkedLowValue = new Set(["afg.1","afg.2","pak.1","pak.2","wal.2"]);
const importantPrefixes = new Set([
  "eng","ita","fra","por","bel","sui","den","irl","bra","arg","usa","mex","jpn","ned","kor","chn","aus","ksa","chi","col","per","uru",
  "gre","cro","bul","cyp","alb","aze","svn","isl","ind","tha","uzb","alg","tur","sco","rus","srb","svk","qat","mys","mlt","mne","mkd","mda","lux","kos","kaz","rsa"
]);

const providerPatterns = [
  {family:"opta_statsperform", re:/opta|statsperform|performgroup|match-centre|matchcentre|srml|opta-widget|opta\.js/i, priority:95},
  {family:"sportradar", re:/sportradar|widgets\.sportradar|api\.sportradar|betradar|srlive/i, priority:95},
  {family:"sportmonks", re:/sportmonks/i, priority:90},
  {family:"sportomedia", re:/sportomedia|smg|footballwebpages/i, priority:85},
  {family:"torneopal", re:/torneopal/i, priority:85},
  {family:"fulltime_fa", re:/full-time|fulltime|thefa\.com\/full-time/i, priority:80},
  {family:"league_republic", re:/leaguerepublic/i, priority:70},
  {family:"wordpress_tablepress_or_rest", re:/wp-json|tablepress|admin-ajax|wp-content|wp-includes/i, priority:65},
  {family:"drupal_json_or_ajax", re:/drupal|views\/ajax|jsonapi|ajax/i, priority:60},
  {family:"bespoke_official_html_table", re:/standings|league table|table|classification|classifica|classement|tabla|points|played/i, priority:50}
];

const sourceFiles = listFiles("data/football-truth").filter(f => /\.(json|html|js|txt)$/i.test(f));
let scannedFileCount = 0;
const slugEvidence = new Map();
const familyEvidence = new Map();

function addEvidence(slug, ev){
  if(!isLeagueSlug(slug)) return;
  const p = slug.split(".")[0];
  if(!importantPrefixes.has(p) || parkedLowValue.has(slug)) return;
  const row = slugEvidence.get(slug) || {competitionSlug:slug, names:new Set(), families:new Map(), files:new Set(), evidenceCount:0};
  if(ev.name) row.names.add(ev.name);
  row.files.add(ev.file);
  row.evidenceCount++;
  for(const fam of ev.families){
    const f = row.families.get(fam.family) || {family:fam.family, priority:fam.priority, hitCount:0, files:new Set(), snippets:[]};
    f.hitCount++;
    f.files.add(ev.file);
    if(ev.snippet) f.snippets.push(ev.snippet.slice(0,300));
    row.families.set(fam.family,f);
  }
  slugEvidence.set(slug,row);
}

for(const f of sourceFiles.slice(0,14000)){
  let text = "";
  try { text = fs.readFileSync(f,"utf8"); } catch { continue; }
  if(!text) continue;
  scannedFileCount++;
  const lower = text.toLowerCase();
  const families = providerPatterns.filter(p => p.re.test(text));
  if(!families.length) continue;

  if(f.endsWith(".json")){
    const j = readJsonMaybe(f);
    if(j){
      walk(j,o=>{
        const slug = slugOf(o);
        if(!isLeagueSlug(slug)) return;
        const snippet = JSON.stringify(o).slice(0,500);
        addEvidence(slug,{name:nameOf(o), file:f, families, snippet});
      });
    }
  }

  const slugMatches = [...text.matchAll(/\b([a-z]{2,3}\.[12])\b/g)].map(m=>m[1]);
  for(const slug of slugMatches.slice(0,200)){
    const idx = lower.indexOf(slug.toLowerCase());
    const snippet = idx >= 0 ? text.slice(Math.max(0,idx-180), idx+320) : "";
    addEvidence(slug,{name:"", file:f, families, snippet});
  }
}

for(const row of slugEvidence.values()){
  for(const fam of row.families.values()){
    const frow = familyEvidence.get(fam.family) || {family:fam.family, priority:fam.priority, competitionSlugs:new Set(), hitCount:0, files:new Set(), sampleEvidence:[]};
    frow.competitionSlugs.add(row.competitionSlug);
    frow.hitCount += fam.hitCount;
    for(const file of fam.files) frow.files.add(file);
    for(const s of fam.snippets.slice(0,3)) frow.sampleEvidence.push({competitionSlug:row.competitionSlug, snippet:s});
    familyEvidence.set(fam.family,frow);
  }
}

const familyRows = [...familyEvidence.values()].map(f=>({
  family:f.family,
  priority:f.priority,
  competitionCount:f.competitionSlugs.size,
  competitionSlugs:[...f.competitionSlugs].sort(),
  hitCount:f.hitCount,
  fileCount:f.files.size,
  sampleFiles:[...f.files].slice(0,12),
  sampleEvidence:f.sampleEvidence.slice(0,12),
  batchScore:f.priority * 100 + f.competitionSlugs.size * 30 + Math.min(f.hitCount,200)
})).sort((a,b)=>b.batchScore-a.batchScore);

const competitionRows = [...slugEvidence.values()].map(r=>{
  const fams=[...r.families.values()].map(f=>({
    family:f.family,
    priority:f.priority,
    hitCount:f.hitCount,
    sampleFiles:[...f.files].slice(0,6),
    sampleSnippets:f.snippets.slice(0,4)
  })).sort((a,b)=>b.priority-a.priority || b.hitCount-a.hitCount);
  return {
    competitionSlug:r.competitionSlug,
    competitionName:[...r.names].sort((a,b)=>b.length-a.length)[0] || r.competitionSlug,
    familyCount:fams.length,
    families:fams,
    topFamily:fams[0]?.family || null,
    topFamilyPriority:fams[0]?.priority || 0,
    evidenceCount:r.evidenceCount,
    fileCount:r.files.size,
    sampleFiles:[...r.files].slice(0,8),
    batchScore:(fams[0]?.priority || 0) * 100 + fams.length * 20 + Math.min(r.evidenceCount,100)
  };
}).sort((a,b)=>b.batchScore-a.batchScore || a.competitionSlug.localeCompare(b.competitionSlug));

const executableFamilyRows = familyRows.filter(f => f.competitionCount >= 2 && f.priority >= 65);
const recommendedFamily = executableFamilyRows[0] || null;

const summary = {
  status:"passed",
  scannedFileCount,
  importantPrefixCount:importantPrefixes.size,
  providerFamilyCount:familyRows.length,
  executableProviderFamilyCount:executableFamilyRows.length,
  providerEvidenceCompetitionCount:competitionRows.length,
  recommendedNextLane:recommendedFamily ? "build_executable_bulk_provider_family_probe_plan" : "manual_high_value_provider_contract_mapping_required",
  recommendedProviderFamily:recommendedFamily?.family || null,
  recommendedProviderFamilyCompetitionCount:recommendedFamily?.competitionCount || 0,
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
  familyRows,
  executableFamilyRows,
  competitionRows,
  hardResetBulkRules:[
    "No more one-league probes unless they unlock a reusable provider family.",
    "Progress is measured by batch yield: current-season extractable standings rows per provider family.",
    "Generic web search is parked as noisy unless scoped to a known official/provider contract.",
    "High-value leagues first; low-value/unreliable markets remain parked."
  ],
  policy:{
    localBoardOnly:true,
    noSearch:true,
    noFetch:true,
    noCanonicalCandidateWrite:true,
    noProductionTruth:true,
    scaleRequirement:"provider-family-or-bulk-contract-only"
  }
});
console.log(JSON.stringify(summary,null,2));
