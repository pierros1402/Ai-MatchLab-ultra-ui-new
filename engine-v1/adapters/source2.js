// ============================================================
// SOURCE 2 ADAPTER – PHASE 2A STUB
// Replace endpoint/headers/parser when real provider is chosen
// ============================================================

export async function fetchLeagueFixturesSource2(slug, dayKey) {
  const base = process.env.SOURCE2_BASE || "";
  const apiKey = process.env.SOURCE2_API_KEY || "";

  // ------------------------------------------------------------
  // SAFE STUB MODE
  // If not configured yet, return empty events and do not break ingest
  // ------------------------------------------------------------
  if (!base) {
    return {
      ok: true,
      source: "source2",
      stub: true,
      events: []
    };
  }

  try {
    const url =
      `${base}/fixtures` +
      `?league=${encodeURIComponent(slug)}` +
      `&date=${encodeURIComponent(dayKey)}`;

    const res = await fetch(url, {
      headers: {
        "accept": "application/json",
        ...(apiKey ? { "x-api-key": apiKey } : {})
      }
    });

    if (res.status === 404) {
      return {
        ok: true,
        source: "source2",
        events: []
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        source: "source2",
        error: `http_${res.status}`,
        events: []
      };
    }

    const data = await res.json();

    // ------------------------------------------------------------
    // EXPECTED SHAPE:
    // { events: [...] }
    // Keep adapter simple; parser stays in normalize-source2.js
    // ------------------------------------------------------------
    return {
      ok: true,
      source: "source2",
      events: Array.isArray(data?.events) ? data.events : []
    };

  } catch (e) {
    return {
      ok: false,
      source: "source2",
      error: String(e?.message || e),
      events: []
    };
  }
}