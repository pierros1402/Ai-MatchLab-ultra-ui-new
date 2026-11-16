import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getProjectRoot} from '../storage/data-root.js';
import {buildHistoryDayFromTruth} from './append-finalized-day-to-history.js';
import {getProductionIdentityResolver} from '../core/production-identity-resolver-runtime.js';
import {planAdditiveHistoryDay} from '../core/additive-history-recovery.js';

const fields=['id','dayKey','leagueSlug','kickoff_ms','homeTeam','awayTeam','scoreHome','scoreAway','status'];
const tally=rows=>rows.reduce((a,r)=>(a[r.reason]=(a[r.reason]||0)+1,a),{});

export function auditHistoryRecoveryHolds({root=getProjectRoot()}={}){
  if(path.resolve(root)!==path.resolve(getProjectRoot()))throw Error('HOLD_AUDIT_REQUIRES_BOUND_PROJECT_ROOT');
  const ledger=JSON.parse(fs.readFileSync(path.join(root,'data/history-coverage/recovery-ledger.json'),'utf8'));
  const history={};
  const resolver=getProductionIdentityResolver(),days=[],teamCache=new Map();
  const resolveTeam=(leagueSlug,alias)=>{
    const key=JSON.stringify([leagueSlug,alias]);
    if(!teamCache.has(key))teamCache.set(key,resolver.resolveTeamReference({leagueSlug,alias}));
    return teamCache.get(key);
  };
  for(const [dayKey,entry] of Object.entries(ledger).filter(([,r])=>!r.ok).sort()){
    const build=buildHistoryDayFromTruth(dayKey);
    if(!build.season){days.push({dayKey,ledgerReason:entry.reason,buildReason:build.reason,errorReasons:tally(build.errors||[])});continue;}
    if(!history[build.season])history[build.season]=JSON.parse(fs.readFileSync(path.join(root,'data/history',build.season+'.json'),'utf8'));
    const store=history[build.season],prior=store.days.find(d=>d.dayKey===dayKey)?.rows||[];
    const proposed=new Map(build.rows.map(r=>[r.id,r]));
    const absent=prior.filter(r=>!proposed.has(r.id)).map(row=>{
      const resolution=resolver.resolveFixtureId(row.id);
      return {id:row.id,leagueSlug:row.leagueSlug,homeTeam:row.homeTeam,awayTeam:row.awayTeam,
        resolvedFixtureId:resolution?.ok?resolution.resolvedFixtureId:null,
        resolvedIdInBuild:resolution?.ok?proposed.has(resolution.resolvedFixtureId):false};
    });
    const conflicts=prior.filter(r=>proposed.has(r.id)).flatMap(old=>{
      const next=proposed.get(old.id),changed=fields.filter(k=>old[k]!==next[k]);
      return changed.length?[{id:old.id,changed,before:Object.fromEntries(changed.map(k=>[k,old[k]])),after:Object.fromEntries(changed.map(k=>[k,next[k]]))}]:[];
    });
    const otherDayCollisions=store.days.filter(d=>d.dayKey!==dayKey).flatMap(d=>d.rows.filter(r=>proposed.has(r.id)).map(r=>({id:r.id,existingDay:d.dayKey})));
    const additive=planAdditiveHistoryDay(build,store,{resolveTeam});
    days.push({dayKey,season:build.season,ledgerReason:entry.reason,buildOK:build.ok,buildReason:build.reason,
      acceptedRows:build.rows.length,priorRows:prior.length,newIds:build.rows.filter(r=>!prior.some(p=>p.id===r.id)).length,
      absentPriorRows:absent.length,absent,conflictingPriorRows:conflicts.length,conflicts,otherDayCollisions,
      errorReasons:tally(build.errors||[]),errors:build.errors||[],
      additiveReadiness:{ok:additive.ok,reason:additive.reason||null,additionalRows:additive.additions.length,held:additive.held}});
  }
  return {schema:'ai-matchlab.history-recovery-hold-audit.v1',generatedAt:new Date().toISOString(),days,
    summary:{heldDays:days.length,ledgerReasons:days.reduce((a,r)=>(a[r.ledgerReason]=(a[r.ledgerReason]||0)+1,a),{}),
      absentPriorRows:days.reduce((n,d)=>n+(d.absentPriorRows||0),0),conflictingPriorRows:days.reduce((n,d)=>n+(d.conflictingPriorRows||0),0),
      otherDayCollisions:days.reduce((n,d)=>n+(d.otherDayCollisions?.length||0),0),
      additiveReadyDays:days.filter(d=>d.additiveReadiness?.ok).length,
      additiveReadyRows:days.reduce((n,d)=>n+(d.additiveReadiness?.additionalRows||0),0),
      additiveHoldReasons:days.flatMap(d=>d.additiveReadiness?.held||[]).reduce((a,r)=>(a[r.reason]=(a[r.reason]||0)+1,a),{}),
      errorReasons:days.flatMap(d=>d.errors||[]).reduce((a,r)=>(a[r.reason]=(a[r.reason]||0)+1,a),{})},
    productionWrites:0,fullCoverageCertified:false};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  const result=auditHistoryRecoveryHolds(),output=process.argv[2];
  if(!output)throw Error('HOLD_AUDIT_OUTPUT_REQUIRED');
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result.summary));
}
