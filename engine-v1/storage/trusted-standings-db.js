import fs from "node:fs";

import { resolveDataPath } from "./data-root.js";
import {
  readHistoryRows,
  validateStandingsFoundationArtifact,
} from "../core/standings-foundation.js";

function clean(value) {
  return String(value ?? "").trim();
}

const historyCache = new Map();

function cachedHistoryRows(season) {
  const historyPath = resolveDataPath("history", `${season}.json`);
  const stat = fs.statSync(historyPath);
  const cached = historyCache.get(season);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.rows;
  }
  const rows = readHistoryRows(season);
  historyCache.set(season, { mtimeMs: stat.mtimeMs, size: stat.size, rows });
  return rows;
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

export function trustedStandingsFileFor(slug) {
  return resolveDataPath("standings", `${clean(slug)}.json`);
}

export function readTrustedStandingsState(slug) {
  const leagueSlug = clean(slug);
  if (!leagueSlug) {
    return {
      ok: false,
      status: "GATED",
      leagueSlug: null,
      artifact: null,
      validation: { ok: false, issues: ["LEAGUE_SLUG_REQUIRED"] },
    };
  }

  const artifact = readJsonSafe(trustedStandingsFileFor(leagueSlug));
  if (!artifact) {
    return {
      ok: false,
      status: "GATED",
      leagueSlug,
      artifact: null,
      validation: { ok: false, issues: ["TRUSTED_STANDINGS_ARTIFACT_MISSING"] },
    };
  }

  let historyRows = null;
  try {
    const season = artifact?.foundation?.historySeason;
    if (season) historyRows = cachedHistoryRows(season);
  } catch {
    historyRows = null;
  }

  let validation;
  try {
    validation = validateStandingsFoundationArtifact(artifact, {
      slug: leagueSlug,
      ...(historyRows ? { historyRows } : {}),
    });
  } catch (error) {
    validation = {
      ok: false,
      status: "GATED",
      leagueSlug,
      issues: [String(error?.code || error?.message || "TRUSTED_STANDINGS_VALIDATION_FAILED")],
    };
  }

  return {
    ok: validation.ok === true,
    status: validation.ok === true ? "PASS" : "GATED",
    leagueSlug,
    artifact: validation.ok === true ? artifact : null,
    rawArtifact: artifact,
    validation,
  };
}

export function readTrustedStandingsArtifact(slug) {
  return readTrustedStandingsState(slug).artifact;
}

export function listTrustedStandingsSlugs() {
  const dir = resolveDataPath("standings");
  try {
    return fs.readdirSync(dir)
      .filter(name => name.endsWith(".json"))
      .map(name => name.slice(0, -5))
      .filter(slug => readTrustedStandingsState(slug).ok)
      .sort();
  } catch {
    return [];
  }
}
