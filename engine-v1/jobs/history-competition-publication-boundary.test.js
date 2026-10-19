import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('the actual publication guard permits all derived outputs and rejects raw history and forecasts',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'matchlab-competition-boundary-'));
 const write=p=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,'{}\n');};
 const git=args=>execFileSync('git',args,{cwd:root,stdio:'pipe'});
 try{
  git(['init','--quiet']);write('data/h2h/obsolete.json');git(['add','.']);
  git(['-c','user.name=Test','-c','user.email=test@example.invalid','-c','commit.gpgsign=false','commit','-qm','baseline']);
  fs.unlinkSync(path.join(root,'data/h2h/obsolete.json'));
  const allowed=['data/history-index/team-form/2026-2027.json','data/history-index/league-form/2026-2027.json','data/history-index/matchups/2026-2027.json','data/history-index/foundation/2026-2027.json','data/history-index/competition-validation/2026-10-19.recovery.json','data/model-priors/2026-2027.json','data/model-priors/foundation/2026-2027.json','data/h2h/new.json','data/h2h-foundation/current.json','data/standings/eng.1.json'];
  allowed.forEach(write);git(['add','-A']);
  const script=fs.readFileSync(new URL('../../tools/persist-history-competition-recovery.sh',import.meta.url),'utf8');
  const pattern=script.match(/--allow='([^']+)'/)[1];
  const guard=fileURLToPath(new URL('./guard-staged-data-boundary.js',import.meta.url));
  const run=()=>spawnSync(process.execPath,[guard,'--dayKey=2026-10-19','--allow-data-deletions',`--allow=${pattern}`],{cwd:root,encoding:'utf8'});
  const pass=run();assert.equal(pass.status,0,pass.stdout+pass.stderr);
  for(const forbidden of ['data/history/2026-2027.json','data/value-plans/2026-10-19/plan-a.json']){
   write(forbidden);git(['add',forbidden]);const blocked=run();assert.notEqual(blocked.status,0);assert.match(blocked.stdout+blocked.stderr,/path_outside_allowlist/);git(['reset','--',forbidden]);
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
