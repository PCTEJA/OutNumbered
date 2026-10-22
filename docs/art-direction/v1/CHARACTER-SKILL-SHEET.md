# OutNumbered — character and environment production handoff

Version 1 · 22 October 2026 · Concept artwork and proposed modeling specification

Open [the visual gallery](index.html) to review all nine sheets. These are new art targets for later image-to-3D conversion, not implemented game models. This document is the character skill sheet: a reusable production brief for that later workflow, not an installed Codex skill. Exact generation prompts are in [PROMPTS.md](PROMPTS.md).

## Source of truth

The game is a nonlethal observation, recall and number-entry FPS with Deathmatch, Team Deathmatch and Capture the Flag. All appearances share abilities. Do not invent character classes or stat advantages. Source references: `src/game/avatar.ts`, `src/game/equipment.ts`, `src/game/game.ts`, `src/shared/world.ts`, and `src/game/zones/`. Paths in this paragraph are repository-relative.

The current cast is procedurally combined from four hairstyles, three outfits and five skin tones; it is not four fixed named heroes. C01–C04 are proposed art exemplars of that system, not literal reconstructions of the four numbered studio presets. Identity remains stable when a number changes. The art direction raises material and anatomy quality while retaining sports streetwear, adult proportions, uncovered foreheads and existing team palettes.

## Asset inventory

| ID | File | Purpose |
| --- | --- | --- |
| C01 | [01-character-cropped-varsity.png](01-character-cropped-varsity.png) | Swept/cropped hair, varsity jacket, trousers; neutral construction views |
| C02 | [02-character-ponytail-polo.png](02-character-ponytail-polo.png) | Ponytail, polo, pleated athletic skirt and opaque undershorts |
| C03 | [03-character-curly-hoodie.png](03-character-curly-hoodie.png) | Close curls, hoodie with hood down, joggers |
| C04 | [04-character-swept-polo.png](04-character-swept-polo.png) | Sculpted swept hair, polo and tapered trousers |
| F01 | [05-team-flags.png](05-team-flags.png) | Both team colors, cloth flat views, hardware, cloth motion |
| E01 | [06-schoolyard.png](06-schoolyard.png) | Schoolyard architecture, court, cover, bench and tree kit |
| E02 | [07-garden-party.png](07-garden-party.png) | Garden planters, fountain, pergola, fence and planting kit |
| E03 | [08-after-hours.png](08-after-hours.png) | Museum partition, display, ceramic, frame and lighting kit |
| M01 | [09-movement-and-grips.png](09-movement-and-grips.png) | Shared movement and hand-contact guidance |

## Reconstruction rules and known image discrepancies

Use the written measurements here and the current gameplay source before any image label. AI concept sheets are appearance guides, not CAD or guaranteed consistent orthographic projections.

- Forehead plates in the art are too small for current gameplay. Build a separate front-only display surface **0.43 m wide × 0.16 m high**, with its center at **1.67 m above ground** in the neutral pose. Current frame dimensions are 0.438 × 0.169 × 0.018 m. Fit the adult head beneath it; never shrink the target to match the drawing. Render the changing four-digit number dynamically, not in the skin texture. No rear number, hair overlap, glare or cloth deformation on this display.
- The flag sheet prints diameter symbols against values that were intended as radii. Correct pole **radius 0.035 m, diameter 0.07 m**; base maximum **radius 0.7 m, diameter 1.4 m**. Use the written dimensions below, including the larger base, even where the art looks narrower.
- C02's illustration has a shorter skirt than the requested knee-length direction. Final garment should end near the knee, retain the illustrated pleat construction and opaque fitted undershorts, and pass sprint deformation tests. Remove face wisps that can cross the panel. Tighten the ponytail silhouette to avoid excessive transparency cost.
- Side-view LEFT/RIGHT captions are not anatomical rig names. Resolve facing from the actual nose direction and assign left/right bones in the character's local frame. Front and back A-poses are authoritative for bind pose; side poses relax the arms and must be reconciled before reconstruction.
- M01 is a pose guide only. It changes trouser detail and does not show a complete or distinct contact/passing walk cycle. Preserve C01 clothing and construct the full cycle specified below. Remove incidental camera branding; use the game's equipment design and verified grip dimensions.
- Environment images include richer planting, different architectural massing, decorative steps and a round fountain. They do not replace the level plan. Keep existing collision footprints and flat walkable ground; decorative steps must not create inaccessible routes. Fit the garden fountain to the current square 3.5 × 3.5 m display footprint and solid 1.45 m cover envelope, rather than replacing it with the illustrated low round basin.
- Material swatches are color/finish references, not ready-to-tile textures. Do not bake photographed light or scene shadows into albedo. Museum lighting needs an in-game readability pass; the mood image alone is not evidence of fair visibility.

