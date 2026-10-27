/**
 * Red Bull Tandem Bike Challenge (Game 4)
 * 3D Canvas, Workshop Bay Environment & Over-Water Course 3D Simulation
 * File: src/tandem/TandemCanvas3D.tsx
 */

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type {
  TandemCategory,
  TandemLoadout,
  TandemDynoMetrics,
  TandemSimState,
} from './types.ts';
import {
  COURSE_LENGTH_FT,
  STANDARD_BEAM_HALF_WIDTH_FT,
  computeCriticalRollThreshold,
  getTrackElevationAtDistance,
  updateSeesawBridgeDynamics,
} from './TandemPhysicsEngine.ts';
import {
  buildTandemBike3D,
  disposeTandemBike3D,
  updateTandemAnimation,
  type TandemBike3DGroups,
} from './TandemBike3DBuilder.ts';
import { soundEngine } from '../audio/SoundEngine.ts';

// ============================================================================
// 1. INTERFACES & CAMERA PRESETS
// ============================================================================

export interface TandemCanvas3DProps {
  mode: 'workshop' | 'course';
  loadout: TandemLoadout;
  metrics: TandemDynoMetrics;
  selectedCategory: TandemCategory;
  dynoActive: boolean;
  dynoTiltAngleDeg?: number;
  dynoSwayAuto?: boolean;
  paused?: boolean;
  simStateRef?: React.MutableRefObject<TandemSimState>;
  bestDistanceFeet?: number;
  bestTimeSec?: number | null;
  onSelectCategory?: (cat: TandemCategory) => void;
  onHudSync?: (snapshot: TandemSimState) => void;
  onRunFinished?: (finalState: TandemSimState) => void;
}

const CATEGORY_CAMERA_PRESETS: Record<
  TandemCategory,
  { yaw: number; pitch: number; radius: number }
> = {
  frame: { yaw: -0.65, pitch: 0.28, radius: 6.2 },
  drivetrain: { yaw: -1.57, pitch: 0.16, radius: 3.8 },
  wheels: { yaw: -0.85, pitch: 0.14, radius: 4.4 },
  steering: { yaw: 0.42, pitch: 0.36, radius: 4.0 },
  stabilizer: { yaw: -2.35, pitch: 0.22, radius: 5.2 },
  topper: { yaw: -0.48, pitch: 0.38, radius: 4.6 },
};

// Metric conversion: 1 ft = 0.3048 m
const FT_TO_M = 0.3048;

// ============================================================================
// 2. RESOURCE DISPOSAL UTILITIES
// ============================================================================

export function disposeTandemSceneObjects(root: THREE.Object3D, disposeRoot = true): void {
  root.traverse((obj) => {
    if (obj === root && !disposeRoot) return;
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          if (!mat) continue;
          const anyMat = mat as unknown as Record<string, unknown>;
          for (const val of Object.values(anyMat)) {
            if (val && typeof val === 'object' && 'isTexture' in val) {
              (val as THREE.Texture).dispose();
            }
          }
          mat.dispose();
        }
      }
    }
    const light = obj as THREE.Light;
    if (light.isLight && light.shadow?.map) {
      light.shadow.map.dispose();
    }
  });
}

// ============================================================================
// 3. WORKSHOP BAY ENVIRONMENT BUILDER
// ============================================================================

interface WorkshopBayScene {
  group: THREE.Group;
  dynoRigBase: THREE.Group;
  dynoPivotGroup: THREE.Group;
  dynoRollers: THREE.Mesh[];
  warningBeaconLights: THREE.Mesh[];
  dynoUnderglowLight: THREE.PointLight;
  balanceArcGroup: THREE.Group;
  balanceNeedle: THREE.Mesh;
  comMarkerGroup: THREE.Group;
  outriggerContactRings: THREE.Mesh[];
}

