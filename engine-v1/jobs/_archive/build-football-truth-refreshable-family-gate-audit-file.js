import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const DIAG_ROOT = path.join(ROOT, "data", "football-truth", "_diagnostics");
const OUT_DIR = path.join(DIAG_ROOT, `refreshable-family-gate-audit-${DATE}`);
const CONFIG_PATH = path.join(ROOT, "engine-v1", "config", "football-truth-refreshable-family-modernization-contracts.json");

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function rel(p) { return path.relative(ROOT, p).replaceAll("\\", "/"); }
function sha(v) { return crypto.createHash("sha256").update(String(v)).digest("hex"); }
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}
function latestFile(re) {
  const files = walk(DIAG_ROOT).filter((f) => re.test(f));
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || null;
}
function readJsonl(file) {
  if (!file || !fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}
function read(relPath) {
  try { return fs.readFileSync(path.join(ROOT, relPath), "utf8"); } catch { return ""; }
}
function nodeCheck(relPath) {
  const r = spawnSync(process.execPath, ["--check", path.join(ROOT, relPath)], { cwd: ROOT, encoding: "utf8", maxBuffer: 1024 * 1024 * 5 });
  return { status: r.status === 0 ? "passed" : "failed", exitCode: r.status, stderrTail: String(r.stderr || "").slice(-2000), stdoutTail: String(r.stdout || "").slice(-2000) };
}
function markers(text) {
  return {
    requiresAllowFetch: /--allow-fetch/.test(text),
    requiresAllowRender: /--allow-render/.test(text),
    hasAllowExecute: /--allow-execute|allowExecute|ALLOW_EXECUTE/i.test(text),
    hasFetchSurface: /\bfetch\s*\(|fetchExecutedNowCount|allow-fetch/i.test(text),
    hasBrowserSurface: /puppeteer|playwright|chrome|browserRender|allow-render/i.test(text),
    hasCanonicalWriteSurface: /canonicalWrite|canonical candidate|canonical-candidate|writeCanonical/i.test(text),
    hasProductionWriteSurface: /productionWrite|production write|writeProduction/i.test(text),
    hasRawPayloadWriteSurface: /rawPayload|payloadOutput|htmlOutput|responseBody|writeRaw/i.test(text),
    emitsJsonlRows: /jsonl|rowsOutput|acceptedRowsOutput|normalizedRows|rowsPath/i.test(text),
    emitsSeasonScope: /seasonScope/.test(text),
    emitsSeasonLabel: /seasonLabel/.test(text),
    emitsQualityGateStatus: /qualityGateStatus/.test(text),
    emitsValidationStatus: /validationStatus/.test(text),
    hasRouteIdentityGate: /routeIdentity|requiredRoute|sourceIdentity|competitionSlug|officialHost/i.test(text),
    hasExpectedRowsGate: /expectedRowCount|expectedRows|rowCount|expected row/i.test(text),
    hasTeamSignalsGate: /teamSignals|expectedTeamSignals|team signal|teamSignalsPassed/i.test(text),
    hasArithmeticGate: /arithmetic|won\s*\+\s*drawn\s*\+\s*lost|points\s*===|w\s*\*\s*3|3\s*\*\s*won/i.test(text),
    hasNonTrivialGate: /nonTrivial|totalPlayed|totalPoints|maxPoints|max points|all-zero|allZero/i.test(text),
    hasDuplicateSignatureGate: /duplicate|signature|rowSignature|tableSignature/i.test(text),
    mentionsPreviousCompleted: /previous_completed|previous completed|completed season/i.test(text),
    mentionsCurrentOrNew: /current_or_new|current_active|new_not_started/i.test(text)
  };
}
function missingGateList(m) {
  const required = [
    ["emitsJsonlRows", "row_output_jsonl_contract"],
    ["emitsSeasonScope", "seasonScope"],
    ["emitsSeasonLabel", "seasonLabel"],
    ["emitsQualityGateStatus", "qualityGateStatus"],
    ["emitsValidationStatus", "validationStatus"],
    ["hasRouteIdentityGate", "route_identity_gate"],
    ["hasExpectedRowsGate", "expected_row_count_gate"],
    ["hasTeamSignalsGate", "team_signal_gate"],
    ["hasArithmeticGate", "w_d_l_points_arithmetic_gate"],
    ["hasNonTrivialGate", "non_trivial_previous_completed_gate"],
    ["hasDuplicateSignatureGate", "duplicate_signature_gate"]
  ];
  return required.filter(([k]) => !m[k]).map(([, label]) => label);
}
function modernizationClass(row, m, missing) {
  if (!row.runner) return "blocked_no_runner";
  if (m.hasProductionWriteSurface) return "blocked_production_write_surface_requires_isolation";
  if (missing.length <= 2 && m.emitsJsonlRows) return "near_contract_wrap";
  if (missing.length <= 5) return "adapter_shim_required";
  return "modernized_family_adapter_required";
}

ensureDir(OUT_DIR);

const refreshablePath = latestFile(/existing-reusable-family-refreshable-contracts-\d{4}-\d{2}-\d{2}\.jsonl$/);
if (!refreshablePath) throw new Error("Missing refreshable invocation contracts JSONL");

const refreshable = readJsonl(refreshablePath);
const auditRows = [];
const modernizationContracts = [];

for (const row of refreshable) {
  const text = row.runner ? read(row.runner) : "";
  const m = markers(text);
  const missingGates = missingGateList(m);
  const check = row.runner ? nodeCheck(row.runner) : { status: "blocked", exitCode: null, stderrTail: "missing runner", stdoutTail: "" };
  const classification = modernizationClass(row, m, missingGates);
  const requiredArgs = [...new Set([
    ...(row.requiredArgs || []),
    ...(m.requiresAllowFetch ? ["--allow-fetch"] : []),
    ...(m.requiresAllowRender ? ["--allow-render"] : [])
  ])];

  const audit = {
    familyId: row.familyId,
    expectedSlugs: row.expectedSlugs,
    lane: row.lane,
    runner: row.runner,
    runnerSha256: text ? sha(text) : null,
    syntaxCheckStatus: check.status,
    syntaxCheckExitCode: check.exitCode,
    requiredArgs,
    markerSummary: m,
    missingGates,
    missingGateCount: missingGates.length,
    modernizationClass: classification,
    promotionAllowedNow: false,
    blockerReason: row.blockerReason || "refreshable family requires modern gate contract before truth-row acceptance",
    nextBuildAction:
      classification === "near_contract_wrap" ? "build thin wrapper to enforce missing gates and emit season-scoped rows" :
      classification === "adapter_shim_required" ? "build adapter shim around legacy runner output with full truth gates" :
      "build modern family adapter from legacy runner knowledge, not direct promotion",
    stderrTail: check.stderrTail,
    stdoutTail: check.stdoutTail
  };
  auditRows.push(audit);

  modernizationContracts.push({
    familyId: row.familyId,
    expectedSlugs: row.expectedSlugs,
    lane: row.lane,
    legacyRunner: row.runner,
    legacyRunnerSha256: text ? sha(text) : null,
    requiredArgs,
    requiredModernOutputContract: {
      rowsJsonl: true,
      fields: ["competitionSlug", "competitionName", "seasonScope", "seasonLabel", "position", "team", "played", "won", "drawn", "lost", "goalsFor", "goalsAgainst", "goalDifference", "points", "qualityGateStatus", "validationStatus", "sourceUrl", "sourceHost"],
      qualityGateStatus: "verified",
      validationStatus: "passed"
    },
    requiredGates: [
      "route_identity_gate",
      "expected_row_count_gate",
      "positive_team_signal_gate",
      "negative_team_signal_gate",
      "w_d_l_points_arithmetic_gate",
      "non_trivial_previous_completed_gate",
      "duplicate_signature_gate",
      "season_scope_gate"
    ],
    currentlyMissingGates: missingGates,
    promotionAllowedNow: false,
    modernizationClass: classification
  });
}

const summary = {
  status: "passed",
  runner: "refreshable_family_gate_audit",
  contractVersion: 1,
  purpose: "audit exact refreshable family runners before any truth-row acceptance; produce modernization contracts, not promotions",
  sourceRefreshableContractsPath: rel(refreshablePath),
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  rawPayloadWriteExecutedNowCount: 0,
  refreshableFamilyCount: auditRows.length,
  syntaxPassedCount: auditRows.filter((r) => r.syntaxCheckStatus === "passed").length,
  nearContractWrapCount: auditRows.filter((r) => r.modernizationClass === "near_contract_wrap").length,
  adapterShimRequiredCount: auditRows.filter((r) => r.modernizationClass === "adapter_shim_required").length,
  modernizedFamilyAdapterRequiredCount: auditRows.filter((r) => r.modernizationClass === "modernized_family_adapter_required").length,
  promotionAllowedNowCount: auditRows.filter((r) => r.promotionAllowedNow).length,
  auditedFamilies: auditRows.map((r) => ({ familyId: r.familyId, expectedSlugs: r.expectedSlugs, syntaxCheckStatus: r.syntaxCheckStatus, missingGateCount: r.missingGateCount, modernizationClass: r.modernizationClass, nextBuildAction: r.nextBuildAction })),
  hardRule: "refreshable legacy runners cannot emit truth rows until their modernization contracts are implemented and gates pass",
  recommendedNextLane: auditRows.some((r) => r.modernizationClass === "adapter_shim_required" || r.modernizationClass === "near_contract_wrap")
    ? "build_modernized_adapter_shims_for_best_refreshable_families"
    : "build_modern_family_adapters_from_legacy_runner_knowledge"
};

const config = {
  contractVersion: 1,
  generatedAt: new Date().toISOString(),
  purpose: "tracked modernization contracts for refreshable football-truth families",
  promotionAllowedNow: false,
  families: modernizationContracts
};

const outPath = path.join(OUT_DIR, `refreshable-family-gate-audit-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `refreshable-family-gate-audit-rows-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({ summary, auditRows, modernizationContracts }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, auditRows.map((r) => JSON.stringify(r)).join("\n") + (auditRows.length ? "\n" : ""), "utf8");
fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  modernizationConfigOutput: rel(CONFIG_PATH),
  summary
}, null, 2));
