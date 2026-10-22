import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join as joinPath, resolve, sep } from 'node:path';
import { WebSocket } from 'ws';
import { createGameServer, type GameServer, type GameServerOptions } from '../server/index.js';
import { WORLD_WALLS } from '../src/shared/world.js';
import type { ClientMessage, PlayerState, ServerMessage, StateMessage } from '../src/shared/protocol.js';

class Client {
  readonly socket: WebSocket;
  messages: ServerMessage[] = [];
  constructor(port: number) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.socket.on('message', raw => this.messages.push(JSON.parse(raw.toString()) as ServerMessage));
  }
  async open() {
    await new Promise<void>((resolve, reject) => {
      this.socket.once('open', resolve);
      this.socket.once('error', reject);
    });
    return this;
  }
  send(message: ClientMessage) { this.socket.send(JSON.stringify(message)); }
  async wait<T extends ServerMessage['type']>(type: T, predicate: (message: Extract<ServerMessage, { type: T }>) => boolean = () => true, timeout = 2500): Promise<Extract<ServerMessage, { type: T }>> {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const index = this.messages.findIndex(message => message.type === type && predicate(message as Extract<ServerMessage, { type: T }>));
      if (index >= 0) return this.messages.splice(index, 1)[0] as Extract<ServerMessage, { type: T }>;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error(`Timed out waiting for ${type}. Received: ${JSON.stringify(this.messages.slice(-4))}`);
  }
}

async function withServer(fn: (game: GameServer) => Promise<void>, options: GameServerOptions = {}) {
  const game = await createGameServer({ port: 0, host: '127.0.0.1', initialGraceMs: 0, ...options });
  try { await fn(game); } finally { await game.close(); }
}

test('deployment adapter lets the platform own the listener and configures shorter rounds', async () => {
  const game = await createGameServer({ listen: false, roundMs: 240_000 });
  try {
    assert.equal(game.server.listening, false);
    await new Promise<void>(resolve => game.server.listen(0, '127.0.0.1', resolve));
    const address = game.server.address();
    assert.ok(address && typeof address === 'object');
    const { client } = await join(address.port, { practice: true });
    const state = await client.wait('state');
    assert.ok(state.timeLeft > 235 && state.timeLeft <= 240);
    assert.equal(state.players.filter(player => player.isBot).length, 5);
  } finally { await game.close(); }
});

async function join(port: number, options: Partial<Extract<ClientMessage, { type: 'join' }>> = {}) {
  const client = await new Client(port).open();
  client.send({ type: 'join', name: 'Tester', mode: 'deathmatch', map: 'campus', ...options });
  const welcome = await client.wait('welcome');
  return { client, ...welcome };
}

test('latency probes echo the client clock without changing match membership', async () => {
  await withServer(async game => {
    const { client, id } = await join(game.port, { practice: true });
    client.send({ type: 'ping', sentAt: 1234.5 });
    const pong = await client.wait('pong');
    assert.equal(pong.sentAt, 1234.5);
    assert.ok(Number.isFinite(pong.serverTime));
    const state = await client.wait('state');
    assert.ok(state.players.some(player => player.id === id));
  });
});

function unobstructed(a: PlayerState, b: PlayerState) {
  // Independent sample-based sight check for choosing a legitimate integration-test shot.
  for (let t = 0; t <= 1; t += 0.01) {
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    if (WORLD_WALLS.some(w => w.h >= 1.6 && Math.abs(x - w.x) <= w.w / 2 && Math.abs(z - w.z) <= w.d / 2)) return false;
  }
  return true;
}

function facing(a: PlayerState, b: PlayerState, cutoff: number) {
  const distance = Math.max(Math.hypot(a.x - b.x, a.z - b.z), 0.01);
  return ((b.x - a.x) * -Math.sin(a.yaw) + (b.z - a.z) * -Math.cos(a.yaw)) / distance > cutoff;
}

