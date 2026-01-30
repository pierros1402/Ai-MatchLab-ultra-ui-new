(function () {
  "use strict";

  function isFinal(m) {
    return m.status === "FT";
  }

  function isConfirmedLive(m) {
    return m.status === "LIVE" || m.status === "HT";
  }

  function hasScore(m) {
    return Number.isFinite(m.scoreHome) && Number.isFinite(m.scoreAway);
  }

  function formatTime24(m) {
    const ts = m.kickoff_ms || m.kickoff;
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleTimeString("el-GR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  }

  window.renderMatchRow = function (m, opts = {}) {
    const row = document.createElement("div");
    row.className = "match-row";

    const main = document.createElement("div");
    main.className = "match-main";
    main.textContent = `${m.home} – ${m.away}`;

    const meta = document.createElement("div");
    meta.className = "match-meta";

    if (isFinal(m) && hasScore(m)) {
      meta.textContent = `${m.scoreHome}-${m.scoreAway}`;
      meta.classList.add("ft");
    } else if (isConfirmedLive(m) && hasScore(m)) {
      const min = m.minute ? ` ${m.minute}` : "";
      meta.textContent = `${m.scoreHome}-${m.scoreAway}${min}`;
      meta.classList.add("live");
    } else {
      meta.textContent = formatTime24(m);
      meta.classList.add("pre");
    }

    row.appendChild(main);
    row.appendChild(meta);

    row.addEventListener("click", () => {
      if (typeof window.emit === "function") {
        window.emit("match-selected", m);
        window.emit("active-match:set", m);
      }
    });

    return row;
  };
})();
