import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";
import {
  getLeagueCoverage,
  isContinentalCompetition
} from "../../workers/_shared/leagues-coverage.js";

const WIKIDATA_API_URL = "https://www.wikidata.org/w/api.php";
const DEFAULT_INPUT = resolveDataPath(
  "team-geo",
  "_bootstrap",
  "team-geo.bootstrap.json"
);
const DEFAULT_OUTPUT = resolveDataPath(
  "team-geo",
  "_bootstrap",
  "team-geo.bootstrap.enriched.json"
);

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function replaceAllLiteral(text, needle, replacement) {
  return String(text ?? "").split(needle).join(replacement);
}

function repairTextEncoding(value) {
  let text = String(value ?? "");

  const repairs = [
    ["\u0393\u00b1", "\u00f1"],
    ["\u0393\u00ad", "\u00ed"],
    ["\u0393\u00a9", "\u00e9"],
    ["\u0393\u00a1", "\u00e1"],
    ["\u0393\u00b3", "\u00f3"],
    ["\u0393\u00ba", "\u00fa"],
    ["\u0393\u00bc", "\u00fc"],
    ["\u0393\u00a3", "\u00e3"],
    ["\u0393\u00a7", "\u00e7"],
    ["\u0393\u00a8", "\u00e8"],
    ["\u0393\u00aa", "\u00ea"],
    ["\u0393\u00b4", "\u00f4"],
    ["\u0393\u00af", "\u00ef"],

    ["\u00c3\u00b1", "\u00f1"],
    ["\u00c3\u00ad", "\u00ed"],
    ["\u00c3\u00a9", "\u00e9"],
    ["\u00c3\u00a1", "\u00e1"],
    ["\u00c3\u00b3", "\u00f3"],
    ["\u00c3\u00ba", "\u00fa"],
    ["\u00c3\u00bc", "\u00fc"],
    ["\u00c3\u00a3", "\u00e3"],
    ["\u00c3\u00a7", "\u00e7"],
    ["\u00c3\u00a8", "\u00e8"],
    ["\u00c3\u00aa", "\u00ea"],
    ["\u00c3\u00b4", "\u00f4"],
    ["\u00c3\u00af", "\u00ef"],

    ["\u039e\u201c\u0392\u00b1", "\u00f1"],
    ["\u039e\u201c\u0392\u00ad", "\u00ed"],
    ["\u039e\u201c\u0392\u00a9", "\u00e9"],
    ["\u039e\u201c\u0392\u00a1", "\u00e1"],
    ["\u039e\u201c\u0392\u00b3", "\u00f3"],
    ["\u039e\u201c\u0392\u00ba", "\u00fa"],
    ["\u039e\u201c\u0392\u00bc", "\u00fc"],
    ["\u039e\u201c\u0392\u00a3", "\u00e3"],
    ["\u039e\u201c\u0392\u00a7", "\u00e7"],
    ["\u039e\u201c\u0392\u00a8", "\u00e8"],
    ["\u039e\u201c\u0392\u00aa", "\u00ea"],
    ["\u039e\u201c\u0392\u00b4", "\u00f4"],
    ["\u039e\u201c\u0392\u00af", "\u00ef"],

    ["\u0393\u0192\u0392\u00b1", "\u00f1"],
    ["\u0393\u0192\u0392\u00ad", "\u00ed"],
    ["\u0393\u0192\u0392\u00a9", "\u00e9"],
    ["\u0393\u0192\u0392\u00a1", "\u00e1"],
    ["\u0393\u0192\u0392\u00b3", "\u00f3"],
    ["\u0393\u0192\u0392\u00ba", "\u00fa"],
    ["\u0393\u0192\u0392\u00bc", "\u00fc"],
    ["\u0393\u0192\u0392\u00a3", "\u00e3"],
    ["\u0393\u0192\u0392\u00a7", "\u00e7"],
    ["\u0393\u0192\u0392\u00a8", "\u00e8"],
    ["\u0393\u0192\u0392\u00aa", "\u00ea"],
    ["\u0393\u0192\u0392\u00b4", "\u00f4"],
    ["\u0393\u0192\u0392\u00af", "\u00ef"],

    ["\u039e\u00b2\u03b2\u201a\u00ac\u03b2\u20ac", "\u2013"],
    ["\u03b2\u201a\u00ac\u03b2\u20ac", "\u2013"]
  ];

  for (const [bad, good] of repairs) {
    text = replaceAllLiteral(text, bad, good);
  }

  return text;
}

function normalizeText(value) {
  return repairTextEncoding(value)
    .trim()
    .replace(/\s+/g, " ");
}

const KNOWN_DAMAGED_TEAM_NAME_REPAIRS = new Map([
  ["pe??arol", "Pe\u00f1arol"],
  ["pe arol", "Pe\u00f1arol"],
  ["penarol", "Pe\u00f1arol"],
  ["independiente medell??n", "Independiente Medell\u00edn"],
  ["independiente medell n", "Independiente Medell\u00edn"],
  ["independiente medellin", "Independiente Medell\u00edn"],
  ["bolivar", "Bol\u00edvar"],
  ["pisa sporting club", "Pisa SC"]
]);

