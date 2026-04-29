function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value == null) return [];
  return [value].filter(Boolean);
}

function cleanText(value) {
  return String(value || "").trim();
}

function isUrlLike(value) {
  const text = cleanText(value).toLowerCase();
  return text.startsWith("http://") || text.startsWith("https://") || text.includes("www.");
}

function isBadPlayerName(value) {
  const text = cleanText(value);
  const lower = text.toLowerCase();

  if (!text || text.length < 3) return true;
  if (isUrlLike(text)) return true;
  if (lower === "evidence") return true;
  if (lower.startsWith("evidence:")) return true;
  if (lower === "source") return true;
  if (lower === "sources") return true;
  if (lower === "note") return true;
  if (lower === "notes") return true;
  if (lower.includes("http")) return true;

  return false;
}

function normalizeImportance(value) {
  const text = cleanText(value).toLowerCase();
  if (["low", "medium", "high"].includes(text)) return text;
  return "medium";
}

function normalizeAbsence(item) {
  if (!item || typeof item !== "object") return null;

  const player =
    cleanText(item.player) ||
    cleanText(item.name) ||
    cleanText(item.playerName);

  if (isBadPlayerName(player)) return null;

  const reason = cleanText(item.reason || item.note || item.description);

  return {
    player,
    reason: reason && !isUrlLike(reason) ? reason : null,
    importance: normalizeImportance(item.importance)
  };
}

export function validateCanonicalTeamNewsPayload(payload = {}) {
  const homeRaw = asArray(payload?.data?.home?.absences);
  const awayRaw = asArray(payload?.data?.away?.absences);

  const home = homeRaw.map(normalizeAbsence).filter(Boolean);
  const away = awayRaw.map(normalizeAbsence).filter(Boolean);

  return {
    ok: true,
    data: {
      home: {
        absences: home
      },
      away: {
        absences: away
      }
    },
    diagnostics: {
      rawHomeAbsences: homeRaw.length,
      rawAwayAbsences: awayRaw.length,
      cleanHomeAbsences: home.length,
      cleanAwayAbsences: away.length
    }
  };
}