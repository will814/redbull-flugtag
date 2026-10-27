/**
 * Red Bull Tandem Bike Challenge (Game 4)
 * In-Run Telemetry HUD, Dual-Thumb Touch Controls & Keyboard Interface
 * File: src/tandem/TandemCourseHUD.tsx
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  TandemSimState,
  TandemControls,
  TandemDynoMetrics,
} from './types.ts';
import {
  COURSE_LENGTH_FT,
  STANDARD_BEAM_HALF_WIDTH_FT,
  computeCriticalRollThreshold,
} from './TandemPhysicsEngine.ts';
import {
  DEFAULT_TANDEM_COURSE_ID,
  getTandemCourseById,
  type TandemCourseId,
} from './TandemCourses.ts';
import { soundEngine } from '../audio/SoundEngine.ts';
import {
  RotateCcw,
  Wrench,
  Volume2,
  VolumeX,
  Gauge,
  Flame,
  Zap,
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

// ============================================================================
// 1. COMPONENT PROPS CONTRACT
// ============================================================================

export interface TandemCourseHUDProps {
  /** Current reactive snapshot of simulation state */
  simState: TandemSimState;
  /** Authoritative 60/120Hz mutable ref for zero-latency DOM telemetry updates */
  simStateRef: React.MutableRefObject<TandemSimState>;
  /** Authoritative mutable controls ref consumed by TandemPhysicsEngine */
  controlsRef: React.MutableRefObject<TandemControls>;
  /** Dynamic vehicle dyno metrics and calculated physical properties */
  metrics: TandemDynoMetrics;
  /** Active course ID */
  courseId?: TandemCourseId;
  /** Personal best distance record in feet */
  bestDistanceFeet?: number;
  /** Personal best finish time record in seconds */
  bestTimeSec?: number | null;
  /** Optional callback fired when controls update */
  onControlsChange?: (controls: TandemControls) => void;
  /** Callback to trigger pre-run dock hype launch impulse */
  onTriggerDockLaunch?: (intensity?: number) => void;
  /** Callback to restart current course run ('R' hotkey or HUD button) */
  onRestartRun: () => void;
  /** Callback to abort run and return to 3D Workshop ('Esc' hotkey or HUD button) */
  onReturnToWorkshop: () => void;
  /** Sound engine mute state */
  muted?: boolean;
  /** Toggle audio mute handler */
  onToggleMute?: () => void;
}

// ============================================================================
// 2. SECTOR DEFINITIONS & METADATA
// ============================================================================

export interface SectorMeta {
  id: string;
  name: string;
  startFt: number;
  endFt: number;
  emoji: string;
  badgeColor: string;
  advice: string;
}

export const SECTOR_METAS: SectorMeta[] = [
  { id: 'dock', name: 'DOCK LAUNCH', startFt: 0, endFt: 30, emoji: '🏁', badgeColor: 'border-amber-400 text-amber-300', advice: 'Hype the crowd and launch onto the 600-ft canal track!' },
  { id: 'beam_1', name: 'NARROW BEAM', startFt: 30, endFt: 160, emoji: '⚖️', badgeColor: 'border-sky-400 text-sky-300', advice: 'Center on 3-ft timber beam. Watch roll tilt!' },
  { id: 'rollers', name: 'RHYTHM ROLLERS', startFt: 160, endFt: 270, emoji: '🌊', badgeColor: 'border-purple-400 text-purple-300', advice: 'Maintain cadence rhythm across 110 ft of roller whoops!' },
  { id: 'seesaw', name: 'DYNAMIC SEESAW', startFt: 270, endFt: 390, emoji: '🪵', badgeColor: 'border-orange-400 text-orange-300', advice: 'Pedal uphill past 330 ft fulcrum before descent!' },
  { id: 'water_cannon', name: 'WATER CANNON ALLEY', startFt: 390, endFt: 515, emoji: '💦', badgeColor: 'border-rose-400 text-rose-300', advice: 'Lateral blasts ahead! Lean hard to counter-spray!' },
  { id: 'gap_jump', name: 'RAMP GAP JUMP', startFt: 515, endFt: 560, emoji: '🚀', badgeColor: 'border-red-500 text-red-400', advice: 'Sprint boost now! 14+ MPH required to clear 25-ft air gap!' },
  { id: 'finish_bell', name: 'FINISH BELL', startFt: 560, endFt: 600, emoji: '🔔', badgeColor: 'border-emerald-400 text-emerald-300', advice: 'Final stretch! Ring the golden bell at 600 FT!' },
];

export function getSectorForDistance(distanceFt: number, courseId?: TandemCourseId): SectorMeta {
  if (!courseId || courseId === DEFAULT_TANDEM_COURSE_ID) {
    const d = Math.max(0, Math.min(COURSE_LENGTH_FT, distanceFt));
    for (const s of SECTOR_METAS) {
      if (d >= s.startFt && d <= s.endFt) return s;
    }
    return SECTOR_METAS[SECTOR_METAS.length - 1];
  }
  const course = getTandemCourseById(courseId);
  const d = Math.max(0, Math.min(course.lengthFt, distanceFt));
  for (let i = 0; i < course.sectors.length; i++) {
    const sec = course.sectors[i];
    if (d >= sec.startFt && d <= sec.endFt) {
      return {
        id: sec.id,
        name: sec.name,
        startFt: sec.startFt,
        endFt: sec.endFt,
        emoji: sec.emoji,
        badgeColor: SECTOR_METAS[i]?.badgeColor || 'border-sky-400 text-sky-300',
        advice: sec.advice,
      };
    }
  }
  const lastSec = course.sectors[course.sectors.length - 1];
  return {
    id: lastSec.id,
    name: lastSec.name,
    startFt: lastSec.startFt,
    endFt: lastSec.endFt,
    emoji: lastSec.emoji,
    badgeColor: 'border-emerald-400 text-emerald-300',
    advice: lastSec.advice,
  };
}

// ============================================================================
// 3. TANDEM COURSE HUD COMPONENT
// ============================================================================

