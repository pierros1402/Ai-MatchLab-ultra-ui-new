import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

// Only exact original Git bytes or their complete LF -> CRLF checkout rendering.
export function exactCheckoutBytes(raw, original){
 if(raw.equals(original))return true;
 const text=original.toString('utf8');
 return Buffer.from(text,'utf8').equals(original)&&!text.includes('\r')&&raw.equals(Buffer.from(text.replace(/\n/g,'\r\n'),'utf8'));
}
export function proveOriginalObservation(root,file){
 try{
  const relative=path.relative(root,file).replaceAll('\\','/');
  if(!/^data\/value-unified\/\d{4}-\d{2}-\d{2}\/observations\/[a-f0-9]{64}\.json$/.test(relative))return {status:'UNPROVEN'};
  if(fs.realpathSync(file)!==path.resolve(fs.realpathSync(root),relative))return {status:'UNPROVEN'};
  const git=args=>execFileSync('git',args,{cwd:root,windowsHide:true,maxBuffer:64*1024*1024,timeout:20000,env:{...process.env,GIT_OPTIONAL_LOCKS:'0',GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0'}});
  const head=git(['rev-parse','HEAD']).toString().trim();
  const commits=git(['log','--diff-filter=A','--format=%H',head,'--',relative]).toString().trim().split(/\r?\n/).filter(Boolean);
  if(commits.length!==1||!/^([a-f0-9]{40}|[a-f0-9]{64})$/.test(commits[0]))return {status:'UNPROVEN'};
  const original=git(['show',`${commits[0]}:${relative}`]);
  const pinned=git(['show',`${head}:${relative}`]);
  const raw=fs.readFileSync(file);
  if(!original.equals(pinned)||!exactCheckoutBytes(raw,original))return {status:'UNPROVEN'};
  const committedAt=git(['show','-s','--format=%cI',commits[0]]).toString().trim();
  if(!Number.isFinite(Date.parse(committedAt)))return {status:'UNPROVEN'};
  if(git(['rev-parse','HEAD']).toString().trim()!==head)return {status:'UNPROVEN'};
  return {status:'ORIGINAL_COMMITTED_BYTES_VERIFIED',commit:commits[0],committedAt};
 }catch{return {status:'UNPROVEN'};}
}
