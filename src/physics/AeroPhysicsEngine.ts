import { ComputedCraftMetrics } from './CraftMetrics';
import {
  COMPETITIONS,
  CompetitionId,
  RAMP_HEIGHT_FEET,
  RAMP_LENGTH_FEET,
} from '../builder/PartCatalog';

export type FlightPhase = 'skit' | 'ramp_push' | 'airborne' | 'splashdown';
export type TrolleyReleaseQuality = 'pending' | 'early' | 'perfect' | 'good' | 'late';

export interface ThermalRing {
  id: number;
  xFeet: number;
  yFeet: number;
  zFeet?: number;
  radiusFeet: number;
  collected: boolean;
}

export interface SoapboxObstacle {
  id: number;
  type: 'hay_bale' | 'kicker_ramp';
  xFeet: number;
  zFeet: number;
  halfWidthFeet: number;
  triggered: boolean;
}

export interface DetachedDebris {
  partKey: 'wings' | 'tail' | 'nose' | 'topper';
  /** World X offset in feet from impact point */
  offsetXFeet: number;
  /** Height in feet above water/ground surface (>= 0) */
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
  splashRating: string;
  isOverWeightCannonball: boolean;
  newRecord: boolean;
  beatWorldRecord: boolean;
}

export interface FlightSimulationState {
  competition: CompetitionId;
  phase: FlightPhase;
  phaseTime: number;
  /** Craft horizontal position in feet relative to the ramp edge (-90 ft to +450 ft) */
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
  /** Whether the wings are currently stalling (or coaster tipping into danger!) */
  isStalling: boolean;
  /** Whether the craft is in the sweet-spot glide AoA / rail balance zone */
  inSweetSpot: boolean;
  /** Live pitch/balance zone for the HUD & physics penalty */
  pitchZone: 'too_high' | 'sweet_spot' | 'too_low';
  /** Active wind gust / course hazard indicator */
  windGustWarning: 'calm' | 'headwind_gust' | 'downdraft';
  /** Pre-launch crew dance hype meter (0 to 100) */
  hypeMeter: number;
  /** Ramp push speed percentage (0 to 100) */
  pushMeter: number;
  /** Whether the craft is inside the green Trolley Drop / Push-Off zone (-22 ft to 0 ft) */
  inTrolleyDropZone: boolean;
  trolleyDetached: boolean;
  trolleyReleaseQuality: TrolleyReleaseQuality;
  /** Independent trolley position after separation */
  trolleyXFeet: number;
  trolleyYFeet: number;
  trolleyVxFeet: number;
  trolleyVyFeet: number;
  trolleyPitchDeg: number;
  /** Pilot control input (-1 = nose down / steer left / lean left, +1 = nose up / steer right / lean right) */
  pilotPitchInput: number;
  /** Floating thermal rings / speed gates / hanging canal bells */
  thermalRings: ThermalRing[];
  thermalsCollected: number;
  /** Exact X position where craft first touched water / finished */
  impactXFeet: number;
  /** Broken-off floating parts on hard impact */
  debris: DetachedDebris[];
  /** Final / current flight or course distance in feet */
  distanceFeet: number;
  splashIntensity: number;
  judgeScores: JudgeScores | null;
  /** Lateral Z position in feet (for Soapbox steering [-12..+12] & Rollercoaster derail offset) */
  lateralZFeet: number;
  lateralVzFeet: number;
  /** Roll / Lean angle in degrees (for Tandem Rollercoaster rail balance [-45..+45] & Soapbox body roll) */
  leanDeg: number;
  leanVelDeg: number;
  /** Target rail balance angle on the Tandem Rollercoaster */
  trackTargetLeanDeg: number;
  /** Current track slope in degrees */
  trackSlopeDeg: number;
  /** Number of hay-bale obstacles clipped in Soapbox Race */
  obstaclesHit: number;
  /** Whether the craft reached the finish line / Grand Bell */
  completedCourse: boolean;
  /** Active course run time in seconds */
  courseTimeSeconds: number;
  /** Soapbox downhill obstacles (hay bales & kicker ramps) */
  soapboxObstacles: SoapboxObstacle[];
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

/**
 * Shared mathematical road profile for the 450-ft Red Bull Soapbox downhill course.
 */
export function getSoapboxTrackElevationFeet(xFeet: number): {
  yFeet: number;
  slopeDeg: number;
} {
  if (xFeet <= 0) {
    return { yFeet: RAMP_HEIGHT_FEET, slopeDeg: 0 };
  }
  const clampedX = Math.min(480, Math.max(0, xFeet));
  // Smooth downhill descent from 30 ft at x=0 down to 1.5 ft at x=450 ft with rolling terraces
  const baseDrop = RAMP_HEIGHT_FEET - (clampedX / 450) * 28.2;
  const wave = Math.sin(clampedX * 0.042) * 1.65 + Math.cos(clampedX * 0.019) * 0.9;
  const yFeet = Math.max(1.2, baseDrop + wave - 0.9);
  const dyDx =
    -28.2 / 450 +
    0.042 * 1.65 * Math.cos(clampedX * 0.042) -
    0.019 * 0.9 * Math.sin(clampedX * 0.019);
  const slopeDeg = (Math.atan(dyDx) * 180) / Math.PI;
  return { yFeet, slopeDeg };
}

/**
 * Shared mathematical rail profile for the 320-ft Red Bull Tandem Rollercoaster over water.
 */
export function getRollercoasterTrackProfile(xFeet: number): {
  yFeet: number;
  slopeDeg: number;
  targetLeanDeg: number;
} {
  if (xFeet <= 0) {
    return { yFeet: RAMP_HEIGHT_FEET, slopeDeg: 0, targetLeanDeg: 0 };
  }
  const x = Math.min(340, Math.max(0, xFeet));
  // Camelback hills over the canal: starts at 30 ft, drops into valley, climbs 3 camelback humps, finishes at 14 ft
  const baseLine = 30 - (x / 320) * 15.5;
  const camelbacks =
    -Math.sin((x / 320) * Math.PI * 3.5) * 6.2 +
    Math.sin((x / 320) * Math.PI * 7.0) * 2.1;
  const yFeet = Math.max(4.5, baseLine + camelbacks);

  const dBase = -15.5 / 320;
  const dCamel =
    -(Math.PI * 3.5 / 320) * 6.2 * Math.cos((x / 320) * Math.PI * 3.5) +
    (Math.PI * 7.0 / 320) * 2.1 * Math.cos((x / 320) * Math.PI * 7.0);
  const slopeDeg = (Math.atan(dBase + dCamel) * 180) / Math.PI;

  // Banking & seesaw tilt challenge along the narrow rail (smoothly ramped in over the first 20 ft)
  const rampIn = Math.min(1, x / 20);
  const targetLeanDeg =
    rampIn * (Math.sin(x * 0.055) * 12 + Math.sin(x * 0.095) * 7);

  return { yFeet, slopeDeg, targetLeanDeg };
}

export function createInitialFlightState(
  competition: CompetitionId = 'flugtag'
): FlightSimulationState {
  const thermalRings: ThermalRing[] =
    competition === 'soapbox'
      ? [
          {
            id: 1,
            xFeet: 95,
            yFeet: getSoapboxTrackElevationFeet(95).yFeet + 4.5,
            zFeet: -4.5,
            radiusFeet: 7.5,
            collected: false,
          },
          {
            id: 2,
            xFeet: 225,
            yFeet: getSoapboxTrackElevationFeet(225).yFeet + 4.5,
            zFeet: 4.5,
            radiusFeet: 7.5,
            collected: false,
          },
          {
            id: 3,
            xFeet: 355,
            yFeet: getSoapboxTrackElevationFeet(355).yFeet + 4.5,
            zFeet: -3.5,
            radiusFeet: 7.5,
            collected: false,
          },
        ]
      : competition === 'rollercoaster'
      ? [
          { id: 1, xFeet: 85, yFeet: getRollercoasterTrackProfile(85).yFeet + 6.5, radiusFeet: 9.5, collected: false },
          { id: 2, xFeet: 185, yFeet: getRollercoasterTrackProfile(185).yFeet + 6.5, radiusFeet: 9.5, collected: false },
          { id: 3, xFeet: 275, yFeet: getRollercoasterTrackProfile(275).yFeet + 6.5, radiusFeet: 9.5, collected: false },
        ]
      : [
          { id: 1, xFeet: 58, yFeet: 21, radiusFeet: 10.5, collected: false },
          { id: 2, xFeet: 132, yFeet: 17, radiusFeet: 11, collected: false },
          { id: 3, xFeet: 208, yFeet: 14, radiusFeet: 11.5, collected: false },
        ];

  const soapboxObstacles: SoapboxObstacle[] =
    competition === 'soapbox'
      ? [
          { id: 1, type: 'hay_bale', xFeet: 65, zFeet: 4.8, halfWidthFeet: 4.2, triggered: false },
          { id: 2, type: 'kicker_ramp', xFeet: 128, zFeet: 0.0, halfWidthFeet: 6.5, triggered: false },
          { id: 3, type: 'hay_bale', xFeet: 178, zFeet: -5.0, halfWidthFeet: 4.4, triggered: false },
          { id: 4, type: 'hay_bale', xFeet: 255, zFeet: 4.5, halfWidthFeet: 4.4, triggered: false },
          { id: 5, type: 'kicker_ramp', xFeet: 305, zFeet: 0.0, halfWidthFeet: 6.5, triggered: false },
          { id: 6, type: 'hay_bale', xFeet: 388, zFeet: -4.2, halfWidthFeet: 4.4, triggered: false },
        ]
      : [];

  return {
    competition,
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
    thermalRings,
    thermalsCollected: 0,
    impactXFeet: 0,
    debris: [],
    distanceFeet: 0,
    splashIntensity: 0,
    judgeScores: null,
    lateralZFeet: 0,
    lateralVzFeet: 0,
    leanDeg: 0,
    leanVelDeg: 0,
    trackTargetLeanDeg: 0,
    trackSlopeDeg: 0,
    obstaclesHit: 0,
    completedCourse: false,
    courseTimeSeconds: 0,
    soapboxObstacles,
  };
}

/**
 * Triggers a burst of Crew Hype during Skit, Sprint Push on the Ramp, or Mid-Run Boost/Pedal!
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
    // Check if inside the green Trolley Drop / Push-Off zone (-22 ft to 0 ft)
    if (state.xFeet >= -22 && !state.trolleyDetached) {
      state.trolleyDetached = true;
      state.trolleyReleaseQuality = state.xFeet >= -13 ? 'perfect' : 'good';
      state.vxFeet += state.trolleyReleaseQuality === 'perfect' ? 5.2 : 2.6;
      if (state.competition === 'flugtag') {
        state.pitchDeg = Math.max(state.pitchDeg, 5.5);
      }
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

  // Mid-run action tap for Soapbox (Gravity Tuck Boost) & Tandem Rollercoaster (Pedal Sprint!)
  if (state.phase === 'airborne') {
    if (state.competition === 'rollercoaster') {
      const overWeightExcess = Math.max(0, metrics.rampTotalMassLbs - 400);
      const overWeightInertia = 1 / (1 + overWeightExcess * 0.0035);
      const pedalBoost = 3.2 * metrics.effectiveLiftMultiplier * overWeightInertia;
      state.vxFeet = Math.min(44, state.vxFeet + pedalBoost);
      // Pedaling rhythmically also helps steady moderate wobble
      state.leanVelDeg *= 0.82;
      return { event: 'push_boost' };
    }
    if (state.competition === 'soapbox') {
      state.vxFeet = Math.min(54, state.vxFeet + 2.4 * metrics.pushEfficiency);
      return { event: 'push_boost' };
    }
  }

  return { event: 'none' };
}

/**
 * Advances the active Red Bull competition physics simulation by dt seconds.
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

    // Reached the edge of the 30-foot start ramp! (xFeet >= 0)
    if (state.xFeet >= 0) {
      state.phase = 'airborne';
      state.phaseTime = 0;
      STEP_RESULT.justLaunchedOffRamp = true;

      if (state.competition === 'flugtag') {
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
          // Clean glider separation off the lip!
          state.vyFeet = state.trolleyReleaseQuality === 'perfect' ? 2.8 : 1.4;
          state.pitchDeg = Math.max(-5, Math.min(10, 5.5 + metrics.seesawTiltDeg * 0.22));
        }
      } else {
        // Soapbox & Tandem Rollercoaster stay planted on their wheels entering the course
        if (!state.trolleyDetached) {
          state.trolleyReleaseQuality = 'late';
          state.trolleyDetached = true;
          state.vxFeet *= 0.88;
        }
        state.vyFeet = 0;
        state.pitchVelDeg = 0;
        state.pitchDeg =
          state.competition === 'soapbox'
            ? getSoapboxTrackElevationFeet(0.1).slopeDeg
            : getRollercoasterTrackProfile(0.1).slopeDeg;
      }
    }

    return STEP_RESULT;
  }

  // 3. AIRBORNE / ACTIVE COURSE PHASE (Sub-stepped at >=120Hz for frame-rate independence)
  if (state.phase === 'airborne') {
    state.courseTimeSeconds += clampedDt;

    if (state.competition === 'soapbox') {
      return stepSoapboxCourse(state, metrics, clampedDt, bestDistanceFeet);
    }
    if (state.competition === 'rollercoaster') {
      return stepRollercoasterCourse(state, metrics, clampedDt, bestDistanceFeet);
    }

    let remainingDt = clampedDt;

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
      const arFactor = metrics.effectiveAspectRatio / (metrics.effectiveAspectRatio + 2.0);
      const liftSlope = 2 * Math.PI * arFactor * metrics.effectiveLiftMultiplier;

      let cl = 0;
      let stallDragPenalty = 0;
      const stallAngle = 14.5;

      if (Math.abs(aoaDeg) <= stallAngle) {
        cl = liftSlope * aoaRad;
        state.isStalling = false;
      } else {
        state.isStalling = aoaDeg > stallAngle;
        const sign = Math.sign(aoaDeg);
        const excessDeg = Math.min(35, Math.abs(aoaDeg) - stallAngle);
        const peakCl = liftSlope * ((stallAngle * Math.PI) / 180);
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
      const oswaldEfficiency = 0.8;
      const inducedDrag = (cl * cl) / (Math.PI * oswaldEfficiency * metrics.effectiveAspectRatio);
      const cd = Math.max(0.036, metrics.baseDragCoeff + inducedDrag * 0.68 + stallDragPenalty);

      // Dynamic pressure & tuned lifting surface scale
      const dynamicPressure = 0.5 * AIR_DENSITY_RHO * airspeedSq;
      const effectiveArea = metrics.totalWingAreaM2 * 1.24;

      const liftForceN = dynamicPressure * effectiveArea * cl;
      const dragForceN = dynamicPressure * effectiveArea * cd;

      const gammaRad = (flightPathDeg * Math.PI) / 180;
      const cosG = Math.cos(gammaRad);
      const sinG = Math.sin(gammaRad);

      const fxAeroN = -dragForceN * cosG - liftForceN * sinG;
      const fyAeroN = -dragForceN * sinG + liftForceN * cosG;

      const massKg = metrics.airborneMassKg;
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
      const balanceOffset = 0.17 - metrics.staticMargin;
      const staticPitchTorque = balanceOffset * 82;
      const trimTargetPitch = flightPathDeg + 4.8 + balanceOffset * 30;
      const weathervaneTorque = (trimTargetPitch - state.pitchDeg) * (2.4 + metrics.pitchStability * 3.5);
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

        state.pitchVelDeg = 0;
        spawnImpactDebris(state, metrics, Math.abs(state.vyFeet));
        state.judgeScores = calculateJudgeScores(state, metrics, bestDistanceFeet);
      }
    }

    return STEP_RESULT;
  }

  // 4. SPLASHDOWN / FINISH LINE PHASE
  if (state.phase === 'splashdown') {
    state.vxFeet *= Math.pow(0.12, clampedDt);
    state.xFeet += state.vxFeet * clampedDt;

    if (state.competition === 'soapbox') {
      const road = getSoapboxTrackElevationFeet(state.xFeet);
      state.yFeet = road.yFeet;
      state.pitchDeg = road.slopeDeg;
      state.leanDeg *= Math.pow(0.08, clampedDt);
    } else if (state.competition === 'rollercoaster' && state.completedCourse) {
      const prof = getRollercoasterTrackProfile(state.xFeet);
      state.yFeet = prof.yFeet;
      state.pitchDeg = prof.slopeDeg;
      state.leanDeg *= Math.pow(0.1, clampedDt);
    } else {
      state.yFeet = 0.18 + Math.sin(state.phaseTime * 3.2) * 0.16;
      state.pitchDeg =
        state.pitchDeg * Math.pow(0.05, clampedDt) + Math.cos(state.phaseTime * 2.6) * 2.5 * 0.1;
      state.leanDeg *= Math.pow(0.15, clampedDt);
    }

    const isDryFinish =
      state.competition === 'soapbox' ||
      (state.competition === 'rollercoaster' && state.completedCourse);

    for (const d of state.debris) {
      d.offsetXFeet += d.vx * clampedDt;
      d.zFeet += d.vz * clampedDt;
      d.vx *= Math.pow(0.18, clampedDt);
      d.vz *= Math.pow(0.18, clampedDt);

      const floorY =
        state.competition === 'soapbox'
          ? getSoapboxTrackElevationFeet(state.impactXFeet + d.offsetXFeet).yFeet + 0.2
          : state.competition === 'rollercoaster' && state.completedCourse
          ? getRollercoasterTrackProfile(state.impactXFeet + d.offsetXFeet).yFeet + 0.2
          : 0.22;
      if (d.yFeet > floorY + 0.05 || d.vy > 0) {
        d.vy -= 24 * clampedDt;
        d.yFeet = Math.max(floorY, d.yFeet + d.vy * clampedDt);
      } else {
        d.yFeet =
          floorY + (isDryFinish ? 0 : Math.sin(state.phaseTime * 3.5 + d.zFeet) * 0.14);
      }
      d.rotX *= Math.pow(0.4, clampedDt);
      d.rotZ *= Math.pow(0.4, clampedDt);
      d.rotY += 0.25 * clampedDt;
    }
  }

  return STEP_RESULT;
}

/**
 * Red Bull Soapbox Race downhill physics (0 -> 450 ft).
 * Player steers Left/Right (pilotPitchInput) around hay bales, hits kicker ramps, and collects speed gates!
 */
function stepSoapboxCourse(
  state: FlightSimulationState,
  metrics: ComputedCraftMetrics,
  clampedDt: number,
  bestDistanceFeet: number
) {
  let remainingDt = clampedDt;

  while (remainingDt > 1e-6 && state.phase === 'airborne') {
    const subDt = Math.min(remainingDt, MAX_AIRBORNE_SUBSTEP);
    remainingDt -= subDt;

    const road = getSoapboxTrackElevationFeet(state.xFeet);
    state.trackSlopeDeg = road.slopeDeg;

    // Gravity acceleration down the hill: heavy soapboxes (>400 lb) gain extra downhill gravity pull!
    const overWeightGravityBonus = metrics.isOverWeightLimit
      ? Math.min(4.2, (metrics.rampTotalMassLbs - 400) * 0.015)
      : 0;
    const downhillAccel =
      (14.5 * metrics.effectiveLiftMultiplier * metrics.pushEfficiency + overWeightGravityBonus) *
      Math.max(0.35, -road.slopeDeg / 5.5);

    // Aerodynamic & tire rolling drag + cornering scrub
    const cornerScrub = Math.abs(state.pilotPitchInput) * (1.8 / Math.max(0.4, metrics.pitchStability));
    const dragDecel = 0.0085 * state.vxFeet * state.vxFeet + cornerScrub;

    state.vxFeet = Math.min(56, Math.max(12, state.vxFeet + (downhillAccel - dragDecel) * subDt));

    // Lateral steering (pilotPitchInput: -1 = Steer Left [-Z], +1 = Steer Right [+Z])
    // Heavy >400 lb soapboxes have higher lateral inertia so you must anticipate chicanes!
    const overWeightSteerInertia = metrics.isOverWeightLimit ? 0.76 : 1.0;
    const steerAuthority = (24 + metrics.stabilityScore * 0.22) * overWeightSteerInertia;
    const targetVz = state.pilotPitchInput * steerAuthority;
    state.lateralVzFeet += (targetVz - state.lateralVzFeet) * Math.min(1, subDt * 9.5);
    state.lateralZFeet = Math.max(-11.5, Math.min(11.5, state.lateralZFeet + state.lateralVzFeet * subDt));

    // Body roll lean when steering around chicanes (tilts in the direction of steering)
    const targetLean = state.pilotPitchInput * 10;
    state.leanDeg += (targetLean - state.leanDeg) * Math.min(1, subDt * 10);

    // Advance X and vertical jump physics above road
    state.xFeet += state.vxFeet * subDt;
    const nextRoad = getSoapboxTrackElevationFeet(state.xFeet);

    if (state.yFeet > nextRoad.yFeet + 0.08 || state.vyFeet > 0) {
      // Airborne off a wooden kicker ramp!
      state.vyFeet -= GRAVITY_MPS2 * FEET_PER_METER * 0.85 * subDt;
      state.yFeet += state.vyFeet * subDt;
      state.pitchDeg = Math.max(-18, Math.min(20, state.vyFeet * 0.75));
      if (state.yFeet <= nextRoad.yFeet) {
        state.yFeet = nextRoad.yFeet;
        state.vyFeet = 0;
        state.pitchDeg = nextRoad.slopeDeg;
      }
    } else {
      state.yFeet = nextRoad.yFeet;
      state.vyFeet = 0;
      state.pitchDeg = nextRoad.slopeDeg;
    }

    state.windGustWarning =
      state.yFeet > nextRoad.yFeet + 0.35 || state.vyFeet > 1 ? 'headwind_gust' : 'calm';

    state.distanceFeet = Math.min(450, Math.max(0, Math.round(state.xFeet)));

    // Update HUD zone indicator based on line cleanliness
    const absZ = Math.abs(state.lateralZFeet);
    state.inSweetSpot = absZ < 8.8;
    state.pitchZone = absZ > 8.8 ? 'too_low' : 'sweet_spot';

    // Check Speed Gates (thermalRings)
    for (const gate of state.thermalRings) {
      if (!gate.collected && Math.abs(state.xFeet - gate.xFeet) <= 5.5) {
        const dz = state.lateralZFeet - (gate.zFeet ?? 0);
        if (Math.abs(dz) <= gate.radiusFeet) {
          gate.collected = true;
          state.thermalsCollected += 1;
          STEP_RESULT.justCollectedThermal = true;
          state.vxFeet = Math.min(58, state.vxFeet + 6.5);
        }
      }
    }

    // Check Hay-Bale Chicanes & Wooden Kicker Ramps
    for (const obs of state.soapboxObstacles) {
      if (!obs.triggered && Math.abs(state.xFeet - obs.xFeet) <= 4.0) {
        const dz = Math.abs(state.lateralZFeet - obs.zFeet);
        if (dz <= obs.halfWidthFeet) {
          obs.triggered = true;
          if (obs.type === 'kicker_ramp') {
            // Launch airborne off the kicker ramp!
            state.vyFeet = 14.5 + state.vxFeet * 0.16;
            state.vxFeet = Math.min(58, state.vxFeet + 4.0);
            STEP_RESULT.justCollectedThermal = true;
          } else {
            // Clipped a hay-bale chicane!
            const jumpClearance = state.yFeet - nextRoad.yFeet;
            if (jumpClearance < 2.2) {
              state.obstaclesHit += 1;
              state.pitchZone = 'too_high';
              state.inSweetSpot = false;
              state.vxFeet = Math.max(11, state.vxFeet * 0.72);
              state.leanDeg += (state.lateralZFeet >= obs.zFeet ? 1 : -1) * 18;
              // Fragile cardboard builds can lose a piece on hard hay-bale impacts!
              if (state.obstaclesHit >= 3 && metrics.structuralToughness < 0.58) {
                state.completedCourse = false;
                state.phase = 'splashdown';
                state.phaseTime = 0;
                STEP_RESULT.justSplashedDown = true;
                state.impactXFeet = state.xFeet;
                state.splashIntensity = 82;
                spawnImpactDebris(state, metrics, 28);
                state.judgeScores = calculateJudgeScores(state, metrics, bestDistanceFeet);
                return STEP_RESULT;
              }
            }
          }
        }
      }
    }

    // Reached the 450-Ft Checkered Finish Arch!
    if (state.xFeet >= 450) {
      state.xFeet = 450;
      state.distanceFeet = 450;
      state.completedCourse = true;
      state.phase = 'splashdown';
      state.phaseTime = 0;
      STEP_RESULT.justSplashedDown = true;
      state.impactXFeet = 450;
      state.splashIntensity = Math.min(
        100,
        Math.round((state.vxFeet / 48) * 70 + (metrics.isOverWeightLimit ? 25 : 10))
      );
      if (state.obstaclesHit >= 2) {
        spawnImpactDebris(state, metrics, 24);
      }
      state.judgeScores = calculateJudgeScores(state, metrics, bestDistanceFeet);
    }
  }

  return STEP_RESULT;
}

/**
 * Red Bull Tandem Rollercoaster (Stalen Ros) over-water rail balance & hill momentum physics (0 -> 320 ft).
 * Player leans Left/Right (pilotPitchInput) to stay balanced on the narrow track and taps Space to pedal up hills!
 */
function stepRollercoasterCourse(
  state: FlightSimulationState,
  metrics: ComputedCraftMetrics,
  clampedDt: number,
  bestDistanceFeet: number
) {
  let remainingDt = clampedDt;

  while (remainingDt > 1e-6 && state.phase === 'airborne') {
    const subDt = Math.min(remainingDt, MAX_AIRBORNE_SUBSTEP);
    remainingDt -= subDt;

    const profile = getRollercoasterTrackProfile(state.xFeet);
    state.yFeet = profile.yFeet;
    state.pitchDeg = profile.slopeDeg;
    state.trackSlopeDeg = profile.slopeDeg;
    state.trackTargetLeanDeg = profile.targetLeanDeg;
    state.windGustWarning = profile.slopeDeg > 2.2 ? 'downdraft' : 'calm';

    // Slope momentum physics:
    // Downhill drops accelerate strongly (extra boost for >400 lb heavy builds),
    // while uphill camelbacks require momentum + rider pedaling!
    const slopeRad = (profile.slopeDeg * Math.PI) / 180;
    const overWeightMassRatio = metrics.rampTotalMassLbs / 260;
    const gravitySlopeAccel =
      -Math.sin(slopeRad) *
      36 *
      (profile.slopeDeg < 0 ? Math.min(1.45, Math.sqrt(overWeightMassRatio)) : 1.0);

    // Base tandem rider cadence keeps a steady baseline push, scaled by gear/frame efficiency
    const overWeightClimbDrag =
      profile.slopeDeg > 0 && metrics.isOverWeightLimit
        ? (metrics.rampTotalMassLbs - 400) * 0.022
        : 0;
    const basePedalAccel = 6.2 * metrics.effectiveLiftMultiplier * metrics.pushEfficiency - overWeightClimbDrag;
    const rollingDrag = 0.0075 * state.vxFeet * state.vxFeet;

    state.vxFeet = Math.min(
      46,
      Math.max(4.5, state.vxFeet + (gravitySlopeAccel + basePedalAccel - rollingDrag) * subDt)
    );

    // 3D Rail Balance Physics:
    // The narrow floating track banks & wobbles toward profile.targetLeanDeg.
    // Rider input (pilotPitchInput: -1 = Lean Left, +1 = Lean Right) applies corrective torque!
    const stabilityFactor = 0.55 + (metrics.stabilityScore / 100) * 0.65;
    const railCamberTorque = (profile.targetLeanDeg - state.leanDeg * 0.35) * (2.6 / stabilityFactor);
    const speedWobble = Math.sin(state.xFeet * 0.18) * (7.5 / stabilityFactor);
    const riderLeanTorque = state.pilotPitchInput * (92 * stabilityFactor);
    const selfCenteringDamping = -state.leanDeg * (1.4 * stabilityFactor) - state.leanVelDeg * 3.8;

    const leanAccel = railCamberTorque + speedWobble + riderLeanTorque + selfCenteringDamping;
    state.leanVelDeg += leanAccel * subDt;
    state.leanDeg = Math.max(-52, Math.min(52, state.leanDeg + state.leanVelDeg * subDt));

    // Update HUD balance zone indicators
    const absLean = Math.abs(state.leanDeg);
    state.aoaDeg = state.leanDeg; // Expose lean angle for HUD readout
    state.isStalling = absLean > 28;
    if (absLean > 28) {
      state.pitchZone = 'too_high';
      state.inSweetSpot = false;
    } else if (absLean > 15) {
      state.pitchZone = 'too_low';
      state.inSweetSpot = false;
    } else {
      state.pitchZone = 'sweet_spot';
      state.inSweetSpot = true;
      // Smooth balance bonus keeps speed flowing!
      state.vxFeet = Math.min(46, state.vxFeet + 1.2 * subDt);
    }

    state.xFeet += state.vxFeet * subDt;
    state.distanceFeet = Math.min(320, Math.max(0, Math.round(state.xFeet)));

    // Check Hanging Canal Bells (thermalRings)
    for (const bell of state.thermalRings) {
      if (!bell.collected && Math.abs(state.xFeet - bell.xFeet) <= 5.5) {
        if (absLean <= 30) {
          bell.collected = true;
          state.thermalsCollected += 1;
          STEP_RESULT.justCollectedThermal = true;
          state.vxFeet = Math.min(46, state.vxFeet + 5.5);
        }
      }
    }

    // Check Derailment off the narrow rollercoaster track into the canal! (|leanDeg| >= 43 deg)
    if (absLean >= 43) {
      state.completedCourse = false;
      state.phase = 'splashdown';
      state.phaseTime = 0;
      STEP_RESULT.justSplashedDown = true;
      state.impactXFeet = state.xFeet;
      state.distanceFeet = Math.max(8, Math.round(state.xFeet));
      state.lateralZFeet = Math.sign(state.leanDeg) * 4.5;
      state.yFeet = 0.18;
      state.splashIntensity = Math.min(
        100,
        Math.round(58 + (state.vxFeet / 42) * 30 + (metrics.isOverWeightLimit ? 18 : 0))
      );
      spawnImpactDebris(state, metrics, 26);
      state.judgeScores = calculateJudgeScores(state, metrics, bestDistanceFeet);
      return STEP_RESULT;
    }

    // Reached the 320-Ft Grand Finish Bell Platform!
    if (state.xFeet >= 320) {
      state.xFeet = 320;
      state.distanceFeet = 320;
      state.completedCourse = true;
      state.phase = 'splashdown';
      state.phaseTime = 0;
      STEP_RESULT.justSplashedDown = true;
      state.impactXFeet = 320;
      state.splashIntensity = Math.min(
        100,
        Math.round(65 + (state.vxFeet / 44) * 25 + (metrics.isOverWeightLimit ? 15 : 0))
      );
      state.judgeScores = calculateJudgeScores(state, metrics, bestDistanceFeet);
      return STEP_RESULT;
    }
  }

  return STEP_RESULT;
}

function spawnImpactDebris(
  state: FlightSimulationState,
  metrics: ComputedCraftMetrics,
  verticalSeverity: number
) {
  const breakThreshold = metrics.structuralToughness * 32;
  const impactSeverity =
    verticalSeverity +
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
}

function calculateJudgeScores(
  state: FlightSimulationState,
  metrics: ComputedCraftMetrics,
  previousBestFeet: number
): JudgeScores {
  const goalFeet = COMPETITIONS[state.competition].goalFeet;
  const targetForTen = state.competition === 'flugtag' ? 235 : goalFeet;
  const distNorm = Math.min(1, state.distanceFeet / targetForTen);

  // For Soapbox & Rollercoaster, finishing fast or clean adds to Judge 1; for Flugtag, hitting 235+ ft reaches 10/10
  const cleanBonus =
    state.competition === 'soapbox' && state.completedCourse
      ? Math.max(0, 1.5 - state.obstaclesHit * 0.5)
      : state.competition === 'rollercoaster' && state.completedCourse
      ? 1.5
      : state.competition === 'flugtag' && state.distanceFeet >= targetForTen
      ? 0.8
      : 0;

  const distanceJudge = Math.max(
    3,
    Math.min(10, Math.round(3 + distNorm * 6.2 + cleanBonus))
  );

  // 2. Creativity Judge (1-10)
  const splashBonus = state.splashIntensity > 74 ? 2 : state.splashIntensity > 52 ? 1 : 0;
  const heavyBonus = metrics.isOverWeightLimit ? 1 : 0;
  const creativityJudge = Math.max(
    4,
    Math.min(10, Math.round(3 + (metrics.creativityScore / 100) * 6 + splashBonus + heavyBonus))
  );

  // 3. Showmanship Judge (1-10)
  const releaseBonus =
    state.trolleyReleaseQuality === 'perfect' ? 2.5 : state.trolleyReleaseQuality === 'good' ? 1.5 : 0.0;
  const thermalBonus = state.thermalsCollected * 1.2;
  const showmanshipJudge = Math.max(
    4,
    Math.min(10, Math.round(3.0 + (state.hypeMeter / 100) * 3.5 + releaseBonus + thermalBonus))
  );

  const totalScore = distanceJudge + creativityJudge + showmanshipJudge;
  const starsEarned = totalScore >= 26 ? 3 : totalScore >= 20 ? 2 : 1;

  let splashRating = 'Smooth Skim!';
  if (state.competition === 'soapbox') {
    splashRating = state.completedCourse
      ? state.obstaclesHit === 0
        ? 'CLEAN APEX FINISH!!'
        : `Finished (${state.obstaclesHit} Hay Hit)`
      : 'YARD-SALE CRASH!!';
  } else if (state.competition === 'rollercoaster') {
    splashRating = state.completedCourse
      ? '🔔 RANG THE GRAND BELL!!'
      : '💦 CANAL RAIL SPLASH!!';
  } else {
    splashRating =
      state.splashIntensity >= 72
        ? 'MEGA CANNONBALL!!'
        : state.splashIntensity >= 46
        ? 'Big Splash!'
        : 'Smooth Skim!';
  }

  return {
    distanceJudge,
    creativityJudge,
    showmanshipJudge,
    totalScore,
    starsEarned,
    splashRating,
    isOverWeightCannonball: metrics.isOverWeightLimit,
    newRecord: state.distanceFeet > previousBestFeet,
    beatWorldRecord: state.distanceFeet >= goalFeet,
  };
}


