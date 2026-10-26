import * as THREE from 'three';
import {
  getSoapboxPartById,
  SOAPBOX_PAINT_THEMES,
  SoapboxLoadout,
  SoapboxPartCategory,
} from './SoapboxPartCatalog';

export interface Soapbox3DGroups {
  root: THREE.Group;
  sprungGroup: THREE.Group;
  unsprungGroup: THREE.Group;
  chassisGroup: THREE.Group;
  steeringGroup: THREE.Group;
  wheelsGroup: THREE.Group;
  suspensionGroup: THREE.Group;
  brakesGroup: THREE.Group;
  topperGroup: THREE.Group;
  driverGroup: THREE.Group;
  crewGroup: THREE.Group;
  frontSteerNodes: THREE.Object3D[];
  wheelSpinners: THREE.Object3D[];
  shockSpringMeshes: THREE.Object3D[];
  socketMarkers: Record<SoapboxPartCategory, THREE.Mesh>;
  socketMarkerList: THREE.Mesh[];
  trackWidthMeters: number;
  wheelRadiusMeters: number;
}

const MAT_CACHE = new Map<string, THREE.Material>();
const GEO_CACHE = new Map<string, THREE.BufferGeometry>();

function getCachedGeo(key: string, factory: () => THREE.BufferGeometry): THREE.BufferGeometry {
  const existing = GEO_CACHE.get(key);
  if (existing) return existing;
  const geo = factory();
  geo.computeBoundingSphere();
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

export function makeSoapboxMat(
  hex: string | number,
  roughness = 0.36,
  metalness = 0.16
): THREE.MeshStandardMaterial {
  const key = `sb_${hex}_${roughness}_${metalness}`;
  return getCachedMat(
    key,
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(hex),
        roughness,
        metalness,
      })
  );
}

function disposeMaterial(mat: THREE.Material): void {
  const anyMat = mat as unknown as Record<string, unknown>;
  for (const value of Object.values(anyMat)) {
    if (value && typeof value === 'object' && 'isTexture' in value) {
      (value as THREE.Texture).dispose();
    }
  }
  mat.dispose();
}

export function disposeSoapboxObject3D(root: THREE.Object3D, disposeCached = false): void {
  const disposedGeos = new Set<THREE.BufferGeometry>();
  const disposedMats = new Set<THREE.Material>();

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (
      mesh.geometry &&
      !mesh.geometry.userData?.cached &&
      !disposedGeos.has(mesh.geometry)
    ) {
      disposedGeos.add(mesh.geometry);
      mesh.geometry.dispose();
    }
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (m && !m.userData?.cached && !disposedMats.has(m)) {
          disposedMats.add(m);
          disposeMaterial(m);
        }
      }
    }
  });

  if (disposeCached) {
    MAT_CACHE.forEach((m) => {
      if (!disposedMats.has(m)) {
        disposedMats.add(m);
        disposeMaterial(m);
      }
    });
    MAT_CACHE.clear();
    GEO_CACHE.forEach((g) => {
      if (!disposedGeos.has(g)) {
        disposedGeos.add(g);
        g.dispose();
      }
    });
    GEO_CACHE.clear();
  }
}

export function buildSoapbox3D(loadout: SoapboxLoadout): Soapbox3DGroups {
  const root = new THREE.Group();
  // Sprung mass (chassis, driver, topper, upper brakes) rolls & compresses over suspension
  const sprungGroup = new THREE.Group();
  // Unsprung mass (axles, wheels, lower suspension struts) tracks road surface
  const unsprungGroup = new THREE.Group();

  const chassisGroup = new THREE.Group();
  const steeringGroup = new THREE.Group();
  const wheelsGroup = new THREE.Group();
  const suspensionGroup = new THREE.Group();
  const brakesGroup = new THREE.Group();
  const topperGroup = new THREE.Group();
  const driverGroup = new THREE.Group();
  const crewGroup = new THREE.Group();

  sprungGroup.add(chassisGroup, brakesGroup, topperGroup, driverGroup);
  unsprungGroup.add(steeringGroup, wheelsGroup, suspensionGroup);
  root.add(sprungGroup, unsprungGroup, crewGroup);

  const theme =
    SOAPBOX_PAINT_THEMES.find((t) => t.id === loadout.paintTheme) ??
    SOAPBOX_PAINT_THEMES[0];

  const chassisPart = getSoapboxPartById(loadout.chassis, 'chassis');
  const steeringPart = getSoapboxPartById(loadout.steering, 'steering');
  const wheelsPart = getSoapboxPartById(loadout.wheels, 'wheels');
  const suspensionPart = getSoapboxPartById(loadout.suspension, 'suspension');
  const brakesPart = getSoapboxPartById(loadout.brakes, 'brakes');
  const topperPart = getSoapboxPartById(loadout.topper, 'topper');

  const trackWidthMeters = Math.max(
    1.04,
    Math.min(
      1.78,
      steeringPart.trackWidthMeters +
        chassisPart.trackWidthMeters +
        wheelsPart.trackWidthMeters +
        suspensionPart.trackWidthMeters
    )
  );
  const halfTrackZ = trackWidthMeters * 0.5;
  const wheelRadius = wheelsPart.wheelRadiusMeters || 0.26;

  const frontSteerNodes: THREE.Object3D[] = [];
  const wheelSpinners: THREE.Object3D[] = [];
  const shockSpringMeshes: THREE.Object3D[] = [];

  // 1. CHASSIS BODY (+X = nose, +Y = up, +Z = right side)
  buildChassisMesh(chassisGroup, chassisPart.id, theme.bodyHex, theme.trimHex, theme.accentHex);

  // 2. FRONT STEERABLE AXLE & BALLAST + COCKPIT STEERING WHEEL
  buildSteeringAxleMesh(
    steeringGroup,
    sprungGroup,
    steeringPart.id,
    halfTrackZ,
    theme.trimHex,
    frontSteerNodes
  );

  // 3. 4 WHEELS & TIRE COMPOUNDS (Front pair mounted inside steerable knuckles!)
  buildFourWheelsMesh(
    wheelsGroup,
    wheelsPart.id,
    brakesPart.id,
    halfTrackZ,
    wheelRadius,
    frontSteerNodes,
    wheelSpinners
  );

  // 4. SUSPENSION SPRINGS & SHOCKS
  buildSuspensionMesh(
    suspensionGroup,
    suspensionPart.id,
    halfTrackZ,
    shockSpringMeshes
  );

  // 5. MECHANICAL BRAKES & COWCATCHER BUMPERS
  buildBrakesMesh(brakesGroup, brakesPart.id, theme.trimHex);

  // 6. SHOWMANSHIP TOPPER / CO-PILOT DOG / GT WING
  buildTopperMesh(topperGroup, topperPart.id, theme.trimHex);

  // 7. SOAPBOX DRIVER IN COCKPIT
  buildDriverMesh(driverGroup, theme.bodyHex, theme.accentHex);

  // 8. 4 PUSH-CREW RUNNERS BEHIND CHASSIS
  buildPushCrewMesh(crewGroup, theme.bodyHex, theme.accentHex);

  // 9. GARAGE MAGNETIC SNAP SOCKET HALOS
  const socketMarkers = createSocketMarkers(sprungGroup, unsprungGroup, halfTrackZ);
  const socketMarkerList: THREE.Mesh[] = [];
  for (const ringMesh of Object.values(socketMarkers)) {
    socketMarkerList.push(ringMesh);
    for (const child of ringMesh.children) {
      if ((child as THREE.Mesh).isMesh) {
        socketMarkerList.push(child as THREE.Mesh);
      }
    }
  }

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.userData?.isSocketMarker) {
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      return;
    }
    if (!mesh.geometry.boundingSphere) {
      mesh.geometry.computeBoundingSphere();
    }
    const r = mesh.geometry.boundingSphere?.radius ?? 0.5;
    mesh.castShadow = r >= 0.16;
    mesh.receiveShadow = r >= 0.4;
  });

  return {
    root,
    sprungGroup,
    unsprungGroup,
    chassisGroup,
    steeringGroup,
    wheelsGroup,
    suspensionGroup,
    brakesGroup,
    topperGroup,
    driverGroup,
    crewGroup,
    frontSteerNodes,
    wheelSpinners,
    shockSpringMeshes,
    socketMarkers,
    socketMarkerList,
    trackWidthMeters,
    wheelRadiusMeters: wheelRadius,
  };
}

