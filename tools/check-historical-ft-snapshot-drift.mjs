import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/u;

export function precedingDay(day, daysBack) {
  if (!DAY_RE.test(String(day || '')) || ![1, 2].includes(daysBack)) throw Error('invalid_day_or_window');
  const date = new Date(day + 'T12:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) throw Error('invalid_calendar_day');
  date.setUTCDate(date.getUTCDate() - daysBack);
  return date.toISOString().slice(0, 10);
}

function score(x) {
  return Number.isInteger(x) && x >= 0 ? x : null;
}

export function findVerifiedFinalDrift(day, finals, snapshot) {
  if (!DAY_RE.test(day) || !Array.isArray(finals) || !snapshot || snapshot.ok !== true ||
      snapshot.date !== day || !Array.isArray(snapshot.fixtures)) throw Error('invalid_comparison_input');
  const byId = new Map();
  for (const row of snapshot.fixtures) {
    const id = String(row?.canonicalId || row?.matchId || '');
    if (id && byId.has(id)) throw Error('duplicate_snapshot_id');
    if (id) byId.set(id, row);
  }
  const drift = [];
  for (const item of finals) {
    if (item?.verifiedFinalTruth !== true || item.dayKey !== day ||
        item.verification?.verdict !== 'verified_final_result') continue;
    const id = String(item.matchId || '');
    const home = score(item.scoreHome);
    const away = score(item.scoreAway);
    if (!id || home === null || away === null) continue;
    const row = byId.get(id);
    // Never insert a new fixture or infer identity from team names.
    if (!row) continue;
    if (String(row.status || '').toUpperCase() !== 'FT' ||
        score(row.scoreHome) !== home || score(row.scoreAway) !== away) drift.push(id);
  }
  return [...new Set(drift)].sort();
}

export function inspectHistory(root, today) {
  const records = [];
  for (const daysBack of [1, 2]) {
    const day = precedingDay(today, daysBack);
    const finalDir = path.join(root, 'data', 'final-results', day);
    const fixtureFile = path.join(root, 'data', 'deploy-snapshots', day, 'fixtures.json');
    const manifestFile = path.join(root, 'data', 'deploy-snapshots', day, 'manifest.json');
    if (!fs.existsSync(finalDir) || !fs.existsSync(fixtureFile) || !fs.existsSync(manifestFile)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    if (manifest.ok !== true || manifest.date !== day) throw Error('invalid_historical_manifest:' + day);
    const snapshot = JSON.parse(fs.readFileSync(fixtureFile, 'utf8'));
    const finals = fs.readdirSync(finalDir).filter(name => name.endsWith('.json')).sort()
      .map(name => JSON.parse(fs.readFileSync(path.join(finalDir, name), 'utf8')));
    const ids = findVerifiedFinalDrift(day, finals, snapshot);
    if (ids.length) records.push({ day, ids });
  }
  return records;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const today = process.argv[2];
    const drift = inspectHistory(process.cwd(), today);
    const target = drift[0] || null;
    console.error('HISTORICAL_FT_SNAPSHOT_AUDIT=' + JSON.stringify({ today, drift }));
    process.stdout.write('target_day=' + (target?.day || '') + '\n');
    process.stdout.write('drift_count=' + (target?.ids.length || 0) + '\n');
  } catch (error) {
    console.error('HISTORICAL_FT_SNAPSHOT_AUDIT_FAILED=' + error.message);
    process.exitCode = 1;
  }
}
