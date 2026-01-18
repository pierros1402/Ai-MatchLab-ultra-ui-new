/* /assets/js/state.js (classic) */
(function () {
  "use strict";

  var state = Object.create(null);

  function get(path, fallback) {
    if (!path) return state;
    var parts = String(path).split(".").filter(Boolean);
    var cur = state;
    for (var i = 0; i < parts.length; i++) {
      if (!cur || typeof cur !== "object" || !(parts[i] in cur)) return fallback;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function set(path, value) {
    if (!path) return;
    var parts = String(path).split(".").filter(Boolean);
    var cur = state;
    for (var i = 0; i < parts.length - 1; i++) {
      var k = parts[i];
      if (!cur[k] || typeof cur[k] !== "object") cur[k] = Object.create(null);
      cur = cur[k];
    }
    cur[parts[parts.length - 1]] = value;
    if (typeof window.emit === "function") {
      window.emit("state-changed", { path: path, value: value });
    }
  }

  // --------------------------------------------------
  // 🔗 EVENT → STATE BRIDGE (ΑΥΤΟ ΕΛΕΙΠΕ)
  // --------------------------------------------------
  if (typeof window.on === "function") {

    // Today matches
    window.on("today:updated", function (matches) {
      if (Array.isArray(matches)) {
        set("today.matches", matches);
      }
    });

    // Active leagues (αν υπάρχουν)
    window.on("active-leagues:updated", function (leagues) {
      if (Array.isArray(leagues)) {
        set("active.leagues", leagues);
      }
    });

  }

  window.AppState = {
    get: get,
    set: set,
    dump: function () {
      return JSON.parse(JSON.stringify(state));
    }
  };

})();
