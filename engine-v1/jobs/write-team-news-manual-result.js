import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ensureDir } from "../storage/data-root.js";
import { normalizeTeamKey } from "../storage/team-news-db.js";
import { validateTeamNewsSeedRecord } from "./validate-team-news-seeds-day.js";

function usage() {
  return [
    "Usage:",
    "  node engine-v1/jobs/write-team-news-manual-result.js YYYY-MM-DD --team TEAM --side home|away --approved --absence PLAYER|REASON|IMPORTANCE|SIDE --evidence LABEL|URL|PUBLISHER|PUBLISHED_AT",
    "",
    "Notes:",
    "  - Use PowerShell single quotes around values.",
    "  - For accented names, prefer ASCII-safe unicode escapes, e.g. Sa\\u00efmon Bouabr\\u00e9.",
    "  - --approved is required to write reviewed:true / productionGrade:true.",
    "",
    "Example:",
    "  node engine-v1/jobs/write-team-news-manual-result.js 2026-05-05 --team 'Al Hilal' --key al_hilal --league ksa.1 --side away --match-id 123 --approved --absence 'Sa\\u00efmon Bouabr\\u00e9|injury|medium|away' --evidence 'Club update|https://example.com|Club|2026-05-05'"
  ].join("\n");
}

function normalizeText(value) {
  return String(value || "").trim();
}

function decodeUnicodeEscapes(value) {
  return normalizeText(value)
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function parseArgs(argv) {
  const out = {
    dayKey: argv[2] || "",
    team: "",
    key: "",
    leagueSlug: "",
    side: "",
    matchIds: [],
    aliases: [],
    absences: [],
    notes: [],
    evidence: [],
    approved: false,
    dryRun: false,
    force: false
  };

  for (let i = 3; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--approved") {
      out.approved = true;
      continue;
    }

    if (arg === "--dry-run") {
      out.dryRun = true;
      continue;
    }

    if (arg === "--force") {
      out.force = true;
      continue;
    }

    const next = argv[i + 1];

    if (arg === "--team") {
      out.team = decodeUnicodeEscapes(next);
      i += 1;
      continue;
    }

    if (arg === "--key") {
      out.key = normalizeTeamKey(decodeUnicodeEscapes(next));
      i += 1;
      continue;
    }

    if (arg === "--league") {
      out.leagueSlug = decodeUnicodeEscapes(next);
      i += 1;
      continue;
    }

    if (arg === "--side" || arg === "--target-side") {
      out.side = decodeUnicodeEscapes(next).toLowerCase();
      i += 1;
      continue;
    }

    if (arg === "--match-id") {
      out.matchIds.push(...decodeUnicodeEscapes(next).split(",").map(v => normalizeText(v)).filter(Boolean));
      i += 1;
      continue;
    }

    if (arg === "--alias") {
      out.aliases.push(decodeUnicodeEscapes(next));
      i += 1;
      continue;
    }

    if (arg === "--note") {
      out.notes.push(decodeUnicodeEscapes(next));
      i += 1;
      continue;
    }

    if (arg === "--absence") {
      out.absences.push(parseAbsence(next, out.side));
      i += 1;
      continue;
    }

    if (arg === "--evidence") {
      out.evidence.push(parseEvidence(next));
      i += 1;
      continue;
    }

    throw new Error("Unknown argument: " + arg + "\\n\\n" + usage());
  }

  return out;
}

function parseAbsence(value, fallbackSide = "") {
  const parts = decodeUnicodeEscapes(value).split("|").map(v => normalizeText(v));
  const [player, reason, importance, side] = parts;

  return {
    player,
    reason: reason || null,
    importance: importance || "medium",
    side: (side || fallbackSide || "").toLowerCase()
  };
}

function parseEvidence(value) {
  const parts = decodeUnicodeEscapes(value).split("|").map(v => normalizeText(v));
  const [label, url, publisher, publishedAt] = parts;

  return {
    label,
    url,
    publisher,
    publishedAt
  };
}

function buildSeed(args) {
  const dayKey = normalizeText(args.dayKey);
  const team = normalizeText(args.team);
  const key = normalizeTeamKey(args.key || team);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    throw new Error("Invalid day key. Expected YYYY-MM-DD.");
  }

  if (!team) {
    throw new Error("Missing --team");
  }

  if (!key) {
    throw new Error("Missing/invalid team key");
  }

  if (!["home", "away", ""].includes(args.side)) {
    throw new Error("Invalid --side. Use home or away.");
  }

  if (!args.approved) {
    throw new Error("Refusing to write importable manual result without --approved.");
  }

  if (args.absences.length < 1 && args.notes.length < 1) {
    throw new Error("Add at least one --absence or --note.");
  }

  if (args.evidence.length < 1) {
    throw new Error("Add at least one --evidence.");
  }

  return {
    team,
    key,
    leagueSlug: args.leagueSlug || null,
    side: args.side || null,
    matchIds: args.matchIds,
    aliases: args.aliases,
    sourceInputType: "manual_result",
    source: "tracked_team_news_manual_result",
    reviewed: true,
    productionGrade: true,
    absences: args.absences,
    notes: args.notes,
    evidence: args.evidence,
    sourceMeta: {
      writer: "write-team-news-manual-result",
      writtenAt: new Date().toISOString()
    },
    meta: {
      sourceInputType: "manual_result",
      reviewed: true,
      productionGrade: true,
      writtenAt: new Date().toISOString()
    }
  };
}

function getOutputPath(dayKey, key) {
  return path.resolve(process.cwd(), "engine-v1", "seeds", "team-news", "manual-results", dayKey, key + ".json");
}

function writeJson(filePath, data, force = false) {
  if (fs.existsSync(filePath) && !force) {
    throw new Error("Output already exists. Use --force only if you intend to replace it: " + filePath);
  }

  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function writeTeamNewsManualResultFromArgs(argv = process.argv) {
  const args = parseArgs(argv);
  const seed = buildSeed(args);
  const validation = validateTeamNewsSeedRecord(seed, {
    dayKey: args.dayKey,
    file: null
  });

  const outPath = getOutputPath(args.dayKey, seed.key);

  if (!args.dryRun) {
    writeJson(outPath, seed, args.force);
  }

  return {
    ok: validation.ok,
    status: validation.status,
    reason: validation.reason,
    dayKey: args.dayKey,
    team: seed.team,
    key: seed.key,
    file: outPath,
    dryRun: args.dryRun,
    issueCount: validation.issueCount,
    issues: validation.issues,
    absenceCount: seed.absences.length,
    evidenceCount: seed.evidence.length,
    noteCount: seed.notes.length
  };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  try {
    const result = writeTeamNewsManualResultFromArgs(process.argv);
    console.log(JSON.stringify(result, null, 2));

    if (!result.ok) {
      process.exitCode = 2;
    }
  } catch (err) {
    console.error("[write-team-news-manual-result] failed");
    console.error(err?.message || err);
    console.error("");
    console.error(usage());
    process.exit(1);
  }
}

