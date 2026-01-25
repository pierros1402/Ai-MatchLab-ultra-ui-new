export default {
  async scheduled(event, env, ctx) {
    const now = new Date();

    // UTC ώρα
    const h = now.getUTCHours();
    const m = now.getUTCMinutes();

    try {
      // ===== DAILY FULL PIPELINE =====
      // 22:10 UTC → μετά τα μεσάνυχτα Ελλάδας
      if (h === 22 && m === 10) {
        await fetch("https://aimatchlab-fixtures-ingest.workers.dev/internal/run");
        await fetch("https://aimatchlab-standings-and-team-history.workers.dev/internal/run");
        await fetch("https://aimatchlab-odds-worker.workers.dev/internal/run");
        await fetch("https://aimatchlab-stats-worker.workers.dev/internal/run");
        await fetch("https://aimatchlab-value-worker.workers.dev/internal/run");
        return;
      }

      // ===== ODDS SECOND PULL =====
      // 14:10 UTC → απογευματινό odds refresh
      if (h === 14 && m === 10) {
        await fetch("https://aimatchlab-odds-worker.workers.dev/internal/run");
        return;
      }
    } catch (e) {
      console.error("[scheduler] error", e);
    }
  }
};