function buildWorkshopBayEnvironment(): WorkshopBayScene {
  const group = new THREE.Group();
  group.name = 'WorkshopBayGroup';
  const dynoRollers: THREE.Mesh[] = [];
  const warningBeaconLights: THREE.Mesh[] = [];
  const outriggerContactRings: THREE.Mesh[] = [];

  // 1. Concrete Paddock Floor
  const floorGeo = new THREE.PlaneGeometry(36, 36);
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#1e293b'),
    roughness: 0.42,
    metalness: 0.28,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.y = -0.01;
  floor.receiveShadow = true;
  group.add(floor);

  // 2. Center Circular Turntable Platform
  const turntable = new THREE.Mesh(
    new THREE.CylinderGeometry(4.8, 5.1, 0.24, 48),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#0f172a'), roughness: 0.45, metalness: 0.35 })
  );
  turntable.position.y = -0.12;
  turntable.receiveShadow = true;
  group.add(turntable);

  // Safety Hazard Border Ring
  const hazardRingGeo = new THREE.RingGeometry(4.35, 4.75, 48);
  hazardRingGeo.rotateX(-Math.PI / 2);
  const hazardRing = new THREE.Mesh(
    hazardRingGeo,
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#facc15'), side: THREE.DoubleSide })
  );
  hazardRing.position.y = 0.005;
  group.add(hazardRing);

  // Red Bull Roundel Logo Ring
  const logoRingGeo = new THREE.RingGeometry(1.6, 2.6, 48);
  logoRingGeo.rotateX(-Math.PI / 2);
  const logoRing = new THREE.Mesh(
    logoRingGeo,
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#dc2626'), side: THREE.DoubleSide })
  );
  logoRing.position.y = 0.006;
  group.add(logoRing);

  // 3. Fixed Dyno Base Frame
  const dynoRigBase = new THREE.Group();
  dynoRigBase.name = 'DynoRigBase';
  group.add(dynoRigBase);

  const baseFrame = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.14, 0.88),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#0f172a'), roughness: 0.5, metalness: 0.7 })
  );
  baseFrame.position.y = -0.05;
  baseFrame.receiveShadow = true;
  dynoRigBase.add(baseFrame);

  // 4 Corner Safety Warning Strobe Beacons on Dyno Base
  const beaconGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.12, 12);
  [
    [1.25, 0.4],
    [1.25, -0.4],
    [-1.25, 0.4],
    [-1.25, -0.4],
  ].forEach(([bx, bz]) => {
    const beaconMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#ef4444'),
      emissive: new THREE.Color('#dc2626'),
      emissiveIntensity: 0.4,
      roughness: 0.2,
    });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(bx, 0.08, bz);
    dynoRigBase.add(beacon);
    warningBeaconLights.push(beacon);
  });

  // Dyno Neon Underglow Light
  const dynoUnderglowLight = new THREE.PointLight(new THREE.Color('#38bdf8'), 0.85, 4.5);
  dynoUnderglowLight.position.set(0, -0.2, 0);
  dynoRigBase.add(dynoUnderglowLight);

  // 4. Longitudinal Dyno Pivot Cradle (Rotates around X-axis for roll tilt testing)
  const dynoPivotGroup = new THREE.Group();
  dynoPivotGroup.name = 'DynoPivotGroup';
  dynoPivotGroup.position.set(0, 0, 0);
  dynoRigBase.add(dynoPivotGroup);

  // Dual Metal Rollers for Front & Rear wheels
  const rollerGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.44, 24);
  rollerGeo.rotateX(Math.PI / 2);

  const rollerMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#cbd5e1'),
    roughness: 0.16,
    metalness: 0.88,
  });

  [
    [0.79, 0.02, 0],
    [0.97, 0.02, 0],
    [-0.79, 0.02, 0],
    [-0.97, 0.02, 0],
  ].forEach(([rx, ry, rz]) => {
    const roller = new THREE.Mesh(rollerGeo, rollerMat);
    roller.position.set(rx, ry, rz);
    roller.castShadow = true;
    dynoPivotGroup.add(roller);
    dynoRollers.push(roller);
  });

  // Outrigger Ground Contact Flash Rings
  [-1.1, 1.1].forEach((oz) => {
    const ringGeo = new THREE.RingGeometry(0.12, 0.22, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#facc15'), side: THREE.DoubleSide, transparent: true, opacity: 0.0 })
    );
    ring.position.set(-0.65, 0.01, oz);
    group.add(ring);
    outriggerContactRings.push(ring);
  });

  // 5. 3D Balance Arc & Rollover Indicator Gizmo
  const balanceArcGroup = new THREE.Group();
  balanceArcGroup.position.set(-1.45, 0.35, 0);
  dynoPivotGroup.add(balanceArcGroup);

  const arcCurve = new THREE.EllipseCurve(0, 0, 0.72, 0.72, -Math.PI / 4, (5 * Math.PI) / 4, false, 0);
  const arcPoints = arcCurve.getPoints(32).map((p) => new THREE.Vector3(0, p.y + 0.1, p.x));
  const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPoints);
  const arcLine = new THREE.Line(
    arcGeo,
    new THREE.LineBasicMaterial({ color: new THREE.Color('#38bdf8'), linewidth: 2 })
  );
  balanceArcGroup.add(arcLine);

  const needleGeo = new THREE.ConeGeometry(0.04, 0.18, 8);
  needleGeo.rotateX(Math.PI);
  const needleMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#facc15') });
  const balanceNeedle = new THREE.Mesh(needleGeo, needleMat);
  balanceNeedle.position.set(0, 0.85, 0);
  balanceArcGroup.add(balanceNeedle);

  // 6. Center of Mass (CoM) Marker Gizmo
  const comMarkerGroup = new THREE.Group();
  comMarkerGroup.position.set(0, 0.75, 0);
  const comSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 16, 16),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#facc15'),
      emissive: new THREE.Color('#f59e0b'),
      emissiveIntensity: 0.6,
      roughness: 0.3,
    })
  );
  const comPlumbPin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.75, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#facc15'), transparent: true, opacity: 0.75 })
  );
  comPlumbPin.position.y = -0.375;
  comMarkerGroup.add(comSphere, comPlumbPin);
  dynoPivotGroup.add(comMarkerGroup);

  return {
    group,
    dynoRigBase,
    dynoPivotGroup,
    dynoRollers,
    warningBeaconLights,
    dynoUnderglowLight,
    balanceArcGroup,
    balanceNeedle,
    comMarkerGroup,
    outriggerContactRings,
  };
}

// ============================================================================
// 4. OVER-WATER COURSE 3D ENVIRONMENT BUILDER (7 SECTORS & PARTICLES)
// ============================================================================

export interface CourseEnvScene {
  group: THREE.Group;
  waterMesh: THREE.Mesh;
  seesawPivotGroup: THREE.Group;
  finishBellGroup: THREE.Group;
  finishBellMesh: THREE.Mesh;
  finishClapperMesh: THREE.Mesh;
  waterCannonJets: THREE.Mesh[];
  splashGroup: THREE.Group;
  splashDrops: Array<{ mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number }>;
  foamRings: THREE.Mesh[];
  confettiGroup: THREE.Group;
  confettiParticles: Array<{
    mesh: THREE.Mesh;
    vx: number;
    vy: number;
    vz: number;
    rotX: number;
    rotY: number;
    rotZ: number;
  }>;
}

