import { ComputedCraftMetrics } from './CraftMetrics';
import { RAMP_HEIGHT_FEET, RAMP_LENGTH_FEET, WORLD_RECORD_FEET } from '../builder/PartCatalog';

export type FlightPhase = 'skit' | 'ramp_push' | 'airborne' | 'splashdown';
export type TrolleyReleaseQuality = 'pending' | 'early' | 'perfect' | 'good' | 'late';

export interface ThermalRing {
  id: number;
  xFeet: number;
  yFeet: number;
  radiusFeet: number;
  collected: boolean;
}

export interface DetachedDebris {
  partKey: 'wings' | 'tail' | 'nose' | 'topper';
  /** World X offset in feet from impact point */
  offsetXFeet: number;
  /** Height in feet above water surface (>= 0) */
  yFeet: number;
  /** World Z offset in feet */
  zFeet: number;
  vx: number;
  vy: number;
  vz: number;
  rotX: number;
  rotY: number;
  rotZ: number;
}

export interface JudgeScores {
  distanceJudge: number;     // 1 - 10
  creativityJudge: number;   // 1 - 10
  showmanshipJudge: number;  // 1 - 10
  totalScore: number;        // 3 - 30
  starsEarned: number;       // 1 - 3 stars for this run
  splashRating: 'Smooth Skim!' | 'Big Splash!' | 'MEGA CANNONBALL!!';
  isOverWeightCannonball: boolean;
  newRecord: boolean;
  beatWorldRecord: boolean;
}

export interface FlightSimulationState {
  phase: FlightPhase;
  phaseTime: number;
  /** Craft horizontal position in feet relative to the ramp edge (-90 ft to +300 ft) */
  xFeet: number;
  /** Craft altitude in feet above water (water is 0 ft, ramp deck is 30 ft) */
  yFeet: number;
  /** Velocity components in ft/s */
  vxFeet: number;
  vyFeet: number;
  /** Pitch angle in degrees (+nose up, -nose down) */
  pitchDeg: number;
  /** Pitch angular velocity in deg/s */
  pitchVelDeg: number;
  /** Current Angle of Attack (AoA) in degrees */
  aoaDeg: number;
  /** Whether the wings are currently stalling (AoA too high!) */
  isStalling: boolean;
  /** Whether the craft is in the sweet-spot glide AoA (4.5 to 11.5 deg) */
  inSweetSpot: boolean;
  /** Live pitch balance zone for the Pitch Level Guide HUD & physics penalty */
  pitchZone: 'too_high' | 'sweet_spot' | 'too_low';
  /** Active wind gust indicator (-1 downdraft, 0 calm, +1 updraft/gust) */
  windGustWarning: 'calm' | 'headwind_gust' | 'downdraft';
  /** Pre-launch crew dance hype meter (0 to 100) */
  hypeMeter: number;
  /** Ramp push speed percentage (0 to 100) */
  pushMeter: number;
  /** Whether the craft is inside the green Trolley Drop zone (-22 ft to 0 ft) */
  inTrolleyDropZone: boolean;
  trolleyDetached: boolean;
  trolleyReleaseQuality: TrolleyReleaseQuality;
  /** Independent trolley position after separation */
  trolleyXFeet: number;
  trolleyYFeet: number;
  trolleyVxFeet: number;
  trolleyVyFeet: number;
  trolleyPitchDeg: number;
  /** Pilot weight shift input (-1 = lean forward/nose down, +1 = lean back/nose up) */
  pilotPitchInput: number;
  /** Floating thermal rings over the water */
  thermalRings: ThermalRing[];
  thermalsCollected: number;
  /** Exact X position where craft first touched water */
  impactXFeet: number;
  /** Broken-off floating parts on hard water splashdown */
  debris: DetachedDebris[];
  /** Final / current flight distance in feet */
  distanceFeet: number;
  splashIntensity: number;
  judgeScores: JudgeScores | null;
}

