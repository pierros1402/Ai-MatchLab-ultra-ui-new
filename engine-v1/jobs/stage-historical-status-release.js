import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { resolveDataPath } from "../storage/data-root.js";
import { canonicalFixturesForDay, fixturesForSnapshotDay }
  from "../core/day-fixture-universe.js";
import { discoverMissingReschedules, planPublishedFinalRefresh }
  from "./refresh-published-final-status-day.js";
import { buildHistoricalStatusMembership }
  from "./build-historical-status-membership.js";
import { synchronizeDetailStatusState }
  from "../core/detail-status-sync.js";
import {
  canonicalFileSha256,
  canonicalFileBytes,
  computeDeploySnapshotManifestHash
} from "../core/deploy-snapshot-release-contract.js";
import { validateStagedRelease }
  from "./sync-deploy-snapshot-from-github.js";

const idOf = row => String(row?.canonicalId || row?.matchId || "");
const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const rawHash = file => crypto.createHash("sha256")
  .update(fs.readFileSync(file)).digest("hex");
const write = (file, value) =>
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");

const protectedFiles = Object.freeze([
  "fixtures.json",
  "manifest.json",
  "value.json",
  "value-audit.json",
  "plan-c-shadow.json",
  "plan-c-shadow-audit.json"
]);

function inventory(root) {
  const entries = new Map();

  function walk(dir, prefix = "") {
    for (const entry of fs.readdirSync(dir, {
      withFileTypes: true
    }).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = prefix
        ? prefix + "/" + entry.name
        : entry.name;
      const absolute = path.join(dir, entry.name);

      if (entry.isSymbolicLink()) {
        throw Error("historical_stage_symlink_forbidden:" + relative);
      }
      if (entry.isDirectory()) {
        walk(absolute, relative);
      } else if (entry.isFile()) {
        entries.set(relative, rawHash(absolute));
      } else {
        throw Error("historical_stage_unsupported_entry:" + relative);
      }
    }
  }

  walk(root);
  return entries;
}

function equalInventory(a, b) {
  if (a.size !== b.size) return false;
  for (const [file, hash] of a) {
    if (b.get(file) !== hash) return false;
  }
  return true;
}

