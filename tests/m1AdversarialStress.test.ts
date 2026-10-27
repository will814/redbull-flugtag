import { describe, it, expect } from 'vitest';
import {
  createInitialSoapboxState,
  damagePartSlot,
  detachSoapboxPart,
  applyDirectionalObstacleDamage,
  stepSoapboxSimulation,
  evaluateSoapboxWreckConditions,
  triggerSoapboxWreck,
  SoapboxObstacle,
} from '../src/soapbox/SoapboxPhysicsEngine';
import { SOAPBOX_PRESETS } from '../src/soapbox/SoapboxPartCatalog';
import { computeSoapboxMetrics } from '../src/soapbox/SoapboxMetrics';

describe('Milestone 1 Adversarial Stress & Edge Cases', () => {
  const metrics = computeSoapboxMetrics(SOAPBOX_PRESETS[0]);
  const dt = 1 / 120;

  it('Adversarial 1: Rapid 60Hz steering chatter does not cause numerical explosion in body roll', () => {
    const state = createInitialSoapboxState('alpine_panorama');
    state.phase = 'racing';
    state.speedFtS = 55; // 37.5 MPH
    state.sFeet = 200;

    // Rapidly chatter steer input between -1.0 and +1.0 every 2 ticks (60Hz) for 240 ticks (2 seconds)
    for (let tick = 0; tick < 240; tick++) {
      state.steerInput = tick % 2 === 0 ? 1.0 : -1.0;
      stepSoapboxSimulation(state, metrics, dt, 0, null);

      expect(Number.isFinite(state.rollDeg)).toBe(true);
      expect(Number.isFinite(state.rollVelDegS)).toBe(true);
      expect(Number.isFinite(state.lateralVelFtS)).toBe(true);
      expect(Number.isFinite(state.lateralOffsetFeet)).toBe(true);

      // Roll angle should remain bounded by roll damping & spring
      expect(Math.abs(state.rollDeg)).toBeLessThan(90);
    }
  });

  it('Adversarial 2: Consecutive high-speed impacts progressively demolish parts until catastrophic wreck', () => {
    const state = createInitialSoapboxState('alpine_panorama');
    state.phase = 'racing';
    state.speedFtS = 50;
    state.sFeet = 150;

    const obstacles: SoapboxObstacle[] = [
      { id: 'obs_1', type: 'hay_bale', sFeet: 155, lengthFeet: 6, lateralCenterFeet: 0.0, halfWidthFeet: 3, triggered: false },
      { id: 'obs_2', type: 'hay_bale', sFeet: 170, lengthFeet: 6, lateralCenterFeet: 0.0, halfWidthFeet: 3, triggered: false },
      { id: 'obs_3', type: 'hay_bale', sFeet: 185, lengthFeet: 6, lateralCenterFeet: 0.0, halfWidthFeet: 3, triggered: false },
      { id: 'obs_4', type: 'hay_bale', sFeet: 200, lengthFeet: 6, lateralCenterFeet: 0.0, halfWidthFeet: 3, triggered: false },
      { id: 'obs_5', type: 'hay_bale', sFeet: 215, lengthFeet: 6, lateralCenterFeet: 0.0, halfWidthFeet: 3, triggered: false },
    ];
    state.obstacles = obstacles;

    let wrecksTriggered = 0;

    // Step through the gauntlet of 5 consecutive head-on hay bales
    for (let tick = 0; tick < 300; tick++) {
      const events = stepSoapboxSimulation(state, metrics, dt, 0, null);
      if (events.wrecked) {
        wrecksTriggered += 1;
        break;
      }
    }

    // Vehicle must have wrecked under catastrophic obstacle gauntlet
    expect(wrecksTriggered).toBe(1);
    expect(state.isWrecked).toBe(true);
    expect(state.phase).toBe('finished');
    expect(state.hayBalesHit).toBeGreaterThanOrEqual(1);
  });

  it('Adversarial 3: Damaged vehicle with 2 missing wheels still accelerates downhill under gravity from rest', () => {
    const state = createInitialSoapboxState('alpine_panorama');
    state.phase = 'racing';
    state.sFeet = 50;
    state.speedFtS = 0; // Standstill at start

    // Detach 1 front and 1 rear wheel on opposite sides (+0.056 rolling resistance drag)
    detachSoapboxPart(state, 'wheel_fl', 'Impact');
    detachSoapboxPart(state, 'wheel_rr', 'Impact');

    // Simulate 360 ticks (3 seconds) of downhill rollaway
    for (let tick = 0; tick < 360; tick++) {
      stepSoapboxSimulation(state, metrics, dt, 0, null);
    }

    // Downhill gravity on ~11% grade must overcome increased drag (+0.056) and accelerate car forward
    expect(state.speedFtS).toBeGreaterThan(14); // Accelerates from 0 to ~15 ft/s in 3s
    expect(state.sFeet).toBeGreaterThan(70);
  });

  it('Adversarial 4: Wreck explosion spawns exactly remaining attached parts without duplicate debris', () => {
    const state = createInitialSoapboxState('canyon_plunge');
    state.phase = 'racing';
    state.sFeet = 200;
    state.speedFtS = 40;

    // 1. Detach bumper and wheel_fl during race
    detachSoapboxPart(state, 'bumper', 'Hit obstacle');
    detachSoapboxPart(state, 'wheel_fl', 'Clip wall');
    expect(state.debris).toHaveLength(2);

    // 2. Now catastrophic rollover triggers wreck
    state.rollDeg = 85;
    const events = stepSoapboxSimulation(state, metrics, dt, 0, null);
    expect(events.wrecked).toBe(true);

    // 3. spawnWreckDebris must have detached the remaining 4 parts (wheel_fr, wheel_rl, wheel_rr, topper)
    expect(state.debris).toHaveLength(6);

    const slotCounts: Record<string, number> = {};
    for (const d of state.debris) {
      slotCounts[d.slot] = (slotCounts[d.slot] || 0) + 1;
    }

    expect(slotCounts['bumper']).toBe(1);
    expect(slotCounts['wheel_fl']).toBe(1);
    expect(slotCounts['wheel_fr']).toBe(1);
    expect(slotCounts['wheel_rl']).toBe(1);
    expect(slotCounts['wheel_rr']).toBe(1);
    expect(slotCounts['topper']).toBe(1);
  });

  it('Adversarial 5: Wreck scorecard computes accurate penalties and status across all courses', () => {
    const courses = ['alpine_panorama', 'canyon_plunge', 'urban_downhill', 'extreme_peak'] as const;

    for (const c of courses) {
      const state = createInitialSoapboxState(c);
      state.phase = 'racing';
      state.sFeet = 250;
      state.distanceFeet = 250;
      state.speedFtS = 35;

      // Lose 2 wheels and topper
      detachSoapboxPart(state, 'wheel_fr', 'Rock');
      detachSoapboxPart(state, 'wheel_rl', 'Kerb');
      detachSoapboxPart(state, 'topper', 'Landing');

      // Trigger wreck
      triggerSoapboxWreck(
        state,
        'Catastrophic chassis failure on test',
        metrics,
        500,
        null,
        {
          gateDropped: false,
          pushShoveResult: null,
          hayBaleHit: false,
          waterSlickEntered: false,
          kickerLaunched: false,
          bottomedOut: false,
          speedGateCleared: false,
          driftChirp: false,
          rolledOver: false,
          finishedRun: false,
          partDetached: null,
          wrecked: false,
        }
      );

      expect(state.judgeScores).toBeDefined();
      expect(state.judgeScores!.wrecked).toBe(true);
      // In a full catastrophic wreck, spawnWreckDebris detaches all 4 wheels + topper = 4*1.5 + 2.0 = 8.0 pts
      expect(state.judgeScores!.damagePenalty).toBe(8.0);
      expect(state.judgeScores!.courseId).toBe(c);
      expect(state.judgeScores!.runTitle).toContain('Yard Sale');
    }
  });
});
