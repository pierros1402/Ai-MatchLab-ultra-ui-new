import fs from "fs";
import { resolveDataPath } from "./data-root.js";

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const BUILTIN_ALIASES = {
  global: {
    "athletic club": ["athletic bilbao", "athletic"],
    "oh leuven": ["oud heverlee leuven", "leuven"],
    "standard liege": [
      "standard liege",
      "standard liege rscl",
      "standard de liege",
      "standard liège"
    ],
    "fc blau-weiß linz": ["blau weiss linz", "fc blau weiss linz"],
    "sc rheindorf altach": ["rheindorf altach", "altach"],
    "gimnasia mendoza": [
      "gimnasia (mendoza)",
      "gimnasia y esgrima de mendoza",
      "gimnasia y esgrima mendoza"
    ]
  }
};

function toAliasArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function readGlobalAliasMap() {
  return readJsonSafe(resolveDataPath("team-aliases", "global.json"), {});
}

function readLeagueAliasMap(leagueSlug) {
  if (!leagueSlug) return {};
  return readJsonSafe(resolveDataPath("team-aliases", `${leagueSlug}.json`), {});
}

function collectAliasValues(aliasMap, teamName) {
  const normalizedTeam = normalizeText(teamName);
  const values = [];

  for (const [key, aliases] of Object.entries(aliasMap || {})) {
    if (normalizeText(key) === normalizedTeam) {
      values.push(...toAliasArray(aliases));
    }
  }

  return values;
}

// Reverse index: any known spelling (canonical key OR listed variant) → canonical.
// Cached per league because recordMatchResult() calls this on every stored match.
const _reverseIndexCache = new Map();

function buildReverseIndex(leagueSlug) {
  const idx = new Map(); // normalizeText(anySpelling) → canonical display
  const maps = [
    { ...(BUILTIN_ALIASES.global || {}), ...(BUILTIN_ALIASES[leagueSlug] || {}) },
    readGlobalAliasMap(),
    readLeagueAliasMap(leagueSlug) // league-specific last so it wins ties
  ];
  for (const map of maps) {
    for (const [canonical, aliases] of Object.entries(map || {})) {
      idx.set(normalizeText(canonical), canonical);
      for (const a of toAliasArray(aliases)) idx.set(normalizeText(a), canonical);
    }
  }
  return idx;
}

/**
 * Resolve a team spelling to its canonical display name via the alias tables.
 * Returns null when the name is unknown to the alias data (so callers keep the
 * original). Used by the results memory to collapse cross-source spelling variants
 * (e.g. "Ranheim IL" → "Ranheim") that plain diacritic/affix normalization misses.
 */
export function canonicalTeamName(leagueSlug, teamName) {
  const t = normalizeText(teamName);
  if (!t) return null;
  const key = leagueSlug || "_global";
  let idx = _reverseIndexCache.get(key);
  if (!idx) { idx = buildReverseIndex(leagueSlug); _reverseIndexCache.set(key, idx); }
  return idx.get(t) || null;
}

/** Drop cached reverse indexes (call after writing alias files in-process). */
export function clearAliasCache() {
  _reverseIndexCache.clear();
}

export function resolveAliasCandidates(leagueSlug, teamName) {
  const base = String(teamName || "").trim();
  if (!base) return [];

  const candidates = new Set();

  const push = (value) => {
    const text = String(value || "").trim();
    if (text) candidates.add(text);
  };

  push(base);

  const builtins = {
    ...(BUILTIN_ALIASES.global || {}),
    ...(BUILTIN_ALIASES[leagueSlug] || {})
  };

  const globalAliasMap = readGlobalAliasMap();
  const leagueAliasMap = readLeagueAliasMap(leagueSlug);

  for (const alias of collectAliasValues(builtins, base)) push(alias);
  for (const alias of collectAliasValues(globalAliasMap, base)) push(alias);
  for (const alias of collectAliasValues(leagueAliasMap, base)) push(alias);

  const baseNorm = normalizeText(base);

  if (baseNorm.includes("blau weiß")) push(base.replace("ß", "ss"));
  if (baseNorm.includes("blau weiß")) push(base.replace("ß", "s"));
  if (baseNorm.includes("liege")) push(base.replace("Liège", "Liege"));
  if (baseNorm.includes("liege")) push(base.replace("Liége", "Liege"));

  return [...candidates];
}