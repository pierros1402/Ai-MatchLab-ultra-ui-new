/* date-nav.js — ±7 day navigation strip (Flashscore-style)
 * Emits: date:change { date: "YYYY-MM-DD", isToday: bool }
 * Listens: (none — self-contained)
 */

(function () {
  "use strict";

  var container = document.getElementById("date-nav");
  if (!container) return;

  var RANGE = 7; // days each side of today

  // Athens "today" (UTC+3 in summer)
  function athensToday() {
    var now = new Date();
    var athens = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    return athens.toISOString().slice(0, 10);
  }

  function addDays(ymd, n) {
    return new Date(new Date(ymd + "T12:00:00Z").getTime() + n * 86400000)
      .toISOString().slice(0, 10);
  }

  function shortLabel(ymd) {
    var d = new Date(ymd + "T12:00:00Z");
    var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return days[d.getUTCDay()] + " " + d.getUTCDate();
  }

  var TODAY = athensToday();
  var activeDate = TODAY;

  function emit(ev, detail) {
    window.dispatchEvent(new CustomEvent(ev, { detail: detail }));
    if (window.AIML && window.AIML.emit) window.AIML.emit(ev, detail);
  }

  function render() {
    var pills = [];
    for (var i = -RANGE; i <= RANGE; i++) {
      var d = addDays(TODAY, i);
      var isToday = d === TODAY;
      var isActive = d === activeDate;
      var cls = "date-pill" + (isToday ? " date-pill-today" : "") + (isActive ? " date-pill-active" : "");
      var label = isToday ? "Today" : shortLabel(d);
      pills.push(
        '<button class="' + cls + '" data-date="' + d + '">' + label + '</button>'
      );
    }
    container.innerHTML = '<div class="date-nav-inner">' + pills.join("") + "</div>";

    container.querySelectorAll(".date-pill").forEach(function (btn) {
      btn.addEventListener("click", function () {
        activeDate = btn.getAttribute("data-date");
        render(); // re-render to move active class
        emit("date:change", { date: activeDate, isToday: activeDate === TODAY });
      });
    });

    // Scroll active pill into view
    var active = container.querySelector(".date-pill-active");
    if (active) active.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }

  // Re-sync TODAY at midnight Athens time (handles day rollover)
  function scheduleRollover() {
    var now = new Date();
    var athens = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    var msUntilMidnight =
      (24 * 60 - athens.getUTCHours() * 60 - athens.getUTCMinutes()) * 60 * 1000 - athens.getUTCSeconds() * 1000;
    setTimeout(function () {
      TODAY = athensToday();
      render();
      scheduleRollover();
    }, msUntilMidnight + 500);
  }

  render();
  scheduleRollover();

  // Expose for other modules
  window.DateNav = {
    getActiveDate: function () { return activeDate; },
    getToday: function () { return TODAY; },
    setDate: function (d) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
      activeDate = d;
      render();
    },
  };
})();
