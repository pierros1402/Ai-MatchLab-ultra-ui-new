import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {resolveDataPath} from '../storage/data-root.js';
import {buildSourceBoundHistoryEventIdentities} from '../core/source-bound-history-event-identities.js';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const historyRoot=resolveDataPath('history');
const canonicalRoot=resolveDataPath('canonical-fixtures');
const finalRoot=resolveDataPath('final-results');
const rows=[];
for(const name of fs.readdirSync(historyRoot).filter(n=>/^\d{4}-\d{4}\.json$/.test(n)).sort()){
 const doc=read(path.join(historyRoot,name));
 for(const day of doc.days||[])for(const row of day.rows||[])rows.push(row);
}
const entries=[];
for(const day of fs.readdirSync(canonicalRoot).filter(n=>/^\d{4}-\d{2}-\d{2}$/.test(n)).sort()){
 for(const name of fs.readdirSync(path.join(canonicalRoot,day)).filter(n=>n.endsWith('.json')).sort()){
  const bytes=fs.readFileSync(path.join(canonicalRoot,day,name));
  for(const canonical of JSON.parse(bytes).fixtures||[]){
   if(!/^cid_[a-zA-Z0-9_-]+$/.test(canonical.canonicalId||''))continue;
   const file=path.join(finalRoot,day,canonical.canonicalId+'.json');
   if(fs.existsSync(file))entries.push({canonical,final:read(file),sourceSha256:hash(bytes)});
  }
 }
}
const resolver=buildSourceBoundHistoryEventIdentities(entries);
const candidates=[],counts={},invalidReasons={},memoryById=new Map(),historyById=new Map();
for(const row of rows){const list=historyById.get(row.id)||[];list.push(row);historyById.set(row.id,list);}
const memoryRoot=resolveDataPath('league-memory','results');
for(const name of fs.readdirSync(memoryRoot).filter(n=>n.endsWith('.json')).sort()){
 const doc=read(path.join(memoryRoot,name));
 for(const [team,list] of Object.entries(doc.teams||{})){
  if(!Array.isArray(list))continue;
  for(const row of list){const id=row.matchId||row.id;if(!id)continue;const hits=memoryById.get(id)||[];hits.push({league:name.slice(0,-5),team,row});memoryById.set(id,hits);}
 }
}
const classifications={},memoryProofCounts={},unmatchedByStatus={};
for(const row of rows){
 const result=resolver.findAliasCandidates(row);
 const reason=result.ok?(result.requiresIndependentIdentityApproval?'ALIAS_CANDIDATE':'EXACT_ID'):result.reason;
 counts[reason]=(counts[reason]||0)+1;
 if(reason==='NO_EVENT'){const key=String(row.status??'MISSING');unmatchedByStatus[key]=(unmatchedByStatus[key]||0)+1;}
 if(reason==='INVALID_HISTORY_FACT'){
  const reasons=[];
  if(!row.id)reasons.push('MISSING_ID');
  if(!row.leagueSlug)reasons.push('MISSING_LEAGUE');
  if(!Number.isFinite(Number(row.kickoff_ms)||Date.parse(row.kickoff||row.kickoffUtc)))reasons.push('INVALID_KICKOFF');
  if(!row.homeTeam||!row.awayTeam)reasons.push('MISSING_TEAM');
  if(row.status!=='FT')reasons.push('STATUS_'+String(row.status??'MISSING'));
  for(const key of reasons)invalidReasons[key]=(invalidReasons[key]||0)+1;
 }
 if(reason==='ALIAS_CANDIDATE'){
  const sourceMemory=memoryById.get(row.id)||[],targetMemory=memoryById.get(result.canonicalId)||[],targetHistory=historyById.get(result.canonicalId)||[];
  const classification=JSON.stringify({targetHistory:targetHistory.length,sourceMemory:sourceMemory.length,targetMemory:targetMemory.length});
  classifications[classification]=(classifications[classification]||0)+1;
  const score=(v,n)=>v!==null&&v!==undefined&&v!==''&&Number.isInteger(Number(v))&&Number(v)===Number(n);
  const day=row.dayKey||String(row.kickoff||row.kickoffUtc||'').slice(0,10);
  const exact=(hit,ha,team,opp,gf,ga)=>hit.league===row.leagueSlug&&hit.team===team&&hit.row.opp===opp&&hit.row.date===day&&hit.row.ha===ha&&score(hit.row.gf,gf)&&score(hit.row.ga,ga);
  const home=sourceMemory.filter(h=>exact(h,'H',row.homeTeam,row.awayTeam,row.scoreHome,row.scoreAway));
  const away=sourceMemory.filter(h=>exact(h,'A',row.awayTeam,row.homeTeam,row.scoreAway,row.scoreHome));
  const memoryProof=sourceMemory.length===0?'NO_MEMORY':sourceMemory.length===2&&home.length===1&&away.length===1?'EXACT_RECIPROCAL_MEMORY':'MEMORY_REVIEW_REQUIRED';
  memoryProofCounts[memoryProof]=(memoryProofCounts[memoryProof]||0)+1;
  candidates.push({row,result,sourceMemory,targetMemory,targetHistory,classification,memoryProof,identityApproval:false});
 }else if(reason==='AMBIGUOUS_EVENT'||reason==='SCORE_CONFLICT')candidates.push({row,result});
}
const report={schema:'aiml.history-event-alias-audit.v1',historyRows:rows.length,verifiedEventCount:resolver.count,counts,invalidReasons,classifications,memoryProofCounts,unmatchedByStatus,candidates,writeAuthorized:false};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({...report,candidates:undefined}));
