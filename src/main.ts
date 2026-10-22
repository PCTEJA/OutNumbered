import './style.css';
import './lobby.css';
import { icon } from './icons';
import type { Game } from './game/game';
import type { MapId } from './shared/world';

type Mode = 'deathmatch' | 'team' | 'ctf';
const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const safeRead = (key: string, fallback: string) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const safeWrite = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* Private browsing can block persistence. */ } };
let mode: Mode = 'ctf';
let map: MapId = 'garden';
let game: Game | undefined;
let starting = false;
let playing = false;
let practice = true;
const settings = { volume: Number(safeRead('on-volume', '55')), sensitivity: Number(safeRead('on-sensitivity', '50')), quality: safeRead('on-quality', 'auto') };
const maps = {
  campus: { name: 'Schoolyard', subtitle: 'Sunlit courts. Close quarters.', label: 'THE SCHOOLYARD' },
  garden: { name: 'Garden Party', subtitle: 'Green hideouts. Long sightlines.', label: 'GARDEN PARTY' },
  museum: { name: 'After Hours', subtitle: 'Museum halls. Clever cover.', label: 'AFTER HOURS' },
};

$('#app').innerHTML = `
  <div id="world" aria-label="Game arena"><img id="arena-preview" src="/arenas/garden.webp" alt="" fetchpriority="high" /></div>
  <div class="menu-vignette" id="menu-vignette"></div>
  <div id="lobby" class="lobby">
    <header class="topbar">
      <a class="wordmark" href="/" aria-label="OutNumbered home">${icon('hash')} OUT<span>NUMBERED</span><sup>™</sup></a>
      <nav aria-label="Main navigation"><button class="nav-button active" id="play-tab">PLAY</button><a class="nav-button character-link" href="/characters.html">CHARACTERS</a><button class="nav-button" id="how-button">HOW TO PLAY ${icon('arrow')}</button></nav>
      <div class="header-end"><span class="build-pill">EARLY PLAYTEST <i></i></span><button class="icon-button" id="sound-button" aria-label="Mute sound" aria-pressed="false">${icon('sound')}</button><button class="icon-button" id="settings-button" aria-label="Settings">${icon('settings')}</button></div>
    </header>
    <main class="lobby-content">
      <section class="match-panel">
        <div class="eyebrow"><span></span> READY WHEN YOU ARE</div>
        <h1>Read it.<br> Type it.<br><em>Eliminate.</em></h1>
        <p class="intro">Your eyes are your weapon.</p>
        <div class="match-setup">
          <div class="section-label">GAME MODE</div>
          <div class="mode-options" role="group" aria-label="Game mode">
            <button class="mode-card" data-mode="deathmatch" aria-pressed="false">${icon('target')}<strong>Deathmatch</strong><span>EVERY PLAYER FOR THEMSELVES</span><i>${icon('check')}</i></button>
            <button class="mode-card" data-mode="team" aria-pressed="false">${icon('team')}<strong>Team match</strong><span>TWO TEAMS. ONE WINNER.</span><i>${icon('check')}</i></button>
            <button class="mode-card selected" data-mode="ctf" aria-pressed="true">${icon('flag')}<strong>Capture the flag</strong><span>GRAB. TYPE. BRING IT HOME.</span><i>${icon('check')}</i></button>
          </div>
          <div class="play-style"><div class="section-label">PLAY STYLE</div><div class="session-switch" role="group" aria-label="Session type"><button class="selected" id="practice-button" aria-pressed="true">Practice</button><button id="online-button" aria-pressed="false">Multiplayer</button></div></div>
          <div class="player-row"><label for="nickname">YOUR CALLSIGN</label><input id="nickname" maxlength="18" autocomplete="off" placeholder="Enter your name" value="${escape(safeRead('on-name', 'Rookie'))}" /></div>
          <div class="room-row" id="room-row" hidden><label for="room-code">ROOM CODE <small>optional</small></label><input id="room-code" maxlength="12" placeholder="AUTO MATCHMAKING" autocomplete="off" /></div>
          <button id="launch-button" class="launch-button"><span>LET’S PLAY</span>${icon('arrow')}</button>
          <p id="launch-status" class="launch-status" role="status">Five bots. No pressure.</p>
        </div>
      </section>
      <section class="arena-stage" aria-label="Arena preview and selection">
        <div class="preview-status" title="Preview of the playable arena">${icon('eye')} ARENA PREVIEW <span id="preview-loading" class="sr-only" role="status">READY WHEN YOU ARE</span></div>
        <div class="arena-bottom">
          <section class="scene-caption" aria-label="Arena information" aria-live="polite">
            <span class="scene-index" id="scene-index">PLAYGROUND 02</span>
            <h2 id="map-name">GARDEN PARTY</h2>
            <p id="map-subtitle">Green hideouts. Long sightlines.</p>
          </section>
          <div class="map-options" role="group" aria-label="Starting arena">
            ${(['campus', 'garden', 'museum'] as MapId[]).map(id => `<button class="map-card ${id === map ? 'selected' : ''}" data-map="${id}" aria-pressed="${id === map}"><span class="map-art ${id}-art"><img src="/arenas/${id}.webp" alt="" /><i class="map-check">${icon('check')}</i></span><span>${maps[id].name}</span></button>`).join('')}
          </div>
        </div>
      </section>
    </main>
    <footer class="lobby-footer"><span>${icon('keyboard')} KEYBOARD + MOUSE</span><div><span>SPOT THE NUMBER</span><i>→</i><span>TYPE FOUR DIGITS</span><i>→</i><span>HIT ENTER</span></div></footer>
  </div>
  <div id="game-hud" class="game-hud" hidden>
    <div class="hud-top-left"><div class="hud-brand">${icon('hash')} OUTNUMBERED</div><span id="hud-zone">THE SCHOOLYARD</span><small id="hud-stream">STREAMING WORLD</small></div>
    <div class="match-score"><div><span class="score-block red" id="red-score">0</span><span class="score-vs">VS</span><span class="score-block blue" id="blue-score">0</span></div><strong id="match-time">05:00</strong><span id="hud-mode">DEATHMATCH</span></div>
    <div class="hud-top-right"><button id="share-room" title="Copy room code">${icon('copy')} <span id="hud-room">ROOM</span></button><small id="hud-online">CONNECTING</small><small id="hud-performance" title="Frame rate and round-trip network latency">— FPS · PING —</small><div id="killfeed"></div></div>
    <div class="reticle" id="reticle"><i></i></div>
    <div class="binocular-mask" id="binocular-mask" hidden></div>
    <div class="photo" id="photo" hidden><img id="photo-image" alt="Captured view of your opponents"/><div><span>ONE MORE LOOK.</span><span id="photo-countdown">5s</span></div></div>
    <div id="flash-overlay" class="flash-overlay"></div>
    <div class="hit-confirm" id="hit-confirm"></div>
    <div class="number-entry"><span id="input-prompt">READ THEIR FOREHEAD. REMEMBER THE NUMBER.</span><div id="digits"><b>_</b><b>_</b><b>_</b><b>_</b></div><small><kbd>0–9</kbd> TYPE <i>·</i> <kbd>ENTER</kbd> ELIMINATE <i>·</i> <kbd>⌫</kbd> DELETE</small></div>
    <div class="hud-player"><div class="player-id"><span>${icon('target')}</span><div><strong id="hud-player-name">Rookie</strong><small>YOUR NUMBER IS HIDDEN</small></div></div><div class="stamina-label">${icon('bolt')}<span>SPRINT</span><span id="stamina-value">100</span></div><div class="stamina-track"><i id="stamina-fill"></i></div><p><kbd>W A S D</kbd> MOVE <kbd>SHIFT</kbd> SPRINT <kbd>SPACE</kbd> JUMP <kbd>ESC</kbd> PAUSE</p></div>
    <div class="hud-tools"><div class="tool active" id="tool-binoculars">${icon('binoculars')}<span>BINOCULARS</span><kbd>F</kbd></div><div class="tool" id="tool-camera">${icon('camera')}<span>SNAPSHOT</span><kbd>E</kbd></div><div class="tool" id="tool-grenade">${icon('bolt')}<span id="grenade-name">FLASH</span><kbd>G</kbd></div><p><kbd>Q</kbd> SWITCH GRENADE <i>·</i> <kbd>TAB</kbd> SCOREBOARD</p></div>
    <div class="toast" id="toast" role="status"></div>
    <div class="respawn-banner" id="respawn-banner" hidden><span>THEY DID THE MATH.</span><h2>OUTNUMBERED.</h2><p id="respawn-text">Back in the game in 3…</p></div>
    <section class="scoreboard" id="scoreboard" hidden><div class="section-label"><span>MATCH SCOREBOARD</span><span>HOLD TAB</span></div><h2>Who’s counting?</h2><div class="scoreboard-head"><span>PLAYER</span><span>ELIMINATIONS</span><span>DEATHS</span></div><div id="scoreboard-rows"></div></section>
  </div>
  <div id="pause" class="pause-overlay" hidden><div class="pause-card"><div class="eyebrow">TAKE A BREATHER</div><h2 id="pause-title">Eyes back<br>in the game.</h2><p id="pause-copy">Read a forehead, type its four digits, then press Enter. Your match continues while paused.</p><button id="resume-button" class="launch-button">JUMP IN ${icon('arrow')}</button><div class="pause-actions"><button id="pause-settings">Settings</button><button id="leave-button">${icon('exit')} Leave match</button></div><small id="capture-note">Click to capture your mouse · Esc to release</small></div></div>
  <dialog id="modal"><div id="modal-content"></div><button id="close-modal" class="icon-button modal-close" aria-label="Close dialog">${icon('close')}</button></dialog>
`;

