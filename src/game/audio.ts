/** Tiny synthesized game sounds. No audio files or initial audio download. */
export class GameAudio {
  private context?: AudioContext;
  volume = .55;
  async unlock() {
    this.context ??= new AudioContext();
    if (this.context.state === 'suspended') await this.context.resume();
  }
  play(kind: 'key' | 'hit' | 'miss' | 'step' | 'snap' | 'throw' | 'death') {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || this.volume <= 0) return;
    const configs = { key: [600, 850, .04, .028], hit: [680, 1300, .22, .12], miss: [160, 80, .16, .08], step: [80, 35, .04, .024], snap: [1500, 70, .11, .065], throw: [420, 140, .17, .045], death: [220, 40, .55, .1] };
    const [from, to, length, gain] = configs[kind];
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    oscillator.type = kind === 'step' || kind === 'snap' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(from, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + length);
    envelope.gain.setValueAtTime(gain * this.volume, ctx.currentTime);
    envelope.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + length);
    oscillator.connect(envelope).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + length);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  }
  dispose() { void this.context?.close(); }
}
