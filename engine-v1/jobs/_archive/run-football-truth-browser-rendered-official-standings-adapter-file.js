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

const routeConfigArgIndex = argv.indexOf("--route-config");
const routeConfigPath = routeConfigArgIndex >= 0
  ? path.resolve(ROOT, argv[routeConfigArgIndex + 1])
  : path.join(ROOT, "engine-v1", "config", "football-truth-browser-rendered-official-route-families.json");

if (!fs.existsSync(routeConfigPath)) throw new Error(`Missing route family config: ${routeConfigPath}`);

const routeConfig = JSON.parse(fs.readFileSync(routeConfigPath, "utf8"));
if (!Array.isArray(routeConfig.families)) throw new Error("Route family config must contain families[]");

const targets = routeConfig.families.flatMap((family) => {
  if (!family.familyId || !family.sourceHost || !family.adapter || !Array.isArray(family.competitions)) {
    throw new Error(`Invalid route family config entry: ${JSON.stringify(family)}`);
  }
  return family.competitions.map((competition) => ({
    familyId: family.familyId,
    routeType: family.routeType || "official_browser_rendered",
    competitionSlug: competition.competitionSlug,
    expectedRows: competition.expectedRows,
    adapter: competition.adapter || family.adapter,
    sourceUrl: competition.sourceUrl,
    sourceHost: competition.sourceHost || family.sourceHost
  }));
});

const seasonMetaBySlug = new Map((routeConfig.families || []).flatMap((family) =>
  (family.competitions || []).map((competition) => [competition.competitionSlug, {
    seasonScope: competition.seasonScope || family.seasonScope || "unknown_needs_evidence",
    seasonLabel: competition.seasonLabel || family.seasonLabel || null,
    seasonStartDate: competition.seasonStartDate ?? family.seasonStartDate ?? null,
    seasonEndDate: competition.seasonEndDate ?? family.seasonEndDate ?? null,
    nextSeasonStartDate: competition.nextSeasonStartDate ?? family.nextSeasonStartDate ?? null,
    seasonStateEvidence: competition.seasonStateEvidence || family.seasonStateEvidence || null
  }])
));

for (const target of targets) {
  Object.assign(target, seasonMetaBySlug.get(target.competitionSlug) || {});
}

for (const target of targets) {
  if (!target.competitionSlug || !target.expectedRows || !target.adapter || !target.sourceUrl || !target.sourceHost) {
    throw new Error(`Invalid rendered route target: ${JSON.stringify(target)}`);
  }
}


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
  routeConfigPath: rel(routeConfigPath),
  routeFamilyCount: routeConfig.families.length,
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

