import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import zlib from 'node:zlib';import {fileURLToPath} from 'node:url';
import {LEAGUES_COVERAGE} from '../../workers/_shared/leagues-coverage.js';
import {knownLeaguePaths,resolveSlugFromPath,resolveResearchCompetition} from '../odds/flashscore-league-map.js';
import {parseFlashscoreFeed} from '../odds/flashscore-fixtures-source.js';
import {archiveSeasonForDate} from '../core/season-model.js';
import {athensDayFromKickoff} from '../core/daykey.js';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const save=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(value,null,2)+'\n');fs.renameSync(file+'.tmp',file);};
export function archivedSeasonLinks(html,leaguePath){
 const prefix=leaguePath.slice(0,-1)+'-',map=new Map();
 const marker=/\bleague_archive_data\s*=\s*/.exec(html);
 if(marker){
  const start=marker.index+marker[0].length;let depth=0,quoted=false,escaped=false,end=-1;
  for(let i=start;i<html.length;i++){const c=html[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0){end=i+1;break;}}
  if(end>start){const data=JSON.parse(html.slice(start,end));for(const entry of data.seasons||[]){
   const years=/(\d{4})[/-](\d{4})\s*$/.exec(entry.name||'')||/(\d{4})\s*$/.exec(entry.name||'');
   if(years&&(entry.url===leaguePath||entry.url?.startsWith(prefix)))map.set(years[2]?years[1]+'-'+years[2]:years[1],entry.url);
  }}
 }
 for(const m of html.matchAll(/href=["'](\/football\/[^"'?#]+\/)["']/g)){
  if(!m[1].startsWith(prefix))continue;const suffix=m[1].slice(prefix.length);const y=/^(\d{4})(?:-(\d{4}))?\/$/.exec(suffix);if(!y)continue;
  map.set(y[2]?y[1]+'-'+y[2]:y[1],m[1]);
 }
 return map;
}
export function pageNativeHistoryFeeds(html){
 return [...html.matchAll(/data:\s*`([^`]*)`,\s*allEventsCount:\s*(\d+),\s*seasonId:\s*(\d+)/g)].map(m=>({feed:m[1],declaredCount:Number(m[2]),seasonOrdinal:m[3],rows:parseFlashscoreFeed(m[1])}));
}
export function validateObservedFeedResult(row,{slug,season,nowMs=Date.now()}={}){
 if(!LEAGUES_COVERAGE.some(m=>m.slug===slug)||slug==='uefa.nations')return {ok:false,reason:'OUTSIDE_NEW_COLLECTION_SCOPE'};
 if(resolveResearchCompetition(row)!==slug)return {ok:false,reason:'EXACT_COMPETITION_BINDING_REQUIRED'};
 if(!row.playedFinal||row.statusCode!=='3'||row.statusDetailCode!=='3')return {ok:false,reason:'EXPLICIT_REGULAR_PLAYED_FINAL_REQUIRED'};
 if(!/^[A-Za-z0-9]{6,16}$/.test(row.matchId||'')||![row.homeProviderTeamId,row.awayProviderTeamId].every(x=>/^[A-Za-z0-9]{6,16}$/.test(x||''))||row.homeProviderTeamId===row.awayProviderTeamId)return {ok:false,reason:'NATIVE_MATCH_AND_TEAM_IDS_REQUIRED'};
 if(![row.scoreHome,row.scoreAway].every(x=>Number.isInteger(x)&&x>=0)||!row.home||!row.away||row.home===row.away)return {ok:false,reason:'EXPLICIT_FINAL_SCORE_AND_TEAMS_REQUIRED'};
 const ts=Date.parse(row.kickoffUtc);if(!Number.isFinite(ts)||ts>=nowMs||archiveSeasonForDate(slug,row.kickoffUtc)!==season)return {ok:false,reason:'EXACT_ARCHIVE_SEASON_AND_PAST_KICKOFF_REQUIRED'};
 return {ok:true,row:{id:row.matchId,season,dayKey:athensDayFromKickoff(row.kickoffUtc),kickoff:row.kickoffUtc,kickoff_ms:ts,leagueSlug:slug,leagueName:row.leagueName,homeTeam:row.home,awayTeam:row.away,scoreHome:row.scoreHome,scoreAway:row.scoreAway,status:'FT',rawStatus:'STATUS_FINAL',outcome:row.scoreHome===row.scoreAway?'DRAW':row.scoreHome>row.scoreAway?'HOME':'AWAY',source:'flashscore-native-archive-feed',providerIds:{flashscore:row.matchId},homeProviderTeamId:row.homeProviderTeamId,awayProviderTeamId:row.awayProviderTeamId,providerLeaguePath:row.leaguePath,phase:'regular',scoreBasis:'EXPLICIT_NATIVE_REGULAR_PLAYED_FINAL',providerStatus:{statusCode:row.statusCode,statusDetailCode:row.statusDetailCode},tournamentId:row.tournamentId,stageId:row.stageId}};
}
export async function collectMissingCompetitionHistory({inventoryFile,outputDir,budgetMs=420000,fetchFn=fetch,nowMs=Date.now()}={}){
 const inventory=JSON.parse(fs.readFileSync(inventoryFile,'utf8'));if(inventory.competitions.length!==230)throw Error('EXACT_230_COMPETITION_INVENTORY_REQUIRED');
 fs.mkdirSync(path.join(outputDir,'raw'),{recursive:true});const rawCache=new Map(),started=Date.now(),records=[],captureManifest=[];
 const priorFile=path.join(outputDir,'capture-manifest.json');
 if(fs.existsSync(priorFile))for(const item of JSON.parse(fs.readFileSync(priorFile,'utf8'))){
  captureManifest.push(item);if(item.ok){const bytes=zlib.gunzipSync(fs.readFileSync(path.join(outputDir,item.file)));if(hash(bytes)!==item.sha256)throw Error('CACHED_NATIVE_SOURCE_HASH_MISMATCH');rawCache.set(item.url,{...item,text:bytes.toString('utf8')});}
 }
 const capture=async url=>{
  if(rawCache.has(url))return rawCache.get(url);
  if(Date.now()-started>=budgetMs)throw Error('ACQUISITION_BATCH_BUDGET_REACHED');
  const headers={'user-agent':'Mozilla/5.0',accept:'text/html,text/plain,application/json',...(url.includes('/x/feed/')?{'x-fsign':'SW9D1eZo',referer:'https://www.flashscore.com/'}:{})};
  const response=await fetchFn(url,{headers,redirect:'error',signal:AbortSignal.timeout(20000)});
  const bytes=Buffer.from(await response.arrayBuffer()),sha256=hash(bytes),relative='raw/'+sha256+'.gz';
  if(!fs.existsSync(path.join(outputDir,relative)))fs.writeFileSync(path.join(outputDir,relative),zlib.gzipSync(bytes));
  const item={url,httpStatus:response.status,ok:response.ok,sha256,bytes:bytes.length,file:relative,capturedAt:new Date().toISOString()};captureManifest.push(item);
  if(!response.ok)throw Error('SOURCE_HTTP_'+response.status);
  const result={...item,text:bytes.toString('utf8')};rawCache.set(url,result);return result;
 };
 const targets=inventory.competitions.filter(c=>c.slug!=='uefa.nations'&&(c.missingRequiredSeasons.length||c.emptyArchiveSeasons.length||!c.archiveRows));
 let cursor=0;
 async function worker(){while(cursor<targets.length){const target=targets[cursor++],record={slug:target.slug,requestedSeasons:[...new Set([...target.missingRequiredSeasons,...target.emptyArchiveSeasons])],seasons:[],productionWrites:0};
  try{
   const leaguePath=knownLeaguePaths().find(p=>resolveSlugFromPath(p)===target.slug);if(!leaguePath)throw Error('APPROVED_PROVIDER_PATH_UNAVAILABLE');
   record.leaguePath=leaguePath;const archive=await capture('https://www.flashscore.com'+leaguePath+'archive/');const links=archivedSeasonLinks(archive.text,leaguePath);record.sourceArchiveSha256=archive.sha256;record.observedSeasonLinks=Object.fromEntries(links);
   const template=(archive.text.match(/tournamentTemplateId:\s*"([A-Za-z0-9]+)"/)||[])[1];
   for(const season of record.requestedSeasons){const result={season,rows:[],rejected:{},sourceCaptures:[]};record.seasons.push(result);const seasonPath=links.get(season);
    if(!seasonPath){result.reason='NO_EXACT_PROVIDER_EDITION_LINK';continue;}
    try{
     const page=await capture('https://www.flashscore.com'+seasonPath+'results/');result.sourceCaptures.push(page.sha256);
     const seasonTemplate=(page.text.match(/tournamentTemplateId:\s*"([A-Za-z0-9]+)"/)||[])[1];if(!template||seasonTemplate!==template)throw Error('NATIVE_TOURNAMENT_TEMPLATE_DISAGREEMENT');
     const country=(page.text.match(new RegExp('(\\d+)_'+template))||[])[1];if(!country)throw Error('NATIVE_COUNTRY_TEMPLATE_BINDING_REQUIRED');
     const feeds=pageNativeHistoryFeeds(page.text).filter(f=>f.rows.some(r=>r.playedFinal));if(!feeds.length)throw Error('NATIVE_FINISHED_RESULT_FEED_UNAVAILABLE');
     const seen=new Map();let declared=0;
     const accept=(rows,source)=>{for(const row of rows){const v=validateObservedFeedResult(row,{slug:target.slug,season,nowMs});if(!v.ok){result.rejected[v.reason]=(result.rejected[v.reason]||0)+1;continue;}const fact={...v.row,sourceEvidence:{url:source.url,sha256:source.sha256,capturedAt:source.capturedAt,independentSourceCount:1,verifiedCanonicalPromotion:false}};const previous=seen.get(fact.id);if(previous&&(previous.scoreHome!==fact.scoreHome||previous.scoreAway!==fact.scoreAway||previous.kickoff!==fact.kickoff||previous.homeProviderTeamId!==fact.homeProviderTeamId||previous.awayProviderTeamId!==fact.awayProviderTeamId))throw Error('NATIVE_FEED_FACT_CONFLICT');seen.set(fact.id,fact);}};
     for(const feed of feeds){declared+=feed.declaredCount;accept(feed.rows,page);
      for(let pg=2;seen.size<declared&&pg<=12;pg++){
       const source=await capture(`https://2.flashscore.ninja/2/x/feed/tr_1_${country}_${template}_${feed.seasonOrdinal}_${pg}_0_en_2`);result.sourceCaptures.push(source.sha256);const before=seen.size;accept(parseFlashscoreFeed(source.text),source);if(seen.size===before)break;
      }
     }
     result.rows=[...seen.values()];result.declaredProviderResults=declared;result.ok=result.rows.length>0;result.completeness=result.rows.length===declared?'MATCHED_NATIVE_RESULT_COUNT':'PARTIAL_SOURCE_OR_STATUS_SCOPE';
    }catch(error){result.rows=[];result.ok=false;result.reason=error.cause?.code||error.code||error.message;}
   }
  }catch(error){record.ok=false;record.reason=error.cause?.code||error.code||error.message;}
  records.push(record);save(path.join(outputDir,'capture-manifest.json'),captureManifest);save(path.join(outputDir,'progress.json'),{records,planned:targets.length,completed:records.length});console.log(JSON.stringify({event:'competition-capture',completed:records.length,planned:targets.length,slug:record.slug,rows:record.seasons.reduce((n,s)=>n+s.rows.length,0),reason:record.reason||null}));
 }}
 await Promise.all([worker(),worker(),worker()]);
 const report={schema:'aiml.missing-competition-native-history-capture.v1',generatedAt:new Date().toISOString(),competitionInventory:230,planned:targets.length,completed:records.length,excludedCompletedUefaRecovery:true,records,captures:captureManifest.length,validatedObservedRows:records.flatMap(r=>r.seasons).reduce((n,s)=>n+s.rows.length,0),productionWrites:0,fullCoverageCertified:false};
 save(path.join(outputDir,'report.json'),report);return report;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){const r=await collectMissingCompetitionHistory({inventoryFile:process.argv[2],outputDir:process.argv[3]});console.log(JSON.stringify({completed:r.completed,planned:r.planned,validatedObservedRows:r.validatedObservedRows,productionWrites:0}));}
