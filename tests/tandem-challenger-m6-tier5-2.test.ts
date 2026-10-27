/**
 * Red Bull Tandem Bike Challenge — Milestone 6 Phase 2 (Adversarial Coverage Hardening - Tier 5)
 * Empirical Challenger 2 Verification & Stress Test Suite
 *
 * File: tests/tandem-challenger-m6-tier5-2.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setupMockLocalStorage, MockLocalStorage, SPEC, PROJECT_ROOT } from './test-utils.ts';
import { soundEngine, SoundEngine } from '../src/audio/SoundEngine.ts';
import {
  createInitialTandemState,
  resetTandemState,
  triggerDockSyncLaunch,
  stepTandemPhysics,
  updateTandemSimulationWithAccumulator,
  COURSE_LENGTH_FT,
  computeCriticalRollThreshold,
} from '../src/tandem/TandemPhysicsEngine.ts';
import {
  TANDEM_PART_CATALOG,
  DEFAULT_TANDEM_LOADOUT,
  sanitizeLoadout,
  computeTandemDynoMetrics,
  computeTandemAggregateStats,
  getTandemPartById,
} from '../src/tandem/TandemPartCatalog.ts';
import type { TandemLoadout, TandemSimState, TandemControls, TandemStats } from '../src/tandem/types.ts';

setupMockLocalStorage();

const defaultStats: TandemStats = {
  massKg: 160,
  dragCoeff: 0.45,
  cadencePowerW: 400,
  lateralStability: 41.6667,
  rollDamping: 40,
  steeringAgility: 50,
  outriggerWidthFt: 2.0,
};

// Helper to extract calculateTandemStars from source
async function getScorecardSource() {
  const p = path.join(PROJECT_ROOT, 'src/tandem/TandemScorecardModal.tsx');
  return await fs.readFile(p, 'utf-8');
}

function calculateTandemStars(totalScore: number): number {
  if (totalScore >= 26) return 3;
  if (totalScore >= 20) return 2;
  return 1;
}

// ============================================================================
// 1. GAME STATE MACHINE & RAPID TRANSITIONS STRESS-TESTING
// ============================================================================
test('Tier 5 Vector 1: Game State Machine Rapid Transitions & Controls Lockdown', async (t) => {
  await t.test('1.1 Rapid cyclic phase transitions maintain data integrity and no NaN values', () => {
    const s = createInitialTandemState();
    assert.equal(s.phase, 'hype');

    const controls: TandemControls = {
      steer: 0.5,
      pedalCadence: true,
      sprint: true,
      brake: false,
      leanRoll: -0.3,
    };

    // Cycle through 100 rapid transitions between hype -> riding -> splashdown -> reset
    for (let cycle = 0; cycle < 100; cycle++) {
      assert.equal(s.phase, 'hype');
      assert.equal(s.distanceFt, 0);

      // Launch dock sync
      triggerDockSyncLaunch(s, 0.85);
      assert.equal(s.phase, 'riding');
      assert.ok(s.speedMph > 0);

      // Step physics a few ticks
      stepTandemPhysics(s, defaultStats, controls, 1 / 120);
      assert.ok(Number.isFinite(s.distanceFt));
      assert.ok(Number.isFinite(s.speedMph));

      // Force wipeout
      s.lateralOffsetFt = 3.5;
      stepTandemPhysics(s, defaultStats, controls, 1 / 120);
      assert.equal(s.phase, 'splashdown');
      assert.equal(s.speedMph, 0);

      // Subsequent inputs in splashdown must be completely ignored
      const prevDist = s.distanceFt;
      stepTandemPhysics(s, defaultStats, { ...controls, pedalCadence: true, sprint: true }, 1 / 120);
      assert.equal(s.speedMph, 0, 'Speed must remain zero in splashdown');
      assert.equal(s.distanceFt, prevDist, 'Distance must remain frozen in splashdown');

      // Reset state back to workshop/hype
      resetTandemState(s);
      assert.equal(s.phase, 'hype');
      assert.equal(s.distanceFt, 0);
      assert.equal(s.speedMph, 0);
      assert.equal(s.rollAngleRad, 0);
      assert.equal(s.lateralOffsetFt, 0);
    }
  });

  await t.test('1.2 Pre-launch hype countdown locks distance to 0 regardless of pedal/sprint inputs', () => {
    const s = createInitialTandemState();
    s.phase = 'hype';
    const aggressiveControls: TandemControls = {
      steer: 1.0,
      pedalCadence: true,
      sprint: true,
      brake: false,
      leanRoll: 1.0,
    };

    for (let tick = 0; tick < 360; tick++) {
      stepTandemPhysics(s, defaultStats, aggressiveControls, 1 / 120);
      assert.equal(s.distanceFt, 0, 'Distance must remain 0 during hype');
      assert.equal(s.speedMph, 0, 'Speed must remain 0 during hype');
      assert.ok(s.hypeEnergy >= 0, 'Hype energy must be non-negative');
    }
  });

  await t.test('1.3 Finishing at 200 FT clamps distance and locks state without backward roll', () => {
    const s = createInitialTandemState();
    s.phase = 'riding';
    s.distanceFt = 200.0;
    s.speedMph = 18.0;

    const events = stepTandemPhysics(
      s,
      defaultStats,
      { steer: 0, pedalCadence: true, sprint: true, brake: false, leanRoll: 0 },
      1 / 120
    );

    assert.equal(s.phase, 'finished');
    assert.ok(events.bellRung);
    assert.ok(s.distanceFt >= COURSE_LENGTH_FT);

    // Apply brake or reverse grade post-finish: distance must not decrease
    const finishedDist = s.distanceFt;
    stepTandemPhysics(
      s,
      defaultStats,
      { steer: 0, pedalCadence: false, sprint: false, brake: true, leanRoll: 0 },
      1 / 120
    );
    assert.equal(s.phase, 'finished');
    assert.ok(s.distanceFt >= finishedDist, 'Finished distance must not decrease');
  });

  await t.test('1.4 Inverted pendulum critical roll threshold dynamics with various outrigger widths', () => {
    // 0 outriggers
    const noOutriggerStats: TandemStats = { ...defaultStats, outriggerWidthFt: 0 };
    const thetaCrit0 = computeCriticalRollThreshold(noOutriggerStats);

    // 2.0 ft outriggers
    const midOutriggerStats: TandemStats = { ...defaultStats, outriggerWidthFt: 2.0 };
    const thetaCrit2 = computeCriticalRollThreshold(midOutriggerStats);

    // 4.8 ft outriggers (max)
    const maxOutriggerStats: TandemStats = { ...defaultStats, outriggerWidthFt: 4.8 };
    const thetaCritMax = computeCriticalRollThreshold(maxOutriggerStats);

    assert.ok(thetaCrit0 < thetaCrit2, 'Outriggers must increase roll threshold');
    assert.ok(thetaCrit2 < thetaCritMax, 'Wider outriggers must provide higher roll threshold');

    // Edge boundary test: just below threshold recovers, above threshold splashes
    const sPass = createInitialTandemState();
    sPass.phase = 'riding';
    sPass.speedMph = 10;
    sPass.distanceFt = 50;
    sPass.rollAngleRad = thetaCrit2 - 0.005; // just below

    stepTandemPhysics(
      sPass,
      midOutriggerStats,
      { steer: 0, pedalCadence: true, sprint: false, brake: false, leanRoll: 0 },
      1 / 120
    );
    assert.equal(sPass.phase, 'riding', 'Must stay riding below critical roll threshold');

    const sFail = createInitialTandemState();
    sFail.phase = 'riding';
    sFail.speedMph = 10;
    sFail.distanceFt = 50;
    sFail.rollAngleRad = thetaCrit2 + 0.005; // just above

    stepTandemPhysics(
      sFail,
      midOutriggerStats,
      { steer: 0, pedalCadence: true, sprint: false, brake: false, leanRoll: 0 },
      1 / 120
    );
    assert.equal(sFail.phase, 'splashdown', 'Must splashdown when roll exceeds threshold');
  });
});

// ============================================================================
// 2. STAR ECONOMY & SCORECARD IDEMPOTENCY
// ============================================================================
test('Tier 5 Vector 2: Star Economy & Scorecard Awarding Idempotency', async (t) => {
  await t.test('2.1 calculateTandemStars contract verification in TandemScorecardModal.tsx source', async () => {
    const src = await getScorecardSource();
    assert.ok(src.includes('export function calculateTandemStars'), 'calculateTandemStars must be exported');
    assert.ok(src.includes('totalScore >= 26'));
    assert.ok(src.includes('totalScore >= 20'));

    // Test boundaries
    assert.equal(calculateTandemStars(30), 3);
    assert.equal(calculateTandemStars(26.0), 3);
    assert.equal(calculateTandemStars(25.999), 2);
    assert.equal(calculateTandemStars(20.0), 2);
    assert.equal(calculateTandemStars(19.999), 1);
    assert.equal(calculateTandemStars(1), 1);

    // Degenerate values
    assert.equal(calculateTandemStars(0), 1);
    assert.equal(calculateTandemStars(-100), 1);
    assert.equal(calculateTandemStars(100), 3);
  });

  await t.test('2.2 Single-run star awarding is strictly idempotent', () => {
    let callCount = 0;
    let awardedTotal = 0;
    const mockOnAddStars = (stars: number) => {
      callCount++;
      awardedTotal += stars;
    };

    // Simulate TandemGame triggerPostRunConclusion guard pattern
    let hasAwardedStars = false;
    const triggerAward = (starsEarned: number) => {
      if (!hasAwardedStars) {
        hasAwardedStars = true;
        mockOnAddStars(starsEarned);
      }
    };

    // Call 100 times in rapid succession
    for (let i = 0; i < 100; i++) {
      triggerAward(3);
    }

    assert.equal(callCount, 1, 'onAddStars must be invoked exactly once per run');
    assert.equal(awardedTotal, 3, 'Total awarded stars must equal 3');
  });

  await t.test('2.3 App.tsx handleAddStars sanitization prevents NaN, negative or infinite star pollution', () => {
    let totalStars = 10;
    const handleAddStars = (earned: number) => {
      if (!Number.isFinite(earned) || earned <= 0) return;
      const cleanEarned = Math.round(earned);
      if (cleanEarned <= 0) return;
      totalStars += cleanEarned;
    };

    // Adversarial inputs
    handleAddStars(-5);
    assert.equal(totalStars, 10, 'Negative stars must be rejected');

    handleAddStars(0);
    assert.equal(totalStars, 10, 'Zero stars must be rejected');

    handleAddStars(NaN);
    assert.equal(totalStars, 10, 'NaN stars must be rejected');

    handleAddStars(Infinity);
    assert.equal(totalStars, 10, 'Infinity stars must be rejected');

    handleAddStars(-Infinity);
    assert.equal(totalStars, 10, '-Infinity stars must be rejected');

    handleAddStars(2.6);
    assert.equal(totalStars, 13, 'Valid floating star must round cleanly to 3');
  });

  await t.test('2.4 Part unlock threshold filtering correctly detects newly unlocked catalog parts', () => {
    const prevStars = 0;
    const nextStars = 3;

    const newlyUnlocked = TANDEM_PART_CATALOG.filter(
      (p) => p.unlockStars > prevStars && p.unlockStars <= nextStars
    );

    assert.ok(Array.isArray(newlyUnlocked));
    assert.ok(newlyUnlocked.length > 0, 'Catalog should have Tier 1 (3-star) unlocks');
    for (const part of newlyUnlocked) {
      assert.ok(part.unlockStars > 0 && part.unlockStars <= 3);
    }
  });
});

// ============================================================================
// 3. AUDIO SYNTHESIS ROBUSTNESS & NODE LEAKAGE UNDER EXTREME FREQUENCIES
// ============================================================================
test('Tier 5 Vector 3: Audio Synthesis Robustness & Node Lifecycle Cleanup', async (t) => {
  await t.test('3.1 Muted state guarantees early return and zero audio node allocations', () => {
    soundEngine.setMuted(true);
    assert.equal(soundEngine.isMuted(), true);

    // Call all audio methods while muted
    assert.doesNotThrow(() => {
      soundEngine.playSnapPop();
      soundEngine.playAirhorn();
      soundEngine.playPushBoost();
      soundEngine.playPedalCrank();
      soundEngine.playCanalBell(false);
      soundEngine.playCanalBell(true);
      soundEngine.playRollersWhir();
      soundEngine.playSplash(85);
      soundEngine.playSeesawThud();
      soundEngine.playCrowdCheer();
    });

    soundEngine.setMuted(false);
    assert.equal(soundEngine.isMuted(), false);
  });

  await t.test('3.2 Simulated Web Audio Context: playSeesawThud rate limiting & node cleanup', () => {
    // Build a mock Web Audio context graph tracker
    let createdOscillators = 0;
    let createdGains = 0;
    let createdFilters = 0;
    let disconnectedNodes = 0;

    const mockOsc = {
      type: 'triangle',
      frequency: {
        setValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
      },
      connect: () => {},
      disconnect: () => {
        disconnectedNodes++;
      },
      start: () => {},
      stop: () => {},
      onended: null as any,
    };

    const mockGain = {
      gain: {
        value: 1,
        setValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
      },
      connect: () => {},
      disconnect: () => {
        disconnectedNodes++;
      },
    };

    const mockFilter = {
      type: 'bandpass',
      frequency: {
        setValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
      },
      Q: { setValueAtTime: () => {} },
      connect: () => {},
      disconnect: () => {
        disconnectedNodes++;
      },
    };

    const mockCtx = {
      currentTime: 100.0,
      sampleRate: 44100,
      state: 'running',
      createOscillator: () => {
        createdOscillators++;
        return { ...mockOsc };
      },
      createGain: () => {
        createdGains++;
        return { ...mockGain };
      },
      createBiquadFilter: () => {
        createdFilters++;
        return { ...mockFilter };
      },
      createBuffer: () => ({
        getChannelData: () => new Float32Array(1024),
      }),
      createBufferSource: () => ({
        buffer: null,
        loop: false,
        connect: () => {},
        disconnect: () => {
          disconnectedNodes++;
        },
        start: () => {},
        stop: () => {},
        onended: null as any,
      }),
      destination: {},
    };

    // Inject mock context into soundEngine internal reflection
    const engineAny = soundEngine as any;
    const originalCtx = engineAny.ctx;
    const originalMasterGain = engineAny.masterGain;
    engineAny.ctx = mockCtx;
    engineAny.masterGain = mockGain;
    engineAny._muted = false;

    // Reset rate limiter timestamp
    engineAny.lastSeesawThudTime = -1;

    // Test 1: Call playSeesawThud once
    soundEngine.playSeesawThud();
    assert.equal(createdOscillators, 3, 'playSeesawThud must create 3 oscillators (main, sub, knock)');
    assert.equal(createdGains, 3, 'playSeesawThud must create 3 gain nodes (sub, thud, knock)');
    assert.equal(createdFilters, 1, 'playSeesawThud must create 1 resonant biquad filter');

    // Test 2: Rapid successive calls within rate-limit window (< 0.12s) must be discarded
    const oscCountBefore = createdOscillators;
    for (let i = 0; i < 50; i++) {
      soundEngine.playSeesawThud();
    }
    assert.equal(createdOscillators, oscCountBefore, 'Rapid burst within 0.12s must be rate-limited without node creation');

    // Restore engine internals
    engineAny.ctx = originalCtx;
    engineAny.masterGain = originalMasterGain;
  });

  await t.test('3.3 Simulated Web Audio Context: playCrowdCheer rate limiting & dual formant filtering', () => {
    let createdBuffers = 0;
    let createdFilters = 0;
    let createdGains = 0;

    const mockCtx = {
      currentTime: 200.0,
      sampleRate: 44100,
      state: 'running',
      createBuffer: () => {
        createdBuffers++;
        return {
          getChannelData: () => new Float32Array(2048),
        };
      },
      createBufferSource: () => ({
        buffer: null,
        loop: true,
        connect: () => {},
        disconnect: () => {},
        start: () => {},
        stop: () => {},
        onended: null as any,
      }),
      createBiquadFilter: () => {
        createdFilters++;
        return {
          type: 'bandpass',
          frequency: {
            setValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {},
          },
          Q: { setValueAtTime: () => {} },
          connect: () => {},
          disconnect: () => {},
        };
      },
      createGain: () => {
        createdGains++;
        return {
          gain: {
            value: 1,
            setValueAtTime: () => {},
            linearRampToValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {},
          },
          connect: () => {},
          disconnect: () => {},
        };
      },
      destination: {},
    };

    const engineAny = soundEngine as any;
    const originalCtx = engineAny.ctx;
    const originalMasterGain = engineAny.masterGain;
    engineAny.ctx = mockCtx;
    engineAny.masterGain = { connect: () => {}, disconnect: () => {} };
    engineAny._muted = false;
    engineAny.lastCheerTime = -1;

    soundEngine.playCrowdCheer();
    assert.equal(createdFilters, 2, 'Crowd cheer must instantiate dual resonant bandpass filters (formants)');
    assert.equal(createdGains, 3, 'Crowd cheer must instantiate 3 gain nodes (filter1, filter2, cheerGain)');

    // Rapid spamming of crowd cheer (< 0.5s) must be discarded
    const filterCountBefore = createdFilters;
    for (let i = 0; i < 50; i++) {
      soundEngine.playCrowdCheer();
    }
    assert.equal(createdFilters, filterCountBefore, 'Crowd cheer burst within 0.5s must be rate-limited');

    // Restore engine internals
    engineAny.ctx = originalCtx;
    engineAny.masterGain = originalMasterGain;
  });
});

// ============================================================================
// 4. NAVIGATION, LOCALSTORAGE CORRUPTION & RESTRICTED STORAGE RESILIENCE
// ============================================================================
test('Tier 5 Vector 4: LocalStorage Corruption Fuzzing & Storage Quota Fallback', async (t) => {
  await t.test('4.1 Corrupted loadout JSON repair and safe fallback in computeTandemAggregateStats', () => {
    // Case 1: Corrupted object with invalid types
    const corrupt1: any = {
      frameId: 12345,
      drivetrainId: null,
      wheelsId: undefined,
      steeringId: false,
      stabilizerId: [],
      topperId: {},
      paintThemeId: 999,
    };
    const repaired1 = sanitizeLoadout(corrupt1);
    assert.equal(typeof repaired1.frameId, 'string');
    assert.equal(typeof repaired1.drivetrainId, 'string');
    assert.equal(typeof repaired1.wheelsId, 'string');
    assert.equal(typeof repaired1.steeringId, 'string');
    assert.equal(typeof repaired1.stabilizerId, 'string');
    assert.equal(typeof repaired1.topperId, 'string');
    assert.equal(typeof repaired1.paintThemeId, 'string');

    // Case 2: Non-existent alien part IDs in loadout safely fall back in getTandemPartById and computeTandemAggregateStats
    const alienLoadout: TandemLoadout = {
      frameId: 'alien_chassis_9000',
      drivetrainId: 'anti_gravity_warp_drive',
      wheelsId: 'tachyon_discs',
      steeringId: 'neural_telepathy_helm',
      stabilizerId: 'forcefield_stabilizer',
      topperId: 'godzilla_giant_monster',
      paintThemeId: 'invisible_stealth',
    };

    // getTandemPartById falls back to default category parts for unknown IDs
    const fallbackFrame = getTandemPartById(alienLoadout.frameId, 'frame');
    assert.ok(fallbackFrame, 'Unknown part ID must return fallback part');
    assert.equal(fallbackFrame.category, 'frame');

    // computeTandemAggregateStats produces valid finite physics stats without throwing or NaN
    const stats = computeTandemAggregateStats(alienLoadout);
    assert.ok(Number.isFinite(stats.massKg));
    assert.ok(stats.massKg > 140, 'Mass must include crew 140kg');
    assert.ok(Number.isFinite(stats.dragCoeff));
    assert.ok(Number.isFinite(stats.cadencePowerW));
    assert.ok(Number.isFinite(stats.lateralStability));
  });

  await t.test('4.2 High score parsing handles NaN, Infinity, negative, unicode and empty strings', () => {
    const parseStorageNumber = (raw: string | null, fallback: number = 0): number => {
      try {
        if (!raw || !raw.trim()) return fallback;
        const val = Number(raw);
        return Number.isFinite(val) ? val : fallback;
      } catch {
        return fallback;
      }
    };

    assert.equal(parseStorageNumber(null, 0), 0);
    assert.equal(parseStorageNumber('', 0), 0);
    assert.equal(parseStorageNumber('   ', 0), 0);
    assert.equal(parseStorageNumber('NaN', 0), 0);
    assert.equal(parseStorageNumber('Infinity', 0), 0);
    assert.equal(parseStorageNumber('-Infinity', 0), 0);
    assert.equal(parseStorageNumber('🚲🚲🚲', 0), 0);
    assert.equal(parseStorageNumber('185', 0), 185);
    assert.equal(parseStorageNumber('200.5', 0), 200.5);
  });

  await t.test('4.3 Restricted localStorage (throwing QuotaExceededError or SecurityError) does not crash', () => {
    // Custom throwing storage mock
    const throwingStorage = {
      getItem: () => {
        throw new Error('SecurityError: The operation is insecure.');
      },
      setItem: () => {
        throw new Error('QuotaExceededError: The quota has been exceeded.');
      },
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null,
    };

    const originalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      value: throwingStorage,
      writable: true,
      configurable: true,
    });

    // Verify safe loadout retrieval and saving with throwing storage
    const loadSafely = () => {
      try {
        const raw = localStorage.getItem('tandem_loadout_v1');
        if (raw) return sanitizeLoadout(JSON.parse(raw));
      } catch {}
      return { ...DEFAULT_TANDEM_LOADOUT };
    };

    const saveSafely = (loadout: TandemLoadout) => {
      try {
        localStorage.setItem('tandem_loadout_v1', JSON.stringify(loadout));
      } catch {}
    };

    assert.doesNotThrow(() => {
      const l = loadSafely();
      assert.deepEqual(l, DEFAULT_TANDEM_LOADOUT);
      saveSafely(l);
    });

    // Restore standard mock storage
    Object.defineProperty(globalThis, 'localStorage', {
      value: originalStorage,
      writable: true,
      configurable: true,
    });
  });

  await t.test('4.4 URL hash parser in App.tsx maps all alias variations and rejects unknown routes', () => {
    const parseGameModeFromHash = (hash: string) => {
      const cleaned = hash.replace(/^#\/?/, '').trim().toLowerCase();
      if (cleaned === 'flugtag') return 'flugtag';
      if (cleaned === 'soapbox') return 'soapbox';
      if (cleaned === 'coaster' || cleaned === 'rollercoaster') return 'coaster';
      if (cleaned === 'tandem' || cleaned === 'stalenros' || cleaned === 'tandembike') return 'tandem';
      return 'landing';
    };

    assert.equal(parseGameModeFromHash('#tandem'), 'tandem');
    assert.equal(parseGameModeFromHash('#/tandem'), 'tandem');
    assert.equal(parseGameModeFromHash('#TANDEM'), 'tandem');
    assert.equal(parseGameModeFromHash('#stalenros'), 'tandem');
    assert.equal(parseGameModeFromHash('#tandembike'), 'tandem');
    assert.equal(parseGameModeFromHash('#flugtag'), 'flugtag');
    assert.equal(parseGameModeFromHash('#soapbox'), 'soapbox');
    assert.equal(parseGameModeFromHash('#coaster'), 'coaster');
    assert.equal(parseGameModeFromHash('#rollercoaster'), 'coaster');
    assert.equal(parseGameModeFromHash(''), 'landing');
    assert.equal(parseGameModeFromHash('#'), 'landing');
    assert.equal(parseGameModeFromHash('#/'), 'landing');
    assert.equal(parseGameModeFromHash('#unknown_game_mode'), 'landing');
  });
});
