function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value == null) return [];
  return [value].filter(Boolean);
}

function cleanText(value) {
  return String(value || "").trim();
}

function extractTeamNewsPlayerName(item = {}) {
  const raw =
    item?.player ??
    item?.name ??
    item?.fullName ??
    item?.playerName;

  if (typeof raw === "string" || typeof raw === "number") {
    return cleanText(raw);
  }

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return cleanText(
      raw.name ||
      raw.fullName ||
      raw.playerName ||
      raw.displayName ||
      raw.shortName
    );
  }

  return "";
}


function isUrlLike(value) {
  const text = cleanText(value).toLowerCase();
  return text.startsWith("http://") || text.startsWith("https://") || text.includes("www.");
}

function looksLikeSentence(value) {
  const text = cleanText(value);
  if (!text) return false;
  if (text.length > 55) return true;
  if (/[.!?]$/.test(text) && text.split(/\s+/).length >= 6) return true;
  if (/\b(official|coverage|published|fixture|comments|confirmed|reported|announced|ahead of|pre-match|post-match|club media|press conference|training update)\b/i.test(text) && text.split(/\s+/).length >= 5) return true;
  return false;
}


function isGenericTeamNewsInjuryTerm(value) {
  const lower = String(value || "").trim().toLowerCase();

  if (!lower) return false;

  const genericInjuryTerms = new Set([
    "knee",
    "ankle",
    "hamstring",
    "calf",
    "thigh",
    "groin",
    "shoulder",
    "back",
    "head",
    "foot",
    "leg",
    "muscle",
    "injury",
    "injured",
    "illness",
    "suspension",
    "suspended",
    "doubtful",
    "questionable",
    "out",
    "unavailable",
    "fitness",
    "match fitness",
    "knock",
    "strain",
    "sprain",
    "minor injury",
    "long-term injury",
    "adductor",
    "lower leg",
    "upper leg",
    "acl",
    "achilles",
    "meniscus",
    "hip",
    "rib",
    "ribs",
    "concussion",
    "ill",
    "illness",
    "personal reasons",
    "not disclosed",
    "undisclosed",
    "day-to-day",
    "fitness issue",
    "medical",
    "rehab",
    "recovery",
    "upper body injury",
    "lower body injury",
    "body injury",
    "upper-body",
    "lower-body",
    "upper body",
    "lower body",
    "hamstring injury",
    "sports hernia"
  ]);

  if (genericInjuryTerms.has(lower)) return true;

  const compact = lower.replace(/\s+/g, " ").trim();
  if (genericInjuryTerms.has(compact)) return true;

  if (compact.includes(":")) {
    const parts = compact.split(":").map(v => v.trim()).filter(Boolean);
    if (parts.length > 0 && parts.every(part => genericInjuryTerms.has(part))) {
      return true;
    }
  }

  return false;
}


function isBadTeamNewsBoilerplateText(value) {
  const text = String(value || "").trim();
  const lower = text.toLowerCase().replace(/\s+/g, " ").trim();

  if (!text) return false;
  if (lower.includes("[object object]")) return true;

  const badExactPlayerTerms = new Set([
    "placar final",
    "menu principal",
    "futebol futebol",
    "mais esportes mais",
    "esportes disney plus",
    "podcasts podcasts programa",
    "busca vit",
    "brasileiro serie",
    "coritiba coritiba",
    "pen pedro rocha",
    "resumo coment",
    "podcasts disney",
    "ediciones programa",
    "games ediciones",
    "rugby voleibol",
    "gaming rugby",
    "poker nata",
    "motor poker",
    "golfe ciclismo",
    "atletismo golfe",
    "futsal basquete",
    "surfe futsal",
    "mais esportes",
    "futebol not",
    "games ediciones programa",
    "gaming rugby voleibol",
    "motor poker nata",
    "atletismo golfe ciclismo",
    "surfe futsal basquete",
    "mais esportes boxe",
    "more podcasts upcoming",
    "watch sky bet",
    "more sports scores",
    "racing darts netball",
    "rugby league golf",
    "cricket rugby union",
    "sky sports homepage",
    "sky sports skip"
  ]);

  if (badExactPlayerTerms.has(lower)) return true;

  const badNeedles = [
    "ir para o conteúdo principal",
    "ir para o menu principal",
    "espn futebol futebol",
    "nfl nfl nba",
    "espn knockout",
    "tênis tênis",
    "f1 f1",
    "olimpíadas olimpíada",
    "disney plus",
    "podcasts podcasts",
    "skip to content sky sports"
  ];

  if (badNeedles.some(needle => lower.includes(needle))) return true;

  if (/\b(placar final|menu principal|mais esportes|futebol futebol|busca vit|brasileiro serie)\b/i.test(text) && text.length > 40) {
    return true;
  }

  if (/\b(shots on target|fouls committed|yellow cards|red cards|goals against)\b/i.test(text) && text.length > 80) {
    return true;
  }

  return false;
}

