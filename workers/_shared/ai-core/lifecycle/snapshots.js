
async function getJson(bucket, key){
  const obj = await bucket.get(key);
  if(!obj) return null;
  return await obj.json();
}

export async function loadSnapshot(env, id){
  return await getJson(env.R2_INTEL, `intel/context/${id}/latest.json`);
}

export async function persistSnapshot(env, id, snapshot){

  const ts = Date.now();

  await env.R2_INTEL.put(
    `intel/context/${id}/v/${ts}.json`,
    JSON.stringify(snapshot)
  );

  await env.R2_INTEL.put(
    `intel/context/${id}/latest.json`,
    JSON.stringify(snapshot)
  );
}

export async function cleanupSnapshots(env, id, status){

  const prefix = `intel/context/${id}/v/`;
  const list = await env.R2_INTEL.list({ prefix });

  const objects = (list.objects||[])
    .sort((a,b)=>a.key.localeCompare(b.key));

  const max = status==="LIVE" ? 5 : 2;

  if(objects.length <= max) return;

  const toDelete = objects.slice(0, objects.length-max);

  for(const obj of toDelete){
    await env.R2_INTEL.delete(obj.key);
  }
}
