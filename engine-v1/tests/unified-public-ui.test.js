import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function panel(payload){
 const body={innerHTML:''},head={innerHTML:''},handlers={};
 const root={isConnected:true,getBoundingClientRect:()=>({width:500,height:500}),querySelector:s=>s==='.value-head-wrap'?head:s==='#value-picks-list'?body:null};
 const window={on:(k,fn)=>handlers[k]=fn,getComputedStyle:()=>({display:'block',visibility:'visible'}),AIML_PANEL:{set:()=>{}}};
 const document={querySelectorAll:()=>[root],querySelector:()=>root};
 vm.runInNewContext(fs.readFileSync(new URL('../../assets/js/ui/value-picks.js',import.meta.url),'utf8'),{window,document,console:{log(){},warn(){}},setTimeout:()=>{},Date,Intl});
 handlers['value:update'](payload);return head.innerHTML+body.innerHTML;
}
const day='2026-10-18';
test('one public card is rendered without requiring four visible plan payloads',()=>{
 const html=panel({date:day,unifiedPlan:{id:'plan-u1',date:day,status:'AVAILABLE',count:1,upstreamCoverage:'INCOMPLETE',summary:{picks:1},picks:[{unified:true,homeTeam:'Home',awayTeam:'Away',market:'OU25',pick:'over',kickoffUtc:day+'T18:00:00Z'}]}});
 assert.equal((html.match(/class="value-plan-card"/g)||[]).length,1);
 assert.match(html,/Home/);assert.match(html,/τροφοδότηση δεδομένων δεν είναι πλήρης/);assert.doesNotMatch(html,/Plan A|Plan B|LOW|0%/);
});
test('missing or wrong-day unified output is unavailable rather than showing old plans or successful zero',()=>{
 for(const unifiedPlan of [null,{id:'plan-u1',date:'2026-10-17',status:'AVAILABLE',picks:[],count:0}]){
  const html=panel({date:day,unifiedPlan,comparison:{plans:{A:{picks:[]},A2:{picks:[]},B:{picks:[]},B2:{picks:[]}}}});
  assert.equal((html.match(/class="value-plan-card"/g)||[]).length,1);assert.match(html,/N\/A/);assert.doesNotMatch(html,/No qualifying picks|Plan A|Plan B/);
 }
});
test('historical dates retain the original four-plan presentation',()=>{
 const html=panel({date:'2026-10-17',comparison:{plans:Object.fromEntries(['A','A2','B','B2'].map(k=>[k,{picks:[],count:0}]))}});
 assert.equal((html.match(/class="value-plan-card"/g)||[]).length,4);
});

test('incomplete zero is insufficient data, never a completed no-value result',()=>{
 const html=panel({date:day,unifiedPlan:{id:'plan-u1',date:day,status:'AVAILABLE',analysisComplete:false,count:0,picks:[]}});
 assert.match(html,/Ανεπαρκή δεδομένα/);assert.doesNotMatch(html,/No qualifying picks/);
});
