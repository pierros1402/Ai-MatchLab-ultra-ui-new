/* ============================================================
   assets/js/ui/details-panel.js (FULL LINKED v1.8.5)
   - Matches Details panel:
       ⓘ click opens DetailsPanel.renderLocal(matchObj, mountEl)
   - Hybrid + Standard Questions from Details Worker:
       GET /v1/match/details?id=<id>&league=<slug>&season=<season>
       optional: &check=1  (cooldown controlled)
       optional: &refresh=1 (forced)
   - Worker-backed Summary loader (legacy):
       /match-summary?league=<slug>&event=<id>
       /standings?league=<slug>
============================================================ */
(function () {
  "use strict";

  // --- i18n helper ---
  const T = (k) => {
    try {
      const lang = localStorage.getItem("aiml-lang") || "en";
      const dict = window.AIML_I18N?.[lang];
      return dict?.[k] || k;
    } catch {
      return k;
    }
  };

  const VER = "1.8.5";
  if (window.__AIML_DETAILS_PANEL_VER__ === VER) return;
  window.__AIML_DETAILS_PANEL_VER__ = VER;

// ------------------------------------------------------------
// AI BAR ANIMATION STYLE (inject once)
// ------------------------------------------------------------
(function ensureAIMLBarStyle(){

  if (document.getElementById("aiml-bar-style")) return;

  const style = document.createElement("style");
  style.id = "aiml-bar-style";

  style.textContent = `
    .aiml-bar-fill {
      transition: width 650ms cubic-bezier(.22,.61,.36,1);
    }

    .aiml-bar-flash {
      animation: aimlFlash 900ms ease;
    }

    @keyframes aimlFlash {
      0%   { box-shadow:0 0 0 rgba(0,200,255,0); }
      30%  { box-shadow:0 0 12px rgba(0,200,255,.65); }
      100% { box-shadow:0 0 0 rgba(0,200,255,0); }
    }
  `;

  document.head.appendChild(style);

})();

  const cfg = () => window.AIML_LIVE_CFG || {};
  const base = () =>
    String(cfg().fixturesBase || cfg().liveUltraBase || "").replace(/\/+$/, "");
  const detailsBase = () =>
    String(
      (window.AIML_CONFIG && window.AIML_CONFIG.BASE_URL) ||
        cfg().detailsBase ||
        ""
    ).replace(/\/+$/, "");

  const esc = (s) =>
    String(s == null ? "" : s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
// ------------------------------------------------------------
// AI SNAPSHOT WATCHER STATE
// ------------------------------------------------------------
let __aimlIntelWatcher = {
  timer: null,
  matchId: null,
  lastVersion: null
};
  function toYMD(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }

  function cacheKeyStandings(slug) {
    const day = toYMD(new Date());
    return `AIML_STANDINGS_CACHE:${slug}:${day}`;
  }

  function readStandingsCache(slug) {
    try {
      const raw = localStorage.getItem(cacheKeyStandings(slug));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function writeStandingsCache(slug, payload) {
    try {
      localStorage.setItem(cacheKeyStandings(slug), JSON.stringify(payload));
    } catch (_) {}
  }

  async function fetchJson(url, timeoutMs) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs || 9000);
    try {
      const res = await fetch(url, {
        method: "GET",
        credentials: "omit",
        signal: ctrl.signal,
      });
      const json = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, json };
    } finally {
      clearTimeout(t);
    }
  }

async function loadFromNewDetailsAPI(matchId) {
  try {
    const apiBase = base();
    if (!apiBase) return null;

    const res = await fetch(
      `${apiBase}/details?id=${encodeURIComponent(matchId)}`
    );
    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok) {
      // Honest miss: the engine explicitly said there is no detail for this
      // match (supplement-only fixture or tracked pipeline gap). Return the
      // structured payload so the panel can SAY so — null stays reserved for
      // network/availability failures, which fall through to the legacy path.
      if (data && data.error === "details_unavailable") return data;
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

function getCurrentLang() {
  try {
    const v = localStorage.getItem("aiml-lang");
    return v === "el" ? "el" : "en";
  } catch (_) {
    return "en";
  }
}

const DETAILS_ENUM_I18N = {
  en: {
    competitionType: {
      league: "League",
      cup: "Cup",
      international_cup: "International cup",
      domestic_cup: "Domestic cup",
      unknown: "Unknown"
    },
    motivation: {
      high: "High",
      medium: "Medium",
      low: "Low",
      unknown: "Unknown",
      cup_context: "Cup / knockout context"
    },
    travelImpact: {
      high: "High",
      medium: "Medium",
      low: "Low",
      unknown: "Unknown"
    },
    refereeStyle: {
      low_intervention: "Low intervention",
      medium_intervention: "Medium intervention",
      high_intervention: "High intervention",
      unknown: "Unknown"
    },
    pendingSignal: {
      standings: "Standings enrichment pending",
      refereeStats: "Referee stats pending",
      travelGeo: "Travel geo pending"
    }
  },
  el: {
    competitionType: {
      league: "Πρωτάθλημα",
      cup: "Κύπελλο",
      international_cup: "Διεθνής διοργάνωση",
      domestic_cup: "Εγχώριο κύπελλο",
      unknown: "Άγνωστο"
    },
    motivation: {
      high: "Υψηλό",
      medium: "Μέτριο",
      low: "Χαμηλό",
      unknown: "Άγνωστο",
      cup_context: "Πλαίσιο κυπέλλου / νοκ άουτ"
    },
    travelImpact: {
      high: "Υψηλή",
      medium: "Μέτρια",
      low: "Χαμηλή",
      unknown: "Άγνωστη"
    },
    refereeStyle: {
      low_intervention: "Χαμηλής παρέμβασης",
      medium_intervention: "Μέσης παρέμβασης",
      high_intervention: "Υψηλής παρέμβασης",
      unknown: "Άγνωστο"
    },
    pendingSignal: {
      standings: "Εκκρεμεί enrichment βαθμολογίας",
      refereeStats: "Εκκρεμούν στατιστικά διαιτητή",
      travelGeo: "Εκκρεμεί geo ταξιδιού"
    }
  }
};

function translateDetailsEnum(group, value) {
  const lang = getCurrentLang();
  const dict = DETAILS_ENUM_I18N[lang] || DETAILS_ENUM_I18N.en;
  const key = String(value ?? "unknown");
  return dict?.[group]?.[key] || key;
}

async function fetchIntelHealth(matchId) {
  try {
    const url =
      `https://aimatchlab-ai-engine.pierros1402.workers.dev/ai/intel-health?id=${encodeURIComponent(matchId)}`;

    const res = await fetchJson(url, 5000);

    if (!res.ok || !res.json?.ok) return null;

    return res.json;
  } catch (_) {
    return null;
  }
}
  function pickTeamName(t) {
    if (!t) return "";
    return (
      t.displayName ||
      t.name ||
      t.longName ||
      t.shortName ||
      t.abbreviation ||
      t.teamName ||
      ""
    );
  }

  function renderStandingsTable(table) {
    if (!Array.isArray(table) || !table.length) {
      return `<div class="muted">Standings unavailable.</div>`;
    }
    const rows = table
      .map((r) => {
        const rank = esc(r.rank ?? r.position ?? "");
        const team = esc(
          r.teamName ?? pickTeamName(r.team) ?? r.name ?? r.abbr ?? ""
        );
        const pts = esc(r.points ?? r.pts ?? "");
        const gp = esc(r.played ?? r.gp ?? "");
        const gd = esc(r.gd ?? r.goalDiff ?? "");
        return `<tr>
          <td style="padding:6px 8px;opacity:.9;">${rank}</td>
          <td style="padding:6px 8px;font-weight:700;">${team}</td>
          <td style="padding:6px 8px;opacity:.9;text-align:right;">${gp}</td>
          <td style="padding:6px 8px;opacity:.9;text-align:right;">${gd}</td>
          <td style="padding:6px 8px;font-weight:800;text-align:right;">${pts}</td>
        </tr>`;
      })
      .join("");

    return `
      <div style="overflow:auto;border:1px solid rgba(255,255,255,0.08);border-radius:12px;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:rgba(255,255,255,0.04);">
              <th style="text-align:left;padding:8px;">#</th>
              <th style="text-align:left;padding:8px;">Team</th>
              <th style="text-align:right;padding:8px;">GP</th>
              <th style="text-align:right;padding:8px;">GD</th>
              <th style="text-align:right;padding:8px;">Pts</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function renderStatsBlock(stats) {
    const arr = Array.isArray(stats) ? stats : [];
    if (!arr.length) return `<div class="muted">No stats.</div>`;

    const items = arr
      .slice(0, 24)
      .map((it) => {
        const k = esc(it.name || it.label || "");
        const hv = esc(it.home ?? it.h ?? it.valueHome ?? "");
        const av = esc(it.away ?? it.a ?? it.valueAway ?? "");
        return `
          <div style="display:grid;grid-template-columns:1fr auto auto;gap:10px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
            <div style="opacity:.9;">${k}</div>
            <div style="text-align:right;font-weight:800;">${hv}</div>
            <div style="text-align:right;font-weight:800;opacity:.95;">${av}</div>
          </div>`;
      })
      .join("");

    return `<div>${items}</div>`;
  }

  function normalizeSummary(summary, match) {
    const s = summary || {};
    const home =
      match?.home || s.home || s.homeTeam || pickTeamName(s.teams?.home) || "";
    const away =
      match?.away || s.away || s.awayTeam || pickTeamName(s.teams?.away) || "";
    const score = s.score_text || s.score || match?.score || "";
    const status = s.status || match?.status || "";
    const venue = s.venue || s.stadium || "";
    const kickoff = s.kickoff || match?.kickoff || match?.utcDate || "";
    const stats = s.stats || s.statistics || [];
    return { home, away, score, status, venue, kickoff, stats, raw: s };
  }

  function section(title, bodyHtml) {
    return `
      <div class="aiml-runtime-box" style="margin-top:14px;">
        <div style="font-weight:900;margin-bottom:8px;">${esc(title)}</div>
        ${bodyHtml}
      </div>`;
  }

  // =====================================================
  // FACTS SECTIONS (R2 ENRICHED) + COLLAPSIBLE UI
  // =====================================================

  function isPlaceholderObj(x) {
    if (!x || typeof x !== "object") return false;
    if (x.placeholder === true) return true;
    if (String(x.status || "").toUpperCase().includes("PLACEHOLDER")) return true;
    if (String(x.note || "").toLowerCase().includes("pending")) return true;
    if (String(x.message || "").toLowerCase().includes("pending")) return true;
    return false;
  }

  function renderPendingBox(title, subtitle, sourceKey) {
    return `
      <div style="padding:12px;border:1px solid rgba(255,255,255,0.10);border-radius:14px;background:rgba(255,255,255,0.03);">
        <div style="font-weight:900;">${esc(title)}</div>
        <div class="muted" style="margin-top:6px;">
          ${esc(subtitle || "Data pending — waiting enrichment.")}
        </div>
        ${
          sourceKey
            ? `<div class="muted" style="margin-top:8px;font-size:12px;opacity:.75;">source: ${esc(
                sourceKey
              )}</div>`
            : ``
        }
      </div>
    `;
  }

  function renderAbsencesList(abs) {
    const items = Array.isArray(abs) ? abs : [];
    if (!items.length) return `<div class="muted">No reported absences.</div>`;

    const row = (x) => {
      const name = esc(x.name || x.player || x.playerName || "Player");
      const reason = esc(x.reason || x.type || x.status || "");
      const pct =
        x.probability != null ? ` • ${esc(String(x.probability))}%` : "";
      return `
        <div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
          <div style="font-weight:800;">${name}</div>
          <div class="muted" style="text-align:right;">${reason}${pct}</div>
        </div>
      `;
    };

    return `<div>${items.slice(0, 25).map(row).join("")}</div>`;
  }

  function renderFactsStandingsInner(payload) {
    const facts = payload?.facts || {};
    const src =
      facts?.sources?.standings?.key || facts?.sources?.standings || "";

    const st = facts?.standings;
    if (!st) return renderPendingBox("Standings", "No standings data yet.", src);

    if (isPlaceholderObj(st)) {
      return renderPendingBox(
        "Standings",
        st.note || st.message || "Standings pending.",
        src
      );
    }

    const snap = st.snapshot || null;
    const table =
      (snap && (snap.table || snap.standings || snap.items || snap.data || snap.rows)) ||
      st.table ||
      st.standings ||
      st.items ||
      st.data ||
      st.rows ||
      null;
    return renderStandingsTable(table);
  }

  function renderFactsRefereesInner(payload) {
    const facts = payload?.facts || {};
    const src =
      facts?.sources?.referees?.key || facts?.sources?.referees || "";

    const ref = facts?.referees;
    if (!ref) return renderPendingBox("Referee", "No referee data yet.", src);

    if (isPlaceholderObj(ref)) {
      return renderPendingBox(
        "Referee",
        ref.note || ref.message || "Referee pending.",
        src
      );
    }

    const name =
      ref.name ||
      ref.displayName ||
      ref.referee ||
      ref.main ||
      ref.primary ||
      "";

    const extra = [];
    if (ref.country) extra.push(`Country: ${ref.country}`);
    if (ref.competition) extra.push(`Competition: ${ref.competition}`);
    if (ref.stats && typeof ref.stats === "object") {
      if (ref.stats.cardsPerGame != null)
        extra.push(`Cards/G: ${ref.stats.cardsPerGame}`);
      if (ref.stats.pensPerGame != null)
        extra.push(`Pens/G: ${ref.stats.pensPerGame}`);
    }

    return `
      <div style="padding:12px;border:1px solid rgba(255,255,255,0.10);border-radius:14px;background:rgba(255,255,255,0.03);">
        <div style="font-weight:900;font-size:15px;">${esc(name || "Referee")}</div>
        ${
          extra.length
            ? `<div class="muted" style="margin-top:6px;">${esc(
                extra.join(" • ")
              )}</div>`
            : `<div class="muted" style="margin-top:6px;">No additional referee stats yet.</div>`
        }
        ${
          src
            ? `<div class="muted" style="margin-top:8px;font-size:12px;opacity:.75;">source: ${esc(
                src
              )}</div>`
            : ``
        }
      </div>
    `;
  }

  function renderFactsAbsencesInner(payload) {
    const facts = payload?.facts || {};
    const src =
      facts?.sources?.absences?.key || facts?.sources?.absences || "";

    const abs = facts?.absences;
    if (!abs) return renderPendingBox("Absences", "No absences intel yet.", src);

    if (isPlaceholderObj(abs)) {
      return renderPendingBox(
        "Absences",
        abs.note || abs.message || "Absences pending.",
        src
      );
    }

    const homeArr = abs.home || abs.homeAbsences || abs?.snapshot?.home || [];
    const awayArr = abs.away || abs.awayAbsences || abs?.snapshot?.away || [];

    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start;">
        <div style="padding:12px;border:1px solid rgba(255,255,255,0.10);border-radius:14px;background:rgba(255,255,255,0.03);">
          <div style="font-weight:900;margin-bottom:8px;">Home</div>
          ${renderAbsencesList(homeArr)}
        </div>
        <div style="padding:12px;border:1px solid rgba(255,255,255,0.10);border-radius:14px;background:rgba(255,255,255,0.03);">
          <div style="font-weight:900;margin-bottom:8px;">Away</div>
          ${renderAbsencesList(awayArr)}
        </div>
      </div>
      ${
        src
          ? `<div class="muted" style="margin-top:8px;font-size:12px;opacity:.75;">source: ${esc(
              src
            )}</div>`
          : ``
      }
    `;
  }

  function collapsibleSection(id, title, bodyHtml, opts) {
    const open = opts?.open ? "open" : "";
    const badge = opts?.badge
      ? `<span class="muted" style="font-size:12px;opacity:.75;margin-left:8px;">${esc(
          opts.badge
        )}</span>`
      : "";
    return `
      <details ${open} style="margin-top:10px;border:1px solid rgba(255,255,255,0.08);border-radius:14px;background:rgba(255,255,255,0.02);padding:10px 12px;">
        <summary style="cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <div style="font-weight:900;">${esc(title)}${badge}</div>
          <div class="muted" style="font-size:12px;opacity:.7;">click</div>
        </summary>
        <div style="margin-top:10px;">
          ${bodyHtml}
        </div>
      </details>
    `;
  }

  function renderFactsBlock(payload) {

    const ai = payload?.fullAiProfile;
if (!ai) {
  return `
    <div style="margin-top:14px;">
      <div style="font-weight:900;margin-bottom:8px;">${T("AI Analysis")}</div>
      <div class="muted">AI profile unavailable.</div>
    </div>
  `;
}

const dna = ai.modeling?.dna || {};
const winPaths = ai.modeling?.winPaths || {};
const risk = ai.modeling?.risk || {};

return `
  <div style="margin-top:14px;">
    <div style="font-weight:900;margin-bottom:8px;">${T("AI Analysis")}</div>

    ${collapsibleSection(
      "ai-dna",
      T("DNA Profile"),
      `
        <div>${T("Tempo")}: <b>${T(dna.tempo || "-")}</b></div>
        <div>${T("Volatility")}: <b>${T(dna.volatility || "-")}</b></div>
      `,
      { open: false, badge: "ready" }
    )}

    ${collapsibleSection(
      "ai-paths",
      T("Win Paths"),
      `
        <div><b>${T("Home")}:</b> ${(winPaths.home || []).join(", ") || "-"}</div>
        <div><b>${T("Draw")}:</b> ${(winPaths.draw || []).join(", ") || "-"}</div>
        <div><b>${T("Away")}:</b> ${(winPaths.away || []).join(", ") || "-"}</div>
      `,
      { open: false, badge: "ready" }
    )}

    ${collapsibleSection(
      "ai-risk",
      T("Risk Model"),
      `
        <div>${T("Upset Index")}: <b>${risk.upsetIndex ?? "-"}</b></div>
        <div>${T("Draw Index")}: <b>${risk.drawIndex ?? "-"}</b></div>
      `,
      { open: false, badge: "ready" }
    )}
  </div>
`;
  }

  function renderAIDivider() {
    return `
      <div style="margin:14px 0 6px 0;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08);">
        <div class="muted" style="font-size:12px;letter-spacing:.02em;opacity:.75;">
          AI-generated analysis
        </div>
      </div>
    `;
  }

function summarizeAiTask(task) {
  const key = String(task?.key || "");
  const data = task?.data || null;

  if (!data || typeof data !== "object") {
    return "No structured data.";
  }

  if (key === "competition_context") {
    const importance = data.importance || "unknown";
    const pressure = Array.isArray(data.pressure) ? data.pressure.join(", ") : "";
    // stakes may be an array (legacy) or an object { home, away, tags } (ready).
    const stakes = Array.isArray(data.stakes)
      ? data.stakes.join(", ")
      : (data.stakes && Array.isArray(data.stakes.tags) ? data.stakes.tags.join(", ") : "");

    const lines = [];

    // Cross-league / cup: each side's position + motivation in its own league.
    const pt = data.perTeam;
    if (pt && pt.home && pt.away) {
      const side = (s) => {
        const pos = s.position != null ? `#${s.position}` : "—";
        const of = s.totalTeams ? `/${s.totalTeams}` : "";
        const lg = s.league ? ` (${s.league})` : "";
        const stk = s.stake && s.stake !== "neutral" ? ` — ${s.stake}` : "";
        return `${pos}${of}${lg}${stk}`;
      };
      lines.push(`Home: ${side(pt.home)}`);
      lines.push(`Away: ${side(pt.away)}`);
    } else if (data.positions && data.positions.home != null) {
      const p = data.positions;
      lines.push(`Positions: home #${p.home} vs away #${p.away}`);
    }

    lines.push(`Importance: ${importance}`);
    if (pressure) lines.push(`Pressure: ${pressure}`);
    if (stakes) lines.push(`Stakes: ${stakes}`);

    return lines.filter(Boolean).join(" • ");
  }

  if (key === "travel_context") {
    const distance =
      data.distanceKm != null && Number.isFinite(Number(data.distanceKm))
        ? `${Number(data.distanceKm).toFixed(1)} km`
        : "—";

    const impact = data.impact || "unknown";
    const profile = data.travelProfile || "unknown";
    const sameCountry =
      data.sameCountry === true
        ? "yes"
        : data.sameCountry === false
        ? "no"
        : "unknown";

    const crossBorder =
      data.crossBorder === true
        ? "yes"
        : data.crossBorder === false
        ? "no"
        : "unknown";

    return [
      `Distance: ${distance}`,
      `Impact: ${impact}`,
      `Profile: ${profile}`,
      `Same country: ${sameCountry}`,
      `Cross-border: ${crossBorder}`
    ].join(" • ");
  }

  if (key === "form_signal") {
    const home = data?.homeTeam;
    const away = data?.awayTeam;
    const homeScore = home?.formScore != null ? Number(home.formScore).toFixed(2) : "—";
    const awayScore = away?.formScore != null ? Number(away.formScore).toFixed(2) : "—";
    const homeMomentum = home?.momentum || "unknown";
    const awayMomentum = away?.momentum || "unknown";
    return `Home form: ${homeScore} (${homeMomentum}) • Away form: ${awayScore} (${awayMomentum})`;
  }

  if (key === "h2h_signal") {
    const edge = data?.trend?.edge || "unknown";
    const goalPattern = data?.trend?.goalPattern || "unknown";
    const sampleSize = data?.sampleSize ?? 0;
    return `Sample: ${sampleSize} • Edge: ${edge} • Goal pattern: ${goalPattern}`;
  }

  return "Structured AI task available.";
}

function buildLocalTravelTaskFromSnapshot(snapshot) {
  const travel = snapshot?.travel || null;

  if (!travel || travel.status !== "ready") {
    return null;
  }

  return {
    key: "travel_context",
    status: "ready",
    ok: true,
    source: travel.source || "local-team-geo",
    data: {
      status: travel.status,
      source: travel.source || "local-team-geo",
      distanceKm: travel.distanceKm ?? null,
      impact: travel.impact || "unknown",
      travelProfile: travel.travelProfile || "unknown",
      sameCountry: travel.sameCountry ?? null,
      crossBorder: travel.crossBorder ?? null,
      confidence: travel.confidence ?? null
    }
  };
}

function renderAiTasksBlock(snapshot) {
  console.log("[AI TASKS SNAPSHOT]", snapshot?.ai);

  const baseTasks = Array.isArray(snapshot?.ai?.tasks) ? snapshot.ai.tasks : [];
  const localTravelTask = buildLocalTravelTaskFromSnapshot(snapshot);

  const hasTravelTask = baseTasks.some(
    task => String(task?.key || "") === "travel_context"
  );

  const tasks = localTravelTask
    ? hasTravelTask
      ? baseTasks.map(task =>
          String(task?.key || "") === "travel_context"
            ? localTravelTask
            : task
        )
      : [...baseTasks, localTravelTask]
    : baseTasks;

  if (!tasks.length) return "";

  const rows = tasks.map((task) => {
    const key = String(task?.key || "unknown");
    const status = String(task?.status || "unknown");
    const ok = !!task?.ok;
    const summary = summarizeAiTask(task);

    return `
      <div style="padding:10px 12px;border:1px solid rgba(255,255,255,0.10);border-radius:12px;background:rgba(255,255,255,0.03);">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;">
          <div style="font-weight:900;">${esc(key)}</div>
          <div style="font-size:12px;opacity:.85;">
            <span style="padding:4px 8px;border-radius:10px;border:1px solid rgba(255,255,255,0.10);background:${ok ? "rgba(0,200,120,0.12)" : "rgba(255,180,0,0.12)"};">
              ${esc(status)}
            </span>
          </div>
        </div>
        <div style="margin-top:8px;line-height:1.4;opacity:.92;">
          ${esc(summary)}
        </div>
      </div>
    `;
  }).join("");

  return `
    <div style="margin-top:14px;">
      <div style="font-weight:900;margin-bottom:8px;">AI Tasks</div>
      <div style="display:grid;gap:8px;">
        ${rows}
      </div>
    </div>
  `;
}

// ------------------------------------------------------------
// MATCH REGIME DETECTOR
// ------------------------------------------------------------
function detectMatchRegime(signals) {

  if (!Array.isArray(signals) || !signals.length)
    return { label:"CALM", color:"#6aa6ff" };

  let volatility = 0;
  let control = 0;

  signals.slice(-6).forEach(s => {
    if (s.type === "VOLATILITY_SPIKE") volatility++;
    if (s.type === "CONTROL_CHANGE") control++;
  });

  if (volatility >= 2)
    return { label:"CHAOTIC", color:"#ff5252" };

  if (control >= 2)
    return { label:"TRANSITION", color:"#ffc857" };

  return { label:"STABLE", color:"#6aa6ff" };
}

// =====================================================
// AI RUNTIME INTELLIGENCE (LIVE ENGINE FEED)
// =====================================================
function renderRuntimeIntel(aiIntel, aiSignals) {

  if (!aiIntel) {
    return `
      <div style="margin-top:14px;">
        <div style="font-weight:900;margin-bottom:8px;">AI Match Intelligence</div>
        <div class="muted">Runtime intel unavailable.</div>
      </div>
      ${renderAiTasksBlock(snap)}
    `;
  }

  const narrative = aiIntel.narrative || "";
  const confidence = aiIntel.confidence || {};
  const phase = aiIntel.meta?.phase || "-";
  const regime = detectMatchRegime(aiSignals);
    setTimeout(() => {
      const box = document.querySelector(".aiml-runtime-box");
      if (!box) return;

      if (regime.label === "CHAOTIC") {
        box.style.boxShadow = "0 0 22px rgba(255,80,80,.25)";
      } else if (regime.label === "TRANSITION") {
        box.style.boxShadow = "0 0 18px rgba(255,200,80,.25)";
      } else {
        box.style.boxShadow = "0 0 14px rgba(100,160,255,.18)";
      }
     }, 0);
  const signalsHtml =
    Array.isArray(aiSignals) && aiSignals.length
      ? aiSignals.slice(-5).map(s => `
          <span style="
            padding:4px 8px;
            border-radius:10px;
            background:rgba(0,200,255,.12);
            margin-right:6px;
            font-size:12px;">
            ${esc(s.type)}
          </span>
        `).join("")
      : `<span class="muted">No active signals</span>`;

  return `
    <div style="margin-top:14px;">
      <div style="font-weight:900;margin-bottom:8px;">AI Match Intelligence</div>

      <div style="opacity:.85;margin-bottom:8px;">
        Phase: <b>${esc(phase)}</b>

        <div style="margin-top:6px;">
          Match Regime:
          <span style="
            padding:3px 8px;
            border-radius:10px;
            background:${regime.color}22;
            color:${regime.color};
            font-weight:900;
            margin-left:6px;
            letter-spacing:.4px;
          ">
            ${regime.label}
          </span>
        </div>
      </div>

      ${
        narrative
          ? `<div style="margin-bottom:10px;">${esc(narrative)}</div>`
          : `<div class="muted">No narrative yet.</div>`
      }

      <div style="margin-bottom:10px;">
        Confidence:
        <b>${esc(String(confidence.value ?? "-"))}</b>
        (${esc(confidence.level || "-")})
      </div>

      <div>${signalsHtml}</div>
    </div>
  `;
}

// ------------------------------------------------------------
// SNAPSHOT WATCHER
// ------------------------------------------------------------
function startIntelWatcher(matchId, rerenderFn) {

  if (!matchId) return;

  // stop previous watcher
  if (__aimlIntelWatcher.timer) {
    clearInterval(__aimlIntelWatcher.timer);
    __aimlIntelWatcher.timer = null;
  }

  __aimlIntelWatcher.matchId = matchId;

  __aimlIntelWatcher.timer = setInterval(async () => {

    const health = await fetchIntelHealth(matchId);
    if (!health) return;

    const version = health.version || health.latest || null;
    if (!version) return;

    // first capture
    if (!__aimlIntelWatcher.lastVersion) {
      __aimlIntelWatcher.lastVersion = version;
      return;
    }

    // version changed → rerender
    if (version !== __aimlIntelWatcher.lastVersion) {
      __aimlIntelWatcher.lastVersion = version;

      console.log("[AIML] Intel snapshot changed → refresh panel");

      rerenderFn?.();
    }

  }, 15000); // 15s lightweight check
}

  // =====================================================
  // DETAILS WORKER (API) → HYBRID RENDER (AI-GENERATED)
  // =====================================================

  function renderHybridFromDetailsAPI(payload) {
    const ai = payload?.fullAiProfile || null;
    if (!ai) return `<div class="muted">Hybrid unavailable.</div>`;

    const hybrid = ai.modeling || {};

    if (!hybrid) return `<div class="muted">Hybrid unavailable.</div>`;

    let dnaArr = [];

    if (Array.isArray(hybrid.dna)) {
      dnaArr = hybrid.dna;
    } else if (hybrid.dna && typeof hybrid.dna === "object") {
      dnaArr = Object.entries(hybrid.dna)
        .map(([k,v]) => `${T(k)}: ${T(v)}`);
    }

    const winPaths = hybrid.winPaths || {};
    const risk = hybrid.risk || {};
    const insights = Array.isArray(hybrid.insights) ? hybrid.insights : [];

    const chips = dnaArr.length
      ? dnaArr
          .map(
            (x) =>
              `<span class="aiml-chip"><span class="aiml-chip-value">${esc(
                x
              )}</span></span>`
          )
          .join(" ")
      : `<div class="muted">No DNA.</div>`;

    const list = (arr) =>
      Array.isArray(arr) && arr.length
        ? `<ul class="aiml-win-list">${arr
            .map((x) => `<li>${esc(x)}</li>`)
            .join("")}</ul>`
        : `<div class="muted">—</div>`;

    const bar = (label, value) => {
      const v = Math.max(0, Math.min(100, Number(value) || 0));
      return `
        <div class="aiml-risk-row">
          <div class="aiml-risk-label">${esc(label)}</div>
          <div class="aiml-risk-bar"><div class="aiml-risk-fill" style="width:${v}%;"></div></div>
          <div class="aiml-risk-val">${esc(v)}</div>
        </div>`;
    };

    const cacheTag = payload?.cache
      ? `<span class="muted" style="margin-left:8px;">(${esc(payload.cache)})</span>`
      : "";

    return `
      <div class="aiml-hybrid">
        <div class="aiml-hybrid-head">AIML Hybrid Analysis (AI-generated)${cacheTag}</div>
        <div class="muted" style="margin-top:4px;font-size:12px;opacity:.8;">
          Interpretive analysis — not factual data
        </div>

        <div class="aiml-dna" style="margin-top:10px;">${chips}</div>

        <div class="aiml-winpaths">
          <div class="aiml-wincol">
            <div class="aiml-win-title">HOME WIN PATH</div>
            ${list(winPaths.home)}
          </div>
          <div class="aiml-wincol">
            <div class="aiml-win-title">DRAW PATH</div>
            ${list(winPaths.draw)}
          </div>
          <div class="aiml-wincol">
            <div class="aiml-win-title">AWAY WIN PATH</div>
            ${list(winPaths.away)}
          </div>
        </div>

        <div class="aiml-risk">
          <div class="aiml-subtitle">Risk Meter (0–100)</div>
          ${bar("Upset Risk", risk.upset ?? risk.upsetRisk ?? risk.upsetIndex)}
          ${bar("Draw Risk", risk.draw ?? risk.drawRisk ?? risk.drawIndex)}
        </div>

        <div class="aiml-insights">
          <div class="aiml-subtitle">Key Insights</div>
          ${
            insights.length
              ? `<ul class="aiml-insights-list">${insights
                  .map((x) => `<li>${esc(x)}</li>`)
                  .join("")}</ul>`
              : `<div class="muted">No insights.</div>`
          }
        </div>
      </div>
    `;
  }

  function stdqLooksPending(payload) {
    const isMissing = String(payload?.status || "").toUpperCase() === "MISSING";
    const uiHint = String(payload?.uiHint || "");
    if (isMissing) return true;
    if (uiHint.toLowerCase().includes("pending")) return true;
    if (uiHint.toLowerCase().includes("enrich")) return true;

    const qs =
      Array.isArray(payload?.standardQuestions)
        ? payload.standardQuestions
        : Array.isArray(payload?.fullAiProfile?.modeling?.standardQuestions)
        ? payload.fullAiProfile.modeling.standardQuestions
        : [];

    // Heuristic: if any answer contains "awaiting enrichment" / "baseline" wording, treat as pending.
    for (const q of qs) {
      const bullets = q?.a?.bullets;
      if (Array.isArray(bullets)) {
        for (const b of bullets) {
          const s = String(b || "").toLowerCase();
          if (s.includes("awaiting enrichment")) return true;
          if (s.includes("baseline intel")) return true;
          if (s.includes("not enriched")) return true;
          if (s.includes("pending")) return true;
        }
      }
    }

    // Also: if hybrid insights mention baseline only, treat stdq as pending
    const hi = Array.isArray(payload?.hybrid?.insights) ? payload.hybrid.insights : [];
    if (hi.some(x => String(x || "").toLowerCase().includes("baseline only"))) return true;

    return false;
  }

  function renderStandardQuestionsFromDetailsAPI(payload) {
    // GUARD: if pending enrichment → show placeholder only (no bars/metrics)
    const isPending = stdqLooksPending(payload);

    if (isPending) {
      return `
        <div class="aiml-runtime-box" style="margin-top:14px;">
          <div style="font-weight:900;margin-bottom:8px;">AIML Standard Questions (AI-generated)</div>
          ${renderPendingBox(
            "Data pending",
            "Awaiting enrichment — AI questions will appear when facts/intel are available.",
            ""
          )}
        </div>
      `;
    }

    const qs =
      Array.isArray(payload?.standardQuestions)
        ? payload.standardQuestions
        : Array.isArray(payload?.fullAiProfile?.modeling?.standardQuestions)
        ? payload.fullAiProfile.modeling.standardQuestions
        : [];
    if (!qs.length) return `<div class="muted">No standard questions yet.</div>`;

    const renderAnswer = (a) => {
      if (!a) return `<div class="muted">—</div>`;
      if (Array.isArray(a.bullets) && a.bullets.length) {
        return `<ul style="margin:6px 0 0 18px;">${a.bullets
          .map((x) => `<li>${esc(x)}</li>`)
          .join("")}</ul>`;
      }
      if (a.home || a.draw || a.away) {
        const col = (title, arr) => `
          <div style="flex:1;min-width:180px;">
            <div style="font-weight:900;opacity:.9;margin-bottom:6px;">${esc(title)}</div>
            ${
              Array.isArray(arr) && arr.length
                ? `<ul style="margin:0 0 0 18px;">${arr
                    .map((x) => `<li>${esc(x)}</li>`)
                    .join("")}</ul>`
                : `<div class="muted">—</div>`
            }
          </div>`;
        return `
          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;">
            ${col("HOME", a.home)}
            ${col("DRAW", a.draw)}
            ${col("AWAY", a.away)}
          </div>`;
      }
      if (a.upset != null || a.draw != null || a.volatility) {
        return `
          <div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div style="padding:10px;border:1px solid rgba(255,255,255,0.08);border-radius:12px;">
              <div style="opacity:.75;font-weight:800;">Upset</div>
              <div style="font-weight:900;font-size:18px;">${esc(
                String(a.upset ?? "—")
              )}</div>
            </div>
            <div style="padding:10px;border:1px solid rgba(255,255,255,0.08);border-radius:12px;">
              <div style="opacity:.75;font-weight:800;">Draw</div>
              <div style="font-weight:900;font-size:18px;">${esc(
                String(a.draw ?? "—")
              )}</div>
            </div>
            <div style="grid-column:1 / -1;padding:10px;border:1px solid rgba(255,255,255,0.08);border-radius:12px;">
              <div style="opacity:.75;font-weight:800;">Volatility</div>
              <div style="font-weight:900;">${esc(
                String(a.volatility || "—")
              )}</div>
            </div>
          </div>`;
      }
      return `<pre style="white-space:pre-wrap;margin-top:8px;opacity:.9;">${esc(
        JSON.stringify(a, null, 2)
      )}</pre>`;
    };

    const blocks = qs
      .map(
        (it) => `
      <div style="margin-top:12px;padding:12px;border:1px solid rgba(255,255,255,0.08);border-radius:14px;background:rgba(255,255,255,0.03);">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline;">
          <div style="font-weight:900;">${esc(it.title || it.id || "Question")}</div>
          <div class="muted" style="font-size:12px;">${esc(it.id || "")}</div>
        </div>
        <div style="margin-top:6px;opacity:.85;"><b>Q:</b> ${esc(it.q || "")}</div>
        <div style="margin-top:8px;"><b>A:</b> ${renderAnswer(it.a)}</div>
      </div>
    `
      )
      .join("");

    return `
      <div style="margin-top:14px;">
        <div style="font-weight:900;margin-bottom:8px;">AIML Standard Questions (AI-generated)</div>
        ${blocks}
      </div>`;
  }

  function hybridLoadingBlock() {
    return `
      <div class="aiml-hybrid">
        <div class="aiml-hybrid-head">AIML Hybrid Analysis (AI-generated) <span class="muted">(loading…)</span></div>
        <div class="muted" style="margin-top:10px;">Fetching details from engine…</div>
      </div>
    `;
  }

  function fmtKickoffLocal(m) {
    const iso = m?.kickoff || m?.utcDate || null;
    const ms = m?.kickoff_ms != null ? Number(m.kickoff_ms) : null;
    let d = null;
    if (ms && Number.isFinite(ms)) d = new Date(ms);
    else if (iso) {
      const t = Date.parse(iso);
      if (!Number.isNaN(t)) d = new Date(t);
    }
    if (!d) return "";
    try {
      return d.toLocaleString("el-GR", {
        timeZone: "Europe/Athens",
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_) {
      return d.toLocaleString();
    }
  }

  function normalizeScore(m) {
    const sh = m?.scoreHome != null ? Number(m.scoreHome) : null;
    const sa = m?.scoreAway != null ? Number(m.scoreAway) : null;
    if (Number.isFinite(sh) && Number.isFinite(sa)) return `${sh}-${sa}`;
    return "";
  }

  function normalizeStatus(m) {
    return String(m?.status || "").replace("STATUS_", "") || "";
  }

  function normalizePlayerUsageSide(side) {
    const x = side && typeof side === "object" ? side : {};

    return {
      team: x.team || null,
      opponent: x.opponent || null,
      side: x.side || null,
      leagueSlug: x.leagueSlug || null,
      leagueName: x.leagueName || null,
      competitionType: x.competitionType || null,
      source: x.source || null,
      updatedAt: x.updatedAt || null,

      status: String(x.status || "unavailable"),
      reason: String(x.reason || ""),
      confidence: Number.isFinite(Number(x.confidence)) ? Number(x.confidence) : 0,
      sampleMatches:        x.sampleMatches != null
          ? x.sampleMatches
          : x.matchCount != null
          ? x.matchCount
          : x.meta?.sampleMatches != null
          ? x.meta.sampleMatches
          : 0,
      expectedStarters: Array.isArray(x.expectedStarters) ? x.expectedStarters : [],
      confirmedAbsences: Array.isArray(x.confirmedAbsences) ? x.confirmedAbsences : [],
      inferredAbsences: Array.isArray(x.inferredAbsences) ? x.inferredAbsences : []
    };
  }

  function pickPlayerUsageIntelFromSnapshot(snap) {
    const direct = snap?.playerUsageIntel;
    const researched = snap?.researchedFacts?.playerUsageIntel;

    const researchedHasMetadata =
      researched &&
      typeof researched === "object" &&
      (
        researched.home?.leagueSlug ||
        researched.home?.leagueName ||
        researched.home?.competitionType ||
        researched.away?.leagueSlug ||
        researched.away?.leagueName ||
        researched.away?.competitionType
      );

    const src =
      researchedHasMetadata
        ? researched
        : direct && typeof direct === "object"
        ? direct
        : researched && typeof researched === "object"
        ? researched
        : null;

    if (!src) return null;

    return {
      home: normalizePlayerUsageSide(src.home),
      away: normalizePlayerUsageSide(src.away)
    };
  }

  function renderPlayerUsageNames(items, emptyText) {
    const arr = Array.isArray(items) ? items : [];
    if (!arr.length) {
      return `<div class="muted">${esc(emptyText || "—")}</div>`;
    }

    return `
      <div style="display:grid;gap:6px;">
        ${arr
          .slice(0, 12)
          .map((x) => {
            const name =
              typeof x === "string"
                ? x
                : x?.name || x?.player || x?.playerName || "Player";

            const meta =
              typeof x === "object" && x
                ? [
                    x.position ? String(x.position) : "",
                    x.confidence != null ? `conf ${Number(x.confidence).toFixed(2)}` : "",
                    x.frequency != null ? `freq ${Number(x.frequency).toFixed(2)}` : ""
                  ]
                    .filter(Boolean)
                    .join(" • ")
                : "";

            return `
              <div style="display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
                <div style="font-weight:800;">${esc(name)}</div>
                ${meta ? `<div class="muted" style="text-align:right;font-size:12px;">${esc(meta)}</div>` : ``}
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderPlayerUsageSide(title, side) {
    const status = side?.status || "unavailable";
    const confidence = Number.isFinite(Number(side?.confidence))
      ? Number(side.confidence)
      : 0;

    const ready =
      status === "ready" ||
      status === "valid_usage" ||
      status === "available" ||
      side?.expectedStarters?.length > 0;

    return `
      <div style="padding:12px;border:1px solid rgba(255,255,255,0.10);border-radius:14px;background:rgba(255,255,255,0.03);">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
          <div style="font-weight:900;">${esc(title)}</div>
          <div style="font-size:12px;padding:4px 8px;border-radius:10px;border:1px solid rgba(255,255,255,0.10);background:${
            ready ? "rgba(0,200,120,0.12)" : "rgba(255,180,0,0.12)"
          };">
            ${esc(status)}
          </div>
        </div>

        <div class="muted" style="margin-top:6px;font-size:12px;">
          Team: <b>${esc(side?.team || title || "—")}</b>
          ${
            side?.opponent
              ? `<span style="margin-left:8px;">Opponent: <b>${esc(side.opponent)}</b></span>`
              : ``
          }
        </div>

        <div class="muted" style="margin-top:6px;font-size:12px;">
          Competition: <b>${esc(side?.leagueName || side?.leagueSlug || "—")}</b>
          ${
            side?.leagueSlug
              ? `<span style="margin-left:8px;">Slug: <b>${esc(side.leagueSlug)}</b></span>`
              : ``
          }
        </div>

        <div class="muted" style="margin-top:6px;font-size:12px;">
          Type: <b>${esc(side?.competitionType || "—")}</b>
          <span style="margin-left:8px;">Confidence: <b>${esc(confidence.toFixed(2))}</b></span>
          <span style="margin-left:8px;">Sample: <b>${esc(String(side?.sampleMatches ?? 0))}</b></span>
        </div>
        ${
          // Only show reason code when NOT ready — if starters are present, reason is noise
          (!ready && side?.reason)
            ? `<div class="muted" style="margin-top:6px;font-size:12px;">${esc(side.reason)}</div>`
            : ``
        }

        <div style="margin-top:10px;font-weight:900;font-size:13px;">Expected starters</div>
        <div style="margin-top:6px;">
          ${renderPlayerUsageNames(side?.expectedStarters, "No expected starters available.")}
        </div>

        <div style="margin-top:10px;font-weight:900;font-size:13px;">Confirmed absences</div>
        <div style="margin-top:6px;">
          ${renderPlayerUsageNames(side?.confirmedAbsences, "No confirmed absences.")}
        </div>

        ${
          Array.isArray(side?.inferredAbsences) && side.inferredAbsences.length
            ? `
              <div style="margin-top:10px;font-weight:900;font-size:13px;">Inferred absences</div>
              <div style="margin-top:6px;">
                ${renderPlayerUsageNames(side.inferredAbsences, "No inferred absences.")}
              </div>
            `
            : ``
        }
      </div>
    `;
  }

  function renderPlayerUsageIntelBlock(snap) {
    const intel = pickPlayerUsageIntelFromSnapshot(snap);

    if (!intel) {
      return `
        <div style="margin-top:14px;padding:12px;border:1px solid rgba(255,255,255,0.10);border-radius:14px;background:rgba(255,255,255,0.03);">
          <div style="font-weight:900;margin-bottom:8px;">Player Usage Intel</div>
          <div class="muted">Player usage intel unavailable.</div>
        </div>
      `;
    }

    return `
      <div style="margin-top:14px;">
        <div style="font-weight:900;margin-bottom:8px;">Player Usage Intel</div>
        <div class="muted" style="font-size:12px;margin-bottom:10px;">
          Validated local player-usage substrate. No fake absence rule active.
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start;">
          ${renderPlayerUsageSide("Home", intel.home)}
          ${renderPlayerUsageSide("Away", intel.away)}
        </div>
      </div>
    `;
  }

  function renderDetailsInfoBox() {
    return `
      <div id="aiml-details-info-box" style="display:none;margin-top:10px;padding:10px 12px;border:1px solid rgba(255,255,255,0.10);border-radius:14px;background:rgba(255,255,255,0.03);">
        <div class="muted" style="font-size:13px;line-height:1.35;">
          Τα στοιχεία που εμφανίζονται είναι στατιστικά δεδομένα και πληροφορίες από τη βάση δεδομένων της πλατφόρμας.<br>
          Δεν αποτελούν προβλέψεις ή προτροπές στοιχηματισμού.
        </div>
      </div>
    `;
  }

function resolveDetailsMatchId(match) {
  const candidates = [
    match?.detailsId,
    match?.detailId,
    match?.canonicalId,
    match?.canonicalMatchId,
    match?.cid,
    match?.matchId,
    match?.id
  ];

  for (const value of candidates) {
    const key = String(value || "").trim();
    if (key) return key;
  }

  return "";
}

async function renderLocal(match, mountEl) {
  const el = mountEl;
  if (!el) return;

  // cleanup previous intel watcher
  if (__aimlIntelWatcher.timer) {
    clearInterval(__aimlIntelWatcher.timer);
    __aimlIntelWatcher.timer = null;
    __aimlIntelWatcher.lastVersion = null;
  }

  const m = match || {};
  const home = esc(m.home || m.homeTeam || "");
  const away = esc(m.away || m.awayTeam || "");
  const league = esc(m.leagueName || m.leagueSlug || "");
  const status = esc(normalizeStatus(m));
  const score = esc(normalizeScore(m));
  const minute =
    m.minute != null && Number(m.minute) > 0
      ? ` • ${esc(String(m.minute))}'`
      : "";
  const kickoffLocal = esc(fmtKickoffLocal(m));

  const matchId = String(m.matchId || m.id || "").trim();
  const detailsMatchId = resolveDetailsMatchId(m) || matchId;

  if (detailsMatchId && matchId && detailsMatchId !== matchId) {
    console.log("[details] using canonical details id", {
      matchId,
      detailsMatchId
    });
  }

  const leagueSlug = String(m.leagueSlug || m.league || "_unknown");
  const season = String(cfg().season || "2025-2026");

  const newDetails = detailsMatchId
    ? await loadFromNewDetailsAPI(detailsMatchId)
    : null;

  // ------------------------------------------------------------
  // HONEST MISS: engine said details are unavailable for this match
  // (supplement-only fixture or a tracked pipeline gap) — render the basic
  // header + a clear message instead of legacy loaders that end in a blank.
  // ------------------------------------------------------------
  if (newDetails && newDetails.ok === false && newDetails.error === "details_unavailable") {
    const lang = getCurrentLang();
    const isPipelineGap = newDetails.reason === "missing_detail_for_canonical_fixture";
    const msg = lang === "el"
      ? (isPipelineGap
          ? "Οι λεπτομέρειες για αυτόν τον αγώνα δεν έχουν χτιστεί ακόμα — καταγεγραμμένο κενό, αναμένεται στον επόμενο κύκλο."
          : "Δεν υπάρχει πλήρης ανάλυση για αυτόν τον αγώνα: εμφανίζεται ως συμπληρωματικός (ύπαρξη/αποδόσεις μόνο), οπότε δεν χτίζονται λεπτομέρειες.")
      : (isPipelineGap
          ? "Details for this match have not been built yet — a tracked gap, expected on the next cycle."
          : "No full analysis exists for this match: it is a supplemental fixture (existence/odds only), so details are not built for it.");

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-end;flex-wrap:wrap;">
        <div style="font-weight:900;font-size:18px;">${home} <span style="opacity:.6;">vs</span> ${away}</div>
        <div style="opacity:.85;font-weight:800;">${status}${minute}</div>
      </div>
      <div style="margin-top:6px;opacity:.85;">
        ${score ? `<span style="font-weight:900;">${score}</span>` : ``}
        ${kickoffLocal ? `<span style="margin-left:10px;">${kickoffLocal}</span>` : ``}
      </div>
      <div style="margin-top:6px;opacity:.75;font-size:12px;">
        League: <b>${league}</b>
        ${matchId ? `<span style="margin-left:10px;opacity:.7;">ID: ${esc(matchId)}</span>` : ``}
      </div>
      <div class="muted" style="margin-top:14px;padding:12px;border:1px solid rgba(255,255,255,0.10);border-radius:12px;background:rgba(255,255,255,0.03);">
        ${esc(msg)}
      </div>
    `;
    document.dispatchEvent(new CustomEvent("details-rendered"));
    return;
  }

  // ------------------------------------------------------------
  // NEW ENGINE DETAILS API FIRST
  // ------------------------------------------------------------
  if (newDetails?.snapshot) {
    const snap = newDetails.snapshot;
    console.log("[DETAILS SNAPSHOT CHECK]", snap.ai);
    const valueRows = Array.isArray(newDetails.value)
      ? newDetails.value
      : Array.isArray(snap.value)
      ? snap.value
      : [];

    const currentLang = (() => {
      try {
        const v = localStorage.getItem("aiml-lang");
        return v === "el" ? "el" : "en";
      } catch (_) {
        return "en";
      }
    })();

    const lang = getCurrentLang();

    const summaryText =
      currentLang === "el"
        ? (snap.analysis?.summary?.el || snap.analysis?.summary?.en || "—")
        : (snap.analysis?.summary?.en || snap.analysis?.summary?.el || "—");

    const valueHtml = valueRows.length
      ? `
        <div style="margin-top:14px;">
          <div style="font-weight:900;margin-bottom:8px;">Value Snapshot</div>
          <div style="display:grid;gap:8px;">
            ${valueRows
              .map(
                (v) => `
                <div style="padding:10px 12px;border:1px solid rgba(255,255,255,0.10);border-radius:12px;background:rgba(255,255,255,0.03);">
                  <div style="font-weight:800;">${esc(v.marketName || v.market || "Market")}</div>
                  <div style="margin-top:4px;">
                    Pick: <b>${esc(v.pick || "—")}</b>
                    ${v.fairOdds != null ? `<span style="margin-left:10px;">Fair odds: <b>${esc(v.fairOdds)}</b></span>` : ""}
                    <span style="margin-left:10px;">Score: <b>${esc(
                      v.score != null ? (Number(v.score) * 100).toFixed(1) + "%" : "—"
                    )}</b></span>
                    <span style="margin-left:10px;">Confidence: <b>${esc(
                      v.confidence != null ? (Number(v.confidence) * 100).toFixed(1) + "%" : "—"
                    )}</b></span>
                  </div>
                  <div style="margin-top:4px;">
                    Result: <b>${esc(v.result || "PENDING")}</b>
                    ${v.source === "ai_assessment" ? `<span style="margin-left:8px;opacity:0.5;font-size:11px;">AI Estimate</span>` : ""}
                  </div>
                </div>
              `
              )
              .join("")}
          </div>
        </div>
      `
      : `
        <div style="margin-top:14px;">
          <div style="font-weight:900;margin-bottom:8px;">Value Snapshot</div>
          <div class="muted">No value snapshot available for this match.</div>
        </div>
      `;

    const refereeName = snap.referee?.name || "—";
    const refereeStyle = translateDetailsEnum(
      "refereeStyle",
      snap.referee?.style || "unknown"
    );

    const motivation = translateDetailsEnum(
      "motivation",
      snap.context?.motivation || "unknown"
    );

    const rawCompetitionType =
      snap.basic?.competitionType ||
      snap.context?.competitionType ||
      "unknown";

    const competitionType = translateDetailsEnum(
      "competitionType",
      rawCompetitionType
    );

    const competitionName =
      snap.basic?.leagueName ||
      snap.leagueName ||
      "";

    const competitionSlug =
      snap.basic?.leagueSlug ||
      snap.leagueSlug ||
      "";

    const travelImpact = translateDetailsEnum(
      "travelImpact",
      snap.context?.travelImpact || "unknown"
    );
    const distanceKm =
      snap.travel?.distanceKm != null ? String(snap.travel.distanceKm) : "—";

    const homePos = snap.context?.table?.homePosition ?? "—";
    const awayPos = snap.context?.table?.awayPosition ?? "—";
    const totalTeams = snap.context?.table?.totalTeams ?? "—";

    const pending = snap.meta?.pendingSignals || {};
    const pendingItems = [];
    if (pending.standings) pendingItems.push(translateDetailsEnum("pendingSignal", "standings"));
    if (pending.refereeStats) pendingItems.push(translateDetailsEnum("pendingSignal", "refereeStats"));
    if (pending.travelGeo) pendingItems.push(translateDetailsEnum("pendingSignal", "travelGeo"));

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-end;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <div style="font-weight:900;font-size:18px;">${home} <span style="opacity:.6;">vs</span> ${away}</div>
          <button id="aiml-details-info-btn"
            title="Info"
            style="width:28px;height:28px;border-radius:999px;border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.04);color:inherit;font-weight:900;cursor:pointer;line-height:1;">
            ⓘ
          </button>
        </div>
        <div style="opacity:.85;font-weight:800;">${status}${minute}</div>
      </div>

      ${renderDetailsInfoBox()}

      <div style="margin-top:6px;opacity:.85;">
        ${score ? `<span style="font-weight:900;">${score}</span>` : ``}
        ${kickoffLocal ? `<span style="margin-left:10px;">${kickoffLocal}</span>` : ``}
      </div>

      <div style="margin-top:6px;opacity:.75;font-size:12px;">
        League: <b>${league}</b>
        ${matchId ? `<span style="margin-left:10px;opacity:.7;">ID: ${esc(matchId)}</span>` : ``}
      </div>

      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
        <span style="padding:8px 10px;border-radius:12px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);font-weight:800;">
          Snapshot Ready
        </span>
        <span class="muted" style="align-self:center;font-size:12px;opacity:.8;">
          ${esc(snap.meta?.version || "details-snapshot")}
        </span>
      </div>

      <div style="margin-top:14px;">
        <div style="font-weight:900;margin-bottom:8px;">Match Analysis</div>
        <div style="padding:12px;border:1px solid rgba(255,255,255,0.10);border-radius:14px;background:rgba(255,255,255,0.03);line-height:1.45;">
          ${esc(summaryText)}
        </div>
      </div>

      <div style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start;">
        <div style="padding:12px;border:1px solid rgba(255,255,255,0.10);border-radius:14px;background:rgba(255,255,255,0.03);">
          <div style="font-weight:900;margin-bottom:8px;">Context Snapshot</div>
          <div>Competition: <b>${esc(competitionName || "—")}</b></div>
          <div style="margin-top:6px;">Type: <b>${esc(competitionType)}</b></div>
          ${
            competitionSlug
              ? `<div style="margin-top:6px;">Slug: <b>${esc(competitionSlug)}</b></div>`
              : ``
          }
          <div style="margin-top:6px;">Motivation: <b>${esc(motivation)}</b></div>
          <div style="margin-top:6px;">Travel Impact: <b>${esc(travelImpact)}</b></div>
          <div style="margin-top:6px;">Distance: <b>${esc(distanceKm)}</b></div>
        </div>

        <div style="padding:12px;border:1px solid rgba(255,255,255,0.10);border-radius:14px;background:rgba(255,255,255,0.03);">
          <div style="font-weight:900;margin-bottom:8px;">Referee</div>
          <div>Name: <b>${esc(refereeName)}</b></div>
          <div style="margin-top:6px;">Style: <b>${esc(refereeStyle)}</b></div>
          <div style="margin-top:6px;">Avg Cards: <b>${esc(
            snap.referee?.stats?.avgCards ?? "—"
          )}</b></div>
          <div style="margin-top:6px;">Avg Penalties: <b>${esc(
            snap.referee?.stats?.avgPenalties ?? "—"
          )}</b></div>
        </div>
      </div>

      <div style="margin-top:14px;padding:12px;border:1px solid rgba(255,255,255,0.10);border-radius:14px;background:rgba(255,255,255,0.03);">
        <div style="font-weight:900;margin-bottom:8px;">Table Context</div>
        <div>Home Position: <b>${esc(homePos)}</b></div>
        <div style="margin-top:6px;">Away Position: <b>${esc(awayPos)}</b></div>
        <div style="margin-top:6px;">Total Teams: <b>${esc(totalTeams)}</b></div>
      </div>

      ${(() => {
        const h2h = snap.h2h;
        if (!h2h || !h2h.all?.length) return "";
        const homeRaw = m.home || m.homeTeam || "";
        const awayRaw = m.away || m.awayTeam || "";
        const views = [
          { key: "all",    label: "All",                  matches: h2h.all,    sum: h2h.summary?.all },
          { key: "atHome", label: `At ${esc(homeRaw)}`,   matches: h2h.atHome, sum: h2h.summary?.atHome },
          { key: "atAway", label: `At ${esc(awayRaw)}`,   matches: h2h.atAway, sum: h2h.summary?.atAway },
        ];
        const uid = "aiml-h2h-" + (Math.random().toString(36).slice(2));
        const renderMatches = (matches) => {
          if (!matches?.length) return `<div style="opacity:.5;font-size:12px;margin-top:6px;">No matches in this filter.</div>`;
          return matches.slice(0, 10).map(hm => {
            const isHomeWin  = hm.scoreHome > hm.scoreAway;
            const isAwayWin  = hm.scoreHome < hm.scoreAway;
            const isDraw     = hm.scoreHome === hm.scoreAway;
            const homeIsHome = (hm.homeTeam || "").toLowerCase().includes((homeRaw || "").toLowerCase().split(" ")[0]);
            const col = homeIsHome ? (isHomeWin ? "#4caf50" : isAwayWin ? "#f44336" : "#aaa") :
                                     (isAwayWin ? "#4caf50" : isHomeWin ? "#f44336" : "#aaa");
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:12px;">
              <span style="opacity:.7;">${esc(hm.date?.slice(0,10) || "—")}</span>
              <span style="flex:1;text-align:center;">${esc(hm.homeTeam)} <b style="color:${col};">${hm.scoreHome}–${hm.scoreAway}</b> ${esc(hm.awayTeam)}</span>
              <span style="opacity:.5;font-size:11px;">${esc(hm.competition || "")}</span>
            </div>`;
          }).join("");
        };
        const renderSummary = (sum, home) => {
          if (!sum) return "";
          return `<div style="display:flex;gap:16px;font-size:12px;margin-bottom:8px;flex-wrap:wrap;">
            <span>${esc(home)}: <b style="color:#4caf50">${sum.wins}W</b> <b style="color:#aaa">${sum.draws}D</b> <b style="color:#f44336">${sum.losses}L</b></span>
            <span>Avg: <b>${sum.gfPerGame}–${sum.gaPerGame}</b></span>
            <span style="opacity:.6;">${sum.sample} matches</span>
          </div>`;
        };
        const tabsHtml = views.map((v, i) =>
          `<button onclick="(function(el){var p=el.closest('[data-h2h]');p.querySelectorAll('[data-h2hv]').forEach(function(x){x.style.display='none';});p.querySelectorAll('[data-h2htab]').forEach(function(x){x.style.fontWeight='600';x.style.opacity='.6';});p.querySelector('[data-h2hv=${v.key}]').style.display='block';el.style.fontWeight='900';el.style.opacity='1';})(this)"
            data-h2htab="${v.key}"
            style="padding:4px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);color:inherit;cursor:pointer;font-size:12px;font-weight:${i===0?'900':'600'};opacity:${i===0?'1':'.6'};">
            ${v.label}${v.matches?.length ? ` (${v.matches.length})` : ""}
          </button>`
        ).join("");
        const panelsHtml = views.map((v, i) =>
          `<div data-h2hv="${v.key}" style="display:${i===0?'block':'none'};">
            ${renderSummary(v.sum, homeRaw)}
            ${renderMatches(v.matches)}
          </div>`
        ).join("");
        return `
        <div data-h2h="1" style="margin-top:14px;padding:12px;border:1px solid rgba(255,255,255,0.10);border-radius:14px;background:rgba(255,255,255,0.03);">
          <div style="font-weight:900;margin-bottom:10px;">Head to Head</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">${tabsHtml}</div>
          ${panelsHtml}
        </div>`;
      })()}

      ${(() => {
        const a = snap.assessment;
        if (!a || !a.markets) return "";
        const od = k => (a.markets[k] && a.markets[k].odds) || {};
        const x = od("1X2"), ou = od("OU25"), btts = od("BTTS");
        const tags = [];
        if (a.model && a.model.formUsed) tags.push("form");
        if (a.model && a.model.xgUsed) tags.push("xG");
        const form = tags.length ? " · " + tags.join("+") + "-aware" : "";
        const d = snap.discipline || {};
        const num = v => (typeof v === "number" ? v : null);
        const yc = t => (num(d[t] && d[t].yellowPerGame) != null ? d[t].yellowPerGame.toFixed(2) : "—");
        const fl = t => (num(d[t] && d[t].foulsPerGame) != null ? d[t].foulsPerGame.toFixed(1) : "—");
        const hasDisc = (d.home && d.home.sample) || (d.away && d.away.sample);
        return `
        <div style="margin-top:14px;padding:12px;border:1px solid rgba(255,255,255,0.10);border-radius:14px;background:rgba(255,255,255,0.03);">
          <div style="font-weight:900;margin-bottom:8px;">AI MatchLab Estimate<span style="opacity:.6;font-weight:600;">${form}</span></div>
          <div>1 / X / 2: <b>${esc(x.home ?? "—")}</b> / <b>${esc(x.draw ?? "—")}</b> / <b>${esc(x.away ?? "—")}</b></div>
          ${ou.over != null ? `<div style="margin-top:6px;">O/U 2.5: <b>${esc(ou.over)}</b> / <b>${esc(ou.under)}</b></div>` : ``}
          ${btts.yes != null ? `<div style="margin-top:6px;">BTTS Yes/No: <b>${esc(btts.yes)}</b> / <b>${esc(btts.no)}</b></div>` : ``}
          ${hasDisc ? `
            <div style="margin-top:8px;font-weight:800;">Discipline (avg/game)</div>
            <div style="margin-top:4px;">${esc(home)}: YC <b>${yc("home")}</b> · Fouls <b>${fl("home")}</b></div>
            <div style="margin-top:2px;">${esc(away)}: YC <b>${yc("away")}</b> · Fouls <b>${fl("away")}</b></div>` : ``}
        </div>`;
      })()}

      ${renderPlayerUsageIntelBlock(snap)}

      ${valueHtml}

      ${
        pendingItems.length
          ? `
        <div style="margin-top:14px;padding:12px;border:1px solid rgba(255,255,255,0.10);border-radius:14px;background:rgba(255,255,255,0.03);">
          <div style="font-weight:900;margin-bottom:8px;">Pending Signals</div>
          <div class="muted">${esc(pendingItems.join(", "))}</div>
        </div>
      `
          : ``
      }
    `;

    const aiHtml = renderAiTasksBlock(snap);

    if (aiHtml) {
      const container = document.createElement("div");
      container.innerHTML = aiHtml;
      el.appendChild(container);
    }

    document.dispatchEvent(new CustomEvent("details-rendered"));

    const infoBtn = el.querySelector("#aiml-details-info-btn");
    const infoBox = el.querySelector("#aiml-details-info-box");
    if (infoBtn && infoBox) {
      infoBtn.onclick = () => {
        const isOpen = infoBox.style.display !== "none";
        infoBox.style.display = isOpen ? "none" : "block";
      };
    }

    return;
  }

  // ------------------------------------------------------------
  // LEGACY FALLBACK
  // ------------------------------------------------------------
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-end;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <div style="font-weight:900;font-size:18px;">${home} <span style="opacity:.6;">vs</span> ${away}</div>
        <button id="aiml-details-info-btn"
          title="Info"
          style="width:28px;height:28px;border-radius:999px;border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.04);color:inherit;font-weight:900;cursor:pointer;line-height:1;">
          ⓘ
        </button>
      </div>
      <div style="opacity:.85;font-weight:800;">${status}${minute}</div>
    </div>

    ${renderDetailsInfoBox()}

    <div style="margin-top:6px;opacity:.85;">
      ${score ? `<span style="font-weight:900;">${score}</span>` : ``}
      ${kickoffLocal ? `<span style="margin-left:10px;">${kickoffLocal}</span>` : ``}
    </div>

    <div style="margin-top:6px;opacity:.75;font-size:12px;">
      League: <b>${league}</b>
      ${matchId ? `<span style="margin-left:10px;opacity:.7;">ID: ${esc(matchId)}</span>` : ``}
    </div>

    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
      <button id="aiml-details-check" class="aiml-btn"
        title="Checks for new factual intel (R2)."
        style="padding:8px 10px;border-radius:12px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:inherit;font-weight:900;cursor:pointer;">
        Check Updates
      </button>
      <button id="aiml-details-refresh" class="aiml-btn"
        title="Forces recheck of enrichment sources (intel only)."
        style="padding:8px 10px;border-radius:12px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.03);color:inherit;font-weight:800;cursor:pointer;">
        Refresh Intel
      </button>
      <span id="aiml-details-meta" class="muted" style="align-self:center;font-size:12px;opacity:.8;"></span>
    </div>

    <!-- FACTS + AI BELOW -->
    <div id="aiml-below-mount">
      <div class="muted" style="margin-top:12px;">Loading…</div>
    </div>

    <div id="aiml-hybrid-mount" data-match-id="${esc(matchId)}" style="margin-top:12px;">
      ${hybridLoadingBlock()}
    </div>
  `;

  document.dispatchEvent(new CustomEvent("details-rendered"));

  // Info tooltip toggle
  const infoBtn = el.querySelector("#aiml-details-info-btn");
  const infoBox = el.querySelector("#aiml-details-info-box");
  if (infoBtn && infoBox) {
    infoBtn.onclick = () => {
      const isOpen = infoBox.style.display !== "none";
      infoBox.style.display = isOpen ? "none" : "block";
    };
  }

  const metaEl = el.querySelector("#aiml-details-meta");
  const mountHybrid = el.querySelector("#aiml-hybrid-mount");
  const mountBelow = el.querySelector("#aiml-below-mount");
  const btnCheck = el.querySelector("#aiml-details-check");
  const btnRefresh = el.querySelector("#aiml-details-refresh");

  const buildUrl = (mode) => {
    const p = new URLSearchParams();
    p.set("id", matchId);
    if (mode === "refresh") p.set("rebuild", "1");
    p.set("v", String(Date.now()));
    return `${detailsBase()}/details?${p.toString()}`;
  };

  async function run(mode) {
    if (!matchId) return;
    if (metaEl)
      metaEl.textContent =
        mode === "read"
          ? "Loading…"
          : mode === "check"
          ? "Checking updates…"
          : "Refreshing…";

    const url = buildUrl(mode);
    const res = await fetchJson(url, 9000);

    let aiIntel = null;
    let aiSignals = [];

    try {
      const intelUrl =
        `https://aimatchlab-ai-engine.pierros1402.workers.dev/ai/match-intel?id=${encodeURIComponent(matchId)}`;

      const intelRes = await fetchJson(intelUrl, 7000);

      if (intelRes.ok && intelRes.json?.ok) {
        aiIntel = intelRes.json;
      }

      const sigUrl =
        `https://aimatchlab-ai-engine.pierros1402.workers.dev/ai/intel-signals?id=${encodeURIComponent(matchId)}`;

      const sigRes = await fetchJson(sigUrl, 7000);

      if (sigRes.ok && Array.isArray(sigRes.json?.signals)) {
        aiSignals = sigRes.json.signals;
      }
    } catch (_) {}

    if (!res.ok || !res.json || res.json.ok === false) {
      if (mountBelow) mountBelow.innerHTML = `<div class="muted">Facts unavailable.</div>`;
      if (mountHybrid) mountHybrid.innerHTML = `<div class="muted">Hybrid unavailable.</div>`;
      if (metaEl) metaEl.textContent = "Failed.";
      return;
    }

    const factsHtml = renderFactsBlock(res.json);
    const stdqHtml = renderStandardQuestionsFromDetailsAPI(res.json);

    const runtimeHtml = renderRuntimeIntel(aiIntel, aiSignals);
    applySignalBarMutation(aiSignals);

    if (mountBelow)
      mountBelow.innerHTML =
        factsHtml +
        runtimeHtml +
        renderAIDivider() +
        stdqHtml;

    startIntelWatcher(detailsMatchId || matchId, () => {
      run("read").then(() => {
        requestAnimationFrame(() => {
          document
            .querySelectorAll(".aiml-bar-fill")
            .forEach(el2 => {
              const newWidth = el2.style.width;
              const prevWidth = el2.dataset.prevWidth;

              el2.style.willChange = "width";

              if (prevWidth && prevWidth !== newWidth) {
                el2.classList.remove("aiml-bar-flash");
                void el2.offsetWidth;
                el2.classList.add("aiml-bar-flash");
              }

              el2.dataset.prevWidth = newWidth;
            });
        });
      }).catch(() => {});
    });

    if (mountHybrid) mountHybrid.innerHTML = renderHybridFromDetailsAPI(res.json);

    const meta = res.json.meta || {};
    const cache = res.json.cache || "";
    const changed = meta.changed ? "changed" : "no-change";
    const nextAt = meta.nextCheckAt ? `next: ${meta.nextCheckAt}` : "";
    const lastAt = meta.lastCheckedAt ? `last: ${meta.lastCheckedAt}` : "";
    const skip = meta.checkStatus === "SKIPPED_COOLDOWN" ? " (cooldown)" : "";
    if (metaEl)
      metaEl.textContent = `${cache} • ${changed}${skip} • ${lastAt}${
        nextAt ? " • " + nextAt : ""
      }`;
  }

  run("read").catch(() => {});
  if (btnCheck) btnCheck.onclick = () => run("check").catch(() => {});
  if (btnRefresh) btnRefresh.onclick = () => run("refresh").catch(() => {});
}

  async function loadAndRender(match, mountEl, opts) {
    const el = mountEl;
    if (!el) return;

    const m = match || {};
    const league = String(m.leagueSlug || m.league || m.league_code || "").trim();
    const eventId = String(m.id || m.eventId || m.event || "").trim();

    if (!base()) {
      el.innerHTML = `<div class="muted">Missing fixturesBase/liveUltraBase.</div>`;
      return;
    }
    if (!league || !eventId) {
      el.innerHTML = `<div class="muted">Missing leagueSlug or event id.</div>`;
      return;
    }

    const summaryUrl = `${base()}/match-summary?league=${encodeURIComponent(
      league
    )}&event=${encodeURIComponent(eventId)}&v=${Date.now()}`;
    const standingsUrl = `${base()}/standings?league=${encodeURIComponent(
      league
    )}&v=${Date.now()}`;

    const sRes = await fetchJson(summaryUrl, 10000);
    const sOk = !!(sRes.ok && sRes.json && sRes.json.ok !== false);
    const summary = normalizeSummary(sRes.json, m);

    let standingsPayload = null;
    let fromCache = false;

    const cached = readStandingsCache(league);
    if (cached && !opts?.forceReload) {
      standingsPayload = cached;
      fromCache = true;
    }

    if (!standingsPayload || opts?.forceReload) {
      const tRes = await fetchJson(standingsUrl, 10000);
      if (tRes.ok && tRes.json && tRes.json.ok !== false) {
        standingsPayload = tRes.json;
        fromCache = false;
        writeStandingsCache(league, tRes.json);
      } else if (!standingsPayload && cached) {
        standingsPayload = cached;
        fromCache = true;
      }
    }

    const standingsTable =
      standingsPayload?.table ||
      standingsPayload?.standings ||
      standingsPayload?.items ||
      standingsPayload?.data ||
      null;

    const header = `
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-end;flex-wrap:wrap;">
        <div style="font-weight:900;font-size:18px;">${esc(summary.home)} <span style="opacity:.6;">vs</span> ${esc(summary.away)}</div>
        <div style="opacity:.85;font-weight:800;">${esc(summary.status || "")}</div>
      </div>
      <div style="margin-top:6px;opacity:.85;">
        ${summary.score ? `<span style="font-weight:900;">${esc(summary.score)}</span>` : ``}
        ${summary.venue ? `<span style="margin-left:10px;">${esc(summary.venue)}</span>` : ``}
      </div>
      <div style="margin-top:6px;opacity:.75;font-size:12px;">
        League: <b>${esc(m.leagueName || league)}</b>
        ${fromCache ? `<span style="margin-left:10px;opacity:.75;">(standings from cache)</span>` : ``}
      </div>
    `;

    const summaryBlock = sOk
      ? section("Key Stats (Last 8–10, Home/Away)", renderStatsBlock(summary.stats))
      : `<div class="muted">Summary unavailable.</div>`;

    const standingsBlock = section("Standings", renderStandingsTable(standingsTable));

    el.innerHTML = `
      ${header}
      ${summaryBlock}
      ${standingsBlock}
    `;
  }
// =====================================================
  // EVENT BINDING: Today/Active panels emit("details-open", matchObj)
  // This connects that event to DetailsPanel.renderLocal(...)
  // =====================================================
  (function bindDetailsOpenEvent() {
    try {
      const onFn = window.on;
      if (typeof onFn !== "function") return;

      function findDetailsMount() {
        // 1) explicit global override (optional)
        const overrideId = window.AIML_DETAILS_MOUNT_ID;
        if (overrideId) {
          const el = document.getElementById(String(overrideId));
          if (el) return el;
        }

        // 2) common panel containers
        const selectors = [
          "#panel-matches .panel-body",
          "#panel-matches",
          "#matches-panel .panel-body",
          "#matches-panel",
          "#panel-details .panel-body",
          "#panel-details",
          "#details-panel .panel-body",
          "#details-panel",
          "#aiml-details-panel",
          "#match-details",
          "#match-details-panel",
          "#details-mount",
        ];

        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) return el;
        }

        // 3) fallback: try the last opened "panel-body" inside a visible panel
        const bodies = Array.from(document.querySelectorAll(".panel .panel-body, .panel-body"));
        for (const el of bodies) {
          const style = window.getComputedStyle(el);
          if (style && style.display !== "none" && style.visibility !== "hidden") return el;
        }
        return null;
      }

      function safeRender(matchObj, mountEl) {
        const mnt = mountEl || findDetailsMount();
        if (!mnt) {
          console.warn("[details] details-open received but mount not found");
          return;
        }
        if (window.DetailsPanel && typeof window.DetailsPanel.renderLocal === "function") {
          window.DetailsPanel.renderLocal(matchObj, mnt);
        }
      }

      onFn("details-open", (matchObj) => {
        safeRender(matchObj, null);
      });

      // Optional: allow external components to force mount rendering
      onFn("details-open:mount", (payload) => {
        if (!payload) return;
        safeRender(payload.match || payload.m || payload, payload.mountEl || payload.el || null);
      });

    } catch (e) {
      console.warn("[details] bind details-open failed", e);
    }
    })(); 
  

    // =====================================================
