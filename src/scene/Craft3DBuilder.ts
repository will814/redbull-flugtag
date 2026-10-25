import * as THREE from 'three';
import {
  CraftLoadout,
  getPartById,
  PAINT_THEMES,
  PartCategory,
} from '../builder/PartCatalog';

export interface Craft3DGroups {
  root: THREE.Group;
  airframeGroup: THREE.Group;
  chassisGroup: THREE.Group;
  wingsGroup: THREE.Group;
  tailGroup: THREE.Group;
  noseGroup: THREE.Group;
  topperGroup: THREE.Group;
  pilotGroup: THREE.Group;
  trolleyGroup: THREE.Group;
  crewGroup: THREE.Group;
  socketMarkers: Record<PartCategory, THREE.Mesh>;
  propSpinner: THREE.Object3D | null;
}

function makeMat(
  hex: string | number,
  roughness = 0.38,
  metalness = 0.12
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    roughness,
    metalness,
  });
}

/**
 * Creates a true cambered airfoil 3D wing geometry extruded along the span (Z axis).
 */
function createAirfoilGeometry(chord: number, thickness: number, span: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const halfC = chord / 2;
  // Start at trailing edge (-halfC, 0), curve over cambered top to leading edge (+halfC, 0), then flat/cambered bottom
  shape.moveTo(-halfC, 0);
  shape.bezierCurveTo(
    -halfC * 0.2,
    thickness * 0.85,
    halfC * 0.55,
    thickness * 1.15,
    halfC,
    0.02 * thickness
  );
  shape.bezierCurveTo(
    halfC * 0.6,
    -thickness * 0.45,
    -halfC * 0.2,
    -thickness * 0.2,
    -halfC,
    0
  );

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: span,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.015,
    bevelSegments: 2,
    curveSegments: 12,
  });
  // Center along Z axis
  geo.translate(0, 0, -span / 2);
  return geo;
}

export function buildCraft3D(loadout: CraftLoadout): Craft3DGroups {
  const root = new THREE.Group();
  const airframeGroup = new THREE.Group();
  const chassisGroup = new THREE.Group();
  const wingsGroup = new THREE.Group();
  const tailGroup = new THREE.Group();
  const noseGroup = new THREE.Group();
  const topperGroup = new THREE.Group();
  const pilotGroup = new THREE.Group();
  const trolleyGroup = new THREE.Group();
  const crewGroup = new THREE.Group();

  airframeGroup.add(chassisGroup, wingsGroup, tailGroup, noseGroup, topperGroup, pilotGroup);
  root.add(airframeGroup, trolleyGroup, crewGroup);

  const theme = PAINT_THEMES.find((t) => t.id === loadout.paintTheme) || PAINT_THEMES[0];
  const chassisPart = getPartById(loadout.chassis);
  const wingsPart = getPartById(loadout.wings);
  const tailPart = getPartById(loadout.tail);
  const nosePart = getPartById(loadout.nose);
  const topperPart = getPartById(loadout.topper);
  const trolleyPart = getPartById(loadout.trolley);

  // 1. CHASSIS / FUSELAGE (+X = nose, +Y = up, +Z = right wing)
  buildChassisMesh(chassisGroup, chassisPart.id, theme.bodyHex, theme.stripeHex);

  // 2. MAIN WINGS (Symmetric along +/- Z axis)
  buildWingsMesh(wingsGroup, wingsPart.id, theme.wingHex, theme.stripeHex);

  // 3. TAIL STABILIZER (At -X rear)
  buildTailMesh(tailGroup, tailPart.id, theme.stripeHex, theme.wingHex);

  // 4. NOSE CONE (At +X front)
  const propSpinner = buildNoseMesh(noseGroup, nosePart.id, theme.stripeHex, theme.wingHex);

  // 5. FUNNY TOPPER (Mounted atop the wing/cockpit)
  buildTopperMesh(topperGroup, topperPart.id);

  // 6. PILOT (Seated in cockpit with life vest & helmet)
  buildPilotMesh(pilotGroup);

  // 7. DETACHABLE LAUNCH TROLLEY (Underneath)
  buildTrolleyMesh(trolleyGroup, trolleyPart.id);

  // 8. 4 PUSH CREW MEMBERS (Behind craft on the ramp)
  buildPushCrewMesh(crewGroup, theme.bodyHex);

  // 9. MAGNETIC SNAP SOCKET HALOS (For Hangar mode)
  const socketMarkers = createSocketMarkers(airframeGroup, trolleyGroup);

  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  return {
    root,
    airframeGroup,
    chassisGroup,
    wingsGroup,
    tailGroup,
    noseGroup,
    topperGroup,
    pilotGroup,
    trolleyGroup,
    crewGroup,
    socketMarkers,
    propSpinner,
  };
}

