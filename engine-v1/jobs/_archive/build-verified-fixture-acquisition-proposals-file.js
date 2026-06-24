import fs from "node:fs";
import path from "node:path";

function argValue(argv, names) {
  for (let i = 0; i < argv.length - 1; i += 1) {
    if (names.includes(argv[i])) return String(argv[i + 1] || "").trim();
  }
  return null;
}

function hasFlag(argv, name) {
  return argv.includes(name);
}

function readJson(file) {
  if (!file || !fs.existsSync(file)) throw new Error(`Missing JSON file: ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function clean(value) {
  return String(value || "").trim();
}

function arr(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function uniq(values) {
  return [...new Set(arr(values).map(clean).filter(Boolean))];
}

function rowsOf(payload) {
  if (Array.isArray(payload?.priorityRows)) return payload.priorityRows;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload)) return payload;
  throw new Error("Input must contain priorityRows[], rows[], items[], or be an array.");
}

function reviewMapOf(reviewPayload) {
  const map = new Map();
  for (const item of arr(reviewPayload?.reviewItems)) {
    const leagueSlug = clean(item?.leagueSlug);
    if (!leagueSlug) continue;
    const fields = item.reviewFields || {};
    map.set(leagueSlug, {
      externallyActive: fields.externallyActive ?? null,
      fixtureCountFound: fields.fixtureCountFound ?? null,
      missingFromSnapshot: fields.missingFromSnapshot ?? null,
      sourceVerdict: clean(fields.sourceVerdict || "unreviewed"),
      sourceUrls: uniq(fields.sourceUrls),
      sourceTypes: uniq(fields.sourceTypes),
      reviewerNotes: clean(fields.reviewerNotes)
    });
  }
  return map;
}

function mergedReview(row, reviewMap) {
  const fromRow = row.review || {};
  const fromReview = reviewMap.get(clean(row.leagueSlug)) || {};
  return {
    externallyActive: fromReview.externallyActive ?? fromRow.externallyActive ?? row.externallyActive ?? null,
    fixtureCountFound: fromReview.fixtureCountFound ?? fromRow.fixtureCountFound ?? row.expectedExternalFixtureCount ?? null,
    missingFromSnapshot: fromReview.missingFromSnapshot ?? fromRow.missingFromSnapshot ?? null,
    sourceVerdict: clean(fromReview.sourceVerdict || fromRow.sourceVerdict || row.sourceVerdict || "unreviewed"),
    sourceUrls: uniq([...arr(fromRow.sourceUrls), ...arr(fromReview.sourceUrls), ...arr(row.sourceUrls)]),
    sourceTypes: uniq([...arr(fromRow.sourceTypes), ...arr(fromReview.sourceTypes), ...arr(row.sourceTypes)]),
    reviewerNotes: clean(fromReview.reviewerNotes || fromRow.reviewerNotes)
  };
}

function hasScoreboardOnly(sourceTypes) {
  const blocked = new Set(["scoreboard_only", "scoreboard-only", "generic_scoreboard", "aggregator_scoreboard_only"]);
  return uniq(sourceTypes).some((type) => blocked.has(type));
}

function blockedReasons(row, review) {
  const reasons = [];

  if (clean(row.likelyFailureStage) !== "canonical_acquisition_missing") reasons.push("not_a_canonical_acquisition_missing_gap");
  if (clean(row.priority) !== "P0") reasons.push("not_p0_priority");
  if (review.externallyActive !== true) reasons.push("external_activity_not_verified_true");
  if (review.sourceVerdict !== "verified_active") reasons.push("source_verdict_not_verified_active");
  if (!Number.isFinite(Number(review.fixtureCountFound)) || Number(review.fixtureCountFound) < 1) reasons.push("missing_positive_fixture_count");
  if (review.sourceUrls.length < 1) reasons.push("missing_source_urls");
  if (review.sourceTypes.length < 1) reasons.push("missing_source_types");
  if (hasScoreboardOnly(review.sourceTypes)) reasons.push("scoreboard_only_evidence_not_value_ready");
  if (Number(row?.canonical?.fixtureCount || 0) > 0) reasons.push("canonical_already_has_fixtures");
  if (Number(row?.deploySnapshot?.fixtureCount || 0) > 0) reasons.push("deploy_snapshot_already_has_fixtures");

  reasons.push("missing_match_level_fixture_identity_rows");
  return reasons;
}

function proposalOf(row, review, date) {
  const leagueSlug = clean(row.leagueSlug);
  const reasons = blockedReasons(row, review);

  return {
    leagueSlug,
    name: clean(row.name),
    date,
    priority: clean(row.priority),
    likelyFailureStage: clean(row.likelyFailureStage),
    recommendedNextAction: clean(row.recommendedNextAction),
    evidenceVerdict: review.sourceVerdict,
    externallyActive: review.externallyActive,
    expectedFixtureCount: Number(review.fixtureCountFound ?? row.expectedExternalFixtureCount ?? 0),
    sourceUrls: review.sourceUrls,
    sourceTypes: review.sourceTypes,
    reviewerNotes: review.reviewerNotes,
    currentState: {
      inCoverage: row.isInCoverage === true,
      canonicalPath: clean(row?.canonical?.path),
      canonicalFixtureCount: Number(row?.canonical?.fixtureCount || 0),
      deploySnapshotPath: clean(row?.deploySnapshot?.path),
      deploySnapshotFixtureCount: Number(row?.deploySnapshot?.fixtureCount || 0)
    },
    proposedCanonicalFixtureRows: [],
    fixtureIdentityState: "missing_match_level_fixture_identity_rows",
    writeTarget: path.join("data", "canonical-fixtures", date, `${leagueSlug}.json`),
    readyForCanonicalWrite: false,
    reviewState: "blocked_before_canonical_write",
    blockedReason: reasons[0] || null,
    blockedReasons: reasons
  };
}

function main() {
  const argv = process.argv.slice(2);
  const date = argValue(argv, ["--date", "--day"]);
  const inputPath = argValue(argv, ["--input", "--gap-report", "--active-gap-report"]);
  const reviewPath = argValue(argv, ["--review"]);
  const outputPath = argValue(argv, ["--output"]) || path.join("data", "football-truth", "_diagnostics", "fixture-acquisition-stability", `${date}.verified-fixture-acquisition-proposals.json`);
  const includeNonP0 = hasFlag(argv, "--include-non-p0");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) throw new Error("--date YYYY-MM-DD is required");
  if (!inputPath) throw new Error("--input path/to/fixture-active-gap-acquisition-priority.json is required");

  const input = readJson(inputPath);
  const review = reviewPath ? readJson(reviewPath) : null;
  const reviewMap = reviewMapOf(review);

  const inputRows = rowsOf(input);
  const candidateRows = inputRows.filter((row) => includeNonP0 || clean(row.priority) === "P0");
  const proposals = candidateRows.map((row) => proposalOf({ ...row, date }, mergedReview(row, reviewMap), date));

  const byBlockedReason = {};
  for (const proposal of proposals) {
    for (const reason of proposal.blockedReasons) byBlockedReason[reason] = (byBlockedReason[reason] || 0) + 1;
  }

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    schema: "ai-matchlab.verified-fixture-acquisition-proposals.v1",
    date,
    source: {
      activeGapReport: inputPath,
      reviewPack: reviewPath || null
    },
    guarantees: {
      sourceFetch: false,
      canonicalWrites: 0,
      deploySnapshotWrites: false,
      valueWrites: false,
      detailsWrites: false,
      productionWrite: false
    },
    summary: {
      inputRowCount: inputRows.length,
      candidateRowCount: candidateRows.length,
      proposalCount: proposals.length,
      readyForCanonicalWriteCount: 0,
      blockedBeforeCanonicalWriteCount: proposals.length,
      proposedCanonicalFixtureRowCount: 0,
      byReviewState: { blocked_before_canonical_write: proposals.length },
      byBlockedReason
    },
    proposals: proposals.sort((a, b) => a.leagueSlug.localeCompare(b.leagueSlug)),
    notes: [
      "This is a read-only acquisition proposal report.",
      "It does not write canonical fixtures, deploy snapshots, value, details, or production data.",
      "League-level verified activity is not enough to write canonical fixtures.",
      "Concrete canonical fixture rows require match-level identity evidence: homeTeam, awayTeam, kickoff time, and source URLs."
    ]
  };

  writeJson(outputPath, report);

  console.log(JSON.stringify({
    ok: true,
    output: outputPath,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();