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

function isoDate(value) {
  const text = asText(value);
  if (!text) return "";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function normalizeStatus(row) {
  const status = asText(row.normalizedStatus || row.statusRaw || row.extendedStatusRaw).toLowerCase();

  if (status === "finished" || status === "ft" || status === "final" || status === "played") return "FINISHED";
  if (status === "scheduled" || status === "fixture" || status === "planned" || status === "pre") return "SCHEDULED";

  const raw = asText(row.statusRaw || row.extendedStatusRaw).toUpperCase();
  if (raw === "FINISHED" || raw === "FT") return "FINISHED";
  if (raw === "SCHEDULED" || raw === "PRE" || raw === "UPCOMING") return "SCHEDULED";

  return raw || "UNKNOWN";
}

function scoreValue(value, status) {
  if (status !== "FINISHED") return null;
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toEvidenceRow(row, index) {
  const leagueSlug = asText(row.competitionSlug);
  const matchId = asText(row.matchId || row.fogisId || row.everySportId);
  const kickoffUtc = asText(row.startDateIso || row.startDateRaw);
  const status = normalizeStatus(row);
  const kickoffDate = isoDate(kickoffUtc);

  return {
    evidenceRowId: `${leagueSlug}::sportomedia::${matchId || String(index + 1).padStart(4, "0")}`,
    acceptedForEvidence: true,
    sourceType: "sportomedia_official_graphql_widget",
    apiFamily: "sportomedia_graphql",
    apiCandidateId: asText(row.sourceKind),
    leagueSlug,
    competitionSlug: leagueSlug,
    competitionName: asText(row.leagueName || row.configLeagueName),
    matchId,
    status,
    kickoffDate,
    kickoffUtc,
    homeTeam: asText(row.homeTeamName),
    awayTeam: asText(row.awayTeamName),
    scoreHome: scoreValue(row.homeTeamScore, status),
    scoreAway: scoreValue(row.awayTeamScore, status),
    roundName: asText(row.round),
    stadiumName: asText(row.arenaName),
    outcomeStatus: status === "FINISHED" ? "FT" : "PRE",
    decidedBy: "",
    regularScore: null,
    halfTimeScore: null,
    extraTimeScore: null,
    aggregateScore: null,
    penaltyScore: null,
    sourceProvider: "sportomedia",
    sourceKind: asText(row.sourceKind),
    sourceFamily: asText(row.sourceFamily),
    sourceMatchId: matchId,
    rawStatus: asText(row.statusRaw),
    canonicalWrites: 0,
    productionWrite: false
  };
}

function buildReport(input) {
  const sourceRows = Array.isArray(input.normalizedFixtureRows) ? input.normalizedFixtureRows : [];
  const evidenceRows = sourceRows
    .filter((row) => ["swe.1", "swe.2"].includes(asText(row.competitionSlug)))
    .map(toEvidenceRow)
    .filter((row) =>
      row.leagueSlug &&
      row.kickoffDate &&
      row.kickoffUtc &&
      row.homeTeam &&
      row.awayTeam &&
      row.status !== "UNKNOWN"
    );

  const byLeague = {};
  const byStatus = {};
  for (const row of evidenceRows) {
    byLeague[row.leagueSlug] = (byLeague[row.leagueSlug] || 0) + 1;
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
  }

  return {
    ok: true,
    job: "build-sportomedia-normalized-fixture-evidence-file",
    mode: "read_only_sportomedia_normalized_rows_to_fixture_evidence",
    generatedAt: new Date().toISOString(),
    summary: {
      sourceFixtureRows: sourceRows.length,
      evidenceRowCount: evidenceRows.length,
      acceptedForEvidenceCount: evidenceRows.filter((row) => row.acceptedForEvidence === true).length,
      byLeague,
      byStatus,
      canonicalWrites: 0,
      productionWrite: false,
      noFetch: true,
      noSearch: true
    },
    rows: evidenceRows,
    guarantees: {
      noFetch: true,
      noSearch: true,
      sourceFetch: false,
      usesOnlyExistingNormalizedDiagnostic: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true
    }
  };
}

function selfTest() {
  const report = buildReport({
    normalizedFixtureRows: [
      {
        competitionSlug: "swe.1",
        matchId: "m1",
        startDateIso: "2026-04-04T13:00:00.000Z",
        homeTeamName: "Hammarby",
        awayTeamName: "Mjällby AIF",
        homeTeamScore: 3,
        awayTeamScore: 0,
        normalizedStatus: "finished",
        leagueName: "Allsvenskan",
        arenaName: "3Arena"
      },
      {
        competitionSlug: "swe.2",
        matchId: "m2",
        startDateIso: "2026-11-06T18:00:00.000Z",
        homeTeamName: "Alpha",
        awayTeamName: "Beta",
        homeTeamScore: null,
        awayTeamScore: null,
        normalizedStatus: "scheduled",
        leagueName: "Superettan"
      }
    ]
  });

  if (report.summary.evidenceRowCount !== 2) throw new Error("expected two evidence rows");
  if (report.summary.byStatus.FINISHED !== 1) throw new Error("expected one finished row");
  if (report.summary.byStatus.SCHEDULED !== 1) throw new Error("expected one scheduled row");
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
      evidenceRowCount: report.summary.evidenceRowCount,
      byLeague: report.summary.byLeague,
      byStatus: report.summary.byStatus,
      canonicalWrites: report.guarantees.canonicalWrites,
      productionWrite: report.guarantees.productionWrite
    }, null, 2));
    return;
  }

  const input = readJson(path.resolve(repoRoot, args.input));
  const report = buildReport(input);

  if (report.summary.evidenceRowCount !== 480) {
    throw new Error(`expected 480 Sportomedia evidence rows, got ${report.summary.evidenceRowCount}`);
  }

  if (report.summary.byLeague["swe.1"] !== 240 || report.summary.byLeague["swe.2"] !== 240) {
    throw new Error(`unexpected byLeague counts: ${JSON.stringify(report.summary.byLeague)}`);
  }

  if (report.guarantees.noFetch !== true ||
      report.guarantees.noSearch !== true ||
      report.guarantees.canonicalWrites !== 0 ||
      report.guarantees.productionWrite !== false) {
    throw new Error("read-only guarantees failed");
  }

  writeJson(path.resolve(repoRoot, args.output), report);
  console.log(JSON.stringify(report.summary, null, 2));
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  main();
}
