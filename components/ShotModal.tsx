'use client';

import { useEffect, useState } from 'react';
import { ShotOutcome, ShotZone } from '@/lib/types';

const zoneRows: { value: ShotZone; label: string }[][] = [
  [
    { value: ShotZone.LEFT_WING, label: 'Left Wing' },
    { value: ShotZone.POINT, label: 'Point' },
    { value: ShotZone.RIGHT_WING, label: 'Right Wing' },
  ],
  [
    { value: ShotZone.ONE_TWO, label: '1-2' },
    { value: ShotZone.POST_UP, label: 'Post-Up' },
    { value: ShotZone.THREE_FOUR, label: '3-4' },
  ],
  [{ value: ShotZone.COUNTER, label: 'Counter' }],
];

const outcomeOptions: { value: ShotOutcome; label: string; className: string }[] = [
  {
    value: ShotOutcome.GOAL,
    label: 'Goal',
    className: 'border-emerald-300 bg-emerald-100 text-emerald-900',
  },
  {
    value: ShotOutcome.SAVED,
    label: 'Saved',
    className: 'border-sky-300 bg-sky-100 text-sky-900',
  },
  {
    value: ShotOutcome.BLOCKED,
    label: 'Blocked',
    className: 'border-amber-300 bg-amber-100 text-amber-900',
  },
  {
    value: ShotOutcome.WIDE,
    label: 'Wide',
    className: 'border-rose-300 bg-rose-100 text-rose-900',
  },
];

type ShotModalProps = {
  open: boolean;
  initialZone?: ShotZone | null;
  onClose: () => void;
  onSave: (zone: ShotZone, outcome: ShotOutcome) => void;
};

export function ShotModal({ open, initialZone, onClose, onSave }: ShotModalProps) {
  const [selectedZone, setSelectedZone] = useState<ShotZone | null>(null);

  useEffect(() => {
    if (open) {
      setSelectedZone(initialZone ?? null);
    }
  }, [open, initialZone]);

  if (!open) return null;

  const handleOutcome = (outcome: ShotOutcome) => {
    if (!selectedZone) return;
    onSave(selectedZone, outcome);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-label="Shot entry"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Shot Entry
            </div>
            <div className="text-lg font-semibold text-slate-900">Half-Pool</div>
          </div>
          <button
            type="button"
            className="min-h-[44px] rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Zone
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {zoneRows.map((row, rowIndex) => (
              <div key={`row-${rowIndex}`} className="grid grid-cols-3 gap-2">
                {row.map((zone) => {
                  const isSelected = selectedZone === zone.value;
                  return (
                    <button
                      key={zone.value}
                      type="button"
                      aria-pressed={isSelected}
                      className={`min-h-[56px] rounded-xl border px-2 text-sm font-semibold md:text-base ${
                        isSelected
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-700'
                      } ${row.length === 1 ? 'col-span-3' : ''}`}
                      onClick={() => setSelectedZone(zone.value)}
                    >
                      {zone.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Outcome
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {outcomeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`min-h-[56px] rounded-xl border-2 text-base font-semibold ${option.className} ${
                  selectedZone ? '' : 'cursor-not-allowed opacity-50'
                }`}
                onClick={() => handleOutcome(option.value)}
                disabled={!selectedZone}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
