#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const argv = process.argv.slice(2);
const allowSearch = argv.includes("--allow-search");
const allowFetch = argv.includes("--allow-fetch");
const limit = Number(argv[argv.indexOf("--limit") + 1] || 67);
const maxCandidates = Number(argv[argv.indexOf("--max-candidates") + 1] || 10);
const concurrency = Number(argv[argv.indexOf("--concurrency") + 1] || 4);

if (!allowSearch) throw new Error("Refusing search without --allow-search");
if (!allowFetch) throw new Error("Refusing fetch without --allow-fetch");

const OUT_DIR = path.join(ROOT, "data", "football-truth", "_diagnostics", `source-agnostic-standings-discovery-v2-${DATE}`);
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

const stats = { searchExecutedNowCount: 0, fetchExecutedNowCount: 0 };

const lowTrustHosts = [
  "wikipedia.org","github.com","gist.github.com","fandom.com","dbpedia.org","wikidata.org",
  "facebook.com","instagram.com","x.com","twitter.com","youtube.com","tiktok.com"
];

const officialHosts = [
  "premierleague.com","efl.com","laliga.com","bundesliga.com","legaseriea.it","legab.it","ligue1.com","eredivisie.nl",
  "spfl.co.uk","hnl.hr","mlssoccer.com","jleague.co","jleague.jp","kleague.com","spl.com.sa","qsl.qa",
  "indiansuperleague.com","ligaindonesiabaru.com","veikkausliiga.com","allsvenskan.se","fotball.no","obos-ligaen.no"
];

const trustedDataHosts = [
  "bbc.co.uk","skysports.com","sportinglife.com","footballwebpages.co.uk","worldfootball.net","soccerway.com",
  "fbref.com","soccerstats.com","flashscore.com","espn.com","theathletic.com","onefootball.com"
];

function sha256(text) { return crypto.createHash("sha256").update(text).digest("hex"); }
function rel(abs) { return path.relative(ROOT, abs).replaceAll("\\", "/"); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}

function hostMatches(host, patterns) {
  return patterns.some((p) => host === p || host.endsWith(`.${p}`));
}

function sourceClass(url) {
  const host = hostOf(url);
  if (!host) return { class: "missing", priority: -100, trusted: false };
  if (hostMatches(host, lowTrustHosts)) return { class: "low_trust_suppressed", priority: -1000, trusted: false };
  if (hostMatches(host, officialHosts)) return { class: "official_or_league", priority: 1000, trusted: true };
  if (hostMatches(host, trustedDataHosts)) return { class: "trusted_sports_data_or_media", priority: 700, trusted: true };
  return { class: "unknown_candidate", priority: 100, trusted: false };
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
    if (u.hostname.includes("duckduckgo.com") && u.pathname.includes("/l/") && u.searchParams.get("uddg")) return u.searchParams.get("uddg");
    if (u.hostname.includes("bing.com") && u.searchParams.get("u")) return decodeBingU(u.searchParams.get("u")) || u.href;
    return u.href;
  } catch { return null; }
}

function badUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const p = u.pathname.toLowerCase();
    if (!["http:", "https:"].includes(u.protocol)) return true;
    if (host.includes("bing.com") || host.includes("duckduckgo.com") || host.includes("google.")) return true;
    if (p.endsWith(".jpg") || p.endsWith(".png") || p.endsWith(".gif") || p.endsWith(".svg") || p.endsWith(".css") || p.endsWith(".js") || p.endsWith(".pdf")) return true;
    return sourceClass(url).class === "low_trust_suppressed";
  } catch { return true; }
}

function extractUrls(html, base) {
  const urls = [];
  for (const m of String(html ?? "").matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const u = normalizeHref(m[1], base);
    if (u && !badUrl(u)) urls.push(u);
  }
  return [...new Set(urls)];
}