function buildChassisMesh(
  group: THREE.Group,
  id: string,
  bodyHex: string,
  stripeHex: string
): void {
  if (id === 'chassis_bathtub') {
    // Detailed Vintage Clawfoot Porcelain Bathtub with Swan Faucet, Bubbles & Rubber Ducky!
    const tubOuter = new THREE.Mesh(
      new THREE.CylinderGeometry(0.76, 0.6, 2.55, 20),
      makeMat('#f8fafc', 0.18, 0.15)
    );
    tubOuter.rotation.z = Math.PI / 2;
    tubOuter.scale.set(1, 1, 0.74);
    group.add(tubOuter);

    // Rolled porcelain top rim
    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(2.68, 0.14, 1.22),
      makeMat('#e2e8f0', 0.2, 0.2)
    );
    rim.position.y = 0.34;
    group.add(rim);

    // Warm bathwater surface inside
    const waterInside = new THREE.Mesh(
      new THREE.BoxGeometry(2.38, 0.08, 0.96),
      makeMat('#38bdf8', 0.15, 0.1)
    );
    waterInside.position.y = 0.38;
    group.add(waterInside);

    // 4 Golden Claw Feet underneath
    [
      [-0.85, 0.42],
      [-0.85, -0.42],
      [0.85, 0.42],
      [0.85, -0.42],
    ].forEach(([x, z]) => {
      const foot = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 10, 10),
        makeMat('#facc15', 0.25, 0.7)
      );
      foot.position.set(x, -0.42, z);
      group.add(foot);
    });

    // Golden Swan Faucet at front of tub
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.42, 10),
      makeMat('#facc15', 0.2, 0.8)
    );
    pipe.position.set(1.15, 0.55, 0);
    const spout = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.06, 0.06),
      makeMat('#facc15', 0.2, 0.8)
    );
    spout.position.set(1.06, 0.73, 0);
    group.add(pipe, spout);

    // Overflowing white soap bubbles
    for (let i = 0; i < 12; i++) {
      const bubble = new THREE.Mesh(
        new THREE.SphereGeometry(0.14 + (i % 3) * 0.05, 10, 10),
        makeMat('#ffffff', 0.15)
      );
      bubble.position.set(
        -0.9 + (i * 0.16),
        0.44 + (i % 2) * 0.08,
        ((i * 7) % 5 - 2) * 0.2
      );
      group.add(bubble);
    }
    return;
  }

  if (id === 'chassis_cardboard') {
    // Authentic Corrugated Shipping Box with Folded Flaps, Duct Tape & Fragile Label
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(2.55, 0.78, 1.08),
      makeMat('#c27b38', 0.85, 0.0)
    );
    group.add(box);

    // Open folded-out cardboard side flaps
    [-1, 1].forEach((side) => {
      const flap = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.05, 0.36),
        makeMat('#d9914c', 0.85, 0.0)
      );
      flap.position.set(-0.1, 0.36, side * 0.68);
      flap.rotation.x = side * 0.45;
      group.add(flap);
    });

    // Silver Duct Tape X-Bracing & Straps
    [-0.65, 0.65].forEach((x) => {
      const strap = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.82, 1.12),
        makeMat('#94a3b8', 0.35, 0.4)
      );
      strap.position.x = x;
      group.add(strap);
    });

    // White "THIS SIDE UP" Shipping Label on the sides
    const label = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.35, 1.11),
      makeMat('#f8fafc', 0.6)
    );
    label.position.set(0, 0.05, 0);
    group.add(label);
    return;
  }

  if (id === 'chassis_pirate') {
    // Sculpted Wooden Pirate Galleon with Raised Stern Quarterdeck, Prow & Side Cannons!
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(2.65, 0.76, 1.12),
      makeMat('#78350f', 0.7)
    );
    group.add(hull);

    // Tapered Wooden Bow Prow
    const prow = new THREE.Mesh(
      new THREE.ConeGeometry(0.65, 0.9, 4),
      makeMat('#78350f', 0.7)
    );
    prow.rotation.z = -Math.PI / 2;
    prow.rotation.x = Math.PI / 4;
    prow.position.set(1.55, 0.08, 0);
    group.add(prow);

    // Raised Stern Quarterdeck at the back
    const stern = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 0.42, 1.16),
      makeMat('#92400e', 0.65)
    );
    stern.position.set(-1.0, 0.45, 0);
    group.add(stern);

    // Gold Trim Band & 4 Black Broadside Cannons
    const goldBand = new THREE.Mesh(
      new THREE.BoxGeometry(2.7, 0.1, 1.16),
      makeMat('#facc15', 0.3, 0.6)
    );
    goldBand.position.y = 0.2;
    group.add(goldBand);

    [-0.45, 0.35].forEach((x) => {
      [-1, 1].forEach((side) => {
        const cannon = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.1, 0.38, 10),
          makeMat('#1e293b', 0.4, 0.7)
        );
        cannon.rotation.x = Math.PI / 2;
        cannon.position.set(x, 0.02, side * 0.62);
        group.add(cannon);
      });
    });
    return;
  }

  if (id === 'chassis_foam') {
    // Multi-Noodle Catamaran Surfboard with EVA Grip Deck & Cross-Braces
    const surfDeck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.58, 0.48, 2.75, 16),
      makeMat(bodyHex, 0.3)
    );
    surfDeck.rotation.z = Math.PI / 2;
    surfDeck.scale.set(1, 0.22, 1);
    surfDeck.position.y = 0.08;
    group.add(surfDeck);

    // Striped EVA Foam Grip Pad on top
    const gripPad = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.06, 0.75),
      makeMat(stripeHex, 0.6)
    );
    gripPad.position.y = 0.2;
    group.add(gripPad);

    // 4 Colorful Ribbed Pool Noodles underneath
    const noodleColors = ['#f43f5e', '#facc15', '#22c55e', '#38bdf8'];
    [-0.52, -0.22, 0.22, 0.52].forEach((z, idx) => {
      const noodle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 2.85, 14),
        makeMat(noodleColors[idx], 0.45)
      );
      noodle.rotation.z = Math.PI / 2;
      noodle.position.set(0, -0.18, z);
      group.add(noodle);
    });
    return;
  }

  // Sleek Balsa Wood Truss Frame OR Carbon Pro Pod
  const isCarbon = id === 'chassis_carbon';
  const fuselageGeo = new THREE.CylinderGeometry(0.45, 0.32, 2.65, 18);
  fuselageGeo.rotateZ(Math.PI / 2);
  const fuselage = new THREE.Mesh(
    fuselageGeo,
    makeMat(isCarbon ? '#0f172a' : bodyHex, isCarbon ? 0.2 : 0.35, isCarbon ? 0.4 : 0.15)
  );
  fuselage.scale.set(1, 0.88, 1.08);
  group.add(fuselage);

  // Structural Ribs / Carbon Trim Rings along fuselage
  [-0.9, -0.35, 0.35, 0.9].forEach((x) => {
    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(0.41, 0.035, 8, 20),
      makeMat(isCarbon ? '#22d3ee' : '#fef3c7', 0.3, 0.3)
    );
    rib.rotation.y = Math.PI / 2;
    rib.position.x = x;
    group.add(rib);
  });

  // Cockpit Windscreen Visor in front of pilot
  const windscreen = new THREE.Mesh(
    new THREE.ConeGeometry(0.36, 0.55, 12, 1, false, 0, Math.PI),
    new THREE.MeshStandardMaterial({
      color: '#38bdf8',
      transparent: true,
      opacity: 0.7,
      roughness: 0.1,
      metalness: 0.4,
    })
  );
  windscreen.rotation.z = -Math.PI / 3;
  windscreen.position.set(0.62, 0.42, 0);
  group.add(windscreen);

  // Racing Stripe
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(2.55, 0.14, 0.94),
    makeMat(stripeHex, 0.3)
  );
  stripe.position.y = 0.04;
  group.add(stripe);
}

