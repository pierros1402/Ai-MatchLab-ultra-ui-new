import crypto from "node:crypto";
import path from "node:path";
import {
  canonicalBufferSha256,
  canonicalTextBuffer,
  computeDeploySnapshotManifestHash,
  validateDeploySnapshotManifest,
} from "../core/deploy-snapshot-release-contract.js";

export const P0C_P4_DEPLOY_SNAPSHOT_MANIFEST_SCHEMA =
  "ai-matchlab.p0c-p4-deploy-snapshot-manifest.v1";

export const P0C_P4_DEPLOY_SNAPSHOT_MANIFEST_REQUIRED_FAMILIES =
  Object.freeze([
    "DEPLOY_SNAPSHOT_DETAILS",
    "DEPLOY_SNAPSHOT_FIXTURES",
    "DEPLOY_SNAPSHOT_VALUE",
    "DEPLOY_SNAPSHOT_VALUE_AUDIT",
  ]);

const MANIFEST_PATTERN =
  /^data\/deploy-snapshots\/(\d{4}-\d{2}-\d{2})\/manifest\.json$/u;

function clean(value) {
  return String(value ?? "").trim();
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function rawSha256(value) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
}

function normalizeRelativePath(value) {
  const text = clean(value).replaceAll("\\", "/");
  if (
    !text ||
    text.startsWith("/") ||
    /^[A-Za-z]:/u.test(text) ||
    text.split("/").includes("..")
  ) {
    throw new Error(
      "p0c_p4_deploy_manifest_path_invalid",
    );
  }
  const normalized = path.posix.normalize(text);
  if (
    normalized === "." ||
    normalized.startsWith("../")
  ) {
    throw new Error(
      "p0c_p4_deploy_manifest_path_invalid",
    );
  }
  return normalized;
}

function assertDayKey(value) {
  const text = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(text)) {
    throw new Error(
      "p0c_p4_deploy_manifest_day_invalid",
    );
  }
  return text;
}

function outputBuffer(content) {
  if (Buffer.isBuffer(content)) {
    return Buffer.from(content);
  }
  if (typeof content === "string") {
    return Buffer.from(content, "utf8");
  }
  if (content === undefined) {
    throw new Error(
      "p0c_p4_deploy_manifest_output_content_required",
    );
  }
  return Buffer.from(
    `${JSON.stringify(content, null, 2)}\n`,
    "utf8",
  );
}

function sourceBuffer(value, label) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (typeof value === "string") {
    return Buffer.from(value, "utf8");
  }
  throw new Error(
    `p0c_p4_deploy_manifest_${label}_bytes_required`,
  );
}

function parseJsonObject(buffer, label) {
  let parsed;
  try {
    parsed = JSON.parse(buffer.toString("utf8"));
  }
  catch {
    throw new Error(
      `p0c_p4_deploy_manifest_${label}_json_invalid`,
    );
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new Error(
      `p0c_p4_deploy_manifest_${label}_root_invalid`,
    );
  }
  return parsed;
}

function normalizeFixedFamilies(values) {
  if (!Array.isArray(values)) {
    throw new Error(
      "p0c_p4_deploy_manifest_fixed_families_required",
    );
  }
  const families = new Set(
    values.map(clean).filter(Boolean),
  );
  if (families.size !== values.length) {
    throw new Error(
      "p0c_p4_deploy_manifest_fixed_family_duplicate",
    );
  }
  for (
    const family of
    P0C_P4_DEPLOY_SNAPSHOT_MANIFEST_REQUIRED_FAMILIES
  ) {
    if (!families.has(family)) {
      throw new Error(
        `p0c_p4_deploy_manifest_prerequisite_missing:${family}`,
      );
    }
  }
  return Object.freeze([...families].sort());
}

