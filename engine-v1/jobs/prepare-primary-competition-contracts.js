import fs from 'node:fs';
import path from 'node:path';
import {resolveDataPath} from '../storage/data-root.js';
import {currentSeason} from '../core/season.js';
import {validateCompetitionFormatRegistry} from '../core/competition-format-registry.js';
import {buildStandingsDay} from './build-standings-day.js';
import {acquirePrimaryCompetitionCount,PRIMARY_COMPETITION_SOURCES} from '../source-discovery/primary-competition-count.js';
import {searchWeb} from '../source-discovery/web-search-provider.js';
export function contractWithPrimaryCount(original,proof){
 if(original?.competition?.slug!==proof.slug||proof.verifiedScope!=='TEAM_COUNT'||!PRIMARY_COMPETITION_SOURCES[proof.slug])throw Error('primary_contract_identity_mismatch');
 if(original.season?.reference===proof.season&&original.authority?.scopes?.includes('TEAM_COUNT')){
  if(original.teamCount?.rule?.mode!=='EXACT'||original.teamCount.rule.value!==proof.count)throw Error('primary_contract_authority_conflict');
  return null;
 }
 if(original.authority?.scopes?.some(scope=>scope!=='TEAM_COUNT'))throw Error('primary_contract_other_scopes_need_season_evidence');
 const version=Number(original.contractVersion||0)+1;
 return {...structuredClone(original),contractId:`${proof.slug}@${proof.season}#v${version}`,contractVersion:version,
  season:{...original.season,reference:proof.season},
  authority:{status:'PARTIALLY_VERIFIED',scopes:['TEAM_COUNT'],verifiedAt:proof.retrievedAt.slice(0,10),evidence:[{
   sourceClass:'PRIMARY_OFFICIAL',publisher:proof.publisher,title:`Current-season ${proof.season} official club count`,url:proof.url,retrievedAt:proof.retrievedAt.slice(0,10),supports:['TEAM_COUNT']}]},
  teamCount:{rule:{mode:'EXACT',value:proof.count,minimum:null,maximum:null},enforcement:'STRICT_REPORT_ONLY',sourceLabel:'Current-season primary official source'}};
}
export async function preparePrimaryCompetitionContracts(day,slugs,{nowMs=Date.now(),acquire=acquirePrimaryCompetitionCount}={}){
 const file=resolveDataPath('competition-format-registry','registry.v1.json'),before=fs.readFileSync(file),registry=JSON.parse(before);
 if(!validateCompetitionFormatRegistry(registry).ok)throw Error('primary_registry_preimage_invalid');
 const season=currentSeason(new Date(nowMs)),now=new Date(nowMs).toISOString(),changed=[],evidence=[];
 for(const slug of [...new Set(slugs)].filter(slug=>PRIMARY_COMPETITION_SOURCES[slug]).slice(0,4)){
  const index=registry.contracts.findIndex(row=>row.competition.slug===slug);if(index<0)continue;
  const old=registry.contracts[index];
  if(old.season?.reference===season&&old.authority?.scopes?.includes('TEAM_COUNT'))continue;
  const result=await acquire(slug,season,{searchFn:searchWeb,now});evidence.push(result);
  if(result.status!=='VERIFIED')continue;
  const candidate=contractWithPrimaryCount(old,result.proof);if(candidate){registry.contracts[index]=candidate;changed.push(slug);}
 }
 if(!changed.length)return {changed:false,writePaths:[],evidence};
 registry.coverage={contractCount:registry.contracts.length,enabledContractCount:registry.contracts.filter(c=>c.competition.enabled===true).length,
  disabledContractCount:registry.contracts.filter(c=>c.competition.enabled===false).length,
  teamCountAuthorityCount:registry.contracts.filter(c=>c.authority.scopes.includes('TEAM_COUNT')).length,
  phaseAuthorityCount:registry.contracts.filter(c=>c.authority.scopes.includes('PHASE_STRUCTURE')).length,
  unverifiedContractCount:registry.contracts.filter(c=>['UNVERIFIED','NO_BASELINE'].includes(c.authority.status)).length};
 registry.generatedAt=now;registry.registryVersion=now.slice(0,10)+'.'+(Number(registry.registryVersion.split('.').at(-1))+1);
 const validation=validateCompetitionFormatRegistry(registry);if(!validation.ok)throw Error('primary_registry_candidate_invalid:'+JSON.stringify(validation.issues));
 const standingsBefore=new Map(changed.map(slug=>{const f=resolveDataPath('standings',slug+'.json');return [f,fs.existsSync(f)?fs.readFileSync(f):null];}));
 try{
  fs.writeFileSync(file,JSON.stringify(registry,null,2)+'\n');
  const built=await buildStandingsDay(day,changed,{season});if(!built.ok)throw Error('primary_contract_standings_build_failed');
  return {changed:true,season,leagues:changed,evidence,standings:built.results,
   writePaths:['data/competition-format-registry/registry.v1.json',...changed.map(slug=>'data/standings/'+slug+'.json')]};
 }catch(error){fs.writeFileSync(file,before);for(const [f,bytes] of standingsBefore){if(bytes)fs.writeFileSync(f,bytes);else if(fs.existsSync(f))fs.unlinkSync(f);}throw error;}
}
