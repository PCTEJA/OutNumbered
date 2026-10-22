import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createAvatar, animateAvatar, createEquipment, disposeAvatar } from './game/avatar';
import './character-studio.css';

type View = 'body' | 'face' | 'hands' | 'portrait';
type Team = 'red' | 'blue';
const app = document.querySelector<HTMLDivElement>('#studio')!;
app.innerHTML = `
  <header class="studio-header">
    <a class="wordmark" href="/">OUT<span>NUMBERED</span></a>
    <a class="return-link" href="/">Back to the game <span aria-hidden="true">↗</span></a>
  </header>
  <main class="studio-layout">
    <aside class="studio-panel" aria-label="Character settings">
      <div class="panel-heading">
        <p class="eyebrow">Meet your team</p>
        <h1>Character<br> studio.</h1>
        <p class="intro">A closer look at the crew. Pick a character, turn them around, and explore the details.</p>
      </div>
      <fieldset class="control-group">
        <legend>Explore</legend>
        <div class="segmented" data-control="mode">
          <button data-value="character" aria-pressed="true">Characters</button>
          <button data-value="equipment" aria-pressed="false">Equipment</button>
        </div>
      </fieldset>
      <fieldset class="control-group" data-character-setting>
        <legend>Character</legend>
        <div class="variants" data-control="number">
          <button data-value="2634" aria-pressed="true"><span class="variant-dot" style="--swatch:#dcaa87"></span>Swept polo</button>
          <button data-value="2928" aria-pressed="false"><span class="variant-dot" style="--swatch:#b98466"></span>Varsity</button>
          <button data-value="4875" aria-pressed="false"><span class="variant-dot" style="--swatch:#916347"></span>Curly hoodie</button>
          <button data-value="3141" aria-pressed="false"><span class="variant-dot" style="--swatch:#d5a185"></span>Ponytail polo</button>
        </div>
      </fieldset>
      <fieldset class="control-group" data-character-setting>
        <legend>Team colours</legend>
        <div class="segmented" data-control="team">
          <button data-value="blue" aria-pressed="true"><span class="team-dot"></span>Blue</button>
          <button data-value="red" aria-pressed="false"><span class="team-dot red"></span>Red</button>
        </div>
      </fieldset>
      <fieldset class="control-group" data-character-setting>
        <legend>Movement</legend>
        <div class="segmented" data-control="motion">
          <button data-value="idle" aria-pressed="true">Standing</button>
          <button data-value="walk" aria-pressed="false">Walking</button>
        </div>
      </fieldset>
      <fieldset class="control-group" data-equipment-setting hidden>
        <legend>In your hands</legend>
        <div class="equipment-controls" data-control="equipment">
          <button data-value="binoculars" aria-pressed="true">Binoculars</button>
          <button data-value="camera" aria-pressed="false">Camera</button>
          <button data-value="smoke" aria-pressed="false">Smoke</button>
          <button data-value="flash" aria-pressed="false">Flash</button>
        </div>
      </fieldset>
      <fieldset class="control-group" data-character-setting>
        <legend>Inspection</legend>
        <div class="segmented" data-control="debug">
          <button data-value="beauty" aria-pressed="true">Shaded</button>
          <button data-value="wire" aria-pressed="false">Wireframe</button>
        </div>
        <p id="mesh-budget" class="studio-note"></p>
      </fieldset>
      <fieldset class="control-group" data-character-setting>
        <legend>Turntable</legend>
        <div class="segmented" data-control="angle">
          <button data-value="0" aria-pressed="true">Front</button>
          <button data-value="90" aria-pressed="false">Side</button>
          <button data-value="180" aria-pressed="false">Back</button>
        </div>
      </fieldset>
      <p class="studio-note">The same characters and equipment you’ll see in the game, ready to explore from every angle.</p>
    </aside>
    <section class="studio-viewport" aria-label="Interactive 3D character preview">
      <div class="stage"></div>
      <div class="view-label" aria-live="polite"><strong id="subject-title">Character 2634</strong><span id="subject-caption">Blue team · Standing</span></div>
      <div class="view-count"><span>360°</span> VIEW</div>
      <div class="stage-toolbar" data-control="view" aria-label="Camera views">
        <button data-value="body" aria-pressed="true">Full body</button>
        <button data-value="face" aria-pressed="false">Face</button>
        <button data-value="hands" aria-pressed="false">Hands</button>
        <button data-value="portrait" aria-pressed="false">Portrait</button>
      </div>
      <p class="interaction-hint">Drag to rotate <span>·</span> Scroll or pinch to zoom</p>
    </section>
  </main>
`;

