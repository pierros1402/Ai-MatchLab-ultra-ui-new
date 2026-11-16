import {getLeagueCoverage} from '../../workers/_shared/leagues-coverage.js';

const fields=['id','dayKey','leagueSlug','kickoff_ms','homeTeam','awayTeam','scoreHome','scoreAway','status'];
const timestamp=row=>Number.isFinite(row.kickoff_ms)?row.kickoff_ms:Date.parse(row.kickoff||row.kickoffUtc);
const sameFact=(a,b)=>fields.every(k=>a[k]===b[k]);

// Adding a verified subset must preserve all existing facts. Ambiguous legacy
// identities remain held; an absent old row is never interpreted as a deletion.
export function planAdditiveHistoryDay(build,existing,{resolveTeam=()=>({ok:false}),resolveEvent=()=>({ok:false})}={}){
  const held=[],additions=[];
  if(!build.ok||build.errors?.length)return {ok:false,reason:'HISTORY_TRUTH_PARITY_REQUIRED',held:build.errors||[],additions:[]};
  if(existing.season!==build.season||!Array.isArray(existing.days)||existing.days.some(d=>!Array.isArray(d.rows))
      ||new Set(existing.days.map(d=>d.dayKey)).size!==existing.days.length)return {ok:false,reason:'HISTORY_STORE_SHAPE_CONFLICT',held:[],additions:[]};
  if(new Set(build.rows.map(r=>r.id)).size!==build.rows.length)return {ok:false,reason:'DUPLICATE_PROPOSED_ID',held:[],additions:[]};
  const all=existing.days.flatMap(d=>d.rows.map(row=>({row,storedDay:d.dayKey}))),prior=existing.days.find(d=>d.dayKey===build.dayKey)?.rows||[];
  const identity=(row,side)=>{
    const r=resolveTeam(row.leagueSlug,row[side+'Team']);
    if(r?.ok&&r.globalClubId)return 'global:'+r.globalClubId;
    // Official national-team IDs are a separate, explicit namespace. They
    // must never be written or presented as adjudicated global club IDs.
    if(r?.ok&&row.leagueSlug==='uefa.nations'&&r.provider==='uefa-official'
        &&r.teamScope==='NATIONAL_MEN_TEAM_A'&&/^\d+$/.test(r.providerTeamId||''))return 'uefa-national:'+r.providerTeamId;
    if(r?.ok&&r.provider==='flashscore'&&r.teamScope==='APPROVED_SENIOR_COMPETITION'
        &&/^[A-Za-z0-9]{8}$/.test(r.providerTeamId||'')&&/^[a-f0-9]{64}$/.test(r.sourceSha256||''))return 'flashscore:'+r.providerTeamId;
    return null;
  };
  const pair=(a,b)=>{
    const ae=resolveEvent(a),be=resolveEvent(b);
    if(ae?.ok&&be?.ok&&ae.canonicalId===a.id&&be.canonicalId===b.id
        &&[ae,be].every(e=>e.verifiedFinalTruth===true&&typeof e.eventKey==='string'&&e.eventKey&&/^[a-f0-9]{64}$/.test(e.sourceSha256||''))){
      if(ae.eventKey===be.eventKey)return 'SAME';
      const common=Object.keys(ae.providerIds||{}).filter(p=>['flashscore','espn'].includes(p)&&be.providerIds?.[p]);
      if(common.some(p=>ae.providerIds[p]===be.providerIds[p]))return 'SAME';
      // Two separately verified native fixtures from the same provider are
      // distinct event identities. This does not adjudicate global team IDs.
      if(common.length)return 'DISTINCT';
    }
    const ah=identity(a,'home'),aa=identity(a,'away'),bh=identity(b,'home'),ba=identity(b,'away');
    if(!ah||!aa||!bh||!ba)return 'UNKNOWN';
    if(new Set([ah,aa,bh,ba].map(v=>v.split(':')[0])).size!==1)return 'UNKNOWN';
    return (ah===bh&&aa===ba)||(ah===ba&&aa===bh)?'SAME':'DISTINCT';
  };
  for(const row of build.rows){
    const contract=row.truthContract;
    if(!getLeagueCoverage(row.leagueSlug)||row.dayKey!==build.dayKey||!row.id||!Number.isFinite(timestamp(row))
        ||![row.scoreHome,row.scoreAway].every(v=>Number.isInteger(v)&&v>=0)
        ||!['canonicalIdExact','athensDayExact','exactScoreParity','verifiedFinalTruth'].every(k=>contract?.[k]===true)){
      held.push({id:row.id,reason:'VERIFIED_MAPPED_HISTORY_FACT_REQUIRED'});continue;
    }
    const sameId=all.filter(old=>old.row.id===row.id);
    if(sameId.length){
      if(sameId.length!==1||sameId[0].storedDay!==build.dayKey||!sameFact(sameId[0].row,row))held.push({id:row.id,reason:'EXISTING_HISTORY_FACT_CONFLICT'});
      continue;
    }
    const nearby=all.filter(old=>old.row.leagueSlug===row.leagueSlug&&
      (!Number.isFinite(timestamp(old.row))||Math.abs(timestamp(old.row)-timestamp(row))<=48*3600000));
    const collision=nearby.map(old=>({old,pair:pair(row,old.row)})).find(c=>c.pair!=='DISTINCT');
    if(collision){held.push({id:row.id,existingId:collision.old.row.id,reason:collision.pair==='SAME'?
      'POSSIBLE_CROSS_PROVIDER_EVENT_DUPLICATE':'LEGACY_IDENTITY_RECONCILIATION_REQUIRED'});continue;}
    const withinBuild=additions.find(old=>old.leagueSlug===row.leagueSlug&&Math.abs(timestamp(old)-timestamp(row))<=48*3600000&&pair(old,row)!=='DISTINCT');
    if(withinBuild){held.push({id:row.id,existingId:withinBuild.id,reason:'PROPOSED_EVENT_IDENTITY_RECONCILIATION_REQUIRED'});continue;}
    additions.push(row);
  }
  // A day remains atomic. No subset is silently written around a conflict.
  if(held.length)return {ok:false,reason:'ADDITIVE_HISTORY_REVIEW_REQUIRED',held,additions:[],candidateAdditions:additions.length};
  const days=existing.days.map(d=>d.dayKey===build.dayKey?{...d,rows:[...d.rows,...additions],matchCount:d.rows.length+additions.length}:d);
  if(additions.length&&!days.some(d=>d.dayKey===build.dayKey))days.push({dayKey:build.dayKey,matchCount:additions.length,rows:additions});
  days.sort((a,b)=>a.dayKey.localeCompare(b.dayKey));
  return {ok:true,additions,preservedPriorRows:prior.length,document:additions.length?{...existing,days}:existing};
}
