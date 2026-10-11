import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { animateAvatar, createAvatar, disposeAvatar, updateAvatarNumber } from '../src/game/avatar.js';
import { PLAYER_EYE_HEIGHT } from '../src/shared/world.js';

// These checks audit the playable model, without needing a WebGL context.
// Facial expression, fabric and hand silhouettes still need visual review.
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

function meshesOf(group: THREE.Object3D) {
  const meshes: THREE.Mesh[] = [];
  group.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
  return meshes;
}

function appearanceFingerprint(group: THREE.Group) {
  const hash = createHash('sha256');
  group.traverse(object => {
    hash.update(JSON.stringify([object.position.toArray(), object.quaternion.toArray(), object.scale.toArray()]));
    if (!(object instanceof THREE.Mesh)) return;
    for (const attribute of Object.values(object.geometry.attributes) as THREE.BufferAttribute[]) {
      const array = attribute.array;
      hash.update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
    }
    if (object.geometry.index) {
      const array = object.geometry.index.array;
      hash.update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
    }
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if ('color' in material) hash.update(String((material.color as THREE.Color).getHex()));
    }
  });
  return hash.digest('hex');
}

function resourcesOf(group: THREE.Object3D) {
  const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
  for (const mesh of meshesOf(group)) {
    resources.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      resources.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) resources.add(value);
    }
  }
  return resources;
}

test('a player keeps the same appearance when their forehead number changes or they are recreated', t => {
  const original = createAvatar('2941', 'blue', 'Ada');
  const recreated = createAvatar('8702', 'blue', 'Ada');
  t.after(() => { disposeAvatar(original); disposeAvatar(recreated); });
  const appearance = appearanceFingerprint(original);
  assert.equal(appearanceFingerprint(recreated), appearance, 'respawn numbers must not determine a named player’s face or clothes');
  assert.equal(original.userData.phase, recreated.userData.phase, 'animation identity must also survive a changed number');
  updateAvatarNumber(original, '8702');
  assert.equal(appearanceFingerprint(original), appearance, 'changing the card must preserve the entire body');
});

test('character variants retain the playable scale and keep detailed geometry within a multiplayer budget', t => {
  const appearances = new Set<string>();
  for (let variant = 0; variant < 12; variant++) {
    const avatar = createAvatar(String(2400 + variant), variant % 2 ? 'blue' : 'red', `Portrait-${variant}`);
    t.after(() => disposeAvatar(avatar));
    const meshes = meshesOf(avatar);
    let triangles = 0;
    for (const mesh of meshes) {
      const positions = mesh.geometry.getAttribute('position');
      assert.ok(positions.count > 0, 'a baked body part must contain geometry');
      for (const value of positions.array) assert.ok(Number.isFinite(value), 'all model vertices must be finite');
      triangles += (mesh.geometry.index?.count ?? positions.count) / 3;
    }
    assert.ok(meshes.length <= 65, `${meshes.length} meshes per character would multiply across a 20-player room`);
    assert.ok(triangles <= 40000, `character has ${triangles} triangles`);
    const bounds = new THREE.Box3().setFromObject(avatar);
    assert.ok(bounds.min.y >= -0.025 && bounds.min.y <= 0.08, `feet must rest at floor height: ${bounds.min.y}`);
    assert.ok(bounds.max.y >= 1.7 && bounds.max.y <= 1.95, `character height must fit the existing arena: ${bounds.max.y}`);
    appearances.add(appearanceFingerprint(avatar));
  }
  assert.ok(appearances.size >= 4, 'the roster should include visibly distinct character variants');
});

test('forehead cards stay at eye height, face forward, and remain unobstructed by hair', t => {
  const forward = new THREE.Vector3(0, 0, -1);
  for (let variant = 0; variant < 8; variant++) {
    const avatar = createAvatar('8702', 'blue', `Portrait-${variant}`);
    t.after(() => disposeAvatar(avatar));
    avatar.updateMatrixWorld(true);
    const plate = avatar.userData.plate as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    const center = plate.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(center.y - PLAYER_EYE_HEIGHT) < 0.1, 'number height must match existing first-person sight lines');
    assert.equal(plate.material.side, THREE.FrontSide, 'numbers must not be readable through the rear of a head');
    plate.geometry.computeBoundingBox();
    const cardBounds = plate.geometry.boundingBox!;
    for (const fraction of [-0.75, -0.25, 0.25, 0.75]) {
      const digitCenter = new THREE.Vector3(fraction * (cardBounds.max.x - cardBounds.min.x) / 2, 0, 0).applyMatrix4(plate.matrixWorld);
      const ray = new THREE.Raycaster(digitCenter.clone().add(new THREE.Vector3(0, 0, 2)), forward, 0, 3);
      assert.equal(ray.intersectObject(avatar, true)[0]?.object, plate, 'every digit must have an unobstructed straight-on view');
    }
    const rearRay = new THREE.Raycaster(center.clone().add(new THREE.Vector3(0, 0, -2)), new THREE.Vector3(0, 0, 1), 0, 3);
    assert.equal(rearRay.intersectObject(plate).length, 0, 'the card must be culled from behind');
  }
});

