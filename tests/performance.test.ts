import test from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveResolution, renderPixelRatio } from '../src/game/performance';

test('adaptive resolution absorbs isolated stalls and responds to sustained load without oscillating', () => {
  const adaptive = new AdaptiveResolution();
  assert.equal(adaptive.sample(100), false);
  assert.equal(adaptive.scale, 1);
  for (let i = 0; i < 300; i++) adaptive.sample(33.3);
  assert.ok(adaptive.scale < .95);
  const reduced = adaptive.scale;
  for (let i = 0; i < 240; i++) adaptive.sample(16.67);
  assert.ok(Math.abs(adaptive.scale - reduced) < .001, 'recovery waits for sustained headroom');
  for (let i = 0; i < 700; i++) adaptive.sample(16.67);
  assert.ok(adaptive.scale > reduced);
  for (let i = 0; i < 5000; i++) adaptive.sample(50);
  assert.ok(adaptive.scale >= .8, 'keep numbers readable under prolonged overload');
  for (let i = 0; i < 5000; i++) adaptive.sample(10);
  assert.ok(adaptive.scale <= 1);
});

test('background-tab gaps and invalid frame samples never downscale the game', () => {
  const adaptive = new AdaptiveResolution();
  for (const sample of [10000, Infinity, NaN, -100, 0]) adaptive.sample(sample);
  assert.equal(adaptive.scale, 1);
});

test('rendering has a pixel budget on high-DPI and 4K displays', () => {
  for (const [width, height, dpr] of [[1920, 1080, 2], [3840, 2160, 2], [1440, 900, 3]]) {
    const ratio = renderPixelRatio('auto', dpr, width, height);
    assert.ok(width * height * ratio ** 2 <= 2_000_001);
    assert.ok(ratio <= dpr);
    assert.equal(renderPixelRatio('auto', dpr, width, height, .6), ratio * .6);
    assert.equal(renderPixelRatio('high', dpr, width, height, .6), renderPixelRatio('high', dpr, width, height));
  }
});
