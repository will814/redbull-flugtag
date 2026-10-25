import React, { useCallback, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  CraftLoadout,
  CraftPart,
  getPartById,
  PAINT_THEMES,
  PART_CATALOG,
  PartCategory,
  PRESET_BLUEPRINTS,
} from './builder/PartCatalog';
import { computeCraftMetrics } from './physics/CraftMetrics';
import {
  createInitialFlightState,
  FlightSimulationState,
  triggerHypeOrPushTap,
} from './physics/AeroPhysicsEngine';
import { FlugtagCanvas3D } from './scene/FlugtagCanvas3D';
import { HangarHUD, SavedCraftSlot } from './ui/HangarHUD';
import { FlightHUD } from './ui/FlightHUD';
import { JudgingScorecardModal } from './ui/JudgingScorecardModal';
import { soundEngine } from './audio/SoundEngine';

const STORAGE_KEY_STARS = 'flugtag_total_stars_v1';
const STORAGE_KEY_BEST_DIST = 'flugtag_best_dist_v1';
const STORAGE_KEY_LOADOUT = 'flugtag_loadout_v1';
const STORAGE_KEY_SAVED_BUILDS = 'flugtag_saved_builds_v1';

function loadInitialStars(): number {
  try {
    const val = localStorage.getItem(STORAGE_KEY_STARS);
    return val ? Math.max(0, parseInt(val, 10) || 0) : 0;
  } catch {
    return 0;
  }
}

function loadInitialBestDist(): number {
  try {
    const val = localStorage.getItem(STORAGE_KEY_BEST_DIST);
    return val ? Math.max(0, parseInt(val, 10) || 0) : 0;
  } catch {
    return 0;
  }
}

function loadInitialCraft(): CraftLoadout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LOADOUT);
    if (raw) {
      return JSON.parse(raw) as CraftLoadout;
    }
  } catch {
    // ignore
  }
  return PRESET_BLUEPRINTS[0];
}

function loadInitialSavedBuilds(): SavedCraftSlot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SAVED_BUILDS);
    if (raw) {
      return JSON.parse(raw) as SavedCraftSlot[];
    }
  } catch {
    // ignore
  }
  return [];
}

