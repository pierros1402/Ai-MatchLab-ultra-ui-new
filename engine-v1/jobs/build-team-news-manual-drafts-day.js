import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function repairMojibakeText(value) {
  const chars = Array.from(String(value || "").trim());
  if (!chars.length) return "";

  const c3Map = new Map([
    [0x00a1, "á"],
    [0x00a9, "é"],
    [0x00ad, "í"],
    [0x00b3, "ó"],
    [0x00ba, "ú"],
    [0x00b1, "ñ"],
    [0x00b6, "ö"],
    [0x00bc, "ü"],
    [0x00a8, "è"],
    [0x00a0, "à"],
    [0x00a7, "ç"],
    [0x0081, "Á"],
    [0x0089, "É"],
    [0x008d, "Í"],
    [0x0093, "Ó"],
    [0x009a, "Ú"],
    [0x0091, "Ñ"]
  ]);

  const gammaMap = new Map([
    [0x0385, "á"],
    [0x00a9, "é"],
    [0x00ad, "í"],
    [0x00b3, "ó"],
    [0x00ba, "ú"],
    [0x00b1, "ñ"],
    [0x00b6, "ö"],
    [0x00bc, "ü"],
    [0x00a8, "è"],
    [0x20ac, "à"],
    [0x00a7, "ç"],
    [0x0020, "à"]
  ]);

  let out = "";

  for (let i = 0; i < chars.length; i++) {
    const current = chars[i];
    const currentCode = current.codePointAt(0);

    if ((currentCode === 0x00c3 || currentCode === 0x0393) && i + 1 < chars.length) {
      const next = chars[i + 1];
      const nextCode = next.codePointAt(0);
      const replacement = currentCode === 0x00c3
        ? c3Map.get(nextCode)
        : gammaMap.get(nextCode);

      if (replacement) {
        out += replacement;
        i++;
        continue;
      }
    }

    out += current;
  }

  return out;
}

function repairDisplayTeamName(value) {
  return repairMojibakeText(value);
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
  return repairMojibakeText(text);
}

function normalizeCanonicalKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function safeFilePart(value) {
  return normalizeCanonicalKey(value).replace(/_+/g, "_") || "unknown";
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  const safeData = sanitizeDeepStrings(data);
  const jsonText = JSON.stringify(safeData, null, 2) + "\n";
  fs.writeFileSync(filePath, sanitizeSerializedJsonText(jsonText), "utf8");
}

function resolveResearchTasksPath(dayKey) {
  return resolveDataPath("team-news", "_research-tasks", `${dayKey}.json`);
}

function resolveManualDraftsDir(dayKey) {
  return path.join(
    process.cwd(),
    "engine-v1",
    "seeds",
    "team-news",
    "manual-results",
    dayKey
  );
}

function buildQueryChecklist(task) {
  const hints = Array.isArray(task?.researchPlan?.queryHints)
    ? task.researchPlan.queryHints
    : [];

  return hints.slice(0, 12).map(query => ({
    query,
    checked: false,
    result: "",
    useful: false
  }));
}

