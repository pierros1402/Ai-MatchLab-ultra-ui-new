#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const argv = process.argv.slice(2);
const allowRender = argv.includes("--allow-render");

if (!allowRender) throw new Error("Refusing browser rendering without --allow-render");

const OUT_DIR = path.join(ROOT, "data", "football-truth", "_diagnostics", `browser-rendered-official-standings-adapter-${DATE}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

const browserCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].filter(Boolean);

const browser = browserCandidates.find((p) => fs.existsSync(p));
if (!browser) throw new Error("No Chrome/Edge executable found for browser-rendered official standings adapter");

const targets = [
  {
    competitionSlug: "esp.1",
    expectedRows: 20,
    adapter: "laliga_rendered_text",
    sourceUrl: "https://www.laliga.com/en-GB/laliga-easports/standing",
    sourceHost: "laliga.com"
  },
  {
    competitionSlug: "esp.2",
    expectedRows: 22,
    adapter: "laliga_rendered_text",
    sourceUrl: "https://www.laliga.com/en-GB/laliga-hypermotion/standing",
    sourceHost: "laliga.com"
  },
  {
    competitionSlug: "cro.1",
    expectedRows: 10,
    adapter: "hnl_rendered_table",
    sourceUrl: "https://hnl.hr/supersport-hnl/ljestvica/",
    sourceHost: "hnl.hr"
  }
];

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function rel(abs) {
  return path.relative(ROOT, abs).replaceAll("\\", "/");
}

function safeFilePart(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, "-");
}

function htmlToPlain(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(html) {
  return htmlToPlain(html);
}

function num(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(",", ".").replace("+", "").trim();
  const m = s.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function norm(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function arithmetic(rows) {
  let tested = 0;
  let failed = 0;
  const failures = [];

  for (const r of rows) {
    let rowTested = false;
    let rowFailed = false;

    if ([r.played, r.won, r.drawn, r.lost].every((v) => v !== null)) {
      rowTested = true;
      if (r.played !== r.won + r.drawn + r.lost) {
        rowFailed = true;
        failures.push({ teamName: r.teamName, check: "played=w+d+l", played: r.played, won: r.won, drawn: r.drawn, lost: r.lost });
      }
    }

    if ([r.points, r.won, r.drawn].every((v) => v !== null)) {
      rowTested = true;
      const expected = r.won * 3 + r.drawn;
      if (r.points !== expected) {
        rowFailed = true;
        failures.push({ teamName: r.teamName, check: "points=3w+d", points: r.points, expected, won: r.won, drawn: r.drawn });
      }
    }

    if (rowTested) {
      tested += 1;
      if (rowFailed) failed += 1;
    }
  }

  return { status: tested === 0 ? "not_assessed" : failed === 0 ? "passed" : "failed", tested, failed, failures: failures.slice(0, 20) };
}

function renderDom(target) {
  const safe = safeFilePart(target.competitionSlug);
  const htmlPath = path.join(OUT_DIR, `${safe}-rendered.html`);
  const stderrPath = path.join(OUT_DIR, `${safe}-rendered.stderr.txt`);
  const profileDir = path.join(OUT_DIR, `${safe}-chrome-profile`);
  fs.mkdirSync(profileDir, { recursive: true });

  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-sync",
    `--user-data-dir=${profileDir}`,
    "--virtual-time-budget=15000",
    "--dump-dom",
    target.sourceUrl
  ];

  const result = spawnSync(browser, args, {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 60000,
    maxBuffer: 1024 * 1024 * 30
  });

  fs.writeFileSync(htmlPath, result.stdout || "", "utf8");
  fs.writeFileSync(stderrPath, result.stderr || "", "utf8");

  return {
    browser,
    competitionSlug: target.competitionSlug,
    sourceUrl: target.sourceUrl,
    exitCode: result.status,
    signal: result.signal || null,
    htmlPath,
    stderrPath,
    byteCount: Buffer.byteLength(result.stdout || "", "utf8"),
    sha256: sha256(result.stdout || ""),
    html: result.stdout || ""
  };
}

function dedupeRows(rows) {
  const byPosition = new Map();
  const byTeam = new Set();
  for (const row of rows) {
    const key = `${row.position}:${norm(row.teamName)}`;
    if (byTeam.has(key)) continue;
    byTeam.add(key);
    if (!byPosition.has(row.position)) byPosition.set(row.position, row);
  }
  return [...byPosition.values()].sort((a, b) => (a.position || 999) - (b.position || 999));
}

function parseLaLiga(target, rendered) {
  const plain = htmlToPlain(rendered.html);
  const marker = "POS TEAM PTS Pld W D L GF GA GD";
  const idx = plain.indexOf(marker);
  const segment = idx >= 0 ? plain.slice(idx + marker.length, idx + marker.length + 12000) : plain;

  const rowRegex = /(\d{1,2})\s+([A-Z]{2,4})\s+(.+?)\s+(\d{1,3})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,3})\s+(\d{1,3})\s+([+-]?\d+)(?=\s+\d{1,2}\s+[A-Z]{2,4}\s+|$)/g;

  const rawRows = [];
  for (const m of segment.matchAll(rowRegex)) {
    rawRows.push({
      competitionSlug: target.competitionSlug,
      provider: "browser_rendered_official",
      sourceHost: target.sourceHost,
      sourceUrl: target.sourceUrl,
      extractionAdapter: target.adapter,
      position: num(m[1]),
      teamCode: m[2],
      teamName: m[3].trim(),
      points: num(m[4]),
      played: num(m[5]),
      won: num(m[6]),
      drawn: num(m[7]),
      lost: num(m[8]),
      goalsFor: num(m[9]),
      goalsAgainst: num(m[10]),
      goalDifference: num(m[11])
    });
  }

  const rows = dedupeRows(rawRows).slice(0, target.expectedRows);
  return {
    markerFound: idx >= 0,
    rawParsedRowCount: rawRows.length,
    rows
  };
}

function splitGoalCell(value) {
  const s = String(value || "");
  const m = s.match(/(\d+)\s*[:\-]\s*(\d+)/);
  if (!m) return { goalsFor: null, goalsAgainst: null };
  return { goalsFor: num(m[1]), goalsAgainst: num(m[2]) };
}

function tableGrid(tableHtml) {
  const rows = [];
  for (const rowMatch of tableHtml.matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
    const rowHtml = rowMatch[0];
    const cells = [];
    for (const cellMatch of rowHtml.matchAll(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)) {
      const cell = stripTags(cellMatch[1]);
      if (cell !== "") cells.push(cell);
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function indexOfHeader(headers, wanted) {
  const wantedNorm = wanted.map(norm);
  for (let i = 0; i < headers.length; i++) {
    const h = norm(headers[i]);
    if (wantedNorm.includes(h) || wantedNorm.some((w) => h.includes(w))) return i;
  }
  return -1;
}

function parseHnl(target, rendered) {
  const tables = rendered.html.match(/<table[\s\S]*?<\/table>/gi) || [];
  const candidates = [];

  for (const table of tables) {
    const grid = tableGrid(table).filter((r) => r.length >= 3);
    if (grid.length < 5) continue;

    let headerIndex = grid.findIndex((r) => r.some((c) => /klub|momčad|momcad|team|club|bod|pts|utak|odigr|pobj|ner|poraz|gol/i.test(c)));
    if (headerIndex < 0) headerIndex = 0;

    const headers = grid[headerIndex];
    const teamI = indexOfHeader(headers, ["klub", "momcad", "momčad", "team", "club"]);
    const posI = indexOfHeader(headers, ["#", "poz", "pos", "position"]);
    const playedI = indexOfHeader(headers, ["ut", "odigrano", "played", "matches", "o"]);
    const wonI = indexOfHeader(headers, ["pobjede", "pob", "won", "wins"]);
    const drawnI = indexOfHeader(headers, ["nerijeseno", "neriješeno", "ner", "draw", "drawn"]);
    const lostI = indexOfHeader(headers, ["porazi", "poraz", "izgubljeno", "lost", "losses"]);
    const ptsI = indexOfHeader(headers, ["bodovi", "bod", "points", "pts"]);
    const gdI = indexOfHeader(headers, ["gr", "golrazlika", "gol razlika", "gd"]);
    const gfgaI = indexOfHeader(headers, ["golovi", "goals"]);

    const parsed = [];
    for (const r of grid.slice(headerIndex + 1)) {
      let detectedTeamI = teamI;
      if (detectedTeamI < 0) {
        detectedTeamI = r.findIndex((cell, idx) => idx > 0 && /[A-Za-zČĆŽŠĐčćžšđ]/.test(cell) && !/^\d+$/.test(cell));
      }
      if (detectedTeamI < 0) continue;

      const numericCells = r.map((cell, idx) => ({ idx, value: num(cell), raw: cell })).filter((x) => x.value !== null);
      const afterTeamNums = numericCells.filter((x) => x.idx > detectedTeamI);

      const goalsCell = r.find((cell) => /\d+\s*[:\-]\s*\d+/.test(cell));
      const splitGoals = splitGoalCell(goalsCell);

      const row = {
        competitionSlug: target.competitionSlug,
        provider: "browser_rendered_official",
        sourceHost: target.sourceHost,
        sourceUrl: target.sourceUrl,
        extractionAdapter: target.adapter,
        position: posI >= 0 ? num(r[posI]) : num(r[0]),
        teamName: r[detectedTeamI].trim(),
        played: playedI >= 0 ? num(r[playedI]) : (afterTeamNums[0]?.value ?? null),
        won: wonI >= 0 ? num(r[wonI]) : (afterTeamNums[1]?.value ?? null),
        drawn: drawnI >= 0 ? num(r[drawnI]) : (afterTeamNums[2]?.value ?? null),
        lost: lostI >= 0 ? num(r[lostI]) : (afterTeamNums[3]?.value ?? null),
        goalsFor: splitGoals.goalsFor,
        goalsAgainst: splitGoals.goalsAgainst,
        goalDifference: gdI >= 0 ? num(r[gdI]) : null,
        points: ptsI >= 0 ? num(r[ptsI]) : (afterTeamNums.at(-1)?.value ?? null)
      };

      const numericCount = Object.entries(row).filter(([k, v]) => !["competitionSlug", "provider", "sourceHost", "sourceUrl", "extractionAdapter", "teamName"].includes(k) && v !== null).length;
      if (row.teamName && row.teamName.length >= 2 && numericCount >= 3) parsed.push(row);
    }

    const rows = dedupeRows(parsed).slice(0, target.expectedRows);
    if (rows.length >= 4) {
      const ar = arithmetic(rows);
      candidates.push({ rows, arithmetic: ar, tableLength: table.length, gridRowCount: grid.length });
    }
  }

  candidates.sort((a, b) =>
    (b.arithmetic.status === "passed" ? 1 : 0) - (a.arithmetic.status === "passed" ? 1 : 0) ||
    b.rows.length - a.rows.length ||
    b.tableLength - a.tableLength
  );

  return {
    tableCount: tables.length,
    bestCandidate: candidates[0] || null,
    rows: candidates[0]?.rows || []
  };
}

function parseTarget(target, rendered) {
  if (target.adapter === "laliga_rendered_text") return parseLaLiga(target, rendered);
  if (target.adapter === "hnl_rendered_table") return parseHnl(target, rendered);
  throw new Error(`Unknown adapter: ${target.adapter}`);
}

const renderedTargets = [];
const competitions = [];
const allRows = [];

for (const target of targets) {
  const rendered = renderDom(target);
  renderedTargets.push({
    competitionSlug: target.competitionSlug,
    sourceUrl: target.sourceUrl,
    exitCode: rendered.exitCode,
    signal: rendered.signal,
    byteCount: rendered.byteCount,
    htmlPath: rel(rendered.htmlPath),
    stderrPath: rel(rendered.stderrPath),
    sha256: rendered.sha256
  });

  const parsed = parseTarget(target, rendered);
  const rows = parsed.rows || [];
  const ar = arithmetic(rows);
  const qualityGateStatus =
    rendered.exitCode === 0 &&
    rendered.byteCount > 10000 &&
    rows.length >= target.expectedRows &&
    ar.status === "passed"
      ? "verified"
      : rows.length >= 4
        ? "review"
        : "unresolved";

  const competition = {
    competitionSlug: target.competitionSlug,
    adapter: target.adapter,
    sourceHost: target.sourceHost,
    sourceUrl: target.sourceUrl,
    expectedRows: target.expectedRows,
    renderedExitCode: rendered.exitCode,
    renderedByteCount: rendered.byteCount,
    parsedRowCount: rows.length,
    qualityGateStatus,
    arithmetic: ar,
    parserDiagnostics: { ...parsed, rows: undefined, bestCandidate: parsed.bestCandidate ? { ...parsed.bestCandidate, rows: undefined } : undefined }
  };

  competitions.push(competition);
  for (const row of rows) {
    allRows.push({
      ...row,
      qualityGateStatus,
      validationStatus: ar.status
    });
  }
}

const verifiedCompetitions = competitions.filter((c) => c.qualityGateStatus === "verified");
const summary = {
  status: "passed",
  runner: "browser_rendered_official_standings_adapter",
  browser,
  targetCompetitionCount: targets.length,
  searchExecutedNowCount: 0,
  broadSearchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: renderedTargets.length,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  verifiedCompetitionCount: verifiedCompetitions.length,
  reviewCompetitionCount: competitions.filter((c) => c.qualityGateStatus === "review").length,
  unresolvedCompetitionCount: competitions.filter((c) => c.qualityGateStatus === "unresolved").length,
  acceptedRowsCount: allRows.length,
  verifiedCompetitionSlugs: verifiedCompetitions.map((c) => c.competitionSlug),
  recommendedNextLane: verifiedCompetitions.length >= 2
    ? "promote_browser_rendered_official_adapter_family_and_add_more_official_rendered_routes"
    : "inspect_browser_rendered_official_adapter_failures"
};

const report = { summary, renderedTargets, competitions, rows: allRows };
const outPath = path.join(OUT_DIR, `browser-rendered-official-standings-adapter-${DATE}.json`);
const compactPath = path.join(OUT_DIR, `browser-rendered-official-standings-adapter-summary-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `browser-rendered-official-standings-adapter-rows-${DATE}.jsonl`);

fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
fs.writeFileSync(compactPath, `${JSON.stringify({
  summary,
  competitions,
  renderedTargets
}, null, 2)}\n`, "utf8");
fs.writeFileSync(rowsPath, allRows.map((row) => JSON.stringify(row)).join("\n") + (allRows.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  compactOutput: rel(compactPath),
  rowsOutput: rel(rowsPath),
  summary
}, null, 2));
