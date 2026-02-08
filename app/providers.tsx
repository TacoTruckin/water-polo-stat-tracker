'use client';

import type { ReactNode } from 'react';
import { GameProvider } from '@/lib/store';

type ProvidersProps = {
  children: ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  return <GameProvider>{children}</GameProvider>;
}
