/* ============================================================
   AI MatchLab ULTRA — assets/js/utils/version-check.js
   NO AUTO-REFRESH
   - Fetches /version.json (no-store)
   - Compares with current UI version shown in .ver-pill (or #ver-pill)
   - Shows #update-banner if remote version is newer
   - #btn-update-now triggers a manual reload with cache-bust
============================================================ */

(function () {
  "use strict";
  if (window.__AIML_VERSION_CHECK__) return;
  window.__AIML_VERSION_CHECK__ = true;

  function $(sel) { return document.querySelector(sel); }

  function text(el, v) { if (el) el.textContent = v == null ? "" : String(v); }

  function parseVer(v) {
    // Accepts "2.4.2" or "v2.4.2" or "2.4.2+build"
    var s = String(v || "").trim().replace(/^v/i, "");
    s = s.split("+")[0].split("-")[0];
    var parts = s.split(".").map(function (x) { return parseInt(x, 10); });
    return [
      isFinite(parts[0]) ? parts[0] : 0,
      isFinite(parts[1]) ? parts[1] : 0,
      isFinite(parts[2]) ? parts[2] : 0
    ];
  }

  function cmpVer(a, b) {
    for (var i = 0; i < 3; i++) {
      if (a[i] > b[i]) return 1;
      if (a[i] < b[i]) return -1;
    }
    return 0;
  }

  function getLocalVersion() {
    var pill = $(".ver-pill") || $("#ver-pill");
    var v = pill ? (pill.getAttribute("data-version") || pill.textContent) : "";
    v = String(v || "").trim();
    // allow "v2.4.2" inside pill
    var m = v.match(/v?\d+\.\d+\.\d+/i);
    return m ? m[0].replace(/^v/i, "") : "0.0.0";
  }

  function showBanner(remoteVersion) {
    var banner = $("#update-banner");
    if (!banner) return;

    banner.classList.remove("hidden");
    banner.style.display = "";

    var local = getLocalVersion();

    // Optional text nodes if exist
    var t = $("#update-text");
    if (t) {
      text(t, "New version available: v" + remoteVersion + " (current v" + local + ")");
    } else {
      // fallback: keep banner content, but try to set a data attribute
      banner.setAttribute("data-update", "v" + remoteVersion);
    }

    var btn = $("#btn-update-now");
    if (btn && !btn.__boundUpdate) {
      btn.__boundUpdate = true;
      btn.addEventListener("click", function (e) {
        e.preventDefault();

        // Manual reload with cache-bust (best effort)
        try { sessionStorage.setItem("aiml_update_target", String(remoteVersion)); } catch (err) {}

        var url = new URL(window.location.href);
        url.searchParams.set("v", String(remoteVersion));
        url.searchParams.set("t", String(Date.now()));
        window.location.replace(url.toString());
      });
    }
  }

  function hideBanner() {
    var banner = $("#update-banner");
    if (!banner) return;
    banner.classList.add("hidden");
    banner.style.display = "none";
  }

  function fetchWithTimeout(url, ms) {
    return new Promise(function (resolve, reject) {
      var to = setTimeout(function () { reject(new Error("timeout")); }, ms);
      fetch(url, { cache: "no-store" })
        .then(function (r) {
          clearTimeout(to);
          if (!r.ok) throw new Error("http " + r.status);
          return r.json();
        })
        .then(resolve)
        .catch(function (err) {
          clearTimeout(to);
          reject(err);
        });
    });
  }

  function run() {
    var localV = getLocalVersion();

    fetchWithTimeout("/version.json", 5000)
      .then(function (data) {
        var remoteV = (data && (data.version || data.ver)) ? String(data.version || data.ver) : "";
        remoteV = remoteV.trim().replace(/^v/i, "");
        if (!remoteV) { hideBanner(); return; }

        var a = parseVer(remoteV);
        var b = parseVer(localV);

        if (cmpVer(a, b) > 0) showBanner(remoteV);
        else hideBanner();
      })
      .catch(function () {
        // silent fail: no banner changes (keeps UI clean)
        hideBanner();
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();

})();