## Shared character construction

Export one character per GLB. Units are metres; +Y up; character faces local +Z; root origin is on the ground between the feet. Preserve the existing 1.65 m player eye height and 0.38 m collision radius. Fit the neutral forehead center to 1.67 m, then validate the entire silhouette against gameplay. A roughly 1.8 m total height is an art target, not a reason to move the target plate or camera. All four characters use the same gameplay capsule and target dimensions.

Use a relaxed A-pose, straight but unlocked knees, separated feet and fingers, closed relaxed mouth. Build eyelids, a shaped nose, ears and a coherent scalp beneath hair. Model five fingers per hand, with opposed thumbs; do not merge gripping fingers into the prop. Retopologize shoulders, elbows, hips, knees and fingers for deformation. Separate shoes at the ankle and keep garment volume outside the skin at bend zones.

Separate meshes/materials: Body, Eyes, Hair, UpperCloth, LowerCloth, Shoes, NumberFrame, NumberDisplay. Clothing team masks change only the designated upper garment and small coordinated accents: blue #304e70, red #8b3933. Preserve skin/hair identity for both teams. The game currently has no added shape-based team system; adding one later is a design choice, not established behavior.

Proposed browser targets, subject to profiling: 12–18k triangles for LOD0, 6–9k LOD1, 2–4k LOD2; 4–6 material slots where feasible, sharing cloth atlases and skin resources. Keep the number display independent and legible at every LOD. Use up to 2K shared body/clothing textures and a separate dynamic number texture; reserve extra detail for first-person hands. These are budgets, not measured performance claims. Retain existing sector streaming/disposal for scenery.

## Rig and where movement belongs

One compatible humanoid skeleton for all four characters:

`Root → Hips → Spine → Chest → Neck → Head`

`Chest → Clavicle_L/R → UpperArm_L/R → Forearm_L/R → Hand_L/R → finger chains`

`Hips → Thigh_L/R → Shin_L/R → Foot_L/R → Toe_L/R`

Root follows server movement and yaw. Hips and spine supply subtle weight shifts. The number plate and its frame are rigid children of Head, not skin-weighted cloth. Any head tilt or bob must remain compatible with server visibility checks: verify current target alignment before adding free head-look. Do not introduce independent large head rotations that expose or hide a target the server considers differently.

| Area | Animate | Constraint |
| --- | --- | --- |
| Hips/spine/chest | Gait weight transfer, breathing, modest sprint lean | Keep collider authoritative; no accumulating translation in clips |
| Clavicles/shoulders | Arm swing, prop raising, throw preparation | Keep shoulder volume; avoid jacket collapse |
| Elbows/wrists | Flexion and grip alignment | No unnatural backward elbows or forearm twist |
| Fingers/thumbs | Independent grip curls and shutter press | Five digits; firm prop contact, no penetration |
| Hips/knees/ankles/toes | Alternating stride, knee lift, toe roll | Ground contacts must not slide |
| Ponytail | 2–3 optional spring bones rooted behind head | Small damped follow-through; never cross number display |
| Skirt | 4–6 optional hem joints with thigh-aware weights | Preserve undershorts coverage; avoid leg penetration |
| Hoodie cords/hood | Optional minimal secondary follow-through | Hood stays down; never obscures head or target |
| Face | Optional blink and restrained expression | No distracting speech or number-covering accessories |

