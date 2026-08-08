/**
 * live-overlay.js
 *
 * Polls the live-worker (Cloudflare) for current scores/status and emits
 * `live:update` — the event the today/live panels already consume to patch scores
 * in place. No deploys needed to refresh: the worker proxies the Flashscore feed.
 *
 * Worker URL: window.AIML_CONFIG.LIVE_WORKER_URL (set after deploying the worker),
 * else the default below.
 */
(function () {
  "use strict";

  var URL_ =
    (window.AIML_CONFIG && window.AIML_CONFIG.LIVE_WORKER_URL) ||
    "https://aimatchlab-live.pierros1402.workers.dev/api/live";

  var POLL_MS = 45 * 1000;
  var inFlight = false;

  function operationalDay() {
    var day = window.AIML_OperationalDay &&
      typeof window.AIML_OperationalDay.getDay === "function"
      ? window.AIML_OperationalDay.getDay()
      : "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(day || ""))) return String(day);
    try {
      return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Athens" });
    } catch (_) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function emit(ev, data) {
    if (typeof window.emit === "function") window.emit(ev, data);
    else document.dispatchEvent(new CustomEvent(ev, { detail: data }));
  }

  function providerIdentityToken(value) {
    var token = String(value == null ? "" : value).trim();
    if (!token) return "";
    if (/^cid_/i.test(token)) return token.toLowerCase();
    return token.replace(/^(?:fs|flashscore)[:_-]+/i, "").toLowerCase();
  }

  function identityTokens(match) {
    return matchIds(match)
      .map(providerIdentityToken)
      .filter(Boolean);
  }

  function kickoffMs(match) {
    var raw = match && (
      match.kickoff_ms != null ? match.kickoff_ms :
      match.kickoffMs != null ? match.kickoffMs :
      match.kickoffUtc != null ? match.kickoffUtc :
      match.kickoff != null ? match.kickoff :
      match.startTimeUtc != null ? match.startTimeUtc :
      match.startTime != null ? match.startTime : null
    );
    if (raw == null || raw === "") return 0;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    var parsed = new Date(raw).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function canonicalPanelId(match) {
    var ids = [
      match && match.canonicalId,
      match && match.canonicalMatchId,
      match && match.repositoryFixtureId,
      match && match.id,
      match && match.matchId
    ].filter(function (value) {
      return value !== null && value !== undefined && value !== "";
    }).map(function (value) { return String(value); });
    return ids.find(function (value) { return /^cid_/i.test(value); }) || ids[0] || "";
  }

  function currentCanonicalPanelMatches() {
    var rows = [];
    var seen = {};
    [safeMatches(window.__AIML_LAST_TODAY), safeMatches(window.__AIML_LAST_ACTIVE)]
      .forEach(function (source) {
        source.forEach(function (match) {
          if (!match || typeof match !== "object") return;
          var key = canonicalPanelId(match) || identityTokens(match).join("|");
          if (key && seen[key]) return;
          if (key) seen[key] = true;
          rows.push(match);
        });
      });
    return rows;
  }

  function reconcileWorkerMatch(workerMatch) {
    var baseMatches = currentCanonicalPanelMatches();
    if (!baseMatches.length) return null;

    var workerTokens = identityTokens(workerMatch);
    if (workerTokens.length) {
      var exact = baseMatches.filter(function (base) {
        var baseTokens = identityTokens(base);
        return workerTokens.some(function (token) { return baseTokens.indexOf(token) !== -1; });
      });
      if (exact.length === 1) return exact[0];
    }

    var home = normalizeTeam(workerMatch && (workerMatch.home || workerMatch.homeTeam));
    var away = normalizeTeam(workerMatch && (workerMatch.away || workerMatch.awayTeam));
    if (!home || !away) return null;

    var sameTeams = baseMatches.filter(function (base) {
      return normalizeTeam(base.home || base.homeTeam || base.homeName) === home &&
        normalizeTeam(base.away || base.awayTeam || base.awayName) === away;
    });
    var workerKickoff = kickoffMs(workerMatch);
    if (!workerKickoff) return null;
    var withinKickoffWindow = sameTeams.filter(function (base) {
      var baseKickoff = kickoffMs(base);
      return baseKickoff && Math.abs(baseKickoff - workerKickoff) <= 15 * 60 * 1000;
    });
    return withinKickoffWindow.length === 1 ? withinKickoffWindow[0] : null;
  }

  function toPanelMatch(m) {
    var isLive = m.status === "LIVE";
    var canonical = reconcileWorkerMatch(m);
    var canonicalId = canonicalPanelId(canonical);
    var providerMatchId = String(m.matchId || m.id || "");
    return {
      matchId: canonicalId || providerMatchId,
      id: canonicalId || providerMatchId,
      canonicalId: canonicalId || null,
      providerMatchId: providerMatchId || null,
      sourceId: canonical && canonical.sourceId != null
        ? canonical.sourceId
        : providerIdentityToken(providerMatchId) || null,
      sourceMatchId: canonical && canonical.sourceMatchId != null
        ? canonical.sourceMatchId
        : providerIdentityToken(providerMatchId) || null,
      home: m.home,
      away: m.away,
      homeTeam: m.home,
      awayTeam: m.away,
      leagueName: m.leagueName || "",
      scoreHome: m.scoreHome,
      scoreAway: m.scoreAway,
      status: m.status,
      statusType: m.status,
      staleLive: m.staleLive === true,
      statusUnconfirmed: m.statusUnconfirmed === true,
      isLive: isLive,
      live: isLive,
      // The worker feed does not expose a provider-native match clock. Never
      // present its kickoff-derived approximation as an exact minute.
      minute: null,
      minuteSource: "unavailable",
      kickoff_ms: kickoffMs(canonical) || kickoffMs(m)
    };
  }

  function authoritativeWorkerKey(match) {
    return providerIdentityToken(match && match.providerMatchId) ||
      providerIdentityToken(match && match.sourceMatchId) ||
      String(canonicalPanelId(match) || "").toLowerCase();
  }

  function workerStateIsFt(match) {
    var status = statusText(match);
    return /(^|\s)FT($|\s)/.test(status) || valueLiveState(match)?.kind === "ft";
  }

  function mergeAuthoritativeWorkerMatches(previousRows, nextRows) {
    var previousByKey = {};
    (Array.isArray(previousRows) ? previousRows : []).forEach(function (match) {
      var key = authoritativeWorkerKey(match);
      if (key) previousByKey[key] = match;
    });

    var seen = {};
    var merged = (Array.isArray(nextRows) ? nextRows : []).map(function (next) {
      var key = authoritativeWorkerKey(next);
      if (key) seen[key] = true;
      var previous = key ? previousByKey[key] : null;

      // Terminal is sticky. A later worker payload may revise an FT score, but
      // it may never regress a previously observed FT back to LIVE/PRE/stale.
      if (previous && workerStateIsFt(previous) && !workerStateIsFt(next)) {
        return previous;
      }
      return next;
    });

    Object.keys(previousByKey).forEach(function (key) {
      var previous = previousByKey[key];
      if (!seen[key] && workerStateIsFt(previous)) merged.push(previous);
    });

    return merged;
  }


  // --------------------------------------------------------------------------
  // Value panel live minute / score decoration
  // --------------------------------------------------------------------------
  var valuePatchTimer = 0;

  function safeMatches(value) {
    return value && Array.isArray(value.matches) ? value.matches : [];
  }

  function normalizeTeam(value) {
    var noise = {
      fc: true,
      cf: true,
      sc: true,
      ac: true,
      afc: true,
      fk: true,
      sk: true,
      nk: true,
      club: true,
      de: true,
      del: true,
      da: true,
      do: true,
      la: true,
      el: true,
      the: true
    };

    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(function (token) { return token && !noise[token]; })
      .join("");
  }

  function matchIds(match) {
    return [match && match.matchId, match && match.id, match && match.canonicalId,
      match && match.canonicalMatchId, match && match.fixtureId,
      match && match.repositoryFixtureId, match && match.sourceId,
      match && match.sourceMatchId, match && match.providerMatchId,
      match && match.sourceFixtureId]
      .filter(function (value) { return value !== null && value !== undefined && value !== ""; })
      .map(function (value) { return String(value); });
  }

  function statusText(match) {
    return [
      match && match.status && match.status.type && match.status.type.state,
      match && match.status && match.status.type && match.status.type.name,
      match && match.status, match && match.statusType, match && match.statusName,
      match && match.rawStatus, match && match.state, match && match.phase
    ].filter(Boolean).map(function (value) { return String(value).toUpperCase(); }).join(" ");
  }

  function scoreLabel(match) {
    var home = match && (match.scoreHome != null ? match.scoreHome :
      match.homeScore != null ? match.homeScore :
      match.score && match.score.home != null ? match.score.home : null);
    var away = match && (match.scoreAway != null ? match.scoreAway :
      match.awayScore != null ? match.awayScore :
      match.score && match.score.away != null ? match.score.away : null);
    var homeNum = Number(home);
    var awayNum = Number(away);
    if (!Number.isFinite(homeNum) || !Number.isFinite(awayNum)) return "";
    return String(homeNum) + "-" + String(awayNum);
  }

  function minuteLabel(match) {
    var raw = match && (match.displayMinute != null ? match.displayMinute :
      match.minute != null ? match.minute :
      match.status && match.status.displayClock != null ? match.status.displayClock : null);
    var parsed = String(raw == null ? "" : raw).trim().match(/^(\d+)(?:\+(\d+))?/);
    if (!parsed) return "";
    var base = Number(parsed[1]);
    var extra = parsed[2] != null ? Number(parsed[2]) : null;
    if (!Number.isFinite(base) || (extra != null && !Number.isFinite(extra))) return "";
    return extra != null ? String(base) + "+" + String(extra) + "′" : String(base) + "′";
  }

  function valueLiveState(match) {
    if (!match) return null;
    var status = statusText(match);
    var score = scoreLabel(match);
    var stale = match.staleLive === true || status.indexOf("STALE_LIVE") !== -1;
    var unconfirmed = match.statusUnconfirmed === true;
    var isPen = status.indexOf("PENALT") !== -1 || /(^|\s)PEN($|\s)/.test(status);
    var isAet = status.indexOf("AFTER_EXTRA_TIME") !== -1 || /(^|\s)AET($|\s)/.test(status);
    var isFt = /(^|\s)FT($|\s)/.test(status) || status.indexOf("FULL_TIME") !== -1 ||
      status.indexOf("STATUS_FINAL") !== -1 || status.indexOf("FINAL") !== -1 ||
      status.indexOf("ENDED") !== -1 || isPen || isAet;
    if (isFt) {
      var terminal = isPen ? "PEN" : isAet ? "AET" : "FT";
      return { kind: "ft", text: score ? terminal + " • " + score : terminal };
    }
    if (stale || unconfirmed) return null;
    var isHalfTime = status.indexOf("HALF_TIME") !== -1 || /(^|\s)HT($|\s)/.test(status);
    var isLive = match.live === true || match.isLive === true ||
      status.indexOf("LIVE") !== -1 || status.indexOf("IN_PROGRESS") !== -1 ||
      status.indexOf("FIRST_HALF") !== -1 || status.indexOf("SECOND_HALF") !== -1 ||
      status.indexOf("EXTRA_TIME") !== -1;
    if (!isLive && !isHalfTime) return null;
    var phase = isHalfTime ? "HT" : minuteLabel(match) || "LIVE";
    return { kind: "live", text: score ? phase + " • " + score : phase };
  }

  function currentValueDate() {
    var valueDate = window.__AIML_LAST_VALUE && window.__AIML_LAST_VALUE.date;
    return String(valueDate || window.__AIML_SELECTED_DATE || "").slice(0, 10);
  }

  function collectValueMatches(extraMatches) {
    var rows = [];
    // Value live decoration consumes only the worker-owned authoritative live
    // cache. Today/Active snapshots are identity baselines, never live-state
    // writers; mixing them here caused stale SECOND_HALF ↔ FT flicker.
    [extraMatches, window.AIML_LIVE_SCORES, safeMatches(window.__AIML_LAST_LIVE)]
      .forEach(function (source) {
        if (Array.isArray(source)) source.forEach(function (match) {
          if (match && typeof match === "object") rows.push(match);
        });
      });
    return rows;
  }

  function findValueMatch(row, matches) {
    var rowId = String(row.getAttribute("data-match-id") || "").trim();
    if (rowId) {
      var exact = matches.find(function (match) { return matchIds(match).indexOf(rowId) !== -1; });
      // A canonical Value row must resolve by exact identity. Falling through
      // to a team-name-only match can attach a worker row from another fixture.
      return exact || null;
    }
    var home = normalizeTeam(row.querySelector(".value-home") && row.querySelector(".value-home").textContent);
    var away = normalizeTeam(row.querySelector(".value-away") && row.querySelector(".value-away").textContent);
    if (!home || !away) return null;
    var candidates = matches.filter(function (match) {
      return normalizeTeam(match.home || match.homeTeam || match.homeName) === home &&
        normalizeTeam(match.away || match.awayTeam || match.awayName) === away;
    });
    return candidates.length === 1 ? candidates[0] : null;
  }

  function patchValueRows(extraMatches) {
    var rows = document.querySelectorAll(
      "#right-panel .intelligence-panel.value-panel .value-row[data-match-id]," +
      "#right-panel #value-picks-panel .value-row[data-match-id]," +
      "#right-panel .intelligence-panel[data-panel='value'] .value-row[data-match-id]"
    );
    rows.forEach(function (row) {
      row.querySelectorAll(".value-live-state").forEach(function (node) { node.remove(); });
    });
    if (currentValueDate() !== operationalDay()) return;
    var matches = collectValueMatches(extraMatches);
    if (!matches.length) return;
    rows.forEach(function (row) {
      var state = valueLiveState(findValueMatch(row, matches));
      var meta = row.querySelector(".value-meta");
      if (!state || !meta) return;
      meta.querySelectorAll(".value-badge.live:not(.value-live-state), .value-badge.ft:not(.value-live-state)")
        .forEach(function (node) { node.remove(); });
      var badge = document.createElement("span");
      badge.className = "value-badge value-live-state " + state.kind;
      badge.textContent = state.text;
      var resultBadge = meta.querySelector(".value-badge.win, .value-badge.loss, .value-badge.pending");
      if (resultBadge) meta.insertBefore(badge, resultBadge); else meta.appendChild(badge);
    });
  }

  function scheduleValuePatch(matches) {
    if (valuePatchTimer) window.clearTimeout(valuePatchTimer);
    valuePatchTimer = window.setTimeout(function () {
      valuePatchTimer = 0;
      patchValueRows(matches);
      window.setTimeout(function () { patchValueRows(matches); }, 80);
    }, 0);
  }

  function installValueHooks() {
    if (window.__AIML_VALUE_LIVE_HOOKS_INSTALLED__) return;
    window.__AIML_VALUE_LIVE_HOOKS_INSTALLED__ = true;
    if (typeof window.on === "function") {
      window.on("live:update", function (payload) { scheduleValuePatch(payload && payload.matches); });
      window.on("value:update", function () { scheduleValuePatch(); });
      window.on("value-picks:loaded", function () { scheduleValuePatch(); });
    }
    ["today-matches:loaded", "active-leagues:updated", "live:update", "value:update", "value-picks:loaded"]
      .forEach(function (eventName) {
        document.addEventListener(eventName, function (event) {
          scheduleValuePatch(
            eventName === "live:update" && event && event.detail
              ? event.detail.matches
              : null
          );
        });
      });
  }

  async function poll() {
    if (inFlight) return;
    inFlight = true;
    var controller = new AbortController();
    var timer = window.setTimeout(function () { controller.abort(); }, 12000);
    try {
      var rawFetch = window.__AIML_RAW_FETCH__ || window.fetch;
      var res = await rawFetch(URL_, { cache: "no-store", signal: controller.signal });
      if (!res.ok) return;
      var json = await res.json();
      if (!json || !Array.isArray(json.matches)) return;

      // Only push matches that actually have a score / live state (avoid wiping PRE).
      var freshMatches = json.matches
        .filter(function (m) { return m.scoreHome != null || m.status === "LIVE" || m.status === "FT"; })
        .map(toPanelMatch);

      var matches = mergeAuthoritativeWorkerMatches(
        window.AIML_LIVE_SCORES,
        freshMatches
      );

      if (matches.length) {
        window.AIML_LIVE_SCORES = matches;
        const payload = { date: operationalDay(), matches: matches, total: matches.length };
        // Become the single live source the panels boot-replay from.
        window.__AIML_LAST_LIVE = payload;
        emit("live:update", payload);
        scheduleValuePatch(matches);
      }
    } catch (err) {
      /* network blip — next poll retries */
    } finally {
      window.clearTimeout(timer);
      inFlight = false;
    }
  }

  function start() {
    installValueHooks();
    scheduleValuePatch();
    poll();
    setInterval(poll, POLL_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
