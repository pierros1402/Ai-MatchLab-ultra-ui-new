#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const argv = process.argv.slice(2);
const allowSearch = argv.includes("--allow-search");
const allowFetch = argv.includes("--allow-fetch");
const limitArg = Number(argv[argv.indexOf("--limit") + 1] || 80);
const maxCandidatesArg = Number(argv[argv.indexOf("--max-candidates") + 1] || 4);
const concurrencyArg = Number(argv[argv.indexOf("--concurrency") + 1] || 6);

if (!allowSearch) throw new Error("Refusing source discovery without --allow-search");
if (!allowFetch) throw new Error("Refusing candidate page acquisition without --allow-fetch");

const OUT_DIR = path.join(ROOT, "data", "football-truth", "_diagnostics", `source-agnostic-standings-discovery-${DATE}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

const TARGETS = [
  ["eng.1","Premier League","England"],["eng.2","Championship","England"],["eng.3","League One","England"],["eng.4","League Two","England"],
  ["esp.1","LaLiga","Spain"],["esp.2","LaLiga 2 Segunda Division","Spain"],["ger.1","Bundesliga","Germany"],["ger.2","2 Bundesliga","Germany"],
  ["ita.1","Serie A","Italy"],["ita.2","Serie B","Italy"],["fra.1","Ligue 1","France"],["fra.2","Ligue 2","France"],
  ["ned.1","Eredivisie","Netherlands"],["por.1","Primeira Liga","Portugal"],["bel.1","Belgian Pro League","Belgium"],["aut.1","Austrian Bundesliga","Austria"],["aut.2","2 Liga Austria","Austria"],
  ["sui.1","Swiss Super League","Switzerland"],["tur.1","Super Lig","Turkey"],["gre.1","Super League Greece","Greece"],["den.1","Danish Superliga","Denmark"],
  ["nor.1","Eliteserien","Norway"],["nor.2","OBOS-ligaen","Norway"],["swe.1","Allsvenskan","Sweden"],["swe.2","Superettan","Sweden"],
  ["fin.1","Veikkausliiga","Finland"],["pol.1","Ekstraklasa","Poland"],["cze.1","Czech First League","Czech Republic"],["cro.1","HNL Croatia","Croatia"],
  ["ser.1","Serbian SuperLiga","Serbia"],["ukr.1","Ukrainian Premier League","Ukraine"],["rou.1","Liga I Romania","Romania"],["bul.1","First League Bulgaria","Bulgaria"],["hun.1","NB I Hungary","Hungary"],
  ["sco.1","Scottish Premiership","Scotland"],["sco.2","Scottish Championship","Scotland"],["irl.1","League of Ireland Premier Division","Ireland"],["irl.2","League of Ireland First Division","Ireland"],["isl.1","Besta deild karla","Iceland"],
  ["usa.1","Major League Soccer","United States"],["mex.1","Liga MX","Mexico"],["bra.1","Brasileirao Serie A","Brazil"],["bra.2","Brasileirao Serie B","Brazil"],
  ["arg.1","Argentina Primera Division","Argentina"],["arg.2","Primera Nacional Argentina","Argentina"],["col.1","Categoria Primera A","Colombia"],["chi.1","Primera Division Chile","Chile"],
  ["per.1","Liga 1 Peru","Peru"],["uru.1","Primera Division Uruguay","Uruguay"],["ecu.1","LigaPro Ecuador Serie A","Ecuador"],["par.1","Primera Division Paraguay","Paraguay"],
  ["jpn.1","J1 League","Japan"],["jpn.2","J2 League","Japan"],["kor.1","K League 1","South Korea"],["chn.1","Chinese Super League","China"],
  ["aus.1","A-League Men","Australia"],["ksa.1","Saudi Pro League","Saudi Arabia"],["qat.1","Qatar Stars League","Qatar"],["uae.1","UAE Pro League","United Arab Emirates"],
  ["tha.1","Thai League 1","Thailand"],["idn.1","Liga 1 Indonesia","Indonesia"],["ind.1","Indian Super League","India"],["mas.1","Malaysia Super League","Malaysia"],
  ["rsa.1","South African Premiership","South Africa"],["egy.1","Egyptian Premier League","Egypt"],["mar.1","Botola Pro","Morocco"],["tun.1","Tunisian Ligue Professionnelle 1","Tunisia"]
].map(([competitionSlug, name, country]) => ({ competitionSlug, name, country }));

const stats = {
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0
};

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function rel(abs) {
  return path.relative(ROOT, abs).replaceAll("\\", "/");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeHtml(s) {
  return String(s ?? "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function stripTags(s) {
  return decodeHtml(String(s ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function norm(s) {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "");
}

function num(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const m = String(v).replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

async function fetchText(url, timeoutMs = 6500) {
  stats.fetchExecutedNowCount += 1;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 Ai-MatchLab source-agnostic standings discovery",
        "accept": "text/html,application/xhtml+xml,application/json,text/plain,*/*"
      }
    });
    const text = await r.text();
    return {
      ok: r.ok,
      status: r.status,
      url: r.url || url,
      contentType: r.headers.get("content-type") || "",
      text,
      bytes: Buffer.byteLength(text, "utf8"),
      sha256: sha256(text)
    };
  } catch (e) {
    return { ok: false, status: null, url, error: String(e?.message || e), text: "", bytes: 0 };
  } finally {
    clearTimeout(timer);
  }
}

function decodeBingU(u) {
  try {
    if (!u) return null;
    if (u.startsWith("a1")) {
      const b64 = u.slice(2).replace(/-/g, "+").replace(/_/g, "/");
      return Buffer.from(b64, "base64").toString("utf8");
    }
  } catch {}
  return null;
}

function normalizeHref(href, base) {
  try {
    let h = decodeHtml(href);
    if (h.startsWith("//")) h = `https:${h}`;
    const u = new URL(h, base);
    if (u.hostname.includes("duckduckgo.com") && u.pathname.includes("/l/") && u.searchParams.get("uddg")) {
      return u.searchParams.get("uddg");
    }
    if (u.hostname.includes("bing.com") && u.searchParams.get("u")) {
      const decoded = decodeBingU(u.searchParams.get("u"));
      if (decoded) return decoded;
    }
    return u.href;
  } catch {
    return null;
  }
}

function isBadUrl(url) {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    const p = u.pathname.toLowerCase();
    if (!["http:", "https:"].includes(u.protocol)) return true;
    if (h.includes("bing.com") || h.includes("duckduckgo.com") || h.includes("google.") || h.includes("youtube.") || h.includes("facebook.") || h.includes("instagram.") || h.includes("tiktok.") || h.includes("x.com") || h.includes("twitter.")) return true;
    if (p.endsWith(".jpg") || p.endsWith(".png") || p.endsWith(".gif") || p.endsWith(".svg") || p.endsWith(".css") || p.endsWith(".js") || p.endsWith(".pdf")) return true;
    return false;
  } catch {
    return true;
  }
}

function extractUrls(html, base) {
  const urls = [];
  for (const m of String(html ?? "").matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const u = normalizeHref(m[1], base);
    if (u && !isBadUrl(u)) urls.push(u);
  }
  return [...new Set(urls)];
}

async function searchWeb(query) {
  stats.searchExecutedNowCount += 2;
  const q = encodeURIComponent(query);
  const urls = [
    `https://duckduckgo.com/html/?q=${q}`,
    `https://www.bing.com/search?q=${q}`
  ];
  const pages = await Promise.all(urls.map((u) => fetchText(u, 6500)));
  return [...new Set(pages.flatMap((p) => extractUrls(p.text, p.url)))];
}