/** Integration-test driver: real movement inputs along legal arena lanes, with no position injection. */
async function walkTo(client: Client, id: string, goal: { x: number; z: number }): Promise<StateMessage> {
  client.messages = [];
  let state = await client.wait('state');
  const start = state.players.find(p => p.id === id)!;
  const key = (x: number, z: number) => `${x},${z}`;
  const startKey = key(Math.round(start.x), Math.round(start.z));
  const goalKey = key(Math.round(goal.x), Math.round(goal.z));
  const queue = [{ x: Math.round(start.x), z: Math.round(start.z) }];
  const previous = new Map<string, string | null>([[startKey, null]]);
  const free = (x: number, z: number) => Math.abs(x) <= 24 && Math.abs(z) <= 24 && !WORLD_WALLS.some(w =>
    Math.abs(x - w.x) < w.w / 2 + 0.5 && Math.abs(z - w.z) < w.d / 2 + 0.5);
  for (let i = 0; i < queue.length && !previous.has(goalKey); i++) {
    const p = queue[i]!;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = p.x + dx!;
      const z = p.z + dz!;
      const next = key(x, z);
      if (free(x, z) && !previous.has(next)) {
        previous.set(next, key(p.x, p.z));
        queue.push({ x, z });
      }
    }
  }
  assert.ok(previous.has(goalKey), 'CTF objective must be reachable through collision-free lanes');
  const route: { x: number; z: number }[] = [];
  for (let cursor: string | null = goalKey; cursor; cursor = previous.get(cursor) ?? null) {
    const [x, z] = cursor.split(',').map(Number);
    route.unshift({ x: x!, z: z! });
  }
  const waypoints = route.filter((p, i) => i === route.length - 1 || i > 0 &&
    (p.x - route[i - 1]!.x !== route[i + 1]!.x - p.x || p.z - route[i - 1]!.z !== route[i + 1]!.z - p.z));
  const deadline = Date.now() + 25_000;
  for (const waypoint of waypoints) {
    while (true) {
      const p = state.players.find(p => p.id === id)!;
      assert.ok(p.alive, 'Test runner must stay alive while traversing the map');
      if (Math.hypot(p.x - waypoint.x, p.z - waypoint.z) < 0.3) break;
      assert.ok(Date.now() < deadline, `Could not walk from (${p.x},${p.z}) to (${waypoint.x},${waypoint.z})`);
      const yaw = Math.atan2(-(waypoint.x - p.x), -(waypoint.z - p.z));
      client.send({ type: 'input', forward: 1, strafe: 0, yaw, sprint: true });
      const after = state.serverTime;
      state = await client.wait('state', s => s.serverTime > after);
    }
  }
  client.send({ type: 'input', forward: 0, strafe: 0, yaw: state.players.find(p => p.id === id)!.yaw, sprint: false });
  return state;
}

test('practice provides five bots, hides own number, and is absent from public room listing', async () => {
  await withServer(async game => {
    const player = await join(game.port, { practice: true, name: '<Scout>' });
    const state = await player.client.wait('state');
    assert.equal(state.players.length, 6);
    assert.equal(state.players.filter(p => p.isBot).length, 5);
    assert.equal(state.players.find(p => p.id === player.id)?.number, '');
    assert.equal(state.players.find(p => p.id === player.id)?.name, 'Scout');
    assert.ok(state.players.find(p => p.id === player.id)!.protectedUntil - state.serverTime > 9_000);
    assert.equal(new Set(state.players.filter(p => p.isBot).map(p => p.number)).size, 5);
    assert.ok(state.players.filter(p => p.isBot).every(p => /^\d{4}$/.test(p.number)));
    const rooms = await fetch(`http://127.0.0.1:${game.port}/rooms`).then(r => r.json());
    assert.deepEqual(rooms, []);
    const health = await fetch(`http://127.0.0.1:${game.port}/health`).then(r => r.json());
    assert.equal(health.ok, true);
  }, { initialGraceMs: 10_000 });
});

