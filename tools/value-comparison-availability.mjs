import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Absence in a verified commit is different from a failed HTTP fetch. Only
// the former can leave a historical comparison explicitly unavailable.
export function comparisonAvailable(day, ref, { cwd = process.cwd() } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw Error('invalid_day_key');
  if (!/^[0-9a-f]{40}$/.test(ref)) throw Error('immutable_ref_required');
  const git = args => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git(['cat-file', '-e', `${ref}^{commit}`]);
  const file = `data/value-comparison/${day}.json`;
  const entry = git(['ls-tree', ref, '--', file]).trim();
  if (!entry) return false;
  if (!/^100644 blob [0-9a-f]{40}\t/.test(entry)) throw Error('comparison_not_regular_blob');
  // A corrupt or incorrectly bound existing artifact must still fail.
  const payload = JSON.parse(git(['show', `${ref}:${file}`]));
  if (payload.ok !== true || payload.date !== day) throw Error('comparison_day_binding_invalid');
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [day, ref] = process.argv.slice(2);
  const available = comparisonAvailable(day, ref);
  if (!available) {
    const message = `Historical Value comparison ${day} is absent at ${ref}; settlement publication remains UNAVAILABLE. No historical predictions were reconstructed.`;
    console.error(`::warning::${message}`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${message}\n`);
  }
  console.log(String(available));
}
