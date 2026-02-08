'use client';

import { useState } from 'react';
import type { ShotOutcome, ShotZone } from '@/lib/types';
import { ShotOutcome as ShotOutcomeEnum, ShotZone as ShotZoneEnum } from '@/lib/types';

const zones: { value: ShotZone; label: string }[] = [
  { value: ShotZoneEnum.LEFT_WING, label: 'Left Wing' },
  { value: ShotZoneEnum.RIGHT_WING, label: 'Right Wing' },
  { value: ShotZoneEnum.POINT, label: 'Point' },
  { value: ShotZoneEnum.ONE_TWO, label: '1–2' },
  { value: ShotZoneEnum.THREE_FOUR, label: '3–4' },
  { value: ShotZoneEnum.POST_UP, label: 'Post-Up' },
  { value: ShotZoneEnum.COUNTER, label: 'Counter' }
];

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
      <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl">
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
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {zones.map((zone) => (
              <button
                key={zone.value}
                type="button"
                className={`min-h-[48px] rounded-xl border px-2 text-sm font-semibold ${
                  selectedZone === zone.value
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
                onClick={() => setSelectedZone(zone.value)}
              >
                {zone.label}
              </button>
            ))}
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