function normalizedFixedOutput({
  row,
  expectedPath,
  required = true,
  allowDelete = false,
  label,
}) {
  if (row === null || row === undefined) {
    if (!required) return null;
    throw new Error(
      `p0c_p4_deploy_manifest_${label}_output_required`,
    );
  }
  if (!row || typeof row !== "object") {
    throw new Error(
      `p0c_p4_deploy_manifest_${label}_output_invalid`,
    );
  }
  const relativePath = normalizeRelativePath(
    row.relativePath,
  );
  if (relativePath !== expectedPath) {
    throw new Error(
      `p0c_p4_deploy_manifest_${label}_path_mismatch:${relativePath}`,
    );
  }
  const action = clean(row.action || "write").toLowerCase();
  if (action === "delete") {
    if (!allowDelete) {
      throw new Error(
        `p0c_p4_deploy_manifest_${label}_delete_forbidden`,
      );
    }
    if (
      Object.hasOwn(row, "content") &&
      row.content !== undefined
    ) {
      throw new Error(
        `p0c_p4_deploy_manifest_${label}_delete_content_forbidden`,
      );
    }
    return Object.freeze({
      relativePath,
      action,
      content: null,
      buffer: null,
    });
  }
  if (action !== "write") {
    throw new Error(
      `p0c_p4_deploy_manifest_${label}_action_invalid:${action || "missing"}`,
    );
  }
  const buffer = outputBuffer(row.content);
  return Object.freeze({
    relativePath,
    action,
    content: row.content,
    buffer,
  });
}

function fixtureRows(document) {
  const rows = Array.isArray(document?.fixtures)
    ? document.fixtures
    : Array.isArray(document?.matches)
      ? document.matches
      : null;
  if (!rows) {
    throw new Error(
      "p0c_p4_deploy_manifest_fixture_rows_required",
    );
  }
  if (
    Number.isFinite(Number(document?.count)) &&
    Number(document.count) !== rows.length
  ) {
    throw new Error(
      "p0c_p4_deploy_manifest_fixture_count_mismatch",
    );
  }
  return rows;
}

function valueRows(document) {
  if (!Array.isArray(document?.picks)) {
    throw new Error(
      "p0c_p4_deploy_manifest_value_picks_required",
    );
  }
  if (
    Number.isFinite(Number(document?.count)) &&
    Number(document.count) !== document.picks.length
  ) {
    throw new Error(
      "p0c_p4_deploy_manifest_value_count_mismatch",
    );
  }
  return document.picks;
}

function fixtureId(row) {
  return clean(
    row?.canonicalId ||
    row?.matchId,
  );
}

function fixtureIdSet(rows) {
  const ids = new Set();
  for (const row of rows) {
    const id = fixtureId(row);
    if (!id) {
      throw new Error(
        "p0c_p4_deploy_manifest_fixture_id_required",
      );
    }
    if (ids.has(id)) {
      throw new Error(
        `p0c_p4_deploy_manifest_fixture_id_duplicate:${id}`,
      );
    }
    ids.add(id);
  }
  return ids;
}

