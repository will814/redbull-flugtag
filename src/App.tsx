import React, { useCallback, useEffect, useState } from 'react';
import { GameModeId, LandingPage } from './ui/LandingPage';
import { FlugtagGame } from './flugtag/FlugtagGame';
import { SoapboxGame } from './soapbox/SoapboxGame';
import { CoasterGame } from './coaster/CoasterGame';
import { soundEngine } from './audio/SoundEngine';

const STORAGE_KEY_STARS = 'flugtag_stars_v1';
const STORAGE_KEY_FLUGTAG_BEST = 'flugtag_best_dist_v1';
const STORAGE_KEY_SOAPBOX_BEST_DIST = 'soapbox_best_dist_v1';
const STORAGE_KEY_SOAPBOX_BEST_TIME = 'soapbox_best_time_v1';
const STORAGE_KEY_COASTER_BEST_DIST = 'coaster_best_dist_v1';
const STORAGE_KEY_COASTER_BEST_THRILL = 'coaster_best_thrill_v1';
const STORAGE_KEY_LEGACY_BY_COMP = 'flugtag_best_dist_by_comp_v1';

interface LegacyBestByComp {
  flugtag?: number;
  soapbox?: number;
  rollercoaster?: number;
  coaster?: number;
}

function readNumberStorage(key: string, fallback: number = 0): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw || !raw.trim()) return fallback;
    const val = Number(raw);
    return Number.isFinite(val) ? val : fallback;
  } catch {
    return fallback;
  }
}

function readLegacyBestByComp(): LegacyBestByComp {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LEGACY_BY_COMP);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as LegacyBestByComp;
  } catch {
    return {};
  }
}

function readAndMigrateBestDist(
  targetKey: string,
  legacyKey: keyof LegacyBestByComp,
  altLegacyKey?: keyof LegacyBestByComp
): number {
  const currentVal = Math.max(0, Math.round(readNumberStorage(targetKey, 0)));
  const legacyMap = readLegacyBestByComp();
  const primaryRaw = legacyMap[legacyKey];
  const altRaw = altLegacyKey ? legacyMap[altLegacyKey] : undefined;
  const primaryVal = Number.isFinite(Number(primaryRaw)) ? Math.round(Number(primaryRaw)) : 0;
  const altVal = Number.isFinite(Number(altRaw)) ? Math.round(Number(altRaw)) : 0;
  const legacyVal = Math.max(0, primaryVal, altVal);
  const best = Math.max(currentVal, legacyVal);
  if (best > currentVal) {
    try {
      localStorage.setItem(targetKey, String(best));
    } catch {
      // ignore storage quota errors
    }
  }
  return best;
}

function parseGameModeFromHash(): GameModeId {
  if (typeof window === 'undefined') return 'landing';
  const cleaned = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase();
  if (cleaned === 'flugtag') return 'flugtag';
  if (cleaned === 'soapbox') return 'soapbox';
  if (cleaned === 'coaster' || cleaned === 'rollercoaster') return 'coaster';
  return 'landing';
}

