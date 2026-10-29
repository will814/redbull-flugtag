import React, { useEffect, useMemo, useRef } from 'react';
import {
  SOAPBOX_COURSE_LENGTH_FEET,
  SOAPBOX_PART_CATALOG,
  SoapboxPart,
} from './SoapboxPartCatalog';
import { SoapboxSimulationState } from './SoapboxPhysicsEngine';
import {
  SoapboxCourseId,
  getSoapboxCourse,
} from './SoapboxCourses';
import { RotateCcw, Wrench, Trophy, Sparkles } from 'lucide-react';

interface SoapboxScorecardModalProps {
  selectedCourseId?: SoapboxCourseId;
  simState: SoapboxSimulationState;
  newlyUnlockedParts: SoapboxPart[];
  totalStars: number;
  bestRecordFeet: number;
  bestTimeSec: number | null;
  onRaceAgain: () => void;
  onBackToGarage: () => void;
  onReturnToHub: () => void;
}

export const SoapboxScorecardModal: React.FC<SoapboxScorecardModalProps> = React.memo(({
  selectedCourseId,
  simState,
  newlyUnlockedParts,
  totalStars,
  bestRecordFeet,
  bestTimeSec,
  onRaceAgain,
  onBackToGarage,
  onReturnToHub,
}) => {
  const scores = simState.judgeScores;
  const primaryBtnRef = useRef<HTMLButtonElement | null>(null);

  const activeCourse = useMemo(
    () => getSoapboxCourse(selectedCourseId || 'alpine_panorama'),
    [selectedCourseId]
  );
  const courseLength = simState.courseLengthFeet || activeCourse.lengthFeet || SOAPBOX_COURSE_LENGTH_FEET;
  const obstacleList = simState.obstacles?.length ? simState.obstacles : activeCourse.obstacles;
  const totalJumps = useMemo(
    () => Math.max(1, obstacleList.filter((o) => o.type === 'kicker_jump').length),
    [obstacleList]
  );
  const totalGates = useMemo(
    () => Math.max(1, obstacleList.filter((o) => o.type === 'speed_gate').length),
    [obstacleList]
  );

  const nextLockedPart = useMemo(() => {
    const locked = SOAPBOX_PART_CATALOG.filter(
      (p) => p.unlockStars > totalStars
    ).sort((a, b) => a.unlockStars - b.unlockStars);
    return locked[0] ?? null;
  }, [totalStars]);

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
        onRaceAgain();
      } else if (e.code === 'Escape' || e.code === 'KeyB') {
        e.preventDefault();
        if (e.repeat || performance.now() - mountedAt < 350) return;
        onBackToGarage();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onRaceAgain, onBackToGarage]);

  if (!scores) return null;

  const displayBestFeet = Math.max(bestRecordFeet, simState.distanceFeet);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/80 p-2 sm:p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="soapbox-scorecard-heading"
    >
      <div className="relative flex w-full max-w-xl flex-col gap-2.5 rounded-3xl bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-900 px-4 py-3 sm:p-5 border-4 border-amber-400 shadow-2xl max-h-[96dvh] overflow-y-auto no-scrollbar">
        {/* TOP HEADER: Distance / Finish Time + Stars Earned */}
        <div className="flex items-center justify-between gap-2 border-b border-white/15 pb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-11 w-11 sm:h-13 sm:w-13 items-center justify-center rounded-2xl bg-amber-400 text-2xl sm:text-3xl shadow-md">
              {simState.completedCourse ? '🏁' : simState.isRolledOver ? '💥' : '🏎️'}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <h2
                  id="soapbox-scorecard-heading"
                  className="font-display text-xl sm:text-2xl font-black text-amber-300 leading-none"
                >
                  {simState.completedCourse
                    ? `FINISHED IN ${simState.elapsedRaceTimeSec.toFixed(1)}s!`
                    : `${simState.distanceFeet} / ${courseLength.toLocaleString()} FT!`}
                </h2>
                {scores.newTimeRecord || scores.newDistanceRecord ? (
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
                {scores.runTitle} • Peak Speed: {Math.round(simState.maxSpeedMph)} MPH • Shove:{' '}
                {simState.pushShoveQuality.toUpperCase()}
              </div>
            </div>
          </div>

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
              Total: {scores.totalScore}/30
            </span>
          </div>
        </div>

        {/* COURSE IDENTITY BANNER */}
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-slate-950/80 border border-amber-400/50 px-3 py-1.5 text-xs font-bold text-slate-300">
          <div className="flex items-center gap-2">
            <span className="text-xl">{activeCourse.emoji}</span>
            <div>
              <span className="font-display font-black text-white">{activeCourse.name}</span>
              <span className="text-slate-400 text-[10px] ml-1.5">
                📉 -{activeCourse.dropFeet} ft drop • 📏 {activeCourse.lengthFeet.toLocaleString()} ft • ⏱️ Par {activeCourse.parTimeSec.toFixed(1)}s
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 text-amber-400 text-[11px]">
            <span>{'★'.repeat(activeCourse.difficultyStars)}{'☆'.repeat(5 - activeCourse.difficultyStars)}</span>
            <span className="text-slate-400 text-[10px] uppercase font-black">({activeCourse.difficultyLabel})</span>
          </div>
        </div>

        {/* CRASH / WRECK DIAGNOSTIC BANNER */}
        {(simState.isWrecked || simState.isRolledOver) && (
          <div className="flex flex-col gap-1 rounded-2xl bg-rose-950/80 border-2 border-rose-500 p-2.5 text-xs text-rose-200">
            <div className="flex items-center gap-2 font-black text-rose-300">
              <span className="text-base">💥</span>
              <span>
                CRASH DIAGNOSTIC: {simState.wreckReason || (simState.isRolledOver ? 'CRAFT ROLLED OVER ON APEX' : 'CRAFT WRECKED')}
              </span>
            </div>
            <div className="text-[11px] text-rose-300/80">
              Distance Reached: {simState.distanceFeet} ft • Lost {simState.lostParts.length} Parts along the mountain!
            </div>
          </div>
        )}

        {/* TELEMETRY SUMMARY STRIP */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 rounded-xl bg-slate-950/65 border border-white/10 px-3 py-1.5 text-[11px] font-extrabold">
          <span
            className={
              simState.isRolledOver
                ? 'text-rose-300'
                : simState.hayBalesHit === 0
                ? 'text-emerald-300'
                : 'text-amber-300'
            }
          >
            {simState.isRolledOver
              ? `💥 Rolled Over in ${simState.sectionName} (${simState.debris.length} Parts Detached!)`
              : simState.hayBalesHit === 0
              ? '🛞 Clean Racing Line — Zero Hay Bales Hit!'
              : `🌾 ${simState.hayBalesHit} Hay Bale(s) Smashed Along the Hill!`}
          </span>

          <div className="flex items-center gap-2 text-slate-300">
            <span>🦘 Jumps: {simState.jumpsCompleted}/{totalJumps}</span>
            <span>⚡ Gates: {simState.speedGatesCleared}/{totalGates}</span>
            <span className="text-purple-300">
              🌀 Style: {Math.round(simState.driftStylePoints)} pts
            </span>
          </div>
        </div>

        {/* PARTS INTEGRITY & DETACHMENT BREAKDOWN */}
        <div className="rounded-2xl bg-slate-950/70 border border-white/10 p-2.5 text-xs">
          <div className="flex items-center justify-between mb-1.5 font-black text-slate-300 text-[11px] uppercase tracking-wider">
            <span>Parts Integrity ({Object.values(simState.attachedParts).filter(Boolean).length}/6 Intact)</span>
            <span className={simState.lostParts.length > 0 ? 'text-amber-400' : 'text-emerald-400'}>
              {simState.lostParts.length > 0 ? `-${simState.lostParts.length} Parts Lost` : '100% Intact'}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[11px]">
            {(
              [
                { slot: 'wheel_fl', label: 'Front-Left Wheel' },
                { slot: 'wheel_fr', label: 'Front-Right Wheel' },
                { slot: 'wheel_rl', label: 'Rear-Left Wheel' },
                { slot: 'wheel_rr', label: 'Rear-Right Wheel' },
                { slot: 'bumper', label: 'Front Bumper' },
                { slot: 'topper', label: 'Roof Topper' },
              ] as const
            ).map(({ slot, label }) => {
              const intact = simState.attachedParts[slot];
              const lostInfo = simState.lostParts.find((lp) => lp.slot === slot);
              return (
                <div
                  key={slot}
                  className={`flex flex-col justify-between rounded-xl px-2 py-1 border ${
                    intact
                      ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                      : 'bg-rose-950/40 border-rose-500/50 text-rose-300'
                  }`}
                >
                  <div className="flex items-center justify-between font-black text-[10px]">
                    <span>{label}</span>
                    <span>{intact ? '✅ Intact' : '❌ Lost'}</span>
                  </div>
                  {lostInfo && (
                    <div className="text-[9px] text-rose-300/80 truncate">
                      At {Math.round(lostInfo.sFeet)} ft • {lostInfo.reason}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* DAMAGE PENALTY DEDUCTION BANNER */}
        {simState.lostParts.length > 0 && (
          <div className="flex items-center justify-between rounded-xl bg-rose-500/15 border border-rose-400/40 px-3 py-1.5 text-[11px] font-black text-rose-300">
            <span>⚠️ Judge Score Penalties (Lost Parts):</span>
            <span>
              -{simState.lostParts.reduce((acc, p) => acc + (p.slot.startsWith('wheel') ? 1.5 : p.slot === 'topper' ? 2.0 : 1.0), 0).toFixed(1)} PTS DEDUCTED
            </span>
          </div>
        )}

        {/* 3 CELEBRITY JUDGES' SCORECARDS */}
        <div className="grid grid-cols-3 gap-2">
          {/* Judge 1: Speed & Racing Line */}
          <div className="flex flex-col items-center justify-between rounded-2xl bg-slate-800/95 border-2 border-sky-400/60 p-2.5 text-center shadow-lg">
            <span className="text-xl sm:text-2xl">🏁</span>
            <span className="text-[11px] font-extrabold text-sky-300">
              SPEED &amp; LINE
            </span>
            <div className="my-1 flex h-10 w-15 items-center justify-center rounded-xl bg-white font-display text-xl font-black text-slate-950 shadow">
              {scores.speedJudge}
              <span className="text-[11px] text-slate-500">/10</span>
            </div>
            <span className="text-[10px] font-bold text-slate-300">
              {simState.completedCourse
                ? `${simState.elapsedRaceTimeSec.toFixed(1)}s Finish Time`
                : `${simState.distanceFeet} / ${courseLength.toLocaleString()} ft`}
            </span>
          </div>

          {/* Judge 2: Creativity & Craft Flair */}
          <div className="flex flex-col items-center justify-between rounded-2xl bg-slate-800/95 border-2 border-pink-400/60 p-2.5 text-center shadow-lg">
            <span className="text-xl sm:text-2xl">🎨</span>
            <span className="text-[11px] font-extrabold text-pink-300">
              CREATIVITY
            </span>
            <div className="my-1 flex h-10 w-15 items-center justify-center rounded-xl bg-white font-display text-xl font-black text-slate-950 shadow">
              {scores.creativityJudge}
              <span className="text-[11px] text-slate-500">/10</span>
            </div>
            <span className="text-[10px] font-bold text-slate-300">
              Soapbox Styling &amp; Topper Flair
            </span>
          </div>

          {/* Judge 3: Showmanship, Drifts & Jumps */}
          <div className="flex flex-col items-center justify-between rounded-2xl bg-slate-800/95 border-2 border-amber-400/60 p-2.5 text-center shadow-lg">
            <span className="text-xl sm:text-2xl">🌀</span>
            <span className="text-[11px] font-extrabold text-amber-300">
              SHOWMANSHIP
            </span>
            <div className="my-1 flex h-10 w-15 items-center justify-center rounded-xl bg-white font-display text-xl font-black text-slate-950 shadow">
              {scores.showmanshipJudge}
              <span className="text-[11px] text-slate-500">/10</span>
            </div>
            <span className="text-[10px] font-bold text-slate-300">
              Drifts, Jumps &amp; Push-Bar Shove
            </span>
          </div>
        </div>

        {/* NEWLY UNLOCKED SOAPBOX PARTS OR NEXT PROGRESSION GOAL */}
        {newlyUnlockedParts.length > 0 ? (
          <div className="rounded-2xl bg-gradient-to-r from-amber-500/25 via-yellow-500/20 to-emerald-500/25 border-2 border-amber-300 p-2.5">
            <div className="flex items-center gap-1.5 text-xs font-black text-amber-200 mb-1.5">
              <Sparkles className="h-4 w-4 text-yellow-300" />
              <span>NEW PARTS UNLOCKED IN WORKSHOP!</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {newlyUnlockedParts.map((part) => (
                <div
                  key={part.id}
                  className="flex items-center gap-1.5 rounded-xl bg-slate-900/90 border border-amber-400/50 px-2.5 py-1 text-xs font-extrabold text-white"
                >
                  <span>{part.emoji}</span>
                  <span>{part.name}</span>
                </div>
              ))}
            </div>
          </div>
        ) : nextLockedPart ? (
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-slate-950/70 border border-white/10 px-3 py-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-lg">{nextLockedPart.emoji}</span>
              <div>
                <div className="font-black text-slate-200">
                  Next Unlock: {nextLockedPart.name}
                </div>
                <div className="text-[10px] font-bold text-slate-400">
                  Requires {nextLockedPart.unlockStars} ⭐ (You have {totalStars} ⭐)
                </div>
              </div>
            </div>
            <span className="rounded-full bg-amber-400/20 border border-amber-400/40 px-2.5 py-0.5 text-[11px] font-black text-amber-300">
              {Math.max(0, nextLockedPart.unlockStars - totalStars)} ⭐ to go
            </span>
          </div>
        ) : null}

        {/* UNIFIED ACTION BUTTONS ROW */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            ref={primaryBtnRef}
            type="button"
            onClick={onRaceAgain}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 hover:from-amber-300 hover:to-red-400 border-2 border-yellow-200 px-3 py-2.5 font-display text-xs sm:text-sm font-black text-slate-950 shadow-xl transition hover:scale-102 active:scale-95 cursor-pointer"
            title="Race Again (Space / Enter / R)"
          >
            <RotateCcw className="h-4 w-4 stroke-[2.5]" />
            <span>RACE AGAIN! [R / Space]</span>
          </button>

          <button
            type="button"
            onClick={onBackToGarage}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-slate-800 hover:bg-slate-700 border-2 border-sky-400/60 px-3 py-2.5 font-display text-xs sm:text-sm font-black text-white shadow-lg transition active:scale-95 cursor-pointer"
            title="Return to Workshop (B / Esc)"
          >
            <Wrench className="h-4 w-4 text-sky-400" />
            <span>WORKSHOP [B / Esc]</span>
          </button>

          <button
            type="button"
            onClick={onReturnToHub}
            className="flex items-center justify-center gap-1 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-white/15 px-3 py-2.5 text-xs font-extrabold text-slate-300 hover:text-white transition active:scale-95 cursor-pointer"
            title="Return to Arcade Hub"
          >
            <span>◀ Arcade Hub</span>
          </button>
        </div>
      </div>
    </div>
  );
});
