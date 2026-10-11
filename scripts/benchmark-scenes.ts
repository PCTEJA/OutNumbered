// CPU-side scene audit. Browser frame timing must be measured separately.
import * as THREE from 'three';
import { World } from '../src/game/world';
import { createAvatar, disposeAvatar } from '../src/game/avatar';

Object.defineProperty(globalThis, 'document', { value: {
  createElement() { return { width: 1, height: 1, getContext: () => new Proxy({}, { get: () => () => undefined }) }; },
} });
function measure(root: THREE.Object3D) {
  let meshes = 0, triangles = 0;
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    meshes++;
    triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3 * (object instanceof THREE.InstancedMesh ? object.count : 1);
  });
  return { meshes, triangles };
}
for (const [map, x, z] of [['campus', 0, 0], ['garden', 52, 0], ['museum', 0, -52]] as const) {
  const scene = new THREE.Scene(), world = new World(scene), start = performance.now();
  await world.update(x, z);
  console.log(JSON.stringify({ map, buildMs: Math.round(performance.now() - start), ...measure(scene.getObjectByName(`streamed-${map}`)!) }));
  world.dispose();
}
const avatar = createAvatar('1234', 'red', 'Piper');
console.log(JSON.stringify({ avatar: 'Piper', ...measure(avatar) }));
disposeAvatar(avatar);
