/**
 * Bounded synchronous Git output scanner for history-preservation.
 * stdout is spooled to a private temporary file rather than spawnSync's pipe:
 * large trees and object inventories cannot trigger stdout maxBuffer/ENOBUFS.
 * The spool is then consumed in fixed-size buffers, never read as one string.
 * Fail closed on Git errors, truncation and abnormally long individual records.
 *
 * This module performs no repository writes, but invoking Git is never permitted
 * on the production repository during patch qualification.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const READ_CHUNK_BYTES = 256 * 1024;
const MAX_ENTRY_BYTES = 1024 * 1024;
const STDERR_LIMIT = 1024 * 1024;

export function scanGitDelimited(root, args, consume, { delimiter = 0, timeout = 120000, executable = 'git' } = {}) {
  if (!Array.isArray(args) || !args.length || typeof consume !== 'function' || typeof executable !== 'string' || !executable) {
    throw new Error('history_git_scan_arguments_invalid');
  }
  if (delimiter !== 0 && delimiter !== 10) {
    throw new Error('history_git_scan_delimiter_invalid');
  }
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'aiml-history-git-scan-'));
  const outputPath = path.join(scratch, 'git-output');
  let out = null;
  let input = null;
  try {
    out = fs.openSync(outputPath, 'wx', 0o600);
    const result = spawnSync(executable, args, {
      cwd: root,
      stdio: ['ignore', out, 'pipe'],
      encoding: 'utf8',
      timeout,
      maxBuffer: STDERR_LIMIT,
      windowsHide: true
    });
    fs.closeSync(out); out = null;
    if (result.error || result.status !== 0 || result.signal) {
      const reason = String(result.stderr || result.error || result.signal || result.status).slice(0, 1200);
      throw new Error(`history_preservation_git_failed:${args[0]}:${reason}`);
    }
    input = fs.openSync(outputPath, 'r');
    const chunk = Buffer.allocUnsafe(READ_CHUNK_BYTES);
    let tail = Buffer.alloc(0);
    let count = 0;
    for (;;) {
      const bytes = fs.readSync(input, chunk, 0, chunk.length, null);
      if (bytes === 0) break;
      let begin = 0;
      for (let cursor = 0; cursor < bytes; cursor += 1) {
        if (chunk[cursor] !== delimiter) continue;
        const part = chunk.subarray(begin, cursor);
        const size = tail.length + part.length;
        if (size > MAX_ENTRY_BYTES) throw new Error('history_git_scan_entry_too_large');
        const value = tail.length ? Buffer.concat([tail, part], size).toString('utf8') : part.toString('utf8');
        tail = Buffer.alloc(0);
        consume(value);
        count += 1;
        begin = cursor + 1;
      }
      const remainder = chunk.subarray(begin, bytes);
      if (tail.length + remainder.length > MAX_ENTRY_BYTES) {
        throw new Error('history_git_scan_entry_too_large');
      }
      if (remainder.length) tail = tail.length ? Buffer.concat([tail, remainder]) : Buffer.from(remainder);
    }
    if (tail.length) throw new Error('history_git_scan_unterminated_output');
    return count;
  } finally {
    if (input !== null) fs.closeSync(input);
    if (out !== null) fs.closeSync(out);
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
