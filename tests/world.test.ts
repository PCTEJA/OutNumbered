import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World } from '../src/game/world.js';
import { animateAvatar, createAvatar, createEquipment, disposeAvatar, updateAvatarNumber } from '../src/game/avatar.js';

// Geometry and lifecycle tests need a canvas-shaped texture source, not a GPU.
// Actual layout, lighting and pointer interaction are checked in the browser.
const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
before(() => {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement(tag: string) {
        assert.equal(tag, 'canvas');
        const values: Record<PropertyKey, unknown> = {};
        const context = new Proxy(values, {
          get: (target, property) => target[property] ?? (() => undefined),
          set: (target, property, value) => { target[property] = value; return true; },
        });
        return { width: 1, height: 1, getContext: () => context };
      },
    },
  });
});
after(() => {
  if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
  else Reflect.deleteProperty(globalThis, 'document');
});

function watchResources(group: THREE.Object3D) {
  const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    resources.add(object.geometry);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      resources.add(material);
      if ('map' in material && material.map instanceof THREE.Texture) resources.add(material.map);
    }
  });
  const counts = new Map<object, number>();
  for (const resource of resources) {
    counts.set(resource, 0);
    resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource)! + 1));
  }
  return () => {
    assert.ok(resources.size > 0, 'the resource audit must observe live resources');
    for (const count of counts.values()) assert.equal(count, 1, 'each GPU resource must be released exactly once');
  };
}

test('arena details load near the player, unload far away, and can be loaded again', async () => {
  const scene = new THREE.Scene();
  const world = new World(scene);
  assert.deepEqual(world.status, { loaded: 0, total: 3, zone: 'The Campus' });
  // Simultaneous update requests must share a single in-flight zone build.
  await Promise.all([world.update(0, 0), world.update(0, 0)]);
  assert.equal(world.status.loaded, 1);
  assert.equal(scene.children.filter(child => child.name === 'streamed-campus').length, 1);
  assert.equal(scene.getObjectByName('campus-low-detail-shell')!.visible, false);
  assert.equal(scene.getObjectByName('garden-low-detail-shell')!.visible, true);

  await world.update(52, 0);
  assert.equal(world.status.loaded, 2);
  assert.equal(world.status.zone, 'The Gardens');
  const oldGarden = scene.getObjectByName('streamed-garden')!;
  const checkGardenDisposed = watchResources(oldGarden);
  world.tick(1.25);

  await world.update(0, -77);
  assert.equal(world.status.zone, 'The Gallery');
  assert.equal(world.status.loaded, 2);
  assert.equal(scene.getObjectByName('streamed-garden'), undefined);
  assert.equal(scene.getObjectByName('garden-low-detail-shell')!.visible, true);
  checkGardenDisposed();

  await world.update(52, 0);
  assert.equal(world.status.loaded, 3);
  assert.notEqual(scene.getObjectByName('streamed-garden'), oldGarden);
  const checkAllDisposed = watchResources(scene);
  world.dispose();
  checkAllDisposed();
  assert.equal(scene.children.length, 0);
  await world.update(0, 0);
  assert.equal(scene.children.length, 0, 'a disposed world must not restart asynchronous loading');
});

test('all three arenas generate finite geometry and keep static detail batched', async () => {
  const scene = new THREE.Scene();
  const world = new World(scene);
  for (const [x, z] of [[0, 0], [52, 0], [0, -52]]) await world.update(x, z);
  world.tick(4);
  let meshes = 0;
  let vertices = 0;
  scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    meshes++;
    const position = object.geometry.attributes.position;
    vertices += position.count;
    for (const value of position.array) assert.ok(Number.isFinite(value), 'a rendered coordinate must be finite');
  });
  assert.ok(vertices > 30000, 'the test must exercise the detailed arenas');
  assert.ok(meshes < 400, `architecture should remain batched, found ${meshes} mesh objects`);
  world.dispose();
});

test('forehead numbers replace their texture and articulated characters release their resources', () => {
  const character = createAvatar('2941', 'blue', 'Ada');
  const plate = character.userData.plate as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  const oldTexture = plate.material.map!;
  let oldTextureDisposals = 0;
  oldTexture.addEventListener('dispose', () => oldTextureDisposals++);
  animateAvatar(character, 1.5, true);
  assert.equal(character.userData.legs[0].rotation.x, -character.userData.legs[1].rotation.x);
  assert.ok(Number.isFinite(character.userData.root.position.y));
  assert.equal(plate.geometry.attributes.normal.getZ(0), 1, 'number must face local forward rather than billboarding through the head');
  updateAvatarNumber(character, '8702');
  assert.equal(character.userData.number, '8702');
  assert.notEqual(plate.material.map, oldTexture);
  assert.equal(oldTextureDisposals, 1);
  const currentTexture = plate.material.map;
  updateAvatarNumber(character, '8702');
  assert.equal(plate.material.map, currentTexture, 'unchanged snapshots must not allocate a new number texture');
  const checkDisposed = watchResources(character);
  disposeAvatar(character);
  checkDisposed();
});

test('first-person tools remain visible at the game camera position without crossing the near plane', () => {
  const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.075, 210);
  camera.updateMatrixWorld();
  for (const kind of ['binoculars', 'camera', 'flash', 'smoke', 'distract']) {
    const tool = createEquipment(kind);
    tool.position.set(0.34, -0.43, -0.65);
    tool.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(tool);
    assert.ok(bounds.max.z < -camera.near, `${kind} must not clip through the near plane`);
    let visible = 0;
    let total = 0;
    const point = new THREE.Vector3();
    tool.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const position = object.geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld).project(camera);
        total++;
        if (Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1 && point.z > -1 && point.z < 1) visible++;
      }
    });
    assert.ok(visible / total > 0.35, `${kind} must have a readable silhouette in the viewport`);
    const checkDisposed = watchResources(tool);
    disposeAvatar(tool);
    checkDisposed();
  }
});