export const TandemCourseHUD: React.FC<TandemCourseHUDProps> = React.memo(({
  simState,
  simStateRef,
  controlsRef,
  metrics,
  courseId = DEFAULT_TANDEM_COURSE_ID,
  bestDistanceFeet = 0,
  bestTimeSec = null,
  onControlsChange,
  onTriggerDockLaunch,
  onRestartRun,
  onReturnToWorkshop,
  muted = false,
  onToggleMute,
}) => {
  const activeCourse = useMemo(() => getTandemCourseById(courseId), [courseId]);
  const courseLengthFt = activeCourse.lengthFt;
  // Input tracking sets for keyboard
  const heldSteerLeftRef = useRef<Set<string>>(new Set());
  const heldSteerRightRef = useRef<Set<string>>(new Set());
  const heldCadenceRef = useRef<Set<string>>(new Set());
  const heldSprintRef = useRef<Set<string>>(new Set());
  const heldBrakeRef = useRef<Set<string>>(new Set());
  const heldLeanLeftRef = useRef<Set<string>>(new Set());
  const heldLeanRightRef = useRef<Set<string>>(new Set());

  // Cadence tap rhythm buffer so tapping W / Up / Space maintains smooth pedal cadence
  const lastCadenceTapTimeRef = useRef<number>(0);

  // Touch pointer tracking
  const pointerSteerRef = useRef<-1 | 0 | 1>(0);
  const pointerLeanRef = useRef<-1 | 0 | 1>(0);
  const pointerCadenceRef = useRef<boolean>(false);
  const pointerSprintRef = useRef<boolean>(false);
  const pointerBrakeRef = useRef<boolean>(false);

  // Authoritative phase state synced from both simState prop and 60Hz simStateRef.current
  const [livePhase, setLivePhase] = useState(simState.phase);
  const livePhaseRef = useRef(simState.phase);

  // Sector announcement toast state (starts null so center viewport is never blocked)
  const lastSectorIdRef = useRef<string>('dock');
  const toastTimeoutRef = useRef<number | null>(null);
  const [activeToast, setActiveToast] = useState<SectorMeta | null>(null);

  useEffect(() => {
    livePhaseRef.current = simState.phase;
    setLivePhase(simState.phase);
    if (simState.phase === 'hype') {
      lastSectorIdRef.current = 'dock';
      lastCadenceTapTimeRef.current = 0;
      setActiveToast(null);
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = null;
      }
    }
  }, [simState.phase]);

  // Telemetry DOM refs for zero-overhead rAF updates
  const distTextRef = useRef<HTMLSpanElement | null>(null);
  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const progressMarkerRef = useRef<HTMLDivElement | null>(null);
  const mphTextRef = useRef<HTMLSpanElement | null>(null);
  const mphGaugeArcRef = useRef<SVGCircleElement | null>(null);
  const clockTextRef = useRef<HTMLSpanElement | null>(null);
  const cadenceTextRef = useRef<HTMLSpanElement | null>(null);
  const cadencePulseRingRef = useRef<HTMLDivElement | null>(null);
  const staminaFillRef = useRef<HTMLDivElement | null>(null);
  const staminaTextRef = useRef<HTMLSpanElement | null>(null);
  const sprintBoostPillRef = useRef<HTMLDivElement | null>(null);
  const rollBubbleRef = useRef<HTMLDivElement | null>(null);
  const rollDegTextRef = useRef<HTMLSpanElement | null>(null);
  const rollWarningBadgeRef = useRef<HTMLDivElement | null>(null);
  const laneDotRef = useRef<HTMLDivElement | null>(null);
  const leanStatusTextRef = useRef<HTMLSpanElement | null>(null);
  const dockHypeFillRef = useRef<HTMLDivElement | null>(null);
  const dockHypePctRef = useRef<HTMLSpanElement | null>(null);
  const dockCountdownTextRef = useRef<HTMLSpanElement | null>(null);

  // Synchronize controls with authoritative clamping
  const syncAuthoritativeControls = () => {
    // 1. Lateral Steering (-1.0 to +1.0)
    let steerVal = 0;
    if (pointerSteerRef.current !== 0) {
      steerVal = pointerSteerRef.current;
    } else {
      const l = heldSteerLeftRef.current.size > 0;
      const r = heldSteerRightRef.current.size > 0;
      if (l && !r) steerVal = -1.0;
      else if (r && !l) steerVal = 1.0;
    }
    steerVal = Math.max(-1.0, Math.min(1.0, steerVal));

    // 2. Rider Lean (-1.0 to +1.0)
    let leanVal = 0;
    if (pointerLeanRef.current !== 0) {
      leanVal = pointerLeanRef.current;
    } else {
      const l = heldLeanLeftRef.current.size > 0;
      const r = heldLeanRightRef.current.size > 0;
      if (l && !r) leanVal = -1.0;
      else if (r && !l) leanVal = 1.0;
    }
    leanVal = Math.max(-1.0, Math.min(1.0, leanVal));

    // 3. Cadence, Sprint & Brake (with 320ms cadence tap rhythm grace window)
    const brake = pointerBrakeRef.current || heldBrakeRef.current.size > 0;
    const sprint = pointerSprintRef.current || heldSprintRef.current.size > 0;
    const tapWindowActive = !brake && performance.now() - lastCadenceTapTimeRef.current < 320;
    const pedalCadence =
      !brake &&
      (pointerCadenceRef.current ||
        heldCadenceRef.current.size > 0 ||
        sprint ||
        tapWindowActive);

    controlsRef.current.steer = steerVal;
    controlsRef.current.leanRoll = leanVal;
    controlsRef.current.pedalCadence = pedalCadence;
    controlsRef.current.sprint = sprint;
    controlsRef.current.brake = brake;

    if (onControlsChange) {
      onControlsChange({ ...controlsRef.current });
    }
  };

  // High-performance 60/120Hz rAF direct-DOM telemetry loop
  useEffect(() => {
    let rafId = 0;
    const thetaCritRad = computeCriticalRollThreshold(metrics.stats);
    const thetaCritDeg = (thetaCritRad * 180) / Math.PI;

    const updateHudFrame = () => {
      const s = simStateRef.current;
      if (s) {
        // Guarantee HUD phase state stays strictly synchronized with simStateRef.current.phase
        if (s.phase !== livePhaseRef.current) {
          livePhaseRef.current = s.phase;
          setLivePhase(s.phase);
        }

        // Expire cadence tap rhythm buffer if key was released > 320ms ago
        if (
          controlsRef.current.pedalCadence &&
          !pointerCadenceRef.current &&
          heldCadenceRef.current.size === 0 &&
          !pointerSprintRef.current &&
          heldSprintRef.current.size === 0 &&
          performance.now() - lastCadenceTapTimeRef.current >= 320
        ) {
          controlsRef.current.pedalCadence = false;
        }

        // A. Course Distance & Progress Bar
        const distFt = Math.max(0, Math.min(courseLengthFt, s.distanceFt || 0));
        if (distTextRef.current) {
          distTextRef.current.textContent = `${Math.round(distFt)} / ${courseLengthFt} FT`;
        }
        const distRatio = Math.max(0, Math.min(1.0, distFt / courseLengthFt));
        if (progressFillRef.current) {
          progressFillRef.current.style.transform = `scaleX(${distRatio})`;
        }
        if (progressMarkerRef.current) {
          progressMarkerRef.current.style.left = `${(distRatio * 100).toFixed(1)}%`;
        }

        // B. Speedometer & Arc Gauge
        const mph = Math.max(0, s.speedMph || 0);
        if (mphTextRef.current) {
          mphTextRef.current.textContent = `${Math.round(mph)}`;
        }
        if (mphGaugeArcRef.current) {
          const maxMph = 30;
          const arcFraction = Math.min(1.0, mph / maxMph);
          const offset = 150.8 * (1.0 - arcFraction * 0.75);
          mphGaugeArcRef.current.style.strokeDashoffset = `${offset.toFixed(1)}`;
        }

        // C. Sprint Boost Active Indicator
        const stamina = (s as any).sprintStamina ?? 1.0;
        const isBoosting = controlsRef.current.sprint && controlsRef.current.pedalCadence && stamina > 0.02;
        if (sprintBoostPillRef.current) {
          sprintBoostPillRef.current.style.opacity = isBoosting ? '1' : '0';
          sprintBoostPillRef.current.style.pointerEvents = isBoosting ? 'auto' : 'none';
        }

        // D. Race Clock Stopwatch
        if (clockTextRef.current) {
          clockTextRef.current.textContent = `${(s.timeElapsedSec || 0).toFixed(1)}s`;
        }

        // E. Cadence RPM & Metronome Pulse Ring
        const cadenceRpm = Math.max(0, Math.round(s.cadenceRpm || 0));
        if (cadenceTextRef.current) {
          cadenceTextRef.current.textContent = `${cadenceRpm} RPM`;
        }
        if (cadencePulseRingRef.current) {
          const pulseScale = cadenceRpm > 0
            ? 1.0 + Math.sin(performance.now() * 0.001 * (cadenceRpm / 60) * Math.PI * 2) * 0.18
            : 1.0;
          cadencePulseRingRef.current.style.transform = `scale(${pulseScale.toFixed(2)})`;
        }

        // F. Sprint Stamina Meter
        if (staminaFillRef.current) {
          staminaFillRef.current.style.transform = `scaleX(${Math.max(0, Math.min(1, stamina))})`;
        }
        if (staminaTextRef.current) {
          staminaTextRef.current.textContent = `${Math.round(stamina * 100)}%`;
        }

        // G. Lateral Balance Inclinometer Dial & Bubble
        const rollDeg = (s.rollAngleRad * 180) / Math.PI;
        const rollAbsDeg = Math.abs(rollDeg);
        const rollRatio = Math.max(-1.0, Math.min(1.0, rollDeg / thetaCritDeg));

        if (rollBubbleRef.current) {
          const pxOffset = rollRatio * 38;
          rollBubbleRef.current.style.transform = `translateX(${pxOffset.toFixed(1)}px)`;
        }
        if (rollDegTextRef.current) {
          const r = Math.round(rollDeg);
          rollDegTextRef.current.textContent =
            r === 0 ? '0° LEVEL' : `${Math.abs(r)}° ${r > 0 ? 'R' : 'L'}`;
        }

        // Warning state classification
        const isCriticalTip = rollAbsDeg >= thetaCritDeg * 0.85;
        const isWarningTip = rollAbsDeg >= thetaCritDeg * 0.50 && !isCriticalTip;
        if (rollWarningBadgeRef.current) {
          if (isCriticalTip) {
            rollWarningBadgeRef.current.style.display = 'flex';
            rollWarningBadgeRef.current.className =
              'inline-flex items-center gap-1 rounded-md bg-rose-600/90 border border-rose-400 px-1.5 py-0.5 text-[9px] font-black text-white animate-pulse';
            rollWarningBadgeRef.current.textContent = `⚠️ TIPPING ${rollDeg > 0 ? 'RIGHT' : 'LEFT'}! (LEAN ${rollDeg > 0 ? 'Q' : 'E'})`;
          } else if (isWarningTip) {
            rollWarningBadgeRef.current.style.display = 'flex';
            rollWarningBadgeRef.current.className =
              'inline-flex items-center gap-1 rounded-md bg-amber-500/80 border border-amber-300 px-1.5 py-0.5 text-[9px] font-black text-slate-950';
            rollWarningBadgeRef.current.textContent = 'CAUTION TILT';
          } else {
            rollWarningBadgeRef.current.style.display = 'none';
          }
        }

        // H. Timber Beam Lateral Position Dot (-1.5 ft to +1.5 ft)
        const latOffsetFt = Math.max(-STANDARD_BEAM_HALF_WIDTH_FT, Math.min(STANDARD_BEAM_HALF_WIDTH_FT, s.lateralOffsetFt || 0));
        const lanePct = ((latOffsetFt + STANDARD_BEAM_HALF_WIDTH_FT) / (STANDARD_BEAM_HALF_WIDTH_FT * 2)) * 84 + 8;
        if (laneDotRef.current) {
          laneDotRef.current.style.left = `${lanePct.toFixed(1)}%`;
        }

        // I. Active Lean Status Text
        const leanInput = controlsRef.current.leanRoll;
        if (leanStatusTextRef.current) {
          leanStatusTextRef.current.textContent =
            leanInput < -0.1 ? '⯇ LEANING L' : leanInput > 0.1 ? 'LEANING R ⯈' : 'BALANCED';
          leanStatusTextRef.current.className = `text-[10px] font-black ${
            Math.abs(leanInput) > 0.1 ? 'text-amber-300' : 'text-slate-400'
          }`;
        }

        // J. Pre-Launch Dock Hype Progress & Countdown
        if (s.phase === 'hype') {
          const hypePct = Math.max(0, Math.min(100, Math.round(s.hypeEnergy || 0)));
          if (dockHypeFillRef.current) {
            dockHypeFillRef.current.style.transform = `scaleX(${(hypePct / 100).toFixed(2)})`;
          }
          if (dockHypePctRef.current) {
            dockHypePctRef.current.textContent = `${hypePct}% HYPE`;
          }
          if (dockCountdownTextRef.current) {
            const remSec = Math.max(0, (s as any).hypeCountdownSec ?? 0);
            const countNum = Math.max(1, Math.ceil(remSec));
            dockCountdownTextRef.current.textContent = `AUTO-LAUNCH IN ${countNum}s`;
          }
        }

        // K. Sector Announcement Toast Trigger
        const currentSector = getSectorForDistance(s.distanceFt || 0, courseId);
        if (currentSector.id !== lastSectorIdRef.current) {
          lastSectorIdRef.current = currentSector.id;
          setActiveToast(currentSector);
          if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
          toastTimeoutRef.current = window.setTimeout(() => {
            setActiveToast(null);
          }, 2200);
        }
      }

      rafId = window.requestAnimationFrame(updateHudFrame);
    };

    rafId = window.requestAnimationFrame(updateHudFrame);
    return () => {
      window.cancelAnimationFrame(rafId);
      if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    };
  }, [metrics.stats, simStateRef, controlsRef, courseLengthFt, courseId]);

  // Keyboard navigation & global pointer release
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        soundEngine.playSnapPop();
        onRestartRun();
        return;
      }
      if ((e.code === 'Escape' || e.code === 'KeyB') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        soundEngine.playSnapPop();
        onReturnToWorkshop();
        return;
      }
      if (e.code === 'KeyM' && onToggleMute) {
        e.preventDefault();
        onToggleMute();
        return;
      }

      // Immediate Launch on Enter during Dock Hype phase
      if (e.code === 'Enter' && simStateRef.current.phase === 'hype' && onTriggerDockLaunch) {
        e.preventDefault();
        onTriggerDockLaunch(0.92);
        return;
      }

      // Steer Left / Right
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
        e.preventDefault();
        heldSteerLeftRef.current.add(e.code);
        syncAuthoritativeControls();
      } else if (e.code === 'KeyD' || e.code === 'ArrowRight') {
        e.preventDefault();
        heldSteerRightRef.current.add(e.code);
        syncAuthoritativeControls();
      }

      // Pedal Cadence
      else if (e.code === 'KeyW' || e.code === 'ArrowUp') {
        e.preventDefault();
        lastCadenceTapTimeRef.current = performance.now();
        if (simStateRef.current.phase === 'hype') {
          simStateRef.current.hypeEnergy = Math.min(100, (simStateRef.current.hypeEnergy || 0) + 22);
          if (simStateRef.current.hypeEnergy >= 100 && onTriggerDockLaunch) {
            onTriggerDockLaunch(1.0);
          }
        }
        heldCadenceRef.current.add(e.code);
        syncAuthoritativeControls();
      }

      // Sprint Boost + Cadence
      else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'Space') {
        e.preventDefault();
        lastCadenceTapTimeRef.current = performance.now();
        if (simStateRef.current.phase === 'hype') {
          simStateRef.current.hypeEnergy = Math.min(100, (simStateRef.current.hypeEnergy || 0) + 25);
          if (simStateRef.current.hypeEnergy >= 100 && onTriggerDockLaunch) {
            onTriggerDockLaunch(1.0);
          }
        }
        heldSprintRef.current.add(e.code);
        syncAuthoritativeControls();
      }

      // Coaster Brake
      else if (e.code === 'KeyS' || e.code === 'ArrowDown') {
        e.preventDefault();
        lastCadenceTapTimeRef.current = 0;
        heldBrakeRef.current.add(e.code);
        syncAuthoritativeControls();
      }

      // Active Lean Left / Right
      else if (e.code === 'KeyQ') {
        e.preventDefault();
        heldLeanLeftRef.current.add(e.code);
        syncAuthoritativeControls();
      } else if (e.code === 'KeyE') {
        e.preventDefault();
        heldLeanRightRef.current.add(e.code);
        syncAuthoritativeControls();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
        heldSteerLeftRef.current.delete(e.code);
        syncAuthoritativeControls();
      } else if (e.code === 'KeyD' || e.code === 'ArrowRight') {
        heldSteerRightRef.current.delete(e.code);
        syncAuthoritativeControls();
      } else if (e.code === 'KeyW' || e.code === 'ArrowUp') {
        heldCadenceRef.current.delete(e.code);
        syncAuthoritativeControls();
      } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'Space') {
        heldSprintRef.current.delete(e.code);
        syncAuthoritativeControls();
      } else if (e.code === 'KeyS' || e.code === 'ArrowDown') {
        heldBrakeRef.current.delete(e.code);
        syncAuthoritativeControls();
      } else if (e.code === 'KeyQ') {
        heldLeanLeftRef.current.delete(e.code);
        syncAuthoritativeControls();
      } else if (e.code === 'KeyE') {
        heldLeanRightRef.current.delete(e.code);
        syncAuthoritativeControls();
      }
    };

    const handleGlobalPointerRelease = () => {
      let changed = false;
      if (pointerSteerRef.current !== 0) {
        pointerSteerRef.current = 0;
        changed = true;
      }
      if (pointerLeanRef.current !== 0) {
        pointerLeanRef.current = 0;
        changed = true;
      }
      if (pointerCadenceRef.current) {
        pointerCadenceRef.current = false;
        changed = true;
      }
      if (pointerSprintRef.current) {
        pointerSprintRef.current = false;
        changed = true;
      }
      if (pointerBrakeRef.current) {
        pointerBrakeRef.current = false;
        changed = true;
      }
      if (changed) {
        syncAuthoritativeControls();
      }
    };

    const handleWindowBlur = () => {
      heldSteerLeftRef.current.clear();
      heldSteerRightRef.current.clear();
      heldCadenceRef.current.clear();
      heldSprintRef.current.clear();
      heldBrakeRef.current.clear();
      heldLeanLeftRef.current.clear();
      heldLeanRightRef.current.clear();
      lastCadenceTapTimeRef.current = 0;

      pointerSteerRef.current = 0;
      pointerLeanRef.current = 0;
      pointerCadenceRef.current = false;
      pointerSprintRef.current = false;
      pointerBrakeRef.current = false;

      controlsRef.current.steer = 0;
      controlsRef.current.leanRoll = 0;
      controlsRef.current.pedalCadence = false;
      controlsRef.current.sprint = false;
      controlsRef.current.brake = false;

      if (onControlsChange) {
        onControlsChange({ ...controlsRef.current });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('pointerup', handleGlobalPointerRelease);
    window.addEventListener('pointercancel', handleGlobalPointerRelease);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('pointerup', handleGlobalPointerRelease);
      window.removeEventListener('pointercancel', handleGlobalPointerRelease);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [onRestartRun, onReturnToWorkshop, onToggleMute, onControlsChange, onTriggerDockLaunch, controlsRef, simStateRef]);

  // Phase & UI conditions derived from livePhase (guaranteed synced with simStateRef.current.phase)
  const isHypePhase = livePhase === 'hype';
  const isSplashdownPhase = livePhase === 'splashdown';
  const isFinishedPhase = livePhase === 'finished';

  return (
    <div className="fixed inset-0 pointer-events-none z-10 flex flex-col justify-between p-2 sm:p-4 select-none touch-none">
      {/* =====================================================================
          TOP TELEMETRY BAR
          ===================================================================== */}
      <div className="flex items-start justify-between gap-2">
        {/* Left: Progress Track & Distance */}
        <div className="pointer-events-auto flex flex-col gap-1.5 rounded-2xl bg-slate-950/85 border border-white/15 p-2.5 sm:p-3 shadow-xl backdrop-blur-md min-w-[180px] sm:min-w-[235px]">
          <div className="flex items-center justify-between text-[10px] font-extrabold text-slate-400 border-b border-white/10 pb-1">
            <span className="flex items-center gap-1 truncate text-slate-200">
              <span>{activeCourse.emoji}</span>
              <span className="truncate">{activeCourse.name}</span>
            </span>
            <span className="text-amber-300/90 font-mono shrink-0 ml-1">PAR {activeCourse.parTimeSec}s</span>
          </div>
          <div className="flex items-center justify-between text-xs font-black text-slate-300">
            <span className="flex items-center gap-1">
              <span>📍</span>
              <span ref={distTextRef} className="text-amber-300 font-display">0 / {courseLengthFt} FT</span>
            </span>
            <span ref={clockTextRef} className="text-sky-300 font-mono">0.0s</span>
          </div>

          {/* Continuous Progress Track Bar with Landmark Dots */}
          <div className="relative h-2.5 w-full rounded-full bg-slate-800 overflow-hidden border border-white/10">
            <div
              ref={progressFillRef}
              className="h-full w-full origin-left bg-gradient-to-r from-sky-400 via-amber-400 to-emerald-400 transition-transform duration-75"
              style={{ transform: 'scaleX(0)' }}
            />
          </div>

          {/* Landmark Sector Badges */}
          <div className="flex items-center justify-between text-[9px] font-black text-slate-400 px-0.5">
            <span>🏁 Dock</span>
            <span>🌊 Rollers</span>
            <span>🪵 Seesaw</span>
            <span>🚀 Gap</span>
            <span>🔔 {courseLengthFt}ft</span>
          </div>
        </div>

        {/* Center: Radial Speedometer Arc, Sprint Boost Pill & Compact Sector Callout */}
        <div className="pointer-events-none flex flex-col items-center">
          <div className="pointer-events-auto relative flex items-center justify-center w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-slate-950/85 border-2 border-sky-400/40 shadow-2xl backdrop-blur-md">
            {/* SVG Arc Gauge */}
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 64 64">
              <circle
                cx="32"
                cy="32"
                r="24"
                className="stroke-slate-800"
                strokeWidth="4"
                fill="none"
              />
              <circle
                ref={mphGaugeArcRef}
                cx="32"
                cy="32"
                r="24"
                className="stroke-sky-400 transition-all duration-75"
                strokeWidth="4"
                strokeDasharray="150.8"
                strokeDashoffset="150.8"
                strokeLinecap="round"
                fill="none"
              />
            </svg>

            {/* Speed Readout */}
            <div className="flex flex-col items-center justify-center z-10 leading-none">
              <span ref={mphTextRef} className="font-display text-2xl sm:text-3xl font-black text-sky-300">
                0
              </span>
              <span className="text-[9px] font-extrabold tracking-wider text-slate-400 uppercase mt-0.5">
                MPH
              </span>
            </div>
          </div>

          {/* Sprint Boost Active Pill */}
          <div
            ref={sprintBoostPillRef}
            className="flex items-center gap-1 mt-1 rounded-full bg-gradient-to-r from-red-600 to-amber-500 px-2 py-0.5 text-[9px] font-black text-white shadow-lg opacity-0 transition-opacity"
          >
            <Flame className="h-3 w-3 animate-bounce" />
            <span>SPRINT BOOST</span>
          </div>

          {/* Non-Obstructive Top-Center Sector Callout Toast */}
          {activeToast && !isHypePhase && !isSplashdownPhase && !isFinishedPhase && (
            <div className="pointer-events-none mt-1.5 flex items-center gap-2 rounded-2xl bg-slate-950/85 border border-amber-400/70 px-3 py-1.5 shadow-xl backdrop-blur-md">
              <span className="text-lg">{activeToast.emoji}</span>
              <div>
                <div className="font-display text-[11px] sm:text-xs font-black text-amber-300 leading-tight">
                  {activeToast.name}
                </div>
                <div className="text-[10px] text-slate-300 font-medium leading-tight">
                  {activeToast.advice}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Action Hub & Navigation */}
        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2">
          {onToggleMute && (
            <button
              onClick={() => {
                soundEngine.playSnapPop();
                onToggleMute();
              }}
              className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-2xl bg-slate-950/85 border border-white/15 text-slate-300 hover:text-white hover:bg-slate-800 active:scale-95 shadow-lg backdrop-blur-md transition-all"
              title={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4" />}
            </button>
          )}

          <button
            onClick={() => {
              soundEngine.playSnapPop();
              onRestartRun();
            }}
            className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-2xl bg-slate-950/85 border border-white/15 text-slate-300 hover:text-amber-300 hover:bg-slate-800 active:scale-95 shadow-lg backdrop-blur-md transition-all"
            title="Restart Run (R)"
          >
            <RotateCcw className="h-4 w-4" />
          </button>

          <button
            onClick={() => {
              soundEngine.playSnapPop();
              onReturnToWorkshop();
            }}
            className="flex items-center gap-1.5 h-9 sm:h-10 px-3 rounded-2xl bg-slate-950/85 border border-white/15 text-xs font-black text-slate-200 hover:text-sky-300 hover:bg-slate-800 active:scale-95 shadow-lg backdrop-blur-md transition-all"
            title="Return to Workshop (Esc)"
          >
            <Wrench className="h-4 w-4 text-sky-400" />
            <span className="hidden sm:inline">WORKSHOP</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          CENTER REGION: PHASE OVERLAYS (CLEAR DURING RIDING!)
          ===================================================================== */}
      <div className="flex flex-col items-center justify-center gap-2">
        {/* Pre-Run Hype Countdown Overlay */}
        {isHypePhase && (
          <div data-testid="hype-overlay" className="flex flex-col items-center justify-center">
            <div
              data-testid="dock-sync-start-dialog"
              className="pointer-events-auto flex flex-col items-center gap-2 rounded-3xl bg-slate-950/95 border-4 border-amber-400 p-4 sm:p-5 shadow-2xl backdrop-blur-lg max-w-sm text-center"
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl">🏁</span>
                <span className="font-display text-lg sm:text-xl font-black text-amber-300">
                  DOCK SYNC START!
                </span>
                <span
                  ref={dockCountdownTextRef}
                  className="rounded-full bg-amber-400/20 border border-amber-400/60 px-2 py-0.5 text-[10px] font-mono font-black text-amber-300"
                >
                  AUTO-LAUNCH IN 3s
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-snug">
                Tap <span className="font-bold text-amber-300">W / ↑ / Space</span> to build launch hype, or click below to ride immediately!
              </p>

              {/* Hype Energy Bar */}
              <div className="w-full flex flex-col gap-1">
                <div className="flex items-center justify-between text-[10px] font-black text-amber-300 px-1">
                  <span>CREW LAUNCH HYPE</span>
                  <span ref={dockHypePctRef}>0% HYPE</span>
                </div>
                <div className="w-full h-3 rounded-full bg-slate-800 border border-white/15 overflow-hidden">
                  <div
                    ref={dockHypeFillRef}
                    className="h-full w-full origin-left bg-gradient-to-r from-amber-400 to-red-500 transition-transform duration-75"
                    style={{ transform: 'scaleX(0)' }}
                  />
                </div>
              </div>

              {/* Launch Button */}
              <button
                onClick={() => {
                  soundEngine.playAirhorn?.();
                  if (onTriggerDockLaunch) onTriggerDockLaunch(0.92);
                }}
                className="mt-1 w-full flex items-center justify-center gap-2 rounded-2xl bg-amber-400 hover:bg-amber-300 active:scale-95 py-2.5 px-4 font-display text-sm font-black text-slate-950 shadow-lg transition-transform cursor-pointer"
              >
                <Zap className="h-4 w-4" />
                <span>LAUNCH NOW! (Enter)</span>
              </button>
            </div>
          </div>
        )}

        {/* Splashdown Wipeout Banner */}
        {isSplashdownPhase && (
          <div className="pointer-events-auto flex flex-col items-center gap-1 rounded-3xl bg-red-950/90 border-4 border-red-500 p-4 sm:p-5 shadow-2xl backdrop-blur-lg text-center animate-bounce">
            <div className="text-3xl">💦</div>
            <div className="font-display text-xl sm:text-2xl font-black text-red-300">
              WATER WIPEOUT!
            </div>
            <div className="text-xs font-bold text-white">
              Bike tipped off the balance beam into the canal! Preparing scorecard...
            </div>
          </div>
        )}

        {/* Finish Bell Celebration Banner */}
        {isFinishedPhase && (
          <div className="pointer-events-auto flex flex-col items-center gap-1 rounded-3xl bg-emerald-950/90 border-4 border-emerald-400 p-4 sm:p-5 shadow-2xl backdrop-blur-lg text-center animate-pulse">
            <div className="text-3xl">🔔</div>
            <div className="font-display text-xl sm:text-2xl font-black text-emerald-300">
              FINISH BELL RUNG!
            </div>
            <div className="text-xs font-bold text-white">
              Full {courseLengthFt} FT course completed! Preparing 3-Judge scorecard...
            </div>
          </div>
        )}
      </div>

      {/* =====================================================================
          BOTTOM REGION: DUAL-THUMB TOUCH CONTROLS & BALANCE INCLINOMETER
          ===================================================================== */}
      <div className="flex items-end justify-between gap-2">
        {/* Left Thumb Cluster: Steering & Active Rider Lean */}
        <div className="pointer-events-auto flex flex-col gap-1.5">
          {/* Secondary Lean Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              onPointerDown={(e) => {
                e.preventDefault();
                pointerLeanRef.current = -1;
                syncAuthoritativeControls();
              }}
              onPointerUp={() => {
                pointerLeanRef.current = 0;
                syncAuthoritativeControls();
              }}
              onPointerLeave={() => {
                if (pointerLeanRef.current === -1) {
                  pointerLeanRef.current = 0;
                  syncAuthoritativeControls();
                }
              }}
              onPointerCancel={() => {
                pointerLeanRef.current = 0;
                syncAuthoritativeControls();
              }}
              className="flex flex-col items-center justify-center h-10 w-14 sm:h-11 sm:w-16 rounded-xl bg-slate-900/90 border border-amber-400/50 text-[10px] font-black text-amber-300 active:bg-amber-400 active:text-slate-950 shadow-md transition-colors leading-tight"
              title="Lean Roll Left (Q)"
            >
              <span>⯇ LEAN</span>
              <span className="text-[8px] font-mono opacity-75">[Q]</span>
            </button>

            <button
              onPointerDown={(e) => {
                e.preventDefault();
                pointerLeanRef.current = 1;
                syncAuthoritativeControls();
              }}
              onPointerUp={() => {
                pointerLeanRef.current = 0;
                syncAuthoritativeControls();
              }}
              onPointerLeave={() => {
                if (pointerLeanRef.current === 1) {
                  pointerLeanRef.current = 0;
                  syncAuthoritativeControls();
                }
              }}
              onPointerCancel={() => {
                pointerLeanRef.current = 0;
                syncAuthoritativeControls();
              }}
              className="flex flex-col items-center justify-center h-10 w-14 sm:h-11 sm:w-16 rounded-xl bg-slate-900/90 border border-amber-400/50 text-[10px] font-black text-amber-300 active:bg-amber-400 active:text-slate-950 shadow-md transition-colors leading-tight"
              title="Lean Roll Right (E)"
            >
              <span>LEAN ⯈</span>
              <span className="text-[8px] font-mono opacity-75">[E]</span>
            </button>
          </div>

          {/* Primary Steer Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              onPointerDown={(e) => {
                e.preventDefault();
                pointerSteerRef.current = -1;
                syncAuthoritativeControls();
              }}
              onPointerUp={() => {
                pointerSteerRef.current = 0;
                syncAuthoritativeControls();
              }}
              onPointerLeave={() => {
                if (pointerSteerRef.current === -1) {
                  pointerSteerRef.current = 0;
                  syncAuthoritativeControls();
                }
              }}
              onPointerCancel={() => {
                pointerSteerRef.current = 0;
                syncAuthoritativeControls();
              }}
              className="flex flex-col items-center justify-center h-14 w-16 sm:h-16 sm:w-20 rounded-2xl bg-slate-950/90 border-2 border-sky-400 text-sky-300 active:bg-sky-400 active:text-slate-950 shadow-xl transition-colors"
              title="Steer Left (A / Left Arrow)"
            >
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="text-[10px] font-black">STEER L</span>
              <span className="text-[8px] font-mono opacity-75">[A / ←]</span>
            </button>

            <button
              onPointerDown={(e) => {
                e.preventDefault();
                pointerSteerRef.current = 1;
                syncAuthoritativeControls();
              }}
              onPointerUp={() => {
                pointerSteerRef.current = 0;
                syncAuthoritativeControls();
              }}
              onPointerLeave={() => {
                if (pointerSteerRef.current === 1) {
                  pointerSteerRef.current = 0;
                  syncAuthoritativeControls();
                }
              }}
              onPointerCancel={() => {
                pointerSteerRef.current = 0;
                syncAuthoritativeControls();
              }}
              className="flex flex-col items-center justify-center h-14 w-16 sm:h-16 sm:w-20 rounded-2xl bg-slate-950/90 border-2 border-sky-400 text-sky-300 active:bg-sky-400 active:text-slate-950 shadow-xl transition-colors"
              title="Steer Right (D / Right Arrow)"
            >
              <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="text-[10px] font-black">STEER R</span>
              <span className="text-[8px] font-mono opacity-75">[D / →]</span>
            </button>
          </div>
        </div>

        {/* Center: Lateral Balance Inclinometer & Cadence/Stamina Readouts */}
        <div className="pointer-events-auto flex flex-col items-center gap-1.5 rounded-2xl bg-slate-950/90 border border-white/15 p-2.5 sm:p-3 shadow-xl backdrop-blur-md min-w-[200px] sm:min-w-[240px]">
          {/* Roll Inclinometer Dial Header */}
          <div className="flex items-center justify-between w-full text-xs font-black">
            <span className="text-slate-400 text-[10px]">BALANCE:</span>
            <span ref={rollDegTextRef} className="text-amber-300 font-mono">0° LEVEL</span>
            <span ref={leanStatusTextRef} className="text-[10px] text-slate-400 font-black">BALANCED</span>
          </div>

          {/* Roll Bubble Balance Bar */}
          <div className="relative flex items-center justify-center w-full h-4 rounded-full bg-slate-800 border border-white/15 overflow-hidden">
            {/* Danger Edge Zones */}
            <div className="absolute left-0 top-0 bottom-0 w-2.5 bg-rose-600/40" />
            <div className="absolute right-0 top-0 bottom-0 w-2.5 bg-rose-600/40" />
            <div className="absolute top-0 bottom-0 w-0.5 bg-white/30" />

            {/* Moving Bubble */}
            <div
              ref={rollBubbleRef}
              className="h-3 w-3 rounded-full bg-amber-400 shadow-md ring-1 ring-white/50 transition-transform duration-75"
              style={{ transform: 'translateX(0px)' }}
            />
          </div>

          {/* Roll Warning Badge */}
          <div ref={rollWarningBadgeRef} style={{ display: 'none' }} />

          {/* Timber Beam Lane Position */}
          <div className="flex items-center justify-between w-full text-[9px] font-extrabold text-slate-400 pt-1 border-t border-white/10">
            <span>BEAM:</span>
            <div className="relative w-28 h-2 rounded-full bg-slate-800 border border-white/15 overflow-hidden">
              <div
                ref={laneDotRef}
                className="absolute top-0 bottom-0 w-1.5 rounded-full bg-sky-400 transition-all duration-75"
                style={{ left: '50%' }}
              />
            </div>
            <span>3.0 FT</span>
          </div>

          {/* Cadence RPM & Stamina Meter */}
          <div className="flex items-center justify-between w-full pt-1 border-t border-white/10 text-xs font-black">
            <div className="flex items-center gap-1.5">
              <div
                ref={cadencePulseRingRef}
                className="h-2.5 w-2.5 rounded-full bg-emerald-400 transition-transform duration-100"
              />
              <span ref={cadenceTextRef} className="text-emerald-300 font-mono text-[11px]">0 RPM</span>
            </div>

            <div className="flex items-center gap-1">
              <span className="text-[9px] text-slate-400 font-bold">STAMINA:</span>
              <div className="w-14 h-2 rounded-full bg-slate-800 border border-white/15 overflow-hidden">
                <div
                  ref={staminaFillRef}
                  className="h-full w-full origin-left bg-gradient-to-r from-emerald-400 to-amber-400 transition-transform duration-75"
                  style={{ transform: 'scaleX(1)' }}
                />
              </div>
              <span ref={staminaTextRef} className="text-[10px] text-amber-300 font-mono">100%</span>
            </div>
          </div>
        </div>

        {/* Right Thumb Cluster: Cadence Pedal, Sprint Boost & Brake */}
        <div className="pointer-events-auto flex flex-col items-end gap-1.5">
          {/* Secondary Action Buttons (Sprint Boost & Brake) */}
          <div className="flex items-center gap-1.5">
            <button
              onPointerDown={(e) => {
                e.preventDefault();
                lastCadenceTapTimeRef.current = 0;
                pointerBrakeRef.current = true;
                syncAuthoritativeControls();
              }}
              onPointerUp={() => {
                pointerBrakeRef.current = false;
                syncAuthoritativeControls();
              }}
              onPointerLeave={() => {
                if (pointerBrakeRef.current) {
                  pointerBrakeRef.current = false;
                  syncAuthoritativeControls();
                }
              }}
              onPointerCancel={() => {
                pointerBrakeRef.current = false;
                syncAuthoritativeControls();
              }}
              className="flex flex-col items-center justify-center h-10 w-14 sm:h-11 sm:w-16 rounded-xl bg-slate-900/90 border border-rose-500/50 text-[10px] font-black text-rose-300 active:bg-rose-500 active:text-white shadow-md transition-colors leading-tight"
              title="Coaster Brake (S / Down Arrow)"
            >
              <span>🛑 BRAKE</span>
              <span className="text-[8px] font-mono opacity-75">[S / ↓]</span>
            </button>

            <button
              onPointerDown={(e) => {
                e.preventDefault();
                lastCadenceTapTimeRef.current = performance.now();
                pointerSprintRef.current = true;
                syncAuthoritativeControls();
              }}
              onPointerUp={() => {
                pointerSprintRef.current = false;
                syncAuthoritativeControls();
              }}
              onPointerLeave={() => {
                if (pointerSprintRef.current) {
                  pointerSprintRef.current = false;
                  syncAuthoritativeControls();
                }
              }}
              onPointerCancel={() => {
                pointerSprintRef.current = false;
                syncAuthoritativeControls();
              }}
              className="flex flex-col items-center justify-center h-10 w-16 sm:h-11 sm:w-20 rounded-xl bg-gradient-to-r from-red-600/80 to-amber-500/80 border border-amber-400/50 text-[10px] font-black text-white active:scale-95 shadow-md transition-transform leading-tight"
              title="Sprint Boost (Shift / Spacebar)"
            >
              <span>⚡ SPRINT</span>
              <span className="text-[8px] font-mono opacity-80">[Space]</span>
            </button>
          </div>

          {/* Primary Action Button: Cadence Pedal Tap */}
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              lastCadenceTapTimeRef.current = performance.now();
              pointerCadenceRef.current = true;
              syncAuthoritativeControls();
              if (isHypePhase && onTriggerDockLaunch) {
                onTriggerDockLaunch(0.88);
              }
            }}
            onPointerUp={() => {
              pointerCadenceRef.current = false;
              syncAuthoritativeControls();
            }}
            onPointerLeave={() => {
              if (pointerCadenceRef.current) {
                pointerCadenceRef.current = false;
                syncAuthoritativeControls();
              }
            }}
            onPointerCancel={() => {
              pointerCadenceRef.current = false;
              syncAuthoritativeControls();
            }}
            className="flex flex-col items-center justify-center h-14 w-28 sm:h-16 sm:w-36 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-300 border-2 border-amber-200 text-slate-950 font-display font-black text-xs sm:text-sm active:scale-95 shadow-xl transition-transform leading-tight"
            title="Pedal Cadence (W / Up Arrow)"
          >
            <span className="text-sm sm:text-base">🚴 PEDAL</span>
            <span className="text-[9px] font-mono font-bold text-slate-800">[W / ↑ / Hold]</span>
          </button>
        </div>
      </div>
    </div>
  );
});

export default TandemCourseHUD;