function buildChassisMesh(
  group: THREE.Group,
  id: string,
  bodyHex: string,
  trimHex: string,
  accentHex: string
): void {
  if (id === 'sb_chassis_hotdog') {
    // Jumbo Wienermobile: Toasted golden bun sides, grilled frankfurter & wavy mustard ribbon!
    [-0.35, 0.35].forEach((z) => {
      const bunSide = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.32, 2.55, 16),
        makeSoapboxMat('#f59e0b', 0.55)
      );
      bunSide.rotation.z = Math.PI / 2;
      bunSide.position.set(0, -0.04, z);
      group.add(bunSide);
    });

    const frankfurter = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 2.98, 20),
      makeSoapboxMat('#dc2626', 0.34)
    );
    frankfurter.rotation.z = Math.PI / 2;
    frankfurter.position.set(0, 0.12, 0);
    group.add(frankfurter);

    // Wavy yellow mustard squiggle along top
    for (let i = -4; i <= 4; i++) {
      const dab = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 10, 10),
        makeSoapboxMat('#fde047', 0.25)
      );
      dab.position.set(i * 0.26, 0.49, Math.sin(i * 1.1) * 0.14);
      group.add(dab);
    }
    return;
  }

  if (id === 'sb_chassis_boxcar') {
    // Corrugated Delivery Boxcar with open cardboard flaps, duct tape straps & shipping label
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 0.74, 1.12),
      makeSoapboxMat('#c27b38', 0.8)
    );
    box.position.y = 0.06;
    group.add(box);

    [-1, 1].forEach((side) => {
      const flap = new THREE.Mesh(
        new THREE.BoxGeometry(1.75, 0.05, 0.34),
        makeSoapboxMat('#d9914c', 0.8)
      );
      flap.position.set(-0.08, 0.4, side * 0.68);
      flap.rotation.x = side * 0.42;
      group.add(flap);
    });

    // Silver Duct Tape straps
    [-0.68, 0.68].forEach((x) => {
      const strap = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.78, 1.16),
        makeSoapboxMat('#94a3b8', 0.32, 0.45)
      );
      strap.position.set(x, 0.06, 0);
      group.add(strap);
    });

    const label = new THREE.Mesh(
      new THREE.BoxGeometry(0.68, 0.32, 1.15),
      makeSoapboxMat('#f8fafc', 0.5)
    );
    label.position.set(0, 0.08, 0);
    group.add(label);
    return;
  }

  if (id === 'sb_chassis_bathtub') {
    // Cast-Iron Clawfoot Bathtub with porcelain rim, bathwater, golden claw feet, swan faucet & soap bubbles!
    const tubOuter = new THREE.Mesh(
      new THREE.CylinderGeometry(0.74, 0.58, 2.52, 20),
      makeSoapboxMat('#f8fafc', 0.18, 0.15)
    );
    tubOuter.rotation.z = Math.PI / 2;
    tubOuter.scale.set(1, 1, 0.74);
    tubOuter.position.y = 0.04;
    group.add(tubOuter);

    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(2.64, 0.13, 1.2),
      makeSoapboxMat('#e2e8f0', 0.2, 0.2)
    );
    rim.position.y = 0.36;
    group.add(rim);

    const water = new THREE.Mesh(
      new THREE.BoxGeometry(2.35, 0.08, 0.94),
      makeSoapboxMat('#38bdf8', 0.15, 0.1)
    );
    water.position.y = 0.4;
    group.add(water);

    // 4 Golden Claw Feet
    [
      [-0.82, 0.42],
      [-0.82, -0.42],
      [0.82, 0.42],
      [0.82, -0.42],
    ].forEach(([x, z]) => {
      const foot = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 10, 10),
        makeSoapboxMat('#facc15', 0.22, 0.75)
      );
      foot.position.set(x, -0.34, z);
      group.add(foot);
    });

    // Golden Swan Faucet at front
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.42, 10),
      makeSoapboxMat('#facc15', 0.2, 0.8)
    );
    pipe.position.set(1.14, 0.56, 0);
    const spout = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.06, 0.06),
      makeSoapboxMat('#facc15', 0.2, 0.8)
    );
    spout.position.set(1.05, 0.74, 0);
    group.add(pipe, spout);

    // Overflowing white soap bubbles
    for (let i = 0; i < 12; i++) {
      const bubble = new THREE.Mesh(
        new THREE.SphereGeometry(0.13 + (i % 3) * 0.045, 10, 10),
        makeSoapboxMat('#ffffff', 0.14)
      );
      bubble.position.set(
        -0.88 + i * 0.155,
        0.46 + (i % 2) * 0.07,
        (((i * 7) % 5) - 2) * 0.19
      );
      group.add(bubble);
    }
    return;
  }

  if (id === 'sb_chassis_cart') {
    // Supermarket Wire Cart with chrome tubular chassis, wire mesh basket & red push handle!
    const baseTray = new THREE.Mesh(
      new THREE.BoxGeometry(2.15, 0.1, 1.02),
      makeSoapboxMat('#94a3b8', 0.25, 0.75)
    );
    baseTray.position.y = -0.22;
    group.add(baseTray);

    const wireMat = getCachedMat(
      'sb_wire_cart_mat',
      () =>
        new THREE.MeshStandardMaterial({
          color: '#e2e8f0',
          wireframe: true,
          roughness: 0.2,
          metalness: 0.8,
        })
    );
    const basket = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.68, 1.06),
      wireMat
    );
    basket.position.set(0.05, 0.16, 0);
    group.add(basket);

    // Chrome top rail & bright red shopping cart push handle at rear
    const topRail = new THREE.Mesh(
      new THREE.BoxGeometry(2.18, 0.06, 1.1),
      makeSoapboxMat('#cbd5e1', 0.2, 0.8)
    );
    topRail.position.set(0.05, 0.5, 0);
    group.add(topRail);

    const handleBar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 1.14, 12),
      makeSoapboxMat('#ef4444', 0.3)
    );
    handleBar.rotation.x = Math.PI / 2;
    handleBar.position.set(-1.12, 0.58, 0);
    group.add(handleBar);
    return;
  }

  // Vintage Cigar Streamliner ('sb_chassis_cigar') OR Backyard RB19 F1 Monocoque ('sb_chassis_f1')
  const isF1 = id === 'sb_chassis_f1';
  const hull = new THREE.Mesh(
    new THREE.CylinderGeometry(isF1 ? 0.33 : 0.44, isF1 ? 0.46 : 0.4, 2.82, 20),
    makeSoapboxMat(bodyHex, 0.22, 0.36)
  );
  hull.rotation.z = Math.PI / 2;
  hull.scale.set(1, isF1 ? 0.78 : 0.92, 0.88);
  hull.position.y = isF1 ? -0.04 : 0.04;
  group.add(hull);

  // Sidepods (for F1) or Classic Racing Trim Stripes (for Cigar Streamliner)
  [-0.48, 0.48].forEach((z) => {
    const pod = new THREE.Mesh(
      new THREE.BoxGeometry(isF1 ? 1.62 : 2.15, isF1 ? 0.3 : 0.16, isF1 ? 0.4 : 0.14),
      makeSoapboxMat(trimHex, 0.26, 0.28)
    );
    pod.position.set(-0.08, isF1 ? -0.08 : 0.04, z);
    group.add(pod);
  });

  if (isF1) {
    // Sculpted Front F1 Multi-Element Nose Wing + Cockpit Halo Bar
    const frontWing = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.06, 1.48),
      makeSoapboxMat(accentHex, 0.25, 0.3)
    );
    frontWing.position.set(1.42, -0.22, 0);
    group.add(frontWing);

    [-0.72, 0.72].forEach((z) => {
      const endplate = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.2, 0.04),
        makeSoapboxMat(trimHex, 0.25)
      );
      endplate.position.set(1.42, -0.15, z);
      group.add(endplate);
    });
  }

  // Windscreen Visor + Roll Hoop behind cockpit
  const windscreen = new THREE.Mesh(
    new THREE.ConeGeometry(0.34, 0.48, 12, 1, false, 0, Math.PI),
    getCachedMat(
      'sb_windscreen_glass',
      () =>
        new THREE.MeshStandardMaterial({
          color: '#38bdf8',
          transparent: true,
          opacity: 0.68,
          roughness: 0.1,
          metalness: 0.45,
        })
    )
  );
  windscreen.rotation.z = -Math.PI / 3;
  windscreen.position.set(0.54, 0.36, 0);
  group.add(windscreen);

  const hoop = new THREE.Mesh(
    new THREE.TorusGeometry(0.3, 0.045, 8, 16, Math.PI),
    makeSoapboxMat(accentHex, 0.22, 0.75)
  );
  hoop.rotation.y = Math.PI / 2;
  hoop.position.set(-0.48, 0.36, 0);
  group.add(hoop);
}

