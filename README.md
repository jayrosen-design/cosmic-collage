# Cosmic Collage

Cosmic Collage is a browser-based *computational instrument* for reconstructing an
astronomical image out of fragments of other **real** astronomical photographs.

The pipeline is:

```text
Photo Archive → Image Analysis → Target → Grid → Reconstruction
             → Abstraction → Manual Refinement → Physical Collage Export
```

Hard rule of the product: **no synthetic imagery is ever painted into a collage.**
Every visible pixel of a tile is a crop of an actual source photograph, and every
tile keeps a full provenance record (source photo, crop rect, rotation, scale,
match scores).

The first-run experience is a working demo: five real NASA Andromeda
observations (GALEX UV, WISE IR, Spitzer IR, a UV+IR composite) are preloaded, no
login required.

---

## 1. Stack

| Concern | Choice |
| --- | --- |
| Framework | TanStack Start v1 (React 19, SSR-capable) |
| Build | Vite 7 |
| Router | TanStack Router, file-based (`src/routes/`) |
| Styling | Tailwind CSS v4 via `src/styles.css` (OKLCH semantic tokens) |
| UI kit | shadcn/ui + Radix primitives (`src/components/ui/`) |
| Data fetching | TanStack Query (available; the demo loads a static manifest) |
| Compute | 100% client-side Canvas 2D + typed arrays. No backend today. |

There is deliberately **no database and no auth** yet. All state lives in one
React context provider for the session.

---

## 2. Directory map

```text
src/
  routes/
    __root.tsx            root layout: fonts, dark class, <StudioProvider>
    index.tsx             landing page, "Open Andromeda Demo" entry point
    studio.tsx            main editor (archive | canvas | inspector | controls)
    archive.tsx           full-library browser
    project.$id.tsx       project metadata + mosaic statistics
    physical.$id.tsx      assembly blueprint + export tools
  components/cosmos/
    StudioShell.tsx       persistent chrome: nav, status, progress
    ArchivePanel.tsx      source list, wavelength filters, personal uploads
    ControlsPanel.tsx     grid, abstraction, randomness, diversity, presets
    MosaicCanvas.tsx      viewport: zoom/pan, tile picking, drag-to-swap
    TileInspector.tsx     provenance + alternative candidates + lock/rotate
    PhysicalPanel.tsx     assembly map, PNG/CSV export
  lib/cosmos/
    types.ts              the data model + the engine interface
    engine.ts             BrowserAnalysisEngine (analysis + matching)
    render.ts             canvas compositing, assembly map, exports
    store.tsx             StudioProvider: all app state and actions
public/demo/andromeda/manifest.json   demo project definition
```

---

## 3. Data model (`src/lib/cosmos/types.ts`)

Read this file first; it is the contract every other module obeys.

- **`SourceImage`** — one photograph in the archive. Carries `url`, `wavelength`,
  `nasaId`, `mission`, `credit`, `photographer`, `equipment`, `tags`, `enabled`,
  `origin: "demo" | "upload"`, natural `width`/`height`. Provenance fields are
  never dropped; the inspector and CSV export read them directly.
- **`ImageFeatures`** — the visual descriptor of a region: mean `r,g,b`, `h,s,v`,
  `luminance`, `contrast`, a 12-bin `histogram` (4 luminance × 3
  channel-dominance bins), `edgeDensity`, `edgeDirection` (radians, 0..π), and a
  4×4 `structure` grid of luminance.
- **`CandidateCrop`** — a normalised crop rect (`x,y,w,h` in 0..1) inside one
  source photograph, plus its `features` and a stable `index` into the engine's
  candidate pool.
- **`MosaicTile`** — one grid cell: `row`, `column`, `sourceImageId`,
  `candidateIndex`, the crop rect, `rotation` (0/90/180/270), `scale`, the four
  score components, `locked`, and `alternatives` (candidate indexes offered in
  the inspector).
- **`MosaicSettings`** — `columns`, `rows`, `tileGap`, `tileBorder`,
  `aspectMode`, `abstraction`, `randomness`, `seed`/`seedLocked`, `diversity`,
  `maxTilesPerSource`, `allowRotation`, `sourceMix` (per-wavelength weighting),
  `includeTargetInSources`.
- **`Mosaic`** — settings snapshot + `targetId` + `tiles` + `candidateCount` +
  `engine: "visual" | "ai"`.
- **`MosaicAnalysisEngine`** — **the extension seam.** Any implementation of
  `analyzeImage`, `findCandidates`, `generateMosaic` can be dropped in, including
  a remote AI service. `Mosaic.engine` records which one produced a result.

