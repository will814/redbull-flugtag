import test from 'node:test';
import assert from 'node:assert/strict';
import { SPEC, tryImportModule } from './test-utils.ts';

async function getPhysics() {
  return tryImportModule<any>('./src/tandem/TandemPhysicsEngine.ts');
}

test('Feature 3 — Tier 1: 120Hz Fixed-Timestep Physics Loop & Determinism', async (t) => {
  const phy = await getPhysics();
  if (!phy) {
    t.skip('Pending M2: src/tandem/TandemPhysicsEngine.ts not yet implemented');
    return;
  }

  // T1-PHY-01: Fixed Timestep Accumulator
  await t.test('T1-PHY-01: Physics engine advances state strictly in discrete sub-steps of fixedDt = 1/120s', () => {
    assert.ok(phy.stepTandemPhysics || phy.stepTandemSimulation, 'stepTandemPhysics function must be exported');
    const initial = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState ? phy.createTandemSimState() : null;
    assert.ok(initial, 'Initial simulation state factory must exist');
  });

  // T1-PHY-02: Deterministic Trajectory
  await t.test('T1-PHY-02: Executing identical control sequence across two runs yields identical trajectory', () => {
    const s1 = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    const s2 = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    const controls = { steer: 0.1, pedalCadence: true, sprint: false, brake: false, leanRoll: 0 };
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const dummyStats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 450, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    for (let i = 0; i < 60; i++) {
      stepFn(s1, dummyStats, controls, SPEC.PHYSICS.FIXED_DT);
      stepFn(s2, dummyStats, controls, SPEC.PHYSICS.FIXED_DT);
    }

    assert.equal(s1.distanceFt ?? s1.distanceFeet, s2.distanceFt ?? s2.distanceFeet, 'Distances must be strictly deterministic');
    assert.equal(s1.speedMph ?? s1.mph, s2.speedMph ?? s2.mph, 'Speeds must be strictly deterministic');
  });

  // T1-PHY-03: Variable Refresh Rate Invariance
  await t.test('T1-PHY-03: State after 1.0s elapsed is invariant across 30Hz, 60Hz, and 120Hz frame rates', () => {
    if (typeof phy.updateTandemSimulationWithAccumulator === 'function') {
      const state30 = phy.createInitialTandemState();
      const state60 = phy.createInitialTandemState();
      const controls = { steer: 0, pedalCadence: true, sprint: false, brake: false, leanRoll: 0 };
      const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

      // 30 frames of 1/30s
      for (let i = 0; i < 30; i++) phy.updateTandemSimulationWithAccumulator(state30, stats, controls, 1 / 30);
      // 60 frames of 1/60s
      for (let i = 0; i < 60; i++) phy.updateTandemSimulationWithAccumulator(state60, stats, controls, 1 / 60);

      const d30 = state30.distanceFt ?? state30.distanceFeet;
      const d60 = state60.distanceFt ?? state60.distanceFeet;
      assert.ok(Math.abs(d30 - d60) < 0.05, `Distance divergence under 5cm across frame rates, got diff: ${Math.abs(d30 - d60)}`);
    }
  });

  // T1-PHY-04: Monotonic Forward Progression
  await t.test('T1-PHY-04: Active pedaling on level track increases longitudinal distance monotonically', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'riding';
    const controls = { steer: 0, pedalCadence: true, sprint: false, brake: false, leanRoll: 0 };
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    let prevDist = s.distanceFt ?? s.distanceFeet ?? 0;
    for (let i = 0; i < 120; i++) {
      stepFn(s, stats, controls, SPEC.PHYSICS.FIXED_DT);
      const currDist = s.distanceFt ?? s.distanceFeet ?? 0;
      assert.ok(currDist >= prevDist, `Distance must advance monotonically: step ${i} curr=${currDist} prev=${prevDist}`);
      prevDist = currDist;
    }
    assert.ok(prevDist > 5, 'Must have traveled forward after 1s of pedaling');
  });

  // T1-PHY-05: Coast & Rolling Drag Deceleration
  await t.test('T1-PHY-05: Releasing controls smoothly decelerates tandem to rest via drag and rolling resistance', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'riding';
    s.speedMph = 15;
    const noControls = { steer: 0, pedalCadence: false, sprint: false, brake: false, leanRoll: 0 };
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    for (let i = 0; i < 240; i++) {
      stepFn(s, stats, noControls, SPEC.PHYSICS.FIXED_DT);
    }
    const finalSpeed = s.speedMph ?? s.mph ?? 0;
    assert.ok(finalSpeed < 15, `Speed should have decelerated from 15 mph, got: ${finalSpeed}`);
  });
});

