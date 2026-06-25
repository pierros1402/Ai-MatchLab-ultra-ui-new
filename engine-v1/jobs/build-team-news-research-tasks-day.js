import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { getFixturesByDay, getFixtureById } from "../storage/json-db.js";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";
import { readTeamNewsRecord, getTeamNewsPath, normalizeTeamKey } from "../storage/team-news-db.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function repairDisplayTeamName(value) {
  const text = normalizeText(value);
  if (!text) return "";

  const repaired = text
    .replace(/Γ©/g, "é")
    .replace(/Γ΅/g, "á")
    .replace(/Γ¶/g, "ö")
    .replace(/Γ¼/g, "ü")
    .replace(/Γ±/g, "ñ")
    .replace(/Γ³/g, "ó")
    .replace(/Γ­/g, "í")
    .replace(/Γ¨/g, "è")
    .replace(/Γ€/g, "à")
    .replace(/Γ§/g, "ç");

  const explicitMap = new Map([
    ["Atlético de San Luis", "Atlético de San Luis"],
    ["Mazatlán FC", "Mazatlán FC"],
    ["América de Cali", "América de Cali"],
    ["Malmö FF", "Malmö FF"]
  ]);

  return explicitMap.get(repaired) || repaired;
}

function sanitizeDeepStrings(value) {
  if (typeof value === "string") {
    return repairDisplayTeamName(value);
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizeDeepStrings(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, sanitizeDeepStrings(entryValue)])
    );
  }

  return value;
}

function sanitizeSerializedJsonText(text) {
  return String(text || "")
    // broken UTF-8 sequences (string form)
    .replace(/Γ©/g, "é")
    .replace(/Γ΅/g, "á")
    .replace(/Γ¶/g, "ö")
    .replace(/Γ¼/g, "ü")
    .replace(/Γ±/g, "ñ")
    .replace(/Γ³/g, "ó")
    .replace(/Γ­/g, "í")
    .replace(/Γ¨/g, "è")
    .replace(/Γ€/g, "à")
    .replace(/Γ§/g, "ç")

    // escaped unicode sequences (JSON layer)
    .replace(/\u0393\u00A9/g, "é")
    .replace(/\u0393\u0385/g, "á")
    .replace(/\u0393\u00B6/g, "ö")
    .replace(/\u0393\u00A4/g, "ä")
    .replace(/\u0393\u00B3/g, "ó")
    .replace(/\u0393\u00AD/g, "í")
    .replace(/\u0393\u00A6/g, "æ")
    .replace(/\u0393\u0388/g, "ø");
}

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
  const jsonText = JSON.stringify(data, null, 2);
  const safeJsonText = sanitizeSerializedJsonText(jsonText);
  fs.writeFileSync(filePath, safeJsonText, "utf8");
}

function hasEvidence(record) {
  if (!record || typeof record !== "object") return false;

  const absencesCount = Array.isArray(record?.absences) ? record.absences.length : 0;
  const notesCount = Array.isArray(record?.notes) ? record.notes.length : 0;
  const evidenceCount = Array.isArray(record?.evidence) ? record.evidence.length : 0;

  return absencesCount > 0 || notesCount > 0 || evidenceCount > 0;
}

function resolveWorksetPath(dayKey) {
  return resolveDataPath("team-news", "_worksets", `${dayKey}.json`);
}

function resolveResearchTasksPath(dayKey) {
  return resolveDataPath("team-news", "_research-tasks", `${dayKey}.json`);
}

function resolveDetailsDir(dayKey) {
  return resolveDataPath("details", dayKey);
}

function buildMatchFromDetail(detail = {}) {
  const basic = detail?.basic || {};

  const matchId = normalizeText(detail?.matchId || basic?.matchId);
  const homeTeam = repairDisplayTeamName(basic?.homeTeam);
  const awayTeam = repairDisplayTeamName(basic?.awayTeam);
  const leagueSlug = normalizeText(basic?.leagueSlug);
  const kickoffUtc = normalizeText(basic?.kickoffUtc);

  if (!matchId || !homeTeam || !awayTeam) {
    return null;
  }

  return {
    matchId,
    id: matchId,
    homeTeam,
    awayTeam,
    homeTeamName: homeTeam,
    awayTeamName: awayTeam,
    leagueSlug: leagueSlug || null,
    kickoffUtc: kickoffUtc || null,
    dayKey: normalizeText(detail?.dayKey) || null,
    venue: normalizeText(basic?.venue) || null,
    status: normalizeText(basic?.status) || null,
    rawStatus: normalizeText(basic?.rawStatus) || null,
    sources: {},
    detailContext: {
      teamNews: detail?.teamNews || null,
      researchedFacts: detail?.researchedFacts || null,
      aiContext: detail?.aiContext || null,
      sourceIntelligence: detail?.sourceIntelligence || null
    }
  };
}

