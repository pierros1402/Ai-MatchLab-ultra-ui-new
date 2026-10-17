import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { HISTORY_CANARY_WORKFLOW, HISTORY_REPOSITORY, planHistoryProtection, validateHistoryLocator } from "../core/history-protection-watchdog.js";

export async function inspectHistoryProtection({ request, nowMs = Date.now(), apply = false } = {}) {
  const prefix = `repos/${HISTORY_REPOSITORY}`;
  const ref = await request(`${prefix}/git/ref/heads/codex/history-archive`, { missing: true });
  let locator = null, manifestAvailable = false;
  if (ref) {
    const sha = ref.object?.sha;
    if (ref.ref !== "refs/heads/codex/history-archive" || ref.object?.type !== "commit" || !/^[a-f0-9]{40}$/.test(sha || "")) throw new Error("history_watchdog_invalid_archive_ref");
    const file = await request(`${prefix}/contents/latest-checkpoint.json?ref=${sha}`, { missing: true });
    if (file) {
      if (file.type !== "file" || file.path !== "latest-checkpoint.json" || file.encoding !== "base64" ||
          !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > 65536 || typeof file.content !== "string" || file.content.length > 100000) {
        throw new Error("history_watchdog_invalid_locator_file");
      }
      locator = JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));
      validateHistoryLocator(locator, nowMs);
      const name = locator.manifestPath.split("/").map(encodeURIComponent).join("/");
      const manifest = await request(`${prefix}/contents/${name}?ref=${sha}`, { missing: true });
      if (manifest) {
        if (manifest.type !== "file" || manifest.path !== locator.manifestPath || !/^[a-f0-9]{40}$/.test(manifest.sha || "") || !Number.isSafeInteger(manifest.size) || manifest.size <= 0) throw new Error("history_watchdog_invalid_manifest_metadata");
        manifestAvailable = true;
      }
    }
  }
  const runs = []; let total = null;
  for (let page = 1; page <= 11; page++) {
    const listing = await request(`${prefix}/actions/workflows/${HISTORY_CANARY_WORKFLOW}/runs?branch=main&per_page=100&page=${page}`);
    if (!Array.isArray(listing.workflow_runs) || !Number.isSafeInteger(listing.total_count) || listing.total_count < 0 || listing.total_count > 1000 ||
        (total !== null && total !== listing.total_count)) throw new Error("history_watchdog_incomplete_canary_listing");
    total = listing.total_count; runs.push(...listing.workflow_runs);
    if (listing.workflow_runs.length < 100) break;
  }
  if (runs.length !== total || new Set(runs.map(r => r.id)).size !== total) throw new Error("history_watchdog_incomplete_canary_listing");
  const report = planHistoryProtection({ nowMs, locator, manifestAvailable, runs });
  report.apply = apply; report.dispatched = false;
  if (apply && report.action === "DISPATCH_CANARY") {
    const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(nowMs));
    await request(`${prefix}/actions/workflows/${HISTORY_CANARY_WORKFLOW}/dispatches`, {
      method: "POST", body: { ref: "main", inputs: { dayKey } }
    });
    report.dispatched = true; report.status = "RESTORE_REQUESTED";
  }
  return report;
}

export function githubRequest(token) {
  if (!token) throw new Error("history_watchdog_token_required");
  return async (endpoint, { missing = false, method = "GET", body } = {}) => {
    const response = await fetch(`https://api.github.com/${endpoint}`, {
      method, signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (missing && response.status === 404) return null;
    if (!response.ok) throw new Error(`history_watchdog_api_${response.status}`);
    return response.status === 204 ? null : response.json();
  };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.env.GITHUB_REPOSITORY !== HISTORY_REPOSITORY) throw new Error("history_watchdog_repository_mismatch");
    const report = await inspectHistoryProtection({ request: githubRequest(process.env.GITHUB_TOKEN), apply: process.argv.includes("--apply") });
    console.log(JSON.stringify(report, null, 2));
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `### History protection\n\nStatus: **${report.status}**\n\nReasons: ${report.reasons.join(", ") || "none"}\n\nExisting-byte restore drill requested: ${report.dispatched}\n\nThis check does not certify complete original inputs or authorize forecast changes.\n`);
    if (!["HEALTHY", "RESTORE_REQUESTED", "WAITING_FOR_RESTORE"].includes(report.status)) process.exitCode = 1;
  } catch (error) { console.error("[history-protection-watchdog]", error.message); process.exitCode = 1; }
}
