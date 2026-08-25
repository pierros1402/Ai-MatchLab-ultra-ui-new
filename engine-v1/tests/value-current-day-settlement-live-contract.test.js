import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");

function read(relativePath) {
  return fs.readFileSync(
    path.join(ROOT, relativePath),
    "utf8"
  );
}

test("current-day settlement checkpoint precedes downstream Value gates", () => {
  const workflow = read(
    ".github/workflows/intraday-deploy-snapshot-refresh.yml"
  );

  const truthCheckpoint = workflow.indexOf(
    "Persist authoritative intraday truth checkpoint"
  );

  const settlement = workflow.indexOf(
    "Checkpoint current Value settlement independently"
  );

  const promotion = workflow.indexOf(
    "Promote current Value settlement comparison"
  );

  const intradayRefresh = workflow.indexOf(
    "Run intraday snapshot refresh"
  );

  assert.ok(truthCheckpoint >= 0);
  assert.ok(settlement > truthCheckpoint);
  assert.ok(promotion > settlement);
  assert.ok(intradayRefresh > promotion);

  assert.match(
    workflow,
    /Persist current Value settlement checkpoint for \$\{DAY_KEY\}/
  );

  assert.match(
    workflow,
    /VALUE_SETTLEMENT_PUBLISHED_REF/
  );

  assert.match(
    workflow,
    /VALUE_SETTLEMENT_PUSHED=true/
  );
});

test("current-day settlement has comparison-only publication", () => {
  const workflow = read(
    ".github/workflows/intraday-deploy-snapshot-refresh.yml"
  );

  const start = workflow.indexOf(
    "- name: Checkpoint current Value settlement independently"
  );

  const end = workflow.indexOf(
    "- name: Run intraday snapshot refresh"
  );

  assert.ok(start >= 0);
  assert.ok(end > start);

  const block = workflow.slice(start, end);

  assert.match(
    block,
    /export-verified-final-results-day\.js/
  );

  assert.match(
    block,
    /build-value-plan-comparison-day\.js/
  );

  assert.match(
    block,
    /sync-public-value-comparison\.mjs/
  );

  assert.doesNotMatch(
    block,
    /sync-public-snapshot\.sh/
  );
});

test("comparison rows distinguish verified final from display-only worker FT", () => {
  const valuePicks =
    read("assets/js/ui/value-picks.js");

  const overlay =
    read("assets/js/live/live-overlay.js");

  assert.match(
    valuePicks,
    /const hasVerifiedFinal = Boolean\(p\?\.finalScore\?\.scoreKey\);/
  );

  assert.match(
    valuePicks,
    /data-verified-final/
  );

  assert.match(
    overlay,
    /row\.getAttribute\("data-verified-final"\) === "true"/
  );

  const start =
    overlay.indexOf("function patchValueRows");

  const end =
    overlay.indexOf("function scheduleValuePatch");

  assert.ok(start >= 0);
  assert.ok(end > start);

  const block =
    overlay.slice(start, end);

  assert.doesNotMatch(
    block,
    /\.result\s*=/
  );
});

test("unsettled plan does not display a false zero-percent hit rate", () => {
  const source =
    read("assets/js/ui/value-picks.js");

  assert.match(
    source,
    /value === null \|\| value === undefined \|\| value === ""/
  );
});

test("VOID settlement is represented explicitly", () => {
  const source =
    read("assets/js/ui/value-picks.js");

  assert.match(
    source,
    /r === "VOID"/
  );

  assert.match(
    source,
    />VOID<\/span>/
  );
});

test("worker requires a complete score before AB=3 becomes played FT", () => {
  const source =
    read("workers/live-worker.js");

  assert.match(
    source,
    /ab === "3" && hasScore/
  );

  assert.match(
    source,
    /if \(ab === "3"\) return "STALE_LIVE";/
  );

  assert.doesNotMatch(
    source,
    /if \(ab === "3"\) return "FT";/
  );

  assert.match(
    source,
    /minute:\s*null/
  );

  assert.match(
    source,
    /minuteSource:\s*"unavailable"/
  );
});

test("updated Value/live UI assets are cache-busted", () => {
  const html =
    read("index.html");

  assert.match(
    html,
    /live-overlay\.js\?v=9/
  );

  assert.match(
    html,
    /value-picks\.js\?v=4/
  );
});