export function buildCourseEnvironment(): CourseEnvScene {
  const group = new THREE.Group();
  group.name = 'CourseEnvGroup';

  // 1. Sparkling Ocean Water Plane with Foam Undulation
  const waterGeo = new THREE.PlaneGeometry(240, 120, 64, 48);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#0284c7'),
    roughness: 0.18,
    metalness: 0.22,
    transparent: true,
    opacity: 0.92,
  });
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.set(30, 0, 0);
  waterMesh.receiveShadow = true;
  group.add(waterMesh);

  // Pilings Material & Factory
  const pilingMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#334155'), roughness: 0.75 });
  const pilingGeo = new THREE.CylinderGeometry(0.12, 0.14, 2.8, 12);
  const addPilingPair = (x: number, halfW: number) => {
    for (const sign of [-1, 1]) {
      const p = new THREE.Mesh(pilingGeo, pilingMat);
      p.position.set(x, 1.22, sign * (halfW + 0.08));
      p.receiveShadow = true;
      group.add(p);
    }
  };

  // 2. Sector 1: Dock Launch Platform (s in [0, 15] ft -> X in [-1.5, 4.572] m)
  const dockDeck = new THREE.Mesh(
    new THREE.BoxGeometry(6.0, 0.20, 1.83),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#78350f'), roughness: 0.65 })
  );
  dockDeck.position.set(1.5, 2.4384 - 0.10, 0);
  dockDeck.receiveShadow = true;
  group.add(dockDeck);
  addPilingPair(-0.5, 0.91);
  addPilingPair(2.0, 0.91);
  addPilingPair(4.2, 0.91);

  // Starter Gantry & Red Bull Banner
  const starterArch = new THREE.Group();
  const archPillarMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1e3a8a'), roughness: 0.35 });
  const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.6), archPillarMat);
  p1.position.set(0.6, 2.44 + 1.8, -1.1);
  const p2 = p1.clone();
  p2.position.z = 1.1;
  const crossBeam = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.4, 2.4),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#dc2626'), roughness: 0.4 })
  );
  crossBeam.position.set(0.6, 2.44 + 3.6, 0);
  starterArch.add(p1, p2, crossBeam);
  group.add(starterArch);

  // 3. Sector 2: Balance Beam 1 (s in [15, 70] ft -> X in [4.572, 21.336] m)
  const beamLen = 21.336 - 4.572;
  const beamDeck = new THREE.Mesh(
    new THREE.BoxGeometry(beamLen, 0.18, 0.9144),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#92400e'), roughness: 0.55 })
  );
  beamDeck.position.set(4.572 + beamLen / 2, 2.4384 - 0.09, 0);
  beamDeck.receiveShadow = true;
  group.add(beamDeck);

  // Hazard border lines along beam rims
  for (let x = 6.0; x <= 20.0; x += 4.5) {
    addPilingPair(x, 0.4572);
  }

  // 4. Sector 3: Rhythm Rollers (s in [70, 100] ft -> X in [21.336, 30.48] m)
  const rollerGroup = new THREE.Group();
  const rollerSteps = 40;
  const rStart = 21.336;
  const rEnd = 30.48;
  const rWidth = 0.9144;
  const rollerGeo = new THREE.BufferGeometry();
  const rollerPos: number[] = [];
  const rollerIdx: number[] = [];

  for (let i = 0; i <= rollerSteps; i++) {
    const frac = i / rollerSteps;
    const x = rStart + frac * (rEnd - rStart);
    const y = 2.4384 + 0.3048 * Math.sin(((x - rStart) / 3.6576) * Math.PI * 2);
    rollerPos.push(x, y, -rWidth / 2);
    rollerPos.push(x, y, rWidth / 2);
    if (i < rollerSteps) {
      const base = i * 2;
      rollerIdx.push(base, base + 1, base + 2);
      rollerIdx.push(base + 1, base + 3, base + 2);
    }
  }
  rollerGeo.setAttribute('position', new THREE.Float32BufferAttribute(rollerPos, 3));
  rollerGeo.setIndex(rollerIdx);
  rollerGeo.computeVertexNormals();
  const rollerMesh = new THREE.Mesh(
    rollerGeo,
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#b45309'), roughness: 0.5, side: THREE.DoubleSide })
  );
  rollerMesh.receiveShadow = true;
  rollerGroup.add(rollerMesh);
  group.add(rollerGroup);

  // Pilings supporting rhythm roller crests
  [22.25, 25.9, 29.55].forEach((rx) => {
    addPilingPair(rx, 0.4572);
  });

  // 5. Sector 4: Tilting Seesaw Bridge (s in [100, 140] ft -> X in [30.48, 42.672] m, fulcrum at 36.576m)
  const fulcrumX = 36.576;
  const seesawPivotGroup = new THREE.Group();
  seesawPivotGroup.position.set(fulcrumX, 2.4384, 0);

  const seesawLen = 12.192;
  const seesawDeck = new THREE.Mesh(
    new THREE.BoxGeometry(seesawLen, 0.16, 0.9144),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#d97706'), roughness: 0.5 })
  );
  seesawDeck.position.set(0, -0.08, 0);
  seesawDeck.receiveShadow = true;
  seesawPivotGroup.add(seesawDeck);
  group.add(seesawPivotGroup);

  // Fulcrum A-Frame Base
  const fulcrumAFrame = new THREE.Mesh(
    new THREE.ConeGeometry(0.65, 2.44, 4),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#1e293b'), roughness: 0.4 })
  );
  fulcrumAFrame.position.set(fulcrumX, 1.22, 0);
  group.add(fulcrumAFrame);

  // 6. Sector 5: Water Cannon Hazard Zone (X around 42.672m)
  const waterCannonJets: THREE.Mesh[] = [];
  const jetMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#7dd3fc'), transparent: true, opacity: 0.7 });
  for (const sign of [-1, 1]) {
    const cannonStand = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 2.6, 8), pilingMat);
    cannonStand.position.set(42.672, 1.3, sign * 2.2);
    group.add(cannonStand);

    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.12, 2.1, 8), jetMat);
    jet.rotation.z = Math.PI / 2;
    jet.position.set(42.672, 2.6, sign * 1.1);
    group.add(jet);
    waterCannonJets.push(jet);
  }

  // 7. Sector 6: Ramp Gap Jump (Takeoff at 48.768m, open air gap to 56.388m)
  const rampTakeoff = new THREE.Mesh(
    new THREE.BoxGeometry(2.438, 0.18, 0.9144),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#ea580c'), roughness: 0.5 })
  );
  rampTakeoff.rotation.z = (12 * Math.PI) / 180;
  rampTakeoff.position.set(48.768 - 1.2, 2.4384 + 0.25, 0);
  group.add(rampTakeoff);

  const rampLanding = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.20, 1.2),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#16a34a'), roughness: 0.6 })
  );
  rampLanding.position.set(56.388 + 1.0, 2.4384 - 0.10, 0);
  group.add(rampLanding);

  // 8. Sector 7: Finish Bell Platform (s in [185, 200] ft -> X in [56.388, 60.96] m)
  const finishDeck = new THREE.Mesh(
    new THREE.BoxGeometry(6.0, 0.20, 1.83),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#1e3a8a'), roughness: 0.6 })
  );
  finishDeck.position.set(59.0, 2.4384 - 0.10, 0);
  finishDeck.receiveShadow = true;
  group.add(finishDeck);

  // Red Bull Grand Finish Arch
  const finishArch = new THREE.Group();
  finishArch.position.set(60.96, 2.4384, 0);
  const archPillar1 = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 4.0), archPillarMat);
  archPillar1.position.set(0, 2.0, -1.25);
  const archPillar2 = archPillar1.clone();
  archPillar2.position.z = 1.25;
  const archCross = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.5, 2.8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#f59e0b'), metalness: 0.7, roughness: 0.2 })
  );
  archCross.position.set(0, 4.0, 0);
  finishArch.add(archPillar1, archPillar2, archCross);

  // Golden Canal Finish Bell
  const finishBellGroup = new THREE.Group();
  finishBellGroup.position.set(0, 3.5, 0);
  const finishBellMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.32, 0.45, 16),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#f59e0b'), metalness: 0.85, roughness: 0.15 })
  );
  const finishClapperMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 8, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#78350f'), metalness: 0.9 })
  );
  finishClapperMesh.position.set(0, -0.22, 0);
  finishBellGroup.add(finishBellMesh, finishClapperMesh);
  finishArch.add(finishBellGroup);
  group.add(finishArch);

  // 9. Floating Distance Buoys in Canal
  const buoyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#f59e0b'), roughness: 0.3 });
  [15.24, 30.48, 45.72, 60.96].forEach((bx) => {
    [-3.2, 3.2].forEach((bz) => {
      const buoy = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 0.8, 12), buoyMat);
      buoy.position.set(bx, 0.15, bz);
      group.add(buoy);
    });
  });

  // 10. Water Splash Droplets & Foam Rings
  const splashGroup = new THREE.Group();
  splashGroup.visible = false;
  const splashDrops: CourseEnvScene['splashDrops'] = [];
  const dropGeo = new THREE.SphereGeometry(0.12, 8, 8);
  const dropMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#f0f9ff') });
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(dropGeo, dropMat);
    m.visible = false;
    splashGroup.add(m);
    splashDrops.push({ mesh: m, vx: 0, vy: 0, vz: 0, life: 0 });
  }

  const foamRings: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const ringGeo = new THREE.RingGeometry(0.6 + i * 0.4, 0.9 + i * 0.45, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMesh = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff'), transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    ringMesh.visible = false;
    splashGroup.add(ringMesh);
    foamRings.push(ringMesh);
  }
  group.add(splashGroup);

  // 11. Celebration Confetti Quads
  const confettiGroup = new THREE.Group();
  confettiGroup.visible = false;
  const confettiParticles: CourseEnvScene['confettiParticles'] = [];
  const confettiColors = ['#f59e0b', '#dc2626', '#1e3a8a', '#06b6d4', '#ffffff'];
  const confGeo = new THREE.PlaneGeometry(0.12, 0.09);
  for (let i = 0; i < 80; i++) {
    const color = confettiColors[i % confettiColors.length];
    const m = new THREE.Mesh(confGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color), side: THREE.DoubleSide }));
    m.visible = false;
    confettiGroup.add(m);
    confettiParticles.push({
      mesh: m,
      vx: 0,
      vy: 0,
      vz: 0,
      rotX: Math.random() * 5,
      rotY: Math.random() * 5,
      rotZ: Math.random() * 5,
    });
  }
  group.add(confettiGroup);

  return {
    group,
    waterMesh,
    seesawPivotGroup,
    finishBellGroup,
    finishBellMesh,
    finishClapperMesh,
    waterCannonJets,
    splashGroup,
    splashDrops,
    foamRings,
    confettiGroup,
    confettiParticles,
  };
}

