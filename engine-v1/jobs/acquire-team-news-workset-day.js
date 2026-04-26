import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getFixturesByDay, getFixtureById } from "../storage/json-db.js";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";
import { readTeamNewsRecord } from "../storage/team-news-db.js";
import { buildTeamNewsWorksetDay } from "./build-team-news-workset-day.js";
import { buildTeamNewsDay } from "./build-team-news-day.js";
import { fetchMatchResearch } from "../ai-match-intelligence/fetch-match-research.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
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
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
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

function resolveAcquisitionReportPath(dayKey) {
  return resolveDataPath("team-news", "_reports", `${dayKey}.acquisition.json`);
}

function resolveDetailsDir(dayKey) {
  return resolveDataPath("details", dayKey);
}

function buildMatchFromDetail(detail = {}) {
  const basic = detail?.basic || {};

  const matchId = normalizeText(detail?.matchId || basic?.matchId);
  const homeTeam = normalizeText(basic?.homeTeam);
  const awayTeam = normalizeText(basic?.awayTeam);
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
    status: normalizeText(basic?.status) || null,
    rawStatus: normalizeText(basic?.rawStatus) || null,
    minute: normalizeText(basic?.minute) || null,
    scoreHome:
      Number.isFinite(Number(basic?.scoreHome)) ? Number(basic.scoreHome) : null,
    scoreAway:
      Number.isFinite(Number(basic?.scoreAway)) ? Number(basic.scoreAway) : null,
    venue: normalizeText(basic?.venue) || null,
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

  return {
    byMatchId
  };
}

function enrichWithDetailMatch(baseMatch, detailMatch) {
  if (!baseMatch && !detailMatch) return null;
  if (!baseMatch) return detailMatch;
  if (!detailMatch) return baseMatch;

  return {
    ...detailMatch,
    ...baseMatch,
    matchId: normalizeText(baseMatch?.matchId || detailMatch?.matchId),
    id: normalizeText(baseMatch?.id || baseMatch?.matchId || detailMatch?.id || detailMatch?.matchId),
    homeTeam: normalizeText(
      baseMatch?.homeTeam ||
      baseMatch?.homeTeamName ||
      detailMatch?.homeTeam ||
      detailMatch?.homeTeamName
    ),
    awayTeam: normalizeText(
      baseMatch?.awayTeam ||
      baseMatch?.awayTeamName ||
      detailMatch?.awayTeam ||
      detailMatch?.awayTeamName
    ),
    leagueSlug: normalizeText(baseMatch?.leagueSlug || detailMatch?.leagueSlug) || null,
    kickoffUtc: normalizeText(baseMatch?.kickoffUtc || detailMatch?.kickoffUtc) || null,
    dayKey: normalizeText(baseMatch?.dayKey || detailMatch?.dayKey) || null,
    sources:
      baseMatch?.sources && typeof baseMatch.sources === "object"
        ? baseMatch.sources
        : (detailMatch?.sources && typeof detailMatch.sources === "object"
            ? detailMatch.sources
            : {})
  };
}