function setsEqual(left, right) {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function extractPlayerUsageSides(detail) {
  const direct = detail?.playerUsageIntel;
  const facts = detail?.researchedFacts?.playerUsageIntel;
  return {
    home: direct?.home || facts?.home || null,
    away: direct?.away || facts?.away || null,
  };
}

function extractTeamNews(detail) {
  return (
    detail?.teamNewsIntel ||
    detail?.researchedFacts?.teamNewsIntel ||
    detail?.teamNews ||
    detail?.researchedFacts?.teamNews ||
    detail?.context?.teamNews ||
    detail?.aiTasks?.team_news ||
    null
  );
}

function numericConfidence(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
}

function statusText(...values) {
  for (const value of values) {
    const text = clean(value).toLowerCase();
    if (text) return text;
  }
  return "";
}

function countTeamNewsContent(node) {
  if (!node || typeof node !== "object") return 0;
  return (
    asArray(node.absences).length +
    asArray(node.injuries).length +
    asArray(node.suspensions).length +
    asArray(node.notes).length +
    asArray(node.evidence).length +
    asArray(node.sources).length +
    asArray(node.items).length +
    asArray(node.players).length
  );
}

function isUsableTeamNews(teamNews) {
  if (!teamNews || typeof teamNews !== "object") {
    return false;
  }
  const status = statusText(
    teamNews.status,
    teamNews.state,
    teamNews.data?.status,
    teamNews.data?.state,
  );
  if (
    [
      "empty",
      "missing",
      "unavailable",
      "placeholder",
      "stub",
      "no_data",
      "none",
    ].includes(status)
  ) {
    return false;
  }
  const confidence = numericConfidence(
    teamNews.confidence,
    teamNews.data?.confidence,
    teamNews.home?.confidence,
    teamNews.away?.confidence,
    teamNews.data?.home?.confidence,
    teamNews.data?.away?.confidence,
  );
  const contentCount = [
    teamNews,
    teamNews.data,
    teamNews.home,
    teamNews.away,
    teamNews.data?.home,
    teamNews.data?.away,
    teamNews.teamNews,
    teamNews.data?.teamNews,
  ].reduce(
    (sum, node) => sum + countTeamNewsContent(node),
    0,
  );
  if (contentCount > 0) return true;
  return (
    confidence > 0 &&
    [
      "ready",
      "ok",
      "available",
      "complete",
      "structured",
      "validated",
    ].includes(status)
  );
}

function isUsablePlayerUsageSide(side) {
  if (!side || typeof side !== "object") return false;
  const status = clean(
    side?.status ||
    side?.readyStatus ||
    side?.meta?.status,
  ).toLowerCase();
  if (
    [
      "unavailable",
      "missing",
      "placeholder",
      "stub",
    ].includes(status)
  ) {
    return false;
  }
  const confidence = numericConfidence(
    side?.confidence,
    side?.meta?.confidence,
  );
  const sampleMatches = numericConfidence(
    side?.sampleMatches,
    side?.sampleCount,
    side?.matchCount,
    side?.meta?.sampleMatches,
    side?.meta?.sampleCount,
  );
  const expectedStarters =
    asArray(side?.expectedStarters).length > 0
      ? asArray(side.expectedStarters)
      : asArray(side?.coreStarters).length > 0
        ? asArray(side.coreStarters)
        : asArray(side?.starters).length > 0
          ? asArray(side.starters)
          : asArray(side?.players).filter(player =>
              player?.role === "starter" ||
              player?.expectedStarter === true ||
              player?.isStarter === true,
            );
  return (
    confidence > 0 &&
    sampleMatches >= 1 &&
    expectedStarters.length >= 6
  );
}

function summarizeDetail(detail) {
  const canonicalId = clean(
    detail?.basic?.canonicalId,
  ) || null;
  const matchId = canonicalId || clean(
    detail?.matchId ||
    detail?.basic?.matchId ||
    detail?.fixture?.matchId,
  ) || null;
  const hasTravel =
    Boolean(detail?.travelContext) ||
    Boolean(detail?.travel) ||
    Boolean(detail?.context?.travel) ||
    Boolean(detail?.researchedFacts?.travelContext) ||
    Boolean(detail?.aiTasks?.travel_context);
  const playerUsageSides = extractPlayerUsageSides(detail);
  const playerUsageUsableSides = [
    isUsablePlayerUsageSide(playerUsageSides.home),
    isUsablePlayerUsageSide(playerUsageSides.away),
  ].filter(Boolean).length;
  const hasPlayerUsage = playerUsageUsableSides > 0;
  const hasTeamNews = isUsableTeamNews(
    extractTeamNews(detail),
  );
  const valueRowsCombined = [
    ...asArray(detail?.value),
    ...asArray(detail?.valuePicks),
    ...asArray(detail?.valueSummary?.picks),
  ];
  const hasValue =
    valueRowsCombined.length > 0 ||
    (Array.isArray(detail?.value) && detail.value.length > 0) ||
    (Array.isArray(detail?.valuePicks) && detail.valuePicks.length > 0) ||
    (
      Number.isFinite(Number(detail?.valueSummary?.count)) &&
      Number(detail.valueSummary.count) > 0
    );
  const valueHasMatchProfile = valueRowsCombined.some(row =>
    row?.matchProfileApplied === true ||
    row?.matchProfileApplied === "true" ||
    (
      Array.isArray(row?.signals) &&
      row.signals.includes("match_profile_applied")
    ),
  );
  const serializedValue = JSON.stringify({
    value: detail?.value,
    valuePicks: detail?.valuePicks,
    valueSummary: detail?.valueSummary,
    analysis: detail?.analysis,
  });
  const matchProfileApplied =
    Boolean(detail?.meta?.matchProfileApplied) ||
    valueHasMatchProfile ||
    serializedValue.includes("match_profile_applied");
  const valueSynced =
    Boolean(detail?.meta?.valueSynced) ||
    hasValue;
  return {
    canonicalId,
    matchId,
    hasTravel,
    hasPlayerUsage,
    playerUsageUsableSides,
    hasTeamNews,
    hasValue,
    matchProfileApplied,
    valueSynced,
    keys: Object.keys(detail || {}).sort(),
  };
}

function mb(bytes) {
  return Number(
    (Number(bytes || 0) / 1024 / 1024).toFixed(2),
  );
}

function jsonPointerSegment(value) {
  return String(value)
    .replaceAll("~", "~0")
    .replaceAll("/", "~1");
}

function overlayManagedString({
  value,
  overlay,
  pointer,
  entries,
}) {
  if (typeof value !== "string") return value;
  const filename = value.endsWith(".json");
  const candidate = filename
    ? value.slice(0, -".json".length)
    : value;
  const resolution = overlay.resolveEvidenceFixtureId(
    candidate,
    { allowUnmanaged: true },
  );
  if (!resolution?.ok || resolution.managed !== true) {
    return value;
  }
  const resolved = filename
    ? `${resolution.resolvedFixtureId}.json`
    : resolution.resolvedFixtureId;
  entries.push({
    jsonPointer: pointer || "/",
    sourceFixtureId: resolution.sourceFixtureId,
    resolvedFixtureId: resolution.resolvedFixtureId,
    sourceFixtureRole: resolution.sourceRole,
    changed: resolved !== value,
  });
  return resolved;
}

function overlayManifestValue(
  value,
  context,
  pointer = "",
) {
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      overlayManifestValue(
        item,
        context,
        `${pointer}/${index}`,
      ),
    );
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        overlayManifestValue(
          child,
          context,
          `${pointer}/${jsonPointerSegment(key)}`,
        ),
      ]),
    );
  }
  return overlayManagedString({
    value,
    overlay: context.overlay,
    pointer,
    entries: context.entries,
  });
}

