import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  CoasterLoadout,
  CoasterPartCategory,
  getCoasterPaintTheme,
} from './CoasterPartCatalog';
import { CoasterMetrics } from './CoasterMetrics';
import {
  BULLSEYE_END_FEET,
  BULLSEYE_START_FEET,
  COASTER_TRACK_LENGTH_FEET,
  CoasterPhysicsState,
  createInitialCoasterPhysicsState,
  evaluateCoasterTrack,
  GAP_END_FEET,
  GAP_START_FEET,
  LAGOON_END_FEET,
  LAGOON_START_FEET,
  stepCoasterPhysics,
  triggerCoasterActionTap,
} from './CoasterPhysicsEngine';
import {
  buildCoasterCar3D,
  COASTER_RAIL_HALF_GAUGE,
  CoasterCar3DGroups,
  disposeCoasterObject3D,
} from './CoasterCar3DBuilder';
import { soundEngine } from '../audio/SoundEngine';

export interface CoasterCanvas3DProps {
  mode: 'builder' | 'ride';
  rideRunId?: number;
  loadout: CoasterLoadout;
  metrics: CoasterMetrics;
  activeCategory: CoasterPartCategory;
  onSelectCategory: (cat: CoasterPartCategory) => void;
  dynoActive: boolean;
  paused?: boolean;
  rideStateRef: React.MutableRefObject<CoasterPhysicsState>;
  controlsRef: React.MutableRefObject<{ leanInput: number; brakeInput: boolean }>;
  actionTapCountRef: React.MutableRefObject<number>;
  onRideComplete: (finalState: CoasterPhysicsState) => void;
}

/**
 * Builds a continuous tube geometry along a sequence of 3D points.
 */
function buildSplineTubeMesh(
  points: THREE.Vector3[],
  radius: number,
  radialSegments: number,
  material: THREE.Material
): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points);
  const tubularSegments = Math.max(24, points.length);
  const geo = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

/**
 * Constructs the full 2,000-Ft 3D Theme-Park Rollercoaster Track, Station, Vertical Loop,
 * Broken Rail Gap Beacons, Lagoon Water Trench, and Golden Bullseye Brake Run.
 */
