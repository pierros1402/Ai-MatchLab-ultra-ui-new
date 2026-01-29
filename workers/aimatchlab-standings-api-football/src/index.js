export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // --------- Helpers ----------
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj, null, 2), {
        status,
        headers: { "content-type": "application/json; charset=utf-8" }
      });

    const text = (s, status = 200) =>
      new Response(String(s), {
        status,
        headers: { "content-type": "text/plain; charset=utf-8" }
      });

    const nowISO = () => new Date().toISOString();

    const requireKV = () => {
      if (!env.AIMATCHLAB_KV_CORE || typeof env.AIMATCHLAB_KV_CORE.put !== "function") {
        return {
          ok: false,
          reason: "missing_kv_binding",
          expectedBinding: "AIMATCHLAB_KV_CORE",
          note:
            "Add kv_namespaces binding in wrangler.toml: { binding = \"AIMATCHLAB_KV_CORE\", id = \"...\" }"
        };
      }
      return null;
    };

    const requireApiKey = () => {
      if (!env.API_FOOTBALL_KEY) {
        return {
          ok: false,
          reason: "missing_api_key",
          expectedSecret: "API_FOOTBALL_KEY",
          note: "Add your API-FOOTBALL key via Cloudflare Secrets: wrangler secret put API_FOOTBALL_KEY"
        };
      }
      return null;
    };

    // --------- Config ----------
    const SEASON_YEAR = 2025; // season 2025 -> 2025/26
    const SEASON_LABEL = "2025-2026";

    // Minimal map now (we can expand later)
    // slug -> api-football league id + official UI name
    const LEAGUES = {
      // England
      "eng.1": { apiLeagueId: 39,  name: "Premier League", country: "England", tier: 1 },
      "eng.2": { apiLeagueId: 40,  name: "Championship", country: "England", tier: 2 },
      "eng.3": { apiLeagueId: 41,  name: "League One", country: "England", tier: 3 },
      "eng.4": { apiLeagueId: 42,  name: "League Two", country: "England", tier: 4 },

      // Germany
      "ger.1": { apiLeagueId: 78,  name: "Bundesliga", country: "Germany", tier: 1 },
      "ger.2": { apiLeagueId: 79,  name: "2. Bundesliga", country: "Germany", tier: 2 },
      "ger.3": { apiLeagueId: 80,  name: "3. Liga", country: "Germany", tier: 3 },

      // Core Europe (1st tiers)
      "esp.1": { apiLeagueId: 140, name: "LaLiga", country: "Spain", tier: 1 },
      "ita.1": { apiLeagueId: 135, name: "Serie A", country: "Italy", tier: 1 },
      "fra.1": { apiLeagueId: 61,  name: "Ligue 1", country: "France", tier: 1 },
      "por.1": { apiLeagueId: 94,  name: "Primeira Liga", country: "Portugal", tier: 1 },
      "ned.1": { apiLeagueId: 88,  name: "Eredivisie", country: "Netherlands", tier: 1 },
      "bel.1": { apiLeagueId: 144, name: "Belgian Pro League", country: "Belgium", tier: 1 },
      "gre.1": { apiLeagueId: 197, name: "Super League Greece", country: "Greece", tier: 1 },
      "cyp.1": { apiLeagueId: 200, name: "Cyprus First Division", country: "Cyprus", tier: 1 }
    };

    const normalizeTeamName = (s) => String(s || "").trim();

    async function apiFetch(path, params = {}) {
      const base = env.API_FOOTBALL_BASE || "https://v3.football.api-sports.io";
      const u = new URL(base + path);
      for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));

      const res = await fetch(u.toString(), {
        headers: {
          "x-apisports-key": env.API_FOOTBALL_KEY
        }
      });

      const txt = await res.text();
      let data = null;
      try { data = JSON.parse(txt); } catch {}
      return { ok: res.ok, status: res.status, data, raw: txt };
    }

    async function fetchStandingsByApiLeagueId(apiLeagueId) {
      const r = await apiFetch("/standings", { league: apiLeagueId, season: SEASON_YEAR });
      if (!r.ok) return { ok: false, status: r.status, error: "fetch_failed", details: r.data || r.raw };

      const response = r.data?.response?.[0];
      const leagueMeta = response?.league || null;
      const standingsGroups = response?.league?.standings || [];
      // Usually standingsGroups[0] is the table
      const table = Array.isArray(standingsGroups) && standingsGroups.length ? standingsGroups[0] : [];

      if (!Array.isArray(table) || table.length === 0) {
        return { ok: true, standings: [], note: "standings_not_available_yet", leagueMeta };
      }

      // Normalize rows
      const rows = table.map((row) => {
        const team = row?.team || {};
        const all = row?.all || {};
        return {
          rank: row?.rank ?? null,
          team: normalizeTeamName(team?.name),
          teamId: team?.id ?? null,
          points: row?.points ?? null,
          played: all?.played ?? null,
          win: all?.win ?? null,
          draw: all?.draw ?? null,
          lose: all?.lose ?? null,
          goalsFor: all?.goals?.for ?? null,
          goalsAgainst: all?.goals?.against ?? null,
          goalDiff: row?.goalsDiff ?? null,
          form: row?.form ?? null
        };
      });

      return { ok: true, standings: rows, leagueMeta };
    }

    async function kvWriteStandings(slug, payload) {
      const kvErr = requireKV();
      if (kvErr) return kvErr;

      const key = `STANDINGS:OFFICIAL:${slug}`;
      await env.AIMATCHLAB_KV_CORE.put(key, JSON.stringify(payload));
      return { ok: true, key };
    }

    async function buildLeaguePayload(slug, standings, note, leagueMeta = null) {
      const info = LEAGUES[slug] || { name: slug, country: null, tier: null, apiLeagueId: null };
      return {
        ok: true,
        type: "standings",
        season: SEASON_YEAR,
        seasonLabel: SEASON_LABEL,
        leagueSlug: slug,
        leagueName: info.name,
        country: info.country,
        tier: info.tier,
        apiLeagueId: info.apiLeagueId,
        updatedAt: nowISO(),
        note: note || null,
        leagueMeta: leagueMeta || null,
        standings: standings || []
      };
    }

    // --------- Routes ----------
    if (path === "/" || path === "/health") {
      const kvOk = !!(env.AIMATCHLAB_KV_CORE && typeof env.AIMATCHLAB_KV_CORE.get === "function");
      const apiOk = !!env.API_FOOTBALL_KEY;
      return json({
        ok: true,
        service: "aimatchlab-standings-api-football",
        season: SEASON_YEAR,
        seasonLabel: SEASON_LABEL,
        hasCoreKV: kvOk,
        hasApiKey: apiOk,
        routes: ["/health", "/leagues", "/standings?league=eng.1", "/run"]
      });
    }

    if (path === "/leagues") {
      const list = Object.entries(LEAGUES).map(([slug, v]) => ({
        leagueSlug: slug,
        leagueName: v.name,
        country: v.country,
        tier: v.tier,
        apiLeagueId: v.apiLeagueId
      }));
      return json({ ok: true, season: SEASON_YEAR, seasonLabel: SEASON_LABEL, total: list.length, leagues: list });
    }

    if (path === "/standings") {
      const slug = url.searchParams.get("league") || url.searchParams.get("slug");
      if (!slug) return json({ ok: false, reason: "missing_league", hint: "Use /standings?league=eng.1" }, 400);

      const info = LEAGUES[slug];
      if (!info || !info.apiLeagueId) {
        return json(
          { ok: false, reason: "unknown_league", league: slug, hint: "Check /leagues" },
          404
        );
      }

      const apiKeyErr = requireApiKey();
      if (apiKeyErr) return json(apiKeyErr, 400);

      const r = await fetchStandingsByApiLeagueId(info.apiLeagueId);
      const payload = await buildLeaguePayload(slug, r.standings || [], r.note || null, r.leagueMeta || null);

      // optional write
      const write = url.searchParams.get("write");
      if (write === "1" || write === "true") {
        const wr = await kvWriteStandings(slug, payload);
        payload.kv = wr;
      }

      return json(payload);
    }

    if (path === "/run") {
      const apiKeyErr = requireApiKey();
      if (apiKeyErr) return json(apiKeyErr, 400);

      const kvErr = requireKV();
      if (kvErr) return json(kvErr, 400);

      const slugs = Object.keys(LEAGUES);
      let written = 0;
      const details = [];

      for (const slug of slugs) {
        const info = LEAGUES[slug];
        try {
          const r = await fetchStandingsByApiLeagueId(info.apiLeagueId);
          const payload = await buildLeaguePayload(slug, r.standings || [], r.note || null, r.leagueMeta || null);
          const key = `STANDINGS:OFFICIAL:${slug}`;
          await env.AIMATCHLAB_KV_CORE.put(key, JSON.stringify(payload));
          written++;
          details.push({
            leagueSlug: slug,
            leagueName: info.name,
            key,
            rows: (payload.standings || []).length,
            status: payload.note ? payload.note : "ok"
          });
        } catch (e) {
          details.push({ leagueSlug: slug, leagueName: info?.name, error: String(e?.message || e) });
        }
      }

      // write index
      const indexKey = "STANDINGS:INDEX";
      const indexPayload = {
        ok: true,
        type: "standings-index",
        season: SEASON_YEAR,
        seasonLabel: SEASON_LABEL,
        updatedAt: nowISO(),
        leagues: slugs
      };
      await env.AIMATCHLAB_KV_CORE.put(indexKey, JSON.stringify(indexPayload));

      return json({
        ok: true,
        season: SEASON_YEAR,
        seasonLabel: SEASON_LABEL,
        written,
        leagues: slugs.length,
        indexKey,
        details
      });
    }

    return text("Not Found", 404);
  }
};
