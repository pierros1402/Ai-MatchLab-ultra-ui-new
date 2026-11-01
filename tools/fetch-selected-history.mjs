import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

// checkout fetch-depth:0 fetches every branch, including the independent,
// continuously growing recovery archive. Original observation proofs need
// complete ancestry of the selected branch, not every archive checkpoint.
export function fetchSelectedHistory(ref, {cwd=process.cwd()}={}) {
  if (!/^refs\/heads\/[A-Za-z0-9._/-]+$/.test(ref||'')) throw Error('selected_branch_ref_required');
  const shallow=execFileSync('git',['rev-parse','--is-shallow-repository'],{cwd,encoding:'utf8'}).trim();
  if(shallow==='true') execFileSync('git',['fetch','--unshallow','--filter=blob:none','--no-tags','origin',ref],{cwd,stdio:'inherit'});
  else if(shallow!=='false') throw Error('invalid_shallow_repository_state');
  if(execFileSync('git',['rev-parse','--is-shallow-repository'],{cwd,encoding:'utf8'}).trim()!=='false') throw Error('complete_selected_history_required');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) fetchSelectedHistory(process.env.GITHUB_REF);
