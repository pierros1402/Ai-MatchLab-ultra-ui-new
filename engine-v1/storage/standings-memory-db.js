/**
 * standings-memory-db.js
 *
 * Append-only memory for researched league standings (statistics).
 * One file per league: data/league-memory/standings/{slug}.json
 *
 * Reliability rules (the user's "απλά τσεκάρει, δεν ξαναγράφει"):
 *   - We only OVERWRITE an accepted standing when the incoming one is for a newer
 *     season, OR the same season with >= confidence. A weaker/older result never
 *     clobbers a good one.
 *   - Every attempt is appended to a compact `attempts` log so we can see drift /
 *     freshness without losing the canonical accepted snapshot.
 */

import fs from "fs";
import { resolveDataPath, ensureDir } from "./data-root.js";
import {
  overlayProductionEvidenceTeamRowsReadView,
} from "../core/production-evidence-identity-overlay.js";
import { readTrustedStandingsState } from "./trusted-standings-db.js";

// P0-C P5 READ BOUNDARY: standings evidence team-identity views.

const DIR = resolveDataPath("league-memory", "standings");

function fileFor(slug) {
  return resolveDataPath("league-memory", "standings", `${slug}.json`);
}

function readStandingsRaw(slug) {
  try {
    return JSON.parse(fs.readFileSync(fileFor(slug), "utf8"));
  } catch {
    return null;
  }
}

export function readStandingsEvidence(slug) {
  const raw = readStandingsRaw(slug);
  if (!raw) return null;

  return {
    ...raw,
    accepted: raw.accepted
      ? {
          ...raw.accepted,
          rows:
            overlayProductionEvidenceTeamRowsReadView(
              raw.accepted.rows,
              { leagueSlug: slug },
            ),
        }
      : raw.accepted,
  };
}

/**
 * Consumer-safe standings boundary. Research/legacy league-memory is evidence
 * only and can never become model truth through this API. The accepted view is
 * materialized exclusively from a PASS history-backed standings artifact whose
 * lineage fingerprints still match current history/registry/team-alias inputs.
 */
export function readStandings(slug) {
  const trusted = readTrustedStandingsState(slug);
  if (!trusted.ok || !trusted.artifact) {
    return {
      slug,
      accepted: null,
      attempts: [],
      gate: {
        status: "GATED",
        issues: trusted.validation?.issues || ["TRUSTED_STANDINGS_UNAVAILABLE"],
      },
    };
  }

  const artifact = trusted.artifact;
  return {
    slug,
    updatedAt: artifact.updatedAt || null,
    accepted: {
      season: artifact.seasonReference || null,
      source: "history-backed-standings-foundation",
      url: null,
      confidence: Number(artifact.confidence) || 0,
      rowCount: Array.isArray(artifact.table) ? artifact.table.length : 0,
      rows: overlayProductionEvidenceTeamRowsReadView(
        artifact.table,
        { leagueSlug: slug },
      ),
      fetchedAt: artifact.updatedAt || null,
      foundation: artifact.foundation || null,
    },
    attempts: [],
    gate: { status: "PASS", issues: [] },
  };
}

export function hasAcceptedStandings(slug, season) {
  const cur = readStandings(slug);
  if (!cur?.accepted) return false;
  if (season && cur.accepted.season !== season) return false;
  return Array.isArray(cur.accepted.rows) && cur.accepted.rows.length > 0;
}

function compactRows(rows) {
  return (rows || []).map(r => ({
    position:       r.position,
    teamName:       r.teamName,
    played:         r.played,
    wins:           r.wins,
    draws:          r.draws,
    losses:         r.losses,
    goalsFor:       r.goalsFor,
    goalsAgainst:   r.goalsAgainst,
    goalDifference: r.goalDifference,
    points:         r.points
  }));
}

/**
 * Decide whether `incoming` should replace the currently accepted snapshot.
 */
function shouldReplace(accepted, incoming) {
  if (!accepted) return true;
  // Newer season always wins.
  if (String(incoming.season) > String(accepted.season)) return true;
  if (String(incoming.season) < String(accepted.season)) return false;
  // Same season: replace only if at least as confident.
  return (incoming.confidence || 0) >= (accepted.confidence || 0);
}

/**
 * Record a standings research result. Returns { written, reason }.
 * `result` is the object returned by researchStandings().
 */
export function recordStandingsResult(slug, result) {
  ensureDir(DIR);

  const now = new Date().toISOString();
  const cur = readStandingsRaw(slug) || { slug, accepted: null, attempts: [] };

  const accepted = result.status === "accepted" &&
    Array.isArray(result.rows) && result.rows.length > 0;

  const attempt = {
    at:         now,
    season:     result.season,
    status:     result.status,
    level:      result.level,
    source:     result.source || null,
    url:        result.url || null,
    confidence: result.confidence || 0,
    rowCount:   result.rowCount || 0
  };

  cur.attempts = [...(cur.attempts || []).slice(-9), attempt];
  cur.slug = slug;
  cur.updatedAt = now;

  let written = false;
  let reason = "not_accepted";

  if (accepted) {
    const incoming = {
      season:     result.season,
      source:     result.source || null,
      url:        result.url || null,
      confidence: result.confidence || 0,
      rowCount:   result.rowCount || 0,
      rows:       compactRows(result.rows),
      fetchedAt:  now
    };

    if (shouldReplace(cur.accepted, incoming)) {
      cur.accepted = incoming;
      written = true;
      reason = cur.accepted ? "accepted_replaced" : "accepted_new";
    } else {
      reason = "kept_existing_better_or_equal";
    }
  }

  fs.writeFileSync(fileFor(slug), JSON.stringify(cur, null, 2), "utf8");
  return { written, reason, accepted, slug, season: result.season };
}

/**
 * Drop the accepted snapshot for a league (e.g. it was found to be a corrupt
 * all-time aggregate and no valid current-season table can replace it yet).
 * Keeps the attempts log and records why. Returns { cleared }.
 */
export function clearAcceptedStandings(slug, reason = "cleared") {
  const cur = readStandingsRaw(slug);
  if (!cur?.accepted) return { cleared: false, slug, reason: "nothing_accepted" };

  const now = new Date().toISOString();
  cur.attempts = [...(cur.attempts || []).slice(-9), {
    at: now, status: "cleared", reason,
    season: cur.accepted.season, source: cur.accepted.source || null, rowCount: cur.accepted.rowCount || 0
  }];
  cur.accepted = null;
  cur.updatedAt = now;
  fs.writeFileSync(fileFor(slug), JSON.stringify(cur, null, 2), "utf8");
  return { cleared: true, slug, reason };
}

export function getStandingsSummary() {
  let total = 0;
  let withAccepted = 0;

  try {
    for (const name of fs.readdirSync(DIR)) {
      if (!name.endsWith(".json")) continue;
      total++;
      const data = readStandings(name.replace(/\.json$/, ""));
      if (data?.accepted?.rows?.length) withAccepted++;
    }
  } catch {
    // directory not created yet
  }

  return { total, withAccepted };
}
