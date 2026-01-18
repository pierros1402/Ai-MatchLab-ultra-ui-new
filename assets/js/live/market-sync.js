// ======================================================================
// MARKET SYNC — AI MATCHLAB ULTRA
// Consensus Odds • True Price • Market Pressure • Deviation
// ======================================================================

let MARKET = null;

on("odds-processed", unified => {
  MARKET = syncMarket(unified);
  emit("market-sync-update", MARKET);
});


function syncMarket(odds) {
  const groups = { home: [], draw: [], away: [] };

  Object.values(odds).forEach(l => {
    if (l.home) groups.home.push(l.home);
    if (l.draw) groups.draw.push(l.draw);
    if (l.away) groups.away.push(l.away);
  });

  const homeC = consensus(groups.home);
  const drawC = consensus(groups.draw);
  const awayC = consensus(groups.away);

  return {
    consensus: { home: homeC, draw: drawC, away: awayC },
    implied: impliedFromConsensus(homeC, drawC, awayC),
    mpi: computeMPI(odds, { home: homeC, draw: drawC, away: awayC }),
    deviation: deviationScores(odds, { home: homeC, draw: drawC, away: awayC })
  };
}


// -----------------------
// Consensus logic
// -----------------------
function consensus(arr) {
  if (!arr.length) return null;

  const sorted = arr.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const cut = Math.max(1, Math.floor(sorted.length * 0.2));
  const trimmed = sorted.slice(cut, sorted.length - cut);
  const mean = trimmed.reduce((s, v) => s + v, 0) / trimmed.length;

  return median * 0.4 + mean * 0.6;
}


function impliedFromConsensus(h, d, a) {
  if (!h || !d || !a) return {};
  const ih = 1 / h, id = 1 / d, ia = 1 / a;
  const sum = ih + id + ia;
  return { home: ih / sum, draw: id / sum, away: ia / sum };
}


function computeMPI(odds, cons) {
  let total = 0, count = 0;

  Object.values(odds).forEach(l => {
    ["home", "draw", "away"].forEach(sel => {
      if (!l[sel] || !cons[sel]) return;
      const dev = (cons[sel] - l[sel]) / cons[sel];
      total += dev;
      count++;
    });
  });

  return Math.max(-100, Math.min(100, Math.round((total / count) * 300)));
}


function deviationScores(odds, cons) {
  const out = {};
  Object.entries(odds).forEach(([book, l]) => {
    out[book] = {};
    ["home", "draw", "away"].forEach(sel => {
      if (!l[sel] || !cons[sel]) out[book][sel] = null;
      else out[book][sel] = Math.round(((l[sel] - cons[sel]) / cons[sel]) * 100);
    });
  });
  return out;
}
