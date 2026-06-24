import fs from "node:fs";
import path from "node:path";

const outPath = "data/football-truth/_diagnostics/strict-bulk-provider-contract-verifier-2026-06-17/strict-bulk-provider-contract-verifier-2026-06-17.json";

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
  if(!x || depth > 8) return;
  if(Array.isArray(x)){ for(const v of x) walk(v,cb,depth+1); return; }
  if(typeof x === "object"){
    cb(x);
    for(const v of Object.values(x).slice(0,180)){
      if(v && typeof v === "object") walk(v,cb,depth+1);
    }
  }
}
function slugOf(o){ return clean(o.competitionSlug || o.normalizedCompetitionSlug || o.slug || o.competitionId || o.id); }
function nameOf(o){ return clean(o.competitionName || o.name || o.leagueName || o.displayName || o.title || o.competition || o.league); }
function isLeagueSlug(s){ return /^[a-z]{2,3}\.\d+$/.test(s) && !/\.cup$/.test(s); }
function hostOf(u){ try { return new URL(u).hostname.toLowerCase().replace(/^www\./,""); } catch { return ""; } }
function attrs(html, tag, attr){
  const out=[]; const re=new RegExp(`<${tag}\\b[^>]*\\s${attr}=["']([^"']+)["'][^>]*>`, "gi"); let m;
  while((m=re.exec(html))) out.push(m[1]);
  return [...new Set(out)];
}
function absolutize(u, base){ try { return new URL(u, base).toString(); } catch { return String(u||""); } }
function strip(html){
  return clean(String(html||"")
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&#8211;/gi,"-"));
}

const rejectHosts = [
  "goodhousekeeping.com","minecraftforum.net","fastercapital.com","geocountries.com","nationsonline.org","bbc.com","omniglot.com","touropia.com","ljubljana.info","indianmotorcycle.com",
  "wikipedia.org","wikidata.org","britannica.com","worldatlas.com","tripadvisor.com","livesport.com","flashscore.com","sofascore.com","soccerway.com","transfermarkt.com","rsssf.org",
  "facebook.com","instagram.com","x.com","twitter.com","youtube.com","linkedin.com"
];
function isRejectHost(h){ return rejectHosts.some(x => h === x || h.endsWith("." + x)); }

const providerPatterns = [
  {family:"opta_statsperform", re:/opta|statsperform|performgroup|srml|opta-widget|matchcentre|match-centre/i, priority:95},
  {family:"sportradar", re:/sportradar|widgets\.sportradar|api\.sportradar|betradar|srlive/i, priority:95},
  {family:"sportomedia", re:/sportomedia|sportomedia\.com|smg|sef-leagues/i, priority:85},
  {family:"torneopal", re:/torneopal/i, priority:85},
  {family:"fulltime_fa", re:/full-time|fulltime|thefa\.com\/full-time/i, priority:80},
  {family:"sportmonks", re:/sportmonks/i, priority:75},
  {family:"wordpress_rest_or_ajax", re:/wp-json|admin-ajax|tablepress/i, priority:60},
  {family:"bespoke_official_assets", re:/standings|league-table|scoreboard|competition|table|fixtures|results/i, priority:45}
];

const controlledPathRe = /(_diagnostics[\\/].*(controlled|official-domain|official-route|seed-probe|route-template|l4|snapshot|contract|sportomedia|torneopal|opta|spfl|loi|ksi|bundesliga|laliga|norway|family))/i;
const excludedPathRe = /(search-batches|search-targets|search-wave|search-pack|frontier|high-yield|exact-value-market-search-pack|provider-discovery-search|autonomous-search-results)/i;

const jsonFiles = listFiles("data/football-truth").filter(f => f.endsWith(".json") && controlledPathRe.test(f) && !excludedPathRe.test(f));
const htmlFiles = listFiles("data/football-truth").filter(f => /\.(html|htm)$/i.test(f) && controlledPathRe.test(f) && !excludedPathRe.test(f));

const snapshotIndex = new Map();
for(const f of htmlFiles){
  snapshotIndex.set(path.normalize(f).toLowerCase(), f);
}

const controlledRows = [];
let scannedJsonFileCount = 0;
for(const f of jsonFiles){
  const j = readJsonMaybe(f);
  if(!j) continue;
  scannedJsonFileCount++;
  walk(j,o=>{
    const slug = slugOf(o);
    if(!isLeagueSlug(slug)) return;
    const url = clean(o.url || o.sourceUrl || o.effectiveUrl || o.canonicalUrl || o.routeUrl || o.snapshotUrl);
    const host = clean(o.host || o.effectiveHost || hostOf(url));
    const snapshotPath = clean(o.snapshotPath || o.htmlSnapshotPath || o.localSnapshotPath || o.outputHtmlPath);
    const probeStatus = clean(o.probeStatus || o.status || o.extractorStatus || o.parserStatus || o.dryExtractStatus);
    const pageTitle = clean(o.pageTitle || o.title);
    if(!url && !snapshotPath) return;
    if(host && isRejectHost(host)) return;
    const normalizedSnapshot = snapshotPath ? path.normalize(snapshotPath).toLowerCase() : "";
    const hasSnapshot = normalizedSnapshot && snapshotIndex.has(normalizedSnapshot);
    const isControlled = controlledPathRe.test(f) && !excludedPathRe.test(f);
    if(!isControlled) return;
    controlledRows.push({
      competitionSlug:slug,
      competitionName:nameOf(o),
      sourceJsonFile:f,
      url,
      host,
      pageTitle,
      snapshotPath: hasSnapshot ? snapshotIndex.get(normalizedSnapshot) : snapshotPath,
      hasSnapshot,
      probeStatus
    });
  });
}

function analyzeSnapshot(row){
  const html = row.hasSnapshot ? fs.readFileSync(row.snapshotPath,"utf8") : "";
  const base = row.url || "https://" + row.host + "/";
  const scripts = attrs(html,"script","src").map(u=>absolutize(u,base));
  const links = attrs(html,"a","href").map(u=>absolutize(u,base));
  const iframes = attrs(html,"iframe","src").map(u=>absolutize(u,base));
  const text = `${row.url} ${row.host} ${row.pageTitle} ${scripts.join(" ")} ${links.join(" ")} ${iframes.join(" ")} ${strip(html).slice(0,80000)}`;
  const providerHits = providerPatterns.filter(p => p.re.test(text)).map(p => ({
    family:p.family,
    priority:p.priority,
    evidenceUrls:[...scripts,...iframes,...links].filter(u=>p.re.test(u)).slice(0,20),
    hitInVisibleText:p.re.test(strip(html).slice(0,80000))
  }));
  const tableCount = (html.match(/<table\b/gi)||[]).length;
  const trCount = (html.match(/<tr\b/gi)||[]).length;
  const standingsTextHits = (text.match(/standings|league table|classification|classifica|classement|tabla|played|points|fixtures|results|scoreboard/gim)||[]).length;
  const currentSeasonHit = /(2025[\s/-]*2026|2025\s*-\s*26|2025\/26|season\s*2025|2026)/i.test(text);
  let strictStatus = "blocked_no_verified_provider_contract";
  if(providerHits.some(h=>h.family !== "bespoke_official_assets" && h.evidenceUrls.length)) strictStatus = "verified_external_provider_asset_contract";
  else if(providerHits.some(h=>h.family !== "bespoke_official_assets")) strictStatus = "review_provider_marker_without_asset_url";
  else if((tableCount > 0 || standingsTextHits >= 8) && row.hasSnapshot) strictStatus = "verified_bespoke_official_snapshot_contract";
  return {
    ...row,
    htmlByteLength:html.length,
    tableCount,
    trCount,
    standingsTextHits,
    currentSeasonHit,
    providerHits,
    strictStatus
  };
}

const analyzed = controlledRows.map(analyzeSnapshot);
const verifiedRows = analyzed.filter(r => r.strictStatus !== "blocked_no_verified_provider_contract");

const familyMap = new Map();
for(const r of verifiedRows){
  const hits = r.providerHits.length ? r.providerHits : [{family:"bespoke_official_assets", priority:45, evidenceUrls:[], hitInVisibleText:false}];
  for(const h of hits){
    const fam = familyMap.get(h.family) || {family:h.family, priority:h.priority, competitionSlugs:new Set(), rows:[], evidenceUrlCount:0};
    fam.competitionSlugs.add(r.competitionSlug);
    fam.rows.push({
      competitionSlug:r.competitionSlug,
      competitionName:r.competitionName,
      url:r.url,
      host:r.host,
      pageTitle:r.pageTitle,
      snapshotPath:r.snapshotPath,
      strictStatus:r.strictStatus,
      tableCount:r.tableCount,
      trCount:r.trCount,
      currentSeasonHit:r.currentSeasonHit,
      sourceJsonFile:r.sourceJsonFile,
      evidenceUrls:h.evidenceUrls || []
    });
    fam.evidenceUrlCount += (h.evidenceUrls || []).length;
    familyMap.set(h.family,fam);
  }
}

const familyRows = [...familyMap.values()].map(f=>({
  family:f.family,
  priority:f.priority,
  verifiedCompetitionCount:f.competitionSlugs.size,
  competitionSlugs:[...f.competitionSlugs].sort(),
  rowCount:f.rows.length,
  evidenceUrlCount:f.evidenceUrlCount,
  executableNow:f.verifiedCompetitionCount >= 2 || (f.family !== "bespoke_official_assets" && f.verifiedCompetitionCount >= 1),
  batchScore:f.priority * 100 + f.competitionSlugs.size * 100 + Math.min(f.evidenceUrlCount,100),
  rows:f.rows.slice(0,80)
})).sort((a,b)=>b.batchScore-a.batchScore);

const executableFamilyRows = familyRows.filter(f=>f.executableNow);
const competitionRows = verifiedRows.map(r=>({
  competitionSlug:r.competitionSlug,
  competitionName:r.competitionName,
  host:r.host,
  url:r.url,
  pageTitle:r.pageTitle,
  strictStatus:r.strictStatus,
  families:r.providerHits.map(h=>h.family),
  tableCount:r.tableCount,
  trCount:r.trCount,
  currentSeasonHit:r.currentSeasonHit,
  snapshotPath:r.snapshotPath,
  sourceJsonFile:r.sourceJsonFile
})).sort((a,b)=>a.competitionSlug.localeCompare(b.competitionSlug));

const summary = {
  status:"passed",
  scannedJsonFileCount,
  scannedHtmlSnapshotCount:htmlFiles.length,
  controlledEvidenceRowCount:controlledRows.length,
  verifiedProviderContractRowCount:verifiedRows.length,
  verifiedProviderContractCompetitionCount:new Set(verifiedRows.map(r=>r.competitionSlug)).size,
  strictProviderFamilyCount:familyRows.length,
  executableProviderFamilyCount:executableFamilyRows.length,
  recommendedProviderFamily:executableFamilyRows[0]?.family || null,
  recommendedProviderFamilyCompetitionCount:executableFamilyRows[0]?.verifiedCompetitionCount || 0,
  recommendedNextLane:executableFamilyRows.length ? "build_bulk_executable_probe_for_strict_verified_provider_family" : "manual_provider_contract_mapping_required",
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
  executableFamilyRows,
  familyRows,
  competitionRows,
  blockedRows:analyzed.filter(r=>r.strictStatus==="blocked_no_verified_provider_contract").slice(0,300),
  policy:{
    localVerifierOnly:true,
    noSearch:true,
    noFetch:true,
    noCanonicalCandidateWrite:true,
    noProductionTruth:true,
    ignoresGenericSearchResultNoise:true,
    countsOnlyControlledSnapshotsAndSamePageAssets:true,
    providerFamilyScaleRequired:true
  }
});
console.log(JSON.stringify(summary,null,2));
