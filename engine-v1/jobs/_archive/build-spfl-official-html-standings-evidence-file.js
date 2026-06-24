import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const EXPECTED_TABLES = {
  "sco.1": {
    routeNeedle: "/league/premiership/table",
    sourceHost: "spfl.co.uk",
    sourceProvider: "spfl",
    sourceKind: "official_html_league_table",
    sourceFamily: "spfl_official_html",
    teams: [
      { rank: 1, teamName: "Celtic" },
      { rank: 2, teamName: "Heart of Midlothian" },
      { rank: 3, teamName: "Rangers" },
      { rank: 4, teamName: "Motherwell" },
      { rank: 5, teamName: "Hibernian" },
      { rank: 6, teamName: "Falkirk" },
      { rank: 7, teamName: "Dundee United" },
      { rank: 8, teamName: "Dundee" },
      { rank: 9, teamName: "Aberdeen" },
      { rank: 10, teamName: "Kilmarnock" },
      { rank: 11, teamName: "St. Mirren" },
      { rank: 12, teamName: "Livingston" }
    ]
  },
  "sco.2": {
    routeNeedle: "/league/championship/table",
    sourceHost: "spfl.co.uk",
    sourceProvider: "spfl",
    sourceKind: "official_html_league_table",
    sourceFamily: "spfl_official_html",
    teams: [
      { rank: 1, teamName: "St. Johnstone" },
      { rank: 2, teamName: "Partick Thistle" },
      { rank: 3, teamName: "Arbroath" },
      { rank: 4, teamName: "Dunfermline Athletic" },
      { rank: 5, teamName: "Raith Rovers" },
      { rank: 6, teamName: "Queen's Park" },
      { rank: 7, teamName: "Ayr United" },
      { rank: 8, teamName: "Greenock Morton" },
      { rank: 9, teamName: "Airdrieonians" },
      { rank: 10, teamName: "Ross County" }
    ]
  }
};

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

function getRows(input) {
  return (
    input.rows ||
    input.snapshots ||
    input.results ||
    input.fetchedSourceSnapshots ||
    input.fetchedSnapshots ||
    input.sourceSnapshots ||
    []
  );
}

function pickBody(row) {
  return asText(
    row.plainText ||
    row.rawText ||
    row.rawBody ||
    row.body ||
    row.html ||
    row.responseBody ||
    row.text ||
    row.content ||
    row.snapshotBody ||
    row.bodyText ||
    row.rawHtml ||
    row.htmlText
  );
}

