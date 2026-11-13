/** V3.5D additive diagnostic: never claims transaction atomicity. */
const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const HASH = /^[a-f0-9]{64}$/iu;
const REF = /^[a-f0-9]{40}$/iu;
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

/** Cross-check independently read latest, manifest and completed sync witness. */
export function runtimePublicationCoherence({ latest, manifest, runtimeSync }) {
  const issues = [];
  const day = String(latest?.date || "");
  const latestHash = String(latest?.hash || "").toLowerCase();
  if (!object(latest) || !DAY.test(day) || !HASH.test(latestHash)) {
    issues.push("latest_pointer_missing_or_invalid");
  }
  if (!object(manifest) || String(manifest?.date || manifest?.dayKey || "") !== day ||
      !HASH.test(String(manifest?.hash || "")) ||
      String(manifest?.hash || "").toLowerCase() !== latestHash) {
    issues.push("latest_manifest_binding_mismatch");
  }
  if (!object(runtimeSync) || runtimeSync.schema !== "ai-matchlab.runtime-snapshot-sync.v2") {
    issues.push("runtime_sync_witness_missing_or_invalid");
  } else {
    if (runtimeSync.latestDay !== day) issues.push("runtime_sync_latest_day_mismatch");
    if (!REF.test(String(runtimeSync.latestRef || ""))) issues.push("runtime_sync_ref_invalid");
    const row = object(runtimeSync.days) ? runtimeSync.days[day] : null;
    if (!object(row) || row.latestPromoted !== true || row.ref !== runtimeSync.latestRef ||
        String(row.manifestHash || "").toLowerCase() !== latestHash) {
      issues.push("runtime_sync_day_witness_mismatch");
    }
  }
  return {
    schema: "aiml.runtime-publication-coherence.v35d.v1",
    verified: issues.length === 0,
    status: issues.length ? "HOLD" : "PASS",
    day: DAY.test(day) ? day : null,
    reasonCodes: issues
  };
}
