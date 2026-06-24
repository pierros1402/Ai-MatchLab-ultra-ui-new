import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const dataRoot = path.join(root, "data", "football-truth");
const factoryLedgerPath = path.join(dataRoot, "_diagnostics", `football-truth-factory-lane-ledger-${today}`, `football-truth-factory-lane-ledger-${today}.json`);
const factoryRowsPath = path.join(dataRoot, "_diagnostics", `football-truth-factory-lane-ledger-${today}`, `football-truth-factory-lane-ledger-rows-${today}.jsonl`);
const factoryVerificationPath = path.join(dataRoot, "_diagnostics", `football-truth-factory-lane-ledger-verification-${today}`, `football-truth-factory-lane-ledger-verification-${today}.json`);

const outDir = path.join(dataRoot, "_diagnostics", `football-truth-global-factory-classification-ledger-${today}`);
const outPath = path.join(outDir, `football-truth-global-factory-classification-ledger-${today}.json`);
const rowsPath = path.join(outDir, `football-truth-global-factory-classification-ledger-rows-${today}.jsonl`);
const groupsPath = path.join(outDir, `football-truth-global-factory-classification-ledger-groups-${today}.json`);

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

async function readJson(file, fallback = null) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; }
}

async function readJsonl(file) {
  try { return parseJsonl(await fs.readFile(file, "utf8")); } catch { return []; }
}

function uniq(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function sorted(values) {
  return uniq(values).sort((a, b) => a.localeCompare(b));
}

function slugMatches(text) {
  return String(text || "").match(/\b[a-z]{3}\.[0-9]\b/g) || [];
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

async function listFiles(dir) {
  const out = [];
  async function walk(current) {
    let entries = [];
    try { entries = await fs.readdir(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".git" || entry.name === "node_modules") continue;
        await walk(full);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if ([".json", ".jsonl", ".csv", ".txt", ".md"].includes(ext)) out.push(full);
      }
    }
  }
  await walk(dir);
  return out;
}

function collectDisplayNamesFromJson(value, displayNames) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectDisplayNamesFromJson(item, displayNames);
    return;
  }

  const slug = typeof value.slug === "string" ? value.slug : typeof value.competitionSlug === "string" ? value.competitionSlug : null;
  const displayName = value.displayName || value.name || value.competitionName || value.leagueName || value.title;
  if (slug && /\b[a-z]{3}\.[0-9]\b/.test(slug) && typeof displayName === "string" && displayName.length <= 160) {
    if (!displayNames.has(slug)) displayNames.set(slug, displayName);
  }

  for (const item of Object.values(value)) collectDisplayNamesFromJson(item, displayNames);
}

await fs.mkdir(outDir, { recursive: true });

const blocks = [];

const factoryLedger = await readJson(factoryLedgerPath, {});
const factoryRows = await readJsonl(factoryRowsPath);
const factoryVerification = await readJson(factoryVerificationPath, {});

if (factoryLedger.status !== "passed") blocks.push("factory_lane_ledger_not_passed");
if (factoryVerification.status !== "passed") blocks.push("factory_lane_ledger_verification_not_passed");

const previousCompletedVerifiedProof = [
  "esp.1", "esp.2", "ger.1", "ger.2", "ger.3", "cro.1", "sco.1", "sco.2", "ned.1", "den.1", "jpn.1", "eng.1", "swe.1", "swe.2"
];
const currentRestartSchedulerCandidate = ["swe.1", "swe.2"];
const explicitApprovalCandidate = ["ksa.1"];
const knownBlockedOrAvoidBlindRetry = ["ita.1", "nor.2", "cyp.2"];

const factoryBySlug = new Map(factoryRows.map(row => [row.slug, row]));
const allSlugs = new Set();
const displayNames = new Map();
const evidenceFilesBySlug = new Map();
const evidenceHitsBySlug = new Map();

for (const slug of [...previousCompletedVerifiedProof, ...currentRestartSchedulerCandidate, ...explicitApprovalCandidate, ...knownBlockedOrAvoidBlindRetry]) {
  allSlugs.add(slug);
}

for (const row of factoryRows) {
  if (row.slug) {
    allSlugs.add(row.slug);
    if (row.displayName) displayNames.set(row.slug, row.displayName);
  }
}

const files = await listFiles(dataRoot);
let scannedFileCount = 0;
let skippedLargeFileCount = 0;

