'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useGame } from '@/lib/store';
import { supabase } from '@/lib/supabaseClient';
import { useProfile } from '@/lib/useProfile';
import { useRequireAuth } from '@/lib/useRequireAuth';

type Game = {
  id: string;
  opponent_name: string;
  scheduled_at: string;
  location: string | null;
};

type AdminNotification = {
  id: string;
  type: string;
  status: 'open' | 'completed';
  message: string;
  user_id: string | null;
  user_email: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
};

type Session = {
  id: string;
  game_id: string;
  role_scope: string;
  started_at: string | null;
  created_at: string;
  created_by: string;
};

export default function HomePage() {
  const router = useRouter();
  const { dispatch } = useGame();
  const { user, loading: authLoading, supabaseReady } = useRequireAuth('/login');
  const { profile, loading: profileLoading } = useProfile(user);

  const [games, setGames] = useState<Game[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [gamesError, setGamesError] = useState<string | null>(null);
  const [startingGameId, setStartingGameId] = useState<string | null>(null);

  const canUseSupabase = supabase !== null && supabaseReady;

  const loadData = useCallback(async () => {
    if (!supabase || !user) return;
    setGamesLoading(true);
    setGamesError(null);
    const [gamesRes, sessionsRes] = await Promise.all([
      supabase
        .from('games')
        .select('id, opponent_name, scheduled_at, location')
        .order('scheduled_at', { ascending: true }),
      supabase
        .from('sessions')
        .select('id, game_id, role_scope, started_at, created_at, created_by')
        .eq('created_by', user.id)
        .order('created_at', { ascending: true })
    ]);

    if (gamesRes.error) {
      setGamesError(gamesRes.error.message);
      setGamesLoading(false);
      return;
    }

    if (sessionsRes.error) {
      setGamesError(sessionsRes.error.message);
      setGamesLoading(false);
      return;
    }

    setGames((gamesRes.data ?? []) as Game[]);
    setSessions((sessionsRes.data ?? []) as Session[]);
    if (profile?.role === 'super_admin') {
      const { data: notificationsData } = await supabase
        .from('admin_notifications')
        .select('id, type, status, message, user_id, user_email, created_at, resolved_at, resolved_by')
        .eq('status', 'open')
        .order('created_at', { ascending: false });
      setNotifications((notificationsData ?? []) as AdminNotification[]);
    } else {
      setNotifications([]);
    }
    setGamesLoading(false);
  }, [profile?.role, user]);

  useEffect(() => {
    if (!canUseSupabase || !user) {
      setGames([]);
      setSessions([]);
      setNotifications([]);
      return;
    }
    void loadData();
  }, [canUseSupabase, loadData, user]);

  useEffect(() => {
    if (!canUseSupabase || !user || profile?.role !== 'super_admin') return;
    const supabaseClient = supabase;
    if (!supabaseClient) return;
    const channel = supabaseClient.channel('admin-notifications');
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'admin_notifications' },
      () => {
        void loadData();
      }
    );
    channel.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'admin_notifications' },
      () => {
        void loadData();
      }
    );
    channel.subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, [canUseSupabase, loadData, profile?.role, user]);

  const formatGameTime = useMemo(() => {
    return (startTime: string) => {
      const date = new Date(startTime);
      return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    };
  }, []);

  const canTrackToday = useCallback((scheduledAt: string) => {
    const gameDate = new Date(scheduledAt);
    if (Number.isNaN(gameDate.getTime())) return true;
    const gameDay = new Date(gameDate);
    gameDay.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return gameDay <= today;
  }, []);

  const handleStartTracking = async (game: Game) => {
    if (!supabase || !user) return;
    if (profile?.role !== 'super_admin' && !canTrackToday(game.scheduled_at)) {
      setGamesError('Tracking opens on the scheduled game day.');
      return;
    }
    setStartingGameId(game.id);
    setGamesError(null);

    const existing = sessions.find((session) => session.game_id === game.id);

    let sessionId = existing?.id ?? null;
    let startedAt = existing?.started_at ?? existing?.created_at ?? null;

    if (!sessionId) {
      const { data, error } = await supabase
        .from('sessions')
        .insert({
          game_id: game.id,
          role_scope: 'BOTH',
          created_by: user.id
        })
        .select('id, started_at, created_at')
        .single();
      if (error) {
        setGamesError(error.message);
        setStartingGameId(null);
        return;
      }
      sessionId = data.id;
      startedAt = data.started_at ?? data.created_at ?? null;
    }

    const createdAtMs = startedAt ? Date.parse(startedAt) : Date.now();
    dispatch({
      type: 'SET_GAME_META',
      opponent: game.opponent_name,
      createdAt: createdAtMs,
      gameId: game.id
    });
    dispatch({ type: 'SET_SESSION', sessionId });
    router.push(`/live?sessionId=${sessionId}`);
    setStartingGameId(null);
  };

  const handleResolveNotification = async (notificationId: string) => {
    if (!supabase || !user || profile?.role !== 'super_admin') return;
    await supabase
      .from('admin_notifications')
      .update({
        status: 'completed',
        resolved_at: new Date().toISOString(),
        resolved_by: user.id
      })
      .eq('id', notificationId);
    setNotifications((prev) => prev.filter((item) => item.id !== notificationId));
  };

  if (!canUseSupabase) {
    return (
      <div className="flex w-full flex-1 flex-col gap-6">
        <h1 className="text-2xl font-semibold text-slate-900">Water Polo Stat Tracker</h1>
        <p className="text-slate-600">Supabase is not configured for this deployment.</p>
      </div>
    );
  }

  if (authLoading || profileLoading) {
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

  return (
    <div className="flex w-full flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Upcoming Games</h1>
          <p className="text-sm text-slate-600">Signed in as {user.email}</p>
          {profile?.role ? (
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Role: {profile.role}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {profile?.role === 'super_admin' ? (
            <>
              <Link
                href="/admin"
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700"
              >
                Admin Overview
              </Link>
              <Link
                href="/admin/games"
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700"
              >
                Manage Games
              </Link>
              <Link
                href="/admin/users"
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700"
              >
                Users
              </Link>
            </>
          ) : null}
          <button
            type="button"
            className="min-h-[44px] rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700"
            onClick={() => supabase?.auth.signOut()}
          >
            Sign Out
          </button>
        </div>
      </div>

      {profile?.role === 'super_admin' ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            New User Signups
          </div>
          {notifications.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No new signups.</p>
          ) : (
            <div className="mt-3 grid gap-2">
              {notifications.map((note) => (
                <div
                  key={note.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
                >
                  <div>
                    <div className="font-semibold">{note.user_email ?? note.message}</div>
                    <div className="text-xs text-slate-500">
                      {new Date(note.created_at).toLocaleString()}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="min-h-[36px] rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700"
                    onClick={() => handleResolveNotification(note.id)}
                  >
                    Mark completed
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {gamesError ? <p className="text-sm text-red-600">{gamesError}</p> : null}
      {gamesLoading ? (
        <p className="text-slate-600">Loading upcoming games…</p>
      ) : games.length === 0 ? (
        <p className="text-slate-600">No upcoming games yet.</p>
      ) : (
        <div className="grid gap-3">
          {games.map((game) => {
            const existingSession = sessions.find((session) => session.game_id === game.id);
            const trackingLocked =
              profile?.role !== 'super_admin' && !canTrackToday(game.scheduled_at);
            return (
              <div
                key={game.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div>
                  <div className="text-base font-semibold text-slate-900">
                    vs {game.opponent_name}
                  </div>
                  <div className="text-sm text-slate-600">{formatGameTime(game.scheduled_at)}</div>
                  {game.location ? (
                    <div className="text-xs text-slate-500">{game.location}</div>
                  ) : null}
                  {existingSession ? (
                    <div className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Session ready
                    </div>
                  ) : null}
                  {trackingLocked ? (
                    <div className="mt-2 text-xs font-semibold text-amber-600">
                      Tracking opens on game day.
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="min-h-[56px] rounded-xl bg-slate-900 px-4 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => handleStartTracking(game)}
                  disabled={startingGameId === game.id || trackingLocked}
                >
                  {existingSession ? 'Resume' : 'Start Live'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
