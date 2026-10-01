import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDataPath } from "../storage/data-root.js";
import { canonicalFixturesForDay } from "../core/day-fixture-universe.js";
import { getDeployedOddsDay } from "../storage/odds-memory-db.js";
import { joinCanonicalFixturesWithModelAssessments } from "../core/plan-b-canonical-membership.js";
import { readTrustedStandingsState } from "../storage/trusted-standings-db.js";
import { getLeagueMeta } from "../source-discovery/league-awareness-service.js";
import { currentSeasonLabel } from "../source-discovery/season-calendar.js";
import { updateValueDataAlarm, dueValueDataResearch, recordValueDataResearch } from "../core/value-data-alarm.js";
import { createPrematchVerifiedEvidence } from "../core/prematch-verified-form.js";

function load(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function save(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const bytes = JSON.stringify(data, null, 2) + "\n";
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === bytes) return;
  const temporary = `${file}.tmp`; fs.writeFileSync(temporary, bytes); fs.renameSync(temporary, file);
}

export async function runValueDataAlarmDay(dayKey, { write = false, research = false, applyVerifiedContracts = false, nowMs = Date.now(), lookAheadDays = 7, maxResearchLeagues = 2, dependencies = {} } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey) || lookAheadDays < 0 || lookAheadDays > 14) throw new Error("invalid_alarm_window");
  if (research && !write) throw new Error("research_requires_persisted_alarm");
  const root = dependencies.queueRoot || resolveDataPath("value-data-acquisition");
  const queueFile = path.join(root, "queue.json");
  let queue = fs.existsSync(queueFile) ? load(queueFile) : null;
  queue = updateValueDataAlarm(queue, { dayKey, fixtures: [], joinedIds: [], nowMs });
  const days = [], oddsWrittenDays = [], diagnoses = {}, acquisitionErrors = [];
  let verifiedEvidence, historicalFormPreparation;
  let competitionContractPreparation = null;
  if (write && applyVerifiedContracts) {
    save(queueFile, queue);
    try {
      const { prepareVerifiedCompetitionContracts } = await import("./prepare-verified-competition-contracts.js");
      competitionContractPreparation = await prepareVerifiedCompetitionContracts(dayKey, nowMs);
    } catch (error) { acquisitionErrors.push({ day: dayKey, stage: "official_contract_preparation", error: error.message }); }
  }
  for (let offset = 0; offset <= lookAheadDays; offset++) {
    const day = new Date(Date.parse(`${dayKey}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
    const fixtures = (dependencies.fixtures || canonicalFixturesForDay)(day);
    if (!fixtures.length) { days.push({ day, fixtures: 0, status: "FIXTURE_DISCOVERY_PENDING" }); continue; }
    for (const row of fixtures) {
      const slug = row.leagueSlug;
      const researchSeason = currentSeasonLabel(slug, getLeagueMeta(slug), new Date(row.kickoffUtc || `${day}T12:00Z`));
      if (!diagnoses[slug] || diagnoses[slug].researchSeason !== researchSeason) {
        const state = (dependencies.standings || readTrustedStandingsState)(slug);
        diagnoses[slug] = { reasonCodes: state.validation?.issues || state.artifact?.foundation?.reasonCodes || [],
          trustedStandingsUsable: state.ok === true,
          researchSeason };
      }
    }
    const persistedOdds = resolveDataPath("deploy-snapshots", day, "odds.json");
    const assessmentRows = dependencies.assessments ? dependencies.assessments(day) : fs.existsSync(persistedOdds) ? getDeployedOddsDay(day).matches : [];
    const join = joinCanonicalFixturesWithModelAssessments(fixtures, assessmentRows || []);
    queue = updateValueDataAlarm(queue, { dayKey: day, fixtures, joinedIds: join.joinedMatches.map(row => row.canonicalId), nowMs, diagnoses });
    if (write) save(queueFile, queue); // Durable alarm is checkpointed before attempting acquisition.
    let supplement = null;
    const upcoming = join.canonicalRowsWithoutAssessment.filter(row => Date.parse(row.kickoffUtc) > nowMs);
    if (write && upcoming.length) {
      try {
      if (!historicalFormPreparation && !dependencies.supplement) {
        const { preparePrematchHistoryForm } = await import("./prepare-prematch-history-form.js");
        historicalFormPreparation = await preparePrematchHistoryForm(nowMs);
      }
      verifiedEvidence ||= createPrematchVerifiedEvidence(nowMs);
      const produce = dependencies.supplement || (await import("./canonical-assessment-supplement.js")).supplementCanonicalAssessments;
      supplement = produce(day, { canonicalFixtures: upcoming, nowMs,
        formFn: dependencies.formFn || verifiedEvidence.formFn,
        crossFormFn: dependencies.crossFormFn || verifiedEvidence.crossFormFn });
      if (supplement.assessmentRowsWritten > 0) {
        const exportOdds = dependencies.exportOdds || (await import("./export-odds-snapshot-day.js")).exportOddsSnapshotDay;
        const exported = await exportOdds(day);
        if (exported?.ok !== true) throw new Error("alarm_odds_export_failed");
        if (exported.changed) oddsWrittenDays.push(day);
        // Resolve only from the persisted public input, not ephemeral memory.
        const persisted = dependencies.persistedOdds ? dependencies.persistedOdds(day) : load(resolveDataPath("deploy-snapshots", day, "odds.json"));
        const verified = joinCanonicalFixturesWithModelAssessments(fixtures, persisted.matches || []);
        queue = updateValueDataAlarm(queue, { dayKey: day, fixtures, joinedIds: verified.joinedMatches.map(row => row.canonicalId), nowMs, diagnoses });
        save(queueFile, queue);
      }
      } catch (error) {
        acquisitionErrors.push({ day, error: error.message });
        supplement = { status: "ASSESSMENT_PRODUCTION_FAILED", error: error.message };
        for (const row of upcoming) {
          const incident = queue.incidents[row.canonicalId];
          if (incident && incident.status !== "RESOLVED") incident.lastProductionError = { at: new Date(nowMs).toISOString(), error: error.message };
        }
        save(queueFile, queue);
      }
    }
    if (write && supplement?.unavailableEvidence) {
      for (const evidence of supplement.unavailableEvidence) {
        const incident = queue.incidents[evidence.canonicalId];
        if (incident && incident.status !== "RESOLVED") {
          incident.modelInputDiagnosis = { ...evidence, checkedAt: new Date(nowMs).toISOString() };
        }
      }
      save(queueFile, queue);
    }
    days.push({ day, fixtures: fixtures.length, joined: join.summary.joinedMatches, supplement });
  }
  queue ||= { schema: "ai-matchlab.value-data-alarm.v1", incidents: {}, research: {} };
  const researchTasks = dueValueDataResearch(queue, nowMs, maxResearchLeagues);
  if (research && researchTasks.length) {
    const primarySearch = dependencies.primarySearch || (await import("./refresh-standings-from-flashscore.js")).refreshStandingsFromFlashscore;
    let primary;
    try {
      primary = await primarySearch({ leagues: [...new Set(researchTasks.map(task => task.incidents[0].leagueSlug))], offsets: [-1, 0, 1, 2, 3] });
    } catch (error) { primary = { ok: false, error: error.message }; }
    if (!dependencies.primarySearch) {
      const { readStandingsEvidence } = await import("../storage/standings-memory-db.js");
      for (const refreshed of primary.refreshed || []) {
        save(path.join(root, dayKey, `${refreshed.slug}.primary.research.json`), {
          source: "flashscore", acquiredAt: new Date(nowMs).toISOString(),
          evidence: readStandingsEvidence(refreshed.slug), authorityPromotionAllowed: false });
      }
    }
    const search = dependencies.search || (await import("../source-discovery/standings-researcher.js")).researchStandings;
    for (const task of researchTasks) {
      const incident = task.incidents[0], meta = getLeagueMeta(incident.leagueSlug);
      let result;
      try {
        const evidence = await search(incident.leagueSlug, meta.name, meta.country, {
          season: incident.diagnosis.researchSeason, allowSearch: true, timeoutMs: 8000 });
        result = { status: evidence.status, primarySource: primary, source: evidence.source, url: evidence.url,
          rows: evidence.rowCount, trail: evidence.trail, confidence: evidence.confidence,
          authorityPromotionAllowed: false, valueInputVerified: false };
        save(path.join(root, dayKey, `${incident.leagueSlug}.research.json`), evidence);
      } catch (error) { result = { status: "SOURCE_SEARCH_FAILED", primarySource: primary, error: error.message }; }
      recordValueDataResearch(queue, task, result, nowMs);
      save(queueFile, queue);
    }
  }
  const open = Object.values(queue.incidents).filter(row => row.status !== "RESOLVED");
  const report = { schema: "ai-matchlab.value-data-alarm-day.v1", dayKey, lookAheadDays, write, research,
    openIncidents: open.length, historicalOpen: open.filter(row => row.status === "HISTORICAL_GAP_OPEN").length,
    futureOpen: open.filter(row => Date.parse(row.kickoffUtc) > nowMs).length,
    urgentWithin24Hours: open.filter(row => Date.parse(row.kickoffUtc) > nowMs && Date.parse(row.kickoffUtc) - nowMs <= 86400000).length,
    researchTasks: researchTasks.map(task => ({ key: task.key, fixtures: task.incidents.length })),
    fixtureDiscoveryPendingDays: days.filter(row => row.status === "FIXTURE_DISCOVERY_PENDING").map(row => row.day),
    readinessComplete: open.length === 0 && days.every(row => row.status !== "FIXTURE_DISCOVERY_PENDING"),
    days, oddsWrittenDays, acquisitionErrors, competitionContractPreparation, historicalFormPreparation: historicalFormPreparation || null, frozenPredictionsRegenerated: false,
    resolvedOnlyByVerifiedAssessmentJoin: true, incidentsExpireAutomatically: false };
  if (write) { save(queueFile, queue); save(path.join(root, `${dayKey}.json`), report); }
  return { report, queue };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { report } = await runValueDataAlarmDay(process.argv[2], { write: process.argv.includes("--write"), research: process.argv.includes("--research"), applyVerifiedContracts: process.argv.includes("--apply-verified-contracts") });
  console.log(JSON.stringify(report, null, 2));
}
