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

  // Use monotonic longitudinal cross-sections (wx = road.xFeet, wz = road.zFeet + lateralFeet)
  // so wide hillside banks, curbs, and roadside props never fold over or cross into the road on turns.
  const wx = road.xFeet * UNITS_PER_FOOT;
  const wy = (road.yFeet + heightOffsetFeet) * UNITS_PER_FOOT;
  const wz = (road.zFeet + lateralFeet) * UNITS_PER_FOOT;

  if (outVec) {
    return outVec.set(wx, wy, wz);
  }
  return new THREE.Vector3(wx, wy, wz);
}

/**
 * Computes the exact vertical terrain offset (in feet relative to road.yFeet) at any (sFeet, lateralFeet)
 * matching the hillside cross-section columns and longitudinal hill waves so roadside props never float.
 */
function getTerrainHeightOffsetFeet(sFeet: number, lateralFeet: number): number {
  const halfW = ROAD_HALF_WIDTH_FEET;
  const curbW = 2.4;
  const innerSkirtW = 34.0;
  const midHillW = 110.0;
  const outerValleyW = 280.0;

  const hillWaveL = Math.sin(sFeet * 0.018 + 0.7) * 9.0 + Math.cos(sFeet * 0.043) * 4.5;
  const hillWaveR = Math.cos(sFeet * 0.016 - 0.4) * 9.5 + Math.sin(sFeet * 0.039) * 4.5;

  const absLat = Math.abs(lateralFeet);
  const wave = lateralFeet < 0 ? hillWaveL : hillWaveR;

  const latShoulder = halfW + curbW; // 15.9 ft
  const latInner = halfW + curbW + innerSkirtW; // 49.9 ft
  const latMid = halfW + curbW + midHillW; // 125.9 ft
  const latOuter = halfW + curbW + outerValleyW; // 295.9 ft

  const yShoulder = -0.08;
  const yInner = -2.4 + wave * 0.18;
  const yMid = 14.0 + wave;
  const yOuter = -18.0;

  if (absLat <= latShoulder) {
    return yShoulder;
  }
  if (absLat <= latInner) {
    const t = (absLat - latShoulder) / (latInner - latShoulder);
    return yShoulder + t * (yInner - yShoulder);
  }
  if (absLat <= latMid) {
    const t = (absLat - latInner) / (latMid - latInner);
    return yInner + t * (yMid - yInner);
  }
  const t = Math.min(1, (absLat - latMid) / (latOuter - latMid));
  return yMid + t * (yOuter - yMid);
}

/**
 * Builds a continuous 3D road ribbon mesh with isolated hillside terrain banks,
 * crisp 3D raised red/white racing curbs (with zero vertex-color bleeding),
 * white shoulder lines, yellow centerline dashes, and starter shove-zone markings.
 */