function readDetailsMatches(dayKey) {
  const detailsDir = resolveDetailsDir(dayKey);

  if (!fs.existsSync(detailsDir)) {
    return [];
  }

  return fs
    .readdirSync(detailsDir)
    .filter(name => name.endsWith(".json"))
    .sort()
    .map(name => readJsonSafe(path.join(detailsDir, name), null))
    .filter(Boolean)
    .map(detail => buildMatchFromDetail(detail))
    .filter(Boolean);
}

function sameTeam(a, b) {
  return normalizeKey(a) === normalizeKey(b);
}

function buildFixtureCandidateMap(fixtures = []) {
  const byMatchId = new Map();

  for (const row of Array.isArray(fixtures) ? fixtures : []) {
    const matchId = normalizeText(row?.matchId);
    if (!matchId) continue;
    byMatchId.set(matchId, row);
  }

  return { byMatchId };
}

function enrichWithDetailMatch(baseMatch, detailMatch) {
  if (!baseMatch && !detailMatch) return null;
  if (!baseMatch) return detailMatch;
  if (!detailMatch) return baseMatch;

  return {
    ...baseMatch,
    ...detailMatch,

    matchId: normalizeText(detailMatch?.matchId || baseMatch?.matchId),
    id: normalizeText(detailMatch?.id || detailMatch?.matchId || baseMatch?.id || baseMatch?.matchId),

    homeTeam: repairDisplayTeamName(
      detailMatch?.homeTeam ||
      detailMatch?.homeTeamName ||
      baseMatch?.homeTeam ||
      baseMatch?.homeTeamName
    ),

    awayTeam: repairDisplayTeamName(
      detailMatch?.awayTeam ||
      detailMatch?.awayTeamName ||
      baseMatch?.awayTeam ||
      baseMatch?.awayTeamName
    ),

    homeTeamName: repairDisplayTeamName(
      detailMatch?.homeTeamName ||
      detailMatch?.homeTeam ||
      baseMatch?.homeTeamName ||
      baseMatch?.homeTeam
    ),

    awayTeamName: repairDisplayTeamName(
      detailMatch?.awayTeamName ||
      detailMatch?.awayTeam ||
      baseMatch?.awayTeamName ||
      baseMatch?.awayTeam
    ),

    leagueSlug: normalizeText(detailMatch?.leagueSlug || baseMatch?.leagueSlug) || null,
    kickoffUtc: normalizeText(detailMatch?.kickoffUtc || baseMatch?.kickoffUtc) || null,
    dayKey: normalizeText(detailMatch?.dayKey || baseMatch?.dayKey) || null,
    venue: normalizeText(detailMatch?.venue || baseMatch?.venue) || null,

    sources:
      detailMatch?.sources && typeof detailMatch.sources === "object"
        ? detailMatch.sources
        : (baseMatch?.sources && typeof baseMatch.sources === "object" ? baseMatch.sources : {}),

    detailContext:
      detailMatch?.detailContext && typeof detailMatch.detailContext === "object"
        ? detailMatch.detailContext
        : (baseMatch?.detailContext && typeof baseMatch.detailContext === "object" ? baseMatch.detailContext : {})
  };
}

function pickMatchForTeam(item, fixtures = [], detailMatches = [], fixtureMap = null) {
  const targetTeam = repairDisplayTeamName(item?.team);
  const targetMatchId = normalizeText(item?.matchId);

  if (!targetTeam) return null;

  const detailByMatchId = new Map();
  for (const detailMatch of detailMatches) {
    const matchId = normalizeText(detailMatch?.matchId);
    if (matchId) detailByMatchId.set(matchId, detailMatch);
  }

  if (targetMatchId && fixtureMap?.byMatchId?.has(targetMatchId)) {
    const fixture = fixtureMap.byMatchId.get(targetMatchId);
    const detailMatch = detailByMatchId.get(targetMatchId) || null;
    return enrichWithDetailMatch(fixture, detailMatch);
  }

  if (targetMatchId) {
    const direct = getFixtureById(targetMatchId);
    if (direct) {
      const detailMatch = detailByMatchId.get(targetMatchId) || null;
      return enrichWithDetailMatch(direct, detailMatch);
    }
  }

  const fixtureHit =
    fixtures.find(
      row =>
        sameTeam(row?.homeTeam, targetTeam) ||
        sameTeam(row?.awayTeam, targetTeam) ||
        sameTeam(row?.homeTeamName, targetTeam) ||
        sameTeam(row?.awayTeamName, targetTeam)
    ) || null;

  if (fixtureHit) {
    const detailMatch = detailByMatchId.get(normalizeText(fixtureHit?.matchId)) || null;
    return enrichWithDetailMatch(fixtureHit, detailMatch);
  }

  const detailHit =
    detailMatches.find(
      row =>
        sameTeam(row?.homeTeam, targetTeam) ||
        sameTeam(row?.awayTeam, targetTeam)
    ) || null;

  return detailHit;
}

