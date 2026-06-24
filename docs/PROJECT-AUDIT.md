# Project Audit — AI-MatchLab ULTRA
_Σχολαστικός έλεγχος: ασυνάφειες, ελλείψεις, μη-επικοινωνίες, περιττά + αξιολόγηση αυτονομίας._
_Ημερομηνία: 2026-06-24. Read-only audit — τίποτα δεν διορθώθηκε, μόνο καταγραφή._

## 0. Ετυμηγορία αυτονομίας (TL;DR)
Ο **αυτόνομος μηχανισμός ΛΕΙΤΟΥΡΓΕΙ** end-to-end για τα δικά μας δεδομένα: `daily-autonomous.yml` (02:00) → `run-day` (awareness → results → discipline → settle → lineups → [εβδομαδιαία referee/geo/aliases] → fixtures snapshot → odds+assessment → coverage) → commit → **Render deploy hook** → σερβίρεται. Επιβεβαιωμένο live (referee via TM-proxy = 65 λίγκες, hook fired).

**ΑΛΛΑ** συνυπάρχει με ένα **δεύτερο (canonical/ESPN) pipeline** + υπάρχει **τεράστιο dead code** + **ασυνέπεια στο team-name normalization** που υπονομεύει το matching. Λεπτομέρειες παρακάτω.

---

## 1. ΠΕΡΙΤΤΑ (redundant / dead)

### 1.1 🔴 881 orphaned `*-file.js` diagnostic jobs — ΚΡΙΣΙΜΟ όγκου
`engine-v1/jobs/` έχει **1000 αρχεία**, εκ των οποίων **881 είναι one-off `*-file.js`** (football-truth: `apply-*/audit-*/build-*-file.js`). Δείγμα: 0 references σε workflows/run-day/index/scheduler → **dead code**. Φουσκώνει repo + σύγχυση. → Πρόταση: μετακίνηση σε `engine-v1/jobs/_archive/` ή διαγραφή (αφού δεν τα καλεί τίποτα).

### 1.2 🟠 Δύο pipelines που επικαλύπτονται
- **Autonomous** (δικό μας): `daily-autonomous.yml` → flashscore fixtures + δικό μας assessment (ids `fs_*`).
- **Canonical** (ESPN, πλατφόρμας): `daily-deploy-snapshot.yml` + `intraday-deploy-snapshot-refresh.yml` + `odds-refresh.yml` → ESPN fixture acquisition + canonical store + value engine + rich details snapshots (ids τύπου `763143`).
Παράγουν **διπλά δεδομένα για τους ΙΔΙΟΥΣ αγώνες** (διαφορετικά id spaces) → πηγή του id-mismatch (763143 vs fs_). Συζήτηση: κρατάμε και τα δύο (canonical=rich details/value, autonomous=κάλυψη) ή ενοποιούμε;

### 1.3 🟡 `scheduler-service.js` — δεν ξεκινά
Δεν καλείται από `index.js` (κανένα setInterval/startScheduler). Όλη η αλυσίδα του (ingest/finalize/monitor/discover/buildStandingsDay) είναι ανενεργή στον engine — το canonical τρέχει μέσω workflows, όχι του scheduler. → Νεκρό αρχείο (ή να αφαιρεθεί η σύγχυση).

### 1.4 🟡 `AI-MATCHLAB-DATA/` — πιθανό legacy static layer
Ξεχωριστός φάκελος (africa/asia/europe/history/indexes/leagues_lookup + `_cloudflare_index.html` + `data-loader.js`). Μοιάζει με παλιό στατικό data layer. Να επιβεβαιωθεί αν χρησιμοποιείται ακόμα από το UI ή είναι legacy.

### 1.5 🟢 Ήδη καθαρισμένα
`football-truth/_diagnostics` (2.9G) — δεν είναι στο main ✅. `data/_legacy` — διαγράφηκε τοπικά. Disabled-league data — purged ✅.

---

## 2. ΑΣΥΝΑΦΕΙΕΣ (inconsistencies)

### 2.1 🔴 `normalizeTeam` re-implemented σε 10+ αρχεία — ΚΡΙΣΙΜΟ matching
Διαφορετικές υλοποιήσεις normalize σε: `core/normalize.js`, `core/competition-context.js`, `core/history-layer.js`, `value-engine-v1.js`, `build-details-day.js`, `team-aliases-db.js`, `run-odds-opening.js`, `api/details.js` (normName), `flashscore-league-map.js`, `discipline/referee/odds-memory` (normTeamKey), τα νέα `espn-match-source.js`/`build-team-geo-sparql.js`/`build-team-aliases-sparql.js` — ο καθένας με δικό του strip-list. **Η ίδια ομάδα κανονικοποιείται διαφορετικά → matching αποτυγχάνει μεταξύ components** (ρίζα της thin κάλυψης σε referee-linking/ESPN/odds). → Πρόταση: ΕΝΑ shared normalize (`core/normalize.js`) παντού.

