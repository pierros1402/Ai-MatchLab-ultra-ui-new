import fs from "fs";
import path from "path";
import { resolveDataPath } from "../storage/data-root.js";


export async function getMatchIntelligence(matchId) {
  const fixture = getFixtureById(matchId);

  if (!fixture) {
    return {
      ok: false,
      error: "match_not_found",
      matchId
    };
  }

  return buildMatchIntelligence(fixture);
}