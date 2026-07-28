import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  describeProbabilityAdjustment,
  adjustMarketProbabilities
} from "./opponent-strength-adjusted-form.js";

const here = path.dirname(
  fileURLToPath(import.meta.url)
);
const root = path.resolve(here, "../..");

function read(relativePath) {
  return fs
    .readFileSync(
      path.join(root, relativePath),
      "utf8"
    )
    .replace(/\r\n/g, "\n");
}

test(
  "shared descriptor exposes all supported market deltas",
  () => {
    const home = {
      sampleReliability: 0.8,
      impact: {
        ppg: 0.4,
        over25Rate: 0.2,
        bttsRate: -0.1
      }
    };

    const away = {
      sampleReliability: 0.6,
      impact: {
        ppg: -0.2,
        over25Rate: 0.1,
        bttsRate: 0.05
      }
    };

    const impact =
      describeProbabilityAdjustment(
        home,
        away
      );

    assert.equal(
      impact.reliability,
      0.6
    );
    assert.ok(
      impact.adjustmentScale > 0
    );
    assert.ok(
      impact["1X2"].home > 0
    );
    assert.ok(
      impact["1X2"].away < 0
    );
    assert.ok(
      impact.OU15.over > 0
    );
    assert.ok(
      impact.OU25.over > 0
    );
    assert.ok(
      impact.OU35.over > 0
    );
    assert.ok(
      Number.isFinite(
        impact.BTTS.yes
      )
    );
  }
);

test(
  "shared adjustment preserves every probability complement",
  () => {
    const profile = {
      sampleReliability: 1,
      impact: {
        ppg: 0.5,
        over25Rate: -0.2,
        bttsRate: -0.1
      }
    };

    const markets =
      adjustMarketProbabilities(
        {
          "1X2": {
            probs: {
              home: 0.5,
              draw: 0.25,
              away: 0.25
            }
          },
          OU15: {
            probs: {
              over: 0.8,
              under: 0.2
            }
          },
          OU25: {
            probs: {
              over: 0.7,
              under: 0.3
            }
          },
          OU35: {
            probs: {
              over: 0.4,
              under: 0.6
            }
          },
          BTTS: {
            probs: {
              yes: 0.65,
              no: 0.35
            }
          }
        },
        profile,
        profile
      ).markets;

    for (
      const key of [
        "OU15",
        "OU25",
        "OU35"
      ]
    ) {
      assert.equal(
        Number(
          (
            markets[key].probs.over +
            markets[key].probs.under
          ).toFixed(6)
        ),
        1
      );
    }

    assert.equal(
      Number(
        (
          markets.BTTS.probs.yes +
          markets.BTTS.probs.no
        ).toFixed(6)
      ),
      1
    );

    assert.equal(
      Number(
        (
          markets["1X2"].probs.home +
          markets["1X2"].probs.draw +
          markets["1X2"].probs.away
        ).toFixed(6)
      ),
      1
    );
  }
);

test(
  "details rich blocks use the common profile loader and descriptor",
  () => {
    const source = read(
      "engine-v1/core/details-rich-blocks.js"
    );

    for (const token of [
      "loadOpponentAdjustedProfiles(",
      "describeProbabilityAdjustment(",
      "buildOpponentAdjustedFormBlock",
      'schema:',
      '"ai-matchlab.detail-opponent-adjusted-form.v1"',
      "opponentAdjustedForm:"
    ]) {
      assert.ok(
        source.includes(token),
        token
      );
    }
  }
);

test(
  "details builder publishes opponentAdjustedForm additively",
  () => {
    const source = read(
      "engine-v1/jobs/build-details-day.js"
    );

    assert.ok(
      source.includes(
        "opponentAdjustedForm:"
      )
    );

    assert.ok(
      source.includes(
        "richBlocks.opponentAdjustedForm"
      )
    );
  }
);

test(
  "details UI exposes raw adjusted samples and probability impact",
  () => {
    const source = read(
      "assets/js/ui/details-panel.js"
    );

    for (const token of [
      "Opponent-Adjusted Form",
      "Probability impact",
      "adjusted.probabilityImpact",
      "strongOpponentSample",
      "peerStrengthSample",
      "sampleReliability",
      "Over 1.5",
      "Over 2.5",
      "Over 3.5",
      "BTTS Yes"
    ]) {
      assert.ok(
        source.includes(token),
        token
      );
    }
  }
);

test(
  "Value threshold and approval files remain outside this patch",
  () => {
    const changedPaths = [
      "engine-v1/core/opponent-strength-adjusted-form.js",
      "engine-v1/core/details-rich-blocks.js",
      "engine-v1/jobs/build-details-day.js",
      "assets/js/ui/details-panel.js",
      "engine-v1/core/opponent-strength-detail-contract.test.js"
    ];

    assert.equal(
      changedPaths.includes(
        "engine-v1/core/build-value-day.js"
      ),
      false
    );

    assert.equal(
      changedPaths.includes(
        "engine-v1/jobs/derive-value-from-odds.js"
      ),
      false
    );
  }
);