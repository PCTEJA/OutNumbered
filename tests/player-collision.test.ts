import test from 'node:test';
import assert from 'node:assert/strict';
import { move } from '../server/index.js';

test('movement cannot tunnel through another living player and can move away from contact', () => {
  const a = { x: 0, z: 0, alive: true }, b = { x: 2, z: 0, alive: true };
  const room = { players: new Map([['a', a], ['b', b]]), core: {
    clipX: (x: number, _z: number, dx: number) => x + dx,
    clipZ: (_x: number, z: number, dz: number) => z + dz,
  } };
  move(room as never, a as never, 5, 0);
  assert.ok(a.x < b.x && b.x - a.x >= .76);
  const contact = a.x;
  move(room as never, a as never, -1, 0);
  assert.ok(a.x < contact);
  b.alive = false;
  move(room as never, a as never, 5, 0);
  assert.ok(a.x > b.x, 'dead players do not block movement');
});
