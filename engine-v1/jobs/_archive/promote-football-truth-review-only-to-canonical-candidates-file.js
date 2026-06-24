import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const approvedSlugs = ["bih.1", "ita.2", "mne.1"];
const sourceDir = path.join(root, "data", "football-truth", "_review-only-candidates", `official-standings-${today}`, "candidates");
const outDir = path.join(root, "data", "football-truth", "_canonical-candidates", `official-standings-${today}`);
const candidatesDir = path.join(outDir, "candidates");
const outPath = path.join(outDir, `football-truth-canonical-official-standings-candidates-${today}.json`);
const rowsPath = path.join(outDir, `football-truth-canonical-official-standings-candidates-rows-${today}.jsonl`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
function shaText(text) { return crypto.createHash("sha256").update(String(text || "")).digest("hex"); }
async function shaFile(file) { return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex"); }
function norm(value) { return String(value || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim(); }
function sorted(values) { return [...new Set(values || [])].sort((a,b) => a.localeCompare(b)); }

function metrics(rows) {
  const clean = (rows || []).filter(row => row && row.teamName && row.position != null);
  const duplicateTeamNameCount = clean.length - new Set(clean.map(row => norm(row.teamName))).size;
  const arithmeticPassedRowCount = clean.filter(row => row.arithmeticPassed === true).length;
  const arithmeticFailedRowCount = clean.filter(row => row.arithmeticPassed === false).length;
  const playedValues = clean.map(row => row.played).filter(v => v != null);
  return {
    standingRowCount: clean.length,
    arithmeticPassedRowCount,
    arithmeticFailedRowCount,
    duplicateTeamNameCount,
    minPlayed: playedValues.length ? Math.min(...playedValues) : null,
    maxPlayed: playedValues.length ? Math.max(...playedValues) : null
  };
}

await fs.mkdir(candidatesDir, { recursive: true });

const blocks = [];
const candidateRows = [];

for (const slug of approvedSlugs) {
  const sourcePath = path.join(sourceDir, `review-only-official-standings-candidate-${slug}-${today}.json`);
  let source;
  try {
    source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
  } catch {
    blocks.push(`missing_review_only_source_${slug}`);
    continue;
  }

  if (source.status !== "review_only_candidate") blocks.push(`source_not_review_only_${slug}`);
  if (source.slug !== slug) blocks.push(`source_slug_mismatch_${slug}`);
  if (source.downstreamRestrictions?.reviewOnly !== true) blocks.push(`source_review_only_restriction_missing_${slug}`);
  if (source.gates?.explicitReviewOnlyCandidateWriteApproval !== true) blocks.push(`source_review_only_approval_missing_${slug}`);

  const rows = source.standings?.rows || [];
  const m = metrics(rows);

  if (m.standingRowCount < 8) blocks.push(`too_few_rows_${slug}`);
  if (m.duplicateTeamNameCount !== 0) blocks.push(`duplicate_team_names_${slug}`);
  if (m.arithmeticPassedRowCount < Math.ceil(m.standingRowCount * 0.7)) blocks.push(`arithmetic_gate_failed_${slug}`);
  if (!(m.maxPlayed > 0)) blocks.push(`max_played_not_positive_${slug}`);

  const canonicalCandidate = {
    status: "canonical_candidate",
    candidateKind: "official_standings_canonical_candidate",
    contractVersion: 1,
    slug,
    generatedAt: new Date().toISOString(),
    promotedFrom: {
      kind: "review_only_candidate",
      sourcePath: rel(sourcePath),
      sourceSha256: await shaFile(sourcePath),
      promotionApproval: "explicit user approval in chat: canonical candidate promotion for bih.1, ita.2, mne.1; no production/truth write"
    },
    source: source.source,
    evidence: source.evidence,
    standings: {
      schema: source.standings?.schema,
      metrics: m,
      rows
    },
    gates: {
      proofShapePassed: true,
      seasonLeagueReviewPassed: source.gates?.seasonLeagueReviewPassed === true,
      explicitCanonicalCandidatePromotionApproval: true,
      productionWriteApproved: false,
      truthAssertionApproved: false
    },
    downstreamRestrictions: {
      canonicalCandidateOnly: true,
      mayBeUsedForHumanReview: true,
      mayWriteLifecycleWithoutSeparateApproval: false,
      mayWriteProductionWithoutSeparateApproval: false,
      mayAssertTruthWithoutSeparateApproval: false
    },
    guardrails: {
      searchExecutedNowCount: 0,
      fetchExecutedNowCount: 0,
      reviewOnlyCandidateWriteExecutedNow: false,
      canonicalCandidateWriteExecutedNow: true,
      lifecycleWriteExecutedNow: false,
      productionWriteExecutedNow: false,
      truthAssertionExecutedNow: false,
      rawPayloadCommitted: false,
      fullRawPayloadWritten: false
    }
  };

  const candidatePath = path.join(candidatesDir, `canonical-official-standings-candidate-${slug}-${today}.json`);
  await fs.writeFile(candidatePath, `${JSON.stringify(canonicalCandidate, null, 2)}\n`, "utf8");

  candidateRows.push({
    slug,
    sourceReviewOnlyPath: rel(sourcePath),
    canonicalCandidatePath: rel(candidatePath),
    rowCount: m.standingRowCount,
    arithmeticPassedRowCount: m.arithmeticPassedRowCount,
    duplicateTeamNameCount: m.duplicateTeamNameCount,
    minPlayed: m.minPlayed,
    maxPlayed: m.maxPlayed,
    sourceFinalUrl: source.source?.finalUrl,
    title: source.source?.title,
    canonicalCandidateSha256: await shaFile(candidatePath)
  });
}

const report = {
  status: blocks.length ? "failed" : "passed",
  runner: "promote_football_truth_review_only_to_canonical_candidates",
  contractVersion: 1,
  generatedAt: new Date().toISOString(),
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  candidatesDir: rel(candidatesDir),
  approvedSlugs,
  summary: {
    canonicalCandidateWriteCount: candidateRows.length,
    canonicalCandidateSlugs: candidateRows.map(row => row.slug),
    totalStandingRowsPromoted: candidateRows.reduce((sum, row) => sum + row.rowCount, 0),
    acceptedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    nextRecommendedLane: "bulk family-adapter expansion; do not continue random long-tail one-off probing"
  },
  volumePlan: {
    problemObserved: "Global official-host probing produced 284 suppressed missing-allowlist long-tail slugs and only three promotable review-only candidates.",
    requiredShift: "Build reusable source-family adapters and route harvesters instead of single-league probes.",
    nextBulkLanesInOrder: [
      "rendered official/provider families with known multi-league surface",
      "official API route discovery on already-confirmed hosts",
      "season/start-date evidence lane for zero-played current tables",
      "targeted high-value allowlist expansion only, not full long-tail"
    ],
    hardStop: "No blind global long-tail fetches until an intentional allowlist expansion wave is built."
  },
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    reviewOnlyCandidateWriteExecutedNowCount: 0,
    canonicalCandidateWriteExecutedNowCount: candidateRows.length,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  candidates: candidateRows,
  blocks
};

await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsPath, candidateRows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  candidatesDir: report.candidatesDir,
  summary: report.summary,
  volumePlan: report.volumePlan,
  guardrails: report.guardrails,
  candidates: report.candidates,
  blocks: report.blocks
}, null, 2));

if (blocks.length) process.exitCode = 1;
