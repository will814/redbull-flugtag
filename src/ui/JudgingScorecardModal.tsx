import React from 'react';
import { CraftPart } from '../builder/PartCatalog';
import { FlightSimulationState } from '../physics/AeroPhysicsEngine';
import { RotateCcw, Wrench, Trophy, Sparkles } from 'lucide-react';

interface JudgingScorecardModalProps {
  flightState: FlightSimulationState;
  newlyUnlockedParts: CraftPart[];
  onFlyAgain: () => void;
  onBackToHangar: () => void;
}

export const JudgingScorecardModal: React.FC<JudgingScorecardModalProps> = ({
  flightState,
  newlyUnlockedParts,
  onFlyAgain,
  onBackToHangar,
}) => {
  const scores = flightState.judgeScores;
  if (!scores) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/75 p-1.5 sm:p-3 backdrop-blur-sm">
      <div className="relative flex w-full max-w-xl flex-col gap-2 rounded-3xl bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-900 px-3.5 py-2.5 sm:p-5 border-4 border-yellow-400 shadow-2xl max-h-[96vh] overflow-y-auto no-scrollbar">
        {/* TOP HEADER: Distance & Splash Badge */}
        <div className="flex items-center justify-between gap-2 border-b border-white/15 pb-1.5">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-yellow-400 text-xl sm:text-3xl shadow-md">
              💦
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-xl sm:text-3xl font-black text-yellow-300 leading-none">
                  {flightState.distanceFeet} FEET!
                </span>
                {scores.newRecord && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400 px-2 py-0.5 text-[11px] font-black text-slate-950">
                    <Trophy className="h-3 w-3" /> NEW BEST!
                  </span>
                )}
              </div>
              <div className="text-[11px] sm:text-xs font-extrabold text-sky-300 mt-0.5">
                {scores.beatWorldRecord
                  ? '👑 YOU BEAT THE 258 FT WORLD RECORD!!'
                  : `${scores.splashRating} • Trolley Drop: ${flightState.trolleyReleaseQuality.toUpperCase()}`}
              </div>
            </div>
          </div>

          {/* Stars Earned */}
          <div className="flex items-center gap-1 rounded-2xl bg-amber-400/20 border-2 border-amber-400 px-2.5 py-1">
            <div className="text-base sm:text-2xl">
              {'⭐'.repeat(scores.starsEarned)}
            </div>
            <span className="font-display text-xs sm:text-base font-black text-amber-300">
              +{scores.starsEarned}
            </span>
          </div>
        </div>

        {/* THE 3 CELEBRITY JUDGES' SCORECARDS */}
        <div className="grid grid-cols-3 gap-2">
          {/* Judge 1: Distance */}
          <div className="flex items-center justify-between sm:flex-col sm:justify-center rounded-2xl bg-slate-800/90 border-2 border-sky-400/60 px-2.5 py-1.5 sm:p-2.5 text-center shadow-lg">
            <div className="flex flex-col items-center">
              <span className="text-xl sm:text-2xl">🧑‍✈️</span>
              <span className="text-[10px] sm:text-xs font-extrabold text-sky-300">
                DISTANCE
              </span>
            </div>
            <div className="flex h-9 w-12 sm:mt-1 sm:h-11 sm:w-15 items-center justify-center rounded-xl bg-white font-display text-lg sm:text-2xl font-black text-slate-950 shadow">
              {scores.distanceJudge}
              <span className="text-[10px] text-slate-500">/10</span>
            </div>
          </div>

          {/* Judge 2: Creativity */}
          <div className="flex items-center justify-between sm:flex-col sm:justify-center rounded-2xl bg-slate-800/90 border-2 border-pink-400/60 px-2.5 py-1.5 sm:p-2.5 text-center shadow-lg">
            <div className="flex flex-col items-center">
              <span className="text-xl sm:text-2xl">👨‍🍳</span>
              <span className="text-[10px] sm:text-xs font-extrabold text-pink-300">
                CREATIVITY
              </span>
            </div>
            <div className="flex h-9 w-12 sm:mt-1 sm:h-11 sm:w-15 items-center justify-center rounded-xl bg-white font-display text-lg sm:text-2xl font-black text-slate-950 shadow">
              {scores.creativityJudge}
              <span className="text-[10px] text-slate-500">/10</span>
            </div>
          </div>

          {/* Judge 3: Showmanship */}
          <div className="flex items-center justify-between sm:flex-col sm:justify-center rounded-2xl bg-slate-800/90 border-2 border-amber-400/60 px-2.5 py-1.5 sm:p-2.5 text-center shadow-lg">
            <div className="flex flex-col items-center">
              <span className="text-xl sm:text-2xl">🎧</span>
              <span className="text-[10px] sm:text-xs font-extrabold text-amber-300">
                SHOWMANSHIP
              </span>
            </div>
            <div className="flex h-9 w-12 sm:mt-1 sm:h-11 sm:w-15 items-center justify-center rounded-xl bg-white font-display text-lg sm:text-2xl font-black text-slate-950 shadow">
              {scores.showmanshipJudge}
              <span className="text-[10px] text-slate-500">/10</span>
            </div>
          </div>
        </div>

        {/* NEWLY UNLOCKED PARTS BANNER */}
        {newlyUnlockedParts.length > 0 && (
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
        )}

        {/* ACTION BUTTONS */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onFlyAgain}
            className="flex items-center justify-center gap-1.5 rounded-2xl bg-slate-800 hover:bg-slate-700 border-2 border-sky-400/60 py-2 sm:py-2.5 font-display text-xs sm:text-base font-black text-sky-200 shadow-lg active:scale-95 transition cursor-pointer"
          >
            <RotateCcw className="h-4 w-4 sm:h-5 sm:w-5" />
            <span>FLY AGAIN!</span>
          </button>

          <button
            onClick={onBackToHangar}
            className="flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-500 border-2 border-white py-2 sm:py-2.5 font-display text-xs sm:text-base font-black text-slate-950 shadow-xl active:scale-95 transition cursor-pointer"
          >
            <Wrench className="h-4 w-4 sm:h-5 sm:w-5" />
            <span>BUILD & UPGRADE!</span>
          </button>
        </div>
      </div>
    </div>
  );
};
