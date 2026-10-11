# OutNumbered

A playable, original browser FPS prototype inspired by the supplied references. Read an opponent’s forehead, type four digits, and press Enter. Features a **real WebAssembly simulation core**, Three.js rendering, streamed procedural environments, and a Node.js authoritative WebSocket server.

## Run locally

Use Node.js **22.12 or newer**.

```sh
npm install
npm run dev
```

Open **http://localhost:5173**. The command builds the WASM core if needed and runs the website and match server together. Pick **Practice with bots** for an immediate match against five bots. A desktop keyboard and mouse are required for the FPS; the lobby is responsive.

Choose **Characters** in the lobby, or open **http://localhost:5173/characters.html**, to inspect the playable cast. The studio includes four hairstyles, varsity jackets, hoodies, polos, a pleated skirt variant, five-digit hands, articulated walking, team colors, and close-up equipment grips. Drag to rotate and use **Face** or **Hands** to inspect the details. The studio uses the same models as matches and is also included in the production build.

For a compiled build:

```sh
npm run build
npm start
```

Open **http://localhost:3001**. This single server serves the built site, WASM binary, and WebSocket connections. Set `PORT` to change the production port. Development uses ports 5173 and 3001.

## Play with friends

1. All players open the same running server.
2. Select **Multiplayer**, choose a mode and starting playground, and leave the room code blank to find/create a public match.
3. The room code appears at the top right while playing. Pause with Esc to click and copy it.
4. Friends select Multiplayer and enter that code. The host’s mode and playground are adopted automatically.

Each room supports **20 players**, with server-enforced capacity. Practice rooms are separate from public matchmaking. A link such as `http://localhost:5173/?room=ABC123` prefills the room code; use your server’s actual address for other devices. Localhost only reaches your own machine. Internet play requires hosting this Node/WebSocket server behind HTTPS/WSS.

## Vercel deployment

Import this repository into Vercel. The checked-in `vercel.json` builds the Vite website and deploys `api/game.ts` as the WebSocket/API entry point. Node.js 22 and Fluid compute are required (Fluid compute is enabled by default on new projects). No environment variables are required.

The Vercel Hobby deployment uses **four-minute rounds** to leave time for results before the 300-second WebSocket connection limit; local and Docker deployments retain five-minute rounds. Return to the lobby to start a new match after a connection closes.

Rooms currently live in server memory. Vercel can route different clients to different instances, so public matchmaking, room listings, and joining friends are **not guaranteed across instances**. This deployment is suitable for trying the prototype and bot practice. Reliable multiplayer at scale requires shared room coordination or a persistent game-server host. See [Vercel's WebSocket lifecycle and state guidance](https://vercel.com/docs/functions/websockets).

## Controls

| Control | Action |
| --- | --- |
| WASD | Move |
| Mouse | Look (drag to look if pointer lock is unavailable) |
| Arrow keys | Alternative look controls |
| Shift | Sprint; consumes recovering stamina |
| 0–9 / numpad | Enter a four-digit number |
| Enter | Submit the number |
| Backspace | Delete a digit |
| F / right mouse | Toggle binocular zoom |
| E | Photograph your view; photo lasts five seconds |
| Q | Cycle flash, smoke, and distract grenades |
| G | Throw selected grenade |
| Tab (hold) | Scoreboard |
| Esc | Release mouse / pause menu |

Your own number is hidden. Correct guesses eliminate eligible opponents within range who are visible or were seen in the last six seconds. Forehead orientation, solid cover, smoke, team membership, spawn protection, and guessing cooldowns are checked by the server. The camera preserves a still image for reading and recall; it does not reveal hidden opponents.

## Included

- **Deathmatch**, **Team Deathmatch**, and **Capture the Flag** with five-minute rounds, scores, respawns, and results.
- Public rooms, shareable codes, and bot practice. No accounts are needed.
- Three connected original environments: **The Schoolyard**, **Garden Party**, and **After Hours**. Playground selection chooses the spawn area; all three remain reachable during play.
- Procedural school buildings, courts, climbing walls, foliage, pergolas, museum exhibits, signs, animated characters, and modeled equipment. The reference screenshots are not embedded as game graphics.
- Binoculars, camera snapshots, flash blindness, persistent smoke that blocks reading, and distraction decoys that attract bots.
- Synthesized audio, stamina, first-person prop movement, elimination effects, a scoreboard, and saved graphics/audio/mouse settings.
- True distance-based imports and GPU resource disposal. The HUD shows resident sectors.

## Architecture and streaming

This is a **hybrid WASM web game**, not a whole engine compiled to one binary. AssemblyScript compiles movement, swept collision, range math, and stamina into `public/wasm/outnumbered.wasm`. Both browser prediction and the authoritative server use that core. TypeScript handles networking, menus, input, and procedural Three.js/WebGL 2 rendering.

The lobby uses lightweight arena images and loads no 3D engine. The renderer and WASM binary are requested only when entering a match. Each detailed arena is a separate module imported as the player approaches; distant detail is disposed while inexpensive silhouettes and all collision bounds remain available. Auto graphics balances resolution and shadows against sustained frame times; High keeps sharper rendering and full-rate shadows. Geometry, textures and character detail are retained in every setting. See [the streaming design](docs/wasm-streaming.md).

```text
assembly/                WebAssembly source
public/wasm/             Compiled binary and readable WAT
src/main.ts              Lobby, dialogs, settings
src/game/game.ts         Client, controls, rendering, HUD
src/game/world.ts        Spatial streaming and lighting
src/game/zones/          Original procedural 3D environments
src/game/avatar.ts       Character meshes, articulated animation, lifecycle
src/game/equipment.ts    Equipment and five-digit first-person grips
src/character-studio.ts  Interactive inspection of the playable models
src/shared/              Map geometry and network protocol
server/index.ts          Match simulation and static hosting
tests/                   WASM, world, and WebSocket integration tests
```

## Validation

```sh
npm run typecheck
npm test
npm run build
```

Tests cover actual WASM collision/stamina behavior, clear spawns and movement, dynamic scene loading/unloading and resource disposal, rendered model geometry, WebSocket capacity, number validation, team rules, gadgets, flag objectives, room invitations, and safe static file serving. Browser checks cover the lobby and first-person play. A 20-client test verifies room connectivity/capacity; it is not a geographic latency or production load benchmark.

## Prototype boundaries

This is a playable foundation, not a finished commercial release. Characters are original procedural stylized meshes with layered clothing, shaped faces and modeled fingers; environments remain simpler than the references. School wings are solid cover; the museum is an explorable interior. Bots use lightweight steering rather than a navmesh. Rooms and results are in memory and disappear on server restart. No accounts, ranked progression, persistence, voice chat, mobile touch controls, or production matchmaking infrastructure are included.

The server validates gameplay, but opponent numbers are sent to connected clients for rendering; a modified client can inspect them. Production anti-cheat would need per-observer visibility replication, authentication, abuse controls, deployment monitoring, and internet latency testing.

Technical references: [Three.js renderer](https://threejs.org/docs/pages/WebGLRenderer.html), [AssemblyScript compiler](https://www.assemblyscript.org/compiler.html).
