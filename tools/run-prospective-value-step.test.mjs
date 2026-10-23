import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runProspectiveValueStep} from './run-prospective-value-step.mjs';

test('a historical import cannot invoke either prospective producer after the queue crosses midnight',()=>{
  for(const action of ['repair','publish']){
    let called=false,message='';
    const result=runProspectiveValueStep(action,'2026-10-22',{today:'2026-10-23',run:()=>{called=true;},log:x=>message=x});
    assert.deepEqual(result,{status:0,skipped:true});
    assert.equal(called,false);
    assert.match(message,/past_day:2026-10-22/);
  }
});
test('current and next day retain the real producer and propagate its failure',()=>{
  for(const day of ['2026-10-23','2026-10-24']){
    const calls=[];
    assert.deepEqual(runProspectiveValueStep('publish',day,{today:'2026-10-23',run:(...args)=>{calls.push(args);return {status:7};}}),{status:7,skipped:false});
    assert.deepEqual(calls[0].slice(0,2),['bash',['tools/publish-unified-value-day.sh',day]]);
  }
  for(const day of ['2026-10-25','2026-02-30','bad'])assert.throws(()=>runProspectiveValueStep('publish',day,{today:'2026-10-23'}));
  assert.throws(()=>runProspectiveValueStep('arbitrary','2026-10-23'));
});
