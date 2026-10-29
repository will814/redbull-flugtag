/**
 * Red Bull Tandem Bike Challenge (Game 4)
 * 3-Judge Animated Scorecard Modal & Star Progression
 * File: src/tandem/TandemScorecardModal.tsx
 */

import React, { useEffect, useMemo, useRef } from 'react';
import type { TandemScorecard, TandemSimState, TandemPart } from './types.ts';
import { COURSE_LENGTH_FT } from './TandemPhysicsEngine.ts';
import { soundEngine } from '../audio/SoundEngine.ts';
import {
  RotateCcw,
  Wrench,
  Trophy,
  Sparkles,
  ArrowRight,
  Star,
  Award,
} from 'lucide-react';

// ============================================================================
// 1. STAR COMPUTATION EXPORT (MANDATORY CONTRACT)
// ============================================================================

/**
 * Calculates Judge Stars earned based on 3-judge total score (3 to 30 points).
 * >= 26 points -> 3 Stars ⭐⭐⭐
 * >= 20 points -> 2 Stars ⭐⭐
 * Else (>= 1 point) -> 1 Star ⭐
 */
export function calculateTandemStars(totalScore: number): number {
  if (totalScore >= 26) return 3;
  if (totalScore >= 20) return 2;
  return 1;
}

// ============================================================================
// 2. PROPS CONTRACT
// ============================================================================

export interface TandemScorecardModalProps {
  scorecard: TandemScorecard;
  simState: TandemSimState;
  totalStars: number;
  bestDistanceFeet?: number;
  bestTimeSec?: number | null;
  newlyUnlockedParts?: TandemPart[];
  onRideAgain: () => void;
  onBackToWorkshop: () => void;
  onReturnToHub: () => void;
}

// ============================================================================
// 3. COMPONENT IMPLEMENTATION
// ============================================================================

