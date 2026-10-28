import * as THREE from 'three';
import {
  CoasterLoadout,
  CoasterPartCategory,
  getCoasterPaintTheme,
} from './CoasterPartCatalog';

export const COASTER_RAIL_HALF_GAUGE = 0.58; // Left rail at z = -0.58m, Right rail at z = +0.58m

export interface CoasterCar3DGroups {
  root: THREE.Group;
  carBodyGroup: THREE.Group;
  chassisGroup: THREE.Group;
  bogiesGroup: THREE.Group;
  restraintsGroup: THREE.Group;
  noseGroup: THREE.Group;
  boosterGroup: THREE.Group;
  shellGroup: THREE.Group;
  ridersGroup: THREE.Group;
  /** Road, side-friction & upstop wheel meshes that spin with track speed */
  wheelSpinners: THREE.Object3D[];
  /** Flywheel / gyroscope rotors that spin continuously */
  gyroSpinners: THREE.Object3D[];
  /** Thruster / LIM glow meshes that pulse during boost */
  boostGlowMeshes: THREE.Object3D[];
  /** Interactive 3D part socket markers for Builder Bay clicking */
  socketMarkers: Record<CoasterPartCategory, THREE.Mesh>;
  socketMarkerList: THREE.Mesh[];
}

const MAT_CACHE = new Map<string, THREE.Material>();
const GEO_CACHE = new Map<string, THREE.BufferGeometry>();

function getMat(
  hex: string | number,
  roughness = 0.35,
  metalness = 0.18,
  emissiveHex?: string | number,
  emissiveIntensity = 0
): THREE.MeshStandardMaterial {
  const key = `${hex}_${roughness}_${metalness}_${emissiveHex ?? 'none'}_${emissiveIntensity}`;
  const cached = MAT_CACHE.get(key) as THREE.MeshStandardMaterial | undefined;
  if (cached) return cached;
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    roughness,
    metalness,
    ...(emissiveHex !== undefined
      ? {
          emissive: new THREE.Color(emissiveHex),
          emissiveIntensity,
        }
      : {}),
  });
  mat.userData.cached = true;
  MAT_CACHE.set(key, mat);
  return mat;
}

function getCachedGeo(key: string, factory: () => THREE.BufferGeometry): THREE.BufferGeometry {
  const existing = GEO_CACHE.get(key);
  if (existing) return existing;
  const geo = factory();
  geo.computeBoundingSphere();
  geo.userData.cached = true;
  GEO_CACHE.set(key, geo);
  return geo;
}

export function disposeCoasterObject3D(root: THREE.Object3D): void {
  const disposedGeos = new Set<THREE.BufferGeometry>();
  const disposedMats = new Set<THREE.Material>();

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
      (mesh as THREE.InstancedMesh).dispose();
    }
    if (mesh.geometry && !mesh.geometry.userData?.cached && !disposedGeos.has(mesh.geometry)) {
      disposedGeos.add(mesh.geometry);
      mesh.geometry.dispose();
    }
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (m && !m.userData?.cached && !disposedMats.has(m)) {
          disposedMats.add(m);
          m.dispose();
        }
      }
    }
  });
}

