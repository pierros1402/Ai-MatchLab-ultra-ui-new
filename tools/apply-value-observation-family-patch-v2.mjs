import fs from "node:fs";

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  const last = text.lastIndexOf(before);
  if (first < 0 || first !== last) {
    throw new Error(`${label}: expected exactly one anchor`);
  }
  return text.slice(0, first) + after + text.slice(first + before.length);
}

function replaceBetween(text, startMarker, endMarker, replacement, label) {
  const start = text.indexOf(startMarker);
  if (start < 0 || text.indexOf(startMarker, start + 1) >= 0) {
    throw new Error(`${label}: start marker must exist exactly once`);
  }
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (end < 0 || text.indexOf(endMarker, end + 1) >= 0) {
    throw new Error(`${label}: end marker must exist exactly once`);
  }
  if (end <= start) {
    throw new Error(`${label}: invalid marker order`);
  }
  return text.slice(0, start) + replacement + text.slice(end);
}

const refreshPath = "engine-v1/jobs/refresh-value-artifacts-day.js";
let refresh = fs.readFileSync(refreshPath, "utf8");

refresh = replaceOnce(
  refresh,
  'import { buildValueA2B2Day } from "./build-value-a2-b2-day.js";',
  'import {\n  buildValueA2B2Day,\n  shouldFreezeAdjustedValueObservations\n} from "./build-value-a2-b2-day.js";',
  "refresh adjusted observation import"
);

const planBStart = "  const planB = options.skipPlanB === true";
const planBEnd = "  const planA2 = adjustedPlans?.plans?.A2 || null;";
const planBReplacement = `  const freezeObservationFamily =
    shouldFreezeAdjustedValueObservations(
      date,
      athensDayKey()
    );

  let planB = null;

  if (options.skipPlanB !== true) {
    if (freezeObservationFamily) {
      const frozenPlanB = readJsonSafe(
        resolveDataPath("value-plans", date, "plan-b.json"),
        null
      );
      const frozenPlanBAudit = readJsonSafe(
        resolveDataPath("value-plans", date, "plan-b-audit.json"),
        null
      );
      const frozenPicks = Array.isArray(frozenPlanB?.picks)
        ? frozenPlanB.picks
        : null;
      const frozenCount = Number(frozenPlanB?.count);

      const validFrozenPlanB = Boolean(
        frozenPlanB?.ok === true &&
        String(frozenPlanB?.date || "") === date &&
        String(frozenPlanB?.planId || "") === "plan-b" &&
        String(frozenPlanB?.outputMode || "") === "plan-b-observation" &&
        frozenPicks &&
        Number.isInteger(frozenCount) &&
        frozenCount === frozenPicks.length &&
        frozenPlanBAudit?.ok === true &&
        String(frozenPlanBAudit?.date || "") === date
      );

      if (!validFrozenPlanB) {
        return {
          ok: false,
          mode: "refresh_value_artifacts_after_canonical_change",
          date,
          reason: "missing_or_invalid_frozen_plan_b_observation"
        };
      }

      planB = {
        ...frozenPlanB,
        frozenObservation: true
      };
    } else {
      planB = deriveValueFromOdds(date, {
        freeze: false,
        outputMode: "plan-b-observation"
      });
    }
  }

  const adjustedPlans = await buildValueA2B2Day(date, {
    calendarDay: athensDayKey()
  });
`;

refresh = replaceBetween(
  refresh,
  planBStart,
  planBEnd,
  planBReplacement,
  "Plan B observation lifecycle"
);

fs.writeFileSync(refreshPath, refresh, "utf8");

const workflowPath = ".github/workflows/daily-deploy-snapshot.yml";
let workflow = fs.readFileSync(workflowPath, "utf8");

const exportAnchor = `      - name: Export deploy snapshot
        if: env.SKIP_BUILD != 'true'
        run: node ./engine-v1/jobs/export-deploy-snapshot-day.js "$DAY_KEY" --no-update-latest`;

