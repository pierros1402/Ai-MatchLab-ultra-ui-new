#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function resolvePath(filePath) {
  if (!filePath) return null;
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function readJson(filePath) {
  const abs = resolvePath(filePath);
  if (!abs) throw new Error("missing file path");
  return JSON.parse(fs.readFileSync(abs, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value, pretty = true) {
  const abs = resolvePath(filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`, "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    tasks: null,
    sources: [],
    output: null,
    date: null,
    selfTest: false,
    pretty: true
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--tasks" && argv[i + 1]) {
      args.tasks = cleanString(argv[++i]);
      continue;
    }
    if (arg.startsWith("--tasks=")) {
      args.tasks = cleanString(arg.slice("--tasks=".length));
      continue;
    }

    if ((arg === "--source" || arg === "--sources") && argv[i + 1]) {
      args.sources.push(...splitSources(argv[++i]));
      continue;
    }
    if (arg.startsWith("--source=")) {
      args.sources.push(...splitSources(arg.slice("--source=".length)));
      continue;
    }
    if (arg.startsWith("--sources=")) {
      args.sources.push(...splitSources(arg.slice("--sources=".length)));
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      args.output = cleanString(argv[++i]);
      continue;
    }
    if (arg.startsWith("--output=")) {
      args.output = cleanString(arg.slice("--output=".length));
      continue;
    }

    if (arg === "--date" && argv[i + 1]) {
      args.date = cleanString(argv[++i]);
      continue;
    }
    if (arg.startsWith("--date=")) {
      args.date = cleanString(arg.slice("--date=".length));
      continue;
    }

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--compact") {
      args.pretty = false;
      continue;
    }

    if (arg === "--pretty") {
      args.pretty = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.selfTest) {
    if (!args.tasks) throw new Error("missing required --tasks");
    if (args.sources.length === 0) throw new Error("missing required --source/--sources");
  }

  if (!args.output) {
    args.output = args.tasks
      ? defaultOutputPath(args.tasks)
      : "data/football-truth/_diagnostics/fixture-acquisition-stability/self-test.fixture-identity-second-source-url-resolutions.from-external-active.json";
  }

  return args;
}

function splitSources(value) {
  return cleanString(value)
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function defaultOutputPath(tasksPath) {
  const parsed = path.parse(tasksPath);
  return path.join(parsed.dir, `${parsed.name}.from-external-active.json`);
}

function usage() {
  console.log([
    "Usage:",
    "  node engine-v1/jobs/adapt-fixture-identity-second-source-url-resolutions-from-external-active-file.js --date YYYY-MM-DD --tasks <second-source-url-resolution-tasks.json> --source <validated-external-active-url-resolutions.json> --source <...> --output <adapted-url-resolutions.json>",
    "",
    "Purpose:",
    "  Adapt validated fixture external-active source URL resolutions into fixture identity second-source URL resolution rows.",
    "",
    "Important:",
    "  This job does not fetch URLs.",
    "  This job does not resolve URLs.",
    "  This job does not apply review decisions.",
    "  This job does not write canonical fixtures, deploy snapshots, value data, or details.",
    "",
    "Output:",
    "  One accepted URL-resolution row per target league, attached to the first second-source resolution task for that league.",
    "",
    "Guarantees:",
    "  - sourceFetch: false",
    "  - noFetch: true",
    "  - noUrlFetch: true",
    "  - noExternalSearch: true",
    "  - noReviewDecisionApplied: true",
    "  - noCanonicalPromotion: true",
    "  - canonicalWrites: 0",
    "  - productionWrite: false",
    "  - dryRun: true"
  ].join("\n"));
}

function normalizeDate(value) {
  const text = cleanString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`Invalid date: ${text || "<empty>"}`);
  }
  return text;
}

function normalizeUrl(value) {
  const raw = cleanString(value);
  if (!raw) return "";

  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function hostnameOf(value) {
  const normalized = normalizeUrl(value);
  if (!normalized) return "";

  try {
    return new URL(normalized).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isExcludedHost(host, excludedHosts = []) {
  const normalized = cleanString(host).toLowerCase();
  return excludedHosts
    .map((value) => cleanString(value).toLowerCase())
    .filter(Boolean)
    .some((excluded) => normalized === excluded || normalized.endsWith(`.${excluded}`));
}

function guarantees() {
  return {
    sourceFetch: false,
    noFetch: true,
    noUrlFetch: true,
    noExternalSearch: true,
    noUrlResolutionSideEffects: true,
    noReviewDecisionApplied: true,
    noCanonicalPromotion: true,
    canonicalWrites: 0,
    deploySnapshotWrites: false,
    valueWrites: false,
    detailsWrites: false,
    productionWrite: false,
    dryRun: true
  };
}

function taskRows(taskPack) {
  return asArray(taskPack?.urlResolutionTemplate)
    .filter((row) => cleanString(row?.leagueSlug) && cleanString(row?.taskId));
}

function firstTaskByLeague(taskPack) {
  const rows = taskRows(taskPack)
    .slice()
    .sort((a, b) => {
      const aSlug = cleanString(a.leagueSlug);
      const bSlug = cleanString(b.leagueSlug);
      if (aSlug !== bSlug) return aSlug.localeCompare(bSlug);
      return cleanString(a.searchTargetId).localeCompare(cleanString(b.searchTargetId));
    });

  const byLeague = new Map();

  for (const row of rows) {
    const slug = cleanString(row.leagueSlug);
    if (!byLeague.has(slug)) byLeague.set(slug, row);
  }

  return byLeague;
}

function excludedHostsByLeague(taskPack) {
  const byLeague = new Map();
  const summaryByLeague = taskPack?.summary?.byLeague || {};

  for (const [slug, info] of Object.entries(summaryByLeague)) {
    byLeague.set(slug, asArray(info?.excludedHosts).map((value) => cleanString(value)).filter(Boolean));
  }

  for (const row of taskRows(taskPack)) {
    const slug = cleanString(row.leagueSlug);
    if (!byLeague.has(slug)) byLeague.set(slug, []);
  }

  return byLeague;
}

function validatedExternalRows(sourceReports) {
  const rows = [];

  for (const report of sourceReports) {
    if (report?.ok !== true) {
      throw new Error("External-active source validation report must have ok=true.");
    }

    const summary = report?.summary || {};
    if (Number(summary?.invalidResolutionCount ?? 0) > 0) {
      throw new Error("External-active source validation report has invalid resolutions.");
    }
    if (Number(summary?.canonicalWrites ?? 0) !== 0 || summary?.productionWrite === true) {
      throw new Error("Unsafe external-active source validation report: writes detected.");
    }

    for (const row of asArray(report?.validSourceUrlResolutions)) {
      const leagueSlug = cleanString(row?.leagueSlug);
      const resolvedUrl = normalizeUrl(row?.resolvedUrl);
      if (!leagueSlug || !resolvedUrl) continue;

      if (cleanString(row?.validationState) && cleanString(row.validationState) !== "valid_source_url_resolution") {
        continue;
      }

      rows.push({
        ...row,
        leagueSlug,
        resolvedUrl,
        hostname: hostnameOf(resolvedUrl)
      });
    }
  }

  return rows;
}

function chooseExternalRow(rows) {
  const sourceTypeRank = new Map([
    ["official_league_fixture_list", 1],
    ["official_federation_fixture_list", 2],
    ["official_competition_fixture_list", 3],
    ["trusted_fixture_scoreboard_crosscheck", 10]
  ]);

  return rows
    .slice()
    .sort((a, b) => {
      const aRank = sourceTypeRank.get(cleanString(a.sourceType)) ?? 50;
      const bRank = sourceTypeRank.get(cleanString(b.sourceType)) ?? 50;
      if (aRank !== bRank) return aRank - bRank;
      return cleanString(a.resolvedUrl).localeCompare(cleanString(b.resolvedUrl));
    })[0] || null;
}

function mapSecondSourceType(value) {
  const sourceType = cleanString(value);

  if (sourceType.includes("official_league")) return "official_league";
  if (sourceType.includes("official_federation")) return "official_federation";
  if (sourceType.includes("official_competition")) return "official_competition";
  if (sourceType.includes("official_club")) return "official_club";
  if (sourceType.includes("trusted")) return "trusted_provider";
  if (sourceType.includes("scoreboard")) return "trusted_provider";

  return "other";
}

function adaptRow(taskRow, externalRow) {
  const resolvedUrl = normalizeUrl(externalRow?.resolvedUrl);
  const hostname = hostnameOf(resolvedUrl);

  return {
    ...taskRow,
    resolvedUrl,
    sourceUrl: resolvedUrl,
    hostname,
    sourceName: cleanString(externalRow?.sourceTitle) || cleanString(externalRow?.name) || hostname,
    sourceTitle: cleanString(externalRow?.sourceTitle),
    sourceType: mapSecondSourceType(externalRow?.sourceType),
    originalExternalActiveSourceType: cleanString(externalRow?.sourceType),
    resolvedBy: "diagnostic",
    originalResolvedBy: "external_active_validated_source_adapter",
    reviewerNotes: [
      cleanString(externalRow?.reviewerNotes),
      "Adapted from validated external-active source URL resolution for fixture identity second-source confirmation. Candidate only; no fetch, no review decision, no canonical promotion, no production write."
    ].filter(Boolean).join(" "),
    externallyActive: externalRow?.externallyActive === true,
    fixtureCountFound: Number(externalRow?.fixtureCountFound ?? 0),
    missingFromSnapshot: externalRow?.missingFromSnapshot === true,
    validationState: "adapted_from_valid_external_active_source_url_resolution",
    acceptedForSecondSourceValidation: true,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function buildReport(taskPack, sourceReports, options = {}) {
  const date = options.date || cleanString(taskPack?.targetDate) || null;
  const taskByLeague = firstTaskByLeague(taskPack);
  const excludedByLeague = excludedHostsByLeague(taskPack);
  const externalRows = validatedExternalRows(sourceReports);

  const externalRowsByLeague = new Map();

  for (const row of externalRows) {
    if (!externalRowsByLeague.has(row.leagueSlug)) externalRowsByLeague.set(row.leagueSlug, []);
    externalRowsByLeague.get(row.leagueSlug).push(row);
  }

  const adaptedRows = [];
  const unmatchedLeagues = [];
  const blockedExcludedHostRows = [];
  const duplicateExternalRows = [];

  for (const [leagueSlug, taskRow] of taskByLeague.entries()) {
    const candidates = asArray(externalRowsByLeague.get(leagueSlug));
    const excludedHosts = asArray(excludedByLeague.get(leagueSlug));
    const allowedCandidates = [];

    for (const candidate of candidates) {
      const host = hostnameOf(candidate.resolvedUrl);
      if (isExcludedHost(host, excludedHosts)) {
        blockedExcludedHostRows.push({
          leagueSlug,
          name: cleanString(taskRow?.name),
          targetDate: cleanString(taskRow?.targetDate) || date,
          resolvedUrl: normalizeUrl(candidate.resolvedUrl),
          hostname: host,
          blockedReason: "resolved_url_host_matches_second_source_excluded_host",
          canonicalWrites: 0,
          productionWrite: false
        });
      } else {
        allowedCandidates.push(candidate);
      }
    }

    const chosen = chooseExternalRow(allowedCandidates);

    if (!chosen) {
      unmatchedLeagues.push({
        leagueSlug,
        name: cleanString(taskRow?.name),
        targetDate: cleanString(taskRow?.targetDate) || date,
        reason: candidates.length ? "only_excluded_host_candidates" : "no_valid_external_active_source_candidate",
        canonicalWrites: 0,
        productionWrite: false
      });
      continue;
    }

    if (allowedCandidates.length > 1) {
      duplicateExternalRows.push({
        leagueSlug,
        selectedResolvedUrl: normalizeUrl(chosen.resolvedUrl),
        candidateCount: allowedCandidates.length,
        candidateUrls: allowedCandidates.map((row) => normalizeUrl(row.resolvedUrl)).filter(Boolean)
      });
    }

    adaptedRows.push(adaptRow(taskRow, chosen));
  }

  const byLeague = {};

  for (const [leagueSlug, taskRow] of taskByLeague.entries()) {
    byLeague[leagueSlug] = {
      name: cleanString(taskRow?.name),
      targetDate: cleanString(taskRow?.targetDate) || date,
      taskCandidateCount: 1,
      adaptedCount: adaptedRows.filter((row) => row.leagueSlug === leagueSlug).length,
      externalCandidateCount: asArray(externalRowsByLeague.get(leagueSlug)).length,
      excludedHostBlockedCount: blockedExcludedHostRows.filter((row) => row.leagueSlug === leagueSlug).length
    };
  }

  const summary = {
    inputSecondSourceResolutionTaskCount: taskRows(taskPack).length,
    inputSecondSourceLeagueCount: taskByLeague.size,
    externalValidSourceUrlResolutionCount: externalRows.length,
    adaptedResolutionCount: adaptedRows.length,
    unmatchedLeagueCount: unmatchedLeagues.length,
    blockedExcludedHostCount: blockedExcludedHostRows.length,
    duplicateExternalCandidateLeagueCount: duplicateExternalRows.length,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    byLeague
  };

  return {
    ok: unmatchedLeagues.length === 0,
    job: "adapt-fixture-identity-second-source-url-resolutions-from-external-active-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_fixture_identity_second_source_url_resolutions_from_external_active",
    targetDate: date,
    sourceInputs: {
      secondSourceTasks: options.tasksPath || null,
      externalActiveSources: options.sourcePaths || []
    },
    summary,
    guarantees: guarantees(),
    resolutionTasks: taskRows(taskPack),
    urlResolutionTemplate: adaptedRows,
    acceptedResolvedUrls: adaptedRows,
    unmatchedLeagues,
    blockedExcludedHostRows,
    duplicateExternalRows,
    notes: [
      "This report adapts already validated external-active source URL resolutions into fixture identity second-source URL resolution rows.",
      "Only one URL resolution row is emitted per league, using the first second-source resolution task for that league.",
      "Excluded hosts from the second-source task pack are blocked.",
      "No URL fetch, external search, review decision, canonical promotion, deploy snapshot, value, or details writes are performed."
    ]
  };
}

function selfTestTaskPack() {
  return {
    ok: true,
    targetDate: "2026-05-22",
    summary: {
      inputFlatSearchTargetCount: 16,
      resolutionTaskCount: 16,
      leagueCount: 2,
      uniqueExcludedHosts: ["www.betexplorer.com"],
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      byLeague: {
        "bel.1": {
          name: "Belgian Pro League",
          targetDate: "2026-05-22",
          resolutionTaskCount: 8,
          excludedHosts: ["www.betexplorer.com"]
        },
        "esp.1": {
          name: "LaLiga",
          targetDate: "2026-05-22",
          resolutionTaskCount: 8,
          excludedHosts: ["www.betexplorer.com"]
        }
      }
    },
    urlResolutionTemplate: [
      {
        taskId: "fixture_identity_second_source_search:2026-05-22:bel.1:01:resolve",
        searchTargetId: "fixture_identity_second_source_search:2026-05-22:bel.1:01",
        leagueSlug: "bel.1",
        name: "Belgian Pro League",
        targetDate: "2026-05-22",
        query: "\"Belgian Pro League\" \"2026-05-22\" fixtures"
      },
      {
        taskId: "fixture_identity_second_source_search:2026-05-22:esp.1:01:resolve",
        searchTargetId: "fixture_identity_second_source_search:2026-05-22:esp.1:01",
        leagueSlug: "esp.1",
        name: "LaLiga",
        targetDate: "2026-05-22",
        query: "\"LaLiga\" \"2026-05-22\" fixtures"
      }
    ]
  };
}

function selfTestSourceReport() {
  return {
    ok: true,
    mode: "read_only_fixture_external_active_source_url_resolution_validator",
    job: "validate-fixture-external-active-source-url-resolutions-file",
    summary: {
      inputRowCount: 2,
      pendingResolutionCount: 0,
      validResolutionCount: 2,
      invalidResolutionCount: 0,
      readyForFetchCount: 2,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    validSourceUrlResolutions: [
      {
        leagueSlug: "bel.1",
        name: "Belgian Pro League",
        resolvedUrl: "https://www.proleague.be/",
        sourceType: "official_league_fixture_list",
        sourceTitle: "Belgian Pro League official site",
        reviewerNotes: "Self-test official source.",
        externallyActive: true,
        fixtureCountFound: 1,
        missingFromSnapshot: true,
        validationState: "valid_source_url_resolution"
      },
      {
        leagueSlug: "esp.1",
        name: "LaLiga",
        resolvedUrl: "https://www.laliga.com/en-GB/laliga-easports/calendar",
        sourceType: "official_league_fixture_list",
        sourceTitle: "LaLiga calendar candidate",
        reviewerNotes: "Self-test official source.",
        externallyActive: true,
        fixtureCountFound: 1,
        missingFromSnapshot: true,
        validationState: "valid_source_url_resolution"
      }
    ]
  };
}

function main() {
  const args = parseArgs();
  const date = args.date ? normalizeDate(args.date) : null;

  const taskPack = args.selfTest ? selfTestTaskPack() : readJson(args.tasks);
  const sourceReports = args.selfTest ? [selfTestSourceReport()] : args.sources.map((filePath) => readJson(filePath));

  const report = buildReport(taskPack, sourceReports, {
    date,
    tasksPath: args.selfTest ? "self-test" : args.tasks,
    sourcePaths: args.selfTest ? ["self-test"] : args.sources
  });

  writeJson(args.output, report, args.pretty);

  console.log(JSON.stringify({
    ok: report.ok,
    output: args.output,
    mode: report.mode,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));

  if (!report.ok) {
    process.exitCode = 2;
  }
}

main();