export async function stageHistoricalStatusRelease({
  day,
  patchedAt = "2026-11-12T00:00:00.000Z",
  onValidatedSandboxStage = null
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(day || ""))) {
    throw Error("historical_stage_invalid_day");
  }
  if (onValidatedSandboxStage !== null &&
      typeof onValidatedSandboxStage !== "function") {
    throw Error("historical_stage_observer_invalid");
  }

  if (!Number.isFinite(Date.parse(patchedAt))) {
    throw Error("historical_stage_invalid_patch_time");
  }

  const original = resolveDataPath("deploy-snapshots", day);
  const latestFile = resolveDataPath("deploy-snapshots", "latest.json");

  if (!fs.existsSync(original) ||
      !fs.existsSync(latestFile)) {
    throw Error("historical_stage_source_missing");
  }

  const beforeInventory = inventory(original);
  const beforeLatestHash = rawHash(latestFile);

  for (const name of protectedFiles) {
    if (!beforeInventory.has(name)) {
      throw Error("historical_stage_protected_missing:" + name);
    }
  }

  const originalPayload = read(path.join(original, "fixtures.json"));
  const published = originalPayload?.fixtures;

  if (!Array.isArray(published)) {
    throw Error("historical_stage_invalid_published");
  }

  const canonical = fixturesForSnapshotDay(day).fixtures;
  const results = new Map();

  for (const row of published) {
    const id = idOf(row);

    if (!/^[A-Za-z0-9_-]+$/u.test(id)) {
      throw Error("historical_stage_unsafe_id:" + id);
    }

    const resultFile = resolveDataPath(
      "final-results", day, id + ".json"
    );

    if (fs.existsSync(resultFile)) {
      results.set(id, read(resultFile));
    }
  }

  const missingReschedules = discoverMissingReschedules({
    day,
    published,
    canonical,
    lookupDay: canonicalFixturesForDay,
    windowDays: 21
  });

  const plan = planPublishedFinalRefresh({
    day,
    published,
    canonical,
    results,
    missingReschedules
  });

  const built = buildHistoricalStatusMembership({
    published,
    canonical,
    results,
    plan
  });

  if (built.publicationAuthorized !== false ||
      built.fixtures.length !== published.length ||
      JSON.stringify(built.fixtureIds) !==
        JSON.stringify(published.map(idOf))) {
    throw Error("historical_stage_membership_invalid");
  }

  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "aiml-v35-release-")
  );
  const stage = path.join(tempRoot, day);

  try {
    fs.cpSync(original, stage, { recursive: true });

    const stagedPayload = {
      ...originalPayload,
      count: built.fixtures.length,
      fixtures: built.fixtures
    };
    write(path.join(stage, "fixtures.json"), stagedPayload);

    const manifest = read(path.join(stage, "manifest.json"));
    const upgraded = new Set(built.upgraded);
    const carried = new Set(built.carried);
    const modifiedDetails = [];

    for (const row of built.fixtures) {
      const id = idOf(row);
      const stagedDetail = path.join(stage, "details", id + ".json");

      if (!fs.existsSync(stagedDetail)) {
        throw Error("historical_stage_detail_missing:" + id);
      }

      if (!upgraded.has(id)) continue;

      if (carried.has(id)) {
        throw Error("historical_stage_carry_upgrade_conflict:" + id);
      }

      const detail = read(stagedDetail);
      const assessment = synchronizeDetailStatusState(
        detail, row, { patchedAt }
      );

      if (!assessment.ok) {
        throw Error(
          "historical_stage_detail_sync_invalid:" +
          id + ":" + assessment.reason
        );
      }

      if (assessment.changed) {
        write(stagedDetail, detail);
        modifiedDetails.push(id);
      }
    }

    manifest.fileHashes["fixtures.json"] =
      canonicalFileSha256(path.join(stage, "fixtures.json"));

    for (const row of manifest.details) {
      const file = path.join(stage, "details", row.file);
      row.bytes = canonicalFileBytes(file);
      row.sha256 = canonicalFileSha256(file);
      row.mb = Number((row.bytes / 1048576).toFixed(2));
    }

    manifest.details.sort((a, b) =>
      a.file.localeCompare(b.file)
    );

    const fixtureBytes = fs.statSync(
      path.join(stage, "fixtures.json")
    ).size;

    manifest.sizes.fixturesMb =
      Number((fixtureBytes / 1048576).toFixed(2));

    const totalDetailBytes = manifest.details.reduce(
      (sum, row) => sum + row.bytes, 0
    );

    manifest.sizes.detailsTotalMb =
      Number((totalDetailBytes / 1048576).toFixed(2));

    const largest = [...manifest.details].sort(
      (a, b) => b.bytes - a.bytes
    )[0];

    manifest.sizes.largestDetail = largest
      ? {
          file: largest.file,
          bytes: largest.bytes,
          mb: largest.mb
        }
      : { file: null, bytes: 0, mb: 0 };

    manifest.hash = computeDeploySnapshotManifestHash(manifest);
    write(path.join(stage, "manifest.json"), manifest);

    const validated = await validateStagedRelease(stage, manifest);

    if (validated.fixtureCount !== published.length ||
        validated.detailCount !== published.length) {
      throw Error("historical_stage_validation_counts_invalid");
    }

    for (const name of protectedFiles.slice(2)) {
      const oldHash = beforeInventory.get(name);
      const newHash = rawHash(path.join(stage, name));
      if (oldHash !== newHash) {
        throw Error("historical_stage_frozen_artifact_changed:" + name);
      }
    }

    for (const row of published) {
      const id = idOf(row);
      const relative = "details/" + id + ".json";
      if (!upgraded.has(id) &&
          beforeInventory.get(relative) !==
            rawHash(path.join(stage, relative))) {
        throw Error("historical_stage_untouched_detail_changed:" + id);
      }
    }

    if (!equalInventory(beforeInventory, inventory(original)) ||
        rawHash(latestFile) !== beforeLatestHash) {
      throw Error("historical_stage_original_changed");
    }

    // The observer sees only an already validated temporary stage.
    // It cannot authorize or perform a production promotion.
    if (onValidatedSandboxStage !== null) {
      const proof = await onValidatedSandboxStage({
        day,
        stageDir: stage,
        manifestHash: manifest.hash,
        fixtureCount: validated.fixtureCount,
        upgradeCount: built.upgraded.length
      });

      if (proof?.ok !== true || proof?.sandboxOnly !== true) {
        throw Error("historical_stage_sandbox_proof_invalid");
      }

      await validateStagedRelease(stage, manifest);

      if (!equalInventory(beforeInventory, inventory(original)) ||
          rawHash(latestFile) !== beforeLatestHash) {
        throw Error("historical_stage_observer_source_changed");
      }
    }

    return {
      ok: true,
      day,
      fixtureCount: validated.fixtureCount,
      detailCount: validated.detailCount,
      carriedCount: built.carried.length,
      upgradeCount: built.upgraded.length,
      modifiedDetailCount: modifiedDetails.length,
      manifestHash: manifest.hash,
      originalUnchanged: true,
      latestUnchanged: true,
      publicationAuthorized: false
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}