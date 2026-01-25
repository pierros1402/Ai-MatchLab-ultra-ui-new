/* =========================================================
   saved-panel.js — Saved viewer (FINAL)
   Listens to saved:updated (canonical) and saved:changed (legacy)
========================================================= */

(function () {
  if (!window.on || !window.emit) return;

  const listEl = document.getElementById("saved-list");
  if (!listEl) return;

  function clear() {
    listEl.innerHTML = "";
  }

  function statusRank(m) {
    const s = String(m?.status || "").toUpperCase();
    if (s === "LIVE") return 0;
    if (s === "PRE") return 1;
    return 2; // FT / άλλα
  }

  function render(matches) {
    clear();

    if (!matches || matches.length === 0) {
      const empty = document.createElement("div");
      empty.className = "list-empty";
      empty.textContent = "No saved matches";
      listEl.appendChild(empty);
      return;
    }

    const arr = matches
      .slice()
      .sort((a, b) => {
        const s = statusRank(a) - statusRank(b);
        if (s !== 0) return s;
        return (a.kickoff_ms || 0) - (b.kickoff_ms || 0);
      });

    // Prefer existing row renderer if your project has it
    if (typeof window.renderMatchRow === "function") {
      arr.forEach(m => listEl.appendChild(window.renderMatchRow(m)));
      return;
    }

    // Fallback minimal renderer (safe)
    arr.forEach(m => {
      const row = document.createElement("div");
      row.className = "today-row";

      const left = document.createElement("div");
      left.className = "today-match";
      left.textContent = `${m.home} – ${m.away}`;

      const right = document.createElement("div");
      right.className = "today-right";

      const info = document.createElement("span");
      const s = String(m.status || "").toUpperCase();
      if (s === "LIVE") {
        const min = m.minute ? `${m.minute}'` : "";
        const sc = (m.scoreHome != null && m.scoreAway != null) ? `${m.scoreHome}-${m.scoreAway}` : "";
        info.textContent = `${min} ${sc}`.trim();
      } else if (s === "FT") {
        info.textContent = (m.scoreHome != null && m.scoreAway != null) ? `${m.scoreHome}-${m.scoreAway}` : "FT";
      } else {
        info.textContent = "";
      }

      // allow unsave from Saved
      const save = document.createElement("span");
      save.className = "match-save";
      save.textContent = "★";
      save.onclick = e => {
        e.stopPropagation();
        window.emit("save-toggle", m);
      };

      const details = document.createElement("span");
      details.className = "match-details";
      details.textContent = "ⓘ";
      details.onclick = e => {
        e.stopPropagation();
        window.emit("details-open", { match: m });
      };

      right.appendChild(info);
      right.appendChild(save);
      right.appendChild(details);

      row.appendChild(left);
      row.appendChild(right);

      row.onclick = () => {
        window.emit("match-selected", m);
        window.emit("active-match:set", m);
      };

      listEl.appendChild(row);
    });
  }

  // canonical
  window.on("saved:updated", payload => {
    const matches = Array.isArray(payload?.items) ? payload.items : [];
    render(matches);
  });

  // legacy
  window.on("saved:changed", arr => {
    render(Array.isArray(arr) ? arr : []);
  });

  // paint once
  try {
    render(window.getSavedMatches ? window.getSavedMatches() : []);
  } catch {
    clear();
  }
})();