function buildWingsMesh(
  group: THREE.Group,
  id: string,
  wingHex: string,
  stripeHex: string
): void {
  if (id === 'wing_stubby_toast') {
    // Corrugated Pizza-Box Cardboard Flaps with Duct-Tape Hinges
    [-1, 1].forEach((side) => {
      const flap = new THREE.Mesh(
        new THREE.BoxGeometry(1.05, 0.08, 1.35),
        makeMat('#d97706', 0.85)
      );
      flap.position.set(0, 0.38, side * 1.05);
      flap.rotation.x = side * -0.08;
      group.add(flap);

      const tape = new THREE.Mesh(
        new THREE.BoxGeometry(0.95, 0.1, 0.22),
        makeMat('#94a3b8', 0.4)
      );
      tape.position.set(0, 0.39, side * 0.45);
      group.add(tape);
    });
    return;
  }

  if (id === 'wing_cardboard_biplane') {
    // True Airfoil Biplane with X-Wire Struts & Red Baron Tips!
    const bottomAirfoil = new THREE.Mesh(
      createAirfoilGeometry(1.22, 0.16, 5.4),
      makeMat('#d97706', 0.7)
    );
    bottomAirfoil.position.set(0, 0.25, 0);

    const topAirfoil = new THREE.Mesh(
      createAirfoilGeometry(1.26, 0.18, 5.7),
      makeMat(wingHex, 0.4)
    );
    topAirfoil.position.set(0.06, 1.12, 0);
    group.add(bottomAirfoil, topAirfoil);

    // Twin Interplane Struts on each side
    [-2.0, -0.95, 0.95, 2.0].forEach((z) => {
      [-0.32, 0.32].forEach((x) => {
        const strut = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.035, 0.88, 8),
          makeMat('#78350f', 0.6)
        );
        strut.position.set(x, 0.68, z);
        group.add(strut);
      });
    });
    return;
  }

  if (id === 'wing_pizza_slices') {
    // Authentic Giant Pepperoni Pizza Slices with Puffy Golden Crust, Melted Cheese, Pepperoni, Olives & Basil!
    [-1, 1].forEach((side) => {
      const sliceGroup = new THREE.Group();

      // Triangular Pizza Dough + Melted Mozzarella Base
      const triangleShape = new THREE.Shape();
      triangleShape.moveTo(-0.82, 0);
      triangleShape.lineTo(0.82, 0);
      triangleShape.lineTo(0, 2.95);
      triangleShape.closePath();

      const sliceGeo = new THREE.ExtrudeGeometry(triangleShape, {
        depth: 0.09,
        bevelEnabled: true,
        bevelThickness: 0.025,
        bevelSize: 0.02,
      });
      sliceGeo.rotateX(side === 1 ? Math.PI / 2 : -Math.PI / 2);
      const cheeseMesh = new THREE.Mesh(sliceGeo, makeMat('#facc15', 0.35));
      cheeseMesh.position.set(0, side === 1 ? 0.04 : -0.04, side * 0.48);
      sliceGroup.add(cheeseMesh);

      // Puffy Toasted Golden Crust along the inner edge
      const crust = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.13, 1.72, 12),
        makeMat('#d97706', 0.65)
      );
      crust.rotation.z = Math.PI / 2;
      crust.position.set(0, 0.02, side * 0.48);
      sliceGroup.add(crust);

      // 6 Savory Pepperoni Rounds + Green Basil Leaves along the slice!
      const pepPositions = [
        [-0.32, 0.95],
        [0.32, 0.95],
        [0.0, 1.45],
        [-0.22, 1.95],
        [0.22, 1.95],
        [0.0, 2.55],
      ];
      pepPositions.forEach(([px, pz], idx) => {
        const pep = new THREE.Mesh(
          new THREE.CylinderGeometry(0.2, 0.2, 0.06, 14),
          makeMat('#dc2626', 0.45)
        );
        pep.position.set(px, 0.06, side * pz);
        sliceGroup.add(pep);

        if (idx % 2 === 0) {
          const olive = new THREE.Mesh(
            new THREE.TorusGeometry(0.06, 0.025, 6, 12),
            makeMat('#0f172a', 0.4)
          );
          olive.rotation.x = Math.PI / 2;
          olive.position.set(px * -0.6, 0.08, side * (pz + 0.2));
          sliceGroup.add(olive);
        }
      });

      sliceGroup.position.y = 0.46;
      group.add(sliceGroup);
    });
    return;
  }

  if (id === 'wing_bat_glider') {
    // Sculpted Midnight Bat Wings with Scalloped Trailing Edges & Bat Finger Struts!
    [-1, 1].forEach((side) => {
      const batShape = new THREE.Shape();
      batShape.moveTo(0.75, 0);
      batShape.quadraticCurveTo(0.5, 1.6, -0.1, 3.35);
      // 3 Scalloped bat-membrane arches along trailing edge
      batShape.quadraticCurveTo(-0.45, 2.6, -0.75, 2.2);
      batShape.quadraticCurveTo(-0.45, 1.5, -0.78, 1.1);
      batShape.quadraticCurveTo(-0.45, 0.5, -0.68, 0);
      batShape.closePath();

      const batGeo = new THREE.ExtrudeGeometry(batShape, {
        depth: 0.06,
        bevelEnabled: true,
        bevelThickness: 0.015,
        bevelSize: 0.015,
      });
      batGeo.rotateX(Math.PI / 2);
      if (side === -1) {
        batGeo.scale(1, 1, -1);
      }
      const membrane = new THREE.Mesh(batGeo, makeMat('#5b21b6', 0.35, 0.2));
      membrane.position.set(0, 0.56, side * 0.35);
      group.add(membrane);

      // Glowing Purple Bat Finger Ribs
      [0.35, 0.0, -0.35].forEach((angle, i) => {
        const rib = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.02, 2.8 - i * 0.35, 8),
          makeMat('#c084fc', 0.3)
        );
        rib.rotation.x = Math.PI / 2;
        rib.rotation.z = side * (angle - 0.15);
        rib.position.set(-0.1 - i * 0.2, 0.58, side * 1.65);
        group.add(rib);
      });
    });
    return;
  }

  if (id === 'wing_foam_delta') {
    // Swept Rogallo Hang-Glider Wing with Aluminum Control Frame & Keel Tube
    const shape = new THREE.Shape();
    shape.moveTo(1.05, 0);
    shape.lineTo(-0.85, 3.25);
    shape.lineTo(-1.18, 3.25);
    shape.lineTo(-0.48, 0);
    shape.lineTo(-1.18, -3.25);
    shape.lineTo(-0.85, -3.25);
    shape.closePath();

    const extrude = new THREE.ExtrudeGeometry(shape, {
      depth: 0.07,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
    });
    extrude.rotateX(Math.PI / 2);
    const deltaMesh = new THREE.Mesh(extrude, makeMat(wingHex, 0.35));
    deltaMesh.position.set(0.1, 0.72, 0);
    group.add(deltaMesh);

    // Center Keel Tube + A-Frame Control Bar
    const keel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 2.2, 10),
      makeMat('#e2e8f0', 0.2, 0.8)
    );
    keel.rotation.z = Math.PI / 2;
    keel.position.set(0, 0.74, 0);
    group.add(keel);
    return;
  }

  // Wide High-Aspect-Ratio Cambered Airfoil Wings (28ft Balsa or 30ft Chicken Whisperer Pro)
  const isPro = id === 'wing_chicken_pro';
  const span = isPro ? 7.3 : 6.3;
  const chord = isPro ? 1.24 : 1.3;
  const color = isPro ? '#fde047' : wingHex;

  const airfoilMesh = new THREE.Mesh(
    createAirfoilGeometry(chord, 0.18, span),
    makeMat(color, 0.28, 0.15)
  );
  airfoilMesh.position.set(-0.04, 0.5, 0);
  group.add(airfoilMesh);

  // Visible Balsa Airfoil Ribs along the span
  const numRibs = 8;
  for (let i = 0; i <= numRibs; i++) {
    const z = -span / 2 + (i / numRibs) * span;
    const rib = new THREE.Mesh(
      new THREE.BoxGeometry(chord * 0.96, 0.14, 0.04),
      makeMat(stripeHex, 0.35)
    );
    rib.position.set(-0.04, 0.52, z);
    group.add(rib);
  }

  // Swept Aerodynamic Winglets at Wingtips
  [-1, 1].forEach((side) => {
    const winglet = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.65, 0.07),
      makeMat(stripeHex, 0.25)
    );
    winglet.position.set(-0.15, 0.8, side * (span / 2));
    winglet.rotation.x = side * -0.22;
    group.add(winglet);
  });
}

function buildTailMesh(
  group: THREE.Group,
  id: string,
  stripeHex: string,
  wingHex: string
): void {
  if (id === 'tail_none') return;

  // Twin Tail Boom Truss connecting fuselage to rear stabilizer
  [-0.18, 0.18].forEach((z) => {
    const boom = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.07, 1.45, 10),
      makeMat('#475569', 0.4, 0.5)
    );
    boom.rotation.z = Math.PI / 2;
    boom.position.set(-1.35, 0.15, z);
    group.add(boom);
  });

  if (id === 'tail_v_glider') {
    [-1, 1].forEach((side) => {
      const vFin = new THREE.Mesh(
        createAirfoilGeometry(0.68, 0.1, 1.25),
        makeMat(wingHex, 0.3)
      );
      vFin.position.set(-1.85, 0.52, side * 0.48);
      vFin.rotation.x = side * 0.62;
      group.add(vFin);
    });
    return;
  }

  if (id === 'tail_rocket_fins') {
    // Twin Retro Firework Booster Tubes with Exhaust Cones & Paper Flame Streamers!
    [-0.45, 0.45].forEach((z) => {
      const booster = new THREE.Group();
      const tube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.26, 0.95, 16),
        makeMat('#dc2626', 0.45)
      );
      tube.rotation.z = Math.PI / 2;
      booster.add(tube);

      // White stripe band
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.255, 0.255, 0.22, 16),
        makeMat('#f8fafc', 0.4)
      );
      band.rotation.z = Math.PI / 2;
      booster.add(band);

      // Exhaust Nozzle & Orange Cardboard Flame Cone
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.2, 0.55, 10),
        makeMat('#f97316', 0.3)
      );
      flame.rotation.z = Math.PI / 2;
      flame.position.x = -0.68;
      booster.add(flame);

      booster.position.set(-1.72, 0.24, z);
      group.add(booster);
    });
    return;
  }

  if (id === 'tail_shark_fin') {
    // Curved Sculpted Great White Shark Dorsal Fin + Horizontal Flukes!
    const finShape = new THREE.Shape();
    finShape.moveTo(0.45, 0);
    finShape.quadraticCurveTo(0.15, 0.65, -0.38, 1.15);
    finShape.quadraticCurveTo(-0.18, 0.55, -0.35, 0);
    finShape.closePath();

    const finGeo = new THREE.ExtrudeGeometry(finShape, {
      depth: 0.08,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
    });
    finGeo.translate(0, 0, -0.04);
    const dorsalFin = new THREE.Mesh(finGeo, makeMat('#0284c7', 0.25));
    dorsalFin.position.set(-1.75, 0.2, 0);

    const hStab = new THREE.Mesh(
      createAirfoilGeometry(0.58, 0.09, 1.65),
      makeMat('#38bdf8', 0.3)
    );
    hStab.position.set(-1.82, 0.2, 0);
    group.add(dorsalFin, hStab);
    return;
  }

  // Classic Airfoil Horizontal + Vertical Stabilizer with Rudder Trim
  const hStab = new THREE.Mesh(
    createAirfoilGeometry(0.65, 0.09, 1.7),
    makeMat(wingHex, 0.35)
  );
  hStab.position.set(-1.82, 0.22, 0);

  const vStab = new THREE.Mesh(
    new THREE.BoxGeometry(0.74, 0.88, 0.08),
    makeMat(stripeHex, 0.3)
  );
  vStab.position.set(-1.82, 0.64, 0);
  group.add(hStab, vStab);
}

