import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  CraftLoadout,
  PartCategory,
  RAMP_HEIGHT_FEET,
  RAMP_LENGTH_FEET,
  WORLD_RECORD_FEET,
} from '../builder/PartCatalog';
import { ComputedCraftMetrics } from '../physics/CraftMetrics';
import {
  createInitialFlightState,
  FlightSimulationState,
  getRollercoasterTrackProfile,
  getSoapboxTrackElevationFeet,
  stepFlightSimulation,
} from '../physics/AeroPhysicsEngine';
import { buildCraft3D, Craft3DGroups, disposeCraftObject3D } from './Craft3DBuilder';
import { soundEngine } from '../audio/SoundEngine';

interface FlugtagCanvas3DProps {
  mode: 'hangar' | 'flight';
  loadout: CraftLoadout;
  metrics: ComputedCraftMetrics;
  selectedCategory: PartCategory;
  windTunnelActive: boolean;
  paused?: boolean;
  flightStateRef: React.MutableRefObject<FlightSimulationState>;
  bestDistanceFeet: number;
  onSelectCategory?: (cat: PartCategory) => void;
  onFlightHudSync: (snapshot: FlightSimulationState) => void;
  onSplashdownComplete: (finalState: FlightSimulationState) => void;
}

// Scale factor: 1 Three.js world unit = 4 feet in flight scene so 30ft ramp = 7.5u high, 258ft record = 64.5u
const UNITS_PER_FOOT = 0.25;

const SOCKET_CATEGORIES: PartCategory[] = [
  'chassis',
  'wings',
  'tail',
  'nose',
  'topper',
  'trolley',
];

const CATEGORY_CAMERA_PRESETS: Record<PartCategory, { yaw: number; pitch: number; radius: number }> = {
  wings: { yaw: -0.58, pitch: 0.34, radius: 7.4 },
  topper: { yaw: -0.48, pitch: 0.38, radius: 6.4 },
  chassis: { yaw: -0.68, pitch: 0.28, radius: 6.8 },
  nose: { yaw: 0.48, pitch: 0.25, radius: 6.2 },
  tail: { yaw: -2.35, pitch: 0.3, radius: 6.5 },
  trolley: { yaw: -0.62, pitch: 0.16, radius: 6.4 },
};

