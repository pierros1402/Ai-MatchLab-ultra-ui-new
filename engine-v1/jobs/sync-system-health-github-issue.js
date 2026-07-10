/**
 * sync-system-health-github-issue.js
 *
 * Synchronizes one deduplicated GitHub issue with the active actionable
 * System Health ERROR/WARNING set.
 *
 * Behavior:
 * - actionableIssueCount > 0: create or update one open issue.
 * - actionableIssueCount === 0: close the existing issue, if any.
 * - local/no-token execution: safe no-op.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveDataPath } from "../storage/data-root.js";

const ISSUE_TITLE = "[System Health] Active actionable issues";
const ISSUE_MARKER = "<!-- ai-matchlab-system-health-alert -->";

function readJsonSafe(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function text(value) {
  return String(value ?? "").trim();
}

function markdownCell(value) {
  return text(value)
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|");
}

function reportPathForDay(dayKey) {
  const exact = resolveDataPath("system-health", `${dayKey}.json`);
  if (fs.existsSync(exact)) return exact;

  return resolveDataPath("system-health", "latest.json");
}

function actionableIssuesOf(report) {
  if (Array.isArray(report?.actionableIssues)) {
    return report.actionableIssues.filter(issue =>
      issue?.severity === "error" || issue?.severity === "warning"
    );
  }

  return (report?.activeIssues || []).filter(issue =>
    issue?.severity === "error" || issue?.severity === "warning"
  );
}

function issueBody(report) {
  const actionable = actionableIssuesOf(report);
  const counts = report?.issueCounts || {};
  const generatedAt = report?.generatedAt || "unknown";

  const lines = [
    ISSUE_MARKER,
    "",
    "# AI MatchLab System Health Alert",
    "",
    `Day: **${markdownCell(report?.dayKey || "unknown")}**  `,
    `Severity: **${markdownCell(String(report?.severity || "unknown").toUpperCase())}**  `,
    `Generated: \`${markdownCell(generatedAt)}\``,
    "",
    "| Metric | Count |",
    "|---|---:|",
    `| Errors | ${Number(counts.error || 0)} |`,
    `| Warnings | ${Number(counts.warning || 0)} |`,
    `| Info | ${Number(counts.info || 0)} |`,
    `| Active issues | ${Number(report?.activeIssueCount || 0)} |`,
    `| Actionable issues | ${Number(report?.actionableIssueCount || actionable.length || 0)} |`,
    `| New actionable issues | ${Number(report?.newActionableIssueCount || 0)} |`,
    ""
  ];

  if (actionable.length > 0) {
    lines.push("## Active actionable issues", "");
    lines.push("| Severity | Source | Type | Message |");
    lines.push("|---|---|---|---|");

    for (const issue of actionable) {
      lines.push(
        `| **${markdownCell(String(issue?.severity || "warning").toUpperCase())}**` +
        ` | ${markdownCell(issue?.source || "unknown")}` +
        ` | ${markdownCell(issue?.type || "unknown_issue")}` +
        ` | ${markdownCell(issue?.message || "")} |`
      );
    }

    lines.push("");
  }

  lines.push(
    "_This issue is maintained automatically. It closes when no actionable System Health ERROR/WARNING remains._",
    ""
  );

  return lines.join("\n");
}

async function githubRequest(endpoint, options = {}) {
  const token = text(process.env.GITHUB_TOKEN);

  const response = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ai-matchlab-system-health",
      ...(options.headers || {})
    }
  });

  const raw = await response.text();
  let payload = null;

  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = raw;
  }

  if (!response.ok) {
    throw new Error(
      `GitHub API ${response.status} ${response.statusText}: ` +
      `${typeof payload === "string" ? payload : JSON.stringify(payload)}`
    );
  }

  return payload;
}

async function findExistingIssue(owner, repo) {
  const issues = await githubRequest(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?state=all&per_page=100`
  );

  return (issues || []).find(issue =>
    !issue.pull_request &&
    issue.title === ISSUE_TITLE &&
    text(issue.body).includes(ISSUE_MARKER)
  ) || null;
}

export async function syncSystemHealthGitHubIssue(dayKey) {
  const token = text(process.env.GITHUB_TOKEN);
  const repository = text(process.env.GITHUB_REPOSITORY);

  if (!token || !repository) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: "missing_github_actions_context",
      dayKey
    }, null, 2));

    return {
      ok: true,
      skipped: true,
      reason: "missing_github_actions_context"
    };
  }

  const [owner, repo] = repository.split("/");

  if (!owner || !repo) {
    throw new Error(`Invalid GITHUB_REPOSITORY: ${repository}`);
  }

  const reportFile = reportPathForDay(dayKey);
  const report = readJsonSafe(reportFile);

  if (!report) {
    throw new Error(`System Health report not found or invalid: ${reportFile}`);
  }

  const actionable = actionableIssuesOf(report);
  const activeActionableCount = actionable.length;
  const existing = await findExistingIssue(owner, repo);

  if (activeActionableCount === 0) {
    if (!existing || existing.state !== "open") {
      console.log(JSON.stringify({
        ok: true,
        action: "noop",
        reason: "no_actionable_issues",
        existingIssue: existing?.number || null
      }, null, 2));

      return {
        ok: true,
        action: "noop",
        reason: "no_actionable_issues"
      };
    }

    const closed = await githubRequest(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${existing.number}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: "closed",
          state_reason: "completed",
          body:
            `${text(existing.body)}\n\n` +
            `Resolved automatically for ${dayKey}: no actionable System Health ERROR/WARNING remains.\n`
        })
      }
    );

    console.log(JSON.stringify({
      ok: true,
      action: "closed",
      issueNumber: closed.number,
      issueUrl: closed.html_url
    }, null, 2));

    return {
      ok: true,
      action: "closed",
      issueNumber: closed.number,
      issueUrl: closed.html_url
    };
  }

  const body = issueBody(report);

  if (!existing) {
    const created = await githubRequest(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: ISSUE_TITLE,
          body
        })
      }
    );

    console.log(JSON.stringify({
      ok: true,
      action: "created",
      issueNumber: created.number,
      issueUrl: created.html_url,
      actionableIssueCount: activeActionableCount
    }, null, 2));

    return {
      ok: true,
      action: "created",
      issueNumber: created.number,
      issueUrl: created.html_url
    };
  }

  if (existing.state === "open" && text(existing.body) === text(body)) {
    console.log(JSON.stringify({
      ok: true,
      action: "noop",
      reason: "issue_already_current",
      issueNumber: existing.number,
      issueUrl: existing.html_url
    }, null, 2));

    return {
      ok: true,
      action: "noop",
      reason: "issue_already_current",
      issueNumber: existing.number
    };
  }

  const updated = await githubRequest(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${existing.number}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: "open",
        title: ISSUE_TITLE,
        body
      })
    }
  );

  console.log(JSON.stringify({
    ok: true,
    action: existing.state === "closed" ? "reopened" : "updated",
    issueNumber: updated.number,
    issueUrl: updated.html_url,
    actionableIssueCount: activeActionableCount
  }, null, 2));

  return {
    ok: true,
    action: existing.state === "closed" ? "reopened" : "updated",
    issueNumber: updated.number,
    issueUrl: updated.html_url
  };
}

const entryUrl = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (entryUrl === import.meta.url) {
  const dayArg =
    process.argv.find(arg => arg.startsWith("--date="))?.split("=")[1] ||
    process.argv.slice(2).find(arg => /^\d{4}-\d{2}-\d{2}$/.test(arg));

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(dayArg))) {
    console.error(
      "Usage: node engine-v1/jobs/sync-system-health-github-issue.js --date=YYYY-MM-DD"
    );
    process.exit(1);
  }

  syncSystemHealthGitHubIssue(dayArg).catch(error => {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  });
}