### 2.2 🟠 Δύο id systems (canonical `763143` vs `fs_*`)
Ο ίδιος αγώνας έχει δύο ids. Γεφυρώνεται στο `/details` με match-by-teams (`findOddsByTeams`) — λειτουργεί αλλά εύθραυστο (εξαρτάται από το normalize της §2.1). Ίδιο θέμα στα fixtures (`mergeFlashscoreFixtures`).

### 2.3 🟡 Διπλό haversine + travel logic
`core/travel-context.js` + `build-details-day.js` έχουν ξεχωριστά `haversineKm`. Ασυνέπεια αν αλλάξει το ένα.

---

## 3. ΜΗ-ΕΠΙΚΟΙΝΩΝΙΕΣ (data produced but not consumed / bridges missing)

### 3.1 🟠 Value engine ΔΕΝ τρέχει στους δικούς μας αγώνες
Το platform value-engine (value picks) τρέχει μόνο στα **canonical** fixtures. Οι `fs_*` αγώνες μας παίρνουν **μόνο τη δική μας assessment** (Estimate box), όχι value picks. Τα δύο συστήματα δεν γεφυρώνονται για value. → Συζήτηση: γέφυρα fs_→canonical, ή το assessment μας ΕΙΝΑΙ το value για τους δικούς μας;

### 3.2 🟡 Discipline/lineups: thin κάλυψη εξαρτάται από df_st/df_li
Συλλέγονται σωστά αλλά μόνο όπου το flashscore έχει πλήρη stats (μεγάλες λίγκες). Αυτο-συμπληρώνεται, όχι bug — αλλά να είναι ξεκάθαρο.

### 3.3 🟡 Manual dependencies στον αυτοματισμό
- **CF workers** (`live-worker`, `tm-proxy`) → deploy χειροκίνητα (wrangler). Αν αλλάξουν, θες manual redeploy.
- **Secrets** (`RENDER_DEPLOY_HOOK`, `TM_PROXY_URL`) → set χειροκίνητα μία φορά (έγινε).
- **Engine redeploy** → αυτόματο μέσω hook στο daily run· για άμεσα ενδιάμεσα, manual.

---

## 4. ΕΛΛΕΙΨΕΙΣ (gaps)

- **Κύπελλα (εγχώρια):** cross-league attribution υπάρχει (UEFA qualifiers) αλλά τα domestic cups δεν ανιχνεύονται ξεχωριστά — θα δούλευαν με τον ίδιο μηχανισμό αν ανιχνεύονταν.
- **Διεθνείς εθνικές (WC):** χωρίς assessment (εθνικές, αδύναμο statistically) — γνωστό.
- **Travel:** ~2136/3152 ομάδες με geo· οι υπόλοιπες χωρίς Wikidata match.
- **Referee/aliases κάλυψη:** TM 65 λίγκες· aliases 210 ομάδες (exact-match, συντηρητικό).
- **History:** 331 λίγκες· long-tail χωρίς πηγή = honest ceiling.
- **Σταθερότητα history researcher:** crash-άρει σε μεγάλα batches (χρειάστηκαν πολλά resumable passes) — να γίνει πιο ανθεκτικό (timeout/skip needs_review).

---

## 5. ΣΥΣΤΑΣΕΙΣ (κατά προτεραιότητα)

1. **🔴 Ενοποίηση `normalizeTeam`** → `core/normalize.js` παντού. Μεγαλύτερο functional κέρδος (matching/κάλυψη).
2. **🔴 Αρχειοθέτηση των 881 `*-file.js`** (+ `scheduler-service` αν dead) → καθαρό repo.
3. **🟠 Απόφαση για τα δύο pipelines** — canonical vs autonomous: συγχώνευση id/fixtures ή σαφής διαχωρισμός ρόλων.
4. **🟠 Γέφυρα value** για τους fs_ αγώνες (ή ξεκαθάρισμα ότι assessment = value μας).
5. **🟡 Επιβεβαίωση/αφαίρεση `AI-MATCHLAB-DATA/`** (legacy;).
6. **🟡 Ανθεκτικότητα history researcher** (timeouts, skip needs_review).
7. **🟢 Documentation** ενός «autonomous flow» diagram ώστε να είναι ξεκάθαρο τι τρέχει πού.

## 6. Τι ΔΟΥΛΕΥΕΙ καλά (να μην πειραχτεί)
Autonomous run-day chain, auto-deploy hook, TM-proxy (cloud), assessment+form+xG, details enrichment (competition/table/motivation/form/summary/AI-tasks), ESPN cascade, disabled-exclusion, bulk-SPARQL (geo+aliases), append-only memory stores.
