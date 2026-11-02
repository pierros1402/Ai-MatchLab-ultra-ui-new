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
 assert.match(html,/Home/);assert.match(html,/Δεν έχει επιβεβαιωθεί πλήρης κάλυψη αξιολόγησης/);assert.doesNotMatch(html,/Plan A|Plan B|LOW|0%/);
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

function currentPlan(overrides={}) { return {id:'plan-u1',date:day,status:'AVAILABLE',count:1,analysisComplete:true,upstreamCoverage:'COMPLETE',summary:{picks:1,settled:0,wins:0,losses:0,unresolved:1},picks:[{unified:true,homeTeam:'Home',awayTeam:'Away',market:'OU25',pick:'over',kickoffUtc:day+'T18:00Z'}],...overrides}; }
test('complete inputs with unplayed picks and zero settled never produce an input warning',()=>{
 const html=panel({date:day,unifiedPlan:currentPlan({dataReadiness:{status:'COMPLETE',complete:true,applicable:9,ready:9,insufficient:0,byReason:{}}})});
 assert.match(html,/0 settled/);assert.match(html,/Home/);assert.doesNotMatch(html,/data-value-coverage|με ελλείψεις|Δεν έχει επιβεβαιωθεί/);
});
test('partial inputs expose the actual coverage denominator and overlapping causes, without changing picks',()=>{
 const payload={date:day,unifiedPlan:currentPlan({analysisComplete:false,upstreamCoverage:'INCOMPLETE',dataReadiness:{status:'PARTIAL',complete:false,applicable:133,ready:91,insufficient:42,byReason:{minimum_recent_sample:39,missing_model_assessment:11}}})};const before=JSON.stringify(payload);const html=panel(payload);
 assert.match(html,/91\/133 αγώνες έτοιμοι/);assert.match(html,/42 με ελλείψεις/);assert.match(html,/Ανεπαρκές πρόσφατο ιστορικό: 39/);assert.match(html,/Απουσία αποθηκευμένης αξιολόγησης: 11/);assert.match(html,/επικαλύπτονται/);assert.match(html,/0 settled/);assert.match(html,/Home/);assert.equal(JSON.stringify(payload),before);
});
test('missing inputs and incomplete empty selections never certify a zero-pick day',()=>{
 const html=panel({date:day,unifiedPlan:currentPlan({analysisComplete:false,count:0,picks:[],dataReadiness:{status:'INSUFFICIENT_DATA',complete:false,applicable:5,ready:0,insufficient:5,byReason:{details_missing:5}}})});
 assert.match(html,/0\/5 αγώνες έτοιμοι/);assert.match(html,/Απουσία στοιχείων αγώνα: 5/);assert.doesNotMatch(html,/No qualifying picks/);
});
test('unavailable plan stays unavailable without presenting a coverage claim or successful zero',()=>{
 const html=panel({date:day,unifiedPlan:{id:'plan-u1',date:day,status:'NOT_AVAILABLE',analysisComplete:false,count:0,picks:[]}});
 assert.match(html,/N\/A/);assert.doesNotMatch(html,/data-value-coverage|No qualifying picks/);
});
test('malformed coverage counters cannot be presented as verified quantitative coverage',()=>{
 for(const readiness of [{applicable:3,ready:4,insufficient:0},{applicable:3,ready:2,insufficient:2},{applicable:3,ready:-1,insufficient:4}]) {
 const html=panel({date:day,unifiedPlan:currentPlan({analysisComplete:false,dataReadiness:readiness})});assert.match(html,/Δεν έχει επιβεβαιωθεί/);assert.doesNotMatch(html,/αγώνες έτοιμοι/);
 }
});
