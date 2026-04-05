export function mapStatus(rawStatus = "") {
  const s = String(rawStatus).toUpperCase();

  // PRE
  if (
    s.includes("STATUS_SCHEDULED") ||
    s.includes("SCHEDULED") ||
    s.includes("PRE_GAME")
  ) {
    return "PRE";
  }

  // FIRST HALF
  if (
    s.includes("FIRST_HALF") ||
    s.includes("1ST_HALF")
  ) {
    return "FIRST_HALF";
  }

  // SECOND HALF
  if (
    s.includes("SECOND_HALF") ||
    s.includes("2ND_HALF")
  ) {
    return "SECOND_HALF";
  }

  // HALFTIME
  if (
    s.includes("HALFTIME") ||
    s.includes("HALF_TIME")
  ) {
    return "HALF_TIME";
  }

  // GENERIC LIVE
  if (
    s.includes("STATUS_IN_PROGRESS") ||
    s.includes("IN_PROGRESS") ||
    s.includes("DELAYED")
  ) {
    return "LIVE";
  }

  // FINAL
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

  // SPECIAL
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
  const s = mapStatus(rawStatus);
  return (
    s === "LIVE" ||
    s === "FIRST_HALF" ||
    s === "SECOND_HALF" ||
    s === "HALF_TIME"
  );
}

export function isFinal(rawStatus = "") {
  return mapStatus(rawStatus) === "FT";
}