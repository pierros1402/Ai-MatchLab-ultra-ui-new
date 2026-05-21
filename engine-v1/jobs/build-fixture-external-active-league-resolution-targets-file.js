import fs from "node:fs";
import path from "node:path";

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    input: null,
    output: null,
    priority: null,
    includeObserved: false,
    maxTargets: null
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

    if (arg === "--include-observed") {
      out.includeObserved = true;
      continue;
    }

    if (arg === "--max-targets" && argv[i + 1]) {
      out.maxTargets = Number.parseInt(String(argv[++i]).trim(), 10);
      continue;
    }
  }

  if (!out.input) {
    throw new Error("--input path/to/external-active-league-discovery-workset.json is required");
  }

  if (!out.output) {
    const parsed = path.parse(out.input);
    out.output = path.join(parsed.dir, `${parsed.name}.resolution-targets.json`);
  }

  if (out.priority && !["P0", "P1", "P2", "P3"].includes(out.priority)) {
    throw new Error("--priority must be one of P0, P1, P2, P3");
  }

  if (out.maxTargets != null && (!Number.isFinite(out.maxTargets) || out.maxTargets < 1)) {
    throw new Error("--max-targets must be a positive integer");
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

function unique(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizePriority(row) {
  const value = String(row?.priority || "").trim().toUpperCase();
  return ["P0", "P1", "P2", "P3"].includes(value) ? value : "P3";
}

function priorityRank(priority) {
  const order = { P0: 0, P1: 1, P2: 2, P3: 3 };
  return order[priority] ?? 9;
}

function cleanText(value) {
  return String(value || "").trim();
}

function leagueLabel(row) {
  return cleanText(row?.name) || cleanText(row?.leagueSlug);
}

function countryLabel(row) {
  return cleanText(row?.country);
}

function buildDayQueries(row, dayKey) {
  const leagueName = leagueLabel(row);
  const country = countryLabel(row);
  const slug = cleanText(row?.leagueSlug);

  const baseQueries = Array.isArray(row?.searchQueries) ? row.searchQueries : [];

  return unique([
    `"${leagueName}" fixtures ${dayKey}`,
    `"${leagueName}" schedule ${dayKey}`,
    `"${leagueName}" matches ${dayKey}`,
    country ? `${country} football "${leagueName}" fixtures ${dayKey}` : "",
    country ? `${country} "${leagueName}" schedule ${dayKey}` : "",
    slug ? `${slug} fixtures ${dayKey}` : "",
    ...baseQueries.map((query) => `${query} ${dayKey}`)
  ]);
}

function buildPreferredSourceHints(row) {
  const leagueName = leagueLabel(row);
  const country = countryLabel(row);

  return unique([
    "official competition fixture page",
    "official league schedule page",
    "official federation competition page",
    "club official fixture pages as cross-check",
    "reliable structured public provider as cross-check only",
    country ? `${country} football federation fixtures` : "",
    leagueName ? `${leagueName} official fixtures` : ""
  ]);
}

function buildBlockedSourceHints() {
  return [
    "women/youth/development competition unless explicitly declared in the map",
    "scoreboard-only evidence as value-ready provider capability",
    "unverified scrape as canonical fixture truth",
    "single-source unverified fixture insertion",
    "AI-inferred fixture without source evidence"
  ];
}

function classifyResolutionTarget(row) {
  const priority = normalizePriority(row);

  if ((row?.snapshotFixtureCount || 0) > 0) {
    return {
      targetType: "observed_snapshot_source_verification",
      resolutionGoal: "Verify source/provider path for a league already observed in snapshots.",
      needsExternalActivityProof: false
    };
  }

  if (priority === "P2") {
    return {
      targetType: "high_priority_external_activity_check",
      resolutionGoal: "Check whether this declared high-priority league had fixtures on the target day and was missed by ingest.",
      needsExternalActivityProof: true
    };
  }

  return {
    targetType: "background_external_activity_check",
    resolutionGoal: "Check whether this declared league had fixtures on the target day and whether it needs an acquisition path.",
    needsExternalActivityProof: true
  };
}

function buildResolutionRows(discovery, options) {
  const dayKeys = Array.isArray(discovery?.auditWindow?.dayKeys) ? discovery.auditWindow.dayKeys : [];
  if (dayKeys.length === 0) {
    throw new Error("Input discovery workset has no auditWindow.dayKeys");
  }

  const sourceRows = options.includeObserved
    ? Array.isArray(discovery?.rows) ? discovery.rows : []
    : Array.isArray(discovery?.externalCheckTargets) ? discovery.externalCheckTargets : [];

  const rows = [];

  for (const row of sourceRows) {
    const priority = normalizePriority(row);

    if (options.priority && priority !== options.priority) continue;

    for (const dayKey of dayKeys) {
      const classification = classifyResolutionTarget(row);

      rows.push({
        targetId: `${dayKey}:${cleanText(row?.leagueSlug)}`,
        dayKey,
        leagueSlug: cleanText(row?.leagueSlug),
        name: leagueLabel(row),
        country: countryLabel(row) || null,
        tier: row?.tier ?? null,
        priority,
        reason: cleanText(row?.reason),
        targetType: classification.targetType,
        resolutionGoal: classification.resolutionGoal,
        needsExternalActivityProof: classification.needsExternalActivityProof,
        snapshotFixtureCountInWindow: row?.snapshotFixtureCount || 0,
        canonicalFixtureCountInWindow: row?.canonicalFixtureCount || 0,
        historyRows: row?.historyRows || 0,
        daySearchQueries: buildDayQueries(row, dayKey),
        preferredSourceHints: buildPreferredSourceHints(row),
        blockedSourceHints: buildBlockedSourceHints(),
        reviewFields: {
          externallyActive: null,
          fixtureCountFound: null,
          sourceUrls: [],
          sourceTypes: [],
          sourceVerdict: "unreviewed",
          missingFromSnapshot: null,
          proposedAcquisitionPath: null,
          reviewerNotes: ""
        },
        guarantees: {
          sourceFetch: false,
          discoveredExternally: false,
          canonicalWrites: 0,
          valueWrites: false,
          detailsWrites: false,
          productionWrite: false
        }
      });
    }
  }

  rows.sort((a, b) => {
    return priorityRank(a.priority) - priorityRank(b.priority) ||
      String(a.dayKey).localeCompare(String(b.dayKey)) ||
      String(a.leagueSlug).localeCompare(String(b.leagueSlug));
  });

  if (options.maxTargets != null) {
    return rows.slice(0, options.maxTargets);
  }

  return rows;
}

function summarize(rows, discovery, options) {
  const priorityCounts = rows.reduce((acc, row) => {
    acc[row.priority] = (acc[row.priority] || 0) + 1;
    return acc;
  }, {});

  const leagueCount = new Set(rows.map((row) => row.leagueSlug)).size;
  const dayCount = new Set(rows.map((row) => row.dayKey)).size;

  return {
    inputDiscoverySummary: discovery?.summary || null,
    includeObserved: options.includeObserved,
    priorityFilter: options.priority || null,
    maxTargets: options.maxTargets,
    resolutionRowCount: rows.length,
    resolutionLeagueCount: leagueCount,
    resolutionDayCount: dayCount,
    priorityCounts,
    highPriorityExternalActivityCheckRows: rows.filter((row) => row.targetType === "high_priority_external_activity_check").length,
    backgroundExternalActivityCheckRows: rows.filter((row) => row.targetType === "background_external_activity_check").length,
    observedSnapshotSourceVerificationRows: rows.filter((row) => row.targetType === "observed_snapshot_source_verification").length
  };
}

async function main() {
  const options = parseArgs();
  const discovery = readJson(options.input);

  if (!discovery?.ok) {
    throw new Error("Input discovery workset is not ok:true");
  }

  const rows = buildResolutionRows(discovery, options);

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    sourceInput: options.input,
    auditWindow: discovery.auditWindow || null,
    summary: summarize(rows, discovery, options),
    rows,
    notes: [
      "This is a resolution/review target file only.",
      "It does not fetch sources and does not prove external fixture activity.",
      "reviewFields are intentionally null/unreviewed for manual or controlled downstream source resolution.",
      "Scoreboard-only evidence must not unlock value-ready fixture acquisition capability."
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