import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  SoapboxLoadout,
  SoapboxPartCategory,
} from './SoapboxPartCatalog';
import { ComputedSoapboxMetrics } from './SoapboxMetrics';
import {
  getSoapboxRoadState,
  SoapboxDetachablePartSlot,
  SoapboxSimulationState,
  stepSoapboxSimulation,
} from './SoapboxPhysicsEngine';
import {
  buildSoapbox3D,
  buildSoapboxDebrisMeshes,
  disposeSoapboxObject3D,
  makeSoapboxMat,
  Soapbox3DGroups,
} from './Soapbox3DBuilder';
import {
  SoapboxCourseDef,
  SoapboxCourseId,
  getSoapboxCourse,
} from './SoapboxCourses';
import { soundEngine } from '../audio/SoundEngine';

interface SoapboxCanvas3DProps {
  mode: 'garage' | 'race';
  courseId?: SoapboxCourseId;
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
  outVec?: THREE.Vector3,
  courseId: SoapboxCourseId = 'alpine_panorama'
): THREE.Vector3 {
  const road = getSoapboxRoadState(sFeet, courseId);
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
 * Builds a continuous 3D road ribbon mesh with vertex colors for active course.
 */
function buildCourseRoadRibbon(course: SoapboxCourseDef): THREE.Group {
  const group = new THREE.Group();
  const sMin = -course.startRampFeet - 6;
  const sMax = course.lengthFeet + 90;
  const steps = Math.round((sMax - sMin) * 0.38);
  const halfW = ROAD_HALF_WIDTH_FEET;
  const curbW = 2.2;
  const skirtW = 26.0;

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

  const theme = course.visualTheme;
  const cSkirt = new THREE.Color(theme.grassColor);
  const cSkirtAlt = new THREE.Color(theme.grassAltColor);
  const cCurbPrimary = new THREE.Color(theme.curbColorPrimary);
  const cCurbSecondary = new THREE.Color(theme.curbColorSecondary);
  const cAsphalt = new THREE.Color(theme.asphaltColor);
  const cCobble = new THREE.Color(theme.cobbleColor);
  const cStartZone = new THREE.Color('#065f46');

  for (let i = 0; i <= steps; i++) {
    const s = sMin + (i / steps) * (sMax - sMin);
    const road = getSoapboxRoadState(s, course.id);
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
        vColor = i % 2 === 0 ? cSkirt : cSkirtAlt;
      } else if (c === 1 || c === 4) {
        vColor = isRedCurb ? cCurbPrimary : cCurbSecondary;
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

  // Dashed yellow centerline dashes along the course
  const dashGeo = new THREE.BoxGeometry(1.1, 0.025, 0.12);
  const dashMat = makeSoapboxMat('#facc15', 0.4);
  for (let s = 12; s < course.lengthFeet - 10; s += 24) {
    const r = getSoapboxRoadState(s, course.id);
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

/**
 * Builds thematic scenery props matching course biome.
 */
function buildThemedScenery(raceEnv: THREE.Group, course: SoapboxCourseDef): void {
  const theme = course.visualTheme;
  const sMax = course.lengthFeet - 20;

  if (theme.sceneryType === 'alpine_pines') {
    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.18, 1.1, 8);
    const trunkMat = makeSoapboxMat('#78350f', 0.8);
    const foliageGeo = new THREE.ConeGeometry(0.95, 2.6, 10);
    const foliageMat = makeSoapboxMat(theme.grassColor, 0.65);

    for (let s = 30; s <= sMax; s += 42) {
      [-1, 1].forEach((side) => {
        const lat = side * (22 + ((s * 7) % 9));
        const pos = courseToWorldUnits(s, lat, -0.5, undefined, course.id);
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
  } else if (theme.sceneryType === 'desert_canyon') {
    const rockGeo = new THREE.CylinderGeometry(1.6, 2.4, 4.8, 6);
    const rockMat = makeSoapboxMat(theme.asphaltColor, 0.9, 0.1);
    const cactusMat = makeSoapboxMat('#15803d', 0.7);

    for (let s = 40; s <= sMax; s += 50) {
      [-1, 1].forEach((side) => {
        const lat = side * (25 + ((s * 5) % 11));
        const pos = courseToWorldUnits(s, lat, -0.2, undefined, course.id);
        const rock = new THREE.Mesh(rockGeo, rockMat);
        rock.position.copy(pos);
        rock.position.y += 2.4;
        rock.scale.set(1 + (s % 3) * 0.4, 1 + (s % 2) * 0.5, 1);
        raceEnv.add(rock);

        const cPos = courseToWorldUnits(s + 20, side * 19, 0, undefined, course.id);
        const cactus = new THREE.Group();
        cactus.position.copy(cPos);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 2.2, 8), cactusMat);
        stem.position.y = 1.1;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.16, 0.16), cactusMat);
        arm.position.set(0, 1.4, 0);
        cactus.add(stem, arm);
        raceEnv.add(cactus);
      });
    }
  } else if (theme.sceneryType === 'urban_alleys') {
    const facadeGeo = new THREE.BoxGeometry(4.2, 7.5, 1.8);
    const colors = ['#e2e8f0', '#fed7aa', '#fbcfe8', '#cbd5e1'];

    for (let s = 35; s <= sMax; s += 36) {
      [-1, 1].forEach((side, idx) => {
        const lat = side * 18.5;
        const pos = courseToWorldUnits(s, lat, 0, undefined, course.id);
        const facadeMat = makeSoapboxMat(colors[(Math.floor(s / 36) + idx) % colors.length], 0.6);
        const facade = new THREE.Mesh(facadeGeo, facadeMat);
        facade.position.copy(pos);
        facade.position.y += 3.75;
        const road = getSoapboxRoadState(s, course.id);
        facade.rotation.y = -road.headingRad;
        raceEnv.add(facade);
      });
    }
  } else if (theme.sceneryType === 'snow_peaks') {
    const cragGeo = new THREE.ConeGeometry(2.2, 5.5, 4);
    const cragMat = makeSoapboxMat('#e0f2fe', 0.4, 0.2);
    const snowPineMat = makeSoapboxMat('#f8fafc', 0.7);

    for (let s = 30; s <= sMax; s += 45) {
      [-1, 1].forEach((side) => {
        const lat = side * (24 + ((s * 3) % 8));
        const pos = courseToWorldUnits(s, lat, 0, undefined, course.id);
        const crag = new THREE.Mesh(cragGeo, cragMat);
        crag.position.copy(pos);
        crag.position.y += 2.75;
        crag.rotation.y = s * 0.1;
        raceEnv.add(crag);

        const pinePos = courseToWorldUnits(s + 22, side * 18, 0, undefined, course.id);
        const pine = new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.8, 8), snowPineMat);
        pine.position.copy(pinePos);
        pine.position.y += 1.4;
        raceEnv.add(pine);
      });
    }
  }
}

