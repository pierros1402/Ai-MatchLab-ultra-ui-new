import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const RESUME_SCHEMA = "ai-matchlab.daily-stage-checkpoint.v1";
const HEX = /^[a-f0-9]{64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const STAGE = /^[a-z][a-z0-9-]{0,63}$/;
const SHA = /^[0-9a-f]{40}$/;
function fail(code) { throw new Error(code); }
function check(condition, code) { if (!condition) fail(code); }
export function digest(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function relativeSafe(name) {
  check(typeof name === "string" && name.length > 0 && !name.includes("\\") && !name.startsWith("/") && !name.includes("\0") &&
    name.split("/").every(part => part !== "" && part !== "." && part !== ".."), "unsafe_checkpoint_path");
  return name;
}
function exactFile(root, name) {
  const normalized = relativeSafe(name);
  const base = path.resolve(root);
  const parts = normalized.split("/");
  let current = base;
  for (const part of parts) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current);
    check(!stat.isSymbolicLink(), "checkpoint_symlink_forbidden");
  }
  check(fs.statSync(current).isFile(), "checkpoint_not_regular_file");
  return current;
}
function inventory(root, names) {
  check(Array.isArray(names) && names.length > 0 && new Set(names).size === names.length, "checkpoint_files_invalid");
  return [...names].sort().map(name => {
    const bytes = fs.readFileSync(exactFile(root, name));
    return { path: name, bytes: bytes.length, sha256: digest(bytes) };
  });
}
export function validateGraph(stages) {
  check(Array.isArray(stages) && stages.length > 0, "resume_stage_list_invalid");
  const known = new Set();
  for (const stage of stages) {
    check(STAGE.test(stage.id) && !known.has(stage.id), "resume_stage_id_invalid");
    check(Array.isArray(stage.dependsOn) && new Set(stage.dependsOn).size === stage.dependsOn.length &&
      stage.dependsOn.every(id => known.has(id)), "resume_dependency_order_invalid");
    check(Array.isArray(stage.inputs) && Array.isArray(stage.outputs), "resume_stage_paths_invalid");
    for (const f of [...stage.inputs, ...stage.outputs]) relativeSafe(f);
    check(stage.outputs.length > 0 && new Set(stage.outputs).size === stage.outputs.length, "resume_outputs_invalid");
    known.add(stage.id);
  }
  return stages;
}
function assertBinding(binding) {
  check(binding && DAY.test(binding.dayKey) && SHA.test(binding.producerCommit) && HEX.test(binding.contractSha256) &&
    typeof binding.root === "string" && binding.root.length > 0, "resume_binding_invalid");
}
function stampBody(stage, binding, dependencies) {
  return {
    schema: RESUME_SCHEMA, stageId: stage.id, dayKey: binding.dayKey,
    producerCommit: binding.producerCommit, contractSha256: binding.contractSha256,
    dependencies, inputs: inventory(binding.root, stage.inputs), outputs: inventory(binding.root, stage.outputs)
  };
}
export function createCheckpoint(stage, binding, dependencies = {}) {
  assertBinding(binding); validateGraph([{...stage, dependsOn: []}]);
  check(Object.keys(dependencies).length === stage.dependsOn.length && stage.dependsOn.every(id => HEX.test(dependencies[id])), "resume_dependency_digest_invalid");
  const body = stampBody(stage, binding, dependencies);
  return { ...body, evidenceSha256: digest(Buffer.from(JSON.stringify(body), "utf8")) };
}
export function verifyCheckpoint(stage, binding, checkpoint, verifiedDependencies = {}) {
  try {
    assertBinding(binding);
    check(checkpoint?.schema === RESUME_SCHEMA && checkpoint.stageId === stage.id && checkpoint.dayKey === binding.dayKey &&
      checkpoint.producerCommit === binding.producerCommit && checkpoint.contractSha256 === binding.contractSha256,
      "resume_source_binding_mismatch");
    check(Object.keys(verifiedDependencies).length === stage.dependsOn.length &&
      stage.dependsOn.every(id => checkpoint.dependencies?.[id] === verifiedDependencies[id]), "resume_dependency_mismatch");
    const body = stampBody(stage, binding, verifiedDependencies);
    check(JSON.stringify(checkpoint) === JSON.stringify({ ...body, evidenceSha256: digest(Buffer.from(JSON.stringify(body), "utf8")) }),
      "resume_checkpoint_content_mismatch");
    return { reusable: true, reason: null, evidenceSha256: checkpoint.evidenceSha256 };
  } catch (e) { return { reusable: false, reason: e.message, evidenceSha256: null }; }
}
export function planResume(stages, binding, checkpoints) {
  validateGraph(stages); assertBinding(binding);
  const verified = {};
  const plan = [];
  let rebuild = false;
  for (const stage of stages) {
    const missingDependency = stage.dependsOn.some(d => !verified[d]);
    const result = !rebuild && !missingDependency
      ? verifyCheckpoint(stage, binding, checkpoints[stage.id], Object.fromEntries(stage.dependsOn.map(d => [d, verified[d]])))
      : { reusable: false, reason: missingDependency ? "resume_upstream_not_reusable" : "resume_rebuild_suffix_required" };
    if (!result.reusable) rebuild = true;
    else verified[stage.id] = result.evidenceSha256;
    plan.push({ stageId: stage.id, decision: result.reusable ? "REUSE_VERIFIED" : "RUN", reason: result.reason });
  }
  return { schema: "ai-matchlab.daily-resume-plan.v1", dayKey: binding.dayKey,
    resumeFrom: plan.find(s => s.decision === "RUN")?.stageId ?? null,
    reusedStages: plan.filter(s => s.decision === "REUSE_VERIFIED").length, plan,
    publicationAuthorized: false };
}

// A resume plan is advisory. It never executes stages, publishes or authorizes skips.
