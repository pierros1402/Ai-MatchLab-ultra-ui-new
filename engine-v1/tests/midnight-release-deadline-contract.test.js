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

test("scheduled full publication is tomorrow-only and has a bounded admission window", () => {
  const workflow = read(".github/workflows/daily-deploy-snapshot.yml");
  const admission = read("engine-v1/value/daily-plan-a-checkpoint.js");

  assert.match(workflow, /cron: "0 15 \* \* \*"/);
  assert.match(workflow, /DAY_KEY="\$\(TZ=Europe\/Athens date -d 'tomorrow' \+%F\)"/);
  assert.match(workflow, /ATHENS_TOTAL_MINUTES" -lt 1020/);
  const cutoff = numberMatch(workflow, /ATHENS_TOTAL_MINUTES" -gt (\d+)/, "scheduled admission cutoff");
  const timeout = numberMatch(workflow, /timeout-minutes:\s*(\d+)/, "daily job timeout");
  assert.equal(cutoff, 1130);
  assert.equal(timeout, 300);
  assert.equal(cutoff + timeout, 1430);
  assert.ok(cutoff + timeout < 1440);
  assert.match(admission, /minuteOfDay \+ budgetMinutes <= 1430/);
  assert.match(workflow, /dailyPublicationAdmission\(process\.env\.DAY_KEY\)/);
  assert.match(workflow, /if \(!admission\.admitted\)/);
  assert.doesNotMatch(workflow, /Early-morning catch-up|catch-up TODAY/);
});

test("duplicate tomorrow publication skips under the admitted early window", () => {
  const workflow = read(".github/workflows/daily-deploy-snapshot.yml");
  assert.match(workflow, /LATEST_DAY=.*deploy-snapshots\/latest\.json/s);
  assert.match(workflow, /if \[ "\$LATEST_DAY" = "\$DAY_KEY" \]; then/);
  assert.match(workflow, /skipping duplicate early full build/);
  assert.match(workflow, /SKIP_BUILD=true/);
  assert.doesNotMatch(workflow, /ATHENS_TOTAL_MINUTES" -ge 1245/);
  // Day-key equality is only a duplicate signal. It does not independently
  // certify snapshot manifest consistency or public byte-level readback.
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
