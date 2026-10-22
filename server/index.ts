import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { findPath, turnTowards, type Waypoint } from './navigation.js';
import { randomInt, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';
import { readFile } from 'node:fs/promises';
import { WebSocket, WebSocketServer } from 'ws';
import { SPAWNS, WORLD_WALLS, WORLD_LIMITS } from '../src/shared/world.js';
import type { FlagState, GadgetKind, GameEvent, GameMode, MapId, PlayerState, RoomSummary, ServerMessage, StateMessage, Team, WorldEffect } from '../src/shared/protocol.js';

const TICK_MS = 50;
const CAPACITY = 20;
const ROUND_MS = 300_000;
const PLAYER_RADIUS = 0.38;
const SIGHT_MEMORY_MS = 6_000;
const MAX_ROOMS = 128;
const MAX_CONNECTIONS = MAX_ROOMS * CAPACITY;
const BOT_NAMES = ['Piper', 'Finch', 'Scout', 'Nova', 'Milo', 'Indigo'];
const MAP_CENTERS: Record<MapId, { x: number; z: number }> = {
  campus: { x: 0, z: 0 }, garden: { x: 52, z: 0 }, museum: { x: 0, z: -52 },
};
const MODES: GameMode[] = ['deathmatch', 'team', 'ctf'];
const MAPS: MapId[] = ['campus', 'garden', 'museum'];
const GADGETS: GadgetKind[] = ['flash', 'smoke', 'distract'];
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4',
};

function readRequestPath(req: IncomingMessage): string | null {
  try {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]!);
    // Check before URL normalization; encoded traversal and Windows separators matter too.
    if (!path.startsWith('/') || path.includes('\\') || path.includes('\0') || path.split('/').includes('..')) return null;
    return path;
  } catch { return null; }
}

async function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string, root: string) {
  const filename = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!filename.toLowerCase().startsWith(`${root}${sep}`.toLowerCase())) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Invalid path' }));
    return;
  }
  try {
    let content: Buffer;
    let extension = extname(filename).toLowerCase();
    try { content = await readFile(filename); }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if ((code !== 'ENOENT' && code !== 'EISDIR') || extension) throw error;
      content = await readFile(resolve(root, 'index.html'));
      extension = '.html';
    }
    res.setHeader('Content-Type', MIME_TYPES[extension] ?? 'application/octet-stream');
    res.setHeader('Content-Length', content.byteLength);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : extension === '.html' ? 'no-cache' : 'public, max-age=3600');
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    res.statusCode = code === 'ENOENT' || code === 'EISDIR' ? 404 : 500;
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ error: res.statusCode === 404 ? 'Not found. Run npm run build before npm start.' : 'Unable to load file' }));
  }
}

interface Input { forward: number; strafe: number; yaw: number; sprint: boolean }
interface CoreExports extends WebAssembly.Exports {
  resetWorld(): void;
  addWall(minX: number, minZ: number, maxX: number, maxZ: number): void;
  clipX(x: number, z: number, dx: number, radius: number): number;
  clipZ(x: number, z: number, dz: number, radius: number): number;
  advanceStamina(stamina: number, moving: number, sprinting: number, dt: number): number;
}
interface Player extends PlayerState {
  socket?: WebSocket;
  input: Input;
  lastInputAt: number;
  lastGuess: number;
  seen: Map<string, number>;
  cooldowns: Record<GadgetKind, number>;
  blindedUntil: number;
  botTarget?: { x: number; z: number; until: number };
  botPath?: Waypoint[];
  patrolIndex?: number;
  botReading?: { id: string; since: number };
  distractedUntil: number;
}
interface Room {
  id: string;
  mode: GameMode;
  map: MapId;
  practice: boolean;
  players: Map<string, Player>;
  scores: Record<Team, number>;
  endsAt: number;
  ended: boolean;
  effects: WorldEffect[];
  flags: Record<Team, FlagState>;
  core: CoreExports;
}
interface Session {
  room?: Room;
  player?: Player;
  bucketStart: number;
  messageCount: number;
  alive: boolean;
  connectedAt: number;
}

