import * as THREE from 'three';

/** A pinned hoist and continuous cloth wave; independent of gameplay state. */
export function animateFlag(cloth: THREE.Mesh, time: number) {
  const position = cloth.geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const u = (position.getX(i) + .55) / 1.1;
    const y = position.getY(i);
    position.setZ(i, u * (.085 * Math.sin(u * 7 - time * 2.8 + y * 2)
      + .025 * Math.sin(u * 14 - time * 4.1)));
  }
  position.needsUpdate = true;
  cloth.geometry.computeVertexNormals();
}

export function createFlagCloth(team: 'red' | 'blue') {
  const geometry = new THREE.PlaneGeometry(1.1, .65, 20, 8);
  // Include all animated positions in the culling bounds.
  geometry.computeBoundingSphere();
  geometry.boundingSphere!.radius += .12;
  const cloth = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: team === 'red' ? 0xe95746 : 0x528bd7, roughness: .88, side: THREE.DoubleSide,
  }));
  // Render the stitched motif in UV space: sharp edges independent of cloth tessellation.
  cloth.material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec2 vFlagUv;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlagUv = uv;');
    shader.fragmentShader = 'varying vec2 vFlagUv;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec2 p = abs(vFlagUv - 0.5);
      vec2 aa = fwidth(vFlagUv);
      vec2 outer = 1.0 - smoothstep(vec2(.155, .255) - aa, vec2(.155, .255) + aa, p);
      vec2 inner = smoothstep(vec2(.022, .036) - aa, vec2(.022, .036) + aa, p);
      float emblem = outer.x * outer.y * inner.x * inner.y;
      float border = smoothstep(.482, .49, max(p.x, p.y));
      float seam = (1.0 - smoothstep(.001, .003, abs(max(p.x, p.y) - .474)))
        * step(.45, fract((vFlagUv.x + vFlagUv.y) * 160.0));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.91, .84, .67), max(emblem, border));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.78, .70, .53), seam * .65);
    `);
  };
  cloth.material.customProgramCacheKey = () => 'reference-flag-stitch-v1';
  cloth.name = 'flag-cloth';
  cloth.position.set(.55, 2.25, 0);
  cloth.castShadow = cloth.receiveShadow = true;
  return cloth;
}

/** Reference F01: machined pole, safe finial, pinned hoist collars and weighted foot. */
export function createFlagHardware() {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xc9bea3, metalness: .72, roughness: .32 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x292c2c, roughness: .9 });
  const add = (geometry: THREE.BufferGeometry, y: number, mat = metal) => {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.y = y;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  };
  add(new THREE.CylinderGeometry(.035, .035, 2.7, 16), 1.35);
  add(new THREE.SphereGeometry(.052, 12, 8), 2.72);
  add(new THREE.CylinderGeometry(.6, .7, .14, 32), .07);
  add(new THREE.CylinderGeometry(.695, .695, .018, 32), .012, rubber);
  add(new THREE.CylinderGeometry(.074, .09, .10, 16), .19);
  for (const y of [1.945, 2.555]) add(new THREE.CylinderGeometry(.046, .046, .07, 16), y);
  return group;
}