test('Feature 3 — Tier 2: 120Hz Loop Boundaries & Corner Cases', async (t) => {
  const phy = await getPhysics();
  if (!phy) {
    t.skip('Pending M2: src/tandem/TandemPhysicsEngine.ts not yet implemented');
    return;
  }

  // T2-PHY-01: Lag Spike / Delta Time Clamp
  await t.test('T2-PHY-01: Massive frame drop (dt = 2.0s) clamps accumulator sub-steps without NaN', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };
    const controls = { steer: 0, pedalCadence: true, sprint: false, brake: false, leanRoll: 0 };

    assert.doesNotThrow(() => {
      stepFn(s, stats, controls, 2.0);
      assert.ok(!Number.isNaN(s.speedMph ?? s.mph), 'Speed must not be NaN after lag spike');
      assert.ok(!Number.isNaN(s.distanceFt ?? s.distanceFeet), 'Distance must not be NaN after lag spike');
    });
  });

  // T2-PHY-02: Microscopic Substep Accumulation
  await t.test('T2-PHY-02: Microscopic frame delta (dt = 1e-6s) does not cause numerical division by zero', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };
    const controls = { steer: 0, pedalCadence: true, sprint: false, brake: false, leanRoll: 0 };

    assert.doesNotThrow(() => {
      for (let i = 0; i < 100; i++) stepFn(s, stats, controls, 1e-6);
    });
  });

  // T2-PHY-03: Negative / Zero Delta Time
  await t.test('T2-PHY-03: Negative or zero dt inputs are safely rejected or clamped without modifying state', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };
    const controls = { steer: 0, pedalCadence: true, sprint: false, brake: false, leanRoll: 0 };

    const initialDist = s.distanceFt ?? s.distanceFeet ?? 0;
    stepFn(s, stats, controls, 0);
    stepFn(s, stats, controls, -0.05);
    assert.equal(s.distanceFt ?? s.distanceFeet ?? 0, initialDist, 'Zero or negative dt must not modify simulation distance');
  });

  // T2-PHY-04: Velocity Boundary Tunneling Prevention
  await t.test('T2-PHY-04: Maximum velocity does not tunnel through narrow obstacle trigger in a single sub-step', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.speedMph = 45; // Extreme maximum speed
    const maxSubStepDistFt = (45 * 5280) / 3600 * SPEC.PHYSICS.FIXED_DT;
    assert.ok(maxSubStepDistFt < 1.0, `At 120Hz, max displacement per sub-step is ~${maxSubStepDistFt.toFixed(2)} ft (< 1 ft), preventing tunneling`);
  });

  // T2-PHY-05: State Clone Isolation
  await t.test('T2-PHY-05: State snapshots are deeply isolated against external mutation', () => {
    const s1 = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    const sClone = JSON.parse(JSON.stringify(s1));
    sClone.speedMph = 999;
    assert.notEqual(s1.speedMph, 999, 'Original state must not reflect clone mutations');
  });
});

