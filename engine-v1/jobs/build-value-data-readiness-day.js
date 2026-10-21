import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {canonicalFixturesForDay} from '../core/day-fixture-universe.js';
import {getDeployedOddsDay} from '../storage/odds-memory-db.js';
import {readTrustedStandingsState} from '../storage/trusted-standings-db.js';
import {resolveDataPath} from '../storage/data-root.js';
import {auditDetailsFoundationDay} from './audit-details-foundation-day.js';
import {buildValueDataReadiness} from '../core/value-data-readiness.js';
import {applyPrematchReadinessEvidence,needsPrematchReadinessEvidence} from '../core/prematch-readiness-evidence.js';
function read(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}}
function readPrematchRecords(day) {
  const dir=resolveDataPath('value-unified',day,'observations');
  if(!fs.existsSync(dir))return [];
  return fs.readdirSync(dir).filter(name=>/^[a-f0-9]{64}\.json$/.test(name)).map(name=>read(path.join(dir,name)));
}
export function buildValueDataReadinessDay(day,{write=false,dependencies={}}={}) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('invalid_day');
  const fixtures=(dependencies.fixtures||canonicalFixturesForDay)(day);
  const coverage=(dependencies.coverage||(()=>read(resolveDataPath('value','_coverage-reports',`${day}.json`))))(day);
  const assessments=(dependencies.assessments||getDeployedOddsDay)(day)?.matches||[];
  const standings=Object.fromEntries([...new Set(fixtures.map(row=>row.leagueSlug))].map(slug=>[slug,(dependencies.standings||readTrustedStandingsState)(slug)]));
  let report=buildValueDataReadiness({day,fixtures,assessments,coverage,standings,detailsAudit:(dependencies.detailsAudit||auditDetailsFoundationDay)(day),now:dependencies.now});
  if(report.rows.some(row=>needsPrematchReadinessEvidence(row,report.generatedAt))) {
    report=applyPrematchReadinessEvidence(report,fixtures,(dependencies.prematchRecords||readPrematchRecords)(day));
  }
  if(write){const dir=resolveDataPath('value-data-readiness');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,`${day}.json`),previous=read(file);const stable=x=>{if(!x)return null;const {generatedAt,...body}=x;return JSON.stringify(body);};if(stable(previous)===stable(report))report.generatedAt=previous.generatedAt;fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');}
  return report;
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 const report=buildValueDataReadinessDay(process.argv[2],{write:process.argv.includes('--write')});
 console.log(JSON.stringify({date:report.date,status:report.status,complete:report.complete,summary:report.summary}));
 if(process.argv.includes('--require-complete')&&!report.complete)process.exitCode=3;
}
