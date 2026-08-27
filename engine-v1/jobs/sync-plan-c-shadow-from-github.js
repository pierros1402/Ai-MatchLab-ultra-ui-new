import crypto from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promoteDirectory, resolveImmutableGithubRef } from "./sync-deploy-snapshot-from-github.js";
import { resolveDataPath } from "../storage/data-root.js";
import { validatePlanCShadowDay } from "../value/plan-c-shadow-export.js";

const DEFAULT_REPO = process.env.SNAPSHOT_SYNC_REPO || "pierros1402/Ai-MatchLab-ultra-ui-new";
const DEFAULT_REF = process.env.SNAPSHOT_SYNC_BRANCH || "main";
const FETCH_TIMEOUT_MS = Number(process.env.SNAPSHOT_SYNC_FETCH_TIMEOUT_MS || 30000);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/u;

function clean(value) {
  return String(value ?? "").trim();
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function parseJsonBuffer(buffer, label) {
  try {
    return JSON.parse(Buffer.from(buffer).toString("utf8"));
  } catch (error) {
    throw new Error(`${label}_json_invalid:${clean(error?.message || error)}`);
  }
}

function rawUrl(repo, ref, repoPath) {
  const safePath = repoPath.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${repo}/${ref}/${safePath}`;
}

async function fetchRequired(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "aimatchlab-plan-c-shadow-sync/1" }
    });
    if (!response.ok) throw new Error(`plan_c_shadow_download_failed:${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

export function validatePlanCShadowSyncPair({ dayKey, payloadBuffer, auditBuffer }) {
  const day = clean(dayKey);
  if (!DAY_RE.test(day)) throw new Error("plan_c_shadow_sync_day_invalid");
  const payload = parseJsonBuffer(payloadBuffer, "plan_c_shadow_payload");
  const validation = validatePlanCShadowDay(payload, day);
  if (!validation.ok) {
    throw new Error(`plan_c_shadow_sync_payload_invalid:${validation.errors.join(",")}`);
  }
  const audit = parseJsonBuffer(auditBuffer, "plan_c_shadow_audit");
  const payloadSha256 = sha256(payloadBuffer);
  if (
    audit?.schema !== "ai-matchlab.plan-c-shadow-build-audit.v1" ||
    audit?.ok !== true ||
    audit?.date !== day ||
    audit?.productionEligible !== false ||
    audit?.outputSha256 !== payloadSha256 ||
    audit?.count !== validation.count ||
    audit?.pickCount !== validation.pickCount
  ) {
    throw new Error("plan_c_shadow_sync_audit_binding_invalid");
  }
  return {
    payload,
    audit,
    payloadSha256,
    auditSha256: sha256(auditBuffer),
    count: validation.count,
    pickCount: validation.pickCount
  };
}

export async function syncPlanCShadowFromGithub(dayKey, options = {}) {
  const day = clean(dayKey);
  if (!DAY_RE.test(day)) throw new Error("plan_c_shadow_sync_day_invalid");
  const repo = clean(options.repo || DEFAULT_REPO);
  const ref = await resolveImmutableGithubRef(options.ref || DEFAULT_REF, repo);
  const basePath = "data/plan-c-shadow";
  const payloadBuffer = await fetchRequired(rawUrl(repo, ref, `${basePath}/${day}.json`));
  const auditBuffer = await fetchRequired(rawUrl(repo, ref, `${basePath}/_audit/${day}.json`));
  const verified = validatePlanCShadowSyncPair({ dayKey: day, payloadBuffer, auditBuffer });

  const runtimeBase = options.runtimeRoot || resolveDataPath("runtime-releases", "plan-c-shadow");
  await fsp.mkdir(runtimeBase, { recursive: true });
  const stageDir = await fsp.mkdtemp(path.join(runtimeBase, `.stage-${day}-`));
  const targetDir = path.join(runtimeBase, day);
  const backupDir = path.join(runtimeBase, `.backup-${day}-${process.pid}-${Date.now()}`);
  const release = {
    schema: "ai-matchlab.plan-c-shadow-runtime-release.v1",
    ok: true,
    mode: "SHADOW",
    productionEligible: false,
    date: day,
    repo,
    ref,
    payloadSha256: verified.payloadSha256,
    auditSha256: verified.auditSha256,
    count: verified.count,
    pickCount: verified.pickCount
  };

  try {
    await fsp.writeFile(path.join(stageDir, "plan-c-shadow.json"), payloadBuffer);
    await fsp.writeFile(path.join(stageDir, "plan-c-shadow-audit.json"), auditBuffer);
    await fsp.writeFile(path.join(stageDir, "release.json"), `${JSON.stringify(release, null, 2)}\n`, "utf8");
    await promoteDirectory(stageDir, targetDir, backupDir);
  } finally {
    await fsp.rm(stageDir, { recursive: true, force: true }).catch(() => {});
    await fsp.rm(backupDir, { recursive: true, force: true }).catch(() => {});
  }

  return {
    ok: true,
    dayKey: day,
    repo,
    ref,
    payloadSha256: verified.payloadSha256,
    auditSha256: verified.auditSha256,
    count: verified.count,
    pickCount: verified.pickCount,
    productionEligible: false
  };
}

function parseCliArgs(argv) {
  const out = { day: "", ref: "" };
  for (const token of argv) {
    if (token.startsWith("--day=")) out.day = token.slice(6);
    else if (token.startsWith("--ref=")) out.ref = token.slice(6);
    else if (!token.startsWith("--") && !out.day) out.day = token;
    else throw new Error(`unknown_argument:${token}`);
  }
  return out;
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const args = parseCliArgs(process.argv.slice(2));
  syncPlanCShadowFromGithub(args.day, { ref: args.ref || DEFAULT_REF })
    .then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch(error => {
      process.stderr.write(`[plan-c-shadow-sync] fatal ${String(error?.stack || error)}\n`);
      process.stdout.write(`${JSON.stringify({ ok: false, error: clean(error?.message || error) })}\n`);
      process.exitCode = 1;
    });
}
