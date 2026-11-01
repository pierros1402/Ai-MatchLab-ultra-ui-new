export function fetchHistoryArchiveTip({ run, remote, branch, now = Date.now, budgetMs = 300_000 }) {
  const deadline = now() + budgetMs;
  const bounded = args => {
    const remaining = deadline - now();
    if (remaining <= 0) throw new Error("history_archive_fetch_budget_exhausted");
    return run(args, { timeout: Math.min(90_000, remaining) });
  };
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const refs = bounded(["ls-remote", "--heads", remote, `refs/heads/${branch}`]).trim();
      if (!refs) return null;
      const rows = refs.split("\n");
      const [commit, ref] = rows[0].split(/\s+/u);
      if (rows.length !== 1 || ref !== `refs/heads/${branch}` || !/^[0-9a-f]{40,64}$/u.test(commit)) {
        throw new Error("history_archive_remote_tip_invalid");
      }
      bounded(["-c", "fetch.negotiationAlgorithm=noop", "fetch", "--quiet", "--filter=blob:none", "--depth=1", "--no-tags", "--no-write-fetch-head", "--refmap=", remote, commit]);
      if (bounded(["rev-parse", `${commit}^{commit}`]).trim() !== commit) throw new Error("history_archive_remote_tip_invalid");
      return commit;
    } catch (error) {
      lastError = error;
      // Retry only operational Git failures, never malformed identities.
      if (!String(error?.message).startsWith("history_preservation_git_failed:")) throw error;
    }
  }
  throw lastError;
}
