import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  fileURLToPath
} from "node:url";

import {
  resolveCanonicalFlashscoreFinalFallback,
  buildCanonicalFlashscoreVerifiedFinalResult
} from "./export-verified-final-results-day.js";

const ROOT =
  path.resolve(
    path.dirname(
      fileURLToPath(
        import.meta.url
      )
    ),
    "..",
    ".."
  );

const DAY =
  "2026-07-23";

const EXPECTED_TERMINAL_IDS = [
  "cid_usa2_lexington_oaklandroots_20260723",
  "cid_usa1_philadelphiaunion_newyorkredbulls_20260723",
  "cid_usa1_charlotte_atlantautd_20260723",
  "cid_usa2_coloradosprings_miami_20260723",
  "cid_usa1_losangeles_realsaltlake_20260723",
  "cid_usa1_losangelesgalaxy_stlouiscity_20260723",
  "cid_kaz2_akademiyaontustik_astana2_20260723",
  "cid_kaz2_jaiyq_khantengri_20260723",
  "cid_kaz2_kaspijaktau2_batyr_20260723",
  "cid_yem1_albaydaa_alittihad_20260723",
  "cid_yem1_alsadd_mukallah_20260723",
  "cid_zim1_agama_hardrock_20260723",
  "cid_zim1_capsutd_hunters_20260723",
  "cid_zim1_triangle_ngeziplatinum_20260723"
];

const SYNTHETIC_SCHEDULED_CONTROL_ID =
  "cid_test_flashscore_scheduled_20260723";

function loadCanonicalRows() {
  const directory =
    path.join(
      ROOT,
      "data",
      "canonical-fixtures",
      DAY
    );

  const rows = [];

  for (
    const name of
    fs.readdirSync(directory)
      .filter(name =>
        name.endsWith(".json")
      )
      .sort()
  ) {
    const payload =
      JSON.parse(
        fs.readFileSync(
          path.join(
            directory,
            name
          ),
          "utf8"
        )
      );

    if (
      Array.isArray(
        payload?.fixtures
      )
    ) {
      rows.push(
        ...payload.fixtures
      );
    }
  }

  return rows;
}

function targetOf(row) {
  return {
    matchId:
      row.canonicalId,

    leagueSlug:
      row.leagueSlug,

    leagueName:
      row.leagueName,

    country:
      row.country || "",

    homeTeam:
      row.homeTeam,

    awayTeam:
      row.awayTeam,

    kickoffUtc:
      row.kickoffUtc,

    canonicalFixture:
      row
  };
}

test(
  "strict canonical Flashscore fallback accepts all 14 known terminal gaps",
  () => {
    const rows =
      loadCanonicalRows();

    const byId =
      new Map(
        rows.map(row => [
          row.canonicalId,
          row
        ])
      );

    const failures = [];

    for (const id of EXPECTED_TERMINAL_IDS) {
      const row =
        byId.get(id);

      assert.ok(
        row,
        `missing canonical row: ${id}`
      );

      const resolved =
        resolveCanonicalFlashscoreFinalFallback(
          targetOf(row),
          DAY
        );

      if (!resolved.ok) {
        failures.push({
          id,
          reason:
            resolved.reason
        });
      }
    }

    assert.deepEqual(
      failures,
      []
    );
  }
);

test(
  "synthetic scheduled Flashscore control remains unresolved",
  () => {
    const rows =
      loadCanonicalRows();

    const terminalBase =
      rows.find(candidate =>
        candidate.canonicalId ===
        EXPECTED_TERMINAL_IDS[0]
      );

    assert.ok(
      terminalBase,
      "terminal Flashscore fixture required for synthetic control"
    );

    const row = {
      ...terminalBase,

      canonicalId:
        SYNTHETIC_SCHEDULED_CONTROL_ID,

      status:
        "STATUS_SCHEDULED",

      rawStatus:
        "STATUS_SCHEDULED",

      statusType:
        "STATUS_SCHEDULED",

      operationalState:
        "PRE",

      scoreHome: null,
      scoreAway: null,
      homeScore: null,
      awayScore: null,
      finalScore: null,
      minute: null
    };

    const resolved =
      resolveCanonicalFlashscoreFinalFallback(
        targetOf(row),
        DAY
      );

    assert.equal(
      resolved.ok,
      false
    );

    assert.equal(
      resolved.reason,
      "canonical_flashscore_status_not_terminal"
    );
  }
);

test(
  "canonical Flashscore fallback creates settlement-compatible verified truth",
  () => {
    const row =
      loadCanonicalRows()
        .find(candidate =>
          candidate.canonicalId ===
          "cid_usa2_lexington_oaklandroots_20260723"
        );

    assert.ok(row);

    const target =
      targetOf(row);

    const resolved =
      resolveCanonicalFlashscoreFinalFallback(
        target,
        DAY
      );

    assert.equal(
      resolved.ok,
      true
    );

    const payload =
      buildCanonicalFlashscoreVerifiedFinalResult(
        DAY,
        target,
        resolved
      );

    assert.equal(
      payload.verifiedFinalTruth,
      true
    );

    assert.equal(
      payload.source,
      "canonical_flashscore_terminal_final"
    );

    assert.equal(
      payload.sources[0].provider,
      "flashscore"
    );

    assert.equal(
      payload.sources[0].providerMatchId,
      row.sourceId
    );

    assert.equal(
      payload.scoreKey,
      "2-0"
    );
  }
);

test(
  "canonical Flashscore fallback rejects inferred or incomplete finals",
  () => {
    const base = {
      canonicalId:
        "cid_test_home_away_20260723",

      source:
        "flashscore",

      sourceId:
        "ABC12345",

      sourceMatchId:
        "ABC12345",

      leagueSlug:
        "test.1",

      leagueName:
        "Test League",

      dayKey:
        DAY,

      kickoffUtc:
        "2026-07-23T12:00:00.000Z",

      homeTeam:
        "Home",

      awayTeam:
        "Away",

      scoreHome: 2,
      scoreAway: 1,

      status: "FT",
      rawStatus:
        "STATUS_FINAL",

      statusType:
        "STATUS_FINAL",

      lastSeenAt:
        "2026-07-23T15:00:00.000Z"
    };

    const target = {
      matchId:
        base.canonicalId,

      leagueSlug:
        base.leagueSlug,

      leagueName:
        base.leagueName,

      homeTeam:
        base.homeTeam,

      awayTeam:
        base.awayTeam,

      kickoffUtc:
        base.kickoffUtc,

      canonicalFixture:
        base
    };

    assert.equal(
      resolveCanonicalFlashscoreFinalFallback(
        {
          ...target,
          canonicalFixture: {
            ...base,
            rawStatus:
              "STATUS_SCHEDULED",
            statusType:
              "STATUS_SCHEDULED"
          }
        },
        DAY
      ).ok,
      false
    );

    assert.equal(
      resolveCanonicalFlashscoreFinalFallback(
        {
          ...target,
          canonicalFixture: {
            ...base,
            scoreAway: null
          }
        },
        DAY
      ).ok,
      false
    );

    assert.equal(
      resolveCanonicalFlashscoreFinalFallback(
        {
          ...target,
          canonicalFixture: {
            ...base,
            sourceId: "",
            sourceMatchId: ""
          }
        },
        DAY
      ).ok,
      false
    );
  }
);
