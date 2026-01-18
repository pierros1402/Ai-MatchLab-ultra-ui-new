/* ============================================================
   AI MatchLab ULTRA — TeamNames (display-only) v1.0
   - Centralized display aliases / short names
   - Does NOT modify canonical data; UI-only
============================================================ */
(function () {
  "use strict";
  if (window.TeamNames) return;

  const ALIAS = {
    // Spain
    "Deportivo La Coruña": "Dep. La Coruña",
    "Real Sociedad": "Real Soc.",
    // Germany
    "Borussia Mönchengladbach": "Gladbach",
    "Borussia Monchengladbach": "Gladbach",
    "Borussia M'gladbach": "Gladbach",
    "Mönchengladbach": "Gladbach",
    "Monchengladbach": "Gladbach"
  };

  const PREFIX_RE = /^(FC|CF|SC|AC|AS|SSC|SV|SSV|VfB|VfL|RB)\s+/i;

  function escNorm(s) {
    return String(s || "")
      .trim()
      .replace(/\s+/g, " ")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""); // remove accents
  }

  function aliasExact(name) {
    const k = escNorm(name);
    if (!k) return "";
    for (const [full, short] of Object.entries(ALIAS)) {
      if (escNorm(full) === k) return short;
    }
    return "";
  }

  function stripJunk(name) {
    let s = String(name || "").trim().replace(/\s+/g, " ");
    // remove bracketed junk (often TV channels / extra info)
    s = s.replace(/\s*\[[^\]]+\]\s*/g, " ").replace(/\s+/g, " ").trim();
    // strip common prefixes
    s = s.replace(PREFIX_RE, "");
    // special heuristic
    if (/borussia/i.test(s) && /monchengladbach|mönchengladbach/i.test(s)) return "Gladbach";
    return s;
  }

  function shortenGeneric(name, maxLen) {
    const s = String(name || "").trim();
    if (!s) return "";
    if (s.length <= maxLen) return s;

    const parts = s.split(" ");
    if (parts.length >= 2) {
      const first = parts[0];
      const rest = parts.slice(1).join(" ");
      const firstShort = first.length > 3 ? first.slice(0, 3) + "." : first;
      const candidate = `${firstShort} ${rest}`;
      if (candidate.length <= maxLen + 6) return candidate;
    }
    return s;
  }

  function display(name, opts) {
    const raw = String(name || "").trim();
    if (!raw) return "";

    const exact = aliasExact(raw);
    if (exact) return exact;

    const stripped = stripJunk(raw);
    const exact2 = aliasExact(stripped);
    if (exact2) return exact2;

    const maxLen = Number(opts && opts.maxLen) || 18;
    return shortenGeneric(stripped, maxLen);
  }

  function title(home, away, opts) {
    const h = display(home, opts);
    const a = display(away, opts);
    if (h && a) return `${h} - ${a}`;
    return h || a || "Match";
  }

  window.TeamNames = { display, title, _alias: ALIAS };
})();