// ============================================================================
// 1. CHASSIS BUILDER (5 Coaster Car Frames)
// ============================================================================
function buildChassisMesh(
  group: THREE.Group,
  chassisId: string,
  primaryHex: string,
  secondaryHex: string,
  accentHex: string
): void {
  const primaryMat = getMat(primaryHex, 0.28, 0.35);
  const secondaryMat = getMat(secondaryHex, 0.32, 0.28);
  const accentMat = getMat(accentHex, 0.25, 0.45);
  const darkSteelMat = getMat('#0f172a', 0.4, 0.65);
  const chromeMat = getMat('#e2e8f0', 0.15, 0.85);
  const seatMat = getMat('#1e293b', 0.55, 0.1);

  // Structural under-frame crossbeams linking left & right bogie mounts (z = -0.58 .. +0.58)
  [-0.86, 0, 0.86].forEach((bx) => {
    const crossBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, COASTER_RAIL_HALF_GAUGE * 2.1, 10),
      darkSteelMat
    );
    crossBeam.rotation.x = Math.PI / 2;
    crossBeam.position.set(bx, 0.14, 0);
    group.add(crossBeam);
  });

  if (chassisId === 'cc_chassis_minecart') {
    // Runaway Timber Minecart: weathered oak planks, iron corner straps & ore-cart lip
    const woodMat = getMat('#92400e', 0.72, 0.05);
    const darkWoodMat = getMat('#78350f', 0.78, 0.05);
    const ironMat = getMat('#334155', 0.45, 0.7);

    const floorBox = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.14, 1.16), darkWoodMat);
    floorBox.position.set(0, 0.22, 0);
    group.add(floorBox);

    // Side & front/back timber walls
    [-0.56, 0.56].forEach((z) => {
      const sideWall = new THREE.Mesh(new THREE.BoxGeometry(2.32, 0.56, 0.09), woodMat);
      sideWall.position.set(0, 0.54, z);
      group.add(sideWall);

      // Iron vertical reinforcing bands
      [-0.95, -0.32, 0.32, 0.95].forEach((sx) => {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.12), ironMat);
        strap.position.set(sx, 0.54, z);
        group.add(strap);
      });
    });

    [-1.12, 1.12].forEach((x) => {
      const endWall = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.56, 1.18), woodMat);
      endWall.position.set(x, 0.54, 0);
      group.add(endWall);
    });

    // Top iron rim lip around the minecart
    const topRimL = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.07, 0.13), ironMat);
    topRimL.position.set(0, 0.84, -0.56);
    const topRimR = topRimL.clone();
    topRimR.position.z = 0.56;
    group.add(topRimL, topRimR);
  } else if (chassisId === 'cc_chassis_bobsled') {
    // Carbon Alpine Bobsled Pod: low-slung aerodynamic monocoque tub
    const carbonMat = getMat('#111827', 0.25, 0.45);
    const hullBottom = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.14, 1.06), carbonMat);
    hullBottom.position.set(0.05, 0.19, 0);
    group.add(hullBottom);

    [-0.52, 0.52].forEach((z) => {
      const fairing = new THREE.Mesh(new THREE.BoxGeometry(2.38, 0.34, 0.12), primaryMat);
      fairing.position.set(0.06, 0.38, z);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.07, 0.14), accentMat);
      stripe.position.set(0.06, 0.42, z);
      group.add(fairing, stripe);
    });

    const rearCowling = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.52, 0.68, 14),
      secondaryMat
    );
    rearCowling.rotation.z = Math.PI / 2;
    rearCowling.position.set(-0.98, 0.44, 0);
    group.add(rearCowling);
  } else if (chassisId === 'cc_chassis_wing') {
    // Wide Wing-Coaster Outrigger Frame: central spine + cantilevered outrigger wing pods!
    const centerDeck = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.16, 1.18), primaryMat);
    centerDeck.position.set(0, 0.23, 0);
    group.add(centerDeck);

    // Wide cantilevered wing spars extending out to z = -1.18 and +1.18
    const wingSparFront = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 2.48), darkSteelMat);
    wingSparFront.position.set(0.35, 0.26, 0);
    const wingSparRear = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 2.48), darkSteelMat);
    wingSparRear.position.set(-0.45, 0.26, 0);
    group.add(wingSparFront, wingSparRear);

    [-1.12, 1.12].forEach((wz) => {
      const outriggerPod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 1.95, 12),
        secondaryMat
      );
      outriggerPod.rotation.z = Math.PI / 2;
      outriggerPod.position.set(-0.02, 0.32, wz);

      const wingFin = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.38, 0.06), accentMat);
      wingFin.position.set(-0.45, 0.52, wz * 1.08);
      wingFin.rotation.z = 0.25;
      group.add(outriggerPod, wingFin);
    });
  } else if (chassisId === 'cc_chassis_loco') {
    // 2-Ton Steam Express Locomotive Car: cast-iron boiler barrel, brass steam dome & smokestack
    const ironBoilerMat = getMat('#0f172a', 0.35, 0.72);
    const brassMat = getMat('#facc15', 0.2, 0.85);

    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.16, 1.24), secondaryMat);
    deck.position.set(0, 0.22, 0);
    group.add(deck);

    // Front cylindrical boiler barrel ahead of riders
    const boiler = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.38, 0.92, 16),
      ironBoilerMat
    );
    boiler.rotation.z = Math.PI / 2;
    boiler.position.set(0.84, 0.54, 0);
    group.add(boiler);

    // Brass boiler bands, smokestack & steam dome
    [0.52, 0.84, 1.15].forEach((bx) => {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.385, 0.022, 8, 20), brassMat);
      band.rotation.y = Math.PI / 2;
      band.position.set(bx, 0.54, 0);
      group.add(band);
    });

    const smokestack = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.1, 0.38, 12),
      ironBoilerMat
    );
    smokestack.position.set(1.06, 0.98, 0);
    const stackCrown = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 8, 14), brassMat);
    stackCrown.rotation.x = Math.PI / 2;
    stackCrown.position.set(1.06, 1.16, 0);

    const steamDome = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), brassMat);
    steamDome.position.set(0.68, 0.92, 0);
    group.add(smokestack, stackCrown, steamDome);

    // Side cab walls
    [-0.56, 0.56].forEach((z) => {
      const cabSide = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.44, 0.08), primaryMat);
      cabSide.position.set(-0.38, 0.48, z);
      group.add(cabSide);
    });
  } else {
    // Default: Hyper-Coaster Tubular Steel Car (cc_chassis_hyper)
    const floorPan = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.14, 1.14), primaryMat);
    floorPan.position.set(0.04, 0.22, 0);
    group.add(floorPan);

    // Sculpted side bolstering pods & upper chromoly tubular handrails
    [-0.56, 0.56].forEach((z) => {
      const sidePod = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.32, 0.12), secondaryMat);
      sidePod.position.set(0.02, 0.4, z);

      const accentTrim = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.06, 0.14), accentMat);
      accentTrim.position.set(0.02, 0.44, z);

      const topRail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.032, 0.032, 2.15, 10),
        chromeMat
      );
      topRail.rotation.z = Math.PI / 2;
      topRail.position.set(0.02, 0.62, z);

      group.add(sidePod, accentTrim, topRail);
    });
  }

  // Twin Stadium Coaster Seats (Front Row x = +0.28, Rear Stadium Row x = -0.52)
  [
    { x: 0.28, y: 0.34 },
    { x: -0.52, y: 0.4 },
  ].forEach(({ x, y }) => {
    const seatCushion = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.72), seatMat);
    seatCushion.position.set(x, y, 0);

    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.54, 0.68), seatMat);
    seatBack.position.set(x - 0.18, y + 0.26, 0);
    seatBack.rotation.z = 0.14;

    const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.44), accentMat);
    headrest.position.set(x - 0.22, y + 0.56, 0);

    group.add(seatCushion, seatBack, headrest);
  });
}

