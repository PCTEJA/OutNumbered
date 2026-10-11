// Small, real WASM hot path: swept circle/AABB movement and stamina updates.
// f64 preserves the same collision precision on the browser and Node server.
const walls = new Array<f64>();

export function resetWorld(): void {
  walls.length = 0;
}

export function addWall(minX: f64, minZ: f64, maxX: f64, maxZ: f64): void {
  walls.push(Math.min(minX, maxX));
  walls.push(Math.min(minZ, maxZ));
  walls.push(Math.max(minX, maxX));
  walls.push(Math.max(minZ, maxZ));
}

export function wallCount(): i32 {
  return walls.length / 4;
}

export function clipX(x: f64, z: f64, dx: f64, radius: f64): f64 {
  let next = x + dx;
  const r = Math.max(0.0, radius);
  for (let i = 0; i < walls.length; i += 4) {
    const minX = walls[i] - r;
    const minZ = walls[i + 1] - r;
    const maxX = walls[i + 2] + r;
    const maxZ = walls[i + 3] + r;
    if (z <= minZ || z >= maxZ) continue;
    if (dx > 0.0 && x <= minX && next > minX) next = minX;
    if (dx < 0.0 && x >= maxX && next < maxX) next = maxX;
  }
  return next;
}

export function clipZ(x: f64, z: f64, dz: f64, radius: f64): f64 {
  let next = z + dz;
  const r = Math.max(0.0, radius);
  for (let i = 0; i < walls.length; i += 4) {
    const minX = walls[i] - r;
    const minZ = walls[i + 1] - r;
    const maxX = walls[i + 2] + r;
    const maxZ = walls[i + 3] + r;
    if (x <= minX || x >= maxX) continue;
    if (dz > 0.0 && z <= minZ && next > minZ) next = minZ;
    if (dz < 0.0 && z >= maxZ && next < maxZ) next = maxZ;
  }
  return next;
}

export function inRange(x: f64, z: f64, tx: f64, tz: f64, maxRange: f64): bool {
  if (maxRange < 0.0) return false;
  const dx = tx - x;
  const dz = tz - z;
  return dx * dx + dz * dz <= maxRange * maxRange;
}

export function advanceStamina(stamina: f64, moving: bool, sprinting: bool, dt: f64): f64 {
  const elapsed = Math.max(0.0, dt);
  const change = moving && sprinting ? -19.0 * elapsed : 13.0 * elapsed;
  return Math.max(0.0, Math.min(100.0, stamina + change));
}
