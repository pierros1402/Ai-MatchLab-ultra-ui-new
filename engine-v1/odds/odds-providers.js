/**
 * odds-providers.js
 *
 * Resilience layer for odds: instead of depending on ONE site (which could block
 * us and "throw us out"), odds are gathered through a registry of providers tried
 * in priority order. Each price is tagged with the provider it came from, and per
 * run we log provider health so a degrading source is visible and easy to swap.
 *
 * Adding a provider = push `{ name, priority, fetch }` here; fetch() returns
 * rows shaped `{ home, away, odds:{home,draw,away}, oddsMax?, book }`.
 *
 * Today only BetExplorer is wired (proven static-HTML source). The framework is
 * deliberately multi-source so further providers (other aggregators, per-book
 * pages) drop in without touching callers.
 */

import { fetchMarketOdds as fetchBetExplorer } from "./betexplorer-odds-source.js";

const PROVIDERS = [
  {
    name: "betexplorer",
    priority: 1,
    book: "BetExplorer (avg)",
    async fetch() {
      const res = await fetchBetExplorer();
      return {
        ok: res.ok,
        rows: res.rows.map(r => ({ ...r, book: "BetExplorer (avg)", provider: "betexplorer" })),
        attempts: res.attempts
      };
    }
  }
  // Add more providers here (each gets tried as fallback / supplement).
];

/**
 * Gather odds from all providers in priority order. Rows from higher-priority
 * providers win on conflict (keyed by normalized home|away). Returns the merged
 * rows plus a per-provider health report.
 */
export async function fetchOddsResilient(options = {}) {
  const normKey = (h, a) =>
    `${String(h).toLowerCase().trim()}|${String(a).toLowerCase().trim()}`;

  const providers = [...(options.providers || PROVIDERS)].sort((a, b) => a.priority - b.priority);
  const merged = new Map();
  const health = [];

  for (const p of providers) {
    let result;
    try {
      result = await p.fetch();
    } catch (err) {
      health.push({ provider: p.name, ok: false, rows: 0, error: String(err?.message || err) });
      continue;
    }

    const rows = Array.isArray(result?.rows) ? result.rows : [];
    health.push({ provider: p.name, ok: !!result?.ok, rows: rows.length });

    for (const row of rows) {
      const key = normKey(row.home, row.away);
      if (!merged.has(key)) merged.set(key, row); // first (highest priority) wins
    }
  }

  return {
    ok: merged.size > 0,
    rows: [...merged.values()],
    providers: health,
    providerCount: providers.length
  };
}

export function listOddsProviders() {
  return PROVIDERS.map(p => ({ name: p.name, priority: p.priority, book: p.book }));
}