// ============================================================================
// 2. BOGIES BUILDER (Authentic 3-Wheel-Set Coaster Bogies wrapping the Rails!)
// ============================================================================
function buildBogiesMesh(
  group: THREE.Group,
  bogieId: string,
  wheelSpinners: THREE.Object3D[]
): void {
  const isUrethane = bogieId === 'cc_bogie_urethane';
  const isGimbal = bogieId === 'cc_bogie_gimbal';
  const isCaster = bogieId === 'cc_bogie_caster';
  const isCeramic = bogieId === 'cc_bogie_ceramic';

  const tireHex = isUrethane
    ? '#0ea5e9'
    : isGimbal
    ? '#f59e0b'
    : isCaster
    ? '#ef4444'
    : isCeramic
    ? '#a855f7'
    : '#64748b';
  const hubHex = isUrethane
    ? '#facc15'
    : isGimbal
    ? '#1e293b'
    : isCaster
    ? '#cbd5e1'
    : isCeramic
    ? '#38bdf8'
    : '#e2e8f0';
  const yokeHex = isGimbal ? '#d97706' : isCeramic ? '#1e1b4b' : '#334155';

  const tireMat = getMat(tireHex, 0.3, 0.25);
  const hubMat = getMat(hubHex, 0.22, 0.7);
  const yokeMat = getMat(yokeHex, 0.38, 0.68);

  const roadWheelGeo = getCachedGeo('coaster_road_wheel', () => {
    const g = new THREE.CylinderGeometry(0.105, 0.105, 0.085, 16);
    g.rotateX(Math.PI / 2);
    return g;
  });
  const upstopWheelGeo = getCachedGeo('coaster_upstop_wheel', () => {
    const g = new THREE.CylinderGeometry(0.085, 0.085, 0.075, 14);
    g.rotateX(Math.PI / 2);
    return g;
  });
  const guideWheelGeo = getCachedGeo('coaster_guide_wheel', () => {
    return new THREE.CylinderGeometry(0.085, 0.085, 0.065, 14);
  });

  // 4 Bogie Clusters: Front-Left, Front-Right, Rear-Left, Rear-Right
  const bogieXPositions = [0.86, -0.86];
  const railZPositions = [-COASTER_RAIL_HALF_GAUGE, COASTER_RAIL_HALF_GAUGE];

  for (const bx of bogieXPositions) {
    for (const rz of railZPositions) {
      const sideSign = Math.sign(rz); // -1 for Left Rail, +1 for Right Rail
      const cluster = new THREE.Group();
      cluster.position.set(bx, 0, rz);

      // C-Shaped Steel Bogie Yoke wrapping around the outer side of the tubular rail
      const yokeSpine = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.08), yokeMat);
      yokeSpine.position.set(0, 0.01, sideSign * 0.13);
      const yokeTopArm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.22), yokeMat);
      yokeTopArm.position.set(0, 0.18, sideSign * 0.05);
      const yokeBotArm = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.07, 0.22), yokeMat);
      yokeBotArm.position.set(0, -0.16, sideSign * 0.05);
      cluster.add(yokeSpine, yokeTopArm, yokeBotArm);

      if (isGimbal) {
        // Articulated gold spherical gimbal ring above the bogie
        const gimbalRing = new THREE.Mesh(
          new THREE.TorusGeometry(0.13, 0.025, 8, 16),
          getMat('#facc15', 0.2, 0.85)
        );
        gimbalRing.rotation.x = Math.PI / 2;
        gimbalRing.position.set(0, 0.23, 0);
        cluster.add(gimbalRing);
      }

      // 1. TOP ROAD WHEELS (ride tangent on top of the 0.068m tubular steel rail at y = +0.168m)
      const roadOffsets = isUrethane || isCeramic ? [-0.11, 0.11] : [0];
      for (const ox of roadOffsets) {
        const roadWheel = new THREE.Group();
        roadWheel.position.set(ox, 0.168, 0);
        const tire = new THREE.Mesh(roadWheelGeo, tireMat);
        const hub = new THREE.Mesh(
          new THREE.BoxGeometry(0.15, 0.038, 0.095),
          hubMat
        );
        roadWheel.add(tire, hub);
        cluster.add(roadWheel);
        wheelSpinners.push(roadWheel);
      }

      // 2. BOTTOM UPSTOP WHEELS (clamped underneath the rail at y = -0.148m to prevent Negative-G liftoff!)
      const upstopScale = isCaster ? 0.65 : 1.0;
      const upstopWheel = new THREE.Group();
      upstopWheel.position.set(0, -0.148, 0);
      upstopWheel.scale.setScalar(upstopScale);
      const upTire = new THREE.Mesh(upstopWheelGeo, tireMat);
      const upHub = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.032, 0.085), hubMat);
      upstopWheel.add(upTire, upHub);
      cluster.add(upstopWheel);
      wheelSpinners.push(upstopWheel);

      // 3. SIDE-FRICTION GUIDE WHEEL (vertical-axis roller hugging the inner side of the rail)
      const guideWheel = new THREE.Mesh(guideWheelGeo, tireMat);
      guideWheel.position.set(0, 0.0, -sideSign * 0.145);
      cluster.add(guideWheel);

      group.add(cluster);
    }
  }
}

