'use client';

import { useMemo } from 'react';
import { useGame } from '@/lib/store';

export function GameHeaderLabel() {
  const { state } = useGame();

  const label = useMemo(() => {
    const opponent = state.opponent || '(Unknown)';
    return `CBAD vs ${opponent}`;
  }, [state.createdAt, state.opponent]);

  return <div className="text-sm font-semibold tracking-wide text-slate-800">{label}</div>;
}
