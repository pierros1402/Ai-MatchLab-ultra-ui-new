export default {
  async scheduled(event, env, ctx) {
    const now = new Date();
    const iso = now.toISOString();

    // ---------- KV debug keys ----------
    const TICK_KEY = "SCHEDULER:LAST_TICK";
    const ERR_KEY = "SCHEDULER:LAST_ERROR";

    // helper: safe kv put (never crash scheduler for kv issues)
    async function safeKvPut(key, value, ttlSeconds) {
      try {
        if (!env?.AIMATCHLAB_KV_CORE) return;
        await env.AIMATCHLAB_KV_CORE.put(
          key,
          typeof value === "string" ? value : JSON.stringify(value),
          ttlSeconds ? { expirationTtl: ttlSeconds } : undefined
        );
      } catch (_) {}
    }

    // write tick at start (TTL 6 hours)
    await safeKvPut(
      TICK_KEY,
      { ok: true, iso, ts: Date.now() },
      6 * 60 * 60
    );

    try {
      const tz = "Europe/Athens";
      const today = dayKeyTZ(tz, now);

      const { h: hh, m: mm } = athensParts(now);

      const FIXTURES_INGEST_BASE =
        "https://aimatchlab-fixtures-ingest.pierros1402.workers.dev";

      async function runIngestBurst(burst = 1) {
        const url = `${FIXTURES_INGEST_BASE}/internal/run?date=${today}&burst=${burst}`;
        const r = await fetch(url, { method: "GET" });
        const t = await r.text();
        if (!r.ok) throw new Error(`fixtures run failed: HTTP ${r.status} :: ${t}`);
        console.log("[scheduler] fixtures run ok", today, "burst", burst);
      }

      async function finalizeFixtures() {
        const url = `${FIXTURES_INGEST_BASE}/internal/finalize?date=${today}`;
        const r = await fetch(url, { method: "GET" });
        const t = await r.text();
        if (!r.ok) throw new Error(`fixtures finalize failed: HTTP ${r.status} :: ${t}`);
        console.log("[scheduler] fixtures finalize ok", today);
      }

      // ---------------------------
      // FIXTURES INGEST WINDOWS
      // ---------------------------

      // Window A: 00:00–03:00 aggressive fill
      if (hh >= 0 && hh < 3) {
        for (let i = 0; i < 3; i++) {
          await runIngestBurst(2);
          await finalizeFixtures();
          await sleep(250);
        }
        return;
      }

      // Window B: 12:00 refresh (first 10 minutes)
      if (hh === 12 && mm < 10) {
        await runIngestBurst(1);
        await finalizeFixtures();
        return;
      }

      // ODDS SNAPSHOT windows
      if ((hh === 6 && mm < 10) || (hh === 15 && mm < 10)) {
        try {
          const oddsURL =
            "https://aimatchlab-odds-worker.pierros1402.workers.dev/internal/run?days=2";
          const r = await fetch(oddsURL, { method: "GET" });
          const txt = await r.text();
          console.log("[scheduler] odds-worker run:", r.status, txt.slice(0, 250));
        } catch (e) {
          console.warn("[scheduler] odds-worker run failed:", e);
        }
      }

      // Window C: maintenance mode (always drain queue)
      await runIngestBurst(1);
      await finalizeFixtures();
      return;

    } catch (e) {
      console.error("[scheduler] error", e);

      // store last error (TTL 24 hours)
      await safeKvPut(
        "SCHEDULER:LAST_ERROR",
        {
          ok: false,
          iso: new Date().toISOString(),
          ts: Date.now(),
          message: String(e?.message || e),
        },
        24 * 60 * 60
      );
    }
  }
};

function dayKeyTZ(tz, d) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d);
}

function athensParts(d) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Athens",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(d);

  const h = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
  const m = parseInt(parts.find(p => p.type === "minute")?.value || "0", 10);
  return { h, m };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
