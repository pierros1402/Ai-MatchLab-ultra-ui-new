import { createHash, randomUUID } from "node:crypto";
import { mkdir, link, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fingerprint } from "../core/season-closure-contract.js";

export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

export async function withArtifactLock(lockPath, operation) {
  await mkdir(path.dirname(lockPath), { recursive: true });
  try {
    await mkdir(lockPath);
  } catch (error) {
    if (error.code === "EEXIST") return { ok: false, reason: "artifact_writer_busy" };
    throw error;
  }
  try {
    return await operation();
  } finally {
    await rmdir(lockPath);
  }
}

export async function readOptional(file) {
  try {
    return await readFile(file);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function atomicArtifact(file, bytes, { immutable = false } = {}) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = file + "." + randomUUID() + ".tmp";
  try {
    await writeFile(temporary, bytes, { flag: "wx", flush: true });
    if (!immutable) {
      await rename(temporary, file);
      return;
    }
    try {
      await link(temporary, file);
    } catch (error) {
      if (error.code !== "EEXIST" || !(await readFile(file)).equals(Buffer.from(bytes))) throw error;
    }
  } finally {
    await rm(temporary, { force: true });
  }
}

function historyFact(row) {
  const { rebuiltAt, ...fact } = row;
  return fact;
}

function encode(record) {
  return Buffer.from(JSON.stringify(record, null, 2) + "\n");
}

/** Keep clean FT evidence even when the day cannot be promoted. Never infer missing facts. */
export async function journalHistoryBuild(root, build) {
  const rejectedIds = new Set((build.errors ?? []).map(error => error.matchId).filter(Boolean));
  const dayWideUnknown = (build.errors ?? []).some(error => !error.matchId);
  const journaled = [];
  for (const row of build.rows ?? []) {
    if (dayWideUnknown || rejectedIds.has(row.id)) continue;
    const record = { schema: "ai-matchlab.history-recovery-fact.v1", fact: historyFact(row) };
    const revision = fingerprint(record);
    await atomicArtifact(path.join(root, "facts", revision + ".json"), encode(record), { immutable: true });
    journaled.push({ id: row.id, revision });
  }
  let quarantineRevision = null;
  if (!build.ok && build.reason !== "no_verified_terminal_rows") {
    const record = { schema: "ai-matchlab.history-recovery-hold.v1", dayKey: build.dayKey,
      reason: build.reason, errors: build.errors ?? [], eligible: journaled };
    quarantineRevision = fingerprint(record);
    await atomicArtifact(path.join(root, "holds", quarantineRevision + ".json"), encode(record), { immutable: true });
  }
  return { journaled, quarantineRevision };
}

/** Approved correction links are an audit record. Recording a link never moves or edits history. */
export async function recordReviewedHistoryLink(root, decision) {
  if (!decision?.officialId || !decision?.reviewId ||
      !/^[a-f0-9]{64}$/u.test(decision.authoritySha256 ?? "") ||
      !["MOVED_DATE", "OFFICIAL_CORRECTION"].includes(decision.kind) ||
      !/^[a-f0-9]{64}$/u.test(decision.before ?? "") ||
      !/^[a-f0-9]{64}$/u.test(decision.after ?? "") || decision.before === decision.after) {
    throw new Error("reviewed_history_link_required");
  }
  const from = JSON.parse(await readFile(path.join(root, "facts", decision.before + ".json"), "utf8"));
  const to = JSON.parse(await readFile(path.join(root, "facts", decision.after + ".json"), "utf8"));
  if (fingerprint(from) !== decision.before || fingerprint(to) !== decision.after ||
      from.fact.leagueSlug !== to.fact.leagueSlug ||
      (decision.kind === "MOVED_DATE" && from.fact.dayKey === to.fact.dayKey)) {
    throw new Error("reviewed_history_link_conflict");
  }
  const record = { schema: "ai-matchlab.history-recovery-link.v1", decision };
  const revision = fingerprint(record);
  await atomicArtifact(path.join(root, "links", revision + ".json"), encode(record), { immutable: true });
  return revision;
}

/** No published generation advances without complete evidence and a current pointer. */
export async function promoteVerifiedGeneration({ pointer, expected, manifest, artifacts, certification }) {
  return withArtifactLock(pointer + ".lock", async () => {
    if (certification?.verdict !== "VERIFIED_READBACK" || !manifest?.day ||
        !/^[a-f0-9]{64}$/u.test(certification.registryBinding?.fingerprint ?? "") ||
        certification.registryBinding.publicReleaseAllowed !== true ||
        fingerprint(certification.registryBinding) !== fingerprint(manifest.registryBinding) ||
        !manifest.files || !artifacts || !Object.keys(manifest.files).length ||
        Object.keys(artifacts).length !== Object.keys(manifest.files).length ||
        certification.artifactSetHash !== fingerprint(manifest.files) ||
        Object.entries(manifest.files).some(([file, hash]) =>
          !Object.hasOwn(artifacts, file) || sha256(artifacts[file]) !== hash)) {
      return { ok: false, reason: "generation_not_certified" };
    }
    const bytes = encode(manifest);
    const revision = sha256(bytes);
    const current = await readOptional(pointer);
    const currentHash = current ? sha256(current) : null;
    if (currentHash === revision) return { ok: true, changed: false, revision };
    if (currentHash !== expected) return { ok: false, reason: "stale_generation_base", current: currentHash };
    await atomicArtifact(pointer, bytes);
    return { ok: true, changed: true, revision };
  });
}
