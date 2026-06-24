import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = path.join(ROOT, "data", "football-truth", "_diagnostics", `existing-reusable-family-inventory-${DATE}`);

const FAMILY_HINTS = [
  { familyId: "laliga", patterns: [/laliga/i, /esp\.[12]/i], expectedSlugs: ["esp.1", "esp.2"] },
  { familyId: "bundesliga", patterns: [/bundesliga/i, /dfb/i, /ger\.[123]/i], expectedSlugs: ["ger.1", "ger.2", "ger.3"] },
  { familyId: "spfl", patterns: [/spfl/i, /sco\.[12]/i], expectedSlugs: ["sco.1", "sco.2"] },
  { familyId: "norway_ntf", patterns: [/norway/i, /ntf/i, /eliteserien/i, /nor\.[12]/i], expectedSlugs: ["nor.1", "nor.2"] },
  { familyId: "sportomedia_sef", patterns: [/sportomedia/i, /sef/i, /allsvenskan/i, /superettan/i, /swe\.[12]/i], expectedSlugs: ["swe.1", "swe.2"] },
  { familyId: "torneopal", patterns: [/torneopal/i, /veikkausliiga/i, /fin\.[12]/i], expectedSlugs: ["fin.1", "fin.2"] },
  { familyId: "ksi", patterns: [/ksi/i, /iceland/i, /isl\.[12]/i], expectedSlugs: ["isl.1", "isl.2"] },
  { familyId: "loi_ajax", patterns: [/leagueofireland/i, /\bloi\b/i, /ajax/i, /irl\.[12]/i], expectedSlugs: ["irl.1", "irl.2"] },
  { familyId: "cfa_cyprus_html", patterns: [/cyprus/i, /\bcfa\b/i, /cyp\.[12]/i], expectedSlugs: ["cyp.1", "cyp.2"] },
  { familyId: "eredivisie", patterns: [/eredivisie/i, /ned\.1/i], expectedSlugs: ["ned.1"] },
  { familyId: "hnl", patterns: [/\bhnl\b/i, /cro\.1/i], expectedSlugs: ["cro.1"] },
  { familyId: "superliga_dk", patterns: [/superliga/i, /den\.1/i, /api\.superliga\.dk/i], expectedSlugs: ["den.1"] },
  { familyId: "jleague", patterns: [/jleague/i, /jpn\.[12]/i], expectedSlugs: ["jpn.1", "jpn.2"] }
];

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function rel(p) { return path.relative(ROOT, p).replaceAll("\\", "/"); }
function sha(v) { return crypto.createHash("sha256").update(String(v)).digest("hex"); }
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && !/node_modules|\.git|_diagnostics|dist|build|coverage/i.test(full)) out.push(...walk(full));
    else if (e.isFile() && /\.(js|mjs|cjs|json|jsonl|ts)$/i.test(e.name)) out.push(full);
  }
  return out;
}
function read(file) {
  try { return fs.readFileSync(file, "utf8"); } catch { return ""; }
}
function familyMatches(file, text) {
  const hay = `${file}\n${text}`;
  return FAMILY_HINTS
    .map((f) => ({ familyId: f.familyId, expectedSlugs: f.expectedSlugs, score: f.patterns.reduce((a, p) => a + (p.test(hay) ? 1 : 0), 0) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}
function classifyFile(file, text) {
  const r = rel(file);
  const lower = r.toLowerCase();
  const isJob = /engine-v1\/jobs\//.test(r);
  const isConfig = /engine-v1\/config\//.test(r);
  const allowFetch = /--allow-fetch/.test(text);
  const allowRender = /--allow-render/.test(text);
  const writesRows = /jsonl|rowsOutput|acceptedRows|canonical candidate|canonicalWrite/i.test(text);
  const hasFetch = /\bfetch\s*\(|fetchExecutedNowCount|allow-fetch/i.test(text);
  const hasBrowser = /puppeteer|playwright|chrome|browserRender|allow-render/i.test(text);
  const hasTruthGates = /expectedRowCount|expectedRows|teamSignals|arithmetic|seasonScope|seasonLabel|validationStatus|qualityGateStatus|nonTrivial|duplicate/i.test(text);
  const reviewOnly = /review|candidate|approval|diagnostic/i.test(lower) && !/adapter|runner|proof/i.test(lower);
  const executable = isJob && (hasFetch || hasBrowser || hasTruthGates || /adapter|runner|proof/i.test(lower));
  return { isJob, isConfig, allowFetch, allowRender, writesRows, hasFetch, hasBrowser, hasTruthGates, reviewOnly, executable };
}

ensureDir(OUT_DIR);

const files = [
  ...walk(path.join(ROOT, "engine-v1", "jobs")),
  ...walk(path.join(ROOT, "engine-v1", "config"))
];

const evidence = [];
for (const file of files) {
  const text = read(file);
  const matches = familyMatches(file, text);
  if (!matches.length) continue;
  const cls = classifyFile(file, text);
  for (const m of matches.slice(0, 3)) {
    evidence.push({
      familyId: m.familyId,
      file: rel(file),
      fileSha256: sha(text),
      matchScore: m.score,
      expectedSlugs: m.expectedSlugs,
      ...cls
    });
  }
}

const grouped = new Map();
for (const e of evidence) {
  if (!grouped.has(e.familyId)) {
    const hint = FAMILY_HINTS.find((f) => f.familyId === e.familyId);
    grouped.set(e.familyId, {
      familyId: e.familyId,
      expectedSlugs: hint?.expectedSlugs || [],
      fileCount: 0,
      jobCount: 0,
      configCount: 0,
      executableJobCount: 0,
      fetchJobCount: 0,
      renderJobCount: 0,
      truthGateFileCount: 0,
      reviewOnlyFileCount: 0,
      files: [],
      executableJobs: [],
      configs: [],
      recommendedExecutionMode: "unknown",
      recommendedNextAction: "classify_manually"
    });
  }
  const g = grouped.get(e.familyId);
  g.fileCount++;
  if (e.isJob) g.jobCount++;
  if (e.isConfig) g.configCount++;
  if (e.executable) g.executableJobCount++;
  if (e.hasFetch) g.fetchJobCount++;
  if (e.hasBrowser) g.renderJobCount++;
  if (e.hasTruthGates) g.truthGateFileCount++;
  if (e.reviewOnly) g.reviewOnlyFileCount++;
  g.files.push(e);
  if (e.executable && e.isJob) g.executableJobs.push(e.file);
  if (e.isConfig) g.configs.push(e.file);
}

const families = [...grouped.values()].map((g) => {
  g.files.sort((a, b) => b.matchScore - a.matchScore || a.file.localeCompare(b.file));
  g.executableJobs = [...new Set(g.executableJobs)].sort();
  g.configs = [...new Set(g.configs)].sort();

  if (g.configCount > 0 && g.executableJobCount > 0 && g.truthGateFileCount > 0) {
    g.recommendedExecutionMode = "existing_config_plus_runner";
    g.recommendedNextAction = "wrap_in_reusable_family_control_plane";
  } else if (g.executableJobCount > 0 && g.truthGateFileCount > 0) {
    g.recommendedExecutionMode = "existing_runner_needs_config_contract";
    g.recommendedNextAction = "extract_family_config_contract_then_wrap";
  } else if (g.executableJobCount > 0) {
    g.recommendedExecutionMode = "existing_runner_needs_gate_audit";
    g.recommendedNextAction = "audit_runner_for_truth_gates_before_execution";
  } else if (g.configCount > 0) {
    g.recommendedExecutionMode = "config_without_runner_or_runner_not_detected";
    g.recommendedNextAction = "find_or_build_runner_for_existing_config";
  } else {
    g.recommendedExecutionMode = "evidence_only";
    g.recommendedNextAction = "do_not_execute_until_adapter_contract_exists";
  }

  return g;
}).sort((a, b) =>
  Number(b.recommendedNextAction === "wrap_in_reusable_family_control_plane") - Number(a.recommendedNextAction === "wrap_in_reusable_family_control_plane") ||
  b.executableJobCount - a.executableJobCount ||
  b.truthGateFileCount - a.truthGateFileCount ||
  a.familyId.localeCompare(b.familyId)
);

const executableOrRefreshable = families.filter((f) =>
  ["wrap_in_reusable_family_control_plane", "extract_family_config_contract_then_wrap", "audit_runner_for_truth_gates_before_execution"].includes(f.recommendedNextAction)
);

const summary = {
  status: "passed",
  runner: "existing_reusable_family_inventory",
  contractVersion: 1,
  purpose: "scan repository for existing reusable football-truth family jobs/configs before building more candidate-patching code",
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  rawPayloadWriteExecutedNowCount: 0,
  scannedFileCount: files.length,
  evidenceRowCount: evidence.length,
  familyCount: families.length,
  executableOrRefreshableFamilyCount: executableOrRefreshable.length,
  executableOrRefreshableSlugCount: new Set(executableOrRefreshable.flatMap((f) => f.expectedSlugs)).size,
  immediateWrapFamilyCount: families.filter((f) => f.recommendedNextAction === "wrap_in_reusable_family_control_plane").length,
  contractExtractionNeededFamilyCount: families.filter((f) => f.recommendedNextAction === "extract_family_config_contract_then_wrap").length,
  gateAuditNeededFamilyCount: families.filter((f) => f.recommendedNextAction === "audit_runner_for_truth_gates_before_execution").length,
  recommendedFamilyOrder: executableOrRefreshable.map((f) => ({
    familyId: f.familyId,
    expectedSlugs: f.expectedSlugs,
    mode: f.recommendedExecutionMode,
    action: f.recommendedNextAction,
    executableJobs: f.executableJobs.slice(0, 8),
    configs: f.configs.slice(0, 8)
  })),
  hardRule: "do not create new league-specific patches before wrapping or auditing existing reusable families",
  recommendedNextLane: "build_safety_wrapped_bulk_execution_runner_for_existing_reusable_families"
};

const outPath = path.join(OUT_DIR, `existing-reusable-family-inventory-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `existing-reusable-family-inventory-rows-${DATE}.jsonl`);
const evidencePath = path.join(OUT_DIR, `existing-reusable-family-evidence-rows-${DATE}.jsonl`);
const executablePath = path.join(OUT_DIR, `existing-reusable-family-executable-or-refreshable-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({ summary, families, executableOrRefreshable }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, families.map((r) => JSON.stringify(r)).join("\n") + (families.length ? "\n" : ""), "utf8");
fs.writeFileSync(evidencePath, evidence.map((r) => JSON.stringify(r)).join("\n") + (evidence.length ? "\n" : ""), "utf8");
fs.writeFileSync(executablePath, executableOrRefreshable.map((r) => JSON.stringify(r)).join("\n") + (executableOrRefreshable.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  evidenceOutput: rel(evidencePath),
  executableOrRefreshableOutput: rel(executablePath),
  summary
}, null, 2));
