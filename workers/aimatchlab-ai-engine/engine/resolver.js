
import registry from "../providers/provider-registry.js";

export function resolveProvider(league){
  for(const p of registry){
    if(p.supportsLeague(league)) return p;
  }
  return null;
}
