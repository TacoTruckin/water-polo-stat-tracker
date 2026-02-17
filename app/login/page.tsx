'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import { useSupabaseAuth } from '@/lib/useSupabaseAuth';

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useSupabaseAuth();
  const supabaseReady = isSupabaseConfigured();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      router.replace('/');
    }
  }, [loading, router, user]);

  const handleSignIn = async () => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
    }
    setBusy(false);
  };

  const handleSignUp = async () => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
    } else {
      setMessage('Account created. Check your email if confirmation is required.');
    }
    setBusy(false);
  };

  if (!supabaseReady) {
    return (
      <div className="flex w-full flex-1 flex-col gap-6">
        <h1 className="text-2xl font-semibold text-slate-900">Sign In</h1>
        <p className="text-slate-600">Supabase is not configured for this deployment.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex w-full flex-1 items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex w-full flex-1 flex-col items-start gap-6">
      <div className="flex flex-col items-start gap-3">
        <img
          src="/cwp_logo.svg"
          alt="Carlsbad Water Polo"
          className="h-16 w-auto"
        />
        <h1 className="text-2xl font-semibold text-slate-900">Sign In</h1>
      </div>
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          Supabase Auth
        </div>
        <div className="mt-3 flex flex-col gap-3">
          <label className="text-sm font-semibold text-slate-700">
            Email
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-base"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              placeholder="you@example.com"
            />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Password
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-base"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              placeholder="Password"
            />
          </label>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {message ? <p className="text-sm text-slate-600">{message}</p> : null}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="min-h-[56px] w-full rounded-xl bg-slate-900 text-base font-semibold text-white"
              onClick={handleSignIn}
              disabled={!email || !password || busy}
            >
              Sign In
            </button>
            <button
              type="button"
              className="min-h-[56px] w-full rounded-xl border border-slate-200 text-base font-semibold text-slate-700"
              onClick={handleSignUp}
              disabled={!email || !password || busy}
            >
              Create Account
            </button>
          </div>
        </div>
      </section>

      <section className="w-full max-w-lg rounded-2xl border border-blue-100 bg-blue-50 p-4">
        <h2 className="text-base font-semibold text-blue-900">New Here? Getting Started</h2>
        <ol className="mt-2 list-inside list-decimal space-y-2 text-sm text-blue-800">
          <li>Enter your email and a password above, then tap <strong>Create Account</strong>.</li>
          <li>The team admin will be notified and will activate your account.</li>
          <li>Once approved, come back and <strong>Sign In</strong> with the same email and password.</li>
          <li>On the home screen, look for a <strong>Test</strong> game to practice before game day.</li>
        </ol>
        <p className="mt-2 text-sm text-blue-800">
          You only need to create your account once. For a full walkthrough, visit the{' '}
          <a href="/guide" className="font-semibold underline">
            Parent Tracker Guide
          </a>
          .
        </p>
      </section>
    </div>
  );
}