## Animation clip contract

These are proposed asset clips for later integration, not a claim that all exist in the current renderer. Locomotion is in-place: the WASM/server movement remains authoritative. Use actual traveled distance for gait phase and fade to idle at rest. Current movement speeds are **5 m/s** normally and **8 m/s** sprinting. The normal movement is brisk; adapt cadence/stride rather than letting a slow illustrated walk slide at 5 m/s.

| Clip | Suggested length | Movement and contact |
| --- | --- | --- |
| Idle | 3–4 s loop | Chest expansion, tiny pelvis shift; feet planted and head target steady |
| MoveForward | 0.65–0.85 s loop | Contact L → down → passing → up → contact R → down → passing → up; opposing arms |
| MoveBackward | 0.8–1 s loop | Shorter backward steps, grounded balance; don't merely reverse every forward curve |
| StrafeLeft / StrafeRight | 0.7–0.9 s loop | Lateral hip/ankle push, torso and number face aim direction; avoid tangled feet |
| SprintForward | 0.5–0.65 s loop | Greater hip extension, knee recovery, bent elbows, modest chest lean |
| TurnLeft / TurnRight | 0.35–0.6 s | Reposition feet under root yaw; don't twist planted knees through 180 degrees |
| BinocularRaise / Hold / Lower | 0.3 s / loop / 0.25 s | Two hands cup barrels; eyes align with eyepieces; forehead remains visible |
| CameraRaise / Hold / Shutter / Lower | 0.3 s / loop / 0.12 s / 0.25 s | Right index presses shutter, left supports; additive upper-body layer |
| GadgetThrow | 0.55–0.75 s | Anticipation → release → follow-through; right palm socket releases on the actual gameplay event |
| Eliminate / Respawn | 0.4–0.6 s / 0.4–0.6 s | Brief non-graphic dissolve/resolve suggestion; no long corpse collision |

Timing is an authoring starting point. Do not delay a server-authorized gadget to match a prettier animation; align the clip or release timing to the event. Blend locomotion over roughly 0.12–0.2 s, keep hands on equipment through IK when supported, and reuse one skeleton/clip library across outfits. At zero movement, clamp gait rather than cycling feet.

There is no authoritative jump or crouch system in this brief. Space currently produces a cosmetic camera hop; do not build vaulting, climbing or elevated navigation from that. Climbing holds in the Schoolyard are decoration.

Sockets: NumberSocket under Head; Grip_R under Hand_R; Grip_L under Hand_L; CameraSocket and BinocularSocket with per-prop contact transforms. Keep first-person hand/equipment rig distinct from the full-body rig. A proposed FlagCarrySocket behind the shoulder may be added later, but current flags follow the carrier's world position with a +0.5 m vertical offset and are hidden from the carrier. Socket-based carrying requires explicit integration and visibility validation; it is not already supported.

## Flag construction and motion

F01 uses identical geometry for both teams. Pole 2.7 m tall, radius 0.035 m. Cloth 1.1 × 0.65 m, centered locally at (0.55, 2.25, 0). Base height 0.14 m, lower radius 0.7 m, upper radius 0.6 m; base center y=0.07 m. Use current bright flag colors red #e95746 and blue #528bd7. The four-square cream motif is a proposed original visual emblem; it does not represent a player number.

Separate Pole, Cloth, Base meshes. Pole and base stay rigid. Cloth hoist edge x=0 is pinned; amplitude increases toward x=1.1. Use a subdivided plane, a small bone chain or a vertex shader; about 12×6 segments is a starting point. Suggested free-edge amplitude: 0.03–0.06 m calm, 0.08–0.14 m breeze, at most 0.2 m carrying. Use continuous phase, gentle damping and double-sided cloth; avoid high-frequency flapping or cloth passing through the pole. Hardware remains static. The current implementation rotates the entire cloth slightly; vertex deformation is a proposed upgrade.

