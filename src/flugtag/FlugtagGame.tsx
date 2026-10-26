import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  CraftLoadout,
  CraftPart,
  DEFAULT_LOADOUT,
  getPartById,
  getPartsByCategory,
  PAINT_THEMES,
  PART_CATALOG,
  PartCategory,
} from '../builder/PartCatalog';
import { computeCraftMetrics } from '../physics/CraftMetrics';
import {
  createInitialFlightState,
  FlightSimulationState,
  triggerHypeOrPushTap,
} from '../physics/AeroPhysicsEngine';
import { FlugtagCanvas3D } from '../scene/FlugtagCanvas3D';
import { HangarHUD, SavedCraftSlot } from '../ui/HangarHUD';
import { FlightHUD } from '../ui/FlightHUD';
import { JudgingScorecardModal } from '../ui/JudgingScorecardModal';
import { soundEngine } from '../audio/SoundEngine';

export interface FlugtagGameProps {
  totalStars: number;
  onAddStars: (starsEarned: number) => void;
  bestDistance: number;
  onUpdateBestDistance: (dist: number) => void;
  muted: boolean;
  onToggleMute: () => void;
  onReturnToHub: () => void;
}

const STORAGE_KEY_LOADOUT = 'flugtag_loadout_v1';
const STORAGE_KEY_SAVED_BUILDS = 'flugtag_saved_builds_v1';

const VALID_PART_IDS = new Set(PART_CATALOG.map((p) => p.id));
const VALID_PAINT_IDS = new Set(PAINT_THEMES.map((t) => t.id));
const MAX_HISTORY_LENGTH = 25;

function validateLoadout(candidate: Partial<CraftLoadout> | null | undefined): CraftLoadout {
  if (!candidate || typeof candidate !== 'object') return DEFAULT_LOADOUT;
  return {
    name:
      typeof candidate.name === 'string' && candidate.name.trim()
        ? candidate.name
        : DEFAULT_LOADOUT.name,
    chassis:
      typeof candidate.chassis === 'string' && VALID_PART_IDS.has(candidate.chassis)
        ? candidate.chassis
        : DEFAULT_LOADOUT.chassis,
    wings:
      typeof candidate.wings === 'string' && VALID_PART_IDS.has(candidate.wings)
        ? candidate.wings
        : DEFAULT_LOADOUT.wings,
    tail:
      typeof candidate.tail === 'string' && VALID_PART_IDS.has(candidate.tail)
        ? candidate.tail
        : DEFAULT_LOADOUT.tail,
    nose:
      typeof candidate.nose === 'string' && VALID_PART_IDS.has(candidate.nose)
        ? candidate.nose
        : DEFAULT_LOADOUT.nose,
    topper:
      typeof candidate.topper === 'string' && VALID_PART_IDS.has(candidate.topper)
        ? candidate.topper
        : DEFAULT_LOADOUT.topper,
    trolley:
      typeof candidate.trolley === 'string' && VALID_PART_IDS.has(candidate.trolley)
        ? candidate.trolley
        : DEFAULT_LOADOUT.trolley,
    paintTheme:
      typeof candidate.paintTheme === 'string' &&
      VALID_PAINT_IDS.has(candidate.paintTheme as CraftLoadout['paintTheme'])
        ? (candidate.paintTheme as CraftLoadout['paintTheme'])
        : DEFAULT_LOADOUT.paintTheme,
  };
}

function areLoadoutsEqual(a: CraftLoadout, b: CraftLoadout): boolean {
  return (
    a.chassis === b.chassis &&
    a.wings === b.wings &&
    a.tail === b.tail &&
    a.nose === b.nose &&
    a.topper === b.topper &&
    a.trolley === b.trolley &&
    a.paintTheme === b.paintTheme
  );
}

function loadSavedLoadout(): CraftLoadout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LOADOUT);
    if (!raw) return DEFAULT_LOADOUT;
    return validateLoadout(JSON.parse(raw));
  } catch {
    return DEFAULT_LOADOUT;
  }
}

function loadSavedBuildsList(): SavedCraftSlot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SAVED_BUILDS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === 'object' && item.loadout)
      .map((item) => ({
        id: String(item.id || Date.now()),
        name: String(item.name || 'Custom Craft'),
        loadout: validateLoadout(item.loadout),
        createdAt: Number(item.createdAt || Date.now()),
      }));
  } catch {
    return [];
  }
}

function pickCleanWord(name: string, fromEnd = false): string {
  const tokens = name
    .split(' ')
    .filter((w) => w.length > 1 && !/^\d/.test(w));
  if (tokens.length === 0) return 'Custom';
  return fromEnd ? tokens[tokens.length - 1] : tokens[0];
}

