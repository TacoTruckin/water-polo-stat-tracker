'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useGame } from '@/lib/store';
import type { Context, GameEvent, Quarter, SessionScope, ShotZone, Team } from '@/lib/types';
import { EventType, ShotOutcome } from '@/lib/types';
import { ShotModal } from '@/components/ShotModal';
import { supabase } from '@/lib/supabaseClient';
import { useRequireAuth } from '@/lib/useRequireAuth';
import { useProfile } from '@/lib/useProfile';

const quarterOptions: { value: Quarter; label: string }[] = [
  { value: 1, label: 'Q1' },
  { value: 2, label: 'Q2' },
  { value: 3, label: 'Q3' },
  { value: 4, label: 'Q4' },
  { value: 5, label: 'OT' },
];

const contextOptions: { value: Context; label: string }[] = [
  { value: 'EVEN', label: 'Even' },
  { value: 'MAN_UP', label: 'Man-Up' },
  { value: 'MAN_DOWN', label: 'Man-Down' },
  { value: 'COUNTER', label: 'Counter' },
  { value: 'FIVE_M', label: '5M' },
];

const teamOptions: { value: Team; label: string }[] = [
  { value: 'US', label: 'US' },
  { value: 'THEM', label: 'Them' },
];

const offenseActions = [
  'Goal',
  'Shot',
  'Assist',
  'Turnover',
  'Offensive Foul',
  'Exclusion',
  '5M',
  'Outlet Assist',
];

const shotOutcomeToEvent: Record<ShotOutcome, EventType> = {
  [ShotOutcome.GOAL]: EventType.SHOT_GOAL,
  [ShotOutcome.SAVED]: EventType.SHOT_SAVED,
  [ShotOutcome.BLOCKED]: EventType.SHOT_BLOCKED,
  [ShotOutcome.WIDE]: EventType.SHOT_WIDE,
};

const defensiveActions: { label: string; eventType: EventType }[] = [
  { label: 'Steal', eventType: EventType.STEAL },
  { label: 'Block', eventType: EventType.BLOCK },
  { label: 'Tip', eventType: EventType.TIP },
  { label: 'Def Exclusion', eventType: EventType.DEF_EXCLUSION_DRAWN },
];

const primaryOffenseLabels = new Set(['Goal', 'Shot', 'Assist', 'Turnover']);

const secondaryActions: { label: string; eventType?: EventType }[] = offenseActions
  .filter((label) => !primaryOffenseLabels.has(label))
  .map((label) => ({ label }));

const eventLabels: Partial<Record<EventType, string>> = {
  [EventType.SHOT_GOAL]: 'Shot: Goal',
  [EventType.SHOT_SAVED]: 'Shot: Saved',
  [EventType.SHOT_BLOCKED]: 'Shot: Blocked',
  [EventType.SHOT_WIDE]: 'Shot: Wide',
  [EventType.ASSIST]: 'Assist',
  [EventType.TO_BAD_PASS]: 'Turnover: Bad Pass',
  [EventType.TO_STOLEN_FROM]: 'Turnover: Stolen From',
  [EventType.STEAL]: 'Steal',
  [EventType.BLOCK]: 'Block',
  [EventType.TIP]: 'Tip',
  [EventType.DEF_EXCLUSION_DRAWN]: 'Def Exclusion',
};

