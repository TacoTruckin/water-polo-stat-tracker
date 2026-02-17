'use client';

import type { Dispatch, ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import type { Context, GameClock, GameEvent, Quarter, Team } from './types';

export type Settings = {
  enableGoalAllowedPrimaryDef: boolean;
  enableFiveMAllowed: boolean;
};

export type Roster = {
  us: string[];
  them?: string[];
  names?: Record<string, string>;
};

export type GameState = {
  selectedTeam: Team;
  selectedPlayer: string | null;
  quarter: Quarter;
  context: Context;
  events: GameEvent[];
  undoStack: GameEvent[][];
  settings: Settings;
  roster: Roster;
  gameId: string;
  clock: GameClock;
  opponent: string;
  createdAt: number;
  sessionId: string | null;
};

export type GameAction =
  | { type: 'SET_TEAM'; team: Team }
  | { type: 'SET_PLAYER'; player: string | null }
  | { type: 'SET_QUARTER'; quarter: Quarter }
  | { type: 'SET_CONTEXT'; context: Context }
  | { type: 'SET_OPPONENT'; opponent: string }
  | { type: 'SET_GAME_META'; opponent: string; createdAt: number; gameId?: string }
  | { type: 'SET_SESSION'; sessionId: string | null }
  | { type: 'SET_EVENTS'; events: GameEvent[] }
  | { type: 'ADD_EVENT'; event: GameEvent }
  | { type: 'UNDO' }
  | { type: 'EDIT_EVENT'; id: string; updates: Partial<GameEvent> }
  | { type: 'DELETE_EVENT'; id: string }
  | { type: 'LOAD_GAME'; state: GameState }
  | { type: 'RESET_GAME' }
  | { type: 'SET_ROSTER_NAMES'; names: Record<string, string> }
  | { type: 'CLOCK_START'; now: number }
  | { type: 'CLOCK_PAUSE'; now: number }
  | { type: 'CLOCK_RESUME'; now: number }
  | { type: 'CLOCK_RESET' };

export const STORAGE_KEY = 'water-polo-stat-tracker:v1';

const seedRoster = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16'
];

const seedNames: Record<string, string> = {
  '1': 'Max',
  '2': 'Bennett',
  '3': 'Wesley',
  '4': 'Daniel',
  '5': 'Marco',
  '6': 'Kai',
  '7': 'Elias',
  '8': 'Leo',
  '9': 'Arhan',
  '10': 'Connor',
  '11': 'Drew',
  '12': 'George',
  '13': 'Kaikea',
  '14': 'Alexander',
  '15': 'Jasper',
  '16': 'Santiago'
};

const defaultSettings: Settings = {
  enableGoalAllowedPrimaryDef: false,
  enableFiveMAllowed: false
};

const defaultClock: GameClock = {
  status: 'STOPPED',
  elapsedMs: 0,
  runningSinceMs: null
};

function createGameId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `game-${Date.now()}`;
}

export function createInitialState(): GameState {
  return {
    selectedTeam: 'US',
    selectedPlayer: null,
    quarter: 1,
    context: 'EVEN',
    events: [],
    undoStack: [],
    settings: { ...defaultSettings },
    roster: { us: [...seedRoster], names: { ...seedNames } },
    gameId: createGameId(),
    clock: { ...defaultClock },
    opponent: '',
    createdAt: 0,
    sessionId: null
  };
}

function snapshotEvents(events: GameEvent[]): GameEvent[] {
  return events.map((event) => ({
    ...event,
    shot: event.shot ? { ...event.shot } : undefined
  }));
}

function withUndo(state: GameState, events: GameEvent[]): GameState {
  const nextUndoStack = [...state.undoStack, snapshotEvents(state.events)].slice(-10);
  return { ...state, events, undoStack: nextUndoStack };
}

