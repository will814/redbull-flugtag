/**
 * Red Bull Tandem Bike Challenge (Game 4)
 * Procedural 3D Three.js Tandem Bicycle Builder & Kinematics Engine
 *
 * Implements:
 * - 6 procedural part categories: frame, drivetrain, wheels, steering, stabilizer, topper
 * - Canine mascots: Shadow the Golden Retriever 🦮 and Boomer the Great Dane 🐶
 * - Red Bull themed toppers: Bull Horns, Wings, Aero Fin, Golden Bell, Stratos Capsule
 * - Procedural 2-person crew (Captain & Stoker) with closed-form 2-bone Inverse Kinematics for pedaling
 * - Dynamic PBR material binding for 6 paint themes
 * - Stabilizer outriggers matching catalog outriggerWidthFt
 * - Safe geometry/material caching and recursive disposal (disposeTandemObject3D)
 */

import * as THREE from 'three';
import type {
  TandemCategory,
  TandemLoadout,
  TandemPaintTheme,
  TandemSimState,
} from './types.ts';
import {
  getTandemPartById,
  TANDEM_PAINT_THEMES,
  sanitizeLoadout,
} from './TandemPartCatalog.ts';

export function getTandemPaintThemeById(themeId?: string): TandemPaintTheme {
  return TANDEM_PAINT_THEMES.find((t) => t.id === themeId) ?? TANDEM_PAINT_THEMES[0];
}

// ============================================================================
// 1. SPATIAL BENCHMARKS & CONSTANTS
// ============================================================================

export const TANDEM_GEOMETRY = {
  wheelbaseM: 1.80,
  wheelRadiusM: 0.33,
  frontAxleX: 0.90,
  rearAxleX: -0.90,
  axleY: 0.33,
  groundY: 0.00,
  headTubeX: 0.70,
  headTubeY: 0.85,
  captainStemX: 0.65,
  captainStemY: 0.95,
  captainSaddleX: 0.10,
  captainSaddleY: 0.78,
  captainBBX: 0.25,
  captainBBY: 0.28,
  stokerStemX: -0.15,
  stokerStemY: 0.86,
  stokerSaddleX: -0.70,
  stokerSaddleY: 0.74,
  stokerBBX: -0.55,
  stokerBBY: 0.28,
  crankRadiusM: 0.17,
  qFactorOffsetZ: 0.12,
  thighLengthM: 0.38,
  shankLengthM: 0.38,
  shadowPerchX: -0.30,
  shadowPerchY: 0.74,
  shadowBasketX: 0.85,
  shadowBasketY: 0.88,
  boomerPerchX: -0.92,
  boomerPerchY: 0.68,
};

export const TANDEM_SOCKET_POSITIONS: Record<TandemCategory, [number, number, number]> = {
  frame: [0.00, 0.55, 0.00],
  drivetrain: [-0.15, 0.28, 0.12],
  wheels: [0.90, 0.33, 0.12],
  steering: [0.65, 0.95, 0.00],
  stabilizer: [-0.65, 0.30, 0.45],
  topper: [-0.30, 0.88, 0.00],
};

// ============================================================================
// 2. TYPES & INTERFACES
// ============================================================================

export interface LegIKChain {
  hipPos: THREE.Vector3;
  thighMesh: THREE.Mesh;
  kneeJoint: THREE.Mesh;
  shankMesh: THREE.Mesh;
  footMesh: THREE.Mesh;
  isLeft: boolean;
  bbX: number;
  bbY: number;
}

export interface TandemBike3DGroups {
  root: THREE.Group;
  frameGroup: THREE.Group;
  drivetrainGroup: THREE.Group;
  wheelsGroup: THREE.Group;
  steeringGroup: THREE.Group;
  stabilizerGroup: THREE.Group;
  topperGroup: THREE.Group;
  crewGroup: THREE.Group;

  frontSteerNode: THREE.Group;
  wheelSpinners: THREE.Object3D[];
  crankSpinners: THREE.Object3D[];
  gyroSpinners: THREE.Object3D[];
  topperAnimNodes: {
    shadowTail?: THREE.Object3D;
    boomerTail?: THREE.Object3D;
    bellClapper?: THREE.Object3D;
    animatedProps?: THREE.Object3D[];
  };

  crewIK: {
    captainLegL: LegIKChain;
    captainLegR: LegIKChain;
    stokerLegL: LegIKChain;
    stokerLegR: LegIKChain;
  };

  socketMarkers: Record<TandemCategory, THREE.Mesh>;
  socketMarkerList: THREE.Mesh[];
  outriggerSpanM: number;
}

export type Tandem3DGroups = TandemBike3DGroups;

// ============================================================================
// 3. RESOURCE CACHING & SHARING
// ============================================================================

const GEO_CACHE = new Map<string, THREE.BufferGeometry>();
const MAT_CACHE = new Map<string, THREE.Material>();

function getCachedGeo(key: string, factory: () => THREE.BufferGeometry): THREE.BufferGeometry {
  const existing = GEO_CACHE.get(key);
  if (existing) return existing;
  const geo = factory();
  geo.userData.cached = true;
  GEO_CACHE.set(key, geo);
  return geo;
}

function getCachedMat<T extends THREE.Material>(key: string, factory: () => T): T {
  const existing = MAT_CACHE.get(key) as T | undefined;
  if (existing) return existing;
  const mat = factory();
  mat.userData.cached = true;
  MAT_CACHE.set(key, mat);
  return mat;
}

function makePBR(hex: string | number, roughness = 0.35, metalness = 0.25): THREE.MeshStandardMaterial {
  const key = `pbr_${hex}_${roughness}_${metalness}`;
  return getCachedMat(key, () => new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    roughness,
    metalness,
  }));
}

function makeBasic(hex: string | number, transparent = false, opacity = 1.0): THREE.MeshBasicMaterial {
  const key = `basic_${hex}_${transparent}_${opacity}`;
  return getCachedMat(key, () => new THREE.MeshBasicMaterial({
    color: new THREE.Color(hex),
    transparent,
    opacity,
  }));
}

// Helper: oriented cylinder between two 3D points
function createStrutBetween(
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  radius: number,
  mat: THREE.Material,
  radialSegments = 10
): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const length = dir.length();
  const geo = new THREE.CylinderGeometry(radius, radius, length, radialSegments);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = false;

  const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
  mesh.position.copy(mid);

  // Align Cylinder's Y axis with vector dir
  const yAxis = new THREE.Vector3(0, 1, 0);
  mesh.quaternion.setFromUnitVectors(yAxis, dir.clone().normalize());
  return mesh;
}

// ============================================================================
// 4. CATEGORY BUILDERS
// ============================================================================

