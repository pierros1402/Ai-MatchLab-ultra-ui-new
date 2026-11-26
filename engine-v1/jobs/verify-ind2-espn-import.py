"""Fail-closed verifier for the immutable ESPN ind.2 recovery evidence."""
import argparse
import datetime as dt
import hashlib
import json
import pathlib
import re
import zipfile

ZIP_SHA = "44ac75bbe2ef7f06480f3066a8eacc395b5e276a9c9650b2bd558ec9a0e4186c"
ROOT = pathlib.Path("data/source-bound-history/ind.2")
MEMORY = pathlib.Path("data/league-memory/results/ind.2.json")

def require(condition, reason):
    if not condition:
        raise ValueError(reason)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def numeric(value):
    return isinstance(value, str) and re.fullmatch(r"[1-9][0-9]*", value)

def verify(archive):
    require(digest(archive.read_bytes()) == ZIP_SHA, "ARTIFACT_SHA_MISMATCH")
    with zipfile.ZipFile(archive) as z:
        names = z.namelist()
        expected_days = {(dt.date(2026, 11, 25)-dt.timedelta(days=i)).isoformat() for i in range(180)}
        expected = {d+".json" for d in expected_days} | {"report.json","memory-proposal.json","source-bound-history.json","form-samples.json"}
        require(len(names)==len(expected) and set(names)==expected and z.testzip() is None, "ZIP_MEMBER_SET")
        def load(n):
            return json.loads(z.read(n))
        report, history, memory = (load(n) for n in ("report.json","source-bound-history.json","memory-proposal.json"))
        require(report["productionWrites"]==0 and report["fullCoverageCertified"] is False and report["errors"]==[], "REPORT_SCOPE")
        require(history["slug"]=="ind.2" and history["provider"]=="espn" and history["leagueId"]=="18505" and history["fullCoverageCertified"] is False, "LEAGUE_SCOPE")
        days = report["days"]
        require(len(days)==180 and {d["day"] for d in days}==expected_days, "CAPTURE_DAYS")
        facts, names_by_id, ids_by_name = {}, {}, {}
        for d in days:
            day=d["day"]
            raw=z.read(day+".json")
            url="https://site.api.espn.com/apis/site/v2/sports/soccer/ind.2/scoreboard?dates="+day.replace("-","")
            require(d["sha256"]==digest(raw) and d["url"]==url, "DAY_SOURCE_BINDING")
            data=json.loads(raw)
            require(any(l.get("slug")=="ind.2" and str(l.get("id"))=="18505" for l in data["leagues"]), "RAW_LEAGUE")
            require(d["eventCount"]==len(data["events"]), "EVENT_COUNT")
            for e in data["events"]:
                c=e["competitions"][0]
                st=e["status"]["type"]
                cs=c["status"]["type"]
                if not (st.get("name")=="STATUS_FULL_TIME" and st.get("completed") is True and st.get("state")=="post" and cs.get("name")=="STATUS_FULL_TIME" and cs.get("completed") is True):
                    continue
                require(len(c["competitors"])==2, "COMPETITOR_COUNT")
                sides={x["homeAway"]:x for x in c["competitors"]}
                require(set(sides)=={"home","away"}, "SIDES")
                h,a=sides["home"],sides["away"]
                require(numeric(e["id"]) and numeric(h["team"]["id"]) and numeric(a["team"]["id"]) and h["team"]["id"]!=a["team"]["id"], "PROVIDER_IDS")
                require(all(isinstance(x["score"],str) and re.fullmatch(r"[0-9]+",x["score"]) for x in (h,a)), "SCORES")
                kickoff=dt.datetime.fromisoformat(e["date"].replace("Z","+00:00"))
                require(kickoff.tzinfo is not None and kickoff < dt.datetime(2026,11,26,tzinfo=dt.timezone.utc), "KICKOFF")
                f={"id":e["id"],"kickoff":e["date"],"home":h["team"]["displayName"],"away":a["team"]["displayName"],"homeId":h["team"]["id"],"awayId":a["team"]["id"],"gf":int(h["score"]),"ga":int(a["score"])}
                for side in ("home","away"):
                    name,tid=f[side],f[side+"Id"]
                    require(isinstance(name,str) and name.strip()==name and bool(name) and not re.search(r"\b(?:academy|u[ -]?\d{2}|youth)\b",name,re.I), "TEAM_SCOPE")
                    require(names_by_id.get(tid,name)==name and ids_by_name.get(name.casefold(),tid)==tid, "TEAM_IDENTITY_CONFLICT")
                    names_by_id[tid]=name
                    ids_by_name[name.casefold()]=tid
                require(e["id"] not in facts or facts[e["id"]]==f, "EVENT_CONFLICT")
                facts[e["id"]]=f
        require(len(facts)==25 and len(names_by_id)==11, "PINNED_COUNTS")
        require(history["matches"]==report["rows"] and len(history["matches"])==25, "HISTORY_REPORT_DRIFT")
        seen=set()
        day_map={d["day"]:d for d in days}
        for row in history["matches"]:
            f,ev=row["fact"],row["evidence"]
            require(f["id"] not in seen and facts.get(f["id"])==f, "HISTORY_FACT_DRIFT")
            seen.add(f["id"])
            d=day_map[ev["day"]]
            require(ev["sha256"]==d["sha256"] and ev["url"]==d["url"] and any(x["id"]==f["id"] for x in load(ev["day"]+".json")["events"]), "HISTORY_EVIDENCE_DRIFT")
        require(seen==set(facts), "HISTORY_COVERAGE")
        require(memory["slug"]=="ind.2" and set(memory["teams"])==set(names_by_id.values()), "MEMORY_TEAMS")
        pairs={}
        for team,entries in memory["teams"].items():
            require(entries==sorted(entries,key=lambda e:e["date"],reverse=True), "MEMORY_ORDER")
            for entry in entries:
                pairs.setdefault(entry["matchId"],[]).append((team,entry))
        require(set(pairs)=={"espn_"+i for i in facts}, "MEMORY_MATCH_SET")
        for i,f in facts.items():
            p=pairs["espn_"+i]
            require(len(p)==2 and {e["ha"] for _,e in p}=={"H","A"}, "RECIPROCAL_PAIR")
            for team,e in p:
                home=e["ha"]=="H"
                gf,ga=(f["gf"],f["ga"]) if home else (f["ga"],f["gf"])
                require(team==f["home" if home else "away"] and e["opp"]==f["away" if home else "home"] and e["date"]==f["kickoff"] and e["gf"]==gf and e["ga"]==ga and e["res"]==("W" if gf>ga else "L" if gf<ga else "D"), "MEMORY_FACT_DRIFT")
        return {n:z.read(n) for n in ("memory-proposal.json","source-bound-history.json","form-samples.json")}

def main():
    p=argparse.ArgumentParser()
    p.add_argument("archive",type=pathlib.Path)
    p.add_argument("--stage",action="store_true")
    p.add_argument("--verify-production",action="store_true")
    args=p.parse_args()
    files=verify(args.archive)
    targets={MEMORY:files["memory-proposal.json"], ROOT/"source-bound-history.json":files["source-bound-history.json"],ROOT/"form-samples.json":files["form-samples.json"],ROOT/"evidence.zip":args.archive.read_bytes()}
    if args.stage:
        require(not any(p.exists() for p in targets), "EXISTING_PRODUCTION_TARGET")
        for p,raw in targets.items():
            p.parent.mkdir(parents=True,exist_ok=True)
            p.write_bytes(raw)
    if args.verify_production or args.stage:
        for p,raw in targets.items():
            require(p.read_bytes()==raw, "PRODUCTION_BYTE_DRIFT:"+str(p))
    print(json.dumps({"league":"ind.2","provider":"espn","matches":25,"teams":11,"reciprocalEntries":50,"days":180,"fullCoverageCertified":False,"verified":True}))

if __name__=="__main__":
    main()
