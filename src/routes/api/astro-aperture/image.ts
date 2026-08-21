import { createFileRoute } from "@tanstack/react-router";

const ALLOWED_HOSTS = new Set(["jayrosen.design", "www.jayrosen.design"]);
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Narrow same-origin image proxy for Astro Aperture photographs.
 *
 * Canvas getImageData() taints on cross-origin pixels, so every remote
 * photograph the reconstruction engine analyses is served through here.
 * This is deliberately NOT a general URL proxy: HTTPS + jayrosen.design only,
 * image MIME types only, redirects not followed, size capped.
 */
export const Route = createFileRoute("/api/astro-aperture/image")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const raw = new URL(request.url).searchParams.get("url");
        if (!raw) return new Response("Missing url parameter", { status: 400 });

        let target: URL;
        try {
          target = new URL(raw);
        } catch {
          return new Response("Malformed url parameter", { status: 400 });
        }

        if (target.protocol !== "https:") {
          return new Response("Only https URLs are allowed", { status: 400 });
        }
        if (!ALLOWED_HOSTS.has(target.hostname.toLowerCase())) {
          return new Response("Host not allowed", { status: 403 });
        }

        let upstream: Response;
        try {
          upstream = await fetch(target.toString(), {
            headers: {
              Accept: "image/*",
              "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
              Referer: "https://jayrosen.design/",
              // Identifies this instrument so the archive host can allow it
              // through its firewall (Cloudflare WAF skip rule on this header).
              "X-Cosmic-Collage": "1",
            },
            redirect: "manual",
          });
        } catch {
          return new Response("Astro Aperture image could not be fetched", { status: 502 });
        }

        if (upstream.status >= 300 && upstream.status < 400) {
          return new Response("Redirects are not followed", { status: 502 });
        }
        if (!upstream.ok) {
          return new Response("Upstream image error", { status: upstream.status });
        }

        const contentType = upstream.headers.get("content-type") ?? "";
        if (!/^image\/(jpeg|png|webp|gif|avif)$/i.test(contentType.split(";")[0]!.trim())) {
          return new Response("Only image responses are allowed", { status: 415 });
        }

        const declared = Number(upstream.headers.get("content-length") ?? "0");
        if (declared > MAX_BYTES) {
          return new Response("Image too large", { status: 413 });
        }

        const bytes = new Uint8Array(await upstream.arrayBuffer());
        if (bytes.byteLength > MAX_BYTES) {
          return new Response("Image too large", { status: 413 });
        }

        return new Response(bytes, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
            "Content-Length": String(bytes.byteLength),
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
