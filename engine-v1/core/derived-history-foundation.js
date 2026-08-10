import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { resolveDataPath } from "../storage/data-root.js";

export const DERIVED_FOUNDATION_SCHEMA = "ai-matchlab.derived-history-foundation.v1";

const HASH_CACHE = new Map();

function sha256Buffer(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fileSha256(file) {
  return sha256Buffer(fs.readFileSync(file));
}

function listFilesRecursive(root, predicate = () => true) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && predicate(full)) out.push(full);
    }
  };
  walk(root);
  return out;
}

function inventoryKey(files) {
  return files.map(file => {
    const st = fs.statSync(file);
    return `${file}\0${st.size}\0${st.mtimeMs}`;
  }).join("\n");
}

function aggregateFiles(files, baseRoot) {
  const existing = files.filter(file => fs.existsSync(file)).sort();
  const key = inventoryKey(existing);
  const cacheKey = `${baseRoot}|${key}`;
  if (HASH_CACHE.has(cacheKey)) return HASH_CACHE.get(cacheKey);
  const members = existing.map(file => ({
    path: path.relative(baseRoot, file).replaceAll(path.sep, "/"),
    bytes: fs.statSync(file).size,
    sha256: fileSha256(file),
  }));
  const sha256 = sha256Buffer(members.map(x => `${x.path}\0${x.bytes}\0${x.sha256}\n`).join(""));
  const result = {
    sha256,
    fileCount: members.length,
    bytes: members.reduce((sum, x) => sum + x.bytes, 0),
    members,
  };
  HASH_CACHE.set(cacheKey, result);
  return result;
}

export function computeCurrentHistoryFingerprintSync() {
  const root = resolveDataPath("history");
  return aggregateFiles(
    listFilesRecursive(root, file => file.endsWith(".json") && !file.endsWith(".report.json")),
    resolveDataPath(),
  );
}

export function computeHistoricalTruthFingerprintSync(season) {
  const dataRoot = resolveDataPath();
  const files = [];
  const history = resolveDataPath("history", `${season}.json`);
  if (fs.existsSync(history)) files.push(history);
  files.push(...listFilesRecursive(resolveDataPath("history-archive"), file => file.endsWith(".json")));
  files.push(...listFilesRecursive(resolveDataPath("team-aliases"), file => file.endsWith(".json")));
  for (const name of [
    "production-global-club-id-registry.v1.json",
    "fixture-retention-decision-ledger.v1.json",
    "production-identity-extension-ledger.v1.json",
    "production-team-identity-disambiguation-ledger.v1.json",
    "semantic-duplicate-decision-ledger.v1.json",
  ]) {
    const file = resolveDataPath("identity-decisions", name);
    if (fs.existsSync(file)) files.push(file);
  }
  return aggregateFiles([...new Set(files)], dataRoot);
}

function outputAggregate(paths) {
  return aggregateFiles(paths.filter(file => fs.existsSync(file)), resolveDataPath());
}

export function historyIndexFoundationPath(season) {
  return resolveDataPath("history-index", "foundation", `${season}.json`);
}

export function modelPriorsFoundationPath(season) {
  return resolveDataPath("model-priors", "foundation", `${season}.json`);
}

