import React, { useEffect, useRef } from 'react';
import { FlightSimulationState } from '../physics/AeroPhysicsEngine';
import { COMPETITIONS, RAMP_LENGTH_FEET } from '../builder/PartCatalog';
import { Wrench, RotateCcw, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';

interface FlightHUDProps {
  flightState: FlightSimulationState;
  flightStateRef?: React.MutableRefObject<FlightSimulationState>;
  bestDistanceFeet: number;
  onActionTap: () => void;
  onSkipSkitToPush: () => void;
  onPitchInputChange: (val: number) => void;
  onReturnToHangar: () => void;
  onRestartFlight: () => void;
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
}) => {
  const heldPositiveKeysRef = useRef<Set<string>>(new Set());
  const heldNegativeKeysRef = useRef<Set<string>>(new Set());

  // Continuous 60fps DOM refs (updated via rAF from flightStateRef without waiting for 20Hz React state)
  const distanceTextRef = useRef<HTMLSpanElement | null>(null);
  const progressBarFillRef = useRef<HTMLDivElement | null>(null);
  const altOrLeanTextRef = useRef<HTMLDivElement | null>(null);
  const speedTextRef = useRef<HTMLDivElement | null>(null);
  const hypeBarFillRef = useRef<HTMLDivElement | null>(null);
  const rampBarFillRef = useRef<HTMLDivElement | null>(null);
  const pitchMarkerRef = useRef<HTMLDivElement | null>(null);
  const pitchPlaneIconRef = useRef<HTMLSpanElement | null>(null);
  const pitchDegTextRef = useRef<HTMLSpanElement | null>(null);
  const laneLeanMarkerRef = useRef<HTMLDivElement | null>(null);
  const coasterBikeIconRef = useRef<HTMLSpanElement | null>(null);
  const targetLeanMarkerRef = useRef<HTMLDivElement | null>(null);

  const comp = flightState.competition;
  const compMeta = COMPETITIONS[comp];
  const targetFeet = compMeta.goalFeet;

  // 60fps rAF loop for silky-smooth gauges, markers, and telemetry bars
  useEffect(() => {
    if (!flightStateRef) return;
    let rafId = 0;

    const updateContinuousHud = () => {
      const s = flightStateRef.current;
      if (s) {
        if (distanceTextRef.current) {
          distanceTextRef.current.textContent = `${s.distanceFeet} FT`;
        }
        if (progressBarFillRef.current) {
          const distRatio = Math.max(0, Math.min(1, s.distanceFeet / targetFeet));
          progressBarFillRef.current.style.transform = `scaleX(${distRatio})`;
        }
        if (altOrLeanTextRef.current) {
          if (s.competition === 'flugtag') {
            altOrLeanTextRef.current.textContent = `📏 ${Math.max(0, Math.round(s.yFeet))} ft`;
          } else if (s.competition === 'rollercoaster') {
            const rLean = Math.round(s.leanDeg);
            const lbl =
              rLean === 0 ? '0° LEVEL' : `${Math.abs(rLean)}° ${rLean > 0 ? 'R' : 'L'}`;
            altOrLeanTextRef.current.textContent = `⚖️ ${lbl}`;
          }
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
        if (s.competition === 'flugtag') {
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
        } else {
          if (laneLeanMarkerRef.current) {
            if (s.competition === 'soapbox') {
              const cZ = Math.max(-12, Math.min(12, s.lateralZFeet));
              const lanePct = ((cZ + 12) / 24) * 80 + 10;
              laneLeanMarkerRef.current.style.left = `${lanePct.toFixed(2)}%`;
            } else {
              const cLean = Math.max(-42, Math.min(42, s.leanDeg));
              const leanPct = ((cLean + 42) / 84) * 84 + 8;
              laneLeanMarkerRef.current.style.left = `${leanPct.toFixed(2)}%`;
            }
          }
          if (coasterBikeIconRef.current && s.competition === 'rollercoaster') {
            coasterBikeIconRef.current.style.transform = `rotate(${s.leanDeg.toFixed(1)}deg)`;
          }
          if (targetLeanMarkerRef.current && s.competition === 'rollercoaster') {
            const cTarget = Math.max(-42, Math.min(42, s.trackTargetLeanDeg));
            const targetPct = ((cTarget + 42) / 84) * 84 + 8;
            targetLeanMarkerRef.current.style.left = `${targetPct.toFixed(2)}%`;
            targetLeanMarkerRef.current.style.opacity =
              Math.abs(s.trackTargetLeanDeg) > 1.5 ? '1' : '0';
          }
        }
      }
      rafId = window.requestAnimationFrame(updateContinuousHud);
    };

    rafId = window.requestAnimationFrame(updateContinuousHud);
    return () => window.cancelAnimationFrame(rafId);
  }, [flightStateRef, targetFeet]);

  // Keyboard & Global Pointer Release Support:
  // - Spacebar (and W/Up in Soapbox/Coaster) = Action Tap (Hype / Push / Drop / Boost / Pedal)
  // - Flugtag: Up/W/Left/A = Nose Up (+1), Down/S/Right/D = Nose Down (-1)
  // - Soapbox & Rollercoaster: Left/A = Steer/Lean Left (-1), Right/D = Steer/Lean Right (+1)
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
      comp === 'flugtag'
        ? code === 'ArrowUp' || code === 'KeyW' || code === 'ArrowLeft' || code === 'KeyA'
        : code === 'ArrowRight' || code === 'KeyD';
    const isNegativeKey = (code: string) =>
      comp === 'flugtag'
        ? code === 'ArrowDown' || code === 'KeyS' || code === 'ArrowRight' || code === 'KeyD'
        : code === 'ArrowLeft' || code === 'KeyA';
    const isActionKey = (code: string) =>
      code === 'Space' ||
      (comp !== 'flugtag' &&
        (code === 'ArrowUp' || code === 'KeyW' || code === 'ArrowDown' || code === 'KeyS'));

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

      if (isActionKey(e.code)) {
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
  }, [comp, onActionTap, onPitchInputChange, onRestartFlight, onReturnToHangar]);

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

  // Distance progress bar toward competition target/record
  const distancePct = Math.min(100, (flightState.distanceFeet / targetFeet) * 100);

  // Map pitchDeg (-28 deg to +35 deg) to 7%..93% vertical position on the Pitch Level Guide Gauge
  const clampedPitch = Math.max(-28, Math.min(35, flightState.pitchDeg));
  const pitchGaugePct = ((clampedPitch + 28) / 63) * 86 + 7;

  // Map lateralZFeet (-12 [Left] to +12 [Right] ft) for Soapbox lane gauge (10%..90%)
  const clampedZ = Math.max(-12, Math.min(12, flightState.lateralZFeet));
  const laneGaugePct = ((clampedZ + 12) / 24) * 80 + 10;

  // Map leanDeg (-42 [Left] to +42 [Right] deg) for Rollercoaster rail balance gauge (8%..92%)
  const clampedLean = Math.max(-42, Math.min(42, flightState.leanDeg));
  const leanGaugePct = ((clampedLean + 42) / 84) * 84 + 8;
  const clampedTargetLean = Math.max(-42, Math.min(42, flightState.trackTargetLeanDeg));
  const targetLeanGaugePct = ((clampedTargetLean + 42) / 84) * 84 + 8;

  const roundedLean = Math.round(flightState.leanDeg);
  const leanDirLabel =
    roundedLean === 0 ? '0° LEVEL' : `${Math.abs(roundedLean)}° ${roundedLean > 0 ? 'R' : 'L'}`;

  const pitchZoneStyle =
    flightState.pitchZone === 'too_high'
      ? {
          border: 'border-rose-400 shadow-rose-500/40',
          badgeBg: 'bg-rose-600 text-white',
          badgeText:
            comp === 'rollercoaster'
              ? 'DERAIL RISK! 🚨'
              : comp === 'soapbox'
              ? 'HAY BALE! 💥'
              : flightState.isStalling
              ? 'STALL!! 🚨'
              : 'TOO HIGH! ⬇️',
        }
      : flightState.pitchZone === 'too_low'
      ? {
          border: 'border-amber-400 shadow-amber-500/40',
          badgeBg: 'bg-amber-500 text-slate-950',
          badgeText:
            comp === 'rollercoaster'
              ? 'TILTING! ⚖️'
              : comp === 'soapbox'
              ? 'NEAR CURB! ⚠️'
              : 'TOO LOW! ⬆️',
        }
      : {
          border: 'border-emerald-400 shadow-emerald-500/30',
          badgeBg: 'bg-emerald-400 text-slate-950',
          badgeText:
            comp === 'rollercoaster'
              ? 'ON RAIL! ✨'
              : comp === 'soapbox'
              ? 'CLEAN LINE! ✨'
              : 'SWEET SPOT! ✨',
        };

  const handleDualButtonPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons <= 0 && e.pointerType === 'mouse') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    if (relX < rect.width * 0.48) {
      onPitchInputChange(-1);
    } else if (relX > rect.width * 0.52) {
      onPitchInputChange(1);
    }
  };

  return (
    <div className="safe-area-hud pointer-events-none fixed inset-0 z-10 flex flex-col justify-between">
      {/* TOP STACK: Top Bar + Docked Phase Banner */}
      <div className="flex flex-col items-center gap-1.5 w-full">
        {/* TOP BAR: Back to Hangar, Distance Counter & Target Progress */}
        <div className="pointer-events-auto flex w-full items-center justify-between gap-2 rounded-2xl bg-slate-900/95 px-2.5 sm:px-3 py-1.5 border border-white/15 shadow-xl">
          {/* Left: Hangar & Retry Buttons */}
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={onReturnToHangar}
              title="Return to Workshop (B / Esc)"
              className="flex items-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/15 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-extrabold text-white active:scale-95 transition cursor-pointer"
            >
              <Wrench className="h-4 w-4 text-amber-400" />
              <span>Build</span>
            </button>

            <button
              onClick={onRestartFlight}
              className="flex items-center gap-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/15 px-2.5 py-1.5 text-xs sm:text-sm font-extrabold text-sky-300 active:scale-95 transition cursor-pointer"
              title="Restart Run (R)"
            >
              <RotateCcw className="h-4 w-4" />
              <span className="hidden sm:inline">Retry</span>
            </button>
          </div>

          {/* Center: Live Distance & Course Target Tape */}
          <div className="flex flex-1 max-w-md flex-col items-center px-1 sm:px-2 min-w-0">
            <div className="flex flex-wrap items-baseline justify-center gap-1.5 sm:gap-2">
              <span
                ref={distanceTextRef}
                className="font-display text-xl sm:text-3xl font-black text-yellow-300 drop-shadow tabular-nums whitespace-nowrap"
              >
                {flightState.distanceFeet} FT
              </span>
              <span className="text-[11px] sm:text-xs font-extrabold text-sky-200 tabular-nums whitespace-nowrap">
                (Best: {bestDistanceFeet} ft • Goal: {targetFeet} ft)
              </span>
            </div>

            <div
              role="progressbar"
              aria-label={`Progress Toward ${targetFeet}ft ${compMeta.recordLabel}`}
              aria-valuenow={flightState.distanceFeet}
              aria-valuemin={0}
              aria-valuemax={targetFeet}
              className="relative mt-0.5 h-2.5 w-full rounded-full bg-slate-800 border border-white/15 overflow-hidden"
            >
              <div
                ref={progressBarFillRef}
                className="h-full w-full origin-left bg-gradient-to-r from-sky-400 via-emerald-400 to-yellow-400 will-change-transform"
                style={{ transform: `scaleX(${distancePct / 100})` }}
              />
            </div>
          </div>

          {/* Right: Event-Specific Telemetry Pills */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
            <div
              className="whitespace-nowrap shrink-0 tabular-nums rounded-xl bg-amber-500/20 border border-amber-400/40 px-2 py-1 text-xs font-black text-amber-300"
              title={
                comp === 'rollercoaster'
                  ? 'Hanging Canal Bells Rung'
                  : comp === 'soapbox'
                  ? 'Chicane Speed Gates Cleared'
                  : 'Thermal Wind Rings Collected'
              }
            >
              {comp === 'rollercoaster' ? '🔔' : '⭕'} {flightState.thermalsCollected}/3
            </div>
            {comp === 'flugtag' ? (
              <div
                ref={altOrLeanTextRef}
                className="whitespace-nowrap shrink-0 tabular-nums rounded-xl bg-emerald-500/20 border border-emerald-400/30 px-2 py-1 text-xs font-black text-emerald-200"
                title="Height Above Water"
              >
                📏 {Math.max(0, Math.round(flightState.yFeet))} ft
              </div>
            ) : comp === 'soapbox' ? (
              <div
                className="whitespace-nowrap shrink-0 tabular-nums rounded-xl bg-emerald-500/20 border border-emerald-400/30 px-2 py-1 text-xs font-black text-emerald-200"
                title="Hay Bales Hit"
              >
                🌾 {flightState.obstaclesHit} Hit
              </div>
            ) : (
              <div
                ref={altOrLeanTextRef}
                className="whitespace-nowrap shrink-0 tabular-nums rounded-xl bg-emerald-500/20 border border-emerald-400/30 px-2 py-1 text-xs font-black text-emerald-200"
                title="Tandem Rail Lean Angle (L = Left, R = Right)"
              >
                ⚖️ {leanDirLabel}
              </div>
            )}
            <div
              ref={speedTextRef}
              className="whitespace-nowrap shrink-0 tabular-nums rounded-xl bg-sky-500/20 border border-sky-400/30 px-2 py-1 text-xs font-black text-sky-200"
              title="Forward Speed"
            >
              💨 {Math.round(flightState.vxFeet)} ft/s
            </div>
          </div>
        </div>

        {/* CENTER-TOP PHASE BANNER (Docked directly below Top Bar) */}
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
              >
                START NOW! ▶
              </button>
            </div>
          )}

          {flightState.phase === 'ramp_push' && (
            <div className="flex flex-col items-center gap-1 rounded-2xl bg-slate-900/95 border-2 border-amber-400 px-4 py-2 shadow-2xl w-72 sm:w-96">
              <div className="flex w-full justify-between text-xs sm:text-sm font-black">
                <span className="text-amber-300">
                  {flightState.inTrolleyDropZone
                    ? comp === 'soapbox'
                      ? '🟢 TIMED PUSH-OFF NOW!!'
                      : comp === 'rollercoaster'
                      ? '🟢 DROP IN ON THE RAIL!!'
                      : '🟢 DROP WHEELS NOW!!'
                    : flightState.trolleyDetached
                    ? flightState.trolleyReleaseQuality === 'perfect'
                      ? comp === 'rollercoaster'
                        ? '✨ PERFECT RAIL DROP-IN! HERE WE GO!'
                        : '✨ PERFECT LAUNCH! HERE WE GO!'
                      : comp === 'rollercoaster'
                      ? '👍 GOOD RAIL DROP-IN! HOLD YOUR LINE!'
                      : '👍 GOOD LAUNCH! HERE WE GO!'
                    : comp === 'soapbox'
                    ? '🏎️ CREW PUSH down the Start Ramp!'
                    : comp === 'rollercoaster'
                    ? '🚲 SPRINT & PEDAL onto the Track!'
                    : '👟 SPRINT DOWN THE 30-FT RAMP!'}
                </span>
                <span className="text-sky-300 tabular-nums">Speed: {flightState.pushMeter}%</span>
              </div>

              {/* Visual Start Ramp Progress Bar with Green Timing Zone */}
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
              {/* Brief 2.2-second Launch Timing Callout */}
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
                    ? comp === 'flugtag'
                      ? '✨ PERFECT TROLLEY DROP! +5.2 FT/S LAUNCH BOOST!'
                      : comp === 'rollercoaster'
                      ? '✨ PERFECT RAIL DROP-IN! +5.2 FT/S SPEED BOOST!'
                      : '✨ PERFECT START TIMING! +5.2 FT/S LAUNCH BOOST!'
                    : flightState.trolleyReleaseQuality === 'good'
                    ? comp === 'rollercoaster'
                      ? '👍 GOOD RAIL DROP-IN! +2.6 FT/S BOOST!'
                      : '👍 GOOD LAUNCH TIMING! +2.6 FT/S BOOST!'
                    : comp === 'flugtag'
                    ? '⚠️ LATE TROLLEY DROP! -24% SPEED PENALTY!'
                    : comp === 'rollercoaster'
                    ? '⚠️ MISSED RAIL DROP-IN! -12% SPEED PENALTY!'
                    : '⚠️ LATE START TIMING! -12% SPEED PENALTY!'}
                </div>
              )}

              {/* Competition-Specific Live Status Banner */}
              {comp === 'flugtag' ? (
                <>
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
                </>
              ) : comp === 'soapbox' ? (
                <>
                  <div
                    className={`rounded-2xl px-4 py-1.5 border-2 font-display text-xs sm:text-base font-black shadow-xl transition ${
                      flightState.pitchZone === 'too_high'
                        ? 'bg-rose-600/95 border-rose-200 text-white'
                        : flightState.pitchZone === 'too_low'
                        ? 'bg-amber-500/95 border-yellow-200 text-slate-950'
                        : 'bg-emerald-500/95 border-emerald-200 text-slate-950'
                    }`}
                  >
                    {flightState.pitchZone === 'too_high'
                      ? '💥 HAY BALE SMASH! Steer Left/Right (A/D) to Dodge Chicanes!'
                      : flightState.pitchZone === 'too_low'
                      ? '🛞 SCRAPING THE STREET CURB! Steer Back Toward Center!'
                      : '🏎️ CLEAN DOWNHILL LINE! Hit Orange Kicker Ramps & Green Gates!'}
                  </div>
                  {flightState.windGustWarning === 'headwind_gust' && (
                    <div className="rounded-xl bg-amber-400/95 border border-white px-3 py-0.5 text-[11px] sm:text-xs font-black text-slate-950 shadow">
                      🚀 AIRBORNE OFF THE KICKER RAMP! Hold Onto the Wheel!
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div
                    className={`rounded-2xl px-4 py-1.5 border-2 font-display text-xs sm:text-base font-black shadow-xl transition ${
                      flightState.pitchZone === 'too_high'
                        ? 'bg-rose-700 border-white text-white animate-pulse'
                        : flightState.pitchZone === 'too_low'
                        ? 'bg-amber-500/95 border-yellow-200 text-slate-950'
                        : 'bg-emerald-500/95 border-emerald-200 text-slate-950'
                    }`}
                  >
                    {flightState.pitchZone === 'too_high'
                      ? `🚨 DANGER OF DERAILING (${leanDirLabel})! Lean ${
                          flightState.leanDeg > 0 ? 'LEFT ⬅️' : 'RIGHT ➡️'
                        } NOW!`
                      : flightState.pitchZone === 'too_low'
                      ? `⚖️ RAIL BANKING (${leanDirLabel})! Lean ${
                          flightState.leanDeg > 0 ? 'LEFT ⬅️' : 'RIGHT ➡️'
                        } to Balance!`
                      : '🚲 BALANCED ON THE FLOATING CANAL RAIL! Ring the Bells! 🔔'}
                  </div>
                  {flightState.windGustWarning === 'downdraft' && (
                    <div className="rounded-xl bg-amber-400/95 border border-white px-3 py-0.5 text-[11px] sm:text-xs font-black text-slate-950 shadow">
                      ⛰️ STEEP CAMELBACK CLIMB! Tap PEDAL BOOST (Space / W) so you don&apos;t stall!
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM 2-ACTION THUMB CONTROLS + LIVE GAUGE */}
      <div className="pointer-events-none flex items-end justify-between gap-2 pb-1">
        {/* LEFT THUMB: PITCH (Flugtag) OR STEER/LEAN LEFT/RIGHT (Soapbox & Rollercoaster) */}
        {comp === 'flugtag' ? (
          <div className="pointer-events-auto flex items-end gap-2 sm:gap-2.5">
            {/* Pitch Up / Down Thumb Buttons */}
            <div className="flex flex-col gap-1.5">
              <button
                onContextMenu={(e) => e.preventDefault()}
                onPointerDown={() => onPitchInputChange(1)}
                onPointerEnter={(e) => {
                  if (e.buttons > 0) onPitchInputChange(1);
                }}
                onPointerUp={() => onPitchInputChange(0)}
                onPointerLeave={(e) => {
                  if (e.buttons > 0) onPitchInputChange(0);
                }}
                onPointerCancel={() => onPitchInputChange(0)}
                className={`flex h-14 w-28 sm:h-16 sm:w-36 items-center justify-center gap-1.5 rounded-2xl border-2 font-display text-sm sm:text-base font-black shadow-xl transition select-none cursor-pointer ${
                  flightState.pilotPitchInput > 0
                    ? 'bg-sky-400 text-slate-950 border-white scale-95'
                    : 'bg-slate-900/95 text-sky-300 border-sky-400/60 hover:bg-slate-800'
                }`}
              >
                <ArrowUp className="h-5 w-5 sm:h-6 sm:w-6 stroke-[3]" />
                <span>NOSE UP</span>
              </button>

              <button
                onContextMenu={(e) => e.preventDefault()}
                onPointerDown={() => onPitchInputChange(-1)}
                onPointerEnter={(e) => {
                  if (e.buttons > 0) onPitchInputChange(-1);
                }}
                onPointerUp={() => onPitchInputChange(0)}
                onPointerLeave={(e) => {
                  if (e.buttons > 0) onPitchInputChange(0);
                }}
                onPointerCancel={() => onPitchInputChange(0)}
                className={`flex h-14 w-28 sm:h-16 sm:w-36 items-center justify-center gap-1.5 rounded-2xl border-2 font-display text-sm sm:text-base font-black shadow-xl transition select-none cursor-pointer ${
                  flightState.pilotPitchInput < 0
                    ? 'bg-amber-400 text-slate-950 border-white scale-95'
                    : 'bg-slate-900/95 text-amber-300 border-amber-400/60 hover:bg-slate-800'
                }`}
              >
                <ArrowDown className="h-5 w-5 sm:h-6 sm:w-6 stroke-[3]" />
                <span>NOSE DOWN</span>
              </button>
            </div>

            {/* VISUAL PITCH LEVEL GUIDE GAUGE */}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`rounded-lg px-2 py-0.5 text-[11px] font-black shadow ${pitchZoneStyle.badgeBg}`}
              >
                {pitchZoneStyle.badgeText}
              </div>

              <div
                className={`relative flex h-28 w-14 sm:h-34 sm:w-16 max-h-[26vh] flex-col overflow-hidden rounded-2xl bg-slate-950/95 border-2 shadow-2xl ${pitchZoneStyle.border}`}
                title="Pitch Level Guide — Keep the plane inside the middle GREEN Sweet Spot!"
              >
                <div className="flex h-[34%] w-full flex-col items-center justify-start bg-rose-500/35 pt-1 border-b border-rose-400/70">
                  <span className="text-[10px] font-black text-rose-200 tracking-tighter">
                    HIGH ⚠️
                  </span>
                </div>

                <div className="relative flex h-[30%] w-full items-center justify-center bg-emerald-500/40 border-y border-emerald-300">
                  <div className="w-full border-t border-dashed border-emerald-200/80" />
                  <span className="absolute text-[10px] font-black text-emerald-100 bg-emerald-900/70 px-1 rounded">
                    OK!
                  </span>
                </div>

                <div className="flex h-[36%] w-full flex-col items-center justify-end bg-amber-500/35 pb-1 border-t border-amber-400/70">
                  <span className="text-[10px] font-black text-amber-200 tracking-tighter">
                    LOW ⚠️
                  </span>
                </div>

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
        ) : (
          <div className="pointer-events-auto flex flex-col gap-1.5">
            {/* Horizontal Street Lane / 3D Rail Balance Gauge */}
            <div
              className={`flex flex-col gap-1 bg-slate-950/95 border-2 rounded-2xl p-2 shadow-2xl transition-colors ${pitchZoneStyle.border}`}
            >
              <div className="flex items-center justify-between gap-1.5 text-[10px] sm:text-[11px] font-black">
                <span className="text-slate-200 truncate">
                  {comp === 'soapbox' ? '🛣️ STREET LANE' : '⚖️ 3D RAIL BALANCE'}
                </span>
                <span className={`shrink-0 rounded px-1.5 py-0.5 ${pitchZoneStyle.badgeBg}`}>
                  {pitchZoneStyle.badgeText}
                </span>
              </div>

              <div className="relative h-6 w-48 sm:w-72 rounded-xl bg-slate-900 border border-white/20 overflow-hidden flex items-center">
                {comp === 'rollercoaster' ? (
                  <>
                    {/* Left Derail Danger Zone (<-28°) */}
                    <div className="h-full w-[17%] bg-rose-500/45 border-r border-rose-400/80" />
                    {/* Left Banking Warning Zone (-28°..-15°) */}
                    <div className="h-full w-[15%] bg-amber-500/35 border-r border-amber-300/70" />
                    {/* Center On-Rail Sweet Spot (-15°..+15°) */}
                    <div className="h-full w-[36%] bg-emerald-500/40 flex items-center justify-center">
                      <div className="h-full border-l border-dashed border-emerald-200/80" />
                    </div>
                    {/* Right Banking Warning Zone (+15°..+28°) */}
                    <div className="h-full w-[15%] bg-amber-500/35 border-l border-amber-300/70" />
                    {/* Right Derail Danger Zone (>+28°) */}
                    <div className="h-full w-[17%] bg-rose-500/45 border-l border-rose-400/80" />

                    {/* Upcoming S-Curve Camber Target Indicator */}
                    <div
                      ref={targetLeanMarkerRef}
                      className="absolute top-0 bottom-0 w-1 bg-cyan-300/90 shadow-[0_0_6px_#22d3ee] pointer-events-none will-change-transform transition-opacity duration-150"
                      style={{
                        left: `${targetLeanGaugePct.toFixed(2)}%`,
                        transform: 'translate3d(-50%, 0, 0)',
                        opacity: Math.abs(flightState.trackTargetLeanDeg) > 1.5 ? 1 : 0,
                      }}
                      title="Track Curve Camber Force"
                    />
                  </>
                ) : (
                  <>
                    {/* Left Danger Zone */}
                    <div className="h-full w-[25%] bg-rose-500/35 border-r border-rose-400/70" />
                    {/* Center Safe Zone */}
                    <div className="h-full w-[50%] bg-emerald-500/35 flex items-center justify-center">
                      <div className="h-full border-l border-dashed border-emerald-200/70" />
                    </div>
                    {/* Right Danger Zone */}
                    <div className="h-full w-[25%] bg-rose-500/35 border-l border-rose-400/70" />
                  </>
                )}

                {/* Moving Marker */}
                <div
                  ref={laneLeanMarkerRef}
                  className="absolute top-0.5 bottom-0.5 flex items-center justify-center px-1.5 rounded-lg bg-white text-slate-950 text-[11px] font-black shadow border border-slate-900 will-change-transform"
                  style={{
                    left: `${(comp === 'soapbox' ? laneGaugePct : leanGaugePct).toFixed(2)}%`,
                    transform: 'translate3d(-50%, 0, 0)',
                  }}
                >
                  <span
                    ref={coasterBikeIconRef}
                    className="inline-block leading-none"
                    style={
                      comp === 'rollercoaster'
                        ? { transform: `rotate(${flightState.leanDeg}deg)` }
                        : undefined
                    }
                  >
                    {comp === 'soapbox' ? '🏎️' : '🚲'}
                  </span>
                </div>
              </div>
            </div>

            {/* Side-by-Side Steer / Lean Thumb Buttons (-1 = Left, +1 = Right) */}
            <div
              className="flex items-center gap-1.5 sm:gap-2 touch-none"
              onPointerMove={handleDualButtonPointerMove}
              onPointerUp={() => onPitchInputChange(0)}
              onPointerCancel={() => onPitchInputChange(0)}
              onPointerLeave={(e) => {
                if (e.buttons > 0) onPitchInputChange(0);
              }}
            >
              <button
                onContextMenu={(e) => e.preventDefault()}
                onPointerDown={() => onPitchInputChange(-1)}
                onPointerEnter={(e) => {
                  if (e.buttons > 0) onPitchInputChange(-1);
                }}
                onPointerUp={() => onPitchInputChange(0)}
                onPointerCancel={() => onPitchInputChange(0)}
                className={`flex h-14 w-24 sm:h-16 sm:w-36 items-center justify-center gap-1 sm:gap-1.5 rounded-2xl border-2 font-display text-xs sm:text-base font-black shadow-xl transition select-none cursor-pointer ${
                  flightState.pilotPitchInput < 0
                    ? 'bg-sky-400 text-slate-950 border-white scale-95'
                    : 'bg-slate-900/95 text-sky-300 border-sky-400/60 hover:bg-slate-800'
                }`}
              >
                <ArrowLeft className="h-4 w-4 sm:h-6 sm:w-6 stroke-[3] shrink-0" />
                <span>{comp === 'soapbox' ? 'STEER L' : 'LEAN LEFT'}</span>
              </button>

              <button
                onContextMenu={(e) => e.preventDefault()}
                onPointerDown={() => onPitchInputChange(1)}
                onPointerEnter={(e) => {
                  if (e.buttons > 0) onPitchInputChange(1);
                }}
                onPointerUp={() => onPitchInputChange(0)}
                onPointerCancel={() => onPitchInputChange(0)}
                className={`flex h-14 w-24 sm:h-16 sm:w-36 items-center justify-center gap-1 sm:gap-1.5 rounded-2xl border-2 font-display text-xs sm:text-base font-black shadow-xl transition select-none cursor-pointer ${
                  flightState.pilotPitchInput > 0
                    ? 'bg-amber-400 text-slate-950 border-white scale-95'
                    : 'bg-slate-900/95 text-amber-300 border-amber-400/60 hover:bg-slate-800'
                }`}
              >
                <span>{comp === 'soapbox' ? 'STEER R' : 'LEAN RIGHT'}</span>
                <ArrowRight className="h-4 w-4 sm:h-6 sm:w-6 stroke-[3] shrink-0" />
              </button>
            </div>
          </div>
        )}

        {/* RIGHT THUMB: PRIMARY ACTION BUTTON */}
        <div className="pointer-events-auto">
          {flightState.phase === 'skit' && (
            <button
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={onActionTap}
              onKeyDown={handleActionButtonKeyDown}
              className="animate-pulse-glow flex h-24 w-32 sm:h-28 sm:w-44 flex-col items-center justify-center rounded-3xl bg-gradient-to-br from-pink-500 via-rose-500 to-amber-400 border-4 border-white font-display text-white shadow-2xl active:scale-90 transition cursor-pointer"
            >
              <span className="text-2xl sm:text-3xl">🎉</span>
              <span className="text-sm sm:text-lg font-black tracking-wide">HYPE DANCE!</span>
              <span className="text-[10px] sm:text-[11px] font-bold opacity-90">TAP FAST!</span>
            </button>
          )}

          {flightState.phase === 'ramp_push' && !flightState.inTrolleyDropZone && (
            <button
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={onActionTap}
              onKeyDown={handleActionButtonKeyDown}
              className="animate-pulse-glow flex h-24 w-32 sm:h-28 sm:w-44 flex-col items-center justify-center rounded-3xl bg-gradient-to-br from-amber-400 via-orange-500 to-red-600 border-4 border-yellow-200 font-display text-slate-950 shadow-2xl active:scale-90 transition cursor-pointer"
            >
              <span className="text-2xl sm:text-3xl">
                {comp === 'rollercoaster' ? '🚲' : '👟'}
              </span>
              <span className="text-base sm:text-xl font-black tracking-wide">
                {comp === 'rollercoaster' ? 'PEDAL!!' : 'PUSH!!'}
              </span>
              <span className="text-[10px] sm:text-[11px] font-extrabold">TAP OR SPACE!</span>
            </button>
          )}

          {flightState.phase === 'ramp_push' && flightState.inTrolleyDropZone && (
            <button
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={onActionTap}
              onKeyDown={handleActionButtonKeyDown}
              className="animate-pulse-glow flex h-26 w-34 sm:h-32 sm:w-48 flex-col items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-400 via-green-500 to-teal-500 border-4 border-white ring-4 ring-emerald-300/70 font-display text-slate-950 shadow-2xl active:scale-90 transition cursor-pointer"
            >
              <span className="text-2xl sm:text-3xl">
                {comp === 'soapbox' ? '🏎️' : comp === 'rollercoaster' ? '🎢' : '🛹'}
              </span>
              <span className="text-sm sm:text-xl font-black tracking-wide">
                {comp === 'soapbox'
                  ? 'PUSH-OFF!'
                  : comp === 'rollercoaster'
                  ? 'DROP IN!'
                  : 'DROP WHEELS!'}
              </span>
              <span className="text-[11px] sm:text-xs font-extrabold">TAP NOW!</span>
            </button>
          )}

          {flightState.phase === 'airborne' && (
            <button
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={onActionTap}
              onKeyDown={handleActionButtonKeyDown}
              className={`flex h-20 w-28 sm:h-24 sm:w-40 flex-col items-center justify-center rounded-3xl border-2 font-display shadow-xl active:scale-90 transition cursor-pointer ${
                comp === 'flugtag'
                  ? 'bg-slate-900/95 hover:bg-slate-800 border-amber-400/60 text-amber-300'
                  : comp === 'rollercoaster' && flightState.windGustWarning === 'downdraft'
                  ? 'animate-pulse-glow bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 border-yellow-200 text-slate-950'
                  : 'bg-gradient-to-br from-emerald-400 to-sky-500 border-white text-slate-950'
              }`}
            >
              <span className="text-xl sm:text-2xl">
                {comp === 'soapbox'
                  ? '🔥'
                  : comp === 'rollercoaster'
                  ? flightState.windGustWarning === 'downdraft'
                    ? '⛰️'
                    : '🚲'
                  : '📣'}
              </span>
              <span className="text-xs sm:text-sm font-black">
                {comp === 'soapbox'
                  ? 'GRAVITY TUCK!'
                  : comp === 'rollercoaster'
                  ? flightState.windGustWarning === 'downdraft'
                    ? 'PEDAL CLIMB!'
                    : 'PEDAL BOOST!'
                  : 'AIRHORN!'}
              </span>
              {comp !== 'flugtag' && (
                <span className="text-[10px] font-extrabold">TAP / SPACE!</span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
