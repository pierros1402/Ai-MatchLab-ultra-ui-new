import { runAiEngine } from "./ai-core/index.js";

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), { status: 405 });
    }

    const input = await request.json();
    const result = runAiEngine(input);

    return new Response(JSON.stringify(result, null, 2), {
      headers: { "content-type": "application/json" }
    });
  }
};