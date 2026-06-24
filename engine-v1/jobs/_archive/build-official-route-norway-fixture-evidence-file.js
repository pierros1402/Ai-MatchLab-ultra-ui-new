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

function rawTextOf(row) {
  return String(row.rawText || row.plainText || "");
}

function competitionFromSnapshot(row) {
  const slug = row.leagueSlug || row.competitionSlug || "";
  if (slug === "nor.1" || slug === "nor.2") return slug;

  const url = urlOf(row).toLowerCase();
  if (url.includes("eliteserien.no")) return "nor.1";
  if (url.includes("obos-ligaen.no")) return "nor.2";
  return "";
}

function isNorwayProviderUrl(row) {
  const url = urlOf(row).toLowerCase();
  return (
    (url.includes("eliteserien.no") || url.includes("obos-ligaen.no")) &&
    (url.includes("/terminliste") || url.includes("/resultater"))
  );
}

function sourcePageKind(row) {
  const url = urlOf(row).toLowerCase();
  if (url.includes("/resultater")) return "results";
  if (url.includes("/terminliste")) return "schedule";
  return "unknown";
}

function extractTableBlocks(html) {
  const blocks = [];
  const re = /<table\b[\s\S]*?<\/table>/gi;
  let match;
  while ((match = re.exec(html))) {
    blocks.push(match[0]);
    if (blocks.length >= 80) break;
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

function normalizeDate(dateText) {
  const m = String(dateText || "").match(/\b([0-3]?[0-9])\.(?:\s*)?([01]?[0-9])\.(?:\s*)?(20[2-9][0-9])\b/);
  if (!m) return "";
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function parseTeamPair(teamText) {
  const cleaned = cleanText(teamText)
    .replace(/\([0-9]{1,2}\s*[-–]\s*[0-9]{1,2}\)/g, "")
    .trim();

  const m = cleaned.match(/^(.{2,80}?)\s+-\s+(.{2,80}?)$/);
  if (!m) return null;

  return {
    homeTeam: cleanText(m[1]),
    awayTeam: cleanText(m[2])
  };
}

function parseDateTime(value) {
  const m = String(value || "").match(/\b([0-3]?[0-9]\.\s*[01]?[0-9]\.\s*20[2-9][0-9])\s+([0-2]?[0-9]:[0-5][0-9])\b/);
  if (!m) return null;

  return {
    date: normalizeDate(m[1]),
    time: m[2]
  };
}

function parseScore(value) {
  const m = String(value || "").match(/\b([0-9]{1,2})\s*[-–]\s*([0-9]{1,2})\b/);
  if (!m) return "";
  return `${m[1]}-${m[2]}`;
}

function parseFixtureRowFromCells(cells, pageKind) {
  const cleaned = cells.map(cleanText).filter(Boolean);

  if (cleaned.length < 2) return null;
  if (cleaned.length === 1) return null;
  if (/abonner|terminliste|resultater|tabell|spilt|vunnet|uavgjort|poeng|form/i.test(cleaned.join(" "))) return null;

  let teams = null;
  let dateTime = null;
  let score = "";

  for (const cell of cleaned) {
    if (!teams) teams = parseTeamPair(cell);
    if (!dateTime) dateTime = parseDateTime(cell);
    if (!score) score = parseScore(cell);
  }

  if (!teams || !dateTime?.date || !dateTime?.time) return null;

  const status = score ? "finished" : "scheduled";

  if (pageKind === "results" && !score) return null;

  return {
    ...teams,
    date: dateTime.date,
    time: dateTime.time,
    score,
    status
  };
}

function extractRowsFromSnapshot(snapshot) {
  const html = rawTextOf(snapshot);
  const pageKind = sourcePageKind(snapshot);
  const tableBlocks = extractTableBlocks(html);
  const out = [];

  for (let tableIndex = 0; tableIndex < tableBlocks.length; tableIndex += 1) {
    const tableRows = extractTableRows(tableBlocks[tableIndex]);

    for (let rowIndex = 0; rowIndex < tableRows.length; rowIndex += 1) {
      const cells = tableRows[rowIndex];
      const parsed = parseFixtureRowFromCells(cells, pageKind);
      if (!parsed) continue;

      out.push({
        competitionSlug: competitionFromSnapshot(snapshot),
        leagueSlug: competitionFromSnapshot(snapshot),
        sourceContract: "official_route_norway_fixture_result_table",
        provider: "norway_ntf_official",
        sourceFamily: "official_route_registry",
        trustTier: "official_registry_provider_contract",
        evidenceType: "fixture_or_result",
        sourcePageKind: pageKind,
        finalUrl: urlOf(snapshot),
        candidateUrl: snapshot.candidateUrl || "",
        hostname: snapshot.hostname || "",
        tableIndex,
        rowIndex,
        date: parsed.date,
        time: parsed.time,
        homeTeam: parsed.homeTeam,
        awayTeam: parsed.awayTeam,
        score: parsed.score,
        status: parsed.status,
        rawCells: cells,
        rawText: cells.join(" | "),
        canonicalWrites: 0,
        productionWrite: false
      });
    }
  }

  return out;
}

function selfTest() {
  const sample = {
    leagueSlug: "nor.2",
    finalUrl: "https://www.obos-ligaen.no/resultater",
    hostname: "www.obos-ligaen.no",
    status: 200,
    rawText: `
      <table>
        <tr><td>#1</td><td>Ranheim TF - Strømmen (2-2)</td><td>2-2</td><td>07.06. 2026 17:00 #1</td><td>EXTRA Arena</td></tr>
        <tr><td>#10</td><td>Raufoss - Haugesund (3-4)</td><td>3-4</td><td>31.05. 2026 17:00 #10</td><td>NAMMO stadion</td></tr>
      </table>
    `
  };

  const rows = extractRowsFromSnapshot(sample);
  if (rows.length !== 2) throw new Error(`self_test_row_count:${rows.length}`);
  if (rows[0].status !== "finished") throw new Error(`self_test_status:${rows[0].status}`);
  if (rows[0].score !== "2-2") throw new Error(`self_test_score:${rows[0].score}`);
  if (rows[0].date !== "2026-06-07") throw new Error(`self_test_date:${rows[0].date}`);
  if (rows[0].homeTeam !== "Ranheim TF") throw new Error(`self_test_home:${rows[0].homeTeam}`);
  if (rows[0].awayTeam !== "Strømmen") throw new Error(`self_test_away:${rows[0].awayTeam}`);

  return {
    ok: true,
    selfTest: "build-official-route-norway-fixture-evidence-file",
    summary: {
      inputSnapshotCount: 1,
      extractedEvidenceRowCount: rows.length,
      resultRows: rows.filter((row) => row.status === "finished").length,
      scheduledRows: rows.filter((row) => row.status === "scheduled").length,
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
    throw new Error("Usage: node build-official-route-norway-fixture-evidence-file.js --input <snapshots.json> --output <out.json>");
  }

  const input = JSON.parse(fs.readFileSync(args.input, "utf8"));
  const snapshots = input.fetchedSourceSnapshots || [];

  const selectedSnapshots = snapshots.filter((row) =>
    statusOf(row) === 200 &&
    isNorwayProviderUrl(row) &&
    (competitionFromSnapshot(row) === "nor.1" || competitionFromSnapshot(row) === "nor.2")
  );

  const extractedRows = [];
  for (const snapshot of selectedSnapshots) {
    extractedRows.push(...extractRowsFromSnapshot(snapshot));
  }

  const seen = new Set();
  const dedupedRows = [];

  for (const row of extractedRows) {
    const key = [
      row.competitionSlug,
      row.date,
      row.time,
      row.homeTeam,
      row.awayTeam,
      row.score,
      row.status
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    dedupedRows.push(row);
  }

  const byCompetition = {};
  const byStatus = {};
  const bySourcePageKind = {};

  for (const row of dedupedRows) {
    const slug = row.competitionSlug;
    byCompetition[slug] ||= {
      competitionSlug: slug,
      rowCount: 0,
      resultRows: 0,
      scheduledRows: 0,
      firstDate: "",
      lastDate: "",
      sourcePageKinds: {},
      sampleRows: []
    };

    const comp = byCompetition[slug];
    comp.rowCount += 1;

    if (row.status === "finished") comp.resultRows += 1;
    if (row.status === "scheduled") comp.scheduledRows += 1;

    comp.sourcePageKinds[row.sourcePageKind] = (comp.sourcePageKinds[row.sourcePageKind] || 0) + 1;

    if (!comp.firstDate || row.date < comp.firstDate) comp.firstDate = row.date;
    if (!comp.lastDate || row.date > comp.lastDate) comp.lastDate = row.date;

    if (comp.sampleRows.length < 12) {
      comp.sampleRows.push({
        date: row.date,
        time: row.time,
        homeTeam: row.homeTeam,
        awayTeam: row.awayTeam,
        score: row.score,
        status: row.status,
        sourcePageKind: row.sourcePageKind,
        finalUrl: row.finalUrl
      });
    }

    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
    bySourcePageKind[row.sourcePageKind] = (bySourcePageKind[row.sourcePageKind] || 0) + 1;
  }

  const report = {
    ok: true,
    mode: "read_only_official_route_norway_provider_fixture_result_evidence",
    generatedAt: new Date().toISOString(),
    input: {
      snapshotInputPath: args.input,
      selectedProvider: "norway_ntf_official",
      competitions: ["nor.1", "nor.2"]
    },
    summary: {
      inputSnapshotCount: snapshots.length,
      selectedSnapshotCount: selectedSnapshots.length,
      extractedRawRowCount: extractedRows.length,
      dedupedEvidenceRowCount: dedupedRows.length,
      competitionCount: Object.keys(byCompetition).length,
      byStatus,
      bySourcePageKind,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    byCompetition: Object.values(byCompetition).sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug)),
    rows: dedupedRows,
    decisionRule: [
      "Provider-contract batch only: Norway official NTF sites for nor.1 and nor.2.",
      "Uses already fetched snapshots from data diagnostics.",
      "No search/fetch/canonical writes.",
      "Rows still require writer-compatible promotion plan validation before canonical writes."
    ],
    guarantees: guarantees()
  };

  fs.writeFileSync(args.output, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log(JSON.stringify({
    output: args.output,
    summary: report.summary,
    byCompetition: report.byCompetition,
    sampleRows: report.rows.slice(0, 30).map((row) => ({
      competitionSlug: row.competitionSlug,
      date: row.date,
      time: row.time,
      homeTeam: row.homeTeam,
      awayTeam: row.awayTeam,
      score: row.score,
      status: row.status,
      sourcePageKind: row.sourcePageKind,
      finalUrl: row.finalUrl
    })),
    guarantees: report.guarantees
  }, null, 2));
}

main();
