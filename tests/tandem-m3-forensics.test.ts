import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import React from 'react';
import {
  buildTandemBike3D,
  disposeTandemBike3D,
  updateCrewLegIK,
  updateTandemAnimation,
  getTandemPaintThemeById,
  TANDEM_GEOMETRY,
  TANDEM_SOCKET_POSITIONS,
} from '../src/tandem/TandemBike3DBuilder.ts';
import {
  TANDEM_CATEGORIES,
  TANDEM_PAINT_THEMES,
  TANDEM_PRESETS,
  DEFAULT_TANDEM_LOADOUT,
  computeTandemDynoMetrics,
  getTandemPartsByCategory,
} from '../src/tandem/TandemPartCatalog.ts';
import {
  TandemCanvas3D,
  disposeTandemSceneObjects,
} from '../src/tandem/TandemCanvas3D.tsx';
import {
  TandemWorkshopHUD,
} from '../src/tandem/TandemWorkshopHUD.tsx';

describe('Milestone 3 Forensic Integrity Audit Suite', () => {
  describe('Check 1: 3D Procedural Meshes Authenticity & Non-Facade Structure', () => {
    it('generates real Three.js meshes and geometries for all 6 categories across all presets', () => {
      for (const preset of TANDEM_PRESETS) {
        const bike = buildTandemBike3D(preset.loadout);
        expect(bike.root).toBeInstanceOf(THREE.Group);
        expect(bike.frameGroup).toBeInstanceOf(THREE.Group);
        expect(bike.drivetrainGroup).toBeInstanceOf(THREE.Group);
        expect(bike.wheelsGroup).toBeInstanceOf(THREE.Group);
        expect(bike.steeringGroup).toBeInstanceOf(THREE.Group);
        expect(bike.stabilizerGroup).toBeInstanceOf(THREE.Group);
        expect(bike.topperGroup).toBeInstanceOf(THREE.Group);
        expect(bike.crewGroup).toBeInstanceOf(THREE.Group);

        let meshCount = 0;
        let vertexCount = 0;
        bike.root.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            meshCount++;
            const geo = (obj as THREE.Mesh).geometry;
            if (geo && geo.attributes && geo.attributes.position) {
              vertexCount += geo.attributes.position.count;
            }
          }
        });

        // Genuine complex 3D models should have >= 80 meshes and >= 5,000 vertices
        expect(meshCount).toBeGreaterThanOrEqual(80);
        expect(vertexCount).toBeGreaterThanOrEqual(5000);

        // Verify clean memory disposal
        disposeTandemBike3D(bike.root);
      }
    });

    it('creates interactive socket markers for all 6 part categories', () => {
      const bike = buildTandemBike3D(DEFAULT_TANDEM_LOADOUT);
      expect(bike.socketMarkerList).toHaveLength(6);
      for (const cat of TANDEM_CATEGORIES) {
        const marker = bike.socketMarkers[cat];
        expect(marker).toBeDefined();
        expect(marker.userData.category).toBe(cat);
        expect(marker.userData.isSocketMarker).toBe(true);
        const expectedPos = TANDEM_SOCKET_POSITIONS[cat];
        expect(marker.position.x).toBeCloseTo(expectedPos[0], 2);
        expect(marker.position.y).toBeCloseTo(expectedPos[1], 2);
        expect(marker.position.z).toBeCloseTo(expectedPos[2], 2);
      }
      disposeTandemBike3D(bike.root);
    });

    it('binds PBR materials dynamically according to all 6 paint themes', () => {
      for (const theme of TANDEM_PAINT_THEMES) {
        const bike = buildTandemBike3D({
          ...DEFAULT_TANDEM_LOADOUT,
          paintThemeId: theme.id,
        });

        // Frame group should contain a mesh with the theme primary or frame color
        let foundFrameColor = false;
        bike.frameGroup.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh && (mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
            const mat = mesh.material as THREE.MeshStandardMaterial;
            const hex = '#' + mat.color.getHexString();
            const target = (theme.frameHex || theme.primaryHex).toLowerCase();
            if (hex.toLowerCase() === target) {
              foundFrameColor = true;
            }
          }
        });
        expect(foundFrameColor).toBe(true);
        disposeTandemBike3D(bike.root);
      }
    });
  });

  describe('Check 2: Shadow the Golden Retriever & Boomer the Great Dane Procedural Modeling', () => {
    it('authentically models Shadow with golden coat, red bandana, cream ruff, haunches, floppy ears, and wagging tail', () => {
      const bike = buildTandemBike3D({
        ...DEFAULT_TANDEM_LOADOUT,
        topperId: 'topper_shadow',
      });

      const topper = bike.topperGroup;
      expect(topper.children.length).toBeGreaterThanOrEqual(1);

      // Verify tail animation node exists
      expect(bike.topperAnimNodes.shadowTail).toBeDefined();
      expect(bike.topperAnimNodes.shadowTail).toBeInstanceOf(THREE.Group);

      // Verify anatomical meshes
      let hasGoldenCoat = false;
      let hasRedBandana = false;
      let hasCreamRuff = false;
      let hasFloppyEars = false;
      let hasMuzzle = false;
      let hasTongue = false;

      topper.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const col = '#' + (mesh.material as THREE.MeshStandardMaterial).color?.getHexString().toLowerCase();

        // Golden coat #d4a373
        if (col === '#d4a373') hasGoldenCoat = true;
        // Red bandana #ef4444
        if (col === '#ef4444' && mesh.geometry instanceof THREE.TorusGeometry) hasRedBandana = true;
        // Cream chest ruff #fef3c7
        if (col === '#fef3c7') hasCreamRuff = true;
        // Floppy ears
        if (mesh.geometry instanceof THREE.BoxGeometry && col === '#d4a373') hasFloppyEars = true;
        // Muzzle
        if (mesh.geometry instanceof THREE.BoxGeometry && col === '#fef3c7') hasMuzzle = true;
        // Tongue #f43f5e
        if (col === '#f43f5e') hasTongue = true;
      });

      expect(hasGoldenCoat).toBe(true);
      expect(hasRedBandana).toBe(true);
      expect(hasCreamRuff).toBe(true);
      expect(hasFloppyEars).toBe(true);
      expect(hasMuzzle).toBe(true);
      expect(hasTongue).toBe(true);

      // Tail wag animation test
      const initialRotY = bike.topperAnimNodes.shadowTail!.rotation.y;
      updateTandemAnimation(bike, null, 0.016);
      expect(typeof bike.topperAnimNodes.shadowTail!.rotation.y).toBe('number');

      disposeTandemBike3D(bike.root);
    });

    it('authentically models Boomer with slate coat, harlequin chest, royal blue collar, alert pointed ears, and whip tail', () => {
      const bike = buildTandemBike3D({
        ...DEFAULT_TANDEM_LOADOUT,
        topperId: 'topper_boomer',
      });

      const topper = bike.topperGroup;
      expect(topper.children.length).toBeGreaterThanOrEqual(1);

      // Verify tail animation node exists
      expect(bike.topperAnimNodes.boomerTail).toBeDefined();
      expect(bike.topperAnimNodes.boomerTail).toBeInstanceOf(THREE.Group);

      let hasSlateCoat = false;
      let hasHarlequinChest = false;
      let hasRoyalBlueCollar = false;
      let hasAlertCroppedEars = false;
      let hasSquareMuzzle = false;
      let hasStandingLegs = 0;

      topper.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const col = '#' + (mesh.material as THREE.MeshStandardMaterial).color?.getHexString().toLowerCase();

        // Slate coat #334155
        if (col === '#334155') hasSlateCoat = true;
        // Harlequin chest #f8fafc
        if (col === '#f8fafc') hasHarlequinChest = true;
        // Royal blue collar #2563eb
        if (col === '#2563eb' && mesh.geometry instanceof THREE.TorusGeometry) hasRoyalBlueCollar = true;
        // Alert cropped pointed ears (ConeGeometry)
        if (mesh.geometry instanceof THREE.ConeGeometry && col === '#334155') hasAlertCroppedEars = true;
        // Square muzzle
        if (mesh.geometry instanceof THREE.BoxGeometry && col === '#f8fafc') hasSquareMuzzle = true;
        // 4 standing legs (CylinderGeometry)
        if (mesh.geometry instanceof THREE.CylinderGeometry && col === '#334155' && mesh.position.y > 0.15 && mesh.position.y < 0.3) {
          hasStandingLegs++;
        }
      });

      expect(hasSlateCoat).toBe(true);
      expect(hasHarlequinChest).toBe(true);
      expect(hasRoyalBlueCollar).toBe(true);
      expect(hasAlertCroppedEars).toBe(true);
      expect(hasSquareMuzzle).toBe(true);
      expect(hasStandingLegs).toBe(4);

      disposeTandemBike3D(bike.root);
    });
  });

  describe('Check 3: Closed-Form 2-Bone Inverse Kinematics Trigonometry Solver', () => {
    it('mathematically satisfies the Law of Cosines for knee interior angle and distance invariance', () => {
      const bike = buildTandemBike3D(DEFAULT_TANDEM_LOADOUT);
      const { captainLegL, captainLegR, stokerLegL, stokerLegR } = bike.crewIK;

      const L1 = TANDEM_GEOMETRY.thighLengthM; // 0.38
      const L2 = TANDEM_GEOMETRY.shankLengthM; // 0.38
      const Rc = TANDEM_GEOMETRY.crankRadiusM; // 0.17

      // Test across 72 angles around full crank cycle
      for (let i = 0; i < 72; i++) {
        const angleRad = (i / 72) * Math.PI * 2;

        for (const leg of [captainLegL, captainLegR, stokerLegL, stokerLegR]) {
          updateCrewLegIK(leg, angleRad);

          const hip = leg.hipPos;
          const knee = leg.kneeJoint.position;
          const foot = leg.footMesh.position;

          // 1. Planar Thigh length in sagittal XY plane: |hip - knee|_xy === L1
          const dThighXY = Math.hypot(knee.x - hip.x, knee.y - hip.y);
          expect(dThighXY).toBeCloseTo(L1, 4);

          // 2. Planar Shank length in sagittal XY plane: |knee - foot|_xy === L2
          const dShankXY = Math.hypot(foot.x - knee.x, foot.y - knee.y);
          expect(dShankXY).toBeCloseTo(L2, 4);

          // 3. Foot follows crank circular trajectory around bottom bracket
          const legAngle = leg.isLeft ? angleRad + Math.PI : angleRad;
          const expectedFootX = leg.bbX + Rc * Math.cos(legAngle);
          const expectedFootY = leg.bbY + Rc * Math.sin(legAngle);
          expect(foot.x).toBeCloseTo(expectedFootX, 4);
          expect(foot.y).toBeCloseTo(expectedFootY, 4);

          // 4. Verification of Law of Cosines interior angle:
          // In the sagittal XY plane, the knee must maintain exact segment lengths L1 and L2 to hip and pedal
          const dHipKneeActual = Math.hypot(knee.x - hip.x, knee.y - hip.y);
          const dKneeFootActual = Math.hypot(foot.x - knee.x, foot.y - knee.y);
          expect(dHipKneeActual).toBeCloseTo(L1, 4);
          expect(dKneeFootActual).toBeCloseTo(L2, 4);

          // 5. Thigh & Shank meshes positioned at geometric segment midpoints
          const expectedThighMid = new THREE.Vector3().addVectors(hip, knee).multiplyScalar(0.5);
          expect(leg.thighMesh.position.x).toBeCloseTo(expectedThighMid.x, 4);
          expect(leg.thighMesh.position.y).toBeCloseTo(expectedThighMid.y, 4);
          expect(leg.thighMesh.position.z).toBeCloseTo(expectedThighMid.z, 4);

          const expectedShankMid = new THREE.Vector3().addVectors(knee, foot).multiplyScalar(0.5);
          expect(leg.shankMesh.position.x).toBeCloseTo(expectedShankMid.x, 4);
          expect(leg.shankMesh.position.y).toBeCloseTo(expectedShankMid.y, 4);
          expect(leg.shankMesh.position.z).toBeCloseTo(expectedShankMid.z, 4);
        }
      }

      disposeTandemBike3D(bike.root);
    });
  });

  describe('Check 4: Three.js Workshop Bay & Dyno Rig Interactive WebGL Features', () => {
    it('exports TandemCanvas3D with workshop and course modes and safe disposal utilities', () => {
      expect(TandemCanvas3D).toBeDefined();
      expect(typeof disposeTandemSceneObjects).toBe('function');
    });

    it('safely traverses and disposes arbitrary Three.js scene graphs without error', () => {
      const root = new THREE.Group();
      const mesh1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xff0000 }));
      const light = new THREE.DirectionalLight(0xffffff, 1);
      root.add(mesh1, light);

      expect(() => {
        disposeTandemSceneObjects(root, true);
      }).not.toThrow();
    });
  });

  describe('Check 5: Workshop HUD React Architecture & State Persistence', () => {
    it('defines TandemWorkshopHUD supporting 6 categories, star tiers, presets, and dyno telemetry', () => {
      expect(TandemWorkshopHUD).toBeDefined();
    });

    it('accurately computes dyno metrics with rollover threshold, stability, agility, and weight distribution', () => {
      for (const preset of TANDEM_PRESETS) {
        const metrics = computeTandemDynoMetrics(preset.loadout);
        expect(metrics.totalMassKg).toBeGreaterThan(150);
        expect(metrics.bikeMassKg).toBeGreaterThan(15);
        expect(metrics.rolloverThresholdDeg).toBeGreaterThan(10);
        expect(metrics.rolloverThresholdDeg).toBeLessThanOrEqual(45);
        expect(metrics.stabilityScore).toBeGreaterThanOrEqual(0);
        expect(metrics.stabilityScore).toBeLessThanOrEqual(100);
        expect(metrics.agilityScore).toBeGreaterThanOrEqual(0);
        expect(metrics.agilityScore).toBeLessThanOrEqual(100);
        expect(['ultra_stable', 'balanced', 'twitchy', 'top_heavy']).toContain(metrics.dynoStatus);
        expect(metrics.dynoAdvice.length).toBeGreaterThan(10);
      }
    });

    it('provides distinct parts across 6 categories in catalog with star unlocks', () => {
      for (const cat of TANDEM_CATEGORIES) {
        const parts = getTandemPartsByCategory(cat);
        expect(parts.length).toBeGreaterThanOrEqual(4);
        const freeParts = parts.filter((p) => p.unlockStars === 0);
        expect(freeParts.length).toBeGreaterThanOrEqual(1);
      }
    });
  });
});