export interface GameServer {
  server: Server;
  wss: WebSocketServer;
  port: number;
  close: () => Promise<void>;
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const enemy = (room: Room, a: Player, b: Player) => a.id !== b.id && (room.mode === 'deathmatch' || a.team !== b.team);
const send = (socket: WebSocket | undefined, data: ServerMessage) => {
  if (socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 512_000) socket.send(JSON.stringify(data));
};

/** Segment/AABB test shared by visibility and collision checks. */
function intersectsBox(ax: number, az: number, bx: number, bz: number, x: number, z: number, w: number, d: number) {
  let lo = 0;
  let hi = 1;
  for (const [start, delta, min, max] of [[ax, bx - ax, x - w / 2, x + w / 2], [az, bz - az, z - d / 2, z + d / 2]]) {
    if (Math.abs(delta!) < 0.00001) {
      if (start! < min! || start! > max!) return false;
    } else {
      const a = (min! - start!) / delta!;
      const b = (max! - start!) / delta!;
      lo = Math.max(lo, Math.min(a, b));
      hi = Math.min(hi, Math.max(a, b));
      if (lo > hi) return false;
    }
  }
  return true;
}

function smokeBetween(a: { x: number; z: number }, b: { x: number; z: number }, effect: WorldEffect) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const t = clamp(((effect.x - a.x) * dx + (effect.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(a.x + t * dx - effect.x, a.z + t * dz - effect.z) < 3.7;
}

function clearSight(room: Room, a: { x: number; z: number }, b: { x: number; z: number }) {
  if (WORLD_WALLS.some(w => w.h >= 1.6 && intersectsBox(a.x, a.z, b.x, b.z, w.x, w.z, w.w, w.d))) return false;
  return !room.effects.some(e => e.kind === 'smoke' && smokeBetween(a, b, e));
}

function canSee(room: Room, actor: Player, target: Player, now: number) {
  if (!actor.alive || !target.alive || actor.blindedUntil > now) return false;
  const d = dist(actor, target);
  if (d > 45) return false;
  const dot = ((target.x - actor.x) * -Math.sin(actor.yaw) + (target.z - actor.z) * -Math.cos(actor.yaw)) / Math.max(d, 0.01);
  return dot >= Math.cos(65 * Math.PI / 180) && foreheadFacing(actor, target) && clearSight(room, actor, target);
}

function foreheadFacing(actor: Player, target: Player) {
  const distance = Math.max(dist(actor, target), 0.01);
  const dot = ((actor.x - target.x) * -Math.sin(target.yaw) + (actor.z - target.z) * -Math.cos(target.yaw)) / distance;
  return dot > 0.2;
}

function blocked(x: number, z: number) {
  return WORLD_WALLS.some(w => w.h > 0.3 && x > w.x - w.w / 2 - PLAYER_RADIUS && x < w.x + w.w / 2 + PLAYER_RADIUS && z > w.z - w.d / 2 - PLAYER_RADIUS && z < w.z + w.d / 2 + PLAYER_RADIUS);
}

function move(room: Room, p: Player, dx: number, dz: number) {
  p.x = clamp(room.core.clipX(p.x, p.z, dx, PLAYER_RADIUS), WORLD_LIMITS.minX + PLAYER_RADIUS, WORLD_LIMITS.maxX - PLAYER_RADIUS);
  p.z = clamp(room.core.clipZ(p.x, p.z, dz, PLAYER_RADIUS), WORLD_LIMITS.minZ + PLAYER_RADIUS, WORLD_LIMITS.maxZ - PLAYER_RADIUS);
}

function uniqueNumber(room: Room) {
  const used = new Set([...room.players.values()].map(p => p.number));
  let value: string;
  do value = String(randomInt(1000, 10000)); while (used.has(value));
  return value;
}

function teamSpawn(room: Room, team: Team) {
  const candidates = SPAWNS[room.map];
  const teamCandidates = candidates.filter((_, index) => index % 2 === (team === 'red' ? 0 : 1));
  const choices = room.mode === 'deathmatch' ? candidates : teamCandidates.length ? teamCandidates : candidates;
  // Prefer an unoccupied spawn to avoid stacking players at round start.
  const free = choices.filter(s => ![...room.players.values()].some(p => p.alive && dist(p, s) < 2));
  const pool = free.length ? free : choices;
  return pool[randomInt(pool.length)]!;
}

function baseFlags(map: MapId): Record<Team, FlagState> {
  const candidates = SPAWNS[map];
  const red = candidates[0]!;
  const blue = candidates[1] ?? candidates.at(-1)!;
  return {
    red: { x: red.x, z: red.z, homeX: red.x, homeZ: red.z, carrierId: null },
    blue: { x: blue.x, z: blue.z, homeX: blue.x, homeZ: blue.z, carrierId: null },
  };
}

export interface GameServerOptions {
  listen?: boolean;
  roundMs?: number;
  port?: number;
  host?: string;
  staticDir?: string;
  initialGraceMs?: number;
  respawnGraceMs?: number;
}

export async function createGameServer({ port = 3001, host = '0.0.0.0', listen = true, roundMs = ROUND_MS, staticDir, initialGraceMs = 10_000, respawnGraceMs = 3_000 }: GameServerOptions = {}): Promise<GameServer> {
  const wasm = await readFile(new URL('../public/wasm/outnumbered.wasm', import.meta.url));
  const { instance } = await WebAssembly.instantiate(wasm, { env: { abort: () => { throw new Error('WASM core aborted'); } } });
  const core = instance.exports as CoreExports;
  core.resetWorld();
  for (const w of WORLD_WALLS) core.addWall(w.x - w.w / 2, w.z - w.d / 2, w.x + w.w / 2, w.z + w.d / 2);
  const rooms = new Map<string, Room>();
  const sessions = new Map<WebSocket, Session>();
  const broadcast = (room: Room, event: GameEvent) => { for (const p of room.players.values()) send(p.socket, event); };
  const staticRoot = resolve(staticDir ?? fileURLToPath(new URL('../dist', import.meta.url)));

  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    const path = readRequestPath(req);
    if (!path) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Invalid path' }));
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405;
      res.setHeader('Allow', 'GET, HEAD');
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }
    if (path === '/health' || path === '/api/health') {
      res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: [...sessions.values()].filter(s => s.player).length }));
    } else if (path === '/rooms' || path === '/api/rooms') {
      const summaries: RoomSummary[] = [...rooms.values()].filter(r => !r.practice && !r.ended).map(r => ({
        id: r.id, mode: r.mode, map: r.map, players: r.players.size, capacity: CAPACITY, timeLeft: Math.max(0, Math.ceil((r.endsAt - Date.now()) / 1000)),
      }));
      res.end(JSON.stringify(summaries));
    } else {
      void serveStatic(req, res, path, staticRoot);
    }
  });
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2048 });

  function snapshot(room: Room, viewer: Player, now = Date.now()): StateMessage {
    return {
      type: 'state', mode: room.mode, map: room.map, scores: { ...room.scores },
      serverTime: now, timeLeft: Math.max(0, Math.ceil((room.endsAt - now) / 1000)), ended: room.ended,
      players: [...room.players.values()].map(p => ({
        id: p.id, name: p.name, number: p.id === viewer.id ? '' : p.number, team: p.team,
        x: p.x, z: p.z, yaw: p.yaw, alive: p.alive, score: p.score, deaths: p.deaths,
        isBot: p.isBot, respawnAt: p.respawnAt, stamina: p.stamina, protectedUntil: p.protectedUntil,
      })),
      flags: room.flags, effects: room.effects,
      cooldowns: { flash: Math.max(0, (viewer.cooldowns.flash - now) / 1000), smoke: Math.max(0, (viewer.cooldowns.smoke - now) / 1000), distract: Math.max(0, (viewer.cooldowns.distract - now) / 1000) },
    };
  }

  function addPlayer(room: Room, name: string, socket?: WebSocket) {
    const red = [...room.players.values()].filter(p => p.team === 'red').length;
    const blue = room.players.size - red;
    const team: Team = red <= blue ? 'red' : 'blue';
    const spawn = teamSpawn(room, team);
    const center = MAP_CENTERS[room.map];
    const yaw = Math.atan2(-(center.x - spawn.x), -(center.z - spawn.z));
    const player: Player = {
      id: randomUUID().slice(0, 12), name, number: uniqueNumber(room), team, x: spawn.x, z: spawn.z, yaw,
      alive: true, score: 0, deaths: 0, isBot: !socket, respawnAt: 0, stamina: 100, protectedUntil: socket ? Date.now() + Math.max(0, initialGraceMs) : 0, socket,
      input: { forward: 0, strafe: 0, yaw, sprint: false }, lastInputAt: Date.now(), lastGuess: 0,
      seen: new Map(), cooldowns: { flash: 0, smoke: 0, distract: 0 }, blindedUntil: 0, distractedUntil: 0,
    };
    room.players.set(player.id, player);
    return player;
  }

  function resetFlag(flag: FlagState) {
    flag.x = flag.homeX;
    flag.z = flag.homeZ;
    flag.carrierId = null;
  }

  function eliminate(room: Room, actor: Player, target: Player, now: number) {
    if (target.protectedUntil > now) return;
    target.alive = false;
    target.deaths++;
    target.respawnAt = now + 4_000;
    target.input.forward = target.input.strafe = 0;
    target.seen.clear();
    target.botReading = undefined;
    actor.score++;
    if (room.mode !== 'ctf') room.scores[actor.team]++;
    for (const flag of Object.values(room.flags)) if (flag.carrierId === target.id) resetFlag(flag);
    for (const p of room.players.values()) p.seen.delete(target.id);
    broadcast(room, { type: 'event', kind: 'elimination', text: `${actor.name} outnumbered ${target.name}`, actor: actor.id, target: target.id, x: target.x, z: target.z });
  }

  function submit(room: Room, player: Player, number: string, now: number) {
    if (!player.alive || room.ended || now - player.lastGuess < 700) return;
    player.lastGuess = now;
    const target = [...room.players.values()].find(p => p.alive && p.number === number && enemy(room, player, p));
    if (!target || target.protectedUntil > now || player.blindedUntil > now || dist(player, target) > 45 || (!canSee(room, player, target, now) && now - (player.seen.get(target.id) ?? 0) > SIGHT_MEMORY_MS)) {
      send(player.socket, { type: 'event', kind: 'miss', actor: player.id, text: 'No match. Read an opponent’s number first.' });
      return;
    }
    eliminate(room, player, target, now);
  }

  function gadget(room: Room, player: Player, kind: GadgetKind, now: number) {
    if (!player.alive || room.ended || player.cooldowns[kind] > now) return;
    player.cooldowns[kind] = now + (kind === 'smoke' ? 18_000 : 14_000);
    let x = player.x;
    let z = player.z;
    // Stop the throw at walls so gadgets cannot pass through buildings.
    for (let d = 0.5; d <= 6; d += 0.5) {
      const nx = player.x - Math.sin(player.yaw) * d;
      const nz = player.z - Math.cos(player.yaw) * d;
      if (blocked(nx, nz)) break;
      x = nx; z = nz;
    }
    const id = randomUUID().slice(0, 8);
    if (kind === 'flash') {
      const affectedIds: string[] = [];
      for (const p of room.players.values()) {
        if (p.alive && dist(p, { x, z }) < 10 && clearSight(room, p, { x, z })) {
          p.blindedUntil = now + 2_800;
          p.botReading = undefined;
          affectedIds.push(p.id);
        }
      }
      broadcast(room, { type: 'event', kind, id, actor: player.id, text: `${player.name} threw a flashbang`, x, z, affectedIds, duration: 2.8 });
    } else {
      const duration = kind === 'smoke' ? 10 : 7;
      room.effects.push({ id, kind, x, z, expiresAt: now + duration * 1000 });
      if (kind === 'distract') for (const p of room.players.values()) {
        if (p.isBot && dist(p, { x, z }) < 20) {
          p.distractedUntil = now + duration * 1000;
          p.botTarget = { x, z, until: p.distractedUntil };
          p.botPath = undefined;
          p.botReading = undefined;
        }
      }
      broadcast(room, { type: 'event', kind, id, actor: player.id, text: `${player.name} used ${kind === 'smoke' ? 'a smoke grenade' : 'a distract grenade'}`, x, z, duration });
    }
  }

  function updateBot(room: Room, bot: Player, now: number) {
    if (bot.blindedUntil > now) return;
    const targets = [...room.players.values()].filter(p => p.alive && p.protectedUntil <= now && enemy(room, bot, p) && dist(bot, p) < 23 && foreheadFacing(bot, p) && clearSight(room, bot, p));
    targets.sort((a, b) => dist(bot, a) - dist(bot, b));
    const target = bot.distractedUntil > now ? undefined : targets[0];
    if (target) {
      bot.yaw = turnTowards(bot.yaw, Math.atan2(-(target.x - bot.x), -(target.z - bot.z)), TICK_MS / 1000);
      if (bot.botReading?.id !== target.id) bot.botReading = { id: target.id, since: now };
      // Players get a generous reading window; bots cannot shoot through smoke or walls.
      if (now - bot.botReading.since > 7_500) {
        eliminate(room, bot, target, now);
        bot.botReading = undefined;
      }
      // Hold a readable stance while studying an opponent instead of swaying randomly.
      bot.botPath = undefined;
      return;
    }
    bot.botReading = undefined;
    if (!bot.botTarget || bot.botTarget.until < now || dist(bot, bot.botTarget) < 1) {
      const patrol = SPAWNS[room.map];
      bot.patrolIndex = ((bot.patrolIndex ?? Math.max(0, BOT_NAMES.indexOf(bot.name))) + 1) % patrol.length;
      let goal = patrol[bot.patrolIndex]!;
      if (room.mode === 'ctf') {
        const opposite = bot.team === 'red' ? 'blue' : 'red';
        goal = room.flags[opposite].carrierId === bot.id ? room.flags[bot.team] : room.flags[opposite];
      }
      bot.botTarget = { x: goal.x, z: goal.z, until: now + 20_000 };
      bot.botPath = undefined;
    }
    bot.botPath ??= findPath(bot, bot.botTarget);
    while (bot.botPath.length && dist(bot, bot.botPath[0]) < .16) bot.botPath.shift();
    const waypoint = bot.botPath[0];
    if (!waypoint) { bot.botTarget.until = now; return; }
    const dx = waypoint.x - bot.x, dz = waypoint.z - bot.z;
    const heading = Math.atan2(-dx, -dz);
    bot.yaw = turnTowards(bot.yaw, heading, TICK_MS / 1000);
    // Turn on the spot at sharp corners before taking the next collision-safe segment.
    const alignment = Math.max(0, Math.cos(heading - bot.yaw));
    const length = Math.hypot(dx, dz);
    const step = Math.min(length, 2.4 * alignment * TICK_MS / 1000);
    move(room, bot, dx / length * step, dz / length * step);
  }

  function tickFlags(room: Room) {
    for (const team of ['red', 'blue'] as const) {
      const flag = room.flags[team];
      const carrier = flag.carrierId ? room.players.get(flag.carrierId) : undefined;
      if (flag.carrierId && !carrier?.alive) resetFlag(flag);
      if (carrier?.alive) {
        flag.x = carrier.x; flag.z = carrier.z;
        const own = room.flags[carrier.team];
        if (!own.carrierId && dist(carrier, { x: own.homeX, z: own.homeZ }) < 2.5) {
          room.scores[carrier.team]++;
          carrier.score += 3;
          resetFlag(flag);
          broadcast(room, { type: 'event', kind: 'capture', actor: carrier.id, text: `${carrier.name} captured the ${team} flag!` });
        }
      } else {
        const taker = [...room.players.values()].find(p => p.alive && p.team !== team && dist(p, flag) < 1.8);
        if (taker) {
          flag.carrierId = taker.id;
          broadcast(room, { type: 'event', kind: 'system', actor: taker.id, text: `${taker.name} picked up the ${team} flag` });
        }
      }
    }
  }

  function join(socket: WebSocket, session: Session, message: Record<string, unknown>) {
    if (session.player) return send(socket, { type: 'error', message: 'You have already joined a match.' });
    const name = (typeof message.name === 'string' ? message.name : 'Player').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 20) || 'Player';
    let mode = message.mode as GameMode;
    let map = message.map as MapId;
    const practice = message.practice === true;
    const requestedRoom = typeof message.room === 'string' ? message.room.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20) : undefined;
    let room = !practice && requestedRoom ? rooms.get(requestedRoom) : !practice ? [...rooms.values()].find(r => !r.practice && !r.ended && r.mode === mode && r.map === map && r.players.size < CAPACITY) : undefined;
    if (requestedRoom && !practice && !room) return send(socket, { type: 'error', message: 'Room not found. Ask your friend for an active room code.' });
    if (room && (room.practice || room.ended)) return send(socket, { type: 'error', message: 'That room is no longer available.' });
    if (room && room.players.size >= CAPACITY) return send(socket, { type: 'error', message: 'This room is full (20 players).' });
    if (room) { mode = room.mode; map = room.map; }
    else if (!MODES.includes(mode) || !MAPS.includes(map)) return send(socket, { type: 'error', message: 'Choose a valid mode and map.' });
    if (!room) {
      if (rooms.size >= MAX_ROOMS) return send(socket, { type: 'error', message: 'All match servers are busy. Please try again shortly.' });
      let id: string;
      do id = randomUUID().slice(0, 6).toUpperCase(); while (rooms.has(id));
      room = { id, mode, map, practice, players: new Map(), scores: { red: 0, blue: 0 }, endsAt: Date.now() + roundMs, ended: false, effects: [], flags: baseFlags(map), core };
      rooms.set(id, room);
    }
    const player = addPlayer(room, name, socket);
    session.room = room;
    session.player = player;
    if (practice) for (let i = 0; i < 5; i++) addPlayer(room, BOT_NAMES[i]!);
    send(socket, { type: 'welcome', id: player.id, room: room.id, mode: room.mode, map: room.map });
    send(socket, snapshot(room, player));
    broadcast(room, { type: 'event', kind: 'system', text: `${name} joined the match` });
  }

  wss.on('connection', socket => {
    if (sessions.size >= MAX_CONNECTIONS) { socket.close(1013, 'Server capacity reached'); return; }
    const session: Session = { bucketStart: Date.now(), messageCount: 0, alive: true, connectedAt: Date.now() };
    sessions.set(socket, session);
    socket.on('pong', () => { session.alive = true; });
    socket.on('error', () => { /* close handler performs all cleanup */ });
    socket.on('message', (raw, isBinary) => {
      if (isBinary) return;
      const now = Date.now();
      if (now - session.bucketStart >= 1_000) { session.bucketStart = now; session.messageCount = 0; }
      if (++session.messageCount > 100) return socket.close(1008, 'Message rate exceeded');
      let data: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(raw.toString());
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
        data = parsed as Record<string, unknown>;
      } catch { return send(socket, { type: 'error', message: 'Invalid JSON message.' }); }
      if (data.type === 'join') return join(socket, session, data);
      if (data.type === 'ping') return send(socket, { type: 'pong', sentAt: finite(data.sentAt) ? data.sentAt : undefined, serverTime: now });
      const { room, player } = session;
      if (!room || !player) return send(socket, { type: 'error', message: 'Join a match first.' });
      if (data.type === 'input' && finite(data.forward) && finite(data.strafe) && finite(data.yaw)) {
        player.input = { forward: clamp(data.forward, -1, 1), strafe: clamp(data.strafe, -1, 1), yaw: data.yaw % (Math.PI * 2), sprint: data.sprint === true };
        player.lastInputAt = now;
      } else if (data.type === 'submit' && typeof data.number === 'string' && /^\d{4}$/.test(data.number)) {
        submit(room, player, data.number, now);
      } else if (data.type === 'gadget' && GADGETS.includes(data.kind as GadgetKind)) {
        gadget(room, player, data.kind as GadgetKind, now);
      }
    });
    socket.on('close', () => {
      const { room, player } = session;
      if (room && player) {
        room.players.delete(player.id);
        for (const p of room.players.values()) p.seen.delete(player.id);
        for (const flag of Object.values(room.flags)) if (flag.carrierId === player.id) resetFlag(flag);
        if (![...room.players.values()].some(p => !p.isBot)) rooms.delete(room.id);
        else broadcast(room, { type: 'event', kind: 'system', text: `${player.name} left the match` });
      }
      sessions.delete(socket);
    });
  });

  const ticker = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      if (now > room.endsAt + 60_000) {
        for (const p of room.players.values()) p.socket?.close(1000, 'Round finished. Return to the lobby to play again.');
        rooms.delete(room.id);
        continue;
      }
      if (!room.ended && now >= room.endsAt) {
        room.ended = true;
        const best = [...room.players.values()].sort((a, b) => b.score - a.score)[0];
        const team = room.scores.red === room.scores.blue ? 'A draw' : `${room.scores.red > room.scores.blue ? 'Red' : 'Blue'} team wins`;
        broadcast(room, { type: 'event', kind: 'system', text: room.mode === 'deathmatch' ? `Round over — ${best?.name ?? 'Nobody'} leads with ${best?.score ?? 0} eliminations` : `Round over — ${team}!` });
      }
      room.effects = room.effects.filter(e => e.expiresAt > now);
      if (!room.ended) {
        // Apply every human's look direction before anyone reads a forehead.
        for (const p of room.players.values()) if (!p.isBot && p.alive) p.yaw = p.input.yaw;
        for (const p of room.players.values()) {
          if (!p.alive && p.respawnAt <= now) {
            const spawn = teamSpawn(room, p.team);
            p.x = spawn.x; p.z = spawn.z; p.alive = true; p.respawnAt = 0;
            p.number = uniqueNumber(room); p.blindedUntil = 0; p.seen.clear(); p.stamina = 100; p.protectedUntil = now + Math.max(0, respawnGraceMs);
            p.botPath = undefined; p.botTarget = undefined;
            p.input.forward = p.input.strafe = 0;
            const center = MAP_CENTERS[room.map];
            p.yaw = Math.atan2(-(center.x - p.x), -(center.z - p.z));
            p.input.yaw = p.yaw;
          }
          if (!p.alive) continue;
          if (p.isBot) updateBot(room, p, now);
          else {
            p.yaw = p.input.yaw;
            if (now - p.lastInputAt < 300) {
              const norm = Math.max(1, Math.hypot(p.input.forward, p.input.strafe));
              const moving = Math.hypot(p.input.forward, p.input.strafe) > 0.01;
              const sprinting = p.input.sprint && p.stamina > 0;
              const speed = (sprinting ? 8 : 5) * TICK_MS / 1000 / norm;
              move(room, p, (-Math.sin(p.yaw) * p.input.forward + Math.cos(p.yaw) * p.input.strafe) * speed, (-Math.cos(p.yaw) * p.input.forward - Math.sin(p.yaw) * p.input.strafe) * speed);
              p.stamina = core.advanceStamina(p.stamina, +moving, +sprinting, TICK_MS / 1000);
            } else {
              p.stamina = core.advanceStamina(p.stamina, 0, 0, TICK_MS / 1000);
            }
          }
        }
        for (const p of room.players.values()) if (!p.isBot && p.alive) {
          for (const [id, seenAt] of p.seen) if (now - seenAt > SIGHT_MEMORY_MS) p.seen.delete(id);
          for (const target of room.players.values()) if (enemy(room, p, target) && canSee(room, p, target, now)) p.seen.set(target.id, now);
        }
        if (room.mode === 'ctf') tickFlags(room);
      }
      for (const p of room.players.values()) if (p.socket) send(p.socket, snapshot(room, p, now));
    }
  }, TICK_MS);
  const heartbeat = setInterval(() => {
    for (const [socket, session] of sessions) {
      if (!session.alive || !session.player && Date.now() - session.connectedAt > 15_000) { socket.terminate(); continue; }
      session.alive = false;
      socket.ping();
    }
  }, 15_000);

  try {
    if (listen) await new Promise<void>((resolveListen, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => { server.off('error', reject); resolveListen(); });
    });
  } catch (error) {
    clearInterval(ticker); clearInterval(heartbeat); wss.close();
    throw error;
  }
  const address = server.address();
  return {
    server, wss, port: typeof address === 'object' && address ? address.port : port,
    close: async () => {
      clearInterval(ticker); clearInterval(heartbeat);
      for (const socket of wss.clients) socket.terminate();
      await new Promise<void>(done => wss.close(() => done()));
      if (server.listening) await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
      rooms.clear(); sessions.clear();
    },
  };
}

const entryPath = process.argv[1];
if (entryPath && resolve(entryPath) === fileURLToPath(import.meta.url)) {
  const game = await createGameServer({ port: Number(process.env.PORT ?? 3001) });
  console.log(`OutNumbered multiplayer listening on http://localhost:${game.port}`);
  let stopping = false;
  const stop = () => { if (!stopping) { stopping = true; void game.close().then(() => process.exit(0)); } };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
