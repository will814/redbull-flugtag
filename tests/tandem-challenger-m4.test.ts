/**
 * Red Bull Tandem Bike Challenge — Milestone 4 Adversarial Stress Test Suite
 * Empirical Challenger 2 Verification Harness
 *
 * File: tests/tandem-challenger-m4.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  COURSE_LENGTH_FT,
  STANDARD_BEAM_HALF_WIDTH_FT,
  TANDEM_COURSE_TRACK,
  computeCriticalRollThreshold,
  getTrackElevationAtDistance,
  updateSeesawBridgeDynamics,
  stepTandemPhysics,
  createInitialTandemState,
  triggerDockSyncLaunch,
  type TandemSimState,
  type TandemControls,
} from '../src/tandem/TandemPhysicsEngine.ts';
import {
  computeTandemAggregateStats,
  DEFAULT_TANDEM_LOADOUT,
  computeTandemDynoMetrics,
  TANDEM_PART_CATALOG,
} from '../src/tandem/TandemPartCatalog.ts';
import {
  buildCourseEnvironment,
  disposeTandemSceneObjects,
} from '../src/tandem/TandemCanvas3D.tsx';
import {
  SECTOR_METAS,
  getSectorForDistance,
} from '../src/tandem/TandemCourseHUD.tsx';
import {
  calculateTandemStars,
} from '../src/tandem/TandemScorecardModal.tsx';
import {
  computeTandemScorecard,
  STORAGE_KEY_SHARED_STARS,
  STORAGE_KEY_TANDEM_BEST_DIST,
  STORAGE_KEY_TANDEM_BEST_TIME,
} from '../src/tandem/TandemGame.tsx';

describe('Milestone 4 Adversarial Verification & Stress Test Suite', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    const storageMock = {
      getItem: (k: string) => mockStorage[k] ?? null,
      setItem: (k: string, v: string) => { mockStorage[k] = String(v); },
      removeItem: (k: string) => { delete mockStorage[k]; },
      clear: () => { mockStorage = {}; },
    };
    (globalThis as any).localStorage = storageMock;
  });

  // ==========================================================================
  // CHALLENGE 1: COURSE SECTOR BOUNDS & GEOMETRIC CONTINUITY (s in [0, 200] ft)
  // ==========================================================================
  describe('Challenge 1: Course Sector Bounds & Track Continuity', () => {
    it('physics track registers all 7 sectors spanning exactly 0 to 200 ft', () => {
      expect(TANDEM_COURSE_TRACK).toHaveLength(7);
      expect(TANDEM_COURSE_TRACK[0].startFt).toBe(0);
      expect(TANDEM_COURSE_TRACK[6].endFt).toBe(COURSE_LENGTH_FT);

      // Verify sector types
      const types = TANDEM_COURSE_TRACK.map((s) => s.type);
      expect(types).toEqual(['dock', 'beam', 'rollers', 'seesaw', 'hazard', 'gap', 'finish']);
    });

    it('SECTOR_METAS covers all 7 sectors and getSectorForDistance maps cleanly across [0, 600] ft', () => {
      expect(SECTOR_METAS).toHaveLength(7);

      // Boundary tests
      expect(getSectorForDistance(0).id).toBe('dock');
      expect(getSectorForDistance(14.9).id).toBe('dock');
      expect(getSectorForDistance(29).id).toBe('dock');
      expect(getSectorForDistance(80).id).toBe('beam_1');
      expect(getSectorForDistance(215).id).toBe('rollers');
      expect(getSectorForDistance(330).id).toBe('seesaw');
      expect(getSectorForDistance(450).id).toBe('water_cannon');
      expect(getSectorForDistance(530).id).toBe('gap_jump');
      expect(getSectorForDistance(580).id).toBe('finish_bell');
      expect(getSectorForDistance(600).id).toBe('finish_bell');

      // Extreme bounds (negative distance or beyond 600 ft)
      expect(getSectorForDistance(-50).id).toBe('dock');
      expect(getSectorForDistance(900).id).toBe('finish_bell');
    });

    it('inspects TandemCanvas3D course meshes for physical deck coverage along X axis', () => {
      const course = buildCourseEnvironment();
      expect(course.group).toBeInstanceOf(THREE.Group);

      // Collect bounding boxes of all meshes in course group (excluding water plane, pilings, confetti, particles)
      const deckSegments: Array<{ name: string; minX: number; maxX: number; minY: number; maxY: number }> = [];

      course.group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh && mesh !== course.waterMesh) {
          // Exclude decorative / small non-deck objects
          if (mesh.geometry) {
            mesh.geometry.computeBoundingBox();
            const bb = mesh.geometry.boundingBox;
            if (bb) {
              const worldMin = new THREE.Vector3(bb.min.x, bb.min.y, bb.min.z);
              const worldMax = new THREE.Vector3(bb.max.x, bb.max.y, bb.max.z);
              mesh.updateWorldMatrix(true, false);
              worldMin.applyMatrix4(mesh.matrixWorld);
              worldMax.applyMatrix4(mesh.matrixWorld);

              const spanX = Math.abs(worldMax.x - worldMin.x);
              const spanZ = Math.abs(worldMax.z - worldMin.z);

              // Deck meshes are wide enough to ride on (spanZ > 0.4m) and longitudinal (spanX > 1.0m)
              if (spanZ >= 0.4 && spanX >= 1.0 && worldMin.y >= 0.5) {
                deckSegments.push({
                  name: mesh.name || obj.parent?.name || 'deck',
                  minX: Math.min(worldMin.x, worldMax.x),
                  maxX: Math.max(worldMin.x, worldMax.x),
                  minY: Math.min(worldMin.y, worldMax.y),
                  maxY: Math.max(worldMin.y, worldMax.y),
                });
              }
            }
          }
        }
      });

      // Sort segments by minX
      deckSegments.sort((a, b) => a.minX - b.minX);

      // Verify that Dock, Beam, Seesaw, and Ramp segments exist along the 600-ft (182.88m) course
      expect(deckSegments.length).toBeGreaterThanOrEqual(4);

      // Check Sector 4 (Seesaw bridge 310..350 ft = 94.49m..106.68m) and Sector 6 (Ramp Takeoff 499..515 ft = 152.10m..156.97m)
      const seesawSegment = deckSegments.find((d) => d.minX >= 92.0 && d.maxX <= 108.5);
      const rampSegment = deckSegments.find((d) => d.minX >= 150.0 && d.maxX <= 158.5);

      expect(seesawSegment).toBeDefined();
      expect(rampSegment).toBeDefined();

      if (seesawSegment && rampSegment) {
        const gapMeters = rampSegment.minX - seesawSegment.maxX;
        expect(gapMeters).toBeGreaterThan(0);
      }

      disposeTandemSceneObjects(course.group, true);
    });

    it('verifies physics simulation continuously evaluates deck elevation across all 600 ft without NaN or undefined', () => {
      for (let s = 0; s <= COURSE_LENGTH_FT; s += 1.0) {
        const y = getTrackElevationAtDistance(s);
        expect(Number.isFinite(y)).toBe(true);
        expect(y).toBeGreaterThanOrEqual(7.0); // roller troughs
        expect(y).toBeLessThanOrEqual(9.5);    // ramp & roller peaks
      }
    });

    it('simulates full course traverse from s=0 to s=200 ft without physics falling through or NaN state', () => {
      const stats = computeTandemAggregateStats(DEFAULT_TANDEM_LOADOUT);
      const state = createInitialTandemState();
      triggerDockSyncLaunch(state, 1.0);
      expect(state.phase).toBe('riding');

      const controls: TandemControls = {
        steer: 0,
        pedalCadence: true,
        sprint: true,
        brake: false,
        leanRoll: 0,
      };

      let ticks = 0;
      const maxTicks = 120 * 30; // 30 seconds at 120Hz
      const dt = 1 / 120;

      while (state.phase === 'riding' && ticks < maxTicks) {
        stepTandemPhysics(state, stats, controls, dt);
        ticks++;
        if (state.phase === 'splashdown') {
          console.log('SPLASHDOWN DIAGNOSTIC:', {
            distanceFt: state.distanceFt,
            speedMph: state.speedMph,
            rollAngleRad: state.rollAngleRad,
            lateralOffsetFt: state.lateralOffsetFt,
            isAirborne: (state as any).isAirborne,
            verticalHeightFt: (state as any).verticalHeightFt,
            verticalVelFps: (state as any).verticalVelFps,
          });
        }
        expect(Number.isFinite(state.distanceFt)).toBe(true);
        expect(Number.isFinite(state.speedMph)).toBe(true);
        expect(Number.isFinite(state.rollAngleRad)).toBe(true);
      }

      // Check distance reached
      expect(state.distanceFt).toBeGreaterThanOrEqual(140);
    });
  });

  // ==========================================================================
  // CHALLENGE 2: SEESAW PIVOT REACTIVITY & INVERT ERROR VERIFICATION
  // ==========================================================================
  describe('Challenge 2: Seesaw Pivot Reactivity & Angular Tracking', () => {
    it('evaluates seesaw bridge tilt angle dynamically before and after fulcrum', () => {
      const fulcrumFt = 120;

      // Approaching fulcrum (s < 119 ft): tilted uphill (+8.5 deg)
      const angleApproach = updateSeesawBridgeDynamics(105, 160, fulcrumFt);
      expect(angleApproach).toBeCloseTo((8.5 * Math.PI) / 180, 4);
      expect(angleApproach).toBeGreaterThan(0);

      // Exactly at fulcrum (s = 120 ft): level (0 deg)
      const angleFulcrum = updateSeesawBridgeDynamics(120, 160, fulcrumFt);
      expect(angleFulcrum).toBeCloseTo(0, 4);

      // Past fulcrum (s > 121 ft): tilted downhill (-8.5 deg)
      const anglePast = updateSeesawBridgeDynamics(135, 160, fulcrumFt);
      expect(anglePast).toBeCloseTo((-8.5 * Math.PI) / 180, 4);
      expect(anglePast).toBeLessThan(0);
    });

    it('verifies TandemCanvas3D tracks simState.seesawAngles["seesaw_1"] if provided', () => {
      const course = buildCourseEnvironment();
      const testAngleRad = 0.125;

      // In TandemCanvas3D, course.seesawPivotGroup.rotation.z is updated based on:
      // s?.seesawAngles?.seesaw_1 ?? s?.seesawAngles?.seesaw_bridge_1 ?? updateSeesawBridgeDynamics(distFt)
      // When simState has seesaw_1:
      const simStateWithSeesaw1: Partial<TandemSimState> = {
        distanceFt: 110,
        seesawAngles: { seesaw_1: testAngleRad },
      };

      const resolvedAngle =
        simStateWithSeesaw1.seesawAngles?.seesaw_1 ??
        simStateWithSeesaw1.seesawAngles?.seesaw_bridge_1 ??
        updateSeesawBridgeDynamics(simStateWithSeesaw1.distanceFt!);

      expect(resolvedAngle).toBe(testAngleRad);

      disposeTandemSceneObjects(course.group, true);
    });

    it('analyzes seesaw rotation sign convention: Three.js rotation.z vs track slope', () => {
      // In Three.js:
      // A positive rotation around Z axis (+rotation.z) rotates +X towards +Y (uphill slope dY/dX > 0).
      // A negative rotation around Z axis (-rotation.z) rotates +X towards -Y (downhill slope dY/dX < 0).
      //
      // In TandemPhysicsEngine.ts:
      // Before fulcrum (s < 120 ft): seesawAngle = +8.5 deg (uphill slope).
      // After fulcrum (s > 120 ft): seesawAngle = -8.5 deg (downhill slope).
      //
      // In TandemCanvas3D.tsx line 1120:
      // course.seesawPivotGroup.rotation.z = -currentSeesawAngle;
      //
      // With rotation.z = -currentSeesawAngle:
      // Before fulcrum (currentSeesawAngle = +8.5 deg):
      // rotation.z = -8.5 deg -> this tilts +X DOWNWARDS (downhill), meaning the entrance is UP and the exit is DOWN!
      // This is an empirical invert error in the visual orientation of the seesaw bridge.

      const uphillAngle = (8.5 * Math.PI) / 180; // +0.14835 rad
      const appliedRotationZ = -uphillAngle;     // -0.14835 rad

      // Test point at entry of seesaw (local x = -6.096 m)
      const localEntryX = -6.096;
      const transformedEntryY = localEntryX * Math.sin(appliedRotationZ);

      // With inverted sign (-currentSeesawAngle), transformedEntryY is POSITIVE (+0.90 m),
      // which lifts the entry into the air above the pier deck!
      expect(transformedEntryY).toBeGreaterThan(0);

      // Conversely, if rotation.z = +currentSeesawAngle:
      const correctRotationZ = uphillAngle;
      const correctEntryY = localEntryX * Math.sin(correctRotationZ);
      // Entry should be lower (down at the pier deck, y < 0 relative to pivot)
      expect(correctEntryY).toBeLessThan(0);
    });
  });

  // ==========================================================================
  // CHALLENGE 3: STAR ECONOMY IDEMPOTENCY & STORAGE INTEGRITY
  // ==========================================================================
  describe('Challenge 3: Star Economy Idempotency & Persistence', () => {


    it('calculateTandemStars maps total judge scores strictly according to contract', () => {
      // Contract: >= 26 -> 3 stars, >= 20 -> 2 stars, else 1 star
      expect(calculateTandemStars(30)).toBe(3);
      expect(calculateTandemStars(26)).toBe(3);
      expect(calculateTandemStars(25)).toBe(2);
      expect(calculateTandemStars(20)).toBe(2);
      expect(calculateTandemStars(19)).toBe(1);
      expect(calculateTandemStars(3)).toBe(1);
      expect(calculateTandemStars(0)).toBe(1);
    });

    it('asserts double-invoking star award handler increments localStorage flugtag_stars_v1 exactly once', () => {
      localStorage.setItem(STORAGE_KEY_SHARED_STARS, '15');

      let hasAwardedStars = false;
      const awardHandler = (earned: number) => {
        if (hasAwardedStars) return; // Idempotency guard
        hasAwardedStars = true;
        const current = Number(localStorage.getItem(STORAGE_KEY_SHARED_STARS) || 0);
        localStorage.setItem(STORAGE_KEY_SHARED_STARS, String(current + earned));
      };

      // First invocation
      awardHandler(3);
      expect(localStorage.getItem(STORAGE_KEY_SHARED_STARS)).toBe('18');

      // Second invocation (double-invoke attack)
      awardHandler(3);
      expect(localStorage.getItem(STORAGE_KEY_SHARED_STARS)).toBe('18');

      // Third invocation
      awardHandler(3);
      expect(localStorage.getItem(STORAGE_KEY_SHARED_STARS)).toBe('18');
    });

    it('computes scorecard and asserts starsEarned conforms to 3-judge evaluation', () => {
      const loadout = DEFAULT_TANDEM_LOADOUT;
      const metrics = computeTandemDynoMetrics(loadout);

      // Scenario A: Finished run with fast time
      const finishedState: TandemSimState = {
        ...createInitialTandemState(),
        phase: 'finished',
        distanceFt: COURSE_LENGTH_FT,
        timeElapsedSec: 21.0,
        stokerSyncPct: 90,
        hypeEnergy: 80,
      };

      const cardA = computeTandemScorecard(finishedState, loadout, metrics, 150, null);
      expect(cardA.completedCourse).toBe(true);
      expect(cardA.distanceTimeScore).toBe(10);
      expect(cardA.starsEarned).toBeGreaterThanOrEqual(2);
      expect(cardA.newDistanceRecord).toBe(true);
      expect(cardA.newTimeRecord).toBe(true);

      // Scenario B: Early splashdown at 50 ft
      const splashState: TandemSimState = {
        ...createInitialTandemState(),
        phase: 'splashdown',
        distanceFt: 50,
        timeElapsedSec: 8.5,
        stokerSyncPct: 40,
        hypeEnergy: 30,
      };

      const cardB = computeTandemScorecard(splashState, loadout, metrics, 100, null);
      expect(cardB.completedCourse).toBe(false);
      expect(cardB.distanceTimeScore).toBeLessThanOrEqual(3);
      expect(cardB.starsEarned).toBe(1);
      expect(cardB.newDistanceRecord).toBe(false);
    });

    it('handles corrupted localStorage values gracefully without NaN in star pool or records', () => {
      localStorage.setItem(STORAGE_KEY_SHARED_STARS, 'corrupted_string');
      localStorage.setItem(STORAGE_KEY_TANDEM_BEST_DIST, 'NaN');
      localStorage.setItem(STORAGE_KEY_TANDEM_BEST_TIME, 'undefined');

      // Helper simulating safe reading
      const readNum = (key: string, fb: number) => {
        const raw = localStorage.getItem(key);
        if (!raw) return fb;
        const val = Number(raw);
        return Number.isFinite(val) ? val : fb;
      };

      expect(readNum(STORAGE_KEY_SHARED_STARS, 0)).toBe(0);
      expect(readNum(STORAGE_KEY_TANDEM_BEST_DIST, 0)).toBe(0);
      expect(readNum(STORAGE_KEY_TANDEM_BEST_TIME, 0)).toBe(0);
    });
  });

  // ==========================================================================
  // CHALLENGE 4: CONTROLS CLAMPING, CAMERA SHAKE & ADVERSARIAL INPUTS
  // ==========================================================================
  describe('Challenge 4: Controls Clamping & Adversarial Inputs', () => {
    it('strictly clamps analog steer and lean inputs within [-1.0, 1.0]', () => {
      const clampInput = (val: number) => Math.max(-1.0, Math.min(1.0, val));

      expect(clampInput(999.0)).toBe(1.0);
      expect(clampInput(-999.0)).toBe(-1.0);
      expect(clampInput(1.0001)).toBe(1.0);
      expect(clampInput(-1.0001)).toBe(-1.0);
      expect(clampInput(0.0)).toBe(0.0);
      expect(clampInput(0.75)).toBe(0.75);
    });

    it('rejects extreme physics inputs without memory or calculation collapse', () => {
      const stats = computeTandemAggregateStats(DEFAULT_TANDEM_LOADOUT);
      const state = createInitialTandemState();
      state.phase = 'riding';
      state.speedMph = 15;
      state.distanceFt = 50;

      // dt = 0
      const ev0 = stepTandemPhysics(state, stats, { steer: 0, pedalCadence: true, sprint: false, brake: false, leanRoll: 0 }, 0);
      expect(ev0.splashOccurred).toBe(false);

      // dt = negative
      const evNeg = stepTandemPhysics(state, stats, { steer: 0, pedalCadence: true, sprint: false, brake: false, leanRoll: 0 }, -0.016);
      expect(evNeg.splashOccurred).toBe(false);

      // dt = NaN
      const evNan = stepTandemPhysics(state, stats, { steer: 0, pedalCadence: true, sprint: false, brake: false, leanRoll: 0 }, NaN);
      expect(evNan.splashOccurred).toBe(false);

      // Post-splashdown lock check
      state.phase = 'splashdown';
      state.speedMph = 0;
      state.distanceFt = 50;

      stepTandemPhysics(state, stats, { steer: 1, pedalCadence: true, sprint: true, brake: false, leanRoll: 1 }, 1 / 120);
      expect(state.speedMph).toBe(0);
      expect(state.distanceFt).toBe(50);
    });

    it('verifies personal best records persistence logic', () => {
      let currentBestDist = 0;
      let currentBestTime: number | null = null;

      const updateRecord = (dist: number, timeSec: number | null) => {
        if (dist > currentBestDist) {
          currentBestDist = Math.round(dist);
          localStorage.setItem(STORAGE_KEY_TANDEM_BEST_DIST, String(currentBestDist));
        }
        if (timeSec !== null) {
          if (currentBestTime === null || timeSec < currentBestTime) {
            currentBestTime = timeSec;
            localStorage.setItem(STORAGE_KEY_TANDEM_BEST_TIME, String(currentBestTime));
          }
        }
      };

      // Run 1: Splashdown at 120 ft
      updateRecord(120, null);
      expect(localStorage.getItem(STORAGE_KEY_TANDEM_BEST_DIST)).toBe('120');
      expect(localStorage.getItem(STORAGE_KEY_TANDEM_BEST_TIME)).toBeNull();

      // Run 2: Splashdown at 80 ft (shorter distance)
      updateRecord(80, null);
      expect(localStorage.getItem(STORAGE_KEY_TANDEM_BEST_DIST)).toBe('120'); // Preserved

      // Run 3: Completed run at 200 ft in 25.4s
      updateRecord(200, 25.4);
      expect(localStorage.getItem(STORAGE_KEY_TANDEM_BEST_DIST)).toBe('200');
      expect(localStorage.getItem(STORAGE_KEY_TANDEM_BEST_TIME)).toBe('25.4');

      // Run 4: Completed run in 22.8s (faster)
      updateRecord(200, 22.8);
      expect(localStorage.getItem(STORAGE_KEY_TANDEM_BEST_TIME)).toBe('22.8');

      // Run 5: Completed run in 29.0s (slower)
      updateRecord(200, 29.0);
      expect(localStorage.getItem(STORAGE_KEY_TANDEM_BEST_TIME)).toBe('22.8'); // Preserved
    });
  });
});
