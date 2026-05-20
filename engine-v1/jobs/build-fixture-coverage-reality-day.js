import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { LEAGUES_COVERAGE } from "../../workers/_shared/leagues-coverage.js";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";

function readJson(file, fallback = null) {
  try {
    if (!file || !fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    return { __readError: String(err?.message || err) };
  }
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    dayKey: null,
    output: null,
    marketInput: null,
    minTrust: 0,
    valueTier: 1,
    uiTier: 2,
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") {
      out.selfTest = true;
      continue;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
      out.dayKey = arg;
      continue;
    }

    if (arg === "--date" && argv[i + 1]) {
      out.dayKey = argv[++i];
      continue;
    }

    if (arg.startsWith("--date=")) {
      out.dayKey = arg.slice("--date=".length);
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      out.output = argv[++i];
      continue;
    }

    if (arg.startsWith("--output=")) {
      out.output = arg.slice("--output=".length);
      continue;
    }

    if (arg === "--market-input" && argv[i + 1]) {
      out.marketInput = argv[++i];
      continue;
    }

    if (arg.startsWith("--market-input=")) {
      out.marketInput = arg.slice("--market-input=".length);
      continue;
    }

    if (arg.startsWith("--min-trust=")) {
      out.minTrust = Number(arg.slice("--min-trust=".length));
      continue;
    }

    if (arg.startsWith("--value-tier=")) {
      out.valueTier = Number(arg.slice("--value-tier=".length));
      continue;
    }

    if (arg.startsWith("--ui-tier=")) {
      out.uiTier = Number(arg.slice("--ui-tier=".length));
      continue;
    }
  }

  out.minTrust = Number.isFinite(out.minTrust) ? out.minTrust : 0;
  out.valueTier = Number.isFinite(out.valueTier) ? out.valueTier : 1;
  out.uiTier = Number.isFinite(out.uiTier) ? out.uiTier : 2;

  return out;
}

function cleanCoverageRows(minTrust = 0) {
  return (Array.isArray(LEAGUES_COVERAGE) ? LEAGUES_COVERAGE : [])
    .filter(row => row && typeof row === "object" && row.slug)
    .map(row => ({
      ...row,
      slug: String(row.slug || "").trim(),
      trust: Number(row.trust || 0),
      tier: Number(row.tier || 0),
      type: String(row.type || "").trim(),
      region: String(row.region || "").trim(),
      country: String(row.country || "").trim()
    }))
    .filter(row => row.slug && row.trust >= minTrust)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

function classifyCoverageBucket(row, options = {}) {
  const type = String(row?.type || "").trim();
  const tier = Number(row?.tier || 0);
  const valueTier = Number(options?.valueTier || 1);
  const uiTier = Number(options?.uiTier || 2);

  if (type === "cup") return "cup_seasonal";
  if (type === "continental") return tier <= valueTier + 1 ? "must_have_for_value" : "must_have_for_ui";
  if (type === "league" && tier <= valueTier) return "must_have_for_value";
  if (type === "league" && tier <= uiTier) return "must_have_for_ui";
  return "optional";
}

function rowsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.fixtures)) return payload.fixtures;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.matches)) return payload.matches;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.events)) return payload.events;
  return [];
}

function canonicalLeagueFile(dayKey, slug) {
  return resolveDataPath("canonical-fixtures", dayKey, `${slug}.json`);
}

function readCanonicalLeague(dayKey, slug) {
  const file = canonicalLeagueFile(dayKey, slug);
  const payload = readJson(file, null);
  const fixtures = rowsFromPayload(payload);
  const readError = payload && payload.__readError ? payload.__readError : null;

  return {
    exists: fs.existsSync(file),
    file,
    readError,
    count: Array.isArray(fixtures) ? fixtures.length : 0,
    sourceMeta: payload?.sourceMeta || null,
    leagueName: payload?.leagueName || fixtures?.[0]?.leagueName || null,
    fixtures: Array.isArray(fixtures) ? fixtures : []
  };
}