function canonicalTeamName(value) {
  const repaired = normalizeText(value);
  if (!repaired) return "";

  const lookupKey = stripDiacritics(repaired)
    .toLowerCase()
    .replace(/[^a-z0-9?\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return KNOWN_DAMAGED_TEAM_NAME_REPAIRS.get(lookupKey) || repaired;
}

function normalizeBootstrapInputRow(row) {
  return {
    ...row,
    team: canonicalTeamName(row?.team),
    leagueSlug: normalizeText(row?.leagueSlug) || null,
    venue: normalizeText(row?.venue) || "",
    city: normalizeText(row?.city) || "",
    country: normalizeText(row?.country) || "",
    source: normalizeText(row?.source) || ""
  };
}

function normalizeSourceMeta(meta = {}) {
  if (!meta || typeof meta !== "object") return meta || null;

  return {
    ...meta,
    teamLabel: meta.teamLabel ? canonicalTeamName(meta.teamLabel) : meta.teamLabel,
    error: meta.error ? normalizeText(meta.error) : meta.error,
    rejectReason: meta.rejectReason ? normalizeText(meta.rejectReason) : meta.rejectReason
  };
}

function normalizeOutputRow(row, sourceFallback = "bootstrap_manual") {
  const normalized = normalizeBootstrapInputRow(row || {});

  return {
    ...row,
    team: normalized.team,
    leagueSlug: normalized.leagueSlug,
    venue: normalized.venue,
    city: normalized.city,
    country: normalized.country,
    latitude: isValidLatitude(row?.latitude) ? Number(row.latitude) : null,
    longitude: isValidLongitude(row?.longitude) ? Number(row.longitude) : null,
    source: normalizeText(row?.source) || sourceFallback,
    sourceMeta: normalizeSourceMeta(row?.sourceMeta || null)
  };
}

function normalizeCountry(value) {
  return normalizeText(value).toLowerCase();
}

function isValidLatitude(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= -90 && n <= 90 && n !== 0;
}

function isValidLongitude(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= -180 && n <= 180 && n !== 0;
}

function countryTokenToExpectedLabel(countryToken) {
  const map = {
    england: "England",
    germany: "Germany",
    spain: "Spain",
    italy: "Italy",
    france: "France",
    netherlands: "Netherlands",
    portugal: "Portugal",
    belgium: "Belgium",
    scotland: "Scotland",
    greece: "Greece",
    cyprus: "Cyprus",
    turkey: "Turkey",
    switzerland: "Switzerland",
    austria: "Austria",
    denmark: "Denmark",
    sweden: "Sweden",
    norway: "Norway",
    finland: "Finland",
    poland: "Poland",
    czech_republic: "Czech Republic",
    romania: "Romania",
    serbia: "Serbia",
    croatia: "Croatia",
    hungary: "Hungary",
    bulgaria: "Bulgaria",
    ukraine: "Ukraine",
    albania: "Albania",
    armenia: "Armenia",
    azerbaijan: "Azerbaijan",
    bosnia_and_herzegovina: "Bosnia and Herzegovina",
    belarus: "Belarus",
    estonia: "Estonia",
    faroe_islands: "Faroe Islands",
    georgia: "Georgia",
    iceland: "Iceland",
    ireland: "Ireland",
    israel: "Israel",
    kazakhstan: "Kazakhstan",
    kosovo: "Kosovo",
    latvia: "Latvia",
    lithuania: "Lithuania",
    luxembourg: "Luxembourg",
    moldova: "Moldova",
    malta: "Malta",
    montenegro: "Montenegro",
    north_macedonia: "North Macedonia",
    northern_ireland: "Northern Ireland",
    slovakia: "Slovakia",
    slovenia: "Slovenia",
    wales: "Wales",

    usa: "United States of America",
    argentina: "Argentina",
    brazil: "Brazil",
    mexico: "Mexico",
    uruguay: "Uruguay",
    colombia: "Colombia",
    chile: "Chile",
    peru: "Peru",

    japan: "Japan",
    south_korea: "South Korea",
    saudi_arabia: "Saudi Arabia",
    uae: "United Arab Emirates",
    qatar: "Qatar",

    south_africa: "South Africa",
    egypt: "Egypt",
    morocco: "Morocco",
    tunisia: "Tunisia"
  };

  return map[normalizeCountry(countryToken)] || null;
}

function expectedCountryFromLeagueSlug(leagueSlug) {
  const slug = normalizeText(leagueSlug);
  if (!slug) return null;

  const coverage = getLeagueCoverage(slug);
  if (!coverage) return null;

  if (isContinentalCompetition(slug)) {
    return null;
  }

  const countryToken = normalizeCountry(coverage?.country);

  if (
    !countryToken ||
    countryToken === "uefa" ||
    countryToken === "afc" ||
    countryToken === "caf" ||
    countryToken === "conmebol"
  ) {
    return null;
  }

  return countryTokenToExpectedLabel(countryToken);
}

function countryLooksCompatible(expectedCountry, actualCountry) {
  const expected = normalizeCountry(expectedCountry);
  const actual = normalizeCountry(actualCountry);

  if (!expected) return true;
  if (!actual) return true;
  if (expected === actual) return true;

  const aliases = {
    england: ["united kingdom", "uk", "great britain"],
    scotland: ["united kingdom", "uk", "great britain"],
    wales: ["united kingdom", "uk", "great britain"],
    "northern ireland": ["united kingdom", "uk", "great britain"],

    "united states of america": ["united states", "usa"],
    "united states": ["united states of america", "usa"],
    usa: ["united states", "united states of america"],

    turkiye: ["turkey"],
    turkiye: ["turkey"],

    "czech republic": ["czechia"],
    czechia: ["czech republic"],

    "bosnia and herzegovina": ["bosnia-herzegovina", "bosnia"],
    "south korea": ["republic of korea", "korea republic"],
    "north macedonia": ["macedonia"],
    "united arab emirates": ["uae"]
  };

  const expectedAliases = new Set([expected, ...(aliases[expected] || [])]);
  const actualAliases = new Set([actual, ...(aliases[actual] || [])]);

  for (const item of expectedAliases) {
    if (actualAliases.has(item)) return true;
  }

  return false;
}

function hasUsableCoordinates(row) {
  return isValidLatitude(row?.latitude) && isValidLongitude(row?.longitude);
}

function isCompleteRow(row) {
  return (
    !!normalizeText(row?.team) &&
    !!normalizeText(row?.venue) &&
    !!normalizeText(row?.city) &&
    !!normalizeText(row?.country) &&
    hasUsableCoordinates(row)
  );
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`fetch_timeout_${timeoutMs}ms`));
  }, timeoutMs);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer)
  };
}

async function withRowTimeout(promise, timeoutMs, teamName) {
  let timer = null;

  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`row_timeout_${timeoutMs}ms:${teamName || "unknown_team"}`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function toPositiveInteger(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function toNonNegativeInteger(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

function toBooleanFlag(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;

  const normalized = String(value).trim().toLowerCase();

  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;

  return fallback;
}

function defaultCheckpointFile(outputFile) {
  const dir = path.dirname(outputFile);
  const base = path.basename(outputFile, ".json");
  return path.join(dir, `${base}.checkpoint.json`);
}

function readJsonObject(filePath) {
  if (!fs.existsSync(filePath)) return null;

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

function writeCheckpoint(filePath, payload) {
  writeJson(filePath, payload);
}

function parseCliOptions(argv = []) {
  const options = {};

  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;

    const clean = arg.slice(2);
    const eqIndex = clean.indexOf("=");

    if (eqIndex === -1) {
      options[clean] = true;
      continue;
    }

    const key = clean.slice(0, eqIndex);
    const value = clean.slice(eqIndex + 1);
    options[key] = value;
  }

  return options;
}

async function fetchJson(
  url,
  { retries = 1, baseDelayMs = 600, timeoutMs = 7000 } = {}
) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const timeout = createTimeoutSignal(timeoutMs);

      let response;
      try {
        response = await fetch(url, {
          signal: timeout.signal,
          headers: {
            Accept: "application/json",
            "User-Agent": "AiMatchLabTeamGeoBootstrap/1.0 (local bootstrap job)"
          }
        });
      } finally {
        timeout.clear();
      }

      if (response.ok) {
        return response.json();
      }

      const retryable =
        response.status === 429 ||
        response.status === 500 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504;

      if (!retryable || attempt >= retries) {
        throw new Error(`wikidata_http_${response.status}`);
      }

      const retryAfterHeader = Number(response.headers.get("retry-after"));
      const retryAfterMs =
        Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
          ? retryAfterHeader * 1000
          : null;

      const backoffMs =
        retryAfterMs ||
        Math.round(baseDelayMs * Math.pow(2, attempt) + Math.random() * 400);

      await sleep(backoffMs);
    } catch (err) {
      lastError = err;

      const message = String(err?.message || err);
      const retryable =
        message.includes("wikidata_http_429") ||
        message.includes("wikidata_http_500") ||
        message.includes("wikidata_http_502") ||
        message.includes("wikidata_http_503") ||
        message.includes("wikidata_http_504") ||
        message.includes("fetch failed") ||
        message.includes("network") ||
        message.includes("fetch_timeout_") ||
        message.includes("aborted") ||
        message.includes("AbortError");

      if (!retryable || attempt >= retries) {
        throw err;
      }

      const backoffMs = Math.round(
        baseDelayMs * Math.pow(2, attempt) + Math.random() * 400
      );

      await sleep(backoffMs);
    }
  }

  throw lastError || new Error("wikidata_fetch_failed");
}

function buildSearchUrl(teamName, limit = 5) {
  const url = new URL(WIKIDATA_API_URL);
  url.searchParams.set("action", "wbsearchentities");
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "en");
  url.searchParams.set("type", "item");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("search", teamName);
  url.searchParams.set("origin", "*");
  return url.toString();
}

function buildGetEntitiesUrl(ids) {
  const url = new URL(WIKIDATA_API_URL);
  url.searchParams.set("action", "wbgetentities");
  url.searchParams.set("format", "json");
  url.searchParams.set("languages", "en");
  url.searchParams.set("props", "labels|claims");
  url.searchParams.set("ids", ids.join("|"));
  url.searchParams.set("origin", "*");
  return url.toString();
}

function getEntityLabel(entity) {
  return normalizeText(entity?.labels?.en?.value);
}

function getClaims(entity, propertyId) {
  return Array.isArray(entity?.claims?.[propertyId]) ? entity.claims[propertyId] : [];
}

function entityHasClaimEntity(entity, propertyId, targetId) {
  return getClaims(entity, propertyId).some(claim => {
    return getEntityIdFromClaim(claim) === targetId;
  });
}

function isCountryLikeEntity(entity) {
  // Q6256 = country
  // Q3624078 = sovereign state
  // Q7275 = state
  return (
    entityHasClaimEntity(entity, "P31", "Q6256") ||
    entityHasClaimEntity(entity, "P31", "Q3624078") ||
    entityHasClaimEntity(entity, "P31", "Q7275")
  );
}

function getEntityIdFromClaim(claim) {
  return claim?.mainsnak?.datavalue?.value?.id || null;
}

function getCoordinateFromClaim(claim) {
  const value = claim?.mainsnak?.datavalue?.value;
  if (!value) return { latitude: null, longitude: null };

  const latitude = Number(value?.latitude);
  const longitude = Number(value?.longitude);

  return {
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null
  };
}

