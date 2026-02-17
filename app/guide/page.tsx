'use client';

import Link from 'next/link';

function StepCard({
  step,
  title,
  children
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
          {step}
        </span>
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <div className="mt-2 text-sm leading-relaxed text-slate-600">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function GuidePage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Parent Tracker Guide</h1>
        <p className="mt-1 text-sm text-slate-600">
          Everything you need to know to track stats during games.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-800">Getting Started</h2>
        <div className="grid gap-4">
          <StepCard step={1} title="Create Your Account">
            <p>
              Go to the{' '}
              <Link href="/login" className="font-semibold text-slate-900 underline">
                Login page
              </Link>{' '}
              and enter your email and a password. Click <strong>Sign Up</strong>.
            </p>
            <p className="mt-2">
              The coach will be notified of your signup and will approve your account. You only need
              to do this once.
            </p>
          </StepCard>

          <StepCard step={2} title="Wait for Approval">
            <p>
              After signing up, the coach needs to activate your account. You&apos;ll be able to log
              in once approved. This usually happens within a few hours.
            </p>
          </StepCard>

          <StepCard step={3} title="Log In">
            <p>
              Go back to the{' '}
              <Link href="/login" className="font-semibold text-slate-900 underline">
                Login page
              </Link>{' '}
              and enter your email and password. Click <strong>Log In</strong>.
            </p>
          </StepCard>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-800">Practice: Test Game</h2>
        <div className="grid gap-4">
          <StepCard step={4} title="Find the Test Game">
            <p>
              On the{' '}
              <Link href="/" className="font-semibold text-slate-900 underline">
                Home page
              </Link>
              , look for a game labeled <strong>&quot;Test&quot;</strong> or{' '}
              <strong>&quot;Practice&quot;</strong>. Tap <strong>Join Session</strong> to enter.
            </p>
            <p className="mt-2">
              If you don&apos;t see a test game, ask the coach to create one.
            </p>
          </StepCard>

          <StepCard step={5} title="Learn the Interface">
            <p>The live tracking screen has these sections from top to bottom:</p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              <li>
                <strong>Quarter selector</strong> &mdash; Q1, Q2, Q3, Q4, OT. Make sure the right
                quarter is selected.
              </li>
              <li>
                <strong>Situation selector</strong> &mdash; Man-Up, Man-Down, 5M. Leave blank for
                even-strength.
              </li>
              <li>
                <strong>Player grid</strong> &mdash; Tap a player number FIRST, then tap an action.
              </li>
              <li>
                <strong>Offense actions</strong> &mdash; Shot (opens zone picker), Assist, Turnover.
              </li>
              <li>
                <strong>Defense actions</strong> &mdash; Steal, Block, Tip, Def Exclusion.
              </li>
            </ul>
          </StepCard>

          <StepCard step={6} title="Practice Tracking">
            <p>Try this sequence to get comfortable:</p>
            <ol className="mt-2 list-inside list-decimal space-y-1">
              <li>Tap a player number (e.g., #7)</li>
              <li>Tap <strong>Shot</strong></li>
              <li>Pick a zone on the goal diagram</li>
              <li>Pick an outcome (Goal, Saved, Blocked, Wide)</li>
              <li>You should see a &quot;Saved!&quot; toast confirmation</li>
            </ol>
            <p className="mt-2">
              Try logging a Steal, an Assist, and a Turnover too. If you make a mistake, tap{' '}
              <strong>Undo</strong> immediately (one undo per action).
            </p>
          </StepCard>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-800">Game Day</h2>
        <div className="grid gap-4">
          <StepCard step={7} title="Select the Right Game">
            <p>
              On the{' '}
              <Link href="/" className="font-semibold text-slate-900 underline">
                Home page
              </Link>
              , find today&apos;s game (e.g., <strong>&quot;vs Rancho Santa Fe&quot;</strong>). Tap{' '}
              <strong>Join Session</strong>.
            </p>
            <p className="mt-2 font-semibold text-amber-700">
              Make sure you select the actual game, not the test game!
            </p>
          </StepCard>

          <StepCard step={8} title="Choose Your Tracking Role">
            <p>When joining, you may be asked to choose a role:</p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              <li>
                <strong>Both</strong> &mdash; Track offense AND defense (if you&apos;re the only
                tracker)
              </li>
              <li>
                <strong>Offense</strong> &mdash; Only track shots, assists, turnovers
              </li>
              <li>
                <strong>Defense</strong> &mdash; Only track steals, blocks, tips, exclusions
              </li>
            </ul>
            <p className="mt-2">
              If multiple parents are tracking, coordinate who covers offense vs defense. This
              reduces duplicate entries.
            </p>
          </StepCard>

          <StepCard step={9} title="Track the Game">
            <p>When the whistle blows:</p>
            <ol className="mt-2 list-inside list-decimal space-y-1">
              <li>Make sure the correct <strong>quarter</strong> is selected</li>
              <li>Watch the play</li>
              <li>
                Tap the <strong>player number</strong>, then the <strong>action</strong>
              </li>
              <li>
                For special situations (man-up, man-down, 5-meter), tap the situation BEFORE logging
                the action
              </li>
              <li>The situation auto-resets after a goal or turnover</li>
            </ol>
          </StepCard>

          <StepCard step={10} title="Tips for Accuracy">
            <ul className="list-inside list-disc space-y-2">
              <li>
                <strong>Speed over perfection</strong> &mdash; It&apos;s better to get the event
                logged within a few seconds than to miss it entirely.
              </li>
              <li>
                <strong>Player first, then action</strong> &mdash; Always tap the player number
                before the action button.
              </li>
              <li>
                <strong>Wrong player?</strong> &mdash; Tap <strong>Undo</strong> immediately, then
                re-log with the correct player.
              </li>
              <li>
                <strong>Missed an event?</strong> &mdash; Don&apos;t worry. With multiple trackers,
                someone likely caught it. Log what you can.
              </li>
              <li>
                <strong>Quarter changes</strong> &mdash; Remember to switch the quarter selector
                between periods.
              </li>
              <li>
                <strong>Keep your phone charged</strong> &mdash; The screen stays active during
                tracking.
              </li>
            </ul>
          </StepCard>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-800">Quick Reference</h2>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">When to Log</th>
                <th className="px-4 py-3">Category</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr>
                <td className="px-4 py-3 font-semibold">Shot &rarr; Goal</td>
                <td className="px-4 py-3">Our team scores</td>
                <td className="px-4 py-3 text-xs text-slate-500">Offense</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold">Shot &rarr; Saved</td>
                <td className="px-4 py-3">Their goalie saves our shot</td>
                <td className="px-4 py-3 text-xs text-slate-500">Offense</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold">Shot &rarr; Blocked</td>
                <td className="px-4 py-3">Field player blocks our shot</td>
                <td className="px-4 py-3 text-xs text-slate-500">Offense</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold">Shot &rarr; Wide</td>
                <td className="px-4 py-3">Our shot misses the goal entirely</td>
                <td className="px-4 py-3 text-xs text-slate-500">Offense</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold">Assist</td>
                <td className="px-4 py-3">Pass that directly leads to a goal</td>
                <td className="px-4 py-3 text-xs text-slate-500">Offense</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold">Turnover &rarr; Bad Pass</td>
                <td className="px-4 py-3">Our player makes an unforced passing error</td>
                <td className="px-4 py-3 text-xs text-slate-500">Offense</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold">Turnover &rarr; Stolen From</td>
                <td className="px-4 py-3">Opponent steals the ball from our player</td>
                <td className="px-4 py-3 text-xs text-slate-500">Offense</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold">Steal</td>
                <td className="px-4 py-3">Our player takes the ball from opponent</td>
                <td className="px-4 py-3 text-xs text-slate-500">Defense</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold">Block</td>
                <td className="px-4 py-3">Our player blocks an opponent&apos;s shot</td>
                <td className="px-4 py-3 text-xs text-slate-500">Defense</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold">Tip</td>
                <td className="px-4 py-3">Our player tips/deflects a pass or shot</td>
                <td className="px-4 py-3 text-xs text-slate-500">Defense</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold">Def Exclusion</td>
                <td className="px-4 py-3">Our player draws an exclusion foul on defense</td>
                <td className="px-4 py-3 text-xs text-slate-500">Defense</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
        <h2 className="text-lg font-semibold text-blue-900">Need Help?</h2>
        <p className="mt-1 text-sm text-blue-800">
          If something isn&apos;t working or you&apos;re unsure about an action, just skip it and
          keep tracking what you can. The coach can review and clean up the data after the game.
          Don&apos;t stress about getting everything perfect — every logged event helps!
        </p>
      </section>
    </div>
  );
}
