import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { preserveHistoryCheckpoint, verifyHistoryCheckpoint, restoreHistoryCheckpoint, prepareHistoryRecoveryBundle } from "../storage/history-preservation.js";

export function runHistoryPreservationCli(argv = process.argv.slice(2)) {
  const args = Object.fromEntries(argv.filter(value => value.startsWith("--")).map(value => {
    const index = value.indexOf("=");
    if (index < 3) throw new Error("history_cli_requires_key_equals_value");
    return [value.slice(2, index), value.slice(index + 1)];
  }));
  if (argv[0] === "bundle") return prepareHistoryRecoveryBundle({
    destination: args.destination, dayKey: args.day || process.env.DAY_KEY,
    baseline: args.baseline || process.env.GITHUB_SHA || "HEAD", full: args.full === "true"
  });
  if (argv[0] === "restore") return restoreHistoryCheckpoint({
    ref: args.ref, manifestPath: args.manifest, destination: args.destination
  });
  if (argv[0] === "verify") {
    const result = verifyHistoryCheckpoint({ ref: args.ref, manifestPath: args.manifest });
    return { ok: true, fileCount: result.files.length, publicationApproved: false };
  }
  return preserveHistoryCheckpoint({
    dayKey: args.day || process.env.DAY_KEY,
    stage: args.stage || "workflow-final",
    runId: args.run || process.env.GITHUB_RUN_ID,
    attempt: args.attempt || process.env.GITHUB_RUN_ATTEMPT || "1"
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = runHistoryPreservationCli();
    console.log(JSON.stringify(result, null, 2));
    if (process.env.GITHUB_OUTPUT && result.archiveCommit && result.manifestPath) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `archiveCommit=${result.archiveCommit}\nmanifestPath=${result.manifestPath}\n`);
    }
  }
  catch (error) { console.error("[history-preservation] FAILED", error.message); process.exitCode = 1; }
}