function normalizeDetailOutputs({
  dayKey,
  detailOutputs,
  completeDayDetailSet,
}) {
  if (completeDayDetailSet !== true) {
    throw new Error(
      "p0c_p4_deploy_manifest_complete_detail_set_required",
    );
  }
  if (!Array.isArray(detailOutputs)) {
    throw new Error(
      "p0c_p4_deploy_manifest_detail_outputs_required",
    );
  }
  const prefix =
    `data/deploy-snapshots/${dayKey}/details/`;
  const writes = [];
  const deletes = [];
  const paths = new Set();
  for (const row of detailOutputs) {
    if (!row || typeof row !== "object") {
      throw new Error(
        "p0c_p4_deploy_manifest_detail_output_invalid",
      );
    }
    const relativePath = normalizeRelativePath(
      row.relativePath,
    );
    if (
      !relativePath.startsWith(prefix) ||
      !relativePath.endsWith(".json") ||
      relativePath.slice(prefix.length).includes("/")
    ) {
      throw new Error(
        `p0c_p4_deploy_manifest_detail_path_mismatch:${relativePath}`,
      );
    }
    if (paths.has(relativePath)) {
      throw new Error(
        `p0c_p4_deploy_manifest_detail_path_duplicate:${relativePath}`,
      );
    }
    paths.add(relativePath);
    const action = clean(row.action || "write").toLowerCase();
    const file = path.posix.basename(relativePath);
    const id = file.slice(0, -".json".length);
    if (action === "delete") {
      if (
        Object.hasOwn(row, "content") &&
        row.content !== undefined
      ) {
        throw new Error(
          `p0c_p4_deploy_manifest_detail_delete_content_forbidden:${relativePath}`,
        );
      }
      deletes.push(Object.freeze({
        relativePath,
        file,
        id,
      }));
      continue;
    }
    if (action !== "write") {
      throw new Error(
        `p0c_p4_deploy_manifest_detail_action_invalid:${relativePath}:${action || "missing"}`,
      );
    }
    const buffer = outputBuffer(row.content);
    const detail = parseJsonObject(
      buffer,
      "detail",
    );
    const summary = summarizeDetail(detail);
    if (
      clean(summary.canonicalId || summary.matchId) !== id
    ) {
      throw new Error(
        `p0c_p4_deploy_manifest_detail_id_mismatch:${relativePath}`,
      );
    }
    const canonical = canonicalTextBuffer(buffer);
    writes.push(Object.freeze({
      relativePath,
      file,
      id,
      bytes: canonical.length,
      sha256: canonicalBufferSha256(buffer),
      mb: mb(canonical.length),
      detail,
      summary,
    }));
  }
  writes.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
  deletes.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
  return Object.freeze({
    writes: Object.freeze(writes),
    deletes: Object.freeze(deletes),
  });
}

