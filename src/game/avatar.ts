import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
export { createEquipment } from './equipment';

type Team = 'red' | 'blue';
type Point = [number, number, number];
const skinTones = [0xf1c5a7, 0xc98d68, 0xe4ae86, 0x98603e, 0x704530];
const material = (color: number, roughness = 0.82) => new THREE.MeshStandardMaterial({ color, roughness });

function part(geometry: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function ellipsoid(parent: THREE.Object3D, mat: THREE.Material, p: Point, size: Point, segments = 16) {
  const mesh = part(new THREE.SphereGeometry(1, segments, 10), mat, parent, ...p);
  mesh.scale.set(...size);
  return mesh;
}

/** Smooth continuous elliptical sections, used for tailored clothes and anatomy. */
function profile(parent: THREE.Object3D, mat: THREE.Material, rings: [number, number, number, number?][], segments = 24) {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  rings.forEach(([y, rx, rz, centerZ = 0], row) => {
    for (let i = 0; i <= segments; i++) {
      const angle = i / segments * Math.PI * 2;
      positions.push(Math.sin(angle) * rx, y, Math.cos(angle) * rz + centerZ);
      uv.push(i / segments, row / (rings.length - 1));
      if (row && i) {
        const a = row * (segments + 1) + i, b = a - segments - 1;
        if (rings[rings.length - 1][0] > rings[0][0]) indices.push(a, a - 1, b, b, a - 1, b - 1);
        else indices.push(a, b, a - 1, b, b - 1, a - 1);
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return part(geometry, mat, parent);
}

function curve(parent: THREE.Object3D, mat: THREE.Material, points: Point[], radius: number, segments = 10) {
  return part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), segments, radius, 7, false), mat, parent);
}

/** Bake detail per joint and surface finish, preserving palette colors per vertex. */
function batchJoint(root: THREE.Object3D) {
  const palette = new Map<number, THREE.MeshStandardMaterial>();
  const replaced = new Set<THREE.Material>();
  function bake(joint: THREE.Object3D) {
    for (const child of [...joint.children]) if (!(child instanceof THREE.Mesh)) bake(child);
    const batches = new Map<number, THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[]>();
    for (const child of joint.children) {
      if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshStandardMaterial) || child.userData.keepSeparate) continue;
      const meshes = batches.get(child.material.roughness) ?? [];
      meshes.push(child as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>);
      batches.set(child.material.roughness, meshes);
    }
    for (const [roughness, meshes] of batches) {
      const geometries = meshes.map(mesh => {
        mesh.updateMatrix();
        const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrix);
        const flat = geometry.index ? geometry.toNonIndexed() : geometry;
        if (flat !== geometry) geometry.dispose();
        const colors = new Float32Array(flat.attributes.position.count * 3);
        const { r, g, b } = mesh.material.color;
        for (let i = 0; i < colors.length; i += 3) { colors[i] = r; colors[i + 1] = g; colors[i + 2] = b; }
        flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        return flat;
      });
      const merged = mergeGeometries(geometries, false)!;
      geometries.forEach(geometry => geometry.dispose());
      meshes.forEach(mesh => { replaced.add(mesh.material); mesh.geometry.dispose(); joint.remove(mesh); });
      let mat = palette.get(roughness);
      if (!mat) {
        mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness, vertexColors: true });
        palette.set(roughness, mat);
      }
      part(merged, mat, joint);
    }
  }
  bake(root);
  replaced.forEach(mat => mat.dispose());
}

function numberTexture(number: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff1be';
  ctx.fillRect(0, 0, 512, 192);
  ctx.strokeStyle = '#c6a76e';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 504, 184);
  ctx.fillStyle = '#242c2a';
  ctx.font = '900 150px Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(number, 256, 107);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function identitySeed(identity: string) {
  let seed = 2166136261;
  for (let i = 0; i < identity.length; i++) seed = Math.imul(seed ^ identity.charCodeAt(i), 16777619);
  return seed >>> 0;
}

