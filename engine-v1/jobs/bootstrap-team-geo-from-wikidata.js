import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function isCompleteRow(row) {
  return (
    !!normalizeText(row?.team) &&
    !!normalizeText(row?.venue) &&
    !!normalizeText(row?.city) &&
    !!normalizeText(row?.country) &&
    isFiniteNumber(row?.latitude) &&
    isFiniteNumber(row?.longitude)
  );
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "AiMatchLabTeamGeoBootstrap/1.0 (local bootstrap job)"
    }
  });

  if (!response.ok) {
    throw new Error(`wikidata_http_${response.status}`);
  }

  return response.json();
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

function scoreTeamEntity(entity, teamName) {
  const label = getEntityLabel(entity).toLowerCase();
  const wanted = normalizeText(teamName).toLowerCase();

  let score = 0;

  if (label === wanted) score += 10;
  if (label.includes(wanted) || wanted.includes(label)) score += 5;
  if (getClaims(entity, "P115").length) score += 8;

  return score;
}

async function resolveTeamGeo(teamName) {
  const searchData = await fetchJson(buildSearchUrl(teamName));
  const searchResults = Array.isArray(searchData?.search) ? searchData.search : [];

  if (!searchResults.length) {
    return null;
  }

  const candidateIds = searchResults
    .map(item => item?.id)
    .filter(Boolean)
    .slice(0, 5);

  if (!candidateIds.length) {
    return null;
  }

  const teamEntitiesData = await fetchJson(buildGetEntitiesUrl(candidateIds));
  const teamEntities = teamEntitiesData?.entities || {};

  const rankedTeams = Object.values(teamEntities)
    .map(entity => ({
      entity,
      score: scoreTeamEntity(entity, teamName)
    }))
    .sort((a, b) => b.score - a.score);

  const bestTeam = rankedTeams[0]?.entity || null;
  if (!bestTeam) {
    return null;
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

  const venueEntitiesData = await fetchJson(buildGetEntitiesUrl([venueId]));
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
    const lookupData = await fetchJson(buildGetEntitiesUrl(lookupIds));
    lookupEntities = lookupData?.entities || {};
  }

  const country = countryId ? getEntityLabel(lookupEntities[countryId]) : "";
  const city = adminId ? getEntityLabel(lookupEntities[adminId]) : "";

  return {
    teamLabel: getEntityLabel(bestTeam) || teamName,
    venue: getEntityLabel(venueEntity) || "",
    city: city || "",
    country: country || "",
    latitude: coords.latitude,
    longitude: coords.longitude,
    wikidataTeamId: bestTeam.id || null,
    wikidataVenueId: venueEntity.id || null
  };
}

function mergeResolvedRow(inputRow, resolved) {
  return {
    team: normalizeText(inputRow?.team),
    leagueSlug: normalizeText(inputRow?.leagueSlug) || null,
    venue: normalizeText(resolved?.venue) || normalizeText(inputRow?.venue) || "",
    city: normalizeText(resolved?.city) || normalizeText(inputRow?.city) || "",
    country: normalizeText(resolved?.country) || normalizeText(inputRow?.country) || "",
    latitude:
      Number.isFinite(Number(resolved?.latitude))
        ? Number(resolved.latitude)
        : (Number.isFinite(Number(inputRow?.latitude)) ? Number(inputRow.latitude) : null),
    longitude:
      Number.isFinite(Number(resolved?.longitude))
        ? Number(resolved.longitude)
        : (Number.isFinite(Number(inputRow?.longitude)) ? Number(inputRow.longitude) : null),
    source: "wikidata_bootstrap",
    sourceMeta: {
      wikidataTeamId: resolved?.wikidataTeamId || null,
      wikidataVenueId: resolved?.wikidataVenueId || null,
      teamLabel: normalizeText(resolved?.teamLabel) || null
    }
  };
}

export async function bootstrapTeamGeoFromWikidata({
  inputFile = DEFAULT_INPUT,
  outputFile = DEFAULT_OUTPUT,
  delayMs = 500
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

  const output = [];
  let alreadyComplete = 0;
  let enrichedComplete = 0;
  let enrichedPartial = 0;
  let notFound = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const team = normalizeText(row?.team);

    console.log("[bootstrap-team-geo-from-wikidata] row:start", {
      index: i + 1,
      total: rows.length,
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
        const resolved = await resolveTeamGeo(team);

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
        } else {
          const merged = mergeResolvedRow(row, resolved);
          output.push(merged);

          if (isCompleteRow(merged)) enrichedComplete += 1;
          else enrichedPartial += 1;

          console.log("[bootstrap-team-geo-from-wikidata] row:done", {
            index: i + 1,
            total: rows.length,
            team,
            status: isCompleteRow(merged) ? "enriched_complete" : "enriched_partial"
          });
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

    if (i < rows.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  writeJson(outputFile, output);

  return {
    ok: true,
    inputFile,
    outputFile,
    total: rows.length,
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

  console.log("[bootstrap-team-geo-from-wikidata] cli:start", {
    inputFile,
    outputFile
  });

  bootstrapTeamGeoFromWikidata({ inputFile, outputFile })
    .then(result => {
      console.log("[bootstrap-team-geo-from-wikidata] cli:done", result);
    })
    .catch(err => {
      console.error("[bootstrap-team-geo-from-wikidata] cli:fatal", err);
      process.exit(1);
    });
}