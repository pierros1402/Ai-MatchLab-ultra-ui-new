(function () {
  const root = document.getElementById("top-picks-body");
  if (!root || !window.on) return;

  function render(items) {
    root.innerHTML = "";

    if (!items || items.length === 0) {
      root.innerHTML = `<div class="panel-empty">No top picks</div>`;
      return;
    }

    items.forEach(it => {
      const row = document.createElement("div");
      row.className = "pick-row";
      row.textContent = `${it.match} • ${it.market} • ${it.score}`;
      root.appendChild(row);
    });
  }

  on("top-picks:update", render);
})();