function createHand(parent: THREE.Object3D, skin: THREE.Material, nail: THREE.Material, side: number) {
  const hand = new THREE.Group();
  hand.name = side < 0 ? 'left-hand' : 'right-hand';
  hand.userData.digits = ['thumb', 'index', 'middle', 'ring', 'little'];
  parent.add(hand);
  // Palm width lies across Z, with a slight relaxed curl toward the body.
  ellipsoid(hand, skin, [0, -0.035, 0], [0.029, 0.052, 0.046]);
  const lengths = [0.067, 0.076, 0.071, 0.054];
  for (let i = 0; i < 4; i++) {
    const z = 0.031 - i * 0.021;
    const y = -0.066 + (i === 3 ? 0.009 : 0);
    const length = lengths[i];
    curve(hand, skin, [[0, y, z], [-side * 0.003, y - length * .47, z + .004], [-side * .012, y - length * .88, z + .012]], .0095, 6);
    ellipsoid(hand, skin, [-side * .012, y - length * .88, z + .012], [.01, .013, .01], 10);
    ellipsoid(hand, nail, [side * .001, y - length * .77, z + .013], [.003, .013, .0065], 8);
  }
  curve(hand, skin, [[0, -.012, .031], [-side * .015, -.037, .066], [-side * .022, -.063, .068]], .014, 7);
  ellipsoid(hand, skin, [-side * .022, -.063, .068], [.013, .015, .013], 10);
  return hand;
}