function buildNoseMesh(
  group: THREE.Group,
  id: string,
  stripeHex: string,
  wingHex: string
): THREE.Object3D | null {
  if (id === 'nose_duck_bill') {
    // Sculpted Giant Yellow Duck Head with Curved Flat Orange Bill, Nostrils & Feather Tuft!
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.46, 18, 18),
      makeMat('#facc15', 0.3)
    );
    head.position.set(1.38, 0.22, 0);
    group.add(head);

    // Cute top feather tuft
    const tuft = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.28, 8),
      makeMat('#eab308', 0.4)
    );
    tuft.position.set(1.32, 0.72, 0);
    tuft.rotation.z = 0.3;
    group.add(tuft);

    // Wide sculpted orange duck bill (upper + lower mandible)
    const upperBill = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.34, 0.58, 14),
      makeMat('#f97316', 0.35)
    );
    upperBill.rotation.z = -Math.PI / 2;
    upperBill.scale.set(0.38, 1, 1.25);
    upperBill.position.set(1.82, 0.14, 0);

    const lowerBill = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.07, 0.48),
      makeMat('#ea580c', 0.4)
    );
    lowerBill.position.set(1.76, 0.02, 0);
    lowerBill.rotation.z = -0.12;
    group.add(upperBill, lowerBill);

    // Expressive White Eyes + Black Pupils
    [-0.25, 0.25].forEach((z) => {
      const whiteEye = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 12, 12),
        makeMat('#ffffff', 0.15)
      );
      whiteEye.position.set(1.58, 0.38, z);
      const pupil = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 10, 10),
        makeMat('#0f172a', 0.1)
      );
      pupil.position.set(1.67, 0.39, z * 1.05);
      group.add(whiteEye, pupil);
    });
    return null;
  }

  if (id === 'nose_anvil_weight') {
    // Detailed Sizzling Kettle BBQ Grill on the Nose with Glowing Coals, Grate & Giant Burgers!
    const grillGroup = new THREE.Group();
    grillGroup.position.set(1.52, 0.05, 0);

    // Lower Black Kettle Bowl
    const bowl = new THREE.Mesh(
      new THREE.SphereGeometry(0.52, 18, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      makeMat('#1e293b', 0.4, 0.7)
    );
    grillGroup.add(bowl);

    // Glowing Red Charcoal Bed + Silver Grill Grate
    const coals = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.45, 0.08, 16),
      new THREE.MeshStandardMaterial({
        color: '#ef4444',
        emissive: '#dc2626',
        emissiveIntensity: 0.6,
      })
    );
    coals.position.y = -0.02;
    grillGroup.add(coals);

    // 2 Giant Burgers with Cheese & Lettuce sizzling on the grill!
    [-0.18, 0.18].forEach((z) => {
      const patty = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 0.08, 12),
        makeMat('#78350f', 0.7)
      );
      patty.position.set(0.08, 0.06, z);
      const bun = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        makeMat('#f59e0b', 0.5)
      );
      bun.position.set(0.08, 0.1, z);
      grillGroup.add(patty, bun);
    });

    // Tilted Red Dome Lid at the back of the grill
    const lid = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      makeMat('#dc2626', 0.3, 0.4)
    );
    lid.position.set(-0.22, 0.12, 0);
    lid.rotation.z = 0.75;
    grillGroup.add(lid);

    group.add(grillGroup);
    return null;
  }

  if (id === 'nose_fake_prop') {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.4, 0.65, 18),
      makeMat(stripeHex, 0.3)
    );
    cone.rotation.z = -Math.PI / 2;
    cone.position.set(1.48, 0.0, 0);
    group.add(cone);

    const spinner = new THREE.Group();
    spinner.position.set(1.84, 0, 0);

    const hub = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 12, 12),
      makeMat('#ef4444', 0.25)
    );
    spinner.add(hub);

    // 4 Colorful Pinwheel Blades
    const colors = ['#fde047', '#38bdf8', '#f43f5e', '#22c55e'];
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.68, 0.2),
        makeMat(colors[i], 0.3)
      );
      blade.position.y = Math.cos((i * Math.PI) / 2) * 0.35;
      blade.position.z = Math.sin((i * Math.PI) / 2) * 0.35;
      blade.rotation.x = (i * Math.PI) / 2;
      blade.rotation.y = 0.28;
      spinner.add(blade);
    }
    group.add(spinner);
    return spinner;
  }

  if (id === 'nose_dragon_head') {
    // Fierce Sculpted Fire Dragon Head with Golden Horns, Fangs & Flame Breath!
    const dragon = new THREE.Group();
    dragon.position.set(1.45, 0.18, 0);

    // Upper Snout & Skull
    const skull = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.38, 0.56),
      makeMat('#16a34a', 0.35)
    );
    const snout = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.24, 0.44),
      makeMat('#22c55e', 0.35)
    );
    snout.position.set(0.45, -0.02, 0);
    dragon.add(skull, snout);

    // Open Lower Jaw + Flame Tongue
    const jaw = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.12, 0.38),
      makeMat('#15803d', 0.4)
    );
    jaw.position.set(0.38, -0.22, 0);
    jaw.rotation.z = -0.25;
    dragon.add(jaw);

    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.14, 0.55, 10),
      new THREE.MeshStandardMaterial({
        color: '#facc15',
        emissive: '#f97316',
        emissiveIntensity: 0.7,
      })
    );
    flame.rotation.z = -Math.PI / 2;
    flame.position.set(0.82, -0.14, 0);
    dragon.add(flame);

    // Swept Golden Dragon Horns & Glowing Eyes
    [-0.2, 0.2].forEach((z) => {
      const horn = new THREE.Mesh(
        new THREE.ConeGeometry(0.08, 0.52, 10),
        makeMat('#facc15', 0.25, 0.5)
      );
      horn.position.set(-0.18, 0.32, z);
      horn.rotation.z = 0.65;
      dragon.add(horn);

      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 10, 10),
        new THREE.MeshStandardMaterial({ color: '#fde047', emissive: '#eab308', emissiveIntensity: 0.5 })
      );
      eye.position.set(0.15, 0.14, z * 1.35);
      dragon.add(eye);
    });

    group.add(dragon);
    return null;
  }

  // Sleek Contoured Aero Nose Cone with Pitot Tube
  const aeroCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.42, 0.9, 20),
    makeMat(stripeHex, 0.22, 0.2)
  );
  aeroCone.rotation.z = -Math.PI / 2;
  aeroCone.position.set(1.56, 0.02, 0);

  const trimRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.39, 0.04, 8, 20),
    makeMat(wingHex, 0.3)
  );
  trimRing.rotation.y = Math.PI / 2;
  trimRing.position.set(1.15, 0.02, 0);
  group.add(aeroCone, trimRing);
  return null;
}