export const FlugtagCanvas3D: React.FC<FlugtagCanvas3DProps> = React.memo(({
  mode,
  loadout,
  metrics,
  selectedCategory,
  windTunnelActive,
  paused = false,
  flightStateRef,
  bestDistanceFeet,
  onSelectCategory,
  onFlightHudSync,
  onSplashdownComplete,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const modeRef = useRef(mode);
  const metricsRef = useRef(metrics);
  const selectedCategoryRef = useRef(selectedCategory);
  const hoveredCategoryRef = useRef<PartCategory | null>(null);
  const windTunnelRef = useRef(windTunnelActive);
  const pausedRef = useRef(paused);
  const bestDistRef = useRef(bestDistanceFeet);
  const onSelectCategoryRef = useRef(onSelectCategory);
  const onFlightHudSyncRef = useRef(onFlightHudSync);
  const onSplashdownCompleteRef = useRef(onSplashdownComplete);
  const splashNotifiedRef = useRef(false);

  modeRef.current = mode;
  metricsRef.current = metrics;
  selectedCategoryRef.current = selectedCategory;
  windTunnelRef.current = windTunnelActive;
  pausedRef.current = paused;
  bestDistRef.current = bestDistanceFeet;
  onSelectCategoryRef.current = onSelectCategory;
  onFlightHudSyncRef.current = onFlightHudSync;
  onSplashdownCompleteRef.current = onSplashdownComplete;

  const craftGroupsRef = useRef<Craft3DGroups | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const orbitYawRef = useRef<number>(-0.58);
  const orbitPitchRef = useRef<number>(0.32);
  const orbitRadiusRef = useRef<number>(7.4);
  const snapBounceRef = useRef<number>(0);

  // Gently frame the selected attachment socket when switching categories in Hangar
  useEffect(() => {
    if (mode !== 'hangar') return;
    const preset = CATEGORY_CAMERA_PRESETS[selectedCategory];
    if (preset) {
      orbitYawRef.current = preset.yaw;
      orbitPitchRef.current = preset.pitch;
      orbitRadiusRef.current = preset.radius;
    }
  }, [selectedCategory, mode]);

  // Rebuild the 3D craft whenever loadout changes (on initial mount sceneRef.current is null so it skips duplicate build)
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (craftGroupsRef.current) {
      scene.remove(craftGroupsRef.current.root);
      disposeCraftObject3D(craftGroupsRef.current.root, false);
    }

    const built = buildCraft3D(loadout);
    scene.add(built.root);
    craftGroupsRef.current = built;
    snapBounceRef.current = 1.0; // Trigger bouncy scale pop on part change!
  }, [loadout]);

  useEffect(() => {
    if (mode === 'flight') {
      splashNotifiedRef.current = false;
      hoveredCategoryRef.current = null;
    }
  }, [mode]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Setup Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#38bdf8');
    scene.fog = new THREE.FogExp2('#7dd3fc', 0.0045);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      400
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 2. Lighting (Sunny Miami Bay Day)
    const hemiLight = new THREE.HemisphereLight('#ffffff', '#0284c7', 1.15);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight('#fffbeb', 1.65);
    sunLight.position.set(18, 35, 22);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 120;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.02;
    const initialD = 8.5;
    sunLight.shadow.camera.left = -initialD;
    sunLight.shadow.camera.right = initialD;
    sunLight.shadow.camera.top = initialD;
    sunLight.shadow.camera.bottom = -initialD;
    scene.add(sunLight);
    scene.add(sunLight.target);

    // 3. Build Hangar Workshop Environment Group
    const hangarEnv = new THREE.Group();
    scene.add(hangarEnv);

    // Circular Turntable Platform
    const turntable = new THREE.Mesh(
      new THREE.CylinderGeometry(4.6, 4.9, 0.35, 36),
      new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.5 })
    );
    turntable.position.y = -1.05;
    turntable.receiveShadow = true;
    hangarEnv.add(turntable);

    const turntableRing = new THREE.Mesh(
      new THREE.RingGeometry(4.1, 4.45, 36),
      new THREE.MeshBasicMaterial({ color: '#facc15', side: THREE.DoubleSide })
    );
    turntableRing.rotation.x = -Math.PI / 2;
    turntableRing.position.y = -0.86;
    hangarEnv.add(turntableRing);

    // Balance Seesaw Fulcrum Triangle under the craft in Hangar
    const fulcrum = new THREE.Mesh(
      new THREE.ConeGeometry(0.48, 0.72, 4),
      new THREE.MeshStandardMaterial({ color: '#f59e0b', roughness: 0.3 })
    );
    fulcrum.rotation.y = Math.PI / 4;
    fulcrum.position.set(0, -0.78, 0);
    hangarEnv.add(fulcrum);

    // 3D Center of Gravity (CoG) & Center of Lift / Balance Target (CoL) Gizmo in Hangar
    const balanceGizmoGroup = new THREE.Group();
    hangarEnv.add(balanceGizmoGroup);

    const cogMat = new THREE.MeshBasicMaterial({
      color: '#facc15',
      transparent: true,
      opacity: 0.85,
    });
    const colMat = new THREE.MeshBasicMaterial({
      color: '#22d3ee',
      transparent: true,
      opacity: 0.85,
    });

    const cogMarkerGroup = new THREE.Group();
    const cogPin = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.25, 8), cogMat);
    cogPin.position.y = 0.36;
    const cogSphereTop = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 14), cogMat);
    cogSphereTop.position.y = 1.5;
    const cogSphereBot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), cogMat);
    cogSphereBot.position.y = -0.68;
    cogMarkerGroup.add(cogPin, cogSphereTop, cogSphereBot);
    balanceGizmoGroup.add(cogMarkerGroup);

    const colMarkerGroup = new THREE.Group();
    const colPin = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 2.25, 8), colMat);
    colPin.position.y = 0.36;
    const colDiamondTop = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), colMat);
    colDiamondTop.position.y = 1.5;
    const colRingBot = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.2, 16).rotateX(-Math.PI / 2),
      colMat
    );
    colRingBot.position.y = -0.68;
    colMarkerGroup.add(colPin, colDiamondTop, colRingBot);
    balanceGizmoGroup.add(colMarkerGroup);

    // Giant Industrial Wind Tunnel Fan at +X = 5.2 in Hangar
    const fanHousing = new THREE.Group();
    fanHousing.position.set(5.2, 0.4, 0);
    const shroud = new THREE.Mesh(
      new THREE.CylinderGeometry(2.1, 2.1, 0.7, 24, 1, true),
      new THREE.MeshStandardMaterial({ color: '#ef4444', side: THREE.DoubleSide, roughness: 0.35 })
    );
    shroud.rotation.z = Math.PI / 2;
    fanHousing.add(shroud);

    const fanBlades = new THREE.Group();
    const bladeGeo = new THREE.BoxGeometry(0.1, 1.75, 0.38);
    const bladeMat = new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.3 });
    for (let i = 0; i < 6; i++) {
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.rotation.x = (i * Math.PI) / 3;
      fanBlades.add(blade);
    }
    fanHousing.add(fanBlades);
    hangarEnv.add(fanHousing);

    // Wind Tunnel Airflow Ribbons (visible when Wind Tunnel Fan is ON)
    const windRibbonsGroup = new THREE.Group();
    const windRibbons: THREE.Mesh[] = [];
    const ribbonGeo = new THREE.BoxGeometry(1.3, 0.05, 0.05);
    const ribbonMatCyan = new THREE.MeshBasicMaterial({
      color: '#38bdf8',
      transparent: true,
      opacity: 0.85,
    });
    const ribbonMatYellow = new THREE.MeshBasicMaterial({
      color: '#fde047',
      transparent: true,
      opacity: 0.85,
    });
    for (let i = 0; i < 18; i++) {
      const ribbon = new THREE.Mesh(ribbonGeo, i % 2 === 0 ? ribbonMatCyan : ribbonMatYellow);
      ribbon.position.set(
        4.2 - (i % 6) * 1.6,
        -0.2 + Math.floor(i / 6) * 0.85,
        ((i % 3) - 1) * 1.45
      );
      windRibbons.push(ribbon);
      windRibbonsGroup.add(ribbon);
    }
    hangarEnv.add(windRibbonsGroup);

    // 4. Build Multi-Competition Flight & Course Environment Group
    const bayEnv = new THREE.Group();
    scene.add(bayEnv);

    // Sparkling Ocean Water Plane (2 triangles — flat standard material needs no subdivisions)
    const waterGeo = new THREE.PlaneGeometry(360, 220, 1, 1);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshStandardMaterial({
      color: '#0284c7',
      roughness: 0.22,
      metalness: 0.15,
    });
    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.position.set(65, 0, 0);
    waterMesh.receiveShadow = true;
    bayEnv.add(waterMesh);

    // 30-Foot-High Flight Deck Pier (90 ft long -> from x = -22.5u to 0u, height = 7.5u)
    const rampHeightU = RAMP_HEIGHT_FEET * UNITS_PER_FOOT; // 7.5
    const rampLengthU = RAMP_LENGTH_FEET * UNITS_PER_FOOT; // 22.5

    const pierDeck = new THREE.Mesh(
      new THREE.BoxGeometry(rampLengthU, 0.5, 4.4),
      new THREE.MeshStandardMaterial({ color: '#1e3a8a', roughness: 0.6 })
    );
    pierDeck.position.set(-rampLengthU / 2, rampHeightU - 0.25, 0);
    pierDeck.receiveShadow = true;
    bayEnv.add(pierDeck);

    // Glowing Green "DROP TROLLEY / PUSH-OFF ZONE" on the last 22 ft (5.5u) of the ramp!
    const dropZoneStrip = new THREE.Mesh(
      new THREE.BoxGeometry(5.5, 0.54, 4.1),
      new THREE.MeshStandardMaterial({
        color: '#22c55e',
        emissive: '#15803d',
        emissiveIntensity: 0.45,
        roughness: 0.3,
      })
    );
    dropZoneStrip.position.set(-2.75, rampHeightU - 0.24, 0);
    bayEnv.add(dropZoneStrip);

    // Red & White Checkered Lip at x = 0
    const rampLip = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.58, 4.5),
      new THREE.MeshStandardMaterial({ color: '#ef4444', roughness: 0.3 })
    );
    rampLip.position.set(-0.3, rampHeightU - 0.23, 0);
    bayEnv.add(rampLip);

    // Pier Support Pillars down to the water (single InstancedMesh for all 8 pillars)
    const pillarGeo = new THREE.CylinderGeometry(0.28, 0.32, rampHeightU, 12);
    const pillarMat = new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.5 });
    const pierPillarInst = new THREE.InstancedMesh(pillarGeo, pillarMat, 8);
    const dummyObj = new THREE.Object3D();
    dummyObj.rotation.order = 'ZXY';
    let pillarIdx = 0;
    [-20, -14, -7, -0.8].forEach((px) => {
      [-1.7, 1.7].forEach((pz) => {
        dummyObj.position.set(px, rampHeightU / 2, pz);
        dummyObj.rotation.set(0, 0, 0);
        dummyObj.scale.set(1, 1, 1);
        dummyObj.updateMatrix();
        pierPillarInst.setMatrixAt(pillarIdx++, dummyObj.matrix);
      });
    });
    pierPillarInst.instanceMatrix.needsUpdate = true;
    bayEnv.add(pierPillarInst);

    // Iconic Red Bull Archway near the end of the Start Deck
    const archGroup = new THREE.Group();
    archGroup.position.set(-2.5, rampHeightU, 0);
    const archColGeo = new THREE.BoxGeometry(0.55, 4.2, 0.55);
    const archColMat = new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.3 });
    [-2.1, 2.1].forEach((z) => {
      const col = new THREE.Mesh(archColGeo, archColMat);
      col.position.set(0, 2.1, z);
      archGroup.add(col);
    });
    const topBeam = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.75, 4.8),
      new THREE.MeshStandardMaterial({ color: '#ef4444', roughness: 0.3 })
    );
    topBeam.position.set(0, 4.3, 0);
    archGroup.add(topBeam);
    bayEnv.add(archGroup);

    // --- 4A. FLUGTAG COURSE GROUP (Distance Buoys in the Bay) ---
    const flugtagCourseGroup = new THREE.Group();
    bayEnv.add(flugtagCourseGroup);

    const buoyDistances = [50, 100, 150, 200, WORLD_RECORD_FEET];
    const buoyGroups: THREE.Group[] = [];
    const buoyBaseGeo = new THREE.CylinderGeometry(0.65, 0.75, 0.5, 16);
    buoyDistances.forEach((distFt) => {
      const xU = distFt * UNITS_PER_FOOT;
      const isRecord = distFt === WORLD_RECORD_FEET;

      const laneLine = new THREE.Mesh(
        new THREE.BoxGeometry(isRecord ? 0.45 : 0.22, 0.08, 18),
        new THREE.MeshBasicMaterial({
          color: isRecord ? '#facc15' : '#38bdf8',
          transparent: true,
          opacity: isRecord ? 0.9 : 0.55,
        })
      );
      laneLine.position.set(xU, 0.04, 0);
      flugtagCourseGroup.add(laneLine);

      [-5.2, 5.2].forEach((z) => {
        const buoy = new THREE.Group();
        const base = new THREE.Mesh(
          buoyBaseGeo,
          new THREE.MeshStandardMaterial({
            color: isRecord ? '#facc15' : '#ef4444',
            roughness: 0.3,
          })
        );
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(0.5, isRecord ? 2.6 : 1.5, 16),
          new THREE.MeshStandardMaterial({
            color: isRecord ? '#eab308' : '#f8fafc',
            roughness: 0.3,
          })
        );
        cone.position.y = isRecord ? 1.4 : 0.9;
        buoy.add(base, cone);
        buoy.position.set(xU, 0.1, z);
        flugtagCourseGroup.add(buoy);
        buoyGroups.push(buoy);
      });
    });

    // --- 4B. SOAPBOX RACE COURSE GROUP (450-Ft Downhill Street, Chicanes & Kicker Ramps) ---
    // Uses InstancedMesh for the 32 road slabs + 64 alternating red/white curbs (3 draw calls total)
    const soapboxCourseGroup = new THREE.Group();
    soapboxCourseGroup.visible = false;
    bayEnv.add(soapboxCourseGroup);

    const roadMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.75 });
    const curbRedMat = new THREE.MeshStandardMaterial({ color: '#ef4444', roughness: 0.45 });
    const curbWhiteMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.45 });
    const segStepFt = 15;
    const sbSegCount = Math.floor(465 / segStepFt) + 1; // 32 road segments
    const roadSegGeo = new THREE.BoxGeometry(segStepFt * UNITS_PER_FOOT + 0.22, 0.4, 6.8);
    const curbGeo = new THREE.BoxGeometry(segStepFt * UNITS_PER_FOOT + 0.15, 0.55, 0.35);

    const roadSlabInst = new THREE.InstancedMesh(roadSegGeo, roadMat, sbSegCount);
    roadSlabInst.receiveShadow = true;
    const curbRedInst = new THREE.InstancedMesh(curbGeo, curbRedMat, sbSegCount);
    const curbWhiteInst = new THREE.InstancedMesh(curbGeo, curbWhiteMat, sbSegCount);
    let redCurbIdx = 0;
    let whiteCurbIdx = 0;

    for (let i = 0; i < sbSegCount; i++) {
      const xFt = i * segStepFt;
      const midFt = xFt + segStepFt * 0.5;
      const elev = getSoapboxTrackElevationFeet(midFt);
      const xU = midFt * UNITS_PER_FOOT;
      const yU = elev.yFeet * UNITS_PER_FOOT - 0.2;
      const slopeRad = (elev.slopeDeg * Math.PI) / 180;

      dummyObj.position.set(xU, yU, 0);
      dummyObj.rotation.set(0, 0, slopeRad);
      dummyObj.scale.set(1, 1, 1);
      dummyObj.updateMatrix();
      roadSlabInst.setMatrixAt(i, dummyObj.matrix);

      const isEven = i % 2 === 0;
      for (const cz of [-3.45, 3.45]) {
        dummyObj.position.set(xU, yU + 0.12, cz);
        dummyObj.updateMatrix();
        if (isEven) {
          curbRedInst.setMatrixAt(redCurbIdx++, dummyObj.matrix);
        } else {
          curbWhiteInst.setMatrixAt(whiteCurbIdx++, dummyObj.matrix);
        }
      }
    }
    roadSlabInst.instanceMatrix.needsUpdate = true;
    curbRedInst.instanceMatrix.needsUpdate = true;
    curbWhiteInst.instanceMatrix.needsUpdate = true;
    soapboxCourseGroup.add(roadSlabInst, curbRedInst, curbWhiteInst);

    // Hay-Bale Chicanes & Wooden Kicker Ramps along the Soapbox Hill
    const hayMat = new THREE.MeshStandardMaterial({ color: '#eab308', roughness: 0.85 });
    const rampMat = new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.45 });
    const sbTemplate = createInitialFlightState('soapbox').soapboxObstacles;
    sbTemplate.forEach((obs) => {
      const elev = getSoapboxTrackElevationFeet(obs.xFeet);
      const ox = obs.xFeet * UNITS_PER_FOOT;
      const oy = elev.yFeet * UNITS_PER_FOOT;
      const oz = obs.zFeet * UNITS_PER_FOOT;

      if (obs.type === 'hay_bale') {
        const bale = new THREE.Mesh(
          new THREE.BoxGeometry(1.1, 0.95, obs.halfWidthFeet * UNITS_PER_FOOT * 1.75),
          hayMat
        );
        bale.position.set(ox, oy + 0.48, oz);
        soapboxCourseGroup.add(bale);
      } else {
        const kicker = new THREE.Mesh(
          new THREE.BoxGeometry(2.4, 0.45, obs.halfWidthFeet * UNITS_PER_FOOT * 1.6),
          rampMat
        );
        kicker.position.set(ox, oy + 0.16, oz);
        kicker.rotation.z = 0.22;
        soapboxCourseGroup.add(kicker);
      }
    });

    // 450-Ft Soapbox Finish Line Arch
    const sbFinishElev = getSoapboxTrackElevationFeet(450).yFeet * UNITS_PER_FOOT;
    const sbFinishArch = archGroup.clone();
    sbFinishArch.position.set(450 * UNITS_PER_FOOT, sbFinishElev, 0);
    soapboxCourseGroup.add(sbFinishArch);

    // --- 4C. TANDEM ROLLERCOASTER COURSE GROUP (320-Ft Floating Canal Coaster Track & Bells) ---
    // Uses InstancedMesh at 4-ft intervals for smooth camelbacks, center balance guide stripe, and 4 draw calls total!
    const coasterCourseGroup = new THREE.Group();
    coasterCourseGroup.visible = false;
    bayEnv.add(coasterCourseGroup);

    const railBeamMat = new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.3, metalness: 0.4 });
    const centerStripeMat = new THREE.MeshBasicMaterial({ color: '#38bdf8' });
    const railTieMat = new THREE.MeshStandardMaterial({ color: '#ef4444', roughness: 0.4 });
    const rcStepFt = 4;
    const rcSegCount = Math.floor(328 / rcStepFt) + 1; // 83 segments
    const rcPostCount = Math.floor(328 / 32) + 1;      // 11 support pilings

    const railSegGeo = new THREE.BoxGeometry(rcStepFt * UNITS_PER_FOOT + 0.12, 0.24, 1.35);
    const centerStripeGeo = new THREE.BoxGeometry(rcStepFt * UNITS_PER_FOOT + 0.14, 0.255, 0.18);
    const tieGeo = new THREE.BoxGeometry(0.28, 0.3, 1.68);
    const unitPostGeo = new THREE.CylinderGeometry(0.18, 0.22, 1, 10);

    const railBeamInst = new THREE.InstancedMesh(railSegGeo, railBeamMat, rcSegCount);
    railBeamInst.receiveShadow = true;
    const centerStripeInst = new THREE.InstancedMesh(centerStripeGeo, centerStripeMat, rcSegCount);
    const tieInst = new THREE.InstancedMesh(tieGeo, railTieMat, rcSegCount);
    const postInst = new THREE.InstancedMesh(unitPostGeo, pillarMat, rcPostCount);

    let postIdx = 0;

    for (let i = 0; i < rcSegCount; i++) {
      const xFt = i * rcStepFt;
      const midFt = xFt + rcStepFt * 0.5;
      const prof = getRollercoasterTrackProfile(midFt);
      const xU = midFt * UNITS_PER_FOOT;
      const yU = prof.yFeet * UNITS_PER_FOOT - 0.12;
      const slopeRad = (prof.slopeDeg * Math.PI) / 180;
      const bankRad = (prof.targetLeanDeg * Math.PI) / 180;

      dummyObj.position.set(xU, yU, 0);
      dummyObj.rotation.set(bankRad, 0, slopeRad);
      dummyObj.scale.set(1, 1, 1);
      dummyObj.updateMatrix();
      railBeamInst.setMatrixAt(i, dummyObj.matrix);
      centerStripeInst.setMatrixAt(i, dummyObj.matrix);

      dummyObj.position.set(xU, yU + 0.03, 0);
      dummyObj.updateMatrix();
      tieInst.setMatrixAt(i, dummyObj.matrix);

      if (xFt % 32 === 0 && postIdx < rcPostCount) {
        const postH = Math.max(0.2, yU - 0.16);
        dummyObj.position.set(xU, postH * 0.5, 0);
        dummyObj.rotation.set(0, 0, 0);
        dummyObj.scale.set(1, postH, 1);
        dummyObj.updateMatrix();
        postInst.setMatrixAt(postIdx++, dummyObj.matrix);
      }
    }
    railBeamInst.instanceMatrix.needsUpdate = true;
    centerStripeInst.instanceMatrix.needsUpdate = true;
    tieInst.instanceMatrix.needsUpdate = true;
    postInst.instanceMatrix.needsUpdate = true;
    coasterCourseGroup.add(railBeamInst, centerStripeInst, tieInst, postInst);

    // 320-Ft Grand Canal Bell Finish Platform
    const rcFinishY = getRollercoasterTrackProfile(320).yFeet * UNITS_PER_FOOT;
    const rcFinishArch = archGroup.clone();
    rcFinishArch.position.set(320 * UNITS_PER_FOOT, rcFinishY, 0);
    const grandBellMat = new THREE.MeshStandardMaterial({
      color: '#facc15',
      roughness: 0.15,
      metalness: 0.85,
    });
    const grandBell = new THREE.Group();
    grandBell.position.set(0, 3.85, 0);
    const grandBellCone = new THREE.Mesh(new THREE.ConeGeometry(0.65, 0.9, 16), grandBellMat);
    grandBellCone.position.y = -0.45;
    const grandBellClapper = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 12),
      new THREE.MeshStandardMaterial({ color: '#d97706', roughness: 0.25, metalness: 0.8 })
    );
    grandBellClapper.position.y = -0.92;
    grandBell.add(grandBellCone, grandBellClapper);
    rcFinishArch.add(grandBell);
    coasterCourseGroup.add(rcFinishArch);

    // Personal Best (PB) 3D Water Line & Emerald Buoys
    const pbMarkerGroup = new THREE.Group();
    const pbLineMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.09, 18),
      new THREE.MeshBasicMaterial({
        color: '#34d399',
        transparent: true,
        opacity: 0.85,
      })
    );
    pbLineMesh.position.set(0, 0.05, 0);
    pbMarkerGroup.add(pbLineMesh);
    [-6.1, 6.1].forEach((z) => {
      const pbBuoy = new THREE.Mesh(
        new THREE.ConeGeometry(0.42, 1.8, 12),
        new THREE.MeshStandardMaterial({
          color: '#10b981',
          emissive: '#059669',
          emissiveIntensity: 0.45,
          roughness: 0.25,
        })
      );
      pbBuoy.position.set(0, 0.9, z);
      pbMarkerGroup.add(pbBuoy);
    });
    pbMarkerGroup.visible = false;
    bayEnv.add(pbMarkerGroup);

    // 3D Aerodynamic Wingtip Streamer Trails (Visible during Airborne Glide)
    const wingTrailGroup = new THREE.Group();
    const wingTrailMat = new THREE.MeshBasicMaterial({
      color: '#34d399',
      transparent: true,
      opacity: 0.72,
    });
    const trailGeo = new THREE.BoxGeometry(2.6, 0.06, 0.08);
    [-1.85, 1.85].forEach((z) => {
      const trail = new THREE.Mesh(trailGeo, wingTrailMat);
      trail.position.set(-1.5, 0.45, z);
      wingTrailGroup.add(trail);
    });
    wingTrailGroup.visible = false;
    bayEnv.add(wingTrailGroup);

    // Floating Thermal Wind Rings (Flugtag / Soapbox) & 3D Hanging Canal Bells (Tandem Rollercoaster)
    const thermalTargets: Array<{
      group: THREE.Group;
      torus: THREE.Mesh;
      bellGroup: THREE.Group;
      bellPivot: THREE.Group;
    }> = [];
    const initialRings = flightStateRef.current.thermalRings;
    const thermalMat = new THREE.MeshStandardMaterial({
      color: '#fde047',
      emissive: '#f59e0b',
      emissiveIntensity: 0.6,
      roughness: 0.2,
    });
    const unitTorusGeo = new THREE.TorusGeometry(1, 0.14, 12, 28);
    const canalBellConeGeo = new THREE.ConeGeometry(0.46, 0.68, 16);
    const canalClapperGeo = new THREE.SphereGeometry(0.13, 10, 10);
    const gantryBeamGeo = new THREE.BoxGeometry(0.16, 0.16, 2.5);
    const gantryPostGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.3, 8);
    const gantryMat = new THREE.MeshStandardMaterial({ color: '#ef4444', roughness: 0.35 });

    initialRings.forEach((r) => {
      const targetGroup = new THREE.Group();
      targetGroup.position.set(
        r.xFeet * UNITS_PER_FOOT,
        r.yFeet * UNITS_PER_FOOT,
        (r.zFeet ?? 0) * UNITS_PER_FOOT
      );

      const torus = new THREE.Mesh(unitTorusGeo, thermalMat);
      torus.rotation.y = Math.PI / 2;
      const ringScale = r.radiusFeet * UNITS_PER_FOOT * 0.55;
      torus.scale.set(ringScale, ringScale, 1);
      targetGroup.add(torus);

      // 3D Hanging Brass Canal Bell + Support Gantry for Tandem Rollercoaster
      const bellGroup = new THREE.Group();
      bellGroup.visible = false;
      const crossBeam = new THREE.Mesh(gantryBeamGeo, gantryMat);
      crossBeam.position.set(0, 0.52, 0);
      bellGroup.add(crossBeam);
      [-1.12, 1.12].forEach((gz) => {
        const sidePost = new THREE.Mesh(gantryPostGeo, gantryMat);
        sidePost.position.set(0, -0.58, gz);
        bellGroup.add(sidePost);
      });

      const bellPivot = new THREE.Group();
      bellPivot.position.set(0, 0.44, 0);
      const bellMesh = new THREE.Mesh(canalBellConeGeo, grandBellMat);
      bellMesh.position.y = -0.34;
      const clapperMesh = new THREE.Mesh(canalClapperGeo, thermalMat);
      clapperMesh.position.y = -0.68;
      bellPivot.add(bellMesh, clapperMesh);
      bellGroup.add(bellPivot);

      targetGroup.add(bellGroup);
      bayEnv.add(targetGroup);
      thermalTargets.push({ group: targetGroup, torus, bellGroup, bellPivot });
    });

    // Water Splash Droplet Particles + Expanding Foam Ripple Rings
    const splashGroup = new THREE.Group();
    splashGroup.visible = false;
    const splashDrops: Array<{ mesh: THREE.Mesh; vx: number; vy: number; vz: number }> = [];
    const dropGeo = new THREE.SphereGeometry(0.2, 8, 8);
    const dropMat = new THREE.MeshBasicMaterial({ color: '#f0f9ff' });
    for (let i = 0; i < 36; i++) {
      const m = new THREE.Mesh(dropGeo, dropMat);
      m.visible = false;
      splashGroup.add(m);
      splashDrops.push({ mesh: m, vx: 0, vy: 0, vz: 0 });
    }

    const foamRings: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const ringGeo = new THREE.RingGeometry(0.7 + i * 0.45, 1.05 + i * 0.5, 32);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.visible = false;
      splashGroup.add(ringMesh);
      foamRings.push(ringMesh);
    }
    bayEnv.add(splashGroup);

    // Build initial Craft 3D
    const initialCraft = buildCraft3D(loadout);
    scene.add(initialCraft.root);
    craftGroupsRef.current = initialCraft;

    // 5. Pointer Orbit, Pinch/Wheel Zoom & 3D Socket Raycast Handler for Hangar Mode
    let isDragging = false;
    let downX = 0;
    let downY = 0;
    let prevX = 0;
    let prevY = 0;
    const activePointers = new Map<number, { x: number; y: number }>();
    let prevPinchDist = 0;
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();

    const getPinchDistance = (): number => {
      const it = activePointers.values();
      const p0 = it.next().value;
      const p1 = it.next().value;
      if (!p0 || !p1) return 0;
      return Math.hypot(p0.x - p1.x, p0.y - p1.y);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (modeRef.current !== 'hangar') return;
      if (hoveredCategoryRef.current) {
        hoveredCategoryRef.current = null;
        container.style.cursor = '';
      }
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePointers.size === 2) {
        prevPinchDist = getPinchDistance();
        isDragging = false;
        return;
      }
      isDragging = true;
      downX = e.clientX;
      downY = e.clientY;
      prevX = e.clientX;
      prevY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (modeRef.current !== 'hangar') return;
      const existing = activePointers.get(e.pointerId);
      if (existing) {
        existing.x = e.clientX;
        existing.y = e.clientY;
      }
      if (activePointers.size === 2) {
        const dist = getPinchDistance();
        if (prevPinchDist > 0) {
          const delta = prevPinchDist - dist;
          orbitRadiusRef.current = Math.max(4.4, Math.min(11.2, orbitRadiusRef.current + delta * 0.018));
        }
        prevPinchDist = dist;
        return;
      }
      if (!isDragging) {
        if (activePointers.size === 0 && craftGroupsRef.current) {
          const rect = renderer.domElement.getBoundingClientRect();
          pointerNdc.x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
          pointerNdc.y = -((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
          raycaster.setFromCamera(pointerNdc, camera);
          const hits = raycaster.intersectObjects(craftGroupsRef.current.socketMarkerList, false);
          const hitCat =
            hits.length > 0
              ? (hits[0].object.userData?.category as PartCategory | undefined) ?? null
              : null;
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
      orbitPitchRef.current = Math.max(0.08, Math.min(0.85, orbitPitchRef.current + dy * 0.006));
    };

    const onPointerUp = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
      if (activePointers.size < 2) {
        prevPinchDist = 0;
      }
      if (isDragging && modeRef.current === 'hangar' && craftGroupsRef.current) {
        const moveDist = Math.hypot(e.clientX - downX, e.clientY - downY);
        if (moveDist < 6 && onSelectCategoryRef.current) {
          const rect = renderer.domElement.getBoundingClientRect();
          pointerNdc.x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
          pointerNdc.y = -((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
          raycaster.setFromCamera(pointerNdc, camera);
          const hits = raycaster.intersectObjects(craftGroupsRef.current.socketMarkerList, false);
          if (hits.length > 0) {
            const cat = hits[0].object.userData?.category as PartCategory | undefined;
            if (cat) {
              soundEngine.playSnapPop();
              onSelectCategoryRef.current(cat);
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
      if (modeRef.current !== 'hangar') return;
      e.preventDefault();
      orbitRadiusRef.current = Math.max(
        4.4,
        Math.min(11.2, orbitRadiusRef.current + e.deltaY * 0.004)
      );
    };

    const domEl = renderer.domElement;
    domEl.addEventListener('pointerdown', onPointerDown);
    domEl.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);

    // 6. Resize Handler + ResizeObserver (Essential for Razr Foldable fold/unfold & orientation changes!)
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.fov = w / h > 1.9 ? 44 : w < 520 ? 58 : 50;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
    resizeObserver?.observe(container);

    // 7. Main 60Hz Animation & Physics Loop (Zero per-frame allocations)
    let lastTime = performance.now();
    let hudTimer = 0;
    let rafId = 0;
    let prevMode: 'hangar' | 'flight' = modeRef.current;
    let windTunnelBaseY = 0.05;
    let partsNeedReset = true;

    let lastHudPhase = '';
    let lastHudPitchZone = '';
    let lastHudStalling = false;
    let lastHudInDropZone = false;
    let lastHudTrolleyDetached = false;
    let lastHudReleaseQuality = '';
    let lastHudWindWarning = '';
    let lastHudThermals = -1;
    let lastHudObstacles = -1;
    let lastHudPilotInput = 0;
    let lastHudCompleted = false;

    const smoothedLookAt = new THREE.Vector3(0, 0.35, 0);
    const desiredCamPos = new THREE.Vector3();
    const desiredLookAt = new THREE.Vector3();

    const updateShadowBounds = (d: number) => {
      sunLight.shadow.camera.left = -d;
      sunLight.shadow.camera.right = d;
      sunLight.shadow.camera.top = d;
      sunLight.shadow.camera.bottom = -d;
      sunLight.shadow.camera.updateProjectionMatrix();
    };

    const animate = (now: number) => {
      rafId = requestAnimationFrame(animate);
      if (pausedRef.current) {
        lastTime = now;
        return;
      }
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const elapsedSec = now * 0.001;

      const craft = craftGroupsRef.current;
      const currentMode = modeRef.current;
      const curMetrics = metricsRef.current;

      hangarEnv.visible = currentMode === 'hangar';
      bayEnv.visible = currentMode === 'flight';

      if (!craft) return;

      // Handle clean mode transitions (camera framing & shadow frustum tuning)
      if (currentMode !== prevMode) {
        prevMode = currentMode;
        partsNeedReset = true;
        if (currentMode === 'hangar') {
          updateShadowBounds(8.5);
          sunLight.position.set(10, 22, 14);
          sunLight.target.position.set(0, 0, 0);
          sunLight.target.updateMatrixWorld();
          for (const cat of SOCKET_CATEGORIES) {
            craft.socketMarkers[cat].visible = true;
          }
          const r = orbitRadiusRef.current;
          camera.position.set(
            Math.sin(orbitYawRef.current) * Math.cos(orbitPitchRef.current) * r,
            Math.sin(orbitPitchRef.current) * r + 0.5,
            Math.cos(orbitYawRef.current) * Math.cos(orbitPitchRef.current) * r
          );
          smoothedLookAt.set(0, 0.35, 0);
        } else {
          container.style.cursor = '';
          updateShadowBounds(14);
          for (const cat of SOCKET_CATEGORIES) {
            craft.socketMarkers[cat].visible = false;
          }
          const sim = flightStateRef.current;
          const startXU = sim.xFeet * UNITS_PER_FOOT;
          const startYU =
            sim.yFeet * UNITS_PER_FOOT + (sim.competition === 'rollercoaster' ? 0.84 : 0.52);
          camera.position.set(startXU + 7.5, startYU + 3.2, 8.5);
          smoothedLookAt.set(startXU - 0.5, startYU + 0.5, 0);
        }
      }

      // Spring bounce when snapping a new part
      if (snapBounceRef.current > 0.01) {
        snapBounceRef.current *= Math.pow(0.04, dt);
        const s = 1 + Math.sin(snapBounceRef.current * Math.PI * 3) * 0.1 * snapBounceRef.current;
        craft.airframeGroup.scale.set(s, s, s);
      } else {
        craft.airframeGroup.scale.set(1, 1, 1);
      }

      if (currentMode === 'hangar') {
        // HANGAR MODE
        craft.root.position.set(0, 0, 0);
        craft.crewGroup.visible = false;
        craft.trolleyGroup.visible = true;
        craft.pilotGroup.rotation.set(0, 0, 0);

        if (partsNeedReset) {
          partsNeedReset = false;
          craft.trolleyGroup.position.set(0, 0, 0);
          craft.trolleyGroup.rotation.set(0, 0, 0);
          craft.wingsGroup.position.set(0, 0, 0);
          craft.wingsGroup.rotation.set(0, 0, 0);
          craft.tailGroup.position.set(0, 0, 0);
          craft.tailGroup.rotation.set(0, 0, 0);
          craft.noseGroup.position.set(0, 0, 0);
          craft.noseGroup.rotation.set(0, 0, 0);
          craft.topperGroup.position.set(0, 0, 0);
          craft.topperGroup.rotation.set(0, 0, 0);
        }

        // Highlight active and hovered category socket markers
        const activeCat = selectedCategoryRef.current;
        const hoveredCat = hoveredCategoryRef.current;
        for (const cat of SOCKET_CATEGORIES) {
          const marker = craft.socketMarkers[cat];
          marker.visible = true;
          const isSelected = cat === activeCat;
          const isHovered = cat === hoveredCat;
          const scalePulse = isSelected
            ? (isHovered ? 1.38 : 1.25) + Math.sin(elapsedSec * 6) * 0.2
            : isHovered
            ? 1.18 + Math.sin(elapsedSec * 8) * 0.12
            : 0.85;
          marker.scale.set(scalePulse, scalePulse, scalePulse);
          const ringMat = marker.material as THREE.MeshBasicMaterial;
          if (ringMat) {
            ringMat.opacity = isSelected || isHovered ? 1.0 : 0.78;
          }
        }

        const chassisId = curMetrics.parts.chassis.id;
        const isSoapbox = chassisId.startsWith('sb_');
        const isRollercoaster = chassisId.startsWith('rc_');
        const dampFactor = 1 - Math.exp(-7.5 * dt);

        const fanOn = windTunnelRef.current;
        windRibbonsGroup.visible = fanOn && !isSoapbox && !isRollercoaster;
        fanBlades.rotation.x += (fanOn && !isSoapbox && !isRollercoaster ? 18 : 1.2) * dt;

        // Animate 3D CoG (amber sphere/pin) & CoL / Balance Target (cyan diamond/pin) Gizmo
        const targetBalanceX = isSoapbox || isRollercoaster ? 0.04 : curMetrics.acX;
        cogMarkerGroup.position.x = THREE.MathUtils.lerp(
          cogMarkerGroup.position.x,
          curMetrics.cgX,
          dampFactor
        );
        colMarkerGroup.position.x = THREE.MathUtils.lerp(
          colMarkerGroup.position.x,
          targetBalanceX,
          dampFactor
        );
        colDiamondTop.rotation.y += 1.8 * dt;
        const gizmoOpacity = fanOn ? 0.92 : 0.52;
        cogMat.opacity = gizmoOpacity;
        colMat.opacity = gizmoOpacity;

        if (craft.propSpinner) {
          craft.propSpinner.rotation.x += (fanOn ? 16 : 2) * dt;
        }
        if (fanOn && craft.wheelSpinners.length > 0) {
          for (let i = 0; i < craft.wheelSpinners.length; i++) {
            craft.wheelSpinners[i].rotation.z -= 11 * dt;
          }
        }

        if (fanOn) {
          if (windRibbonsGroup.visible) {
            for (const r of windRibbons) {
              r.position.x -= 11 * dt;
              if (r.position.x < -4.2) {
                r.position.x = 4.5;
              }
            }
          }
          const targetPitchRad = (curMetrics.seesawTiltDeg * Math.PI) / 180;
          if (isSoapbox) {
            // Soapbox Dyno Test: suspension bounce + steering roll oscillation with wheels attached!
            windTunnelBaseY = THREE.MathUtils.lerp(windTunnelBaseY, 0.06, dampFactor);
            const bounceY = windTunnelBaseY + Math.sin(elapsedSec * 14) * 0.035;
            const rollRad = Math.sin(elapsedSec * 3.8) * 0.14;
            craft.airframeGroup.position.y = bounceY;
            craft.airframeGroup.rotation.order = 'ZXY';
            craft.airframeGroup.rotation.set(
              rollRad,
              0,
              THREE.MathUtils.lerp(craft.airframeGroup.rotation.z, targetPitchRad * 0.5, dampFactor)
            );
            craft.trolleyGroup.position.y = windTunnelBaseY + Math.sin(elapsedSec * 28) * 0.012;
            craft.trolleyGroup.rotation.order = 'ZXY';
            craft.trolleyGroup.rotation.set(rollRad * 0.5, 0, craft.airframeGroup.rotation.z);
          } else if (isRollercoaster) {
            // Tandem Rollercoaster Rollers Test: 3D rail balance lean preview with wheels attached!
            windTunnelBaseY = THREE.MathUtils.lerp(windTunnelBaseY, 0.05, dampFactor);
            const leanPreviewRad = Math.sin(elapsedSec * 2.8) * 0.24;
            craft.airframeGroup.position.y = windTunnelBaseY + Math.sin(elapsedSec * 10) * 0.018;
            craft.airframeGroup.rotation.order = 'ZXY';
            craft.airframeGroup.rotation.set(
              leanPreviewRad,
              0,
              THREE.MathUtils.lerp(craft.airframeGroup.rotation.z, targetPitchRad * 0.4, dampFactor)
            );
            craft.trolleyGroup.position.y = craft.airframeGroup.position.y;
            craft.trolleyGroup.rotation.order = 'ZXY';
            craft.trolleyGroup.rotation.set(leanPreviewRad, 0, craft.airframeGroup.rotation.z);
          } else {
            // Flugtag Aerodynamic Wind Tunnel: glider lifts off its launch trolley!
            const targetLiftY = ((curMetrics.liftScore - curMetrics.weightScore * 0.65) / 100) * 0.85;
            windTunnelBaseY = THREE.MathUtils.lerp(
              windTunnelBaseY,
              Math.max(-0.15, targetLiftY),
              dampFactor
            );
            craft.airframeGroup.position.y = windTunnelBaseY + Math.sin(elapsedSec * 5) * 0.045;
            craft.airframeGroup.rotation.x = 0;
            craft.airframeGroup.rotation.y = 0;
            craft.airframeGroup.rotation.z = THREE.MathUtils.lerp(
              craft.airframeGroup.rotation.z,
              targetPitchRad,
              dampFactor
            );
            craft.trolleyGroup.position.set(0, 0, 0);
            craft.trolleyGroup.rotation.set(0, 0, 0);
          }
        } else {
          const gentleTiltRad = ((curMetrics.seesawTiltDeg * 0.35) * Math.PI) / 180;
          windTunnelBaseY = THREE.MathUtils.lerp(windTunnelBaseY, 0.05, dampFactor);
          craft.airframeGroup.position.y = windTunnelBaseY;
          craft.airframeGroup.rotation.x = THREE.MathUtils.lerp(
            craft.airframeGroup.rotation.x,
            0,
            dampFactor
          );
          craft.airframeGroup.rotation.y = 0;
          craft.airframeGroup.rotation.z = THREE.MathUtils.lerp(
            craft.airframeGroup.rotation.z,
            gentleTiltRad,
            dampFactor
          );
          if (isSoapbox || isRollercoaster) {
            craft.trolleyGroup.position.y = craft.airframeGroup.position.y;
            craft.trolleyGroup.rotation.set(
              craft.airframeGroup.rotation.x,
              0,
              craft.airframeGroup.rotation.z
            );
          } else {
            craft.trolleyGroup.position.set(0, 0, 0);
            craft.trolleyGroup.rotation.set(0, 0, 0);
          }
        }

        const radius = orbitRadiusRef.current;
        const camX = Math.sin(orbitYawRef.current) * Math.cos(orbitPitchRef.current) * radius;
        const camY = Math.sin(orbitPitchRef.current) * radius + 0.5;
        const camZ = Math.cos(orbitYawRef.current) * Math.cos(orbitPitchRef.current) * radius;
        const camDamp = 1 - Math.exp(-11 * dt);
        desiredCamPos.set(camX, camY, camZ);
        desiredLookAt.set(0, 0.35, 0);
        camera.position.lerp(desiredCamPos, camDamp);
        smoothedLookAt.lerp(desiredLookAt, camDamp);
        camera.lookAt(smoothedLookAt);
      } else {
        // FLIGHT / COURSE MODE
        const sim = flightStateRef.current;
        if (sim.phase !== 'splashdown') {
          splashNotifiedRef.current = false;
        }
        const prevPhase = sim.phase;
        const events = stepFlightSimulation(sim, curMetrics, dt, bestDistRef.current);

        flugtagCourseGroup.visible = sim.competition === 'flugtag';
        soapboxCourseGroup.visible = sim.competition === 'soapbox';
        coasterCourseGroup.visible = sim.competition === 'rollercoaster';

        if (events.justLaunchedOffRamp) {
          soundEngine.playAirhorn();
        }
        if (events.justCollectedThermal) {
          if (sim.competition === 'rollercoaster') {
            soundEngine.playCanalBell(false);
          } else {
            soundEngine.playThermalChime();
          }
        }
        if (events.justSplashedDown) {
          const isDryCourseFinish =
            (sim.competition === 'soapbox' || sim.competition === 'rollercoaster') &&
            sim.completedCourse;
          const isWaterImpact =
            sim.competition === 'flugtag' ||
            (sim.competition === 'rollercoaster' && !sim.completedCourse);

          if (sim.competition === 'rollercoaster' && sim.completedCourse) {
            soundEngine.playCanalBell(true);
          } else if (isDryCourseFinish) {
            soundEngine.playAirhorn();
          } else {
            soundEngine.playSplash(sim.splashIntensity);
          }
          splashGroup.visible = isWaterImpact;
          if (isWaterImpact) {
            const impactXU = sim.impactXFeet * UNITS_PER_FOOT;
            const impactZU = sim.lateralZFeet * UNITS_PER_FOOT;
            const forwardMomentum = sim.vxFeet * UNITS_PER_FOOT * 0.22;
            splashDrops.forEach((d, idx) => {
              d.mesh.visible = true;
              d.mesh.position.set(impactXU, 0.25, impactZU);
              d.mesh.scale.set(1, 1, 1);
              const ang = (idx / splashDrops.length) * Math.PI * 2;
              const spd = 2.0 + (idx % 5) * 1.1;
              d.vx = Math.cos(ang) * spd + forwardMomentum;
              d.vy = 5.0 + (sim.splashIntensity / 100) * 5.8 + (idx % 4) * 1.2;
              d.vz = Math.sin(ang) * spd;
            });
            foamRings.forEach((ring) => {
              ring.visible = true;
              ring.position.set(impactXU, 0.06, impactZU);
              ring.scale.set(0.4, 0.4, 0.4);
              (ring.material as THREE.MeshBasicMaterial).opacity = 0.85;
            });
          }
        }

        if (
          sim.phase === 'splashdown' &&
          sim.phaseTime >= 1.75 &&
          !splashNotifiedRef.current
        ) {
          splashNotifiedRef.current = true;
          onSplashdownCompleteRef.current({ ...sim });
        }

        hudTimer += dt;
        const discreteChanged =
          prevPhase !== sim.phase ||
          lastHudPhase !== sim.phase ||
          lastHudPitchZone !== sim.pitchZone ||
          lastHudStalling !== sim.isStalling ||
          lastHudInDropZone !== sim.inTrolleyDropZone ||
          lastHudTrolleyDetached !== sim.trolleyDetached ||
          lastHudReleaseQuality !== sim.trolleyReleaseQuality ||
          lastHudWindWarning !== sim.windGustWarning ||
          lastHudThermals !== sim.thermalsCollected ||
          lastHudObstacles !== sim.obstaclesHit ||
          lastHudPilotInput !== sim.pilotPitchInput ||
          lastHudCompleted !== sim.completedCourse;

        if (
          !splashNotifiedRef.current &&
          (discreteChanged ||
            events.justSplashedDown ||
            events.justCollectedThermal ||
            (hudTimer >= 0.12 && sim.phase !== 'splashdown'))
        ) {
          hudTimer = 0;
          lastHudPhase = sim.phase;
          lastHudPitchZone = sim.pitchZone;
          lastHudStalling = sim.isStalling;
          lastHudInDropZone = sim.inTrolleyDropZone;
          lastHudTrolleyDetached = sim.trolleyDetached;
          lastHudReleaseQuality = sim.trolleyReleaseQuality;
          lastHudWindWarning = sim.windGustWarning;
          lastHudThermals = sim.thermalsCollected;
          lastHudObstacles = sim.obstaclesHit;
          lastHudPilotInput = sim.pilotPitchInput;
          lastHudCompleted = sim.completedCourse;
          onFlightHudSyncRef.current({ ...sim });
        }

        // Update Personal Best 3D marker line on the water
        if (bestDistRef.current > 5 && sim.competition === 'flugtag') {
          pbMarkerGroup.visible = true;
          pbMarkerGroup.position.x = bestDistRef.current * UNITS_PER_FOOT;
        } else {
          pbMarkerGroup.visible = false;
        }

        // Gentle buoy bobbing on the bay
        if (sim.competition === 'flugtag') {
          for (let i = 0; i < buoyGroups.length; i++) {
            buoyGroups[i].position.y = 0.1 + Math.sin(elapsedSec * 2.4 + i) * 0.06;
          }
        }

        // Position Craft in 3D World & Follow with Directional Sun Shadow Frustum
        // Tandem Coaster wheels have tire contact at -0.84u in local space (vs -0.52u for Flugtag/Soapbox)
        const isCoasterOnRail =
          sim.competition === 'rollercoaster' &&
          (sim.phase !== 'splashdown' || sim.completedCourse || sim.yFeet > 0.35);
        const heightOffsetU = isCoasterOnRail ? 0.84 : 0.52;
        const craftXU = sim.xFeet * UNITS_PER_FOOT;
        const craftYU = sim.yFeet * UNITS_PER_FOOT + heightOffsetU;
        const craftZU = sim.lateralZFeet * UNITS_PER_FOOT;
        const pitchRad = (sim.pitchDeg * Math.PI) / 180;
        const leanRad = (sim.leanDeg * Math.PI) / 180;

        // Pivot Tandem Coaster lean around the tire-rail contact line so tires stay planted on the yellow beam
        const pivotY = isCoasterOnRail ? (Math.cos(leanRad) - 1) * 0.78 : 0;
        const pivotZ = isCoasterOnRail ? -Math.sin(leanRad) * 0.78 : 0;
        craft.root.position.set(craftXU, craftYU + pivotY, craftZU + pivotZ);
        craft.airframeGroup.position.set(0, 0, 0);
        craft.airframeGroup.rotation.order = 'ZXY';
        craft.airframeGroup.rotation.set(leanRad, 0, pitchRad);

        // Snap shadow frustum target to 0.5u increments to eliminate sub-texel shadow swimming
        const snapShadowX = Math.round(craftXU * 2) * 0.5;
        const snapShadowZ = Math.round(craftZU * 2) * 0.5;
        sunLight.position.set(snapShadowX + 14, 35, snapShadowZ + 22);
        sunLight.target.position.set(snapShadowX, 0, snapShadowZ);

        // Update 3D Wingtip Trails during Airborne Phase (Flugtag gliders only)
        if (sim.phase === 'airborne' && sim.competition === 'flugtag') {
          wingTrailGroup.visible = true;
          wingTrailGroup.position.set(craftXU, craftYU, craftZU);
          wingTrailGroup.rotation.order = 'ZXY';
          wingTrailGroup.rotation.set(leanRad, 0, pitchRad);
          wingTrailMat.color.setHex(
            sim.isStalling ? 0xf43f5e : sim.inSweetSpot ? 0x34d399 : 0x38bdf8
          );
          wingTrailMat.opacity = sim.isStalling
            ? 0.45 + Math.abs(Math.sin(elapsedSec * 14)) * 0.45
            : 0.65;
        } else if (wingTrailGroup.visible) {
          wingTrailGroup.visible = false;
        }

        if (craft.propSpinner) {
          craft.propSpinner.rotation.x += Math.max(3, sim.vxFeet * 0.45) * dt;
        }
        if (craft.wheelSpinners.length > 0 && sim.vxFeet > 0.1) {
          const wheelSpinSpeed = sim.vxFeet * 0.34;
          for (let i = 0; i < craft.wheelSpinners.length; i++) {
            craft.wheelSpinners[i].rotation.z -= wheelSpinSpeed * dt;
          }
        }

        craft.pilotGroup.rotation.z =
          sim.competition === 'flugtag' ? -sim.pilotPitchInput * 0.38 : 0;
        craft.pilotGroup.rotation.x =
          sim.competition !== 'flugtag' ? sim.pilotPitchInput * 0.28 : 0;

        if (sim.phase === 'skit') {
          craft.crewGroup.visible = true;
          craft.crewGroup.position.y = Math.abs(Math.sin(elapsedSec * 11)) * 0.35;
          craft.crewGroup.rotation.y = Math.sin(elapsedSec * 6) * 0.18;
        } else if (sim.phase === 'ramp_push') {
          craft.crewGroup.visible = !sim.trolleyDetached && sim.xFeet < -4;
          craft.crewGroup.position.y = Math.abs(Math.sin(elapsedSec * 16)) * 0.22;
          craft.crewGroup.rotation.y = 0;
        } else {
          craft.crewGroup.visible = false;
        }

        // Trolley / Wheel positioning: Soapbox & Rollercoaster keep their wheels attached!
        if (!sim.trolleyDetached || sim.competition !== 'flugtag') {
          craft.trolleyGroup.position.set(0, 0, 0);
          craft.trolleyGroup.rotation.order = 'ZXY';
          craft.trolleyGroup.rotation.set(leanRad, 0, pitchRad);
        } else {
          const relTrolleyX = (sim.trolleyXFeet - sim.xFeet) * UNITS_PER_FOOT;
          const relTrolleyY = (sim.trolleyYFeet - sim.yFeet) * UNITS_PER_FOOT;
          craft.trolleyGroup.position.set(relTrolleyX, relTrolleyY, 0);
          craft.trolleyGroup.rotation.set(0, 0, (sim.trolleyPitchDeg * Math.PI) / 180);
        }

        // Animate Thermal Rings (Flugtag/Soapbox) & 3D Hanging Canal Bells (Tandem Rollercoaster)
        const isCoasterComp = sim.competition === 'rollercoaster';
        for (let idx = 0; idx < sim.thermalRings.length; idx++) {
          const r = sim.thermalRings[idx];
          const target = thermalTargets[idx];
          if (!target) continue;
          const targetXU = r.xFeet * UNITS_PER_FOOT;
          const targetYU = r.yFeet * UNITS_PER_FOOT;
          if (target.group.position.x !== targetXU || target.group.position.y !== targetYU) {
            target.group.position.set(targetXU, targetYU, (r.zFeet ?? 0) * UNITS_PER_FOOT);
            const ringScale = r.radiusFeet * UNITS_PER_FOOT * 0.55;
            target.torus.scale.set(ringScale, ringScale, 1);
          }
          if (isCoasterComp) {
            target.group.visible = true;
            target.torus.visible = false;
            target.bellGroup.visible = true;
            // Swing vigorously when rung, or sway gently in the canal breeze before collection
            target.bellPivot.rotation.z = r.collected
              ? Math.sin(elapsedSec * 24) * 0.68
              : Math.sin(elapsedSec * 3.0 + idx) * 0.08;
          } else {
            target.group.visible = !r.collected;
            target.torus.visible = true;
            target.bellGroup.visible = false;
            target.torus.rotation.z += 2.2 * dt;
          }
        }

        // Swing the 320-Ft Grand Canal Bell when rung at the finish line!
        grandBell.rotation.z =
          isCoasterComp && sim.completedCourse && sim.phase === 'splashdown'
            ? Math.sin(elapsedSec * 22) * 0.6
            : Math.sin(elapsedSec * 2.2) * 0.04;

        // Clean World-Aligned Floating Debris on Splashdown!
        if (sim.phase === 'splashdown' && sim.debris.length > 0) {
          partsNeedReset = true;
          craft.airframeGroup.rotation.x = 0;
          const cosP = Math.cos(-pitchRad);
          const sinP = Math.sin(-pitchRad);
          sim.debris.forEach((d) => {
            const targetGroup =
              d.partKey === 'wings'
                ? craft.wingsGroup
                : d.partKey === 'tail'
                ? craft.tailGroup
                : d.partKey === 'nose'
                ? craft.noseGroup
                : craft.topperGroup;

            const worldDx = (sim.impactXFeet - sim.xFeet + d.offsetXFeet) * UNITS_PER_FOOT;
            const worldDy = (d.yFeet - sim.yFeet) * UNITS_PER_FOOT - heightOffsetU;
            const localX = worldDx * cosP - worldDy * sinP;
            const localY = worldDx * sinP + worldDy * cosP;

            targetGroup.position.set(localX, localY, d.zFeet * UNITS_PER_FOOT);
            targetGroup.rotation.set(d.rotX, d.rotY, d.rotZ - pitchRad);
          });
        } else if (partsNeedReset) {
          partsNeedReset = false;
          craft.wingsGroup.position.set(0, 0, 0);
          craft.wingsGroup.rotation.set(0, 0, 0);
          craft.tailGroup.position.set(0, 0, 0);
          craft.tailGroup.rotation.set(0, 0, 0);
          craft.noseGroup.position.set(0, 0, 0);
          craft.noseGroup.rotation.set(0, 0, 0);
          craft.topperGroup.position.set(0, 0, 0);
          craft.topperGroup.rotation.set(0, 0, 0);
        }

        // Update 3D Splash Droplets & Expanding Foam Rings (gated by splashGroup.visible)
        if (sim.phase === 'splashdown' && splashGroup.visible) {
          splashDrops.forEach((d) => {
            if (!d.mesh.visible) return;
            d.vy -= 18 * dt;
            d.mesh.position.x += d.vx * dt;
            d.mesh.position.y += d.vy * dt;
            d.mesh.position.z += d.vz * dt;
            const scaleFade = Math.max(0.25, 1 - sim.phaseTime * 0.45);
            d.mesh.scale.set(scaleFade, scaleFade, scaleFade);
            if (d.mesh.position.y < 0.02) {
              d.mesh.visible = false;
            }
          });
          foamRings.forEach((ring, idx) => {
            if (!ring.visible) return;
            const s = 0.5 + sim.phaseTime * (1.8 + idx * 0.7);
            ring.scale.set(s, s, s);
            const mat = ring.material as THREE.MeshBasicMaterial;
            mat.opacity = Math.max(0, 0.85 - sim.phaseTime * 0.42);
          });
        } else if (splashGroup.visible) {
          splashGroup.visible = false;
        }

        // Smooth Frame-Rate Independent Dynamic Chase Camera
        if (sim.phase === 'skit') {
          desiredCamPos.set(craftXU + 4.8, craftYU + 2.2, 6.2);
          desiredLookAt.set(craftXU - 0.5, craftYU + 0.5, 0);
        } else if (sim.phase === 'ramp_push') {
          desiredCamPos.set(craftXU - 3.5, craftYU + 2.4, 8.8);
          desiredLookAt.set(craftXU + 2.5, craftYU + 0.2, 0);
        } else if (sim.phase === 'airborne') {
          if (sim.competition === 'rollercoaster') {
            // Center-biased over-the-shoulder Coaster camera with camelback slope pitch tracking
            const slopePitchOffset = Math.tan((sim.trackSlopeDeg * Math.PI) / 180) * 2.1;
            desiredCamPos.set(craftXU - 5.8, Math.max(2.8, craftYU + 2.35), craftZU + 2.2);
            desiredLookAt.set(
              craftXU + 3.8,
              Math.max(1.2, craftYU + 0.35 + slopePitchOffset),
              craftZU * 0.35
            );
          } else if (sim.competition === 'soapbox') {
            desiredCamPos.set(craftXU - 5.2, Math.max(2.6, craftYU + 2.7), craftZU + 6.8);
            desiredLookAt.set(craftXU + 3.8, Math.max(1.2, craftYU - 0.1), craftZU * 0.5);
          } else {
            desiredCamPos.set(craftXU - 4.2, Math.max(2.6, craftYU + 2.1), 10.5);
            desiredLookAt.set(craftXU + 3.2, Math.max(1.0, craftYU - 0.3), 0);
          }
        } else {
          const angle = sim.phaseTime * 0.45;
          desiredCamPos.set(
            craftXU - 2.0 + Math.sin(angle) * 5.5,
            Math.max(3.6, craftYU + 2.0),
            craftZU + Math.cos(angle) * 8.2
          );
          desiredLookAt.set(craftXU, Math.max(0.65, craftYU), craftZU);
        }

        const camPosDamp = 1 - Math.exp(-8.0 * dt);
        const camLookDamp = 1 - Math.exp(-9.5 * dt);
        camera.position.lerp(desiredCamPos, camPosDamp);
        smoothedLookAt.lerp(desiredLookAt, camLookDamp);
        camera.lookAt(smoothedLookAt);
      }

      renderer.render(scene, camera);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      domEl.removeEventListener('pointerdown', onPointerDown);
      domEl.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();
      disposeCraftObject3D(scene, true);
      sunLight.shadow.map?.dispose();
      renderer.dispose();
      craftGroupsRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden touch-none ${
        mode === 'hangar' ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
      }`}
    />
  );
});

