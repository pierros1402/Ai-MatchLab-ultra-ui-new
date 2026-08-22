import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const sourcePath = path.join(root, "assets", "js", "ui", "date-nav.js");
const source = fs.readFileSync(sourcePath, "utf8");

test("Today label is bound to calendar day, not published data day", () => {
  assert.match(source, /getCalendarDay/);
  assert.match(source, /getPublishedDay/);
  assert.match(source, /let today = calendarDay\(\)/);
  assert.match(source, /let releaseDay = publishedDay\(\)/);
  assert.match(source, /const isToday = day === today/);
  assert.match(source, /const label = isToday \? "Today"/);
});

test("pending calendar Today cannot open an unverified partial release", () => {
  assert.match(source, /function releasePending\(\)/);
  assert.match(source, /releaseDay !== today/);
  assert.match(source, /isPendingToday \? " disabled aria-disabled/);
  assert.match(source, /if \(releasePending\(\)\) return;/);
  assert.match(source, /showing last complete/);
});

test("calendar rollover and publication rollover remain separate events", () => {
  assert.match(source, /addEventListener\("calendar-day:change"/);
  assert.match(source, /adoptCalendarDay/);
  assert.match(source, /addEventListener\("operational-day:change"/);
  assert.match(source, /adoptPublishedDay/);
});

test("automatic Today following serves the verified published day until promotion", () => {
  assert.match(source, /publishDataSelection\(releaseDay, \{ followingToday: true \}\)/);
  assert.match(source, /dataDate: activeDate/);
  assert.match(source, /publishedDay: releaseDay/);
  assert.match(source, /releasePending: releasePending\(\)/);
});