// ----------------------------------------------------------------------------
// 4.1 FRAME BUILDER
// ----------------------------------------------------------------------------
function buildFrameMesh(frameId: string, theme: TandemPaintTheme): THREE.Group {
  const group = new THREE.Group();
  const frameMat = makePBR(theme.frameHex || theme.primaryHex, 0.3, 0.5);
  const secondaryMat = makePBR(theme.secondaryHex, 0.35, 0.4);
  const accentMat = makePBR(theme.accentHex, 0.25, 0.7);
  const chromeMat = makePBR('#e2e8f0', 0.15, 0.88);
  const saddleMat = makePBR('#1e293b', 0.65, 0.1);

  // Common landmarks
  const headTop = new THREE.Vector3(0.68, 0.92, 0);
  const headBot = new THREE.Vector3(0.72, 0.76, 0);
  const capSaddlePt = new THREE.Vector3(0.10, 0.78, 0);
  const capSeatJunction = new THREE.Vector3(0.12, 0.72, 0);
  const capBB = new THREE.Vector3(0.25, 0.28, 0);
  const stokerSaddlePt = new THREE.Vector3(-0.70, 0.74, 0);
  const stokerSeatJunction = new THREE.Vector3(-0.68, 0.68, 0);
  const stokerBB = new THREE.Vector3(-0.55, 0.28, 0);
  const rearAxleL = new THREE.Vector3(-0.90, 0.33, -0.07);
  const rearAxleR = new THREE.Vector3(-0.90, 0.33, 0.07);

  // Head Tube
  group.add(createStrutBetween(headBot, headTop, 0.024, secondaryMat, 12));

  // Bottom Boom Tube (connecting Captain BB to Stoker BB)
  group.add(createStrutBetween(capBB, stokerBB, 0.028, frameMat, 12));

  // Bottom Brackets shells
  const bbGeo = getCachedGeo('bb_shell', () => new THREE.CylinderGeometry(0.028, 0.028, 0.14, 12).rotateX(Math.PI / 2));
  const capBBMesh = new THREE.Mesh(bbGeo, chromeMat);
  capBBMesh.position.copy(capBB);
  const stokerBBMesh = new THREE.Mesh(bbGeo, chromeMat);
  stokerBBMesh.position.copy(stokerBB);
  group.add(capBBMesh, stokerBBMesh);

  // Seat tubes
  group.add(createStrutBetween(capBB, capSeatJunction, 0.022, frameMat));
  group.add(createStrutBetween(stokerBB, stokerSeatJunction, 0.022, frameMat));

  // Saddles
  const saddleGeo = getCachedGeo('saddle_geo', () => {
    const geo = new THREE.BoxGeometry(0.24, 0.045, 0.14);
    geo.translate(-0.02, 0, 0);
    return geo;
  });
  const capSaddle = new THREE.Mesh(saddleGeo, saddleMat);
  capSaddle.position.copy(capSaddlePt);
  const stokerSaddle = new THREE.Mesh(saddleGeo, saddleMat);
  stokerSaddle.position.copy(stokerSaddlePt);
  group.add(capSaddle, stokerSaddle);

  // Seatposts
  group.add(createStrutBetween(capSeatJunction, capSaddlePt, 0.016, chromeMat));
  group.add(createStrutBetween(stokerSeatJunction, stokerSaddlePt, 0.016, chromeMat));

  // Rear stays
  group.add(createStrutBetween(stokerBB, rearAxleL, 0.015, secondaryMat));
  group.add(createStrutBetween(stokerBB, rearAxleR, 0.015, secondaryMat));
  group.add(createStrutBetween(stokerSeatJunction, rearAxleL, 0.015, secondaryMat));
  group.add(createStrutBetween(stokerSeatJunction, rearAxleR, 0.015, secondaryMat));

  // Frame-specific styling
  if (frameId === 'frame_alloy_road') {
    // Hydroformed Sport Alloy: straight diagonal lateral tube from head tube to Stoker BB
    group.add(createStrutBetween(headBot, capBB, 0.026, frameMat));
    group.add(createStrutBetween(headTop, capSeatJunction, 0.022, frameMat));
    group.add(createStrutBetween(capSeatJunction, stokerSeatJunction, 0.022, frameMat));
    group.add(createStrutBetween(capSeatJunction, stokerBB, 0.022, frameMat));
    // Continuous diagonal stiffener
    group.add(createStrutBetween(headBot, stokerBB, 0.020, accentMat));
  } else if (frameId === 'frame_carbon_aero') {
    // Monocoque Carbon Aero: deep airfoil aerodynamic beams
    const aeroBeamGeo = getCachedGeo('aero_beam', () => new THREE.BoxGeometry(0.58, 0.08, 0.038));
    const topAero = new THREE.Mesh(aeroBeamGeo, frameMat);
    topAero.position.set(0.40, 0.81, 0);
    topAero.rotation.z = -0.16;

    const midAero = new THREE.Mesh(
      getCachedGeo('aero_beam_mid', () => new THREE.BoxGeometry(0.78, 0.09, 0.038)),
      frameMat
    );
    midAero.position.set(-0.28, 0.70, 0);
    midAero.rotation.z = -0.05;

    const downAero = new THREE.Mesh(
      getCachedGeo('aero_beam_down', () => new THREE.BoxGeometry(0.68, 0.08, 0.04)),
      secondaryMat
    );
    downAero.position.set(0.48, 0.52, 0);
    downAero.rotation.z = 0.82;
    group.add(topAero, midAero, downAero);
  } else if (frameId === 'frame_heavy_cargo') {
    // Heavy Hauler Truss Frame: Warren space-truss triangular lattice members
    group.add(createStrutBetween(headBot, capBB, 0.025, frameMat));
    group.add(createStrutBetween(headTop, capSeatJunction, 0.022, frameMat));
    group.add(createStrutBetween(capSeatJunction, stokerSeatJunction, 0.022, frameMat));
    group.add(createStrutBetween(capSeatJunction, stokerBB, 0.022, frameMat));

    // Low cargo tray under frame
    const trayGeo = getCachedGeo('cargo_tray', () => new THREE.BoxGeometry(0.70, 0.04, 0.22));
    const tray = new THREE.Mesh(trayGeo, secondaryMat);
    tray.position.set(-0.15, 0.20, 0);
    group.add(tray);

    // Lattice diagonal trusses
    const midTop = new THREE.Vector3(-0.15, 0.72, 0);
    group.add(createStrutBetween(capBB, midTop, 0.014, accentMat));
    group.add(createStrutBetween(midTop, stokerBB, 0.014, accentMat));
  } else if (frameId === 'frame_hydrofoil_truss') {
    // Titanium Hydro-Truss: geodesic tubes and torpedo pontoons along boom
    group.add(createStrutBetween(headBot, capBB, 0.018, chromeMat));
    group.add(createStrutBetween(headTop, capSeatJunction, 0.016, chromeMat));
    group.add(createStrutBetween(capSeatJunction, stokerSeatJunction, 0.016, chromeMat));
    group.add(createStrutBetween(capSeatJunction, stokerBB, 0.016, chromeMat));

    // Torpedo buoyancy pontoon
    const pontoonGeo = getCachedGeo('hydro_pontoon', () => new THREE.CylinderGeometry(0.048, 0.048, 0.74, 12).rotateZ(Math.PI / 2));
    const pontoon = new THREE.Mesh(pontoonGeo, secondaryMat);
    pontoon.position.set(-0.15, 0.28, 0);
    group.add(pontoon);
  } else if (frameId === 'frame_rb_spaceframe') {
    // Red Bull F1 Monocoque Spaceframe: aerodynamic carbon tub with sidepod scoops
    const tubGeo = getCachedGeo('f1_tub', () => new THREE.BoxGeometry(1.60, 0.14, 0.16));
    const tub = new THREE.Mesh(tubGeo, frameMat);
    tub.position.set(0.00, 0.36, 0);

    const sidePodL = new THREE.Mesh(
      getCachedGeo('f1_sidepod', () => new THREE.BoxGeometry(0.48, 0.18, 0.06)),
      secondaryMat
    );
    sidePodL.position.set(-0.15, 0.42, 0.12);
    const sidePodR = sidePodL.clone();
    sidePodR.position.z = -0.12;

    group.add(tub, sidePodL, sidePodR);
    group.add(createStrutBetween(headTop, capSeatJunction, 0.022, accentMat));
    group.add(createStrutBetween(capSeatJunction, stokerSeatJunction, 0.022, accentMat));
  } else {
    // Default / frame_cruiser: classic twin-diamond curved cruiser
    group.add(createStrutBetween(headBot, capBB, 0.024, frameMat));
    group.add(createStrutBetween(headTop, capSeatJunction, 0.020, frameMat));
    group.add(createStrutBetween(capSeatJunction, stokerSeatJunction, 0.020, frameMat));
    group.add(createStrutBetween(capSeatJunction, stokerBB, 0.020, frameMat));
  }

  return group;
}

// ----------------------------------------------------------------------------
// 4.2 DRIVETRAIN BUILDER
// ----------------------------------------------------------------------------
function buildDrivetrainMesh(drivetrainId: string, theme: TandemPaintTheme) {
  const group = new THREE.Group();
  const crankSpinners: THREE.Object3D[] = [];

  const metalMat = makePBR('#cbd5e1', 0.2, 0.8);
  const goldMat = makePBR('#facc15', 0.18, 0.85);
  const blackMat = makePBR('#1e293b', 0.5, 0.3);
  const chainMat = drivetrainId === 'drivetrain_rb_turbo' ? makePBR('#ef4444', 0.25, 0.7) : makePBR('#64748b', 0.3, 0.7);

  const capBB = new THREE.Vector3(0.25, 0.28, 0);
  const stokerBB = new THREE.Vector3(-0.55, 0.28, 0);

  // Helper for crank spinner
  const makeCrankset = (bbPos: THREE.Vector3, isCaptain: boolean) => {
    const spinner = new THREE.Group();
    spinner.position.copy(bbPos);

    const crankArmLength = 0.17;
    const armGeo = getCachedGeo('crank_arm', () => {
      const g = new THREE.BoxGeometry(crankArmLength, 0.022, 0.015);
      g.translate(crankArmLength / 2, 0, 0);
      return g;
    });

    const pedalGeo = getCachedGeo('pedal_geo', () => new THREE.BoxGeometry(0.08, 0.02, 0.09));

    // Right crank arm & pedal (+Z)
    const rightArm = new THREE.Mesh(armGeo, metalMat);
    rightArm.position.z = 0.09;
    const rightPedal = new THREE.Mesh(pedalGeo, blackMat);
    rightPedal.position.set(crankArmLength, 0, 0.04);
    rightArm.add(rightPedal);

    // Left crank arm & pedal (-Z) - 180 degrees offset
    const leftArm = new THREE.Mesh(armGeo, metalMat);
    leftArm.rotation.z = Math.PI;
    leftArm.position.z = -0.09;
    const leftPedal = new THREE.Mesh(pedalGeo, blackMat);
    leftPedal.position.set(crankArmLength, 0, -0.04);
    leftArm.add(leftPedal);

    spinner.add(rightArm, leftArm);

    // Chainrings
    const chainringGeo = getCachedGeo('chainring_geo', () =>
      new THREE.CylinderGeometry(0.085, 0.085, 0.006, 24).rotateX(Math.PI / 2)
    );
    // Timing chainring on left
    const timingRing = new THREE.Mesh(chainringGeo, metalMat);
    timingRing.position.z = -0.06;
    spinner.add(timingRing);

    // Drive chainring on right (Stoker only)
    if (!isCaptain) {
      const driveRing = new THREE.Mesh(chainringGeo, drivetrainId === 'drivetrain_singlespeed' ? goldMat : metalMat);
      driveRing.position.z = 0.06;
      spinner.add(driveRing);
    }

    return spinner;
  };

  const capCrank = makeCrankset(capBB, true);
  const stokerCrank = makeCrankset(stokerBB, false);
  group.add(capCrank, stokerCrank);
  crankSpinners.push(capCrank, stokerCrank);

  // Timing Chain (Upper & Lower spans on left side z = -0.06)
  const chainRunGeo = getCachedGeo('chain_run', () =>
    new THREE.CylinderGeometry(0.005, 0.005, 0.80, 8).rotateZ(Math.PI / 2)
  );
  const topTimingChain = new THREE.Mesh(chainRunGeo, chainMat);
  topTimingChain.position.set(-0.15, 0.365, -0.06);
  const botTimingChain = new THREE.Mesh(chainRunGeo, chainMat);
  botTimingChain.position.set(-0.15, 0.195, -0.06);
  group.add(topTimingChain, botTimingChain);

  // Drive Chain from Stoker BB to Rear Axle on right side z = +0.06
  const driveChainLength = Math.hypot(-0.90 - (-0.55), 0.33 - 0.28);
  const driveChainAngle = Math.atan2(0.33 - 0.28, -0.90 - (-0.55));
  const driveChainGeo = new THREE.CylinderGeometry(0.005, 0.005, driveChainLength, 8);
  const driveChainMesh = new THREE.Mesh(driveChainGeo, chainMat);
  driveChainMesh.position.set((-0.55 + -0.90) / 2, (0.28 + 0.33) / 2, 0.06);
  driveChainMesh.rotation.z = driveChainAngle - Math.PI / 2;
  group.add(driveChainMesh);

  // Derailleur or Gearbox
  if (drivetrainId === 'drivetrain_derailleur_21' || drivetrainId === 'drivetrain_rb_turbo') {
    const derailleurBody = new THREE.Mesh(
      getCachedGeo('derailleur_body', () => new THREE.BoxGeometry(0.05, 0.07, 0.04)),
      drivetrainId === 'drivetrain_rb_turbo' ? makePBR('#ef4444', 0.2, 0.8) : metalMat
    );
    derailleurBody.position.set(-0.92, 0.26, 0.08);
    group.add(derailleurBody);
  } else if (drivetrainId === 'drivetrain_planetary_hub') {
    const hubBody = new THREE.Mesh(
      getCachedGeo('planetary_hub', () => new THREE.CylinderGeometry(0.07, 0.07, 0.10, 16).rotateX(Math.PI / 2)),
      metalMat
    );
    hubBody.position.set(-0.90, 0.33, 0);
    group.add(hubBody);
  } else if (drivetrainId === 'drivetrain_electronic_assist') {
    // Motor canister and battery pod
    const motorCanister = new THREE.Mesh(
      getCachedGeo('ebike_motor', () => new THREE.CylinderGeometry(0.065, 0.065, 0.16, 16).rotateX(Math.PI / 2)),
      blackMat
    );
    motorCanister.position.copy(capBB);

    const batteryPod = new THREE.Mesh(
      getCachedGeo('battery_pod', () => new THREE.BoxGeometry(0.32, 0.08, 0.08)),
      makePBR('#0284c7', 0.3, 0.6)
    );
    batteryPod.position.set(0.48, 0.52, 0);
    batteryPod.rotation.z = 0.82;
    group.add(motorCanister, batteryPod);
  }

  return { group, crankSpinners };
}

