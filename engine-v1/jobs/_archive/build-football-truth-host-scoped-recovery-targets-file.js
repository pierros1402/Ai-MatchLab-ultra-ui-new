#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-13";

const DEFAULT_LOOP =
  "data/football-truth/_diagnostics/autonomous-competition-resolution-loop-2026-06-13/autonomous-competition-resolution-loop-2026-06-13.json";

const HOST_SEARCH_TEMPLATES = [
  {
    targetType: "host_homepage_inspection",
    pathHint: "/",
    purpose: "inspect_official_host_homepage_for_competition_navigation"
  },
  {
    targetType: "host_standings_path_candidates",
    pathHint: "standings|table|league|competition",
    purpose: "derive_standings_page_or_api_candidates_from_host_only"
  },
  {
    targetType: "host_fixtures_results_path_candidates",
    pathHint: "fixtures|results|matches|calendar",
    purpose: "derive_fixtures_results_page_or_api_candidates_from_host_only"
  }
];

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    loop: DEFAULT_LOOP,
    output: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--loop") args.loop = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.output) {
    args.output = path.join(
      "data/football-truth/_diagnostics",
      `host-scoped-recovery-targets-${args.date}`,
      `host-scoped-recovery-targets-${args.date}.json`
    );
  }

  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing JSON input: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function stableJson(value) {
  return JSON.stringify(value, null, 2);
}

function normalizeHost(host) {
  return String(host || "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function hostUrl(host, pathHint) {
  const normalized = normalizeHost(host);
  if (!normalized) return "";

  if (pathHint === "/") return `https://${normalized}/`;

  return `https://${normalized}/`;
}

function buildSearchQuery(row, template) {
  const host = normalizeHost(row.officialHost);
  const slug = row.competitionSlug;
  const countryKey = row.countryKey || slug.split(".")[0] || "";
  const type = row.competitionType || "";

  if (template.targetType === "host_homepage_inspection") {
    return `site:${host} ${countryKey} football ${type}`;
  }

  if (template.targetType === "host_standings_path_candidates") {
    return `site:${host} ${countryKey} football ${slug} standings table league`;
  }

  if (template.targetType === "host_fixtures_results_path_candidates") {
    return `site:${host} ${countryKey} football ${slug} fixtures results matches`;
  }

  return `site:${host} ${slug}`;
}

function main() {
  const args = parseArgs(process.argv);
  const loop = readJson(args.loop);

  const sourceRows = Array.isArray(loop.resolutionRows)
    ? loop.resolutionRows.filter((row) =>
        row &&
        row.lane === "official_host_recovery_host_scoped_targets" &&
        row.status === "actionable_source_scoped" &&
        row.officialHost
      )
    : [];

  const targetRows = [];

  for (const row of sourceRows) {
    for (const template of HOST_SEARCH_TEMPLATES) {
      targetRows.push({
        competitionSlug: row.competitionSlug,
        competitionType: row.competitionType,
        countryKey: row.countryKey,
        officialHost: normalizeHost(row.officialHost),
        targetType: template.targetType,
        purpose: template.purpose,
        pathHint: template.pathHint,
        candidateHostRootUrl: hostUrl(row.officialHost, template.pathHint),
        scopedQuery: buildSearchQuery(row, template),
        searchAllowedNow: false,
        fetchAllowedNow: false,
        requiresExplicitAllowSearchOrFetch: true,
        canonicalWriteEligible: false,
        sourceEvidence: {
          fromLoop: args.loop,
          lane: row.lane,
          status: row.status,
          hostConfidence: row.hostConfidence ?? null,
          nextAction: row.nextAction
        }
      });
    }
  }

  const byHost = {};
  for (const row of targetRows) {
    byHost[row.officialHost] = (byHost[row.officialHost] || 0) + 1;
  }

  const byCompetition = {};
  for (const row of targetRows) {
    byCompetition[row.competitionSlug] = (byCompetition[row.competitionSlug] || 0) + 1;
  }

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-host-scoped-recovery-targets-file",
    mode: "source_only_host_scoped_recovery_targets_no_search_no_fetch_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      autonomousLoop: args.loop,
      sourceResolutionRowCount: sourceRows.length
    },
    summary: {
      sourceResolutionRowCount: sourceRows.length,
      targetRowCount: targetRows.length,
      hostCount: Object.keys(byHost).length,
      competitionCount: Object.keys(byCompetition).length,
      searchAllowedNow: false,
      fetchAllowedNow: false,
      canonicalWriteEligibleCount: 0,
      recommendedNextLane:
        targetRows.length > 0
          ? "human_review_host_scoped_targets_then_run_small_allow_search_or_allow_fetch_only_if_approved"
          : "no_host_scoped_recovery_targets_available"
    },
    counts: {
      byHost,
      byCompetition
    },
    guardrails: [
      "This file is a target plan only.",
      "It does not run search.",
      "It does not fetch URLs.",
      "It does not treat host-scoped query output as truth.",
      "Canonical writes remain blocked until a later truth gate validates concrete evidence."
    ],
    targetRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    sourceResolutionRowCount: output.summary.sourceResolutionRowCount,
    targetRowCount: output.summary.targetRowCount,
    hostCount: output.summary.hostCount,
    competitionCount: output.summary.competitionCount,
    searchAllowedNow: false,
    fetchAllowedNow: false,
    canonicalWrites: 0,
    productionWrite: false,
    recommendedNextLane: output.summary.recommendedNextLane
  }, null, 2));
}

main();
