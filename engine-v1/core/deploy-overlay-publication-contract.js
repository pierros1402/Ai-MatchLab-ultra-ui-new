import fs from "node:fs";

import { resolveDataPath } from "../storage/data-root.js";

const SHA256_RE = /^[a-f0-9]{64}$/iu;

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Mutable UI overlays (odds.json / fixtures-all.json) are deliberately outside
 * the immutable deploy-snapshot manifest hash. They may be refreshed only after
 * the immutable core release for that day exists.
 *
 * This prevents a high-frequency odds writer from creating paths inside a day
 * that the long-running Daily publication is still building. Without this gate,
 * a concurrent direct writer can add those paths to main while Daily owns local
 * untracked versions, forcing the publication push/rebase to fail.
 */
export function evaluateDeployOverlayPublicationEligibility(
  dayKey,
  {
    manifest = undefined,
    fixturesPresent = undefined,
    valuePresent = undefined
  } = {}
) {
  const date = String(dayKey || "").trim();
  const resolvedManifest = manifest === undefined
    ? readJsonSafe(resolveDataPath("deploy-snapshots", date, "manifest.json"))
    : manifest;
  const resolvedFixturesPresent = fixturesPresent === undefined
    ? fs.existsSync(resolveDataPath("deploy-snapshots", date, "fixtures.json"))
    : fixturesPresent === true;
  const resolvedValuePresent = valuePresent === undefined
    ? fs.existsSync(resolveDataPath("deploy-snapshots", date, "value.json"))
    : valuePresent === true;

  const manifestValid = Boolean(
    resolvedManifest?.ok === true &&
    resolvedManifest?.date === date &&
    SHA256_RE.test(String(resolvedManifest?.hash || ""))
  );

  const eligible = Boolean(
    manifestValid &&
    resolvedFixturesPresent &&
    resolvedValuePresent
  );

  return {
    eligible,
    dayKey: date,
    reason: eligible
      ? "published_core_release_present"
      : !manifestValid
        ? "published_core_manifest_missing_or_invalid"
        : !resolvedFixturesPresent
          ? "published_core_fixtures_missing"
          : "published_core_value_missing"
  };
}
