#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  date: "2026-06-14",
  shapeInput: "data/football-truth/_diagnostics/no-write-sportomedia-official-standings-payload-shape-inspector-2026-06-14/no-write-sportomedia-official-standings-payload-shape-inspector-2026-06-14.json",
  snapshotInput: "data/football-truth/_diagnostics/final-explicit-scoped-controlled-route-acquisition-run-2026-06-14/final-explicit-scoped-controlled-route-acquisition-run-2026-06-14.json",
  output: "data/football-truth/_diagnostics/no-write-sportomedia-targeted-script-payload-parser-2026-06-14/no-write-sportomedia-targeted-script-payload-parser-2026-06-14.json"
};

const SPORTOMEDIA_SLUGS = ["swe.1", "swe.2"];

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--shape-input") args.shapeInput = argv[++i];
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

function assertSummary(summary, key, expected) {
  if (!(key in summary)) throw new Error("Missing summary key: " + key);
  if (summary[key] !== expected) throw new Error("Guardrail failed for " + key + ": expected " + expected + ", got " + summary[key]);
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value = row[key] === null || row[key] === undefined || String(row[key]).trim() === "" ? "__missing__" : String(row[key]).trim();
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function validateShapeInspector(input) {
  const s = input.summary || {};
  assertSummary(s, "sportomediaPayloadShapeInspectorCompetitionCount", 2);
  assertSummary(s, "sportomediaOfficialStandingsSnapshotCount", 2);
  assertSummary(s, "scriptHydrationOrGraphqlLikeCount", 2);
  assertSummary(s, "htmlTableLikeCount", 0);
  assertSummary(s, "plainTextOrClientRuntimeOnlyCount", 0);
  assertSummary(s, "totalScriptsWithGraphqlCount", 2);
  assertSummary(s, "totalTableCount", 0);
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
  assertSummary(s, "payloadShapeTruthCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  assertSummary(s, "productionWrite", false);

  const rows = Array.isArray(input.inspectorRows) ? input.inspectorRows : [];
  if (rows.length !== 2) throw new Error("Expected 2 inspectorRows.");
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

function extractScripts(raw) {
  const scripts = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  let scriptIndex = 0;

  while ((match = re.exec(String(raw || ""))) !== null && scripts.length < 100) {
    const attrs = String(match[1] || "");
    const body = decodeEntities(String(match[2] || "").trim());
    scripts.push({
      scriptIndex,
      attrs,
      body,
      bodyLength: body.length,
      isGraphqlLike: /graphql|GraphQL|gql|query\s+[A-Za-z0-9_]+|operationName/i.test(body),
      hasStandingTerms: /standing|standings|tabell|table|poäng|poang|points|pts|spelade|played|team|club|lag/i.test(body)
    });
    scriptIndex += 1;
  }

  return scripts;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function tryDecodeJsonString(value) {
  const s = String(value || "").trim();
  if (!s) return null;

  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    try {
      return JSON.parse(s.replace(/^'/, '"').replace(/'$/, '"'));
    } catch {
      return null;
    }
  }

  try {
    return JSON.parse('"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"');
  } catch {
    return null;
  }
}

function extractBalancedJsonCandidates(text) {
  const s = String(text || "");
  const candidates = [];

  for (let start = 0; start < s.length && candidates.length < 240; start += 1) {
    const open = s[start];
    if (open !== "{" && open !== "[") continue;

    const stack = [open === "{" ? "}" : "]"];
    let inString = false;
    let escape = false;

    for (let i = start + 1; i < Math.min(s.length, start + 700000); i += 1) {
      const char = s[i];

      if (inString) {
        if (escape) escape = false;
        else if (char === "\\") escape = true;
        else if (char === '"') inString = false;
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === "{") stack.push("}");
      else if (char === "[") stack.push("]");
      else if (char === stack[stack.length - 1]) stack.pop();

      if (stack.length === 0) {
        const candidate = s.slice(start, i + 1);
        if (candidate.length > 20 && /(standing|standings|tabell|table|poäng|poang|points|pts|played|spelade|team|club|lag|operationName|query|graphql)/i.test(candidate)) {
          candidates.push(candidate);
        }
        break;
      }
    }
  }

  return candidates;
}

function extractCandidatePayloads({ raw, inspectorRow }) {
  const payloads = [];

  payloads.push({ source: "raw_html", text: decodeEntities(raw) });
  payloads.push({ source: "plain_text", text: stripHtml(raw) });

  const scripts = extractScripts(raw);
  for (const script of scripts) {
    if (script.isGraphqlLike || script.hasStandingTerms) {
      payloads.push({ source: "script_" + script.scriptIndex, text: script.body });
    }
  }

  for (const fragment of inspectorRow.likelyJsonFragments || []) {
    if (fragment && fragment.fragment) payloads.push({ source: "inspector_fragment_" + fragment.source + "_" + fragment.keyword, text: decodeEntities(fragment.fragment) });
  }

  for (const ctx of inspectorRow.keywordContexts || []) {
    if (ctx && ctx.context) payloads.push({ source: "inspector_keyword_context_" + ctx.keyword, text: decodeEntities(ctx.context) });
  }

  const expanded = [];
  for (const payload of payloads) {
    expanded.push(payload);

    const quotedStrings = String(payload.text || "").match(/"(?:\\.|[^"\\]){80,}"/g) || [];
    for (const quoted of quotedStrings.slice(0, 80)) {
      const decoded = safeJsonParse(quoted);
      if (typeof decoded === "string" && /(standing|standings|tabell|table|poäng|poang|points|pts|played|spelade|team|club|lag|graphql|operationName)/i.test(decoded)) {
        expanded.push({ source: payload.source + "_decoded_string", text: decoded });
      }
    }

    const jsonStringLike = String(payload.text || "").match(/\\u00[0-9a-fA-F]{2}|\\u[0-9a-fA-F]{4}|\\x[0-9a-fA-F]{2}/g);
    if (jsonStringLike) {
      const decoded = tryDecodeJsonString(payload.text);
      if (typeof decoded === "string" && decoded !== payload.text) {
        expanded.push({ source: payload.source + "_json_unescaped", text: decoded });
      }
    }
  }

  return expanded
    .filter((payload) => payload.text && payload.text.length > 20)
    .slice(0, 420);
}

function extractGraphqlRouteCandidates(text) {
  const routes = [];

  const urlRegex = /https?:\/\/[^"'<>\s)]+/gi;
  let urlMatch;
  while ((urlMatch = urlRegex.exec(String(text || ""))) !== null && routes.length < 100) {
    const url = urlMatch[0];
    if (/(graphql|api|sport|standing|standings|table|competition|matches|fixtures|result)/i.test(url)) {
      routes.push({
        kind: "absolute_url",
        value: url,
        index: urlMatch.index
      });
    }
  }

  const pathRegex = /["'`](\/[^"'`<>\s)]{2,240})["'`]/g;
  let pathMatch;
  while ((pathMatch = pathRegex.exec(String(text || ""))) !== null && routes.length < 160) {
    const value = pathMatch[1];
    if (/(graphql|api|sport|standing|standings|table|competition|matches|fixtures|result)/i.test(value)) {
      routes.push({
        kind: "relative_path",
        value,
        index: pathMatch.index
      });
    }
  }

  const operationRegex = /\b(query|mutation)\s+([A-Za-z0-9_]+)/g;
  let opMatch;
  while ((opMatch = operationRegex.exec(String(text || ""))) !== null && routes.length < 220) {
    routes.push({
      kind: "graphql_operation",
      value: opMatch[2],
      operationType: opMatch[1],
      index: opMatch.index
    });
  }

  const operationNameRegex = /operationName["']?\s*[:=]\s*["']([A-Za-z0-9_]+)["']/g;
  let nameMatch;
  while ((nameMatch = operationNameRegex.exec(String(text || ""))) !== null && routes.length < 260) {
    routes.push({
      kind: "operationName",
      value: nameMatch[1],
      index: nameMatch.index
    });
  }

  return routes;
}

function flattenObject(value, prefix = "", out = {}, depth = 0) {
  if (depth > 9 || value === null || value === undefined) return out;

  if (Array.isArray(value)) {
    value.slice(0, 50).forEach((item, index) => flattenObject(item, prefix + "[" + index + "]", out, depth + 1));
    return out;
  }

  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const next = prefix ? prefix + "." + key : key;
      flattenObject(child, next, out, depth + 1);
    }
    return out;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    out[prefix] = value;
  }

  return out;
}

function numberValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = String(value).trim().replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/.test(s)) return null;
  return Number(s);
}

function pathLooksLikeTeamName(pathName, value) {
  const p = String(pathName || "").toLowerCase();
  const v = String(value || "").trim();

  if (v.length < 2 || v.length > 90) return false;
  if (!/[A-Za-zÅÄÖåäöÀ-ÖØ-öø-ÿ]/.test(v)) return false;
  if (/^(team|club|lag|name|standing|standings|table|points|played|spelade|poäng|poang)$/i.test(v)) return false;

  return (
    p.includes("team") ||
    p.includes("club") ||
    p.includes("contestant") ||
    p.includes("competitor") ||
    p.includes("participant") ||
    p.includes("lag") ||
    p.endsWith(".name") ||
    p.endsWith(".displayname") ||
    p.endsWith(".shortname")
  );
}

function statValue(flat, patterns) {
  for (const [pathName, value] of Object.entries(flat)) {
    const lower = pathName.toLowerCase();
    if (patterns.some((pattern) => pattern.test(lower))) {
      const number = numberValue(value);
      if (number !== null) return number;
    }
  }
  return null;
}

function collectRowsFromParsedObject(value, meta, out = [], depth = 0) {
  if (depth > 12 || out.length >= 250 || value === null || value === undefined) return out;

  if (Array.isArray(value)) {
    for (const item of value) collectRowsFromParsedObject(item, meta, out, depth + 1);
    return out;
  }

  if (typeof value !== "object") return out;

  const flat = flattenObject(value);
  const teamCandidates = Object.entries(flat)
    .filter(([pathName, val]) => pathLooksLikeTeamName(pathName, val))
    .map(([pathName, val]) => ({ pathName, value: String(val).trim() }));

  const points = statValue(flat, [/points?$/, /pts$/, /poäng$/, /poang$/, /\.points?/, /\.pts/]);
  const played = statValue(flat, [/played$/, /matchesplayed$/, /gamesplayed$/, /spelade$/, /\.played/, /\.matches/]);
  const position = statValue(flat, [/position$/, /rank$/, /place$/, /pos$/]);
  const wins = statValue(flat, [/wins?$/, /won$/, /\.w$/, /vunna$/]);
  const draws = statValue(flat, [/draws?$/, /drawn$/, /\.d$/, /oavgjorda$/]);
  const losses = statValue(flat, [/losses?$/, /lost$/, /\.l$/, /förlorade$/, /forlorade$/]);
  const goalsFor = statValue(flat, [/goalsfor$/, /goals_for$/, /\.gf$/, /scored$/]);
  const goalsAgainst = statValue(flat, [/goalsagainst$/, /goals_against$/, /\.ga$/, /conceded$/]);
  const goalDifference = statValue(flat, [/goaldifference$/, /goal_diff$/, /\.gd$/, /diff$/, /målskillnad$/, /malskillnad$/]);

  if (teamCandidates.length > 0 && (points !== null || played !== null || position !== null)) {
    const team = teamCandidates[0];
    out.push({
      parser: "sportomedia_targeted_script_payload_object_parser",
      competitionSlug: meta.competitionSlug,
      reusableFamily: meta.reusableFamily,
      routeKind: meta.routeKind,
      sourceUrl: meta.sourceUrl,
      finalUrl: meta.finalUrl,
      teamName: team.value,
      teamNamePath: team.pathName,
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
    if (child && typeof child === "object") collectRowsFromParsedObject(child, meta, out, depth + 1);
  }

  return out;
}

function parseTextRows(text, meta) {
  const normalized = stripHtml(text)
    .replace(/\s+/g, " ")
    .trim();

  const chunks = normalized
    .split(/(?=\b(?:[1-9]|1[0-9]|2[0-9])\s+[A-ZÅÄÖ])/g)
    .map((x) => x.trim())
    .filter(Boolean);

  const rows = [];
  const rowPattern = /(?:^|\s)([1-9]|1[0-9]|2[0-9])\s+([A-ZÅÄÖ][A-Za-zÅÄÖåäöÀ-ÖØ-öø-ÿ0-9.' ]{2,70}?)\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,3})(?:\s|$)/g;

  for (const chunk of chunks) {
    let match;
    const re = new RegExp(rowPattern.source, rowPattern.flags);
    while ((match = re.exec(chunk)) !== null && rows.length < 120) {
      rows.push({
        parser: "sportomedia_targeted_script_payload_text_parser",
        competitionSlug: meta.competitionSlug,
        reusableFamily: meta.reusableFamily,
        routeKind: meta.routeKind,
        sourceUrl: meta.sourceUrl,
        finalUrl: meta.finalUrl,
        teamName: match[2].trim(),
        positionCandidate: numberValue(match[1]),
        playedCandidate: numberValue(match[3]),
        winsCandidate: numberValue(match[4]),
        drawsCandidate: numberValue(match[5]),
        lossesCandidate: numberValue(match[6]),
        pointsCandidate: numberValue(match[7]),
        rawLine: chunk.slice(0, 300),
        normalizedRowIsTruth: false
      });
    }
  }

  return rows;
}

function dedupeRows(rows) {
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
  }

  return out.slice(0, 120);
}

function collectKeyPathProfiles(value, out = {}, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return out;

  if (Array.isArray(value)) {
    out["__array__"] = (out["__array__"] || 0) + 1;
    for (const item of value.slice(0, 20)) collectKeyPathProfiles(item, out, depth + 1);
    return out;
  }

  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const lower = key.toLowerCase();
      if (/(standing|standings|table|team|club|contestant|competitor|participant|points|pts|played|rank|position|match|competition|season|lag|poäng|poang|spelade)/i.test(lower)) {
        out[key] = (out[key] || 0) + 1;
      }
      collectKeyPathProfiles(child, out, depth + 1);
    }
  }

  return out;
}

function buildTargetedRow({ inspectorRow, snapshot }) {
  const raw = getRaw(snapshot);
  const meta = {
    competitionSlug: snapshot.competitionSlug,
    reusableFamily: snapshot.reusableFamily,
    routeKind: snapshot.routeKind,
    sourceUrl: snapshot.sourceUrl,
    finalUrl: snapshot.finalUrl
  };

  const payloads = extractCandidatePayloads({ raw, inspectorRow });
  const routeCandidates = [];
  const rowCandidates = [];
  const keyProfiles = {};

  for (const payload of payloads) {
    routeCandidates.push(...extractGraphqlRouteCandidates(payload.text).map((candidate) => ({
      ...candidate,
      source: payload.source
    })));

    const jsonCandidates = extractBalancedJsonCandidates(payload.text);
    for (const candidate of jsonCandidates.slice(0, 120)) {
      const parsed = safeJsonParse(candidate);
      if (!parsed) continue;

      collectRowsFromParsedObject(parsed, meta, rowCandidates);
      const profile = collectKeyPathProfiles(parsed);
      for (const [key, count] of Object.entries(profile)) {
        keyProfiles[key] = (keyProfiles[key] || 0) + count;
      }
    }

    rowCandidates.push(...parseTextRows(payload.text, meta));
  }

  const dedupedRoutes = [];
  const seenRoutes = new Set();
  for (const route of routeCandidates) {
    const key = route.kind + "|" + route.value;
    if (seenRoutes.has(key)) continue;
    seenRoutes.add(key);
    dedupedRoutes.push(route);
    if (dedupedRoutes.length >= 80) break;
  }

  const standingsRows = dedupeRows(rowCandidates);

  const parserStatus =
    standingsRows.length > 0
      ? "sportomedia_targeted_script_payload_parser_extracted_standing_rows"
      : dedupedRoutes.length > 0
        ? "sportomedia_targeted_parser_found_graphql_route_candidates_needs_controlled_payload_acquisition"
        : "sportomedia_targeted_parser_needs_deeper_payload_shape_review";

  return {
    competitionSlug: snapshot.competitionSlug,
    reusableFamily: snapshot.reusableFamily,
    payloadShape: inspectorRow.payloadShape,
    parserRecommendationFromInspector: inspectorRow.parserRecommendation,
    targetedParserStatus: parserStatus,

    payloadCandidateCount: payloads.length,
    parsedStandingRowCandidateCount: standingsRows.length,
    graphqlRouteCandidateCount: dedupedRoutes.length,
    keyProfileCandidateCount: Object.keys(keyProfiles).length,

    standingRowCandidateSamples: standingsRows.slice(0, 30),
    graphqlRouteCandidates: dedupedRoutes.slice(0, 60),
    keyProfileSamples: Object.entries(keyProfiles)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 80)
      .map(([key, count]) => ({ key, count })),

    embeddedStandingRowsExtracted: standingsRows.length > 0,
    needsControlledGraphqlPayloadAcquisitionCandidate: standingsRows.length === 0 && dedupedRoutes.length > 0,
    needsDeeperPayloadShapeReview: standingsRows.length === 0 && dedupedRoutes.length === 0,

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
    parsedRowsAreTruth: false,
    graphqlRouteCandidatesAreTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    noMatchTodayDoesNotImplyInactive: true,
    zeroResultDoesNotImplyAbsence: true,
    missingEmbeddedRowsDoesNotProveAbsence: true,

    nextAllowedStep:
      standingsRows.length > 0
        ? "integrate_sportomedia_targeted_payload_parser_into_repaired_family_parser"
        : dedupedRoutes.length > 0
          ? "build_no_write_controlled_sportomedia_graphql_payload_acquisition_plan"
          : "inspect_sportomedia_script_runtime_payload_shape_deeper",
    nextBlockedStep: "season_state_classifier_canonical_write_and_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);

  const shape = readJson(args.shapeInput);
  const inspectorRows = validateShapeInspector(shape);

  const snapshotRun = readJson(args.snapshotInput);
  const snapshots = validateSnapshots(snapshotRun);

  const targetRows = inspectorRows
    .filter((row) => SPORTOMEDIA_SLUGS.includes(row.competitionSlug))
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  if (targetRows.length !== 2) throw new Error("Expected 2 Sportomedia inspector target rows.");

  const targetedRows = targetRows.map((inspectorRow) => {
    const snapshot = snapshots.find((row) => row.competitionSlug === inspectorRow.competitionSlug && row.routeKind === "official_standings");
    if (!snapshot) throw new Error(inspectorRow.competitionSlug + ": missing official_standings snapshot.");
    return buildTargetedRow({ inspectorRow, snapshot });
  });

  const embeddedRows = targetedRows.filter((row) => row.embeddedStandingRowsExtracted);
  const routeCandidateRows = targetedRows.filter((row) => row.needsControlledGraphqlPayloadAcquisitionCandidate);
  const deeperRows = targetedRows.filter((row) => row.needsDeeperPayloadShapeReview);

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-no-write-sportomedia-targeted-script-payload-parser-file",
    mode: "build_no_write_sportomedia_targeted_script_payload_parser_no_fetch_no_search_no_classifier_no_truth_assertion_no_write",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      sportomediaPayloadShapeInspector: args.shapeInput,
      finalScopedControlledRouteAcquisitionRun: args.snapshotInput
    },
    summary: {
      sportomediaTargetedScriptPayloadParserCompetitionCount: targetedRows.length,
      sportomediaEmbeddedStandingRowsExtractedCompetitionCount: embeddedRows.length,
      sportomediaGraphqlRouteCandidateCompetitionCount: routeCandidateRows.length,
      sportomediaDeeperPayloadShapeReviewCompetitionCount: deeperRows.length,

      totalPayloadCandidateCount: targetedRows.reduce((sum, row) => sum + row.payloadCandidateCount, 0),
      totalParsedStandingRowCandidateCount: targetedRows.reduce((sum, row) => sum + row.parsedStandingRowCandidateCount, 0),
      totalGraphqlRouteCandidateCount: targetedRows.reduce((sum, row) => sum + row.graphqlRouteCandidateCount, 0),
      totalKeyProfileCandidateCount: targetedRows.reduce((sum, row) => sum + row.keyProfileCandidateCount, 0),

      controlledGraphqlPayloadAcquisitionCandidateCount: routeCandidateRows.length,
      integrateEmbeddedParserCandidateCount: embeddedRows.length,

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
      parsedRowsTruthCount: 0,
      graphqlRouteCandidatesTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        embeddedRows.length === targetedRows.length
          ? "integrate_sportomedia_targeted_payload_parser_into_repaired_family_parser"
          : routeCandidateRows.length > 0
            ? "build_no_write_controlled_sportomedia_graphql_payload_acquisition_plan"
            : "inspect_sportomedia_script_runtime_payload_shape_deeper"
    },
    counts: {
      byTargetedParserStatus: countBy(targetedRows, "targetedParserStatus"),
      byNextAllowedStep: countBy(targetedRows, "nextAllowedStep")
    },
    guardrails: [
      "This targeted parser reads already-acquired Sportomedia official_standings snapshots and payload-shape diagnostics only.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not classify season state.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Parsed row candidates are not truth assertions.",
      "GraphQL route candidates are not truth assertions.",
      "Missing embedded rows does not prove absence.",
      "No match today must not imply inactive.",
      "Zero result must not imply absence."
    ],
    targetedRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    sportomediaTargetedScriptPayloadParserCompetitionCount: output.summary.sportomediaTargetedScriptPayloadParserCompetitionCount,
    sportomediaEmbeddedStandingRowsExtractedCompetitionCount: output.summary.sportomediaEmbeddedStandingRowsExtractedCompetitionCount,
    sportomediaGraphqlRouteCandidateCompetitionCount: output.summary.sportomediaGraphqlRouteCandidateCompetitionCount,
    sportomediaDeeperPayloadShapeReviewCompetitionCount: output.summary.sportomediaDeeperPayloadShapeReviewCompetitionCount,
    totalPayloadCandidateCount: output.summary.totalPayloadCandidateCount,
    totalParsedStandingRowCandidateCount: output.summary.totalParsedStandingRowCandidateCount,
    totalGraphqlRouteCandidateCount: output.summary.totalGraphqlRouteCandidateCount,
    totalKeyProfileCandidateCount: output.summary.totalKeyProfileCandidateCount,
    controlledGraphqlPayloadAcquisitionCandidateCount: output.summary.controlledGraphqlPayloadAcquisitionCandidateCount,
    integrateEmbeddedParserCandidateCount: output.summary.integrateEmbeddedParserCandidateCount,
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
    parsedRowsTruthCount: output.summary.parsedRowsTruthCount,
    graphqlRouteCandidatesTruthCount: output.summary.graphqlRouteCandidatesTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    userHintUsedCount: output.summary.userHintUsedCount,
    hardcodedSeasonStateOverrideUsedCount: output.summary.hardcodedSeasonStateOverrideUsedCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
