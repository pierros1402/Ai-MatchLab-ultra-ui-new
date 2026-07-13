import fs from "fs";
import { resolveDataPath } from "./data-root.js";

function readAliasDirFiles() {
  const dir = resolveDataPath("team-aliases");
  let out = [];
  try {
    out = fs.readdirSync(dir)
      .filter(f => f.endsWith(".json") && f !== "global.json");
  } catch { /* dir may not exist */ }
  return out;
}

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
    ],

    // National-team name variants across sources (ESPN vs Flashscore). Without
    // these the two feeds mint different canonical IDs for the same match
    // (cid_fifaworld_usa_belgium vs cid_fifaworld_unitedstates_belgium) and the
    // day snapshot double-counts it — one row stuck SCHEDULED, the other LIVE/FT
    // (audit 2026-07-07: fifa.world USA/United States v Belgium). The union-find
    // dedup only *learns* aliases after it first merges, which it never does
    // here, so national teams must be seeded. Canonical key = ESPN long form,
    // alias = Flashscore/short form.
    "united states": ["usa"],
    "south korea": ["korea republic", "korea south"],
    "north korea": ["korea dpr", "korea north"],
    "ivory coast": ["cote d'ivoire", "côte d'ivoire"],
    "czechia": ["czech republic"],
    "china": ["china pr"],
    "iran": ["ir iran"],
    "united arab emirates": ["uae"],
    "cape verde": ["cabo verde"],
    "dr congo": ["congo dr", "democratic republic of the congo"],
    "republic of ireland": ["ireland"],
    "bosnia and herzegovina": ["bosnia herzegovina", "bosnia-herzegovina"]
  },

  // UEFA qualifier cross-provider spellings that plain normalization / prefix-
  // token subset cannot bridge even after the bracketed-nationality strip
  // (audit 2026-07-07, uefa.champions): an acronym vs full name, or a Catalan
  // "d'" elision. Canonical key = ESPN long form, alias = Flashscore short form.
  "uefa.champions": {
    "the new saints": ["tns"],
    "inter d'escaldes": ["inter escaldes"]
  },

  // nor.1 (audit V2 2026-07-12 §α): "Hamarkameratene" (full club name) vs
  // "HamKam" (the common abbreviation) share no token, so the subset matcher
  // mints two canonical IDs for the same club → a duplicate published fixture
  // (Sandefjord v HamKam / v Hamarkameratene). Canonical key = short form.
  "nor.1": {
    "hamkam": ["hamarkameratene", "ham kam", "ham-kam"]
  },

  // ecu.1 (audit 2026-07-07): Flashscore "U. Catolica" vs ESPN "Universidad
  // Católica (Quito)" — a "U." abbreviation the subset matcher can't expand.
  // (audit V2 2026-07-12 §α): "LDU Quito" (Liga Deportiva Universitaria) vs
  // "Liga de Quito" — an acronym vs full name that also mints two IDs.
  "ecu.1": {
    "universidad catolica": ["u catolica", "u. catolica"],
    "liga de quito": [
      "ldu quito",
      "ldu",
      "liga deportiva universitaria",
      "liga deportiva universitaria de quito"
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
  _globalIndex = null;
}

// ── Global (league-agnostic) team-identity resolver ──────────────────────────
// Some stores are league-agnostic by design — most importantly the H2H memory,
// which aggregates a team pair's meetings across every competition, so it cannot
// consult a per-league alias table. This resolver folds EVERY alias source
// (builtin global + builtin per-league + global.json + every data/team-aliases/
// league file) into one spelling→canonical map.
//
// Safety invariant (why this never wrong-merges): a normalized spelling that
// resolves to TWO different canonicals across leagues (e.g. "Arsenal" the club
// vs an "Arsenal …" alias elsewhere, or a genuine cross-league name collision)
// is dropped as AMBIGUOUS and left untouched. So the map only ever merges
// spellings that the alias data unambiguously agrees are the same club — the
// conservative choice, correct over complete.
let _globalIndex = null;

/**
 * Pure reducer (exported for tests): fold a list of {canonical:[variants]} maps
 * into one normalized-spelling→canonical index, dropping any spelling that two
 * sources disagree on. Kept side-effect-free so the collision-safety invariant
 * can be tested with synthetic inputs, independent of the on-disk alias data.
 */
export function buildGlobalReverseMap(aliasMaps) {
  const map = new Map();        // normText(spelling) -> canonical display
  const ambiguous = new Set();  // spellings seen with >1 distinct canonical

  const add = (spelling, canonical) => {
    const k = normalizeText(spelling);
    const cName = String(canonical || "").trim();
    if (!k || !cName) return;
    if (ambiguous.has(k)) return;
    const prev = map.get(k);
    if (prev === undefined) {
      map.set(k, cName);
    } else if (normalizeText(prev) !== normalizeText(cName)) {
      ambiguous.add(k);
      map.delete(k);
    }
  };

  for (const aliasMap of aliasMaps || []) {
    for (const [canonical, aliases] of Object.entries(aliasMap || {})) {
      add(canonical, canonical); // a canonical name maps to itself
      for (const a of toAliasArray(aliases)) add(a, canonical);
    }
  }

  return map;
}

function buildGlobalReverseIndex() {
  const sources = [];
  sources.push(BUILTIN_ALIASES.global || {});
  for (const key of Object.keys(BUILTIN_ALIASES)) {
    if (key !== "global") sources.push(BUILTIN_ALIASES[key]);
  }
  sources.push(readGlobalAliasMap());
  for (const file of readAliasDirFiles()) {
    sources.push(readJsonSafe(resolveDataPath("team-aliases", file), {}) || {});
  }
  return buildGlobalReverseMap(sources);
}

/**
 * Resolve a team spelling to its canonical display name using ALL alias tables
 * (league-agnostic). Returns null when the spelling is unknown OR ambiguous, so
 * callers keep the original name. Used by the H2H store, which is keyed by team
 * pair across competitions and therefore has no single league to consult.
 */
export function globalCanonicalTeamName(teamName) {
  const t = normalizeText(teamName);
  if (!t) return null;
  if (!_globalIndex) _globalIndex = buildGlobalReverseIndex();
  return _globalIndex.get(t) || null;
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