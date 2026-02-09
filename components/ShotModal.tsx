'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { ShotOutcome, ShotZone } from '@/lib/types';
import { ShotOutcome as ShotOutcomeEnum, ShotZone as ShotZoneEnum } from '@/lib/types';

const zoneGrid: { value: ShotZone; label: string; legend: string }[] = [
  { value: ShotZoneEnum.LEFT_WING, label: 'Zone 1 (Left Wing)', legend: 'Zone 1 = Left Wing' },
  { value: ShotZoneEnum.POINT, label: 'Zone 2 (Point)', legend: 'Zone 2 = Point' },
  { value: ShotZoneEnum.RIGHT_WING, label: 'Zone 3 (Right Wing)', legend: 'Zone 3 = Right Wing' },
  { value: ShotZoneEnum.ONE_TWO, label: 'Zone 4 (1–2)', legend: 'Zone 4 = 1–2' },
  { value: ShotZoneEnum.POST_UP, label: 'Zone 5 (Post-Up)', legend: 'Zone 5 = Post-Up' },
  { value: ShotZoneEnum.THREE_FOUR, label: 'Zone 6 (3–4)', legend: 'Zone 6 = 3–4' }
];

const zoneLabels: Record<ShotZone, string> = {
  [ShotZoneEnum.LEFT_WING]: 'Left Wing',
  [ShotZoneEnum.RIGHT_WING]: 'Right Wing',
  [ShotZoneEnum.POINT]: 'Point',
  [ShotZoneEnum.ONE_TWO]: '1–2',
  [ShotZoneEnum.THREE_FOUR]: '3–4',
  [ShotZoneEnum.POST_UP]: 'Post-Up',
  [ShotZoneEnum.COUNTER]: 'Counter'
};

const outcomes: { value: ShotOutcome; label: string }[] = [
  { value: ShotOutcomeEnum.GOAL, label: 'Goal' },
  { value: ShotOutcomeEnum.SAVED, label: 'Saved' },
  { value: ShotOutcomeEnum.BLOCKED, label: 'Blocked' },
  { value: ShotOutcomeEnum.WIDE, label: 'Wide' }
];

type ShotModalProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (zone: ShotZone, outcome: ShotOutcome) => void;
  initialZone?: ShotZone | null;
};

export function ShotModal({ open, onClose, onSelect, initialZone }: ShotModalProps) {
  const [selectedZone, setSelectedZone] = useState<ShotZone | null>(initialZone ?? null);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Shot Details</h3>
          <button
            type="button"
            className="text-sm font-semibold text-slate-500"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Zone
          </div>
          <div className="mt-2">
            <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
              <div className="relative aspect-[4/3] w-full">
                <Image
                  src="/shot-zones.png"
                  alt="Shot zone diagram"
                  fill
                  className="object-cover"
                  priority
                  sizes="(max-width: 1024px) 100vw, 720px"
                />
              </div>
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-2">
                {zoneGrid.map((zone) => (
                  <button
                    key={zone.value}
                    type="button"
                    aria-label={zone.label}
                    className={`group relative flex items-center justify-center border border-transparent text-xs font-semibold text-transparent transition-colors ${
                      selectedZone === zone.value
                        ? 'bg-slate-900/20 ring-2 ring-inset ring-slate-900'
                        : 'bg-slate-900/0 hover:bg-slate-900/10'
                    }`}
                    onClick={() => setSelectedZone(zone.value)}
                  >
                    <span className="sr-only">{zone.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-700">
              Selected: {selectedZone ? zoneLabels[selectedZone] : 'Tap a zone'}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500 sm:grid-cols-3">
              {zoneGrid.map((zone) => (
                <div key={zone.value}>{zone.legend}</div>
              ))}
            </div>
            <div className="mt-3">
              <button
                type="button"
                className={`min-h-[48px] w-full rounded-xl border px-3 text-sm font-semibold ${
                  selectedZone === ShotZoneEnum.COUNTER
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
                onClick={() => setSelectedZone(ShotZoneEnum.COUNTER)}
              >
                Counter
              </button>
            </div>
          </div>
        </div>
        <div className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Outcome
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {outcomes.map((outcome) => (
              <button
                key={outcome.value}
                type="button"
                className="min-h-[48px] rounded-xl border border-slate-200 px-2 text-sm font-semibold text-slate-700"
                onClick={() => {
                  const zone = selectedZone ?? ShotZoneEnum.POINT;
                  onSelect(zone, outcome.value);
                }}
              >
                {outcome.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