export const FlugtagGame: React.FC<FlugtagGameProps> = ({
  totalStars,
  onAddStars,
  bestDistance,
  onUpdateBestDistance,
  muted,
  onToggleMute,
  onReturnToHub,
}) => {
  const [mode, setMode] = useState<'hangar' | 'flight'>('hangar');
  const [loadout, setLoadout] = useState<CraftLoadout>(() => loadSavedLoadout());
  const [pastLoadouts, setPastLoadouts] = useState<CraftLoadout[]>([]);
  const [futureLoadouts, setFutureLoadouts] = useState<CraftLoadout[]>([]);
  const [savedBuilds, setSavedBuilds] = useState<SavedCraftSlot[]>(() => loadSavedBuildsList());
  const [selectedCategory, setSelectedCategory] = useState<PartCategory>('chassis');
  const [windTunnelActive, setWindTunnelActive] = useState(false);

  const [hudFlightState, setHudFlightState] = useState<FlightSimulationState>(() =>
    createInitialFlightState()
  );
  const [showJudgingModal, setShowJudgingModal] = useState(false);
  const [newlyUnlockedParts, setNewlyUnlockedParts] = useState<CraftPart[]>([]);

  const flightStateRef = useRef<FlightSimulationState>(createInitialFlightState());
  const loadoutRef = useRef(loadout);
  loadoutRef.current = loadout;
  const pastLoadoutsRef = useRef(pastLoadouts);
  pastLoadoutsRef.current = pastLoadouts;
  const futureLoadoutsRef = useRef(futureLoadouts);
  futureLoadoutsRef.current = futureLoadouts;
  const totalStarsRef = useRef(totalStars);
  totalStarsRef.current = totalStars;
  const bestDistanceRef = useRef(bestDistance);
  bestDistanceRef.current = bestDistance;

  // Compute real-time engineering metrics for the current craft loadout
  const metrics = useMemo(() => computeCraftMetrics(loadout), [loadout]);
  const metricsRef = useRef(metrics);
  metricsRef.current = metrics;

  // Persist loadout to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_LOADOUT, JSON.stringify(loadout));
    } catch {
      // Ignore quota errors
    }
  }, [loadout]);

  // Persist saved custom builds to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SAVED_BUILDS, JSON.stringify(savedBuilds));
    } catch {
      // Ignore quota errors
    }
  }, [savedBuilds]);

  const applyLoadoutWithHistory = useCallback(
    (updater: CraftLoadout | ((prev: CraftLoadout) => CraftLoadout)) => {
      const current = loadoutRef.current;
      const next = typeof updater === 'function' ? updater(current) : updater;
      if (areLoadoutsEqual(current, next)) return;
      const nextPast = [...pastLoadoutsRef.current.slice(-(MAX_HISTORY_LENGTH - 1)), current];
      loadoutRef.current = next;
      pastLoadoutsRef.current = nextPast;
      futureLoadoutsRef.current = [];
      setPastLoadouts(nextPast);
      setFutureLoadouts([]);
      setLoadout(next);
    },
    []
  );

  const handleUndo = useCallback(() => {
    const past = pastLoadoutsRef.current;
    if (past.length === 0) return;
    soundEngine.playSnapPop();
    const previous = past[past.length - 1];
    const current = loadoutRef.current;
    const nextPast = past.slice(0, -1);
    const nextFuture = [current, ...futureLoadoutsRef.current.slice(0, MAX_HISTORY_LENGTH - 1)];
    loadoutRef.current = previous;
    pastLoadoutsRef.current = nextPast;
    futureLoadoutsRef.current = nextFuture;
    setPastLoadouts(nextPast);
    setFutureLoadouts(nextFuture);
    setLoadout(previous);
  }, []);

  const handleRedo = useCallback(() => {
    const future = futureLoadoutsRef.current;
    if (future.length === 0) return;
    soundEngine.playSnapPop();
    const [next, ...rest] = future;
    const current = loadoutRef.current;
    const nextPast = [...pastLoadoutsRef.current.slice(-(MAX_HISTORY_LENGTH - 1)), current];
    loadoutRef.current = next;
    futureLoadoutsRef.current = rest;
    pastLoadoutsRef.current = nextPast;
    setFutureLoadouts(rest);
    setPastLoadouts(nextPast);
    setLoadout(next);
  }, []);

  const handleSelectCategory = useCallback((cat: PartCategory) => {
    soundEngine.playSnapPop();
    setSelectedCategory(cat);
  }, []);

  const handleEquipPart = useCallback(
    (category: PartCategory, partId: string) => {
      soundEngine.playSnapPop();
      applyLoadoutWithHistory((prev) =>
        prev[category] === partId ? prev : { ...prev, [category]: partId }
      );
    },
    [applyLoadoutWithHistory]
  );

  const handleSelectPaint = useCallback(
    (paintTheme: CraftLoadout['paintTheme']) => {
      soundEngine.playSnapPop();
      applyLoadoutWithHistory((prev) =>
        prev.paintTheme === paintTheme ? prev : { ...prev, paintTheme }
      );
    },
    [applyLoadoutWithHistory]
  );

  const handleApplyPreset = useCallback(
    (preset: CraftLoadout) => {
      soundEngine.playSnapPop();
      applyLoadoutWithHistory({ ...preset });
    },
    [applyLoadoutWithHistory]
  );

  const handleRandomizeCraft = useCallback(() => {
    soundEngine.playSnapPop();
    const curStars = totalStarsRef.current;
    const pickRandom = (cat: PartCategory) => {
      const catParts = getPartsByCategory(cat);
      const unlocked = catParts.filter((p) => p.unlockStars <= curStars);
      const pool = unlocked.length > 0 ? unlocked : catParts;
      return pool[Math.floor(Math.random() * pool.length)].id;
    };
    const randomTheme = PAINT_THEMES[Math.floor(Math.random() * PAINT_THEMES.length)].id;

    applyLoadoutWithHistory({
      name: '🎲 Surprise Craft',
      chassis: pickRandom('chassis'),
      wings: pickRandom('wings'),
      tail: pickRandom('tail'),
      nose: pickRandom('nose'),
      topper: pickRandom('topper'),
      trolley: pickRandom('trolley'),
      paintTheme: randomTheme,
    });
  }, [applyLoadoutWithHistory]);

  const handleSaveCurrentBuild = useCallback((customName?: string) => {
    soundEngine.playUnlockFanfare();
    const currentLoadout = loadoutRef.current;
    const topperPart = getPartById(currentLoadout.topper);
    const chassisPart = getPartById(currentLoadout.chassis);
    const wingPart = getPartById(currentLoadout.wings);

    const badgeEmoji = topperPart.id !== 'topper_none' ? topperPart.emoji : '✈️';
    const leadWord =
      topperPart.id !== 'topper_none'
        ? pickCleanWord(topperPart.name, true)
        : pickCleanWord(wingPart.name, false);
    const frameWord = pickCleanWord(chassisPart.name, false);

    setSavedBuilds((prevBuilds) => {
      const autoName = `${badgeEmoji} ${leadWord} ${frameWord} #${prevBuilds.length + 1}`;
      const finalName = customName && customName.trim().length > 0 ? customName.trim() : autoName;
      const newSlot: SavedCraftSlot = {
        id: `build_${Date.now()}`,
        name: finalName,
        loadout: { ...currentLoadout, name: finalName },
        createdAt: Date.now(),
      };
      return [newSlot, ...prevBuilds].slice(0, 12);
    });
  }, []);

  const handleDeleteSavedBuild = useCallback((id: string) => {
    soundEngine.playSnapPop();
    setSavedBuilds((prev) => prev.filter((slot) => slot.id !== id));
  }, []);

  const handleToggleWindTunnel = useCallback(() => {
    soundEngine.playFanWhoosh();
    setWindTunnelActive((prev) => !prev);
  }, []);

  const handleStartFlight = useCallback(() => {
    soundEngine.playAirhorn();
    setWindTunnelActive(false);
    setShowJudgingModal(false);
    setNewlyUnlockedParts([]);

    const fresh = createInitialFlightState();
    flightStateRef.current = fresh;
    setHudFlightState(fresh);
    setMode('flight');
  }, []);

  const handleReturnToHangar = useCallback(() => {
    soundEngine.playSnapPop();
    setShowJudgingModal(false);
    setMode('hangar');
  }, []);

  const handleActionTap = useCallback(() => {
    const sim = flightStateRef.current;
    if (sim.phase === 'airborne') {
      soundEngine.playAirhorn();
      return;
    }

    const res = triggerHypeOrPushTap(sim, metricsRef.current);
    if (res.event === 'none') return;

    if (res.event === 'hype_tap') {
      soundEngine.playAirhorn();
    } else if (res.event === 'push_boost') {
      soundEngine.playPushBoost();
    } else if (res.event === 'trolley_perfect') {
      soundEngine.playTrolleyDetach(sim.trolleyReleaseQuality === 'perfect');
    }
    setHudFlightState({ ...sim });
  }, []);

  const handleSkipSkitToPush = useCallback(() => {
    const sim = flightStateRef.current;
    if (sim.phase === 'skit') {
      sim.phase = 'ramp_push';
      sim.phaseTime = 0;
      const curMetrics = metricsRef.current;
      const overWeightExcess = Math.max(0, curMetrics.rampTotalMassLbs - 400);
      const overWeightInertia = 1 / (1 + overWeightExcess * 0.0035);
      sim.vxFeet = 11 * curMetrics.pushEfficiency * overWeightInertia;
      soundEngine.playPushBoost();
      setHudFlightState({ ...sim });
    }
  }, []);

  const handlePitchInputChange = useCallback((val: number) => {
    if (flightStateRef.current.pilotPitchInput === val) return;
    flightStateRef.current.pilotPitchInput = val;
    setHudFlightState((prev) =>
      prev.pilotPitchInput === val ? prev : { ...prev, pilotPitchInput: val }
    );
  }, []);

  const handleSplashdownComplete = useCallback(
    (finalState: FlightSimulationState) => {
      const scores = finalState.judgeScores;
      if (scores) {
        const prevStars = totalStarsRef.current;
        const nextStars = prevStars + scores.starsEarned;
        totalStarsRef.current = nextStars;
        onAddStars(scores.starsEarned);

        const newlyUnlocked = PART_CATALOG.filter(
          (p) => p.unlockStars > prevStars && p.unlockStars <= nextStars
        );
        setNewlyUnlockedParts(newlyUnlocked);

        const prevBest = bestDistanceRef.current;
        if (finalState.distanceFeet > prevBest) {
          bestDistanceRef.current = finalState.distanceFeet;
          scores.newRecord = true;
          onUpdateBestDistance(finalState.distanceFeet);
        }

        soundEngine.playUnlockFanfare();
        confetti({
          particleCount: scores.starsEarned === 3 ? 95 : 55,
          spread: 75,
          origin: { y: 0.6 },
        });
      }

      setHudFlightState({ ...finalState });
      setShowJudgingModal(true);
    },
    [onAddStars, onUpdateBestDistance]
  );

  return (
    <div className="relative h-dvh w-dvw overflow-hidden bg-slate-950 select-none">
      {/* 3D WebGL Canvas */}
      <FlugtagCanvas3D
        mode={mode}
        paused={showJudgingModal}
        loadout={loadout}
        metrics={metrics}
        selectedCategory={selectedCategory}
        windTunnelActive={windTunnelActive}
        flightStateRef={flightStateRef}
        bestDistanceFeet={bestDistance}
        onSelectCategory={handleSelectCategory}
        onFlightHudSync={setHudFlightState}
        onSplashdownComplete={handleSplashdownComplete}
      />

      {/* HANGAR BUILDER HUD */}
      {mode === 'hangar' && (
        <HangarHUD
          loadout={loadout}
          metrics={metrics}
          selectedCategory={selectedCategory}
          onSelectCategory={handleSelectCategory}
          onEquipPart={handleEquipPart}
          onSelectPaint={handleSelectPaint}
          onApplyPreset={handleApplyPreset}
          onRandomizeCraft={handleRandomizeCraft}
          canUndo={pastLoadouts.length > 0}
          canRedo={futureLoadouts.length > 0}
          onUndo={handleUndo}
          onRedo={handleRedo}
          savedBuilds={savedBuilds}
          onSaveCurrentBuild={handleSaveCurrentBuild}
          onDeleteSavedBuild={handleDeleteSavedBuild}
          windTunnelActive={windTunnelActive}
          onToggleWindTunnel={handleToggleWindTunnel}
          onStartFlight={handleStartFlight}
          totalStars={totalStars}
          bestDistanceFeet={bestDistance}
          muted={muted}
          onToggleMute={onToggleMute}
          onReturnToHub={onReturnToHub}
        />
      )}

      {/* FLIGHT & RAMP HUD */}
      {mode === 'flight' && !showJudgingModal && (
        <FlightHUD
          flightState={hudFlightState}
          flightStateRef={flightStateRef}
          bestDistanceFeet={bestDistance}
          onActionTap={handleActionTap}
          onSkipSkitToPush={handleSkipSkitToPush}
          onPitchInputChange={handlePitchInputChange}
          onReturnToHangar={handleReturnToHangar}
          onRestartFlight={handleStartFlight}
        />
      )}

      {/* POST-FLIGHT 3-JUDGE SCORECARD & PART UNLOCKS MODAL */}
      {mode === 'flight' && showJudgingModal && (
        <JudgingScorecardModal
          flightState={hudFlightState}
          newlyUnlockedParts={newlyUnlockedParts}
          totalStars={totalStars}
          bestDistanceFeet={bestDistance}
          onFlyAgain={handleStartFlight}
          onBackToHangar={handleReturnToHangar}
          onReturnToHub={onReturnToHub}
        />
      )}
    </div>
  );
};