// ============================================================================
// 3. RESTRAINTS BUILDER (Passenger Harnesses & Lap Bars)
// ============================================================================
function buildRestraintsMesh(group: THREE.Group, restraintId: string): void {
  const seatRowsX = [0.28, -0.52];

  if (restraintId === 'cc_rest_buzzbar') {
    // Vintage Chrome Single-Position Buzz Bar
    const chromeMat = getMat('#f8fafc', 0.12, 0.9);
    const padMat = getMat('#f59e0b', 0.4, 0.1);
    for (const rx of seatRowsX) {
      const bar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.028, 0.028, 0.88, 10),
        padMat
      );
      bar.rotation.x = Math.PI / 2;
      bar.position.set(rx + 0.18, 0.64, 0);

      [-0.42, 0.42].forEach((z) => {
        const arm = new THREE.Mesh(
          new THREE.CylinderGeometry(0.022, 0.022, 0.34, 8),
          chromeMat
        );
        arm.position.set(rx + 0.18, 0.48, z);
        group.add(arm);
      });
      group.add(bar);
    }
  } else if (restraintId === 'cc_rest_ots') {
    // Over-The-Shoulder (OTS) U-Shaped Loop Harness
    const padMat = getMat('#ef4444', 0.38, 0.15);
    const gripMat = getMat('#facc15', 0.25, 0.6);
    for (const rx of seatRowsX) {
      [-0.17, 0.17].forEach((z) => {
        const shoulderStrap = new THREE.Mesh(
          new THREE.BoxGeometry(0.36, 0.42, 0.09),
          padMat
        );
        shoulderStrap.position.set(rx - 0.02, 0.78, z);
        shoulderStrap.rotation.z = -0.35;

        const grabHandle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.018, 0.018, 0.22, 8),
          gripMat
        );
        grabHandle.position.set(rx + 0.12, 0.72, z);
        group.add(shoulderStrap, grabHandle);
      });
      const chestBridge = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.44), padMat);
      chestBridge.position.set(rx + 0.1, 0.64, 0);
      group.add(chestBridge);
    }
  } else if (restraintId === 'cc_rest_cage') {
    // Full-Body 6-Point Titanium Roll Cage Canopy
    const cageMat = getMat('#eab308', 0.22, 0.78);
    [-0.48, 0.48].forEach((z) => {
      const archBar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.032, 0.032, 1.85, 10),
        cageMat
      );
      archBar.rotation.z = Math.PI / 2;
      archBar.position.set(-0.1, 1.15, z);

      [-0.85, 0.05, 0.72].forEach((px) => {
        const pillar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.03, 0.68, 10),
          cageMat
        );
        pillar.position.set(px, 0.82, z);
        group.add(pillar);
      });
      group.add(archBar);
    });
    // Roof crossbars
    [-0.85, -0.1, 0.72].forEach((cx) => {
      const roofCross = new THREE.Mesh(
        new THREE.CylinderGeometry(0.028, 0.028, 0.98, 10),
        cageMat
      );
      roofCross.rotation.x = Math.PI / 2;
      roofCross.position.set(cx, 1.15, 0);
      group.add(roofCross);
    });
  } else {
    // Default: Clamshell Hydraulic T-Bar (cc_rest_tbar)
    const tbarMat = getMat('#0ea5e9', 0.3, 0.35);
    const strutMat = getMat('#0f172a', 0.35, 0.75);
    for (const rx of seatRowsX) {
      const centerPost = new THREE.Mesh(
        new THREE.CylinderGeometry(0.038, 0.045, 0.38, 10),
        strutMat
      );
      centerPost.position.set(rx + 0.24, 0.48, 0);
      centerPost.rotation.z = 0.28;

      const lapPad = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.11, 0.74), tbarMat);
      lapPad.position.set(rx + 0.16, 0.64, 0);
      group.add(centerPost, lapPad);
    }
  }
}

