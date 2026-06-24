#!/usr/bin/env node

import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    output: "",
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++i] || "";
    else if (arg.startsWith("--input=")) args.input = arg.slice("--input=".length);
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else throw new Error("unknown argument: " + arg);
  }

  if (!args.selfTest && !args.input) throw new Error("--input is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");

  return args;
}

function rowsOf(json) {
  if (Array.isArray(json)) return json;
  for (const key of ["fetchedSourceSnapshots", "snapshots", "sourceSnapshots", "rows", "items"]) {
    if (Array.isArray(json && json[key])) return json[key];
  }
  return [];
}

function urlOf(row) {
  return asText(row.finalUrl || row.resolvedUrl || row.candidateUrl || row.url || row.href);
}

function hostOf(row) {
  const existing = asText(row.hostname || row.host);
  if (existing) return existing.toLowerCase().replace(/^www\./, "");
  try {
    return new URL(urlOf(row)).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function statusOf(row) {
  const value = row?.http?.status ?? row?.status ?? row?.statusCode ?? row?.httpStatus;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function textOf(row) {
  return [
    row?.http?.text,
    row?.http?.body,
    row?.rawText,
    row?.text,
    row?.plainText,
    row?.bodyText,
    row?.body,
    row?.html,
    row?.sourceTitle,
    row?.title,
    urlOf(row)
  ].map(asText).filter(Boolean).join("\n");
}

function compactText(value) {
  return asText(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function competitionSlugOf(row) {
  return asText(row.competitionSlug || row.leagueSlug || row.slug);
}

function taskTypeOf(row) {
  return asText(row.taskType || row.fetchPurpose || row.validationIntent);
}

function evidenceKindOf(row) {
  return asText(row.evidenceKind);
}

function sourceTypeOf(host) {
  if (host.endsWith("uefa.com")) return "official_uefa";
  if (host.endsWith("the-afc.com")) return "official_afc";
  if (host.endsWith("cafonline.com") || host.endsWith("cafonline.com.ng")) return "official_caf";
  if (host.endsWith("concacaf.com")) return "official_concacaf";
  if (host.endsWith("conmebol.com")) return "official_conmebol";
  if (host.endsWith("fifa.com")) return "official_fifa";
  return "other_source";
}

function findMatches(text, regex, limit = 12) {
  const out = [];
  const value = asText(text);
  let match;
  const re = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");

  while ((match = re.exec(value)) && out.length < limit) {
    out.push(match[0]);
  }

  return [...new Set(out)];
}

function detectSignals({ row, text }) {
  const lower = text.toLowerCase();
  const url = urlOf(row).toLowerCase();
  const taskType = taskTypeOf(row);
  const evidenceKind = evidenceKindOf(row);
  const host = hostOf(row);

  const signals = [];
  const dates = [];
  const rounds = [];

  function addSignal(condition, signal) {
    if (condition && !signals.includes(signal)) signals.push(signal);
  }

  const sourceTitle = asText(row.sourceTitle || row.title).toLowerCase();

  const finalPageUrl =
    /(?:^|[_/-])final(?:[_/-]|$)/i.test(url) ||
    /_final\b/i.test(url) ||
    /\bfinal\b/i.test(sourceTitle);

  const finalResultTerms =
    /\b(?:winner|champion|champions|won|beat|defeated|defeat|score|result|penalt(?:y|ies)|extra time|aet|after extra time|final score|match report|report)\b/i.test(lower);

  const finalStructureTerms =
    /\b(?:v|vs|versus)\b/i.test(lower) ||
    /\b\d+\s*[-–]\s*\d+\b/.test(lower) ||
    /\b(?:penalt(?:y|ies)|extra time|aet|final score)\b/i.test(lower);

  const genericLandingOrFeed =
    /\/home\.html(?:$|[?#])/i.test(url) ||
    /landing page/i.test(lower) ||
    /vote for your assist of the season/i.test(lower) ||
    /assist of the season/i.test(lower) ||
    /goals of extraordinary quality/i.test(lower) ||
    /newsletter|photo gallery|photos?|video|highlights|latest news/i.test(lower) && !finalPageUrl && !finalStructureTerms;

  const specificFinalWinnerStructure =
    finalPageUrl ||
    (/\bfinal\b/i.test(lower) && finalResultTerms && finalStructureTerms) ||
    (/\bchampion(?:s)?\b/i.test(lower) && /\b(?:won|beat|defeated|winner|final score|result)\b/i.test(lower));

  addSignal(/2025\/26|2025-26|2025 26|2025–26|2024\/25|2024-25|2024 25|2024–25|2026|2025/.test(lower) || /2025-26|2024-25|2026|2025/.test(url), "season_marker");
  addSignal(/fixture|fixtures|schedule|calendar|dates|matchday|key dates/.test(lower) || /fixtures-results/.test(url), "calendar_or_fixture_marker");
  addSignal(/qualifying|qualifier|preliminary round|first qualifying|second qualifying|third qualifying|play-off|playoff/.test(lower) || /qualifying/.test(url), "qualifying_round_marker");
  addSignal(/draw|draws/.test(lower) || /draw/.test(url), "draw_marker");
  addSignal(/\bfinal\b/.test(lower) || /\bfinal\b/.test(url), "final_marker");
  addSignal(/winner|champion|champions|title holder|holders|won the|defeated|beat/.test(lower), "winner_or_champion_marker");
  addSignal(/format|teams|league phase|competition format/.test(lower), "format_marker");
  addSignal(finalPageUrl, "final_page_url_marker");
  addSignal(specificFinalWinnerStructure, "specific_final_winner_structure_marker");
  addSignal(genericLandingOrFeed, "generic_landing_or_news_feed_marker");
  addSignal(host.endsWith("uefa.com"), "official_uefa_source");
  addSignal(host.endsWith("the-afc.com"), "official_afc_source");

  for (const value of findMatches(text, /\b(?:\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+20\d{2}|\d{1,2}\/\d{1,2}\/20\d{2}|20\d{2}-\d{2}-\d{2})\b/gi, 20)) {
    dates.push(value);
  }

  for (const value of findMatches(text, /\b(?:preliminary round|first qualifying round|second qualifying round|third qualifying round|play-off round|playoff round|league phase|knockout phase|round of 16|quarter-finals?|semi-finals?|final)\b/gi, 20)) {
    rounds.push(value);
  }

  let evidenceState = "needs_more_competition_state_evidence";
  let evidenceType = "competition_state_evidence";
  let confidence = "low";

  const isWinnerOrFinalTask =
    evidenceKind === "winner" ||
    evidenceKind === "winner_or_final_evidence" ||
    taskType.includes("winner_final") ||
    taskType.includes("winner") ||
    taskType.includes("final");

  const isExplicitQualifierCalendarTask =
    taskType === "uefa_qualifier_calendar_search" ||
    taskType.includes("qualifier_calendar");

  if (isExplicitQualifierCalendarTask || (!isWinnerOrFinalTask && signals.includes("qualifying_round_marker"))) {
    evidenceType = "qualifier_calendar_evidence";
    if (signals.includes("official_uefa_source") && signals.includes("qualifying_round_marker") && signals.includes("calendar_or_fixture_marker")) {
      evidenceState = "candidate_qualifier_calendar_evidence_needs_validation";
      confidence = dates.length > 0 || rounds.length > 0 ? "high" : "medium";
    } else if (signals.includes("qualifying_round_marker") && signals.includes("season_marker")) {
      evidenceState = "candidate_qualifier_calendar_evidence_needs_validation";
      confidence = sourceTypeOf(host).startsWith("official_") ? "medium" : "low";
    }
  } else if (isWinnerOrFinalTask || signals.includes("winner_or_champion_marker") || signals.includes("final_page_url_marker")) {
    evidenceType = "winner_or_final_evidence";

    if (signals.includes("generic_landing_or_news_feed_marker")) {
      evidenceState = "needs_more_specific_final_winner_evidence";
      confidence = "low";
    } else if (signals.includes("specific_final_winner_structure_marker") && (signals.includes("winner_or_champion_marker") || signals.includes("final_marker"))) {
      evidenceState = "candidate_winner_or_final_evidence_needs_validation";
      confidence = sourceTypeOf(host).startsWith("official_") ? "high" : "medium";
    } else if (signals.includes("winner_or_champion_marker") && signals.includes("season_marker") && signals.includes("final_marker")) {
      evidenceState = "candidate_winner_or_final_evidence_needs_validation";
      confidence = sourceTypeOf(host).startsWith("official_") ? "medium" : "low";
    } else {
      evidenceState = "needs_more_specific_final_winner_evidence";
      confidence = "low";
    }
  } else if (signals.includes("calendar_or_fixture_marker")) {
    evidenceType = "calendar_or_start_date_evidence";
    evidenceState = "candidate_calendar_or_start_date_evidence_needs_validation";
    confidence = sourceTypeOf(host).startsWith("official_") ? "high" : "medium";
  } else if (signals.includes("format_marker") || signals.includes("season_marker")) {
    evidenceType = "competition_format_or_season_marker_evidence";
    evidenceState = "candidate_competition_state_context_needs_validation";
    confidence = sourceTypeOf(host).startsWith("official_") ? "medium" : "low";
  }

  return {
    evidenceType,
    evidenceState,
    confidence,
    signals,
    extractedDateMentions: dates,
    extractedRoundMentions: rounds
  };
}
function excerptAroundSignals(text) {
  const clean = compactText(text);
  if (!clean) return "";
  const lower = clean.toLowerCase();
  const markers = ["qualifying", "fixtures", "dates", "calendar", "draw", "winner", "champion", "final", "2025/26", "2025-26", "2026"];
  let idx = -1;

  for (const marker of markers) {
    idx = lower.indexOf(marker);
    if (idx >= 0) break;
  }

  if (idx < 0) return clean.slice(0, 700);

  const start = Math.max(0, idx - 220);
  const end = Math.min(clean.length, idx + 700);
  return clean.slice(start, end);
}

function extractRow(row) {
  const status = statusOf(row);
  const host = hostOf(row);
  const text = textOf(row);
  const clean = compactText(text);
  const signals = detectSignals({ row, text: clean });

  let extractionState = signals.evidenceState;
  if (status < 200 || status >= 400) extractionState = "rejected_http_status";
  else if (!clean) extractionState = "rejected_empty_snapshot_text";

  return {
    sourceSnapshotId: asText(row.snapshotId || row.sourceSnapshotId || row.searchTargetId || row.taskId || urlOf(row)),
    searchTargetId: asText(row.searchTargetId || row.sourceSearchTargetId),
    leagueSlug: asText(row.leagueSlug || row.competitionSlug),
    competitionSlug: competitionSlugOf(row),
    competitionName: asText(row.competitionName || row.name),
    taskType: taskTypeOf(row),
    evidenceKind: evidenceKindOf(row),
    validationIntent: asText(row.validationIntent),
    hostname: host,
    sourceType: sourceTypeOf(host),
    resolvedUrl: asText(row.resolvedUrl || row.candidateUrl || row.url),
    finalUrl: asText(row.finalUrl || row.resolvedUrl || row.candidateUrl || row.url),
    status,
    contentType: asText(row.contentType || row?.http?.contentType),
    evidenceType: signals.evidenceType,
    evidenceState: extractionState,
    evidenceConfidence: signals.confidence,
    signals: signals.signals,
    extractedDateMentions: signals.extractedDateMentions,
    extractedRoundMentions: signals.extractedRoundMentions,
    evidenceExcerpt: excerptAroundSignals(clean),
    textLength: clean.length,
    sourceFetch: false,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = asText(typeof key === "function" ? key(row) : row[key]) || "unknown";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function buildReport(input, inputPath = "") {
  const snapshots = rowsOf(input);
  const evidenceRows = snapshots.map(extractRow);
  const candidateRows = evidenceRows.filter((row) => row.evidenceState.startsWith("candidate_"));

  return {
    ok: true,
    job: "extract-coverage-competition-state-evidence-from-source-snapshots-file",
    generatedAt: new Date().toISOString(),
    inputPath,
    summary: {
      inputSnapshotCount: snapshots.length,
      evidenceRowCount: evidenceRows.length,
      candidateEvidenceRowCount: candidateRows.length,
      rejectedRowCount: evidenceRows.length - candidateRows.length,
      byEvidenceState: countBy(evidenceRows, "evidenceState"),
      byEvidenceType: countBy(evidenceRows, "evidenceType"),
      byCompetition: countBy(evidenceRows, (row) => row.competitionSlug || row.leagueSlug),
      byHost: countBy(evidenceRows, "hostname"),
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    competitionStateEvidenceRows: evidenceRows,
    candidateCompetitionStateEvidenceRows: candidateRows,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyProvidedFetchedSnapshots: true,
      noReviewDecisionApplied: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function runSelfTest() {
  const input = {
    fetchedSourceSnapshots: [
      {
        leagueSlug: "uefa.champions",
        hostname: "www.uefa.com",
        resolvedUrl: "https://www.uefa.com/uefachampionsleague/news/test",
        finalUrl: "https://www.uefa.com/uefachampionsleague/news/test",
        status: 200,
        contentType: "text/html",
        taskType: "uefa_qualifier_calendar_search",
        evidenceKind: "calendar",
        rawText: "2025/26 Champions League qualifying fixtures dates draw final. First qualifying round dates 8 July 2025."
      },
      {
        leagueSlug: "afc.champions",
        hostname: "en.wikipedia.org",
        resolvedUrl: "https://en.wikipedia.org/wiki/2025_AFC_Champions_League_Elite_final",
        finalUrl: "https://en.wikipedia.org/wiki/2025_AFC_Champions_League_Elite_final",
        status: 200,
        contentType: "text/html",
        sourceTitle: "2025 AFC Champions League Elite final - Wikipedia",
        taskType: "winner_final_specific_second_source_search",
        evidenceKind: "winner_or_final_evidence",
        rawText: "2025 AFC Champions League Elite final was contested by Al-Ahli and Kawasaki Frontale. Al-Ahli won 2-0 and became champions."
      },
      {
        leagueSlug: "afc.champions",
        hostname: "www.the-afc.com",
        resolvedUrl: "https://www.the-afc.com/en/club/afc_champions_league_elite/home.html",
        finalUrl: "https://www.the-afc.com/en/club/afc_champions_league_elite/home.html",
        status: 200,
        contentType: "text/html",
        taskType: "winner_final_specific_second_source_search",
        evidenceKind: "winner_or_final_evidence",
        rawText: "AFC Champions League Elite Landing Page. Vote for your Assist of the Season. Latest news and photo gallery."
      },
      {
        leagueSlug: "bad.example",
        hostname: "example.com",
        resolvedUrl: "https://example.com/missing",
        status: 404,
        rawText: "Not found"
      }
    ]
  };

  const report = buildReport(input, "self-test");

  if (report.summary.inputSnapshotCount !== 4) throw new Error("expected four snapshots");
  if (report.summary.candidateEvidenceRowCount !== 2) throw new Error("expected two candidate evidence rows");
  if (!report.summary.byEvidenceState.candidate_qualifier_calendar_evidence_needs_validation) throw new Error("expected qualifier evidence candidate");
  if (!report.summary.byEvidenceState.candidate_winner_or_final_evidence_needs_validation) throw new Error("expected winner/final evidence candidate");
  if (!report.summary.byEvidenceState.needs_more_specific_final_winner_evidence) throw new Error("expected generic landing to need more specific final/winner evidence");
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) throw new Error("read-only guarantees failed");

  return {
    ok: true,
    selfTest: "extract-coverage-competition-state-evidence-from-source-snapshots-file",
    summary: report.summary
  };
}
function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const input = readJson(args.input);
  const report = buildReport(input, args.input);
  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: path.relative(repoRoot, args.output).replace(/\\/g, "/"),
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

if (path.resolve(process.argv[1] || "") === __filename) {
  main();
}

export { buildReport, extractRow };