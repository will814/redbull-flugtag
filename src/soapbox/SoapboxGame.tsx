import React, { useCallback, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  getSoapboxPartById,
  getSoapboxPartsByCategory,
  SOAPBOX_PAINT_THEMES,
  SOAPBOX_PART_CATALOG,
  SOAPBOX_PRESETS,
  SoapboxLoadout,
  SoapboxPaintThemeId,
  SoapboxPart,
  SoapboxPartCategory,
} from './SoapboxPartCatalog';
import { computeSoapboxMetrics } from './SoapboxMetrics';
import {
  createInitialSoapboxState,
  dropSoapboxStartGate,
  SoapboxSimulationState,
  triggerSoapboxActionTap,
} from './SoapboxPhysicsEngine';
import { SoapboxCourseId } from './SoapboxCourses';
import { SoapboxCanvas3D } from './SoapboxCanvas3D';
import { SavedSoapboxSlot, SoapboxGarageHUD } from './SoapboxGarageHUD';
import { SoapboxRaceHUD } from './SoapboxRaceHUD';
import { SoapboxScorecardModal } from './SoapboxScorecardModal';
import { soundEngine } from '../audio/SoundEngine';

export interface SoapboxGameProps {
  totalStars: number;
  onAddStars: (earned: number) => void;
  bestRecordFeet: number;
  bestTimeSec: number | null;
  onUpdateRecord: (feet: number, timeSec: number | null) => void;
  muted: boolean;
  onToggleMute: () => void;
  onReturnToHub: () => void;
}

export const STORAGE_KEY_SOAPBOX_LOADOUT = 'soapbox_standalone_loadout_v1';
export const STORAGE_KEY_SOAPBOX_SAVED = 'soapbox_standalone_saved_builds_v1';
export const STORAGE_KEY_SOAPBOX_COURSE = 'soapbox_standalone_selected_course_v1';
export const VALID_SOAPBOX_COURSE_IDS: SoapboxCourseId[] = [
  'alpine_panorama',
  'canyon_plunge',
  'urban_downhill',
  'extreme_peak',
];
const MAX_HISTORY_LENGTH = 25;

export function loadInitialSoapboxCourse(): SoapboxCourseId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SOAPBOX_COURSE);
    if (raw && (VALID_SOAPBOX_COURSE_IDS as string[]).includes(raw)) {
      return raw as SoapboxCourseId;
    }
  } catch {
    // ignore
  }
  return 'alpine_panorama';
}

function loadInitialSoapboxLoadout(): SoapboxLoadout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SOAPBOX_LOADOUT);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SoapboxLoadout>;
      if (parsed && parsed.chassis && parsed.steering && parsed.wheels) {
        return {
          name: parsed.name || SOAPBOX_PRESETS[0].name,
          chassis: parsed.chassis,
          steering: parsed.steering,
          wheels: parsed.wheels,
          suspension: parsed.suspension || SOAPBOX_PRESETS[0].suspension,
          brakes: parsed.brakes || SOAPBOX_PRESETS[0].brakes,
          topper: parsed.topper || SOAPBOX_PRESETS[0].topper,
          paintTheme: parsed.paintTheme || SOAPBOX_PRESETS[0].paintTheme,
        };
      }
    }
  } catch {
    // ignore
  }
  return SOAPBOX_PRESETS[0];
}

function loadInitialSavedSoapboxes(): SavedSoapboxSlot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SOAPBOX_SAVED);
    if (raw) {
      return JSON.parse(raw) as SavedSoapboxSlot[];
    }
  } catch {
    // ignore
  }
  return [];
}

