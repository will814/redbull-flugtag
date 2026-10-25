import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CraftLoadout, PartCategory, RAMP_HEIGHT_FEET, RAMP_LENGTH_FEET, WORLD_RECORD_FEET } from '../builder/PartCatalog';
import { ComputedCraftMetrics } from '../physics/CraftMetrics';
import {
  FlightSimulationState,
  stepFlightSimulation,
} from '../physics/AeroPhysicsEngine';
import { buildCraft3D, Craft3DGroups } from './Craft3DBuilder';
import { soundEngine } from '../audio/SoundEngine';

interface FlugtagCanvas3DProps {
  mode: 'hangar' | 'flight';
  loadout: CraftLoadout;
  metrics: ComputedCraftMetrics;
  selectedCategory: PartCategory;
  windTunnelActive: boolean;
  flightStateRef: React.MutableRefObject<FlightSimulationState>;
  bestDistanceFeet: number;
  onFlightHudSync: (snapshot: FlightSimulationState) => void;
  onSplashdownComplete: (finalState: FlightSimulationState) => void;
}

// Scale factor: 1 Three.js world unit = 4 feet in flight scene so 30ft ramp = 7.5u high, 258ft record = 64.5u
const UNITS_PER_FOOT = 0.25;

export const FlugtagCanvas3D: React.FC<FlugtagCanvas3DProps> = ({
  mode,
  loadout,
  metrics,
  selectedCategory,
  windTunnelActive,
  flightStateRef,
  bestDistanceFeet,
  onFlightHudSync,
  onSplashdownComplete,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const modeRef = useRef(mode);
  const metricsRef = useRef(metrics);
  const selectedCategoryRef = useRef(selectedCategory);
  const windTunnelRef = useRef(windTunnelActive);
  const bestDistRef = useRef(bestDistanceFeet);
  const splashNotifiedRef = useRef(false);

  modeRef.current = mode;
  metricsRef.current = metrics;
  selectedCategoryRef.current = selectedCategory;
  windTunnelRef.current = windTunnelActive;
  bestDistRef.current = bestDistanceFeet;

  const craftGroupsRef = useRef<Craft3DGroups | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const orbitYawRef = useRef<number>(-0.58);
  const orbitPitchRef = useRef<number>(0.32);
  const snapBounceRef = useRef<number>(0);

  // Rebuild the 3D craft whenever loadout changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (craftGroupsRef.current) {
      scene.remove(craftGroupsRef.current.root);
    }

    const built = buildCraft3D(loadout);
    scene.add(built.root);
    craftGroupsRef.current = built;
    snapBounceRef.current = 1.0; // Trigger bouncy scale pop on part change!
  }, [loadout]);

  useEffect(() => {
    if (mode === 'flight') {
      splashNotifiedRef.current = false;
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
    sunLight.shadow.camera.far = 140;
    const d = 35;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    scene.add(sunLight);

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
    for (let i = 0; i < 6; i++) {
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 1.75, 0.38),
        new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.3 })
      );
      blade.rotation.x = (i * Math.PI) / 3;
      fanBlades.add(blade);
    }
    fanHousing.add(fanBlades);
    hangarEnv.add(fanHousing);

    // Wind Tunnel Airflow Ribbons (visible when Wind Tunnel Fan is ON)
    const windRibbonsGroup = new THREE.Group();
    const windRibbons: THREE.Mesh[] = [];
    for (let i = 0; i < 18; i++) {
      const ribbon = new THREE.Mesh(
        new THREE.BoxGeometry(1.3, 0.05, 0.05),
        new THREE.MeshBasicMaterial({
          color: i % 2 === 0 ? '#38bdf8' : '#fde047',
          transparent: true,
          opacity: 0.85,
        })
      );
      ribbon.position.set(
        4.2 - (i % 6) * 1.6,
        -0.2 + Math.floor(i / 6) * 0.85,
        ((i % 3) - 1) * 1.45
      );
      windRibbons.push(ribbon);
      windRibbonsGroup.add(ribbon);
    }
    hangarEnv.add(windRibbonsGroup);

    // 4. Build Miami Bay Flight Environment Group
    const bayEnv = new THREE.Group();
    scene.add(bayEnv);

    // Sparkling Ocean Water Plane
    const waterGeo = new THREE.PlaneGeometry(360, 220, 48, 24);
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

    // Glowing Green "DROP TROLLEY ZONE" on the last 26 ft (6.5u) of the ramp!
    const dropZoneStrip = new THREE.Mesh(
      new THREE.BoxGeometry(6.5, 0.54, 4.1),
      new THREE.MeshStandardMaterial({
        color: '#22c55e',
        emissive: '#15803d',
        emissiveIntensity: 0.45,
        roughness: 0.3,
      })
    );
    dropZoneStrip.position.set(-3.25, rampHeightU - 0.24, 0);
    bayEnv.add(dropZoneStrip);

    // Red & White Checkered Lip at x = 0
    const rampLip = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.58, 4.5),
      new THREE.MeshStandardMaterial({ color: '#ef4444', roughness: 0.3 })
    );
    rampLip.position.set(-0.3, rampHeightU - 0.23, 0);
    bayEnv.add(rampLip);

    // Pier Support Pillars down to the water
    [-20, -14, -7, -0.8].forEach((px) => {
      [-1.7, 1.7].forEach((pz) => {
        const pillar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.32, rampHeightU, 12),
          new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.5 })
        );
        pillar.position.set(px, rampHeightU / 2, pz);
        bayEnv.add(pillar);
      });
    });

    // Iconic Red Bull Archway near the end of the Flight Deck
    const archGroup = new THREE.Group();
    archGroup.position.set(-2.5, rampHeightU, 0);
    [-2.1, 2.1].forEach((z) => {
      const col = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 4.2, 0.55),
        new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.3 })
      );
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

    // Distance Buoys in the Water (50ft, 100ft, 150ft, 200ft, 258ft World Record!)
    const buoyDistances = [50, 100, 150, 200, WORLD_RECORD_FEET];
    buoyDistances.forEach((distFt) => {
      const xU = distFt * UNITS_PER_FOOT;
      const isRecord = distFt === WORLD_RECORD_FEET;

      // Lane marker line across the water
      const laneLine = new THREE.Mesh(
        new THREE.BoxGeometry(isRecord ? 0.45 : 0.22, 0.08, 18),
        new THREE.MeshBasicMaterial({
          color: isRecord ? '#facc15' : '#38bdf8',
          transparent: true,
          opacity: isRecord ? 0.9 : 0.55,
        })
      );
      laneLine.position.set(xU, 0.04, 0);
      bayEnv.add(laneLine);

      // Pair of floating buoys flanking the flight lane
      [-5.2, 5.2].forEach((z) => {
        const buoy = new THREE.Group();
        const base = new THREE.Mesh(
          new THREE.CylinderGeometry(0.65, 0.75, 0.5, 16),
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
        bayEnv.add(buoy);
      });
    });

    // Floating Thermal Wind Rings over the bay
    const thermalMeshes: THREE.Mesh[] = [];
    const initialRings = flightStateRef.current.thermalRings;
    initialRings.forEach((r) => {
      const torus = new THREE.Mesh(
        new THREE.TorusGeometry(r.radiusFeet * UNITS_PER_FOOT * 0.55, 0.16, 12, 28),
        new THREE.MeshStandardMaterial({
          color: '#fde047',
          emissive: '#f59e0b',
          emissiveIntensity: 0.6,
          roughness: 0.2,
        })
      );
      torus.rotation.y = Math.PI / 2;
      torus.position.set(r.xFeet * UNITS_PER_FOOT, r.yFeet * UNITS_PER_FOOT, 0);
      bayEnv.add(torus);
      thermalMeshes.push(torus);
    });

    // Water Splash Droplet Particles + Expanding Foam Ripple Rings
    const splashGroup = new THREE.Group();
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

    // 5. Pointer Orbit Handler for Hangar Mode
    let isDragging = false;
    let prevX = 0;
    let prevY = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (modeRef.current !== 'hangar') return;
      isDragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging || modeRef.current !== 'hangar') return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      prevX = e.clientX;
      prevY = e.clientY;
      orbitYawRef.current -= dx * 0.008;
      orbitPitchRef.current = Math.max(0.08, Math.min(0.85, orbitPitchRef.current + dy * 0.006));
    };
    const onPointerUp = () => {
      isDragging = false;
    };

    const domEl = renderer.domElement;
    domEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    // 6. Resize Handler (Essential for Razr Foldable fold/unfold & orientation changes!)
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.fov = w / h > 1.9 ? 44 : w < 520 ? 58 : 50;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    // 7. Main 60Hz Animation & Physics Loop
    let lastTime = performance.now();
    let hudTimer = 0;
    let rafId = 0;
    const smoothedLookAt = new THREE.Vector3(0, 0.35, 0);

    const animate = (now: number) => {
      rafId = requestAnimationFrame(animate);
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const elapsedSec = now * 0.001;

      const craft = craftGroupsRef.current;
      const currentMode = modeRef.current;
      const curMetrics = metricsRef.current;

      hangarEnv.visible = currentMode === 'hangar';
      bayEnv.visible = currentMode === 'flight';

      if (!craft) return;

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
        craft.trolleyGroup.position.set(0, 0, 0);
        craft.trolleyGroup.rotation.set(0, 0, 0);

        // Reset any detached part positions
        craft.wingsGroup.position.set(0, 0, 0);
        craft.wingsGroup.rotation.set(0, 0, 0);
        craft.tailGroup.position.set(0, 0, 0);
        craft.tailGroup.rotation.set(0, 0, 0);
        craft.noseGroup.position.set(0, 0, 0);
        craft.noseGroup.rotation.set(0, 0, 0);
        craft.topperGroup.position.set(0, 0, 0);
        craft.topperGroup.rotation.set(0, 0, 0);

        // Highlight active category socket marker
        (Object.keys(craft.socketMarkers) as PartCategory[]).forEach((cat) => {
          const marker = craft.socketMarkers[cat];
          marker.visible = true;
          const isSelected = cat === selectedCategoryRef.current;
          const scalePulse = isSelected ? 1.25 + Math.sin(elapsedSec * 6) * 0.2 : 0.85;
          marker.scale.set(scalePulse, scalePulse, scalePulse);
        });

        const fanOn = windTunnelRef.current;
        windRibbonsGroup.visible = fanOn;
        fanBlades.rotation.x += (fanOn ? 18 : 1.2) * dt;

        if (craft.propSpinner) {
          craft.propSpinner.rotation.x += (fanOn ? 16 : 2) * dt;
        }

        if (fanOn) {
          windRibbons.forEach((r) => {
            r.position.x -= 11 * dt;
            if (r.position.x < -4.2) {
              r.position.x = 4.5;
            }
          });
          const targetLiftY = ((curMetrics.liftScore - curMetrics.weightScore * 0.65) / 100) * 0.85;
          const targetPitchRad = (curMetrics.seesawTiltDeg * Math.PI) / 180;
          craft.airframeGroup.position.y =
            THREE.MathUtils.lerp(craft.airframeGroup.position.y, Math.max(-0.15, targetLiftY), 0.1) +
            Math.sin(elapsedSec * 5) * 0.05;
          craft.airframeGroup.rotation.z = THREE.MathUtils.lerp(
            craft.airframeGroup.rotation.z,
            targetPitchRad,
            0.1
          );
        } else {
          const gentleTiltRad = ((curMetrics.seesawTiltDeg * 0.35) * Math.PI) / 180;
          craft.airframeGroup.position.y = THREE.MathUtils.lerp(craft.airframeGroup.position.y, 0.05, 0.12);
          craft.airframeGroup.rotation.z = THREE.MathUtils.lerp(
            craft.airframeGroup.rotation.z,
            gentleTiltRad,
            0.12
          );
        }

        const radius = 7.4;
        const camX = Math.sin(orbitYawRef.current) * Math.cos(orbitPitchRef.current) * radius;
        const camY = Math.sin(orbitPitchRef.current) * radius + 0.5;
        const camZ = Math.cos(orbitYawRef.current) * Math.cos(orbitPitchRef.current) * radius;
        camera.position.lerp(new THREE.Vector3(camX, camY, camZ), 0.18);
        smoothedLookAt.lerp(new THREE.Vector3(0, 0.35, 0), 0.2);
        camera.lookAt(smoothedLookAt);
      } else {
        // FLIGHT MODE
        (Object.keys(craft.socketMarkers) as PartCategory[]).forEach((cat) => {
          craft.socketMarkers[cat].visible = false;
        });

        const sim = flightStateRef.current;
        const prevPhase = sim.phase;
        const events = stepFlightSimulation(sim, curMetrics, dt, bestDistRef.current);

        if (events.justLaunchedOffRamp) {
          soundEngine.playAirhorn();
        }
        if (events.justCollectedThermal) {
          soundEngine.playThermalChime();
        }
        if (events.justSplashedDown) {
          soundEngine.playSplash(sim.splashIntensity);
          const impactXU = sim.impactXFeet * UNITS_PER_FOOT;
          splashDrops.forEach((d, idx) => {
            d.mesh.visible = true;
            d.mesh.position.set(impactXU, 0.25, 0);
            const ang = (idx / splashDrops.length) * Math.PI * 2;
            const spd = 2.0 + (idx % 5) * 1.1;
            d.vx = Math.cos(ang) * spd;
            d.vy = 5.0 + (sim.splashIntensity / 100) * 5.8 + (idx % 4) * 1.2;
            d.vz = Math.sin(ang) * spd;
          });
          foamRings.forEach((ring) => {
            ring.visible = true;
            ring.position.set(impactXU, 0.06, 0);
            ring.scale.set(0.4, 0.4, 0.4);
            (ring.material as THREE.MeshBasicMaterial).opacity = 0.85;
          });
        }

        if (
          sim.phase === 'splashdown' &&
          sim.phaseTime >= 1.75 &&
          !splashNotifiedRef.current
        ) {
          splashNotifiedRef.current = true;
          onSplashdownComplete({ ...sim });
        }

        hudTimer += dt;
        if (hudTimer >= 0.05 || prevPhase !== sim.phase || events.justSplashedDown) {
          hudTimer = 0;
          onFlightHudSync({ ...sim });
        }

        // Position Craft in 3D World
        const craftXU = sim.xFeet * UNITS_PER_FOOT;
        const craftYU = sim.yFeet * UNITS_PER_FOOT + 0.52;
        const pitchRad = (sim.pitchDeg * Math.PI) / 180;
        craft.root.position.set(craftXU, craftYU, 0);
        craft.airframeGroup.position.set(0, 0, 0);
        craft.airframeGroup.rotation.set(0, 0, pitchRad);

        if (craft.propSpinner) {
          craft.propSpinner.rotation.x += Math.max(3, sim.vxFeet * 0.45) * dt;
        }

        craft.pilotGroup.rotation.z = -sim.pilotPitchInput * 0.38;

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

        // Independent Trolley position after detachment
        if (!sim.trolleyDetached) {
          craft.trolleyGroup.position.set(0, 0, 0);
          craft.trolleyGroup.rotation.set(0, 0, 0);
        } else {
          const relTrolleyX = (sim.trolleyXFeet - sim.xFeet) * UNITS_PER_FOOT;
          const relTrolleyY = (sim.trolleyYFeet - sim.yFeet) * UNITS_PER_FOOT;
          craft.trolleyGroup.position.set(relTrolleyX, relTrolleyY, 0);
          craft.trolleyGroup.rotation.set(0, 0, (sim.trolleyPitchDeg * Math.PI) / 180);
        }

        // Animate Thermal Rings
        sim.thermalRings.forEach((r, idx) => {
          const mesh = thermalMeshes[idx];
          if (mesh) {
            mesh.visible = !r.collected;
            mesh.rotation.z += 2.2 * dt;
          }
        });

        // Clean World-Aligned Floating Debris on Splashdown!
        if (sim.phase === 'splashdown' && sim.debris.length > 0) {
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

            // Convert desired world offset into airframe-local coordinates by counter-rotating by -pitchRad
            const worldDx = d.offsetXFeet * UNITS_PER_FOOT;
            const worldDy = (d.yFeet - sim.yFeet) * UNITS_PER_FOOT;
            const localX = worldDx * cosP - worldDy * sinP;
            const localY = worldDx * sinP + worldDy * cosP;

            targetGroup.position.set(localX, localY, d.zFeet * UNITS_PER_FOOT);
            targetGroup.rotation.set(d.rotX, d.rotY, d.rotZ - pitchRad);
          });
        } else {
          craft.wingsGroup.position.set(0, 0, 0);
          craft.wingsGroup.rotation.set(0, 0, 0);
          craft.tailGroup.position.set(0, 0, 0);
          craft.tailGroup.rotation.set(0, 0, 0);
          craft.noseGroup.position.set(0, 0, 0);
          craft.noseGroup.rotation.set(0, 0, 0);
          craft.topperGroup.position.set(0, 0, 0);
          craft.topperGroup.rotation.set(0, 0, 0);
        }

        // Update 3D Splash Droplets & Expanding Foam Rings
        if (sim.phase === 'splashdown') {
          splashDrops.forEach((d) => {
            if (!d.mesh.visible) return;
            d.vy -= 18 * dt;
            d.mesh.position.x += d.vx * dt;
            d.mesh.position.y += d.vy * dt;
            d.mesh.position.z += d.vz * dt;
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
        } else {
          splashDrops.forEach((d) => {
            d.mesh.visible = false;
          });
          foamRings.forEach((ring) => {
            ring.visible = false;
          });
        }

        // Smooth Dynamic Chase Camera
        const desiredCamPos = new THREE.Vector3();
        const desiredLookAt = new THREE.Vector3();

        if (sim.phase === 'skit') {
          desiredCamPos.set(craftXU + 4.8, craftYU + 2.2, 6.2);
          desiredLookAt.set(craftXU - 0.5, craftYU + 0.5, 0);
        } else if (sim.phase === 'ramp_push') {
          desiredCamPos.set(craftXU - 3.5, craftYU + 2.4, 8.8);
          desiredLookAt.set(craftXU + 2.5, craftYU + 0.2, 0);
        } else if (sim.phase === 'airborne') {
          desiredCamPos.set(craftXU - 4.2, Math.max(2.6, craftYU + 2.1), 10.5);
          desiredLookAt.set(craftXU + 3.2, Math.max(1.0, craftYU - 0.3), 0);
        } else {
          const angle = sim.phaseTime * 0.45;
          desiredCamPos.set(
            craftXU - 2.0 + Math.sin(angle) * 5.5,
            3.6,
            Math.cos(angle) * 8.2
          );
          desiredLookAt.set(craftXU, 0.65, 0);
        }

        camera.position.lerp(desiredCamPos, 0.12);
        smoothedLookAt.lerp(desiredLookAt, 0.14);
        camera.lookAt(smoothedLookAt);
      }

      renderer.render(scene, camera);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      domEl.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden cursor-grab active:cursor-grabbing"
    />
  );
};
