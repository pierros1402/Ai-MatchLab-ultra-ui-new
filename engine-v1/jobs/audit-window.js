import fs from "fs";
import { getDataRoot, resolveDataPath } from "../storage/data-root.js";
import { ALL_LEAGUE_SEEDS } from "../config.js";
import { fetchLeagueFixtures } from "../adapters/espn.js";
import { normalizeFixture } from "../core/normalize.js";
import { athensDayKey, shiftDay } from "../core/daykey.js";

const dataDir = getDataRoot();
const auditPath = resolveDataPath("audit-window.json");

function ensureDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function writeAudit(data) {
  ensureDir();
  fs.writeFileSync(auditPath, JSON.stringify(data, null, 2), "utf8");
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function auditLeagueForDay(slug, dayKey, includeMatches) {
  const data = await fetchLeagueFixtures(slug, dayKey);
  const events = Array.isArray(data?.events) ? data.events : [];

  const leagueEntry = {
    rawEvents: events.length,
    normalized: 0,
    writtenDayMatch: 0,
    skippedWrongDay: 0,
    skippedNull: 0,
    matches: includeMatches ? [] : undefined
  };

  for (const event of events) {
    const normalized = normalizeFixture(event, slug);

    if (!normalized) {
      leagueEntry.skippedNull++;
      continue;
    }

    leagueEntry.normalized++;

    const isDayMatch = normalized.dayKey === dayKey;

    if (isDayMatch) {
      leagueEntry.writtenDayMatch++;
    } else {
      leagueEntry.skippedWrongDay++;
    }

    if (includeMatches) {
      leagueEntry.matches.push({
        matchId: normalized.matchId,
        homeTeam: normalized.homeTeam,
        awayTeam: normalized.awayTeam,
        kickoffUtc: normalized.kickoffUtc,
        requestedDay: dayKey,
        actualDay: normalized.dayKey,
        rawStatus: normalized.rawStatus,
        status: normalized.status,
        dayMatch: isDayMatch
      });
    }
  }

  return leagueEntry;
}

export async function auditWindow(options = {}) {
  const {
    baseDay = athensDayKey(),
    daysBack = 1,
    daysForward = 1,
    includeMatches = false,
    leagueLimit = 0,
    concurrency = 8,
    nonZeroOnly = false
  } = options;

  const days = [];
  for (let i = daysBack; i > 0; i--) {
    days.push(shiftDay(baseDay, -i));
  }
  days.push(baseDay);
  for (let i = 1; i <= daysForward; i++) {
    days.push(shiftDay(baseDay, i));
  }

  const selectedLeagues =
    leagueLimit > 0
      ? ALL_LEAGUE_SEEDS.slice(0, leagueLimit)
      : ALL_LEAGUE_SEEDS.slice();

  const report = {
    createdAt: Date.now(),
    baseDay,
    days,
    leagueCount: selectedLeagues.length,
    options: {
      daysBack,
      daysForward,
      includeMatches,
      leagueLimit,
      concurrency,
      nonZeroOnly
    },
    totals: {
      rawEvents: 0,
      normalized: 0,
      writtenDayMatch: 0,
      skippedWrongDay: 0,
      skippedNull: 0
    },
    byDay: {}
  };

  for (const dayKey of days) {
    report.byDay[dayKey] = {
      totals: {
        rawEvents: 0,
        normalized: 0,
        writtenDayMatch: 0,
        skippedWrongDay: 0,
        skippedNull: 0
      },
      byLeague: {}
    };

    const chunks = chunkArray(selectedLeagues, Math.max(1, concurrency));

    for (const group of chunks) {
      const results = await Promise.all(
        group.map(async slug => {
          const leagueEntry = await auditLeagueForDay(slug, dayKey, includeMatches);
          return { slug, leagueEntry };
        })
      );

      for (const { slug, leagueEntry } of results) {
        report.byDay[dayKey].totals.rawEvents += leagueEntry.rawEvents;
        report.byDay[dayKey].totals.normalized += leagueEntry.normalized;
        report.byDay[dayKey].totals.writtenDayMatch += leagueEntry.writtenDayMatch;
        report.byDay[dayKey].totals.skippedWrongDay += leagueEntry.skippedWrongDay;
        report.byDay[dayKey].totals.skippedNull += leagueEntry.skippedNull;

        report.totals.rawEvents += leagueEntry.rawEvents;
        report.totals.normalized += leagueEntry.normalized;
        report.totals.writtenDayMatch += leagueEntry.writtenDayMatch;
        report.totals.skippedWrongDay += leagueEntry.skippedWrongDay;
        report.totals.skippedNull += leagueEntry.skippedNull;

        const hasAny =
          leagueEntry.rawEvents > 0 ||
          leagueEntry.normalized > 0 ||
          leagueEntry.writtenDayMatch > 0 ||
          leagueEntry.skippedWrongDay > 0 ||
          leagueEntry.skippedNull > 0;

        if (!nonZeroOnly || hasAny) {
          report.byDay[dayKey].byLeague[slug] = leagueEntry;
        }
      }
    }
  }

  writeAudit(report);
  return report;
}