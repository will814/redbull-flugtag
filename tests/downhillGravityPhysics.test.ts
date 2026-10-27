import { describe, it, expect } from 'vitest';
import {
  SoapboxCourseId,
} from '../src/soapbox/SoapboxCourses';
import {
  createInitialSoapboxState,
  dropSoapboxStartGate,
  stepSoapboxSimulation,
} from '../src/soapbox/SoapboxPhysicsEngine';
import {
  SOAPBOX_PRESETS,
} from '../src/soapbox/SoapboxPartCatalog';
import {
  computeSoapboxMetrics,
} from '../src/soapbox/SoapboxMetrics';

describe('Downhill Gravity Physics & Unbraked Acceleration', () => {
  const metrics = computeSoapboxMetrics(SOAPBOX_PRESETS[0]);
  const dt = 1 / 120; // 120Hz physics sub-stepping

  const courseIds: SoapboxCourseId[] = [
    'alpine_panorama',
    'canyon_plunge',
    'urban_downhill',
    'extreme_peak',
  ];

  it('accelerates from rest (v=0) under gravity on start ramp reaching >5 ft/s within 1.0 second', () => {
    const state = createInitialSoapboxState('alpine_panorama');
    expect(state.phase).toBe('skit');
    expect(state.speedFtS).toBe(0);

    // Drop the start gate without crew shove
    dropSoapboxStartGate(state, metrics);
    expect(state.phase).toBe('start_ramp');

    // Reset speed to 0 to strictly test pure unbraked gravity acceleration from rest (v=0)
    state.speedFtS = 0;
    state.mph = 0;
    state.brakeInput = false;
    state.pushTuckActive = false;

    let previousSpeed = 0;
    for (let tick = 0; tick < 120; tick++) {
      stepSoapboxSimulation(state, metrics, dt, 0, null);
      // Monotonic acceleration under gravity
      expect(state.speedFtS).toBeGreaterThanOrEqual(previousSpeed);
      previousSpeed = state.speedFtS;
    }

    // Must reach > 5 ft/s in 1.0s under gravity alone
    expect(state.speedFtS).toBeGreaterThan(5.0);
    expect(state.mph).toBeGreaterThan(3.4);
  });

  it('accelerates from rest (v=0) when placed directly on racing course at s=0 without initial speed floor jump', () => {
    for (const courseId of courseIds) {
      const state = createInitialSoapboxState(courseId);
      state.phase = 'racing';
      state.sFeet = 0;
      state.distanceFeet = 0;
      state.speedFtS = 0;
      state.mph = 0;
      state.brakeInput = false;
      state.pushTuckActive = false;

      // First tick from zero
      stepSoapboxSimulation(state, metrics, dt, 0, null);

      // Must have moved forward and accelerated continuously without artificial jumps
      expect(state.speedFtS).toBeGreaterThan(0);
      expect(state.speedFtS).toBeLessThan(5.0); // Real continuous acceleration, not clamped to arbitrary floor
      expect(state.sFeet).toBeGreaterThan(0);
    }
  });

  it('achieves > 25 MPH downhill speed on all 4 courses under unbraked gravity descent', () => {
    for (const courseId of courseIds) {
      const state = createInitialSoapboxState(courseId);
      dropSoapboxStartGate(state, metrics);
      state.brakeInput = false;
      state.pushTuckActive = false;

      // Simulate up to 20 seconds of downhill rolling (2400 ticks at 120Hz)
      let reachedHighSpeed = false;
      for (let tick = 0; tick < 2400; tick++) {
        stepSoapboxSimulation(state, metrics, dt, 0, null);

        if (state.mph >= 25.0) {
          reachedHighSpeed = true;
          break;
        }

        if (state.phase === 'finished' || state.isWrecked || state.isRolledOver) {
          break;
        }
      }

      expect(reachedHighSpeed).toBe(true);
      expect(state.maxSpeedMph).toBeGreaterThanOrEqual(25.0);
    }
  });

  it('decelerates and generates brake heat when brakes are engaged', () => {
    const state = createInitialSoapboxState('alpine_panorama');
    state.phase = 'racing';
    state.sFeet = 200;
    state.speedFtS = 40; // ~27 MPH
    state.mph = 40 * 0.681818;
    state.brakeHeat = 0;

    // Apply brakes for 60 ticks (0.5s)
    state.brakeInput = true;
    for (let tick = 0; tick < 60; tick++) {
      stepSoapboxSimulation(state, metrics, dt, 0, null);
    }

    // Speed should have decreased compared to unbraked state
    expect(state.speedFtS).toBeLessThan(40);
    // Brake heat must increase
    expect(state.brakeHeat).toBeGreaterThan(0);
  });
});
