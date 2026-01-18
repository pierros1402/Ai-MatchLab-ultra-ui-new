/* ============================================================
   AI MatchLab ULTRA — language.js (GLOBAL, NO MODULES)
   - EN/GR toggle
   - Updates key UI labels (safe, minimal)
   - Persists to localStorage
============================================================ */

(function () {
  "use strict";
  if (window.__AIML_LANG__) return;
  window.__AIML_LANG__ = true;

  const LS_LANG = "aiml-lang"; // "en" | "el"
  const $ = (id) => document.getElementById(id);

  const STR = {
    en: {
      nav: "Navigation",
      oic: "Odds Intelligence Center",
      intel: "Intelligence Panels",
      continents: "Continents",
      countries: "Countries",
      leagues: "Leagues",
      matches: "Matches",
      saved: "Saved",
      noMatchTitle: "No match selected",
      noMatchSub: "Select a match from the left panel.",
      detailsTitle: "Match Details",
      updateBanner: "New version available.",
      updateBtn: "Update",
    },
    el: {
      nav: "Πλοήγηση",
      oic: "Κέντρο Αποδόσεων",
      intel: "Πάνελ Ευφυΐας",
      continents: "Ήπειροι",
      countries: "Χώρες",
      leagues: "Λίγκες",
      matches: "Αγώνες",
      saved: "Saved",
      noMatchTitle: "Δεν έχει επιλεγεί αγώνας",
      noMatchSub: "Επίλεξε έναν αγώνα από το αριστερό πάνελ.",
      detailsTitle: "Λεπτομέρειες Αγώνα",
      updateBanner: "Νέα έκδοση διαθέσιμη.",
      updateBtn: "Ενημέρωση",
    },
  };

  function getLang() {
    try { return localStorage.getItem(LS_LANG) || "en"; } catch { return "en"; }
  }
  function setLang(lang) {
    const l = (lang === "el") ? "el" : "en";
    try { localStorage.setItem(LS_LANG, l); } catch {}
    document.documentElement.lang = l;
    return l;
  }

  function applyStrings(lang) {
    const t = STR[lang] || STR.en;

    // Top-level panel titles
    const leftTitle = document.querySelector("#left-panel .panel-header .panel-title");
    const centerTitle = document.querySelector("#center-panel .panel-header .panel-title");
    const rightTitle = document.querySelector("#right-panel .panel-header .panel-title");
    if (leftTitle) leftTitle.textContent = t.nav;
    if (centerTitle) centerTitle.textContent = t.oic;
    if (rightTitle) rightTitle.textContent = t.intel;

    // Accordion headers
    const map = {
      "panel-continents": t.continents,
      "panel-countries": t.countries,
      "panel-leagues": t.leagues,
      "panel-matches": t.matches,
      "panel-saved": t.saved,
    };
    document.querySelectorAll(".accordion-header[data-target]").forEach((h) => {
      const key = h.getAttribute("data-target");
      if (key && map[key]) h.textContent = map[key];
    });

    // Active match bar defaults (only if still default text)
    const ambTitle = $("amb-title");
    const ambSub = $("amb-sub");
    if (ambTitle && (ambTitle.textContent || "").toLowerCase().includes("no match")) ambTitle.textContent = t.noMatchTitle;
    if (ambSub && (ambSub.textContent || "").toLowerCase().includes("select a match")) ambSub.textContent = t.noMatchSub;

    // Details modal title (if present)
    const modalTitle = document.querySelector("#match-details-modal .modal-title");
    if (modalTitle) modalTitle.textContent = t.detailsTitle;

    // Update banner
    const banner = $("update-banner");
    const bannerSpan = banner?.querySelector("span");
    const btnUpdate = $("btn-update-now");
    if (bannerSpan) bannerSpan.textContent = t.updateBanner;
    if (btnUpdate) btnUpdate.textContent = t.updateBtn;

    // Button label
    const btnLang = $("btn-lang");
    if (btnLang) btnLang.textContent = (lang === "el") ? "GR" : "EN";

    // notify others
    try {
      if (typeof window.emit === "function") window.emit("language-changed", { lang });
      else document.dispatchEvent(new CustomEvent("language-changed", { detail: { lang } }));
    } catch {}
  }

  function init() {
    const btn = $("btn-lang");
    let lang = setLang(getLang());
    applyStrings(lang);

    btn?.addEventListener("click", (e) => {
      e.preventDefault();
      lang = setLang(lang === "en" ? "el" : "en");
      applyStrings(lang);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