export const App: React.FC = () => {
  const [mode, setMode] = useState<'hangar' | 'flight'>('hangar');
  const [loadout, setLoadout] = useState<CraftLoadout>(loadInitialCraft);
  const [savedBuilds, setSavedBuilds] = useState<SavedCraftSlot[]>(loadInitialSavedBuilds);
  const [selectedCategory, setSelectedCategory] = useState<PartCategory>('wings');
  const [windTunnelActive, setWindTunnelActive] = useState<boolean>(false);
  const [totalStars, setTotalStars] = useState<number>(loadInitialStars);
  const [bestDistanceFeet, setBestDistanceFeet] = useState<number>(loadInitialBestDist);
  const [muted, setMuted] = useState<boolean>(false);

  // Flight simulation state (mutated at 60Hz in ref, synced to React state for HUD)
  const flightStateRef = useRef<FlightSimulationState>(createInitialFlightState());
  const [hudFlightState, setHudFlightState] = useState<FlightSimulationState>(() =>
    createInitialFlightState()
  );
  const [showJudgingModal, setShowJudgingModal] = useState<boolean>(false);
  const [newlyUnlockedParts, setNewlyUnlockedParts] = useState<CraftPart[]>([]);

  const metrics = useMemo(() => computeCraftMetrics(loadout), [loadout]);

  const saveLoadout = useCallback((next: CraftLoadout) => {
    setLoadout(next);
    try {
      localStorage.setItem(STORAGE_KEY_LOADOUT, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const handleSaveCurrentBuild = useCallback(
    (customName?: string) => {
      soundEngine.playUnlockFanfare();
      const topperPart = getPartById(loadout.topper);
      const chassisPart = getPartById(loadout.chassis);
      const wingPart = getPartById(loadout.wings);

      const autoName = `${topperPart.emoji} ${
        topperPart.id !== 'topper_none'
          ? topperPart.name.split(' ').slice(-1)[0]
          : wingPart.name.split(' ')[0]
      } ${chassisPart.name.split(' ')[0]} #${savedBuilds.length + 1}`;

      const finalName = customName || autoName;
      const newSlot: SavedCraftSlot = {
        id: `build_${Date.now()}`,
        name: finalName,
        loadout: { ...loadout, name: finalName },
        createdAt: Date.now(),
      };

      const updated = [newSlot, ...savedBuilds].slice(0, 12);
      setSavedBuilds(updated);
      try {
        localStorage.setItem(STORAGE_KEY_SAVED_BUILDS, JSON.stringify(updated));
      } catch {
        // ignore
      }
    },
    [loadout, savedBuilds]
  );

  const handleDeleteSavedBuild = useCallback(
    (id: string) => {
      soundEngine.playSnapPop();
      const updated = savedBuilds.filter((b) => b.id !== id);
      setSavedBuilds(updated);
      try {
        localStorage.setItem(STORAGE_KEY_SAVED_BUILDS, JSON.stringify(updated));
      } catch {
        // ignore
      }
    },
    [savedBuilds]
  );

  const handleEquipPart = useCallback(
    (category: PartCategory, partId: string) => {
      soundEngine.playSnapPop();
      saveLoadout({
        ...loadout,
        [category]: partId,
      });
    },
    [loadout, saveLoadout]
  );

  const handleSelectPaint = useCallback(
    (paintTheme: CraftLoadout['paintTheme']) => {
      soundEngine.playSnapPop();
      saveLoadout({
        ...loadout,
        paintTheme,
      });
    },
    [loadout, saveLoadout]
  );

  const handleApplyPreset = useCallback(
    (preset: CraftLoadout) => {
      soundEngine.playSnapPop();
      saveLoadout({ ...preset });
    },
    [saveLoadout]
  );

  const handleRandomizeCraft = useCallback(() => {
    soundEngine.playSnapPop();
    const pickRandom = (cat: PartCategory) => {
      const unlocked = PART_CATALOG.filter(
        (p) => p.category === cat && p.unlockStars <= totalStars
      );
      return unlocked[Math.floor(Math.random() * unlocked.length)].id;
    };
    const randomTheme =
      PAINT_THEMES[Math.floor(Math.random() * PAINT_THEMES.length)].id;

    saveLoadout({
      name: '🎲 Surprise Craft',
      chassis: pickRandom('chassis'),
      wings: pickRandom('wings'),
      tail: pickRandom('tail'),
      nose: pickRandom('nose'),
      topper: pickRandom('topper'),
      trolley: pickRandom('trolley'),
      paintTheme: randomTheme,
    });
  }, [totalStars, saveLoadout]);

  const handleToggleWindTunnel = useCallback(() => {
    soundEngine.playFanWhoosh();
    setWindTunnelActive((prev) => !prev);
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      soundEngine.muted = next;
      return next;
    });
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

    const res = triggerHypeOrPushTap(sim, metrics);
    if (res.event === 'hype_tap') {
      soundEngine.playAirhorn();
    } else if (res.event === 'push_boost') {
      soundEngine.playPushBoost();
    } else if (res.event === 'trolley_perfect') {
      soundEngine.playTrolleyDetach(true);
    }
    setHudFlightState({ ...sim });
  }, [metrics]);

  const handleSkipSkitToPush = useCallback(() => {
    const sim = flightStateRef.current;
    if (sim.phase === 'skit') {
      sim.phase = 'ramp_push';
      sim.phaseTime = 0;
      sim.vxFeet = 11 * metrics.pushEfficiency;
      soundEngine.playPushBoost();
      setHudFlightState({ ...sim });
    }
  }, [metrics]);

  const handlePitchInputChange = useCallback((val: number) => {
    flightStateRef.current.pilotPitchInput = val;
    setHudFlightState((prev) => ({ ...prev, pilotPitchInput: val }));
  }, []);

  const handleSplashdownComplete = useCallback(
    (finalState: FlightSimulationState) => {
      const scores = finalState.judgeScores;
      if (scores) {
        const prevStars = totalStars;
        const nextStars = prevStars + scores.starsEarned;
        setTotalStars(nextStars);
        try {
          localStorage.setItem(STORAGE_KEY_STARS, String(nextStars));
        } catch {
          // ignore
        }

        const newlyUnlocked = PART_CATALOG.filter(
          (p) => p.unlockStars > prevStars && p.unlockStars <= nextStars
        );
        setNewlyUnlockedParts(newlyUnlocked);

        if (finalState.distanceFeet > bestDistanceFeet) {
          setBestDistanceFeet(finalState.distanceFeet);
          try {
            localStorage.setItem(
              STORAGE_KEY_BEST_DIST,
              String(finalState.distanceFeet)
            );
          } catch {
            // ignore
          }
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
    [totalStars, bestDistanceFeet]
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950 select-none">
      {/* 3D WebGL Canvas */}
      <FlugtagCanvas3D
        mode={mode}
        loadout={loadout}
        metrics={metrics}
        selectedCategory={selectedCategory}
        windTunnelActive={windTunnelActive}
        flightStateRef={flightStateRef}
        bestDistanceFeet={bestDistanceFeet}
        onFlightHudSync={setHudFlightState}
        onSplashdownComplete={handleSplashdownComplete}
      />

      {/* HANGAR BUILDER HUD */}
      {mode === 'hangar' && (
        <HangarHUD
          loadout={loadout}
          metrics={metrics}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          onEquipPart={handleEquipPart}
          onSelectPaint={handleSelectPaint}
          onApplyPreset={handleApplyPreset}
          onRandomizeCraft={handleRandomizeCraft}
          savedBuilds={savedBuilds}
          onSaveCurrentBuild={handleSaveCurrentBuild}
          onDeleteSavedBuild={handleDeleteSavedBuild}
          windTunnelActive={windTunnelActive}
          onToggleWindTunnel={handleToggleWindTunnel}
          onStartFlight={handleStartFlight}
          totalStars={totalStars}
          bestDistanceFeet={bestDistanceFeet}
          muted={muted}
          onToggleMute={handleToggleMute}
        />
      )}

      {/* FLIGHT & RAMP HUD */}
      {mode === 'flight' && !showJudgingModal && (
        <FlightHUD
          flightState={hudFlightState}
          bestDistanceFeet={bestDistanceFeet}
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
          onFlyAgain={handleStartFlight}
          onBackToHangar={handleReturnToHangar}
        />
      )}
    </div>
  );
};
