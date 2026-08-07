/* date-nav.js — ±7 day navigation strip.
 *
 * Operational-day authority: window.AIML_OperationalDay (Europe/Athens calendar).
 * Static UI snapshot files are never used as a date source.
 */
(function () {
  "use strict";

  const container = document.getElementById("date-nav");
  if (!container) return;

  const RANGE = 7;

  function validDay(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  }

  function fallbackAthensDay() {
    try {
      return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Athens" });
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function operationalDay() {
    const serviceDay = window.AIML_OperationalDay?.getDay?.();
    return validDay(serviceDay) ? serviceDay : fallbackAthensDay();
  }

  function addDays(ymd, amount) {
    return new Date(new Date(`${ymd}T12:00:00Z`).getTime() + amount * 86400000)
      .toISOString()
      .slice(0, 10);
  }

  function shortLabel(ymd) {
    const date = new Date(`${ymd}T12:00:00Z`);
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return `${days[date.getUTCDay()]} ${date.getUTCDate()}`;
  }

  function emit(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
    if (typeof window.emit === "function") {
      window.emit(name, detail);
    }
    if (window.AIML && typeof window.AIML.emit === "function") {
      window.AIML.emit(name, detail);
    }
  }

  let today = operationalDay();
  let activeDate = today;

  function publishSelection(date) {
    const selected = validDay(date) ? date : today;
    activeDate = selected;
    window.__AIML_SELECTED_DATE = selected;
    window.__AIML_VIEWING_NON_TODAY_DATE = selected !== today ? selected : null;
  }

  function render() {
    const pills = [];

    for (let offset = -RANGE; offset <= RANGE; offset += 1) {
      const day = addDays(today, offset);
      const isToday = day === today;
      const isActive = day === activeDate;
      const className =
        "date-pill" +
        (isToday ? " date-pill-today" : "") +
        (isActive ? " date-pill-active" : "");
      const label = isToday ? "Today" : shortLabel(day);

      pills.push(
        `<button class="${className}" data-date="${day}">${label}</button>`
      );
    }

    container.innerHTML = `<div class="date-nav-inner">${pills.join("")}</div>`;

    container.querySelectorAll(".date-pill").forEach(button => {
      button.addEventListener("click", () => {
        publishSelection(button.getAttribute("data-date"));
        render();
        emit("date:change", {
          date: activeDate,
          isToday: activeDate === today,
          operationalDay: today,
          reason: "user_selection"
        });
      });
    });

    const active = container.querySelector(".date-pill-active");
    active?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }

  function adoptOperationalDay(nextDay, reason) {
    if (!validDay(nextDay) || nextDay === today) return;

    const previousDay = today;
    const wasFollowingToday =
      !window.__AIML_VIEWING_NON_TODAY_DATE && activeDate === previousDay;

    today = nextDay;
    window.__AIML_OPERATIONAL_DAY = today;

    if (wasFollowingToday) {
      publishSelection(today);
    }

    render();

    if (wasFollowingToday) {
      emit("date:change", {
        date: today,
        isToday: true,
        operationalDay: today,
        reason: reason || "operational_day_change"
      });
    }
  }

  publishSelection(today);
  render();

  window.addEventListener("operational-day:change", event => {
    adoptOperationalDay(event?.detail?.day, "athens_day_rollover");
  });

  // Initial authoritative selection event. This is emitted after all scripts in
  // the current task are loaded via a zero-delay timer, avoiding a race with the
  // date loader registered later in index.html.
  window.setTimeout(() => {
    emit("date:change", {
      date: activeDate,
      isToday: true,
      operationalDay: today,
      reason: "initial_operational_day"
    });
  }, 0);

  window.DateNav = {
    getActiveDate: () => activeDate,
    getToday: () => today,
    setDate: date => {
      if (!validDay(date)) return;
      publishSelection(date);
      render();
    }
  };
})();
