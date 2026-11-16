import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { getProjectRoot } from '../storage/data-root.js';
import { LEAGUES_COVERAGE } from '../../workers/_shared/leagues-coverage.js';
import { currentSeason, seasonBefore } from '../core/season.js';
import { archiveSeasonLabels } from '../core/season-model.js';
import { buildVerifiedHistoryDay } from './append-finalized-day-to-history.js';
import { diagnoseValueRecentSample } from '../core/value-engine-v1.js';
import { censusHistoryCoverage } from '../core/global-history-coverage.js';
import { canonicalFixturesForDay } from '../core/day-fixture-universe.js';
import { overlayProductionEvidenceDocumentReadView } from '../core/production-evidence-identity-overlay.js';
import {getProductionIdentityResolver} from '../core/production-identity-resolver-runtime.js';

export function auditGlobalHistoryCoverage({dayKey,root=getProjectRoot(),write=false,phase='audit',lookAheadDays=1,verifyTruth=true}={}) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dayKey||'')||!['before','after','audit'].includes(phase)
    || !Number.isInteger(lookAheadDays)||lookAheadDays<0||lookAheadDays>14)throw Error('INVALID_GLOBAL_COVERAGE_SCOPE');
  const now=new Date(`${dayKey}T12:00Z`), season=currentSeason(now), seasons=[season,seasonBefore(season)];
  const readErrors=[],provenance=[];
  const load=(relative,optional=false)=>{
    const file=path.join(root,relative);
    if(!fs.existsSync(file)){if(!optional)readErrors.push({path:relative,reason:'FILE_MISSING'});return null;}
    try{
      const bytes=fs.readFileSync(file);
      provenance.push({path:relative.replaceAll('\\','/'),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
      return JSON.parse(bytes.toString('utf8'));
    }catch(error){readErrors.push({path:relative,reason:error.message});return null;}
  };
  const files=relative=>{
    const dir=path.join(root,relative);
    return fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isFile()&&e.name.endsWith('.json')).map(e=>e.name).sort():[];
  };
  const indexes={},consumerIndexes={},history=[],archive=[],verifiedCanonical=[],fixtures=[];
  for(const label of seasons){
    indexes[label]={};consumerIndexes[label]={};
    for(const [i,kind] of ['team-form','league-form','matchups'].entries()){
      const key=['teamForm','leagueForm','matchups'][i],relative=`data/history-index/${kind}/${label}.json`;
      const raw=load(relative,true)||{};
      indexes[label][key]=raw;
      try{consumerIndexes[label][key]=overlayProductionEvidenceDocumentReadView(raw);}
      catch(error){
        // Mirror the real Value read boundary's empty fallback, while exposing
        // the identity failure instead of certifying the raw store as usable.
        consumerIndexes[label][key]={};
        readErrors.push({path:relative,reason:error.code||error.message,details:error.details||null});
      }
    }
    const doc=load(`data/history/${label}.json`,true);
    if(doc){if(!Array.isArray(doc.days))readErrors.push({path:`data/history/${label}.json`,reason:'HISTORY_SHAPE_INVALID'});
      else history.push({season:label,rows:doc.days.flatMap(d=>d.rows||[])});}
  }
  for(const meta of LEAGUES_COVERAGE){
    for(const name of files(`data/history-archive/${meta.slug}`)){
      const doc=load(`data/history-archive/${meta.slug}/${name}`);
      if(!doc)continue;
      const rows=Array.isArray(doc)?doc:doc.rows||doc.matches;
      if(!Array.isArray(rows)){readErrors.push({path:`data/history-archive/${meta.slug}/${name}`,reason:'ARCHIVE_SHAPE_INVALID'});continue;}
      archive.push({slug:meta.slug,season:name.slice(0,-5),rows});
    }
  }
  const canonicalRoot=path.join(root,'data/canonical-fixtures');
  const days=fs.existsSync(canonicalRoot)?fs.readdirSync(canonicalRoot).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort():[];
  const lastDay=new Date(+now+lookAheadDays*86400000).toISOString().slice(0,10);
  const truthDays=[];
  for(const day of days){
    const relevant=seasons.includes(currentSeason(new Date(`${day}T12:00Z`)));
    if(!relevant||day>lastDay)continue;
    let canonicalRows=files(`data/canonical-fixtures/${day}`).flatMap(name=>{
      const doc=load(`data/canonical-fixtures/${day}/${name}`);
      if(!Array.isArray(doc?.fixtures)){readErrors.push({path:`data/canonical-fixtures/${day}/${name}`,reason:'CANONICAL_SHAPE_INVALID'});return [];}
      return doc.fixtures;
    });
    if(path.resolve(root)===path.resolve(getProjectRoot())){
      try{canonicalRows=canonicalFixturesForDay(day);}
      catch(error){readErrors.push({path:`data/canonical-fixtures/${day}`,reason:error.message});canonicalRows=[];}
    }
    if(day>=dayKey)fixtures.push(...canonicalRows);
    if(verifyTruth&&day<dayKey){
      const finalResultRows=files(`data/final-results/${day}`).map(name=>load(`data/final-results/${day}/${name}`)).filter(Boolean);
      const result=buildVerifiedHistoryDay({dayKey:day,canonicalRows,finalResultRows});
      verifiedCanonical.push({dayKey:day,season:result.season,rows:result.rows});
      truthDays.push({dayKey:day,ok:result.ok,reason:result.reason,errors:result.errors,acceptedRows:result.rows.length});
    }
  }
  const consumerDiagnostics=fixtures.map(fixture=>{
    const identity={id:fixture.canonicalId||fixture.matchId||fixture.id,
      leagueSlug:fixture.leagueSlug,homeTeam:fixture.homeTeam,awayTeam:fixture.awayTeam};
    try{return {...identity,...diagnoseValueRecentSample(fixture,consumerIndexes[season],season)};}
    catch(error){readErrors.push({...identity,reason:error.message});return {...identity,ok:false,reason:'CONSUMER_DIAGNOSTIC_FAILED'};}
  });
  const identityCache=new Map(),resolver=getProductionIdentityResolver();
  const resolveTeamIdentity=(slug,alias)=>{const key=slug+'\0'+alias;if(!identityCache.has(key)){const r=resolver.resolveTeamReference({leagueSlug:slug,alias});identityCache.set(key,r.ok?'global:'+r.globalClubId:null);}return identityCache.get(key);};
  const report=censusHistoryCoverage({seasons,archive,history,verifiedCanonical,indexes,fixtures,consumerDiagnostics,readErrors,resolveTeamIdentity});
  Object.assign(report,{dayKey,phase,seasons,truthDays,provenance,
    requiredArchiveSeasons:Object.fromEntries(LEAGUES_COVERAGE.map(meta=>[meta.slug,archiveSeasonLabels(meta.slug,5,now)])),
    missingRequiredArchiveFiles:LEAGUES_COVERAGE.flatMap(meta=>archiveSeasonLabels(meta.slug,5,now)
      .filter(label=>!archive.some(doc=>doc.slug===meta.slug&&doc.season===label))
      .map(label=>({slug:meta.slug,season:label,providerAvailability:'NOT_YET_VERIFIED'}))),
    truthValidationScope:verifyTruth?'ALL_OBSERVED_CANONICAL_DAYS_IN_CURRENT_AND_PREVIOUS_GLOBAL_SEASONS':'NOT_RUN',
    generatedAt:new Date().toISOString()});
  if(!verifyTruth)report.status='PARTIAL_TRUTH_SCAN_NOT_RUN';
  if(write){
    const dir=path.join(root,'data/history-coverage',dayKey);fs.mkdirSync(dir,{recursive:true});
    const target=path.join(dir,`${phase}.json`),temporary=`${target}.tmp`;
    fs.writeFileSync(temporary,JSON.stringify(report,null,2)+'\n');fs.renameSync(temporary,target);
  }
  return report;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  const report=auditGlobalHistoryCoverage({dayKey:process.argv[2],write:process.argv.includes('--write'),
    phase:process.argv.includes('--before')?'before':process.argv.includes('--after')?'after':'audit',
    verifyTruth:!process.argv.includes('--inventory-only')});
  console.log(JSON.stringify({status:report.status,metrics:report.metrics,fullCoverageCertified:report.fullCoverageCertified}));
}
