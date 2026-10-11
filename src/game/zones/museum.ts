import * as THREE from 'three';
import { WORLD_WALLS } from '../../shared/world';
import { box, floor, mesh, sign, standard, tiledMaterial, zoneResult } from './common';

function painting(parent: THREE.Object3D, x: number, y: number, z: number, angle: number, seed: number) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = angle;
  parent.add(group);
  const gold = standard(0xd0ac65, 0.45);
  box(group, 0, 0, 0, 2.05, 1.55, 0.09, gold);
  box(group, 0, 0, 0.053, 1.87, 1.37, 0.025, standard(0xe8dfc2));
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 384;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = ['#c38b63', '#668987', '#b49c79'][((seed % 3) + 3) % 3];
  ctx.fillRect(0, 0, 512, 384);
  ctx.fillStyle = '#e5c98d';
  ctx.beginPath();
  ctx.arc(360, 98, 53, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#314e4c';
  ctx.beginPath();
  ctx.moveTo(0, 340);
  ctx.lineTo(125, 96);
  ctx.lineTo(316, 384);
  ctx.fill();
  ctx.fillStyle = '#debb8f';
  ctx.beginPath();
  ctx.moveTo(160, 384);
  ctx.lineTo(331, 187);
  ctx.lineTo(512, 350);
  ctx.lineTo(512, 384);
  ctx.fill();
  ctx.fillStyle = '#e6d9b8';
  ctx.fillRect(29, 31, 99, 11);
  ctx.fillRect(29, 50, 66, 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  mesh(group, new THREE.PlaneGeometry(1.72, 1.22), new THREE.MeshStandardMaterial({ map: tex }), 0, 0, 0.071);
}

function vase(parent: THREE.Object3D, x: number, y: number, z: number, scale: number, color: number) {
  const points = [[0.2, 0], [0.25, 0.08], [0.21, 0.16], [0.48, 0.4], [0.52, 0.72], [0.42, 1.02], [0.23, 1.22], [0.23, 1.38], [0.32, 1.42]].map(p => new THREE.Vector2(p[0] * scale, p[1] * scale));
  mesh(parent, new THREE.LatheGeometry(points, 24), standard(color, 0.52), x, y, z);
  const gold = standard(0xd5a957, 0.55);
  for (const yy of [0.2, 1.16]) {
    const band = mesh(parent, new THREE.TorusGeometry((yy < 1 ? 0.255 : 0.275) * scale, 0.015 * scale, 6, 24), gold, x, y + yy * scale, z);
    band.rotation.x = Math.PI / 2;
  }
  for (const side of [-1, 1]) {
    const handle = mesh(parent, new THREE.TorusGeometry(0.23 * scale, 0.046 * scale, 6, 16, Math.PI * 1.15), standard(color, 0.65), x + side * 0.32 * scale, y + 1.02 * scale, z);
    handle.rotation.z = side < 0 ? Math.PI * 0.43 : -Math.PI * 0.57;
    handle.scale.set(0.7, 1, 1);
  }
}

export function buildZone() {
  const group = new THREE.Group();
  group.name = 'streamed-museum';
  const teal = standard(0x284e4c);
  const trim = standard(0x153c3e);
  const red = standard(0x95675a);
  const gold = standard(0xc9a565, 0.5);
  const cream = standard(0xdad2b6);
  const stone = tiledMaterial('#d6cdb6', '#bab39e', 12, 'tile');
  floor(group, 0, -52, 52, 52, stone);
  floor(group, 0, -52, 16, 51, tiledMaterial('#a57467', '#9a6c61', 11), 0.012);
  floor(group, 0, -52, 51, 9, tiledMaterial('#a57467', '#9a6c61', 11), 0.016);
  for (const wall of WORLD_WALLS.filter(w => w.zone === 'museum')) {
    const { x, z, w, h, d, kind } = wall;
    box(group, x, h / 2, z, w, h, d, kind === 'boundary' ? red : teal);
    const panelHeight = kind === 'boundary' ? 1.9 : Math.min(1.6, h - 0.1);
    box(group, x, panelHeight / 2, z, w + 0.035, panelHeight, d + 0.035, trim);
    for (const yy of [0.12, panelHeight - 0.14, h - 0.14]) box(group, x, yy, z, w + 0.055, 0.035, d + 0.055, gold);
    box(group, x, h + 0.075, z, w + 0.18, 0.15, d + 0.18, cream);
    if (kind === 'display') {
      box(group, x, 0.12, z, w + 0.12, 0.24, d + 0.12, cream);
      if (w > 5) {
        vase(group, x - 2.2, h + 0.15, z, 1, 0xb57245);
        vase(group, x + 2.2, h + 0.15, z, 0.82, 0xb88454);
        const obelisk = mesh(group, new THREE.ConeGeometry(0.59, 1.75, 4), standard(0xabc1b7), x, h + 1.025, z);
        obelisk.rotation.y = Math.PI / 4;
        const emblem = mesh(group, new THREE.TorusGeometry(0.24, 0.025, 8, 24), gold, x, h + 0.92, z + 0.36);
        void emblem;
      } else {
        box(group, x, h + 0.3, z, 0.9, 0.35, 0.9, trim);
        const sculpture = mesh(group, new THREE.TorusKnotGeometry(0.6, 0.13, 80, 10, 2, 3), gold, x, h + 1.3, z);
        sculpture.rotation.x = 0.6;
      }
    }
    if (kind === 'cover' && d > 5) {
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) painting(group, x + side * (w / 2 + 0.07), 2.2, z - 5.5 + i * 5.5, side * Math.PI / 2, i + Math.round(x));
      }
    }
  }

  // Deep coffered ceiling, flush lights, and broad entrances make a distinct second arena.
  box(group, 0, 6.22, -52, 52.5, 0.28, 52.5, standard(0x435351));
  for (let i = -24; i <= 24; i += 4) {
    box(group, i, 6.04, -52, 0.14, 0.25, 52, trim);
    box(group, 0, 6.04, -52 + i, 52, 0.25, 0.14, trim);
  }
  // Only overhead architecture is additional: all walking-level walls share physics geometry.
  box(group, 0, 5.15, -26.08, 52, 1.95, 0.4, red);
  box(group, 0, 4.11, -26.08, 52, 0.12, 0.55, cream);
  sign(group, 'THE NUMBER GALLERY', 0, 5.1, -25.86, 10, 1.03, '#95675a', '#f1db9d');
  const luminous = new THREE.MeshStandardMaterial({ color: 0xffe8b3, emissive: 0xffdca1, emissiveIntensity: 1.2 });
  for (const x of [-18, 0, 18]) {
    for (const z of [-35, -52, -69]) {
      box(group, x, 5.85, z, 1.15, 0.1, 1.15, gold);
      box(group, x, 5.79, z, 0.86, 0.04, 0.86, luminous);
      const light = new THREE.PointLight(0xffdfb0, 28, 23, 2);
      light.position.set(x, 4.7, z);
      group.add(light);
    }
  }
  for (const x of [-25.62, 25.62]) {
    for (const z of [-36, -44, -52, -60, -68]) {
      box(group, x, 3.2, z, 0.13, 0.92, 0.22, gold);
      box(group, x + (x < 0 ? 0.08 : -0.08), 3.2, z, 0.04, 0.65, 0.12, luminous);
      painting(group, x + (x < 0 ? 0.11 : -0.11), 3.42, z + 3.2, x < 0 ? Math.PI / 2 : -Math.PI / 2, Math.abs(z));
    }
  }
  const backSign = sign(group, 'A STUDY IN NUMBERS', 0, 3.7, -77.64, 10, 1.6, '#95675a', '#f5dfaa');
  void backSign;
  for (const [x, z] of [[-10, -43], [10, -61]]) {
    const arch = mesh(group, new THREE.TorusGeometry(0.47, 0.032, 8, 36), gold, x, 2.45, z + 0.07);
    arch.rotation.y = Math.PI / 2;
  }
  return zoneResult(group);
}
