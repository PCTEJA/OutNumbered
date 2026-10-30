import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createHeadAnchor, animateCharacterRig } from '../src/game/character-rig.js';

for (const variant of ['c01', 'c01f']) test(`${variant} GLB has bounded game geometry, shared rig and complete looping clips`, () => {
  const bytes = readFileSync(new URL(`../public/characters/${variant}-animated.glb`, import.meta.url));
  assert.ok(bytes.length < 4_500_000, 'game exports must retain the optimized texture budget');
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  const length = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + length));
  const bin = bytes.subarray(28 + length);
  const read = (index: number) => {
    const accessor = gltf.accessors[index], view = gltf.bufferViews[accessor.bufferView];
    const size = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 } as Record<string, number>)[accessor.type];
    const width = accessor.componentType === 5126 || accessor.componentType === 5125 ? 4 : accessor.componentType === 5123 ? 2 : 1;
    const values: number[][] = [];
    for (let i = 0; i < accessor.count; i++) {
      const row: number[] = [];
      for (let j = 0; j < size; j++) {
        const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + i * (view.byteStride ?? size * width) + j * width;
        row.push(accessor.componentType === 5126 ? bin.readFloatLE(offset) : width === 4 ? bin.readUInt32LE(offset) : width === 2 ? bin.readUInt16LE(offset) : bin.readUInt8(offset));
      }
      values.push(row);
    }
    return values;
  };
  assert.equal(gltf.skins.length, 1);
  const jointNames = gltf.skins[0].joints.map((i: number) => gltf.nodes[i].name);
  assert.equal(jointNames.length, 17);
  assert.deepEqual(gltf.animations.map((a: { name: string }) => a.name).sort(), ['Idle', 'Run', 'Walk']);
  for (const animation of gltf.animations) {
    assert.equal(animation.channels.length, 51);
    for (const sampler of animation.samplers) {
      const times = read(sampler.input).flat(), values = read(sampler.output);
      assert.ok(times.at(-1)! > .5);
      assert.ok(values.flat().every(Number.isFinite));
      assert.ok(values[0].every((v, i) => Math.abs(v - values.at(-1)![i]) < 1e-4), `${animation.name} must loop continuously`);
    }
  }
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
    assert.ok(gltf.accessors[primitive.indices].count / 3 < 25000);
    const positions = read(primitive.attributes.POSITION), joints = read(primitive.attributes.JOINTS_0), weights = read(primitive.attributes.WEIGHTS_0);
    let maximumFingerLegWeight = 0;
    positions.forEach((p, i) => {
      assert.ok(Math.abs(weights[i].reduce((sum, w) => sum + w, 0) - 1) < 1e-5);
      if (p[1] < .18) joints[i].forEach((joint, k) => {
        if (weights[i][k] > .001) assert.match(jointNames[joint], /Thigh|Shin|Foot/, 'shoe vertices must never follow hand bones');
      });
      if (p[1] > .60 && p[1] < .88 && Math.abs(p[0]) > .30) {
        const legWeight = joints[i].reduce((sum, joint, k) => sum + (/Thigh|Shin|Foot/.test(jointNames[joint]) ? weights[i][k] : 0), 0);
        maximumFingerLegWeight = Math.max(maximumFingerLegWeight, legWeight);
      }
    });
    assert.ok(maximumFingerLegWeight < .001, `fingertips must not follow leg bones, got ${maximumFingerLegWeight}`);
  }
});

for (const variant of ['c01', 'c01f']) test(`${variant} exported clips drive independent Three.js skeletons with bounded deformation`, async () => {
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'TestTexturePlaceholder', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  const bytes = readFileSync(new URL(`../public/characters/${variant}-animated.glb`, import.meta.url));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const model = clone(gltf.scene);
  const original = gltf.scene.getObjectByName('Thigh_L')!;
  const originalRotation = original.quaternion.clone();
  const mixer = new THREE.AnimationMixer(model);
  const anchorHead = createHeadAnchor(model);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(.43, .16), new THREE.MeshBasicMaterial({ side: THREE.FrontSide }));
  plate.position.set(0, 1.67, .205);
  model.add(plate);
  for (const clip of gltf.animations) {
    mixer.stopAllAction();
    mixer.clipAction(clip).reset().play();
    for (const fraction of [0, .2, .4, .6, .8]) {
      mixer.setTime(clip.duration * fraction);
      anchorHead();
      for (const side of ['L', 'R']) {
        for (const [joint, sign] of [[`Shin_${side}`, 1], [`Forearm_${side}`, -1]] as const) {
          const rest = gltf.scene.getObjectByName(joint)!.quaternion;
          const posed = model.getObjectByName(joint)!.quaternion;
          const flexion = rest.clone().invert().multiply(posed);
          assert.ok(flexion.x * sign >= -.001, `${clip.name}: ${joint} must flex in the anatomical direction`);
        }
      }
      model.updateMatrixWorld(true);
      const box = new THREE.Box3();
      model.traverse(object => {
        if (object instanceof THREE.SkinnedMesh) { object.computeBoundingBox(); box.union(object.boundingBox!.clone().applyMatrix4(object.matrixWorld)); }
      });
      const size = box.getSize(new THREE.Vector3());
      assert.ok(size.x < 1.25 && size.y < 2.1 && size.z < 1.1, `${clip.name} has excessive deformation: ${size.toArray()}`);
      assert.ok(box.min.y > -.12 && box.min.y < .20, `${clip.name} must remain near the ground: ${box.min.y}`);
      for (const x of [-.16, -.05, .05, .16]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(x, 1.67, 2), new THREE.Vector3(0, 0, -1));
        assert.equal(ray.intersectObject(model, true)[0]?.object, plate, `${clip.name} must leave all four digits unobstructed`);
      }
    }
  }
  assert.ok(original.quaternion.equals(originalRotation), 'playing a cloned rig cannot move the cached template');
  mixer.stopAllAction();
  const avatar = new THREE.Group(); avatar.add(model);
  const action = (name: string) => mixer.clipAction(gltf.animations.find(clip => clip.name === name)!).reset().play();
  const rig = { mixer, idle: action('Idle'), walk: action('Walk'), run: action('Run'), anchorHead };
  avatar.userData.motionRig = rig;
  animateCharacterRig(avatar, 0, 1, 2, 5);
  const thigh = model.getObjectByName('Thigh_L')!;
  const stoppedPose = thigh.quaternion.clone();
  animateCharacterRig(avatar, .1, 1, 2, 5);
  assert.ok(thigh.quaternion.angleTo(stoppedPose) < 1e-6, 'network stalls must freeze distance-based foot motion');
  assert.equal(rig.walk.getEffectiveWeight(), 1, 'normal movement selects walking');
  animateCharacterRig(avatar, .2, 1, 2.5, 8);
  assert.equal(rig.run.getEffectiveWeight(), 1, 'sprint speed selects running');
  animateCharacterRig(avatar, .3, 0, 2.5, 0);
  assert.equal(rig.idle.getEffectiveWeight(), 1, 'stopping returns to idle');
  mixer.stopAllAction(); mixer.uncacheRoot(model);
});
