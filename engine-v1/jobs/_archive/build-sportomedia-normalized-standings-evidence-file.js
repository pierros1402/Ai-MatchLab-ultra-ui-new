import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    output: "",
    selfTest: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--input") {
      args.input = argv[++index] || "";
      continue;
    }

    if (arg.startsWith("--input=")) {
      args.input = arg.slice("--input=".length);
      continue;
    }

    if (arg === "--output") {
      args.output = argv[++index] || "";
      continue;
    }

    if (arg.startsWith("--output=")) {
      args.output = arg.slice("--output=".length);
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  if (!args.selfTest && !args.input) throw new Error("Missing required --input");
  if (!args.selfTest && !args.output) throw new Error("Missing required --output");

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function asNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function goalDiffFromStats(stats) {
  const explicit = asNumber(stats?.d, null);
  if (Number.isFinite(explicit)) return explicit;

  const gf = asNumber(stats?.gf, null);
  const ga = asNumber(stats?.ga, null);
  if (Number.isFinite(gf) && Number.isFinite(ga)) return gf - ga;

  return null;
}

function toEvidenceRow(row, index) {
  const stats = row.stats && typeof row.stats === "object" ? row.stats : {};
  const leagueSlug = asText(row.competitionSlug);
  const rank = asNumber(row.position, index + 1);
  const teamName = asText(row.teamName);

  return {
    snapshotId: `${leagueSlug}::sportomedia-standings::${asText(row.teamId) || String(index + 1).padStart(3, "0")}`,
    missingLeagueSlug: leagueSlug,
    leagueSlug,
    competitionSlug: leagueSlug,
    hostname: "sportomedia",
    sourceHost: "sportomedia",
    sourceUrl: "official_sportomedia_graphql_StandingsForLeague_cached_diagnostic",
    rank,
    position: rank,
    teamId: asText(row.teamId),
    teamName,
    team: teamName,
    name: teamName,
    played: asNumber(stats.gp, null),
    wins: asNumber(stats.w, null),
    draws: asNumber(stats.t, null),
    losses: asNumber(stats.l, null),
    goalsFor: asNumber(stats.gf, null),
    goalsAgainst: asNumber(stats.ga, null),
    goalDiff: goalDiffFromStats(stats),
    points: asNumber(stats.pts, null),
    confidence: 99,
    confidenceReasons: [
      "official_sportomedia_graphql_standings_row",
      "rank_team_played_points_present",
      "source_normalized_from_existing_diagnostic"
    ],
    validationState: "validated_standings_evidence_row",
    validationReasons: [
      "official_graphql_standings_source",
      "primary_segment_row_shape_valid",
      "no_fetch_no_search_adapter"
    ],
    rowIndex: index + 1,
    sourceProvider: asText(row.sourceProvider || "sportomedia"),
    sourceKind: asText(row.sourceKind || "official_graphql_StandingsForLeague"),
    sourceFamily: asText(row.sourceFamily || "sportomedia_graphql_widget"),
    canonicalWrites: 0,
    productionWrite: false,
    standingsWriteAllowedNow: false
  };
}

function validEvidenceRow(row) {
  return Boolean(
    row.missingLeagueSlug &&
    row.teamName &&
    Number.isFinite(row.rank) &&
    row.rank >= 1 &&
    Number.isFinite(row.played) &&
    row.played >= 1 &&
    Number.isFinite(row.points) &&
    row.points >= 0
  );
}

function buildReport(input) {
  const sourceRows = Array.isArray(input.normalizedStandingsRows) ? input.normalizedStandingsRows : [];
  const evidenceRows = sourceRows
    .filter((row) => ["swe.1", "swe.2"].includes(asText(row.competitionSlug)))
    .map(toEvidenceRow)
    .filter(validEvidenceRow);

  const byLeague = {};
  const byLeagueTeamCount = {};
  for (const row of evidenceRows) {
    byLeague[row.leagueSlug] = (byLeague[row.leagueSlug] || 0) + 1;
    byLeagueTeamCount[row.leagueSlug] ||= new Set();
    byLeagueTeamCount[row.leagueSlug].add(row.teamName.toLowerCase());
  }

  const byLeagueUniqueTeamCount = Object.fromEntries(
    Object.entries(byLeagueTeamCount).map(([leagueSlug, set]) => [leagueSlug, set.size])
  );

  return {
    ok: true,
    job: "build-sportomedia-normalized-standings-evidence-file",
    mode: "read_only_sportomedia_normalized_standings_to_validated_evidence",
    generatedAt: new Date().toISOString(),
    summary: {
      sourceStandingRows: sourceRows.length,
      validatedStandingsEvidenceRowCount: evidenceRows.length,
      byLeague,
      byLeagueUniqueTeamCount,
      canonicalWrites: 0,
      productionWrite: false,
      noFetch: true,
      noSearch: true,
      standingsWriteAllowedNow: false
    },
    validatedStandingsEvidenceRows: evidenceRows,
    guarantees: {
      noFetch: true,
      noSearch: true,
      sourceFetch: false,
      usesOnlyExistingNormalizedDiagnostic: true,
      noStandingsWrites: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true
    }
  };
}

function selfTest() {
  const report = buildReport({
    normalizedStandingsRows: [
      {
        competitionSlug: "swe.1",
        position: 1,
        teamName: "IK Sirius",
        teamId: "108445",
        stats: { gp: "10", w: "9", t: "1", l: "0", gf: "27", ga: "10", d: "17", pts: "28" },
        sourceProvider: "sportomedia",
        sourceKind: "official_graphql_StandingsForLeague"
      },
      {
        competitionSlug: "swe.2",
        position: 1,
        teamName: "Varbergs BoIS",
        teamId: "26111",
        stats: { gp: "10", w: "6", t: "3", l: "1", gf: "22", ga: "11", d: "11", pts: "21" },
        sourceProvider: "sportomedia",
        sourceKind: "official_graphql_StandingsForLeague"
      }
    ]
  });

  if (report.summary.validatedStandingsEvidenceRowCount !== 2) throw new Error("expected two validated standings rows");
  if (report.summary.byLeague["swe.1"] !== 1) throw new Error("expected swe.1 row");
  if (report.summary.byLeague["swe.2"] !== 1) throw new Error("expected swe.2 row");
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("read-only guarantees failed");
  }

  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: report.ok,
      validatedStandingsEvidenceRowCount: report.summary.validatedStandingsEvidenceRowCount,
      byLeague: report.summary.byLeague,
      canonicalWrites: report.guarantees.canonicalWrites,
      productionWrite: report.guarantees.productionWrite
    }, null, 2));
    return;
  }

  const input = readJson(path.resolve(repoRoot, args.input));
  const report = buildReport(input);

  if (report.summary.validatedStandingsEvidenceRowCount !== 32) {
    throw new Error(`expected 32 Sportomedia standings evidence rows, got ${report.summary.validatedStandingsEvidenceRowCount}`);
  }

  if (report.summary.byLeague["swe.1"] !== 16 || report.summary.byLeague["swe.2"] !== 16) {
    throw new Error(`unexpected byLeague counts: ${JSON.stringify(report.summary.byLeague)}`);
  }

  if (report.guarantees.noFetch !== true ||
      report.guarantees.noSearch !== true ||
      report.guarantees.noStandingsWrites !== true ||
      report.guarantees.canonicalWrites !== 0 ||
      report.guarantees.productionWrite !== false) {
    throw new Error("read-only guarantees failed");
  }

  writeJson(path.resolve(repoRoot, args.output), report);
  console.log(JSON.stringify(report.summary, null, 2));
}

if (path.resolve(process.argv[1] || "") === __filename) {
  main();
}
