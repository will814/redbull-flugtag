import React, { useEffect, useRef } from 'react';
import { CoasterMetrics } from './CoasterMetrics';
import {
  BULLSEYE_END_FEET,
  BULLSEYE_START_FEET,
  COASTER_TRACK_LENGTH_FEET,
  CoasterPhysicsState,
  evaluateCoasterTrack,
} from './CoasterPhysicsEngine';

export interface CoasterRideHUDProps {
  metrics: CoasterMetrics;
  rideStateRef: React.MutableRefObject<CoasterPhysicsState>;
  controlsRef: React.MutableRefObject<{ leanInput: number; brakeInput: boolean }>;
  onTriggerActionTap: () => void;
  onRestartRide: () => void;
  onAbortToBuilder: () => void;
  muted: boolean;
  onToggleMute: () => void;
}

export const CoasterRideHUD: React.FC<CoasterRideHUDProps> = ({
  metrics,
  rideStateRef,
  controlsRef,
  onTriggerActionTap,
  onRestartRide,
  onAbortToBuilder,
  muted,
  onToggleMute,
}) => {
  // Direct DOM refs for 60fps zero-GC HUD updates
  const speedTextRef = useRef<HTMLSpanElement | null>(null);
  const distTextRef = useRef<HTMLSpanElement | null>(null);
  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const elementBadgeRef = useRef<HTMLDivElement | null>(null);
  const calloutTextRef = useRef<HTMLDivElement | null>(null);
  const vertGTextRef = useRef<HTMLSpanElement | null>(null);
  const vertGPosFillRef = useRef<HTMLDivElement | null>(null);
  const vertGNegFillRef = useRef<HTMLDivElement | null>(null);
  const airtimeTextRef = useRef<HTMLSpanElement | null>(null);
  const latGTextRef = useRef<HTMLSpanElement | null>(null);
  const latGNeedleRef = useRef<HTMLDivElement | null>(null);
  const bogieStressFillRef = useRef<HTMLDivElement | null>(null);
  const bogieStressTextRef = useRef<HTMLSpanElement | null>(null);
  const boostChargeFillRef = useRef<HTMLDivElement | null>(null);
  const boostButtonLabelRef = useRef<HTMLSpanElement | null>(null);
  const bannerBoxRef = useRef<HTMLDivElement | null>(null);
  const bannerTextRef = useRef<HTMLSpanElement | null>(null);
  const countdownOverlayRef = useRef<HTMLDivElement | null>(null);
  const countdownNumRef = useRef<HTMLDivElement | null>(null);

  const touchLeanRef = useRef<number>(0);
  const touchBrakeRef = useRef<boolean>(false);
  const keysDownRef = useRef<Set<string>>(new Set());

  const syncControls = () => {
    const keysDown = keysDownRef.current;
    const left = keysDown.has('KeyA') || keysDown.has('ArrowLeft');
    const right = keysDown.has('KeyD') || keysDown.has('ArrowRight');
    const keyLean = (right ? 1 : 0) - (left ? 1 : 0);
    controlsRef.current.leanInput =
      touchLeanRef.current !== 0 ? touchLeanRef.current : keyLean;

    const keyBrake =
      keysDown.has('KeyS') ||
      keysDown.has('ArrowDown') ||
      keysDown.has('ShiftLeft') ||
      (rideStateRef.current.sFeet >= 1800 &&
        rideStateRef.current.phase === 'riding' &&
        (keysDown.has('Space') || keysDown.has('KeyW') || keysDown.has('ArrowUp')));
    controlsRef.current.brakeInput = touchBrakeRef.current || keyBrake;
  };

  // Keyboard & Global Pointer Release Listeners (A/D Lean, W/Space Boost, S Brake, R Restart, B/Esc Lab)
  useEffect(() => {
    const keysDown = keysDownRef.current;
    keysDown.clear();
    touchLeanRef.current = 0;
    touchBrakeRef.current = false;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'KeyR') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onRestartRide();
        return;
      }
      if (e.code === 'KeyB' || e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onAbortToBuilder();
        return;
      }
      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)
      ) {
        e.preventDefault();
      }
      if (!keysDown.has(e.code)) {
        keysDown.add(e.code);
        if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
          if (!(rideStateRef.current.sFeet >= 1800 && rideStateRef.current.phase === 'riding')) {
            onTriggerActionTap();
          }
        }
      }
      syncControls();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysDown.delete(e.code);
      syncControls();
    };

    const releaseTouchControls = () => {
      if (touchLeanRef.current !== 0 || touchBrakeRef.current) {
        touchLeanRef.current = 0;
        touchBrakeRef.current = false;
        syncControls();
      }
    };

    const onWindowBlur = () => {
      keysDown.clear();
      touchLeanRef.current = 0;
      touchBrakeRef.current = false;
      controlsRef.current.leanInput = 0;
      controlsRef.current.brakeInput = false;
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('keyup', onKeyUp, { capture: true });
    window.addEventListener('pointerup', releaseTouchControls);
    window.addEventListener('pointercancel', releaseTouchControls);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });
      window.removeEventListener('pointerup', releaseTouchControls);
      window.removeEventListener('pointercancel', releaseTouchControls);
      window.removeEventListener('blur', onWindowBlur);
      keysDown.clear();
      touchLeanRef.current = 0;
      touchBrakeRef.current = false;
      controlsRef.current.leanInput = 0;
      controlsRef.current.brakeInput = false;
    };
  }, [controlsRef, onAbortToBuilder, onRestartRide, onTriggerActionTap, rideStateRef]);

  // 60fps Direct-DOM Telemetry Updater
  useEffect(() => {
    let rafId = 0;

    const updateHUD = () => {
      rafId = requestAnimationFrame(updateHUD);
      const s = rideStateRef.current;
      const sample = evaluateCoasterTrack(s.sFeet);

      if (speedTextRef.current) {
        speedTextRef.current.textContent = `${Math.round(s.speedMph)}`;
      }
      if (distTextRef.current) {
        distTextRef.current.textContent = `${Math.round(s.sFeet)} / ${COASTER_TRACK_LENGTH_FEET} FT`;
      }
      if (progressFillRef.current) {
        const pct = Math.min(100, Math.max(0, (s.sFeet / COASTER_TRACK_LENGTH_FEET) * 100));
        progressFillRef.current.style.width = `${pct}%`;
      }
      if (elementBadgeRef.current) {
        elementBadgeRef.current.textContent = `${sample.elementEmoji} ${sample.elementName}`;
      }
      if (calloutTextRef.current) {
        calloutTextRef.current.textContent = sample.elementCallout;
      }

      // Vertical G-Force Bi-Directional Bar (-2.5G .. +5.5G)
      if (vertGTextRef.current) {
        const sign = s.verticalG >= 0 ? '+' : '';
        vertGTextRef.current.textContent = `${sign}${s.verticalG.toFixed(1)}G`;
        vertGTextRef.current.className =
          s.verticalG < metrics.maxSafeNegativeG + 0.25
            ? 'font-mono font-black text-rose-400 animate-pulse'
            : s.verticalG <= 0.1
            ? 'font-mono font-black text-cyan-300'
            : 'font-mono font-black text-emerald-300';
      }
      if (vertGPosFillRef.current && vertGNegFillRef.current) {
        if (s.verticalG >= 0) {
          const posPct = Math.min(100, (s.verticalG / 5.5) * 100);
          vertGPosFillRef.current.style.width = `${posPct}%`;
          vertGNegFillRef.current.style.width = '0%';
        } else {
          const negPct = Math.min(100, (Math.abs(s.verticalG) / 2.5) * 100);
          vertGNegFillRef.current.style.width = `${negPct}%`;
          vertGPosFillRef.current.style.width = '0%';
        }
      }
      if (airtimeTextRef.current) {
        airtimeTextRef.current.textContent = `${s.airtimeSeconds.toFixed(1)}s`;
      }

      // Lateral G & Roll Alignment Needle
      if (latGTextRef.current) {
        const lSign = s.lateralG >= 0 ? '+' : '';
        latGTextRef.current.textContent = `${lSign}${s.lateralG.toFixed(1)}G (${Math.round(
          s.carRollOffsetDeg
        )}°)`;
      }
      if (latGNeedleRef.current) {
        const needlePct = 50 + Math.max(-46, Math.min(46, (s.lateralG / 2.5) * 46));
        latGNeedleRef.current.style.left = `${needlePct}%`;
      }

      // Bogie Stress Bar
      if (bogieStressFillRef.current) {
        bogieStressFillRef.current.style.width = `${Math.round(s.bogieStressPct)}%`;
      }
      if (bogieStressTextRef.current) {
        bogieStressTextRef.current.textContent = `${Math.round(s.bogieStressPct)}%`;
      }

      // Boost / LIM Capacitor Bar
      const chargeVal =
        s.phase === 'station_countdown' ? s.limChargePct : s.kersChargePct;
      if (boostChargeFillRef.current) {
        boostChargeFillRef.current.style.width = `${Math.round(chargeVal)}%`;
      }
      if (boostButtonLabelRef.current) {
        if (s.phase === 'station_countdown') {
          boostButtonLabelRef.current.textContent =
            s.countdownSec <= 0.65
              ? '🚀 GREEN LIGHT! LAUNCH NOW!'
              : `⚡ TAP TO CHARGE LIM (${Math.round(s.limChargePct)}%)`;
        } else {
          boostButtonLabelRef.current.textContent =
            s.kersBoostActiveTimer > 0
              ? '🔥 KERS OVERDRIVE ACTIVE!'
              : `⚡ KERS BOOST (${Math.round(s.kersChargePct)}%)`;
        }
      }

      // Countdown overlay in Boarding Station
      if (countdownOverlayRef.current && countdownNumRef.current) {
        if (s.phase === 'station_countdown') {
          countdownOverlayRef.current.style.display = 'flex';
          countdownNumRef.current.textContent =
            s.countdownSec <= 0.65
              ? '🟢 GO! TAP LAUNCH!'
              : `⚡ LAUNCH IN ${s.countdownSec.toFixed(1)}s`;
        } else {
          countdownOverlayRef.current.style.display = 'none';
        }
      }

      // Checkpoint / Event Banner
      if (bannerBoxRef.current && bannerTextRef.current) {
        if (s.bannerTimerSec > 0 && s.latestBannerText) {
          bannerBoxRef.current.style.opacity = '1';
          bannerTextRef.current.textContent = `${s.latestBannerEmoji} ${s.latestBannerText}`;
        } else {
          bannerBoxRef.current.style.opacity = '0';
        }
      }
    };

    rafId = requestAnimationFrame(updateHUD);
    return () => cancelAnimationFrame(rafId);
  }, [metrics.maxSafeNegativeG, rideStateRef]);

  const bullseyeStartPct = (BULLSEYE_START_FEET / COASTER_TRACK_LENGTH_FEET) * 100;
  const bullseyeWidthPct =
    ((BULLSEYE_END_FEET - BULLSEYE_START_FEET) / COASTER_TRACK_LENGTH_FEET) * 100;

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 sm:p-4 select-none z-10">
      {/* ===================================================================== */}
      {/* TOP BAR: Workshop Return, Track Progress Spline Bar & Element Badge */}
      {/* ===================================================================== */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onAbortToBuilder}
              className="px-3 py-1.5 rounded-xl bg-slate-950/85 hover:bg-slate-800 text-slate-100 text-xs font-extrabold border border-slate-700 shadow-lg cursor-pointer"
              title="Back to Coaster Lab (B / Esc)"
            >
              ◀ Coaster Workshop [B]
            </button>
            <button
              type="button"
              onClick={onRestartRide}
              className="px-3 py-1.5 rounded-xl bg-slate-950/85 hover:bg-slate-800 text-amber-300 text-xs font-extrabold border border-slate-700 shadow-lg cursor-pointer"
              title="Restart Coaster Ride (R)"
            >
              🔄 Restart [R]
            </button>
            <button
              type="button"
              onClick={onToggleMute}
              className="px-2.5 py-1.5 rounded-xl bg-slate-950/85 hover:bg-slate-800 text-slate-100 text-xs font-bold border border-slate-700 shadow-lg cursor-pointer"
            >
              {muted ? '🔇' : '🔊'}
            </button>
          </div>

          {/* Current Coaster Element Badge */}
          <div className="bg-slate-950/90 backdrop-blur-md border border-sky-400/50 rounded-2xl px-4 py-1.5 shadow-xl flex flex-col items-center">
            <div
              ref={elementBadgeRef}
              className="text-xs sm:text-sm font-black text-sky-300 uppercase tracking-wide"
            >
              ⚡ 105-Ft Top-Hat LIM Launch
            </div>
            <div
              ref={calloutTextRef}
              className="text-[10px] sm:text-xs font-bold text-amber-300 text-center"
            >
              TAP BOOST TO CHARGE LIM COILS!
            </div>
          </div>

          {/* Speedometer */}
          <div className="bg-slate-950/90 backdrop-blur-md border border-slate-700 rounded-2xl px-4 py-1.5 shadow-xl flex items-baseline gap-1.5">
            <span
              ref={speedTextRef}
              className="text-2xl sm:text-3xl font-black font-mono text-white"
            >
              0
            </span>
            <span className="text-xs font-black text-amber-400">MPH</span>
          </div>
        </div>

        {/* 2,000-Ft Track Progress Bar with Golden Bullseye Zone Marker */}
        <div className="bg-slate-950/85 backdrop-blur-md border border-slate-700/80 rounded-xl px-3 py-1.5 shadow-lg flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] font-bold">
            <span className="text-slate-300">
              🎢 TRACK PROGRESS (🔄 Loop · 🌀 Helix · ⛰️ Hills · ⚠️ 32ft Gap · 🌊 Lagoon · 🎯 Bullseye)
            </span>
            <span ref={distTextRef} className="text-sky-300 font-mono font-black">
              0 / 2000 FT
            </span>
          </div>
          <div className="relative w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
            {/* Golden Station Bullseye Stop Zone highlight (1,865..1,955 ft) */}
            <div
              className="absolute top-0 bottom-0 bg-emerald-400/50 border-x border-emerald-300 z-10"
              style={{
                left: `${bullseyeStartPct}%`,
                width: `${bullseyeWidthPct}%`,
              }}
              title="Golden Bullseye Stop Zone (1,865–1,955 FT)"
            />
            <div
              ref={progressFillRef}
              className="h-full bg-gradient-to-r from-sky-400 via-amber-400 to-rose-500 transition-none"
              style={{ width: '0%' }}
            />
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* CENTER BANNER & STATION COUNTDOWN OVERLAY */}
      {/* ===================================================================== */}
      <div className="flex flex-col items-center justify-center gap-2 my-auto">
        <div
          ref={countdownOverlayRef}
          className="bg-slate-950/90 border-2 border-cyan-400 rounded-2xl px-6 py-3 shadow-2xl flex flex-col items-center gap-1"
        >
          <div
            ref={countdownNumRef}
            className="text-xl sm:text-2xl font-black text-cyan-300 tracking-wide"
          >
            ⚡ LAUNCH IN 2.5s
          </div>
          <div className="text-xs font-bold text-amber-300">
            MASH [SPACE / BOOST] TO SUPERCHARGE CAPACITORS!
          </div>
        </div>

        <div
          ref={bannerBoxRef}
          className="transition-opacity duration-200 opacity-0 bg-slate-950/90 border border-amber-400/80 rounded-2xl px-5 py-2 shadow-2xl"
        >
          <span
            ref={bannerTextRef}
            className="text-sm sm:text-base font-black text-amber-300 uppercase tracking-wide"
          />
        </div>
      </div>

      {/* ===================================================================== */}
      {/* BOTTOM TELEMETRY GAUGES & TOUCH/KEYBOARD RIDE CONTROLS */}
      {/* ===================================================================== */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-end justify-between gap-3">
        {/* LEFT: LEAN CONTROLS (Cancel Helix Lateral Gs & Level Car in 32-Ft Rail Gap!) */}
        <div className="pointer-events-auto flex items-center gap-2 bg-slate-950/85 backdrop-blur-md border border-slate-700/80 rounded-2xl p-2.5 shadow-xl">
          <button
            type="button"
            onPointerDown={() => {
              touchLeanRef.current = -1;
              syncControls();
            }}
            onPointerUp={() => {
              touchLeanRef.current = 0;
              syncControls();
            }}
            onPointerLeave={() => {
              touchLeanRef.current = 0;
              syncControls();
            }}
            onPointerCancel={() => {
              touchLeanRef.current = 0;
              syncControls();
            }}
            className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-sky-500 active:text-slate-950 text-white font-black text-xs sm:text-sm border border-slate-600 transition cursor-pointer"
          >
            ◀ LEAN LEFT [A]
          </button>
          <button
            type="button"
            onPointerDown={() => {
              touchLeanRef.current = 1;
              syncControls();
            }}
            onPointerUp={() => {
              touchLeanRef.current = 0;
              syncControls();
            }}
            onPointerLeave={() => {
              touchLeanRef.current = 0;
              syncControls();
            }}
            onPointerCancel={() => {
              touchLeanRef.current = 0;
              syncControls();
            }}
            className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-sky-500 active:text-slate-950 text-white font-black text-xs sm:text-sm border border-slate-600 transition cursor-pointer"
          >
            LEAN RIGHT [D] ▶
          </button>
        </div>

        {/* CENTER: BI-DIRECTIONAL VERTICAL G-METER, LATERAL G NEEDLE & BOGIE STRESS */}
        <div className="flex-1 max-w-xl bg-slate-950/90 backdrop-blur-md border border-slate-700/80 rounded-2xl p-3 shadow-2xl grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* 1. Bi-Directional Vertical G-Meter (-2.5G Ejector .. +5.5G Loop) */}
          <div className="flex flex-col gap-1 bg-slate-900/90 rounded-xl p-2 border border-slate-800">
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="text-slate-300">↕ VERTICAL G</span>
              <span ref={vertGTextRef} className="font-mono font-black text-emerald-300">
                +1.0G
              </span>
            </div>
            <div className="flex items-center h-2 bg-slate-800 rounded-full overflow-hidden">
              <div className="w-1/3 h-full flex justify-end border-r border-slate-500">
                <div
                  ref={vertGNegFillRef}
                  className="h-full bg-cyan-400"
                  style={{ width: '0%' }}
                />
              </div>
              <div className="w-2/3 h-full flex justify-start">
                <div
                  ref={vertGPosFillRef}
                  className="h-full bg-emerald-400"
                  style={{ width: '18%' }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
              <span>Limit {metrics.maxSafeNegativeG}G</span>
              <span>
                Airtime: <strong ref={airtimeTextRef} className="text-cyan-300">0.0s</strong>
              </span>
            </div>
          </div>

          {/* 2. Lateral G & Rail-Clamp Alignment Gauge */}
          <div className="flex flex-col gap-1 bg-slate-900/90 rounded-xl p-2 border border-slate-800">
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="text-slate-300">↔ LATERAL G / ROLL</span>
              <span ref={latGTextRef} className="font-mono font-black text-sky-300">
                +0.0G (0°)
              </span>
            </div>
            <div className="relative w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div className="absolute left-1/3 right-1/3 top-0 bottom-0 bg-emerald-500/30 border-x border-emerald-400/50" />
              <div
                ref={latGNeedleRef}
                className="absolute top-0 bottom-0 w-2 -ml-1 bg-amber-400 rounded-full"
                style={{ left: '50%' }}
              />
            </div>
            <div className="text-[10px] text-slate-400 text-center">
              Keep needle centered in Helix &amp; 32ft Gap!
            </div>
          </div>

          {/* 3. Bogie Stress & Upstop Clamp Load */}
          <div className="flex flex-col gap-1 bg-slate-900/90 rounded-xl p-2 border border-slate-800">
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="text-slate-300">🛞 BOGIE STRESS</span>
              <span ref={bogieStressTextRef} className="font-mono font-black text-amber-300">
                0%
              </span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                ref={bogieStressFillRef}
                className="h-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500"
                style={{ width: '0%' }}
              />
            </div>
            <div className="text-[10px] text-slate-400 text-center">
              Cools in Lagoon · Derails at 100%!
            </div>
          </div>
        </div>

        {/* RIGHT: LIM CHARGE / KERS BOOST & EDDY-CURRENT MAGNET BRAKE PEDALS */}
        <div className="pointer-events-auto flex items-center gap-2 bg-slate-950/85 backdrop-blur-md border border-slate-700/80 rounded-2xl p-2.5 shadow-xl">
          <button
            type="button"
            onClick={onTriggerActionTap}
            className="relative overflow-hidden px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 active:scale-95 text-slate-950 font-black text-xs sm:text-sm border border-cyan-300 shadow-lg cursor-pointer"
          >
            <div
              ref={boostChargeFillRef}
              className="absolute inset-y-0 left-0 bg-white/25 pointer-events-none"
              style={{ width: '50%' }}
            />
            <span ref={boostButtonLabelRef} className="relative z-10">
              ⚡ LIM BOOST [W / SPACE]
            </span>
          </button>

          <button
            type="button"
            onPointerDown={() => {
              touchBrakeRef.current = true;
              syncControls();
            }}
            onPointerUp={() => {
              touchBrakeRef.current = false;
              syncControls();
            }}
            onPointerLeave={() => {
              touchBrakeRef.current = false;
              syncControls();
            }}
            onPointerCancel={() => {
              touchBrakeRef.current = false;
              syncControls();
            }}
            className="px-4 py-3 rounded-xl bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 active:scale-95 text-white font-black text-xs sm:text-sm border border-rose-400 shadow-lg cursor-pointer"
          >
            🧲 MAGNET BRAKE [S]
          </button>
        </div>
      </div>
    </div>
  );
};
