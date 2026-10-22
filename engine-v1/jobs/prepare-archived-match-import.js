import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {athensDayKey} from '../core/daykey.js';
import {isDisabledLeague} from '../source-discovery/disabled-leagues.js';
import {proposeArchivedMatchImport,planArchivedMatchImportBatch} from '../core/archived-match-page-import.js';

// Read-only preparation. Fresh provider pages are rechecked as one batch, then
// every intended write is emitted for review. No canonical truth is promoted.
export async function prepareArchivedMatchImport(manifest,{nowFn=()=>Date.now(),fetchFn=fetch,canonicalRows=[],finalRows=[]}={}) {
  if(manifest?.schema!=='ai-matchlab.archived-match-review-batch.v1'||!Array.isArray(manifest.candidates)||!manifest.candidates.length||manifest.candidates.length>100)throw Error('INVALID_ARCHIVED_IMPORT_MANIFEST');
  const proposals=[];
  // Four requests at a time, without creating independent writer jobs.
  for(let offset=0;offset<manifest.candidates.length;offset+=4){
    const results=await Promise.all(manifest.candidates.slice(offset,offset+4).map(async candidate=>{
      if(!candidate||!/^[A-Za-z0-9]{6,16}$/.test(candidate.providerMatchId||''))return {ok:false,reason:'INVALID_NATIVE_MATCH_ID',productionWrites:0};
      if(isDisabledLeague(candidate.leagueSlug))return {ok:false,reason:'DISABLED_COMPETITION',productionWrites:0};
      const url=`https://www.flashscore.com/match/${candidate.providerMatchId}/`;
      try{
        const response=await fetchFn(url,{signal:AbortSignal.timeout(20000),headers:{'user-agent':'Mozilla/5.0',accept:'text/html'}});
        if(!response.ok)return {ok:false,reason:'SOURCE_HTTP_'+response.status,productionWrites:0};
        const html=await response.text(),nowMs=nowFn();
        return proposeArchivedMatchImport({html,candidate,sourceUrl:url,acquiredAt:new Date(nowMs).toISOString(),nowMs});
      }catch(error){return {ok:false,reason:'SOURCE_ACQUISITION_FAILED',detail:error.message,productionWrites:0};}
    }));proposals.push(...results);
  }
  const batch=planArchivedMatchImportBatch(proposals,{canonicalRows,finalRows});
  // The normal 180-day reader must also receive the dated, exact-native
  // research records. It will revalidate these against committed finals.
  if(batch.ok)for(let i=0;i<proposals.length;i++){
    const p=proposals[i],c=manifest.candidates[i],acquiredAt=p.canonicalProposal.archivedSourceEvidence.acquiredAt,day=athensDayKey(new Date(acquiredAt));
    batch.files.push({path:`data/value-data-acquisition/${day}/${c.leagueSlug}.archived-${c.providerMatchId}.results.research.json`,mode:'CREATE_ONLY_AFTER_REVIEW',payload:{schema:'ai-matchlab.recent-results-research.v1',source:'flashscore',status:'RESULTS_AWAIT_IDENTITY_VALIDATION',leagueSlug:c.leagueSlug,acquiredAt,url:p.canonicalProposal.archivedSourceEvidence.sourceUrl,responseSha256:p.canonicalProposal.archivedSourceEvidence.sourceSha256,authorityPromotionAllowed:false,valueInputVerified:false,canonicalWrites:0,rows:[c]}});
  }
  return {schema:'ai-matchlab.archived-match-import-preparation.v1',generatedAt:new Date(nowFn()).toISOString(),manifestSha256:crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),productionWrites:0,authorityPromoted:false,proposals,batch};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [manifestPath,outputPath]=process.argv.slice(2);
  if(!manifestPath||!outputPath)throw Error('usage: node prepare-archived-match-import.js <review-manifest.json> <proposal-output.json>');
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8').replace(/^\uFEFF/,''));
  const report=await prepareArchivedMatchImport(manifest);
  fs.mkdirSync(path.dirname(outputPath),{recursive:true});fs.writeFileSync(outputPath,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({ok:report.batch.ok,proposedFiles:report.batch.files.length,productionWrites:0}));
  if(!report.batch.ok)process.exitCode=1;
}