function buildThemeParkCoasterEnvironment(railTintHex: string): {
  envGroup: THREE.Group;
  beaconMeshes: THREE.Mesh[];
  railMat: THREE.MeshStandardMaterial;
} {
  const envGroup = new THREE.Group();
  const beaconMeshes: THREE.Mesh[] = [];

  const railMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(railTintHex),
    roughness: 0.25,
    metalness: 0.65,
  });
  const spineMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#1e293b'),
    roughness: 0.38,
    metalness: 0.55,
  });
  const tieMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#334155'),
    roughness: 0.42,
    metalness: 0.5,
  });
  const columnMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#0f172a'),
    roughness: 0.45,
    metalness: 0.6,
  });
  const bullseyeRailMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#10b981'),
    emissive: new THREE.Color('#059669'),
    emissiveIntensity: 0.55,
    roughness: 0.2,
    metalness: 0.5,
  });
  const copperBrakeMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#d97706'),
    roughness: 0.22,
    metalness: 0.85,
  });

  // 1. Ground Meadow Plane & Theme-Park Pathway
  const groundMat = new THREE.MeshLambertMaterial({
    color: new THREE.Color('#15803d'),
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 600), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(320, -0.1, 0);
  ground.receiveShadow = false;
  envGroup.add(ground);

  // 2. Sample the 2,000-ft track before and after the Broken Rail Gap [1270..1302 ft]
  const segments: Array<{ startS: number; endS: number }> = [
    { startS: 0, endS: GAP_START_FEET },
    { startS: GAP_END_FEET, endS: COASTER_TRACK_LENGTH_FEET },
  ];

  for (const seg of segments) {
    const leftPts: THREE.Vector3[] = [];
    const rightPts: THREE.Vector3[] = [];
    const spinePts: THREE.Vector3[] = [];

    const stepFeet = 4;
    for (let s = seg.startS; s <= seg.endS; s += stepFeet) {
      const sample = evaluateCoasterTrack(s);
      const p = new THREE.Vector3(sample.xMeters, sample.yMeters, sample.zMeters);
      const n = new THREE.Vector3(sample.nx, sample.ny, sample.nz);
      const b = new THREE.Vector3(sample.bx, sample.by, sample.bz);

      leftPts.push(p.clone().addScaledVector(b, -COASTER_RAIL_HALF_GAUGE));
      rightPts.push(p.clone().addScaledVector(b, COASTER_RAIL_HALF_GAUGE));
      spinePts.push(p.clone().addScaledVector(n, -0.42));
    }

    envGroup.add(buildSplineTubeMesh(leftPts, 0.068, 6, railMat));
    envGroup.add(buildSplineTubeMesh(rightPts, 0.068, 6, railMat));
    envGroup.add(buildSplineTubeMesh(spinePts, 0.13, 6, spineMat));
  }

  // 3. Crosstie Ribs & Support Stanchions along the track (batched via InstancedMesh)
  const tieGeo = new THREE.BoxGeometry(0.1, 0.08, COASTER_RAIL_HALF_GAUGE * 2.15);
  const strutGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.56, 6);
  const brakeFinGeo = new THREE.BoxGeometry(1.8, 0.22, 0.24);
  const unitColGeo = new THREE.CylinderGeometry(0.16, 0.22, 1, 8);
  const rotMat = new THREE.Matrix4();
  const vecT = new THREE.Vector3();
  const vecN = new THREE.Vector3();
  const vecB = new THREE.Vector3();
  const tempObj = new THREE.Object3D();

  const stdTieMatrices: THREE.Matrix4[] = [];
  const bullseyeTieMatrices: THREE.Matrix4[] = [];
  const strutMatrices: THREE.Matrix4[] = [];
  const copperFinMatrices: THREE.Matrix4[] = [];
  const bullseyeFinMatrices: THREE.Matrix4[] = [];
  const colMatrices: THREE.Matrix4[] = [];

  for (let s = 0; s <= COASTER_TRACK_LENGTH_FEET; s += 8) {
    if (s > GAP_START_FEET && s < GAP_END_FEET) continue;
    const sample = evaluateCoasterTrack(s);
    vecT.set(sample.tx, sample.ty, sample.tz);
    vecN.set(sample.nx, sample.ny, sample.nz);
    vecB.set(sample.bx, sample.by, sample.bz);
    rotMat.makeBasis(vecT, vecN, vecB);
    tempObj.quaternion.setFromRotationMatrix(rotMat);
    tempObj.scale.set(1, 1, 1);

    const isBullseye = s >= BULLSEYE_START_FEET && s <= BULLSEYE_END_FEET;
    tempObj.position
      .set(sample.xMeters, sample.yMeters, sample.zMeters)
      .addScaledVector(vecN, -0.06);
    tempObj.updateMatrix();
    if (isBullseye) {
      bullseyeTieMatrices.push(tempObj.matrix.clone());
    } else {
      stdTieMatrices.push(tempObj.matrix.clone());
    }

    tempObj.position
      .set(sample.xMeters, sample.yMeters, sample.zMeters)
      .addScaledVector(vecN, -0.22);
    tempObj.updateMatrix();
    strutMatrices.push(tempObj.matrix.clone());

    // Eddy-current magnetic stator fins on the Final Brake Run (1,800..1,990 ft)
    if (s >= 1800 && s <= 1990) {
      tempObj.position
        .set(sample.xMeters, sample.yMeters, sample.zMeters)
        .addScaledVector(vecN, 0.06);
      tempObj.updateMatrix();
      if (isBullseye) {
        bullseyeFinMatrices.push(tempObj.matrix.clone());
      } else {
        copperFinMatrices.push(tempObj.matrix.clone());
      }
    }

    // Vertical Steel Support Columns to ground every 32 ft (skipping inverted apex & water)
    if (s % 32 === 0 && sample.ny > 0.25 && !sample.isLagoonSplash) {
      const colHeight = Math.max(0.5, sample.yMeters - 0.35);
      tempObj.position.set(sample.xMeters, colHeight / 2, sample.zMeters);
      tempObj.rotation.set(0, 0, 0);
      tempObj.scale.set(1, colHeight, 1);
      tempObj.updateMatrix();
      colMatrices.push(tempObj.matrix.clone());
    }
  }

  const addInstancedBatch = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    matrices: THREE.Matrix4[]
  ) => {
    if (matrices.length === 0) return;
    const inst = new THREE.InstancedMesh(geo, mat, matrices.length);
    for (let i = 0; i < matrices.length; i++) {
      inst.setMatrixAt(i, matrices[i]);
    }
    inst.instanceMatrix.needsUpdate = true;
    envGroup.add(inst);
  };

  addInstancedBatch(tieGeo, tieMat, stdTieMatrices);
  addInstancedBatch(tieGeo, bullseyeRailMat, bullseyeTieMatrices);
  addInstancedBatch(strutGeo, tieMat, strutMatrices);
  addInstancedBatch(brakeFinGeo, copperBrakeMat, copperFinMatrices);
  addInstancedBatch(brakeFinGeo, bullseyeRailMat, bullseyeFinMatrices);
  addInstancedBatch(unitColGeo, columnMat, colMatrices);

  // 4. Elevated Boarding Station Canopy & LIM Launch Stator Coils (s = 0..55 ft)
  const st0 = evaluateCoasterTrack(24);
  const stationDeck = new THREE.Mesh(
    new THREE.BoxGeometry(18, 0.5, 5.2),
    new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.6 })
  );
  stationDeck.position.set(st0.xMeters, st0.yMeters - 0.45, st0.zMeters);
  envGroup.add(stationDeck);

  const stationRoof = new THREE.Mesh(
    new THREE.BoxGeometry(18, 0.35, 5.6),
    new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.35, metalness: 0.4 })
  );
  stationRoof.position.set(st0.xMeters, st0.yMeters + 3.6, st0.zMeters);
  envGroup.add(stationRoof);

  const limGlowMat = new THREE.MeshStandardMaterial({
    color: '#38bdf8',
    emissive: '#0284c7',
    emissiveIntensity: 0.85,
  });
  const stationCoilGeo = new THREE.BoxGeometry(1.5, 0.14, 0.46);
  for (let s = 4; s <= 64; s += 8) {
    const ls = evaluateCoasterTrack(s);
    const coil = new THREE.Mesh(stationCoilGeo, limGlowMat);
    coil.position.set(ls.xMeters, ls.yMeters + 0.04, ls.zMeters);
    envGroup.add(coil);
  }

  // 5. Flashing Hazard Beacons at the 32-Ft Broken Rail Gap (1,270 ft and 1,302 ft)
  const beaconMat = new THREE.MeshStandardMaterial({
    color: '#f97316',
    emissive: '#ef4444',
    emissiveIntensity: 1.0,
  });
  const beaconPostGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.8, 8);
  const beaconSphereGeo = new THREE.SphereGeometry(0.24, 12, 12);
  [GAP_START_FEET, GAP_END_FEET].forEach((gapS) => {
    const gs = evaluateCoasterTrack(gapS);
    [-1.1, 1.1].forEach((zOff) => {
      const post = new THREE.Mesh(beaconPostGeo, columnMat);
      post.position.set(gs.xMeters, gs.yMeters + 0.6, gs.zMeters + zOff);
      const beacon = new THREE.Mesh(beaconSphereGeo, beaconMat);
      beacon.position.set(gs.xMeters, gs.yMeters + 1.55, gs.zMeters + zOff);
      envGroup.add(post, beacon);
      beaconMeshes.push(beacon);
    });
  });

  // 6. Theme-Park Turquoise Lagoon Water-Splash Pool (s = 1,415..1,585 ft)
  const lagMid = evaluateCoasterTrack((LAGOON_START_FEET + LAGOON_END_FEET) / 2);
  const waterMat = new THREE.MeshStandardMaterial({
    color: '#06b6d4',
    emissive: '#0891b2',
    emissiveIntensity: 0.25,
    roughness: 0.12,
    metalness: 0.3,
  });
  const lagoonPool = new THREE.Mesh(new THREE.BoxGeometry(64, 0.5, 18), waterMat);
  lagoonPool.position.set(lagMid.xMeters, lagMid.yMeters - 0.12, lagMid.zMeters);
  envGroup.add(lagoonPool);

  // Scenic rockwork boulders framing the Lagoon entrance
  const rockMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.85 });
  [-1, 1].forEach((side) => {
    for (let i = 0; i < 5; i++) {
      const boulder = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1.8 + (i % 2) * 0.9, 0),
        rockMat
      );
      boulder.position.set(
        lagMid.xMeters - 22 + i * 11,
        lagMid.yMeters + 0.9,
        lagMid.zMeters + side * 3.2
      );
      envGroup.add(boulder);
    }
  });

  // 7. Golden Station Bullseye Target Zone Arch & Foam Arrestor Bumper (1,865..1,996 ft)
  const archGeo = new THREE.TorusGeometry(2.6, 0.16, 10, 24, Math.PI);
  [BULLSEYE_START_FEET, BULLSEYE_END_FEET].forEach((bs) => {
    const bSample = evaluateCoasterTrack(bs);
    const arch = new THREE.Mesh(archGeo, bullseyeRailMat);
    arch.rotation.y = Math.PI / 2;
    arch.position.set(bSample.xMeters, bSample.yMeters, bSample.zMeters);
    envGroup.add(arch);
  });

  const endSample = evaluateCoasterTrack(1996);
  const bumper = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 1.4, 2.4),
    new THREE.MeshStandardMaterial({
      color: '#facc15',
      emissive: '#ca8a04',
      emissiveIntensity: 0.3,
      roughness: 0.4,
    })
  );
  bumper.position.set(endSample.xMeters, endSample.yMeters + 0.6, endSample.zMeters);
  envGroup.add(bumper);

  return { envGroup, beaconMeshes, railMat };
}

