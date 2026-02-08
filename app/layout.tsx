import type { ReactNode } from 'react';
import type { Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { Providers } from './providers';
import { GameHeaderLabel } from '@/components/GameHeaderLabel';

export const metadata = {
  title: 'Water Polo Stat Tracker',
  description: 'Tablet-first stat tracking for water polo'
};

export const viewport: Viewport = {
  themeColor: '#0f172a'
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Providers>
          <div className="flex min-h-screen flex-col">
            <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
              <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
                <GameHeaderLabel />
                <nav className="flex items-center gap-3 text-sm font-medium text-slate-600">
                  <Link className="hover:text-slate-900" href="/">
                    Home
                  </Link>
                  <Link className="hover:text-slate-900" href="/live">
                    Live
                  </Link>
                  <Link className="hover:text-slate-900" href="/review">
                    Review
                  </Link>
                </nav>
              </div>
            </header>
            <main className="mx-auto flex w-full max-w-6xl flex-1 px-4 py-4">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
