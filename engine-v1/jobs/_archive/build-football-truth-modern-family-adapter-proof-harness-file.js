import fs from "fs";
import path from "path";

const ROOT = process.cwd();

function exists(p) {
  return fs.existsSync(path.join(ROOT, p));
}

function readText(rel, maxBytes = 350000) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return "";
  const buf = fs.readFileSync(abs);
  return buf.slice(0, maxBytes).toString("utf8");
}

function readJson(rel) {
  const txt = readText(rel);
  if (!txt.trim()) return null;
  try { return JSON.parse(txt); } catch { return null; }
}

function ensureDir(rel) {
  fs.mkdirSync(path.join(ROOT, rel), { recursive: true });
}

function writeJson(rel, value) {
  const abs = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(value, null, 2) + "\n");
}

function walk(rel, out = []) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return out;
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    if ([".git", "node_modules", ".next", "dist", "build", "coverage"].includes(ent.name)) continue;
    const child = path.join(rel, ent.name).replace(/\\/g, "/");
    if (ent.isDirectory()) {
      walk(child, out);
    } else if (/\.(js|json|jsonl|md)$/i.test(ent.name)) {
      out.push(child);
    }
  }
  return out;
}

function flattenObjects(x, out = []) {
  if (!x || typeof x !== "object") return out;
  if (Array.isArray(x)) {
    for (const item of x) flattenObjects(item, out);
    return out;
  }
  out.push(x);
  for (const v of Object.values(x)) flattenObjects(v, out);
  return out;
}

function lower(x) {
  return String(x ?? "").toLowerCase();
}

function objectText(o) {
  try { return JSON.stringify(o); } catch { return ""; }
}

const knownFamilies = [
  {
    familyId: "norway_ntf",
    priority: 1,
    slugs: ["nor.1", "nor.2"],
    aliases: ["norway_ntf", "ntf", "eliteserien", "obos", "nor.1", "nor.2"],
    preferredScope: "previous_completed"
  },
  {
    familyId: "sportomedia_sef",
    priority: 2,
    slugs: ["swe.1", "swe.2"],
    aliases: ["sportomedia", "sef", "svenskfotboll", "allsvenskan", "superettan", "swe.1", "swe.2"],
    preferredScope: "previous_completed"
  },
  {
    familyId: "loi_ajax",
    priority: 3,
    slugs: ["irl.1", "irl.2"],
    aliases: ["loi_ajax", "leagueofireland", "league of ireland", "irl.1", "irl.2", "ajax"],
    preferredScope: "previous_completed"
  },
  {
    familyId: "torneopal",
    priority: 4,
    slugs: ["fin.1", "fin.2"],
    aliases: ["torneopal", "veikkausliiga", "ykkosliiga", "fin.1", "fin.2"],
    preferredScope: "previous_completed"
  },
  {
    familyId: "ksi",
    priority: 5,
    slugs: ["isl.1", "isl.2"],
    aliases: ["ksi", "besta", "pepsideild", "isl.1", "isl.2"],
    preferredScope: "previous_completed"
  },
  {
    familyId: "cfa_cyprus_html",
    priority: 6,
    slugs: ["cyp.1", "cyp.2"],
    aliases: ["cfa_cyprus", "cfa", "cyprus", "cyp.1", "cyp.2"],
    preferredScope: "previous_completed"
  }
];

const sourceModernizationConfigPath = "engine-v1/config/football-truth-refreshable-family-modernization-contracts.json";
const sourceInvocationContractsPath = "data/football-truth/_diagnostics/existing-reusable-family-invocation-contracts-2026-06-18/existing-reusable-family-invocation-contracts-2026-06-18.json";
const sourceGateAuditGlobRoot = "data/football-truth/_diagnostics";

const modernizationConfig = readJson(sourceModernizationConfigPath);
const invocationContracts = readJson(sourceInvocationContractsPath);
const configObjects = [
  ...flattenObjects(modernizationConfig),
  ...flattenObjects(invocationContracts)
];

const scanRoots = [
  "engine-v1/jobs",
  "engine-v1/config",
  "data/football-truth/_diagnostics"
];

const allFiles = scanRoots.flatMap(root => walk(root)).filter((v, i, a) => a.indexOf(v) === i);
const boundedFiles = allFiles.filter(rel => {
  if (rel.includes("/_raw/") || rel.includes("\\_raw\\")) return false;
  if (rel.includes("node_modules")) return false;
  return true;
}).slice(0, 6000);