// ============================================================================
// 5. MAIN TANDEMCANVAS3D COMPONENT
// ============================================================================

export const TandemCanvas3D: React.FC<TandemCanvas3DProps> = React.memo(({
  mode,
  loadout,
  metrics,
  selectedCategory,
  dynoActive,
  dynoTiltAngleDeg = 0,
  dynoSwayAuto = false,
  paused = false,
  simStateRef,
  bestDistanceFeet = 0,
  bestTimeSec = null,
  onSelectCategory,
  onHudSync,
  onRunFinished,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Mutable refs for zero-overhead animation loop
  const modeRef = useRef(mode);
  const loadoutRef = useRef(loadout);
  const metricsRef = useRef(metrics);
  const selectedCatRef = useRef(selectedCategory);
  const dynoActiveRef = useRef(dynoActive);
  const dynoTiltDegRef = useRef(dynoTiltAngleDeg);
  const dynoSwayRef = useRef(dynoSwayAuto);
  const pausedRef = useRef(paused);
  const onSelectCatRef = useRef(onSelectCategory);
  const onHudSyncRef = useRef(onHudSync);
  const onRunFinishedRef = useRef(onRunFinished);

  modeRef.current = mode;
  loadoutRef.current = loadout;
  metricsRef.current = metrics;
  selectedCatRef.current = selectedCategory;
  dynoActiveRef.current = dynoActive;
  dynoTiltDegRef.current = dynoTiltAngleDeg;
  dynoSwayRef.current = dynoSwayAuto;
  pausedRef.current = paused;
  onSelectCatRef.current = onSelectCategory;
  onHudSyncRef.current = onHudSync;
  onRunFinishedRef.current = onRunFinished;

  const sceneRef = useRef<THREE.Scene | null>(null);
  const bikeGroupsRef = useRef<TandemBike3DGroups | null>(null);
  const workshopBayRef = useRef<WorkshopBayScene | null>(null);
  const courseEnvRef = useRef<CourseEnvScene | null>(null);

  const orbitYawRef = useRef<number>(-0.65);
  const orbitPitchRef = useRef<number>(0.28);
  const orbitRadiusRef = useRef<number>(6.2);
  const snapBounceRef = useRef<number>(0);
  const hoveredCategoryRef = useRef<TandemCategory | null>(null);
  const runCamSnappedRef = useRef<boolean>(false);
  const hasTriggeredSplashParticlesRef = useRef<boolean>(false);
  const hasTriggeredConfettiRef = useRef<boolean>(false);

  // Smoothly frame camera on category change in workshop mode
  useEffect(() => {
    if (mode !== 'workshop') return;
    const preset = CATEGORY_CAMERA_PRESETS[selectedCategory];
    if (preset) {
      orbitYawRef.current = preset.yaw;
      orbitPitchRef.current = preset.pitch;
      orbitRadiusRef.current = preset.radius;
    }
  }, [selectedCategory, mode]);

  // Mode transition handling
  useEffect(() => {
    runCamSnappedRef.current = false;
    hasTriggeredSplashParticlesRef.current = false;
    hasTriggeredConfettiRef.current = false;
  }, [mode]);

  // Rebuild procedural 3D tandem bike whenever loadout changes
  useEffect(() => {
    const scene = sceneRef.current;
    const bay = workshopBayRef.current;
    if (!scene || !bay) return;

    if (bikeGroupsRef.current) {
      if (bikeGroupsRef.current.root.parent) {
        bikeGroupsRef.current.root.parent.remove(bikeGroupsRef.current.root);
      }
      disposeTandemBike3D(bikeGroupsRef.current.root);
      bikeGroupsRef.current = null;
    }

    const built = buildTandemBike3D(loadout);
    if (modeRef.current === 'workshop') {
      bay.dynoPivotGroup.add(built.root);
    } else {
      scene.add(built.root);
    }
    bikeGroupsRef.current = built;
    snapBounceRef.current = 1.0;
  }, [loadout]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Scene, Camera, WebGLRenderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0f172a');
    scene.fog = new THREE.FogExp2('#0f172a', 0.008);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      52,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      400
    );

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 2. Lighting Setup
    const hemiLight = new THREE.HemisphereLight('#f8fafc', '#0284c7', 0.75);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight('#fffbeb', 1.65);
    sunLight.position.set(10, 22, 14);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 120;
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.normalBias = 0.02;
    const shadowBound = 6.0;
    sunLight.shadow.camera.left = -shadowBound;
    sunLight.shadow.camera.right = shadowBound;
    sunLight.shadow.camera.top = shadowBound;
    sunLight.shadow.camera.bottom = -shadowBound;
    scene.add(sunLight);
    scene.add(sunLight.target);

    const cyanRim = new THREE.DirectionalLight('#38bdf8', 0.85);
    cyanRim.position.set(-8, 7, -10);
    scene.add(cyanRim);

    const amberFill = new THREE.DirectionalLight('#f59e0b', 0.65);
    amberFill.position.set(8, 8, 8);
    scene.add(amberFill);

    // 3. Workshop Bay Environment
    const bay = buildWorkshopBayEnvironment();
    scene.add(bay.group);
    workshopBayRef.current = bay;

    // 4. Over-Water Course Environment
    const course = buildCourseEnvironment();
    scene.add(course.group);
    courseEnvRef.current = course;

    // Initial 3D Tandem Bike Build
    const initialBuilt = buildTandemBike3D(loadoutRef.current);
    if (modeRef.current === 'workshop') {
      bay.dynoPivotGroup.add(initialBuilt.root);
    } else {
      scene.add(initialBuilt.root);
    }
    bikeGroupsRef.current = initialBuilt;

    // 5. Pointer Orbit, Touch Pinch & Socket Raycasting
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const activePointers = new Map<number, { x: number; y: number }>();
    let prevPinchDist = 0;
    let isDragging = false;
    let downX = 0;
    let downY = 0;
    let prevX = 0;
    let prevY = 0;

    const getPinchDistance = () => {
      const pts = Array.from(activePointers.values());
      if (pts.length < 2) return 0;
      return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (modeRef.current !== 'workshop') return;
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      isDragging = true;
      downX = e.clientX;
      downY = e.clientY;
      prevX = e.clientX;
      prevY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (modeRef.current !== 'workshop') return;
      const existing = activePointers.get(e.pointerId);
      if (existing) {
        existing.x = e.clientX;
        existing.y = e.clientY;
      }
      if (activePointers.size === 2) {
        const dist = getPinchDistance();
        if (prevPinchDist > 0) {
          const delta = prevPinchDist - dist;
          orbitRadiusRef.current = Math.max(3.2, Math.min(11.5, orbitRadiusRef.current + delta * 0.015));
        }
        prevPinchDist = dist;
        return;
      }
      if (!isDragging) {
        if (activePointers.size === 0 && bikeGroupsRef.current) {
          const rect = renderer.domElement.getBoundingClientRect();
          pointerNdc.x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
          pointerNdc.y = -((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
          raycaster.setFromCamera(pointerNdc, camera);
          const hits = raycaster.intersectObjects(bikeGroupsRef.current.socketMarkerList, false);
          const hitCat = hits.length > 0 ? (hits[0].object.userData?.category as TandemCategory) ?? null : null;
          if (hoveredCategoryRef.current !== hitCat) {
            hoveredCategoryRef.current = hitCat;
            container.style.cursor = hitCat ? 'pointer' : '';
          }
        }
        return;
      }
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      prevX = e.clientX;
      prevY = e.clientY;
      orbitYawRef.current -= dx * 0.008;
      orbitPitchRef.current = Math.max(0.06, Math.min(1.52, orbitPitchRef.current + dy * 0.006));
    };

    const onPointerUp = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
      if (activePointers.size < 2) prevPinchDist = 0;
      if (isDragging && modeRef.current === 'workshop' && bikeGroupsRef.current) {
        const moveDist = Math.hypot(e.clientX - downX, e.clientY - downY);
        if (moveDist < 6 && onSelectCatRef.current) {
          const rect = renderer.domElement.getBoundingClientRect();
          pointerNdc.x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
          pointerNdc.y = -((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
          raycaster.setFromCamera(pointerNdc, camera);
          const hits = raycaster.intersectObjects(bikeGroupsRef.current.socketMarkerList, false);
          if (hits.length > 0) {
            const cat = hits[0].object.userData?.category as TandemCategory | undefined;
            if (cat) {
              soundEngine.playSnapPop();
              onSelectCatRef.current(cat);
            }
          }
        }
      }
      isDragging = false;
    };

    const onPointerCancel = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
      prevPinchDist = 0;
      isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      if (modeRef.current !== 'workshop') return;
      e.preventDefault();
      orbitRadiusRef.current = Math.max(
        3.2,
        Math.min(11.5, orbitRadiusRef.current + e.deltaY * 0.0035)
      );
    };

    const domEl = renderer.domElement;
    domEl.addEventListener('pointerdown', onPointerDown);
    domEl.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);

    // 6. Dynamic Resize Handling
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.fov = w / h > 1.9 ? 46 : w < 540 ? 58 : 52;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
    resizeObserver?.observe(container);

    // 7. Main 60Hz/120Hz Animation Loop
    let lastTime = performance.now();
    let rafId = 0;
    const smoothedLookAt = new THREE.Vector3(0, 0.45, 0);
    const desiredCamPos = new THREE.Vector3();

    const animate = (now: number) => {
      rafId = requestAnimationFrame(animate);
      if (pausedRef.current) {
        lastTime = now;
        return;
      }
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const elapsedSec = now * 0.001;

      const craft = bikeGroupsRef.current;
      const currentMode = modeRef.current;
      const curMetrics = metricsRef.current;
      const isDyno = dynoActiveRef.current;

      bay.group.visible = (currentMode === 'workshop');
      course.group.visible = (currentMode === 'course');

      if (!craft) return;

      // Part Swap Snap Pop Animation
      if (snapBounceRef.current > 0.01) {
        snapBounceRef.current *= Math.pow(0.04, dt);
        const s = 1 + Math.sin(snapBounceRef.current * Math.PI * 3) * 0.08 * snapBounceRef.current;
        craft.frameGroup.scale.set(s, s, s);
      } else {
        craft.frameGroup.scale.set(1, 1, 1);
      }

      // ======================================================================
      // WORKSHOP MODE
      // ======================================================================
      if (currentMode === 'workshop') {
        if (craft.root.parent !== bay.dynoPivotGroup) {
          bay.dynoPivotGroup.add(craft.root);
          craft.root.position.set(0, 0, 0);
          craft.root.rotation.set(0, 0, 0);
        }

        scene.fog = new THREE.FogExp2('#0f172a', 0.012);
        sunLight.position.set(10, 22, 14);
        sunLight.target.position.set(0, 0, 0);
        sunLight.target.updateMatrixWorld();

        const r = orbitRadiusRef.current;
        const targetX = Math.sin(orbitYawRef.current) * Math.cos(orbitPitchRef.current) * r;
        const targetY = Math.sin(orbitPitchRef.current) * r + 0.45;
        const targetZ = Math.cos(orbitYawRef.current) * Math.cos(orbitPitchRef.current) * r;
        desiredCamPos.set(targetX, targetY, targetZ);

        const camDamp = 1 - Math.exp(-9 * dt);
        camera.position.lerp(desiredCamPos, camDamp);
        smoothedLookAt.set(0, 0.45, 0);
        camera.lookAt(smoothedLookAt);

        // Interactive Dyno Rig Tilt Mechanics
        const thetaCritRad = computeCriticalRollThreshold(curMetrics.stats);
        const thetaCritDeg = (thetaCritRad * 180) / Math.PI;

        let targetTiltDeg = dynoTiltDegRef.current;
        if (dynoSwayRef.current && isDyno) {
          targetTiltDeg = Math.sin(elapsedSec * 2.2) * 28.0;
        }
        const targetTiltRad = (targetTiltDeg * Math.PI) / 180;

        bay.dynoPivotGroup.rotation.x = THREE.MathUtils.lerp(
          bay.dynoPivotGroup.rotation.x,
          targetTiltRad,
          1 - Math.exp(-12 * dt)
        );

        const currentRollAbsDeg = Math.abs((bay.dynoPivotGroup.rotation.x * 180) / Math.PI);
        const isPastRollover = currentRollAbsDeg >= thetaCritDeg;

        const strobeIntensity = isPastRollover ? 1.2 + Math.sin(elapsedSec * 24) * 0.8 : 0.3;
        bay.warningBeaconLights.forEach((b) => {
          (b.material as THREE.MeshStandardMaterial).emissiveIntensity = strobeIntensity;
        });

        bay.dynoUnderglowLight.color.setHex(isPastRollover ? 0xef4444 : 0x38bdf8);
        bay.dynoUnderglowLight.intensity = isPastRollover ? 1.4 : 0.85;
        bay.balanceNeedle.rotation.z = -bay.dynoPivotGroup.rotation.x;

        // Rollers & Wheel Spin
        let crankAngleRad = 0;
        if (isDyno) {
          const powerW = curMetrics.stats.cadencePowerW;
          const cadenceRpm = 75 + Math.min(45, (powerW / 800) * 45);
          const omegaWheel = (cadenceRpm * 2 * Math.PI) / 60;
          const omegaRoller = omegaWheel * 4.71;
          crankAngleRad = (elapsedSec * omegaWheel) % (Math.PI * 2);

          for (const roller of bay.dynoRollers) {
            roller.rotation.y -= omegaRoller * dt;
          }
          for (const wheel of craft.wheelSpinners) {
            wheel.rotation.z -= omegaWheel * dt;
          }
          for (const crank of craft.crankSpinners) {
            crank.rotation.z -= omegaWheel * dt;
          }
        }

        // Outrigger Ground Contact Flash
        const outriggerW = curMetrics.stats.outriggerWidthFt;
        if (outriggerW > 0.5) {
          const halfSpanM = (outriggerW * 0.3048) / 2;
          const contactTiltDeg = (Math.asin(Math.min(1.0, 0.33 / halfSpanM)) * 180) / Math.PI;
          const inContact = currentRollAbsDeg >= contactTiltDeg;
          const sideIdx = bay.dynoPivotGroup.rotation.x > 0 ? 0 : 1;
          (bay.outriggerContactRings[sideIdx].material as THREE.MeshBasicMaterial).opacity =
            inContact ? 0.9 : 0.0;
        } else {
          bay.outriggerContactRings.forEach((r) => {
            (r.material as THREE.MeshBasicMaterial).opacity = 0.0;
          });
        }

        // Socket Marker Pulsing
        const activeCat = selectedCatRef.current;
        const hoveredCat = hoveredCategoryRef.current;
        craft.socketMarkerList.forEach((marker) => {
          const cat = marker.userData?.category as TandemCategory;
          const isSelected = cat === activeCat;
          const isHovered = cat === hoveredCat;
          const pulse = isSelected
            ? 1.25 + Math.sin(elapsedSec * 6) * 0.15
            : isHovered
            ? 1.15 + Math.sin(elapsedSec * 8) * 0.1
            : 0.85;
          marker.scale.set(pulse, pulse, pulse);
        });

        updateTandemAnimation(craft, null, dt, crankAngleRad);
      }

      // ======================================================================
      // COURSE RUN MODE
      // ======================================================================
      else if (currentMode === 'course') {
        if (craft.root.parent !== scene) {
          scene.add(craft.root);
        }

        scene.fog = new THREE.FogExp2('#bae6fd', 0.0075);

        // Water Wave Animation
        const waterGeo = course.waterMesh.geometry as THREE.BufferGeometry;
        const posAttr = waterGeo.attributes.position;
        if (posAttr) {
          const arr = posAttr.array as Float32Array;
          for (let i = 0; i < posAttr.count; i++) {
            const vx = arr[i * 3];
            const vz = arr[i * 3 + 1];
            arr[i * 3 + 2] =
              Math.sin(vx * 0.35 + elapsedSec * 1.8) * 0.08 +
              Math.cos(vz * 0.45 + elapsedSec * 1.4) * 0.06;
          }
          posAttr.needsUpdate = true;
        }

        // Fetch authoritative simulation state
        const s = simStateRef?.current;
        const distFt = s ? s.distanceFt || 0 : 0;
        const speedMph = s ? s.speedMph || 0 : 0;
        const latFt = s ? s.lateralOffsetFt || 0 : 0;
        const rollRad = s ? s.rollAngleRad || 0 : 0;
        const phase = s ? s.phase : 'riding';

        // 1. Calculate Tandem 3D Coordinates along Pier Track
        const bikeX = distFt * FT_TO_M;
        const isAirborne = Boolean((s as any)?.isAirborne);
        const verticalFt = (s as any)?.verticalHeightFt ?? getTrackElevationAtDistance(distFt);
        const bikeY = (isAirborne ? verticalFt : getTrackElevationAtDistance(distFt)) * FT_TO_M;
        const bikeZ = latFt * FT_TO_M;

        // Position bike
        craft.root.position.set(bikeX, bikeY, bikeZ);

        // Calculate pitch angle on incline / rollers / seesaw
        let pitchRad = 0;
        if (distFt >= 70 && distFt <= 100) {
          // Rhythm Rollers slope derivative
          const k = (2 * Math.PI) / 12;
          const slope = 1.0 * k * Math.cos(((distFt - 70) / 12) * 2 * Math.PI);
          pitchRad = Math.atan(slope);
        } else if (distFt >= 100 && distFt <= 140) {
          const seesawAngle = s?.seesawAngles?.seesaw_1 ?? s?.seesawAngles?.seesaw_bridge_1 ?? updateSeesawBridgeDynamics(distFt);
          pitchRad = -seesawAngle;
        } else if (distFt >= 152 && distFt <= 160) {
          pitchRad = (12 * Math.PI) / 180;
        }

        craft.root.rotation.x = rollRad;
        craft.root.rotation.y = -((s as any)?.steer || 0) * 0.22;
        craft.root.rotation.z = pitchRad;

        // Dynamic Seesaw Bridge Reaction
        const currentSeesawAngle = s?.seesawAngles?.seesaw_1 ?? s?.seesawAngles?.seesaw_bridge_1 ?? updateSeesawBridgeDynamics(distFt);
        course.seesawPivotGroup.rotation.z = -currentSeesawAngle;

        // Water Cannon Hazard Particle Streams
        const isNearCannon = Math.abs(distFt - 140) <= 4.0;
        course.waterCannonJets.forEach((jet) => {
          const pulse = isNearCannon ? 1.0 + Math.sin(elapsedSec * 24) * 0.25 : 0.8;
          jet.scale.set(pulse, 1, pulse);
          (jet.material as THREE.MeshBasicMaterial).opacity = isNearCannon ? 0.9 : 0.6;
        });

        // Golden Canal Finish Bell & Celebration
        if (phase === 'finished' || distFt >= COURSE_LENGTH_FT) {
          const swing = Math.sin(elapsedSec * 16) * 0.35 * Math.exp(-Math.min(3.0, (s?.timeElapsedSec || 0) * 0.2));
          course.finishBellGroup.rotation.z = swing;

          // Celebration Confetti
          course.confettiGroup.visible = true;
          if (!hasTriggeredConfettiRef.current) {
            hasTriggeredConfettiRef.current = true;
            course.confettiParticles.forEach((cp) => {
              cp.mesh.visible = true;
              cp.mesh.position.set(60.96, 3.6, (Math.random() - 0.5) * 2.0);
              cp.vx = (Math.random() - 0.5) * 5.0;
              cp.vy = 4.0 + Math.random() * 4.0;
              cp.vz = (Math.random() - 0.5) * 5.0;
            });
          }
          course.confettiParticles.forEach((cp) => {
            cp.mesh.position.x += cp.vx * dt;
            cp.mesh.position.y += cp.vy * dt;
            cp.mesh.position.z += cp.vz * dt;
            cp.vy -= 9.8 * 0.4 * dt;
            cp.mesh.rotation.x += cp.rotX * dt;
            cp.mesh.rotation.y += cp.rotY * dt;
            cp.mesh.rotation.z += cp.rotZ * dt;
          });
        }

        // Splashdown Particles
        if (phase === 'splashdown') {
          course.splashGroup.visible = true;
          if (!hasTriggeredSplashParticlesRef.current) {
            hasTriggeredSplashParticlesRef.current = true;
            course.splashDrops.forEach((drop, idx) => {
              drop.mesh.visible = true;
              drop.mesh.position.set(bikeX, 0.05, bikeZ);
              const angle = (idx / 40) * Math.PI * 2;
              const spd = 2.4 + (idx % 5) * 0.8;
              drop.vx = Math.cos(angle) * spd;
              drop.vy = 4.2 + (idx % 4) * 0.9;
              drop.vz = Math.sin(angle) * spd;
              drop.life = 1.0;
            });
            course.foamRings.forEach((ring) => {
              ring.visible = true;
              ring.position.set(bikeX, 0.02, bikeZ);
              ring.scale.set(0.5, 0.5, 0.5);
              (ring.material as THREE.MeshBasicMaterial).opacity = 0.85;
            });
          }
          course.splashDrops.forEach((drop) => {
            if (drop.mesh.visible) {
              drop.mesh.position.x += drop.vx * dt;
              drop.mesh.position.y += drop.vy * dt;
              drop.mesh.position.z += drop.vz * dt;
              drop.vy -= 14.5 * dt;
              if (drop.mesh.position.y <= 0.01) {
                drop.mesh.visible = false;
              }
            }
          });
          course.foamRings.forEach((ring) => {
            ring.scale.x += 1.8 * dt;
            ring.scale.y += 1.8 * dt;
            const mat = ring.material as THREE.MeshBasicMaterial;
            mat.opacity = Math.max(0, mat.opacity - 0.45 * dt);
          });
        }

        // Follow Lighting
        sunLight.position.x = bikeX + 15;
        sunLight.target.position.x = bikeX;
        sunLight.target.updateMatrixWorld();

        // 2. Dynamic 3rd-Person Follow Camera & Cinematics
        const targetCamPos = new THREE.Vector3();
        const targetLookAt = new THREE.Vector3();

        if (phase === 'hype') {
          // Low-angle hero orbit
          targetCamPos.set(
            bikeX - 3.8 + Math.cos(elapsedSec * 1.2) * 1.2,
            bikeY + 1.4,
            Math.sin(elapsedSec * 1.2) * 2.2
          );
          targetLookAt.set(bikeX + 0.8, bikeY + 0.5, 0);
        } else if (phase === 'splashdown') {
          // Freeze and pan sideways to framed submerged bike
          targetCamPos.set(bikeX - 2.5, 1.4, Math.sign(bikeZ || 1) * 3.4);
          targetLookAt.set(bikeX, 0.2, bikeZ);
        } else if (phase === 'finished') {
          // Ahead of bike looking back at finish arch
          targetCamPos.set(bikeX + 4.2, bikeY + 1.6, -1.8);
          targetLookAt.set(bikeX, bikeY + 0.8, 0);
        } else {
          // Dynamic chase camera with camera shake
          let shakeY = 0;
          let shakeZ = 0;
          if (distFt >= 70 && distFt <= 100) {
            shakeY = Math.sin(now * 0.032) * 0.035 * Math.min(1.5, speedMph / 15);
          }
          if (isNearCannon) {
            shakeZ = (Math.random() - 0.5) * 0.12;
          }

          targetCamPos.set(
            bikeX - 4.8,
            bikeY + 2.1 + shakeY,
            bikeZ * 0.45 + shakeZ
          );
          targetLookAt.set(
            bikeX + 3.2,
            bikeY + 0.35,
            bikeZ * 0.65
          );
        }

        // Exponential smoothing
        if (!runCamSnappedRef.current) {
          runCamSnappedRef.current = true;
          camera.position.copy(targetCamPos);
          smoothedLookAt.copy(targetLookAt);
        } else {
          const camLerpAlpha = 1 - Math.exp(-9.0 * dt);
          const lookLerpAlpha = 1 - Math.exp(-12.0 * dt);
          camera.position.lerp(targetCamPos, camLerpAlpha);
          smoothedLookAt.lerp(targetLookAt, lookLerpAlpha);
        }
        camera.lookAt(smoothedLookAt);

        // Sprint FOV Expansion
        const isSprinting = Boolean((s as any)?.sprintStamina > 0.02 && speedMph > 16);
        const baseFov = container.clientWidth < 540 ? 58 : 52;
        const targetFov = baseFov + (isSprinting ? 12 : 0) + Math.min(6, (speedMph / 25) * 6);
        camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-6 * dt));
        camera.updateProjectionMatrix();

        // 3D Animation update (cadence leg IK, wheel spin, mascot tails)
        updateTandemAnimation(craft, s || null, dt);
      }

      renderer.render(scene, camera);
    };

    rafId = requestAnimationFrame(animate);

    // Teardown & Clean Resource Disposal
    return () => {
      cancelAnimationFrame(rafId);
      domEl.removeEventListener('pointerdown', onPointerDown);
      domEl.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();

      disposeTandemSceneObjects(scene, true);
      sunLight.shadow.map?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();

      bikeGroupsRef.current = null;
      workshopBayRef.current = null;
      courseEnvRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden touch-none ${
        mode === 'workshop' ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
      }`}
    />
  );
});

export default TandemCanvas3D;
