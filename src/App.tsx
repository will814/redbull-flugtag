import React, { useCallback, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  CompetitionId,
  COMPETITIONS,
  CraftLoadout,
  CraftPart,
  getPartById,
  getPartsByCategory,
  PAINT_THEMES,
  PART_CATALOG,
  PartCategory,
  PRESET_BLUEPRINTS_BY_COMPETITION,
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

const STORAGE_KEY_COMP = 'flugtag_active_comp_v1';
const STORAGE_KEY_STARS = 'flugtag_total_stars_v1';
const STORAGE_KEY_BEST_DIST_LEGACY = 'flugtag_best_dist_v1';
const STORAGE_KEY_BEST_DIST_BY_COMP = 'flugtag_best_dist_by_comp_v1';
const STORAGE_KEY_LOADOUT_LEGACY = 'flugtag_loadout_v1';
const STORAGE_KEY_LOADOUT_BY_COMP = 'flugtag_loadout_by_comp_v1';
const STORAGE_KEY_SAVED_BUILDS = 'flugtag_saved_builds_v1';
const STORAGE_KEY_MUTED = 'flugtag_muted_v1';
const MAX_HISTORY_LENGTH = 25;

function loadInitialCompetition(): CompetitionId {
  try {
    const val = localStorage.getItem(STORAGE_KEY_COMP);
    if (val === 'flugtag' || val === 'soapbox' || val === 'rollercoaster') {
      return val;
    }
  } catch {
    // ignore
  }
  return 'flugtag';
}

function loadInitialStars(): number {
  try {
    const val = localStorage.getItem(STORAGE_KEY_STARS);
    return val ? Math.max(0, parseInt(val, 10) || 0) : 0;
  } catch {
    return 0;
  }
}

function loadInitialBestDistByComp(): Record<CompetitionId, number> {
  const defaults: Record<CompetitionId, number> = {
    flugtag: 0,
    soapbox: 0,
    rollercoaster: 0,
  };
  try {
    const legacy = localStorage.getItem(STORAGE_KEY_BEST_DIST_LEGACY);
    if (legacy) {
      defaults.flugtag = Math.max(0, parseInt(legacy, 10) || 0);
    }
    const raw = localStorage.getItem(STORAGE_KEY_BEST_DIST_BY_COMP);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Record<CompetitionId, number>>;
      return {
        flugtag: parsed.flugtag ?? defaults.flugtag,
        soapbox: parsed.soapbox ?? 0,
        rollercoaster: parsed.rollercoaster ?? 0,
      };
    }
  } catch {
    // ignore
  }
  return defaults;
}

function inferLoadoutCompetition(craft: CraftLoadout): CompetitionId {
  const comp = getPartById(craft.chassis).competition;
  return comp === 'soapbox' || comp === 'rollercoaster' ? comp : 'flugtag';
}

function loadInitialCraftsByComp(): Record<CompetitionId, CraftLoadout> {
  const defaults: Record<CompetitionId, CraftLoadout> = {
    flugtag: PRESET_BLUEPRINTS_BY_COMPETITION.flugtag[0],
    soapbox: PRESET_BLUEPRINTS_BY_COMPETITION.soapbox[0],
    rollercoaster: PRESET_BLUEPRINTS_BY_COMPETITION.rollercoaster[0],
  };
  try {
    const legacy = localStorage.getItem(STORAGE_KEY_LOADOUT_LEGACY);
    if (legacy) {
      const parsedLegacy = JSON.parse(legacy) as CraftLoadout;
      if (inferLoadoutCompetition(parsedLegacy) === 'flugtag') {
        defaults.flugtag = parsedLegacy;
      }
    }
    const raw = localStorage.getItem(STORAGE_KEY_LOADOUT_BY_COMP);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Record<CompetitionId, CraftLoadout>>;
      return {
        flugtag:
          parsed.flugtag && inferLoadoutCompetition(parsed.flugtag) === 'flugtag'
            ? parsed.flugtag
            : defaults.flugtag,
        soapbox:
          parsed.soapbox && inferLoadoutCompetition(parsed.soapbox) === 'soapbox'
            ? parsed.soapbox
            : defaults.soapbox,
        rollercoaster:
          parsed.rollercoaster &&
          inferLoadoutCompetition(parsed.rollercoaster) === 'rollercoaster'
            ? parsed.rollercoaster
            : defaults.rollercoaster,
      };
    }
  } catch {
    // ignore
  }
  return defaults;
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

