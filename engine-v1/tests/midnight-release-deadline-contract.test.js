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

test("scheduled full publication is tomorrow-only and cannot consume midnight", () => {
  const workflow = read(".github/workflows/daily-deploy-snapshot.yml");

  assert.match(workflow, /P3\.1 atomic-midnight contract/);
  assert.match(workflow, /cron: "17 14,15,16,17,18,19,20 \* \* \*"/);
  assert.match(workflow, /DAY_KEY="\$\(TZ=Europe\/Athens date -d 'tomorrow' \+%F\)"/);
  assert.match(workflow, /ATHENS_TOTAL_MINUTES/);
  assert.match(workflow, /-lt 1050/);
  assert.match(workflow, /-gt 1330/);
  assert.match(workflow, /Final pre-midnight release refresh/);
  assert.doesNotMatch(workflow, /Early-morning catch-up/);
  assert.doesNotMatch(workflow, /catch-up TODAY/);
  assert.doesNotMatch(workflow, /ATHENS_HOUR_NUM" -le 5/);

  const cutoffMinutes = numberMatch(
    workflow,
    /ATHENS_TOTAL_MINUTES" -gt (\d+)/,
    "scheduled admission cutoff"
  );
  const timeoutMatch = workflow.match(
    /timeout-minutes:\s*\$\{\{\s*github\.event_name\s*==\s*'workflow_dispatch'\s*&&\s*(\d+)\s*\|\|\s*(\d+)\s*\}\}/
  );
  assert.ok(timeoutMatch, "missing event-scoped daily job timeout");
  const manualTimeoutMinutes = Number(timeoutMatch[1]);
  const timeoutMinutes = Number(timeoutMatch[2]);

  assert.equal(cutoffMinutes, 1330);
  assert.equal(manualTimeoutMinutes, 180);
  assert.equal(timeoutMinutes, 100);
  assert.ok(
    cutoffMinutes + timeoutMinutes < 1440,
    `scheduled publication may cross midnight: ${cutoffMinutes}+${timeoutMinutes}`
  );
  assert.equal(1440 - (cutoffMinutes + timeoutMinutes), 10);
});

test("duplicate early full builds self-skip but one final refresh remains admitted", () => {
  const workflow = read(".github/workflows/daily-deploy-snapshot.yml");

  assert.match(workflow, /LATEST_DAY=.*deploy-snapshots\/latest\.json/s);
  assert.match(
    workflow,
    /ATHENS_TOTAL_MINUTES" -lt 1245[^\n]*LATEST_DAY" = "\$DAY_KEY"/
  );
  assert.match(workflow, /already atomically published; skipping duplicate early full build/);
  assert.match(workflow, /ATHENS_TOTAL_MINUTES" -ge 1245/);
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
