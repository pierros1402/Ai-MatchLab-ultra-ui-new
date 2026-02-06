// aimatchlab-location-helper
// Computes objective location facts (no interpretation)

export default {
  async fetch(req, env) {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    let payload;
    try {
      payload = await req.json();
    } catch {
      return json({ status: "error", error: "Invalid JSON" }, 400);
    }

    const { matchId, home, away, homeVenue, awayVenue } = payload || {};
    if (!matchId || !home?.lat || !home?.lon || !away?.lat || !away?.lon) {
      return json({ status: "error", error: "Invalid input" }, 400);
    }

    const distance_km = haversine(home.lat, home.lon, away.lat, away.lon);

    const facts = {
      homeVenue: homeVenue || null,
      awayVenue: awayVenue || null,
      distance_km,
      same_city: !!(homeVenue?.city && awayVenue?.city && homeVenue.city === awayVenue.city),
      same_country: !!(homeVenue?.country && awayVenue?.country && homeVenue.country === awayVenue.country),
      cross_border: !!(homeVenue?.country && awayVenue?.country && homeVenue.country !== awayVenue.country)
    };

    const key = `intel/match/${matchId}/location.json`;

    await env.AIMATCHLAB_R2.put(key, JSON.stringify(facts), {
      httpMetadata: { contentType: "application/json" }
    });

    return json({ status: "ok", written: key });
  }
};

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function toRad(x) {
  return (x * Math.PI) / 180;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" }
  });
}
