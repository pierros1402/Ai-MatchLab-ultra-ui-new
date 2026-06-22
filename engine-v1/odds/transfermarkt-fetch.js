/**
 * transfermarkt-fetch.js
 *
 * Single entry for fetching Transfermarkt pages. Direct from a residential IP
 * (local dev), but THROUGH the Cloudflare tm-proxy worker when TM_PROXY_URL is set
 * (the GitHub Actions runner is IP-blocked by TM; the worker's egress is not).
 */

const TM_BASE = "https://www.transfermarkt.com";

const HEADERS = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  "accept": "text/html,application/xhtml+xml",
  "accept-language": "en-US,en;q=0.9"
};

/**
 * Fetch a Transfermarkt path (e.g. "/x/spieltag/wettbewerb/BRA1").
 * @returns {Promise<Response>} the raw response (status reflects TM's).
 */
export function tmFetch(path) {
  const proxy = (process.env.TM_PROXY_URL || "").replace(/\/$/, "");
  const url = proxy
    ? `${proxy}/?path=${encodeURIComponent(path)}`
    : TM_BASE + path;
  return fetch(url, { headers: HEADERS });
}
