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
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function normalizeText(value) {
  return String(value || "").trim();
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

    turkey: ["türkiye"],
    türkiye: ["turkey"],

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
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
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

function buildSearchUrl(teamName) {
  const url = new URL(WIKIDATA_API_URL);
  url.searchParams.set("action", "wbsearchentities");
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "en");
  url.searchParams.set("type", "item");
  url.searchParams.set("limit", "5");
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

const TEAM_SEARCH_ALIASES = {
  "Al Nassr": ["Al Nassr FC", "Al-Nassr FC"],
  "Barcelona": ["FC Barcelona"],
  "BK Häcken": ["BK Häcken", "Häcken"],
  "Burnley": ["Burnley F.C.", "Burnley FC"],
  "Celta Vigo": ["RC Celta de Vigo", "Real Club Celta de Vigo"],
  "Djurgården": ["Djurgårdens IF Fotboll", "Djurgårdens IF"],
  "Elche": ["Elche CF"],
  "Getafe": ["Getafe CF"],
  "Kifisia": ["Kifisia F.C.", "A.E. Kifisia FC"],
  "Lazio": ["S.S. Lazio", "SS Lazio"],
  "León": ["Club León", "Leon FC"],
  "Middlesbrough": ["Middlesbrough F.C.", "Middlesbrough FC"],
  "Monterrey": ["C.F. Monterrey", "CF Monterrey"],
  "Nantes": ["FC Nantes"],
  "Nice": ["OGC Nice"],
  "Panetolikos": ["Panetolikos F.C.", "Panetolikos FC"],
  "Puebla": ["Club Puebla", "Puebla F.C."],
  "Querétaro": ["Querétaro F.C.", "Queretaro FC"],
  "Sporting CP": ["Sporting Clube de Portugal", "Sporting CP"],
  "Stellenbosch": ["Stellenbosch FC"],
  "Västerås SK": ["Västerås SK Fotboll", "Västerås SK"]
};

function getOfficialTeamNames(teamName) {
  return [teamName, ...(TEAM_SEARCH_ALIASES[teamName] || [])]
    .map(name => normalizeText(name))
    .filter(Boolean);
}

function isExactOfficialLabelMatch(teamName, entityLabel) {
  const label = normalizeText(entityLabel).toLowerCase();
  if (!label) return false;

  return getOfficialTeamNames(teamName)
    .map(name => normalizeText(name).toLowerCase())
    .includes(label);
}

function buildSearchQueries(teamName, expectedCountry) {
  const aliases = TEAM_SEARCH_ALIASES[teamName] || [];
  const baseNames = [teamName, ...aliases];

  const queries = [];

  for (const name of baseNames) {
    queries.push(name);
    queries.push(`${name} football club`);
    queries.push(`${name} soccer club`);

    if (expectedCountry) {
      queries.push(`${name} ${expectedCountry}`);
      queries.push(`${name} ${expectedCountry} football club`);
      queries.push(`${name} ${expectedCountry} soccer club`);
    }
  }

  return [
    ...new Set(
      queries
        .map(q => normalizeText(q))
        .filter(Boolean)
    )
  ];
}
async function searchTeamCandidates(teamName, expectedCountry) {
  const queries = buildSearchQueries(teamName, expectedCountry);
  const merged = [];
  const seenIds = new Set();

  for (const query of queries) {
    const searchData = await fetchJson(buildSearchUrl(query), {
      retries: 1,
      baseDelayMs: 400,
      timeoutMs: 5000
    });
    const searchResults = Array.isArray(searchData?.search) ? searchData.search : [];

    for (const item of searchResults) {
      const id = item?.id;
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      merged.push(item);
    }

    if (merged.length >= 10) break;
  }

  return merged.slice(0, 10);
}

async function resolveTeamGeo(inputRow) {
  const teamName = normalizeText(inputRow?.team);
  const expectedCountry = expectedCountryFromLeagueSlug(inputRow?.leagueSlug);

  const searchResults = await searchTeamCandidates(teamName, expectedCountry);

  if (!searchResults.length) {
    return null;
  }

  const candidateIds = searchResults
    .map(item => item?.id)
    .filter(Boolean)
    .slice(0, 10);

  if (!candidateIds.length) {
    return null;
  }

  const teamEntitiesData = await fetchJson(buildGetEntitiesUrl(candidateIds), {
    retries: 1,
    baseDelayMs: 500,
    timeoutMs: 8000
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
    return {
      teamLabel: getEntityLabel(bestTeam) || teamName,
      venue: "",
      city: "",
      country: "",
      latitude: null,
      longitude: null,
      wikidataTeamId: bestTeam.id || null,
      wikidataVenueId: null
    };
  }

  const venueEntitiesData = await fetchJson(buildGetEntitiesUrl([venueId]), {
    retries: 1,
    baseDelayMs: 500,
    timeoutMs: 8000
  });
  const venueEntity = venueEntitiesData?.entities?.[venueId] || null;

  if (!venueEntity) {
    return {
      teamLabel: getEntityLabel(bestTeam) || teamName,
      venue: "",
      city: "",
      country: "",
      latitude: null,
      longitude: null,
      wikidataTeamId: bestTeam.id || null,
      wikidataVenueId: venueId
    };
  }

  const coordClaim = getClaims(venueEntity, "P625")[0];
  const countryClaim = getClaims(venueEntity, "P17")[0];
  const adminClaim = getClaims(venueEntity, "P131")[0];

  const coords = getCoordinateFromClaim(coordClaim);
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
    team: normalizeText(inputRow?.team),
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
      teamLabel: normalizeText(resolved?.teamLabel) || null,
      validation: resolved?.validation || null,
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
      output = checkpoint.output;
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
    const row = rows[i];
    const team = normalizeText(row?.team);

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
        output.push({
          ...row,
          source: normalizeText(row?.source) || "bootstrap_manual"
        });

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
          output.push({
            ...row,
            source: normalizeText(row?.source) || "bootstrap_manual",
            sourceMeta: {
              error: "not_found"
            }
          });

          console.log("[bootstrap-team-geo-from-wikidata] row:done", {
            index: i + 1,
            total: rows.length,
            team,
            status: "not_found"
          });
        } else if (resolved?.rejected) {
          notFound += 1;
          output.push({
            ...row,
            source: normalizeText(row?.source) || "bootstrap_manual",
            sourceMeta: {
              error: resolved.rejectReason || "rejected_candidate",
              wikidataTeamId: resolved?.wikidataTeamId || null,
              teamLabel: normalizeText(resolved?.teamLabel) || null
            }
          });

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
            output.push({
              ...row,
              source: normalizeText(row?.source) || "bootstrap_manual",
              sourceMeta: {
                error: merged?.sourceMeta?.validation?.reason || "validation_failed",
                validation: merged?.sourceMeta?.validation || null,
                wikidataTeamId: merged?.sourceMeta?.wikidataTeamId || null,
                wikidataVenueId: merged?.sourceMeta?.wikidataVenueId || null,
                teamLabel: merged?.sourceMeta?.teamLabel || null
              }
            });

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
      output.push({
        ...row,
        source: normalizeText(row?.source) || "bootstrap_manual",
        sourceMeta: {
          error: err?.message || String(err)
        }
      });

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