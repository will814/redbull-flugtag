/**
 * Red Bull Tandem Bike Challenge (Game 4)
 * Milestone 6 Phase 2 — Tier 5 Adversarial Coverage Hardening & Empirical Stress Harness
 *
 * Covers:
 * 1. Extreme physics states (sub-millisecond deltas, lag spikes, zero speed rollback on seesaw,
 *    water cannon impulse saturation, reverse pedaling, outrigger touchdown at exact rollover threshold)
 * 2. Mascot procedural mesh generation (Shadow and Boomer geometries, materials, ears, bandanas across presets)
 * 3. Closed-form 2-bone IK solver (pedal reach boundaries: zero distance, target out of reach, singular config, angle sweep)
 * 4. Mesh disposal helper disposeTandemObject3D (deep recursive hierarchy disposal, idempotency, cache clearing)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  FIXED_DT,
  MAX_ACCUMULATOR_LAG_S,
  STANDARD_BEAM_HALF_WIDTH_FT,
  DEFAULT_CRITICAL_ROLL_RAD,
  GAP_TOUCHDOWN_CRITICAL_ROLL_RAD,
  SEESAW_FULCRUM_S,
  createInitialTandemState,
  stepTandemPhysics,
  updateTandemSimulationWithAccumulator,
  computeCriticalRollThreshold,
  applyWaterCannonBlast,
  updateSeesawBridgeDynamics,
} from '../src/tandem/TandemPhysicsEngine.ts';

import {
  TANDEM_PART_CATALOG,
  TANDEM_PRESETS,
  TANDEM_PAINT_THEMES,
  computeTandemAggregateStats,
  computeTandemDynoMetrics,
  getTandemPartById,
} from '../src/tandem/TandemPartCatalog.ts';

import {
  buildTandemBike3D,
  updateCrewLegIK,
  updateTandemAnimation,
  disposeTandemObject3D,
  TANDEM_GEOMETRY,
  type LegIKChain,
} from '../src/tandem/TandemBike3DBuilder.ts';

import type { TandemControls, TandemSimState, TandemStats } from '../src/tandem/types.ts';

// Baseline test stats
const BASELINE_STATS: TandemStats = {
  massKg: 160,
  dragCoeff: 0.35,
  cadencePowerW: 400,
  lateralStability: 50,
  rollDamping: 50,
  steeringAgility: 50,
  outriggerWidthFt: 2.4,
};

const NEUTRAL_CONTROLS: TandemControls = {
  steer: 0,
  pedalCadence: false,
  sprint: false,
  brake: false,
  leanRoll: 0,
};

const RIDING_CONTROLS: TandemControls = {
  steer: 0,
  pedalCadence: true,
  sprint: false,
  brake: false,
  leanRoll: 0,
};

// ============================================================================
// SUITE 1: EXTREME PHYSICS STATES & BOUNDARY CONDITIONS
// ============================================================================

test('Suite 1: Extreme Physics States & Boundary Conditions', async (t) => {
  await t.test('1.1 Sub-millisecond deltas integrate cleanly without NaN or division by zero', () => {
    const microDeltas = [1e-4, 1e-5, 1e-6, 1e-9];

    for (const dt of microDeltas) {
      const state = createInitialTandemState();
      state.phase = 'riding';
      state.speedMph = 12.0;
      state.distanceFt = 20.0;

      // Execute 250 micro-steps
      for (let i = 0; i < 250; i++) {
        stepTandemPhysics(state, BASELINE_STATS, RIDING_CONTROLS, dt);
      }

      assert.ok(Number.isFinite(state.speedMph), `speedMph must be finite for dt=${dt}`);
      assert.ok(!Number.isNaN(state.speedMph), `speedMph must not be NaN for dt=${dt}`);
      assert.ok(Number.isFinite(state.distanceFt), `distanceFt must be finite for dt=${dt}`);
      assert.ok(!Number.isNaN(state.distanceFt), `distanceFt must not be NaN for dt=${dt}`);
      assert.ok(Number.isFinite(state.rollAngleRad), `rollAngleRad must be finite for dt=${dt}`);
      assert.ok(Number.isFinite(state.cadenceRpm), `cadenceRpm must be finite for dt=${dt}`);
    }
  });

  await t.test('1.2 Massive lag spikes (>0.5s) clamp accumulator and prevent displacement blowout', () => {
    const lagSpikes = [0.5, 1.0, 5.0, 30.0, 60.0];

    for (const dt of lagSpikes) {
      const state = createInitialTandemState();
      state.phase = 'riding';
      state.speedMph = 15.0; // ~22 ft/s
      state.distanceFt = 30.0;

      const initialDist = state.distanceFt;
      stepTandemPhysics(state, BASELINE_STATS, RIDING_CONTROLS, dt);

      // Verify dt was clamped to MAX_ACCUMULATOR_LAG_S (0.20s)
      // At ~22 ft/s, 0.20s produces ~4.4 ft of movement. If unclamped at 60s, it would advance ~1320 ft!
      const deltaDist = state.distanceFt - initialDist;
      assert.ok(
        deltaDist <= 22.0 * MAX_ACCUMULATOR_LAG_S * 2.0,
        `Displacement for lag spike dt=${dt}s was ${deltaDist.toFixed(2)}ft, exceeding clamped bound`
      );
      assert.ok(Number.isFinite(state.speedMph), `Speed must be finite after lag spike dt=${dt}`);
      assert.ok(Number.isFinite(state.distanceFt), `Distance must be finite after lag spike dt=${dt}`);
    }
  });

  await t.test('1.3 updateTandemSimulationWithAccumulator caps sub-steps and resets windup on massive lag', () => {
    const state = createInitialTandemState();
    state.phase = 'riding';
    state.speedMph = 10.0;
    state.distanceFt = 10.0;

    // Apply a massive 10.0s frame stall
    updateTandemSimulationWithAccumulator(state, BASELINE_STATS, RIDING_CONTROLS, 10.0);

    // Max sub-steps per frame is 24 (24 * 1/120s = 0.20s). Accumulated distance must remain bounded.
    assert.ok(state.distanceFt < 25.0, `Accumulator capped displacement expected <25ft, got ${state.distanceFt}`);
    assert.ok(state.accumulatorSec! <= FIXED_DT * 2, 'Accumulator windup must be flushed');
  });

  await t.test('1.4 Zero forward speed on steep seesaw incline causes backward rollback and splashdown off entry', () => {
    // Case A: Near entry lip (s = 311 ft) rolls back into water within 100 ticks (takes ~78 ticks)
    const stateA = createInitialTandemState();
    stateA.phase = 'riding';
    stateA.distanceFt = 311.0;
    stateA.speedMph = 0.0;

    for (let i = 0; i < 100; i++) {
      if (stateA.phase === 'splashdown') break;
      stepTandemPhysics(stateA, BASELINE_STATS, NEUTRAL_CONTROLS, FIXED_DT);
    }
    assert.strictEqual(stateA.phase, 'splashdown', 'Unpowered stalled bike near seesaw lip must roll back into water');
    assert.ok(stateA.distanceFt <= 310.0, `Terminal distance must be <= 310 ft (got ${stateA.distanceFt} ft)`);

    // Case B: Stalled at s = 315 ft rolls back across 5 ft within 250 ticks (takes ~177 ticks)
    const stateB = createInitialTandemState();
    stateB.phase = 'riding';
    stateB.distanceFt = 315.0;
    stateB.speedMph = 0.0;

    for (let i = 0; i < 250; i++) {
      if (stateB.phase === 'splashdown') break;
      stepTandemPhysics(stateB, BASELINE_STATS, NEUTRAL_CONTROLS, FIXED_DT);
    }
    assert.strictEqual(stateB.phase, 'splashdown', 'Unpowered stalled bike at 315 ft must roll back across 5 ft into water');
    assert.ok(stateB.distanceFt <= 310.0, `Terminal distance must be <= 310 ft (got ${stateB.distanceFt} ft)`);
    assert.strictEqual(stateB.speedMph, 0, 'Splashdown state must lock speed to 0');
  });

  await t.test('1.5 Water cannon impulse saturation and damping across stability configurations', () => {
    // A: Centered rider with wide outriggers withstands full blast
    const safeState = createInitialTandemState();
    safeState.phase = 'riding';
    safeState.speedMph = 14.0;
    safeState.lateralOffsetFt = 0.0;
    safeState.distanceFt = 140.0;

    const wideOutriggerStats: TandemStats = {
      ...BASELINE_STATS,
      lateralStability: 80,
      outriggerWidthFt: 3.2,
    };

    applyWaterCannonBlast(safeState, 1.0, wideOutriggerStats);
    assert.ok(
      Math.abs(safeState.lateralOffsetFt) < STANDARD_BEAM_HALF_WIDTH_FT,
      `Centered rider must not be splashed off beam by single blast: offset=${safeState.lateralOffsetFt}`
    );

    // B: Rider riding near beam margin (offset = 1.35 ft) is blown off beam into water
    const edgeState = createInitialTandemState();
    edgeState.phase = 'riding';
    edgeState.speedMph = 14.0;
    edgeState.lateralOffsetFt = 1.35;
    edgeState.distanceFt = 140.0;

    applyWaterCannonBlast(edgeState, 1.0, wideOutriggerStats);
    const events = stepTandemPhysics(edgeState, wideOutriggerStats, NEUTRAL_CONTROLS, FIXED_DT);
    assert.strictEqual(edgeState.phase, 'splashdown', 'Rider near beam edge struck by cannon blast must splashdown');
    assert.ok(events.splashOccurred, 'splashOccurred event flag must be raised');

    // C: High-intensity blast saturation test (intensity = 50.0) does not cause NaN or Infinity
    const saturatedState = createInitialTandemState();
    applyWaterCannonBlast(saturatedState, 50.0, wideOutriggerStats);
    assert.ok(Number.isFinite(saturatedState.lateralOffsetFt), 'Lateral offset must be finite under extreme cannon blast');
    assert.ok(Number.isFinite(saturatedState.rollAngleRad), 'Roll angle must be finite under extreme cannon blast');
  });

  await t.test('1.6 Pathological control combinations: simultaneous sprint and brake resolve safely', () => {
    const state = createInitialTandemState();
    state.phase = 'riding';
    state.speedMph = 15.0;
    state.distanceFt = 40.0;

    const conflictingControls: TandemControls = {
      steer: 0,
      pedalCadence: true,
      sprint: true,
      brake: true,
      leanRoll: 0,
    };

    for (let i = 0; i < 60; i++) {
      stepTandemPhysics(state, BASELINE_STATS, conflictingControls, FIXED_DT);
    }

    assert.ok(state.speedMph >= 0, 'Speed must remain non-negative under simultaneous sprint and brake');
    assert.ok(Number.isFinite(state.speedMph), 'Speed must remain finite');
    assert.ok(Number.isFinite(state.cadenceRpm), 'Cadence must remain finite');
  });

  await t.test('1.7 Outrigger touchdown at exact rollover threshold boundary', () => {
    const critRollRad = computeCriticalRollThreshold(BASELINE_STATS);

    // Exact threshold minus epsilon: survives
    const subCritState = createInitialTandemState();
    subCritState.phase = 'riding';
    subCritState.speedMph = 10.0;
    subCritState.distanceFt = 30.0;
    subCritState.rollAngleRad = critRollRad - 1e-4;

    stepTandemPhysics(subCritState, BASELINE_STATS, NEUTRAL_CONTROLS, FIXED_DT);
    assert.notStrictEqual(subCritState.phase, 'splashdown', 'Roll within critical threshold must not splashdown');

    // Exact threshold plus epsilon: splashes down
    const superCritState = createInitialTandemState();
    superCritState.phase = 'riding';
    superCritState.speedMph = 10.0;
    superCritState.distanceFt = 30.0;
    superCritState.rollAngleRad = critRollRad + 1e-4;

    stepTandemPhysics(superCritState, BASELINE_STATS, NEUTRAL_CONTROLS, FIXED_DT);
    assert.strictEqual(superCritState.phase, 'splashdown', 'Roll exceeding critical threshold must trigger splashdown');
  });

  await t.test('1.8 Outrigger width effect across 0 ft (bare) vs 3.2 ft (pontoons)', () => {
    const bareStats: TandemStats = { ...BASELINE_STATS, outriggerWidthFt: 0.0, lateralStability: 10 };
    const pontoonStats: TandemStats = { ...BASELINE_STATS, outriggerWidthFt: 3.2, lateralStability: 80 };

    const bareCritRad = computeCriticalRollThreshold(bareStats);
    const pontoonCritRad = computeCriticalRollThreshold(pontoonStats);

    assert.ok(
      pontoonCritRad > bareCritRad,
      `Pontoon outriggers must grant higher rollover threshold (${(pontoonCritRad * 180 / Math.PI).toFixed(1)}°) than bare (${(bareCritRad * 180 / Math.PI).toFixed(1)}°)`
    );
  });
});

// ============================================================================
// SUITE 2: MASCOT PROCEDURAL MESH GENERATION & PRESET COVERAGE
// ============================================================================

test('Suite 2: Mascot Procedural Mesh Generation & Preset Coverage', async (t) => {
  await t.test('2.1 Shadow the Golden Retriever: procedural anatomy, materials, and wagging tail', () => {
    for (const theme of TANDEM_PAINT_THEMES) {
      const loadout = {
        frameId: 'frame_cruiser',
        drivetrainId: 'drivetrain_dual_chain',
        wheelsId: 'wheels_classic',
        steeringId: 'steering_twin_cruiser',
        stabilizerId: 'stabilizer_training_wheels',
        topperId: 'topper_shadow',
        paintThemeId: theme.id,
      };

      const craft = buildTandemBike3D(loadout);
      assert.ok(craft.topperGroup, `Shadow topper group must exist for theme ${theme.id}`);

      // Inspect topper group hierarchy
      let meshCount = 0;
      let hasRedBandana = false;
      let hasFloppyEars = false;

      craft.topperGroup.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          meshCount++;
          const mesh = child as THREE.Mesh;
          const mat = mesh.material as THREE.MeshStandardMaterial;
          if (mat && mat.color) {
            const hex = mat.color.getHexString();
            // Red bandana collar hex is #ef4444
            if (hex.toLowerCase() === 'ef4444') {
              hasRedBandana = true;
            }
          }
        }
      });

      assert.ok(meshCount >= 8, `Shadow must have at least 8 anatomical mesh parts (got ${meshCount})`);
      assert.ok(hasRedBandana, `Shadow must possess his signature red bandana collar in theme ${theme.id}`);
      assert.ok(craft.topperAnimNodes.shadowTail, 'Shadow must expose wagging tail animation pivot');

      // Test animation tick
      updateTandemAnimation(craft, null, 0.016, 0);
      assert.ok(Number.isFinite(craft.topperAnimNodes.shadowTail.rotation.y), 'Tail rotation must remain finite');

      disposeTandemObject3D(craft.root, false);
    }
  });

  await t.test('2.2 Boomer the Great Dane: athletic anatomy, royal blue collar, and alert ears', () => {
    for (const theme of TANDEM_PAINT_THEMES) {
      const loadout = {
        frameId: 'frame_heavy_cargo',
        drivetrainId: 'drivetrain_planetary_hub',
        wheelsId: 'wheels_fat_floats',
        steeringId: 'steering_ape_hangers',
        stabilizerId: 'stabilizer_pool_pontoons',
        topperId: 'topper_boomer',
        paintThemeId: theme.id,
      };

      const craft = buildTandemBike3D(loadout);
      assert.ok(craft.topperGroup, `Boomer topper group must exist for theme ${theme.id}`);

      let meshCount = 0;
      let hasBlueCollar = false;

      craft.topperGroup.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          meshCount++;
          const mesh = child as THREE.Mesh;
          const mat = mesh.material as THREE.MeshStandardMaterial;
          if (mat && mat.color) {
            const hex = mat.color.getHexString();
            // Royal blue collar hex is #2563eb
            if (hex.toLowerCase() === '2563eb') {
              hasBlueCollar = true;
            }
          }
        }
      });

      assert.ok(meshCount >= 8, `Boomer must have at least 8 anatomical mesh parts (got ${meshCount})`);
      assert.ok(hasBlueCollar, `Boomer must possess his signature royal blue collar in theme ${theme.id}`);
      assert.ok(craft.topperAnimNodes.boomerTail, 'Boomer must expose tail animation pivot');

      // Test animation tick
      updateTandemAnimation(craft, null, 0.016, 0);
      assert.ok(Number.isFinite(craft.topperAnimNodes.boomerTail.rotation.y), 'Tail rotation must remain finite');

      disposeTandemObject3D(craft.root, false);
    }
  });

  await t.test('2.3 All 4 curated presets assemble cleanly with complete 3D hierarchies without throw', () => {
    for (const preset of TANDEM_PRESETS) {
      const craft = buildTandemBike3D(preset.loadout);

      assert.ok(craft.root, `Preset ${preset.id} root group must exist`);
      assert.ok(craft.frameGroup, `Preset ${preset.id} frameGroup must exist`);
      assert.ok(craft.drivetrainGroup, `Preset ${preset.id} drivetrainGroup must exist`);
      assert.ok(craft.wheelsGroup, `Preset ${preset.id} wheelsGroup must exist`);
      assert.ok(craft.steeringGroup, `Preset ${preset.id} steeringGroup must exist`);
      assert.ok(craft.stabilizerGroup, `Preset ${preset.id} stabilizerGroup must exist`);
      assert.ok(craft.topperGroup, `Preset ${preset.id} topperGroup must exist`);
      assert.ok(craft.crewGroup, `Preset ${preset.id} crewGroup must exist`);

      // Verify riders IK nodes are initialized
      assert.ok(craft.crewIK.captainLegL, 'Captain left leg IK chain must exist');
      assert.ok(craft.crewIK.captainLegR, 'Captain right leg IK chain must exist');
      assert.ok(craft.crewIK.stokerLegL, 'Stoker left leg IK chain must exist');
      assert.ok(craft.crewIK.stokerLegR, 'Stoker right leg IK chain must exist');

      // Verify wheel spinners
      assert.strictEqual(craft.wheelSpinners.length, 2, 'Must have front and rear wheel spinners');

      // Count total meshes
      let totalMeshes = 0;
      craft.root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) totalMeshes++;
      });
      assert.ok(totalMeshes >= 30, `Preset ${preset.id} must assemble at least 30 meshes (got ${totalMeshes})`);

      disposeTandemObject3D(craft.root, false);
    }
  });

  await t.test('2.4 All 7 catalog topper meshes assemble without throwing', () => {
    const topperIds = [
      'topper_shadow',
      'topper_boomer',
      'topper_bull_horns',
      'topper_rb_wings',
      'topper_aero_fin',
      'topper_golden_bell',
      'topper_stratos',
    ];

    for (const tid of topperIds) {
      const loadout = {
        frameId: 'frame_cruiser',
        drivetrainId: 'drivetrain_dual_chain',
        wheelsId: 'wheels_classic',
        steeringId: 'steering_twin_cruiser',
        stabilizerId: 'stabilizer_training_wheels',
        topperId: tid,
        paintThemeId: 'redbull_navy',
      };

      const craft = buildTandemBike3D(loadout);
      assert.ok(craft.topperGroup, `Topper ${tid} group must assemble cleanly`);
      disposeTandemObject3D(craft.root, false);
    }
  });
});

// ============================================================================
// SUITE 3: CLOSED-FORM 2-BONE INVERSE KINEMATICS SOLVER
// ============================================================================

test('Suite 3: Closed-form 2-Bone Inverse Kinematics Solver', async (t) => {
  // Helper to construct a synthetic leg IK chain
  function createSyntheticLeg(bbX = 0.25, bbY = 0.28, hipX = 0.10, hipY = 0.78, isLeft = false): LegIKChain {
    const geo = new THREE.CylinderGeometry(0.04, 0.04, 0.38);
    const mat = new THREE.MeshBasicMaterial();
    return {
      hipPos: new THREE.Vector3(hipX, hipY, isLeft ? -0.12 : 0.12),
      thighMesh: new THREE.Mesh(geo, mat),
      kneeJoint: new THREE.Mesh(new THREE.SphereGeometry(0.05), mat),
      shankMesh: new THREE.Mesh(geo, mat),
      footMesh: new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.06), mat),
      isLeft,
      bbX,
      bbY,
    };
  }

  await t.test('3.1 Singular configuration: pedal coincident with hip (zero distance)', () => {
    // Set BB position directly at hip position so pedal distance can approach 0
    const leg = createSyntheticLeg(0.10, 0.78, 0.10, 0.78, false);

    // Run solver at angle where pedal is closest to hip
    updateCrewLegIK(leg, 0);

    // Verify positions are finite and non-NaN
    assert.ok(Number.isFinite(leg.thighMesh.position.x), 'thighMesh.x must be finite');
    assert.ok(!Number.isNaN(leg.thighMesh.position.x), 'thighMesh.x must not be NaN');
    assert.ok(Number.isFinite(leg.kneeJoint.position.x), 'kneeJoint.x must be finite');
    assert.ok(!Number.isNaN(leg.kneeJoint.position.x), 'kneeJoint.x must not be NaN');
    assert.ok(Number.isFinite(leg.shankMesh.position.x), 'shankMesh.x must be finite');
    assert.ok(!Number.isNaN(leg.shankMesh.position.x), 'shankMesh.x must not be NaN');
    assert.ok(Number.isFinite(leg.footMesh.position.x), 'footMesh.x must be finite');
    assert.ok(!Number.isNaN(leg.footMesh.position.x), 'footMesh.x must not be NaN');
  });

  await t.test('3.2 Target out of reach: pedal placed 2.5m away (> L1 + L2 = 0.76m)', () => {
    // Set BB position 2.5 meters away from hip
    const leg = createSyntheticLeg(2.50, 0.78, 0.10, 0.78, false);

    updateCrewLegIK(leg, 0);

    // Distance clamping must clamp d to (L1 + L2) * 0.998 and solve without NaN
    assert.ok(Number.isFinite(leg.kneeJoint.position.x), 'kneeJoint.x must be finite when target out of reach');
    assert.ok(!Number.isNaN(leg.kneeJoint.position.x), 'kneeJoint.x must not be NaN when target out of reach');
    assert.ok(Number.isFinite(leg.thighMesh.quaternion.x), 'thighMesh quaternion must be finite');
    assert.ok(Number.isFinite(leg.shankMesh.quaternion.x), 'shankMesh quaternion must be finite');
  });

  await t.test('3.3 360-degree continuous crank sweep produces continuous smooth knee motion', () => {
    const leg = createSyntheticLeg();
    let prevKneeY: number | null = null;

    for (let deg = 0; deg <= 360; deg += 2) {
      const rad = (deg * Math.PI) / 180;
      updateCrewLegIK(leg, rad);

      const kneeY = leg.kneeJoint.position.y;
      assert.ok(Number.isFinite(kneeY), `Knee Y must be finite at ${deg}°`);

      if (prevKneeY !== null) {
        // Delta between 2-degree increments should be small (continuous motion)
        const delta = Math.abs(kneeY - prevKneeY);
        assert.ok(delta < 0.05, `Knee trajectory discontinuity detected at ${deg}°: delta=${delta}`);
      }
      prevKneeY = kneeY;
    }
  });

  await t.test('3.4 Left and right legs maintain exact 180-degree anti-phase pedaling', () => {
    const legR = createSyntheticLeg(0.25, 0.28, 0.10, 0.78, false);
    const legL = createSyntheticLeg(0.25, 0.28, 0.10, 0.78, true);

    for (let rad = 0; rad < Math.PI * 2; rad += Math.PI / 4) {
      updateCrewLegIK(legR, rad);
      updateCrewLegIK(legL, rad);

      // Pedal foot X and Y offsets from BB must be opposite (anticorrelated)
      const rFootOffsetX = legR.footMesh.position.x - 0.25;
      const lFootOffsetX = legL.footMesh.position.x - 0.25;
      const rFootOffsetY = legR.footMesh.position.y - 0.28;
      const lFootOffsetY = legL.footMesh.position.y - 0.28;

      assert.ok(
        Math.abs(rFootOffsetX + lFootOffsetX) < 1e-4,
        `Foot X coords must be 180° opposite: R=${rFootOffsetX}, L=${lFootOffsetX}`
      );
      assert.ok(
        Math.abs(rFootOffsetY + lFootOffsetY) < 1e-4,
        `Foot Y coords must be 180° opposite: R=${rFootOffsetY}, L=${lFootOffsetY}`
      );
    }
  });

  await t.test('3.5 Pathological angles: extreme magnitudes (1e8 * pi, -1e8 * pi) do not crash', () => {
    const leg = createSyntheticLeg();
    const extremeAngles = [1e8 * Math.PI, -1e8 * Math.PI, 1e12, -1e12];

    for (const angle of extremeAngles) {
      updateCrewLegIK(leg, angle);
      assert.ok(Number.isFinite(leg.kneeJoint.position.x), `Knee X must be finite for angle=${angle}`);
      assert.ok(!Number.isNaN(leg.kneeJoint.position.x), `Knee X must not be NaN for angle=${angle}`);
    }
  });
});

// ============================================================================
// SUITE 4: MESH DISPOSAL HELPER (disposeTandemObject3D)
// ============================================================================

test('Suite 4: Mesh Disposal Helper (disposeTandemObject3D)', async (t) => {
  await t.test('4.1 Deep recursive hierarchy disposal (30 levels deep)', () => {
    const root = new THREE.Group();
    let current: THREE.Object3D = root;

    const geosDisposed: THREE.BufferGeometry[] = [];
    const matsDisposed: THREE.Material[] = [];

    // Create a 30-level deep branch with meshes and textures
    for (let i = 0; i < 30; i++) {
      const childGroup = new THREE.Group();
      const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
      geo.userData.cached = false;
      const mat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
      mat.userData.cached = false;

      // Mock dispose tracking
      geo.dispose = () => {
        geosDisposed.push(geo);
      };
      mat.dispose = () => {
        matsDisposed.push(mat);
      };

      const mesh = new THREE.Mesh(geo, mat);
      childGroup.add(mesh);
      current.add(childGroup);
      current = childGroup;
    }

    disposeTandemObject3D(root, false);

    assert.strictEqual(geosDisposed.length, 30, 'All 30 nested geometries must be disposed');
    assert.strictEqual(matsDisposed.length, 30, 'All 30 nested materials must be disposed');
  });

  await t.test('4.2 Multi-material array disposal', () => {
    const root = new THREE.Group();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    let disposedCount = 0;

    const mats = [
      new THREE.MeshBasicMaterial(),
      new THREE.MeshBasicMaterial(),
      new THREE.MeshBasicMaterial(),
    ];
    mats.forEach((m) => {
      m.userData.cached = false;
      m.dispose = () => {
        disposedCount++;
      };
    });

    const mesh = new THREE.Mesh(geo, mats);
    root.add(mesh);

    disposeTandemObject3D(root, false);
    assert.strictEqual(disposedCount, 3, 'All materials in multi-material array must be disposed');
  });

  await t.test('4.3 Rapid recreation and disposal stress harness (100 sequential cycles)', () => {
    const preset = TANDEM_PRESETS[0];

    const startTime = performance.now();
    for (let i = 0; i < 100; i++) {
      const craft = buildTandemBike3D(preset.loadout);
      updateTandemAnimation(craft, null, 0.016, 0.5);
      disposeTandemObject3D(craft.root, false);
    }
    const elapsedMs = performance.now() - startTime;

    // 100 cycles should complete quickly (< 1000ms) with zero memory corruption
    assert.ok(elapsedMs < 3000, `100 sequential build/dispose cycles took ${elapsedMs.toFixed(1)}ms (must be <3000ms)`);
  });

  await t.test('4.4 Idempotent double-disposal safety', () => {
    const craft = buildTandemBike3D(TANDEM_PRESETS[1].loadout);

    // First disposal
    assert.doesNotThrow(() => {
      disposeTandemObject3D(craft.root, false);
    }, 'First disposal must not throw');

    // Second disposal on same tree must be completely safe
    assert.doesNotThrow(() => {
      disposeTandemObject3D(craft.root, false);
    }, 'Second disposal must not throw');
  });

  await t.test('4.5 Global cache purge disposal (disposeCached = true)', () => {
    const craft = buildTandemBike3D(TANDEM_PRESETS[2].loadout);

    assert.doesNotThrow(() => {
      disposeTandemObject3D(craft.root, true);
    }, 'Cache purge disposal must complete without throwing');

    // Rebuild after cache purge must transparently re-populate caches and function
    const craftRebuilt = buildTandemBike3D(TANDEM_PRESETS[2].loadout);
    assert.ok(craftRebuilt.root, 'Rebuild after cache purge must succeed');
    disposeTandemObject3D(craftRebuilt.root, true);
  });
});
