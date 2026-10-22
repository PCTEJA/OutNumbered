import * as THREE from 'three';
import { animateFlag, createFlagCloth, createFlagHardware } from './flag';
import { MotionBuffer } from './motion';
import { World } from './world';
import { createAvatar, animateAvatar, updateAvatarNumber, disposeAvatar, createEquipment } from './avatar';
import { loadCore, type GameCore } from './wasm';
import { GameAudio } from './audio';
import { AdaptiveResolution, renderPixelRatio } from './performance';
import { ZONES, PLAYER_EYE_HEIGHT, WORLD_LIMITS, type MapId } from '../shared/world';
import type { ClientMessage, ServerMessage, StateMessage, PlayerState, GameEvent, GadgetKind, GameMode } from '../shared/protocol';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const names: Record<MapId, string> = { campus: 'THE SCHOOLYARD', garden: 'GARDEN PARTY', museum: 'AFTER HOURS' };
const modeNames = { deathmatch: 'DEATHMATCH', team: 'TEAM DEATHMATCH', ctf: 'CAPTURE THE FLAG' };
const clamp = THREE.MathUtils.clamp;
interface Options { name: string; mode: GameMode; map: MapId; room?: string; practice: boolean }
interface Callbacks { onStatus: (text: string) => void; onPointerLock: (locked: boolean) => void; onDisconnect: (reason: string) => void }
interface RenderPlayer { group: THREE.Group; state: PlayerState; motion: MotionBuffer; gait: number; gaitTime: number }

