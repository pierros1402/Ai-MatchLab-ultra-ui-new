import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getDataRoot } from "./data-root.js";

const schema = "ai-matchlab.value-decision-input-evidence.v1";
const digest = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const codeFiles = [
  "../core/build-value-day.js", "../core/value-engine-v1.js", "../core/build-match-intelligence.js",
  "../core/opponent-strength-adjusted-form.js", "../core/opponent-strength-profile-loader.js",
  "../core/plan-b-canonical-membership.js", "../core/plan-b-evaluation-accounting.js",
  "../jobs/derive-value-from-odds.js", "./value-decision-evidence.js"
];
// File hashes identify the source visible when this evidence module was loaded.
// They do not retrospectively certify an upstream assessment producer's inputs.
const codeAtModuleLoad = codeFiles.map(file => ({
  path: `engine-v1/${file.replace(/^\.\.\//u, "").replace(/^\.\//u, "storage/")}`,
  sha256: digest(fs.readFileSync(new URL(file, import.meta.url)))
}));

function encode(value) {
  return Buffer.from(JSON.stringify(value, (key, item) => {
    if (/^(?:api[_-]?key|authorization|password|credentials?|secrets?|access[_-]?token|cookies?)$/iu.test(key) && item != null && item !== "") {
      throw new Error("credential_field_in_value_input");
    }
    if (typeof item === "string" && /[?&](?:api[_-]?key|access_token)=/iu.test(item)) {
      throw new Error("credential_query_in_value_input");
    }
    if (typeof item === "undefined") return { __valueEvidenceType: "undefined" };
    if (typeof item === "number" && !Number.isFinite(item)) return { __valueEvidenceType: "number", value: String(item) };
    if (["bigint", "function", "symbol"].includes(typeof item)) throw new Error("unsupported_value_input_type");
    return item;
  }, 2) + "\n", "utf8");
}

function store(root, value) {
  const bytes = encode(value), sha256 = digest(bytes);
  const relative = `value/_execution-evidence/objects/${sha256.slice(0, 2)}/${sha256}.json`;
  const file = path.join(root, ...relative.split("/"));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    if (digest(fs.readFileSync(file)) !== sha256) throw new Error("immutable_value_input_evidence_conflict");
  } else {
    const temporary = `${file}.tmp-${crypto.randomUUID()}`;
    let fd;
    try {
      fd = fs.openSync(temporary, "wx"); fs.writeFileSync(fd, bytes); fs.fsyncSync(fd);
      fs.closeSync(fd); fd = undefined; fs.renameSync(temporary, file);
      if (process.platform !== "win32") {
        const directory = fs.openSync(path.dirname(file), "r");
        try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
      }
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
  return { path: `data/${relative}`, sha256, bytes: bytes.length };
}

export function createValueDecisionEvidence(dayKey, planId, sharedInputs, { dataRoot = getDataRoot() } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(dayKey) || !["plan-a", "plan-a2", "plan-b", "plan-b2"].includes(planId)) {
    throw new Error("invalid_value_evidence_identity");
  }
  const root = path.resolve(dataRoot), executionId = crypto.randomUUID(), records = [];
  const startedAt = new Date().toISOString();
  const github = {
    runId: /^\d+$/u.test(process.env.GITHUB_RUN_ID || "") ? process.env.GITHUB_RUN_ID : null,
    attempt: /^\d+$/u.test(process.env.GITHUB_RUN_ATTEMPT || "") ? process.env.GITHUB_RUN_ATTEMPT : null,
    workflowHead: /^[a-f0-9]{40}$/u.test(process.env.GITHUB_SHA || "") ? process.env.GITHUB_SHA : null
  };
  function capture(stage, components, canonicalMatchId = null) {
    try {
      const inputs = Object.fromEntries(Object.entries(components).map(([key, value]) => [key, store(root, value)]));
      const receipt = store(root, { schema, executionId, targetDay: dayKey, planId, stage,
        canonicalMatchId, capturedAt: new Date().toISOString(), github, inputs,
        sourceFilesAtModuleLoad: codeAtModuleLoad,
        encoding: "json_with_explicit_undefined_and_nonfinite_number_tags.v1",
        scope: "actual_value_selector_arguments_and_derived_context_for_this_execution",
        originalHistoricalObservationCertified: false, upstreamRawInputLineageFullyCertified: false });
      records.push({ stage, canonicalMatchId, receipt });
      return receipt;
    } catch (cause) {
      const error = new Error("Value decision input evidence could not be persisted", { cause });
      error.code = "VALUE_DECISION_EVIDENCE_FAILED";
      throw error;
    }
  }
  capture("shared_inputs", sharedInputs);
  return {
    capture,
    summary() {
      return { schema, executionId, targetDay: dayKey, planId, startedAt, github, records: [...records],
        scope: "runtime_value_selector_input_capture_not_reconstructed_historical_evidence",
        upstreamRawInputLineageFullyCertified: false };
    }
  };
}
