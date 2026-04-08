import fs from "fs";
import path from "path";
import { getFixturesByDay, getFixtureById } from "../storage/json-db.js";
import { athensDayFromKickoff } from "../core/daykey.js";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function classifyCompetitionType(match) {
  const slug = String(match?.leagueSlug || "").toLowerCase();

  if (
    slug.includes(".cup") ||
    slug.includes("fa") ||
    slug.includes("super_cup") ||
    slug.includes("league_cup") ||
    slug.includes("trophy") ||
    slug.includes("champions") ||
    slug.includes("europa") ||
    slug.includes("confed") ||
    slug.includes("libertadores") ||
    slug.includes("sudamericana")
  ) {
    return "cup";
  }

  return "league";
}

function isLiveLike(status) {
  const s = String(status || "").toUpperCase();
  return s === "LIVE" || s.includes("LIVE") || s.includes("IN_PROGRESS");
}

function isFinalLike(status) {
  const s = String(status || "").toUpperCase();
  return s === "FT" || s.includes("FT") || s.includes("FINAL") || s.includes("COMPLETE");
}

function toIsoOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function kickoffDay(match) {
  if (match?.dayKey) return String(match.dayKey);
  if (match?.kickoffUtc) return athensDayFromKickoff(match.kickoffUtc);
  return null;
}

function readValuePicksForDay(dayKey) {
  if (!dayKey) return [];
  const file = resolveDataPath("value", `${dayKey}.json`);
  const payload = readJsonSafe(file, null);
  return Array.isArray(payload?.picks) ? payload.picks : [];
}

function getValueForMatch(dayKey, matchId) {
  const all = readValuePicksForDay(dayKey);
  return all.filter(p => String(p?.matchId) === String(matchId));
}

function buildRefereeBlock(match) {
  const refereeName =
    match?.referee ||
    match?.sources?.espn?.referee ||
    null;

  const refKey = refereeName
    ? String(refereeName).trim().toLowerCase().replace(/\s+/g, "_")
    : null;

  const refFile = refKey ? resolveDataPath("referees", `${refKey}.json`) : null;
  const cached = refFile ? readJsonSafe(refFile, null) : null;

  return {
    status: cached ? "ready" : refereeName ? "partial" : "pending",
    name: cached?.name || refereeName || null,
    stats: {
      avgCards: cached?.avgCards ?? null,
      avgPenalties: cached?.avgPenalties ?? null,
      avgFouls: cached?.avgFouls ?? null,
      sampleSize: cached?.sampleSize ?? null
    },
    style: cached?.style || "unknown",
    note: cached
      ? null
      : refereeName
        ? {
            code: "referee_stats_pending",
            el: "Ο διαιτητής εντοπίστηκε αλλά δεν υπάρχουν ακόμη αποθηκευμένα στατιστικά.",
            en: "Referee identified, but no stored statistics are available yet."
          }
        : {
            code: "referee_pending",
            el: "Δεν υπάρχει ακόμη διαθέσιμος διαιτητής για το snapshot.",
            en: "No referee is available yet for this snapshot."
          }
  };
}

function buildTravelBlock(match) {
  const slug = String(match?.leagueSlug || "").toLowerCase();

  // V1: structure-first. Real geo lookup μπαίνει όταν δημιουργηθεί data/geo/teams.json.
  const hasGeoCache = fs.existsSync(resolveDataPath("geo", "teams.json"));

  return {
    status: hasGeoCache ? "partial" : "pending",
    distanceKm: null,
    impact: "unknown",
    note: {
      code: "travel_pending",
      el:
        slug.includes("champions") || slug.includes("europa")
          ? "Η απόσταση ταξιδιού θα ενεργοποιηθεί όταν μπει το geo cache ομάδων."
          : "Η απόσταση ταξιδιού εκκρεμεί μέχρι να προστεθεί το geo cache ομάδων.",
      en:
        slug.includes("champions") || slug.includes("europa")
          ? "Travel distance will activate once the team geo cache is added."
          : "Travel distance is pending until the team geo cache is added."
    }
  };
}

