'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useGame } from '@/lib/store';

export function GameHeaderLabel() {
  const { state } = useGame();
  const pathname = usePathname();

  const label = useMemo(() => {
    const opponent = state.opponent || '(Unknown)';
    return `CBAD vs ${opponent}`;
  }, [state.createdAt, state.opponent]);

  // Only show game label on live and review pages
  if (pathname !== '/live' && pathname !== '/review') {
    return <div className="text-sm font-semibold tracking-wide text-slate-800">CBAD Water Polo</div>;
  }

  return <div className="text-sm font-semibold tracking-wide text-slate-800">{label}</div>;
}
