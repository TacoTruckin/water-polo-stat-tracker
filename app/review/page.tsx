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
  created_by: string | null;
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
  const [profileMap, setProfileMap] = useState<Record<string, { id: string; name: string | null; email: string | null }>>(
    {}
  );
  const [trackerFilter, setTrackerFilter] = useState('all');
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
        .select('id, event_type, team, player_id, quarter, context, clock_ms, occurred_at, payload, created_by')
        .eq('session_id', sessionId)
        .order('occurred_at', { ascending: false });
      if (!active) return;
      if (error) {
        setError(error.message);
        setLoadingEvents(false);
        return;
      }
      const rows = (data ?? []) as EventRow[];
      setEvents(rows);
      if (profile?.role === 'super_admin') {
        const ids = Array.from(
          new Set(rows.map((row) => row.created_by).filter((value): value is string => Boolean(value)))
        );
        if (ids.length > 0) {
          const { data: profilesData } = await supabaseClient
            .from('user_profiles')
            .select('id, name, email')
            .in('id', ids);
          if (profilesData) {
            const nextMap: Record<string, { id: string; name: string | null; email: string | null }> = {};
            profilesData.forEach((profileRow) => {
              nextMap[profileRow.id] = {
                id: profileRow.id,
                name: profileRow.name ?? null,
                email: profileRow.email ?? null
              };
            });
            setProfileMap(nextMap);
          }
        } else {
          setProfileMap({});
        }
      } else {
        setProfileMap({});
      }
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
  }, [canUseSupabase, profile?.role, sessionId]);

  useEffect(() => {
    if (profile?.role !== 'super_admin') {
      setTrackerFilter('all');
    }
  }, [profile?.role]);

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

  const trackerLabel = (userId: string | null, isAdminView: boolean) => {
    if (!userId) return 'Unknown';
    if (user?.id && userId === user.id) return 'You';
    if (!isAdminView) return 'Tracker';
    const profileRow = profileMap[userId];
    if (profileRow?.name) return profileRow.name;
    if (profileRow?.email) return profileRow.email;
    return `${userId.slice(0, 6)}…`;
  };

  const trackerOptions = useMemo(() => {
    const ids = Array.from(
      new Set(events.map((event) => event.created_by).filter((value): value is string => Boolean(value)))
    );
    if (profile?.role !== 'super_admin') {
      return user?.id ? [{ id: user.id, label: 'You' }] : [];
    }
    return ids.map((id) => ({ id, label: trackerLabel(id, true) }));
  }, [events, profile?.role, profileMap, user?.id]);

  const filteredEvents = useMemo(() => {
    if (trackerFilter === 'all') return events;
    return events.filter((event) => event.created_by === trackerFilter);
  }, [events, trackerFilter]);

  const duplicateEventIds = useMemo(() => {
    const windowMs = 5000;
    const byKey = new Map<string, EventRow[]>();
    events.forEach((event) => {
      const key = [
        event.event_type,
        event.team,
        event.player_id,
        event.context,
        event.quarter
      ].join('|');
      const list = byKey.get(key) ?? [];
      list.push(event);
      byKey.set(key, list);
    });
    const toMs = (event: EventRow) => {
      const parsed = Date.parse(event.occurred_at);
      return Number.isNaN(parsed) ? 0 : parsed;
    };
    const duplicates = new Set<string>();
    byKey.forEach((list) => {
      const sorted = [...list].sort((a, b) => toMs(a) - toMs(b));
      for (let i = 0; i < sorted.length; i += 1) {
        for (let j = i + 1; j < sorted.length; j += 1) {
          const delta = toMs(sorted[j]) - toMs(sorted[i]);
          if (delta > windowMs) break;
          const a = sorted[i];
          const b = sorted[j];
          if (!a.created_by || !b.created_by || a.created_by !== b.created_by) {
            duplicates.add(a.id);
            duplicates.add(b.id);
          }
        }
      }
    });
    return duplicates;
  }, [events]);

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
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <span className="font-semibold">Filter:</span>
        <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Tracker</label>
        <select
          className="min-h-[36px] rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700"
          value={trackerFilter}
          onChange={(event) => setTrackerFilter(event.target.value)}
        >
          <option value="all">All trackers</option>
          {trackerOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500">Potential duplicates are marked.</span>
      </div>
      {loadingEvents ? (
        <p className="text-slate-600">Loading events…</p>
      ) : filteredEvents.length === 0 ? (
        <p className="text-slate-600">No events logged yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[140px_1fr_110px_110px_110px_160px] gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              <div>Time</div>
              <div>Event</div>
              <div>Team</div>
              <div>Player</div>
              <div>Context</div>
              <div>Logged by</div>
            </div>
            <div className="divide-y divide-slate-200">
              {filteredEvents.map((event) => {
                const periodLabel = event.quarter === 5 ? 'OT' : `Q${event.quarter}`;
                const timeLabel = event.clock_ms
                  ? `${periodLabel} ${formatClock(event.clock_ms)}`
                  : periodLabel;
                const shotLabel = event.payload?.shot
                  ? ` (${event.payload.shot.zone} ${event.payload.shot.outcome})`
                  : '';
                const contextValue = event.context ?? 'EVEN';
                const isDuplicate = duplicateEventIds.has(event.id);
                return (
                  <div
                    key={event.id}
                    className={`grid grid-cols-[140px_1fr_110px_110px_110px_160px] items-center gap-2 px-4 py-3 text-sm text-slate-700 ${
                      isDuplicate ? 'bg-amber-50' : ''
                    }`}
                  >
                    <div className="font-semibold text-slate-900">{timeLabel}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{event.event_type}</span>
                      {isDuplicate ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          Potential duplicate
                        </span>
                      ) : null}
                      {shotLabel ? (
                        <span className="text-xs text-slate-500">{shotLabel}</span>
                      ) : null}
                    </div>
                    <div>{event.team}</div>
                    <div>#{event.player_id}</div>
                    <div className="text-xs font-semibold text-slate-600">{contextValue}</div>
                    <div className="text-xs font-semibold text-slate-600">
                      {trackerLabel(event.created_by, profile?.role === 'super_admin')}
                    </div>
                  </div>
                );
              })}
            </div>
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
