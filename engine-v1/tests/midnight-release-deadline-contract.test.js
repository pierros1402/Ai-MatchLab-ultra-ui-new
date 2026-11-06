import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

function numberMatch(text, pattern, label) {
  const match = text.match(pattern);
  assert.ok(match, `missing ${label}`);
  return Number(match[1]);
}

test("scheduled release is tomorrow-only and admitted within the midnight budget", () => {
  const workflow = read(".github/workflows/daily-deploy-snapshot.yml");

  assert.ok(workflow.includes('cron: "0 15 * * *"'));
  assert.ok(workflow.includes(
    "DAY_KEY=\"$(TZ=Europe/Athens date -d 'tomorrow' +%F)\""
  ));
  assert.ok(workflow.includes("ATHENS_TOTAL_MINUTES"));
  assert.ok(workflow.includes("DAILY_PUBLICATION_OUTCOME=MISSED_ADMISSION_WINDOW"));
  assert.ok(workflow.includes("timeout-minutes: 300"));

  const lower = numberMatch(
    workflow,
    /ATHENS_TOTAL_MINUTES" -lt (\d+)/,
    "admission opening"
  );
  const upper = numberMatch(
    workflow,
    /ATHENS_TOTAL_MINUTES" -gt (\d+)/,
    "admission closing"
  );

  assert.equal(lower, 1020);
  assert.equal(upper, 1130);
  assert.equal(1440 - (upper + 300), 10);
  assert.ok(upper + 300 < 1440);
  assert.doesNotMatch(workflow, /Final pre-midnight release refresh/);
});

test("published tomorrow is not rebuilt and late refresh is unreachable", () => {
  const workflow = read(".github/workflows/daily-deploy-snapshot.yml");

  assert.match(workflow, /LATEST_DAY=.*deploy-snapshots\/latest\.json/s);
  assert.ok(workflow.includes(
    'if [ "$LATEST_DAY" = "$DAY_KEY" ]; then'
  ));
  assert.ok(workflow.includes("skipBuild=true"));
  assert.ok(workflow.includes(
    "already atomically published; skipping duplicate early full build"
  ));
  assert.ok(workflow.includes("Admitted full release build"));
  assert.doesNotMatch(workflow, /ATHENS_TOTAL_MINUTES" -ge 1245/);
});

test("autonomous work is same-day maintenance at 16 Athens, not rollover publication", () => {
  const workflow = read(".github/workflows/daily-autonomous.yml");

  assert.match(workflow, /SAME-DAY maintenance run \(~16:00 Europe\/Athens\)/);
  assert.match(workflow, /NOT a midnight\/day-rollover/);
  assert.match(workflow, /cron: "0 13,14 \* \* \*"/);
  assert.match(workflow, /ATHENS_HOUR_NUM" -ne 16/);
  assert.match(workflow, /timeout-minutes:\s*30/);
});

test("UI day authority is a verified published release, never clock-only rollover", () => {
  const authority = read("assets/js/live/operational-day.js");

  assert.match(authority, /Atomic publication authority for the UI day/);
  assert.match(authority, /calendarDay = Europe\/Athens calendar date/);
  assert.match(authority, /newest VERIFIED published release that is not in the future/);
  assert.match(authority, /deploy-snapshot\/latest\?_t=/);
  assert.match(authority, /releaseMatchesLatest/);
  assert.match(authority, /compareDay\(verifiedDay, nextCalendarDay\) <= 0/);
  assert.match(authority, /Network\/engine failure must NOT roll the day forward/);
  assert.doesNotMatch(authority, /state\.day\s*=\s*nextCalendarDay\s*;/);
});
