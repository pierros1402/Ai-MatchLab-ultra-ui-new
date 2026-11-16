import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getProjectRoot} from '../storage/data-root.js';
import {getProductionIdentityResolver} from '../core/production-identity-resolver-runtime.js';
import {canonicalTeamName} from '../storage/team-aliases-db.js';
import {getLeagueCoverage} from '../../workers/_shared/leagues-coverage.js';
import {isPlayedFinal} from '../core/non-played-state.js';

const normalized=name=>String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const score=value=>value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isInteger(Number(value))&&Number(value)>=0?Number(value):null;

export function compareOfficialHistory(rows,local,{resolveTeam=(slug,alias)=>getProductionIdentityResolver().resolveTeamReference({leagueSlug:slug,alias})}={}){
  const cache=new Map();
  const reference=(slug,name)=>{
    const key=JSON.stringify([slug,name]);
    if(!cache.has(key))cache.set(key,resolveTeam(slug,name));
    return cache.get(key);
  };
  const same=(slug,a,b)=>{
    const ar=reference(slug,a),br=reference(slug,b);
    if(ar?.ok&&br?.ok)return Boolean(ar.globalClubId)&&ar.globalClubId===br.globalClubId;
    return normalized(canonicalTeamName(slug,a)||a)===normalized(canonicalTeamName(slug,b)||b);
  };
  return rows.map(official=>{
    if(!getLeagueCoverage(official.leagueSlug))throw Error('OFFICIAL_COMPARISON_OUTSIDE_APPROVED_MAP');
    if(!official.officialDate)return {official,status:'OFFICIAL_EXACT_DATE_REQUIRED',candidates:[]};
    const pair=local.filter(row=>row.leagueSlug===official.leagueSlug&&same(row.leagueSlug,row.homeTeam,official.homeTeam)&&same(row.leagueSlug,row.awayTeam,official.awayTeam));
    const dated=pair.filter(row=>row.observedDay===official.officialDate);
    const candidates=dated.map(row=>({id:row.id||row.canonicalId||row.matchId,day:row.observedDay,
      scoreHome:row.scoreHome,scoreAway:row.scoreAway,status:row.status,stores:row.stores}));
    if(!dated.length)return {official,status:pair.length?'ORDERED_PAIR_EXISTS_DATE_REQUIRES_REVIEW':'NO_LOCAL_ORDERED_PAIR_OBSERVED',candidates,
      otherObservedDays:[...new Set(pair.map(r=>r.observedDay))].sort()};
    const terminal=dated.filter(isPlayedFinal);
    if(!terminal.length)return {official,status:'LOCAL_NONFINAL_SNAPSHOT_REQUIRES_FINAL_REFRESH',candidates};
    const matching=terminal.filter(row=>score(row.scoreHome)!==null&&score(row.scoreAway)!==null&&
      score(row.scoreHome)===official.scoreHome&&score(row.scoreAway)===official.scoreAway);
    const scored=terminal.filter(row=>score(row.scoreHome)!==null&&score(row.scoreAway)!==null);
    const differing=scored.filter(row=>!matching.includes(row));
    return {official,status:differing.length?'OFFICIAL_LOCAL_SCORE_DISAGREEMENT':matching.length?
      'SAME_OBSERVED_SCORE_REQUIRES_AUTHORITY_AND_PERIOD_VALIDATION':'LOCAL_FINAL_SCORE_NOT_OBSERVED',candidates};
  });
}

export function loadLocalOfficialComparisonRows(root,slugs){
  const observed=new Map(),errors=[];
  const add=(row,store,day=null)=>{
    if(!row||!slugs.has(row.leagueSlug))return;
    const kickoff=row.kickoff||row.kickoffUtc||row.date;
    const validDate=Number.isFinite(Date.parse(kickoff));
    const observedDay=day||row.dayKey||(validDate?new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(kickoff)):null);
    const key=JSON.stringify([row.id||row.canonicalId||row.matchId,observedDay,row.leagueSlug,row.homeTeam,row.awayTeam,row.scoreHome,row.scoreAway,row.status]);
    const entry=observed.get(key)||{...row,observedDay,stores:[]};
    if(!entry.stores.includes(store))entry.stores.push(store);observed.set(key,entry);
  };
  const read=(relative,consume)=>{
    const file=path.join(root,relative);
    if(!fs.existsSync(file))return;
    try{consume(JSON.parse(fs.readFileSync(file,'utf8')));}catch(e){errors.push({file:relative,reason:e.message});}
  };
  const list=relative=>fs.existsSync(path.join(root,relative))?fs.readdirSync(path.join(root,relative)):[];
  for(const name of list('data/history').filter(n=>/^\d{4}-\d{4}\.json$/.test(n))){
    const file=`data/history/${name}`;read(file,doc=>doc.days.forEach(d=>d.rows.forEach(row=>add(row,file,d.dayKey))));
  }
  for(const slug of slugs)for(const name of list(`data/history-archive/${slug}`).filter(n=>n.endsWith('.json'))){
    const file=`data/history-archive/${slug}/${name}`;read(file,doc=>(Array.isArray(doc)?doc:doc.rows||doc.matches||[]).forEach(row=>add(row,file)));
  }
  for(const kind of ['team-form','matchups'])for(const name of list(`data/history-index/${kind}`).filter(n=>/^\d{4}-\d{4}\.json$/.test(n))){
    const file=`data/history-index/${kind}/${name}`;read(file,doc=>Object.values(doc).forEach(entry=>(entry.matches||entry.lastMatches||[]).forEach(row=>add(row,file))));
  }
  for(const day of list('data/canonical-fixtures').filter(n=>/^\d{4}-\d{2}-\d{2}$/.test(n)))for(const slug of slugs){
    const file=`data/canonical-fixtures/${day}/${slug}.json`;read(file,doc=>doc.fixtures.forEach(row=>add(row,file,day)));
  }
  return {rows:[...observed.values()],errors};
}

export function auditOfficialExtraction(extraction,{root=getProjectRoot()}={}){
  if(extraction.schema!=='ai-matchlab.official-history-extraction.v1'||extraction.productionWrites!==0||extraction.authorityPromotionAllowed!==false)throw Error('READ_ONLY_OFFICIAL_EXTRACTION_REQUIRED');
  const rows=extraction.sources.flatMap(s=>s.rows||[]),slugs=new Set(rows.map(r=>r.leagueSlug));
  const local=loadLocalOfficialComparisonRows(root,slugs);
  const comparisons=compareOfficialHistory(rows,local.rows);
  const counts=comparisons.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{});
  const byEdition=extraction.sources.map(s=>({slug:s.slug,edition:s.edition,results:s.rows?.length||0,
    counts:comparisons.filter(r=>r.official.leagueSlug===s.slug&&r.official.officialEdition===s.edition).reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{})}));
  return {schema:'ai-matchlab.official-history-comparison.v1',counts,byEdition,comparisons,readErrors:local.errors,
    scope:'CAPTURED_OFFICIAL_PAGES_ONLY',productionWrites:0,authorityPromotionAllowed:false,fullCoverageCertified:false};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('OFFICIAL_EXTRACTION_AND_OUTPUT_PATHS_REQUIRED');
  const result=auditOfficialExtraction(JSON.parse(fs.readFileSync(input,'utf8')));
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({counts:result.counts,byEdition:result.byEdition,readErrors:result.readErrors,productionWrites:0}));
}