export const SoapboxGame: React.FC<SoapboxGameProps> = ({
  totalStars,
  onAddStars,
  bestRecordFeet,
  bestTimeSec,
  onUpdateRecord,
  muted,
  onToggleMute,
  onReturnToHub,
}) => {
  const [mode, setMode] = useState<'garage' | 'race'>('garage');
  const [loadout, setLoadout] = useState<SoapboxLoadout>(loadInitialSoapboxLoadout);
  const [history, setHistory] = useState<{ entries: SoapboxLoadout[]; index: number }>(
    () => ({
      entries: [loadInitialSoapboxLoadout()],
      index: 0,
    })
  );
  const [savedBuilds, setSavedBuilds] = useState<SavedSoapboxSlot[]>(
    loadInitialSavedSoapboxes
  );
  const [selectedCategory, setSelectedCategory] =
    useState<SoapboxPartCategory>('chassis');
  const [selectedCourseId, setSelectedCourseId] =
    useState<SoapboxCourseId>(loadInitialSoapboxCourse);
  const selectedCourseIdRef = useRef<SoapboxCourseId>(selectedCourseId);
  selectedCourseIdRef.current = selectedCourseId;
  const [shakerRigActive, setShakerRigActive] = useState<boolean>(false);

  const loadoutRef = useRef(loadout);
  loadoutRef.current = loadout;
  const historyRef = useRef(history);
  historyRef.current = history;
  const totalStarsRef = useRef(totalStars);
  totalStarsRef.current = totalStars;

  const simStateRef = useRef<SoapboxSimulationState>(createInitialSoapboxState(selectedCourseId));
  const [hudSimState, setHudSimState] = useState<SoapboxSimulationState>(() =>
    createInitialSoapboxState(selectedCourseId)
  );
  const [showScorecardModal, setShowScorecardModal] = useState<boolean>(false);
  const [newlyUnlockedParts, setNewlyUnlockedParts] = useState<SoapboxPart[]>([]);

  const handleSelectCourse = useCallback((courseId: SoapboxCourseId) => {
    soundEngine.playSnapPop();
    setSelectedCourseId(courseId);
    try {
      localStorage.setItem(STORAGE_KEY_SOAPBOX_COURSE, courseId);
    } catch {
      // ignore
    }
    const fresh = createInitialSoapboxState(courseId);
    simStateRef.current = fresh;
    setHudSimState(fresh);
  }, []);

  const metrics = useMemo(() => computeSoapboxMetrics(loadout), [loadout]);
  const metricsRef = useRef(metrics);
  metricsRef.current = metrics;

  const persistLoadout = useCallback((next: SoapboxLoadout) => {
    try {
      localStorage.setItem(STORAGE_KEY_SOAPBOX_LOADOUT, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const pushLoadoutChange = useCallback(
    (updater: SoapboxLoadout | ((prev: SoapboxLoadout) => SoapboxLoadout)) => {
      const prev = loadoutRef.current;
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (next === prev) return;

      loadoutRef.current = next;
      setLoadout(next);
      persistLoadout(next);

      const h = historyRef.current;
      const sliced = h.entries.slice(0, h.index + 1);
      const updated = [...sliced, next].slice(-MAX_HISTORY_LENGTH);
      const nextHistory = {
        entries: updated,
        index: updated.length - 1,
      };
      historyRef.current = nextHistory;
      setHistory(nextHistory);
    },
    [persistLoadout]
  );

  const canUndo = history.index > 0;
  const canRedo = history.index < history.entries.length - 1;

  const handleUndo = useCallback(() => {
    const h = historyRef.current;
    if (h.index <= 0) return;
    const nextIndex = h.index - 1;
    const target = h.entries[nextIndex];
    soundEngine.playSnapPop();
    loadoutRef.current = target;
    setLoadout(target);
    persistLoadout(target);
    const nextHistory = { ...h, index: nextIndex };
    historyRef.current = nextHistory;
    setHistory(nextHistory);
  }, [persistLoadout]);

  const handleRedo = useCallback(() => {
    const h = historyRef.current;
    if (h.index >= h.entries.length - 1) return;
    const nextIndex = h.index + 1;
    const target = h.entries[nextIndex];
    soundEngine.playSnapPop();
    loadoutRef.current = target;
    setLoadout(target);
    persistLoadout(target);
    const nextHistory = { ...h, index: nextIndex };
    historyRef.current = nextHistory;
    setHistory(nextHistory);
  }, [persistLoadout]);

  const handleEquipPart = useCallback(
    (category: SoapboxPartCategory, partId: string) => {
      soundEngine.playSnapPop();
      pushLoadoutChange((prev) =>
        prev[category] === partId ? prev : { ...prev, [category]: partId }
      );
    },
    [pushLoadoutChange]
  );

  const handleSelectPaint = useCallback(
    (paintTheme: SoapboxPaintThemeId) => {
      soundEngine.playSnapPop();
      pushLoadoutChange((prev) =>
        prev.paintTheme === paintTheme ? prev : { ...prev, paintTheme }
      );
    },
    [pushLoadoutChange]
  );

  const handleApplyPreset = useCallback(
    (preset: SoapboxLoadout) => {
      soundEngine.playSnapPop();
      pushLoadoutChange({ ...preset });
    },
    [pushLoadoutChange]
  );

  const handleRandomizeSoapbox = useCallback(() => {
    soundEngine.playSnapPop();
    const curStars = totalStarsRef.current;
    const pickRandom = (cat: SoapboxPartCategory) => {
      const catParts = getSoapboxPartsByCategory(cat);
      const unlocked = catParts.filter((p) => p.unlockStars <= curStars);
      const pool = unlocked.length > 0 ? unlocked : catParts;
      return pool[Math.floor(Math.random() * pool.length)].id;
    };
    const randomTheme =
      SOAPBOX_PAINT_THEMES[
        Math.floor(Math.random() * SOAPBOX_PAINT_THEMES.length)
      ].id;

    pushLoadoutChange({
      name: '🎲 Mystery Downhill Spec',
      chassis: pickRandom('chassis'),
      steering: pickRandom('steering'),
      wheels: pickRandom('wheels'),
      suspension: pickRandom('suspension'),
      brakes: pickRandom('brakes'),
      topper: pickRandom('topper'),
      paintTheme: randomTheme,
    });
  }, [pushLoadoutChange]);

  const handleSaveCurrentBuild = useCallback((customName?: string) => {
    soundEngine.playUnlockFanfare();
    const cur = loadoutRef.current;
    const cPart = getSoapboxPartById(cur.chassis, 'chassis');
    const tPart = getSoapboxPartById(cur.topper, 'topper');
    const badge = tPart.id !== 'sb_topper_none' ? tPart.emoji : cPart.emoji;

    setSavedBuilds((prev) => {
      const finalName = customName || `${badge} Custom Derby #${prev.length + 1}`;
      const newSlot: SavedSoapboxSlot = {
        id: `sb_save_${Date.now()}`,
        name: finalName,
        loadout: { ...cur, name: finalName },
        createdAt: Date.now(),
      };
      const updated = [newSlot, ...prev].slice(0, 12);
      try {
        localStorage.setItem(STORAGE_KEY_SOAPBOX_SAVED, JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  }, []);

  const handleDeleteSavedBuild = useCallback((id: string) => {
    soundEngine.playSnapPop();
    setSavedBuilds((prev) => {
      const updated = prev.filter((b) => b.id !== id);
      try {
        localStorage.setItem(STORAGE_KEY_SOAPBOX_SAVED, JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  }, []);

  const handleToggleShakerRig = useCallback(() => {
    soundEngine.playFanWhoosh();
    setShakerRigActive((prev) => !prev);
  }, []);

  const handleStartRace = useCallback(() => {
    soundEngine.playAirhorn();
    setShakerRigActive(false);
    setShowScorecardModal(false);
    setNewlyUnlockedParts([]);
    const fresh = createInitialSoapboxState(selectedCourseIdRef.current);
    simStateRef.current = fresh;
    setHudSimState(fresh);
    setMode('race');
  }, []);

  const handleReturnToGarage = useCallback(() => {
    soundEngine.playSnapPop();
    setShowScorecardModal(false);
    const fresh = createInitialSoapboxState(selectedCourseIdRef.current);
    simStateRef.current = fresh;
    setHudSimState(fresh);
    setMode('garage');
  }, []);

  const handleActionTap = useCallback(() => {
    const sim = simStateRef.current;
    const res = triggerSoapboxActionTap(sim, metricsRef.current);
    if (res.event === 'hype_tap') {
      soundEngine.playAirhorn();
    } else if (res.event === 'crew_push') {
      soundEngine.playPushBoost();
    } else if (res.event === 'push_shove') {
      soundEngine.playTrolleyDetach(res.shovePerfect);
    }
    setHudSimState({ ...sim });
  }, []);

  const handleDropGateNow = useCallback(() => {
    const sim = simStateRef.current;
    if (sim.phase === 'skit') {
      dropSoapboxStartGate(sim, metricsRef.current);
      soundEngine.playStartGateDrop();
      setHudSimState({ ...sim });
    }
  }, []);

  const handleSteerChange = useCallback((val: number) => {
    if (simStateRef.current.steerInput === val) return;
    simStateRef.current.steerInput = val;
    setHudSimState((prev) =>
      prev.steerInput === val ? prev : { ...prev, steerInput: val }
    );
  }, []);

  const handlePushTuckChange = useCallback((active: boolean) => {
    if (simStateRef.current.pushTuckActive === active) return;
    simStateRef.current.pushTuckActive = active;
    setHudSimState((prev) =>
      prev.pushTuckActive === active ? prev : { ...prev, pushTuckActive: active }
    );
  }, []);

  const handleBrakeChange = useCallback((active: boolean) => {
    if (simStateRef.current.brakeInput === active) return;
    simStateRef.current.brakeInput = active;
    setHudSimState((prev) =>
      prev.brakeInput === active ? prev : { ...prev, brakeInput: active }
    );
  }, []);

  const handleRunFinished = useCallback(
    (finalState: SoapboxSimulationState) => {
      const scores = finalState.judgeScores;
      if (scores) {
        const prevStars = totalStarsRef.current;
        const nextStars = prevStars + scores.starsEarned;
        totalStarsRef.current = nextStars;
        onAddStars(scores.starsEarned);

        const unlocked = SOAPBOX_PART_CATALOG.filter(
          (p) => p.unlockStars > prevStars && p.unlockStars <= nextStars
        );
        setNewlyUnlockedParts(unlocked);

        onUpdateRecord(
          finalState.distanceFeet,
          finalState.completedCourse ? finalState.elapsedRaceTimeSec : null
        );

        soundEngine.playUnlockFanfare();
        confetti({
          particleCount: scores.starsEarned === 3 ? 90 : 50,
          spread: 72,
          origin: { y: 0.6 },
        });
      }

      setHudSimState({ ...finalState });
      setShowScorecardModal(true);
    },
    [onAddStars, onUpdateRecord]
  );

  return (
    <div className="relative h-dvh w-dvw overflow-hidden bg-slate-950 select-none">
      {/* 3D WebGL Soapbox Garage & Downhill Courses */}
      <SoapboxCanvas3D
        mode={mode}
        courseId={selectedCourseId}
        paused={showScorecardModal}
        loadout={loadout}
        metrics={metrics}
        selectedCategory={selectedCategory}
        shakerRigActive={shakerRigActive}
        simStateRef={simStateRef}
        bestRecordFeet={bestRecordFeet}
        bestTimeSec={bestTimeSec}
        onSelectCategory={setSelectedCategory}
        onHudSync={setHudSimState}
        onRunFinished={handleRunFinished}
      />

      {/* GARAGE BUILDER HUD */}
      {mode === 'garage' && (
        <SoapboxGarageHUD
          selectedCourseId={selectedCourseId}
          onSelectCourse={handleSelectCourse}
          loadout={loadout}
          metrics={metrics}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          onEquipPart={handleEquipPart}
          onSelectPaint={handleSelectPaint}
          onApplyPreset={handleApplyPreset}
          onRandomizeSoapbox={handleRandomizeSoapbox}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          savedBuilds={savedBuilds}
          onSaveCurrentBuild={handleSaveCurrentBuild}
          onDeleteSavedBuild={handleDeleteSavedBuild}
          shakerRigActive={shakerRigActive}
          onToggleShakerRig={handleToggleShakerRig}
          onStartRace={handleStartRace}
          onReturnToHub={onReturnToHub}
          totalStars={totalStars}
          bestRecordFeet={bestRecordFeet}
          bestTimeSec={bestTimeSec}
          muted={muted}
          onToggleMute={onToggleMute}
        />
      )}

      {/* DOWNHILL RACE HUD */}
      {mode === 'race' && !showScorecardModal && (
        <SoapboxRaceHUD
          selectedCourseId={selectedCourseId}
          simState={hudSimState}
          simStateRef={simStateRef}
          bestRecordFeet={bestRecordFeet}
          bestTimeSec={bestTimeSec}
          onActionTap={handleActionTap}
          onDropGateNow={handleDropGateNow}
          onSteerChange={handleSteerChange}
          onPushTuckChange={handlePushTuckChange}
          onBrakeChange={handleBrakeChange}
          onReturnToGarage={handleReturnToGarage}
          onRestartRace={handleStartRace}
        />
      )}

      {/* POST-RUN 3-JUDGE SCORECARD MODAL */}
      {mode === 'race' && showScorecardModal && (
        <SoapboxScorecardModal
          selectedCourseId={selectedCourseId}
          simState={hudSimState}
          newlyUnlockedParts={newlyUnlockedParts}
          totalStars={totalStars}
          bestRecordFeet={bestRecordFeet}
          bestTimeSec={bestTimeSec}
          onRaceAgain={handleStartRace}
          onBackToGarage={handleReturnToGarage}
          onReturnToHub={onReturnToHub}
        />
      )}
    </div>
  );
};
