import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const source = fs
  .readFileSync(
    fileURLToPath(
      new URL("./run-daily-cycle.js", import.meta.url)
    ),
    "utf8"
  )
  .replace(/\r\n/g, "\n");

test(
  "daily cycle closes standings and model-priors foundations after history mutation",
  () => {
    const catchUp = source.indexOf(
      "history-catch-up:done"
    );
    const h2h = source.indexOf(
      "h2h-foundation-rebuild:start"
    );
    const standings = source.indexOf(
      "final-standings-foundation:start"
    );
    const priors = source.indexOf(
      "final-model-priors-foundation:start"
    );
    const finished = source.indexOf(
      "const finishedAt = Date.now()"
    );

    assert.ok(catchUp >= 0);
    assert.ok(h2h > catchUp);
    assert.ok(standings > h2h);
    assert.ok(priors > standings);
    assert.ok(finished > priors);

    assert.match(
      source,
      /buildStandingsDay\(\s*dayKey,\s*\[\],\s*\{ season: finalFoundationSeason \}/u
    );
    assert.match(
      source,
      /auditStandingsFoundation\(\{\s*season: finalFoundationSeason/u
    );
    assert.match(
      source,
      /buildModelPriors\(\{\s*targetSeason: finalFoundationSeason/u
    );
    assert.match(
      source,
      /validateModelPriorsFoundationSync\(finalFoundationSeason\)/u
    );
  }
);

test(
  "daily cycle fails closed when either final foundation remains invalid",
  () => {
    assert.match(
      source,
      /final_standings_foundation_not_ready/u
    );
    assert.match(
      source,
      /FINAL_STANDINGS_FOUNDATION_NOT_READY/u
    );
    assert.match(
      source,
      /final_model_priors_foundation_not_ready/u
    );
    assert.match(
      source,
      /FINAL_MODEL_PRIORS_FOUNDATION_NOT_READY/u
    );
  }
);
