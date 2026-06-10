#!/usr/bin/env node
"use strict";

import fs from "fs";
import path from "path";

const JOB = "build-uefa-provider-normalized-fixture-evidence-file";

const DEFAULT_ALLOWED_SLUGS = new Set(["fin.1", "fin.2", "irl.1"]);

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function parseArgs(argv) {
  const args = {
    inputs: [],
    output: "",
    allowedSlugs: new Set(DEFAULT_ALLOWED_SLUGS),
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") {
      args.selfTest = true;
    } else if (arg === "--input") {
      args.inputs.push(argv[++i]);
    } else if (arg === "--output") {
      args.output = argv[++i];
    } else if (arg === "--allowed-slugs") {
      args.allowedSlugs = new Set(asText(argv[++i]).split(",").map((v) => v.trim()).filter(Boolean));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function slugOf(row) {
  return asText(
    row.competitionSlug ||
    row.competition ||
    row.leagueSlug ||
    row.slug ||
    row.competition_slug ||
    row.league ||
    row.leagueCode
  );
}

function dateOf(row) {
  const raw = asText(
    row.kickoffUtc ||
    row.startDateIso ||
    row.kickoff ||
    row.dateIso ||
    row.matchDateIso ||
    row.isoDate ||
    row.startTime ||
    row.date ||
    row.matchDate ||
    row.fixtureDate ||
    row.startDateRaw
  );

  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const time = asText(row.kickoffLocal || row.time || row.localTimeRaw);
    if (/^\d{1,2}:\d{2}/.test(time)) {
      const [hh, mm] = time.split(":");
      return `${raw}T${hh.padStart(2, "0")}:${mm.slice(0, 2)}:00`;
    }
    return `${raw}T00:00:00`;
  }

  return "";
}

function toUtcIso(rawDate) {
  const date = asText(rawDate);
  if (!date) return "";

  if (/Z$/.test(date)) return date;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/.test(date)) return `${date}Z`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(date)) return `${date}.000Z`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return `${date}T00:00:00.000Z`;

  return date;
}

function homeOf(row) {
  return asText(
    row.homeTeamName ||
    row.homeTeam ||
    row.home ||
    row.home_name ||
    row.homeTeamDisplayName ||
    row.teamHome ||
    row.homeTeamTitle
  );
}

function awayOf(row) {
  return asText(
    row.awayTeamName ||
    row.awayTeam ||
    row.away ||
    row.away_name ||
    row.awayTeamDisplayName ||
    row.teamAway ||
    row.awayTeamTitle
  );
}

function statusOf(row) {
  return asText(
    row.normalizedStatus ||
    row.status ||
    row.statusRaw ||
    row.matchStatus ||
    row.state ||
    row.rawStatus
  );
}

function sourceIdOf(row) {
  return asText(
    row.sourceMatchId ||
    row.matchId ||
    row.id ||
    row.fixtureId ||
    row.gameId ||
    row.sourceMatchNumber
  );
}

function scorePair(row) {
  const homeScore = row.homeTeamScore ?? row.homeScore ?? row.home_score ?? row.scoreHome ?? row.homeGoals ?? null;
  const awayScore = row.awayTeamScore ?? row.awayScore ?? row.away_score ?? row.scoreAway ?? row.awayGoals ?? null;
  return {
    homeScore: homeScore === "" ? null : homeScore,
    awayScore: awayScore === "" ? null : awayScore
  };
}

function sourceUrlFor(slug, row) {
  const explicit = asText(row.sourceUrl || row.finalUrl);
  if (explicit) return explicit;

  if (slug === "fin.1" || slug === "fin.2") return "https://tulospalvelu.palloliitto.fi/";
  if (slug === "irl.1") return "https://www.leagueofireland.ie/";

  return "";
}

function competitionNameFor(slug, row) {
  const explicit = asText(row.competitionName || row.leagueLabel || row.categoryName);
  if (explicit) return explicit;

  if (slug === "fin.1") return "Veikkausliiga";
  if (slug === "fin.2") return "Ykkösliiga";
  if (slug === "irl.1") return "League of Ireland Premier Division";

  return "";
}

