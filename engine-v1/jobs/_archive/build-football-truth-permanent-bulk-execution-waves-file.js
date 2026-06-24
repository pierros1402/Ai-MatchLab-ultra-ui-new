import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const DATA_ROOT = path.join(ROOT, "data", "football-truth");
const DIAG_ROOT = path.join(DATA_ROOT, "_diagnostics");
const OUT_DIR = path.join(DIAG_ROOT, `permanent-bulk-execution-waves-${DATE}`);

const STANDINGS_WAVE_SIZE = 120;
const START_DATE_WAVE_SIZE = 160;
const HIGH_VALUE_WAVE_SIZE = 80;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function rel(filePath) {
  return path.relative(ROOT, filePath).replaceAll("\\", "/");
}

function walk(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function parseJsonlSafe(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function latestFile(pattern) {
  const files = walk(DIAG_ROOT).filter((file) => pattern.test(file));
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || null;
}

function stableSortTasks(tasks) {
  return [...tasks].sort((a, b) =>
    Number(b.highValuePrefix || false) - Number(a.highValuePrefix || false) ||
    Number(b.uefaLikePrefix || false) - Number(a.uefaLikePrefix || false) ||
    Number(b.score || 0) - Number(a.score || 0) ||
    Number(a.priority || 999) - Number(b.priority || 999) ||
    String(a.competitionSlug || "").localeCompare(String(b.competitionSlug || "")) ||
    String(a.taskType || "").localeCompare(String(b.taskType || ""))
  );
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function sourceHostKey(task) {
  return task.sourceHostHint || task.sourceHost || "unknown_source_host";
}

function familyKey(task) {
  if (task.sourceHostHint) return task.sourceHostHint;
  if (task.sourceHost) return task.sourceHost;
  const slug = String(task.competitionSlug || "");
  const prefix = slug.split(".")[0] || "unknown";
  return `country_prefix:${prefix}`;
}

function enrichTask(task, index, lane) {
  const targetSeasonLabel =
    task.targetSeasonLabel && task.targetSeasonLabel !== "next"
      ? task.targetSeasonLabel
      : lane === "start_date"
        ? "next_season_dynamic"
        : task.targetSeasonLabel || null;

  return {
    ...task,
    bulkExecutionLane: lane,
    bulkExecutionIndex: index,
    sourceHostBucket: sourceHostKey(task),
    sourceFamilyBucket: familyKey(task),
    targetSeasonLabel,
    permanentLifecyclePolicy: {
      contractVersion: 1,
      notOneOff2026_2027: true,
      appliesEverySeason: true,
      rolloverBehavior:
        lane === "start_date"
          ? "after_next_season_start_date_is_accepted_store_evidence_for_that_season_then_create_next_year_start_date_task"
          : "after_season_completes_refresh_previous_completed_standings_for_newly_completed_season",
      requiresExplicitSeasonScope: true,
      rejectsAllZeroPreviousCompletedStandings: true
    }
  };
}

function makeWaves(tasks, lane, waveSize, wavePrefix) {
  const sorted = stableSortTasks(tasks).map((task, index) => enrichTask(task, index, lane));
  return chunk(sorted, waveSize).map((waveTasks, waveIndex) => {
    const hostCounts = {};
    const prefixCounts = {};
    for (const task of waveTasks) {
      hostCounts[task.sourceHostBucket] = (hostCounts[task.sourceHostBucket] || 0) + 1;
      const prefix = String(task.competitionSlug || "").split(".")[0] || "unknown";
      prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;
    }
    return {
      waveId: `${wavePrefix}_${String(waveIndex + 1).padStart(3, "0")}`,
      waveIndex: waveIndex + 1,
      lane,
      taskCount: waveTasks.length,
      highValueCount: waveTasks.filter((task) => task.highValuePrefix).length,
      uefaLikeCount: waveTasks.filter((task) => task.uefaLikePrefix).length,
      sourceHostBucketCount: Object.keys(hostCounts).length,
      topSourceHostBuckets: Object.entries(hostCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 20).map(([host, count]) => ({ host, count })),
      topCountryPrefixes: Object.entries(prefixCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 20).map(([prefix, count]) => ({ prefix, count })),
      recommendedExecutionGuardrails: {
        searchAllowedOnlyWithExplicitAllowSearchFlag: true,
        fetchAllowedOnlyWithExplicitAllowFetchFlag: true,
        browserRenderAllowedOnlyWithExplicitAllowBrowserRenderFlag: true,
        canonicalWritesForbiddenInWaveRunner: true,
        productionWritesForbiddenInWaveRunner: true,
        rawPayloadCommitsForbidden: true
      },
      tasks: waveTasks
    };
  });
}

function countBy(items, getter) {
  const counts = {};
  for (const item of items) {
    const key = getter(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([key, count]) => ({ key, count }));
}

ensureDir(OUT_DIR);

const acceptedTasksPath = latestFile(/accepted-prioritized-lifecycle-tasks-\d{4}-\d{2}-\d{2}\.jsonl$/);
const rejectedTasksPath = latestFile(/rejected-prioritized-lifecycle-tasks-\d{4}-\d{2}-\d{2}\.jsonl$/);
const lifecycleRowsPath = latestFile(/permanent-season-lifecycle-rows-\d{4}-\d{2}-\d{2}\.jsonl$/);
const dueTasksPath = latestFile(/permanent-season-lifecycle-due-tasks-\d{4}-\d{2}-\d{2}\.jsonl$/);
const seasonLedgerPath = latestFile(/season-lane-coverage-ledger-\d{4}-\d{2}-\d{2}\.json$/);

if (!acceptedTasksPath) throw new Error("Missing accepted prioritized lifecycle tasks jsonl");
if (!lifecycleRowsPath) throw new Error("Missing permanent lifecycle rows jsonl");
if (!dueTasksPath) throw new Error("Missing permanent lifecycle due tasks jsonl");

const acceptedTasks = parseJsonlSafe(acceptedTasksPath);
const rejectedTasks = parseJsonlSafe(rejectedTasksPath);
const lifecycleRows = parseJsonlSafe(lifecycleRowsPath);
const dueTasks = parseJsonlSafe(dueTasksPath);
const seasonLedger = seasonLedgerPath ? readJsonSafe(seasonLedgerPath) : null;

const standingsTasks = acceptedTasks.filter((task) =>
  task.taskType === "acquire_previous_completed_standings" ||
  task.executionLane === "official_rendered_or_provider_standings_expansion"
);

const startDateTasks = acceptedTasks.filter((task) =>
  task.taskType === "acquire_next_season_start_date" ||
  task.executionLane === "official_start_date_evidence_discovery"
);

const highValueStandingsTasks = standingsTasks.filter((task) => task.highValuePrefix || task.uefaLikePrefix);
const highValueStartDateTasks = startDateTasks.filter((task) => task.highValuePrefix || task.uefaLikePrefix);

const standingsWaves = makeWaves(standingsTasks, "previous_completed_standings_expansion", STANDINGS_WAVE_SIZE, "standings_bulk_wave");
const startDateWaves = makeWaves(startDateTasks, "next_season_start_date_evidence", START_DATE_WAVE_SIZE, "start_date_bulk_wave");
const highValueCombinedWaves = makeWaves(
  [...highValueStandingsTasks, ...highValueStartDateTasks],
  "high_value_combined_lifecycle",
  HIGH_VALUE_WAVE_SIZE,
  "high_value_lifecycle_wave"
);

const permanentSeasonRolloverPolicy = {
  contractVersion: 1,
  status: "active_planning_contract",
  scope: "all_authoritative_league_competitions",
  notOneOff2026_2027: true,
  repeatsEverySeason: true,
  requiredLanes: [
    {
      lane: "previous_completed_standings",
      rule: "after a season completes, acquire final standings for the just-completed season with explicit seasonScope=previous_completed and seasonLabel",
      acceptanceGates: ["expectedRowCount", "expectedTeamSignals", "played_won_drawn_lost_points_arithmetic", "non_zero_non_trivial_previous_completed_stats"]
    },
    {
      lane: "current_or_new_season_standings",
      rule: "when a new/current season table is active or not started, keep it separate from previous_completed and reject it for historical previous_completed use if all-zero",
      acceptanceGates: ["explicit_seasonScope_current_active_or_new_not_started", "currentness_gate", "no_backfill_into_previous_completed"]
    },
    {
      lane: "next_season_start_date",
      rule: "for every league and every future season, discover and store governed official/provider evidence for the next season start date; after acceptance, automatically roll the lifecycle target to the following season",
      acceptanceGates: ["official_or_known_source_host", "date_directly_governed_by_start_phrase", "reject_article_page_dates", "seasonLabel_bound_to_evidence"]
    }
  ],
  waveExecutionPolicy: {
    standingsWaveSize: STANDINGS_WAVE_SIZE,
    startDateWaveSize: START_DATE_WAVE_SIZE,
    highValueWaveSize: HIGH_VALUE_WAVE_SIZE,
    oneOrTwoLeagueModeForbidden: true,
    preferredMinimumWaveSize: 80,
    productionWritesForbidden: true,
    canonicalWritesRequireExplicitApprovalGate: true,
    rawPayloadCommitsForbidden: true
  }
};

const summary = {
  status: "passed",
  runner: "permanent_bulk_execution_waves",
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  lifecycleExecutionWaveWriteExecutedNowCount: 1,
  acceptedTasksPath: rel(acceptedTasksPath),
  rejectedTasksPath: rejectedTasksPath ? rel(rejectedTasksPath) : null,
  lifecycleRowsPath: rel(lifecycleRowsPath),
  dueTasksPath: rel(dueTasksPath),
  seasonLedgerPath: seasonLedgerPath ? rel(seasonLedgerPath) : null,
  acceptedTaskCount: acceptedTasks.length,
  rejectedTaskCount: rejectedTasks.length,
  lifecycleRowCount: lifecycleRows.length,
  dueTaskCount: dueTasks.length,
  standingsTaskCount: standingsTasks.length,
  startDateTaskCount: startDateTasks.length,
  highValueStandingsTaskCount: highValueStandingsTasks.length,
  highValueStartDateTaskCount: highValueStartDateTasks.length,
  standingsWaveCount: standingsWaves.length,
  startDateWaveCount: startDateWaves.length,
  highValueCombinedWaveCount: highValueCombinedWaves.length,
  standingsWaveSize: STANDINGS_WAVE_SIZE,
  startDateWaveSize: START_DATE_WAVE_SIZE,
  highValueWaveSize: HIGH_VALUE_WAVE_SIZE,
  seasonLedgerPreviousCompletedSatisfiedCount: seasonLedger?.summary?.previousCompletedSatisfiedCount ?? null,
  seasonLedgerPreviousCompletedVerifiedRowsCount: seasonLedger?.summary?.previousCompletedVerifiedRowsCount ?? null,
  seasonLedgerNextSeasonStartDateSatisfiedCount: seasonLedger?.summary?.nextSeasonStartDateSatisfiedCount ?? null,
  permanentPolicyNotOneOff2026_2027: true,
  permanentPolicyRepeatsEverySeason: true,
  recommendedNextLane: "build_or_run_bulk_wave_executor_for_first_high_value_wave_not_single_league_probe"
};

const outputs = {
  summary,
  permanentSeasonRolloverPolicy,
  taskDistributions: {
    standingsBySourceHost: countBy(standingsTasks, sourceHostKey).slice(0, 80),
    startDateBySourceHost: countBy(startDateTasks, sourceHostKey).slice(0, 80),
    standingsByCountryPrefix: countBy(standingsTasks, (task) => String(task.competitionSlug || "").split(".")[0] || "unknown").slice(0, 80),
    startDateByCountryPrefix: countBy(startDateTasks, (task) => String(task.competitionSlug || "").split(".")[0] || "unknown").slice(0, 80)
  },
  waves: {
    standingsWaves,
    startDateWaves,
    highValueCombinedWaves
  }
};

const outPath = path.join(OUT_DIR, `permanent-bulk-execution-waves-${DATE}.json`);
const standingsWavesPath = path.join(OUT_DIR, `standings-bulk-execution-waves-${DATE}.jsonl`);
const startDateWavesPath = path.join(OUT_DIR, `start-date-bulk-execution-waves-${DATE}.jsonl`);
const highValueWavesPath = path.join(OUT_DIR, `high-value-bulk-execution-waves-${DATE}.jsonl`);
const policyPath = path.join(OUT_DIR, `permanent-season-rollover-policy-${DATE}.json`);

fs.writeFileSync(outPath, JSON.stringify(outputs, null, 2) + "\n", "utf8");
fs.writeFileSync(standingsWavesPath, standingsWaves.map((wave) => JSON.stringify(wave)).join("\n") + (standingsWaves.length ? "\n" : ""), "utf8");
fs.writeFileSync(startDateWavesPath, startDateWaves.map((wave) => JSON.stringify(wave)).join("\n") + (startDateWaves.length ? "\n" : ""), "utf8");
fs.writeFileSync(highValueWavesPath, highValueCombinedWaves.map((wave) => JSON.stringify(wave)).join("\n") + (highValueCombinedWaves.length ? "\n" : ""), "utf8");
fs.writeFileSync(policyPath, JSON.stringify(permanentSeasonRolloverPolicy, null, 2) + "\n", "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  standingsWavesOutput: rel(standingsWavesPath),
  startDateWavesOutput: rel(startDateWavesPath),
  highValueWavesOutput: rel(highValueWavesPath),
  permanentSeasonRolloverPolicyOutput: rel(policyPath),
  summary
}, null, 2));
