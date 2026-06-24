#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const JOB = "apply-football-truth-season-status-calendar-evidence-to-board-file";

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function asText(value) {
  return value === null || value === undefined ? "" : String(value);
}

function arrayFrom(value) {
  return Array.isArray(value) ? value : [];
}

function selectedRowsFrom(input) {
  if (Array.isArray(input.selectedRows)) return input.selectedRows;
  if (Array.isArray(input.rows)) return input.rows;
  if (Array.isArray(input.selectedEvidenceRows)) return input.selectedEvidenceRows;
  if (Array.isArray(input.selectedCalendarEvidenceRows)) return input.selectedCalendarEvidenceRows;
  if (Array.isArray(input.seasonStatusValidationRows)) return input.seasonStatusValidationRows;
  if (Array.isArray(input.validatedSeasonStatusRows)) return input.validatedSeasonStatusRows;
  if (Array.isArray(input.validatedSeasonStatusEvidenceRows)) return input.validatedSeasonStatusEvidenceRows;
  return [];
}

function boardRowsFrom(input) {
  if (Array.isArray(input.rows)) return input.rows;
  if (Array.isArray(input.readinessRows)) return input.readinessRows;
  if (Array.isArray(input.boardRows)) return input.boardRows;
  return [];
}

function normalizeUrl(url) {
  return asText(url).trim();
}

function groupEvidenceByLeague(selectedRows) {
  const byLeague = new Map();

  for (const row of selectedRows) {
    const leagueSlug = asText(row.leagueSlug || row.competitionSlug).trim();
    const sourceUrl = normalizeUrl(row.sourceUrl || row.candidateUrl || row.url);
    if (!leagueSlug || !sourceUrl) continue;

    if (!byLeague.has(leagueSlug)) byLeague.set(leagueSlug, []);

    byLeague.get(leagueSlug).push({
      leagueSlug,
      competitionSlug: asText(row.competitionSlug || leagueSlug),
      competitionName: asText(row.competitionName),
      hostname: asText(row.hostname),
      sourceUrl,
      seasonLabel: asText(row.seasonLabel),
      selectorScore: Number(row.selectorScore || 0),
      selectorReasons: arrayFrom(row.selectorReasons),
      evidenceNeed: asText(row.evidenceNeed || "competition_calendar"),
      evidenceState: "selected_official_calendar_evidence_url",
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    });
  }

  for (const [leagueSlug, rows] of byLeague.entries()) {
    const seen = new Set();
    const unique = [];

    for (const row of rows.sort((a, b) => b.selectorScore - a.selectorScore)) {
      const key = row.sourceUrl.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(row);
    }

    byLeague.set(leagueSlug, unique);
  }

  return byLeague;
}

