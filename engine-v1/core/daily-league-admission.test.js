import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDailyLeagueAdmission,
  classifyAutomaticAdmissionSlug,
  collectLeagueAdmissionEvidence,
  effectiveLeagueSeedsForDay
} from "./daily-league-admission.js";

function report(dayKey, sample) {
  return {
    dayKey,
    report: {
      summary: {
        supplementalAllScoreboard: {
          skippedSlugSample: sample
        }
      }
    }
  };
}

test(
  "strict domestic tier 1 and 2 slugs are eligible",
  () => {
    assert.equal(
      classifyAutomaticAdmissionSlug(
        "par.1"
      ).eligible,
      true
    );

    assert.equal(
      classifyAutomaticAdmissionSlug(
        "slv.2"
      ).eligible,
      true
    );
  }
);

test(
  "cups women and tier 3 are never auto admitted",
  () => {
    for (const slug of [
      "col.copa",
      "caf.w.nations",
      "arg.3",
      "club.friendly",
      "concacaf.central.american.cup"
    ]) {
      assert.equal(
        classifyAutomaticAdmissionSlug(
          slug
        ).eligible,
        false
      );
    }
  }
);

test(
  "evidence accumulates distinct days and fixture counts",
  () => {
    const rows =
      collectLeagueAdmissionEvidence({
        dayKey: "2026-08-01",
        reports: [
          report(
            "2026-07-31",
            {
              "par.1": 2
            }
          ),
          report(
            "2026-08-01",
            {
              "par.1": 3
            }
          )
        ]
      });

    assert.deepEqual(
      rows,
      [
        {
          slug: "par.1",
          observationDays: 2,
          totalObservedFixtures: 5,
          byDay: {
            "2026-07-31": 2,
            "2026-08-01": 3
          }
        }
      ]
    );
  }
);

test(
  "one observation day remains fail closed",
  () => {
    const artifact =
      buildDailyLeagueAdmission({
        dayKey: "2026-07-31",
        reports: [
          report(
            "2026-07-31",
            {
              "par.1": 2
            }
          )
        ],
        generatedAt:
          "2026-07-31T12:00:00.000Z"
      });

    const row =
      artifact.decisions.find(
        item =>
          item.slug === "par.1"
      );

    assert.equal(
      row.classification,
      "pending"
    );

    assert.equal(
      row.admitted,
      false
    );
  }
);

test(
  "persistent strict domestic evidence becomes admitted",
  () => {
    const artifact =
      buildDailyLeagueAdmission({
        dayKey: "2026-08-01",
        reports: [
          report(
            "2026-07-31",
            {
              "par.1": 2,
              "caf.w.nations": 4
            }
          ),
          report(
            "2026-08-01",
            {
              "par.1": 1,
              "caf.w.nations": 2
            }
          )
        ],
        generatedAt:
          "2026-08-01T12:00:00.000Z"
      });

    assert.deepEqual(
      artifact.admittedSlugs,
      ["par.1"]
    );

    const women =
      artifact.decisions.find(
        row =>
          row.slug ===
          "caf.w.nations"
      );

    assert.equal(
      women.classification,
      "rejected"
    );

    assert.equal(
      women.acquisitionEligible,
      false
    );
  }
);


test(
  "effective seed universe merges admissions without mutating static coverage",
  () => {
    const result =
      effectiveLeagueSeedsForDay(
        "2026-08-01",
        {
          artifact: {
            schema:
              "ai-matchlab.daily-league-admission.v1",
            dayKey:
              "2026-08-01",
            admittedSlugs: [
              "par.1",
              "slv.1",
              "som.1",
              "par.1"
            ]
          }
        }
      );

    assert.equal(
      result.admittedSeeds.includes(
        "par.1"
      ),
      true
    );

    assert.equal(
      result.effectiveSeeds.includes(
        "par.1"
      ),
      true
    );

    assert.equal(
      result.effectiveSeeds.includes(
        "slv.1"
      ),
      true
    );

    assert.equal(
      result.effectiveSeeds.includes(
        "som.1"
      ),
      false
    );

    assert.equal(
      result.effectiveSeeds.filter(
        slug => slug === "par.1"
      ).length,
      1
    );

    assert.equal(
      result.staticSeeds.includes(
        "par.1"
      ),
      false
    );
  }
);
