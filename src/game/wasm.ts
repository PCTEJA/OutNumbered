import { PLAYER_RADIUS, WORLD_WALLS } from '../shared/world';

interface CoreExports extends WebAssembly.Exports {
  resetWorld(): void;
  addWall(minX: number, minZ: number, maxX: number, maxZ: number): void;
  clipX(x: number, z: number, dx: number, radius: number): number;
  clipZ(x: number, z: number, dz: number, radius: number): number;
  inRange(x: number, z: number, tx: number, tz: number, maxRange: number): number;
  advanceStamina(stamina: number, moving: number, sprinting: number, dt: number): number;
}

export interface GameCore {
  move(x: number, z: number, dx: number, dz: number, radius?: number): { x: number; z: number };
  stamina(value: number, moving: boolean, sprinting: boolean, dt: number): number;
  inRange(x: number, z: number, tx: number, tz: number, maxRange: number): boolean;
}

/** Called only on entering a match, so the landing page never downloads the core. */
export async function loadCore(): Promise<GameCore> {
  const response = await fetch(`${import.meta.env.BASE_URL}wasm/outnumbered.wasm`);
  if (!response.ok) throw new Error(`Game engine download failed (${response.status}). Please retry.`);
  const imports = { env: { abort: () => { throw new Error('The game engine stopped unexpectedly.'); } } };
  let result: WebAssembly.WebAssemblyInstantiatedSource;
  try {
    // clone lets non-WASM MIME hosts retry without downloading the module twice.
    result = await WebAssembly.instantiateStreaming(response.clone(), imports);
  } catch {
    result = await WebAssembly.instantiate(await response.arrayBuffer(), imports);
  }
  const core = result.instance.exports as CoreExports;
  core.resetWorld();
  for (const wall of WORLD_WALLS) {
    core.addWall(wall.x - wall.w / 2, wall.z - wall.d / 2, wall.x + wall.w / 2, wall.z + wall.d / 2);
  }
  return {
    move(x, z, dx, dz, radius = PLAYER_RADIUS) {
      const nextX = core.clipX(x, z, dx, radius);
      return { x: nextX, z: core.clipZ(nextX, z, dz, radius) };
    },
    stamina: (value, moving, sprinting, dt) => core.advanceStamina(value, +moving, +sprinting, dt),
    inRange: (x, z, tx, tz, maxRange) => !!core.inRange(x, z, tx, tz, maxRange),
  };
}
