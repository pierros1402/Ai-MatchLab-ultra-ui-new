import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  STAGE20_APPROVED_FAMILIES, evaluateStage20CapturePaths
} from "../core/daily-resume-stage20-admission.mjs";
import { captureDailyWorktreeDelta } from "../core/daily-resume-worktree-delta.mjs";

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "buffer",
    maxBuffer: 32 * 1024 * 1024 });
}
function zeroList(bytes) { return bytes.toString("utf8").split("\0").filter(Boolean); }
export function inspectStage20Worktree(repoRoot, dayKey) {
  const paths = [
    ...zeroList(git(repoRoot, "diff", "--no-renames", "--name-only", "-z", "HEAD", "--")),
    ...zeroList(git(repoRoot, "ls-files", "--others", "--exclude-standard", "-z", "--"))
  ];
  const admission = evaluateStage20CapturePaths({ dayKey, paths });
  const head = git(repoRoot, "rev-parse", "HEAD").toString("utf8").trim();
  if (!/^[a-f0-9]{40}$/.test(head)) throw Error("stage20_source_head_invalid");
  return { ...admission, baseCommit: head,
    readOnly: true, resumeAuthorized: false, publicationAuthorized: false };
}
export function captureStage20Worktree(repoRoot, dayKey, archiveRoot) {
  const inspected = inspectStage20Worktree(repoRoot, dayKey);
  if (!inspected.ok) throw Error("stage20_capture_denied:" + inspected.reason);
  if (fs.existsSync(archiveRoot)) throw Error("stage20_capture_archive_exists");
  const result = captureDailyWorktreeDelta(repoRoot, archiveRoot, {
    dayKey, stageId: "daily-cycle", baseCommit: inspected.baseCommit,
    allowedPrefixes: STAGE20_APPROVED_FAMILIES
  });
  return { schema: "ai-matchlab.daily-stage20-capture-result.v1",
    dayKey, stageId: "daily-cycle", checkpointSha256: result.checkpointSha256,
    baseCommit: inspected.baseCommit, files: result.files, writes: result.writes,
    deletions: result.deletions, resumeAuthorized: false, publicationAuthorized: false };
}
// Standalone CLI is opt-in; not wired into the production Daily workflow.
const calledFrom = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (calledFrom === import.meta.url) {
  const [mode, dayKey, archiveRoot] = process.argv.slice(2);
  try {
    if (mode === "inspect") {
      console.log(JSON.stringify(inspectStage20Worktree(process.cwd(), dayKey), null, 2));
    } else if (mode === "capture" && archiveRoot && path.isAbsolute(archiveRoot)) {
      console.log(JSON.stringify(captureStage20Worktree(process.cwd(), dayKey, archiveRoot), null, 2));
    } else {
      throw Error("usage: node capture-stage20-worktree.mjs inspect DAY | capture DAY ABSOLUTE_ARCHIVE_DIR");
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
