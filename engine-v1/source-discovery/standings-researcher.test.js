import test from "node:test";
import assert from "node:assert/strict";

import { isClubSeasonUrl } from "./standings-researcher.js";

test("club-season pages (name-collision wrong articles) are detected", () => {
  const clubPages = [
    "https://en.wikipedia.org/wiki/2025%E2%80%9326_FC_Andorra_season",   // and.2 collision
    "https://en.wikipedia.org/wiki/2025%E2%80%9326_Granada_CF_season",   // grn.2 collision
    "https://en.wikipedia.org/wiki/2024_Club_Am%C3%A9rica_season"
  ];
  for (const u of clubPages) assert.equal(isClubSeasonUrl(u), true, u);
});

test("real league tables (incl. league-season pages) are NOT flagged", () => {
  const leaguePages = [
    "https://en.wikipedia.org/wiki/2026_Major_League_Soccer_season", // league, ends in "season" but no club token
    "https://en.wikipedia.org/wiki/2025%E2%80%9326_Segunda_Divisi%C3%B3n",
    "https://en.wikipedia.org/wiki/2026_Allsvenskan",
    "https://en.wikipedia.org/wiki/2025%E2%80%9326_Primera_Divisi%C3%B3"
  ];
  for (const u of leaguePages) assert.equal(isClubSeasonUrl(u), false, u);
});
