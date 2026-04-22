import { getProvidersForCapability, getProviderPolicy } from "./remote-provider-registry.js";
import {
  fetchTeamNewsResearchBridge,
  fetchTeamNewsMatchFacts,
  fetchTeamNewsStub
} from "./remote-providers/team-news-provider.js";
import {
  fetchRefereeResearchBridge,
  fetchRefereeMatchFacts,
  fetchRefereeStub
} from "./remote-providers/referee-profile-provider.js";

function isSuccessStatus(status) {
  return status === "success" || status === "partial";
}

function statusRank(status) {
  if (status === "success") return 4;
  if (status === "partial") return 3;
  if (status === "resolved_stub") return 2;
  if (status === "unavailable") return 1;
  if (status === "skipped") return 0;
  return 0;
}

function normalizeAttempt(provider, result) {
  return {
    provider: provider?.id || null,
    priority: provider?.priority || 0,
    status: result?.status || "failed",
    reason: result?.reason || null,
    confidence: Number.isFinite(Number(result?.confidence)) ? Number(result.confidence) : 0,
    data: result?.data ?? null
  };
}

function stableStringify(value) {
  try {
    return JSON.stringify(value, Object.keys(value || {}).sort());
  } catch {
    return "";
  }
}

function pickBestAttempt(attempts = []) {
  const sorted = [...attempts].sort((a, b) => {
    const byStatus = statusRank(b.status) - statusRank(a.status);
    if (byStatus !== 0) return byStatus;

    const byConfidence = (b.confidence || 0) - (a.confidence || 0);
    if (byConfidence !== 0) return byConfidence;

    return (b.priority || 0) - (a.priority || 0);
  });

  return sorted[0] || null;
}

function buildConflicts(attempts = []) {
  const successful = attempts.filter(item => isSuccessStatus(item.status) && item.data);
  if (successful.length <= 1) return [];

  const groups = new Map();
  for (const item of successful) {
    const key = stableStringify(item.data);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item.provider);
  }

  if (groups.size <= 1) return [];

  return successful.map(item => ({
    provider: item.provider,
    status: item.status,
    confidence: item.confidence,
    reason: item.reason || null
  }));
}

async function runRemoteProvider(provider, match, task, context) {
  switch (provider?.id) {
    case "team-news-research-bridge":
      return fetchTeamNewsResearchBridge(match, task, context);

    case "team-news-match-facts":
      return fetchTeamNewsMatchFacts(match, task, context);

    case "team-news-provider-stub":
      return fetchTeamNewsStub(match, task, context);

    case "referee-research-bridge":
      return fetchRefereeResearchBridge(match, task, context);

    case "referee-match-facts":
      return fetchRefereeMatchFacts(match, task, context);

    case "referee-provider-stub":
      return fetchRefereeStub(match, task, context);

    default:
      return {
        status: "failed",
        reason: "unknown_provider",
        confidence: 0,
        data: null
      };
  }
}

export async function executeRemoteTaskQueue(match, taskQueue = [], context = {}) {
  const queue = Array.isArray(taskQueue) ? taskQueue : [];
  const results = [];
  const providersTried = new Set();

  for (const task of queue) {
    const capability = task?.capability || null;
    const policy = getProviderPolicy(capability);
    const providers = getProvidersForCapability(capability);

    if (!providers.length) {
      results.push({
        key: task?.key || null,
        capability,
        provider: null,
        status: "skipped",
        reason: "no_remote_provider_registered",
        confidence: 0,
        data: null,
        attempts: [],
        conflicts: [],
        providersTried: []
      });
      continue;
    }

    const attempts = [];

    for (const provider of providers) {
      providersTried.add(provider.id);

      let rawResult;
      try {
        rawResult = await runRemoteProvider(provider, match, task, context);
      } catch (error) {
        rawResult = {
          status: "failed",
          reason: error?.message || "provider_execution_failed",
          confidence: 0,
          data: null
        };
      }

      attempts.push(normalizeAttempt(provider, rawResult));
    }

    const bestAttempt = pickBestAttempt(attempts);
    const successfulAttempts = attempts.filter(item => isSuccessStatus(item.status));
    const conflicts = policy.keepConflicts ? buildConflicts(attempts) : [];

    const finalStatus = bestAttempt?.status || "failed";
    const finalReason =
      bestAttempt?.reason ||
      (successfulAttempts.length ? null : "all_providers_unavailable");

    results.push({
      key: task?.key || null,
      capability,
      provider: bestAttempt?.provider || null,
      status: finalStatus,
      reason: finalReason,
      confidence: bestAttempt?.confidence || 0,
      data: bestAttempt?.data ?? null,
      attempts,
      conflicts,
      providersTried: attempts.map(item => item.provider)
    });
  }

  const actionableResults = results.filter(item => item.status !== "skipped");
  const successfulResults = actionableResults.filter(item => isSuccessStatus(item.status));
  const unavailableResults = actionableResults.filter(item => item.status === "unavailable");
  const blockedResults = actionableResults.filter(
    item => item.status !== "unavailable" && !isSuccessStatus(item.status)
  );

  let queueStatus = "ok";
  if (blockedResults.length > 0) {
    queueStatus = "partial";
  } else if (successfulResults.length > 0 && unavailableResults.length > 0) {
    queueStatus = "partial";
  } else if (successfulResults.length === 0 && unavailableResults.length > 0) {
    queueStatus = "unavailable";
  }

  return {
    status: queueStatus,
    queueSize: queue.length,
    providersTried: [...new Set(results.flatMap(item => item.providersTried || []))],
    results
  };
}