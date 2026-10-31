import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

const assets = new Map<string, Promise<GLTF>>();
const loader = new GLTFLoader();
/** Inset digits on the existing white forehead strap, with a small depth clearance. */
export function placeNumberOnStrap(plate: THREE.Mesh, female: boolean) {
  plate.matrixAutoUpdate = true;
  plate.position.set(female ? 0 : -.001, female ? 1.6875 : 1.700, female ? .1335 : .1205);
  plate.rotation.set(0, 0, 0);
  plate.scale.set((female ? .158 : .140) / .43, (female ? .060 : .052) / .16, 1);
}

/** Keep the strap and surrounding forehead on the anchored head during motion. */
export function anchorNumberStrap(model: THREE.Object3D, female: boolean) {
  model.traverse(object => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    const head = object.skeleton.bones.findIndex(bone => bone.name === 'Head');
    if (head < 0) return;
    const { position, skinIndex, skinWeight } = object.geometry.attributes;
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i);
      if (y < (female ? 1.64 : 1.66)) continue;
      skinIndex.setXYZW(i, head, 0, 0, 0);
      skinWeight.setXYZW(i, 1, 0, 0, 0);
    }
    skinIndex.needsUpdate = skinWeight.needsUpdate = true;
  });
}
type MotionRig = { mixer: THREE.AnimationMixer; idle: THREE.AnimationAction; walk: THREE.AnimationAction; run: THREE.AnimationAction; anchorHead: () => void; lastTime?: number };

/** Counter torso motion so the imported forehead board and gameplay digits agree. */
export function createHeadAnchor(model: THREE.Object3D) {
  const head = model.getObjectByName('Head');
  if (!head?.parent) return () => {};
  model.updateMatrixWorld(true);
  const rest = model.matrixWorld.clone().invert().multiply(head.matrixWorld);
  const local = new THREE.Matrix4();
  return () => {
    head.parent!.updateWorldMatrix(true, false);
    local.copy(head.parent!.matrixWorld).invert().multiply(model.matrixWorld).multiply(rest);
    local.decompose(head.position, head.quaternion, head.scale);
    head.updateMatrixWorld(true);
  };
}

/** Keep the existing character visible until its GPU-ready skinned asset arrives. */
export function loadCharacterRig(group: THREE.Group, female: boolean) {
  if (typeof window === 'undefined') return;
  const url = `/characters/${female ? 'c01f' : 'c01'}-animated.glb`;
  let asset = assets.get(url);
  if (!asset) { asset = loader.loadAsync(url); assets.set(url, asset); }
  void asset.then(gltf => {
    if (group.userData.disposed) return;
    const model = clone(gltf.scene);
    // Each avatar owns its geometry/materials; removing a player cannot invalidate another.
    model.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry = object.geometry.clone();
      object.material = Array.isArray(object.material) ? object.material.map(m => m.clone()) : object.material.clone();
      for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
        if (mat instanceof THREE.MeshStandardMaterial) {
          if (mat.map) mat.map = mat.map.clone();
          mat.metalness = 0;
          mat.metalnessMap = null;
          mat.roughness = .85;
          mat.roughnessMap = null;
          mat.normalMap = null;
          mat.emissive.set(0xffffff);
          mat.emissiveMap = mat.map;
          mat.emissiveIntensity = .35;
        }
      }
      object.castShadow = true; object.receiveShadow = false;
    });
    anchorNumberStrap(model, female);
    const mixer = new THREE.AnimationMixer(model);
    const action = (name: string) => {
      const clip = gltf.animations.find(c => c.name === name);
      if (!clip) throw new Error(`Missing ${name} clip in ${url}`);
      return mixer.clipAction(clip).play();
    };
    const rig: MotionRig = { mixer, idle: action('Idle'), walk: action('Walk'), run: action('Run'), anchorHead: createHeadAnchor(model) };
    rig.idle.setEffectiveWeight(1); rig.walk.setEffectiveWeight(0); rig.run.setEffectiveWeight(0);
    group.userData.root.visible = false;
    const plate = group.userData.plate as THREE.Mesh;
    group.add(plate);
    placeNumberOnStrap(plate, female);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.27, .018, 6, 32), new THREE.MeshBasicMaterial({ color: group.userData.team === 'red' ? 0xe76760 : 0x69bfff }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .025;
    group.add(model, ring);
    group.userData.motionRig = rig;
  }).catch(error => { console.warn('Character rig unavailable; using articulated fallback.', error); assets.delete(url); });
}

export function animateCharacterRig(group: THREE.Group, time: number, amount: number, phase?: number, speed?: number) {
  const rig = group.userData.motionRig as MotionRig | undefined;
  if (!rig) return false;
  const dt = rig.lastTime === undefined ? 0 : THREE.MathUtils.clamp(time - rig.lastTime, 0, .1);
  rig.lastTime = time;
  const run = speed === undefined ? THREE.MathUtils.smoothstep(amount, .82, 1) : THREE.MathUtils.smoothstep(speed, 5.4, 7.5);
  rig.idle.setEffectiveWeight(1 - amount);
  rig.walk.setEffectiveWeight(amount * (1 - run));
  rig.run.setEffectiveWeight(amount * run);
  // The network interpolator supplies distance-based phase, freezing feet during stalls.
  if (phase !== undefined) {
    const cycle = ((phase / (Math.PI * 2)) % 1 + 1) % 1;
    rig.walk.time = cycle * rig.walk.getClip().duration;
    rig.run.time = cycle * rig.run.getClip().duration;
    rig.walk.paused = rig.run.paused = true;
  } else { rig.walk.paused = rig.run.paused = false; }
  rig.mixer.update(dt);
  rig.anchorHead();
  return true;
}

export function disposeCharacterRig(group: THREE.Group) {
  const rig = group.userData.motionRig as MotionRig | undefined;
  if (rig) { rig.mixer.stopAllAction(); rig.mixer.uncacheRoot(rig.mixer.getRoot()); }
}