const FEET_PER_METER = 3.28084;
const METERS_PER_FOOT = 1 / FEET_PER_METER;
const GRAVITY_MPS2 = 9.81;
const AIR_DENSITY_RHO = 1.225;
const MAX_AIRBORNE_SUBSTEP = 1 / 120;

const STEP_RESULT = {
  justLaunchedOffRamp: false,
  justSplashedDown: false,
  justCollectedThermal: false,
};

export function createInitialFlightState(): FlightSimulationState {
  return {
    phase: 'skit',
    phaseTime: 0,
    xFeet: -RAMP_LENGTH_FEET + 12, // Start at -78 ft on the 90-ft deck
    yFeet: RAMP_HEIGHT_FEET,       // 30 ft above water
    vxFeet: 0,
    vyFeet: 0,
    pitchDeg: 0,
    pitchVelDeg: 0,
    aoaDeg: 0,
    isStalling: false,
    inSweetSpot: true,
    pitchZone: 'sweet_spot',
    windGustWarning: 'calm',
    hypeMeter: 25,
    pushMeter: 0,
    inTrolleyDropZone: false,
    trolleyDetached: false,
    trolleyReleaseQuality: 'pending',
    trolleyXFeet: -RAMP_LENGTH_FEET + 12,
    trolleyYFeet: RAMP_HEIGHT_FEET,
    trolleyVxFeet: 0,
    trolleyVyFeet: 0,
    trolleyPitchDeg: 0,
    pilotPitchInput: 0,
    thermalRings: [
      { id: 1, xFeet: 58, yFeet: 21, radiusFeet: 10.5, collected: false },
      { id: 2, xFeet: 132, yFeet: 17, radiusFeet: 11, collected: false },
      { id: 3, xFeet: 208, yFeet: 14, radiusFeet: 11.5, collected: false },
    ],
    thermalsCollected: 0,
    impactXFeet: 0,
    debris: [],
    distanceFeet: 0,
    splashIntensity: 0,
    judgeScores: null,
  };
}

/**
 * Triggers a burst of Crew Hype during Skit, or Sprint Push / Trolley Release on the Ramp.
 */
export function triggerHypeOrPushTap(
  state: FlightSimulationState,
  metrics: ComputedCraftMetrics
): { event: 'hype_tap' | 'push_boost' | 'trolley_perfect' | 'trolley_early' | 'none' } {
  if (state.phase === 'skit') {
    state.hypeMeter = Math.min(100, state.hypeMeter + 16);
    return { event: 'hype_tap' };
  }

  if (state.phase === 'ramp_push') {
    // Check if inside the green Trolley Drop zone (-22 ft to 0 ft)
    if (state.xFeet >= -22 && !state.trolleyDetached) {
      state.trolleyDetached = true;
      state.trolleyReleaseQuality = state.xFeet >= -13 ? 'perfect' : 'good';
      // Clean trolley release sheds weight and gives launch pop!
      state.vxFeet += state.trolleyReleaseQuality === 'perfect' ? 5.2 : 2.6;
      state.pitchDeg = Math.max(state.pitchDeg, 5.5);
      return { event: 'trolley_perfect' };
    }

    // Tapping boosts the crew's sprint push speed (active mashing matters!)
    // Overweight (> 400 lbs) adds extra ramp inertia so heavy builds take more effort to accelerate
    const overWeightExcess = Math.max(0, metrics.rampTotalMassLbs - 400);
    const overWeightInertia = 1 / (1 + overWeightExcess * 0.0045);
    const weightFactor = (255 / Math.max(185, metrics.rampTotalMassLbs)) * overWeightInertia;
    const impulseFtPerSec = 3.8 * weightFactor * metrics.pushEfficiency;
    const maxPushSpeedFtS = 40 * metrics.pushEfficiency * Math.sqrt(weightFactor);
    state.vxFeet = Math.min(maxPushSpeedFtS, state.vxFeet + impulseFtPerSec);
    state.pushMeter = Math.min(100, Math.round((state.vxFeet / 37) * 100));
    return { event: 'push_boost' };
  }

  return { event: 'none' };
}

/**
 * Advances the Red Bull Flugtag physics simulation by dt seconds.
 */