function readAllCanonicalLeagues(dayKey) {
  const dir = resolveDataPath("canonical-fixtures", dayKey);
  const rows = [];
  if (!fs.existsSync(dir)) return rows;

  for (const fileName of fs.readdirSync(dir).filter(name => name.endsWith(".json")).sort()) {
    const slug = fileName.replace(/\.json$/u, "");
    const canonical = readCanonicalLeague(dayKey, slug);
    rows.push({ slug, ...canonical });
  }

  return rows;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function rowLeagueSlug(row) {
  return String(
    row?.leagueSlug ||
    row?.slug ||
    row?.league ||
    row?.competitionSlug ||
    row?.competition?.slug ||
    ""
  ).trim();
}

function rowHomeTeam(row) {
  return String(
    row?.homeTeam ||
    row?.home ||
    row?.homeName ||
    row?.teams?.homeTeam ||
    row?.teams?.home?.name ||
    row?.competitors?.home?.name ||
    ""
  ).trim();
}

function rowAwayTeam(row) {
  return String(
    row?.awayTeam ||
    row?.away ||
    row?.awayName ||
    row?.teams?.awayTeam ||
    row?.teams?.away?.name ||
    row?.competitors?.away?.name ||
    ""
  ).trim();
}

function rowKickoff(row) {
  return String(
    row?.kickoffUtc ||
    row?.kickoff ||
    row?.startTime ||
    row?.dateUtc ||
    row?.date ||
    row?.time ||
    ""
  ).trim();
}

function rowId(row) {
  return String(
    row?.matchId ||
    row?.id ||
    row?.fixtureId ||
    row?.eventId ||
    row?.sourceMatchId ||
    row?.sourceId ||
    ""
  ).trim();
}

function comparisonKey(row) {
  return [
    rowLeagueSlug(row),
    normalizeText(rowHomeTeam(row)),
    normalizeText(rowAwayTeam(row))
  ].join("::");
}

function normalizeMarketRows(payload) {
  const rawRows = rowsFromPayload(payload);
  return rawRows.map((row, index) => ({
    index,
    matchId: rowId(row) || null,
    leagueSlug: rowLeagueSlug(row),
    leagueName: String(row?.leagueName || row?.competitionName || row?.leagueTitle || "").trim() || null,
    homeTeam: rowHomeTeam(row),
    awayTeam: rowAwayTeam(row),
    kickoffUtc: rowKickoff(row) || null,
    source: String(row?.source || row?.provider || "market_input").trim(),
    raw: row
  })).filter(row => row.leagueSlug || row.homeTeam || row.awayTeam);
}

function buildMarketInputTemplate(dayKey, coverageRows, outputPath) {
  const file = resolveDataPath("fixture-market-crosscheck", `${dayKey}.market-fixtures.input.template.json`);
  const template = {
    ok: true,
    schema: "ai-matchlab.fixture-market-crosscheck-input.v1",
    dayKey,
    purpose: "Manual/exported fixture board input for external coverage cross-check. Do not treat this as score truth.",
    instructions: [
      "Fill fixtures with bookmaker/market/reference-board schedule rows for leagues in scope.",
      "Use leagueSlug from declaredLeagueSlugs where possible.",
      "Keep source/provider/url if available for later audit."
    ],
    declaredLeagueSlugs: coverageRows.map(row => row.slug),
    fixtures: [
      {
        leagueSlug: "eng.1",
        leagueName: "Premier League",
        homeTeam: "Example Home",
        awayTeam: "Example Away",
        kickoffUtc: `${dayKey}T19:00:00Z`,
        source: "manual_market_board",
        url: ""
      }
    ],
    outputPath
  };

  writeJson(file, template);
  return file;
}

function buildFixtureCoverageRealityDay(dayKey, options = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dayKey || ""))) {
    throw new Error("Expected --date YYYY-MM-DD or positional YYYY-MM-DD");
  }

  const minTrust = Number.isFinite(Number(options.minTrust)) ? Number(options.minTrust) : 0;
  const valueTier = Number.isFinite(Number(options.valueTier)) ? Number(options.valueTier) : 1;
  const uiTier = Number.isFinite(Number(options.uiTier)) ? Number(options.uiTier) : 2;

  const output = options.output || resolveDataPath(
    "football-truth",
    "_diagnostics",
    "fixture-coverage-reality",
    `${dayKey}.fixture-coverage-reality.json`
  );

  const defaultMarketInput = resolveDataPath("fixture-market-crosscheck", `${dayKey}.market-fixtures.input.json`);
  const marketInput = options.marketInput || defaultMarketInput;

  const coverageRows = cleanCoverageRows(minTrust);
  const coverageBySlug = new Map(coverageRows.map(row => [row.slug, row]));
  const canonicalRows = readAllCanonicalLeagues(dayKey);
  const canonicalBySlug = new Map(canonicalRows.map(row => [row.slug, row]));

  const declaredLeagueRows = coverageRows.map(row => {
    const canonical = canonicalBySlug.get(row.slug) || readCanonicalLeague(dayKey, row.slug);
    const bucket = classifyCoverageBucket(row, { valueTier, uiTier });
    const provider = String(canonical?.sourceMeta?.acquisitionProvider || canonical?.sourceMeta?.provider || "").trim() || null;
    const sourceCount = Number(canonical?.sourceMeta?.sourceCount || canonical?.sourceMeta?.accepted || 0) || null;
    const canonicalFound = Boolean(canonical?.exists && canonical?.count > 0);

    let risk = "no_active_match_evidence";
    if (canonicalFound) risk = "canonical_fixtures_present";

    return {
      leagueSlug: row.slug,
      leagueName: canonical?.leagueName || row.name || null,
      type: row.type,
      tier: row.tier,
      trust: row.trust,
      region: row.region,
      country: row.country,
      bucket,
      canonicalFileExists: Boolean(canonical?.exists),
      canonicalFixtureRows: Number(canonical?.count || 0),
      canonicalProvider: provider,
      canonicalSourceCount: sourceCount,
      canonicalReadError: canonical?.readError || null,
      risk
    };
  });

  const canonicalOnlyRows = canonicalRows
    .filter(row => !coverageBySlug.has(row.slug))
    .map(row => ({
      leagueSlug: row.slug,
      leagueName: row.leagueName,
      canonicalFixtureRows: row.count,
      canonicalProvider: row.sourceMeta?.acquisitionProvider || row.sourceMeta?.provider || null,
      risk: "canonical_league_not_in_declared_coverage_contract"
    }));

  const marketPayload = readJson(marketInput, null);
  const marketInputExists = Boolean(marketInput && fs.existsSync(marketInput));
  const marketReadError = marketPayload && marketPayload.__readError ? marketPayload.__readError : null;
  const marketRows = marketInputExists && !marketReadError ? normalizeMarketRows(marketPayload) : [];

  const canonicalFixtureRowsFlat = [];
  for (const row of canonicalRows) {
    for (const fixture of row.fixtures || []) {
      canonicalFixtureRowsFlat.push({
        leagueSlug: row.slug,
        matchId: rowId(fixture) || null,
        homeTeam: rowHomeTeam(fixture),
        awayTeam: rowAwayTeam(fixture),
        kickoffUtc: rowKickoff(fixture) || null,
        source: fixture?.source || row.sourceMeta?.acquisitionProvider || null,
        raw: fixture
      });
    }
  }

  const canonicalKeys = new Map();
  for (const row of canonicalFixtureRowsFlat) {
    const key = comparisonKey(row);
    if (!canonicalKeys.has(key)) canonicalKeys.set(key, []);
    canonicalKeys.get(key).push(row);
  }

  const marketKeys = new Map();
  for (const row of marketRows) {
    const key = comparisonKey(row);
    if (!marketKeys.has(key)) marketKeys.set(key, []);
    marketKeys.get(key).push(row);
  }

  const matchedExact = [];
  const missingInCanonicalFromMarket = [];
  for (const marketRow of marketRows) {
    const key = comparisonKey(marketRow);
    const matches = canonicalKeys.get(key) || [];
    if (matches.length) {
      matchedExact.push({
        market: {
          index: marketRow.index,
          leagueSlug: marketRow.leagueSlug,
          homeTeam: marketRow.homeTeam,
          awayTeam: marketRow.awayTeam,
          kickoffUtc: marketRow.kickoffUtc,
          source: marketRow.source
        },
        canonical: matches.map(row => ({
          matchId: row.matchId,
          leagueSlug: row.leagueSlug,
          homeTeam: row.homeTeam,
          awayTeam: row.awayTeam,
          kickoffUtc: row.kickoffUtc,
          source: row.source
        }))
      });
    } else {
      missingInCanonicalFromMarket.push({
        index: marketRow.index,
        leagueSlug: marketRow.leagueSlug,
        leagueName: marketRow.leagueName,
        homeTeam: marketRow.homeTeam,
        awayTeam: marketRow.awayTeam,
        kickoffUtc: marketRow.kickoffUtc,
        source: marketRow.source,
        risk: coverageBySlug.has(marketRow.leagueSlug)
          ? "market_fixture_missing_from_canonical"
          : "market_fixture_league_not_in_declared_contract_or_mapping_needed"
      });
    }
  }

  const presentInCanonicalOnly = [];
  if (marketRows.length) {
    for (const canonicalRow of canonicalFixtureRowsFlat) {
      const key = comparisonKey(canonicalRow);
      if (!marketKeys.has(key)) {
        presentInCanonicalOnly.push({
          matchId: canonicalRow.matchId,
          leagueSlug: canonicalRow.leagueSlug,
          homeTeam: canonicalRow.homeTeam,
          awayTeam: canonicalRow.awayTeam,
          kickoffUtc: canonicalRow.kickoffUtc,
          source: canonicalRow.source,
          risk: "canonical_fixture_not_seen_in_market_input"
        });
      }
    }
  }

  const leaguesWithCanonicalFixtures = declaredLeagueRows.filter(row => row.canonicalFixtureRows > 0);
  const leaguesWithNoCanonicalFixtures = declaredLeagueRows.filter(row => row.canonicalFixtureRows === 0);
  const mustHaveDeclaredWithoutCanonical = leaguesWithNoCanonicalFixtures.filter(row =>
    row.bucket === "must_have_for_value" || row.bucket === "must_have_for_ui"
  );

  const marketLeagueSlugs = Array.from(new Set(marketRows.map(row => row.leagueSlug).filter(Boolean))).sort();
  const canonicalLeagueSlugs = canonicalRows.filter(row => row.count > 0).map(row => row.slug).sort();

  const marketLeaguesMissingInCanonical = marketLeagueSlugs
    .filter(slug => !canonicalLeagueSlugs.includes(slug))
    .map(slug => ({
      leagueSlug: slug,
      declaredInCoverageContract: coverageBySlug.has(slug),
      marketFixtureRows: marketRows.filter(row => row.leagueSlug === slug).length,
      risk: coverageBySlug.has(slug)
        ? "declared_market_league_has_no_canonical_fixtures"
        : "market_league_mapping_or_contract_gap"
    }));

  const templatePath = marketInputExists
    ? null
    : buildMarketInputTemplate(dayKey, coverageRows, output);

  const report = {
    ok: true,
    schema: "ai-matchlab.fixture-coverage-reality-day.v1",
    stage: marketInputExists
      ? "fixture_coverage_reality_with_market_crosscheck"
      : "fixture_coverage_reality_without_market_input",
    dayKey,
    generatedAt: new Date().toISOString(),
    inputs: {
      coverageContract: "workers/_shared/leagues-coverage.js",
      canonicalFixturesDir: path.relative(process.cwd(), resolveDataPath("canonical-fixtures", dayKey)).replace(/\\/g, "/"),
      marketInput: path.relative(process.cwd(), marketInput).replace(/\\/g, "/"),
      marketInputExists,
      marketReadError,
      templatePath: templatePath ? path.relative(process.cwd(), templatePath).replace(/\\/g, "/") : null
    },
    options: {
      minTrust,
      valueTier,
      uiTier
    },
    summary: {
      declaredLeagueCount: declaredLeagueRows.length,
      canonicalLeagueCount: canonicalRows.filter(row => row.count > 0).length,
      canonicalFixtureRows: canonicalFixtureRowsFlat.length,
      canonicalOnlyLeagueCount: canonicalOnlyRows.length,
      leaguesWithCanonicalFixtures: leaguesWithCanonicalFixtures.length,
      leaguesWithNoCanonicalFixtures: leaguesWithNoCanonicalFixtures.length,
      mustHaveDeclaredWithoutCanonical: mustHaveDeclaredWithoutCanonical.length,
      marketFixtureRows: marketRows.length,
      matchedExact: matchedExact.length,
      missingInCanonicalFromMarket: missingInCanonicalFromMarket.length,
      presentInCanonicalOnly: presentInCanonicalOnly.length,
      marketLeaguesMissingInCanonical: marketLeaguesMissingInCanonical.length
    },
    guarantees: {
      canonicalWrites: 0,
      productionWrite: false,
      sourceFetch: false,
      fixtureWrites: false,
      valueWrites: false,
      detailsWrites: false,
      finalResultWrites: false,
      marketInputIsReferenceOnly: true,
      scoresAreNotTrustedFromMarketInput: true
    },
    declaredLeagueRows,
    canonicalOnlyRows,
    marketLeaguesMissingInCanonical,
    missingInCanonicalFromMarket,
    presentInCanonicalOnly,
    matchedExact,
    notes: [
      marketInputExists
        ? "Market/reference-board rows were used only for coverage cross-check, not as score truth."
        : "No market/reference-board input was found, so this report proves canonical coverage shape only; it cannot prove which declared leagues actually had matches today.",
      "Use this report before details/value work when fixture universe completeness is uncertain."
    ]
  };

  writeJson(output, report);
  return report;
}

