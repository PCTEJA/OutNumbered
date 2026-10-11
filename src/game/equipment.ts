import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Point = [number, number, number];

function material(color: number, roughness = 0.72, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function part(parent: THREE.Object3D, geometry: THREE.BufferGeometry, mat: THREE.Material, position: Point = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function oval(parent: THREE.Object3D, mat: THREE.Material, position: Point, size: Point) {
  const mesh = part(parent, new THREE.SphereGeometry(1, 16, 12), mat, position);
  mesh.scale.set(...size);
  return mesh;
}

function box(parent: THREE.Object3D, mat: THREE.Material, position: Point, size: Point, radius = 0.012) {
  return part(parent, new RoundedBoxGeometry(...size, 2, radius), mat, position);
}

/** A continuous tapered finger/forearm, with rounded ends and no exposed joint seams. */
function curvedLimb(parent: THREE.Object3D, mat: THREE.Material, points: Point[], startRadius: number, endRadius = startRadius * 0.82) {
  const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)), false, 'centripetal');
  const segments = points.length * 4;
  const geometry = new THREE.TubeGeometry(curve, segments, 1, 10, false);
  const positions = geometry.getAttribute('position');
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const center = curve.getPointAt(t);
    const radius = THREE.MathUtils.lerp(startRadius, endRadius, t);
    for (let j = 0; j <= 10; j++) {
      const index = i * 11 + j;
      positions.setXYZ(index,
        center.x + (positions.getX(index) - center.x) * radius,
        center.y + (positions.getY(index) - center.y) * radius,
        center.z + (positions.getZ(index) - center.z) * radius);
    }
  }
  geometry.computeVertexNormals();
  part(parent, geometry, mat);
  oval(parent, mat, points[0], [startRadius, startRadius, startRadius]);
  oval(parent, mat, points[points.length - 1], [endRadius, endRadius, endRadius]);
}

function sleeve(parent: THREE.Group, side: number, wrist: Point, skin: THREE.Material, cloth: THREE.Material, rib: THREE.Material, stripe: THREE.Material) {
  const elbow: Point = [wrist[0] + side * 0.145, wrist[1] - 0.26, wrist[2] + 0.135];
  const cuff: Point = [wrist[0] + side * 0.046, wrist[1] - 0.083, wrist[2] + 0.043];
  curvedLimb(parent, skin, [wrist, cuff, [cuff[0] + side * 0.028, cuff[1] - 0.045, cuff[2] + 0.022]], 0.043, 0.058);
  curvedLimb(parent, cloth, [cuff, [cuff[0] + side * 0.065, cuff[1] - 0.115, cuff[2] + 0.06], elbow], 0.066, 0.092);
  const axis = new THREE.Vector3(...wrist).sub(new THREE.Vector3(...elbow)).normalize();
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  const cuffBand = part(parent, new THREE.CylinderGeometry(0.067, 0.072, 0.047, 20), rib, cuff);
  cuffBand.quaternion.copy(rotation);
  // Narrow knitted ribs and two cream varsity stripes catch the light at the wrist.
  for (const [offset, radius, mat] of [[0.014, 0.068, stripe], [-0.004, 0.070, stripe], [-0.025, 0.073, rib]] as const) {
    const ring = part(parent, new THREE.TorusGeometry(radius, 0.003, 5, 24), mat);
    ring.position.copy(new THREE.Vector3(...cuff).addScaledVector(axis, offset));
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
  }
}

function fingernail(parent: THREE.Group, mat: THREE.Material, tip: Point, radius: number, rotation = 0) {
  const nail = oval(parent, mat, [tip[0], tip[1] + radius * 0.12, tip[2] + radius * 0.80], [radius * 0.58, radius * 0.70, 0.0025]);
  nail.rotation.z = rotation;
}

