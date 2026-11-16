import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {getProjectRoot} from '../storage/data-root.js';
import {preflightHistoryJournal} from './run-global-history-coverage-day.js';
import {getLeagueCoverage} from '../../workers/_shared/leagues-coverage.js';

// These are source discovery captures, not a complete competition baseline.
// Raw responses never enter canonical fixtures, history or published picks.
export const HISTORY_OFFICIAL_SOURCE_PROBES=Object.freeze([
  {slug:'uefa.nations',edition:'2026-2027',kind:'RESULTS_AND_FUTURE_FIXTURES',
    url:'https://www.uefa.com/uefanationsleague/news/02a2-1fea18abbcbc-456e846509e7-1000--2026-uefa-nations-league-all-the-league-phase-fixtures-a/'},
  {slug:'uefa.nations',edition:'2024-2025',kind:'RESULTS_AND_PLAYOFFS',
    url:'https://www.uefa.com/uefanationsleague/news/028a-1a23b4c739a8-07fe752f503f-1000/'},
  {slug:'fra.coupe_de_france',edition:'2025-2026',kind:'ROUND_7_RESULTS_REQUIRING_STATUS_REVIEW',
    url:'https://www.fff.fr/article/15734-7e-tour-tous-les-resultats.html'},
]);

export async function probeHistoryRecoveryEnvironment(){
  const journal=await preflightHistoryJournal(getProjectRoot());
  const output=await fs.mkdtemp(path.join(os.tmpdir(),'AIML_OFFICIAL_HISTORY_CAPTURE_'));
  const sources=await Promise.all(HISTORY_OFFICIAL_SOURCE_PROBES.map(async source=>{
    if(!getLeagueCoverage(source.slug))throw Error('SOURCE_COMPETITION_OUTSIDE_APPROVED_MAP');
    try{
      const response=await fetch(source.url,{signal:AbortSignal.timeout(20000),redirect:'error'});
      if(!response.ok)throw Error(`HTTP_${response.status}`);
      const body=Buffer.from(await response.arrayBuffer());
      const sha256=crypto.createHash('sha256').update(body).digest('hex');
      const file=path.join(output,sha256+'.html');
      await fs.writeFile(file,body,{flag:'wx'});
      return {...source,ok:true,capturedAt:new Date().toISOString(),sha256,bytes:body.length,file,
        contentType:response.headers.get('content-type'),authorityPromotionAllowed:false};
    }catch(error){return {...source,ok:false,reason:error.cause?.code||error.code||error.message,authorityPromotionAllowed:false};}
  }));
  const report={schema:'ai-matchlab.history-environment-probe.v1',root:getProjectRoot(),
    generatedAt:new Date().toISOString(),journal,sources,output,
    fullCoverageCertified:false,historyChanged:false,predictionsChanged:false,
    verdict:journal.ok&&sources.every(source=>source.ok)?'READY_FOR_SOURCE_VALIDATION':'BLOCKED'};
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  return report;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  const report=await probeHistoryRecoveryEnvironment();
  console.log(JSON.stringify(report,null,2));
  process.exitCode=report.verdict==='BLOCKED'?1:0;
}
