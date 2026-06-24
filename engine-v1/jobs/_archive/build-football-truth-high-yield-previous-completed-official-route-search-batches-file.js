import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const boardPath = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `refreshed-prioritized-high-yield-lifecycle-expansion-board-${today}`,
  `refreshed-prioritized-high-yield-lifecycle-expansion-board-rows-${today}.jsonl`
);

const outputDir = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `high-yield-previous-completed-official-route-search-batches-${today}`
);

const outputPath = path.join(
  outputDir,
  `high-yield-previous-completed-official-route-search-batches-${today}.json`
);

const rowsOutputPath = path.join(
  outputDir,
  `high-yield-previous-completed-official-route-search-batch-rows-${today}.jsonl`
);

const slugMeta = new Map(Object.entries({
  "arg.1": { country: "Argentina", league: "Liga Profesional Argentina", officialHints: ["afa.com.ar", "ligaprofesional.ar"] },
  "arg.2": { country: "Argentina", league: "Primera Nacional", officialHints: ["afa.com.ar"] },
  "aus.1": { country: "Australia", league: "A-League Men", officialHints: ["aleagues.com.au"] },
  "aus.2": { country: "Australia", league: "National Premier Leagues", officialHints: ["footballaustralia.com.au"] },
  "aut.1": { country: "Austria", league: "Bundesliga", officialHints: ["bundesliga.at"] },
  "aut.2": { country: "Austria", league: "2. Liga", officialHints: ["2liga.at", "bundesliga.at"] },
  "bel.1": { country: "Belgium", league: "Jupiler Pro League", officialHints: ["proleague.be"] },
  "bel.2": { country: "Belgium", league: "Challenger Pro League", officialHints: ["proleague.be"] },
  "bra.1": { country: "Brazil", league: "Brasileirão Série A", officialHints: ["cbf.com.br"] },
  "bra.2": { country: "Brazil", league: "Brasileirão Série B", officialHints: ["cbf.com.br"] },
  "fra.1": { country: "France", league: "Ligue 1", officialHints: ["ligue1.fr", "lfp.fr"] },
  "fra.2": { country: "France", league: "Ligue 2", officialHints: ["ligue2.fr", "lfp.fr"] },
  "gre.1": { country: "Greece", league: "Super League Greece", officialHints: ["slgr.gr", "superleaguegreece.net"] },
  "gre.2": { country: "Greece", league: "Super League 2", officialHints: ["sl2.gr"] },
  "kor.1": { country: "South Korea", league: "K League 1", officialHints: ["kleague.com"] },
  "kor.2": { country: "South Korea", league: "K League 2", officialHints: ["kleague.com"] },
  "ksa.1": { country: "Saudi Arabia", league: "Saudi Pro League", officialHints: ["spl.com.sa"] },
  "ksa.2": { country: "Saudi Arabia", league: "First Division League", officialHints: ["fdl.sa", "saff.com.sa"] },
  "mex.1": { country: "Mexico", league: "Liga MX", officialHints: ["ligamx.net"] },
  "mex.2": { country: "Mexico", league: "Liga de Expansión MX", officialHints: ["ligamx.net"] },
  "nor.1": { country: "Norway", league: "Eliteserien", officialHints: ["eliteserien.no", "fotball.no"] },
  "pol.1": { country: "Poland", league: "Ekstraklasa", officialHints: ["ekstraklasa.org"] },
  "pol.2": { country: "Poland", league: "I liga", officialHints: ["1liga.org", "pzpn.pl"] },
  "por.1": { country: "Portugal", league: "Liga Portugal Betclic", officialHints: ["ligaportugal.pt"] },
  "por.2": { country: "Portugal", league: "Liga Portugal 2", officialHints: ["ligaportugal.pt"] },
  "sui.1": { country: "Switzerland", league: "Super League", officialHints: ["sfl.ch"] },
  "sui.2": { country: "Switzerland", league: "Challenge League", officialHints: ["sfl.ch"] },
  "swe.1": { country: "Sweden", league: "Allsvenskan", officialHints: ["allsvenskan.se", "svenskfotboll.se"] },
  "tur.1": { country: "Turkey", league: "Süper Lig", officialHints: ["tff.org"] },
  "tur.2": { country: "Turkey", league: "1. Lig", officialHints: ["tff.org"] },
  "usa.1": { country: "United States", league: "Major League Soccer", officialHints: ["mlssoccer.com"] }
}));

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

