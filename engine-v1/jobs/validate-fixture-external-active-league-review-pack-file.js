import fs from "node:fs";
import path from "node:path";

const ALLOWED_SOURCE_VERDICTS = new Set([
  "unreviewed",
  "verified_active",
  "verified_inactive",
  "insufficient_evidence",
  "rejected_contaminated",
  "rejected_scoreboard_only",
  "rejected_wrong_league",
  "rejected_wrong_day"
]);

const SCOREBOARD_ONLY_SOURCE_TYPES = new Set([
  "scoreboard_only",
  "scoreboard-only",
  "generic_scoreboard",
  "livescore_only",
  "live_score_only",
  "aggregator_scoreboard_only"
]);

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    input: null,
    output: null,
    failOnInvalid: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();

    if (arg === "--input" && argv[i + 1]) {
      out.input = String(argv[++i]).trim();
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      out.output = String(argv[++i]).trim();
      continue;
    }

    if (arg === "--fail-on-invalid") {
      out.failOnInvalid = true;
      continue;
    }
  }

  if (!out.input) {
    throw new Error("--input path/to/external-active-league-review-pack.json is required");
  }

  if (!out.output) {
    const parsed = path.parse(out.input);
    out.output = path.join(parsed.dir, `${parsed.name}.validation.json`);
  }

  return out;
}

function readJson(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing input file: ${file}`);
  }

  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${file}: invalid JSON: ${error?.message || String(error)}`);
  }
}

function cleanText(value) {
  return String(value || "").trim();
}

function isNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function isBooleanOrNull(value) {
  return value === true || value === false || value === null || value === undefined;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function looksLikeHttpUrl(value) {
  return /^https?:\/\/[^ "\n\r\t]+$/i.test(cleanText(value));
}

function normalizeSourceTypes(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item).toLowerCase()).filter(Boolean);
}

function hasScoreboardOnlySourceType(sourceTypes) {
  return normalizeSourceTypes(sourceTypes).some((sourceType) => SCOREBOARD_ONLY_SOURCE_TYPES.has(sourceType));
}

function addIssue(issues, severity, code, message, extra = {}) {
  issues.push({
    severity,
    code,
    message,
    ...extra
  });
}

function validateReviewItem(item, index) {
  const issues = [];
  const reviewFields = item?.reviewFields || {};
  const reviewId = cleanText(item?.reviewId) || `index:${index}`;

  const externallyActive = reviewFields.externallyActive;
  const fixtureCountFound = reviewFields.fixtureCountFound;
  const sourceUrls = Array.isArray(reviewFields.sourceUrls) ? reviewFields.sourceUrls : [];
  const sourceTypes = Array.isArray(reviewFields.sourceTypes) ? reviewFields.sourceTypes : [];
  const sourceVerdict = cleanText(reviewFields.sourceVerdict || "unreviewed");
  const missingFromSnapshot = reviewFields.missingFromSnapshot;

  if (!cleanText(item?.leagueSlug)) {
    addIssue(issues, "error", "missing_league_slug", "review item is missing leagueSlug", { reviewId });
  }

  if (!cleanText(item?.dayKey)) {
    addIssue(issues, "error", "missing_day_key", "review item is missing dayKey", { reviewId });
  }

  if (!ALLOWED_SOURCE_VERDICTS.has(sourceVerdict)) {
    addIssue(issues, "error", "invalid_source_verdict", `sourceVerdict is not allowed: ${sourceVerdict}`, { reviewId });
  }

  if (!isBooleanOrNull(externallyActive)) {
    addIssue(issues, "error", "invalid_externally_active", "externallyActive must be true, false, null, or omitted", { reviewId });
  }

  if (!isBooleanOrNull(missingFromSnapshot)) {
    addIssue(issues, "error", "invalid_missing_from_snapshot", "missingFromSnapshot must be true, false, null, or omitted", { reviewId });
  }

  for (const url of sourceUrls) {
    if (!looksLikeHttpUrl(url)) {
      addIssue(issues, "error", "invalid_source_url", `sourceUrls contains an invalid URL: ${url}`, { reviewId });
    }
  }

  if (externallyActive === true) {
    if (!isPositiveInteger(fixtureCountFound)) {
      addIssue(issues, "error", "active_requires_fixture_count", "externallyActive=true requires fixtureCountFound as a positive integer", { reviewId });
    }

    if (!isNonEmptyArray(sourceUrls)) {
      addIssue(issues, "error", "active_requires_source_urls", "externallyActive=true requires at least one source URL", { reviewId });
    }

    if (!isNonEmptyArray(sourceTypes)) {
      addIssue(issues, "error", "active_requires_source_types", "externallyActive=true requires at least one source type", { reviewId });
    }

    if (missingFromSnapshot !== true && missingFromSnapshot !== false) {
      addIssue(issues, "error", "active_requires_missing_snapshot_boolean", "externallyActive=true requires missingFromSnapshot to be true or false", { reviewId });
    }

    if (sourceVerdict !== "verified_active") {
      addIssue(issues, "error", "active_requires_verified_active_verdict", "externallyActive=true requires sourceVerdict=verified_active", { reviewId });
    }

    if (hasScoreboardOnlySourceType(sourceTypes)) {
      addIssue(issues, "error", "scoreboard_only_not_value_ready", "scoreboard-only source types cannot verify external activity as value-ready acquisition evidence", { reviewId });
    }
  }

  if (externallyActive === false) {
    if (fixtureCountFound != null && fixtureCountFound !== 0) {
      addIssue(issues, "error", "inactive_fixture_count_must_be_zero_or_null", "externallyActive=false requires fixtureCountFound to be 0, null, or omitted", { reviewId });
    }

    if (missingFromSnapshot === true) {
      addIssue(issues, "error", "inactive_cannot_be_missing_from_snapshot", "externallyActive=false cannot also set missingFromSnapshot=true", { reviewId });
    }

    if (!["verified_inactive", "insufficient_evidence", "unreviewed"].includes(sourceVerdict)) {
      addIssue(issues, "error", "inactive_invalid_verdict", "externallyActive=false requires sourceVerdict=verified_inactive, insufficient_evidence, or unreviewed", { reviewId });
    }
  }

  if (sourceVerdict === "rejected_scoreboard_only" && !hasScoreboardOnlySourceType(sourceTypes)) {
    addIssue(issues, "warning", "rejected_scoreboard_only_without_source_type", "sourceVerdict=rejected_scoreboard_only usually needs a scoreboard-only sourceType", { reviewId });
  }

  if (sourceVerdict === "verified_active" && externallyActive !== true) {
    addIssue(issues, "error", "verified_active_requires_externally_active", "sourceVerdict=verified_active requires externallyActive=true", { reviewId });
  }

  return {
    reviewId,
    dayKey: cleanText(item?.dayKey),
    leagueSlug: cleanText(item?.leagueSlug),
    priority: cleanText(item?.priority),
    sourceVerdict,
    externallyActive: externallyActive ?? null,
    missingFromSnapshot: missingFromSnapshot ?? null,
    issueCount: issues.length,
    errorCount: issues.filter((issue) => issue.severity === "error").length,
    warningCount: issues.filter((issue) => issue.severity === "warning").length,
    issues
  };
}