test('20 real clients share one authoritative room; capacity and legitimate elimination are enforced', async () => {
  await withServer(async game => {
    const first = await join(game.port, { name: 'Player 1' });
    const members = [first];
    for (let i = 1; i < 20; i++) members.push(await join(game.port, { name: `Player ${i + 1}`, room: first.room }));
    const full = await first.client.wait('state', s => s.players.length === 20);
    assert.equal(full.players.filter(p => !p.isBot).length, 20);
    const extra = await new Client(game.port).open();
    extra.send({ type: 'join', name: 'Extra', mode: 'deathmatch', map: 'campus', room: first.room });
    assert.match((await extra.wait('error')).message, /full/);
    const rooms = await fetch(`http://127.0.0.1:${game.port}/rooms`).then(r => r.json());
    assert.equal(rooms[0].players, 20);
    assert.equal(rooms[0].capacity, 20);

    const coveredPair = full.players.flatMap(a => full.players.map(b => ({ a, b }))).find(({ a, b }) =>
      a.id !== b.id && Math.hypot(a.x - b.x, a.z - b.z) < 40 && !unobstructed(a, b));
    assert.ok(coveredPair, 'Arena must provide cover between some spawn points');
    const blockedAttacker = members.find(p => p.id === coveredPair.a.id)!;
    const blockedView = await blockedAttacker.client.wait('state', s => s.players.length === 20);
    const hiddenNumber = blockedView.players.find(p => p.id === coveredPair.b.id)!.number;
    const blockedYaw = Math.atan2(-(coveredPair.b.x - coveredPair.a.x), -(coveredPair.b.z - coveredPair.a.z));
    blockedAttacker.client.messages = [];
    blockedAttacker.client.send({ type: 'input', forward: 0, strafe: 0, yaw: blockedYaw, sprint: false });
    await blockedAttacker.client.wait('state', s => Math.abs(s.players.find(p => p.id === blockedAttacker.id)!.yaw - blockedYaw) < 0.001);
    blockedAttacker.client.send({ type: 'submit', number: hiddenNumber });
    await blockedAttacker.client.wait('event', e => e.kind === 'miss');

    const pair = full.players.flatMap(a => full.players.map(b => ({ a, b }))).find(({ a, b }) =>
      a.id !== blockedAttacker.id && b.id !== blockedAttacker.id && a.id !== b.id && Math.hypot(a.x - b.x, a.z - b.z) > 2 && Math.hypot(a.x - b.x, a.z - b.z) < 40 && unobstructed(a, b) &&
      (!facing(a, b, Math.cos(65 * Math.PI / 180)) || !facing(b, a, 0.2)));
    assert.ok(pair, 'Arena must provide a clear shot between at least two spawn points');
    const attacker = members.find(p => p.id === pair.a.id)!;
    const target = pair.b;
    const view = await attacker.client.wait('state', s => s.players.length === 20);
    const targetNumber = view.players.find(p => p.id === target.id)!.number;
    assert.match(targetNumber, /^\d{4}$/);
    const yaw = Math.atan2(-(target.x - pair.a.x), -(target.z - pair.a.z));
    const victim = members.find(p => p.id === target.id)!;
    victim.client.send({ type: 'input', forward: 0, strafe: 0, yaw, sprint: false });
    await victim.client.wait('state', s => Math.abs(s.players.find(p => p.id === target.id)!.yaw - yaw) < 0.001);
    attacker.client.messages = [];
    attacker.client.send({ type: 'input', forward: 0, strafe: 0, yaw, sprint: false });
    await attacker.client.wait('state', s => Math.abs(s.players.find(p => p.id === attacker.id)!.yaw - yaw) < 0.001);
    attacker.client.send({ type: 'submit', number: targetNumber });
    await attacker.client.wait('event', e => e.kind === 'miss');
    // Turning the forehead toward the attacker makes exactly the same number valid.
    const targetYaw = Math.atan2(-(pair.a.x - target.x), -(pair.a.z - target.z));
    victim.client.send({ type: 'input', forward: 0, strafe: 0, yaw: targetYaw, sprint: false });
    await new Promise(resolve => setTimeout(resolve, 750));
    // A freshly read number remains usable when the target turns away again.
    victim.client.messages = [];
    victim.client.send({ type: 'input', forward: 0, strafe: 0, yaw, sprint: false });
    await victim.client.wait('state', s => Math.abs(s.players.find(p => p.id === target.id)!.yaw - yaw) < 0.001);
    attacker.client.send({ type: 'submit', number: targetNumber });
    const event = await attacker.client.wait('event', e => e.kind === 'elimination');
    assert.equal(event.actor, attacker.id);
    assert.equal(event.target, target.id);
    const dead = await attacker.client.wait('state', s => s.players.some(p => p.id === target.id && !p.alive));
    assert.equal(dead.players.find(p => p.id === attacker.id)!.score, 1);
    assert.equal(dead.players.find(p => p.id === target.id)!.deaths, 1);
    assert.ok(dead.players.find(p => p.id === target.id)!.respawnAt > dead.serverTime);
    const respawn = await attacker.client.wait('state', s => s.players.some(p => p.id === target.id && p.alive && p.deaths === 1), 5_000);
    assert.ok(respawn.players.find(p => p.id === target.id)!.protectedUntil - respawn.serverTime > 2_800);
  });
});