Grid labels are human-readable via `tileLabel(row, column)` → `A01`, `B07`, …
used in the assembly map and CSV.

---

## 4. The engine (`src/lib/cosmos/engine.ts`)

Entirely client-side, deterministic given a seed (`mulberry32`).

1. **Bitmap reduction** — `makeAnalysisBitmap(img, maxSize)` draws the photo into
   an offscreen canvas (sources at 448px, target at 640px) and keeps the raw
   `Uint8ClampedArray`. All later math runs on these small buffers, never on
   full-resolution pixels.
2. **Description** — `describeRegion(bmp, nx, ny, nw, nh)` samples an 8×8 lattice
   over a normalised rect and produces one `ImageFeatures`.
3. **Candidate generation** — `buildCandidates()` slides windows over each source
   at `CROP_SCALES = [1.0, 1.5, 2.0]` with 25% overlap, then decimates evenly to
   at most `MAX_CANDIDATES_PER_SOURCE = 260` per photograph.
4. **Rotation** — `rotateFeatures()` rotates the 4×4 structure grid and the edge
   direction, so all four orientations are scored without re-sampling pixels.
5. **Scoring** — `scoreFeatures(target, candidate, weights)` returns brightness,
   colour, structure, contrast, edge-density and edge-direction terms combined
   into `similarity`. `weightsForAbstraction(a)` re-balances those weights: low
   abstraction favours structure/edges (photographic fidelity), high abstraction
   favours colour/brightness (painterly).
6. **Assembly** — for each grid cell the engine describes the target region,
   samples a candidate subset (bounded for large grids), applies `sourceMix`
   bonuses and a `maxTilesPerSource` usage cap for diversity, injects
   `randomness` (amplified by high abstraction), respects locked tiles passed in
   via `ctx.lockedTiles`, and emits a `MosaicTile` with its top `alternatives`.
   `onProgress` reports phases; `yieldToUI()` keeps the main thread responsive.

`browserEngine` is the shared singleton instance; it keeps the last candidate
pool in memory so the Tile Inspector can rank alternatives instantly.

---

## 5. Rendering and export (`src/lib/cosmos/render.ts`)

- `preloadImages()` warms the image cache.
- `renderMosaic(mosaic, sources, opts)` composites tiles onto a canvas
  (rotation, gap, border aware). Total width is capped around 3600px for browser
  stability.
- `renderAssemblyMap()` draws the numbered physical-assembly blueprint.
- `renderCandidatePreview()` renders a single crop for inspector thumbnails.
- `tileManifestCsv(mosaic, sources)` emits one row per tile with label, source
  name, credit, crop rect, rotation and scores — the print/cut-list artefact.
- `downloadCanvas()` / `downloadText()` trigger the browser downloads.

---

## 6. State (`src/lib/cosmos/store.tsx`)

`StudioProvider` is mounted once in `__root.tsx` and exposes `useStudio()`:

- Data: `project`, `images`, `target`, `sourcePool`, `settings`, `mosaic`,
  `ready`, `generating`, `progress`, `selectedTileId`, `engineMode`.
- Actions: `openDemo`, `patchSettings`, `setTarget`, `toggleImage`,
  `updateImage`, `removeImage`, `addUploads`, `generate`, `newSeed`,
  `selectTile`, `imageById`, `suggest`, `replaceTile`, `swapTiles`,
  `rotateTile`, `toggleLock`.

`openDemo()` fetches `/demo/andromeda/manifest.json`, maps each entry to a
`SourceImage`, picks the `type: "target"` entry as the target, and creates the
`Project`. `addUploads()` does the same for local `File` objects via object URLs.

Manifest entry shape:

```json
{
  "id": "pia12832",
  "nasaId": "PIA12832",
  "file": "PIA12832_WISE_IR.jpg",
  "url": "https://…/PIA12832_WISE_IR.jpg",
  "title": "The Infrared Face of the Andromeda Galaxy",
  "mission": "WISE",
  "wavelength": "ir",
  "type": "source",
  "tags": ["galaxy", "infrared"],
  "credit": "NASA/JPL-Caltech/UCLA"
}
```

`wavelength` is normalised into the `Wavelength` union; unknown values fall back
to `"other"`.

---

## 7. Canvas interactions (`MosaicCanvas.tsx`)

A single `camera` state `{ zoom, x, y }` drives one CSS transform with
`transform-origin: center center` on an `absolute inset-0 flex items-center
justify-center` layer.