function buildMotivationBlock(match) {
  const competitionType = classifyCompetitionType(match);

  if (competitionType !== "league") {
    return {
      status: "not_applicable",
      competitionType,
      motivation: "cup_context",
      table: null,
      note: {
        code: "cup_context",
        el: "Αγώνας κυπέλλου ή διοργάνωσης knockout — δεν χρησιμοποιείται βαθμολογικό κίνητρο πρωταθλήματος.",
        en: "Cup or knockout competition — league table motivation is not applied."
      }
    };
  }

  const standingsFile = resolveDataPath("standings", `${match.leagueSlug}.json`);
  const standings = readJsonSafe(standingsFile, null);

  if (!standings) {
    return {
      status: "pending",
      competitionType,
      motivation: "unknown",
      table: null,
      note: {
        code: "standings_pending",
        el: "Δεν υπάρχει ακόμη αποθηκευμένο standings snapshot για να υπολογιστεί το βαθμολογικό κίνητρο.",
        en: "No stored standings snapshot is available yet to compute table motivation."
      }
    };
  }

  const rows = Array.isArray(standings?.table) ? standings.table : [];
  const home = rows.find(r => String(r.team || r.teamName || r.name) === String(match.homeTeam));
  const away = rows.find(r => String(r.team || r.teamName || r.name) === String(match.awayTeam));

  const posHome = Number(home?.position ?? home?.rank ?? null);
  const posAway = Number(away?.position ?? away?.rank ?? null);

  function classifyPos(pos, total) {
    if (!Number.isFinite(pos) || !Number.isFinite(total) || total <= 0) return "unknown";
    if (pos <= 3) return "high";
    if (pos >= Math.max(total - 2, 1)) return "high";
    if (pos <= 6) return "medium";
    return "medium";
  }

  const total = rows.length || null;
  const homeMot = classifyPos(posHome, total);
  const awayMot = classifyPos(posAway, total);

  return {
    status: "ready",
    competitionType,
    motivation:
      homeMot === "high" || awayMot === "high"
        ? "high"
        : homeMot === "medium" || awayMot === "medium"
          ? "medium"
          : "unknown",
    table: {
      homePosition: Number.isFinite(posHome) ? posHome : null,
      awayPosition: Number.isFinite(posAway) ? posAway : null,
      totalTeams: total
    },
    note: null
  };
}

function buildAnalysisBlock(match, valuePicks, motivation, referee, travel) {
  const codes = [];

  if (isLiveLike(match?.status)) codes.push("live_match");
  if (isFinalLike(match?.status)) codes.push("final_match");
  if ((valuePicks || []).length) codes.push("value_present");
  if (motivation?.motivation === "high") codes.push("high_motivation_context");
  if (referee?.style === "low_intervention") codes.push("low_ref_intervention");
  if (travel?.impact === "high") codes.push("high_travel_load");

  const topPick = (valuePicks || [])
    .slice()
    .sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0))[0];

  const partsEl = [];
  const partsEn = [];

  if (topPick) {
    partsEl.push(
      `Το ισχυρότερο διαθέσιμο value snapshot είναι ${topPick.market} → ${topPick.pick} με score ${Number(topPick.score || 0).toFixed(3)}.`
    );
    partsEn.push(
      `The strongest available value snapshot is ${topPick.market} → ${topPick.pick} with score ${Number(topPick.score || 0).toFixed(3)}.`
    );
  } else {
    partsEl.push("Δεν υπάρχει ακόμη διαθέσιμο value snapshot για τον αγώνα.");
    partsEn.push("No value snapshot is available yet for this match.");
  }

  if (motivation?.competitionType === "league") {
    if (motivation?.motivation === "high") {
      partsEl.push("Υπάρχει ένδειξη αυξημένου βαθμολογικού κινήτρου από το league context.");
      partsEn.push("There is an indication of elevated league-table motivation from the league context.");
    } else if (motivation?.status === "pending") {
      partsEl.push("Το βαθμολογικό κίνητρο δεν έχει ακόμη υπολογιστεί επειδή λείπει standings snapshot.");
      partsEn.push("Table motivation has not been computed yet because the standings snapshot is missing.");
    }
  }

  if (referee?.status === "pending") {
    partsEl.push("Τα στοιχεία διαιτητή δεν είναι ακόμη διαθέσιμα στο snapshot.");
    partsEn.push("Referee information is not yet available in the snapshot.");
  } else if (referee?.status === "partial") {
    partsEl.push("Ο διαιτητής έχει εντοπιστεί, αλλά λείπουν ακόμη τα στατιστικά του profile.");
    partsEn.push("The referee has been identified, but profile statistics are still missing.");
  }

  if (travel?.status !== "ready") {
    partsEl.push("Η εκτίμηση ταξιδιού θα ενεργοποιηθεί όταν προστεθεί geo cache ομάδων.");
    partsEn.push("Travel estimation will activate once the team geo cache is added.");
  }

  return {
    codes,
    summary: {
      el: partsEl.join(" "),
      en: partsEn.join(" ")
    }
  };
}