// ============================================================================
// 4. NOSE CONE BUILDER (Bullet, Shark Jaws, Cowcatcher, Cyber Splitter)
// ============================================================================
function buildNoseMesh(
  group: THREE.Group,
  noseId: string,
  primaryHex: string,
  accentHex: string
): void {
  if (noseId === 'cc_nose_shark') {
    // Great White Coaster Shark Jaws with 3D Conical Teeth & Pectoral Canard Fins!
    const sharkBlue = getMat('#0284c7', 0.32, 0.18);
    const bellyWhite = getMat('#f8fafc', 0.35, 0.1);
    const gumPink = getMat('#f43f5e', 0.4, 0.05);
    const toothWhite = getMat('#ffffff', 0.15, 0.1);

    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.95, 14), sharkBlue);
    snout.rotation.z = -Math.PI / 2;
    snout.position.set(1.52, 0.46, 0);

    const lowerJaw = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.14, 0.56), bellyWhite);
    lowerJaw.position.set(1.36, 0.24, 0);
    lowerJaw.rotation.z = -0.18;

    const gums = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.5), gumPink);
    gums.position.set(1.42, 0.32, 0);
    group.add(snout, lowerJaw, gums);

    // Upper & Lower 3D Shark Teeth
    [1.28, 1.42, 1.56, 1.68].forEach((tx) => {
      [-0.2, 0.2].forEach((tz) => {
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.1, 6), toothWhite);
        tooth.rotation.x = Math.PI;
        tooth.position.set(tx, 0.34, tz);
        group.add(tooth);
      });
    });

    // Fierce Shark Eyes & Side Pectoral Canard Fins
    [-1, 1].forEach((side) => {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 10, 10),
        getMat('#0f172a', 0.1, 0.2)
      );
      eye.position.set(1.38, 0.56, side * 0.34);

      const pecFin = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.05, 0.42), sharkBlue);
      pecFin.position.set(1.22, 0.32, side * 0.62);
      pecFin.rotation.y = -side * 0.35;
      group.add(eye, pecFin);
    });
  } else if (noseId === 'cc_nose_cowcatcher') {
    // Cast-Iron Locomotive Cowcatcher Wedge & Blazing Brass Headlamp
    const ironMat = getMat('#1e293b', 0.38, 0.78);
    const brassMat = getMat('#f59e0b', 0.22, 0.85);
    const glowMat = getMat('#fef08a', 0.1, 0.1, '#facc15', 0.9);

    const wedgeBase = new THREE.Mesh(new THREE.ConeGeometry(0.58, 0.78, 4), ironMat);
    wedgeBase.rotation.z = -Math.PI / 2;
    wedgeBase.rotation.x = Math.PI / 4;
    wedgeBase.position.set(1.44, 0.28, 0);
    group.add(wedgeBase);

    // Grille bars
    for (let i = -3; i <= 3; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.52, 6), brassMat);
      bar.rotation.z = -0.65;
      bar.position.set(1.46, 0.3, i * 0.12);
      group.add(bar);
    }

    // Brass Headlamp
    const lampHousing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.22, 14),
      brassMat
    );
    lampHousing.rotation.z = Math.PI / 2;
    lampHousing.position.set(1.32, 0.66, 0);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.12, 14), glowMat);
    lens.rotation.y = Math.PI / 2;
    lens.position.set(1.44, 0.66, 0);
    group.add(lampHousing, lens);
  } else if (noseId === 'cc_nose_cyber') {
    // Cyber Neon Splitter & Strobe Array
    const carbonMat = getMat('#0f172a', 0.25, 0.6);
    const cyanGlow = getMat('#06b6d4', 0.15, 0.3, '#22d3ee', 0.85);
    const pinkGlow = getMat('#ec4899', 0.15, 0.3, '#f472b6', 0.85);

    const noseWedge = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.24, 1.08), carbonMat);
    noseWedge.position.set(1.38, 0.32, 0);
    noseWedge.rotation.z = -0.18;

    const splitterLip = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.05, 1.28), cyanGlow);
    splitterLip.position.set(1.56, 0.18, 0);

    const strobeBar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.96), pinkGlow);
    strobeBar.position.set(1.66, 0.34, 0);

    group.add(noseWedge, splitterLip, strobeBar);
  } else {
    // Default: Bullet Launch Nose Cone (cc_nose_bullet)
    const coneMat = getMat(primaryHex, 0.24, 0.4);
    const tipMat = getMat(accentHex, 0.2, 0.6);

    const bulletCone = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.88, 18), coneMat);
    bulletCone.rotation.z = -Math.PI / 2;
    bulletCone.position.set(1.48, 0.38, 0);

    const pitotSpike = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.035, 0.38, 8),
      tipMat
    );
    pitotSpike.rotation.z = -Math.PI / 2;
    pitotSpike.position.set(2.02, 0.38, 0);

    group.add(bulletCone, pitotSpike);
  }
}

// ============================================================================
// 5. BOOSTER / GYRO / MAGNET BRAKES BUILDER
// ============================================================================
function buildBoosterMesh(
  group: THREE.Group,
  boosterId: string,
  gyroSpinners: THREE.Object3D[],
  boostGlowMeshes: THREE.Object3D[]
): void {
  const copperMat = getMat('#d97706', 0.22, 0.88);
  const cyanEmissiveMat = getMat('#38bdf8', 0.15, 0.3, '#0ea5e9', 0.75);
  const darkMetal = getMat('#1e293b', 0.38, 0.72);

  if (boosterId === 'cc_boost_flywheel') {
    // Spinning Brass Flywheel KERS Accumulator Drum
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.28, 0.64), darkMetal);
    housing.position.set(-1.12, 0.38, 0);
    group.add(housing);

    const rotorGroup = new THREE.Group();
    rotorGroup.position.set(-1.12, 0.56, 0);
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.26, 0.18, 18),
      getMat('#facc15', 0.18, 0.88)
    );
    drum.rotation.x = Math.PI / 2;
    const crossBar = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.06, 0.22), darkMetal);
    rotorGroup.add(drum, crossBar);
    group.add(rotorGroup);
    gyroSpinners.push(rotorGroup);
  } else if (boosterId === 'cc_boost_gyro') {
    // Active Tilt-Stabilizer Gyroscope (Twin Gimbaled Spinning Rings)
    [-0.38, 0.38].forEach((gz) => {
      const outerRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.21, 0.028, 10, 20),
        getMat('#10b981', 0.22, 0.75)
      );
      outerRing.position.set(-1.14, 0.52, gz);

      const spinner = new THREE.Group();
      spinner.position.set(-1.14, 0.52, gz);
      const rotorDisk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 0.05, 16),
        getMat('#facc15', 0.18, 0.9)
      );
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.06), cyanEmissiveMat);
      spinner.add(rotorDisk, bar);
      group.add(outerRing, spinner);
      gyroSpinners.push(spinner);
      boostGlowMeshes.push(bar);
    });
  } else if (boosterId === 'cc_boost_magnet') {
    // Dual Neodymium Eddy-Current Brake Calipers & Copper Fins
    [-0.42, 0.42].forEach((mz) => {
      const caliper = new THREE.Mesh(
        new THREE.BoxGeometry(1.45, 0.14, 0.16),
        getMat('#ef4444', 0.28, 0.55)
      );
      caliper.position.set(0, 0.06, mz);

      const copperBlade = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.18, 0.05), copperMat);
      copperBlade.position.set(0, -0.04, mz);
      group.add(caliper, copperBlade);
      boostGlowMeshes.push(copperBlade);
    });
  } else if (boosterId === 'cc_boost_rocket') {
    // Twin Cold-Gas Stunt Thrusters with Afterburner Cones
    const flameMat = getMat('#f97316', 0.1, 0.1, '#ef4444', 0.95);
    [-0.34, 0.34].forEach((rz) => {
      const nozzle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.16, 0.48, 14),
        darkMetal
      );
      nozzle.rotation.z = Math.PI / 2;
      nozzle.position.set(-1.26, 0.44, rz);

      const flameCone = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.48, 12), flameMat);
      flameCone.rotation.z = Math.PI / 2;
      flameCone.position.set(-1.66, 0.44, rz);

      group.add(nozzle, flameCone);
      boostGlowMeshes.push(flameCone);
    });
  } else {
    // Default: Copper LIM Induction Boost Fins (cc_boost_lim)
    [-0.28, 0.28].forEach((lz) => {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.18, 0.045), copperMat);
      fin.position.set(0, 0.04, lz);

      const coilGlow = new THREE.Mesh(
        new THREE.BoxGeometry(1.55, 0.06, 0.08),
        cyanEmissiveMat
      );
      coilGlow.position.set(0, 0.11, lz);
      group.add(fin, coilGlow);
      boostGlowMeshes.push(coilGlow);
    });
  }
}

