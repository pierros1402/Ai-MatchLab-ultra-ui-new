import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beginPublication, finishPublication, readPublicationGuard, acquirePublicationReadLease, waitForPublicationReadersToDrain } from "../system-health/runtime-publication-guard.js";
import { promoteDirectory } from "./sync-deploy-snapshot-from-github.js";
const here = path.dirname(fileURLToPath(import.meta.url));
const read = file => fs.readFileSync(path.resolve(here,file),"utf8");
async function fixture(run) { const root=await fsp.mkdtemp(path.join(os.tmpdir(),"aiml-plan-c-guard-")); try { await run(root); } finally {await fsp.rm(root,{recursive:true,force:true});} }
test("plan C shadow writer acquires guard, drains leases, promotes and finishes in that order",()=>{
 const s=read("sync-plan-c-shadow-from-github.js");
 const p=s.indexOf("const publication = await beginPublication(resolveDataPath(), {");
 const d=s.indexOf("await waitForPublicationReadersToDrain(resolveDataPath());",p);
 const m=s.indexOf("await promoteDirectory(stageDir, targetDir, backupDir, { retainBackup: true });",d);
 const f=s.indexOf("await finishPublication(resolveDataPath(), publication);",m);
 assert.ok(p>=0 && d>p && m>d && f>m); assert.match(s,/mode: "plan-c-shadow"/);
});
test("Plan C guard blocks overlapping snapshot or settlement writes",async()=>fixture(async root=>{
 const a=await beginPublication(root,{day:"2026-11-12",ref:"a".repeat(40),mode:"plan-c-shadow"});
 try {assert.equal(readPublicationGuard(root).pending,true); await assert.rejects(beginPublication(root,{day:"2026-11-12",ref:"b".repeat(40),mode:"snapshot"}),/publication_guard_existing_hold/); await assert.rejects(beginPublication(root,{day:"2026-11-12",ref:"b".repeat(40),mode:"settlement"}),/publication_guard_existing_hold/);}
 finally {await finishPublication(root,a);} assert.equal(readPublicationGuard(root).pending,false);
}));
test("Plan C writer must drain earlier readers",async()=>fixture(async root=>{
 const release=acquirePublicationReadLease(root);
 const a=await beginPublication(root,{day:"2026-11-12",ref:"a".repeat(40),mode:"plan-c-shadow"});
 try {await assert.rejects(waitForPublicationReadersToDrain(root,{timeoutMs:5,pollMs:1}),/publication_read_leases_not_drained/); release(); await waitForPublicationReadersToDrain(root,{timeoutMs:100,pollMs:1});}
 finally {await finishPublication(root,a);}
}));
test("failed Plan C mutation must leave guard HOLD, no automatic unlock",async()=>fixture(async root=>{
 const a=await beginPublication(root,{day:"2026-11-12",ref:"a".repeat(40),mode:"plan-c-shadow"});
 assert.equal(readPublicationGuard(root).pending,true); await assert.rejects(beginPublication(root,{day:"2026-11-12",ref:"b".repeat(40),mode:"plan-c-shadow"}),/publication_guard_existing_hold/);
 assert.equal(readPublicationGuard(root).pending,true); // deliberately do not finish
}));

test("failed shadow promotion retains backup evidence",()=>{
 const s=read("sync-plan-c-shadow-from-github.js");
 assert.match(s,/let publicationComplete = false/);
 assert.match(s,/publicationComplete = true/);
 assert.match(s,/if \(publicationComplete\) \{[\s\S]*?fsp\.rm\(backupDir/);
});

test("Plan C retains backup when publication completion is rejected", async () =>
  fixture(async root => {
    const stage = path.join(root, "stage");
    const target = path.join(root, "target");
    const backup = path.join(root, "backup");
    await fsp.mkdir(stage, { recursive: true });
    await fsp.mkdir(target, { recursive: true });
    await fsp.writeFile(path.join(stage, "release.txt"), "NEW");
    await fsp.writeFile(path.join(target, "release.txt"), "OLD");
    const ticket = await beginPublication(root, {
      day: "2026-11-13",
      ref: "a".repeat(40),
      mode: "plan-c-shadow"
    });
    await waitForPublicationReadersToDrain(root, {
      timeoutMs: 1000,
      pollMs: 2
    });
    await promoteDirectory(stage, target, backup, { retainBackup: true });
    await assert.rejects(
      finishPublication(root, { ...ticket, token: "invalid-token" }),
      /publication_guard_completion_ticket_mismatch/
    );
    assert.equal(readPublicationGuard(root).pending, true);
    assert.equal(await fsp.readFile(path.join(target, "release.txt"), "utf8"), "NEW");
    assert.equal(await fsp.readFile(path.join(backup, "release.txt"), "utf8"), "OLD");
  })
);

test("Plan C removes retained backup only after successful completion", async () =>
  fixture(async root => {
    const stage = path.join(root, "stage");
    const target = path.join(root, "target");
    const backup = path.join(root, "backup");
    await fsp.mkdir(stage, { recursive: true });
    await fsp.mkdir(target, { recursive: true });
    await fsp.writeFile(path.join(stage, "release.txt"), "NEW");
    await fsp.writeFile(path.join(target, "release.txt"), "OLD");
    const ticket = await beginPublication(root, {
      day: "2026-11-13",
      ref: "a".repeat(40),
      mode: "plan-c-shadow"
    });
    await waitForPublicationReadersToDrain(root, {
      timeoutMs: 1000,
      pollMs: 2
    });
    await promoteDirectory(stage, target, backup, { retainBackup: true });
    assert.equal(fs.existsSync(backup), true);
    await finishPublication(root, ticket);
    assert.equal(readPublicationGuard(root).pending, false);
    await fsp.rm(backup, { recursive: true, force: true });
    assert.equal(fs.existsSync(backup), false);
  })
);
