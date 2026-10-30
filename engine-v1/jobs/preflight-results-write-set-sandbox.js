import { readFileSync, lstatSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { createHash } from "node:crypto";
import { verifyResultsWriteSetManifest } from "../core/results-write-set-contract.js";
import { inspectResultsMemoryPreservation } from "../core/results-memory-preservation.js";

// Read-only proof of an entire candidate correction set. This code never writes
// to the repository or approves a change of historical truth.
const digest = b => createHash("sha256").update(b).digest("hex");
function confined(root, relativePath) {
  const absolute = resolve(root, relativePath);
  const back = relative(root, absolute);
  if (!back || back.startsWith(".."+sep) || back===".." || back.startsWith(sep))
    throw Error("sandbox_path_outside_root");
  let segment=resolve(root);
  for (const part of back.split(sep)) {
    segment=resolve(segment,part);
    if (lstatSync(segment).isSymbolicLink()) throw Error("sandbox_symlink_denied");
  }
  return absolute;
}
export function preflightResultsWriteSet({root, manifest, candidates}) {
  if (!root || !manifest || !candidates || typeof candidates !== "object" ||
      Array.isArray(candidates)) throw Error("sandbox_preflight_inputs_invalid");
  const entries=manifest.entries;
  if (!Array.isArray(entries) || !entries.length) throw Error("sandbox_preflight_empty");
  const staged=[];
  for (const item of entries) {
    if (typeof item?.path!=="string" ||
        !/^data\/league-memory\/results\/[a-z0-9][a-z0-9._-]*\.json$/.test(item.path) ||
        item.path.includes("..") || item.status!=="M") throw Error("sandbox_preflight_path_invalid");
    const current=readFileSync(confined(root,item.path));
    if (!Object.prototype.hasOwnProperty.call(candidates,item.path) ||
        !Buffer.isBuffer(candidates[item.path])) throw Error("sandbox_preflight_candidate_missing");
    staged.push({path:item.path,status:"M",beforeBytes:current,afterBytes:candidates[item.path]});
  }
  if (Object.keys(candidates).length !== entries.length) throw Error("sandbox_preflight_scope_mismatch");
  const checked=verifyResultsWriteSetManifest(manifest,staged);
  if (!checked.ok) throw Error("sandbox_preflight_hash_mismatch:"+checked.failures.map(x=>x.reason).join(","));
  for (const item of staged) {
    let before, after;
    try {
      before=JSON.parse(item.beforeBytes.toString("utf8"));
      after=JSON.parse(item.afterBytes.toString("utf8"));
    } catch {
      throw Error("sandbox_preflight_invalid_json:"+item.path);
    }
    const expectedSlug=item.path.slice("data/league-memory/results/".length,-5);
    if(before?.slug!==expectedSlug || after?.slug!==expectedSlug)
      throw Error("sandbox_preflight_slug_mismatch:"+item.path);
    let preservation;
    try {
      preservation=inspectResultsMemoryPreservation(before,after);
    } catch {
      throw Error("sandbox_preflight_invalid_results_memory:"+item.path);
    }
    if(!preservation.ok)
      throw Error("sandbox_preflight_truth_mutation_requires_adjudication:"+item.path);
  }
  return Object.freeze({ok:true,readOnly:true,approved:false,paths:staged.map(x=>x.path),
    hashes:staged.map(x=>({path:x.path,beforeSha256:digest(x.beforeBytes),afterSha256:digest(x.afterBytes)}))});
}
