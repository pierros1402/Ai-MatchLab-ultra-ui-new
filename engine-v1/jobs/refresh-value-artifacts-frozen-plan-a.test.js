import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildPlanARefreshCandidate
} from "./refresh-value-artifacts-day.js";

function makeTempRoot() {
  return fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "aiml-frozen-plan-a-refresh-"
    )
  );
}

test(
  "frozen Plan A refresh isolates candidate writes from production Value and audit",
  async () => {
    const root =
      makeTempRoot();

    try {
      const productionValue =
        path.join(
          root,
          "production-value.json"
        );

      const productionAudit =
        path.join(
          root,
          "production-value-audit.json"
        );

      const frozenValueBytes =
        Buffer.from(
          "{\"count\":10,\"authority\":\"frozen\"}\n",
          "utf8"
        );

      const frozenAuditBytes =
        Buffer.from(
          "{\"ok\":true,\"count\":10,\"authority\":\"frozen\"}\n",
          "utf8"
        );

      fs.writeFileSync(
        productionValue,
        frozenValueBytes
      );

      fs.writeFileSync(
        productionAudit,
        frozenAuditBytes
      );

      let buildOptions = null;

      const result =
        await buildPlanARefreshCandidate(
          "2026-08-21",
          {
            observationPeriod: true,
            observationFileExists: true,
            existingObservation: {
              ok: true
            },
            tempRoot: root,
            buildValue:
              async (
                dayKey,
                options
              ) => {
                assert.equal(
                  dayKey,
                  "2026-08-21"
                );

                buildOptions = {
                  ...options
                };

                assert.equal(
                  options.rebuild,
                  true
                );

                assert.ok(
                  options.outputPath
                );

                assert.ok(
                  options.auditPath
                );

                assert.notEqual(
                  path.resolve(
                    options.outputPath
                  ),
                  path.resolve(
                    productionValue
                  )
                );

                assert.notEqual(
                  path.resolve(
                    options.auditPath
                  ),
                  path.resolve(
                    productionAudit
                  )
                );

                fs.writeFileSync(
                  options.outputPath,
                  "{\"count\":0,\"picks\":[]}\n",
                  "utf8"
                );

                fs.writeFileSync(
                  options.auditPath,
                  "{\"ok\":true,\"count\":0}\n",
                  "utf8"
                );

                return {
                  ok: true,
                  date: dayKey,
                  count: 0,
                  picks: []
                };
              }
          }
        );

      assert.equal(
        result.productionPreserved,
        true
      );

      assert.equal(
        result.candidateIsolated,
        true
      );

      assert.equal(
        result.planA.count,
        0
      );

      assert.deepEqual(
        fs.readFileSync(
          productionValue
        ),
        frozenValueBytes
      );

      assert.deepEqual(
        fs.readFileSync(
          productionAudit
        ),
        frozenAuditBytes
      );

      assert.equal(
        fs.existsSync(
          path.dirname(
            buildOptions.outputPath
          )
        ),
        false
      );
    } finally {
      fs.rmSync(
        root,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);

test(
  "before first Plan A freeze refresh keeps normal production build semantics",
  async () => {
    let optionsSeen = null;

    const result =
      await buildPlanARefreshCandidate(
        "2026-08-21",
        {
          observationPeriod: true,
          observationFileExists: false,
          existingObservation: {
            ok: false
          },
          buildValue:
            async (
              dayKey,
              options
            ) => {
              optionsSeen = {
                ...options
              };

              return {
                ok: true,
                date: dayKey,
                count: 2,
                picks: [
                  { matchId: "m1" },
                  { matchId: "m2" }
                ]
              };
            }
        }
      );

    assert.deepEqual(
      optionsSeen,
      {
        rebuild: true
      }
    );

    assert.equal(
      result.productionPreserved,
      false
    );

    assert.equal(
      result.candidateIsolated,
      false
    );

    assert.equal(
      result.planA.count,
      2
    );
  }
);

test(
  "invalid existing frozen Plan A fails closed before candidate build",
  async () => {
    let called = false;

    await assert.rejects(
      () =>
        buildPlanARefreshCandidate(
          "2026-08-21",
          {
            observationPeriod: true,
            observationFileExists: true,
            existingObservation: {
              ok: false,
              reason:
                "plan_a_observation_signature_mismatch"
            },
            buildValue:
              async () => {
                called = true;

                return {
                  ok: true,
                  count: 0,
                  picks: []
                };
              }
          }
        ),
      /invalid_existing_plan_a_observation_for_refresh_candidate/
    );

    assert.equal(
      called,
      false
    );
  }
);
