import fs from 'node:fs';
import {auditValuePublication} from '../engine-v1/core/value-publication-integrity.js';
const file=process.argv[2];
if(!file)throw Error('usage: node tools/audit-value-publication.mjs <comparison.json>');
const audit=auditValuePublication(JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')));
console.log(JSON.stringify(audit,null,2));
if(!audit.ok)process.exitCode=1;