test('team matches reject a teammate number and disconnects remove empty rooms', async () => {
  await withServer(async game => {
    const red = await join(game.port, { mode: 'team' });
    const blue = await join(game.port, { mode: 'team', room: red.room });
    const teammate = await join(game.port, { mode: 'team', room: red.room });
    const state = await red.client.wait('state', s => s.players.length === 3);
    const ally = state.players.find(p => p.id === teammate.id)!;
    assert.equal(state.players.find(p => p.id === red.id)!.team, ally.team);
    assert.notEqual(state.players.find(p => p.id === blue.id)!.team, ally.team);
    red.client.send({ type: 'submit', number: ally.number });
    assert.equal((await red.client.wait('event', e => e.kind === 'miss')).kind, 'miss');
    for (const member of [red, blue, teammate]) member.client.socket.close();
    await new Promise(resolve => setTimeout(resolve, 100));
    const rooms = await fetch(`http://127.0.0.1:${game.port}/rooms`).then(r => r.json());
    assert.deepEqual(rooms, []);
  });
});

test('server ignores client dt and clamps input so clients cannot teleport or increase speed', async () => {
  await withServer(async game => {
    const player = await join(game.port);
    const first = await player.client.wait('state');
    const initial = first.players.find(p => p.id === player.id)!;
    const started = Date.now();
    const input = { type: 'input', forward: 999_999, strafe: 999_999, yaw: 0, sprint: false, dt: 999_999 } as const;
    player.client.send(input);
    await new Promise(resolve => setTimeout(resolve, 180));
    player.client.messages = [];
    const after = await player.client.wait('state');
    const current = after.players.find(p => p.id === player.id)!;
    const elapsed = (Date.now() - started) / 1000;
    assert.ok(Math.hypot(current.x - initial.x, current.z - initial.z) <= 5 * (elapsed + 0.06));
    assert.ok(Number.isFinite(current.x) && Number.isFinite(current.z));
    assert.equal(current.stamina, 100);
  });
});

test('smoke persists in state, and repeated gadget requests respect server cooldown', async () => {
  await withServer(async game => {
    const player = await join(game.port);
    player.client.send({ type: 'gadget', kind: 'smoke' });
    const event = await player.client.wait('event', e => e.kind === 'smoke');
    assert.equal(event.duration, 10);
    assert.equal(event.actor, player.id);
    player.client.send({ type: 'gadget', kind: 'smoke' });
    const state = await player.client.wait('state', s => s.effects.length > 0);
    assert.equal(state.effects.length, 1);
    assert.equal(state.effects[0].kind, 'smoke');
    assert.ok(state.cooldowns.smoke > 17);
  });
});

test('invalid joins and malformed messages are handled without crashing the server', async () => {
  await withServer(async game => {
    const client = await new Client(game.port).open();
    client.socket.send('{broken');
    assert.match((await client.wait('error')).message, /JSON/);
    client.socket.send(JSON.stringify({ type: 'join', name: 'x', mode: 'invalid', map: 'campus' }));
    assert.match((await client.wait('error')).message, /valid/);
    client.send({ type: 'join', name: 'x', mode: 'ctf', map: 'museum', room: 'ABSENT' });
    assert.match((await client.wait('error')).message, /not found/);
    client.send({ type: 'join', name: 'Valid', mode: 'ctf', map: 'museum' });
    await client.wait('welcome');
    const state = await client.wait('state');
    assert.equal(state.mode, 'ctf');
    assert.equal(state.flags.red.carrierId, null);
    assert.notEqual(state.flags.red.z, state.flags.blue.z);
  });
});

test('a room-code invite adopts the existing map and game mode', async () => {
  await withServer(async game => {
    const owner = await join(game.port, { mode: 'ctf', map: 'museum' });
    const guest = await join(game.port, { room: owner.room });
    assert.equal(guest.map, 'museum');
    assert.equal(guest.mode, 'ctf');
    const state = await guest.client.wait('state');
    assert.equal(state.map, 'museum');
    assert.equal(state.mode, 'ctf');
    assert.equal(state.players.filter(p => p.isBot).length, 0);
    assert.equal(state.players.length, 2);
  });
});

