'use client';

import { useMemo } from 'react';
import { useGame } from '@/lib/store';

export function GameHeaderLabel() {
  const { state } = useGame();

  const label = useMemo(() => {
    const opponent = state.opponent || '(Unknown)';
    if (!state.createdAt) {
      return `vs ${opponent}`;
    }
    const date = new Date(state.createdAt);
    const datePart = date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    const timePart = date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit'
    });
    return `vs ${opponent} — ${datePart} ${timePart}`;
  }, [state.createdAt, state.opponent]);

  return <div className="text-sm font-semibold tracking-wide text-slate-800">{label}</div>;
}
