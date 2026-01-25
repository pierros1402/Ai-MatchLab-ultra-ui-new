type RouteHandler = (request: Request) => Response | Promise<Response>;

const routes: Record<string, RouteHandler> = {};

export function register(path: string, handler: RouteHandler) {
  routes[path] = handler;
}

export async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const handler = routes[url.pathname];

  if (handler) {
    return handler(request);
  }

  return new Response(
    JSON.stringify({ error: "Not Found" }),
    { status: 404, headers: { "content-type": "application/json" } }
  );
}