function buildResearchTaskId(dayKey, matchId, team, taskType = "team_news") {
  const raw = `${normalizeText(dayKey)}|${normalizeText(matchId)}|${normalizeText(team)}|${normalizeText(taskType)}`;
  const hash = crypto.createHash("sha1").update(raw).digest("hex").slice(0, 12);
  return `${taskType}:${hash}`;
}

function buildTeamSide(match, teamName) {
  const team = repairDisplayTeamName(teamName);
  const homeTeam = repairDisplayTeamName(match?.homeTeam || match?.homeTeamName);
  const awayTeam = repairDisplayTeamName(match?.awayTeam || match?.awayTeamName);

  if (sameTeam(team, homeTeam)) return "home";
  if (sameTeam(team, awayTeam)) return "away";
  return null;
}

function buildOpponent(match, teamName) {
  const side = buildTeamSide(match, teamName);
  if (side === "home") return repairDisplayTeamName(match?.awayTeam || match?.awayTeamName) || null;
  if (side === "away") return repairDisplayTeamName(match?.homeTeam || match?.homeTeamName) || null;
  return null;
}

function buildCanonicalTarget(team) {
  const safeTeam = repairDisplayTeamName(team);
  const key = normalizeTeamKey(safeTeam);
  const file = getTeamNewsPath(key);

  return {
    file: file || null,
    entity: "team_news",
    key: key || null,
    team: safeTeam || null
  };
}

function buildResearchQueries(match, team, opponent) {
  const safeTeam = repairDisplayTeamName(team);
  const safeOpponent = repairDisplayTeamName(opponent);
  const leagueSlug = normalizeText(match?.leagueSlug);
  const kickoffUtc = normalizeText(match?.kickoffUtc);
  const queries = [];

  queries.push(`${safeTeam} team news`);
  queries.push(`${safeTeam} injuries suspensions`);
  queries.push(`${safeTeam} probable lineup`);
  queries.push(`${safeTeam} expected lineup`);
  queries.push(`${safeTeam} unavailable players`);

  if (safeOpponent) {
    queries.push(`${safeTeam} vs ${safeOpponent} team news`);
    queries.push(`${safeTeam} vs ${safeOpponent} injuries`);
    queries.push(`${safeTeam} vs ${safeOpponent} expected lineup`);
  }

  if (leagueSlug) {
    queries.push(`${safeTeam} ${leagueSlug} team news`);
  }

  if (kickoffUtc) {
    queries.push(`${safeTeam} ${kickoffUtc.slice(0, 10)} team news`);
  }

  return Array.from(new Set(queries.map(repairDisplayTeamName).map(normalizeText).filter(Boolean)));
}

function buildAcceptancePolicy() {
  return {
    requireAnyOf: [
      "named_absence",
      "named_suspension",
      "named_injury",
      "credible_expected_lineup_note",
      "credible_selection_note"
    ],
    minimumEvidenceItems: 1,
    writeIfUnknown: false,
    writeIfGenericPreviewOnly: false,
    writeIfNoPlayerSignal: false
  };
}

function buildTaskStatus(existingRecord) {
  if (hasEvidence(existingRecord)) {
    return "already_resolved";
  }
  return "pending_research";
}

function buildTaskPriority(match) {
  const kickoffUtc = normalizeText(match?.kickoffUtc);
  if (!kickoffUtc) return 50;

  const kickoffMs = Date.parse(kickoffUtc);
  if (!Number.isFinite(kickoffMs)) return 50;

  const deltaHours = (kickoffMs - Date.now()) / (1000 * 60 * 60);

  if (deltaHours <= 6) return 95;
  if (deltaHours <= 12) return 85;
  if (deltaHours <= 24) return 75;
  if (deltaHours <= 48) return 65;
  return 55;
}

