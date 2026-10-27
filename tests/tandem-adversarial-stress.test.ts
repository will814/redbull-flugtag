import test from 'node:test';
import assert from 'node:assert/strict';
import { SPEC, tryImportModule } from './test-utils.ts';

async function getPhysics() {
  return tryImportModule<any>('./src/tandem/TandemPhysicsEngine.ts');
}

test('Milestone 2 Adversarial Stress Testing — TandemPhysicsEngine', async (t) => {
  const phy = await getPhysics();
  assert.ok(phy, 'TandemPhysicsEngine must be importable');

  const defaultStats = {
    massKg: 160,
    dragCoeff: 0.45,
    cadencePowerW: 400,
    lateralStability: 1.0,
    rollDamping: 0.8,
    steeringAgility: 1.0,
    outriggerWidthFt: 2.0,
  };

  const neutralControls = {
    steer: 0,
    pedalCadence: false,
    sprint: false,
    brake: false,
    leanRoll: 0,
  };

  const ridingControls = {
    steer: 0,
    pedalCadence: true,
    sprint: false,
    brake: false,
    leanRoll: 0,
  };

  // ==========================================================================
  // VECTOR 1: Extreme dt (Lag Spikes dt=10.0s & Microscopic dt=1e-8s)
  // ==========================================================================
  await t.test('Vector 1.1: Massive lag spike dt=10.0s clamps accumulator and prevents NaN/Infinity', () => {
    const s = phy.createInitialTandemState();
    s.phase = 'riding';
    s.speedMph = 12.0;
    s.distanceFt = 50.0;

    // Single massive lag spike
    const events = phy.stepTandemPhysics(s, defaultStats, ridingControls, 10.0);
    assert.ok(!Number.isNaN(s.speedMph), 'speedMph must not be NaN');
    assert.ok(Number.isFinite(s.speedMph), 'speedMph must be finite');
    assert.ok(!Number.isNaN(s.distanceFt), 'distanceFt must not be NaN');
    assert.ok(Number.isFinite(s.distanceFt), 'distanceFt must be finite');
    assert.ok(!Number.isNaN(s.rollAngleRad), 'rollAngleRad must not be NaN');
    assert.ok(!Number.isNaN(s.lateralOffsetFt), 'lateralOffsetFt must not be NaN');

    // Clamping verification: 10s step should have been clamped to MAX_ACCUMULATOR_LAG_S (0.20s)
    // At ~12-15 mph (~20 fps), 0.2s yields ~4 ft displacement. If not clamped, 10s would yield ~200 ft!
    assert.ok(s.distanceFt < 60.0, `Displacement must reflect lag clamp, got distance ${s.distanceFt}`);

    // Series of 5 massive lag spikes
    for (let i = 0; i < 5; i++) {
      phy.stepTandemPhysics(s, defaultStats, ridingControls, 10.0);
    }
    assert.ok(Number.isFinite(s.speedMph), 'Speed must remain finite after burst lag spikes');
    assert.ok(Number.isFinite(s.distanceFt), 'Distance must remain finite after burst lag spikes');
  });

  await t.test('Vector 1.2: Accumulator loop with dt=10.0s caps sub-steps without stall or runaway', () => {
    const s = phy.createInitialTandemState();
    s.phase = 'riding';
    s.speedMph = 10.0;
    s.distanceFt = 20.0;

    // updateTandemSimulationWithAccumulator with dt=10.0s
    phy.updateTandemSimulationWithAccumulator(s, defaultStats, ridingControls, 10.0);

    assert.ok(Number.isFinite(s.speedMph), 'Accumulator speed must be finite');
    assert.ok(Number.isFinite(s.distanceFt), 'Accumulator distance must be finite');
    // Accumulator clamps dt to 0.20s and executes at most 24 sub-steps (24 * 1/120 = 0.20s)
    // Distance should advance by ~0.20s worth of motion, not 10.0s
    assert.ok(s.distanceFt < 30.0, `Accumulator must cap steps, got distance ${s.distanceFt}`);
  });

  await t.test('Vector 1.3: Microscopic dt=1e-8s does not divide by zero or cause numerical collapse', () => {
    const s = phy.createInitialTandemState();
    s.phase = 'riding';
    s.speedMph = 15.0;
    s.distanceFt = 50.0;

    for (let i = 0; i < 5000; i++) {
      phy.stepTandemPhysics(s, defaultStats, ridingControls, 1e-8);
    }

    assert.ok(!Number.isNaN(s.speedMph), 'Speed must not become NaN on microscopic dt');
    assert.ok(Number.isFinite(s.speedMph), 'Speed must remain finite on microscopic dt');
    assert.ok(!Number.isNaN(s.distanceFt), 'Distance must not become NaN on microscopic dt');
    assert.ok(Number.isFinite(s.distanceFt), 'Distance must remain finite on microscopic dt');
    assert.ok(!Number.isNaN(s.rollAngleRad), 'Roll angle must not become NaN on microscopic dt');
  });

  await t.test('Vector 1.4: Pathological dt values (0, negative, NaN, Infinity) safely handled', () => {
    const s = phy.createInitialTandemState();
    s.phase = 'riding';
    s.distanceFt = 40.0;
    s.speedMph = 10.0;

    const snapshot = JSON.stringify(s);

    phy.stepTandemPhysics(s, defaultStats, ridingControls, 0);
    assert.equal(s.distanceFt, 40.0, 'dt=0 must not mutate state');

    phy.stepTandemPhysics(s, defaultStats, ridingControls, -5.0);
    assert.equal(s.distanceFt, 40.0, 'dt<0 must not mutate state');

    phy.stepTandemPhysics(s, defaultStats, ridingControls, NaN);
    assert.equal(s.distanceFt, 40.0, 'dt=NaN must not mutate state');

    phy.stepTandemPhysics(s, defaultStats, ridingControls, Infinity);
    assert.equal(s.distanceFt, 40.0, 'dt=Infinity must not mutate state');

    phy.stepTandemPhysics(s, defaultStats, ridingControls, -Infinity);
    assert.equal(s.distanceFt, 40.0, 'dt=-Infinity must not mutate state');
  });

  // ==========================================================================
  // VECTOR 2: Frame Rate Invariance (120Hz vs 60Hz vs 30Hz)
  // ==========================================================================
  await t.test('Vector 2.1: 1.0 second elapsed: 120 frames @ 120Hz vs 60 frames @ 60Hz vs 30 frames @ 30Hz', () => {
    const s120 = phy.createInitialTandemState();
    const s60 = phy.createInitialTandemState();
    const s30 = phy.createInitialTandemState();

    s120.phase = 'riding';
    s60.phase = 'riding';
    s30.phase = 'riding';

    // 120 frames at 1/120s
    for (let i = 0; i < 120; i++) {
      phy.updateTandemSimulationWithAccumulator(s120, defaultStats, ridingControls, 1 / 120);
    }

    // 60 frames at 1/60s
    for (let i = 0; i < 60; i++) {
      phy.updateTandemSimulationWithAccumulator(s60, defaultStats, ridingControls, 1 / 60);
    }

    // 30 frames at 1/30s
    for (let i = 0; i < 30; i++) {
      phy.updateTandemSimulationWithAccumulator(s30, defaultStats, ridingControls, 1 / 30);
    }

    const d120 = s120.distanceFt;
    const d60 = s60.distanceFt;
    const d30 = s30.distanceFt;

    const diff120_60 = Math.abs(d120 - d60);
    const diff120_30 = Math.abs(d120 - d30);
    const diff60_30 = Math.abs(d60 - d30);

    // Assert strictly bounded divergence (< 0.05 ft / ~1.5 cm)
    assert.ok(diff120_60 < 0.05, `Divergence 120Hz vs 60Hz must be < 0.05 ft, got: ${diff120_60}`);
    assert.ok(diff120_30 < 0.05, `Divergence 120Hz vs 30Hz must be < 0.05 ft, got: ${diff120_30}`);
    assert.ok(diff60_30 < 0.05, `Divergence 60Hz vs 30Hz must be < 0.05 ft, got: ${diff60_30}`);

    // Speeds must also match closely
    assert.ok(Math.abs(s120.speedMph - s60.speedMph) < 0.1, `Speed divergence 120 vs 60: ${Math.abs(s120.speedMph - s60.speedMph)}`);
    assert.ok(Math.abs(s120.speedMph - s30.speedMph) < 0.1, `Speed divergence 120 vs 30: ${Math.abs(s120.speedMph - s30.speedMph)}`);
  });

  await t.test('Vector 2.2: Multi-second dynamic steering run invariance across frame rates', () => {
    const s120 = phy.createInitialTandemState();
    const s60 = phy.createInitialTandemState();
    s120.phase = 'riding';
    s60.phase = 'riding';

    const dynamicControl = (tSec: number) => ({
      steer: 0.15 * Math.sin(tSec * 4),
      pedalCadence: true,
      sprint: tSec > 1.0,
      brake: false,
      leanRoll: -0.1 * Math.sin(tSec * 4),
    });

    // Run 2.0 seconds
    for (let i = 0; i < 240; i++) {
      phy.updateTandemSimulationWithAccumulator(s120, defaultStats, dynamicControl(i / 120), 1 / 120);
    }
    for (let i = 0; i < 120; i++) {
      phy.updateTandemSimulationWithAccumulator(s60, defaultStats, dynamicControl(i / 60), 1 / 60);
    }

    const distDiff = Math.abs(s120.distanceFt - s60.distanceFt);
    const latDiff = Math.abs(s120.lateralOffsetFt - s60.lateralOffsetFt);
    const rollDiff = Math.abs(s120.rollAngleRad - s60.rollAngleRad);

    assert.ok(distDiff < 0.25, `Dynamic distance diff must be bounded, got ${distDiff}`);
    assert.ok(latDiff < 0.10, `Dynamic lateral diff must be bounded, got ${latDiff}`);
    assert.ok(rollDiff < 0.05, `Dynamic roll diff must be bounded, got ${rollDiff}`);
  });

  // ==========================================================================
  // VECTOR 3: Seesaw Torque & Rollback Dynamics
  // ==========================================================================
  await t.test('Vector 3.1: Stationary unpowered tandem on seesaw incline rolls backward (s <= 325 ft)', () => {
    const s = phy.createInitialTandemState();
    s.phase = 'riding';
    s.distanceFt = 325.0; // On uphill incline before fulcrum (330 ft)
    s.speedMph = 0.0;

    // Step 60 frames (0.5s) with no pedaling or braking
    for (let i = 0; i < 60; i++) {
      phy.stepTandemPhysics(s, defaultStats, neutralControls, SPEC.PHYSICS.FIXED_DT);
    }

    assert.ok(s.distanceFt <= 325.0, `Vehicle on seesaw incline must not advance; got ${s.distanceFt}`);
    assert.ok(s.distanceFt < 325.0, `Vehicle on seesaw incline must roll backward under gravity; got ${s.distanceFt}`);
    assert.ok(s.speedMph < 0, `Speed must be negative (reversing); got ${s.speedMph}`);
  });

  await t.test('Vector 3.2: Sustained seesaw rollback off entry edge triggers splashdown', () => {
    const s = phy.createInitialTandemState();
    s.phase = 'riding';
    s.distanceFt = 311.0; // Close to entry lip (310 ft)
    s.speedMph = 0.0;

    for (let i = 0; i < 120; i++) {
      phy.stepTandemPhysics(s, defaultStats, neutralControls, SPEC.PHYSICS.FIXED_DT);
      if (s.phase === 'splashdown') break;
    }

    assert.equal(s.phase, 'splashdown', 'Rolling backward off seesaw entry edge must splashdown');
    assert.ok(s.distanceFt <= 310.0, `Splashdown position must be at or behind edge, got: ${s.distanceFt}`);
  });

  await t.test('Vector 3.3: Seesaw torque changes sign across fulcrum station (330 ft)', () => {
    const massKg = 160;
    const torqueBefore = phy.calculateSeesawTorque(massKg, -5.0); // 5 ft before fulcrum
    const torqueAfter = phy.calculateSeesawTorque(massKg, 5.0);  // 5 ft after fulcrum

    assert.ok(torqueBefore < 0, 'Torque before fulcrum must be negative (uphill counter-moment)');
    assert.ok(torqueAfter > 0, 'Torque after fulcrum must be positive (downhill tip moment)');
    assert.equal(Math.abs(torqueBefore), Math.abs(torqueAfter), 'Symmetric distances produce equal magnitude torque');

    // Angle verification
    const tiltBefore = phy.updateSeesawBridgeDynamics(325, massKg);
    const tiltAfter = phy.updateSeesawBridgeDynamics(335, massKg);
    assert.ok(tiltBefore > 0, 'Bridge angle before fulcrum is uphill (> 0)');
    assert.ok(tiltAfter < 0, 'Bridge angle after fulcrum is downhill (< 0)');
  });

  // ==========================================================================
  // VECTOR 4: Gap Jump Boundary Dynamics & Landing Attitude
  // ==========================================================================
  await t.test('Vector 4.1: Slow speed (v = 4 mph) at gap takeoff crashes into water (splashdown)', () => {
    const s = phy.createInitialTandemState();
    s.phase = 'riding';
    s.distanceFt = SPEC.PHYSICS.GAP_JUMP_START_S; // 160 ft
    s.speedMph = 4.0; // Much too slow (threshold is 12-14 mph)

    for (let i = 0; i < 120; i++) {
      phy.stepTandemPhysics(s, defaultStats, neutralControls, SPEC.PHYSICS.FIXED_DT);
      if (s.phase === 'splashdown') break;
    }

    assert.equal(s.phase, 'splashdown', 'Slow gap takeoff must crash into water');
    assert.ok(s.distanceFt < SPEC.PHYSICS.GAP_JUMP_END_S, 'Crash occurs before reaching landing platform');
  });

  await t.test('Vector 4.2: Fast speed (v = 20 mph) with level roll clears the gap safely', () => {
    const s = phy.createInitialTandemState();
    s.phase = 'riding';
    s.distanceFt = SPEC.PHYSICS.GAP_JUMP_START_S; // 160 ft
    s.speedMph = 20.0;
    s.rollAngleRad = 0;

    let gapJumpedFired = false;
    for (let i = 0; i < 150; i++) {
      const events = phy.stepTandemPhysics(s, defaultStats, neutralControls, SPEC.PHYSICS.FIXED_DT);
      if (events.gapJumped) gapJumpedFired = true;
      if (s.phase === 'splashdown' || s.distanceFt >= SPEC.PHYSICS.GAP_JUMP_END_S + 2) break;
    }

    assert.equal(s.phase, 'riding', 'Fast takeoff with level roll must remain riding');
    assert.ok(s.distanceFt >= SPEC.PHYSICS.GAP_JUMP_END_S, 'Vehicle must reach or exceed landing platform (185 ft)');
    assert.ok(gapJumpedFired, 'events.gapJumped must have fired upon touchdown');
  });

  await t.test('Vector 4.3: Gap landing attitude boundary: roll > 18 degrees crashes to splashdown', () => {
    // Exact threshold is 18 degrees: (18 * Math.PI) / 180 ≈ 0.314159 rad

    // Case A: 19 degrees (> 18 deg)
    const sCrash = phy.createInitialTandemState();
    sCrash.phase = 'riding';
    sCrash.distanceFt = SPEC.PHYSICS.GAP_JUMP_END_S; // Exactly at touchdown platform
    sCrash.rollAngleRad = (19 * Math.PI) / 180; // 19 deg
    sCrash.speedMph = 18.0;

    phy.stepTandemPhysics(sCrash, defaultStats, neutralControls, SPEC.PHYSICS.FIXED_DT);
    assert.equal(sCrash.phase, 'splashdown', 'Landing with roll > 18 deg must splashdown');

    // Case B: 15 degrees (< 18 deg)
    const sSafe = phy.createInitialTandemState();
    sSafe.phase = 'riding';
    sSafe.distanceFt = SPEC.PHYSICS.GAP_JUMP_END_S;
    sSafe.rollAngleRad = (15 * Math.PI) / 180; // 15 deg
    sSafe.speedMph = 18.0;

    phy.stepTandemPhysics(sSafe, defaultStats, neutralControls, SPEC.PHYSICS.FIXED_DT);
    assert.equal(sSafe.phase, 'riding', 'Landing with roll < 18 deg must stay riding');
  });

  await t.test('Vector 4.4: Sub-degree landing attitude boundary (17.9 deg vs 18.1 deg)', () => {
    const rad17_9 = (17.9 * Math.PI) / 180;
    const rad18_1 = (18.1 * Math.PI) / 180;

    const sSafe = phy.createInitialTandemState();
    sSafe.phase = 'riding';
    sSafe.distanceFt = SPEC.PHYSICS.GAP_JUMP_END_S;
    sSafe.rollAngleRad = rad17_9;
    sSafe.speedMph = 18.0;
    phy.stepTandemPhysics(sSafe, defaultStats, neutralControls, SPEC.PHYSICS.FIXED_DT);
    assert.equal(sSafe.phase, 'riding', '17.9 deg landing must survive');

    const sCrash = phy.createInitialTandemState();
    sCrash.phase = 'riding';
    sCrash.distanceFt = SPEC.PHYSICS.GAP_JUMP_END_S;
    sCrash.rollAngleRad = rad18_1;
    sCrash.speedMph = 18.0;
    phy.stepTandemPhysics(sCrash, defaultStats, neutralControls, SPEC.PHYSICS.FIXED_DT);
    assert.equal(sCrash.phase, 'splashdown', '18.1 deg landing must crash');
  });

  // ==========================================================================
  // VECTOR 5: Water Cannon Lateral Impulse
  // ==========================================================================
  await t.test('Vector 5.1: Water cannon lateral blast pushes rider off beam if riding near edge', () => {
    const s = phy.createInitialTandemState();
    s.phase = 'riding';
    s.distanceFt = 140.0;
    s.speedMph = 12.0;
    // Standard beam half width is 1.5 ft. Position tandem at 1.35 ft (near right edge)
    s.lateralOffsetFt = 1.35;

    // Apply water cannon blast (intensity = 1.0)
    phy.applyWaterCannonBlast(s, 1.0, defaultStats);

    assert.ok(s.lateralOffsetFt > SPEC.PHYSICS.STANDARD_BEAM_HALF_WIDTH_FT, `Blast must push lateral offset past 1.5 ft; got ${s.lateralOffsetFt}`);

    // On next simulation step, boundary check triggers splashdown
    phy.stepTandemPhysics(s, defaultStats, neutralControls, SPEC.PHYSICS.FIXED_DT);
    assert.equal(s.phase, 'splashdown', 'Rider pushed off beam must trigger splashdown');
    assert.ok(s.isOffBeam, 'isOffBeam flag must be set to true');
  });

  await t.test('Vector 5.2: Water cannon blast on centered rider is survivable', () => {
    const s = phy.createInitialTandemState();
    s.phase = 'riding';
    s.distanceFt = 140.0;
    s.speedMph = 12.0;
    s.lateralOffsetFt = 0.0; // Centered
    s.rollAngleRad = 0.0;

    phy.applyWaterCannonBlast(s, 1.0, defaultStats);

    assert.ok(Math.abs(s.lateralOffsetFt) < SPEC.PHYSICS.STANDARD_BEAM_HALF_WIDTH_FT, 'Centered rider deflected but still on beam');
    assert.ok(Math.abs(s.rollAngleRad) < SPEC.PHYSICS.DEFAULT_CRITICAL_ROLL_RAD, 'Roll remains below critical threshold');

    phy.stepTandemPhysics(s, defaultStats, neutralControls, SPEC.PHYSICS.FIXED_DT);
    assert.equal(s.phase, 'riding', 'Centered rider must survive blast');
  });

  await t.test('Vector 5.3: Wide stabilizer outriggers reduce roll impulse from water cannon', () => {
    const sNarrow = phy.createInitialTandemState();
    const sWide = phy.createInitialTandemState();

    const narrowStats = { ...defaultStats, outriggerWidthFt: 0.5 };
    const wideStats = { ...defaultStats, outriggerWidthFt: 4.5 };

    phy.applyWaterCannonBlast(sNarrow, 1.0, narrowStats);
    phy.applyWaterCannonBlast(sWide, 1.0, wideStats);

    assert.ok(sWide.rollAngleRad < sNarrow.rollAngleRad, `Wide outriggers (${sWide.rollAngleRad} rad) must damp roll impulse more than narrow (${sNarrow.rollAngleRad} rad)`);
  });

  // ==========================================================================
  // VECTOR 6: Full Course End-to-End Trajectory & Obstacle Sequence
  // ==========================================================================
  await t.test('Vector 6.1: Full obstacle run successfully clears beam, rollers, seesaw, jump, and finish bell', () => {
    const s = phy.createInitialTandemState();
    phy.triggerDockSyncLaunch(s, 0.9); // Strong launch

    const proStats = {
      massKg: 155,
      dragCoeff: 0.42,
      cadencePowerW: 550,
      lateralStability: 50,
      rollDamping: 60,
      steeringAgility: 50,
      outriggerWidthFt: 2.5,
    };

    let seesawEncountered = false;
    let gapJumpEncountered = false;
    let hazardEncountered = false;

    // Simulate up to 40 seconds at 120Hz (4800 steps) across 600 FT course
    for (let step = 0; step < 4800; step++) {
      if (s.phase === 'finished' || s.phase === 'splashdown') break;

      // Active pedaling, sprint on seesaw and jump approaches
      const sprint = (s.distanceFt > 305 && s.distanceFt < 345) || (s.distanceFt > 495 && s.distanceFt < 525);
      const controls = {
        steer: -s.lateralOffsetFt * 0.15, // Active centering steering
        pedalCadence: true,
        sprint,
        brake: false,
        leanRoll: -s.rollAngleRad * 0.3, // Active balance correction
      };

      const events = phy.stepTandemPhysics(s, proStats, controls, SPEC.PHYSICS.FIXED_DT);

      if (events.hazardHit) hazardEncountered = true;
      if (events.gapJumped) gapJumpEncountered = true;
      if (s.distanceFt >= 310 && s.distanceFt <= 350) seesawEncountered = true;
    }

    assert.equal(s.phase, 'finished', `Expected finish but ended with phase ${s.phase} at dist ${s.distanceFt}`);
    assert.ok(s.hasFinished, 'hasFinished flag must be true');
    assert.ok(s.distanceFt >= SPEC.PHYSICS.FINISH_BELL_S, `Must reach finish distance 600 ft, got ${s.distanceFt}`);
    assert.ok(seesawEncountered, 'Must have traversed seesaw sector');
    assert.ok(gapJumpEncountered, 'Must have jumped and cleared the gap');
    assert.ok(hazardEncountered, 'Must have crossed water cannon station');
  });
});

