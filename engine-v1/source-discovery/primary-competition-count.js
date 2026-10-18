import crypto from 'node:crypto';
export const PRIMARY_COMPETITION_SOURCES=Object.freeze({
 'eng.1':{domain:'premierleague.com',publisher:'Premier League',seed:'https://www.premierleague.com/en/news/4725682/all-20-premier-league-clubs-squad-numbers-for-202627-season'},
 'esp.1':{domain:'laliga.com',publisher:'LALIGA',seed:'https://www.laliga.com/en-DE/laliga-easports/clubs'},
 'fra.1':{domain:'ligue1.com',publisher:'Ligue de Football Professionnel',seed:'https://ligue1.com/fr/articles/l1_article_5293-les-dates-de-reprise-des-clubs-de-l1-2627'},
 'gre.1':{domain:'slgr.gr',publisher:'Super League Greece',seed:'https://www.slgr.gr/el/teams/'}
});
function allowed(url,profile){try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&[profile.domain,'www.'+profile.domain].includes(u.hostname);}catch{return false;}}
export function parsePrimaryCompetitionCount({slug,season,url,html,retrievedAt}){
 const profile=PRIMARY_COMPETITION_SOURCES[slug];if(!profile||!allowed(url,profile))throw Error('primary_source_domain_invalid');
 if(!/^\d{4}-\d{4}$/.test(season)||Number(season.slice(5))!==Number(season.slice(0,4))+1)throw Error('primary_season_invalid');
 const year=season.slice(0,4),end=season.slice(5),short=end.slice(-2),source=String(html);
 if(source.length>4000000)throw Error('primary_response_too_large');
 const seasonPattern=new RegExp(`${year}\\s*[/–-]\\s*(?:${end}|${short})`);
 const clean=text=>text.replace(/<[^>]*>/g,' ').replace(/&[^;]+;/g,' ').replace(/\s+/g,' ').trim();
 const blocks=[...source.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').matchAll(/<(title|h[1-3]|p)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(m=>clean(m[2]));
 const currentBlocks=blocks.filter(text=>seasonPattern.test(text));
 if(!currentBlocks.length)throw Error('primary_current_season_not_proven');
 const counts=new Set();
 if(slug==='esp.1'){
  const clubs=new Set([...source.matchAll(/href=["'](?:https:\/\/www\.laliga\.com)?\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?clubs\/([a-z0-9-]+)\/squad["']/g)].map(m=>m[1]));
  if(clubs.size>=4&&clubs.size<=64)counts.add(clubs.size);
 }
 for(const block of currentBlocks)for(const hit of block.matchAll(/\b(\d{1,2})\s+(?:(?:Premier League|Ligue 1(?: McDonald.s)?|LALIGA EA SPORTS)\s+)?(?:clubs|teams|équipes|ομάδες)\b/gi))counts.add(Number(hit[1]));
 if(counts.size!==1)throw Error('primary_team_count_missing_or_conflicting');
 const count=[...counts][0];if(count<4||count>64)throw Error('primary_team_count_outside_bounds');
 return {slug,season,count,publisher:profile.publisher,url,retrievedAt,sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),
  verifiedScope:'TEAM_COUNT',otherScopesVerified:false};
}
export async function acquirePrimaryCompetitionCount(slug,season,{fetchFn=fetch,searchFn,now=new Date().toISOString()}={}){
 const profile=PRIMARY_COMPETITION_SOURCES[slug];if(!profile)return {status:'NO_REVIEWED_PRIMARY_ADAPTER',slug,season};
 const failures=[];let urls=[profile.seed];
 const attempt=async url=>{
  if(!allowed(url,profile))return null;
  try{const response=await fetchFn(url,{signal:AbortSignal.timeout(12000),redirect:'error',headers:{'User-Agent':'MatchLab source verification','Accept':'text/html'}});
   if(!response.ok)throw Error('primary_http_'+response.status);
   const text=await response.text();return parsePrimaryCompetitionCount({slug,season,url,html:text,retrievedAt:now});
  }catch(error){failures.push({url,reason:error.message});return null;}
 };
 for(const url of urls){const proof=await attempt(url);if(proof)return {status:'VERIFIED',proof};}
 if(searchFn){const found=await searchFn(`site:${profile.domain} "${season.slice(0,4)+'/'+season.slice(-2)}" clubs teams`);
  for(const item of (Array.isArray(found)?found:found?.results||[]).slice(0,4)){const proof=await attempt(item.url);if(proof)return {status:'VERIFIED',proof};}
 }
 return {status:'PRIMARY_CURRENT_SEASON_EVIDENCE_UNAVAILABLE',slug,season,failures};
}
