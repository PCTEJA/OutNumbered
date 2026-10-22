import test from 'node:test';
import assert from 'node:assert/strict';
import { Jump } from '../src/game/jump';

test('jump starts immediately, peaks, lands, and cannot restart in midair', () => {
  const jump = new Jump();
  assert.equal(jump.height(0), 0);
  jump.press(0);
  assert.equal(jump.height(325), .8);
  jump.press(325);
  assert.equal(jump.height(650), 0);
  jump.press(650);
  assert.equal(jump.height(975), .8);
});

test('late presses buffer until landing and reset clears pending jumps', () => {
  const jump = new Jump();
  jump.press(1000);
  jump.press(1600);
  assert.equal(jump.height(1975), .8);
  jump.press(2250);
  jump.reset();
  assert.equal(jump.height(2625), 0);
});
