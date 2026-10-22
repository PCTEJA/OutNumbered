import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let template: THREE.Group | undefined;
let loading: Promise<void> | undefined;

/** Load once before joining a match; failed downloads can be retried. */
export function loadCharacterModel(): Promise<void> {
  return loading ??= new GLTFLoader().loadAsync('/characters/c01f-varsity.glb').then(gltf => {
    template = normalizeCharacterModel(gltf.scene);
  }).catch(error => {
    loading = undefined;
    throw new Error('Could not load the character. Please try again.', { cause: error });
  });
}

export function normalizeCharacterModel(model: THREE.Group): THREE.Group {
  const bounds = new THREE.Box3().setFromObject(model);
  const height = bounds.max.y - bounds.min.y;
  if (!Number.isFinite(height) || height <= 0) throw new Error('Invalid character bounds');
  const root = new THREE.Group();
  root.add(model);
  const scale = 1.8 / height;
  model.scale.multiplyScalar(scale);
  model.position.set(-(bounds.min.x + bounds.max.x) * scale / 2, -bounds.min.y * scale,
    -(bounds.min.z + bounds.max.z) * scale / 2);
  root.traverse(object => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = object.receiveShadow = true;
      object.userData.sharedCharacterGeometry = true;
    }
  });
  return root;
}

export function cloneCharacterModel(): THREE.Group | undefined {
  const model = template?.clone(true);
  // Geometry/textures are cached; materials are private for studio wireframe mode.
  model?.traverse(object => {
    if (object instanceof THREE.Mesh) {
      object.material = Array.isArray(object.material)
        ? object.material.map(material => material.clone()) : object.material.clone();
    }
  });
  return model;
}
