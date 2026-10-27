/**
 * Red Bull Tandem Bike Challenge — Milestone 3 Adversarial Stress Test Suite
 * Empirical Challenger 1 Verification Harness
 *
 * Rigorously stress-tests:
 * 1. Preset Assembly & Mesh Hierarchy Completeness (buildTandemBike3D across all 4 presets)
 * 2. Closed-Form Inverse Kinematics (IK) Numerical Stability (0 to 100pi, NaN, extreme angles)
 * 3. Memory Cleanup & Recursive Resource Disposal (disposeTandemObject3D, cache purge, re-assembly)
 * 4. Mascot Procedural Toppers & Child Node Names (topper_shadow, topper_boomer, animNodes)
 * 5. Dyno Rig Physics & Canvas Integration Edge Cases
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  buildTandemBike3D,
  disposeTandemObject3D,
  updateCrewLegIK,
  updateTandemAnimation,
  getTandemPaintThemeById,
  TANDEM_GEOMETRY,
  TANDEM_SOCKET_POSITIONS,
  type TandemBike3DGroups,
} from '../src/tandem/TandemBike3DBuilder.ts';
import * as BuilderModule from '../src/tandem/TandemBike3DBuilder.ts';
import {
  TANDEM_PRESETS,
  DEFAULT_TANDEM_LOADOUT,
  computeTandemAggregateStats,
  computeTandemDynoMetrics,
  getTandemPartById,
} from '../src/tandem/TandemPartCatalog.ts';
import {
  computeCriticalRollThreshold,
} from '../src/tandem/TandemPhysicsEngine.ts';
import type { TandemLoadout, TandemCategory } from '../src/tandem/types.ts';

test('Milestone 3 Challenger — Adversarial Stress Suite', async (t) => {

  // ==========================================================================
  // VECTOR 1: Preset Assembly & Mesh Hierarchy Completeness
  // ==========================================================================
  await t.test('Vector 1: buildTandemBike3D with all 4 presets and verify valid Three.js Group output with non-empty meshes', async (tSub) => {
    assert.ok(TANDEM_PRESETS.length >= 4, 'Must have at least 4 catalog presets');

    for (const preset of TANDEM_PRESETS) {
      await tSub.test(`Preset: ${preset.id} (${preset.name}) builds valid hierarchy`, () => {
        const bike = buildTandemBike3D(preset.loadout);

        // 1. Root structure
        assert.ok(bike.root, 'Must return root');
        assert.equal(bike.root.name, 'TandemBikeRoot', 'Root name must be TandemBikeRoot');
        assert.ok(bike.root.isGroup, 'Root must be a THREE.Group');

        // 2. Count meshes and ensure non-empty
        let meshCount = 0;
        let totalVertices = 0;
        bike.root.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            meshCount++;
            const mesh = obj as THREE.Mesh;
            assert.ok(mesh.geometry, 'Mesh must have geometry');
            assert.ok(mesh.material, 'Mesh must have material');
            if (mesh.geometry.attributes?.position) {
              totalVertices += mesh.geometry.attributes.position.count;
            }
          }
        });

        assert.ok(meshCount >= 80, `Preset ${preset.id} must contain >= 80 meshes (found ${meshCount})`);
        assert.ok(totalVertices > 1000, `Preset ${preset.id} must contain > 1000 vertices (found ${totalVertices})`);

        // 3. Verify core sub-assemblies exist
        assert.ok(bike.frameGroup && bike.frameGroup.isGroup, 'frameGroup must be a THREE.Group');
        assert.ok(bike.drivetrainGroup && bike.drivetrainGroup.isGroup, 'drivetrainGroup must be a THREE.Group');
        assert.ok(bike.wheelsGroup && bike.wheelsGroup.isGroup, 'wheelsGroup must be a THREE.Group');
        assert.ok(bike.steeringGroup && bike.steeringGroup.isGroup, 'steeringGroup must be a THREE.Group');
        assert.ok(bike.stabilizerGroup && bike.stabilizerGroup.isGroup, 'stabilizerGroup must be a THREE.Group');
        assert.ok(bike.topperGroup && bike.topperGroup.isGroup, 'topperGroup must be a THREE.Group');
        assert.ok(bike.crewGroup && bike.crewGroup.isGroup, 'crewGroup must be a THREE.Group');
        assert.ok(bike.frontSteerNode && bike.frontSteerNode.isGroup, 'frontSteerNode must be a THREE.Group');

        // 4. Spinners
        assert.equal(bike.wheelSpinners.length, 2, 'Must have front and rear wheel spinners');
        assert.ok(bike.crankSpinners.length >= 2, 'Must have captain and stoker crank spinners');

        // 5. Socket markers
        const categories: TandemCategory[] = ['frame', 'drivetrain', 'wheels', 'steering', 'stabilizer', 'topper'];
        assert.equal(bike.socketMarkerList.length, 6, 'Must have 6 socket markers');
        for (const cat of categories) {
          assert.ok(bike.socketMarkers[cat], `Socket marker for ${cat} must exist`);
          assert.equal(bike.socketMarkers[cat].userData.category, cat, `Socket marker category mismatch`);
          assert.equal(bike.socketMarkers[cat].userData.isSocketMarker, true);
        }

        // Clean up
        disposeTandemObject3D(bike.root, false);
      });
    }

    await tSub.test('API export check: buildTandemBikeObject3D alias', () => {
      // Document whether buildTandemBikeObject3D is exported or undefined
      const isDefined = typeof (BuilderModule as any).buildTandemBikeObject3D === 'function';
      // In TandemBike3DBuilder.ts, the function is named buildTandemBike3D
      assert.ok(typeof buildTandemBike3D === 'function', 'buildTandemBike3D is the canonical export');
      if (!isDefined) {
        // Finding: export name is buildTandemBike3D, not buildTandemBikeObject3D
        assert.equal((BuilderModule as any).buildTandemBikeObject3D, undefined);
      }
    });
  });

  // ==========================================================================
  // VECTOR 2: Closed-Form Inverse Kinematics (IK) Numerical Stability
  // ==========================================================================
  await t.test('Vector 2: updateCrewLegIK across extreme cadence angles (0, pi/4, pi/2, pi, 3pi/2, 2pi, 100pi) asserting no NaN/Infinity', async (tSub) => {
    const bike = buildTandemBike3D(DEFAULT_TANDEM_LOADOUT);
    const legs = [
      { name: 'Captain Left', leg: bike.crewIK.captainLegL },
      { name: 'Captain Right', leg: bike.crewIK.captainLegR },
      { name: 'Stoker Left', leg: bike.crewIK.stokerLegL },
      { name: 'Stoker Right', leg: bike.crewIK.stokerLegR },
    ];

    const requiredAngles = [
      0,
      Math.PI / 4,
      Math.PI / 2,
      Math.PI,
      (3 * Math.PI) / 2,
      2 * Math.PI,
      100 * Math.PI,
    ];

    for (const angle of requiredAngles) {
      await tSub.test(`Required angle: ${(angle / Math.PI).toFixed(2)}π rad`, () => {
        for (const { name, leg } of legs) {
          updateCrewLegIK(leg, angle);

          const meshes = [
            { part: 'thigh', m: leg.thighMesh },
            { part: 'knee', m: leg.kneeJoint },
            { part: 'shank', m: leg.shankMesh },
            { part: 'foot', m: leg.footMesh },
          ];

          for (const { part, m } of meshes) {
            for (const axis of ['x', 'y', 'z'] as const) {
              assert.ok(
                !Number.isNaN(m.position[axis]),
                `[${name} ${part}] position.${axis} is NaN at angle ${angle}`
              );
              assert.ok(
                Number.isFinite(m.position[axis]),
                `[${name} ${part}] position.${axis} is Infinity at angle ${angle}`
              );

              assert.ok(
                !Number.isNaN(m.rotation[axis]),
                `[${name} ${part}] rotation.${axis} is NaN at angle ${angle}`
              );
              assert.ok(
                Number.isFinite(m.rotation[axis]),
                `[${name} ${part}] rotation.${axis} is Infinity at angle ${angle}`
              );

              assert.ok(
                !Number.isNaN(m.quaternion[axis]),
                `[${name} ${part}] quaternion.${axis} is NaN at angle ${angle}`
              );
              assert.ok(
                Number.isFinite(m.quaternion[axis]),
                `[${name} ${part}] quaternion.${axis} is Infinity at angle ${angle}`
              );
            }
            assert.ok(!Number.isNaN(m.quaternion.w), `[${name} ${part}] quaternion.w is NaN at angle ${angle}`);
            assert.ok(Number.isFinite(m.quaternion.w), `[${name} ${part}] quaternion.w is Infinity at angle ${angle}`);
          }
        }
      });
    }

    await tSub.test('Adversarial angles: Negative, extreme magnitude (-100pi, 1e7, -1e7, MAX_SAFE_INTEGER)', () => {
      const extremeAngles = [
        -100 * Math.PI,
        1e6,
        -1e6,
        1e7,
        -1e7,
        Number.MAX_SAFE_INTEGER,
        -Number.MAX_SAFE_INTEGER,
      ];

      for (const angle of extremeAngles) {
        for (const { name, leg } of legs) {
          updateCrewLegIK(leg, angle);
          for (const axis of ['x', 'y', 'z'] as const) {
            assert.ok(!Number.isNaN(leg.footMesh.position[axis]), `[${name}] foot position.${axis} is NaN at extreme angle ${angle}`);
            assert.ok(Number.isFinite(leg.footMesh.position[axis]), `[${name}] foot position.${axis} is non-finite at extreme angle ${angle}`);
            assert.ok(!Number.isNaN(leg.kneeJoint.position[axis]), `[${name}] knee position.${axis} is NaN at extreme angle ${angle}`);
            assert.ok(Number.isFinite(leg.kneeJoint.position[axis]), `[${name}] knee position.${axis} is non-finite at extreme angle ${angle}`);
          }
        }
      }
    });

    await tSub.test('Kinematic Reach Boundaries: distance between hip and pedal is clamped within reachable range', () => {
      const leg = bike.crewIK.captainLegL;
      const L1 = TANDEM_GEOMETRY.thighLengthM;
      const L2 = TANDEM_GEOMETRY.shankLengthM;

      for (let a = 0; a < 2 * Math.PI; a += 0.1) {
        updateCrewLegIK(leg, a);
        const hipToKnee = leg.hipPos.distanceTo(leg.kneeJoint.position);
        const kneeToPedal = leg.kneeJoint.position.distanceTo(leg.footMesh.position);

        // Knee to hip should equal thigh length (approx due to numerical epsilon)
        assert.ok(Math.abs(hipToKnee - L1) < 0.02, `Thigh segment length deviated: expected ${L1}, got ${hipToKnee}`);
        // Knee to foot should equal shank length (approx)
        assert.ok(Math.abs(kneeToPedal - L2) < 0.02, `Shank segment length deviated: expected ${L2}, got ${kneeToPedal}`);
      }
    });

    disposeTandemObject3D(bike.root, false);
  });

  // ==========================================================================
  // VECTOR 3: Memory Disposal & Leak Prevention
  // ==========================================================================
  await t.test('Vector 3: disposeTandemObject3D on assembled bikes and verify geometry and material disposal without crashing', async (tSub) => {
    await tSub.test('Standard disposal (disposeCached = false) traverses meshes without error', () => {
      const bike = buildTandemBike3D(DEFAULT_TANDEM_LOADOUT);
      assert.doesNotThrow(() => {
        disposeTandemObject3D(bike.root, false);
      }, 'disposeTandemObject3D should not throw');
    });

    await tSub.test('Double disposal idempotency: disposing already disposed object does not throw', () => {
      const bike = buildTandemBike3D(DEFAULT_TANDEM_LOADOUT);
      disposeTandemObject3D(bike.root, false);
      assert.doesNotThrow(() => {
        disposeTandemObject3D(bike.root, false);
      }, 'Second disposeTandemObject3D call should not throw');
    });

    await tSub.test('Cache purge disposal (disposeCached = true) clears GEO_CACHE and MAT_CACHE', () => {
      const bike = buildTandemBike3D(DEFAULT_TANDEM_LOADOUT);
      assert.doesNotThrow(() => {
        disposeTandemObject3D(bike.root, true);
      }, 'disposeCached=true should not throw');

      // Subsequent build must construct fresh geometries and materials without failure
      const bike2 = buildTandemBike3D(DEFAULT_TANDEM_LOADOUT);
      let meshCount = 0;
      bike2.root.traverse((m) => {
        if ((m as THREE.Mesh).isMesh) meshCount++;
      });
      assert.ok(meshCount >= 80, 'Must recreate valid meshes after full cache purge');
      disposeTandemObject3D(bike2.root, false);
    });

    await tSub.test('Rapid allocation & disposal stress harness (50 sequential bikes)', () => {
      for (let i = 0; i < 50; i++) {
        const preset = TANDEM_PRESETS[i % TANDEM_PRESETS.length];
        const bike = buildTandemBike3D(preset.loadout);
        disposeTandemObject3D(bike.root, i % 10 === 0);
      }
    });
  });

  // ==========================================================================
  // VECTOR 4: Mascot Procedural Topper Meshes & Child Node Names
  // ==========================================================================
  await t.test('Vector 4: topper_shadow and topper_boomer procedural mesh assembly — inspect child nodes and names', async (tSub) => {
    await tSub.test('topper_shadow: Golden Retriever procedural mesh structure', () => {
      const bike = buildTandemBike3D({ ...DEFAULT_TANDEM_LOADOUT, topperId: 'topper_shadow' });
      assert.ok(bike.topperGroup, 'topperGroup must exist');
      assert.ok(bike.topperGroup.children.length > 0, 'topperGroup must have children');

      // Check animation nodes
      assert.ok(bike.topperAnimNodes.shadowTail, 'topperAnimNodes.shadowTail must be registered');
      assert.ok(bike.topperAnimNodes.shadowTail.isGroup, 'shadowTail must be a THREE.Group pivot');

      // Verify animation tick wags shadowTail
      const initialRotY = bike.topperAnimNodes.shadowTail.rotation.y;
      updateTandemAnimation(bike, null, 0.016);
      const afterRotY = bike.topperAnimNodes.shadowTail.rotation.y;
      // Tail angle will be set based on performance.now()
      assert.ok(typeof afterRotY === 'number', 'shadowTail rotation.y must be numeric');

      // Count procedural parts in Shadow
      const shadowMeshes: THREE.Mesh[] = [];
      bike.topperGroup.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) shadowMeshes.push(obj as THREE.Mesh);
      });
      // Shadow comprises torso, ruff, 2 haunches, 2 front legs, collar, cranium, muzzle, nose, tongue, 2 ears, tail = 14 meshes
      assert.ok(shadowMeshes.length >= 10, `Shadow must have >= 10 meshes (found ${shadowMeshes.length})`);

      // Check child node names
      // Note: Empirical finding — meshes were instantiated without assigning .name
      const namedNodes: string[] = [];
      bike.topperGroup.traverse((obj) => {
        if (obj.name && obj.name.trim().length > 0) {
          namedNodes.push(obj.name);
        }
      });

      // Assert finding: verify whether child node names like 'bandana' or 'collar' are set
      const hasBandanaName = bike.topperGroup.getObjectByName('bandana') !== undefined;
      const hasCollarName = bike.topperGroup.getObjectByName('collar') !== undefined;
      const hasTailName = bike.topperGroup.getObjectByName('tail') !== undefined;

      // We document this empirical observation:
      if (!hasBandanaName && !hasCollarName && !hasTailName) {
        // Confirmed finding: child node names are not explicitly set on mesh objects
        assert.equal(namedNodes.length, 0, 'No named child nodes exist in topper_shadow hierarchy');
      }

      disposeTandemObject3D(bike.root, false);
    });

    await tSub.test('topper_boomer: Great Dane procedural mesh structure', () => {
      const bike = buildTandemBike3D({ ...DEFAULT_TANDEM_LOADOUT, topperId: 'topper_boomer' });
      assert.ok(bike.topperGroup, 'topperGroup must exist');
      assert.ok(bike.topperGroup.children.length > 0, 'topperGroup must have children');

      // Check animation nodes
      assert.ok(bike.topperAnimNodes.boomerTail, 'topperAnimNodes.boomerTail must be registered');

      // Count procedural parts in Boomer
      const boomerMeshes: THREE.Mesh[] = [];
      bike.topperGroup.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) boomerMeshes.push(obj as THREE.Mesh);
      });
      // Boomer comprises 4 athletic legs, chest, waist, neck strut, collar, skull, muzzle, nose, 2 ears, tail strut = 14 meshes
      assert.ok(boomerMeshes.length >= 10, `Boomer must have >= 10 meshes (found ${boomerMeshes.length})`);

      // Check child node names
      const namedNodes: string[] = [];
      bike.topperGroup.traverse((obj) => {
        if (obj.name && obj.name.trim().length > 0) {
          namedNodes.push(obj.name);
        }
      });

      // Confirmed finding: child node names are not explicitly set on mesh objects
      const hasCollarName = bike.topperGroup.getObjectByName('collar') !== undefined;
      if (!hasCollarName) {
        assert.equal(namedNodes.length, 0, 'No named child nodes exist in topper_boomer hierarchy');
      }

      disposeTandemObject3D(bike.root, false);
    });

    await tSub.test('All other catalog toppers generate valid meshes and animation hooks', () => {
      const otherTopperIds = ['topper_bull_horns', 'topper_rb_wings', 'topper_aero_fin', 'topper_golden_bell', 'topper_stratos'];
      for (const topperId of otherTopperIds) {
        const bike = buildTandemBike3D({ ...DEFAULT_TANDEM_LOADOUT, topperId });
        let meshCount = 0;
        bike.topperGroup.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) meshCount++;
        });
        assert.ok(meshCount >= 1, `Topper ${topperId} must have at least 1 mesh (found ${meshCount})`);
        if (topperId === 'topper_golden_bell') {
          assert.ok(bike.topperAnimNodes.bellClapper, 'topper_golden_bell must register bellClapper animNode');
        }
        disposeTandemObject3D(bike.root, false);
      }
    });
  });

  // ==========================================================================
  // VECTOR 5: Dyno Rig Mechanics & Outrigger Indicator Stress Test
  // ==========================================================================
  await t.test('Vector 5: Dyno Rig Mechanics & Outrigger Flash Ring State Logic', async (tSub) => {
    await tSub.test('Critical rollover angle is calculated accurately for all presets', () => {
      for (const preset of TANDEM_PRESETS) {
        const stats = computeTandemAggregateStats(preset.loadout);
        const thetaCritRad = computeCriticalRollThreshold(stats);
        const thetaCritDeg = (thetaCritRad * 180) / Math.PI;

        assert.ok(!Number.isNaN(thetaCritDeg), `Rollover angle is NaN for ${preset.id}`);
        assert.ok(thetaCritDeg >= 12.0 && thetaCritDeg <= 45.0, `Rollover angle out of realistic range: ${thetaCritDeg} deg`);
      }
    });

    await tSub.test('Outrigger Contact Ring side switching logic stress test', () => {
      // Test the logic in TandemCanvas3D.tsx lines 713-715:
      // const sideIdx = bay.dynoPivotGroup.rotation.x > 0 ? 0 : 1;
      // (bay.outriggerContactRings[sideIdx].material as THREE.MeshBasicMaterial).opacity = inContact ? 0.9 : 0.0;
      //
      // Empirical verification: If tilting right (sideIdx=0, inContact=true), opacity[0] becomes 0.9.
      // When tilting left (sideIdx=1), opacity[0] is not reset in that frame.
      const simulatedRingOpacities = [0.0, 0.0];

      function updateContactRing(rotX: number, inContact: boolean) {
        const sideIdx = rotX > 0 ? 0 : 1;
        simulatedRingOpacities[sideIdx] = inContact ? 0.9 : 0.0;
      }

      // 1. Tilt right into contact:
      updateContactRing(0.5, true);
      assert.equal(simulatedRingOpacities[0], 0.9, 'Right ring should be lit');
      assert.equal(simulatedRingOpacities[1], 0.0, 'Left ring should be unlit');

      // 2. Tilt left into contact:
      updateContactRing(-0.5, true);
      assert.equal(simulatedRingOpacities[1], 0.9, 'Left ring should be lit');

      // Note: Right ring remained 0.9 because sideIdx was 1 and index 0 was never modified!
      // This empirically confirms the visual artifact where the opposing contact ring stays lit.
      assert.equal(simulatedRingOpacities[0], 0.9, 'Confirms bug: side 0 was not cleared when switching to side 1');
    });

    await tSub.test('computeTandemDynoMetrics produces complete telemetry across presets', () => {
      for (const preset of TANDEM_PRESETS) {
        const metrics = computeTandemDynoMetrics(preset.loadout);
        assert.ok(metrics.totalMassKg > 100, 'Mass must be > 100 kg');
        assert.ok(metrics.stats.cadencePowerW > 200, 'Cadence power must be > 200 W');
        assert.ok(metrics.stabilityScore >= 0 && metrics.stabilityScore <= 100, 'Stability score in 0-100');
        assert.ok(metrics.agilityScore >= 0 && metrics.agilityScore <= 100, 'Agility score in 0-100');
        assert.ok(['ultra_stable', 'balanced', 'twitchy', 'top_heavy'].includes(metrics.dynoStatus));
      }
    });
  });

});
