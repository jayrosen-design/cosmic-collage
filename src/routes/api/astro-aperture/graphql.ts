import { createFileRoute } from "@tanstack/react-router";

const UPSTREAM = "https://jayrosen.design/graphql";

/**
 * Browser -> same-origin proxy -> jayrosen.design WordPress GraphQL.
 *
 * Public portfolio content: no credentials are attached or accepted. Only
 * read-only queries are forwarded.
 */
export const Route = createFileRoute("/api/astro-aperture/graphql")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: { query?: unknown; variables?: unknown };
        try {
          payload = (await request.json()) as typeof payload;
        } catch {
          return json({ error: "Invalid JSON body." }, 400);
        }

        const query = typeof payload.query === "string" ? payload.query : "";
        if (!query) return json({ error: "Missing query." }, 400);
        if (/\bmutation\b|\bsubscription\b/i.test(query)) {
          return json({ error: "Only read-only queries are allowed." }, 403);
        }

        try {
          const upstream = await fetch(UPSTREAM, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              // WordPress sits behind Cloudflare, which rejects header-less
              // server-to-server requests
              "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
              Referer: "https://jayrosen.design/",
              Origin: "https://jayrosen.design",
            },
            body: JSON.stringify({ query, variables: payload.variables ?? null }),
          });
          const text = await upstream.text();
          return new Response(text, {
            status: upstream.status,
            headers: {
              "Content-Type": "application/json",
              // archive content changes rarely; let the edge and browser cache it
              "Cache-Control": "public, max-age=300, s-maxage=900",
            },
          });
        } catch {
          return json({ error: "Astro Aperture could not be reached." }, 502);
        }
      },
    },
  },
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
