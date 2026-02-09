import { handleValue } from "./modules/valueEngine.js";
import { handleDetails } from "./modules/detailsEngine.js";
import { handleRadar } from "./modules/radarEngine.js";
import { handleLive } from "./modules/liveEngine.js";
import { handleOdds } from "./modules/oddsEngine.js";

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const { pathname } = url;

    try {

      // ================= LIVE =================
      // Backward compatibility (old standalone worker route)
      if (pathname === "/api/unified-live") {
        return handleLive(req, env);
      }

      // Optional alias
      if (pathname.startsWith("/api/live")) {
        return handleLive(req, env);
      }

      // ================= ODDS =================
      // Must be BEFORE generic /api routes
      if (pathname.startsWith("/api/odds")) {
        return handleOdds(req, env);
      }

      // ================= VALUE =================
      if (pathname.startsWith("/api/value")) {
        return handleValue(req, env);
      }

      // ================= DETAILS =================
      if (pathname.startsWith("/api/details")) {
        return handleDetails(req, env);
      }

      // ================= RADAR =================
      if (pathname.startsWith("/api/radar")) {
        return handleRadar(req, env);
      }

      return json({ ok: false, error: "Not found" }, 404);

    } catch (e) {
      return json({ ok: false, error: e?.message || "Internal error" }, 500);
    }
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
