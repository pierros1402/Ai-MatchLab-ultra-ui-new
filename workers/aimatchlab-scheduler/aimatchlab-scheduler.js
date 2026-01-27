export default {
  async scheduled(event, env, ctx) {
    const now = new Date();
    const h = now.getUTCHours();
    const m = now.getUTCMinutes();

    try {
      // =====================================================
      // ALWAYS: NUDGE FIXTURES INGEST (resumable)
      // - runs every scheduler tick (*/10)
      // - today + tomorrow
      // =====================================================
      const today = dayKeyTZ("Europe/Athens", new Date());
      const tomorrow = dayKeyTZ("Europe/Athens", new Date(Date.now() + 24 * 60 * 60 * 1000));

      // IMPORTANT:
      // Use your ingest endpoint.
      // If your ingest expects /internal/run, keep it.
      const ingestBase = "https://aimatchlab-fixtures-ingest.workers.dev/internal/run";

      ctx.waitUntil(fetch(`${ingestBase}?date=${today}`, { method: "GET" }));
      ctx.waitUntil(fetch(`${ingestBase}?date=${tomorrow}`, { method: "GET" }));

      // =====================================================
      // DAILY FULL PIPELINE
      // 22:10 UTC → μετά τα μεσάνυχτα Ελλάδας
      // =====================================================
      if (h === 22 && m === 10) {
        await fetch(`https://aimatchlab-fixtures-ingest.workers.dev/internal/run?date=${today}`);
        await fetch("https://aimatchlab-standings-and-team-history.workers.dev/internal/run");
        await fetch("https://aimatchlab-odds-worker.workers.dev/internal/run");
        await fetch("https://aimatchlab-stats-worker.workers.dev/internal/run");
        await fetch("https://aimatchlab-value-worker.workers.dev/internal/run");
        return;
      }

      // =====================================================
      // ODDS SECOND PULL
      // 14:10 UTC → απογευματινό odds refresh
      // =====================================================
      if (h === 14 && m === 10) {
        await fetch("https://aimatchlab-odds-worker.workers.dev/internal/run");
        return;
      }
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