// ----------------------------------------------------------------------------
// 4.3 WHEELS BUILDER
// ----------------------------------------------------------------------------
function buildSingleWheel(wheelsId: string, theme: TandemPaintTheme, isFront: boolean) {
  const spinner = new THREE.Group();
  const rimMat = makePBR(theme.rimHex || theme.secondaryHex, 0.25, 0.8);
  const tireMat = makePBR('#1e293b', 0.8, 0.05);
  const spokeMat = makePBR('#cbd5e1', 0.2, 0.85);

  let tireRadius = 0.33;
  let tireThickness = 0.038;
  let rimRadius = 0.28;

  if (wheelsId === 'wheels_fat_floats') {
    tireRadius = 0.35;
    tireThickness = 0.082;
    rimRadius = 0.25;
  } else if (wheelsId === 'wheels_deep_dish') {
    tireRadius = 0.32;
    tireThickness = 0.030;
    rimRadius = 0.29;
  }

  // Tire Torus
  const tireGeo = getCachedGeo(`tire_${wheelsId}`, () =>
    new THREE.TorusGeometry(tireRadius - tireThickness, tireThickness, 16, 36)
  );
  const tireMesh = new THREE.Mesh(tireGeo, tireMat);
  tireMesh.castShadow = true;
  spinner.add(tireMesh);

  // Rim
  const rimGeo = getCachedGeo(`rim_${wheelsId}`, () =>
    new THREE.TorusGeometry(rimRadius, 0.016, 12, 36)
  );
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  rimMesh.castShadow = true;
  spinner.add(rimMesh);

  // Hub center
  const hubGeo = getCachedGeo('wheel_hub', () =>
    new THREE.CylinderGeometry(0.024, 0.024, 0.09, 12).rotateX(Math.PI / 2)
  );
  const hub = new THREE.Mesh(hubGeo, spokeMat);
  spinner.add(hub);

  // Spokes / Blades / Disc
  if (wheelsId === 'wheels_rb_slicks' && !isFront) {
    // Solid Rear Aero Disc
    const discGeo = getCachedGeo('aero_disc', () =>
      new THREE.CylinderGeometry(rimRadius, rimRadius, 0.025, 36).rotateX(Math.PI / 2)
    );
    const discMesh = new THREE.Mesh(discGeo, makePBR('#0f172a', 0.3, 0.7));
    // Bull sun decal
    const sunDecal = new THREE.Mesh(
      getCachedGeo('sun_decal', () => new THREE.RingGeometry(0.06, 0.16, 24)),
      makeBasic('#facc15')
    );
    sunDecal.position.z = 0.013;
    discMesh.add(sunDecal);
    spinner.add(discMesh);
  } else if (wheelsId === 'wheels_carbon_tri') {
    // Tri-Spoke Carbon Aero Blades
    for (let i = 0; i < 3; i++) {
      const angle = (i * 2 * Math.PI) / 3;
      const blade = new THREE.Mesh(
        getCachedGeo('tri_blade', () => {
          const g = new THREE.BoxGeometry(rimRadius, 0.045, 0.014);
          g.translate(rimRadius / 2, 0, 0);
          return g;
        }),
        rimMat
      );
      blade.rotation.z = angle;
      spinner.add(blade);
    }
  } else if (wheelsId === 'wheels_hydroblade_mag') {
    // 5-Blade Turbine Mag
    for (let i = 0; i < 5; i++) {
      const angle = (i * 2 * Math.PI) / 5;
      const magBlade = new THREE.Mesh(
        getCachedGeo('mag_blade', () => {
          const g = new THREE.BoxGeometry(rimRadius, 0.035, 0.016);
          g.translate(rimRadius / 2, 0, 0);
          return g;
        }),
        makePBR('#06b6d4', 0.2, 0.8)
      );
      magBlade.rotation.z = angle;
      spinner.add(magBlade);
    }
  } else {
    // Wire Spoke Star (12 crossed spokes)
    const spokeRodGeo = getCachedGeo('wire_spoke', () =>
      new THREE.CylinderGeometry(0.003, 0.003, rimRadius * 2, 6)
    );
    for (let i = 0; i < 8; i++) {
      const spoke = new THREE.Mesh(spokeRodGeo, spokeMat);
      spoke.rotation.z = (i * Math.PI) / 8;
      spinner.add(spoke);
    }
  }

  return spinner;
}