function buildTopperMesh(group: THREE.Group, id: string): void {
  if (id === 'topper_none') return;

  if (id === 'topper_golden_retriever') {
    // SCULPTED 3D SUNNY GOLDEN RETRIEVER WITH FLUFFY CHEST RUFF, FLOPPY EARS, BANDANA, PINK TONGUE & FEATHERY TAIL!
    const dog = new THREE.Group();
    dog.position.set(0, 0.65, 0);

    const goldMat = makeMat('#f59e0b', 0.52);
    const lightGoldMat = makeMat('#fde68a', 0.58);
    const earGoldMat = makeMat('#d97706', 0.55);
    const darkMat = makeMat('#0f172a', 0.2);

    // 1. 4 Sturdy Golden Legs & Paws standing on the wing
    [
      [-0.36, 0.2],
      [-0.36, -0.2],
      [0.34, 0.2],
      [0.34, -0.2],
    ].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.085, 0.075, 0.42, 10),
        goldMat
      );
      leg.position.set(lx, 0.21, lz);
      const paw = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 10, 8),
        lightGoldMat
      );
      paw.scale.set(1.3, 0.65, 1.0);
      paw.position.set(lx + 0.04, 0.04, lz);
      dog.add(leg, paw);
    });

    // 2. Plump Golden Torso & Fluffy Cream Chest Ruff
    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.27, 0.25, 0.88, 14),
      goldMat
    );
    torso.rotation.z = Math.PI / 2;
    torso.position.set(-0.02, 0.48, 0);
    dog.add(torso);

    const shoulderSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 14, 12),
      goldMat
    );
    shoulderSphere.position.set(0.34, 0.5, 0);
    const hipSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 14, 12),
      goldMat
    );
    hipSphere.position.set(-0.4, 0.48, 0);
    dog.add(shoulderSphere, hipSphere);

    // Fluffy cream chest fur tuft in front
    const chestRuff = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.24, 1),
      lightGoldMat
    );
    chestRuff.scale.set(0.9, 1.15, 1.05);
    chestRuff.position.set(0.46, 0.46, 0);
    dog.add(chestRuff);

    // 3. Red Adventurer Bandana Collar + Golden Tag
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.23, 0.045, 8, 18),
      makeMat('#ef4444', 0.45)
    );
    collar.rotation.y = Math.PI / 2;
    collar.rotation.x = 0.35;
    collar.position.set(0.45, 0.66, 0);
    const bandanaTriangle = new THREE.Mesh(
      new THREE.ConeGeometry(0.14, 0.25, 3),
      makeMat('#dc2626', 0.45)
    );
    bandanaTriangle.rotation.x = Math.PI;
    bandanaTriangle.position.set(0.58, 0.54, 0);
    dog.add(collar, bandanaTriangle);

    // 4. Friendly Rounded Golden Retriever Head, Muzzle, Nose & Happy Pink Tongue!
    const headGroup = new THREE.Group();
    headGroup.position.set(0.54, 0.84, 0);

    const cranium = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 16, 14),
      goldMat
    );
    cranium.scale.set(1.08, 1.0, 0.96);
    headGroup.add(cranium);

    // Soft Rounded Golden Snout / Muzzle
    const muzzle = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.17, 0.22),
      lightGoldMat
    );
    muzzle.position.set(0.24, -0.03, 0);
    headGroup.add(muzzle);

    // Shiny Black Dog Nose
    const nose = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 10, 10),
      darkMat
    );
    nose.scale.set(0.9, 0.8, 1.15);
    nose.position.set(0.4, 0.02, 0);
    headGroup.add(nose);

    // Happy Open Lower Jaw + Pink Tongue Hanging Out!
    const lowerJaw = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.06, 0.18),
      goldMat
    );
    lowerJaw.position.set(0.2, -0.14, 0);
    lowerJaw.rotation.z = -0.24;

    const tongue = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.035, 0.11),
      makeMat('#f43f5e', 0.35)
    );
    tongue.position.set(0.28, -0.15, 0.05);
    tongue.rotation.z = -0.45;
    tongue.rotation.x = 0.25;
    headGroup.add(lowerJaw, tongue);

    // Warm Expressive Eyes & Golden Brow
    [-0.14, 0.14].forEach((ez) => {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.048, 10, 10),
        darkMat
      );
      eye.position.set(0.18, 0.08, ez);
      const shine = new THREE.Mesh(
        new THREE.SphereGeometry(0.018, 6, 6),
        makeMat('#ffffff', 0.1)
      );
      shine.position.set(0.22, 0.1, ez * 1.04);
      headGroup.add(eye, shine);
    });

    // Signature Long Floppy Golden Retriever Ears hanging down both sides
    [-1, 1].forEach((side) => {
      const ear = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.32, 0.07),
        earGoldMat
      );
      ear.position.set(-0.02, -0.06, side * 0.25);
      ear.rotation.x = side * 0.22;
      ear.rotation.z = -0.15;
      headGroup.add(ear);
    });

    dog.add(headGroup);

    // 5. Feathery Wagging Golden Tail at the back
    const tailBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.08, 0.52, 10),
      goldMat
    );
    tailBase.rotation.z = 0.95;
    tailBase.position.set(-0.68, 0.62, 0);

    const tailFeather = new THREE.Mesh(
      new THREE.ConeGeometry(0.11, 0.42, 8),
      lightGoldMat
    );
    tailFeather.rotation.z = -2.1;
    tailFeather.position.set(-0.72, 0.55, 0);
    dog.add(tailBase, tailFeather);

    group.add(dog);
    return;
  }

  if (id === 'topper_great_dane') {
    // SCULPTED 3D BLACK & WHITE HARLEQUIN GREAT DANE (TALL MUSCULAR BUILD, DEEP CHEST, SQUARE MUZZLE & HARLEQUIN SPOTS!)
    const dane = new THREE.Group();
    dane.position.set(0, 0.65, 0);

    const whiteMat = makeMat('#f8fafc', 0.4);
    const blackMat = makeMat('#0f172a', 0.38);
    const greySpotMat = makeMat('#334155', 0.45);
    const collarMat = makeMat('#2563eb', 0.3, 0.3);

    // 1. Tall, Long Muscular Great Dane Legs & Paws
    [
      [-0.4, 0.21, true],
      [-0.4, -0.21, false],
      [0.38, 0.21, false],
      [0.38, -0.21, true],
    ].forEach(([lx, lz, hasBlackUpper]) => {
      const x = lx as number;
      const z = lz as number;
      const upperLeg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.085, 0.065, 0.32, 10),
        hasBlackUpper ? blackMat : whiteMat
      );
      upperLeg.position.set(x, 0.42, z);

      const lowerLeg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.062, 0.052, 0.3, 10),
        whiteMat
      );
      lowerLeg.position.set(x, 0.16, z);

      const paw = new THREE.Mesh(
        new THREE.BoxGeometry(0.17, 0.07, 0.13),
        whiteMat
      );
      paw.position.set(x + 0.03, 0.035, z);
      dane.add(upperLeg, lowerLeg, paw);
    });

    // 2. Deep Barrel Chest & Tucked Waist (Classic Great Dane Silhouette!)
    const deepChest = new THREE.Mesh(
      new THREE.SphereGeometry(0.31, 14, 14),
      whiteMat
    );
    deepChest.scale.set(1.25, 1.18, 0.88);
    deepChest.position.set(0.24, 0.66, 0);

    const waist = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.28, 0.65, 14),
      whiteMat
    );
    waist.rotation.z = Math.PI / 2;
    waist.position.set(-0.14, 0.68, 0);

    const rump = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 14, 12),
      blackMat // Black mantle rump patch!
    );
    rump.position.set(-0.42, 0.7, 0);
    dane.add(deepChest, waist, rump);

    // Bold Black Harlequin Saddle & Rib Spots across the White Coat!
    const saddlePatch = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 12, 10),
      blackMat
    );
    saddlePatch.scale.set(1.3, 0.65, 1.06);
    saddlePatch.position.set(-0.05, 0.82, 0);
    dane.add(saddlePatch);

    const spotCoords: Array<[number, number, number, number]> = [
      [0.22, 0.68, 0.25, 0.11],
      [0.05, 0.58, -0.23, 0.1],
      [-0.22, 0.66, 0.21, 0.09],
      [0.32, 0.56, -0.22, 0.085],
    ];
    spotCoords.forEach(([sx, sy, sz, sr], idx) => {
      const spot = new THREE.Mesh(
        new THREE.SphereGeometry(sr, 10, 10),
        idx === 2 ? greySpotMat : blackMat
      );
      spot.scale.set(1.2, 1.0, 0.35);
      spot.position.set(sx, sy, sz);
      dane.add(spot);
    });

    // 3. Long Regal Arched Neck + Royal Blue & Gold Studded Collar
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.21, 0.46, 12),
      whiteMat
    );
    neck.position.set(0.46, 0.94, 0);
    neck.rotation.z = -0.35;
    dane.add(neck);

    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.185, 0.04, 8, 18),
      collarMat
    );
    collar.rotation.y = Math.PI / 2;
    collar.rotation.x = 0.35;
    collar.position.set(0.44, 0.88, 0);

    const goldTag = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.025, 12),
      makeMat('#facc15', 0.2, 0.8)
    );
    goldTag.rotation.z = Math.PI / 2;
    goldTag.position.set(0.62, 0.8, 0);
    dane.add(collar, goldTag);

    // 4. Noble Chiseled Square Great Dane Head, Deep Flews/Muzzle & Asymmetric Black Eye Patch!
    const headGroup = new THREE.Group();
    headGroup.position.set(0.58, 1.18, 0);

    // Square noble skull
    const skull = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.28, 0.28),
      whiteMat
    );
    headGroup.add(skull);

    // Black Harlequin Eye/Crown Patch on the left side of the head
    const facePatch = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.24, 0.16),
      blackMat
    );
    facePatch.position.set(-0.02, 0.04, 0.08);
    headGroup.add(facePatch);

    // Iconic Deep Square Overhanging Great Dane Muzzle (Flews)
    const muzzleTop = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.18, 0.22),
      whiteMat
    );
    muzzleTop.position.set(0.26, -0.02, 0);

    // Hanging side jowls/flews characteristic of a Great Dane
    [-0.09, 0.09].forEach((fz, i) => {
      const flew = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.12, 0.06),
        i === 0 ? whiteMat : blackMat
      );
      flew.position.set(0.24, -0.1, fz);
      headGroup.add(flew);
    });

    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.09, 0.12),
      blackMat
    );
    nose.position.set(0.44, 0.03, 0);
    headGroup.add(muzzleTop, nose);

    // Expressive Great Dane Eyes
    [-0.13, 0.13].forEach((ez) => {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 10, 10),
        makeMat('#f59e0b', 0.2)
      );
      eye.position.set(0.14, 0.06, ez);
      const pupil = new THREE.Mesh(
        new THREE.SphereGeometry(0.026, 8, 8),
        blackMat
      );
      pupil.position.set(0.17, 0.06, ez * 1.06);
      headGroup.add(eye, pupil);
    });

    // High-Set Folded Triangular Great Dane Ears (One Jet Black, One White with Black Tip)
    [-1, 1].forEach((side) => {
      const ear = new THREE.Mesh(
        new THREE.ConeGeometry(0.11, 0.28, 4),
        side === 1 ? blackMat : whiteMat
      );
      ear.rotation.x = Math.PI + side * 0.32;
      ear.rotation.z = -0.25;
      ear.position.set(-0.04, 0.05, side * 0.19);
      headGroup.add(ear);
    });

    dane.add(headGroup);

    // 5. Long Sleek Curved Sabre Tail (Black Base with White Tip)
    const tailBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.06, 0.48, 10),
      blackMat
    );
    tailBase.rotation.z = 1.08;
    tailBase.position.set(-0.68, 0.78, 0);

    const tailTip = new THREE.Mesh(
      new THREE.ConeGeometry(0.035, 0.26, 8),
      whiteMat
    );
    tailTip.rotation.z = 1.32;
    tailTip.position.set(-0.98, 0.88, 0);
    dane.add(tailBase, tailTip);

    group.add(dane);
    return;
  }

  if (id === 'topper_taco') {
    // AUTHENTIC 3D U-SHAPED CRISPY TACO SHELL PACKED WITH BEEF, LETTUCE, TOMATOES, CHEESE, GUAC & SOUR CREAM!
    const tacoGroup = new THREE.Group();
    tacoGroup.position.set(0, 0.76, 0);

    // 1. Extrude a true U-shaped folded tortilla cross-section along X (length = 1.65)
    const tacoLength = 1.65;
    const shellShape = new THREE.Shape();
    // Outer U curve (from left lip -> bottom curve -> right lip)
    shellShape.moveTo(-0.48, 0.68);
    shellShape.bezierCurveTo(-0.56, -0.15, 0.56, -0.15, 0.48, 0.68);
    // Inner U curve (thickness = 0.08)
    shellShape.lineTo(0.4, 0.68);
    shellShape.bezierCurveTo(0.44, -0.02, -0.44, -0.02, -0.4, 0.68);
    shellShape.closePath();

    const shellGeo = new THREE.ExtrudeGeometry(shellShape, {
      depth: tacoLength,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.025,
      curveSegments: 18,
    });
    // Orient extrusion along X axis (+X = nose, -X = tail)
    shellGeo.rotateY(Math.PI / 2);
    shellGeo.translate(-tacoLength / 2, 0, 0);

    const shellMesh = new THREE.Mesh(shellGeo, makeMat('#facc15', 0.55, 0.05));
    tacoGroup.add(shellMesh);

    // Crispy toasted corn spots along the outside of the tortilla shell
    [-0.5, -0.15, 0.2, 0.52].forEach((x, idx) => {
      [-1, 1].forEach((side) => {
        const blister = new THREE.Mesh(
          new THREE.SphereGeometry(0.065, 8, 8),
          makeMat('#d97706', 0.7)
        );
        blister.scale.set(1.4, 1, 0.4);
        blister.position.set(x, 0.25 + (idx % 2) * 0.16, side * 0.44);
        tacoGroup.add(blister);
      });
    });

    // 2. Seasoned Ground Beef Layer nestled in the bottom of the U-shell
    const beefLog = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.24, tacoLength * 0.92, 14),
      makeMat('#78350f', 0.85, 0.0)
    );
    beefLog.rotation.z = Math.PI / 2;
    beefLog.position.set(0, 0.24, 0);
    tacoGroup.add(beefLog);

    // 3. Wavy Shredded Lettuce Clusters bursting above the beef
    for (let i = 0; i < 9; i++) {
      const lx = -0.68 + i * 0.17;
      const lettuce = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.19 + (i % 2) * 0.03, 1),
        makeMat(i % 2 === 0 ? '#22c55e' : '#4ade80', 0.55)
      );
      lettuce.scale.set(1.1, 0.85, 1.35);
      lettuce.position.set(lx, 0.52 + (i % 2) * 0.04, ((i % 3) - 1) * 0.11);
      tacoGroup.add(lettuce);
    }

    // 4. Bright Red Diced Tomato Cubes & Green Jalapeno Rings
    [-0.58, -0.28, 0.02, 0.32, 0.58].forEach((tx, idx) => {
      const tomato = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.12, 0.14),
        makeMat('#ef4444', 0.3)
      );
      tomato.position.set(tx, 0.65, idx % 2 === 0 ? 0.14 : -0.14);
      tomato.rotation.set(0.3 * idx, 0.5 * idx, 0.2);
      tacoGroup.add(tomato);
    });

    // 5. Shredded Cheddar & Monterey Jack Cheese Strips crisscrossing on top
    for (let i = 0; i < 10; i++) {
      const cx = -0.62 + i * 0.135;
      const cheeseStrip = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.04, 0.42),
        makeMat(i % 2 === 0 ? '#f97316' : '#fde047', 0.4)
      );
      cheeseStrip.position.set(cx, 0.68, 0);
      cheeseStrip.rotation.y = (i % 2 === 0 ? 1 : -1) * 0.45;
      tacoGroup.add(cheeseStrip);
    }

    // 6. Dollop of White Sour Cream + Scoop of Fresh Guacamole on the crown!
    const sourCream = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 12, 12),
      makeMat('#f8fafc', 0.25)
    );
    sourCream.scale.set(1.2, 0.75, 1.1);
    sourCream.position.set(-0.14, 0.74, 0);

    const guac = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 12, 12),
      makeMat('#65a30d', 0.45)
    );
    guac.scale.set(1.2, 0.75, 1.1);
    guac.position.set(0.16, 0.74, 0);

    tacoGroup.add(sourCream, guac);
    group.add(tacoGroup);
    return;
  }

  if (id === 'topper_trex') {
    // DETAILED 3D T-REX DINOSAUR WITH TAIL, LEGS, TINY ARMS, OPEN JAWS, SHARP WHITE TEETH & BACK SPIKES!
    const dino = new THREE.Group();
    dino.position.set(0, 0.68, 0);

    const skinMat = makeMat('#16a34a', 0.42);
    const darkSkinMat = makeMat('#15803d', 0.45);
    const bellyMat = makeMat('#a3e635', 0.48);
    const toothMat = makeMat('#ffffff', 0.15);
    const spikeMat = makeMat('#eab308', 0.35);

    // 1. Sturdy Hind Legs (Thighs, Shins, and 3-Clawed Dino Feet)
    [-0.24, 0.24].forEach((z) => {
      const thigh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.12, 0.42, 12),
        skinMat
      );
      thigh.position.set(-0.08, 0.26, z);
      thigh.rotation.z = -0.25;

      const foot = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.1, 0.22),
        darkSkinMat
      );
      foot.position.set(0.02, 0.05, z);
      dino.add(thigh, foot);

      // 3 white toe claws per foot
      [-0.06, 0, 0.06].forEach((cz) => {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 6), toothMat);
        claw.rotation.z = -Math.PI / 2;
        claw.position.set(0.2, 0.04, z + cz);
        dino.add(claw);
      });
    });

    // 2. Muscular Forward-Leaning Torso & Lighter Lime Belly Plate
    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.34, 0.78, 14),
      skinMat
    );
    torso.position.set(0.02, 0.56, 0);
    torso.rotation.z = -0.42;
    dino.add(torso);

    const belly = new THREE.Mesh(
      new THREE.CylinderGeometry(0.21, 0.28, 0.72, 12),
      bellyMat
    );
    belly.position.set(0.09, 0.53, 0);
    belly.rotation.z = -0.42;
    dino.add(belly);

    // 3. Long Tapering 3-Segment Dinosaur Tail extending backward (-X)
    const tailSeg1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.27, 0.52, 12),
      skinMat
    );
    tailSeg1.rotation.z = 1.25;
    tailSeg1.position.set(-0.38, 0.38, 0);

    const tailSeg2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.18, 0.5, 10),
      skinMat
    );
    tailSeg2.rotation.z = 1.42;
    tailSeg2.position.set(-0.82, 0.46, 0);

    const tailTip = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.45, 10),
      darkSkinMat
    );
    tailTip.rotation.z = 1.5;
    tailTip.position.set(-1.24, 0.52, 0);
    dino.add(tailSeg1, tailSeg2, tailTip);

    // 4. Tiny Funny T-Rex Front Arms with Little Claws!
    [-0.22, 0.22].forEach((z) => {
      const upperArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.04, 0.22, 8),
        skinMat
      );
      upperArm.position.set(0.26, 0.68, z);
      upperArm.rotation.z = -0.9;

      const forearm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.03, 0.16, 8),
        darkSkinMat
      );
      forearm.position.set(0.38, 0.64, z);
      forearm.rotation.z = -0.3;
      dino.add(upperArm, forearm);
    });

    // 5. Iconic T-Rex Head, Snout, Open Roaring Lower Jaw & 10 Sharp White Teeth!
    const headGroup = new THREE.Group();
    headGroup.position.set(0.22, 0.98, 0);

    // Cranium & Upper Snout
    const cranium = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.34, 0.38),
      skinMat
    );
    const upperSnout = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.24, 0.32),
      skinMat
    );
    upperSnout.position.set(0.34, 0.02, 0);
    headGroup.add(cranium, upperSnout);

    // Fierce Brow Ridges & Yellow Dinosaur Eyes with Black Slit Pupils
    [-0.19, 0.19].forEach((z) => {
      const brow = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.06, 0.08),
        darkSkinMat
      );
      brow.position.set(0.06, 0.16, z);
      brow.rotation.z = -0.2;

      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 10, 10),
        makeMat('#facc15', 0.15)
      );
      eye.position.set(0.06, 0.09, z);

      const pupil = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.08, 0.03),
        makeMat('#0f172a', 0.1)
      );
      pupil.position.set(0.08, 0.09, z * 1.18);
      headGroup.add(brow, eye, pupil);
    });

    // Open Hinged Lower Jaw + Pink Tongue
    const lowerJaw = new THREE.Mesh(
      new THREE.BoxGeometry(0.48, 0.1, 0.28),
      darkSkinMat
    );
    lowerJaw.position.set(0.26, -0.18, 0);
    lowerJaw.rotation.z = -0.32;

    const tongue = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.05, 0.16),
      makeMat('#f43f5e', 0.4)
    );
    tongue.position.set(0.24, -0.13, 0);
    tongue.rotation.z = -0.25;
    headGroup.add(lowerJaw, tongue);

    // Upper & Lower Rows of Sharp White 3D Conical Teeth!
    [0.16, 0.28, 0.4, 0.5].forEach((tx) => {
      [-0.12, 0.12].forEach((tz) => {
        const upperTooth = new THREE.Mesh(
          new THREE.ConeGeometry(0.028, 0.09, 6),
          toothMat
        );
        upperTooth.rotation.x = Math.PI;
        upperTooth.position.set(tx, -0.12, tz);
        headGroup.add(upperTooth);

        const lowerTooth = new THREE.Mesh(
          new THREE.ConeGeometry(0.025, 0.08, 6),
          toothMat
        );
        lowerTooth.position.set(tx - 0.04, -0.14 - (tx - 0.16) * 0.28, tz * 0.9);
        headGroup.add(lowerTooth);
      });
    });

    dino.add(headGroup);

    // 6. Row of Golden Dorsal Spine Plates from Head down the Back and Tail!
    const spikeCoords: Array<[number, number, number]> = [
      [0.12, 1.18, 0],
      [-0.02, 0.94, 0],
      [-0.14, 0.72, 0],
      [-0.28, 0.54, 0],
      [-0.56, 0.5, 0],
      [-0.88, 0.56, 0],
    ];
    spikeCoords.forEach(([sx, sy, sz], idx) => {
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.065 - idx * 0.006, 0.16, 4),
        spikeMat
      );
      spike.rotation.z = 0.35;
      spike.position.set(sx, sy, sz);
      dino.add(spike);
    });

    group.add(dino);
    return;
  }

  if (id === 'topper_couch') {
    // Plush Living Room Party Sofa with Tufted Cushions, Rolled Armrests & Throw Pillows!
    const sofa = new THREE.Group();
    sofa.position.set(0, 0.65, 0);

    const fabricMat = makeMat('#ea580c', 0.65);
    const darkFabricMat = makeMat('#c2410c', 0.7);

    // Base frame + 3 individual plush seat cushions
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.2, 1.78), darkFabricMat);
    base.position.y = 0.1;
    sofa.add(base);

    [-0.52, 0, 0.52].forEach((z) => {
      const cushion = new THREE.Mesh(
        new THREE.BoxGeometry(0.95, 0.22, 0.52),
        fabricMat
      );
      cushion.position.set(0.06, 0.28, z);
      sofa.add(cushion);

      const backCushion = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.58, 0.52),
        darkFabricMat
      );
      backCushion.position.set(-0.42, 0.56, z);
      backCushion.rotation.z = 0.12;
      sofa.add(backCushion);
    });

    // Rolled Armrests on left and right ends
    [-0.86, 0.86].forEach((z) => {
      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 1.18, 12),
        darkFabricMat
      );
      arm.rotation.z = Math.PI / 2;
      arm.position.set(0, 0.42, z);
      sofa.add(arm);
    });

    // 2 Colorful Throw Pillows
    const pillow1 = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.28, 0.12),
      makeMat('#facc15', 0.5)
    );
    pillow1.position.set(-0.18, 0.48, 0.64);
    pillow1.rotation.set(0.3, 0.4, 0.2);

    const pillow2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.28, 0.12),
      makeMat('#38bdf8', 0.5)
    );
    pillow2.position.set(-0.18, 0.48, -0.64);
    pillow2.rotation.set(-0.3, -0.4, 0.2);

    sofa.add(pillow1, pillow2);
    group.add(sofa);
    return;
  }

  if (id === 'topper_disco_ball') {
    // Glitter Faceted Disco Ball + Retro Boombox Stereo Underneath!
    const disco = new THREE.Group();
    disco.position.set(0, 0.72, 0);

    // Boombox stereo base
    const boombox = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.38, 1.1),
      makeMat('#ec4899', 0.3, 0.4)
    );
    boombox.position.y = 0.18;
    disco.add(boombox);

    // Twin black speaker woofers
    [-0.32, 0.32].forEach((z) => {
      const speaker = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.14, 0.06, 14),
        makeMat('#0f172a', 0.5)
      );
      speaker.rotation.z = Math.PI / 2;
      speaker.position.set(0.26, 0.18, z);
      disco.add(speaker);
    });

    // Faceted Metallic Mirror Disco Sphere on Top
    const mirrorBall = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.46, 2),
      new THREE.MeshStandardMaterial({
        color: '#f8fafc',
        roughness: 0.08,
        metalness: 0.92,
        flatShading: true,
      })
    );
    mirrorBall.position.y = 0.82;
    disco.add(mirrorBall);

    group.add(disco);
    return;
  }

  if (id === 'topper_crown') {
    // Royal Golden Crown with Velvet Cushion, 8 Golden Spikes & Gemstones!
    const crownGroup = new THREE.Group();
    crownGroup.position.set(0, 0.85, 0);

    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.38, 0.28, 16),
      makeMat('#facc15', 0.18, 0.8)
    );
    crownGroup.add(band);

    const velvet = new THREE.Mesh(
      new THREE.SphereGeometry(0.36, 14, 10),
      makeMat('#dc2626', 0.6)
    );
    velvet.position.y = 0.06;
    crownGroup.add(velvet);

    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4;
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.09, 0.32, 8),
        makeMat('#fde047', 0.2, 0.8)
      );
      spike.position.set(Math.cos(ang) * 0.4, 0.28, Math.sin(ang) * 0.4);
      crownGroup.add(spike);

      const gem = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 8, 8),
        makeMat(i % 2 === 0 ? '#ef4444' : '#38bdf8', 0.1, 0.5)
      );
      gem.position.set(Math.cos(ang) * 0.43, 0.02, Math.sin(ang) * 0.43);
      crownGroup.add(gem);
    }

    group.add(crownGroup);
    return;
  }

  // Lucky Rooster Mascot (topper_chicken) — Sculpted Body, Comb, Wattle, Beak, Wings & Colorful Tail Feathers!
  const rooster = new THREE.Group();
  rooster.position.set(0, 0.82, 0);

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.36, 16, 14),
    makeMat('#ffffff', 0.35)
  );
  body.scale.set(1.25, 0.95, 0.9);
  rooster.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 14, 14),
    makeMat('#ffffff', 0.35)
  );
  head.position.set(0.32, 0.34, 0);
  rooster.add(head);

  // 3-Peak Red Rooster Comb on Head
  [-0.08, 0.02, 0.12].forEach((cx, idx) => {
    const lobe = new THREE.Mesh(
      new THREE.SphereGeometry(0.08 + (idx === 1 ? 0.02 : 0), 10, 10),
      makeMat('#ef4444', 0.35)
    );
    lobe.scale.set(1, 1.4, 0.45);
    lobe.position.set(0.3 + cx, 0.58, 0);
    rooster.add(lobe);
  });

  // Orange Beak & Red Wattle
  const beak = new THREE.Mesh(
    new THREE.ConeGeometry(0.09, 0.24, 10),
    makeMat('#f97316', 0.35)
  );
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(0.62, 0.34, 0);

  const wattle = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 10, 10),
    makeMat('#dc2626', 0.4)
  );
  wattle.position.set(0.52, 0.2, 0);
  rooster.add(beak, wattle);

  // 3 Arching Colorful Tail Feathers at the back
  ['#ef4444', '#f59e0b', '#10b981'].forEach((hex, idx) => {
    const feather = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.12, 0.06),
      makeMat(hex, 0.35)
    );
    feather.position.set(-0.48, 0.24 + idx * 0.1, (idx - 1) * 0.08);
    feather.rotation.z = 0.55 + idx * 0.22;
    rooster.add(feather);
  });

  group.add(rooster);
}

