import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlagCloth, animateFlag } from '../src/game/flag';
import { createSky } from '../src/game/sky';

test('flag waves preserve the pinned hoist, cloth dimensions and finite normals', () => {
  const cloth = createFlagCloth('blue');
  const positions = cloth.geometry.attributes.position;
  const original = positions.array.slice();
  let freeEdgeMoved = false;
  for (const time of [0, .3, 1.5, 9, 100]) {
    animateFlag(cloth, time);
    for (let i = 0; i < positions.count; i++) {
      assert.equal(positions.getX(i), original[i * 3]);
      assert.equal(positions.getY(i), original[i * 3 + 1]);
      assert.ok(Math.abs(positions.getZ(i)) <= .111);
      if (positions.getX(i) < -.549) assert.ok(Math.abs(positions.getZ(i)) < 1e-7);
      if (positions.getX(i) > .549 && Math.abs(positions.getZ(i)) > .01) freeEdgeMoved = true;
    }
    for (const value of cloth.geometry.attributes.normal.array) assert.ok(Number.isFinite(value));
  }
  assert.ok(freeEdgeMoved);
  cloth.geometry.dispose(); cloth.material.dispose();
});

test('sky does not write depth or add shadows that can obscure gameplay', () => {
  const sky = createSky();
  assert.equal(sky.material.depthWrite, false);
  assert.equal(sky.castShadow, false);
  assert.equal(sky.frustumCulled, false);
  sky.geometry.dispose(); sky.material.dispose();
});