function normalizeStatus(rawStatus, hasScore) {
  const s = asText(rawStatus).toLowerCase();

  if (/finished|played|result|complete|forfeited/.test(s)) return "FINISHED";
  if (/scheduled|fixture|planned|not.?started|upcoming/.test(s)) return "SCHEDULED";
  if (hasScore) return "FINISHED";

  return "SCHEDULED";
}

function outcomeStatusFor(normalizedStatus) {
  return normalizedStatus === "FINISHED" ? "FT" : "NS";
}

function collectObjects(value, sourcePath, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectObjects(item, sourcePath, out);
    return out;
  }

  if (value && typeof value === "object") {
    const slug = slugOf(value);
    const home = homeOf(value);
    const away = awayOf(value);
    const id = sourceIdOf(value);
    const status = statusOf(value);

    if (slug && (home || away || id || status)) {
      out.push({ sourcePath, row: value });
    }

    for (const child of Object.values(value)) collectObjects(child, sourcePath, out);
  }

  return out;
}

function dedupKey(row) {
  return [
    row.competitionSlug,
    row.sourceMatchId || "",
    row.kickoffUtc || "",
    row.homeTeam.toLowerCase(),
    row.awayTeam.toLowerCase(),
    row.status,
    row.scoreHome ?? "",
    row.scoreAway ?? ""
  ].join("::");
}

function toEvidenceRow(item, index) {
  const row = item.row;
  const slug = slugOf(row);
  const rawDate = dateOf(row);
  const kickoffUtc = toUtcIso(rawDate);
  const homeTeam = homeOf(row);
  const awayTeam = awayOf(row);
  const { homeScore, awayScore } = scorePair(row);
  const hasScore = homeScore !== null && awayScore !== null;
  const normalizedStatus = normalizeStatus(statusOf(row), hasScore);
  const sourceMatchId = sourceIdOf(row) || `${slug}::${rawDate}::${homeTeam}::${awayTeam}`;

  const sourceProvider = asText(row.sourceProvider || row.source || row.provider) ||
    (slug.startsWith("fin.") ? "palloliitto_torneopal" : "league_of_ireland_ajax");

  const sourceKind = asText(row.sourceKind || row.pageKind || row.diagnosticSource) ||
    (slug.startsWith("fin.") ? "official_torneopal_normalized_rows" : "official_loi_ajax_normalized_rows");

  return {
    evidenceRowId: `${slug}::${sourceProvider}::${sourceMatchId}::${String(index + 1).padStart(4, "0")}`,
    acceptedForEvidence: Boolean(slug && rawDate && homeTeam && awayTeam),
    sourceType: sourceKind,
    apiFamily: sourceProvider,
    apiCandidateId: sourceKind,
    leagueSlug: slug,
    competitionSlug: slug,
    competitionName: competitionNameFor(slug, row),
    matchId: sourceMatchId,
    status: normalizedStatus,
    kickoffDate: kickoffUtc.slice(0, 10),
    kickoffUtc,
    homeTeam,
    awayTeam,
    scoreHome: homeScore,
    scoreAway: awayScore,
    roundName: asText(row.roundName || row.phaseName || row.variantLabel),
    stadiumName: asText(row.venueName || row.venue || row.stadiumName),
    outcomeStatus: outcomeStatusFor(normalizedStatus),
    sourceProvider,
    sourceKind,
    sourceFamily: sourceProvider,
    sourceMatchId,
    sourceUrl: sourceUrlFor(slug, row),
    fetchedAt: asText(row.fetchedAt || row.generatedAt || row.lastModified),
    rawStatus: statusOf(row),
    canonicalWrites: 0,
    productionWrite: false
  };
}