// ============================================================================
// 6. RIDERS & THEMED SHELLS / TOPPERS (Including Shadow & Boomer Dogs!)
// ============================================================================
function buildRidersMesh(group: THREE.Group): void {
  const riders = [
    { x: 0.28, y: 0.56, suitHex: '#f97316', helmetHex: '#2563eb' },
    { x: -0.52, y: 0.62, suitHex: '#22c55e', helmetHex: '#eab308' },
  ];

  const visorMat = getMat('#0f172a', 0.1, 0.85);

  for (const r of riders) {
    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.18, 0.46, 12),
      getMat(r.suitHex, 0.42, 0.1)
    );
    torso.position.set(r.x, r.y, 0);

    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.19, 14, 14),
      getMat(r.helmetHex, 0.2, 0.35)
    );
    helmet.position.set(r.x + 0.02, r.y + 0.36, 0);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.28), visorMat);
    visor.position.set(r.x + 0.14, r.y + 0.36, 0);

    // Thrill-ride raised hands!
    [-0.2, 0.2].forEach((az) => {
      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.048, 0.042, 0.34, 8),
        getMat(r.suitHex, 0.45, 0.1)
      );
      arm.position.set(r.x + 0.1, r.y + 0.22, az);
      arm.rotation.z = -0.55;
      arm.rotation.x = az * 0.8;
      group.add(arm);
    });

    group.add(torso, helmet, visor);
  }
}