function buildDetailsPayload(match, valuePicks) {
  const motivation = buildMotivationBlock(match);
  const referee = buildRefereeBlock(match);
  const travel = buildTravelBlock(match);
  const analysis = buildAnalysisBlock(match, valuePicks, motivation, referee, travel);

  return {
    matchId: String(match.matchId),
    dayKey: kickoffDay(match),
    generatedAt: new Date().toISOString(),
    basic: {
      matchId: String(match.matchId),
      leagueSlug: match.leagueSlug || null,
      leagueName: match.leagueName || null,
      competitionType: classifyCompetitionType(match),
      homeTeam: match.homeTeam || null,
      awayTeam: match.awayTeam || null,
      kickoffUtc: toIsoOrNull(match.kickoffUtc),
      status: match.status || null,
      rawStatus: match.rawStatus || null,
      minute: match.minute || null,
      scoreHome: Number.isFinite(Number(match.scoreHome)) ? Number(match.scoreHome) : null,
      scoreAway: Number.isFinite(Number(match.scoreAway)) ? Number(match.scoreAway) : null,
      venue: match.venue || null
    },
    context: {
      motivation: motivation.motivation,
      competitionType: motivation.competitionType,
      table: motivation.table,
      travelImpact: travel.impact
    },
    referee,
    travel,
    value: Array.isArray(valuePicks) ? valuePicks : [],
    analysis,
    meta: {
      version: "details-snapshot-v1",
      languageReady: ["el", "en"],
      source: "engine-v1",
      snapshotMode: "write_once",
      pendingSignals: {
        standings: motivation.status === "pending",
        refereeStats: referee.status !== "ready",
        travelGeo: travel.status !== "ready"
      }
    }
  };
}

function detailsFilePath(dayKey, matchId) {
  return resolveDataPath("details", dayKey, `${matchId}.json`);
}

export function buildDetailsForMatch(matchId, { rebuild = false } = {}) {
  const match = getFixtureById(String(matchId));
  if (!match) {
    return { ok: false, error: "match_not_found", matchId: String(matchId) };
  }

  const dayKey = kickoffDay(match);
  if (!dayKey) {
    return { ok: false, error: "missing_day_key", matchId: String(matchId) };
  }

  const file = detailsFilePath(dayKey, match.matchId);

  if (!rebuild && fs.existsSync(file)) {
    const existing = readJsonSafe(file, null);
    return {
      ok: true,
      dayKey,
      matchId: String(match.matchId),
      file,
      reused: true,
      details: existing
    };
  }

  const valuePicks = getValueForMatch(dayKey, match.matchId);
  const payload = buildDetailsPayload(match, valuePicks);

  writeJson(file, payload);

  return {
    ok: true,
    dayKey,
    matchId: String(match.matchId),
    file,
    reused: false,
    details: payload
  };
}

export function buildDetailsDay(dayKey, { rebuild = false } = {}) {
  const rows = getFixturesByDay(dayKey) || [];

  if (!rows.length) {
    return {
      ok: false,
      dayKey,
      reason: "no_rows",
      built: 0,
      skipped: 0,
      files: []
    };
  }

  ensureDir(resolveDataPath("details", dayKey));

  let built = 0;
  let skipped = 0;
  const files = [];

  for (const match of rows) {
    const file = detailsFilePath(dayKey, match.matchId);

    if (!rebuild && fs.existsSync(file)) {
      skipped += 1;
      files.push(file);
      continue;
    }

    const valuePicks = getValueForMatch(dayKey, match.matchId);
    const payload = buildDetailsPayload(match, valuePicks);

    writeJson(file, payload);
    built += 1;
    files.push(file);
  }

  return {
    ok: true,
    dayKey,
    total: rows.length,
    built,
    skipped,
    files
  };
}