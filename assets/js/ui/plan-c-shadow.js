/* ========================================================================== 
   PLAN C SHADOW PANEL

   Read-only consumer of the separately exported Plan C shadow artifact.
   This panel deliberately does not emit Value, Top Picks, alert, or live events.
   It is observation UI only and can never promote a shadow prediction.
   ========================================================================== */

(function () {
  "use strict";

  const SCHEMA = "ai-matchlab.plan-c-shadow-day.v1";
  const ENDPOINT = "/plan-c-shadow";
  const root = document.querySelector(".plan-c-shadow-panel");
  const list = document.getElementById("plan-c-shadow-list");

  if (!root || !list) return;

  let activeFilter = "picks";
  let activePayload = null;
  let requestSequence = 0;
  let activeController = null;
  let selectedDay = "";

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function validDay(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  }

  function probability(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 && number <= 1 ? number : null;
  }

  function percent(value, digits = 1) {
    const number = probability(value);
    return number == null ? "—" : `${(number * 100).toFixed(digits)}%`;
  }

  function signedPoints(adjusted, baseline) {
    const a = probability(adjusted);
    const b = probability(baseline);
    if (a == null || b == null) return "—";
    const points = (a - b) * 100;
    return `${points >= 0 ? "+" : ""}${points.toFixed(1)} pp`;
  }

  function formatKickoff(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "Unknown kickoff";
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Athens",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function formatGenerated(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Athens",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function predictionDay(entry) {
    const date = new Date(entry?.prediction?.kickoffUtc);
    if (!Number.isFinite(date.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    const value = type => parts.find(part => part.type === type)?.value;
    return `${value("year")}-${value("month")}-${value("day")}`;
  }

  function engineUrl(path) {
    const base =
      window.AIML_CONFIG?.BASE_URL ||
      window.__AIML_ENGINE_BASE ||
      "https://ai-matchlab-engine.onrender.com";
    return String(base).replace(/\/+$/, "") + path;
  }

  function validateEntry(entry, index) {
    const prediction = entry?.prediction;
    const settlement = entry?.settlement;
    if (!prediction || !settlement) return `entry_${index}_missing`;
    if (!String(prediction.canonicalFixtureId || "").startsWith("cid_")) return `entry_${index}_fixture_id`;
    if (prediction.identityCategory !== "both" || prediction.eloApplied !== true) return `entry_${index}_identity`;
    if (typeof prediction.planCPick !== "boolean") return `entry_${index}_pick`;
    if (![prediction.homeElo, prediction.awayElo].every(Number.isFinite)) return `entry_${index}_elo`;
    if (![prediction?.baseline?.lambdaHome, prediction?.baseline?.lambdaAway,
      prediction?.adjusted?.lambdaHome, prediction?.adjusted?.lambdaAway]
      .every(value => Number.isFinite(value) && value > 0)) return `entry_${index}_lambdas`;
    if (probability(prediction?.baseline?.pOver25) == null) return `entry_${index}_baseline_probability`;
    if (probability(prediction?.adjusted?.pOver25) == null) return `entry_${index}_adjusted_probability`;
    const snapshot = Date.parse(prediction.snapshotRetrievedAt);
    const created = Date.parse(prediction.predictionCreatedAt);
    const kickoff = Date.parse(prediction.kickoffUtc);
    if (![snapshot, created, kickoff].every(Number.isFinite) || !(snapshot < created && created < kickoff)) {
      return `entry_${index}_forward_boundary`;
    }
    if (!/^[0-9a-f]{64}$/.test(String(prediction.predictionSignature || ""))) return `entry_${index}_signature`;
    if (!["PENDING", "SETTLED", "VOID_EXCLUDED"].includes(settlement.state)) return `entry_${index}_settlement`;
    if (settlement.state === "SETTLED" && (
      settlement?.truth?.status !== "FT" ||
      !Number.isInteger(settlement?.truth?.scoreHome) || settlement.truth.scoreHome < 0 ||
      !Number.isInteger(settlement?.truth?.scoreAway) || settlement.truth.scoreAway < 0
    )) return `entry_${index}_settled_truth`;
    return "";
  }

  function validatePayload(payload) {
    const errors = [];
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) errors.push("payload_not_object");
    if (payload?.schema !== SCHEMA) errors.push("schema_invalid");
    if (payload?.ok !== true || payload?.mode !== "SHADOW" || payload?.productionEligible !== false) {
      errors.push("shadow_boundary_invalid");
    }
    if (typeof payload?.available !== "boolean") errors.push("availability_invalid");
    if (!validDay(payload?.date)) errors.push("date_invalid");
    if (!Array.isArray(payload?.entries)) errors.push("entries_missing");

    const entries = Array.isArray(payload?.entries) ? payload.entries : [];
    entries.forEach((entry, index) => {
      const error = validateEntry(entry, index);
      if (error) errors.push(error);
    });

    const pickCount = entries.filter(entry => entry?.prediction?.planCPick === true).length;
    if (payload?.count !== entries.length) errors.push("count_mismatch");
    if (payload?.pickCount !== pickCount) errors.push("pick_count_mismatch");
    if (payload?.available === false && (entries.length !== 0 || pickCount !== 0)) errors.push("unavailable_not_empty");

    return { ok: errors.length === 0, errors, count: entries.length, pickCount };
  }

  function pickOutcome(entry) {
    if (entry?.prediction?.planCPick !== true) return "OBSERVATION";
    const settlement = entry?.settlement;
    if (settlement?.state === "VOID_EXCLUDED") return "VOID";
    const truth = settlement?.truth;
    if (settlement?.state !== "SETTLED" || truth?.status !== "FT" ||
      ![truth.scoreHome, truth.scoreAway].every(score => Number.isInteger(score) && score >= 0)) return "PENDING";
    return truth.scoreHome + truth.scoreAway >= 3 ? "WIN" : "LOSS";
  }

  function settlementBadge(settlement) {
    const state = String(settlement?.state || "PENDING");
    if (state === "SETTLED") {
      const home = settlement?.truth?.scoreHome;
      const away = settlement?.truth?.scoreAway;
      return `<span class="plan-c-state settled">FT ${esc(home)}–${esc(away)}</span>`;
    }
    if (state === "VOID_EXCLUDED") return '<span class="plan-c-state void">VOID</span>';
    return '<span class="plan-c-state pending">PENDING</span>';
  }

  function renderEntry(entry) {
    const prediction = entry.prediction;
    const baseline = prediction.baseline;
    const adjusted = prediction.adjusted;
    const isPick = prediction.planCPick === true;
    const edge = Number(prediction.eloEdge);
    const edgeText = Number.isFinite(edge) ? `${edge >= 0 ? "+" : ""}${edge.toFixed(3)}` : "—";
    const outcome = pickOutcome(entry);
    const pendingLabel = Date.parse(prediction.kickoffUtc) > Date.now()
      ? "Δεν έχει ξεκινήσει ο αγώνας"
      : entry.settlement?.pendingReason === "NO_CANONICAL_TRUTH"
        ? "Λείπει επαληθευμένο αποτέλεσμα · εκκρεμεί έλεγχος"
        : "Αναμονή επαληθευμένου τελικού αποτελέσματος";
    const resultClass = outcome === "WIN"
      ? " win"
      : outcome === "LOSS"
        ? " loss"
        : "";

    return `
      <article class="plan-c-card${isPick ? " is-pick" : ""}${resultClass}" data-fixture-id="${esc(prediction.canonicalFixtureId)}">
        <div class="plan-c-card-top">
          <span class="plan-c-league">${esc(prediction.leagueSlug || "—")}</span>
          <span class="plan-c-kickoff">${esc(formatKickoff(prediction.kickoffUtc))}</span>
          ${settlementBadge(entry.settlement)}
        </div>
        <div class="plan-c-fixture">
          <span>${esc(prediction.homeTeam)}</span>
          <span class="plan-c-vs">vs</span>
          <span>${esc(prediction.awayTeam)}</span>
        </div>
        <div class="plan-c-recommendation">
          <strong>${isPick ? "Πρόταση: Over 2.5 γκολ" : "Χωρίς πρόταση"}</strong>
          <span>${isPick ? "Χρειάζονται τουλάχιστον 3 γκολ συνολικά." : "Ο αγώνας παρακολουθείται μόνο για αξιολόγηση."}</span>
          ${isPick ? `<span class="plan-c-state ${outcome.toLowerCase()}">${outcome === "PENDING" ? pendingLabel : outcome === "VOID" ? "VOID · Ακυρώθηκε" : outcome === "WIN" ? "WIN · Επιτυχία" : "LOSS · Αποτυχία"}</span>` : ""}
          <span>Εκτίμηση πιθανότητας: <b>${percent(adjusted.pOver25)}</b></span>
        </div>
        <details class="plan-c-model-details"><summary>Στοιχεία μοντέλου</summary>
        <div class="plan-c-elo" title="Verified ClubElo identities">
          <span>${esc(prediction.homeElo)} Elo</span>
          <span class="plan-c-edge">edge ${esc(edgeText)}</span>
          <span>${esc(prediction.awayElo)} Elo</span>
        </div>
        <div class="plan-c-probability-row">
          <div>
            <span class="plan-c-metric-label">Baseline O2.5</span>
            <strong>${percent(baseline.pOver25)}</strong>
          </div>
          <span class="plan-c-probability-arrow" aria-hidden="true">→</span>
          <div>
            <span class="plan-c-metric-label">Elo adjusted</span>
            <strong>${percent(adjusted.pOver25)}</strong>
          </div>
          <span class="plan-c-delta">${signedPoints(adjusted.pOver25, baseline.pOver25)}</span>
        </div>
        <div class="plan-c-card-bottom">
          <span class="plan-c-pick-badge ${isPick ? "pick" : "observe"}">${isPick ? "OVER 2.5 · SHADOW PICK" : "OBSERVATION"}</span>
          <span class="plan-c-lambdas">λ ${Number(adjusted.lambdaHome).toFixed(2)}–${Number(adjusted.lambdaAway).toFixed(2)}</span>
        </div>
        </details>
      </article>`;
  }

  function renderPayload(payload) {
    activePayload = payload;
    if (!payload.available) {
      list.innerHTML = `
        <div class="plan-c-boundary-note"><b>SHADOW · EXPERIMENTAL</b><span>Never used as an official pick or alert.</span></div>
        <div class="panel-empty">No Plan C shadow export is published for ${esc(payload.date)}.</div>`;
      return;
    }

    const dailyEntries = payload.entries.filter(entry => predictionDay(entry) === payload.date);
    const scopedEntries = activeFilter === "history" ? payload.entries : dailyEntries;
    const entries = scopedEntries.filter(entry => activeFilter === "all" || entry.prediction.planCPick === true);
    const generated = formatGenerated(payload.generatedAt);
    const picks = scopedEntries.filter(entry => entry.prediction.planCPick === true);
    const dailyPickCount = dailyEntries.filter(entry => entry.prediction.planCPick === true).length;
    const wins = picks.filter(entry => pickOutcome(entry) === "WIN").length;
    const losses = picks.filter(entry => pickOutcome(entry) === "LOSS").length;
    const pending = picks.filter(entry => pickOutcome(entry) === "PENDING").length;
    const voids = picks.filter(entry => pickOutcome(entry) === "VOID").length;
    list.innerHTML = `
      <div class="plan-c-boundary-note">
        <b>SHADOW · EXPERIMENTAL</b>
        <span>Separate from official Value picks and alerts.</span>
      </div>
      <div class="plan-c-results-summary" aria-label="Αποτελέσματα προτάσεων">WIN ${wins} · LOSS ${losses} · Αναμονή ${pending} · VOID ${voids}</div>
      <p class="plan-c-explanation">Οι προτάσεις είναι Over 2.5: επιτυχία με 3 ή περισσότερα γκολ στο τελικό σκορ. Πειραματικό Plan C.</p>
      <div class="plan-c-summary">
        <div><strong>${esc(picks.length)}</strong><span>προτάσεις</span></div>
        <div><strong>${esc(scopedEntries.length)}</strong><span>αναλύσεις</span></div>
        <div><strong>${activeFilter === "history" ? "Ιστορικό & επόμενα" : esc(payload.date)}</strong><span>${generated ? `ενημέρωση ${esc(generated)}` : "ημερήσια προβολή"}</span></div>
      </div>
      <div class="plan-c-filter" role="group" aria-label="Plan C prediction filter">
        <button type="button" data-plan-c-filter="picks" class="${activeFilter === "picks" ? "active" : ""}">Προτάσεις ημέρας ${esc(dailyPickCount)}</button>
        <button type="button" data-plan-c-filter="all" class="${activeFilter === "all" ? "active" : ""}">Αναλύσεις ημέρας ${esc(dailyEntries.length)}</button>
        <button type="button" data-plan-c-filter="history" class="${activeFilter === "history" ? "active" : ""}">Ιστορικό & επόμενες προτάσεις</button>
      </div>
      <div class="plan-c-cards">
        ${entries.length ? entries.map(renderEntry).join("") : '<div class="panel-empty">Δεν υπάρχουν προτάσεις Plan C για αυτή την ημέρα.</div>'}
      </div>`;
  }

  function renderLoading() {
    list.innerHTML = `
      <div class="plan-c-boundary-note"><b>SHADOW · EXPERIMENTAL</b><span>Never used as an official pick or alert.</span></div>
      <div class="panel-placeholder">Loading Plan C shadow export…</div>`;
  }

  function renderError(message) {
    activePayload = null;
    list.innerHTML = `
      <div class="plan-c-boundary-note"><b>SHADOW · EXPERIMENTAL</b><span>Never used as an official pick or alert.</span></div>
      <div class="panel-empty plan-c-error">Shadow feed unavailable. ${esc(message || "")}</div>`;
  }

  async function load(day = "", background = false) {
    selectedDay = day;
    const sequence = ++requestSequence;
    activeController?.abort();
    activeController = new AbortController();
    if (!background) renderLoading();

    const query = validDay(day) ? `?date=${encodeURIComponent(day)}` : "";
    try {
      const response = await fetch(engineUrl(ENDPOINT + query), {
        cache: "no-store",
        signal: activeController.signal
      });
      if (sequence !== requestSequence) return;
      if (response.status === 404) {
        renderPayload({
          schema: SCHEMA,
          ok: true,
          available: false,
          mode: "SHADOW",
          productionEligible: false,
          date: validDay(day) ? day : new Date().toISOString().slice(0, 10),
          count: 0,
          pickCount: 0,
          entries: []
        });
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const validation = validatePayload(payload);
      if (!validation.ok) throw new Error(`invalid contract: ${validation.errors.join(", ")}`);
      renderPayload(payload);
    } catch (error) {
      if (error?.name === "AbortError" || sequence !== requestSequence) return;
      console.error("[plan-c-shadow]", error);
      renderError(error?.message || "Unknown error");
    }
  }

  list.addEventListener("click", event => {
    const button = event.target.closest("[data-plan-c-filter]");
    if (!button || !activePayload?.available) return;
    const nextFilter = button.getAttribute("data-plan-c-filter");
    if (!['all', 'picks', 'history'].includes(nextFilter)) return;
    activeFilter = nextFilter;
    renderPayload(activePayload);
  });

  window.addEventListener("date:change", event => {
    activeFilter = "picks";
    load(event?.detail?.date || event?.detail?.dataDate || "");
  });

  window.AIML_PlanCShadow = Object.freeze({
    reload: load,
    validatePayload,
    percent,
    signedPoints,
    pickOutcome,
    predictionDay
  });

  load(window.__AIML_SELECTED_DATE || "");
  window.setInterval?.(() => {
    if (document.visibilityState !== "hidden") load(selectedDay, true);
  }, 60000);
})();
