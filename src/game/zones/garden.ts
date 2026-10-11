import * as THREE from 'three';
import { WORLD_WALLS } from '../../shared/world';
import { bench, box, floor, mesh, planterPlants, seeded, sign, sphere, standard, tiledMaterial, tree, zoneResult } from './common';

export function buildZone() {
  const group = new THREE.Group();
  group.name = 'streamed-garden';
  const wood = tiledMaterial('#aa8451', '#765e3b', 1, 'grain');
  const darkWood = standard(0x746345);
  const stone = tiledMaterial('#b9b7a2', '#959886', 2, 'stone');
  const coping = standard(0xd5d0b4);
  const soil = standard(0x746847);
  const green = standard(0x6f914a);
  const path = tiledMaterial('#d4c9a5', '#bcb497', 6, 'stone');
  const random = seeded(8142);
  floor(group, 52, 0, 52, 52, tiledMaterial('#7b9555', '#7b9555', 16, 'grain'));
  floor(group, 52, 0, 10, 51, path, 0.011);
  floor(group, 52, 0, 51, 9, path, 0.013);
  floor(group, 52, 0, 16, 16, path, 0.014);
  const centerPath = mesh(group, new THREE.RingGeometry(8, 10, 64), path, 52, 0.015, 0);
  centerPath.rotation.x = -Math.PI / 2;
  centerPath.castShadow = false;

  const animators: ((time: number) => void)[] = [];
  for (const wall of WORLD_WALLS.filter(w => w.zone === 'garden')) {
    const { x, z, w, d, h } = wall;
    if (wall.kind === 'boundary') {
      box(group, x, h / 2, z, w, h, d, wood);
      const longX = w > d;
      const length = Math.max(w, d);
      const count = Math.ceil(length / 0.72);
      const pickets = new THREE.InstancedMesh(new THREE.BoxGeometry(longX ? 0.1 : 0.66, h + 0.14, longX ? 0.66 : 0.1), darkWood, count);
      const dummy = new THREE.Object3D();
      for (let i = 0; i < count; i++) {
        const along = -length / 2 + (i + 0.5) * length / count;
        dummy.position.set(x + (longX ? along : 0), h / 2, z + (longX ? 0 : along));
        if (longX) dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        pickets.setMatrixAt(i, dummy.matrix);
      }
      pickets.castShadow = true;
      group.add(pickets);
      for (const yy of [0.4, 2.35]) box(group, x, yy, z, w + 0.1, 0.17, d + 0.1, darkWood);
      box(group, x, h + 0.075, z, w + 0.16, 0.15, d + 0.16, coping);
      continue;
    }
    if (wall.kind === 'display') {
      box(group, x, 0.65, z, w, 1.3, d, stone);
      box(group, x, 1.35, z, w + 0.09, 0.2, d + 0.09, coping);
      const water = mesh(group, new THREE.CircleGeometry(1.58, 48), new THREE.MeshStandardMaterial({ color: 0x65adb0, roughness: 0.2, metalness: 0.22 }), x, 1.456, z);
      water.rotation.x = -Math.PI / 2;
      mesh(group, new THREE.CylinderGeometry(0.28, 0.45, 0.75, 16), coping, x, 1.77, z);
      mesh(group, new THREE.CylinderGeometry(0.9, 0.5, 0.2, 32), stone, x, 2.15, z);
      sphere(group, x, 2.43, z, 0.18, coping, 2);
      const ripple = mesh(group, new THREE.RingGeometry(0.65, 0.685, 48), new THREE.MeshBasicMaterial({ color: 0xc8ece2, transparent: true, opacity: 0.4, side: THREE.DoubleSide }), x, 1.462, z);
      ripple.userData.dynamic = true;
      ripple.rotation.x = -Math.PI / 2;
      animators.push(time => { const amount = 0.5 + (time * 0.32) % 1.6; ripple.scale.setScalar(amount); (ripple.material as THREE.MeshBasicMaterial).opacity = (2.1 - amount) * 0.24; });
      continue;
    }
    box(group, x, h / 2, z, w, h, d, stone);
    box(group, x, h - 0.035, z, w + 0.07, 0.17, d + 0.07, coping);
    box(group, x, h + 0.063, z, w - 0.2, 0.035, d - 0.2, soil);
    planterPlants(group, x, h + 0.09, z, w - 0.25, d - 0.25, x * 11 + z);
    if (w < 5 && d > 3) tree(group, x, z, 1.1, x * 10, h);
    if (w > 5 && Math.abs(z) === 17) {
      // The timber posts sit inside the planter collision; the canopy spans the path above.
      for (const side of [-1, 1]) {
        box(group, x + side * (w / 2 - 0.22), 2.1, z, 0.23, 4.2, 0.23, wood);
        box(group, x, 4.07, z + side * 1.3, w + 0.7, 0.22, 0.18, darkWood);
      }
      for (let i = 0; i < 15; i++) box(group, x - w / 2 + i * w / 14, 4.25, z, 0.15, 0.16, 3.5, wood);
      for (let i = 0; i < 8; i++) {
        const px = x - w / 2 + i * w / 7;
        const vine = sphere(group, px, 4.32, z + Math.sin(i) * 0.9, 0.58, green, 1);
        vine.scale.set(1.7, 0.4, 1);
        for (let k = 0; k < 3; k++) {
          const leaf = sphere(group, px + 0.16 * Math.sin(k), 3.8 - k * 0.23, z + 1.38, 0.13, green, 0);
          leaf.scale.set(0.85, 1.5, 0.4);
        }
      }
    }
  }

  // Perimeter flowers and trees frame long sightlines without adding hidden blockers.
  for (let i = 0; i < 7; i++) {
    tree(group, 29 + i * 7.5, -29, 1.1 + random() * 0.3, 927 + i);
    tree(group, 29 + i * 7.5, 29, 1.2 + random() * 0.2, 297 + i);
    if (i < 6) tree(group, 81, -21 + i * 8, 1.4, 378 + i);
  }
  for (const z of [-24, 24]) {
    floor(group, 52, z, 44, 1.1, soil, 0.016);
    planterPlants(group, 52, 0.01, z, 44, 1, z + 824);
  }
  for (const [x, z, rotation] of [[35, -24.5, 0], [68, 24.5, Math.PI], [76.8, 5, -Math.PI / 2], [76.8, -5, -Math.PI / 2]]) {
    bench(group, x, z, rotation);
  }
  for (const [x, z, rotation] of [[42, -7.76, Math.PI], [62, 7.76, 0]]) {
    const label = sign(group, 'THE GARDENS', x, 0.91, z, 3.8, 0.6, '#61764a');
    label.rotation.y = rotation;
  }
  const welcome = sign(group, 'TAKE A BREATHER. WATCH YOUR NUMBER.', 52, 2.1, -25.66, 10, 1.1, '#a98451', '#fff1cf');
  void welcome;
  // Decorative stepping stones stay flush to the ground.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const tile = mesh(group, new THREE.CylinderGeometry(0.7, 0.72, 0.025, 6), coping, 52 + side * (9.5 + i * 1.3), 0.018, side * (9 + Math.sin(i * 0.7) * 2));
      tile.rotation.y = i * 0.3;
    }
  }
  return zoneResult(group, time => animators.forEach(animate => animate(time)));
}