for (const file of files) {
  const stat = await fs.stat(file).catch(() => null);
  if (!stat) continue;
  if (stat.size > 8_000_000) {
    skippedLargeFileCount += 1;
    continue;
  }

  let text = "";
  try { text = await fs.readFile(file, "utf8"); } catch { continue; }
  scannedFileCount += 1;

  const slugs = sorted(slugMatches(text));
  if (slugs.length === 0) continue;

  const relative = rel(file);
  for (const slug of slugs) {
    allSlugs.add(slug);
    evidenceHitsBySlug.set(slug, (evidenceHitsBySlug.get(slug) || 0) + 1);
    const arr = evidenceFilesBySlug.get(slug) || [];
    if (arr.length < 8) arr.push(relative);
    evidenceFilesBySlug.set(slug, arr);
  }

  if (file.endsWith(".json")) {
    const parsed = await readJson(file, null);
    if (parsed) collectDisplayNamesFromJson(parsed, displayNames);
  } else if (file.endsWith(".jsonl")) {
    for (const line of text.split(/\r?\n/).filter(Boolean).slice(0, 5000)) {
      try { collectDisplayNamesFromJson(JSON.parse(line), displayNames); } catch {}
    }
  }
}

const laneRules = {
  countable_verified_proof: {
    countableCoverageNow: true,
    nextAction: "no immediate action; keep as covered",
    rejectionPolicy: []
  },
  explicit_approval_candidate: {
    countableCoverageNow: false,
    nextAction: "explicit user approval required before review-only candidate write",
    rejectionPolicy: ["no approval means no write", "no production write"]
  },
  proof_shape_nonzero_needs_review: {
    countableCoverageNow: false,
    nextAction: "season identity + league identity + collision review",
    rejectionPolicy: ["reject same-source/same-rows collision", "reject season mismatch", "candidate write only after explicit approval"]
  },
  html_or_custom_review: {
    countableCoverageNow: false,
    nextAction: "custom parser or table identity review",
    rejectionPolicy: ["park fixture-only tables", "reject arithmetic failure", "reject too-few rows unless phase is explicitly accepted"]
  },
  rendered_or_api_factory_planning: {
    countableCoverageNow: false,
    nextAction: "group by host family and build rendered/API adapter",
    rejectionPolicy: ["park if rendered/API does not expose season-scoped standings"]
  },
  zero_played_start_date_missing: {
    countableCoverageNow: false,
    nextAction: "bounded governed start-date evidence refresh only",
    rejectionPolicy: ["reject last-updated dates", "reject generic/news dates", "not countable until governed start date"]
  },
  parked_or_low_priority: {
    countableCoverageNow: false,
    nextAction: "park unless new official evidence or explicit high-value override",
    rejectionPolicy: ["no blind retry", "no broad search unless explicitly approved"]
  },
  no_current_factory_evidence: {
    countableCoverageNow: false,
    nextAction: "needs future bulk route discovery or provider-family match",
    rejectionPolicy: ["not countable", "do not hand-probe one-off without value tier"]
  }
};

function classifySlug(slug) {
  const factory = factoryBySlug.get(slug);
  const laneGroups = factory?.laneGroups || [];
  const riskFlags = factory?.riskFlags || [];

  if (previousCompletedVerifiedProof.includes(slug)) return ["countable_verified_proof", ["previous_completed_verified_proof"], []];
  if (explicitApprovalCandidate.includes(slug)) return ["explicit_approval_candidate", ["review_only_candidate_eligible_after_explicit_approval"], []];

  if (laneGroups.includes("batch3_proof_shape_passed_nonzero_needs_season_review")) {
    return ["proof_shape_nonzero_needs_review", laneGroups, riskFlags];
  }
  if (laneGroups.some(lane => lane.includes("html_extraction_review") || lane.includes("html_table_surface_review"))) {
    return ["html_or_custom_review", laneGroups, riskFlags];
  }
  if (laneGroups.some(lane => lane.includes("rendered_or_api"))) {
    return ["rendered_or_api_factory_planning", laneGroups, riskFlags];
  }
  if (laneGroups.some(lane => lane.includes("zero_played"))) {
    return ["zero_played_start_date_missing", laneGroups, riskFlags];
  }
  if (laneGroups.some(lane => lane.includes("route_not_found") || lane.includes("route_candidate_needs_review") || lane.includes("blocked")) || knownBlockedOrAvoidBlindRetry.includes(slug)) {
    return ["parked_or_low_priority", laneGroups, riskFlags];
  }

  return ["no_current_factory_evidence", [], []];
}

const rows = sorted([...allSlugs]).map(slug => {
  const [classificationLane, inheritedLaneGroups, inheritedRiskFlags] = classifySlug(slug);
  const rule = laneRules[classificationLane];
  const factory = factoryBySlug.get(slug);

  return {
    slug,
    displayName: displayNames.get(slug) || factory?.displayName || null,
    classificationLane,
    countableCoverageNow: rule.countableCoverageNow,
    laneGroups: inheritedLaneGroups,
    precisionStatus: factory?.precisionStatus || classificationLane,
    nextAction: rule.nextAction,
    rejectionPolicy: rule.rejectionPolicy,
    riskFlags: sorted(inheritedRiskFlags),
    evidenceHitCount: evidenceHitsBySlug.get(slug) || 0,
    sampleEvidenceFiles: evidenceFilesBySlug.get(slug) || [],
    factoryEvidence: factory?.evidence || null,
    source: factory ? "factory_lane_ledger_plus_global_scan" : "global_scan_or_known_baseline"
  };
});

