import test from 'node:test';
import assert from 'node:assert/strict';
import { stickVector, wantsTouchControls } from '../src/game/touch-controls';

test('touch detection supports phones and tablets without treating every narrow window as mobile', () => {
  assert.equal(wantsTouchControls('auto', true, true, 5), true);
  assert.equal(wantsTouchControls('auto', false, true, 5), true);
  assert.equal(wantsTouchControls('auto', false, false, 5), false, 'hybrid starts with its primary mouse; actual touch can opt in');
  assert.equal(wantsTouchControls('auto', false, false, 0), false);
  assert.equal(wantsTouchControls('touch', false, false, 0), true);
  assert.equal(wantsTouchControls('desktop', true, true, 5), false);
});

test('stick dead zone removes resting-thumb drift and preserves analog speed', () => {
  assert.equal(Math.hypot(...Object.values(stickVector(2, 2, 48))), 0);
  const half = stickVector(0, -24, 48);
  assert.ok(half.forward > .4 && half.forward < .5);
  assert.equal(half.strafe, 0);
  assert.deepEqual(stickVector(0, -48, 48), { forward: 1, strafe: 0 });
  assert.equal(stickVector(-48, 0, 48).strafe, -1);
  assert.equal(stickVector(0, 48, 48).forward, -1);
});

test('diagonal and out-of-bounds drags never exceed full movement speed', () => {
  for (const [x, y] of [[48, -48], [2000, -4000], [-100, 400]]) {
    const result = stickVector(x, y, 48);
    assert.ok(Math.abs(Math.hypot(result.forward, result.strafe) - 1) < 1e-10);
    assert.equal(Math.sign(result.strafe), Math.sign(x));
    assert.equal(Math.sign(result.forward), -Math.sign(y));
  }
});
