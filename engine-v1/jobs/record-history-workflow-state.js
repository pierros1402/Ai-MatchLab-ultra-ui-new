import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveDataPath } from "../storage/data-root.js";
import { writeHistoryJsonAtomic } from "../storage/history-preservation.js";

export function recordHistoryWorkflowState({ dayKey = process.env.DAY_KEY,
  runId = process.env.GITHUB_RUN_ID, attempt = process.env.GITHUB_RUN_ATTEMPT || "1",
  upstreamJobStatus = process.env.HISTORY_UPSTREAM_JOB_STATUS,
  workflow = process.env.GITHUB_WORKFLOW || null, job = process.env.GITHUB_JOB || null,
  event = process.env.GITHUB_EVENT_NAME || null, sourceCommit = process.env.GITHUB_SHA || null,
  destination = null } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(dayKey) || !/^\d+$/u.test(runId) || !/^\d+$/u.test(attempt)) throw new Error("invalid_workflow_record_identity");
  if (!["success", "failure", "cancelled", "skipped"].includes(upstreamJobStatus)) throw new Error("invalid_upstream_job_status");
  const record = { schema: "ai-matchlab.history-workflow-state.v1", dayKey, runId, attempt,
    workflow, job, event, sourceCommit, upstreamJobStatus,
    statusScope: "job_before_history_cleanup", runConclusion: null,
    valueExecutionOutcome: "not_inferred", capturedAt: new Date().toISOString(),
    note: "The backup can still fail after this point. This record does not imply completed plans, zero picks, or complete input coverage." };
  const file = destination || resolveDataPath("ingest-state", "history-runs", runId, attempt, "before-history-cleanup.json");
  writeHistoryJsonAtomic(file, record);
  return { ok: true, dayKey, runId, upstreamJobStatus, file };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { console.log(JSON.stringify(recordHistoryWorkflowState())); }
  catch (error) { console.error("[history-workflow-state]", error.message); process.exitCode = 1; }
}
