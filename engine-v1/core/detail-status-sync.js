import {
  isPreKickoffNonPlayed,
  sanitizePreKickoffNonPlayed
} from "./non-played-state.js";

const REQUIRED_BASIC_FIELDS = Object.freeze([
  "status",
  "rawStatus",
  "minute",
  "scoreHome",
  "scoreAway"
]);

// Optional fields are synchronized only when the historical detail schema
// already carries them. A status refresh must not silently expand old payloads
// with provider-specific fields such as statusType.
const OPTIONAL_BASIC_FIELDS = Object.freeze([
  "statusType",
  "penalties",
  "decidedBy",
  "isDisplayFinal"
]);

const SIGNATURE_FIELDS = Object.freeze([
  "status",
  "rawStatus",
  "minute",
  "scoreHome",
  "scoreAway"
]);

function hasOwn(value, key) {
  return Boolean(
    value &&
    typeof value === "object" &&
    Object.prototype.hasOwnProperty.call(value, key)
  );
}

function explicitFiniteNumberOrNull(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function authoritativeRow(row) {
  return isPreKickoffNonPlayed(row)
    ? sanitizePreKickoffNonPlayed(row)
    : row;
}

function normalizedToken(value) {
  return String(value ?? "").trim().toUpperCase();
}

function isFinalStatusToken(value) {
  return /^(?:FT|FULL_TIME|STATUS_FULL_TIME|FINAL|STATUS_FINAL|STATUS_FINAL_AET|STATUS_FINAL_PEN|AET|PEN|PENALTIES)$/u.test(
    normalizedToken(value)
  );
}

function isTerminalMinuteToken(value) {
  return /^(?:FT|FULL_TIME|FINAL|AET|PEN|PENALTIES)$/u.test(
    normalizedToken(value)
  );
}

function isCompletedMinuteClock(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 90;
  }

  const token = String(value ?? "").trim().toUpperCase();
  const match = token.match(
    /^(\d{2,3})(?:['’])?(?:\s*\+\s*(\d+)(?:['’])?)?$/u
  );

  return Boolean(match && Number(match[1]) >= 90);
}

function isPlayedFinalRow(row) {
  return [
    row?.status,
    row?.rawStatus,
    row?.statusType
  ].some(isFinalStatusToken);
}

function terminalMinuteDisplayEquivalent(before, after, row) {
  if (!isPlayedFinalRow(row)) return false;

  return (
    (isTerminalMinuteToken(before) && isCompletedMinuteClock(after)) ||
    (isTerminalMinuteToken(after) && isCompletedMinuteClock(before))
  );
}

function fieldEquivalent(field, before, after, row) {
  if (Object.is(before, after)) return true;

  return (
    field === "minute" &&
    terminalMinuteDisplayEquivalent(before, after, row)
  );
}

function signatureProjection(row) {
  return {
    status: String(row?.status || ""),
    rawStatus: String(row?.rawStatus || ""),
    minute: String(row?.minute || ""),
    scoreHome: explicitFiniteNumberOrNull(row?.scoreHome),
    scoreAway: explicitFiniteNumberOrNull(row?.scoreAway)
  };
}

function difference(field, before, after) {
  return { field, before: before ?? null, after: after ?? null };
}

export function assessDetailStatusState(detail, row) {
  const source = authoritativeRow(row);

  if (!detail || typeof detail !== "object") {
    return {
      ok: false,
      reason: "detail_missing_or_invalid",
      source,
      basicDifferences: [],
      signatureDifferences: []
    };
  }

  if (!detail.basic || typeof detail.basic !== "object") {
    return {
      ok: false,
      reason: "detail_basic_missing_or_invalid",
      source,
      basicDifferences: [],
      signatureDifferences: []
    };
  }

  const basicDifferences = [];

  for (const field of REQUIRED_BASIC_FIELDS) {
    if (!hasOwn(source, field)) continue;
    if (fieldEquivalent(field, detail.basic[field], source[field], source)) {
      continue;
    }
    basicDifferences.push(difference(field, detail.basic[field], source[field]));
  }

  for (const field of OPTIONAL_BASIC_FIELDS) {
    if (!hasOwn(detail.basic, field)) continue;
    if (!hasOwn(source, field)) continue;
    if (fieldEquivalent(field, detail.basic[field], source[field], source)) {
      continue;
    }
    basicDifferences.push(difference(field, detail.basic[field], source[field]));
  }

  const rawSignature = detail?.meta?.signature;
  if (typeof rawSignature !== "string" || rawSignature.trim() === "") {
    return {
      ok: false,
      reason: "detail_signature_missing",
      source,
      basicDifferences,
      signatureDifferences: [],
      signature: null
    };
  }

  let signature;
  try {
    signature = JSON.parse(rawSignature);
  } catch {
    return {
      ok: false,
      reason: "detail_signature_invalid_json",
      source,
      basicDifferences,
      signatureDifferences: [],
      signature: null
    };
  }

  if (!signature || typeof signature !== "object" || Array.isArray(signature)) {
    return {
      ok: false,
      reason: "detail_signature_invalid_shape",
      source,
      basicDifferences,
      signatureDifferences: [],
      signature: null
    };
  }

  const expectedSignature = signatureProjection(source);
  const signatureDifferences = [];

  for (const field of SIGNATURE_FIELDS) {
    if (
      fieldEquivalent(
        field,
        signature[field],
        expectedSignature[field],
        source
      )
    ) {
      continue;
    }

    signatureDifferences.push(
      difference(field, signature[field], expectedSignature[field])
    );
  }

  return {
    ok: true,
    reason: null,
    source,
    basicDifferences,
    signatureDifferences,
    signature,
    expectedSignature,
    changed:
      basicDifferences.length > 0 ||
      signatureDifferences.length > 0
  };
}

export function synchronizeDetailStatusState(
  detail,
  row,
  { patchedAt = new Date().toISOString() } = {}
) {
  const assessment = assessDetailStatusState(detail, row);
  if (!assessment.ok) {
    return {
      ...assessment,
      changed: false
    };
  }

  if (!assessment.changed) {
    return assessment;
  }

  for (const item of assessment.basicDifferences) {
    detail.basic[item.field] = item.after;
  }

  for (const item of assessment.signatureDifferences) {
    assessment.signature[item.field] = item.after;
  }

  detail.meta.signature = JSON.stringify(assessment.signature);
  detail.basic.lastStatusPatchedAt = patchedAt;

  return {
    ...assessment,
    changed: true
  };
}

export function applyBasicMutableStatusFields(basic, row) {
  if (!basic || typeof basic !== "object" || !row || typeof row !== "object") {
    return false;
  }

  const source = authoritativeRow(row);
  let changed = false;

  for (const field of REQUIRED_BASIC_FIELDS) {
    if (!hasOwn(source, field)) continue;
    if (fieldEquivalent(field, basic[field], source[field], source)) {
      continue;
    }
    basic[field] = source[field];
    changed = true;
  }

  for (const field of OPTIONAL_BASIC_FIELDS) {
    if (!hasOwn(basic, field)) continue;
    if (!hasOwn(source, field)) continue;
    if (fieldEquivalent(field, basic[field], source[field], source)) {
      continue;
    }
    basic[field] = source[field];
    changed = true;
  }

  return changed;
}