const modal = $('#modal') as HTMLDialogElement;
let lastSoundVolume = settings.volume || 55;
function syncSoundButton() {
  const muted = settings.volume === 0;
  $('#sound-button').setAttribute('aria-pressed', String(muted));
  $('#sound-button').setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
}
syncSoundButton();
$('#sound-button').addEventListener('click', () => {
  if (settings.volume > 0) { lastSoundVolume = settings.volume; settings.volume = 0; }
  else settings.volume = lastSoundVolume;
  safeWrite('on-volume', String(settings.volume));
  game?.configure(settings);
  syncSoundButton();
});
function closeModal() { modal.close(); }
$('#close-modal').addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
$('#how-button').addEventListener('click', () => {
  $('#modal-content').innerHTML = `<div class="eyebrow">WELCOME TO THE NUMBERS GAME</div><h2>No bullets.<br>Just brainpower.</h2><p>Everyone has four digits on their forehead. Read an opponent’s number, type it, and press Enter to tag them out. Yours is hidden from you.</p><div class="tutorial-steps"><article><b>01</b>${icon('eye')}<h3>Get a good look.</h3><p>Move with WASD, look with your mouse. Hold Shift to sprint. Press Space to jump. Keep your forehead out of sight.</p></article><article><b>02</b>${icon('keyboard')}<h3>Make it count.</h3><p>Type 0–9, use Backspace to correct, and Enter to submit. You have a few seconds to recall a seen number.</p></article><article><b>03</b>${icon('bolt')}<h3>Play a little dirty.</h3><p>F zooms binoculars. E takes a photo for five seconds. Q selects a grenade; G throws it.</p></article></div><div class="tutorial-modes"><p><b>Deathmatch</b> Every player is a target.</p><p><b>Team match</b> Tag the other color. Your color appears beside your name.</p><p><b>Capture the flag</b> Reach the enemy flag, then bring it to your base while your flag is home. Follow the flag markers.</p></div><div class="modal-note">${icon('globe')} Choose Multiplayer and share a room code to play with friends. A room holds up to 20 players.</div>`;
  modal.showModal();
});