function normalizedOrphanNames({
  sourceNames,
  overlay,
  fixtureIds,
  detailIds,
  deletedFiles,
}) {
  const candidates = [];
  for (const value of asArray(sourceNames)) {
    const file = clean(value);
    if (!file) continue;
    const normalized = overlayManagedString({
      value: file,
      overlay,
      pointer: "/orphanDetailsRemoved",
      entries: [],
    });
    candidates.push(normalized);
  }
  for (const value of deletedFiles) {
    const file = clean(value);
    if (!file) continue;
    candidates.push(
      overlayManagedString({
        value: file,
        overlay,
        pointer: "/orphanDetailsRemoved",
        entries: [],
      }),
    );
  }
  return [...new Set(candidates)]
    .filter(file => {
      if (!file.endsWith(".json")) return true;
      const id = file.slice(0, -".json".length);
      return !fixtureIds.has(id) && !detailIds.has(id);
    })
    .sort();
}

export function buildP0CP4DeploySnapshotManifest({
  relativePath,
  dayKey,
  sourceManifestBytes,
  fixedOutputSetComplete,
  fixedOutputFamilies,
  fixturesOutput,
  valueOutput,
  valueAuditOutput = null,
  detailOutputs,
  completeDayDetailSet,
  overlay,
  buildTimestamp,
} = {}) {
  const normalizedPath = normalizeRelativePath(relativePath);
  const pathMatch = normalizedPath.match(MANIFEST_PATTERN);
  if (!pathMatch) {
    throw new Error(
      `p0c_p4_deploy_manifest_path_family_mismatch:${normalizedPath}`,
    );
  }
  const normalizedDayKey = assertDayKey(
    dayKey || pathMatch[1],
  );
  if (pathMatch[1] !== normalizedDayKey) {
    throw new Error(
      "p0c_p4_deploy_manifest_day_path_mismatch",
    );
  }
  if (fixedOutputSetComplete !== true) {
    throw new Error(
      "p0c_p4_deploy_manifest_fixed_output_set_incomplete",
    );
  }
  const normalizedFamilies = normalizeFixedFamilies(
    fixedOutputFamilies,
  );
  if (
    !overlay ||
    typeof overlay.resolveEvidenceFixtureId !== "function"
  ) {
    throw new Error(
      "p0c_p4_deploy_manifest_overlay_invalid",
    );
  }
  if (!clean(buildTimestamp)) {
    throw new Error(
      "p0c_p4_deploy_manifest_build_timestamp_required",
    );
  }

  const source = sourceBuffer(
    sourceManifestBytes,
    "source_manifest",
  );
  const sourceDocument = parseJsonObject(
    source,
    "source_manifest",
  );
  if (
    clean(sourceDocument.date) !== normalizedDayKey
  ) {
    throw new Error(
      "p0c_p4_deploy_manifest_source_day_mismatch",
    );
  }

  const fixturePath =
    `data/deploy-snapshots/${normalizedDayKey}/fixtures.json`;
  const valuePath =
    `data/deploy-snapshots/${normalizedDayKey}/value.json`;
  const valueAuditPath =
    `data/deploy-snapshots/${normalizedDayKey}/value-audit.json`;

  const fixturesArtifact = normalizedFixedOutput({
    row: fixturesOutput,
    expectedPath: fixturePath,
    label: "fixtures",
  });
  const valueArtifact = normalizedFixedOutput({
    row: valueOutput,
    expectedPath: valuePath,
    label: "value",
  });
  const valueAuditArtifact = normalizedFixedOutput({
    row: valueAuditOutput,
    expectedPath: valueAuditPath,
    required: false,
    allowDelete: true,
    label: "value_audit",
  });

  const fixturesDocument = parseJsonObject(
    fixturesArtifact.buffer,
    "fixtures",
  );
  const valueDocument = parseJsonObject(
    valueArtifact.buffer,
    "value",
  );
  if (
    clean(fixturesDocument.date) &&
    clean(fixturesDocument.date) !== normalizedDayKey
  ) {
    throw new Error(
      "p0c_p4_deploy_manifest_fixtures_day_mismatch",
    );
  }
  if (
    clean(valueDocument.date) &&
    clean(valueDocument.date) !== normalizedDayKey
  ) {
    throw new Error(
      "p0c_p4_deploy_manifest_value_day_mismatch",
    );
  }
  if (valueAuditArtifact?.action === "write") {
    const valueAuditDocument = parseJsonObject(
      valueAuditArtifact.buffer,
      "value_audit",
    );
    if (
      clean(valueAuditDocument.date) &&
      clean(valueAuditDocument.date) !== normalizedDayKey
    ) {
      throw new Error(
        "p0c_p4_deploy_manifest_value_audit_day_mismatch",
      );
    }
  }

  const fixtures = fixtureRows(fixturesDocument);
  const picks = valueRows(valueDocument);
  const fixtureIds = fixtureIdSet(fixtures);
  const details = normalizeDetailOutputs({
    dayKey: normalizedDayKey,
    detailOutputs,
    completeDayDetailSet,
  });
  const detailIds = new Set(
    details.writes.map(row => row.id),
  );
  if (!setsEqual(fixtureIds, detailIds)) {
    const missing = [...fixtureIds]
      .filter(id => !detailIds.has(id))
      .sort();
    const orphan = [...detailIds]
      .filter(id => !fixtureIds.has(id))
      .sort();
    throw new Error(
      `p0c_p4_deploy_manifest_fixture_detail_set_mismatch:missing=${missing.join(",")}:orphan=${orphan.join(",")}`,
    );
  }

  const overlayEntries = [];
  const overlaidSource = overlayManifestValue(
    sourceDocument,
    {
      overlay,
      entries: overlayEntries,
    },
  );

  const detailSummaries = details.writes.map(row => ({
    file: row.file,
    bytes: row.bytes,
    sha256: row.sha256,
    mb: row.mb,
    ...row.summary,
  }));
  const totalDetailBytes = details.writes.reduce(
    (sum, row) => sum + row.bytes,
    0,
  );
  const largestDetail = details.writes.reduce(
    (largest, row) =>
      row.bytes > largest.bytes
        ? {
            file: row.file,
            bytes: row.bytes,
            mb: row.mb,
          }
        : largest,
    {
      file: null,
      bytes: 0,
      mb: 0,
    },
  );
  const orphanDetailsRemoved = normalizedOrphanNames({
    sourceNames: overlaidSource.orphanDetailsRemoved,
    overlay,
    fixtureIds,
    detailIds,
    deletedFiles: details.deletes.map(row => row.file),
  });
  const fixturesByLeague = {};
  for (const fixture of fixtures) {
    const leagueSlug = clean(fixture?.leagueSlug) || "unknown";
    fixturesByLeague[leagueSlug] =
      (fixturesByLeague[leagueSlug] || 0) + 1;
  }
  const coverage = {
    ...(overlaidSource.coverage || {}),
    minTargetFixtures:
      overlaidSource.minTargetFixtures ??
      overlaidSource.coverage?.minTargetFixtures ??
      null,
    minTargetFixtureSource:
      overlaidSource.minTargetFixtureSource ??
      overlaidSource.coverage?.minTargetFixtureSource ??
      null,
    canonicalCoverageFixtureCount:
      overlaidSource.canonicalCoverageFixtureCount ??
      overlaidSource.coverage?.canonicalCoverageFixtureCount ??
      null,
    detailsWithTravel:
      detailSummaries.filter(row => row.hasTravel).length,
    detailsWithPlayerUsage:
      detailSummaries.filter(row => row.hasPlayerUsage).length,
    playerUsageUsableSides:
      detailSummaries.reduce(
        (sum, row) =>
          sum + Number(row.playerUsageUsableSides || 0),
        0,
      ),
    playerUsageTotalSides:
      detailSummaries.length * 2,
    detailsWithTeamNews:
      detailSummaries.filter(row => row.hasTeamNews).length,
    detailsWithValue:
      detailSummaries.filter(row => row.hasValue).length,
    matchProfileApplied:
      detailSummaries.filter(
        row => row.matchProfileApplied,
      ).length,
  };
  const valueAuditPresent =
    valueAuditArtifact?.action === "write";
  const valueSource = clean(
    valueDocument.source ||
    overlaidSource.valueGate?.valueSource ||
    "local_value_file",
  );
  const valueFreshAgainstCanonical =
    overlaidSource.valueGate?.valueFreshAgainstCanonical ??
    null;
  const valueGate = {
    ...(overlaidSource.valueGate || {}),
    fixtures: fixtures.length,
    valuePicks: picks.length,
    valueSource,
    ok:
      !(
        fixtures.length > 0 &&
        valueSource === "missing_local_value_file"
      ) &&
      valueFreshAgainstCanonical !== false,
  };

  const manifest = {
    ...overlaidSource,
    ok: true,
    date: normalizedDayKey,
    files: {
      ...(overlaidSource.files || {}),
      fixtures: "fixtures.json",
      value: "value.json",
      valueAudit:
        valueAuditPresent
          ? "value-audit.json"
          : null,
      detailsDir: "details",
    },
    fileHashes: {
      "fixtures.json": canonicalBufferSha256(
        fixturesArtifact.buffer,
      ),
      "value.json": canonicalBufferSha256(
        valueArtifact.buffer,
      ),
      ...(valueAuditPresent
        ? {
            "value-audit.json": canonicalBufferSha256(
              valueAuditArtifact.buffer,
            ),
          }
        : {}),
    },
    counts: {
      ...(overlaidSource.counts || {}),
      fixtures: fixtures.length,
      valuePicks: picks.length,
      details: detailSummaries.length,
      detailsMatchedToFixtures: detailSummaries.length,
      orphanDetailsRemoved: orphanDetailsRemoved.length,
      detailsMissingForFixtures: 0,
    },
    valueGate,
    fixturesByLeague,
    orphanDetailsRemoved,
    detailsMissingForFixtures: [],
    coverage,
    sizes: {
      ...(overlaidSource.sizes || {}),
      fixturesMb: mb(fixturesArtifact.buffer.length),
      valueMb: mb(valueArtifact.buffer.length),
      detailsTotalMb: mb(totalDetailBytes),
      largestDetail,
    },
    details: detailSummaries,
  };

  delete manifest.hash;
  manifest.hash = computeDeploySnapshotManifestHash(
    manifest,
  );

  const validation = validateDeploySnapshotManifest(
    manifest,
    normalizedDayKey,
  );
  if (!validation.ok) {
    throw new Error(
      `p0c_p4_deploy_manifest_validation_failed:${validation.errors.join(",")}`,
    );
  }

  const output = Buffer.from(
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  const uniqueOverlayEntries = new Map();
  for (const row of overlayEntries) {
    const key = [
      row.jsonPointer,
      row.sourceFixtureId,
      row.resolvedFixtureId,
    ].join("\u0000");
    if (!uniqueOverlayEntries.has(key)) {
      uniqueOverlayEntries.set(key, row);
    }
  }
  const entries = [...uniqueOverlayEntries.values()].sort(
    (left, right) =>
      left.jsonPointer.localeCompare(right.jsonPointer) ||
      left.sourceFixtureId.localeCompare(
        right.sourceFixtureId,
      ),
  );

  return Object.freeze({
    schema: P0C_P4_DEPLOY_SNAPSHOT_MANIFEST_SCHEMA,
    ok: true,
    date: normalizedDayKey,
    relativePath: normalizedPath,
    content: output,
    sourceBytes: source.length,
    sourceSha256: rawSha256(source),
    outputBytes: output.length,
    outputSha256: rawSha256(output),
    manifestHash: manifest.hash,
    validation: Object.freeze({
      ok: true,
      computedHash: validation.computedHash,
    }),
    diagnostics: Object.freeze({
      buildTimestamp: clean(buildTimestamp),
      fixedOutputFamilies: normalizedFamilies,
      fixtureCount: fixtures.length,
      valuePickCount: picks.length,
      detailWriteCount: details.writes.length,
      detailDeleteCount: details.deletes.length,
      orphanDetailsRemovedCount:
        orphanDetailsRemoved.length,
      identityEntryCount: entries.length,
      changedFixtureIdCount:
        entries.filter(row => row.changed).length,
      sourceManifestRewritten: false,
      sourceOperationalMetadataPreserved: true,
      modelEvaluationPerformed: false,
      scoreTruthChanged: false,
      statusTruthChanged: false,
      settlementTruthChanged: false,
      repositoryApplicationAuthorized: false,
    }),
  });
}
