import React, { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { CoasterPhysicsState } from './CoasterPhysicsEngine';
import { CoasterMetrics } from './CoasterMetrics';
import { soundEngine } from '../audio/SoundEngine';
import { RotateCcw, Wrench } from 'lucide-react';

export interface CoasterScorecardResult {
  distanceFeet: number;
  distancePoints: number;
  checkpointPoints: number;
  airtimePoints: number;
  stylePoints: number;
  bullseyeBonusPoints: number;
  totalThrillScore: number;
  starsEarned: number;
  isNewDistanceRecord: boolean;
  isNewScoreRecord: boolean;
}

export function computeCoasterScorecard(
  state: CoasterPhysicsState,
  metrics: CoasterMetrics,
  prevBestDistance: number,
  prevBestScore: number
): CoasterScorecardResult {
  const distanceFeet = Math.round(state.maxDistanceFeet);
  const distancePoints = Math.round(distanceFeet * 0.45);
  const checkpointPoints = state.checkpoints.reduce((sum, c) => sum + c.points, 0);
  const airtimePoints = Math.round(state.airtimeSeconds * 85);
  const stylePoints = Math.round(metrics.thrillScore * 2.2);
  const bullseyeBonusPoints = state.stoppedInBullseye
    ? 250 + Math.round(state.bullseyePrecisionPct * 2.5)
    : 0;

  const totalThrillScore =
    distancePoints +
    checkpointPoints +
    airtimePoints +
    stylePoints +
    bullseyeBonusPoints;

  let starsEarned = 1;
  if (totalThrillScore >= 1850 || state.stoppedInBullseye) {
    starsEarned = 5;
  } else if (totalThrillScore >= 1400 || state.gapJumpCleared) {
    starsEarned = 4;
  } else if (totalThrillScore >= 950 || state.helixCleared) {
    starsEarned = 3;
  } else if (totalThrillScore >= 550 || state.loopCleared) {
    starsEarned = 2;
  }

  return {
    distanceFeet,
    distancePoints,
    checkpointPoints,
    airtimePoints,
    stylePoints,
    bullseyeBonusPoints,
    totalThrillScore,
    starsEarned,
    isNewDistanceRecord: distanceFeet > prevBestDistance,
    isNewScoreRecord: totalThrillScore > prevBestScore,
  };
}

export interface CoasterScorecardModalProps {
  finalState: CoasterPhysicsState;
  metrics: CoasterMetrics;
  scorecard: CoasterScorecardResult;
  onRideAgain: () => void;
  onReturnToWorkshop: () => void;
  onReturnToHub?: () => void;
}

export const CoasterScorecardModal: React.FC<CoasterScorecardModalProps> = ({
  finalState,
  scorecard,
  onRideAgain,
  onReturnToWorkshop,
  onReturnToHub,
}) => {
  const primaryBtnRef = useRef<HTMLButtonElement | null>(null);
  const isSuccess =
    finalState.stoppedInBullseye ||
    finalState.outcomeReason === 'brake_run_stop' ||
    finalState.gapJumpCleared;

  useEffect(() => {
    if (finalState.stoppedInBullseye || scorecard.starsEarned >= 4) {
      soundEngine.playUnlockFanfare();
      confetti({
        particleCount: 85,
        spread: 72,
        origin: { y: 0.6 },
      });
    }
  }, [finalState.stoppedInBullseye, scorecard.starsEarned]);

  useEffect(() => {
    primaryBtnRef.current?.focus();
    const mountedAt = performance.now();

    const onKeyDown = (e: KeyboardEvent) => {
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
        e.stopPropagation();
        e.stopImmediatePropagation();
        soundEngine.playAirhorn();
        onRideAgain();
      } else if (e.code === 'KeyB' || e.code === 'Escape') {
        if (e.repeat || performance.now() - mountedAt < 350) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        soundEngine.playSnapPop();
        onReturnToWorkshop();
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [onReturnToWorkshop, onRideAgain]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="coaster-scorecard-heading"
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 select-none overflow-y-auto"
    >
      <div className="bg-slate-900 border-4 border-sky-400 rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl flex flex-col gap-4">
        {/* Outcome Header */}
        <div className="flex flex-col items-center text-center gap-1.5">
          <div className="flex items-center gap-2">
            {scorecard.isNewDistanceRecord && (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[11px] font-black uppercase">
                🏆 NEW DISTANCE RECORD!
              </span>
            )}
            {scorecard.isNewScoreRecord && (
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-400 text-slate-950 text-[11px] font-black uppercase">
                🔥 NEW HIGH THRILL SCORE!
              </span>
            )}
          </div>

          <h2
            className={`font-display text-xl sm:text-2xl font-black uppercase tracking-tight ${
              finalState.stoppedInBullseye
                ? 'text-emerald-300'
                : isSuccess
                ? 'text-sky-300'
                : 'text-rose-400'
            }`}
          >
            {finalState.outcomeTitle || 'RIDE COMPLETE!'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-md leading-snug">
            {finalState.outcomeSubtitle}
          </p>
        </div>

        {/* Big Distance, Peak Speed & Total Score Cards */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3 text-center">
            <div className="text-[10px] font-bold uppercase text-slate-400">Track Distance</div>
            <div className="text-xl sm:text-2xl font-black text-amber-300 font-mono mt-0.5">
              {scorecard.distanceFeet} <span className="text-xs">FT</span>
            </div>
          </div>

          <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3 text-center">
            <div className="text-[10px] font-bold uppercase text-slate-400">Peak Speed</div>
            <div className="text-xl sm:text-2xl font-black text-sky-300 font-mono mt-0.5">
              {Math.round(finalState.peakSpeedMph)} <span className="text-xs">MPH</span>
            </div>
          </div>

          <div className="bg-slate-950/90 border border-emerald-500/40 rounded-2xl p-3 text-center">
            <div className="text-[10px] font-bold uppercase text-emerald-300">Thrill Score</div>
            <div className="text-xl sm:text-2xl font-black text-emerald-400 font-mono mt-0.5">
              {scorecard.totalThrillScore}
            </div>
          </div>
        </div>

        {/* G-Force & Airtime Engineering Summary */}
        <div className="grid grid-cols-3 gap-2 bg-slate-950/70 border border-slate-800 rounded-2xl p-3 text-xs">
          <div className="flex flex-col items-center">
            <span className="text-slate-400 font-semibold">Peak Positive G</span>
            <span className="text-emerald-300 font-mono font-black text-sm">
              +{finalState.peakPositiveG.toFixed(1)}G
            </span>
          </div>
          <div className="flex flex-col items-center border-x border-slate-800">
            <span className="text-slate-400 font-semibold">Peak Negative G</span>
            <span className="text-cyan-300 font-mono font-black text-sm">
              {finalState.peakNegativeG.toFixed(1)}G
            </span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-slate-400 font-semibold">Ejector Airtime</span>
            <span className="text-amber-300 font-mono font-black text-sm">
              {finalState.airtimeSeconds.toFixed(2)}s
            </span>
          </div>
        </div>

        {/* Score Breakdown Table */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 flex flex-col gap-1.5 text-xs">
          <div className="flex items-center justify-between text-slate-300">
            <span>🎢 Track Distance ({scorecard.distanceFeet} ft)</span>
            <span className="font-mono font-bold text-white">+{scorecard.distancePoints} pts</span>
          </div>
          <div className="flex items-center justify-between text-slate-300">
            <span>
              🏁 Elements Cleared ({finalState.checkpoints.length} checkpoints)
            </span>
            <span className="font-mono font-bold text-sky-300">
              +{scorecard.checkpointPoints} pts
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-300">
            <span>⛰️ Zero-G &amp; Ejector Airtime ({finalState.airtimeSeconds.toFixed(1)}s)</span>
            <span className="font-mono font-bold text-cyan-300">
              +{scorecard.airtimePoints} pts
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-300">
            <span>🦮 Coaster Car Showmanship &amp; Style</span>
            <span className="font-mono font-bold text-fuchsia-300">
              +{scorecard.stylePoints} pts
            </span>
          </div>
          {scorecard.bullseyeBonusPoints > 0 && (
            <div className="flex items-center justify-between text-emerald-300 font-bold pt-1 border-t border-slate-800">
              <span>
                🎯 Golden Bullseye Stop Bonus ({finalState.bullseyePrecisionPct}% Accuracy!)
              </span>
              <span className="font-mono font-black">+{scorecard.bullseyeBonusPoints} pts</span>
            </div>
          )}
        </div>

        {/* Stars Earned Banner */}
        <div className="flex items-center justify-between bg-amber-500/15 border border-amber-400/50 rounded-2xl px-4 py-2.5">
          <span className="text-xs sm:text-sm font-black text-amber-200 uppercase">
            Engineering Reward Earned:
          </span>
          <span className="text-lg sm:text-xl font-black text-yellow-300">
            +{scorecard.starsEarned} ⭐
          </span>
        </div>

        {/* UNIFIED ACTION BUTTONS ROW */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            ref={primaryBtnRef}
            type="button"
            onClick={() => {
              soundEngine.playAirhorn();
              onRideAgain();
            }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-2xl bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-500 border-2 border-white text-slate-950 font-display font-black text-xs sm:text-sm shadow-xl active:scale-95 transition cursor-pointer"
            title="Ride Again (Space / Enter / R)"
          >
            <RotateCcw className="h-4 w-4 stroke-[2.5]" />
            <span>RIDE AGAIN! [R / Space]</span>
          </button>

          <button
            type="button"
            onClick={() => {
              soundEngine.playSnapPop();
              onReturnToWorkshop();
            }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-2xl bg-slate-800 hover:bg-slate-700 border-2 border-sky-400/60 text-white font-display font-black text-xs sm:text-sm shadow-lg active:scale-95 transition cursor-pointer"
            title="Return to Workshop (B / Esc)"
          >
            <Wrench className="h-4 w-4 text-sky-400" />
            <span>WORKSHOP [B / Esc]</span>
          </button>

          {onReturnToHub && (
            <button
              type="button"
              onClick={() => {
                soundEngine.playSnapPop();
                onReturnToHub();
              }}
              className="flex items-center justify-center gap-1 py-2.5 px-3 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-white/15 text-slate-300 hover:text-white font-extrabold text-xs active:scale-95 transition cursor-pointer"
              title="Return to Arcade Hub"
            >
              <span>◀ Arcade Hub</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
