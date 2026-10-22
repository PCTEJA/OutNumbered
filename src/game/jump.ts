/** Local first-person jump; horizontal collision remains controlled by the game core. */
export class Jump {
  private startedAt = -Infinity;
  private queued = false;
  readonly duration = 650;

  press(now: number) {
    if (now >= this.startedAt + this.duration) this.startedAt = now;
    else if (this.startedAt + this.duration - now <= 120) this.queued = true;
  }

  height(now: number) {
    const landing = this.startedAt + this.duration;
    if (now >= landing && this.queued) {
      this.startedAt = landing;
      this.queued = false;
    }
    const t = (now - this.startedAt) / this.duration;
    return t >= 0 && t < 1 ? 4 * .8 * t * (1 - t) : 0;
  }

  reset() { this.startedAt = -Infinity; this.queued = false; }
}