function stripTags(html) {
  return asText(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rowUrl(row) {
  return asText(row.finalUrl || row.resolvedUrl || row.candidateUrl || row.url || row.sourceUrl || row.href || row.requestUrl);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseTeamLine({ plain, rank, teamName }) {
  const re = new RegExp(`(?:^|\\s)${rank}\\s+${escapeRegExp(teamName)}\\s+(\\d+)\\s+(-?\\d+)\\s+(\\d+)(?=\\s|$)`, "i");
  const match = re.exec(plain);

  if (!match) {
    return null;
  }

  return {
    rank,
    teamName,
    played: asNumber(match[1], null),
    goalDiff: asNumber(match[2], null),
    points: asNumber(match[3], null)
  };
}

function findOfficialTablePage(rows, routeNeedle) {
  return rows.find((row) => {
    const url = rowUrl(row).toLowerCase();
    return url.includes(routeNeedle.toLowerCase()) && url.includes("spfl.co.uk");
  });
}

function toEvidenceRow({ leagueSlug, sourceRow, parsedRow, rowIndex }) {
  const sourceUrl = rowUrl(sourceRow);
  const tableConfig = EXPECTED_TABLES[leagueSlug];

  return {
    snapshotId: `${leagueSlug}::spfl-official-html-standings::${String(parsedRow.rank).padStart(2, "0")}`,
    missingLeagueSlug: leagueSlug,
    leagueSlug,
    competitionSlug: leagueSlug,
    hostname: tableConfig.sourceHost,
    sourceHost: tableConfig.sourceHost,
    sourceUrl,
    finalUrl: sourceUrl,
    rank: parsedRow.rank,
    position: parsedRow.rank,
    teamId: null,
    teamName: parsedRow.teamName,
    team: parsedRow.teamName,
    name: parsedRow.teamName,
    played: parsedRow.played,
    wins: null,
    draws: null,
    losses: null,
    goalsFor: null,
    goalsAgainst: null,
    goalDiff: parsedRow.goalDiff,
    points: parsedRow.points,
    confidence: 98,
    confidenceReasons: [
      "official_spfl_html_table_row",
      "rank_team_played_goaldiff_points_present",
      "source_normalized_from_existing_fetched_snapshot"
    ],
    validationState: "validated_standings_evidence_row",
    validationReasons: [
      "official_html_standings_source",
      "primary_segment_row_shape_valid",
      "no_fetch_no_search_adapter"
    ],
    rowIndex,
    sourceProvider: tableConfig.sourceProvider,
    sourceKind: tableConfig.sourceKind,
    sourceFamily: tableConfig.sourceFamily,
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
    Number.isFinite(row.goalDiff) &&
    Number.isFinite(row.points) &&
    row.points >= 0
  );
}

function buildReport(input) {
  const rows = getRows(input);
  const evidenceRows = [];
  const extractionReports = [];

  for (const [leagueSlug, tableConfig] of Object.entries(EXPECTED_TABLES)) {
    const sourceRow = findOfficialTablePage(rows, tableConfig.routeNeedle);
    if (!sourceRow) {
      throw new Error(`Missing official SPFL table page for ${leagueSlug} route ${tableConfig.routeNeedle}`);
    }

    const body = pickBody(sourceRow);
    const plain = stripTags(body);
    const parsedRows = [];

    for (const expected of tableConfig.teams) {
      const parsed = parseTeamLine({ plain, rank: expected.rank, teamName: expected.teamName });
      if (!parsed) {
        throw new Error(`Failed to parse ${leagueSlug} rank ${expected.rank} ${expected.teamName}`);
      }
      parsedRows.push(parsed);
    }

    extractionReports.push({
      leagueSlug,
      sourceUrl: rowUrl(sourceRow),
      expectedTeamCount: tableConfig.teams.length,
      parsedTeamCount: parsedRows.length,
      firstRow: parsedRows[0],
      lastRow: parsedRows[parsedRows.length - 1]
    });

    evidenceRows.push(
      ...parsedRows.map((parsedRow, index) =>
        toEvidenceRow({
          leagueSlug,
          sourceRow,
          parsedRow,
          rowIndex: index + 1
        })
      )
    );
  }

  const validatedRows = evidenceRows.filter(validEvidenceRow);

  const byLeague = {};
  const byLeagueUniqueTeamCount = {};

  for (const row of validatedRows) {
    byLeague[row.leagueSlug] = (byLeague[row.leagueSlug] || 0) + 1;
    byLeagueUniqueTeamCount[row.leagueSlug] ||= new Set();
    byLeagueUniqueTeamCount[row.leagueSlug].add(row.teamName.toLowerCase());
  }

  const uniqueCounts = Object.fromEntries(
    Object.entries(byLeagueUniqueTeamCount).map(([leagueSlug, set]) => [leagueSlug, set.size])
  );

  return {
    ok: true,
    job: "build-spfl-official-html-standings-evidence-file",
    mode: "read_only_spfl_official_html_standings_to_validated_evidence",
    generatedAt: new Date().toISOString(),
    summary: {
      sourceSnapshotRows: rows.length,
      validatedStandingsEvidenceRowCount: validatedRows.length,
      byLeague,
      byLeagueUniqueTeamCount: uniqueCounts,
      canonicalWrites: 0,
      productionWrite: false,
      noFetch: true,
      noSearch: true,
      standingsWriteAllowedNow: false
    },
    extractionReports,
    validatedStandingsEvidenceRows: validatedRows,
    guarantees: {
      noFetch: true,
      noSearch: true,
      sourceFetch: false,
      usesOnlyExistingFetchedDiagnostic: true,
      noStandingsWrites: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true
    }
  };
}

function selfTest() {
  const input = {
    fetchedSourceSnapshots: [
      {
        finalUrl: "https://spfl.co.uk/league/premiership/table",
        plainText: "League Tables Prem Champ L1 L2 Pos Team Pld Gd Pts 1 Celtic 38 32 82 2 Heart of Midlothian 38 33 80 3 Rangers 38 33 72 4 Motherwell 38 23 61 5 Hibernian 38 14 57 6 Falkirk 38 -12 49 7 Dundee United 38 -11 45 8 Dundee 38 -19 42 9 Aberdeen 38 -15 40 10 Kilmarnock 38 -18 40 11 St. Mirren 38 -25 34 12 Livingston 38 -35 21 Updated at 08/06/2026"
      },
      {
        finalUrl: "https://spfl.co.uk/league/championship/table",
        plainText: "Pos Team Pld Gd Pts 1 St. Johnstone 36 42 77 2 Partick Thistle 36 17 66 3 Arbroath 36 2 52 4 Dunfermline Athletic 36 11 51 5 Raith Rovers 36 1 45 6 Queen's Park 36 -13 41 7 Ayr United 36 -9 39 8 Greenock Morton 36 -16 38 9 Airdrieonians 36 -14 36 10 Ross County 36 -21 34 Updated at 08/05/2026"
      }
    ]
  };

  const report = buildReport(input);

  if (report.summary.validatedStandingsEvidenceRowCount !== 22) throw new Error("expected 22 validated standings rows");
  if (report.summary.byLeague["sco.1"] !== 12) throw new Error("expected 12 sco.1 rows");
  if (report.summary.byLeague["sco.2"] !== 10) throw new Error("expected 10 sco.2 rows");
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

  if (report.summary.validatedStandingsEvidenceRowCount !== 22) {
    throw new Error(`expected 22 SPFL standings evidence rows, got ${report.summary.validatedStandingsEvidenceRowCount}`);
  }

  if (report.summary.byLeague["sco.1"] !== 12 || report.summary.byLeague["sco.2"] !== 10) {
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
