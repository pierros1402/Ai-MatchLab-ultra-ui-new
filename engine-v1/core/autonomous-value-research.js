// Experimental calculation only. No I/O, no legacy outputs, no publication policy.
// Uses the statistical metrics already produced by evaluateMatchValue.
import { createHash } from 'node:crypto';
const nonnegative = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const unit = n => nonnegative(n) && n <= 1;
const take = m => {
  if (!m || !['sample','gfAvg','gaAvg'].every(k=>nonnegative(m[k])) ||
      !['freshnessScore','continuityScore','over25Rate','bttsRate'].every(k=>unit(m[k]))) return null;
  return Object.fromEntries(['sample','gfAvg','gaAvg','freshnessScore','continuityScore','over25Rate','bttsRate'].map(k=>[k,m[k]]));
};
const mean = (a,b) => (a+b)/2;
const bound = n => Math.max(0,Math.min(6,n));
function poisson(lambda) {
  const p=[Math.exp(-lambda)];
  for(let k=1;k<=40;k++) p.push(p[k-1]*lambda/k);
  return p;
}
export function marketProbabilities(h,a) {
  if(!nonnegative(h)||!nonnegative(a)||h>6||a>6) throw Error('invalid_goal_expectation');
  const x=poisson(h),y=poisson(a);let home=0,draw=0,away=0;
  for(let i=0;i<x.length;i++) for(let j=0;j<y.length;j++) {
    const mass=x[i]*y[j]; if(i>j)home+=mass;else if(i===j)draw+=mass;else away+=mass;
  }
  const total=home+draw+away,lambda=h+a;
  return {home:home/total,draw:draw/total,away:away/total,
    over25:Math.max(0,1-Math.exp(-lambda)*(1+lambda+lambda*lambda/2)),
    btts:-Math.expm1(-h)*-Math.expm1(-a)};
}
export function evaluateAutonomousResearch(shared) {
  const {homeMetrics,awayMetrics,homeSideMetrics,awaySideMetrics,leagueBaseline,rawHomeMetrics,rawAwayMetrics}=shared;
  const home=take(homeMetrics),away=take(awayMetrics),hs=take(homeSideMetrics),as=take(awaySideMetrics);
  const rawHomeSample=rawHomeMetrics?.sample,rawAwaySample=rawAwayMetrics?.sample;
  const leagueGoals=leagueBaseline?.goalsAvg,leagueSample=leagueBaseline?.sample;
  if(!home||!away||!hs||!as||!nonnegative(rawHomeSample)||!nonnegative(rawAwaySample)||!nonnegative(leagueGoals)||!nonnegative(leagueSample)) {
    return {status:'HOLD',reason:'SHARED_METRICS_INVALID',policyApproved:false};
  }
  // Do not invent missing coverage or a different historical membership rule.
  const metrics={home,away,homeSide:hs,awaySide:as,rawHomeSample,rawAwaySample,leagueGoals,leagueSample};
  const inputDigest=createHash('sha256').update(JSON.stringify(metrics)).digest('hex');
  const baseHome=mean(home.gfAvg,away.gaAvg),baseAway=mean(away.gfAvg,home.gaAvg);
  const sideWeight=(overall,side)=> side.sample>0 ? side.sample/(overall.sample+side.sample) : 0;
  const blend=(base,side,w)=>base*(1-w)+side*w;
  const vh=sideWeight(home,hs),va=sideWeight(away,as);
  const venueHome=mean(blend(home.gfAvg,hs.gfAvg,vh),blend(away.gaAvg,as.gaAvg,va));
  const venueAway=mean(blend(away.gfAvg,as.gfAvg,va),blend(home.gaAvg,hs.gaAvg,vh));
  const reliability=mean(mean(home.freshnessScore,home.continuityScore),mean(away.freshnessScore,away.continuityScore));
  function model(h,a){h=bound(h);a=bound(a);return {lambdaHome:h,lambdaAway:a,probabilities:marketProbabilities(h,a)};}
  const variants={baseline:model(baseHome,baseAway),venue:model(venueHome,venueAway)};
  // Reliability shrinkage is experimental, not a certified weight. No baseline fallback
  // when an actual league sample is absent. Baseline and venue remain identifiable.
  if(leagueSample>0){
    const leaguePerSide=leagueGoals/2;
    variants.recency=model(blend(leaguePerSide,baseHome,reliability),blend(leaguePerSide,baseAway,reliability));
    variants.combined=model(blend(leaguePerSide,venueHome,reliability),blend(leaguePerSide,venueAway,reliability));
  }
  return {status:'RESEARCH_ONLY',policyApproved:false,inputDigest,metrics,variants,
    opponentAdjustment:'NOT_EVALUATED',leagueSupport:leagueSample>0?'AVAILABLE':'MISSING'};
}
