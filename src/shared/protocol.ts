export type GameMode = 'deathmatch' | 'team' | 'ctf';
export type MapId = 'campus' | 'garden' | 'museum';
export type Team = 'red' | 'blue';
export type GadgetKind = 'flash' | 'smoke' | 'distract';

export type ClientMessage =
  | { type: 'join'; name: string; mode: GameMode; map: MapId; room?: string; practice?: boolean }
  | { type: 'input'; forward: number; strafe: number; yaw: number; sprint: boolean; dt?: number }
  | { type: 'submit'; number: string }
  | { type: 'gadget'; kind: GadgetKind }
  | { type: 'ping'; sentAt?: number };

export interface PlayerState {
  id: string;
  name: string;
  /** Your own number is deliberately blank in your state messages. */
  number: string;
  team: Team;
  x: number;
  z: number;
  yaw: number;
  alive: boolean;
  score: number;
  deaths: number;
  isBot: boolean;
  respawnAt: number;
  stamina: number;
  /** Absolute server time when temporary spawn protection expires. */
  protectedUntil: number;
}

export interface FlagState {
  x: number;
  z: number;
  homeX: number;
  homeZ: number;
  carrierId: string | null;
}

export interface WorldEffect {
  id: string;
  kind: 'smoke' | 'distract';
  x: number;
  z: number;
  expiresAt: number;
}

export interface StateMessage {
  type: 'state';
  players: PlayerState[];
  scores: Record<Team, number>;
  timeLeft: number;
  mode: GameMode;
  map: MapId;
  serverTime: number;
  ended: boolean;
  flags: Record<Team, FlagState>;
  effects: WorldEffect[];
  cooldowns: Record<GadgetKind, number>;
}

export interface GameEvent {
  type: 'event';
  kind: 'elimination' | 'miss' | 'flash' | 'smoke' | 'distract' | 'capture' | 'system';
  text: string;
  actor?: string;
  target?: string;
  x?: number;
  z?: number;
  id?: string;
  duration?: number;
  affectedIds?: string[];
}

export type ServerMessage =
  | { type: 'welcome'; id: string; room: string; mode: GameMode; map: MapId }
  | StateMessage
  | GameEvent
  | { type: 'error'; message: string }
  | { type: 'pong'; sentAt?: number; serverTime: number };

export interface RoomSummary {
  id: string;
  mode: GameMode;
  map: MapId;
  players: number;
  capacity: number;
  timeLeft: number;
}
