import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildFourPlanSettlementBundleDay
} from "./build-four-plan-settlement-bundle-day.js";
import {
  buildStatisticsRange
} from "./build-value-settlement-statistics-range.js";

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true
  });

  fs.writeFileSync(
    filePath,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8"
  );
}

function valueArtifact(
  dayKey,
  planKey,
  picks
) {
  return {
    ok: true,
    date: dayKey,
    planKey,
    count: picks.length,
    picks
  };
}

test(
  "isolated four-plan settlement produces plan-aware truth and statistics",
  () => {
    const dayKey = "2099-03-01";

    const tempDir = fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        "aiml-four-plan-e2e-"
      )
    );

    const finalResultsDir = path.join(
      tempDir,
      "final-results"
    );

    const canonicalFixturesDir = path.join(
      tempDir,
      "canonical-fixtures"
    );

    fs.mkdirSync(finalResultsDir, {
      recursive: true
    });

    fs.mkdirSync(canonicalFixturesDir, {
      recursive: true
    });

    try {
      const matchId = "cid_e2e_home_away_20990301";

      writeJson(
        path.join(
          finalResultsDir,
          `${matchId}.json`
        ),
        {
          verifiedFinalTruth: true,
          verdict: "verified_final_result",
          matchId,
          date: dayKey,
          leagueSlug: "test.1",
          teams: {
            homeTeam: "Home",
            awayTeam: "Away"
          },
          finalScore: {
            homeScore: 2,
            awayScore: 1,
            scoreKey: "2-1"
          },
          verification: {
            state:
              "verified_final_result_truth",
            sourceCount: 2,
            independentSourceCount: 2,
            sourceUrls: [
              "https://official.example/result",
              "https://trusted.example/result"
            ]
          }
        }
      );

      const planPicks = {
        A: [
          {
            matchId,
            leagueSlug: "test.1",
            homeTeam: "Home",
            awayTeam: "Away",
            market: "1X2",
            pick: "HOME"
          }
        ],
        A2: [
          {
            matchId,
            leagueSlug: "test.1",
            homeTeam: "Home",
            awayTeam: "Away",
            market: "1X2",
            pick: "AWAY"
          }
        ],
        B: [
          {
            matchId,
            leagueSlug: "test.1",
            homeTeam: "Home",
            awayTeam: "Away",
            market: "BTTS",
            pick: "YES"
          }
        ],
        B2: [
          {
            matchId,
            leagueSlug: "test.1",
            homeTeam: "Home",
            awayTeam: "Away",
            market: "UNSUPPORTED TEST MARKET",
            pick: "TEST"
          }
        ]
      };

      const valuePaths = {};
      const reportPaths = {};
      const summaryPaths = {};

      for (const planKey of [
        "A",
        "A2",
        "B",
        "B2"
      ]) {
        valuePaths[planKey] = path.join(
          tempDir,
          `value-${planKey}.json`
        );

        reportPaths[planKey] = path.join(
          tempDir,
          `report-${planKey}.json`
        );

        summaryPaths[planKey] = path.join(
          tempDir,
          `summary-${planKey}.json`
        );

        writeJson(
          valuePaths[planKey],
          valueArtifact(
            dayKey,
            planKey,
            planPicks[planKey]
          )
        );
      }

      const bundlePath = path.join(
        tempDir,
        "bundle.json"
      );

      const aggregateSummaryPath = path.join(
        tempDir,
        "aggregate-summary.json"
      );

      const result =
        buildFourPlanSettlementBundleDay(
          dayKey,
          {
            valuePaths,
            reportPaths,
            summaryPaths,
            bundlePath,
            aggregateSummaryPath,
            finalResultsDir,
            canonicalFixturesDir
          }
        );

      assert.equal(result.ok, true);
      assert.equal(result.writesPerformed, 10);
      assert.deepEqual(
        result.presentPlans,
        ["A", "A2", "B", "B2"]
      );

      const aggregate = JSON.parse(
        fs.readFileSync(
          aggregateSummaryPath,
          "utf8"
        )
      );

      assert.equal(
        aggregate.summary.totalRows,
        4
      );

      assert.equal(
        aggregate.summary.winRows,
        2
      );

      assert.equal(
        aggregate.summary.lossRows,
        1
      );

      assert.equal(
        aggregate.summary.unresolvedRows,
        1
      );

      assert.deepEqual(
        aggregate.rows.map(row => row.planKey),
        ["A", "A2", "B", "B2"]
      );

      for (const row of aggregate.rows) {
        assert.equal(row.canonicalId, matchId);
        assert.equal(row.matchId, matchId);

        assert.ok(
          [
            "WIN",
            "LOSS",
            "UNRESOLVED"
          ].includes(row.result)
        );

        if (row.result !== "UNRESOLVED") {
          assert.equal(
            row.terminalStatus,
            "FT"
          );
          assert.equal(row.ftHome, 2);
          assert.equal(row.ftAway, 1);
          assert.equal(row.ftScore, "2-1");
          assert.ok(
            row.finalResultProvenance
          );
        }
      }

      const statistics =
        buildStatisticsRange(
          dayKey,
          dayKey,
          {
            summaryPathForDay() {
              return aggregateSummaryPath;
            }
          }
        );

      assert.equal(statistics.ok, true);
      assert.equal(
        statistics.schema,
        "ai-matchlab.value-settlement-statistics-range.v2"
      );

      assert.equal(
        statistics.summary.totalRows,
        4
      );

      assert.equal(
        statistics.summary.winRows,
        2
      );

      assert.equal(
        statistics.summary.lossRows,
        1
      );

      assert.equal(
        statistics.summary.unresolvedRows,
        1
      );

      assert.deepEqual(
        Object.keys(statistics.byPlan),
        ["A", "A2", "B", "B2"]
      );

      assert.equal(
        statistics.byPlan.A.winRows,
        1
      );

      assert.equal(
        statistics.byPlan.A2.lossRows,
        1
      );

      assert.equal(
        statistics.byPlan.B.winRows,
        1
      );

      assert.equal(
        statistics.byPlan.B2.unresolvedRows,
        1
      );
    } finally {
      fs.rmSync(tempDir, {
        recursive: true,
        force: true
      });

      assert.equal(
        fs.existsSync(tempDir),
        false
      );
    }
  }
);
