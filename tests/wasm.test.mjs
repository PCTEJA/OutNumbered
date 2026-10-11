import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test, beforeEach } from 'node:test';

const binary = await readFile(new URL('../public/wasm/outnumbered.wasm', import.meta.url));
const { instance } = await WebAssembly.instantiate(binary, {
  env: { abort() { throw new Error('WASM aborted'); } },
});
const core = instance.exports;
beforeEach(() => core.resetWorld());

test('movement is free outside walls', () => {
  assert.equal(core.clipX(1, 1, 5, 0.38), 6);
  assert.equal(core.clipZ(1, 1, -3, 0.38), -2);
});

test('swept collision catches large steps in both directions with radius clearance', () => {
  core.addWall(3, -2, 4, 2);
  assert.equal(core.clipX(0, 0, 20, 0.38), 2.62);
  assert.equal(core.clipX(9, 0, -20, 0.38), 4.38);
  assert.equal(core.clipX(0, 3, 20, 0.38), 20);
});

test('a player can slide along a wall and move away from contact', () => {
  core.addWall(3, -2, 4, 2);
  const x = core.clipX(0, 0, 4, 0.38);
  assert.equal(core.clipZ(x, 0, 1, 0.38), 1);
  assert.equal(core.clipX(x, 0, -1, 0.38), 1.62);
});

test('Z collision mirrors X and reset clears the world', () => {
  core.addWall(-2, 3, 2, 4);
  assert.equal(core.clipZ(0, 0, 20, 0.5), 2.5);
  assert.equal(core.clipZ(0, 9, -20, 0.5), 4.5);
  assert.equal(core.wallCount(), 1);
  core.resetWorld();
  assert.equal(core.wallCount(), 0);
  assert.equal(core.clipZ(0, 0, 20, 0.5), 20);
});

test('range is radial, inclusive and rejects negative distance limits', () => {
  assert.equal(core.inRange(0, 0, 3, 4, 5), 1);
  assert.equal(core.inRange(0, 0, 3, 4, 4.99), 0);
  assert.equal(core.inRange(0, 0, 0, 0, -1), 0);
});

test('stamina drains only while sprinting and moving, and remains bounded', () => {
  assert.equal(core.advanceStamina(100, 1, 1, 1), 81);
  assert.equal(core.advanceStamina(50, 0, 1, 1), 63);
  assert.equal(core.advanceStamina(50, 1, 0, 1), 63);
  assert.equal(core.advanceStamina(5, 1, 1, 1), 0);
  assert.equal(core.advanceStamina(95, 0, 0, 1), 100);
  assert.equal(core.advanceStamina(50, 1, 1, -1), 50);
});
