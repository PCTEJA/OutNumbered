# C01F runtime character

The game and character studio load `public/characters/c01f-varsity.glb` once before creating avatars. This is the latest C01F Female Varsity draft from `docs/art-direction/v2fun/c01f`.

The imported mesh is normalized to 1.8 metres with feet at ground level. A separate, front-only dynamic number card stays at 1.67 metres; its border carries the team colour. The original textured clothing is preserved. Geometry and textures are shared across players, while materials and number cards are independently disposable.

The source has 499,978 triangles, is approximately 20.9 MB, and has no skeleton or animation clips. Movement currently uses a small whole-body bob, not an articulated walk. Mesh decimation and a proper rig remain necessary for a lighter, fully animated asset.
