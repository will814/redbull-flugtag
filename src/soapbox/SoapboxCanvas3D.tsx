import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  SOAPBOX_COURSE_LENGTH_FEET,
  SoapboxLoadout,
  SoapboxPartCategory,
} from './SoapboxPartCatalog';
import { ComputedSoapboxMetrics } from './SoapboxMetrics';
import {
  getSoapboxRoadState,
  SoapboxSimulationState,
  stepSoapboxSimulation,
} from './SoapboxPhysicsEngine';
import {
  buildSoapbox3D,
  disposeSoapboxObject3D,
  makeSoapboxMat,
  Soapbox3DGroups,
} from './Soapbox3DBuilder';
import { soundEngine } from '../audio/SoundEngine';

interface SoapboxCanvas3DProps {
  mode: 'garage' | 'race';
  paused?: boolean;
  loadout: SoapboxLoadout;
  metrics: ComputedSoapboxMetrics;
  selectedCategory: SoapboxPartCategory;
  shakerRigActive: boolean;
  simStateRef: React.MutableRefObject<SoapboxSimulationState>;
  bestRecordFeet: number;
  bestTimeSec: number | null;
  onSelectCategory?: (cat: SoapboxPartCategory) => void;
  onHudSync: (snapshot: SoapboxSimulationState) => void;
  onRunFinished: (finalState: SoapboxSimulationState) => void;
}

// Scale factor: 1 Three.js world unit = 4 feet (matching Flugtag scale)
const UNITS_PER_FOOT = 0.25;
const ROAD_HALF_WIDTH_FEET = 13.5;

const CATEGORY_CAMERA_PRESETS: Record<
  SoapboxPartCategory,
  { yaw: number; pitch: number; radius: number }
> = {
  chassis: { yaw: -0.62, pitch: 0.28, radius: 5.8 },
  steering: { yaw: 0.58, pitch: 0.24, radius: 5.4 },
  wheels: { yaw: -0.78, pitch: 0.2, radius: 5.5 },
  suspension: { yaw: -1.15, pitch: 0.22, radius: 5.4 },
  brakes: { yaw: 0.45, pitch: 0.25, radius: 5.6 },
  topper: { yaw: -0.48, pitch: 0.36, radius: 5.8 },
};

/**
 * Converts course (sFeet, lateralFeet, heightOffsetFeet) into 3D world coordinates in Three.js units.
 */
function courseToWorldUnits(
  sFeet: number,
  lateralFeet: number,
  heightOffsetFeet = 0,
  outVec?: THREE.Vector3
): THREE.Vector3 {
  const road = getSoapboxRoadState(sFeet);
  // Horizontal normal pointing to the Right (+lateral) of the road tangent
  const nx = -Math.sin(road.headingRad);
  const nz = Math.cos(road.headingRad);

  const wx = (road.xFeet + nx * lateralFeet) * UNITS_PER_FOOT;
  const wy = (road.yFeet + heightOffsetFeet) * UNITS_PER_FOOT;
  const wz = (road.zFeet + nz * lateralFeet) * UNITS_PER_FOOT;

  if (outVec) {
    return outVec.set(wx, wy, wz);
  }
  return new THREE.Vector3(wx, wy, wz);
}

/**
 * Builds a continuous 3D road ribbon mesh with vertex colors for Asphalt, Cobblestone sectors, and Red/White curbs.
 */