function buildCourseRoadRibbon(course: SoapboxCourseDef): THREE.Group {
  const group = new THREE.Group();
  const sMin = -course.startRampFeet - 18;
  const sMax = course.lengthFeet + 130;
  const steps = Math.round((sMax - sMin) * 0.42);
  const halfW = ROAD_HALF_WIDTH_FEET;
  const curbW = 2.4;
  const innerSkirtW = 34.0;
  const midHillW = 110.0;
  const outerValleyW = 280.0;

  const theme = course.visualTheme;
  const cSkirt = new THREE.Color(theme.grassColor);
  const cSkirtMid = new THREE.Color(theme.grassColor).lerp(new THREE.Color(theme.grassAltColor), 0.48);
  const cSkirtAlt = new THREE.Color(theme.grassAltColor);
  const cHillHigh = new THREE.Color(theme.grassAltColor).lerp(new THREE.Color('#0f172a'), 0.18);
  const cCurbPrimary = new THREE.Color(theme.curbColorPrimary);
  const cCurbSecondary = new THREE.Color(theme.curbColorSecondary);
  const cAsphalt = new THREE.Color(theme.asphaltColor);
  const cCobble = new THREE.Color(theme.cobbleColor);

  // 1. Wide Hillside & Valley Terrain Ribbon (dips cleanly beneath the roadbed so grass colors never bleed into curbs or asphalt)
  const terrainCols = [
    { lat: -(halfW + curbW + outerValleyW), yDrop: -18.0 },
    { lat: -(halfW + curbW + midHillW), yDrop: 14.0 },
    { lat: -(halfW + curbW + innerSkirtW), yDrop: -2.4 },
    { lat: -(halfW + curbW), yDrop: -0.08 },
    { lat: -halfW, yDrop: -0.25 },
    { lat: halfW, yDrop: -0.25 },
    { lat: halfW + curbW, yDrop: -0.08 },
    { lat: halfW + curbW + innerSkirtW, yDrop: -2.4 },
    { lat: halfW + curbW + midHillW, yDrop: 14.0 },
    { lat: halfW + curbW + outerValleyW, yDrop: -18.0 },
  ];
  const numTerrainCols = terrainCols.length;
  const terrainPositions: number[] = [];
  const terrainColors: number[] = [];
  const terrainIndices: number[] = [];

  // 2. Crisp Asphalt / Cobblestone Roadbed Surface Ribbon (isolated from curb & grass vertices)
  const roadCols = [-halfW, -halfW * 0.35, halfW * 0.35, halfW];
  const numRoadCols = roadCols.length;
  const roadPositions: number[] = [];
  const roadColors: number[] = [];
  const roadIndices: number[] = [];

  // 3. Crisp Raised 3D Red/White Racing Curbs (non-shared quad vertices per segment so red/white never smears!)
  const curbPositions: number[] = [];
  const curbColors: number[] = [];
  const curbIndices: number[] = [];
  let curbVertexCount = 0;

  const pushCurbQuad = (
    x0: number, y0: number, z0: number,
    x1: number, y1: number, z1: number,
    x2: number, y2: number, z2: number,
    x3: number, y3: number, z3: number,
    col: THREE.Color
  ) => {
    curbPositions.push(
      x0, y0, z0,
      x1, y1, z1,
      x2, y2, z2,
      x3, y3, z3
    );
    for (let k = 0; k < 4; k++) {
      curbColors.push(col.r, col.g, col.b);
    }
    // Winding order (+Z) x (+X) = +Y skyward normals
    curbIndices.push(
      curbVertexCount, curbVertexCount + 1, curbVertexCount + 2,
      curbVertexCount + 1, curbVertexCount + 3, curbVertexCount + 2
    );
    curbVertexCount += 4;
  };

  const roadSamples = new Array<ReturnType<typeof getSoapboxRoadState>>(steps + 1);
  for (let i = 0; i <= steps; i++) {
    const s = sMin + (i / steps) * (sMax - sMin);
    roadSamples[i] = getSoapboxRoadState(s, course.id);
  }

  for (let i = 0; i <= steps; i++) {
    const s = sMin + (i / steps) * (sMax - sMin);
    const road = roadSamples[i];

    const hillWaveL = Math.sin(s * 0.018 + 0.7) * 9.0 + Math.cos(s * 0.043) * 4.5;
    const hillWaveR = Math.cos(s * 0.016 - 0.4) * 9.5 + Math.sin(s * 0.039) * 4.5;

    for (let c = 0; c < numTerrainCols; c++) {
      const col = terrainCols[c];
      let yOffset = col.yDrop;
      if (c === 1) yOffset += hillWaveL;
      else if (c === 8) yOffset += hillWaveR;
      else if (c === 2) yOffset += hillWaveL * 0.18;
      else if (c === 7) yOffset += hillWaveR * 0.18;

      const wx = road.xFeet * UNITS_PER_FOOT;
      const wy = (road.yFeet + yOffset) * UNITS_PER_FOOT;
      const wz = (road.zFeet + col.lat) * UNITS_PER_FOOT;
      terrainPositions.push(wx, wy, wz);

      let vColor = cSkirt;
      if (c === 0 || c === 9) {
        vColor = cHillHigh;
      } else if (c === 1 || c === 8) {
        vColor = cSkirtAlt;
      } else if (c === 2 || c === 7) {
        vColor = cSkirtMid;
      }
      terrainColors.push(vColor.r, vColor.g, vColor.b);
    }

    for (let c = 0; c < numRoadCols; c++) {
      const lat = roadCols[c];
      const wx = road.xFeet * UNITS_PER_FOOT;
      const wy = (road.yFeet + 0.02) * UNITS_PER_FOOT;
      const wz = (road.zFeet + lat) * UNITS_PER_FOOT;
      roadPositions.push(wx, wy, wz);

      const rColor = road.surface === 'cobblestone' ? cCobble : cAsphalt;
      roadColors.push(rColor.r, rColor.g, rColor.b);
    }

    if (i < steps) {
      const tRowA = i * numTerrainCols;
      const tRowB = (i + 1) * numTerrainCols;
      for (let c = 0; c < numTerrainCols - 1; c++) {
        // Winding order (+Z) x (+X) = +Y skyward normals
        terrainIndices.push(tRowA + c, tRowA + c + 1, tRowB + c);
        terrainIndices.push(tRowA + c + 1, tRowB + c + 1, tRowB + c);
      }

      const rRowA = i * numRoadCols;
      const rRowB = (i + 1) * numRoadCols;
      for (let c = 0; c < numRoadCols - 1; c++) {
        // Winding order (+Z) x (+X) = +Y skyward normals
        roadIndices.push(rRowA + c, rRowA + c + 1, rRowB + c);
        roadIndices.push(rRowA + c + 1, rRowB + c + 1, rRowB + c);
      }

      const roadNext = roadSamples[i + 1];
      const isPrimaryCurb = Math.floor((s + 100) / 8) % 2 === 0;
      const curbCol = isPrimaryCurb ? cCurbPrimary : cCurbSecondary;

      const xA = road.xFeet * UNITS_PER_FOOT;
      const xB = roadNext.xFeet * UNITS_PER_FOOT;
      const yRoadA = (road.yFeet + 0.02) * UNITS_PER_FOOT;
      const yRoadB = (roadNext.yFeet + 0.02) * UNITS_PER_FOOT;
      const yTopA = (road.yFeet + 0.34) * UNITS_PER_FOOT;
      const yTopB = (roadNext.yFeet + 0.34) * UNITS_PER_FOOT;
      const yOutA = (road.yFeet - 0.06) * UNITS_PER_FOOT;
      const yOutB = (roadNext.yFeet - 0.06) * UNITS_PER_FOOT;

      // Left curb (-halfW - curbW .. -halfW)
      const zLOutA = (road.zFeet - (halfW + curbW)) * UNITS_PER_FOOT;
      const zLInA = (road.zFeet - halfW) * UNITS_PER_FOOT;
      const zLOutB = (roadNext.zFeet - (halfW + curbW)) * UNITS_PER_FOOT;
      const zLInB = (roadNext.zFeet - halfW) * UNITS_PER_FOOT;
      pushCurbQuad(
        xA, yOutA, zLOutA,
        xA, yTopA, zLOutA * 0.35 + zLInA * 0.65,
        xB, yOutB, zLOutB,
        xB, yTopB, zLOutB * 0.35 + zLInB * 0.65,
        curbCol
      );
      pushCurbQuad(
        xA, yTopA, zLOutA * 0.35 + zLInA * 0.65,
        xA, yRoadA, zLInA,
        xB, yTopB, zLOutB * 0.35 + zLInB * 0.65,
        xB, yRoadB, zLInB,
        curbCol
      );

      // Right curb (+halfW .. +halfW + curbW)
      const zRInA = (road.zFeet + halfW) * UNITS_PER_FOOT;
      const zROutA = (road.zFeet + halfW + curbW) * UNITS_PER_FOOT;
      const zRInB = (roadNext.zFeet + halfW) * UNITS_PER_FOOT;
      const zROutB = (roadNext.zFeet + halfW + curbW) * UNITS_PER_FOOT;
      pushCurbQuad(
        xA, yRoadA, zRInA,
        xA, yTopA, zROutA * 0.35 + zRInA * 0.65,
        xB, yRoadB, zRInB,
        xB, yTopB, zROutB * 0.35 + zRInB * 0.65,
        curbCol
      );
      pushCurbQuad(
        xA, yTopA, zROutA * 0.35 + zRInA * 0.65,
        xA, yOutA, zROutA,
        xB, yTopB, zROutB * 0.35 + zRInB * 0.65,
        xB, yOutB, zROutB,
        curbCol
      );
    }
  }

  const terrainGeo = new THREE.BufferGeometry();
  terrainGeo.setAttribute('position', new THREE.Float32BufferAttribute(terrainPositions, 3));
  terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(terrainColors, 3));
  terrainGeo.setIndex(terrainIndices);
  terrainGeo.computeVertexNormals();
  const terrainMesh = new THREE.Mesh(
    terrainGeo,
    new THREE.MeshLambertMaterial({
      vertexColors: true,
    })
  );
  terrainMesh.receiveShadow = false;
  group.add(terrainMesh);

  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPositions, 3));
  roadGeo.setAttribute('color', new THREE.Float32BufferAttribute(roadColors, 3));
  roadGeo.setIndex(roadIndices);
  roadGeo.computeVertexNormals();
  const roadMesh = new THREE.Mesh(
    roadGeo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.72,
      metalness: 0.08,
    })
  );
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  const curbGeo = new THREE.BufferGeometry();
  curbGeo.setAttribute('position', new THREE.Float32BufferAttribute(curbPositions, 3));
  curbGeo.setAttribute('color', new THREE.Float32BufferAttribute(curbColors, 3));
  curbGeo.setIndex(curbIndices);
  curbGeo.computeVertexNormals();
  const curbMesh = new THREE.Mesh(
    curbGeo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.45,
      metalness: 0.08,
    })
  );
  curbMesh.receiveShadow = true;
  group.add(curbMesh);

  // Deep valley base plane beneath the entire course so sky never shows through from below
  const valleyFloor = new THREE.Mesh(
    new THREE.PlaneGeometry((course.lengthFeet + 1400) * UNITS_PER_FOOT, 920),
    new THREE.MeshLambertMaterial({ color: theme.grassAltColor })
  );
  valleyFloor.rotation.x = -Math.PI / 2;
  valleyFloor.position.set((course.lengthFeet * 0.5) * UNITS_PER_FOOT, -18, 0);
  valleyFloor.receiveShadow = false;
  group.add(valleyFloor);

  // Dashed yellow centerline & crisp white shoulder stripes along the course (InstancedMesh)
  const dashGeo = new THREE.BoxGeometry(1.15, 0.026, 0.13);
  const dashMat = makeSoapboxMat('#facc15', 0.35);
  const edgeStripeGeo = new THREE.BoxGeometry(2.2, 0.024, 0.09);
  const edgeStripeMat = makeSoapboxMat('#f8fafc', 0.4);
  const courseObsForDashes = course.generateObstacles();

  const dashMatrices: THREE.Matrix4[] = [];
  const edgeMatrices: THREE.Matrix4[] = [];
  const tempStripeObj = new THREE.Object3D();

  for (let s = 10; s < course.lengthFeet - 8; s += 20) {
    const r = getSoapboxRoadState(s, course.id);
    const overlapsCenterObstacle = courseObsForDashes.some(
      (o) =>
        (o.type === 'water_slick' ||
          o.type === 'kicker_jump' ||
          o.type === 'cobble_strip' ||
          o.type === 'speed_gate') &&
        Math.abs(s - o.sFeet) <= o.lengthFeet * 0.6 + 6 &&
        Math.abs(o.lateralCenterFeet) <= o.halfWidthFeet + 2.5
    );

    if (!overlapsCenterObstacle) {
      tempStripeObj.position.set(
        r.xFeet * UNITS_PER_FOOT,
        r.yFeet * UNITS_PER_FOOT + 0.022,
        r.zFeet * UNITS_PER_FOOT
      );
      tempStripeObj.rotation.set(0, -r.headingRad, -r.slopeRad);
      tempStripeObj.updateMatrix();
      dashMatrices.push(tempStripeObj.matrix.clone());
    }

    [-12.2, 12.2].forEach((latEdge) => {
      const ePos = courseToWorldUnits(s, latEdge, 0.06, undefined, course.id);
      tempStripeObj.position.copy(ePos);
      tempStripeObj.rotation.set(0, -r.headingRad, -r.slopeRad);
      tempStripeObj.updateMatrix();
      edgeMatrices.push(tempStripeObj.matrix.clone());
    });
  }

  if (dashMatrices.length > 0) {
    const dashInst = new THREE.InstancedMesh(dashGeo, dashMat, dashMatrices.length);
    for (let i = 0; i < dashMatrices.length; i++) dashInst.setMatrixAt(i, dashMatrices[i]);
    dashInst.instanceMatrix.needsUpdate = true;
    group.add(dashInst);
  }
  if (edgeMatrices.length > 0) {
    const edgeInst = new THREE.InstancedMesh(edgeStripeGeo, edgeStripeMat, edgeMatrices.length);
    for (let i = 0; i < edgeMatrices.length; i++) edgeInst.setMatrixAt(i, edgeMatrices[i]);
    edgeInst.instanceMatrix.needsUpdate = true;
    group.add(edgeInst);
  }

  // Glowing Green Push-Bar Shove Zone Chevron Carpet on Starter Chute (-14.0..0 ft), strictly inside the road shoulders
  const shoveBaseMat = new THREE.MeshStandardMaterial({
    color: '#059669',
    roughness: 0.55,
  });
  const shovePadMat = new THREE.MeshStandardMaterial({
    color: '#22c55e',
    emissive: '#16a34a',
    emissiveIntensity: 0.42,
    roughness: 0.28,
  });
  const rShoveMid = getSoapboxRoadState(-7.2, course.id);
  const shoveCarpet = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.018, 6.4), shoveBaseMat);
  shoveCarpet.position.set(
    rShoveMid.xFeet * UNITS_PER_FOOT,
    rShoveMid.yFeet * UNITS_PER_FOOT + 0.015,
    rShoveMid.zFeet * UNITS_PER_FOOT
  );
  shoveCarpet.rotation.y = -rShoveMid.headingRad;
  shoveCarpet.rotation.z = -rShoveMid.slopeRad;
  group.add(shoveCarpet);

  for (let s = -13; s <= -2; s += 3.5) {
    const r = getSoapboxRoadState(s, course.id);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.028, 5.8), shovePadMat);
    pad.position.set(
      r.xFeet * UNITS_PER_FOOT,
      r.yFeet * UNITS_PER_FOOT + 0.024,
      r.zFeet * UNITS_PER_FOOT
    );
    pad.rotation.y = -r.headingRad;
    pad.rotation.z = -r.slopeRad;
    group.add(pad);
  }

  // Crisp 3D Checkered Finish Line Strip at s = course.lengthFeet
  const rFin = getSoapboxRoadState(course.lengthFeet, course.id);
  const finStrip = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.026, 6.6),
    makeSoapboxMat('#facc15', 0.3)
  );
  finStrip.position.set(
    rFin.xFeet * UNITS_PER_FOOT,
    rFin.yFeet * UNITS_PER_FOOT + 0.02,
    rFin.zFeet * UNITS_PER_FOOT
  );
  finStrip.rotation.y = -rFin.headingRad;
  finStrip.rotation.z = -rFin.slopeRad;
  group.add(finStrip);

  return group;
}

/**
 * Builds distant mountains, sky clouds, roadside grandstands, distance arches,
 * corner guardrails, and biome props along the active course.
 */