/** Original stylized cast, with a +Z face and the gameplay forehead at 1.67m. */
export function createAvatar(number: string, team: Team, name = ''): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  // A respawn replaces the number, not the person's appearance.
  const seed = name ? identitySeed(name) : Number(number) || 1;
  const hairstyle = seed % 4, outfit = Math.floor(seed / 4) % 3;
  const ponytail = hairstyle === 1;
  const skirtOutfit = ponytail && outfit === 2;
  const skinColor = skinTones[Math.floor(seed / 7) % skinTones.length];
  const skin = material(skinColor, .72);
  const skinShade = material(new THREE.Color(skinColor).multiplyScalar(.72).getHex());
  const nail = material(new THREE.Color(skinColor).lerp(new THREE.Color(0xffe2d0), .26).getHex(), .55);
  const cloth = material(team === 'red' ? 0xc94e42 : 0x346ba8);
  const clothShade = material(team === 'red' ? 0x9f3a35 : 0x284d79);
  const cream = material(0xf1e5cd);
  const pants = material(outfit === 1 ? 0x3a4b53 : 0x293e51);
  const seam = material(0x61717a);
  const rubber = material(0xf1e8d6, .9);
  const shoe = material(0x233340, .65);
  const hair = material([0x32251f, 0x452b20, 0x211f26, 0x745035][Math.floor(seed / 3) % 4], .78);
  const hairHighlight = material(new THREE.Color(hair.color).lerp(new THREE.Color(0x91755c), .15).getHex());
  const eye = material(0x22272b, .38);
  const whites = material(0xfff8e9, .48);
  const iris = material(seed % 2 ? 0x6a7253 : 0x765139, .4);
  const root = new THREE.Group();
  root.name = 'body-rig';
  group.add(root);

  // The torso is a tapered garment with actual shoulder, waist and hem shapes.
  profile(root, cloth, [[.79, .147, .105], [.82, .174, .118], [.91, .169, .117], [1.08, .193, .126], [1.19, .219, .126], [1.23, .176, .111], [1.28, .099, .083], [1.29, .07, .072]]);
  profile(root, clothShade, [[.788, .149, .106], [.80, .175, .12], [.829, .176, .12]]);
  profile(root, pants, [[.71, .132, .09], [.75, .161, .106], [.799, .158, .106]]);
  part(new THREE.CylinderGeometry(.061, .071, .14, 16), skin, root, 0, 1.302, 0);
  const collar = part(new THREE.TorusGeometry(.08, .017, 8, 24), cream, root, 0, 1.281, 0);
  collar.rotation.x = Math.PI / 2;

  if (outfit === 0) {
    // Varsity jacket: contrasting sleeves, zipper, ribbed hem, welt pockets.
    curve(root, cream, [[0, .824, .123], [0, 1.08, .134], [0, 1.248, .1]], .006, 12);
    part(new THREE.BoxGeometry(.014, .025, .01), rubber, root, .008, 1.195, .132);
    for (const side of [-1, 1]) {
      curve(root, clothShade, [[side * .083, .86, .107], [side * .117, .937, .106]], .014, 4);
      curve(root, cream, [[side * .083, .86, .122], [side * .117, .935, .122]], .004, 4);
    }
    const badge = part(new THREE.CircleGeometry(.03, 5), cream, root, -.1, 1.137, .12);
    badge.rotation.z = Math.PI;
    part(new THREE.BoxGeometry(.009, .032, .008), cloth, root, -.1, 1.137, .126);
  } else if (outfit === 1) {
    // Hoodie: neck roll, hanging cords, inset kangaroo pocket and stitched edge.
    ellipsoid(root, clothShade, [0, 1.225, -.09], [.137, .074, .067]);
    for (const side of [-1, 1]) {
      curve(root, cream, [[side * .052, 1.265, .071], [side * .062, 1.17, .127], [side * .055, 1.11, .137]], .0045, 10);
      part(new THREE.CylinderGeometry(.006, .006, .022, 8), rubber, root, side * .055, 1.101, .137);
    }
    const pocketGeometry = new THREE.PlaneGeometry(1, 1, 16, 4);
    const pocketPosition = pocketGeometry.attributes.position;
    for (let i = 0; i < pocketPosition.count; i++) {
      const y = .891 + (pocketPosition.getY(i) + .5) * .092;
      const width = .102 - Math.max(0, y - .912) * .43;
      const x = pocketPosition.getX(i) * 2 * width;
      // Dense sections follow the torso curve; a flat polygon intersects the shirt.
      const rx = y < .91 ? .174 - (y - .82) * .0556 : .169 + (y - .91) * .1412;
      const rz = y < .91 ? .118 - (y - .82) * .0111 : .117 + (y - .91) * .0529;
      pocketPosition.setXYZ(i, x, y, rz * Math.sqrt(1 - (x / rx) ** 2) + .004);
    }
    pocketGeometry.computeVertexNormals();
    part(pocketGeometry, clothShade, root);
    curve(root, cloth, [[-.09, .902, .109], [0, .897, .13], [.09, .902, .109]], .0025, 10);
  } else {
    // A crisp polo, with a real folded collar and small button placket.
    for (const side of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(side * .008, 1.265); shape.lineTo(side * .079, 1.289);
      shape.lineTo(side * .114, 1.234); shape.lineTo(side * .039, 1.199); shape.closePath();
      part(new THREE.ExtrudeGeometry(shape, { depth: .01, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .004, bevelThickness: .003 }), cream, root, 0, 0, .09);
    }
    part(new THREE.BoxGeometry(.03, .092, .01), clothShade, root, 0, 1.188, .132);
    for (const y of [1.208, 1.172]) ellipsoid(root, cream, [0, y, .143], [.005, .005, .003], 8);
  }

  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.505;
  root.add(head);
  // A shaped jaw and cheeks prevent the old sphere-on-a-stick silhouette.
  profile(head, skin, [[-.213, .035, .045, .018], [-.199, .098, .10, .022], [-.158, .151, .145, .014], [-.083, .191, .18], [.005, .207, .187], [.096, .202, .18, -.009], [.17, .167, .144, -.02], [.218, .102, .087, -.023], [.238, .001, .001, -.025]], 28);
  for (const side of [-1, 1]) {
    ellipsoid(head, skin, [side * .204, -.03, -.006], [.037, .057, .034]);
    ellipsoid(head, skinShade, [side * .224, -.028, .016], [.012, .031, .012], 12);
    ellipsoid(head, skin, [side * .224, -.035, .025], [.011, .018, .009], 10);
    ellipsoid(head, whites, [side * .075, -.01, .176], [.037, .04, .017]);
    ellipsoid(head, iris, [side * .072, -.014, .19], [.020, .026, .008], 14);
    ellipsoid(head, eye, [side * .071, -.012, .198], [.011, .019, .005], 12);
    ellipsoid(head, whites, [side * .071 - .005, -.003, .203], [.0045, .006, .003], 8);
    curve(head, hair, [[side * .035, .062, .179], [side * .072, .072, .179], [side * .114, .057, .16]], .009, 8);
    curve(head, skinShade, [[side * .038, -.047, .174], [side * .075, -.058, .176], [side * .11, -.046, .165]], .003, 7);
  }
  ellipsoid(head, skin, [0, -.062, .189], [.034, .047, .037]);
  ellipsoid(head, skinShade, [-.016, -.086, .209], [.006, .003, .006], 8);
  ellipsoid(head, skinShade, [.016, -.086, .209], [.006, .003, .006], 8);
  curve(head, skinShade, [[-.057, -.122, .156], [-.026, -.137, .166], [.014, -.14, .169], [.05, -.123, .16]], .004, 12);
  curve(head, skin, [[-.03, -.149, .16], [0, -.154, .164], [.03, -.146, .161]], .005, 8);

  // Hair cap with a lower nape, high forehead and shaped sideburns.
  const hairGeometry = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const hp = hairGeometry.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i);
    const front = Math.max(0, z), back = Math.max(0, -z);
    hp.setXYZ(i, x * .214, .025 + y * .249 + (1 - y) * (.128 * front - .143 * back), z * .199 - .025);
  }
  hairGeometry.computeVertexNormals();
  part(hairGeometry, hair, head);
  for (const side of [-1, 1]) {
    const sideburn = ellipsoid(head, hair, [side * .193, .013, -.025], [.025, .083, .062]);
    sideburn.rotation.z = side * -.15;
  }
  if (hairstyle === 0 || hairstyle === 2) {
    // Swept quiff, with ridges that follow a consistent comb direction.
    for (let i = 0; i < 4; i++) {
      const lock = ellipsoid(head, i === 2 ? hairHighlight : hair, [-.098 + i * .049, .226 + Math.sin(i * .7) * .017, .047], [.073, .061, .12], 18);
      lock.rotation.z = -.37; lock.rotation.x = -.22;
    }
    if (hairstyle === 2) {
      curve(head, hair, [[-.147, .195, .081], [-.181, .135, .104], [-.181, .072, .079]], .024, 10);
    }
  } else if (ponytail) {
    for (const side of [-1, 1]) {
      const sweep = ellipsoid(head, hair, [side * .12, .19, .066], [.093, .06, .119], 18);
      sweep.rotation.z = side * .34;
    }
    ellipsoid(head, hair, [0, .174, -.188], [.076, .087, .075]);
    const tie = part(new THREE.TorusGeometry(.057, .012, 8, 18), cloth, head, 0, .161, -.235);
    tie.rotation.x = -.3;
    curve(head, hair, [[0, .171, -.227], [.033, .065, -.287], [.048, -.071, -.298], [.011, -.166, -.283]], .054, 14);
    curve(head, hairHighlight, [[-.032, .161, -.255], [-.015, .051, -.33], [.002, -.095, -.33]], .007, 12);
  } else {
    // Close curls form a complete silhouette, rather than a single cap.
    for (let i = 0; i < 11; i++) {
      const a = i / 11 * Math.PI * 2;
      ellipsoid(head, i % 4 ? hair : hairHighlight, [Math.sin(a) * .146, .193 + (i % 2) * .025, Math.cos(a) * .112 - .025], [.075, .066, .075], 12);
    }
    ellipsoid(head, hair, [0, .255, -.025], [.135, .052, .111]);
  }

  // A thin elastic strap and framed, front-only card leave the target legible.
  const strap = part(new THREE.TorusGeometry(.207, .012, 7, 28), clothShade, head, 0, .144, -.01);
  strap.rotation.x = Math.PI / 2; strap.scale.y = .86;
  part(new THREE.BoxGeometry(.438, .169, .018), cream, head, 0, .164, .21);
  const plate = part(new THREE.PlaneGeometry(.43, .16), new THREE.MeshBasicMaterial({ map: numberTexture(number), side: THREE.FrontSide, toneMapped: false }), head, 0, .164, .221);
  plate.userData.keepSeparate = true;

  const legs: THREE.Group[] = [], shins: THREE.Group[] = [], arms: THREE.Group[] = [], forearms: THREE.Group[] = [], hands: THREE.Group[] = [];
  if (skirtOutfit) {
    // A softly pleated skirt over shorts, with alternating radial folds.
    const skirt = new THREE.CylinderGeometry(.19, .243, .26, 48, 3, true);
    const p = skirt.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const angle = Math.atan2(p.getX(i), p.getZ(i));
      const fold = 1 + .045 * Math.cos(angle * 12) * (.7 - p.getY(i));
      p.setX(i, p.getX(i) * fold); p.setZ(i, p.getZ(i) * fold * .83);
    }
    skirt.computeVertexNormals();
    part(skirt, pants, root, 0, .684, 0);
  }
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = side < 0 ? 'left-thigh' : 'right-thigh';
    leg.position.set(side * .096, .775, 0);
    root.add(leg);
    profile(leg, skirtOutfit ? skin : pants, [[0, .075, .094], [-.055, .086, .096], [-.22, .061, .067], [-.335, .053, .055]], 16);
    if (!skirtOutfit) curve(leg, seam, [[side * .069, -.065, .041], [side * .065, -.2, .017], [side * .049, -.307, .021]], .003, 8);
    const shin = new THREE.Group();
    shin.name = side < 0 ? 'left-shin' : 'right-shin';
    shin.position.y = -.325;
    leg.add(shin);
    ellipsoid(shin, skirtOutfit ? skin : pants, [0, -.003, 0], [.054, .055, .055]);
    profile(shin, skirtOutfit ? skin : pants, [[0, .053, .055], [-.12, .058, .06], [-.264, .041, .047], [-.29, .045, .051]], 16);
    profile(shin, skirtOutfit ? cream : seam, [[skirtOutfit ? -.201 : -.257, .05, .055], [-.29, .048, .053]], 16);
    if (skirtOutfit) profile(shin, cloth, [[-.215, .05, .055], [-.226, .05, .055]], 16);
    // Sneakers have rounded toe boxes, heel tabs, rubber midsoles and laces.
    ellipsoid(shin, rubber, [0, -.411, .04], [.078, .034, .132]);
    ellipsoid(shin, shoe, [0, -.377, .025], [.073, .06, .115]);
    ellipsoid(shin, cream, [0, -.381, .092], [.07, .038, .064]);
    ellipsoid(shin, cloth, [0, -.352, -.054], [.058, .063, .038]);
    for (let i = 0; i < 3; i++) curve(shin, cream, [[-.029, -.337 - i * .008, .015 + i * .021], [0, -.325 - i * .007, .018 + i * .021], [.03, -.337 - i * .008, .015 + i * .021]], .004, 4);
    legs.push(leg); shins.push(shin);

    const arm = new THREE.Group();
    arm.name = side < 0 ? 'left-upper-arm' : 'right-upper-arm';
    arm.position.set(side * .207, 1.189, 0);
    arm.rotation.z = side * .105;
    root.add(arm);
    const sleeveMaterial = outfit === 0 ? cream : cloth;
    profile(arm, sleeveMaterial, [[.046, .012, .014], [.033, .042, .046], [.005, .063, .068], [-.045, .071, .074], [-.115, .065, .069], [outfit === 2 ? -.179 : -.216, .053, .06]], 20);
    const forearm = new THREE.Group();
    forearm.name = side < 0 ? 'left-forearm' : 'right-forearm';
    forearm.position.set(0, -.224, 0);
    arm.add(forearm);
    if (outfit === 2) {
      profile(arm, cream, [[-.15, .063, .069], [-.179, .059, .066]], 20);
      part(new THREE.CylinderGeometry(.045, .047, .058, 16), skin, arm, 0, -.202, 0);
      ellipsoid(forearm, skin, [0, 0, 0], [.05, .052, .052]);
      profile(forearm, skin, [[0, .049, .052], [-.07, .05, .052], [-.169, .034, .039], [-.19, .031, .034]], 16);
    } else {
      ellipsoid(forearm, sleeveMaterial, [0, 0, 0], [.053, .055, .06]);
      profile(forearm, sleeveMaterial, [[0, .052, .057], [-.07, .053, .055], [-.162, .038, .042]], 16);
      profile(forearm, clothShade, [[-.145, .041, .045], [-.18, .038, .042]], 16);
      profile(forearm, cream, [[-.155, .042, .0455], [-.163, .041, .044]], 16);
      part(new THREE.CylinderGeometry(.03, .031, .035, 12), skin, forearm, 0, -.191, 0);
    }
    const hand = createHand(forearm, skin, nail, side);
    hand.position.y = -.197;
    hand.rotation.y = side * -.12;
    arms.push(arm); forearms.push(forearm); hands.push(hand);
  }
  batchJoint(root);
  group.userData = { number, team, name, root, head, legs, shins, arms, forearms, hands, plate, phase: seed % 17, hairstyle, outfit };
  animateAvatar(group, 0, 0);
  return group;
}

