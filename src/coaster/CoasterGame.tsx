import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  COASTER_CATEGORY_TABS,
  COASTER_PAINT_THEMES,
  COASTER_PARTS,
  CoasterLoadout,
  CoasterPart,
  CoasterPartCategory,
  DEFAULT_COASTER_LOADOUT,
  getCoasterPartById,
  getCoasterPartsByCategory,
} from './CoasterPartCatalog';
import { computeCoasterMetrics } from './CoasterMetrics';
import {
  CoasterPhysicsState,
  createInitialCoasterPhysicsState,
} from './CoasterPhysicsEngine';
import { CoasterCanvas3D } from './CoasterCanvas3D';
import {
  CoasterBuilderHUD,
  SavedCoasterBlueprint,
} from './CoasterBuilderHUD';
import { CoasterRideHUD } from './CoasterRideHUD';
import {
  CoasterScorecardModal,
  CoasterScorecardResult,
  computeCoasterScorecard,
} from './CoasterScorecardModal';
import { soundEngine } from '../audio/SoundEngine';

export interface CoasterGameProps {
  totalStars: number;
  onAddStars: (earned: number) => void;
  bestDistanceFeet: number;
  bestThrillScore: number;
  onUpdateRecord: (feet: number, thrillScore: number) => void;
  muted: boolean;
  onToggleMute: () => void;
  onReturnToHub: () => void;
}

const STORAGE_LOADOUT_KEY = 'rb_coaster_loadout_v1';
const STORAGE_UNLOCKED_KEY = 'rb_coaster_unlocked_v1';
const STORAGE_SAVED_SLOTS_KEY = 'rb_coaster_saved_slots_v1';

function sanitizeCoasterLoadout(raw: Partial<CoasterLoadout> | null | undefined): CoasterLoadout {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_COASTER_LOADOUT };
  const validPart = (cat: CoasterPartCategory, id: unknown): string => {
    if (typeof id !== 'string') return DEFAULT_COASTER_LOADOUT[cat];
    const found = COASTER_PARTS.find((p) => p.id === id && p.category === cat);
    return found ? found.id : DEFAULT_COASTER_LOADOUT[cat];
  };
  const validPaint =
    typeof raw.paintId === 'string' && COASTER_PAINT_THEMES.some((t) => t.id === raw.paintId)
      ? raw.paintId
      : DEFAULT_COASTER_LOADOUT.paintId;

  return {
    chassis: validPart('chassis', raw.chassis),
    bogies: validPart('bogies', raw.bogies),
    restraints: validPart('restraints', raw.restraints),
    nose: validPart('nose', raw.nose),
    booster: validPart('booster', raw.booster),
    shell: validPart('shell', raw.shell),
    paintId: validPaint,
  };
}

