import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {currentSeason,seasonBefore} from '../core/season.js';
import {resolveDataPath} from '../storage/data-root.js';
import {filterHistoryCompetitionRows,HISTORY_COMPETITION_POLICY} from '../core/history-competition-provenance.js';
import {computeCurrentHistoryFingerprintSync,computeModelPriorsSourceFingerprintSync,validateHistoryIndexFoundationSync,validateModelPriorsFoundationSync,validateH2HFoundationSync} from '../core/derived-history-foundation.js';
import {buildCurrentSeasonIndexes} from './build-current-season-indexes.js';
import {buildModelPriors} from './build-model-priors.js';
import {rebuildH2HFoundationFromCurrentHistory} from './rebuild-h2h-foundation-from-current-history.js';
import {buildStandingsDay} from './build-standings-day.js';
import {readHistoryRows} from '../core/standings-foundation.js';

export async function repairHistoryCompetitionFoundations(day,{apply=false}={}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('invalid_day_key');
 const season=currentSeason(new Date(`${day}T12:00Z`));
 const seasons=[seasonBefore(season),season].filter(s=>fs.existsSync(resolveDataPath('history',`${s}.json`)));
 if(!seasons.includes(season))throw Error('current_history_missing');
 const before={history:computeCurrentHistoryFingerprintSync().sha256,priorsSource:computeModelPriorsSourceFingerprintSync().sha256};
 const report={schema:'ai-matchlab.history-competition-recovery.v1',day,generatedAt:new Date().toISOString(),policy:HISTORY_COMPETITION_POLICY,apply,sourceBefore:before,allLeagueDataCertified:false,frozenPredictionsRegenerated:false,rawHistoryChanged:false,seasons:{},rebuilds:[]};
 for(const s of seasons){
  const rows=readHistoryRows(s);report.seasons[s]=filterHistoryCompetitionRows(rows).summary;
 }
 if(apply){
  for(const s of seasons)if(!validateHistoryIndexFoundationSync(s).ok){
   const result=await buildCurrentSeasonIndexes({season:s,dayKey:day});
   if(!result.ok||!validateHistoryIndexFoundationSync(s).ok)throw Error('competition_index_rebuild_failed');
   report.rebuilds.push({kind:'history-index',season:s,matchCount:result.matchCount});
  }
  if(!validateModelPriorsFoundationSync(season).ok){
   const result=await buildModelPriors({targetSeason:season});
   if(!result.ok||!validateModelPriorsFoundationSync(season).ok)throw Error('competition_priors_rebuild_failed');
   report.rebuilds.push({kind:'model-priors',season});
  }
  if(!validateH2HFoundationSync().ok){
   const result=rebuildH2HFoundationFromCurrentHistory();
   if(!result.ok)throw Error('competition_h2h_rebuild_failed');
   report.rebuilds.push({kind:'h2h',artifactCount:result.artifactCount});
  }
  if(report.rebuilds.length){
   const standings=await buildStandingsDay(day,[],{season});
   if(!standings.ok)throw Error('competition_standings_rebuild_failed');
   report.standings=standings;
  }
 }
 report.sourceAfter={history:computeCurrentHistoryFingerprintSync().sha256,priorsSource:computeModelPriorsSourceFingerprintSync().sha256};
 if(JSON.stringify(before)!==JSON.stringify(report.sourceAfter))throw Error('immutable_history_source_changed');
 if(apply){
  const target=resolveDataPath('history-index','competition-validation',`${day}.recovery.json`);
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');
 }
 return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=await repairHistoryCompetitionFoundations(process.argv[2],{apply:process.argv.includes('--apply')});
 console.log(JSON.stringify(result,null,2));
}
