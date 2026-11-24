// Static contract only. No IO, execution, reuse or publication authority.
const require = (ok, code) => { if (!ok) throw Error(code); };
const idOk = v => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(v) && !v.split("/").some(x => !x || x === "." || x === "..");
const key = v => JSON.stringify([v.artifact, v.version]);
function ref(v) {
  require(v && idOk(v.artifact) && Number.isSafeInteger(v.version) && v.version >= 0, "versioned_ref_invalid");
}
export function validateVersionedArtifacts({ initial, stages }) {
  require(Array.isArray(initial) && Array.isArray(stages) && stages.length > 0, "versioned_contract_invalid");
  const latest = new Map(), owners = new Map(), seen = new Set();
  for (const v of initial) {
    ref(v);
    require(v.version === 0 && !latest.has(v.artifact), "versioned_initial_invalid");
    latest.set(v.artifact, 0);
    owners.set(key(v), null);
  }
  for (const s of stages) {
    require(s && idOk(s.id) && !seen.has(s.id) && Array.isArray(s.inputs) && Array.isArray(s.outputs) && Array.isArray(s.dependsOn), "versioned_stage_invalid");
    require(s.conditional === false, "versioned_conditional_unresolved");
    const deps = new Set(s.dependsOn);
    require(deps.size === s.dependsOn.length && [...deps].every(d => seen.has(d)), "versioned_dependency_invalid");
    const read = new Set(), contributing = new Set();
    for (const v of s.inputs) {
      ref(v);
      require(!read.has(key(v)), "versioned_duplicate_input");
      require(latest.get(v.artifact) === v.version && owners.has(key(v)), "versioned_stale_or_missing_input");
      read.add(key(v));
      const producer = owners.get(key(v));
      if (producer !== null) contributing.add(producer);
    }
    require([...contributing].every(d => deps.has(d)), "versioned_missing_producer_dependency");
    require([...deps].every(d => contributing.has(d)), "versioned_unbound_dependency");
    const written = new Set();
    for (const v of s.outputs) {
      ref(v);
      require(!written.has(v.artifact), "versioned_duplicate_output");
      const previous = latest.get(v.artifact);
      require(v.version === (previous === undefined ? 1 : previous + 1), "versioned_output_sequence_invalid");
      require(previous === undefined || read.has(key({artifact:v.artifact,version:previous})), "versioned_previous_version_unbound");
      written.add(v.artifact);
    }
    for (const v of s.outputs) {
      latest.set(v.artifact,v.version);
      owners.set(key(v),s.id);
    }
    seen.add(s.id);
  }
  return { schema:"ai-matchlab.daily-versioned-artifacts.v1", stageCount:seen.size,
    artifactVersionCount:owners.size, staticContractVerified:true,
    sourceClosureVerified:false, outputBytesVerified:false,
    resumeAuthorized:false, publicationAuthorized:false };
}