function cleanBundesligaTeamName(raw) {
  const words = String(raw || "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return String(raw || "").trim();
  for (let split = Math.min(3, words.length - 1); split >= 1; split--) {
    const prefix = words.slice(0, split).join(" ");
    const rest = words.slice(split).join(" ");
    if (!rest) continue;
    if (norm(rest).includes(norm(prefix)) || norm(prefix) === norm(rest)) return rest;
  }
  return words.join(" ");
}

function parseBundesliga(target, rendered) {
  const plain = htmlToPlain(rendered.html);
  const marker = "Club P Won-Draw-Lost W-D-L G +/- Pts";
  const idx = plain.indexOf(marker);
  const segment = idx >= 0 ? plain.slice(idx + marker.length, idx + marker.length + 12000) : plain;

  const rowRegex = /(\d{1,2})\s+([A-Z0-9]{2,4})\s+(.+?)\s+(\d{1,2})\s+(\d{1,2})-(\d{1,2})-(\d{1,2})\s+(\d{1,3}):(\d{1,3})\s+([+-]?\d+)\s+(\d{1,3})(?=\s+\d{1,2}\s+[A-Z0-9]{2,4}\s+|\s+(?:UEFA|Promotion|Relegation|P Played|MORE BUNDESLIGA)|$)/g;

  const rawRows = [];
  for (const m of segment.matchAll(rowRegex)) {
    const teamNameRaw = m[3].trim();
    rawRows.push({
      competitionSlug: target.competitionSlug,
      provider: "browser_rendered_official",
      sourceHost: target.sourceHost,
      sourceUrl: target.sourceUrl,
      extractionAdapter: target.adapter,
      position: num(m[1]),
      teamCode: m[2],
      teamName: cleanBundesligaTeamName(teamNameRaw),
      teamNameRaw,
      played: num(m[4]),
      won: num(m[5]),
      drawn: num(m[6]),
      lost: num(m[7]),
      goalsFor: num(m[8]),
      goalsAgainst: num(m[9]),
      goalDifference: num(m[10]),
      points: num(m[11])
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

function parseDfb3Liga(target, rendered) {
  const tables = rendered.html.match(/<table[\s\S]*?<\/table>/gi) || [];
  const candidates = [];

  for (const table of tables) {
    const grid = tableGrid(table).filter((r) => r.length >= 3);
    if (grid.length < 10) continue;

    const headerIndex = grid.findIndex((r) => {
      const joined = r.map(norm).join("|");
      return joined.includes("platz") && joined.includes("mannschaft") && joined.includes("sp") && joined.includes("pkt");
    });
    if (headerIndex < 0) continue;

    const headers = grid[headerIndex].map((h) => String(h).trim());
    const exactHeaderIndex = (values) => {
      const ns = values.map(norm);
      return headers.findIndex((h) => ns.includes(norm(h)));
    };

    const positionI = exactHeaderIndex(["Platz"]);
    const teamI = exactHeaderIndex(["Mannschaft"]);
    const playedI = exactHeaderIndex(["SP"]);
    const wonI = exactHeaderIndex(["G"]);
    const drawnI = exactHeaderIndex(["U"]);
    const lostI = exactHeaderIndex(["V"]);
    const goalsI = exactHeaderIndex(["Tore"]);
    const gdI = exactHeaderIndex(["Diff.", "Diff"]);
    const ptsI = exactHeaderIndex(["Pkt.", "Pkt"]);

    const parsed = [];
    for (const r of grid.slice(headerIndex + 1)) {
      if (teamI < 0 || r.length <= teamI) continue;
      const splitGoals = splitGoalCell(goalsI >= 0 ? r[goalsI] : "");
      const row = {
        competitionSlug: target.competitionSlug,
        provider: "browser_rendered_official",
        sourceHost: target.sourceHost,
        sourceUrl: target.sourceUrl,
        extractionAdapter: target.adapter,
        position: positionI >= 0 ? num(r[positionI]) : num(r[0]),
        teamName: String(r[teamI] || "").trim(),
        played: playedI >= 0 ? num(r[playedI]) : null,
        won: wonI >= 0 ? num(r[wonI]) : null,
        drawn: drawnI >= 0 ? num(r[drawnI]) : null,
        lost: lostI >= 0 ? num(r[lostI]) : null,
        goalsFor: splitGoals.goalsFor,
        goalsAgainst: splitGoals.goalsAgainst,
        goalDifference: gdI >= 0 ? num(r[gdI]) : null,
        points: ptsI >= 0 ? num(r[ptsI]) : null
      };

      const completeNumeric = [row.position, row.played, row.won, row.drawn, row.lost, row.goalsFor, row.goalsAgainst, row.goalDifference, row.points].every((v) => v !== null);
      if (row.teamName && completeNumeric) parsed.push(row);
    }

    const rows = dedupeRows(parsed).slice(0, target.expectedRows);
    if (rows.length >= 10) {
      const ar = arithmetic(rows);
      candidates.push({ rows, arithmetic: ar, tableLength: table.length, gridRowCount: grid.length, header: headers });
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

function parseHnl(target, rendered) {
  const tables = rendered.html.match(/<table[\s\S]*?<\/table>/gi) || [];
  const candidates = [];

  for (const table of tables) {
    const grid = tableGrid(table).filter((r) => r.length >= 3);
    if (grid.length < 5) continue;

    const headerIndex = grid.findIndex((r) => r.some((c) => /klub|momčad|momcad|team|club|bod|pts|uk|utak|odigr|pob|pobj|ner|por|poraz|g\+|g-|gol|gr/i.test(c)));
    if (headerIndex < 0) continue;

    const headers = grid[headerIndex];
    const gfI = headers.findIndex((h) => String(h).trim().toLowerCase() === "g+");
    const gaI = headers.findIndex((h) => String(h).trim().toLowerCase() === "g-");
    const teamI = indexOfHeader(headers, ["klub", "momcad", "momčad", "team", "club"]);
    const posI = indexOfHeader(headers, ["#", "poz", "pos", "position"]);
    const playedI = indexOfHeader(headers, ["uk", "ut", "odigrano", "played", "matches", "o"]);
    const wonI = indexOfHeader(headers, ["pobjede", "pob", "won", "wins"]);
    const drawnI = indexOfHeader(headers, ["nerijeseno", "neriješeno", "ner", "draw", "drawn"]);
    const lostI = indexOfHeader(headers, ["por", "porazi", "poraz", "izgubljeno", "lost", "losses"]);
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
        goalsFor: gfI >= 0 ? num(r[gfI]) : splitGoals.goalsFor,
        goalsAgainst: gaI >= 0 ? num(r[gaI]) : splitGoals.goalsAgainst,
        goalDifference: gdI >= 0 ? num(r[gdI]) : null,
        points: ptsI >= 0 ? num(r[ptsI]) : (afterTeamNums.at(-1)?.value ?? null)
      };

      const numericCount = Object.entries(row).filter(([k, v]) => !["competitionSlug", "provider", "sourceHost", "sourceUrl", "extractionAdapter", "teamName"].includes(k) && v !== null).length;
      if (row.teamName && row.teamName.length >= 2 && numericCount >= 3) parsed.push(row);
    }

    const rows = dedupeRows(parsed).slice(0, target.expectedRows);
    if (rows.length >= 4) {
      const ar = arithmetic(rows);
      candidates.push({ rows, arithmetic: ar, tableLength: table.length, gridRowCount: grid.length, header: headers });
    }
  }

  candidates.sort((a, b) =>
    (b.arithmetic.status === "passed" ? 1 : 0) - (a.arithmetic.status === "passed" ? 1 : 0) ||
    b.rows.length - a.rows.length ||
    ((b.header || []).join("|").includes("Klub") ? 1 : 0) - ((a.header || []).join("|").includes("Klub") ? 1 : 0) ||
    b.tableLength - a.tableLength
  );

  return {
    tableCount: tables.length,
    bestCandidate: candidates[0] || null,
    rows: candidates[0]?.rows || []
  };
}



function spflCleanText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/\s+/g, " ")
    .trim();
}

function spflParseInt(text) {
  const t = String(text || "").replace(/,/g, "").trim();
  if (!/^-?\d+$/.test(t)) return null;
  return Number(t);
}

function parseSpflRenderedCells(rowHtml) {
  return [...String(rowHtml || "").matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((m) => spflCleanText(m[2]))
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function parseSpfl(target, rendered) {
  const html = String(rendered.html || rendered.dom || rendered.text || rendered.stdout || "");
  const tables = html.match(/<table\b[\s\S]*?<\/table>/gi) || [];
  const candidates = [];

  for (let tableIndex = 0; tableIndex < tables.length; tableIndex++) {
    const table = tables[tableIndex];
    const rowBlocks = table.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
    const rows = [];

    for (const rowHtml of rowBlocks) {
      const cells = parseSpflRenderedCells(rowHtml);
      if (cells.length < 8) continue;

      const position = spflParseInt(cells[0]);
      if (!Number.isInteger(position) || position < 1 || position > 30) continue;

      let teamIndex = -1;
      for (let i = 1; i < cells.length; i++) {
        if (/[A-Za-zÀ-ž]/.test(cells[i]) && spflParseInt(cells[i]) === null) {
          teamIndex = i;
          break;
        }
      }
      if (teamIndex < 0) continue;

      const teamName = cells[teamIndex].replace(/\s+/g, " ").trim();
      const nums = cells.slice(teamIndex + 1).map(spflParseInt).filter((n) => Number.isInteger(n));
      if (nums.length < 6) continue;

      const played = nums[0];
      const won = nums[1];
      const drawn = nums[2];
      const lost = nums[3];
      const goalDifference = nums[nums.length - 2];
      const points = nums[nums.length - 1];

      rows.push({
        competitionSlug: target.competitionSlug,
        seasonScope: target.seasonScope,
        seasonLabel: target.seasonLabel,
        seasonStartDate: target.seasonStartDate || null,
        seasonEndDate: target.seasonEndDate || null,
        nextSeasonStartDate: target.nextSeasonStartDate || null,
        provider: "browser_rendered_official",
        teamName,
        position,
        played,
        won,
        drawn,
        lost,
        goalsFor: null,
        goalsAgainst: null,
        goalDifference,
        points,
        sourceUrl: target.sourceUrl,
        sourceHost: target.sourceHost,
        extractionAdapter: "spfl_rendered_table",
        familyId: target.familyId,
        routeType: target.routeType,
        teamNameRaw: teamName
      });
    }

    const ar = arithmetic(rows);
    const signals = Array.isArray(target.expectedTeamSignals) ? target.expectedTeamSignals : [];
    const teamText = rows.map((r) => r.teamName).join(" | ").toLowerCase();
    const expectedTeamSignalCount = signals.filter((team) => teamText.includes(String(team).toLowerCase())).length;
    const expectedRowsMatch = rows.length === target.expectedRows;
    const selectionScore = (ar.status === "passed" ? 100000 : 0) + (expectedRowsMatch ? 10000 : 0) + expectedTeamSignalCount * 100 + rows.length;

    candidates.push({
      tableIndex,
      rows,
      arithmetic: ar,
      tableLength: table.length,
      gridRowCount: rowBlocks.length,
      expectedRowsMatch,
      expectedTeamSignalCount,
      selectionScore,
      header: parseSpflRenderedCells(rowBlocks[0] || "").slice(0, 12)
    });
  }

  candidates.sort((a, b) => b.selectionScore - a.selectionScore || b.rows.length - a.rows.length || b.tableLength - a.tableLength);

  return {
    tableCount: tables.length,
    bestCandidate: candidates[0] || null,
    rows: candidates[0]?.rows || []
  };
}



const GENERIC_RENDERED_TABLE_SCHEMA_REGISTRY = {
  "ned.1": {
    schemaId: "eredivisie_official_rendered_split_table_index_map_v2_logical_cells",
    cellNormalization: "split_pipe_logical_cells",
    expectedRows: 18,
    requiredLogicalColumnCount: 9,
    columns: {
      position: 0,
      team: 1,
      played: 2,
      won: 3,
      lost: 4,
      drawn: 5,
      goals: 6,
      goalDifference: 7,
      points: 8
    }
  }
};

function genericRenderedTableCleanText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/\s+/g, " ")
    .trim();
}

function genericRenderedTableInt(text) {
  const t = String(text || "").replace(/[^0-9+-]/g, "").replace(/^\+/, "").trim();
  if (!/^-?\d+$/.test(t)) return null;
  return Number(t);
}

function genericRenderedTableGoalPair(text) {
  const m = String(text || "").match(/(\d+)\s*[-:]\s*(\d+)/);
  if (!m) return { goalsFor: null, goalsAgainst: null, goalDifference: null };
  const goalsFor = Number(m[1]);
  const goalsAgainst = Number(m[2]);
  return { goalsFor, goalsAgainst, goalDifference: goalsFor - goalsAgainst };
}

function genericRenderedTablePhysicalCells(rowHtml) {
  return [...String(rowHtml || "").matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((m) => genericRenderedTableCleanText(m[2]).replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function genericRenderedTableLogicalCells(cells, schema) {
  const out = [];
  for (const cell of cells) {
    const parts = schema?.cellNormalization === "split_pipe_logical_cells"
      ? String(cell).split(/\s*\|\s*/).map((x) => x.trim()).filter(Boolean)
      : [cell];
    out.push(...parts);
  }
  return out;
}

function genericRenderedTableParseTables(html, schema) {
  const tables = String(html || "").match(/<table\b[\s\S]*?<\/table>/gi) || [];
  return tables.map((table, tableIndex) => {
    const rowBlocks = table.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
    const physicalGrid = rowBlocks.map(genericRenderedTablePhysicalCells).filter((row) => row.length);
    const logicalGrid = physicalGrid.map((row) => genericRenderedTableLogicalCells(row, schema)).filter((row) => row.length);
    return { tableIndex, tableLength: table.length, physicalGrid, grid: logicalGrid };
  });
}

function parseGenericRenderedTableByIndexMap(target, rendered) {
  const schema = target.renderedTableSchema || target.tableSchema || target.parserSchema || GENERIC_RENDERED_TABLE_SCHEMA_REGISTRY[target.competitionSlug] || {};
  const columns = schema.columns || {};
  const expectedRows = Number(target.expectedRows || target.expectedRowCount || schema.expectedRows || 0);
  const html = String(rendered.html || rendered.dom || rendered.text || rendered.stdout || "");
  const tables = genericRenderedTableParseTables(html, schema);
  const columnIndexes = Object.values(columns).filter(Number.isInteger);
  const requiredMaxIndex = columnIndexes.length ? Math.max(...columnIndexes) : 9999;
  const tableCandidates = [];
  const allRows = [];

  for (const table of tables) {
    const rows = [];
    for (const cells of table.grid) {
      if (cells.length <= requiredMaxIndex) continue;

      const position = genericRenderedTableInt(cells[columns.position]);
      const teamName = cells[columns.team];
      if (!Number.isInteger(position) || !teamName) continue;

      const goals = Number.isInteger(columns.goals)
        ? genericRenderedTableGoalPair(cells[columns.goals])
        : { goalsFor: null, goalsAgainst: null, goalDifference: null };

      const row = {
        competitionSlug: target.competitionSlug,
        seasonScope: target.seasonScope,
        seasonLabel: target.seasonLabel,
        seasonStartDate: target.seasonStartDate || null,
        seasonEndDate: target.seasonEndDate || null,
        nextSeasonStartDate: target.nextSeasonStartDate || null,
        provider: "browser_rendered_official",
        teamName,
        position,
        played: genericRenderedTableInt(cells[columns.played]),
        won: genericRenderedTableInt(cells[columns.won]),
        drawn: genericRenderedTableInt(cells[columns.drawn]),
        lost: genericRenderedTableInt(cells[columns.lost]),
        goalsFor: goals.goalsFor,
        goalsAgainst: goals.goalsAgainst,
        goalDifference: Number.isInteger(columns.goalDifference) ? genericRenderedTableInt(cells[columns.goalDifference]) : goals.goalDifference,
        points: genericRenderedTableInt(cells[columns.points]),
        sourceUrl: target.sourceUrl,
        sourceHost: target.sourceHost,
        extractionAdapter: "generic_rendered_table_by_index_map",
        familyId: target.familyId,
        routeType: target.routeType,
        teamNameRaw: teamName
      };

      if (![row.played, row.won, row.drawn, row.lost, row.points].every(Number.isInteger)) continue;
      rows.push(row);
    }

    if (rows.length) {
      tableCandidates.push({
        tableIndex: table.tableIndex,
        tableLength: table.tableLength,
        physicalGridRowCount: table.physicalGrid.length,
        logicalGridRowCount: table.grid.length,
        physicalColumnCountMax: Math.max(0, ...table.physicalGrid.map((r) => r.length)),
        logicalColumnCountMax: Math.max(0, ...table.grid.map((r) => r.length)),
        parsedRowCount: rows.length,
        firstRows: table.grid.slice(0, 10)
      });
      allRows.push(...rows);
    }
  }

  const byPosition = new Map();
  for (const row of allRows) if (!byPosition.has(row.position)) byPosition.set(row.position, row);
  const rows = [...byPosition.values()].sort((a, b) => a.position - b.position);

  const ar = arithmetic(rows);
  const signals = Array.isArray(target.expectedTeamSignals) ? target.expectedTeamSignals : [];
  const teamText = rows.map((r) => r.teamName).join(" | ").toLowerCase();
  const expectedTeamSignalCount = signals.filter((team) => teamText.includes(String(team).toLowerCase())).length;
  const expectedRowsMatch = expectedRows > 0 ? rows.length === expectedRows : false;

  return {
    tableCount: tables.length,
    tableCandidates,
    bestCandidate: {
      tableIndex: null,
      schemaId: schema.schemaId || null,
      expectedRowsMatch,
      expectedTeamSignalCount,
      arithmetic: ar,
      parsedRowCount: rows.length,
      splitTableCount: tableCandidates.length,
      header: tableCandidates[0]?.firstRows?.[0] || [],
      firstRows: tableCandidates.flatMap((c) => c.firstRows || []).slice(0, 20)
    },
    rows
  };
}


function parseTarget(target, rendered) {
  if (target.adapter === "generic_rendered_table_by_index_map") return parseGenericRenderedTableByIndexMap(target, rendered);
  if (target.adapter === "spfl_rendered_table") return parseSpfl(target, rendered);
  if (target.adapter === "laliga_rendered_text") return parseLaLiga(target, rendered);
  if (target.adapter === "bundesliga_rendered_text") return parseBundesliga(target, rendered);
  if (target.adapter === "dfb_3_liga_rendered_table") return parseDfb3Liga(target, rendered);
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
    familyId: target.familyId,
    routeType: target.routeType,
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

const sourceObservedAt = new Date().toISOString();
const targetBySlug = new Map(targets.map((target) => [target.competitionSlug, target]));
const seasonScopedAllRows = allRows.map((row) => {
  const target = targetBySlug.get(row.competitionSlug) || {};
  return {
    competitionSlug: row.competitionSlug,
    seasonScope: target.seasonScope || "unknown_needs_evidence",
    seasonLabel: target.seasonLabel || null,
    seasonStartDate: target.seasonStartDate ?? null,
    seasonEndDate: target.seasonEndDate ?? null,
    nextSeasonStartDate: target.nextSeasonStartDate ?? null,
    provider: row.provider,
    teamName: row.teamName,
    position: row.position,
    played: row.played,
    won: row.won,
    drawn: row.drawn,
    lost: row.lost,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
    goalDifference: row.goalDifference,
    points: row.points,
    sourceUrl: row.sourceUrl,
    sourceHost: row.sourceHost,
    sourceObservedAt,
    qualityGateStatus: row.qualityGateStatus,
    validationStatus: row.validationStatus,
    extractionAdapter: row.extractionAdapter,
    familyId: row.familyId || target.familyId || null,
    routeType: row.routeType || target.routeType || null,
    seasonStateEvidence: target.seasonStateEvidence || null,
    teamCode: row.teamCode,
    teamNameRaw: row.teamNameRaw
  };
});

summary.acceptedRowsCount = seasonScopedAllRows.length;
summary.seasonScopedRowsContractVersion = 1;

const report = { summary, renderedTargets, competitions, rows: seasonScopedAllRows };
const outPath = path.join(OUT_DIR, `browser-rendered-official-standings-adapter-${DATE}.json`);
const compactPath = path.join(OUT_DIR, `browser-rendered-official-standings-adapter-summary-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `browser-rendered-official-standings-adapter-rows-${DATE}.jsonl`);

fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
fs.writeFileSync(compactPath, `${JSON.stringify({
  summary,
  competitions,
  renderedTargets
}, null, 2)}\n`, "utf8");
fs.writeFileSync(rowsPath, seasonScopedAllRows.map((row) => JSON.stringify(row)).join("\n") + (seasonScopedAllRows.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  compactOutput: rel(compactPath),
  rowsOutput: rel(rowsPath),
  summary
}, null, 2));
