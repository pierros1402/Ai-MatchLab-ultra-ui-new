// Transport rehearsal on actual tracked data bytes, not a Daily execution.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {inventoryDataTree} from '../core/daily-resume-complete-data-inventory.mjs';
import {capturePrepostDeltaToIsolatedArchive,verifyPrepostDeltaArchive} from '../core/daily-resume-prepost-delta-archive.mjs';
import {replayPrepostDeltaToIsolatedClone} from '../core/daily-resume-prepost-isolated-replay.mjs';
const [mode,rootArg,bundleArg,expectedCommit]=process.argv.slice(2);
assert.ok(['capture','restore'].includes(mode));
assert.match(expectedCommit,/^[a-f0-9]{40}$/);
const root=path.resolve(rootArg),bundle=path.resolve(bundleArg);
assert.ok(!bundle.startsWith(root+path.sep)&&bundle!==root);
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
assert.equal(git('rev-parse','HEAD'),expectedCommit);
assert.equal(git('status','--porcelain'),'');
const day='2026-11-24';
const old='data/value/2026-11-23.json', current='data/value/2026-11-24.json';
const manifest='data/deploy-snapshots/2026-11-24/manifest.json';
const added='data/value/stage20-transport-rehearsal.json';
const pins=[[old,'eec4a528539a6fc00215461d16375478a73c8875'],[current,'08b8402f5524c523347a48c192d149391786058e'],[manifest,'ff13146b798d0018ecb599a09f5c4c11f2adf15e']];
for(const [p,sha] of pins){assert.equal(git('rev-parse','HEAD:'+p),sha);assert.equal(git('hash-object','--no-filters',p),sha);}
assert.ok(!fs.existsSync(path.join(root,added)));
const json=(p)=>JSON.parse(fs.readFileSync(p,'utf8'));
if(mode==='capture'){
  fs.mkdirSync(bundle,{recursive:false});
  const before=inventoryDataTree(root,day);
  // Deliberately controlled sandbox delta: actual bytes, never a prediction.
  fs.copyFileSync(path.join(root,old),path.join(root,current));
  fs.copyFileSync(path.join(root,manifest),path.join(root,added),fs.constants.COPYFILE_EXCL);
  fs.unlinkSync(path.join(root,old));
  const after=inventoryDataTree(root,day);
  const receipt=capturePrepostDeltaToIsolatedArchive(root,path.join(bundle,'archive'),before,after);
  assert.equal(receipt.added,1);assert.equal(receipt.modified,1);assert.equal(receipt.deleted,1);
  for(const [name,value] of Object.entries({before,after,receipt}))fs.writeFileSync(path.join(bundle,name+'.json'),JSON.stringify(value));
  console.log(JSON.stringify({mode,baseline:before.manifestSha256,final:after.manifestSha256,checkpoint:receipt.checkpointSha256,productionResumeProven:false}));
}else{
  const before=json(path.join(bundle,'before.json')),after=json(path.join(bundle,'after.json')),receipt=json(path.join(bundle,'receipt.json'));
  const archive=path.join(bundle,'archive');
  const verified=verifyPrepostDeltaArchive(archive,before,after);
  assert.equal(verified.ok,true);assert.equal(verified.evidenceSha256,receipt.checkpointSha256);
  assert.equal(inventoryDataTree(root,day).manifestSha256,before.manifestSha256);
  const replay=replayPrepostDeltaToIsolatedClone({sourceRepoRoot:root,archiveRoot:archive,before,after});
  try{
    assert.equal(replay.completeFinalTreeParity,true);assert.equal(replay.checkpointSha256,receipt.checkpointSha256);
    assert.equal(replay.resumeAuthorized,false);assert.equal(replay.publicationAuthorized,false);
    assert.equal(git('status','--porcelain'),'');
    assert.equal(inventoryDataTree(root,day).manifestSha256,before.manifestSha256);
    console.log(JSON.stringify({...replay,mode,productionResumeProven:false}));
  }finally{fs.rmSync(replay.stagingClone,{recursive:true,force:true});}
}
