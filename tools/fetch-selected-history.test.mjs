import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {fetchSelectedHistory} from './fetch-selected-history.mjs';

test('complete selected ancestry retains original bytes without fetching the archive branch',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'selected-history-'));
 const source=path.join(dir,'source'),clone=path.join(dir,'clone');mkdirSync(source);
 const git=(cwd,args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const commit=message=>git(source,['-c','user.name=Test','-c','user.email=test@example.invalid','commit','-am',message]);
 try{
  git(source,['init','-b','main']);writeFileSync(path.join(source,'original.json'),'original observation bytes\n');
  git(source,['add','.']);commit('original');const original=git(source,['rev-parse','HEAD']);
  git(source,['switch','-c','codex/history-archive']);writeFileSync(path.join(source,'archive.txt'),'unrelated archive');git(source,['add','.']);commit('archive');
  git(source,['switch','main']);writeFileSync(path.join(source,'current.txt'),'current');git(source,['add','.']);commit('current');
  git(dir,['clone','--no-tags','--single-branch','--depth=1','--branch=main',pathToFileURL(source).href,clone]);
  assert.equal(git(clone,['rev-parse','--is-shallow-repository']),'true');
  fetchSelectedHistory('refs/heads/main',{cwd:clone});
  assert.equal(git(clone,['rev-parse','--is-shallow-repository']),'false');
  assert.equal(git(clone,['show',`${original}:original.json`]),'original observation bytes');
  assert.equal(git(clone,['for-each-ref','--format=%(refname)','refs/remotes/origin/codex/history-archive']),'');
  fetchSelectedHistory('refs/heads/main',{cwd:clone}); // already complete is safe
  assert.throws(()=>fetchSelectedHistory('refs/heads/*',{cwd:clone}));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
