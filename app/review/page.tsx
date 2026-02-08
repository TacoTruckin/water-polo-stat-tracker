'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useRequireAuth } from '@/lib/useRequireAuth';
import { useProfile } from '@/lib/useProfile';
import { useGame } from '@/lib/store';
import type { Context, EventType, Quarter, SessionScope, Team } from '@/lib/types';

type SessionRow = {
  id: string;
  game_id: string;
  role_scope: SessionScope;
  started_at: string | null;
  created_at: string;
  games?: {
    opponent_name: string;
    scheduled_at: string;
  } | null;
};

type EventRow = {
  id: string;
  event_type: EventType;
  team: Team;
  player_id: string;
  quarter: Quarter;
  context: Context;
  clock_ms: number | null;
  occurred_at: string;
  payload?: { shot?: { zone: string; outcome: string } } | null;
};

function ReviewPageContent() {
  const { user, loading: authLoading, supabaseReady } = useRequireAuth('/login');
  const { profile, loading: profileLoading } = useProfile(user);
  const searchParams = useSearchParams();
  const { dispatch } = useGame();
  const sessionId = searchParams.get('sessionId');

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [sessionInfo, setSessionInfo] = useState<{ opponent: string; startedAt: string | null } | null>(
    null
  );
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canUseSupabase = supabase !== null && supabaseReady;

  const formatClock = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  useEffect(() => {
    if (!canUseSupabase || !user) {
      setSessions([]);
      return;
    }
    const loadSessions = async () => {
      const supabaseClient = supabase;
      if (!supabaseClient) return;
      setLoadingSessions(true);
      setError(null);
      let query = supabaseClient
        .from('sessions')
        .select('id, game_id, role_scope, started_at, created_at, games(opponent_name, scheduled_at)')
        .order('created_at', { ascending: false });
      if (profile?.role !== 'super_admin') {
        query = query.eq('created_by', user.id);
      }
      const { data, error } = await query;
      if (error) {
        setError(error.message);
        setLoadingSessions(false);
        return;
      }
      const mapped = (data ?? []).map((row) => {
        const game = Array.isArray(row.games) ? row.games[0] ?? null : row.games ?? null;
        return { ...row, games: game } as SessionRow;
      });
      setSessions(mapped);
      setLoadingSessions(false);
    };
    void loadSessions();
  }, [canUseSupabase, profile?.role, user]);

  useEffect(() => {
    if (!canUseSupabase || !sessionId) {
      setEvents([]);
      setSessionInfo(null);
      return;
    }
    let active = true;
    const loadSession = async () => {
      const supabaseClient = supabase;
      if (!supabaseClient) return;
      const { data } = await supabaseClient
        .from('sessions')
        .select('id, started_at, created_at, games(opponent_name)')
        .eq('id', sessionId)
        .maybeSingle();
      if (!active) return;
      if (!data) {
        setSessionInfo(null);
        return;
      }
      const game = Array.isArray(data.games) ? data.games[0] ?? null : data.games ?? null;
      const opponent = game?.opponent_name ?? '';
      const startedAt = data.started_at ?? data.created_at ?? null;
      setSessionInfo({ opponent, startedAt });
      if (opponent) {
        dispatch({
          type: 'SET_GAME_META',
          opponent,
          createdAt: startedAt ? Date.parse(startedAt) : Date.now()
        });
      }
    };
    void loadSession();
    return () => {
      active = false;
    };
  }, [canUseSupabase, dispatch, sessionId]);

  useEffect(() => {
    if (!canUseSupabase || !sessionId) return;
    let active = true;
    const loadEvents = async () => {
      const supabaseClient = supabase;
      if (!supabaseClient) return;
      setLoadingEvents(true);
      setError(null);
      const { data, error } = await supabaseClient
        .from('events')
        .select('id, event_type, team, player_id, quarter, context, clock_ms, occurred_at, payload')
        .eq('session_id', sessionId)
        .order('occurred_at', { ascending: false });
      if (!active) return;
      if (error) {
        setError(error.message);
        setLoadingEvents(false);
        return;
      }
      setEvents((data ?? []) as EventRow[]);
      setLoadingEvents(false);
    };
    void loadEvents();

    const supabaseClient = supabase;
    if (!supabaseClient) return () => undefined;
    const channel = supabaseClient.channel(`review-events:${sessionId}`);
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'events', filter: `session_id=eq.${sessionId}` },
      () => {
        void loadEvents();
      }
    );
    channel.on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'events', filter: `session_id=eq.${sessionId}` },
      () => {
        void loadEvents();
      }
    );
    channel.subscribe();

    return () => {
      active = false;
      channel.unsubscribe();
    };
  }, [canUseSupabase, sessionId]);

  const formattedSessionTime = useMemo(() => {
    if (!sessionInfo?.startedAt) return '';
    const date = new Date(sessionInfo.startedAt);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }, [sessionInfo?.startedAt]);

  if (!canUseSupabase) {
    return (
      <div className="flex w-full flex-1 flex-col gap-4">
        <h2 className="text-xl font-semibold text-slate-900">Review</h2>
        <p className="text-slate-600">Supabase is not configured for this deployment.</p>
      </div>
    );
  }

  if (authLoading || profileLoading) {
    return (
      <div className="flex w-full flex-1 items-center justify-center text-slate-500">Loading…</div>
    );
  }

  if (!sessionId) {
    return (
      <div className="flex w-full flex-1 flex-col gap-4">
        <h2 className="text-xl font-semibold text-slate-900">Review Sessions</h2>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {loadingSessions ? (
          <p className="text-slate-600">Loading sessions…</p>
        ) : sessions.length === 0 ? (
          <p className="text-slate-600">No sessions yet.</p>
        ) : (
          <div className="grid gap-3">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div>
                  <div className="text-base font-semibold text-slate-900">
                    vs {session.games?.opponent_name ?? 'Opponent'}
                  </div>
                  <div className="text-sm text-slate-600">{session.role_scope}</div>
                </div>
                <Link
                  href={`/review?sessionId=${session.id}`}
                  className="min-h-[44px] rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700"
                >
                  View
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-1 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-slate-900">Review</h2>
        <span className="text-sm font-semibold text-slate-600">
          vs {sessionInfo?.opponent || '(Unknown)'}
        </span>
        {formattedSessionTime ? (
          <span className="text-xs text-slate-500">Session started {formattedSessionTime}</span>
        ) : null}
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loadingEvents ? (
        <p className="text-slate-600">Loading events…</p>
      ) : events.length === 0 ? (
        <p className="text-slate-600">No events logged yet.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="grid grid-cols-[140px_1fr_120px_120px] gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            <div>Time</div>
            <div>Event</div>
            <div>Team</div>
            <div>Player</div>
          </div>
          <div className="divide-y divide-slate-200">
            {events.map((event) => {
              const periodLabel = event.quarter === 5 ? 'OT' : `Q${event.quarter}`;
              const timeLabel = event.clock_ms
                ? `${periodLabel} ${formatClock(event.clock_ms)}`
                : periodLabel;
              const shotLabel = event.payload?.shot
                ? ` (${event.payload.shot.zone} ${event.payload.shot.outcome})`
                : '';
              return (
                <div
                  key={event.id}
                  className="grid grid-cols-[140px_1fr_120px_120px] items-center gap-2 px-4 py-3 text-sm text-slate-700"
                >
                  <div className="font-semibold text-slate-900">{timeLabel}</div>
                  <div>
                    {event.event_type}
                    {shotLabel}
                  </div>
                  <div>{event.team}</div>
                  <div>#{event.player_id}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense>
      <ReviewPageContent />
    </Suspense>
  );
}
