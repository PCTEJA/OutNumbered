import test from 'node:test';
import assert from 'node:assert/strict';
import { MotionBuffer } from '../src/game/motion';
import { findPath, walkableSegment, turnTowards } from '../server/navigation';
import { SPAWNS } from '../src/shared/world';

test('snapshot interpolation holds during stalls, takes the shortest turn and resets on teleport', () => {
  const buffer = new MotionBuffer();
  buffer.push({ x: 0, z: 0, yaw: 3.1, time: 1000 });
  buffer.push({ x: 1, z: 0, yaw: -3.1, time: 1100 });
  assert.equal(buffer.sample(1050)?.x, .5);
  assert.ok(Math.abs(buffer.sample(1050)!.yaw - Math.PI) < .001);
  assert.equal(buffer.sample(9999)?.x, 1, 'a connection stall must not extrapolate through cover');
  buffer.push({ x: 20, z: 20, yaw: 0, time: 1200 });
  assert.equal(buffer.sample(1100)?.x, 20, 'respawn must not slide across the map');
});

test('patrol routes connect every consecutive spawn without crossing expanded cover', () => {
  for (const patrol of Object.values(SPAWNS)) for (let i = 0; i < patrol.length; i++) {
    const start = patrol[i], goal = patrol[(i + 1) % patrol.length];
    const path = findPath(start, goal);
    assert.ok(path.length, `no route from ${JSON.stringify(start)} to ${JSON.stringify(goal)}`);
    let previous = start;
    for (const point of path) { assert.ok(walkableSegment(previous, point)); previous = point; }
    assert.deepEqual(previous, { x: goal.x, z: goal.z });
  }
});

test('bot steering is bounded and frame-rate independent across angle wrapping', () => {
  assert.ok(Math.abs(turnTowards(0, Math.PI, .05)) <= .175001);
  let yaw = 0;
  for (let i = 0; i < 20; i++) yaw = turnTowards(yaw, 1, .05);
  assert.ok(Math.abs(yaw - 1) < 1e-8);
  assert.ok(Math.abs(turnTowards(3.1, -3.1, .05) - 3.1) < .1);
});
