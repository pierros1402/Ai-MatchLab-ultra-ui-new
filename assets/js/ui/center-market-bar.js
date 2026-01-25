/* =========================================================
   CENTER MARKET BAR — PRODUCTION SAFE
   Role:
   - Always-on market selector
   - Emits market-selected
   - Stores last market for late subscribers
========================================================= */

(function () {

  const DEFAULT_MARKET = "1X2";

  const MARKETS = [
    { id: "1X2", label: "1X2" },
    { id: "DC", label: "Double Chance" },
    { id: "GG", label: "BTTS" },
    { id: "OU15", label: "Over / Under 1.5" },
    { id: "OU25", label: "Over / Under 2.5" },
    { id: "OU35", label: "Over / Under 3.5" }
  ];

  function emitMarket(market) {
    // store last selected market (for late listeners)
    window.AIML_LAST_MARKET = market;

    if (window.emit) {
      window.emit("market-selected", {
        market: market,
        source: "center-market-bar"
      });
    }
  }

  function mountBar() {
    const center = document.querySelector("#center-panel");
    if (!center) return;

    // prevent duplicate mount
    if (center.querySelector(".center-market-bar")) return;

    const bar = document.createElement("div");
    bar.className = "center-market-bar";

    bar.innerHTML = `
      <div class="cmb-left">
        <span class="cmb-title">Odds Intelligence Center</span>
      </div>
      <div class="cmb-right">
        <label class="cmb-label">Market</label>
        <select class="cmb-select"></select>
      </div>
    `;

    const select = bar.querySelector(".cmb-select");

    for (let i = 0; i < MARKETS.length; i++) {
      const m = MARKETS[i];
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.label;
      select.appendChild(opt);
    }

    select.value = DEFAULT_MARKET;

    select.addEventListener("change", function () {
      emitMarket(select.value);
    });

    center.prepend(bar);

    // initial market emit
    emitMarket(DEFAULT_MARKET);
  }

  // mount when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountBar);
  } else {
    mountBar();
  }

})();