function buildSteeringAxleMesh(
  steeringGroup: THREE.Group,
  sprungGroup: THREE.Group,
  id: string,
  halfTrackZ: number,
  trimHex: string,
  frontSteerNodes: THREE.Object3D[]
): void {
  const axleX = 0.82;
  const rearAxleX = -0.82;
  const axleY = -0.34;

  // Front Axle Crossbeam
  const isRope = id === 'sb_steer_rope';
  const isKart = id === 'sb_steer_kart';
  const isWishbone = id === 'sb_steer_wishbone';
  const isBallast = id === 'sb_steer_ballast';
  const isCaster = id === 'sb_steer_caster';

  const beamMat = isRope
    ? makeSoapboxMat('#b45309', 0.75, 0.05)
    : isCaster
    ? makeSoapboxMat('#a855f7', 0.25, 0.8)
    : makeSoapboxMat(isWishbone ? trimHex : '#334155', 0.35, 0.7);

  if (isRope) {
    // 2x4 Pine Plank Front Axle + Clothesline Rope loops running back to cockpit
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.07, halfTrackZ * 2),
      beamMat
    );
    plank.position.set(axleX, axleY, 0);
    steeringGroup.add(plank);

    [-0.36, 0.36].forEach((z) => {
      const rope = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.014, 0.68, 6),
        makeSoapboxMat('#fde68a', 0.8)
      );
      rope.rotation.z = 0.65;
      rope.position.set(0.58, 0.02, z);
      steeringGroup.add(rope);
    });
  } else {
    // Tubular Chromoly Front & Rear Axles
    [axleX, rearAxleX].forEach((x) => {
      const bar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.042, 0.042, halfTrackZ * 2, 10),
        beamMat
      );
      bar.rotation.x = Math.PI / 2;
      bar.position.set(x, axleY, 0);
      steeringGroup.add(bar);
    });

    if (isKart) {
      // Go-Kart Ackermann Tie-Rod Linkage + Gold Heim Joints in front of axle
      const tieRod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, halfTrackZ * 1.65, 8),
        makeSoapboxMat('#cbd5e1', 0.25, 0.85)
      );
      tieRod.rotation.x = Math.PI / 2;
      tieRod.position.set(axleX + 0.14, axleY + 0.04, 0);
      steeringGroup.add(tieRod);

      [-1, 1].forEach((side) => {
        const heim = new THREE.Mesh(
          new THREE.SphereGeometry(0.045, 8, 8),
          makeSoapboxMat('#eab308', 0.25, 0.8)
        );
        heim.position.set(axleX + 0.14, axleY + 0.04, side * halfTrackZ * 0.82);
        steeringGroup.add(heim);
      });
    }

    if (isWishbone) {
      // Upper A-Arm Wishbones for wide anti-roll stance
      [-1, 1].forEach((side) => {
        const upperArm = new THREE.Mesh(
          new THREE.CylinderGeometry(0.028, 0.028, halfTrackZ * 0.85, 8),
          makeSoapboxMat('#facc15', 0.25, 0.7)
        );
        upperArm.rotation.x = Math.PI / 2;
        upperArm.position.set(axleX, axleY + 0.11, side * halfTrackZ * 0.55);
        steeringGroup.add(upperArm);
      });
    }

    if (isCaster) {
      // Swivel Caster Drift Bar: Anodized Cyan Drift Link + Dual Swivel Caster Brackets + Hydraulic Drift Lever
      const driftBar = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 0.06, halfTrackZ * 1.75),
        makeSoapboxMat('#22d3ee', 0.2, 0.8)
      );
      driftBar.position.set(axleX + 0.14, axleY + 0.06, 0);
      steeringGroup.add(driftBar);

      [-1, 1].forEach((side) => {
        const swivelRing = new THREE.Mesh(
          new THREE.TorusGeometry(0.09, 0.025, 8, 12),
          makeSoapboxMat('#f43f5e', 0.25, 0.75)
        );
        swivelRing.rotation.x = Math.PI / 2;
        swivelRing.position.set(axleX, axleY + 0.09, side * (halfTrackZ - 0.12));
        steeringGroup.add(swivelRing);
      });

      const driftStick = new THREE.Mesh(
        new THREE.CylinderGeometry(0.024, 0.03, 0.56, 8),
        makeSoapboxMat('#22d3ee', 0.2, 0.85)
      );
      driftStick.position.set(0.18, 0.36, -0.48);
      driftStick.rotation.z = -0.22;
      sprungGroup.add(driftStick);
    }
  }

  if (isBallast) {
    // Heavy Low-Slung Lead Belly Ballast Keel Bar bolted under the front axle!
    const leadKeel = new THREE.Mesh(
      new THREE.BoxGeometry(0.75, 0.14, 0.68),
      makeSoapboxMat('#1e293b', 0.4, 0.85)
    );
    leadKeel.position.set(0.45, axleY - 0.06, 0);
    const goldStripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.77, 0.04, 0.7),
      makeSoapboxMat('#facc15', 0.25, 0.7)
    );
    goldStripe.position.set(0.45, axleY - 0.06, 0);
    steeringGroup.add(leadKeel, goldStripe);
  }

  // Cockpit Steering Wheel (rotates with steerAngle!)
  const steerWheelPivot = new THREE.Group();
  steerWheelPivot.position.set(0.44, 0.48, 0);
  const wheelRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.15, 0.028, 8, 16),
    makeSoapboxMat('#0f172a', 0.45)
  );
  wheelRing.rotation.y = Math.PI / 2;
  const spoke = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.28, 0.04),
    makeSoapboxMat('#e2e8f0', 0.3, 0.7)
  );
  steerWheelPivot.add(wheelRing, spoke);
  sprungGroup.add(steerWheelPivot);
  frontSteerNodes.push(steerWheelPivot);
}

