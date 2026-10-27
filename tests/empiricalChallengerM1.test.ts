import { describe, it, expect } from 'vitest';
import {
  SOAPBOX_COURSE_LIST,
  SOAPBOX_COURSES,
  SoapboxCourseId,
  getSoapboxCourse,
  getSoapboxRoadElevation,
  getSoapboxRoadGrade,
  getSoapboxRoadHeading,
  getSoapboxRoadCurvature,
} from '../src/soapbox/SoapboxCourses';
import {
  createInitialSoapboxState,
  getSoapboxRoadState,
  stepSoapboxSimulation,
  SoapboxSimulationState,
} from '../src/soapbox/SoapboxPhysicsEngine';
import {
  SOAPBOX_PRESETS,
  SoapboxLoadout,
} from '../src/soapbox/SoapboxPartCatalog';
import {
  computeSoapboxMetrics,
  ComputedSoapboxMetrics,
} from '../src/soapbox/SoapboxMetrics';

describe('CHALLENGER EMPIRICAL SUITE: Milestone 1 Physics, Slope Monotonicity & Gravity Propulsion', () => {
  const courseIds: SoapboxCourseId[] = [
    'alpine_panorama',
    'canyon_plunge',
    'urban_downhill',
    'extreme_peak',
  ];

  // ============================================================================
  // TASK 1: FINE-GRAINED SLOPE MONOTONICITY ACROSS ALL 4 COURSES
  // ============================================================================
  describe('Task 1: Fine-Grained Slope Monotonicity Verification (0.1 ft to 0.5 ft)', () => {
    courseIds.forEach((courseId) => {
      describe(`Course: ${courseId}`, () => {
        const course = SOAPBOX_COURSES[courseId];

        it('empirically verifies dy/ds <= -0.05 analytically at 0.1 ft intervals across entire track', () => {
          const stepFeet = 0.1;
          let maxDyDs = -Infinity;
          let minDyDs = Infinity;
          let worstS = 0;

          for (let s = 0; s <= course.lengthFeet; s += stepFeet) {
            const elev = course.getElevation(s);
            if (elev.dyDs > maxDyDs) {
              maxDyDs = elev.dyDs;
              worstS = s;
            }
            if (elev.dyDs < minDyDs) {
              minDyDs = elev.dyDs;
            }

            // Strict contract: dy/ds <= -0.05 everywhere
            expect(
              elev.dyDs,
              `Slope at s=${s.toFixed(1)} ft failed dy/ds <= -0.05 (got ${elev.dyDs.toFixed(5)})`
            ).toBeLessThanOrEqual(-0.05);
          }

          // Confirms downhill slope never flattens above -0.05
          expect(maxDyDs).toBeLessThanOrEqual(-0.05);
          expect(minDyDs).toBeLessThan(maxDyDs);
        });

        it('empirically verifies finite-difference monotonicity at 0.1 ft, 0.25 ft, and 0.5 ft intervals', () => {
          const stepSizes = [0.1, 0.25, 0.5];

          for (const ds of stepSizes) {
            let maxFiniteDyDs = -Infinity;
            let flatOrUphillPoints = 0;

            for (let s = 0; s < course.lengthFeet; s += ds) {
              const sNext = Math.min(course.lengthFeet, s + ds);
              if (sNext <= s) break;

              const y1 = getSoapboxRoadElevation(s, courseId);
              const y2 = getSoapboxRoadElevation(sNext, courseId);
              const finiteDyDs = (y2 - y1) / (sNext - s);

              if (finiteDyDs > maxFiniteDyDs) {
                maxFiniteDyDs = finiteDyDs;
              }

              // Zero flat or uphill anomalies: y2 must be strictly lower than y1
              if (y2 >= y1) {
                flatOrUphillPoints++;
              }

              // Every discrete interval must descend with finite difference dy/ds <= -0.049
              expect(
                finiteDyDs,
                `Finite difference at s=${s.toFixed(2)} with ds=${ds} failed (got ${finiteDyDs.toFixed(5)})`
              ).toBeLessThanOrEqual(-0.049);

              expect(y2, `Uphill anomaly at s=${s.toFixed(2)}: y2=${y2} >= y1=${y1}`).toBeLessThan(y1);
            }

            expect(flatOrUphillPoints, `Course ${courseId} has flat/uphill anomalies with ds=${ds}`).toBe(0);
            expect(maxFiniteDyDs).toBeLessThanOrEqual(-0.049);
          }
        });

        it('verifies starter ramp continuous negative slope and smooth transition at s=0', () => {
          // Starter ramp is from -40 ft to 0 ft
          const rampStep = 0.2;
          for (let s = -course.startRampFeet; s < 0; s += rampStep) {
            const sNext = Math.min(0, s + rampStep);
            const y1 = getSoapboxRoadElevation(s, courseId);
            const y2 = getSoapboxRoadElevation(sNext, courseId);
            expect(y2).toBeLessThan(y1);
            const slope = (y2 - y1) / (sNext - s);
            expect(slope).toBeLessThanOrEqual(-0.1);
          }

          // Check continuity at s = 0 boundary
          const yBefore0 = getSoapboxRoadElevation(-0.001, courseId);
          const yAt0 = getSoapboxRoadElevation(0, courseId);
          const yAfter0 = getSoapboxRoadElevation(0.001, courseId);
          expect(Math.abs(yBefore0 - yAt0)).toBeLessThan(0.01);
          expect(Math.abs(yAfter0 - yAt0)).toBeLessThan(0.01);
          expect(yAfter0).toBeLessThan(yAt0);
        });

        it('verifies elevation drop >= 111.5 ft and average grade <= -10%', () => {
          const yStart = getSoapboxRoadElevation(0, courseId);
          const yFinish = getSoapboxRoadElevation(course.lengthFeet, courseId);
          const totalDrop = yStart - yFinish;
          const avgGradePct = ((yFinish - yStart) / course.lengthFeet) * 100;

          expect(totalDrop).toBeGreaterThanOrEqual(111.5);
          expect(avgGradePct).toBeLessThanOrEqual(-10.0);
        });
      });
    });
  });

  // ============================================================================
  // TASK 2: UNBRAKED VEHICLES STARTING AT s=0, v=0 UNDER GRAVITY PROPULSION
  // ============================================================================
  describe('Task 2: Empirical Simulation of Unbraked Vehicles from Standstill (s=0, v=0)', () => {
    // Test matrix of vehicle configurations:
    const customHeavyCouch: SoapboxLoadout = {
      name: '🛋️ Heavy Lead Couch Tank',
      chassis: 'sb_chassis_bathtub',
      steering: 'sb_steer_ballast', // Heavy belly ballast
      wheels: 'sb_wheels_cheese',
      suspension: 'sb_susp_leaf',
      brakes: 'sb_brake_wood',
      topper: 'sb_topper_couch',     // 95 lb couch
      paintTheme: 'cyber_violet',
    };

    const customLightweightAero: SoapboxLoadout = {
      name: '🚀 Ultra-Light Aero Dart',
      chassis: 'sb_chassis_cigar',
      steering: 'sb_steer_kart',
      wheels: 'sb_wheels_slicks',
      suspension: 'sb_susp_rigid',
      brakes: 'sb_brake_disc',
      topper: 'sb_topper_gtwing',
      paintTheme: 'redbull_navy',
    };

    const customHighDragWienermobile: SoapboxLoadout = {
      name: '🌭 High-Drag Wienermobile',
      chassis: 'sb_chassis_hotdog',
      steering: 'sb_steer_wishbone',
      wheels: 'sb_wheels_offroad',
      suspension: 'sb_susp_pogo',
      brakes: 'sb_brake_plow',
      topper: 'sb_topper_taco',
      paintTheme: 'hotrod_flame',
    };

    const testConfigs: { label: string; loadout: SoapboxLoadout }[] = [
      { label: 'Preset 0: Shadow Apex Streamliner', loadout: SOAPBOX_PRESETS[0] },
      { label: 'Preset 1: Wienermobile Hay-Crusher', loadout: SOAPBOX_PRESETS[1] },
      { label: 'Preset 2: Boomer Sudsy Drift Tub', loadout: SOAPBOX_PRESETS[2] },
      { label: 'Preset 3: RB19 Record Spec', loadout: SOAPBOX_PRESETS[3] },
      { label: 'Custom: Heavy Lead Couch Tank', loadout: customHeavyCouch },
      { label: 'Custom: Ultra-Light Aero Dart', loadout: customLightweightAero },
      { label: 'Custom: High-Drag Wienermobile', loadout: customHighDragWienermobile },
    ];

    const dt = 1 / 120; // 120Hz physics sub-step

    courseIds.forEach((courseId) => {
      describe(`Course: ${courseId}`, () => {
        testConfigs.forEach(({ label, loadout }) => {
          it(`propels ${label} from rest (s=0, v=0) to > 25 mph purely under gravity`, () => {
            const metrics = computeSoapboxMetrics(loadout);
            const state = createInitialSoapboxState(courseId);

            // Configure vehicle directly at start line at rest without any pedal/push assistance
            state.phase = 'racing';
            state.sFeet = 0;
            state.distanceFeet = 0;
            state.speedFtS = 0;
            state.mph = 0;
            state.maxSpeedMph = 0;
            state.brakeInput = false;
            state.pushTuckActive = false;
            state.steerInput = 0;

            let reached25Mph = false;
            let timeTo25Mph = 0;
            let distTo25Mph = 0;
            let peakSpeedMph = 0;

            // Simulate up to 35 seconds of downhill gravity rollaway (4,200 ticks at 120Hz)
            const maxTicks = 4200;
            for (let tick = 0; tick < maxTicks; tick++) {
              stepSoapboxSimulation(state, metrics, dt, 0, null);

              if (state.mph > peakSpeedMph) {
                peakSpeedMph = state.mph;
              }

              if (!reached25Mph && state.mph >= 25.0) {
                reached25Mph = true;
                timeTo25Mph = state.elapsedRaceTimeSec;
                distTo25Mph = state.sFeet;
              }

              // Check for vehicle stalling (should never stall on a >= 5% downhill slope)
              if (tick > 240) {
                expect(state.speedFtS, 'Vehicle stalled on downhill slope').toBeGreaterThan(0.5);
              }

              if (state.phase === 'finished' || state.isWrecked) {
                break;
              }
            }

            // Assertions:
            expect(
              reached25Mph,
              `Config ${label} failed to reach 25 mph on ${courseId}. Peak was ${peakSpeedMph.toFixed(1)} mph`
            ).toBe(true);

            expect(peakSpeedMph).toBeGreaterThanOrEqual(25.0);
            expect(timeTo25Mph).toBeGreaterThan(0);
            expect(distTo25Mph).toBeGreaterThan(0);
            expect(distTo25Mph).toBeLessThan(state.courseLengthFeet);
          });
        });
      });
    });
  });

  // ============================================================================
  // TASK 3: BRAKING DYNAMICS & VELOCITY NON-NEGATIVITY VERIFICATION
  // ============================================================================
  describe('Task 3: Braking Dynamics, Deceleration & Velocity Non-Negativity', () => {
    const dt = 1 / 120;
    const metrics = computeSoapboxMetrics(SOAPBOX_PRESETS[0]);

    courseIds.forEach((courseId) => {
      it(`[${courseId}] cleanly decelerates from high speed under braking without dipping below 0 ft/s`, () => {
        const state = createInitialSoapboxState(courseId);
        state.phase = 'racing';
        state.sFeet = 300;
        state.speedFtS = 50; // ~34 mph
        state.mph = 50 * 0.681818;
        state.brakeInput = true;
        state.pushTuckActive = false;

        let negativeVelocityObserved = false;
        let minObservedSpeed = Infinity;

        // Apply brakes for 360 ticks (3.0 seconds)
        for (let tick = 0; tick < 360; tick++) {
          stepSoapboxSimulation(state, metrics, dt, 0, null);

          if (state.speedFtS < minObservedSpeed) {
            minObservedSpeed = state.speedFtS;
          }

          if (state.speedFtS < 0 || state.mph < 0) {
            negativeVelocityObserved = true;
          }

          expect(state.speedFtS).toBeGreaterThanOrEqual(0);
          expect(state.mph).toBeGreaterThanOrEqual(0);
        }

        expect(negativeVelocityObserved).toBe(false);
        expect(minObservedSpeed).toBeGreaterThanOrEqual(0);
        // Under braking, speed should have reduced significantly from initial 50 ft/s
        expect(state.speedFtS).toBeLessThan(40);
        expect(state.brakeHeat).toBeGreaterThan(0);

        // Also test high-performance disc brakes (Preset 3: RB19) to verify strong stopping power down steep grades
        const discMetrics = computeSoapboxMetrics(SOAPBOX_PRESETS[3]);
        const discState = createInitialSoapboxState(courseId);
        discState.phase = 'racing';
        discState.sFeet = 300;
        discState.speedFtS = 50;
        discState.mph = 50 * 0.681818;
        discState.brakeInput = true;

        for (let tick = 0; tick < 360; tick++) {
          stepSoapboxSimulation(discState, discMetrics, dt, 0, null);
          expect(discState.speedFtS).toBeGreaterThanOrEqual(0);
          expect(discState.mph).toBeGreaterThanOrEqual(0);
        }
        // With disc brakes, speed should decelerate below 20 ft/s cleanly
        expect(discState.speedFtS).toBeLessThan(20);
      });

      it(`[${courseId}] stays firmly at 0 ft/s when held at complete stop on steep slope with high brake power`, () => {
        // High brake power setup
        const discBrakeLoadout: SoapboxLoadout = {
          ...SOAPBOX_PRESETS[3], // RB19 with disc brakes
        };
        const discMetrics = computeSoapboxMetrics(discBrakeLoadout);

        const state = createInitialSoapboxState(courseId);
        state.phase = 'racing';
        state.sFeet = 200;
        state.speedFtS = 0;
        state.mph = 0;
        state.brakeInput = true;

        for (let tick = 0; tick < 240; tick++) {
          stepSoapboxSimulation(state, discMetrics, dt, 0, null);

          // Must never dip negative
          expect(state.speedFtS).toBeGreaterThanOrEqual(0);
          expect(state.mph).toBeGreaterThanOrEqual(0);
        }

        // Now release the brake
        state.brakeInput = false;
        for (let tick = 0; tick < 120; tick++) {
          stepSoapboxSimulation(state, discMetrics, dt, 0, null);
        }

        // Releasing brake on downhill slope must cause car to accelerate forward
        expect(state.speedFtS).toBeGreaterThan(0);
        expect(state.sFeet).toBeGreaterThan(200);
      });

      it(`[${courseId}] handles aggressive brake toggling and numerical stability across variable time steps`, () => {
        const timeSteps = [1 / 60, 1 / 120, 1 / 240];

        for (const testDt of timeSteps) {
          const state = createInitialSoapboxState(courseId);
          state.phase = 'racing';
          state.sFeet = 150;
          state.speedFtS = 30; // ~20.5 mph
          state.mph = 30 * 0.681818;

          // Toggle brakes rapidly on and off every 10 ticks
          for (let tick = 0; tick < 200; tick++) {
            state.brakeInput = tick % 20 < 10;
            stepSoapboxSimulation(state, metrics, testDt, 0, null);

            // Clean velocity non-negativity under any dt
            expect(state.speedFtS).toBeGreaterThanOrEqual(0);
            expect(state.mph).toBeGreaterThanOrEqual(0);
            expect(Number.isFinite(state.speedFtS)).toBe(true);
            expect(Number.isFinite(state.sFeet)).toBe(true);
            expect(Number.isFinite(state.lateralOffsetFeet)).toBe(true);
          }
        }
      });
    });
  });

  // ============================================================================
  // TASK 4: ADVERSARIAL EDGE CASES & INTEGRITY HARNESS
  // ============================================================================
  describe('Task 4: Adversarial Stress Scenarios & Edge Cases', () => {
    it('verifies lateral boundaries clamp cleanly without velocity sign explosion', () => {
      const state = createInitialSoapboxState('extreme_peak');
      const metrics = computeSoapboxMetrics(SOAPBOX_PRESETS[0]);
      state.phase = 'racing';
      state.sFeet = 300;
      state.speedFtS = 60;
      state.lateralOffsetFeet = 12.8;
      state.lateralVelFtS = 25.0; // Heading outward rapidly toward right barrier

      stepSoapboxSimulation(state, metrics, 1 / 120, 0, null);

      expect(state.lateralOffsetFeet).toBeLessThanOrEqual(13.0);
      expect(Number.isFinite(state.speedFtS)).toBe(true);
      expect(state.speedFtS).toBeGreaterThan(0);
    });

    it('verifies rollover and crash triggers finalize scorecard without undefined NaN metrics', () => {
      const state = createInitialSoapboxState('alpine_panorama');
      const metrics = computeSoapboxMetrics(SOAPBOX_PRESETS[1]);
      state.phase = 'racing';
      state.sFeet = 500;
      state.speedFtS = 45;

      // Force high roll angle to induce rollover crash
      state.rollDeg = 75;
      stepSoapboxSimulation(state, metrics, 1 / 120, 1000, 25.0);

      expect(state.isWrecked).toBe(true);
      expect(state.phase).toBe('finished');
      expect(state.judgeScores).toBeDefined();
      expect(Number.isFinite(state.judgeScores!.totalScore)).toBe(true);
      expect(state.judgeScores!.totalScore).toBeGreaterThanOrEqual(3);
    });
  });
});