function buildCourseRoadRibbon(): THREE.Group {
  const group = new THREE.Group();
  const sMin = -46;
  const sMax = 1090;
  const steps = 420;
  const halfW = ROAD_HALF_WIDTH_FEET;
  const curbW = 2.2;
  const skirtW = 26.0;

  // Cross-section profile offsets (in feet from centerline):
  // [-skirt, -halfW-curbW, -halfW, +halfW, +halfW+curbW, +skirt]
  const cols = [
    { lat: -(halfW + curbW + skirtW), yDrop: -3.2 },
    { lat: -(halfW + curbW), yDrop: 0.22 },
    { lat: -halfW, yDrop: 0.0 },
    { lat: halfW, yDrop: 0.0 },
    { lat: halfW + curbW, yDrop: 0.22 },
    { lat: halfW + curbW + skirtW, yDrop: -3.2 },
  ];
  const numCols = cols.length;

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const cGrass = new THREE.Color('#16a34a');
  const cGrassAlt = new THREE.Color('#15803d');
  const cCurbRed = new THREE.Color('#ef4444');
  const cCurbWhite = new THREE.Color('#f8fafc');
  const cAsphalt = new THREE.Color('#1e293b');
  const cCobble = new THREE.Color('#78716c');
  const cStartZone = new THREE.Color('#065f46');

  for (let i = 0; i <= steps; i++) {
    const s = sMin + (i / steps) * (sMax - sMin);
    const road = getSoapboxRoadState(s);
    const nx = -Math.sin(road.headingRad);
    const nz = Math.cos(road.headingRad);

    const isRedCurb = Math.floor((s + 100) / 8) % 2 === 0;
    const isShoveWindow = s >= -14.5 && s <= 0;

    for (let c = 0; c < numCols; c++) {
      const col = cols[c];
      const wx = (road.xFeet + nx * col.lat) * UNITS_PER_FOOT;
      const wy = (road.yFeet + col.yDrop) * UNITS_PER_FOOT;
      const wz = (road.zFeet + nz * col.lat) * UNITS_PER_FOOT;
      positions.push(wx, wy, wz);

      let vColor = cAsphalt;
      if (c === 0 || c === 5) {
        vColor = i % 2 === 0 ? cGrass : cGrassAlt;
      } else if (c === 1 || c === 4) {
        vColor = isRedCurb ? cCurbRed : cCurbWhite;
      } else {
        if (isShoveWindow) {
          vColor = cStartZone;
        } else if (road.surface === 'cobblestone') {
          vColor = cCobble;
        } else {
          vColor = cAsphalt;
        }
      }
      colors.push(vColor.r, vColor.g, vColor.b);
    }

    if (i < steps) {
      const rowA = i * numCols;
      const rowB = (i + 1) * numCols;
      for (let c = 0; c < numCols - 1; c++) {
        indices.push(rowA + c, rowB + c, rowA + c + 1);
        indices.push(rowA + c + 1, rowB + c, rowB + c + 1);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.78,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });

  const roadMesh = new THREE.Mesh(geo, mat);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  // Dashed yellow/white centerline dashes along the 1,000-ft course
  const dashGeo = new THREE.BoxGeometry(1.1, 0.025, 0.12);
  const dashMat = makeSoapboxMat('#facc15', 0.4);
  for (let s = 12; s < 990; s += 24) {
    const r = getSoapboxRoadState(s);
    const dash = new THREE.Mesh(dashGeo, dashMat);
    dash.position.set(
      r.xFeet * UNITS_PER_FOOT,
      r.yFeet * UNITS_PER_FOOT + 0.02,
      r.zFeet * UNITS_PER_FOOT
    );
    dash.rotation.y = -r.headingRad;
    dash.rotation.z = -r.slopeRad;
    group.add(dash);
  }

  return group;
}

export const SoapboxCanvas3D: React.FC<SoapboxCanvas3DProps> = React.memo(({
  mode,
  paused = false,
  loadout,
  metrics,
  selectedCategory,
  shakerRigActive,
  simStateRef,
  bestRecordFeet,
  bestTimeSec,
  onSelectCategory,
  onHudSync,
  onRunFinished,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const modeRef = useRef(mode);
  const pausedRef = useRef(paused);
  const metricsRef = useRef(metrics);
  const selectedCategoryRef = useRef(selectedCategory);
  const hoveredCategoryRef = useRef<SoapboxPartCategory | null>(null);
  const shakerRigRef = useRef(shakerRigActive);
  const bestDistRef = useRef(bestRecordFeet);
  const bestTimeRef = useRef(bestTimeSec);
  const onSelectCategoryRef = useRef(onSelectCategory);
  const onHudSyncRef = useRef(onHudSync);
  const onRunFinishedRef = useRef(onRunFinished);
  const finishNotifiedRef = useRef(false);

  modeRef.current = mode;
  pausedRef.current = paused;
  metricsRef.current = metrics;
  selectedCategoryRef.current = selectedCategory;
  shakerRigRef.current = shakerRigActive;
  bestDistRef.current = bestRecordFeet;
  bestTimeRef.current = bestTimeSec;
  onSelectCategoryRef.current = onSelectCategory;
  onHudSyncRef.current = onHudSync;
  onRunFinishedRef.current = onRunFinished;

  const craftGroupsRef = useRef<Soapbox3DGroups | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const orbitYawRef = useRef<number>(-0.62);
  const orbitPitchRef = useRef<number>(0.28);
  const orbitRadiusRef = useRef<number>(5.8);
  const snapBounceRef = useRef<number>(0);
  const raceCamSnappedRef = useRef<boolean>(false);
  const loopControlRef = useRef<{ pause: () => void; resume: () => void } | null>(null);

  useEffect(() => {
    if (paused) {
      loopControlRef.current?.pause();
    } else {
      loopControlRef.current?.resume();
    }
  }, [paused]);

  useEffect(() => {
    if (mode !== 'garage') return;
    const preset = CATEGORY_CAMERA_PRESETS[selectedCategory];
    if (preset) {
      orbitYawRef.current = preset.yaw;
      orbitPitchRef.current = preset.pitch;
      orbitRadiusRef.current = preset.radius;
    }
  }, [selectedCategory, mode]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (craftGroupsRef.current) {
      scene.remove(craftGroupsRef.current.root);
      disposeSoapboxObject3D(craftGroupsRef.current.root, false);
    }

    const built = buildSoapbox3D(loadout);
    scene.add(built.root);
    craftGroupsRef.current = built;
    snapBounceRef.current = 1.0;
  }, [loadout]);

  useEffect(() => {
    if (mode === 'race') {
      finishNotifiedRef.current = false;
      hoveredCategoryRef.current = null;
      raceCamSnappedRef.current = false;
    }
  }, [mode]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#38bdf8');
    scene.fog = new THREE.FogExp2('#bae6fd', 0.0038);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      52,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      460
    );

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const hemiLight = new THREE.HemisphereLight('#ffffff', '#15803d', 1.15);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight('#fffbeb', 1.65);
    sunLight.position.set(20, 38, 24);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 130;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.02;
    const shadowD = 9.0;
    sunLight.shadow.camera.left = -shadowD;
    sunLight.shadow.camera.right = shadowD;
    sunLight.shadow.camera.top = shadowD;
    sunLight.shadow.camera.bottom = -shadowD;
    scene.add(sunLight);
    scene.add(sunLight.target);

    // ==========================================================================
    // 1. GARAGE PIT & HYDRAULIC SHAKER / TILT DYNO RIG ENVIRONMENT
    // ==========================================================================
    const garageEnv = new THREE.Group();
    scene.add(garageEnv);

    // Pit Turntable Platform
    const turntable = new THREE.Mesh(
      new THREE.CylinderGeometry(4.2, 4.5, 0.35, 36),
      makeSoapboxMat('#0f172a', 0.45, 0.3)
    );
    turntable.position.y = -0.82;
    turntable.receiveShadow = true;
    garageEnv.add(turntable);

    const turntableRing = new THREE.Mesh(
      new THREE.RingGeometry(3.75, 4.05, 36),
      new THREE.MeshBasicMaterial({ color: '#facc15', side: THREE.DoubleSide })
    );
    turntableRing.rotation.x = -Math.PI / 2;
    turntableRing.position.y = -0.63;
    garageEnv.add(turntableRing);

    // 4 Hydraulic Shaker Pad Plates under the wheels
    const shakerPadsGroup = new THREE.Group();
    garageEnv.add(shakerPadsGroup);
    const padMeshes: THREE.Mesh[] = [];
    [
      [0.82, 0.68],
      [0.82, -0.68],
      [-0.82, 0.68],
      [-0.82, -0.68],
    ].forEach(([px, pz]) => {
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.1, 0.48),
        makeSoapboxMat('#f97316', 0.3, 0.6)
      );
      pad.position.set(px, -0.6, pz);
      shakerPadsGroup.add(pad);
      padMeshes.push(pad);
    });

    // 3D Center of Gravity (CoG) Height Pin & Track Width Stance Bar in Garage
    const cgPinGroup = new THREE.Group();
    const cgSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 14, 14),
      new THREE.MeshBasicMaterial({ color: '#facc15' })
    );
    const cgStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.9, 8),
      new THREE.MeshBasicMaterial({ color: '#facc15' })
    );
    cgStem.position.y = -0.45;
    cgPinGroup.add(cgSphere, cgStem);
    garageEnv.add(cgPinGroup);

    const trackWidthBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.04, 1.0),
      new THREE.MeshBasicMaterial({ color: '#22d3ee' })
    );
    trackWidthBar.position.set(0.82, -0.58, 0);
    garageEnv.add(trackWidthBar);

    // ==========================================================================
    // 2. ALPINE HILLTOP START PAVILION & 1,000-FT DOWNHILL ROAD COURSE
    // ==========================================================================
    const raceEnv = new THREE.Group();
    scene.add(raceEnv);

    // Continuous 3D Winding Road Ribbon (Asphalt + Cobblestones + Curbs + Hillside)
    const roadRibbon = buildCourseRoadRibbon();
    raceEnv.add(roadRibbon);

    // Hilltop Start Pavilion at s = -40..0 ft (+110 ft elevation)
    const startRoad = getSoapboxRoadState(-36);
    const pavilionGroup = new THREE.Group();
    pavilionGroup.position.set(
      startRoad.xFeet * UNITS_PER_FOOT,
      startRoad.yFeet * UNITS_PER_FOOT,
      startRoad.zFeet * UNITS_PER_FOOT
    );
    pavilionGroup.rotation.z = -startRoad.slopeRad;

    // 4 Red Bull Navy Support Pillars + Pitched Alpine Roof Canopy
    [
      [-1.4, 3.2],
      [-1.4, -3.2],
      [3.8, 3.2],
      [3.8, -3.2],
    ].forEach(([px, pz]) => {
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.18, 4.2, 10),
        makeSoapboxMat('#1e293b', 0.35, 0.6)
      );
      pillar.position.set(px, 2.1, pz);
      pavilionGroup.add(pillar);
    });

    const roofCanopy = new THREE.Mesh(
      new THREE.BoxGeometry(6.2, 0.35, 7.2),
      makeSoapboxMat('#dc2626', 0.35)
    );
    roofCanopy.position.set(1.2, 4.2, 0);
    pavilionGroup.add(roofCanopy);

    // 5-Light Racing Start Gantry
    const gantryBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.55, 3.6),
      makeSoapboxMat('#0f172a', 0.4)
    );
    gantryBar.position.set(3.8, 3.6, 0);
    pavilionGroup.add(gantryBar);

    const gantryLightMats: THREE.MeshBasicMaterial[] = [];
    for (let i = 0; i < 5; i++) {
      const lMat = new THREE.MeshBasicMaterial({ color: '#ef4444' });
      gantryLightMats.push(lMat);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 10), lMat);
      bulb.position.set(3.98, 3.6, (i - 2) * 0.62);
      pavilionGroup.add(bulb);
    }

    // Animated Hinged Steel Starting Drop-Gate at s = -28 ft
    const startGatePivot = new THREE.Group();
    startGatePivot.position.set(2.2, 0.05, 0);
    const gatePlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.85, 5.4),
      makeSoapboxMat('#facc15', 0.3, 0.6)
    );
    gatePlate.position.y = 0.42;
    startGatePivot.add(gatePlate);
    pavilionGroup.add(startGatePivot);

    raceEnv.add(pavilionGroup);

    // 1,000-Ft Checkered Finish Arch at s = 1000 ft!
    const finishRoad = getSoapboxRoadState(SOAPBOX_COURSE_LENGTH_FEET);
    const finishArchGroup = new THREE.Group();
    finishArchGroup.position.set(
      finishRoad.xFeet * UNITS_PER_FOOT,
      finishRoad.yFeet * UNITS_PER_FOOT,
      finishRoad.zFeet * UNITS_PER_FOOT
    );
    finishArchGroup.rotation.y = -finishRoad.headingRad;

    [-3.6, 3.6].forEach((fz) => {
      const tower = new THREE.Mesh(
        new THREE.BoxGeometry(0.75, 5.2, 0.75),
        makeSoapboxMat('#0f172a', 0.35)
      );
      tower.position.set(0, 2.6, fz);
      finishArchGroup.add(tower);

      // Checkered accent blocks on towers
      for (let b = 0; b < 4; b++) {
        const checker = new THREE.Mesh(
          new THREE.BoxGeometry(0.8, 0.55, 0.8),
          makeSoapboxMat(b % 2 === 0 ? '#f8fafc' : '#ef4444', 0.3)
        );
        checker.position.set(0, 0.8 + b * 1.1, fz);
        finishArchGroup.add(checker);
      }
    });

    const archBanner = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 1.1, 8.2),
      makeSoapboxMat('#facc15', 0.25)
    );
    archBanner.position.set(0, 5.2, 0);
    finishArchGroup.add(archBanner);
    raceEnv.add(finishArchGroup);

    // 3D Course Obstacles (Hay Bales, Water Slicks, Timber Kickers, Speed Gates)
    const obstacleMeshes = new Map<string, THREE.Object3D>();
    const initialObstacles = simStateRef.current.obstacles;

    initialObstacles.forEach((obs) => {
      const r = getSoapboxRoadState(obs.sFeet);
      const pos = courseToWorldUnits(obs.sFeet, obs.lateralCenterFeet, 0);
      const node = new THREE.Group();
      node.position.copy(pos);
      node.rotation.y = -r.headingRad;
      node.rotation.z = -r.slopeRad;

      if (obs.type === 'hay_bale') {
        // Stack of 3 Golden Straw Bales with Red Twine Straps
        const baleGeo = new THREE.BoxGeometry(0.75, 0.52, 1.15);
        const baleMat = makeSoapboxMat('#eab308', 0.8);
        const strapMat = makeSoapboxMat('#dc2626', 0.4);
        [
          [0, 0.26, -0.52],
          [0, 0.26, 0.52],
          [0, 0.76, 0],
        ].forEach(([bx, by, bz]) => {
          const bale = new THREE.Mesh(baleGeo, baleMat);
          bale.position.set(bx, by, bz);
          const strap = new THREE.Mesh(
            new THREE.BoxGeometry(0.78, 0.54, 0.14),
            strapMat
          );
          strap.position.set(bx, by, bz);
          node.add(bale, strap);
        });
      } else if (obs.type === 'water_slick') {
        // Shimmering Cyan/Violet Soapy Water Puddle + Foam Bubbles
        const puddle = new THREE.Mesh(
          new THREE.CylinderGeometry(
            obs.halfWidthFeet * UNITS_PER_FOOT,
            obs.halfWidthFeet * UNITS_PER_FOOT,
            0.03,
            20
          ),
          new THREE.MeshStandardMaterial({
            color: '#22d3ee',
            emissive: '#0284c7',
            emissiveIntensity: 0.25,
            roughness: 0.08,
            metalness: 0.65,
          })
        );
        puddle.scale.set(1.5, 1, 1);
        puddle.position.y = 0.02;
        node.add(puddle);

        for (let b = 0; b < 6; b++) {
          const bubble = new THREE.Mesh(
            new THREE.SphereGeometry(0.11, 8, 8),
            makeSoapboxMat('#ffffff', 0.15)
          );
          bubble.position.set(
            (b - 2.5) * 0.35,
            0.09,
            Math.sin(b * 1.7) * 0.45
          );
          node.add(bubble);
        }
      } else if (obs.type === 'kicker_jump') {
        // Orange Timber Kicker Jump Ramp Wedge
        const rampGeo = new THREE.BoxGeometry(
          obs.lengthFeet * UNITS_PER_FOOT,
          0.55,
          obs.halfWidthFeet * 2 * UNITS_PER_FOOT
        );
        const ramp = new THREE.Mesh(rampGeo, makeSoapboxMat('#f97316', 0.45));
        ramp.position.set(0, 0.18, 0);
        ramp.rotation.z = 0.2;
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(
            obs.lengthFeet * UNITS_PER_FOOT * 0.85,
            0.58,
            0.4
          ),
          makeSoapboxMat('#facc15', 0.3)
        );
        stripe.position.set(0, 0.19, 0);
        stripe.rotation.z = 0.2;
        node.add(ramp, stripe);
      } else if (obs.type === 'speed_gate') {
        // Twin Red Bull Speed Gate Inflatable Pylons + Glowing Boost Pad
        const halfGateZ = obs.halfWidthFeet * UNITS_PER_FOOT;
        [-halfGateZ, halfGateZ].forEach((gz) => {
          const pylon = new THREE.Mesh(
            new THREE.ConeGeometry(0.32, 2.4, 12),
            makeSoapboxMat('#2563eb', 0.3)
          );
          pylon.position.set(0, 1.2, gz);
          const tip = new THREE.Mesh(
            new THREE.ConeGeometry(0.18, 0.7, 12),
            makeSoapboxMat('#ef4444', 0.3)
          );
          tip.position.set(0, 2.1, gz);
          node.add(pylon, tip);
        });

        const boostCarpet = new THREE.Mesh(
          new THREE.BoxGeometry(1.4, 0.03, halfGateZ * 1.8),
          new THREE.MeshBasicMaterial({ color: '#4ade80' })
        );
        boostCarpet.position.y = 0.025;
        node.add(boostCarpet);
      }

      obstacleMeshes.set(obs.id, node);
      raceEnv.add(node);
    });

    // Alpine Pine Trees & Spectator Chalets flanking the hillside
    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.18, 1.1, 8);
    const trunkMat = makeSoapboxMat('#78350f', 0.8);
    const foliageGeo = new THREE.ConeGeometry(0.95, 2.6, 10);
    const foliageMat = makeSoapboxMat('#15803d', 0.65);

    for (let s = 30; s <= 980; s += 42) {
      [-1, 1].forEach((side) => {
        const lat = side * (22 + ((s * 7) % 9));
        const pos = courseToWorldUnits(s, lat, -0.5);
        const tree = new THREE.Group();
        tree.position.copy(pos);
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 0.55;
        const cone = new THREE.Mesh(foliageGeo, foliageMat);
        cone.position.y = 2.0;
        tree.add(trunk, cone);
        raceEnv.add(tree);
      });
    }

    // Flying Golden Straw Burst Particle Pool + Tire Smoke / Sparks Pool
    const strawParticles: Array<{
      mesh: THREE.Mesh;
      vx: number;
      vy: number;
      vz: number;
      life: number;
    }> = [];
    const strawGeo = new THREE.BoxGeometry(0.24, 0.08, 0.42);
    const strawMat = makeSoapboxMat('#facc15', 0.6);
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(strawGeo, strawMat);
      m.visible = false;
      raceEnv.add(m);
      strawParticles.push({ mesh: m, vx: 0, vy: 0, vz: 0, life: 0 });
    }

    // Detached Crash Debris Meshes Pool (for yard-sale rollover)
    const debrisMeshes: THREE.Mesh[] = [];
    const debrisGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.18, 12);
    const debrisMat = makeSoapboxMat('#ef4444', 0.4);
    for (let i = 0; i < 6; i++) {
      const dm = new THREE.Mesh(debrisGeo, debrisMat);
      dm.visible = false;
      raceEnv.add(dm);
      debrisMeshes.push(dm);
    }

    // Initial 3D Soapbox Build
    const initialBuilt = buildSoapbox3D(loadout);
    scene.add(initialBuilt.root);
    craftGroupsRef.current = initialBuilt;

    // ==========================================================================
    // 3. POINTER ORBIT & 3D SOCKET CLICK INTERACTION (GARAGE MODE)
    // ==========================================================================
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let isDraggingOrbit = false;
    let pointerDownX = 0;
    let pointerDownY = 0;
    let lastPointerX = 0;
    let lastPointerY = 0;

    const updateNdc = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    };

    const pickSocketCategory = (clientX: number, clientY: number): SoapboxPartCategory | null => {
      const groups = craftGroupsRef.current;
      if (!groups || modeRef.current !== 'garage') return null;
      updateNdc(clientX, clientY);
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(groups.socketMarkerList, false);
      if (hits.length > 0) {
        return (hits[0].object.userData?.category as SoapboxPartCategory) ?? null;
      }
      return null;
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (modeRef.current !== 'garage') return;
      isDraggingOrbit = true;
      pointerDownX = e.clientX;
      pointerDownY = e.clientY;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (modeRef.current !== 'garage') return;
      if (isDraggingOrbit) {
        const dx = e.clientX - lastPointerX;
        const dy = e.clientY - lastPointerY;
        lastPointerX = e.clientX;
        lastPointerY = e.clientY;
        orbitYawRef.current -= dx * 0.0075;
        orbitPitchRef.current = Math.max(
          0.08,
          Math.min(1.15, orbitPitchRef.current + dy * 0.0065)
        );
      } else {
        hoveredCategoryRef.current = pickSocketCategory(e.clientX, e.clientY);
        renderer.domElement.style.cursor = hoveredCategoryRef.current ? 'pointer' : 'grab';
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (modeRef.current !== 'garage') return;
      const moved = Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY);
      isDraggingOrbit = false;
      if (moved < 6) {
        const hitCat = pickSocketCategory(e.clientX, e.clientY);
        if (hitCat && onSelectCategoryRef.current) {
          soundEngine.playSnapPop();
          onSelectCategoryRef.current(hitCat);
        }
      }
    };

    const handlePointerCancel = () => {
      isDraggingOrbit = false;
      hoveredCategoryRef.current = null;
    };

    const handleWheel = (e: WheelEvent) => {
      if (modeRef.current !== 'garage') return;
      e.preventDefault();
      orbitRadiusRef.current = Math.max(
        3.8,
        Math.min(9.5, orbitRadiusRef.current + e.deltaY * 0.003)
      );
    };

    const domElem = renderer.domElement;
    domElem.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    window.addEventListener('blur', handlePointerCancel);
    domElem.addEventListener('wheel', handleWheel, { passive: false });

    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // ==========================================================================
    // 4. 60FPS RENDER + 120HZ SUB-STEPPED SOAPBOX PHYSICS LOOP
    // ==========================================================================
    let rafId = 0;
    let lastTime = performance.now();
    let hudSyncAccum = 0;
    let lastBurstCount = 0;
    let lastHudPhase = '';
    let lastHudSection = '';
    let lastHudBanner = '';
    let lastHudRollWarn = false;
    let lastHudDrifting = false;
    let lastHudFade = false;
    let lastHudHull = 100;

    const tempCarWorldPos = new THREE.Vector3();
    const tempCamLookPos = new THREE.Vector3();
    const tempDesiredCamPos = new THREE.Vector3();
    const tempBurstOrigin = new THREE.Vector3();

    const animate = (now: number) => {
      if (pausedRef.current) {
        rafId = 0;
        return;
      }
      rafId = window.requestAnimationFrame(animate);
      const rawDt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const tSec = now * 0.001;

      const curMode = modeRef.current;
      const curMetrics = metricsRef.current;
      const craft = craftGroupsRef.current;
      if (!craft) return;

      garageEnv.visible = curMode === 'garage';
      raceEnv.visible = curMode === 'race';

      // Bouncy part-equip scale pop
      if (snapBounceRef.current > 0) {
        snapBounceRef.current = Math.max(0, snapBounceRef.current - rawDt * 4.5);
      }
      const bounceScale =
        1 + Math.sin(snapBounceRef.current * Math.PI) * 0.075;

      if (curMode === 'garage') {
        craft.root.position.set(0, -0.1, 0);
        craft.root.rotation.set(0, 0, 0);
        craft.root.scale.setScalar(bounceScale);
        craft.crewGroup.visible = false;
        craft.wheelsGroup.visible = true;
        craft.topperGroup.visible = true;
        craft.driverGroup.position.set(0, 0, 0);
        craft.driverGroup.rotation.set(0, 0, 0);

        // Show & pulse socket halo markers
        const activeCat = selectedCategoryRef.current;
        const hoveredCat = hoveredCategoryRef.current;
        (Object.keys(craft.socketMarkers) as SoapboxPartCategory[]).forEach((cat) => {
          const marker = craft.socketMarkers[cat];
          marker.visible = true;
          const isSelected = cat === activeCat || cat === hoveredCat;
          const s = isSelected ? 1.18 + Math.sin(tSec * 6) * 0.12 : 0.85;
          marker.scale.setScalar(s);
        });

        // Update 3D CoG Pin & Track Width Bar
        cgPinGroup.position.set(
          curMetrics.cgX,
          curMetrics.cgHeightMeters - 0.34,
          0
        );
        trackWidthBar.scale.z = curMetrics.trackWidthMeters;

        // Interactive Road Shaker & Tilt Dyno Rig!
        if (shakerRigRef.current) {
          const rumble = Math.sin(tSec * 28) * 0.045;
          const tiltAngle =
            Math.sin(tSec * 2.4) *
            (0.28 / Math.max(0.75, curMetrics.staticStabilityFactor));
          const steerSweep = Math.sin(tSec * 3.1) * 0.42;

          craft.sprungGroup.position.y = rumble;
          craft.sprungGroup.rotation.x = tiltAngle;
          craft.frontSteerNodes.forEach((n) => {
            n.rotation.y = steerSweep;
          });
          craft.wheelSpinners.forEach((w) => {
            w.rotation.z -= rawDt * 14;
          });
          craft.shockSpringMeshes.forEach((sMesh, idx) => {
            sMesh.scale.y = 1 + Math.sin(tSec * 28 + idx) * 0.22;
          });
          padMeshes.forEach((pad, idx) => {
            pad.position.y = -0.6 + Math.sin(tSec * 28 + idx) * 0.04;
          });
        } else {
          craft.sprungGroup.position.y = 0;
          craft.sprungGroup.rotation.x = 0;
          craft.frontSteerNodes.forEach((n) => {
            n.rotation.y = 0;
          });
          craft.shockSpringMeshes.forEach((sMesh) => {
            sMesh.scale.y = 1;
          });
        }

        // Orbit Camera around the Garage Turntable
        const yaw = orbitYawRef.current;
        const pitch = orbitPitchRef.current;
        const rad = orbitRadiusRef.current;
        camera.position.set(
          Math.cos(pitch) * Math.cos(yaw) * rad,
          Math.sin(pitch) * rad + 0.35,
          Math.cos(pitch) * Math.sin(yaw) * rad
        );
        camera.lookAt(0, 0.18, 0);
        sunLight.position.set(14, 28, 18);
        sunLight.target.position.set(0, 0, 0);
      } else {
        // ======================================================================
        // RACE MODE: 120HZ PHYSICS SUB-STEPPING & 3D DOWNHILL TRACK CHASE CAM
        // ======================================================================
        if (domElem.style.cursor !== 'default') {
          domElem.style.cursor = 'default';
        }
        (Object.values(craft.socketMarkers) as THREE.Mesh[]).forEach((m) => {
          m.visible = false;
        });

        const sim = simStateRef.current;
        let runJustFinished = false;
        if (!pausedRef.current && rawDt > 0) {
          const subSteps = 2;
          const subDt = rawDt / subSteps;
          for (let step = 0; step < subSteps; step++) {
            const ev = stepSoapboxSimulation(
              sim,
              curMetrics,
              subDt,
              bestDistRef.current,
              bestTimeRef.current
            );

            if (ev.gateDropped) {
              soundEngine.playStartGateDrop();
            }
            if (ev.pushShoveResult) {
              soundEngine.playTrolleyDetach(ev.pushShoveResult === 'perfect');
            }
            if (ev.hayBaleHit || ev.bottomedOut || ev.rolledOver) {
              soundEngine.playCrashThud();
            }
            if (ev.waterSlickEntered) {
              soundEngine.playSplash(45);
            }
            if (ev.speedGateCleared || ev.kickerLaunched) {
              soundEngine.playThermalChime();
            }
            if (ev.driftChirp) {
              soundEngine.playTireScreech();
            }
            if (ev.finishedRun && !finishNotifiedRef.current) {
              finishNotifiedRef.current = true;
              runJustFinished = true;
            }
          }

          hudSyncAccum += rawDt;
          const bannerText = sim.statusBanner?.text ?? '';
          const discreteChanged =
            sim.phase !== lastHudPhase ||
            sim.sectionName !== lastHudSection ||
            bannerText !== lastHudBanner ||
            sim.rollWarning !== lastHudRollWarn ||
            sim.isDrifting !== lastHudDrifting ||
            sim.isBrakeFading !== lastHudFade ||
            sim.structuralIntegrity !== lastHudHull;

          if (discreteChanged || hudSyncAccum >= 0.08) {
            hudSyncAccum = 0;
            lastHudPhase = sim.phase;
            lastHudSection = sim.sectionName;
            lastHudBanner = bannerText;
            lastHudRollWarn = sim.rollWarning;
            lastHudDrifting = sim.isDrifting;
            lastHudFade = sim.isBrakeFading;
            lastHudHull = sim.structuralIntegrity;
            onHudSyncRef.current({ ...sim });
          }

          if (runJustFinished) {
            onRunFinishedRef.current({ ...sim });
          }
        }

        // Update 5-light start gantry & hinged drop-gate
        const gateAngle = sim.gateOpenProgress * (Math.PI * 0.48);
        startGatePivot.rotation.z = -gateAngle;
        gantryLightMats.forEach((mat, idx) => {
          if (sim.phase !== 'skit') {
            mat.color.set('#22c55e');
          } else {
            const litCount = Math.floor((sim.phaseTime / 3.2) * 5);
            mat.color.set(idx <= litCount ? '#ef4444' : '#334155');
          }
        });

        // Update obstacle meshes (scatter smashed hay bales)
        sim.obstacles.forEach((obs) => {
          const obj = obstacleMeshes.get(obs.id);
          if (obj && obs.type === 'hay_bale') {
            obj.visible = !obs.triggered;
          }
        });

        // Spawn flying golden straw burst particles when a new hay-bale smash occurs
        if (sim.hayBursts.length !== lastBurstCount) {
          if (sim.hayBursts.length === 0) {
            lastBurstCount = 0;
          } else {
            const latest = sim.hayBursts[sim.hayBursts.length - 1];
            lastBurstCount = sim.hayBursts.length;
            courseToWorldUnits(latest.sFeet, latest.lateralFeet, 1.5, tempBurstOrigin);
            strawParticles.forEach((p, idx) => {
              p.mesh.position.copy(tempBurstOrigin);
              p.mesh.visible = true;
              const ang = (idx / strawParticles.length) * Math.PI * 2;
              p.vx = Math.cos(ang) * (3 + (idx % 4));
              p.vy = 4.5 + (idx % 5) * 1.2;
              p.vz = Math.sin(ang) * (3 + (idx % 4));
              p.life = 1.4;
            });
          }
        }

        // Step flying straw particles
        strawParticles.forEach((p) => {
          if (p.life <= 0) return;
          p.life -= rawDt;
          if (p.life <= 0) {
            p.mesh.visible = false;
            return;
          }
          p.mesh.position.x += p.vx * rawDt;
          p.mesh.position.y += p.vy * rawDt;
          p.mesh.position.z += p.vz * rawDt;
          p.vy -= 9.8 * rawDt;
          p.mesh.rotation.x += 5 * rawDt;
          p.mesh.rotation.y += 4 * rawDt;
        });

        // Position & orient the 3D Soapbox along the 1,000-ft road!
        const road = getSoapboxRoadState(sim.sFeet);
        courseToWorldUnits(
          sim.sFeet,
          sim.lateralOffsetFeet,
          sim.airborneHeightFeet + 1.8,
          tempCarWorldPos
        );
        craft.root.position.copy(tempCarWorldPos);
        craft.root.scale.setScalar(0.56);

        const driftRad = THREE.MathUtils.degToRad(sim.driftAngleDeg);
        const rollRad = THREE.MathUtils.degToRad(sim.rollDeg);
        const airPitchBonus =
          sim.airborneHeightFeet > 0.1
            ? THREE.MathUtils.clamp(sim.verticalVelFtS * 0.015, -0.28, 0.32)
            : 0;

        craft.root.rotation.order = 'YXZ';
        craft.root.rotation.y = -road.headingRad - driftRad * 0.65;
        craft.root.rotation.z = -road.slopeRad + airPitchBonus;
        craft.root.rotation.x = rollRad;

        // Suspension compression & driver aero-tuck animation
        const compOffset = -Math.min(0.24, sim.suspensionCompression * 0.18);
        craft.sprungGroup.position.y = compOffset;
        craft.sprungGroup.rotation.x = 0;

        craft.driverGroup.position.y = sim.pushTuckActive ? -0.14 : 0;
        craft.driverGroup.rotation.z = sim.pushTuckActive ? -0.28 : 0;

        // Front wheel steering & 4-wheel spin
        const steerRad = -THREE.MathUtils.degToRad(sim.steerAngleDeg);
        craft.frontSteerNodes.forEach((n) => {
          n.rotation.y = steerRad;
        });

        const wheelSpinRate =
          (sim.speedFtS * 0.3048) / Math.max(0.18, craft.wheelRadiusMeters);
        craft.wheelSpinners.forEach((w) => {
          w.rotation.z -= wheelSpinRate * rawDt;
        });

        craft.shockSpringMeshes.forEach((sMesh) => {
          sMesh.scale.y = Math.max(0.55, 1 - sim.suspensionCompression * 0.35);
        });

        // Push-Crew Joggers on the Starter Chute (-40..0 ft)
        craft.crewGroup.visible = sim.phase === 'skit' || sim.phase === 'start_ramp';
        if (craft.crewGroup.visible) {
          craft.crewGroup.children.forEach((runner, idx) => {
            runner.position.y =
              -0.28 + Math.abs(Math.sin(tSec * 14 + idx * 1.4)) * 0.14;
          });
        }

        // Detached Crash Debris Meshes
        if (sim.debris.length > 0) {
          craft.wheelsGroup.visible = false;
          craft.topperGroup.visible = false;
          sim.debris.forEach((d, idx) => {
            const dm = debrisMeshes[idx];
            if (!dm) return;
            dm.visible = true;
            courseToWorldUnits(d.xFeet, d.zFeet - road.zFeet, d.yFeet - road.yFeet, dm.position);
            dm.rotation.set(d.rx, d.ry, d.rz);
          });
        } else {
          craft.wheelsGroup.visible = true;
          craft.topperGroup.visible = true;
          debrisMeshes.forEach((dm) => {
            dm.visible = false;
          });
        }

        // Dynamic Follow Chase Camera behind the Soapbox along the winding road
        const camBackFeet = sim.phase === 'skit' ? 22 : 25;
        const camUpFeet = sim.phase === 'skit' ? 11 : 11.5;
        courseToWorldUnits(
          sim.sFeet - camBackFeet,
          sim.lateralOffsetFeet * 0.55,
          camUpFeet,
          tempDesiredCamPos
        );
        if (!raceCamSnappedRef.current) {
          raceCamSnappedRef.current = true;
          camera.position.copy(tempDesiredCamPos);
        } else {
          camera.position.lerp(tempDesiredCamPos, Math.min(1, rawDt * 10));
        }

        courseToWorldUnits(
          sim.sFeet + 18,
          sim.lateralOffsetFeet * 0.65,
          2.2,
          tempCamLookPos
        );
        camera.lookAt(tempCamLookPos);

        // Keep directional shadow frustum centered on the soapbox
        sunLight.position.set(
          tempCarWorldPos.x + 14,
          tempCarWorldPos.y + 28,
          tempCarWorldPos.z + 18
        );
        sunLight.target.position.copy(tempCarWorldPos);
      }

      renderer.render(scene, camera);
    };

    loopControlRef.current = {
      pause: () => {
        if (rafId) {
          window.cancelAnimationFrame(rafId);
          rafId = 0;
        }
      },
      resume: () => {
        if (!rafId && !pausedRef.current) {
          lastTime = performance.now();
          rafId = window.requestAnimationFrame(animate);
        }
      },
    };

    if (!pausedRef.current) {
      rafId = window.requestAnimationFrame(animate);
    }

    return () => {
      loopControlRef.current = null;
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      domElem.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      window.removeEventListener('blur', handlePointerCancel);
      domElem.removeEventListener('wheel', handleWheel);
      window.removeEventListener('resize', handleResize);

      sunLight.shadow.map?.dispose();
      disposeSoapboxObject3D(scene, true);
      renderer.renderLists?.dispose?.();
      renderer.dispose();
      if (domElem.parentNode === container) {
        container.removeChild(domElem);
      }
      sceneRef.current = null;
      craftGroupsRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 h-full w-full overflow-hidden"
    />
  );
});
