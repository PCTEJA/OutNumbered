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
  const position = geometry.attributes.position;
  const color = new THREE.Color(team === 'red' ? 0xe95746 : 0x528bd7);
  const cream = new THREE.Color(0xffedc7);
  const colors: number[] = [];
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i);
    const emblem = Math.abs(x) < .17 && Math.abs(y) < .18 && Math.abs(x) > .025 && Math.abs(y) > .025;
    const hem = Math.abs(y) > .30 || x > .50;
    const c = emblem ? cream : color.clone().multiplyScalar(hem ? .78 : 1);
    colors.push(c.r, c.g, c.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  // Include all animated positions in the culling bounds.
  geometry.computeBoundingSphere();
  geometry.boundingSphere!.radius += .12;
  const cloth = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: .88, side: THREE.DoubleSide,
  }));
  cloth.name = 'flag-cloth';
  cloth.position.set(.55, 2.25, 0);
  cloth.castShadow = cloth.receiveShadow = true;
  return cloth;
}
