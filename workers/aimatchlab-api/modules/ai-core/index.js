
import { buildSignature } from "./state/signature.js";
import { shouldRebuild } from "./state/change-detector.js";
import { loadSnapshot, persistSnapshot, cleanupSnapshots } from "./lifecycle/snapshots.js";
import { loadStructuralData, buildStructuralFingerprint } from "./structural/loader.js";
import { buildModel } from "./modeling/model.js";

export async function runAiEngine(payload, env){

  const structural = await loadStructuralData(env, payload);
  const structuralFingerprint = buildStructuralFingerprint(structural);

  const signature =
    buildSignature(payload) +
    "|" +
    structuralFingerprint +
    "|ai-core-v2.2";

  const existing = await loadSnapshot(env, payload.id);
  const decision = shouldRebuild(existing, signature, payload);

  if(!decision.rebuild && existing){
    return { ...existing, cache: "HIT" };
  }

  const modeling = buildModel(structural, payload);

  const snapshot = {
    id: payload.id,
    state: {
      signature,
      status: payload.status,
      scoreHome: payload.scoreHome,
      scoreAway: payload.scoreAway,
      minute: payload.minute || 0
    },
    structural,
    modeling,
    meta: {
      builtAt: new Date().toISOString(),
      reason: decision.reason
    }
  };

  await persistSnapshot(env, payload.id, snapshot);
  await cleanupSnapshots(env, payload.id, payload.status);

  return { ...snapshot, cache: "REBUILT" };
}
