/* date-nav.js — ±7 day navigation strip.
 *
 * Calendar truth and publication truth are intentionally separate:
 *   - Today = Europe/Athens calendar date.
 *   - active data date = newest VERIFIED published release, unless the user
 *     explicitly navigates to another historical/future date.
 *
 * If today's release is pending, the real Today pill remains visible but is
 * disabled, while the last complete published day remains the active data day.
 * This prevents yesterday from ever being relabelled as Today and prevents a
 * user click from opening a half-built current-day release.
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

  function calendarDay() {
    const serviceDay = window.AIML_OperationalDay?.getCalendarDay?.();
    return validDay(serviceDay) ? serviceDay : fallbackAthensDay();
  }

  function publishedDay() {
    const serviceDay =
      window.AIML_OperationalDay?.getPublishedDay?.() ||
      window.AIML_OperationalDay?.getDay?.();
    return validDay(serviceDay) ? serviceDay : calendarDay();
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

  let today = calendarDay();
  let releaseDay = publishedDay();
  let activeDate = releaseDay;
  let followingToday = true;

  function releasePending() {
    return validDay(today) && validDay(releaseDay) && releaseDay !== today;
  }

  function publishDataSelection(date, options = {}) {
    const selected = validDay(date) ? date : releaseDay;
    activeDate = selected;
    followingToday = options.followingToday === true;

    window.__AIML_SELECTED_DATE = selected;
    window.__AIML_VIEWING_NON_TODAY_DATE = followingToday ? null : selected;
  }

  function emitSelection(reason) {
    emit("date:change", {
      date: activeDate,
      dataDate: activeDate,
      isToday: followingToday,
      calendarDay: today,
      publishedDay: releaseDay,
      releasePending: releasePending(),
      reason
    });
  }

  function render() {
    const pills = [];
    const pending = releasePending();

    for (let offset = -RANGE; offset <= RANGE; offset += 1) {
      const day = addDays(today, offset);
      const isToday = day === today;
      const isActive = day === activeDate;
      const isPendingToday = isToday && pending;
      const className =
        "date-pill" +
        (isToday ? " date-pill-today" : "") +
        (isActive ? " date-pill-active" : "") +
        (isPendingToday ? " date-pill-pending" : "");
      const label = isToday ? "Today" : shortLabel(day);
      const disabled = isPendingToday ? " disabled aria-disabled=\"true\"" : "";
      const title = isPendingToday
        ? ` title=\"Today's release is pending; showing last complete ${shortLabel(releaseDay)}\"`
        : "";

      pills.push(
        `<button class="${className}" data-date="${day}"${disabled}${title}>${label}</button>`
      );
    }

    container.innerHTML = `<div class="date-nav-inner">${pills.join("")}</div>`;

    container.querySelectorAll(".date-pill").forEach(button => {
      button.addEventListener("click", () => {
        const selected = button.getAttribute("data-date");
        if (!validDay(selected)) return;

        if (selected === today) {
          if (releasePending()) return;
          publishDataSelection(releaseDay, { followingToday: true });
        } else {
          publishDataSelection(selected, { followingToday: false });
        }

        render();
        emitSelection("user_selection");
      });
    });

    const active = container.querySelector(".date-pill-active");
    active?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }

  function adoptCalendarDay(nextDay) {
    if (!validDay(nextDay) || nextDay === today) return;

    today = nextDay;
    window.__AIML_CALENDAR_DAY = today;

    // When following Today, keep serving the last verified release until
    // operational-day.js promotes the new day. Do not relabel that release.
    if (followingToday) {
      publishDataSelection(releaseDay, { followingToday: true });
    }

    render();
  }

  function adoptPublishedDay(nextDay, reason) {
    if (!validDay(nextDay) || nextDay === releaseDay) return;

    const previousActive = activeDate;
    releaseDay = nextDay;
    window.__AIML_OPERATIONAL_DAY = releaseDay;

    if (followingToday) {
      publishDataSelection(releaseDay, { followingToday: true });
    }

    render();

    if (followingToday && activeDate !== previousActive) {
      emitSelection(reason || "published_day_change");
    }
  }

  publishDataSelection(releaseDay, { followingToday: true });
  render();

  window.addEventListener("calendar-day:change", event => {
    adoptCalendarDay(event?.detail?.day);
  });

  window.addEventListener("operational-day:change", event => {
    adoptPublishedDay(event?.detail?.day, "published_day_change");
  });

  // Initial data selection is the last verified published release. The calendar
  // still labels the real Athens date as Today even if that release is pending.
  window.setTimeout(() => {
    emitSelection("initial_published_day");
  }, 0);

  window.DateNav = {
    getActiveDate: () => activeDate,
    getToday: () => today,
    getPublishedDay: () => releaseDay,
    isReleasePending: () => releasePending(),
    setDate: date => {
      if (!validDay(date)) return;

      if (date === today) {
        if (releasePending()) return;
        publishDataSelection(releaseDay, { followingToday: true });
      } else {
        publishDataSelection(date, { followingToday: false });
      }
      render();
    }
  };
})();