Keep gameplay pickup, drop, return, capture and carrier state server-controlled. Cloth never becomes collision or occlusion logic. For a later carried version, leave the base at the stand and attach only pole/cloth; do not change that state model while merely importing the art.

## Environments: placement and allowed movement

The three sectors remain connected and **52 × 52 m** each. Campus center (0,0), garden center (52,0), museum center (0,-52), stated as world (x,z). Use `WORLD_WALLS` and `SPAWNS` in `src/shared/world.ts` as the geometry/collision authority. Preserve the existing inter-sector openings and spawn escape routes. No new collision based on picturesque furniture placement.

| Sheet | Build as modules | Allowed animation | Stay rigid |
| --- | --- | --- | --- |
| E01 Schoolyard / campus | Facade bay, solid climbing-cover walls, court decals, bench, trees | Small leaf/upper-branch sway; root weights zero | Walls, trunks, benches, court, buildings |
| E02 Garden Party / garden | Stone planter shells, fountain, pergola, fence, bench, leaf clusters | Ripple UV/normal animation, restrained water streams, leaf tips | Fountain bowl, planters, pergola beams, fence and collision |
| E03 After Hours / museum | Solid partitions, opaque display plinths, frames, amphora, benches, fixtures | Optional subtle cosmetic dust only, default off | Exhibits, cases, walls, fixtures; steady illumination |

Suggested canopy displacement 0.02–0.06 m at outer tips and leaf displacement below 0.03 m. Reduce or disable expensive secondary motion with distance. Leaves must not become unreliable moving cover. Keep the real occluding solids visually explicit. No strobe lights or moving shadows that routinely conceal the number target.

Model environment modules individually with pivot at bottom center or an explicit grid corner; name the choice. Facade details and vegetation should fit within current solid footprints. Separate decorative meshes from collision proxies. Do not reconstruct an entire beauty panorama into one baked mesh. Use repeated modules/instances and shared materials, not thousands of unique leaf draw calls.

## Ready-to-use image-to-3D instruction

“Create ONE game-ready asset using the selected neutral construction sheet from OutNumbered art-direction v1. Treat CHARACTER-SKILL-SHEET.md as authoritative for scale, geometry, movement and known image corrections. Use the front view as identity anchor and reconcile the other views; do not reconstruct labels, multiple people, swatches, arrows, background or contact shadows. Keep separate deforming meshes, rigid accessories and dynamic number display. Export a clean metre-scale GLB, +Y up, +Z forward, with named materials, meshes, pivots and the requested compatible rig. Use M01 only after neutral geometry is resolved, as animation intent rather than geometry evidence. Provide a neutral preview and a deformation preview before integration.”

If the conversion service takes only one image, use an isolated neutral view from C01–C04, or one isolated prop from E01–E03. Do not give it a whole multi-view board unless it explicitly supports that format. Image-to-3D may need manual retopology, UV correction, rigging and texture cleanup; these PNGs do not guarantee rig-ready output.

## Acceptance checklist for the later modeling stage

1. Confirm identity across front/back/sides; reconcile asymmetric hair and clothing; check five fingers and thumbs.
2. Measure ground origin, scale, forehead center and plate dimensions in engine. Check red and blue materials on every character.
3. Inspect shoulder, elbow, hip, knee, skirt and grip deformation at extreme poses. Check all walk contacts and loop seams.
4. Confirm numbers change on respawn without changing identity; remain front-only, readable, and consistent with server visibility at all LODs.
5. Verify flag dimensions, hoist pinning, free-edge motion, base behavior and carrier visibility.
6. Compare world module footprints against current collision boxes; preserve spawn routes and sector connections.
7. Profile the assembled 20-player scene and streaming/disposal lifecycle before claiming an FPS gain or production readiness.

No gameplay files were changed as part of this reference pack.