function buildMatchCandidatesFromWorkset(workset, fixtures = [], detailMatches = [], fixtureMap = null) {
  const acquisitionItems = Array.isArray(workset?.needsAcquisition)
    ? workset.needsAcquisition
    : [];

  const byMatchId = new Map();

  for (const item of acquisitionItems) {
    const itemMatchId = normalizeText(item?.matchId);
    const fallbackMatch = {
      matchId: itemMatchId || null,
      id: itemMatchId || null,
      leagueSlug: normalizeText(item?.leagueSlug) || null,
      kickoffUtc: normalizeText(item?.kickoffUtc) || null,
      venue: null,
      homeTeam: repairDisplayTeamName(item?.homeTeam) || null,
      awayTeam: repairDisplayTeamName(item?.awayTeam) || null,
      homeTeamName: repairDisplayTeamName(item?.homeTeam) || null,
      awayTeamName: repairDisplayTeamName(item?.awayTeam) || null,
      dayKey: normalizeText(item?.dayKey) || null,
      sources: {},
      detailContext: {
        teamNews: null,
        researchedFacts: null,
        aiContext: null,
        sourceIntelligence: null
      }
    };

    const pickedMatch = pickMatchForTeam(item, fixtures, detailMatches, fixtureMap);
    const match = enrichWithDetailMatch(fallbackMatch, pickedMatch);
    const matchId = normalizeText(match?.matchId || itemMatchId);

    if (!matchId) {
      const syntheticKey = `no-match:${repairDisplayTeamName(item?.team)}`;
      if (!byMatchId.has(syntheticKey)) {
        byMatchId.set(syntheticKey, {
          matchId: null,
          match: fallbackMatch,
          teams: []
        });
      }

      byMatchId.get(syntheticKey).teams.push({
        team: repairDisplayTeamName(item?.team),
        leagueSlug: normalizeText(item?.leagueSlug) || null,
        item
      });

      continue;
    }

    if (!byMatchId.has(matchId)) {
      byMatchId.set(matchId, {
        matchId,
        match,
        teams: []
      });
    }

    const bucket = byMatchId.get(matchId);
    if (!bucket.match && match) {
      bucket.match = match;
    }

    const teamName = repairDisplayTeamName(item?.team);
    const alreadyExists = bucket.teams.some(x => sameTeam(x?.team, teamName));

    if (!alreadyExists) {
      bucket.teams.push({
        team: teamName,
        leagueSlug: normalizeText(item?.leagueSlug) || null,
        item
      });
    }
  }

  return Array.from(byMatchId.values());
}