function buildFourWheelsMesh(
  wheelsGroup: THREE.Group,
  wheelsId: string,
  brakesId: string,
  halfTrackZ: number,
  wheelRadius: number,
  frontSteerNodes: THREE.Object3D[],
  wheelSpinners: THREE.Object3D[]
): void {
  const isWagon = wheelsId === 'sb_wheels_wagon';
  const isSlicks = wheelsId === 'sb_wheels_slicks';
  const isOffroad = wheelsId === 'sb_wheels_offroad';
  const isMonster = wheelsId === 'sb_wheels_monster';
  const isCheese = wheelsId === 'sb_wheels_cheese';
  const hasDiscBrakes = brakesId === 'sb_brake_disc';

  const tireWidth = isMonster
    ? 0.28
    : isSlicks
    ? 0.24
    : isOffroad
    ? 0.22
    : isWagon
    ? 0.08
    : 0.19;

  const tireColor = isCheese ? '#facc15' : '#0f172a';
  const rimColor = isCheese
    ? '#f97316'
    : isWagon
    ? '#dc2626'
    : isMonster
    ? '#22c55e'
    : isSlicks
    ? '#eab308'
    : '#38bdf8';

  const tireGeo = getCachedGeo(`sb_tire_${wheelRadius}_${tireWidth}`, () => {
    const g = new THREE.CylinderGeometry(wheelRadius, wheelRadius, tireWidth, 20);
    g.rotateX(Math.PI / 2);
    return g;
  });

  const rimGeo = getCachedGeo(`sb_rim_${wheelRadius}_${tireWidth}`, () => {
    const g = new THREE.CylinderGeometry(
      wheelRadius * 0.54,
      wheelRadius * 0.54,
      tireWidth + 0.02,
      14
    );
    g.rotateX(Math.PI / 2);
    return g;
  });

  const spokeBarGeo = getCachedGeo(`sb_spoke_${wheelRadius}_${tireWidth}`, () =>
    new THREE.BoxGeometry(wheelRadius * 1.45, 0.045, tireWidth + 0.03)
  );

  const tireMat = makeSoapboxMat(tireColor, isCheese ? 0.45 : 0.68, 0.08);
  const rimMat = makeSoapboxMat(rimColor, 0.28, 0.55);

  const wheelPositions: Array<{ x: number; z: number; isFront: boolean }> = [
    { x: 0.82, z: halfTrackZ, isFront: true },
    { x: 0.82, z: -halfTrackZ, isFront: true },
    { x: -0.82, z: halfTrackZ, isFront: false },
    { x: -0.82, z: -halfTrackZ, isFront: false },
  ];

  wheelPositions.forEach(({ x, z, isFront }) => {
    // Steer Knuckle Pivot (rotates around Y on front axle!)
    const knucklePivot = new THREE.Group();
    knucklePivot.position.set(x, -0.34, z);
    if (isFront) {
      frontSteerNodes.push(knucklePivot);
    }

    // Optional Vented Disc Rotor & Red Caliper inside knuckle
    if (hasDiscBrakes) {
      const discGeo = getCachedGeo('sb_brake_disc_rotor', () => {
        const g = new THREE.CylinderGeometry(0.16, 0.16, 0.025, 16);
        g.rotateX(Math.PI / 2);
        return g;
      });
      const disc = new THREE.Mesh(discGeo, makeSoapboxMat('#cbd5e1', 0.2, 0.85));
      disc.position.z = z > 0 ? -0.08 : 0.08;
      const caliper = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.12, 0.06),
        makeSoapboxMat('#ef4444', 0.3, 0.4)
      );
      caliper.position.set(-0.08, 0.08, z > 0 ? -0.08 : 0.08);
      knucklePivot.add(disc, caliper);
    }

    // Spinning Wheel Group (rotates around Z as car rolls forward!)
    const spinner = new THREE.Group();
    const tireMesh = new THREE.Mesh(tireGeo, tireMat);
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    const spoke1 = new THREE.Mesh(spokeBarGeo, rimMat);
    const spoke2 = new THREE.Mesh(spokeBarGeo, rimMat);
    spoke2.rotation.z = Math.PI / 2;
    spinner.add(tireMesh, rimMesh, spoke1, spoke2);

    // Add 3D Knobby Lugs for Off-Road / Monster tires
    if (isOffroad || isMonster) {
      const lugGeo = getCachedGeo(`sb_lug_${wheelRadius}`, () =>
        new THREE.BoxGeometry(0.06, 0.045, tireWidth * 0.92)
      );
      for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI) / 4;
        const lug = new THREE.Mesh(lugGeo, tireMat);
        lug.position.set(
          Math.cos(ang) * (wheelRadius + 0.01),
          Math.sin(ang) * (wheelRadius + 0.01),
          0
        );
        lug.rotation.z = ang + Math.PI / 2;
        spinner.add(lug);
      }
    }

    // Add 3D Gouda Cheese Dimples on the outer wheel face for Cheese Rounds
    if (isCheese) {
      const holeGeo = getCachedGeo('sb_cheese_hole', () =>
        new THREE.SphereGeometry(0.042, 8, 8)
      );
      const holeMat = makeSoapboxMat('#d97706', 0.5, 0.05);
      for (let i = 0; i < 5; i++) {
        const ang = (i * Math.PI * 2) / 5 + 0.3;
        const hole = new THREE.Mesh(holeGeo, holeMat);
        hole.position.set(
          Math.cos(ang) * (wheelRadius * 0.68),
          Math.sin(ang) * (wheelRadius * 0.68),
          z > 0 ? tireWidth * 0.48 : -tireWidth * 0.48
        );
        spinner.add(hole);
      }
    }

    wheelSpinners.push(spinner);
    knucklePivot.add(spinner);
    wheelsGroup.add(knucklePivot);
  });
}

