import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Wall } from '../../shared/world';

export interface ZoneBuild {
  group: THREE.Group;
  tick?: (time: number) => void;
  dispose: () => void;
}

export function standard(color: THREE.ColorRepresentation, roughness = 0.88) {
  const material = new THREE.MeshStandardMaterial({ color, roughness });
  material.userData.staticPalette = `${material.color.getHex()}/${roughness}`;
  return material;
}

export function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

export function box(parent: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material) {
  return mesh(parent, new THREE.BoxGeometry(w, h, d), mat, x, y, z);
}

export function sphere(parent: THREE.Object3D, x: number, y: number, z: number, radius: number, mat: THREE.Material, detail = 1) {
  return mesh(parent, new THREE.IcosahedronGeometry(radius, detail), mat, x, y, z);
}

export function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function tiledMaterial(base: string, line: string, repeat: number, style: 'tile' | 'stone' | 'grain' = 'tile') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const random = seeded(917);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  if (style === 'tile' || style === 'stone') {
    for (let row = 0; row < 4; row++) {
      for (let col = -1; col < 4; col++) {
        const offset = style === 'stone' && row % 2 ? 32 : 0;
        ctx.fillStyle = random() > 0.5 ? `rgba(255,255,240,${random() * 0.065})` : `rgba(55,45,35,${random() * 0.045})`;
        ctx.fillRect(col * 64 + offset, row * 64, 64, 64);
        ctx.strokeStyle = line;
        ctx.lineWidth = style === 'stone' ? 3 : 1.4;
        ctx.strokeRect(col * 64 + offset, row * 64, 64, 64);
      }
    }
  }
  for (let i = 0; i < 5500; i++) {
    ctx.fillStyle = random() > 0.5 ? 'rgba(255,252,220,.032)' : 'rgba(55,40,30,.025)';
    ctx.fillRect(random() * 256, random() * 256, style === 'grain' ? 2 + random() * 24 : 1 + random() * 3, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.93 });
}

export function floor(parent: THREE.Object3D, x: number, z: number, w: number, d: number, material: THREE.Material, y = 0.006) {
  const object = mesh(parent, new THREE.PlaneGeometry(w, d), material, x, y, z);
  object.rotation.x = -Math.PI / 2;
  object.castShadow = false;
  return object;
}

export function sign(parent: THREE.Object3D, text: string, x: number, y: number, z: number, width: number, height: number, color = '#244b44', textColor = '#fff3ce') {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1024, 256);
  ctx.strokeStyle = textColor;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 5;
  ctx.strokeRect(15, 15, 994, 226);
  ctx.globalAlpha = 1;
  ctx.font = '800 88px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = textColor;
  ctx.fillText(text, 512, 132, 930);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return mesh(parent, new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85 }), x, y, z);
}

export function building(parent: THREE.Object3D, wall: Wall, palette?: { cream?: THREE.Material; trim?: THREE.Material; roof?: THREE.Material; glass?: THREE.Material }) {
  const { x, z, w, d, h } = wall;
  const cream = palette?.cream || standard(0xeadfc1);
  const trim = palette?.trim || standard(0xd17850);
  const roof = palette?.roof || standard(0x405654);
  const glass = palette?.glass || standard(0x729b9c, 0.35);
  box(parent, x, h / 2, z, w, h, d, cream);
  box(parent, x, 0.55, z, w + 0.045, 1.1, d + 0.045, trim);
  box(parent, x, h + 0.09, z, w + 0.35, 0.18, d + 0.35, roof);
  box(parent, x, 1.18, z, w + 0.07, 0.09, d + 0.07, cream);
  if (wall.kind !== 'building') return;
  const frame = standard(0xc8c6b0);
  for (const side of [-1, 1]) {
    for (let dx = -w / 2 + 1.35; dx < w / 2 - 0.6; dx += 2.4) {
      for (let yy = 2.45; yy < h - 0.8; yy += 2.4) {
        box(parent, x + dx, yy, z + side * (d / 2 + 0.024), 1.76, 1.5, 0.07, frame);
        box(parent, x + dx, yy, z + side * (d / 2 + 0.065), 1.55, 1.29, 0.015, glass);
        box(parent, x + dx, yy, z + side * (d / 2 + 0.084), 0.055, 1.32, 0.018, frame);
        box(parent, x + dx, yy - 0.12, z + side * (d / 2 + 0.086), 1.56, 0.055, 0.018, frame);
        box(parent, x + dx, yy - 0.82, z + side * (d / 2 + 0.08), 1.93, 0.1, 0.28, cream);
      }
    }
    for (let dz = -d / 2 + 1.6; dz < d / 2 - 0.7; dz += 2.55) {
      for (let yy = 2.45; yy < h - 0.8; yy += 2.4) {
        box(parent, x + side * (w / 2 + 0.025), yy, z + dz, 0.07, 1.5, 1.76, frame);
        box(parent, x + side * (w / 2 + 0.065), yy, z + dz, 0.02, 1.28, 1.55, glass);
        box(parent, x + side * (w / 2 + 0.084), yy, z + dz, 0.018, 1.3, 0.055, frame);
      }
    }
  }
  // Roof furniture reinforces the school-campus silhouette without adding traversable solids.
  box(parent, x + w * 0.22, h + 0.58, z - d * 0.15, 1.6, 0.9, 1.4, standard(0xa6b4ab));
  box(parent, x + w * 0.22, h + 1.07, z - d * 0.15, 1.75, 0.13, 1.55, roof);
}