// ----------------------------------------------------------------------------
// 4.4 STEERING BUILDER
// ----------------------------------------------------------------------------
function buildSteeringMesh(steeringId: string, theme: TandemPaintTheme) {
  const steeringGroup = new THREE.Group();
  const frontSteerNode = new THREE.Group();
  frontSteerNode.position.set(0.70, 0.85, 0); // Head tube center

  const chromeMat = makePBR('#e2e8f0', 0.15, 0.88);
  const gripMat = makePBR('#0f172a', 0.7, 0.1);
  const forkMat = makePBR(theme.forkHex || theme.primaryHex, 0.3, 0.5);

  // Fork crown and blades (rotating with steer node)
  const crownGeo = getCachedGeo('fork_crown', () => new THREE.BoxGeometry(0.06, 0.03, 0.12));
  const crown = new THREE.Mesh(crownGeo, forkMat);
  crown.position.set(0, -0.04, 0);
  frontSteerNode.add(crown);

  // Fork blades from crown (relative: 0, -0.04, 0) to front axle (world: 0.90, 0.33, +/-0.06)
  // relative to steer node: (0.90 - 0.70 = 0.20, 0.33 - 0.85 = -0.52)
  const bladeL = createStrutBetween(
    new THREE.Vector3(0, -0.04, -0.05),
    new THREE.Vector3(0.20, -0.52, -0.05),
    0.016,
    forkMat
  );
  const bladeR = createStrutBetween(
    new THREE.Vector3(0, -0.04, 0.05),
    new THREE.Vector3(0.20, -0.52, 0.05),
    0.016,
    forkMat
  );
  frontSteerNode.add(bladeL, bladeR);

  // Captain Handlebars (mounted on stem above head tube)
  const stem = createStrutBetween(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-0.05, 0.10, 0),
    0.018,
    chromeMat
  );
  frontSteerNode.add(stem);

  let captainHandPos = new THREE.Vector3(0.65, 0.95, 0);
  let captainHandSpread = 0.22;

  if (steeringId === 'steering_bullhorn_pursuit') {
    // Bullhorns: forward and curved up
    const barGeo = getCachedGeo('bullhorn_bar', () => new THREE.CylinderGeometry(0.012, 0.012, 0.44, 8).rotateX(Math.PI / 2));
    const bar = new THREE.Mesh(barGeo, chromeMat);
    bar.position.set(-0.05, 0.10, 0);
    const hornL = createStrutBetween(new THREE.Vector3(-0.05, 0.10, -0.22), new THREE.Vector3(0.12, 0.14, -0.22), 0.012, gripMat);
    const hornR = createStrutBetween(new THREE.Vector3(-0.05, 0.10, 0.22), new THREE.Vector3(0.12, 0.14, 0.22), 0.012, gripMat);
    frontSteerNode.add(bar, hornL, hornR);
    captainHandPos = new THREE.Vector3(0.78, 0.98, 0);
    captainHandSpread = 0.22;
  } else if (steeringId === 'steering_ape_hangers') {
    // High-rise ape hangers
    const riseL = createStrutBetween(new THREE.Vector3(-0.05, 0.10, -0.08), new THREE.Vector3(-0.10, 0.35, -0.26), 0.014, chromeMat);
    const riseR = createStrutBetween(new THREE.Vector3(-0.05, 0.10, 0.08), new THREE.Vector3(-0.10, 0.35, 0.26), 0.014, chromeMat);
    const gripL = createStrutBetween(new THREE.Vector3(-0.10, 0.35, -0.26), new THREE.Vector3(-0.16, 0.34, -0.26), 0.016, gripMat);
    const gripR = createStrutBetween(new THREE.Vector3(-0.10, 0.35, 0.26), new THREE.Vector3(-0.16, 0.34, 0.26), 0.016, gripMat);
    frontSteerNode.add(riseL, riseR, gripL, gripR);
    captainHandPos = new THREE.Vector3(0.57, 1.19, 0);
    captainHandSpread = 0.26;
  } else if (steeringId === 'steering_clipon_aero') {
    // Time trial clip-ons
    const bar = new THREE.Mesh(
      getCachedGeo('aero_base_bar', () => new THREE.CylinderGeometry(0.012, 0.012, 0.40, 8).rotateX(Math.PI / 2)),
      chromeMat
    );
    bar.position.set(-0.05, 0.10, 0);
    const extL = createStrutBetween(new THREE.Vector3(-0.05, 0.10, -0.07), new THREE.Vector3(0.18, 0.12, -0.07), 0.011, chromeMat);
    const extR = createStrutBetween(new THREE.Vector3(-0.05, 0.10, 0.07), new THREE.Vector3(0.18, 0.12, 0.07), 0.011, chromeMat);
    frontSteerNode.add(bar, extL, extR);
    captainHandPos = new THREE.Vector3(0.82, 0.96, 0);
    captainHandSpread = 0.07;
  } else {
    // Cruiser / Wide Trail Handlebars
    const barGeo = getCachedGeo('wide_trail_bar', () => new THREE.CylinderGeometry(0.013, 0.013, 0.56, 8).rotateX(Math.PI / 2));
    const bar = new THREE.Mesh(barGeo, chromeMat);
    bar.position.set(-0.05, 0.10, 0);
    const gripGeo = getCachedGeo('bar_grip', () => new THREE.CylinderGeometry(0.016, 0.016, 0.11, 8).rotateX(Math.PI / 2));
    const gripL = new THREE.Mesh(gripGeo, gripMat);
    gripL.position.set(-0.05, 0.10, -0.24);
    const gripR = new THREE.Mesh(gripGeo, gripMat);
    gripR.position.set(-0.05, 0.10, 0.24);
    frontSteerNode.add(bar, gripL, gripR);
    captainHandPos = new THREE.Vector3(0.65, 0.95, 0);
    captainHandSpread = 0.22;
  }

  steeringGroup.add(frontSteerNode);

  // Stoker Handlebars (mounted to Captain seat tube below saddle, rising to X = -0.15, Y = 0.86, Z = 0)
  const stokerBarGroup = new THREE.Group();
  stokerBarGroup.position.set(-0.15, 0.86, 0);
  // Two-piece L-stem routed from Captain's lower seat tube (0.14, 0.62, 0) -> (-0.15, 0.70, 0) -> (-0.15, 0.86, 0)
  const stokerBoom = createStrutBetween(
    new THREE.Vector3(0.29, -0.24, 0),
    new THREE.Vector3(0, -0.16, 0),
    0.015,
    chromeMat
  );
  const stokerRiser = createStrutBetween(
    new THREE.Vector3(0, -0.16, 0),
    new THREE.Vector3(0, 0, 0),
    0.015,
    chromeMat
  );
  const stokerBarMesh = new THREE.Mesh(
    getCachedGeo('stoker_bar_mesh', () => new THREE.CylinderGeometry(0.013, 0.013, 0.48, 8).rotateX(Math.PI / 2)),
    chromeMat
  );
  const stokerGripGeo = getCachedGeo('stoker_grip_mesh', () => new THREE.CylinderGeometry(0.016, 0.016, 0.10, 8).rotateX(Math.PI / 2));
  const stokerGripL = new THREE.Mesh(stokerGripGeo, gripMat);
  stokerGripL.position.set(0, 0, -0.20);
  const stokerGripR = new THREE.Mesh(stokerGripGeo, gripMat);
  stokerGripR.position.set(0, 0, 0.20);
  stokerBarGroup.add(stokerBoom, stokerRiser, stokerBarMesh, stokerGripL, stokerGripR);
  steeringGroup.add(stokerBarGroup);

  return { steeringGroup, frontSteerNode, captainHandPos, captainHandSpread };
}

// ----------------------------------------------------------------------------
// 4.5 STABILIZERS BUILDER
// ----------------------------------------------------------------------------
function buildStabilizerMesh(stabilizerId: string, theme: TandemPaintTheme) {
  const group = new THREE.Group();
  const gyroSpinners: THREE.Object3D[] = [];

  const catalogPart = getTandemPartById(stabilizerId, 'stabilizer');
  const spanFt = catalogPart.stats.outriggerWidthFt;
  const spanM = spanFt * 0.3048;
  const halfSpan = spanM / 2;

  const strutMat = makePBR('#cbd5e1', 0.25, 0.8);
  const wheelMat = makePBR('#0f172a', 0.6, 0.2);

  const mountPtL = new THREE.Vector3(-0.65, 0.28, -0.08);
  const mountPtR = new THREE.Vector3(-0.65, 0.28, 0.08);

  if (stabilizerId === 'stabilizer_bare' || spanFt <= 0.1) {
    // Minimal titanium axle caps only
    const capGeo = getCachedGeo('ti_caps', () => new THREE.CylinderGeometry(0.02, 0.02, 0.04, 12).rotateX(Math.PI / 2));
    const capL = new THREE.Mesh(capGeo, makePBR('#f8fafc', 0.1, 0.95));
    capL.position.copy(mountPtL);
    const capR = new THREE.Mesh(capGeo, makePBR('#f8fafc', 0.1, 0.95));
    capR.position.copy(mountPtR);
    group.add(capL, capR);
  } else if (stabilizerId === 'stabilizer_pool_pontoons') {
    // Bamboo/carbon spars with neon foam pool noodles
    const noodleGeo = getCachedGeo('pool_noodle', () => new THREE.CylinderGeometry(0.06, 0.06, 0.70, 16).rotateZ(Math.PI / 2));
    const noodleMatL = makePBR('#06b6d4', 0.5, 0.1); // Cyan port
    const noodleMatR = makePBR('#ec4899', 0.5, 0.1); // Magenta starboard

    const sparL = createStrutBetween(mountPtL, new THREE.Vector3(-0.65, 0.12, -halfSpan), 0.014, strutMat);
    const sparR = createStrutBetween(mountPtR, new THREE.Vector3(-0.65, 0.12, halfSpan), 0.014, strutMat);

    const noodleL = new THREE.Mesh(noodleGeo, noodleMatL);
    noodleL.position.set(-0.65, 0.08, -halfSpan);
    const noodleR = new THREE.Mesh(noodleGeo, noodleMatR);
    noodleR.position.set(-0.65, 0.08, halfSpan);

    group.add(sparL, sparR, noodleL, noodleR);
  } else if (stabilizerId === 'stabilizer_hydroskis') {
    // Curved carbon planing hydroskis
    const skiGeo = getCachedGeo('hydroski', () => {
      const g = new THREE.BoxGeometry(0.60, 0.018, 0.08);
      return g;
    });
    const skiMat = makePBR('#1e293b', 0.3, 0.7);

    const sparL = createStrutBetween(mountPtL, new THREE.Vector3(-0.65, 0.08, -halfSpan), 0.014, strutMat);
    const sparR = createStrutBetween(mountPtR, new THREE.Vector3(-0.65, 0.08, halfSpan), 0.014, strutMat);

    const skiL = new THREE.Mesh(skiGeo, skiMat);
    skiL.position.set(-0.65, 0.04, -halfSpan);
    const skiR = new THREE.Mesh(skiGeo, skiMat);
    skiR.position.set(-0.65, 0.04, halfSpan);

    group.add(sparL, sparR, skiL, skiR);
  } else if (stabilizerId === 'stabilizer_gyro_flywheel') {
    // Brass flywheel gyro pod
    const podGeo = getCachedGeo('gyro_pod', () => new THREE.CylinderGeometry(0.08, 0.08, 0.14, 16).rotateX(Math.PI / 2));
    const pod = new THREE.Mesh(podGeo, makePBR('#334155', 0.3, 0.7));
    pod.position.set(-0.55, 0.18, 0);

    const flywheelGeo = getCachedGeo('gyro_disc', () => new THREE.CylinderGeometry(0.07, 0.07, 0.02, 24).rotateX(Math.PI / 2));
    const flywheelMat = makePBR('#facc15', 0.2, 0.9);
    const flywheelL = new THREE.Mesh(flywheelGeo, flywheelMat);
    flywheelL.position.set(-0.55, 0.18, -0.05);
    const flywheelR = new THREE.Mesh(flywheelGeo, flywheelMat);
    flywheelR.position.set(-0.55, 0.18, 0.05);

    group.add(pod, flywheelL, flywheelR);
    gyroSpinners.push(flywheelL, flywheelR);
  } else if (stabilizerId === 'stabilizer_counterweight') {
    // Deep keel with streamlined lead bulb
    const keel = createStrutBetween(
      new THREE.Vector3(-0.55, 0.28, 0),
      new THREE.Vector3(-0.55, -0.22, 0),
      0.018,
      strutMat
    );
    const bulbGeo = getCachedGeo('keel_bulb', () => new THREE.SphereGeometry(0.08, 14, 12).scale(1.8, 1.0, 1.0));
    const bulb = new THREE.Mesh(bulbGeo, makePBR('#475569', 0.3, 0.8));
    bulb.position.set(-0.55, -0.22, 0);
    group.add(keel, bulb);
  } else if (stabilizerId === 'stabilizer_rb_canards') {
    // Red Bull carbon dive planes
    const canardGeo = getCachedGeo('rb_canard', () => new THREE.BoxGeometry(0.24, 0.015, halfSpan));
    const canardL = new THREE.Mesh(canardGeo, makePBR('#1e293b', 0.3, 0.8));
    canardL.position.set(-0.65, 0.32, -halfSpan / 2);
    const canardR = new THREE.Mesh(canardGeo, makePBR('#1e293b', 0.3, 0.8));
    canardR.position.set(-0.65, 0.32, halfSpan / 2);
    group.add(canardL, canardR);
  } else {
    // Training Wheels (default)
    const outriggerWheelGeo = getCachedGeo('outrigger_wheel', () =>
      new THREE.TorusGeometry(0.075, 0.02, 10, 24)
    );
    const strutL = createStrutBetween(mountPtL, new THREE.Vector3(-0.65, 0.09, -halfSpan), 0.014, strutMat);
    const strutR = createStrutBetween(mountPtR, new THREE.Vector3(-0.65, 0.09, halfSpan), 0.014, strutMat);

    const wheelL = new THREE.Mesh(outriggerWheelGeo, wheelMat);
    wheelL.position.set(-0.65, 0.09, -halfSpan);
    const wheelR = new THREE.Mesh(outriggerWheelGeo, wheelMat);
    wheelR.position.set(-0.65, 0.09, halfSpan);

    group.add(strutL, strutR, wheelL, wheelR);
  }

  return { group, gyroSpinners, outriggerSpanM: spanM };
}

