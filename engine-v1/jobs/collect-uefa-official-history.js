import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {getProjectRoot} from '../storage/data-root.js';
import {canonicalTeamName} from '../storage/team-aliases-db.js';
import {getProductionIdentityResolver} from '../core/production-identity-resolver-runtime.js';

const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const norm=name=>String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const validScore=pair=>pair&&[pair.home,pair.away].every(v=>Number.isInteger(v)&&v>=0);

function committedSameTeam(){
  const resolver=getProductionIdentityResolver(),cache=new Map();
  const identity=name=>{if(!cache.has(name))cache.set(name,resolver.resolveTeamReference({leagueSlug:'uefa.nations',alias:name}));return cache.get(name);};
  return (a,b)=>{
    const ar=identity(a),br=identity(b);
    return ar?.ok&&br?.ok?ar.globalClubId===br.globalClubId:
      norm(canonicalTeamName('uefa.nations',a)||a)===norm(canonicalTeamName('uefa.nations',b)||b);
  };
}

export function validateUefaOfficialResult(doc,expected,{nowMs=Date.now(),sameTeam=(a,b)=>norm(canonicalTeamName('uefa.nations',a)||a)===norm(canonicalTeamName('uefa.nations',b)||b)}={}){
  const reject=reason=>({ok:false,reason,authorityPromotionAllowed:false});
  if(expected.leagueSlug!=='uefa.nations'||String(doc.id)!==expected.officialMatchId)return reject('OFFICIAL_MATCH_ID_OR_SCOPE_MISMATCH');
  if(String(doc.competition?.id)!=='2014'||doc.competition?.sex!=='MALE'||doc.competition?.sportsType!=='FOOTBALL'
      ||doc.competition?.teamCategory!=='NATIONAL')return reject('OFFICIAL_COMPETITION_SCOPE_MISMATCH');
  if(String(doc.seasonYear)!==expected.officialEdition.slice(5))return reject('OFFICIAL_EDITION_MISMATCH');
  if(doc.status!=='FINISHED')return reject('OFFICIAL_PLAYED_FINAL_REQUIRED');
  const kickoff=doc.kickOffTime?.dateTime,ts=Date.parse(kickoff),finished=Date.parse(doc.fullTimeAt);
  if(!Number.isFinite(ts)||!Number.isFinite(finished)||ts>=nowMs||finished<ts||finished>nowMs)return reject('OFFICIAL_FINAL_TIMELINE_REQUIRED');
  if(expected.officialDate&&doc.kickOffTime?.date!==expected.officialDate)return reject('OFFICIAL_DATE_DISAGREEMENT');
  const home=doc.homeTeam,away=doc.awayTeam;
  if(!home?.id||!away?.id||home.id===away.id||[home,away].some(t=>t.teamTypeDetail!=='NATIONAL_MEN_TEAM_A'||t.isPlaceHolder))return reject('OFFICIAL_SENIOR_TEAM_IDS_REQUIRED');
  if(!sameTeam(home.internationalName,expected.homeTeam)||!sameTeam(away.internationalName,expected.awayTeam))return reject('OFFICIAL_ORDERED_TEAM_NAMES_DISAGREE');
  if(!validScore(doc.score?.total)||!validScore(doc.score?.regular))return reject('OFFICIAL_REGULAR_AND_TOTAL_SCORE_REQUIRED');
  if(doc.score.total.home!==expected.scoreHome||doc.score.total.away!==expected.scoreAway)return reject('OFFICIAL_AGGREGATE_AND_MATCH_SCORE_DISAGREE');
  for(const key of ['penalty','extraTime'])if(doc.score[key]&&!validScore(doc.score[key]))return reject('OFFICIAL_SCORE_PERIOD_INVALID');
  const penalty=doc.score.penalty||null,extra=doc.score.extraTime||null;
  return {ok:true,authorityPromotionAllowed:false,fact:{provider:'uefa-official',providerMatchId:String(doc.id),
    leagueSlug:'uefa.nations',officialEdition:expected.officialEdition,officialDate:doc.kickOffTime.date,
    kickoffUtc:new Date(ts).toISOString(),fullTimeAt:new Date(finished).toISOString(),
    homeProviderTeamId:String(home.id),awayProviderTeamId:String(away.id),homeTeam:home.internationalName,awayTeam:away.internationalName,
    regularScore:doc.score.regular,totalScore:doc.score.total,penaltyScore:penalty,extraTimeScore:extra,
    winnerReason:doc.winner?.match?.reason||null,
    scoreBasis:'PERIODS_PRESERVED_NO_CANONICAL_PROMOTION',sourceStatus:doc.status}};
}

