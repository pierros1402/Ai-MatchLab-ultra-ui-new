import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = path.join(ROOT, "data", "football-truth", "_diagnostics", `existing-reusable-family-invocation-contracts-${DATE}`);

const FAMILY_SPECS = [
  {
    familyId: "central_browser_rendered_official",
    expectedSlugs: ["esp.1","esp.2","ger.1","ger.2","ger.3","cro.1","sco.1","sco.2","ned.1"],
    exactRunner: "engine-v1/jobs/run-football-truth-browser-rendered-official-standings-adapter-file.js",
    config: "engine-v1/config/football-truth-browser-rendered-official-route-families.json",
    requiredArgs: ["--allow-render"],
    expectedOutputRegex: "browser-rendered-official-standings-adapter-YYYY-MM-DD.json",
    lane: "previous_completed"
  },
  {
    familyId: "central_official_api",
    expectedSlugs: ["den.1"],
    exactRunner: "engine-v1/jobs/run-football-truth-official-api-standings-adapter-file.js",
    config: "engine-v1/config/football-truth-official-api-route-families.json",
    requiredArgs: ["--allow-fetch"],
    expectedOutputRegex: "official-api-standings-adapter-YYYY-MM-DD.json",
    lane: "previous_completed"
  },
  {
    familyId: "jleague_official_html_proof",
    expectedSlugs: ["jpn.1"],
    exactRunner: "engine-v1/jobs/build-football-truth-jleague-official-html-standings-proof-file.js",
    config: null,
    requiredArgs: [],
    expectedOutputRegex: "jleague-official-html-standings-proof-YYYY-MM-DD.json",
    lane: "previous_completed"
  },
  {
    familyId: "georgia_current_or_new_proof_v2",
    expectedSlugs: ["geo.1"],
    exactRunner: "engine-v1/jobs/build-football-truth-georgia-current-season-table-proof-v2-file.js",
    config: null,
    requiredArgs: ["--allow-fetch"],
    expectedOutputRegex: "georgia-current-season-table-proof-v2-YYYY-MM-DD.json",
    lane: "current_or_new"
  },
  {
    familyId: "norway_ntf",
    expectedSlugs: ["nor.1","nor.2"],
    filenameHints: [/ntf/i, /norway/i, /eliteserien/i],
    strongFilenameHints: [/standings/i, /extract/i, /parser/i, /runner/i, /canonical/i, /quality/i],
    excludeHints: [/team-geo/i, /wikidata/i, /news/i, /fixture/i],
    lane: "previous_completed"
  },
  {
    familyId: "sportomedia_sef",
    expectedSlugs: ["swe.1","swe.2"],
    filenameHints: [/sportomedia/i, /\bsef\b/i, /allsvenskan/i, /superettan/i],
    strongFilenameHints: [/standings/i, /extract/i, /route-contract/i, /local-context/i, /runner/i, /validation/i],
    excludeHints: [/fixture/i, /news/i],
    lane: "previous_completed"
  },
  {
    familyId: "torneopal",
    expectedSlugs: ["fin.1","fin.2"],
    filenameHints: [/torneopal/i, /veikkaus/i, /finland/i],
    strongFilenameHints: [/standings/i, /extract/i, /adapter/i, /runner/i, /validation/i],
    excludeHints: [/fixture/i, /news/i],
    lane: "previous_completed"
  },
  {
    familyId: "ksi",
    expectedSlugs: ["isl.1","isl.2"],
    filenameHints: [/\bksi\b/i, /iceland/i, /isl/i],
    strongFilenameHints: [/standings/i, /stada/i, /extract/i, /adapter/i, /runner/i],
    excludeHints: [/team-geo/i, /wikidata/i, /news/i],
    lane: "previous_completed"
  },
  {
    familyId: "loi_ajax",
    expectedSlugs: ["irl.1","irl.2"],
    filenameHints: [/leagueofireland/i, /\bloi\b/i, /ajax/i, /ireland/i],
    strongFilenameHints: [/standings/i, /extract/i, /ajax/i, /adapter/i, /runner/i],
    excludeHints: [/fixture/i, /news/i],
    lane: "previous_completed"
  },
  {
    familyId: "cfa_cyprus_html",
    expectedSlugs: ["cyp.1","cyp.2"],
    filenameHints: [/cyprus/i, /\bcfa\b/i, /cyp/i],
    strongFilenameHints: [/standings/i, /html/i, /extract/i, /adapter/i, /runner/i],
    excludeHints: [/team-geo/i, /wikidata/i, /news/i],
    lane: "previous_completed"
  }
];

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function rel(p) { return path.relative(ROOT, p).replaceAll("\\", "/"); }
function sha(v) { return crypto.createHash("sha256").update(String(v)).digest("hex"); }
function exists(relPath) { return relPath && fs.existsSync(path.join(ROOT, relPath)); }
function read(relPath) {
  try { return fs.readFileSync(path.join(ROOT, relPath), "utf8"); } catch { return ""; }
}
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && !/node_modules|\.git|_diagnostics|dist|build|coverage/i.test(full)) out.push(...walk(full));
    else if (e.isFile() && /\.(js|mjs|cjs|ts|json)$/i.test(e.name)) out.push(full);
  }
  return out;
}
function inspectRunner(relPath) {
  const text = read(relPath);
  return {
    fileExists: exists(relPath),
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
function scoreCandidate(file, spec) {
  const r = rel(file);
  const base = path.basename(r);
  let score = 0;
  for (const p of spec.filenameHints || []) if (p.test(r)) score += 20;
  for (const p of spec.strongFilenameHints || []) if (p.test(r)) score += 8;
  for (const p of spec.excludeHints || []) if (p.test(r)) score -= 25;
  if (/engine-v1\/jobs\//.test(r)) score += 10;
  if (/adapter|runner|extractor|extract|proof|validation|quality|canonical/i.test(base)) score += 8;
  if (/board|plan|search|targets|inventory|compiler|review/i.test(base)) score -= 8;
  const text = read(r);
  for (const slug of spec.expectedSlugs || []) if (text.includes(slug)) score += 4;
  if (/seasonScope/.test(text)) score += 5;
  if (/qualityGateStatus|validationStatus/.test(text)) score += 5;
  if (/canonicalWriteExecutedNowCount|productionWriteExecutedNowCount|rawPayloadWriteExecutedNowCount/.test(text)) score += 2;
  return score;
}

ensureDir(OUT_DIR);

const allFiles = [
  ...walk(path.join(ROOT, "engine-v1", "jobs")),
  ...walk(path.join(ROOT, "engine-v1", "config"))
];

const contracts = [];
for (const spec of FAMILY_SPECS) {
  let runner = spec.exactRunner || null;
  let candidateRunners = [];
  if (!runner) {
    candidateRunners = allFiles
      .filter((f) => /engine-v1[\\/]jobs[\\/]/.test(f))
      .map((f) => ({ file: rel(f), score: scoreCandidate(f, spec) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
      .slice(0, 12);
    runner = candidateRunners[0]?.score >= 35 ? candidateRunners[0].file : null;
  }

  const runnerInspection = runner ? inspectRunner(runner) : null;
  const configInspection = spec.config ? { fileExists: exists(spec.config), fileSha256: sha(read(spec.config)) } : null;

  const requiredArgs = spec.requiredArgs || [];
  if (runnerInspection?.requiresAllowFetch && !requiredArgs.includes("--allow-fetch")) requiredArgs.push("--allow-fetch");
  if (runnerInspection?.requiresAllowRender && !requiredArgs.includes("--allow-render")) requiredArgs.push("--allow-render");

  const gateCount = runnerInspection ? [
    runnerInspection.emitsSeasonScope,
    runnerInspection.emitsSeasonLabel,
    runnerInspection.hasExpectedRowsGate,
    runnerInspection.hasTeamSignalGate,
    runnerInspection.hasArithmeticGate,
    runnerInspection.hasNonTrivialGate,
    runnerInspection.hasDuplicateGate,
    runnerInspection.hasQualityGateStatus,
    runnerInspection.hasValidationStatus
  ].filter(Boolean).length : 0;

  let contractStatus = "blocked_no_runner";
  if (runner && runnerInspection?.fileExists && spec.config && !configInspection?.fileExists) contractStatus = "blocked_missing_config";
  else if (runner && runnerInspection?.fileExists && gateCount >= 5) contractStatus = "executable_contract";
  else if (runner && runnerInspection?.fileExists) contractStatus = "refreshable_needs_gate_audit";

  contracts.push({
    familyId: spec.familyId,
    expectedSlugs: spec.expectedSlugs,
    lane: spec.lane,
    runner,
    config: spec.config || null,
    requiredArgs,
    expectedOutputRegex: spec.expectedOutputRegex || null,
    contractStatus,
    gateCount,
    runnerInspection,
    configInspection,
    candidateRunners,
    commandTemplate: runner ? `node ${runner}${requiredArgs.length ? " " + requiredArgs.join(" ") : ""}` : null,
    promotionAllowed: contractStatus === "executable_contract",
    promotionRule: "only accepted rows emitted by this runner may feed ledger; review/candidate outputs remain diagnostic"
  });
}

const executableContracts = contracts.filter((c) => c.contractStatus === "executable_contract");
const refreshableContracts = contracts.filter((c) => c.contractStatus === "refreshable_needs_gate_audit");
const blockedContracts = contracts.filter((c) => c.contractStatus.startsWith("blocked"));

const summary = {
  status: "passed",
  runner: "existing_reusable_family_invocation_contracts",
  contractVersion: 1,
  purpose: "convert noisy reusable-family inventory into precise invocation contracts with exact runner, args, outputs and gate audit",
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  rawPayloadWriteExecutedNowCount: 0,
  familySpecCount: FAMILY_SPECS.length,
  executableContractCount: executableContracts.length,
  refreshableNeedsGateAuditCount: refreshableContracts.length,
  blockedContractCount: blockedContracts.length,
  executableSlugCount: new Set(executableContracts.flatMap((c) => c.expectedSlugs)).size,
  refreshableSlugCount: new Set(refreshableContracts.flatMap((c) => c.expectedSlugs)).size,
  executableFamilies: executableContracts.map((c) => ({ familyId: c.familyId, expectedSlugs: c.expectedSlugs, commandTemplate: c.commandTemplate, gateCount: c.gateCount })),
  refreshableFamilies: refreshableContracts.map((c) => ({ familyId: c.familyId, expectedSlugs: c.expectedSlugs, runner: c.runner, gateCount: c.gateCount })),
  blockedFamilies: blockedContracts.map((c) => ({ familyId: c.familyId, expectedSlugs: c.expectedSlugs, status: c.contractStatus, topCandidate: c.candidateRunners?.[0] || null })),
  hardRule: "run executable contracts first; refreshable contracts require gate audit before truth rows can be accepted",
  recommendedNextLane: "run_safety_wrapped_executable_contracts_and_report_refreshable_blockers"
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
