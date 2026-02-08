export type Team = 'US' | 'THEM';

export type Quarter = 1 | 2 | 3 | 4 | 5;

export type Context = 'EVEN' | 'MAN_UP' | 'MAN_DOWN' | 'COUNTER' | 'FIVE_M';

export type SessionScope = 'OFFENSE' | 'DEFENSE' | 'BOTH';

export type ClockStatus = 'STOPPED' | 'RUNNING' | 'PAUSED';

export type GameClock = {
  status: ClockStatus;
  elapsedMs: number;
  runningSinceMs: number | null;
};

export enum EventType {
  SHOT_GOAL = 'SHOT_GOAL',
  SHOT_SAVED = 'SHOT_SAVED',
  SHOT_BLOCKED = 'SHOT_BLOCKED',
  SHOT_WIDE = 'SHOT_WIDE',
  ASSIST = 'ASSIST',
  OFF_EXCLUSION_DRAWN = 'OFF_EXCLUSION_DRAWN',
  FIVE_M_DRAWN = 'FIVE_M_DRAWN',
  TO_BAD_PASS = 'TO_BAD_PASS',
  TO_STOLEN_FROM = 'TO_STOLEN_FROM',
  OFFENSIVE_FOUL = 'OFFENSIVE_FOUL',
  STEAL = 'STEAL',
  BLOCK = 'BLOCK',
  TIP = 'TIP',
  DEF_EXCLUSION_DRAWN = 'DEF_EXCLUSION_DRAWN',
  FIVE_M_ALLOWED = 'FIVE_M_ALLOWED',
  GOAL_ALLOWED_PRIMARY_DEF = 'GOAL_ALLOWED_PRIMARY_DEF',
  GOALIE_SAVE = 'GOALIE_SAVE',
  GOALIE_GOAL_ALLOWED = 'GOALIE_GOAL_ALLOWED',
  GOALIE_FIVE_M_FACED = 'GOALIE_FIVE_M_FACED',
  GOALIE_FIVE_M_SAVED = 'GOALIE_FIVE_M_SAVED',
  GOALIE_OUTLET_ASSIST = 'GOALIE_OUTLET_ASSIST'
}

export enum ShotZone {
  LEFT_WING = 'LEFT_WING',
  RIGHT_WING = 'RIGHT_WING',
  POINT = 'POINT',
  ONE_TWO = 'ONE_TWO',
  THREE_FOUR = 'THREE_FOUR',
  POST_UP = 'POST_UP',
  COUNTER = 'COUNTER'
}

export enum ShotOutcome {
  GOAL = 'GOAL',
  SAVED = 'SAVED',
  BLOCKED = 'BLOCKED',
  WIDE = 'WIDE'
}

export type ShotMeta = {
  zone: ShotZone;
  outcome: ShotOutcome;
  situation: Context;
};

export type GameEvent = {
  id: string;
  gameId: string;
  team: Team;
  playerNumber: string;
  quarter: Quarter;
  context: Context;
  eventType: EventType;
  createdAt: string;
  period: Quarter;
  gameClockMs: number;
  wallClockMs: number;
  displayTime: string;
  createdBy?: string;
  eventScope?: SessionScope;
  notes?: string;
  shot?: ShotMeta;
};

const shotOutcomes = new Set(Object.values(ShotOutcome));
const shotZones = new Set(Object.values(ShotZone));
const contexts = new Set<Context>(['EVEN', 'MAN_UP', 'MAN_DOWN', 'COUNTER', 'FIVE_M']);

export function isShotOutcome(value: string): value is ShotOutcome {
  return shotOutcomes.has(value as ShotOutcome);
}

export function isShotZone(value: string): value is ShotZone {
  return shotZones.has(value as ShotZone);
}

export function isContext(value: string): value is Context {
  return contexts.has(value as Context);
}

export function hasValidShot(shot?: ShotMeta): shot is ShotMeta {
  if (!shot) return false;
  return isShotZone(shot.zone) && isShotOutcome(shot.outcome) && isContext(shot.situation);
}
