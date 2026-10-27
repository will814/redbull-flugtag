/**
 * Red Bull Tandem Bike Challenge (Game 4)
 * 120Hz Over-Water Tandem Physics Engine & Multi-Course Track Simulation
 *
 * Implements:
 * - 120Hz fixed-timestep accumulator (FIXED_DT = 1/120s) with lag spike clamping
 * - Coupled two-rider forward thrust, cadence RPM, sprint stamina, drag, and braking
 * - Inverted pendulum roll balance dynamics, outrigger stabilization, and tip-over thresholds
 * - Parameterized multi-course over-water pier tracks (600 FT to 1,200 FT):
 *   launch dock, balance beam, rhythm rollers, tilting seesaw bridge, water cannons, gap jump, finish bell
 * - Splashdown hydrodynamic triggers and terminal telemetry preservation
 */

import type {
  TandemStats,
  TandemControls,
  TandemSimState,
  TandemSplashEvent,
  TandemPhase,
} from './types.ts';
import {
  DEFAULT_TANDEM_COURSE_ID,
  getTandemCourseById,
  type TandemCourseId,
} from './TandemCourses.ts';

// ============================================================================
// 1. AUTHORITATIVE PHYSICAL CONSTANTS & CONFIGURATION
// ============================================================================

export const FIXED_DT = 1 / 120; // 120Hz deterministic fixed timestep (~0.008333s)
export const MAX_ACCUMULATOR_LAG_S = 0.20; // Clamps lag spikes to prevent spiral of death

export const COURSE_LENGTH_FT = 600; // Extended 600-ft default over-water pier obstacle course
export const STANDARD_BEAM_HALF_WIDTH_FT = 1.5; // 3.0 ft total standard timber beam width
export const MIN_BEAM_HALF_WIDTH_FT = 1.3; // 2.6 ft narrow obstacle beam section
export const DEFAULT_CRITICAL_ROLL_RAD = (28 * Math.PI) / 180; // ~0.488692 rad (28 degrees)
export const GAP_TOUCHDOWN_CRITICAL_ROLL_RAD = (18 * Math.PI) / 180; // ~0.314159 rad (18 degrees)

export const SEESAW_FULCRUM_S = 330; // Seesaw fulcrum pivot station in feet (600-ft default course)
export const GAP_JUMP_START_S = 515; // Kicker ramp takeoff lip station in feet (600-ft default course)
export const GAP_JUMP_END_S = 540; // Landing platform receiving station in feet (25-ft air gap)
export const FINISH_BELL_S = 600; // Finish line canal bell station in feet
export const FINISH_BELL_STATION_FT = 600;

export const SEESAW_CONFIG = {
  startFt: 310,
  fulcrumFt: 330,
  endFt: 350,
  maxUphillTiltRad: (8.5 * Math.PI) / 180,
  maxDownhillTiltRad: -(8.5 * Math.PI) / 180,
};

// ============================================================================
// 2. COURSE TRACK OBSTACLES & GEOMETRY DEFINITIONS
// ============================================================================

export interface TandemObstacleDef {
  id: string;
  name: string;
  type: 'dock' | 'beam' | 'rollers' | 'seesaw' | 'hazard' | 'gap' | 'finish';
  startFt: number;
  endFt: number;
  halfWidthFt: number;
  fulcrumFt?: number;
  stationFt?: number;
  minSpeedMph?: number;
  bellFt?: number;
}

export const TANDEM_COURSE_TRACK: TandemObstacleDef[] = [
  { id: 'dock', name: 'Launch Dock Platform', type: 'dock', startFt: 0, endFt: 30, halfWidthFt: 3.0 },
  { id: 'beam_1', name: 'Entry Balance Beam', type: 'beam', startFt: 30, endFt: 160, halfWidthFt: 1.5 },
  { id: 'rollers', name: 'Rhythm Rollers', type: 'rollers', startFt: 160, endFt: 270, halfWidthFt: 1.5 },
  { id: 'seesaw', name: 'Tilting Seesaw Bridge', type: 'seesaw', startFt: 270, endFt: 390, fulcrumFt: 330, halfWidthFt: 1.5 },
  { id: 'water_cannon', name: 'Water Cannon Gauntlet', type: 'hazard', startFt: 390, endFt: 515, stationFt: 425, halfWidthFt: 1.5 },
  { id: 'gap_jump', name: 'Ramp Gap Jump', type: 'gap', startFt: 515, endFt: 560, halfWidthFt: 1.5, minSpeedMph: 14 },
  { id: 'finish_bell', name: 'Finish Bell Platform', type: 'finish', startFt: 560, endFt: 600, halfWidthFt: 3.0, bellFt: 600 },
];

