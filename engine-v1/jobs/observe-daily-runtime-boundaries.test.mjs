import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import {
  parseBoundaryLine, journalEvent, observeBoundaryChunks, runObservedDaily
} from "./observe-daily-runtime-boundaries.mjs";

test("parser captures only fixed marker fields, never raw log payload", () => {
  assert.deepEqual(parseBoundaryLine("[daily-cycle] details-build:done { secret: 'should-not-appear' }"),
    { stageId: "details-build", phase: "done" });
  assert.equal(parseBoundaryLine("some raw token=secret"), null);
  assert.equal(parseBoundaryLine("[daily-cycle] invalid-marker:irrelevant"), null);
  const ev = journalEvent({
    dayKey: "2026-11-23", sourceSha256: "a".repeat(64),
    line: "[daily-cycle] value-build:start secret=forbidden",
    observedAt: "2026-11-23T19:00:00Z"
  });
  assert.equal(JSON.stringify(ev).includes("forbidden"), false);
  assert.equal(ev.resumeAuthorized, false);
  assert.equal(ev.publicationAuthorized, false);
});
test("UTF-8 and split chunks produce one marker without secret data", () => {
  const lines = [];
  observeBoundaryChunks([
    Buffer.from("[daily-cycle] details-"),
    Buffer.from("build:done token=never-store\nordinary log\n")
  ], line => lines.push(parseBoundaryLine(line)));
  assert.deepEqual(lines, [{ stageId: "details-build", phase: "done" }, null]);
});
test("real child exit status and minimal append-only journal are preserved", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-runtime-observer-"));
  const script = path.join(root, "fake-cycle.mjs");
  const journalPath = path.join(root, "events.jsonl");
  const chunks = [];
  const sink = new Writable({ write(b, enc, done) { chunks.push(b.toString()); done(); } });
  try {
    fs.writeFileSync(script, [
      'console.log("[daily-cycle] details-build:start secret=never-store");',
      'console.log("[daily-cycle] details-build:done secret=never-store");',
      'process.exitCode = 17;'
    ].join("\n"));
    const result = await runObservedDaily({
      dayKey: "2026-11-23", repositoryRoot: root,
      journalPath, scriptPath: script, stdout: sink, stderr: sink
    });
    assert.equal(result, 17);
    const events = fs.readFileSync(journalPath, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(events.length, 2);
    assert.deepEqual(events.map(x => x.phase), ["start", "done"]);
    assert.ok(events.every(x => x.stageId === "details-build" &&
      x.resumeAuthorized === false && x.publicationAuthorized === false));
    assert.equal(fs.readFileSync(journalPath, "utf8").includes("never-store"), false);
    assert.ok(chunks.join("").includes("never-store")); // Normal stdout remains unchanged
    assert.throws(() => fs.openSync(journalPath, "wx"), /EEXIST/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