function selfTest() {
  const rows = cleanCoverageRows(0);
  const sample = rows.slice(0, 3).map(row => ({ slug: row.slug, bucket: classifyCoverageBucket(row, { valueTier: 1, uiTier: 2 }) }));
  const ok = rows.length > 0 && sample.every(row => row.slug && row.bucket);
  return {
    ok,
    selfTest: "build-fixture-coverage-reality-day",
    stage: ok ? "fixture_coverage_reality_shape_ok" : "fixture_coverage_reality_shape_failed",
    declaredLeagueCount: rows.length,
    sample,
    canonicalWrites: 0,
    productionWrite: false,
    sourceFetch: false
  };
}

async function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const result = selfTest();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  const report = buildFixtureCoverageRealityDay(args.dayKey, args);
  console.log(JSON.stringify({
    ok: report.ok,
    stage: report.stage,
    output: path.relative(process.cwd(), args.output || resolveDataPath("football-truth", "_diagnostics", "fixture-coverage-reality", `${args.dayKey}.fixture-coverage-reality.json`)).replace(/\\/g, "/"),
    dayKey: report.dayKey,
    summary: report.summary,
    canonicalWrites: report.guarantees.canonicalWrites,
    productionWrite: report.guarantees.productionWrite,
    sourceFetch: report.guarantees.sourceFetch
  }, null, 2));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch(err => {
    console.error(err?.stack || err?.message || err);
    process.exit(1);
  });
}

export {
  buildFixtureCoverageRealityDay,
  cleanCoverageRows,
  normalizeMarketRows,
  comparisonKey
};