export function animateAvatar(group: THREE.Group, time: number, moving: boolean | number) {
  const data = group.userData;
  if (!data.legs) return;
  const amount = typeof moving === 'number' ? THREE.MathUtils.clamp(Number.isFinite(moving) ? moving : 0, 0, 1) : moving ? 1 : 0;
  const phase = time * 8.5 + data.phase;
  const step = Math.sin(phase), swing = step * amount * .53;
  data.legs[0].rotation.x = swing;
  data.legs[1].rotation.x = -swing;
  for (let i = 0; i < 2; i++) {
    const cycle = i ? -step : step;
    data.shins[i].rotation.x = Math.max(0, -cycle) * amount * .73;
    data.arms[i].rotation.x = (i ? swing : -swing) * .75 - .08;
    data.arms[i].rotation.z = (i ? 1 : -1) * (.105 + Math.sin(time * 1.8 + data.phase) * .012 * (1 - amount));
    data.forearms[i].rotation.x = -.13 - amount * (.22 + Math.max(0, cycle) * .33);
    data.hands[i].rotation.x = -.04 - amount * .08;
  }
  // Lift the hip just enough to keep the trailing sneaker clear of the floor.
  data.root.position.y = Math.abs(Math.cos(phase)) * amount * .018 + Math.sin(time * 2 + data.phase) * .003 * (1 - amount);
  data.root.rotation.y = step * amount * .035;
  data.head.rotation.z = Math.sin(time * 1.4 + data.phase) * .016;
  data.head.rotation.y = Math.sin(time * .8 + data.phase) * .025 * (1 - amount);
}

export function updateAvatarNumber(group: THREE.Group, number: string) {
  if (group.userData.number === number) return;
  group.userData.number = number;
  const mat = group.userData.plate?.material as THREE.MeshBasicMaterial;
  if (!mat) return;
  mat.map?.dispose();
  mat.map = numberTexture(number);
  mat.needsUpdate = true;
}

export function disposeAvatar(group: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const mat of Array.isArray(object.material) ? object.material : [object.material]) materials.add(mat);
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(mat => {
    if ('map' in mat && mat.map instanceof THREE.Texture) textures.add(mat.map);
    mat.dispose();
  });
  textures.forEach(texture => texture.dispose());
  group.removeFromParent();
}
