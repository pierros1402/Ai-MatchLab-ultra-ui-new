// Isolated, opt-in runtime observer for the existing monolithic Daily.
// Only a fixed-field sanitized progress journal is retained. No checkpoint reuse.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

export const JOURNAL_SCHEMA = "ai-matchlab.daily-runtime-boundary-journal.v1";
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const LOG_MARKER = /^\[daily-cycle\] ([A-Za-z][A-Za-z0-9-]*):(start|done)(?=\s|$)/;
function ensure(ok, code) { if (!ok) throw Error(code); }
export function parseBoundaryLine(line) {
  if (typeof line !== "string" || line.length > 65536) return null;
  const match = LOG_MARKER.exec(line);
  return match ? { stageId: match[1], phase: match[2] } : null;
}
export function journalEvent({ dayKey, sourceSha256, line, observedAt }) {
  const parsed = parseBoundaryLine(line);
  if (!parsed) return null;
  ensure(DAY.test(dayKey) && /^[a-f0-9]{64}$/.test(sourceSha256),
    "daily_journal_binding_invalid");
  ensure(typeof observedAt === "string" && Number.isFinite(Date.parse(observedAt)),
    "daily_journal_timestamp_invalid");
  return { schema: JOURNAL_SCHEMA, dayKey, sourceSha256,
    stageId: parsed.stageId, phase: parsed.phase, observedAt,
    resumeAuthorized: false, publicationAuthorized: false };
}
export function observeBoundaryChunks(chunks, onLine) {
  const decoder = new StringDecoder("utf8");
  let tail = "";
  const receive = (text) => {
    tail += text;
    let cut;
    while ((cut = tail.indexOf("\n")) !== -1) {
      onLine(tail.slice(0, cut).replace(/\r$/, ""));
      tail = tail.slice(cut + 1);
    }
    // Unbounded or binary logs are not stored. Discard oversized tails.
    if (tail.length > 65536) tail = "";
  };
  for (const chunk of chunks) receive(decoder.write(chunk));
  receive(decoder.end());
  if (tail) onLine(tail);
}
export async function runObservedDaily({
  dayKey, repositoryRoot, journalPath, scriptPath, childArgs = [],
  stdout = process.stdout, stderr = process.stderr
}) {
  ensure(DAY.test(dayKey), "daily_journal_day_invalid");
  ensure(typeof journalPath === "string" && path.isAbsolute(journalPath),
    "daily_journal_path_invalid");
  ensure(typeof repositoryRoot === "string" && path.isAbsolute(repositoryRoot),
    "daily_journal_root_invalid");
  ensure(typeof scriptPath === "string" && path.isAbsolute(scriptPath),
    "daily_journal_script_invalid");
  ensure(Array.isArray(childArgs) && childArgs.every(x => typeof x === "string"),
    "daily_journal_args_invalid");
  const sourceSha256 = crypto.createHash("sha256").update(fs.readFileSync(scriptPath)).digest("hex");
  const fd = fs.openSync(journalPath, "wx", 0o600);
  const append = line => {
    const ev = journalEvent({ dayKey, sourceSha256, line, observedAt: new Date().toISOString() });
    if (ev) { fs.writeSync(fd, JSON.stringify(ev) + "\n"); fs.fsyncSync(fd); }
  };
  const decoder = new StringDecoder("utf8");
  let tail = "";
  let observerError = null;
  const processText = text => {
    tail += text;
    let cut;
    while ((cut = tail.indexOf("\n")) !== -1) {
      const line = tail.slice(0, cut).replace(/\r$/, "");
      tail = tail.slice(cut + 1);
      try { append(line); } catch (e) { observerError = e; }
    }
    if (tail.length > 65536) tail = "";
  };
  try {
    const child = spawn(process.execPath, [scriptPath, dayKey, ...childArgs], {
      cwd: repositoryRoot, env: process.env, stdio: ["inherit", "pipe", "pipe"]
    });
    const forwardSignal = signal => child.kill(signal);
    process.on("SIGINT", forwardSignal);
    process.on("SIGTERM", forwardSignal);
    const outcome = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.stdout.on("data", buf => {
        stdout.write(buf);
        processText(decoder.write(buf));
      });
      child.stderr.on("data", buf => stderr.write(buf));
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
    process.off("SIGINT", forwardSignal);
    process.off("SIGTERM", forwardSignal);
    processText(decoder.end());
    if (tail) append(tail);
    if (observerError) throw observerError;
    return outcome.signal ? 128 + (outcome.signal === "SIGINT" ? 2 : 15) : outcome.code ?? 1;
  } finally { fs.closeSync(fd); }
}
// CLI: no changes to the underlying Daily semantics, no skip or restoration.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const dayKey = process.argv[2];
  const root = process.cwd();
  const temp = process.env.RUNNER_TEMP;
  ensure(typeof temp === "string" && path.isAbsolute(temp) &&
    fs.existsSync(temp) && fs.statSync(temp).isDirectory(), "daily_journal_runner_temp_invalid");
  const journalPath = path.join(temp, "aiml-daily-boundary-journal.jsonl");
  runObservedDaily({
    dayKey, repositoryRoot: root, journalPath,
    scriptPath: path.join(root, "engine-v1/jobs/run-daily-cycle.js")
  }).then(code => { process.exitCode = code; }).catch(err => {
    console.error("[daily-boundary-observer] failed:", err.message);
    process.exitCode = 1;
  });
}