function buildThemedScenery(raceEnv: THREE.Group, course: SoapboxCourseDef): void {
  const theme = course.visualTheme;
  const sMax = course.lengthFeet - 20;
  const tempObj = new THREE.Object3D();

  // 1. Fluffy 3D Sky Clouds drifting above the mountain valley (InstancedMesh)
  const cloudMat = makeSoapboxMat('#ffffff', 0.85, 0.02);
  const puffGeo = new THREE.SphereGeometry(2.6, 10, 10);
  const cloudCount = Math.max(24, Math.round(course.lengthFeet / 85));
  const puffOffsets = [
    [0, 0, 0, 1.35],
    [2.1, -0.3, 0.6, 1.0],
    [-2.0, -0.4, -0.5, 1.05],
    [0.8, 0.7, -0.4, 0.9],
  ] as const;
  const cloudInst = new THREE.InstancedMesh(puffGeo, cloudMat, cloudCount * puffOffsets.length);
  let puffIdx = 0;
  for (let i = 0; i < cloudCount; i++) {
    const sCloud = -60 + i * ((course.lengthFeet + 180) / Math.max(1, cloudCount - 1));
    const latCloud = (i % 2 === 0 ? 1 : -1) * (65 + ((i * 23) % 75));
    const roadAtCloud = getSoapboxRoadState(
      Math.max(0, Math.min(course.lengthFeet, sCloud)),
      course.id
    );
    const gx = sCloud * UNITS_PER_FOOT;
    const gy = roadAtCloud.yFeet * UNITS_PER_FOOT + 24 + (i % 4) * 4.5;
    const gz = (roadAtCloud.zFeet + latCloud) * UNITS_PER_FOOT;

    for (let p = 0; p < puffOffsets.length; p++) {
      const [cx, cy, cz, sc] = puffOffsets[p];
      tempObj.position.set(gx + cx, gy + cy, gz + cz);
      tempObj.rotation.set(0, 0, 0);
      tempObj.scale.set(sc * 1.4, sc * 0.72, sc);
      tempObj.updateMatrix();
      cloudInst.setMatrixAt(puffIdx++, tempObj.matrix);
    }
  }
  cloudInst.instanceMatrix.needsUpdate = true;
  raceEnv.add(cloudInst);

  // 2. Distant Horizon Mountain Peaks framing the valley (InstancedMesh)
  const peakColor =
    theme.sceneryType === 'desert_canyon'
      ? '#9a3412'
      : theme.sceneryType === 'urban_alleys'
      ? '#334155'
      : '#1e293b';
  const snowCapColor =
    theme.sceneryType === 'desert_canyon'
      ? '#fdba74'
      : theme.sceneryType === 'urban_alleys'
      ? '#64748b'
      : '#f8fafc';
  const peakMat = makeSoapboxMat(peakColor, 0.88, 0.05);
  const capMat = makeSoapboxMat(snowCapColor, 0.65, 0.08);
  const unitConeGeo = new THREE.ConeGeometry(1, 1, 7);
  const mtnBaseMatrices: THREE.Matrix4[] = [];
  const mtnCapMatrices: THREE.Matrix4[] = [];

  for (let s = -80; s <= course.lengthFeet + 160; s += 110) {
    [-1, 1].forEach((side, sIdx) => {
      const latDist = side * (165 + ((Math.abs(s) * 7 + sIdx * 31) % 65));
      const pos = courseToWorldUnits(
        Math.max(0, Math.min(course.lengthFeet, s)),
        latDist,
        -12,
        undefined,
        course.id
      );
      const h = 22 + ((Math.abs(s) * 13) % 18);
      const r = 14 + ((Math.abs(s) * 9) % 10);
      const mx = s * UNITS_PER_FOOT;

      tempObj.position.set(mx, pos.y + h * 0.5, pos.z);
      tempObj.rotation.set(0, 0, 0);
      tempObj.scale.set(r, h, r);
      tempObj.updateMatrix();
      mtnBaseMatrices.push(tempObj.matrix.clone());

      // Proud radius (r * 0.445 vs baseCone's r * 0.42 at y = 0.79h) prevents coplanar Z-fighting stripes
      tempObj.position.set(mx, pos.y + h * 0.795, pos.z);
      tempObj.scale.set(r * 0.445, h * 0.42, r * 0.445);
      tempObj.updateMatrix();
      mtnCapMatrices.push(tempObj.matrix.clone());
    });
  }
  if (mtnBaseMatrices.length > 0) {
    const baseInst = new THREE.InstancedMesh(unitConeGeo, peakMat, mtnBaseMatrices.length);
    const capInst = new THREE.InstancedMesh(unitConeGeo, capMat, mtnCapMatrices.length);
    for (let i = 0; i < mtnBaseMatrices.length; i++) {
      baseInst.setMatrixAt(i, mtnBaseMatrices[i]);
      capInst.setMatrixAt(i, mtnCapMatrices[i]);
    }
    baseInst.instanceMatrix.needsUpdate = true;
    capInst.instanceMatrix.needsUpdate = true;
    raceEnv.add(baseInst, capInst);
  }

  // 3. Roadside Spectator Grandstands & Red Bull Canopies at Key Action Zones
  const standLocations = [
    { s: -18, side: -1 },
    { s: -18, side: 1 },
    { s: Math.round(course.lengthFeet * 0.2), side: 1 },
    { s: Math.round(course.lengthFeet * 0.4), side: -1 },
    { s: Math.round(course.lengthFeet * 0.6), side: 1 },
    { s: Math.round(course.lengthFeet * 0.8), side: -1 },
    { s: course.lengthFeet - 28, side: -1 },
    { s: course.lengthFeet - 28, side: 1 },
  ];
  const standBaseMat = makeSoapboxMat('#1e293b', 0.6, 0.3);
  const standPlinthMat = makeSoapboxMat('#334155', 0.75, 0.15);
  const canopyMat = makeSoapboxMat('#dc2626', 0.35, 0.15);
  const crowdColors = ['#facc15', '#38bdf8', '#f43f5e', '#4ade80', '#a855f7', '#fb923c'];
  const fanGeo = new THREE.BoxGeometry(0.24, 0.46, 0.24);
  const fanBaseMat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.08 });
  const totalFans = standLocations.length * 3 * 9;
  const fanInst = new THREE.InstancedMesh(fanGeo, fanBaseMat, totalFans);
  let fanIdx = 0;
  const standMatrix = new THREE.Matrix4();
  const localFanMatrix = new THREE.Matrix4();
  const worldFanMatrix = new THREE.Matrix4();
  const tempColor = new THREE.Color();

  const plinthGeo = new THREE.BoxGeometry(5.8, 1.8, 2.3);
  const rearPostGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.6, 8);
  const roofGeoStand = new THREE.BoxGeometry(6.0, 0.18, 2.4);

  standLocations.forEach(({ s, side }, idx) => {
    const r = getSoapboxRoadState(s, course.id);
    const latStand = side * 21.5;
    const terrainY = getTerrainHeightOffsetFeet(s, latStand);
    const pos = courseToWorldUnits(s, latStand, terrainY, undefined, course.id);
    const stand = new THREE.Group();
    stand.position.copy(pos);
    // Keep stand aligned with road tangent; `side * tier * 0.62` steps tiers outward on both sides so stands always face the track!
    stand.rotation.y = -r.headingRad;
    stand.rotation.z = -r.slopeRad;
    stand.updateMatrix();
    standMatrix.copy(stand.matrix);

    // Grounded concrete foundation plinth extending into the sloped bank so bleachers never float
    const plinth = new THREE.Mesh(plinthGeo, standPlinthMat);
    plinth.position.set(0, -0.85, side * 0.62);
    stand.add(plinth);

    // 3 tiered bleacher steps
    for (let tier = 0; tier < 3; tier++) {
      const bench = new THREE.Mesh(
        new THREE.BoxGeometry(5.6, 0.45 + tier * 0.42, 0.65),
        standBaseMat
      );
      bench.position.set(0, (0.45 + tier * 0.42) * 0.5, side * tier * 0.62);
      stand.add(bench);

      // Cheering crowd figures on each tier batched into fanInst
      for (let p = -4; p <= 4; p++) {
        localFanMatrix.makeTranslation(
          p * 0.56,
          0.52 + tier * 0.42,
          side * tier * 0.62
        );
        worldFanMatrix.multiplyMatrices(standMatrix, localFanMatrix);
        fanInst.setMatrixAt(fanIdx, worldFanMatrix);
        tempColor.set(crowdColors[(Math.abs(p) + tier + idx) % crowdColors.length]);
        fanInst.setColorAt(fanIdx, tempColor);
        fanIdx++;
      }
    }

    // Rear support pillars & overhead Red Bull canopy roof
    [-2.5, 2.5].forEach((px) => {
      const rearPost = new THREE.Mesh(rearPostGeo, standBaseMat);
      rearPost.position.set(px, 1.3, side * 1.45);
      stand.add(rearPost);
    });
    const roof = new THREE.Mesh(roofGeoStand, canopyMat);
    roof.position.set(0, 2.55, side * 0.6);
    stand.add(roof);

    raceEnv.add(stand);
  });
  fanInst.instanceMatrix.needsUpdate = true;
  if (fanInst.instanceColor) fanInst.instanceColor.needsUpdate = true;
  raceEnv.add(fanInst);

  // 4. Mid-Course Red Bull Soapbox Distance Gantry Banners (every 400ft)
  const postMat = makeSoapboxMat('#0f172a', 0.4, 0.6);
  const bannerColors = ['#0284c7', '#f97316', '#dc2626', '#7c3aed'];
  const gantryPostGeo = new THREE.CylinderGeometry(0.14, 0.18, 6.2, 10);
  const crossbarGeo = new THREE.BoxGeometry(0.45, 0.72, 9.3);
  const accentTrimGeo = new THREE.BoxGeometry(0.5, 0.18, 9.4);
  const accentTrimMat = makeSoapboxMat('#facc15', 0.25);

  for (let milestone = 400; milestone < course.lengthFeet - 150; milestone += 400) {
    const r = getSoapboxRoadState(milestone, course.id);
    const arch = new THREE.Group();
    arch.position.set(
      r.xFeet * UNITS_PER_FOOT,
      r.yFeet * UNITS_PER_FOOT,
      r.zFeet * UNITS_PER_FOOT
    );

    [-4.35, 4.35].forEach((az) => {
      const post = new THREE.Mesh(gantryPostGeo, postMat);
      post.position.set(0, 2.3, az);
      arch.add(post);
    });

    const crossbar = new THREE.Mesh(
      crossbarGeo,
      makeSoapboxMat(bannerColors[Math.floor(milestone / 400) % bannerColors.length], 0.3)
    );
    crossbar.position.set(0, 4.9, 0);
    arch.add(crossbar);

    const accentTrim = new THREE.Mesh(accentTrimGeo, accentTrimMat);
    accentTrim.position.set(0, 4.55, 0);
    arch.add(accentTrim);

    raceEnv.add(arch);
  }

  // 5. Roadside Safety Guardrails & Corner Warning Flags along High-Curvature Bends (InstancedMesh)
  const flagPoleMat = makeSoapboxMat('#e2e8f0', 0.3, 0.7);
  const flagRedMat = makeSoapboxMat('#ef4444', 0.35);
  const flagYellowMat = makeSoapboxMat('#facc15', 0.35);
  const stemGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.85, 6);
  const pennantGeo = new THREE.BoxGeometry(0.42, 0.28, 0.04);
  const stemMatrices: THREE.Matrix4[] = [];
  const redPennantMatrices: THREE.Matrix4[] = [];
  const yellowPennantMatrices: THREE.Matrix4[] = [];

  for (let s = 20; s <= sMax; s += 28) {
    const r = getSoapboxRoadState(s, course.id);
    const isRed = Math.floor(s / 28) % 2 === 0;
    [-1, 1].forEach((side) => {
      const lat = side * 17.5;
      const pos = courseToWorldUnits(s, lat, getTerrainHeightOffsetFeet(s, lat), undefined, course.id);

      tempObj.position.set(pos.x, pos.y + 0.65, pos.z);
      tempObj.rotation.set(0, 0, 0);
      tempObj.scale.set(1, 1, 1);
      tempObj.updateMatrix();
      stemMatrices.push(tempObj.matrix.clone());

      tempObj.position.set(pos.x + 0.2, pos.y + 1.4, pos.z);
      tempObj.rotation.set(0, -r.headingRad, 0);
      tempObj.updateMatrix();
      if (isRed) {
        redPennantMatrices.push(tempObj.matrix.clone());
      } else {
        yellowPennantMatrices.push(tempObj.matrix.clone());
      }
    });
  }
  if (stemMatrices.length > 0) {
    const stemInst = new THREE.InstancedMesh(stemGeo, flagPoleMat, stemMatrices.length);
    for (let i = 0; i < stemMatrices.length; i++) stemInst.setMatrixAt(i, stemMatrices[i]);
    stemInst.instanceMatrix.needsUpdate = true;
    raceEnv.add(stemInst);
  }
  if (redPennantMatrices.length > 0) {
    const redInst = new THREE.InstancedMesh(pennantGeo, flagRedMat, redPennantMatrices.length);
    for (let i = 0; i < redPennantMatrices.length; i++) redInst.setMatrixAt(i, redPennantMatrices[i]);
    redInst.instanceMatrix.needsUpdate = true;
    raceEnv.add(redInst);
  }
  if (yellowPennantMatrices.length > 0) {
    const yellowInst = new THREE.InstancedMesh(pennantGeo, flagYellowMat, yellowPennantMatrices.length);
    for (let i = 0; i < yellowPennantMatrices.length; i++) yellowInst.setMatrixAt(i, yellowPennantMatrices[i]);
    yellowInst.instanceMatrix.needsUpdate = true;
    raceEnv.add(yellowInst);
  }

  // 6. Biome-Specific Trees / Canyon Rocks / Urban Facades / Snow Crags (InstancedMesh, grounded to exact hillside elevation)
  if (theme.sceneryType === 'alpine_pines') {
    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 1.85, 8);
    const trunkMat = makeSoapboxMat('#78350f', 0.8);
    const foliageGeo1 = new THREE.ConeGeometry(1.15, 2.2, 10);
    const foliageGeo2 = new THREE.ConeGeometry(0.85, 1.9, 10);
    const foliageMat = makeSoapboxMat(theme.grassColor, 0.65);

    const trunkMatrices: THREE.Matrix4[] = [];
    const cone1Matrices: THREE.Matrix4[] = [];
    const cone2Matrices: THREE.Matrix4[] = [];

    for (let s = 10; s <= sMax; s += 26) {
      [-1, 1].forEach((side) => {
        const lat = side * (22 + ((s * 7) % 14));
        const terrainY = getTerrainHeightOffsetFeet(s, lat);
        const pos = courseToWorldUnits(s, lat, terrainY, undefined, course.id);
        tempObj.rotation.set(0, 0, 0);
        tempObj.scale.set(1, 1, 1);

        tempObj.position.set(pos.x, pos.y + 0.35, pos.z);
        tempObj.updateMatrix();
        trunkMatrices.push(tempObj.matrix.clone());

        tempObj.position.set(pos.x, pos.y + 1.8, pos.z);
        tempObj.updateMatrix();
        cone1Matrices.push(tempObj.matrix.clone());

        tempObj.position.set(pos.x, pos.y + 2.85, pos.z);
        tempObj.updateMatrix();
        cone2Matrices.push(tempObj.matrix.clone());
      });
    }

    if (trunkMatrices.length > 0) {
      const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, trunkMatrices.length);
      const cone1Inst = new THREE.InstancedMesh(foliageGeo1, foliageMat, cone1Matrices.length);
      const cone2Inst = new THREE.InstancedMesh(foliageGeo2, foliageMat, cone2Matrices.length);
      for (let i = 0; i < trunkMatrices.length; i++) {
        trunkInst.setMatrixAt(i, trunkMatrices[i]);
        cone1Inst.setMatrixAt(i, cone1Matrices[i]);
        cone2Inst.setMatrixAt(i, cone2Matrices[i]);
      }
      trunkInst.instanceMatrix.needsUpdate = true;
      cone1Inst.instanceMatrix.needsUpdate = true;
      cone2Inst.instanceMatrix.needsUpdate = true;
      raceEnv.add(trunkInst, cone1Inst, cone2Inst);
    }
  } else if (theme.sceneryType === 'desert_canyon') {
    const rockGeo = new THREE.CylinderGeometry(1.6, 2.6, 5.8, 6);
    const rockMat = makeSoapboxMat(theme.asphaltColor, 0.9, 0.1);
    const cactusMat = makeSoapboxMat('#15803d', 0.7);
    const cactusStemGeo = new THREE.CylinderGeometry(0.18, 0.18, 2.6, 8);
    const cactusArmGeo = new THREE.BoxGeometry(0.8, 0.16, 0.16);

    const rockMatrices: THREE.Matrix4[] = [];
    const stemMatricesCactus: THREE.Matrix4[] = [];
    const armMatricesCactus: THREE.Matrix4[] = [];

    for (let s = 20; s <= sMax; s += 34) {
      [-1, 1].forEach((side) => {
        const lat = side * (24 + ((s * 5) % 12));
        const pos = courseToWorldUnits(s, lat, getTerrainHeightOffsetFeet(s, lat), undefined, course.id);
        tempObj.position.set(pos.x, pos.y + 2.2, pos.z);
        tempObj.rotation.set(0, 0, 0);
        tempObj.scale.set(1 + (s % 3) * 0.4, 1 + (s % 2) * 0.5, 1);
        tempObj.updateMatrix();
        rockMatrices.push(tempObj.matrix.clone());

        const cLat = side * 19;
        const cPos = courseToWorldUnits(s + 14, cLat, getTerrainHeightOffsetFeet(s + 14, cLat), undefined, course.id);
        tempObj.scale.set(1, 1, 1);
        tempObj.position.set(cPos.x, cPos.y + 0.9, cPos.z);
        tempObj.updateMatrix();
        stemMatricesCactus.push(tempObj.matrix.clone());

        tempObj.position.set(cPos.x, cPos.y + 1.4, cPos.z);
        tempObj.updateMatrix();
        armMatricesCactus.push(tempObj.matrix.clone());
      });
    }

    if (rockMatrices.length > 0) {
      const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockMatrices.length);
      const stemInst = new THREE.InstancedMesh(cactusStemGeo, cactusMat, stemMatricesCactus.length);
      const armInst = new THREE.InstancedMesh(cactusArmGeo, cactusMat, armMatricesCactus.length);
      for (let i = 0; i < rockMatrices.length; i++) {
        rockInst.setMatrixAt(i, rockMatrices[i]);
        stemInst.setMatrixAt(i, stemMatricesCactus[i]);
        armInst.setMatrixAt(i, armMatricesCactus[i]);
      }
      rockInst.instanceMatrix.needsUpdate = true;
      stemInst.instanceMatrix.needsUpdate = true;
      armInst.instanceMatrix.needsUpdate = true;
      raceEnv.add(rockInst, stemInst, armInst);
    }
  } else if (theme.sceneryType === 'urban_alleys') {
    const facadeGeo = new THREE.BoxGeometry(4.6, 9.0, 2.2);
    const roofGeo = new THREE.ConeGeometry(3.2, 1.8, 4);
    const colors = ['#e2e8f0', '#fed7aa', '#fbcfe8', '#cbd5e1', '#fef08a'];
    const roofMat = makeSoapboxMat('#b91c1c', 0.65);
    const facadeBaseMat = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.08 });

    const facadeMatrices: THREE.Matrix4[] = [];
    const facadeColorsList: THREE.Color[] = [];
    const roofMatrices: THREE.Matrix4[] = [];

    for (let s = 20; s <= sMax; s += 30) {
      [-1, 1].forEach((side, idx) => {
        const lat = side * 19.2;
        const pos = courseToWorldUnits(s, lat, getTerrainHeightOffsetFeet(s, lat), undefined, course.id);
        const road = getSoapboxRoadState(s, course.id);
        tempObj.scale.set(1, 1, 1);

        tempObj.position.set(pos.x, pos.y + 3.7, pos.z);
        tempObj.rotation.set(0, -road.headingRad, 0);
        tempObj.updateMatrix();
        facadeMatrices.push(tempObj.matrix.clone());
        facadeColorsList.push(new THREE.Color(colors[(Math.floor(s / 30) + idx) % colors.length]));

        tempObj.position.set(pos.x, pos.y + 9.0, pos.z);
        tempObj.rotation.set(0, -road.headingRad + Math.PI / 4, 0);
        tempObj.updateMatrix();
        roofMatrices.push(tempObj.matrix.clone());
      });
    }

    if (facadeMatrices.length > 0) {
      const facadeInst = new THREE.InstancedMesh(facadeGeo, facadeBaseMat, facadeMatrices.length);
      const roofInst = new THREE.InstancedMesh(roofGeo, roofMat, roofMatrices.length);
      for (let i = 0; i < facadeMatrices.length; i++) {
        facadeInst.setMatrixAt(i, facadeMatrices[i]);
        facadeInst.setColorAt(i, facadeColorsList[i]);
        roofInst.setMatrixAt(i, roofMatrices[i]);
      }
      facadeInst.instanceMatrix.needsUpdate = true;
      if (facadeInst.instanceColor) facadeInst.instanceColor.needsUpdate = true;
      roofInst.instanceMatrix.needsUpdate = true;
      raceEnv.add(facadeInst, roofInst);
    }
  } else if (theme.sceneryType === 'snow_peaks') {
    const cragGeo = new THREE.ConeGeometry(2.4, 6.6, 5);
    const cragMat = makeSoapboxMat('#e0f2fe', 0.4, 0.2);
    const snowPineGeo = new THREE.ConeGeometry(1.05, 3.4, 8);
    const snowPineMat = makeSoapboxMat('#f8fafc', 0.7);

    const cragMatrices: THREE.Matrix4[] = [];
    const pineMatrices: THREE.Matrix4[] = [];

    for (let s = 20; s <= sMax; s += 32) {
      [-1, 1].forEach((side) => {
        const lat = side * (24 + ((s * 3) % 10));
        const pos = courseToWorldUnits(s, lat, getTerrainHeightOffsetFeet(s, lat), undefined, course.id);
        tempObj.scale.set(1, 1, 1);
        tempObj.position.set(pos.x, pos.y + 2.6, pos.z);
        tempObj.rotation.set(0, s * 0.1, 0);
        tempObj.updateMatrix();
        cragMatrices.push(tempObj.matrix.clone());

        const pLat = side * 18.5;
        const pinePos = courseToWorldUnits(s + 15, pLat, getTerrainHeightOffsetFeet(s + 15, pLat), undefined, course.id);
        tempObj.position.set(pinePos.x, pinePos.y + 1.3, pinePos.z);
        tempObj.rotation.set(0, 0, 0);
        tempObj.updateMatrix();
        pineMatrices.push(tempObj.matrix.clone());
      });
    }

    if (cragMatrices.length > 0) {
      const cragInst = new THREE.InstancedMesh(cragGeo, cragMat, cragMatrices.length);
      const pineInst = new THREE.InstancedMesh(snowPineGeo, snowPineMat, pineMatrices.length);
      for (let i = 0; i < cragMatrices.length; i++) {
        cragInst.setMatrixAt(i, cragMatrices[i]);
        pineInst.setMatrixAt(i, pineMatrices[i]);
      }
      cragInst.instanceMatrix.needsUpdate = true;
      pineInst.instanceMatrix.needsUpdate = true;
      raceEnv.add(cragInst, pineInst);
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
  const loadoutRef = useRef(loadout);
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
  loadoutRef.current = loadout;
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
  const hayBurstPoolRef = useRef<THREE.Mesh[]>([]);
  const sparkPoolRef = useRef<THREE.Mesh[]>([]);

  const orbitYawRef = useRef<number>(-0.62);
  const orbitPitchRef = useRef<number>(0.28);
  const orbitRadiusRef = useRef<number>(5.8);
  const targetOrbitYawRef = useRef<number>(-0.62);
  const targetOrbitPitchRef = useRef<number>(0.28);
  const targetOrbitRadiusRef = useRef<number>(5.8);

  const snapBounceRef = useRef<number>(0);
  const raceCamSnappedRef = useRef<boolean>(false);
  const wasDriftingRef = useRef<boolean>(false);
  const loopControlRef = useRef<{ pause: () => void; resume: () => void } | null>(null);

  /**
   * Helper that builds or rebuilds the entire 3D Downhill Race Course environment
   * (sky, fog, lighting, road ribbon, valley terrain, start pavilion, finish arch,
   * obstacles, grandstands, scenery, debris pool, and particle pools).
   */
  const rebuildCourseEnvironment = (targetCourseId: SoapboxCourseId) => {
    const scene = sceneRef.current;
    if (!scene) return;

    const course = getSoapboxCourse(targetCourseId);
    const theme = course.visualTheme;

    scene.background = new THREE.Color(theme.skyColor);
    scene.fog = new THREE.FogExp2(theme.fogColor, theme.fogDensity * 0.72);

    if (hemiLightRef.current) {
      hemiLightRef.current.color.set(theme.hemiSkyColor);
      hemiLightRef.current.groundColor.set(theme.hemiGroundColor);
    }
    if (sunLightRef.current) {
      sunLightRef.current.color.set(theme.sunColor);
      sunLightRef.current.position.set(
        theme.sunPosition[0],
        theme.sunPosition[1],
        theme.sunPosition[2]
      );
    }

    if (raceEnvRef.current) {
      scene.remove(raceEnvRef.current);
      disposeSoapboxObject3D(raceEnvRef.current, false);
      raceEnvRef.current = null;
    }

    const raceEnv = new THREE.Group();
    raceEnv.visible = modeRef.current === 'race';
    scene.add(raceEnv);
    raceEnvRef.current = raceEnv;

    // 1. Road ribbon & wide hillside valley terrain
    const roadRibbon = buildCourseRoadRibbon(course);
    raceEnv.add(roadRibbon);

    // 2. Hilltop Start Pavilion at s = -course.startRampFeet + 4
    const startRoad = getSoapboxRoadState(-course.startRampFeet + 4, course.id);
    const pavilionGroup = new THREE.Group();
    pavilionGroup.position.set(
      startRoad.xFeet * UNITS_PER_FOOT,
      startRoad.yFeet * UNITS_PER_FOOT,
      startRoad.zFeet * UNITS_PER_FOOT
    );
    pavilionGroup.rotation.y = -startRoad.headingRad;
    pavilionGroup.rotation.z = -startRoad.slopeRad;

    [
      [-1.4, 3.9],
      [-1.4, -3.9],
      [3.8, 3.9],
      [3.8, -3.9],
    ].forEach(([px, pz]) => {
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.18, 5.8, 10),
        makeSoapboxMat('#1e293b', 0.35, 0.6)
      );
      pillar.position.set(px, 2.9, pz);
      pavilionGroup.add(pillar);
    });

    const roofCanopy = new THREE.Mesh(
      new THREE.BoxGeometry(6.4, 0.38, 8.6),
      makeSoapboxMat('#dc2626', 0.35)
    );
    roofCanopy.position.set(1.2, 5.8, 0);
    pavilionGroup.add(roofCanopy);

    const roofTrim = new THREE.Mesh(
      new THREE.BoxGeometry(6.5, 0.14, 8.7),
      makeSoapboxMat('#facc15', 0.25)
    );
    roofTrim.position.set(1.2, 5.58, 0);
    pavilionGroup.add(roofTrim);

    // Starter chute side walls with Red Bull Soapbox branding colors
    [-4.05, 4.05].forEach((wallZ) => {
      const chuteWall = new THREE.Mesh(
        new THREE.BoxGeometry(8.5, 0.85, 0.22),
        makeSoapboxMat('#1e3a8a', 0.45)
      );
      chuteWall.position.set(2.8, 0.42, wallZ);
      const chuteTopStripe = new THREE.Mesh(
        new THREE.BoxGeometry(8.55, 0.16, 0.26),
        makeSoapboxMat('#facc15', 0.3)
      );
      chuteTopStripe.position.set(2.8, 0.86, wallZ);
      pavilionGroup.add(chuteWall, chuteTopStripe);
    });

    const gantryBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.52, 4.2),
      makeSoapboxMat('#0f172a', 0.4)
    );
    gantryBar.position.set(3.8, 5.05, 0);
    pavilionGroup.add(gantryBar);

    const gantryLightMats: THREE.MeshBasicMaterial[] = [];
    for (let i = 0; i < 5; i++) {
      const lMat = new THREE.MeshBasicMaterial({ color: '#ef4444' });
      gantryLightMats.push(lMat);
      const zOff = (i - 2) * 0.68;
      // Camera-facing (-X) and downhill-facing (+X) start light bulbs
      const bulbBack = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), lMat);
      bulbBack.position.set(3.58, 5.05, zOff);
      const bulbFront = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), lMat);
      bulbFront.position.set(4.02, 5.05, zOff);
      pavilionGroup.add(bulbBack, bulbFront);
    }
    gantryLightMatsRef.current = gantryLightMats;

    const startGatePivot = new THREE.Group();
    startGatePivot.position.set(2.2, 0.025, 0);
    const gatePlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.82, 5.6),
      makeSoapboxMat('#facc15', 0.3, 0.6)
    );
    gatePlate.position.y = 0.41;
    startGatePivot.add(gatePlate);
    pavilionGroup.add(startGatePivot);
    startGatePivotRef.current = startGatePivot;

    raceEnv.add(pavilionGroup);

    // 3. Finish Arch at s = course.lengthFeet
    const finishRoad = getSoapboxRoadState(course.lengthFeet, course.id);
    const finishArchGroup = new THREE.Group();
    finishArchGroup.position.set(
      finishRoad.xFeet * UNITS_PER_FOOT,
      finishRoad.yFeet * UNITS_PER_FOOT,
      finishRoad.zFeet * UNITS_PER_FOOT
    );

    [-4.35, 4.35].forEach((fz) => {
      const tower = new THREE.Mesh(
        new THREE.BoxGeometry(0.78, 6.2, 0.78),
        makeSoapboxMat('#0f172a', 0.35)
      );
      tower.position.set(0, 2.3, fz);
      finishArchGroup.add(tower);

      for (let b = 0; b < 4; b++) {
        const checker = new THREE.Mesh(
          new THREE.BoxGeometry(0.84, 0.58, 0.84),
          makeSoapboxMat(b % 2 === 0 ? '#f8fafc' : '#ef4444', 0.3)
        );
        checker.position.set(0, 0.8 + b * 1.12, fz);
        finishArchGroup.add(checker);
      }
    });

    const archBanner = new THREE.Mesh(
      new THREE.BoxGeometry(0.88, 1.15, 9.5),
      makeSoapboxMat('#facc15', 0.25)
    );
    archBanner.position.set(0, 5.3, 0);
    finishArchGroup.add(archBanner);
    raceEnv.add(finishArchGroup);

    // 4. Course Obstacles (Hay Bales, Water Slicks, Kicker Jumps, Speed Gates & Cobble Strips)
    const obstacleMeshes = new Map<string, THREE.Object3D>();
    const courseObstacles = course.generateObstacles();

    courseObstacles.forEach((obs) => {
      const r = getSoapboxRoadState(obs.sFeet, course.id);
      const pos = courseToWorldUnits(obs.sFeet, obs.lateralCenterFeet, 0, undefined, course.id);
      const node = new THREE.Group();

      if (obs.type === 'water_slick' || obs.type === 'cobble_strip') {
        // Road-conforming surface obstacles place their child meshes directly in world space along sFeet
        node.position.set(0, 0, 0);
        node.rotation.set(0, 0, 0);
      } else {
        node.position.copy(pos);
        node.rotation.y = -r.headingRad;
        node.rotation.z = -r.slopeRad;
      }

      if (obs.type === 'hay_bale') {
        const baleGeo = new THREE.BoxGeometry(0.82, 0.56, 1.2);
        const baleMat = makeSoapboxMat('#eab308', 0.78);
        const strapMat = makeSoapboxMat('#dc2626', 0.35);
        [
          [0, 0.26, -0.54],
          [0, 0.26, 0.54],
          [0, 0.8, 0],
        ].forEach(([bx, by, bz]) => {
          const bale = new THREE.Mesh(baleGeo, baleMat);
          bale.position.set(bx, by, bz);
          const strap = new THREE.Mesh(
            new THREE.BoxGeometry(0.85, 0.58, 0.15),
            strapMat
          );
          strap.position.set(bx, by, bz);
          node.add(bale, strap);
        });
      } else if (obs.type === 'water_slick') {
        const slickMat = new THREE.MeshStandardMaterial({
          color: '#22d3ee',
          emissive: '#0284c7',
          emissiveIntensity: 0.28,
          roughness: 0.06,
          metalness: 0.65,
        });
        const foamMat = makeSoapboxMat('#e0f2fe', 0.25, 0.1);
        const bubbleMat = makeSoapboxMat('#ffffff', 0.12);
        const segSteps = 6;
        for (let seg = 0; seg <= segSteps; seg++) {
          const t = seg / segSteps - 0.5;
          const ds = t * obs.lengthFeet * 0.82;
          const sHere = obs.sFeet + ds;
          const rHere = getSoapboxRoadState(sHere, course.id);
          const widthScale = Math.sqrt(Math.max(0.25, 1 - Math.pow(t * 1.75, 2)));
          const segRadiusU = obs.halfWidthFeet * UNITS_PER_FOOT * widthScale;

          const disc = new THREE.Mesh(
            new THREE.CylinderGeometry(segRadiusU, segRadiusU * 1.04, 0.024, 18),
            slickMat
          );
          courseToWorldUnits(
            sHere,
            obs.lateralCenterFeet,
            0.042 + seg * 0.0025,
            disc.position,
            course.id
          );
          disc.rotation.y = -rHere.headingRad;
          disc.rotation.z = -rHere.slopeRad;
          node.add(disc);

          if (seg % 2 === 0) {
            const foam = new THREE.Mesh(
              new THREE.CylinderGeometry(segRadiusU * 1.06, segRadiusU * 1.08, 0.016, 16),
              foamMat
            );
            courseToWorldUnits(
              sHere,
              obs.lateralCenterFeet,
              0.026 + seg * 0.0025,
              foam.position,
              course.id
            );
            foam.rotation.y = -rHere.headingRad;
            foam.rotation.z = -rHere.slopeRad;
            node.add(foam);
          }
        }

        for (let b = 0; b < 9; b++) {
          const ds = ((b - 4) / 4.5) * (obs.lengthFeet * 0.38);
          const dLat = Math.sin(b * 1.9) * (obs.halfWidthFeet * 0.55);
          const bubble = new THREE.Mesh(
            new THREE.SphereGeometry(0.11 + (b % 3) * 0.03, 8, 8),
            bubbleMat
          );
          courseToWorldUnits(
            obs.sFeet + ds,
            obs.lateralCenterFeet + dLat,
            0.14,
            bubble.position,
            course.id
          );
          node.add(bubble);
        }
      } else if (obs.type === 'kicker_jump') {
        // Solid 3D wedge ramp whose underside sits completely flush on the sloped road surface
        const lenU = obs.lengthFeet * UNITS_PER_FOOT;
        const widthU = obs.halfWidthFeet * 2 * UNITS_PER_FOOT;
        const halfLenU = lenU * 0.5;
        const lipHeightU = 0.52;

        const wedgeShape = new THREE.Shape();
        wedgeShape.moveTo(-halfLenU, -0.06);
        wedgeShape.lineTo(halfLenU, -0.06);
        wedgeShape.lineTo(halfLenU, lipHeightU);
        wedgeShape.lineTo(-halfLenU, 0.03);
        wedgeShape.closePath();

        const wedgeGeo = new THREE.ExtrudeGeometry(wedgeShape, {
          depth: widthU,
          bevelEnabled: false,
        });
        wedgeGeo.translate(0, 0, -widthU * 0.5);
        const ramp = new THREE.Mesh(wedgeGeo, makeSoapboxMat('#ea580c', 0.42, 0.15));
        node.add(ramp);

        // Center yellow launch chevron deck stripe along the top slope of the wedge
        const deckAngle = Math.atan2(lipHeightU - 0.03, lenU);
        const deckLenU = Math.hypot(lenU, lipHeightU - 0.03);
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(deckLenU * 0.96, 0.03, Math.min(0.55, widthU * 0.32)),
          makeSoapboxMat('#facc15', 0.28)
        );
        stripe.position.set(0, (lipHeightU + 0.03) * 0.5 + 0.015, 0);
        stripe.rotation.z = deckAngle;
        node.add(stripe);

        // High-contrast launch lip bar at the top edge
        const lipBar = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, lipHeightU + 0.06, widthU + 0.06),
          makeSoapboxMat('#0f172a', 0.35, 0.4)
        );
        lipBar.position.set(halfLenU - 0.08, (lipHeightU - 0.06) * 0.5, 0);
        node.add(lipBar);
      } else if (obs.type === 'speed_gate') {
        const halfGateZ = obs.halfWidthFeet * UNITS_PER_FOOT;
        [-halfGateZ, halfGateZ].forEach((gz) => {
          const pylon = new THREE.Mesh(
            new THREE.ConeGeometry(0.34, 2.5, 12),
            makeSoapboxMat('#2563eb', 0.28)
          );
          pylon.position.set(0, 1.2, gz);
          const tip = new THREE.Mesh(
            new THREE.ConeGeometry(0.2, 0.75, 12),
            makeSoapboxMat('#ef4444', 0.28)
          );
          tip.position.set(0, 2.1, gz);
          node.add(pylon, tip);
        });

        const boostCarpet = new THREE.Mesh(
          new THREE.BoxGeometry(1.5, 0.035, halfGateZ * 1.85),
          new THREE.MeshBasicMaterial({ color: '#4ade80' })
        );
        boostCarpet.position.y = 0.025;
        node.add(boostCarpet);
      } else if (obs.type === 'cobble_strip') {
        // Road-conforming 3D Cobblestone Rumble Strip Stones following exact road elevation & curvature (InstancedMesh)
        const stoneMat = makeSoapboxMat('#94a3b8', 0.85, 0.1);
        const stoneDarkMat = makeSoapboxMat('#475569', 0.85, 0.1);
        const stoneGeo = new THREE.BoxGeometry(0.46, 0.06, 0.42);
        const halfLenFt = obs.lengthFeet * 0.46;
        const halfWFt = obs.halfWidthFeet * 0.86;
        const lightMatrices: THREE.Matrix4[] = [];
        const darkMatrices: THREE.Matrix4[] = [];
        const tempStoneObj = new THREE.Object3D();

        for (let ds = -halfLenFt; ds <= halfLenFt; ds += 3.0) {
          const sHere = obs.sFeet + ds;
          const rHere = getSoapboxRoadState(sHere, course.id);
          for (let dLat = -halfWFt; dLat <= halfWFt; dLat += 2.6) {
            courseToWorldUnits(
              sHere,
              obs.lateralCenterFeet + dLat,
              0.05,
              tempStoneObj.position,
              course.id
            );
            tempStoneObj.rotation.set(0, -rHere.headingRad, -rHere.slopeRad);
            tempStoneObj.updateMatrix();
            if (Math.round((ds + dLat) * 3) % 2 === 0) {
              lightMatrices.push(tempStoneObj.matrix.clone());
            } else {
              darkMatrices.push(tempStoneObj.matrix.clone());
            }
          }
        }
        if (lightMatrices.length > 0) {
          const lightInst = new THREE.InstancedMesh(stoneGeo, stoneMat, lightMatrices.length);
          for (let i = 0; i < lightMatrices.length; i++) lightInst.setMatrixAt(i, lightMatrices[i]);
          lightInst.instanceMatrix.needsUpdate = true;
          node.add(lightInst);
        }
        if (darkMatrices.length > 0) {
          const darkInst = new THREE.InstancedMesh(stoneGeo, stoneDarkMat, darkMatrices.length);
          for (let i = 0; i < darkMatrices.length; i++) darkInst.setMatrixAt(i, darkMatrices[i]);
          darkInst.instanceMatrix.needsUpdate = true;
          node.add(darkInst);
        }
      }

      obstacleMeshes.set(obs.id, node);
      raceEnv.add(node);
    });
    obstacleMeshesRef.current = obstacleMeshes;

    // 5. Themed scenery, grandstands, mountains & clouds
    buildThemedScenery(raceEnv, course);

    // 6. Debris meshes pool
    const wheelRadius = craftGroupsRef.current?.wheelRadiusMeters ?? 0.26;
    const debrisMeshes = buildSoapboxDebrisMeshes(loadoutRef.current, wheelRadius);
    debrisMeshesBySlotRef.current = debrisMeshes;
    Object.values(debrisMeshes).forEach((m) => {
      m.visible = false;
      raceEnv.add(m);
    });

    // 7. Hay-bale burst straw cubes & chassis spark particle pools
    const strawPool: THREE.Mesh[] = [];
    const strawGeo = new THREE.BoxGeometry(0.22, 0.14, 0.32);
    const strawMat = makeSoapboxMat('#facc15', 0.65);
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(strawGeo, strawMat);
      m.visible = false;
      raceEnv.add(m);
      strawPool.push(m);
    }
    hayBurstPoolRef.current = strawPool;

    const sparks: THREE.Mesh[] = [];
    const sparkGeo = new THREE.BoxGeometry(0.32, 0.05, 0.05);
    const sparkMat = new THREE.MeshBasicMaterial({ color: '#fb923c' });
    for (let i = 0; i < 12; i++) {
      const sMesh = new THREE.Mesh(sparkGeo, sparkMat);
      sMesh.visible = false;
      raceEnv.add(sMesh);
      sparks.push(sMesh);
    }
    sparkPoolRef.current = sparks;
  };

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
      targetOrbitYawRef.current = preset.yaw;
      targetOrbitPitchRef.current = preset.pitch;
      targetOrbitRadiusRef.current = preset.radius;
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
          disposeSoapboxObject3D(m, false);
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
      wasDriftingRef.current = false;
    }
  }, [mode]);

  // Rebuild course race environment when courseId changes
  useEffect(() => {
    rebuildCourseEnvironment(courseId);
  }, [courseId]);

  // Primary WebGL Scene & Loop Initialization
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const initialCourse = getSoapboxCourse(courseIdRef.current);
    const theme = initialCourse.visualTheme;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(theme.skyColor);
    scene.fog = new THREE.FogExp2(theme.fogColor, theme.fogDensity * 0.72);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      52,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.45,
      950
    );

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const hemiLight = new THREE.HemisphereLight(
      theme.hemiSkyColor,
      theme.hemiGroundColor,
      0.85
    );
    scene.add(hemiLight);
    hemiLightRef.current = hemiLight;

    const sunLight = new THREE.DirectionalLight(theme.sunColor, 1.5);
    sunLight.position.set(
      theme.sunPosition[0],
      theme.sunPosition[1],
      theme.sunPosition[2]
    );
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 512;
    sunLight.shadow.mapSize.height = 512;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 320;
    const shadowD = 9.5;
    sunLight.shadow.camera.left = -shadowD;
    sunLight.shadow.camera.right = shadowD;
    sunLight.shadow.camera.top = shadowD;
    sunLight.shadow.camera.bottom = -shadowD;
    scene.add(sunLight);
    scene.add(sunLight.target);
    sunLightRef.current = sunLight;

    // ========================================================================
    // GARAGE PADDOCK & PIT WORKSHOP ENVIRONMENT (Visible in 'garage' mode)
    // ========================================================================
    const garageEnv = new THREE.Group();
    scene.add(garageEnv);

    // Wide Alpine Meadow & Hilltop Ground surrounding the Garage Paddock (RingGeometry avoids overdraw under paddockApron)
    const garageMeadow = new THREE.Mesh(
      new THREE.RingGeometry(14.5, 160, 32),
      new THREE.MeshLambertMaterial({ color: '#15803d' })
    );
    garageMeadow.rotation.x = -Math.PI / 2;
    garageMeadow.position.y = -0.88;
    garageMeadow.receiveShadow = false;
    garageEnv.add(garageMeadow);

    // Paved Asphalt Paddock Apron around Turntable (RingGeometry avoids overdraw under turntable)
    const paddockApron = new THREE.Mesh(
      new THREE.RingGeometry(4.3, 14.8, 36),
      new THREE.MeshLambertMaterial({ color: '#1e293b' })
    );
    paddockApron.rotation.x = -Math.PI / 2;
    paddockApron.position.y = -0.84;
    paddockApron.receiveShadow = false;
    garageEnv.add(paddockApron);

    // Red & White Racing Curb Ring framing the Paddock Apron (InstancedMesh)
    const curbBlockGeo = new THREE.BoxGeometry(1.25, 0.12, 0.55);
    const curbRedInst = new THREE.InstancedMesh(curbBlockGeo, makeSoapboxMat('#dc2626', 0.4), 18);
    const curbWhiteInst = new THREE.InstancedMesh(curbBlockGeo, makeSoapboxMat('#f8fafc', 0.4), 18);
    const tempCurbObj = new THREE.Object3D();
    for (let seg = 0; seg < 36; seg++) {
      const ang = (seg / 36) * Math.PI * 2;
      tempCurbObj.position.set(Math.cos(ang) * 8.6, -0.8, Math.sin(ang) * 8.6);
      tempCurbObj.rotation.set(0, -ang + Math.PI / 2, 0);
      tempCurbObj.updateMatrix();
      if (seg % 2 === 0) {
        curbRedInst.setMatrixAt(seg >> 1, tempCurbObj.matrix);
      } else {
        curbWhiteInst.setMatrixAt(seg >> 1, tempCurbObj.matrix);
      }
    }
    curbRedInst.instanceMatrix.needsUpdate = true;
    curbWhiteInst.instanceMatrix.needsUpdate = true;
    garageEnv.add(curbRedInst, curbWhiteInst);

    // Garage Pit Turntable Platform
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

    // Red Bull Soapbox Paddock Pit Gantry, Tool Cabinets & Spare Tire Stacks
    const pitBackdrop = new THREE.Group();
    pitBackdrop.position.set(0, -0.82, -5.8);
    garageEnv.add(pitBackdrop);

    // Overhead Pit Truss Arch
    [-4.6, 4.6].forEach((px) => {
      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.22, 4.4, 10),
        makeSoapboxMat('#334155', 0.35, 0.7)
      );
      col.position.set(px, 2.2, 0);
      pitBackdrop.add(col);
    });
    const topBeam = new THREE.Mesh(
      new THREE.BoxGeometry(9.8, 0.58, 0.48),
      makeSoapboxMat('#1e3a8a', 0.35, 0.4)
    );
    topBeam.position.set(0, 4.3, 0);
    const goldStripe = new THREE.Mesh(
      new THREE.BoxGeometry(9.9, 0.14, 0.52),
      makeSoapboxMat('#facc15', 0.25, 0.5)
    );
    goldStripe.position.set(0, 3.98, 0);
    pitBackdrop.add(topBeam, goldStripe);

    // Red Tool Chests & Stacked Racing Slicks in the Pit Bay
    const chestGeo = new THREE.BoxGeometry(1.45, 1.15, 0.68);
    const chestMat = makeSoapboxMat('#dc2626', 0.32, 0.45);
    [-2.8, 2.8].forEach((tx) => {
      const chest = new THREE.Mesh(chestGeo, chestMat);
      chest.position.set(tx, 0.58, 0.2);
      pitBackdrop.add(chest);
    });
    const spareTireGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.24, 16);
    const spareTireMat = makeSoapboxMat('#0f172a', 0.7, 0.1);
    [-4.1, 4.1].forEach((sx) => {
      for (let t = 0; t < 4; t++) {
        const spareTire = new THREE.Mesh(spareTireGeo, spareTireMat);
        spareTire.position.set(sx, 0.14 + t * 0.25, 0.65);
        pitBackdrop.add(spareTire);
      }
    });

    // Scenic Pines & Distant Alpine Peaks around the Garage Paddock Horizon (batched into 4 InstancedMeshes)
    const garagePineMat = makeSoapboxMat('#166534', 0.68);
    const garageTrunkMat = makeSoapboxMat('#78350f', 0.8);
    const garageMtnMat = makeSoapboxMat('#1e293b', 0.85);
    const garageSnowMat = makeSoapboxMat('#f8fafc', 0.6);

    const garageTrunkGeo = new THREE.CylinderGeometry(0.14, 0.18, 1.1, 8);
    const garageFoliageGeo = new THREE.ConeGeometry(1.1, 2.8, 9);
    const garageMtnUnitGeo = new THREE.ConeGeometry(1, 1, 7);

    const garageTrunkInst = new THREE.InstancedMesh(garageTrunkGeo, garageTrunkMat, 16);
    const garageFoliageInst = new THREE.InstancedMesh(garageFoliageGeo, garagePineMat, 16);
    const garageMtnInst = new THREE.InstancedMesh(garageMtnUnitGeo, garageMtnMat, 16);
    const garageSnowInst = new THREE.InstancedMesh(garageMtnUnitGeo, garageSnowMat, 16);
    garageTrunkInst.frustumCulled = false;
    garageFoliageInst.frustumCulled = false;
    garageMtnInst.frustumCulled = false;
    garageSnowInst.frustumCulled = false;

    const gDummy = new THREE.Object3D();
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2 + 0.2;
      const dist = 16 + (i % 3) * 4.5;
      const tx = Math.cos(ang) * dist;
      const tz = Math.sin(ang) * dist;

      gDummy.rotation.set(0, 0, 0);
      gDummy.scale.set(1, 1, 1);
      gDummy.position.set(tx, -0.3, tz);
      gDummy.updateMatrix();
      garageTrunkInst.setMatrixAt(i, gDummy.matrix);

      gDummy.position.set(tx, 1.25, tz);
      gDummy.updateMatrix();
      garageFoliageInst.setMatrixAt(i, gDummy.matrix);

      // Distant mountain peak behind trees
      const mtnDist = 58 + (i % 4) * 14;
      const mtnH = 18 + (i % 5) * 5;
      const mtnR = 12 + (i % 3) * 4;
      const mx = Math.cos(ang) * mtnDist;
      const mz = Math.sin(ang) * mtnDist;

      gDummy.position.set(mx, -1.2 + mtnH * 0.5, mz);
      gDummy.scale.set(mtnR, mtnH, mtnR);
      gDummy.updateMatrix();
      garageMtnInst.setMatrixAt(i, gDummy.matrix);

      gDummy.position.set(mx, -1.2 + mtnH * 0.795, mz);
      gDummy.scale.set(mtnR * 0.445, mtnH * 0.42, mtnR * 0.445);
      gDummy.updateMatrix();
      garageSnowInst.setMatrixAt(i, gDummy.matrix);
    }
    garageTrunkInst.instanceMatrix.needsUpdate = true;
    garageFoliageInst.instanceMatrix.needsUpdate = true;
    garageMtnInst.instanceMatrix.needsUpdate = true;
    garageSnowInst.instanceMatrix.needsUpdate = true;
    garageEnv.add(garageTrunkInst, garageFoliageInst, garageMtnInst, garageSnowInst);

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
    const initialBuilt = buildSoapbox3D(loadoutRef.current);
    scene.add(initialBuilt.root);
    craftGroupsRef.current = initialBuilt;

    // Build initial 3D Downhill Race Course environment immediately on mount!
    rebuildCourseEnvironment(courseIdRef.current);

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
        targetOrbitYawRef.current -= dx * 0.007;
        targetOrbitPitchRef.current = Math.max(
          -0.08,
          Math.min(1.18, targetOrbitPitchRef.current + dy * 0.006)
        );
        orbitYawRef.current = targetOrbitYawRef.current;
        orbitPitchRef.current = targetOrbitPitchRef.current;
        lastPointerX = e.clientX;
        lastPointerY = e.clientY;
      } else if (e.target === renderer.domElement) {
        const cat = pickSocketCategory(e.clientX, e.clientY);
        hoveredCategoryRef.current = cat;
        const nextCursor = cat ? 'pointer' : 'grab';
        if (renderer.domElement.style.cursor !== nextCursor) {
          renderer.domElement.style.cursor = nextCursor;
        }
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
      targetOrbitRadiusRef.current = Math.max(
        3.4,
        Math.min(9.8, targetOrbitRadiusRef.current + e.deltaY * 0.004)
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
    let lastHudSyncTime = 0;
    let lastHudSignature = '';
    let lastSnapX = Number.NaN;
    let lastSnapY = Number.NaN;
    let lastSnapZ = Number.NaN;

    const animate = (now: number) => {
      if (pausedRef.current) {
        rafId = 0;
        return;
      }
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
        if (Math.abs(camera.fov - 52) > 0.1) {
          camera.fov = 52;
          camera.updateProjectionMatrix();
        }

        orbitYawRef.current +=
          (targetOrbitYawRef.current - orbitYawRef.current) * Math.min(1, rawDt * 7);
        orbitPitchRef.current +=
          (targetOrbitPitchRef.current - orbitPitchRef.current) * Math.min(1, rawDt * 7);
        orbitRadiusRef.current +=
          (targetOrbitRadiusRef.current - orbitRadiusRef.current) * Math.min(1, rawDt * 7);

        const cy = Math.cos(orbitYawRef.current);
        const sy = Math.sin(orbitYawRef.current);
        const cp = Math.cos(orbitPitchRef.current);
        const sp = Math.sin(orbitPitchRef.current);
        const r = orbitRadiusRef.current;

        camera.position.set(r * cp * sy, r * sp + 0.15, r * cp * cy);
        camera.lookAt(0, 0.05, 0);

        if (lastSnapX !== 0 || lastSnapY !== 0 || lastSnapZ !== 0) {
          lastSnapX = 0;
          lastSnapY = 0;
          lastSnapZ = 0;
          sunLight.position.set(16, 28, 18);
          sunLight.target.position.set(0, 0, 0);
          sunLight.target.updateMatrixWorld();
        }

        // Sync 3D Center of Gravity & Track Width Gizmos with live metrics
        const m = metricsRef.current;
        cgPinGroup.position.set(m.cgX, m.cgHeightMeters - 0.58, 0);
        trackWidthBar.scale.set(1, 1, m.trackWidthMeters);

        if (craft) {
          const baseGarageY = -0.55 + (0.34 + craft.wheelRadiusMeters);
          const halfTrackZ = craft.trackWidthMeters * 0.5;
          craft.root.position.set(0, baseGarageY, 0);
          craft.root.rotation.set(0, 0, 0);
          craft.sprungGroup.position.set(0, 0, 0);
          craft.sprungGroup.rotation.set(0, 0, 0);
          craft.unsprungGroup.position.set(0, 0, 0);
          craft.crewGroup.visible = false;

          // Ensure all parts visible and neutral pose in garage
          if (craft.wheelCornerNodes) {
            craft.wheelCornerNodes.wheel_fl.visible = true;
            craft.wheelCornerNodes.wheel_fr.visible = true;
            craft.wheelCornerNodes.wheel_rl.visible = true;
            craft.wheelCornerNodes.wheel_rr.visible = true;
          }
          if (craft.bumperNode) craft.bumperNode.visible = true;
          if (craft.topperNode) craft.topperNode.visible = true;
          if (craft.topperGroup) craft.topperGroup.visible = true;
          craft.frontSteerNodes.forEach((n) => {
            n.rotation.x = 0;
            n.rotation.y = 0;
          });
          craft.shockSpringMeshes.forEach((sMesh) => {
            sMesh.scale.y = 1;
          });

          // Shaker rig dynamics
          if (shakerRigRef.current) {
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
              pad.position.z = idx % 2 === 0 ? halfTrackZ : -halfTrackZ;
              pad.position.y = -0.6 + Math.sin(tSec * 8.5 + idx * 1.5) * 0.04;
            });
          } else {
            padMeshes.forEach((pad, idx) => {
              pad.position.z = idx % 2 === 0 ? halfTrackZ : -halfTrackZ;
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
            ringMesh.position.y = -0.56 - baseGarageY;
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
        let stepsRun = 0;
        while (physicsAccumulator >= FIXED_DT && stepsRun < 4) {
          const stepEvents = stepSoapboxSimulation(
            sim,
            metricsRef.current,
            FIXED_DT,
            bestDistRef.current,
            bestTimeRef.current
          );
          physicsAccumulator -= FIXED_DT;
          stepsRun++;

          // Trigger race audio feedback for key physics events
          if (stepEvents.gateDropped) {
            soundEngine.playStartGateDrop();
          }
          if (stepEvents.pushShoveResult === 'perfect' || stepEvents.pushShoveResult === 'good') {
            soundEngine.playTrolleyDetach(stepEvents.pushShoveResult === 'perfect');
          }
          if (
            stepEvents.hayBaleHit ||
            stepEvents.bottomedOut ||
            stepEvents.partDetached ||
            stepEvents.wrecked
          ) {
            soundEngine.playCrashThud();
          }
          if (stepEvents.waterSlickEntered) {
            soundEngine.playSplash(45);
          }
          if (stepEvents.kickerLaunched || stepEvents.speedGateCleared) {
            soundEngine.playThermalChime();
          }

          if (stepEvents.finishedRun && !finishNotifiedRef.current) {
            finishNotifiedRef.current = true;
            if (sim.completedCourse) {
              soundEngine.playCrowdCheer();
            }
            onRunFinishedRef.current?.(sim);
          }
        }
        if (physicsAccumulator >= FIXED_DT) {
          physicsAccumulator = 0;
        }

        if (sim.isDrifting && !wasDriftingRef.current) {
          soundEngine.playTireScreech();
        }
        wasDriftingRef.current = sim.isDrifting;

        // Sync discrete React HUD state only when discrete fields change or every 120ms for obstacle lookahead.
        // Continuous telemetry (speed, timer, G-load, integrity bar, push-bar cursor) is updated at 60fps via direct DOM refs in SoapboxRaceHUD.
        const hudSig = `${sim.phase}|${sim.sectionName}|${sim.isWrecked}|${sim.wreckReason}|${sim.partsDetachedCount}|${sim.rollWarning}|${sim.isDrifting}|${sim.isBrakeFading}|${sim.steerInput}|${sim.brakeInput}|${sim.pushTuckActive}|${sim.statusBanner?.text ?? ''}|${Math.round(sim.structuralIntegrity * 25)}|${Math.round(sim.pullYawRate * 10)}`;
        if (hudSig !== lastHudSignature || tSec - lastHudSyncTime >= 0.12) {
          lastHudSignature = hudSig;
          lastHudSyncTime = tSec;
          onHudSyncRef.current?.({ ...sim });
        }

        // Update Start Gate Rotation (fold flat around Z-axis onto the starter ramp floor!) & Gantry Lights
        if (startGatePivotRef.current) {
          startGatePivotRef.current.rotation.x = 0;
          startGatePivotRef.current.rotation.z = -sim.gateOpenProgress * (Math.PI / 2);
          startGatePivotRef.current.position.y = 0.025 - sim.gateOpenProgress * 0.018;
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

        // Update Obstacle Meshes Visibility in O(N) instead of O(N^2)
        const obsMap = obstacleMeshesRef.current;
        for (let i = 0; i < sim.obstacles.length; i++) {
          const oState = sim.obstacles[i];
          const mesh = obsMap.get(oState.id);
          if (mesh) {
            mesh.visible = !oState.triggered;
          }
        }

        // 3D Soapbox Position & Orientation (offset by wheel ground clearance so tire bottoms rest flush on the road)
        const road = getSoapboxRoadState(sim.sFeet, activeCourseId);
        const groundClearanceFeet = craft
          ? (0.34 + craft.wheelRadiusMeters) / UNITS_PER_FOOT
          : 2.4;
        courseToWorldUnits(
          sim.sFeet,
          sim.lateralOffsetFeet,
          sim.airborneHeightFeet + groundClearanceFeet,
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

          // Front wheel steering & cockpit steering wheel rotation
          const steerRad = -THREE.MathUtils.degToRad(sim.steerAngleDeg);
          craft.frontSteerNodes.forEach((n) => {
            if (n.userData?.isSteeringWheel) {
              n.rotation.x = -steerRad * 2.2;
            } else {
              n.rotation.y = steerRad;
            }
          });

          const wheelSpinRate =
            (sim.speedFtS * 0.3048) / Math.max(0.18, craft.wheelRadiusMeters);
          craft.wheelSpinners.forEach((w) => {
            w.rotation.z -= wheelSpinRate * rawDt;
          });

          craft.shockSpringMeshes.forEach((sMesh) => {
            sMesh.scale.y = Math.max(0.55, 1 - sim.suspensionCompression * 0.35);
          });

          // Push-Crew Joggers on Starter Chute (with shoes contacting road at y = -0.57)
          craft.crewGroup.visible = sim.phase === 'skit' || sim.phase === 'start_ramp';
          if (craft.crewGroup.visible) {
            craft.crewGroup.children.forEach((runner, idx) => {
              runner.position.y =
                -0.18 + Math.abs(Math.sin(tSec * 14 + idx * 1.4)) * 0.12;
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
              courseToWorldUnits(
                d.sFeet,
                d.lateralFeet,
                d.heightFeet,
                mesh.position,
                activeCourseId
              );
              mesh.rotation.set(d.rotation.x, d.rotation.y, d.rotation.z);
            });
          }

          // Render 3D Hay-Bale Straw Bursts
          const strawPool = hayBurstPoolRef.current;
          strawPool.forEach((m) => {
            m.visible = false;
          });
          if (sim.hayBursts.length > 0) {
            const latestBurst = sim.hayBursts[sim.hayBursts.length - 1];
            const age = sim.elapsedRaceTimeSec - latestBurst.createdAt;
            if (age >= 0 && age < 1.4) {
              strawPool.forEach((m, idx) => {
                m.visible = true;
                const ang = (idx / strawPool.length) * Math.PI * 2;
                const spread = (1.5 + (idx % 3) * 1.2) * age * 4.5;
                const h = Math.max(0.2, 1.2 + (8.5 - age * 14) * age + (idx % 4) * 0.4);
                courseToWorldUnits(
                  latestBurst.sFeet + Math.cos(ang) * spread,
                  latestBurst.lateralFeet + Math.sin(ang) * spread,
                  h,
                  m.position,
                  activeCourseId
                );
                m.rotation.set(age * 8 + idx, age * 6, idx);
              });
            }
          }

          // Render 3D Chassis & Drift Sparks
          const sparks = sparkPoolRef.current;
          if (sim.sparkIntensity > 0.05) {
            sparks.forEach((sMesh, idx) => {
              sMesh.visible = true;
              const side = idx % 2 === 0 ? -1 : 1;
              const jitter = Math.sin(tSec * 45 + idx * 2.1);
              courseToWorldUnits(
                sim.sFeet - 2.5 - (idx % 4) * 0.9,
                sim.lateralOffsetFeet + side * (1.8 + jitter * 0.4),
                0.22 + Math.abs(jitter) * 0.35,
                sMesh.position,
                activeCourseId
              );
              sMesh.rotation.y = -road.headingRad;
            });
          } else {
            sparks.forEach((sMesh) => {
              sMesh.visible = false;
            });
          }
        }

        // Speed-reactive FOV & Dynamic Follow Chase Camera
        const targetFov = 52 + Math.max(0, Math.min(38, sim.mph - 16)) * 0.26;
        if (Math.abs(camera.fov - targetFov) > 0.05) {
          camera.fov += (targetFov - camera.fov) * Math.min(1, rawDt * 6);
          camera.updateProjectionMatrix();
        }

        const camBackFeet = sim.phase === 'skit' ? 22 : 25;
        const camUpFeet = sim.phase === 'skit' ? 11 : 11.5;
        const rumbleShake =
          sim.onCobblestone && sim.speedFtS > 15
            ? Math.sin(tSec * 52) * 0.16 * (1 - metricsRef.current.roughTerrainRating * 0.75)
            : 0;

        courseToWorldUnits(
          sim.sFeet - camBackFeet,
          sim.lateralOffsetFeet * 0.55,
          camUpFeet + rumbleShake,
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

        const snapX = Math.round(tempCarWorldPos.x * 2) * 0.5;
        const snapY = Math.round(tempCarWorldPos.y * 2) * 0.5;
        const snapZ = Math.round(tempCarWorldPos.z * 2) * 0.5;
        if (snapX !== lastSnapX || snapY !== lastSnapY || snapZ !== lastSnapZ) {
          lastSnapX = snapX;
          lastSnapY = snapY;
          lastSnapZ = snapZ;
          sunLight.position.set(snapX + 14, snapY + 28, snapZ + 18);
          sunLight.target.position.set(snapX, snapY, snapZ);
          sunLight.target.updateMatrixWorld();
        }
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
      animate(performance.now());
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
      raceEnvRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 h-full w-full overflow-hidden"
    />
  );
});
