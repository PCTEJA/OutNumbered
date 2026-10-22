export interface Pose { x: number; z: number; yaw: number; time: number }

/** Two ticks of history absorb delivery jitter; never extrapolate through cover. */
export class MotionBuffer {
  private samples: Pose[] = [];
  push(pose: Pose, reset = false) {
    const last = this.samples.at(-1);
    if (reset || (last && Math.hypot(pose.x - last.x, pose.z - last.z) > 3)) this.samples = [];
    if (this.samples.at(-1)?.time === pose.time) this.samples.pop();
    this.samples.push(pose);
    if (this.samples.length > 12) this.samples.shift();
  }
  sample(time: number): Pose | undefined {
    if (!this.samples.length) return;
    while (this.samples.length > 2 && this.samples[1].time <= time) this.samples.shift();
    const a = this.samples[0], b = this.samples[1] ?? a;
    const t = Math.max(0, Math.min(1, (time - a.time) / Math.max(1, b.time - a.time)));
    const angle = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, yaw: a.yaw + angle * t, time };
  }
}
