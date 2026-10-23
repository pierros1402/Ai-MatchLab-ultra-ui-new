import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

export const valueDataRegressionTests=[
  'engine-v1/core/value-data-alarm.test.js',
  'engine-v1/core/value-data-readiness.test.js',
  'engine-v1/core/prematch-readiness-evidence.test.js',
  'engine-v1/core/prematch-verified-final-form.test.js',
  'engine-v1/core/value-publication-integrity.test.js',
  'engine-v1/core/value-publication-sync-preflight.test.js',
  'engine-v1/value/unified-production-journal.test.js',
  'engine-v1/core/archived-match-page-import.test.js',
  'engine-v1/jobs/apply-reviewed-archived-match-import.test.js',
  'engine-v1/odds/flashscore-research-competition.test.js',
  'engine-v1/source-discovery/recent-results-researcher.test.js',
  'engine-v1/source-discovery/team-history-researcher.test.js',
  'engine-v1/tests/history-preservation.test.js',
  'engine-v1/jobs/run-value-data-alarm-day.test.js',
  'engine-v1/jobs/prepare-verified-history-recovery.test.js',
  'engine-v1/core/verified-history-recovery-boundary.test.js',
  'tools/run-prospective-value-step.test.mjs'
];

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  // A regression process cannot enable the real checkout's automatic backups.
  const result=spawnSync(process.execPath,['--test',...valueDataRegressionTests],{
    stdio:'inherit',env:{...process.env,HISTORY_PRESERVATION_REQUIRED:'0'},windowsHide:true
  });
  if(result.error)throw result.error;
  process.exitCode=result.status??1;
}
