import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const strictProbePath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-uefa-americas-180-strict-official-host-probe-${today}`, `football-truth-uefa-americas-180-strict-official-host-probe-${today}.json`);
const badDiscoveryPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-bulk-official-route-discovery-160-${today}`, `football-truth-bulk-official-route-discovery-160-${today}.json`);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-volume-strategy-reset-${today}`);
const outPath = path.join(outDir, `football-truth-volume-strategy-reset-${today}.json`);
const quarantinePath = path.join(outDir, `football-truth-low-trust-bulk-probes-quarantine-${today}.json`);
const rowsPath = path.join(outDir, `football-truth-volume-strategy-reset-rows-${today}.jsonl`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
async function readJsonMaybe(file) { try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return null; } }
async function sha256Maybe(file) { try { return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex"); } catch { return null; } }

await fs.mkdir(outDir, { recursive: true });

const blocks = [];
const strictProbe = await readJsonMaybe(strictProbePath);
const badDiscovery = await readJsonMaybe(badDiscoveryPath);

if (!strictProbe || strictProbe.status !== "passed") blocks.push("strict_probe_missing_or_not_passed");
if (!badDiscovery || badDiscovery.status !== "passed") blocks.push("bad_discovery_missing_or_not_passed");

const strictSummary = strictProbe?.summary || {};
const badSummary = badDiscovery?.summary || {};

const rows = [
  {
    lane: "quarantine_low_trust_bulk_route_discovery_160",
    sourcePath: rel(badDiscoveryPath),
    reason: "RSS/search route discovery admitted non-official/search-result hosts such as as.com, betexplorer, wordreference, apps.apple, and generated unusable fetch plans.",
    mayUseForPromotion: false,
    mayUseForCanonicalCandidate: false,
    mayUseForProduction: false,
    requiredCorrection: "do not consume its fetchPlanOutput"
  },
  {
    lane: "quarantine_naive_strict_official_host_probe_180",
    sourcePath: rel(strictProbePath),
    reason: "Strict-host probe used generated generic paths and produced proof-shape collisions/wrong-level evidence; output is diagnostic only.",
    mayUseForPromotion: false,
    mayUseForCanonicalCandidate: false,
    mayUseForProduction: false,
    requiredCorrection: "only use as negative evidence and parser-family backlog, not as truth/candidate source"
  },
  {
    lane: "real_volume_lane_1",
    name: "existing proven official family adapters",
    expectedEffect: "repeatable 2-10 leagues per adapter, but only where route family is known and verified",
    examples: ["LaLiga", "Bundesliga/DFB", "SPFL", "Norway NTF", "Sportomedia Sweden", "Torneopal Finland", "KSI Iceland", "CFA Cyprus", "LOI if table route is confirmed"],
    nextAction: "inventory proven adapter configs/jobs and expand each family with explicit route templates"
  },
  {
    lane: "real_volume_lane_2",
    name: "official API discovery from confirmed hosts only",
    expectedEffect: "higher-volume than HTML, but requires host-specific API/JSON discovery and no generic generated paths",
    examples: ["competition API endpoints", "embedded __NEXT_DATA__", "WordPress REST endpoints", "GraphQL payloads", "known federation JSON feeds"],
    nextAction: "scan rendered/source DOM only on confirmed official hosts for API endpoints, then build family-specific extractors"
  },
  {
    lane: "real_volume_lane_3",
    name: "provider fallback with official cross-check",
    expectedEffect: "only realistic route to finish hundreds of long-tail leagues within reasonable time",
    examples: ["provider standings rows + official host identity/start-date cross-check", "provider historical standings with official season verification"],
    nextAction: "requires explicit policy decision because this is not pure-official canonical truth"
  }
];

const report = {
  status: blocks.length ? "failed" : "passed",
  runner: "football_truth_volume_strategy_reset",
  contractVersion: 1,
  generatedAt: new Date().toISOString(),
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  quarantineOutput: rel(quarantinePath),
  inputs: {
    badDiscoveryPath: rel(badDiscoveryPath),
    strictProbePath: rel(strictProbePath),
    badDiscoverySha256: await sha256Maybe(badDiscoveryPath),
    strictProbeSha256: await sha256Maybe(strictProbePath)
  },
  summary: {
    lowTrustRunsQuarantined: 2,
    badDiscoveryFetchPlanAllowed: false,
    strictProbePromotionAllowed: false,
    strictProbeProofShapeNonzeroCandidateSlugs: strictSummary.proofShapeNonzeroCandidateSlugs || [],
    strictProbeExpectedCorrectRateAssessment: "too low for promotion; proof-shape rows include duplicate/wrong-level collisions",
    badDiscoveryContaminationAssessment: {
      selectedBulkTargetCount: badSummary.selectedBulkTargetCount || 0,
      fetchPlanTargetCount: badSummary.fetchPlanTargetCount || 0,
      reason: "search-result contamination and low-priority region selection"
    },
    requiredStrategyShift: "Stop generic generated URL/path probing. Use proven official family adapters, official API endpoint discovery on confirmed hosts, or explicitly approved provider fallback with official cross-check.",
    nextRecommendedLane: "build inventory of existing proven adapters and produce a family-expansion execution board; no more one-off/generated-path waves"
  },
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    browserRenderExecutedNowCount: 0,
    reviewOnlyCandidateWriteExecutedNowCount: 0,
    canonicalCandidateWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  rows,
  blocks
};

const quarantine = {
  status: "active",
  generatedAt: report.generatedAt,
  quarantinedRuns: [
    {
      path: rel(badDiscoveryPath),
      reason: rows[0].reason,
      allowedUse: "diagnostic_negative_evidence_only",
      prohibitedUse: ["fetch_plan_execution", "candidate_promotion", "canonical_candidate", "production_truth"]
    },
    {
      path: rel(strictProbePath),
      reason: rows[1].reason,
      allowedUse: "diagnostic_negative_evidence_and_parser_backlog_only",
      prohibitedUse: ["candidate_promotion", "canonical_candidate", "production_truth"]
    }
  ],
  replacementPolicy: report.summary.requiredStrategyShift
};

await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");
await fs.writeFile(quarantinePath, `${JSON.stringify(quarantine, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  quarantineOutput: report.quarantineOutput,
  summary: report.summary,
  guardrails: report.guardrails,
  blocks: report.blocks
}, null, 2));

if (blocks.length) process.exitCode = 1;