function createGrip(kind: string, side: number, skin: THREE.Material, nail: THREE.Material, cloth: THREE.Material, rib: THREE.Material, stripe: THREE.Material) {
  const hand = new THREE.Group();
  hand.name = side > 0 ? 'right-hand' : 'left-hand';
  hand.userData.digitCount = 5;
  const optical = kind === 'binoculars' || kind === 'binocular';
  if (optical) {
    oval(hand, skin, [side * 0.254, -0.041, 0.019], [0.046, 0.068, 0.084]);
    oval(hand, skin, [side * 0.249, -0.085, 0.063], [0.044, 0.045, 0.061]);
    for (let i = 0; i < 4; i++) {
      const z = -0.072 + i * 0.043;
      const radius = [0.020, 0.021, 0.020, 0.017][i];
      curvedLimb(hand, skin, [[side * 0.256, -0.012, z], [side * 0.258, -0.073, z], [side * 0.214, -0.116, z], [side * 0.158, -0.112, z + 0.008], [side * 0.132, -0.083, z + 0.01]], radius);
    }
    const thumbTip: Point = [side * 0.159, 0.066, 0.079];
    curvedLimb(hand, skin, [[side * 0.251, -0.015, 0.082], [side * 0.246, 0.036, 0.094], [side * 0.205, 0.070, 0.096], thumbTip], 0.027, 0.021);
    fingernail(hand, nail, thumbTip, 0.021, side * 0.7);
    sleeve(hand, side, [side * 0.276, -0.107, 0.080], skin, cloth, rib, stripe);
  } else if (kind === 'camera') {
    oval(hand, skin, [0.248, -0.024, 0.017], [0.046, 0.071, 0.061]);
    for (let i = 0; i < 4; i++) {
      const y = 0.059 - i * 0.044;
      curvedLimb(hand, skin, [[0.249, y, 0.033], [0.265, y, -0.018], [0.249, y, -0.079], [0.201, y, -0.104]], i === 3 ? 0.017 : 0.020);
    }
    const thumbTip: Point = [0.143, 0.057, 0.117];
    curvedLimb(hand, skin, [[0.247, -0.035, 0.060], [0.223, 0.007, 0.107], [0.181, 0.046, 0.122], thumbTip], 0.027, 0.020);
    fingernail(hand, nail, thumbTip, 0.020, -0.7);
    sleeve(hand, 1, [0.257, -0.094, 0.055], skin, cloth, rib, stripe);
  } else {
    oval(hand, skin, [0.131, -0.035, 0.016], [0.052, 0.087, 0.047]);
    oval(hand, skin, [0.132, 0.036, 0.052], [0.044, 0.047, 0.039]);
    for (let i = 0; i < 4; i++) {
      const y = 0.045 - i * 0.045;
      const radius = [0.020, 0.022, 0.021, 0.017][i];
      const tip: Point = [0.011 + i * 0.004, y - 0.011, 0.093];
      curvedLimb(hand, skin, [[0.141, y, 0.020], [0.129, y + 0.004, 0.073], [0.085, y, 0.111], [0.039, y - 0.009, 0.111], tip], radius);
      fingernail(hand, nail, tip, radius * 0.8, -0.7);
    }
    const thumbTip: Point = [0.017, 0.105, 0.069];
    curvedLimb(hand, skin, [[0.156, 0.008, 0.042], [0.135, 0.073, 0.061], [0.088, 0.109, 0.080], thumbTip], 0.029, 0.021);
    fingernail(hand, nail, thumbTip, 0.021, -1.15);
    sleeve(hand, 1, [0.153, -0.105, 0.043], skin, cloth, rib, stripe);
  }
  return hand;
}

/** Bake static details by material: detailed fingers do not add a draw call per joint. */
function mergeStaticParts(group: THREE.Group) {
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert();
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const originals: THREE.Mesh[] = [];
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld));
    // Every primitive uses the same attributes; tangents/UVs are unnecessary here.
    for (const attribute of Object.keys(geometry.attributes)) if (attribute !== 'position' && attribute !== 'normal') geometry.deleteAttribute(attribute);
    const entries = batches.get(object.material) ?? [];
    entries.push(geometry);
    batches.set(object.material, entries);
    originals.push(object);
  });
  for (const object of originals) {
    object.geometry.dispose();
    object.removeFromParent();
  }
  for (const [mat, geometries] of batches) {
    const merged = mergeGeometries(geometries);
    if (merged) {
      const mesh = part(group, merged, mat);
      mesh.name = `${group.name}-surface`;
    }
    geometries.forEach(geometry => geometry.dispose());
  }
}

