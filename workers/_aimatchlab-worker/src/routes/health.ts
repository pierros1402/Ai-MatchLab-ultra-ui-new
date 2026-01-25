import { register } from "./router";

register("/health", () => {
  return new Response(
    JSON.stringify({
      ok: true,
      service: "aimatchlab-worker",
      version: "v1",
      time: new Date().toISOString(),
    }),
    {
      headers: {
        "content-type": "application/json",
      },
    }
  );
});
