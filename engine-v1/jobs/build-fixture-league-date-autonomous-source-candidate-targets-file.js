#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    output: "",
    selfTest: false,
    limit: 0,
    perLeagueLimit: 0
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--input" && argv[i + 1]) {
      args.input = argv[++i];
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      args.output = argv[++i];
      continue;
    }

    if (arg === "--limit" && argv[i + 1]) {
      args.limit = Number(argv[++i]);
      continue;
    }

    if (arg === "--per-league-limit" && argv[i + 1]) {
      args.perLeagueLimit = Number(argv[++i]);
      continue;
    }

    throw new Error(`unknown or incomplete argument: ${arg}`);
  }

  return args;
}

function selectWorkRows(input) {
  if (Array.isArray(input)) return input;

  const candidates = [
    input.workRows,
    input.discoveryWorkRows,
    input.rows,
    input.items
  ];

  for (const value of candidates) {
    if (Array.isArray(value) && value.length > 0) return value;
  }

  return [];
}

function normalizeFamily(value) {
  return asText(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function scoreIntent(intent) {
  const priority = Number(intent?.priority);
  if (Number.isFinite(priority)) return Math.max(0, Math.min(100, priority));

  const name = asText(intent?.intent);
  if (name.includes("official_league")) return 100;
  if (name.includes("federation")) return 90;
  if (name.includes("club")) return 80;
  if (name.includes("trusted")) return 60;
  if (name.includes("no_fixture")) return 55;
  return 40;
}

function scoreFamily(family) {
  const normalized = normalizeFamily(family);

  if (normalized === "official_league") return 100;
  if (normalized === "competition_operator") return 95;
  if (normalized === "national_federation") return 90;
  if (normalized === "official_club") return 75;
  if (normalized === "trusted_independent_fixture_listing") return 55;
  if (normalized === "any_relevant") return 35;

  return 20;
}

function buildDedupeKey(row, intent, family) {
  return [
    asText(row.dayKey),
    asText(row.leagueSlug).toLowerCase(),
    asText(intent.intent).toLowerCase(),
    normalizeFamily(family),
    asText(intent.query).toLowerCase().replace(/\s+/g, " ")
  ].join("|");
}

function buildSearchTarget(row, intent, family, index) {
  const intentScore = scoreIntent(intent);
  const familyScore = scoreFamily(family);
  const compositeScore = Math.round((intentScore * 0.65) + (familyScore * 0.35));

  return {
    searchTargetId: [
      asText(row.dayKey),
      asText(row.leagueSlug),
      asText(intent.intent),
      normalizeFamily(family),
      index
    ].join(":"),
    leagueSlug: asText(row.leagueSlug),
    name: asText(row.name),
    country: asText(row.country),
    dayKey: asText(row.dayKey),
    scope: asText(row.scope) || "senior_top_division",
    query: asText(intent.query),
    intent: asText(intent.intent),
    expectedSourceFamily: normalizeFamily(family),
    priority: Number(intent.priority) || intentScore,
    sourceFamilyScore: familyScore,
    compositeScore,
    resolutionMode: "search_provider_required",
    candidateUrl: null,
    manualCandidateUrlUsed: false,
    fetchState: "not_fetched",
    reason: [
      "built_from_autonomous_query_intent",
      `intent_score_${intentScore}`,
      `source_family_score_${familyScore}`,
      "no_manual_url_input"
    ],
    dedupeKey: buildDedupeKey(row, intent, family),
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function normalizeRow(row, index) {
  const leagueSlug = asText(row.leagueSlug);
  const name = asText(row.name);
  const dayKey = asText(row.dayKey);
  const queryIntents = Array.isArray(row.queryIntents) ? row.queryIntents : [];

  if (!leagueSlug || !name || !dayKey) {
    return {
      ok: false,
      rejectedReason: "missing_required_work_row_identity",
      sourceIndex: index,
      leagueSlug,
      name,
      dayKey
    };
  }

  if (queryIntents.length === 0) {
    return {
      ok: false,
      rejectedReason: "missing_query_intents",
      sourceIndex: index,
      leagueSlug,
      name,
      dayKey
    };
  }

  return {
    ok: true,
    row: {
      leagueSlug,
      name,
      country: asText(row.country),
      dayKey,
      scope: asText(row.scope) || "senior_top_division",
      queryIntents
    }
  };
}

function dedupeAndSortTargets(targets) {
  const seen = new Set();
  const out = [];

  for (const target of targets) {
    if (seen.has(target.dedupeKey)) continue;
    seen.add(target.dedupeKey);
    out.push(target);
  }

  out.sort((a, b) => {
    if (b.compositeScore !== a.compositeScore) return b.compositeScore - a.compositeScore;
    if (a.leagueSlug !== b.leagueSlug) return a.leagueSlug.localeCompare(b.leagueSlug);
    return a.query.localeCompare(b.query);
  });

  return out;
}

function buildReport(input, options = {}) {
  const rawRows = selectWorkRows(input);
  const limit = Number.isFinite(options.limit) && options.limit > 0 ? options.limit : rawRows.length;
  const selectedRows = rawRows.slice(0, limit);
  const normalized = selectedRows.map((row, index) => normalizeRow(row, index));

  const workRows = normalized.filter((item) => item.ok).map((item) => item.row);
  const rejectedRows = normalized.filter((item) => !item.ok);

  const rawTargets = [];

  for (const row of workRows) {
    let index = 0;

    for (const intent of row.queryIntents) {
      const families = Array.isArray(intent.expectedSourceFamilies) && intent.expectedSourceFamilies.length > 0
        ? intent.expectedSourceFamilies
        : ["any_relevant"];

      for (const family of families) {
        rawTargets.push(buildSearchTarget(row, intent, family, index));
        index += 1;
      }
    }
  }

  let searchTargetRows = dedupeAndSortTargets(rawTargets);

  if (Number.isFinite(options.perLeagueLimit) && options.perLeagueLimit > 0) {
    const byLeagueCount = new Map();
    searchTargetRows = searchTargetRows.filter((row) => {
      const key = row.leagueSlug;
      const count = byLeagueCount.get(key) || 0;
      if (count >= options.perLeagueLimit) return false;
      byLeagueCount.set(key, count + 1);
      return true;
    });
  }

  const byLeague = {};
  for (const row of searchTargetRows) {
    if (!byLeague[row.leagueSlug]) {
      byLeague[row.leagueSlug] = {
        name: row.name,
        dayKey: row.dayKey,
        searchTargetCount: 0,
        topCompositeScore: row.compositeScore,
        expectedSourceFamilies: []
      };
    }

    byLeague[row.leagueSlug].searchTargetCount += 1;

    if (!byLeague[row.leagueSlug].expectedSourceFamilies.includes(row.expectedSourceFamily)) {
      byLeague[row.leagueSlug].expectedSourceFamilies.push(row.expectedSourceFamily);
    }
  }

  return {
    ok: true,
    job: "build-fixture-league-date-autonomous-source-candidate-targets-file",
    mode: "read_only_autonomous_fixture_source_candidate_targets",
    generatedAt: new Date().toISOString(),
    summary: {
      inputWorkRowCount: rawRows.length,
      selectedWorkRowCount: selectedRows.length,
      acceptedWorkRowCount: workRows.length,
      rejectedWorkRowCount: rejectedRows.length,
      rawSearchTargetCount: rawTargets.length,
      searchTargetCount: searchTargetRows.length,
      resolutionMode: "search_provider_required",
      manualCandidateUrlsRequired: false,
      manualCandidateUrlsUsed: false,
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      byLeague
    },
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noResolvedUrlClaim: true,
      manualCandidateUrlsRequired: false,
      manualCandidateUrlsUsed: false,
      noReviewDecisionApplied: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    notes: [
      "This job does not resolve URLs and does not pretend a source was found.",
      "It converts autonomous query intents into ranked search-provider-ready targets.",
      "A later resolver must use a real search provider or maintained source index to convert these targets into candidate URLs."
    ],
    searchTargetRows,
    rejectedRows
  };
}

function runSelfTest() {
  const sample = {
    workRows: [
      {
        leagueSlug: "gre.1",
        name: "Super League Greece",
        country: "Greece",
        dayKey: "2026-05-22",
        scope: "senior_top_division",
        queryIntents: [
          {
            intent: "official_league_fixture_calendar",
            priority: 100,
            query: "\"Super League Greece\" official fixtures schedule 2026-05-22",
            expectedSourceFamilies: ["official_league", "competition_operator"]
          },
          {
            intent: "federation_competition_calendar",
            priority: 90,
            query: "Greece football Super League Greece federation competition fixtures 2026-05-22",
            expectedSourceFamilies: ["national_federation"]
          }
        ]
      },
      {
        leagueSlug: "bad.1",
        name: "Bad League",
        dayKey: "2026-05-22",
        queryIntents: []
      }
    ]
  };

  const report = buildReport(sample);

  if (report.summary.acceptedWorkRowCount !== 1) throw new Error("expected 1 accepted work row");
  if (report.summary.rejectedWorkRowCount !== 1) throw new Error("expected 1 rejected work row");
  if (report.summary.searchTargetCount !== 3) throw new Error(`expected 3 targets, got ${report.summary.searchTargetCount}`);
  if (report.guarantees.manualCandidateUrlsUsed !== false) throw new Error("manual URLs must not be used");
  if (report.guarantees.noResolvedUrlClaim !== true) throw new Error("must not claim resolved URLs");
  if (report.searchTargetRows.some((row) => row.candidateUrl !== null)) throw new Error("candidateUrl must remain null");

  return {
    ok: true,
    selfTest: "build-fixture-league-date-autonomous-source-candidate-targets-file",
    summary: report.summary,
    guarantees: report.guarantees
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  if (!args.input) throw new Error("--input is required unless --self-test is used");
  if (!args.output) throw new Error("--output is required unless --self-test is used");

  const input = readJson(args.input);
  const report = buildReport(input, {
    limit: args.limit,
    perLeagueLimit: args.perLeagueLimit
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main();
}
