import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useStudio } from "@/lib/cosmos/store";
import studioShot from "@/assets/about-studio.jpg";
import archiveShot from "@/assets/about-archive.jpg";
import galleryShot from "@/assets/about-gallery.jpg";
import physicalShot from "@/assets/about-physical.jpg";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — How Cosmic Collage Works" },
      {
        name: "description",
        content:
          "How Cosmic Collage works: an archive of real astronomical photographs, a visual matching engine, optional AI alignment, and exports for cutting a physical collage by hand.",
      },
      { property: "og:title", content: "How Cosmic Collage Works" },
      {
        property: "og:description",
        content:
          "A guided tour of the instrument — photo archive, visual analysis, reconstruction grid, abstraction, manual refinement and physical assembly maps.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: About,
});

function Shot({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption: string;
}) {
  return (
    <figure className="mt-6">
      <div className="overflow-hidden rounded-sm border border-border-strong bg-surface">
        <img src={src} alt={alt} loading="lazy" className="block w-full" />
      </div>
      <figcaption className="data-mono mt-2 text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}

function Section({
  step,
  title,
  children,
}: {
  step: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border pt-8">
      <p className="label-xs text-primary">{step}</p>
      <h2 className="mt-2 font-display text-2xl tracking-tight text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function About() {
  const { openDemo, loadingDemo, ready, addUploads } = useStudio();
  const navigate = useNavigate();
  const [pending, setPending] = useState<null | "demo" | "upload">(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pending && ready) void navigate({ to: pending === "demo" ? "/studio" : "/archive" });
  }, [pending, ready, navigate]);

  const start = (kind: "demo" | "upload") => {
    setPending(kind);
    void openDemo();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <p className="label-xs">Cosmic Collage</p>
        <h1 className="mt-4 font-display text-4xl leading-[1.05] tracking-tight text-foreground sm:text-5xl">
          Reconstruct the cosmos
          <br />
          <span className="text-primary">from observations of the cosmos.</span>
        </h1>
        <p className="mt-6 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Cosmic Collage rebuilds an astronomical image out of fragments cut from other real
          photographs. From a distance you see Andromeda. Up close you see ultraviolet, infrared and
          composite observations sitting side by side. Nothing here is generated imagery — every tile
          is a crop of an actual photograph, and every fragment keeps its provenance.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <button
            onClick={() => start("demo")}
            disabled={loadingDemo}
            className="rounded-sm bg-amber px-4 py-2.5 font-mono text-xs tracking-wider uppercase text-[oklch(0.18_0.01_250)] transition-colors hover:bg-amber/90 disabled:opacity-60"
          >
            {loadingDemo ? "Loading archive…" : "Open Andromeda Demo"}
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded-sm border border-border-strong px-4 py-2.5 font-mono text-xs tracking-wider uppercase text-foreground transition-colors hover:border-primary/60"
          >
            Upload My Photography
          </button>
          <input
            ref={fileRef}
            type="file"
            hidden
            multiple
            accept="image/jpeg,image/png,image/webp"
            onChange={async (e) => {
              const files = e.target.files;
              e.currentTarget.value = "";
              if (!files?.length) return;
              await addUploads(files);
              start("upload");
            }}
          />
          <span className="data-mono text-muted-foreground">No account required.</span>
        </div>

        <dl className="mt-16 grid gap-6 border-t border-border pt-8 sm:grid-cols-3">
          {[
            ["Archive", "GALEX ultraviolet, WISE and Spitzer infrared, GALEX+Spitzer composite."],
            [
              "Matching",
              "Brightness, colour, contrast, edge density and structure — Visual Analysis.",
            ],
            [
              "Physical",
              "Assembly map, tile manifest and exports for cutting the collage by hand.",
            ],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="label-xs">{k}</dt>
              <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">{v}</dd>
            </div>
          ))}
        </dl>

        {/* ── How it works ─────────────────────────────────────────── */}
        <div className="mt-20">
          <p className="label-xs">Walkthrough</p>
          <h2 className="mt-3 font-display text-3xl tracking-tight text-foreground">
            How the instrument works
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            The whole pipeline runs in your browser: photographs are decoded, measured and
            re-assembled on a canvas locally. Nothing is uploaded to a server, and no pixel is
            invented — the collage is only ever a rearrangement of the photographs in your archive.
          </p>
          <div className="data-mono mt-5 rounded-sm border border-border bg-surface px-4 py-3 text-muted-foreground">
            Archive → Visual Analysis → Target → Grid → Reconstruction → Abstraction → Manual
            Refinement → Physical Export
          </div>
        </div>

        <div className="mt-14 space-y-14">
          <Section step="Step 01" title="Load a photo archive">
            <p>
              Start from a built-in NASA dataset or drop in your own astrophotography (JPG, PNG,
              WEBP). Each photograph is tagged with its instrument and band — ultraviolet, infrared,
              hydrogen-alpha, OIII, SII, RGB, dark sky, star field — plus its credit line. You can
              rename, retag, or switch any photograph off so the matcher ignores it, and one image is
              nominated as the <em>target</em>: the picture being rebuilt.
            </p>
            <Shot
              src={archiveShot}
              alt="Cosmic Collage photo archive listing five NASA observations of Andromeda with band tags and enable toggles"
              caption="Photo Archive — five real observations of M31; PIA08787 is set as the target, the rest are sources."
            />
          </Section>

          <Section step="Step 02" title="Measure every photograph">
            <p>
              Each source is cut into hundreds of candidate crops at several scales. For every crop
              the engine measures a visual descriptor: mean brightness, colour histograms, contrast,
              edge density and a coarse structural signature. The same descriptor is computed for
              every cell of the target grid, so matching is a numerical comparison rather than a
              guess — the demo above works from 562 candidate fragments for 240 grid cells.
            </p>
          </Section>

          <Section step="Step 03" title="Reconstruct on a grid">
            <p>
              Choose a grid (12×8 up to 60×36, or a custom size) and the engine assigns a fragment to
              every cell, working from the most visually important regions outward so the galaxy core
              gets first pick of the best crops. Each fragment can be rotated in 90° steps, and its
              rotation is chosen by measurement, not aesthetics. Tile gap, border and aspect mode
              control how the physical collage will read.
            </p>
            <p>
              The <span className="text-foreground">Abstraction</span> slider moves the result along
              a spectrum: faithful reproduction of the target on one end, a looser, more painterly
              arrangement of fragments on the other. Scientific, Collage and Cosmic Abstraction
              presets are starting points.
            </p>
            <Shot
              src={studioShot}
              alt="Cosmic Collage studio showing the archive sidebar, mosaic reconstruction of Andromeda, and reconstruction controls"
              caption="Studio — archive on the left, live reconstruction in the centre, reconstruction and composition controls on the right."
            />
          </Section>

          <Section step="Step 04" title="Optional AI alignment">
            <p>
              AI never draws anything. When enabled, it acts as a curator: the engine builds the
              baseline mosaic numerically, then asks a vision model to compare the reconstruction
              against the target, flag the weakest regions, and pick between real candidate fragments
              shown on a contact sheet. Every suggestion is then validated numerically against a
              single alignment-quality score (structure, similarity, brightness, neighbour
              continuity) and is only applied if it measurably improves the tile.
            </p>
            <p>
              Diagnostics report exactly what happened — how many regions were reviewed, how many
              recommendations were rejected, and how the AI's picks compare with a random-selection
              control run over the same regions.
            </p>
          </Section>

          <Section step="Step 05" title="Refine by hand">
            <p>
              The canvas is an instrument, not an image viewer. Scroll to zoom toward the cursor,
              right-drag to pan, and left-drag any tile onto another to swap the two fragments. Click
              a tile and the inspector along the bottom shows which photograph produced it, the crop
              coordinates, rotation, scale, match score, target coverage and — after an AI pass — the
              quality delta for that specific tile.
            </p>
            <p>
              Target, Reconstruction and Compare views share the same geometry, so switching between
              them holds position and lets you check the collage against the original observation
              region by region.
            </p>
          </Section>

          <Section step="Step 06" title="Export a physical collage">
            <p>
              The Assembly Map turns the digital result into cutting instructions: a lettered and
              numbered grid where every cell names its source photograph, a per-source tile count, and
              a tile manifest listing crop coordinates, rotation, scale and score for each fragment.
              Export the mosaic as PNG or JPG, the manifest as CSV, and the assembly map as a PNG to
              print and work from at the table.
            </p>
            <Shot
              src={physicalShot}
              alt="Cosmic Collage assembly map with a lettered grid of tile IDs, per-source tile counts and a tile manifest table"
              caption="Assembly Map — every cell traced back to its photograph, with exports for cutting the collage by hand."
            />
          </Section>

          <Section step="Step 07" title="Keep your projects">
            <p>
              Saving a collage stores it in the Gallery with the exact settings that produced it, so
              a reconstruction can be reopened, re-tuned and re-exported later. The built-in NASA
              demos — Andromeda (M31), the Orion Nebula (M42) and the Pinwheel Galaxy (M101) — sit
              alongside your own work as fully editable projects.
            </p>
            <Shot
              src={galleryShot}
              alt="Cosmic Collage gallery showing Andromeda, Orion Nebula and Pinwheel Galaxy demo project cards"
              caption="Gallery — the three bundled NASA datasets plus every collage you save from the studio."
            />
          </Section>

          <Section step="Principles" title="What this app will never do">
            <p>
              No fragment is ever synthesised, in-painted, upscaled into detail that was not
              observed, or borrowed from an image outside the archive. Provenance travels with every
              tile from analysis through to the printed manifest, so the finished collage can always
              be traced back to real telescope data and credited correctly.
            </p>
          </Section>
        </div>

        <div className="mt-16 flex flex-wrap items-center gap-3 border-t border-border pt-8">
          <button
            onClick={() => start("demo")}
            disabled={loadingDemo}
            className="rounded-sm bg-amber px-4 py-2.5 font-mono text-xs tracking-wider uppercase text-[oklch(0.18_0.01_250)] transition-colors hover:bg-amber/90 disabled:opacity-60"
          >
            {loadingDemo ? "Loading archive…" : "Try it in the Studio"}
          </button>
          <Link
            to="/gallery"
            className="rounded-sm border border-border-strong px-4 py-2.5 font-mono text-xs tracking-wider uppercase text-foreground transition-colors hover:border-primary/60"
          >
            Browse Gallery
          </Link>
        </div>
      </div>
    </div>
  );
}
