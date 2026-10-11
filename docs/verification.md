# Verification

Verified on October 11, 2026 in the local Windows environment.

## Automated checks

- `npm run build`: passed AssemblyScript compilation, strict TypeScript checking, and the Vite production build.
- `npm test`: **30 tests passed** — 6 WASM tests, 10 WebSocket/server tests, 5 world/asset tests, 6 character regression tests, and 3 adaptive-rendering tests.
- The multiplayer capacity test connected 20 real WebSocket clients and rejected the 21st.
- The CTF integration test used real movement inputs around obstacles to verify pickup, carrier elimination/flag return, and capture.
- Streaming tests verified concurrent request deduplication, load/unload/reload, and geometry/material/texture disposal.

## Browser checks

The compiled application was served by `npm start` at `http://localhost:3001` and tested using the in-app Chromium browser.

- Schoolyard, garden, and museum matches rendered without console errors after the optimization.
- The initial lobby creates zero canvases and requests no Three.js, avatar, arena-detail or WASM modules. Arena selection changes the WebP preview. Leaving a match again produces zero canvases.
- Practice joined one human and five server-controlled bots.
- Keyboard digit entry, camera capture and expiry, binocular zoom, grenade selection/cooldown, sprint stamina, pause, and leaving a match worked.
- CTF rendered team identity and flag objective markers.
- Two independent browser tabs joined the same real multiplayer room, showed two players, and correctly adopted the invited room’s team mode.
- At 1440 × 900, the final practice lobby fit without vertical or horizontal overflow. The narrow browser layout also rendered responsively.

The browser’s pointer-lock restriction activated the intended drag-to-look/arrow-key fallback. Native pointer-lock capture should also be exercised in the target release browsers.

The character refresh was also inspected in the interactive studio and a live practice match. See [character details and validation](character-refresh.md).

## Performance optimization measurements

The original production build was reconstructed from Git in an ignored test directory and compared with the updated production build in local Chromium. The original lobby requested approximately 596.6 KiB of JavaScript; the updated lobby requests approximately 18.8 KiB (about 97% less). These are encoded script body sizes, not total page weight or a claim about internet download latency.

`npx tsx scripts/benchmark-scenes.ts` audits scene complexity without a GPU. The optimization retains all triangles:

| Scene | Previous meshes | Updated meshes | Triangles, unchanged |
| --- | ---: | ---: | ---: |
| Schoolyard | 91 | 62 | 48,866 |
| Garden | 85 | 58 | 80,250 |
| Museum | 96 | 42 | 12,762 |
| Sample character, Piper | 40 | 29 | 19,134 |

Mesh counts describe scene objects; actual per-frame draw calls depend on visibility and shadow passes. Across the three detailed arenas, mesh count fell by 40.4%. A direct comparison of four character variants against the original build matched every rendered vertex position, palette color and roughness within 0.000001; the maximum observed numerical difference was about 2.13e-8.

Browser checks exercised Auto and High graphics, zoom, number entry, camera capture with drawing-buffer preservation disabled, smoke and cooldowns, repeated arena starts, and disposal on leaving. The disposal regression also verifies instanced GPU buffers and zones disposed during asynchronous shader preparation. Adaptive-rendering tests cover prolonged load, recovery hysteresis, background gaps and 4K/high-DPI pixel limits.

The final two-second Auto-quality garden sample (one human, five bots, 1280 × 720 viewport, 1600 × 900 drawing buffer) measured approximately 57 FPS and a 17.1 ms 95th-percentile frame interval. Frame rates varied with camera position, bots, graphics mode and concurrent local work. These short local checks are not a controlled hardware benchmark or a guarantee of 60 FPS on every device. No controlled production-host latency benchmark was performed. The deployment smoke test is recorded below.

Rendering references: [Three.js renderer and asynchronous compilation](https://threejs.org/docs/pages/WebGLRenderer.html), [geometry batching](https://threejs.org/manual/pages/optimize-lots-of-objects.html).

## Known limits

This validates a playable local prototype. The 20-client test is not a distributed latency/performance benchmark. No internet hosting, production anti-cheat, or public load testing was performed. Procedural artwork is intentionally simpler than the supplied references. Docker packaging is supplied but was not executed in this environment.

Vite reports a size advisory for the separately loaded Three.js engine chunk (~515 kB minified, ~131 kB gzip); the arena detail modules remain separate (~3 kB each). This advisory does not fail the build.

![Optimized lobby](screenshots/optimized-lobby.jpg)

![Optimized gameplay](screenshots/optimized-gameplay.jpg)


## Production deployment smoke test

Published October 11, 2026 to https://outnumbered-henna.vercel.app (deployment `dpl_4EdpEm74YuL3qryu3hZNGbGqVYPt`). Vercel completed the production build, including WASM compilation and TypeScript checking.

- The public lobby loaded with zero WebGL canvases and only the application shell plus module-preload helper scripts; no game-engine request before Play.
- The hosted `/api/health` returned HTTP 200 with `ok: true`.
- A real browser joined the production WebSocket server and entered a garden practice match with one human and five bots.
- The arena, equipment, match timer and bot updates rendered. No browser warnings or errors were captured during the smoke test.
- The test session was left normally and the lobby restored.

![Deployed gameplay](screenshots/deployed-gameplay.jpg)
