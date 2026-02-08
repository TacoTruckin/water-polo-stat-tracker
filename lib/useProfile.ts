'use client';

import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

export type Profile = {
  userId: string;
  name: string | null;
  email: string | null;
  role: 'super_admin' | 'tracker';
};

export function useProfile(user: User | null) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!supabase || !user) {
      setProfile(null);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('user_profiles')
      .select('id, name, email, role')
      .eq('id', user.id)
      .maybeSingle();

    if (fetchError) {
      setError(fetchError.message);
      setLoading(false);
      return;
    }

    if (!data) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setProfile({
      userId: data.id,
      name: data.name ?? null,
      email: data.email ?? null,
      role: data.role
    });
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setError(null);
      return;
    }
    void loadProfile();
  }, [loadProfile, user]);

  return { profile, loading, error, refresh: loadProfile };
}