function colIndex(headers, names) {
  const wanted = names.map(norm);
  for (let i = 0; i < headers.length; i++) {
    const h = norm(headers[i]);
    if (wanted.includes(h)) return i;
    if (wanted.some((w) => h === w || h.includes(w))) return i;
  }
  return -1;
}

function parseTables(html) {
  const candidates = [];
  const tableMatches = String(html ?? "").match(/<table[\s\S]*?<\/table>/gi) || [];
  for (const table of tableMatches) {
    const rowHtmls = table.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    const grid = rowHtmls.map((row) => {
      const cells = [];
      for (const m of row.matchAll(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)) cells.push(stripTags(m[1]));
      return cells.filter((x) => x !== "");
    }).filter((r) => r.length >= 3);
    if (grid.length < 5) continue;

    let headerRowIndex = grid.findIndex((r) => r.some((c) => /team|club|squad|played|points|pts|won|draw|lost|w\b|d\b|l\b/i.test(c)));
    if (headerRowIndex < 0) headerRowIndex = 0;
    const headers = grid[headerRowIndex];

    let teamI = colIndex(headers, ["team", "club", "squad", "name"]);
    const posI = colIndex(headers, ["#", "pos", "position", "rank"]);
    const playedI = colIndex(headers, ["p", "pl", "pld", "mp", "played", "matches"]);
    const wonI = colIndex(headers, ["w", "won", "wins"]);
    const drawnI = colIndex(headers, ["d", "draw", "drawn", "draws", "t"]);
    const lostI = colIndex(headers, ["l", "lost", "losses"]);
    const gfI = colIndex(headers, ["gf", "f", "goalsfor", "goals for"]);
    const gaI = colIndex(headers, ["ga", "a", "goalsagainst", "goals against"]);
    const gdI = colIndex(headers, ["gd", "diff", "goaldifference", "goal difference"]);
    const ptsI = colIndex(headers, ["pts", "points", "pnts"]);

    const dataRows = grid.slice(headerRowIndex + 1);
    const rows = [];

    for (const r of dataRows) {
      if (teamI < 0) {
        const candidateTeamIndex = r.findIndex((cell, idx) => idx > 0 && /[A-Za-zΑ-Ωα-ω]/.test(cell) && !/^\d+$/.test(cell));
        teamI = candidateTeamIndex >= 0 ? candidateTeamIndex : 0;
      }

      const teamName = stripTags(r[teamI] || "").replace(/^\d+\s+/, "").trim();
      if (!teamName || teamName.length < 2 || /^team|club|squad$/i.test(teamName)) continue;

      const row = {
        teamName,
        position: posI >= 0 ? num(r[posI]) : num(r[0]),
        played: playedI >= 0 ? num(r[playedI]) : null,
        won: wonI >= 0 ? num(r[wonI]) : null,
        drawn: drawnI >= 0 ? num(r[drawnI]) : null,
        lost: lostI >= 0 ? num(r[lostI]) : null,
        goalsFor: gfI >= 0 ? num(r[gfI]) : null,
        goalsAgainst: gaI >= 0 ? num(r[gaI]) : null,
        goalDifference: gdI >= 0 ? num(r[gdI]) : null,
        points: ptsI >= 0 ? num(r[ptsI]) : null
      };

      const numericCount = Object.entries(row).filter(([k, v]) => k !== "teamName" && v !== null).length;
      if (numericCount >= 3) rows.push(row);
    }

    const unique = dedupeRows(rows);
    if (unique.length >= 4) candidates.push({ kind: "html_table", rows: unique });
  }
  return candidates;
}