/**
 * Builds the indoor Coaster Engineering Bay with Maintenance Pit, Tubular Test Rail,
 * LIM Stator Coils, and Interactive Tilt/Dyno Rig.
 */
function buildEngineeringBayEnvironment(): {
  bayGroup: THREE.Group;
  testTrackRig: THREE.Group;
  dynoLimCoils: THREE.Mesh[];
  gizmoGroup: THREE.Group;
} {
  const bayGroup = new THREE.Group();
  const testTrackRig = new THREE.Group();
  const dynoLimCoils: THREE.Mesh[] = [];
  const gizmoGroup = new THREE.Group();

  // Workshop polished floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(36, 36),
    new THREE.MeshLambertMaterial({ color: '#0f172a' })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.85;
  floor.receiveShadow = false;
  bayGroup.add(floor);

  // Inspection pit safety yellow curb
  const pitRim = new THREE.Mesh(
    new THREE.BoxGeometry(5.6, 0.12, 2.6),
    new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.35 })
  );
  pitRim.position.set(0, -0.79, 0);
  bayGroup.add(pitRim);

  // Elevated Test Track Rig (tilts & vibrates when Track Dyno is active!)
  const railMat = new THREE.MeshStandardMaterial({
    color: '#ef4444',
    roughness: 0.22,
    metalness: 0.72,
  });
  const spineMat = new THREE.MeshStandardMaterial({
    color: '#334155',
    roughness: 0.35,
    metalness: 0.65,
  });

  [-COASTER_RAIL_HALF_GAUGE, COASTER_RAIL_HALF_GAUGE].forEach((rz) => {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 5.2, 16), railMat);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(0, 0, rz);
    testTrackRig.add(rail);
  });

  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 5.2, 16), spineMat);
  spine.rotation.z = Math.PI / 2;
  spine.position.set(0, -0.42, 0);
  testTrackRig.add(spine);

  const ribGeo = new THREE.BoxGeometry(0.09, 0.08, COASTER_RAIL_HALF_GAUGE * 2.15);
  const coilGeo = new THREE.BoxGeometry(0.32, 0.08, 0.38);
  for (let x = -2.2; x <= 2.2; x += 0.55) {
    const rib = new THREE.Mesh(ribGeo, spineMat);
    rib.position.set(x, -0.06, 0);
    testTrackRig.add(rib);

    const coilMat = new THREE.MeshStandardMaterial({
      color: '#38bdf8',
      emissive: '#0284c7',
      emissiveIntensity: 0.4,
    });
    const limCoil = new THREE.Mesh(coilGeo, coilMat);
    limCoil.position.set(x, 0.02, 0);
    testTrackRig.add(limCoil);
    dynoLimCoils.push(limCoil);
  }

  // Hydraulic Dyno Support Jacks under the test track
  [-1.6, 1.6].forEach((jx) => {
    const jack = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.22, 0.85, 12),
      spineMat
    );
    jack.position.set(jx, -0.44, 0);
    bayGroup.add(jack);
  });

  // 3D Engineering Gizmos (Center of Mass sphere + Upstop Clamp ring arrows, visible when Dyno ON)
  const comSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 16, 16),
    new THREE.MeshStandardMaterial({
      color: '#facc15',
      emissive: '#eab308',
      emissiveIntensity: 0.85,
    })
  );
  comSphere.name = 'com_sphere';
  gizmoGroup.add(comSphere);

  [-COASTER_RAIL_HALF_GAUGE, COASTER_RAIL_HALF_GAUGE].forEach((rz) => {
    const clampRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.025, 10, 24),
      new THREE.MeshStandardMaterial({
        color: '#22c55e',
        emissive: '#16a34a',
        emissiveIntensity: 0.8,
      })
    );
    clampRing.rotation.y = Math.PI / 2;
    clampRing.position.set(0.86, 0, rz);
    gizmoGroup.add(clampRing);
  });

  gizmoGroup.visible = false;
  testTrackRig.add(gizmoGroup);
  bayGroup.add(testTrackRig);

  return { bayGroup, testTrackRig, dynoLimCoils, gizmoGroup };
}

