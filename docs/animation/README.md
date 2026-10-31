# Blender character motion

The original C01 and C01F GLBs were single textured meshes with no skin or animation. Blender 5.2 now produces optimized, skinned game assets in `public/characters` using a shared 17-bone humanoid skeleton, region-aware smooth vertex weights, and baked Idle, Walk, and Run clips at 30 fps. The source assets remain unchanged.

The outputs have 31,982 (C01) and 31,998 (C01F) triangles, approximately 9,500 more per character than the previous exports, with 1024-pixel textures and GLBs under 4 MB. Source geometry is welded before decimation while preserving per-loop UVs. This prevents the independently simplified UV islands that previously caused facial/body cracks. The build rejects non-manifold surfaces, and exported assets are tested for closed geometry and matching skin weights across UV seams. The editable Blender projects are included here. Rebuild with:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' -b --python scripts/build-character-rigs.py
python scripts/build-team-jackets.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' -b --python scripts/review-character-rig.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' -b --python scripts/review-team-jackets.py
```

Locomotion uses a two-link sagittal leg solve with a stance trajectory and lifted swing arc, level-foot compensation, counter-swinging arms and restrained torso motion. These are scripted authored cycles, not motion capture. Fingers and facial expressions are not separately rigged. Further close-up polish would benefit from manual topology, joint placement, weight-painting and directional locomotion.

The game asynchronously loads the models, retaining the procedural avatar on loading failure. Each player has an independent cloned skeleton and animation mixer. Walk/run phase follows interpolated traveled distance and idle weight follows the existing eased gait. Run blending follows measured speed, above the normal 5 m/s walk. The number surface remains front-facing at 1.67 m and team colors are shown by a ground ring. Team-specific jacket textures preserve cream sleeves and fabric shading. Their masks include the upper shoulders and collar, replace blue chroma fully, and extend into UV gutters to prevent old-color bleed. The texture script requires Pillow and NumPy and checks upper-shoulder texels for residual blue. The original source GLBs remain unchanged; game GLBs and editable Blender projects are rebuilt together. The team review script renders front/back lineups and close-ups of both faces and rear shoulders.

The studio previews both source characters and all three clips. Tests check exported clip coverage and continuous endpoints, triangle limits, normalized weights, and prevent shoes and fingertips from binding to the wrong limbs. Three.js playback tests sample every clip, check deformation bounds and independent skeletons, and raycast all four digit positions to confirm that the imported mesh cannot hide them. The head bone counters torso movement to keep the forehead board aligned with the fixed number surface. The Blender review render checks exported mesh deformation. Browser visual validation is a separate check; these asset tests do not measure production GPU performance or guarantee perfect foot contact on uneven terrain.

