import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = path.join(ROOT, "data", "football-truth", "_diagnostics", `existing-reusable-family-invocation-contracts-${DATE}`);

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function rel(p) { return path.relative(ROOT, p).replaceAll("\\", "/"); }
function abs(p) { return p ? path.join(ROOT, p) : null; }
function exists(p) { return Boolean(p && fs.existsSync(abs(p))); }
function read(p) { try { return fs.readFileSync(abs(p), "utf8"); } catch { return ""; } }
function sha(v) { return crypto.createHash("sha256").update(String(v)).digest("hex"); }

function inspectRunner(runner) {
  const text = read(runner);
  return {
    fileExists: exists(runner),
    fileSha256: text ? sha(text) : null,
    requiresAllowFetch: /--allow-fetch/.test(text),
    requiresAllowRender: /--allow-render/.test(text),
    emitsSeasonScope: /seasonScope/.test(text),
    emitsSeasonLabel: /seasonLabel/.test(text),
    hasExpectedRowsGate: /expectedRowCount|expectedRows|expected row/i.test(text),
    hasTeamSignalGate: /teamSignals|expectedTeamSignals|team signal/i.test(text),
    hasArithmeticGate: /arithmetic|won\s*\+\s*drawn\s*\+\s*lost|points\s*===|w\s*\*\s*3/i.test(text),
    hasNonTrivialGate: /nonTrivial|totalPlayed|totalPoints|max points|maxPoints/i.test(text),
    hasDuplicateGate: /duplicate|signature/i.test(text),
    hasQualityGateStatus: /qualityGateStatus/.test(text),
    hasValidationStatus: /validationStatus/.test(text),
    hasCanonicalWrite: /canonicalWrite|canonical candidate|canonical-candidate/i.test(text),
    hasProductionWrite: /productionWrite|production write/i.test(text),
    hasFetch: /\bfetch\s*\(|allow-fetch|fetchExecutedNowCount/i.test(text),
    hasBrowserRender: /puppeteer|playwright|chrome|allow-render|browserRender/i.test(text)
  };
}

function gateCount(i) {
  if (!i) return 0;
  return [
    i.emitsSeasonScope,
    i.emitsSeasonLabel,
    i.hasExpectedRowsGate,
    i.hasTeamSignalGate,
    i.hasArithmeticGate,
    i.hasNonTrivialGate,
    i.hasDuplicateGate,
    i.hasQualityGateStatus,
    i.hasValidationStatus
  ].filter(Boolean).length;
}

ensureDir(OUT_DIR);

const CONTRACT_SPECS = [
  {
    familyId: "central_browser_rendered_official",
    expectedSlugs: ["esp.1","esp.2","ger.1","ger.2","ger.3","cro.1","sco.1","sco.2","ned.1"],
    lane: "previous_completed",
    contractClass: "executable_contract",
    runner: "engine-v1/jobs/run-football-truth-browser-rendered-official-standings-adapter-file.js",
    config: "engine-v1/config/football-truth-browser-rendered-official-route-families.json",
    requiredArgs: ["--allow-render"],
    expectedOutputRegex: "browser-rendered-official-standings-adapter-YYYY-MM-DD.json"
  },
  {
    familyId: "central_official_api",
    expectedSlugs: ["den.1"],
    lane: "previous_completed",
    contractClass: "executable_contract",
    runner: "engine-v1/jobs/run-football-truth-official-api-standings-adapter-file.js",
    config: "engine-v1/config/football-truth-official-api-route-families.json",
    requiredArgs: ["--allow-fetch"],
    expectedOutputRegex: "official-api-standings-adapter-YYYY-MM-DD.json"
  },
  {
    familyId: "jleague_official_html_proof",
    expectedSlugs: ["jpn.1"],
    lane: "previous_completed",
    contractClass: "executable_contract",
    runner: "engine-v1/jobs/build-football-truth-jleague-official-html-standings-proof-file.js",
    config: null,
    requiredArgs: [],
    expectedOutputRegex: "jleague-official-html-standings-proof-YYYY-MM-DD.json"
  },
  {
    familyId: "georgia_current_or_new_proof_v2",
    expectedSlugs: ["geo.1"],
    lane: "current_or_new",
    contractClass: "executable_contract",
    runner: "engine-v1/jobs/build-football-truth-georgia-current-season-table-proof-v2-file.js",
    config: null,
    requiredArgs: ["--allow-fetch"],
    expectedOutputRegex: "georgia-current-season-table-proof-v2-YYYY-MM-DD.json"
  },
  {
    familyId: "norway_ntf",
    expectedSlugs: ["nor.1","nor.2"],
    lane: "previous_completed",
    contractClass: "refreshable_needs_gate_audit",
    runner: "engine-v1/jobs/run-football-truth-norway-ntf-canonical-candidate-proposal-quality-gate-file.js",
    config: null,
    requiredArgs: ["--allow-fetch"],
    expectedOutputRegex: null,
    blockerReason: "legacy canonical-candidate runner needs modern seasonScope/row-output/gate audit before truth-row acceptance"
  },
  {
    familyId: "sportomedia_sef",
    expectedSlugs: ["swe.1","swe.2"],
    lane: "previous_completed",
    contractClass: "refreshable_needs_gate_audit",
    runner: "engine-v1/jobs/run-football-truth-controlled-sportomedia-exact-graphql-standings-extraction-runner-file.js",
    config: null,
    requiredArgs: ["--allow-fetch"],
    expectedOutputRegex: null,
    blockerReason: "legacy GraphQL extraction runner needs modern seasonScope/row-output/gate audit before truth-row acceptance"
  },
  {
    familyId: "loi_ajax",
    expectedSlugs: ["irl.1","irl.2"],
    lane: "previous_completed",
    contractClass: "refreshable_needs_gate_audit",
    runner: "engine-v1/jobs/build-uefa-loi-ajax-normalized-rows-file.js",
    config: null,
    requiredArgs: [],
    expectedOutputRegex: null,
    blockerReason: "normalized-row helper needs route identity, expected-row, arithmetic and season-scope audit before truth-row acceptance"
  },
  {
    familyId: "torneopal",
    expectedSlugs: ["fin.1","fin.2"],
    lane: "previous_completed",
    contractClass: "blocked_exact_runner_contract_missing",
    runner: null,
    config: null,
    requiredArgs: [],
    expectedOutputRegex: null,
    blockerReason: "no exact Torneopal/Veikkausliiga family runner contract identified; must not borrow central rendered runner"
  },
  {
    familyId: "ksi",
    expectedSlugs: ["isl.1","isl.2"],
    lane: "previous_completed",
    contractClass: "blocked_exact_runner_contract_missing",
    runner: null,
    config: null,
    requiredArgs: [],
    expectedOutputRegex: null,
    blockerReason: "no exact KSI family runner contract identified; must not borrow central rendered runner"
  },
  {
    familyId: "cfa_cyprus_html",
    expectedSlugs: ["cyp.1","cyp.2"],
    lane: "previous_completed",
    contractClass: "blocked_exact_runner_contract_missing",
    runner: null,
    config: null,
    requiredArgs: [],
    expectedOutputRegex: null,
    blockerReason: "no exact CFA Cyprus HTML family runner contract identified; must not borrow J.League proof runner"
  }
];

const contracts = CONTRACT_SPECS.map((spec) => {
  const runnerInspection = spec.runner ? inspectRunner(spec.runner) : null;
  const configInspection = spec.config ? { fileExists: exists(spec.config), fileSha256: sha(read(spec.config)) } : null;

  let contractStatus = spec.contractClass;
  const validationErrors = [];

  if (spec.runner && !runnerInspection?.fileExists) validationErrors.push("runner_missing");
  if (spec.config && !configInspection?.fileExists) validationErrors.push("config_missing");

  if (spec.contractClass === "executable_contract") {
    if (validationErrors.length) contractStatus = "blocked_invalid_executable_contract";
    if (runnerInspection?.requiresAllowFetch && !spec.requiredArgs.includes("--allow-fetch")) validationErrors.push("missing_required_allow_fetch_arg");
    if (runnerInspection?.requiresAllowRender && !spec.requiredArgs.includes("--allow-render")) validationErrors.push("missing_required_allow_render_arg");
    if (runnerInspection?.hasCanonicalWrite || runnerInspection?.hasProductionWrite) validationErrors.push("runner_has_write_surface_requires_manual_review");
  }

  return {
    familyId: spec.familyId,
    expectedSlugs: spec.expectedSlugs,
    lane: spec.lane,
    runner: spec.runner,
    config: spec.config,
    requiredArgs: spec.requiredArgs,
    expectedOutputRegex: spec.expectedOutputRegex,
    contractStatus,
    gateCount: gateCount(runnerInspection),
    runnerInspection,
    configInspection,
    validationErrors,
    commandTemplate: spec.runner ? `node ${spec.runner}${spec.requiredArgs.length ? " " + spec.requiredArgs.join(" ") : ""}` : null,
    promotionAllowed: contractStatus === "executable_contract",
    blockerReason: spec.blockerReason || null,
    promotionRule: "only exact family contracts can emit truth rows; never substitute unrelated runner based on keyword match"
  };
});

const executableContracts = contracts.filter((c) => c.contractStatus === "executable_contract");
const refreshableContracts = contracts.filter((c) => c.contractStatus === "refreshable_needs_gate_audit");
const blockedContracts = contracts.filter((c) => c.contractStatus.startsWith("blocked"));

const falseExecutableFamilies = ["torneopal", "ksi", "cfa_cyprus_html"];
const falseExecutableLeaks = executableContracts.filter((c) => falseExecutableFamilies.includes(c.familyId));
if (falseExecutableLeaks.length) throw new Error(`False executable families leaked through whitelist: ${falseExecutableLeaks.map((c) => c.familyId).join(", ")}`);

const summary = {
  status: "passed",
  runner: "existing_reusable_family_invocation_contracts",
  contractVersion: 2,
  purpose: "strict invocation whitelist with exact runner/config contracts; no keyword-based runner substitution",
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  rawPayloadWriteExecutedNowCount: 0,
  familySpecCount: CONTRACT_SPECS.length,
  executableContractCount: executableContracts.length,
  refreshableNeedsGateAuditCount: refreshableContracts.length,
  blockedContractCount: blockedContracts.length,
  executableSlugCount: new Set(executableContracts.flatMap((c) => c.expectedSlugs)).size,
  refreshableSlugCount: new Set(refreshableContracts.flatMap((c) => c.expectedSlugs)).size,
  blockedSlugCount: new Set(blockedContracts.flatMap((c) => c.expectedSlugs)).size,
  executableFamilies: executableContracts.map((c) => ({ familyId: c.familyId, expectedSlugs: c.expectedSlugs, commandTemplate: c.commandTemplate, gateCount: c.gateCount })),
  refreshableFamilies: refreshableContracts.map((c) => ({ familyId: c.familyId, expectedSlugs: c.expectedSlugs, runner: c.runner, gateCount: c.gateCount, blockerReason: c.blockerReason })),
  blockedFamilies: blockedContracts.map((c) => ({ familyId: c.familyId, expectedSlugs: c.expectedSlugs, status: c.contractStatus, blockerReason: c.blockerReason })),
  falseExecutableFamiliesBlocked: falseExecutableFamilies,
  hardRule: "run executable contracts only; refreshable and blocked contracts cannot emit truth rows",
  recommendedNextLane: "run_safety_wrapped_executable_contracts_then_gate_audit_refreshable_contracts"
};

const outPath = path.join(OUT_DIR, `existing-reusable-family-invocation-contracts-${DATE}.json`);
const contractsPath = path.join(OUT_DIR, `existing-reusable-family-invocation-contracts-rows-${DATE}.jsonl`);
const executablePath = path.join(OUT_DIR, `existing-reusable-family-executable-contracts-${DATE}.jsonl`);
const refreshablePath = path.join(OUT_DIR, `existing-reusable-family-refreshable-contracts-${DATE}.jsonl`);
const blockedPath = path.join(OUT_DIR, `existing-reusable-family-blocked-contracts-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({ summary, contracts, executableContracts, refreshableContracts, blockedContracts }, null, 2) + "\n", "utf8");
fs.writeFileSync(contractsPath, contracts.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
fs.writeFileSync(executablePath, executableContracts.map((r) => JSON.stringify(r)).join("\n") + (executableContracts.length ? "\n" : ""), "utf8");
fs.writeFileSync(refreshablePath, refreshableContracts.map((r) => JSON.stringify(r)).join("\n") + (refreshableContracts.length ? "\n" : ""), "utf8");
fs.writeFileSync(blockedPath, blockedContracts.map((r) => JSON.stringify(r)).join("\n") + (blockedContracts.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  contractsOutput: rel(contractsPath),
  executableContractsOutput: rel(executablePath),
  refreshableContractsOutput: rel(refreshablePath),
  blockedContractsOutput: rel(blockedPath),
  summary
}, null, 2));