export function revalidateUefaOfficialCapture(report,extraction){
  if(report.schema!=='ai-matchlab.official-uefa-result-validation.v1'||extraction.schema!=='ai-matchlab.official-history-extraction.v1')throw Error('BOUND_UEFA_CAPTURE_AND_EXTRACTION_REQUIRED');
  const expected=new Map(extraction.sources.flatMap(s=>s.rows||[]).filter(r=>r.leagueSlug==='uefa.nations').map(r=>[r.officialMatchId,r]));
  const sameTeam=committedSameTeam();
  const records=report.records.map(record=>{
    if(!record.file)return record;
    const relative=path.relative(report.output,record.file);
    if(relative.startsWith('..')||path.isAbsolute(relative)||fs.lstatSync(record.file).isSymbolicLink())throw Error('UEFA_CAPTURE_PATH_ESCAPE');
    const bytes=fs.readFileSync(record.file);
    if(digest(bytes)!==record.sha256||bytes.length!==record.bytes)throw Error('UEFA_CAPTURE_HASH_OR_SIZE_MISMATCH');
    const source=expected.get(record.officialMatchId);
    if(!source||record.url!=='https://match.uefa.com/v5/matches/'+record.officialMatchId||source.responseSha256!==record.aggregateSha256)throw Error('UEFA_CAPTURE_SOURCE_BINDING_MISMATCH');
    const {ok,reason,fact,...capture}=record;
    return {...capture,...validateUefaOfficialResult(JSON.parse(bytes),source,{sameTeam})};
  });
  return {...report,records,revalidatedAt:new Date().toISOString(),validated:records.filter(r=>r.ok).length,
    holds:records.filter(r=>!r.ok).reduce((a,r)=>(a[r.reason]=(a[r.reason]||0)+1,a),{}),productionWrites:0};
}

export async function collectUefaOfficialHistory(extraction,{outputBase,budgetMs=180000}={}){
  if(extraction.schema!=='ai-matchlab.official-history-extraction.v1'||!path.isAbsolute(outputBase||''))throw Error('OFFICIAL_EXTRACTION_AND_ABSOLUTE_OUTPUT_BASE_REQUIRED');
  const rows=extraction.sources.flatMap(s=>s.rows||[]).filter(r=>r.leagueSlug==='uefa.nations');
  const tasks=[...new Map(rows.map(r=>[r.officialMatchId,r])).values()];
  if(tasks.some(r=>!/^\d+$/.test(r.officialMatchId))||tasks.length>350)throw Error('BOUNDED_NATIVE_UEFA_IDS_REQUIRED');
  const dir=fs.mkdtempSync(path.join(outputBase,'AIML_UEFA_API_HISTORY_')),records=[],start=Date.now();
  const sameTeam=committedSameTeam();
  for(let offset=0;offset<tasks.length;offset+=3){
    if(Date.now()-start>budgetMs)break;
    const results=await Promise.all(tasks.slice(offset,offset+3).map(async expected=>{
      const url='https://match.uefa.com/v5/matches/'+expected.officialMatchId;
      try{
        const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000)});
        if(!response.ok)throw Error('HTTP_'+response.status);
        const body=Buffer.from(await response.arrayBuffer()),sha256=digest(body),file=path.join(dir,sha256+'.json');
        if(!fs.existsSync(file))fs.writeFileSync(file,body,{flag:'wx'});
        const payload=JSON.parse(body),validation=validateUefaOfficialResult(payload,expected,{sameTeam});
        return {officialMatchId:expected.officialMatchId,url,sha256,file,bytes:body.length,capturedAt:new Date().toISOString(),
          aggregateSha256:expected.responseSha256,...validation};
      }catch(error){return {officialMatchId:expected.officialMatchId,url,ok:false,reason:error.cause?.code||error.code||error.message,authorityPromotionAllowed:false};}
    }));
    records.push(...results);
    fs.writeFileSync(path.join(dir,'progress.json'),JSON.stringify({records,planned:tasks.length})+'\n');
    if(records.length%30===0||records.length===tasks.length)console.log(JSON.stringify({event:'uefa-api',completed:records.length,planned:tasks.length,validated:records.filter(r=>r.ok).length}));
  }
  const report={schema:'ai-matchlab.official-uefa-result-validation.v1',generatedAt:new Date().toISOString(),
    planned:tasks.length,attempted:records.length,validated:records.filter(r=>r.ok).length,deferred:tasks.length-records.length,
    holds:records.filter(r=>!r.ok).reduce((a,r)=>(a[r.reason]=(a[r.reason]||0)+1,a),{}),records,output:dir,
    productionWrites:0,authorityPromotionAllowed:false,fullCoverageCertified:false};
  fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');
  return report;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  const root=getProjectRoot(),report=await collectUefaOfficialHistory(JSON.parse(fs.readFileSync(path.join(root,'docs/history-coverage/20261115-official-extraction.json'),'utf8')),{outputBase:process.argv[2]});
  fs.writeFileSync(path.join(root,'docs/history-coverage/20261115-uefa-api-validation.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({validated:report.validated,planned:report.planned,deferred:report.deferred,holds:report.holds,output:report.output,productionWrites:0}));
}
