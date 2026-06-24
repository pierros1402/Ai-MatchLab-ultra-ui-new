import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const argv = process.argv.slice(2);
const allowFetch = argv.includes("--allow-fetch");

if (!allowFetch) {
  throw new Error("Refusing exact extraction validation without --allow-fetch");
}

const inspectionPath = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `official-host-proof-inspection-${today}`,
  `official-host-proof-inspection-${today}.json`
);

const outputDir = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `official-host-extraction-validation-${today}`
);

const outputPath = path.join(outputDir, `official-host-extraction-validation-${today}.json`);
const rowsOutputPath = path.join(outputDir, `official-host-extraction-validation-rows-${today}.jsonl`);

const expectedRowsBySlug = {
  "aut.1": 12,
  "aut.2": 16,
  "aus.1": 13,
  "mex.1": 18,
  "nor.1": 16,
  "kor.1": 12
};

const teamSignalTermsBySlug = {
  "aut.1": ["Sturm", "Salzburg", "Rapid", "Austria", "LASK", "Wolfsberg"],
  "aut.2": ["Admira", "Ried", "First Vienna", "Kapfenberg", "St. Pölten", "Liefering"],
  "aus.1": ["Auckland", "Melbourne", "Sydney", "Wellington", "Western", "Adelaide"],
  "mex.1": ["América", "Cruz Azul", "Tigres", "Monterrey", "Pumas", "Guadalajara", "Toluca"],
  "nor.1": ["Bodø", "Glimt", "Brann", "Rosenborg", "Viking", "Molde", "Tromsø"],
  "kor.1": ["Jeonbuk", "Ulsan", "Pohang", "Seoul", "Gimcheon", "Gangwon"]
};

