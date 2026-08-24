import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  validateValueComparisonPayload
} from "../jobs/sync-deploy-snapshot-from-github.js";

const here =
  path.dirname(
    fileURLToPath(import.meta.url)
  );

const root =
  path.resolve(
    here,
    "../.."
  );

const read =
  relative =>
    fs.readFileSync(
      path.join(root, relative),
      "utf8"
    );

function completeComparison(day) {
  const plan =
    id => ({
      id,
      count: 0,
      picks: [],
      summary: {
        picks: 0,
        settled: 0,
        wins: 0,
        losses: 0,
        voids: 0,
        unresolved: 0
      }
    });

  return {
    ok: true,
    date: day,
    plans: {
      A: plan("plan-a"),
      A2: plan("plan-a2"),
      B: plan("plan-b"),
      B2: plan("plan-b2")
    }
  };
}

test(
  "runtime comparison validation requires the complete ordinary four-plan contract",
  () => {
    const day =
      "2099-08-24";

    const payload =
      completeComparison(day);

    assert.equal(
      validateValueComparisonPayload(
        payload,
        day
      ),
      payload
    );

    delete payload.plans.B2;

    assert.throws(
      () =>
        validateValueComparisonPayload(
          payload,
          day
        ),
      /value_comparison_four_plan_contract_failed:B2/u
    );
  }
);

test(
  "explicit unrecoverable Plan A gap remains an accepted exceptional comparison contract",
  () => {
    const day =
      "2099-08-24";

    const payload =
      completeComparison(day);

    payload.comparisonEligible = false;

    payload.planAAvailability = {
      status: "unrecoverable",
      reason: "signed_plan_a_observation_unavailable"
    };

    payload.plans.A = null;

    assert.equal(
      validateValueComparisonPayload(
        payload,
        day
      ),
      payload
    );
  }
);

test(
  "comparison-only synchronization updates both generic and embedded runtime mirrors",
  () => {
    const source =
      read(
        "engine-v1/jobs/sync-deploy-snapshot-from-github.js"
      );

    assert.match(
      source,
      /syncValueComparisonFromGithub/u
    );

    assert.match(
      source,
      /deploy-snapshots[\s\S]*runtime[\s\S]*value-comparison\.json/u
    );

    assert.match(
      source,
      /comparisonSha256/u
    );

    assert.match(
      source,
      /runtimeReleaseWritten/u
    );

    assert.match(
      source,
      /comparisonOnly/u
    );

    assert.match(
      source,
      /--comparison-only/u
    );
  }
);

test(
  "engine exposes authenticated comparison-only child-process synchronization",
  () => {
    const index =
      read(
        "engine-v1/index.js"
      );

    assert.match(
      index,
      /startValueComparisonSyncJob/u
    );

    assert.match(
      index,
      /app\.post\(\s*"\/ops\/sync-value-comparison"/su
    );

    assert.match(
      index,
      /value-comparison-sync/u
    );

    assert.match(
      index,
      /--comparison-only/u
    );

    assert.doesNotMatch(
      index,
      /syncValueComparisonFromGithub\(/u
    );
  }
);

test(
  "public comparison ordinary contract requires A A2 B B2",
  () => {
    const index =
      read(
        "engine-v1/index.js"
      );

    const start =
      index.indexOf(
        "function readValueComparisonArtifact(date)"
      );

    const end =
      index.indexOf(
        'app.get("/value-comparison"',
        start
      );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const block =
      index.slice(start, end);

    for (
      const token of [
        '"A"',
        '"A2"',
        '"B"',
        '"B2"'
      ]
    ) {
      assert.match(
        block,
        new RegExp(
          token.replace(
            /[.*+?^${}()|[\]\\]/gu,
            "\\$&"
          )
        )
      );
    }

    assert.match(
      block,
      /ordinaryComparisonValid/u
    );
  }
);

test(
  "Value export uses readValueComparisonArtifact and never direct value-comparison filesystem resolution",
  () => {
    const index =
      read(
        "engine-v1/index.js"
      );

    const start =
      index.indexOf(
        "function loadValueExportComparisonDay(date)"
      );

    const end =
      index.indexOf(
        "function valueExportSourcePicks",
        start
      );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const block =
      index.slice(start, end);

    assert.match(
      block,
      /readValueComparisonArtifact\(date\)/u
    );

    assert.doesNotMatch(
      block,
      /resolveDataPath\("value-comparison"/u
    );

    assert.match(
      block,
      /VALUE_EXPORT_COMPARISON_NOT_FOUND/u
    );
  }
);

test(
  "Value UI fails closed instead of downgrading to snapshot value-picks",
  () => {
    const adapter =
      read(
        "assets/js/live/value-adapter.js"
      );

    const start =
      adapter.indexOf(
        "async function refreshOnce(dateYmd)"
      );

    const end =
      adapter.indexOf(
        'on("date:change"',
        start
      );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const block =
      adapter.slice(start, end);

    assert.match(
      block,
      /engine-release-unavailable/u
    );

    assert.match(
      block,
      /unavailableComparisonPayload/u
    );

    assert.doesNotMatch(
      block,
      /fetchValue\(date\)/u
    );
  }
);

test(
  "daily settlement checkpoint mirrors the real-Athens catch-up window and publishes comparisons only",
  () => {
    const workflow =
      read(
        ".github/workflows/daily-deploy-snapshot.yml"
      );

    assert.ok(
      workflow.includes(
        'ATHENS_TODAY="$(TZ=Europe/Athens date +%F)"'
      )
    );

    assert.ok(
      workflow.includes(
        'k="$(TZ=Europe/Athens date -d "${ATHENS_TODAY} -${back} day" +%F)"'
      )
    );

    assert.doesNotMatch(
      workflow,
      /SETTLEMENT_WINDOW_BASE/u
    );

    assert.match(
      workflow,
      /PRIOR_SETTLEMENT_DAYS=/u
    );

    assert.match(
      workflow,
      /node tools\/sync-public-value-comparison\.mjs "\$k" "\$\{PRIOR_SETTLEMENT_REF\}"/u
    );

    assert.match(
      workflow,
      /node tools\/sync-public-value-comparison\.mjs "\$\{FINALIZE_DAY_KEY\}" "\$\{PUBLISHED_REF\}"/u
    );

    assert.doesNotMatch(
      workflow,
      /bash tools\/sync-public-snapshot\.sh "\$\{FINALIZE_DAY_KEY\}" "\$\{PUBLISHED_REF\}"/u
    );

    assert.doesNotMatch(
      workflow,
      /bash tools\/sync-public-snapshot\.sh "\$\{PRIOR_SETTLEMENT_DAY\}" "\$\{PRIOR_SETTLEMENT_REF\}"/u
    );
  }
);

test(
  "comparison-only public verifier is immutable-ref bound and validates served parity",
  () => {
    const tool =
      read(
        "tools/sync-public-value-comparison.mjs"
      );

    assert.match(
      tool,
      /ops\/sync-value-comparison/u
    );

    assert.match(
      tool,
      /raw\.githubusercontent\.com/u
    );

    assert.match(
      tool,
      /canonicalBufferSha256/u
    );

    assert.match(
      tool,
      /deepStrictEqual/u
    );
  }
);