const gateTerms = [
  "expectedrowcount",
  "expectedteamsignals",
  "arithmetic",
  "seasonScope",
  "seasonLabel",
  "nontrivial",
  "non-trivial",
  "qualityGateStatus",
  "validationStatus",
  "canonicalWrite",
  "productionWrite",
  "truthAssertion"
];

const familyRows = knownFamilies.map(family => {
  const aliasLower = family.aliases.map(lower);
  const contractObjects = configObjects.filter(o => {
    const txt = lower(objectText(o));
    return aliasLower.some(a => txt.includes(a));
  });

  const evidenceFiles = [];
  const runnerFiles = [];
  const configFiles = [];
  const diagnosticFiles = [];
  const gateHits = new Set();

  for (const rel of boundedFiles) {
    const relLower = lower(rel);
    const pathMatch = aliasLower.some(a => relLower.includes(a));
    const txt = readText(rel, 180000);
    const txtLower = lower(txt);
    const bodyMatch = aliasLower.some(a => txtLower.includes(a));
    if (!pathMatch && !bodyMatch) continue;

    for (const term of gateTerms) {
      if (txt.includes(term) || txtLower.includes(lower(term))) gateHits.add(term);
    }

    const row = {
      path: rel,
      pathMatch,
      bodyMatch,
      kind: rel.startsWith("engine-v1/jobs/") ? "job" : rel.startsWith("engine-v1/config/") ? "config" : "diagnostic",
      sizeBytes: fs.statSync(path.join(ROOT, rel)).size
    };
    evidenceFiles.push(row);
    if (row.kind === "job") runnerFiles.push(row);
    if (row.kind === "config") configFiles.push(row);
    if (row.kind === "diagnostic") diagnosticFiles.push(row);
  }

  const contractText = lower(contractObjects.map(objectText).join("\n"));
  const refreshableSignal =
    /refreshable|modernization|modernise|modernize|legacy|blocked/.test(contractText) ||
    evidenceFiles.some(e => /refreshable|legacy|modern/i.test(e.path));

  const exactRunnerRisk =
    /unrelated generic|wrong runner|exact-runner-missing|exact runner missing|runner_missing|blocked/.test(contractText);

  const score =
    (refreshableSignal ? 1000 : 0) +
    (contractObjects.length * 50) +
    (runnerFiles.length * 15) +
    (configFiles.length * 8) +
    (gateHits.size * 10) -
    (family.priority * 5) -
    (exactRunnerRisk ? 100 : 0);

  return {
    familyId: family.familyId,
    priority: family.priority,
    slugs: family.slugs,
    preferredScope: family.preferredScope,
    refreshableSignal,
    exactRunnerRisk,
    score,
    contractObjectCount: contractObjects.length,
    evidenceFileCount: evidenceFiles.length,
    runnerFileCount: runnerFiles.length,
    configFileCount: configFiles.length,
    diagnosticFileCount: diagnosticFiles.length,
    gateSignalsFound: Array.from(gateHits).sort(),
    topEvidenceFiles: evidenceFiles
      .sort((a, b) => {
        const ak = a.kind === "job" ? 0 : a.kind === "config" ? 1 : 2;
        const bk = b.kind === "job" ? 0 : b.kind === "config" ? 1 : 2;
        return ak - bk || a.path.localeCompare(b.path);
      })
      .slice(0, 18)
  };
});

const eligible = familyRows
  .filter(r => r.refreshableSignal && r.evidenceFileCount > 0)
  .sort((a, b) => b.score - a.score || a.priority - b.priority);

if (eligible.length === 0) {
  const failed = {
    status: "failed",
    runner: "modern_family_adapter_proof_harness_builder",
    reason: "no_refreshable_family_with_legacy_evidence_found",
    sourceModernizationConfigPath,
    sourceModernizationConfigExists: exists(sourceModernizationConfigPath),
    examinedFamilyCount: familyRows.length,
    familyRows
  };
  writeJson("data/football-truth/_diagnostics/modern-family-adapter-proof-harness-failed.json", failed);
  console.log(JSON.stringify(failed, null, 2));
  process.exit(1);
}

const selected = eligible[0];
const date = new Date().toISOString().slice(0, 10);
const outDir = `data/football-truth/_diagnostics/modern-family-adapter-proof-harness-${date}`;
ensureDir(outDir);

const adapterSlug = selected.familyId.replace(/_/g, "-");
const nextRunnerPath = `engine-v1/jobs/run-football-truth-modern-${adapterSlug}-standings-proof-file.js`;