function teamFromObj(o) {
  if (!o || typeof o !== "object") return null;
  const direct = o.teamName || o.name || o.displayName || o.clubName || o.squadName;
  if (typeof direct === "string" && direct.length > 1) return direct;
  for (const key of ["team", "club", "competitor", "participant"]) {
    const v = o[key];
    if (typeof v === "string" && v.length > 1) return v;
    if (v && typeof v === "object") {
      const t = v.displayName || v.name || v.shortName || v.fullName || v.abbreviation;
      if (typeof t === "string" && t.length > 1) return t;
    }
  }
  return null;
}

function valueFromObj(o, names) {
  for (const name of names) {
    for (const key of Object.keys(o || {})) {
      if (norm(key) === norm(name)) {
        const v = num(o[key]);
        if (v !== null) return v;
      }
    }
  }
  const stats = Array.isArray(o?.stats) ? o.stats : Array.isArray(o?.statistics) ? o.statistics : [];
  for (const s of stats) {
    const label = norm(s.name || s.displayName || s.shortDisplayName || s.abbreviation || s.type);
    if (names.map(norm).includes(label)) {
      const v = num(s.value ?? s.displayValue);
      if (v !== null) return v;
    }
  }
  return null;
}

function parseObjRow(o) {
  const teamName = teamFromObj(o);
  if (!teamName) return null;
  const row = {
    teamName: String(teamName).trim(),
    position: valueFromObj(o, ["rank", "position", "pos", "place"]),
    played: valueFromObj(o, ["played", "matchesPlayed", "gamesPlayed", "mp", "p", "pld", "gp"]),
    won: valueFromObj(o, ["won", "wins", "w"]),
    drawn: valueFromObj(o, ["drawn", "draws", "draw", "d", "ties", "t"]),
    lost: valueFromObj(o, ["lost", "losses", "l"]),
    goalsFor: valueFromObj(o, ["goalsFor", "gf", "for"]),
    goalsAgainst: valueFromObj(o, ["goalsAgainst", "ga", "against"]),
    goalDifference: valueFromObj(o, ["goalDifference", "gd", "diff"]),
    points: valueFromObj(o, ["points", "pts"])
  };
  const numericCount = Object.entries(row).filter(([k, v]) => k !== "teamName" && v !== null).length;
  return numericCount >= 3 ? row : null;
}