const groups = {};
for (const row of rows) {
  groups[row.classificationLane] ||= [];
  groups[row.classificationLane].push(row.slug);
}
for (const key of Object.keys(groups)) groups[key] = sorted(groups[key]);

const groupCounts = Object.fromEntries(Object.entries(groups).map(([key, values]) => [key, values.length]));

const coverageFunnel = {
  allKnownSlugCount: rows.length,
  scannedFileCount,
  skippedLargeFileCount,
  countableCoverageNow: groupCounts.countable_verified_proof || 0,
  explicitApprovalCandidate: groupCounts.explicit_approval_candidate || 0,
  proofShapeNonzeroNeedsReview: groupCounts.proof_shape_nonzero_needs_review || 0,
  htmlOrCustomReview: groupCounts.html_or_custom_review || 0,
  renderedOrApiFactoryPlanning: groupCounts.rendered_or_api_factory_planning || 0,
  zeroPlayedStartDateMissing: groupCounts.zero_played_start_date_missing || 0,
  parkedOrLowPriority: groupCounts.parked_or_low_priority || 0,
  noCurrentFactoryEvidence: groupCounts.no_current_factory_evidence || 0
};

const precisionContract = {
  officialHostRequired: true,
  noChallengePageRequired: true,
  routeCandidateIsNotCoverage: true,
  identitySurfaceCandidateIsNotCoverage: true,
  extractionProofShapeIsNotCoverageUntilSeasonAndLifecycleReview: true,
  productionWriteRequiresSeparateApproval: true,
  canonicalOrLifecycleCandidateWriteRequiresExplicitApproval: true,
  noBroadSearchFromThisLedger: true,
  noFetchFromThisLedger: true,
  noRawPayloadCommit: true,
  minimumAcceptedStandingsShape: {
    rows: ">=8 unless explicit accepted competition phase",
    duplicateTeamNames: 0,
    arithmeticPassRate: ">=70%",
    nonzeroTableRequires: "maxPlayed > 0",
    zeroPlayedTableRequires: "governed start date before active/current coverage"
  }
};

const ledger = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "football_truth_global_factory_classification_ledger",
  contractVersion: 1,
  generatedAt: new Date().toISOString(),
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  groupsOutput: rel(groupsPath),
  inputs: {
    dataRoot: rel(dataRoot),
    factoryLedgerPath: rel(factoryLedgerPath),
    factoryRowsPath: rel(factoryRowsPath),
    factoryVerificationPath: rel(factoryVerificationPath)
  },
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    routeClaimMadeNowCount: 0,
    familyClaimMadeNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  precisionContract,
  coverageFunnel,
  groups,
  groupCounts,
  priorityOrder: [
    { lane: "explicit_approval_candidate", slugs: groups.explicit_approval_candidate || [], action: laneRules.explicit_approval_candidate.nextAction },
    { lane: "proof_shape_nonzero_needs_review", slugs: groups.proof_shape_nonzero_needs_review || [], action: laneRules.proof_shape_nonzero_needs_review.nextAction },
    { lane: "html_or_custom_review", slugs: groups.html_or_custom_review || [], action: laneRules.html_or_custom_review.nextAction },
    { lane: "rendered_or_api_factory_planning", slugs: groups.rendered_or_api_factory_planning || [], action: laneRules.rendered_or_api_factory_planning.nextAction },
    { lane: "zero_played_start_date_missing", slugs: groups.zero_played_start_date_missing || [], action: laneRules.zero_played_start_date_missing.nextAction },
    { lane: "parked_or_low_priority", slugs: groups.parked_or_low_priority || [], action: laneRules.parked_or_low_priority.nextAction },
    { lane: "no_current_factory_evidence", slugCount: (groups.no_current_factory_evidence || []).length, action: laneRules.no_current_factory_evidence.nextAction }
  ],
  rows,
  blocks
};

await fs.writeFile(outPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
await fs.writeFile(groupsPath, `${JSON.stringify({ groupCounts, groups, coverageFunnel, precisionContract }, null, 2)}\n`, "utf8");
await fs.writeFile(rowsPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: ledger.status,
  output: ledger.output,
  rowsOutput: ledger.rowsOutput,
  groupsOutput: ledger.groupsOutput,
  coverageFunnel: ledger.coverageFunnel,
  groupCounts: ledger.groupCounts,
  priorityOrder: ledger.priorityOrder,
  blocks: ledger.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