function buildDraftFromTask(task) {
  const target = task?.target || {};
  const match = task?.match || {};
  const team = repairDisplayTeamName(target?.team);
  const opponent = repairDisplayTeamName(target?.opponent);
  const side = normalizeText(target?.side);
  const key = normalizeText(target?.canonicalTarget?.key) || normalizeCanonicalKey(team);

  if (!team || !key) {
    throw new Error(`invalid team-news task target: ${JSON.stringify({ taskId: task?.taskId, target })}`);
  }

  return {
    schemaVersion: 1,
    sourceInputType: "manual_result",
    source: "team_news_manual_draft",
    status: "manual_review_required",

    reviewed: false,
    productionGrade: false,

    dayKey: normalizeText(task?.dayKey),
    taskId: normalizeText(task?.taskId),
    taskType: normalizeText(task?.taskType) || "team_news",

    team,
    key,
    side,
    opponent: opponent || null,
    leagueSlug: normalizeText(match?.leagueSlug),
    matchIds: [normalizeText(match?.matchId)].filter(Boolean),

    match: {
      matchId: normalizeText(match?.matchId),
      leagueSlug: normalizeText(match?.leagueSlug),
      kickoffUtc: normalizeText(match?.kickoffUtc),
      homeTeam: repairDisplayTeamName(match?.homeTeam),
      awayTeam: repairDisplayTeamName(match?.awayTeam)
    },

    canonicalTarget: sanitizeDeepStrings(target?.canonicalTarget || {
      entity: "team_news",
      key,
      team
    }),

    absences: [],
    suspensions: [],
    injuries: [],
    doubts: [],
    notes: [],
    evidence: [],

    manualReview: {
      instructions: [
        "Fill only confirmed, named team-news facts.",
        "Do not approve generic previews without named player signal.",
        "Set reviewed=true and productionGrade=true only after checking evidence.",
        "Keep evidence.url/source/publishedAt when available."
      ],
      requiredBeforeApproval: [
        "At least one credible evidence item OR explicit reviewed no-confirmed-absences note.",
        "No cross-team contamination.",
        "Team, side, opponent, leagueSlug and matchIds must remain aligned with the task."
      ],
      queryChecklist: buildQueryChecklist(task)
    },

    meta: {
      generator: "build-team-news-manual-drafts-day",
      generatedAt: new Date().toISOString(),
      safeForCanonicalApply: false,
      reason: "manual_review_required"
    }
  };
}

export function buildTeamNewsManualDraftsDay(dayKey, { includeAlreadyResolved = false } = {}) {
  const safeDayKey = normalizeText(dayKey);

  if (!safeDayKey) {
    throw new Error("missing dayKey");
  }

  const tasksPath = resolveResearchTasksPath(safeDayKey);

  if (!fs.existsSync(tasksPath)) {
    throw new Error(`team-news research tasks file not found: ${tasksPath}`);
  }

  const tasksDoc = readJson(tasksPath);
  const tasks = Array.isArray(tasksDoc?.tasks) ? tasksDoc.tasks : [];

  const selectedTasks = tasks.filter(task => {
    if (!task || task?.taskType !== "team_news") return false;
    if (includeAlreadyResolved) return true;
    return task?.status === "pending_research";
  });

  const outDir = resolveManualDraftsDir(safeDayKey);
  ensureDir(outDir);

  const written = [];

  for (const task of selectedTasks) {
    const draft = buildDraftFromTask(task);
    const teamPart = safeFilePart(draft.key || draft.team);
    const sidePart = safeFilePart(draft.side || "side");
    const matchPart = safeFilePart(draft.match?.matchId || "match");
    const filePath = path.join(outDir, `${matchPart}__${sidePart}__${teamPart}.draft.json`);

    writeJson(filePath, draft);

    written.push({
      file: filePath,
      taskId: draft.taskId,
      team: draft.team,
      side: draft.side,
      matchId: draft.match?.matchId || null,
      status: draft.status,
      reviewed: draft.reviewed,
      productionGrade: draft.productionGrade
    });
  }

  return {
    ok: true,
    dayKey: safeDayKey,
    tasksPath,
    outDir,
    totalTasks: tasks.length,
    selectedTasks: selectedTasks.length,
    includeAlreadyResolved,
    writtenCount: written.length,
    written
  };
}

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const dayKey = process.argv[2];
  const includeAlreadyResolved = process.argv.includes("--include-already-resolved");

  console.log("[build-team-news-manual-drafts-day] cli:start", {
    dayKey,
    includeAlreadyResolved
  });

  try {
    const result = buildTeamNewsManualDraftsDay(dayKey, { includeAlreadyResolved });

    console.log("[build-team-news-manual-drafts-day] cli:done", {
      ok: result.ok,
      dayKey: result.dayKey,
      totalTasks: result.totalTasks,
      selectedTasks: result.selectedTasks,
      writtenCount: result.writtenCount,
      outDir: result.outDir
    });
  } catch (err) {
    console.error("[build-team-news-manual-drafts-day] cli:fatal", err);
    process.exit(1);
  }
}
