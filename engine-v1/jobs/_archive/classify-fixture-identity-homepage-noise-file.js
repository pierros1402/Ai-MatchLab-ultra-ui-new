#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv = process.argv) {
  const args = {
    input: "",
    output: "",
    leagueSlug: "",
    date: "",
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

    if (arg === "--league-slug" && argv[i + 1]) {
      args.leagueSlug = String(argv[++i] || "").trim();
      continue;
    }

    if (arg.startsWith("--league-slug=")) {
      args.leagueSlug = arg.slice("--league-slug=".length).trim();
      continue;
    }

    if ((arg === "--date" || arg === "--day") && argv[i + 1]) {
      args.date = String(argv[++i] || "").trim();
      continue;
    }

    if (arg.startsWith("--date=")) {
      args.date = arg.slice("--date=".length).trim();
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

function isHomepageLikeUrl(url) {
  const value = asText(url).toLowerCase();
  if (!value) return false;

  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname.replace(/\/+$/g, "");
    return pathname === "" || pathname === "/" || pathname.split("/").filter(Boolean).length <= 1;
  } catch {
    return /https?:\/\/[^/]+\/?$/.test(value);
  }
}

function hasFixtureDate(row, targetDate) {
  const localDate = asText(row.localDate);
  const target = asText(row.targetDate || row.date || row.dayKey);
  return localDate === targetDate || target === targetDate;
}

function hasKickoffSignal(row) {
  return Boolean(
    asText(row.rawKickoffText) ||
    asText(row.localTime) ||
    asText(row.kickoffUtc)
  );
}

function hasCleanTeams(row) {
  const home = asText(row.homeTeam);
  const away = asText(row.awayTeam);

  if (!home || !away) return false;

  const joined = `${home} ${away}`.toLowerCase();

  const noisyPatterns = [
    /\.active-link/,
    /\bclassement\b/,
    /\brang\b/,
    /\bequipe\b/,
    /\bnieuws\b/,
    /\bnews\b/,
    /\bvideo\b/,
    /\bsamenvatting\b/,
    /\bsummary\b/,
    /\bmore\b/,
    /\bmenu\b/,
    /\bcookie\b/,
    /\bprivacy\b/,
    /\bterms\b/,
    /\bstrona oficjalna\b/,
    /\bofficiel\b/,
    /\bquitte\b/,
    /\bengage\b/,
    /\bconserve\b/
  ];

  return !noisyPatterns.some((rx) => rx.test(joined));
}

function rowSourceUrl(row) {
  return asText(row.sourceUrl || row.url || row.finalUrl || row.resolvedUrl);
}

function rowSourceHost(row) {
  return asText(row.sourceHost || row.hostname || row.host);
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

function isExcludedSourceUrl(url) {
  const value = asText(url).toLowerCase();
  return /betexplorer\.com|flashscore\.|soccerway\.com|aiscore\.com|sofascore\.com/.test(value);
}

function leagueContextPatterns(leagueSlug) {
  const slug = asText(leagueSlug).toLowerCase();

  const bySlug = {
    "ned.1": [/eredivisie/i, /eredivisie\.nl/i, /knvb\.nl/i, /netherlands/i],
    "pol.1": [/ekstraklasa/i, /ekstraklasa\.org/i, /pzpn\.pl/i, /poland/i],
    "sui.1": [/swiss super league/i, /sfl\.ch/i, /football\.ch/i, /swissfootballleague/i, /switzerland/i],
    "srb.1": [/serbian superliga/i, /superliga/i, /superliga\.rs/i, /serbia/i],
    "bel.1": [/belgian pro league/i, /proleague\.be/i, /belgium/i],
    "esp.1": [/laliga/i, /liga/i, /spain/i]
  };

  return bySlug[slug] || [];
}

function matchesTargetLeagueContext(row, input, targetLeagueSlug) {
  const slug = asText(targetLeagueSlug || input.targetLeagueSlug || row.leagueSlug).toLowerCase();

  if (asText(row.leagueSlug).toLowerCase() === slug) {
    return true;
  }

  const patterns = leagueContextPatterns(slug);
  if (patterns.length === 0) {
    return true;
  }

  const text = JSON.stringify({
    leagueSlug: row.leagueSlug || "",
    name: row.name || "",
    sourceHost: row.sourceHost || "",
    sourceUrl: row.sourceUrl || row.url || row.finalUrl || row.resolvedUrl || "",
    sourceTitle: row.sourceTitle || ""
  });

  return patterns.some((rx) => rx.test(text));
}

function collectRows(input) {
  const directRows = [];

  if (Array.isArray(input.rows)) {
    directRows.push(...input.rows);
  }

  if (Array.isArray(input.likelyFixtureRows)) {
    directRows.push(...input.likelyFixtureRows);
  }

  if (Array.isArray(input.matchingFiles)) {
    for (const file of input.matchingFiles) {
      for (const row of file.rows || []) {
        directRows.push({
          ...row,
          sourceFile: file.file || ""
        });
      }
    }
  }

  return directRows;
}

function classifyRows(input, options = {}) {
  const targetDate = options.date || input.targetDate || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new Error("target date is required");
  }

  const targetLeagueSlug = options.leagueSlug || input.targetLeagueSlug || "";
  const rows = collectRows(input);

  const usableFixtureRows = [];
  const genericHomepageNoiseRows = [];
  const insufficientRows = [];

  for (const row of rows) {
    const sourceUrl = rowSourceUrl(row);
    const sourceHost = rowSourceHost(row);
    const homepageLike = isHomepageLikeUrl(sourceUrl);
    const fixtureDate = hasFixtureDate(row, targetDate);
    const kickoffSignal = hasKickoffSignal(row);
    const cleanTeams = hasCleanTeams(row);

    const classified = {
      sourceFile: row.sourceFile || "",
      leagueSlug: row.leagueSlug || targetLeagueSlug,
      name: row.name || input.targetLeagueName || "",
      sourceHost,
      sourceUrl,
      sourceTitle: row.sourceTitle || "",
      homeTeam: row.homeTeam || "",
      awayTeam: row.awayTeam || "",
      rawKickoffText: row.rawKickoffText || "",
      localDate: row.localDate || "",
      localTime: row.localTime || "",
      kickoffUtc: row.kickoffUtc || "",
      targetDate: row.targetDate || targetDate,
      classificationSignals: {
        homepageLike,
        fixtureDate,
        kickoffSignal,
        cleanTeams
      }
    };

    const excludedSource = isExcludedSourceUrl(sourceUrl);
    const targetLeagueContext = matchesTargetLeagueContext(row, input, targetLeagueSlug);

    classified.classificationSignals.excludedSource = excludedSource;
    classified.classificationSignals.targetLeagueContext = targetLeagueContext;

    if (fixtureDate && kickoffSignal && cleanTeams && !homepageLike && !excludedSource && targetLeagueContext) {
      usableFixtureRows.push({
        ...classified,
        classification: "usable_fixture_row_candidate"
      });
      continue;
    }

    if (excludedSource || !targetLeagueContext) {
      insufficientRows.push({
        ...classified,
        classification: excludedSource ? "excluded_source_not_usable" : "cross_league_context_not_usable"
      });
      continue;
    }

    if (homepageLike && (!kickoffSignal || !cleanTeams || !asText(row.localDate))) {
      genericHomepageNoiseRows.push({
        ...classified,
        classification: "generic_homepage_noise"
      });
      continue;
    }

    insufficientRows.push({
      ...classified,
      classification: "insufficient_fixture_identity_row"
    });
  }

  const needsDateSpecificSource = usableFixtureRows.length === 0 && genericHomepageNoiseRows.length > 0;

  return {
    ok: true,
    job: "classify-fixture-identity-homepage-noise-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_fixture_identity_homepage_noise_classifier",
    targetLeagueSlug,
    targetDate,
    sourceInput: options.input || "",
    summary: {
      inputRowCount: rows.length,
      usableFixtureRowCount: usableFixtureRows.length,
      genericHomepageNoiseRowCount: genericHomepageNoiseRows.length,
      insufficientRowCount: insufficientRows.length,
      needsDateSpecificSource,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    usableFixtureRows,
    genericHomepageNoiseRows,
    insufficientRows,
    conclusion: needsDateSpecificSource
      ? "needs_date_specific_source"
      : usableFixtureRows.length > 0
        ? "has_usable_fixture_row_candidates_needing_manual_review"
        : "no_usable_fixture_rows_found",
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
    targetLeagueSlug: "ned.1",
    targetLeagueName: "Eredivisie",
    targetDate: "2026-05-22",
    likelyFixtureRows: [
      {
        leagueSlug: "ned.1",
        sourceHost: "eredivisie.nl",
        sourceUrl: "https://eredivisie.nl/",
        homeTeam: "Samenvatting Ajax",
        awayTeam: "FC Utrecht",
        localDate: "",
        localTime: "",
        kickoffUtc: "",
        rawKickoffText: ""
      },
      {
        leagueSlug: "ned.1",
        sourceHost: "eredivisie.nl",
        sourceUrl: "https://eredivisie.nl/competitie/wedstrijden/2026-05-22",
        sourceTitle: "Eredivisie wedstrijden",
        homeTeam: "Ajax",
        awayTeam: "FC Utrecht",
        localDate: "2026-05-22",
        localTime: "19:30",
        kickoffUtc: "2026-05-22T17:30:00.000Z",
        rawKickoffText: "22.05.2026 19:30"
      }
    ]
  };

  const report = classifyRows(input, {
    leagueSlug: "ned.1",
    date: "2026-05-22",
    input: "self-test"
  });

  if (report.summary.inputRowCount !== 2) {
    throw new Error(`self-test failed: expected 2 rows, got ${report.summary.inputRowCount}`);
  }

  if (report.summary.genericHomepageNoiseRowCount !== 1) {
    throw new Error(`self-test failed: expected 1 homepage noise row, got ${report.summary.genericHomepageNoiseRowCount}`);
  }

  if (report.summary.usableFixtureRowCount !== 1) {
    throw new Error(`self-test failed: expected 1 usable row, got ${report.summary.usableFixtureRowCount}`);
  }

  const crossLeagueInput = {
    targetLeagueSlug: "sui.1",
    targetLeagueName: "Swiss Super League",
    targetDate: "2026-05-22",
    likelyFixtureRows: [
      {
        leagueSlug: "",
        sourceHost: "",
        sourceUrl: "https://www.flashscore.co.za/soccer/greece/super-league/fixtures/",
        homeTeam: "AEK Athens",
        awayTeam: "Olympiacos Piraeus",
        localDate: "2026-05-22",
        localTime: "16:30",
        kickoffUtc: "2026-05-22T16:30:00.000Z",
        rawKickoffText: "1779035400"
      }
    ]
  };

  const crossLeagueReport = classifyRows(crossLeagueInput, {
    leagueSlug: "sui.1",
    date: "2026-05-22",
    input: "self-test-cross-league"
  });

  if (crossLeagueReport.summary.usableFixtureRowCount !== 0) {
    throw new Error("self-test failed: cross-league Flashscore row should not be usable");
  }

  if (crossLeagueReport.summary.insufficientRowCount !== 1) {
    throw new Error("self-test failed: cross-league row should be insufficient");
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
      selfTest: "classify-fixture-identity-homepage-noise-file",
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error("--date YYYY-MM-DD is required");
  }

  const input = readJson(args.input);
  const report = classifyRows(input, {
    input: args.input,
    leagueSlug: args.leagueSlug,
    date: args.date
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    conclusion: report.conclusion,
    guarantees: report.guarantees
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    job: "classify-fixture-identity-homepage-noise-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
});
