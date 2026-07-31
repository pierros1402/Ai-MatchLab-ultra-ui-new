import fs from "node:fs";
import path from "node:path";

import {
  LEAGUE_SEEDS
} from "../config.js";

import {
  isDisabledLeague
} from "../source-discovery/disabled-leagues.js";

import {
  resolveDataPath,
  ensureDir
} from "../storage/data-root.js";

const DOMESTIC_TIER_SLUG_RE =
  /^[a-z]{3}\.(1|2)$/u;

const DEFAULT_MIN_OBSERVATION_DAYS = 2;

function clean(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    return JSON.parse(
      fs.readFileSync(filePath, "utf8")
    );
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, value) {
  ensureDir(path.dirname(filePath));

  const temporary =
    filePath +
    `.tmp-${process.pid}-${Date.now()}`;

  fs.writeFileSync(
    temporary,
    JSON.stringify(value, null, 2),
    "utf8"
  );

  fs.renameSync(temporary, filePath);
}

function reportDayFromFileName(name) {
  const match =
    /^(\d{4}-\d{2}-\d{2})\.json$/u
      .exec(String(name || ""));

  return match?.[1] || null;
}

function supplementalSkippedSample(report) {
  return (
    report?.summary
      ?.supplementalAllScoreboard
      ?.skippedSlugSample ||
    report?.results
      ?.find?.(
        row =>
          row?.provider ===
          "espn_all_scoreboard"
      )
      ?.skippedSlugSample ||
    {}
  );
}

export function classifyAutomaticAdmissionSlug(
  slug
) {
  const normalized = clean(slug);

  if (!normalized) {
    return {
      eligible: false,
      reasonCode: "missing_slug"
    };
  }

  if (isDisabledLeague(normalized)) {
    return {
      eligible: false,
      reasonCode: "disabled_league"
    };
  }

  if (!DOMESTIC_TIER_SLUG_RE.test(normalized)) {
    return {
      eligible: false,
      reasonCode:
        "not_strict_domestic_tier_1_or_2"
    };
  }

  return {
    eligible: true,
    reasonCode:
      "strict_domestic_tier_1_or_2"
  };
}

export function collectLeagueAdmissionEvidence({
  dayKey,
  reports = []
} = {}) {
  const evidenceBySlug = new Map();

  for (const entry of reports) {
    const reportDay =
      String(entry?.dayKey || "").trim();

    if (
      !/^\d{4}-\d{2}-\d{2}$/u
        .test(reportDay)
    ) {
      continue;
    }

    if (
      dayKey &&
      reportDay > dayKey
    ) {
      continue;
    }

    const sample =
      supplementalSkippedSample(
        entry?.report
      );

    for (
      const [rawSlug, rawCount] of
      Object.entries(sample)
    ) {
      const slug = clean(rawSlug);
      const count = Number(rawCount || 0);

      if (!slug || count <= 0) {
        continue;
      }

      if (!evidenceBySlug.has(slug)) {
        evidenceBySlug.set(slug, {
          slug,
          observationDays: new Set(),
          totalObservedFixtures: 0,
          byDay: {}
        });
      }

      const row = evidenceBySlug.get(slug);

      row.observationDays.add(reportDay);
      row.totalObservedFixtures += count;
      row.byDay[reportDay] =
        Number(row.byDay[reportDay] || 0) +
        count;
    }
  }

  return [...evidenceBySlug.values()]
    .map(row => ({
      slug: row.slug,
      observationDays:
        row.observationDays.size,
      totalObservedFixtures:
        row.totalObservedFixtures,
      byDay: Object.fromEntries(
        Object.entries(row.byDay)
          .sort(([a], [b]) =>
            a.localeCompare(b)
          )
      )
    }))
    .sort((a, b) =>
      a.slug.localeCompare(b.slug)
    );
}