function buildSuspensionMesh(
  suspensionGroup: THREE.Group,
  id: string,
  halfTrackZ: number,
  shockSpringMeshes: THREE.Object3D[]
): void {
  const shockColor =
    id === 'sb_susp_coilover'
      ? '#eab308'
      : id === 'sb_susp_pogo'
      ? '#22d3ee'
      : id === 'sb_susp_leaf'
      ? '#475569'
      : '#92400e';

  const springZ = Math.max(0.42, halfTrackZ - 0.16);

  [-0.78, 0.78].forEach((x) => {
    [-springZ, springZ].forEach((z) => {
      const shockUnit = new THREE.Group();
      shockUnit.position.set(x, -0.18, z);

      if (id === 'sb_susp_rigid') {
        const block = new THREE.Mesh(
          new THREE.BoxGeometry(0.14, 0.28, 0.12),
          makeSoapboxMat(shockColor, 0.75)
        );
        shockUnit.add(block);
      } else if (id === 'sb_susp_leaf') {
        const leafPack = new THREE.Mesh(
          new THREE.BoxGeometry(0.48, 0.08, 0.09),
          makeSoapboxMat(shockColor, 0.4, 0.7)
        );
        const damper = new THREE.Mesh(
          new THREE.CylinderGeometry(0.045, 0.045, 0.34, 8),
          makeSoapboxMat('#f97316', 0.3, 0.5)
        );
        shockUnit.add(leafPack, damper);
      } else {
        // Pogo-Stick Coils or Rally Nitrogen Piggyback Coilovers
        const coil = new THREE.Mesh(
          new THREE.CylinderGeometry(0.075, 0.075, 0.4, 10),
          makeSoapboxMat(shockColor, 0.25, 0.55)
        );
        shockUnit.add(coil);

        if (id === 'sb_susp_pogo') {
          const plunger = new THREE.Mesh(
            new THREE.CylinderGeometry(0.032, 0.032, 0.54, 8),
            makeSoapboxMat('#f8fafc', 0.18, 0.88)
          );
          const bounceCap = new THREE.Mesh(
            new THREE.SphereGeometry(0.065, 8, 8),
            makeSoapboxMat('#ec4899', 0.3, 0.4)
          );
          bounceCap.position.y = 0.24;
          shockUnit.add(plunger, bounceCap);
        }

        if (id === 'sb_susp_coilover') {
          const reservoir = new THREE.Mesh(
            new THREE.CylinderGeometry(0.038, 0.038, 0.22, 8),
            makeSoapboxMat('#ef4444', 0.2, 0.75)
          );
          reservoir.position.set(0.08, 0.06, 0);
          shockUnit.add(reservoir);
        }
      }

      shockSpringMeshes.push(shockUnit);
      suspensionGroup.add(shockUnit);
    });
  });
}

