export const VALUE_EXPORT_PLAN_ORDER = Object.freeze([
  Object.freeze({ key: "A", id: "plan-a", label: "Plan A" }),
  Object.freeze({ key: "A2", id: "plan-a2", label: "Plan A2" }),
  Object.freeze({ key: "B", id: "plan-b", label: "Plan B" }),
  Object.freeze({ key: "B2", id: "plan-b2", label: "Plan B2" })
]);

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clean(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

export function normalizeValueSettlement(value) {
  const normalized = upper(value).replace(/[\s-]+/gu, "_");

  if (["WIN", "WON"].includes(normalized)) return "WIN";
  if (["LOSS", "LOST"].includes(normalized)) return "LOSS";
  if (["VOID", "PUSH", "PUSHED"].includes(normalized)) return "VOID";
  if (["UNSUPPORTED", "NOT_SUPPORTED"].includes(normalized)) return "UNSUPPORTED";
  if (["UNRESOLVED", "PENDING", "UNSETTLED", ""].includes(normalized)) {
    return "UNRESOLVED";
  }

  return "UNSUPPORTED";
}

export function normalizeValueMarketSelection(marketValue, pickValue) {
  const market = clean(marketValue);
  const pick = clean(pickValue);
  const marketKey = upper(market).replace(/[^A-Z0-9]+/gu, "");
  const pickKey = upper(pick).replace(/[^A-Z0-9]+/gu, "");

  const goalLine =
    marketKey === "OU15" || marketKey.includes("UNDER15") ? "1.5" :
      marketKey === "OU25" || marketKey.includes("UNDER25") ? "2.5" :
        marketKey === "OU35" || marketKey.includes("UNDER35") ? "3.5" : null;

  if (goalLine) {
    const selection = pickKey.includes("UNDER") ? `Under ${goalLine}` : `Over ${goalLine}`;
    return {
      marketKey: `OU${goalLine.replace(".", "")}`,
      marketLabel: `Over / Under ${goalLine}`,
      selectionKey: selection.toUpperCase().replace(/[^A-Z0-9]+/gu, "_"),
      selectionLabel: selection
    };
  }

  if (marketKey === "BTTS" || marketKey.includes("BOTHTEAMSTOSCORE")) {
    const yes = !pickKey.includes("NO");
    return {
      marketKey: "BTTS",
      marketLabel: "BTTS",
      selectionKey: yes ? "YES" : "NO",
      selectionLabel: yes ? "BTTS Yes" : "BTTS No"
    };
  }

  if (marketKey === "1X2") {
    const selection =
      ["1", "HOME"].includes(pickKey) ? "1" :
        ["X", "DRAW"].includes(pickKey) ? "X" :
          ["2", "AWAY"].includes(pickKey) ? "2" : (pick || "Unknown");

    return {
      marketKey: "1X2",
      marketLabel: "1X2",
      selectionKey: upper(selection),
      selectionLabel: selection
    };
  }

  if (marketKey === "DC" || marketKey.includes("DOUBLECHANCE")) {
    const selection = ["1X", "X2", "12"].includes(pickKey) ? pickKey : (pick || "Unknown");
    return {
      marketKey: "DC",
      marketLabel: "Double Chance",
      selectionKey: upper(selection),
      selectionLabel: selection
    };
  }

  return {
    marketKey: marketKey || "UNKNOWN",
    marketLabel: market || "Unknown",
    selectionKey: pickKey || "UNKNOWN",
    selectionLabel: pick || "Unknown"
  };
}

function scoreKey(value) {
  if (!value || typeof value !== "object") return null;
  if (clean(value.scoreKey)) return clean(value.scoreKey);
  const home = finiteNumber(value.homeScore);
  const away = finiteNumber(value.awayScore);
  return home === null || away === null ? null : `${home}-${away}`;
}

function normalizePickRow(date, plan, source, pick) {
  const market = normalizeValueMarketSelection(pick?.market ?? pick?.marketName, pick?.pick);
  const result = normalizeValueSettlement(pick?.result ?? pick?.settlement);
  const canonicalMatchId = clean(pick?.canonicalMatchId || pick?.canonicalId || pick?.matchId) || null;

  return {
    date,
    planKey: plan.key,
    planId: clean(pick?.planId) || plan.id,
    planLabel: plan.label,
    canonicalMatchId,
    matchId: clean(pick?.matchId) || canonicalMatchId,
    kickoff: pick?.kickoff ?? null,
    country: clean(pick?.country) || null,
    leagueSlug: clean(pick?.leagueSlug) || null,
    leagueName: clean(pick?.leagueName) || null,
    homeTeam: clean(pick?.homeTeam) || null,
    awayTeam: clean(pick?.awayTeam) || null,
    market: clean(pick?.market ?? pick?.marketName) || null,
    pick: clean(pick?.pick) || null,
    marketKey: market.marketKey,
    marketLabel: market.marketLabel,
    selectionKey: market.selectionKey,
    selectionLabel: market.selectionLabel,
    score: finiteNumber(pick?.score),
    confidence: finiteNumber(pick?.confidence) ?? pick?.confidence ?? null,
    readiness: finiteNumber(pick?.readiness),
    marketProb: finiteNumber(pick?.marketProb),
    aiFairOdds: finiteNumber(pick?.aiFairOdds),
    oddsDecimal: finiteNumber(pick?.oddsDecimal ?? pick?.exportOdds),
    finalScore: scoreKey(pick?.finalScore),
    finalStatus: clean(pick?.finalStatus) || null,
    result,
    source: clean(source) || null
  };
}

export function comparisonToValueExportDay({ date, comparison, source = "value_comparison" }) {
  const plans = {};
  const sourcePlans = comparison?.plans && typeof comparison.plans === "object"
    ? comparison.plans
    : {};

  for (const plan of VALUE_EXPORT_PLAN_ORDER) {
    const rawPlan = Object.prototype.hasOwnProperty.call(sourcePlans, plan.key)
      ? sourcePlans[plan.key]
      : undefined;
    const available = rawPlan !== undefined && rawPlan !== null && typeof rawPlan === "object";
    const rawPicks = available && Array.isArray(rawPlan.picks) ? rawPlan.picks : [];

    plans[plan.key] = {
      ...plan,
      available,
      source,
      declaredSummary: available && rawPlan.summary && typeof rawPlan.summary === "object"
        ? rawPlan.summary
        : null,
      picks: rawPicks.map(pick => normalizePickRow(date, plan, source, pick))
    };
  }

  return { date, source, plans };
}

export function fallbackPlanAToValueExportDay({ date, picks = [], source = "snapshot_value" }) {
  const plans = {};

  for (const plan of VALUE_EXPORT_PLAN_ORDER) {
    const available = plan.key === "A";
    plans[plan.key] = {
      ...plan,
      available,
      source,
      declaredSummary: null,
      picks: available
        ? picks.filter(pick => pick && typeof pick === "object")
          .map(pick => normalizePickRow(date, plan, source, pick))
        : []
    };
  }

  return { date, source, plans };
}

function emptyCounts() {
  return {
    picks: 0,
    wins: 0,
    losses: 0,
    voids: 0,
    unresolved: 0,
    unsupported: 0,
    winRate: null
  };
}

function finalizeCounts(counts) {
  const decided = counts.wins + counts.losses;
  return {
    ...counts,
    winRate: decided > 0 ? Number((counts.wins / decided).toFixed(4)) : null
  };
}

export function summarizeValueRows(rows) {
  const counts = emptyCounts();

  for (const row of rows) {
    counts.picks += 1;
    if (row.result === "WIN") counts.wins += 1;
    else if (row.result === "LOSS") counts.losses += 1;
    else if (row.result === "VOID") counts.voids += 1;
    else if (row.result === "UNSUPPORTED") counts.unsupported += 1;
    else counts.unresolved += 1;
  }

  return finalizeCounts(counts);
}

function addCounts(target, source) {
  for (const key of ["picks", "wins", "losses", "voids", "unresolved", "unsupported"]) {
    target[key] += Number(source?.[key] || 0);
  }
}

function planDayStatus(available, summary) {
  if (!available) return "NOT_AVAILABLE";
  if (summary.unresolved > 0 || summary.unsupported > 0) return "INCOMPLETE";
  return summary.picks > 0 ? "COMPLETE_WITH_PICKS" : "COMPLETE_ZERO_PICKS";
}

function duplicateKey(row) {
  return [
    row.canonicalMatchId || row.matchId || "missing_match",
    row.marketKey,
    row.selectionKey
  ].join("|");
}

function declaredCount(summary, key) {
  const value = finiteNumber(summary?.[key]);
  return value === null ? null : value;
}

function marketBreakdown(rows) {
  const groups = new Map();

  for (const row of rows) {
    const key = `${row.marketKey}|${row.selectionKey}`;
    if (!groups.has(key)) {
      groups.set(key, {
        marketKey: row.marketKey,
        market: row.marketLabel,
        selectionKey: row.selectionKey,
        selection: row.selectionLabel,
        rows: []
      });
    }
    groups.get(key).rows.push(row);
  }

  return [...groups.values()]
    .map(group => ({
      marketKey: group.marketKey,
      market: group.market,
      selectionKey: group.selectionKey,
      selection: group.selection,
      ...summarizeValueRows(group.rows)
    }))
    .sort((a, b) =>
      a.market.localeCompare(b.market) || a.selection.localeCompare(b.selection)
    );
}

export function buildValueExportReport({ from, to, days, dayRecords, today }) {
  const recordsByDay = new Map(dayRecords.map(record => [record.date, record]));
  const integrity = {
    status: "COMPLETE",
    issues: [],
    missingDays: [],
    unresolvedClosedDays: [],
    unsupportedRows: [],
    duplicatePicks: [],
    countMismatches: []
  };
  const plans = {};
  let totalRows = 0;

  for (const plan of VALUE_EXPORT_PLAN_ORDER) {
    const picks = [];
    const daily = [];
    const rangeCounts = emptyCounts();
    let availableDays = 0;
    let notAvailableDays = 0;

    for (const date of days) {
      const record = recordsByDay.get(date);
      if (!record) {
        integrity.missingDays.push(date);
        daily.push({ date, status: "MISSING_DAY", ...emptyCounts() });
        continue;
      }

      const planDay = record.plans?.[plan.key];
      const available = Boolean(planDay?.available);
      const rows = available && Array.isArray(planDay.picks) ? planDay.picks : [];
      const summary = summarizeValueRows(rows);
      const status = planDayStatus(available, summary);

      if (available) availableDays += 1;
      else notAvailableDays += 1;

      daily.push({ date, status, ...summary });
      picks.push(...rows);
      addCounts(rangeCounts, summary);

      if (available && planDay.declaredSummary) {
        const expected = {
          picks: declaredCount(planDay.declaredSummary, "picks"),
          wins: declaredCount(planDay.declaredSummary, "wins"),
          losses: declaredCount(planDay.declaredSummary, "losses"),
          unresolved: declaredCount(planDay.declaredSummary, "unresolved")
        };
        const actual = {
          picks: summary.picks,
          wins: summary.wins,
          losses: summary.losses,
          unresolved: summary.unresolved
        };

        for (const key of Object.keys(expected)) {
          if (expected[key] !== null && expected[key] !== actual[key]) {
            integrity.countMismatches.push({ date, plan: plan.key, metric: key, expected: expected[key], actual: actual[key] });
          }
        }
      }

      if (date < today && summary.unresolved > 0) {
        integrity.unresolvedClosedDays.push({ date, plan: plan.key, unresolved: summary.unresolved });
      }

      if (summary.unsupported > 0) {
        integrity.unsupportedRows.push({ date, plan: plan.key, unsupported: summary.unsupported });
      }

      const seen = new Set();
      for (const row of rows) {
        const key = duplicateKey(row);
        if (seen.has(key)) integrity.duplicatePicks.push({ date, plan: plan.key, key });
        seen.add(key);
      }
    }

    const range = {
      from,
      to,
      availableDays,
      notAvailableDays,
      ...finalizeCounts(rangeCounts)
    };

    plans[plan.key] = {
      ...plan,
      picks,
      daily,
      range,
      markets: marketBreakdown(picks)
    };
    totalRows += picks.length;
  }

  integrity.missingDays = [...new Set(integrity.missingDays)].sort();
  integrity.issues = [
    ...integrity.missingDays.map(date => ({ code: "VALUE_EXPORT_DAY_MISSING", date })),
    ...integrity.unresolvedClosedDays.map(issue => ({ code: "VALUE_EXPORT_CLOSED_DAY_UNRESOLVED", ...issue })),
    ...integrity.unsupportedRows.map(issue => ({ code: "VALUE_EXPORT_UNSUPPORTED_SETTLEMENT", ...issue })),
    ...integrity.duplicatePicks.map(issue => ({ code: "VALUE_EXPORT_DUPLICATE_PICK", ...issue })),
    ...integrity.countMismatches.map(issue => ({ code: "VALUE_EXPORT_COUNT_MISMATCH", ...issue }))
  ];
  integrity.status = integrity.issues.length > 0 ? "INCOMPLETE" : "COMPLETE";

  return {
    ok: true,
    schema: "ai-matchlab.value-export-report.v1",
    from,
    to,
    dayCount: days.length,
    days: [...days],
    totalRows,
    planOrder: VALUE_EXPORT_PLAN_ORDER.map(plan => plan.key),
    plans,
    integrity
  };
}

export function valueExportCsvRecords(report) {
  const records = [];

  for (const planKey of report.planOrder) {
    const plan = report.plans[planKey];
    for (const row of plan.picks) records.push({ recordType: "PICK", ...row });
    for (const row of plan.daily) records.push({ recordType: "DAILY_SUMMARY", planKey, planLabel: plan.label, ...row });
    records.push({ recordType: "RANGE_SUMMARY", planKey, planLabel: plan.label, ...plan.range });
    for (const row of plan.markets) records.push({ recordType: "MARKET_SUMMARY", planKey, planLabel: plan.label, ...row });
  }

  return records;
}
