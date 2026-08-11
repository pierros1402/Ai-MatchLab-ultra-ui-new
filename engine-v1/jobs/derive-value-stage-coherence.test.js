import test from "node:test";
import assert from "node:assert/strict";

import {
  assessModelStageCoherence,
  evaluateOU25,
  strictValuePolicyRejectionReason,
} from "./derive-value-from-odds.js";

function nacionalBoston(stageCoherence) {
  return {
    canonicalId:
      "cid_uru1_nacional_bostonriver_20260810",
    matchId:
      "cid_uru1_nacional_bostonriver_20260810",
    leagueSlug:
      "uru.1",
    competition:
      "Liga AUF Uruguaya - Clausura",
    home:
      "Nacional",
    away:
      "Boston River",
    kickoffUtc:
      "2026-08-09T21:30:00.000Z",
    aiAssessment: {
      model: {
        formUsed: true,
        homeFormSample: 6,
        awayFormSample: 6,
        source:
          "ai_poisson_standings_plus_form",
        stageCoherence,
      },
      markets: {
        OU25: {
          probs: {
            over: 0.202,
            under: 0.798,
          },
        },
      },
    },
  };
}

test("Clausura 6+6 generic form is rejected without stage provenance", () => {
  const match =
    nacionalBoston(undefined);

  const coherence =
    assessModelStageCoherence(match);

  assert.equal(coherence.required, true);
  assert.equal(coherence.requiredStage, "clausura");
  assert.equal(coherence.ok, false);

  const candidates =
    evaluateOU25(match);

  const under =
    candidates.find(
      row =>
        row.market === "OU25" &&
        row.pick === "under"
    );

  assert.ok(under);

  assert.ok(
    under.flags.includes(
      "stage_coherence_unproven"
    )
  );

  assert.equal(
    strictValuePolicyRejectionReason({ ...under, leagueSlug: match.leagueSlug }),
    "stage_coherence_unproven"
  );
});

test("form-stage proof alone cannot bypass missing standings-stage proof", () => {
  const match =
    nacionalBoston({
      status: "proven",
      requiredStage: "clausura",
      formStage: "clausura",
      standingsStage: null,
      kickoffBound: true,
    });

  const coherence =
    assessModelStageCoherence(match);

  assert.equal(coherence.ok, false);

  const under =
    evaluateOU25(match)
      .find(
        row =>
          row.market === "OU25" &&
          row.pick === "under"
      );

  assert.ok(under);

  assert.equal(
    strictValuePolicyRejectionReason({ ...under, leagueSlug: match.leagueSlug }),
    "stage_coherence_unproven"
  );
});

test("explicit stage can pass only with matching form and standings provenance before kickoff", () => {
  const match =
    nacionalBoston({
      status: "proven",
      requiredStage: "clausura",
      formStage: "clausura",
      standingsStage: "clausura",
      kickoffBound: true,
    });

  const coherence =
    assessModelStageCoherence(match);

  assert.equal(coherence.ok, true);

  const under =
    evaluateOU25(match)
      .find(
        row =>
          row.market === "OU25" &&
          row.pick === "under"
      );

  assert.ok(under);

  assert.equal(
    under.flags.includes(
      "stage_coherence_unproven"
    ),
    false
  );

  assert.equal(
    strictValuePolicyRejectionReason({ ...under, leagueSlug: match.leagueSlug }),
    null
  );
});

test("ordinary non-phased competition preserves existing Value behavior", () => {
  const match =
    nacionalBoston(undefined);

  match.competition =
    "Premier League";

  const coherence =
    assessModelStageCoherence(match);

  assert.equal(coherence.required, false);
  assert.equal(coherence.ok, true);

  const under =
    evaluateOU25(match)
      .find(
        row =>
          row.market === "OU25" &&
          row.pick === "under"
      );

  assert.ok(under);

  assert.equal(
    under.flags.includes(
      "stage_coherence_unproven"
    ),
    false
  );

  assert.equal(
    strictValuePolicyRejectionReason({ ...under, leagueSlug: match.leagueSlug }),
    null
  );
});
