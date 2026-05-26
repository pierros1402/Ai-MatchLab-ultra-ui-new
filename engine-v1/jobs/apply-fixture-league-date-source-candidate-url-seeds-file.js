#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv = process.argv) {
  const args = {
    input: "",
    seeds: "",
    output: "",
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

    if (arg === "--seeds" && argv[i + 1]) {
      args.seeds = String(argv[++i] || "").trim();
      continue;
    }

    if (arg.startsWith("--seeds=")) {
      args.seeds = arg.slice("--seeds=".length).trim();
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
  }

  return args;
}

function readJson(filePath, label) {
  if (!filePath) throw new Error(`missing --${label}`);
  if (!fs.existsSync(filePath)) throw new Error(`missing ${label} file: ${filePath}`);
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

function asBool(value) {
  return value === true;
}

function normalizeSeeds(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input.candidateSeeds)) return input.candidateSeeds;
  if (Array.isArray(input.seeds)) return input.seeds;
  if (Array.isArray(input.rows)) return input.rows;
  return [];
}

function hostFromUrl(url) {
  const value = asText(url);
  if (!value) return "";

  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isExcludedHost(url) {
  const value = `${asText(url)} ${hostFromUrl(url)}`.toLowerCase();
  return /(^|\.)betexplorer\.com|flashscore\.|(^|\.)soccerway\.com|(^|\.)aiscore\.com|(^|\.)sofascore\.com/.test(value);
}

function seedKey(seed) {
  return [
    asText(seed.reviewRowId),
    asText(seed.discoveryTargetId),
    asText(seed.leagueSlug),
    asText(seed.kind)
  ].join("::").toLowerCase();
}

function rowMatchesSeed(row, seed) {
  const seedReviewRowId = asText(seed.reviewRowId);
  if (seedReviewRowId && asText(row.reviewRowId) === seedReviewRowId) return true;

  const seedTargetId = asText(seed.discoveryTargetId);
  if (seedTargetId && asText(row.discoveryTargetId) === seedTargetId) return true;

  const seedLeague = asText(seed.leagueSlug);
  const seedKind = asText(seed.kind);

  if (seedLeague && seedKind) {
    return asText(row.leagueSlug) === seedLeague && asText(row.kind) === seedKind;
  }

  return false;
}

function normalizeDecisionFromSeed(seed, row, candidateUrl) {
  const explicitDecision = asText(seed.reviewerDecision);
  if (explicitDecision) return explicitDecision;

  if (!candidateUrl) return "pending_review";

  if (asBool(seed.explicitNoFixtureEvidence)) return "explicit_no_fixture_evidence";

  if (asBool(row.isIndependentSecondSource)) return "candidate_independent_url_pending_fetch";
  if (asBool(row.isClubFallback)) return "candidate_club_url_pending_fetch";
  return "candidate_official_url_pending_fetch";
}

function applySeedToRow(row, seed) {
  const candidateUrl = asText(seed.candidateUrl || seed.url);
  const candidateTitle = asText(seed.candidateTitle || seed.title);
  const candidateKind = asText(seed.candidateKind || seed.kind || row.kind);
  const sourceHost = hostFromUrl(candidateUrl);

  const filled = {
    ...row,
    candidateUrl,
    candidateKind,
    candidateTitle,
    opened: seed.opened === true ? true : false,
    httpStatus: seed.httpStatus ?? null,

    sourceUsable: seed.sourceUsable === true ? true : false,
    targetDateVisible: seed.targetDateVisible === true ? true : false,
    matchRowsVisible: seed.matchRowsVisible === true ? true : false,
    explicitNoFixtureEvidence: seed.explicitNoFixtureEvidence === true ? true : null,

    wrongCompetition: seed.wrongCompetition === true ? true : false,
    wrongDate: seed.wrongDate === true ? true : false,
    homepageOnly: seed.homepageOnly === true ? true : false,
    newsOnly: seed.newsOnly === true ? true : false,
    videoOnly: seed.videoOnly === true ? true : false,
    standingsOnly: seed.standingsOnly === true ? true : false,
    excludedHost: seed.excludedHost === true || isExcludedHost(candidateUrl),

    fixtureRowsForTargetDate: Array.isArray(seed.fixtureRowsForTargetDate)
      ? seed.fixtureRowsForTargetDate
      : Array.isArray(row.fixtureRowsForTargetDate)
        ? row.fixtureRowsForTargetDate
        : [],

    evidenceTextSnippet: asText(seed.evidenceTextSnippet),
    reviewerDecision: normalizeDecisionFromSeed(seed, row, candidateUrl),
    reviewerNotes: asText(seed.reviewerNotes || seed.notes),
    seedMeta: {
      applied: true,
      source: asText(seed.source || "candidate_url_seed"),
      seedKey: seedKey(seed),
      sourceHost,
      appliedAt: new Date().toISOString()
    },

    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };

  return filled;
}

function applySeeds(sheet, seedInput, options = {}) {
  const reviewRows = Array.isArray(sheet.reviewRows) ? sheet.reviewRows : [];
  const seeds = normalizeSeeds(seedInput);

  const usedSeedIndexes = new Set();
  const appliedRows = [];
  const unchangedRows = [];
  const ambiguousSeeds = [];

  const updatedReviewRows = reviewRows.map((row) => {
    const matchingSeeds = seeds
      .map((seed, index) => ({ seed, index }))
      .filter(({ seed }) => rowMatchesSeed(row, seed));

    if (matchingSeeds.length === 0) {
      unchangedRows.push({
        reviewRowId: row.reviewRowId || "",
        leagueSlug: row.leagueSlug || "",
        discoveryTargetId: row.discoveryTargetId || "",
        kind: row.kind || ""
      });
      return row;
    }

    if (matchingSeeds.length > 1) {
      ambiguousSeeds.push({
        reviewRowId: row.reviewRowId || "",
        leagueSlug: row.leagueSlug || "",
        discoveryTargetId: row.discoveryTargetId || "",
        matchingSeedCount: matchingSeeds.length
      });
      return row;
    }

    const { seed, index } = matchingSeeds[0];
    usedSeedIndexes.add(index);

    const filled = applySeedToRow(row, seed);

    appliedRows.push({
      reviewRowId: filled.reviewRowId || "",
      leagueSlug: filled.leagueSlug || "",
      name: filled.name || "",
      targetDate: filled.targetDate || "",
      discoveryTargetId: filled.discoveryTargetId || "",
      kind: filled.kind || "",
      candidateUrl: filled.candidateUrl || "",
      candidateTitle: filled.candidateTitle || "",
      reviewerDecision: filled.reviewerDecision || "",
      excludedHost: filled.excludedHost,
      canonicalWrites: 0,
      productionWrite: false
    });

    return filled;
  });

  const unusedSeeds = seeds
    .map((seed, index) => ({ seed, index }))
    .filter(({ index }) => !usedSeedIndexes.has(index))
    .map(({ seed }) => ({
      reviewRowId: seed.reviewRowId || "",
      leagueSlug: seed.leagueSlug || "",
      discoveryTargetId: seed.discoveryTargetId || "",
      kind: seed.kind || "",
      candidateUrl: seed.candidateUrl || seed.url || ""
    }));

  return {
    ...sheet,
    ok: true,
    job: "apply-fixture-league-date-source-candidate-url-seeds-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_fixture_league_date_candidate_url_seed_application",
    sourceInput: options.input || "",
    seedInput: options.seeds || "",
    summary: {
      inputReviewRowCount: reviewRows.length,
      seedCount: seeds.length,
      appliedSeedCount: appliedRows.length,
      unchangedRowCount: unchangedRows.length,
      ambiguousSeedCount: ambiguousSeeds.length,
      unusedSeedCount: unusedSeeds.length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    appliedRows,
    ambiguousSeeds,
    unusedSeeds,
    reviewRows: updatedReviewRows,
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
  const sheet = {
    reviewRows: [
      {
        reviewRowId: "gre.1:2026-05-22:source-discovery:target:01",
        leagueSlug: "gre.1",
        name: "Super League Greece",
        targetDate: "2026-05-22",
        discoveryTargetId: "gre.1:discovery:01",
        kind: "official_league_calendar",
        isOfficialOrPrimary: true,
        reviewerDecision: "pending_review"
      },
      {
        reviewRowId: "sco.1:2026-05-22:source-discovery:target:01",
        leagueSlug: "sco.1",
        name: "Scottish Premiership",
        targetDate: "2026-05-22",
        discoveryTargetId: "sco.1:discovery:01",
        kind: "official_league_calendar",
        isOfficialOrPrimary: true,
        reviewerDecision: "pending_review"
      }
    ]
  };

  const seeds = {
    candidateSeeds: [
      {
        reviewRowId: "gre.1:2026-05-22:source-discovery:target:01",
        candidateUrl: "https://www.slgr.gr/en/schedule/",
        candidateTitle: "Schedule - Super League Greece",
        source: "self-test"
      }
    ]
  };

  const report = applySeeds(sheet, seeds, {
    input: "self-test-sheet",
    seeds: "self-test-seeds"
  });

  if (report.summary.inputReviewRowCount !== 2) {
    throw new Error(`self-test failed: expected 2 rows, got ${report.summary.inputReviewRowCount}`);
  }

  if (report.summary.appliedSeedCount !== 1) {
    throw new Error(`self-test failed: expected 1 applied seed, got ${report.summary.appliedSeedCount}`);
  }

  if (report.summary.unchangedRowCount !== 1) {
    throw new Error(`self-test failed: expected 1 unchanged row, got ${report.summary.unchangedRowCount}`);
  }

  const filled = report.reviewRows.find((row) => row.leagueSlug === "gre.1");
  if (!filled || filled.candidateUrl !== "https://www.slgr.gr/en/schedule/") {
    throw new Error("self-test failed: candidate URL not applied");
  }

  if (filled.reviewerDecision !== "candidate_official_url_pending_fetch") {
    throw new Error(`self-test failed: unexpected reviewerDecision ${filled.reviewerDecision}`);
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
      selfTest: "apply-fixture-league-date-source-candidate-url-seeds-file",
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  const sheet = readJson(args.input, "input");
  const seeds = readJson(args.seeds, "seeds");
  const report = applySeeds(sheet, seeds, {
    input: args.input,
    seeds: args.seeds
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
    job: "apply-fixture-league-date-source-candidate-url-seeds-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
});