function recurseArrays(node, out = [], seen = new Set()) {
  if (!node || typeof node !== "object") return out;
  if (seen.has(node)) return out;
  seen.add(node);
  if (Array.isArray(node)) {
    if (node.length >= 4) {
      const rows = node.map(parseObjRow).filter(Boolean);
      if (rows.length >= 4) out.push({ kind: "embedded_json", rows: dedupeRows(rows) });
    }
    for (const item of node) recurseArrays(item, out, seen);
    return out;
  }
  for (const v of Object.values(node)) recurseArrays(v, out, seen);
  return out;
}

function parseEmbeddedJson(html) {
  const candidates = [];
  const scripts = [...String(html ?? "").matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => decodeHtml(m[1]).trim()).filter(Boolean);
  for (const s of scripts) {
    const trimmed = s.trim();
    const jsonCandidates = [];
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) jsonCandidates.push(trimmed);
    const next = trimmed.match(/\{[\s\S]*"props"[\s\S]*\}/);
    if (next) jsonCandidates.push(next[0]);
    for (const jc of jsonCandidates.slice(0, 2)) {
      try {
        const j = JSON.parse(jc);
        candidates.push(...recurseArrays(j));
      } catch {}
    }
  }
  return candidates;
}

function dedupeRows(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = norm(r.teamName);
    if (!key || map.has(key)) continue;
    map.set(key, r);
  }
  return [...map.values()];
}

function arithmetic(rows) {
  let tested = 0, failed = 0;
  const failures = [];
  for (const r of rows) {
    let rowTested = false, rowFailed = false;
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
        failures.push({ teamName: r.teamName, check: "points=3w+d", points: r.points, expected });
      }
    }
    if (rowTested) {
      tested += 1;
      if (rowFailed) failed += 1;
    }
  }
  return { status: tested === 0 ? "not_assessed" : failed === 0 ? "passed" : "failed_or_variant_scoring", tested, failed, failures: failures.slice(0, 8) };
}

function scoreCandidate(candidate, target, sourceUrl, text) {
  const rows = dedupeRows(candidate.rows || []);
  const a = arithmetic(rows);
  const nameEvidence = norm(text).includes(norm(target.name)) || norm(text).includes(norm(target.country));
  const currentEvidence = /2026|2025\/26|2025-26|2025–26|current season|standings|table/i.test(text);
  const numericDensity = rows.reduce((sum, r) => sum + Object.entries(r).filter(([k, v]) => k !== "teamName" && v !== null).length, 0);
  const score = rows.length * 100 + numericDensity + (a.status === "passed" ? 600 : 0) + (nameEvidence ? 120 : 0) + (currentEvidence ? 80 : 0);
  return { ...candidate, rows, arithmetic: a, score, sourceUrl, nameEvidence, currentEvidence };
}

function extractFromPage(target, page) {
  const candidates = [
    ...parseTables(page.text),
    ...parseEmbeddedJson(page.text)
  ].filter((c) => c.rows?.length >= 4)
   .map((c) => scoreCandidate(c, target, page.url, page.text))
   .sort((a, b) => b.score - a.score || b.rows.length - a.rows.length);
  return candidates[0] || null;
}

function querySet(target) {
  return [
    `${target.name} ${target.country} standings table 2026 football`,
    `${target.name} league table standings current season`
  ];
}

