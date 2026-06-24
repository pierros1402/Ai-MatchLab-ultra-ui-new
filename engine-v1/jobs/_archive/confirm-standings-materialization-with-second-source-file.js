#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return value == null ? "" : String(value);
}

function asNumber(value, fallback = null) {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeTeamName(value) {
  return asText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(k\.|rfc|fc|sk|kv|ksc|kas|kaa|rsca|jong|royal|club)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactTeamName(value) {
  return normalizeTeamName(value).replace(/\s+/g, "");
}

function pickPrimaryRows(primaryPlan) {
  const objects = primaryPlan && primaryPlan.proposedStandingsObjects ? primaryPlan.proposedStandingsObjects : {};
  const rows = [];

  for (const [leagueSlug, obj] of Object.entries(objects)) {
    const table = asArray(obj && obj.table);
    for (const row of table) {
      const rank = asNumber(row.rank ?? row.position);
      const teamName = asText(row.teamName || row.team || row.name);
      rows.push({
        leagueSlug,
        rank,
        teamName,
        normalizedTeamName: normalizeTeamName(teamName),
        compactTeamName: compactTeamName(teamName),
        played: asNumber(row.played),
        points: asNumber(row.points),
        sourceHost: asText(row.evidence && row.evidence.sourceHost),
        sourceUrl: asText(row.evidence && row.evidence.sourceUrl),
        evidence: row.evidence || null
      });
    }
  }

  return rows;
}

function pickSecondRows(secondSource) {
  return asArray(secondSource && secondSource.validatedStandingsEvidenceRows).map((row) => {
    const teamName = asText(row.teamName || row.team || row.name);
    return {
      leagueSlug: asText(row.missingLeagueSlug || row.leagueSlug),
      hostname: asText(row.hostname),
      rank: asNumber(row.rank ?? row.position),
      teamName,
      normalizedTeamName: normalizeTeamName(teamName),
      compactTeamName: compactTeamName(teamName),
      played: asNumber(row.played),
      points: asNumber(row.points),
      sourceUrl: asText(row.sourceUrl),
      confidence: asNumber(row.confidence, null),
      validationState: asText(row.validationState)
    };
  });
}

function findPrimaryMatch(primaryRows, secondRow) {
  const sameLeague = primaryRows.filter((row) => row.leagueSlug === secondRow.leagueSlug);

  const exactName = sameLeague.filter((row) => row.compactTeamName === secondRow.compactTeamName);
  const sameRank = sameLeague.filter((row) => row.rank === secondRow.rank);
  const sameRankExactName = sameRank.filter((row) => row.compactTeamName === secondRow.compactTeamName);

  const candidate = sameRankExactName[0] || exactName[0] || sameRank[0] || null;

  return {
    sameLeague,
    exactName,
    sameRank,
    sameRankExactName,
    candidate
  };
}

function classifyRow(primaryRows, secondRow) {
  const match = findPrimaryMatch(primaryRows, secondRow);
  const primary = match.candidate;

  if (!primary) {
    return {
      confirmationState: "second_source_row_has_no_primary_candidate",
      rowConfirmed: false,
      rowPartial: false,
      rowMismatch: true,
      reasons: ["no_primary_candidate_for_league_rank_or_team"],
      primary: null
    };
  }

  const sameRank = primary.rank === secondRow.rank;
  const sameName = primary.compactTeamName === secondRow.compactTeamName;
  const samePlayed = primary.played === secondRow.played;
  const samePoints = primary.points === secondRow.points;

  const reasons = [];
  if (sameRank) reasons.push("rank_matches"); else reasons.push("rank_mismatch");
  if (sameName) reasons.push("team_name_matches_normalized"); else reasons.push("team_name_mismatch_or_alias_needed");
  if (samePlayed) reasons.push("played_matches"); else reasons.push("played_mismatch");
  if (samePoints) reasons.push("points_matches"); else reasons.push("points_mismatch");

  const rowConfirmed = sameRank && sameName && samePlayed && samePoints;
  const rowPartial = !rowConfirmed && sameRank && sameName && samePlayed;
  const rowMismatch = !rowConfirmed && !rowPartial;

  return {
    confirmationState: rowConfirmed
      ? "confirmed_by_second_source"
      : rowPartial
        ? "partial_match_points_mismatch"
        : "not_confirmed_by_second_source",
    rowConfirmed,
    rowPartial,
    rowMismatch,
    reasons,
    primary
  };
}

function buildReport(primaryPlan, secondSource) {
  const primaryRows = pickPrimaryRows(primaryPlan);
  const secondRows = pickSecondRows(secondSource);
  const primaryLeagues = [...new Set(primaryRows.map((row) => row.leagueSlug))].sort();
  const secondLeagues = [...new Set(secondRows.map((row) => row.leagueSlug))].sort();

  const comparisonRows = secondRows.map((secondRow) => {
    const result = classifyRow(primaryRows, secondRow);
    const primary = result.primary;
    return {
      leagueSlug: secondRow.leagueSlug,
      secondSourceHost: secondRow.hostname,
      secondRank: secondRow.rank,
      secondTeamName: secondRow.teamName,
      secondPlayed: secondRow.played,
      secondPoints: secondRow.points,
      primaryRank: primary ? primary.rank : null,
      primaryTeamName: primary ? primary.teamName : "",
      primaryPlayed: primary ? primary.played : null,
      primaryPoints: primary ? primary.points : null,
      primarySourceHost: primary ? primary.sourceHost : "",
      confirmationState: result.confirmationState,
      rowConfirmed: result.rowConfirmed,
      rowPartial: result.rowPartial,
      rowMismatch: result.rowMismatch,
      reasons: result.reasons,
      standingsWriteAllowedNow: false,
      canonicalWrites: 0,
      productionWrite: false
    };
  });

  const leagueConfirmationRows = primaryLeagues.map((leagueSlug) => {
    const leaguePrimaryRows = primaryRows.filter((row) => row.leagueSlug === leagueSlug);
    const leagueSecondRows = comparisonRows.filter((row) => row.leagueSlug === leagueSlug);
    const confirmed = leagueSecondRows.filter((row) => row.rowConfirmed);
    const partial = leagueSecondRows.filter((row) => row.rowPartial);
    const mismatches = leagueSecondRows.filter((row) => row.rowMismatch);

    let confirmationState = "blocked_missing_second_source";
    const reasons = [];

    if (leagueSecondRows.length === 0) {
      reasons.push("no_validated_second_source_rows_for_league");
    } else {
      if (confirmed.length > 0) reasons.push("has_confirmed_rows");
      if (partial.length > 0) reasons.push("has_partial_rows");
      if (mismatches.length > 0) reasons.push("has_mismatch_rows");
      if (leagueSecondRows.length < leaguePrimaryRows.length) reasons.push("second_source_table_is_partial");
      if (confirmed.length !== leaguePrimaryRows.length) reasons.push("not_all_primary_rows_confirmed");
      if (partial.length > 0) reasons.push("points_or_metric_mismatch_blocks_confirmation");
      confirmationState = confirmed.length === leaguePrimaryRows.length
        ? "confirmed_full_table_readiness_review_required"
        : "blocked_second_source_not_full_confirmation";
    }

    return {
      leagueSlug,
      primaryRowCount: leaguePrimaryRows.length,
      secondSourceRowCount: leagueSecondRows.length,
      confirmedRowCount: confirmed.length,
      partialRowCount: partial.length,
      mismatchRowCount: mismatches.length,
      confirmationState,
      reasons,
      standingsWriteAllowedNow: false,
      canonicalWrites: 0,
      productionWrite: false
    };
  });

  const confirmedRowCount = comparisonRows.filter((row) => row.rowConfirmed).length;
  const partialRowCount = comparisonRows.filter((row) => row.rowPartial).length;
  const mismatchRowCount = comparisonRows.filter((row) => row.rowMismatch).length;
  const fullyConfirmedLeagueCount = leagueConfirmationRows.filter((row) => row.confirmationState === "confirmed_full_table_readiness_review_required").length;

  return {
    ok: true,
    job: "confirm-standings-materialization-with-second-source-file",
    generatedAt: new Date().toISOString(),
    inputSummary: {
      primaryJob: asText(primaryPlan && primaryPlan.job),
      secondSourceJob: asText(secondSource && secondSource.job),
      primaryLeagueCount: primaryLeagues.length,
      primaryRowCount: primaryRows.length,
      secondValidatedLeagueCount: secondLeagues.length,
      secondValidatedRowCount: secondRows.length
    },
    summary: {
      comparisonRowCount: comparisonRows.length,
      leagueConfirmationRowCount: leagueConfirmationRows.length,
      confirmedRowCount,
      partialRowCount,
      mismatchRowCount,
      fullyConfirmedLeagueCount,
      blockedLeagueCount: leagueConfirmationRows.length - fullyConfirmedLeagueCount,
      standingsWriteAllowedNowCount: 0,
      canonicalWrites: 0,
      productionWrite: false
    },
    leagueConfirmationRows,
    comparisonRows,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noStandingsWrites: true,
      noCanonicalPromotion: true,
      standingsWriteAllowedNow: false,
      canonicalWrites: 0,
      productionWrite: false,
      diagnosticOnly: true
    },
    standingsWriteAllowedNow: false,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function selfTest() {
  const primaryPlan = {
    job: "self-test-primary",
    proposedStandingsObjects: {
      "bel.2": {
        table: [
          { rank: 1, teamName: "SK Beveren", played: 32, points: 88, evidence: { sourceHost: "primary.test" } },
          { rank: 2, teamName: "KV Kortrijk", played: 32, points: 67, evidence: { sourceHost: "primary.test" } }
        ]
      }
    }
  };

  const secondSource = {
    job: "self-test-second",
    validatedStandingsEvidenceRows: [
      { missingLeagueSlug: "bel.2", hostname: "second.test", rank: 1, teamName: "SK Beveren", played: 32, points: 88 },
      { missingLeagueSlug: "bel.2", hostname: "second.test", rank: 2, teamName: "KV Kortrijk", played: 32, points: 33 }
    ]
  };

  const report = buildReport(primaryPlan, secondSource);
  if (report.summary.confirmedRowCount !== 1) throw new Error("expected one confirmed row");
  if (report.summary.partialRowCount !== 1) throw new Error("expected one partial row");
  if (report.guarantees.noStandingsWrites !== true) throw new Error("expected noStandingsWrites true");
  if (report.summary.canonicalWrites !== 0) throw new Error("expected canonicalWrites 0");

  return {
    ok: true,
    selfTest: "confirm-standings-materialization-with-second-source-file",
    summary: report.summary,
    guarantees: report.guarantees
  };
}

function main() {
  const args = parseArgs(process.argv);

  if (args["self-test"]) {
    console.log(JSON.stringify(selfTest(), null, 2));
    return;
  }

  const primaryPath = args.primary || args["primary-plan"];
  const secondPath = args.second || args["second-source"];
  const outputPath = args.output || "data/football-truth/_diagnostics/same-prefix-missing-standings/standings-second-source-confirmation-diagnostic.json";

  if (!primaryPath) throw new Error("Missing --primary <materialization plan>");
  if (!secondPath) throw new Error("Missing --second <validated second-source evidence>");

  const primaryPlan = readJson(primaryPath);
  const secondSource = readJson(secondPath);
  const report = buildReport(primaryPlan, secondSource);

  writeJson(outputPath, report);

  console.log(JSON.stringify({
    ok: true,
    output: outputPath,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();