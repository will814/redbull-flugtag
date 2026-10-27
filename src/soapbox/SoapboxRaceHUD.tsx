import React, { useEffect, useMemo, useRef } from 'react';
import {
  SOAPBOX_COURSE_LENGTH_FEET,
  SOAPBOX_START_RAMP_FEET,
} from './SoapboxPartCatalog';
import { SoapboxSimulationState } from './SoapboxPhysicsEngine';
import {
  SoapboxCourseId,
  getSoapboxCourse,
} from './SoapboxCourses';
import {
  Wrench,
  RotateCcw,
  ArrowLeft,
  ArrowRight,
  Flame,
  Gauge,
  OctagonAlert,
} from 'lucide-react';

interface SoapboxRaceHUDProps {
  selectedCourseId?: SoapboxCourseId;
  simState: SoapboxSimulationState;
  simStateRef: React.MutableRefObject<SoapboxSimulationState>;
  bestRecordFeet: number;
  bestTimeSec: number | null;
  onActionTap: () => void;
  onDropGateNow: () => void;
  onSteerChange: (val: number) => void;
  onPushTuckChange: (active: boolean) => void;
  onBrakeChange: (active: boolean) => void;
  onReturnToGarage: () => void;
  onRestartRace: () => void;
}

export const SoapboxRaceHUD: React.FC<SoapboxRaceHUDProps> = React.memo(({
  selectedCourseId,
  simState,
  simStateRef,
  bestRecordFeet,
  bestTimeSec,
  onActionTap,
  onDropGateNow,
  onSteerChange,
  onPushTuckChange,
  onBrakeChange,
  onReturnToGarage,
  onRestartRace,
}) => {
  const activeCourse = useMemo(
    () => getSoapboxCourse(selectedCourseId || 'alpine_panorama'),
    [selectedCourseId]
  );
  const courseLength = simState.courseLengthFeet || activeCourse.lengthFeet || SOAPBOX_COURSE_LENGTH_FEET;
  const intactPartsCount = Object.values(simState.attachedParts).filter(Boolean).length;

  const upcomingCallout = useMemo(() => {
    if (simState.phase !== 'racing' || simState.isWrecked) return null;
    const nextObs = simState.obstacles.find(
      (o) => !o.triggered && o.sFeet > simState.sFeet && o.sFeet - simState.sFeet <= 135
    );
    if (!nextObs) return null;
    const distAhead = Math.max(5, Math.round(nextObs.sFeet - simState.sFeet));
    const sideLabel =
      nextObs.lateralCenterFeet < -2
        ? 'LEFT LANE'
        : nextObs.lateralCenterFeet > 2
        ? 'RIGHT LANE'
        : 'CENTER';
    switch (nextObs.type) {
      case 'hay_bale':
        return {
          text: `🌾 HAY BALE (${sideLabel}) IN ${distAhead} FT — STEER ${
            nextObs.lateralCenterFeet >= 0 ? 'LEFT ⯇' : 'RIGHT ⯈'
          }`,
          cls: 'border-amber-400/80 bg-amber-950/85 text-amber-200',
        };
      case 'water_slick':
        return {
          text: `🫧 SOAPY SLICK (${sideLabel}) IN ${distAhead} FT`,
          cls: 'border-cyan-400/80 bg-cyan-950/85 text-cyan-200',
        };
      case 'kicker_jump':
        return {
          text: `🚀 KICKER RAMP AHEAD (${distAhead} FT) — LINE UP!`,
          cls: 'border-orange-400/80 bg-orange-950/85 text-orange-200',
        };
      case 'speed_gate':
        return {
          text: `⚡ SPEED BOOST GATE (${sideLabel}) IN ${distAhead} FT!`,
          cls: 'border-emerald-400/80 bg-emerald-950/85 text-emerald-200',
        };
      default:
        return {
          text: `🪨 COBBLESTONE STRIP IN ${distAhead} FT`,
          cls: 'border-slate-400/80 bg-slate-900/85 text-slate-200',
        };
    }
  }, [simState.phase, simState.isWrecked, simState.obstacles, simState.sFeet]);

  const heldLeftRef = useRef<Set<string>>(new Set());
  const heldRightRef = useRef<Set<string>>(new Set());
  const heldPushKeysRef = useRef<Set<string>>(new Set());
  const heldBrakeKeysRef = useRef<Set<string>>(new Set());
  const pointerSteerRef = useRef<-1 | 0 | 1>(0);
  const pointerBrakeRef = useRef<boolean>(false);
  const pointerPushRef = useRef<boolean>(false);

  const syncSteerInput = () => {
    if (pointerSteerRef.current !== 0) {
      onSteerChange(pointerSteerRef.current);
      return;
    }
    const l = heldLeftRef.current.size > 0;
    const r = heldRightRef.current.size > 0;
    if (l && !r) onSteerChange(-1);
    else if (r && !l) onSteerChange(1);
    else onSteerChange(0);
  };

  const syncPushInput = () => {
    onPushTuckChange(pointerPushRef.current || heldPushKeysRef.current.size > 0);
  };

  const syncBrakeInput = () => {
    onBrakeChange(pointerBrakeRef.current || heldBrakeKeysRef.current.size > 0);
  };

  // 60fps direct-DOM refs for zero-lag telemetry
  const distTextRef = useRef<HTMLSpanElement | null>(null);
  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const hullTextRef = useRef<HTMLElement | null>(null);
  const mphTextRef = useRef<HTMLSpanElement | null>(null);
  const clockTextRef = useRef<HTMLSpanElement | null>(null);
  const stylePtsTextRef = useRef<HTMLSpanElement | null>(null);
  const rollCarIconRef = useRef<HTMLDivElement | null>(null);
  const rollDegTextRef = useRef<HTMLSpanElement | null>(null);
  const laneDotRef = useRef<HTMLDivElement | null>(null);
  const brakeHeatFillRef = useRef<HTMLDivElement | null>(null);
  const brakeHeatTextRef = useRef<HTMLSpanElement | null>(null);
  const startChuteFillRef = useRef<HTMLDivElement | null>(null);
  const hypeFillRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let rafId = 0;

    const updateHudLoop = () => {
      const s = simStateRef.current;
      if (s) {
        const totalLen = s.courseLengthFeet || 1000;
        if (distTextRef.current) {
          distTextRef.current.textContent = `${s.distanceFeet} / ${totalLen.toLocaleString()} FT`;
        }
        if (progressFillRef.current) {
          const ratio = Math.max(
            0,
            Math.min(1, s.distanceFeet / totalLen)
          );
          progressFillRef.current.style.transform = `scaleX(${ratio})`;
        }
        if (hullTextRef.current) {
          hullTextRef.current.textContent = `${s.structuralIntegrity}%`;
        }
        if (mphTextRef.current) {
          mphTextRef.current.textContent = `${Math.round(s.mph)}`;
        }
        if (clockTextRef.current) {
          clockTextRef.current.textContent = `${s.elapsedRaceTimeSec.toFixed(1)}s`;
        }
        if (stylePtsTextRef.current) {
          stylePtsTextRef.current.textContent = `${Math.round(s.driftStylePoints)}`;
        }
        if (rollCarIconRef.current) {
          rollCarIconRef.current.style.transform = `rotate(${s.rollDeg.toFixed(1)}deg)`;
        }
        if (rollDegTextRef.current) {
          const r = Math.round(s.rollDeg);
          rollDegTextRef.current.textContent =
            r === 0 ? '0° FLAT' : `${Math.abs(r)}° ${r > 0 ? 'R' : 'L'}`;
        }
        if (laneDotRef.current) {
          const pct = ((Math.max(-13, Math.min(13, s.lateralOffsetFeet)) + 13) / 26) * 84 + 8;
          laneDotRef.current.style.left = `${pct.toFixed(1)}%`;
        }
        if (brakeHeatFillRef.current) {
          const hRatio = Math.max(0, Math.min(1, s.brakeHeat / 100));
          brakeHeatFillRef.current.style.transform = `scaleX(${hRatio})`;
        }
        if (brakeHeatTextRef.current) {
          brakeHeatTextRef.current.textContent = s.isBrakeFading
            ? '🔥 FADE!'
            : `${Math.round(s.brakeHeat)}%`;
        }
        if (startChuteFillRef.current && s.phase === 'start_ramp') {
          const cRatio = Math.max(
            0,
            Math.min(1, (s.sFeet + SOAPBOX_START_RAMP_FEET) / SOAPBOX_START_RAMP_FEET)
          );
          startChuteFillRef.current.style.transform = `scaleX(${cRatio})`;
        }
        if (hypeFillRef.current && s.phase === 'skit') {
          const hRatio = Math.max(0, Math.min(1, s.hypeMeter / 100));
          hypeFillRef.current.style.transform = `scaleX(${hRatio})`;
        }
      }
      rafId = window.requestAnimationFrame(updateHudLoop);
    };

    rafId = window.requestAnimationFrame(updateHudLoop);
    return () => window.cancelAnimationFrame(rafId);
  }, [simStateRef]);

  // Keyboard & Global Pointer Release bindings for Steer Left/Right, Push/Aero Tuck, and Brake/Drift
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        onRestartRace();
        return;
      }
      if ((e.code === 'Escape' || e.code === 'KeyB') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        onReturnToGarage();
        return;
      }
      if (e.code === 'Enter' && simStateRef.current?.phase === 'skit') {
        e.preventDefault();
        onDropGateNow();
        return;
      }

      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        e.preventDefault();
        heldLeftRef.current.add(e.code);
        syncSteerInput();
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        e.preventDefault();
        heldRightRef.current.add(e.code);
        syncSteerInput();
      } else if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') {
        e.preventDefault();
        heldPushKeysRef.current.add(e.code);
        onActionTap();
        syncPushInput();
      } else if (
        e.code === 'ArrowDown' ||
        e.code === 'KeyS' ||
        e.code === 'ShiftLeft' ||
        e.code === 'ShiftRight'
      ) {
        e.preventDefault();
        heldBrakeKeysRef.current.add(e.code);
        syncBrakeInput();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        heldLeftRef.current.delete(e.code);
        syncSteerInput();
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        heldRightRef.current.delete(e.code);
        syncSteerInput();
      } else if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') {
        heldPushKeysRef.current.delete(e.code);
        syncPushInput();
      } else if (
        e.code === 'ArrowDown' ||
        e.code === 'KeyS' ||
        e.code === 'ShiftLeft' ||
        e.code === 'ShiftRight'
      ) {
        heldBrakeKeysRef.current.delete(e.code);
        syncBrakeInput();
      }
    };

    const handleGlobalPointerRelease = () => {
      if (pointerSteerRef.current !== 0) {
        pointerSteerRef.current = 0;
        syncSteerInput();
      }
      if (pointerBrakeRef.current) {
        pointerBrakeRef.current = false;
        syncBrakeInput();
      }
      if (pointerPushRef.current) {
        pointerPushRef.current = false;
        syncPushInput();
      }
    };

    const handleBlur = () => {
      heldLeftRef.current.clear();
      heldRightRef.current.clear();
      heldPushKeysRef.current.clear();
      heldBrakeKeysRef.current.clear();
      pointerSteerRef.current = 0;
      pointerBrakeRef.current = false;
      pointerPushRef.current = false;
      onSteerChange(0);
      onPushTuckChange(false);
      onBrakeChange(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('pointerup', handleGlobalPointerRelease);
    window.addEventListener('pointercancel', handleGlobalPointerRelease);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('pointerup', handleGlobalPointerRelease);
      window.removeEventListener('pointercancel', handleGlobalPointerRelease);
      window.removeEventListener('blur', handleBlur);
      handleBlur();
    };
  }, [
    onActionTap,
    onBrakeChange,
    onDropGateNow,
    onPushTuckChange,
    onRestartRace,
    onReturnToGarage,
    onSteerChange,
    simStateRef,
  ]);

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-2 sm:p-4">
      {/* ==================================================================== */}
      {/* TOP BAR: COURSE PROGRESS, SPEEDOMETER (MPH), RACE CLOCK & ACTIONS    */}
      {/* ==================================================================== */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        {/* Course Progress & Sector Banner */}
        <div className="pointer-events-auto flex flex-col gap-1.5 rounded-2xl bg-slate-950/90 border-2 border-amber-400/60 px-3 py-2 shadow-xl backdrop-blur-md min-w-64 sm:min-w-88">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 overflow-hidden">
              <span className="text-sm">{activeCourse.emoji}</span>
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-300 truncate">
                {activeCourse.name} • {simState.sectionName}
              </span>
            </div>
            <span
              ref={distTextRef}
              className="font-display text-sm sm:text-base font-black text-white shrink-0"
            >
              {simState.distanceFeet} / {courseLength.toLocaleString()} FT
            </span>
          </div>

          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-800 border border-white/15">
            <div
              ref={progressFillRef}
              className="h-full w-full origin-left bg-gradient-to-r from-amber-400 via-orange-500 to-emerald-400"
              style={{
                transform: `scaleX(${Math.max(
                  0,
                  Math.min(1, simState.distanceFeet / courseLength)
                )})`,
              }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] font-extrabold text-slate-300">
            <span>
              🏆 Best: <strong className="text-yellow-300">{bestRecordFeet} ft</strong>
              {bestTimeSec !== null ? ` (${bestTimeSec.toFixed(1)}s)` : ''}
            </span>
            <div className="flex items-center gap-1.5">
              <span>🛠️ Hull:</span>
              <strong
                ref={hullTextRef}
                className={`font-black ${
                  simState.structuralIntegrity > 65
                    ? 'text-emerald-400'
                    : simState.structuralIntegrity > 30
                    ? 'text-amber-400'
                    : 'text-rose-400 animate-pulse'
                }`}
              >
                {simState.structuralIntegrity}%
              </strong>
              {/* 5-segment mini structural bar */}
              <div className="flex gap-0.5">
                {[20, 40, 60, 80, 100].map((threshold) => (
                  <div
                    key={threshold}
                    className={`h-2 w-2 rounded-xs transition-colors ${
                      simState.structuralIntegrity >= threshold
                        ? simState.structuralIntegrity > 65
                          ? 'bg-emerald-400'
                          : simState.structuralIntegrity > 30
                          ? 'bg-amber-400'
                          : 'bg-rose-500'
                        : 'bg-slate-700/60'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* 6-Slot Live Parts Status Dock */}
          <div className="flex items-center justify-between border-t border-white/10 pt-1 text-[10px] font-bold">
            <span className="text-slate-400">
              Parts: <strong className="text-white">{intactPartsCount}/6 Intact</strong>
            </span>
            <div className="flex items-center gap-1">
              {(
                [
                  { slot: 'wheel_fl', label: 'FL' },
                  { slot: 'wheel_fr', label: 'FR' },
                  { slot: 'wheel_rl', label: 'RL' },
                  { slot: 'wheel_rr', label: 'RR' },
                  { slot: 'bumper', label: 'BMP' },
                  { slot: 'topper', label: 'TOP' },
                ] as const
              ).map(({ slot, label }) => {
                const intact = simState.attachedParts[slot];
                return (
                  <span
                    key={slot}
                    className={`rounded px-1 py-0.5 text-[9px] font-black transition-colors ${
                      intact
                        ? 'bg-emerald-500/25 border border-emerald-400/60 text-emerald-300'
                        : 'bg-rose-950/80 border border-rose-500/60 text-rose-400 line-through opacity-70'
                    }`}
                    title={`${slot}: ${intact ? 'Intact' : 'DETACHED'}`}
                  >
                    {label}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Center-Top Speedometer, Elapsed Race Clock & Drift Style Points */}
        <div className="pointer-events-auto flex items-center gap-2 sm:gap-3 rounded-2xl bg-slate-950/90 border-2 border-white/15 px-3.5 py-1.5 shadow-xl backdrop-blur-md">
          <div className="flex items-baseline gap-1">
            <Gauge className="h-4 w-4 text-sky-400 self-center" />
            <span
              ref={mphTextRef}
              className="font-display text-xl sm:text-2xl font-black text-sky-300"
            >
              {Math.round(simState.mph)}
            </span>
            <span className="text-[10px] font-black text-slate-400">MPH</span>
          </div>

          <div className="h-6 w-px bg-white/15" />

          <div className="text-center">
            <div className="text-[9px] font-extrabold uppercase text-slate-400">
              RACE CLOCK
            </div>
            <span
              ref={clockTextRef}
              className="font-display text-sm sm:text-base font-black text-emerald-300"
            >
              {simState.elapsedRaceTimeSec.toFixed(1)}s
            </span>
          </div>

          <div className="h-6 w-px bg-white/15" />

          <div className="text-center">
            <div className="text-[9px] font-extrabold uppercase text-slate-400">
              DRIFT &amp; STYLE
            </div>
            <span
              ref={stylePtsTextRef}
              className="font-display text-sm sm:text-base font-black text-purple-300"
            >
              {Math.round(simState.driftStylePoints)}
            </span>
          </div>
        </div>

        {/* Right: Restart & Back to Garage */}
        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onRestartRace}
            className="flex items-center gap-1 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-white/15 px-2.5 py-2 text-xs font-black text-amber-300 shadow-lg transition active:scale-95 cursor-pointer"
            title="Restart Derby Run (R)"
          >
            <RotateCcw className="h-4 w-4" />
            <span className="hidden sm:inline">Restart</span>
          </button>

          <button
            type="button"
            onClick={onReturnToGarage}
            className="flex items-center gap-1 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-white/15 px-2.5 py-2 text-xs font-black text-slate-200 shadow-lg transition active:scale-95 cursor-pointer"
            title="Return to Soapbox Garage (B / Esc)"
          >
            <Wrench className="h-4 w-4 text-sky-400" />
            <span>Garage</span>
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* UPPER-CENTER STATUS BANNER + SKIT / STARTER CHUTE SHOVE PROMPT       */}
      {/* ==================================================================== */}
      <div className="mt-1.5 mb-auto flex flex-col items-center gap-1.5">
        {/* Asymmetric Steering Pull Warning Pill */}
        {simState.pullYawRate !== 0 && !simState.isWrecked && (
          <div
            className={`rounded-full border px-3 py-1 text-xs font-black shadow-lg backdrop-blur-md flex items-center gap-1.5 animate-pulse ${
              Math.abs(simState.pullYawRate) > 0.15
                ? 'bg-rose-950/90 border-rose-400 text-rose-200'
                : 'bg-amber-950/90 border-amber-400 text-amber-200'
            }`}
          >
            <span>⚠️</span>
            <span>
              {simState.pullYawRate < -0.05
                ? 'PULLING LEFT ⯇ (COMPENSATE STEER)'
                : simState.pullYawRate > 0.05
                ? 'PULLING RIGHT ⯈ (COMPENSATE STEER)'
                : 'YAW UNBALANCED'}
            </span>
          </div>
        )}

        {/* Wreck Diagnostic Pill */}
        {simState.isWrecked && (
          <div className="rounded-2xl border-2 border-rose-500 bg-rose-950/95 px-4 py-2 text-sm font-black text-rose-200 shadow-2xl animate-bounce">
            💥 WRECKED: {simState.wreckReason || 'CRAFT DESTROYED'}
          </div>
        )}

        {simState.statusBanner && (
          <div
            className={`rounded-2xl border-2 px-4 py-1 text-xs sm:text-sm font-black shadow-2xl backdrop-blur-md transition ${
              simState.statusBanner.tone === 'danger'
                ? 'bg-rose-950/90 border-rose-400 text-rose-200 animate-bounce'
                : simState.statusBanner.tone === 'warn'
                ? 'bg-amber-950/90 border-amber-400 text-amber-200'
                : simState.statusBanner.tone === 'good'
                ? 'bg-emerald-950/90 border-emerald-400 text-emerald-200'
                : 'bg-slate-900/90 border-sky-400 text-sky-200'
            }`}
          >
            {simState.statusBanner.text}
          </div>
        )}

        {/* Upcoming Course Radar / Obstacle Lookahead Callout */}
        {upcomingCallout && !simState.statusBanner && (
          <div
            className={`rounded-full border px-3.5 py-1 text-[11px] sm:text-xs font-black shadow-xl backdrop-blur-md transition ${upcomingCallout.cls}`}
          >
            {upcomingCallout.text}
          </div>
        )}

        {/* Phase 1: Hilltop Start Pavilion Hype & Drop Gate Prompt */}
        {simState.phase === 'skit' && (
          <div className="pointer-events-auto flex flex-col items-center gap-1.5 rounded-2xl bg-slate-950/90 border-2 border-amber-400 px-3.5 py-2.5 shadow-2xl backdrop-blur-md max-w-md w-full">
            <div className="text-[11px] font-black uppercase tracking-wider text-amber-300">
              🎺 HILLTOP START PAVILION — HYPE THE CROWD!
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800 border border-white/15">
              <div
                ref={hypeFillRef}
                className="h-full w-full origin-left bg-gradient-to-r from-amber-400 via-orange-500 to-red-500"
                style={{
                  transform: `scaleX(${Math.max(0, Math.min(1, simState.hypeMeter / 100))})`,
                }}
              />
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={onActionTap}
                className="rounded-xl bg-amber-400 hover:bg-amber-300 px-3 py-1 text-xs font-black text-slate-950 shadow transition active:scale-95 cursor-pointer"
              >
                🎺 HONK AIRHORN [Space]
              </button>
              <button
                type="button"
                onClick={onDropGateNow}
                className="rounded-xl bg-emerald-500 hover:bg-emerald-400 px-3 py-1 text-xs font-black text-slate-950 shadow transition active:scale-95 cursor-pointer"
              >
                🏁 DROP GATE NOW! [Enter]
              </button>
            </div>
          </div>
        )}

        {/* Phase 2: Steep Starter Chute (-40..0 ft) with Green Push-Bar Shove Window */}
        {simState.phase === 'start_ramp' && (
          <div className="pointer-events-auto flex flex-col items-center gap-1.5 rounded-2xl bg-slate-950/90 border-2 border-emerald-400 px-3.5 py-2.5 shadow-2xl backdrop-blur-md max-w-md w-full">
            <div className="text-[11px] font-black uppercase text-emerald-300 text-center">
              🏃 CREW SPRINT CHUTE — TAP PUSH IN THE GREEN SHOVE ZONE (-14..0 FT)!
            </div>
            <div className="relative h-3.5 w-full overflow-hidden rounded-full bg-slate-800 border border-white/20">
              {/* Green Push-Bar Shove Window (-14..0 ft = 65%..100% of 40ft chute) */}
              <div
                className="absolute top-0 bottom-0 bg-emerald-500/45 border-l-2 border-emerald-300"
                style={{ left: '65%', width: '35%' }}
              />
              <div
                ref={startChuteFillRef}
                className="h-full w-full origin-left bg-gradient-to-r from-sky-400 to-amber-400"
                style={{
                  transform: `scaleX(${Math.max(
                    0,
                    Math.min(
                      1,
                      (simState.sFeet + SOAPBOX_START_RAMP_FEET) /
                        SOAPBOX_START_RAMP_FEET
                    )
                  )})`,
                }}
              />
            </div>
            <button
              type="button"
              onClick={onActionTap}
              className="rounded-xl bg-emerald-400 hover:bg-emerald-300 px-3.5 py-1 text-xs font-black text-slate-950 shadow transition active:scale-95 cursor-pointer"
            >
              🏃 CREW PUSH / SHOVE! [Space / W / Up]
            </button>
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* BOTTOM CONTROLS: LEFT/RIGHT STEER, ROLLOVER INCLINOMETER & PEDALS    */}
      {/* ==================================================================== */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        {/* LEFT SIDE: STEER LEFT & STEER RIGHT BUTTONS */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onPointerDown={() => {
              pointerSteerRef.current = -1;
              syncSteerInput();
            }}
            onPointerUp={() => {
              if (pointerSteerRef.current === -1) {
                pointerSteerRef.current = 0;
                syncSteerInput();
              }
            }}
            onPointerLeave={() => {
              if (pointerSteerRef.current === -1) {
                pointerSteerRef.current = 0;
                syncSteerInput();
              }
            }}
            onPointerCancel={() => {
              if (pointerSteerRef.current === -1) {
                pointerSteerRef.current = 0;
                syncSteerInput();
              }
            }}
            className={`flex h-16 w-20 sm:h-20 sm:w-24 flex-col items-center justify-center rounded-2xl border-2 font-black shadow-2xl transition select-none cursor-pointer ${
              simState.steerInput < 0
                ? 'bg-amber-400 border-white text-slate-950 scale-95'
                : 'bg-slate-900/90 border-amber-400/60 text-white hover:bg-slate-800'
            }`}
          >
            <ArrowLeft className="h-6 w-6 sm:h-7 sm:w-7" />
            <span className="text-[11px] sm:text-xs">STEER L</span>
          </button>

          <button
            type="button"
            onPointerDown={() => {
              pointerSteerRef.current = 1;
              syncSteerInput();
            }}
            onPointerUp={() => {
              if (pointerSteerRef.current === 1) {
                pointerSteerRef.current = 0;
                syncSteerInput();
              }
            }}
            onPointerLeave={() => {
              if (pointerSteerRef.current === 1) {
                pointerSteerRef.current = 0;
                syncSteerInput();
              }
            }}
            onPointerCancel={() => {
              if (pointerSteerRef.current === 1) {
                pointerSteerRef.current = 0;
                syncSteerInput();
              }
            }}
            className={`flex h-16 w-20 sm:h-20 sm:w-24 flex-col items-center justify-center rounded-2xl border-2 font-black shadow-2xl transition select-none cursor-pointer ${
              simState.steerInput > 0
                ? 'bg-amber-400 border-white text-slate-950 scale-95'
                : 'bg-slate-900/90 border-amber-400/60 text-white hover:bg-slate-800'
            }`}
          >
            <ArrowRight className="h-6 w-6 sm:h-7 sm:w-7" />
            <span className="text-[11px] sm:text-xs">STEER R</span>
          </button>
        </div>

        {/* CENTER: LIVE REAR-VIEW ROLLOVER INCLINOMETER, LANE BAR & BRAKE TEMP */}
        <div className="pointer-events-auto flex flex-col items-center gap-1.5 rounded-2xl bg-slate-950/92 border-2 border-white/15 px-3.5 py-2 shadow-2xl backdrop-blur-md min-w-60 sm:min-w-72">
          <div className="flex w-full items-center justify-between gap-3">
            {/* Rear-View Rollover Inclinometer Dial */}
            <div className="flex items-center gap-2">
              <div
                className={`relative flex h-11 w-11 items-center justify-center rounded-full border-2 ${
                  simState.rollWarning
                    ? 'border-rose-500 bg-rose-950/60 animate-pulse'
                    : 'border-sky-400/60 bg-slate-900'
                }`}
              >
                <div
                  ref={rollCarIconRef}
                  className="text-lg transition-transform duration-75"
                  style={{ transform: `rotate(${simState.rollDeg.toFixed(1)}deg)` }}
                >
                  🏎️
                </div>
              </div>
              <div>
                <div className="text-[10px] font-extrabold uppercase text-slate-400">
                  BODY ROLL TILT
                </div>
                <div className="flex items-center gap-1">
                  <span
                    ref={rollDegTextRef}
                    className={`font-display text-xs sm:text-sm font-black ${
                      simState.rollWarning ? 'text-rose-400' : 'text-white'
                    }`}
                  >
                    {Math.round(simState.rollDeg) === 0
                      ? '0° FLAT'
                      : `${Math.abs(Math.round(simState.rollDeg))}° ${
                          Math.round(simState.rollDeg) > 0 ? 'R' : 'L'
                        }`}
                  </span>
                  {simState.rollWarning && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-rose-500 px-1 py-0.5 text-[9px] font-black text-white">
                      <OctagonAlert className="h-2.5 w-2.5" /> 2-WHEEL TILT!
                    </span>
                  )}
                  {simState.isDrifting && !simState.rollWarning && (
                    <span className="rounded bg-purple-500 px-1.5 py-0.5 text-[9px] font-black text-white">
                      🌀 DRIFTING!
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Brake Temperature Gauge */}
            <div className="w-24 sm:w-28">
              <div className="flex items-center justify-between text-[10px] font-black">
                <span className="flex items-center gap-0.5 text-slate-300">
                  <Flame className="h-3 w-3 text-orange-400" /> BRAKE TEMP
                </span>
                <span
                  ref={brakeHeatTextRef}
                  className={
                    simState.isBrakeFading
                      ? 'text-rose-400 animate-pulse'
                      : 'text-amber-300'
                  }
                >
                  {simState.isBrakeFading
                    ? '🔥 FADE!'
                    : `${Math.round(simState.brakeHeat)}%`}
                </span>
              </div>
              <div className="mt-0.5 h-2 w-full overflow-hidden rounded-full bg-slate-800 border border-white/10">
                <div
                  ref={brakeHeatFillRef}
                  className={`h-full w-full origin-left ${
                    simState.isBrakeFading
                      ? 'bg-rose-500'
                      : 'bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500'
                  }`}
                  style={{
                    transform: `scaleX(${Math.max(0, Math.min(1, simState.brakeHeat / 100))})`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Road Lane Position Indicator (-13 ft Left Curb .. +13 ft Right Curb) */}
          <div className="relative h-2 w-full rounded-full bg-slate-800 border border-white/15">
            <div className="absolute inset-y-0 left-1/2 w-0.5 bg-yellow-400/50" />
            <div
              ref={laneDotRef}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-amber-400 border border-slate-950 shadow"
              style={{
                left: `${
                  ((Math.max(-13, Math.min(13, simState.lateralOffsetFeet)) + 13) /
                    26) *
                    84 +
                  8
                }%`,
              }}
            />
          </div>
        </div>

        {/* RIGHT SIDE: BRAKE / DRIFT PEDAL & PUSH / AERO TUCK PEDAL */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onPointerDown={() => {
              pointerBrakeRef.current = true;
              syncBrakeInput();
            }}
            onPointerUp={() => {
              if (pointerBrakeRef.current) {
                pointerBrakeRef.current = false;
                syncBrakeInput();
              }
            }}
            onPointerLeave={() => {
              if (pointerBrakeRef.current) {
                pointerBrakeRef.current = false;
                syncBrakeInput();
              }
            }}
            onPointerCancel={() => {
              if (pointerBrakeRef.current) {
                pointerBrakeRef.current = false;
                syncBrakeInput();
              }
            }}
            className={`flex h-16 w-22 sm:h-20 sm:w-26 flex-col items-center justify-center rounded-2xl border-2 font-black shadow-2xl transition select-none cursor-pointer ${
              simState.brakeInput
                ? 'bg-rose-500 border-white text-white scale-95'
                : 'bg-slate-900/90 border-rose-400/70 text-rose-300 hover:bg-slate-800'
            }`}
          >
            <span className="text-lg">🛑</span>
            <span className="text-[11px] sm:text-xs">BRAKE / DRIFT</span>
            <span className="text-[9px] text-slate-400">Hold S / Down</span>
          </button>

          <button
            type="button"
            onPointerDown={() => {
              pointerPushRef.current = true;
              onActionTap();
              syncPushInput();
            }}
            onPointerUp={() => {
              if (pointerPushRef.current) {
                pointerPushRef.current = false;
                syncPushInput();
              }
            }}
            onPointerLeave={() => {
              if (pointerPushRef.current) {
                pointerPushRef.current = false;
                syncPushInput();
              }
            }}
            onPointerCancel={() => {
              if (pointerPushRef.current) {
                pointerPushRef.current = false;
                syncPushInput();
              }
            }}
            className={`flex h-16 w-24 sm:h-20 sm:w-30 flex-col items-center justify-center rounded-2xl border-2 font-black shadow-2xl transition select-none cursor-pointer ${
              simState.pushTuckActive
                ? 'bg-emerald-400 border-white text-slate-950 scale-95'
                : 'bg-gradient-to-b from-amber-400 to-orange-500 border-yellow-200 text-slate-950 hover:from-amber-300 hover:to-orange-400'
            }`}
          >
            <span className="text-lg">🚀</span>
            <span className="text-[11px] sm:text-xs">
              {simState.phase === 'racing' ? 'AERO TUCK' : 'CREW PUSH!'}
            </span>
            <span className="text-[9px] font-bold text-slate-900">
              Space / W / Up
            </span>
          </button>
        </div>
      </div>
    </div>
  );
});