export const SoapboxCanvas3D: React.FC<SoapboxCanvas3DProps> = React.memo(({
  mode,
  courseId = 'alpine_panorama',
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
  const courseIdRef = useRef<SoapboxCourseId>(courseId);
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
  courseIdRef.current = courseId;
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
  const raceEnvRef = useRef<THREE.Group | null>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const debrisMeshesBySlotRef = useRef<Record<SoapboxDetachablePartSlot, THREE.Object3D> | null>(null);
  const obstacleMeshesRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const startGatePivotRef = useRef<THREE.Group | null>(null);
  const gantryLightMatsRef = useRef<THREE.MeshBasicMaterial[]>([]);

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

  // Rebuild 3D car when loadout changes
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

    // Also update debris meshes pool
    if (raceEnvRef.current) {
      if (debrisMeshesBySlotRef.current) {
        Object.values(debrisMeshesBySlotRef.current).forEach((m) => {
          raceEnvRef.current?.remove(m);
        });
      }
      const newDebris = buildSoapboxDebrisMeshes(loadout, built.wheelRadiusMeters);
      debrisMeshesBySlotRef.current = newDebris;
      Object.values(newDebris).forEach((m) => {
        m.visible = false;
        raceEnvRef.current?.add(m);
      });
    }
  }, [loadout]);

  useEffect(() => {
    if (mode === 'race') {
      finishNotifiedRef.current = false;
      hoveredCategoryRef.current = null;
      raceCamSnappedRef.current = false;
    }
  }, [mode]);

  // Rebuild course race environment when courseId changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const course = getSoapboxCourse(courseId);
    const theme = course.visualTheme;

    scene.background = new THREE.Color(theme.skyColor);
    scene.fog = new THREE.FogExp2(theme.fogColor, theme.fogDensity);

    if (hemiLightRef.current) {
      hemiLightRef.current.color.set(theme.hemiSkyColor);
      hemiLightRef.current.groundColor.set(theme.hemiGroundColor);
    }
    if (sunLightRef.current) {
      sunLightRef.current.color.set(theme.sunColor);
      sunLightRef.current.position.set(theme.sunPosition[0], theme.sunPosition[1], theme.sunPosition[2]);
    }

    if (raceEnvRef.current) {
      scene.remove(raceEnvRef.current);
      disposeSoapboxObject3D(raceEnvRef.current, true);
      raceEnvRef.current = null;
    }

    const raceEnv = new THREE.Group();
    scene.add(raceEnv);
    raceEnvRef.current = raceEnv;

    // Road ribbon
    const roadRibbon = buildCourseRoadRibbon(course);
    raceEnv.add(roadRibbon);

    // Hilltop Start Pavilion at s = -course.startRampFeet + 4
    const startRoad = getSoapboxRoadState(-course.startRampFeet + 4, course.id);
    const pavilionGroup = new THREE.Group();
    pavilionGroup.position.set(
      startRoad.xFeet * UNITS_PER_FOOT,
      startRoad.yFeet * UNITS_PER_FOOT,
      startRoad.zFeet * UNITS_PER_FOOT
    );
    pavilionGroup.rotation.z = -startRoad.slopeRad;

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
    gantryLightMatsRef.current = gantryLightMats;

    const startGatePivot = new THREE.Group();
    startGatePivot.position.set(2.2, 0.05, 0);
    const gatePlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.85, 5.4),
      makeSoapboxMat('#facc15', 0.3, 0.6)
    );
    gatePlate.position.y = 0.42;
    startGatePivot.add(gatePlate);
    pavilionGroup.add(startGatePivot);
    startGatePivotRef.current = startGatePivot;

    raceEnv.add(pavilionGroup);

    // Finish Arch at s = course.lengthFeet
    const finishRoad = getSoapboxRoadState(course.lengthFeet, course.id);
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

    // Obstacles
    const obstacleMeshes = new Map<string, THREE.Object3D>();
    const courseObstacles = course.generateObstacles();

    courseObstacles.forEach((obs) => {
      const r = getSoapboxRoadState(obs.sFeet, course.id);
      const pos = courseToWorldUnits(obs.sFeet, obs.lateralCenterFeet, 0, undefined, course.id);
      const node = new THREE.Group();
      node.position.copy(pos);
      node.rotation.y = -r.headingRad;
      node.rotation.z = -r.slopeRad;

      if (obs.type === 'hay_bale') {
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
          bubble.position.set((b - 2.5) * 0.35, 0.09, Math.sin(b * 1.7) * 0.45);
          node.add(bubble);
        }
      } else if (obs.type === 'kicker_jump') {
        const rampGeo = new THREE.BoxGeometry(
          obs.lengthFeet * UNITS_PER_FOOT,
          0.55,
          obs.halfWidthFeet * 2 * UNITS_PER_FOOT
        );
        const ramp = new THREE.Mesh(rampGeo, makeSoapboxMat('#f97316', 0.45));
        ramp.position.set(0, 0.18, 0);
        ramp.rotation.z = 0.2;
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(obs.lengthFeet * UNITS_PER_FOOT * 0.85, 0.58, 0.4),
          makeSoapboxMat('#facc15', 0.3)
        );
        stripe.position.set(0, 0.19, 0);
        stripe.rotation.z = 0.2;
        node.add(ramp, stripe);
      } else if (obs.type === 'speed_gate') {
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
    obstacleMeshesRef.current = obstacleMeshes;

    // Themed scenery
    buildThemedScenery(raceEnv, course);

    // Debris meshes
    const wheelRadius = craftGroupsRef.current?.wheelRadiusMeters ?? 0.26;
    const debrisMeshes = buildSoapboxDebrisMeshes(loadout, wheelRadius);
    debrisMeshesBySlotRef.current = debrisMeshes;
    Object.values(debrisMeshes).forEach((m) => {
      m.visible = false;
      raceEnv.add(m);
    });
  }, [courseId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const initialCourse = getSoapboxCourse(courseIdRef.current);
    const theme = initialCourse.visualTheme;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(theme.skyColor);
    scene.fog = new THREE.FogExp2(theme.fogColor, theme.fogDensity);
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
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    container.appendChild(renderer.domElement);

    const hemiLight = new THREE.HemisphereLight(theme.hemiSkyColor, theme.hemiGroundColor, 0.72);
    scene.add(hemiLight);
    hemiLightRef.current = hemiLight;

    const sunLight = new THREE.DirectionalLight(theme.sunColor, 1.45);
    sunLight.position.set(theme.sunPosition[0], theme.sunPosition[1], theme.sunPosition[2]);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 320;
    const shadowD = 9.0;
    sunLight.shadow.camera.left = -shadowD;
    sunLight.shadow.camera.right = shadowD;
    sunLight.shadow.camera.top = shadowD;
    sunLight.shadow.camera.bottom = -shadowD;
    scene.add(sunLight);
    scene.add(sunLight.target);
    sunLightRef.current = sunLight;

    // Garage Pit Turntable Platform
    const garageEnv = new THREE.Group();
    scene.add(garageEnv);

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

    // Initial 3D Soapbox Build
    const initialBuilt = buildSoapbox3D(loadout);
    scene.add(initialBuilt.root);
    craftGroupsRef.current = initialBuilt;

    // Pointer orbit & socket clicks
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
        orbitYawRef.current -= dx * 0.007;
        orbitPitchRef.current = Math.max(
          -0.12,
          Math.min(1.22, orbitPitchRef.current + dy * 0.006)
        );
        lastPointerX = e.clientX;
        lastPointerY = e.clientY;
      } else {
        const cat = pickSocketCategory(e.clientX, e.clientY);
        hoveredCategoryRef.current = cat;
        renderer.domElement.style.cursor = cat ? 'pointer' : 'default';
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (modeRef.current !== 'garage') return;
      isDraggingOrbit = false;
      const dist = Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY);
      if (dist < 6) {
        const clickedCat = pickSocketCategory(e.clientX, e.clientY);
        if (clickedCat && onSelectCategoryRef.current) {
          soundEngine.playSnapPop();
          onSelectCategoryRef.current(clickedCat);
        }
      }
    };

    const handlePointerCancel = () => {
      isDraggingOrbit = false;
    };

    const handleWheel = (e: WheelEvent) => {
      if (modeRef.current !== 'garage') return;
      orbitRadiusRef.current = Math.max(
        3.4,
        Math.min(9.8, orbitRadiusRef.current + e.deltaY * 0.004)
      );
    };

    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };

    const domElem = renderer.domElement;
    domElem.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    window.addEventListener('blur', handlePointerCancel);
    domElem.addEventListener('wheel', handleWheel, { passive: true });
    window.addEventListener('resize', handleResize);

    // ==========================================================================
    // ANIMATION & PHYSICS INTEGRATION LOOP (120Hz sub-stepped)
    // ==========================================================================
    let lastTime = performance.now();
    let physicsAccumulator = 0;
    const FIXED_DT = 1 / 120;
    let rafId = 0;

    const tempCarWorldPos = new THREE.Vector3();
    const tempDesiredCamPos = new THREE.Vector3();
    const tempCamLookPos = new THREE.Vector3();

    const animate = (now: number) => {
      rafId = window.requestAnimationFrame(animate);

      const rawDt = Math.min(0.08, (now - lastTime) / 1000);
      lastTime = now;
      const tSec = now * 0.001;

      const currentMode = modeRef.current;
      const activeCourseId = courseIdRef.current;
      const craft = craftGroupsRef.current;

      if (garageEnv) garageEnv.visible = currentMode === 'garage';
      if (raceEnvRef.current) raceEnvRef.current.visible = currentMode === 'race';

      if (currentMode === 'garage') {
        const preset = CATEGORY_CAMERA_PRESETS[selectedCategoryRef.current];
        const targetYaw = preset ? preset.yaw : orbitYawRef.current;
        const targetPitch = preset ? preset.pitch : orbitPitchRef.current;
        const targetRadius = preset ? preset.radius : orbitRadiusRef.current;

        orbitYawRef.current += (targetYaw - orbitYawRef.current) * Math.min(1, rawDt * 6);
        orbitPitchRef.current += (targetPitch - orbitPitchRef.current) * Math.min(1, rawDt * 6);
        orbitRadiusRef.current += (targetRadius - orbitRadiusRef.current) * Math.min(1, rawDt * 6);

        const cy = Math.cos(orbitYawRef.current);
        const sy = Math.sin(orbitYawRef.current);
        const cp = Math.cos(orbitPitchRef.current);
        const sp = Math.sin(orbitPitchRef.current);
        const r = orbitRadiusRef.current;

        camera.position.set(r * cp * sy, r * sp + 0.15, r * cp * cy);
        camera.lookAt(0, 0.05, 0);

        if (craft) {
          craft.root.position.set(0, 0, 0);
          craft.root.rotation.set(0, 0, 0);
          craft.sprungGroup.position.set(0, 0, 0);
          craft.sprungGroup.rotation.set(0, 0, 0);
          craft.unsprungGroup.position.set(0, 0, 0);
          craft.crewGroup.visible = false;

          // Ensure all parts visible in garage
          if (craft.wheelCornerNodes) {
            craft.wheelCornerNodes.wheel_fl.visible = true;
            craft.wheelCornerNodes.wheel_fr.visible = true;
            craft.wheelCornerNodes.wheel_rl.visible = true;
            craft.wheelCornerNodes.wheel_rr.visible = true;
          }
          if (craft.bumperNode) craft.bumperNode.visible = true;
          if (craft.topperNode) craft.topperNode.visible = true;

          // Shaker rig dynamics
          if (shakerRigRef.current) {
            const m = metricsRef.current;
            const rollAmp = THREE.MathUtils.degToRad(
              (1 / Math.max(0.65, m.staticStabilityFactor)) * 6.2
            );
            const pitchAmp = 0.045;
            const rollAngle = Math.sin(tSec * 4.2) * rollAmp;
            const pitchAngle = Math.cos(tSec * 3.4) * pitchAmp;
            craft.sprungGroup.rotation.z = -pitchAngle;
            craft.sprungGroup.rotation.x = rollAngle;
            craft.sprungGroup.position.y = Math.sin(tSec * 8.5) * 0.035;

            padMeshes.forEach((pad, idx) => {
              pad.position.y = -0.6 + Math.sin(tSec * 8.5 + idx * 1.5) * 0.04;
            });
          } else {
            padMeshes.forEach((pad) => {
              pad.position.y = -0.6;
            });
          }

          if (snapBounceRef.current > 0) {
            snapBounceRef.current = Math.max(0, snapBounceRef.current - rawDt * 4);
            const scale = 1 + Math.sin(snapBounceRef.current * Math.PI) * 0.045;
            craft.root.scale.set(scale, scale, scale);
          } else {
            craft.root.scale.set(1, 1, 1);
          }

          // Socket halos
          const activeCat = selectedCategoryRef.current;
          const hoveredCat = hoveredCategoryRef.current;
          for (const [catKey, ringMesh] of Object.entries(craft.socketMarkers)) {
            const isSelected = catKey === activeCat;
            const isHovered = catKey === hoveredCat;
            ringMesh.visible = true;
            const baseScale = isSelected ? 1.25 : isHovered ? 1.15 : 1.0;
            const pulse = isSelected ? 1 + Math.sin(tSec * 7) * 0.08 : 1.0;
            const finalScale = baseScale * pulse;
            ringMesh.scale.set(finalScale, finalScale, finalScale);
          }
        }
      } else {
        // ======================================================================
        // RACE MODE
        // ======================================================================
        const sim = simStateRef.current;

        if (craft) {
          for (const ringMesh of Object.values(craft.socketMarkers)) {
            ringMesh.visible = false;
          }
        }

        physicsAccumulator += rawDt;
        let lastEvents = null;
        let stepsRun = 0;
        while (physicsAccumulator >= FIXED_DT && stepsRun < 4) {
          lastEvents = stepSoapboxSimulation(
            sim,
            metricsRef.current,
            FIXED_DT,
            bestDistRef.current,
            bestTimeRef.current
          );
          physicsAccumulator -= FIXED_DT;
          stepsRun++;

          if (lastEvents.finishedRun && !finishNotifiedRef.current) {
            finishNotifiedRef.current = true;
            onRunFinishedRef.current?.(sim);
          }
        }
        if (physicsAccumulator >= FIXED_DT) {
          physicsAccumulator = 0;
        }

        onHudSyncRef.current?.({ ...sim });

        // Update Start Gate Rotation & Gantry Lights
        if (startGatePivotRef.current) {
          startGatePivotRef.current.rotation.x = -sim.gateOpenProgress * (Math.PI / 2);
        }
        if (gantryLightMatsRef.current.length > 0) {
          const litCount =
            sim.phase === 'skit'
              ? Math.min(5, Math.floor((sim.phaseTime / 3.4) * 5) + 1)
              : 5;
          const greenColor = sim.phase === 'start_ramp' || sim.phase === 'racing';
          gantryLightMatsRef.current.forEach((mat, idx) => {
            if (greenColor) {
              mat.color.set('#22c55e');
            } else if (idx < litCount) {
              mat.color.set('#ef4444');
            } else {
              mat.color.set('#334155');
            }
          });
        }

        // Update Obstacle Meshes Visibility
        obstacleMeshesRef.current.forEach((mesh, id) => {
          const oState = sim.obstacles.find((o) => o.id === id);
          mesh.visible = !(oState && oState.triggered);
        });

        // 3D Soapbox Position & Orientation
        const road = getSoapboxRoadState(sim.sFeet, activeCourseId);
        courseToWorldUnits(
          sim.sFeet,
          sim.lateralOffsetFeet,
          sim.airborneHeightFeet,
          tempCarWorldPos,
          activeCourseId
        );

        if (craft) {
          craft.root.position.copy(tempCarWorldPos);

          const headingYaw = -road.headingRad;
          const slopePitch = -road.slopeRad;
          const driftYaw = -THREE.MathUtils.degToRad(sim.driftAngleDeg);
          const bodyRollRad = THREE.MathUtils.degToRad(sim.rollDeg);

          craft.root.rotation.set(0, 0, 0);
          craft.root.rotateY(headingYaw);
          craft.root.rotateZ(slopePitch);
          craft.root.rotateY(driftYaw);

          craft.sprungGroup.rotation.x = bodyRollRad;
          craft.sprungGroup.position.y = -sim.suspensionCompression * 0.08;

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

          // Push-Crew Joggers on Starter Chute
          craft.crewGroup.visible = sim.phase === 'skit' || sim.phase === 'start_ramp';
          if (craft.crewGroup.visible) {
            craft.crewGroup.children.forEach((runner, idx) => {
              runner.position.y =
                -0.28 + Math.abs(Math.sin(tSec * 14 + idx * 1.4)) * 0.14;
            });
          }

          // Zero-allocation visibility toggling of detached corner wheels
          if (craft.wheelCornerNodes) {
            craft.wheelCornerNodes.wheel_fl.visible = sim.attachedParts.wheel_fl;
            craft.wheelCornerNodes.wheel_fr.visible = sim.attachedParts.wheel_fr;
            craft.wheelCornerNodes.wheel_rl.visible = sim.attachedParts.wheel_rl;
            craft.wheelCornerNodes.wheel_rr.visible = sim.attachedParts.wheel_rr;
          }
          if (craft.bumperNode) {
            craft.bumperNode.visible = sim.attachedParts.bumper;
          }
          if (craft.topperNode) {
            craft.topperNode.visible = sim.attachedParts.topper;
          } else if (craft.topperGroup) {
            craft.topperGroup.visible = sim.attachedParts.topper;
          }

          // Authentic Tumbling Debris Meshes
          if (debrisMeshesBySlotRef.current) {
            Object.values(debrisMeshesBySlotRef.current).forEach((m) => {
              m.visible = false;
            });

            sim.debris.forEach((d) => {
              const mesh = debrisMeshesBySlotRef.current?.[d.slot];
              if (!mesh) return;
              mesh.visible = true;
              courseToWorldUnits(d.sFeet, d.lateralFeet, d.heightFeet, mesh.position, activeCourseId);
              mesh.rotation.set(d.rotation.x, d.rotation.y, d.rotation.z);
            });
          }
        }

        // Dynamic Follow Chase Camera
        const camBackFeet = sim.phase === 'skit' ? 22 : 25;
        const camUpFeet = sim.phase === 'skit' ? 11 : 11.5;
        courseToWorldUnits(
          sim.sFeet - camBackFeet,
          sim.lateralOffsetFeet * 0.55,
          camUpFeet,
          tempDesiredCamPos,
          activeCourseId
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
          tempCamLookPos,
          activeCourseId
        );
        camera.lookAt(tempCamLookPos);

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