function ActionButton({
  label,
  tone = 'neutral',
  selected = false,
  disabled = false,
  className = '',
  onClick,
}: {
  label: string;
  tone?: 'neutral' | 'primary';
  selected?: boolean;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  const base =
    'min-h-[56px] w-full rounded-xl border px-3 text-sm font-semibold md:text-base';
  const toneStyles =
    tone === 'primary'
      ? 'border-slate-900 bg-slate-900 text-white'
      : 'border-slate-200 bg-white text-slate-700';
  const selectedStyles = selected ? 'ring-2 ring-slate-900' : '';
  const disabledStyles = disabled ? 'cursor-not-allowed opacity-50' : '';

  return (
    <button
      className={`${base} ${toneStyles} ${selectedStyles} ${disabledStyles} ${className}`}
      onClick={onClick}
      type="button"
      aria-pressed={selected}
      disabled={disabled}
    >
      {label}
    </button>
  );
}

type AssistContext = {
  team: Team;
  quarter: Quarter;
  context: Context;
  goalId: string;
};

function LivePageContent() {
  const { state, dispatch } = useGame();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useRequireAuth('/login');
  const { profile } = useProfile(user);
  const [nowMs, setNowMs] = useState(Date.now());
  const [assistContext, setAssistContext] = useState<AssistContext | null>(null);
  const [assistPicking, setAssistPicking] = useState(false);
  const [turnoverPickerOpen, setTurnoverPickerOpen] = useState(false);
  const [shotModalOpen, setShotModalOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [opponentEditOpen, setOpponentEditOpen] = useState(false);
  const [opponentDraft, setOpponentDraft] = useState(state.opponent);
  const [lastAssistPair, setLastAssistPair] = useState<{ assistId: string; goalId: string } | null>(
    null
  );
  const [sessionInfo, setSessionInfo] = useState<{
    opponent: string;
    startedAt: string | null;
    gameId: string | null;
    roleScope: SessionScope | null;
  } | null>(null);
  const lastShotZoneRef = useRef<{ zone: ShotZone; timestamp: number } | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const eventsRef = useRef(state.events);
  const lastEvent = state.events[state.events.length - 1];
  const lastEventLabel = lastEvent
    ? eventLabels[lastEvent.eventType] ?? lastEvent.eventType
    : 'none';
  const isLiveMode = state.clock.status === 'RUNNING';
  const opponentLabel = sessionInfo?.opponent?.trim()
    ? sessionInfo.opponent.trim()
    : state.opponent.trim()
      ? state.opponent.trim()
      : '(Unknown)';
  const sessionTimeLabel = sessionInfo?.startedAt
    ? formatSessionTime(sessionInfo.startedAt)
    : state.createdAt
      ? formatSessionTime(state.createdAt)
      : '';
  const sessionDisplay = sessionTimeLabel
    ? `vs ${opponentLabel} — ${sessionTimeLabel}`
    : `vs ${opponentLabel}`;
  const sessionIdParam = searchParams.get('sessionId');


  const playerOptions = (() => {
    if (state.selectedTeam === 'US') {
      return state.roster.us;
    }
    if (state.roster.them && state.roster.them.length > 0) {
      return state.roster.them;
    }
    return Array.from({ length: 14 }, (_, index) => `O${index + 1}`);
  })();

  const createEventId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const formatClock = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  function formatSessionTime(timestamp: number | string) {
    const date = new Date(timestamp);
    const datePart = date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const timePart = date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    return `${datePart} ${timePart}`;
  }

  const periodLabel = state.quarter === 5 ? 'OT' : `Q${state.quarter}`;
  const sessionScope = sessionInfo?.roleScope ?? null;
  const effectiveScope: SessionScope | null =
    profile?.role === 'super_admin' ? 'BOTH' : sessionScope;
  const canOffense = effectiveScope === 'OFFENSE' || effectiveScope === 'BOTH';
  const canDefense = effectiveScope === 'DEFENSE' || effectiveScope === 'BOTH';
  const canShots = canOffense;
  const hasScope = state.sessionId ? effectiveScope !== null : false;
  const actionsDisabled = !state.selectedPlayer || !hasScope;

  const getCurrentClockMs = useCallback(
    (atMs: number) => {
      if (state.clock.status === 'RUNNING' && state.clock.runningSinceMs !== null) {
        return state.clock.elapsedMs + Math.max(0, atMs - state.clock.runningSinceMs);
      }
      return state.clock.elapsedMs;
    },
    [state.clock]
  );

  const requestWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLockRef.current = await (navigator as Navigator & {
        wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> };
      }).wakeLock?.request('screen');
    } catch {
      // Ignore wake lock errors.
    }
  }, []);

  const triggerHaptic = () => {
    if (navigator.vibrate) {
      navigator.vibrate(10);
    }
  };

  const logEventToDb = useCallback(
    async (event: GameEvent) => {
      const gameId = sessionInfo?.gameId ?? state.gameId;
      if (!supabase || !state.sessionId || !user || !gameId) return;
      await supabase.from('events').insert({
        id: event.id,
        session_id: state.sessionId,
        game_id: gameId,
        created_by: user.id,
        event_type: event.eventType,
        team: event.team,
        player_id: event.playerNumber,
        quarter: event.quarter,
        context: event.context,
        clock_ms: event.gameClockMs,
        occurred_at: event.createdAt,
        payload: {
          shot: event.shot ?? null,
          notes: event.notes ?? null
        }
      });
    },
    [sessionInfo?.gameId, state.gameId, state.sessionId, user]
  );

  const logEvent = (payload: {
    eventType: EventType;
    playerNumber: string;
    team: Team;
    quarter: Quarter;
    context: Context;
    shot?: { zone: ShotZone; outcome: ShotOutcome; situation: Context };
  }, eventScope: SessionScope) => {
    const wallClockMs = Date.now();
    const gameClockMs = getCurrentClockMs(wallClockMs);
    const event = {
      id: createEventId(),
      gameId: sessionInfo?.gameId ?? state.gameId,
      createdAt: new Date().toISOString(),
      period: state.quarter,
      gameClockMs,
      wallClockMs,
      displayTime: `${periodLabel} ${formatClock(gameClockMs)}`,
      createdBy: user?.id,
      eventScope,
      ...payload,
    };
    dispatch({ type: 'ADD_EVENT', event });
    void logEventToDb(event);
    return event;
  };

  const handleGoal = () => {
    if (!state.selectedPlayer || !canOffense) return;
    triggerHaptic();
    requestWakeLock();
    const event = logEvent({
      eventType: EventType.SHOT_GOAL,
      playerNumber: state.selectedPlayer,
      team: state.selectedTeam,
      quarter: state.quarter,
      context: state.context,
    }, 'OFFENSE');
    setAssistContext({
      team: state.selectedTeam,
      quarter: state.quarter,
      context: state.context,
      goalId: event.id,
    });
    setAssistPicking(false);
    setLastAssistPair(null);
    setTurnoverPickerOpen(false);
    setShotModalOpen(false);
  };

  const handleTurnover = (eventType: EventType.TO_BAD_PASS | EventType.TO_STOLEN_FROM) => {
    if (!state.selectedPlayer || !canOffense) return;
    triggerHaptic();
    requestWakeLock();
    logEvent({
      eventType,
      playerNumber: state.selectedPlayer,
      team: state.selectedTeam,
      quarter: state.quarter,
      context: state.context,
    }, 'OFFENSE');
    setTurnoverPickerOpen(false);
    setMoreOpen(false);
  };

  const handleDefenseEvent = (eventType: EventType) => {
    if (!state.selectedPlayer || !canDefense) return;
    triggerHaptic();
    requestWakeLock();
    logEvent({
      eventType,
      playerNumber: state.selectedPlayer,
      team: state.selectedTeam,
      quarter: state.quarter,
      context: state.context,
    }, 'DEFENSE');
    setTurnoverPickerOpen(false);
    setShotModalOpen(false);
    setMoreOpen(false);
  };

  const handleShotSave = (zone: ShotZone, outcome: ShotOutcome) => {
    if (!state.selectedPlayer || !canShots) return;
    triggerHaptic();
    requestWakeLock();
    const event = logEvent({
      eventType: shotOutcomeToEvent[outcome],
      playerNumber: state.selectedPlayer,
      team: state.selectedTeam,
      quarter: state.quarter,
      context: state.context,
      shot: {
        zone,
        outcome,
        situation: state.context,
      },
    }, 'OFFENSE');
    lastShotZoneRef.current = { zone, timestamp: Date.now() };
    setShotModalOpen(false);
    setTurnoverPickerOpen(false);
    if (outcome === ShotOutcome.GOAL && canOffense) {
      setAssistContext({
        team: state.selectedTeam,
        quarter: state.quarter,
        context: state.context,
        goalId: event.id,
      });
      setAssistPicking(false);
      setLastAssistPair(null);
    }
  };

  const handleAssistSelection = (player: string) => {
    if (!assistContext || !canOffense) return;
    triggerHaptic();
    requestWakeLock();
    const event = logEvent({
      eventType: EventType.ASSIST,
      playerNumber: player,
      team: assistContext.team,
      quarter: assistContext.quarter,
      context: assistContext.context,
    }, 'OFFENSE');
    setLastAssistPair({ assistId: event.id, goalId: assistContext.goalId });
    setAssistContext(null);
    setAssistPicking(false);
  };

  const handlePlayerClick = (player: string) => {
    requestWakeLock();
    dispatch({ type: 'SET_PLAYER', player });
    if (assistPicking && assistContext) {
      handleAssistSelection(player);
    }
  };

  const handleUndo = async () => {
    if (state.events.length === 0) return;
    if (assistContext) {
      setAssistContext(null);
      setAssistPicking(false);
    }
    if (turnoverPickerOpen) {
      setTurnoverPickerOpen(false);
    }
    if (shotModalOpen) {
      setShotModalOpen(false);
    }
    const lastEvent = state.events[state.events.length - 1];

    if (state.sessionId && supabase && user) {
      const lastOwnedEvent = [...state.events].reverse().find((event) => event.createdBy === user.id);
      if (!lastOwnedEvent) return;
      const targetIds: string[] = [];
      if (lastAssistPair && lastOwnedEvent.id === lastAssistPair.assistId) {
        const priorEvent = state.events.find((event) => event.id === lastAssistPair.goalId);
        if (priorEvent) {
          targetIds.push(lastAssistPair.assistId, lastAssistPair.goalId);
        }
      }
      if (targetIds.length === 0) {
        targetIds.push(lastOwnedEvent.id);
      }
      let deletedAny = false;
      for (const id of targetIds) {
        const { error } = await supabase.from('events').delete().eq('id', id);
        if (!error) {
          dispatch({ type: 'DELETE_EVENT', id });
          deletedAny = true;
        }
      }
      if (deletedAny) {
        setLastAssistPair(null);
      }
      return;
    }

    if (lastAssistPair && lastEvent.id === lastAssistPair.assistId) {
      const priorEvent = state.events[state.events.length - 2];
      if (priorEvent && priorEvent.id === lastAssistPair.goalId) {
        dispatch({ type: 'UNDO' });
        dispatch({ type: 'UNDO' });
        setLastAssistPair(null);
        return;
      }
    }
    dispatch({ type: 'UNDO' });
  };

  useEffect(() => {
    if (!assistContext || assistPicking) return;
    const timer = window.setTimeout(() => {
      setAssistContext(null);
      setAssistPicking(false);
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [assistContext, assistPicking]);

  useEffect(() => {
    if (!opponentEditOpen) {
      setOpponentDraft(state.opponent);
    }
  }, [opponentEditOpen, state.opponent]);

  useEffect(() => {
    eventsRef.current = state.events;
  }, [state.events]);

  useEffect(() => {
    if (!sessionIdParam) return;
    if (state.sessionId !== sessionIdParam) {
      dispatch({ type: 'SET_SESSION', sessionId: sessionIdParam });
    }
  }, [dispatch, sessionIdParam, state.sessionId]);

  useEffect(() => {
    const supabaseClient = supabase;
    if (!supabaseClient || !state.sessionId) {
      setSessionInfo(null);
      return;
    }
    let active = true;
    const loadSession = async () => {
      const { data } = await supabaseClient
        .from('sessions')
        .select('id, game_id, role_scope, started_at, created_at, games(opponent_name, scheduled_at)')
        .eq('id', state.sessionId)
        .maybeSingle();
      if (!active) return;
      if (!data) {
        setSessionInfo(null);
        return;
      }
      const gameRecord = Array.isArray(data.games) ? data.games[0] : data.games;
      const opponent = gameRecord?.opponent_name ?? '';
      const startedAt = data.started_at ?? data.created_at ?? null;
      const gameId = data.game_id ?? null;
      const roleScope = (data.role_scope as SessionScope) ?? null;
      setSessionInfo({ opponent, startedAt, gameId, roleScope });
      const nextCreatedAt = startedAt ? Date.parse(startedAt) : Date.now();
      if (
        opponent !== state.opponent ||
        (gameId && gameId !== state.gameId) ||
        (nextCreatedAt && nextCreatedAt !== state.createdAt)
      ) {
        dispatch({
          type: 'SET_GAME_META',
          opponent,
          createdAt: nextCreatedAt,
          gameId: gameId ?? undefined,
        });
      }
    };
    void loadSession();
    return () => {
      active = false;
    };
  }, [dispatch, state.createdAt, state.gameId, state.opponent, state.sessionId]);

  useEffect(() => {
    const supabaseClient = supabase;
    if (!supabaseClient || !state.sessionId) return;
    let active = true;

    const mapDbEvent = (row: Record<string, any>): GameEvent => {
      const quarter = row.quarter as Quarter;
      const occurredAt = row.occurred_at ?? row.created_at;
      const wallClockMs = occurredAt ? Date.parse(occurredAt) : 0;
      const gameClockMs = row.clock_ms ?? 0;
      const periodLabel = quarter === 5 ? 'OT' : `Q${quarter}`;
      return {
        id: row.id,
        gameId: row.game_id ?? state.gameId ?? row.session_id,
        team: row.team as Team,
        playerNumber: row.player_id,
        quarter,
        context: row.context as Context,
        eventType: row.event_type as EventType,
        createdAt: occurredAt ?? new Date().toISOString(),
        period: quarter,
        gameClockMs,
        wallClockMs,
        displayTime: gameClockMs ? `${periodLabel} ${formatClock(gameClockMs)}` : periodLabel,
        shot: row.payload?.shot ?? undefined,
        notes: row.payload?.notes ?? undefined,
        createdBy: row.created_by ?? undefined,
      };
    };

    const sortEvents = (events: GameEvent[]) => {
      return [...events].sort((a, b) => {
        if (a.wallClockMs && b.wallClockMs) {
          return a.wallClockMs - b.wallClockMs;
        }
        return a.createdAt.localeCompare(b.createdAt);
      });
    };

    const mergeEvent = (incoming: GameEvent) => {
      const existing = eventsRef.current;
      if (existing.some((event) => event.id === incoming.id)) {
        return existing;
      }
      return sortEvents([...existing, incoming]);
    };

    const loadEvents = async () => {
      const { data, error } = await supabaseClient
        .from('events')
        .select('*')
        .eq('session_id', state.sessionId)
        .order('occurred_at', { ascending: true });
      if (!active || error) return;
      const mapped = (data ?? []).map(mapDbEvent);
      dispatch({ type: 'SET_EVENTS', events: mapped });
    };

    void loadEvents();

    const channel = supabaseClient.channel(`events:${state.sessionId}`);
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'events',
        filter: `session_id=eq.${state.sessionId}`,
      },
      (payload) => {
        if (!active) return;
        const incoming = mapDbEvent(payload.new as typeof payload.new);
        const merged = mergeEvent(incoming);
        dispatch({ type: 'SET_EVENTS', events: merged });
      }
    );
    channel.on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'events',
        filter: `session_id=eq.${state.sessionId}`,
      },
      (payload) => {
        if (!active) return;
        const deletedId = (payload.old as { id?: string }).id;
        if (!deletedId) return;
        const next = eventsRef.current.filter((event) => event.id !== deletedId);
        dispatch({ type: 'SET_EVENTS', events: next });
      }
    );
    channel.subscribe();

    return () => {
      active = false;
      channel.unsubscribe();
    };
  }, [dispatch, state.gameId, state.sessionId]);

  useEffect(() => {
    if (state.createdAt === 0) {
      dispatch({ type: 'START_GAME', opponent: state.opponent.trim(), now: Date.now() });
    }
  }, [dispatch, state.createdAt, state.opponent]);

  useEffect(() => {
    requestWakeLock();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      wakeLockRef.current?.release?.();
      wakeLockRef.current = null;
    };
  }, [requestWakeLock]);

  useEffect(() => {
    if (state.clock.status !== 'RUNNING') return;
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 250);
    return () => window.clearInterval(timer);
  }, [state.clock.status]);

  useEffect(() => {
    setNowMs(Date.now());
  }, [state.clock.status, state.clock.elapsedMs]);

  const initialShotZone =
    lastShotZoneRef.current && Date.now() - lastShotZoneRef.current.timestamp < 5000
      ? lastShotZoneRef.current.zone
      : null;

  const clockMs = useMemo(() => getCurrentClockMs(nowMs), [nowMs, getCurrentClockMs]);

  const handleClockStart = () => {
    dispatch({ type: 'CLOCK_START', now: Date.now() });
  };

  const handleClockPause = () => {
    dispatch({ type: 'CLOCK_PAUSE', now: Date.now() });
  };

  const handleClockResume = () => {
    dispatch({ type: 'CLOCK_RESUME', now: Date.now() });
  };

  const handleClockReset = () => {
    dispatch({ type: 'CLOCK_RESET' });
  };

  const primaryButtons = [
    canOffense
      ? {
          key: 'goal',
          label: 'Goal',
          onClick: handleGoal,
          disabled: actionsDisabled,
        }
      : null,
    canShots
      ? {
          key: 'shot',
          label: 'Shot',
          onClick: () => {
            if (actionsDisabled) return;
            setShotModalOpen(true);
            setTurnoverPickerOpen(false);
          },
          disabled: actionsDisabled,
        }
      : null,
    canOffense
      ? {
          key: 'assist',
          label: 'Assist',
          disabled: true,
        }
      : null,
    canOffense
      ? {
          key: 'turnover',
          label: 'Turnover',
          onClick: () => {
            if (actionsDisabled) return;
            setTurnoverPickerOpen((prev) => !prev);
          },
          disabled: actionsDisabled,
          selected: turnoverPickerOpen,
        }
      : null,
    {
      key: 'more',
      label: 'More',
      onClick: () => {
        if (actionsDisabled) return;
        setMoreOpen(true);
      },
      disabled: actionsDisabled,
    },
  ].filter(Boolean) as {
    key: string;
    label: string;
    onClick?: () => void;
    disabled?: boolean;
    selected?: boolean;
  }[];

  if (authLoading) {
    return (
      <div className="flex w-full flex-1 items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex w-full flex-1 items-center justify-center text-slate-500">
        Redirecting to login…
      </div>
    );
  }

  if (!sessionIdParam && !state.sessionId) {
    return (
      <div className="flex w-full flex-1 items-center justify-center text-slate-500">
        Select a game from Home to start tracking.
      </div>
    );
  }

  return (
    <div
      className={`flex w-full flex-1 flex-col gap-5 pb-28 md:pb-6 ${
        isLiveMode ? 'portrait:h-[100dvh] portrait:overflow-hidden portrait:overscroll-none' : ''
      } sm:portrait:h-auto sm:portrait:overflow-visible sm:portrait:overscroll-auto`}
    >
      <section className="sticky top-16 z-10 hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:portrait:hidden sm:flex">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="flex flex-col justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Game
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold text-slate-900">{sessionDisplay}</span>
              <button
                type="button"
                className="min-h-[36px] rounded-lg border border-slate-200 px-2 text-xs font-semibold text-slate-600"
                onClick={() => setOpponentEditOpen(true)}
              >
                Edit
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Quarter
            </span>
            <div className="grid grid-cols-5 gap-2">
              {quarterOptions.map((option) => (
                <ActionButton
                  key={option.value}
                  label={option.label}
                  selected={state.quarter === option.value}
                  onClick={() => {
                    dispatch({ type: 'SET_QUARTER', quarter: option.value });
                    dispatch({ type: 'CLOCK_RESET' });
                  }}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Context
            </span>
            <div className="grid grid-cols-5 gap-2">
              {contextOptions.map((option) => (
                <ActionButton
                  key={option.value}
                  label={option.label}
                  selected={state.context === option.value}
                  onClick={() => dispatch({ type: 'SET_CONTEXT', context: option.value })}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Team
            </span>
            <div className="grid grid-cols-3 gap-2">
              {teamOptions.map((option) => (
                <ActionButton
                  key={option.value}
                  label={option.label}
                  selected={state.selectedTeam === option.value}
                  onClick={() => dispatch({ type: 'SET_TEAM', team: option.value })}
                />
              ))}
              <ActionButton label="Undo" tone="primary" onClick={handleUndo} />
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-baseline gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Game Clock
            </span>
            <span className="text-lg font-semibold text-slate-900">
              {periodLabel} {formatClock(clockMs)}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {state.clock.status === 'STOPPED' ? (
              <ActionButton label="Start" tone="primary" onClick={handleClockStart} />
            ) : null}
            {state.clock.status === 'RUNNING' ? (
              <ActionButton label="Pause" onClick={handleClockPause} />
            ) : null}
            {state.clock.status === 'PAUSED' ? (
              <ActionButton label="Resume" onClick={handleClockResume} />
            ) : null}
            <ActionButton label="Reset" onClick={handleClockReset} />
          </div>
        </div>
      </section>

      <section
        className={`sticky top-0 z-20 flex max-h-[64px] items-center justify-between gap-3 rounded-none border-b border-slate-200 bg-white/95 px-4 py-2 shadow-sm sm:hidden ${
          isLiveMode ? 'h-16' : ''
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">
            {periodLabel} {formatClock(clockMs)}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
            {periodLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
            {state.clock.status === 'RUNNING' ? (
              <button
                type="button"
                className="min-h-[44px] rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700"
                onClick={handleClockPause}
                aria-label="Pause"
              >
              ❚❚
            </button>
          ) : (
            <button
              type="button"
              className="min-h-[44px] rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700"
              onClick={state.clock.status === 'PAUSED' ? handleClockResume : handleClockStart}
              aria-label={state.clock.status === 'PAUSED' ? 'Resume' : 'Start'}
            >
              ▶
            </button>
          )}
          <button
            type="button"
            className="min-h-[44px] rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700"
            onClick={() => setMoreOpen(true)}
            aria-label="Game settings"
          >
            ⚙
          </button>
        </div>
      </section>

      <section className="flex flex-1 flex-col gap-4 pt-2 sm:pt-0">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-slate-900">Select Player</h2>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {lastEvent
              ? `Last event: ${lastEventLabel} #${lastEvent.playerNumber}`
              : 'Last event: none'}
          </span>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-7 md:overflow-visible md:pb-0">
          {playerOptions.map((player) => {
            const isSelected = state.selectedPlayer === player;
            return (
              <button
                key={player}
                type="button"
                aria-pressed={isSelected}
                className={`min-h-[64px] min-w-[64px] rounded-full border px-2 text-lg font-semibold md:min-h-[88px] md:min-w-0 md:rounded-2xl ${
                  isSelected
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
                onClick={() => handlePlayerClick(player)}
              >
                {player}
              </button>
            );
          })}
        </div>
      </section>

      {state.selectedPlayer ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {assistContext && canOffense ? (
            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-col gap-2">
                <div className="text-sm font-semibold text-slate-700">Add Assist?</div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <ActionButton
                      label="No Assist"
                      tone="primary"
                      onClick={() => {
                        setAssistContext(null);
                        setAssistPicking(false);
                      }}
                    />
                  </div>
                  <ActionButton
                    label={assistPicking ? 'Tap Player' : 'Select Player'}
                    onClick={() => setAssistPicking(true)}
                  />
                </div>
              </div>
              {assistPicking ? (
                <p className="mt-2 text-xs text-slate-500">Tap the assisting player from the grid.</p>
              ) : null}
            </div>
          ) : null}

          {turnoverPickerOpen ? (
            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Turnover Type
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className="min-h-[64px] rounded-xl border-2 border-amber-300 bg-amber-100 text-base font-semibold text-amber-900"
                  onClick={() => handleTurnover(EventType.TO_BAD_PASS)}
                >
                  Bad Pass
                </button>
                <button
                  type="button"
                  className="min-h-[64px] rounded-xl border-2 border-emerald-300 bg-emerald-100 text-base font-semibold text-emerald-900"
                  onClick={() => handleTurnover(EventType.TO_STOLEN_FROM)}
                >
                  Stolen From
                </button>
              </div>
            </div>
          ) : null}
          {state.sessionId && effectiveScope === null ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              No scope assigned for this session. Return to the game list to join with a scope.
            </div>
          ) : null}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            Actions appear in the bottom bar. Use “More” for defense and secondary actions.
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
          Select a player to show actions.
        </section>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 px-4 pb-[env(safe-area-inset-bottom)] pt-3 shadow-lg md:static md:mt-4 md:rounded-2xl md:border md:shadow-sm">
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, primaryButtons.length)}, 1fr)` }}
        >
          {primaryButtons.map((action) => (
            <ActionButton
              key={action.key}
              label={action.label}
              onClick={action.onClick}
              disabled={action.disabled}
              selected={action.selected}
              className={isLiveMode ? 'portrait:min-h-[64px] sm:portrait:min-h-[56px]' : ''}
            />
          ))}
        </div>
      </div>

      {moreOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 px-4 pb-4"
          role="dialog"
          aria-modal="true"
          aria-label="More actions"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl bg-white p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">Game Settings</div>
              <button
                type="button"
                className="min-h-[44px] rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600"
                onClick={() => setMoreOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Game
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold text-slate-900">{sessionDisplay}</span>
                  <button
                    type="button"
                    className="min-h-[36px] rounded-lg border border-slate-200 px-2 text-xs font-semibold text-slate-600"
                    onClick={() => setOpponentEditOpen(true)}
                  >
                    Edit
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Quarter
                </span>
                <div className="grid grid-cols-5 gap-2">
                  {quarterOptions.map((option) => (
                    <ActionButton
                      key={option.value}
                      label={option.label}
                      selected={state.quarter === option.value}
                      onClick={() => {
                        dispatch({ type: 'SET_QUARTER', quarter: option.value });
                        dispatch({ type: 'CLOCK_RESET' });
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Context
                </span>
                <div className="grid grid-cols-5 gap-2">
                  {contextOptions.map((option) => (
                    <ActionButton
                      key={option.value}
                      label={option.label}
                      selected={state.context === option.value}
                      onClick={() => dispatch({ type: 'SET_CONTEXT', context: option.value })}
                    />
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Team
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {teamOptions.map((option) => (
                    <ActionButton
                      key={option.value}
                      label={option.label}
                      selected={state.selectedTeam === option.value}
                      onClick={() => dispatch({ type: 'SET_TEAM', team: option.value })}
                    />
                  ))}
                  <ActionButton label="Undo" tone="primary" onClick={handleUndo} />
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-baseline gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Game Clock
                  </span>
                  <span className="text-lg font-semibold text-slate-900">
                    {periodLabel} {formatClock(clockMs)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {state.clock.status === 'STOPPED' ? (
                    <ActionButton label="Start" tone="primary" onClick={handleClockStart} />
                  ) : null}
                  {state.clock.status === 'RUNNING' ? (
                    <ActionButton label="Pause" onClick={handleClockPause} />
                  ) : null}
                  {state.clock.status === 'PAUSED' ? (
                    <ActionButton label="Resume" onClick={handleClockResume} />
                  ) : null}
                  <ActionButton label="Reset" onClick={handleClockReset} />
                </div>
              </div>
            </div>

            {canDefense ? (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                  Defense
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                  {defensiveActions.map((action) => (
                    <button
                      key={action.eventType}
                      type="button"
                      className="min-h-[64px] rounded-xl border-2 border-emerald-300 bg-white text-base font-semibold text-emerald-900"
                      onClick={() => handleDefenseEvent(action.eventType)}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {canOffense ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Secondary
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                  {secondaryActions.map((action) => (
                    <ActionButton key={action.label} label={action.label} disabled />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {opponentEditOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-label="Edit opponent"
          onClick={() => setOpponentEditOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="text-sm font-semibold text-slate-900">Edit Opponent</div>
            <label className="mt-3 block text-sm font-semibold text-slate-700">
              Opponent Name
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-base"
                value={opponentDraft}
                onChange={(event) => setOpponentDraft(event.target.value)}
                placeholder="Opponent"
              />
            </label>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="min-h-[44px] rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600"
                onClick={() => setOpponentEditOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="min-h-[44px] rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white"
                onClick={() => {
                  const opponent = opponentDraft.trim();
                  dispatch({
                    type: 'SET_OPPONENT',
                    opponent,
                  });
                  setOpponentEditOpen(false);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ShotModal
        open={shotModalOpen}
        initialZone={initialShotZone}
        onClose={() => setShotModalOpen(false)}
        onSave={handleShotSave}
      />
    </div>
  );
}

export default function LivePage() {
  return (
    <Suspense
      fallback={
        <div className="flex w-full flex-1 items-center justify-center text-slate-500">
          Loading…
        </div>
      }
    >
      <LivePageContent />
    </Suspense>
  );
}
