/** All arena measurements are metres. Rendered solids and collision share this file. */
export type MapId = 'campus' | 'garden' | 'museum';
export type Wall = {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  zone: MapId;
  kind: 'boundary' | 'building' | 'cover' | 'display';
};

export const WORLD_LIMITS = { minX: -26, maxX: 78, minZ: -78, maxZ: 26 } as const;
export const ZONE_SIZE = 52;
export const PLAYER_RADIUS = 0.38;
export const PLAYER_EYE_HEIGHT = 1.65;

export const ZONES: { id: MapId; x: number; z: number; name: string }[] = [
  { id: 'campus', x: 0, z: 0, name: 'The Campus' },
  { id: 'garden', x: 52, z: 0, name: 'The Gardens' },
  { id: 'museum', x: 0, z: -52, name: 'The Gallery' },
];

const wall = (zone: MapId, kind: Wall['kind'], x: number, z: number, w: number, d: number, h: number): Wall =>
  ({ zone, kind, x, z, w, d, h });

export const WORLD_WALLS: Wall[] = [
  // Campus perimeter. Six-metre half-width openings lead east and north.
  wall('campus', 'boundary', -26, 0, 0.6, 52, 3),
  wall('campus', 'boundary', 0, 26, 52, 0.6, 3),
  wall('campus', 'boundary', 26, -16, 0.6, 20, 3),
  wall('campus', 'boundary', 26, 16, 0.6, 20, 3),
  wall('campus', 'boundary', -16, -26, 20, 0.6, 3),
  wall('campus', 'boundary', 16, -26, 20, 0.6, 3),
  // School wings leave broad lanes around a more intimate central courtyard.
  wall('campus', 'building', -18, -17, 10, 12, 6.5),
  wall('campus', 'building', 18, -17, 10, 12, 5.5),
  wall('campus', 'building', -18, 17, 10, 12, 5.5),
  wall('campus', 'building', 18, 17, 10, 12, 6.5),
  wall('campus', 'cover', -8, -1, 1.1, 8, 1.5),
  wall('campus', 'cover', 8, 1, 1.1, 8, 1.5),
  wall('campus', 'cover', 0, -12, 9, 1.1, 1.7),
  wall('campus', 'cover', 0, 12, 9, 1.1, 1.7),
  wall('campus', 'cover', -18, 1, 3.2, 3.2, 1.4),
  wall('campus', 'cover', 18, -1, 3.2, 3.2, 1.4),

  // Garden perimeter shares the campus western boundary and its opening.
  wall('garden', 'boundary', 78, 0, 0.6, 52, 2.8),
  wall('garden', 'boundary', 52, -26, 52, 0.6, 2.8),
  wall('garden', 'boundary', 52, 26, 52, 0.6, 2.8),
  wall('garden', 'cover', 42, -7, 10, 1.4, 1.6),
  wall('garden', 'cover', 62, 7, 10, 1.4, 1.6),
  wall('garden', 'cover', 39, 12, 4, 4, 1.5),
  wall('garden', 'cover', 65, -12, 4, 4, 1.5),
  wall('garden', 'cover', 52, -17, 10, 1.4, 1.8),
  wall('garden', 'cover', 52, 17, 10, 1.4, 1.8),
  wall('garden', 'display', 52, 0, 3.5, 3.5, 1.45),

  // Museum rooms are entered through the central doorway from the campus.
  wall('museum', 'boundary', -26, -52, 0.6, 52, 6),
  wall('museum', 'boundary', 26, -52, 0.6, 52, 6),
  wall('museum', 'boundary', 0, -78, 52, 0.6, 6),
  wall('museum', 'cover', -10, -52, 0.8, 18, 3.2),
  wall('museum', 'cover', 10, -52, 0.8, 18, 3.2),
  wall('museum', 'display', 0, -44, 7, 2.2, 1.65),
  wall('museum', 'display', 0, -60, 7, 2.2, 1.65),
  wall('museum', 'display', -18, -48, 3, 3, 1.7),
  wall('museum', 'display', 18, -56, 3, 3, 1.7),
  wall('museum', 'cover', -15, -69, 9, 1.2, 2.2),
  wall('museum', 'cover', 15, -35, 9, 1.2, 2.2),
];

/** Spawn points never intersect solids; both teams have multiple escape routes. */
export const SPAWNS: Record<MapId, { x: number; z: number }[]> = {
  campus: [
    { x: -4, z: 20 }, { x: 4, z: -20 }, { x: -21, z: 6 }, { x: 21, z: -6 },
    { x: -5, z: 6 }, { x: 5, z: -6 }, { x: -6, z: -18 }, { x: 6, z: 18 },
    { x: -12, z: 8 }, { x: 12, z: -8 },
  ],
  garden: [
    { x: 48, z: 21 }, { x: 56, z: -21 }, { x: 32, z: 4 }, { x: 72, z: -4 },
    { x: 47, z: 7 }, { x: 57, z: -7 }, { x: 35, z: -17 }, { x: 69, z: 17 },
    { x: 44, z: 15 }, { x: 60, z: -15 },
  ],
  museum: [
    { x: -4, z: -32 }, { x: 4, z: -72 }, { x: -20, z: -38 }, { x: 20, z: -66 },
    { x: -5, z: -49 }, { x: 5, z: -55 }, { x: -18, z: -60 }, { x: 18, z: -44 },
    { x: -5, z: -66 }, { x: 5, z: -38 },
  ],
};