export function h2hFoundationPath() {
  return resolveDataPath("h2h-foundation", "current.json");
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function writeHistoryIndexFoundationSync(season) {
  const source = computeHistoricalTruthFingerprintSync(season);
  const outputs = outputAggregate([
    resolveDataPath("history-index", "team-form", `${season}.json`),
    resolveDataPath("history-index", "league-form", `${season}.json`),
    resolveDataPath("history-index", "matchups", `${season}.json`),
  ]);
  const artifact = {
    schema: DERIVED_FOUNDATION_SCHEMA,
    artifactType: "history-index",
    season,
    generatedAt: new Date().toISOString(),
    source,
    outputs,
    foundationFingerprint: sha256Buffer(`${source.sha256}\0${outputs.sha256}`),
  };
  writeJson(historyIndexFoundationPath(season), artifact);
  return artifact;
}

export function validateHistoryIndexFoundationSync(season) {
  const artifact = readJson(historyIndexFoundationPath(season));
  if (!artifact || artifact.schema !== DERIVED_FOUNDATION_SCHEMA || artifact.artifactType !== "history-index") {
    return { ok: false, reason: "missing_or_invalid_history_index_foundation", artifact };
  }
  const source = computeHistoricalTruthFingerprintSync(season);
  const outputs = outputAggregate([
    resolveDataPath("history-index", "team-form", `${season}.json`),
    resolveDataPath("history-index", "league-form", `${season}.json`),
    resolveDataPath("history-index", "matchups", `${season}.json`),
  ]);
  const expected = sha256Buffer(`${source.sha256}\0${outputs.sha256}`);
  const ok = source.sha256 === artifact.source?.sha256 && outputs.sha256 === artifact.outputs?.sha256 && expected === artifact.foundationFingerprint;
  return { ok, reason: ok ? null : "history_index_foundation_stale", artifact, current: { source, outputs, foundationFingerprint: expected } };
}

export function writeModelPriorsFoundationSync(season) {
  const source = computeHistoricalTruthFingerprintSync(season);
  const outputs = outputAggregate([resolveDataPath("model-priors", `${season}.json`)]);
  const artifact = {
    schema: DERIVED_FOUNDATION_SCHEMA,
    artifactType: "model-priors",
    season,
    generatedAt: new Date().toISOString(),
    source,
    outputs,
    foundationFingerprint: sha256Buffer(`${source.sha256}\0${outputs.sha256}`),
  };
  writeJson(modelPriorsFoundationPath(season), artifact);
  return artifact;
}

export function validateModelPriorsFoundationSync(season) {
  const artifact = readJson(modelPriorsFoundationPath(season));
  if (!artifact || artifact.schema !== DERIVED_FOUNDATION_SCHEMA || artifact.artifactType !== "model-priors") {
    return { ok: false, reason: "missing_or_invalid_model_priors_foundation", artifact };
  }
  const source = computeHistoricalTruthFingerprintSync(season);
  const outputs = outputAggregate([resolveDataPath("model-priors", `${season}.json`)]);
  const expected = sha256Buffer(`${source.sha256}\0${outputs.sha256}`);
  const ok = source.sha256 === artifact.source?.sha256 && outputs.sha256 === artifact.outputs?.sha256 && expected === artifact.foundationFingerprint;
  return { ok, reason: ok ? null : "model_priors_foundation_stale", artifact, current: { source, outputs, foundationFingerprint: expected } };
}

export function writeH2HFoundationSync() {
  const source = computeCurrentHistoryFingerprintSync();
  const outputs = aggregateFiles(
    listFilesRecursive(resolveDataPath("h2h"), file => file.endsWith(".json")),
    resolveDataPath(),
  );
  const artifact = {
    schema: DERIVED_FOUNDATION_SCHEMA,
    artifactType: "h2h",
    generatedAt: new Date().toISOString(),
    source,
    outputs,
    foundationFingerprint: sha256Buffer(`${source.sha256}\0${outputs.sha256}`),
  };
  writeJson(h2hFoundationPath(), artifact);
  return artifact;
}

export function validateH2HFoundationSync() {
  const artifact = readJson(h2hFoundationPath());
  if (!artifact || artifact.schema !== DERIVED_FOUNDATION_SCHEMA || artifact.artifactType !== "h2h") {
    return { ok: false, reason: "missing_or_invalid_h2h_foundation", artifact };
  }
  const source = computeCurrentHistoryFingerprintSync();
  const outputs = aggregateFiles(
    listFilesRecursive(resolveDataPath("h2h"), file => file.endsWith(".json")),
    resolveDataPath(),
  );
  const expected = sha256Buffer(`${source.sha256}\0${outputs.sha256}`);
  const ok = source.sha256 === artifact.source?.sha256 && outputs.sha256 === artifact.outputs?.sha256 && expected === artifact.foundationFingerprint;
  return { ok, reason: ok ? null : "h2h_foundation_stale", artifact, current: { source, outputs, foundationFingerprint: expected } };
}

export function clearDerivedFoundationHashCacheForTests() {
  HASH_CACHE.clear();
}
