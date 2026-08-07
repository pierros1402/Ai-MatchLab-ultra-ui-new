import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here =
  path.dirname(fileURLToPath(import.meta.url));

const root =
  path.resolve(here, "../..");

function read(relativePath) {
  return fs
    .readFileSync(
      path.join(root, relativePath),
      "utf8"
    )
    .replace(/\r\n/g, "\n");
}

function requireTokens(source, tokens) {
  for (const token of tokens) {
    assert.ok(
      source.includes(token),
      `missing active-completeness token: ${token}`
    );
  }
}

test(
  "provider discovery binds exact Athens target day and fails closed on feed failure",
  () => {
    const source = read(
      "engine-v1/jobs/discover-provider-competitions-day.js"
    );

    requireTokens(source, [
      "athensDayFromKickoff",
      "targetDayFixtureCount",
      "targetDaySourceIds",
      "provider_competition_feed_failed"
    ]);
  }
);

test(
  "league gap report joins admitted scope with independent provider completeness",
  () => {
    const source = read(
      "engine-v1/jobs/build-league-gap-report-day.js"
    );

    requireTokens(source, [
      '"competition-admission"',
      '"competition-discovery"',
      "admittedSlugs",
      "buildActiveCompetitionCompleteness",
      "activeCompetitionCompleteness"
    ]);
  }
);

test(
  "both System Health producers consume the completeness gate",
  () => {
    for (const relativePath of [
      "engine-v1/jobs/build-system-health-alerts-day.js",
      "engine-v1/index.js"
    ]) {
      const source = read(relativePath);

      requireTokens(source, [
        "collectActiveCompetitionCompletenessIssues",
        '"coverage-readiness"'
      ]);
    }
  }
);

test(
  "daily truth persistence keeps discovery denominator even when publication is blocked",
  () => {
    const source = read(
      ".github/workflows/daily-deploy-snapshot.yml"
    );

    requireTokens(source, [
      'data/competition-discovery/${DAY_KEY}.json',
      "data/provider-competition-registry/flashscore.json",
      "daily-deploy-truth"
    ]);
  }
);
