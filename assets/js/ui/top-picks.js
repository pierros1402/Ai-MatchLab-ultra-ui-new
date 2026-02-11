(function () {
  const root = document.getElementById("top-picks-body");
  if (!root || !window.on) return;

  function format2(x) {
    if (typeof x !== "number" || !isFinite(x)) return "—";
    return x.toFixed(2);
  }

  function render(items) {
    root.innerHTML = "";

    if (!items || items.length === 0) {
      root.innerHTML = `<div class="panel-empty">No top picks</div>`;
      return;
    }

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

  on("top-picks:update", render);
})();