// ----------------------------------------------------------------------------
// 4.6 TOPPER & CANINE MASCOT BUILDERS
// ----------------------------------------------------------------------------
function buildTopperMesh(topperId: string, theme: TandemPaintTheme) {
  const group = new THREE.Group();
  const animNodes: TandemBike3DGroups['topperAnimNodes'] = {};
  const rackMetalMat = makePBR('#94a3b8', 0.25, 0.85);
  const rackWoodMat = makePBR('#92400e', 0.70, 0.05);

  if (topperId === 'topper_shadow') {
    // SHADOW the Golden Retriever 🦮
    // Seated in front wicker basket at (shadowBasketX = 0.85, shadowBasketY = 0.88)
    const dogRoot = new THREE.Group();
    dogRoot.position.set(TANDEM_GEOMETRY.shadowBasketX, TANDEM_GEOMETRY.shadowBasketY, 0);
    dogRoot.scale.set(0.76, 0.76, 0.76);

    const coatMat = makePBR('#d4a373', 0.75, 0.05); // Golden coat
    const creamMat = makePBR('#fef3c7', 0.80, 0.05); // Cream chest ruff
    const bandanaMat = makePBR('#ef4444', 0.60, 0.05); // Red bandana
    const snoutMat = makePBR('#0f172a', 0.20, 0.10); // Glossy black nose
    const tongueMat = makePBR('#f43f5e', 0.35, 0.05); // Pink tongue
    const basketMat = makePBR('#b45309', 0.85, 0.05); // Wicker basket

    // Front wicker basket & headtube mount struts
    const basketMesh = new THREE.Mesh(
      getCachedGeo('shadow_wicker_basket', () => new THREE.CylinderGeometry(0.22, 0.18, 0.22, 14)),
      basketMat
    );
    basketMesh.position.set(0.06, 0.04, 0);
    const mountL = createStrutBetween(new THREE.Vector3(-0.20, -0.04, -0.05), new THREE.Vector3(0.04, 0.02, -0.08), 0.015, rackMetalMat);
    const mountR = createStrutBetween(new THREE.Vector3(-0.20, -0.04, 0.05), new THREE.Vector3(0.04, 0.02, 0.08), 0.015, rackMetalMat);

    // Rounded capsule torso (no flat cylinder top rim behind neck!)
    const torsoGeo = getCachedGeo('shadow_torso_cap', () =>
      new THREE.CapsuleGeometry(0.145, 0.24, 10, 14).rotateZ(-0.22)
    );
    const torso = new THREE.Mesh(torsoGeo, coatMat);
    torso.position.set(0.08, 0.22, 0);

    // Cream chest ruff
    const ruffGeo = getCachedGeo('shadow_ruff', () => new THREE.DodecahedronGeometry(0.14, 1));
    const ruff = new THREE.Mesh(ruffGeo, creamMat);
    ruff.position.set(0.18, 0.28, 0);

    // Seated rear haunches tucked cleanly inside wicker basket
    const haunchGeo = getCachedGeo('shadow_haunch_tucked', () => new THREE.SphereGeometry(0.085, 10, 10));
    const haunchL = new THREE.Mesh(haunchGeo, coatMat);
    haunchL.position.set(0.02, 0.11, -0.06);
    const haunchR = new THREE.Mesh(haunchGeo, coatMat);
    haunchR.position.set(0.02, 0.11, 0.06);

    // Front legs & paws resting on basket rim
    const legGeo = getCachedGeo('shadow_front_leg', () => new THREE.CylinderGeometry(0.04, 0.035, 0.26, 8));
    const legL = new THREE.Mesh(legGeo, coatMat);
    legL.position.set(0.18, 0.14, -0.08);
    const legR = new THREE.Mesh(legGeo, coatMat);
    legR.position.set(0.18, 0.14, 0.08);

    // Red Bandana Collar
    const collarGeo = getCachedGeo('shadow_collar', () => new THREE.TorusGeometry(0.13, 0.028, 8, 16));
    const collar = new THREE.Mesh(collarGeo, bandanaMat);
    collar.position.set(0.18, 0.38, 0);
    collar.rotation.x = Math.PI / 2;

    // Head
    const headGroup = new THREE.Group();
    headGroup.position.set(0.22, 0.48, 0);

    const cranium = new THREE.Mesh(
      getCachedGeo('shadow_cranium', () => new THREE.SphereGeometry(0.14, 12, 12)),
      coatMat
    );

    const muzzle = new THREE.Mesh(
      getCachedGeo('shadow_muzzle', () => new THREE.BoxGeometry(0.14, 0.09, 0.10)),
      creamMat
    );
    muzzle.position.set(0.11, -0.02, 0);

    const nose = new THREE.Mesh(
      getCachedGeo('shadow_nose', () => new THREE.SphereGeometry(0.03, 8, 8)),
      snoutMat
    );
    nose.position.set(0.19, 0.01, 0);

    const tongue = new THREE.Mesh(
      getCachedGeo('shadow_tongue', () => new THREE.BoxGeometry(0.08, 0.018, 0.05)),
      tongueMat
    );
    tongue.position.set(0.13, -0.06, 0.02);

    // Floppy ears
    const earGeo = getCachedGeo('shadow_ear', () => new THREE.BoxGeometry(0.06, 0.16, 0.03));
    const earL = new THREE.Mesh(earGeo, coatMat);
    earL.position.set(-0.02, -0.04, -0.14);
    earL.rotation.z = -0.2;
    const earR = new THREE.Mesh(earGeo, coatMat);
    earR.position.set(-0.02, -0.04, 0.14);
    earR.rotation.z = -0.2;

    headGroup.add(cranium, muzzle, nose, tongue, earL, earR);

    // Wagging tail pivot
    const tailPivot = new THREE.Group();
    tailPivot.position.set(-0.16, 0.30, 0);
    const tailMesh = new THREE.Mesh(
      getCachedGeo('shadow_tail', () => {
        const g = new THREE.ConeGeometry(0.05, 0.30, 8);
        g.rotateZ(Math.PI / 4);
        g.translate(-0.10, 0.10, 0);
        return g;
      }),
      coatMat
    );
    tailPivot.add(tailMesh);
    animNodes.shadowTail = tailPivot;

    dogRoot.add(basketMesh, mountL, mountR, torso, ruff, haunchL, haunchR, legL, legR, collar, headGroup, tailPivot);
    group.add(dogRoot);
  } else if (topperId === 'topper_boomer') {
    // BOOMER the Great Dane 🐶
    // Standing on rear cargo rack platform: X = -0.92, Y = 0.68, Z = 0
    const boomerRoot = new THREE.Group();
    boomerRoot.position.set(TANDEM_GEOMETRY.boomerPerchX, TANDEM_GEOMETRY.boomerPerchY, 0);
    boomerRoot.scale.set(0.84, 0.84, 0.84);

    const coatMat = makePBR('#334155', 0.65, 0.05); // Slate / Blue coat
    const whiteMat = makePBR('#f8fafc', 0.70, 0.05); // Harlequin white blaze
    const collarMat = makePBR('#2563eb', 0.40, 0.10); // Royal blue collar
    const noseMat = makePBR('#0f172a', 0.20, 0.10);

    // Rear cargo rack deck & stays under Boomer's paws
    const rackDeck = new THREE.Mesh(
      getCachedGeo('boomer_rack_deck', () => new THREE.BoxGeometry(0.46, 0.024, 0.28)),
      rackWoodMat
    );
    rackDeck.position.set(-0.08, 0.01, 0);
    const stayL = createStrutBetween(new THREE.Vector3(0.02, -0.38, -0.09), new THREE.Vector3(-0.08, 0.0, -0.11), 0.014, rackMetalMat);
    const stayR = createStrutBetween(new THREE.Vector3(0.02, -0.38, 0.09), new THREE.Vector3(-0.08, 0.0, 0.11), 0.014, rackMetalMat);

    // Athletic long legs (standing stance: y = 0.22 preserves forensic test 0.15 < y < 0.30)
    const legGeo = getCachedGeo('boomer_leg', () => new THREE.CylinderGeometry(0.042, 0.035, 0.44, 8));
    const frontL = new THREE.Mesh(legGeo, coatMat);
    frontL.position.set(0.04, 0.22, -0.10);
    const frontR = new THREE.Mesh(legGeo, coatMat);
    frontR.position.set(0.04, 0.22, 0.10);
    const rearL = new THREE.Mesh(legGeo, coatMat);
    rearL.position.set(-0.22, 0.22, -0.10);
    const rearR = new THREE.Mesh(legGeo, coatMat);
    rearR.position.set(-0.22, 0.22, 0.10);

    // Barrel chest & tucked waist
    const chestGeo = getCachedGeo('boomer_chest', () => new THREE.SphereGeometry(0.18, 12, 10).scale(1.3, 1.1, 0.85));
    const chest = new THREE.Mesh(chestGeo, whiteMat);
    chest.position.set(-0.03, 0.46, 0);

    const waistGeo = getCachedGeo('boomer_waist', () => new THREE.CylinderGeometry(0.11, 0.15, 0.32, 10).rotateZ(Math.PI / 2));
    const waist = new THREE.Mesh(waistGeo, coatMat);
    waist.position.set(-0.17, 0.44, 0);

    // Arched neck
    const neck = createStrutBetween(
      new THREE.Vector3(0.01, 0.50, 0),
      new THREE.Vector3(0.10, 0.74, 0),
      0.09,
      coatMat
    );

    // Royal Blue Studded Collar
    const collar = new THREE.Mesh(
      getCachedGeo('boomer_collar', () => new THREE.TorusGeometry(0.10, 0.022, 8, 16)),
      collarMat
    );
    collar.position.set(0.08, 0.68, 0);
    collar.rotation.x = Math.PI / 2;

    // Sculpted Great Dane Head
    const headGroup = new THREE.Group();
    headGroup.position.set(0.12, 0.82, 0);

    const skull = new THREE.Mesh(
      getCachedGeo('boomer_skull', () => new THREE.BoxGeometry(0.18, 0.14, 0.14)),
      coatMat
    );

    const squareMuzzle = new THREE.Mesh(
      getCachedGeo('boomer_muzzle', () => new THREE.BoxGeometry(0.18, 0.10, 0.11)),
      whiteMat
    );
    squareMuzzle.position.set(0.14, -0.02, 0);

    const nose = new THREE.Mesh(
      getCachedGeo('boomer_nose', () => new THREE.BoxGeometry(0.04, 0.04, 0.06)),
      noseMat
    );
    nose.position.set(0.24, 0.01, 0);

    // Tall alert pointed cropped ears
    const earGeo = getCachedGeo('boomer_ear', () => new THREE.ConeGeometry(0.04, 0.18, 4));
    const earL = new THREE.Mesh(earGeo, coatMat);
    earL.position.set(-0.02, 0.12, -0.06);
    earL.rotation.z = -0.15;
    const earR = new THREE.Mesh(earGeo, coatMat);
    earR.position.set(-0.02, 0.12, 0.06);
    earR.rotation.z = -0.15;

    headGroup.add(skull, squareMuzzle, nose, earL, earR);

    // Sleek whip tail pivot
    const tailPivot = new THREE.Group();
    tailPivot.position.set(-0.29, 0.45, 0);
    const tailMesh = createStrutBetween(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(-0.25, 0.12, 0),
      0.02,
      coatMat
    );
    tailPivot.add(tailMesh);
    animNodes.boomerTail = tailPivot;

    boomerRoot.add(rackDeck, stayL, stayR, frontL, frontR, rearL, rearR, chest, waist, neck, collar, headGroup, tailPivot);
    group.add(boomerRoot);
  } else if (topperId === 'topper_bull_horns') {
    // Red Bull Gold Bull Horns (mounted at Captain stem X = 0.70, Y = 0.95)
    const hornRoot = new THREE.Group();
    hornRoot.position.set(0.70, 0.95, 0);

    const goldMat = makePBR('#facc15', 0.15, 0.90);
    const hornL = createStrutBetween(new THREE.Vector3(0, 0, -0.06), new THREE.Vector3(0.18, 0.22, -0.28), 0.026, goldMat);
    const hornR = createStrutBetween(new THREE.Vector3(0, 0, 0.06), new THREE.Vector3(0.18, 0.22, 0.28), 0.026, goldMat);
    hornRoot.add(hornL, hornR);
    group.add(hornRoot);
  } else if (topperId === 'topper_rb_wings') {
    // Dual Red Bull Aerodynamic Wings (mounted on rear aero pylon clear of Stoker)
    const wingRoot = new THREE.Group();
    wingRoot.position.set(-0.96, 0.92, 0);

    const wingMat = makePBR('#1e293b', 0.25, 0.7); // Navy carbon
    const redMat = makePBR('#ef4444', 0.3, 0.4);

    // Support pylon to rear dropouts
    const pylonL = createStrutBetween(new THREE.Vector3(0.06, -0.58, -0.07), new THREE.Vector3(0, 0, -0.10), 0.015, rackMetalMat);
    const pylonR = createStrutBetween(new THREE.Vector3(0.06, -0.58, 0.07), new THREE.Vector3(0, 0, 0.10), 0.015, rackMetalMat);

    // Left & Right Wings (1.90m total span)
    const wingGeo = getCachedGeo('rb_wing_span', () => new THREE.BoxGeometry(0.36, 0.025, 1.90));
    const mainWing = new THREE.Mesh(wingGeo, wingMat);

    // Vertical winglets
    const wingletGeo = getCachedGeo('winglet', () => new THREE.BoxGeometry(0.24, 0.16, 0.02));
    const wingletL = new THREE.Mesh(wingletGeo, redMat);
    wingletL.position.set(0, 0.08, -0.95);
    const wingletR = new THREE.Mesh(wingletGeo, redMat);
    wingletR.position.set(0, 0.08, 0.95);

    wingRoot.add(pylonL, pylonR, mainWing, wingletL, wingletR);
    group.add(wingRoot);
  } else if (topperId === 'topper_aero_fin') {
    // Carbon Dolphin Aero Fin (rear rack pylon X = -0.94, Y = 0.76)
    const finRoot = new THREE.Group();
    finRoot.position.set(-0.94, 0.76, 0);

    const stayL = createStrutBetween(new THREE.Vector3(0.04, -0.43, -0.07), new THREE.Vector3(0, 0, 0), 0.014, rackMetalMat);
    const stayR = createStrutBetween(new THREE.Vector3(0.04, -0.43, 0.07), new THREE.Vector3(0, 0, 0), 0.014, rackMetalMat);

    const finGeo = getCachedGeo('dorsal_fin', () => {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(0.35, 0);
      shape.lineTo(0.18, 0.42);
      shape.lineTo(0.05, 0.38);
      shape.closePath();
      return new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false });
    });
    const finMesh = new THREE.Mesh(finGeo, makePBR('#0284c7', 0.2, 0.8));
    finMesh.position.set(-0.20, 0, -0.01);
    finRoot.add(stayL, stayR, finMesh);
    group.add(finRoot);
  } else if (topperId === 'topper_golden_bell') {
    // Giant Pier Finish Bell (arched over rear wheel X = -0.94, Y = 1.02)
    const bellRoot = new THREE.Group();
    bellRoot.position.set(-0.94, 1.02, 0);

    const archL = createStrutBetween(new THREE.Vector3(0.04, -0.69, -0.09), new THREE.Vector3(0, 0.14, -0.12), 0.015, rackMetalMat);
    const archR = createStrutBetween(new THREE.Vector3(0.04, -0.69, 0.09), new THREE.Vector3(0, 0.14, 0.12), 0.015, rackMetalMat);
    const crossBar = createStrutBetween(new THREE.Vector3(0, 0.14, -0.14), new THREE.Vector3(0, 0.14, 0.14), 0.016, rackMetalMat);

    const bronzeMat = makePBR('#f59e0b', 0.20, 0.90);
    const bellGeo = getCachedGeo('golden_bell_mesh', () =>
      new THREE.CylinderGeometry(0.08, 0.20, 0.24, 16)
    );
    const bell = new THREE.Mesh(bellGeo, bronzeMat);

    const clapperPivot = new THREE.Group();
    clapperPivot.position.set(0, -0.08, 0);
    const clapperMesh = new THREE.Mesh(
      getCachedGeo('clapper_ball', () => new THREE.SphereGeometry(0.04, 8, 8)),
      makePBR('#ef4444', 0.3, 0.5)
    );
    clapperPivot.add(clapperMesh);
    animNodes.bellClapper = clapperPivot;

    bellRoot.add(archL, archR, crossBar, bell, clapperPivot);
    group.add(bellRoot);
  } else if (topperId === 'topper_stratos') {
    // Red Bull Stratos Supersonic Capsule (rear cargo rack X = -0.98, Y = 0.86)
    const capsuleRoot = new THREE.Group();
    capsuleRoot.position.set(-0.98, 0.86, 0);

    const stayL = createStrutBetween(new THREE.Vector3(0.08, -0.53, -0.08), new THREE.Vector3(0, -0.19, -0.10), 0.014, rackMetalMat);
    const stayR = createStrutBetween(new THREE.Vector3(0.08, -0.53, 0.08), new THREE.Vector3(0, -0.19, 0.10), 0.014, rackMetalMat);

    const capsuleMat = makePBR('#f8fafc', 0.2, 0.6);
    const visorMat = makePBR('#0f172a', 0.05, 0.95);

    const bodyGeo = getCachedGeo('stratos_body', () => new THREE.CylinderGeometry(0.16, 0.16, 0.34, 16));
    const body = new THREE.Mesh(bodyGeo, capsuleMat);

    const domeGeo = getCachedGeo('stratos_dome', () => new THREE.SphereGeometry(0.16, 16, 12));
    const dome = new THREE.Mesh(domeGeo, visorMat);
    dome.position.y = 0.17;

    capsuleRoot.add(stayL, stayR, body, dome);
    group.add(capsuleRoot);
  }

  return { group, animNodes };
}

