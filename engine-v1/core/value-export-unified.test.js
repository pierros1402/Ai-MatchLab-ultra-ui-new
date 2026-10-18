import test from 'node:test';
import assert from 'node:assert/strict';
import {comparisonToValueExportDay,buildValueExportReport,fallbackPlanAToValueExportDay} from './value-export-report.js';
const day='2026-10-18';
const comparison={date:day,plans:{A:{picks:[]},A2:{picks:[]},B:{picks:[]},B2:{picks:[]}},unifiedPlan:{id:'plan-u1',date:day,status:'AVAILABLE',count:1,picks:[{matchId:'cid_example',market:'OU25',pick:'over',result:'UNRESOLVED'}]}};
test('current CSV and Excel reports contain one plan and one market',()=>{
 const record=comparisonToValueExportDay({date:day,comparison});
 const report=buildValueExportReport({from:day,to:day,days:[day],dayRecords:[record],today:day});
 assert.deepEqual(report.planOrder,['U1']);assert.equal(report.totalRows,1);assert.equal(report.plans.U1.range.totalDays,1);
});
test('mixed historical/current ranges keep each plan only on its applicable dates',()=>{
 const previous='2026-10-17';const old=comparisonToValueExportDay({date:previous,comparison:{date:previous,plans:comparison.plans}});
 const current=comparisonToValueExportDay({date:day,comparison});
 const report=buildValueExportReport({from:previous,to:day,days:[previous,day],dayRecords:[old,current],today:day});
 assert.deepEqual(report.planOrder,['A','A2','B','B2','U1']);
 assert.equal(report.plans.A.range.totalDays,1);assert.equal(report.plans.U1.range.totalDays,1);
 assert.equal(report.plans.A.range.notAvailableDays,0);assert.equal(report.plans.U1.range.notAvailableDays,0);
});
test('missing unified releases cannot fall back to a legacy Plan A export',()=>{
 const absent=comparisonToValueExportDay({date:day,comparison:{date:day,plans:comparison.plans}});
 assert.equal(absent.plans.U1.available,false);
 assert.equal(fallbackPlanAToValueExportDay({date:day,picks:comparison.unifiedPlan.picks}).plans.U1.available,false);
});

test('partial data remains INCOMPLETE even when a selection exists',()=>{
 const partial=structuredClone(comparison);partial.unifiedPlan.analysisComplete=false;
 const record=comparisonToValueExportDay({date:day,comparison:partial});
 const report=buildValueExportReport({from:day,to:day,days:[day],dayRecords:[record],today:day});
 assert.equal(report.integrity.status,'INCOMPLETE');
 assert.ok(report.integrity.issues.some(row=>row.code==='VALUE_EXPORT_INPUT_COVERAGE_INCOMPLETE'));
});
