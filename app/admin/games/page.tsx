'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useRequireAuth } from '@/lib/useRequireAuth';
import { useProfile } from '@/lib/useProfile';

type GameRow = {
  id: string;
  opponent_name: string;
  scheduled_at: string;
  location: string | null;
  created_at: string;
};

type GameDraft = {
  opponent: string;
  scheduledAt: string;
  location: string;
};

const emptyDraft: GameDraft = {
  opponent: '',
  scheduledAt: '',
  location: ''
};

function toDatetimeLocal(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export default function AdminGamesPage() {
  const router = useRouter();
  const { user, loading: authLoading, supabaseReady } = useRequireAuth('/login');
  const { profile, loading: profileLoading } = useProfile(user);

  const [games, setGames] = useState<GameRow[]>([]);
  const [loadingGames, setLoadingGames] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<GameDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<GameDraft>(emptyDraft);

  const canUseSupabase = supabase !== null && supabaseReady;

  const loadGames = useCallback(async () => {
    if (!supabase) return;
    setLoadingGames(true);
    setError(null);
    const { data, error } = await supabase
      .from('games')
      .select('id, opponent_name, scheduled_at, location, created_at')
      .order('scheduled_at', { ascending: true });

    if (error) {
      setError(error.message);
      setLoadingGames(false);
      return;
    }

    setGames((data ?? []) as GameRow[]);
    setLoadingGames(false);
  }, []);

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
    if (!canUseSupabase || !profile || profile.role !== 'super_admin') return;
    void loadGames();
  }, [canUseSupabase, loadGames, profile]);

  const handleCreate = async () => {
    if (!supabase || !user) return;
    setError(null);
    const payload = {
      opponent_name: draft.opponent.trim(),
      scheduled_at: new Date(draft.scheduledAt).toISOString(),
      location: draft.location.trim() || null,
      created_by: user.id
    };
    const { error } = await supabase.from('games').insert(payload);
    if (error) {
      setError(error.message);
      return;
    }
    setDraft(emptyDraft);
    void loadGames();
  };

  const handleEditStart = (game: GameRow) => {
    setEditingId(game.id);
    setEditDraft({
      opponent: game.opponent_name,
      scheduledAt: toDatetimeLocal(game.scheduled_at),
      location: game.location ?? ''
    });
  };

  const handleEditSave = async () => {
    if (!supabase || !editingId) return;
    setError(null);
    const payload = {
      opponent_name: editDraft.opponent.trim(),
      scheduled_at: new Date(editDraft.scheduledAt).toISOString(),
      location: editDraft.location.trim() || null
    };
    const { error } = await supabase.from('games').update(payload).eq('id', editingId);
    if (error) {
      setError(error.message);
      return;
    }
    setEditingId(null);
    setEditDraft(emptyDraft);
    void loadGames();
  };

  const handleDelete = async (id: string) => {
    if (!supabase) return;
    setError(null);
    const { error } = await supabase.from('games').delete().eq('id', id);
    if (error) {
      setError(error.message);
      return;
    }
    void loadGames();
  };

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

  if (!canUseSupabase) {
    return (
      <div className="flex w-full flex-1 flex-col gap-4">
        <h1 className="text-2xl font-semibold text-slate-900">Admin</h1>
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

  if (!profile || profile.role !== 'super_admin') {
    return (
      <div className="flex w-full flex-1 flex-col gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Admin</h1>
        <p className="text-slate-600">You do not have access to this page.</p>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Manage Games</h1>
        <p className="text-sm text-slate-600">Create upcoming games for trackers.</p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          New Game
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="text-sm font-semibold text-slate-700">
            Opponent
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={draft.opponent}
              onChange={(event) => setDraft((prev) => ({ ...prev, opponent: event.target.value }))}
              placeholder="Opponent"
            />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Scheduled
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              type="datetime-local"
              value={draft.scheduledAt}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, scheduledAt: event.target.value }))
              }
            />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Location
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={draft.location}
              onChange={(event) => setDraft((prev) => ({ ...prev, location: event.target.value }))}
              placeholder="Optional"
            />
          </label>
        </div>
        <div className="mt-4">
          <button
            type="button"
            className="min-h-[44px] rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white"
            onClick={handleCreate}
            disabled={!draft.opponent || !draft.scheduledAt}
          >
            Create Game
          </button>
        </div>
      </section>

      {loadingGames ? (
        <p className="text-slate-600">Loading games…</p>
      ) : games.length === 0 ? (
        <p className="text-slate-600">No games yet.</p>
      ) : (
        <div className="grid gap-3">
          {games.map((game) => (
            <div key={game.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              {editingId === game.id ? (
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="text-sm font-semibold text-slate-700">
                    Opponent
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                      value={editDraft.opponent}
                      onChange={(event) =>
                        setEditDraft((prev) => ({ ...prev, opponent: event.target.value }))
                      }
                    />
                  </label>
                  <label className="text-sm font-semibold text-slate-700">
                    Scheduled
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                      type="datetime-local"
                      value={editDraft.scheduledAt}
                      onChange={(event) =>
                        setEditDraft((prev) => ({ ...prev, scheduledAt: event.target.value }))
                      }
                    />
                  </label>
                  <label className="text-sm font-semibold text-slate-700">
                    Location
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                      value={editDraft.location}
                      onChange={(event) =>
                        setEditDraft((prev) => ({ ...prev, location: event.target.value }))
                      }
                    />
                  </label>
                  <div className="md:col-span-3 flex gap-2">
                    <button
                      type="button"
                      className="min-h-[36px] rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700"
                      onClick={handleEditSave}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="min-h-[36px] rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700"
                      onClick={() => {
                        setEditingId(null);
                        setEditDraft(emptyDraft);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold text-slate-900">
                      vs {game.opponent_name}
                    </div>
                    <div className="text-sm text-slate-600">{formatGameTime(game.scheduled_at)}</div>
                    {game.location ? (
                      <div className="text-xs text-slate-500">{game.location}</div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="min-h-[36px] rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700"
                      onClick={() => handleEditStart(game)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="min-h-[36px] rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700"
                      onClick={() => handleDelete(game.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
