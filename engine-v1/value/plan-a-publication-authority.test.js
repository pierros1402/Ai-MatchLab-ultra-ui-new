import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  selectPlanAPublicationPayload
} from "./plan-a-publication-authority.js";

const here =
  path.dirname(fileURLToPath(import.meta.url));

const engineRoot =
  path.resolve(here, "..");

function valuePayload(
  count,
  label = "current"
) {
  const picks =
    Array.from(
      { length: count },
      (_, index) => ({
        matchId: `${label}-${index + 1}`,
        market: "OU25",
        pick: "over"
      })
    );

  return {
    ok: true,
    date: "2026-08-15",
    source: label,
    count: picks.length,
    picks
  };
}

test(
  "frozen Plan A observation outranks a later mutable zero-pick rebuild",
  () => {
    const currentPayload =
      valuePayload(
        0,
        "mutable-rebuild"
      );

    const frozenPayload =
      valuePayload(
        1,
        "frozen-production"
      );

    const result =
      selectPlanAPublicationPayload({
        dayKey: "2026-08-15",
        currentPayload,
        observation: {
          ok: true,
          observationSignature:
            "a".repeat(64),
          payload: {
            ...frozenPayload,
            schema:
              "ai-matchlab.value-plan-a-observation.v1",
            immutable: true,
            observationSignature:
              "a".repeat(64)
          }
        },
        observationFileExists: true
      });

    assert.equal(
      result.authority,
      "frozen_plan_a_observation"
    );

    assert.equal(
      result.payload.count,
      1
    );

    assert.equal(
      result.payload.picks.length,
      1
    );

    assert.equal(
      result.payload.picks[0].matchId,
      "frozen-production-1"
    );
  }
);

test(
  "current Plan A is used only before the first frozen observation exists",
  () => {
    const currentPayload =
      valuePayload(
        2,
        "first-freeze"
      );

    const result =
      selectPlanAPublicationPayload({
        dayKey: "2026-08-15",
        currentPayload,
        observation: {
          ok: false,
          reason:
            "plan_a_observation_invalid_json"
        },
        observationFileExists: false
      });

    assert.equal(
      result.authority,
      "current_value_artifact_first_freeze"
    );

    assert.equal(
      result.payload.count,
      2
    );
  }
);

test(
  "invalid existing frozen observation fails closed",
  () => {
    assert.throws(
      () =>
        selectPlanAPublicationPayload({
          dayKey: "2026-08-15",
          currentPayload:
            valuePayload(
              3,
              "mutable"
            ),
          observation: {
            ok: false,
            reason:
              "plan_a_observation_signature_mismatch"
          },
          observationFileExists: true
        }),
      /plan_a_publication_authority_invalid_observation/
    );
  }
);

test(
  "pre-observation historical days keep legacy current-value authority",
  () => {
    const result =
      selectPlanAPublicationPayload({
        dayKey: "2026-07-04",
        currentPayload:
          valuePayload(
            1,
            "legacy"
          )
      });

    assert.equal(
      result.authority,
      "current_value_artifact"
    );

    assert.equal(
      result.payload.count,
      1
    );
  }
);

test(
  "refresh and exporter both consume the common publication authority",
  () => {
    const refreshSource =
      fs.readFileSync(
        path.join(
          engineRoot,
          "jobs",
          "refresh-value-artifacts-day.js"
        ),
        "utf8"
      );

    const exporterSource =
      fs.readFileSync(
        path.join(
          engineRoot,
          "jobs",
          "export-deploy-snapshot-day.js"
        ),
        "utf8"
      );

    assert.match(
      refreshSource,
      /resolvePlanAPublicationPayload/
    );

    assert.match(
      exporterSource,
      /resolvePlanAPublicationPayload/
    );
  }
);