export const TandemScorecardModal: React.FC<TandemScorecardModalProps> = React.memo(({
  scorecard,
  simState,
  totalStars,
  bestDistanceFeet = 0,
  bestTimeSec = null,
  newlyUnlockedParts = [],
  onRideAgain,
  onBackToWorkshop,
  onReturnToHub,
}) => {
  const primaryBtnRef = useRef<HTMLButtonElement | null>(null);

  const targetLengthFt = scorecard.courseLengthFt || simState.courseLengthFt || COURSE_LENGTH_FT;
  const completed = scorecard.completedCourse || simState.distanceFt >= targetLengthFt;
  const starsEarned = scorecard.starsEarned;
  const displayBestFeet = Math.max(bestDistanceFeet, Math.round(scorecard.distanceFt));

  // Keyboard navigation shortcuts
  useEffect(() => {
    primaryBtnRef.current?.focus();
    const mountedAt = performance.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyR') {
        if (e.repeat || performance.now() - mountedAt < 350) {
          e.preventDefault();
          return;
        }
        if (
          document.activeElement instanceof HTMLButtonElement &&
          document.activeElement !== primaryBtnRef.current &&
          e.code !== 'KeyR'
        ) {
          return;
        }
        e.preventDefault();
        soundEngine.playSnapPop();
        onRideAgain();
      } else if (e.code === 'Escape' || e.code === 'KeyB') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.repeat || performance.now() - mountedAt < 350) return;
        soundEngine.playSnapPop();
        onBackToWorkshop();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [onRideAgain, onBackToWorkshop]);

  // Judge Cards Data
  const judgeCards = useMemo(() => [
    {
      id: 1,
      name: 'Judge 1: Hans van der Pier',
      role: 'CREATIVITY & CRAFT DESIGN',
      score: scorecard.creativityScore,
      emoji: '🎨',
      critique:
        scorecard.creativityScore >= 9
          ? 'Sensational tandem theme! Supreme aerodynamic flair!'
          : scorecard.creativityScore >= 7
          ? 'Great custom build, vibrant colors and solid style.'
          : 'Standard workshop setup — needs bolder thematic parts!',
      bgColor: 'from-amber-500/10 to-amber-950/20 border-amber-500/30',
      accentColor: 'text-amber-400',
    },
    {
      id: 2,
      name: 'Judge 2: Chloe "Acrobat" Sterling',
      role: 'SHOWMANSHIP & CREW SYNC',
      score: scorecard.showmanshipScore,
      emoji: '⚡',
      critique:
        scorecard.showmanshipScore >= 9
          ? 'Incredible tandem sync! Captain & Stoker in pure harmony!'
          : scorecard.showmanshipScore >= 7
          ? 'Solid dock hype and clean rhythm through the obstacles.'
          : 'Pedal cadence desynced — Stoker lost the beat!',
      bgColor: 'from-sky-500/10 to-sky-950/20 border-sky-500/30',
      accentColor: 'text-sky-400',
    },
    {
      id: 3,
      name: 'Judge 3: Captain Dirk "Waterman"',
      role: 'DISTANCE & FINISH PACE',
      score: scorecard.distanceTimeScore,
      emoji: '⏱️',
      critique: completed
        ? scorecard.finishTimeSec && scorecard.finishTimeSec < 32
          ? 'Blistering canal marathon sprint! Elite pace across the pier!'
          : `Rang the canal bell! Clean pier navigation all ${targetLengthFt} FT.`
        : `Splashed at ${Math.round(scorecard.distanceFt)} FT! Canal water claimed the bike!`,
      bgColor: 'from-emerald-500/10 to-emerald-950/20 border-emerald-500/30',
      accentColor: 'text-emerald-400',
    },
  ], [scorecard, completed, targetLengthFt]);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/85 p-2 sm:p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tandem-scorecard-heading"
    >
      <div className="relative flex w-full max-w-xl flex-col gap-3 rounded-3xl bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-900 px-4 py-3.5 sm:p-6 border-4 border-amber-400 shadow-2xl max-h-[96dvh] overflow-y-auto no-scrollbar">
        {/* HEADER: Result Title & Stars Earned */}
        <div className="flex items-center justify-between gap-2 border-b border-white/15 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-amber-400 text-3xl shadow-lg ring-2 ring-amber-300">
              {completed ? '🔔' : '💦'}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id="tandem-scorecard-heading"
                  className="font-display text-xl sm:text-2xl font-black text-amber-300 leading-none"
                >
                  {completed
                    ? `COURSE CLEARED IN ${scorecard.finishTimeSec?.toFixed(1) ?? (simState.timeElapsedSec || 0).toFixed(1)}s!`
                    : `SPLASHDOWN AT ${Math.round(scorecard.distanceFt)} / ${targetLengthFt} FT!`}
                </h2>
                {scorecard.newDistanceRecord || scorecard.newTimeRecord ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400 px-2 py-0.5 text-[11px] font-black text-slate-950">
                    <Trophy className="h-3 w-3" /> NEW RECORD!
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-slate-800 border border-white/15 px-2 py-0.5 text-[11px] font-bold text-slate-300">
                    🏆 Best: {displayBestFeet} ft
                    {bestTimeSec !== null ? ` • ${bestTimeSec.toFixed(1)}s` : ''}
                  </span>
                )}
              </div>
              <div className="text-[11px] sm:text-xs font-extrabold text-sky-300 mt-1">
                {completed
                  ? `Golden Canal Bell Rung at ${targetLengthFt} FT${scorecard.courseName ? ` (${scorecard.courseName})` : ''}`
                  : `Over-Water Wipeout in Canal${scorecard.courseName ? ` (${scorecard.courseName})` : ''}`} • Peak Cadence:{' '}
                {Math.round(simState.cadenceRpm || 0)} RPM
              </div>
            </div>
          </div>

          {/* Star Award Badge */}
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5 rounded-2xl bg-amber-400/20 border-2 border-amber-400 px-3 py-1.5 shadow-inner">
              <div className="text-lg sm:text-2xl">
                {'⭐'.repeat(starsEarned)}
              </div>
              <span className="font-display text-sm sm:text-lg font-black text-amber-300">
                +{starsEarned}
              </span>
            </div>
            <span className="text-[11px] font-black text-amber-200/90">
              Score: {scorecard.totalScore} / 30
            </span>
          </div>
        </div>

        {/* 3-JUDGE SCORECARD GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {judgeCards.map((j) => (
            <div
              key={j.id}
              className={`flex flex-col justify-between rounded-2xl bg-gradient-to-b ${j.bgColor} border p-3 shadow-md`}
            >
              <div>
                <div className="flex items-center justify-between text-xs font-black text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <span>{j.emoji}</span>
                    <span className="truncate max-w-[120px]">{j.name.split(':')[0]}</span>
                  </span>
                  <span className={`text-base font-black ${j.accentColor}`}>
                    {j.score}<span className="text-xs text-slate-400">/10</span>
                  </span>
                </div>
                <div className="text-[9px] font-black tracking-wider text-slate-400 uppercase mt-0.5">
                  {j.role}
                </div>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-200 font-medium italic mt-2 leading-snug">
                "{j.critique}"
              </p>
            </div>
          ))}
        </div>

        {/* COACH'S POST-RUN TELEMETRY & TIP */}
        <div className="rounded-2xl bg-sky-950/50 border border-sky-500/30 px-3.5 py-2 text-[11px] text-sky-100 flex items-center gap-2.5">
          <span className="text-base shrink-0">{completed ? '🏁' : '🧭'}</span>
          <div className="leading-snug">
            <span className="font-black text-sky-300 uppercase tracking-wider mr-1.5">
              {completed ? 'Pro Speedrun Tip:' : 'Wipeout Telemetry:'}
            </span>
            {completed
              ? (scorecard.finishTimeSec ?? 99) < 32
                ? 'World-class pace! Try different mascot toppers in the Workshop to max out Judge 1 Creativity.'
                : 'Hold [Space] Sprint on the straightaways and equip high-wattage drivetrains to break the course par time!'
              : scorecard.distanceFt >= targetLengthFt - 95 && scorecard.distanceFt < targetLengthFt - 40
              ? 'Came up short on the Canal Gap Jump! Clearing the gap requires ~14+ MPH — hold [Space] Sprint approaching the takeoff ramp or equip a higher-wattage Drivetrain in the Workshop!'
              : Math.abs(simState.lateralOffsetFt || 0) >= 1.35
              ? 'Drifted off the narrow pier beam edge! Feather [A/←] and [D/→] to stay centered, especially through Water Cannon Alley.'
              : Math.abs(simState.rollAngleRad || 0) >= 0.45
              ? 'Tipped past the rollover threshold! Tap [Q] / [E] to counter-lean or equip wider Outriggers / Gyro in the Workshop.'
              : scorecard.distanceFt >= targetLengthFt * 0.45 && scorecard.distanceFt < targetLengthFt * 0.65
              ? 'Stalled on the +8.5° Seesaw Bridge! Keep pedaling [W/↑] up to the fulcrum pivot so gravity does not pull you backward.'
              : 'Tipped into the canal! Tap [Q] / [E] to counter-lean and feather [A/D] to keep your tires centered on the timber beam.'}
          </div>
        </div>

        {/* STAR PROGRESSION & UNLOCK STATUS */}
        <div className="flex items-center justify-between rounded-2xl bg-slate-950/70 border border-white/10 px-3.5 py-2">
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5 text-amber-400" />
            <div>
              <div className="text-xs font-black text-white">
                SHARED STAR POOL: <span className="text-amber-300">{totalStars} ⭐</span>
              </div>
              <div className="text-[10px] text-slate-400">
                Stars unlock advanced tandem frames, outriggers, slicks & mascots!
              </div>
            </div>
          </div>
          {starsEarned === 3 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 border border-amber-400/50 px-2.5 py-0.5 text-[10px] font-black text-amber-300">
              <Sparkles className="h-3 w-3" /> PERFECT RUN!
            </span>
          )}
        </div>

        {/* NEWLY UNLOCKED PARTS BANNER (IF ANY) */}
        {newlyUnlockedParts.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-2xl bg-emerald-950/40 border border-emerald-400/50 p-3">
            <div className="flex items-center gap-1.5 text-xs font-black text-emerald-300">
              <Sparkles className="h-4 w-4" />
              <span>NEW PARTS UNLOCKED IN WORKSHOP!</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {newlyUnlockedParts.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-1.5 rounded-xl bg-slate-900 border border-emerald-400/30 px-2.5 py-1 text-xs font-bold text-white shadow-sm"
                >
                  <span>{p.emoji || '🚲'}</span>
                  <span className="text-emerald-200">{p.name}</span>
                  <span className="text-[10px] text-slate-400">({p.category})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* UNIFIED ACTION BUTTONS ROW */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/10">
          <button
            ref={primaryBtnRef}
            type="button"
            onClick={() => {
              soundEngine.playSnapPop();
              onRideAgain();
            }}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 border-2 border-yellow-200 active:scale-95 px-3 py-2.5 font-display text-xs sm:text-sm font-black text-slate-950 shadow-xl transition cursor-pointer"
            title="Ride Again (Space / Enter / R)"
          >
            <RotateCcw className="h-4 w-4 stroke-[2.5]" />
            <span>RIDE AGAIN! [R / Space]</span>
          </button>

          <button
            type="button"
            onClick={() => {
              soundEngine.playSnapPop();
              onBackToWorkshop();
            }}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-95 border-2 border-sky-400/60 px-3 py-2.5 font-display text-xs sm:text-sm font-black text-white shadow-lg transition cursor-pointer"
            title="Return to Workshop (B / Esc)"
          >
            <Wrench className="h-4 w-4 text-sky-400" />
            <span>WORKSHOP [B / Esc]</span>
          </button>

          <button
            type="button"
            onClick={() => {
              soundEngine.playSnapPop();
              onReturnToHub();
            }}
            className="flex items-center justify-center gap-1 rounded-2xl bg-slate-900/90 hover:bg-slate-800 active:scale-95 border border-white/15 px-3 py-2.5 text-xs font-extrabold text-slate-300 hover:text-white transition cursor-pointer"
            title="Return to Arcade Hub"
          >
            <span>◀ Arcade Hub</span>
          </button>
        </div>
      </div>
    </div>
  );
});

export default TandemScorecardModal;
