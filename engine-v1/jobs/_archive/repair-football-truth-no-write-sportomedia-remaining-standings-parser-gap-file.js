#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const DEFAULTS = {
  date: "2026-06-14",
  repairInput: "data/football-truth/_diagnostics/no-write-family-structured-stats-parser-normalizer-route-specific-standings-repair-2026-06-14/no-write-family-structured-stats-parser-normalizer-route-specific-standings-repair-2026-06-14.json",
  snapshotInput: "data/football-truth/_diagnostics/final-explicit-scoped-controlled-route-acquisition-run-2026-06-14/final-explicit-scoped-controlled-route-acquisition-run-2026-06-14.json",
  output: "data/football-truth/_diagnostics/no-write-sportomedia-remaining-standings-parser-gap-2026-06-14/no-write-sportomedia-remaining-standings-parser-gap-2026-06-14.json"
};

const SPORTOMEDIA_SLUGS = ["swe.1", "swe.2"];

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--repair-input") args.repairInput = argv[++i];
    else if (arg === "--snapshot-input") args.snapshotInput = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error("Unknown argument: " + arg);
  }
  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error("Missing JSON input: " + filePath);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function uniqueSorted(values) {
  return [...new Set(values.filter((v) => v !== null && v !== undefined).map((v) => String(v).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value = row[key] === null || row[key] === undefined || String(row[key]).trim() === "" ? "__missing__" : String(row[key]).trim();
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function assertSummary(summary, key, expected) {
  if (!(key in summary)) throw new Error("Missing summary key: " + key);
  if (summary[key] !== expected) throw new Error("Guardrail failed for " + key + ": expected " + expected + ", got " + summary[key]);
}

function validateRepairRun(input) {
  const s = input.summary || {};
  assertSummary(s, "routeSpecificStandingsRepairCompetitionCount", 6);
  assertSummary(s, "routeSpecificStandingsRepairReadyCount", 4);
  assertSummary(s, "routeSpecificStandingsRepairStillNeedsRepairCount", 2);
  assertSummary(s, "sportomediaRouteSpecificRepairTargetCount", 2);
  assertSummary(s, "qualityGateReadyForClassifierCount", 0);
  assertSummary(s, "qualityGateReadyForCanonicalWriteCount", 0);
  assertSummary(s, "qualityGateReadyForTruthAssertionCount", 0);
  assertSummary(s, "fetchExecutedNowCount", 0);
  assertSummary(s, "searchExecutedNowCount", 0);
  assertSummary(s, "broadSearchExecutedNowCount", 0);
  assertSummary(s, "classifierExecutedNowCount", 0);
  assertSummary(s, "canonicalWriteExecutedNowCount", 0);
  assertSummary(s, "productionWriteExecutedNowCount", 0);
  assertSummary(s, "activeAssertedCount", 0);
  assertSummary(s, "inactiveAssertedCount", 0);
  assertSummary(s, "completedAssertedCount", 0);
  assertSummary(s, "seasonStateTruthAssertedCount", 0);
  assertSummary(s, "rowLevelStatsExtractionTruthCount", 0);
  assertSummary(s, "repairedRowsTruthCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  assertSummary(s, "productionWrite", false);

  const rows = Array.isArray(input.repairedRows) ? input.repairedRows : [];
  if (rows.length !== 6) throw new Error("Expected 6 repairedRows.");

  const stillRepair = rows.filter((row) => row.repairedParserNormalizerStatus !== "ready_for_no_write_repaired_family_parser_quality_gate");
  const slugs = uniqueSorted(stillRepair.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(SPORTOMEDIA_SLUGS)) {
    throw new Error("Expected only swe.1/swe.2 remaining repair rows, got: " + slugs.join(", "));
  }

  return rows;
}

function validateSnapshots(input) {
  const s = input.summary || {};
  assertSummary(s, "finalScopedControlledRouteAcquisitionRunCompetitionCount", 6);
  assertSummary(s, "finalScopedControlledRouteAcquisitionRunTargetCount", 18);
  assertSummary(s, "fetchedSourceSnapshotCount", 18);
  assertSummary(s, "fetchedOkSnapshotCount", 18);
  assertSummary(s, "searchExecutedCount", 0);
  assertSummary(s, "broadSearchExecutedCount", 0);
  assertSummary(s, "classifierExecutedCount", 0);
  assertSummary(s, "canonicalWriteExecutedCount", 0);
  assertSummary(s, "productionWriteExecutedCount", 0);
  assertSummary(s, "seasonStateTruthAssertedCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  assertSummary(s, "productionWrite", false);

  const rows = Array.isArray(input.fetchedSourceSnapshots) ? input.fetchedSourceSnapshots : [];
  if (rows.length !== 18) throw new Error("Expected 18 fetchedSourceSnapshots.");

  for (const row of rows) {
    if (row.fetchStatus !== "fetched_ok" || row.status !== 200 || row.ok !== true) {
      throw new Error(row.competitionSlug + " " + row.routeKind + ": snapshot must be fetched_ok HTTP 200.");
    }
  }

  return rows;
}

function getRaw(snapshot) {
  return String(snapshot.rawText || snapshot.text || snapshot.body || snapshot.textPreview || "");
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&aring;/gi, "å")
    .replace(/&auml;/gi, "ä")
    .replace(/&ouml;/gi, "ö")
    .replace(/&Aring;/g, "Å")
    .replace(/&Auml;/g, "Ä")
    .replace(/&Ouml;/g, "Ö");
}

function stripHtml(raw) {
  return decodeEntities(raw)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlToLines(raw) {
  return decodeEntities(raw)
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<(?:tr|li|article|section|div|p|span|td|th|br)\b[^>]*>/gi, "\n")
    .replace(/<\/(?:tr|li|article|section|div|p|span|td|th)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function maybeDecodeBase64(value) {
  const s = String(value || "").trim();
  if (s.length < 80 || s.length > 800000) return null;
  if (!/^[A-Za-z0-9+/=_-]+$/.test(s)) return null;

  try {
    const normalized = s.replace(/-/g, "+").replace(/_/g, "/");
    const buffer = Buffer.from(normalized, "base64");
    const decoded = buffer.toString("utf8");
    if (/(standing|standings|team|club|points|played|poäng|tabell|__typename|match|table)/i.test(decoded)) return decoded;

    try {
      const inflated = zlib.inflateSync(buffer).toString("utf8");
      if (/(standing|standings|team|club|points|played|poäng|tabell|__typename|match|table)/i.test(inflated)) return inflated;
    } catch {
      // not deflated
    }
  } catch {
    return null;
  }

  return null;
}

function extractPotentialPayloads(raw) {
  const payloads = [];

  const decodedRaw = decodeEntities(raw);
  payloads.push({ source: "raw_html_decoded", text: decodedRaw });
  payloads.push({ source: "plain_text", text: stripHtml(raw) });

  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch;
  let scriptIndex = 0;

  while ((scriptMatch = scriptRegex.exec(String(raw || ""))) !== null && payloads.length < 200) {
    const body = decodeEntities(String(scriptMatch[1] || "").trim());
    if (!body) continue;
    payloads.push({ source: `script_${scriptIndex}`, text: body });

    const quotedJsonMatches = body.match(/"(?:\\.|[^"\\]){80,}"/g) || [];
    for (const quoted of quotedJsonMatches.slice(0, 40)) {
      try {
        const unquoted = JSON.parse(quoted);
        if (typeof unquoted === "string" && /(standing|standings|team|club|points|played|poäng|tabell|__typename|match|table)/i.test(unquoted)) {
          payloads.push({ source: `script_${scriptIndex}_json_string`, text: unquoted });
        }
      } catch {
        // ignore non-json string
      }
    }

    const base64Matches = body.match(/[A-Za-z0-9+/=_-]{100,}/g) || [];
    for (const candidate of base64Matches.slice(0, 30)) {
      const decoded = maybeDecodeBase64(candidate);
      if (decoded) payloads.push({ source: `script_${scriptIndex}_base64`, text: decoded });
    }

    scriptIndex += 1;
  }

  const attrMatches = decodedRaw.match(/(?:data-[a-z0-9_-]+|props|state)=["']([^"']{80,})["']/gi) || [];
  for (const attr of attrMatches.slice(0, 80)) {
    const idx = attr.indexOf("=");
    const text = decodeEntities(attr.slice(idx + 1).replace(/^["']|["']$/g, ""));
    if (/(standing|standings|team|club|points|played|poäng|tabell|__typename|match|table)/i.test(text)) {
      payloads.push({ source: "data_attribute_payload", text });
    }
  }

  return payloads.filter((payload) => payload.text && payload.text.length > 20).slice(0, 240);
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractBalancedJsonCandidates(text) {
  const candidates = [];
  const s = String(text || "");
  const starts = [];

  for (let i = 0; i < s.length && starts.length < 400; i += 1) {
    const char = s[i];
    if (char === "{" || char === "[") starts.push(i);
  }

  for (const start of starts) {
    const open = s[start];
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = start; i < Math.min(s.length, start + 500000); i += 1) {
      const char = s[i];

      if (inString) {
        if (escape) {
          escape = false;
        } else if (char === "\\") {
          escape = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') inString = true;
      else if (char === open) depth += 1;
      else if (char === close) depth -= 1;

      if (depth === 0) {
        const candidate = s.slice(start, i + 1);
        if (candidate.length > 20 && /(standing|standings|team|club|points|played|poäng|poang|tabell|table|__typename)/i.test(candidate)) {
          candidates.push(candidate);
        }
        break;
      }
    }

    if (candidates.length >= 120) break;
  }

  return candidates;
}

function objectName(value) {
  if (!value || typeof value !== "object") return null;
  return value.name || value.fullName || value.shortName || value.displayName || value.teamName || value.clubName || value.title || value.abbreviation || value.translations?.sv || value.translations?.en || null;
}

function lowerObject(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj || {})) out[String(key).toLowerCase()] = value;
  return out;
}

function numberValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = String(value).trim().replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/.test(s)) return null;
  return Number(s);
}

function collectStandingRowsFromObject(value, meta, out = [], depth = 0) {
  if (out.length >= 200 || depth > 18 || value === null || value === undefined) return out;

  if (Array.isArray(value)) {
    for (const item of value) collectStandingRowsFromObject(item, meta, out, depth + 1);
    return out;
  }

  if (typeof value !== "object") return out;

  const keys = lowerObject(value);
  const keyNames = Object.keys(keys).join(" ");

  const possibleTeamObjects = [
    value.team,
    value.club,
    value.contestant,
    value.competitor,
    value.participant,
    value.squad,
    value.organization,
    value.entity,
    value
  ];

  const teamName = possibleTeamObjects.map(objectName).find(Boolean);

  const statContainers = [
    value.stats,
    value.statistics,
    value.standing,
    value.table,
    value.record,
    value.total,
    value.overall,
    value.summary,
    value
  ].filter(Boolean);

  let best = {};
  for (const container of statContainers) {
    if (typeof container !== "object") continue;
    const c = lowerObject(container);
    best = { ...best, ...c };
  }

  const position = numberValue(best.position ?? best.rank ?? best.pos ?? best.place ?? keys.position ?? keys.rank);
  const played = numberValue(best.played ?? best.matchesplayed ?? best.gamesplayed ?? best.matches ?? best.p ?? best.spelade ?? best.gp ?? keys.played);
  const wins = numberValue(best.wins ?? best.won ?? best.w ?? best.vunna ?? keys.wins);
  const draws = numberValue(best.draws ?? best.drawn ?? best.d ?? best.oavgjorda ?? keys.draws);
  const losses = numberValue(best.losses ?? best.lost ?? best.l ?? best.förlorade ?? best.forlorade ?? keys.losses);
  const goalsFor = numberValue(best.goalsfor ?? best.gf ?? best.scored ?? best.for ?? best.goals_for ?? keys.goalsfor);
  const goalsAgainst = numberValue(best.goalsagainst ?? best.ga ?? best.conceded ?? best.against ?? best.goals_against ?? keys.goalsagainst);
  const goalDifference = numberValue(best.goaldifference ?? best.goaldiff ?? best.gd ?? best.diff ?? best.målskillnad ?? best.malskillnad ?? keys.goaldifference);
  const points = numberValue(best.points ?? best.pts ?? best.poäng ?? best.poang ?? keys.points ?? keys.pts);

  const standingSignal =
    /(standing|standings|table|rank|position|points|pts|played|matches|wins|draws|losses|poäng|poang|spelade|tabell|team|club|contestant|competitor)/i.test(keyNames);

  if (teamName && standingSignal && (points !== null || played !== null || position !== null)) {
    out.push({
      parser: meta.parser,
      competitionSlug: meta.competitionSlug,
      reusableFamily: meta.reusableFamily,
      routeKind: meta.routeKind,
      sourceUrl: meta.sourceUrl,
      finalUrl: meta.finalUrl,
      teamName: String(teamName),
      positionCandidate: position,
      playedCandidate: played,
      winsCandidate: wins,
      drawsCandidate: draws,
      lossesCandidate: losses,
      goalsForCandidate: goalsFor,
      goalsAgainstCandidate: goalsAgainst,
      goalDifferenceCandidate: goalDifference,
      pointsCandidate: points,
      normalizedRowIsTruth: false
    });
  }

  for (const child of Object.values(value)) {
    if (child && typeof child === "object") collectStandingRowsFromObject(child, meta, out, depth + 1);
  }

  return out;
}

function isBadTeamName(value) {
  return /^(pos|position|rank|team|club|lag|played|points|pts|p|v|o|f|m|gm|insläppta|målskillnad|form|next|home|away|total|all|tabell|tabellen)$/i.test(String(value).trim());
}

function cleanTeamName(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^[\.\-\–\|\:\s]+/, "")
    .replace(/[\.\-\–\|\:\s]+$/, "")
    .trim();
}

function parseTextWindowRows(text, meta) {
  const lines = String(text || "")
    .split(/\n+|(?<=\d)\s{2,}|(?<=\D)\s{3,}/)
    .flatMap((line) => {
      const normalized = line.replace(/\s+/g, " ").trim();
      const out = [normalized];
      const splitByPosition = normalized.split(/(?=\b(?:[1-9]|1[0-9]|2[0-9])\s+[A-ZÅÄÖa-zåäö])/g).map((x) => x.trim()).filter(Boolean);
      if (splitByPosition.length > 1) out.push(...splitByPosition);
      return out;
    })
    .filter(Boolean);

  const windows = [];
  for (let i = 0; i < lines.length; i += 1) {
    windows.push(lines[i]);
    if (i + 1 < lines.length) windows.push(lines[i] + " " + lines[i + 1]);
    if (i + 2 < lines.length) windows.push(lines[i] + " " + lines[i + 1] + " " + lines[i + 2]);
  }

  const rows = [];
  const patterns = [
    /(?:^|\s)(?<position>[1-9]|1[0-9]|2[0-9])\s+(?<team>[A-Za-zÅÄÖåäöÀ-ÖØ-öø-ÿ0-9\.' ]{2,64}?)\s+(?<played>\d{1,2})\s+(?<wins>\d{1,2})\s+(?<draws>\d{1,2})\s+(?<losses>\d{1,2})\s+(?<gf>\d{1,3})\s*[-–:]\s*(?<ga>\d{1,3})\s+(?<points>\d{1,3})(?:\s|$)/g,
    /(?:^|\s)(?<position>[1-9]|1[0-9]|2[0-9])\s+(?<team>[A-Za-zÅÄÖåäöÀ-ÖØ-öø-ÿ0-9\.' ]{2,64}?)\s+(?<played>\d{1,2})\s+(?<wins>\d{1,2})\s+(?<draws>\d{1,2})\s+(?<losses>\d{1,2})\s+(?<gf>\d{1,3})\s+(?<ga>\d{1,3})\s+(?<gd>[+-]?\d{1,3})\s+(?<points>\d{1,3})(?:\s|$)/g,
    /(?<team>[A-ZÅÄÖ][A-Za-zÅÄÖåäöÀ-ÖØ-öø-ÿ0-9\.' ]{2,64}?)\s+(?<played>\d{1,2})\s+(?<wins>\d{1,2})\s+(?<draws>\d{1,2})\s+(?<losses>\d{1,2})\s+(?<points>\d{1,3})(?:\s|$)/g
  ];

  for (const window of windows) {
    for (const pattern of patterns) {
      const re = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = re.exec(window)) !== null) {
        const groups = match.groups || {};
        const teamName = cleanTeamName(groups.team);
        if (!teamName || isBadTeamName(teamName) || teamName.length > 70) continue;

        const played = numberValue(groups.played);
        const points = numberValue(groups.points);
        if (played === null || points === null) continue;
        if (played < 0 || played > 60 || points < 0 || points > 160) continue;

        rows.push({
          parser: meta.parser,
          competitionSlug: meta.competitionSlug,
          reusableFamily: meta.reusableFamily,
          routeKind: meta.routeKind,
          sourceUrl: meta.sourceUrl,
          finalUrl: meta.finalUrl,
          teamName,
          positionCandidate: groups.position ? numberValue(groups.position) : null,
          playedCandidate: played,
          winsCandidate: numberValue(groups.wins),
          drawsCandidate: numberValue(groups.draws),
          lossesCandidate: numberValue(groups.losses),
          goalsForCandidate: numberValue(groups.gf),
          goalsAgainstCandidate: numberValue(groups.ga),
          goalDifferenceCandidate: numberValue(groups.gd),
          pointsCandidate: points,
          rawLine: window.slice(0, 260),
          normalizedRowIsTruth: false
        });
      }
    }
  }

  return rows;
}

function dedupeStandingRows(rows) {
  const seen = new Set();
  const out = [];

  for (const row of rows) {
    const key = [
      row.competitionSlug,
      row.teamName,
      row.positionCandidate ?? "",
      row.playedCandidate ?? "",
      row.pointsCandidate ?? ""
    ].join("|").toLowerCase();

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= 100) break;
  }

  return out;
}

function extractSportomediaStandingRows(snapshot) {
  const raw = getRaw(snapshot);
  const metaBase = {
    competitionSlug: snapshot.competitionSlug,
    reusableFamily: snapshot.reusableFamily,
    routeKind: snapshot.routeKind,
    sourceUrl: snapshot.sourceUrl,
    finalUrl: snapshot.finalUrl
  };

  const payloads = extractPotentialPayloads(raw);
  const jsonRows = [];

  for (const payload of payloads) {
    const candidates = extractBalancedJsonCandidates(payload.text);
    for (const candidate of candidates.slice(0, 80)) {
      const parsed = safeJsonParse(candidate);
      if (!parsed) continue;
      collectStandingRowsFromObject(parsed, {
        ...metaBase,
        parser: "sportomedia_deep_payload_json_standings_parser"
      }, jsonRows);
    }
  }

  const textRows = [];
  const plain = stripHtml(raw);
  const lines = htmlToLines(raw).join("\n");
  const keywordWindows = [];

  for (const sourceText of [plain, lines, ...payloads.map((p) => p.text).slice(0, 50)]) {
    const lower = sourceText.toLowerCase();
    for (const keyword of ["tabell", "tabellen", "poäng", "poang", "spelade", "vunna", "oavgjorda", "förlorade", "forlorade", "målskillnad", "malskillnad"]) {
      let index = lower.indexOf(keyword);
      while (index >= 0 && keywordWindows.length < 80) {
        keywordWindows.push(sourceText.slice(Math.max(0, index - 5000), Math.min(sourceText.length, index + 12000)));
        index = lower.indexOf(keyword, index + keyword.length);
      }
    }
  }

  for (const window of [plain, lines, ...keywordWindows]) {
    textRows.push(...parseTextWindowRows(window, {
      ...metaBase,
      parser: "sportomedia_deep_text_window_standings_parser"
    }));
  }

  const allRows = dedupeStandingRows([...jsonRows, ...textRows]);

  return {
    standingRows: allRows,
    probeDiagnostics: {
      payloadCount: payloads.length,
      payloadSources: payloads.map((p) => p.source).slice(0, 40),
      jsonStandingRowsFound: dedupeStandingRows(jsonRows).length,
      textStandingRowsFound: dedupeStandingRows(textRows).length,
      plainTextLength: plain.length,
      keywordWindowCount: keywordWindows.length,
      hasGraphql: /graphql|__typename/i.test(raw),
      hasStandingsKeywords: /standing|standings|tabell|tabellen|poäng|poang|spelade|vunna|oavgjorda|förlorade|forlorade/i.test(raw),
      sampleContexts: keywordWindows.slice(0, 6).map((w) => w.slice(0, 700))
    }
  };
}

function main() {
  const args = parseArgs(process.argv);

  const repairRun = readJson(args.repairInput);
  const repairedRows = validateRepairRun(repairRun);

  const snapshotRun = readJson(args.snapshotInput);
  const snapshots = validateSnapshots(snapshotRun);

  const sportomediaRows = repairedRows
    .filter((row) => SPORTOMEDIA_SLUGS.includes(row.competitionSlug))
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const probeRows = sportomediaRows.map((row) => {
    const standingsSnapshot = snapshots.find((snapshot) => snapshot.competitionSlug === row.competitionSlug && snapshot.routeKind === "official_standings");
    if (!standingsSnapshot) throw new Error(row.competitionSlug + ": missing official_standings snapshot.");

    const extracted = extractSportomediaStandingRows(standingsSnapshot);
    const standingRows = extracted.standingRows;

    const status =
      standingRows.length > 0
        ? "sportomedia_remaining_standings_parser_gap_repaired_candidate"
        : "sportomedia_remaining_standings_parser_gap_needs_manual_payload_shape_review";

    return {
      competitionSlug: row.competitionSlug,
      reusableFamily: row.reusableFamily,
      previousStatus: row.repairedParserNormalizerStatus,
      probeStatus: status,
      standingRowCandidateCountBeforeSportomediaProbe: row.standingRowCandidateCountAfterRepair,
      standingRowCandidateCountAfterSportomediaProbe: standingRows.length,
      fixtureResultRowCandidateCountAfterRepair: row.fixtureResultRowCandidateCountAfterRepair,
      rowLevelStatsExtractionCompleteCandidate: standingRows.length > 0 && row.fixtureResultRowCandidateCountAfterRepair > 0,

      standingRowCandidateSamples: standingRows.slice(0, 20),
      probeDiagnostics: extracted.probeDiagnostics,

      qualityGateReadyForClassifier: false,
      qualityGateReadyForCanonicalWrite: false,
      qualityGateReadyForTruthAssertion: false,

      fetchExecutedNow: false,
      searchExecutedNow: false,
      broadSearchExecutedNow: false,
      classifierExecutedNow: false,
      canonicalWriteExecutedNow: false,
      productionWriteExecutedNow: false,
      activeAssertedNow: false,
      inactiveAssertedNow: false,
      completedAssertedNow: false,
      seasonStateTruthAssertedNow: false,
      rowLevelStatsExtractionTruth: false,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsed: false,
      hardcodedSeasonStateOverrideUsed: false,

      repairedRowsAreTruth: false,
      noMatchTodayDoesNotImplyInactive: true,
      zeroResultDoesNotImplyAbsence: true,
      missingRowCandidatesDoNotProveAbsence: true,

      nextAllowedStep:
        standingRows.length > 0
          ? "integrate_sportomedia_remaining_standings_parser_into_repaired_family_parser"
          : "inspect_sportomedia_payload_shape_manually_from_existing_snapshot",
      nextBlockedStep: "season_state_classifier_canonical_write_and_truth_assertions_blocked"
    };
  });

  const repairedCandidateRows = probeRows.filter((row) => row.probeStatus === "sportomedia_remaining_standings_parser_gap_repaired_candidate");
  const stillGapRows = probeRows.filter((row) => row.probeStatus !== "sportomedia_remaining_standings_parser_gap_repaired_candidate");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "repair-football-truth-no-write-sportomedia-remaining-standings-parser-gap-file",
    mode: "probe_repair_remaining_sportomedia_standings_parser_gap_no_fetch_no_search_no_classifier_no_truth_assertion_no_write",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      routeSpecificStandingsRepair: args.repairInput,
      finalScopedControlledRouteAcquisitionRun: args.snapshotInput
    },
    summary: {
      sportomediaRemainingGapProbeCompetitionCount: probeRows.length,
      sportomediaRemainingGapRepairedCandidateCount: repairedCandidateRows.length,
      sportomediaRemainingGapStillNeedsManualPayloadShapeReviewCount: stillGapRows.length,

      sportomediaStandingRowsExtractedCompetitionCount: probeRows.filter((row) => row.standingRowCandidateCountAfterSportomediaProbe > 0).length,
      totalSportomediaStandingRowCandidateCount: probeRows.reduce((sum, row) => sum + row.standingRowCandidateCountAfterSportomediaProbe, 0),

      sportomediaRowLevelStatsExtractionCompleteCandidateCompetitionCount: probeRows.filter((row) => row.rowLevelStatsExtractionCompleteCandidate).length,

      qualityGateReadyForClassifierCount: 0,
      qualityGateReadyForCanonicalWriteCount: 0,
      qualityGateReadyForTruthAssertionCount: 0,

      fetchExecutedNowCount: 0,
      searchExecutedNowCount: 0,
      broadSearchExecutedNowCount: 0,
      classifierExecutedNowCount: 0,
      canonicalWriteExecutedNowCount: 0,
      productionWriteExecutedNowCount: 0,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      seasonStateTruthAssertedCount: 0,
      rowLevelStatsExtractionTruthCount: 0,
      repairedRowsTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        stillGapRows.length === 0
          ? "integrate_sportomedia_remaining_standings_parser_into_repaired_family_parser"
          : "inspect_sportomedia_payload_shape_manually_from_existing_snapshot"
    },
    counts: {
      byProbeStatus: countBy(probeRows, "probeStatus"),
      byNextAllowedStep: countBy(probeRows, "nextAllowedStep")
    },
    guardrails: [
      "This Sportomedia probe reads already-acquired official standings snapshots only.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not classify season state.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Extracted Sportomedia row candidates are not truth assertions.",
      "Missing row candidates does not prove absence.",
      "No match today must not imply inactive.",
      "Zero result must not imply absence."
    ],
    probeRows,
    stillGapRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    sportomediaRemainingGapProbeCompetitionCount: output.summary.sportomediaRemainingGapProbeCompetitionCount,
    sportomediaRemainingGapRepairedCandidateCount: output.summary.sportomediaRemainingGapRepairedCandidateCount,
    sportomediaRemainingGapStillNeedsManualPayloadShapeReviewCount: output.summary.sportomediaRemainingGapStillNeedsManualPayloadShapeReviewCount,
    sportomediaStandingRowsExtractedCompetitionCount: output.summary.sportomediaStandingRowsExtractedCompetitionCount,
    totalSportomediaStandingRowCandidateCount: output.summary.totalSportomediaStandingRowCandidateCount,
    sportomediaRowLevelStatsExtractionCompleteCandidateCompetitionCount: output.summary.sportomediaRowLevelStatsExtractionCompleteCandidateCompetitionCount,
    qualityGateReadyForClassifierCount: output.summary.qualityGateReadyForClassifierCount,
    qualityGateReadyForCanonicalWriteCount: output.summary.qualityGateReadyForCanonicalWriteCount,
    qualityGateReadyForTruthAssertionCount: output.summary.qualityGateReadyForTruthAssertionCount,
    fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
    searchExecutedNowCount: output.summary.searchExecutedNowCount,
    broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
    classifierExecutedNowCount: output.summary.classifierExecutedNowCount,
    canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
    productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
    activeAssertedCount: output.summary.activeAssertedCount,
    inactiveAssertedCount: output.summary.inactiveAssertedCount,
    completedAssertedCount: output.summary.completedAssertedCount,
    seasonStateTruthAssertedCount: output.summary.seasonStateTruthAssertedCount,
    rowLevelStatsExtractionTruthCount: output.summary.rowLevelStatsExtractionTruthCount,
    repairedRowsTruthCount: output.summary.repairedRowsTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    userHintUsedCount: output.summary.userHintUsedCount,
    hardcodedSeasonStateOverrideUsedCount: output.summary.hardcodedSeasonStateOverrideUsedCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