function decodeHtml(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function cleanCell(html) {
  return decodeHtml(String(html || "")
    .replace(/<img\b[^>]*(?:alt|title)=["']([^"']+)["'][^>]*>/gi, " $1 ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function cleanText(html) {
  return decodeHtml(String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function titleOf(html) {
  const m = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? cleanText(m[1]).slice(0, 220) : "";
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function parseIntStrict(value) {
  const s = String(value ?? "").replace(/[^\d+-]/g, "");
  if (!/^[+-]?\d+$/.test(s)) return null;
  return Number(s);
}

function parseNumericTokensFromCell(cell) {
  const out = [];
  const text = String(cell || "").trim();

  const goalPair = text.match(/^(\d{1,3})\s*[:\-]\s*(\d{1,3})$/);
  if (goalPair) {
    out.push({ value: Number(goalPair[1]), kind: "goalForFromPair" });
    out.push({ value: Number(goalPair[2]), kind: "goalAgainstFromPair" });
    return out;
  }

  const numeric = parseIntStrict(text);
  if (numeric !== null) out.push({ value: numeric, kind: "number" });

  return out;
}

function extractTables(html) {
  return [...String(html || "").matchAll(/<table\b[\s\S]*?<\/table>/gi)].map((m, tableIndex) => {
    const tableHtml = m[0];
    const rows = [...tableHtml.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((r, rowIndex) => {
      const rowHtml = r[0];
      const cells = [...rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map(c => cleanCell(c[1]))
        .filter(Boolean);
      const isHeader = /<th\b/i.test(rowHtml);
      return { rowIndex, cells, isHeader };
    }).filter(row => row.cells.length > 0);

    return {
      tableIndex,
      rowCount: rows.length,
      rows,
      sample: cleanText(tableHtml).slice(0, 800)
    };
  });
}

function isLikelyHeaderCell(cell) {
  const n = normalize(cell);
  return [
    "team", "club", "verein", "mannschaft", "sp", "spiele", "s", "u", "n",
    "punkte", "pkt", "points", "pts", "tore", "diff", "gd", "rang", "pos",
    "position", "played", "won", "drawn", "lost"
  ].includes(n);
}

function makeRowFromCells(cells, slug) {
  const cleaned = cells.map(c => String(c || "").trim()).filter(Boolean);
  if (cleaned.length < 4) return null;

  if (cleaned.every(isLikelyHeaderCell)) return null;

  const rankCellIndex = cleaned.findIndex(c => {
    const v = parseIntStrict(c);
    return v !== null && v >= 1 && v <= 40;
  });

  const rank = rankCellIndex >= 0 ? parseIntStrict(cleaned[rankCellIndex]) : null;

  const teamCellIndex = cleaned.findIndex((c, idx) => {
    if (idx === rankCellIndex) return false;
    const n = normalize(c);
    if (!/[a-zA-ZÀ-ÿ]/.test(c)) return false;
    if (isLikelyHeaderCell(c)) return false;
    if (n.length < 2) return false;
    if (["form", "last", "next", "details", "logo"].includes(n)) return false;
    return true;
  });

  if (teamCellIndex < 0) return null;

  const team = cleaned[teamCellIndex]
    .replace(/\s{2,}/g, " ")
    .replace(/^\d+\s+/, "")
    .trim();

  const numericTokens = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    if (i === teamCellIndex) continue;
    for (const tok of parseNumericTokensFromCell(cleaned[i])) {
      numericTokens.push({ ...tok, cellIndex: i, cell: cleaned[i] });
    }
  }

  let nums = numericTokens.map(t => t.value);
  if (rank !== null && nums[0] === rank) nums = nums.slice(1);

  let parsed = null;

  for (let i = 0; i + 3 < nums.length; i += 1) {
    const played = nums[i];
    const wins = nums[i + 1];
    const draws = nums[i + 2];
    const losses = nums[i + 3];

    if (played < 0 || wins < 0 || draws < 0 || losses < 0) continue;
    if (played !== wins + draws + losses) continue;
    if (played > 60) continue;

    const rest = nums.slice(i + 4);
    const points = rest.length ? rest[rest.length - 1] : null;

    let goalsFor = null;
    let goalsAgainst = null;
    let goalDifference = null;

    if (rest.length >= 4) {
      goalsFor = rest[0];
      goalsAgainst = rest[1];
      goalDifference = rest[2];
    } else if (rest.length >= 3) {
      goalsFor = rest[0];
      goalsAgainst = rest[1];
      goalDifference = goalsFor - goalsAgainst;
    }

    parsed = {
      played,
      wins,
      draws,
      losses,
      goalsFor,
      goalsAgainst,
      goalDifference,
      points
    };
    break;
  }

  if (!parsed) return null;

  const playedArithmeticPass = parsed.played === parsed.wins + parsed.draws + parsed.losses;
  const pointsArithmeticExpected = parsed.wins * 3 + parsed.draws;
  const pointsArithmeticPass = parsed.points === pointsArithmeticExpected;
  const gdArithmeticPass = parsed.goalsFor === null || parsed.goalsAgainst === null || parsed.goalDifference === null
    ? null
    : parsed.goalDifference === parsed.goalsFor - parsed.goalsAgainst;

  return {
    slug,
    rank,
    team,
    cells: cleaned.slice(0, 18),
    ...parsed,
    pointsArithmeticExpected,
    playedArithmeticPass,
    pointsArithmeticPass,
    gdArithmeticPass
  };
}

function inferSeasonLabelFromUrl(url) {
  const text = String(url || "");
  const saison = text.match(/saison-(\d{4})-(\d{4})/i);
  if (saison) return `${saison[1]}-${saison[2]}`;

  const season = text.match(/(?:^|[^\d])(\d{4})[-/](\d{2,4})(?:[^\d]|$)/);
  if (season) {
    const end = season[2].length === 2 ? `${season[1].slice(0, 2)}${season[2]}` : season[2];
    return `${season[1]}-${end}`;
  }

  return "unknown";
}

function teamSignalCount(slug, rows) {
  const terms = teamSignalTermsBySlug[slug] || [];
  const allTeams = rows.map(row => normalize(row.team)).join(" | ");
  return terms.filter(term => allTeams.includes(normalize(term))).length;
}

function validateRows({ slug, candidateUrl, parsedRows }) {
  const expectedRows = expectedRowsBySlug[slug] || null;
  const dedupedByTeam = new Map();

  for (const row of parsedRows) {
    const key = normalize(row.team);
    if (!key) continue;
    if (!dedupedByTeam.has(key)) dedupedByTeam.set(key, row);
  }

  const rows = [...dedupedByTeam.values()]
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || String(a.team).localeCompare(String(b.team)));

  const seasonLabel = inferSeasonLabelFromUrl(candidateUrl);
  const playedPassCount = rows.filter(row => row.playedArithmeticPass === true).length;
  const pointsPassCount = rows.filter(row => row.pointsArithmeticPass === true).length;
  const gdKnownRows = rows.filter(row => row.gdArithmeticPass !== null);
  const gdPassCount = gdKnownRows.filter(row => row.gdArithmeticPass === true).length;
  const signals = teamSignalCount(slug, rows);
  const rowCountPass = expectedRows !== null && rows.length === expectedRows;
  const playedPass = expectedRows !== null && playedPassCount >= Math.ceil(expectedRows * 0.8);
  const pointsPass = expectedRows !== null && pointsPassCount >= Math.ceil(expectedRows * 0.75);
  const gdPass = gdKnownRows.length === 0 || gdPassCount >= Math.ceil(gdKnownRows.length * 0.75);
  const teamSignalPass = signals >= 2;
  const seasonScoped = seasonLabel !== "unknown";

  const validationPassed =
    rowCountPass &&
    playedPass &&
    pointsPass &&
    gdPass &&
    teamSignalPass &&
    seasonScoped;

  return {
    expectedRows,
    extractedRowCount: rows.length,
    rowCountPass,
    seasonLabel,
    seasonScoped,
    playedArithmeticPassCount: playedPassCount,
    pointsArithmeticPassCount: pointsPassCount,
    gdArithmeticKnownCount: gdKnownRows.length,
    gdArithmeticPassCount: gdPassCount,
    playedPass,
    pointsPass,
    gdPass,
    teamSignalCount: signals,
    teamSignalPass,
    validationPassed,
    rows
  };
}

function parseHtmlTarget({ slug, candidateUrl, html }) {
  const tables = extractTables(html);
  const tableCandidates = [];

  for (const table of tables) {
    const parsedRows = [];

    for (const row of table.rows) {
      const parsed = makeRowFromCells(row.cells, slug);
      if (parsed) parsedRows.push(parsed);
    }

    const validation = validateRows({ slug, candidateUrl, parsedRows });

    tableCandidates.push({
      tableIndex: table.tableIndex,
      sourceTableRowCount: table.rowCount,
      parsedRowCount: validation.extractedRowCount,
      sample: table.sample,
      ...validation,
      rows: validation.rows.slice(0, 40)
    });
  }

  tableCandidates.sort((a, b) =>
    Number(b.validationPassed) - Number(a.validationPassed) ||
    b.parsedRowCount - a.parsedRowCount ||
    b.pointsArithmeticPassCount - a.pointsArithmeticPassCount
  );

  return tableCandidates;
}

function findArrays(value, pathName = "$", out = []) {
  if (out.length >= 80) return out;

  if (Array.isArray(value)) {
    out.push({ path: pathName, value });
    for (let i = 0; i < Math.min(value.length, 5); i += 1) {
      findArrays(value[i], `${pathName}[${i}]`, out);
    }
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      findArrays(child, `${pathName}.${key}`, out);
    }
  }

  return out;
}

function keyByTerms(obj, terms) {
  const keys = Object.keys(obj || {});
  return keys.find(key => terms.some(term => normalize(key).includes(normalize(term)))) || null;
}

function parseJsonStandingRows({ slug, candidateUrl, jsonText }) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }

  const arrays = findArrays(parsed);
  const candidates = [];

  for (const arr of arrays) {
    if (!Array.isArray(arr.value) || arr.value.length < 8 || arr.value.length > 40) continue;
    if (!arr.value.every(item => item && typeof item === "object" && !Array.isArray(item))) continue;

    const sample = arr.value.find(item => item && typeof item === "object") || {};
    const teamKey = keyByTerms(sample, ["team", "club", "name", "equipo", "clubnm", "clubname", "teamnm", "teamname"]);
    const rankKey = keyByTerms(sample, ["rank", "ranking", "position", "pos", "rankno", "rnk"]);
    const playedKey = keyByTerms(sample, ["played", "match", "game", "playedcnt", "cnt"]);
    const winsKey = keyByTerms(sample, ["wins", "win", "won"]);
    const drawsKey = keyByTerms(sample, ["draws", "draw"]);
    const lossesKey = keyByTerms(sample, ["losses", "loss", "lose", "lost"]);
    const pointsKey = keyByTerms(sample, ["points", "point", "pts"]);
    const gfKey = keyByTerms(sample, ["goalsfor", "goalfor", "득점", "gain", "gf"]);
    const gaKey = keyByTerms(sample, ["goalsagainst", "goalagainst", "실점", "ga"]);
    const gdKey = keyByTerms(sample, ["goaldiff", "diff", "gd"]);

    if (!teamKey || !pointsKey) continue;

    const parsedRows = arr.value.map(item => {
      const row = {
        slug,
        rank: rankKey ? parseIntStrict(item[rankKey]) : null,
        team: String(item[teamKey] ?? "").trim(),
        played: playedKey ? parseIntStrict(item[playedKey]) : null,
        wins: winsKey ? parseIntStrict(item[winsKey]) : null,
        draws: drawsKey ? parseIntStrict(item[drawsKey]) : null,
        losses: lossesKey ? parseIntStrict(item[lossesKey]) : null,
        goalsFor: gfKey ? parseIntStrict(item[gfKey]) : null,
        goalsAgainst: gaKey ? parseIntStrict(item[gaKey]) : null,
        goalDifference: gdKey ? parseIntStrict(item[gdKey]) : null,
        points: pointsKey ? parseIntStrict(item[pointsKey]) : null
      };

      row.playedArithmeticPass = row.played !== null && row.wins !== null && row.draws !== null && row.losses !== null
        ? row.played === row.wins + row.draws + row.losses
        : false;
      row.pointsArithmeticExpected = row.wins !== null && row.draws !== null ? row.wins * 3 + row.draws : null;
      row.pointsArithmeticPass = row.points !== null && row.pointsArithmeticExpected !== null
        ? row.points === row.pointsArithmeticExpected
        : false;
      row.gdArithmeticPass = row.goalsFor === null || row.goalsAgainst === null || row.goalDifference === null
        ? null
        : row.goalDifference === row.goalsFor - row.goalsAgainst;

      return row;
    }).filter(row => row.team);

    const validation = validateRows({ slug, candidateUrl, parsedRows });
    candidates.push({
      jsonArrayPath: arr.path,
      parsedRowCount: validation.extractedRowCount,
      keys: { teamKey, rankKey, playedKey, winsKey, drawsKey, lossesKey, pointsKey, gfKey, gaKey, gdKey },
      ...validation,
      rows: validation.rows.slice(0, 40)
    });
  }

  candidates.sort((a, b) =>
    Number(b.validationPassed) - Number(a.validationPassed) ||
    b.parsedRowCount - a.parsedRowCount ||
    b.pointsArithmeticPassCount - a.pointsArithmeticPassCount
  );

  return candidates;
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 AI-MatchLab-FootballTruth/1.0",
        "accept": "text/html,application/json,*/*;q=0.8"
      }
    });
    const body = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      finalUrl: res.url,
      contentType: res.headers.get("content-type") || "",
      body
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      finalUrl: url,
      contentType: "",
      body: "",
      error: `${error.name || "Error"}: ${error.message || String(error)}`
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

await fs.mkdir(outputDir, { recursive: true });

const inspection = JSON.parse(await fs.readFile(inspectionPath, "utf8"));
const targets = inspection.summary.nextExtractionTargets || [];

const outputRows = [];
let fetchExecutedNowCount = 0;
let fetched2xxCount = 0;
let fetchFailedCount = 0;

for (let i = 0; i < targets.length; i += 1) {
  const target = targets[i];
  console.log(`EXTRACT ${i + 1}/${targets.length} ${target.slug} ${target.proofOutcome} ${target.candidateUrl}`);

  const fetched = await fetchText(target.candidateUrl);
  fetchExecutedNowCount += 1;
  if (fetched.ok) fetched2xxCount += 1;
  else fetchFailedCount += 1;

  let candidates = [];
  let extractionMode = "none";

  if (fetched.ok && target.proofOutcome === "json_rank_table_candidate") {
    extractionMode = "json";
    candidates = parseJsonStandingRows({
      slug: target.slug,
      candidateUrl: fetched.finalUrl || target.candidateUrl,
      jsonText: fetched.body
    });
  } else if (fetched.ok) {
    extractionMode = "html_table";
    candidates = parseHtmlTarget({
      slug: target.slug,
      candidateUrl: fetched.finalUrl || target.candidateUrl,
      html: fetched.body
    });
  }

  const best = candidates[0] || null;

  outputRows.push({
    slug: target.slug,
    sourceLeague: target.sourceLeague,
    proofOutcome: target.proofOutcome,
    candidateUrl: target.candidateUrl,
    finalUrl: fetched.finalUrl,
    status: fetched.status,
    fetchOk: fetched.ok,
    contentType: fetched.contentType,
    title: fetched.ok ? titleOf(fetched.body) : "",
    bodyLength: fetched.body.length,
    extractionMode,
    candidateTableOrArrayCount: candidates.length,
    bestValidationPassed: best?.validationPassed === true,
    bestSeasonLabel: best?.seasonLabel || "unknown",
    expectedRows: expectedRowsBySlug[target.slug] || null,
    bestExtractedRowCount: best?.extractedRowCount || 0,
    bestRowCountPass: best?.rowCountPass || false,
    bestTeamSignalCount: best?.teamSignalCount || 0,
    bestTeamSignalPass: best?.teamSignalPass || false,
    bestPlayedArithmeticPassCount: best?.playedArithmeticPassCount || 0,
    bestPointsArithmeticPassCount: best?.pointsArithmeticPassCount || 0,
    bestGdArithmeticPassCount: best?.gdArithmeticPassCount || 0,
    bestRows: best?.rows || [],
    candidateSummaries: candidates.slice(0, 5).map(c => ({
      tableIndex: c.tableIndex ?? null,
      jsonArrayPath: c.jsonArrayPath ?? null,
      parsedRowCount: c.parsedRowCount,
      expectedRows: c.expectedRows,
      rowCountPass: c.rowCountPass,
      seasonLabel: c.seasonLabel,
      seasonScoped: c.seasonScoped,
      playedArithmeticPassCount: c.playedArithmeticPassCount,
      pointsArithmeticPassCount: c.pointsArithmeticPassCount,
      gdArithmeticKnownCount: c.gdArithmeticKnownCount,
      gdArithmeticPassCount: c.gdArithmeticPassCount,
      teamSignalCount: c.teamSignalCount,
      validationPassed: c.validationPassed,
      sample: c.sample ? c.sample.slice(0, 500) : ""
    })),
    acceptedNow: false,
    acceptanceAllowedNow: false,
    reviewOnly: true,
    error: fetched.error || null
  });

  await new Promise(resolve => setTimeout(resolve, 160));
}

const validationPassedRows = outputRows.filter(row => row.bestValidationPassed);
const bySlug = {};
for (const slug of [...new Set(outputRows.map(row => row.slug))].sort()) {
  const rows = outputRows.filter(row => row.slug === slug);
  bySlug[slug] = {
    targetCount: rows.length,
    fetched2xxCount: rows.filter(row => row.fetchOk).length,
    validationPassedCount: rows.filter(row => row.bestValidationPassed).length,
    bestRows: rows.map(row => ({
      proofOutcome: row.proofOutcome,
      candidateUrl: row.finalUrl || row.candidateUrl,
      status: row.status,
      extractionMode: row.extractionMode,
      bestValidationPassed: row.bestValidationPassed,
      bestSeasonLabel: row.bestSeasonLabel,
      expectedRows: row.expectedRows,
      bestExtractedRowCount: row.bestExtractedRowCount,
      bestTeamSignalCount: row.bestTeamSignalCount,
      bestPlayedArithmeticPassCount: row.bestPlayedArithmeticPassCount,
      bestPointsArithmeticPassCount: row.bestPointsArithmeticPassCount
    }))
  };
}

const report = {
  status: "passed",
  runner: "official_host_extraction_validation",
  contractVersion: 1,
  purpose: "Exact extraction and validation for proof-inspection nextExtractionTargets. Produces parsed rows and validation gates only; no canonical/truth/production writes.",
  inputInspectionPath: path.relative(root, inspectionPath).replaceAll("\\", "/"),
  inputInspectionSha256: await sha256(inspectionPath),
  output: path.relative(root, outputPath).replaceAll("\\", "/"),
  rowsOutput: path.relative(root, rowsOutputPath).replaceAll("\\", "/"),
  guardrails: {
    allowFetch,
    searchExecutedNowCount: 0,
    fetchExecutedNowCount,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  sourceInspectionSummary: inspection.summary,
  summary: {
    inputExtractionTargetCount: targets.length,
    inspectedTargetCount: outputRows.length,
    inspectedSlugCount: new Set(outputRows.map(row => row.slug)).size,
    fetched2xxCount,
    fetchFailedCount,
    htmlTargetCount: outputRows.filter(row => row.extractionMode === "html_table").length,
    jsonTargetCount: outputRows.filter(row => row.extractionMode === "json").length,
    validationPassedTargetCount: validationPassedRows.length,
    validationPassedSlugCount: new Set(validationPassedRows.map(row => row.slug)).size,
    validationPassedTargets: validationPassedRows.map(row => ({
      slug: row.slug,
      sourceLeague: row.sourceLeague,
      candidateUrl: row.finalUrl || row.candidateUrl,
      seasonLabel: row.bestSeasonLabel,
      expectedRows: row.expectedRows,
      extractedRowCount: row.bestExtractedRowCount,
      teamSignalCount: row.bestTeamSignalCount,
      playedArithmeticPassCount: row.bestPlayedArithmeticPassCount,
      pointsArithmeticPassCount: row.bestPointsArithmeticPassCount,
      gdArithmeticPassCount: row.bestGdArithmeticPassCount
    })),
    acceptedNowCount: 0
  },
  recommendation: {
    nextLane: "Review validationPassedTargets. If any pass all gates, create a proof-candidate board for explicit approval before any canonical write. For failures, inspect candidateSummaries and improve parser/renderer only for high-value slugs."
  },
  bySlug
};

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsOutputPath, outputRows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary,
  recommendation: report.recommendation
}, null, 2));
