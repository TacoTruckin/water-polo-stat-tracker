'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useGame } from '@/lib/store';
import type { SessionScope } from '@/lib/types';
import { supabase } from '@/lib/supabaseClient';
import { useProfile } from '@/lib/useProfile';
import { useRequireAuth } from '@/lib/useRequireAuth';

type Game = {
  id: string;
  opponent_name: string;
  scheduled_at: string;
  location: string | null;
};

type Session = {
  id: string;
  game_id: string;
  role_scope: SessionScope;
  started_at: string | null;
  created_at: string;
  created_by: string;
};

const scopeOptions: { value: SessionScope; label: string }[] = [
  { value: 'OFFENSE', label: 'Offense' },
  { value: 'DEFENSE', label: 'Defense' },
  { value: 'BOTH', label: 'Both' },
];

export default function HomePage() {
  const router = useRouter();
  const { dispatch } = useGame();
  const { user, loading: authLoading, supabaseReady } = useRequireAuth('/login');
  const { profile, loading: profileLoading } = useProfile(user);

  const [games, setGames] = useState<Game[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [scopeByGame, setScopeByGame] = useState<Record<string, SessionScope>>({});
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
        .order('created_at', { ascending: true }),
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
    setGamesLoading(false);
  }, [user]);

  useEffect(() => {
    if (!canUseSupabase || !user) {
      setGames([]);
      setSessions([]);
      return;
    }
    void loadData();
  }, [canUseSupabase, loadData, user]);

  const formatGameTime = useMemo(() => {
    return (startTime: string) => {
      const date = new Date(startTime);
      return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    };
  }, []);

  const handleScopeChange = (gameId: string, scope: SessionScope) => {
    setScopeByGame((prev) => ({ ...prev, [gameId]: scope }));
  };

  const handleStartTracking = async (game: Game) => {
    if (!supabase || !user) return;
    const scope = scopeByGame[game.id] ?? 'OFFENSE';
    setStartingGameId(game.id);
    setGamesError(null);

    const existing = sessions.find(
      (session) => session.game_id === game.id && session.role_scope === scope
    );

    let sessionId = existing?.id ?? null;
    let startedAt = existing?.started_at ?? existing?.created_at ?? null;

    if (!sessionId) {
      const { data, error } = await supabase
        .from('sessions')
        .insert({
          game_id: game.id,
          role_scope: scope,
          started_at: new Date().toISOString(),
          created_by: user.id,
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
      gameId: game.id,
    });
    dispatch({ type: 'SET_SESSION', sessionId });
    router.push(`/live?sessionId=${sessionId}`);
    setStartingGameId(null);
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
                className="min-h-[44px] rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700"
              >
                Admin Overview
              </Link>
              <Link
                href="/admin/games"
                className="min-h-[44px] rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700"
              >
                Manage Games
              </Link>
              <Link
                href="/admin/users"
                className="min-h-[44px] rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700"
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

      {gamesError ? <p className="text-sm text-red-600">{gamesError}</p> : null}
      {gamesLoading ? (
        <p className="text-slate-600">Loading upcoming games…</p>
      ) : games.length === 0 ? (
        <p className="text-slate-600">No upcoming games yet.</p>
      ) : (
        <div className="grid gap-3">
          {games.map((game) => {
            const selectedScope = scopeByGame[game.id] ?? 'OFFENSE';
            const existingSession = sessions.find(
              (session) => session.game_id === game.id && session.role_scope === selectedScope
            );
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
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {scopeOptions.map((option) => {
                      const active = option.value === selectedScope;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`min-h-[36px] rounded-full border px-3 text-xs font-semibold ${
                            active
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-200 bg-white text-slate-700'
                          }`}
                          onClick={() => handleScopeChange(game.id, option.value)}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  {existingSession ? (
                    <div className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Session ready ({existingSession.role_scope})
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="min-h-[56px] rounded-xl bg-slate-900 px-4 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => handleStartTracking(game)}
                  disabled={startingGameId === game.id}
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
