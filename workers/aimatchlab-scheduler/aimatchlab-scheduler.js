export default {
  async scheduled(event, env, ctx) {
    const now = new Date();

    try {
      // =====================================================
      // FIXTURES INGEST — AUTO (TODAY ONLY)
      //
      // Strategy:
      // - 00:00–03:00 Europe/Athens: aggressive runs (burst=2) to fill the day fast
      // - 12:00 Europe/Athens: one refresh run + finalize (FT / updates)
      //
      // Notes:
      // - We DO NOT run "tomorrow" anymore
      // - We ALWAYS call /internal/finalize after runs, so MAIN UI always has FIXTURES:DATE:<day>
      // =====================================================

      const tz = "Europe/Athens";
      const today = dayKeyTZ(tz, now);

      const athens = athensParts(now);
      const hh = athens.h;
      const mm = athens.m;

      // Your fixtures-ingest worker base URL
      const FIXTURES_INGEST_BASE = "https://aimatchlab-fixtures-ingest.pierros1402.workers.dev";

      // Helper: call ingest run (blocking in ingest worker)
      async function runIngestBurst(burst = 2) {
        const url = `${FIXTURES_INGEST_BASE}/internal/run?date=${today}&burst=${burst}`;
        const r = await fetch(url, { method: "GET" });
        const t = await r.text();
        if (!r.ok) throw new Error(`fixtures-ingest run failed: HTTP ${r.status} :: ${t}`);
        console.log("[scheduler] fixtures run ok", today, "burst", burst);
      }

      // Helper: finalize to FIXTURES:DATE:<day>
      async function finalizeFixtures() {
        const url = `${FIXTURES_INGEST_BASE}/internal/finalize?date=${today}`;
        const r = await fetch(url, { method: "GET" });
        const t = await r.text();
        if (!r.ok) throw new Error(`fixtures-ingest finalize failed: HTTP ${r.status} :: ${t}`);
        console.log("[scheduler] fixtures finalize ok", today);
      }

      // =====================================================
      // Window A: 00:00–03:00 (Athens) — strong fill
      // =====================================================
      if (hh >= 0 && hh < 3) {
        // do 3 cycles of (burst=2 + finalize)
        // => ~60 leagues worth of progress per scheduler tick without subrequest storms
        for (let i = 0; i < 3; i++) {
          await runIngestBurst(2);
          await finalizeFixtures();
          await sleep(250);
        }
        return;
      }

      // =====================================================
      // Window B: exactly 12:00 (Athens) — one refresh
      // =====================================================
      if (hh === 12 && mm < 10) {
        await runIngestBurst(1);
        await finalizeFixtures();
        return;
      }

      
// =====================================================
// ODDS SNAPSHOT (1X2 Opening/Current)
// - 06:00 Europe/Athens: first snapshot (opening)
// - 15:00 Europe/Athens: second snapshot (current)
// =====================================================
if ((hh === 6 && mm < 10) || (hh === 15 && mm < 10)) {
  try {
    const oddsURL = "https://aimatchlab-odds-worker.pierros1402.workers.dev/internal/run?days=2";
    const r = await fetch(oddsURL, { method: "GET" });
    const txt = await r.text();
    console.log("[scheduler] odds-worker run:", r.status, txt.slice(0, 250));
  } catch (e) {
    console.warn("[scheduler] odds-worker run failed:", e);
  }
}
      // Otherwise: do nothing (lightweight mode)
      return;
    } catch (e) {
      console.error("[scheduler] error", e);
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

// Get Athens hour/minute from current UTC date
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