export class Game {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, .075, 210);
  readonly renderer: THREE.WebGLRenderer;
  readonly world: World;
  readonly audio = new GameAudio();
  room = '';
  private core?: GameCore;
  private socket?: WebSocket;
  private state?: StateMessage;
  private id = '';
  private position = { x: 0, z: 0 };
  private correction = { x: 0, z: 0 };
  private yaw = 0;
  private pitch = 0;
  private stamina = 100;
  private digits = '';
  private playing = false;
  private controlling = false;
  private dragging = false;
  private zoomed = false;
  private sensitivity = .002;
  private map: MapId = 'campus';
  private keys = new Set<string>();
  private players = new Map<string, RenderPlayer>();
  private effects = new Map<string, THREE.Group>();
  private flags = new Map<string, { group: THREE.Group; label: HTMLElement }>();
  private particles: { mesh: THREE.Mesh; velocity: THREE.Vector3; until: number }[] = [];
  private equipment = new THREE.Group();
  private equipmentCache = new Map<string, THREE.Group>();
  private quality = '';
  private resolution = new AdaptiveResolution();
  private hudAt = 0;
  private shadowAt = 0;
  private pingAt = -Infinity;
  private pingPending?: number;
  private pingMs?: number;
  private pongAt = 0;
  private snapshotAt = 0;
  private timelineOffset = 0;
  private frameAverage = 16.7;
  private markerPoint = new THREE.Vector3();
  private heldEquipment = 'binoculars';
  private equipmentReturnAt = 0;
  private equipmentReturnKind = 'binoculars';
  private throwUntil = 0;
  private gadget: GadgetKind = 'flash';
  private abort = new AbortController();
  private lastFrame = performance.now();
  private networkAt = 0;
  private worldAt = 0;
  private footstepAt = 0;
  private photoUntil = 0;
  private photoReady = 0;
  private flashUntil = 0;
  private hitUntil = 0;
  private toastUntil = 0;
  private serverOffset = 0;
  private frameId = 0;
  private respawning = false;
  private roundShown = false;
  private firstState = true;
  private jumpAt = 0;

  constructor(private host: HTMLElement, private callbacks: Callbacks) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(renderPixelRatio('auto', devicePixelRatio, innerWidth, innerHeight));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.hidden = true;
    this.renderer.domElement.setAttribute('aria-label', 'OutNumbered 3D game. WASD to move, mouse to look, digits and Enter to eliminate.');
    host.append(this.renderer.domElement);
    this.world = new World(this.scene, group => this.renderer.compileAsync(group, this.camera, this.scene));
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.equipment = createEquipment('binoculars');
    this.equipmentCache.set('binoculars', this.equipment);
    this.equipment.visible = false;
    this.camera.add(this.equipment);
    this.equipment.position.set(.34, -.42, -.62);
    const signal = this.abort.signal;
    window.addEventListener('resize', () => this.resize(), { signal });
    document.addEventListener('keydown', e => this.keyDown(e), { signal });
    document.addEventListener('keyup', e => { this.keys.delete(e.code); if (/^(Key[WASD]|ShiftLeft|ShiftRight)$/.test(e.code)) this.sendInput(); if (e.code === 'Tab') $('scoreboard').hidden = true; }, { signal });
    document.addEventListener('mousemove', e => {
      if (!this.playing || !this.controlling || (!document.pointerLockElement && !this.dragging)) return;
      this.yaw -= e.movementX * this.sensitivity * (this.zoomed ? .37 : 1);
      this.pitch = clamp(this.pitch - e.movementY * this.sensitivity * (this.zoomed ? .37 : 1), -1.35, 1.35);
    }, { signal });
    this.renderer.domElement.addEventListener('mousedown', e => {
      if (!this.playing) return;
      if (!this.controlling) this.capture();
      this.dragging = true;
      if (e.button === 2 && this.controlling) { e.preventDefault(); this.setZoom(!this.zoomed); }
    }, { signal });
    document.addEventListener('mouseup', () => { this.dragging = false; }, { signal });
    this.renderer.domElement.addEventListener('contextmenu', e => e.preventDefault(), { signal });
    document.addEventListener('pointerlockchange', () => {
      this.controlling = document.pointerLockElement === this.renderer.domElement;
      if (!this.controlling) { this.keys.clear(); this.sendInput(); }
      this.callbacks.onPointerLock(this.controlling);
    }, { signal });
    window.addEventListener('blur', () => { this.keys.clear(); this.sendInput(); }, { signal });
    document.addEventListener('visibilitychange', () => {
      this.keys.clear(); this.sendInput();
      cancelAnimationFrame(this.frameId);
      this.resolution.reset();
      if (!document.hidden && this.playing) {
        this.lastFrame = performance.now();
        this.frameId = requestAnimationFrame(time => this.frame(time));
      }
    }, { signal });
  }

  configure(settings: { volume: number; sensitivity: number; quality: string }) {
    this.audio.volume = clamp(settings.volume / 100, 0, 1);
    this.sensitivity = .0005 + settings.sensitivity * .000035;
    const quality = ['auto', 'high', 'low'].includes(settings.quality) ? settings.quality : 'auto';
    if (quality === this.quality) return;
    this.quality = quality;
    this.resolution.scale = 1;
    this.resolution.reset();
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.renderer.shadowMap.needsUpdate = true;
    this.world.setQuality(quality);
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(m => { m.needsUpdate = true; });
      }
    });
    this.resize();
  }

  async start(options: Options): Promise<void> {
    this.callbacks.onStatus('LOADING WASM CORE');
    this.core ??= await loadCore();
    this.map = options.map;
    this.digits = '';
    this.drawDigits();
    this.firstState = true;
    this.pingAt = -Infinity; this.pingPending = this.pingMs = undefined;
    this.pongAt = this.snapshotAt = 0;
    this.frameAverage = 16.7;
    this.roundShown = false;
    this.respawning = false;
    this.stamina = 100;
    this.keys.clear();
    this.pitch = 0;
    this.photoUntil = this.photoReady = this.flashUntil = 0;
    this.equipmentReturnAt = this.throwUntil = 0;
    this.gadget = 'flash';
    this.changeEquipment('binoculars');
    $('flash-overlay').style.opacity = '0';
    $('killfeed').replaceChildren();
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/ws`);
    this.socket = socket;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = window.setTimeout(() => { fail('The match server did not respond. Check that npm run dev is running, then retry.'); }, 10000);
      const fail = (message: string) => { if (!settled) { settled = true; clearTimeout(timeout); socket.close(); reject(new Error(message)); } };
      socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'join', ...options })));
      socket.addEventListener('error', () => fail('Cannot reach the match server. Start the project with npm run dev, then try again.'));
      socket.addEventListener('message', event => {
        if (this.socket !== socket) return;
        let message: ServerMessage;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === 'error') { if (!settled) fail(message.message); else this.toast(message.message); return; }
        if (message.type === 'welcome') { this.id = message.id; this.room = message.room; $('hud-room').textContent = `ROOM ${this.room}`; }
        if (message.type === 'state') {
          this.receiveState(message);
          if (!settled) { settled = true; clearTimeout(timeout); resolve(); }
        }
        if (message.type === 'pong' && message.sentAt === this.pingPending && message.sentAt !== undefined) {
          this.pingMs = Math.round(performance.now() - message.sentAt);
          this.pongAt = performance.now();
          this.pingPending = undefined;
        }
        if (message.type === 'event') this.event(message);
      });
      socket.addEventListener('close', () => {
        if (!settled) fail('Connection closed before joining. Please try again.');
        else if (this.playing && this.socket === socket) this.callbacks.onDisconnect('Lost connection to the match server. Your progress was not saved. Rejoin to play again.');
      });
    });
    const zone = ZONES.find(z => z.id === this.map)!;
    try { await this.world.update(zone.x, zone.z); }
    catch (error) { this.leave(); throw error; }
    // Build tools between loading-screen paints, never on a player's first keypress.
    for (const kind of ['camera', 'flash', 'smoke', 'distract']) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      const equipment = createEquipment(kind);
      this.equipmentCache.set(kind, equipment);
      await this.renderer.compileAsync(equipment, this.camera, this.scene);
    }
    if (socket.readyState !== WebSocket.OPEN) throw new Error('Connection closed while preparing the arena. Please try again.');
    this.camera.clearViewOffset();
    this.controlling = false;
    this.equipment.visible = true;
    this.camera.fov = 72;
    this.camera.updateProjectionMatrix();
    $('input-prompt').textContent = 'READ THEIR FOREHEAD. REMEMBER THE NUMBER.';
    $('hud-mode').textContent = modeNames[this.state?.mode ?? options.mode];
    this.camera.position.set(this.position.x, PLAYER_EYE_HEIGHT, this.position.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.callbacks.onStatus('PREPARING THE ARENA');
    // Compile before handing over controls, so first use does not stall a live frame.
    await this.renderer.compileAsync(this.scene, this.camera);
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
    this.renderer.domElement.hidden = false;
    this.playing = true;
    this.lastFrame = performance.now();
    this.resolution.reset();
    this.frameId = requestAnimationFrame(time => this.frame(time));
  }

  capture() {
    if (!this.playing) return;
    if (this.state?.ended) { this.toast('Round complete. Leave the match to start another.'); return; }
    void this.audio.unlock().catch(() => undefined);
    this.renderer.domElement.focus();
    try {
      const result = this.renderer.domElement.requestPointerLock();
      if (result) result.catch(() => this.enableDragLook());
    } catch { this.enableDragLook(); }
  }
  private enableDragLook() {
    this.controlling = true;
    this.callbacks.onPointerLock(true);
    this.toast('Drag to look, or use arrow keys. WASD moves. Esc pauses.');
    $('capture-note').textContent = 'Drag to look · Arrow keys also turn · Esc to pause';
  }
  toast(message: string) { $('toast').textContent = message; $('toast').classList.add('visible'); this.toastUntil = performance.now() + 3400; }
  private send(message: ClientMessage) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message)); }
  private input() {
    const live = this.controlling && this.state?.players.find(p => p.id === this.id)?.alive && !this.state.ended;
    const forward = live ? Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS')) : 0;
    const strafe = live ? Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA')) : 0;
    return { forward, strafe, sprint: !!live && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) && this.stamina > 0 };
  }
  private sendInput() { if (this.playing) this.send({ type: 'input', ...this.input(), yaw: this.yaw }); }
  private keyDown(e: KeyboardEvent) {
    if (!this.playing || document.querySelector('dialog[open]')) return;
    if (e.code === 'Escape' && !document.pointerLockElement && this.controlling) { this.controlling = false; this.keys.clear(); this.sendInput(); this.callbacks.onPointerLock(false); return; }
    if (!this.controlling) return;
    if (['Tab', 'Space', 'Backspace', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code) || /^Digit|^Numpad/.test(e.code)) e.preventDefault();
    this.keys.add(e.code);
    if (!e.repeat && /^(Key[WASD]|ShiftLeft|ShiftRight)$/.test(e.code)) this.sendInput();
    if (e.code === 'Tab') { if (this.state) this.drawScoreboard(this.state); $('scoreboard').hidden = false; return; }
    if (e.repeat || !this.state?.players.find(p => p.id === this.id)?.alive) return;
    if (/^[0-9]$/.test(e.key)) { if (this.digits.length < 4) { this.digits += e.key; this.drawDigits(); this.audio.play('key'); } return; }
    if (e.code === 'Backspace') { this.digits = this.digits.slice(0, -1); this.drawDigits(); }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (this.digits.length === 4) { this.sendInput(); this.send({ type: 'submit', number: this.digits }); this.digits = ''; this.drawDigits(); }
      else this.toast('Four digits. Then Enter.');
    }
    if (e.code === 'KeyF') this.setZoom(!this.zoomed);
    if (e.code === 'KeyE') this.takePhoto();
    if (e.code === 'KeyQ') {
      this.gadget = (['flash', 'smoke', 'distract'] as GadgetKind[])[(['flash', 'smoke', 'distract'].indexOf(this.gadget) + 1) % 3];
      this.changeEquipment(this.zoomed ? 'binoculars' : this.gadget);
      $('grenade-name').textContent = this.gadget.toUpperCase();
      this.toast(`${this.gadget.toUpperCase()} GRENADE equipped. Press G to throw.`);
    }
    if (e.code === 'KeyG') {
      const cooldown = this.state.cooldowns[this.gadget];
      if (cooldown > 0) this.toast(`${this.gadget.toUpperCase()} ready in ${Math.ceil(cooldown)}s`);
      else { this.sendInput(); this.send({ type: 'gadget', kind: this.gadget }); this.changeEquipment(this.gadget); this.throwUntil = performance.now() + 450; this.audio.play('throw'); }
    }
    if (e.code === 'Space' && performance.now() - this.jumpAt > 800) this.jumpAt = performance.now();
  }

  private drawDigits() {
    Array.from($('digits').children).forEach((child, i) => { child.textContent = this.digits[i] ?? '_'; child.classList.toggle('filled', i < this.digits.length); });
  }
  private changeEquipment(kind: string) {
    if (this.heldEquipment === kind && this.equipmentCache.has(kind)) return;
    this.heldEquipment = kind;
    this.equipment.removeFromParent();
    let equipment = this.equipmentCache.get(kind);
    if (!equipment) { equipment = createEquipment(kind); this.equipmentCache.set(kind, equipment); }
    this.equipment = equipment;
    this.equipment.position.set(.34, -.42, -.62);
    this.camera.add(this.equipment);
    this.equipment.visible = this.playing && !this.zoomed;
  }
  private setZoom(value: boolean) {
    this.zoomed = value;
    if (this.playing) this.changeEquipment('binoculars');
    $('binocular-mask').hidden = !value;
    $('tool-binoculars').classList.toggle('active', value);
    this.equipment.visible = !value;
    this.audio.play('key');
  }
  private takePhoto() {
    const now = performance.now();
    if (now < this.photoReady) { this.toast(`Camera ready in ${Math.ceil((this.photoReady - now) / 1000)}s`); return; }
    const wasVisible = this.equipment.visible;
    this.equipment.visible = false;
    this.renderer.render(this.scene, this.camera);
    // Only the WebGL canvas is captured, never browser or desktop content.
    ($('photo-image') as HTMLImageElement).src = this.renderer.domElement.toDataURL('image/jpeg', .8);
    this.equipment.visible = wasVisible;
    $('photo').hidden = false;
    this.photoUntil = now + 5000;
    this.photoReady = now + 8000;
    this.equipmentReturnKind = this.heldEquipment;
    this.equipmentReturnAt = now + 700;
    this.changeEquipment('camera');
    this.audio.play('snap');
    $('tool-camera').classList.add('active');
  }

  private receiveState(state: StateMessage) {
    this.snapshotAt = performance.now();
    const offset = this.snapshotAt - state.serverTime;
    this.timelineOffset = this.firstState ? offset : Math.min(offset, this.timelineOffset + 1);
    this.state = state;
    this.serverOffset = state.serverTime - Date.now();
    this.map = state.map;
    const self = state.players.find(p => p.id === this.id);
    if (!self) return;
    if (this.firstState || this.respawning && self.alive) {
      this.position = { x: self.x, z: self.z };
      this.correction.x = this.correction.z = 0;
      this.yaw = self.yaw;
      this.pitch = 0;
      this.stamina = self.stamina;
      this.firstState = false;
      this.digits = '';
      this.drawDigits();
    } else {
      const distance = Math.hypot(self.x - this.position.x, self.z - this.position.z);
      if (distance > 2) {
        this.position.x = self.x; this.position.z = self.z;
        this.correction.x = this.correction.z = 0;
      } else {
        // Apply small authoritative corrections over rendered frames instead of
        // jerking the camera every time a 20 Hz network snapshot arrives.
        this.correction.x = distance > .35 ? self.x - this.position.x : 0;
        this.correction.z = distance > .35 ? self.z - this.position.z : 0;
      }
      if (Math.abs(self.stamina - this.stamina) > 3) this.stamina = self.stamina;
    }
    this.respawning = !self.alive;
    $('respawn-banner').hidden = self.alive;
    $('hud-player-name').textContent = `${self.name}${state.mode === 'deathmatch' ? '' : ` · ${self.team.toUpperCase()}`}`;
    $('hud-mode').textContent = modeNames[state.mode];
    for (const player of state.players) {
      if (player.id === this.id) continue;
      let rendered = this.players.get(player.id);
      if (!rendered) {
        const group = createAvatar(player.number, player.team, player.name);
        group.position.set(player.x, 0, player.z);
        this.scene.add(group);
        rendered = { group, state: player, motion: new MotionBuffer(), gait: 0, gaitTime: 0 };
        this.players.set(player.id, rendered);
      }
      if (rendered.state.number !== player.number) updateAvatarNumber(rendered.group, player.number);
      rendered.motion.push({ x: player.x, z: player.z, yaw: player.yaw, time: state.serverTime }, !rendered.state.alive && player.alive);
      rendered.state = player;
      rendered.group.visible = player.alive;
    }
    for (const [id, rendered] of this.players) if (!state.players.some(p => p.id === id)) { this.scene.remove(rendered.group); disposeAvatar(rendered.group); this.players.delete(id); }
    $('red-score').textContent = String(state.mode === 'deathmatch' ? self.score : state.scores.red);
    $('blue-score').textContent = String(state.mode === 'deathmatch' ? Math.max(...state.players.map(p => p.score)) : state.scores.blue);
    $('red-score').dataset.label = state.mode === 'deathmatch' ? 'YOU' : 'RED';
    $('blue-score').dataset.label = state.mode === 'deathmatch' ? 'LEADER' : 'BLUE';
    const minutes = Math.floor(state.timeLeft / 60);
    $('match-time').textContent = `${String(minutes).padStart(2, '0')}:${String(state.timeLeft % 60).padStart(2, '0')}`;
    const humans = state.players.filter(p => !p.isBot).length;
    const bots = state.players.length - humans;
    $('hud-online').textContent = `${humans} PLAYER${humans === 1 ? '' : 'S'}${bots ? ` + ${bots} BOTS` : ''} / 20`;
    if (!$('scoreboard').hidden) this.drawScoreboard(state);
    this.syncEffects(state);
    if (state.mode === 'ctf') this.syncFlags(state);
    if (state.ended && !this.roundShown) {
      this.roundShown = true;
      this.keys.clear();
      document.exitPointerLock();
      this.controlling = false;
      this.callbacks.onPointerLock(false);
      $('pause-title').textContent = 'That’s a wrap.';
      const winner = state.mode === 'deathmatch' ? [...state.players].sort((a, b) => b.score - a.score)[0]?.name : state.scores.red === state.scores.blue ? 'Both teams' : state.scores.red > state.scores.blue ? 'Red team' : 'Blue team';
      $('pause-copy').textContent = `${winner} ${state.scores.red === state.scores.blue && state.mode !== 'deathmatch' ? 'tied!' : 'takes the match!'} You scored ${self.score} ${state.mode === 'ctf' ? 'points' : 'eliminations'}. Leave the match to start another round.`;
      $('resume-button').textContent = 'ROUND COMPLETE';
      this.drawScoreboard(state);
      $('scoreboard').hidden = false;
    }
  }

  private drawScoreboard(state: StateMessage) {
    document.querySelector('.scoreboard-head')!.children[1].textContent = state.mode === 'ctf' ? 'POINTS' : 'ELIMINATIONS';
    const container = $('scoreboard-rows');
    container.replaceChildren();
    [...state.players].sort((a, b) => b.score - a.score || a.deaths - b.deaths).forEach(p => {
      const row = document.createElement('div');
      row.className = `scoreboard-row${p.id === this.id ? ' self' : ''}`;
      const name = document.createElement('span');
      const dot = document.createElement('i'); dot.className = p.team;
      name.append(dot, document.createTextNode(p.name));
      if (p.isBot) { const bot = document.createElement('small'); bot.textContent = 'BOT'; name.append(bot); }
      const score = document.createElement('span'); score.textContent = String(p.score);
      const deaths = document.createElement('span'); deaths.textContent = String(p.deaths);
      row.append(name, score, deaths); container.append(row);
    });
  }

  private event(event: GameEvent) {
    if (event.kind === 'elimination' || event.kind === 'capture') {
      const line = document.createElement('div'); line.className = 'killfeed-line'; line.textContent = event.text;
      $('killfeed').prepend(line);
      while ($('killfeed').children.length > 4) $('killfeed').lastElementChild?.remove();
      window.setTimeout(() => line.remove(), 7000);
      if (event.actor === this.id) {
        $('hit-confirm').textContent = event.kind === 'capture' ? 'FLAG CAPTURED +1' : 'GOT YOUR NUMBER. +1';
        this.hitUntil = performance.now() + 1900;
        this.audio.play('hit');
      }
      if (event.target === this.id) { this.audio.play('death'); this.setZoom(false); }
      if (event.x !== undefined && event.z !== undefined) this.burst(event.x, event.z);
    } else if (event.kind === 'miss' && event.actor === this.id) { this.toast(event.text); this.audio.play('miss'); }
    else if (event.kind === 'flash' && event.affectedIds?.includes(this.id)) {
      this.flashUntil = performance.now() + (event.duration ?? 2.5) * 1000;
    } else if (event.kind === 'system') this.toast(event.text);
    if (event.actor === this.id && ['flash', 'smoke', 'distract'].includes(event.kind)) this.toast(`${event.kind.toUpperCase()} deployed.`);
  }

  private burst(x: number, z: number) {
    const geometry = new THREE.BoxGeometry(.07, .07, .025);
    for (let i = 0; i < 18; i++) {
      const material = new THREE.MeshBasicMaterial({ color: [0xffd755, 0xfffae3, 0xe97651, 0x76b6ba][i % 4], transparent: true });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, 1.3, z);
      this.scene.add(mesh);
      this.particles.push({ mesh, velocity: new THREE.Vector3((Math.random() - .5) * 4, Math.random() * 3 + 1, (Math.random() - .5) * 4), until: performance.now() + 1700 });
    }
  }
  private syncEffects(state: StateMessage) {
    for (const effect of state.effects) {
      if (this.effects.has(effect.id)) continue;
      const group = new THREE.Group();
      group.position.set(effect.x, 0, effect.z);
      if (effect.kind === 'smoke') {
        const geo = new THREE.IcosahedronGeometry(1.5, 2);
        const mat = new THREE.MeshStandardMaterial({ color: 0xd0d7d0, transparent: true, opacity: .8, roughness: 1, depthWrite: false });
        for (let i = 0; i < 18; i++) { const sphere = new THREE.Mesh(geo, mat); const angle = i * 2.399; sphere.position.set(Math.cos(angle) * (i % 3), .6 + (i % 5) * .62, Math.sin(angle) * (i % 3)); group.add(sphere); }
      } else {
        const geo = new THREE.TorusGeometry(.55, .04, 6, 40);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffd655, transparent: true, opacity: .8 });
        for (let i = 0; i < 3; i++) { const ring = new THREE.Mesh(geo, mat); ring.rotation.x = Math.PI / 2; ring.position.y = .1; ring.userData.offset = i; group.add(ring); }
        const lure = createEquipment('distract', false); lure.scale.setScalar(.6); lure.position.y = .4; group.add(lure);
      }
      group.userData.kind = effect.kind;
      this.effects.set(effect.id, group);
      this.scene.add(group);
    }
    for (const [id, group] of this.effects) if (!state.effects.some(effect => effect.id === id)) { this.disposeGroup(group); this.effects.delete(id); }
  }

  private syncFlags(state: StateMessage) {
    for (const team of ['red', 'blue'] as const) {
      let flag = this.flags.get(team);
      if (!flag) {
        const group = new THREE.Group();
        group.add(createFlagHardware());
        const cloth = createFlagCloth(team); group.add(cloth);

        const label = document.createElement('div'); label.className = 'flag-marker'; label.style.borderColor = team === 'red' ? '#e85f54' : '#5894d3'; $('game-hud').append(label);
        this.scene.add(group);
        flag = { group, label }; this.flags.set(team, flag);
      }
      const data = state.flags[team];
      flag.group.position.set(data.x, data.carrierId ? .5 : 0, data.z);
      flag.group.visible = data.carrierId !== this.id;
      const ownTeam = state.players.find(p => p.id === this.id)?.team;
      const markerX = team === ownTeam ? data.homeX : data.x;
      const markerZ = team === ownTeam ? data.homeZ : data.z;
      flag.group.userData.markerPosition = new THREE.Vector3(markerX, 3.2, markerZ);
      flag.group.userData.markerVisible = team === ownTeam || data.carrierId !== this.id;
      flag.label.textContent = `${team === ownTeam ? data.carrierId ? 'YOUR FLAG IS STOLEN' : 'YOUR BASE' : data.carrierId === this.id ? 'FLAG SECURED' : 'ENEMY FLAG'} · ${Math.round(Math.hypot(markerX - this.position.x, markerZ - this.position.z))}m`;
    }
  }

  private frame(time: number) {
    if (!this.playing || document.hidden) return;
    this.frameAverage += (Math.min(time - this.lastFrame, 250) - this.frameAverage) * .05;
    if (this.quality === 'auto' && this.resolution.sample(time - this.lastFrame)) this.resize();
    const dt = Math.min((time - this.lastFrame) / 1000, .06);
    this.lastFrame = time;
    const seconds = time / 1000;
    this.world.tick(seconds);
    const { forward, strafe, sprint } = this.input();
    const moving = forward !== 0 || strafe !== 0;
    if (this.controlling) {
      this.yaw += (Number(this.keys.has('ArrowLeft')) - Number(this.keys.has('ArrowRight'))) * dt * 1.7;
      this.pitch = clamp(this.pitch + (Number(this.keys.has('ArrowUp')) - Number(this.keys.has('ArrowDown'))) * dt, -1.35, 1.35);
    }
    if (this.core) {
      const correctionAmount = 1 - Math.exp(-dt * 9);
      const corrected = this.core.move(this.position.x, this.position.z, this.correction.x * correctionAmount, this.correction.z * correctionAmount);
      this.position = corrected;
      this.correction.x *= 1 - correctionAmount;
      this.correction.z *= 1 - correctionAmount;
      const speed = sprint ? 8 : 5;
      const norm = Math.max(1, Math.hypot(forward, strafe));
      const dx = (-Math.sin(this.yaw) * forward + Math.cos(this.yaw) * strafe) / norm * speed * dt;
      const dz = (-Math.cos(this.yaw) * forward - Math.sin(this.yaw) * strafe) / norm * speed * dt;
      this.position = this.core.move(this.position.x, this.position.z, dx, dz);
      this.position.x = clamp(this.position.x, WORLD_LIMITS.minX + .38, WORLD_LIMITS.maxX - .38);
      this.position.z = clamp(this.position.z, WORLD_LIMITS.minZ + .38, WORLD_LIMITS.maxZ - .38);
      this.stamina = this.core.stamina(this.stamina, moving, sprint, dt);
    }
    if (moving && time - this.footstepAt > (sprint ? 260 : 380)) { this.audio.play('step'); this.footstepAt = time; }
    const bob = moving ? Math.sin(seconds * (sprint ? 16 : 11)) * .032 : Math.sin(seconds * 2) * .006;
    const jumpT = (time - this.jumpAt) / 650;
    const hop = jumpT > 0 && jumpT < 1 ? Math.sin(jumpT * Math.PI) * .23 : 0;
    this.camera.position.set(this.position.x, PLAYER_EYE_HEIGHT + bob + hop, this.position.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    const targetFov = this.zoomed ? 27 : sprint && moving ? 78 : 72;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, Math.min(dt * 10, 1));
    this.camera.updateProjectionMatrix();
    if (this.equipmentReturnAt && time > this.equipmentReturnAt) { this.changeEquipment(this.equipmentReturnKind); this.equipmentReturnAt = 0; }
    const throwMotion = this.throwUntil > time ? Math.sin((this.throwUntil - time) / 450 * Math.PI) * .45 : 0;
    const binoculars = this.heldEquipment === 'binoculars';
    this.equipment.position.set((binoculars ? .23 : .34) + bob * .3, -.43 + bob * .45 - throwMotion, binoculars ? -.72 : -.65);
    this.equipment.rotation.z = bob * .4;
    this.equipment.visible = !this.zoomed && !this.respawning;
    for (const rendered of this.players.values()) {
      const { group, state } = rendered;
      if (!state.alive) continue;
      const pose = rendered.motion.sample(time - this.timelineOffset - 100);
      if (!pose) continue;
      const distance = Math.hypot(pose.x - group.position.x, pose.z - group.position.z);
      const speed = distance > 3 ? 0 : distance / Math.max(dt, .001);
      group.position.set(pose.x, 0, pose.z);
      group.rotation.y = pose.yaw + Math.PI;
      rendered.gait += (Math.min(1, speed / 2.4) - rendered.gait) * (1 - Math.exp(-dt * 10));
      rendered.gaitTime += Math.min(distance, .5) * 4.4 / 8.5;
      animateAvatar(group, seconds, rendered.gait, rendered.gaitTime * 8.5);

    }
    for (const group of this.effects.values()) {
      if (group.userData.kind === 'smoke') { group.rotation.y += dt * .08; group.scale.setScalar(1 + Math.sin(seconds * .8) * .06); }
      else group.children.forEach(child => { if (child.userData.offset !== undefined) { const progress = (seconds * .65 + child.userData.offset / 3) % 1; child.scale.setScalar(.2 + progress * 6); } });
    }
    for (const flag of this.flags.values()) {
      const point = this.markerPoint.copy((flag.group.userData.markerPosition as THREE.Vector3) ?? flag.group.position).project(this.camera);
      flag.label.hidden = point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1 || !flag.group.userData.markerVisible;
      flag.label.style.left = `${(point.x * .5 + .5) * innerWidth}px`;
      flag.label.style.top = `${(-point.y * .5 + .5) * innerHeight}px`;
      animateFlag(flag.group.children[1] as THREE.Mesh, seconds);
    }
    if (time - this.pingAt >= 2000) {
      this.pingAt = time;
      this.pingPending = time;
      if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'ping', sentAt: time }));
    }
    if (time - this.networkAt >= 50) { this.sendInput(); this.networkAt = time; }
    if (time - this.worldAt > 600) {
      this.worldAt = time;
      this.world.update(this.position.x, this.position.z).catch(error => this.toast(`A map section could not load: ${error.message}`));
      const zone = ZONES.reduce((a, b) => Math.hypot(a.x - this.position.x, a.z - this.position.z) < Math.hypot(b.x - this.position.x, b.z - this.position.z) ? a : b);
      $('hud-zone').textContent = names[zone.id];
      $('hud-stream').textContent = `WASM ACTIVE · ${this.world.status.loaded}/${this.world.status.total} SECTORS RESIDENT`;
    }
    if (time - this.hudAt >= 100) {
      this.hudAt = time;
      const stale = time - this.snapshotAt > 1000;
      const ping = this.pingMs === undefined || time - this.pongAt > 6000 ? 'PING —' : `PING ${this.pingMs} ms`;
      const stats = $('hud-performance');
      stats.textContent = `${Math.round(1000 / this.frameAverage)} FPS · ${ping}${stale ? ' · CONNECTION STALLED' : ''}`;
      stats.dataset.health = stale || (this.pingMs ?? 0) > 180 ? 'poor' : this.frameAverage > 25 || (this.pingMs ?? 0) > 90 ? 'fair' : 'good';
      stats.title = `Frame ${this.frameAverage.toFixed(1)} ms · ${this.renderer.info.render.calls} draw calls · ${this.renderer.info.render.triangles.toLocaleString()} triangles · ${this.quality} · resolution ${Math.round(this.resolution.scale * 100)}%`;
      $('stamina-fill').style.width = `${Math.round(this.stamina)}%`;
      $('stamina-value').textContent = String(Math.round(this.stamina));
      if (this.photoUntil > time) $('photo-countdown').textContent = `${Math.ceil((this.photoUntil - time) / 1000)}s`;
      else { $('photo').hidden = true; $('tool-camera').classList.remove('active'); }
      if (this.respawning) {
        const self = this.state?.players.find(p => p.id === this.id);
        $('respawn-text').textContent = `Back in the game in ${Math.max(1, Math.ceil(((self?.respawnAt ?? 0) - Date.now() - this.serverOffset) / 1000))}…`;
      }
      const protection = (this.state?.players.find(p => p.id === this.id)?.protectedUntil ?? 0) - Date.now() - this.serverOffset;
      $('input-prompt').textContent = protection > 0 ? `SPAWN SHIELD · ${Math.ceil(protection / 1000)}s TO GET YOUR BEARINGS` : 'READ THEIR FOREHEAD. REMEMBER THE NUMBER.';
      const cooldown = this.state?.cooldowns[this.gadget] ?? 0;
      $('grenade-name').textContent = cooldown > 0 ? `${Math.ceil(cooldown)}s RECHARGE` : this.gadget.toUpperCase();
    }
    $('flash-overlay').style.opacity = String(clamp((this.flashUntil - time) / 1400, 0, .98));
    if (this.toastUntil && time > this.toastUntil) { $('toast').classList.remove('visible'); this.toastUntil = 0; }
    if (this.hitUntil && time > this.hitUntil) { $('hit-confirm').textContent = ''; this.hitUntil = 0; }
    this.particles = this.particles.filter(particle => {
      if (time >= particle.until) { this.scene.remove(particle.mesh); particle.mesh.geometry.dispose(); (particle.mesh.material as THREE.Material).dispose(); return false; }
      particle.velocity.y -= dt * 3;
      particle.mesh.position.addScaledVector(particle.velocity, dt);
      particle.mesh.rotation.x += dt * 3;
      (particle.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, (particle.until - time) / 600);
      return true;
    });
    if (this.renderer.shadowMap.enabled && time - this.shadowAt >= (this.quality === 'high' ? 0 : 1000 / 30)) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowAt = time;
    }
    this.renderer.render(this.scene, this.camera);
    this.frameId = requestAnimationFrame(next => this.frame(next));
  }

  private resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(renderPixelRatio(this.quality, devicePixelRatio, innerWidth, innerHeight, this.resolution.scale));
    this.renderer.setSize(innerWidth, innerHeight);
  }
  private disposeGroup(group: THREE.Group) {
    this.scene.remove(group);
    group.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => m.dispose()); } });
  }
  leave() {
    cancelAnimationFrame(this.frameId);
    this.playing = false;
    this.controlling = false;
    this.keys.clear();
    this.socket?.close();
    this.socket = undefined;
    this.state = undefined;
    if (document.pointerLockElement) document.exitPointerLock();
    this.setZoom(false);
    this.equipment.visible = false;
    for (const player of this.players.values()) { this.scene.remove(player.group); disposeAvatar(player.group); }
    this.players.clear();
    for (const group of this.effects.values()) this.disposeGroup(group);
    this.effects.clear();
    for (const flag of this.flags.values()) { this.disposeGroup(flag.group); flag.label.remove(); }
    this.flags.clear();
  }
  dispose() {
    this.leave();
    cancelAnimationFrame(this.frameId);
    this.abort.abort();
    this.equipmentCache.forEach(equipment => disposeAvatar(equipment));
    this.equipmentCache.clear();
    for (const particle of this.particles) { particle.mesh.removeFromParent(); particle.mesh.geometry.dispose(); (particle.mesh.material as THREE.Material).dispose(); }
    this.particles = [];
    this.world.dispose();
    this.audio.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
