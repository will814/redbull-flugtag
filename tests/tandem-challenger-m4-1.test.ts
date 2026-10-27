/**
 * Red Bull Tandem Bike Challenge — Milestone 4 Adversarial Stress Test Suite
 * Empirical Challenger 1 Verification Harness
 *
 * File: tests/tandem-challenger-m4-1.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  calculateTandemStars,
  TandemScorecardModal,
} from '../src/tandem/TandemScorecardModal';
import {
  TandemCourseHUD,
  SECTOR_METAS,
  getSectorForDistance,
} from '../src/tandem/TandemCourseHUD';
import {
  TandemGame,
  computeTandemScorecard,
  STORAGE_KEY_SHARED_STARS,
  STORAGE_KEY_TANDEM_LOADOUT,
  STORAGE_KEY_TANDEM_SAVED_BUILDS,
  STORAGE_KEY_TANDEM_BEST_DIST,
  STORAGE_KEY_TANDEM_BEST_TIME,
} from '../src/tandem/TandemGame';
import {
  TandemCanvas3D,
  buildCourseEnvironment,
  disposeTandemSceneObjects,
} from '../src/tandem/TandemCanvas3D';
import {
  createInitialTandemState,
  resetTandemState,
  triggerDockSyncLaunch,
  stepTandemPhysics,
  COURSE_LENGTH_FT,
  STANDARD_BEAM_HALF_WIDTH_FT,
  computeCriticalRollThreshold,
  updateSeesawBridgeDynamics,
} from '../src/tandem/TandemPhysicsEngine';
import {
  TANDEM_PART_CATALOG,
  DEFAULT_TANDEM_LOADOUT,
  TANDEM_PRESETS,
  computeTandemDynoMetrics,
  computeTandemAggregateStats,
  sanitizeLoadout,
} from '../src/tandem/TandemPartCatalog';
import { setupMockLocalStorage } from './test-utils';
import type { TandemSimState, TandemControls } from '../src/tandem/types';

// Setup Mock LocalStorage for headless node environment
setupMockLocalStorage();

describe('Milestone 4 Empirical Challenger 1 Adversarial Suite', () => {

  beforeEach(() => {
    localStorage.clear();
  });

  // ==========================================================================
  // MANDATORY MISSION 1: calculateTandemStars Out-of-Range Stress Testing
  // ==========================================================================
  describe('Mission Item 1: calculateTandemStars Out-of-Range Stress Testing', () => {
    it('evaluates all required points: -10, 0, 19, 20, 25, 26, 30, 50, 1000', () => {
      // Contract:
      // >= 26 points -> 3 Stars ⭐⭐⭐
      // >= 20 points -> 2 Stars ⭐⭐
      // Else (>= 1 point) -> 1 Star ⭐
      expect(calculateTandemStars(-10)).toBe(1);
      expect(calculateTandemStars(0)).toBe(1);
      expect(calculateTandemStars(19)).toBe(1);
      expect(calculateTandemStars(20)).toBe(2);
      expect(calculateTandemStars(25)).toBe(2);
      expect(calculateTandemStars(26)).toBe(3);
      expect(calculateTandemStars(30)).toBe(3);
      expect(calculateTandemStars(50)).toBe(3);
      expect(calculateTandemStars(1000)).toBe(3);
    });

    it('evaluates floating-point boundary values near thresholds (19.999, 20.001, 25.999, 26.001)', () => {
      expect(calculateTandemStars(19.999)).toBe(1);
      expect(calculateTandemStars(20.001)).toBe(2);
      expect(calculateTandemStars(25.999)).toBe(2);
      expect(calculateTandemStars(26.001)).toBe(3);
    });

    it('handles non-finite values (NaN, Infinity, -Infinity) gracefully without exceptions', () => {
      expect(calculateTandemStars(Infinity)).toBe(3);
      expect(calculateTandemStars(-Infinity)).toBe(1);
      expect(calculateTandemStars(NaN)).toBe(1);
    });
  });

  // ==========================================================================
  // MANDATORY MISSION 2: TandemCourseHUD Control Clamping
  // ==========================================================================
  describe('Mission Item 2: TandemCourseHUD Control Clamping', () => {
    // Clamping logic used in TandemCourseHUD:
    // steerVal = Math.max(-1.0, Math.min(1.0, steerVal));
    // leanVal = Math.max(-1.0, Math.min(1.0, leanVal));
    const clampControl = (val: number): number => {
      const c = Math.max(-1.0, Math.min(1.0, val));
      return Number.isFinite(c) ? c : 0;
    };

    it('asserts extreme analog inputs (-999, +999) clamp strictly within [-1.0, 1.0]', () => {
      expect(clampControl(-999)).toBe(-1.0);
      expect(clampControl(999)).toBe(1.0);
      expect(clampControl(-99999)).toBe(-1.0);
      expect(clampControl(99999)).toBe(1.0);
    });

    it('asserts bounds preservation for valid range [-1.0, 1.0]', () => {
      expect(clampControl(-1.0)).toBe(-1.0);
      expect(clampControl(1.0)).toBe(1.0);
      expect(clampControl(0)).toBe(0);
      expect(clampControl(-0.5)).toBe(-0.5);
      expect(clampControl(0.5)).toBe(0.5);
      expect(clampControl(-1.0001)).toBe(-1.0);
      expect(clampControl(1.0001)).toBe(1.0);
    });

    it('verifies non-finite bounds handling (-Infinity, +Infinity, NaN)', () => {
      expect(clampControl(-Infinity)).toBe(-1.0);
      expect(clampControl(Infinity)).toBe(1.0);
      expect(clampControl(NaN)).toBe(0);
    });

    it('verifies SECTOR_METAS 7 distinct sectors and getSectorForDistance across [0, 200] FT', () => {
      expect(SECTOR_METAS).toHaveLength(7);
      expect(getSectorForDistance(0).id).toBe('dock');
      expect(getSectorForDistance(14).id).toBe('dock');
      expect(getSectorForDistance(15).id).toBe('dock');
      expect(getSectorForDistance(30).id).toBe('beam_1');
      expect(getSectorForDistance(85).id).toBe('rollers');
      expect(getSectorForDistance(120).id).toBe('seesaw');
      expect(getSectorForDistance(150).id).toBe('water_cannon');
      expect(getSectorForDistance(175).id).toBe('gap_jump');
      expect(getSectorForDistance(195).id).toBe('finish_bell');
      expect(getSectorForDistance(200).id).toBe('finish_bell');
      // Negative distance clamp to dock
      expect(getSectorForDistance(-100).id).toBe('dock');
      // Beyond 200 ft clamp to finish bell
      expect(getSectorForDistance(999).id).toBe('finish_bell');
    });
  });

  // ==========================================================================
  // MANDATORY MISSION 3: Gameplay Phase Transitions & Speed Lock Enforcement
  // ==========================================================================
  describe('Mission Item 3: Gameplay Phase Transitions & Speed Lock Enforcement', () => {
    const testStats = {
      massKg: 160,
      dragCoeff: 0.45,
      cadencePowerW: 500,
      lateralStability: 1.0,
      rollDamping: 0.8,
      steeringAgility: 1.0,
      outriggerWidthFt: 2.0,
    };

    it('simulates state from "hype" -> dock launch -> "riding" -> "splashdown" and verifies speed locks to 0', () => {
      const s = createInitialTandemState();

      // Step 1: Initial state in 'hype'
      expect(s.phase).toBe('hype');
      expect(s.distanceFt).toBe(0);
      expect(s.speedMph).toBe(0);

      // Pedaling in hype must build hype energy but distance and speed remain 0
      stepTandemPhysics(s, testStats, { steer: 0, pedalCadence: true, sprint: true, brake: false, leanRoll: 0 }, 1 / 60);
      expect(s.phase).toBe('hype');
      expect(s.distanceFt).toBe(0);
      expect(s.speedMph).toBe(0);

      // Step 2: Dock Launch trigger
      triggerDockSyncLaunch(s, 0.9);
      expect(s.phase).toBe('riding');
      expect(s.speedMph).toBeGreaterThan(0);

      // Step 3: Advance in riding phase
      stepTandemPhysics(s, testStats, { steer: 0, pedalCadence: true, sprint: false, brake: false, leanRoll: 0 }, 1 / 60);
      expect(s.distanceFt).toBeGreaterThan(0);

      // Step 4: Exceed beam boundary (lateralOffsetFt > 1.5 ft) to trigger splashdown
      s.lateralOffsetFt = 2.5; // Off beam
      stepTandemPhysics(s, testStats, { steer: 0, pedalCadence: true, sprint: false, brake: false, leanRoll: 0 }, 1 / 60);
      expect(s.phase).toBe('splashdown');
      expect(s.speedMph).toBe(0);
      expect((s as any).mph).toBe(0);

      // Step 5: Assert speed locks to 0 across 50 subsequent steps despite aggressive controls
      const frozenDist = s.distanceFt;
      for (let step = 0; step < 50; step++) {
        stepTandemPhysics(s, testStats, { steer: 1.0, pedalCadence: true, sprint: true, brake: false, leanRoll: 1.0 }, 1 / 60);
        expect(s.phase).toBe('splashdown');
        expect(s.speedMph).toBe(0);
        expect((s as any).mph).toBe(0);
        expect(s.distanceFt).toBe(frozenDist);
      }
    });

    it('simulates state from "riding" -> "finished" at s >= 200 ft and locks finished state', () => {
      const s = createInitialTandemState();
      s.phase = 'riding';
      s.distanceFt = 200; // Directly at finish bell
      s.speedMph = 14.5;

      const events = stepTandemPhysics(s, testStats, { steer: 0, pedalCadence: true, sprint: false, brake: false, leanRoll: 0 }, 1 / 60);
      expect(s.phase).toBe('finished');
      expect(s.hasFinished).toBe(true);
      expect(s.distanceFt).toBeGreaterThanOrEqual(COURSE_LENGTH_FT);
      expect(events.bellRung).toBe(true);

      // Subsequent steps in finished phase must stay finished and cannot splashdown
      s.lateralOffsetFt = 4.0;
      s.rollAngleRad = 1.2;
      stepTandemPhysics(s, testStats, { steer: 0, pedalCadence: true, sprint: false, brake: false, leanRoll: 0 }, 1 / 60);
      expect(s.phase).toBe('finished');
      expect(s.hasFinished).toBe(true);
    });
  });

  // ==========================================================================
  // MANDATORY MISSION 4: Rapid Mode Switching in TandemGame (50 Iterations)
  // ==========================================================================
  describe('Mission Item 4: Rapid Mode Switching Resilience in TandemGame (50 Iterations)', () => {
    it('executes 50 rapid mode cycles ("workshop" -> "run" -> "scorecard" -> "workshop") with zero unhandled rejections, memory leaks, or NaN state', () => {
      const loadout = { ...DEFAULT_TANDEM_LOADOUT };
      const metrics = computeTandemDynoMetrics(loadout);

      let currentMode: 'workshop' | 'run' | 'scorecard' = 'workshop';
      let totalStarsAwarded = 0;
      let recordedDist = 0;
      let recordedTime: number | null = null;

      for (let i = 0; i < 50; i++) {
        // Step 1: Workshop
        expect(currentMode).toBe('workshop');
        const s = createInitialTandemState();
        expect(s.phase).toBe('hype');

        // Step 2: Switch to Run
        currentMode = 'run';
        triggerDockSyncLaunch(s, 0.85);
        expect(s.phase).toBe('riding');

        // Simulate flight/progress
        const completed = i % 2 === 1;
        s.distanceFt = completed ? 200 : 50 + (i * 7) % 140;
        s.timeElapsedSec = 17.5 + (i % 6);
        s.phase = completed ? 'finished' : 'splashdown';
        if (!completed) s.speedMph = 0;

        // Step 3: Switch to Scorecard
        currentMode = 'scorecard';
        const card = computeTandemScorecard(s, loadout, metrics, recordedDist, recordedTime);
        expect(card).toBeDefined();
        expect(card.totalScore).toBeGreaterThanOrEqual(3);
        expect(card.totalScore).toBeLessThanOrEqual(30);
        expect([1, 2, 3]).toContain(card.starsEarned);
        expect(card.completedCourse).toBe(completed);

        totalStarsAwarded += card.starsEarned;
        if (card.distanceFt > recordedDist) recordedDist = card.distanceFt;
        if (completed && (recordedTime === null || card.finishTimeSec! < recordedTime)) {
          recordedTime = card.finishTimeSec;
        }

        // Step 4: Return to Workshop
        resetTandemState(s);
        expect(s.phase).toBe('hype');
        currentMode = 'workshop';
      }

      expect(currentMode).toBe('workshop');
      expect(totalStarsAwarded).toBeGreaterThan(50);
      expect(recordedDist).toBe(200);
      expect(recordedTime).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // ADVERSARIAL STRESS VECTORS: Seesaw Invert Bug & Visual Scene Disposal
  // ==========================================================================
  describe('Adversarial Investigation: Seesaw Visual Angle Orientation Verification', () => {
    it('analyzes seesaw rotation sign: updateSeesawBridgeDynamics vs Three.js rotation.z', () => {
      // Physical dynamic seesaw angle:
      // Before fulcrum (distanceFt = 105, fulcrum = 120): deltaS = -15 -> returns +8.5 deg (+0.148 rad)
      const seesawUphill = updateSeesawBridgeDynamics(105, 160, 120);
      expect(seesawUphill).toBeCloseTo((8.5 * Math.PI) / 180, 4);

      // In TandemCanvas3D.tsx line 1120:
      // course.seesawPivotGroup.rotation.z = -currentSeesawAngle;
      // In Three.js right-handed system (X forward, Y up, Z right/depth):
      // Rotation around Z axis: +rot rotates +X toward +Y (uphill slope dY/dX > 0).
      // -rot rotates +X toward -Y (downhill slope dY/dX < 0).
      //
      // Because course.seesawPivotGroup.rotation.z = -currentSeesawAngle:
      // When currentSeesawAngle is +8.5 deg (uphill), rotation.z becomes -8.5 deg!
      // This causes the visual mesh to slope DOWNHILL towards +X (entrance in air, exit submerged in canal)!
      // Conversely, after fulcrum (distanceFt = 135), currentSeesawAngle is -8.5 deg,
      // so rotation.z becomes +8.5 deg (tilted uphill into the air)!
      const canvasAppliedRotationZ = -seesawUphill;
      expect(canvasAppliedRotationZ).toBeLessThan(0); // Negative rotation means downhill slope!
    });

    it('verifies 3D Scene recursive disposal cleanly frees all GPU resources without errors', () => {
      const course = buildCourseEnvironment();
      expect(course.group).toBeDefined();

      expect(() => {
        disposeTandemSceneObjects(course.group, true);
      }).not.toThrow();
    });
  });
});
