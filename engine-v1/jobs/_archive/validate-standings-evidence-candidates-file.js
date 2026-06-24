#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function parseArgs(argv = process.argv) {
  const args = {
    input: "",
    output: "",
    selfTest: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--input" && argv[i + 1]) {
      args.input = String(argv[++i] || "").trim();
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      args.output = String(argv[++i] || "").trim();
      continue;
    }

    throw new Error(`Unknown or incomplete argument: ${arg}`);
  }

  return args;
}

function resolveRepoPath(filePath) {
  if (!filePath) return "";
  return path.isAbsolute(filePath) ? filePath : path.resolve(repoRoot, filePath);
}

function readJson(filePath, label) {
  const resolved = resolveRepoPath(filePath);
  if (!resolved) throw new Error(`missing --${label}`);
  if (!fs.existsSync(resolved)) throw new Error(`missing ${label} file: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

function writeJson(filePath, value) {
  const resolved = resolveRepoPath(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return resolved;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return String(value || "").trim();
}

function asNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pickEvidenceRows(input) {
  const direct = asArray(input.standingsEvidenceCandidateRows);
  if (direct.length) return direct;

  const nested = asArray(input.report?.standingsEvidenceCandidateRows);
  if (nested.length) return nested;

  return [];
}

function countBy(rows, field) {
  const out = {};
  for (const row of rows) {
    const key = asText(row[field]) || "unknown";
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function teamKey(value) {
  return asText(value).toLowerCase().replace(/[^a-z0-9à-ÿ]+/gi, " ").replace(/\s+/g, " ").trim();
}

function splitRankSegments(rows) {
  const ordered = [...rows].sort((a, b) => {
    const ai = asNumber(a.rowIndex, 0);
    const bi = asNumber(b.rowIndex, 0);
    return ai - bi;
  });

  const segments = [];
  let current = [];
  let lastRank = null;
  const seenRanks = new Set();

  for (const row of ordered) {
    const rank = asNumber(row.rank, null);

    const startsNewSegment =
      current.length > 0 &&
      Number.isFinite(rank) &&
      (
        rank === 1 ||
        (Number.isFinite(lastRank) && rank <= lastRank) ||
        seenRanks.has(rank)
      );

    if (startsNewSegment) {
      segments.push(current);
      current = [];
      seenRanks.clear();
    }

    current.push(row);
    if (Number.isFinite(rank)) {
      seenRanks.add(rank);
      lastRank = rank;
    }
  }

  if (current.length) segments.push(current);
  return segments;
}

function modalPositivePlayed(rows) {
  const counts = new Map();

  for (const row of rows) {
    const played = asNumber(row.played, null);
    if (!Number.isFinite(played) || played <= 0) continue;
    counts.set(played, (counts.get(played) || 0) + 1);
  }

  let bestValue = null;
  let bestCount = 0;

  for (const [value, count] of counts.entries()) {
    if (count > bestCount) {
      bestValue = value;
      bestCount = count;
    }
  }

  return { played: bestValue, count: bestCount };
}

function validateSegment(segment, segmentIndex, groupRows) {
  const modal = modalPositivePlayed(segment);
  const maxRank = Math.max(...segment.map((row) => asNumber(row.rank, 0)));
  const uniqueTeams = new Set(segment.map((row) => teamKey(row.teamName)).filter(Boolean));
  const uniqueRanks = new Set(segment.map((row) => asNumber(row.rank, null)).filter((rank) => Number.isFinite(rank)));

  const reasons = [];

  if (segmentIndex !== 0) reasons.push("secondary_or_phase_table_segment");
  if (segment.length < 4) reasons.push("segment_too_short");
  if (uniqueTeams.size < 4) reasons.push("too_few_unique_teams");
  if (uniqueRanks.size < Math.min(4, segment.length)) reasons.push("too_few_unique_ranks");
  if (!Number.isFinite(modal.played)) reasons.push("no_positive_modal_played");
  if (Number.isFinite(maxRank) && maxRank > 40) reasons.push("rank_range_too_large");

  const isPrimarySegment = segmentIndex === 0 && reasons.length === 0;

  return {
    isPrimarySegment,
    segmentIndex,
    segmentRowCount: segment.length,
    modalPlayed: modal.played,
    modalPlayedCount: modal.count,
    groupRowCount: groupRows.length,
    segmentMaxRank: maxRank,
    segmentUniqueTeamCount: uniqueTeams.size,
    segmentUniqueRankCount: uniqueRanks.size,
    segmentRejectionReasons: reasons
  };
}

function validateRow(row, context) {
  const rejectionReasons = [];

  const rank = asNumber(row.rank, null);
  const played = asNumber(row.played, null);
  const points = asNumber(row.points, null);
  const confidence = asNumber(row.confidence, 0);
  const teamName = asText(row.teamName);

  if (!asText(row.missingLeagueSlug)) rejectionReasons.push("missing_league_slug");
  if (!asText(row.hostname)) rejectionReasons.push("missing_hostname");
  if (!teamName) rejectionReasons.push("missing_team_name");
  if (!Number.isFinite(rank) || rank < 1 || rank > 40) rejectionReasons.push("invalid_rank");
  if (!Number.isFinite(played) || played < 1 || played > 80) rejectionReasons.push("invalid_played");
  if (!Number.isFinite(points) || points < 0 || points > 200) rejectionReasons.push("invalid_points");
  if (confidence < 60) rejectionReasons.push("low_confidence");
  if (!context.isPrimarySegment) rejectionReasons.push(...context.segmentRejectionReasons);
  if (Number.isFinite(context.modalPlayed) && Number.isFinite(played) && played !== context.modalPlayed) {
    rejectionReasons.push("played_differs_from_primary_segment_modal");
  }

  const duplicateKey = [
    asText(row.missingLeagueSlug),
    asText(row.hostname),
    context.segmentIndex,
    teamKey(teamName)
  ].join("|");

  return {
    duplicateKey,
    rejectionReasons
  };
}

function buildReport(input, options = {}) {
  const evidenceRows = pickEvidenceRows(input);
  const validatedStandingsEvidenceRows = [];
  const rejectedStandingsEvidenceRows = [];
  const validationDiagnosticRows = [];
  const duplicateSeen = new Set();

  const groups = groupBy(evidenceRows, (row) => [
    asText(row.snapshotId),
    asText(row.missingLeagueSlug),
    asText(row.hostname)
  ].join("|"));

  for (const [groupKey, rows] of groups.entries()) {
    const segments = splitRankSegments(rows);

    segments.forEach((segment, segmentIndex) => {
      const context = validateSegment(segment, segmentIndex, rows);

      validationDiagnosticRows.push({
        groupKey,
        snapshotId: asText(segment[0]?.snapshotId),
        missingLeagueSlug: asText(segment[0]?.missingLeagueSlug),
        hostname: asText(segment[0]?.hostname),
        segmentIndex,
        segmentRowCount: context.segmentRowCount,
        modalPlayed: context.modalPlayed,
        modalPlayedCount: context.modalPlayedCount,
        segmentMaxRank: context.segmentMaxRank,
        segmentUniqueTeamCount: context.segmentUniqueTeamCount,
        segmentUniqueRankCount: context.segmentUniqueRankCount,
        isPrimarySegment: context.isPrimarySegment,
        segmentRejectionReasons: context.segmentRejectionReasons,
        standingsWriteAllowedNow: false,
        canonicalWrites: 0,
        productionWrite: false
      });

      for (const row of segment) {
        const rowValidation = validateRow(row, context);
        const duplicateReasons = [];

        if (duplicateSeen.has(rowValidation.duplicateKey)) {
          duplicateReasons.push("duplicate_team_within_league_host_segment");
        } else {
          duplicateSeen.add(rowValidation.duplicateKey);
        }

        const rejectionReasons = [...rowValidation.rejectionReasons, ...duplicateReasons];

        const normalizedRow = {
          snapshotId: asText(row.snapshotId),
          taskId: asText(row.taskId),
          missingLeagueSlug: asText(row.missingLeagueSlug),
          countryPrefix: asText(row.countryPrefix),
          hostname: asText(row.hostname),
          sourceUrl: asText(row.sourceUrl),
          finalUrl: asText(row.finalUrl),
          title: asText(row.title),
          extractionMethod: asText(row.extractionMethod),
          segmentIndex,
          rowIndex: asNumber(row.rowIndex, null),
          rank: asNumber(row.rank, null),
          teamName: asText(row.teamName),
          played: asNumber(row.played, null),
          points: asNumber(row.points, null),
          confidence: asNumber(row.confidence, 0),
          confidenceReasons: asArray(row.confidenceReasons).map(asText).filter(Boolean),
          evidenceText: asText(row.evidenceText),
          validationState: rejectionReasons.length ? "rejected_standings_evidence_row" : "validated_standings_evidence_row",
          validationReasons: rejectionReasons.length ? rejectionReasons : ["primary_segment_row_shape_valid"],
          standingsWriteAllowedNow: false,
          canonicalWrites: 0,
          productionWrite: false
        };

        if (rejectionReasons.length) {
          rejectedStandingsEvidenceRows.push(normalizedRow);
        } else {
          validatedStandingsEvidenceRows.push(normalizedRow);
        }
      }
    });
  }

  return {
    ok: true,
    job: "validate-standings-evidence-candidates-file",
    generatedAt: new Date().toISOString(),
    inputSummary: {
      sourceJob: asText(input.job),
      sourceGeneratedAt: asText(input.generatedAt),
      standingsEvidenceCandidateRowCount: evidenceRows.length
    },
    summary: {
      evidenceCandidateRowCount: evidenceRows.length,
      validatedStandingsEvidenceRowCount: validatedStandingsEvidenceRows.length,
      rejectedStandingsEvidenceRowCount: rejectedStandingsEvidenceRows.length,
      validationDiagnosticRowCount: validationDiagnosticRows.length,
      byValidatedLeague: countBy(validatedStandingsEvidenceRows, "missingLeagueSlug"),
      byRejectedLeague: countBy(rejectedStandingsEvidenceRows, "missingLeagueSlug"),
      byValidatedHostname: countBy(validatedStandingsEvidenceRows, "hostname"),
      byRejectedHostname: countBy(rejectedStandingsEvidenceRows, "hostname"),
      standingsWriteAllowedNowCount: 0,
      canonicalWrites: 0,
      productionWrite: false
    },
    validatedStandingsEvidenceRows,
    rejectedStandingsEvidenceRows,
    validationDiagnosticRows,
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
    productionWrite: false,
    selfTest: Boolean(options.selfTest)
  };
}

function selfTestInput() {
  return {
    ok: true,
    job: "extract-standings-evidence-from-source-snapshots-file",
    standingsEvidenceCandidateRows: [
      { snapshotId: "s1", missingLeagueSlug: "bel.2", hostname: "proleague.be", rank: 1, teamName: "SK Beveren", played: 32, points: 88, confidence: 98, rowIndex: 1, standingsWriteAllowedNow: false, canonicalWrites: 0, productionWrite: false },
      { snapshotId: "s1", missingLeagueSlug: "bel.2", hostname: "proleague.be", rank: 2, teamName: "KV Kortrijk", played: 32, points: 67, confidence: 98, rowIndex: 2, standingsWriteAllowedNow: false, canonicalWrites: 0, productionWrite: false },
      { snapshotId: "s1", missingLeagueSlug: "bel.2", hostname: "proleague.be", rank: 3, teamName: "K. Beerschot VA", played: 32, points: 64, confidence: 98, rowIndex: 3, standingsWriteAllowedNow: false, canonicalWrites: 0, productionWrite: false },
      { snapshotId: "s1", missingLeagueSlug: "bel.2", hostname: "proleague.be", rank: 4, teamName: "RFC Liège", played: 32, points: 53, confidence: 98, rowIndex: 4, standingsWriteAllowedNow: false, canonicalWrites: 0, productionWrite: false },
      { snapshotId: "s1", missingLeagueSlug: "bel.2", hostname: "proleague.be", rank: 1, teamName: "SK Beveren", played: 16, points: 40, confidence: 98, rowIndex: 5, standingsWriteAllowedNow: false, canonicalWrites: 0, productionWrite: false }
    ]
  };
}

async function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = buildReport(selfTestInput(), { selfTest: true });

    if (report.summary.validatedStandingsEvidenceRowCount !== 4) {
      throw new Error(`self-test expected 4 validated rows, got ${report.summary.validatedStandingsEvidenceRowCount}`);
    }

    if (report.summary.rejectedStandingsEvidenceRowCount !== 1) {
      throw new Error(`self-test expected 1 rejected row, got ${report.summary.rejectedStandingsEvidenceRowCount}`);
    }

    if (report.guarantees.noStandingsWrites !== true || report.guarantees.canonicalWrites !== 0) {
      throw new Error("self-test write guarantees failed");
    }

    console.log(JSON.stringify({
      ok: true,
      selfTest: "validate-standings-evidence-candidates-file",
      summary: report.summary,
      firstValidatedRow: report.validatedStandingsEvidenceRows[0],
      rejectedReasons: report.rejectedStandingsEvidenceRows.map((row) => row.validationReasons),
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  const input = readJson(args.input, "input");
  const outputPath = args.output || "data/football-truth/_diagnostics/same-prefix-missing-standings/validated-standings-evidence.json";
  const report = buildReport(input, args);
  const resolvedOutput = writeJson(outputPath, report);

  console.log(JSON.stringify({
    ok: true,
    output: path.relative(repoRoot, resolvedOutput).replace(/\\/g, "/"),
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    job: "validate-standings-evidence-candidates-file",
    error: error?.message || String(error),
    standingsWriteAllowedNow: false,
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
});