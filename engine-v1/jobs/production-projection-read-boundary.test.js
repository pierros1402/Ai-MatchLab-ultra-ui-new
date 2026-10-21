import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readVerifiedProductionPlan} from './build-value-plan-comparison-day.js';
import {validateProductionProjection} from '../value/unified-production-journal.js';
import {overlayProductionEvidenceDocumentReadView} from '../core/production-evidence-identity-overlay.js';
const fixture=new URL('./test-fixtures/production-projection/public-plan-2026-10-21.json',import.meta.url);
const day='2026-10-21';

test('real non-empty signed production plan is read unchanged before identity decoration',()=>{
  const before=fs.readFileSync(fixture);
  const original=JSON.parse(before);
  assert.equal(original.count,1);
  assert.doesNotThrow(()=>validateProductionProjection(original,day));
  const decorated=overlayProductionEvidenceDocumentReadView(original);
  assert.throws(()=>validateProductionProjection(decorated,day),/production_projection_invalid/,'reproduces the old generic read boundary');
  const read=readVerifiedProductionPlan(fixture,day);
  assert.deepEqual(read,original);
  assert.equal(read.picks[0].canonicalMatchId,'cid_kos2_mitrovica_liria_20261021');
  assert.deepEqual(read.picks[0].sourceScores,{A:0.751,A2:0.751});
  assert.deepEqual(fs.readFileSync(fixture),before);
});

test('raw reading still rejects wrong-day, changed selections and changed readiness',()=>{
  assert.throws(()=>readVerifiedProductionPlan(fixture,'2026-10-22'),/production_projection_invalid/);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'matchlab-signed-read-'));
  const file=path.join(dir,'plan.json');
  try{
    for(const mutate of [p=>{p.picks[0].pick='home';},p=>{p.dataReadiness.complete=true;},p=>{p.count=0;}]){
      const p=JSON.parse(fs.readFileSync(fixture));mutate(p);fs.writeFileSync(file,JSON.stringify(p));
      assert.throws(()=>readVerifiedProductionPlan(file,day),/production_projection_invalid/);
    }
    fs.writeFileSync(file,'{broken');assert.throws(()=>readVerifiedProductionPlan(file,day),SyntaxError);
  }finally{if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(dir);}
  assert.throws(()=>readVerifiedProductionPlan(path.join(dir,'missing.json'),day),/ENOENT/);
});