function isExactOfficialLabelMatch(teamName, candidateLabel) {
  const wanted = normalizeSearchText(teamName);
  const candidate = normalizeSearchText(candidateLabel);

  if (!wanted || !candidate) return false;
  if (wanted === candidate) return true;

  const wantedAliases = new Set(getOfficialTeamNames(teamName).map(normalizeSearchText));
  const candidateAliases = new Set(getOfficialTeamNames(candidateLabel).map(normalizeSearchText));

  if (wantedAliases.has(candidate)) return true;
  if (candidateAliases.has(wanted)) return true;

  for (const item of wantedAliases) {
    if (candidateAliases.has(item)) return true;
  }

  return false;
}

function scoreTeamEntity(entity, searchHit, teamName, expectedCountry) {
  const label = normalizeText(getEntityLabel(entity)).toLowerCase();
  const wanted = normalizeText(teamName).toLowerCase();
  const description = normalizeText(searchHit?.description).toLowerCase();
  const expected = normalizeCountry(expectedCountry);

  let score = 0;

  if (label === wanted) score += 20;
  if (label.includes(wanted) || wanted.includes(label)) score += 8;

  if (description.includes("football club")) score += 6;
  if (description.includes("soccer club")) score += 6;
  if (description.includes("sports club")) score += 2;

  if (getClaims(entity, "P115").length) score += 10;

  if (expected) {
    if (description.includes(expected)) {
      score += 12;
    } else if (description) {
      score -= 8;
    }
  }

  return score;
}

