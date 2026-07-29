import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  fileURLToPath
} from "node:url";

const here =
  path.dirname(
    fileURLToPath(
      import.meta.url
    )
  );

const cyclePath =
  path.resolve(
    here,
    "../jobs/run-daily-cycle.js"
  );

const source =
  fs.readFileSync(
    cyclePath,
    "utf8"
  );

test(
  "daily cycle imports the provider-neutral terminal promotion job",
  () => {
    assert.match(
      source,
      /import\s+\{\s*promoteAuthoritativeTerminalOverlaysDay\s*\}\s+from\s+"\.\/promote-authoritative-terminal-overlays-day\.js";/u
    );
  }
);

test(
  "terminal promotion runs before final detail rebuild and snapshot export",
  () => {
    const promotion =
      source.indexOf(
        "[daily-cycle] authoritative-terminal-promotion:start"
      );

    const details =
      source.indexOf(
        "[daily-cycle] final-details-sync:start"
      );

    const snapshot =
      source.indexOf(
        "[daily-cycle] deploy-snapshot-export:start"
      );

    assert.ok(
      promotion >= 0,
      "terminal promotion stage is missing"
    );

    assert.ok(
      details > promotion,
      "final details must run after terminal promotion"
    );

    assert.ok(
      snapshot > details,
      "snapshot export must run after final details"
    );
  }
);

test(
  "daily cycle enables canonical writeback instead of dry-run mode",
  () => {
    assert.match(
      source,
      /promoteAuthoritativeTerminalOverlaysDay\(\s*dayKey,\s*\{\s*write:\s*true\s*\}\s*\)/u
    );
  }
);


test(
  "current-day terminal promotion fails closed",
  () => {
    assert.match(
      source,
      /if\s*\(\s*authoritativeTerminalPromotion\?\.ok\s*!==\s*true\s*\)/u
    );

    assert.match(
      source,
      /AUTHORITATIVE_TERMINAL_PROMOTION_FAILED/u
    );
  }
);

test(
  "previous-day terminal promotion uses finalizeDayKey and write mode",
  () => {
    assert.match(
      source,
      /promoteAuthoritativeTerminalOverlaysDay\(\s*finalizeDayKey,\s*\{\s*write:\s*true\s*\}\s*\)/u
    );
  }
);

test(
  "previous-day terminal promotion runs before canonical sync, readiness and detail rebuild",
  () => {
    const truthSweep =
      source.indexOf(
        "[daily-cycle] finalize-results-truth-sweep:start"
      );

    const promotion =
      source.indexOf(
        "[daily-cycle] finalize-authoritative-terminal-promotion:start"
      );

    const canonicalSync =
      source.indexOf(
        "[daily-cycle] finalize-canonical-sync:start"
      );

    const readiness =
      source.indexOf(
        "[daily-cycle] finalization-readiness:start"
      );

    const detailRebuild =
      source.indexOf(
        "[daily-cycle] finalized-detail-rebuild:start"
      );

    const snapshotExport =
      source.indexOf(
        "[daily-cycle] finalized-deploy-snapshot-export:start"
      );

    assert.ok(
      truthSweep >= 0,
      "previous-day results-truth sweep is missing"
    );

    assert.ok(
      promotion > truthSweep,
      "previous-day promotion must run after results-truth sweep"
    );

    assert.ok(
      canonicalSync > promotion,
      "canonical sync must run after previous-day promotion"
    );

    assert.ok(
      readiness > canonicalSync,
      "readiness must run after canonical sync"
    );

    assert.ok(
      detailRebuild > readiness,
      "forced detail rebuild must run after readiness"
    );

    assert.ok(
      snapshotExport > detailRebuild,
      "previous-day snapshot export must run after detail rebuild"
    );
  }
);

test(
  "previous-day terminal promotion fails closed",
  () => {
    assert.match(
      source,
      /if\s*\(\s*finalizeAuthoritativeTerminalPromotion\?\.ok\s*!==\s*true\s*\)/u
    );

    assert.match(
      source,
      /FINALIZE_AUTHORITATIVE_TERMINAL_PROMOTION_FAILED/u
    );
  }
);