function summarize(results) {
  const errorCount = results.reduce((sum, row) => sum + row.errorCount, 0);
  const warningCount = results.reduce((sum, row) => sum + row.warningCount, 0);

  const verdictCounts = results.reduce((acc, row) => {
    acc[row.sourceVerdict] = (acc[row.sourceVerdict] || 0) + 1;
    return acc;
  }, {});

  return {
    reviewItemCount: results.length,
    validReviewItemCount: results.filter((row) => row.errorCount === 0).length,
    invalidReviewItemCount: results.filter((row) => row.errorCount > 0).length,
    errorCount,
    warningCount,
    verdictCounts,
    externallyActiveTrueCount: results.filter((row) => row.externallyActive === true).length,
    externallyActiveFalseCount: results.filter((row) => row.externallyActive === false).length,
    externallyActiveUnreviewedCount: results.filter((row) => row.externallyActive === null).length,
    missingFromSnapshotTrueCount: results.filter((row) => row.missingFromSnapshot === true).length
  };
}

async function main() {
  const options = parseArgs();
  const input = readJson(options.input);

  if (!input?.ok) {
    throw new Error("Input review pack is not ok:true");
  }

  const items = Array.isArray(input?.reviewItems) ? input.reviewItems : [];
  const results = items.map((item, index) => validateReviewItem(item, index));
  const summary = summarize(results);

  const report = {
    ok: summary.errorCount === 0,
    generatedAt: new Date().toISOString(),
    sourceInput: options.input,
    auditWindow: input.auditWindow || null,
    summary,
    results,
    notes: [
      "This validator is read-only.",
      "Unreviewed rows are valid only when they do not claim external activity.",
      "externallyActive=true requires source URLs, source types, fixture count, missingFromSnapshot boolean, and sourceVerdict=verified_active.",
      "Scoreboard-only evidence is blocked from verifying value-ready fixture acquisition capability."
    ],
    guarantees: {
      sourceFetch: false,
      discoveredExternally: false,
      canonicalWrites: 0,
      valueWrites: false,
      detailsWrites: false,
      productionWrite: false
    }
  };

  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log(JSON.stringify({
    ok: report.ok,
    input: options.input,
    output: options.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));

  if (!report.ok && options.failOnInvalid) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});