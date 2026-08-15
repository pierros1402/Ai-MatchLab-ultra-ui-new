import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  repairCanonicalNestedWritebackCoherenceRange
} from "./repair-canonical-nested-writeback-coherence-range.js";

function makeRoots() {
  const root =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        "step31-range-"
      )
    );

  const canonicalRoot =
    path.join(
      root,
      "canonical-fixtures"
    );

  const finalRoot =
    path.join(
      root,
      "final-results"
    );

  fs.mkdirSync(
    canonicalRoot,
    {
      recursive: true
    }
  );

  fs.mkdirSync(
    finalRoot,
    {
      recursive: true
    }
  );

  return {
    root,
    canonicalRoot,
    finalRoot
  };
}

test(
  "recognizes YYYY-MM-DD canonical directories and scans requested range",
  () => {
    const roots =
      makeRoots();

    try {
      const dayDir =
        path.join(
          roots.canonicalRoot,
          "2026-08-06"
        );

      fs.mkdirSync(
        dayDir,
        {
          recursive: true
        }
      );

      fs.writeFileSync(
        path.join(
          dayDir,
          "tst.1.json"
        ),
        JSON.stringify({
          leagueSlug:
            "tst.1",
          fixtures:
            []
        }),
        "utf8"
      );

      const report =
        repairCanonicalNestedWritebackCoherenceRange({
          from:
            "2026-08-06",
          to:
            "2026-08-06",
          write:
            false,
          canonicalRoot:
            roots.canonicalRoot,
          finalRoot:
            roots.finalRoot
        });

      assert.equal(
        report.daysScanned,
        1
      );

      assert.equal(
        report.filesScanned,
        1
      );

      assert.equal(
        report.rowsScanned,
        0
      );

      assert.equal(
        report.writeApplied,
        false
      );
    }
    finally {
      fs.rmSync(
        roots.root,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);

test(
  "fails closed when an explicit requested range selects zero canonical days",
  () => {
    const roots =
      makeRoots();

    try {
      assert.throws(
        () =>
          repairCanonicalNestedWritebackCoherenceRange({
            from:
              "2026-08-06",
            to:
              "2026-08-09",
            write:
              false,
            canonicalRoot:
              roots.canonicalRoot,
            finalRoot:
              roots.finalRoot
          }),
        /canonical_nested_writeback_repair_range_empty:2026-08-06:2026-08-09/u
      );
    }
    finally {
      fs.rmSync(
        roots.root,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);

test(
  "rejects malformed or reversed requested ranges",
  () => {
    const roots =
      makeRoots();

    try {
      assert.throws(
        () =>
          repairCanonicalNestedWritebackCoherenceRange({
            from:
              "2026/08/06",
            canonicalRoot:
              roots.canonicalRoot,
            finalRoot:
              roots.finalRoot
          }),
        /invalid_from_day/u
      );

      assert.throws(
        () =>
          repairCanonicalNestedWritebackCoherenceRange({
            from:
              "2026-08-09",
            to:
              "2026-08-06",
            canonicalRoot:
              roots.canonicalRoot,
            finalRoot:
              roots.finalRoot
          }),
        /invalid_day_range/u
      );
    }
    finally {
      fs.rmSync(
        roots.root,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);

test(
  "write mode emits parseable JSON with a real trailing newline",
  () => {
    const roots =
      makeRoots();

    try {
      const day =
        "2026-08-08";

      const dayDir =
        path.join(
          roots.canonicalRoot,
          day
        );

      fs.mkdirSync(
        dayDir,
        {
          recursive: true
        }
      );

      const file =
        path.join(
          dayDir,
          "tst.1.json"
        );

      const row = {
        canonicalId:
          "cid_test_home_away_20260808",
        matchId:
          "cid_test_home_away_20260808",
        dayKey:
          day,
        leagueSlug:
          "tst.1",
        source:
          "flashscore",
        sourceId:
          "FS1",
        homeTeam:
          "Home",
        awayTeam:
          "Away",
        kickoffUtc:
          "2026-08-08T18:00:00.000Z",
        status:
          "FT",
        statusType:
          "STATUS_FINAL",
        rawStatus:
          "STATUS_FINAL",
        operationalState:
          "TERMINAL_CONFIRMED",
        minute:
          "FT",
        scoreHome:
          1,
        scoreAway:
          0,
        authoritativeTerminalWriteback: {
          schema:
            "ai-matchlab.authoritative-terminal-writeback.v1",
          promotedAt:
            "2026-08-08T20:00:00.000Z",
          provider:
            "reconciled",
          providerMatchId:
            "FS1",
          dayKey:
            day,
          identityContract: {
            exactProviderId:
              true,
            athensDay:
              true,
            orderedTeamPair:
              true,
            explicitTerminalStatus:
              true,
            numericScore:
              true,
            heuristicIdentity:
              false
          },
          observation: {
            status:
              "STATUS_SCHEDULED",
            statusType:
              "STATUS_FINAL",
            rawStatus:
              "STATUS_SCHEDULED",
            scoreHome:
              1,
            scoreAway:
              0
          }
        }
      };

      fs.writeFileSync(
        file,
        JSON.stringify({
          leagueSlug:
            "tst.1",
          fixtures:
            [row]
        }),
        "utf8"
      );

      const report =
        repairCanonicalNestedWritebackCoherenceRange({
          from:
            day,
          to:
            day,
          write:
            true,
          repairedAt:
            "2026-08-14T18:00:00.000Z",
          canonicalRoot:
            roots.canonicalRoot,
          finalRoot:
            roots.finalRoot
        });

      assert.equal(
        report.repairedRows,
        1
      );

      assert.equal(
        report.filesWritten,
        1
      );

      assert.equal(
        report.writeApplied,
        true
      );

      const raw =
        fs.readFileSync(
          file,
          "utf8"
        );

      assert.doesNotThrow(
        () =>
          JSON.parse(
            raw
          )
      );

      assert.equal(
        raw.endsWith(
          "\n"
        ),
        true
      );

      assert.equal(
        raw.endsWith(
          "\\n"
        ),
        false
      );
    }
    finally {
      fs.rmSync(
        roots.root,
        {
          recursive:
            true,
          force:
            true
        }
      );
    }
  }
);