/** Sculpted leaves are instanced, so a whole tree uses only a few draw calls. */
export function tree(parent: THREE.Object3D, x: number, z: number, scale = 1, seed = 2, y = 0) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.scale.setScalar(scale);
  parent.add(group);
  const random = seeded(seed);
  const bark = standard(0x887455);
  const trunk = mesh(group, new THREE.CylinderGeometry(0.18, 0.38, 3.6, 7), bark, 0, 1.8, 0);
  trunk.rotation.z = 0.05;
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + 0.6;
    const branch = mesh(group, new THREE.CylinderGeometry(0.075, 0.17, 1.8, 6), bark, Math.cos(angle) * 0.38, 3, Math.sin(angle) * 0.38);
    branch.rotation.z = Math.cos(angle) * -0.4;
    branch.rotation.x = Math.sin(angle) * 0.4;
  }
  const colors = [new THREE.Color(0x718a42), new THREE.Color(0x8ba04e), new THREE.Color(0x506f3c), new THREE.Color(0xa5b762)];
  const foliage = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), standard(0xffffff), 22);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 22; i++) {
    const theta = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * 1.7;
    dummy.position.set(Math.cos(theta) * radius, 3.9 + random() * 1.35 - radius * 0.22, Math.sin(theta) * radius);
    dummy.scale.set(0.7 + random() * 0.58, 0.65 + random() * 0.65, 0.7 + random() * 0.6);
    dummy.rotation.set(random(), random(), random());
    dummy.updateMatrix();
    foliage.setMatrixAt(i, dummy.matrix);
    foliage.setColorAt(i, colors[i % colors.length]);
  }
  foliage.castShadow = true;
  foliage.receiveShadow = true;
  group.add(foliage);
  return group;
}

export function planterPlants(parent: THREE.Object3D, x: number, y: number, z: number, w: number, d: number, seed: number, flowers = true) {
  const random = seeded(seed);
  const count = Math.max(8, Math.floor(w * d * 2));
  const leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.3, 0), standard(0x65904d), count);
  const blooms = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.115, 1), standard(0xffffff), count);
  const colors = [new THREE.Color(0xe8b94f), new THREE.Color(0xc6b0e5), new THREE.Color(0xf9eccf), new THREE.Color(0xe99670)];
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const px = x + (random() - 0.5) * Math.max(0.1, w - 0.3);
    const pz = z + (random() - 0.5) * Math.max(0.1, d - 0.3);
    dummy.position.set(px, y + 0.16, pz);
    dummy.scale.set(1, 0.7 + random() * 0.9, 1);
    dummy.rotation.set(0, random() * 6, 0);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
    dummy.position.y += 0.2;
    dummy.scale.set(1, 0.45, 1);
    dummy.updateMatrix();
    blooms.setMatrixAt(i, dummy.matrix);
    blooms.setColorAt(i, colors[i % colors.length]);
  }
  leaves.castShadow = true;
  parent.add(leaves);
  if (flowers) parent.add(blooms);
  else { blooms.geometry.dispose(); (blooms.material as THREE.Material).dispose(); }
}

