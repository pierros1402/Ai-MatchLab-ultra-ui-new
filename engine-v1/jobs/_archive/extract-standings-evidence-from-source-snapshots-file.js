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
    selfTest: false,
    maxRowsPerSnapshot: 80
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

    if (arg === "--max-rows-per-snapshot" && argv[i + 1]) {
      args.maxRowsPerSnapshot = Number(argv[++i]);
      continue;
    }

    throw new Error(`Unknown or incomplete argument: ${arg}`);
  }

  if (!Number.isFinite(args.maxRowsPerSnapshot) || args.maxRowsPerSnapshot < 1) {
    throw new Error("--max-rows-per-snapshot must be a positive number");
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

function decodeHtmlEntities(text) {
  return asText(text)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCharCode(n) : _;
    });
}

function htmlToPlainText(html) {
  return decodeHtmlEntities(asText(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(td|th|tr|li|p|div|section|article)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(html) {
  return htmlToPlainText(html);
}

function normalizeTeamName(value) {
  return asText(value)
    .replace(/\s+/g, " ")
    .replace(/^\d+\s+/, "")
    .replace(/\s+\d+$/, "")
    .trim();
}

function numericTokens(values) {
  return values
    .map((value) => asText(value).replace(",", "."))
    .filter((value) => /^-?\d+(\.\d+)?$/.test(value))
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

function hasLeagueSignals(snapshot, plain) {
  const haystack = `${asText(snapshot.title)} ${asText(snapshot.hostname)} ${plain}`.toLowerCase();
  const league = asText(snapshot.missingLeagueSlug);

  const signals = [];
  if (/standings|ranking|table|tabelle|klassement/.test(haystack)) signals.push("standings_word");
  if (/played|matches|games|spiele|sp\b|pld\b|mp\b/.test(haystack)) signals.push("played_word");
  if (/points|punkte|pts\b|pkt\b|ptn\b|pt\b/.test(haystack)) signals.push("points_word");

  if (league === "aut.2" && /(2\.?\s*liga|admiral\s*2\.?\s*liga|austria|österreich)/i.test(haystack)) signals.push("league_context_aut_2");
  if (league === "bel.2" && /(challenger\s*pro\s*league|belgium|belgian|pro\s*league)/i.test(haystack)) signals.push("league_context_bel_2");
  if (league === "cyp.2" && /(cypriot|cyprus|division\s*2|2nd\s*division)/i.test(haystack)) signals.push("league_context_cyp_2");
  if (league === "den.2" && /(denmark|danish|1st\s*division|1\.\s*division)/i.test(haystack)) signals.push("league_context_den_2");
  if (league === "ger.3" && /(germany|3\.?\s*liga)/i.test(haystack)) signals.push("league_context_ger_3");
  if (league === "gre.2" && /(greece|greek|super\s*league\s*2)/i.test(haystack)) signals.push("league_context_gre_2");
  if (league === "nor.2" && /(norway|norwegian|obos|1\.?\s*division)/i.test(haystack)) signals.push("league_context_nor_2");

  return signals;
}

function extractHtmlTableRows(html) {
  const rows = [];
  const trMatches = asText(html).match(/<tr[\s\S]*?<\/tr>/gi) || [];

  for (const tr of trMatches) {
    const cellMatches = tr.match(/<(td|th)\b[\s\S]*?<\/\1>/gi) || [];
    const cells = cellMatches.map(stripTags).filter(Boolean);

    if (cells.length >= 3) {
      rows.push(cells);
    }
  }

  return rows;
}

function deriveStandingFromCells(snapshot, cells, rowIndex) {
  const cleaned = cells.map((cell) => asText(cell)).filter(Boolean);
  const joined = cleaned.join(" ");
  const nums = numericTokens(cleaned);

  const lowerJoined = joined.toLowerCase();
  if (/club|team|mannschaft|verein|ranking|standings|tabelle|spiele|punkte|points|pkt|ptn/.test(lowerJoined) && nums.length < 4) {
    return null;
  }

  let rank = null;
  if (/^\d{1,3}$/.test(cleaned[0] || "")) {
    rank = Number(cleaned[0]);
  }

  let teamCellIndex = cleaned.findIndex((cell, idx) => {
    if (idx === 0 && /^\d{1,3}$/.test(cell)) return false;
    if (/^-?\d+(\.\d+)?$/.test(cell)) return false;
    if (/^[+\-]?\d+:\d+$/.test(cell)) return false;
    return /[A-Za-zÀ-ÿ]/.test(cell);
  });

  if (teamCellIndex < 0) return null;

  const teamName = normalizeTeamName(cleaned[teamCellIndex]);
  if (!teamName || teamName.length < 2) return null;

  const afterTeam = cleaned.slice(teamCellIndex + 1);
  const afterNums = numericTokens(afterTeam);
  if (afterNums.length < 2) return null;

  let played = null;
  let points = null;
  const hostname = asText(snapshot.hostname).toLowerCase();

  if (hostname.includes("proleague.be")) {
    points = asNumber(afterNums[0]);
    played = asNumber(afterNums[1]);
  } else if (hostname.includes("2liga.at")) {
    played = asNumber(afterNums[0]);
    points = asNumber(afterNums[afterNums.length - 1]);
  } else {
    played = asNumber(afterNums[0]);
    points = asNumber(afterNums[afterNums.length - 1]);
  }

  if (!Number.isFinite(played) || !Number.isFinite(points)) return null;
  if (played < 0 || played > 80 || points < 0 || points > 200) return null;

  return {
    extractionMethod: "html_table_cells",
    rowIndex,
    rank,
    teamName,
    played,
    points,
    numericValues: afterNums.slice(0, 12),
    rawCells: cleaned.slice(0, 16),
    evidenceText: joined.slice(0, 500)
  };
}

function deriveRowsFromPlainText(snapshot, plain, offsetIndex = 0) {
  const rows = [];
  const text = asText(plain);
  const hostname = asText(snapshot.hostname).toLowerCase();

  const patterns = [];

  if (hostname.includes("proleague.be")) {
    patterns.push(/(?:^|\s)(\d{1,2})\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9 .'\-()&]{2,60}?)\s+(\d{1,3})\s+(\d{1,2})\s+\d{1,2}\s+\d{1,2}\s+\d{1,2}\s+\d{1,3}\s+\d{1,3}\s+[+\-]?\d{1,3}(?=\s|$)/g);
  }

  if (hostname.includes("flashscore.com")) {
    patterns.push(/(?:^|\s)(\d{1,2})\.\s*([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9 .'\-()&]{2,60}?)\s+(\d{1,2})\s+\d{1,2}\s+\d{1,2}\s+\d{1,2}\s+\d{1,3}:\d{1,3}\s+(\d{1,3})(?=\s|$)/g);
  }

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const rank = Number(match[1]);
      const teamName = normalizeTeamName(match[2]);
      const a = Number(match[3]);
      const b = Number(match[4]);

      let played = null;
      let points = null;

      if (hostname.includes("proleague.be")) {
        points = a;
        played = b;
      } else {
        played = a;
        points = b;
      }

      if (!teamName || teamName.length < 2) continue;
      if (!Number.isFinite(played) || !Number.isFinite(points)) continue;
      if (played < 0 || played > 80 || points < 0 || points > 200) continue;

      rows.push({
        extractionMethod: "plain_text_pattern",
        rowIndex: offsetIndex + rows.length,
        rank,
        teamName,
        played,
        points,
        numericValues: [played, points],
        rawCells: [],
        evidenceText: match[0].trim().slice(0, 500)
      });
    }
  }

  return rows;
}

function makeEvidenceRow(snapshot, extracted, confidence, reasons) {
  return {
    snapshotId: asText(snapshot.snapshotId),
    taskId: asText(snapshot.taskId),
    missingLeagueSlug: asText(snapshot.missingLeagueSlug),
    countryPrefix: asText(snapshot.countryPrefix),
    hostname: asText(snapshot.hostname),
    sourceUrl: asText(snapshot.url || snapshot.sourceCandidateUrl),
    finalUrl: asText(snapshot.finalUrl),
    title: asText(snapshot.title),
    extractionMethod: extracted.extractionMethod,
    rowIndex: extracted.rowIndex,
    rank: extracted.rank,
    teamName: extracted.teamName,
    played: extracted.played,
    points: extracted.points,
    confidence,
    confidenceReasons: reasons,
    numericValues: extracted.numericValues,
    rawCells: extracted.rawCells,
    evidenceText: extracted.evidenceText,
    standingsWriteAllowedNow: false,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function dedupeRows(rows) {
  const out = [];
  const seen = new Set();

  for (const row of rows) {
    const key = [
      row.snapshotId,
      String(row.rank ?? ""),
      row.teamName.toLowerCase(),
      String(row.played ?? ""),
      String(row.points ?? "")
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out;
}

function classifySnapshot(snapshot) {
  const body = asText(snapshot.bodyText);
  const plain = htmlToPlainText(body);
  const signals = hasLeagueSignals(snapshot, plain);
  const blockers = [];

  if (asText(snapshot.fetchStatus) !== "fetched") blockers.push("snapshot_not_fetched");
  if (!snapshot.okStatus) blockers.push("http_not_ok");
  if (!body) blockers.push("empty_body");
  const hasUsableTableSignals =
    signals.includes("standings_word") &&
    signals.includes("points_word") &&
    plain.length >= 1000;

  const hardChallengeTerms =
    /access denied|cf-chl|verify you are human|bot detection/i.test(body);

  const captchaLooksLikeHardChallenge =
    /captcha/i.test(body) &&
    !hasUsableTableSignals &&
    plain.length < 1000;

  const cloudflareLooksLikeHardChallenge =
    /cloudflare/i.test(body) &&
    plain.length < 500 &&
    !/standings|ranking|table|tabelle|klassement/i.test(plain);

  const antiBotChallengeLooksHard =
    hardChallengeTerms ||
    captchaLooksLikeHardChallenge ||
    cloudflareLooksLikeHardChallenge;

  if (antiBotChallengeLooksHard) blockers.push("possible_anti_bot_or_challenge");
  if (body.length > 0 && plain.length < 200) blockers.push("low_plain_text_after_html_strip");

  const tableRows = extractHtmlTableRows(body);
  let extracted = [];

  for (let i = 0; i < tableRows.length; i += 1) {
    const standing = deriveStandingFromCells(snapshot, tableRows[i], i);
    if (standing) extracted.push(standing);
  }

  extracted = extracted.concat(deriveRowsFromPlainText(snapshot, plain, extracted.length));
  extracted = dedupeRows(extracted);

  const hasUsableEvidence = extracted.length >= 4 && signals.includes("standings_word");
  const confidenceBase = signals.length + Math.min(5, extracted.length);

  let snapshotEvidenceState = "no_usable_standings_rows_extracted";
  if (blockers.length) snapshotEvidenceState = "blocked_snapshot";
  else if (hasUsableEvidence) snapshotEvidenceState = "usable_standings_evidence_candidate";
  else if (extracted.length > 0) snapshotEvidenceState = "partial_standings_evidence_candidate";

  const confidence = Math.max(0, Math.min(100, 35 + confidenceBase * 7));

  return {
    snapshotEvidenceState,
    blockers,
    signals,
    plainLength: plain.length,
    tableRowCount: tableRows.length,
    extracted,
    confidence
  };
}

function countBy(rows, field) {
  const out = {};
  for (const row of rows) {
    const key = asText(row[field]) || "unknown";
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function pickSnapshotRows(input) {
  const direct = asArray(input.fetchedSourceSnapshotRows);
  if (direct.length) return direct;

  const nested = asArray(input.report?.fetchedSourceSnapshotRows);
  if (nested.length) return nested;

  return [];
}

function buildReport(input, options = {}) {
  const snapshotRows = pickSnapshotRows(input);
  const standingsEvidenceCandidateRows = [];
  const blockedSnapshotRows = [];
  const extractionDiagnosticRows = [];

  for (const snapshot of snapshotRows) {
    const classified = classifySnapshot(snapshot);

    extractionDiagnosticRows.push({
      snapshotId: asText(snapshot.snapshotId),
      missingLeagueSlug: asText(snapshot.missingLeagueSlug),
      hostname: asText(snapshot.hostname),
      httpStatus: snapshot.httpStatus ?? null,
      okStatus: Boolean(snapshot.okStatus),
      responseCharCount: snapshot.responseCharCount ?? 0,
      clipped: Boolean(snapshot.clipped),
      snapshotEvidenceState: classified.snapshotEvidenceState,
      blockers: classified.blockers,
      signals: classified.signals,
      plainLength: classified.plainLength,
      tableRowCount: classified.tableRowCount,
      extractedRowCount: classified.extracted.length,
      confidence: classified.confidence,
      standingsWriteAllowedNow: false,
      canonicalWrites: 0,
      productionWrite: false
    });

    if (classified.snapshotEvidenceState === "blocked_snapshot") {
      blockedSnapshotRows.push({
        snapshotId: asText(snapshot.snapshotId),
        missingLeagueSlug: asText(snapshot.missingLeagueSlug),
        hostname: asText(snapshot.hostname),
        blockers: classified.blockers,
        standingsWriteAllowedNow: false,
        canonicalWrites: 0,
        productionWrite: false
      });
      continue;
    }

    const limited = classified.extracted.slice(0, options.maxRowsPerSnapshot);
    for (const extracted of limited) {
      standingsEvidenceCandidateRows.push(makeEvidenceRow(
        snapshot,
        extracted,
        classified.confidence,
        classified.signals
      ));
    }
  }

  return {
    ok: true,
    job: "extract-standings-evidence-from-source-snapshots-file",
    generatedAt: new Date().toISOString(),
    inputSummary: {
      sourceJob: asText(input.job),
      sourceGeneratedAt: asText(input.generatedAt),
      fetchedSourceSnapshotRowCount: snapshotRows.length
    },
    summary: {
      snapshotRowCount: snapshotRows.length,
      standingsEvidenceCandidateRowCount: standingsEvidenceCandidateRows.length,
      blockedSnapshotRowCount: blockedSnapshotRows.length,
      extractionDiagnosticRowCount: extractionDiagnosticRows.length,
      usableSnapshotCount: extractionDiagnosticRows.filter((row) => row.snapshotEvidenceState === "usable_standings_evidence_candidate").length,
      partialSnapshotCount: extractionDiagnosticRows.filter((row) => row.snapshotEvidenceState === "partial_standings_evidence_candidate").length,
      bySnapshotEvidenceState: countBy(extractionDiagnosticRows, "snapshotEvidenceState"),
      byMissingLeagueSlug: countBy(standingsEvidenceCandidateRows, "missingLeagueSlug"),
      byHostname: countBy(standingsEvidenceCandidateRows, "hostname"),
      standingsWriteAllowedNowCount: 0,
      canonicalWrites: 0,
      productionWrite: false
    },
    standingsEvidenceCandidateRows,
    blockedSnapshotRows,
    extractionDiagnosticRows,
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
  const body = `
    <html><body>
      <h1>Challenger Pro League Ranking</h1>
      <table>
        <tr><th>Club</th><th>PTN</th><th>W</th><th>G</th><th>=</th><th>V</th><th>DV</th><th>DT</th><th>+/-</th></tr>
        <tr><td>1</td><td>SK Beveren</td><td>88</td><td>32</td><td>28</td><td>4</td><td>0</td><td>74</td><td>23</td><td>51</td></tr>
        <tr><td>2</td><td>KV Kortrijk</td><td>67</td><td>32</td><td>21</td><td>4</td><td>7</td><td>59</td><td>33</td><td>26</td></tr>
        <tr><td>3</td><td>K. Beerschot VA</td><td>64</td><td>32</td><td>19</td><td>7</td><td>6</td><td>52</td><td>31</td><td>21</td></tr>
        <tr><td>4</td><td>RFC Liège</td><td>53</td><td>32</td><td>16</td><td>5</td><td>11</td><td>44</td><td>39</td><td>5</td></tr>
      </table>
    </body></html>
  `;

  return {
    ok: true,
    job: "fetch-same-prefix-missing-standings-source-snapshots-file",
    generatedAt: "2026-06-02T00:00:00.000Z",
    fetchedSourceSnapshotRows: [
      {
        snapshotId: "standings-source-snapshot:bel.2:0001",
        taskId: "standings-source:bel.2:0001",
        missingLeagueSlug: "bel.2",
        countryPrefix: "bel",
        hostname: "proleague.be",
        url: "https://www.proleague.be/cpl-ranking",
        finalUrl: "https://www.proleague.be/cpl-ranking",
        title: "Challenger Pro League Ranking | Pro League | Official Website",
        fetchStatus: "fetched",
        httpStatus: 200,
        okStatus: true,
        contentType: "text/html; charset=utf-8",
        responseCharCount: body.length,
        clipped: false,
        bodyText: body
      }
    ]
  };
}

async function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = buildReport(selfTestInput(), { ...args, selfTest: true });

    if (report.summary.snapshotRowCount !== 1) {
      throw new Error(`self-test expected 1 snapshot row, got ${report.summary.snapshotRowCount}`);
    }

    if (report.summary.standingsEvidenceCandidateRowCount < 4) {
      throw new Error(`self-test expected at least 4 evidence rows, got ${report.summary.standingsEvidenceCandidateRowCount}`);
    }

    const first = report.standingsEvidenceCandidateRows[0];
    if (first.teamName !== "SK Beveren" || first.points !== 88 || first.played !== 32) {
      throw new Error(`self-test unexpected first row: ${JSON.stringify(first)}`);
    }

    if (report.guarantees.noStandingsWrites !== true || report.guarantees.canonicalWrites !== 0) {
      throw new Error("self-test write guarantees failed");
    }

    console.log(JSON.stringify({
      ok: true,
      selfTest: "extract-standings-evidence-from-source-snapshots-file",
      summary: report.summary,
      firstEvidenceRow: first,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  const input = readJson(args.input, "input");
  const outputPath = args.output || "data/football-truth/_diagnostics/same-prefix-missing-standings/standings-evidence-candidates.json";
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
    job: "extract-standings-evidence-from-source-snapshots-file",
    error: error?.message || String(error),
    standingsWriteAllowedNow: false,
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
});