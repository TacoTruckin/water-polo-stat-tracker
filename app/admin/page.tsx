'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useRequireAuth } from '@/lib/useRequireAuth';
import { useProfile } from '@/lib/useProfile';
import type { SessionScope } from '@/lib/types';

type GameRow = {
  id: string;
  opponent_name: string;
  scheduled_at: string;
  location: string | null;
};

type SessionRow = {
  id: string;
  game_id: string;
  role_scope: SessionScope;
  started_at: string | null;
  created_at: string;
  created_by: string | null;
};

type EventRow = {
  id: string;
  game_id: string;
};

export default function AdminOverviewPage() {
  const router = useRouter();
  const { user, loading: authLoading, supabaseReady } = useRequireAuth('/login');
  const { profile, loading: profileLoading } = useProfile(user);

  const [games, setGames] = useState<GameRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canUseSupabase = supabase !== null && supabaseReady;

  useEffect(() => {
    if (!canUseSupabase) return;
    if (!authLoading && !profileLoading && !user) {
      router.push('/login');
      return;
    }
    if (!authLoading && !profileLoading && profile && profile.role !== 'super_admin') {
      router.push('/');
      return;
    }
  }, [authLoading, profileLoading, profile, router, user, canUseSupabase]);

  useEffect(() => {
    if (!canUseSupabase || profile?.role !== 'super_admin') return;
    const loadData = async () => {
      const supabaseClient = supabase;
      if (!supabaseClient) return;
      setLoading(true);
      setError(null);
      const [gamesRes, sessionsRes, eventsRes] = await Promise.all([
        supabaseClient
          .from('games')
          .select('id, opponent_name, scheduled_at, location')
          .order('scheduled_at', { ascending: true }),
        supabaseClient
          .from('sessions')
          .select('id, game_id, role_scope, started_at, created_at, created_by')
          .order('created_at', { ascending: false }),
        supabaseClient.from('events').select('id, game_id'),
      ]);

      if (gamesRes.error) {
        setError(gamesRes.error.message);
        setLoading(false);
        return;
      }
      if (sessionsRes.error) {
        setError(sessionsRes.error.message);
        setLoading(false);
        return;
      }
      if (eventsRes.error) {
        setError(eventsRes.error.message);
        setLoading(false);
        return;
      }

      setGames((gamesRes.data ?? []) as GameRow[]);
      setSessions((sessionsRes.data ?? []) as SessionRow[]);
      setEvents((eventsRes.data ?? []) as EventRow[]);
      setLoading(false);
    };
    void loadData();
  }, [canUseSupabase, profile?.role]);

  const sessionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    sessions.forEach((session) => {
      counts[session.game_id] = (counts[session.game_id] ?? 0) + 1;
    });
    return counts;
  }, [sessions]);

  const eventCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach((event) => {
      counts[event.game_id] = (counts[event.game_id] ?? 0) + 1;
    });
    return counts;
  }, [events]);

  if (!canUseSupabase) {
    return (
      <div className="flex w-full flex-1 flex-col gap-4">
        <h1 className="text-2xl font-semibold text-slate-900">Admin Overview</h1>
        <p className="text-slate-600">Admin tools are unavailable in local-only mode.</p>
      </div>
    );
  }

  if (authLoading || profileLoading || loading) {
    return (
      <div className="flex w-full flex-1 items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }

  if (!profile || profile.role !== 'super_admin') {
    return (
      <div className="flex w-full flex-1 flex-col gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Admin Overview</h1>
        <p className="text-slate-600">You do not have access to this page.</p>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Admin Overview</h1>
        <p className="text-sm text-slate-600">Games, sessions, and event counts.</p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-3">
        {games.map((game) => (
          <div
            key={game.id}
            className="rounded-2xl border border-slate-200 bg-white p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-base font-semibold text-slate-900">
                  vs {game.opponent_name}
                </div>
                <div className="text-sm text-slate-600">
                  {new Date(game.scheduled_at).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </div>
                {game.location ? (
                  <div className="text-xs text-slate-500">{game.location}</div>
                ) : null}
              </div>
              <div className="text-right text-sm text-slate-600">
                <div>Sessions: {sessionCounts[game.id] ?? 0}</div>
                <div>Events: {eventCounts[game.id] ?? 0}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