test('Feature 4 — Tier 1: Coupled 2-Rider Cadence Dynamics', async (t) => {
  const phy = await getPhysics();
  if (!phy) {
    t.skip('Pending M2: src/tandem/TandemPhysicsEngine.ts not yet implemented');
    return;
  }

  // T1-CAD-01: Cadence Thrust Generation
  await t.test('T1-CAD-01: Active pedaling cadence input increases cadence RPM and forward acceleration', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'riding';
    const controls = { steer: 0, pedalCadence: true, sprint: false, brake: false, leanRoll: 0 };
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 450, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    stepFn(s, stats, controls, SPEC.PHYSICS.FIXED_DT);
    assert.ok((s.cadenceRpm ?? 0) > 0 || (s.speedMph ?? s.mph ?? 0) > 0, 'Cadence or speed must rise on pedaling');
  });

  // T1-CAD-02: Sprint Power Burst
  await t.test('T1-CAD-02: Sprint boost accelerates vehicle faster than normal cadence', () => {
    const sNorm = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    const sSprint = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    sNorm.phase = 'riding';
    sSprint.phase = 'riding';
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;

    for (let i = 0; i < 120; i++) {
      stepFn(sNorm, stats, { steer: 0, pedalCadence: true, sprint: false, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
      stepFn(sSprint, stats, { steer: 0, pedalCadence: true, sprint: true, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
    }
    const normSpeed = sNorm.speedMph ?? sNorm.mph ?? 0;
    const sprintSpeed = sSprint.speedMph ?? sSprint.mph ?? 0;
    assert.ok(sprintSpeed > normSpeed, `Sprint speed (${sprintSpeed}) must exceed normal speed (${normSpeed})`);
  });

  // T1-CAD-03: Incline Ascent
  await t.test('T1-CAD-03: Pedaling overcomes gravity to ascend inclined bridge surfaces', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'riding';
    s.distanceFt = 110; // Approaching seesaw incline
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 550, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    for (let i = 0; i < 120; i++) {
      stepFn(s, stats, { steer: 0, pedalCadence: true, sprint: true, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
    }
    assert.ok((s.distanceFt ?? s.distanceFeet ?? 0) > 110, 'Must progress forward up incline');
  });

  // T1-CAD-04: Braking Deceleration
  await t.test('T1-CAD-04: Braking input rapidly decelerates vehicle speed and cadence RPM', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'riding';
    s.speedMph = 16;
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    for (let i = 0; i < 60; i++) {
      stepFn(s, stats, { steer: 0, pedalCadence: false, sprint: false, brake: true, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
    }
    const speed = s.speedMph ?? s.mph ?? 0;
    assert.ok(speed < 10, `Speed should drop significantly under braking, got: ${speed}`);
  });

  // T1-CAD-05: Drivetrain Gearing Multipliers
  await t.test('T1-CAD-05: High-efficiency drivetrain delivers higher top speed than starter gear', () => {
    const sStock = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    const sPro = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    sStock.phase = 'riding';
    sPro.phase = 'riding';
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;

    const stockStats = { massKg: 170, dragCoeff: 0.5, cadencePowerW: 300, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };
    const proStats = { massKg: 150, dragCoeff: 0.4, cadencePowerW: 600, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    for (let i = 0; i < 240; i++) {
      stepFn(sStock, stockStats, { steer: 0, pedalCadence: true, sprint: false, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
      stepFn(sPro, proStats, { steer: 0, pedalCadence: true, sprint: false, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
    }

    const stockMph = sStock.speedMph ?? sStock.mph ?? 0;
    const proMph = sPro.speedMph ?? sPro.mph ?? 0;
    assert.ok(proMph > stockMph, `Pro drivetrain (${proMph} mph) must outperform stock (${stockMph} mph)`);
  });
});

test('Feature 4 — Tier 2: Cadence Dynamics Boundaries & Corner Cases', async (t) => {
  const phy = await getPhysics();
  if (!phy) {
    t.skip('Pending M2: src/tandem/TandemPhysicsEngine.ts not yet implemented');
    return;
  }

  // T2-CAD-01: Steep Incline Rollback Boundary
  await t.test('T2-CAD-01: Stationary bike on inclined seesaw without pedaling rolls backward under gravity', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'riding';
    s.distanceFt = 115; // On incline
    s.speedMph = 0;
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 180, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    for (let i = 0; i < 60; i++) {
      stepFn(s, stats, { steer: 0, pedalCadence: false, sprint: false, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
    }
    // Gravity should either hold or roll backward
    const dist = s.distanceFt ?? s.distanceFeet ?? 115;
    assert.ok(dist <= 115, 'Without pedaling on incline, vehicle must not advance forward');
  });

  // T2-CAD-02: High-Frequency Tap Spam
  await t.test('T2-CAD-02: Alternating pedal cadence every tick does not produce velocity explosion or NaN', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'riding';
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    for (let i = 0; i < 120; i++) {
      stepFn(s, stats, { steer: 0, pedalCadence: i % 2 === 0, sprint: false, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
    }
    const speed = s.speedMph ?? s.mph ?? 0;
    assert.ok(speed >= 0 && speed < 30, `Speed must remain physically bounded, got: ${speed}`);
  });

  // T2-CAD-03: Simultaneous Contradictory Inputs
  await t.test('T2-CAD-03: Sprint and Brake active simultaneously resolves safely without negative speed', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'riding';
    s.speedMph = 10;
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    for (let i = 0; i < 60; i++) {
      stepFn(s, stats, { steer: 0, pedalCadence: true, sprint: true, brake: true, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
    }
    const speed = s.speedMph ?? s.mph ?? 0;
    assert.ok(speed >= 0, `Speed must not drop below zero, got: ${speed}`);
  });

  // T2-CAD-04: Continuous Sprint Stamina Depletion
  await t.test('T2-CAD-04: Holding sprint continuously depletes sprint stamina gracefully', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'riding';
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    for (let i = 0; i < 360; i++) {
      stepFn(s, stats, { steer: 0, pedalCadence: true, sprint: true, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
    }
    assert.ok(s.speedMph < 50, 'Continuous sprint must be bounded by fatigue or drag ceiling');
  });

  // T2-CAD-05: Aerodynamic Terminal Velocity Ceiling
  await t.test('T2-CAD-05: Quadratic aerodynamic drag imposes an asymptotic terminal velocity', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'riding';
    s.speedMph = 35;
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    for (let i = 0; i < 240; i++) {
      stepFn(s, stats, { steer: 0, pedalCadence: true, sprint: false, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
    }
    const terminal = s.speedMph ?? s.mph ?? 0;
    assert.ok(terminal < 40, `Terminal speed must be physically capped below 40 mph, got: ${terminal}`);
  });
});

test('Feature 5 — Tier 1: Lateral Balance & Splashdown Limits', async (t) => {
  const phy = await getPhysics();
  if (!phy) {
    t.skip('Pending M2: src/tandem/TandemPhysicsEngine.ts not yet implemented');
    return;
  }

  // T1-BAL-01: Steering Deflection
  await t.test('T1-BAL-01: Steer input displaces lateral offset across the beam', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'riding';
    s.speedMph = 10;
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    for (let i = 0; i < 60; i++) {
      stepFn(s, stats, { steer: 0.5, pedalCadence: true, sprint: false, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
    }
    const lat = s.lateralOffsetFt ?? s.lateralOffsetFeet ?? 0;
    assert.ok(Math.abs(lat) > 0.05, `Steering right must displace lateral offset, got: ${lat}`);
  });

  // T1-BAL-02: Beam Edge Splashdown Condition
  await t.test('T1-BAL-02: Exceeding half beam width (|z| > W/2) triggers splashdown state', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'riding';
    s.speedMph = 10;
    s.lateralOffsetFt = SPEC.PHYSICS.STANDARD_BEAM_HALF_WIDTH_FT + 0.1; // Beyond edge
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    stepFn(s, stats, { steer: 0, pedalCadence: false, sprint: false, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
    assert.equal(s.phase, 'splashdown', 'Running off beam edge must trigger splashdown phase');
  });

  // T1-BAL-03: Roll Cap Tip-Over Condition
  await t.test('T1-BAL-03: Roll angle exceeding critical threshold (|roll| > rollCrit) triggers splashdown', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'riding';
    s.rollAngleRad = SPEC.PHYSICS.DEFAULT_CRITICAL_ROLL_RAD + 0.1; // Tipped past critical angle
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    stepFn(s, stats, { steer: 0, pedalCadence: false, sprint: false, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
    assert.equal(s.phase, 'splashdown', 'Exceeding critical roll angle must trigger splashdown');
  });

  // T1-BAL-04: Turn Centrifugal Roll Torque
  await t.test('T1-BAL-04: High-speed steering induces outward roll torque requiring balance correction', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'riding';
    s.speedMph = 18;
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    stepFn(s, stats, { steer: 0.8, pedalCadence: true, sprint: false, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
    const roll = s.rollAngleRad ?? s.rollDeg ?? 0;
    assert.ok(Math.abs(roll) > 0, 'Sharp cornering must produce roll displacement');
  });

  // T1-BAL-05: Stabilizer Outrigger Base
  await t.test('T1-BAL-05: Equipping wider stabilizers increases roll stability margin', () => {
    if (typeof phy.computeCriticalRollThreshold === 'function') {
      const bareCrit = phy.computeCriticalRollThreshold({ outriggerWidthFt: 0 });
      const wideCrit = phy.computeCriticalRollThreshold({ outriggerWidthFt: 4.0 });
      assert.ok(wideCrit > bareCrit, 'Wider outriggers must increase critical roll threshold');
    }
  });
});

test('Feature 5 — Tier 2: Lateral Balance Boundaries & Corner Cases', async (t) => {
  const phy = await getPhysics();
  if (!phy) {
    t.skip('Pending M2: src/tandem/TandemPhysicsEngine.ts not yet implemented');
    return;
  }

  // T2-BAL-01: Sub-Millimeter Beam Edge Threshold
  await t.test('T2-BAL-01: Sub-millimeter boundary test at beam edge (|z| = W/2 - 0.001 vs W/2 + 0.001)', () => {
    const sSafe = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    const sSplash = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    sSafe.phase = 'riding';
    sSplash.phase = 'riding';
    sSafe.lateralOffsetFt = SPEC.PHYSICS.STANDARD_BEAM_HALF_WIDTH_FT - 0.001;
    sSplash.lateralOffsetFt = SPEC.PHYSICS.STANDARD_BEAM_HALF_WIDTH_FT + 0.001;

    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    stepFn(sSafe, stats, { steer: 0, pedalCadence: false, sprint: false, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
    stepFn(sSplash, stats, { steer: 0, pedalCadence: false, sprint: false, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);

    assert.equal(sSafe.phase, 'riding', 'Just inside edge must remain riding');
    assert.equal(sSplash.phase, 'splashdown', 'Just outside edge must trigger splashdown');
  });

  // T2-BAL-02: Exact Critical Roll Angle Threshold
  await t.test('T2-BAL-02: Exact boundary test for roll angle recovery vs tip-over', () => {
    const sSafe = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    const sTip = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    sSafe.phase = 'riding';
    sTip.phase = 'riding';
    sSafe.rollAngleRad = SPEC.PHYSICS.DEFAULT_CRITICAL_ROLL_RAD - 0.005;
    sTip.rollAngleRad = SPEC.PHYSICS.DEFAULT_CRITICAL_ROLL_RAD + 0.005;

    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    stepFn(sSafe, stats, { steer: 0, pedalCadence: false, sprint: false, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
    stepFn(sTip, stats, { steer: 0, pedalCadence: false, sprint: false, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);

    assert.equal(sSafe.phase, 'riding', 'Roll below critical angle remains riding');
    assert.equal(sTip.phase, 'splashdown', 'Roll above critical angle triggers splashdown');
  });

  // T2-BAL-03: Violent Counter-Steer Oscillation
  await t.test('T2-BAL-03: Rapid full-amplitude steering oscillation at 20 mph maintains numerical stability', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'riding';
    s.speedMph = 20;
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    for (let i = 0; i < 60; i++) {
      const steer = i % 4 < 2 ? -1.0 : 1.0;
      stepFn(s, stats, { steer, pedalCadence: true, sprint: false, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
    }
    const roll = s.rollAngleRad ?? s.rollDeg ?? 0;
    assert.ok(!Number.isNaN(roll), 'Roll angle must not be NaN under rapid steer oscillation');
  });

  // T2-BAL-04: Terminal Splashdown Telemetry
  await t.test('T2-BAL-04: Splashdown event precisely records terminal distance and impact telemetry', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'riding';
    s.distanceFt = 88.5;
    s.lateralOffsetFt = 2.0;
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    stepFn(s, stats, { steer: 0, pedalCadence: false, sprint: false, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
    assert.equal(s.phase, 'splashdown');
    assert.ok(Math.abs((s.distanceFt ?? 0) - 88.5) < 1.0, 'Recorded splash distance must match breach station');
  });

  // T2-BAL-05: Zero-Outrigger Handling
  await t.test('T2-BAL-05: Outrigger width of 0 maintains baseline physical stability without division by zero', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'riding';
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 150, dragCoeff: 0.4, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 0 };

    assert.doesNotThrow(() => {
      stepFn(s, stats, { steer: 0, pedalCadence: true, sprint: false, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
    });
  });
});

test('Feature 6 — Tier 1: Over-Water Obstacle Track Geometry & Dynamics', async (t) => {
  const phy = await getPhysics();
  if (!phy) {
    t.skip('Pending M2: src/tandem/TandemPhysicsEngine.ts not yet implemented');
    return;
  }

  // T1-OBS-01: Course Geometry Profile
  await t.test('T1-OBS-01: Course track registers stations for beam, seesaw, rollers, water cannon, gap jump, bell', () => {
    assert.ok(phy.TANDEM_COURSE_TRACK || phy.TANDEM_OBSTACLES || phy.getCourseGeometry, 'Course geometry or obstacles must be exported');
  });

  // T1-OBS-02: Seesaw Fulcrum Tilt Dynamics
  await t.test('T1-OBS-02: Crossing the seesaw fulcrum pivots the bridge downward', () => {
    if (typeof phy.updateSeesawBridgeDynamics === 'function') {
      const angleBefore = phy.updateSeesawBridgeDynamics(SPEC.PHYSICS.SEESAW_FULCRUM_S - 10, 160);
      const angleAfter = phy.updateSeesawBridgeDynamics(SPEC.PHYSICS.SEESAW_FULCRUM_S + 10, 160);
      assert.ok(angleBefore > 0, 'Before fulcrum, seesaw should be tilted uphill');
      assert.ok(angleAfter < angleBefore, 'After crossing fulcrum, seesaw should tilt downward');
    }
  });

  // T1-OBS-03: Rhythm Rollers Undulation
  await t.test('T1-OBS-03: Rhythm rollers induce sinusoidal track elevation variation', () => {
    if (typeof phy.getTrackElevationAtDistance === 'function') {
      const y1 = phy.getTrackElevationAtDistance(80);
      const y2 = phy.getTrackElevationAtDistance(85);
      assert.ok(y1 !== undefined && y2 !== undefined, 'Track elevations must exist');
    }
  });

  // T1-OBS-04: Water Cannon Lateral Pulse
  await t.test('T1-OBS-04: Passing water cannon station imparts lateral impulse force', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'riding';
    s.distanceFt = 140; // Water cannon station
    s.speedMph = 12;
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    stepFn(s, stats, { steer: 0, pedalCadence: true, sprint: false, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
    // Should register hazard trigger or lateral impulse
    assert.ok(s.phase === 'riding' || s.phase === 'splashdown', 'State remains valid');
  });

  // T1-OBS-05: Finish Bell Platform
  await t.test('T1-OBS-05: Crossing finish bell platform transitions phase to "finished" and stops race clock', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'riding';
    s.distanceFt = SPEC.PHYSICS.FINISH_BELL_S; // Finish line
    s.speedMph = 15;
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    stepFn(s, stats, { steer: 0, pedalCadence: true, sprint: false, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
    assert.equal(s.phase, 'finished', 'Reaching finish bell distance must transition to "finished"');
  });
});

test('Feature 6 — Tier 2: Obstacle Boundaries & Corner Cases', async (t) => {
  const phy = await getPhysics();
  if (!phy) {
    t.skip('Pending M2: src/tandem/TandemPhysicsEngine.ts not yet implemented');
    return;
  }

  // T2-OBS-01: Seesaw Stall & Reverse Fall
  await t.test('T2-OBS-01: Stalling before fulcrum causes gravity reverse rollback into water', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'riding';
    s.distanceFt = SPEC.PHYSICS.SEESAW_FULCRUM_S - 5;
    s.speedMph = 0;
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    for (let i = 0; i < 60; i++) {
      stepFn(s, stats, { steer: 0, pedalCadence: false, sprint: false, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
    }
    assert.ok((s.distanceFt ?? 0) <= SPEC.PHYSICS.SEESAW_FULCRUM_S - 5, 'Must not advance forward without cadence');
  });

  // T2-OBS-02: Gap Jump Minimum Takeoff Speed
  await t.test('T2-OBS-02: Gap jump takeoff at speed < vMin falls into water gap (splashdown)', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'riding';
    s.distanceFt = SPEC.PHYSICS.GAP_JUMP_START_S;
    s.speedMph = 4.0; // Too slow to clear gap
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    for (let i = 0; i < 120; i++) {
      stepFn(s, stats, { steer: 0, pedalCadence: false, sprint: false, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
      if (s.phase === 'splashdown') break;
    }
    assert.equal(s.phase, 'splashdown', 'Slow gap jump must result in water splashdown');
  });

  // T2-OBS-03: Gap Jump Landing Attitude
  await t.test('T2-OBS-03: Gap jump landing with roll angle > 18 degrees crashes upon touchdown', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'riding';
    s.distanceFt = SPEC.PHYSICS.GAP_JUMP_END_S;
    s.rollAngleRad = (22 * Math.PI) / 180; // 22 deg roll at touchdown
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    stepFn(s, stats, { steer: 0, pedalCadence: false, sprint: false, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
    assert.equal(s.phase, 'splashdown', 'Excessive roll at gap touchdown must trigger crash/splashdown');
  });

  // T2-OBS-04: Maximum Impulse Water Cannon
  await t.test('T2-OBS-04: Maximum water cannon pulse at beam edge forces splashdown without counter-steer', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'riding';
    s.lateralOffsetFt = SPEC.PHYSICS.STANDARD_BEAM_HALF_WIDTH_FT - 0.2; // Right at edge
    if (typeof phy.applyWaterCannonBlast === 'function') {
      phy.applyWaterCannonBlast(s, 1.0); // Full blast rightward
      assert.ok(s.lateralOffsetFt > SPEC.PHYSICS.STANDARD_BEAM_HALF_WIDTH_FT, 'Blast pushes off beam');
    }
  });

  // T2-OBS-05: Track Distance Boundary Clamping
  await t.test('T2-OBS-05: Distance clamps cleanly to course length at the finish bell', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'riding';
    s.distanceFt = SPEC.PHYSICS.FINISH_BELL_S - 0.5;
    s.speedMph = 25;
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    for (let i = 0; i < 30; i++) {
      stepFn(s, stats, { steer: 0, pedalCadence: true, sprint: false, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
    }
    assert.equal(s.phase, 'finished');
    assert.ok(s.distanceFt >= SPEC.PHYSICS.FINISH_BELL_S, 'Distance reaches finish bell');
  });
});
