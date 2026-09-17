# Endless Canvas

## Goal
Add an optional **Endless Canvas** mode. The selected grid remains the detailed center reconstruction. Zooming out reveals more of the original target photograph, while only newly visible tiles are generated. Beyond the photograph’s bounds, the canvas continues with dark-sky tiles matched from real source photographs, preserving Cosmic Collage’s real-pixels-only rule.

## User experience
- Add an **Endless Canvas** switch beside the Grid controls; existing fixed-grid behavior remains the default.
- In Endless mode, the selected columns and rows define the center mosaic’s tile size and detail.
- Zooming out progressively reveals a wider field around that center.
- Generate only tiles entering or approaching the visible area, with a small non-blocking generation status.
- Keep wheel zoom, right-drag pan, tile selection, swapping, locking, and rotation working across generated tiles.
- Download PNG exports every generated tile, including the expanded area reached so far.

## Behavior
1. The center grid maps to an initial crop of the target photograph.
2. Outer coordinates map to progressively wider portions of that same real target.
3. Once the complete target is visible, farther coordinates use the target-derived sky descriptor and are filled only with crops from real source photographs.
4. Generated outer tiles remain stable: revisiting an area produces the same tiles from the project seed.
5. AI Alignment continues to refine the original target-bearing reconstruction only; automatic outer expansion uses the visual matcher and does not create extra API requests.

## Technical details
- Extend mosaic settings and tile metadata with Endless Canvas state and signed world-grid coordinates.
- Generalize composition mapping so cells outside the center grid can map into the wider target image or target-derived sky.
- Separate reusable source analysis/candidate preparation from core generation, then add deterministic viewport-batch generation.
- Track generated world bounds and in-flight cell requests in studio state, deduplicating rapid zoom events.
- Replace the single transformed full mosaic bitmap in Endless mode with a viewport-sized canvas that draws only visible tiles plus a small overscan margin.
- Preserve the existing finite renderer for fixed mode, thumbnails, assembly maps, and current comparisons.
- Add an expanded export renderer that calculates the finite bounding box of all generated cells and safely scales tile resolution to browser canvas limits.
- Keep Compare and Target views aligned to the generated world bounds when Endless mode is active.

## Files expected to change
- `src/lib/cosmos/types.ts`
- `src/lib/cosmos/composition.ts`
- `src/lib/cosmos/engine.ts`
- `src/lib/cosmos/store.tsx`
- `src/lib/cosmos/render.ts`
- `src/components/cosmos/MosaicCanvas.tsx`
- `src/components/cosmos/ControlsPanel.tsx`
- Export/physical-view code where generated bounds are consumed

## Validation
- Confirm fixed-grid mode is unchanged.
- Confirm zooming out requests only newly visible cells and does not regenerate existing ones.
- Confirm expanded tiles remain identical after panning away and back.
- Confirm the target expands outward without stretching and transitions to source-photo sky beyond its bounds.
- Confirm outer tiles remain selectable and movable.
- Confirm PNG export includes the complete generated extent.
- Verify desktop interaction and a smaller viewport with Playwright.
