# Reference graphics implementation

The shared in-game and studio avatar builder now uses the four reference outfit combinations: cropped/varsity, ponytail/polo/skirt, swept/polo/trousers, and curly/hoodie/joggers. Player identity still determines appearance independently of changing numbers.

Implemented details include varsity snaps and striped hems, dropped hood volume and seam, polo trim, layered knee-length pleated skirt with opaque shorts, double-striped socks, sneaker stitching and five lace rows, swept hair ridges, dense curls and restrained facial hair. The front-only number surface now compensates for model scale to measure 0.43 � 0.16 metres, with its center held at 1.67 metres during animation.

CTF flags use a sharp four-square motif and stitched border rendered in UV space, metallic pole and weighted base, hoist collars and rounded finial. Existing flag dimensions and gameplay state are preserved.

These are procedural interpretations of the concept PNGs, not reconstructed photorealistic or rigged GLB assets. Environment reference reconstruction and exported humanoid animation clips are not included. Exact concept fidelity still requires authored geometry, textures and rigging.

Validation: production build; avatar geometry, resource disposal, animation and number visibility checks; flag wave checks; local studio render. The quality-first revision intentionally exceeds the former 18,000-triangle budget. The studio reports actual geometry counts; tests retain a 250,000-triangle runaway-geometry guard and a 32-mesh batching guard. This is not a 20-player GPU performance guarantee.


The quality-first revision adds a continuous sculpted face with integrated cheeks, nose and chin, interpolated clothing contours, higher-resolution hands and shoes, tapered hair locks, and studio portrait/turntable controls. Portrait mode hides the number panel only for inspection; match targets remain visible. The models remain stylized procedural artwork.