function loadInitialMuted(): boolean {
  try {
    const val = localStorage.getItem(STORAGE_KEY_MUTED);
    const isMuted = val === '1';
    soundEngine.muted = isMuted;
    return isMuted;
  } catch {
    return false;
  }
}

export const App: React.FC = () => {
  const [mode, setMode] = useState<'hangar' | 'flight'>('hangar');
  const [competition, setCompetition] = useState<CompetitionId>(loadInitialCompetition);
  const [craftsByComp, setCraftsByComp] = useState<Record<CompetitionId, CraftLoadout>>(
    loadInitialCraftsByComp
  );
  const [loadout, setLoadout] = useState<CraftLoadout>(
    () => loadInitialCraftsByComp()[loadInitialCompetition()]
  );
  const [historyState, setHistoryState] = useState<{
    entries: CraftLoadout[];
    index: number;
  }>(() => ({
    entries: [loadInitialCraftsByComp()[loadInitialCompetition()]],
    index: 0,
  }));
  const [savedBuilds, setSavedBuilds] = useState<SavedCraftSlot[]>(loadInitialSavedBuilds);
  const [selectedCategory, setSelectedCategory] = useState<PartCategory>(
    () => COMPETITIONS[loadInitialCompetition()].categories[0].id
  );
  const [windTunnelActive, setWindTunnelActive] = useState<boolean>(false);
  const [totalStars, setTotalStars] = useState<number>(loadInitialStars);
  const [bestDistByComp, setBestDistByComp] = useState<Record<CompetitionId, number>>(
    loadInitialBestDistByComp
  );
  const [muted, setMuted] = useState<boolean>(loadInitialMuted);

  const bestDistanceFeet = bestDistByComp[competition] ?? 0;

  // Refs for latest values inside stable callbacks
  const competitionRef = useRef(competition);
  competitionRef.current = competition;
  const totalStarsRef = useRef(totalStars);
  totalStarsRef.current = totalStars;
  const bestDistByCompRef = useRef(bestDistByComp);
  bestDistByCompRef.current = bestDistByComp;
  const craftsByCompRef = useRef(craftsByComp);
  craftsByCompRef.current = craftsByComp;

  // Flight simulation state (mutated at 60Hz in ref, synced to React state for HUD)
  const flightStateRef = useRef<FlightSimulationState>(
    createInitialFlightState(competition)
  );
  const [hudFlightState, setHudFlightState] = useState<FlightSimulationState>(() =>
    createInitialFlightState(competition)
  );
  const [showJudgingModal, setShowJudgingModal] = useState<boolean>(false);
  const [newlyUnlockedParts, setNewlyUnlockedParts] = useState<CraftPart[]>([]);

  const metrics = useMemo(() => computeCraftMetrics(loadout), [loadout]);
  const metricsRef = useRef(metrics);
  metricsRef.current = metrics;

  const persistLoadout = useCallback((next: CraftLoadout, compId: CompetitionId) => {
    setCraftsByComp((prev) => {
      const updated = { ...prev, [compId]: next };
      try {
        localStorage.setItem(STORAGE_KEY_LOADOUT_BY_COMP, JSON.stringify(updated));
        if (compId === 'flugtag') {
          localStorage.setItem(STORAGE_KEY_LOADOUT_LEGACY, JSON.stringify(next));
        }
      } catch {
        // ignore
      }
      return updated;
    });
  }, []);

  const handleSelectCompetition = useCallback((nextComp: CompetitionId) => {
    if (nextComp === competitionRef.current) return;
    soundEngine.playSnapPop();
    competitionRef.current = nextComp;
    setCompetition(nextComp);
    setSelectedCategory(COMPETITIONS[nextComp].categories[0].id);
    setWindTunnelActive(false);
    try {
      localStorage.setItem(STORAGE_KEY_COMP, nextComp);
    } catch {
      // ignore
    }
    const targetCraft =
      craftsByCompRef.current[nextComp] ?? PRESET_BLUEPRINTS_BY_COMPETITION[nextComp][0];
    setLoadout(targetCraft);
    setHistoryState({
      entries: [targetCraft],
      index: 0,
    });
  }, []);

  const pushLoadoutChange = useCallback(
    (updater: CraftLoadout | ((prev: CraftLoadout) => CraftLoadout)) => {
      setLoadout((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        persistLoadout(next, competitionRef.current);
        setHistoryState((h) => {
          const sliced = h.entries.slice(0, h.index + 1);
          const updated = [...sliced, next].slice(-MAX_HISTORY_LENGTH);
          return {
            entries: updated,
            index: updated.length - 1,
          };
        });
        return next;
      });
    },
    [persistLoadout]
  );

  const canUndo = historyState.index > 0;
  const canRedo = historyState.index < historyState.entries.length - 1;

  const handleUndo = useCallback(() => {
    setHistoryState((h) => {
      if (h.index <= 0) return h;
      const nextIndex = h.index - 1;
      const target = h.entries[nextIndex];
      soundEngine.playSnapPop();
      setLoadout(target);
      persistLoadout(target, competitionRef.current);
      return { ...h, index: nextIndex };
    });
  }, [persistLoadout]);

  const handleRedo = useCallback(() => {
    setHistoryState((h) => {
      if (h.index >= h.entries.length - 1) return h;
      const nextIndex = h.index + 1;
      const target = h.entries[nextIndex];
      soundEngine.playSnapPop();
      setLoadout(target);
      persistLoadout(target, competitionRef.current);
      return { ...h, index: nextIndex };
    });
  }, [persistLoadout]);

  const handleSaveCurrentBuild = useCallback(
    (customName?: string) => {
      soundEngine.playUnlockFanfare();
      setSavedBuilds((prevBuilds) => {
        const currentLoadout = historyState.entries[historyState.index] ?? loadout;
        const topperPart = getPartById(currentLoadout.topper);
        const chassisPart = getPartById(currentLoadout.chassis);
        const wingPart = getPartById(currentLoadout.wings);

        const autoName = `${topperPart.emoji} ${
          topperPart.id !== 'topper_none'
            ? topperPart.name.split(' ').slice(-1)[0]
            : wingPart.name.split(' ')[0]
        } ${chassisPart.name.split(' ')[0]} #${prevBuilds.length + 1}`;

        const finalName = customName || autoName;
        const newSlot: SavedCraftSlot = {
          id: `build_${Date.now()}`,
          name: finalName,
          competition: inferLoadoutCompetition(currentLoadout),
          loadout: { ...currentLoadout, name: finalName },
          createdAt: Date.now(),
        };

        const updated = [newSlot, ...prevBuilds].slice(0, 12);
        try {
          localStorage.setItem(STORAGE_KEY_SAVED_BUILDS, JSON.stringify(updated));
        } catch {
          // ignore
        }
        return updated;
      });
    },
    [historyState, loadout]
  );

  const handleDeleteSavedBuild = useCallback((id: string) => {
    soundEngine.playSnapPop();
    setSavedBuilds((prevBuilds) => {
      const updated = prevBuilds.filter((b) => b.id !== id);
      try {
        localStorage.setItem(STORAGE_KEY_SAVED_BUILDS, JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  }, []);

  const handleEquipPart = useCallback(
    (category: PartCategory, partId: string) => {
      soundEngine.playSnapPop();
      pushLoadoutChange((prev) =>
        prev[category] === partId ? prev : { ...prev, [category]: partId }
      );
    },
    [pushLoadoutChange]
  );

  const handleSelectPaint = useCallback(
    (paintTheme: CraftLoadout['paintTheme']) => {
      soundEngine.playSnapPop();
      pushLoadoutChange((prev) =>
        prev.paintTheme === paintTheme ? prev : { ...prev, paintTheme }
      );
    },
    [pushLoadoutChange]
  );

  const handleApplyPreset = useCallback(
    (preset: CraftLoadout) => {
      soundEngine.playSnapPop();
      const targetComp = inferLoadoutCompetition(preset);
      if (targetComp !== competitionRef.current) {
        competitionRef.current = targetComp;
        setCompetition(targetComp);
        setSelectedCategory(COMPETITIONS[targetComp].categories[0].id);
        setWindTunnelActive(false);
        try {
          localStorage.setItem(STORAGE_KEY_COMP, targetComp);
        } catch {
          // ignore
        }
        const next = { ...preset };
        setLoadout(next);
        persistLoadout(next, targetComp);
        setHistoryState({
          entries: [next],
          index: 0,
        });
      } else {
        pushLoadoutChange({ ...preset });
      }
    },
    [persistLoadout, pushLoadoutChange]
  );

  const handleRandomizeCraft = useCallback(() => {
    soundEngine.playSnapPop();
    const curStars = totalStarsRef.current;
    const curComp = competitionRef.current;
    const pickRandom = (cat: PartCategory) => {
      const compParts = getPartsByCategory(cat, curComp);
      const unlocked = compParts.filter((p) => p.unlockStars <= curStars);
      const pool = unlocked.length > 0 ? unlocked : compParts;
      return pool[Math.floor(Math.random() * pool.length)].id;
    };
    const randomTheme =
      PAINT_THEMES[Math.floor(Math.random() * PAINT_THEMES.length)].id;

    pushLoadoutChange({
      name: '🎲 Surprise Craft',
      chassis: pickRandom('chassis'),
      wings: pickRandom('wings'),
      tail: pickRandom('tail'),
      nose: pickRandom('nose'),
      topper: pickRandom('topper'),
      trolley: pickRandom('trolley'),
      paintTheme: randomTheme,
    });
  }, [pushLoadoutChange]);

  const handleToggleWindTunnel = useCallback(() => {
    soundEngine.playFanWhoosh();
    setWindTunnelActive((prev) => !prev);
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      soundEngine.muted = next;
      try {
        localStorage.setItem(STORAGE_KEY_MUTED, next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const handleStartFlight = useCallback(() => {
    soundEngine.playAirhorn();
    setWindTunnelActive(false);
    setShowJudgingModal(false);
    setNewlyUnlockedParts([]);
    const fresh = createInitialFlightState(competitionRef.current);
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
    if (sim.phase === 'airborne' && sim.competition === 'flugtag') {
      soundEngine.playAirhorn();
      return;
    }

    const res = triggerHypeOrPushTap(sim, metricsRef.current);
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
      const compId = finalState.competition;
      if (scores) {
        const prevStars = totalStarsRef.current;
        const nextStars = prevStars + scores.starsEarned;
        totalStarsRef.current = nextStars;
        setTotalStars(nextStars);
        try {
          localStorage.setItem(STORAGE_KEY_STARS, String(nextStars));
        } catch {
          // ignore
        }

        const newlyUnlocked = PART_CATALOG.filter(
          (p) =>
            p.unlockStars > prevStars &&
            p.unlockStars <= nextStars &&
            (p.category === 'topper' ||
              p.competition === 'shared' ||
              p.competition === compId ||
              (!p.competition && compId === 'flugtag'))
        );
        setNewlyUnlockedParts(newlyUnlocked);

        const prevBest = bestDistByCompRef.current[compId] ?? 0;
        if (finalState.distanceFeet > prevBest) {
          const updatedBest = {
            ...bestDistByCompRef.current,
            [compId]: finalState.distanceFeet,
          };
          bestDistByCompRef.current = updatedBest;
          setBestDistByComp(updatedBest);
          try {
            localStorage.setItem(
              STORAGE_KEY_BEST_DIST_BY_COMP,
              JSON.stringify(updatedBest)
            );
            if (compId === 'flugtag') {
              localStorage.setItem(
                STORAGE_KEY_BEST_DIST_LEGACY,
                String(finalState.distanceFeet)
              );
            }
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
    []
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
        onSelectCategory={setSelectedCategory}
        onFlightHudSync={setHudFlightState}
        onSplashdownComplete={handleSplashdownComplete}
      />

      {/* HANGAR BUILDER HUD */}
      {mode === 'hangar' && (
        <HangarHUD
          competition={competition}
          onSelectCompetition={handleSelectCompetition}
          loadout={loadout}
          metrics={metrics}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          onEquipPart={handleEquipPart}
          onSelectPaint={handleSelectPaint}
          onApplyPreset={handleApplyPreset}
          onRandomizeCraft={handleRandomizeCraft}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
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

      {/* FLIGHT & COURSE HUD */}
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

      {/* POST-RUN 3-JUDGE SCORECARD & PART UNLOCKS MODAL */}
      {mode === 'flight' && showJudgingModal && (
        <JudgingScorecardModal
          flightState={hudFlightState}
          newlyUnlockedParts={newlyUnlockedParts}
          totalStars={totalStars}
          bestDistanceFeet={bestDistanceFeet}
          onFlyAgain={handleStartFlight}
          onBackToHangar={handleReturnToHangar}
        />
      )}
    </div>
  );
};
