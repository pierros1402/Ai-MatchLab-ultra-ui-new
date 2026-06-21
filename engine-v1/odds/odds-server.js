/**
 * odds-server.js
 *
 * Lightweight standalone HTTP server that exposes ONLY the autonomous odds
 * (real bookmaker market line + our AI assessment) to the UI — decoupled from the
 * heavy main engine. Reads odds memory written by run-odds-opening / run-day.
 *
 *   GET /api/odds?matchId=ID&market=1X2   per-match snapshot (open/current/delta)
 *   GET /odds        (alias of /api/odds)
 *   GET /odds/day?date=YYYY-MM-DD          whole-day picture
 *   GET /health
 *
 * Usage: node engine-v1/odds/odds-server.js        (PORT env, default 3020)
 */

import express from "express";
import { athensDayKey } from "../core/daykey.js";
import { getDeployedOddsSnapshot, getDeployedOddsDay } from "../storage/odds-memory-db.js";

const app = express();
const PORT = process.env.ODDS_PORT || 3020;

app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Cache-Control", "no-store");
  next();
});

function oddsHandler(req, res) {
  const matchId = String(req.query.matchId || req.query.id || "");
  const market = String(req.query.market || "1X2");
  const date = String(req.query.date || athensDayKey());
  if (!matchId) return res.status(400).json({ ok: false, error: "missing_matchId" });
  res.json(getDeployedOddsSnapshot(matchId, market, date));
}

app.get("/odds", oddsHandler);
app.get("/api/odds", oddsHandler);
app.get("/odds/day", (req, res) => res.json(getDeployedOddsDay(String(req.query.date || athensDayKey()))));
app.get("/health", (_req, res) => res.json({ ok: true, service: "odds-server", today: athensDayKey() }));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[odds-server] listening on ${PORT}`);
});