export const CoasterGame: React.FC<CoasterGameProps> = ({
  totalStars,
  onAddStars,
  bestDistanceFeet,
  bestThrillScore,
  onUpdateRecord,
  muted,
  onToggleMute,
  onReturnToHub,
}) => {
  const [history, setHistory] = useState<{
    current: CoasterLoadout;
    past: CoasterLoadout[];
    future: CoasterLoadout[];
  }>(() => {
    let initialLoadout = DEFAULT_COASTER_LOADOUT;
    try {
      const raw = localStorage.getItem(STORAGE_LOADOUT_KEY);
      if (raw) {
        initialLoadout = sanitizeCoasterLoadout(JSON.parse(raw));
      }
    } catch {
      // ignore storage errors
    }
    return { current: initialLoadout, past: [], future: [] };
  });

  const loadout = history.current;
  const undoStack = history.past;
  const redoStack = history.future;

  const [unlockedPartIds, setUnlockedPartIds] = useState<Set<string>>(() => {
    const initial = new Set<string>(
      COASTER_PARTS.filter((p) => p.costStars === 0).map((p) => p.id)
    );
    try {
      const raw = localStorage.getItem(STORAGE_UNLOCKED_KEY);
      if (raw) {
        const arr = JSON.parse(raw) as string[];
        arr.forEach((id) => initial.add(id));
      }
    } catch {
      // ignore
    }
    return initial;
  });

  const [savedBlueprints, setSavedBlueprints] = useState<
    Array<SavedCoasterBlueprint | null>
  >(() => {
    try {
      const raw = localStorage.getItem(STORAGE_SAVED_SLOTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === 3) {
          return parsed.map((slot) =>
            slot && typeof slot === 'object' && slot.loadout
              ? {
                  name: String(slot.name || 'Saved Train'),
                  loadout: sanitizeCoasterLoadout(slot.loadout),
                  savedAt: String(slot.savedAt || ''),
                }
              : null
          );
        }
      }
    } catch {
      // ignore
    }
    return [null, null, null];
  });

  const applyLoadoutWithHistory = useCallback(
    (updater: CoasterLoadout | ((prev: CoasterLoadout) => CoasterLoadout)) => {
      setHistory((prevHistory) => {
        const prev = prevHistory.current;
        const nextRaw = typeof updater === 'function' ? updater(prev) : updater;
        const next = sanitizeCoasterLoadout(nextRaw);
        const isSame =
          prev.chassis === next.chassis &&
          prev.bogies === next.bogies &&
          prev.restraints === next.restraints &&
          prev.nose === next.nose &&
          prev.booster === next.booster &&
          prev.shell === next.shell &&
          prev.paintId === next.paintId;
        if (isSame) return prevHistory;
        return {
          current: next,
          past: [...prevHistory.past.slice(-29), prev],
          future: [],
        };
      });
    },
    []
  );

  const handleUndo = useCallback(() => {
    setHistory((prevHistory) => {
      if (prevHistory.past.length === 0) return prevHistory;
      const previousLoadout = prevHistory.past[prevHistory.past.length - 1];
      return {
        current: previousLoadout,
        past: prevHistory.past.slice(0, -1),
        future: [...prevHistory.future, prevHistory.current],
      };
    });
  }, []);

  const handleRedo = useCallback(() => {
    setHistory((prevHistory) => {
      if (prevHistory.future.length === 0) return prevHistory;
      const nextLoadout = prevHistory.future[prevHistory.future.length - 1];
      return {
        current: nextLoadout,
        past: [...prevHistory.past, prevHistory.current],
        future: prevHistory.future.slice(0, -1),
      };
    });
  }, []);

  const [mode, setMode] = useState<'builder' | 'ride'>('builder');
  const [activeCategory, setActiveCategory] = useState<CoasterPartCategory>('chassis');
  const [dynoActive, setDynoActive] = useState<boolean>(false);
  const [rideRunId, setRideRunId] = useState<number>(0);
  const [completedRide, setCompletedRide] = useState<{
    finalState: CoasterPhysicsState;
    scorecard: CoasterScorecardResult;
  } | null>(null);

  const rideStateRef = useRef<CoasterPhysicsState>(createInitialCoasterPhysicsState());
  const controlsRef = useRef<{ leanInput: number; brakeInput: boolean }>({
    leanInput: 0,
    brakeInput: false,
  });
  const actionTapCountRef = useRef<number>(0);

  // Persist loadout
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_LOADOUT_KEY, JSON.stringify(loadout));
    } catch {
      // ignore
    }
  }, [loadout]);

  const metrics = useMemo(() => computeCoasterMetrics(loadout), [loadout]);

  // Number keys 1..6 switch categories & Ctrl+Z / Ctrl+Y Undo/Redo in Builder Mode
  useEffect(() => {
    if (mode !== 'builder') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault();
        soundEngine.playSnapPop();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
        e.preventDefault();
        soundEngine.playSnapPop();
        handleRedo();
        return;
      }
      const idx = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].indexOf(
        e.code
      );
      if (idx !== -1 && COASTER_CATEGORY_TABS[idx]) {
        soundEngine.playSnapPop();
        setActiveCategory(COASTER_CATEGORY_TABS[idx].id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleRedo, handleUndo, mode]);

  const handleSelectPart = useCallback(
    (part: CoasterPart) => {
      const isUnlocked = part.costStars === 0 || unlockedPartIds.has(part.id);
      if (!isUnlocked) {
        if (totalStars < part.costStars) {
          soundEngine.playCrashThud();
          return;
        }
        onAddStars(-part.costStars);
        soundEngine.playUnlockFanfare();
        setUnlockedPartIds((prev) => {
          const next = new Set(prev);
          next.add(part.id);
          try {
            localStorage.setItem(STORAGE_UNLOCKED_KEY, JSON.stringify(Array.from(next)));
          } catch {
            // ignore
          }
          return next;
        });
      } else {
        soundEngine.playSnapPop();
      }

      applyLoadoutWithHistory((prev) => ({
        ...prev,
        [part.category]: part.id,
      }));
    },
    [applyLoadoutWithHistory, onAddStars, totalStars, unlockedPartIds]
  );

  const handleRandomize = useCallback(() => {
    const pickRandomUnlocked = (cat: CoasterPartCategory): string => {
      const avail = getCoasterPartsByCategory(cat).filter(
        (p) => p.costStars === 0 || unlockedPartIds.has(p.id)
      );
      const chosen = avail[Math.floor(Math.random() * avail.length)];
      return chosen ? chosen.id : DEFAULT_COASTER_LOADOUT[cat];
    };
    const randomPaint =
      COASTER_PAINT_THEMES[Math.floor(Math.random() * COASTER_PAINT_THEMES.length)].id;

    applyLoadoutWithHistory({
      chassis: pickRandomUnlocked('chassis'),
      bogies: pickRandomUnlocked('bogies'),
      restraints: pickRandomUnlocked('restraints'),
      nose: pickRandomUnlocked('nose'),
      booster: pickRandomUnlocked('booster'),
      shell: pickRandomUnlocked('shell'),
      paintId: randomPaint,
    });
  }, [applyLoadoutWithHistory, unlockedPartIds]);

  const handleSaveBlueprintSlot = useCallback(
    (slotIdx: number) => {
      const chassisPart = getCoasterPartById(loadout.chassis);
      const shellPart = getCoasterPartById(loadout.shell);
      const entry: SavedCoasterBlueprint = {
        name: `${shellPart.emoji} ${chassisPart.name.split(' ')[0]} Train`,
        loadout: { ...loadout },
        savedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setSavedBlueprints((prev) => {
        const next = [...prev];
        next[slotIdx] = entry;
        try {
          localStorage.setItem(STORAGE_SAVED_SLOTS_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [loadout]
  );

  const handleLoadBlueprintSlot = useCallback(
    (slotIdx: number) => {
      const saved = savedBlueprints[slotIdx];
      if (!saved) return;
      applyLoadoutWithHistory({ ...saved.loadout });
    },
    [applyLoadoutWithHistory, savedBlueprints]
  );

  const handleStartRide = useCallback(() => {
    setDynoActive(false);
    setCompletedRide(null);
    rideStateRef.current = createInitialCoasterPhysicsState();
    controlsRef.current = { leanInput: 0, brakeInput: false };
    actionTapCountRef.current = 0;
    setRideRunId((r) => r + 1);
    setMode('ride');
  }, []);

  const handleRideComplete = useCallback(
    (finalState: CoasterPhysicsState) => {
      const scorecard = computeCoasterScorecard(
        finalState,
        metrics,
        bestDistanceFeet,
        bestThrillScore
      );
      onAddStars(scorecard.starsEarned);
      onUpdateRecord(scorecard.distanceFeet, scorecard.totalThrillScore);
      setCompletedRide({ finalState, scorecard });
    },
    [bestDistanceFeet, bestThrillScore, metrics, onAddStars, onUpdateRecord]
  );

  const handleTriggerActionTap = useCallback(() => {
    actionTapCountRef.current += 1;
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-slate-950">
      <CoasterCanvas3D
        key={mode === 'ride' ? `ride_${rideRunId}` : 'builder'}
        mode={mode}
        loadout={loadout}
        metrics={metrics}
        activeCategory={activeCategory}
        onSelectCategory={setActiveCategory}
        dynoActive={dynoActive}
        paused={Boolean(completedRide)}
        rideStateRef={rideStateRef}
        controlsRef={controlsRef}
        actionTapCountRef={actionTapCountRef}
        onRideComplete={handleRideComplete}
      />

      {mode === 'builder' && (
        <CoasterBuilderHUD
          loadout={loadout}
          metrics={metrics}
          activeCategory={activeCategory}
          onSelectCategory={setActiveCategory}
          onSelectPart={handleSelectPart}
          onSelectPaint={(paintId) =>
            applyLoadoutWithHistory((prev) => ({ ...prev, paintId }))
          }
          onApplyPreset={(presetLoadout) => applyLoadoutWithHistory({ ...presetLoadout })}
          onRandomize={handleRandomize}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          onUndo={handleUndo}
          onRedo={handleRedo}
          unlockedPartIds={unlockedPartIds}
          totalStars={totalStars}
          bestDistanceFeet={bestDistanceFeet}
          bestThrillScore={bestThrillScore}
          dynoActive={dynoActive}
          onToggleDyno={() => setDynoActive((d) => !d)}
          muted={muted}
          onToggleMute={onToggleMute}
          onStartRide={handleStartRide}
          onReturnToHub={onReturnToHub}
          savedBlueprints={savedBlueprints}
          onSaveBlueprintSlot={handleSaveBlueprintSlot}
          onLoadBlueprintSlot={handleLoadBlueprintSlot}
        />
      )}

      {mode === 'ride' && !completedRide && (
        <CoasterRideHUD
          metrics={metrics}
          rideStateRef={rideStateRef}
          controlsRef={controlsRef}
          onTriggerActionTap={handleTriggerActionTap}
          onRestartRide={() => {
            soundEngine.playAirhorn();
            handleStartRide();
          }}
          onAbortToBuilder={() => {
            soundEngine.playSnapPop();
            setCompletedRide(null);
            setMode('builder');
          }}
          muted={muted}
          onToggleMute={onToggleMute}
        />
      )}

      {mode === 'ride' && completedRide && (
        <CoasterScorecardModal
          finalState={completedRide.finalState}
          metrics={metrics}
          scorecard={completedRide.scorecard}
          onRideAgain={handleStartRide}
          onReturnToWorkshop={() => {
            setCompletedRide(null);
            setMode('builder');
          }}
          onReturnToHub={onReturnToHub}
        />
      )}
    </div>
  );
};