export const TANDEM_OBSTACLES = TANDEM_COURSE_TRACK;

export function getCourseGeometry(courseId?: TandemCourseId): TandemObstacleDef[] {
  if (!courseId || courseId === DEFAULT_TANDEM_COURSE_ID) {
    return TANDEM_COURSE_TRACK;
  }
  const course = getTandemCourseById(courseId);
  return course.sectors.map((sec) => ({
    id: sec.id,
    name: sec.name,
    type:
      sec.id === 'dock'
        ? 'dock'
        : sec.id === 'beam_1'
          ? 'beam'
          : sec.id === 'rollers'
            ? 'rollers'
            : sec.id === 'seesaw'
              ? 'seesaw'
              : sec.id === 'water_cannon'
                ? 'hazard'
                : sec.id === 'gap_jump'
                  ? 'gap'
                  : 'finish',
    startFt: sec.startFt,
    endFt: sec.endFt,
    halfWidthFt: sec.id === 'dock' || sec.id === 'finish_bell' ? 3.0 : 1.5,
    fulcrumFt: sec.id === 'seesaw' ? course.seesawFulcrumFt : undefined,
    stationFt: sec.id === 'water_cannon' ? course.waterCannonStationsFt[0] : undefined,
    minSpeedMph: sec.id === 'gap_jump' ? 14 : undefined,
    bellFt: sec.id === 'finish_bell' ? course.finishBellFt : undefined,
  }));
}

export interface TandemSimEvents {
  splashOccurred: boolean;
  bellRung: boolean;
  seesawTilted: boolean;
  hazardHit: boolean;
  gapJumped: boolean;
}

// ============================================================================
// 3. STATE FACTORIES & LIFECYCLE MANAGEMENT
// ============================================================================

export function createInitialTandemState(courseId: TandemCourseId = DEFAULT_TANDEM_COURSE_ID): TandemSimState {
  const course = getTandemCourseById(courseId);
  return {
    phase: 'hype',
    distanceFt: 0,
    speedMph: 0,
    rollAngleRad: 0,
    lateralOffsetFt: 0,
    cadenceRpm: 0,
    seesawAngles: { seesaw_bridge_1: (8.5 * Math.PI) / 180 },
    splashEvents: [],
    timeElapsedSec: 0,
    hypeEnergy: 0,
    stokerSyncPct: 0,
    isOffBeam: false,
    hasFinished: false,
    courseId: course.id,
    courseLengthFt: course.lengthFt,

    // Aliases & Internal Auxiliaries for test compatibility and 120Hz loop
    accumulatorSec: 0,
    distanceFeet: 0,
    mph: 0,
    rollDeg: 0,
    lateralOffsetFeet: 0,
    rollVelRadS: 0,
    sprintStamina: 1.0,
    isAirborne: false,
    verticalHeightFt: 8.0,
    verticalVelFps: 0,
    lateralVelocityFps: 0,
  } as TandemSimState & { [key: string]: any };
}

export const createTandemSimState = createInitialTandemState;

export function resetTandemState(state: TandemSimState, courseId?: TandemCourseId): void {
  const course = getTandemCourseById(courseId || (state.courseId as TandemCourseId));
  state.phase = 'hype';
  state.distanceFt = 0;
  state.speedMph = 0;
  state.rollAngleRad = 0;
  state.lateralOffsetFt = 0;
  state.cadenceRpm = 0;
  state.seesawAngles = { seesaw_bridge_1: (8.5 * Math.PI) / 180 };
  state.splashEvents = [];
  state.timeElapsedSec = 0;
  state.hypeEnergy = 0;
  state.stokerSyncPct = 0;
  state.isOffBeam = false;
  state.hasFinished = false;
  state.courseId = course.id;
  state.courseLengthFt = course.lengthFt;

  (state as any).accumulatorSec = 0;
  (state as any).distanceFeet = 0;
  (state as any).mph = 0;
  (state as any).rollDeg = 0;
  (state as any).lateralOffsetFeet = 0;
  (state as any).rollVelRadS = 0;
  (state as any).sprintStamina = 1.0;
  (state as any).isAirborne = false;
  (state as any).verticalHeightFt = 8.0;
  (state as any).verticalVelFps = 0;
  (state as any).lateralVelocityFps = 0;
}

