# Procedural graphics refresh — 22 October 2026

This pass uses the existing character skill sheet and the modeling principles in
[img2threejs](https://github.com/img2threejs/img2threejs), particularly its
[character guidance](https://github.com/img2threejs/img2threejs/blob/main/grimoire/character/reconstruction.md).
It is a direct refinement of the game's procedural models, not an execution of
the repository's reconstruction pipeline or a completed conversion of the concept sheets.

## Implemented

- Batched character geometry now carries each source material's roughness into the shader. Skin, eyes, hair and matte cloth retain distinct finishes without additional draw calls.
- Cloth has a subtle procedural weave, faded out when threads become smaller than pixels to avoid distant shimmer. No downloaded textures are needed.
- Upper and lower eyelids, eye catchlights, softer facial shading, and knee folds improve close-up details.
- Root-space torso reshaping now respects rotated and scaled meshes. This repairs the floating collar caused by applying a vertical stretch before the collar rotation.
- A single-draw sky adds a blue-to-horizon gradient and a warm sun halo aligned with the directional light. It follows camera rotation without translation and renders at far depth without writing depth.
- Flag cloth has a four-square cream emblem, a darker hem, and a continuous wave with a pinned hoist. Pole, collision, carrier state, and pickup rules are unchanged.

## Validation and limits

Production build and TypeScript checks pass. The existing full suite passed (6 WASM and 28 TypeScript tests); after refinements, targeted avatar/world/graphics checks passed, including three new regression checks. Browser inspection covered the character studio and garden CTF practice, with no captured console errors. Twelve character fixtures remain below the existing limits of 20 meshes and 18,000 triangles. This is not a 20-player GPU benchmark. Vite still reports the existing Three.js chunk-size advisory.

The reference sheets remain a higher-fidelity art target: this pass does not deliver photorealistic heads, skinned GLB models, or all proposed animation clips. Target sizes, movement rules, and sector collision geometry remain as implemented in the game. No deployment was performed.

![Outdoor preview](screenshots/graphics-refresh-gameplay.png)
![Character preview](screenshots/graphics-refresh-character.png)