function pickMatchForTeam(item, fixtures = [], detailMatches = [], fixtureMap = null) {
  const targetTeam = normalizeText(item?.team);
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

function buildFetchContext(match = {}) {
  return {
    researchedFacts: match?.detailContext?.researchedFacts || {},
    teamNewsContext: match?.detailContext?.aiContext?.teamNewsContext || null,
    research: match?.detailContext?.sourceIntelligence || {}
  };
}

function buildMatchCandidatesFromWorkset(workset, fixtures = [], detailMatches = [], fixtureMap = null) {
  const missingItems = Array.isArray(workset?.missing) ? workset.missing : [];
  const byMatchId = new Map();

  for (const item of missingItems) {
    const match = pickMatchForTeam(item, fixtures, detailMatches, fixtureMap);
    const matchId = normalizeText(match?.matchId || item?.matchId);

    if (!matchId) {
      const syntheticKey = `no-match:${normalizeText(item?.team)}`;
      if (!byMatchId.has(syntheticKey)) {
        byMatchId.set(syntheticKey, {
          matchId: null,
          match: null,
          teams: []
        });
      }

      byMatchId.get(syntheticKey).teams.push({
        team: normalizeText(item?.team),
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

    const teamName = normalizeText(item?.team);
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

export async function acquireTeamNewsWorksetDay(
  dayKey,
  {
    maxTeams = Infinity,
    rebuildWorksetFirst = false
  } = {}
) {
  const safeDayKey = normalizeText(dayKey);

  if (!safeDayKey) {
    throw new Error("missing dayKey");
  }

  if (rebuildWorksetFirst) {
    await buildTeamNewsWorksetDay(safeDayKey);
  }

  const worksetPath = resolveWorksetPath(safeDayKey);
  const workset = readJsonSafe(worksetPath, null);

  if (!workset || !Array.isArray(workset?.missing)) {
    throw new Error(`team-news workset not found or invalid: ${worksetPath}`);
  }

  const fixtures = getFixturesByDay(safeDayKey) || [];
  const fixtureMap = buildFixtureCandidateMap(fixtures);
  const detailMatches = readDetailsMatches(safeDayKey);

  const rawMissingItems = Array.isArray(workset?.missing) ? workset.missing.filter(Boolean) : [];
  const limitedMissingItems = rawMissingItems.slice(
    0,
    Number.isFinite(Number(maxTeams)) ? Number(maxTeams) : rawMissingItems.length
  );

  const limitedWorkset = {
    ...workset,
    missing: limitedMissingItems
  };

  const matchCandidates = buildMatchCandidatesFromWorkset(
    limitedWorkset,
    fixtures,
    detailMatches,
    fixtureMap
  );

  const attempted = [];
  const acquired = [];
  const failed = [];
  const skipped = [];
  const attemptedMatches = [];

  for (const candidate of matchCandidates) {
    const match = candidate?.match || null;
    const matchId = normalizeText(candidate?.matchId);
    const teams = Array.isArray(candidate?.teams) ? candidate.teams : [];

    if (!match) {
      for (const teamEntry of teams) {
        failed.push({
          team: normalizeText(teamEntry?.team),
          matchId: normalizeText(teamEntry?.item?.matchId) || null,
          reason: "no_match_context_found"
        });
      }
      continue;
    }

    const teamsNeedingAttempt = [];
    for (const teamEntry of teams) {
      const team = normalizeText(teamEntry?.team);
      const existingBefore = readTeamNewsRecord(team);

      if (hasEvidence(existingBefore)) {
        skipped.push({
          team,
          reason: "already_has_canonical_evidence",
          record: {
            updatedAt: existingBefore?.updatedAt || null,
            source: existingBefore?.source || null,
            absencesCount: Array.isArray(existingBefore?.absences) ? existingBefore.absences.length : 0,
            notesCount: Array.isArray(existingBefore?.notes) ? existingBefore.notes.length : 0,
            evidenceCount: Array.isArray(existingBefore?.evidence) ? existingBefore.evidence.length : 0
          }
        });
        continue;
      }

      teamsNeedingAttempt.push(teamEntry);

      attempted.push({
        team,
        matchId: matchId || null,
        leagueSlug: normalizeText(match?.leagueSlug) || null,
        homeTeam: normalizeText(match?.homeTeam || match?.homeTeamName) || null,
        awayTeam: normalizeText(match?.awayTeam || match?.awayTeamName) || null
      });
    }

    if (!teamsNeedingAttempt.length) {
      continue;
    }

    let fetchResult = null;
    let fetchError = null;

    attemptedMatches.push({
      matchId: matchId || null,
      leagueSlug: normalizeText(match?.leagueSlug) || null,
      homeTeam: normalizeText(match?.homeTeam || match?.homeTeamName) || null,
      awayTeam: normalizeText(match?.awayTeam || match?.awayTeamName) || null,
      teams: teamsNeedingAttempt.map(x => normalizeText(x?.team))
    });

    try {
      fetchResult = await fetchMatchResearch(match, {
        useCache: false,
        allowRemote: true,
        remoteEnabled: true,
        fallbackEvidence: match?.detailContext?.teamNews
          ? { teamNews: match.detailContext.teamNews }
          : {},
        context: buildFetchContext(match)
      });
    } catch (err) {
      fetchError = err;
    }

    for (const teamEntry of teamsNeedingAttempt) {
      const team = normalizeText(teamEntry?.team);
      const existingAfter = readTeamNewsRecord(team);

      if (hasEvidence(existingAfter)) {
        acquired.push({
          team,
          viaMatchId: matchId || null,
          viaFixture: `${normalizeText(match?.homeTeam)} vs ${normalizeText(match?.awayTeam)}`,
          remoteStatus: fetchResult?.remoteStatus || null,
          sources: Array.isArray(fetchResult?.sources) ? fetchResult.sources : [],
          record: {
            updatedAt: existingAfter?.updatedAt || null,
            source: existingAfter?.source || null,
            absencesCount: Array.isArray(existingAfter?.absences) ? existingAfter.absences.length : 0,
            notesCount: Array.isArray(existingAfter?.notes) ? existingAfter.notes.length : 0,
            evidenceCount: Array.isArray(existingAfter?.evidence) ? existingAfter.evidence.length : 0
          }
        });
      } else {
        failed.push({
          team,
          matchId: matchId || null,
          reason:
            fetchError?.message ||
            fetchResult?.skippedReason ||
            fetchResult?.remoteStatus ||
            "no_canonical_team_news_written",
          remoteStatus: fetchResult?.remoteStatus || null,
          sources: Array.isArray(fetchResult?.sources) ? fetchResult.sources : [],
          fetchError: fetchError?.message || null
        });
      }
    }
  }
  const refreshedWorkset = await buildTeamNewsWorksetDay(safeDayKey);
  const refreshedReport = await buildTeamNewsDay(safeDayKey);

  const result = {
    ok: true,
    dayKey: safeDayKey,
    startedFrom: {
      worksetPath,
      initialMissingCount: Array.isArray(workset?.missing) ? workset.missing.length : 0,
      initialExistingCount: Number(workset?.existingCount || 0),
      fixturesCount: fixtures.length,
      detailsMatchesCount: detailMatches.length
    },
    attemptedCount: attempted.length,
    attemptedMatchCount: attemptedMatches.length,
    acquiredCount: acquired.length,
    failedCount: failed.length,
    skippedCount: skipped.length,
    attempted,
    attemptedMatches,
    acquired,
    failed,
    skipped,
    refreshedWorkset: {
      teamsCount: refreshedWorkset?.teamsCount ?? 0,
      existingCount: refreshedWorkset?.existingCount ?? 0,
      missingCount: refreshedWorkset?.missingCount ?? 0
    },
    refreshedReport: {
      totalTeams: refreshedReport?.totalTeams ?? 0,
      existingCount: refreshedReport?.existingCount ?? 0,
      missingCount: refreshedReport?.missingCount ?? 0,
      coveragePct: refreshedReport?.coveragePct ?? 0
    },
    updatedAt: new Date().toISOString()
  };

  const outPath = resolveAcquisitionReportPath(safeDayKey);
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

  console.log("[acquire-team-news-workset-day] cli:start", {
    dayKey,
    maxTeams: Number.isFinite(maxTeams) ? maxTeams : "all"
  });

  acquireTeamNewsWorksetDay(dayKey, {
    maxTeams,
    rebuildWorksetFirst: false
  })
    .then(result => {
      console.log("[acquire-team-news-workset-day] cli:done", {
        ok: result?.ok,
        dayKey: result?.dayKey,
        attemptedCount: result?.attemptedCount ?? 0,
        acquiredCount: result?.acquiredCount ?? 0,
        failedCount: result?.failedCount ?? 0,
        skippedCount: result?.skippedCount ?? 0,
        remainingMissingCount: result?.refreshedWorkset?.missingCount ?? 0,
        file: result?.file || null
      });
    })
    .catch(err => {
      console.error("[acquire-team-news-workset-day] cli:fatal", err);
      process.exit(1);
    });
}