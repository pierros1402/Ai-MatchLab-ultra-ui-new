/* =========================================================
   VALUE ADAPTER (anti-429 patch)
========================================================= */

(function () {
  if (!window.on || !window.emit) return;

  const TZ = "Europe/Athens";
  const BASE = "https://aimatchlab-main-worker.pierros1402.workers.dev";

  const ENDPOINT = (window.AIML_LIVE_CFG && window.AIML_LIVE_CFG.valuePicksPath) || "/value-picks";

  // ✅ Anti-429 guard (cooldown + backoff)
  let __AIML_VALUE_LAST_FETCH_MS = 0;
  let __AIML_VALUE_INFLIGHT = false;
  let __AIML_VALUE_BACKOFF_UNTIL = 0;

  const __AIML_VALUE_COOLDOWN_MS = 30_000;   // 30s cooldown (prevents spam)
  const __AIML_VALUE_BACKOFF_429_MS = 60_000; // 60s backoff on 429

  function pad2(n) { return String(n).padStart(2, "0"); }

  function ymdTodayAthens() {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(new Date());

      const y = parts.find(p => p.type === "year")?.value;
      const m = parts.find(p => p.type === "month")?.value;
      const d = parts.find(p => p.type === "day")?.value;

      return `${y}-${m}-${d}`;
    } catch {
      const d = new Date();
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
  }

  async function fetchValue(dateYmd) {
    const now = Date.now();

    // ✅ prevent parallel requests
    if (__AIML_VALUE_INFLIGHT) return null;

    // ✅ if we are rate limited, wait
    if (now < __AIML_VALUE_BACKOFF_UNTIL) return null;

    // ✅ cooldown: do not hammer endpoint
    if (now - __AIML_VALUE_LAST_FETCH_MS < __AIML_VALUE_COOLDOWN_MS) return null;

    const url =
      (BASE ? BASE.replace(/\/$/, "") : "https://aimatchlab-main-worker.pierros1402.workers.dev") +
      ENDPOINT +
      `?date=${encodeURIComponent(dateYmd)}`;

    __AIML_VALUE_INFLIGHT = true;

    try {
      const r = await fetch(url, { cache: "no-store" });

      if (r.status === 429) {
        __AIML_VALUE_BACKOFF_UNTIL = Date.now() + __AIML_VALUE_BACKOFF_429_MS;
        console.warn("[value-adapter] 429 rate-limited -> backoff 60s");
        return null;
      }

      if (!r.ok) {
        console.warn("[value-adapter] fetch failed", r.status);
        return null;
      }

      const data = await r.json();
      __AIML_VALUE_LAST_FETCH_MS = Date.now();
      return data;
    } catch (err) {
      console.warn("[value-adapter] fetch error", err);
      return null;
    } finally {
      __AIML_VALUE_INFLIGHT = false;
    }
  }

  async function refresh(dateYmd) {
    const date = dateYmd || ymdTodayAthens();
    const data = await fetchValue(date);

    // if blocked by cooldown/backoff -> keep last UI state (no spam)
    if (!data) return;

    const items = Array.isArray(data.items) ? data.items : [];
    console.log(`[value-adapter] update ${date} picks= ${items.length}`);

    emit("value-picks:loaded", {
      source: "value",
      date,
      items
    });

    emit("value:update", { date, items });

  }

  // ✅ Run once on load (safe)
  setTimeout(() => {
    refresh();
  }, 250);

  // ✅ If Today panel fires often, cooldown will protect us
  on("today-matches:loaded", (payload) => {
    const date = (payload && payload.date) ? payload.date : ymdTodayAthens();
    refresh(date);
  });

  // Optional: allow manual force refresh without spam
  on("value:refresh", (dateYmd) => {
    // bypass cooldown only if you want, but for safety we keep it respecting cooldown
    refresh(dateYmd);
  });

})();