const stage = app.querySelector<HTMLDivElement>('.stage')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.domElement.setAttribute('aria-label', 'Drag to rotate the character. Use the buttons below for close-up views.');
renderer.domElement.setAttribute('role', 'img');
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9e7df);
scene.fog = new THREE.Fog(0xe9e7df, 10, 25);
const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 60);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 0.35;
controls.maxDistance = 7;
controls.maxPolarAngle = Math.PI * 0.56;

scene.add(new THREE.HemisphereLight(0xfff8eb, 0x7d9388, 1.25));
const key = new THREE.DirectionalLight(0xffefd8, 2.6);
key.position.set(-3, 5, 4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -2.3;
key.shadow.camera.right = 2.3;
key.shadow.camera.top = 3.2;
key.shadow.camera.bottom = -1;
key.shadow.normalBias = 0.015;
key.shadow.bias = -0.0001;
key.shadow.radius = 5;
scene.add(key);
const rim = new THREE.DirectionalLight(0xe4eeff, 1.6);
rim.position.set(3, 3, -3);
scene.add(rim);
const fill = new THREE.DirectionalLight(0xfff9ef, 0.8);
fill.position.set(2, 1, 5);
scene.add(fill);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0xe1e0d5, roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.055;
floor.receiveShadow = true;
scene.add(floor);
const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.91, 0.94, 0.075, 96), new THREE.MeshStandardMaterial({ color: 0xd5d9cd, roughness: 0.9 }));
plinth.position.y = -0.025;
plinth.receiveShadow = true;
scene.add(plinth);
const ring = new THREE.Mesh(new THREE.TorusGeometry(0.91, 0.003, 8, 96), new THREE.MeshStandardMaterial({ color: 0xaab6a6, roughness: 0.7 }));
ring.rotation.x = Math.PI / 2;
ring.position.y = 0.014;
scene.add(ring);

let number = '2634';
let team: Team = 'blue';
let walking = false;
let equipment = 'binoculars';
let mode = 'character';
let wireframe = false;
let view: View = 'body';
let turntableAngle = 0;
let subject = createAvatar(number, team);
scene.add(subject);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const targetPosition = new THREE.Vector3();
const targetLook = new THREE.Vector3();
let framing = false;

function setPressed(control: string, value: string) {
  app.querySelectorAll<HTMLButtonElement>(`[data-control="${control}"] button`).forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.value === value));
  });
}

function frame(instant = false) {
  const numberSocket = subject.getObjectByName('NumberSocket');
  if (numberSocket) numberSocket.visible = view !== 'portrait';
  subject.updateMatrixWorld(true);
  if (mode === 'equipment') {
    // Equipment points along -Z; the +Z camera shows the player's side of the grip.
    const bounds = new THREE.Box3().setFromObject(subject);
    const centre = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const distance = Math.max(size.x / camera.aspect, size.y, size.z) * (view === 'hands' ? 2.35 : 2.9);
    targetLook.copy(centre);
    targetPosition.copy(centre).add(new THREE.Vector3(0.6, 0.28, 1).normalize().multiplyScalar(distance));
  } else if (view === 'face' || view === 'portrait') {
    const head = subject.userData.head as THREE.Object3D | undefined;
    targetLook.copy(head ? head.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, 1.55, 0));
    targetLook.y += 0.02;
    targetPosition.copy(targetLook).add(new THREE.Vector3(0.44, 0.1, 1.15).multiplyScalar(Math.max(1, 0.8 / camera.aspect)));
  } else if (view === 'hands') {
    targetLook.set(-0.3, 0.81, 0.04);
    targetPosition.copy(targetLook).add(new THREE.Vector3(-0.63, 0.16, 0.97).multiplyScalar(Math.max(1, 0.8 / camera.aspect)));
  } else {
    const bounds = new THREE.Box3().setFromObject(subject);
    const size = bounds.getSize(new THREE.Vector3());
    targetLook.set(0, (bounds.min.y + bounds.max.y) / 2 - size.y * 0.045, 0);
    const distance = Math.max(size.y, size.x / camera.aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.43;
    targetPosition.copy(targetLook).add(new THREE.Vector3(0.38, 0.12, 1).normalize().multiplyScalar(distance));
  }
  framing = true;
  if (instant || reducedMotion.matches) {
    camera.position.copy(targetPosition);
    controls.target.copy(targetLook);
    framing = false;
    controls.update();
  }
}

