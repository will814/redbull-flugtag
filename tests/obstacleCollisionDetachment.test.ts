import { describe, it, expect } from 'vitest';
import {
  createInitialSoapboxState,
  damagePartSlot,
  detachSoapboxPart,
  applyDirectionalObstacleDamage,
  stepSoapboxSimulation,
  SoapboxObstacle,
  SoapboxDetachablePartSlot,
} from '../src/soapbox/SoapboxPhysicsEngine';
import { SOAPBOX_PRESETS } from '../src/soapbox/SoapboxPartCatalog';
import { computeSoapboxMetrics } from '../src/soapbox/SoapboxMetrics';

describe('Obstacle Collisions, Damage Routing & 3D Debris Ballistics', () => {
  const metrics = computeSoapboxMetrics(SOAPBOX_PRESETS[0]);
  const dt = 1 / 120;

  it('routes obstacle collision damage directionally based on lateral impact offset', () => {
    // 1. Left-side impact routes damage to wheel_fl / wheel_rl
    const stateLeft = createInitialSoapboxState('alpine_panorama');
    stateLeft.phase = 'racing';
    stateLeft.lateralOffsetFeet = 0.0;
    const obsLeft: SoapboxObstacle = {
      id: 'test_obs_l',
      type: 'hay_bale',
      sFeet: 150,
      lengthFeet: 8,
      lateralCenterFeet: -2.0, // obstacle on left side relative to car
      halfWidthFeet: 2.5,
      triggered: false,
    };

    applyDirectionalObstacleDamage(stateLeft, metrics, obsLeft);
    expect(stateLeft.partHealth.wheel_fl).toBeLessThan(1.0);
    expect(stateLeft.partHealth.wheel_fr).toBe(1.0); // Right side untouched

    // 2. Right-side impact routes damage to wheel_fr / wheel_rr
    const stateRight = createInitialSoapboxState('alpine_panorama');
    stateRight.phase = 'racing';
    stateRight.lateralOffsetFeet = 0.0;
    const obsRight: SoapboxObstacle = {
      id: 'test_obs_r',
      type: 'hay_bale',
      sFeet: 150,
      lengthFeet: 8,
      lateralCenterFeet: 2.0, // obstacle on right side relative to car
      halfWidthFeet: 2.5,
      triggered: false,
    };

    applyDirectionalObstacleDamage(stateRight, metrics, obsRight);
    expect(stateRight.partHealth.wheel_fr).toBeLessThan(1.0);
    expect(stateRight.partHealth.wheel_fl).toBe(1.0); // Left side untouched

    // 3. Center impact routes damage to front bumper
    const stateCenter = createInitialSoapboxState('alpine_panorama');
    stateCenter.phase = 'racing';
    stateCenter.lateralOffsetFeet = 0.0;
    const obsCenter: SoapboxObstacle = {
      id: 'test_obs_c',
      type: 'hay_bale',
      sFeet: 150,
      lengthFeet: 8,
      lateralCenterFeet: 0.0,
      halfWidthFeet: 2.5,
      triggered: false,
    };

    applyDirectionalObstacleDamage(stateCenter, metrics, obsCenter);
    expect(stateCenter.partHealth.bumper).toBeLessThan(1.0);
  });

  it('depletes part health incrementally and detaches part when health reaches 0.0', () => {
    const state = createInitialSoapboxState('alpine_panorama');
    state.sFeet = 320;

    expect(state.attachedParts.wheel_fl).toBe(true);
    expect(state.partHealth.wheel_fl).toBe(1.0);
    expect(state.lostParts).toHaveLength(0);

    // Hit 1: 40% damage
    damagePartSlot(state, 'wheel_fl', 0.4, 'Hit Left Hay Bale');
    expect(state.attachedParts.wheel_fl).toBe(true);
    expect(state.partHealth.wheel_fl).toBeCloseTo(0.6, 0.01);
    expect(state.lostParts).toHaveLength(0);

    // Hit 2: 40% damage (health becomes 0.2)
    damagePartSlot(state, 'wheel_fl', 0.4, 'Hit Left Hay Bale');
    expect(state.attachedParts.wheel_fl).toBe(true);
    expect(state.partHealth.wheel_fl).toBeCloseTo(0.2, 0.01);

    // Hit 3: 30% damage (health drops below 0 -> triggers detachment!)
    damagePartSlot(state, 'wheel_fl', 0.3, 'Hit Left Hay Bale');
    expect(state.partHealth.wheel_fl).toBe(0.0);
    expect(state.attachedParts.wheel_fl).toBe(false);
    expect(state.lostParts).toHaveLength(1);
    expect(state.lostParts[0].slot).toBe('wheel_fl');
    expect(state.lostParts[0].sFeet).toBe(320);
    expect(state.lostParts[0].reason).toContain('Hit Left Hay Bale');
  });

  it('spawns and simulates 3D tumbling debris ballistics in Frenet road coordinates', () => {
    const state = createInitialSoapboxState('alpine_panorama');
    state.phase = 'racing';
    state.sFeet = 250;
    state.speedFtS = 45; // ~30 MPH
    state.lateralOffsetFeet = -2;
    state.debris = [];

    // Detach front-right wheel
    detachSoapboxPart(state, 'wheel_fr', 'Curb Strike');
    expect(state.debris).toHaveLength(1);

    const debrisItem = state.debris[0];
    expect(debrisItem.slot).toBe('wheel_fr');
    expect(debrisItem.sFeet).toBeCloseTo(252.7, 0.5); // 2.7 ft forward front axle placement
    expect(debrisItem.heightFeet).toBeGreaterThan(0);
    expect(debrisItem.velHeightFtS).toBeGreaterThan(0); // Upward ballistic kick
    expect(debrisItem.velSFtS).toBeGreaterThan(20); // Longitudinal forward momentum

    // Simulate 150 ticks (1.25s) of debris tumbling physics to cover full flight arc and ground impact
    let bounced = false;

    for (let tick = 0; tick < 150; tick++) {
      const prevVelHeight = debrisItem.velHeightFtS;
      stepSoapboxSimulation(state, metrics, dt, 0, null);

      // Verify finite real numbers without NaN
      expect(Number.isFinite(debrisItem.sFeet)).toBe(true);
      expect(Number.isFinite(debrisItem.lateralFeet)).toBe(true);
      expect(Number.isFinite(debrisItem.heightFeet)).toBe(true);
      expect(Number.isFinite(debrisItem.rotation.x)).toBe(true);

      // Height should stay >= 0 (above road ground surface)
      expect(debrisItem.heightFeet).toBeGreaterThanOrEqual(0);

      // Detect ground bounce (upward velocity reversal after hitting ground)
      if (prevVelHeight < 0 && debrisItem.velHeightFtS > 0) {
        bounced = true;
      }
    }

    expect(bounced).toBe(true);
  });
});