function buildBrakesMesh(
  brakesGroup: THREE.Group,
  id: string,
  trimHex: string
): void {
  if (id === 'sb_brake_plow') {
    // Armored Locomotive Cowcatcher Steel Hay-Plow Wedge at the Front Nose!
    const plowWedge = new THREE.Mesh(
      new THREE.ConeGeometry(0.52, 0.72, 4),
      makeSoapboxMat('#ef4444', 0.3, 0.65)
    );
    plowWedge.rotation.z = -Math.PI / 2;
    plowWedge.rotation.x = Math.PI / 4;
    plowWedge.position.set(1.52, -0.08, 0);

    const steelBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.14, 1.38),
      makeSoapboxMat('#facc15', 0.25, 0.7)
    );
    steelBar.position.set(1.24, -0.18, 0);
    brakesGroup.add(plowWedge, steelBar);
    return;
  }

  if (id === 'sb_brake_anchor') {
    // Cast-Iron Harbor Anchor mounted at the Rear Tail!
    const shank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.76, 10),
      makeSoapboxMat('#334155', 0.35, 0.85)
    );
    shank.position.set(-1.34, 0.12, 0);
    const fluke = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.055, 8, 14, Math.PI),
      makeSoapboxMat('#334155', 0.35, 0.85)
    );
    fluke.rotation.z = Math.PI;
    fluke.position.set(-1.34, -0.14, 0);
    brakesGroup.add(shank, fluke);
    return;
  }

  if (id === 'sb_brake_shoe') {
    // Flintstone Shoe-Sole Sneakers poking under the floorboard!
    [-0.18, 0.18].forEach((z) => {
      const shoe = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.12, 0.13),
        makeSoapboxMat('#ef4444', 0.5)
      );
      shoe.position.set(0.25, -0.38, z);
      const sole = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.04, 0.14),
        makeSoapboxMat('#f8fafc', 0.4)
      );
      sole.position.set(0.25, -0.44, z);
      brakesGroup.add(shoe, sole);
    });
    return;
  }

  // 2x4 Wood Tire Scrub Lever (or handbrake lever for disc brakes)
  const lever = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.78, 0.1),
    makeSoapboxMat(id === 'sb_brake_disc' ? trimHex : '#b45309', 0.6)
  );
  lever.position.set(-0.62, 0.22, 0.54);
  lever.rotation.z = 0.28;
  brakesGroup.add(lever);

  if (id === 'sb_brake_wood') {
    // Hinged Pine Scrub Paddles ahead of the rear wheels
    [-0.58, 0.58].forEach((z) => {
      const scrubPad = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.26, 0.22),
        makeSoapboxMat('#b45309', 0.75, 0.05)
      );
      scrubPad.position.set(-0.54, -0.28, z);
      scrubPad.rotation.z = -0.25;
      brakesGroup.add(scrubPad);
    });
  }
}

