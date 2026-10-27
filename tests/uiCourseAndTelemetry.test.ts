import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  STORAGE_KEY_SOAPBOX_COURSE,
  loadInitialSoapboxCourse,
} from '../src/soapbox/SoapboxGame';
import {
  SOAPBOX_COURSES,
  SoapboxCourseId,
  getSoapboxCourse,
} from '../src/soapbox/SoapboxCourses';
import {
  createInitialSoapboxState,
  detachSoapboxPart,
  finalizeSoapboxJudgeScorecard,
} from '../src/soapbox/SoapboxPhysicsEngine';
import { SOAPBOX_PRESETS } from '../src/soapbox/SoapboxPartCatalog';
import { computeSoapboxMetrics } from '../src/soapbox/SoapboxMetrics';

describe('UI Course Selection, Telemetry Scaling & Scorecard Penalties', () => {
  const metrics = computeSoapboxMetrics(SOAPBOX_PRESETS[0]);

  describe('Course Selection & LocalStorage Persistence', () => {
    const originalLocalStorage = globalThis.localStorage;
    let mockStorage: Record<string, string> = {};

    beforeEach(() => {
      mockStorage = {};
      globalThis.localStorage = {
        getItem: (k: string) => mockStorage[k] ?? null,
        setItem: (k: string, v: string) => {
          mockStorage[k] = v;
        },
        removeItem: (k: string) => {
          delete mockStorage[k];
        },
        clear: () => {
          mockStorage = {};
        },
        key: (_i: number) => null,
        length: 0,
      };
    });

    afterEach(() => {
      globalThis.localStorage = originalLocalStorage;
    });

    it('defaults to alpine_panorama when storage is empty or invalid', () => {
      expect(loadInitialSoapboxCourse()).toBe('alpine_panorama');

      mockStorage[STORAGE_KEY_SOAPBOX_COURSE] = 'invalid_course_id';
      expect(loadInitialSoapboxCourse()).toBe('alpine_panorama');
    });

    it('loads previously selected course from localStorage', () => {
      const validCourses: SoapboxCourseId[] = [
        'canyon_plunge',
        'urban_downhill',
        'extreme_peak',
      ];

      for (const id of validCourses) {
        mockStorage[STORAGE_KEY_SOAPBOX_COURSE] = id;
        expect(loadInitialSoapboxCourse()).toBe(id);
      }
    });
  });

  describe('Dynamic Course Length & Progress Scaling', () => {
    const courseLengths: Record<SoapboxCourseId, number> = {
      alpine_panorama: 2400,
      canyon_plunge: 2800,
      urban_downhill: 2600,
      extreme_peak: 3200,
    };

    for (const [id, expectedLength] of Object.entries(courseLengths) as [SoapboxCourseId, number][]) {
      it(`scales distance progress dynamically for course ${id} (length: ${expectedLength} ft)`, () => {
        const course = getSoapboxCourse(id);
        expect(course.lengthFeet).toBe(expectedLength);

        const state = createInitialSoapboxState(id);
        expect(state.courseLengthFeet).toBe(expectedLength);

        // Progress at distance 500 ft
        state.distanceFeet = 500;
        const progressRatio = Math.max(0, Math.min(1, state.distanceFeet / state.courseLengthFeet));
        expect(progressRatio).toBeCloseTo(500 / expectedLength, 4);

        // Completed run clamped to 1.0
        state.distanceFeet = expectedLength + 20;
        const completeRatio = Math.max(0, Math.min(1, state.distanceFeet / state.courseLengthFeet));
        expect(completeRatio).toBe(1.0);
      });
    }
  });

  describe('Scorecard Damage Penalties for Lost Parts', () => {
    it('applies zero damage penalty for 100% intact run', () => {
      const state = createInitialSoapboxState('alpine_panorama');
      state.completedCourse = true;
      state.distanceFeet = 2400;
      state.elapsedRaceTimeSec = 22.0;
      state.maxSpeedMph = 38;

      const scorecard = finalizeSoapboxJudgeScorecard(state, metrics, 900, 25.0);
      expect(scorecard).toBeDefined();
      expect(scorecard.totalScore).toBeGreaterThanOrEqual(20);
    });

    it('deducts -1.5 pts per lost wheel and -2.0 pts for lost topper from judges scores', () => {
      // 1. Intact baseline
      const stateIntact = createInitialSoapboxState('alpine_panorama');
      stateIntact.completedCourse = true;
      stateIntact.distanceFeet = 2400;
      stateIntact.elapsedRaceTimeSec = 24.0;
      stateIntact.maxSpeedMph = 35;
      const scoreIntact = finalizeSoapboxJudgeScorecard(stateIntact, metrics, 900, 25.0);

      // 2. Lost 1 wheel -> speedJudge reduced by 1.5 (~1-2 after rounding)
      const state1Wheel = createInitialSoapboxState('alpine_panorama');
      state1Wheel.completedCourse = true;
      state1Wheel.distanceFeet = 1000;
      state1Wheel.elapsedRaceTimeSec = 24.0;
      state1Wheel.maxSpeedMph = 35;
      detachSoapboxPart(state1Wheel, 'wheel_fr', 'Curb Strike');
      const score1Wheel = finalizeSoapboxJudgeScorecard(state1Wheel, metrics, 900, 25.0);
      expect(score1Wheel.speedJudge).toBeLessThanOrEqual(scoreIntact.speedJudge);

      // 3. Lost Topper -> creativityJudge reduced by 2.0
      const stateTopper = createInitialSoapboxState('alpine_panorama');
      stateTopper.completedCourse = true;
      stateTopper.distanceFeet = 1000;
      stateTopper.elapsedRaceTimeSec = 24.0;
      stateTopper.maxSpeedMph = 35;
      detachSoapboxPart(stateTopper, 'topper', 'Low Overhang');
      const scoreTopper = finalizeSoapboxJudgeScorecard(stateTopper, metrics, 900, 25.0);
      expect(scoreTopper.creativityJudge).toBeLessThan(scoreIntact.creativityJudge);
      expect(scoreIntact.creativityJudge - scoreTopper.creativityJudge).toBe(2);
    });
  });
});