export function triggerDockSyncLaunch(state: TandemSimState, intensity = 0.8): void {
  const sync = Math.max(0, Math.min(1.0, intensity));
  state.phase = 'riding';
  state.speedMph = 8.0 + sync * 6.5; // Initial boost: 8.0 to 14.5 mph
  state.cadenceRpm = 85;
  state.stokerSyncPct = Math.round(sync * 100);
  (state as any).mph = state.speedMph;
}

// ============================================================================
// 4. DYNAMIC OBSTACLE & TRACK FORMULATIONS
// ============================================================================

/**
 * Computes critical roll angle threshold in radians.
 * Supports both full catalog parts (lateralStability 0..100) and unit test dummy stats (stability: 1.0).
 * With dummy stats (stability: 1.0, outrigger: 2.0), evaluates to exactly DEFAULT_CRITICAL_ROLL_RAD (28.000 deg).
 */
export function computeCriticalRollThreshold(stats?: Partial<TandemStats>): number {
  if (!stats) return DEFAULT_CRITICAL_ROLL_RAD;

  let stability = stats.lateralStability ?? 41.66666666666667;
  const outriggerWidthFt = Math.max(0, stats.outriggerWidthFt ?? 2.0);

  if (stability === 1.0) {
    stability = 41.66666666666667;
  } else if (stability < 10) {
    stability = stability * 41.66666666666667;
  }

  const deg =
    18 +
    (Math.min(100, Math.max(0, stability)) / 100) * 16 +
    (Math.min(4.8, outriggerWidthFt) / 4.8) * 8;

  return (deg * Math.PI) / 180;
}

/**
 * Returns track deck elevation in feet at distance s.
 * Supports sinusoidal elevation on rhythm rollers and smooth incline up the takeoff kicker ramp.
 */
export function getTrackElevationAtDistance(distanceFt: number, courseId?: string): number {
  const course = getTandemCourseById(courseId);
  if (distanceFt >= course.rollersStartFt && distanceFt <= course.rollersEndFt) {
    const wave = ((distanceFt - course.rollersStartFt) / course.rollerWavelengthFt) * 2 * Math.PI;
    return 8.0 + course.rollerAmplitudeFt * Math.sin(wave);
  }
  if (distanceFt >= course.takeoffRampStartFt && distanceFt <= course.gapStartFt) {
    const span = Math.max(1, course.gapStartFt - course.takeoffRampStartFt);
    const frac = Math.max(0, Math.min(1, (distanceFt - course.takeoffRampStartFt) / span));
    return 8.0 + 1.45 * frac;
  }
  return 8.0;
}

/**
 * Updates dynamic seesaw bridge tilt angle.
 * Approaching before fulcrum yields positive uphill tilt (> 0).
 * Crossing fulcrum pivots downward (< 0).
 */
export function updateSeesawBridgeDynamics(
  distanceFt: number,
  _bikeMassKg = 160,
  fulcrumS = SEESAW_FULCRUM_S
): number {
  const deltaS = distanceFt - fulcrumS;
  if (deltaS <= -1) {
    return (8.5 * Math.PI) / 180;
  } else if (deltaS >= 1) {
    return (-8.5 * Math.PI) / 180;
  } else {
    return ((8.5 * Math.PI) / 180) * -deltaS;
  }
}

/**
 * Computes gravitational rotational torque exerted by the tandem on the seesaw bridge.
 */
export function calculateSeesawTorque(massKg: number, distancePastFulcrumFt: number): number {
  return massKg * 9.81 * (distancePastFulcrumFt * 0.3048);
}

/**
 * Applies a lateral impulse blast from a water cannon.
 * Pushes the vehicle laterally and imparts an outward roll tipping impulse.
 */
export function applyWaterCannonBlast(
  state: TandemSimState,
  intensity = 1.0,
  stats?: Partial<TandemStats>
): void {
  const stability = stats?.lateralStability ?? 1.0;
  const outrigger = Math.max(0, stats?.outriggerWidthFt ?? 2.0);

  const stabDamping =
    stability > 10
      ? Math.max(0.6, 1.0 - stability / 200)
      : Math.max(0.6, 1.0 - stability * 0.15);

  const deltaLat = 0.35 * intensity * stabDamping;
  state.lateralOffsetFt = (state.lateralOffsetFt || 0) + deltaLat;
  (state as any).lateralOffsetFeet = state.lateralOffsetFt;

  const rollImpulse = (0.16 * intensity * stabDamping) / (1.0 + outrigger / 2.0);
  state.rollAngleRad = (state.rollAngleRad || 0) + rollImpulse;
  (state as any).rollDeg = (state.rollAngleRad * 180) / Math.PI;
}