function buildPilotMesh(group: THREE.Group): void {
  // Articulated Pilot with Life Vest, Arms Gripping Control Bar, and Red Bull Helmet!
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.2, 0.52, 12),
    makeMat('#f97316', 0.45)
  );
  torso.position.set(0.15, 0.45, 0);

  // Arms reaching forward
  [-0.22, 0.22].forEach((z) => {
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.05, 0.38, 8),
      makeMat('#1e3a8a', 0.5)
    );
    arm.position.set(0.3, 0.48, z);
    arm.rotation.z = -1.1;
    group.add(arm);
  });

  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 16, 16),
    makeMat('#2563eb', 0.2, 0.35)
  );
  helmet.position.set(0.18, 0.84, 0);

  const helmetStripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.08, 0.12),
    makeMat('#facc15', 0.25)
  );
  helmetStripe.position.set(0.18, 0.94, 0);

  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.12, 0.3),
    makeMat('#0f172a', 0.1, 0.85)
  );
  visor.position.set(0.32, 0.84, 0);

  group.add(torso, helmet, helmetStripe, visor);
}

function buildTrolleyMesh(group: THREE.Group, id: string): void {
  const frameColor =
    id === 'trolley_monster_wheels'
      ? '#22c55e'
      : id === 'trolley_shopping_cart'
      ? '#94a3b8'
      : '#f97316';

  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(1.95, 0.12, 1.28),
    makeMat(frameColor, 0.35, 0.35)
  );
  platform.position.set(0, -0.48, 0);
  group.add(platform);

  if (id === 'trolley_shopping_cart') {
    // Wire Shopping Cart Basket Sides & Red Push Handle
    const basket = new THREE.Mesh(
      new THREE.BoxGeometry(1.75, 0.34, 1.15),
      new THREE.MeshStandardMaterial({
        color: '#cbd5e1',
        wireframe: true,
      })
    );
    basket.position.set(0, -0.28, 0);
    group.add(basket);
  }

  // 4 Wheels with Hubcaps
  const wheelRadius = id === 'trolley_monster_wheels' ? 0.27 : 0.2;
  const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.15, 16);
  wheelGeo.rotateX(Math.PI / 2);
  const wheelMat = makeMat('#0f172a', 0.7);
  const hubMat = makeMat('#facc15', 0.3, 0.5);

  [
    [-0.72, 0.64],
    [-0.72, -0.64],
    [0.72, 0.64],
    [0.72, -0.64],
  ].forEach(([x, z]) => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(x, -0.64, z);
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(wheelRadius * 0.45, wheelRadius * 0.45, 0.17, 10).rotateX(
        Math.PI / 2
      ),
      hubMat
    );
    hub.position.set(x, -0.64, z);
    group.add(wheel, hub);
  });
}

