import fs from "fs";
import { fileURLToPath } from "url";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";

const LEAGUE_PRIORITY = new Map([
  ["eng.1", 100],
  ["esp.1", 98],
  ["ger.1", 96],
  ["ita.1", 96],
  ["fra.1", 94],
  ["eng.2", 92],
  ["esp.2", 90],
  ["ger.2", 88],
  ["ita.2", 88],
  ["fra.2", 86],
  ["eng.3", 84],
  ["eng.4", 82],
  ["tur.1", 80],
  ["bel.1", 78],
  ["ned.1", 78],
  ["por.1", 78],
  ["gre.1", 76],
  ["cyp.1", 74],
  ["arg.1", 72],
  ["bra.1", 72],
  ["usa.1", 70]
]);

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function priorityScore(row) {
  const league = String(row?.league || "").toLowerCase();
  const leagueScore = LEAGUE_PRIORITY.get(league) || 50;
  const seenScore = Math.min(50, Number(row?.seenCount || 0) * 10);
  const recencyScore = row?.latestDayKey ? 10 : 0;

  return leagueScore + seenScore + recencyScore;
}

function taskFromBacklogRow(row) {
  const league = String(row?.league || "unknown").toLowerCase();
  const team = String(row?.team || "").trim();
  const teamSlug = slug(team);
  const score = priorityScore(row);

  return {
    id: [league, teamSlug].filter(Boolean).join("::"),
    type: "official_team_news_source_enrichment",
    status: "todo",
    priorityScore: score,
    league,
    team,
    classification: "missing_official_source_coverage",
    seenCount: Number(row?.seenCount || 0),
    firstSeenDayKey: row?.firstSeenDayKey || null,
    latestDayKey: row?.latestDayKey || null,
    opponents: unique(Array.isArray(row?.opponents) ? row.opponents : []),
    currentGenericDomains: unique(Array.isArray(row?.domains) ? row.domains : []),
    requiredSourceTypes: [
      "official_club_news",
      "team_official",
      "club_news"
    ],
    acceptanceCriteria: {
      mustBeOfficialClubOrTeamDomain: true,
      mustExposeTeamNewsOrArticleList: true,
      mustNotBeGenericReferenceOnly: true,
      mustNotBeSearchEngineResult: true
    },
    suggestedSearchQueries: [
      [team, "official website news"].filter(Boolean).join(" "),
      [team, "team news official"].filter(Boolean).join(" "),
      [team, "club news official"].filter(Boolean).join(" ")
    ]
  };
}

export function buildTeamNewsSourceEnrichmentTasksDay(dayKey, options = {}) {
  const backlogFile = resolveDataPath("team-news", "_source-coverage-backlog.json");
  const outDir = resolveDataPath("team-news", "_source-enrichment-tasks");
  const outFile = resolveDataPath("team-news", "_source-enrichment-tasks", `${dayKey}.json`);

  ensureDir(outDir);

  if (!fs.existsSync(backlogFile)) {
    const empty = {
      ok: true,
      dayKey,
      generatedAt: new Date().toISOString(),
      reason: "source_coverage_backlog_missing",
      backlogFile,
      totalTasks: 0,
      tasks: []
    };

    fs.writeFileSync(outFile, JSON.stringify(empty, null, 2) + "\n", "utf8");

    return {
      ok: true,
      dayKey,
      file: outFile,
      totalTasks: 0,
      reason: empty.reason
    };
  }

  const backlog = JSON.parse(fs.readFileSync(backlogFile, "utf8"));
  const rows = Array.isArray(backlog.rows) ? backlog.rows : [];

  const limit = Math.max(1, Number(options.limit || process.env.TEAM_NEWS_SOURCE_ENRICHMENT_LIMIT || 80));

  const tasks = rows
    .filter(row => row?.classification === "missing_official_source_coverage")
    .filter(row => String(row?.team || "").trim())
    .map(taskFromBacklogRow)
    .sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) {
        return b.priorityScore - a.priorityScore;
      }

      if (b.seenCount !== a.seenCount) {
        return b.seenCount - a.seenCount;
      }

      return String(a.team || "").localeCompare(String(b.team || ""));
    })
    .slice(0, limit);

  const doc = {
    ok: true,
    dayKey,
    generatedAt: new Date().toISOString(),
    backlogFile,
    totalBacklogRows: rows.length,
    totalTasks: tasks.length,
    limit,
    tasks
  };

  fs.writeFileSync(outFile, JSON.stringify(doc, null, 2) + "\n", "utf8");

  return {
    ok: true,
    dayKey,
    file: outFile,
    totalBacklogRows: rows.length,
    totalTasks: tasks.length,
    limit
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isCli) {
  const dayKey = process.argv[2];
  const limitArg = process.argv.find(arg => String(arg || "").startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;

  if (!dayKey) {
    console.error("[build-team-news-source-enrichment-tasks-day] missing dayKey");
    process.exit(1);
  }

  try {
    const result = buildTeamNewsSourceEnrichmentTasksDay(dayKey, { limit });
    console.log(JSON.stringify(result, null, 2));

    if (!result.ok) {
      process.exit(1);
    }
  } catch (err) {
    console.error("[build-team-news-source-enrichment-tasks-day] fatal", err);
    process.exit(1);
  }
}
