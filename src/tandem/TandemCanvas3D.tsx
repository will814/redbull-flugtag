/**
 * Red Bull Tandem Bike Challenge (Game 4)
 * Interactive 3D Workshop Bay, Balance Dyno Rig & Multi-Course Over-Water Pier Renderer
 *
 * Implements:
 * 1. Workshop Mode:
 *    - 360-degree spherical orbital camera around the tandem bicycle & 2-person crew
 *    - Raycasted socket markers (3D toruses visible only in Workshop assembly mode)
 *    - Interactive Balance & Cadence Dyno Rig with forward pedaling, tangential rollers,
 *      tilt cradle (-35°..+35°), CoM vector arrow, and bilateral outrigger contact rings
 * 2. Course Mode:
 *    - Parameterized multi-course 3D over-water pier environment (600 FT to 1,200 FT)
 *    - Cohesive per-course sky dome, horizon fog, and true vertical Y-wave ocean surface
 *    - Seamless 3D extruded Rhythm Rollers, zero-teleport Seesaw Bridge with under-deck H-frame
 *      fulcrum, multi-battery Water Cannons, continuous Takeoff Ramp, Z-fight-free Landing/Finish
 *      decks, and 100-FT canal distance buoys
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import type {
  TandemLoadout,
  TandemCategory,
  TandemSimState,
  TandemDynoMetrics,
} from './types.ts';
import {
  buildTandemBike3D,
  updateTandemAnimation,
  TANDEM_GEOMETRY,
  type TandemBike3DGroups,
} from './TandemBike3DBuilder.ts';
import {
  computeTandemDynoMetrics,
  TANDEM_CATEGORIES,
} from './TandemPartCatalog.ts';
import {
  COURSE_LENGTH_FT,
  STANDARD_BEAM_HALF_WIDTH_FT,
  computeCriticalRollThreshold,
  getTrackElevationAtDistance,
  updateSeesawBridgeDynamics,
  evaluatePendulumLateralOffsetFt,
} from './TandemPhysicsEngine.ts';
import {
  DEFAULT_TANDEM_COURSE_ID,
  getTandemCourseById,
  getCourseCenterline,
  type TandemCourseDef,
  type TandemCourseId,
  type TandemCourseObstacleDef,
} from './TandemCourses.ts';
import { soundEngine } from '../audio/SoundEngine.ts';

// ============================================================================
// 1. PROPS & SCENE INTERFACES
// ============================================================================

export interface TandemCanvas3DProps {
  mode: 'workshop' | 'course';
  loadout: TandemLoadout;
  simStateRef?: React.MutableRefObject<TandemSimState>;
  selectedCategory?: TandemCategory;
  onSelectCategory?: (category: TandemCategory) => void;
  dynoMetrics?: TandemDynoMetrics;
  metrics?: TandemDynoMetrics;
  isDynoActive?: boolean;
  dynoActive?: boolean;
  dynoTiltAngleDeg?: number;
  dynoSwayAuto?: boolean;
  bestDistanceFeet?: number;
  bestTimeSec?: number | null;
  onToggleDyno?: (active: boolean) => void;
  courseId?: TandemCourseId;
  paused?: boolean;
}

const FT_TO_M = 0.3048;
const SEESAW_MAX_ANGLE_RAD = (8.5 * Math.PI) / 180;

// ============================================================================
// 2. SAFE SCENE GRAPH MEMORY DISPOSAL UTILITY
// ============================================================================

export function disposeTandemSceneObjects(
  root: THREE.Object3D | null | undefined,
  disposeCached = false
): void {
  if (!root) return;

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
        (mesh as THREE.InstancedMesh).dispose();
      }
      if (mesh.geometry && (disposeCached || !mesh.geometry.userData?.cached)) {
        mesh.geometry.dispose();
      }
      if (mesh.material) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of materials) {
          if (mat && (disposeCached || !mat.userData?.cached)) {
            const stdMat = mat as THREE.MeshStandardMaterial;
            if (stdMat.map) stdMat.map.dispose();
            mat.dispose();
          }
        }
      }
    }
  });
}

// ============================================================================
// 3. PROCEDURAL ENVIRONMENT BUILDERS (WORKSHOP & MULTI-COURSE PIER)
// ============================================================================

interface WorkshopBayScene {
  group: THREE.Group;
  dynoPivotGroup: THREE.Group;
  rollers: THREE.Mesh[];
  comSphere: THREE.Mesh;
  comArrow: THREE.ArrowHelper;
  outriggerContactRings: THREE.Mesh[];
  windParticles: THREE.Points;
}

function buildWorkshopBayEnvironment(): WorkshopBayScene {
  const group = new THREE.Group();
  group.name = 'WorkshopBayGroup';

  // 1. Timber Pier Floor Planks
  const floorGeo = new THREE.BoxGeometry(10.0, 0.2, 8.0);
  const floorMat = new THREE.MeshLambertMaterial({
    color: '#1e293b',
  });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.position.set(0, -0.22, 0);
  floorMesh.receiveShadow = false;
  group.add(floorMesh);

  // Decorative wooden deck slats
  const slatGeo = new THREE.BoxGeometry(0.32, 0.02, 6.4);
  const slatMat = new THREE.MeshLambertMaterial({
    color: '#334155',
  });
  for (let x = -4.2; x <= 4.2; x += 0.42) {
    const slat = new THREE.Mesh(slatGeo, slatMat);
    slat.position.set(x, -0.11, 0);
    slat.receiveShadow = false;
    group.add(slat);
  }

  // 2. Dyno Cradle & Tilt Pivot Group
  const dynoPivotGroup = new THREE.Group();
  dynoPivotGroup.name = 'DynoPivotGroup';
  dynoPivotGroup.position.set(0, 0, 0);

  // Steel Dyno Platform Base (sits below y = 0.00 tire contact point)
  const cradleBaseGeo = new THREE.BoxGeometry(3.1, 0.08, 1.35);
  const cradleBaseMat = new THREE.MeshStandardMaterial({
    color: '#0f172a',
    roughness: 0.35,
    metalness: 0.8,
  });
  const cradleBase = new THREE.Mesh(cradleBaseGeo, cradleBaseMat);
  cradleBase.position.set(0, -0.07, 0);
  cradleBase.receiveShadow = true;
  dynoPivotGroup.add(cradleBase);

  // Neon cyan trim rails on dyno cradle
  const railGeo = new THREE.BoxGeometry(3.12, 0.03, 0.04);
  const railMat = new THREE.MeshBasicMaterial({ color: '#06b6d4' });
  const railL = new THREE.Mesh(railGeo, railMat);
  railL.position.set(0, -0.03, -0.66);
  const railR = new THREE.Mesh(railGeo, railMat);
  railR.position.set(0, -0.03, 0.66);
  dynoPivotGroup.add(railL, railR);

  // 3. Dual Steel Dyno Rollers (tangential to front & rear tires at y = 0.00, no tire clipping!)
  const rollers: THREE.Mesh[] = [];
  const rollerGeo = new THREE.CylinderGeometry(0.052, 0.052, 0.55, 20);
  rollerGeo.rotateX(Math.PI / 2);
  const rollerMat = new THREE.MeshStandardMaterial({
    color: '#cbd5e1',
    roughness: 0.18,
    metalness: 0.92,
  });

  const halfWb = TANDEM_GEOMETRY.wheelbaseM / 2; // 0.90m
  const rollerXPositions = [
    halfWb - 0.13,
    halfWb + 0.13,
    -halfWb - 0.13,
    -halfWb + 0.13,
  ];

  for (const rx of rollerXPositions) {
    const roller = new THREE.Mesh(rollerGeo, rollerMat);
    // Top of roller is at -0.055 + 0.052 = -0.003m, cradling the tire bottom at y = 0.00m
    roller.position.set(rx, -0.055, 0);
    roller.castShadow = true;
    dynoPivotGroup.add(roller);
    rollers.push(roller);
  }

  // 4. Center of Mass (CoM) 3D Indicator & Gravity Vector Arrow
  const comSphereGeo = new THREE.SphereGeometry(0.065, 16, 16);
  const comSphereMat = new THREE.MeshBasicMaterial({
    color: '#facc15',
    transparent: true,
    opacity: 0.9,
  });
  const comSphere = new THREE.Mesh(comSphereGeo, comSphereMat);
  comSphere.position.set(-0.2, 0.68, 0);
  comSphere.visible = false;
  dynoPivotGroup.add(comSphere);

  const comArrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(-0.2, 0.68, 0),
    0.55,
    0xfacc15,
    0.14,
    0.09
  );
  comArrow.visible = false;
  dynoPivotGroup.add(comArrow);

  // 5. Outrigger Ground Contact Indicator Rings (Port & Starboard)
  const outriggerContactRings: THREE.Mesh[] = [];
  const contactRingGeo = new THREE.RingGeometry(0.08, 0.15, 24);
  contactRingGeo.rotateX(-Math.PI / 2);

  for (const side of [-1, 1]) {
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#22c55e',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0,
    });
    const ring = new THREE.Mesh(contactRingGeo, ringMat);
    ring.position.set(-0.65, 0.01, side * 1.1);
    dynoPivotGroup.add(ring);
    outriggerContactRings.push(ring);
  }

  group.add(dynoPivotGroup);

  // 6. Aerodynamic Wind Streamlines (Dyno Wind Tunnel Particles)
  const particleCount = 60;
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 6.0;
    positions[i * 3 + 1] = 0.2 + Math.random() * 1.5;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 2.2;
  }
  const windGeo = new THREE.BufferGeometry();
  windGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const windMat = new THREE.PointsMaterial({
    color: '#38bdf8',
    size: 0.05,
    transparent: true,
    opacity: 0.0,
  });
  const windParticles = new THREE.Points(windGeo, windMat);
  group.add(windParticles);

  // 7. Workshop Overhead Gantry Truss & Banner
  const pillarGeo = new THREE.CylinderGeometry(0.08, 0.08, 3.6, 12);
  const pillarMat = new THREE.MeshStandardMaterial({
    color: '#334155',
    roughness: 0.4,
    metalness: 0.7,
  });
  const pillarL = new THREE.Mesh(pillarGeo, pillarMat);
  pillarL.position.set(-3.2, 1.6, -2.4);
  const pillarR = new THREE.Mesh(pillarGeo, pillarMat);
  pillarR.position.set(3.2, 1.6, -2.4);
  const crossBeam = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.18, 0.18), pillarMat);
  crossBeam.position.set(0, 3.3, -2.4);
  group.add(pillarL, pillarR, crossBeam);

  return {
    group,
    dynoPivotGroup,
    rollers,
    comSphere,
    comArrow,
    outriggerContactRings,
    windParticles,
  };
}

export interface CourseEnvScene {
  group: THREE.Group;
  courseDef: TandemCourseDef;
  seesawPivotYM: number;
  waterMesh: THREE.Mesh;
  seesawPivotGroup: THREE.Group;
  waterCannonJets: THREE.Mesh[];
  extraWaterCannonJets: THREE.Mesh[];
  finishBellGroup: THREE.Group;
  finishBellMesh: THREE.Mesh;
  finishClapperMesh: THREE.Mesh;
  splashGroup: THREE.Group;
  splashDrops: { mesh: THREE.Mesh; vel: THREE.Vector3 }[];
  foamRings: THREE.Mesh[];
  confettiGroup: THREE.Group;
  confettiParticles: { mesh: THREE.Mesh; vel: THREE.Vector3; rotVel: THREE.Vector3 }[];
  swingingPendulums: { buoyPivot: THREE.Group; obs: TandemCourseObstacleDef }[];
  windFlags: THREE.Mesh[];
}

export function buildCourseEnvironment(
  courseId: TandemCourseId = DEFAULT_TANDEM_COURSE_ID
): CourseEnvScene {
  const courseDef = getTandemCourseById(courseId);
  const group = new THREE.Group();
  group.name = 'CourseEnvGroup';

  const totalLenM = courseDef.lengthFt * FT_TO_M;
  const centerXM = totalLenM * 0.5;
  const pierElevationM = 8.0 * FT_TO_M; // 2.4384m

  // 1. Expansive Animated Canal / Ocean Water Plane (spans full length of all courses up to 1,200 FT+)
  const waterSpanXM = Math.max(360, totalLenM + 260);
  const waterSpanZM = 240;
  const waterGeo = new THREE.PlaneGeometry(waterSpanXM, waterSpanZM, 96, 48);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.MeshStandardMaterial({
    color: courseDef.theme.waterHex,
    roughness: 0.16,
    metalness: 0.55,
    transparent: true,
    opacity: 0.88,
  });
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.set(centerXM, 0, 0);
  waterMesh.receiveShadow = false;
  group.add(waterMesh);

  // Deep ocean seabed plane underneath waterMesh so water never shows black void through transparency
  const seabedGeo = new THREE.PlaneGeometry(waterSpanXM + 80, waterSpanZM + 80, 2, 2);
  seabedGeo.rotateX(-Math.PI / 2);
  const seabedMat = new THREE.MeshBasicMaterial({ color: courseDef.theme.waterDeepHex });
  const seabedMesh = new THREE.Mesh(seabedGeo, seabedMat);
  seabedMesh.position.set(centerXM, -2.2, 0);
  group.add(seabedMesh);

  // Shared Materials
  const woodMat = new THREE.MeshStandardMaterial({
    color: courseDef.theme.deckWoodHex,
    roughness: 0.78,
    metalness: 0.08,
  });
  const beamMat = new THREE.MeshStandardMaterial({
    color: courseDef.theme.beamDeckHex,
    roughness: 0.55,
    metalness: 0.12,
    side: THREE.DoubleSide,
  });
  const pilingMat = new THREE.MeshStandardMaterial({
    color: '#451a03',
    roughness: 0.88,
    metalness: 0.05,
  });
  const redBullBlueMat = new THREE.MeshStandardMaterial({
    color: '#1d4ed8',
    roughness: 0.35,
    metalness: 0.45,
  });
  const redBullRedMat = new THREE.MeshStandardMaterial({
    color: '#dc2626',
    roughness: 0.35,
    metalness: 0.45,
  });
  const edgeStripeMat = new THREE.MeshBasicMaterial({
    color: '#ef4444',
    side: THREE.DoubleSide,
  });

  const pilingGeo = new THREE.CylinderGeometry(0.12, 0.14, 4.4, 10);
  const pilingPositions: Array<[number, number, number]> = [];

  // Helper to build a solid 3D extruded ribbon along the curving centerline [startFt, endFt]
  const buildCurvedRibbonGeo = (
    startFt: number,
    endFt: number,
    widthM: number,
    yTopFn: (sFt: number) => number,
    thickM: number,
    zOffsetM = 0
  ): THREE.BufferGeometry => {
    const spanFt = Math.max(1, endFt - startFt);
    const numSteps = Math.max(16, Math.round(spanFt * 0.55));
    const halfW = widthM * 0.5;
    const positions: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i <= numSteps; i++) {
      const frac = i / numSteps;
      const sFt = startFt + frac * spanFt;
      const xM = sFt * FT_TO_M;
      const centerZM = getCourseCenterline(sFt, courseDef.id).zFt * FT_TO_M + zOffsetM;
      const yTopM = yTopFn(sFt);
      const yBotM = yTopM - thickM;

      positions.push(xM, yTopM, centerZM - halfW); // 0: Top-Left
      positions.push(xM, yTopM, centerZM + halfW); // 1: Top-Right
      positions.push(xM, yBotM, centerZM - halfW); // 2: Bot-Left
      positions.push(xM, yBotM, centerZM + halfW); // 3: Bot-Right
    }

    for (let i = 0; i < numSteps; i++) {
      const b0 = i * 4;
      const b1 = (i + 1) * 4;
      // Top surface
      indices.push(b0 + 0, b0 + 1, b1 + 0);
      indices.push(b0 + 1, b1 + 1, b1 + 0);
      // Bottom surface
      indices.push(b0 + 2, b1 + 2, b0 + 3);
      indices.push(b0 + 3, b1 + 2, b1 + 3);
      // Left wall
      indices.push(b0 + 0, b1 + 0, b0 + 2);
      indices.push(b1 + 0, b1 + 2, b0 + 2);
      // Right wall
      indices.push(b0 + 1, b0 + 3, b1 + 1);
      indices.push(b1 + 1, b0 + 3, b1 + 3);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  };

  // Helper to place a solid beam segment from startFt to endFt at elevation 8.0 ft
  const addBeamSegmentFt = (startFt: number, endFt: number, widthM = 0.9144, mat = beamMat) => {
    const segLenM = (endFt - startFt) * FT_TO_M;
    if (segLenM <= 0.01) return;
    const deckHeightM = 0.20;

    const hasCurveOverlap = courseDef.curves.some(
      (c) => c.endFt > startFt && c.startFt < endFt
    );

    if (!hasCurveOverlap) {
      const midXM = ((startFt + endFt) * 0.5) * FT_TO_M;
      const segMesh = new THREE.Mesh(
        new THREE.BoxGeometry(segLenM, deckHeightM, widthM),
        mat
      );
      segMesh.position.set(midXM, pierElevationM - deckHeightM * 0.5, 0);
      segMesh.receiveShadow = true;
      segMesh.castShadow = false;
      group.add(segMesh);

      if (widthM <= 1.2) {
        const stripeGeo = new THREE.BoxGeometry(segLenM, 0.015, 0.045);
        const stripeL = new THREE.Mesh(stripeGeo, edgeStripeMat);
        stripeL.position.set(midXM, pierElevationM + 0.005, -widthM * 0.5 + 0.03);
        const stripeR = new THREE.Mesh(stripeGeo, edgeStripeMat);
        stripeR.position.set(midXM, pierElevationM + 0.005, widthM * 0.5 - 0.03);
        group.add(stripeL, stripeR);
      }
    } else {
      const curvedGeo = buildCurvedRibbonGeo(
        startFt,
        endFt,
        widthM,
        () => pierElevationM,
        deckHeightM,
        0
      );
      const segMesh = new THREE.Mesh(curvedGeo, mat);
      segMesh.receiveShadow = true;
      segMesh.castShadow = false;
      group.add(segMesh);

      if (widthM <= 1.2) {
        const stripeLGeo = buildCurvedRibbonGeo(
          startFt,
          endFt,
          0.045,
          () => pierElevationM + 0.012,
          0.015,
          -widthM * 0.5 + 0.03
        );
        const stripeRGeo = buildCurvedRibbonGeo(
          startFt,
          endFt,
          0.045,
          () => pierElevationM + 0.012,
          0.015,
          widthM * 0.5 - 0.03
        );
        group.add(
          new THREE.Mesh(stripeLGeo, edgeStripeMat),
          new THREE.Mesh(stripeRGeo, edgeStripeMat)
        );
      }
    }

    // Support pilings every 7.5m along the segment following the curving centerline
    const startM = startFt * FT_TO_M;
    const endM = endFt * FT_TO_M;
    for (let px = startM + 2.0; px <= endM - 1.0; px += 7.5) {
      const sFt = px / FT_TO_M;
      const centerZM = getCourseCenterline(sFt, courseDef.id).zFt * FT_TO_M;
      for (const side of [-1, 1]) {
        pilingPositions.push([
          px,
          pierElevationM - deckHeightM - 2.20,
          centerZM + side * (widthM * 0.42),
        ]);
      }
    }
  };

  // 2. Sector 1: Launch Dock Platform (0 to dock.endFt, width 2.44m)
  const dockEndFt = courseDef.sectors[0].endFt;
  addBeamSegmentFt(0, dockEndFt, 2.44, woodMat);

  // Start Archway Banner at x = 1.2m
  const archPillarGeo = new THREE.BoxGeometry(0.24, 3.8, 0.24);
  const archL = new THREE.Mesh(archPillarGeo, redBullBlueMat);
  archL.position.set(1.2, pierElevationM + 1.9, -1.25);
  const archR = new THREE.Mesh(archPillarGeo, redBullBlueMat);
  archR.position.set(1.2, pierElevationM + 1.9, 1.25);
  const archTop = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.55, 2.85), redBullRedMat);
  archTop.position.set(1.2, pierElevationM + 3.8, 0);
  group.add(archL, archR, archTop);

  // 3. Sector 2: Narrow Entry Balance Beam (dockEndFt to rollersStartFt, seamless curved ribbon!)
  addBeamSegmentFt(dockEndFt, courseDef.rollersStartFt, 0.9144, beamMat);

  // 4. Sector 3: Solid 3D Extruded Rhythm Rollers (rollersStartFt to rollersEndFt, curved & undulating)
  const rollerStartM = courseDef.rollersStartFt * FT_TO_M;
  const rollerEndM = courseDef.rollersEndFt * FT_TO_M;
  const rollerWidthM = 0.9144;
  const rollerThickM = 0.22;

  const rollerGeo = buildCurvedRibbonGeo(
    courseDef.rollersStartFt,
    courseDef.rollersEndFt,
    rollerWidthM,
    (sFt) => getTrackElevationAtDistance(sFt, courseDef.id) * FT_TO_M,
    rollerThickM,
    0
  );

  const rollerMat = new THREE.MeshStandardMaterial({
    color: '#f59e0b',
    roughness: 0.48,
    metalness: 0.22,
    side: THREE.DoubleSide,
  });
  const rollerMesh = new THREE.Mesh(rollerGeo, rollerMat);
  rollerMesh.receiveShadow = true;
  rollerMesh.castShadow = true;
  group.add(rollerMesh);

  // Support pilings under Rhythm Rollers (dynamically matched to wave underside & curve centerline)
  for (let px = rollerStartM + 3.0; px <= rollerEndM - 1.5; px += 6.5) {
    const sFt = px / FT_TO_M;
    const localRollerY = getTrackElevationAtDistance(sFt, courseDef.id) * FT_TO_M;
    const centerZM = getCourseCenterline(sFt, courseDef.id).zFt * FT_TO_M;
    for (const side of [-1, 1]) {
      pilingPositions.push([px, localRollerY - rollerThickM - 2.20, centerZM + side * 0.36]);
    }
  }

  // 5. Sector 4: Tilting Seesaw Bridge (with zero-step elevated fulcrum & under-deck H-frame cradle)
  // Fixed approach beam from rollersEndFt to seesawStartFt
  addBeamSegmentFt(courseDef.rollersEndFt, courseDef.seesawStartFt, 0.9144, beamMat);

  const seesawFulcrumXM = courseDef.seesawFulcrumFt * FT_TO_M;
  const seesawLenM = (courseDef.seesawEndFt - courseDef.seesawStartFt) * FT_TO_M;
  // Elevate fulcrum by L_half * sin(8.5°) so entry at +8.5° and exit at -8.5° meet the 8.0-ft pier with ZERO step!
  const seesawPivotYM =
    (8.0 + courseDef.seesawHalfLengthFt * Math.sin(SEESAW_MAX_ANGLE_RAD)) * FT_TO_M;

  const seesawPivotGroup = new THREE.Group();
  seesawPivotGroup.name = 'SeesawPivotGroup';
  seesawPivotGroup.position.set(seesawFulcrumXM, seesawPivotYM, 0);
  seesawPivotGroup.rotation.z = SEESAW_MAX_ANGLE_RAD;

  // Seesaw Plank Deck (children[0] must be BoxGeometry for forensic test contract!)
  const seesawDeckGeo = new THREE.BoxGeometry(seesawLenM, 0.18, 0.92);
  const seesawDeckMat = new THREE.MeshStandardMaterial({
    color: '#fb923c',
    roughness: 0.55,
    metalness: 0.22,
  });
  const seesawDeck = new THREE.Mesh(seesawDeckGeo, seesawDeckMat);
  seesawDeck.position.set(0, -0.09, 0);
  seesawDeck.castShadow = true;
  seesawDeck.receiveShadow = true;
  seesawPivotGroup.add(seesawDeck);

  // Seesaw side guard curbs
  const curbGeo = new THREE.BoxGeometry(seesawLenM, 0.06, 0.05);
  const curbL = new THREE.Mesh(curbGeo, redBullRedMat);
  curbL.position.set(0, 0.03, -0.435);
  const curbR = new THREE.Mesh(curbGeo, redBullRedMat);
  curbR.position.set(0, 0.03, 0.435);
  seesawPivotGroup.add(curbL, curbR);

  group.add(seesawPivotGroup);

  // Under-deck steel H-frame fulcrum support cradle (never pokes through the plank deck!)
  const fulcrumSteelMat = new THREE.MeshStandardMaterial({
    color: '#475569',
    roughness: 0.35,
    metalness: 0.82,
  });
  const fulcrumAxle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.11, 1.35, 16).rotateX(Math.PI / 2),
    fulcrumSteelMat
  );
  fulcrumAxle.position.set(seesawFulcrumXM, seesawPivotYM - 0.18, 0);
  const fulcrumPostGeo = new THREE.CylinderGeometry(0.13, 0.16, seesawPivotYM + 2.2, 12);
  const fulcrumPostL = new THREE.Mesh(fulcrumPostGeo, fulcrumSteelMat);
  fulcrumPostL.position.set(seesawFulcrumXM, (seesawPivotYM - 2.2) * 0.5, -0.60);
  const fulcrumPostR = new THREE.Mesh(fulcrumPostGeo, fulcrumSteelMat);
  fulcrumPostR.position.set(seesawFulcrumXM, (seesawPivotYM - 2.2) * 0.5, 0.60);
  group.add(fulcrumAxle, fulcrumPostL, fulcrumPostR);

  // Fixed beam from seesawEndFt to takeoffRampStartFt (covers post-seesaw and Sector 5 Water Cannon Gauntlet)
  addBeamSegmentFt(courseDef.seesawEndFt, courseDef.takeoffRampStartFt, 0.9144, beamMat);

  // 6. Sector 5: Water Cannon Hazard Batteries (aligned with curved centerline!)
  const waterCannonJets: THREE.Mesh[] = [];
  const extraWaterCannonJets: THREE.Mesh[] = [];
  const cannonNozzleGeo = new THREE.CylinderGeometry(0.14, 0.20, 0.70, 12);
  const cannonNozzleMat = new THREE.MeshStandardMaterial({
    color: '#ef4444',
    roughness: 0.3,
    metalness: 0.7,
  });
  const cannonPedestalGeo = new THREE.CylinderGeometry(0.28, 0.36, 4.3, 12);
  const cannonTurretGeo = new THREE.SphereGeometry(0.25, 12, 12);
  const jetGeo = new THREE.CylinderGeometry(0.24, 0.05, 2.45, 12);

  courseDef.waterCannonStationsFt.forEach((stationFt, stationIdx) => {
    const cannonXM = stationFt * FT_TO_M;
    const cannonCenterZM = getCourseCenterline(stationFt, courseDef.id).zFt * FT_TO_M;
    for (const side of [-1, 1]) {
      const pedestal = new THREE.Mesh(cannonPedestalGeo, fulcrumSteelMat);
      pedestal.position.set(cannonXM, 0.0, cannonCenterZM + side * 2.85);
      const turret = new THREE.Mesh(cannonTurretGeo, fulcrumSteelMat);
      turret.position.set(cannonXM, 2.18, cannonCenterZM + side * 2.85);
      const nozzle = new THREE.Mesh(cannonNozzleGeo, cannonNozzleMat);
      nozzle.position.set(cannonXM, 2.24, cannonCenterZM + side * 2.68);
      nozzle.rotation.x = -side * 1.45;
      group.add(pedestal, turret, nozzle);

      const jetMat = new THREE.MeshBasicMaterial({
        color: '#e0f2fe',
        transparent: true,
        opacity: 0.65,
      });
      const jet = new THREE.Mesh(jetGeo, jetMat);
      jet.position.set(cannonXM, 2.42, cannonCenterZM + side * 1.12);
      jet.rotation.x = -side * 1.45;
      group.add(jet);
      if (stationIdx === 0) {
        waterCannonJets.push(jet);
      } else {
        extraWaterCannonJets.push(jet);
      }
    }
  });

  // 6B. Curve Chevron Warning Signs & 3D Course Obstacles
  const chevronSignGeo = new THREE.BoxGeometry(0.08, 0.42, 0.48);
  const chevronPostGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.15, 8);
  const chevronYellowMat = new THREE.MeshStandardMaterial({
    color: '#facc15',
    roughness: 0.3,
    metalness: 0.2,
    emissive: '#ca8a04',
    emissiveIntensity: 0.25,
  });

  for (const curve of courseDef.curves) {
    const span = curve.endFt - curve.startFt;
    for (const u of [0.22, 0.5, 0.78]) {
      const sFt = curve.startFt + u * span;
      const cl = getCourseCenterline(sFt, courseDef.id);
      if (Math.abs(cl.zFt) < 1.0 && Math.abs(cl.dzDs) < 0.02) continue;
      const outerSide = cl.zFt >= 0 ? 1 : -1;
      const signXM = sFt * FT_TO_M;
      const signYM = getTrackElevationAtDistance(sFt, courseDef.id) * FT_TO_M;
      const signZM = cl.zFt * FT_TO_M + outerSide * 0.72;

      const post = new THREE.Mesh(chevronPostGeo, fulcrumSteelMat);
      post.position.set(signXM, signYM + 0.42, signZM);
      const board = new THREE.Mesh(chevronSignGeo, chevronYellowMat);
      board.position.set(signXM, signYM + 0.88, signZM);
      board.rotation.y = -cl.headingRad;
      group.add(post, board);
    }
  }

  const swingingPendulums: { buoyPivot: THREE.Group; obs: TandemCourseObstacleDef }[] = [];
  const windFlags: THREE.Mesh[] = [];

  const bollardPostGeo = new THREE.CylinderGeometry(0.075, 0.09, 0.78, 12);
  const bollardBaseGeo = new THREE.BoxGeometry(0.32, 0.16, 0.28);
  const bollardBeaconGeo = new THREE.SphereGeometry(0.085, 10, 10);
  const beaconMat = new THREE.MeshBasicMaterial({ color: '#facc15' });
  const whiteStripeMat = new THREE.MeshStandardMaterial({
    color: '#f8fafc',
    roughness: 0.35,
    metalness: 0.15,
  });
  const foamSlickMat = new THREE.MeshStandardMaterial({
    color: '#67e8f9',
    emissive: '#0891b2',
    emissiveIntensity: 0.35,
    roughness: 0.12,
    metalness: 0.25,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide,
  });
  const bubbleGeo = new THREE.SphereGeometry(0.06, 8, 8);
  const boostPadMat = new THREE.MeshBasicMaterial({
    color: '#00f5d4',
    side: THREE.DoubleSide,
  });
  const windFlagGeo = new THREE.ConeGeometry(0.18, 0.75, 10);
  windFlagGeo.rotateZ(-Math.PI / 2);
  const windFlagMat = new THREE.MeshStandardMaterial({
    color: '#f97316',
    roughness: 0.4,
    emissive: '#ea580c',
    emissiveIntensity: 0.2,
  });

  for (const obs of courseDef.obstacles) {
    const obsXM = obs.distanceFt * FT_TO_M;
    const cl = getCourseCenterline(obs.distanceFt, courseDef.id);
    const centerZM = cl.zFt * FT_TO_M;
    const deckYM = getTrackElevationAtDistance(obs.distanceFt, courseDef.id) * FT_TO_M;

    if (obs.type === 'chicane_bollard') {
      const bollardGroup = new THREE.Group();
      const latZM = centerZM + obs.lateralCenterFt * FT_TO_M;
      bollardGroup.position.set(obsXM, deckYM, latZM);
      bollardGroup.rotation.y = -cl.headingRad;

      const base = new THREE.Mesh(bollardBaseGeo, redBullRedMat);
      base.position.set(0, 0.08, 0);
      const post = new THREE.Mesh(bollardPostGeo, redBullRedMat);
      post.position.set(0, 0.42, 0);
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.082, 0.085, 0.22, 12),
        whiteStripeMat
      );
      band.position.set(0, 0.46, 0);
      const beacon = new THREE.Mesh(bollardBeaconGeo, beaconMat);
      beacon.position.set(0, 0.85, 0);

      bollardGroup.add(base, post, band, beacon);
      group.add(bollardGroup);
    } else if (obs.type === 'foam_slick') {
      const sStart = obs.distanceFt - obs.lengthFt * 0.5;
      const sEnd = obs.distanceFt + obs.lengthFt * 0.5;
      const slickGeo = buildCurvedRibbonGeo(
        sStart,
        sEnd,
        0.78,
        (sFt) => getTrackElevationAtDistance(sFt, courseDef.id) * FT_TO_M + 0.016,
        0.012,
        0
      );
      const slickMesh = new THREE.Mesh(slickGeo, foamSlickMat);
      group.add(slickMesh);

      for (let b = 0; b < 6; b++) {
        const bsFt = sStart + ((b + 0.5) / 6) * obs.lengthFt;
        const bCl = getCourseCenterline(bsFt, courseDef.id);
        const bubble = new THREE.Mesh(bubbleGeo, whiteStripeMat);
        const side = b % 2 === 0 ? -1 : 1;
        bubble.position.set(
          bsFt * FT_TO_M,
          getTrackElevationAtDistance(bsFt, courseDef.id) * FT_TO_M + 0.04,
          bCl.zFt * FT_TO_M + side * 0.32
        );
        group.add(bubble);
      }
    } else if (obs.type === 'swing_pendulum') {
      const gantryGroup = new THREE.Group();
      gantryGroup.position.set(obsXM, deckYM, centerZM);
      gantryGroup.rotation.y = -cl.headingRad;

      const legGeo = new THREE.CylinderGeometry(0.07, 0.09, 3.2, 10);
      const legL = new THREE.Mesh(legGeo, fulcrumSteelMat);
      legL.position.set(0, 1.5, -0.78);
      const legR = new THREE.Mesh(legGeo, fulcrumSteelMat);
      legR.position.set(0, 1.5, 0.78);
      const topBar = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.18, 1.75),
        redBullBlueMat
      );
      topBar.position.set(0, 3.05, 0);
      gantryGroup.add(legL, legR, topBar);

      const buoyPivot = new THREE.Group();
      buoyPivot.position.set(0, 3.0, 0);

      const cable = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 2.2, 8),
        fulcrumSteelMat
      );
      cable.position.set(0, -1.1, 0);
      const buoyBall = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 14, 14),
        redBullRedMat
      );
      buoyBall.position.set(0, -2.22, 0);
      const buoyRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.24, 0.045, 8, 16).rotateX(Math.PI / 2),
        beaconMat
      );
      buoyRing.position.set(0, -2.22, 0);

      buoyPivot.add(cable, buoyBall, buoyRing);
      gantryGroup.add(buoyPivot);
      group.add(gantryGroup);
      swingingPendulums.push({ buoyPivot, obs });
    } else if (obs.type === 'wind_gust') {
      for (const side of [-1, 1]) {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.045, 0.055, 2.4, 8),
          fulcrumSteelMat
        );
        pole.position.set(obsXM, deckYM + 1.0, centerZM + side * 0.85);
        const sock = new THREE.Mesh(windFlagGeo, windFlagMat);
        sock.position.set(obsXM, deckYM + 2.1, centerZM + side * 0.85);
        group.add(pole, sock);
        windFlags.push(sock);
      }
    } else if (obs.type === 'boost_pad') {
      const padGroup = new THREE.Group();
      const latZM = centerZM + obs.lateralCenterFt * FT_TO_M;
      padGroup.position.set(obsXM, deckYM + 0.015, latZM);
      padGroup.rotation.y = -cl.headingRad;

      const padStrip = new THREE.Mesh(
        new THREE.BoxGeometry(obs.lengthFt * FT_TO_M, 0.016, obs.halfWidthFt * 2 * FT_TO_M),
        boostPadMat
      );
      padGroup.add(padStrip);
      group.add(padGroup);
    }
  }

  // 7. Sector 6: Continuous Takeoff Kicker Ramp & Gap Jump
  // Build a solid 3D wedge ramp from takeoffRampStartFt (8.0 ft) to gapStartFt (9.45 ft) matching getTrackElevationAtDistance!
  const rampStartM = courseDef.takeoffRampStartFt * FT_TO_M;
  const rampEndM = courseDef.gapStartFt * FT_TO_M;
  const rampYStartM = 8.0 * FT_TO_M;
  const rampYEndM = 9.45 * FT_TO_M;
  const rampThickM = 0.22;
  const rampHalfWM = 0.48;

  const rampVerts = new Float32Array([
    // Left side (-rampHalfWM)
    rampStartM, rampYStartM, -rampHalfWM,               // 0: start top L
    rampEndM,   rampYEndM,   -rampHalfWM,               // 1: end top L
    rampStartM, rampYStartM - rampThickM, -rampHalfWM,  // 2: start bot L
    rampEndM,   rampYStartM - rampThickM, -rampHalfWM,  // 3: end bot L
    // Right side (+rampHalfWM)
    rampStartM, rampYStartM, rampHalfWM,                // 4: start top R
    rampEndM,   rampYEndM,   rampHalfWM,                // 5: end top R
    rampStartM, rampYStartM - rampThickM, rampHalfWM,   // 6: start bot R
    rampEndM,   rampYStartM - rampThickM, rampHalfWM,   // 7: end bot R
  ]);
  const rampIndices = [
    // Top slope
    0, 4, 1, 4, 5, 1,
    // Bottom base
    2, 3, 6, 6, 3, 7,
    // Left wall
    0, 1, 2, 1, 3, 2,
    // Right wall
    4, 6, 5, 5, 6, 7,
    // Back lip at gapStartFt
    1, 5, 3, 5, 7, 3,
  ];
  const rampGeo = new THREE.BufferGeometry();
  rampGeo.setAttribute('position', new THREE.BufferAttribute(rampVerts, 3));
  rampGeo.setIndex(rampIndices);
  rampGeo.computeVertexNormals();
  const rampMat = new THREE.MeshStandardMaterial({
    color: '#f97316',
    roughness: 0.4,
    metalness: 0.25,
    side: THREE.DoubleSide,
  });
  const rampTakeoff = new THREE.Mesh(rampGeo, rampMat);
  rampTakeoff.castShadow = true;
  rampTakeoff.receiveShadow = true;
  group.add(rampTakeoff);

  // Structural support pilings under the Takeoff Ramp lip
  for (const px of [rampStartM + 0.6, rampEndM - 0.35]) {
    for (const side of [-1, 1]) {
      pilingPositions.push([px, rampYStartM - rampThickM - 2.20, side * (rampHalfWM * 0.78)]);
    }
  }

  // Floating Hazard Buoys in the Water Gap (gapStartFt to gapEndFt)
  const buoyGeo = new THREE.TorusGeometry(0.32, 0.10, 10, 20);
  buoyGeo.rotateX(Math.PI / 2);
  const gapMidXM = ((courseDef.gapStartFt + courseDef.gapEndFt) * 0.5) * FT_TO_M;
  for (const offsetM of [-2.4, 0, 2.4]) {
    for (const side of [-1, 1]) {
      const buoy = new THREE.Mesh(buoyGeo, redBullRedMat);
      buoy.position.set(gapMidXM + offsetM, 0.06, side * 1.35);
      group.add(buoy);
    }
  }

  // Post-Gap Landing Runway (from gapEndFt to finishDeckStartFt — strictly non-overlapping with finishDeck!)
  const landingMat = new THREE.MeshStandardMaterial({
    color: '#22c55e',
    roughness: 0.45,
    metalness: 0.2,
  });
  addBeamSegmentFt(courseDef.gapEndFt, courseDef.finishDeckStartFt, 1.15, landingMat);

  // 8. Sector 7: Wide Finish Bell Platform (from finishDeckStartFt to finishBellFt + 12, zero Z-fighting!)
  addBeamSegmentFt(courseDef.finishDeckStartFt, courseDef.finishBellFt + 12, 2.44, redBullBlueMat);

  if (pilingPositions.length > 0) {
    const pilingInst = new THREE.InstancedMesh(pilingGeo, pilingMat, pilingPositions.length);
    const pilingMat4 = new THREE.Matrix4();
    for (let i = 0; i < pilingPositions.length; i++) {
      const [px, py, pz] = pilingPositions[i];
      pilingMat4.makeTranslation(px, py, pz);
      pilingInst.setMatrixAt(i, pilingMat4);
    }
    pilingInst.instanceMatrix.needsUpdate = true;
    group.add(pilingInst);
  }

  // Distance Marker Buoys & Canal Flags every 100 FT along the pier
  const markerPoleGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.6, 8);
  const markerFlagGeo = new THREE.BoxGeometry(0.55, 0.32, 0.04);
  for (let distFt = 100; distFt < courseDef.lengthFt; distFt += 100) {
    const mx = distFt * FT_TO_M;
    const centerZM = getCourseCenterline(distFt, courseDef.id).zFt * FT_TO_M;
    const buoy = new THREE.Mesh(buoyGeo, redBullBlueMat);
    buoy.position.set(mx, 0.06, centerZM - 3.2);
    const pole = new THREE.Mesh(markerPoleGeo, fulcrumSteelMat);
    pole.position.set(mx, 1.3, centerZM - 3.2);
    const flag = new THREE.Mesh(markerFlagGeo, distFt % 200 === 0 ? redBullRedMat : beamMat);
    flag.position.set(mx + 0.25, 2.35, centerZM - 3.2);
    group.add(buoy, pole, flag);
  }

  // Golden Finish Bell Arch at finishBellFt
  const bellXM = courseDef.finishBellFt * FT_TO_M;
  const finishBellGroup = new THREE.Group();
  finishBellGroup.position.set(bellXM, pierElevationM + 2.55, 0);

  const bellArchL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.8, 10), redBullRedMat);
  bellArchL.position.set(0, -1.2, -1.05);
  const bellArchR = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.8, 10), redBullRedMat);
  bellArchR.position.set(0, -1.2, 1.05);
  const bellCrossbar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 2.4), redBullRedMat);
  bellCrossbar.position.set(0, 0.2, 0);
  finishBellGroup.add(bellArchL, bellArchR, bellCrossbar);

  const goldBellMat = new THREE.MeshStandardMaterial({
    color: '#fbbf24',
    roughness: 0.15,
    metalness: 0.92,
  });
  const finishBellMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.38, 0.48, 20),
    goldBellMat
  );
  finishBellMesh.position.set(0, -0.22, 0);
  finishBellMesh.castShadow = true;
  finishBellGroup.add(finishBellMesh);

  const finishClapperMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 10, 10),
    new THREE.MeshStandardMaterial({ color: '#ef4444', roughness: 0.3, metalness: 0.6 })
  );
  finishClapperMesh.position.set(0, -0.48, 0);
  finishBellGroup.add(finishClapperMesh);

  group.add(finishBellGroup);

  // 9. Splashdown Hydro-Burst Particle Pool (40 droplets + 3 expanding foam rings)
  const splashGroup = new THREE.Group();
  splashGroup.visible = false;
  const splashDrops: { mesh: THREE.Mesh; vel: THREE.Vector3 }[] = [];
  const dropGeo = new THREE.SphereGeometry(0.09, 8, 8);
  const dropMat = new THREE.MeshBasicMaterial({
    color: '#e0f2fe',
    transparent: true,
    opacity: 0.9,
  });

  for (let i = 0; i < 40; i++) {
    const mesh = new THREE.Mesh(dropGeo, dropMat);
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 4.5;
    const vel = new THREE.Vector3(
      Math.cos(angle) * speed,
      3.5 + Math.random() * 5.5,
      Math.sin(angle) * speed
    );
    splashGroup.add(mesh);
    splashDrops.push({ mesh, vel });
  }

  const foamRings: THREE.Mesh[] = [];
  const foamGeo = new THREE.RingGeometry(0.3, 0.5, 24);
  foamGeo.rotateX(-Math.PI / 2);
  for (let i = 0; i < 3; i++) {
    const foamMat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const ring = new THREE.Mesh(foamGeo, foamMat);
    ring.position.y = 0.05;
    splashGroup.add(ring);
    foamRings.push(ring);
  }
  group.add(splashGroup);

  // 10. Finish Bell Celebration Confetti Pool (80 particles)
  const confettiGroup = new THREE.Group();
  confettiGroup.position.set(bellXM, pierElevationM + 3.1, 0);
  confettiGroup.visible = false;
  const confettiParticles: { mesh: THREE.Mesh; vel: THREE.Vector3; rotVel: THREE.Vector3 }[] = [];
  const confGeo = new THREE.PlaneGeometry(0.12, 0.08);
  const confColors = ['#ef4444', '#facc15', '#38bdf8', '#4ade80', '#ec4899', '#f97316'];

  for (let i = 0; i < 80; i++) {
    const confMat = new THREE.MeshBasicMaterial({
      color: confColors[i % confColors.length],
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(confGeo, confMat);
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 5.0,
      2.0 + Math.random() * 4.0,
      (Math.random() - 0.5) * 5.0
    );
    const rotVel = new THREE.Vector3(
      Math.random() * 6,
      Math.random() * 6,
      Math.random() * 6
    );
    confettiGroup.add(mesh);
    confettiParticles.push({ mesh, vel, rotVel });
  }
  group.add(confettiGroup);

  return {
    group,
    courseDef,
    seesawPivotYM,
    waterMesh,
    seesawPivotGroup,
    waterCannonJets,
    extraWaterCannonJets,
    finishBellGroup,
    finishBellMesh,
    finishClapperMesh,
    splashGroup,
    splashDrops,
    foamRings,
    confettiGroup,
    confettiParticles,
    swingingPendulums,
    windFlags,
  };
}

// ============================================================================
// 4. MAIN REACT COMPONENT: TandemCanvas3D
// ============================================================================

export const TandemCanvas3D: React.FC<TandemCanvas3DProps> = ({
  mode,
  loadout,
  simStateRef,
  selectedCategory,
  onSelectCategory,
  dynoMetrics: propDynoMetrics,
  metrics: propMetrics,
  isDynoActive: propIsDynoActive,
  dynoActive: propDynoActive,
  dynoTiltAngleDeg: propDynoTiltAngleDeg,
  dynoSwayAuto: propDynoSwayAuto,
  onToggleDyno,
  courseId = DEFAULT_TANDEM_COURSE_ID,
  paused = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const isControlledByWorkshopHud = propDynoActive !== undefined || propDynoTiltAngleDeg !== undefined;

  // Internal Dyno & Camera Controls State
  const [internalDynoActive, setInternalDynoActive] = useState<boolean>(false);
  const isDynoActive =
    propDynoActive !== undefined
      ? propDynoActive
      : propIsDynoActive !== undefined
      ? propIsDynoActive
      : internalDynoActive;

  const [dynoTiltDeg, setDynoTiltDeg] = useState<number>(0);
  const effectiveDynoTiltDeg = propDynoTiltAngleDeg !== undefined ? propDynoTiltAngleDeg : dynoTiltDeg;
  const [dynoAutoSweep, setDynoAutoSweep] = useState<boolean>(false);
  const effectiveDynoAutoSweep = propDynoSwayAuto !== undefined ? propDynoSwayAuto : dynoAutoSweep;
  const [dynoCadenceRpm, setDynoCadenceRpm] = useState<number>(85);
  const [hoveredSocket, setHoveredSocket] = useState<TandemCategory | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  // Derived Dyno Metrics
  const metrics = React.useMemo(
    () => propMetrics || propDynoMetrics || computeTandemDynoMetrics(loadout),
    [propMetrics, propDynoMetrics, loadout]
  );

  const activeCourseDef = React.useMemo(
    () => getTandemCourseById(courseId),
    [courseId]
  );

  // Mutable refs for 60fps animation loop access without re-binding WebGL context
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const courseIdRef = useRef<TandemCourseId>(courseId);
  courseIdRef.current = courseId;

  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const loopControlRef = useRef<{ pause: () => void; resume: () => void } | null>(null);

  useEffect(() => {
    if (paused) {
      loopControlRef.current?.pause();
    } else {
      loopControlRef.current?.resume();
    }
  }, [paused]);

  const isDynoRef = useRef(isDynoActive);
  isDynoRef.current = isDynoActive;

  const dynoTiltDegRef = useRef(effectiveDynoTiltDeg);
  dynoTiltDegRef.current = effectiveDynoTiltDeg;

  const dynoAutoSweepRef = useRef(effectiveDynoAutoSweep);
  dynoAutoSweepRef.current = effectiveDynoAutoSweep;

  const dynoCadenceRpmRef = useRef(dynoCadenceRpm);
  dynoCadenceRpmRef.current = dynoCadenceRpm;

  const selectedCategoryRef = useRef(selectedCategory);
  selectedCategoryRef.current = selectedCategory;

  const onSelectCategoryRef = useRef(onSelectCategory);
  onSelectCategoryRef.current = onSelectCategory;

  const metricsRef = useRef(metrics);
  metricsRef.current = metrics;

  // Spherical Orbit Camera State (Workshop)
  const orbitStateRef = useRef({
    theta: 0.55,
    phi: 1.18,
    radius: 3.5,
    targetTheta: 0.55,
    targetPhi: 1.18,
    targetRadius: 3.5,
    isDragging: false,
    pointerDownX: 0,
    pointerDownY: 0,
    lastX: 0,
    lastY: 0,
  });

  // Three.js Scene Graph Refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const bikeGroupsRef = useRef<TandemBike3DGroups | null>(null);
  const workshopBayRef = useRef<WorkshopBayScene | null>(null);
  const courseEnvRef = useRef<CourseEnvScene | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const snapBounceRef = useRef<number>(0);

  // Course Particle Trigger Trackers
  const hasTriggeredSplashRef = useRef<boolean>(false);
  const splashStartTimeRef = useRef<number>(0);
  const hasTriggeredConfettiRef = useRef<boolean>(false);
  const confettiStartTimeRef = useRef<number>(0);

  const handleToggleDyno = useCallback(() => {
    const next = !isDynoActive;
    if (onToggleDyno) {
      onToggleDyno(next);
    } else {
      setInternalDynoActive(next);
    }
    if (!next) {
      setDynoTiltDeg(0);
      setDynoAutoSweep(false);
    }
    soundEngine.playSnapPop();
  }, [isDynoActive, onToggleDyno]);

  const handleResetCamera = useCallback(() => {
    orbitStateRef.current.targetTheta = 0.55;
    orbitStateRef.current.targetPhi = 1.18;
    orbitStateRef.current.targetRadius = 3.5;
  }, []);

  const handleBehindRidersCamera = useCallback(() => {
    orbitStateRef.current.targetTheta = -Math.PI / 2;
    orbitStateRef.current.targetPhi = 1.15;
    orbitStateRef.current.targetRadius = 3.4;
  }, []);

  // ==========================================================================
  // EFFECT 1: INITIALIZE WEBGL RENDERER, SCENE, LIGHTS & ANIMATION LOOP
  // ==========================================================================
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError('WebGL context unavailable in this browser environment.');
      return;
    }

    const width = container.clientWidth || window.innerWidth || 1024;
    const height = container.clientHeight || window.innerHeight || 768;
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Scene & Fog
    const scene = new THREE.Scene();
    const bgColor = new THREE.Color('#0f172a');
    const sceneFog = new THREE.FogExp2('#0f172a', 0.015);
    scene.background = bgColor;
    scene.fog = sceneFog;
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 450);
    camera.position.set(2.2, 1.6, 3.2);
    cameraRef.current = camera;

    // Lights
    const ambientLight = new THREE.AmbientLight('#f8fafc', 0.78);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    const hemiLight = new THREE.HemisphereLight('#bae6fd', '#1e293b', 0.65);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight('#fffbeb', 1.85);
    dirLight.position.set(8, 16, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 512;
    dirLight.shadow.mapSize.height = 512;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 65;
    const d = 9;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    scene.add(dirLight);
    scene.add(dirLight.target);
    dirLightRef.current = dirLight;

    // Build Environments
    const workshopBay = buildWorkshopBayEnvironment();
    scene.add(workshopBay.group);
    workshopBayRef.current = workshopBay;

    const courseEnv = buildCourseEnvironment(courseIdRef.current);
    courseEnv.group.visible = false;
    scene.add(courseEnv.group);
    courseEnvRef.current = courseEnv;

    // Build initial Tandem Bike
    const initialBike = buildTandemBike3D(loadout);
    workshopBay.dynoPivotGroup.add(initialBike.root);
    bikeGroupsRef.current = initialBike;

    // Raycaster for Socket Selection
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();

    const getCanvasRelativeCoords = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      const y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
      return { x, y };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (modeRef.current !== 'workshop') return;
      orbitStateRef.current.isDragging = true;
      orbitStateRef.current.pointerDownX = e.clientX;
      orbitStateRef.current.pointerDownY = e.clientY;
      orbitStateRef.current.lastX = e.clientX;
      orbitStateRef.current.lastY = e.clientY;
    };

    let currentHoveredSocket: TandemCategory | null = null;
    const setHoveredSocketIfChanged = (next: TandemCategory | null) => {
      if (currentHoveredSocket !== next) {
        currentHoveredSocket = next;
        setHoveredSocket(next);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (modeRef.current !== 'workshop') return;

      if (orbitStateRef.current.isDragging) {
        const dx = e.clientX - orbitStateRef.current.lastX;
        const dy = e.clientY - orbitStateRef.current.lastY;
        orbitStateRef.current.lastX = e.clientX;
        orbitStateRef.current.lastY = e.clientY;

        orbitStateRef.current.targetTheta -= dx * 0.008;
        orbitStateRef.current.targetPhi = Math.max(
          0.35,
          Math.min(1.48, orbitStateRef.current.targetPhi - dy * 0.007)
        );
        return;
      }

      if (e.target !== renderer.domElement) {
        setHoveredSocketIfChanged(null);
        return;
      }

      if (bikeGroupsRef.current && !isDynoRef.current) {
        const coords = getCanvasRelativeCoords(e.clientX, e.clientY);
        pointerNdc.set(coords.x, coords.y);
        raycaster.setFromCamera(pointerNdc, camera);
        const hits = raycaster.intersectObjects(bikeGroupsRef.current.socketMarkerList, false);
        if (hits.length > 0) {
          const cat = hits[0].object.userData?.category as TandemCategory | undefined;
          setHoveredSocketIfChanged(cat || null);
          if (renderer.domElement.style.cursor !== 'pointer') {
            renderer.domElement.style.cursor = 'pointer';
          }
        } else {
          setHoveredSocketIfChanged(null);
          if (renderer.domElement.style.cursor !== 'grab') {
            renderer.domElement.style.cursor = 'grab';
          }
        }
      } else {
        setHoveredSocketIfChanged(null);
        if (renderer.domElement.style.cursor !== 'grab') {
          renderer.domElement.style.cursor = 'grab';
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (modeRef.current !== 'workshop') return;
      const moveDist = Math.hypot(
        e.clientX - orbitStateRef.current.pointerDownX,
        e.clientY - orbitStateRef.current.pointerDownY
      );
      orbitStateRef.current.isDragging = false;

      if (moveDist < 6 && bikeGroupsRef.current && !isDynoRef.current && e.target === renderer.domElement) {
        const coords = getCanvasRelativeCoords(e.clientX, e.clientY);
        pointerNdc.set(coords.x, coords.y);
        raycaster.setFromCamera(pointerNdc, camera);
        const hits = raycaster.intersectObjects(bikeGroupsRef.current.socketMarkerList, false);
        if (hits.length > 0) {
          const cat = hits[0].object.userData?.category as TandemCategory | undefined;
          if (cat && onSelectCategoryRef.current) {
            onSelectCategoryRef.current(cat);
            soundEngine.playSnapPop();
          }
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (modeRef.current !== 'workshop') return;
      e.preventDefault();
      orbitStateRef.current.targetRadius = Math.max(
        2.0,
        Math.min(6.2, orbitStateRef.current.targetRadius + e.deltaY * 0.0025)
      );
    };

    const domEl = renderer.domElement;
    domEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    domEl.addEventListener('wheel', onWheel, { passive: false });

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // Animation Loop
    let animFrameId = 0;
    let lastTimeMs = performance.now();
    let elapsedSec = 0;
    let lastSceneMode: 'workshop' | 'course' | null = null;
    let lastSceneCourseId: TandemCourseId | null = null;
    let lastSnapBikeX = Number.NaN;
    let lastSnapBikeY = Number.NaN;
    let shouldSnapCourseCamera = true;

    const waterSinX = new Float32Array(97);
    const tempWorkshopLook = new THREE.Vector3(0, 0.58, 0);
    const tempCamTargetPos = new THREE.Vector3();
    const tempCourseLook = new THREE.Vector3();
    const tempComColor = new THREE.Color();

    const animate = (nowMs: number) => {
      if (pausedRef.current) {
        animFrameId = 0;
        return;
      }
      animFrameId = requestAnimationFrame(animate);
      const dt = Math.min(0.05, Math.max(0.001, (nowMs - lastTimeMs) / 1000));
      lastTimeMs = nowMs;
      elapsedSec += dt;

      const currentMode = modeRef.current;
      const currentCourseId = courseIdRef.current;
      const craft = bikeGroupsRef.current;
      const bay = workshopBayRef.current;
      let course = courseEnvRef.current;

      if (!craft || !bay || !course) return;

      // Rebuild course environment if courseId changed
      if (course.courseDef.id !== currentCourseId) {
        if (craft.root.parent === course.group) {
          course.group.remove(craft.root);
        }
        scene.remove(course.group);
        disposeTandemSceneObjects(course.group, false);
        const nextCourse = buildCourseEnvironment(currentCourseId);
        nextCourse.group.visible = currentMode === 'course';
        scene.add(nextCourse.group);
        courseEnvRef.current = nextCourse;
        course = nextCourse;
        lastSceneCourseId = null; // Force atmosphere refresh below
      }

      // Update scene background, fog, and sun lighting ONLY when mode or course changes
      if (lastSceneMode !== currentMode || lastSceneCourseId !== currentCourseId) {
        lastSceneMode = currentMode;
        lastSceneCourseId = currentCourseId;
        if (currentMode === 'workshop') {
          bgColor.set('#0f172a');
          sceneFog.color.set('#0f172a');
          sceneFog.density = 0.015;
          if (dirLightRef.current) {
            dirLightRef.current.color.set('#fffbeb');
            dirLightRef.current.intensity = 1.85;
            dirLightRef.current.position.set(8, 16, 10);
            dirLightRef.current.target.position.set(0, 0, 0);
            dirLightRef.current.target.updateMatrixWorld();
            lastSnapBikeX = Number.NaN;
            lastSnapBikeY = Number.NaN;
          }
          if (ambientLightRef.current) {
            ambientLightRef.current.intensity = 0.78;
          }
        } else {
          shouldSnapCourseCamera = true;
          const theme = course.courseDef.theme;
          bgColor.set(theme.skyHorizonHex);
          sceneFog.color.set(theme.fogHex);
          sceneFog.density = theme.fogDensity;
          if (dirLightRef.current) {
            dirLightRef.current.color.set(theme.sunColorHex);
            dirLightRef.current.intensity = theme.sunIntensity;
          }
          if (ambientLightRef.current) {
            ambientLightRef.current.intensity = theme.ambientIntensity;
          }
        }
      }

      // Part swap scale bounce effect on entire craft.root (never detaching frameGroup!)
      if (snapBounceRef.current > 0.001) {
        snapBounceRef.current = Math.max(0, snapBounceRef.current - dt * 6.0);
        const s = 1.0 + Math.sin(snapBounceRef.current * Math.PI) * 0.05;
        craft.root.scale.set(s, s, s);
      } else {
        craft.root.scale.set(1, 1, 1);
      }

      // Toggle socket markers visibility: ONLY visible in Workshop assembly mode (hidden in Dyno & Course!)
      const showSocketMarkers = currentMode === 'workshop' && !isDynoRef.current;
      const activeCat = selectedCategoryRef.current;
      craft.socketMarkerList.forEach((marker, idx) => {
        marker.visible = showSocketMarkers;
        if (showSocketMarkers) {
          const isSelected = marker.userData?.category === activeCat;
          const pulse = isSelected
            ? 1.22 + Math.sin(elapsedSec * 6.0) * 0.14
            : 1.0 + Math.sin(elapsedSec * 3.0 + idx) * 0.07;
          marker.scale.set(pulse, pulse, pulse);
          const mat = marker.material as THREE.MeshBasicMaterial;
          if (mat && mat.color) {
            mat.color.set(isSelected ? '#facc15' : '#38bdf8');
            mat.opacity = isSelected ? 0.95 : 0.72;
          }
        }
      });

      // ======================================================================
      // MODE A: WORKSHOP BAY & DYNO RIG
      // ======================================================================
      if (currentMode === 'workshop') {
        bay.group.visible = true;
        course.group.visible = false;

        if (craft.root.parent !== bay.dynoPivotGroup) {
          bay.dynoPivotGroup.add(craft.root);
          craft.root.position.set(0, 0, 0);
          craft.root.rotation.order = 'XYZ';
          craft.root.rotation.set(0, 0, 0);
          if (craft.frontSteerNode) {
            craft.frontSteerNode.rotation.y = 0;
          }
        }

        // Smooth Spherical Orbit Camera Interpolation
        const orb = orbitStateRef.current;
        orb.theta += (orb.targetTheta - orb.theta) * Math.min(1, dt * 10);
        orb.phi += (orb.targetPhi - orb.phi) * Math.min(1, dt * 10);
        orb.radius += (orb.targetRadius - orb.radius) * Math.min(1, dt * 10);

        camera.position.x = tempWorkshopLook.x + orb.radius * Math.sin(orb.phi) * Math.sin(orb.theta);
        camera.position.y = tempWorkshopLook.y + orb.radius * Math.cos(orb.phi);
        camera.position.z = tempWorkshopLook.z + orb.radius * Math.sin(orb.phi) * Math.cos(orb.theta);
        camera.lookAt(tempWorkshopLook);

        const isDyno = isDynoRef.current;
        const hasManualTilt = Math.abs(dynoTiltDegRef.current) > 0.05;
        const curMetrics = metricsRef.current;

        if (isDyno || hasManualTilt) {
          let tiltDeg = dynoTiltDegRef.current;
          if (dynoAutoSweepRef.current) {
            tiltDeg = Math.sin(elapsedSec * 1.6) * 32.0;
          }
          const tiltRad = (tiltDeg * Math.PI) / 180;
          bay.dynoPivotGroup.rotation.x = THREE.MathUtils.lerp(
            bay.dynoPivotGroup.rotation.x,
            tiltRad,
            Math.min(1, dt * 12)
          );

          // Forward pedaling (negative Z rotation = clockwise in right-handed +Z view)
          const rpm = isDyno ? dynoCadenceRpmRef.current : 35;
          const omegaWheel = (rpm / 60) * Math.PI * 2;
          for (const roller of bay.rollers) {
            roller.rotation.z += omegaWheel * dt * 2.5;
          }

          const crankAngleRad = -((elapsedSec * omegaWheel) % (Math.PI * 2));
          updateTandemAnimation(craft, null, dt, crankAngleRad);
          for (const wheel of craft.wheelSpinners) {
            wheel.rotation.z -= omegaWheel * dt * 1.4;
          }
          for (const crank of craft.crankSpinners) {
            crank.rotation.z = crankAngleRad;
          }

          // CoM Indicator & Rollover Alert Color
          bay.comSphere.visible = true;
          bay.comArrow.visible = true;
          const absTiltDeg = Math.abs((bay.dynoPivotGroup.rotation.x * 180) / Math.PI);
          const rolloverDeg = curMetrics.rolloverThresholdDeg;
          const isExceeding = absTiltDeg >= rolloverDeg;
          const isWarning = absTiltDeg >= rolloverDeg * 0.75;

          const comColor = isExceeding ? 0xef4444 : isWarning ? 0xf97316 : 0x22c55e;
          (bay.comSphere.material as THREE.MeshBasicMaterial).color.setHex(comColor);
          tempComColor.setHex(comColor);
          bay.comArrow.setColor(tempComColor);

          // Bilateral reset + active side outrigger contact ring illumination
          const outriggerW = curMetrics.stats.outriggerWidthFt;
          const halfSpanM = (outriggerW * FT_TO_M) / 2;
          bay.outriggerContactRings[0].position.z = -Math.max(0.35, halfSpanM);
          bay.outriggerContactRings[1].position.z = Math.max(0.35, halfSpanM);
          (bay.outriggerContactRings[0].material as THREE.MeshBasicMaterial).opacity = 0.0;
          (bay.outriggerContactRings[1].material as THREE.MeshBasicMaterial).opacity = 0.0;

          if (outriggerW > 0.2 && absTiltDeg >= rolloverDeg * 0.72) {
            const sideIdx = bay.dynoPivotGroup.rotation.x > 0 ? 1 : 0;
            const ringMat = bay.outriggerContactRings[sideIdx].material as THREE.MeshBasicMaterial;
            ringMat.color.setHex(isExceeding ? 0xef4444 : 0x22c55e);
            ringMat.opacity = 0.88;
          }

          // Wind tunnel streamlines (active when full Dyno rig is running)
          const windMat = bay.windParticles.material as THREE.PointsMaterial;
          windMat.opacity = isDyno ? 0.55 : 0.15;
          const posAttr = bay.windParticles.geometry.getAttribute('position') as THREE.BufferAttribute;
          const arr = posAttr.array as Float32Array;
          for (let i = 0; i < arr.length; i += 3) {
            arr[i] -= dt * (4.0 + rpm * 0.05);
            if (arr[i] < -3.0) arr[i] = 3.0;
          }
          posAttr.needsUpdate = true;
        } else {
          bay.dynoPivotGroup.rotation.x = THREE.MathUtils.lerp(
            bay.dynoPivotGroup.rotation.x,
            0,
            Math.min(1, dt * 10)
          );
          bay.comSphere.visible = false;
          bay.comArrow.visible = false;
          (bay.outriggerContactRings[0].material as THREE.MeshBasicMaterial).opacity = 0;
          (bay.outriggerContactRings[1].material as THREE.MeshBasicMaterial).opacity = 0;
          (bay.windParticles.material as THREE.PointsMaterial).opacity = 0;

          // Gentle idle forward pedal motion
          const idleCrank = -((elapsedSec * 1.4) % (Math.PI * 2));
          updateTandemAnimation(craft, null, dt, idleCrank);
        }
      }
      // ======================================================================
      // MODE B: 3D OVER-WATER PIER COURSE RUN
      // ======================================================================
      else {
        bay.group.visible = false;
        course.group.visible = true;

        if (craft.root.parent !== course.group) {
          course.group.add(craft.root);
          shouldSnapCourseCamera = true;
        }

        const cDef = course.courseDef;
        const s = simStateRef?.current;
        const distFt = s?.distanceFt ?? 0;
        const speedMph = s?.speedMph ?? 0;
        const rollRad = s?.rollAngleRad ?? 0;
        const latFt = s?.lateralOffsetFt ?? 0;
        const phase = s?.phase ?? 'hype';
        const isAirborne = Boolean((s as any)?.isAirborne);
        const verticalFt = (s as any)?.verticalHeightFt ?? getTrackElevationAtDistance(distFt, cDef.id);
        const simTimeSec = s?.timeElapsedSec ?? elapsedSec;

        // 1. Animate Canal Water Surface Waves via separable 1D sinX (97 cols) + cosZ (49 rows) = 146 trig calls instead of 9,506!
        const waterPosAttr = course.waterMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
        const arr = waterPosAttr.array as Float32Array;
        const phaseX = elapsedSec * 2.4;
        const phaseZ = elapsedSec * 1.9;
        for (let ix = 0; ix < 97; ix++) {
          waterSinX[ix] = Math.sin(arr[ix * 3] * 0.22 + phaseX) * 0.08;
        }
        for (let iz = 0; iz < 49; iz++) {
          const rowBase = iz * 97;
          const cosZ = Math.cos(arr[rowBase * 3 + 2] * 0.28 + phaseZ) * 0.06;
          for (let ix = 0; ix < 97; ix++) {
            arr[(rowBase + ix) * 3 + 1] = waterSinX[ix] + cosZ;
          }
        }
        waterPosAttr.needsUpdate = true;

        // 2. Compute Bike 3D World Coordinates along Curving Course Centerline
        const cl = getCourseCenterline(distFt, cDef.id);
        const centerZM = cl.zFt * FT_TO_M;
        const bikeX = distFt * FT_TO_M;
        const currentSeesawAngle =
          s?.seesawAngles?.['seesaw_bridge_1'] ??
          updateSeesawBridgeDynamics(distFt, 160, cDef.seesawFulcrumFt);

        let bikeY = (isAirborne ? verticalFt : getTrackElevationAtDistance(distFt, cDef.id)) * FT_TO_M;
        if (!isAirborne && distFt >= cDef.seesawStartFt && distFt <= cDef.seesawEndFt) {
          // Exact seesaw surface elevation matching elevated fulcrum pivot (zero step at entry & exit!)
          bikeY =
            course.seesawPivotYM +
            (distFt - cDef.seesawFulcrumFt) * FT_TO_M * Math.sin(currentSeesawAngle);
        }
        const bikeZ = centerZM + latFt * FT_TO_M;

        craft.root.position.set(bikeX, bikeY, bikeZ);

        // Calculate pitch angle on incline / rollers / seesaw / takeoff ramp / airborne
        let pitchRad = 0;
        if (isAirborne) {
          const vyFps = (s as any)?.verticalVelFps || 0;
          const vxFps = Math.max(12, speedMph * 1.46667);
          pitchRad = Math.atan2(vyFps, vxFps) * 0.65;
        } else if (distFt >= cDef.rollersStartFt && distFt <= cDef.rollersEndFt) {
          const k = (2 * Math.PI) / cDef.rollerWavelengthFt;
          const slope =
            cDef.rollerAmplitudeFt *
            k *
            Math.cos(((distFt - cDef.rollersStartFt) / cDef.rollerWavelengthFt) * 2 * Math.PI);
          pitchRad = Math.atan(slope);
        } else if (distFt >= cDef.seesawStartFt && distFt <= cDef.seesawEndFt) {
          pitchRad = currentSeesawAngle;
        } else if (distFt >= cDef.takeoffRampStartFt && distFt <= cDef.gapStartFt) {
          pitchRad = (9.5 * Math.PI) / 180;
        }

        const latVelFps = (s as any)?.lateralVelocityFps || 0;
        const steerYaw = THREE.MathUtils.clamp(latVelFps * 0.04, -0.22, 0.22);
        craft.root.rotation.order = 'YXZ';
        craft.root.rotation.y = -cl.headingRad - steerYaw;
        craft.root.rotation.x = rollRad;
        craft.root.rotation.z = pitchRad;
        if (craft.frontSteerNode) {
          craft.frontSteerNode.rotation.y = -THREE.MathUtils.clamp(latVelFps * 0.08, -0.28, 0.28);
        }

        // Dynamic Seesaw Bridge Reaction
        course.seesawPivotGroup.rotation.z = currentSeesawAngle;

        // Animate Swinging Harbor Buoy Pendulum Obstacles & Wind Flags
        for (let i = 0; i < course.swingingPendulums.length; i++) {
          const p = course.swingingPendulums[i];
          const pendLatFt = evaluatePendulumLateralOffsetFt(p.obs, simTimeSec);
          const pendLatM = pendLatFt * FT_TO_M;
          p.buoyPivot.rotation.x = -Math.asin(THREE.MathUtils.clamp(pendLatM / 2.22, -0.65, 0.65));
        }
        for (let i = 0; i < course.windFlags.length; i++) {
          const flag = course.windFlags[i];
          flag.rotation.y = Math.sin(elapsedSec * 9.0 + i) * 0.22;
        }

        // Water Cannon Hazard Particle Streams
        const isNearAnyCannon = cDef.waterCannonStationsFt.some((st) => Math.abs(distFt - st) <= 5.0);
        const jetPulse = isNearAnyCannon ? 1.0 + Math.sin(elapsedSec * 24) * 0.25 : 0.82;
        const jetOpacity = isNearAnyCannon ? 0.92 : 0.62;
        for (let i = 0; i < course.waterCannonJets.length; i++) {
          const jet = course.waterCannonJets[i];
          jet.scale.set(jetPulse, 1, jetPulse);
          (jet.material as THREE.MeshBasicMaterial).opacity = jetOpacity;
        }
        for (let i = 0; i < course.extraWaterCannonJets.length; i++) {
          const jet = course.extraWaterCannonJets[i];
          jet.scale.set(jetPulse, 1, jetPulse);
          (jet.material as THREE.MeshBasicMaterial).opacity = jetOpacity;
        }

        // Golden Canal Finish Bell & Celebration
        const finishBellFt = s?.courseLengthFt || cDef.finishBellFt;
        if (phase === 'finished' || distFt >= finishBellFt) {
          const swing =
            Math.sin(elapsedSec * 16) *
            0.35 *
            Math.exp(-Math.min(3.0, (s?.timeElapsedSec || 0) * 0.2));
          course.finishBellGroup.rotation.z = swing;

          course.confettiGroup.visible = true;
          if (!hasTriggeredConfettiRef.current) {
            hasTriggeredConfettiRef.current = true;
            confettiStartTimeRef.current = elapsedSec;
            course.confettiParticles.forEach((p) => {
              p.mesh.position.set(0, 0, 0);
            });
          }
          const confAge = elapsedSec - confettiStartTimeRef.current;
          course.confettiParticles.forEach((p) => {
            p.mesh.position.x += p.vel.x * dt;
            p.mesh.position.y += (p.vel.y - 4.5 * confAge) * dt;
            p.mesh.position.z += p.vel.z * dt;
            p.mesh.rotation.x += p.rotVel.x * dt;
            p.mesh.rotation.y += p.rotVel.y * dt;
          });
        } else {
          course.finishBellGroup.rotation.z = 0;
          course.confettiGroup.visible = false;
          hasTriggeredConfettiRef.current = false;
        }

        // Splashdown Hydro-Burst Particle Animation
        if (phase === 'splashdown') {
          course.splashGroup.visible = true;
          if (!hasTriggeredSplashRef.current) {
            hasTriggeredSplashRef.current = true;
            splashStartTimeRef.current = elapsedSec;
            course.splashGroup.position.set(bikeX, 0, bikeZ);
            course.splashDrops.forEach((d) => {
              d.mesh.position.set(0, 0.2, 0);
            });
            course.foamRings.forEach((r, idx) => {
              r.scale.setScalar(0.5 + idx * 0.4);
              (r.material as THREE.MeshBasicMaterial).opacity = 0.9;
            });
          }
          const splashAge = elapsedSec - splashStartTimeRef.current;
          course.splashDrops.forEach((d) => {
            d.mesh.position.x = d.vel.x * splashAge;
            d.mesh.position.y = Math.max(
              -0.2,
              0.2 + d.vel.y * splashAge - 0.5 * 14.0 * splashAge * splashAge
            );
            d.mesh.position.z = d.vel.z * splashAge;
          });
          course.foamRings.forEach((r, idx) => {
            const scale = 0.6 + idx * 0.5 + splashAge * (2.5 + idx * 0.8);
            r.scale.setScalar(scale);
            (r.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 - splashAge * 0.55);
          });

          // Submerge & tilt bike into canal water
          craft.root.position.y = Math.max(-0.35, bikeY - splashAge * 3.8);
          craft.root.rotation.x =
            rollRad + Math.sign(rollRad || 1) * Math.min(1.2, splashAge * 2.5);
        } else {
          course.splashGroup.visible = false;
          hasTriggeredSplashRef.current = false;
        }

        // Update Bike IK & Wheel Rotation from live simState
        updateTandemAnimation(craft, s || null, dt);

        // Behind-the-Riders Third-Person Chase Camera & Sun Shadow Follow
        const speedZoom = Math.min(1.8, speedMph * 0.05);
        const camBackM = 4.35 + speedZoom * 0.75;
        const camHeightM = Math.max(2.55, bikeY + 1.82 + speedZoom * 0.18);
        const tangentAngle = cl.headingRad * 0.85;
        const tx = Math.cos(tangentAngle);
        const tz = Math.sin(tangentAngle);

        tempCamTargetPos.set(
          bikeX - tx * camBackM,
          camHeightM,
          centerZM + (bikeZ - centerZM) * 0.85 - tz * camBackM
        );

        if (shouldSnapCourseCamera || (phase === 'hype' && distFt < 0.5)) {
          camera.position.copy(tempCamTargetPos);
          shouldSnapCourseCamera = false;
        } else {
          camera.position.lerp(tempCamTargetPos, Math.min(1, dt * 11.5));
        }

        const lookAheadFt = 26 + Math.min(18, speedMph * 0.65);
        const aheadCl = getCourseCenterline(distFt + lookAheadFt, cDef.id);
        const aheadXM = (distFt + lookAheadFt) * FT_TO_M;
        const aheadZM = aheadCl.zFt * FT_TO_M + (bikeZ - centerZM) * 0.35;
        const aheadYM = Math.max(1.2, bikeY + 0.68);

        tempCourseLook.set(aheadXM, aheadYM, aheadZM);
        camera.lookAt(tempCourseLook);

        if (dirLightRef.current) {
          const snapBikeX = Math.round(bikeX * 2) * 0.5;
          const snapBikeY = Math.round(bikeY * 2) * 0.5;
          if (snapBikeX !== lastSnapBikeX || snapBikeY !== lastSnapBikeY) {
            lastSnapBikeX = snapBikeX;
            lastSnapBikeY = snapBikeY;
            dirLightRef.current.position.set(snapBikeX + 8, 18, centerZM + 10);
            dirLightRef.current.target.position.set(snapBikeX, snapBikeY, centerZM);
            dirLightRef.current.target.updateMatrixWorld();
          }
        }
      }

      renderer.render(scene, camera);
    };

    loopControlRef.current = {
      pause: () => {
        if (animFrameId !== 0) {
          cancelAnimationFrame(animFrameId);
          animFrameId = 0;
        }
      },
      resume: () => {
        if (animFrameId === 0 && !pausedRef.current) {
          lastTimeMs = performance.now();
          animFrameId = requestAnimationFrame(animate);
        }
      },
    };

    if (!pausedRef.current) {
      animFrameId = requestAnimationFrame(animate);
    }

    return () => {
      loopControlRef.current = null;
      if (animFrameId !== 0) {
        cancelAnimationFrame(animFrameId);
      }
      domEl.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      domEl.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);

      dirLight.shadow.map?.dispose();
      disposeTandemSceneObjects(scene, false);
      renderer.dispose();
    };
  }, []);

  // ==========================================================================
  // EFFECT 2: HOT-SWAP TANDEM BIKE 3D MESH WHEN LOADOUT CHANGES
  // ==========================================================================
  useEffect(() => {
    const bay = workshopBayRef.current;
    const course = courseEnvRef.current;
    const oldBike = bikeGroupsRef.current;

    if (!bay || !course) return;

    const newBike = buildTandemBike3D(loadout);

    if (oldBike) {
      const parent = oldBike.root.parent;
      if (parent) {
        newBike.root.position.copy(oldBike.root.position);
        newBike.root.rotation.copy(oldBike.root.rotation);
        parent.remove(oldBike.root);
        parent.add(newBike.root);
      } else {
        bay.dynoPivotGroup.add(newBike.root);
      }
      disposeTandemSceneObjects(oldBike.root, false);
    } else {
      bay.dynoPivotGroup.add(newBike.root);
    }

    bikeGroupsRef.current = newBike;
    snapBounceRef.current = 1.0;
  }, [
    loadout.frameId,
    loadout.drivetrainId,
    loadout.wheelsId,
    loadout.steeringId,
    loadout.stabilizerId,
    loadout.topperId,
    loadout.paintThemeId,
  ]);

  // Compute live outrigger contact telemetry for Dyno overlay
  const rolloverDeg = metrics.rolloverThresholdDeg;
  const currentTiltAbs = Math.abs(dynoTiltDeg);
  const isRolloverDanger = currentTiltAbs >= rolloverDeg;
  const outriggerSpanFt = metrics.stats.outriggerWidthFt;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: mode === 'workshop' ? '#0f172a' : activeCourseDef.theme.skyHorizonHex,
        userSelect: 'none',
      }}
    >
      {/* 3D WebGL Viewport Container */}
      <div
        ref={containerRef}
        data-testid="tandem-canvas-3d"
        style={{ width: '100%', height: '100%' }}
      />

      {/* Fallback Banner if Headless/Non-WebGL */}
      {webglError && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#94a3b8',
            fontSize: 13,
            pointerEvents: 'none',
          }}
        >
          <span>🚲 3D Tandem Viewport ({mode.toUpperCase()} — {activeCourseDef.name})</span>
        </div>
      )}

      {/* Hovered 3D Socket Tooltip in Workshop Mode */}
      {mode === 'workshop' && hoveredSocket && !isDynoActive && (
        <div
          style={{
            position: 'absolute',
            top: 74,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15, 23, 42, 0.92)',
            border: '1px solid #38bdf8',
            borderRadius: 999,
            padding: '5px 14px',
            color: '#f8fafc',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.05em',
            pointerEvents: 'none',
            boxShadow: '0 4px 15px rgba(56, 189, 248, 0.3)',
            zIndex: 15,
          }}
        >
          CLICK SOCKET TO CUSTOMIZE: {hoveredSocket.toUpperCase()}
        </div>
      )}

      {/* Workshop Viewport Controls & Interactive Balance Dyno Rig Bar */}
      {mode === 'workshop' && (
        <div
          style={{
            position: 'absolute',
            top: isControlledByWorkshopHud ? 20 : 68,
            ...(isControlledByWorkshopHud
              ? { right: 24 }
              : { left: '50%', transform: 'translateX(-50%)' }),
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            zIndex: 35,
            pointerEvents: 'auto',
          }}
        >
          {/* Top Action Pill: Dyno Toggle + Camera Presets */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(15, 23, 42, 0.86)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              borderRadius: 999,
              padding: '4px 10px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}
          >
            {!isControlledByWorkshopHud && (
              <button
                type="button"
                data-testid="toggle-dyno-btn"
                onClick={handleToggleDyno}
                style={{
                  background: isDynoActive
                    ? 'linear-gradient(135deg, #06b6d4, #2563eb)'
                    : 'rgba(30, 41, 59, 0.9)',
                  color: '#f8fafc',
                  border: isDynoActive ? '1px solid #67e8f9' : '1px solid #475569',
                  borderRadius: 999,
                  padding: '5px 14px',
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>⚖️</span>
                <span>{isDynoActive ? 'EXIT DYNO RIG' : 'TEST ON BALANCE DYNO'}</span>
              </button>
            )}

            <button
              type="button"
              data-testid="behind-riders-camera-btn"
              onClick={handleBehindRidersCamera}
              title="Behind Riders Chase Camera View"
              style={{
                background: 'rgba(30, 41, 59, 0.8)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                borderRadius: 999,
                padding: '5px 11px',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              🎯 BEHIND RIDERS
            </button>

            <button
              type="button"
              data-testid="reset-camera-btn"
              onClick={handleResetCamera}
              title="Reset 3D Camera Orbit"
              style={{
                background: 'rgba(30, 41, 59, 0.8)',
                color: '#cbd5e1',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: 999,
                padding: '5px 11px',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              🎥 RESET VIEW
            </button>
          </div>

          {/* Interactive Dyno Testbed Control Panel (Standalone mode) */}
          {!isControlledByWorkshopHud && isDynoActive && (
            <div
              data-testid="dyno-control-panel"
              style={{
                background: 'rgba(15, 23, 42, 0.92)',
                backdropFilter: 'blur(12px)',
                border: isRolloverDanger
                  ? '1px solid #ef4444'
                  : '1px solid rgba(56, 189, 248, 0.4)',
                borderRadius: 12,
                padding: '10px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                minWidth: 340,
                boxShadow: '0 12px 30px rgba(0,0,0,0.55)',
                color: '#f8fafc',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                }}
              >
                <span style={{ color: '#38bdf8' }}>
                  🔬 LATERAL ROLL CRADLE: {dynoTiltDeg > 0 ? `+${dynoTiltDeg}°` : `${dynoTiltDeg}°`}
                </span>
                <span
                  style={{
                    color: isRolloverDanger ? '#ef4444' : '#4ade80',
                    background: isRolloverDanger
                      ? 'rgba(239, 68, 68, 0.18)'
                      : 'rgba(74, 222, 128, 0.15)',
                    padding: '2px 8px',
                    borderRadius: 6,
                  }}
                >
                  {isRolloverDanger
                    ? `⚠️ TIP-OVER (> ${rolloverDeg.toFixed(1)}°)`
                    : `✅ STABLE (MAX ${rolloverDeg.toFixed(1)}°)`}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 10, color: '#94a3b8', width: 32 }}>-35°</span>
                <input
                  type="range"
                  data-testid="dyno-tilt-slider"
                  min={-35}
                  max={35}
                  step={1}
                  value={dynoTiltDeg}
                  onChange={(e) => {
                    setDynoAutoSweep(false);
                    setDynoTiltDeg(Number(e.target.value));
                  }}
                  style={{ flex: 1, cursor: 'pointer', accentColor: '#38bdf8' }}
                />
                <span style={{ fontSize: 10, color: '#94a3b8', width: 32, textAlign: 'right' }}>
                  +35°
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                  paddingTop: 2,
                  borderTop: '1px solid rgba(148, 163, 184, 0.15)',
                  fontSize: 11,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    type="button"
                    data-testid="dyno-autosweep-btn"
                    onClick={() => setDynoAutoSweep((v) => !v)}
                    style={{
                      background: dynoAutoSweep ? '#0284c7' : '#1e293b',
                      color: '#f8fafc',
                      border: '1px solid #38bdf8',
                      borderRadius: 6,
                      padding: '3px 8px',
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {dynoAutoSweep ? '⏸ STOP SWEEP' : '🔄 AUTO-SWEEP'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDynoAutoSweep(false);
                      setDynoTiltDeg(0);
                    }}
                    style={{
                      background: '#1e293b',
                      color: '#cbd5e1',
                      border: '1px solid #475569',
                      borderRadius: 6,
                      padding: '3px 8px',
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    0° LEVEL
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>CADENCE:</span>
                  {[65, 90, 115].map((rpm) => (
                    <button
                      key={rpm}
                      type="button"
                      onClick={() => setDynoCadenceRpm(rpm)}
                      style={{
                        background: dynoCadenceRpm === rpm ? '#f59e0b' : '#1e293b',
                        color: dynoCadenceRpm === rpm ? '#0f172a' : '#cbd5e1',
                        border: '1px solid rgba(245, 158, 11, 0.4)',
                        borderRadius: 5,
                        padding: '2px 6px',
                        fontSize: 10,
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {rpm} RPM
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center' }}>
                Outrigger Stance:{' '}
                <strong style={{ color: '#e2e8f0' }}>{outriggerSpanFt.toFixed(1)} ft</strong> •
                Power/Weight:{' '}
                <strong style={{ color: '#38bdf8' }}>
                  {metrics.powerToWeightRatioWKg.toFixed(2)} W/kg
                </strong>{' '}
                • Status:{' '}
                <strong style={{ color: '#facc15' }}>{metrics.dynoStatusLabel}</strong>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TandemCanvas3D;
