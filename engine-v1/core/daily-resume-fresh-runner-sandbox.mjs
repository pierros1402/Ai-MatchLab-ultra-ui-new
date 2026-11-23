// Isolated cross-run archive restoration proof. NEVER a production Daily adapter.
import fs from "node:fs";
import path from "node:path";
import { validateGraph } from "./daily-resume-contract.mjs";
import { archiveStage, stageArchive, verifyArchive } from "./daily-resume-artifact-store.mjs";

const CLASSES = new Set(["frozen", "derived", "external", "mutable", "gate"]);
const MANDATORY = new Set(["prepublish-gate", "commit-snapshot", "public-verify"]);
function ensure(ok, reason) { if (!ok) throw Error(reason); }
function within(base, target) {
  return typeof target === "string" && path.resolve(target).startsWith(base + path.sep);
}
function noSymlinkPath(root, target) {
  const relative = path.relative(root, target);
  ensure(relative !== "" && relative !== ".." && !relative.startsWith(".." + path.sep) &&
    !path.isAbsolute(relative), "restore_outside_workspace");
  let cursor = root;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (fs.existsSync(cursor)) ensure(!fs.lstatSync(cursor).isSymbolicLink(), "restore_symlink_forbidden");
  }
}
function restoreVerifiedOutputs(stage, binding, dependencies, storeRoot, evidence, scratch) {
  const staged = stageArchive(stage, binding, dependencies, storeRoot, evidence, scratch);
  try {
    const destinations = stage.outputs.map(name => {
      const target = path.resolve(binding.root, name);
      noSymlinkPath(binding.root, target);
      ensure(!fs.existsSync(target), "restore_output_already_present");
      return { source: path.join(staged.staging, name), target };
    });
    // All destinations are checked before materialization. Never overwrite a local file.
    for (const { source, target } of destinations) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      noSymlinkPath(binding.root, target);
      fs.renameSync(source, target);
    }
  } finally { fs.rmSync(staged.staging, { recursive: true, force: true }); }
}
export async function runFreshRunnerSandboxDAG({
  stages, binding, previousCheckpoints = {}, storeRoot, sandboxRoot,
  runStage, sandboxAuthorized = false
} = {}) {
  ensure(sandboxAuthorized === true, "sandbox_restore_not_authorized");
  ensure(typeof sandboxRoot === "string" && fs.existsSync(sandboxRoot), "sandbox_root_required");
  const root = fs.realpathSync(sandboxRoot);
  ensure(within(root, binding?.root) && within(root, storeRoot), "sandbox_path_outside_boundary");
  for (const p of [binding.root, storeRoot]) {
    noSymlinkPath(root, path.resolve(p));
    ensure(fs.existsSync(p) && fs.statSync(p).isDirectory(), "sandbox_directory_required");
  }
  validateGraph(stages);
  ensure(stages.every(x => CLASSES.has(x.reuseClass)), "stage_reuse_class_invalid");
  ensure(typeof runStage === "function" &&
    previousCheckpoints && typeof previousCheckpoints === "object" &&
    !Array.isArray(previousCheckpoints), "restore_arguments_invalid");
  const verified = {}, decisions = [];
  let rebuild = false;
  for (const stage of stages) {
    const deps = Object.fromEntries(stage.dependsOn.map(id => [id, verified[id]]));
    const volatile = stage.reuseClass !== "frozen" || MANDATORY.has(stage.id);
    let reason = "missing_checkpoint", accepted = false;
    const prior = previousCheckpoints[stage.id];
    if (!rebuild && !volatile && prior) {
      const archive = verifyArchive(stage, binding, deps, storeRoot, prior.evidenceSha256);
      if (archive.ok && JSON.stringify(archive.checkpoint) === JSON.stringify(prior)) {
        // The archive proves source, contract, current input bytes and archived output bytes.
        restoreVerifiedOutputs(stage, binding, deps, storeRoot, prior.evidenceSha256,
          path.join(root, "scratch"));
        verified[stage.id] = prior.evidenceSha256;
        decisions.push({ stageId: stage.id, decision: "RESTORED_VERIFIED",
          evidenceSha256: prior.evidenceSha256 });
        accepted = true;
      } else {
        reason = archive.ok ? "checkpoint_manifest_mismatch" : "archive_not_verified:" + archive.reason;
      }
    }
    if (accepted) continue;
    reason = rebuild ? "earlier_stage_rebuilt" :
      volatile ? "volatile_or_mandatory_stage" : reason;
    rebuild = true;
    const result = await runStage(stage, { binding, dependencies: deps, reason });
    ensure(result?.ok === true, "sandbox_stage_failed:" + stage.id);
    const saved = archiveStage(stage, binding, deps, storeRoot);
    const valid = verifyArchive(stage, binding, deps, storeRoot, saved.checkpoint.evidenceSha256);
    ensure(valid.ok, "sandbox_archive_verify_failed:" + stage.id);
    verified[stage.id] = saved.checkpoint.evidenceSha256;
    decisions.push({ stageId: stage.id, decision: "EXECUTED", reason,
      evidenceSha256: saved.checkpoint.evidenceSha256 });
  }
  return {
    schema: "ai-matchlab.daily-fresh-runner-sandbox.v1", dayKey: binding.dayKey,
    decisions, resumedFrom: decisions.find(x => x.decision === "EXECUTED")?.stageId ?? null,
    restoredStages: decisions.filter(x => x.decision === "RESTORED_VERIFIED").length,
    executedStages: decisions.filter(x => x.decision === "EXECUTED").length,
    sandboxOnly: true, productionResumeAuthorized: false, publicationAuthorized: false
  };
}