function defaultMeta(slug) {
  const [countryCode, tier] = slug.split(".");
  return {
    country: countryCode.toUpperCase(),
    league: `${countryCode.toUpperCase()} tier ${tier}`,
    officialHints: []
  };
}

function buildQueries(row) {
  const meta = slugMeta.get(row.slug) || defaultMeta(row.slug);
  const seasonLabels = ["2025-2026", "2025/26", "2025 standings", "table 2025-26"];
  const base = `${meta.league} ${meta.country}`;

  const queries = [
    `"${base}" official standings ${seasonLabels[0]}`,
    `"${meta.league}" official table ${seasonLabels[1]}`,
    `"${meta.league}" standings ${seasonLabels[2]} official`,
    `"${meta.league}" results table ${seasonLabels[3]}`
  ];

  for (const host of meta.officialHints.slice(0, 2)) {
    queries.push(`site:${host} "${meta.league}" standings 2025`);
    queries.push(`site:${host} table "${seasonLabels[1]}"`);
  }

  return queries.map((query, index) => ({
    slug: row.slug,
    lane: row.lane,
    batchRank: row.rank,
    queryRank: index + 1,
    query,
    expectedSourceType: "official_or_league_operator",
    acceptanceGate: {
      requireExactCompetitionIdentity: true,
      requireSeasonScope: "previous_completed",
      requireSeasonLabel: "2025-2026_or_equivalent",
      requireNonZeroRows: true,
      requireExpectedRowsBeforeAcceptance: true,
      requireTeamSignalsBeforeAcceptance: true,
      requireArithmeticBeforeAcceptance: true,
      canonicalWriteAllowed: false,
      productionWriteAllowed: false,
      truthAssertionAllowed: false
    }
  }));
}

await fs.mkdir(outputDir, { recursive: true });

const boardRows = parseJsonl(await fs.readFile(boardPath, "utf8"));

const selectedTargets = boardRows
  .filter(row => row.lane === "previous_completed_standings")
  .filter(row => !["ita.1", "nor.2", "cyp.2", "eng.1"].includes(row.slug))
  .slice(0, 40);

if (selectedTargets.length !== 40) {
  throw new Error(`Expected 40 selected targets, got ${selectedTargets.length}`);
}

const targetQueryGroups = selectedTargets.map(target => ({
  slug: target.slug,
  rows: buildQueries(target)
}));

const queryRows = targetQueryGroups.flatMap(group => group.rows);

const targetGroupsPerBatch = 6;
const batches = [];
for (let i = 0; i < targetQueryGroups.length; i += targetGroupsPerBatch) {
  const groups = targetQueryGroups.slice(i, i + targetGroupsPerBatch);
  const rows = groups.flatMap(group => group.rows);
  batches.push({
    batchId: `high_yield_previous_completed_route_search_${today}_${String(batches.length + 1).padStart(2, "0")}`,
    startTargetIndex: i,
    targetCount: groups.length,
    queryCount: rows.length,
    targetSlugs: groups.map(group => group.slug)
  });
}

const report = {
  status: "passed",
  runner: "build_high_yield_previous_completed_official_route_search_batches",
  contractVersion: 1,
  purpose: "Plan-only official route search batches for top refreshed previous_completed lifecycle targets; no search/fetch/write execution.",
  inputBoardRowsPath: path.relative(root, boardPath).replaceAll("\\", "/"),
  inputBoardRowsSha256: await sha256(boardPath),
  output: path.relative(root, outputPath).replaceAll("\\", "/"),
  rowsOutput: path.relative(root, rowsOutputPath).replaceAll("\\", "/"),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false
  },
  approvalGate: {
    searchExecutionRequiresSeparateCommand: true,
    fetchExecutionRequiresSeparateCommand: true,
    canonicalWriteRequiresExplicitUserApproval: true,
    productionWriteAllowed: false,
    truthAssertionAllowed: false
  },
  summary: {
    selectedTargetCount: selectedTargets.length,
    queryRowCount: queryRows.length,
    batchCount: batches.length,
    firstTwentyTargets: selectedTargets.slice(0, 20).map(row => row.slug),
    knownSuppressed: ["ita.1", "nor.2", "cyp.2", "eng.1"]
  },
  batches,
  selectedTargets
};

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsOutputPath, queryRows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  summary: report.summary,
  batches: report.batches
}, null, 2));

