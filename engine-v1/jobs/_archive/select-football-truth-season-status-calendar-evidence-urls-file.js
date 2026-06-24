#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

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

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function sourceUrlOf(row) {
  const candidates = [
    row.sourceUrl,
    row.finalUrl,
    row.resolvedUrl,
    row.candidateUrl,
    row.url,
    row.source?.sourceUrl,
    row.source?.finalUrl,
    row.source?.resolvedUrl,
    row.source?.candidateUrl,
    row.source?.url,
    row.source?.href
  ];

  for (const candidate of candidates) {
    const text = asText(candidate).trim();
    if (text) return text;
  }

  return "";
}

function hostnameOf(row) {
  const candidates = [
    row.hostname,
    row.source?.hostname,
    row.source?.host
  ];

  for (const candidate of candidates) {
    const text = asText(candidate).trim();
    if (text) return text.toLowerCase().replace(/^www\./, "");
  }

  return hostFromUrl(sourceUrlOf(row));
}

function scoreUrl(leagueSlug, url) {
  const u = asText(url).toLowerCase();
  let score = 0;
  const reasons = [];

  if (/calendar|calendario|kalender|fixtures|fixture|matchcentre|matcher/.test(u)) {
    score += 80;
    reasons.push("fixture_calendar_path");
  }

  if (/results|resultados|table|standing|standings|classification|clasificacion|classement/.test(u)) {
    score += 60;
    reasons.push("results_table_path");
  }

  if (/2025|2026|2025-2026|20252026|2026-/.test(u)) {
    score += 25;
    reasons.push("season_year_signal");
  }

  if (/\/matchs\/|\/partita\/|\/posts\/|\/news|\/noticias\/|\/nyheter/.test(u)) {
    score -= 35;
    reasons.push("article_or_match_detail_penalty");
  }

  if (leagueSlug === "esp.1" && !/laliga-easports/.test(u)) {
    score -= 100;
    reasons.push("esp_cross_competition_penalty");
  }

  if (leagueSlug === "sco.1" && /championship|league-one|league-two|challenge-cup|league-cup/.test(u)) {
    score -= 100;
    reasons.push("sco_cross_competition_penalty");
  }

  if (leagueSlug === "bel.1" && /lotto-super-league|crokycup|\/cpl|cookie-policy|discrimin/.test(u)) {
    score -= 100;
    reasons.push("bel_cross_or_policy_penalty");
  }

  if (leagueSlug === "col.1" && /femenina|torneo-betplay|copa-betplay/.test(u)) {
    score -= 100;
    reasons.push("col_cross_competition_penalty");
  }

  return { score, reasons };
}

function acceptedRowsFrom(input) {
  if (Array.isArray(input.acceptedUniqueRows)) return input.acceptedUniqueRows;
  if (Array.isArray(input.calendarRestartEvidenceRows)) return input.calendarRestartEvidenceRows;
  if (Array.isArray(input.rows)) return input.rows;
  return [];
}

