# Character refresh

The playable cast now uses shaped jawlines, eyes with irises and highlights, ears, brows, four hairstyles, and three clothing styles. Varsity jackets have contrast sleeves and zipper/pocket trim; hoodies have cords and curved sewn pockets; polos have folded collars, cuffs and buttons. One ponytail variant wears a pleated skirt with socks. Sneakers have laces, toe caps, heel panels and rubber soles.

Both avatar hands have a palm, four separated curved fingers, an opposed thumb and subtle nails. First-person equipment has independent five-digit grips, including two supporting hands for binoculars. Elbows and knees articulate while walking; idle motion is restrained. Named players retain their appearance when their forehead number changes on respawn.

Static details are baked by material within each rig joint. Forehead cards retain their existing size, forward direction and gameplay sight height. No downloaded character assets or runtime art service is required.

## Inspection

Open `/characters.html` on the local development or production server, or choose **Characters** from the lobby. It renders the actual game models, with rotation, zoom, team colors, walking and detail cameras.

## Checks

- Production build and strict TypeScript check passed.
- Full test suite: 25 passed (6 WASM, 9 server, 4 world/equipment, 6 new avatar tests).
- After final silhouette adjustments, all 10 avatar/world tests passed again.
- Regression coverage includes geometry facing outward, visible forward-only number cards, stable appearance after respawn, finite animation, grounded model scale, independent disposal, and per-character limits of 65 meshes and 40,000 triangles across 12 sampled appearances.
- Browser inspection covered the four studio variants, walking, clothing refinements, equipment grips and practice rendering. No JavaScript errors appeared in the inspected studio or match.

This budget check is not a 20-player GPU benchmark. The existing separately loaded Three.js chunk still triggers Vite's 500 kB advisory.

![Character studio](screenshots/character-studio.jpg)

![First-person hand detail](screenshots/hand-detail.jpg)
