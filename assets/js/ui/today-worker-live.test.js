import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./today-panel.js", import.meta.url), "utf8");
const start = source.indexOf("  function mergeTodayWorkerObservation(");
const end = source.indexOf("  function render(matches, dateYmd) {", start);
assert.ok(start > 0 && end > start);
const merge = vm.runInNewContext(source.slice(start,end) + "\nmergeTodayWorkerObservation", {
  todayISO: () => "2026-11-13",
  isStaleLiveMatch: m => m.staleLive === true || m.status === "STALE_LIVE",
  isFinalMatch: m => m.status === "FT" || m.status === "STATUS_FINAL",
  isMatchLive: m => m.status === "LIVE"
});

const id = "cid_svn2_triglav_bilje_20261113";
const pre = () => [{id,status:"STATUS_SCHEDULED",home:"Triglav",away:"Bilje",scoreHome:null,scoreAway:null}];
const worker = (changes={}) => ({date:"2026-11-13",matches:[{canonicalId:id,matchId:id,status:"LIVE",live:true,isLive:true,scoreHome:1,scoreAway:0,minute:null,...changes}]});

test("live worker state survives a later scheduled Today snapshot", () => {
  const result=merge(pre(),worker(),"2026-11-13");
  assert.equal(result[0].status,"LIVE");
  assert.equal(result[0].scoreHome,1);
  assert.equal(result[0].scoreAway,0);
  assert.equal(result[0].minute,null);
});
test("historical day and unverified worker state cannot overwrite snapshot", () => {
  assert.equal(merge(pre(),worker(),"2026-11-12")[0].status,"STATUS_SCHEDULED");
  assert.equal(merge(pre(),worker({statusUnconfirmed:true}),"2026-11-13")[0].status,"STATUS_SCHEDULED");
  assert.equal(merge(pre(),worker({staleLive:true}),"2026-11-13")[0].status,"STATUS_SCHEDULED");
});
test("canonical identity and uniqueness are mandatory", () => {
  assert.equal(merge(pre(),{date:"2026-11-13",matches:[{...worker().matches[0],canonicalId:"cid_other"}]},"2026-11-13")[0].status,"STATUS_SCHEDULED");
  const duplicate={date:"2026-11-13",matches:[worker().matches[0],worker().matches[0]]};
  assert.equal(merge(pre(),duplicate,"2026-11-13")[0].status,"STATUS_SCHEDULED");
});
test("confirmed FT remains terminal and Today shows explicit LIVE badge", () => {
  const terminal=[{...pre()[0],status:"FT"}];
  assert.equal(merge(terminal,worker(),"2026-11-13")[0].status,"FT");
  assert.match(source, /info\.textContent = \(min \? "LIVE " \+ min : "LIVE"\)/);
  assert.match(source, /window\.__AIML_LAST_LIVE/);
  assert.doesNotMatch(source.slice(start,end), /Date\.now\(\).*minute|kickoff.*minute/);
});
