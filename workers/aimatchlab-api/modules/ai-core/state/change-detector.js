
export function shouldRebuild(existing, signature, payload){

  if(!existing) return { rebuild:true, reason:"initial_build" };

  if(existing.state.signature !== signature)
    return { rebuild:true, reason:"state_change" };

  if(payload.status === "LIVE"){
    const prevMinute = existing.state.minute || 0;
    if(Math.abs((payload.minute||0) - prevMinute) >= 5)
      return { rebuild:true, reason:"minute_threshold" };
  }

  return { rebuild:false };
}
