/** Slow, bounded resolution changes avoid oscillation and leave the HUD native-sharp. */
export class AdaptiveResolution {
  scale = 1;
  private elapsed = 0;
  private frames = 0;
  private stable = 0;

  reset() { this.elapsed = this.frames = this.stable = 0; }

  sample(frameMs: number): boolean {
    if (!Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 250) { this.reset(); return false; }
    this.elapsed += frameMs;
    this.frames++;
    if (this.elapsed < 2000) return false;
    const average = this.elapsed / this.frames;
    this.stable = average < 17.5 ? this.stable + this.elapsed : 0;
    const previous = this.scale;
    if (average > 20) this.scale = Math.max(.8, this.scale - .1);
    else if (this.stable >= 10000) { this.scale = Math.min(1, this.scale + .1); this.stable = 0; }
    this.elapsed = this.frames = 0;
    return Math.abs(previous - this.scale) > .001;
  }
}

export function renderPixelRatio(quality: string, dpr: number, width: number, height: number, scale = 1) {
  const cap = quality === 'high' ? 1.6 : quality === 'low' ? 1 : 1.25;
  const budget = quality === 'high' ? 4_000_000 : 2_000_000;
  return Math.min(dpr, cap, Math.sqrt(budget / Math.max(1, width * height))) * (quality === 'auto' ? scale : 1);
}
