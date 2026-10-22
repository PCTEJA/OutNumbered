import * as THREE from 'three';

const bell = (v: number, centre: number, width: number) => Math.exp(-(((v - centre) / width) ** 2));

/** Continuous sculpt: the nose, cheeks, eye sockets and chin belong to one surface. */
export function sculptFace(skin: THREE.Color, soft: boolean) {
  const sections = [
    [-.218, .002, .008, .018], [-.202, .073, .075, .026],
    [-.171, soft ? .117 : .134, .128, .014], [-.125, .151, .156, .002],
    [-.065, .17, .176, -.004], [.005, .18, .183, -.008],
    [.08, .187, .177, -.01], [.15, .174, .151, -.018],
    [.207, .116, .105, -.022], [.244, .002, .003, -.025],
  ];
  const contour = new THREE.CatmullRomCurve3(sections.map(r => new THREE.Vector3(r[1], r[0], r[2])), false, 'centripetal');
  const centres = new THREE.CatmullRomCurve3(sections.map(r => new THREE.Vector3(0, r[0], r[3])), false, 'centripetal');
  const positions: number[] = [], colors: number[] = [], uvs: number[] = [], indices: number[] = [];
  const rows = 96, columns = 112;
  const warm = skin.clone().lerp(new THREE.Color(0xb96860), .18);
  for (let row = 0; row <= rows; row++) {
    const t = row / rows, section = contour.getPoint(t), centre = centres.getPoint(t);
    for (let col = 0; col <= columns; col++) {
      const a = col / columns * Math.PI * 2, front = Math.max(0, Math.cos(a));
      const x = Math.sin(a) * section.x, y = section.y;
      let z = Math.cos(a) * section.z + centre.z;
      if (front > 0) {
        const mask = front ** 5;
        const cheeks = bell(Math.abs(x), .103, .055) * bell(y, -.063, .05) * .016;
        const sockets = bell(Math.abs(x), .073, .036) * bell(y, .002, .027) * .013;
        const bridge = bell(x, 0, .019) * bell(y, -.018, .071) * .033;
        const tip = bell(x, 0, .022) * bell(y, -.077, .018) * .033;
        const nostrilWings = bell(Math.abs(x), .023, .012) * bell(y, -.083, .014) * .015;
        const muzzle = bell(x, 0, .063) * bell(y, -.127, .029) * .009;
        const chin = bell(x, 0, .059) * bell(y, -.183, .025) * .012;
        z += (cheeks - sockets + bridge + tip + nostrilWings + muzzle + chin) * mask;
      }
      positions.push(x, y, z);
      const blush = bell(Math.abs(x), .105, .048) * bell(y, -.067, .04) * front ** 4;
      const color = skin.clone().lerp(warm, blush);
      colors.push(color.r, color.g, color.b);
      uvs.push(col / columns, t);
      if (row && col) {
        const i = row * (columns + 1) + col, b = i - columns - 1;
        indices.push(i, i - 1, b, b, i - 1, b - 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(positions.length), 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Tapered, flattened locks with fine longitudinal grooves, not round spaghetti tubes. */
export function sculptLock(points: THREE.Vector3[], width: number, depth: number) {
  const path = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(path, 36, 1, 12, false);
  const frames = path.computeFrenetFrames(36, false);
  const p = geometry.attributes.position;
  for (let row = 0; row <= 36; row++) {
    const t = row / 36, centre = path.getPointAt(t);
    const taper = .06 + .94 * Math.sin(Math.PI * (.12 + t * .88)) ** .5;
    for (let col = 0; col <= 12; col++) {
      const a = col / 12 * Math.PI * 2;
      const groove = 1 + .045 * Math.cos(a * 6 + t * 3);
      const v = centre.clone().addScaledVector(frames.normals[row], -Math.cos(a) * width * taper * groove)
        .addScaledVector(frames.binormals[row], Math.sin(a) * depth * taper * groove);
      p.setXYZ(row * 13 + col, v.x, v.y, v.z);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}