- **Wheel** — cursor-anchored zoom. Cursor coordinates are taken *relative to the
  viewport centre* (`e.clientX - rect.left - rect.width / 2`) so the anchor math
  matches the transform origin. Zoom and offset are committed in one state update
  — splitting them applies the offset twice.
- **Magnifier buttons** — zoom in/out/reset anchored at the viewport centre.
- **Right-drag** — pan.
- **Left-drag a tile onto another** — `swapTiles()` exchanges the two tiles'
  visual payload and provenance while keeping their ids and grid coordinates.
- **Left-click** — `selectTile()`, which drives the Tile Inspector.

Views: Reconstruction, Target, and Split-Compare.

---

## 8. Adding features — where to plug in

### 8a. A new image source (NASA APIs, a WordPress media library, S3, …)

Everything downstream only knows about `SourceImage[]`, so an integration is an
*adapter* that produces those objects. Recommended shape:

1. Add `src/lib/cosmos/sources/<provider>.ts` exporting
   `async function fetchFrom<Provider>(query): Promise<SourceImage[]>`.
   Map provider metadata onto the provenance fields (`credit`, `mission`,
   `photographer`, `equipment`, `captureDate`, `tags`) — never discard it.
2. Fetch from the server, not the browser, when a key or CORS is involved: add a
   `createServerFn` in e.g. `src/lib/cosmos/sources.functions.ts` and read secrets
   with `process.env[...]` **inside** `.handler()`. Public/webhook endpoints go
   under `src/routes/api/public/*`.
3. Add an `importImages(images: SourceImage[])` action to `StudioProvider`
   alongside `addUploads`, and a picker UI in `ArchivePanel`.
4. CORS matters: the engine reads pixels with `getImageData`, so remote images
   must be served with permissive CORS (`loadImage` sets `crossOrigin`) or be
   proxied through a server route.

Concrete targets:
- **NASA Images API** (`images-api.nasa.gov/search?q=`) — returns `nasa_id`,
  `title`, `description`, `keywords`, `center`; asset URLs come from
  `/asset/{nasa_id}`. Use the `~orig`/large JPEG, map `keywords` → `tags`.
- **NASA APOD / SkyView / MAST** — same adapter contract; MAST/FITS would need a
  conversion step to RGB before it can enter the archive.
- **WordPress** — `GET /wp-json/wp/v2/media?per_page=100` gives
  `source_url`, `media_details.sizes`, `title.rendered`, `caption`, `alt_text`,
  and EXIF in `media_details.image_meta` (camera, aperture, created timestamp) —
  a good match for `equipment`, `captureDate`, `photographer`. Prefer a large
  registered size over the original for analysis speed.

### 8b. Persistence, accounts, sharing

Enable Lovable Cloud and store `Project`, `SourceImage` rows and serialised
`Mosaic` documents. `MosaicSettings` + `seed` + `targetId` fully reproduce a
collage, so a saved project can be tiny: settings, seed, source ids, plus any
manually edited/locked tiles. Roles must live in a separate `user_roles` table.

### 8c. A smarter matcher (the "AI" engine)

Implement `MosaicAnalysisEngine` with `mode: "ai"` (e.g. CLIP/DINO embeddings
computed server-side, cosine similarity + Hungarian assignment) and swap it in
where `browserEngine` is used in `store.tsx`. Keep the same `MosaicTile` output
so the inspector, assembly map and CSV keep working unchanged. Precomputed
embeddings per `SourceImage` are the natural thing to cache in the database.

### 8d. Performance headroom

Move `describeRegion` / candidate scoring into a Web Worker (or WASM) — the code
is already pure functions over typed arrays. `OffscreenCanvas` would let both
analysis and rendering run off the main thread and remove the current
`yieldToUI()` cooperative pauses.

---

## 9. Conventions to keep

- Colours, gradients and shadows come from the semantic tokens in
  `src/styles.css`. Never hardcode `text-white` / `bg-[#…]`.
- Fonts: Space Grotesk (display) + IBM Plex Mono (data), loaded via `<link>` in
  `__root.tsx` — not `@import` in CSS.
- Every route defines its own `head()` with a unique title/description.
- `createFileRoute("…")` strings must match the filename under
  `src/routes/`; `src/routeTree.gen.ts` is generated — never edit it.
- Never invent astronomical content. If a feature cannot cite a real source
  photograph for a pixel, it does not belong in the collage.

---

## 10. Local development

```sh
npm i
npm run dev     # http://localhost:8080
npm run build
npm run lint
```
