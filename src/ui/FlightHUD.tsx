import React, { useEffect, useRef } from 'react';
import { FlightSimulationState } from '../physics/AeroPhysicsEngine';
import { RAMP_LENGTH_FEET, WORLD_RECORD_FEET } from '../builder/PartCatalog';
import { Wrench, RotateCcw, ArrowUp, ArrowDown, Volume2, VolumeX } from 'lucide-react';

interface FlightHUDProps {
  flightState: FlightSimulationState;
  flightStateRef?: React.MutableRefObject<FlightSimulationState>;
  bestDistanceFeet: number;
  onActionTap: () => void;
  onSkipSkitToPush: () => void;
  onPitchInputChange: (val: number) => void;
  onReturnToHangar: () => void;
  onRestartFlight: () => void;
  muted?: boolean;
  onToggleMute?: () => void;
}

export const FlightHUD: React.FC<FlightHUDProps> = React.memo(({
  flightState,
  flightStateRef,
  bestDistanceFeet,
  onActionTap,
  onSkipSkitToPush,
  onPitchInputChange,
  onReturnToHangar,
  onRestartFlight,
  muted = false,
  onToggleMute,
}) => {
  const heldPositiveKeysRef = useRef<Set<string>>(new Set());
  const heldNegativeKeysRef = useRef<Set<string>>(new Set());

  // Continuous 60fps DOM refs (updated via rAF from flightStateRef without waiting for React state)
  const distanceTextRef = useRef<HTMLSpanElement | null>(null);
  const progressBarFillRef = useRef<HTMLDivElement | null>(null);
  const altTextRef = useRef<HTMLDivElement | null>(null);
  const speedTextRef = useRef<HTMLDivElement | null>(null);
  const hypeBarFillRef = useRef<HTMLDivElement | null>(null);
  const rampBarFillRef = useRef<HTMLDivElement | null>(null);
  const pitchMarkerRef = useRef<HTMLDivElement | null>(null);
  const pitchPlaneIconRef = useRef<HTMLSpanElement | null>(null);
  const pitchDegTextRef = useRef<HTMLSpanElement | null>(null);

  // 60fps rAF loop for silky-smooth gauges, markers, and telemetry bars
  useEffect(() => {
    if (!flightStateRef) return;
    let rafId = 0;

    const updateContinuousHud = () => {
      const s = flightStateRef.current;
      if (s) {
        if (distanceTextRef.current) {
          distanceTextRef.current.textContent = `${s.distanceFeet} / ${WORLD_RECORD_FEET} FT`;
        }
        if (progressBarFillRef.current) {
          const distRatio = Math.max(0, Math.min(1, s.distanceFeet / WORLD_RECORD_FEET));
          progressBarFillRef.current.style.transform = `scaleX(${distRatio})`;
        }
        if (altTextRef.current) {
          altTextRef.current.textContent = `📏 ${Math.max(0, Math.round(s.yFeet))} ft`;
        }
        if (speedTextRef.current) {
          speedTextRef.current.textContent = `💨 ${Math.round(s.vxFeet)} ft/s`;
        }
        if (hypeBarFillRef.current && s.phase === 'skit') {
          const hypeRatio = Math.max(0, Math.min(1, s.hypeMeter / 100));
          hypeBarFillRef.current.style.transform = `scaleX(${hypeRatio})`;
        }
        if (rampBarFillRef.current && s.phase === 'ramp_push') {
          const rampRatio = Math.max(
            0,
            Math.min(1, (s.xFeet + RAMP_LENGTH_FEET) / RAMP_LENGTH_FEET)
          );
          rampBarFillRef.current.style.transform = `scaleX(${rampRatio})`;
        }
        const cPitch = Math.max(-28, Math.min(35, s.pitchDeg));
        const pitchPct = ((cPitch + 28) / 63) * 86 + 7;
        if (pitchMarkerRef.current) {
          pitchMarkerRef.current.style.bottom = `calc(${pitchPct.toFixed(2)}% - 12px)`;
        }
        if (pitchPlaneIconRef.current) {
          pitchPlaneIconRef.current.style.transform = `rotate(${(-s.pitchDeg).toFixed(1)}deg)`;
        }
        if (pitchDegTextRef.current) {
          const rPitch = Math.round(s.pitchDeg);
          pitchDegTextRef.current.textContent = `${rPitch > 0 ? `+${rPitch}` : rPitch}°`;
        }
      }
      rafId = window.requestAnimationFrame(updateContinuousHud);
    };

    rafId = window.requestAnimationFrame(updateContinuousHud);
    return () => window.cancelAnimationFrame(rafId);
  }, [flightStateRef]);

  // Keyboard & Global Pointer Release Support:
  // - Spacebar = Action Tap (Hype / Push / Drop Wheels)
  // - Enter = Skip Skit to Push
  // - Up/W/Left/A = Nose Up (+1), Down/S/Right/D = Nose Down (-1)
  useEffect(() => {
    const syncInputFromHeldKeys = () => {
      const posHeld = heldPositiveKeysRef.current.size > 0;
      const negHeld = heldNegativeKeysRef.current.size > 0;
      if (posHeld && !negHeld) {
        onPitchInputChange(1);
      } else if (negHeld && !posHeld) {
        onPitchInputChange(-1);
      } else if (!posHeld && !negHeld) {
        onPitchInputChange(0);
      }
    };

    const isPositiveKey = (code: string) =>
      code === 'ArrowUp' || code === 'KeyW' || code === 'ArrowLeft' || code === 'KeyA';
    const isNegativeKey = (code: string) =>
      code === 'ArrowDown' || code === 'KeyS' || code === 'ArrowRight' || code === 'KeyD';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        onRestartFlight();
        return;
      }
      if ((e.code === 'Escape' || e.code === 'KeyB') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        onReturnToHangar();
        return;
      }
      if (e.code === 'KeyM' && !e.ctrlKey && !e.metaKey && onToggleMute) {
        e.preventDefault();
        onToggleMute();
        return;
      }
      if (e.code === 'Enter' && flightStateRef?.current?.phase === 'skit') {
        e.preventDefault();
        onSkipSkitToPush();
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        onActionTap();
      } else if (isPositiveKey(e.code)) {
        e.preventDefault();
        heldPositiveKeysRef.current.add(e.code);
        onPitchInputChange(1);
      } else if (isNegativeKey(e.code)) {
        e.preventDefault();
        heldNegativeKeysRef.current.add(e.code);
        onPitchInputChange(-1);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (isPositiveKey(e.code)) {
        e.preventDefault();
        heldPositiveKeysRef.current.delete(e.code);
        syncInputFromHeldKeys();
      } else if (isNegativeKey(e.code)) {
        e.preventDefault();
        heldNegativeKeysRef.current.delete(e.code);
        syncInputFromHeldKeys();
      }
    };

    const handleGlobalPointerRelease = () => {
      syncInputFromHeldKeys();
    };

    const handleBlur = () => {
      heldPositiveKeysRef.current.clear();
      heldNegativeKeysRef.current.clear();
      onPitchInputChange(0);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('pointerup', handleGlobalPointerRelease);
    window.addEventListener('pointercancel', handleGlobalPointerRelease);
    window.addEventListener('blur', handleBlur);
    return () => {
      heldPositiveKeysRef.current.clear();
      heldNegativeKeysRef.current.clear();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('pointerup', handleGlobalPointerRelease);
      window.removeEventListener('pointercancel', handleGlobalPointerRelease);
      window.removeEventListener('blur', handleBlur);
    };
  }, [flightStateRef, onActionTap, onPitchInputChange, onRestartFlight, onReturnToHangar, onSkipSkitToPush, onToggleMute]);

  const handleActionButtonKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.repeat) return;
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      e.stopPropagation();
      onActionTap();
    }
  };

  // Compute progress along the 90-foot start ramp (0% at -90ft, 100% at 0ft edge)
  const rampProgressPct = Math.max(
    0,
    Math.min(100, ((flightState.xFeet + RAMP_LENGTH_FEET) / RAMP_LENGTH_FEET) * 100)
  );

  // Distance progress bar toward 258 ft World Record
  const distancePct = Math.min(100, (flightState.distanceFeet / WORLD_RECORD_FEET) * 100);

  // Map pitchDeg (-28 deg to +35 deg) to 7%..93% vertical position on the Pitch Level Guide Gauge
  const clampedPitch = Math.max(-28, Math.min(35, flightState.pitchDeg));
  const pitchGaugePct = ((clampedPitch + 28) / 63) * 86 + 7;

  const pitchZoneStyle =
    flightState.pitchZone === 'too_high'
      ? {
          border: 'border-rose-400 shadow-rose-500/40',
          badgeBg: 'bg-rose-600 text-white',
          badgeText: flightState.isStalling ? 'STALL!! 🚨' : 'TOO HIGH! ⬇️',
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
    <div className="safe-area-hud pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-2 sm:p-4">
      {/* ===================================================================== */}
      {/* TOP BAR: Flight Distance Progress, Live Telemetry & Action Navigation */}
      {/* ===================================================================== */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        {/* Top-Left: Course Progress & World Record Distance Card */}
        <div className="pointer-events-auto flex flex-col gap-1.5 rounded-2xl bg-slate-950/90 border border-white/15 px-3 py-2 shadow-xl backdrop-blur-md min-w-[210px] sm:min-w-[270px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-sky-300">
              ✈️ Miami Bay Pier Flight
            </span>
            <span
              ref={distanceTextRef}
              className="font-display text-sm sm:text-base font-black text-yellow-300 tabular-nums"
            >
              {flightState.distanceFeet} / {WORLD_RECORD_FEET} FT
            </span>
          </div>

          <div
            role="progressbar"
            aria-label="Flight Distance Toward 258ft World Record"
            aria-valuenow={flightState.distanceFeet}
            aria-valuemin={0}
            aria-valuemax={WORLD_RECORD_FEET}
            className="relative h-2.5 w-full rounded-full bg-slate-800 border border-white/15 overflow-hidden"
          >
            <div
              ref={progressBarFillRef}
              className="h-full w-full origin-left bg-gradient-to-r from-sky-400 via-emerald-400 to-yellow-400 will-change-transform"
              style={{ transform: `scaleX(${distancePct / 100})` }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] font-extrabold text-slate-300">
            <span>
              🏆 Best: <strong className="text-yellow-300">{bestDistanceFeet} ft</strong>
            </span>
            <span>🎯 World Record: {WORLD_RECORD_FEET} ft</span>
          </div>
        </div>

        {/* Top-Center: Speed, Altitude & Thermal Rings Caught */}
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-2xl bg-slate-950/90 border border-white/15 px-3 py-2 shadow-xl backdrop-blur-md">
          <div
            ref={speedTextRef}
            className="rounded-xl bg-sky-500/20 border border-sky-400/30 px-2.5 py-1 text-xs font-black text-sky-200 tabular-nums"
            title="Forward Airspeed"
          >
            💨 {Math.round(flightState.vxFeet)} ft/s
          </div>
          <div
            ref={altTextRef}
            className="rounded-xl bg-emerald-500/20 border border-emerald-400/30 px-2.5 py-1 text-xs font-black text-emerald-200 tabular-nums"
            title="Height Above Water"
          >
            📏 {Math.max(0, Math.round(flightState.yFeet))} ft
          </div>
          <div
            className="rounded-xl bg-amber-500/20 border border-amber-400/40 px-2.5 py-1 text-xs font-black text-amber-300 tabular-nums"
            title="Thermal Wind Rings Collected"
          >
            ⭕ {flightState.thermalsCollected}/3
          </div>
        </div>

        {/* Top-Right: Unified Action Hub (Mute, Restart [R], Workshop [B]) */}
        <div className="pointer-events-auto flex items-center gap-1.5">
          {onToggleMute && (
            <button
              type="button"
              onClick={onToggleMute}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950/90 hover:bg-slate-800 border border-white/15 text-slate-200 shadow-lg transition active:scale-95 cursor-pointer"
              title={muted ? 'Unmute Audio (M)' : 'Mute Audio (M)'}
              aria-label={muted ? 'Unmute Audio' : 'Mute Audio'}
            >
              {muted ? (
                <VolumeX className="h-4 w-4 text-rose-400" />
              ) : (
                <Volume2 className="h-4 w-4 text-emerald-400" />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onRestartFlight}
            className="flex items-center gap-1.5 rounded-xl bg-slate-950/90 hover:bg-slate-800 border border-white/15 px-3 py-2 text-xs font-black text-amber-300 shadow-lg transition active:scale-95 cursor-pointer"
            title="Restart Run (R)"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Restart [R]</span>
          </button>

          <button
            type="button"
            onClick={onReturnToHangar}
            className="flex items-center gap-1.5 rounded-xl bg-slate-950/90 hover:bg-slate-800 border border-white/15 px-3 py-2 text-xs font-black text-slate-100 shadow-lg transition active:scale-95 cursor-pointer"
            title="Return to Workshop (B / Esc)"
          >
            <Wrench className="h-4 w-4 text-sky-400" />
            <span>Workshop [B]</span>
          </button>
        </div>
      </div>

      {/* CENTER-TOP PHASE BANNER (Skit Hype / Ramp Drop Zone / Airborne Glide Sweet Spot) */}
      <div className="pointer-events-none flex flex-col items-center" aria-live="polite">
        {flightState.phase === 'skit' && (
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-slate-900/95 border-2 border-pink-400 px-4 py-2 shadow-2xl">
            <div className="text-left">
              <div className="font-display text-sm sm:text-base font-black text-pink-300">
                🕺 CREW DANCE SKIT! Tap HYPE to Impress the Judges!
              </div>
              <div
                role="progressbar"
                aria-label="Crew Dance Hype Meter"
                aria-valuenow={Math.round(flightState.hypeMeter)}
                aria-valuemin={0}
                aria-valuemax={100}
                className="mt-1 h-3 w-48 sm:w-64 rounded-full bg-slate-800 overflow-hidden border border-white/20"
              >
                <div
                  ref={hypeBarFillRef}
                  className="h-full w-full origin-left bg-gradient-to-r from-pink-500 via-amber-400 to-emerald-400 will-change-transform"
                  style={{ transform: `scaleX(${flightState.hypeMeter / 100})` }}
                />
              </div>
            </div>
            <button
              onClick={onSkipSkitToPush}
              className="rounded-xl bg-emerald-500 hover:bg-emerald-400 px-3 py-1.5 text-xs sm:text-sm font-black text-slate-950 shadow active:scale-95 cursor-pointer"
              title="Skip Skit & Start Ramp Push (Enter)"
            >
              PUSH NOW! ▶ [Enter]
            </button>
          </div>
        )}

        {flightState.phase === 'ramp_push' && (
          <div className="flex flex-col items-center gap-1 rounded-2xl bg-slate-900/95 border-2 border-amber-400 px-4 py-2 shadow-2xl w-72 sm:w-96">
            <div className="flex w-full justify-between text-xs sm:text-sm font-black">
              <span className="text-amber-300">
                {flightState.inTrolleyDropZone
                  ? '🟢 DROP WHEELS NOW!!'
                  : flightState.trolleyDetached
                  ? '✨ WHEELS DROPPED! READY FOR LIFTOFF!'
                  : '👟 SPRINT DOWN THE 30-FT RAMP!'}
              </span>
              <span className="text-sky-300 tabular-nums">Speed: {flightState.pushMeter}%</span>
            </div>

            {/* Visual Ramp Runway Progress Bar with Green Trolley Drop Zone */}
            <div
              role="progressbar"
              aria-label="Ramp Runway Progress"
              aria-valuenow={Math.round(rampProgressPct)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="relative h-4 w-full rounded-full bg-slate-800 border border-white/25 overflow-hidden"
            >
              <div
                className="absolute right-0 top-0 bottom-0 bg-emerald-500/45 border-l-2 border-emerald-300"
                style={{ width: '25%' }}
              />
              <div
                ref={rampBarFillRef}
                className="h-full w-full origin-left bg-gradient-to-r from-orange-500 to-yellow-300 will-change-transform"
                style={{ transform: `scaleX(${rampProgressPct / 100})` }}
              />
            </div>
          </div>
        )}

        {flightState.phase === 'airborne' && (
          <div className="flex flex-col items-center gap-1">
            {/* Brief 2.2-second Trolley Release Timing Callout on Liftoff */}
            {flightState.phaseTime < 2.2 && (
              <div
                className={`rounded-xl border px-3 py-0.5 text-[11px] sm:text-xs font-black shadow ${
                  flightState.trolleyReleaseQuality === 'perfect'
                    ? 'bg-emerald-400 text-slate-950 border-white'
                    : flightState.trolleyReleaseQuality === 'good'
                    ? 'bg-sky-400 text-slate-950 border-white'
                    : 'bg-rose-600 text-white border-rose-200'
                }`}
              >
                {flightState.trolleyReleaseQuality === 'perfect'
                  ? '✨ PERFECT TROLLEY DROP! +5.2 FT/S LAUNCH BOOST!'
                  : flightState.trolleyReleaseQuality === 'good'
                  ? '👍 GOOD TROLLEY DROP! +2.6 FT/S BOOST!'
                  : '⚠️ LATE TROLLEY DROP! -24% SPEED PENALTY!'}
              </div>
            )}

            <div
              className={`rounded-2xl px-4 py-1.5 border-2 font-display text-xs sm:text-base font-black shadow-xl transition ${
                flightState.isStalling
                  ? 'bg-rose-700 border-white text-white animate-pulse'
                  : flightState.pitchZone === 'too_high'
                  ? 'bg-rose-600/95 border-rose-200 text-white'
                  : flightState.pitchZone === 'too_low'
                  ? 'bg-amber-500/95 border-yellow-200 text-slate-950'
                  : 'bg-emerald-500/95 border-emerald-200 text-slate-950'
              }`}
            >
              {flightState.isStalling
                ? '🚨 AERODYNAMIC STALL! AoA TOO HIGH — PUSH NOSE DOWN ⬇️'
                : flightState.pitchZone === 'too_high'
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
          {/* Pitch Up / Down Thumb Buttons (supports continuous thumb sliding!) */}
          <div className="flex flex-col gap-1.5">
            <button
              onPointerDown={() => onPitchInputChange(1)}
              onPointerEnter={(e) => {
                if (e.buttons > 0) onPitchInputChange(1);
              }}
              onPointerUp={() => onPitchInputChange(0)}
              onPointerLeave={(e) => {
                if (e.buttons > 0) onPitchInputChange(0);
              }}
              onPointerCancel={() => onPitchInputChange(0)}
              className={`flex h-14 w-28 sm:h-16 sm:w-36 flex-col items-center justify-center rounded-2xl border-2 font-display text-sm sm:text-base font-black shadow-xl transition select-none cursor-pointer ${
                flightState.pilotPitchInput > 0
                  ? 'bg-sky-400 text-slate-950 border-white scale-95'
                  : 'bg-slate-900/95 text-sky-300 border-sky-400/60 hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-1">
                <ArrowUp className="h-4 w-4 sm:h-5 sm:w-5 stroke-[3]" />
                <span>NOSE UP</span>
              </div>
              <span className="text-[10px] font-bold opacity-80">[W / ↑]</span>
            </button>

            <button
              onPointerDown={() => onPitchInputChange(-1)}
              onPointerEnter={(e) => {
                if (e.buttons > 0) onPitchInputChange(-1);
              }}
              onPointerUp={() => onPitchInputChange(0)}
              onPointerLeave={(e) => {
                if (e.buttons > 0) onPitchInputChange(0);
              }}
              onPointerCancel={() => onPitchInputChange(0)}
              className={`flex h-14 w-28 sm:h-16 sm:w-36 flex-col items-center justify-center rounded-2xl border-2 font-display text-sm sm:text-base font-black shadow-xl transition select-none cursor-pointer ${
                flightState.pilotPitchInput < 0
                  ? 'bg-amber-400 text-slate-950 border-white scale-95'
                  : 'bg-slate-900/95 text-amber-300 border-amber-400/60 hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-1">
                <ArrowDown className="h-4 w-4 sm:h-5 sm:w-5 stroke-[3]" />
                <span>NOSE DOWN</span>
              </div>
              <span className="text-[10px] font-bold opacity-80">[S / ↓]</span>
            </button>
          </div>

          {/* VISUAL PITCH LEVEL GUIDE GAUGE (Keep the Glider in the Green!) */}
          <div className="flex flex-col items-center gap-1">
            <div
              className={`rounded-lg px-2 py-0.5 text-[11px] font-black shadow ${pitchZoneStyle.badgeBg}`}
            >
              {pitchZoneStyle.badgeText}
            </div>

            <div
              className={`relative flex h-28 w-14 sm:h-34 sm:w-16 flex-col overflow-hidden rounded-2xl bg-slate-950/95 border-2 shadow-2xl ${pitchZoneStyle.border}`}
              title="Pitch Level Guide — Keep the plane inside the middle GREEN Sweet Spot!"
            >
              {/* Top Red Zone: Pitch Too High (> +12.5 deg) */}
              <div className="flex h-[34%] w-full flex-col items-center justify-start bg-rose-500/35 pt-1 border-b border-rose-400/70">
                <span className="text-[10px] font-black text-rose-200 tracking-tighter">
                  HIGH ⚠️
                </span>
              </div>

              {/* Middle Emerald Green Sweet Spot Zone (-5.5 to +12.5 deg) */}
              <div className="relative flex h-[30%] w-full items-center justify-center bg-emerald-500/40 border-y border-emerald-300">
                <div className="w-full border-t border-dashed border-emerald-200/80" />
                <span className="absolute text-[10px] font-black text-emerald-100 bg-emerald-900/70 px-1 rounded">
                  OK!
                </span>
              </div>

              {/* Bottom Amber/Red Zone: Pitch Too Low (< -5.5 deg) */}
              <div className="flex h-[36%] w-full flex-col items-center justify-end bg-amber-500/35 pb-1 border-t border-amber-400/70">
                <span className="text-[10px] font-black text-amber-200 tracking-tighter">
                  LOW ⚠️
                </span>
              </div>

              {/* Live Moving & Tilting Craft Pitch Indicator (60fps direct-DOM rAF) */}
              <div
                ref={pitchMarkerRef}
                className="absolute left-1 right-1 flex items-center justify-center will-change-transform"
                style={{
                  bottom: `calc(${pitchGaugePct.toFixed(2)}% - 12px)`,
                }}
              >
                <div className="flex w-full items-center justify-between rounded-lg bg-white px-1 py-0.5 shadow-md border border-slate-900">
                  <span
                    ref={pitchPlaneIconRef}
                    className="text-xs sm:text-sm leading-none inline-block"
                    style={{ transform: `rotate(${-flightState.pitchDeg}deg)` }}
                  >
                    ✈️
                  </span>
                  <span
                    ref={pitchDegTextRef}
                    className="text-[10px] font-black text-slate-950 tabular-nums"
                  >
                    {flightState.pitchDeg > 0
                      ? `+${Math.round(flightState.pitchDeg)}`
                      : Math.round(flightState.pitchDeg)}
                    °
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
              onKeyDown={handleActionButtonKeyDown}
              className="animate-pulse-glow flex h-24 w-36 sm:h-28 sm:w-44 flex-col items-center justify-center rounded-3xl bg-gradient-to-br from-pink-500 via-rose-500 to-amber-400 border-4 border-white font-display text-white shadow-2xl active:scale-90 transition cursor-pointer"
            >
              <span className="text-2xl sm:text-3xl">🎉</span>
              <span className="text-base sm:text-lg font-black tracking-wide">HYPE DANCE!</span>
              <span className="text-[11px] font-bold opacity-90">TAP / [SPACE]</span>
            </button>
          )}

          {flightState.phase === 'ramp_push' && !flightState.inTrolleyDropZone && (
            <button
              onPointerDown={onActionTap}
              onKeyDown={handleActionButtonKeyDown}
              className="animate-pulse-glow flex h-24 w-36 sm:h-28 sm:w-44 flex-col items-center justify-center rounded-3xl bg-gradient-to-br from-amber-400 via-orange-500 to-red-600 border-4 border-yellow-200 font-display text-slate-950 shadow-2xl active:scale-90 transition cursor-pointer"
            >
              <span className="text-2xl sm:text-3xl">👟</span>
              <span className="text-base sm:text-xl font-black tracking-wide">PUSH!!</span>
              <span className="text-[11px] font-extrabold">TAP / [SPACE]</span>
            </button>
          )}

          {flightState.phase === 'ramp_push' && flightState.inTrolleyDropZone && (
            <button
              onPointerDown={onActionTap}
              onKeyDown={handleActionButtonKeyDown}
              className="animate-pulse-glow flex h-28 w-40 sm:h-32 sm:w-48 flex-col items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-400 via-green-500 to-teal-500 border-4 border-white ring-4 ring-emerald-300/70 font-display text-slate-950 shadow-2xl active:scale-90 transition cursor-pointer"
            >
              <span className="text-2xl sm:text-3xl">🛹</span>
              <span className="text-base sm:text-xl font-black tracking-wide">DROP WHEELS!</span>
              <span className="text-xs font-extrabold">TAP / [SPACE]!</span>
            </button>
          )}

          {flightState.phase === 'airborne' && (
            <button
              onPointerDown={onActionTap}
              onKeyDown={handleActionButtonKeyDown}
              className="flex h-20 w-32 sm:h-24 sm:w-36 flex-col items-center justify-center rounded-3xl bg-slate-900/95 hover:bg-slate-800 border-2 border-amber-400/60 font-display text-amber-300 shadow-xl active:scale-90 transition cursor-pointer"
            >
              <span className="text-xl sm:text-2xl">📣</span>
              <span className="text-xs sm:text-sm font-black">AIRHORN!</span>
              <span className="text-[10px] font-bold opacity-80">[SPACE]</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