test('torso and face surfaces face outwards after their geometry is baked', t => {
  for (let variant = 0; variant < 8; variant++) {
    const avatar = createAvatar('8702', 'blue', `Portrait-${variant}`);
    t.after(() => disposeAvatar(avatar));
    avatar.updateMatrixWorld(true);
    for (const [part, x, y, minFrontZ] of [
      [avatar.userData.root, .12, 1.055, .04],
      [avatar.userData.head, 0, .003, .13],
    ] as [THREE.Group, number, number, number][]) {
      const origin = new THREE.Vector3(x, y, 1).applyMatrix4(part.matrixWorld);
      const direction = new THREE.Vector3(0, 0, -1).transformDirection(part.matrixWorld);
      const hit = new THREE.Raycaster(origin, direction, 0, 2).intersectObject(part, true)[0];
      assert.ok(hit, 'the front of a face or garment must be visible');
      const localHit = part.worldToLocal(hit.point.clone());
      assert.ok(localHit.z > minFrontZ, 'inverted winding must not expose the inside of the back surface');
    }
  }
});

test('hands have five digits and articulated limbs animate without invalid transforms', t => {
  const avatar = createAvatar('2941', 'red', 'Ada');
  t.after(() => disposeAvatar(avatar));
  for (const limb of ['arms', 'legs', 'forearms', 'shins', 'hands']) {
    assert.equal(avatar.userData[limb]?.length, 2, `the rig needs two ${limb}`);
  }
  for (const hand of avatar.userData.hands as THREE.Group[]) {
    assert.deepEqual(new Set(hand.userData.digits), new Set(['thumb', 'index', 'middle', 'ring', 'little']));
    assert.ok(meshesOf(hand).length > 0, 'hand metadata must correspond to rendered geometry');
  }
  const animatedPose = (amount: number) => {
    animateAvatar(avatar, 2.75, amount);
    return [...avatar.userData.legs, ...avatar.userData.arms, ...avatar.userData.shins, ...avatar.userData.forearms]
      .map((limb: THREE.Group) => limb.rotation.toArray());
  };
  assert.deepEqual(animatedPose(-2), animatedPose(0), 'negative movement must not invert the gait');
  assert.deepEqual(animatedPose(5), animatedPose(1), 'oversized movement input must not overextend the gait');
  for (let frame = 0; frame < 40; frame++) {
    animateAvatar(avatar, frame / 10, frame % 2 ? 1 : 0);
    avatar.updateMatrixWorld(true);
    avatar.traverse(object => {
      for (const value of object.matrixWorld.elements) assert.ok(Number.isFinite(value), 'animation must preserve finite transforms');
    });
    for (const joint of [...avatar.userData.shins, ...avatar.userData.forearms] as THREE.Group[]) {
      assert.ok(Math.abs(joint.rotation.x) < Math.PI / 2, 'elbows and knees must remain within a natural flexion range');
    }
  }
});

test('unloading one detailed character releases each resource once without invalidating another', () => {
  const first = createAvatar('2941', 'blue', 'Ada');
  const second = createAvatar('8702', 'blue', 'Ada');
  const firstResources = resourcesOf(first);
  const secondResources = resourcesOf(second);
  const firstDisposals = new Map<object, number>();
  let secondDisposals = 0;
  for (const resource of firstResources) {
    assert.ok(!secondResources.has(resource), 'independently disposable avatars must own their GPU resources');
    firstDisposals.set(resource, 0);
    resource.addEventListener('dispose', () => firstDisposals.set(resource, firstDisposals.get(resource)! + 1));
  }
  for (const resource of secondResources) resource.addEventListener('dispose', () => secondDisposals++);
  const scene = new THREE.Scene();
  scene.add(first, second);
  disposeAvatar(first);
  assert.equal(first.parent, null);
  assert.equal(second.parent, scene);
  assert.equal(secondDisposals, 0, 'a remaining player must keep all resources');
  for (const count of firstDisposals.values()) assert.equal(count, 1, 'each GPU resource must be released exactly once');
  disposeAvatar(second);
  assert.equal(secondDisposals, secondResources.size);
});