test('CTF supports flag pickup, flag return after carrier elimination, and capture at the home base', { timeout: 90_000 }, async () => {
  await withServer(async game => {
    const red = await join(game.port, { mode: 'ctf', name: 'Red runner' });
    const blue = await join(game.port, { room: red.room, name: 'Blue runner' });
    const initial = await red.client.wait('state', s => s.players.length === 2);
    const redBase = { x: initial.flags.red.homeX, z: initial.flags.red.homeZ };
    const blueBase = { x: initial.flags.blue.homeX, z: initial.flags.blue.homeZ };
    const pickup = await walkTo(red.client, red.id, blueBase);
    assert.equal(pickup.flags.blue.carrierId, red.id);
    const bluePosition = await walkTo(blue.client, blue.id, { x: blueBase.x + 2, z: blueBase.z + 2 });
    const target = bluePosition.players.find(p => p.id === red.id)!;
    const shooter = bluePosition.players.find(p => p.id === blue.id)!;
    const shooterYaw = Math.atan2(-(target.x - shooter.x), -(target.z - shooter.z));
    const targetYaw = Math.atan2(-(shooter.x - target.x), -(shooter.z - target.z));
    red.client.send({ type: 'input', forward: 0, strafe: 0, yaw: targetYaw, sprint: false });
    blue.client.send({ type: 'input', forward: 0, strafe: 0, yaw: shooterYaw, sprint: false });
    blue.client.messages = [];
    await blue.client.wait('state', s => Math.abs(s.players.find(p => p.id === red.id)!.yaw - targetYaw) < 0.001 && Math.abs(s.players.find(p => p.id === blue.id)!.yaw - shooterYaw) < 0.001);
    blue.client.send({ type: 'submit', number: target.number });
    await blue.client.wait('event', e => e.kind === 'elimination' && e.target === red.id);
    const returned = await blue.client.wait('state', s => !s.players.find(p => p.id === red.id)!.alive);
    assert.equal(returned.flags.blue.carrierId, null);
    assert.equal(returned.flags.blue.x, blueBase.x);
    assert.equal(returned.flags.blue.z, blueBase.z);
    const stolen = await walkTo(blue.client, blue.id, redBase);
    assert.equal(stolen.flags.red.carrierId, blue.id);
    const captured = await walkTo(blue.client, blue.id, blueBase);
    assert.equal(captured.scores.blue, 1);
    assert.equal(captured.scores.red, 0);
    assert.equal(captured.flags.red.carrierId, null);
    assert.equal(captured.flags.red.x, redBase.x);
    assert.equal(captured.players.find(p => p.id === blue.id)!.score, 4);
  });
});

test('production serves the client, route fallback and WASM MIME while rejecting traversal', async () => {
  const fixtureRoot = await mkdtemp(joinPath(tmpdir(), 'outnumbered-test-'));
  const staticDir = joinPath(fixtureRoot, 'dist');
  await mkdir(staticDir);
  await writeFile(joinPath(staticDir, 'index.html'), '<!doctype html><title>OutNumbered</title>');
  await writeFile(joinPath(fixtureRoot, 'private.txt'), 'must never be served');
  const assets = [
    ['game.wasm', 'application/wasm'], ['game.js', 'text/javascript'],
    ['game.css', 'text/css'], ['logo.svg', 'image/svg+xml'],
  ];
  for (const [filename] of assets) await writeFile(joinPath(staticDir, filename!), 'fixture');
  const game = await createGameServer({ port: 0, host: '127.0.0.1', staticDir });
  try {
    for (const path of ['/', '/play/invite']) {
      const page = await fetch(`http://127.0.0.1:${game.port}${path}`);
      assert.equal(page.status, 200);
      assert.match(page.headers.get('content-type')!, /text\/html/);
      assert.match(await page.text(), /OutNumbered/);
    }
    for (const [filename, mime] of assets) {
      const asset = await fetch(`http://127.0.0.1:${game.port}/${filename}`);
      assert.equal(asset.status, 200);
      assert.ok(asset.headers.get('content-type')!.startsWith(mime!));
    }
    assert.equal((await fetch(`http://127.0.0.1:${game.port}/missing.js`)).status, 404);
    const head = await fetch(`http://127.0.0.1:${game.port}/game.wasm`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    for (const path of ['/../private.txt', '/%2e%2e/private.txt', '/..%5cprivate.txt']) {
      // http.request keeps the hostile request path intact; fetch would normalize it first.
      const response = await new Promise<{ status: number; body: string }>((done, reject) => {
        const req = request({ host: '127.0.0.1', port: game.port, path }, res => {
          let body = '';
          res.on('data', chunk => { body += chunk.toString(); });
          res.on('end', () => done({ status: res.statusCode!, body }));
        });
        req.on('error', reject);
        req.end();
      });
      assert.equal(response.status, 400);
      assert.doesNotMatch(response.body, /must never be served/);
    }
  } finally {
    await game.close();
    // Verify the resolved target is the dedicated fixture before recursive cleanup.
    const target = resolve(fixtureRoot);
    assert.ok(target.startsWith(`${resolve(tmpdir())}${sep}outnumbered-test-`));
    await rm(target, { recursive: true, force: true });
  }
});
