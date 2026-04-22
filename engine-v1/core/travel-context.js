import { readTeamGeoRecord } from "../storage/team-geo-db.js";

function toRad(deg) {
  return (Number(deg) * Math.PI) / 180;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function classifyImpact(distanceKm) {
  if (!Number.isFinite(distanceKm)) return "unknown";
  if (distanceKm >= 500) return "high";
  if (distanceKm >= 200) return "medium";
  return "low";
}

function buildNote(status, distanceKm, homeGeo, awayGeo) {
  if (status === "ready") {
    return {
      code: "travel_ready",
      el: `Υπολογίστηκε εκτίμηση ταξιδιού περίπου ${Math.round(distanceKm)} χλμ με βάση το τοπικό geo cache ομάδων.`,
      en: `Travel estimate of approximately ${Math.round(distanceKm)} km was calculated from the local team geo cache.`
    };
  }

  if (!homeGeo && !awayGeo) {
    return {
      code: "travel_geo_missing_both",
      el: "Δεν υπάρχουν ακόμη τοπικά geo στοιχεία για καμία από τις δύο ομάδες.",
      en: "No local geo data is available yet for either team."
    };
  }

  if (!homeGeo || !awayGeo) {
    return {
      code: "travel_geo_missing_one_side",
      el: "Λείπουν τοπικά geo στοιχεία για μία από τις δύο ομάδες.",
      en: "Local geo data is missing for one of the two teams."
    };
  }

  return {
    code: "travel_geo_coordinates_missing",
    el: "Υπάρχουν εγγραφές geo ομάδων αλλά λείπουν οι συντεταγμένες για αξιόπιστο υπολογισμό ταξιδιού.",
    en: "Team geo records exist but coordinates are missing for a reliable travel calculation."
  };
}

export function buildTravelContext(match) {
  const homeGeo = readTeamGeoRecord(match?.homeTeam);
  const awayGeo = readTeamGeoRecord(match?.awayTeam);

  if (!homeGeo && !awayGeo) {
    return {
      key: "travel_context",
      status: "empty",
      data: null,
      confidence: 0,
      source: "local-team-geo",
      reason: "missing_local_team_geo_both"
    };
  }

  if (!homeGeo || !awayGeo) {
    return {
      key: "travel_context",
      status: "partial",
      data: {
        home: homeGeo || null,
        away: awayGeo || null,
        distanceKm: null,
        impact: "unknown",
        note: buildNote("partial", null, homeGeo, awayGeo)
      },
      confidence: 0.35,
      source: "local-team-geo",
      reason: "missing_local_team_geo_one_side"
    };
  }

  const hasCoords =
    Number.isFinite(homeGeo?.latitude) &&
    Number.isFinite(homeGeo?.longitude) &&
    Number.isFinite(awayGeo?.latitude) &&
    Number.isFinite(awayGeo?.longitude);

  if (!hasCoords) {
    return {
      key: "travel_context",
      status: "partial",
      data: {
        home: homeGeo,
        away: awayGeo,
        distanceKm: null,
        impact: "unknown",
        note: buildNote("partial", null, homeGeo, awayGeo)
      },
      confidence: 0.45,
      source: "local-team-geo",
      reason: "missing_local_team_geo_coordinates"
    };
  }

  const distanceKm = haversineKm(
    homeGeo.latitude,
    homeGeo.longitude,
    awayGeo.latitude,
    awayGeo.longitude
  );

  const impact = classifyImpact(distanceKm);

  return {
    key: "travel_context",
    status: "ready",
    data: {
      home: homeGeo,
      away: awayGeo,
      distanceKm: Number(distanceKm.toFixed(1)),
      impact,
      note: buildNote("ready", distanceKm, homeGeo, awayGeo)
    },
    confidence: 0.78,
    source: "local-team-geo",
    reason: null
  };
}