function buildTopperMesh(
  group: THREE.Group,
  id: string,
  trimHex: string
): void {
  if (id === 'sb_topper_none') return;

  if (id === 'sb_topper_gtwing') {
    // Swan-Neck Dual-Element Rear GT Downforce Wing!
    [-0.36, 0.36].forEach((z) => {
      const pylon = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.72, 0.05),
        makeSoapboxMat('#0f172a', 0.35, 0.5)
      );
      pylon.position.set(-1.12, 0.52, z);
      pylon.rotation.z = 0.15;
      group.add(pylon);
    });

    const mainPlane = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.07, 1.72),
      makeSoapboxMat(trimHex, 0.22, 0.35)
    );
    mainPlane.position.set(-1.18, 0.88, 0);
    mainPlane.rotation.z = 0.18;
    group.add(mainPlane);

    [-0.86, 0.86].forEach((z) => {
      const endplate = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.32, 0.04),
        makeSoapboxMat('#facc15', 0.25)
      );
      endplate.position.set(-1.18, 0.88, z);
      group.add(endplate);
    });
    return;
  }

  if (id === 'sb_topper_shadow') {
    // SHADOW — Sculpted 3D Golden Retriever Co-Pilot behind/above the driver!
    const dog = new THREE.Group();
    dog.position.set(-0.52, 0.42, 0);
    dog.scale.setScalar(0.88);

    const goldMat = makeSoapboxMat('#f59e0b', 0.52);
    const lightGoldMat = makeSoapboxMat('#fde68a', 0.58);
    const earGoldMat = makeSoapboxMat('#d97706', 0.55);
    const darkMat = makeSoapboxMat('#0f172a', 0.2);

    [
      [-0.34, 0.18],
      [-0.34, -0.18],
      [0.32, 0.18],
      [0.32, -0.18],
    ].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.07, 0.38, 10),
        goldMat
      );
      leg.position.set(lx, 0.19, lz);
      dog.add(leg);
    });

    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.24, 0.82, 14),
      goldMat
    );
    torso.rotation.z = Math.PI / 2;
    torso.position.set(0, 0.44, 0);
    dog.add(torso);

    const chestRuff = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.22, 1),
      lightGoldMat
    );
    chestRuff.position.set(0.42, 0.44, 0);
    dog.add(chestRuff);

    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.21, 0.04, 8, 16),
      makeSoapboxMat('#ef4444', 0.4)
    );
    collar.rotation.y = Math.PI / 2;
    collar.position.set(0.42, 0.62, 0);
    dog.add(collar);

    const headGroup = new THREE.Group();
    headGroup.position.set(0.5, 0.78, 0);
    const cranium = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 14, 12),
      goldMat
    );
    const muzzle = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.16, 0.2),
      lightGoldMat
    );
    muzzle.position.set(0.22, -0.02, 0);
    const nose = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 8, 8),
      darkMat
    );
    nose.position.set(0.36, 0.02, 0);
    const tongue = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.035, 0.1),
      makeSoapboxMat('#f43f5e', 0.35)
    );
    tongue.position.set(0.26, -0.13, 0.04);
    tongue.rotation.z = -0.4;
    headGroup.add(cranium, muzzle, nose, tongue);

    [-0.13, 0.13].forEach((ez) => {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 8, 8),
        darkMat
      );
      eye.position.set(0.16, 0.07, ez);
      headGroup.add(eye);
    });

    [-1, 1].forEach((side) => {
      const ear = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.28, 0.06),
        earGoldMat
      );
      ear.position.set(-0.02, -0.05, side * 0.23);
      headGroup.add(ear);
    });
    dog.add(headGroup);

    const tail = new THREE.Mesh(
      new THREE.ConeGeometry(0.09, 0.44, 8),
      lightGoldMat
    );
    tail.rotation.z = 1.1;
    tail.position.set(-0.58, 0.58, 0);
    dog.add(tail);

    group.add(dog);
    return;
  }

  if (id === 'sb_topper_boomer') {
    // BOOMER — Sculpted 3D Blue / Harlequin Great Dane Mascot!
    const dane = new THREE.Group();
    dane.position.set(-0.52, 0.42, 0);
    dane.scale.setScalar(0.88);

    const blueCoatMat = makeSoapboxMat('#475569', 0.38);
    const whiteMat = makeSoapboxMat('#f8fafc', 0.4);
    const darkMat = makeSoapboxMat('#0f172a', 0.35);
    const collarMat = makeSoapboxMat('#2563eb', 0.3, 0.3);

    [
      [-0.36, 0.19],
      [-0.36, -0.19],
      [0.34, 0.19],
      [0.34, -0.19],
    ].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.055, 0.54, 10),
        blueCoatMat
      );
      leg.position.set(lx, 0.27, lz);
      dane.add(leg);
    });

    const deepChest = new THREE.Mesh(
      new THREE.SphereGeometry(0.29, 14, 12),
      blueCoatMat
    );
    deepChest.scale.set(1.22, 1.15, 0.86);
    deepChest.position.set(0.2, 0.62, 0);

    const waist = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.26, 0.6, 12),
      whiteMat
    );
    waist.rotation.z = Math.PI / 2;
    waist.position.set(-0.14, 0.64, 0);
    dane.add(deepChest, waist);

    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.19, 0.44, 10),
      blueCoatMat
    );
    neck.position.set(0.42, 0.88, 0);
    neck.rotation.z = -0.32;
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.17, 0.038, 8, 16),
      collarMat
    );
    collar.rotation.y = Math.PI / 2;
    collar.position.set(0.4, 0.82, 0);
    dane.add(neck, collar);

    const headGroup = new THREE.Group();
    headGroup.position.set(0.54, 1.1, 0);
    const skull = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.26, 0.26),
      blueCoatMat
    );
    const muzzle = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.18, 0.21),
      whiteMat
    );
    muzzle.position.set(0.24, -0.02, 0);
    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.11),
      darkMat
    );
    nose.position.set(0.42, 0.02, 0);
    headGroup.add(skull, muzzle, nose);

    [-1, 1].forEach((side) => {
      const ear = new THREE.Mesh(
        new THREE.ConeGeometry(0.1, 0.25, 4),
        darkMat
      );
      ear.rotation.x = Math.PI + side * 0.3;
      ear.position.set(-0.04, 0.05, side * 0.18);
      headGroup.add(ear);
    });
    dane.add(headGroup);

    const tail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.055, 0.56, 8),
      darkMat
    );
    tail.rotation.z = 1.15;
    tail.position.set(-0.62, 0.72, 0);
    dane.add(tail);

    group.add(dane);
    return;
  }

  if (id === 'sb_topper_taco') {
    const taco = new THREE.Group();
    taco.position.set(-0.55, 0.55, 0);
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.46, 1.25, 16, 1, false, 0, Math.PI),
      makeSoapboxMat('#facc15', 0.55)
    );
    shell.rotation.z = Math.PI / 2;
    shell.rotation.x = Math.PI;
    shell.position.y = 0.28;
    taco.add(shell);

    for (let i = -2; i <= 2; i++) {
      const lettuce = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.17, 1),
        makeSoapboxMat('#22c55e', 0.5)
      );
      lettuce.position.set(i * 0.22, 0.36, 0);
      const tomato = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 0.12),
        makeSoapboxMat('#ef4444', 0.3)
      );
      tomato.position.set(i * 0.2, 0.48, (i % 2) * 0.1);
      taco.add(lettuce, tomato);
    }
    group.add(taco);
    return;
  }

  if (id === 'sb_topper_trex') {
    const dino = new THREE.Group();
    dino.position.set(-0.52, 0.45, 0);
    const greenMat = makeSoapboxMat('#16a34a', 0.42);
    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.3, 0.72, 12),
      greenMat
    );
    torso.position.set(0, 0.45, 0);
    torso.rotation.z = -0.35;
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.28, 0.32),
      greenMat
    );
    head.position.set(0.28, 0.85, 0);
    const jaw = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.1, 0.26),
      makeSoapboxMat('#15803d', 0.45)
    );
    jaw.position.set(0.32, 0.68, 0);
    jaw.rotation.z = -0.32;
    const tail = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.85, 10),
      greenMat
    );
    tail.rotation.z = 1.35;
    tail.position.set(-0.52, 0.36, 0);
    dino.add(torso, head, jaw, tail);
    group.add(dino);
    return;
  }

  if (id === 'sb_topper_couch') {
    const sofa = new THREE.Group();
    sofa.position.set(-0.48, 0.46, 0);
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.24, 1.52),
      makeSoapboxMat('#ea580c', 0.65)
    );
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.56, 1.52),
      makeSoapboxMat('#c2410c', 0.7)
    );
    back.position.set(-0.34, 0.28, 0);
    sofa.add(base, back);
    group.add(sofa);
    return;
  }

  if (id === 'sb_topper_disco') {
    const disco = new THREE.Group();
    disco.position.set(-0.52, 0.5, 0);
    const boombox = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.32, 0.92),
      makeSoapboxMat('#ec4899', 0.3, 0.4)
    );
    const ball = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.38, 2),
      getCachedMat(
        'sb_disco_ball_mat',
        () =>
          new THREE.MeshStandardMaterial({
            color: '#f8fafc',
            roughness: 0.08,
            metalness: 0.92,
            flatShading: true,
          })
      )
    );
    ball.position.y = 0.54;
    disco.add(boombox, ball);
    group.add(disco);
  }
}

