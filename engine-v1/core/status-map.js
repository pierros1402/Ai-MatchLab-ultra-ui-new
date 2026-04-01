export function mapStatus(rawStatus = "") {
  const s = String(rawStatus).toUpperCase();

  if (
    s.includes("STATUS_SCHEDULED") ||
    s.includes("SCHEDULED") ||
    s.includes("PRE_GAME")
  ) {
    return "PRE";
  }

  if (
    s.includes("STATUS_IN_PROGRESS") ||
    s.includes("IN_PROGRESS") ||
    s.includes("HALFTIME") ||
    s.includes("HALF_TIME") ||
    s.includes("DELAYED")
  ) {
    return "LIVE";
  }

  if (
    s.includes("STATUS_FULL_TIME") ||
    s.includes("FINAL") ||
    s.includes("FULL_TIME") ||
    s.includes("AFTER_EXTRA_TIME") ||
    s.includes("AFTER_PENALTIES") ||
    s.includes("COMPLETE")
  ) {
    return "FT";
  }

  if (
    s.includes("POSTPONED") ||
    s.includes("CANCELLED") ||
    s.includes("ABANDONED") ||
    s.includes("SUSPENDED")
  ) {
    return "SPECIAL";
  }

  return "UNKNOWN";
}

export function isLive(rawStatus = "") {
  return mapStatus(rawStatus) === "LIVE";
}

export function isFinal(rawStatus = "") {
  return mapStatus(rawStatus) === "FT";
}