function buildEvidence(inputs, allowedSlugs) {
  const candidates = [];

  for (const input of inputs) {
    const json = typeof input === "string" ? readJson(input) : input;
    const sourcePath = typeof input === "string" ? input : "<self-test>";
    candidates.push(...collectObjects(json, sourcePath));
  }

  const rows = [];
  const rejectedRows = [];
  const seen = new Set();

  for (const item of candidates) {
    const slug = slugOf(item.row);
    if (!allowedSlugs.has(slug)) continue;

    const row = toEvidenceRow(item, rows.length + rejectedRows.length);
    const key = dedupKey(row);

    if (!row.acceptedForEvidence) {
      rejectedRows.push({
        reason: "missing_required_fixture_fields",
        sourcePath: item.sourcePath,
        competitionSlug: slug,
        sample: {
          date: dateOf(item.row),
          homeTeam: homeOf(item.row),
          awayTeam: awayOf(item.row),
          status: statusOf(item.row)
        }
      });
      continue;
    }

    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }

  const byLeague = {};
  const byStatus = {};

  for (const row of rows) {
    byLeague[row.leagueSlug] = (byLeague[row.leagueSlug] || 0) + 1;
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
  }

  return {
    ok: true,
    job: JOB,
    generatedAt: new Date().toISOString(),
    mode: "read_only_provider_normalized_fixture_evidence",
    summary: {
      sourceInputCount: inputs.length,
      evidenceRowCount: rows.length,
      acceptedForEvidenceCount: rows.length,
      rejectedRowCount: rejectedRows.length,
      byLeague,
      byStatus,
      canonicalWrites: 0,
      productionWrite: false,
      noFetch: true,
      noSearch: true
    },
    rows,
    rejectedRows,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noSearch: true,
      noUrlFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function runSelfTest() {
  const sample = {
    rows: [
      {
        competitionSlug: "fin.1",
        sourceProvider: "palloliitto_torneopal",
        sourceMatchId: "f1",
        date: "2026-04-04T13:00:00",
        homeTeamName: "FC Inter",
        awayTeamName: "VPS",
        homeScore: 0,
        awayScore: 0,
        normalizedStatus: "finished",
        venueName: "Veritas Stadion"
      },
      {
        competitionSlug: "fin.2",
        sourceProvider: "palloliitto_torneopal",
        sourceMatchId: "f2",
        date: "2026-06-10T16:00:00",
        homeTeamName: "PK-35",
        awayTeamName: "EIF",
        normalizedStatus: "scheduled"
      },
      {
        competition: "irl.1",
        source: "loi_ajax",
        isoDate: "2026-06-12",
        homeTeam: "Derry City",
        awayTeam: "Bohemians",
        status: "scheduled",
        venue: "Find Insurance Celtic Park"
      },
      {
        competition: "irl.2",
        source: "loi_ajax",
        isoDate: "2026-05-29",
        homeTeam: "Bray Wanderers FC",
        awayTeam: "Wexford FC",
        status: "finished",
        homeScore: 4,
        awayScore: 0
      }
    ]
  };

  const report = buildEvidence([sample], DEFAULT_ALLOWED_SLUGS);

  const failures = [];
  if (report.summary.evidenceRowCount !== 3) failures.push(`evidenceRowCount:${report.summary.evidenceRowCount}`);
  if (report.summary.byLeague["fin.1"] !== 1) failures.push("fin.1_count");
  if (report.summary.byLeague["fin.2"] !== 1) failures.push("fin.2_count");
  if (report.summary.byLeague["irl.1"] !== 1) failures.push("irl.1_count");
  if (report.summary.byLeague["irl.2"]) failures.push("irl.2_should_be_excluded");
  if (report.summary.canonicalWrites !== 0) failures.push("canonicalWrites_nonzero");
  if (report.summary.productionWrite !== false) failures.push("productionWrite_not_false");

  if (failures.length) {
    console.error(JSON.stringify({ ok: false, failures, report: report.summary }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({
    ok: true,
    selfTest: JOB,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.selfTest) {
    runSelfTest();
    return;
  }

  if (!args.inputs.length) throw new Error("Missing --input");
  if (!args.output) throw new Error("Missing --output");

  const report = buildEvidence(args.inputs, args.allowedSlugs);
  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();
