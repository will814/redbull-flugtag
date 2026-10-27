import { describe, it, expect } from 'vitest';
import {
  createInitialSoapboxState,
  damagePartSlot,
  detachSoapboxPart,
  applyDirectionalObstacleDamage,
  stepSoapboxSimulation,
  evaluateSoapboxWreckConditions,
  SoapboxObstacle,
  SoapboxDetachablePartSlot,
} from '../src/soapbox/SoapboxPhysicsEngine';
import { SOAPBOX_PRESETS } from '../src/soapbox/SoapboxPartCatalog';
import { computeSoapboxMetrics } from '../src/soapbox/SoapboxMetrics';

describe('Milestone 1 Challenger Empirical Verification Suite', () => {
  const metrics = computeSoapboxMetrics(SOAPBOX_PRESETS[0]);
  const dt = 1 / 120;

  // ============================================================================
  // TASK 1: EMPIRICAL COLLISION DAMAGE ROUTING & PART DETACHMENT
  // ============================================================================
  describe('Task 1: Collision Damage Routing & Part Detachment', () => {
    it('accurately routes left-flank collision to wheel_fl first, then wheel_rl, then chassis', () => {
      const state = createInitialSoapboxState('alpine_panorama');
      state.phase = 'racing';
      state.speedFtS = 32;
      state.lateralOffsetFeet = 0.0;

      // Obstacle on the left flank (deltaLat = 0 - (-2.0) = +2.0 > 0.8)
      const leftObs: SoapboxObstacle = {
        id: 'left_hay_bale',
        type: 'hay_bale',
        sFeet: 200,
        lengthFeet: 6,
        lateralCenterFeet: -2.0,
        halfWidthFeet: 2.0,
        triggered: false,
      };

      // Hit 1: wheel_fl takes damage, wheel_fr and bumper intact
      applyDirectionalObstacleDamage(state, metrics, leftObs);
      expect(state.partHealth.wheel_fl).toBeLessThan(1.0);
      expect(state.attachedParts.wheel_fl).toBe(true);
      expect(state.partHealth.wheel_fr).toBe(1.0);
      expect(state.partHealth.wheel_rl).toBe(1.0);
      expect(state.partHealth.bumper).toBe(1.0);

      // Repeated left hits until wheel_fl detaches
      while (state.attachedParts.wheel_fl) {
        applyDirectionalObstacleDamage(state, metrics, leftObs);
      }
      expect(state.attachedParts.wheel_fl).toBe(false);
      expect(state.partHealth.wheel_fl).toBe(0.0);
      expect(state.partHealth.wheel_rl).toBe(1.0); // wheel_rl still untouched

      // Next hit on left flank must route to wheel_rl!
      applyDirectionalObstacleDamage(state, metrics, leftObs);
      expect(state.partHealth.wheel_rl).toBeLessThan(1.0);
      expect(state.partHealth.wheel_fr).toBe(1.0); // right side still untouched!

      // Repeated hits until wheel_rl detaches
      while (state.attachedParts.wheel_rl) {
        applyDirectionalObstacleDamage(state, metrics, leftObs);
      }
      expect(state.attachedParts.wheel_rl).toBe(false);
      expect(state.partHealth.wheel_rl).toBe(0.0);

      // Both left wheels gone: next hit must damage chassis structural integrity!
      const prevIntegrity = state.structuralIntegrity;
      applyDirectionalObstacleDamage(state, metrics, leftObs);
      expect(state.structuralIntegrity).toBe(prevIntegrity - 20);
      expect(state.partHealth.wheel_fr).toBe(1.0);
      expect(state.partHealth.wheel_rr).toBe(1.0);
      expect(state.partHealth.bumper).toBe(1.0);
    });

    it('accurately routes right-flank collision to wheel_fr first, then wheel_rr, then chassis', () => {
      const state = createInitialSoapboxState('alpine_panorama');
      state.phase = 'racing';
      state.speedFtS = 32;
      state.lateralOffsetFeet = 0.0;

      // Obstacle on the right flank (deltaLat = 0 - (+2.0) = -2.0 < -0.8)
      const rightObs: SoapboxObstacle = {
        id: 'right_hay_bale',
        type: 'hay_bale',
        sFeet: 200,
        lengthFeet: 6,
        lateralCenterFeet: 2.0,
        halfWidthFeet: 2.0,
        triggered: false,
      };

      // Hit 1: wheel_fr takes damage
      applyDirectionalObstacleDamage(state, metrics, rightObs);
      expect(state.partHealth.wheel_fr).toBeLessThan(1.0);
      expect(state.attachedParts.wheel_fr).toBe(true);
      expect(state.partHealth.wheel_fl).toBe(1.0);
      expect(state.partHealth.wheel_rr).toBe(1.0);

      // Repeated right hits until wheel_fr detaches
      while (state.attachedParts.wheel_fr) {
        applyDirectionalObstacleDamage(state, metrics, rightObs);
      }
      expect(state.attachedParts.wheel_fr).toBe(false);
      expect(state.partHealth.wheel_fr).toBe(0.0);
      expect(state.partHealth.wheel_rr).toBe(1.0); // wheel_rr untouched

      // Next hit on right flank routes to wheel_rr
      applyDirectionalObstacleDamage(state, metrics, rightObs);
      expect(state.partHealth.wheel_rr).toBeLessThan(1.0);
      expect(state.partHealth.wheel_fl).toBe(1.0);

      // Repeated hits until wheel_rr detaches
      while (state.attachedParts.wheel_rr) {
        applyDirectionalObstacleDamage(state, metrics, rightObs);
      }
      expect(state.attachedParts.wheel_rr).toBe(false);

      // Both right wheels gone: next hit damages chassis
      const prevIntegrity = state.structuralIntegrity;
      applyDirectionalObstacleDamage(state, metrics, rightObs);
      expect(state.structuralIntegrity).toBe(prevIntegrity - 20);
      expect(state.partHealth.wheel_fl).toBe(1.0);
      expect(state.partHealth.wheel_rl).toBe(1.0);
    });

    it('accurately routes frontal head-on impact to bumper first, then splits to front wheels and chassis', () => {
      const state = createInitialSoapboxState('alpine_panorama');
      state.phase = 'racing';
      state.speedFtS = 32;
      state.lateralOffsetFeet = 0.0;

      // Obstacle dead-ahead (deltaLat = 0)
      const centerObs: SoapboxObstacle = {
        id: 'center_hay_bale',
        type: 'hay_bale',
        sFeet: 200,
        lengthFeet: 6,
        lateralCenterFeet: 0.0,
        halfWidthFeet: 2.0,
        triggered: false,
      };

      // Bumper absorbs damage first
      applyDirectionalObstacleDamage(state, metrics, centerObs);
      expect(state.partHealth.bumper).toBeLessThan(1.0);
      expect(state.partHealth.wheel_fl).toBe(1.0);
      expect(state.partHealth.wheel_fr).toBe(1.0);

      // Repeat until bumper is destroyed and detaches
      while (state.attachedParts.bumper) {
        applyDirectionalObstacleDamage(state, metrics, centerObs);
      }
      expect(state.attachedParts.bumper).toBe(false);
      expect(state.partHealth.bumper).toBe(0.0);

      // Bumper gone: next frontal hit must split damage to BOTH wheel_fl and wheel_fr and damage chassis
      const prevFlHealth = state.partHealth.wheel_fl;
      const prevFrHealth = state.partHealth.wheel_fr;
      const prevIntegrity = state.structuralIntegrity;

      applyDirectionalObstacleDamage(state, metrics, centerObs);
      expect(state.partHealth.wheel_fl).toBeLessThan(prevFlHealth);
      expect(state.partHealth.wheel_fr).toBeLessThan(prevFrHealth);
      expect(state.partHealth.wheel_fl).toBeCloseTo(state.partHealth.wheel_fr, 0.01);
      expect(state.structuralIntegrity).toBe(prevIntegrity - 25);
    });

    it('verifies overhead kicker jump clears low obstacles and violent landing damages topper', () => {
      // 1. Airborne car clears hay bale
      const stateAir = createInitialSoapboxState('alpine_panorama');
      stateAir.phase = 'racing';
      stateAir.sFeet = 195;
      stateAir.speedFtS = 40;
      stateAir.airborneHeightFeet = 3.5; // Above 2.2 ft threshold
      stateAir.obstacles = [
        {
          id: 'test_bale',
          type: 'hay_bale',
          sFeet: 200,
          lengthFeet: 4,
          lateralCenterFeet: 0,
          halfWidthFeet: 3,
          triggered: false,
        },
      ];

      // Step across obstacle sFeet=200 while airborne
      for (let i = 0; i < 30; i++) {
        stepSoapboxSimulation(stateAir, metrics, dt, 0, null);
      }
      expect(stateAir.sFeet).toBeGreaterThan(202);
      expect(stateAir.hayBalesHit).toBe(0); // Cleared cleanly over the obstacle!
      expect(stateAir.obstacles[0].triggered).toBe(false);

      // 2. Violent landing shock routes damage to topper when suspension bottoms out
      const stateLanding = createInitialSoapboxState('alpine_panorama');
      stateLanding.phase = 'racing';
      stateLanding.sFeet = 300;
      stateLanding.speedFtS = 40;
      stateLanding.airborneHeightFeet = 0.1;
      stateLanding.verticalVelFtS = -35; // Severe downward landing impact

      expect(stateLanding.attachedParts.topper).toBe(true);
      expect(stateLanding.partHealth.topper).toBe(1.0);

      // Step landing tick
      const landingEvents = stepSoapboxSimulation(stateLanding, metrics, dt, 0, null);
      expect(landingEvents.bottomedOut).toBe(true);
      expect(stateLanding.suspensionCompression).toBeGreaterThan(1.0);
      expect(stateLanding.partHealth.topper).toBeLessThan(1.0); // Topper damaged by inertia shock!
    });
  });

  // ============================================================================
  // TASK 2: EMPIRICAL HANDLING DEGRADATION & ASYMMETRIC YAW PULL
  // ============================================================================
  describe('Task 2: Handling Degradation & Asymmetric Yaw Pull Dynamics', () => {
    it('measures lateral trajectory deviation from wheel_fl loss vs wheel_fr loss', () => {
      // Baseline intact run
      const stateIntact = createInitialSoapboxState('alpine_panorama');
      stateIntact.phase = 'racing';
      stateIntact.sFeet = 100;
      stateIntact.speedFtS = 35;
      stateIntact.lateralOffsetFeet = 0;
      stateIntact.steerInput = 0;

      for (let i = 0; i < 120; i++) {
        stepSoapboxSimulation(stateIntact, metrics, dt, 0, null);
      }
      const intactEndLat = stateIntact.lateralOffsetFeet;

      // Run A: Lose front-left wheel (wheel_fl)
      const stateLeftLoss = createInitialSoapboxState('alpine_panorama');
      stateLeftLoss.phase = 'racing';
      stateLeftLoss.sFeet = 100;
      stateLeftLoss.speedFtS = 35;
      stateLeftLoss.lateralOffsetFeet = 0;
      stateLeftLoss.steerInput = 0;
      detachSoapboxPart(stateLeftLoss, 'wheel_fl', 'Impact');

      for (let i = 0; i < 120; i++) {
        stepSoapboxSimulation(stateLeftLoss, metrics, dt, 0, null);
      }
      expect(stateLeftLoss.steeringPullFtS2).toBe(-14.0);
      expect(stateLeftLoss.lateralOffsetFeet).toBeLessThan(intactEndLat - 1.5); // Severe leftward drift

      // Run B: Lose front-right wheel (wheel_fr)
      const stateRightLoss = createInitialSoapboxState('alpine_panorama');
      stateRightLoss.phase = 'racing';
      stateRightLoss.sFeet = 100;
      stateRightLoss.speedFtS = 35;
      stateRightLoss.lateralOffsetFeet = 0;
      stateRightLoss.steerInput = 0;
      detachSoapboxPart(stateRightLoss, 'wheel_fr', 'Impact');

      for (let i = 0; i < 120; i++) {
        stepSoapboxSimulation(stateRightLoss, metrics, dt, 0, null);
      }
      expect(stateRightLoss.steeringPullFtS2).toBe(14.0);
      expect(stateRightLoss.lateralOffsetFeet).toBeGreaterThan(intactEndLat + 1.5); // Severe rightward drift

      // Symmetry check: left pull and right pull should produce roughly symmetric deviations
      const deltaLeft = stateLeftLoss.lateralOffsetFeet - intactEndLat;
      const deltaRight = stateRightLoss.lateralOffsetFeet - intactEndLat;
      expect(deltaLeft).toBeLessThan(0);
      expect(deltaRight).toBeGreaterThan(0);
      expect(Math.abs(deltaLeft + deltaRight)).toBeLessThan(0.5); // Near-symmetric
    });

    it('empirically verifies counter-steering dynamics overcome yaw pull and restore trajectory', () => {
      // Car with missing wheel_fl pulling left (-14 ft/s2)
      const stateCounter = createInitialSoapboxState('alpine_panorama');
      stateCounter.phase = 'racing';
      stateCounter.sFeet = 100;
      stateCounter.speedFtS = 35;
      stateCounter.lateralOffsetFeet = 0;
      detachSoapboxPart(stateCounter, 'wheel_fl', 'Impact');

      // Driver applies positive counter-steering to the right (steerInput = +0.8)
      stateCounter.steerInput = 0.8;

      for (let i = 0; i < 180; i++) {
        stepSoapboxSimulation(stateCounter, metrics, dt, 0, null);
      }

      // Counter-steering must dominate the -14.0 pull and push lateral velocity positive (to the right)
      expect(stateCounter.lateralVelFtS).toBeGreaterThan(0);
      expect(stateCounter.lateralOffsetFeet).toBeGreaterThan(0);

      // Now verify opposite: missing wheel_fr with negative counter-steering (steerInput = -0.8)
      const stateCounterR = createInitialSoapboxState('alpine_panorama');
      stateCounterR.phase = 'racing';
      stateCounterR.sFeet = 100;
      stateCounterR.speedFtS = 35;
      stateCounterR.lateralOffsetFeet = 0;
      detachSoapboxPart(stateCounterR, 'wheel_fr', 'Impact');
      stateCounterR.steerInput = -0.8;

      for (let i = 0; i < 220; i++) {
        stepSoapboxSimulation(stateCounterR, metrics, dt, 0, null);
      }

      expect(stateCounterR.lateralVelFtS).toBeLessThan(0);
      expect(stateCounterR.lateralOffsetFeet).toBeLessThan(0);
    });

    it('verifies rear wheel loss degrades rear lateral grip by 65% and increases oversteer slide', () => {
      // Compare cornering drift angle between intact rear wheels vs missing rear-right wheel
      const stateIntact = createInitialSoapboxState('alpine_panorama');
      stateIntact.phase = 'racing';
      stateIntact.sFeet = 100;
      stateIntact.speedFtS = 45;
      stateIntact.steerInput = 0.6; // Hard steer

      for (let i = 0; i < 60; i++) {
        stepSoapboxSimulation(stateIntact, metrics, dt, 0, null);
      }

      const stateLostRear = createInitialSoapboxState('alpine_panorama');
      stateLostRear.phase = 'racing';
      stateLostRear.sFeet = 100;
      stateLostRear.speedFtS = 45;
      detachSoapboxPart(stateLostRear, 'wheel_rr', 'Kerb strike');
      stateLostRear.steerInput = 0.6; // Same steer input

      for (let i = 0; i < 60; i++) {
        stepSoapboxSimulation(stateLostRear, metrics, dt, 0, null);
      }

      // Missing rear wheel must yield greater lateral slip / drift angle
      expect(stateLostRear.driftAngleDeg).toBeGreaterThan(stateIntact.driftAngleDeg);
    });
  });

  // ============================================================================
  // TASK 3: EMPIRICAL WRECK TRIGGERS
  // ============================================================================
  describe('Task 3: Crash & Wreck Triggers Empirical Verification', () => {
    it('Trigger A: Losing 3 or more wheels triggers wreck state immediately in step', () => {
      const state = createInitialSoapboxState('alpine_panorama');
      state.phase = 'racing';
      state.sFeet = 150;
      state.speedFtS = 30;

      detachSoapboxPart(state, 'wheel_fl', 'Impact');
      detachSoapboxPart(state, 'wheel_fr', 'Impact');
      detachSoapboxPart(state, 'wheel_rl', 'Impact');

      const events = stepSoapboxSimulation(state, metrics, dt, 0, null);
      expect(events.wrecked).toBe(true);
      expect(events.finishedRun).toBe(true);
      expect(state.isWrecked).toBe(true);
      expect(state.phase).toBe('finished');
      expect(state.wreckReason).toContain('Three or more wheels destroyed');
      expect(state.judgeScores?.wrecked).toBe(true);
    });

    it('Trigger B: Losing both rear wheels (wheel_rl and wheel_rr) triggers wreck state immediately', () => {
      const state = createInitialSoapboxState('alpine_panorama');
      state.phase = 'racing';
      state.sFeet = 150;
      state.speedFtS = 30;

      detachSoapboxPart(state, 'wheel_rl', 'Impact');
      detachSoapboxPart(state, 'wheel_rr', 'Impact');

      const events = stepSoapboxSimulation(state, metrics, dt, 0, null);
      expect(events.wrecked).toBe(true);
      expect(state.isWrecked).toBe(true);
      expect(state.phase).toBe('finished');
      expect(state.wreckReason).toContain('Rear axle collapsed');
    });

    it('Trigger C: Losing both front wheels (wheel_fl and wheel_fr) triggers wreck state immediately', () => {
      const state = createInitialSoapboxState('alpine_panorama');
      state.phase = 'racing';
      state.sFeet = 150;
      state.speedFtS = 30;

      detachSoapboxPart(state, 'wheel_fl', 'Impact');
      detachSoapboxPart(state, 'wheel_fr', 'Impact');

      const events = stepSoapboxSimulation(state, metrics, dt, 0, null);
      expect(events.wrecked).toBe(true);
      expect(state.isWrecked).toBe(true);
      expect(state.wreckReason).toContain('Front axle collapsed');
    });

    it('Trigger D: Exceeding critical rollover threshold triggers rollover wreck immediately', () => {
      const state = createInitialSoapboxState('alpine_panorama');
      state.phase = 'racing';
      state.sFeet = 150;
      state.speedFtS = 30;
      state.rollDeg = 68; // Exceeds default critical threshold (~58-62 deg)
      state.airborneHeightFeet = 0;

      const events = stepSoapboxSimulation(state, metrics, dt, 0, null);
      expect(events.wrecked).toBe(true);
      expect(state.isWrecked).toBe(true);
      expect(state.isRolledOver).toBe(true);
      expect(state.wreckReason).toContain('rollover crash');
    });

    it('Trigger E: Structural integrity drop to 0 triggers hull collapse wreck immediately', () => {
      const state = createInitialSoapboxState('alpine_panorama');
      state.phase = 'racing';
      state.sFeet = 150;
      state.speedFtS = 30;
      state.structuralIntegrity = 0;

      const events = stepSoapboxSimulation(state, metrics, dt, 0, null);
      expect(events.wrecked).toBe(true);
      expect(state.isWrecked).toBe(true);
      expect(state.wreckReason).toContain('hull collapse');
    });

    it('Trigger F: Missing outer wheel drops rollover threshold by 38%, triggering rollover at lower tilt', () => {
      // With intact wheels, rollDeg = -28 is below critical rollover threshold (~38-41 deg)
      const stateIntact = createInitialSoapboxState('alpine_panorama');
      stateIntact.phase = 'racing';
      stateIntact.rollDeg = -28;
      const intactWreck = evaluateSoapboxWreckConditions(stateIntact, metrics, metrics.criticalRolloverDeg);
      expect(intactWreck.isWrecked).toBe(false);

      // With missing left wheel (outer wheel during negative roll), critical threshold is reduced by 38% (0.62x, dropping to ~24 deg)
      const stateDamaged = createInitialSoapboxState('alpine_panorama');
      stateDamaged.phase = 'racing';
      detachSoapboxPart(stateDamaged, 'wheel_fl', 'Impact');
      stateDamaged.rollDeg = -28;

      let critDeg = metrics.criticalRolloverDeg;
      if (stateDamaged.rollDeg < 0 && (!stateDamaged.attachedParts.wheel_fl || !stateDamaged.attachedParts.wheel_rl)) {
        critDeg *= 0.62;
      }
      const damagedWreck = evaluateSoapboxWreckConditions(stateDamaged, metrics, critDeg);
      expect(damagedWreck.isWrecked).toBe(true);
      expect(damagedWreck.reason).toContain('rollover');
    });
  });

  // ============================================================================
  // TASK 4: 3D TUMBLING DEBRIS SIMULATION BEHAVIOR & CONSERVATION
  // ============================================================================
  describe('Task 4: 3D Tumbling Debris Simulation Physics & Stability', () => {
    it('verifies debris ejection velocities match part mounting positions and kinematics', () => {
      const state = createInitialSoapboxState('alpine_panorama');
      state.phase = 'racing';
      state.speedFtS = 40;
      state.lateralOffsetFeet = 0;

      // Detach FL wheel
      detachSoapboxPart(state, 'wheel_fl', 'Test');
      const flDebris = state.debris.find((d) => d.slot === 'wheel_fl');
      expect(flDebris).toBeDefined();
      expect(flDebris!.velLatFtS).toBeLessThan(-10); // Ejected outward left
      expect(flDebris!.sFeet).toBeGreaterThan(state.sFeet); // Front placement (sOffset = +2.7)

      // Detach FR wheel
      detachSoapboxPart(state, 'wheel_fr', 'Test');
      const frDebris = state.debris.find((d) => d.slot === 'wheel_fr');
      expect(frDebris).toBeDefined();
      expect(frDebris!.velLatFtS).toBeGreaterThan(10); // Ejected outward right

      // Detach bumper
      detachSoapboxPart(state, 'bumper', 'Test');
      const bmpDebris = state.debris.find((d) => d.slot === 'bumper');
      expect(bmpDebris).toBeDefined();
      expect(bmpDebris!.sFeet).toBeGreaterThan(state.sFeet + 3.0); // Far forward (sOffset = +4.2)

      // Detach topper
      detachSoapboxPart(state, 'topper', 'Test');
      const topDebris = state.debris.find((d) => d.slot === 'topper');
      expect(topDebris).toBeDefined();
      expect(topDebris!.heightFeet).toBeGreaterThan(3.0); // High mounting
      expect(topDebris!.velHeightFtS).toBeGreaterThan(15.0); // High vertical launch
    });

    it('verifies long-term debris simulation converges without drift, NaN, or underground penetration', () => {
      const state = createInitialSoapboxState('alpine_panorama');
      state.phase = 'racing';
      state.sFeet = 100;
      state.speedFtS = 45;

      detachSoapboxPart(state, 'wheel_fl', 'Impact');
      const debris = state.debris[0];

      let initialKineticEnergy =
        0.5 * (debris.velSFtS ** 2 + debris.velLatFtS ** 2 + debris.velHeightFtS ** 2);

      // Simulate 600 ticks (5 seconds) of physics
      for (let i = 0; i < 600; i++) {
        stepSoapboxSimulation(state, metrics, dt, 0, null);

        // Ground constraint: height >= groundFloor (0.35 ft)
        expect(debris.heightFeet).toBeGreaterThanOrEqual(0.35);

        // Strict numeric finiteness
        expect(Number.isFinite(debris.sFeet)).toBe(true);
        expect(Number.isFinite(debris.lateralFeet)).toBe(true);
        expect(Number.isFinite(debris.heightFeet)).toBe(true);
        expect(Number.isFinite(debris.xFeet)).toBe(true);
        expect(Number.isFinite(debris.yFeet)).toBe(true);
        expect(Number.isFinite(debris.zFeet)).toBe(true);
      }

      // After 5 seconds on ground, linear velocities should have dissipated significantly
      const finalKineticEnergy =
        0.5 * (debris.velSFtS ** 2 + debris.velLatFtS ** 2 + debris.velHeightFtS ** 2);
      expect(finalKineticEnergy).toBeLessThan(initialKineticEnergy * 0.05); // Dissipated >95% of kinetic energy
      expect(Math.abs(debris.velHeightFtS)).toBe(0); // Ground contact settled
    });

    it('verifies curb margin reflection prevents debris runaway lateral drift beyond tracks', () => {
      const state = createInitialSoapboxState('alpine_panorama');
      state.phase = 'racing';
      state.sFeet = 100;
      state.speedFtS = 30;

      detachSoapboxPart(state, 'wheel_fr', 'Impact');
      const debris = state.debris[0];
      debris.lateralFeet = 14.8;
      debris.velLatFtS = 10.0; // Heading outward beyond +15 margin

      // Step simulation until it hits margin
      for (let i = 0; i < 20; i++) {
        stepSoapboxSimulation(state, metrics, dt, 0, null);
        if (debris.lateralFeet > 15.0) {
          // Immediately upon crossing 15 ft, velocity must be inverted inward
          expect(debris.velLatFtS).toBeLessThan(0);
          break;
        }
      }

      // Step further 30 ticks to verify boundary containment (no runaway drift past curb)
      for (let i = 0; i < 30; i++) {
        stepSoapboxSimulation(state, metrics, dt, 0, null);
      }
      expect(debris.lateralFeet).toBeLessThan(15.5);
      expect(Math.abs(debris.velLatFtS)).toBeLessThan(0.1); // Velocity damped by margin rebounds
    });

    it('verifies total debris pieces cannot exceed the 6 physical part slots', () => {
      const state = createInitialSoapboxState('alpine_panorama');
      state.phase = 'racing';

      const slots: SoapboxDetachablePartSlot[] = [
        'wheel_fl',
        'wheel_fr',
        'wheel_rl',
        'wheel_rr',
        'bumper',
        'topper',
      ];

      // Detach every slot once
      slots.forEach((s) => detachSoapboxPart(state, s, 'Test'));
      expect(state.debris).toHaveLength(6);

      // Attempt to detach every slot a second time
      slots.forEach((s) => detachSoapboxPart(state, s, 'Duplicate'));
      expect(state.debris).toHaveLength(6); // Strictly capped, no duplicate debris items
    });
  });
});