function buildShellMesh(group: THREE.Group, shellId: string): void {
  if (shellId === 'cc_shell_shadow') {
    // SCULPTED 3D SHADOW THE GOLDEN RETRIEVER CO-PILOT ON REAR CO-PILOT DECK!
    const dog = new THREE.Group();
    dog.position.set(-0.98, 0.48, 0);
    dog.scale.setScalar(0.72);

    const goldMat = getMat('#f59e0b', 0.5);
    const lightGoldMat = getMat('#fde68a', 0.55);
    const earGoldMat = getMat('#d97706', 0.55);
    const darkMat = getMat('#0f172a', 0.2);

    [
      [-0.34, 0.18],
      [-0.34, -0.18],
      [0.32, 0.18],
      [0.32, -0.18],
    ].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.38, 10), goldMat);
      leg.position.set(lx, 0.19, lz);
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 8), lightGoldMat);
      paw.scale.set(1.3, 0.65, 1.0);
      paw.position.set(lx + 0.04, 0.04, lz);
      dog.add(leg, paw);
    });

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.24, 0.82, 12), goldMat);
    torso.rotation.z = Math.PI / 2;
    torso.position.set(0, 0.45, 0);
    const chestRuff = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 1), lightGoldMat);
    chestRuff.position.set(0.42, 0.44, 0);
    dog.add(torso, chestRuff);

    // Red Adventurer Bandana
    const bandana = new THREE.Mesh(
      new THREE.TorusGeometry(0.21, 0.04, 8, 16),
      getMat('#ef4444', 0.4)
    );
    bandana.rotation.y = Math.PI / 2;
    bandana.position.set(0.42, 0.62, 0);
    dog.add(bandana);

    // Head, Snout, Pink Tongue & Floppy Golden Ears
    const head = new THREE.Group();
    head.position.set(0.5, 0.78, 0);
    const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), goldMat);
    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.15, 0.2), lightGoldMat);
    muzzle.position.set(0.22, -0.03, 0);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), darkMat);
    nose.position.set(0.36, 0.02, 0);
    const tongue = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.035, 0.1),
      getMat('#f43f5e', 0.35)
    );
    tongue.position.set(0.26, -0.13, 0.04);
    tongue.rotation.z = -0.4;
    head.add(cranium, muzzle, nose, tongue);

    [-1, 1].forEach((side) => {
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.28, 0.06), earGoldMat);
      ear.position.set(-0.02, -0.05, side * 0.23);
      ear.rotation.x = side * 0.22;
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), darkMat);
      eye.position.set(0.16, 0.07, side * 0.12);
      head.add(ear, eye);
    });
    dog.add(head);

    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.46, 8), goldMat);
    tail.rotation.z = 0.9;
    tail.position.set(-0.62, 0.58, 0);
    dog.add(tail);

    group.add(dog);
  } else if (shellId === 'cc_shell_boomer') {
    // SCULPTED 3D BOOMER THE HARLEQUIN GREAT DANE CO-PILOT!
    const dane = new THREE.Group();
    dane.position.set(-0.98, 0.48, 0);
    dane.scale.setScalar(0.72);

    const whiteMat = getMat('#f8fafc', 0.38);
    const blackMat = getMat('#0f172a', 0.35);
    const collarMat = getMat('#2563eb', 0.3, 0.35);

    [
      [-0.38, 0.19, true],
      [-0.38, -0.19, false],
      [0.36, 0.19, false],
      [0.36, -0.19, true],
    ].forEach(([lx, lz, blackSpot]) => {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.055, 0.52, 10),
        blackSpot ? blackMat : whiteMat
      );
      leg.position.set(lx as number, 0.26, lz as number);
      dane.add(leg);
    });

    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), whiteMat);
    chest.scale.set(1.2, 1.15, 0.88);
    chest.position.set(0.22, 0.62, 0);
    const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.6, 12), whiteMat);
    waist.rotation.z = Math.PI / 2;
    waist.position.set(-0.12, 0.64, 0);
    const saddle = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), blackMat);
    saddle.scale.set(1.25, 0.6, 1.05);
    saddle.position.set(-0.05, 0.76, 0);
    dane.add(chest, waist, saddle);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.19, 0.42, 10), whiteMat);
    neck.position.set(0.42, 0.88, 0);
    neck.rotation.z = -0.32;
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.038, 8, 16), collarMat);
    collar.rotation.y = Math.PI / 2;
    collar.position.set(0.4, 0.82, 0);
    dane.add(neck, collar);

    const head = new THREE.Group();
    head.position.set(0.54, 1.1, 0);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.25), whiteMat);
    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.2), whiteMat);
    muzzle.position.set(0.24, -0.02, 0);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.1), blackMat);
    nose.position.set(0.4, 0.02, 0);
    head.add(skull, muzzle, nose);

    [-1, 1].forEach((side) => {
      const ear = new THREE.Mesh(
        new THREE.ConeGeometry(0.095, 0.24, 4),
        side === 1 ? blackMat : whiteMat
      );
      ear.rotation.x = Math.PI + side * 0.3;
      ear.position.set(-0.03, 0.05, side * 0.17);
      head.add(ear);
    });
    dane.add(head);

    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.055, 0.46, 8), blackMat);
    tail.rotation.z = 1.05;
    tail.position.set(-0.62, 0.74, 0);
    dane.add(tail);

    group.add(dane);
  } else if (shellId === 'cc_shell_tnt') {
    // Gold Rush TNT Dynamite Crate, Plunger & Gold Nuggets
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.42, 0.78),
      getMat('#92400e', 0.7)
    );
    crate.position.set(-1.02, 0.52, 0);
    group.add(crate);

    const tntMat = getMat('#dc2626', 0.35);
    [-0.22, 0, 0.22].forEach((tz) => {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.38, 10), tntMat);
      stick.position.set(-0.98, 0.82, tz);
      group.add(stick);
    });

    // Gold ore nuggets
    const goldMat = getMat('#facc15', 0.18, 0.88);
    [-0.25, 0.18].forEach((gz, idx) => {
      const nugget = new THREE.Mesh(new THREE.DodecahedronGeometry(0.11, 0), goldMat);
      nugget.position.set(-1.12, 0.78, gz + idx * 0.05);
      group.add(nugget);
    });
  } else if (shellId === 'cc_shell_trex') {
    // Roaring Coaster T-Rex Head & Dorsal Spikes arching over the car!
    const skinMat = getMat('#16a34a', 0.42);
    const toothMat = getMat('#ffffff', 0.15);
    const spikeMat = getMat('#eab308', 0.3);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.65, 12), skinMat);
    neck.position.set(-0.92, 0.78, 0);
    neck.rotation.z = -0.35;

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.32, 0.36), skinMat);
    head.position.set(-0.68, 1.16, 0);

    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.1, 0.3), skinMat);
    jaw.position.set(-0.6, 0.96, 0);
    jaw.rotation.z = -0.28;

    [-0.14, 0.14].forEach((tz) => {
      for (let i = 0; i < 3; i++) {
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.09, 6), toothMat);
        tooth.rotation.x = Math.PI;
        tooth.position.set(-0.56 + i * 0.1, 1.0, tz);
        group.add(tooth);
      }
    });

    for (let i = 0; i < 4; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), spikeMat);
      spike.position.set(-0.82 - i * 0.12, 1.15 - i * 0.14, 0);
      spike.rotation.z = 0.4;
      group.add(spike);
    }

    group.add(neck, head, jaw);
  } else if (shellId === 'cc_shell_taco') {
    // Giant Crunchy Taco Shell Arching Around the Coaster Car!
    const shellMat = getMat('#facc15', 0.52, 0.05);
    [-0.58, 0.58].forEach((z) => {
      const tortillaWall = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.68, 0.08), shellMat);
      tortillaWall.position.set(-0.1, 0.64, z);
      tortillaWall.rotation.x = z > 0 ? -0.18 : 0.18;
      group.add(tortillaWall);
    });
    // Lettuce & tomato clusters along the rear deck
    for (let i = -2; i <= 2; i++) {
      const lettuce = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.14, 0),
        getMat('#22c55e', 0.5)
      );
      lettuce.position.set(-0.95, 0.72, i * 0.18);
      group.add(lettuce);
    }
  } else if (shellId === 'cc_shell_couch') {
    // Living Room Party Sofa Backrest & Rolled Armrests
    const sofaMat = getMat('#ea580c', 0.65, 0.05);
    const backCushion = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.65, 1.24), sofaMat);
    backCushion.position.set(-0.98, 0.68, 0);
    [-0.62, 0.62].forEach((z) => {
      const armrest = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 1.75, 12),
        getMat('#c2410c', 0.68, 0.05)
      );
      armrest.rotation.z = Math.PI / 2;
      armrest.position.set(-0.12, 0.54, z);
      group.add(armrest);
    });
    group.add(backCushion);
  } else {
    // Default: Red Bull Hyper-Pod Shell (cc_shell_rbpod)
    const blueMat = getMat('#1d4ed8', 0.25, 0.5);
    const silverMat = getMat('#e2e8f0', 0.18, 0.82);
    const redMat = getMat('#dc2626', 0.25, 0.45);

    // Twin Red Bull Energy Can Cylinders on Rear Deck + Downforce Wing
    [-0.24, 0.24].forEach((cz) => {
      const canBody = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.13, 0.58, 14),
        silverMat
      );
      canBody.rotation.z = Math.PI / 2 - 0.25;
      canBody.position.set(-1.02, 0.58, cz);
      const blueBand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.133, 0.133, 0.28, 14),
        blueMat
      );
      blueBand.rotation.z = Math.PI / 2 - 0.25;
      blueBand.position.set(-0.96, 0.6, cz);
      group.add(canBody, blueBand);
    });

    const rearWing = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 1.32), redMat);
    rearWing.position.set(-1.18, 0.88, 0);
    rearWing.rotation.z = 0.22;
    group.add(rearWing);
  }
}

