import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sculptFace, sculptLock } from './character-sculpt';
export { createEquipment } from './equipment';

type Team = 'red' | 'blue';
type Point = [number, number, number];
const skinTones = [0xf1c5a7, 0xc98d68, 0xe4ae86, 0x98603e, 0x704530];
const material = (color: number, roughness = 0.82) => new THREE.MeshStandardMaterial({ color, roughness });
function fabric(color: number) {
  const mat = material(color, .94);
  mat.userData.fabric = true;
  return mat;
}

function part(geometry: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function ellipsoid(parent: THREE.Object3D, mat: THREE.Material, p: Point, size: Point, segments = 16) {
  const mesh = part(new THREE.SphereGeometry(1, Math.max(segments, 24), 16), mat, parent, ...p);
  mesh.scale.set(...size);
  return mesh;
}

/** Smooth continuous elliptical sections, used for tailored clothes and anatomy. */
function profile(parent: THREE.Object3D, mat: THREE.Material, rings: [number, number, number, number?][], segments = 24) {
  const drape = !!mat.userData.fabric && rings.length > 3;
  // Smooth longitudinal contours too: radial segments alone leave angular shoulders.
  segments = Math.max(32, segments);
  if (rings.length > 3) {
    const section = new THREE.CatmullRomCurve3(rings.map(r => new THREE.Vector3(r[1], r[0], r[2])), false, 'centripetal');
    const offset = new THREE.CatmullRomCurve3(rings.map(r => new THREE.Vector3(0, r[0], r[3] ?? 0)), false, 'centripetal');
    const count = (rings.length - 1) * 4;
    rings = Array.from({ length: count + 1 }, (_, i) => {
      const p = section.getPoint(i / count);
      return [p.y, Math.max(.001, p.x), Math.max(.001, p.z), offset.getPoint(i / count).z];
    });
  }
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  rings.forEach(([y, rx, rz, centerZ = 0], row) => {
    for (let i = 0; i <= segments; i++) {
      const angle = i / segments * Math.PI * 2;
      const fold = drape ? 1 + .025 * Math.sin(angle * 5 + y * 27) * Math.sin(Math.PI * row / (rings.length - 1)) ** 2 : 1;
      positions.push(Math.sin(angle) * rx * fold, y, Math.cos(angle) * rz * fold + centerZ);
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
  return part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), Math.max(16, segments), radius, 10, false), mat, parent);
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
      const finish = child.material.roughness < .6 ? .5 : .85;
      const meshes = batches.get(finish) ?? [];
      meshes.push(child as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>);
      batches.set(finish, meshes);
    }
    for (const [roughness, meshes] of batches) {
      const geometries = meshes.map(mesh => {
        mesh.updateMatrix();
        const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrix);
        const flat = geometry.index ? geometry.toNonIndexed() : geometry;
        if (flat !== geometry) geometry.dispose();
        const colors = new Float32Array(flat.attributes.position.count * 3);
        const { r, g, b } = mesh.material.color;
        const sourceColors = flat.getAttribute('color');
        for (let i = 0; i < colors.length; i += 3) {
          colors[i] = sourceColors ? sourceColors.getX(i / 3) : r;
          colors[i + 1] = sourceColors ? sourceColors.getY(i / 3) : g;
          colors[i + 2] = sourceColors ? sourceColors.getZ(i / 3) : b;
        }
        flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        flat.setAttribute('surfaceFinish', new THREE.Float32BufferAttribute(
          new Float32Array(flat.attributes.position.count).fill(mesh.material.roughness), 1));
        flat.setAttribute('fabricWeight', new THREE.Float32BufferAttribute(
          new Float32Array(flat.attributes.position.count).fill(mesh.material.userData.fabric ? 1 : 0), 1));
        return flat;
      });
      const merged = mergeGeometries(geometries, false)!;
      geometries.forEach(geometry => geometry.dispose());
      meshes.forEach(mesh => { replaced.add(mesh.material); mesh.geometry.dispose(); joint.remove(mesh); });
      let mat = palette.get(roughness);
      if (!mat) {
        mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness, vertexColors: true });
        // Preserve each source surface's finish even after batching by joint.
        mat.onBeforeCompile = shader => {
          shader.vertexShader = 'attribute float surfaceFinish; attribute float fabricWeight; varying float vSurfaceFinish; varying float vFabricWeight; varying vec3 vFabricPosition;\n' + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurfaceFinish = surfaceFinish; vFabricWeight = fabricWeight; vFabricPosition = position;');
          shader.fragmentShader = 'varying float vSurfaceFinish; varying float vFabricWeight; varying vec3 vFabricPosition;\n' + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vSurfaceFinish;');
          // Fade subpixel threads out instead of allowing a shimmering moire pattern.
          shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
            vec3 thread = vFabricPosition * 1700.0;
            float threadFade = 1.0 - smoothstep(0.8, 2.5, max(fwidth(thread.x), max(fwidth(thread.y), fwidth(thread.z))));
            float weave = sin(thread.y) * (sin(thread.x) + sin(thread.z)) * 0.5;
            diffuseColor.rgb *= 1.0 + weave * 0.065 * vFabricWeight * threadFade;`);
        };
        mat.customProgramCacheKey = () => 'avatar-surface-finish-v2';
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
  // Four coherent reference silhouettes; identity is still stable across respawns.
  const hairstyle = seed % 4, outfit = [0, 2, 2, 1][hairstyle];
  const ponytail = hairstyle === 1;
  const skirtOutfit = ponytail && outfit === 2;
  const skinColor = skinTones[Math.floor(seed / 7) % skinTones.length];
  const skin = material(skinColor, .62);
  const skinShade = material(new THREE.Color(skinColor).multiplyScalar(.84).getHex(), .7);
  const nail = material(new THREE.Color(skinColor).lerp(new THREE.Color(0xffe2d0), .26).getHex(), .55);
  const cloth = fabric(team === 'red' ? 0x8b3933 : 0x304e70);
  const clothShade = fabric(team === 'red' ? 0x742e2b : 0x263e59);
  const cream = fabric(0xcac5b6);
  const pants = fabric(outfit === 1 ? 0x303237 : outfit === 0 ? 0x393936 : 0x292f3b);
  const seam = fabric(0x45494f);
  const rubber = material(0xf1e8d6, .9);
  const shoe = material(0x233340, .65);
  const hair = material([0x32251f, 0x452b20, 0x211f26, 0x745035][Math.floor(seed / 3) % 4], .64);
  const hairHighlight = material(new THREE.Color(hair.color).lerp(new THREE.Color(0x91755c), .15).getHex());
  const eye = material(0x22272b, .38);
  const whites = material(0xe5ded1, .24);
  const iris = material(seed % 2 ? 0x536858 : 0x72503a, .28);
  const lips = material(new THREE.Color(skinColor).lerp(new THREE.Color(0xa45855), .32).getHex(), .58);
  const root = new THREE.Group();
  root.name = 'body-rig';
  group.add(root);

  // The torso is a tapered garment with actual shoulder, waist and hem shapes.
  profile(root, cloth, [[.79, .147, .105], [.82, .174, .118], [.91, .169, .117], [1.08, .193, .126], [1.19, .219, .126], [1.23, .176, .111], [1.28, .099, .083], [1.29, .07, .072]]);
  profile(root, clothShade, [[.788, .149, .106], [.80, .175, .12], [.829, .176, .12]]);
  profile(root, pants, [[.71, .132, .09], [.75, .161, .106], [.799, .158, .106]]);
  part(new THREE.CylinderGeometry(.061, .071, .14, 16), skin, root, 0, 1.302, 0);
  const collar = part(new THREE.TorusGeometry(.08, .017, 8, 24), outfit === 0 ? clothShade : cloth, root, 0, 1.281, 0);
  collar.rotation.x = Math.PI / 2;

  if (outfit === 0) {
    // Varsity jacket: contrasting sleeves, zipper, ribbed hem, welt pockets.
    curve(root, cream, [[0, .824, .123], [0, 1.08, .134], [0, 1.248, .1]], .006, 12);
    part(new THREE.BoxGeometry(.014, .025, .01), rubber, root, .008, 1.195, .132);
    for (const side of [-1, 1]) {
      curve(root, clothShade, [[side * .083, .86, .107], [side * .117, .937, .106]], .014, 4);
      curve(root, cream, [[side * .083, .86, .122], [side * .117, .935, .122]], .004, 4);
    }
    // Snap fasteners, twin striped waistband and shoulder piping from C01.
    for (const y of [.855, .935, 1.015, 1.095, 1.175])
      ellipsoid(root, rubber, [.014, y, .132], [.006, .006, .003], 8);
    for (const y of [.799, .818])
      profile(root, cream, [[y, .176, .121], [y + .004, .176, .121]], 24);
    for (const side of [-1, 1])
      curve(root, cream, [[side * .09, 1.267, .073], [side * .15, 1.24, .082], [side * .211, 1.19, .054]], .0025, 8);
  } else if (outfit === 1) {
    // Hoodie: neck roll, hanging cords, inset kangaroo pocket and stitched edge.
    ellipsoid(root, clothShade, [0, 1.18, -.12], [.142, .12, .075]);
    curve(root, cloth, [[-.105, 1.265, -.03], [-.115, 1.23, -.15], [0, 1.17, -.192], [.115, 1.23, -.15], [.105, 1.265, -.03]], .018, 18);
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
      part(new THREE.ExtrudeGeometry(shape, { depth: .01, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .004, bevelThickness: .003 }), ponytail ? cloth : cream, root, 0, 0, .09);
    }
    part(new THREE.BoxGeometry(.03, .092, .01), clothShade, root, 0, 1.188, .132);
    for (const y of [1.218, 1.188, 1.158]) ellipsoid(root, cream, [0, y, .143], [.005, .005, .003], 8);
  }

  const head = new THREE.Group();
  head.name = 'head';
  // Adult streetwear silhouette: narrower skull and restrained facial features.
  // The head datum keeps the gameplay card centered at approximately 1.65m.
  head.position.y = 1.535;
  head.scale.set(ponytail || hairstyle === 2 ? .69 : .72, .72, .78);
  root.add(head);
  // A shaped jaw and cheeks prevent the old sphere-on-a-stick silhouette.
  part(sculptFace(skin.color, ponytail), skin, head);
  for (const side of [-1, 1]) {
    ellipsoid(head, skin, [side * .204, -.03, -.006], [.037, .057, .034]);
    ellipsoid(head, skinShade, [side * .224, -.028, .016], [.012, .031, .012], 12);
    ellipsoid(head, skin, [side * .224, -.035, .025], [.011, .018, .009], 10);
    ellipsoid(head, whites, [side * .075, -.006, .166], [.031, .012, .008]);
    ellipsoid(head, iris, [side * .074, -.006, .175], [.012, .012, .003], 32);
    ellipsoid(head, eye, [side * .074, -.006, .178], [.0055, .0075, .002], 24);
    ellipsoid(head, whites, [side * .074 - .003, -.002, .180], [.0027, .0027, .001], 16);
    // Eyelids seat the eyes into the face instead of leaving floating eyeballs.
    curve(head, skin, [[side * .043, -.008, .163], [side * .072, .008, .174], [side * .106, -.009, .151]], .004, 20);

    part(sculptLock([[side * .035, .043, .178], [side * .071, .054, .174], [side * .116, .035, .15]].map(p => new THREE.Vector3(...p)), .006, .004), hair, head);
    curve(head, skin, [[side * .043, -.008, .163], [side * .075, -.019, .173], [side * .106, -.009, .151]], .003, 20);
  }
  ellipsoid(head, skinShade, [-.018, -.089, .207], [.005, .0025, .003], 20);
  ellipsoid(head, skinShade, [.018, -.089, .207], [.005, .0025, .003], 20);
  curve(head, lips, [[-.043, -.133, .156], [-.018, -.128, .167], [0, -.131, .17], [.018, -.128, .167], [.043, -.133, .156]], .0038, 24);
  curve(head, lips, [[-.04, -.135, .156], [0, -.141, .17], [.04, -.135, .156]], .0045, 24);
  curve(head, skinShade, [[-.04, -.134, .158], [0, -.134, .173], [.04, -.134, .158]], .0015, 24);

  // Hair cap with a lower nape, high forehead and shaped sideburns.
  const hairGeometry = new THREE.SphereGeometry(1, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);
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
    // Overlapping ribbon-like locks carry a consistent side part and swept crest.
    for (let i = 0; i < 11; i++) {
      const x = -.173 + i * .032;
      const crown = Math.sqrt(Math.max(0, 1 - (x / .23) ** 2));
      const points: Point[] = [[x, .13 + crown * .025, .131],
        [x - .018, .13 + crown * .13, .065],
        [x + .018, .13 + crown * .14, -.035],
        [x + .012, .075, -.166]];
      part(sculptLock(points.map(p => new THREE.Vector3(...p)), .028, .015), i % 4 === 1 ? hairHighlight : hair, head);
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
    for (let i = 0; i < 7; i++) {
      const x = (i - 3) * .014;
      part(sculptLock([[x, .171, -.227], [x + .033, .065, -.287], [x + .048, -.071, -.298], [x + .011, -.205, -.267]].map(p => new THREE.Vector3(...p)), .024, .025), i % 3 ? hair : hairHighlight, head);
    }
  } else {
    // Dense close curls, distributed over the scalp rather than large bubbles.
    for (let i = 0; i < 70; i++) {
      const a = i * 2.399963;
      const r = Math.sqrt((i + .5) / 70);
      ellipsoid(head, i % 7 ? hair : hairHighlight,
        [Math.cos(a) * .19 * r, .17 + .11 * Math.sqrt(1 - r * r), Math.sin(a) * .145 * r - .026],
        [.025, .025, .025], 20);
    }
    curve(head, hair, [[-.038, -.112, .17], [0, -.105, .184], [.038, -.112, .17]], .007, 8);
    ellipsoid(head, hair, [0, -.183, .125], [.045, .018, .012], 10);
  }

  // A thin elastic strap and framed, front-only card leave the target legible.
  const strap = part(new THREE.TorusGeometry(.207, .012, 7, 28), clothShade, head, 0, .144, -.01);
  strap.rotation.x = Math.PI / 2; strap.scale.y = .86;
  // Compensate for head/body scaling so the gameplay display is truly .43 × .16 m.
  const numberSocket = new THREE.Group();
  numberSocket.name = 'NumberSocket';
  numberSocket.position.set(0, (1.67 - 1.535) / .72, .221);
  numberSocket.scale.set(1 / (head.scale.x * 1.10), 1 / .72, 1 / .78);
  head.add(numberSocket);
  part(new THREE.BoxGeometry(.438, .169, .018), cream, numberSocket, 0, 0, -.01);
  const plate = part(new THREE.PlaneGeometry(.43, .16), new THREE.MeshBasicMaterial({ map: numberTexture(number), side: THREE.FrontSide, toneMapped: false }), numberSocket);
  plate.userData.keepSeparate = true;

  const legs: THREE.Group[] = [], shins: THREE.Group[] = [], arms: THREE.Group[] = [], forearms: THREE.Group[] = [], hands: THREE.Group[] = [];
  if (skirtOutfit) {
    // A softly pleated skirt over shorts, with alternating radial folds.
    const skirt = new THREE.CylinderGeometry(.175, .26, .34, 48, 5, true);
    const p = skirt.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const angle = Math.atan2(p.getX(i), p.getZ(i));
      const fold = 1 + .045 * Math.cos(angle * 12) * (.7 - p.getY(i));
      p.setX(i, p.getX(i) * fold); p.setZ(i, p.getZ(i) * fold * .83);
    }
    skirt.computeVertexNormals();
    part(skirt, pants, root, 0, .63, 0);
    profile(root, pants, [[.77, .174, .112], [.805, .174, .112]], 24);
  }
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = side < 0 ? 'left-thigh' : 'right-thigh';
    leg.position.set(side * .096, .775, 0);
    root.add(leg);
    profile(leg, skirtOutfit ? skin : pants, [[0, .075, .094], [-.055, .086, .096], [-.22, .061, .067], [-.277, .058, .062], [-.295, .061, .065], [-.315, .054, .056], [-.335, .053, .055]], 16);
    if (skirtOutfit) profile(leg, pants, [[.008, .078, .097], [-.16, .078, .088]], 16);
    if (!skirtOutfit) curve(leg, seam, [[side * .069, -.065, .041], [side * .065, -.2, .017], [side * .049, -.307, .021]], .003, 8);
    const shin = new THREE.Group();
    shin.name = side < 0 ? 'left-shin' : 'right-shin';
    shin.position.y = -.325;
    leg.add(shin);
    ellipsoid(shin, skirtOutfit ? skin : pants, [0, -.003, 0], [.054, .055, .055]);
    profile(shin, skirtOutfit ? skin : pants, [[0, .053, .055], [-.12, .058, .06], [-.264, .041, .047], [-.29, .045, .051]], 16);
    profile(shin, skirtOutfit ? cream : seam, [[skirtOutfit ? -.201 : -.257, .05, .055], [-.29, .048, .053]], 16);
    if (skirtOutfit) for (const y of [-.211, -.232]) profile(shin, cloth, [[y, .051, .056], [y - .007, .051, .056]], 16);
    // Sneakers have rounded toe boxes, heel tabs, rubber midsoles and laces.
    ellipsoid(shin, rubber, [0, -.411, .04], [.078, .034, .132]);
    ellipsoid(shin, shoe, [0, -.377, .025], [.073, .06, .115]);
    ellipsoid(shin, cream, [0, -.381, .092], [.07, .038, .064]);
    ellipsoid(shin, cloth, [0, -.352, -.054], [.058, .063, .038]);
    for (let i = 0; i < 5; i++) curve(shin, cream, [[-.029, -.337 - i * .008, .015 + i * .021], [0, -.325 - i * .007, .018 + i * .021], [.03, -.337 - i * .008, .015 + i * .021]], .004, 4);
    for (const edge of [-1, 1]) {
      curve(shin, rubber, [[edge * .068, -.402, -.035], [edge * .076, -.404, .048], [edge * .056, -.408, .132]], .003, 8);
      curve(shin, cream, [[edge * .066, -.355, -.018], [edge * .071, -.376, .035], [edge * .065, -.383, .065]], .008, 6);
    }
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
      profile(arm, ponytail ? clothShade : cream, [[-.15, .063, .069], [-.179, .059, .066]], 20);
      if (ponytail) for (const y of [-.158, -.173]) profile(arm, cream, [[y, .062, .069], [y - .003, .062, .069]], 20);
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
  // Broader shoulders and longer torso keep the reduced head seated in the collar.
  // Stretch only above the hips so shoes and knee pivots keep their ground datum.
  const hip = .79;
  for (const child of root.children) {
    if (child === head || legs.includes(child as THREE.Group)) continue;
    if (child instanceof THREE.Mesh) {
      // Deform in root coordinates: local Y is not vertical on rotated collars.
      child.updateMatrix();
      child.geometry.applyMatrix4(child.matrix);
      child.position.set(0, 0, 0);
      child.rotation.set(0, 0, 0);
      child.scale.set(1, 1, 1);
      const positions = child.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const y = positions.getY(i) + child.position.y;
        if (y > hip) positions.setY(i, hip + (y - hip) * 1.17 - child.position.y);
      }
      child.geometry.computeVertexNormals();
    } else if (arms.includes(child as THREE.Group)) child.position.y += .065;
  }
  // A continuous neck closes the collar-to-jaw join at the shared head datum.
  profile(root, skin, [[1.36, .064, .06], [1.43, .059, .06], [1.46, .058, .057]], 12);
  root.scale.x = 1.10;
  batchJoint(root);
  root.traverse(object => {
    if (object instanceof THREE.Mesh) { object.updateMatrix(); object.matrixAutoUpdate = false; }
  });
  group.userData = { number, team, name, root, head, legs, shins, arms, forearms, hands, plate, phase: seed % 17, hairstyle, outfit };
  animateAvatar(group, 0, 0);
  return group;
}

export function animateAvatar(group: THREE.Group, time: number, moving: boolean | number, stridePhase?: number) {
  const data = group.userData;
  if (!data.legs) return;
  const amount = typeof moving === 'number' ? THREE.MathUtils.clamp(Number.isFinite(moving) ? moving : 0, 0, 1) : moving ? 1 : 0;
  const phase = (stridePhase ?? time * 8.5) + data.phase;
  const step = Math.sin(phase), swing = step * amount * .40;
  data.legs[0].rotation.x = swing;
  data.legs[1].rotation.x = -swing;
  for (let i = 0; i < 2; i++) {
    const cycle = i ? -step : step;
    data.shins[i].rotation.x = Math.max(0, -cycle) * amount * .65;
    data.arms[i].rotation.x = (i ? swing : -swing) * .75 - .08;
    data.arms[i].rotation.z = (i ? 1 : -1) * (.105 + Math.sin(time * 1.8 + data.phase) * .012 * (1 - amount));
    data.forearms[i].rotation.x = -.13 - amount * (.22 + Math.max(0, cycle) * .33);
    data.hands[i].rotation.x = -.04 - amount * .08;
  }
  // Lift the hip just enough to keep the trailing sneaker clear of the floor.
  data.root.position.y = Math.abs(Math.cos(phase)) * amount * .018 + Math.sin(time * 2 + data.phase) * .003 * (1 - amount);
  data.root.rotation.y = step * amount * .035;
  // Counter body sway on the target, keeping its server-authoritative datum steady.
  data.head.position.y = 1.535 - data.root.position.y;
  data.head.rotation.y = -data.root.rotation.y;
  data.head.rotation.z = 0;
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
