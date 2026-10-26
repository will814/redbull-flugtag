import React, { useEffect, useMemo, useRef } from 'react';
import { COMPETITIONS, CraftPart, PART_CATALOG } from '../builder/PartCatalog';
import { FlightSimulationState } from '../physics/AeroPhysicsEngine';
import { RotateCcw, Wrench, Trophy, Sparkles } from 'lucide-react';

interface JudgingScorecardModalProps {
  flightState: FlightSimulationState;
  newlyUnlockedParts: CraftPart[];
  totalStars: number;
  bestDistanceFeet: number;
  onFlyAgain: () => void;
  onBackToHangar: () => void;
}

export const JudgingScorecardModal: React.FC<JudgingScorecardModalProps> = React.memo(({
  flightState,
  newlyUnlockedParts,
  totalStars,
  bestDistanceFeet,
  onFlyAgain,
  onBackToHangar,
}) => {
  const scores = flightState.judgeScores;
  const primaryBtnRef = useRef<HTMLButtonElement | null>(null);
  const comp = flightState.competition;
  const compMeta = COMPETITIONS[comp];

  // Find the next locked part for this competition (or shared topper) so players always see their progression goal
  const nextLockedPart = useMemo(() => {
    const locked = PART_CATALOG.filter(
      (p) =>
        p.unlockStars > totalStars &&
        (p.category === 'topper' ||
          p.competition === 'shared' ||
          p.competition === comp ||
          (!p.competition && comp === 'flugtag'))
    ).sort((a, b) => a.unlockStars - b.unlockStars);
    return locked[0] ?? null;
  }, [totalStars, comp]);

  // Auto-focus primary CTA & support keyboard shortcuts (after brief 350ms guard)
  useEffect(() => {
    primaryBtnRef.current?.focus();
    const mountedAt = performance.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (e.repeat || performance.now() - mountedAt < 350) return;
        onFlyAgain();
      } else if (e.code === 'Escape' || e.code === 'KeyB') {
        e.preventDefault();
        if (e.repeat || performance.now() - mountedAt < 350) return;
        onBackToHangar();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onFlyAgain, onBackToHangar]);

  if (!scores) return null;

  const displayBestFeet = Math.max(bestDistanceFeet, flightState.distanceFeet);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/80 p-1.5 sm:p-3 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scorecard-heading"
    >
      <div className="relative flex w-full max-w-xl flex-col gap-2 rounded-3xl bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-900 px-3.5 py-2.5 sm:p-5 border-4 border-yellow-400 shadow-2xl max-h-[96vh] overflow-y-auto no-scrollbar">
        {/* TOP HEADER: Distance & Splash Badge + Total Score & Stars */}
        <div className="flex items-center justify-between gap-2 border-b border-white/15 pb-2">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-yellow-400 text-xl sm:text-3xl shadow-md">
              {comp === 'soapbox'
                ? flightState.completedCourse
                  ? '🏁'
                  : '🏎️'
                : comp === 'rollercoaster'
                ? flightState.completedCourse
                  ? '🔔'
                  : '💦'
                : '💦'}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <h2
                  id="scorecard-heading"
                  className="font-display text-xl sm:text-3xl font-black text-yellow-300 leading-none"
                >
                  {flightState.distanceFeet} FEET!
                </h2>
                {scores.newRecord ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400 px-2 py-0.5 text-[11px] font-black text-slate-950">
                    <Trophy className="h-3 w-3" /> NEW BEST!
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-slate-800 border border-white/15 px-2 py-0.5 text-[11px] font-bold text-slate-300">
                    🏆 Best: {displayBestFeet} ft
                  </span>
                )}
              </div>
              <div className="text-[11px] sm:text-xs font-extrabold text-sky-300 mt-0.5">
                {scores.beatWorldRecord
                  ? comp === 'soapbox'
                    ? `🏁 CROSSED THE 450 FT FINISH LINE IN ${flightState.courseTimeSeconds.toFixed(1)}S!!`
                    : comp === 'rollercoaster'
                    ? `🔔 RANG THE GRAND BELL AT 320 FT IN ${flightState.courseTimeSeconds.toFixed(1)}S!!`
                    : '👑 YOU BEAT THE 258 FT WORLD RECORD!!'
                  : `${scores.splashRating} • Start Timing: ${flightState.trolleyReleaseQuality.toUpperCase()}`}
              </div>
            </div>
          </div>

          {/* Total Score (/30) & Stars Earned */}
          <div className="flex flex-col items-end gap-0.5">
            <div className="flex items-center gap-1.5 rounded-2xl bg-amber-400/20 border-2 border-amber-400 px-2.5 py-1">
              <div className="text-base sm:text-xl">
                {'⭐'.repeat(scores.starsEarned)}
              </div>
              <span className="font-display text-xs sm:text-base font-black text-amber-300">
                +{scores.starsEarned}
              </span>
            </div>
            <span className="text-[11px] font-black text-amber-200/90">
              Total: {scores.totalScore}/30{' '}
              {scores.starsEarned < 3 && (
                <span className="text-slate-400 font-bold">
                  ({scores.starsEarned === 1 ? '20+ for 2⭐' : '26+ for 3⭐'})
                </span>
              )}
            </span>
          </div>
        </div>

        {/* STRUCTURAL INTEGRITY & HEAVYWEIGHT CALLOUT STRIP */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 rounded-xl bg-slate-950/60 border border-white/10 px-3 py-1 text-[11px] font-extrabold">
          <span
            className={
              (comp === 'soapbox'
                ? flightState.obstaclesHit === 0
                : comp === 'rollercoaster'
                ? flightState.completedCourse
                : flightState.debris.length === 0)
                ? 'text-emerald-300'
                : 'text-amber-300'
            }
          >
            {comp === 'soapbox'
              ? flightState.obstaclesHit === 0
                ? '🛞 Clean Street Run — Zero Hay Bales Hit!'
                : `🌾 ${flightState.obstaclesHit} Hay Bale(s) Smashed Along the Hill!`
              : comp === 'rollercoaster'
              ? flightState.completedCourse
                ? '🚲 Stayed Dry & Balanced Across the Entire Canal Track!'
                : `💦 Derailed into the Canal at ${flightState.distanceFeet} ft!`
              : flightState.debris.length === 0
              ? '🛠️ Hull Held Together on Water Impact!'
              : `💥 ${flightState.debris.length} Parts Snapped Off in a Yard-Sale Splash!`}
          </span>
          {scores.isOverWeightCannonball && (
            <span className="rounded-md bg-rose-500/25 border border-rose-400/50 px-1.5 py-0.5 text-rose-200">
              🛋️ &gt;400LB HEAVYWEIGHT (+1 CREATIVITY!)
            </span>
          )}
        </div>

        {/* THE 3 CELEBRITY JUDGES' SCORECARDS (Staggered Entrance) */}
        <div className="grid grid-cols-3 gap-2">
          {/* Judge 1: Distance / Speed & Line / Track & Bell */}
          <div
            className="animate-card-pop flex flex-col items-center justify-between rounded-2xl bg-slate-800/95 border-2 border-sky-400/60 p-2 sm:p-2.5 text-center shadow-lg"
            style={{ animationDelay: '60ms' }}
          >
            <div className="flex flex-col items-center">
              <span className="text-xl sm:text-2xl">
                {comp === 'soapbox' ? '🏁' : comp === 'rollercoaster' ? '🔔' : '🧑‍✈️'}
              </span>
              <span className="text-[11px] sm:text-xs font-extrabold text-sky-300">
                {comp === 'soapbox'
                  ? 'SPEED & LINE'
                  : comp === 'rollercoaster'
                  ? 'TRACK & BELL'
                  : 'DISTANCE'}
              </span>
            </div>
            <div className="my-1 flex h-9 w-13 sm:h-11 sm:w-16 items-center justify-center rounded-xl bg-white font-display text-lg sm:text-2xl font-black text-slate-950 shadow">
              {scores.distanceJudge}
              <span className="text-[11px] text-slate-500">/10</span>
            </div>
            <div className="text-[10px] sm:text-[11px] font-bold text-slate-300 leading-tight">
              {comp === 'soapbox'
                ? `${flightState.distanceFeet} / ${compMeta.goalFeet} ft finish`
                : comp === 'rollercoaster'
                ? `${flightState.distanceFeet} / ${compMeta.goalFeet} ft bell`
                : `${flightState.distanceFeet} / 235 ft goal`}
            </div>
          </div>

          {/* Judge 2: Creativity */}
          <div
            className="animate-card-pop flex flex-col items-center justify-between rounded-2xl bg-slate-800/95 border-2 border-pink-400/60 p-2 sm:p-2.5 text-center shadow-lg"
            style={{ animationDelay: '180ms' }}
          >
            <div className="flex flex-col items-center">
              <span className="text-xl sm:text-2xl">👨‍🍳</span>
              <span className="text-[11px] sm:text-xs font-extrabold text-pink-300">
                CREATIVITY
              </span>
            </div>
            <div className="my-1 flex h-9 w-13 sm:h-11 sm:w-16 items-center justify-center rounded-xl bg-white font-display text-lg sm:text-2xl font-black text-slate-950 shadow">
              {scores.creativityJudge}
              <span className="text-[11px] text-slate-500">/10</span>
            </div>
            <div className="text-[10px] sm:text-[11px] font-bold text-slate-300 leading-tight">
              {scores.splashRating}
            </div>
          </div>

          {/* Judge 3: Showmanship */}
          <div
            className="animate-card-pop flex flex-col items-center justify-between rounded-2xl bg-slate-800/95 border-2 border-amber-400/60 p-2 sm:p-2.5 text-center shadow-lg"
            style={{ animationDelay: '300ms' }}
          >
            <div className="flex flex-col items-center">
              <span className="text-xl sm:text-2xl">🎧</span>
              <span className="text-[11px] sm:text-xs font-extrabold text-amber-300">
                SHOWMANSHIP
              </span>
            </div>
            <div className="my-1 flex h-9 w-13 sm:h-11 sm:w-16 items-center justify-center rounded-xl bg-white font-display text-lg sm:text-2xl font-black text-slate-950 shadow">
              {scores.showmanshipJudge}
              <span className="text-[11px] text-slate-500">/10</span>
            </div>
            <div className="text-[10px] sm:text-[11px] font-bold text-slate-300 leading-tight">
              Hype {Math.round(flightState.hypeMeter)}% •{' '}
              {comp === 'rollercoaster' ? '🔔' : '⭕'} {flightState.thermalsCollected}/3
            </div>
          </div>
        </div>

        {/* NEWLY UNLOCKED PARTS BANNER OR NEXT UNLOCK PROGRESS */}
        {newlyUnlockedParts.length > 0 ? (
          <div className="rounded-2xl bg-gradient-to-r from-amber-500/25 via-yellow-500/25 to-emerald-500/25 border-2 border-yellow-300 px-2.5 py-1.5">
            <div className="flex items-center gap-1.5 font-display text-[11px] sm:text-xs font-black text-yellow-300 mb-1">
              <Sparkles className="h-3.5 w-3.5" />
              <span>NEW PARTS UNLOCKED IN THE HANGAR!</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {newlyUnlockedParts.map((part) => (
                <div
                  key={part.id}
                  className="flex items-center gap-1 rounded-xl bg-slate-900/90 border border-yellow-400/60 px-2 py-0.5 text-[11px] font-extrabold text-white"
                >
                  <span className="text-base">{part.emoji}</span>
                  <span>{part.name}</span>
                </div>
              ))}
            </div>
          </div>
        ) : nextLockedPart ? (
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-slate-800/80 border border-amber-400/35 px-3 py-1.5 text-xs">
            <div className="flex items-center gap-2 font-bold text-slate-200">
              <span className="text-lg">{nextLockedPart.emoji}</span>
              <span>
                Next Part Unlock: <strong className="text-amber-300">{nextLockedPart.name}</strong>
              </span>
            </div>
            <span className="rounded-lg bg-amber-400/20 border border-amber-400/50 px-2 py-0.5 font-black text-amber-300">
              ⭐ {totalStars} / {nextLockedPart.unlockStars}
            </span>
          </div>
        ) : null}

        {/* ACTION BUTTONS */}
        <div className="grid grid-cols-2 gap-2">
          <button
            ref={primaryBtnRef}
            onClick={onFlyAgain}
            className="flex items-center justify-center gap-1.5 rounded-2xl bg-slate-800 hover:bg-slate-700 border-2 border-sky-400/60 py-2 sm:py-2.5 font-display text-xs sm:text-base font-black text-sky-200 shadow-lg active:scale-95 transition cursor-pointer"
            title="Play Again (Space / Enter)"
          >
            <RotateCcw className="h-4 w-4 sm:h-5 sm:w-5" />
            <span>
              {comp === 'soapbox'
                ? 'RACE AGAIN!'
                : comp === 'rollercoaster'
                ? 'RIDE AGAIN!'
                : 'FLY AGAIN!'}
            </span>
          </button>

          <button
            onClick={onBackToHangar}
            className="flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-500 border-2 border-white py-2 sm:py-2.5 font-display text-xs sm:text-base font-black text-slate-950 shadow-xl active:scale-95 transition cursor-pointer"
            title="Return to Hangar (B / Esc)"
          >
            <Wrench className="h-4 w-4 sm:h-5 sm:w-5" />
            <span>BUILD & UPGRADE!</span>
          </button>
        </div>
      </div>
    </div>
  );
});