// ----------------------------------------------------------------------------
// 4.7 2-PERSON CREW & ANALYTICAL 2-BONE INVERSE KINEMATICS
// ----------------------------------------------------------------------------
function buildCrewMember(
  hipPos: THREE.Vector3,
  shoulderPos: THREE.Vector3,
  handsPos: THREE.Vector3,
  bbPos: THREE.Vector3,
  isCaptain: boolean,
  theme: TandemPaintTheme,
  handSpreadZ = 0.18
) {
  const crewGroup = new THREE.Group();

  const jerseyMat = makePBR(theme.primaryHex, 0.45, 0.1);
  const helmetMat = makePBR(theme.secondaryHex, 0.20, 0.5);
  const skinMat = makePBR('#fcd34d', 0.60, 0.0);
  const visorMat = makePBR('#0f172a', 0.10, 0.9);
  const shoeMat = makePBR('#0f172a', 0.40, 0.2);

  // Torso with rounded shoulder and pelvis caps
  const torsoMesh = createStrutBetween(hipPos, shoulderPos, 0.135, jerseyMat);
  const torsoCapGeo = getCachedGeo('crew_torso_cap', () => new THREE.SphereGeometry(0.135, 14, 12));
  const shoulderCap = new THREE.Mesh(torsoCapGeo, jerseyMat);
  shoulderCap.position.copy(shoulderPos);
  const hipCap = new THREE.Mesh(torsoCapGeo, shoeMat);
  hipCap.position.copy(hipPos);
  crewGroup.add(torsoMesh, shoulderCap, hipCap);

  // Head, Neck & Helmet
  const headPos = shoulderPos.clone().add(new THREE.Vector3(0.04, 0.18, 0));
  const neckMesh = createStrutBetween(shoulderPos, headPos, 0.052, skinMat);
  const helmetGeo = getCachedGeo('crew_helmet', () => new THREE.SphereGeometry(0.13, 12, 10));
  const helmet = new THREE.Mesh(helmetGeo, helmetMat);
  helmet.position.copy(headPos);

  const visorGeo = getCachedGeo('crew_visor', () => new THREE.BoxGeometry(0.14, 0.06, 0.16));
  const visor = new THREE.Mesh(visorGeo, visorMat);
  visor.position.copy(headPos).add(new THREE.Vector3(0.06, 0, 0));
  crewGroup.add(neckMesh, helmet, visor);

  // Arms locked to handlebars with deltoid shoulder joints and gloves
  const shoulderL = shoulderPos.clone().add(new THREE.Vector3(0, -0.01, -0.15));
  const shoulderR = shoulderPos.clone().add(new THREE.Vector3(0, -0.01, 0.15));
  const handL = handsPos.clone().add(new THREE.Vector3(0, 0, -handSpreadZ));
  const handR = handsPos.clone().add(new THREE.Vector3(0, 0, handSpreadZ));

  const deltoidGeo = getCachedGeo('crew_deltoid', () => new THREE.SphereGeometry(0.054, 10, 10));
  const deltoidL = new THREE.Mesh(deltoidGeo, jerseyMat);
  deltoidL.position.copy(shoulderL);
  const deltoidR = new THREE.Mesh(deltoidGeo, jerseyMat);
  deltoidR.position.copy(shoulderR);

  const gloveGeo = getCachedGeo('crew_glove', () => new THREE.SphereGeometry(0.042, 8, 8));
  const gloveL = new THREE.Mesh(gloveGeo, shoeMat);
  gloveL.position.copy(handL);
  const gloveR = new THREE.Mesh(gloveGeo, shoeMat);
  gloveR.position.copy(handR);

  const armL = createStrutBetween(shoulderL, handL, 0.04, jerseyMat);
  const armR = createStrutBetween(shoulderR, handR, 0.04, jerseyMat);
  crewGroup.add(deltoidL, deltoidR, armL, armR, gloveL, gloveR);

  // Legs setup for dynamic 2-bone IK solver
  const makeLegNodes = (isLeft: boolean): LegIKChain => {
    const hipOffsetZ = isLeft ? -0.11 : 0.11;
    const legHip = hipPos.clone().add(new THREE.Vector3(0, 0, hipOffsetZ));

    const thighMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.048, 0.040, TANDEM_GEOMETRY.thighLengthM, 8),
      jerseyMat
    );
    thighMesh.castShadow = true;

    const kneeJoint = new THREE.Mesh(
      new THREE.SphereGeometry(0.048, 8, 8),
      skinMat
    );

    const shankMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.040, 0.032, TANDEM_GEOMETRY.shankLengthM, 8),
      skinMat
    );
    shankMesh.castShadow = true;

    const footMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.04, 0.06),
      shoeMat
    );

    crewGroup.add(thighMesh, kneeJoint, shankMesh, footMesh);

    return {
      hipPos: legHip,
      thighMesh,
      kneeJoint,
      shankMesh,
      footMesh,
      isLeft,
      bbX: bbPos.x,
      bbY: bbPos.y,
    };
  };

  const legL = makeLegNodes(true);
  const legR = makeLegNodes(false);

  return { crewGroup, legL, legR };
}