function updateLabels() {
  app.querySelector('#subject-title')!.textContent = mode === 'character' ? `Character ${number}` : equipment === 'flash' ? 'Flash canister' : equipment === 'smoke' ? 'Smoke canister' : equipment[0].toUpperCase() + equipment.slice(1);
  app.querySelector('#subject-caption')!.textContent = mode === 'character' ? `${team === 'blue' ? 'Blue' : 'Red'} team · ${view === 'portrait' ? 'Portrait · number hidden for inspection' : walking ? 'Walking' : 'Standing'}` : 'Hands & equipment · Grip detail';
}

function inspectSubject() {
  let triangles = 0, draws = 0;
  subject.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    draws++;
    triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) if ('wireframe' in material) material.wireframe = wireframe;
  });
  app.querySelector('#mesh-budget')!.textContent = `${Math.round(triangles).toLocaleString()} triangles · ${draws} meshes`;
}
inspectSubject();

function rebuild() {
  disposeAvatar(subject);
  subject = mode === 'character' ? createAvatar(number, team) : createEquipment(equipment, true);
  if (mode === 'character') subject.rotation.y = turntableAngle;
  if (mode === 'equipment') {
    subject.position.y = 1.1;
    subject.traverse(object => { if (object instanceof THREE.Mesh) object.castShadow = true; });
  }
  scene.add(subject);
  inspectSubject();
  plinth.visible = ring.visible = mode === 'character';
  app.querySelectorAll<HTMLElement>('[data-character-setting]').forEach(el => { el.hidden = mode !== 'character'; });
  app.querySelectorAll<HTMLElement>('[data-equipment-setting]').forEach(el => { el.hidden = mode !== 'equipment'; });
  const faceButton = app.querySelector<HTMLButtonElement>('[data-control="view"] [data-value="face"]')!;
  faceButton.hidden = mode === 'equipment';
  app.querySelector<HTMLButtonElement>('[data-control="view"] [data-value="portrait"]')!.hidden = mode === 'equipment';
  app.querySelector('[data-control="view"] [data-value="body"]')!.textContent = mode === 'equipment' ? 'Complete view' : 'Full body';
  updateLabels();
  frame();
}

app.querySelectorAll<HTMLButtonElement>('[data-control] button').forEach(button => {
  button.addEventListener('click', () => {
    const control = button.closest<HTMLElement>('[data-control]')!.dataset.control!;
    const value = button.dataset.value!;
    setPressed(control, value);
    if (control === 'angle') {
      turntableAngle = Number(value) * Math.PI / 180;
      subject.rotation.y = turntableAngle;
    } else if (control === 'debug') {
      wireframe = value === 'wire'; inspectSubject();
    } else if (control === 'view') {
      view = value as View;
      updateLabels();
      if (view === 'hands' && mode === 'character') {
        walking = false;
        setPressed('motion', 'idle');
        updateLabels();
      }
      frame();
    } else if (control === 'motion') {
      walking = value === 'walk';
      updateLabels();
    } else {
      if (control === 'number') number = value;
      if (control === 'team') team = value as Team;
      if (control === 'equipment') equipment = value;
      if (control === 'mode') {
        mode = value;
        view = 'body';
        setPressed('view', view);
      }
      rebuild();
    }
  });
});
controls.addEventListener('start', () => { framing = false; });

let lastWidth = 0;
let lastHeight = 0;
const resize = new ResizeObserver(() => {
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  if (!width || !height || (width === lastWidth && height === lastHeight)) return;
  lastWidth = width;
  lastHeight = height;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  frame(true);
});
resize.observe(stage);

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const delta = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  if (mode === 'character') animateAvatar(subject, reducedMotion.matches && !walking ? 0 : time, walking ? 0.8 : 0);
  if (framing) {
    const alpha = 1 - Math.exp(-delta * 10);
    camera.position.lerp(targetPosition, alpha);
    controls.target.lerp(targetLook, alpha);
    if (camera.position.distanceToSquared(targetPosition) < 0.00001 && controls.target.distanceToSquared(targetLook) < 0.00001) framing = false;
  }
  controls.update();
  renderer.render(scene, camera);
});

window.addEventListener('pagehide', () => {
  renderer.setAnimationLoop(null);
  resize.disconnect();
  controls.dispose();
  disposeAvatar(subject);
  for (const mesh of [floor, plinth, ring]) { mesh.geometry.dispose(); mesh.material.dispose(); }
  renderer.dispose();
}, { once: true });