export function buildDailyLeagueAdmission({
  dayKey,
  reports = [],
  minObservationDays =
    DEFAULT_MIN_OBSERVATION_DAYS,
  generatedAt =
    new Date().toISOString()
} = {}) {
  const evidence =
    collectLeagueAdmissionEvidence({
      dayKey,
      reports
    });

  const staticSeedSet =
    new Set(
      (Array.isArray(LEAGUE_SEEDS)
        ? LEAGUE_SEEDS
        : []
      )
        .map(clean)
        .filter(Boolean)
    );

  const decisions =
    evidence.map(row => {
      const classification =
        classifyAutomaticAdmissionSlug(
          row.slug
        );

      if (staticSeedSet.has(row.slug)) {
        return {
          ...row,
          classification:
            "already_declared",
          admitted: false,
          acquisitionEligible: true,
          reasonCode:
            "already_in_static_league_seeds"
        };
      }

      if (!classification.eligible) {
        return {
          ...row,
          classification:
            "rejected",
          admitted: false,
          acquisitionEligible: false,
          reasonCode:
            classification.reasonCode
        };
      }

      if (
        row.observationDays <
        minObservationDays
      ) {
        return {
          ...row,
          classification:
            "pending",
          admitted: false,
          acquisitionEligible: false,
          reasonCode:
            "insufficient_observation_days"
        };
      }

      return {
        ...row,
        classification:
          "admitted",
        admitted: true,
        acquisitionEligible: true,
        reasonCode:
          "persistent_strict_domestic_tier_evidence"
      };
    });

  const admittedSlugs =
    decisions
      .filter(row => row.admitted)
      .map(row => row.slug)
      .sort();

  return {
    schema:
      "ai-matchlab.daily-league-admission.v1",
    ok: true,
    dayKey,
    generatedAt,
    policy: {
      minObservationDays,
      automaticScope:
        "senior_mens_domestic_tier_1_or_2",
      staticCoverageMutation: false,
      failClosed: true
    },
    summary: {
      evidenceSlugCount:
        evidence.length,
      admittedCount:
        admittedSlugs.length,
      pendingCount:
        decisions.filter(
          row =>
            row.classification ===
            "pending"
        ).length,
      rejectedCount:
        decisions.filter(
          row =>
            row.classification ===
            "rejected"
        ).length,
      alreadyDeclaredCount:
        decisions.filter(
          row =>
            row.classification ===
            "already_declared"
        ).length
    },
    admittedSlugs,
    decisions
  };
}

export function readCoverageReportsForAdmission(
  dayKey
) {
  const directory =
    resolveDataPath("coverage-reports");

  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs
    .readdirSync(directory)
    .map(name => ({
      name,
      dayKey:
        reportDayFromFileName(name)
    }))
    .filter(row => row.dayKey)
    .filter(row =>
      !dayKey ||
      row.dayKey <= dayKey
    )
    .sort((a, b) =>
      a.dayKey.localeCompare(b.dayKey)
    )
    .map(row => ({
      dayKey: row.dayKey,
      report:
        readJson(
          path.join(
            directory,
            row.name
          ),
          null
        )
    }))
    .filter(row => row.report);
}

export function buildAndWriteDailyLeagueAdmission(
  dayKey,
  options = {}
) {
  const reports =
    options.reports ||
    readCoverageReportsForAdmission(
      dayKey
    );

  const artifact =
    buildDailyLeagueAdmission({
      dayKey,
      reports,
      minObservationDays:
        options.minObservationDays,
      generatedAt:
        options.generatedAt
    });

  if (options.write !== false) {
    const dayFile =
      resolveDataPath(
        "competition-admission",
        `${dayKey}.json`
      );

    const latestFile =
      resolveDataPath(
        "competition-admission",
        "latest.json"
      );

    writeJsonAtomic(dayFile, artifact);

    const existingLatest =
      readJson(latestFile, null);

    const existingLatestDay =
      String(
        existingLatest?.dayKey || ""
      ).trim();

    if (
      !existingLatestDay ||
      existingLatestDay <= dayKey
    ) {
      writeJsonAtomic(
        latestFile,
        artifact
      );
    }
  }

  return artifact;
}

export function effectiveLeagueSeedsForDay(
  dayKey,
  options = {}
) {
  const artifact =
    options.artifact ||
    buildAndWriteDailyLeagueAdmission(
      dayKey,
      options
    );

  const staticSeeds =
    (Array.isArray(LEAGUE_SEEDS)
      ? LEAGUE_SEEDS
      : []
    )
      .map(clean)
      .filter(Boolean);

  const admittedSeeds =
    (Array.isArray(
      artifact?.admittedSlugs
    )
      ? artifact.admittedSlugs
      : []
    )
      .map(clean)
      .filter(Boolean);

  const effectiveSeeds =
    [...new Set([
      ...staticSeeds,
      ...admittedSeeds
    ])]
      .filter(slug =>
        !isDisabledLeague(slug)
      )
      .sort();

  return {
    artifact,
    staticSeeds,
    admittedSeeds,
    effectiveSeeds
  };
}
