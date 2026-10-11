# WebAssembly and progressive loading

OutNumbered uses a small AssemblyScript WebAssembly simulation module alongside a TypeScript application and Three.js WebGL renderer. The `.wasm` module performs movement collision, stamina updates and distance checks. Rendering, procedural artwork, input, user interface, audio and network transport run in JavaScript. This is a hybrid browser game; it is not a complete Unity or Godot engine exported to WebAssembly.

## What loads, and when

1. Vite serves the HTML, CSS and application shell with a preloaded WebP arena preview. The lobby does not import Three.js, construct WebGL resources, or run a render loop. Changing arenas switches the preview image.
2. Clicking Play dynamically imports the renderer. It creates a lightweight landscape and box silhouettes for all three arenas, then loads the starting arena. Leaving a match disposes the engine and restores the image preview.
3. Starting a match calls `loadCore()` in `src/game/wasm.ts`. This fetches `wasm/outnumbered.wasm` relative to Vite's configured base URL. `WebAssembly.instantiateStreaming()` compiles while downloading; a response-clone fallback supports hosts that send an incorrect WASM MIME type without a second download.
4. As the player moves, `src/game/world.ts` imports nearby arena modules independently: campus, garden and museum. A zone loads within 43 metres of its centre; the nearest zone always loads. Its generated scene replaces the box silhouettes.
5. Detailed scenes farther than 78 metres are disposed, releasing their geometry and materials and restoring the silhouettes. Returning reconstructs the scene from the module retained by the browser. This does not unload downloaded JavaScript from the module cache.

The separate load and unload distances prevent repeated rebuilding near a boundary. Vite emits actual arena JavaScript chunks; these are not simulated loading delays. The arena modules generate buildings, props, trees and textures at runtime, so this version has no large external model bundles to stream. Navigation streams scene detail, while the small shared collision layout is present from match start. An unloaded arena therefore remains solid.

Scene shaders are prepared asynchronously before new detail is published. Static scenery shares palette materials within each independently disposable zone and freezes unchanged transforms. Characters batch colors per vertex within articulated joints, retaining geometry and surface roughness. Equipment is prepared between loading-screen paints and reused during the match.

Auto graphics caps the rendered pixel count at two million, caps device pixel ratio at 1.25, and adjusts resolution between 80% and 100% after sustained frame-time measurements. It uses a 1024-square shadow map updated at most 30 times per second. High uses up to four million pixels, a 1.6 pixel-ratio cap, and 2048-square shadows updated every frame. All modes keep the same characters, textures, arena geometry and native-resolution HTML HUD. Hidden tabs suspend rendering; returning resumes without treating the background interval as slow rendering.

## Source and build

| File | Responsibility |
| --- | --- |
| `assembly/index.ts` | Allocation-free movement, range and stamina calls after world initialization |
| `scripts/build-wasm.mjs` | AssemblyScript compiler API; optimized binary and readable `.wat` output |
| `src/shared/world.ts` | Exact wall dimensions, arena centres, player radius and clear spawn positions |
| `src/game/wasm.ts` | Browser loading and typed JavaScript wrapper |
| `src/game/world.ts` | Proxies, distance-based scene imports and disposal |
| `src/game/zones/*.ts` | Procedural arena geometry, materials and animations |
| `server/index.ts` | Authoritative match simulation and WebSocket transport; loads the same WASM core |

Run `npm run build:wasm` to create `public/wasm/outnumbered.wasm` and `public/wasm/outnumbered.wat`. `npm run build` rebuilds the module, type-checks the application and produces the deployable `dist/` tree. Serve `.wasm` as `application/wasm`; the included server already sets this header. The module requires no shared memory or cross-origin isolation headers.

## Core API and collision contract

`loadCore()` resolves to this browser API:

```ts
move(x, z, dx, dz, radius = 0.38): { x: number; z: number }
stamina(value, moving, sprinting, dt): number
inRange(x, z, targetX, targetZ, maxRange): boolean
```

Positions and distances use metres, `dt` uses seconds, and stamina ranges from 0 to 100. Sprinting while moving consumes 19 stamina per second; otherwise it regenerates at 13 per second. Negative elapsed time cannot alter stamina.

The binary exports `resetWorld`, `addWall`, `wallCount`, `clipX`, `clipZ`, `advanceStamina` and `inRange`. Initialization expands the shared centre-based wall definitions into bounds for `addWall(minX, minZ, maxX, maxZ)`. Movement clips X first and then Z, allowing sliding along surfaces. Walls are expanded by the player radius, producing conservative horizontal collision. Per-axis swept checks stop movement at the first wall even when one step would pass through it. The application caps frame time and normalizes diagonal movement. This is ground-plane movement; the visual hop does not enable jumping over walls or climbing roofs.

The three connected arenas form an L-shaped footprint. Boundary walls close the unused quadrant and leave passages from campus to the garden and museum. Rendering and physics share these dimensions, and all 30 spawn points are outside the 37 collision boxes. Range checking only measures distance; server visibility and elimination rules separately account for cover and game state.

## Verification

`npm test` rebuilds the binary and runs the WASM and server suites. WASM tests cover free movement, forward and reverse collision, radius clearance, wall sliding, reset, radial range and stamina bounds. Additional geometry checks confirmed all spawn points connect through the two arena passages, diagonal movement stays outside solid corners, and the missing quadrant remains inaccessible.
