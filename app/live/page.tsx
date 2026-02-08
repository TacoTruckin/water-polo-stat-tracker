'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useGame } from '@/lib/store';
import type { Context, GameEvent, Quarter, SessionScope, ShotZone, Team } from '@/lib/types';
import { EventType, ShotOutcome } from '@/lib/types';
import { ShotModal } from '@/components/ShotModal';
import { supabase } from '@/lib/supabaseClient';
import { useProfile } from '@/lib/useProfile';
import { useRequireAuth } from '@/lib/useRequireAuth';

const quarterOptions: { value: Quarter; label: string }[] = [
  { value: 1, label: 'Q1' },
  { value: 2, label: 'Q2' },
  { value: 3, label: 'Q3' },
  { value: 4, label: 'Q4' },
  { value: 5, label: 'OT' }
];

const contextOptions: { value: Context; label: string }[] = [
  { value: 'MAN_UP', label: 'Man-Up' },
  { value: 'MAN_DOWN', label: 'Man-Down' },
  { value: 'FIVE_M', label: '5M' }
];

const shotOutcomeToEvent: Record<ShotOutcome, EventType> = {
  [ShotOutcome.GOAL]: EventType.SHOT_GOAL,
  [ShotOutcome.SAVED]: EventType.SHOT_SAVED,
  [ShotOutcome.BLOCKED]: EventType.SHOT_BLOCKED,
  [ShotOutcome.WIDE]: EventType.SHOT_WIDE
};

const defensiveActions: { label: string; eventType: EventType }[] = [
  { label: 'Steal', eventType: EventType.STEAL },
  { label: 'Block', eventType: EventType.BLOCK },
  { label: 'Tip', eventType: EventType.TIP },
  { label: 'Def Exclusion', eventType: EventType.DEF_EXCLUSION_DRAWN }
];

function ActionButton({
  label,
  tone = 'neutral',
  selected = false,
  disabled = false,
  subLabel,
  className = '',
  onClick
}: {
  label: string;
  tone?: 'neutral' | 'primary';
  selected?: boolean;
  disabled?: boolean;
  subLabel?: string;
  className?: string;
  onClick?: () => void;
}) {
  const base =
    'flex min-h-[56px] w-full flex-col items-center justify-center rounded-xl border px-3 text-sm font-semibold leading-tight md:text-base';
  const toneStyles =
    tone === 'primary'
      ? disabled
        ? 'border-slate-400 bg-slate-200 text-slate-500'
        : 'border-slate-900 bg-slate-900 text-white'
      : disabled
        ? 'border-slate-300 bg-slate-100 text-slate-400'
        : 'border-slate-300 bg-white text-slate-700';
  const selectedStyles = selected ? 'ring-2 ring-slate-900' : '';
  const disabledStyles = disabled ? 'cursor-not-allowed' : '';

  return (
    <button
      className={`${base} ${toneStyles} ${selectedStyles} ${disabledStyles} ${className}`}
      onClick={onClick}
      type="button"
      aria-pressed={selected}
      disabled={disabled}
    >
      <span>{label}</span>
      {subLabel ? (
        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          {subLabel}
        </span>
      ) : null}
    </button>
  );
}