/** First-person prop, with its optical / throwing direction along local -Z. */
export function createEquipment(kind: string, held = true): THREE.Group {
  const group = new THREE.Group();
  group.name = `equipment-${kind}`;
  const prop = new THREE.Group();
  prop.name = kind;
  group.add(prop);
  const teal = material(0x287c78, 0.55, 0.12);
  const dark = material(0x25333b, 0.63);
  const rubber = material(0x172830, 0.92);
  const brass = material(0xe5b34e, 0.39, 0.43);
  const cream = material(0xffecca, 0.63);
  const lens = material(0x58afca, 0.13, 0.7);
  const cylinder = (r: number, length: number, mat: THREE.Material, position: Point, alongZ = true, bottomRadius = r) => {
    const mesh = part(prop, new THREE.CylinderGeometry(r, bottomRadius, length, 24), mat, position);
    if (alongZ) mesh.rotation.x = Math.PI / 2;
    return mesh;
  };
  const optical = kind === 'binoculars' || kind === 'binocular';
  if (optical) {
    for (const side of [-1, 1]) {
      cylinder(0.104, 0.34, teal, [side * 0.14, 0, 0]);
      cylinder(0.122, 0.076, rubber, [side * 0.14, 0, -0.190]);
      cylinder(0.102, 0.008, lens, [side * 0.14, 0, -0.233]);
      cylinder(0.107, 0.012, brass, [side * 0.14, 0, -0.145]);
      cylinder(0.109, 0.022, brass, [side * 0.14, 0, 0.124]);
      cylinder(0.085, 0.076, rubber, [side * 0.14, 0, 0.198]);
      cylinder(0.069, 0.004, lens, [side * 0.14, 0, 0.239]);
      for (let i = 0; i < 4; i++) cylinder(0.088, 0.007, dark, [side * 0.14, 0, 0.172 + i * 0.017]);
      box(prop, brass, [side * 0.14, 0.103, -0.001], [0.049, 0.006, 0.085], 0.003);
    }
    box(prop, dark, [0, -0.014, 0.027], [0.22, 0.07, 0.15]);
    cylinder(0.037, 0.082, brass, [0, 0.044, 0.065]);
    for (let i = 0; i < 5; i++) cylinder(0.039, 0.007, dark, [0, 0.044, 0.04 + i * 0.013]);
  } else if (kind === 'camera') {
    box(prop, teal, [0, 0, 0], [0.43, 0.27, 0.18], 0.027);
    box(prop, dark, [0, 0.117, 0], [0.422, 0.067, 0.185], 0.017);
    box(prop, rubber, [0.172, -0.012, 0.019], [0.09, 0.195, 0.173], 0.025);
    cylinder(0.107, 0.103, dark, [0, 0, -0.137]);
    cylinder(0.110, 0.014, brass, [0, 0, -0.175]);
    cylinder(0.088, 0.021, rubber, [0, 0, -0.194]);
    cylinder(0.076, 0.006, lens, [0, 0, -0.208]);
    box(prop, cream, [-0.13, 0.073, -0.105], [0.085, 0.048, 0.018], 0.007);
    cylinder(0.025, 0.021, brass, [0.145, 0.159, 0], false);
    box(prop, dark, [-0.035, -0.015, 0.097], [0.224, 0.148, 0.01], 0.01);
    box(prop, lens, [-0.035, -0.012, 0.104], [0.197, 0.121, 0.006], 0.005);
    for (const y of [-0.04, 0.005, 0.050]) oval(prop, brass, [0.112, y, 0.102], [0.01, 0.01, 0.003]);
  } else {
    const body = kind === 'flash' || kind === 'flashbang' ? brass : kind === 'distract' ? material(0xe97d55, 0.59, 0.08) : teal;
    cylinder(0.092, 0.31, body, [0, 0, 0], false);
    for (const y of [-0.153, 0.153]) {
      cylinder(0.101, 0.042, dark, [0, y, 0], false);
      cylinder(0.097, 0.010, rubber, [0, y + Math.sign(y) * 0.024, 0], false);
    }
    cylinder(0.073, 0.020, dark, [0, 0.183, 0], false);
    box(prop, rubber, [-0.067, -0.009, 0.059], [0.025, 0.210, 0.045], 0.007);
    box(prop, dark, [0.078, 0.051, -0.017], [0.038, 0.235, 0.041], 0.008);
    const pin = part(prop, new THREE.TorusGeometry(0.039, 0.006, 8, 24), brass, [0.019, 0.224, 0]);
    pin.rotation.y = Math.PI / 2;
    if (kind === 'flash' || kind === 'flashbang') {
      const bolt = new THREE.Shape();
      bolt.moveTo(0.02, 0.103);
      bolt.lineTo(-0.041, -0.009);
      bolt.lineTo(-0.005, -0.009);
      bolt.lineTo(-0.024, -0.103);
      bolt.lineTo(0.043, 0.023);
      bolt.lineTo(0.006, 0.023);
      bolt.closePath();
      part(prop, new THREE.ShapeGeometry(bolt), cream, [-0.013, 0, 0.094]);
    } else if (kind === 'smoke') {
      for (let i = 0; i < 3; i++) oval(prop, cream, [-0.015 + Math.sin(i * 2.5) * 0.013, -0.049 + i * 0.048, 0.091], [0.027, 0.036, 0.005]);
    } else {
      for (let i = 0; i < 3; i++) part(prop, new THREE.TorusGeometry(0.016 + i * 0.014, 0.004, 5, 20), cream, [-0.01, 0, 0.095]);
    }
  }
  mergeStaticParts(prop);
  // Discard material variants which this prop does not use.
  const used = new Set<THREE.Material>();
  prop.traverse(object => { if (object instanceof THREE.Mesh) used.add(object.material as THREE.Material); });
  for (const mat of [teal, dark, rubber, brass, cream, lens]) if (!used.has(mat)) mat.dispose();
  if (held) {
    const skin = material(0xe8b294, 0.66);
    const nail = material(0xf1cab4, 0.48);
    const cloth = material(0x416f99, 0.91);
    const rib = material(0x294b67, 0.97);
    const stripe = material(0xe9debd, 0.89);
    for (const side of optical ? [-1, 1] : [1]) {
      const hand = createGrip(kind, side, skin, nail, cloth, rib, stripe);
      group.add(hand);
      mergeStaticParts(hand);
    }
    const lift = optical ? 0.16 : kind === 'camera' ? 0.14 : 0.12;
    for (const child of group.children) child.position.y += lift;
  }
  group.userData = { kind, held, handCount: held ? optical ? 2 : 1 : 0 };
  return group;
}