/**
 * Builds the complete 3D Rollercoaster Car hierarchy for both the Engineering Bay and 3D Ride Scene.
 */
export function buildCoasterCar3D(loadout: CoasterLoadout): CoasterCar3DGroups {
  const theme = getCoasterPaintTheme(loadout.paintId);

  const root = new THREE.Group();
  const carBodyGroup = new THREE.Group();
  const chassisGroup = new THREE.Group();
  const bogiesGroup = new THREE.Group();
  const restraintsGroup = new THREE.Group();
  const noseGroup = new THREE.Group();
  const boosterGroup = new THREE.Group();
  const shellGroup = new THREE.Group();
  const ridersGroup = new THREE.Group();

  carBodyGroup.add(
    chassisGroup,
    restraintsGroup,
    noseGroup,
    boosterGroup,
    shellGroup,
    ridersGroup
  );
  root.add(carBodyGroup, bogiesGroup);

  const wheelSpinners: THREE.Object3D[] = [];
  const gyroSpinners: THREE.Object3D[] = [];
  const boostGlowMeshes: THREE.Object3D[] = [];

  buildChassisMesh(
    chassisGroup,
    loadout.chassis,
    theme.primaryHex,
    theme.secondaryHex,
    theme.accentHex
  );
  buildBogiesMesh(bogiesGroup, loadout.bogies, wheelSpinners);
  buildRestraintsMesh(restraintsGroup, loadout.restraints);
  buildNoseMesh(noseGroup, loadout.nose, theme.primaryHex, theme.accentHex);
  buildBoosterMesh(boosterGroup, loadout.booster, gyroSpinners, boostGlowMeshes);
  buildRidersMesh(ridersGroup);
  buildShellMesh(shellGroup, loadout.shell);

  // Interactive 3D Socket Markers for clicking parts directly in the Engineering Bay
  const socketPositions: Record<CoasterPartCategory, [number, number, number]> = {
    chassis: [0.0, 0.34, 0.62],
    bogies: [0.86, 0.0, 0.68],
    restraints: [0.32, 0.72, 0.0],
    nose: [1.58, 0.38, 0.0],
    booster: [-1.18, 0.38, 0.0],
    shell: [-0.98, 0.86, 0.0],
  };

  const markerGeo = getCachedGeo('coaster_socket_marker', () => {
    return new THREE.SphereGeometry(0.13, 12, 12);
  });

  const socketMarkers = {} as Record<CoasterPartCategory, THREE.Mesh>;
  const socketMarkerList: THREE.Mesh[] = [];

  (Object.keys(socketPositions) as CoasterPartCategory[]).forEach((cat) => {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#38bdf8'),
      emissive: new THREE.Color('#0284c7'),
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });
    const marker = new THREE.Mesh(markerGeo, mat);
    const [mx, my, mz] = socketPositions[cat];
    marker.position.set(mx, my, mz);
    marker.userData.coasterCategory = cat;
    root.add(marker);
    socketMarkers[cat] = marker;
    socketMarkerList.push(marker);
  });

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && !mesh.userData.coasterCategory) {
      if (!mesh.geometry.boundingSphere) {
        mesh.geometry.computeBoundingSphere();
      }
      const r = mesh.geometry.boundingSphere?.radius ?? 0.5;
      mesh.castShadow = r >= 0.22;
      mesh.receiveShadow = false;
    }
  });

  return {
    root,
    carBodyGroup,
    chassisGroup,
    bogiesGroup,
    restraintsGroup,
    noseGroup,
    boosterGroup,
    shellGroup,
    ridersGroup,
    wheelSpinners,
    gyroSpinners,
    boostGlowMeshes,
    socketMarkers,
    socketMarkerList,
  };
}