async function processTarget(target) {
  const searchUrls = [];
  const searchQueries = querySet(target);

  for (const q of searchQueries) {
    const urls = await searchWeb(q);
    searchUrls.push(...urls);
    await sleep(120);
  }

  const uniqueUrls = [...new Set(searchUrls)]
    .filter((u) => !isBadUrl(u))
    .slice(0, maxCandidatesArg);

  const attempts = [];
  for (const url of uniqueUrls) {
    const page = await fetchText(url, 6500);
    const attempt = {
      url,
      finalUrl: page.url,
      ok: page.ok,
      status: page.status,
      contentType: page.contentType || null,
      bytes: page.bytes,
      sha256: page.sha256 || null,
      error: page.error || null
    };

    if (page.ok && page.text) {
      const best = extractFromPage(target, page);
      if (best && best.rows.length >= 8) {
        const rows = best.rows.map((r, index) => ({
          competitionSlug: target.competitionSlug,
          competitionName: target.name,
          country: target.country,
          provider: "source_agnostic_discovered",
          sourceUrl: best.sourceUrl,
          extractionKind: best.kind,
          position: r.position ?? index + 1,
          teamName: r.teamName,
          played: r.played,
          won: r.won,
          drawn: r.drawn,
          lost: r.lost,
          goalsFor: r.goalsFor,
          goalsAgainst: r.goalsAgainst,
          goalDifference: r.goalDifference,
          points: r.points,
          validationStatus: best.arithmetic.status,
          currentEvidence: best.currentEvidence,
          nameEvidence: best.nameEvidence
        }));
        return {
          competitionSlug: target.competitionSlug,
          name: target.name,
          country: target.country,
          status: "usable_standings_extracted",
          rowCount: rows.length,
          arithmetic: best.arithmetic,
          sourceUrl: best.sourceUrl,
          extractionKind: best.kind,
          searchQueries,
          candidateUrlCount: uniqueUrls.length,
          attempts: [...attempts, { ...attempt, parseStatus: "usable_standings_extracted" }],
          rows
        };
      }
      attempt.parseStatus = best ? `candidate_too_small_or_weak:${best.rows.length}:${best.arithmetic.status}` : "no_table_or_embedded_json_rows";
    } else {
      attempt.parseStatus = "fetch_failed_or_empty";
    }
    attempts.push(attempt);
    await sleep(80);
  }

  return {
    competitionSlug: target.competitionSlug,
    name: target.name,
    country: target.country,
    status: "no_usable_standings_extracted",
    rowCount: 0,
    arithmetic: { status: "not_assessed", tested: 0, failed: 0, failures: [] },
    sourceUrl: null,
    extractionKind: null,
    searchQueries,
    candidateUrlCount: uniqueUrls.length,
    attempts,
    rows: []
  };
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

const startedAt = new Date().toISOString();
const targets = TARGETS.slice(0, Math.min(limitArg, TARGETS.length));
const results = await mapLimit(targets, concurrencyArg, processTarget);
const rows = results.flatMap((r) => r.rows || []);
const usable = results.filter((r) => r.status === "usable_standings_extracted");
const arithmeticPassed = usable.filter((r) => r.arithmetic.status === "passed");

const summary = {
  status: "passed",
  runner: "source_agnostic_standings_discovery",
  strategy: "target_competitions_not_target_sources_search_fetch_extract_validate",
  startedAt,
  finishedAt: new Date().toISOString(),
  targetCompetitionCount: targets.length,
  searchExecutedNowCount: stats.searchExecutedNowCount,
  broadSearchExecutedNowCount: stats.searchExecutedNowCount,
  fetchExecutedNowCount: stats.fetchExecutedNowCount,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  usableStandingsLeagueCount: usable.length,
  arithmeticPassedLeagueCount: arithmeticPassed.length,
  totalStandingRowCount: rows.length,
  usableLeagueSlugs: usable.map((r) => r.competitionSlug),
  arithmeticPassedLeagueSlugs: arithmeticPassed.map((r) => r.competitionSlug),
  unresolvedLeagueCount: results.filter((r) => r.status !== "usable_standings_extracted").length,
  recommendedNextLane: usable.length >= 20
    ? "promote_source_agnostic_extractor_to_repeatable_coverage_machine_with_source_memory"
    : "source_agnostic_search_extraction_insufficient_need_browser_or_external_search_api_or_dedicated_provider"
};

const outPath = path.join(OUT_DIR, `source-agnostic-standings-discovery-${DATE}.json`);
const compactPath = path.join(OUT_DIR, `source-agnostic-standings-discovery-summary-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `source-agnostic-standings-rows-${DATE}.jsonl`);

fs.writeFileSync(outPath, `${JSON.stringify({ summary, results, rows }, null, 2)}\n`, "utf8");
fs.writeFileSync(compactPath, `${JSON.stringify({
  summary,
  usable: usable.map((r) => ({
    competitionSlug: r.competitionSlug,
    name: r.name,
    country: r.country,
    rowCount: r.rowCount,
    arithmeticStatus: r.arithmetic.status,
    sourceUrl: r.sourceUrl,
    extractionKind: r.extractionKind
  })),
  unresolved: results.filter((r) => r.status !== "usable_standings_extracted").map((r) => ({
    competitionSlug: r.competitionSlug,
    name: r.name,
    country: r.country,
    candidateUrlCount: r.candidateUrlCount,
    lastParseStatuses: r.attempts.slice(-4).map((a) => ({ status: a.status, parseStatus: a.parseStatus, url: a.finalUrl || a.url }))
  }))
}, null, 2)}\n`, "utf8");
fs.writeFileSync(rowsPath, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  compactOutput: rel(compactPath),
  rowsOutput: rel(rowsPath),
  summary
}, null, 2));
