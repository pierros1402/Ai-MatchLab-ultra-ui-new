import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const globalLedgerPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-factory-classification-ledger-${today}`, `football-truth-global-factory-classification-ledger-${today}.json`);
const globalRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-factory-classification-ledger-${today}`, `football-truth-global-factory-classification-ledger-rows-${today}.jsonl`);
const globalVerificationPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-factory-classification-ledger-verification-${today}`, `football-truth-global-factory-classification-ledger-verification-${today}.json`);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-no-current-discovery-batches-${today}`);
const planPath = path.join(outDir, `football-truth-global-no-current-discovery-batches-${today}.json`);
const rowsPath = path.join(outDir, `football-truth-global-no-current-discovery-batches-rows-${today}.jsonl`);

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

function uniq(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function sorted(values) {
  return uniq(values).sort((a, b) => a.localeCompare(b));
}

function slugCountry(slug) {
  return String(slug || "").split(".")[0];
}

function slugLevel(slug) {
  return Number.parseInt(String(slug || "").split(".")[1] || "99", 10);
}

const tierA = new Set([
  "eng","fra","ita","esp","ger","por","ned","bel","aut","sui","pol","cze","tur","gre",
  "usa","mex","bra","arg","jpn","kor","chn","aus","ksa",
  "sco","den","nor","swe","fin","cyp","cro","rou","hun","srb","svn","svk","bul","ukr",
  "col","chi","ecu","per","uru","par","bol","ven","crc","pan","can","ind","tha","vie","mys","idn","wal","nzl"
]);

const tierB = new Set([
  "irl","lva","ltu","est","mda","mkd","mne","bih","alb","arm","aze","geo","blr",
  "hon","slv","gua","dom","jam","tri","hai","mar","egy","tun","alg","rsa","nga","gha",
  "qat","uae","irq","irn","jor","uzb"
]);

function scoreRow(row) {
  const country = slugCountry(row.slug);
  const level = slugLevel(row.slug);

  let score = 0;
  const reasons = [];

  if (tierA.has(country)) { score += 60; reasons.push("tierA_country_or_market"); }
  else if (tierB.has(country)) { score += 30; reasons.push("tierB_country_or_region"); }
  else { score += 5; reasons.push("long_tail_country"); }

  if (level === 1) { score += 40; reasons.push("top_division"); }
  else if (level === 2) { score += 25; reasons.push("second_division"); }
  else if (level === 3) { score += 10; reasons.push("third_division"); }
  else { score -= 5; reasons.push("deep_pyramid_or_unclear_level"); }

  const evidenceHits = Number(row.evidenceHitCount || 0);
  score += Math.min(25, Math.floor(evidenceHits / 10));
  if (evidenceHits >= 100) reasons.push("high_existing_diagnostic_presence");
  else if (evidenceHits >= 20) reasons.push("some_existing_diagnostic_presence");
  else reasons.push("low_existing_diagnostic_presence");

  if (row.displayName) { score += 5; reasons.push("has_display_name"); }
  else score -= 5;

  return { score, reasons };
}

function valueTier(score) {
  if (score >= 100) return "A_high_value_first_wave";
  if (score >= 70) return "B_medium_high_value";
  if (score >= 45) return "C_medium_or_regional";
  return "D_long_tail_or_low_signal";
}

function chunk(values, size) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

await fs.mkdir(outDir, { recursive: true });

const blocks = [];
const globalLedger = JSON.parse(await fs.readFile(globalLedgerPath, "utf8"));
const globalRows = parseJsonl(await fs.readFile(globalRowsPath, "utf8"));
const globalVerification = JSON.parse(await fs.readFile(globalVerificationPath, "utf8"));

if (globalLedger.status !== "passed") blocks.push("global_ledger_not_passed");
if (globalVerification.status !== "passed") blocks.push("global_verification_not_passed");
if (globalLedger.coverageFunnel?.noCurrentFactoryEvidence !== 385) blocks.push("expected_no_current_count_385_not_found");

const candidates = globalRows
  .filter(row => row.classificationLane === "no_current_factory_evidence")
  .map(row => {
    const scored = scoreRow(row);
    return {
      slug: row.slug,
      displayName: row.displayName,
      country: slugCountry(row.slug),
      level: slugLevel(row.slug),
      classificationLane: row.classificationLane,
      evidenceHitCount: row.evidenceHitCount || 0,
      sampleEvidenceFiles: row.sampleEvidenceFiles || [],
      priorityScore: scored.score,
      valueTier: valueTier(scored.score),
      priorityReasons: scored.reasons,
      nextAction: "bulk route discovery or provider-family match; no one-off hand probe",
      precisionRequirements: [
        "official host required",
        "no challenge/access page",
        "route candidate is not coverage",
        "identity/surface proof required before extraction",
        "extraction proof requires arithmetic/duplicate/season/lifecycle gates",
        "canonical/lifecycle writes require explicit approval",
        "production write requires separate approval"
      ],
      rejectionPolicy: [
        "park if route is generic homepage/news only",
        "park if non-official host",
        "park if route family cannot expose standings or start-date evidence",
        "do not count search/discovery result as coverage"
      ]
    };
  })
  .sort((a, b) => b.priorityScore - a.priorityScore || a.slug.localeCompare(b.slug));

const batchSize = 80;
const batches = chunk(candidates, batchSize).map((items, index) => ({
  batchId: `global-no-current-discovery-${String(index + 1).padStart(3, "0")}`,
  batchIndex: index + 1,
  targetCount: items.length,
  valueTierCounts: items.reduce((acc, row) => {
    acc[row.valueTier] = (acc[row.valueTier] || 0) + 1;
    return acc;
  }, {}),
  countryCounts: items.reduce((acc, row) => {
    acc[row.country] = (acc[row.country] || 0) + 1;
    return acc;
  }, {}),
  slugs: items.map(row => row.slug),
  executionPolicy: {
    mode: "bulk_route_discovery_or_provider_family_match",
    maySearchLaterOnlyWithExplicitApproval: true,
    mayFetchLaterOnlyInControlledRunner: true,
    mayWriteNow: false,
    mayAssertTruthNow: false,
    rawPayloadCommitAllowed: false
  }
}));

const plan = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "football_truth_global_no_current_discovery_batches",
  contractVersion: 1,
  generatedAt: new Date().toISOString(),
  output: rel(planPath),
  rowsOutput: rel(rowsPath),
  inputGlobalLedgerPath: rel(globalLedgerPath),
  inputGlobalRowsPath: rel(globalRowsPath),
  inputGlobalVerificationPath: rel(globalVerificationPath),
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
  summary: {
    noCurrentFactoryEvidenceInputCount: candidates.length,
    plannedTargetCount: candidates.length,
    batchSize,
    batchCount: batches.length,
    firstBatchId: batches[0]?.batchId || null,
    firstBatchTargetCount: batches[0]?.targetCount || 0,
    firstBatchSlugs: batches[0]?.slugs || [],
    valueTierCounts: candidates.reduce((acc, row) => {
      acc[row.valueTier] = (acc[row.valueTier] || 0) + 1;
      return acc;
    }, {}),
    top20: candidates.slice(0, 20).map(row => ({
      slug: row.slug,
      displayName: row.displayName,
      priorityScore: row.priorityScore,
      valueTier: row.valueTier,
      reasons: row.priorityReasons
    })),
    nextRecommendedLane: "run controlled global discovery batch 001 only; classify results through same factory gates before any extraction"
  },
  batches,
  rows: candidates,
  blocks
};

await fs.writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
await fs.writeFile(rowsPath, candidates.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: plan.status,
  output: plan.output,
  rowsOutput: plan.rowsOutput,
  summary: plan.summary,
  firstBatch: batches[0],
  blocks: plan.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
