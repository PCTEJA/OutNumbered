import { WORLD_WALLS, WORLD_LIMITS, PLAYER_RADIUS } from '../src/shared/world.js';

export interface Waypoint { x: number; z: number }
const margin = PLAYER_RADIUS + .12;
/** Swept point against expanded cover: paths preserve clearance for the full body. */
export function walkableSegment(a: Waypoint, b: Waypoint): boolean {
  if ([a, b].some(p => p.x < WORLD_LIMITS.minX + margin || p.x > WORLD_LIMITS.maxX - margin || p.z < WORLD_LIMITS.minZ + margin || p.z > WORLD_LIMITS.maxZ - margin)) return false;
  return !WORLD_WALLS.some(w => {
    let enter = 0, exit = 1;
    for (const [start, delta, min, max] of [[a.x, b.x - a.x, w.x - w.w / 2 - margin, w.x + w.w / 2 + margin], [a.z, b.z - a.z, w.z - w.d / 2 - margin, w.z + w.d / 2 + margin]]) {
      if (Math.abs(delta) < 1e-8) { if (start < min || start > max) return false; }
      else {
        const t1 = (min - start) / delta, t2 = (max - start) / delta;
        enter = Math.max(enter, Math.min(t1, t2)); exit = Math.min(exit, Math.max(t1, t2));
        if (enter > exit) return false;
      }
    }
    return true;
  });
}

// Static visibility graph: cover corners are built once, not for each simulation tick.
const nodes: Waypoint[] = [];
for (const wall of WORLD_WALLS) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
  const p = { x: wall.x + sx * (wall.w / 2 + margin + .08), z: wall.z + sz * (wall.d / 2 + margin + .08) };
  if (walkableSegment(p, p)) nodes.push(p);
}
const edges = nodes.map((a, i) => nodes.flatMap((b, j) => i !== j && walkableSegment(a, b) ? [j] : []));
const distance = (a: Waypoint, b: Waypoint) => Math.hypot(a.x - b.x, a.z - b.z);

export function findPath(start: Waypoint, goal: Waypoint): Waypoint[] {
  if (walkableSegment(start, goal)) return [{ x: goal.x, z: goal.z }];
  const points = [...nodes, start, goal], source = nodes.length, end = source + 1;
  const costs = points.map(() => Infinity), previous = points.map(() => -1);
  const open = new Set<number>([source]);
  costs[source] = 0;
  const goalLinks = new Set(nodes.flatMap((p, i) => walkableSegment(p, goal) ? [i] : []));
  while (open.size) {
    let current = -1, best = Infinity;
    for (const i of open) { const score = costs[i] + distance(points[i], goal); if (score < best) { best = score; current = i; } }
    if (current === end) {
      const path: Waypoint[] = [];
      for (let i = end; i !== source; i = previous[i]) path.unshift({ x: points[i].x, z: points[i].z });
      return path;
    }
    open.delete(current);
    const neighbors = current === source ? nodes.flatMap((p, i) => walkableSegment(start, p) ? [i] : []) : [...edges[current], ...(goalLinks.has(current) ? [end] : [])];
    for (const next of neighbors) {
      const cost = costs[current] + distance(points[current], points[next]);
      if (cost < costs[next]) { costs[next] = cost; previous[next] = current; open.add(next); }
    }
  }
  return [];
}

export function turnTowards(yaw: number, target: number, dt: number) {
  const delta = Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw));
  return yaw + Math.max(-dt * 3.5, Math.min(dt * 3.5, delta));
}