export function stepFlightSimulation(
  state: FlightSimulationState,
  metrics: ComputedCraftMetrics,
  dt: number,
  bestDistanceFeet: number
): {
  justLaunchedOffRamp: boolean;
  justSplashedDown: boolean;
  justCollectedThermal: boolean;
} {
  const clampedDt = Math.min(dt, 0.05);
  state.phaseTime += clampedDt;

  STEP_RESULT.justLaunchedOffRamp = false;
  STEP_RESULT.justSplashedDown = false;
  STEP_RESULT.justCollectedThermal = false;

  // 1. SKIT PHASE (On the staging deck)
  if (state.phase === 'skit') {
    state.hypeMeter = Math.max(20, state.hypeMeter - clampedDt * 4.0);
    if (state.phaseTime >= 4.2 || state.hypeMeter >= 99) {
      state.phase = 'ramp_push';
      state.phaseTime = 0;
      const overWeightExcess = Math.max(0, metrics.rampTotalMassLbs - 400);
      const overWeightInertia = 1 / (1 + overWeightExcess * 0.0035);
      state.vxFeet = 10.5 * metrics.pushEfficiency * overWeightInertia;
    }
    return STEP_RESULT;
  }

  // 2. RAMP PUSH PHASE (90-ft runway at 30-ft height)
  if (state.phase === 'ramp_push') {
    // Modest base crew jog so active PUSH tapping is rewarded with much higher takeoff speed!
    // Exceeding the 400 lb competition rule adds ramp inertia and rolling resistance
    const overWeightExcess = Math.max(0, metrics.rampTotalMassLbs - 400);
    const overWeightInertia = 1 / (1 + overWeightExcess * 0.0045);
    const massRatio = (255 / Math.max(190, metrics.rampTotalMassLbs)) * overWeightInertia;
    const baseCrewAccel = 4.8 * massRatio * metrics.pushEfficiency;
    const overWeightRollingPenalty = metrics.isOverWeightLimit ? 0.65 + overWeightExcess * 0.014 : 0;
    const rollingDrag = 0.0055 * state.vxFeet * state.vxFeet + overWeightRollingPenalty;

    state.vxFeet = Math.min(41, Math.max(8.5, state.vxFeet + (baseCrewAccel - rollingDrag) * clampedDt));
    state.xFeet += state.vxFeet * clampedDt;
    state.pushMeter = Math.min(100, Math.round((state.vxFeet / 37) * 100));

    // Green Trolley Drop Zone is the last 22 feet of the ramp (-22 ft to 0 ft)
    state.inTrolleyDropZone = state.xFeet >= -22 && state.xFeet <= 0 && !state.trolleyDetached;

    const staticPreviewTilt = Math.max(-4, Math.min(5, metrics.seesawTiltDeg * 0.16));
    state.pitchDeg = staticPreviewTilt + Math.sin(state.xFeet * 0.55) * 0.55;

    if (!state.trolleyDetached) {
      state.trolleyXFeet = state.xFeet;
      state.trolleyYFeet = state.yFeet;
      state.trolleyVxFeet = state.vxFeet;
      state.trolleyPitchDeg = 0;
    } else {
      // Trolley brakes safely at the edge of the ramp once detached!
      state.trolleyVxFeet = Math.max(0, state.trolleyVxFeet - 42 * clampedDt);
      state.trolleyXFeet = Math.min(-1.2, state.trolleyXFeet + state.trolleyVxFeet * clampedDt);
      state.trolleyPitchDeg = 0;
    }

    // Reached the edge of the 30-foot flight deck! (xFeet >= 0)
    if (state.xFeet >= 0) {
      state.phase = 'airborne';
      state.phaseTime = 0;
      STEP_RESULT.justLaunchedOffRamp = true;

      if (!state.trolleyDetached) {
        // Player missed the trolley drop window!
        // Heavy trolley drags speed down (-24%) and tips the nose downward!
        state.trolleyReleaseQuality = 'late';
        state.trolleyDetached = true;
        state.vxFeet *= 0.76;
        state.vyFeet = -3.6;
        state.pitchVelDeg -= 22;
        state.trolleyVxFeet = state.vxFeet * 0.65;
        state.trolleyVyFeet = -5;
      } else {
        // Clean separation off the lip!
        state.vyFeet = state.trolleyReleaseQuality === 'perfect' ? 2.8 : 1.4;
        state.pitchDeg = Math.max(-5, Math.min(10, 5.5 + metrics.seesawTiltDeg * 0.22));
      }
    }

    return STEP_RESULT;
  }

  // 3. AIRBORNE GLIDE PHASE (Sub-stepped at >=120Hz for frame-rate independence)
  if (state.phase === 'airborne') {
    let remainingDt = clampedDt;

    const stallAngle = 14.5;
    const arFactor = metrics.effectiveAspectRatio / (metrics.effectiveAspectRatio + 2.0);
    const liftSlope = 2 * Math.PI * arFactor * metrics.effectiveLiftMultiplier;
    const peakCl = liftSlope * ((stallAngle * Math.PI) / 180);
    const oswaldEfficiency = 0.8;
    const inducedDragFactor = 1 / (Math.PI * oswaldEfficiency * metrics.effectiveAspectRatio);
    const effectiveArea = metrics.totalWingAreaM2 * 1.24;
    const massKg = metrics.airborneMassKg;
    const balanceOffset = 0.17 - metrics.staticMargin;
    const staticPitchTorque = balanceOffset * 82;
    const weathervaneGain = 2.4 + metrics.pitchStability * 3.5;

    while (remainingDt > 1e-6 && state.phase === 'airborne') {
      const subDt = Math.min(remainingDt, MAX_AIRBORNE_SUBSTEP);
      remainingDt -= subDt;

      // Animate detached trolley if it fell off the edge (late release)
      if (state.trolleyReleaseQuality === 'late') {
        if (state.trolleyYFeet > 0.2) {
          state.trolleyVyFeet -= GRAVITY_MPS2 * FEET_PER_METER * subDt;
          state.trolleyXFeet += state.trolleyVxFeet * subDt;
          state.trolleyYFeet = Math.max(0.2, state.trolleyYFeet + state.trolleyVyFeet * subDt);
          state.trolleyPitchDeg = Math.max(-35, state.trolleyPitchDeg - 45 * subDt);
        } else {
          // Trolley floats calmly on the water instead of spinning underground!
          state.trolleyYFeet = 0.2;
          state.trolleyVxFeet *= Math.pow(0.2, subDt);
          state.trolleyXFeet += state.trolleyVxFeet * subDt;
          state.trolleyPitchDeg *= Math.pow(0.2, subDt);
        }
      }

      const vxMps = state.vxFeet * METERS_PER_FOOT;
      const vyMps = state.vyFeet * METERS_PER_FOOT;

      // Dynamic Bay Wind Gusts that make mid-air pitch control engaging!
      let windVxMps = -0.45;
      let windVyMps = 0.12;
      let gustPitchTorque = 0;

      if (state.xFeet > 75 && state.xFeet < 125) {
        // Sea-breeze updraft gust that tries to pitch the nose up into a stall if you don't lean forward!
        windVxMps = -1.3;
        windVyMps = 0.45;
        gustPitchTorque = 18;
        state.windGustWarning = 'headwind_gust';
      } else if (state.xFeet > 155 && state.xFeet < 200) {
        // Coastal downdraft pocket that requires pulling Nose Up to stretch the glide!
        windVyMps = -0.55;
        gustPitchTorque = -15;
        state.windGustWarning = 'downdraft';
      } else {
        state.windGustWarning = 'calm';
      }

      const relVx = vxMps - windVxMps;
      const relVy = vyMps - windVyMps;
      const airspeedSq = relVx * relVx + relVy * relVy;

      const flightPathDeg = (Math.atan2(relVy, Math.max(0.5, relVx)) * 180) / Math.PI;

      // Angle of Attack (alpha) = pitchDeg - flightPathDeg + wing incidence (+3.0 deg)
      const aoaDeg = state.pitchDeg - flightPathDeg + 3.0;
      state.aoaDeg = aoaDeg;

      // Airfoil Lift Curve with realistic stall above 14.5 degrees
      const aoaRad = (aoaDeg * Math.PI) / 180;

      let cl = 0;
      let stallDragPenalty = 0;

      if (Math.abs(aoaDeg) <= stallAngle) {
        cl = liftSlope * aoaRad;
        state.isStalling = false;
      } else {
        state.isStalling = aoaDeg > stallAngle;
        const sign = Math.sign(aoaDeg);
        const excessDeg = Math.min(35, Math.abs(aoaDeg) - stallAngle);
        cl = sign * Math.max(0.1, peakCl * (1 - excessDeg / 22));
        stallDragPenalty = 0.025 * excessDeg;
      }

      // Determine Pitch Balance Zone & Apply Smooth High/Low Pitch Penalties
      if (state.pitchDeg > 12.5 || state.isStalling) {
        state.pitchZone = 'too_high';
        state.inSweetSpot = false;
      } else if (state.pitchDeg < -5.5) {
        state.pitchZone = 'too_low';
        state.inSweetSpot = false;
      } else {
        state.pitchZone = 'sweet_spot';
        state.inSweetSpot = true;
      }

      // Induced Drag + Parasitic Drag
      const inducedDrag = cl * cl * inducedDragFactor;
      const cd = Math.max(0.036, metrics.baseDragCoeff + inducedDrag * 0.68 + stallDragPenalty);

      // Dynamic pressure & tuned lifting surface scale
      const dynamicPressure = 0.5 * AIR_DENSITY_RHO * airspeedSq;

      const liftForceN = dynamicPressure * effectiveArea * cl;
      const dragForceN = dynamicPressure * effectiveArea * cd;

      const gammaRad = (flightPathDeg * Math.PI) / 180;
      const cosG = Math.cos(gammaRad);
      const sinG = Math.sin(gammaRad);

      const fxAeroN = -dragForceN * cosG - liftForceN * sinG;
      const fyAeroN = -dragForceN * sinG + liftForceN * cosG;

      const axMps2 = fxAeroN / massKg;
      const ayMps2 = fyAeroN / massKg - GRAVITY_MPS2 * 0.88;

      state.vxFeet = Math.max(5, state.vxFeet + axMps2 * FEET_PER_METER * subDt);
      state.vyFeet = Math.max(-52, state.vyFeet + ayMps2 * FEET_PER_METER * subDt);

      // Smooth Pitch Balance Penalties / Sweet-Spot Reward (no boundary step discontinuities)
      if (state.pitchZone === 'too_high') {
        const excessHigh = Math.max(0.5, state.pitchDeg - 12.0);
        state.vxFeet = Math.max(5, state.vxFeet - excessHigh * 0.68 * subDt);
        state.vyFeet -= excessHigh * 1.18 * subDt;
      } else if (state.pitchZone === 'too_low') {
        const excessLow = Math.max(0.5, -5.5 - state.pitchDeg);
        state.vyFeet -= excessLow * 1.35 * subDt;
        state.vxFeet = Math.max(5, state.vxFeet - excessLow * 0.42 * subDt);
      } else {
        // Sweet Spot Balance Bonus: smooth laminar glide!
        state.vyFeet += 1.65 * subDt;
      }

      // Pitch Torque Dynamics:
      const trimTargetPitch = flightPathDeg + 4.8 + balanceOffset * 30;
      const weathervaneTorque = (trimTargetPitch - state.pitchDeg) * weathervaneGain;
      const stallRecoveryTorque = state.isStalling
        ? -Math.min(48, Math.max(8, (aoaDeg - stallAngle) * 14))
        : 0;
      const pilotTorque = state.pilotPitchInput * 86;

      const totalPitchAccel =
        staticPitchTorque +
        weathervaneTorque +
        stallRecoveryTorque +
        gustPitchTorque +
        pilotTorque -
        state.pitchVelDeg * 3.5;

      state.pitchVelDeg += totalPitchAccel * subDt;
      state.pitchDeg = Math.max(-65, Math.min(55, state.pitchDeg + state.pitchVelDeg * subDt));

      const prevX = state.xFeet;
      const prevY = state.yFeet;
      state.xFeet += state.vxFeet * subDt;
      state.yFeet += state.vyFeet * subDt;
      state.distanceFeet = Math.max(0, Math.round(state.xFeet));

      // Check Thermal Wind Rings over the water
      for (const ring of state.thermalRings) {
        if (!ring.collected) {
          const dx = state.xFeet - ring.xFeet;
          const dy = state.yFeet - ring.yFeet;
          if (dx * dx + dy * dy <= ring.radiusFeet * ring.radiusFeet) {
            ring.collected = true;
            state.thermalsCollected += 1;
            STEP_RESULT.justCollectedThermal = true;
            state.vyFeet = Math.max(state.vyFeet + 10.5, 7.2);
            state.vxFeet += 5.5;
          }
        }
      }

      // Check Water Impact (Splashdown at yFeet <= 0)
      if (state.yFeet <= 0) {
        // Interpolate exact horizontal crossing at y = 0
        const dyStep = prevY - state.yFeet;
        const frac = dyStep > 1e-5 ? Math.max(0, Math.min(1, prevY / dyStep)) : 1;
        const exactXFeet = prevX + (state.xFeet - prevX) * frac;

        state.xFeet = exactXFeet;
        state.yFeet = 0.15;
        state.phase = 'splashdown';
        state.phaseTime = 0;
        STEP_RESULT.justSplashedDown = true;
        state.impactXFeet = exactXFeet;
        state.distanceFeet = Math.max(5, Math.round(exactXFeet));

        const impactSpeed = Math.sqrt(state.vxFeet * state.vxFeet + state.vyFeet * state.vyFeet);
        const overWeightBonus = metrics.isOverWeightLimit ? 14 : 0;
        state.splashIntensity = Math.min(
          100,
          Math.round((impactSpeed / 44) * 65 + (metrics.airborneMassLbs / 380) * 45 + overWeightBonus)
        );

        // Smoothly level pitch velocity on water entry so hull doesn't glitch
        state.pitchVelDeg = 0;

        // Break apart parts cleanly into world-aligned floating debris on hard impact
        // Overweight (> 400 lb) builds guarantee a spectacular yard-sale breakup!
        const breakThreshold = metrics.structuralToughness * 32;
        const impactSeverity =
          Math.abs(state.vyFeet) +
          (metrics.airborneMassLbs - 200) * 0.08 +
          (metrics.isOverWeightLimit ? 25 : 0);

        const brokenParts: Array<'wings' | 'tail' | 'nose' | 'topper'> = [];
        if (impactSeverity > breakThreshold * 0.62 || metrics.isOverWeightLimit) {
          brokenParts.push('wings');
          if (metrics.parts.topper.id !== 'topper_none') brokenParts.push('topper');
        }
        if (impactSeverity > breakThreshold * 0.82 || metrics.isOverWeightLimit) {
          if (metrics.parts.tail.id !== 'tail_none') brokenParts.push('tail');
          brokenParts.push('nose');
        }

        state.debris = brokenParts.map((partKey, idx) => {
          const spreadZ = (idx % 2 === 0 ? 1 : -1) * (4.5 + idx * 1.8);
          const spreadX = (idx - 1.5) * 4.0;
          return {
            partKey,
            offsetXFeet: spreadX * 0.3,
            yFeet: 0.6 + idx * 0.3,
            zFeet: spreadZ * 0.3,
            vx: spreadX * 1.8,
            vy: 7.5 + idx * 1.5,
            vz: spreadZ * 2.2,
            rotX: (idx % 2 === 0 ? 1 : -1) * 0.25,
            rotY: idx * 0.5,
            rotZ: (idx % 2 === 0 ? -1 : 1) * 0.2,
          };
        });

        state.judgeScores = calculateJudgeScores(state, metrics, bestDistanceFeet);
      }
    }

    return STEP_RESULT;
  }

  // 4. SPLASHDOWN & BUOYANCY PHASE (Smooth floating & gentle wave bobbing!)
  if (state.phase === 'splashdown') {
    // Hull skims smoothly to a stop and bobs gently above the water plane (never negative!)
    state.vxFeet *= Math.pow(0.12, clampedDt);
    state.xFeet += state.vxFeet * clampedDt;
    state.yFeet = 0.18 + Math.sin(state.phaseTime * 3.2) * 0.16;
    // Frame-rate-independent pitch decay toward gentle wave bobbing on the water surface
    const pitchDecay = Math.pow(0.05, clampedDt);
    const targetBobPitch = Math.cos(state.phaseTime * 2.6) * 2.5;
    state.pitchDeg = state.pitchDeg * pitchDecay + targetBobPitch * (1 - pitchDecay);

    // Update floating debris pieces smoothly in world water space
    for (const d of state.debris) {
      d.offsetXFeet += d.vx * clampedDt;
      d.zFeet += d.vz * clampedDt;
      d.vx *= Math.pow(0.18, clampedDt);
      d.vz *= Math.pow(0.18, clampedDt);

      if (d.yFeet > 0.25 || d.vy > 0) {
        d.vy -= 24 * clampedDt;
        d.yFeet = Math.max(0.22, d.yFeet + d.vy * clampedDt);
      } else {
        d.yFeet = 0.22 + Math.sin(state.phaseTime * 3.5 + d.zFeet) * 0.14;
      }
      // Gentle settle toward flat floating orientation
      d.rotX *= Math.pow(0.4, clampedDt);
      d.rotZ *= Math.pow(0.4, clampedDt);
      d.rotY += 0.25 * clampedDt;
    }
  }

  return STEP_RESULT;
}

