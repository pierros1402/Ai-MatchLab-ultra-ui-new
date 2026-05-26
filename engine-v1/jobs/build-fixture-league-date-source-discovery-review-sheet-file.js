#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv = process.argv) {
  const args = {
    input: "",
    output: "",
    maxTargetsPerCase: 0,
    selfTest: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--input" && argv[i + 1]) {
      args.input = String(argv[++i] || "").trim();
      continue;
    }

    if (arg.startsWith("--input=")) {
      args.input = arg.slice("--input=".length).trim();
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      args.output = String(argv[++i] || "").trim();
      continue;
    }

    if (arg.startsWith("--output=")) {
      args.output = arg.slice("--output=".length).trim();
      continue;
    }

    if (arg === "--max-targets-per-case" && argv[i + 1]) {
      args.maxTargetsPerCase = Number(String(argv[++i] || "").trim());
      continue;
    }

    if (arg.startsWith("--max-targets-per-case=")) {
      args.maxTargetsPerCase = Number(arg.slice("--max-targets-per-case=".length).trim());
      continue;
    }
  }

  return args;
}

function readJson(filePath) {
  if (!filePath) throw new Error("missing --input");
  if (!fs.existsSync(filePath)) throw new Error(`missing input file: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  if (!filePath) throw new Error("missing --output");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function asText(value) {
  return String(value || "").trim();
}

function normalizeDecision(value) {
  const text = asText(value);
  return text || "pending_review";
}

function targetToReviewRow(discoveryCase, target, targetIndex) {
  return {
    reviewRowId: `${discoveryCase.caseId}:target:${String(targetIndex + 1).padStart(2, "0")}`,
    caseId: discoveryCase.caseId,
    leagueSlug: discoveryCase.leagueSlug,
    name: discoveryCase.name,
    targetDate: discoveryCase.targetDate,
    discoveryTargetId: target.discoveryTargetId,
    kind: target.kind,
    priority: Number(target.priority || 0),
    query: target.query,
    requiredSignals: target.requiredSignals || [],
    rejectSignals: target.rejectSignals || [],
    candidateUrl: "",
    candidateKind: "",
    candidateTitle: "",
    opened: false,
    httpStatus: null,
    sourceUsable: false,
    isOfficialOrPrimary: target.kind === "official_league_calendar" || target.kind === "official_league_schedule" || target.kind === "official_federation_calendar",
    isIndependentSecondSource: target.kind === "independent_structured_fixture_page",
    isClubFallback: target.kind === "club_calendar_fallback",
    targetDateVisible: false,
    matchRowsVisible: false,
    explicitNoFixtureEvidence: null,
    wrongCompetition: false,
    wrongDate: false,
    homepageOnly: false,
    newsOnly: false,
    videoOnly: false,
    standingsOnly: false,
    excludedHost: false,
    fixtureRowsForTargetDate: [],
    evidenceTextSnippet: "",
    reviewerDecision: normalizeDecision(),
    reviewerNotes: "",
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function buildReviewSheet(input, options = {}) {
  const discoveryCases = Array.isArray(input.discoveryCases) ? input.discoveryCases : [];
  const maxTargetsPerCase = Number(options.maxTargetsPerCase || 0);

  const reviewRows = [];

  for (const discoveryCase of discoveryCases) {
    const targets = Array.isArray(discoveryCase.discoveryTargets) ? discoveryCase.discoveryTargets : [];
    const selectedTargets = maxTargetsPerCase > 0 ? targets.slice(0, maxTargetsPerCase) : targets;

    selectedTargets.forEach((target, index) => {
      reviewRows.push(targetToReviewRow(discoveryCase, target, index));
    });
  }

  const byLeague = {};
  for (const row of reviewRows) {
    if (!byLeague[row.leagueSlug]) {
      byLeague[row.leagueSlug] = {
        name: row.name,
        targetDate: row.targetDate,
        reviewRowCount: 0,
        officialOrPrimaryRows: 0,
        independentRows: 0,
        clubFallbackRows: 0
      };
    }

    byLeague[row.leagueSlug].reviewRowCount += 1;
    if (row.isOfficialOrPrimary) byLeague[row.leagueSlug].officialOrPrimaryRows += 1;
    if (row.isIndependentSecondSource) byLeague[row.leagueSlug].independentRows += 1;
    if (row.isClubFallback) byLeague[row.leagueSlug].clubFallbackRows += 1;
  }

  return {
    ok: true,
    job: "build-fixture-league-date-source-discovery-review-sheet-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_fixture_league_date_source_discovery_review_sheet",
    sourceInput: options.input || "",
    summary: {
      discoveryCaseCount: discoveryCases.length,
      reviewRowCount: reviewRows.length,
      maxTargetsPerCase: maxTargetsPerCase > 0 ? maxTargetsPerCase : null,
      leagueCount: Object.keys(byLeague).length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    byLeague,
    reviewInstructions: {
      purpose: "Fill candidate URLs found from the discovery query targets. Do not mark rows usable unless the page has target-date match-level fixture evidence or explicit no-fixture evidence.",
      acceptOnlyIf: [
        "candidateUrl is date-specific or filterable to the target date",
        "targetDateVisible is true or explicitNoFixtureEvidence is backed by page text",
        "matchRowsVisible is true for fixture evidence",
        "league/competition context matches leagueSlug",
        "homepageOnly/newsOnly/videoOnly/standingsOnly/wrongDate/wrongCompetition/excludedHost are false"
      ],
      rejectIf: [
        "homepage only",
        "news/video summary only",
        "standings table only",
        "wrong competition",
        "wrong date",
        "excluded host",
        "club page without clear league/date context"
      ],
      nextStepAfterReview: "Run a validator before using any candidate URL for fixture evidence. A verified fixture decision still requires official/primary evidence plus independent agreement."
    },
    reviewRows,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function selfTest() {
  const input = {
    discoveryCases: [
      {
        caseId: "gre.1:2026-05-22:source-discovery",
        leagueSlug: "gre.1",
        name: "Super League Greece",
        targetDate: "2026-05-22",
        discoveryTargets: [
          {
            discoveryTargetId: "gre.1:discovery:01",
            kind: "official_league_calendar",
            priority: 100,
            query: "site:slgr.gr Super League Greece fixtures 2026-05-22",
            requiredSignals: ["target_date_visible", "match_level_rows"],
            rejectSignals: ["homepage_only"]
          },
          {
            discoveryTargetId: "gre.1:discovery:02",
            kind: "independent_structured_fixture_page",
            priority: 70,
            query: "\"Super League Greece\" fixtures \"2026-05-22\" official schedule",
            requiredSignals: ["target_date_visible", "match_level_rows"],
            rejectSignals: ["betexplorer", "flashscore"]
          }
        ]
      }
    ]
  };

  const report = buildReviewSheet(input, {
    input: "self-test",
    maxTargetsPerCase: 0
  });

  if (report.summary.discoveryCaseCount !== 1) {
    throw new Error(`self-test failed: expected 1 case, got ${report.summary.discoveryCaseCount}`);
  }

  if (report.summary.reviewRowCount !== 2) {
    throw new Error(`self-test failed: expected 2 review rows, got ${report.summary.reviewRowCount}`);
  }

  const official = report.reviewRows.find((row) => row.kind === "official_league_calendar");
  if (!official || official.isOfficialOrPrimary !== true || official.isIndependentSecondSource !== false) {
    throw new Error("self-test failed: official row flags are wrong");
  }

  const independent = report.reviewRows.find((row) => row.kind === "independent_structured_fixture_page");
  if (!independent || independent.isIndependentSecondSource !== true) {
    throw new Error("self-test failed: independent row flags are wrong");
  }

  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false || report.guarantees.noFetch !== true) {
    throw new Error("self-test failed: safety guarantees missing");
  }

  return report;
}

async function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-fixture-league-date-source-discovery-review-sheet-file",
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  const input = readJson(args.input);
  const report = buildReviewSheet(input, {
    input: args.input,
    maxTargetsPerCase: args.maxTargetsPerCase
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    job: "build-fixture-league-date-source-discovery-review-sheet-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
});