function buildReport(boardInput, selectedInput, {
  boardPath = "",
  selectedPath = "",
  maxEvidencePerLeague = 5
} = {}) {
  const boardRows = boardRowsFrom(boardInput);
  const selectedRows = selectedRowsFrom(selectedInput);
  const evidenceByLeague = groupEvidenceByLeague(selectedRows);

  const overlayRows = boardRows.map((row) => {
    const leagueSlug = asText(row.leagueSlug || row.competitionSlug).trim();
    const evidenceRows = arrayFrom(evidenceByLeague.get(leagueSlug)).slice(0, maxEvidencePerLeague);
    const hasSelectedCalendarEvidence = evidenceRows.length > 0;

    let evidenceCoverageState = "missing_selected_calendar_evidence";
    if (hasSelectedCalendarEvidence) {
      evidenceCoverageState = "has_selected_calendar_evidence";
    }

    let nextAction = row.nextAction;
    if (hasSelectedCalendarEvidence && asText(row.statusBucket) === "NEEDS_SEASON_CALENDAR") {
      nextAction = "review_selected_official_calendar_evidence_for_season_state";
    }

    return {
      ...row,
      selectedCalendarEvidenceState: evidenceCoverageState,
      selectedCalendarEvidenceCount: evidenceRows.length,
      selectedCalendarEvidenceRows: evidenceRows,
      selectedCalendarEvidenceTopUrl: evidenceRows[0]?.sourceUrl || "",
      selectedCalendarEvidenceTopScore: evidenceRows[0]?.selectorScore || 0,
      nextAction,
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    };
  });

  const coveredRows = overlayRows.filter((row) => row.selectedCalendarEvidenceCount > 0);
  const missingRows = overlayRows.filter((row) => row.selectedCalendarEvidenceCount === 0);
  const selectedLeagueSlugs = new Set([...evidenceByLeague.keys()]);
  const boardLeagueSlugs = new Set(boardRows.map((row) => asText(row.leagueSlug || row.competitionSlug).trim()).filter(Boolean));
  const selectedWithoutBoardRows = [...selectedLeagueSlugs].filter((slug) => !boardLeagueSlugs.has(slug));

  return {
    ok: true,
    job: JOB,
    mode: "read_only_season_status_board_calendar_evidence_overlay",
    boardPath,
    selectedPath,
    summary: {
      boardRowCount: boardRows.length,
      selectedEvidenceInputRowCount: selectedRows.length,
      selectedEvidenceLeagueCount: selectedLeagueSlugs.size,
      boardRowsWithSelectedCalendarEvidenceCount: coveredRows.length,
      boardRowsMissingSelectedCalendarEvidenceCount: missingRows.length,
      selectedEvidenceWithoutBoardRowCount: selectedWithoutBoardRows.length,
      maxEvidencePerLeague,
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noWebSearch: true,
      noRegistryWrites: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    guarantees: {
      noWebSearch: true,
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyProvidedBoardAndSelectedEvidence: true,
      noRegistryWrites: true,
      noCanonicalPromotion: true,
      noFixtureWrites: true,
      noHistoryWrites: true,
      noValueWrites: true,
      noDetailsWrites: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true
    },
    rows: overlayRows,
    coveredRows,
    missingRows,
    selectedEvidenceWithoutBoardRows: selectedWithoutBoardRows.map((leagueSlug) => ({
      leagueSlug,
      selectedCalendarEvidenceRows: evidenceByLeague.get(leagueSlug) || []
    }))
  };
}

function runSelfTest() {
  const boardInput = {
    rows: [
      {
        leagueSlug: "esp.1",
        competitionName: "LaLiga",
        statusBucket: "NEEDS_SEASON_CALENDAR",
        nextAction: "acquire_calendar"
      },
      {
        leagueSlug: "sco.1",
        competitionName: "Scottish Premiership",
        statusBucket: "NEEDS_SEASON_CALENDAR",
        nextAction: "acquire_calendar"
      },
      {
        leagueSlug: "fra.1",
        competitionName: "Ligue 1",
        statusBucket: "NEEDS_SEASON_CALENDAR",
        nextAction: "acquire_calendar"
      }
    ]
  };

  const selectedInput = {
    selectedRows: [
      {
        leagueSlug: "esp.1",
        competitionName: "LaLiga",
        sourceUrl: "https://www.laliga.com/en-GB/laliga-easports/calendar",
        selectorScore: 80,
        selectorReasons: ["fixture_calendar_path"]
      },
      {
        leagueSlug: "sco.1",
        competitionName: "Scottish Premiership",
        sourceUrl: "https://spfl.co.uk/league/premiership/fixtures",
        selectorScore: 80,
        selectorReasons: ["fixture_calendar_path"]
      }
    ]
  };

  const report = buildReport(boardInput, selectedInput, {
    boardPath: "self-test-board",
    selectedPath: "self-test-selected",
    maxEvidencePerLeague: 5
  });

  if (report.summary.boardRowCount !== 3) throw new Error("expected 3 board rows");
  if (report.summary.selectedEvidenceInputRowCount !== 2) throw new Error("expected 2 selected evidence rows");
  if (report.summary.boardRowsWithSelectedCalendarEvidenceCount !== 2) throw new Error("expected 2 covered board rows");
  if (report.summary.boardRowsMissingSelectedCalendarEvidenceCount !== 1) throw new Error("expected 1 missing board row");
  if (!report.rows.find((row) => row.leagueSlug === "esp.1" && row.selectedCalendarEvidenceCount === 1)) {
    throw new Error("expected esp.1 evidence overlay");
  }
  if (!report.rows.find((row) => row.leagueSlug === "fra.1" && row.selectedCalendarEvidenceCount === 0)) {
    throw new Error("expected fra.1 missing evidence");
  }
  if (report.guarantees.sourceFetch !== false || report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("read-only guarantees failed");
  }

  return {
    ok: true,
    selfTest: JOB,
    summary: report.summary,
    guarantees: report.guarantees
  };
}

function main() {
  if (hasFlag("--self-test")) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const boardPath = argValue("--board") || argValue("--input-board");
  const selectedPath = argValue("--selected") || argValue("--selected-evidence");
  const outputPath = argValue("--output");
  const maxEvidencePerLeague = Number(argValue("--max-evidence-per-league", "5"));

  if (!boardPath) throw new Error("Missing --board");
  if (!selectedPath) throw new Error("Missing --selected");
  if (!outputPath) throw new Error("Missing --output");

  const boardInput = readJson(boardPath);
  const selectedInput = readJson(selectedPath);

  const report = buildReport(boardInput, selectedInput, {
    boardPath,
    selectedPath,
    maxEvidencePerLeague
  });

  writeJson(outputPath, report);

  console.log(JSON.stringify({
    ok: true,
    output: outputPath,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();
