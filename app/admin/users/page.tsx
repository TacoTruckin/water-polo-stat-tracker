'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import { useRequireAuth } from '@/lib/useRequireAuth';
import { useProfile } from '@/lib/useProfile';

type UserProfile = {
  id: string;
  name: string | null;
  email: string | null;
  role: 'super_admin' | 'tracker';
  created_at: string;
};

export default function AdminUsersPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useRequireAuth('/login');
  const { profile, loading: profileLoading } = useProfile(user);
  const supabaseReady = isSupabaseConfigured();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canUseSupabase = supabase !== null && supabaseReady;

  const loadUsers = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, name, email, role, created_at')
      .order('created_at', { ascending: true });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setUsers((data ?? []) as UserProfile[]);
    setLoading(false);
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
    void loadUsers();
  }, [canUseSupabase, loadUsers, profile]);

  const adminCount = useMemo(
    () => users.filter((item) => item.role === 'super_admin').length,
    [users]
  );

  const handleRoleChange = async (target: UserProfile, role: 'super_admin' | 'tracker') => {
    if (!supabase) return;
    const actionLabel = role === 'super_admin' ? 'promote' : 'demote';
    const confirmMessage = `Are you sure you want to ${actionLabel} ${
      target.email ?? target.name ?? target.id
    } to ${role}?`;
    if (!window.confirm(confirmMessage)) return;

    setError(null);
    const { error } = await supabase.from('user_profiles').update({ role }).eq('id', target.id);
    if (error) {
      setError(error.message);
      return;
    }
    void loadUsers();
  };

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
        <h1 className="text-2xl font-semibold text-slate-900">Users</h1>
        <p className="text-sm text-slate-600">Promote or demote tracker roles.</p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="text-slate-600">Loading users…</p>
      ) : users.length === 0 ? (
        <p className="text-slate-600">No users found.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="grid grid-cols-[1.5fr_1fr_160px] gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            <div>User</div>
            <div>Role</div>
            <div>Actions</div>
          </div>
          <div className="divide-y divide-slate-200">
            {users.map((item) => {
              const label = item.name ?? item.email ?? item.id;
              const isSelf = user?.id === item.id;
              const isLastAdmin = item.role === 'super_admin' && adminCount <= 1 && isSelf;
              return (
                <div
                  key={item.id}
                  className="grid grid-cols-[1.5fr_1fr_160px] items-center gap-2 px-4 py-3 text-sm text-slate-700"
                >
                  <div>
                    <div className="font-semibold text-slate-900">{label}</div>
                    <div className="text-xs text-slate-500">{item.email ?? item.id}</div>
                  </div>
                  <div className="font-semibold text-slate-900">{item.role}</div>
                  <div className="flex flex-wrap gap-2">
                    {item.role === 'tracker' ? (
                      <button
                        type="button"
                        className="min-h-[36px] rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700"
                        onClick={() => handleRoleChange(item, 'super_admin')}
                      >
                        Promote
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="min-h-[36px] rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => handleRoleChange(item, 'tracker')}
                        disabled={isLastAdmin}
                      >
                        Demote
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