export function App() {
  const [activeGame, setActiveGame] = useState<GameModeId>(() => parseGameModeFromHash());
  const [muted, setMuted] = useState<boolean>(() => soundEngine.muted);

  const [totalStars, setTotalStars] = useState<number>(() =>
    Math.max(0, Math.round(readNumberStorage(STORAGE_KEY_STARS, 0)))
  );
  const [flugtagBestDist, setFlugtagBestDist] = useState<number>(() =>
    readAndMigrateBestDist(STORAGE_KEY_FLUGTAG_BEST, 'flugtag')
  );
  const [soapboxBestDist, setSoapboxBestDist] = useState<number>(() =>
    readAndMigrateBestDist(STORAGE_KEY_SOAPBOX_BEST_DIST, 'soapbox')
  );
  const [soapboxBestTime, setSoapboxBestTime] = useState<number | null>(() => {
    const val = readNumberStorage(STORAGE_KEY_SOAPBOX_BEST_TIME, 0);
    return val > 0 ? val : null;
  });
  const [coasterBestDist, setCoasterBestDist] = useState<number>(() =>
    readAndMigrateBestDist(STORAGE_KEY_COASTER_BEST_DIST, 'rollercoaster', 'coaster')
  );
  const [coasterBestThrill, setCoasterBestThrill] = useState<number>(() =>
    Math.max(0, readNumberStorage(STORAGE_KEY_COASTER_BEST_THRILL, 0))
  );

  // Sync URL hash with activeGame & support browser back/forward navigation
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const targetHash = activeGame === 'landing' ? '' : `#${activeGame}`;
    if (
      window.location.hash !== targetHash ||
      (activeGame === 'landing' && window.location.href.endsWith('#'))
    ) {
      const nextUrl = `${window.location.pathname}${window.location.search}${targetHash}`;
      window.history.replaceState(null, '', nextUrl);
    }
  }, [activeGame]);

  useEffect(() => {
    const handleHashChange = () => {
      setActiveGame(parseGameModeFromHash());
    };
    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('popstate', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('popstate', handleHashChange);
    };
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      soundEngine.muted = next;
      return next;
    });
  }, []);

  const handleSelectGame = useCallback((game: 'flugtag' | 'soapbox' | 'coaster') => {
    soundEngine.playSnapPop();
    setActiveGame(game);
  }, []);

  const handleReturnToHub = useCallback(() => {
    soundEngine.playSnapPop();
    setActiveGame('landing');
  }, []);

  // Support Escape inside a game's hangar/garage/bay to return to the Landing Page
  // (runs after child keydown handlers so modals and active flight/race runs take priority)
  useEffect(() => {
    if (activeGame === 'landing') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      handleReturnToHub();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeGame, handleReturnToHub]);

  const handleAddStars = useCallback((earned: number) => {
    if (!Number.isFinite(earned) || earned <= 0) return;
    const cleanEarned = Math.round(earned);
    if (cleanEarned <= 0) return;
    setTotalStars((prev) => {
      const next = prev + cleanEarned;
      try {
        localStorage.setItem(STORAGE_KEY_STARS, String(next));
      } catch {
        // ignore storage quota errors
      }
      return next;
    });
  }, []);

  const handleUpdateFlugtagRecord = useCallback((dist: number) => {
    if (!Number.isFinite(dist)) return;
    const rounded = Math.round(dist);
    setFlugtagBestDist((prev) => {
      if (rounded <= prev) return prev;
      try {
        localStorage.setItem(STORAGE_KEY_FLUGTAG_BEST, String(rounded));
      } catch {
        // ignore
      }
      return rounded;
    });
  }, []);

  const handleUpdateSoapboxRecord = useCallback((feet: number, timeSec: number | null) => {
    if (Number.isFinite(feet)) {
      const roundedFeet = Math.round(feet);
      setSoapboxBestDist((prev) => {
        if (roundedFeet <= prev) return prev;
        try {
          localStorage.setItem(STORAGE_KEY_SOAPBOX_BEST_DIST, String(roundedFeet));
        } catch {
          // ignore
        }
        return roundedFeet;
      });
    }

    if (timeSec !== null && Number.isFinite(timeSec) && timeSec > 0) {
      setSoapboxBestTime((prev) => {
        if (prev !== null && timeSec >= prev) return prev;
        try {
          localStorage.setItem(STORAGE_KEY_SOAPBOX_BEST_TIME, String(timeSec));
        } catch {
          // ignore
        }
        return timeSec;
      });
    }
  }, []);

  const handleUpdateCoasterRecord = useCallback((feet: number, thrillScore: number) => {
    if (Number.isFinite(feet)) {
      const roundedFeet = Math.round(feet);
      setCoasterBestDist((prev) => {
        if (roundedFeet <= prev) return prev;
        try {
          localStorage.setItem(STORAGE_KEY_COASTER_BEST_DIST, String(roundedFeet));
        } catch {
          // ignore
        }
        return roundedFeet;
      });
    }

    if (Number.isFinite(thrillScore)) {
      setCoasterBestThrill((prev) => {
        if (thrillScore <= prev) return prev;
        try {
          localStorage.setItem(STORAGE_KEY_COASTER_BEST_THRILL, String(thrillScore));
        } catch {
          // ignore
        }
        return thrillScore;
      });
    }
  }, []);

  return (
    <div className="relative h-dvh w-dvw overflow-hidden bg-slate-950 select-none">
      {activeGame === 'landing' && (
        <LandingPage
          onSelectGame={handleSelectGame}
          totalStars={totalStars}
          flugtagBestDist={flugtagBestDist}
          soapboxBestDist={soapboxBestDist}
          soapboxBestTime={soapboxBestTime}
          coasterBestDist={coasterBestDist}
          coasterBestThrill={coasterBestThrill}
          muted={muted}
          onToggleMute={handleToggleMute}
        />
      )}

      {activeGame === 'flugtag' && (
        <FlugtagGame
          totalStars={totalStars}
          onAddStars={handleAddStars}
          bestDistance={flugtagBestDist}
          onUpdateBestDistance={handleUpdateFlugtagRecord}
          muted={muted}
          onToggleMute={handleToggleMute}
          onReturnToHub={handleReturnToHub}
        />
      )}

      {activeGame === 'soapbox' && (
        <SoapboxGame
          totalStars={totalStars}
          onAddStars={handleAddStars}
          bestRecordFeet={soapboxBestDist}
          bestTimeSec={soapboxBestTime}
          onUpdateRecord={handleUpdateSoapboxRecord}
          muted={muted}
          onToggleMute={handleToggleMute}
          onReturnToHub={handleReturnToHub}
        />
      )}

      {activeGame === 'coaster' && (
        <CoasterGame
          totalStars={totalStars}
          onAddStars={handleAddStars}
          bestDistanceFeet={coasterBestDist}
          bestThrillScore={coasterBestThrill}
          onUpdateRecord={handleUpdateCoasterRecord}
          muted={muted}
          onToggleMute={handleToggleMute}
          onReturnToHub={handleReturnToHub}
        />
      )}
    </div>
  );
}

export default App;