const harnessContract = {
  contractVersion: 1,
  adapterId: `modern_${selected.familyId}_standings_proof_v1`,
  selectedFamilyId: selected.familyId,
  selectedCompetitionSlugs: selected.slugs,
  targetSeasonScope: selected.preferredScope,
  requiredSeasonLabelPolicy: "explicit_adapter_config_value_required_before_any_row_acceptance",
  mode: "isolated_modern_proof_harness",
  sourcePolicy: {
    fetchAllowed: false,
    searchAllowed: false,
    browserAllowed: false,
    canonicalWriteAllowed: false,
    productionWriteAllowed: false,
    truthAssertionAllowed: false,
    rawPayloadCommitAllowed: false
  },
  requiredModernGates: [
    "exact_source_family_identity_contract",
    "exact_competition_route_identity_or_api_parameter_identity",
    "expected_row_count_per_competition",
    "expected_team_signals_per_competition",
    "explicit_season_scope",
    "explicit_season_label",
    "played_won_drawn_lost_arithmetic",
    "points_arithmetic_when_formula_available",
    "goals_for_against_and_goal_difference_consistency_when_available",
    "previous_completed_non_triviality_gate_total_played_gt_0_total_points_gt_0",
    "duplicate_shared_table_guard",
    "no_current_or_new_rows_promoted_as_previous_completed",
    "diagnostic_output_only_until_explicit_approval_gate"
  ],
  legacyKnowledgeInputs: selected.topEvidenceFiles,
  nextImplementationTarget: nextRunnerPath,
  recommendedNextAction: `implement_isolated_modern_adapter_for_${selected.familyId}_using_only_legacy_knowledge_and_cached_diagnostics_first`
};

const summary = {
  status: "passed",
  runner: "modern_family_adapter_proof_harness_builder",
  contractVersion: 1,
  purpose: "select the best refreshable legacy source family and materialize a modern isolated proof-harness contract without data acquisition or truth writes",
  generatedAt: new Date().toISOString(),
  sourceModernizationConfigPath,
  sourceModernizationConfigExists: exists(sourceModernizationConfigPath),
  sourceInvocationContractsPath,
  sourceInvocationContractsExists: exists(sourceInvocationContractsPath),
  scanRoots,
  scannedFileCount: boundedFiles.length,
  examinedFamilyCount: familyRows.length,
  eligibleRefreshableFamilyCount: eligible.length,
  selectedFamilyId: selected.familyId,
  selectedCompetitionSlugs: selected.slugs,
  selectedScore: selected.score,
  selectedRunnerEvidenceCount: selected.runnerFileCount,
  selectedConfigEvidenceCount: selected.configFileCount,
  selectedDiagnosticEvidenceCount: selected.diagnosticFileCount,
  selectedGateSignalsFound: selected.gateSignalsFound,
  nextImplementationTarget: nextRunnerPath,
  output: `${outDir}/modern-family-adapter-proof-harness-${date}.json`,
  contractOutput: "engine-v1/config/football-truth-modern-family-adapter-proof-harness-contracts.json",
  acquisitionExecutedNowCount: 0,
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  harnessContract,
  familyRows
};

writeJson(`${outDir}/modern-family-adapter-proof-harness-${date}.json`, summary);
writeJson("engine-v1/config/football-truth-modern-family-adapter-proof-harness-contracts.json", {
  status: "active",
  contractVersion: 1,
  generatedBy: "build-football-truth-modern-family-adapter-proof-harness-file.js",
  generatedAt: summary.generatedAt,
  selectedFamilyId: selected.familyId,
  selectedCompetitionSlugs: selected.slugs,
  harnessContract,
  eligibleFamilyRows: eligible.map(r => ({
    familyId: r.familyId,
    slugs: r.slugs,
    score: r.score,
    runnerFileCount: r.runnerFileCount,
    configFileCount: r.configFileCount,
    diagnosticFileCount: r.diagnosticFileCount,
    gateSignalsFound: r.gateSignalsFound,
    topEvidenceFiles: r.topEvidenceFiles
  }))
});

console.log(JSON.stringify({
  status: summary.status,
  selectedFamilyId: summary.selectedFamilyId,
  selectedCompetitionSlugs: summary.selectedCompetitionSlugs,
  eligibleRefreshableFamilyCount: summary.eligibleRefreshableFamilyCount,
  selectedRunnerEvidenceCount: summary.selectedRunnerEvidenceCount,
  selectedGateSignalsFound: summary.selectedGateSignalsFound,
  nextImplementationTarget: summary.nextImplementationTarget,
  output: summary.output,
  contractOutput: summary.contractOutput,
  fetchExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0
}, null, 2));

