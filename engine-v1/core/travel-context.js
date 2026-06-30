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

function normalizeCountry(value) {
  const raw = String(value || "").trim().toLowerCase();

  const aliases = {
    uk: "united kingdom",
    "great britain": "united kingdom",
    england: "united kingdom",
    scotland: "united kingdom",
    wales: "united kingdom",
    "northern ireland": "united kingdom",
    usa: "united states of america",
    "united states": "united states of america",
    türkiye: "turkey",
    czechia: "czech republic"
  };

  return aliases[raw] || raw;
}

function isSameCountry(homeGeo, awayGeo) {
  const home = normalizeCountry(homeGeo?.country);
  const away = normalizeCountry(awayGeo?.country);

  if (!home || !away) return null;
  return home === away;
}

function classifyTravelProfile(distanceKm, sameCountry) {
  if (!Number.isFinite(distanceKm)) return "unknown";
  if (sameCountry === false) return "cross_border";
  if (distanceKm >= 700) return "long_domestic";
  if (distanceKm >= 250) return "regional_domestic";
  return "local_domestic";
}

function classifyImpact(distanceKm) {
  if (!Number.isFinite(distanceKm)) return "unknown";
  if (distanceKm >= 500) return "high";
  if (distanceKm >= 200) return "medium";
  return "low";
}

function buildNote(status, distanceKm, homeGeo, awayGeo, sameCountry, travelProfile) {
  if (status === "ready") {
    if (sameCountry === false) {
      return {
        code: "travel_ready_cross_border",
        el: `Υπολογίστηκε εκτίμηση ταξιδιού περίπου ${Math.round(distanceKm)} χλμ και πρόκειται για διασυνοριακή μετακίνηση με βάση το τοπικό geo cache ομάδων.`,
        en: `A travel estimate of approximately ${Math.round(distanceKm)} km was calculated and the trip is cross-border based on the local team geo cache.`
      };
    }

    return {
      code: "travel_ready",
      el: `Υπολογίστηκε εκτίμηση ταξιδιού περίπου ${Math.round(distanceKm)} χλμ (${travelProfile}) με βάση το τοπικό geo cache ομάδων.`,
      en: `A travel estimate of approximately ${Math.round(distanceKm)} km (${travelProfile}) was calculated from the local team geo cache.`
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

const NATIONAL_COMPETITION_SLUGS = new Set([
  "fifa.world", "fifa.world_cup_qual",
  "uefa.euro", "uefa.euro_qual", "uefa.nations_league",
  "conmebol.copa_america", "caf.afcon", "afc.asian_cup",
  "concacaf.gold_cup", "concacaf.nations_league"
]);

export function buildTravelContext(match) {
  // National-team competitions at neutral venues: travel is symmetric / N/A.
  const slug = match?.leagueSlug || match?.competition?.slug || "";
  if (NATIONAL_COMPETITION_SLUGS.has(slug)) {
    return {
      key: "travel_context",
      status: "not_applicable",
      data: null,
      confidence: 0,
      source: "national-competition",
      reason: "neutral_venue_national_teams"
    };
  }

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
        sameCountry: null,
        crossBorder: null,
        travelProfile: "unknown",
        note: buildNote("partial", null, homeGeo, awayGeo, null, "unknown")
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
        sameCountry: isSameCountry(homeGeo, awayGeo),
        crossBorder: isSameCountry(homeGeo, awayGeo) === false,
        travelProfile: "unknown",
        note: buildNote(
          "partial",
          null,
          homeGeo,
          awayGeo,
          isSameCountry(homeGeo, awayGeo),
          "unknown"
        )
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
  const sameCountry = isSameCountry(homeGeo, awayGeo);
  const travelProfile = classifyTravelProfile(distanceKm, sameCountry);

  return {
    key: "travel_context",
    status: "ready",
    data: {
      home: homeGeo,
      away: awayGeo,
      distanceKm: Number(distanceKm.toFixed(1)),
      impact,
      sameCountry,
      crossBorder: sameCountry === false,
      travelProfile,
      note: buildNote(
        "ready",
        distanceKm,
        homeGeo,
        awayGeo,
        sameCountry,
        travelProfile
      )
    },
    confidence: 0.78,
    source: "local-team-geo",
    reason: null
  };
}