function showSettings() {
  $('#modal-content').innerHTML = `<div class="eyebrow">MAKE YOURSELF COMFORTABLE</div><h2>Your game.<br>Your settings.</h2><div class="setting-row"><label for="volume">Sound volume</label><output id="volume-label">${settings.volume}%</output><input type="range" id="volume" min="0" max="100" value="${settings.volume}" /></div><div class="setting-row"><label for="sensitivity">Mouse sensitivity</label><output id="sensitivity-label">${settings.sensitivity}%</output><input type="range" id="sensitivity" min="10" max="100" value="${settings.sensitivity}" /></div><div class="setting-row"><label for="quality">Graphics quality</label><select id="quality"><option value="auto">Auto — adaptive performance</option><option value="high">High — soft shadows</option><option value="low">Low — better performance</option></select></div><p class="settings-caption">Settings save automatically on this browser. A desktop keyboard and mouse are recommended for play.</p>`;
  ($('#quality') as HTMLSelectElement).value = settings.quality;
  for (const key of ['volume', 'sensitivity'] as const) $(`#${key}`).addEventListener('input', e => { settings[key] = Number((e.target as HTMLInputElement).value); safeWrite(`on-${key}`, String(settings[key])); $(`#${key}-label`).textContent = `${settings[key]}%`; game?.configure(settings); syncSoundButton(); });
  $('#quality').addEventListener('change', e => { settings.quality = (e.target as HTMLSelectElement).value; safeWrite('on-quality', settings.quality); game?.configure(settings); });
  modal.showModal();
}
$('#settings-button').addEventListener('click', showSettings);
$('#pause-settings').addEventListener('click', showSettings);
$('#play-tab').addEventListener('click', () => $('#launch-button').focus());
document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => button.addEventListener('click', () => {
  mode = button.dataset.mode as Mode;
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b => { b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', String(b === button)); });
}));
function chooseMap(next: MapId) {
  map = next;
  document.querySelectorAll<HTMLButtonElement>('[data-map]').forEach(b => { b.classList.toggle('selected', b.dataset.map === map); b.setAttribute('aria-pressed', String(b.dataset.map === map)); });
  const index = ['campus', 'garden', 'museum'].indexOf(map) + 1;
  $('#scene-index').textContent = `PLAYGROUND 0${index}`;
  $('#map-name').textContent = maps[map].label;
  $('#map-subtitle').textContent = maps[map].subtitle;
  ($('#arena-preview') as HTMLImageElement).src = `/arenas/${map}.webp`;
}
document.querySelectorAll<HTMLButtonElement>('[data-map]').forEach(button => button.addEventListener('click', () => chooseMap(button.dataset.map as MapId)));
function sessionType(value: boolean) {
  practice = value;
  $('#practice-button').classList.toggle('selected', practice);
  $('#online-button').classList.toggle('selected', !practice);
  $('#practice-button').setAttribute('aria-pressed', String(practice));
  $('#online-button').setAttribute('aria-pressed', String(!practice));
  $('#room-row').hidden = practice;
  $('#launch-status').textContent = practice ? 'Five bots. No pressure.' : 'Join friends or find a room.';
}
$('#practice-button').addEventListener('click', () => sessionType(true));
$('#online-button').addEventListener('click', () => sessionType(false));
const invite = new URL(location.href).searchParams.get('room');
if (invite) { sessionType(false); ($('#room-code') as HTMLInputElement).value = invite.replace(/[^a-z0-9-]/gi, '').slice(0, 12); }