function buildDriverMesh(
  driverGroup: THREE.Group,
  suitHex: string,
  helmetHex: string
): void {
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.19, 0.48, 12),
    makeSoapboxMat(suitHex, 0.42)
  );
  torso.position.set(0.08, 0.4, 0);

  [-0.2, 0.2].forEach((z) => {
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.045, 0.36, 8),
      makeSoapboxMat('#f8fafc', 0.45)
    );
    arm.position.set(0.24, 0.44, z);
    arm.rotation.z = -1.15;
    driverGroup.add(arm);
  });

  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.21, 16, 16),
    makeSoapboxMat(helmetHex, 0.18, 0.35)
  );
  helmet.position.set(0.1, 0.76, 0);

  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.11, 0.28),
    makeSoapboxMat('#0f172a', 0.1, 0.85)
  );
  visor.position.set(0.24, 0.76, 0);

  driverGroup.add(torso, helmet, visor);
}

function buildPushCrewMesh(
  crewGroup: THREE.Group,
  jerseyHex: string,
  accentHex: string
): void {
  const offsets: Array<[number, number, number]> = [
    [-1.85, -0.28, 0.72],
    [-1.85, -0.28, -0.72],
    [-2.5, -0.28, 0.44],
    [-2.5, -0.28, -0.44],
  ];

  const bodyGeo = getCachedGeo('sb_crew_body', () =>
    new THREE.CylinderGeometry(0.14, 0.15, 0.56, 10)
  );
  const headGeo = getCachedGeo('sb_crew_head', () =>
    new THREE.SphereGeometry(0.15, 10, 10)
  );
  const armGeo = getCachedGeo('sb_crew_arm', () =>
    new THREE.CylinderGeometry(0.042, 0.038, 0.32, 8)
  );
  const skinMat = makeSoapboxMat('#fde68a', 0.4);

  offsets.forEach(([x, y, z], idx) => {
    const runner = new THREE.Group();
    const body = new THREE.Mesh(
      bodyGeo,
      makeSoapboxMat(idx % 2 === 0 ? jerseyHex : accentHex, 0.45)
    );
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 0.4;

    [-0.16, 0.16].forEach((az) => {
      const arm = new THREE.Mesh(armGeo, skinMat);
      arm.position.set(0.18, 0.12, az);
      arm.rotation.z = -1.2;
      runner.add(arm);
    });

    runner.add(body, head);
    runner.position.set(x, y, z);
    crewGroup.add(runner);
  });
}

function createSocketMarkers(
  sprungGroup: THREE.Group,
  unsprungGroup: THREE.Group,
  halfTrackZ: number
): Record<SoapboxPartCategory, THREE.Mesh> {
  const ringGeo = getCachedGeo('sb_socket_ring_geo', () => {
    const g = new THREE.RingGeometry(0.22, 0.36, 24);
    g.rotateX(-Math.PI / 2);
    return g;
  });

  const hitDiscGeo = getCachedGeo('sb_socket_hit_geo', () => {
    const g = new THREE.CircleGeometry(0.38, 20);
    g.rotateX(-Math.PI / 2);
    return g;
  });

  const hitDiscMat = getCachedMat(
    'sb_socket_hit_mat',
    () =>
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.01,
        depthWrite: false,
      })
  );

  const makeRing = (
    category: SoapboxPartCategory,
    color: number,
    pos: [number, number, number],
    parent: THREE.Group
  ) => {
    const mat = getCachedMat(
      `sb_socket_ring_${color}`,
      () =>
        new THREE.MeshBasicMaterial({
          color,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85,
        })
    );
    const mesh = new THREE.Mesh(ringGeo, mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.userData = { isSocketMarker: true, category };

    const hitDisc = new THREE.Mesh(hitDiscGeo, hitDiscMat);
    hitDisc.userData = { isSocketMarker: true, category };
    mesh.add(hitDisc);

    parent.add(mesh);
    return mesh;
  };

  return {
    chassis: makeRing('chassis', 0x38bdf8, [0.1, 0.15, 0], sprungGroup),
    steering: makeRing('steering', 0xfacc15, [0.85, -0.25, 0], unsprungGroup),
    wheels: makeRing('wheels', 0x22c55e, [0.82, -0.34, halfTrackZ + 0.15], unsprungGroup),
    suspension: makeRing('suspension', 0xa855f7, [-0.75, -0.1, halfTrackZ * 0.75], unsprungGroup),
    brakes: makeRing('brakes', 0xef4444, [1.38, -0.05, 0], sprungGroup),
    topper: makeRing('topper', 0xf472b6, [-0.52, 0.82, 0], sprungGroup),
  };
}
