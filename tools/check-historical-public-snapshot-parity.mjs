import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { precedingDay } from './check-historical-ft-snapshot-drift.mjs';

export async function publicParityVerdict(day, manifest, request = fetch) {
  if (manifest?.ok !== true || manifest?.date !== day ||
      !/^[a-f0-9]{64}$/u.test(String(manifest?.hash || ''))) throw Error('invalid_source_manifest:' + day);
  const url = 'https://ai-matchlab-engine.onrender.com/deploy-snapshot?date=' + encodeURIComponent(day);
  const response = await request(url, { signal: AbortSignal.timeout(15000) });
  if (response.status === 404) return 'SYNC_REQUIRED';
  if (!response.ok) throw Error('historical_public_read_failed:' + day + ':' + response.status);
  const release = await response.json();
  if (release?.ok !== true || release?.date !== day ||
      !/^[a-f0-9]{64}$/u.test(String(release?.manifest?.hash || ''))) {
    return 'SYNC_REQUIRED';
  }
  return release.manifest.hash === manifest.hash ? 'VERIFIED' : 'SYNC_REQUIRED';
}

export async function inspectPublicHistory(root, today, request = fetch) {
  for (const back of [1, 2]) {
    const day = precedingDay(today, back);
    const manifestFile = path.join(root, 'data', 'deploy-snapshots', day, 'manifest.json');
    const fixturesFile = path.join(root, 'data', 'deploy-snapshots', day, 'fixtures.json');
    if (!fs.existsSync(manifestFile) || !fs.existsSync(fixturesFile)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    const verdict = await publicParityVerdict(day, manifest, request);
    console.error('HISTORICAL_PUBLIC_PARITY=' + JSON.stringify({ day, verdict }));
    if (verdict === 'SYNC_REQUIRED') return day;
  }
  return '';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const day = await inspectPublicHistory(process.cwd(), process.argv[2]);
    process.stdout.write('target_day=' + day + '\n');
  } catch (error) {
    console.error('HISTORICAL_PUBLIC_PARITY_FAILED=' + error.message);
    process.exitCode = 1;
  }
}
