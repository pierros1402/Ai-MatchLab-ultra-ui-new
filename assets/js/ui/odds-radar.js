(function () {
  const root = document.getElementById("radar-panel-body");
  if (!root || !window.on) return;

  function render(items) {
    root.innerHTML = "";

    if (!items || items.length === 0) {
      root.innerHTML = `<div class="panel-empty">No radar signals</div>`;
      return;
    }

    items.forEach(it => {
      const row = document.createElement("div");
      row.className = "radar-row";
      row.textContent = `${it.match} • ${it.book} • Δ ${it.delta}`;
      root.appendChild(row);
    });
  }

  on("radar:update", render);
})();
