import fs from "fs";
import { resolveDataPath, ensureDir } from "./data-root.js";

// ─── Paths ────────────────────────────────────────────────────────────────────

const MEMORY_DIR = resolveDataPath("league-memory");
const FILE       = resolveDataPath("league-memory", "source-memory.json");

function ensureDirs() {
  ensureDir(MEMORY_DIR);
}

// ─── Read / write ─────────────────────────────────────────────────────────────

export function readAllSourceMemory() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeAll(data) {
  ensureDirs();
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), "utf8");
}

// ─── Per-league source records ────────────────────────────────────────────────
//
// Shape:
// {
//   "bol.1": {
//     "standings": {
//       sources: {
//         "en.wikipedia.org": { successCount, failCount, lastSuccess, avgConfidence, parseMethod },
//         ...
//       },
//       preferred: "en.wikipedia.org"
//     }
//   }
// }

export function getSourceMemory(slug, dataType = "standings") {
  const all = readAllSourceMemory();
  return all[slug]?.[dataType] || null;
}

export function getPreferredSources(slug, dataType = "standings") {
  const mem = getSourceMemory(slug, dataType);
  if (!mem || !mem.sources) return [];

  // Rank by success rate × volume, then recency
  return Object.entries(mem.sources)
    .map(([host, stats]) => {
      const total = stats.successCount + stats.failCount;
      const successRate = total > 0 ? stats.successCount / total : 0;
      // Reliability score: success rate weighted by volume (capped)
      const volumeWeight = Math.min(stats.successCount, 10) / 10;
      const score = successRate * (0.5 + 0.5 * volumeWeight);
      return { host, score, ...stats };
    })
    .filter(s => s.successCount > 0 && s.score >= 0.4)
    .sort((a, b) => b.score - a.score);
}

// ─── Record outcomes ──────────────────────────────────────────────────────────

export function recordSourceSuccess(slug, host, options = {}) {
  const dataType   = options.dataType || "standings";
  const confidence = Number(options.confidence || 0);
  const parseMethod = options.parseMethod || "unknown";

  ensureDirs();
  const all = readAllSourceMemory();

  if (!all[slug]) all[slug] = {};
  if (!all[slug][dataType]) all[slug][dataType] = { sources: {}, preferred: null };

  const sources = all[slug][dataType].sources;
  if (!sources[host]) {
    sources[host] = {
      successCount: 0,
      failCount: 0,
      lastSuccess: null,
      lastFail: null,
      avgConfidence: 0,
      parseMethod
    };
  }

  const s = sources[host];
  // Running average of confidence
  s.avgConfidence = (s.avgConfidence * s.successCount + confidence) / (s.successCount + 1);
  s.successCount += 1;
  s.lastSuccess = new Date().toISOString();
  s.parseMethod = parseMethod;

  // Update preferred to highest-scoring source
  const ranked = getPreferredSources(slug, dataType);
  all[slug][dataType].preferred = ranked.length ? ranked[0].host : host;

  writeAll(all);
  return s;
}

export function recordSourceFailure(slug, host, options = {}) {
  const dataType = options.dataType || "standings";
  const reason   = options.reason || "unknown";

  ensureDirs();
  const all = readAllSourceMemory();

  if (!all[slug]) all[slug] = {};
  if (!all[slug][dataType]) all[slug][dataType] = { sources: {}, preferred: null };

  const sources = all[slug][dataType].sources;
  if (!sources[host]) {
    sources[host] = {
      successCount: 0,
      failCount: 0,
      lastSuccess: null,
      lastFail: null,
      avgConfidence: 0,
      parseMethod: "unknown"
    };
  }

  sources[host].failCount += 1;
  sources[host].lastFail = new Date().toISOString();
  sources[host].lastFailReason = reason;

  writeAll(all);
  return sources[host];
}

// ─── Summary ──────────────────────────────────────────────────────────────────

export function getSourceMemorySummary() {
  const all = readAllSourceMemory();
  const leagues = Object.keys(all);

  const summary = {
    leaguesTracked: leagues.length,
    leaguesWithPreferred: 0,
    byHost: {}
  };

  for (const slug of leagues) {
    const standings = all[slug]?.standings;
    if (standings?.preferred) summary.leaguesWithPreferred++;

    for (const [host, stats] of Object.entries(standings?.sources || {})) {
      if (!summary.byHost[host]) {
        summary.byHost[host] = { successCount: 0, failCount: 0, leagues: 0 };
      }
      summary.byHost[host].successCount += stats.successCount;
      summary.byHost[host].failCount += stats.failCount;
      summary.byHost[host].leagues += 1;
    }
  }

  return summary;
}