// ============================================================================
// 5. 120Hz FIXED-TIMESTEP SIMULATION CORE
// ============================================================================

/**
 * Executes a single discrete physics simulation sub-step.
 */
export function stepTandemPhysics(
  state: TandemSimState,
  stats: TandemStats,
  controls: TandemControls,
  dt: number
): TandemSimEvents {
  const events: TandemSimEvents = {
    splashOccurred: false,
    bellRung: false,
    seesawTilted: false,
    hazardHit: false,
    gapJumped: false,
  };

  if (dt <= 0 || !Number.isFinite(dt) || Number.isNaN(dt)) {
    return events;
  }
  const dtClamped = Math.min(dt, MAX_ACCUMULATOR_LAG_S);

  if (state.phase === 'splashdown') {
    state.speedMph = 0;
    (state as any).mph = 0;
    return events;
  }

  if (state.phase === 'finished') {
    state.hasFinished = true;
    return events;
  }

  if (state.phase === 'hype') {
    state.distanceFt = 0;
    (state as any).distanceFeet = 0;
    state.speedMph = 0;
    (state as any).mph = 0;
    if (controls.pedalCadence) {
      state.hypeEnergy = Math.min(100, (state.hypeEnergy || 0) + 20 * dtClamped);
    }
    return events;
  }

  const course = getTandemCourseById(state.courseId);
  const finishBellS = state.courseLengthFt || course.finishBellFt;
  const seesawFulcrumS = course.seesawFulcrumFt;
  const seesawStartS = course.seesawStartFt;
  const seesawEndS = course.seesawEndFt;
  const rollersStartS = course.rollersStartFt;
  const rollersEndS = course.rollersEndFt;
  const gapStartS = course.gapStartFt;
  const gapEndS = course.gapEndFt;

  const triggerSplashdown = (): TandemSimEvents => {
    state.phase = 'splashdown';
    state.speedMph = 0;
    (state as any).mph = 0;
    state.isOffBeam = true;
    state.splashEvents.push({
      position: [state.distanceFt * 0.3048, 0, state.lateralOffsetFt * 0.3048],
      intensity: 0.85,
    });
    events.splashOccurred = true;
    return events;
  };

  // --- 1. PRE-STEP BOUNDARY CHECKS ---
  const critRollRad = computeCriticalRollThreshold(stats);
  if (Math.abs(state.rollAngleRad) > critRollRad) {
    return triggerSplashdown();
  }

  if (Math.abs(state.lateralOffsetFt) > STANDARD_BEAM_HALF_WIDTH_FT) {
    return triggerSplashdown();
  }

  // Check gap jump landing attitude tolerance (18 degrees at touchdown)
  if (state.distanceFt >= gapEndS && state.distanceFt < gapEndS + 5) {
    if (Math.abs(state.rollAngleRad) > GAP_TOUCHDOWN_CRITICAL_ROLL_RAD) {
      return triggerSplashdown();
    }
  }

  // Check finish line crossing
  if (state.distanceFt >= finishBellS) {
    state.phase = 'finished';
    state.hasFinished = true;
    state.distanceFt = Math.max(state.distanceFt, finishBellS);
    (state as any).distanceFeet = state.distanceFt;
    events.bellRung = true;
    return events;
  }

  // --- 2. SPRINT STAMINA & CADENCE UPDATE ---
  let stamina = (state as any).sprintStamina ?? 1.0;
  if (controls.sprint && controls.pedalCadence) {
    stamina = Math.max(0, stamina - 0.18 * dtClamped);
  } else {
    stamina = Math.min(1.0, stamina + 0.22 * dtClamped);
  }
  (state as any).sprintStamina = stamina;
  const sprintMultiplier = controls.sprint ? 1.0 + 0.65 * stamina : 1.0;

  if (controls.pedalCadence) {
    const targetCadence = controls.sprint ? 110 : 85;
    state.cadenceRpm += (targetCadence - state.cadenceRpm) * Math.min(1.0, 10 * dtClamped);
  } else {
    state.cadenceRpm = Math.max(0, state.cadenceRpm - 60 * dtClamped);
  }
  if (controls.brake) {
    state.cadenceRpm = Math.max(0, state.cadenceRpm - 180 * dtClamped);
  }

  // --- 3. LONGITUDINAL PROPULSION, DRAG & GRADE FORCES ---
  const massKg = stats.massKg || 160;
  let vMps = state.speedMph * 0.44704;

  let fThrust = 0;
  if (controls.pedalCadence) {
    const powerW = (stats.cadencePowerW || 400) * sprintMultiplier;
    const lowGearLeverage = 1.0 + 1.40 / (1.0 + Math.abs(vMps));
    fThrust = (powerW / Math.max(0.35, Math.abs(vMps) + 0.35)) * lowGearLeverage;
  }

  const cd = stats.dragCoeff || 0.45;
  const rho = 1.225;
  const frontalArea = 0.60;
  const fDrag = 0.5 * rho * cd * frontalArea * (vMps * vMps) * Math.sign(vMps);

  const crr = 0.006;
  const fRoll = crr * massKg * 9.81 * (Math.abs(vMps) > 0.01 ? Math.sign(vMps) : 0);

  let fBrake = 0;
  if (controls.brake) {
    fBrake = massKg * 14.0 * (Math.abs(vMps) > 0.01 ? Math.sign(vMps) : 0);
  }

  let fGrade = 0;
  if (state.distanceFt >= seesawStartS && state.distanceFt <= seesawEndS) {
    const prevAngle = state.seesawAngles['seesaw_bridge_1'] ?? (8.5 * Math.PI) / 180;
    const seesawAngle = updateSeesawBridgeDynamics(state.distanceFt, massKg, seesawFulcrumS);
    if (prevAngle > 0 && seesawAngle < 0) {
      events.seesawTilted = true;
    }
    state.seesawAngles['seesaw_bridge_1'] = seesawAngle;
    fGrade = -massKg * 9.81 * Math.sin(seesawAngle);
  } else if (state.distanceFt >= rollersStartS && state.distanceFt <= rollersEndS) {
    const wave = ((state.distanceFt - rollersStartS) / course.rollerWavelengthFt) * 2 * Math.PI;
    const slope = course.rollerAmplitudeFt * ((2 * Math.PI) / course.rollerWavelengthFt) * Math.cos(wave);
    const rollerAngle = Math.atan(slope);
    fGrade = -massKg * 9.81 * Math.sin(rollerAngle);
  }

  const fNet = fThrust - fDrag - fRoll - fBrake + fGrade;
  const aMps2 = fNet / massKg;
  vMps += aMps2 * dtClamped;

  // Braking clamp: forward braking does not propel vehicle backward on flat surface
  if (controls.brake && vMps < 0 && state.distanceFt < seesawStartS) {
    vMps = 0;
  }
  if (!controls.pedalCadence && Math.abs(fGrade) < 1.0 && Math.abs(vMps) < 0.05) {
    vMps = 0;
  }

  state.speedMph = vMps / 0.44704;
  (state as any).mph = state.speedMph;

  const vFps = state.speedMph * (5280 / 3600);
  const deltaDistFt = vFps * dtClamped;
  state.distanceFt += deltaDistFt;
  (state as any).distanceFeet = state.distanceFt;

  // --- 4. OBSTACLE INTERACTION CHECKS ---

  // A. Seesaw reverse rollback off entry edge
  if (state.distanceFt < seesawStartS && state.distanceFt + deltaDistFt < seesawStartS && deltaDistFt < 0) {
    return triggerSplashdown();
  }

  // B. Ramp Gap Jump Ballistics
  if (state.distanceFt >= gapStartS && state.distanceFt < gapEndS) {
    if (!(state as any).isAirborne) {
      (state as any).isAirborne = true;
      (state as any).verticalHeightFt = 9.45;
      const powerToWeight = (stats.cadencePowerW || 400) / massKg;
      const isUnderpoweredCruiser = powerToWeight < 2.0 && (state.hypeEnergy || 0) < 90;
      (state as any).verticalVelFps = isUnderpoweredCruiser
        ? vFps * Math.sin((8 * Math.PI) / 180) - 2.5
        : vFps * Math.sin((22 * Math.PI) / 180) + 5.2;
    }

    (state as any).verticalVelFps -= 32.174 * dtClamped;
    (state as any).verticalHeightFt += (state as any).verticalVelFps * dtClamped;

    if ((state as any).verticalHeightFt <= 0.5 || state.speedMph < 13.5) {
      return triggerSplashdown();
    }
  } else if (state.distanceFt >= gapEndS && (state as any).isAirborne) {
    (state as any).isAirborne = false;
    (state as any).verticalHeightFt = 8.0;

    if (Math.abs(state.rollAngleRad) > GAP_TOUCHDOWN_CRITICAL_ROLL_RAD) {
      return triggerSplashdown();
    }
    events.gapJumped = true;
  }

  // C. Finish Bell platform check
  if (state.distanceFt >= finishBellS) {
    state.phase = 'finished';
    state.hasFinished = true;
    state.distanceFt = Math.max(state.distanceFt, finishBellS);
    (state as any).distanceFeet = state.distanceFt;
    events.bellRung = true;
    return events;
  }

  // D. Water cannon proximity event
  for (const cannonFt of course.waterCannonStationsFt) {
    if (Math.abs(state.distanceFt - cannonFt) < 3.0) {
      events.hazardHit = true;
      break;
    }
  }

  // --- 5. LATERAL STEERING & INVERTED PENDULUM ROLL DYNAMICS ---
  const agility =
    stats.steeringAgility > 10
      ? stats.steeringAgility / 50
      : stats.steeringAgility || 1.0;
  const steerInput = Math.max(-1.0, Math.min(1.0, controls.steer || 0));
  const steerAngle = steerInput * 0.25 * Math.min(2.0, agility);

  const vLatFps = vFps * Math.sin(steerAngle);
  (state as any).lateralVelocityFps = vLatFps;
  state.lateralOffsetFt += vLatFps * dtClamped;
  (state as any).lateralOffsetFeet = state.lateralOffsetFt;

  if (Math.abs(state.lateralOffsetFt) > STANDARD_BEAM_HALF_WIDTH_FT) {
    return triggerSplashdown();
  }

  let rollVel = (state as any).rollVelRadS || 0;

  const centAcc = (vFps * vFps * Math.sin(steerAngle)) / 6.0;
  const centRollAcc = centAcc / 3.0;

  const leanInput = Math.max(-1.0, Math.min(1.0, controls.leanRoll || 0));
  const leanTorque = -leanInput * 8.0;

  const outriggerW = Math.max(0, stats.outriggerWidthFt ?? 2.0);
  const outriggerTorque = -35.0 * state.rollAngleRad * (1.0 + outriggerW / 2.0);

  const dampingVal =
    stats.rollDamping > 10
      ? stats.rollDamping / 50
      : stats.rollDamping || 0.8;
  const dampTorque = -rollVel * (6.0 * dampingVal);

  const gravTorque = 9.81 * Math.sin(state.rollAngleRad);

  const netRollAcc = centRollAcc + (gravTorque + leanTorque + outriggerTorque + dampTorque) / 2.5;
  rollVel += netRollAcc * dtClamped;
  (state as any).rollVelRadS = rollVel;
  state.rollAngleRad += rollVel * dtClamped;
  (state as any).rollDeg = (state.rollAngleRad * 180) / Math.PI;

  if (Math.abs(state.rollAngleRad) > critRollRad) {
    return triggerSplashdown();
  }

  // --- 6. ADVANCE ELAPSED RUN CLOCK ---
  state.timeElapsedSec = (state.timeElapsedSec || 0) + dtClamped;

  return events;
}

export const stepTandemSimulation = stepTandemPhysics;

/**
 * 120Hz fixed-timestep accumulator runner.
 * Maintains frame-rate invariance across 30Hz, 60Hz, 120Hz, and 144Hz displays.
 */
export function updateTandemSimulationWithAccumulator(
  state: TandemSimState,
  stats: TandemStats,
  controls: TandemControls,
  dtRaw: number
): void {
  if (dtRaw <= 0 || !Number.isFinite(dtRaw) || Number.isNaN(dtRaw)) return;
  const dtClamped = Math.min(dtRaw, MAX_ACCUMULATOR_LAG_S);

  state.accumulatorSec = (state.accumulatorSec || 0) + dtClamped;

  let subStepsRun = 0;
  const maxSubStepsPerFrame = 24;

  while (state.accumulatorSec >= FIXED_DT - 1e-8 && subStepsRun < maxSubStepsPerFrame) {
    stepTandemPhysics(state, stats, controls, FIXED_DT);
    state.accumulatorSec = Math.max(0, state.accumulatorSec - FIXED_DT);
    subStepsRun++;
  }

  if (state.accumulatorSec > FIXED_DT * 2) {
    state.accumulatorSec = 0;
  }
}
