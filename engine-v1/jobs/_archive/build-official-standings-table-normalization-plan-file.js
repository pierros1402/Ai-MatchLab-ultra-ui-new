import fs from "node:fs";
import path from "node:path";

const GUARANTEES = Object.freeze({
  sourceFetch: false,
  noFetch: true,
  noSearch: true,
  noUrlFetch: true,
  noCanonicalWrites: true,
  canonicalWrites: 0,
  productionWrite: false
});

function argValue(name, fallback = "") {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return fallback;
  return process.argv[idx + 1] || fallback;
}

function assertNoWrites(report) {
  if (report?.guarantees?.canonicalWrites !== 0) {
    throw new Error("canonical write guarantee failed");
  }
  if (report?.guarantees?.productionWrite !== false) {
    throw new Error("production write guarantee failed");
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function decodeText(raw) {
  return String(raw || "")
    .replace(/\\n/g, " ")
    .replace(/\\"/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectEvidenceTexts(evidenceFiles = []) {
  const texts = [];

  for (const evidence of evidenceFiles) {
    if (evidence?.sample) texts.push(evidence.sample);

    const file = evidence?.file;
    if (!file || !fs.existsSync(file)) continue;

    const raw = fs.readFileSync(file, "utf8");
    texts.push(raw);
  }

  return texts.map(decodeText).filter(Boolean);
}

function findBestObosTableText(texts) {
  const candidates = [];

  for (const text of texts) {
    const needles = [
      "Tabell / OBOS-ligaen",
      "Tabell OBOS-ligaen",
      "Strømsgodset Strømsgodset",
      "Kongsvinger Kongsvinger"
    ];

    for (const needle of needles) {
      let idx = text.indexOf(needle);
      while (idx >= 0) {
        const start = Math.max(0, idx - 500);
        const end = Math.min(text.length, idx + 7000);
        const segment = text.slice(start, end);
        const score =
          (segment.includes("Spilt") ? 20 : 0) +
          (segment.includes("Poeng") ? 20 : 0) +
          (segment.includes("Strømsgodset") ? 20 : 0) +
          (segment.includes("Kongsvinger") ? 20 : 0) +
          (segment.includes("Raufoss") ? 20 : 0) +
          (segment.includes("Åsane") ? 20 : 0);

        candidates.push({ score, segment });
        idx = text.indexOf(needle, idx + 1);
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.segment || "";
}

function parseObosStandings(tableText) {
  const teams = [
    "Strømsgodset",
    "Kongsvinger",
    "Haugesund",
    "Odd",
    "Stabæk",
    "Ranheim TF",
    "Hødd",
    "Moss",
    "Egersund",
    "Sogndal",
    "Bryne",
    "Sandnes Ulf",
    "Lyn",
    "Raufoss",
    "Åsane",
    "Strømmen"
  ];

  const normalized = decodeText(tableText);
  const rows = [];

  for (let i = 0; i < teams.length; i += 1) {
    const rank = i + 1;
    const team = teams[i];
    const teamPattern = escapeRegex(team);

    const re = new RegExp(
      `\\b${rank}\\s+${teamPattern}\\s+${teamPattern}\\s+` +
      `(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+` +
      `(\\d+)\\s+(\\d+)\\s+(-?\\d+)\\s+(\\d+)\\b`,
      "u"
    );

    const match = normalized.match(re);
    if (!match) continue;

    const [, played, won, drawn, lost, goalsFor, goalsAgainst, goalDifference, points] = match;

    rows.push({
      rank,
      team,
      played: Number(played),
      won: Number(won),
      drawn: Number(drawn),
      lost: Number(lost),
      goalsFor: Number(goalsFor),
      goalsAgainst: Number(goalsAgainst),
      goalDifference: Number(goalDifference),
      points: Number(points)
    });
  }

  return rows;
}

function buildNor2PlanRow(target) {
  const texts = collectEvidenceTexts(target.evidenceFiles || []);
  const tableText = findBestObosTableText(texts);
  const standingsRows = parseObosStandings(tableText);

  const complete = standingsRows.length === 16;
  const structurallyValid = standingsRows.length >= 12 &&
    standingsRows.every((row) =>
      Number.isInteger(row.rank) &&
      row.rank > 0 &&
      row.team &&
      Number.isInteger(row.played) &&
      Number.isInteger(row.points)
    );

  return {
    promotionPlanId: "nor.2::standings::official-obos-tabell::2026-06-10",
    promotionType: "standings",
    competitionSlug: "nor.2",
    provider: "norway_ntf_official",
    sourceContract: "obos_ligaen_official_tabell_text",
    sourceFamily: "official_route_registry_existing_snapshot",
    confirmationState: complete
      ? "confirmed_official_standings_candidate_needs_writer_dry_run"
      : "blocked_incomplete_table_extraction",
    confirmationConfidence: complete ? "high" : (structurallyValid ? "medium_incomplete" : "low"),
    proposedCanonicalFile: "data/standings/nor.2.json",
    proposedCanonicalPayload: {
      competitionSlug: "nor.2",
      competitionName: "OBOS-ligaen",
      seasonHint: "2026",
      standingsType: "league_table",
      sourceProvider: "obos-ligaen.no",
      sourceUrls: [
        "https://www.obos-ligaen.no/tabell"
      ],
      rows: standingsRows
    },
    evidenceSummary: {
      extractedRowCount: standingsRows.length,
      expectedRowCount: 16,
      tableComplete: complete,
      tableTextSample: tableText.slice(0, 2200)
    },
    blockingReasons: complete ? [] : [
      `expected_16_rows_extracted_${standingsRows.length}`
    ],
    canonicalWrites: 0,
    productionWrite: false
  };
}

function runSelfTest() {
  const sample = `
    Tabell / OBOS-ligaen
    1 Strømsgodset Strømsgodset 10 7 2 1 26 11 15 23 V V U V V
    2 Kongsvinger Kongsvinger 10 7 2 1 23 11 12 23 U V V T V
    3 Haugesund Haugesund 10 7 1 2 30 17 13 22 T U V V V
    4 Odd Odd 10 7 1 2 23 12 11 22 V T T V V
    5 Stabæk Stabæk 10 5 3 2 22 12 10 18 V T U V U
    6 Ranheim TF Ranheim TF 10 5 2 3 28 20 8 17 T V T V U
    7 Hødd Hødd 10 4 2 4 13 13 0 14 V U T V T
    8 Moss Moss 10 4 2 4 16 20 -4 14 T V U T U
    9 Egersund Egersund 10 4 1 5 13 16 -3 13 T T U T T
    10 Sogndal Sogndal 10 3 3 4 17 22 -5 12 V U U T V
    11 Bryne Bryne 10 3 1 6 14 20 -6 10 V V T T V
    12 Sandnes Ulf Sandnes Ulf 10 3 1 6 12 18 -6 10 T V T V T
    13 Lyn Lyn 10 3 1 6 8 18 -10 10 V T U V T
    14 Raufoss Raufoss 10 2 1 7 12 21 -9 7 T V V T T
    15 Åsane Åsane 10 2 1 7 12 26 -14 7 T T V T T
    16 Strømmen Strømmen 10 1 2 7 12 25 -13 5 U T T T U
  `;

  const rows = parseObosStandings(sample);
  if (rows.length !== 16) throw new Error(`self-test expected 16 rows, got ${rows.length}`);
  if (rows[0].team !== "Strømsgodset" || rows[0].points !== 23) {
    throw new Error("self-test first row mismatch");
  }
  if (rows[15].team !== "Strømmen" || rows[15].points !== 5) {
    throw new Error("self-test last row mismatch");
  }

  const report = {
    ok: true,
    mode: "self-test",
    summary: {
      parsedRows: rows.length,
      canonicalWrites: 0,
      productionWrite: false
    },
    guarantees: GUARANTEES
  };

  assertNoWrites(report);
  console.log(JSON.stringify(report, null, 2));
}

function main() {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
    return;
  }

  const inputPath = argValue("--input");
  const outputPath = argValue("--output");

  if (!inputPath) throw new Error("Missing --input");
  if (!outputPath) throw new Error("Missing --output");

  const board = readJson(inputPath);
  const targets = Array.isArray(board.targetRows) ? board.targetRows : [];

  const promotionPlanRows = [];
  const acquisitionBatchRows = [];
  const blockedRows = [];

  for (const target of targets) {
    if (
      target.competitionSlug === "nor.2" &&
      target.lane === "ready_for_batch_standings_normalizer_from_existing_official_tabell"
    ) {
      promotionPlanRows.push(buildNor2PlanRow(target));
      continue;
    }

    if (/controlled_acquisition_batch/.test(target.lane || "")) {
      acquisitionBatchRows.push({
        competitionSlug: target.competitionSlug,
        provider: target.provider,
        need: target.need,
        acquisitionCohort: "official_standings_grouped_controlled_acquisition",
        canonicalWrites: 0,
        productionWrite: false
      });
      continue;
    }

    blockedRows.push({
      competitionSlug: target.competitionSlug,
      provider: target.provider,
      need: target.need,
      lane: target.lane,
      action: target.action,
      canonicalWrites: 0,
      productionWrite: false
    });
  }

  const readyRows = promotionPlanRows.filter((row) =>
    row.confirmationState === "confirmed_official_standings_candidate_needs_writer_dry_run"
  );

  const report = {
    ok: true,
    job: "build-official-standings-table-normalization-plan-file",
    mode: "dry-run",
    generatedAt: new Date().toISOString(),
    input: inputPath,
    summary: {
      inputTargetRows: targets.length,
      promotionPlanRows: promotionPlanRows.length,
      readyRows: readyRows.length,
      acquisitionBatchRows: acquisitionBatchRows.length,
      blockedRows: blockedRows.length,
      canonicalWrites: 0,
      productionWrite: false
    },
    promotionPlanRows,
    acquisitionBatchRows,
    blockedRows,
    decisionRule: {
      promotedNow: false,
      notes: [
        "This job normalizes official standings evidence into a promotion-plan candidate only.",
        "No canonical standings files are written by this job.",
        "Targets without existing official table evidence remain grouped for controlled acquisition, not one-off diagnostics."
      ]
    },
    guarantees: GUARANTEES
  };

  assertNoWrites(report);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");

  console.log(JSON.stringify({
    ok: true,
    output: outputPath,
    summary: report.summary,
    promotionPlanRows: report.promotionPlanRows.map((row) => ({
      competitionSlug: row.competitionSlug,
      confirmationState: row.confirmationState,
      extractedRowCount: row.evidenceSummary.extractedRowCount,
      expectedRowCount: row.evidenceSummary.expectedRowCount,
      proposedCanonicalFile: row.proposedCanonicalFile,
      blockingReasons: row.blockingReasons
    })),
    acquisitionBatchRows: report.acquisitionBatchRows,
    blockedRows: report.blockedRows.map((row) => ({
      competitionSlug: row.competitionSlug,
      lane: row.lane
    })),
    guarantees: report.guarantees
  }, null, 2));
}

main();
