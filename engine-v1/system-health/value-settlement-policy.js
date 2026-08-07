const PLAN_DEFS = [
  ["A", "planA", "plan_a_unresolved_settlement"],
  ["A2", "planA2", "plan_a2_unresolved_settlement"],
  ["B", "planB", "plan_b_unresolved_settlement"],
  ["B2", "planB2", "plan_b2_unresolved_settlement"]
];

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dayNumber(dayKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(dayKey || ""))) return null;
  const parsed = Date.parse(`${dayKey}T12:00:00.000Z`);
  return Number.isFinite(parsed) ? Math.floor(parsed / 86400000) : null;
}

export function settlementAgeDays(dayKey, todayDayKey) {
  const day = dayNumber(dayKey);
  const today = dayNumber(todayDayKey);
  if (day === null || today === null) return 0;
  return Math.max(0, today - day);
}

function comparisonSummary(valueComparison, label) {
  const plan = valueComparison?.plans?.[label];
  if (!plan || typeof plan !== "object") return null;
  const summary = plan.summary && typeof plan.summary === "object"
    ? plan.summary
    : plan;
  return finiteNumber(summary?.unresolved) === null ? null : summary;
}

function buildReportSummary(buildReport, key) {
  const summary = buildReport?.settlement?.[key];
  if (!summary || typeof summary !== "object") return null;
  return finiteNumber(summary?.unresolved) === null ? null : summary;
}

function severityForAge(ageDays) {
  if (ageDays >= 2) return "error";
  if (ageDays >= 1) return "warning";
  return "info";
}

export function collectValueSettlementIssues({
  dayKey,
  todayDayKey,
  buildReport = null,
  valueComparison = null
} = {}) {
  const ageDays = settlementAgeDays(dayKey, todayDayKey);
  const severity = severityForAge(ageDays);
  const issues = [];

  for (const [label, buildKey, type] of PLAN_DEFS) {
    const comparison = comparisonSummary(valueComparison, label);
    const report = comparison || buildReportSummary(buildReport, buildKey);
    if (!report) continue;

    const unresolved = finiteNumber(report.unresolved) || 0;
    if (unresolved <= 0) continue;

    const source = comparison ? "value-comparison" : "build-report";
    const overdue = ageDays >= 1;

    issues.push({
      severity,
      source,
      type,
      message: overdue
        ? `Plan ${label} picks remain unresolved ${ageDays} day${ageDays === 1 ? "" : "s"} after fixture day.`
        : `Plan ${label} picks are still unresolved.`,
      details: {
        dayKey,
        todayDayKey,
        ageDays,
        overdue,
        settlementSource: source,
        picks: report.picks ?? report.count ?? null,
        settled: report.settled ?? null,
        unresolved
      }
    });
  }

  return issues;
}
