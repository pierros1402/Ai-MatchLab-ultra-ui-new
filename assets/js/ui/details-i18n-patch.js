/* =====================================================
   Details i18n Patch (SAFE) - FULL DETAILS PANEL (EVENT-DRIVEN)
===================================================== */
(() => {
  const LS_LANG = "aiml-lang";

  const MAP = {
    en: {
      "Check Updates": "Check Updates",
      "Refresh Intel": "Refresh Intel",
      "League:": "League:",
      "ID:": "ID:",
      "Waiting for standard questions…": "Waiting for standard questions…",
      "HOME WIN PATH": "HOME WIN PATH",
      "DRAW PATH": "DRAW PATH",
      "AWAY WIN PATH": "AWAY WIN PATH",
      "Risk Meter (0–100)": "Risk Meter (0–100)",
      "Upset Risk": "Upset Risk",
      "Draw Risk": "Draw Risk",
      "Key Insights": "Key Insights",
      "(standings from cache)": "(standings from cache)",
      "Standings unavailable.": "Standings unavailable.",
      "No stats.": "No stats.",
      "Loading…": "Loading…",
      "Checking updates…": "Checking updates…",
      "Refreshing…": "Refreshing…",
      "Failed.": "Failed.",

      "Context Snapshot": "Context Snapshot",
      "Market Paths (1/X/2)": "Market Paths (1/X/2)",
      "Risk & Volatility": "Risk & Volatility",
      "Key Triggers": "Key Triggers",
      "Value Notes": "Value Notes",
      "Q:": "Q:",
      "A:": "A:"
    },
    el: {
      "Check Updates": "Έλεγχος Updates",
      "Refresh Intel": "Ανανέωση Intel",
      "League:": "Λίγκα:",
      "ID:": "ID:",
      "Waiting for standard questions…": "Αναμονή για standard questions…",
      "HOME WIN PATH": "ΔΙΑΔΡΟΜΗ ΝΙΚΗΣ (HOME)",
      "DRAW PATH": "ΔΙΑΔΡΟΜΗ ΙΣΟΠΑΛΙΑΣ",
      "AWAY WIN PATH": "ΔΙΑΔΡΟΜΗ ΝΙΚΗΣ (AWAY)",
      "Risk Meter (0–100)": "Μετρητής Ρίσκου (0–100)",
      "Upset Risk": "Ρίσκο Έκπληξης",
      "Draw Risk": "Ρίσκο Ισοπαλίας",
      "Key Insights": "Κύρια Insights",
      "(standings from cache)": "(βαθμολογία από cache)",
      "Standings unavailable.": "Η βαθμολογία δεν είναι διαθέσιμη.",
      "No stats.": "Δεν υπάρχουν στατιστικά.",
      "Loading…": "Φόρτωση…",
      "Checking updates…": "Έλεγχος ενημερώσεων…",
      "Refreshing…": "Ανανέωση…",
      "Failed.": "Αποτυχία.",

      "Context Snapshot": "Σύνοψη Πλαισίου",
      "Market Paths (1/X/2)": "Διαδρομές Αγοράς (1/X/2)",
      "Risk & Volatility": "Ρίσκο & Μεταβλητότητα",
      "Key Triggers": "Κρίσιμα Triggers",
      "Value Notes": "Σημειώσεις Value",
      "Q:": "Ερ.:",
      "A:": "Απ.:"
    }
  };

  function getLang() {
    try {
      const v = localStorage.getItem(LS_LANG);
      return v === "el" ? "el" : "en";
    } catch (_) {
      return "en";
    }
  }

  function applyTranslations(root) {
    const dict = MAP[getLang()] || MAP.en;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (const n of nodes) {
      const raw = n.nodeValue;
      if (!raw) continue;
      const trimmed = raw.trim();
      if (!trimmed) continue;
      if (dict[trimmed]) n.nodeValue = raw.replace(trimmed, dict[trimmed]);
    }

    root.querySelectorAll("button").forEach((btn) => {
      const txt = (btn.textContent || "").trim();
      if (dict[txt]) btn.textContent = dict[txt];
    });
  }

  function findLikelyDetailsRoot() {
    const candidates = Array.from(document.querySelectorAll("div, section, article, aside"));
    for (const el of candidates) {
      const t = el.textContent || "";
      if (t.includes("AIML Hybrid Match Intel") && t.includes("AIML Standard Questions")) {
        return el;
      }
    }
    return null;
  }

  function apply() {
    const root = findLikelyDetailsRoot();
    if (!root) return;
    applyTranslations(root);
  }

  const boot = () => {
    apply();
    document.addEventListener("language-changed", apply);
    document.addEventListener("details-rendered", apply);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
