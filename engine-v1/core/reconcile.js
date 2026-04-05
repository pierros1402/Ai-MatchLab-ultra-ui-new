// =====================================================
// RECONCILE (CHANGE-AWARE)
// =====================================================

function buildSignature(row) {
  return [
    row.kickoffUtc ?? "",
    row.status ?? "",
    row.minute ?? "",
    row.scoreHome ?? "",
    row.scoreAway ?? "",
    row.venue ?? ""
  ].join("|");
}

export function reconcileFixture(existing, incoming) {
  const now = Date.now();

  // ---------------------------------
  // NEW
  // ---------------------------------
  if (!existing) {
    const signature = buildSignature(incoming);

    return {
      ...incoming,
      signature,
      firstSeenAt: now,
      lastSeenAt: now,
      lastChangedAt: now
    };
  }

  // ---------------------------------
  // EXISTING
  // ---------------------------------
  const newSignature = buildSignature(incoming);

  const isChanged = newSignature !== existing.signature;

  if (!isChanged) {
    // only touch lastSeenAt
    return {
      ...existing,
      lastSeenAt: now
    };
  }

  // ---------------------------------
  // CHANGED
  // ---------------------------------
  return {
    ...existing,

    // canonical fields overwrite
    kickoffUtc: incoming.kickoffUtc,
    status: incoming.status,
    rawStatus: incoming.rawStatus,
    scoreHome: incoming.scoreHome,
    scoreAway: incoming.scoreAway,
    minute: incoming.minute,
    venue: incoming.venue,

    // bookkeeping
    signature: newSignature,
    lastSeenAt: now,
    lastChangedAt: now
  };
}