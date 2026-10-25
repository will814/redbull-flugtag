import React, { useEffect } from 'react';
import { FlightSimulationState } from '../physics/AeroPhysicsEngine';
import { RAMP_LENGTH_FEET, WORLD_RECORD_FEET } from '../builder/PartCatalog';
import { Wrench, RotateCcw, ArrowUp, ArrowDown } from 'lucide-react';

interface FlightHUDProps {
  flightState: FlightSimulationState;
  bestDistanceFeet: number;
  onActionTap: () => void;
  onSkipSkitToPush: () => void;
  onPitchInputChange: (val: number) => void;
  onReturnToHangar: () => void;
  onRestartFlight: () => void;
}

export const FlightHUD: React.FC<FlightHUDProps> = ({
  flightState,
  bestDistanceFeet,
  onActionTap,
  onSkipSkitToPush,
  onPitchInputChange,
  onReturnToHangar,
  onRestartFlight,
}) => {
  // Chromebook / Keyboard Support: Spacebar = Action Tap, Up/Down or W/S = Pitch Control
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        onActionTap();
      } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        onPitchInputChange(1);
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
        onPitchInputChange(-1);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (
        e.code === 'ArrowUp' ||
        e.code === 'KeyW' ||
        e.code === 'ArrowDown' ||
        e.code === 'KeyS'
      ) {
        e.preventDefault();
        onPitchInputChange(0);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [onActionTap, onPitchInputChange]);

  // Compute progress along the 90-foot ramp (0% at -90ft, 100% at 0ft edge)
  const rampProgressPct = Math.max(
    0,
    Math.min(100, ((flightState.xFeet + RAMP_LENGTH_FEET) / RAMP_LENGTH_FEET) * 100)
  );

  // Distance progress bar toward 258 ft World Record
  const distancePct = Math.min(100, (flightState.distanceFeet / WORLD_RECORD_FEET) * 100);

  // Map pitchDeg (-28 deg to +35 deg) to 6%..94% vertical position on the Pitch Level Guide Gauge
  // Note: Sweet spot (-5.5 deg to +12.5 deg) maps cleanly to 36%..66% (the middle green band!)
  const clampedPitch = Math.max(-28, Math.min(35, flightState.pitchDeg));
  const pitchGaugePct = Math.round(((clampedPitch + 28) / 63) * 86 + 7);

  const pitchZoneStyle =
    flightState.pitchZone === 'too_high'
      ? {
          border: 'border-rose-400 shadow-rose-500/40',
          badgeBg: 'bg-rose-600 text-white',
          badgeText: 'TOO HIGH! ⬇️',
        }
      : flightState.pitchZone === 'too_low'
      ? {
          border: 'border-amber-400 shadow-amber-500/40',
          badgeBg: 'bg-amber-500 text-slate-950',
          badgeText: 'TOO LOW! ⬆️',
        }
      : {
          border: 'border-emerald-400 shadow-emerald-500/30',
          badgeBg: 'bg-emerald-400 text-slate-950',
          badgeText: 'SWEET SPOT! ✨',
        };

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-2 sm:p-3">
      {/* TOP BAR: Back to Hangar, Distance Counter & World Record Progress */}
      <div className="pointer-events-auto flex items-center justify-between gap-2 rounded-2xl bg-slate-900/85 px-3 py-1.5 backdrop-blur-md border border-white/15 shadow-xl">
        {/* Left: Hangar & Retry Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onReturnToHangar}
            className="flex items-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/15 px-3 py-1.5 text-xs sm:text-sm font-extrabold text-white active:scale-95 transition cursor-pointer"
          >
            <Wrench className="h-4 w-4 text-amber-400" />
            <span>Build</span>
          </button>

          <button
            onClick={onRestartFlight}
            className="flex items-center gap-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/15 px-2.5 py-1.5 text-xs sm:text-sm font-extrabold text-sky-300 active:scale-95 transition cursor-pointer"
            title="Restart Launch"
          >
            <RotateCcw className="h-4 w-4" />
            <span className="hidden sm:inline">Retry</span>
          </button>
        </div>

        {/* Center: Live Flight Distance & World Record Tape */}
        <div className="flex flex-1 max-w-md flex-col items-center px-2">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-2xl sm:text-3xl font-black text-yellow-300 drop-shadow">
              {flightState.distanceFeet} FT
            </span>
            <span className="text-[11px] sm:text-xs font-extrabold text-sky-200">
              (Best: {bestDistanceFeet} ft • Record: {WORLD_RECORD_FEET} ft)
            </span>
          </div>

          <div className="relative mt-0.5 h-2.5 w-full rounded-full bg-slate-800 border border-white/15 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-sky-400 via-emerald-400 to-yellow-400 transition-all duration-75"
              style={{ width: `${distancePct}%` }}
            />
          </div>
        </div>

        {/* Right: Speed & Thermal Rings Caught */}
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-amber-500/20 border border-amber-400/40 px-2.5 py-1 text-xs sm:text-sm font-black text-amber-300">
            ⭕ {flightState.thermalsCollected}/3
          </div>
          <div className="hidden sm:block rounded-xl bg-sky-500/20 border border-sky-400/30 px-2.5 py-1 text-xs font-black text-sky-200">
            💨 {Math.round(flightState.vxFeet)} ft/s
          </div>
        </div>
      </div>

      {/* CENTER-TOP PHASE BANNER (Skit Hype / Ramp Drop Zone / Airborne Glide Sweet Spot) */}
      <div className="pointer-events-none flex flex-col items-center">
        {flightState.phase === 'skit' && (
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-slate-900/90 border-2 border-pink-400 px-4 py-2 shadow-2xl">
            <div className="text-left">
              <div className="font-display text-sm sm:text-base font-black text-pink-300">
                🕺 CREW DANCE SKIT! Tap HYPE to Impress the Judges!
              </div>
              <div className="mt-1 h-3 w-48 sm:w-64 rounded-full bg-slate-800 overflow-hidden border border-white/20">
                <div
                  className="h-full bg-gradient-to-r from-pink-500 via-amber-400 to-emerald-400 transition-all duration-100"
                  style={{ width: `${flightState.hypeMeter}%` }}
                />
              </div>
            </div>
            <button
              onClick={onSkipSkitToPush}
              className="rounded-xl bg-emerald-500 hover:bg-emerald-400 px-3 py-1.5 text-xs sm:text-sm font-black text-slate-950 shadow active:scale-95 cursor-pointer"
            >
              PUSH NOW! ▶
            </button>
          </div>
        )}

        {flightState.phase === 'ramp_push' && (
          <div className="flex flex-col items-center gap-1 rounded-2xl bg-slate-900/90 border-2 border-amber-400 px-4 py-2 shadow-2xl w-72 sm:w-96">
            <div className="flex w-full justify-between text-xs sm:text-sm font-black">
              <span className="text-amber-300">
                {flightState.inTrolleyDropZone
                  ? '🟢 DROP WHEELS NOW!!'
                  : flightState.trolleyDetached
                  ? '✨ WHEELS DROPPED! READY FOR LIFTOFF!'
                  : '👟 SPRINT DOWN THE 30-FT RAMP!'}
              </span>
              <span className="text-sky-300">Speed: {flightState.pushMeter}%</span>
            </div>

            {/* Visual Ramp Runway Progress Bar with Green Trolley Drop Zone */}
            <div className="relative h-4 w-full rounded-full bg-slate-800 border border-white/25 overflow-hidden">
              <div
                className="absolute right-0 top-0 bottom-0 bg-emerald-500/45 border-l-2 border-emerald-300"
                style={{ width: '25%' }}
              />
              <div
                className="h-full bg-gradient-to-r from-orange-500 to-yellow-300 transition-all duration-75"
                style={{ width: `${rampProgressPct}%` }}
              />
            </div>
          </div>
        )}

        {flightState.phase === 'airborne' && (
          <div className="flex flex-col items-center gap-1">
            <div
              className={`rounded-2xl px-4 py-1.5 border-2 font-display text-xs sm:text-base font-black shadow-xl transition ${
                flightState.pitchZone === 'too_high'
                  ? 'bg-rose-600/95 border-rose-200 text-white animate-bounce'
                  : flightState.pitchZone === 'too_low'
                  ? 'bg-amber-500/95 border-yellow-200 text-slate-950 animate-bounce'
                  : 'bg-emerald-500/90 border-emerald-200 text-slate-950'
              }`}
            >
              {flightState.pitchZone === 'too_high'
                ? '⚠️ PITCH TOO HIGH! Losing Speed & Sinking — Hold NOSE DOWN ⬇️'
                : flightState.pitchZone === 'too_low'
                ? '⚠️ PITCH TOO LOW! Nose-Diving into Water — Hold NOSE UP ⬆️'
                : '🎯 BALANCED IN THE GREEN ZONE! Maximum Glide!'}
            </div>

            {flightState.windGustWarning !== 'calm' && (
              <div className="rounded-xl bg-sky-400/95 border border-white px-3 py-0.5 text-[11px] sm:text-xs font-black text-slate-950 shadow">
                {flightState.windGustWarning === 'headwind_gust'
                  ? '🌬️ SEA BREEZE GUST! Hold NOSE DOWN ⬇️ to stay in the Green!'
                  : '🌊 BAY DOWNDRAFT! Hold NOSE UP ⬆️ to stay in the Green!'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* BOTTOM 2-ACTION THUMB CONTROLS + LIVE PITCH LEVEL GUIDE */}
      <div className="pointer-events-none flex items-end justify-between gap-2 pb-1">
        {/* LEFT THUMB: NOSE UP / NOSE DOWN + LIVE PITCH LEVEL GUIDE GAUGE */}
        <div className="pointer-events-auto flex items-end gap-2 sm:gap-2.5">
          {/* Pitch Up / Down Thumb Buttons */}
          <div className="flex flex-col gap-1.5">
            <button
              onPointerDown={() => onPitchInputChange(1)}
              onPointerUp={() => onPitchInputChange(0)}
              onPointerLeave={() => onPitchInputChange(0)}
              onPointerCancel={() => onPitchInputChange(0)}
              className={`flex h-14 w-28 sm:h-16 sm:w-36 items-center justify-center gap-1.5 rounded-2xl border-2 font-display text-sm sm:text-base font-black shadow-xl transition select-none cursor-pointer ${
                flightState.pilotPitchInput > 0
                  ? 'bg-sky-400 text-slate-950 border-white scale-95'
                  : 'bg-slate-900/90 text-sky-300 border-sky-400/60 hover:bg-slate-800'
              }`}
            >
              <ArrowUp className="h-5 w-5 sm:h-6 sm:w-6 stroke-[3]" />
              <span>NOSE UP</span>
            </button>

            <button
              onPointerDown={() => onPitchInputChange(-1)}
              onPointerUp={() => onPitchInputChange(0)}
              onPointerLeave={() => onPitchInputChange(0)}
              onPointerCancel={() => onPitchInputChange(0)}
              className={`flex h-14 w-28 sm:h-16 sm:w-36 items-center justify-center gap-1.5 rounded-2xl border-2 font-display text-sm sm:text-base font-black shadow-xl transition select-none cursor-pointer ${
                flightState.pilotPitchInput < 0
                  ? 'bg-amber-400 text-slate-950 border-white scale-95'
                  : 'bg-slate-900/90 text-amber-300 border-amber-400/60 hover:bg-slate-800'
              }`}
            >
              <ArrowDown className="h-5 w-5 sm:h-6 sm:w-6 stroke-[3]" />
              <span>NOSE DOWN</span>
            </button>
          </div>

          {/* VISUAL PITCH LEVEL GUIDE GAUGE (Keep the Glider in the Green!) */}
          <div className="flex flex-col items-center gap-1">
            <div
              className={`rounded-lg px-2 py-0.5 text-[10px] sm:text-[11px] font-black shadow ${pitchZoneStyle.badgeBg}`}
            >
              {pitchZoneStyle.badgeText}
            </div>

            <div
              className={`relative flex h-28 w-14 sm:h-34 sm:w-16 flex-col overflow-hidden rounded-2xl bg-slate-950/90 border-2 shadow-2xl ${pitchZoneStyle.border}`}
              title="Pitch Level Guide — Keep the plane inside the middle GREEN Sweet Spot!"
            >
              {/* Top Red Zone: Pitch Too High (> +12.5 deg) */}
              <div className="flex h-[34%] w-full flex-col items-center justify-start bg-rose-500/35 pt-1 border-b border-rose-400/70">
                <span className="text-[9px] font-black text-rose-200 tracking-tighter">
                  HIGH ⚠️
                </span>
              </div>

              {/* Middle Emerald Green Sweet Spot Zone (-5.5 to +12.5 deg) */}
              <div className="relative flex h-[30%] w-full items-center justify-center bg-emerald-500/40 border-y border-emerald-300">
                <div className="w-full border-t border-dashed border-emerald-200/80" />
                <span className="absolute text-[9px] font-black text-emerald-100 bg-emerald-900/70 px-1 rounded">
                  OK!
                </span>
              </div>

              {/* Bottom Amber/Red Zone: Pitch Too Low (< -5.5 deg) */}
              <div className="flex h-[36%] w-full flex-col items-center justify-end bg-amber-500/35 pb-1 border-t border-amber-400/70">
                <span className="text-[9px] font-black text-amber-200 tracking-tighter">
                  LOW ⚠️
                </span>
              </div>

              {/* Live Moving & Tilting Craft Pitch Indicator */}
              <div
                className="absolute left-1 right-1 flex items-center justify-center transition-all duration-75"
                style={{
                  bottom: `calc(${pitchGaugePct}% - 12px)`,
                }}
              >
                <div className="flex w-full items-center justify-between rounded-lg bg-white px-1 py-0.5 shadow-md border border-slate-900">
                  <span
                    className="text-xs sm:text-sm leading-none inline-block transition-transform duration-75"
                    style={{ transform: `rotate(${-flightState.pitchDeg}deg)` }}
                  >
                    ✈️
                  </span>
                  <span className="text-[9px] sm:text-[10px] font-black text-slate-950">
                    {flightState.pitchDeg > 0 ? `+${Math.round(flightState.pitchDeg)}` : Math.round(flightState.pitchDeg)}°
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT THUMB: PRIMARY ACTION BUTTON (HYPE DANCE -> PUSH -> DROP WHEELS!) */}
        <div className="pointer-events-auto">
          {flightState.phase === 'skit' && (
            <button
              onPointerDown={onActionTap}
              className="animate-pulse-glow flex h-24 w-36 sm:h-28 sm:w-44 flex-col items-center justify-center rounded-3xl bg-gradient-to-br from-pink-500 via-rose-500 to-amber-400 border-4 border-white font-display text-white shadow-2xl active:scale-90 transition cursor-pointer"
            >
              <span className="text-2xl sm:text-3xl">🎉</span>
              <span className="text-base sm:text-lg font-black tracking-wide">HYPE DANCE!</span>
              <span className="text-[11px] font-bold opacity-90">TAP FAST!</span>
            </button>
          )}

          {flightState.phase === 'ramp_push' && !flightState.inTrolleyDropZone && (
            <button
              onPointerDown={onActionTap}
              className="animate-pulse-glow flex h-24 w-36 sm:h-28 sm:w-44 flex-col items-center justify-center rounded-3xl bg-gradient-to-br from-amber-400 via-orange-500 to-red-600 border-4 border-yellow-200 font-display text-slate-950 shadow-2xl active:scale-90 transition cursor-pointer"
            >
              <span className="text-2xl sm:text-3xl">👟</span>
              <span className="text-base sm:text-xl font-black tracking-wide">PUSH!!</span>
              <span className="text-[11px] font-extrabold">TAP OR SPACE!</span>
            </button>
          )}

          {flightState.phase === 'ramp_push' && flightState.inTrolleyDropZone && (
            <button
              onPointerDown={onActionTap}
              className="animate-bounce flex h-28 w-40 sm:h-32 sm:w-48 flex-col items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-400 via-green-500 to-teal-500 border-4 border-white font-display text-slate-950 shadow-2xl active:scale-90 transition cursor-pointer"
            >
              <span className="text-2xl sm:text-3xl">🛹</span>
              <span className="text-base sm:text-xl font-black tracking-wide">DROP WHEELS!</span>
              <span className="text-xs font-extrabold">TAP NOW!</span>
            </button>
          )}

          {flightState.phase === 'airborne' && (
            <button
              onPointerDown={onActionTap}
              className="flex h-20 w-32 sm:h-24 sm:w-36 flex-col items-center justify-center rounded-3xl bg-slate-900/85 hover:bg-slate-800 border-2 border-amber-400/60 font-display text-amber-300 shadow-xl active:scale-90 transition cursor-pointer"
            >
              <span className="text-xl sm:text-2xl">📣</span>
              <span className="text-xs sm:text-sm font-black">AIRHORN!</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
