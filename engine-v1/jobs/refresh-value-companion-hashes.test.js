import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {snapshotCompanionFileHashes} from './refresh-value-artifacts-day.js';
import {canonicalBufferSha256} from '../core/deploy-snapshot-release-contract.js';
test('Value refresh binds both existing companion files without changing their bytes',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'matchlab-companion-hashes-'));
 try {
  const files={planCShadow:'plan-c-shadow.json',planCShadowAudit:'plan-c-shadow-audit.json'};
  const bytes=Buffer.from('{"frozen":true}\r\n');
  for(const name of Object.values(files))fs.writeFileSync(path.join(root,name),bytes);
  const hashes=snapshotCompanionFileHashes(root,files);
  for(const name of Object.values(files)){assert.equal(hashes[name],canonicalBufferSha256(bytes));assert.deepEqual(fs.readFileSync(path.join(root,name)),bytes);}
  assert.deepEqual(snapshotCompanionFileHashes(root,{}),{});
  assert.throws(()=>snapshotCompanionFileHashes(root,{planCShadow:'../escape.json'}),/name_invalid/);
  fs.unlinkSync(path.join(root,files.planCShadowAudit));
  assert.throws(()=>snapshotCompanionFileHashes(root,files),/ENOENT/);
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});