async function fetchText(url, timeoutMs = 7000) {
  stats.fetchExecutedNowCount += 1;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 Ai-MatchLab source-agnostic v2",
        "accept": "text/html,application/xhtml+xml,application/json,text/plain,*/*"
      }
    });
    const text = await r.text();
    return { ok: r.ok, status: r.status, url: r.url || url, contentType: r.headers.get("content-type") || "", text, bytes: Buffer.byteLength(text, "utf8"), sha256: sha256(text) };
  } catch (e) {
    return { ok: false, status: null, url, text: "", bytes: 0, error: String(e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

async function searchWeb(query) {
  const q = encodeURIComponent(query);
  const urls = [`https://duckduckgo.com/html/?q=${q}`, `https://www.bing.com/search?q=${q}`];
  stats.searchExecutedNowCount += urls.length;
  const pages = await Promise.all(urls.map((u) => fetchText(u, 7000)));
  return [...new Set(pages.flatMap((p) => extractUrls(p.text, p.url)))];
}

function colIndex(headers, names) {
  const wanted = names.map(norm);
  for (let i = 0; i < headers.length; i++) {
    const h = norm(headers[i]);
    if (wanted.includes(h) || wanted.some((w) => h.includes(w))) return i;
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
      return cells.filter(Boolean);
    }).filter((r) => r.length >= 3);
    if (grid.length < 5) continue;

    let headerRowIndex = grid.findIndex((r) => r.some((c) => /team|club|squad|played|points|pts|won|draw|lost|position|pos/i.test(c)));
    if (headerRowIndex < 0) headerRowIndex = 0;
    const headers = grid[headerRowIndex];

    const posI = colIndex(headers, ["#", "pos", "position", "rank"]);
    const teamI0 = colIndex(headers, ["team", "club", "squad", "name"]);
    const playedI = colIndex(headers, ["p", "pl", "pld", "mp", "played", "matches"]);
    const wonI = colIndex(headers, ["w", "won", "wins"]);
    const drawnI = colIndex(headers, ["d", "draw", "drawn", "draws", "t"]);
    const lostI = colIndex(headers, ["l", "lost", "losses"]);
    const gfI = colIndex(headers, ["gf", "f", "goalsfor", "goals for"]);
    const gaI = colIndex(headers, ["ga", "a", "goalsagainst", "goals against"]);
    const gdI = colIndex(headers, ["gd", "diff", "goaldifference", "goal difference"]);
    const ptsI = colIndex(headers, ["pts", "points", "pnts"]);

    const rows = [];
    for (const r of grid.slice(headerRowIndex + 1)) {
      let teamI = teamI0;
      if (teamI < 0) teamI = r.findIndex((cell, idx) => idx > 0 && /[A-Za-zΑ-Ωα-ω]/.test(cell) && !/^\d+$/.test(cell));
      if (teamI < 0) teamI = 0;

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
      const numeric = Object.entries(row).filter(([k, v]) => k !== "teamName" && v !== null).length;
      if (numeric >= 3) rows.push(row);
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
  for (const key of Object.keys(o || {})) {
    if (names.map(norm).includes(norm(key))) {
      const v = num(o[key]);
      if (v !== null) return v;
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
  const numeric = Object.entries(row).filter(([k, v]) => k !== "teamName" && v !== null).length;
  return numeric >= 3 ? row : null;
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
    const possible = [];
    if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) possible.push(s);
    const nextData = s.match(/\{[\s\S]*"props"[\s\S]*\}/);
    if (nextData) possible.push(nextData[0]);
    for (const p of possible.slice(0, 2)) {
      try { candidates.push(...recurseArrays(JSON.parse(p))); } catch {}
    }
  }
  return candidates;
}

function dedupeRows(rows) {
  const map = new Map();
  for (const r of rows || []) {
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
    let t = false, f = false;
    if ([r.played, r.won, r.drawn, r.lost].every((v) => v !== null)) {
      t = true;
      if (r.played !== r.won + r.drawn + r.lost) {
        f = true;
        failures.push({ teamName: r.teamName, check: "played=w+d+l", played: r.played, won: r.won, drawn: r.drawn, lost: r.lost });
      }
    }
    if ([r.points, r.won, r.drawn].every((v) => v !== null)) {
      t = true;
      const expected = r.won * 3 + r.drawn;
      if (r.points !== expected) {
        f = true;
        failures.push({ teamName: r.teamName, check: "points=3w+d", points: r.points, expected, won: r.won, drawn: r.drawn });
      }
    }
    if (t) {
      tested += 1;
      if (f) failed += 1;
    }
  }
  return { status: tested === 0 ? "not_assessed" : failed === 0 ? "passed" : "failed_or_variant_scoring", tested, failed, failures: failures.slice(0, 8) };
}

function expectedMinRows(slug) {
  if (["eng.2","eng.3","eng.4"].includes(slug)) return 24;
  if (["eng.1","esp.1","ita.1","fra.1","mex.1","per.1","rou.1","idn.1"].includes(slug)) return 18;
  if (["esp.2"].includes(slug)) return 20;
  if (["sco.1","cro.1"].includes(slug)) return 10;
  if (["qat.1","ind.1","ksa.1"].includes(slug)) return 8;
  return 8;
}

function scoreCandidate(candidate, target, page) {
  const rows = dedupeRows(candidate.rows || []);
  const ar = arithmetic(rows);
  const sc = sourceClass(page.url);
  const pageNorm = norm(page.text);
  const nameEvidence = pageNorm.includes(norm(target.name)) || pageNorm.includes(norm(target.country));
  const currentEvidence = /2026|2025\/26|2025-26|2025–26|current season|standings|table/i.test(page.text);
  const numericDensity = rows.reduce((sum, r) => sum + Object.entries(r).filter(([k, v]) => k !== "teamName" && v !== null).length, 0);
  const score = sc.priority + rows.length * 100 + numericDensity + (ar.status === "passed" ? 600 : 0) + (nameEvidence ? 150 : 0) + (currentEvidence ? 80 : 0);
  return { ...candidate, rows, arithmetic: ar, source: sc, sourceUrl: page.url, score, nameEvidence, currentEvidence };
}

function extractBest(target, page) {
  const candidates = [...parseTables(page.text), ...parseEmbeddedJson(page.text)]
    .filter((c) => c.rows?.length >= 4)
    .map((c) => scoreCandidate(c, target, page))
    .sort((a, b) => b.score - a.score || b.rows.length - a.rows.length);
  return candidates[0] || null;
}

function queriesFor(t) {
  return [
    `"${t.name}" "${t.country}" standings table football 2025 2026 -wikipedia -github`,
    `"${t.name}" official standings football -wikipedia -github`,
    `"${t.name}" league table current season football -wikipedia -github`,
    `site:bbc.co.uk/sport/football "${t.name}" table`,
    `site:footballwebpages.co.uk "${t.name}" table`
  ];
}

async function processTarget(target) {
  const queries = queriesFor(target);
  const urlRows = [];
  for (const q of queries) {
    const urls = await searchWeb(q);
    urlRows.push(...urls.map((url) => ({ url, q, source: sourceClass(url) })));
    await sleep(100);
  }

  const seen = new Set();
  const candidateUrls = urlRows
    .filter((x) => !badUrl(x.url))
    .filter((x) => {
      const key = x.url.split("#")[0];
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.source.priority - a.source.priority)
    .slice(0, maxCandidates);

  const attempts = [];
  for (const candidate of candidateUrls) {
    const page = await fetchText(candidate.url, 7000);
    const attempt = {
      url: candidate.url,
      finalUrl: page.url,
      sourceClass: sourceClass(page.url).class,
      sourceTrusted: sourceClass(page.url).trusted,
      ok: page.ok,
      status: page.status,
      bytes: page.bytes,
      error: page.error || null
    };

    if (page.ok && page.text) {
      const best = extractBest(target, page);
      if (best) {
        const minRows = expectedMinRows(target.competitionSlug);
        const enoughRows = best.rows.length >= minRows;
        const trusted = best.source.trusted;
        let gateStatus = "rejected";
        let reason = "unclassified";

        if (!enoughRows) {
          reason = `row_count_below_expected:${best.rows.length}<${minRows}`;
        } else if (trusted && best.arithmetic.status === "passed") {
          gateStatus = "verified";
          reason = "trusted_source_arithmetic_passed";
        } else if (trusted && best.arithmetic.status === "not_assessed" && (best.nameEvidence || best.currentEvidence)) {
          gateStatus = "provisional";
          reason = "trusted_source_rows_found_but_arithmetic_not_assessed";
        } else if (trusted) {
          gateStatus = "review";
          reason = `trusted_source_arithmetic:${best.arithmetic.status}`;
        } else if (best.arithmetic.status === "passed" && !hostMatches(hostOf(best.sourceUrl), lowTrustHosts)) {
          gateStatus = "review";
          reason = "unknown_source_arithmetic_passed_requires_review";
        } else {
          reason = `untrusted_or_weak_source:${best.source.class}:${best.arithmetic.status}`;
        }

        attempt.parseStatus = `${gateStatus}:${reason}:${best.rows.length}`;
        if (["verified","provisional","review"].includes(gateStatus)) {
          const rows = best.rows.map((r, index) => ({
            competitionSlug: target.competitionSlug,
            competitionName: target.name,
            country: target.country,
            provider: "source_agnostic_v2",
            sourceUrl: best.sourceUrl,
            sourceHost: hostOf(best.sourceUrl),
            sourceClass: best.source.class,
            extractionKind: best.kind,
            qualityGateStatus: gateStatus,
            qualityGateReason: reason,
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
            status: gateStatus,
            reason,
            rowCount: rows.length,
            arithmetic: best.arithmetic,
            sourceUrl: best.sourceUrl,
            sourceHost: hostOf(best.sourceUrl),
            sourceClass: best.source.class,
            extractionKind: best.kind,
            candidateUrlCount: candidateUrls.length,
            attempts: [...attempts, attempt],
            rows
          };
        }
      } else {
        attempt.parseStatus = "no_standings_table_or_embedded_json";
      }
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
    status: "unresolved",
    reason: "no_verified_provisional_or_review_candidate",
    rowCount: 0,
    arithmetic: { status: "not_assessed", tested: 0, failed: 0, failures: [] },
    sourceUrl: null,
    sourceHost: null,
    sourceClass: null,
    extractionKind: null,
    candidateUrlCount: candidateUrls.length,
    attempts,
    rows: []
  };
}

async function mapLimit(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: n }, worker));
  return out;
}

const startedAt = new Date().toISOString();
const targets = TARGETS.slice(0, Math.min(limit, TARGETS.length));
const results = await mapLimit(targets, concurrency, processTarget);
const rows = results.flatMap((r) => r.rows || []);

const verified = results.filter((r) => r.status === "verified");
const provisional = results.filter((r) => r.status === "provisional");
const review = results.filter((r) => r.status === "review");
const accepted = results.filter((r) => ["verified","provisional","review"].includes(r.status));

const sourceMemory = Object.values(results.reduce((acc, r) => {
  const h = r.sourceHost || "missing";
  if (!acc[h]) acc[h] = { sourceHost: h, sourceClass: r.sourceClass || "missing", verified: 0, provisional: 0, review: 0, unresolved: 0, rowCount: 0, competitions: [] };
  if (r.status === "verified") acc[h].verified += 1;
  else if (r.status === "provisional") acc[h].provisional += 1;
  else if (r.status === "review") acc[h].review += 1;
  else acc[h].unresolved += 1;
  acc[h].rowCount += r.rowCount || 0;
  acc[h].competitions.push({ competitionSlug: r.competitionSlug, status: r.status, rowCount: r.rowCount, sourceUrl: r.sourceUrl, reason: r.reason });
  return acc;
}, {})).sort((a, b) => b.verified - a.verified || b.provisional - a.provisional || b.review - a.review || b.rowCount - a.rowCount);

const summary = {
  status: "passed",
  runner: "source_agnostic_standings_discovery_v2",
  strategy: "source_memory_low_trust_suppression_quality_gated_extraction",
  startedAt,
  finishedAt: new Date().toISOString(),
  targetCompetitionCount: targets.length,
  searchExecutedNowCount: stats.searchExecutedNowCount,
  broadSearchExecutedNowCount: stats.searchExecutedNowCount,
  fetchExecutedNowCount: stats.fetchExecutedNowCount,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  acceptedCandidateCompetitionCount: accepted.length,
  verifiedCompetitionCount: verified.length,
  provisionalCompetitionCount: provisional.length,
  reviewCompetitionCount: review.length,
  unresolvedCompetitionCount: results.filter((r) => r.status === "unresolved").length,
  acceptedCandidateRowCount: rows.length,
  verifiedRowCount: verified.flatMap((r) => r.rows || []).length,
  verifiedCompetitionSlugs: verified.map((r) => r.competitionSlug),
  provisionalCompetitionSlugs: provisional.map((r) => r.competitionSlug),
  reviewCompetitionSlugs: review.map((r) => r.competitionSlug),
  recommendedNextLane: accepted.length >= 15
    ? "persist_source_memory_and_rerun_wider_target_set"
    : "source_agnostic_v2_insufficient_need_better_search_api_or_browser_renderer"
};

const outPath = path.join(OUT_DIR, `source-agnostic-standings-discovery-v2-${DATE}.json`);
const compactPath = path.join(OUT_DIR, `source-agnostic-standings-discovery-v2-summary-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `source-agnostic-standings-v2-accepted-rows-${DATE}.jsonl`);
const sourceMemoryPath = path.join(OUT_DIR, `source-agnostic-standings-v2-source-memory-${DATE}.json`);

fs.writeFileSync(outPath, `${JSON.stringify({ summary, results, rows, sourceMemory }, null, 2)}\n`, "utf8");
fs.writeFileSync(compactPath, `${JSON.stringify({
  summary,
  accepted: accepted.map((r) => ({
    competitionSlug: r.competitionSlug,
    name: r.name,
    country: r.country,
    status: r.status,
    reason: r.reason,
    rowCount: r.rowCount,
    arithmeticStatus: r.arithmetic.status,
    sourceHost: r.sourceHost,
    sourceClass: r.sourceClass,
    sourceUrl: r.sourceUrl,
    extractionKind: r.extractionKind
  })),
  unresolved: results.filter((r) => r.status === "unresolved").map((r) => ({
    competitionSlug: r.competitionSlug,
    name: r.name,
    country: r.country,
    candidateUrlCount: r.candidateUrlCount,
    lastParseStatuses: r.attempts.slice(-5).map((a) => ({ sourceClass: a.sourceClass, status: a.status, parseStatus: a.parseStatus, url: a.finalUrl || a.url }))
  })),
  sourceMemory
}, null, 2)}\n`, "utf8");
fs.writeFileSync(rowsPath, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""), "utf8");
fs.writeFileSync(sourceMemoryPath, `${JSON.stringify({ summary, sourceMemory }, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  compactOutput: rel(compactPath),
  rowsOutput: rel(rowsPath),
  sourceMemoryOutput: rel(sourceMemoryPath),
  summary
}, null, 2));
