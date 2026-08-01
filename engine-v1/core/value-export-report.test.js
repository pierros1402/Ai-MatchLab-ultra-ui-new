import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildValueExportReport,
  comparisonToValueExportDay,
  normalizeValueMarketSelection
} from "./value-export-report.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

function comparison(date, plans) {
  return { ok: true, date, plans };
}

function plan(picks) {
  const wins = picks.filter(pick => pick.result === "WIN").length;
  const losses = picks.filter(pick => pick.result === "LOSS").length;
  const unresolved = picks.filter(pick => !pick.result || pick.result === "UNRESOLVED").length;
  return {
    summary: { picks: picks.length, wins, losses, unresolved },
    picks
  };
}

function pick(id, result, market = "OU25", selection = "over") {
  return {
    matchId: id,
    canonicalMatchId: id,
    market,
    pick: selection,
    result
  };
}

test("range win rate is calculated from summed wins and losses, never daily percentage averages", () => {
  const first = comparisonToValueExportDay({
    date: "2026-07-01",
    comparison: comparison("2026-07-01", {
      A: plan([pick("one", "WIN")])
    })
  });
  const secondPicks = [
    ...Array.from({ length: 5 }, (_, index) => pick(`w-${index}`, "WIN")),
    ...Array.from({ length: 5 }, (_, index) => pick(`l-${index}`, "LOSS"))
  ];
  const second = comparisonToValueExportDay({
    date: "2026-07-02",
    comparison: comparison("2026-07-02", {
      A: plan(secondPicks)
    })
  });

  const report = buildValueExportReport({
    from: "2026-07-01",
    to: "2026-07-02",
    days: ["2026-07-01", "2026-07-02"],
    dayRecords: [first, second],
    today: "2026-08-01"
  });

  assert.equal(report.plans.A.daily[0].winRate, 1);
  assert.equal(report.plans.A.daily[1].winRate, 0.5);
  assert.equal(report.plans.A.range.picks, 11);
  assert.equal(report.plans.A.range.wins, 6);
  assert.equal(report.plans.A.range.losses, 5);
  assert.equal(report.plans.A.range.winRate, 0.5455);
  assert.notEqual(report.plans.A.range.winRate, 0.75);
});

test("four plans remain separate and unavailable historical plans are not converted to zero-pick observations", () => {
  const day = comparisonToValueExportDay({
    date: "2026-07-05",
    comparison: comparison("2026-07-05", {
      A: plan([pick("a", "WIN")]),
      B: plan([pick("b", "LOSS")])
    })
  });

  const report = buildValueExportReport({
    from: "2026-07-05",
    to: "2026-07-05",
    days: ["2026-07-05"],
    dayRecords: [day],
    today: "2026-08-01"
  });

  assert.deepEqual(report.planOrder, ["A", "A2", "B", "B2"]);
  assert.equal(report.plans.A.daily[0].status, "COMPLETE_WITH_PICKS");
  assert.equal(report.plans.A2.daily[0].status, "NOT_AVAILABLE");
  assert.equal(report.plans.A2.range.availableDays, 0);
  assert.equal(report.plans.A2.range.notAvailableDays, 1);
  assert.equal(report.plans.B2.daily[0].status, "NOT_AVAILABLE");
});

test("market breakdown normalizes equivalent market and selection spellings", () => {
  const day = comparisonToValueExportDay({
    date: "2026-07-31",
    comparison: comparison("2026-07-31", {
      B: plan([
        pick("one", "WIN", "OU25", "over"),
        pick("two", "LOSS", "Over / Under 2.5", "Over 2.5"),
        pick("three", "WIN", "BTTS", "yes")
      ])
    })
  });

  const report = buildValueExportReport({
    from: "2026-07-31",
    to: "2026-07-31",
    days: ["2026-07-31"],
    dayRecords: [day],
    today: "2026-08-01"
  });

  const over = report.plans.B.markets.find(row => row.selection === "Over 2.5");
  const btts = report.plans.B.markets.find(row => row.selection === "BTTS Yes");
  assert.equal(over.picks, 2);
  assert.equal(over.wins, 1);
  assert.equal(over.losses, 1);
  assert.equal(over.winRate, 0.5);
  assert.equal(btts.picks, 1);
  assert.equal(normalizeValueMarketSelection("1X2", "home").selectionLabel, "1");
});

test("31 July restored comparison produces exact four-plan settlement closure", () => {
  const comparisonPath = path.join(root, "data", "value-comparison", "2026-07-31.json");
  const payload = JSON.parse(fs.readFileSync(comparisonPath, "utf8"));
  const day = comparisonToValueExportDay({ date: "2026-07-31", comparison: payload });
  const report = buildValueExportReport({
    from: "2026-07-31",
    to: "2026-07-31",
    days: ["2026-07-31"],
    dayRecords: [day],
    today: "2026-08-01"
  });

  assert.deepEqual(
    Object.fromEntries(report.planOrder.map(key => [key, report.plans[key].range.picks])),
    { A: 6, A2: 0, B: 3, B2: 2 }
  );
  assert.deepEqual(
    Object.fromEntries(report.planOrder.map(key => [key, report.plans[key].range.wins])),
    { A: 4, A2: 0, B: 1, B2: 0 }
  );
  assert.deepEqual(
    Object.fromEntries(report.planOrder.map(key => [key, report.plans[key].range.losses])),
    { A: 2, A2: 0, B: 2, B2: 2 }
  );
  assert.equal(report.totalRows, 11);
  assert.equal(report.integrity.status, "COMPLETE");
});

test("unresolved picks on a closed day remain visible as an integrity issue", () => {
  const day = comparisonToValueExportDay({
    date: "2026-07-19",
    comparison: comparison("2026-07-19", {
      A: plan([pick("pending", "UNRESOLVED")])
    })
  });
  const report = buildValueExportReport({
    from: "2026-07-19",
    to: "2026-07-19",
    days: ["2026-07-19"],
    dayRecords: [day],
    today: "2026-08-01"
  });

  assert.equal(report.plans.A.range.unresolved, 1);
  assert.equal(report.integrity.status, "INCOMPLETE");
  assert.equal(report.integrity.issues[0].code, "VALUE_EXPORT_CLOSED_DAY_UNRESOLVED");
});
