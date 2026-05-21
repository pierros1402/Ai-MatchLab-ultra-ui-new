import fs from "node:fs";
import path from "node:path";

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    input: null,
    output: null,
    priority: null,
    maxRows: 50,
    groupBy: "league_day"
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

    if (arg === "--priority" && argv[i + 1]) {
      out.priority = String(argv[++i]).trim().toUpperCase();
      continue;
    }

    if (arg === "--max-rows" && argv[i + 1]) {
      out.maxRows = Number.parseInt(String(argv[++i]).trim(), 10);
      continue;
    }

    if (arg === "--group-by" && argv[i + 1]) {
      out.groupBy = String(argv[++i]).trim();
      continue;
    }
  }

  if (!out.input) {
    throw new Error("--input path/to/external-active-league-resolution-targets.json is required");
  }

  if (!out.output) {
    const parsed = path.parse(out.input);
    out.output = path.join(parsed.dir, `${parsed.name}.review-pack.json`);
  }

  if (out.priority && !["P0", "P1", "P2", "P3"].includes(out.priority)) {
    throw new Error("--priority must be one of P0, P1, P2, P3");
  }

  if (!Number.isFinite(out.maxRows) || out.maxRows < 1 || out.maxRows > 500) {
    throw new Error("--max-rows must be between 1 and 500");
  }

  if (out.groupBy !== "league_day") {
    throw new Error("--group-by currently supports only league_day");
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

function priorityRank(priority) {
  const order = { P0: 0, P1: 1, P2: 2, P3: 3 };
  return order[priority] ?? 9;
}

function normalizeRows(payload, options) {
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  const filtered = rows.filter((row) => {
    if (!options.priority) return true;
    return cleanText(row?.priority).toUpperCase() === options.priority;
  });

  return filtered.sort((a, b) => {
    return priorityRank(cleanText(a?.priority).toUpperCase()) - priorityRank(cleanText(b?.priority).toUpperCase()) ||
      String(a?.dayKey || "").localeCompare(String(b?.dayKey || "")) ||
      String(a?.leagueSlug || "").localeCompare(String(b?.leagueSlug || ""));
  }).slice(0, options.maxRows);
}

function reviewInstructionFor(row) {
  if (row?.targetType === "observed_snapshot_source_verification") {
    return "Verify the source/provider path for this league already observed in snapshots. Do not add fixtures from this review row.";
  }

  if (row?.targetType === "high_priority_external_activity_check") {
    return "Check whether this declared high-priority league had real fixtures on this day and whether those fixtures are missing from our snapshot.";
  }

  return "Check whether this declared league had real fixtures on this day and whether it needs a future acquisition path.";
}

function buildReviewItem(row, index) {
  return {
    reviewId: `fixture-external-active-league:${String(index + 1).padStart(4, "0")}`,
    targetId: cleanText(row?.targetId),
    dayKey: cleanText(row?.dayKey),
    leagueSlug: cleanText(row?.leagueSlug),
    name: cleanText(row?.name),
    country: cleanText(row?.country) || null,
    tier: row?.tier ?? null,
    priority: cleanText(row?.priority).toUpperCase(),
    targetType: cleanText(row?.targetType),
    reason: cleanText(row?.reason),
    resolutionGoal: cleanText(row?.resolutionGoal),
    reviewInstruction: reviewInstructionFor(row),
    needsExternalActivityProof: Boolean(row?.needsExternalActivityProof),
    snapshotFixtureCountInWindow: row?.snapshotFixtureCountInWindow || 0,
    canonicalFixtureCountInWindow: row?.canonicalFixtureCountInWindow || 0,
    historyRows: row?.historyRows || 0,
    searchQueries: Array.isArray(row?.daySearchQueries) ? row.daySearchQueries : [],
    preferredSourceHints: Array.isArray(row?.preferredSourceHints) ? row.preferredSourceHints : [],
    blockedSourceHints: Array.isArray(row?.blockedSourceHints) ? row.blockedSourceHints : [],
    reviewFields: {
      externallyActive: null,
      fixtureCountFound: null,
      fixtureExamples: [],
      sourceUrls: [],
      sourceTypes: [],
      sourceVerdict: "unreviewed",
      missingFromSnapshot: null,
      proposedAcquisitionPath: null,
      reviewerNotes: ""
    },
    acceptanceRules: [
      "Use official competition/league/federation sources first when available.",
      "Use reliable structured public providers only as cross-checks unless the provider is explicitly verified.",
      "Do not treat scoreboard-only evidence as value-ready fixture acquisition capability.",
      "Do not infer activity from league name alone; source evidence must show fixtures for the target day.",
      "Do not write canonical fixtures from this review pack."
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
}

function summarize(items, input, options) {
  const priorityCounts = items.reduce((acc, item) => {
    acc[item.priority] = (acc[item.priority] || 0) + 1;
    return acc;
  }, {});

  const targetTypeCounts = items.reduce((acc, item) => {
    acc[item.targetType] = (acc[item.targetType] || 0) + 1;
    return acc;
  }, {});

  return {
    inputResolutionSummary: input?.summary || null,
    priorityFilter: options.priority || null,
    maxRows: options.maxRows,
    reviewItemCount: items.length,
    reviewLeagueCount: new Set(items.map((item) => item.leagueSlug)).size,
    reviewDayCount: new Set(items.map((item) => item.dayKey)).size,
    priorityCounts,
    targetTypeCounts,
    unreviewedCount: items.filter((item) => item.reviewFields?.sourceVerdict === "unreviewed").length
  };
}

async function main() {
  const options = parseArgs();
  const input = readJson(options.input);

  if (!input?.ok) {
    throw new Error("Input resolution targets file is not ok:true");
  }

  const rows = normalizeRows(input, options);
  const reviewItems = rows.map((row, index) => buildReviewItem(row, index));

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    sourceInput: options.input,
    auditWindow: input.auditWindow || null,
    summary: summarize(reviewItems, input, options),
    reviewItems,
    notes: [
      "This is a review pack only.",
      "It does not fetch sources and does not prove external fixture activity.",
      "Fill reviewFields only after manual or controlled downstream source resolution.",
      "No canonical, value, details, or production writes are allowed from this file."
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
    ok: true,
    input: options.input,
    output: options.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});