export async function buildTeamNewsResearchTasksDay(dayKey, { maxTeams = Infinity } = {}) {
  const safeDayKey = normalizeText(dayKey);
  if (!safeDayKey) {
    throw new Error("missing dayKey");
  }

  const worksetPath = resolveWorksetPath(safeDayKey);
  const workset = readJsonSafe(worksetPath, null);

  if (!workset || !Array.isArray(workset?.needsAcquisition)) {
    return { ok: true, dayKey: safeDayKey, taskCount: 0, skipped: true, reason: "no_workset" };
  }

  const fixtures = getFixturesByDay(safeDayKey) || [];
  const detailMatches = readDetailsMatches(safeDayKey);
  const fixtureMap = buildFixtureCandidateMap(fixtures);

  const rawAcquisitionItems = Array.isArray(workset?.needsAcquisition)
    ? workset.needsAcquisition.filter(Boolean)
    : [];

  const limitedAcquisitionItems = rawAcquisitionItems.slice(
    0,
    Number.isFinite(Number(maxTeams)) ? Number(maxTeams) : rawAcquisitionItems.length
  );

  const limitedWorkset = {
    ...workset,
    needsAcquisition: limitedAcquisitionItems
  };

  const matchCandidates = buildMatchCandidatesFromWorkset(
    limitedWorkset,
    fixtures,
    detailMatches,
    fixtureMap
  );

  const tasks = [];
  const unresolved = [];

  for (const candidate of matchCandidates) {
    const match = candidate?.match || null;
    const safeMatch = match
      ? {
          ...match,
          homeTeam: repairDisplayTeamName(match?.homeTeam || match?.homeTeamName),
          awayTeam: repairDisplayTeamName(match?.awayTeam || match?.awayTeamName)
        }
      : null;
    const matchId = normalizeText(candidate?.matchId);
    const teams = Array.isArray(candidate?.teams) ? candidate.teams : [];

    if (!safeMatch) {
      for (const teamEntry of teams) {
        unresolved.push(sanitizeDeepStrings({
          team: normalizeText(teamEntry?.team),
          matchId: normalizeText(teamEntry?.item?.matchId) || null,
          reason: "no_match_context_found"
        }));
      }
      continue;
    }

    for (const teamEntry of teams) {
      const team = repairDisplayTeamName(
        teamEntry?.item?.team ||
        teamEntry?.team
      );
      const existingRecord = readTeamNewsRecord(team);
      const opponent =
        repairDisplayTeamName(teamEntry?.item?.opponent) ||
        repairDisplayTeamName(buildOpponent(safeMatch, team));

      const side =
        normalizeText(teamEntry?.item?.side).toLowerCase() ||
        buildTeamSide(safeMatch, team);

      tasks.push(sanitizeDeepStrings({
        taskId: buildResearchTaskId(safeDayKey, matchId, team, "team_news"),
        taskType: "team_news",
        status: buildTaskStatus(existingRecord),
        priority: buildTaskPriority(safeMatch),
        dayKey: safeDayKey,
        match: {
          matchId: matchId || null,
          leagueSlug: normalizeText(safeMatch?.leagueSlug) || null,
          kickoffUtc: normalizeText(safeMatch?.kickoffUtc) || null,
          venue: normalizeText(safeMatch?.venue) || null,
          homeTeam: safeMatch?.homeTeam || null,
          awayTeam: safeMatch?.awayTeam || null
        },
        target: {
          team,
          opponent: opponent || null,
          side,
          canonicalTarget: buildCanonicalTarget(team)
        },
        currentState: {
          hasCanonicalRecord: !!existingRecord,
          hasCanonicalEvidence: hasEvidence(existingRecord),
          existingSource: existingRecord?.source || null,
          existingUpdatedAt: existingRecord?.updatedAt || null
        },
        researchPlan: {
          objective: `Resolve usable team-news evidence for ${team}${opponent ? ` before ${team} vs ${opponent}` : ""}`,
          requiredOutputs: [
            "absences",
            "suspensions",
            "injuries",
            "selection_doubts",
            "expected_lineup_notes",
            "evidence_items"
          ],
          queryHints: buildResearchQueries(safeMatch, team, opponent),
          acceptancePolicy: buildAcceptancePolicy()
        },
        sourceHints: {
          matchSourcesAvailable: Object.keys(match?.sources || {}),
          detailContextAvailable: {
            researchedFacts: !!match?.detailContext?.researchedFacts,
            aiContext: !!match?.detailContext?.aiContext,
            sourceIntelligence: !!match?.detailContext?.sourceIntelligence
          }
        },
        audit: {
          createdAt: new Date().toISOString(),
          generator: "build-team-news-research-tasks-day"
        }
      }));
    }
  }

  tasks.sort((a, b) => {
    const pa = Number(a?.priority || 0);
    const pb = Number(b?.priority || 0);
    return pb - pa;
  });

  const result = sanitizeDeepStrings({
    ok: true,
    dayKey: safeDayKey,
    worksetPath,
    fixturesCount: fixtures.length,
    detailMatchesCount: detailMatches.length,
    requestedAcquisitionCount: limitedAcquisitionItems.length,
    taskCount: tasks.length,
    pendingCount: tasks.filter(x => x.status === "pending_research").length,
    alreadyResolvedCount: tasks.filter(x => x.status === "already_resolved").length,
    unresolvedCount: unresolved.length,
    tasks,
    unresolved,
    updatedAt: new Date().toISOString()
  });

  const outPath = resolveResearchTasksPath(safeDayKey);
  writeJson(outPath, result);

  return {
    ...result,
    file: outPath
  };
}

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const dayKey = process.argv[2];
  const maxTeamsArg = process.argv[3];
  const maxTeams =
    Number.isFinite(Number(maxTeamsArg)) && Number(maxTeamsArg) > 0
      ? Number(maxTeamsArg)
      : Infinity;

  console.log("[build-team-news-research-tasks-day] cli:start", {
    dayKey,
    maxTeams: Number.isFinite(maxTeams) ? maxTeams : "all"
  });

  buildTeamNewsResearchTasksDay(dayKey, { maxTeams })
    .then(result => {
      console.log("[build-team-news-research-tasks-day] cli:done", {
        ok: result?.ok,
        dayKey: result?.dayKey,
        taskCount: result?.taskCount ?? 0,
        pendingCount: result?.pendingCount ?? 0,
        alreadyResolvedCount: result?.alreadyResolvedCount ?? 0,
        unresolvedCount: result?.unresolvedCount ?? 0,
        file: result?.file || null
      });
    })
    .catch(err => {
      console.error("[build-team-news-research-tasks-day] cli:fatal", err);
      process.exit(1);
    });
}