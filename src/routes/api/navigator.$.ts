import { createFileRoute } from "@tanstack/react-router";

const UPSTREAM = "https://api.ai.it.ufl.edu/v1";

/**
 * Browser -> same-origin proxy -> NaviGator Toolkit.
 *
 * The NaviGator API does not send CORS headers, so a direct browser fetch fails
 * with "Failed to fetch". The user's key is forwarded from the request and is
 * never stored server-side.
 */
async function proxy({ request, params }: { request: Request; params: Record<string, string> }) {
  const splat = params["_splat"] ?? "";
  const url = new URL(request.url);
  const target = `${UPSTREAM}/${splat}${url.search}`;

  const auth = request.headers.get("authorization");
  if (!auth) return new Response("Missing Authorization header", { status: 401 });

  const headers: Record<string, string> = {
    Authorization: auth,
    Accept: "application/json",
  };
  const contentType = request.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;

  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await request.text();

  try {
    const upstream = await fetch(target, { method, headers, ...(body ? { body } : {}) });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Could not reach NaviGator Toolkit." }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const Route = createFileRoute("/api/navigator/$")({
  server: {
    handlers: {
      GET: proxy,
      POST: proxy,
    },
  },
});
