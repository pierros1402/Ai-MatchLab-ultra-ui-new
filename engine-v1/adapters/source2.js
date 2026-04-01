// ============================================================
// SOURCE 2 ADAPTER – LOCAL MODE (REAL INGEST ENABLED)
// ============================================================

import fs from "fs";
import path from "path";

const localPath = path.resolve("data/source2-fixtures.json");

export async function fetchLeagueFixturesSource2(slug, dayKey) {

  // ------------------------------------------------------------
  // LOCAL MODE (PRIMARY)
  // ------------------------------------------------------------
  try {

    if (!fs.existsSync(localPath)) {
      return {
        ok: true,
        source: "source2",
        local: true,
        events: []
      };
    }

    const raw = fs.readFileSync(localPath, "utf8");
    const data = JSON.parse(raw);

    const events = Array.isArray(data?.events)
      ? data.events.filter(e =>
          e?.leagueSlug === slug &&
          e?.dayKey === dayKey
        )
      : [];

    return {
      ok: true,
      source: "source2",
      local: true,
      events
    };

  } catch (e) {
    return {
      ok: false,
      source: "source2",
      error: "local_read_failed",
      events: []
    };
  }
}