import fs from "fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];

    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function guarantees() {
  return {
    sourceFetch: false,
    noFetch: true,
    noSearch: true,
    noUrlFetch: true,
    noCanonicalPromotion: true,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function cleanText(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#x27;|&#39;|&#039;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function urlOf(row) {
  return String(row.finalUrl || row.resolvedUrl || row.candidateUrl || row.url || "");
}

function statusOf(row) {
  return Number(row.status || row.statusCode || row.http?.status || 0);
}

function htmlOf(row) {
  return String(row.rawText || row.plainText || "");
}

function hostOf(row) {
  try {
    return new URL(urlOf(row)).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "unknown";
  }
}

function slugOf(row) {
  return row.leagueSlug || row.competitionSlug || "";
}

function providerKeyFor(row) {
  const host = hostOf(row);

  if (/laliga\.com/.test(host)) return "laliga_official";
  if (/bundesliga\.com/.test(host)) return "bundesliga_official";
  if (/spfl\.co\.uk/.test(host)) return "host:spfl.co.uk";

  return `host:${host}`;
}

function extractTableBlocks(html) {
  const blocks = [];
  const re = /<table\b[\s\S]*?<\/table>/gi;
  let match;

  while ((match = re.exec(html))) {
    blocks.push(match[0]);
    if (blocks.length >= 40) break;
  }

  return blocks;
}

function extractTableRows(tableHtml) {
  const rows = [];
  const trRe = /<tr\b[\s\S]*?<\/tr>/gi;
  let tr;

  while ((tr = trRe.exec(tableHtml))) {
    const cells = [];
    const cellRe = /<(?:td|th)\b[\s\S]*?<\/(?:td|th)>/gi;
    let cell;

    while ((cell = cellRe.exec(tr[0]))) {
      const text = cleanText(cell[0]);
      if (text) cells.push(text);
    }

    if (cells.length) rows.push(cells);
  }

  return rows;
}

function normalizeLaLigaDate(value) {
  const m = String(value || "").match(/\b([0-3]?[0-9])\.([01]?[0-9])\.(20[2-9][0-9])\b/);
  if (!m) return "";
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function parseLaLigaMatch(value) {
  const text = cleanText(value);

  let m = text.match(/^(.{2,90}?)\s+([0-9]{1,2})\s*[-–]\s*([0-9]{1,2})\s+(.{2,90}?)$/);
  if (m) {
    return {
      homeTeam: cleanText(m[1]),
      awayTeam: cleanText(m[4]),
      score: `${m[2]}-${m[3]}`,
      status: "finished"
    };
  }

  m = text.match(/^(.{2,90}?)\s+VS\s+(.{2,90}?)$/i);
  if (m) {
    return {
      homeTeam: cleanText(m[1]),
      awayTeam: cleanText(m[2]),
      score: "",
      status: "scheduled"
    };
  }

  return null;
}

function extractLaLigaRows(snapshot) {
  const rows = [];
  const tables = extractTableBlocks(htmlOf(snapshot));

  for (let tableIndex = 0; tableIndex < tables.length; tableIndex += 1) {
    const tableRows = extractTableRows(tables[tableIndex]);

    for (let rowIndex = 0; rowIndex < tableRows.length; rowIndex += 1) {
      const cells = tableRows[rowIndex].map(cleanText).filter(Boolean);

      const dateCell = cells.find((cell) => /\b[0-3]?[0-9]\.[01]?[0-9]\.20[2-9][0-9]\b/.test(cell));
      const timeCell = cells.find((cell) => /\b[0-2]?[0-9]:[0-5][0-9]\b/.test(cell));
      const matchCell = cells.find((cell) =>
        /([0-9]{1,2}\s*[-–]\s*[0-9]{1,2}| VS )/i.test(cell) &&
        !/^\d{1,2}\s*[-–]\s*\d{1,2}$/.test(cell)
      );

      if (!dateCell || !timeCell || !matchCell) continue;

      const parsedMatch = parseLaLigaMatch(matchCell);
      if (!parsedMatch) continue;

      rows.push({
        competitionSlug: slugOf(snapshot),
        leagueSlug: slugOf(snapshot),
        providerKey: "laliga_official",
        sourceContract: "laliga_official_table_result_fixture",
        sourceFamily: "official_route_registry",
        trustTier: "official_registry_provider_contract",
        evidenceType: "fixture_or_result",
        date: normalizeLaLigaDate(dateCell),
        time: timeCell.match(/\b[0-2]?[0-9]:[0-5][0-9]\b/)?.[0] || "",
        homeTeam: parsedMatch.homeTeam,
        awayTeam: parsedMatch.awayTeam,
        score: parsedMatch.score,
        status: parsedMatch.status,
        finalUrl: urlOf(snapshot),
        tableIndex,
        rowIndex,
        rawText: cells.join(" | "),
        canonicalWrites: 0,
        productionWrite: false
      });
    }
  }

  return rows;
}

function parseBundesligaStandingRow(cells, snapshot, tableIndex, rowIndex) {
  const cleanedCells = cells.map(cleanText).filter(Boolean);
  const joined = cleanedCells.join(" | ");

  const rank = Number(cleanedCells[0]);
  const played = Number(cleanedCells[2]);
  const points = Number(cleanedCells[cleanedCells.length - 1]);

  if (!Number.isFinite(rank) || rank <= 0 || rank > 40) return null;
  if (!cleanedCells[1] || !Number.isFinite(played) || !Number.isFinite(points)) return null;
  if (!/\b\d{1,2}-\d{1,2}-\d{1,2}\b/.test(joined)) return null;

  return {
    competitionSlug: slugOf(snapshot),
    leagueSlug: slugOf(snapshot),
    providerKey: "bundesliga_official",
    sourceContract: "bundesliga_official_standings_table",
    sourceFamily: "official_route_registry",
    trustTier: "official_registry_provider_contract",
    evidenceType: "standings",
    rank,
    team: cleanedCells[1],
    played,
    points,
    finalUrl: urlOf(snapshot),
    tableIndex,
    rowIndex,
    rawText: joined,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function extractBundesligaRows(snapshot) {
  const rows = [];
  const tables = extractTableBlocks(htmlOf(snapshot));

  for (let tableIndex = 0; tableIndex < tables.length; tableIndex += 1) {
    const tableRows = extractTableRows(tables[tableIndex]);

    for (let rowIndex = 0; rowIndex < tableRows.length; rowIndex += 1) {
      const parsed = parseBundesligaStandingRow(tableRows[rowIndex], snapshot, tableIndex, rowIndex);
      if (parsed) rows.push(parsed);
    }
  }

  return rows;
}

function extractSpflRows(snapshot) {
  const text = cleanText(htmlOf(snapshot));
  const rows = [];

  const monthMap = {
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12"
  };

  const re = /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+([0-3]?[0-9])(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20[2-9][0-9])\s+(.{2,80}?)\s+([0-9]{1,2})\s*[-–]\s*([0-9]{1,2})\s+(.{2,80}?)(?=\s+KDM|\s+Round:|\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+|$)/gi;

  let match;
  let rowIndex = 0;

  while ((match = re.exec(text))) {
    const homeTeam = cleanText(match[4]);
    const awayTeam = cleanText(match[7]);

    if (!homeTeam || !awayTeam) continue;
    if (/fixtures|results|table|archive|round/i.test(`${homeTeam} ${awayTeam}`)) continue;

    rows.push({
      competitionSlug: slugOf(snapshot),
      leagueSlug: slugOf(snapshot),
      providerKey: "host:spfl.co.uk",
      sourceContract: "spfl_challenge_cup_text_result",
      sourceFamily: "official_route_registry",
      trustTier: "official_registry_provider_contract",
      evidenceType: "cup_fixture_or_result",
      date: `${match[3]}-${monthMap[match[2].toLowerCase()]}-${match[1].padStart(2, "0")}`,
      time: "",
      homeTeam,
      awayTeam,
      score: `${match[5]}-${match[6]}`,
      status: "finished",
      finalUrl: urlOf(snapshot),
      tableIndex: null,
      rowIndex,
      rawText: cleanText(match[0]),
      canonicalWrites: 0,
      productionWrite: false
    });

    rowIndex += 1;
    if (rows.length >= 80) break;
  }

  return rows;
}

function extractRowsFromSnapshot(snapshot) {
  const providerKey = providerKeyFor(snapshot);

  if (providerKey === "bundesliga_official") return extractBundesligaRows(snapshot);
  if (providerKey === "laliga_official") return extractLaLigaRows(snapshot);
  if (providerKey === "host:spfl.co.uk") return extractSpflRows(snapshot);

  return [];
}

function buildSummary(rows, selectedSnapshots) {
  const byProvider = {};
  const byEvidenceType = {};
  const byStatus = {};

  for (const row of rows) {
    const providerKey = row.providerKey;
    byProvider[providerKey] ||= {
      providerKey,
      competitions: new Set(),
      rowCount: 0,
      standingsRows: 0,
      fixtureRows: 0,
      resultRows: 0,
      scheduledRows: 0,
      sampleRows: []
    };

    const provider = byProvider[providerKey];
    provider.competitions.add(row.competitionSlug);
    provider.rowCount += 1;

    if (row.evidenceType === "standings") provider.standingsRows += 1;
    if (row.evidenceType === "fixture_or_result" || row.evidenceType === "cup_fixture_or_result") provider.fixtureRows += 1;
    if (row.status === "finished") provider.resultRows += 1;
    if (row.status === "scheduled") provider.scheduledRows += 1;

    if (provider.sampleRows.length < 10) provider.sampleRows.push(row);

    byEvidenceType[row.evidenceType] = (byEvidenceType[row.evidenceType] || 0) + 1;
    byStatus[row.status || "none"] = (byStatus[row.status || "none"] || 0) + 1;
  }

  return {
    byProvider: Object.values(byProvider).map((row) => ({
      ...row,
      competitions: [...row.competitions].sort()
    })).sort((a, b) => a.providerKey.localeCompare(b.providerKey)),
    byEvidenceType,
    byStatus,
    selectedSnapshotCount: selectedSnapshots.length
  };
}

function selfTest() {
  const laliga = {
    leagueSlug: "esp.1",
    finalUrl: "https://www.laliga.com/en-GB/laliga-easports/results",
    rawText: `<table><tr><td>Watch summary</td><td>SAT 23.05.2026</td><td>19:00</td><td>Real Betis 2 - 1 Levante UD</td><td>Ref</td></tr></table>`
  };

  const bundesliga = {
    leagueSlug: "ger.1",
    finalUrl: "https://www.bundesliga.com/en/bundesliga/table",
    rawText: `<table><tr><th>Club</th></tr><tr><td>1</td><td>FCB Bayern Bayern Munich</td><td>34</td><td>28-5-1</td><td>122:36</td><td>+86</td><td>89</td></tr></table>`
  };

  const spfl = {
    leagueSlug: "sco.challenge",
    finalUrl: "https://spfl.co.uk/league/challenge-cup/results",
    rawText: `Sunday 5th April 2026 Raith Rovers 4 - 1 Inverness Caledonian Thistle KDM Evolution Trophy`
  };

  const rows = [
    ...extractRowsFromSnapshot(laliga),
    ...extractRowsFromSnapshot(bundesliga),
    ...extractRowsFromSnapshot(spfl)
  ];

  if (rows.length !== 3) throw new Error(`self_test_rows:${rows.length}`);
  if (!rows.find((row) => row.providerKey === "laliga_official" && row.score === "2-1")) throw new Error("self_test_laliga_missing");
  if (!rows.find((row) => row.providerKey === "bundesliga_official" && row.rank === 1 && row.points === 89)) throw new Error("self_test_bundesliga_missing");
  if (!rows.find((row) => row.providerKey === "host:spfl.co.uk" && row.score === "4-1")) throw new Error("self_test_spfl_missing");

  return {
    ok: true,
    selfTest: "build-official-route-table-parser-provider-evidence-file",
    summary: {
      extractedEvidenceRowCount: rows.length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    guarantees: guarantees()
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args["self-test"]) {
    console.log(JSON.stringify(selfTest(), null, 2));
    return;
  }

  if (!args.input || !args.output) {
    throw new Error("Usage: node build-official-route-table-parser-provider-evidence-file.js --input <snapshots.json> --output <out.json>");
  }

  const input = JSON.parse(fs.readFileSync(args.input, "utf8"));
  const snapshots = input.fetchedSourceSnapshots || [];

  const targetProviders = new Set([
    "bundesliga_official",
    "laliga_official",
    "host:spfl.co.uk"
  ]);

  const selectedSnapshots = snapshots.filter((row) =>
    statusOf(row) === 200 &&
    targetProviders.has(providerKeyFor(row))
  );

  const rows = [];

  for (const snapshot of selectedSnapshots) {
    rows.push(...extractRowsFromSnapshot(snapshot));
  }

  const summaryParts = buildSummary(rows, selectedSnapshots);

  const report = {
    ok: true,
    mode: "read_only_official_route_table_parser_provider_batch_evidence",
    generatedAt: new Date().toISOString(),
    input: {
      snapshotInputPath: args.input,
      targetProviders: [...targetProviders].sort()
    },
    summary: {
      inputSnapshotCount: snapshots.length,
      selectedSnapshotCount: selectedSnapshots.length,
      extractedEvidenceRowCount: rows.length,
      providerCount: summaryParts.byProvider.length,
      byEvidenceType: summaryParts.byEvidenceType,
      byStatus: summaryParts.byStatus,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    byProvider: summaryParts.byProvider,
    rows,
    decisionRule: [
      "Provider-contract batch only: Bundesliga, LaLiga and SPFL Challenge Cup.",
      "Uses already fetched snapshots from data diagnostics.",
      "No search/fetch/canonical writes.",
      "Rows require writer-compatible promotion plan validation before canonical writes."
    ],
    guarantees: guarantees()
  };

  fs.writeFileSync(args.output, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log(JSON.stringify({
    output: args.output,
    summary: report.summary,
    byProvider: report.byProvider,
    sampleRows: report.rows.slice(0, 20),
    guarantees: report.guarantees
  }, null, 2));
}

main();