// AI STRUCTURAL METRICS BLOCK
// =====================================================
function renderAIStructuralBlock(payload) {

  const ai = payload?.fullAiProfile || payload?.aiProfile || null;
  if (!ai) return "";

  const state = ai.state || {};
  const consistency = ai.consistency || {};
  const risk = ai.risk || {};

  function pct(v) {
    if (v == null || isNaN(v)) return "–";
    return (Math.max(0, Math.min(1, v)) * 100).toFixed(0) + "%";
  }

  function bar(label, value) {
    const w = Math.max(0, Math.min(100, (value || 0) * 100));

    return `
      <div style="margin-top:6px;position:relative;">
        <div style="font-size:12px;opacity:.8;">${label}</div>

        <div style="height:6px;background:rgba(255,255,255,.08);border-radius:6px;overflow:hidden;">
      <div class="aiml-bar-fill"
           data-metric="${label}"
           style="width:${w}%;height:100%;background:rgba(0,200,255,.6);">
       </div>
     </div>

     <div style="font-size:11px;opacity:.7;margin-top:2px;">
       ${pct(value)}
     </div>
   </div>
 `;
  }

  return `
    <div style="margin-top:18px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.08);">
      <div style="font-weight:900;margin-bottom:8px;">AI Structural Metrics</div>

      ${bar("Tempo Index", (state.tempoIndex || 0) / 100)}
      ${bar("Defensive Stability", consistency.defensiveStabilityIndex)}
      ${bar("Scoring Reliability", consistency.scoringReliabilityIndex)}
      ${bar("Form Momentum", consistency.formMomentumIndex)}
      ${bar("Regime Shift Risk", risk.regimeShiftRisk)}
      ${bar("Comeback Probability", risk.comebackProbability)}
      ${bar("Volatility Index", risk.volatilityIndex)}
      ${bar("Confidence", ai.confidence)}
    </div>
  `;
}

