
export function buildSignature(p){
  return `${p.status}|${p.scoreHome}|${p.scoreAway}|${p.minute||0}`;
}