export function bench(parent: THREE.Object3D, x: number, z: number, angle = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = angle;
  parent.add(group);
  const wood = standard(0xbf8f52);
  const metal = standard(0x405451);
  for (const xx of [-0.85, 0.85]) {
    box(group, xx, 0.3, 0, 0.09, 0.6, 0.55, metal);
    box(group, xx, 0.72, -0.23, 0.065, 0.78, 0.08, metal);
  }
  for (let i = 0; i < 4; i++) box(group, 0, 0.62, -0.24 + i * 0.16, 2.1, 0.07, 0.125, wood);
  for (let i = 0; i < 3; i++) box(group, 0, 0.8 + i * 0.14, -0.26, 2.1, 0.11, 0.055, wood);
  return group;
}

export function flag(parent: THREE.Object3D, x: number, z: number, color: number, height = 3.8) {
  const metal = standard(0xddd6b7, 0.5);
  mesh(parent, new THREE.CylinderGeometry(0.036, 0.04, height, 10), metal, x, height / 2, z);
  sphere(parent, x, height + 0.025, z, 0.07, standard(0xe9be63), 1);
  const fabric = mesh(parent, new THREE.PlaneGeometry(1.1, 0.64, 12, 5), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.95 }), x + 0.59, height - 0.38, z);
  fabric.userData.flagOrigin = Array.from(fabric.geometry.attributes.position.array);
  return (time: number) => {
    const attr = fabric.geometry.attributes.position;
    const initial = fabric.userData.flagOrigin as number[];
    for (let i = 0; i < attr.count; i++) {
      const xx = initial[i * 3];
      attr.setZ(i, Math.sin(xx * 5 + time * 3.3 + x) * 0.12 * (xx + 0.55));
    }
    attr.needsUpdate = true;
    fabric.geometry.computeVertexNormals();
  };
}

export function zoneResult(group: THREE.Group, tick?: (time: number) => void): ZoneBuild {
  // Repeated benches, branches and trim use identical palette entries. Sharing
  // within this zone lets them batch while preserving independent zone disposal.
  const palette = new Map<string, THREE.Material>();
  const replaced = new Set<THREE.Material>();
  group.traverse(child => {
    if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) return;
    const material = child.material;
    const key = material.userData.staticPalette as string | undefined;
    if (!key) return;
    const shared = palette.get(key);
    if (shared && shared !== material) { child.material = shared; replaced.add(material); }
    else palette.set(key, material);
  });
  replaced.forEach(material => material.dispose());
  // Collapse architectural details by material once, keeping animated flags and
  // instanced foliage separate. Hundreds of windows become a handful of draws.
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert();
  const batches = new Map<string, THREE.Mesh[]>();
  group.traverse(child => {
    if (!(child instanceof THREE.Mesh) || child instanceof THREE.InstancedMesh || child.userData.flagOrigin || child.userData.dynamic || Array.isArray(child.material)) return;
    if (!child.geometry.attributes.uv) return;
    const key = `${child.material.uuid}/${child.castShadow}/${child.receiveShadow}`;
    const batch = batches.get(key) || [];
    batch.push(child);
    batches.set(key, batch);
  });
  for (const batch of batches.values()) {
    if (batch.length < 2) continue;
    const geometries = batch.map(original => {
      const geometry = original.geometry.index ? original.geometry.toNonIndexed() : original.geometry.clone();
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, original.matrixWorld));
      return geometry;
    });
    const merged = mergeGeometries(geometries, false);
    geometries.forEach(geometry => geometry.dispose());
    if (!merged) continue;
    const combined = new THREE.Mesh(merged, batch[0].material);
    combined.castShadow = batch[0].castShadow;
    combined.receiveShadow = batch[0].receiveShadow;
    group.add(combined);
    batch.forEach(original => { original.removeFromParent(); original.geometry.dispose(); });
  }
  // Architectural transforms never change; animated fabrics and ripples still do.
  group.traverse(child => {
    if (child.userData.dynamic || child.userData.flagOrigin) return;
    child.updateMatrix();
    child.matrixAutoUpdate = false;
  });
  return {
    group,
    tick,
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      const textures = new Set<THREE.Texture>();
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (child instanceof THREE.InstancedMesh) child.dispose();
          geometries.add(child.geometry);
          for (const mat of Array.isArray(child.material) ? child.material : [child.material]) {
            materials.add(mat);
            if ('map' in mat && mat.map instanceof THREE.Texture) textures.add(mat.map);
          }
        }
      });
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
      textures.forEach(t => t.dispose());
      group.removeFromParent();
    },
  };
}
