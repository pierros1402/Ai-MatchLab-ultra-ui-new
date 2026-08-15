/* =========================================================
   TODAY PANEL – UNIFIED SOURCE (CLOUDFLARE SAFE) + ACTIONS RESTORED
   - Preserves original:
       * Single fetch
       * PRE + LIVE shown
       * FT removed from Today
       * Emits to Live panel
       * Local date filter (no UTC bug)
       * AIML_FIXTURES_TODAY cache
       * today-matches:loaded emit
       * Auto refresh only when LIVE exists
   - Restores from Active panel:
       * Save (★/☆) with saved sync
       * Details (ⓘ) with nav:matches focus details
   - Keeps:
       * Row click -> match-selected + nav:oic odds
========================================================= */

(function () {

  const BASE =
    (window.AIML_LIVE_CFG && window.AIML_LIVE_CFG.fixturesBase)
      ? window.AIML_LIVE_CFG.fixturesBase
      : "http://localhost:3010";

  const panel = document.querySelector("#panel-today .panel-body");
  if (!panel) return;

  let LOADING = false;
  let REFRESH_MS = 60000;
  let timer = null;

  let LAST_MATCHES = [];
  let SAVED_IDS = new Set();

  function todayISO() {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Athens",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(new Date());

      const y = parts.find(p => p.type === "year")?.value;
      const m = parts.find(p => p.type === "month")?.value;
      const d = parts.find(p => p.type === "day")?.value;
      return `${y}-${m}-${d}`;
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function fmtTime(ms) {
    return new Date(ms).toLocaleTimeString("el-GR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  }

  // Only display an explicit provider minute. Kickoff elapsed time is not a
  // football match clock (half-time, VAR, stoppage and delays make it wrong),
  // so the UI must not manufacture an exact-looking minute when the live source
  // does not provide one.
  const LIVE_MINUTE_CAP = 90;
  function clampMinuteLabel(n) {
    if (!Number.isFinite(n) || n <= 0) return "";
    return n >= LIVE_MINUTE_CAP ? `${LIVE_MINUTE_CAP}+'` : `${n}'`;
  }

  // A match the cross-source verifier could not confirm shows "⏳". Otherwise
  // use only an explicit numeric feed minute (including stoppage like "45+2").
  function liveMinuteLabel(m) {
    if (m.statusUnconfirmed === true) return "⏳";

    const raw = String(m.minute || "").trim().match(/^(\d+)(?:\+(\d+))?/);
    if (raw) {
      return raw[2] ? `${raw[1]}+${raw[2]}'` : clampMinuteLabel(Number(raw[1]));
    }

    return "";
  }

 function isLiveStatus(st) {
   if (!st) return false;

   const s = String(st).toUpperCase();

   if (s.includes("STALE_LIVE")) return false;

   return (
     s === "LIVE" ||
     s.includes("IN_PROGRESS") ||
     s.includes("LIVE") ||
     s.includes("FIRST_HALF") ||
     s.includes("SECOND_HALF") ||
     s.includes("HALF_TIME") ||
     s.includes("EXTRA_TIME") ||
     s.includes("STATUS_FIRST_HALF") ||
     s.includes("STATUS_SECOND_HALF") ||
     s.includes("STATUS_HALFTIME")
   );
 }

 function matchStatusText(m) {
   return [
     m?.status,
     m?.rawStatus,
     m?.statusType,
     m?.statusName,
     m?.state,
     m?.phase,
     m?.live === true || m?.isLive === true ? "LIVE" : ""
   ]
     .filter(Boolean)
     .map(x => String(x).toUpperCase())
     .join(" ");
 }

 function isFinalMatch(m) {
   const s = matchStatusText(m);
   return (
     /(^|\s)FT(\s|$)/.test(s) ||
     s.includes("FULL_TIME") ||
     s.includes("STATUS_FINAL") ||
     s.includes("FINAL") ||
     s.includes("AET") ||
     s.includes("PEN") ||
     s.includes("ENDED")
   );
 }

 function isStaleLiveMatch(m) {
   return (
     m?.staleLive === true ||
     String(m?.status || "").toUpperCase() === "STALE_LIVE" ||
     String(m?.rawStatus || "").toUpperCase() === "STALE_LIVE" ||
     String(m?.statusType || "").toUpperCase() === "STALE_LIVE" ||
     matchStatusText(m).includes("STALE_LIVE")
   );
 }

 function isMatchLive(m) {
   if (isStaleLiveMatch(m)) return false;
   return isLiveStatus(matchStatusText(m));
 }

  function startOfTodayLocalMs() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  }

  function endOfTodayLocalMs() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
  }

  function dayBoundsLocalMs(dateYmd) {
    const ymd = String(dateYmd || todayISO()).slice(0, 10);
    const parts = ymd.split("-").map(Number);

    if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) {
      return {
        start: startOfTodayLocalMs(),
        end: endOfTodayLocalMs()
      };
    }

    const [y, m, d] = parts;

    return {
      start: new Date(y, m - 1, d, 0, 0, 0, 0).getTime(),
      end: new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
    };
  }

  function safeEmit(name, payload) {
    if (typeof window.emit === "function") window.emit(name, payload);
  }

  function syncSaved(items) {
    const s = new Set();
    (Array.isArray(items) ? items : []).forEach(x => {
      if (x && x.id != null) s.add(String(x.id));
    });
    SAVED_IDS = s;
  }

  function isSaved(m) {
    return m && m.id != null && SAVED_IDS.has(String(m.id));
  }

  function normalizedLeagueText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function leagueNameOf(m) {
    if (m?.competitionIdentityMismatch === true && m?.leagueName) {
      return String(m.leagueName).trim();
    }

    return String(
      m?.canonicalLeagueName ||
      m?.leagueDisplayName ||
      m?.leagueName ||
      m?.leagueSlug ||
      "Other"
    ).trim();
  }

  function leagueIdentityKey(m) {
    const explicit =
      m?.canonicalCompetitionKey ||
      m?.competitionKey ||
      m?.canonicalCompetitionId ||
      m?.competitionId ||
      m?.tournamentId ||
      m?.leagueId ||
      "";

    if (String(explicit).trim()) {
      return "id:" + normalizedLeagueText(explicit);
    }

    const realName = leagueNameOf(m);

    // Correctly resolved competitions remain grouped by canonical slug.
    // Only a proven slug/name mismatch falls back to the real competition
    // name, preventing broad acquisition partitions such as eng.1 from
    // merging unrelated lower leagues.
    if (
      m?.competitionIdentityMismatch === true &&
      realName
    ) {
      return "name:" + normalizedLeagueText(realName);
    }

    const slug = normalizedLeagueText(m?.leagueSlug);

    if (slug) {
      return "slug:" + slug;
    }

    if (realName) {
      return "name:" + normalizedLeagueText(realName);
    }

    return "name:other";
  }

  function leagueTierOf(m) {
    if (m?.competitionIdentityMismatch === true) return null;

    const value =
      m?.canonicalLeagueTier ??
      m?.competitionTier ??
      m?.leagueTier ??
      null;

    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function roundNumberOf(m) {
    if (m?.providerRound?.verified === true) {
      const provider = Number(
        m?.providerRound?.roundNumber ??
        m?.providerRound?.matchday
      );

      if (Number.isInteger(provider) && provider > 0) {
        return provider;
      }
    }

    const direct = Number(m?.roundNumber);
    if (Number.isInteger(direct) && direct > 0) {
      return direct;
    }

    if (m?.competitionIdentityMismatch !== true) {
      const matchday = Number(m?.matchday);
      if (Number.isInteger(matchday) && matchday > 0) {
        return matchday;
      }
    }

    return null;
  }

  function dominantRoundOf(rows) {
    const counts = new Map();

    for (const m of Array.isArray(rows) ? rows : []) {
      const round = roundNumberOf(m);
      if (round == null) continue;
      counts.set(round, (counts.get(round) || 0) + 1);
    }

    const ranked = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || b[0] - a[0]);

    if (!ranked.length) return null;
    if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) {
      return null;
    }

    return ranked[0][0];
  }

  function displayTeamKey(value) {
    const generic = new Set([
      "fc", "afc", "cf", "sc", "ac", "club", "the"
    ]);

    const aliases = new Map([
      ["utd", "united"],
      ["intl", "international"]
    ]);

    const tokens = String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(token => aliases.get(token) || token)
      .filter(token => !generic.has(token));

    let key = tokens.join(" ");

    if (key === "mk dons") {
      key = "milton keynes dons";
    }

    return key;
  }

  function scorePairOf(m) {
    const home = Number(m?.scoreHome);
    const away = Number(m?.scoreAway);

    if (
      m?.scoreHome == null ||
      m?.scoreAway == null ||
      !Number.isFinite(home) ||
      !Number.isFinite(away)
    ) {
      return null;
    }

    return [home, away];
  }

  function isDisplayDuplicate(a, b) {
    if (leagueIdentityKey(a) !== leagueIdentityKey(b)) return false;

    const ta = Number(a?.kickoff_ms || 0);
    const tb = Number(b?.kickoff_ms || 0);

    if (
      !Number.isFinite(ta) ||
      !Number.isFinite(tb) ||
      ta <= 0 ||
      tb <= 0 ||
      Math.abs(ta - tb) > 60000
    ) {
      return false;
    }

    if (displayTeamKey(a?.home) !== displayTeamKey(b?.home)) {
      return false;
    }

    if (displayTeamKey(a?.away) !== displayTeamKey(b?.away)) {
      return false;
    }

    const sa = scorePairOf(a);
    const sb = scorePairOf(b);

    if (
      sa &&
      sb &&
      (sa[0] !== sb[0] || sa[1] !== sb[1])
    ) {
      return false;
    }

    return true;
  }

  function mergeDisplayDuplicate(a, b) {
    const aFinal = isFinalMatch(a);
    const bFinal = isFinalMatch(b);

    let winner = a;

    if (bFinal && !aFinal) {
      winner = b;
    } else if (aFinal === bFinal) {
      const aLength =
        String(a?.home || "").length +
        String(a?.away || "").length;

      const bLength =
        String(b?.home || "").length +
        String(b?.away || "").length;

      if (bLength > aLength) winner = b;
    }

    const loser = winner === a ? b : a;

    return {
      ...loser,
      ...winner
    };
  }

  function dedupeForDisplay(rows) {
    const out = [];

    for (const row of Array.isArray(rows) ? rows : []) {
      const index = out.findIndex(
        existing => isDisplayDuplicate(existing, row)
      );

      if (index === -1) {
        out.push(row);
        continue;
      }

      out[index] = mergeDisplayDuplicate(out[index], row);
    }

    return out;
  }

  // Normalize a raw runtime match (homeTeam/kickoffUtc/matchId) into the shape
  // render() expects (home/kickoff_ms/id). The Active panel maps the same way
  // inside its render — Today now consumes the SAME unified payload, so it must
  // map identically instead of relying on a separate standalone fetch.
  function mapMatch(m) {
    return {
      id: m.id ?? m.matchId,
      home: m.home ?? m.homeTeam,
      away: m.away ?? m.awayTeam,
      leagueName: m.leagueName,
      leagueSlug: m.leagueSlug,
      canonicalLeagueName: m.canonicalLeagueName,
      leagueDisplayName: m.leagueDisplayName,
      canonicalCompetitionKey: m.canonicalCompetitionKey,
      competitionKey: m.competitionKey,
      canonicalCompetitionId: m.canonicalCompetitionId,
      competitionId: m.competitionId,
      tournamentId: m.tournamentId,
      leagueId: m.leagueId,
      country: m.country,
      leagueTier: m.leagueTier,
      canonicalLeagueTier: m.canonicalLeagueTier,
      competitionTier: m.competitionTier,
      competitionIdentityMismatch: m.competitionIdentityMismatch,
      providerRound: m.providerRound,
      roundNumber: m.roundNumber,
      matchday: m.matchday,
      status: m.status,
      rawStatus: m.rawStatus,
      statusType: m.statusType,
      statusName: m.statusName,
      state: m.state,
      phase: m.phase,
      live: m.live,
      isLive: m.isLive,
      staleLive: m.staleLive,
      staleLiveReason: m.staleLiveReason,
      statusUnconfirmed: m.statusUnconfirmed,
      ftSource: m.ftSource,
      scoreHome: m.scoreHome,
      scoreAway: m.scoreAway,
      minute: m.minute,
      kickoff_ms:
        m.kickoff_ms != null
          ? Number(m.kickoff_ms)
          : (m.kickoffUtc ? new Date(m.kickoffUtc).getTime() : 0),
      __raw: m
    };
  }

  function render(matches, dateYmd) {
    panel.innerHTML = "";

    LAST_MATCHES = dedupeForDisplay(
      Array.isArray(matches) ? matches : []
    );

    const dayKey =
      (typeof dateYmd === "string" && dateYmd.length >= 10)
        ? dateYmd.slice(0, 10)
        : (window.__AIML_SELECTED_DATE
            ? String(window.__AIML_SELECTED_DATE).slice(0, 10)
            : todayISO());

    const bounds = dayBoundsLocalMs(dayKey);
    const startDay = bounds.start;
    const endDay = bounds.end;

    const arr = LAST_MATCHES
      .filter(m => {

        const st = matchStatusText(m);

        const isPre = st === "PRE" || st.includes("SCHEDULED");
        const isLive = isMatchLive(m);

        // Today shows PRE + LIVE only. FT still disappears.
        // Do not hide PRE/SCHEDULED merely because kickoff time has passed:
        // live/FT status can lag, and that can blank the Today panel.
        return isPre || isLive;

      })
      .filter(m => {
        const ko = Number(m.kickoff_ms || 0);
        return ko >= startDay && ko <= endDay;
      })
      .sort((a, b) => {
        const ca = String(a.country || "");
        const cb = String(b.country || "");

        if (ca !== cb) return ca.localeCompare(cb);

        const ta = leagueTierOf(a);
        const tb = leagueTierOf(b);
        const safeTa = ta == null ? 99 : ta;
        const safeTb = tb == null ? 99 : tb;

        if (safeTa !== safeTb) return safeTa - safeTb;

        const la = leagueNameOf(a);
        const lb = leagueNameOf(b);

        if (la !== lb) return la.localeCompare(lb);

        const ka = Number(a.kickoff_ms || 0);
        const kb = Number(b.kickoff_ms || 0);

        if (ka !== kb) return ka - kb;

        const ha = String(a.home || "").toLowerCase();
        const hb = String(b.home || "").toLowerCase();

        return ha.localeCompare(hb);
      });

    if (!arr.length) {
      panel.innerHTML = "<div class='empty'>Δεν υπάρχουν αγώνες σήμερα</div>";
      return;
    }

    const rowsByLeague = new Map();

    for (const m of arr) {
      const groupKey =
        String(m.country || "") +
        "|" +
        leagueIdentityKey(m);

      if (!rowsByLeague.has(groupKey)) {
        rowsByLeague.set(groupKey, []);
      }

      rowsByLeague.get(groupKey).push(m);
    }

    let lastLeague = null;

    arr.forEach(m => {
      const time = fmtTime(m.kickoff_ms);

      const groupKey =
        String(m.country || "") +
        "|" +
        leagueIdentityKey(m);

      const lgName = leagueNameOf(m);
      const baseLabel =
        m.country
          ? String(m.country) + " · " + lgName
          : lgName;

      const dominantRound =
        dominantRoundOf(rowsByLeague.get(groupKey) || []);

      const lgLabel =
        dominantRound != null
          ? baseLabel + " · " + dominantRound + "η Αγωνιστική"
          : baseLabel;

      if (groupKey !== lastLeague) {
        const lg = document.createElement("div");
        lg.className = "today-league";
        lg.textContent = lgLabel;
        panel.appendChild(lg);
        lastLeague = groupKey;
      }

      const row = document.createElement("div");
      row.className = "match-row";

      const left = document.createElement("div");
      left.className = "today-match";
      left.textContent = `${m.home} – ${m.away}`;

      const right = document.createElement("div");
      right.className = "today-right";

      const info = document.createElement("span");
      const st = matchStatusText(m);

      if (isMatchLive(m)) {
        const min = liveMinuteLabel(m);
        const sc =
          m.scoreHome != null && m.scoreAway != null
            ? `${m.scoreHome}-${m.scoreAway}`
            : "";
        info.textContent = `${min} ${sc}`.trim() || "LIVE";
        info.classList.add("live");
        if (m.statusUnconfirmed === true) {
          info.classList.add("unconfirmed");
          info.title = "Live status unconfirmed — awaiting source confirmation";
        }
      } else {
        info.textContent = time;
      }

      // ⭐ Save (same behavior as Active)
      const save = document.createElement("span");
      save.className = "match-save";
      save.textContent = isSaved(m) ? "★" : "☆";
      save.onclick = (e) => {
        e.stopPropagation();
        if (window.emit) emit("save-toggle", m);
      };

      // ⓘ Details (same behavior as Active)
      const details = document.createElement("span");
      details.className = "match-details";
      details.textContent = "ⓘ";
      details.onclick = (e) => {
        e.stopPropagation();
        if (window.emit) {
          emit("details-open", m);
          emit("nav:matches", { focus: "details" });
        }
      };

      right.appendChild(info);
      right.appendChild(save);
      right.appendChild(details);

      row.appendChild(left);
      row.appendChild(right);

      // Row click -> send to OIC odds (same as Active)
      row.onclick = () => {
        if (window.emit) {
          emit("match-selected", m);
          emit("active-match:set", m);
          emit("nav:oic", { tab: "odds" });
                    if (window.AIML_MOBILE_SET_VIEW) {
              window.AIML_MOBILE_SET_VIEW("odds");
            }
}
      };

      panel.appendChild(row);
    });
  }

  async function load() {
    if (LOADING) return;
    LOADING = true;

    try {

    // 👇 ΝΕΟ BLOCK ΕΔΩ
      if (window.__AIML_SNAPSHOT?.live?.matches?.length) {

        const matches = dedupeForDisplay(
          window.__AIML_SNAPSHOT.live.matches.map(mapMatch)
        );

        window.AIML_FIXTURES_TODAY = { matches };

        render(matches, todayISO());

        safeEmit("today-matches:loaded", { matches, date: todayISO() });

        LOADING = false;
        return;
      }

    // 👇 παλιό fetch συνεχίζει κανονικά
      const res = await fetch(
        `${BASE}/fixtures-runtime?mode=today&date=${todayISO()}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("fetch failed");

      const data = await res.json();
      const raw = Array.isArray(data.matches) ? data.matches : [];

      const matches = dedupeForDisplay(raw.map(mapMatch));

      window.AIML_FIXTURES_TODAY = { matches };

      render(matches, todayISO());

      safeEmit("today-matches:loaded", { matches, date: todayISO() });

// ----------------------------------
// SYNC WITH LIVE SNAPSHOT
// ----------------------------------
 

      const hasLive = matches.some(m => isMatchLive(m));

      if (hasLive) {

        // If live snapshot exists, rely on event updates
        if (window.__AIML_SNAPSHOT?.live?.matches?.length) {

          if (timer) {
            clearInterval(timer);
            timer = null;
          }

        } else {

          if (!timer) timer = setInterval(load, REFRESH_MS);

        }

      } else {

        if (timer) {
          clearInterval(timer);
          timer = null;
        }

      }

    } catch (e) {
      panel.innerHTML = "<div class='error'>Σφάλμα φόρτωσης</div>";
      console.error("[TODAY]", e);
    } finally {
      LOADING = false;
    }
  }

  // saved sync hooks (same as Active)
  if (window.on) {
    on("saved:updated", payload => {
      syncSaved(payload?.items || []);
      render(LAST_MATCHES);
    });
  }

  try {
    syncSaved(window.getSavedMatches ? window.getSavedMatches() : []);
  } catch {}
  // Unified fixtures-loader sync.
  // fixtures-loader.js refreshes Today every 15s and emits a document CustomEvent.
  // This keeps the Today panel aligned with the same source as the rest of the UI.
  document.addEventListener("today-matches:loaded", (event) => {
    const payload = event?.detail || {};
    const raw = Array.isArray(payload.matches) ? payload.matches : [];
    const matches = dedupeForDisplay(raw.map(mapMatch));

    window.AIML_FIXTURES_TODAY = { matches, date: payload.date };
    render(matches, payload.date);
  });

  // Replay latest Today payload if fixtures-loader emitted before this panel loaded.
  if (window.__AIML_LAST_TODAY?.matches?.length) {
    const payload = window.__AIML_LAST_TODAY;
    const matches = dedupeForDisplay(
      (Array.isArray(payload.matches) ? payload.matches : []).map(mapMatch)
    );

    setTimeout(() => {
      window.AIML_FIXTURES_TODAY = { matches, date: payload.date };
      render(matches, payload.date);
    }, 0);
  }

  // NOTE: Today is now a pure consumer of the unified fixtures-loader (same as the
  // Active panel), fed by the "today-matches:loaded" event above plus the replay.
  // The old standalone load() fetch was removed: it fired a SECOND, un-coalesced
  // today request during the cold startup burst that timed out on the throttled
  // Render instance and wrote "Σφάλμα φόρτωσης" over an otherwise-good render.

// ----------------------------------
// LIVE SYNC (CRITICAL)
// ----------------------------------
if (window.on) {
  on("live:update", payload => {

    if (!payload?.matches?.length) return;

    // merge live into current list
    const map = new Map(
      LAST_MATCHES.map(m => [String(m.id), m])
    );

    for (const m of payload.matches) {
      const id = String(m.id || m.matchId);
      const existing = map.get(id);

      if (!existing) continue;

      // Terminal is monotonic across panel state too: no later live/snapshot
      // payload may resurrect a match that this panel already knows is final.
      if (isFinalMatch(existing) && !isFinalMatch(m)) continue;

      // Never downgrade a snapshot-confirmed final: a STALE_LIVE overlay row
      // means "no confirmed live info", not new evidence about the result.
      if ((m.staleLive === true || String(m.status || "").toUpperCase() === "STALE_LIVE") &&
          String(existing.status || "").toUpperCase() === "FT") continue;

      existing.status = m.status;
      existing.rawStatus = m.rawStatus;
      existing.statusType = m.statusType;
      existing.statusName = m.statusName;
      existing.state = m.state;
      existing.phase = m.phase;
      existing.live = m.live;
      existing.isLive = m.isLive;
      existing.staleLive = m.staleLive;
      existing.staleLiveReason = m.staleLiveReason;
      existing.statusUnconfirmed = m.statusUnconfirmed;
      existing.ftSource = m.ftSource;
      existing.minute = m.minute;
      existing.scoreHome = m.scoreHome;
      existing.scoreAway = m.scoreAway;
    }

    render(Array.from(map.values()));
  });
}

})();
