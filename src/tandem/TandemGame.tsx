/**
 * Red Bull Tandem Bike Challenge (Game 4)
 * Top-Level State Coordinator & Multi-Phase Gameplay Loop
 * File: src/tandem/TandemGame.tsx
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';

import type {
  TandemCategory,
  TandemLoadout,
  TandemDynoMetrics,
  TandemSimState,
  TandemControls,
  TandemScorecard,
  TandemPart,
  TandemPaintThemeId,
  TandemPhase,
} from './types.ts';

import {
  TANDEM_CATEGORIES,
  TANDEM_PART_CATALOG,
  TANDEM_PRESETS,
  TANDEM_PAINT_THEMES,
  DEFAULT_TANDEM_LOADOUT,
  getTandemPartsByCategory,
  getTandemPartById,
  sanitizeLoadout,
  computeTandemDynoMetrics,
} from './TandemPartCatalog.ts';

import {
  createInitialTandemState,
  resetTandemState,
  triggerDockSyncLaunch,
  applyWaterCannonBlast,
  updateTandemSimulationWithAccumulator,
  getCourseGeometry,
  COURSE_LENGTH_FT,
} from './TandemPhysicsEngine.ts';
import {
  DEFAULT_TANDEM_COURSE_ID,
  getTandemCourseById,
  type TandemCourseId,
} from './TandemCourses.ts';

import { TandemCanvas3D } from './TandemCanvas3D.tsx';
import { TandemWorkshopHUD, type SavedTandemSlot } from './TandemWorkshopHUD.tsx';
import { TandemCourseHUD } from './TandemCourseHUD.tsx';
import { TandemScorecardModal, calculateTandemStars } from './TandemScorecardModal.tsx';
import { soundEngine } from '../audio/SoundEngine.ts';

// ============================================================================
// 1. STORAGE KEYS & CONSTANTS
// ============================================================================

export const STORAGE_KEY_TANDEM_LOADOUT = 'tandem_loadout_v1';
export const STORAGE_KEY_TANDEM_SAVED_BUILDS = 'tandem_saved_builds_v1';
export const STORAGE_KEY_TANDEM_BEST_DIST = 'tandem_best_dist_v1';
export const STORAGE_KEY_TANDEM_BEST_TIME = 'tandem_best_time_v1';
export const STORAGE_KEY_TANDEM_COURSE_ID = 'tandem_course_id_v1';
export const STORAGE_KEY_SHARED_STARS = 'flugtag_stars_v1';

const MAX_HISTORY_LENGTH = 25;
const HYPE_COUNTDOWN_DURATION_SEC = 3.0;

export interface TandemGameProps {
  totalStars: number;
  onAddStars: (earned: number) => void;
  bestDistanceFeet?: number;
  bestDistance?: number;
  bestRecordFeet?: number;
  bestTimeSec?: number | null;
  bestTime?: number | null;
  onUpdateRecord?: (feet: number, timeSec: number | null) => void;
  onUpdateBestDistance?: (feet: number) => void;
  muted: boolean;
  onToggleMute: () => void;
  onReturnToHub: () => void;
}

export type TandemGameMode = 'workshop' | 'run' | 'scorecard';

// Safe Audio Invocation Helper
function playSafeAudio(methodName: string, ...args: any[]): void {
  const engine = soundEngine as any;
  if (typeof engine[methodName] === 'function') {
    try {
      engine[methodName](...args);
    } catch {}
  } else if (methodName === 'playSeesawThud') {
    if (typeof engine.playCrashThud === 'function') engine.playCrashThud();
  } else if (methodName === 'playCrowdCheer') {
    if (typeof engine.playUnlockFanfare === 'function') engine.playUnlockFanfare();
  }
}

// ============================================================================
// 2. STORAGE UTILITIES & SANITIZERS
// ============================================================================

function readNumberFromStorage(key: string, fallback: number = 0): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw || !raw.trim()) return fallback;
    const val = Number(raw);
    return Number.isFinite(val) ? val : fallback;
  } catch {
    return fallback;
  }
}

function loadInitialCourseId(): TandemCourseId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TANDEM_COURSE_ID);
    if (raw) {
      return getTandemCourseById(raw).id;
    }
  } catch {}
  return DEFAULT_TANDEM_COURSE_ID;
}

function loadInitialLoadout(): TandemLoadout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TANDEM_LOADOUT);
    if (raw) {
      return sanitizeLoadout(JSON.parse(raw));
    }
  } catch {}
  return { ...DEFAULT_TANDEM_LOADOUT };
}

function loadInitialSavedBuilds(): SavedTandemSlot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TANDEM_SAVED_BUILDS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((slot) => slot && typeof slot === 'object' && slot.loadout)
          .map((slot) => ({
            id: String(slot.id || `tb_${Date.now()}`),
            name: String(slot.name || 'Custom Tandem'),
            loadout: sanitizeLoadout(slot.loadout),
            createdAt: Number(slot.createdAt || Date.now()),
          }))
          .slice(0, 12);
      }
    }
  } catch {}
  return [];
}

function areLoadoutsIdentical(a: TandemLoadout, b: TandemLoadout): boolean {
  return (
    a.frameId === b.frameId &&
    a.drivetrainId === b.drivetrainId &&
    a.wheelsId === b.wheelsId &&
    a.steeringId === b.steeringId &&
    a.stabilizerId === b.stabilizerId &&
    a.topperId === b.topperId &&
    a.paintThemeId === b.paintThemeId
  );
}

// ============================================================================
// 3. 3-JUDGE SCORECARD EVALUATION
// ============================================================================

export function computeTandemScorecard(
  simState: TandemSimState,
  loadout: TandemLoadout,
  metrics: TandemDynoMetrics,
  bestDist: number,
  bestTime: number | null,
  courseId?: string
): TandemScorecard {
  const course = getTandemCourseById(courseId || simState.courseId);
  const targetLengthFt = simState.courseLengthFt || course.lengthFt || COURSE_LENGTH_FT;
  const parSec = course.parTimeSec || 32.0;

  // Judge 1: Creativity & Theme (0..10)
  const creativityScore = Math.max(1, Math.min(10, Math.round((metrics.creativityScore / 100) * 10)));

  // Judge 2: Showmanship & Crew Sync (0..10)
  const syncRatio = (simState.stokerSyncPct || 70) / 100;
  const hypeRatio = (simState.hypeEnergy || 50) / 100;
  const showmanshipScore = Math.max(1, Math.min(10, Math.round(5.0 + syncRatio * 3.0 + hypeRatio * 2.0)));

  // Judge 3: Course Distance & Finish Time (0..10)
  let distanceTimeScore = 1;
  const completed = simState.distanceFt >= targetLengthFt || simState.phase === 'finished';
  if (completed) {
    const timeSec = simState.timeElapsedSec || 20;
    if (timeSec <= parSec || timeSec < 22) distanceTimeScore = 10;
    else if (timeSec <= parSec * 1.18) distanceTimeScore = 9;
    else if (timeSec <= parSec * 1.40) distanceTimeScore = 8;
    else distanceTimeScore = 7;
  } else {
    const fraction = Math.max(0, Math.min(1.0, simState.distanceFt / targetLengthFt));
    distanceTimeScore = Math.max(1, Math.min(9, Math.round(fraction * 9)));
  }

  const totalScore = creativityScore + showmanshipScore + distanceTimeScore;

  // Star tiers: >=26 -> 3 stars, >=20 -> 2 stars, else 1 star
  const starsEarned = (calculateTandemStars(totalScore) as 1 | 2 | 3);

  const newDistanceRecord = simState.distanceFt > bestDist;
  const finishTimeSec = completed ? Number(simState.timeElapsedSec.toFixed(2)) : null;
  const newTimeRecord = completed && (bestTime === null || finishTimeSec! < bestTime);

  return {
    creativityScore,
    showmanshipScore,
    distanceTimeScore,
    totalScore,
    starsEarned,
    newDistanceRecord,
    newTimeRecord,
    finishTimeSec,
    completedCourse: completed,
    distanceFt: Math.round(simState.distanceFt),
    courseId: course.id,
    courseName: course.name,
    courseLengthFt: targetLengthFt,
  };
}

// ============================================================================
// 4. MAIN TANDEM GAME COMPONENT
// ============================================================================

export const TandemGame: React.FC<TandemGameProps> = ({
  totalStars,
  onAddStars,
  bestDistanceFeet: propBestDistFeet,
  bestDistance: propBestDist,
  bestRecordFeet: propBestRecordFeet,
  bestTimeSec: propBestTimeSec,
  bestTime: propBestTime,
  onUpdateRecord,
  onUpdateBestDistance,
  muted,
  onToggleMute,
  onReturnToHub,
}) => {
  // Normalize Props with local storage fallbacks
  const effectiveBestDist = useMemo(() => {
    return Math.max(
      0,
      propBestDistFeet ?? propBestDist ?? propBestRecordFeet ?? readNumberFromStorage(STORAGE_KEY_TANDEM_BEST_DIST, 0)
    );
  }, [propBestDistFeet, propBestDist, propBestRecordFeet]);

  const effectiveBestTime = useMemo(() => {
    const val = propBestTimeSec ?? propBestTime ?? readNumberFromStorage(STORAGE_KEY_TANDEM_BEST_TIME, 0);
    return val && val > 0 ? val : null;
  }, [propBestTimeSec, propBestTime]);

  // Mode, Course, and Loadout State
  const [mode, setMode] = useState<TandemGameMode>('workshop');
  const [selectedCourseId, setSelectedCourseId] = useState<TandemCourseId>(loadInitialCourseId);
  const [loadout, setLoadout] = useState<TandemLoadout>(loadInitialLoadout);
  const [history, setHistory] = useState<{ past: TandemLoadout[]; future: TandemLoadout[] }>({
    past: [],
    future: [],
  });
  const [savedBuilds, setSavedBuilds] = useState<SavedTandemSlot[]>(loadInitialSavedBuilds);
  const [selectedCategory, setSelectedCategory] = useState<TandemCategory>('frame');

  // Dyno Rig Test State
  const [dynoActive, setDynoActive] = useState<boolean>(false);
  const [dynoTiltAngleDeg, setDynoTiltAngleDeg] = useState<number>(0);
  const [dynoSwayAuto, setDynoSwayAuto] = useState<boolean>(false);

  // Authoritative Simulation State & Controls Refs
  const simStateRef = useRef<TandemSimState>(createInitialTandemState(selectedCourseId));
  const [hudSimState, setHudSimState] = useState<TandemSimState>(() => createInitialTandemState(selectedCourseId));
  const [scorecard, setScorecard] = useState<TandemScorecard | null>(null);
  const [newlyUnlockedParts, setNewlyUnlockedParts] = useState<TandemPart[]>([]);

  const controlsRef = useRef<TandemControls>({
    steer: 0,
    pedalCadence: false,
    sprint: false,
    brake: false,
    leanRoll: 0,
  });

  // Loop & Timing Refs
  const rafIdRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const hypeCountdownRef = useRef<number>(HYPE_COUNTDOWN_DURATION_SEC);
  const transitionTimerRef = useRef<number | null>(null);
  const hasAwardedStarsRef = useRef<boolean>(false);
  const lastCadenceAudioTimeRef = useRef<number>(0);

  // Synchronized Reference Mirrors
  const courseIdRef = useRef<TandemCourseId>(selectedCourseId);
  courseIdRef.current = selectedCourseId;
  const loadoutRef = useRef(loadout);
  loadoutRef.current = loadout;
  const historyRef = useRef(history);
  historyRef.current = history;
  const totalStarsRef = useRef(totalStars);
  totalStarsRef.current = totalStars;
  const bestDistRef = useRef(effectiveBestDist);
  bestDistRef.current = effectiveBestDist;
  const bestTimeRef = useRef(effectiveBestTime);
  bestTimeRef.current = effectiveBestTime;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // Real-Time Engineering Metrics
  const metrics = useMemo(() => computeTandemDynoMetrics(loadout), [loadout]);
  const metricsRef = useRef(metrics);
  metricsRef.current = metrics;

  const handleSelectCourse = useCallback((courseId: TandemCourseId) => {
    soundEngine.playSnapPop();
    courseIdRef.current = courseId;
    setSelectedCourseId(courseId);
    try {
      localStorage.setItem(STORAGE_KEY_TANDEM_COURSE_ID, courseId);
    } catch {}
  }, []);

  // Persist Loadout Changes
  const persistLoadout = useCallback((next: TandemLoadout) => {
    try {
      localStorage.setItem(STORAGE_KEY_TANDEM_LOADOUT, JSON.stringify(next));
    } catch {}
  }, []);

  const pushLoadoutChange = useCallback((updater: TandemLoadout | ((prev: TandemLoadout) => TandemLoadout)) => {
    const cur = loadoutRef.current;
    const next = typeof updater === 'function' ? updater(cur) : updater;
    if (areLoadoutsIdentical(cur, next)) return;

    loadoutRef.current = next;
    setLoadout(next);
    persistLoadout(next);

    setHistory((prev) => ({
      past: [...prev.past.slice(-(MAX_HISTORY_LENGTH - 1)), cur],
      future: [],
    }));
  }, [persistLoadout]);

  const handleUndo = useCallback(() => {
    const { past, future } = historyRef.current;
    if (past.length === 0) return;
    soundEngine.playSnapPop();

    const previous = past[past.length - 1];
    const newPast = past.slice(0, -1);
    const newFuture = [loadoutRef.current, ...future.slice(0, MAX_HISTORY_LENGTH - 1)];

    loadoutRef.current = previous;
    setLoadout(previous);
    persistLoadout(previous);
    setHistory({ past: newPast, future: newFuture });
  }, [persistLoadout]);

  const handleRedo = useCallback(() => {
    const { past, future } = historyRef.current;
    if (future.length === 0) return;
    soundEngine.playSnapPop();

    const [next, ...rest] = future;
    const newPast = [...past.slice(-(MAX_HISTORY_LENGTH - 1)), loadoutRef.current];

    loadoutRef.current = next;
    setLoadout(next);
    persistLoadout(next);
    setHistory({ past: newPast, future: rest });
  }, [persistLoadout]);

  const handleSelectCategory = useCallback((cat: TandemCategory) => {
    soundEngine.playSnapPop();
    setSelectedCategory(cat);
  }, []);

  const handleEquipPart = useCallback((category: TandemCategory, partId: string) => {
    soundEngine.playSnapPop();
    const key = `${category}Id` as keyof TandemLoadout;
    pushLoadoutChange((prev) => ({ ...prev, [key]: partId }));
  }, [pushLoadoutChange]);

  const handleSelectPaint = useCallback((paintThemeId: TandemPaintThemeId | string) => {
    soundEngine.playSnapPop();
    pushLoadoutChange((prev) => ({ ...prev, paintThemeId }));
  }, [pushLoadoutChange]);

  const handleApplyPreset = useCallback((preset: TandemLoadout) => {
    soundEngine.playSnapPop();
    pushLoadoutChange(preset);
  }, [pushLoadoutChange]);

  const handleRandomizeLoadout = useCallback(() => {
    soundEngine.playSnapPop();
    const curStars = totalStarsRef.current;
    const pickRandom = (cat: TandemCategory) => {
      const parts = getTandemPartsByCategory(cat);
      const unlocked = parts.filter((p) => p.unlockStars <= curStars);
      const pool = unlocked.length > 0 ? unlocked : parts;
      return pool[Math.floor(Math.random() * pool.length)].id;
    };
    const randomTheme = TANDEM_PAINT_THEMES[Math.floor(Math.random() * TANDEM_PAINT_THEMES.length)].id;

    pushLoadoutChange({
      frameId: pickRandom('frame'),
      drivetrainId: pickRandom('drivetrain'),
      wheelsId: pickRandom('wheels'),
      steeringId: pickRandom('steering'),
      stabilizerId: pickRandom('stabilizer'),
      topperId: pickRandom('topper'),
      paintThemeId: randomTheme,
    });
  }, [pushLoadoutChange]);

  const handleSaveCurrentBuild = useCallback((customName?: string) => {
    soundEngine.playUnlockFanfare();
    const cur = loadoutRef.current;
    const topper = getTandemPartById(cur.topperId, 'topper');
    const frame = getTandemPartById(cur.frameId, 'frame');
    const badge = topper.emoji || frame.emoji || '🚲';
    const autoName = `${badge} ${topper.name.split(' ')[0]} ${frame.name.split(' ')[0]} #${savedBuilds.length + 1}`;

    const newSlot: SavedTandemSlot = {
      id: `tb_${Date.now()}`,
      name: customName && customName.trim() ? customName.trim() : autoName,
      loadout: { ...cur },
      createdAt: Date.now(),
    };

    setSavedBuilds((prev) => {
      const updated = [newSlot, ...prev].slice(0, 12);
      try {
        localStorage.setItem(STORAGE_KEY_TANDEM_SAVED_BUILDS, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, [savedBuilds.length]);

  const handleDeleteSavedBuild = useCallback((id: string) => {
    soundEngine.playSnapPop();
    setSavedBuilds((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      try {
        localStorage.setItem(STORAGE_KEY_TANDEM_SAVED_BUILDS, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  const handleLoadSavedBuild = useCallback((slot: SavedTandemSlot) => {
    soundEngine.playSnapPop();
    pushLoadoutChange(slot.loadout);
  }, [pushLoadoutChange]);

  const handleToggleDyno = useCallback(() => {
    soundEngine.playFanWhoosh?.();
    setDynoActive((prev) => !prev);
  }, []);

  // ==========================================================================
  // 5. GAMEPLAY LOOP & PHASE TRANSITIONS
  // ==========================================================================

  const triggerPostRunConclusion = useCallback((isCompleted: boolean) => {
    const finalSim = { ...simStateRef.current };
    const activeCourse = getTandemCourseById(courseIdRef.current);
    const finalScorecard = computeTandemScorecard(
      finalSim,
      loadoutRef.current,
      metricsRef.current,
      bestDistRef.current,
      bestTimeRef.current,
      activeCourse.id
    );

    setScorecard(finalScorecard);

    // Idempotent Star Awarding
    if (!hasAwardedStarsRef.current) {
      hasAwardedStarsRef.current = true;
      const prevStars = totalStarsRef.current;
      const nextStars = prevStars + finalScorecard.starsEarned;
      totalStarsRef.current = nextStars;
      onAddStars(finalScorecard.starsEarned);

      // Check part unlocks
      const newlyUnlocked = TANDEM_PART_CATALOG.filter(
        (p) => p.unlockStars > prevStars && p.unlockStars <= nextStars
      );
      setNewlyUnlockedParts(newlyUnlocked);
    }

    // Persist Personal Best Distance
    const finalDist = Math.round(finalSim.distanceFt);
    if (finalDist > bestDistRef.current) {
      bestDistRef.current = finalDist;
      try {
        localStorage.setItem(STORAGE_KEY_TANDEM_BEST_DIST, String(finalDist));
      } catch {}
      if (onUpdateRecord) onUpdateRecord(finalDist, bestTimeRef.current);
      if (onUpdateBestDistance) onUpdateBestDistance(finalDist);
    }

    // Persist Personal Best Time
    if (isCompleted) {
      const finishTime = Number((finalSim.timeElapsedSec || 0).toFixed(2));
      let newBestTime = bestTimeRef.current;
      if (bestTimeRef.current === null || finishTime < bestTimeRef.current) {
        newBestTime = finishTime;
        bestTimeRef.current = newBestTime;
        try {
          localStorage.setItem(STORAGE_KEY_TANDEM_BEST_TIME, String(newBestTime));
        } catch {}
        if (onUpdateRecord) onUpdateRecord(Math.max(activeCourse.lengthFt, finalDist), newBestTime);
      }
    }

    setMode('scorecard');
  }, [onAddStars, onUpdateRecord, onUpdateBestDistance]);

  const handleStartCourseRun = useCallback(() => {
    if (transitionTimerRef.current) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }

    hasAwardedStarsRef.current = false;
    hypeCountdownRef.current = HYPE_COUNTDOWN_DURATION_SEC;
    lastTimeRef.current = performance.now();

    const initialState = createInitialTandemState(courseIdRef.current);
    (initialState as any).hypeCountdownSec = HYPE_COUNTDOWN_DURATION_SEC;
    simStateRef.current = initialState;
    setHudSimState({ ...initialState });

    controlsRef.current = {
      steer: 0,
      pedalCadence: false,
      sprint: false,
      brake: false,
      leanRoll: 0,
    };

    setMode('run');
    playSafeAudio('playAirhorn');
  }, []);

  const handleReturnToWorkshop = useCallback(() => {
    if (transitionTimerRef.current) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
    resetTandemState(simStateRef.current, courseIdRef.current);
    controlsRef.current = {
      steer: 0,
      pedalCadence: false,
      sprint: false,
      brake: false,
      leanRoll: 0,
    };
    setMode('workshop');
  }, []);

  const handleTriggerDockLaunch = useCallback((intensity = 0.85) => {
    if (simStateRef.current.phase === 'hype') {
      hypeCountdownRef.current = 0;
      (simStateRef.current as any).hypeCountdownSec = 0;
      triggerDockSyncLaunch(simStateRef.current, intensity);
      playSafeAudio('playAirhorn');
      setHudSimState({ ...simStateRef.current });
    }
  }, []);

  // 120Hz Physics Accumulator Loop in rAF
  useEffect(() => {
    if (mode !== 'run') return;

    let localRafId = 0;
    lastTimeRef.current = performance.now();

    const physicsLoopTick = (now: number) => {
      localRafId = requestAnimationFrame(physicsLoopTick);

      const dtRaw = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;
      const dtClamped = Math.max(0.001, Math.min(0.1, dtRaw));

      const s = simStateRef.current;
      const controls = controlsRef.current;
      const stats = metricsRef.current.stats;
      const courseDef = getTandemCourseById(courseIdRef.current);

      // 1. DOCK HYPE START PHASE
      if (s.phase === 'hype') {
        hypeCountdownRef.current = Math.max(0, hypeCountdownRef.current - dtClamped);
        (s as any).hypeCountdownSec = hypeCountdownRef.current;

        // Spacebar or Cadence taps contribute to hype energy
        if (controls.pedalCadence || controls.sprint) {
          s.hypeEnergy = Math.min(100, (s.hypeEnergy || 0) + dtClamped * 60);
        }

        // Clamp distance to 0 during hype phase
        s.distanceFt = 0;
        s.speedMph = 0;
        (s as any).distanceFeet = 0;
        (s as any).mph = 0;

        if (hypeCountdownRef.current <= 0 || (s.hypeEnergy || 0) >= 100) {
          const syncIntensity = Math.min(1.0, 0.65 + ((s.hypeEnergy || 0) / 100) * 0.35);
          hypeCountdownRef.current = 0;
          (s as any).hypeCountdownSec = 0;
          triggerDockSyncLaunch(s, syncIntensity);
          playSafeAudio('playAirhorn');
          setHudSimState({ ...s });
        }
      }

      // 2. ACTIVE RIDING PHASE (120Hz Physics Stepping)
      else if (s.phase === 'riding') {
        const prevDistFt = s.distanceFt;
        updateTandemSimulationWithAccumulator(s, stats, controls, dtClamped);

        // Sound Engine Cadence Click
        if (controls.pedalCadence && s.speedMph > 0 && now - lastCadenceAudioTimeRef.current > 150) {
          lastCadenceAudioTimeRef.current = now;
          playSafeAudio('playPedalCrank');
        }

        // Obstacle Audio & Impulse Cues (Seesaw fulcrum pivot & Water Cannon spray)
        if (prevDistFt < courseDef.seesawFulcrumFt && s.distanceFt >= courseDef.seesawFulcrumFt) {
          playSafeAudio('playSeesawThud');
        }
        for (const cannonFt of courseDef.waterCannonStationsFt) {
          if (prevDistFt < cannonFt && s.distanceFt >= cannonFt) {
            playSafeAudio('playSplash', 0.35);
            applyWaterCannonBlast(s, 0.32, stats);
          }
        }

        // Detect Splashdown Trigger
        if ((s.phase as TandemPhase) === 'splashdown') {
          s.speedMph = 0;
          (s as any).mph = 0;
          controls.steer = 0;
          controls.leanRoll = 0;
          controls.pedalCadence = false;
          controls.sprint = false;
          controls.brake = false;

          playSafeAudio('playSplash', 0.85);
          setHudSimState({ ...s });

          if (!transitionTimerRef.current) {
            transitionTimerRef.current = window.setTimeout(() => {
              triggerPostRunConclusion(false);
            }, 2500);
          }
        }

        // Detect Finish Bell Platform Crossing
        else if ((s.phase as TandemPhase) === 'finished' || s.distanceFt >= courseDef.lengthFt) {
          s.phase = 'finished';
          s.hasFinished = true;
          s.distanceFt = Math.max(courseDef.lengthFt, s.distanceFt);

          playSafeAudio('playCanalBell', true);
          playSafeAudio('playCrowdCheer');
          setHudSimState({ ...s });

          if (typeof confetti === 'function') {
            try {
              confetti({ particleCount: 90, spread: 70, origin: { x: 0.2, y: 0.6 } });
              confetti({ particleCount: 90, spread: 70, origin: { x: 0.8, y: 0.6 } });
            } catch {}
          }

          if (!transitionTimerRef.current) {
            transitionTimerRef.current = window.setTimeout(() => {
              triggerPostRunConclusion(true);
            }, 2000);
          }
        }
      }

      // 3. SPLASHDOWN FREEZE
      else if (s.phase === 'splashdown') {
        s.speedMph = 0;
        (s as any).mph = 0;
        controls.steer = 0;
        controls.leanRoll = 0;
        controls.pedalCadence = false;
        controls.sprint = false;
        controls.brake = false;
      }

      // 4. FINISHED FREEZE
      else if (s.phase === 'finished') {
        s.distanceFt = Math.max(courseDef.lengthFt, s.distanceFt);
      }
    };

    localRafId = requestAnimationFrame(physicsLoopTick);
    return () => {
      cancelAnimationFrame(localRafId);
      if (transitionTimerRef.current) {
        window.clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }
    };
  }, [mode, triggerPostRunConclusion]);

  // Global Escape Key Listener
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        soundEngine.playSnapPop();
        if (modeRef.current === 'run' || modeRef.current === 'scorecard') {
          handleReturnToWorkshop();
        } else {
          onReturnToHub();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleReturnToWorkshop, onReturnToHub]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950 select-none">
      {/* 3D WEBGL CANVAS LAYER */}
      <div className="absolute inset-0 z-0">
        <TandemCanvas3D
          mode={mode === 'workshop' ? 'workshop' : 'course'}
          courseId={selectedCourseId}
          loadout={loadout}
          metrics={metrics}
          selectedCategory={selectedCategory}
          dynoActive={dynoActive}
          dynoTiltAngleDeg={dynoTiltAngleDeg}
          dynoSwayAuto={dynoSwayAuto}
          paused={mode === 'scorecard'}
          simStateRef={simStateRef}
          bestDistanceFeet={effectiveBestDist}
          bestTimeSec={effectiveBestTime}
          onSelectCategory={handleSelectCategory}
        />
      </div>

      {/* WORKSHOP HUD OVERLAY */}
      {mode === 'workshop' && (
        <TandemWorkshopHUD
          loadout={loadout}
          metrics={metrics}
          selectedCategory={selectedCategory}
          onSelectCategory={handleSelectCategory}
          onEquipPart={handleEquipPart}
          onSelectPaint={handleSelectPaint}
          onApplyPreset={handleApplyPreset}
          onRandomizeLoadout={handleRandomizeLoadout}
          selectedCourseId={selectedCourseId}
          onSelectCourse={handleSelectCourse}
          canUndo={history.past.length > 0}
          canRedo={history.future.length > 0}
          onUndo={handleUndo}
          onRedo={handleRedo}
          totalStars={totalStars}
          savedBuilds={savedBuilds}
          onSaveCurrentBuild={handleSaveCurrentBuild}
          onDeleteSavedBuild={handleDeleteSavedBuild}
          onLoadSavedBuild={handleLoadSavedBuild}
          dynoActive={dynoActive}
          onToggleDyno={handleToggleDyno}
          dynoTiltAngleDeg={dynoTiltAngleDeg}
          onChangeDynoTiltAngle={setDynoTiltAngleDeg}
          onStartCourseRun={handleStartCourseRun}
          onReturnToHub={onReturnToHub}
          muted={muted}
          onToggleMute={onToggleMute}
          bestDistanceFeet={effectiveBestDist}
          bestTimeSec={effectiveBestTime}
        />
      )}

      {/* COURSE RUN HUD OVERLAY */}
      {mode === 'run' && (
        <TandemCourseHUD
          simState={hudSimState}
          simStateRef={simStateRef}
          controlsRef={controlsRef}
          metrics={metrics}
          courseId={selectedCourseId}
          bestDistanceFeet={effectiveBestDist}
          bestTimeSec={effectiveBestTime}
          onTriggerDockLaunch={handleTriggerDockLaunch}
          onRestartRun={handleStartCourseRun}
          onReturnToWorkshop={handleReturnToWorkshop}
          muted={muted}
          onToggleMute={onToggleMute}
        />
      )}

      {/* 3-JUDGE SCORECARD MODAL */}
      {mode === 'scorecard' && scorecard && (
        <TandemScorecardModal
          scorecard={scorecard}
          simState={simStateRef.current}
          totalStars={totalStars}
          bestDistanceFeet={effectiveBestDist}
          bestTimeSec={effectiveBestTime}
          newlyUnlockedParts={newlyUnlockedParts}
          onRideAgain={handleStartCourseRun}
          onBackToWorkshop={handleReturnToWorkshop}
          onReturnToHub={onReturnToHub}
        />
      )}
    </div>
  );
};

export default TandemGame;
