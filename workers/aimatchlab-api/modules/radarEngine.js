export async function handleRadar(req, env) {
  return new Response(JSON.stringify({
    ok: true,
    type: "radar",
    data: null
  }), {
    headers: { "Content-Type": "application/json" }
  });
}
