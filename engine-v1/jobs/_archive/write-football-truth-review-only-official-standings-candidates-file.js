import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const proofReviewPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-proof-shape-season-league-review-${today}`, `football-truth-global-batch001-proof-shape-season-league-review-${today}.json`);
const proofReviewRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-proof-shape-season-league-review-${today}`, `football-truth-global-batch001-proof-shape-season-league-review-rows-${today}.jsonl`);
const salvageRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-official-html-custom-salvage-${today}`, `football-truth-global-batch001-official-html-custom-salvage-rows-${today}.jsonl`);

const outDir = path.join(root, "data", "football-truth", "_review-only-candidates", `official-standings-${today}`);
const candidatesDir = path.join(outDir, "candidates");
const outPath = path.join(outDir, `football-truth-review-only-official-standings-candidates-${today}.json`);
const rowsPath = path.join(outDir, `football-truth-review-only-official-standings-candidates-rows-${today}.jsonl`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
function parseJsonl(text) { return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }
function shaText(text) { return crypto.createHash("sha256").update(String(text || "")).digest("hex"); }
function norm(value) { return String(value || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim(); }
function uniq(values) { return [...new Set((values || []).filter(Boolean))]; }
function sorted(values) { return uniq(values).sort((a,b) => a.localeCompare(b)); }

function cleanStandingRow(row) {
  return {
    position: row.position ?? null,
    teamName: row.teamName,
    played: row.played ?? null,
    wins: row.wins ?? null,
    draws: row.draws ?? null,
    losses: row.losses ?? null,
    goalsFor: row.goalsFor ?? null,
    goalsAgainst: row.goalsAgainst ?? null,
    goalDifference: row.goalDifference ?? null,
    points: row.points ?? null,
    playedArithmeticPassed: row.playedArithmeticPassed ?? null,
    goalDifferenceArithmeticPassed: row.goalDifferenceArithmeticPassed ?? null,
    pointsArithmeticPassed: row.pointsArithmeticPassed ?? null,
    arithmeticPassed: row.arithmeticPassed === true
  };
}

function metrics(rows) {
  const duplicateTeamNameCount = rows.length - new Set(rows.map(row => norm(row.teamName))).size;
  const arithmeticPassedRowCount = rows.filter(row => row.arithmeticPassed === true).length;
  const arithmeticFailedRowCount = rows.filter(row => row.arithmeticPassed === false).length;
  const playedValues = rows.map(row => row.played).filter(value => value != null);
  const minPlayed = playedValues.length ? Math.min(...playedValues) : null;
  const maxPlayed = playedValues.length ? Math.max(...playedValues) : null;
  return {
    standingRowCount: rows.length,
    arithmeticPassedRowCount,
    arithmeticFailedRowCount,
    duplicateTeamNameCount,
    minPlayed,
    maxPlayed
  };
}

await fs.mkdir(candidatesDir, { recursive: true });

const blocks = [];
const proofReview = JSON.parse(await fs.readFile(proofReviewPath, "utf8"));
const proofRows = parseJsonl(await fs.readFile(proofReviewRowsPath, "utf8"));
const salvageRows = parseJsonl(await fs.readFile(salvageRowsPath, "utf8"));

if (proofReview.status !== "passed") blocks.push("proof_review_not_passed");

const approvedSlugs = ["bih.1", "ita.2", "mne.1"];
const sourceSlugs = sorted(proofReview.summary?.candidateAfterExplicitApprovalSlugs || []);
if (JSON.stringify(sourceSlugs) !== JSON.stringify(approvedSlugs)) blocks.push("approved_slug_set_does_not_match_source_review");

const candidates = [];

for (const slug of approvedSlugs) {
  const review = proofRows.find(row => row.slug === slug);
  const salvage = salvageRows.find(row => row.slug === slug);

  if (!review) blocks.push(`missing_review_row_${slug}`);
  if (!salvage) blocks.push(`missing_salvage_row_${slug}`);
  if (!review || !salvage) continue;

  const standingsRows = (salvage.parsedRows || []).map(cleanStandingRow);
  const m = metrics(standingsRows);

  if (m.standingRowCount < 8) blocks.push(`too_few_standing_rows_${slug}`);
  if (m.duplicateTeamNameCount !== 0) blocks.push(`duplicate_team_names_${slug}`);
  if (m.arithmeticPassedRowCount < Math.ceil(m.standingRowCount * 0.7)) blocks.push(`insufficient_arithmetic_pass_${slug}`);
  if (!(m.maxPlayed > 0)) blocks.push(`not_nonzero_played_${slug}`);
  if (review.reviewStatus !== "season_league_review_candidate_after_explicit_approval") blocks.push(`review_status_not_candidate_${slug}`);

  const candidate = {
    status: "review_only_candidate",
    candidateKind: "official_standings_review_only",
    contractVersion: 1,
    slug,
    generatedAt: new Date().toISOString(),
    source: {
      finalUrl: review.finalUrl,
      host: (() => { try { return new URL(review.finalUrl).host.toLowerCase().replace(/^www\./, ""); } catch { return null; } })(),
      title: review.title,
      fetchStatus: review.fetchStatus,
      bodySha256: review.bodySha256 || null,
      rawPayloadCommitted: false,
      fullRawPayloadWritten: false
    },
    evidence: {
      seasonMentions: review.seasonMentions || [],
      identityTermHits: review.identityTermHits || [],
      hasSeasonEvidence: review.hasSeasonEvidence === true,
      hasLeagueEvidence: review.hasLeagueEvidence === true,
      sourceLane: review.sourceLane,
      reviewStatus: review.reviewStatus,
      reviewReason: review.reviewReason || "approved for review-only candidate write from proof-shape season/league review"
    },
    standings: {
      schema: "position/team/played/wins/draws/losses/goalsFor/goalsAgainst/goalDifference/points",
      metrics: m,
      rows: standingsRows
    },
    gates: {
      proofShapePassed: true,
      seasonLeagueReviewPassed: true,
      explicitReviewOnlyCandidateWriteApproval: true,
      canonicalWriteApproved: false,
      productionWriteApproved: false,
      truthAssertionApproved: false
    },
    downstreamRestrictions: {
      reviewOnly: true,
      mayBeUsedForHumanReview: true,
      mayBePromotedToCanonicalWithoutSeparateApproval: false,
      mayWriteLifecycleWithoutSeparateApproval: false,
      mayWriteProductionWithoutSeparateApproval: false,
      mayAssertTruthWithoutSeparateApproval: false
    },
    guardrails: {
      searchExecutedNowCount: 0,
      fetchExecutedNowCount: 0,
      reviewOnlyCandidateWriteExecutedNow: true,
      canonicalWriteExecutedNow: false,
      lifecycleWriteExecutedNow: false,
      productionWriteExecutedNow: false,
      truthAssertionExecutedNow: false,
      rawPayloadCommitted: false,
      fullRawPayloadWritten: false
    }
  };

  const candidatePath = path.join(candidatesDir, `review-only-official-standings-candidate-${slug}-${today}.json`);
  await fs.writeFile(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");

  candidates.push({
    slug,
    candidatePath: rel(candidatePath),
    rowCount: m.standingRowCount,
    arithmeticPassedRowCount: m.arithmeticPassedRowCount,
    duplicateTeamNameCount: m.duplicateTeamNameCount,
    minPlayed: m.minPlayed,
    maxPlayed: m.maxPlayed,
    sourceFinalUrl: review.finalUrl,
    title: review.title,
    seasonMentions: review.seasonMentions || [],
    identityTermHits: review.identityTermHits || [],
    candidateSha256: shaText(JSON.stringify(candidate))
  });
}

const report = {
  status: blocks.length ? "failed" : "passed",
  runner: "write_football_truth_review_only_official_standings_candidates",
  contractVersion: 1,
  generatedAt: new Date().toISOString(),
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  candidatesDir: rel(candidatesDir),
  inputs: {
    proofReviewPath: rel(proofReviewPath),
    proofReviewRowsPath: rel(proofReviewRowsPath),
    salvageRowsPath: rel(salvageRowsPath)
  },
  summary: {
    approvedSlugs,
    reviewOnlyCandidateWriteCount: candidates.length,
    reviewOnlyCandidateSlugs: candidates.map(candidate => candidate.slug),
    totalStandingRowsWritten: candidates.reduce((sum, candidate) => sum + candidate.rowCount, 0),
    acceptedNowCount: 0,
    nextRecommendedLane: "human review or separate explicit canonical candidate promotion approval"
  },
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    reviewOnlyCandidateWriteExecutedNowCount: candidates.length,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  candidates,
  blocks
};

await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsPath, candidates.map(candidate => JSON.stringify(candidate)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  candidatesDir: report.candidatesDir,
  summary: report.summary,
  guardrails: report.guardrails,
  candidates,
  blocks
}, null, 2));

if (blocks.length) process.exitCode = 1;