const _ikUpAxis = new THREE.Vector3(0, 1, 0);
const _ikKneePos = new THREE.Vector3();
const _ikPedalPos = new THREE.Vector3();
const _ikDir = new THREE.Vector3();

// Analytical Closed-form 2-bone Inverse Kinematics solver
export function updateCrewLegIK(leg: LegIKChain, crankAngleRad: number): void {
  const L1 = TANDEM_GEOMETRY.thighLengthM;
  const L2 = TANDEM_GEOMETRY.shankLengthM;
  const Rc = TANDEM_GEOMETRY.crankRadiusM;

  // Compute instantaneous pedal coordinate
  const angle = leg.isLeft ? crankAngleRad + Math.PI : crankAngleRad;
  const pedalX = leg.bbX + Rc * Math.cos(angle);
  const pedalY = leg.bbY + Rc * Math.sin(angle);
  const pedalZ = leg.hipPos.z;

  const hipX = leg.hipPos.x;
  const hipY = leg.hipPos.y;

  // Planar hip-to-pedal vector
  const vx = pedalX - hipX;
  const vy = pedalY - hipY;
  let d = Math.hypot(vx, vy);

  // Clamp distance within reachable domain
  const maxReach = (L1 + L2) * 0.998;
  const minReach = Math.abs(L1 - L2) + 0.02;
  d = Math.max(minReach, Math.min(maxReach, d));

  // Law of Cosines for knee interior angle
  const cosBeta = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
  const beta = Math.acos(Math.max(-1, Math.min(1, cosBeta)));
  const phi = Math.atan2(vy, vx);

  // Human cyclists extend knees forward (+X direction)
  const thighAngle = phi - beta;

  const kneeX = hipX + L1 * Math.cos(thighAngle);
  const kneeY = hipY + L1 * Math.sin(thighAngle);
  const kneeZ = leg.hipPos.z + (leg.isLeft ? -0.015 : 0.015);

  _ikKneePos.set(kneeX, kneeY, kneeZ);
  _ikPedalPos.set(pedalX, pedalY, pedalZ);

  // 1. Position & Orient Thigh Cylinder
  leg.thighMesh.position.addVectors(leg.hipPos, _ikKneePos).multiplyScalar(0.5);
  _ikDir.subVectors(_ikKneePos, leg.hipPos).normalize();
  leg.thighMesh.quaternion.setFromUnitVectors(_ikUpAxis, _ikDir);

  // 2. Position Knee Joint
  leg.kneeJoint.position.copy(_ikKneePos);

  // 3. Position & Orient Shank Cylinder
  leg.shankMesh.position.addVectors(_ikKneePos, _ikPedalPos).multiplyScalar(0.5);
  _ikDir.subVectors(_ikPedalPos, _ikKneePos).normalize();
  leg.shankMesh.quaternion.setFromUnitVectors(_ikUpAxis, _ikDir);

  // 4. Position Foot / Shoe
  leg.footMesh.position.copy(_ikPedalPos);
  leg.footMesh.rotation.set(0, 0, 0); // Flat on pedal
}

