import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {getProjectRoot} from '../../engine-v1/storage/data-root.js';
import {validateH2HFoundationSync} from '../../engine-v1/core/derived-history-foundation.js';
import {verifyGlobalRecoveryProtection} from '../../engine-v1/jobs/reconcile-validated-history-stores.js';

const [checkpointDir,protectionDir,outputFile]=process.argv.slice(2);
if(!checkpointDir||!protectionDir||!outputFile)throw Error('CHECKPOINT_PROTECTION_OUTPUT_REQUIRED');
const root=getProjectRoot(),read=p=>JSON.parse(fs.readFileSync(p)),hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=read(path.join(checkpointDir,'RESULT_SHA256_MANIFEST.json'));
for(const e of manifest)assert.equal(hash(fs.readFileSync(path.join(checkpointDir,e.path))),e.sha256);
assert.equal(manifest.length,41);
const after=read(path.join(checkpointDir,'coverage-after.json'));
for(const e of after.provenance)assert.equal(hash(fs.readFileSync(path.join(root,e.path))),e.sha256,'checkpoint input changed: '+e.path);
const fixture=read(path.join(root,'engine-v1/tests/fixtures/july-2026-parity-evidence.json'));
const byPath=new Map(after.provenance.map(p=>[p.path,p]));
for(const e of fixture.provenance)assert.equal(e.sha256,byPath.get(e.path)?.sha256,'fixture is not checkpoint-bound: '+e.path);
const protection=verifyGlobalRecoveryProtection(root,protectionDir);
const h2h=validateH2HFoundationSync();assert.equal(h2h.ok,true);
assert.equal(h2h.current.outputs.fileCount,24473);
const priorH2H=read(path.join(checkpointDir,'h2h-rebuilt.json'));
assert.equal(h2h.current.foundationFingerprint,priorH2H.foundation.foundationFingerprint);
const report={schema:'aiml.restoration-final-readback.v1',ok:true,checkpointFilesVerified:manifest.length,
 checkpointDataFilesUnchanged:after.provenance.length,fixtureSourceFilesCheckpointBound:fixture.provenance.length,
 protection,h2h:{ok:h2h.ok,files:h2h.current.outputs.fileCount,foundationFingerprint:h2h.current.foundationFingerprint},
 canonicalRestorationRepeated:false,historyRowsAdded:0,commit:false,push:false,deploy:false};
fs.mkdirSync(path.dirname(outputFile),{recursive:true});fs.writeFileSync(outputFile,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