function calculateJudgeScores(
  state: FlightSimulationState,
  metrics: ComputedCraftMetrics,
  previousBestFeet: number
): JudgeScores {
  // 1. Distance Judge (1-10): Slightly more challenging curve (235 ft for 10/10)
  const distNorm = Math.min(1, state.distanceFeet / 235);
  const distanceJudge = Math.max(3, Math.min(10, Math.round(3 + distNorm * 7)));

  // 2. Creativity Judge (1-10): Rewards creative builds + cannonball splashes (+1 for Heavyweight >400lb Cannonballs)
  const splashBonus = state.splashIntensity > 74 ? 2 : state.splashIntensity > 52 ? 1 : 0;
  const heavyBonus = metrics.isOverWeightLimit ? 1 : 0;
  const creativityJudge = Math.max(
    4,
    Math.min(10, Math.round(3 + (metrics.creativityScore / 100) * 6 + splashBonus + heavyBonus))
  );

  // 3. Showmanship Judge (1-10): Rewards Hype Skit, Trolley Release Timing, and Thermal Rings!
  const releaseBonus =
    state.trolleyReleaseQuality === 'perfect' ? 2.5 : state.trolleyReleaseQuality === 'good' ? 1.5 : 0.0;
  const thermalBonus = state.thermalsCollected * 1.2;
  const showmanshipJudge = Math.max(
    4,
    Math.min(10, Math.round(3.0 + (state.hypeMeter / 100) * 3.5 + releaseBonus + thermalBonus))
  );

  const totalScore = distanceJudge + creativityJudge + showmanshipJudge;
  const starsEarned = totalScore >= 26 ? 3 : totalScore >= 20 ? 2 : 1;

  const splashRating =
    state.splashIntensity >= 72
      ? 'MEGA CANNONBALL!!'
      : state.splashIntensity >= 46
      ? 'Big Splash!'
      : 'Smooth Skim!';

  return {
    distanceJudge,
    creativityJudge,
    showmanshipJudge,
    totalScore,
    starsEarned,
    splashRating,
    isOverWeightCannonball: metrics.isOverWeightLimit,
    newRecord: state.distanceFeet > previousBestFeet,
    beatWorldRecord: state.distanceFeet >= WORLD_RECORD_FEET,
  };
}
