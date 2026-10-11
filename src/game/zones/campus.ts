import * as THREE from 'three';
import { WORLD_WALLS } from '../../shared/world';
import { bench, box, building, floor, mesh, planterPlants, sign, sphere, standard, tiledMaterial, tree, zoneResult } from './common';

/** All substantial architecture is generated from the shared collision geometry. */
export function buildZone() {
  const group = new THREE.Group();
  group.name = 'streamed-campus';
  const cream = standard(0xf0e3c3);
  const terracotta = standard(0xcc805a);
  const teal = standard(0x3d8c85);
  const yellow = standard(0xe6b84e);
  const dark = standard(0x405951);
  const white = standard(0xffefc7);
  const wood = standard(0xb08a52);
  const palette = { cream, trim: terracotta, roof: dark, glass: standard(0x79a3a4, 0.4) };
  floor(group, 0, 0, 52, 52, tiledMaterial('#c49077', '#b48069', 11));
  floor(group, 0, 0, 23, 47, tiledMaterial('#d4c9ac', '#bfb798', 8), 0.009);
  floor(group, 0, 0, 47, 13, tiledMaterial('#d4c9ac', '#bfb798', 8), 0.012);

  for (const wall of WORLD_WALLS.filter(w => w.zone === 'campus')) {
    building(group, wall, palette);
    if (wall.kind === 'cover' && wall.w > 3 && wall.d > 3) {
      box(group, wall.x, wall.h + 0.008, wall.z, wall.w - 0.25, 0.025, wall.d - 0.25, standard(0x655c40));
      planterPlants(group, wall.x, wall.h, wall.z, wall.w - 0.15, wall.d - 0.15, wall.x + 99);
      tree(group, wall.x, wall.z, 1.25, wall.x + 405, wall.h);
    }
    if (wall.kind === 'cover' && wall.d > 5) {
      // Teal-and-saffron climbing panels are original geometry, including physical holds.
      for (const side of [-1, 1]) {
        const face = new THREE.Group();
        face.position.set(wall.x + side * (wall.w / 2 + 0.042), 0.78, wall.z);
        face.rotation.y = side * Math.PI / 2;
        group.add(face);
        box(face, 0, 0, 0, 7.6, 1.22, 0.035, teal);
        const triangle = new THREE.BufferGeometry();
        triangle.setAttribute('position', new THREE.Float32BufferAttribute([-3.8, -0.61, 0.025, 3.8, -0.61, 0.025, -3.8, 0.61, 0.025], 3));
        triangle.computeVertexNormals();
        mesh(face, triangle, new THREE.MeshStandardMaterial({ color: 0xe6b84e, side: THREE.DoubleSide }));
        for (const xx of [-3.83, 3.83]) box(face, xx, 0, 0.03, 0.1, 1.39, 0.12, wood);
        for (const yy of [-0.64, 0.64]) box(face, 0, yy, 0.03, 7.75, 0.1, 0.12, wood);
        for (let i = 0; i < 10; i++) {
          const hold = sphere(face, -3.25 + i * 0.7, (i % 2 ? -0.23 : 0.23), 0.055, 0.1, i % 3 ? terracotta : yellow, 0);
          hold.scale.set(1.35, 0.72, 0.45);
        }
      }
    }
  }

  // A playable multipurpose court anchors the central courtyard.
  floor(group, 0, 0, 14.1, 20.2, standard(0x497f81), 0.023);
  floor(group, 0, -6.8, 5.7, 6.5, standard(0xd18a5d), 0.025);
  floor(group, 0, 6.8, 5.7, 6.5, standard(0xd18a5d), 0.025);
  const stripe = (x: number, z: number, w: number, d: number) => floor(group, x, z, w, d, white, 0.03);
  stripe(0, 0, 13.5, 0.07);
  for (const side of [-1, 1]) {
    stripe(side * 6.75, 0, 0.07, 19.5);
    stripe(0, side * 9.75, 13.5, 0.07);
    stripe(0, side * 3.55, 5.7, 0.065);
    for (const xx of [-2.85, 2.85]) stripe(xx, side * 6.65, 0.065, 6.2);
    const freeThrow = mesh(group, new THREE.RingGeometry(2.16, 2.22, 48), white, 0, 0.032, side * 3.55);
    freeThrow.rotation.x = -Math.PI / 2;
    freeThrow.castShadow = false;
  }
  const center = mesh(group, new THREE.RingGeometry(2.15, 2.22, 64), white, 0, 0.032, 0);
  center.rotation.x = -Math.PI / 2;
  center.castShadow = false;
  const centerLogo = sign(group, '01', 0, 0.034, 0, 1.65, 1.25, '#497f81', '#f9e9c0');
  centerLogo.rotation.x = -Math.PI / 2;

  // Wall-mounted hoops introduce familiar scale and stay inside existing solid cover.
  for (const side of [-1, 1]) {
    const z = side * 12;
    box(group, 0, 2.1, z, 0.1, 1.4, 0.1, dark);
    box(group, 0, 3.02, z - side * 0.22, 2, 1.12, 0.09, white);
    const target = sign(group, '□', 0, 3.03, z - side * 0.275, 0.66, 0.55, '#ffefc7', '#cc805a');
    if (side > 0) target.rotation.y = Math.PI;
    const ring = mesh(group, new THREE.TorusGeometry(0.32, 0.025, 6, 24), terracotta, 0, 2.77, z - side * 0.63);
    ring.rotation.x = Math.PI / 2;
    for (let n = 0; n < 8; n++) {
      const theta = n / 8 * Math.PI * 2;
      const net = mesh(group, new THREE.CylinderGeometry(0.007, 0.007, 0.42, 4), white, Math.cos(theta) * 0.255, 2.57, z - side * 0.63 + Math.sin(theta) * 0.255);
      net.rotation.z = Math.cos(theta) * 0.15;
    }
  }

  const school = sign(group, 'OUTNUMBERED HIGH', -12.93, 3.12, -17, 7.8, 1.5);
  school.rotation.y = Math.PI / 2;
  const notice = sign(group, 'READ. TYPE. REPEAT.', 12.93, 2.65, 17, 6.8, 1.35, '#e2b54f', '#344e48');
  notice.rotation.y = -Math.PI / 2;
  const courtSign = sign(group, 'THE COURTYARD', 0, 2.05, 25.66, 7, 1.2);
  courtSign.rotation.y = Math.PI;
  const gallerySign = sign(group, 'GALLERY  ↑', -7.7, 2.16, -25.65, 4, 0.7, '#244b44');
  const gardenSign = sign(group, 'GARDENS  →', 25.64, 2.1, 9.1, 4, 0.7, '#244b44');
  gardenSign.rotation.y = -Math.PI / 2;
  void gallerySign;

  // Roof details and planting are outside the navigation surface.
  for (const [x, z, s] of [[-23, -21, 0.85], [23, 21, 0.8], [-23, 21, 0.9], [23, -21, 0.85]]) {
    tree(group, x, z, s, x * z + 777, x * z > 0 ? 6.7 : 5.7);
  }
  for (let i = 0; i < 7; i++) {
    tree(group, -29 - (i % 2), -23 + i * 8, 1.35 + (i % 3) * 0.12, 701 + i);
    tree(group, -22 + i * 8, 30, 1.3 + (i % 2) * 0.23, 812 + i);
  }
  bench(group, -25.02, 6, Math.PI / 2);
  bench(group, 25.02, -7, -Math.PI / 2);
  // Small decorative chalk hopscotch in an outer lane.
  for (let i = 0; i < 6; i++) {
    const tile = sign(group, String(i + 1), -8.8 + (i % 2) * 0.9, 0.036, 17.7 + i * 0.8, 0.76, 0.66, '#d4c9ac', '#fdf0c8');
    tile.rotation.x = -Math.PI / 2;
  }
  return zoneResult(group);
}
