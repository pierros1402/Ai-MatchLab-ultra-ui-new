import {canonicalTeamName} from '../storage/team-aliases-db.js';
import {resolveResearchCompetition} from '../odds/flashscore-league-map.js';
const key=(slug,name)=>slug+'\0'+String(canonicalTeamName(slug,name)||name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

// Reuse native team crosswalks already retained by the validated archived-match
// import. These remain provider identities; no global club identity is minted.
export function buildSourceBoundHistoryTeamIdentities(canonicalRows,observedNativeRows=[]){
 const map=new Map();let acceptedBindings=0;
 for(const row of canonicalRows){
  const p=row.archivedSourceEvidence;
  if(!p||!/^[a-f0-9]{64}$/.test(p.sourceSha256||'')||!/^[A-Za-z0-9]{8}$/.test(p.providerMatchId||'')
    ||row.providerIds?.flashscore!==p.providerMatchId||p.sourceUrl!==`https://www.flashscore.com/match/${p.providerMatchId}/`)continue;
  if(!['home','away'].every(side=>/^[A-Za-z0-9]{8}$/.test(p[side+'ProviderTeamId']||'')))continue;
  if(p.homeProviderTeamId===p.awayProviderTeamId)continue;
  for(const side of ['home','away']){
   const k=key(row.leagueSlug,row[side+'Team']),id=p[side+'ProviderTeamId'];
   const set=map.get(k)||new Map();set.set(id,p.sourceSha256);map.set(k,set);acceptedBindings++;
  }
 }
 for(const row of observedNativeRows){
  const source=row.sourceEvidence;
  if(row.source!=='flashscore-native-archive-feed'||row.scoreBasis!=='EXPLICIT_NATIVE_REGULAR_PLAYED_FINAL'
   ||row.providerStatus?.statusCode!=='3'||row.providerStatus?.statusDetailCode!=='3'
   ||row.providerIds?.flashscore!==row.id||!source||!/^[a-f0-9]{64}$/.test(source.sha256||'')
   ||!/^https:\/\/(?:www\.flashscore\.com\/football\/|2\.flashscore\.ninja\/2\/x\/feed\/)/.test(source.url||'')
   ||resolveResearchCompetition({leaguePath:row.providerLeaguePath,leagueName:row.leagueName})!==row.leagueSlug
   ||!['home','away'].every(side=>/^[A-Za-z0-9]{8}$/.test(row[side+'ProviderTeamId']||''))
   ||row.homeProviderTeamId===row.awayProviderTeamId)continue;
  for(const side of ['home','away']){const k=key(row.leagueSlug,row[side+'Team']),set=map.get(k)||new Map();set.set(row[side+'ProviderTeamId'],source.sha256);map.set(k,set);acceptedBindings++;}
 }
 return {acceptedBindings,ambiguousAliases:[...map].filter(([,v])=>v.size!==1).map(([k])=>k),resolveTeam:(slug,name)=>{
  const set=map.get(key(slug,name));if(!set||set.size!==1)return {ok:false,reason:set?'CONFLICTING_NATIVE_TEAM_BINDINGS':'NATIVE_TEAM_BINDING_ABSENT'};
  const [providerTeamId,sourceSha256]=[...set][0];
  return {ok:true,provider:'flashscore',providerTeamId,sourceSha256,teamScope:'APPROVED_SENIOR_COMPETITION'};
 }};
}
