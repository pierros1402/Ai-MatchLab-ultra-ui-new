/* =========================================================
   ACTIVE LEAGUES – FINAL CORRECT STATE MACHINE
   - PRE
   - FT / AET / PEN
   - PP
   - NO LIVE
========================================================= */

(function () {

  if (!window.on) return;

  const LIST_ID = "active-leagues-list";
  const TZ = "Europe/Athens";

  let LAST_MATCHES = [];
  let SAVED_IDS = new Set();

  function pad2(n){ return String(n).padStart(2,"0"); }

  function timeHHMM(ms){
    try {
      return new Intl.DateTimeFormat("el-GR",{
        timeZone:TZ,
        hour:"2-digit",
        minute:"2-digit",
        hour12:false
      }).format(new Date(ms));
    } catch {
      const d = new Date(ms);
      return pad2(d.getHours())+":"+pad2(d.getMinutes());
    }
  }

  function syncSaved(items){
    const s=new Set();
    (Array.isArray(items)?items:[]).forEach(x=>{
      if(x&&x.id!=null)s.add(String(x.id));
    });
    SAVED_IDS=s;
  }

  function isSaved(m){
    return m && m.id!=null && SAVED_IDS.has(String(m.id));
  }

  function isScheduled(status){
    return status.includes("SCHEDULED");
  }

  function isFinal(status){
    return (
      status.includes("FINAL") ||
      status === "FT" ||
      status === "AET" ||
      status === "PEN"
    );
  }

  function isPostponed(status){
    return (
      status.includes("POSTPONED") ||
      status.includes("PP") ||
      status.includes("SUSPENDED") ||
      status.includes("ABANDONED") ||
      status.includes("CANCEL")
    );
  }


  function render(matches){
    const root=document.getElementById(LIST_ID);
    if(!root) return;

    LAST_MATCHES=Array.isArray(matches)?matches:[];
    root.innerHTML="";

    const arr = LAST_MATCHES.filter(m=>{
      const s = String(m.status || "").toUpperCase();

      // ACTIVE: PRE + FINAL + PP
      return isScheduled(s) || isFinal(s) || isPostponed(s);
    });

    if(!arr.length){
      root.innerHTML="<div class='empty'>No active leagues</div>";
      return;
    }

    const byLeague={};
    arr.forEach(m=>{
      const lg=m.leagueName||m.leagueSlug||"—";
      (byLeague[lg] ||= []).push(m);
    });

    Object.keys(byLeague).forEach(lg=>{
      const title=document.createElement("div");
      title.className="today-league";
      title.textContent=lg;
      root.appendChild(title);

      byLeague[lg].forEach(m=>{
        const row=document.createElement("div");
        row.className="match-row";

        const left=document.createElement("div");
        left.className="today-match";
        left.textContent=m.home+" – "+m.away;

        const right=document.createElement("div");
        right.className="today-right";

        const info=document.createElement("span");
        const status = String(m.status || "").toUpperCase();

        if (isFinal(status)) {

          const sh = m.scoreHome ?? 0;
          const sa = m.scoreAway ?? 0;

          if (status === "PEN" && m.penHome != null && m.penAway != null) {
            info.textContent = `${sh} - ${sa} (${m.penHome}-${m.penAway})`;
          } else {
            info.textContent = sh + " - " + sa;
          }

        } else if (isPostponed(status)) {

          info.textContent = "PP";

        } else {

          info.textContent = timeHHMM(m.kickoff_ms);

        }

        const save=document.createElement("span");
        save.className="match-save";
        save.textContent=isSaved(m)?"★":"☆";
        save.onclick=e=>{
          e.stopPropagation();
          if(window.emit) emit("save-toggle",m);
        };

        const details=document.createElement("span");
        details.className="match-details";
        details.textContent="ⓘ";
        details.onclick=e=>{
          e.stopPropagation();
          if(window.emit){
            emit("details-open",m);
            emit("nav:matches",{focus:"details"});
          }
        };

        right.appendChild(info);
        right.appendChild(save);
        right.appendChild(details);

        row.appendChild(left);
        row.appendChild(right);

        row.onclick=()=>{
          if(window.emit){
            emit("match-selected",m);
            emit("active-match:set",m);
            emit("nav:oic",{tab:"odds"});
                      if (window.AIML_MOBILE_SET_VIEW) {
              window.AIML_MOBILE_SET_VIEW("odds");
            }
}
        };

        root.appendChild(row);
      });
    });
  }

  on("active-leagues:updated", matches=>{
    render(matches || []);
  });


  on("saved:updated", payload=>{
    syncSaved(payload?.items||[]);
    render(LAST_MATCHES);
  });

  try{
    syncSaved(window.getSavedMatches?window.getSavedMatches():[]);
  }catch{}

})();
