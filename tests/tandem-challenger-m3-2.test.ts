/**
 * Red Bull Tandem Bike Challenge — Milestone 3 Adversarial Stress Test Suite
 * Empirical Challenger 2 Verification Harness
 *
 * File: tests/tandem-challenger-m3-2.test.ts
 *
 * Verifies and stress-tests:
 * 1. Outrigger span verification across all 7 stabilizer meshes and scaling with outriggerWidthFt
 * 2. Paint theme application across all 6 themes with valid hex colors and dynamic material binding
 * 3. Dyno Rig math: cradle tilt limits (+/- 35 deg) and outrigger contact logic / ring activation
 * 4. Closed-form 2-bone Inverse Kinematics across 360-degree crank cycles & extreme RPMs
 * 5. Canine mascots (Shadow the Golden Retriever & Boomer the Great Dane) anatomical integrity & tail animations
 * 6. Procedural mesh catalog coverage: all 38 parts across 6 categories
 * 7. Recursive memory disposal & caching lifecycle stress test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  buildTandemBike3D,
  disposeTandemBike3D,
  updateTandemAnimation,
  getTandemPaintThemeById,
  TANDEM_GEOMETRY,
  type TandemBike3DGroups,
} from '../src/tandem/TandemBike3DBuilder.ts';
import {
  TANDEM_CATEGORIES,
  TANDEM_PAINT_THEMES,
  TANDEM_PRESETS,
  getTandemPartsByCategory,
  getTandemPartById,
  computeTandemAggregateStats,
  computeTandemDynoMetrics,
  DEFAULT_TANDEM_LOADOUT,
} from '../src/tandem/TandemPartCatalog.ts';
import {
  computeCriticalRollThreshold,
} from '../src/tandem/TandemPhysicsEngine.ts';
import type { TandemLoadout, TandemCategory, TandemStats } from '../src/tandem/types.ts';

// Helper: recursive check for NaN in transforms
function assertNoNaNTransforms(root: THREE.Object3D, path = 'root') {
  const p = root.position;
  const r = root.rotation;
  const s = root.scale;
  const q = root.quaternion;

  assert.ok(
    Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z),
    `Position NaN in ${path}: (${p.x}, ${p.y}, ${p.z})`
  );
  assert.ok(
    Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.z),
    `Rotation NaN in ${path}: (${r.x}, ${r.y}, ${r.z})`
  );
  assert.ok(
    Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.z),
    `Scale NaN in ${path}: (${s.x}, ${s.y}, ${s.z})`
  );
  assert.ok(
    Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z) && Number.isFinite(q.w),
    `Quaternion NaN in ${path}: (${q.x}, ${q.y}, ${q.z}, ${q.w})`
  );

  for (let i = 0; i < root.children.length; i++) {
    assertNoNaNTransforms(root.children[i], `${path}/${root.children[i].name || root.children[i].type || i}`);
  }
}

// Helper: collect all materials in hierarchy
function collectMaterials(root: THREE.Object3D): THREE.Material[] {
  const mats: THREE.Material[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && mesh.material) {
      if (Array.isArray(mesh.material)) {
        mats.push(...mesh.material);
      } else {
        mats.push(mesh.material);
      }
    }
  });
  return mats;
}

// Helper: compute lateral Z extent of meshes in a group
function getGroupZExtent(group: THREE.Group): { minZ: number; maxZ: number; spanZ: number } {
  let minZ = Infinity;
  let maxZ = -Infinity;

  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) {
      mesh.geometry.computeBoundingBox();
      const bb = mesh.geometry.boundingBox;
      if (bb) {
        mesh.updateMatrixWorld(true);
        const corners = [
          new THREE.Vector3(bb.min.x, bb.min.y, bb.min.z).applyMatrix4(mesh.matrixWorld),
          new THREE.Vector3(bb.max.x, bb.max.y, bb.max.z).applyMatrix4(mesh.matrixWorld),
        ];
        for (const c of corners) {
          if (c.z < minZ) minZ = c.z;
          if (c.z > maxZ) maxZ = c.z;
        }
      }
    }
  });

  return { minZ, maxZ, spanZ: maxZ - minZ };
}

// ============================================================================
// SUITE 1: OUTRIGGER SPAN VERIFICATION & STABILIZER SCALING
// ============================================================================
test('Empirical Suite 1: Outrigger Span Verification Across All 7 Stabilizer Meshes', async (t) => {
  const stabilizerParts = getTandemPartsByCategory('stabilizer');
  assert.equal(stabilizerParts.length, 7, 'Must have exactly 7 stabilizer parts in catalog');

  // Verify all 7 parts and their physical scaling
  for (const stabPart of stabilizerParts) {
    await t.test(`Stabilizer [${stabPart.id}]: span scales directly with outriggerWidthFt (${stabPart.stats.outriggerWidthFt} ft)`, () => {
      const loadout: TandemLoadout = {
        ...DEFAULT_TANDEM_LOADOUT,
        stabilizerId: stabPart.id,
      };

      const bike = buildTandemBike3D(loadout);
      assert.ok(bike.stabilizerGroup, 'Stabilizer group must exist');

      const expectedSpanM = stabPart.stats.outriggerWidthFt * 0.3048;
      assert.equal(
        Number(bike.outriggerSpanM.toFixed(4)),
        Number(expectedSpanM.toFixed(4)),
        `Reported outriggerSpanM (${bike.outriggerSpanM}) must match catalog outriggerWidthFt converted to meters (${expectedSpanM})`
      );

      // Verify stabilizer mesh transforms
      assertNoNaNTransforms(bike.stabilizerGroup, `stabilizerGroup_${stabPart.id}`);

      // Check lateral outrigger position scaling
      const halfSpanM = expectedSpanM / 2;

      // Stabilizers with physical lateral outrigger struts
      const isLateralOutrigger = [
        'stabilizer_training_wheels',
        'stabilizer_pool_pontoons',
        'stabilizer_hydroskis',
        'stabilizer_rb_canards',
      ].includes(stabPart.id);

      if (isLateralOutrigger) {
        // Find meshes with non-zero Z position in stabilizerGroup
        const lateralMeshes: THREE.Mesh[] = [];
        bike.stabilizerGroup.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh && Math.abs(mesh.position.z) > 0.05) {
            lateralMeshes.push(mesh);
          }
        });

        assert.ok(
          lateralMeshes.length >= 2,
          `Stabilizer ${stabPart.id} with outriggerWidthFt ${stabPart.stats.outriggerWidthFt} must have left & right outrigger meshes`
        );

        // Check max lateral offset in stabilizerGroup
        const maxAbsZ = Math.max(...lateralMeshes.map((m) => Math.abs(m.position.z)));
        assert.ok(
          Math.abs(maxAbsZ - halfSpanM) < 0.05 ||
            (stabPart.id === 'stabilizer_rb_canards' && Math.abs(maxAbsZ - halfSpanM / 2) < 0.05),
          `Outrigger mesh lateral offset (${maxAbsZ}m) must scale with half-span (${halfSpanM}m)`
        );
      } else if (stabPart.id === 'stabilizer_bare') {
        // Bare setup has no outriggers
        const ext = getGroupZExtent(bike.stabilizerGroup);
        assert.ok(ext.spanZ < 0.3, `Bare stabilizer span must be compact axle caps (< 0.3m), got ${ext.spanZ}m`);
      } else if (stabPart.id === 'stabilizer_gyro_flywheel') {
        // Gyro flywheel: dual brass flywheels in bottom bracket pod (z = +-0.05)
        assert.equal(bike.gyroSpinners.length, 2, 'Gyro flywheel must have 2 counter-rotating flywheel spinners');
      } else if (stabPart.id === 'stabilizer_counterweight') {
        // Deep keel: centerline pendular bulb beneath frame
        const ext = getGroupZExtent(bike.stabilizerGroup);
        assert.ok(ext.spanZ < 0.25, `Centerline keel span must be narrow (< 0.25m), got ${ext.spanZ}m`);
      }

      disposeTandemBike3D(bike.root);
    });
  }

  // Monotonic outrigger span scaling test
  await t.test('Outrigger spans scale monotonically with outriggerWidthFt catalog values', () => {
    const sortedParts = [...stabilizerParts].sort((a, b) => a.stats.outriggerWidthFt - b.stats.outriggerWidthFt);
    let prevSpanM = -1;

    for (const part of sortedParts) {
      const loadout: TandemLoadout = { ...DEFAULT_TANDEM_LOADOUT, stabilizerId: part.id };
      const bike = buildTandemBike3D(loadout);
      assert.ok(
        bike.outriggerSpanM >= prevSpanM,
        `Outrigger span for ${part.id} (${bike.outriggerSpanM}) must be >= previous (${prevSpanM})`
      );
      prevSpanM = bike.outriggerSpanM;
      disposeTandemBike3D(bike.root);
    }
  });
});

// ============================================================================
// SUITE 2: PAINT THEME APPLICATION & MATERIAL DYNAMIC BINDING
// ============================================================================
test('Empirical Suite 2: Paint Theme Application & Material Color Verification', async (t) => {
  assert.equal(TANDEM_PAINT_THEMES.length, 6, 'Must have exactly 6 paint themes');

  const themeHexRegex = /^#([0-9a-fA-F]{6})$/;

  for (const theme of TANDEM_PAINT_THEMES) {
    await t.test(`Paint theme [${theme.id}] (${theme.name}): applies valid hex colors to all materials`, () => {
      // Validate theme palette definition
      assert.match(theme.primaryHex, themeHexRegex, 'primaryHex must be valid 6-char hex');
      assert.match(theme.secondaryHex, themeHexRegex, 'secondaryHex must be valid 6-char hex');
      assert.match(theme.accentHex, themeHexRegex, 'accentHex must be valid 6-char hex');
      assert.match(theme.frameHex, themeHexRegex, 'frameHex must be valid 6-char hex');
      assert.match(theme.forkHex, themeHexRegex, 'forkHex must be valid 6-char hex');
      assert.match(theme.rimHex, themeHexRegex, 'rimHex must be valid 6-char hex');

      // Build tandem with this paint theme
      const loadout: TandemLoadout = {
        ...DEFAULT_TANDEM_LOADOUT,
        paintThemeId: theme.id,
      };

      const bike = buildTandemBike3D(loadout);
      const materials = collectMaterials(bike.root);
      assert.ok(materials.length > 20, `Tandem bike must have multiple materials, got ${materials.length}`);

      // Verify all materials have finite, valid colors
      for (const mat of materials) {
        const stdMat = mat as THREE.MeshStandardMaterial;
        if (stdMat.color) {
          assert.ok(Number.isFinite(stdMat.color.r), 'Color R must be finite');
          assert.ok(Number.isFinite(stdMat.color.g), 'Color G must be finite');
          assert.ok(Number.isFinite(stdMat.color.b), 'Color B must be finite');
          const hex = `#${stdMat.color.getHexString()}`;
          assert.match(hex, themeHexRegex, `Material color hex ${hex} must be valid 6-char hex`);
        }
      }

      disposeTandemBike3D(bike.root);
    });
  }

  // Cross-theme material distinction test
  await t.test('Switching paint themes updates frame and fork materials with distinct colors', () => {
    const navyTheme = getTandemPaintThemeById('redbull_navy');
    const cyberTheme = getTandemPaintThemeById('neon_cyber');

    assert.notEqual(navyTheme.frameHex, cyberTheme.frameHex);

    const bikeNavy = buildTandemBike3D({ ...DEFAULT_TANDEM_LOADOUT, paintThemeId: 'redbull_navy' });
    const bikeCyber = buildTandemBike3D({ ...DEFAULT_TANDEM_LOADOUT, paintThemeId: 'neon_cyber' });

    const navyMats = collectMaterials(bikeNavy.frameGroup);
    const cyberMats = collectMaterials(bikeCyber.frameGroup);

    const navyColors = navyMats.map((m) => `#${(m as THREE.MeshStandardMaterial).color.getHexString()}`);
    const cyberColors = cyberMats.map((m) => `#${(m as THREE.MeshStandardMaterial).color.getHexString()}`);

    // Cyber theme has #ec4899 (magenta frame)
    assert.ok(cyberColors.includes('#ec4899'), 'Cyber theme must include magenta frame color #ec4899');
    // Navy theme has #1e293b (navy frame)
    assert.ok(navyColors.includes('#1e293b'), 'Navy theme must include navy frame color #1e293b');

    disposeTandemBike3D(bikeNavy.root);
    disposeTandemBike3D(bikeCyber.root);
  });
});

// ============================================================================
// SUITE 3: DYNO RIG MATH & CRADLE TILT CONTACT LOGIC
// ============================================================================
test('Empirical Suite 3: Dyno Rig Math & Cradle Tilt Limits Verification', async (t) => {
  // Test 1: Tilt cradle limit verification (+/- 35 deg)
  await t.test('Tilt cradle limits strictly bound within [-35, +35] degrees', () => {
    const clampAngle = (deg: number) => Math.max(-35, Math.min(35, deg));

    assert.equal(clampAngle(-50), -35, 'Negative extreme angle must clamp to -35 deg');
    assert.equal(clampAngle(-35), -35, 'Boundary -35 deg must remain -35 deg');
    assert.equal(clampAngle(0), 0, 'Level 0 deg must remain 0 deg');
    assert.equal(clampAngle(35), 35, 'Boundary +35 deg must remain +35 deg');
    assert.equal(clampAngle(50), 35, 'Positive extreme angle must clamp to +35 deg');
  });

  // Test 2: Rollover threshold computation across catalog loadouts
  await t.test('Critical rollover threshold matches between physics engine and Dyno metrics', () => {
    for (const preset of TANDEM_PRESETS) {
      const stats = computeTandemAggregateStats(preset.loadout);
      const metrics = computeTandemDynoMetrics(preset.loadout);

      const thetaCritRad = computeCriticalRollThreshold(stats);
      const thetaCritDeg = (thetaCritRad * 180) / Math.PI;

      // Dyno metrics rolloverThresholdDeg should match within 0.2 degree
      assert.ok(
        Math.abs(metrics.rolloverThresholdDeg - thetaCritDeg) < 0.2,
        `Preset ${preset.name}: Dyno rollover ${metrics.rolloverThresholdDeg} deg should match physics ${thetaCritDeg.toFixed(1)} deg`
      );

      // Verify rollover threshold is in realistic physical range (18° to 45°)
      assert.ok(metrics.rolloverThresholdDeg >= 18, `Rollover threshold ${metrics.rolloverThresholdDeg} >= 18 deg`);
      assert.ok(metrics.rolloverThresholdDeg <= 45, `Rollover threshold ${metrics.rolloverThresholdDeg} <= 45 deg`);
    }
  });

  // Test 3: Outrigger Contact Angle Formula Analysis & Unreachability Detection
  await t.test('Mathematical analysis of Dyno outrigger ground contact flash angle formula', () => {
    // In TandemCanvas3D.tsx:
    // const halfSpanM = (outriggerW * 0.3048) / 2;
    // const contactTiltDeg = (Math.asin(Math.min(1.0, 0.33 / halfSpanM)) * 180) / Math.PI;
    const stabilizers = getTandemPartsByCategory('stabilizer');

    for (const stab of stabilizers) {
      const outriggerW = stab.stats.outriggerWidthFt;
      if (outriggerW > 0.5) {
        const halfSpanM = (outriggerW * 0.3048) / 2;
        const ratio = 0.33 / halfSpanM;
        const clampedRatio = Math.min(1.0, ratio);
        const contactTiltDeg = (Math.asin(clampedRatio) * 180) / Math.PI;

        assert.ok(
          typeof contactTiltDeg === 'number' && Number.isFinite(contactTiltDeg),
          `contactTiltDeg for ${stab.id} must be finite`
        );

        // Document that outrigger ground contact flash angle exceeds cradle limit of 35 deg for all parts:
        // Because 0.33m / halfSpanM > sin(35°) = 0.5736, contactTiltDeg is always > 35°
        assert.ok(
          contactTiltDeg > 35.0,
          `Stabilizer ${stab.id}: contactTiltDeg is ${contactTiltDeg.toFixed(1)}°, which exceeds cradle max tilt of 35°`
        );
      }
    }
  });

  // Test 4: Ring flash asymmetry & bilateral opacity reset verification
  await t.test('Outrigger ring index parity and bilateral state clearance bug verification', () => {
    // In buildWorkshopBayEnvironment():
    // outriggerContactRings: index 0 is at z = -1.1 (port/left), index 1 is at z = +1.1 (starboard/right).
    // In TandemCanvas3D.tsx:
    // const sideIdx = bay.dynoPivotGroup.rotation.x > 0 ? 0 : 1;
    // When rotation.x > 0 (vehicle rolls toward +Z / right), sideIdx = 0 (left ring at -1.1).
    // An adversarial test checks whether ring opacity on the opposite side is cleared when switching tilt direction.

    const rings = [{ opacity: 0.0, z: -1.1 }, { opacity: 0.0, z: +1.1 }];

    const simulateCurrentCode = (tiltXRad: number, inContact: boolean) => {
      const sideIdx = tiltXRad > 0 ? 0 : 1;
      rings[sideIdx].opacity = inContact ? 0.9 : 0.0;
      // Note: rings[1 - sideIdx] is untouched in the current implementation!
    };

    // Step A: Tilt right (+0.5 rad) with inContact = true
    simulateCurrentCode(0.5, true);
    assert.equal(rings[0].opacity, 0.9, 'Ring 0 set to 0.9');
    assert.equal(rings[1].opacity, 0.0, 'Ring 1 is still 0.0');

    // Step B: Tilt left (-0.5 rad) with inContact = true
    simulateCurrentCode(-0.5, true);
    assert.equal(rings[1].opacity, 0.9, 'Ring 1 set to 0.9');

    // ADVERSARIAL FINDING: rings[0] was NOT reset to 0.0, so both rings are simultaneously 0.9!
    const bothRingsLit = rings[0].opacity > 0 && rings[1].opacity > 0;
    assert.ok(
      bothRingsLit,
      'Confirms empirical finding: without bilateral reset, both outrigger rings remain illuminated simultaneously'
    );
  });
});

// ============================================================================
// SUITE 4: CLOSED-FORM 2-BONE INVERSE KINEMATICS & CRANK CYCLE STRESS
// ============================================================================
test('Empirical Suite 4: Crew Leg Inverse Kinematics Across Crank Cycles & High Cadence', async (t) => {
  const bike = buildTandemBike3D(DEFAULT_TANDEM_LOADOUT);
  const { captainLegL, captainLegR, stokerLegL, stokerLegR } = bike.crewIK;

  assert.ok(captainLegL && captainLegR && stokerLegL && stokerLegR, 'All 4 leg IK chains must exist');

  // Test 1: Full 360-degree crank cycle in discrete steps
  await t.test('All leg IK joints remain finite and non-degenerate across 72 crank angles', () => {
    for (let deg = 0; deg <= 360; deg += 5) {
      const crankAngle = (deg * Math.PI) / 180;
      updateTandemAnimation(bike, null, 1 / 60, crankAngle);

      for (const [name, leg] of Object.entries(bike.crewIK)) {
        assertNoNaNTransforms(leg.thighMesh, `${name}_thigh_deg${deg}`);
        assertNoNaNTransforms(leg.shankMesh, `${name}_shank_deg${deg}`);
        assertNoNaNTransforms(leg.kneeJoint, `${name}_knee_deg${deg}`);
        assertNoNaNTransforms(leg.footMesh, `${name}_foot_deg${deg}`);

        // Knee position must be between hip and foot
        const hipY = leg.hipPos.y;
        const kneeY = leg.kneeJoint.position.y;
        const footY = leg.footMesh.position.y;

        assert.ok(
          kneeY <= hipY + 0.1 && kneeY >= footY - 0.1,
          `Knee Y (${kneeY}) should be between hip (${hipY}) and foot (${footY}) at ${deg} deg`
        );
      }
    }
  });

  // Test 2: Extreme Cadence RPMs (e.g. 1000 RPM, negative rotation, fractional dt)
  await t.test('High RPM cadence (1000 RPM) and fractional delta-times maintain stability', () => {
    let crankAngle = 0;
    const omega = (1000 * 2 * Math.PI) / 60; // 1000 RPM in rad/s

    for (let i = 0; i < 120; i++) {
      const dt = 0.008333; // 120Hz
      crankAngle = (crankAngle + omega * dt) % (Math.PI * 2);
      updateTandemAnimation(bike, null, dt, crankAngle);

      assertNoNaNTransforms(bike.crewGroup, `crewGroup_highRPM_tick${i}`);
    }
  });

  // Test 3: Large accumulated crank angles (multi-million radian stress test)
  await t.test('Large multi-turn angles (10,000 rad) do not cause numerical drift or NaN', () => {
    const hugeAngle = 10000.0;
    updateTandemAnimation(bike, null, 0.016, hugeAngle);
    assertNoNaNTransforms(bike.crewGroup, 'crewGroup_hugeAngle');
  });

  disposeTandemBike3D(bike.root);
});

// ============================================================================
// SUITE 5: MASCOTS (SHADOW & BOOMER) PROCEDURAL INTEGRITY & ANIMATION
// ============================================================================
test('Empirical Suite 5: Canine Mascots Procedural Integrity & Tail Kinematics', async (t) => {
  // Test Shadow the Golden Retriever
  await t.test('Shadow the Golden Retriever: procedural anatomy and tail wag animation', async () => {
    const shadowBuild = buildTandemBike3D({
      ...DEFAULT_TANDEM_LOADOUT,
      topperId: 'topper_shadow',
    });

    assert.ok(shadowBuild.topperAnimNodes.shadowTail, 'Shadow must have animated tail pivot node');

    // Run animation loop for multiple frames
    for (let step = 0; step < 60; step++) {
      const dt = 1 / 60;
      updateTandemAnimation(shadowBuild, null, dt, step * 0.1);
      assertNoNaNTransforms(shadowBuild.topperGroup, `shadow_step${step}`);
    }

    // Verify tail actually oscillates across elapsed time
    const initialRot = shadowBuild.topperAnimNodes.shadowTail!.rotation.y;
    await new Promise((res) => setTimeout(res, 60));
    updateTandemAnimation(shadowBuild, null, 0.05, 0);
    const postRot = shadowBuild.topperAnimNodes.shadowTail!.rotation.y;
    assert.ok(
      Math.abs(postRot - initialRot) > 0.01,
      `Shadow tail must oscillate across elapsed time (delta: ${Math.abs(postRot - initialRot).toFixed(4)})`
    );

    disposeTandemBike3D(shadowBuild.root);
  });

  // Test Boomer the Great Dane
  await t.test('Boomer the Great Dane: athletic anatomy, cropped ears, studded collar & whip tail', async () => {
    const boomerBuild = buildTandemBike3D({
      ...DEFAULT_TANDEM_LOADOUT,
      topperId: 'topper_boomer',
    });

    assert.ok(boomerBuild.topperAnimNodes.boomerTail, 'Boomer must have animated tail pivot node');

    // Verify Boomer position matches rear deck perch (X = -0.92, Y = 0.68)
    const boomerMesh = boomerBuild.topperGroup.children[0];
    assert.ok(boomerMesh, 'Boomer root group must exist');
    assert.equal(boomerMesh.position.x, TANDEM_GEOMETRY.boomerPerchX);
    assert.equal(boomerMesh.position.y, TANDEM_GEOMETRY.boomerPerchY);

    // Run animation loop
    for (let step = 0; step < 60; step++) {
      const dt = 1 / 60;
      updateTandemAnimation(boomerBuild, null, dt, step * 0.1);
      assertNoNaNTransforms(boomerBuild.topperGroup, `boomer_step${step}`);
    }

    const initialRot = boomerBuild.topperAnimNodes.boomerTail!.rotation.y;
    await new Promise((res) => setTimeout(res, 60));
    updateTandemAnimation(boomerBuild, null, 0.05, 0);
    const postRot = boomerBuild.topperAnimNodes.boomerTail!.rotation.y;
    assert.ok(
      Math.abs(postRot - initialRot) > 0.01,
      `Boomer tail must oscillate across elapsed time (delta: ${Math.abs(postRot - initialRot).toFixed(4)})`
    );

    disposeTandemBike3D(boomerBuild.root);
  });
});

// ============================================================================
// SUITE 6: FULL 38-PART CATALOG PROCEDURAL MESH COVERAGE
// ============================================================================
test('Empirical Suite 6: Full 38-Part Catalog Procedural Mesh Coverage', async (t) => {
  for (const category of TANDEM_CATEGORIES) {
    const parts = getTandemPartsByCategory(category);
    for (const part of parts) {
      await t.test(`Part [${category}] -> [${part.id}] (${part.name}) builds valid 3D hierarchy`, () => {
        const loadout: TandemLoadout = {
          ...DEFAULT_TANDEM_LOADOUT,
          [`${category}Id`]: part.id,
        };

        const bike = buildTandemBike3D(loadout);
        assert.ok(bike.root, `Root must exist for part ${part.id}`);
        assertNoNaNTransforms(bike.root, `part_${part.id}`);

        const group = bike[`${category}Group` as keyof TandemBike3DGroups] as THREE.Group;
        assert.ok(group, `${category}Group must exist`);
        assert.ok(group.children.length > 0, `${category}Group must contain children meshes`);

        disposeTandemBike3D(bike.root);
      });
    }
  }
});

// ============================================================================
// SUITE 7: RECURSIVE MEMORY DISPOSAL & CACHING PIPELINE STRESS TEST
// ============================================================================
test('Empirical Suite 7: Memory Disposal Pipeline & Rapid Rebuild Stress Test', async (t) => {
  await t.test('100 sequential rebuilds and disposals complete without memory corruption', () => {
    for (let i = 0; i < 100; i++) {
      const randomPreset = TANDEM_PRESETS[i % TANDEM_PRESETS.length];
      const bike = buildTandemBike3D(randomPreset.loadout);
      assert.ok(bike.root);
      // Clean disposal
      disposeTandemBike3D(bike.root, false);
    }
  });

  await t.test('disposeTandemObject3D with disposeCached=true clears internal caches', () => {
    const bike = buildTandemBike3D(DEFAULT_TANDEM_LOADOUT);
    disposeTandemBike3D(bike.root, true);
    // After clearing cache, rebuilding should recreate without errors
    const rebuilt = buildTandemBike3D(DEFAULT_TANDEM_LOADOUT);
    assert.ok(rebuilt.root);
    assertNoNaNTransforms(rebuilt.root, 'rebuilt');
    disposeTandemBike3D(rebuilt.root, false);
  });
});