function isBadPlayerName(value) {
  const text = cleanText(value);
  const lower = text.toLowerCase();

  if (!text || text.length < 3) return true;
  if (isBadTeamNewsBoilerplateText(text)) return true;
  if (isUrlLike(text)) return true;
  if (looksLikeSentence(text)) return true;
  if (lower.includes("http")) return true;

  const genericInjuryTerms = new Set([
    "knee",
    "ankle",
    "hamstring",
    "calf",
    "thigh",
    "groin",
    "shoulder",
    "back",
    "head",
    "foot",
    "leg",
    "muscle",
    "injury",
    "injured",
    "illness",
    "suspension",
    "suspended",
    "doubtful",
    "questionable",
    "out",
    "unavailable",
    "fitness",
    "match fitness",
    "knock",
    "strain",
    "sprain",
    "minor injury",
    "long-term injury"
  ]);

  if (lower.includes("[object object]")) return true;
  if (isGenericTeamNewsInjuryTerm(lower)) return true;
  if (genericInjuryTerms.has(lower)) return true;


  const blocked = new Set([
    "evidence",
    "source",
    "sources",
    "note",
    "notes",
    "team news",
    "injury update",
    "suspension",
    "suspended",
    "injured",
    "unavailable",
    "doubtful",
    "unknown",
    "confirmed",
    "reported"
  ]);

  if (blocked.has(lower)) return true;
  if (lower.startsWith("evidence:")) return true;
  if (lower.startsWith("source:")) return true;
  if (lower.startsWith("note:")) return true;

  return false;
}

function normalizeImportance(value) {
  const text = cleanText(value).toLowerCase();
  if (["low", "medium", "high"].includes(text)) return text;
  return "medium";
}


function normalizeTeamNewsAbsenceShape(playerValue, reasonValue = "") {
  let player = String(playerValue || "").trim();
  let reason = String(reasonValue || "").trim();

  const lowerPlayer = player.toLowerCase().replace(/\s+/g, " ").trim();

  const reasonOnlyTerms = new Set([
    "injury",
    "suspension",
    "suspended",
    "illness",
    "fitness",
    "doubtful",
    "questionable",
    "lower back",
    "lower body",
    "upper body",
    "broken foot",
    "hamstring",
    "knee",
    "calf",
    "groin",
    "achilles",
    "muscle"
  ]);

  // Reason-like text is never a player name. The exact-term set cannot
  // enumerate compound reasons ("Yellow card suspension — out until
  // 07/07/2026 — misses 2 games", "Ankle injury"), which used to slip
  // through as phantom "players".
  const reasonLikeText = value => {
    const v = String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
    return (
      reasonOnlyTerms.has(v) ||
      /^(unknown |red card |yellow card |ankle |knee |thigh |calf |groin |shoulder |muscle |hamstring )?\b(injur(y|ies|ed)|suspension|suspended|illness|surgery)\b/.test(v) ||
      /\b(out until \d|misses \d+ game)\b/.test(v)
    );
  };

  if (!player || reasonLikeText(lowerPlayer)) {
    return null;
  }

  if (lowerPlayer.includes("certain absentee")) {
    return null;
  }

  const suspendedMatch = player.match(/^(.+?)\s+is\s+suspended\.?$/i);
  if (suspendedMatch) {
    player = suspendedMatch[1].trim();
    reason = reason || "suspension";
  }

  if (player.includes(":")) {
    const parts = player.split(":").map(v => v.trim()).filter(Boolean);

    if (parts.length >= 2) {
      const first = parts[0];
      const second = parts.slice(1).join(": ").trim();

      // "Player: <reason>" — accept when the right side reads like a
      // reason (compound reasons included), not only exact set members.
      if (reasonLikeText(second)) {
        player = first;
        reason = reason || second;
      } else {
        return null;
      }
    }
  }

  if (!player || player.length < 3) return null;

  return {
    player,
    reason: reason || null
  };
}

function normalizeAbsence(item) {
  if (!item || typeof item !== "object") return null;

  const player = extractTeamNewsPlayerName(item);

  if (isBadPlayerName(player)) return null;

  const rawReason = cleanText(item.reason || item.note || item.description || item.status);
  const reason =
    rawReason &&
    !isUrlLike(rawReason) &&
    rawReason.toLowerCase() !== player.toLowerCase()
      ? rawReason
      : null;

  return {
    player,
    reason,
    importance: normalizeImportance(item.importance)
  };
}

function dedupeAbsences(items = []) {
  const out = [];
  const seen = new Set();

  for (const raw of Array.isArray(items) ? items : []) {
    const item = normalizeAbsence(raw);
    if (!item) continue;

    const key = [
      cleanText(item.player).toLowerCase(),
      cleanText(item.reason).toLowerCase(),
      cleanText(item.importance).toLowerCase()
    ].join("__");

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

export function validateCanonicalTeamNewsPayload(payload = {}) {
  const homeRaw = asArray(payload?.data?.home?.absences);
  const awayRaw = asArray(payload?.data?.away?.absences);

  const home = dedupeAbsences(homeRaw);
  const away = dedupeAbsences(awayRaw);

  const rejectedHomeAbsences = homeRaw.length - home.length;
  const rejectedAwayAbsences = awayRaw.length - away.length;

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
      cleanAwayAbsences: away.length,
      rejectedHomeAbsences,
      rejectedAwayAbsences,
      strictAbsenceGuard: true
    }
  };
}

export {
  isBadPlayerName,
  normalizeAbsence
};