export const CoasterCanvas3D: React.FC<CoasterCanvas3DProps> = ({
  mode,
  rideRunId = 0,
  loadout,
  metrics,
  activeCategory,
  onSelectCategory,
  dynoActive,
  paused = false,
  rideStateRef,
  controlsRef,
  actionTapCountRef,
  onRideComplete,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const loadoutRef = useRef(loadout);
  loadoutRef.current = loadout;
  const metricsRef = useRef(metrics);
  metricsRef.current = metrics;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const rideRunIdRef = useRef(rideRunId);
  rideRunIdRef.current = rideRunId;
  const dynoRef = useRef(dynoActive);
  dynoRef.current = dynoActive;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const activeCatRef = useRef(activeCategory);
  activeCatRef.current = activeCategory;
  const onSelectCatRef = useRef(onSelectCategory);
  onSelectCatRef.current = onSelectCategory;
  const onRideCompleteRef = useRef(onRideComplete);
  onRideCompleteRef.current = onRideComplete;

  const carGroupsRef = useRef<CoasterCar3DGroups | null>(null);
  const testTrackRigRef = useRef<THREE.Group | null>(null);
  const parkRailMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const snapPopTimerRef = useRef<number>(0);
  const loopControlRef = useRef<{ pause: () => void; resume: () => void } | null>(null);
  const syncSceneModeRef = useRef<((m: 'builder' | 'ride', runId: number) => void) | null>(null);

  // Stop or resume the requestAnimationFrame loop when `paused` changes (e.g. while CoasterScorecardModal is open)
  useEffect(() => {
    if (paused) {
      loopControlRef.current?.pause();
    } else {
      loopControlRef.current?.resume();
    }
  }, [paused]);

  // Synchronously transition 3D scene state whenever `mode` or `rideRunId` changes
  useEffect(() => {
    syncSceneModeRef.current?.(mode, rideRunId);
  }, [mode, rideRunId]);

  // Rebuild 3D coaster car whenever loadout changes
  useEffect(() => {
    const rig = testTrackRigRef.current;
    if (!rig) return;
    if (carGroupsRef.current) {
      rig.remove(carGroupsRef.current.root);
      disposeCoasterObject3D(carGroupsRef.current.root);
    }
    const built = buildCoasterCar3D(loadout);
    const isBuilder = modeRef.current === 'builder';
    for (const m of built.socketMarkerList) {
      m.visible = isBuilder;
    }
    rig.add(built.root);
    carGroupsRef.current = built;
    snapPopTimerRef.current = 0.22;
    if (parkRailMatRef.current) {
      const paintTheme = getCoasterPaintTheme(loadout.paintId);
      parkRailMatRef.current.color.set(paintTheme.railTintHex);
    }
  }, [loadout]);

  // Main Three.js Scene & 120Hz Simulation Loop (kept mounted across mode & rideRunId transitions)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const initialMode = modeRef.current;
    const scene = new THREE.Scene();
    const bgBuilder = new THREE.Color('#0b1120');
    const bgRide = new THREE.Color('#0284c7');
    const fogBuilder = new THREE.FogExp2('#0b1120', 0.035);
    const fogRide = new THREE.FogExp2('#bae6fd', 0.0022);
    scene.background = initialMode === 'builder' ? bgBuilder : bgRide;
    scene.fog = initialMode === 'builder' ? fogBuilder : fogRide;

    const camera = new THREE.PerspectiveCamera(
      52,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      900
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Lighting
    const hemiLight = new THREE.HemisphereLight('#f8fafc', '#1e293b', 0.85);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight('#ffffff', 1.35);
    sunLight.position.set(16, 32, 20);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(512, 512);
    sunLight.shadow.camera.near = 2;
    sunLight.shadow.camera.far = 85;
    sunLight.shadow.camera.left = -14;
    sunLight.shadow.camera.right = 14;
    sunLight.shadow.camera.top = 14;
    sunLight.shadow.camera.bottom = -14;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);
    scene.add(sunLight.target);

    // Build both environments once
    const bayEnv = buildEngineeringBayEnvironment();
    bayEnv.bayGroup.visible = initialMode === 'builder';
    scene.add(bayEnv.bayGroup);

    const paintTheme = getCoasterPaintTheme(loadoutRef.current.paintId);
    const parkEnv = buildThemeParkCoasterEnvironment(paintTheme.railTintHex);
    parkEnv.envGroup.visible = initialMode === 'ride';
    parkRailMatRef.current = parkEnv.railMat;
    scene.add(parkEnv.envGroup);

    // Holder group for the coaster car (attached to testTrackRig in builder, or world in ride)
    const carHolder = new THREE.Group();
    if (initialMode === 'builder') {
      bayEnv.testTrackRig.add(carHolder);
    } else {
      scene.add(carHolder);
    }
    testTrackRigRef.current = carHolder;

    const initialCar = buildCoasterCar3D(loadoutRef.current);
    for (const m of initialCar.socketMarkerList) {
      m.visible = initialMode === 'builder';
    }
    carHolder.add(initialCar.root);
    carGroupsRef.current = initialCar;

    // Water Splash Particle Pool for Lagoon Skim (1,425..1,575 ft)
    const splashParticles: Array<{
      mesh: THREE.Mesh;
      vx: number;
      vy: number;
      vz: number;
      life: number;
    }> = [];
    const dropGeo = new THREE.SphereGeometry(0.12, 6, 6);
    const dropMat = new THREE.MeshStandardMaterial({
      color: '#e0f2fe',
      emissive: '#38bdf8',
      emissiveIntensity: 0.4,
    });
    for (let i = 0; i < 28; i++) {
      const m = new THREE.Mesh(dropGeo, dropMat);
      m.visible = false;
      scene.add(m);
      splashParticles.push({ mesh: m, vx: 0, vy: 0, vz: 0, life: 0 });
    }

    // Orbit camera state for Engineering Bay
    let orbitYaw = 0.68;
    let orbitPitch = 0.36;
    let orbitDist = 4.6;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let pointerDownX = 0;
    let pointerDownY = 0;

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();

    const onPointerDown = (e: PointerEvent) => {
      if (modeRef.current !== 'builder') return;
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      pointerDownX = e.clientX;
      pointerDownY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging || modeRef.current !== 'builder') return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      orbitYaw -= dx * 0.008;
      orbitPitch = Math.max(0.08, Math.min(1.15, orbitPitch + dy * 0.006));
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!isDragging) return;
      isDragging = false;
      if (modeRef.current !== 'builder') return;
      const moved = Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY);
      if (moved < 6 && carGroupsRef.current) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointerNdc, camera);
        const hits = raycaster.intersectObjects(carGroupsRef.current.socketMarkerList, false);
        if (hits.length > 0) {
          const cat = hits[0].object.userData.coasterCategory as CoasterPartCategory | undefined;
          if (cat) {
            soundEngine.playSnapPop();
            onSelectCatRef.current(cat);
          }
        }
      }
    };

    const onPointerCancel = () => {
      isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      if (modeRef.current !== 'builder') return;
      orbitDist = Math.max(2.8, Math.min(7.5, orbitDist + e.deltaY * 0.003));
    };

    const domElem = renderer.domElement;
    domElem.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    domElem.addEventListener('wheel', onWheel, { passive: true });

    const onResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', onResize);

    let lastTime = performance.now();
    let physAccum = 0;
    let lastHandledTapCount = actionTapCountRef.current;
    let completionNotified = false;
    let splashSoundCooldown = 0;
    let rafId = 0;
    let lastSceneMode: 'builder' | 'ride' | null = null;
    let lastRideRunId = -1;
    let lastSnapX = Number.NaN;
    let lastSnapY = Number.NaN;
    let lastSnapZ = Number.NaN;

    // Reusable Three.js math objects for zero-GC 120Hz updates
    const vecT = new THREE.Vector3();
    const vecN = new THREE.Vector3();
    const vecB = new THREE.Vector3();
    const vecCamUp = new THREE.Vector3(0, 1, 0);
    const rotMat = new THREE.Matrix4();
    const targetCamPos = new THREE.Vector3();
    const targetLookAt = new THREE.Vector3();
    const smoothCamPos = new THREE.Vector3(-6.8, 15.65, 0);
    const smoothLookAt = new THREE.Vector3(4.5, 13.3, 0);
    const smoothCamUp = new THREE.Vector3(0, 1, 0);

    const updateSunShadowTarget = (tx: number, ty: number, tz: number) => {
      const snapX = Math.round(tx * 2) * 0.5;
      const snapY = Math.round(ty * 2) * 0.5;
      const snapZ = Math.round(tz * 2) * 0.5;
      if (snapX !== lastSnapX || snapY !== lastSnapY || snapZ !== lastSnapZ) {
        lastSnapX = snapX;
        lastSnapY = snapY;
        lastSnapZ = snapZ;
        sunLight.position.set(snapX + 16, snapY + 32, snapZ + 20);
        sunLight.target.position.set(snapX, snapY, snapZ);
        sunLight.target.updateMatrixWorld();
      }
    };

    const syncSceneMode = (nextMode: 'builder' | 'ride', nextRunId: number) => {
      if (
        lastSceneMode === nextMode &&
        (nextMode !== 'ride' || lastRideRunId === nextRunId)
      ) {
        return;
      }
      lastSceneMode = nextMode;
      lastRideRunId = nextRunId;
      bayEnv.bayGroup.visible = nextMode === 'builder';
      parkEnv.envGroup.visible = nextMode === 'ride';
      scene.background = nextMode === 'builder' ? bgBuilder : bgRide;
      scene.fog = nextMode === 'builder' ? fogBuilder : fogRide;

      const car = carGroupsRef.current;
      if (nextMode === 'builder') {
        if (carHolder.parent !== bayEnv.testTrackRig) {
          bayEnv.testTrackRig.add(carHolder);
        }
        if (car) {
          car.root.position.set(0, 0, 0);
          car.root.rotation.set(0, 0, 0);
          for (const m of car.socketMarkerList) m.visible = true;
        }
        for (const p of splashParticles) {
          p.life = 0;
          p.mesh.visible = false;
        }
        camera.up.set(0, 1, 0);
        updateSunShadowTarget(0, 0, 0);
      } else {
        if (carHolder.parent !== scene) {
          scene.add(carHolder);
        }
        if (
          !rideStateRef.current ||
          rideStateRef.current.phase === 'completed' ||
          rideStateRef.current.phase === 'derailed'
        ) {
          rideStateRef.current = createInitialCoasterPhysicsState();
        }
        if (car) {
          for (const m of car.socketMarkerList) m.visible = false;
        }
        lastHandledTapCount = 0;
        physAccum = 0;
        completionNotified = false;
        splashSoundCooldown = 0;
        smoothCamPos.set(-6.8, 15.65, 0);
        smoothLookAt.set(4.5, 13.3, 0);
        smoothCamUp.set(0, 1, 0);
        for (const p of splashParticles) {
          p.life = 0;
          p.mesh.visible = false;
        }
        const st = rideStateRef.current;
        updateSunShadowTarget(st.worldX, st.worldY, st.worldZ);
      }
    };

    syncSceneModeRef.current = syncSceneMode;
    syncSceneMode(modeRef.current, rideRunIdRef.current);

    const animate = (now: number) => {
      if (pausedRef.current) {
        rafId = 0;
        return;
      }
      rafId = requestAnimationFrame(animate);
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const elapsedSec = now * 0.001;

      const currentMode = modeRef.current;
      const currentRideRunId = rideRunIdRef.current;
      syncSceneMode(currentMode, currentRideRunId);
      const car = carGroupsRef.current;

      // Pop-scale animation when swapping parts
      if (snapPopTimerRef.current > 0 && car) {
        snapPopTimerRef.current = Math.max(0, snapPopTimerRef.current - dt);
        const s = 1 + Math.sin((snapPopTimerRef.current / 0.22) * Math.PI) * 0.08;
        car.root.scale.setScalar(s);
      } else if (car) {
        car.root.scale.setScalar(1);
      }

      if (currentMode === 'builder') {
        // ---------------------------------------------------------------------
        // ENGINEERING BAY & INTERACTIVE TRACK DYNO RIG
        // ---------------------------------------------------------------------
        const isDyno = dynoRef.current;
        bayEnv.gizmoGroup.visible = isDyno;

        if (isDyno) {
          // Rock test track +-25 deg roll & subtle pitch to demonstrate Upstop Wheel clamping & Lateral Grip
          bayEnv.testTrackRig.rotation.x = Math.sin(elapsedSec * 2.1) * 0.44;
          bayEnv.testTrackRig.rotation.z = Math.sin(elapsedSec * 1.3) * 0.09;
          bayEnv.testTrackRig.position.y = Math.sin(elapsedSec * 14) * 0.015;

          const comObj = bayEnv.gizmoGroup.getObjectByName('com_sphere');
          if (comObj) {
            comObj.position.set(0, metricsRef.current.comHeightMeters + 0.2, 0);
          }

          if (car) {
            for (const w of car.wheelSpinners) w.rotation.z -= 18 * dt;
            for (const g of car.gyroSpinners) g.rotation.y += 14 * dt;
            const pulseScale = 1 + 0.12 * Math.sin(elapsedSec * 14);
            for (const b of car.boostGlowMeshes) b.scale.setScalar(pulseScale);
          }
          bayEnv.dynoLimCoils.forEach((coil, idx) => {
            const mat = coil.material as THREE.MeshStandardMaterial;
            mat.emissiveIntensity = 0.5 + 0.5 * Math.sin(elapsedSec * 10 - idx * 0.8);
          });
        } else {
          bayEnv.testTrackRig.rotation.x *= 0.88;
          bayEnv.testTrackRig.rotation.z *= 0.88;
          bayEnv.testTrackRig.position.y *= 0.88;
          if (car) {
            for (const g of car.gyroSpinners) g.rotation.y += 4 * dt;
            for (const b of car.boostGlowMeshes) b.scale.setScalar(1);
          }
        }

        // Pulse socket markers for active category
        if (car) {
          (Object.keys(car.socketMarkers) as CoasterPartCategory[]).forEach((cat) => {
            const m = car.socketMarkers[cat];
            const mat = m.material as THREE.MeshStandardMaterial;
            const isSel = cat === activeCatRef.current;
            mat.opacity = isSel ? 0.65 + 0.25 * Math.sin(elapsedSec * 6) : 0.22;
            m.scale.setScalar(isSel ? 1.25 : 0.9);
          });
        }

        camera.position.set(
          Math.cos(orbitYaw) * Math.cos(orbitPitch) * orbitDist,
          Math.sin(orbitPitch) * orbitDist + 0.55,
          Math.sin(orbitYaw) * Math.cos(orbitPitch) * orbitDist
        );
        camera.lookAt(0, 0.42, 0);
      } else {
        // ---------------------------------------------------------------------
        // 120HZ 3D COASTER RIDE SIMULATION
        // ---------------------------------------------------------------------
        const state = rideStateRef.current;

        // Handle discrete action taps (LIM Charge / Launch / KERS Boost)
        if (actionTapCountRef.current !== lastHandledTapCount) {
          const tapsToProcess = Math.max(1, actionTapCountRef.current - lastHandledTapCount);
          lastHandledTapCount = actionTapCountRef.current;
          for (let t = 0; t < tapsToProcess; t++) {
            const res = triggerCoasterActionTap(state, metricsRef.current);
            if (res.type === 'lim_launch_perfect' || res.type === 'kers_boost') {
              soundEngine.playLimLaunchWhoosh(res.type === 'lim_launch_perfect');
            } else if (res.type === 'lim_charge') {
              soundEngine.playPushBoost();
            }
          }
        }

        const fixedDt = 1 / 120;
        physAccum += dt;
        const prevPhase = state.phase;
        const prevCheckpointCount = state.checkpoints.length;

        while (physAccum >= fixedDt) {
          stepCoasterPhysics(state, metricsRef.current, controlsRef.current, fixedDt);
          physAccum -= fixedDt;
        }

        // Trigger audio cues on state transitions
        if (prevPhase === 'station_countdown' && state.phase === 'riding') {
          soundEngine.playStartGateDrop();
          soundEngine.playLimLaunchWhoosh(true);
        }
        if (prevPhase !== 'derailed' && state.phase === 'derailed') {
          soundEngine.playCrashThud();
        }
        if (state.checkpoints.length > prevCheckpointCount) {
          soundEngine.playCanalBell(state.stoppedInBullseye);
        }
        if (controlsRef.current.brakeInput && state.speedMph > 8) {
          soundEngine.playMagnetBrakeHum();
        }

        const sample = evaluateCoasterTrack(state.sFeet);

        // Lagoon splash sound & water spray particles
        if (splashSoundCooldown > 0) splashSoundCooldown -= dt;
        if (sample.isLagoonSplash && state.phase === 'riding' && state.speedMph > 15) {
          if (splashSoundCooldown <= 0) {
            soundEngine.playSplash(75);
            splashSoundCooldown = 0.45;
          }
          for (const p of splashParticles) {
            if (p.life <= 0 && Math.random() < 0.45) {
              p.life = 0.55;
              p.mesh.visible = true;
              p.mesh.position.set(
                state.worldX + (Math.random() - 0.5) * 1.5,
                state.worldY + 0.2,
                state.worldZ + (Math.random() > 0.5 ? 0.9 : -0.9)
              );
              p.vx = (Math.random() - 0.5) * 4;
              p.vy = 4.5 + Math.random() * 4.5;
              p.vz = (Math.random() > 0.5 ? 1 : -1) * (3 + Math.random() * 4);
            }
          }
        }

        for (const p of splashParticles) {
          if (p.life > 0) {
            p.life -= dt;
            p.vy -= 9.81 * dt;
            p.mesh.position.x += p.vx * dt;
            p.mesh.position.y += p.vy * dt;
            p.mesh.position.z += p.vz * dt;
            if (p.life <= 0) p.mesh.visible = false;
          }
        }

        // Flash hazard beacons at the Broken Rail Gap
        parkEnv.beaconMeshes.forEach((b, idx) => {
          const mat = b.material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = 0.4 + 0.6 * Math.abs(Math.sin(elapsedSec * 9 + idx));
        });

        // Position & Orient the 3D Coaster Car along the spline (or ballistic arc)
        if (car) {
          car.root.position.set(state.worldX, state.worldY, state.worldZ);

          vecT.set(sample.tx, sample.ty, sample.tz).normalize();
          vecN.set(sample.nx, sample.ny, sample.nz).normalize();
          vecB.set(sample.bx, sample.by, sample.bz).normalize();

          // Apply carRollOffsetDeg around tangent T
          const rollRad = (state.carRollOffsetDeg * Math.PI) / 180;
          const cosR = Math.cos(rollRad);
          const sinR = Math.sin(rollRad);
          const rolledNx = vecN.x * cosR + vecB.x * sinR;
          const rolledNy = vecN.y * cosR + vecB.y * sinR;
          const rolledNz = vecN.z * cosR + vecB.z * sinR;
          const rolledBx = -vecN.x * sinR + vecB.x * cosR;
          const rolledBy = -vecN.y * sinR + vecB.y * cosR;
          const rolledBz = -vecN.z * sinR + vecB.z * cosR;

          vecN.set(rolledNx, rolledNy, rolledNz);
          vecB.set(rolledBx, rolledBy, rolledBz);

          rotMat.makeBasis(vecT, vecN, vecB);
          car.root.quaternion.setFromRotationMatrix(rotMat);

          // Spin road & upstop wheels proportional to speed
          const wheelSpinDelta = state.speedMps * 7.5 * dt;
          for (const w of car.wheelSpinners) w.rotation.z -= wheelSpinDelta;
          for (const g of car.gyroSpinners) g.rotation.y += 16 * dt;

          // Pulse thruster/LIM glow meshes during launch & KERS boost
          const isBoosting = state.kersBoostActiveTimer > 0 || (state.phase === 'riding' && state.sFeet < 65);
          const boostScale = isBoosting ? 1 + 0.22 * Math.sin(elapsedSec * 24) : 1;
          for (const b of car.boostGlowMeshes) b.scale.setScalar(boostScale);

          // Hide socket markers during ride
          for (const m of car.socketMarkerList) m.visible = false;
        }

        // Update snapped directional light shadow frustum around the coaster car
        updateSunShadowTarget(state.worldX, state.worldY, state.worldZ);

        // Dynamic Chase Camera that follows behind & along the coaster normal (zero gimbal lock in 360° loop!)
        const camBackDist = 6.8;
        const camUpHeight = 2.65;
        vecCamUp
          .set(sample.nx * 0.65, sample.ny, sample.nz * 0.65)
          .normalize();
        targetCamPos
          .set(state.worldX, state.worldY, state.worldZ)
          .addScaledVector(vecT, -camBackDist)
          .addScaledVector(vecCamUp, camUpHeight);
        targetLookAt
          .set(state.worldX, state.worldY, state.worldZ)
          .addScaledVector(vecCamUp, 0.55)
          .addScaledVector(vecT, 4.5);

        const lerpAlpha = 1 - Math.exp(-12 * dt);
        smoothCamPos.lerp(targetCamPos, lerpAlpha);
        smoothLookAt.lerp(targetLookAt, lerpAlpha);
        smoothCamUp.lerp(vecCamUp, lerpAlpha).normalize();
        camera.up.copy(smoothCamUp);
        camera.position.copy(smoothCamPos);
        camera.lookAt(smoothLookAt);

        if (state.phase === 'completed' && !completionNotified) {
          completionNotified = true;
          onRideCompleteRef.current({ ...state, checkpoints: [...state.checkpoints] });
        }
      }

      renderer.render(scene, camera);
    };

    loopControlRef.current = {
      pause: () => {
        if (rafId !== 0) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }
      },
      resume: () => {
        if (rafId === 0 && !pausedRef.current) {
          lastTime = performance.now();
          rafId = requestAnimationFrame(animate);
        }
      },
    };

    if (!pausedRef.current) {
      rafId = requestAnimationFrame(animate);
    }

    return () => {
      loopControlRef.current = null;
      syncSceneModeRef.current = null;
      testTrackRigRef.current = null;
      carGroupsRef.current = null;
      parkRailMatRef.current = null;
      if (rafId !== 0) {
        cancelAnimationFrame(rafId);
      }
      domElem.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      domElem.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
      sunLight.shadow.map?.dispose();
      disposeCoasterObject3D(scene);
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full select-none overflow-hidden"
      style={{ touchAction: 'none' }}
    />
  );
};