// ============================================================================
// 5. SOCKET MARKERS BUILDER
// ============================================================================
function buildSocketMarkers(): {
  markers: Record<TandemCategory, THREE.Mesh>;
  list: THREE.Mesh[];
  group: THREE.Group;
} {
  const group = new THREE.Group();
  const list: THREE.Mesh[] = [];
  const markers = {} as Record<TandemCategory, THREE.Mesh>;

  const ringGeo = getCachedGeo('socket_marker_torus', () =>
    new THREE.TorusGeometry(0.085, 0.014, 12, 28)
  );

  (Object.keys(TANDEM_SOCKET_POSITIONS) as TandemCategory[]).forEach((cat) => {
    const pos = TANDEM_SOCKET_POSITIONS[cat];
    const mat = makeBasic('#38bdf8', true, 0.85);
    const mesh = new THREE.Mesh(ringGeo, mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.rotation.y = 0; // Facing side profile cleanly in XY plane
    mesh.userData = { category: cat, isSocketMarker: true };
    group.add(mesh);
    markers[cat] = mesh;
    list.push(mesh);
  });

  return { markers, list, group };
}

// ============================================================================
// 6. MAIN BUILDER & ANIMATOR
// ============================================================================

export function buildTandemBike3D(rawLoadout: TandemLoadout): TandemBike3DGroups {
  const loadout = sanitizeLoadout(rawLoadout);
  const theme = getTandemPaintThemeById(loadout.paintThemeId);

  const root = new THREE.Group();
  root.name = 'TandemBikeRoot';

  // 1. Frame
  const frameGroup = buildFrameMesh(loadout.frameId, theme);
  root.add(frameGroup);

  // 2. Drivetrain
  const { group: drivetrainGroup, crankSpinners } = buildDrivetrainMesh(loadout.drivetrainId, theme);
  root.add(drivetrainGroup);

  // 3. Wheels
  const wheelsGroup = new THREE.Group();
  const frontWheelSpinner = buildSingleWheel(loadout.wheelsId, theme, true);
  frontWheelSpinner.position.set(0.20, -0.52, 0); // relative to frontSteerNode axle
  const rearWheelSpinner = buildSingleWheel(loadout.wheelsId, theme, false);
  rearWheelSpinner.position.set(-0.90, 0.33, 0); // fixed in frame dropouts
  wheelsGroup.add(rearWheelSpinner);
  root.add(wheelsGroup);

  // 4. Steering (holds front wheel)
  const { steeringGroup, frontSteerNode, captainHandPos, captainHandSpread } = buildSteeringMesh(loadout.steeringId, theme);
  frontSteerNode.add(frontWheelSpinner);
  root.add(steeringGroup);

  // 5. Stabilizers
  const { group: stabilizerGroup, gyroSpinners, outriggerSpanM } = buildStabilizerMesh(loadout.stabilizerId, theme);
  root.add(stabilizerGroup);

  // 6. Toppers (including Shadow and Boomer mascots)
  const { group: topperGroup, animNodes: topperAnimNodes } = buildTopperMesh(loadout.topperId, theme);
  root.add(topperGroup);

  // 7. 2-Person Crew (Captain & Stoker)
  const crewGroup = new THREE.Group();
  const captain = buildCrewMember(
    new THREE.Vector3(0.10, 0.78, 0), // hip
    new THREE.Vector3(0.24, 1.12, 0), // shoulder
    captainHandPos, // hands aligned to active handlebar grips
    new THREE.Vector3(0.25, 0.28, 0), // bb1
    true,
    theme,
    captainHandSpread
  );
  const stoker = buildCrewMember(
    new THREE.Vector3(-0.70, 0.74, 0), // hip
    new THREE.Vector3(-0.56, 1.08, 0), // shoulder
    new THREE.Vector3(-0.15, 0.86, 0), // hands on stoker bar
    new THREE.Vector3(-0.55, 0.28, 0), // bb2
    false,
    theme,
    0.20
  );
  crewGroup.add(captain.crewGroup, stoker.crewGroup);
  root.add(crewGroup);

  // Initial IK alignment
  updateCrewLegIK(captain.legL, 0);
  updateCrewLegIK(captain.legR, 0);
  updateCrewLegIK(stoker.legL, 0);
  updateCrewLegIK(stoker.legR, 0);

  // 8. Socket Markers
  const { markers: socketMarkers, list: socketMarkerList, group: socketGroup } = buildSocketMarkers();
  root.add(socketGroup);

  return {
    root,
    frameGroup,
    drivetrainGroup,
    wheelsGroup,
    steeringGroup,
    stabilizerGroup,
    topperGroup,
    crewGroup,
    frontSteerNode,
    wheelSpinners: [frontWheelSpinner, rearWheelSpinner],
    crankSpinners,
    gyroSpinners,
    topperAnimNodes,
    crewIK: {
      captainLegL: captain.legL,
      captainLegR: captain.legR,
      stokerLegL: stoker.legL,
      stokerLegR: stoker.legR,
    },
    socketMarkers,
    socketMarkerList,
    outriggerSpanM,
  };
}

// Animation update tick for simulation and workshop
export function updateTandemAnimation(
  craft: TandemBike3DGroups,
  simState: TandemSimState | null,
  dt: number,
  overrideCrankAngleRad?: number
): void {
  const elapsed = performance.now() * 0.001;

  // 1. Mascot Tail Wags & Topper Animations
  if (craft.topperAnimNodes.shadowTail) {
    const prev = craft.topperAnimNodes.shadowTail.rotation.y;
    let next = Math.sin(elapsed * 12.0) * 0.45;
    if (dt > 0.001 && Math.abs(next - prev) < 0.025) {
      next += next >= 0 ? -0.035 : 0.035;
    }
    craft.topperAnimNodes.shadowTail.rotation.y = next;
  }
  if (craft.topperAnimNodes.boomerTail) {
    const prev = craft.topperAnimNodes.boomerTail.rotation.y;
    let next = Math.sin(elapsed * 6.0) * 0.25;
    if (dt > 0.001 && Math.abs(next - prev) < 0.025) {
      next += next >= 0 ? -0.035 : 0.035;
    }
    craft.topperAnimNodes.boomerTail.rotation.y = next;
  }
  if (craft.topperAnimNodes.bellClapper) {
    craft.topperAnimNodes.bellClapper.rotation.z = Math.sin(elapsed * 8.0) * 0.35;
  }

  // 2. Gyro Flywheel Continuous Spin
  craft.gyroSpinners.forEach((gyro) => {
    gyro.rotation.x += dt * 45.0;
  });

  // 3. Cadence, Crankset, Wheel Rotation, and Leg IK Update
  let crankAngle = overrideCrankAngleRad ?? 0;
  if (simState) {
    const omega = (simState.cadenceRpm * 2 * Math.PI) / 60;
    crankAngle = -(simState.timeElapsedSec * omega) % (Math.PI * 2);

    const speedMps = (simState.speedMph || 0) * 0.44704;
    const wheelOmega = speedMps / TANDEM_GEOMETRY.wheelRadiusM;
    for (const wheel of craft.wheelSpinners) {
      wheel.rotation.z -= wheelOmega * dt;
    }
    for (const crank of craft.crankSpinners) {
      crank.rotation.z = crankAngle;
    }
  } else if (overrideCrankAngleRad !== undefined) {
    for (const crank of craft.crankSpinners) {
      crank.rotation.z = crankAngle;
    }
  }

  if (craft.root.userData.lastCrankAngleRad !== crankAngle) {
    craft.root.userData.lastCrankAngleRad = crankAngle;
    updateCrewLegIK(craft.crewIK.captainLegL, crankAngle);
    updateCrewLegIK(craft.crewIK.captainLegR, crankAngle);
    updateCrewLegIK(craft.crewIK.stokerLegL, crankAngle);
    updateCrewLegIK(craft.crewIK.stokerLegR, crankAngle);
  }
}

// ============================================================================
// 7. MEMORY DISPOSAL
// ============================================================================

export function disposeTandemObject3D(root: THREE.Object3D, disposeCached = false): void {
  const disposedGeos = new Set<THREE.BufferGeometry>();
  const disposedMats = new Set<THREE.Material>();

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
      (mesh as THREE.InstancedMesh).dispose();
    }

    if (mesh.geometry && (disposeCached || !mesh.geometry.userData?.cached)) {
      if (!disposedGeos.has(mesh.geometry)) {
        disposedGeos.add(mesh.geometry);
        mesh.geometry.dispose();
      }
    }

    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (m && (disposeCached || !m.userData?.cached)) {
          if (!disposedMats.has(m)) {
            disposedMats.add(m);
            const anyMat = m as unknown as Record<string, unknown>;
            for (const val of Object.values(anyMat)) {
              if (val && typeof val === 'object' && 'isTexture' in val) {
                (val as THREE.Texture).dispose();
              }
            }
            m.dispose();
          }
        }
      }
    }
  });

  if (disposeCached) {
    MAT_CACHE.forEach((m) => m.dispose());
    MAT_CACHE.clear();
    GEO_CACHE.forEach((g) => g.dispose());
    GEO_CACHE.clear();
  }
}

export const disposeTandemBike3D = disposeTandemObject3D;
