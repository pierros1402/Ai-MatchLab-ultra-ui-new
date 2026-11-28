import fs from "node:fs";
import path from "node:path";
import { athensDayKey, athensDayFromKickoff } from "../core/daykey.js";
import { buildMatchKey } from "../core/normalize.js";
import { parseFlashscoreExactKickoffPage, validateEspnExactKickoffEvidence } from "../core/exact-provider-kickoff-evidence.js";
import { fetchFlashscoreFixtures } from "../odds/flashscore-fixtures-source.js";
import { resolveFlashscoreCompetitionIdentity } from "../core/flashscore-competition-identity.js";
import { isDisabledLeague } from "../source-discovery/disabled-leagues.js";
import { resolveDataPath } from "../storage/data-root.js";
const day=process.argv[2]||athensDayKey(),write=process.argv.includes("--write");
if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error("invalid_kickoff_reconciliation_day");
const offset=Math.round((Date.parse(day+"T12:00Z")-Date.parse(athensDayKey()+"T12:00Z"))/86400000);
const feed=await fetchFlashscoreFixtures({offsets:[offset]});
if(feed.ok!==true)throw Error("independent_kickoff_feed_unavailable");
const byId=new Map(),duplicates=new Set();
for(const row of feed.rows){const id=String(row.matchId);if(byId.has(id))duplicates.add(id);byId.set(id,row);}
const root=resolveDataPath("canonical-fixtures",day),changed=[],verified=[],errors=[];
for(const file of fs.readdirSync(root).filter(f=>f.endsWith(".json")).sort()){
 const pathname=path.join(root,file),payload=JSON.parse(fs.readFileSync(pathname,"utf8"));let dirty=false;
 payload.fixtures=(payload.fixtures||[]).map(c=>({...c}));
 for(const c of payload.fixtures){
  const id=String(c.providerIds?.flashscore||""),raw=byId.get(id);
  if(duplicates.has(id)||!raw||isDisabledLeague(c.leagueSlug)||c.hasConflict||c.providerTeamIdentityConflict)continue;
  if(Date.parse(c.kickoffUtc)===Date.parse(raw.kickoffUtc))continue;
  const identity=resolveFlashscoreCompetitionIdentity(raw);
  if(identity.canonicalSlug!==c.leagueSlug||athensDayFromKickoff(raw.kickoffUtc)!==day||
    athensDayFromKickoff(c.kickoffUtc)!==day)continue;
  const pair=c.providerTeamIds?.flashscore;
  if(!pair||pair.home!==raw.homeProviderTeamId||pair.away!==raw.awayProviderTeamId)continue;
  const f={providerFixtureId:id,providerCompetitionId:String(raw.leagueId||raw.tournamentId||raw.competitionId||""),
   dayKey:day,kickoffUtc:raw.kickoffUtc,home:{providerTeamId:raw.homeProviderTeamId},away:{providerTeamId:raw.awayProviderTeamId}};
  const evidence={schema:"ai-matchlab.exact-provider-kickoff.v1",provider:c.source,canonicalId:c.canonicalId,
   leagueSlug:c.leagueSlug,dayKey:day,providerFixtureId:id,observedAt:new Date().toISOString(),
   independentKickoffUtc:raw.kickoffUtc,independentNativeIds:pair};
  try{
   let kickoff;
   if(c.source==="espn"&&/^\d+$/.test(c.providerIds?.espn||"")){
    const url="https://site.api.espn.com/apis/site/v2/sports/soccer/"+encodeURIComponent(c.providerLeagueSlug||c.leagueSlug)+"/summary?event="+c.providerIds.espn;
    const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw Error("exact_espn_summary_http_"+response.status);
    const body=await response.json();evidence.header=body.header;evidence.sourceUrl=url;
    const proof=validateEspnExactKickoffEvidence(c,evidence,day);
    if(!proof.ok)throw Error(proof.reason);kickoff=proof.kickoffUtc;
   }else if(c.source==="flashscore"){
    const response=await fetch("https://www.flashscore.com/match/"+encodeURIComponent(id)+"/",
      {signal:AbortSignal.timeout(20000),headers:{"user-agent":"Mozilla/5.0","accept-language":"en-US,en;q=0.9"}});
    if(!response.ok)throw Error("exact_match_page_http_"+response.status);
    const proof=parseFlashscoreExactKickoffPage(await response.text(),f);
    if(!proof.ok)throw Error(proof.reason);evidence.primaryProof=proof;evidence.sourceUrl=proof.sourceUrl;kickoff=proof.kickoffUtc;
   }else continue;
   const before=c.kickoffUtc;
   c.exactProviderKickoffEvidence=evidence;
   if(Date.parse(before)!==Date.parse(kickoff)){
    c.kickoffUtc=kickoff;
    if(typeof c.matchKey==="string"&&c.matchKey.includes("|"))c.matchKey=buildMatchKey(c);
    changed.push({canonicalId:c.canonicalId,before,after:kickoff});
   }
   verified.push({canonicalId:c.canonicalId,primary:kickoff,independent:raw.kickoffUtc});
   dirty=true;
  }catch(error){errors.push({canonicalId:c.canonicalId,error:String(error.message)});}
 }
 if(dirty&&write)fs.writeFileSync(pathname,JSON.stringify(payload,null,2)+"\n");
}
console.log(JSON.stringify({dayKey:day,write,changed,verified,errors},null,2));
if(errors.length)process.exitCode=1;