function buildReport(input, { inputPath = "", perLeagueLimit = 5, minScore = 40 } = {}) {
  const rows = acceptedRowsFrom(input);

  const scoredRows = rows.map((row) => {
    const sourceUrl = sourceUrlOf(row);
    const leagueSlug = asText(row.leagueSlug || row.competitionSlug);
    const score = scoreUrl(leagueSlug, sourceUrl);

    return {
      leagueSlug,
      competitionSlug: asText(row.competitionSlug || leagueSlug),
      competitionName: asText(row.competitionName || row.name),
      hostname: hostnameOf(row),
      sourceUrl,
      seasonLabel: asText(row.seasonLabel),
      evidenceState: asText(row.evidenceState),
      evidenceNeed: asText(row.evidenceNeed),
      selectorScore: score.score,
      selectorReasons: score.reasons,
      selected: score.score >= minScore,
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    };
  });

  const dedupeKey = (row) => `${row.leagueSlug}|${row.sourceUrl}`.toLowerCase();
  const seen = new Set();
  const uniqueScoredRows = [];

  for (const row of scoredRows) {
    const key = dedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueScoredRows.push(row);
  }

  const selectedRows = uniqueScoredRows
    .filter((row) => row.selected)
    .sort((a, b) => {
      if (a.leagueSlug !== b.leagueSlug) return a.leagueSlug.localeCompare(b.leagueSlug);
      return b.selectorScore - a.selectorScore;
    });

  const selectedByLeague = new Map();
  for (const row of selectedRows) {
    if (!selectedByLeague.has(row.leagueSlug)) selectedByLeague.set(row.leagueSlug, []);
    selectedByLeague.get(row.leagueSlug).push(row);
  }

  const topRows = [];
  for (const rowsForLeague of selectedByLeague.values()) {
    topRows.push(...rowsForLeague.slice(0, perLeagueLimit));
  }

  return {
    ok: true,
    job: "select-football-truth-season-status-calendar-evidence-urls-file",
    mode: "read_only_calendar_evidence_url_selection",
    inputPath,
    summary: {
      inputEvidenceUrlCount: rows.length,
      inputUniqueEvidenceUrlCount: uniqueScoredRows.length,
      selectedUrlCount: topRows.length,
      selectedLeagueCount: new Set(topRows.map((row) => row.leagueSlug)).size,
      rejectedBySelectorCount: uniqueScoredRows.filter((row) => !row.selected).length,
      perLeagueLimit,
      minScore,
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
      usesOnlyProvidedEvidenceRows: true,
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
    selectedRows: topRows,
    scoredRows: uniqueScoredRows
  };
}

function runSelfTest() {
  const input = {
    acceptedUniqueRows: [
      {
        leagueSlug: "esp.1",
        competitionName: "LaLiga",
        sourceUrl: "https://www.laliga.com/en-GB/laliga-easports/calendar",
        hostname: "www.laliga.com",
        seasonLabel: "2025/26"
      },
      {
        leagueSlug: "esp.1",
        competitionName: "LaLiga",
        sourceUrl: "https://www.laliga.com/en-GB/laliga-hypermotion/calendar",
        hostname: "www.laliga.com",
        seasonLabel: "2025/26"
      },
      {
        leagueSlug: "sco.1",
        competitionName: "Scottish Premiership",
        sourceUrl: "https://spfl.co.uk/league/premiership/fixtures",
        hostname: "spfl.co.uk"
      },
      {
        leagueSlug: "sco.1",
        competitionName: "Scottish Premiership",
        sourceUrl: "https://spfl.co.uk/league/championship/fixtures",
        hostname: "spfl.co.uk"
      },
      {
        leagueSlug: "bel.1",
        competitionName: "Belgian Pro League",
        sourceUrl: "https://www.proleague.be/fr/jupliler-pro-league-20252026-kalender",
        hostname: "www.proleague.be"
      },
      {
        leagueSlug: "bel.1",
        competitionName: "Belgian Pro League",
        sourceUrl: "https://www.proleague.be/fr/crokycup",
        hostname: "www.proleague.be"
      }
    ]
  };

  const report = buildReport(input, { inputPath: "self-test", perLeagueLimit: 5 });

  if (report.summary.inputUniqueEvidenceUrlCount !== 6) throw new Error("expected 6 unique input rows");
  if (report.summary.selectedLeagueCount !== 3) throw new Error("expected 3 selected leagues");
  if (!report.selectedRows.find((row) => row.leagueSlug === "esp.1" && row.sourceUrl.includes("laliga-easports/calendar"))) {
    throw new Error("expected LaLiga EA Sports calendar selected");
  }
  if (report.selectedRows.find((row) => row.sourceUrl.includes("hypermotion"))) {
    throw new Error("expected LaLiga Hypermotion rejected for esp.1");
  }
  if (report.selectedRows.find((row) => row.sourceUrl.includes("championship"))) {
    throw new Error("expected Scottish Championship rejected for sco.1");
  }
  if (report.selectedRows.find((row) => row.sourceUrl.includes("crokycup"))) {
    throw new Error("expected Croky Cup rejected for bel.1");
  }
  if (report.guarantees.noFetch !== true || report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("read-only guarantees failed");
  }

  return {
    ok: true,
    selfTest: "select-football-truth-season-status-calendar-evidence-urls-file",
    summary: report.summary,
    guarantees: report.guarantees
  };
}

function main() {
  if (hasFlag("--self-test")) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const inputPath = argValue("--input");
  const outputPath = argValue("--output");
  const perLeagueLimit = Number(argValue("--per-league-limit", "5"));
  const minScore = Number(argValue("--min-score", "40"));

  if (!inputPath) throw new Error("Missing --input");
  if (!outputPath) throw new Error("Missing --output");

  const input = readJson(inputPath);
  const report = buildReport(input, { inputPath, perLeagueLimit, minScore });

  writeJson(outputPath, report);
  console.log(JSON.stringify({
    ok: true,
    output: outputPath,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();
