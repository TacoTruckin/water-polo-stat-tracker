'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabaseAuth } from './useSupabaseAuth';
import { isSupabaseConfigured } from './supabaseClient';

export function useRequireAuth(redirectTo = '/login') {
  const router = useRouter();
  const { user, loading } = useSupabaseAuth();
  const supabaseReady = isSupabaseConfigured();

  useEffect(() => {
    if (!supabaseReady) return;
    if (!loading && !user) {
      router.replace(redirectTo);
    }
  }, [loading, redirectTo, router, supabaseReady, user]);

  return { user, loading, supabaseReady };
}
