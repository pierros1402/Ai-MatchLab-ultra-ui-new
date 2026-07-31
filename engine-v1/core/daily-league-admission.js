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
  previousArtifact = null,
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

  const previousDecisions =
    Array.isArray(previousArtifact?.decisions)
      ? previousArtifact.decisions
      : [];

  const previousDecisionBySlug =
    new Map(
      previousDecisions
        .map(row => [
          clean(row?.slug),
          row
        ])
        .filter(([slug]) => Boolean(slug))
    );

  const previouslyAdmittedSlugs =
    (Array.isArray(previousArtifact?.admittedSlugs)
      ? previousArtifact.admittedSlugs
      : []
    )
      .map(clean)
      .filter(Boolean);

  const decisionIndexBySlug =
    new Map(
      decisions.map((row, index) => [
        row.slug,
        index
      ])
    );

  for (const slug of previouslyAdmittedSlugs) {
    const classification =
      classifyAutomaticAdmissionSlug(slug);

    if (
      !classification.eligible ||
      staticSeedSet.has(slug)
    ) {
      continue;
    }

    const existingIndex =
      decisionIndexBySlug.get(slug);

    const existingDecision =
      existingIndex === undefined
        ? null
        : decisions[existingIndex];

    if (existingDecision?.admitted) {
      continue;
    }

    const previousDecision =
      previousDecisionBySlug.get(slug) || {};

    const carriedDecision = {
      ...previousDecision,
      ...(existingDecision || {}),
      slug,
      observationDays:
        Math.max(
          Number(previousDecision.observationDays || 0),
          Number(existingDecision?.observationDays || 0),
          Number(minObservationDays || 0)
        ),
      totalObservedFixtures:
        Math.max(
          Number(previousDecision.totalObservedFixtures || 0),
          Number(existingDecision?.totalObservedFixtures || 0)
        ),
      byDay: {
        ...(previousDecision.byDay || {}),
        ...(existingDecision?.byDay || {})
      },
      classification:
        "admitted",
      admitted: true,
      acquisitionEligible: true,
      reasonCode:
        "persistent_admission_carry_forward",
      carriedForward: true,
      carriedFromDay:
        previousArtifact?.dayKey || null
    };

    if (existingIndex === undefined) {
      decisionIndexBySlug.set(
        slug,
        decisions.length
      );

      decisions.push(carriedDecision);
    } else {
      decisions[existingIndex] =
        carriedDecision;
    }
  }

  decisions.sort((a, b) =>
    a.slug.localeCompare(b.slug)
  );

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

export function selectPriorAdmissionArtifact(
  dayKey,
  candidate
) {
  const requestedDay =
    String(dayKey || "").trim();

  const candidateDay =
    String(candidate?.dayKey || "").trim();

  if (
    !requestedDay ||
    !candidateDay ||
    candidateDay > requestedDay
  ) {
    return null;
  }

  return candidate;
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

  const latestFile =
    resolveDataPath(
      "competition-admission",
      "latest.json"
    );

  const previousCandidate =
    options.previousArtifact !== undefined
      ? options.previousArtifact
      : readJson(latestFile, null);

  const previousArtifact =
    selectPriorAdmissionArtifact(
      dayKey,
      previousCandidate
    );

  const artifact =
    buildDailyLeagueAdmission({
      dayKey,
      reports,
      previousArtifact,
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

  const effectiveSeeds = [];
  const seen = new Set();

  for (const slug of [
    ...staticSeeds,
    ...admittedSeeds
  ]) {
    if (
      !slug ||
      seen.has(slug) ||
      isDisabledLeague(slug)
    ) {
      continue;
    }

    seen.add(slug);
    effectiveSeeds.push(slug);
  }

  return {
    artifact,
    staticSeeds,
    admittedSeeds,
    effectiveSeeds
  };
}
