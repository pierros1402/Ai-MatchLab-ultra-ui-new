(function () {

  const panel =
    document.querySelector(".top-picks-panel");

  const root = document.getElementById("top-picks-body");
  if (!root || !window.on) return;

  function format2(x) {
    if (typeof x !== "number" || !isFinite(x)) return "—";
    return x.toFixed(2);
  }

  function render(items) {

    if (!Array.isArray(items)) {
      window.AIML_PANEL?.set(panel, "error", "Top picks feed error.");
      return;
    }

    if (!items.length) {
      root.innerHTML = "";
      window.AIML_PANEL?.set(panel, "empty", "No top picks");
      return;
    }

    window.AIML_PANEL?.set(panel, "data");

    root.innerHTML = "";

    items.forEach(it => {
      const row = document.createElement("div");
      row.className = "pick-row";

      const sign = it.delta > 0 ? "+" : "";

      row.textContent =
        `${it.match} | ${it.book} | ` +
        `${format2(it.open)} → ${format2(it.current)} | ` +
        `Δ ${sign}${format2(it.delta)}`;

      root.appendChild(row);
    });
  }

  window.AIML_PANEL?.set(panel, "loading", "Loading picks...");
  on("top-picks:update", render);

})();