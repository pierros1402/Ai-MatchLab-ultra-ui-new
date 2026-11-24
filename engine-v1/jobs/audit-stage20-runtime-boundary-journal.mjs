// Opt-in read-only validator for an existing Daily runtime boundary journal.
// Never starts the Daily, changes its output, restores stages or authorizes skip.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";
import {auditStage20RuntimeJournal} from "../core/daily-resume-stage20-boundary-journal-integrity.mjs";
const MAX_JOURNAL_BYTES=16*1024*1024;
function check(ok,reason){if(!ok)throw Error(reason);}
export function auditStage20JournalFile({repoRoot,runnerTemp,dayKey}={}){
  check(typeof repoRoot==="string" && path.isAbsolute(repoRoot) &&
    typeof runnerTemp==="string" && path.isAbsolute(runnerTemp) &&
    /^\d{4}-\d{2}-\d{2}$/.test(dayKey||""),
    "stage20_journal_cli_binding_invalid");
  const base=path.resolve(runnerTemp);
  const source=path.resolve(repoRoot,"engine-v1/jobs/run-daily-cycle.js");
  const journal=path.join(base,"aiml-daily-boundary-journal.jsonl");
  check(fs.realpathSync(base)===base &&
    fs.lstatSync(base).isDirectory() && !fs.lstatSync(base).isSymbolicLink(),
    "stage20_journal_cli_temp_untrusted");
  for(const file of [source,journal]){
    const info=fs.lstatSync(file);
    check(info.isFile() && !info.isSymbolicLink(),
      "stage20_journal_cli_file_untrusted");
  }
  const info=fs.statSync(journal);
  check(info.size>0 && info.size<=MAX_JOURNAL_BYTES,
    "stage20_journal_cli_size_invalid");
  const cycleSource=fs.readFileSync(source,"utf8");
  const sourceSha256=crypto.createHash("sha256").update(cycleSource).digest("hex");
  const raw=fs.readFileSync(journal,"utf8");
  check(!raw.includes("\uFFFD") && raw.endsWith("\n"),
    "stage20_journal_cli_utf8_or_truncation_invalid");
  const lines=raw.slice(0,-1).split("\n");
  check(lines.length>0 && lines.length<=100000 &&
    lines.every(s=>s.length>0 && s.length<=65536),
    "stage20_journal_cli_lines_invalid");
  let events;
  try{events=lines.map(s=>JSON.parse(s))}
  catch{throw Error("stage20_journal_cli_json_invalid")}
  const audit=auditStage20RuntimeJournal({
    cycleSource,dayKey,sourceSha256,events
  });
  check(audit.accepted===true,
    "stage20_journal_cli_audit_denied:"+audit.reason);
  return {...audit,readOnly:true,
    originalRunnerExitVerified:false,
    stageCompletionReceiptsVerified:false,
    crossRunReuseAuthorized:false,publicationAuthorized:false};
}
const invoked=process.argv[1] &&
  path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  try{
    check(process.argv.length===3,"stage20_journal_cli_usage_day_key");
    const result=auditStage20JournalFile({
      repoRoot:process.cwd(),runnerTemp:process.env.RUNNER_TEMP,
      dayKey:process.argv[2]});
    console.log("STAGE20_BOUNDARY_JOURNAL_AUDIT="+JSON.stringify(result));
  }catch(error){
    // Only fixed classification; never echo a raw journal line or source path.
    console.error("STAGE20_BOUNDARY_JOURNAL_AUDIT_DENIED");
    process.exitCode=1;
  }
}