function buildPushCrewMesh(group: THREE.Group, jerseyHex: string): void {
  const offsets = [
    [-1.85, -0.35, 0.68],
    [-1.85, -0.35, -0.68],
    [-2.48, -0.35, 0.4],
    [-2.48, -0.35, -0.4],
  ];

  offsets.forEach(([x, y, z], i) => {
    const person = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.16, 0.58, 10),
      makeMat(i % 2 === 0 ? jerseyHex : '#facc15', 0.45)
    );
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 12, 12),
      makeMat('#fde68a', 0.4)
    );
    head.position.y = 0.42;

    // Headband / Cap
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.165, 0.165, 0.08, 12),
      makeMat('#ef4444', 0.4)
    );
    cap.position.y = 0.49;

    // Arms reaching forward to push the craft
    [-0.18, 0.18].forEach((az) => {
      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.04, 0.34, 8),
        makeMat('#fde68a', 0.4)
      );
      arm.position.set(0.18, 0.12, az);
      arm.rotation.z = -1.2;
      person.add(arm);
    });

    person.add(body, head, cap);
    person.position.set(x, y, z);
    group.add(person);
  });
}

function createSocketMarkers(
  airframeGroup: THREE.Group,
  trolleyGroup: THREE.Group
): Record<PartCategory, THREE.Mesh> {
  const makeRing = (color: number, pos: [number, number, number], parent: THREE.Group) => {
    const geo = new THREE.RingGeometry(0.24, 0.36, 24);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    parent.add(mesh);
    return mesh;
  };

  return {
    chassis: makeRing(0x38bdf8, [0, 0.05, 0], airframeGroup),
    wings: makeRing(0xfacc15, [0, 0.56, 0], airframeGroup),
    tail: makeRing(0xf43f5e, [-1.8, 0.35, 0], airframeGroup),
    nose: makeRing(0x22c55e, [1.55, 0.1, 0], airframeGroup),
    topper: makeRing(0xa855f7, [0, 1.05, 0], airframeGroup),
    trolley: makeRing(0xf97316, [0, -0.55, 0], trolleyGroup),
  };
}