// ------------------------------------------------------------
// SIGNAL PRIORITY MODEL
// ------------------------------------------------------------
const __aimlSignalPriority = {
  VOLATILITY_SPIKE: 4,
  CONFIDENCE_DROP: 3,
  CONTROL_CHANGE: 2,
  MOMENTUM_SHIFT: 1
};

const __aimlSignalStack = {};

function pickDominantSignal(signals) {

  if (!Array.isArray(signals) || !signals.length) return null;

  let best = null;
  let bestScore = -1;

  signals.slice(-5).forEach(sig => {

    const score = __aimlSignalPriority[sig.type] || 0;

    if (score > bestScore) {
      bestScore = score;
      best = sig;
    }

  });

  return best;
}

// ------------------------------------------------------------
// SIGNAL → BAR COLOR MUTATION
// ------------------------------------------------------------
function applySignalBarMutation(signals) {

  if (!Array.isArray(signals) || !signals.length) return;

  const map = {
    MOMENTUM_SHIFT: "Form Momentum",
    CONTROL_CHANGE: "Tempo Index",
    VOLATILITY_SPIKE: "Volatility Index",
    CONFIDENCE_DROP: "Confidence"
  };

  const colorMap = {
    MOMENTUM_SHIFT: "rgba(255,140,0,.8)",
    CONTROL_CHANGE: "rgba(160,120,255,.8)",
    VOLATILITY_SPIKE: "rgba(255,70,70,.85)",
    CONFIDENCE_DROP: "rgba(255,220,0,.85)"
  };
const dominant = pickDominantSignal(signals);
  signals.slice(-3).forEach(sig => {

    const metric = map[sig.type];
    if (!metric) return;

  const bar = document.querySelector(
    `.aiml-bar-fill[data-metric="${metric}"]`
  );

  if (!bar) return;

  // ---------------------------
  // STACK COUNT
  // ---------------------------
  __aimlSignalStack[metric] =
    (__aimlSignalStack[metric] || 0) + 1;

  const count = __aimlSignalStack[metric];

  // color mutation
  const originalColor = "rgba(0,200,255,.6)";
  bar.style.background = colorMap[sig.type];

  clearTimeout(bar.__aimlDecayTimer);

  bar.__aimlDecayTimer = setTimeout(() => {
    bar.style.background = originalColor;
    __aimlSignalStack[metric] = 0;

    const badge = bar.parentElement.querySelector(".aiml-bar-stack");
    if (badge) badge.remove();
  }, 2500);

  // ---------------------------
  // STACK BADGE
  // ---------------------------
  let badge =
    bar.parentElement.querySelector(".aiml-bar-stack");

  if (!badge) {
    badge = document.createElement("div");
    badge.className = "aiml-bar-stack";
    bar.parentElement.appendChild(badge);
  }

  badge.textContent = "×" + count;

  // flash
  bar.classList.remove("aiml-bar-flash");
  void bar.offsetWidth;
  bar.classList.add("aiml-bar-flash");
// ---------------------------
// PRIORITY GLOW
// ---------------------------
if (dominant && dominant.type === sig.type) {
  bar.style.boxShadow = "0 0 14px rgba(255,255,255,.55)";
} else {
  bar.style.boxShadow = "none";
}
});
}

// -----------------------------------------------------
// DETAILS PANEL EXPORT
// -----------------------------------------------------
window.DetailsPanel = {
  __ver: VER,
  loadAndRender,
  renderLocal,
};

})();