const coverageRefresh = `      # Canonical model-assessment top-up is mandatory for every future-day
      # release wave. A fixture may remain unassessed only when the supplement
      # explicitly records insufficient evidence; unexplained gaps fail closed.
      - name: Refresh canonical model assessment coverage for Value Plans B/B2
        if: env.SKIP_BUILD != 'true'
        run: node ./engine-v1/jobs/refresh-model-assessment-coverage-day.js "$DAY_KEY" --gate

${exportAnchor}`;

workflow = replaceOnce(
  workflow,
  exportAnchor,
  coverageRefresh,
  "daily assessment coverage refresh insertion"
);

const comparisonAnchor = `      - name: Build cumulative value comparison
        if: env.SKIP_BUILD != 'true'
        run: node ./engine-v1/jobs/build-value-comparison-cumulative.js --write`;

const strongGate = `      # Bind the canonical assessment supplement result to the exact B/B2 joins.
      # Every assessment that could be built must persist and join canonically.
      - name: Enforce canonical assessment coverage for Value Plans B/B2
        if: env.SKIP_BUILD != 'true'
        shell: bash
        run: |
          set -euo pipefail
          node - <<'NODE'
          const fs = require("fs");
          const day = process.env.DAY_KEY;
          const coverageFile = "data/value-plans/" + day + "/assessment-coverage.json";

          if (!fs.existsSync(coverageFile)) {
            throw new Error("assessment coverage report missing: " + coverageFile);
          }

          const report = JSON.parse(fs.readFileSync(coverageFile, "utf8"));
          const coverage = report?.coverage || {};
          if (report?.ok !== true || coverage?.ok !== true) {
            throw new Error("assessment coverage contract failed: " + JSON.stringify(coverage));
          }

          const expected = Number(coverage?.assessmentRowsWritten || 0);
          for (const [plan, file] of [
            ["B", "data/value-plans/" + day + "/plan-b-audit.json"],
            ["B2", "data/value-plans/" + day + "/plan-b2-audit.json"]
          ]) {
            if (!fs.existsSync(file)) {
              throw new Error("Plan " + plan + " assessment audit missing: " + file);
            }

            const audit = JSON.parse(fs.readFileSync(file, "utf8"));
            const membership = audit?.membership || {};
            const assessmentRows = Number(membership.assessmentRows ?? 0);
            const joinedMatches = Number(membership.joinedMatches ?? 0);

            console.log(JSON.stringify({
              plan,
              expectedCanonicalAssessmentRows: expected,
              assessmentRows,
              joinedMatches,
              explicitlyUnassessable: Number(coverage?.insufficientTeamEvidence || 0),
              unexplainedUpcomingFixtures: Number(coverage?.unexplainedUpcomingFixtures || 0)
            }));

            if (assessmentRows < expected) {
              throw new Error(
                "Plan " + plan + " persisted " + assessmentRows +
                " assessments; canonical supplement built " + expected
              );
            }
            if (joinedMatches < expected) {
              throw new Error(
                "Plan " + plan + " joined only " + joinedMatches +
                "/" + expected + " canonical supplement assessments"
              );
            }
          }
          NODE

${comparisonAnchor}`;

workflow = replaceOnce(
  workflow,
  comparisonAnchor,
  strongGate,
  "daily strong assessment coverage gate insertion"
);

fs.writeFileSync(workflowPath, workflow, "utf8");

for (const [file, signals] of [
  [refreshPath, [
    "shouldFreezeAdjustedValueObservations",
    "missing_or_invalid_frozen_plan_b_observation",
    "freezeObservationFamily"
  ]],
  [workflowPath, [
    "Refresh canonical model assessment coverage for Value Plans B/B2",
    "refresh-model-assessment-coverage-day.js",
    "Enforce canonical assessment coverage for Value Plans B/B2",
    "expectedCanonicalAssessmentRows"
  ]]
]) {
  const text = fs.readFileSync(file, "utf8");
  for (const signal of signals) {
    if (!text.includes(signal)) {
      throw new Error(`${file}: missing post-patch signal ${signal}`);
    }
  }
}

console.log(JSON.stringify({
  ok: true,
  patched: [refreshPath, workflowPath]
}, null, 2));