function normalizeSearchText(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function importantTeamTokens(teamName) {
  const stop = new Set([
    "fc",
    "fk",
    "cf",
    "sc",
    "ac",
    "afc",
    "if",
    "bk",
    "ksv",
    "utd",
    "united",
    "club",
    "de",
    "la",
    "the"
  ]);

  return normalizeSearchText(teamName)
    .split(" ")
    .map(x => x.trim())
    .filter(x => x.length >= 3 && !stop.has(x));
}

function buildVenueSearchQueries(teamName, expectedCountry, teamLabel = "") {
  const names = [
    teamName,
    teamLabel,
    ...getOfficialTeamNames(teamName)
  ]
    .map(name => normalizeText(name))
    .filter(Boolean);

  const uniqueNames = [...new Set(names)].slice(0, 2);
  const queries = [];

  for (const name of uniqueNames) {
    queries.push(`${name} stadium`);
    queries.push(`${name} football stadium`);

    if (expectedCountry) {
      queries.push(`${name} ${expectedCountry} stadium`);
    }
  }

  return [...new Set(queries.map(q => normalizeText(q)).filter(Boolean))].slice(0, 4);
}

function scoreVenueEntity(entity, searchHit, teamName, expectedCountry) {
  const label = normalizeSearchText(getEntityLabel(entity));
  const description = normalizeSearchText(searchHit?.description);
  const wantedTokens = importantTeamTokens(teamName);
  const expected = normalizeSearchText(expectedCountry);

  let score = 0;

  if (getClaims(entity, "P625").length) score += 20;
  if (getClaims(entity, "P17").length) score += 5;
  if (getClaims(entity, "P131").length) score += 3;

  if (
    label.includes("stadium") ||
    label.includes("arena") ||
    label.includes("park") ||
    label.includes("ground") ||
    description.includes("stadium") ||
    description.includes("football venue") ||
    description.includes("sports venue") ||
    description.includes("arena")
  ) {
    score += 10;
  }

  for (const token of wantedTokens) {
    if (label.includes(token)) score += 8;
    if (description.includes(token)) score += 4;
  }

  if (expected) {
    if (description.includes(expected)) score += 6;
  }

  return score;
}

async function resolveVenueBySearch(inputRow, teamLabel = "") {
  const teamName = normalizeText(inputRow?.team);
  const expectedCountry = expectedCountryFromLeagueSlug(inputRow?.leagueSlug);
  const queries = buildVenueSearchQueries(teamName, expectedCountry, teamLabel);

  const merged = [];
  const seenIds = new Set();

  for (const query of queries.slice(0, 4)) {
    try {
      const searchData = await fetchJson(buildSearchUrl(query, 6), {
        retries: 0,
        baseDelayMs: 250,
        timeoutMs: 3500
      });

      const searchResults = Array.isArray(searchData?.search) ? searchData.search : [];

      for (const item of searchResults) {
        const id = item?.id;
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);
        merged.push(item);
      }

      if (merged.length >= 8) break;
    } catch {
      continue;
    }
  }

  if (!merged.length) return null;

  const ids = merged.map(item => item.id).filter(Boolean).slice(0, 8);

  const entitiesData = await fetchJson(buildGetEntitiesUrl(ids), {
    retries: 0,
    baseDelayMs: 300,
    timeoutMs: 5000
  });

  const entities = entitiesData?.entities || {};
  const searchHitById = Object.fromEntries(
    merged
      .filter(item => item?.id)
      .map(item => [item.id, item])
  );

  const rankedVenues = Object.values(entities)
    .map(entity => ({
      entity,
      score: scoreVenueEntity(
        entity,
        searchHitById[entity?.id] || null,
        teamName,
        expectedCountry
      )
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  for (const item of rankedVenues.slice(0, 4)) {
    const venueEntity = item.entity;
    const coordClaim = getClaims(venueEntity, "P625")[0];
    const coords = getCoordinateFromClaim(coordClaim);

    if (!isValidLatitude(coords.latitude) || !isValidLongitude(coords.longitude)) {
      continue;
    }

    const countryClaim = getClaims(venueEntity, "P17")[0];
    const adminClaim = getClaims(venueEntity, "P131")[0];

    const countryId = getEntityIdFromClaim(countryClaim);
    const adminId = getEntityIdFromClaim(adminClaim);
    const lookupIds = [countryId, adminId].filter(Boolean);

    let lookupEntities = {};

    if (lookupIds.length) {
      const lookupData = await fetchJson(buildGetEntitiesUrl(lookupIds), {
        retries: 0,
        baseDelayMs: 300,
        timeoutMs: 5000
      });
      lookupEntities = lookupData?.entities || {};
    }

    const country = countryId ? getEntityLabel(lookupEntities[countryId]) : "";
    const city = adminId ? getEntityLabel(lookupEntities[adminId]) : "";

    const resolved = {
      teamLabel: teamLabel || teamName,
      venue: getEntityLabel(venueEntity) || "",
      city: city || "",
      country: country || expectedCountry || "",
      latitude: coords.latitude,
      longitude: coords.longitude,
      wikidataTeamId: null,
      wikidataVenueId: venueEntity.id || null
    };

    const validation = validateResolvedGeo(inputRow, resolved);

    if (validation?.ok === false) {
      continue;
    }

    return {
      ...resolved,
      validation: {
        ...(validation || {}),
        sourceMode: "venue_search_fallback",
        venueSearchScore: item.score
      }
    };
  }

  return null;
}

function buildCitySearchQueries(teamName, expectedCountry, teamLabel = "") {
  function cityCandidateFromName(value) {
    return normalizeText(value)
      .replace(/\bF\.?C\.?\b/gi, "")
      .replace(/\bC\.?F\.?\b/gi, "")
      .replace(/\bS\.?C\.?\b/gi, "")
      .replace(/\bA\.?C\.?\b/gi, "")
      .replace(/\bR\.?C\.?D\.?\b/gi, "")
      .replace(/\bFootball Club\b/gi, "")
      .replace(/\bFutbol Club\b/gi, "")
      .replace(/\bClub\b/gi, "")
      .replace(/\bUnited\b/gi, "")
      .replace(/\bUtd\b/gi, "")
      .replace(/\bCity\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  const directTeamCity = cityCandidateFromName(teamName);
  const directLabelCity = cityCandidateFromName(teamLabel);

  const names = [
    directTeamCity,
    directLabelCity,
    stripDiacritics(directTeamCity),
    stripDiacritics(directLabelCity)
  ]
    .map(name => normalizeText(name))
    .filter(Boolean);

  const uniqueNames = [...new Set(names)].slice(0, 3);
  const queries = [];

  for (const name of uniqueNames) {
    if (expectedCountry) {
      queries.push(`${name} ${expectedCountry}`);
    }

    queries.push(name);
  }

  return [...new Set(queries.map(q => normalizeText(q)).filter(Boolean))].slice(0, 6);
}

function scoreCityEntity(entity, searchHit, teamName, expectedCountry) {
  const label = normalizeSearchText(getEntityLabel(entity));
  const description = normalizeSearchText(searchHit?.description);
  const wantedTokens = importantTeamTokens(teamName);
  const expected = normalizeSearchText(expectedCountry);

  let score = 0;

  if (getClaims(entity, "P625").length) score += 30;
  if (getClaims(entity, "P17").length) score += 8;
  if (getClaims(entity, "P131").length) score += 4;

  if (
    description.includes("city") ||
    description.includes("town") ||
    description.includes("municipality") ||
    description.includes("commune") ||
    description.includes("settlement") ||
    description.includes("civil parish") ||
    description.includes("unparished area")
  ) {
    score += 14;
  }

  for (const token of wantedTokens) {
    if (label === token) score += 30;
    else if (label.startsWith(`${token} `)) score += 18;
    else if (label.includes(token)) score += 10;

    if (description.includes(token)) score += 4;
  }

  if (expected) {
    if (description.includes(expected)) score += 8;
  }

  return score;
}

async function resolveCityBySearch(inputRow, teamLabel = "") {
  const teamName = normalizeText(inputRow?.team);
  const expectedCountry = expectedCountryFromLeagueSlug(inputRow?.leagueSlug);
  const queries = buildCitySearchQueries(teamName, expectedCountry, teamLabel);

  const merged = [];
  const seenIds = new Set();

  for (const query of queries.slice(0, 4)) {
    try {
      const searchData = await fetchJson(buildSearchUrl(query, 8), {
        retries: 0,
        baseDelayMs: 250,
        timeoutMs: 4000
      });

      const searchResults = Array.isArray(searchData?.search) ? searchData.search : [];

      for (const item of searchResults) {
        const id = item?.id;
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);
        merged.push(item);
      }

      if (merged.length >= 6) break;
    } catch {
      continue;
    }
  }

  if (!merged.length) return null;

  const ids = merged.map(item => item.id).filter(Boolean).slice(0, 8);

  let entitiesData = null;

  try {
    entitiesData = await fetchJson(buildGetEntitiesUrl(ids), {
      retries: 0,
      baseDelayMs: 300,
      timeoutMs: 4500
    });
  } catch {
    return null;
  }

  const entities = entitiesData?.entities || {};
  const searchHitById = Object.fromEntries(
    merged
      .filter(item => item?.id)
      .map(item => [item.id, item])
  );

  const rankedCities = Object.values(entities)
    .map(entity => ({
      entity,
      score: scoreCityEntity(
        entity,
        searchHitById[entity?.id] || null,
        teamName,
        expectedCountry
      )
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  for (const item of rankedCities.slice(0, 4)) {
    const cityEntity = item.entity;

    if (isCountryLikeEntity(cityEntity)) {
      continue;
    }

    const coordClaim = getClaims(cityEntity, "P625")[0];
    const coords = getCoordinateFromClaim(coordClaim);

    if (!isValidLatitude(coords.latitude) || !isValidLongitude(coords.longitude)) {
      continue;
    }

    const countryClaim = getClaims(cityEntity, "P17")[0];
    const countryId = getEntityIdFromClaim(countryClaim);

    let country = expectedCountry || "";

    if (countryId) {
      try {
        const countryData = await fetchJson(buildGetEntitiesUrl([countryId]), {
          retries: 0,
          baseDelayMs: 300,
          timeoutMs: 3500
        });

        country = getEntityLabel(countryData?.entities?.[countryId]) || country;
      } catch {
        country = expectedCountry || "";
      }
    }

    const resolved = {
      teamLabel: teamLabel || teamName,
      venue: "",
      city: getEntityLabel(cityEntity) || teamName,
      country: country || expectedCountry || "",
      latitude: coords.latitude,
      longitude: coords.longitude,
      wikidataTeamId: null,
      wikidataVenueId: null,
      wikidataCityId: cityEntity.id || null
    };

    const validation = validateResolvedGeo(inputRow, resolved);

    if (validation?.ok === false) {
      continue;
    }

    return {
      ...resolved,
      validation: {
        ...(validation || {}),
        quality: "city_fallback",
        sourceMode: "city_search_fallback",
        citySearchScore: item.score
      }
    };
  }

  return null;
}

async function resolveLocationFromTeamEntity(inputRow, teamEntity, teamLabel = "") {
  if (!teamEntity || typeof teamEntity !== "object") return null;

  const teamName = normalizeText(inputRow?.team);
  const expectedCountry = expectedCountryFromLeagueSlug(inputRow?.leagueSlug);

  const claimProps = [
    "P159", // headquarters location
    "P740", // location of formation
    "P276", // location
    "P131"  // located in administrative territorial entity
  ];

  const candidateIds = [];

  for (const prop of claimProps) {
    for (const claim of getClaims(teamEntity, prop)) {
      const id = getEntityIdFromClaim(claim);
      if (id && !candidateIds.includes(id)) {
        candidateIds.push(id);
      }
    }
  }

  if (!candidateIds.length) return null;

  let entitiesData = null;

  try {
    entitiesData = await fetchJson(buildGetEntitiesUrl(candidateIds.slice(0, 8)), {
      retries: 0,
      baseDelayMs: 300,
      timeoutMs: 5000
    });
  } catch {
    return null;
  }

  const entities = entitiesData?.entities || {};

  for (const locationEntity of Object.values(entities)) {
    if (isCountryLikeEntity(locationEntity)) {
      continue;
    }

    const coordClaim = getClaims(locationEntity, "P625")[0];
    const coords = getCoordinateFromClaim(coordClaim);

    if (!isValidLatitude(coords.latitude) || !isValidLongitude(coords.longitude)) {
      continue;
    }

    const countryClaim = getClaims(locationEntity, "P17")[0];
    const countryId = getEntityIdFromClaim(countryClaim);

    let country = expectedCountry || "";

    if (countryId) {
      try {
        const countryData = await fetchJson(buildGetEntitiesUrl([countryId]), {
          retries: 0,
          baseDelayMs: 300,
          timeoutMs: 3500
        });

        country = getEntityLabel(countryData?.entities?.[countryId]) || country;
      } catch {
        country = expectedCountry || "";
      }
    }

    const resolved = {
      teamLabel: teamLabel || teamName,
      venue: "",
      city: getEntityLabel(locationEntity) || "",
      country: country || expectedCountry || "",
      latitude: coords.latitude,
      longitude: coords.longitude,
      wikidataTeamId: teamEntity.id || null,
      wikidataVenueId: null,
      wikidataCityId: locationEntity.id || null
    };

    const validation = validateResolvedGeo(inputRow, resolved);

    if (validation?.ok === false) {
      continue;
    }

    return {
      ...resolved,
      validation: {
        ...(validation || {}),
        quality: "location_fallback",
        sourceMode: "team_entity_location_claim",
        locationClaimSource: "team_entity"
      }
    };
  }

  return null;
}

function validateResolvedGeo(inputRow, resolved) {
  const slug = normalizeText(inputRow?.leagueSlug);
  const coverage = getLeagueCoverage(slug);
  const expectedCountry = expectedCountryFromLeagueSlug(slug);
  const actualCountry = normalizeText(resolved?.country);

  if (!coverage) {
    return {
      ok: true,
      quality: "unknown_league"
    };
  }

  if (
    expectedCountry &&
    actualCountry &&
    !countryLooksCompatible(expectedCountry, actualCountry)
  ) {
    return {
      ok: false,
      reason: "country_mismatch",
      expectedCountry,
      actualCountry,
      leagueSlug: slug
    };
  }

  const hasCoords = hasUsableCoordinates(resolved);
  const hasVenue = !!normalizeText(resolved?.venue);
  const hasCity = !!normalizeText(resolved?.city);
  const hasCountry = !!actualCountry;

  if (hasCoords && hasVenue && hasCity && hasCountry) {
    return {
      ok: true,
      quality: "complete",
      leagueSlug: slug,
      leagueType: coverage?.type || null
    };
  }

  if (hasCoords || hasVenue || hasCity || hasCountry) {
    return {
      ok: true,
      quality: "partial",
      leagueSlug: slug,
      leagueType: coverage?.type || null
    };
  }

  return {
    ok: false,
    reason: "empty_resolution",
    leagueSlug: slug
  };
}

const TEAM_SEARCH_ALIAS_OVERRIDES = {
  "Al Nassr": ["Al Nassr FC", "Al-Nassr FC", "Al-Nassr Football Club"],
  "Barcelona": ["FC Barcelona", "Futbol Club Barcelona"],
  "BK HΞΒΞ²β‚¬ΒΞβ€™Ξ’Β¤cken": ["BK HΞΒΞ²β‚¬ΒΞβ€™Ξ’Β¤cken", "HΞΒΞ²β‚¬ΒΞβ€™Ξ’Β¤cken", "Bollklubben HΞΒΞ²β‚¬ΒΞβ€™Ξ’Β¤cken"],
  "BolΞΒΞ²β‚¬ΒΞβ€™Ξ’Β­var": ["Club BolΞΒΞ²β‚¬ΒΞβ€™Ξ’Β­var", "Bolivar La Paz", "Club Bolivar"],
  "Burnley": ["Burnley FC", "Burnley F.C.", "Burnley Football Club"],
  "Celta Vigo": ["RC Celta de Vigo", "Real Club Celta de Vigo", "Celta de Vigo"],
  "Corinthians": ["Sport Club Corinthians Paulista", "Corinthians Paulista"],
  "DjurgΞΒΞ²β‚¬ΒΞβ€™Ξ’Β¥rden": ["DjurgΞΒΞ²β‚¬ΒΞβ€™Ξ’Β¥rdens IF Fotboll", "DjurgΞΒΞ²β‚¬ΒΞβ€™Ξ’Β¥rdens IF", "Djurgarden"],
  "Elche": ["Elche CF", "Elche Club de FΞΒΞ²β‚¬ΒΞΒΞ’Βtbol"],
  "FC Andorra": ["FC Andorra", "Futbol Club Andorra"],
  "Fluminense": ["Fluminense FC", "Fluminense Football Club", "Fluminense Football Club Rio de Janeiro"],
  "Getafe": ["Getafe CF", "Getafe Club de FΞΒΞ²β‚¬ΒΞΒΞ’Βtbol"],
  "Girona": ["Girona FC", "Girona Futbol Club"],
  "Independiente MedellΞΒΞ²β‚¬ΒΞβ€™Ξ’Β­n": ["Deportivo Independiente MedellΞΒΞ²β‚¬ΒΞβ€™Ξ’Β­n", "Independiente Medellin", "DIM"],
  "Kifisia": ["Kifisia FC", "Kifisia F.C.", "A.E. Kifisia FC", "AE Kifisia"],
  "Lazio": ["S.S. Lazio", "SS Lazio", "SocietΞΒΞ²β‚¬ΒΞβ€™Ξ’Β  Sportiva Lazio"],
  "LeΞΒΞ²β‚¬ΒΞβ€™Ξ’Β³n": ["Club LeΞΒΞ²β‚¬ΒΞβ€™Ξ’Β³n", "Leon FC", "Club Leon"],
  "Mallorca": ["RCD Mallorca", "Real Club Deportivo Mallorca", "Mallorca"],
  "Middlesbrough": ["Middlesbrough FC", "Middlesbrough F.C.", "Middlesbrough Football Club"],
  "Monterrey": ["C.F. Monterrey", "CF Monterrey", "Club de FΞΒΞ²β‚¬ΒΞΒΞ’Βtbol Monterrey"],
  "Nantes": ["FC Nantes", "Football Club de Nantes"],
  "Nice": ["OGC Nice", "Olympique Gymnaste Club Nice"],
  "Panetolikos": ["Panetolikos FC", "Panetolikos F.C.", "Panetolikos G.F.S."],
  "PeΞΒΞ²β‚¬ΒΞβ€™Ξ’Β±arol": ["Club AtlΞΒΞ²β‚¬ΒΞβ€™Ξ’Β©tico PeΞΒΞ²β‚¬ΒΞβ€™Ξ’Β±arol", "Penarol", "CA PeΞΒΞ²β‚¬ΒΞβ€™Ξ’Β±arol"],
  "Pisa": ["Pisa SC", "Pisa Sporting Club", "AC Pisa 1909"],
  "Pisa SC": ["Pisa", "Pisa Sporting Club", "AC Pisa 1909"],
  "Puebla": ["Club Puebla", "Puebla FC", "Puebla F.C."],
  "QuerΞΒΞ²β‚¬ΒΞβ€™Ξ’Β©taro": ["QuerΞΒΞ²β‚¬ΒΞβ€™Ξ’Β©taro FC", "QuerΞΒΞ²β‚¬ΒΞβ€™Ξ’Β©taro F.C.", "Queretaro FC", "Club QuerΞΒΞ²β‚¬ΒΞβ€™Ξ’Β©taro"],
  "Sporting CP": ["Sporting Clube de Portugal", "Sporting CP", "Sporting Lisbon"],
  "Stellenbosch": ["Stellenbosch FC", "Stellenbosch Football Club"],
  "VΞΒΞ²β‚¬ΒΞβ€™Ξ’Β¤sterΞΒΞ²β‚¬ΒΞβ€™Ξ’Β¥s SK": ["VΞΒΞ²β‚¬ΒΞβ€™Ξ’Β¤sterΞΒΞ²β‚¬ΒΞβ€™Ξ’Β¥s SK Fotboll", "VΞΒΞ²β‚¬ΒΞβ€™Ξ’Β¤sterΞΒΞ²β‚¬ΒΞβ€™Ξ’Β¥s SK", "Vasteras SK"]
};

const VERIFIED_GEO_FALLBACKS = {
  "pe\u00f1arol": {
    teamLabel: "Club Atl\u00e9tico Pe\u00f1arol",
    venue: "Estadio Campe\u00f3n del Siglo",
    city: "Montevideo",
    country: "Uruguay",
    latitude: -34.79675,
    longitude: -56.067138888889,
    wikidataTeamId: "Q131777",
    wikidataVenueId: "Q16564746",
    wikidataCityId: null
  },
  "independiente medell\u00edn": {
    teamLabel: "Deportivo Independiente Medell\u00edn",
    venue: "Estadio Atanasio Girardot",
    city: "Medell\u00edn",
    country: "Colombia",
    latitude: 6.256667,
    longitude: -75.59,
    wikidataTeamId: "Q583923",
    wikidataVenueId: "Q1369335",
    wikidataCityId: null
  },
  "bol\u00edvar": {
    teamLabel: "Club Bol\u00edvar",
    venue: "Estadio Hernando Siles",
    city: "La Paz",
    country: "Bolivia",
    latitude: -16.499444,
    longitude: -68.122778,
    wikidataTeamId: "Q750815",
    wikidataVenueId: "Q1369431",
    wikidataCityId: null
  },
  "pisa": {
    teamLabel: "Pisa SC",
    venue: "Arena Garibaldi \u2013 Stadio Romeo Anconetani",
    city: "Pisa",
    country: "Italy",
    latitude: 43.72528,
    longitude: 10.4,
    wikidataTeamId: "Q543210",
    wikidataVenueId: "Q3659558",
    wikidataCityId: null
  },
  "pisa sc": {
    teamLabel: "Pisa SC",
    venue: "Arena Garibaldi \u2013 Stadio Romeo Anconetani",
    city: "Pisa",
    country: "Italy",
    latitude: 43.72528,
    longitude: 10.4,
    wikidataTeamId: "Q543210",
    wikidataVenueId: "Q3659558",
    wikidataCityId: null
  }
};

function verifiedGeoFallbackForTeam(inputRow) {
  const teamName = canonicalTeamName(inputRow?.team);

  const directKeys = [
    teamName,
    normalizeText(inputRow?.team)
  ]
    .map(value => normalizeText(value).toLowerCase().trim())
    .filter(Boolean);

  const asciiKeys = directKeys
    .map(value => stripDiacritics(value))
    .map(value => value.replace(/[^a-z0-9\s]/g, " "))
    .map(value => value.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const allKeys = [...new Set([...directKeys, ...asciiKeys])];

  const aliases = {
    penarol: "pe\u00f1arol",
    "club atletico penarol": "pe\u00f1arol",
    "ca penarol": "pe\u00f1arol",

    "independiente medellin": "independiente medell\u00edn",
    "deportivo independiente medellin": "independiente medell\u00edn",
    dim: "independiente medell\u00edn",

    bolivar: "bol\u00edvar",
    "club bolivar": "bol\u00edvar",
    "bolivar la paz": "bol\u00edvar",

    pisa: "pisa",
    "pisa sc": "pisa sc",
    "pisa sporting club": "pisa sc",
    "ac pisa 1909": "pisa sc"
  };

  for (const key of allKeys) {
    const fallbackKey = VERIFIED_GEO_FALLBACKS[key] ? key : aliases[key];

    if (!fallbackKey || !VERIFIED_GEO_FALLBACKS[fallbackKey]) continue;

    const fallback = VERIFIED_GEO_FALLBACKS[fallbackKey];

    const validation = {
      ok: true,
      quality: "verified_fallback",
      leagueSlug: normalizeText(inputRow?.leagueSlug) || null,
      leagueType: getLeagueCoverage(normalizeText(inputRow?.leagueSlug))?.type || null,
      sourceMode: "verified_geo_fallback"
    };

    return {
      teamLabel: normalizeText(fallback.teamLabel),
      venue: normalizeText(fallback.venue),
      city: normalizeText(fallback.city),
      country: normalizeText(fallback.country),
      latitude: fallback.latitude,
      longitude: fallback.longitude,
      wikidataTeamId: fallback.wikidataTeamId || null,
      wikidataVenueId: fallback.wikidataVenueId || null,
      wikidataCityId: fallback.wikidataCityId || null,
      validation
    };
  }

  return null;
}

function stripDiacritics(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function uniqueCleanStrings(values) {
  return [
    ...new Set(
      values
        .map(value => normalizeText(value))
        .filter(Boolean)
    )
  ];
}

function buildGenericTeamAliases(teamName) {
  const raw = normalizeText(teamName);
  if (!raw) return [];

  const noDiacritics = stripDiacritics(raw);

  const variants = [
    raw,
    noDiacritics
  ];

  const compactRules = [
    [/^FC\s+/i, ""],
    [/\s+FC$/i, ""],
    [/^CF\s+/i, ""],
    [/\s+CF$/i, ""],
    [/^SC\s+/i, ""],
    [/\s+SC$/i, ""],
    [/^AC\s+/i, ""],
    [/\s+AC$/i, ""],
    [/^AFC\s+/i, ""],
    [/\s+AFC$/i, ""],
    [/^RC\s+/i, ""],
    [/\s+RC$/i, ""],
    [/^RCD\s+/i, ""],
    [/\s+RCD$/i, ""],
    [/^Real\s+/i, ""],
    [/^Club\s+/i, ""],
    [/\s+Club$/i, ""],
    [/\s+Utd$/i, " United"],
    [/\s+F\.C\.$/i, " FC"],
    [/\s+C\.F\.$/i, " CF"]
  ];

  for (const base of [raw, noDiacritics]) {
    for (const [pattern, replacement] of compactRules) {
      const next = normalizeText(base.replace(pattern, replacement));
      if (next && next !== base) variants.push(next);
    }
  }

  const suffixes = [
    "FC",
    "F.C.",
    "Football Club",
    "football club",
    "soccer club"
  ];

  for (const base of [...variants]) {
    for (const suffix of suffixes) {
      if (!new RegExp(`\\b${suffix.replace(".", "\\.")}\\b`, "i").test(base)) {
        variants.push(`${base} ${suffix}`);
      }
    }
  }

  if (/\bUnited\b/i.test(raw)) {
    variants.push(raw.replace(/\bUnited\b/i, "Utd"));
  }

  if (/\bUtd\b/i.test(raw)) {
    variants.push(raw.replace(/\bUtd\b/i, "United"));
  }

  return uniqueCleanStrings(variants);
}

function getOfficialTeamNames(teamName) {
  const raw = normalizeText(teamName);
  const repaired = normalizeText(repairTextEncoding(teamName));
  const noDiacritics = stripDiacritics(repaired);

  const overrides = [
    ...(TEAM_SEARCH_ALIAS_OVERRIDES[raw] || []),
    ...(TEAM_SEARCH_ALIAS_OVERRIDES[repaired] || []),
    ...(TEAM_SEARCH_ALIAS_OVERRIDES[noDiacritics] || [])
  ];

  return uniqueCleanStrings([
    raw,
    repaired,
    noDiacritics,
    ...overrides,
    ...buildGenericTeamAliases(raw),
    ...buildGenericTeamAliases(repaired)
  ]).slice(0, 12);
}

function buildSearchQueries(teamName, expectedCountry) {
  const baseNames = getOfficialTeamNames(teamName).slice(0, 14);
  const queries = [];

  for (const name of baseNames) {
    queries.push(name);
    queries.push(`${name} FC`);
    queries.push(`${name} F.C.`);
    queries.push(`${name} football club`);

    if (expectedCountry) {
      queries.push(`${name} ${expectedCountry}`);
      queries.push(`${name} ${expectedCountry} FC`);
      queries.push(`${name} ${expectedCountry} F.C.`);
      queries.push(`${name} ${expectedCountry} football club`);
    }
  }

  return uniqueCleanStrings(queries).slice(0, 48);
}

function isLikelyTransientWikidataError(err) {
  const message = String(err?.message || err || "");

  return (
    message.includes("wikidata_http_429") ||
    message.includes("wikidata_http_500") ||
    message.includes("wikidata_http_502") ||
    message.includes("wikidata_http_503") ||
    message.includes("wikidata_http_504") ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("fetch_timeout_") ||
    message.includes("aborted") ||
    message.includes("AbortError")
  );
}

async function searchTeamCandidates(teamName, expectedCountry) {
  const queries = buildSearchQueries(teamName, expectedCountry).slice(0, 18);
  const merged = [];
  const seenIds = new Set();
  let lastTransientError = null;

  for (const query of queries) {
    try {
      const searchData = await fetchJson(buildSearchUrl(query, 8), {
        retries: 2,
        baseDelayMs: 1200,
        timeoutMs: 10000
      });

      const searchResults = Array.isArray(searchData?.search) ? searchData.search : [];

      for (const item of searchResults) {
        const id = item?.id;
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);
        merged.push(item);
      }

      if (merged.length >= 12) break;
    } catch (err) {
      if (isLikelyTransientWikidataError(err)) {
        lastTransientError = err;
        await sleep(1500);
        continue;
      }

      continue;
    }

    await sleep(350);
  }

  if (!merged.length && lastTransientError) {
    throw new Error(String(lastTransientError?.message || lastTransientError));
  }

  return merged.slice(0, 12);
}

async function resolveTeamGeo(inputRow) {
  const normalizedInputRow = normalizeBootstrapInputRow(inputRow);
  const verifiedFallback = verifiedGeoFallbackForTeam(normalizedInputRow);
  if (verifiedFallback) return verifiedFallback;

  const teamName = canonicalTeamName(normalizedInputRow?.team);
  const expectedCountry = expectedCountryFromLeagueSlug(normalizedInputRow?.leagueSlug);
  const searchResults = await searchTeamCandidates(teamName, expectedCountry);

  if (!searchResults.length) {
    return (
      await resolveVenueBySearch(normalizedInputRow, teamName) ||
      await resolveCityBySearch(normalizedInputRow, teamName) ||
      verifiedGeoFallbackForTeam(normalizedInputRow)
    );
  }
  const candidateIds = searchResults
    .map(item => item?.id)
    .filter(Boolean)
    .slice(0, 8);

  if (!candidateIds.length) {
    return null;
  }

  const teamEntitiesData = await fetchJson(buildGetEntitiesUrl(candidateIds), {
    retries: 0,
    baseDelayMs: 300,
    timeoutMs: 5000
  });
  const teamEntities = teamEntitiesData?.entities || {};

  const searchHitById = Object.fromEntries(
    searchResults
      .filter(item => item?.id)
      .map(item => [item.id, item])
  );

  const rankedTeams = Object.values(teamEntities)
    .map(entity => ({
      entity,
      score: scoreTeamEntity(
        entity,
        searchHitById[entity?.id] || null,
        teamName,
        expectedCountry
      )
    }))
    .sort((a, b) => b.score - a.score);

  const bestRank = rankedTeams[0] || null;
  const secondRank = rankedTeams[1] || null;
  const bestTeam = bestRank?.entity || null;

  if (!bestTeam) {
    return null;
  }

  const bestTeamLabel = getEntityLabel(bestTeam) || teamName;
  const exactOfficialLabelMatch = isExactOfficialLabelMatch(teamName, bestTeamLabel);

  if (
    secondRank &&
    Number.isFinite(bestRank?.score) &&
    Number.isFinite(secondRank?.score) &&
    bestRank.score - secondRank.score < 4 &&
    !exactOfficialLabelMatch
  ) {
    return {
      rejected: true,
      rejectReason: "ambiguous_top_candidates",
      teamLabel: bestTeamLabel,
      venue: "",
      city: "",
      country: "",
      latitude: null,
      longitude: null,
      wikidataTeamId: bestTeam.id || null,
      wikidataVenueId: null
    };
  }

  const venueClaim = getClaims(bestTeam, "P115")[0];
  const venueId = getEntityIdFromClaim(venueClaim);

  if (!venueId) {
    const fallbackVenue = await resolveVenueBySearch(inputRow, bestTeamLabel);

    if (fallbackVenue) {
      return {
        ...fallbackVenue,
        teamLabel: bestTeamLabel,
        wikidataTeamId: bestTeam.id || null
      };
    }

    const fallbackLocation = await resolveLocationFromTeamEntity(
      inputRow,
      bestTeam,
      bestTeamLabel
    );

    if (fallbackLocation) {
      return {
        ...fallbackLocation,
        teamLabel: bestTeamLabel,
        wikidataTeamId: bestTeam.id || null
      };
    }

    const fallbackCity = await resolveCityBySearch(inputRow, bestTeamLabel);

    if (fallbackCity) {
      return {
        ...fallbackCity,
        teamLabel: bestTeamLabel,
        wikidataTeamId: bestTeam.id || null
      };
    }

    return verifiedGeoFallbackForTeam(normalizedInputRow) || {
      teamLabel: getEntityLabel(bestTeam) || teamName,
      venue: "",
      city: "",
      country: "",
      latitude: null,
      longitude: null,
      wikidataTeamId: bestTeam.id || null,
      wikidataVenueId: null,
      wikidataCityId: null
    };
  }

  const venueEntitiesData = await fetchJson(buildGetEntitiesUrl([venueId]), {
    retries: 1,
    baseDelayMs: 500,
    timeoutMs: 8000
  });
  const venueEntity = venueEntitiesData?.entities?.[venueId] || null;

  if (!venueEntity) {
    const fallbackVenue = await resolveVenueBySearch(inputRow, bestTeamLabel);

    if (fallbackVenue) {
      return {
        ...fallbackVenue,
        teamLabel: bestTeamLabel,
        wikidataTeamId: bestTeam.id || null
      };
    }

    const fallbackLocation = await resolveLocationFromTeamEntity(
      inputRow,
      bestTeam,
      bestTeamLabel
    );

    if (fallbackLocation) {
      return {
        ...fallbackLocation,
        teamLabel: bestTeamLabel,
        wikidataTeamId: bestTeam.id || null
      };
    }

    const fallbackCity = await resolveCityBySearch(inputRow, bestTeamLabel);

    if (fallbackCity) {
      return {
        ...fallbackCity,
        teamLabel: bestTeamLabel,
        wikidataTeamId: bestTeam.id || null
      };
    }

    return verifiedGeoFallbackForTeam(normalizedInputRow) || {
      teamLabel: getEntityLabel(bestTeam) || teamName,
      venue: "",
      city: "",
      country: "",
      latitude: null,
      longitude: null,
      wikidataTeamId: bestTeam.id || null,
      wikidataVenueId: venueId,
      wikidataCityId: null
    };
  }

  const coordClaim = getClaims(venueEntity, "P625")[0];
  const countryClaim = getClaims(venueEntity, "P17")[0];
  const adminClaim = getClaims(venueEntity, "P131")[0];

  const coords = getCoordinateFromClaim(coordClaim);

  if (!isValidLatitude(coords.latitude) || !isValidLongitude(coords.longitude)) {
    const fallbackVenue = await resolveVenueBySearch(inputRow, bestTeamLabel);

    if (fallbackVenue) {
      return {
        ...fallbackVenue,
        teamLabel: bestTeamLabel,
        wikidataTeamId: bestTeam.id || null
      };
    }

    const fallbackLocation = await resolveLocationFromTeamEntity(
      inputRow,
      bestTeam,
      bestTeamLabel
    );

    if (fallbackLocation) {
      return {
        ...fallbackLocation,
        teamLabel: bestTeamLabel,
        wikidataTeamId: bestTeam.id || null
      };
    }

    const fallbackCity = await resolveCityBySearch(inputRow, bestTeamLabel);

    if (fallbackCity) {
      return {
        ...fallbackCity,
        teamLabel: bestTeamLabel,
        wikidataTeamId: bestTeam.id || null
      };
    }

    const verifiedFallback = verifiedGeoFallbackForTeam(normalizedInputRow);
    if (verifiedFallback) return verifiedFallback;
  }

  const countryId = getEntityIdFromClaim(countryClaim);
  const adminId = getEntityIdFromClaim(adminClaim);

  const lookupIds = [countryId, adminId].filter(Boolean);
  let lookupEntities = {};

  if (lookupIds.length) {
    const lookupData = await fetchJson(buildGetEntitiesUrl(lookupIds), {
      retries: 1,
      baseDelayMs: 500,
      timeoutMs: 8000
    });
    lookupEntities = lookupData?.entities || {};
  }

  const country = countryId ? getEntityLabel(lookupEntities[countryId]) : "";
  const city = adminId ? getEntityLabel(lookupEntities[adminId]) : "";

  const resolved = {
    teamLabel: getEntityLabel(bestTeam) || teamName,
    venue: getEntityLabel(venueEntity) || "",
    city: city || "",
    country: country || "",
    latitude: coords.latitude,
    longitude: coords.longitude,
    wikidataTeamId: bestTeam.id || null,
    wikidataVenueId: venueEntity.id || null
  };

  const validation = validateResolvedGeo(inputRow, resolved);

  return {
    ...resolved,
    validation
  };
}

function mergeResolvedRow(inputRow, resolved) {
  const latitude = isValidLatitude(resolved?.latitude)
    ? Number(resolved.latitude)
    : (isValidLatitude(inputRow?.latitude) ? Number(inputRow.latitude) : null);

  const longitude = isValidLongitude(resolved?.longitude)
    ? Number(resolved.longitude)
    : (isValidLongitude(inputRow?.longitude) ? Number(inputRow.longitude) : null);

  return {
    team: canonicalTeamName(inputRow?.team),
    leagueSlug: normalizeText(inputRow?.leagueSlug) || null,
    venue: normalizeText(resolved?.venue) || normalizeText(inputRow?.venue) || "",
    city: normalizeText(resolved?.city) || normalizeText(inputRow?.city) || "",
    country: normalizeText(resolved?.country) || normalizeText(inputRow?.country) || "",
    latitude,
    longitude,
    source: "wikidata_bootstrap",
    sourceMeta: {
      wikidataTeamId: resolved?.wikidataTeamId || null,
      wikidataVenueId: resolved?.wikidataVenueId || null,
      wikidataCityId: resolved?.wikidataCityId || null,
      teamLabel: canonicalTeamName(resolved?.teamLabel) || null,
      validation: normalizeSourceMeta(resolved?.validation || null),
      rejected: !!resolved?.rejected,
      rejectReason: resolved?.rejectReason || null
    }
  };
}

export async function bootstrapTeamGeoFromWikidata({
  inputFile = DEFAULT_INPUT,
  outputFile = DEFAULT_OUTPUT,
  delayMs = 1100,
  rowTimeoutMs = 20000,
  startIndex = 0,
  limit = null,
  checkpointEvery = 5,
  checkpointFile = null,
  resume = true
} = {}) {
  const rows = readJsonArray(inputFile);

  if (!rows.length) {
    return {
      ok: false,
      reason: "no_rows",
      inputFile,
      outputFile,
      total: 0
    };
  }

  const safeStartIndex = toNonNegativeInteger(startIndex, 0);
  const safeLimit = limit === null ? null : toPositiveInteger(limit, null);
  const safeDelayMs = toNonNegativeInteger(delayMs, 1100);
  const safeRowTimeoutMs = toPositiveInteger(rowTimeoutMs, 20000);
  const safeCheckpointEvery = toPositiveInteger(checkpointEvery, 5);
  const resolvedCheckpointFile = checkpointFile || defaultCheckpointFile(outputFile);

  let output = [];
  let alreadyComplete = 0;
  let enrichedComplete = 0;
  let enrichedPartial = 0;
  let notFound = 0;
  let effectiveStartIndex = safeStartIndex;

  if (resume) {
    const checkpoint = readJsonObject(resolvedCheckpointFile);

    if (
      checkpoint &&
      checkpoint.inputFile === inputFile &&
      checkpoint.outputFile === outputFile &&
      Array.isArray(checkpoint.output)
    ) {
      output = checkpoint.output.map(row => normalizeOutputRow(row));
      alreadyComplete = toNonNegativeInteger(checkpoint.alreadyComplete, 0);
      enrichedComplete = toNonNegativeInteger(checkpoint.enrichedComplete, 0);
      enrichedPartial = toNonNegativeInteger(checkpoint.enrichedPartial, 0);
      notFound = toNonNegativeInteger(checkpoint.notFound, 0);
      effectiveStartIndex = Math.max(
        safeStartIndex,
        toNonNegativeInteger(checkpoint.nextIndex, safeStartIndex)
      );

      console.log("[bootstrap-team-geo-from-wikidata] checkpoint:resume", {
        checkpointFile: resolvedCheckpointFile,
        nextIndex: effectiveStartIndex,
        outputRows: output.length
      });
    }
  }

  const endExclusive =
    safeLimit === null
      ? rows.length
      : Math.min(rows.length, effectiveStartIndex + safeLimit);

  for (let i = effectiveStartIndex; i < endExclusive; i += 1) {
    const row = normalizeBootstrapInputRow(rows[i]);
    const team = canonicalTeamName(row?.team);

    console.log("[bootstrap-team-geo-from-wikidata] row:start", {
      index: i + 1,
      total: rows.length,
      batchStartIndex: effectiveStartIndex,
      batchEndIndex: endExclusive - 1,
      team
    });

    try {
      if (isCompleteRow(row)) {
        alreadyComplete += 1;
        output.push(normalizeOutputRow(row, "bootstrap_manual"));

        console.log("[bootstrap-team-geo-from-wikidata] row:done", {
          index: i + 1,
          total: rows.length,
          team,
          status: "already_complete"
        });
      } else {
        const resolved = await withRowTimeout(
          resolveTeamGeo(row),
          safeRowTimeoutMs,
          team
        );

        if (!resolved) {
          notFound += 1;
          output.push(normalizeOutputRow({
            ...row,
            source: normalizeText(row?.source) || "bootstrap_manual",
            sourceMeta: {
              error: "not_found"
            }
          }, "bootstrap_manual"));

          console.log("[bootstrap-team-geo-from-wikidata] row:done", {
            index: i + 1,
            total: rows.length,
            team,
            status: "not_found"
          });
        } else if (resolved?.rejected) {
          notFound += 1;
          output.push(normalizeOutputRow({
            ...row,
            source: normalizeText(row?.source) || "bootstrap_manual",
            sourceMeta: {
              error: resolved.rejectReason || "rejected_candidate",
              wikidataTeamId: resolved?.wikidataTeamId || null,
              teamLabel: canonicalTeamName(resolved?.teamLabel) || null
            }
          }, "bootstrap_manual"));

          console.log("[bootstrap-team-geo-from-wikidata] row:done", {
            index: i + 1,
            total: rows.length,
            team,
            status: "rejected",
            reason: resolved.rejectReason || "rejected_candidate"
          });
        } else {
          const merged = mergeResolvedRow(row, resolved);
          const validationOk = merged?.sourceMeta?.validation?.ok !== false;

          if (!validationOk) {
            notFound += 1;
            output.push(normalizeOutputRow({
              ...row,
              source: normalizeText(row?.source) || "bootstrap_manual",
              sourceMeta: {
                error: merged?.sourceMeta?.validation?.reason || "validation_failed",
                validation: merged?.sourceMeta?.validation || null,
                wikidataTeamId: merged?.sourceMeta?.wikidataTeamId || null,
                wikidataVenueId: merged?.sourceMeta?.wikidataVenueId || null,
                teamLabel: merged?.sourceMeta?.teamLabel || null
              }
            }, "bootstrap_manual"));

            console.log("[bootstrap-team-geo-from-wikidata] row:done", {
              index: i + 1,
              total: rows.length,
              team,
              status: "rejected",
              reason: merged?.sourceMeta?.validation?.reason || "validation_failed"
            });
          } else {
            output.push(merged);

            if (isCompleteRow(merged)) {
              enrichedComplete += 1;
            } else {
              enrichedPartial += 1;
            }

            console.log("[bootstrap-team-geo-from-wikidata] row:done", {
              index: i + 1,
              total: rows.length,
              team,
              status: isCompleteRow(merged) ? "enriched_complete" : "enriched_partial",
              validation: merged?.sourceMeta?.validation?.quality || null
            });
          }
        }
      }
    } catch (err) {
      notFound += 1;
      output.push(normalizeOutputRow({
        ...row,
        source: normalizeText(row?.source) || "bootstrap_manual",
        sourceMeta: {
          error: err?.message || String(err)
        }
      }, "bootstrap_manual"));

      console.log("[bootstrap-team-geo-from-wikidata] row:error", {
        index: i + 1,
        total: rows.length,
        team,
        error: err?.message || String(err)
      });
    }

    const processedInBatch = i - effectiveStartIndex + 1;
    const shouldCheckpoint =
      processedInBatch % safeCheckpointEvery === 0 || i === endExclusive - 1;

    if (shouldCheckpoint) {
      writeCheckpoint(resolvedCheckpointFile, {
        ok: true,
        inputFile,
        outputFile,
        total: rows.length,
        nextIndex: i + 1,
        alreadyComplete,
        enrichedComplete,
        enrichedPartial,
        notFound,
        output
      });

      writeJson(outputFile, output);

      console.log("[bootstrap-team-geo-from-wikidata] checkpoint:write", {
        checkpointFile: resolvedCheckpointFile,
        nextIndex: i + 1,
        outputRows: output.length
      });
    }

    if (i < endExclusive - 1 && safeDelayMs > 0) {
      await sleep(safeDelayMs);
    }
  }

  writeJson(outputFile, output);

  return {
    ok: true,
    inputFile,
    outputFile,
    checkpointFile: resolvedCheckpointFile,
    total: rows.length,
    startedAtIndex: effectiveStartIndex,
    finishedAtIndex: endExclusive - 1,
    processedThisRun: Math.max(0, endExclusive - effectiveStartIndex),
    alreadyComplete,
    enrichedComplete,
    enrichedPartial,
    notFound
  };
}
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const inputFile = process.argv[2] || DEFAULT_INPUT;
  const outputFile = process.argv[3] || DEFAULT_OUTPUT;
  const options = parseCliOptions(process.argv.slice(4));

  const delayMs = toNonNegativeInteger(options.delay ?? options.delayMs, 1100);
  const rowTimeoutMs = toPositiveInteger(
    options["row-timeout"] ?? options.rowTimeoutMs,
    20000
  );
  const startIndex = toNonNegativeInteger(
    options.start ?? options.startIndex,
    0
  );
  const limit =
    options.limit === undefined ? null : toPositiveInteger(options.limit, null);
  const checkpointEvery = toPositiveInteger(
    options["checkpoint-every"] ?? options.checkpointEvery,
    5
  );
  const checkpointFile =
    normalizeText(options.checkpoint || options.checkpointFile) || null;
  const resume =
    options["no-resume"] !== undefined
      ? false
      : toBooleanFlag(options.resume, true);

  console.log("[bootstrap-team-geo-from-wikidata] cli:start", {
    inputFile,
    outputFile,
    delayMs,
    rowTimeoutMs,
    startIndex,
    limit,
    checkpointEvery,
    checkpointFile,
    resume
  });

  bootstrapTeamGeoFromWikidata({
    inputFile,
    outputFile,
    delayMs,
    rowTimeoutMs,
    startIndex,
    limit,
    checkpointEvery,
    checkpointFile,
    resume
  })
    .then(result => {
      console.log("[bootstrap-team-geo-from-wikidata] cli:done", result);
      process.exit(result?.ok ? 0 : 1);
    })
    .catch(err => {
      console.error("[bootstrap-team-geo-from-wikidata] cli:fatal", err);
      process.exit(1);
    });
}
