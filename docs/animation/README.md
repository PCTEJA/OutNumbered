# Blender character motion

The original C01 and C01F GLBs were single textured meshes with no skin or animation. Blender 5.2 now produces optimized, skinned game assets in `public/characters` using a shared 17-bone humanoid skeleton, region-aware smooth vertex weights, and baked Idle, Walk, and Run clips at 30 fps. The source assets remain unchanged.

Each output has approximately 22,500 triangles (down from approximately 500,000), 1024-pixel textures, and is approximately 3.5 MB. The editable Blender projects are included here. Rebuild with:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' -b --python scripts/build-character-rigs.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' -b --python scripts/review-character-rig.py
```

Locomotion uses a two-link sagittal leg solve with a stance trajectory and lifted swing arc, level-foot compensation, counter-swinging arms and restrained torso motion. These are scripted authored cycles, not motion capture. Fingers and facial expressions are not separately rigged. Further close-up polish would benefit from manual topology, joint placement, weight-painting and directional locomotion.

The game asynchronously loads the models, retaining the procedural avatar on loading failure. Each player has an independent cloned skeleton and animation mixer. Walk/run phase follows interpolated traveled distance and idle weight follows the existing eased gait. Run blending follows measured speed, above the normal 5 m/s walk. The number surface remains front-facing at 1.67 m and team colors are shown by a ground ring. The source jackets retain their original textures.

The studio previews both source characters and all three clips. Tests check exported clip coverage and continuous endpoints, triangle limits, normalized weights, and prevent shoes and fingertips from binding to the wrong limbs. Three.js playback tests sample every clip, check deformation bounds and independent skeletons, and raycast all four digit positions to confirm that the imported mesh cannot hide them. The head bone counters torso movement to keep the forehead board aligned with the fixed number surface. The Blender review render checks exported mesh deformation. Browser visual validation is a separate check; these asset tests do not measure production GPU performance or guarantee perfect foot contact on uneven terrain.