function mergeStateWithDefaults(raw: Partial<GameState> | null): GameState {
  const base = createInitialState();
  if (!raw || typeof raw !== 'object') return base;
  const storedRoster = raw.roster?.us ?? base.roster.us;
  const normalizedRoster =
    storedRoster.length >= base.roster.us.length
      ? storedRoster
      : [...storedRoster, ...base.roster.us.slice(storedRoster.length)];
  const mergedNames = { ...base.roster.names, ...(raw.roster?.names ?? {}) };
  return {
    ...base,
    ...raw,
    settings: { ...base.settings, ...raw.settings },
    roster: { ...base.roster, ...raw.roster, us: normalizedRoster, names: mergedNames },
    clock: { ...base.clock, ...raw.clock },
    events: Array.isArray(raw.events) ? raw.events : base.events,
    undoStack: Array.isArray(raw.undoStack) ? raw.undoStack : base.undoStack,
    gameId: raw.gameId ?? base.gameId,
    opponent: raw.opponent ?? base.opponent,
    createdAt: raw.createdAt ?? base.createdAt,
    sessionId: raw.sessionId ?? base.sessionId
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SET_TEAM':
      return { ...state, selectedTeam: action.team };
    case 'SET_PLAYER':
      return { ...state, selectedPlayer: action.player };
    case 'SET_QUARTER':
      return { ...state, quarter: action.quarter };
    case 'SET_CONTEXT':
      return { ...state, context: action.context };
    case 'SET_OPPONENT':
      return { ...state, opponent: action.opponent };
    case 'SET_GAME_META':
      return {
        ...state,
        opponent: action.opponent,
        createdAt: action.createdAt,
        gameId: action.gameId ?? state.gameId
      };
    case 'SET_SESSION':
      return {
        ...state,
        sessionId: action.sessionId
      };
    case 'SET_EVENTS':
      return {
        ...state,
        events: action.events,
        undoStack: []
      };
    case 'ADD_EVENT':
      return withUndo(state, [...state.events, action.event]);
    case 'UNDO': {
      if (state.undoStack.length === 0) return state;
      const previousEvents = state.undoStack[state.undoStack.length - 1];
      return {
        ...state,
        events: previousEvents,
        undoStack: state.undoStack.slice(0, -1)
      };
    }
    case 'EDIT_EVENT': {
      const index = state.events.findIndex((event) => event.id === action.id);
      if (index === -1) return state;
      const nextEvents = [...state.events];
      nextEvents[index] = { ...nextEvents[index], ...action.updates };
      return withUndo(state, nextEvents);
    }
    case 'DELETE_EVENT': {
      const nextEvents = state.events.filter((event) => event.id !== action.id);
      if (nextEvents.length === state.events.length) return state;
      return withUndo(state, nextEvents);
    }
    case 'LOAD_GAME':
      return mergeStateWithDefaults(action.state);
    case 'RESET_GAME':
      return createInitialState();
    case 'SET_ROSTER_NAMES':
      return {
        ...state,
        roster: { ...state.roster, names: { ...state.roster.names, ...action.names } }
      };
    case 'CLOCK_START':
      return {
        ...state,
        clock: {
          status: 'RUNNING',
          elapsedMs: 0,
          runningSinceMs: action.now
        }
      };
    case 'CLOCK_PAUSE': {
      if (state.clock.status !== 'RUNNING' || state.clock.runningSinceMs === null) {
        return state;
      }
      const elapsedMs = state.clock.elapsedMs + (action.now - state.clock.runningSinceMs);
      return {
        ...state,
        clock: {
          status: 'PAUSED',
          elapsedMs,
          runningSinceMs: null
        }
      };
    }
    case 'CLOCK_RESUME':
      if (state.clock.status !== 'PAUSED') return state;
      return {
        ...state,
        clock: {
          status: 'RUNNING',
          elapsedMs: state.clock.elapsedMs,
          runningSinceMs: action.now
        }
      };
    case 'CLOCK_RESET':
      return {
        ...state,
        clock: { ...defaultClock }
      };
    default:
      return state;
  }
}

type GameContextValue = {
  state: GameState;
  dispatch: Dispatch<GameAction>;
};

const GameContext = createContext<GameContextValue | undefined>(undefined);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, undefined, createInitialState);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<GameState>;
      dispatch({ type: 'LOAD_GAME', state: parsed as GameState });
    } catch {
      // Ignore bad storage
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within GameProvider');
  }
  return context;
}
