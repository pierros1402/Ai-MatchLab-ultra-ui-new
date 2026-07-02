import fs from "fs";
import path from "path";

import { LEAGUES_COVERAGE } from "../workers/_shared/leagues-coverage.js";
import { leagueName } from "../workers/_shared/leagues-registry.js";
import { isDisabledLeague } from "../engine-v1/source-discovery/disabled-leagues.js";

const OUT_FILE = path.resolve("assets/data/leagues-catalogue.json");

const REGION_TO_CONTINENT = {
  europe: "EU",
  africa: "AF",
  asia: "AS",
  concacaf: "NA",
  americas: "SA",
  oceania: "OC",
  international: "IN",
  world: "IN"
};

function titleCase(value) {
  return String(value || "Unknown")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

function buildCatalogue() {
  const grouped = {};

  for (const entry of LEAGUES_COVERAGE) {
    if (!entry || !entry.slug) continue;
    if (!["league", "cup", "continental", "national"].includes(entry.type)) continue;
    if (isDisabledLeague(entry.slug)) continue;

    const continent = REGION_TO_CONTINENT[entry.region] || "EU";
    const country = titleCase(entry.country || "Unknown");

    grouped[continent] ||= {};
    grouped[continent][country] ||= [];
    grouped[continent][country].push({
      league_id: entry.slug,
      display_name: leagueName(entry.slug) || entry.slug,
      tier: entry.tier ?? null
    });
  }

  const result = {};
  for (const [continent, countries] of Object.entries(grouped)) {
    result[continent] = Object.entries(countries)
      .map(([country_name, leagues]) => ({
        country_name,
        leagues: leagues.sort((a, b) => {
          const tierDelta = (a.tier || 99) - (b.tier || 99);
          if (tierDelta) return tierDelta;
          return String(a.display_name).localeCompare(String(b.display_name));
        })
      }))
      .sort((a, b) => a.country_name.localeCompare(b.country_name));
  }

  return result;
}

const catalogue = buildCatalogue();
fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, `${JSON.stringify(catalogue, null, 2)}\n`, "utf8");
console.log(`[build-static-leagues-catalogue] wrote ${OUT_FILE}`);