async function prepareGame() {
  const module = await import('./game/game');
  game = new module.Game($('#world'), {
    onStatus: text => {
      $('#preview-loading').textContent = text;
      if (starting) $('#launch-status').textContent = text === 'LOADING WASM CORE' ? 'Starting your match…' : 'Preparing your arena…';
    },
    onPointerLock: locked => { if (playing) $('#pause').hidden = locked; },
    onDisconnect: reason => { if (playing) { leave(); $('#launch-status').textContent = reason; $('#launch-status').classList.add('error'); } },
  });
  game.configure(settings);
  return game;
}
$('#launch-button').addEventListener('click', async () => {
  if (starting) return;
  starting = true;
  const button = $('#launch-button') as HTMLButtonElement;
  button.disabled = true;
  $('#launch-status').classList.remove('error');
  $('#launch-status').textContent = 'Loading the WebAssembly core and connecting to your match…';
  button.innerHTML = `<span>GETTING YOU IN</span><span class="spinner"></span>`;
  try {
    // Let the loading feedback paint before constructing any WebGL resources.
    await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    const engine = game ?? await prepareGame();
    const name = ($('#nickname') as HTMLInputElement).value.trim() || 'Rookie';
    safeWrite('on-name', name);
    await engine.start({ name, mode, map, practice, room: ($('#room-code') as HTMLInputElement).value.trim().toUpperCase() || undefined });
    playing = true;
    $('#arena-preview').hidden = true;
    $('#lobby').hidden = true;
    $('#menu-vignette').hidden = true;
    $('#game-hud').hidden = false;
    $('#pause').hidden = false;
    $('#pause-title').innerHTML = 'Ready or not.<br>Here you count.';
    $('#resume-button').innerHTML = `JUMP IN ${icon('arrow')}`;
    $('#pause-copy').textContent = 'Read a forehead, type its four digits, then press Enter. Move with WASD, press Space to jump, and look with your mouse. In team modes, your color appears beside your name.';
  } catch (error) {
    game?.dispose();
    game = undefined;
    $('#launch-status').textContent = (error as Error).message;
    $('#launch-status').classList.add('error');
  } finally {
    starting = false;
    button.disabled = false;
    button.innerHTML = `<span>LET’S PLAY</span>${icon('arrow')}`;
  }
});
$('#resume-button').addEventListener('click', () => { game?.capture(); $('#pause-title').innerHTML = 'Eyes back<br>in the game.'; $('#resume-button').innerHTML = `BACK TO IT ${icon('arrow')}`; });
function leave() {
  playing = false;
  game?.dispose();
  game = undefined;
  $('#arena-preview').hidden = false;
  $('#preview-loading').textContent = 'READY WHEN YOU ARE';
  $('#lobby').hidden = false;
  $('#menu-vignette').hidden = false;
  $('#game-hud').hidden = true;
  $('#pause').hidden = true;
  $('#scoreboard').hidden = true;
  $('#photo').hidden = true;
  $('#respawn-banner').hidden = true;
  sessionType(practice);
}
$('#leave-button').addEventListener('click', leave);
$('#share-room').addEventListener('click', async () => {
  if (!game?.room) return;
  try { await navigator.clipboard.writeText(game.room); game.toast(`Room ${game.room} copied. Choose Multiplayer to join.`); }
  catch { game.toast(`Room code: ${game.room}`); }
});
window.addEventListener('beforeunload', () => game?.dispose());

