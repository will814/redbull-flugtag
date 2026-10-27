import { describe, it, expect } from 'vitest';
import {
  createInitialSoapboxState,
  detachSoapboxPart,
  stepSoapboxSimulation,
  evaluateSoapboxWreckConditions,
} from '../src/soapbox/SoapboxPhysicsEngine';
import { SOAPBOX_PRESETS } from '../src/soapbox/SoapboxPartCatalog';
import { computeSoapboxMetrics } from '../src/soapbox/SoapboxMetrics';

describe('Soapbox Dynamic Handling Degradation & 5 Crash Triggers', () => {
  const metrics = computeSoapboxMetrics(SOAPBOX_PRESETS[0]);
  const dt = 1 / 120;

  describe('Asymmetric Yaw Pull & Handling Penalties', () => {
    it('produces asymmetric yaw pull to the left (-14 ft/s2) when front-left wheel is lost', () => {
      const state = createInitialSoapboxState('alpine_panorama');
      state.phase = 'racing';
      state.sFeet = 100;
      state.speedFtS = 30;

      detachSoapboxPart(state, 'wheel_fl', 'Obstacle Clip');
      stepSoapboxSimulation(state, metrics, dt, 0, null);

      expect(state.steeringPullFtS2).toBe(-14.0);
      expect(state.pullYawRate).toBeCloseTo(-0.7, 0.05); // Negative indicates pull to left
    });

    it('produces asymmetric yaw pull to the right (+14 ft/s2) when front-right wheel is lost', () => {
      const state = createInitialSoapboxState('alpine_panorama');
      state.phase = 'racing';
      state.sFeet = 100;
      state.speedFtS = 30;

      detachSoapboxPart(state, 'wheel_fr', 'Obstacle Clip');
      stepSoapboxSimulation(state, metrics, dt, 0, null);

      expect(state.steeringPullFtS2).toBe(14.0);
      expect(state.pullYawRate).toBeCloseTo(0.7, 0.05); // Positive indicates pull to right
    });

    it('increases rolling resistance penalty by +0.028 per lost wheel and reduces coasting speed', () => {
      // Benchmark: 4 attached wheels
      const stateIntact = createInitialSoapboxState('alpine_panorama');
      stateIntact.phase = 'racing';
      stateIntact.sFeet = 200;
      stateIntact.speedFtS = 40;
      for (let i = 0; i < 60; i++) {
        stepSoapboxSimulation(stateIntact, metrics, dt, 0, null);
      }

      // Damaged: 2 wheels lost -> +0.056 drag
      const stateDamaged = createInitialSoapboxState('alpine_panorama');
      stateDamaged.phase = 'racing';
      stateDamaged.sFeet = 200;
      stateDamaged.speedFtS = 40;
      detachSoapboxPart(stateDamaged, 'wheel_rl', 'Hit Cobbles');
      detachSoapboxPart(stateDamaged, 'wheel_fl', 'Hit Hay Bale');

      for (let i = 0; i < 60; i++) {
        stepSoapboxSimulation(stateDamaged, metrics, dt, 0, null);
      }

      // Lost wheels must suffer greater rolling drag and coast slower
      expect(stateDamaged.speedFtS).toBeLessThan(stateIntact.speedFtS);
    });
  });

  describe('5 Authentic Crash / Wreck Triggers', () => {
    it('Trigger 1: Triggers wreck when both front wheels are lost', () => {
      const state = createInitialSoapboxState('alpine_panorama');
      state.phase = 'racing';
      detachSoapboxPart(state, 'wheel_fl', 'Left Curb');
      detachSoapboxPart(state, 'wheel_fr', 'Right Curb');

      const wreck = evaluateSoapboxWreckConditions(state, metrics, 60);
      expect(wreck.isWrecked).toBe(true);
      expect(wreck.reason).toContain('front wheels');
    });

    it('Trigger 2: Triggers wreck when both rear wheels are lost', () => {
      const state = createInitialSoapboxState('alpine_panorama');
      state.phase = 'racing';
      detachSoapboxPart(state, 'wheel_rl', 'Left Rock');
      detachSoapboxPart(state, 'wheel_rr', 'Right Rock');

      const wreck = evaluateSoapboxWreckConditions(state, metrics, 60);
      expect(wreck.isWrecked).toBe(true);
      expect(wreck.reason).toContain('rear wheels');
    });

    it('Trigger 3: Triggers wreck when 3 or more wheels are lost', () => {
      const state = createInitialSoapboxState('alpine_panorama');
      state.phase = 'racing';
      detachSoapboxPart(state, 'wheel_fl', 'Impact 1');
      detachSoapboxPart(state, 'wheel_rl', 'Impact 2');
      detachSoapboxPart(state, 'wheel_rr', 'Impact 3');

      const wreck = evaluateSoapboxWreckConditions(state, metrics, 60);
      expect(wreck.isWrecked).toBe(true);
      expect(wreck.reason).toContain('Three or more wheels');
    });

    it('Trigger 4: Triggers rollover wreck when body roll exceeds critical tip threshold', () => {
      const state = createInitialSoapboxState('alpine_panorama');
      state.phase = 'racing';
      state.rollDeg = 75; // Exceeds critical tip angle (~58-65 deg)

      const wreck = evaluateSoapboxWreckConditions(state, metrics, 60);
      expect(wreck.isWrecked).toBe(true);
      expect(wreck.reason).toContain('rollover');
    });

    it('Trigger 5: Triggers structural wreck when hull integrity collapses to 0', () => {
      const state = createInitialSoapboxState('alpine_panorama');
      state.phase = 'racing';
      state.structuralIntegrity = 0;

      const wreck = evaluateSoapboxWreckConditions(state, metrics, 60);
      expect(wreck.isWrecked).toBe(true);
      expect(wreck.reason).toContain('hull collapse');
    });
  });
});
