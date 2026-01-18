(function () {
  const VALUE_URL = "https://aimatchlab-main.pierros1402.workers.dev/value-picks";

  let lastSnapshot = null;

  async function fetchValue() {
    try {
      const res = await fetch(VALUE_URL);
      if (!res.ok) return;

      const data = await res.json();
      if (!data || !Array.isArray(data.items)) return;

      lastSnapshot = data.items;
      emit("value:update", lastSnapshot);
    } catch (e) {
      console.warn("[value-adapter] failed", e);
    }
  }

  // 🔑 CRITICAL: replay for late subscribers
  on("value:subscribe", () => {
    if (lastSnapshot) {
      emit("value:update", lastSnapshot);
    }
  });

  fetchValue();
  setInterval(fetchValue, 30 * 60 * 1000);
})();