function LivePageContent() {
  const { state, dispatch } = useGame();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useRequireAuth('/login');
  const { profile } = useProfile(user);

  const [sessionInfo, setSessionInfo] = useState<{
    opponent: string;
    startedAt: string | null;
    gameId: string | null;
    roleScope: SessionScope | null;
  } | null>(null);
  const [turnoverPickerOpen, setTurnoverPickerOpen] = useState(false);
  const [shotModalOpen, setShotModalOpen] = useState(false);
  const [lastShotZone, setLastShotZone] = useState<ShotZone | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const contextTimerRef = useRef<number | null>(null);
  const [undoUsed, setUndoUsed] = useState(false);
  const eventsRef = useRef(state.events);

  const sessionIdParam = searchParams.get('sessionId');

  const playerOptions = state.roster.us;
  const playerNames = state.roster.names ?? {};

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

  const periodLabel = state.quarter === 5 ? 'OT' : `Q${state.quarter}`;

  const sessionScope = sessionInfo?.roleScope ?? null;
  const effectiveScope: SessionScope | null =
    profile?.role === 'super_admin' ? 'BOTH' : sessionScope;
  const canOffense = effectiveScope === 'OFFENSE' || effectiveScope === 'BOTH';
  const canDefense = effectiveScope === 'DEFENSE' || effectiveScope === 'BOTH';
  const canShots = canOffense;
  const hasScope = state.sessionId ? effectiveScope !== null : false;
  const actionsDisabled = !state.selectedPlayer || !hasScope;
  const lastOwnedEvent = useMemo(() => {
    if (!state.sessionId || !user) return null;
    for (let i = state.events.length - 1; i >= 0; i -= 1) {
      const event = state.events[i];
      if (event.createdBy === user.id) return event;
    }
    return null;
  }, [state.events, state.sessionId, user]);
  const canUndo = state.sessionId ? Boolean(lastOwnedEvent) : state.events.length > 0;

  const getCurrentClockMs = useCallback(
    (atMs: number) => {
      if (state.clock.status === 'RUNNING' && state.clock.runningSinceMs !== null) {
        return state.clock.elapsedMs + Math.max(0, atMs - state.clock.runningSinceMs);
      }
      return state.clock.elapsedMs;
    },
    [state.clock]
  );

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

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 1200);
  }, []);

  const logEvent = useCallback(
    (
      payload: {
        eventType: EventType;
        playerNumber: string;
        team: Team;
        quarter: Quarter;
        context: Context;
        shot?: { zone: ShotZone; outcome: ShotOutcome; situation: Context };
      },
      eventScope: SessionScope
    ) => {
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
        ...payload
      };
      dispatch({ type: 'ADD_EVENT', event });
      void logEventToDb(event);
      showToast('Saved!');
      setUndoUsed(false);
      if (
        state.context === 'MAN_UP' ||
        state.context === 'MAN_DOWN' ||
        state.context === 'COUNTER'
      ) {
        dispatch({ type: 'SET_CONTEXT', context: 'EVEN' });
      }
      return event;
    },
    [
      dispatch,
      getCurrentClockMs,
      logEventToDb,
      periodLabel,
      sessionInfo?.gameId,
      showToast,
      state.gameId,
      state.context,
      state.quarter,
      user?.id
    ]
  );

  const handleAssist = () => {
    if (!state.selectedPlayer || !canOffense) return;
    logEvent(
      {
        eventType: EventType.ASSIST,
        playerNumber: state.selectedPlayer,
        team: 'US',
        quarter: state.quarter,
        context: state.context
      },
      'OFFENSE'
    );
  };

  const handleTurnover = (eventType: EventType.TO_BAD_PASS | EventType.TO_STOLEN_FROM) => {
    if (!state.selectedPlayer || !canOffense) return;
    logEvent(
      {
        eventType,
        playerNumber: state.selectedPlayer,
        team: 'US',
        quarter: state.quarter,
        context: state.context
      },
      'OFFENSE'
    );
    setTurnoverPickerOpen(false);
  };

  const handleDefenseEvent = (eventType: EventType) => {
    if (!state.selectedPlayer || !canDefense) return;
    logEvent(
      {
        eventType,
        playerNumber: state.selectedPlayer,
        team: 'US',
        quarter: state.quarter,
        context: state.context
      },
      'DEFENSE'
    );
  };

  const handleShotSave = (zone: ShotZone, outcome: ShotOutcome) => {
    if (!state.selectedPlayer || !canShots) return;
    setLastShotZone(zone);
    logEvent(
      {
        eventType: shotOutcomeToEvent[outcome],
        playerNumber: state.selectedPlayer,
        team: 'US',
        quarter: state.quarter,
        context: state.context,
        shot: { zone, outcome, situation: state.context }
      },
      'OFFENSE'
    );
    if (state.context === 'FIVE_M') {
      dispatch({ type: 'SET_CONTEXT', context: 'EVEN' });
    }
    setShotModalOpen(false);
  };

  const handleUndo = async () => {
    if (!canUndo || undoUsed) return;
    if (state.sessionId && supabase && user) {
      const lastOwned = lastOwnedEvent;
      if (!lastOwned) return;
      const { error } = await supabase.from('events').delete().eq('id', lastOwned.id);
      if (!error) {
        dispatch({ type: 'DELETE_EVENT', id: lastOwned.id });
        setUndoUsed(true);
      }
      return;
    }
    dispatch({ type: 'UNDO' });
    setUndoUsed(true);
  };

  useEffect(() => {
    eventsRef.current = state.events;
  }, [state.events]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!sessionIdParam) return;
    if (state.sessionId !== sessionIdParam) {
      dispatch({ type: 'SET_SESSION', sessionId: sessionIdParam });
    }
  }, [dispatch, sessionIdParam, state.sessionId]);

  useEffect(() => {
    if (state.selectedTeam !== 'US') {
      dispatch({ type: 'SET_TEAM', team: 'US' });
    }
  }, [dispatch, state.selectedTeam]);

  useEffect(() => {
    if (contextTimerRef.current) {
      window.clearTimeout(contextTimerRef.current);
      contextTimerRef.current = null;
    }
    if (state.context === 'MAN_UP' || state.context === 'MAN_DOWN') {
      contextTimerRef.current = window.setTimeout(() => {
        dispatch({ type: 'SET_CONTEXT', context: 'EVEN' });
      }, 30000);
    }
    return () => {
      if (contextTimerRef.current) {
        window.clearTimeout(contextTimerRef.current);
        contextTimerRef.current = null;
      }
    };
  }, [dispatch, state.context]);

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
      dispatch({
        type: 'SET_GAME_META',
        opponent,
        createdAt: nextCreatedAt,
        gameId: gameId ?? undefined
      });
    };
    void loadSession();
    return () => {
      active = false;
    };
  }, [dispatch, state.sessionId]);

  useEffect(() => {
    const supabaseClient = supabase;
    if (!supabaseClient || !state.sessionId) return;
    let active = true;

    const mapDbEvent = (row: Record<string, any>): GameEvent => {
      const quarter = row.quarter as Quarter;
      const occurredAt = row.occurred_at ?? row.created_at;
      const wallClockMs = occurredAt ? Date.parse(occurredAt) : 0;
      const gameClockMs = row.clock_ms ?? 0;
      const periodLabelLocal = quarter === 5 ? 'OT' : `Q${quarter}`;
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
        displayTime: gameClockMs ? `${periodLabelLocal} ${formatClock(gameClockMs)}` : periodLabelLocal,
        shot: row.payload?.shot ?? undefined,
        notes: row.payload?.notes ?? undefined,
        createdBy: row.created_by ?? undefined
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
      { event: 'INSERT', schema: 'public', table: 'events', filter: `session_id=eq.${state.sessionId}` },
      (payload) => {
        if (!active) return;
        const incoming = mapDbEvent(payload.new as typeof payload.new);
        const merged = mergeEvent(incoming);
        dispatch({ type: 'SET_EVENTS', events: merged });
      }
    );
    channel.on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'events', filter: `session_id=eq.${state.sessionId}` },
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

  const sessionTimeLabel = sessionInfo?.startedAt
    ? new Date(sessionInfo.startedAt).toLocaleString()
    : state.createdAt
      ? new Date(state.createdAt).toLocaleString()
      : '';
  const lastEvent = state.events[state.events.length - 1];
  const lastEventLabel = lastEvent
    ? `${lastEvent.displayTime} • ${lastEvent.eventType} • ${lastEvent.context} #${lastEvent.playerNumber}`
    : 'No events yet';
  const needsPlayer = !state.selectedPlayer;
  const undoDisabled = !canUndo || undoUsed;

  if (authLoading) {
    return (
      <div className="flex w-full flex-1 items-center justify-center text-slate-500">Loading…</div>
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
    <div className="flex w-full flex-1 flex-col gap-5 pb-10">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Live
            </div>
            {sessionTimeLabel ? (
              <div className="text-xs text-slate-500">Session started {sessionTimeLabel}</div>
            ) : null}
          </div>
          <button
            type="button"
            className="min-h-[44px] rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleUndo}
            disabled={undoDisabled}
          >
            Undo
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-slate-600">Last event: {lastEventLabel}</span>
          {needsPlayer ? (
            <span className="text-amber-600">Select a player to enable actions</span>
          ) : null}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="flex flex-wrap gap-2">
            {quarterOptions.map((option) => (
              <ActionButton
                key={option.value}
                label={option.label}
                selected={state.quarter === option.value}
                onClick={() => dispatch({ type: 'SET_QUARTER', quarter: option.value })}
                className="!min-h-[44px] !w-auto px-3 text-xs"
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {contextOptions.map((option) => (
              <ActionButton
                key={option.value}
                label={option.label}
                selected={state.context === option.value}
                onClick={() => dispatch({ type: 'SET_CONTEXT', context: option.value })}
                className="!min-h-[44px] !w-auto px-3 text-xs"
              />
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Players</div>
        <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-7 md:grid-cols-10">
          {playerOptions.map((player) => (
            <ActionButton
              key={player}
              label={player}
              subLabel={playerNames[player]}
              selected={state.selectedPlayer === player}
              onClick={() => dispatch({ type: 'SET_PLAYER', player })}
              className="!min-h-[44px] text-sm"
            />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Offense
          </div>
          {!hasScope ? (
            <div className="text-xs text-amber-600">No scope assigned</div>
          ) : null}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
          <ActionButton
            label="Shot"
            tone="primary"
            disabled={actionsDisabled || !canShots}
            onClick={() => setShotModalOpen(true)}
          />
          <ActionButton
            label="Assist"
            disabled={actionsDisabled || !canOffense}
            onClick={handleAssist}
          />
          <ActionButton
            label="Turnover"
            disabled={actionsDisabled || !canOffense}
            selected={turnoverPickerOpen}
            onClick={() => setTurnoverPickerOpen((prev) => !prev)}
          />
        </div>
        {turnoverPickerOpen ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <ActionButton
              label="Bad Pass"
              disabled={actionsDisabled || !canOffense}
              onClick={() => handleTurnover(EventType.TO_BAD_PASS)}
            />
            <ActionButton
              label="Stolen From"
              disabled={actionsDisabled || !canOffense}
              onClick={() => handleTurnover(EventType.TO_STOLEN_FROM)}
            />
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Defense</div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          {defensiveActions.map((action) => (
            <ActionButton
              key={action.eventType}
              label={action.label}
              disabled={actionsDisabled || !canDefense}
              onClick={() => handleDefenseEvent(action.eventType)}
            />
          ))}
        </div>
      </section>

      <ShotModal
        open={shotModalOpen}
        onClose={() => setShotModalOpen(false)}
        onSelect={handleShotSave}
        initialZone={lastShotZone}
      />
      {toastMessage ? (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          {toastMessage}
        </div>
      ) : null}
    </div>
  );
}

export default function LivePage() {
  return (
    <Suspense>
      <LivePageContent />
    </Suspense>
  );
}
