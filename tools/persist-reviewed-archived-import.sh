#!/usr/bin/env bash
set -euo pipefail
if ! git diff --cached --quiet; then echo 'Refusing unrelated staged changes' >&2; exit 2; fi
node engine-v1/jobs/apply-reviewed-archived-match-import.js --write
node --input-type=module <<'NODE'
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const day=process.env.DAY_KEY;
if(!/^\d{4}-\d{2}-\d{2}$/.test(day||''))throw Error('invalid_import_day');
const reportPath=`data/value-data-acquisition/${day}/archived-import.report.research.json`;
const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
if(report.manifestPath!==process.env.VALUE_ARCHIVED_IMPORT_MANIFEST||report.manifestSha256!==process.env.VALUE_ARCHIVED_IMPORT_SHA256)throw Error('reviewed_import_report_binding_mismatch');
const paths=[...report.writtenPaths,reportPath];
for(const file of paths)execFileSync('git',['add','--',file],{stdio:'inherit'});
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
execFileSync(process.execPath,['engine-v1/jobs/guard-staged-data-boundary.js','--label=reviewed-archived-import',`--dayKey=${day}`,`--allow=^(?:${paths.map(escape).join('|')})$`],{stdio:'inherit'});
NODE
if ! git diff --cached --quiet; then
  git config user.name 'github-actions[bot]'
  git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
  git commit -m "Import reviewed native archived match evidence for ${DAY_KEY}"
  bash tools/git-push-rebase-retry.sh
fi
