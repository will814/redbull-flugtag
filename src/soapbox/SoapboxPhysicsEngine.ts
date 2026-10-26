import {
  SOAPBOX_COURSE_LENGTH_FEET,
  SOAPBOX_START_RAMP_FEET,
} from './SoapboxPartCatalog';
import { ComputedSoapboxMetrics } from './SoapboxMetrics';

export type SoapboxPhase = 'skit' | 'start_ramp' | 'racing' | 'finished';

export type SoapboxPushReleaseQuality = 'none' | 'early' | 'perfect' | 'good' | 'late';

export type SoapboxObstacleType =
  | 'hay_bale'
  | 'cobble_strip'
  | 'water_slick'
  | 'kicker_jump'
  | 'speed_gate';

export interface SoapboxObstacle {
  id: string;
  type: SoapboxObstacleType;
  sFeet: number;
  lengthFeet: number;
  lateralCenterFeet: number;
  halfWidthFeet: number;
  triggered: boolean;
}

export interface SoapboxDebrisPiece {
  id: string;
  kind: 'wheel_fl' | 'wheel_fr' | 'wheel_rl' | 'wheel_rr' | 'topper' | 'bumper';
  xFeet: number;
  yFeet: number;
  zFeet: number;
  vxFtS: number;
  vyFtS: number;
  vzFtS: number;
  rx: number;
  ry: number;
  rz: number;
  vrx: number;
  vry: number;
  vrz: number;
}

export interface SoapboxHayBurst {
  id: number;
  sFeet: number;
  lateralFeet: number;
  createdAt: number;
}

export interface SoapboxJudgeScorecard {
  speedJudge: number;
  creativityJudge: number;
  showmanshipJudge: number;
  totalScore: number;
  starsEarned: 1 | 2 | 3;
  runTitle: string;
  newDistanceRecord: boolean;
  newTimeRecord: boolean;
}

export interface SoapboxRoadState {
  sFeet: number;
  /** 3D centerline coordinates in feet */
  xFeet: number;
  yFeet: number;
  zFeet: number;
  /** Horizontal heading angle in radians (0 = +X, positive = toward +Z right) */
  headingRad: number;
  /** Downhill slope angle in radians (positive = downhill drop) */
  slopeRad: number;
  /** Horizontal road curvature kappa in 1/ft (+ = curving right, - = curving left) */
  curvature: number;
  /** Road surface material */
  surface: 'asphalt' | 'cobblestone';
  /** Named course sector for HUD telemetry */
  sectionName: string;
}

export interface SoapboxSimulationState {
  phase: SoapboxPhase;
  phaseTime: number;
  sFeet: number;
  distanceFeet: number;
  speedFtS: number;
  mph: number;
  maxSpeedMph: number;
  lateralOffsetFeet: number;
  lateralVelFtS: number;
  steerInput: number;
  steerAngleDeg: number;
  pushTuckActive: boolean;
  brakeInput: boolean;
  brakeHeat: number;
  isBrakeFading: boolean;
  isDrifting: boolean;
  driftAngleDeg: number;
  driftStylePoints: number;
  rollDeg: number;
  rollVelDegS: number;
  rollWarning: boolean;
  isRolledOver: boolean;
  airborneHeightFeet: number;
  verticalVelFtS: number;
  suspensionCompression: number;
  bottomedOutCount: number;
  onCobblestone: boolean;
  inWaterSlickTimer: number;
  structuralIntegrity: number;
  hypeMeter: number;
  gateOpenProgress: number;
  pushCount: number;
  pushShoveQuality: SoapboxPushReleaseQuality;
  hayBalesHit: number;
  speedGatesCleared: number;
  jumpsCompleted: number;
  elapsedRaceTimeSec: number;
  completedCourse: boolean;
  roadSurface: 'asphalt' | 'cobblestone';
  sectionName: string;
  roadCurvature: number;
  statusBanner: {
    text: string;
    tone: 'info' | 'good' | 'warn' | 'danger';
  } | null;
  statusBannerTimer: number;
  obstacles: SoapboxObstacle[];
  debris: SoapboxDebrisPiece[];
  hayBursts: SoapboxHayBurst[];
  sparkIntensity: number;
  judgeScores: SoapboxJudgeScorecard | null;
}

export interface SoapboxStepEvents {
  gateDropped: boolean;
  pushShoveResult: SoapboxPushReleaseQuality | null;
  hayBaleHit: boolean;
  waterSlickEntered: boolean;
  kickerLaunched: boolean;
  bottomedOut: boolean;
  speedGateCleared: boolean;
  driftChirp: boolean;
  rolledOver: boolean;
  finishedRun: boolean;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / Math.max(1e-5, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Evaluates the 1,000-Ft Winding Alpine Hilltop Course Profile at distance `sFeet`.
 * - Start Pavilion & Chute: s in [-40, 0] ft at +110 ft elevation
 * - Downhill Winding Course: s in [0, 1000] ft descending from +100 ft to 0 ft
 */
export function getSoapboxRoadState(sFeet: number): SoapboxRoadState {
  const s = clamp(sFeet, -50, 1140);

  // 1. Elevation Profile Y(s) in feet
  let yFeet = 0;
  let dyDs = 0;

  if (s < 0) {
    // Steep starter chute from s = -40 ft (y = 111.5 ft) down to s = 0 ft (y = 100 ft)
    const u = clamp((s + SOAPBOX_START_RAMP_FEET) / SOAPBOX_START_RAMP_FEET, 0, 1);
    yFeet = 111.5 - u * 11.5;
    dyDs = -11.5 / SOAPBOX_START_RAMP_FEET;
  } else if (s <= SOAPBOX_COURSE_LENGTH_FEET) {
    const u = s / SOAPBOX_COURSE_LENGTH_FEET;
    // Steady 10% average downhill grade with steeper drops before jumps & hairpin
    const baseDrop = 100 * (1 - u);
    const undulation =
      3.8 * Math.sin(u * Math.PI * 4) +
      2.4 * Math.cos(u * Math.PI * 2);
    // Smooth out at s = 0 and s = 1000
    const env = Math.sin(u * Math.PI);
    yFeet = baseDrop + undulation * env;

    const dBaseDs = -100 / SOAPBOX_COURSE_LENGTH_FEET;
    const dUndDs =
      ((3.8 * Math.PI * 4 * Math.cos(u * Math.PI * 4) -
        2.4 * Math.PI * 2 * Math.sin(u * Math.PI * 2)) *
        env) /
      SOAPBOX_COURSE_LENGTH_FEET;
    dyDs = dBaseDs + dUndDs;
  } else {
    // Flat finish celebration apron past 1,000 ft
    const excess = s - SOAPBOX_COURSE_LENGTH_FEET;
    yFeet = Math.max(-2.5, -excess * 0.02);
    dyDs = -0.02;
  }

  // 2. Lateral Winding Centerline Z(s) in feet (sweeping S-curves + Hairpin Switchback at 560-680 ft)
  let zFeet = 0;
  let dzDs = 0;
  let d2zDs2 = 0;

  if (s > 0) {
    const sEff = Math.min(s, SOAPBOX_COURSE_LENGTH_FEET);
    const rampIn = smoothstep(0, 55, sEff);
    const rampOut = 1 - smoothstep(935, 1000, sEff);
    const env = rampIn * rampOut;

    // Sweeping Alpine S-curves + pronounced Hairpin Switchback bulge around s = 620 ft
    const k1 = 0.0125; // wavelength ~502 ft
    const k2 = 0.026; // chicane harmonic
    const hpCenter = 620;
    const hpWidth = 68;
    const hpArg = (sEff - hpCenter) / hpWidth;
    const hpGauss = Math.exp(-hpArg * hpArg);

    const waveZ =
      38 * Math.sin(k1 * sEff) +
      16 * Math.sin(k2 * sEff - 0.6) +
      44 * hpGauss * Math.sin(0.036 * (sEff - 540));

    const dWaveDs =
      38 * k1 * Math.cos(k1 * sEff) +
      16 * k2 * Math.cos(k2 * sEff - 0.6) +
      44 *
        hpGauss *
        ((-2 * hpArg) / hpWidth * Math.sin(0.036 * (sEff - 540)) +
          0.036 * Math.cos(0.036 * (sEff - 540)));

    const d2WaveDs2 =
      -38 * k1 * k1 * Math.sin(k1 * sEff) -
      16 * k2 * k2 * Math.sin(k2 * sEff - 0.6) -
      44 *
        hpGauss *
        (0.036 * 0.036 * Math.sin(0.036 * (sEff - 540)) +
          (2 / (hpWidth * hpWidth)) * Math.sin(0.036 * (sEff - 540)));

    zFeet = waveZ * env;
    dzDs = dWaveDs * env;
    d2zDs2 = d2WaveDs2 * env;
  }

  const xFeet = s;
  const headingRad = Math.atan2(dzDs, 1);
  const slopeRad = Math.atan2(-dyDs, 1);

  // Curvature kappa(s) in 1/ft (+ = right bend, - = left bend)
  const denom = Math.pow(1 + dzDs * dzDs, 1.5);
  const curvature = clamp(d2zDs2 / denom, -0.028, 0.028);

  // Surface type (Cobblestone sectors in Old Town & Lower Sprint)
  const isCobble =
    (s >= 250 && s <= 300) ||
    (s >= 415 && s <= 475) ||
    (s >= 810 && s <= 865);
  const surface: 'asphalt' | 'cobblestone' = isCobble ? 'cobblestone' : 'asphalt';

  // Named Course Sector
  let sectionName = 'Hilltop Start Pavilion';
  if (s >= 0 && s < 230) {
    sectionName = 'Alpine Panorama S-Curves';
  } else if (s >= 230 && s < 350) {
    sectionName = 'Old Town Cobbles & Kicker #1';
  } else if (s >= 350 && s < 550) {
    sectionName = 'Brewery Alley Chicanes';
  } else if (s >= 550 && s < 695) {
    sectionName = "Deadman's Hairpin Switchback";
  } else if (s >= 695 && s < 800) {
    sectionName = 'Canyon Gap Kicker Jump #2';
  } else if (s >= 800 && s < 1000) {
    sectionName = 'Final Cobble Sprint to Finish';
  } else if (s >= 1000) {
    sectionName = '1,000-Ft Checkered Finish Arch';
  }

  return {
    sFeet: s,
    xFeet,
    yFeet,
    zFeet,
    headingRad,
    slopeRad,
    curvature,
    surface,
    sectionName,
  };
}

/**
 * Generates the deterministic list of course obstacles & hazards along the 1,000-ft road.
 */
export function createSoapboxCourseObstacles(): SoapboxObstacle[] {
  return [
    // Upper S-Curves
    {
      id: 'obs_hay_1',
      type: 'hay_bale',
      sFeet: 95,
      lengthFeet: 8,
      lateralCenterFeet: -6.5,
      halfWidthFeet: 3.6,
      triggered: false,
    },
    {
      id: 'obs_slick_1',
      type: 'water_slick',
      sFeet: 148,
      lengthFeet: 22,
      lateralCenterFeet: 4.2,
      halfWidthFeet: 4.5,
      triggered: false,
    },
    {
      id: 'obs_hay_2',
      type: 'hay_bale',
      sFeet: 186,
      lengthFeet: 8,
      lateralCenterFeet: 6.8,
      halfWidthFeet: 3.6,
      triggered: false,
    },
    {
      id: 'obs_gate_1',
      type: 'speed_gate',
      sFeet: 222,
      lengthFeet: 10,
      lateralCenterFeet: -1.5,
      halfWidthFeet: 4.2,
      triggered: false,
    },

    // Old Town Cobbles & Kicker Jump #1
    {
      id: 'obs_cobble_1',
      type: 'cobble_strip',
      sFeet: 275,
      lengthFeet: 50,
      lateralCenterFeet: 0,
      halfWidthFeet: 13,
      triggered: false,
    },
    {
      id: 'obs_kicker_1',
      type: 'kicker_jump',
      sFeet: 310,
      lengthFeet: 16,
      lateralCenterFeet: 0,
      halfWidthFeet: 6.5,
      triggered: false,
    },

    // Brewery Alley Chicanes
    {
      id: 'obs_hay_3',
      type: 'hay_bale',
      sFeet: 375,
      lengthFeet: 8,
      lateralCenterFeet: -5.8,
      halfWidthFeet: 3.8,
      triggered: false,
    },
    {
      id: 'obs_cobble_2',
      type: 'cobble_strip',
      sFeet: 445,
      lengthFeet: 60,
      lateralCenterFeet: 0,
      halfWidthFeet: 13,
      triggered: false,
    },
    {
      id: 'obs_slick_2',
      type: 'water_slick',
      sFeet: 468,
      lengthFeet: 24,
      lateralCenterFeet: -3.8,
      halfWidthFeet: 4.6,
      triggered: false,
    },
    {
      id: 'obs_hay_4',
      type: 'hay_bale',
      sFeet: 508,
      lengthFeet: 8,
      lateralCenterFeet: 6.2,
      halfWidthFeet: 3.8,
      triggered: false,
    },
    {
      id: 'obs_gate_2',
      type: 'speed_gate',
      sFeet: 542,
      lengthFeet: 10,
      lateralCenterFeet: 2.0,
      halfWidthFeet: 4.0,
      triggered: false,
    },

    // Deadman's Hairpin Switchback (560 - 680 ft)
    {
      id: 'obs_hay_5',
      type: 'hay_bale',
      sFeet: 595,
      lengthFeet: 8,
      lateralCenterFeet: -7.2,
      halfWidthFeet: 3.8,
      triggered: false,
    },
    {
      id: 'obs_slick_3',
      type: 'water_slick',
      sFeet: 638,
      lengthFeet: 24,
      lateralCenterFeet: 3.5,
      halfWidthFeet: 4.5,
      triggered: false,
    },
    {
      id: 'obs_hay_6',
      type: 'hay_bale',
      sFeet: 676,
      lengthFeet: 8,
      lateralCenterFeet: 7.0,
      halfWidthFeet: 3.8,
      triggered: false,
    },

    // Canyon Kicker Jump #2 & Lower Sprint
    {
      id: 'obs_kicker_2',
      type: 'kicker_jump',
      sFeet: 720,
      lengthFeet: 18,
      lateralCenterFeet: 0,
      halfWidthFeet: 6.5,
      triggered: false,
    },
    {
      id: 'obs_gate_3',
      type: 'speed_gate',
      sFeet: 768,
      lengthFeet: 10,
      lateralCenterFeet: -2.2,
      halfWidthFeet: 4.0,
      triggered: false,
    },
    {
      id: 'obs_hay_7',
      type: 'hay_bale',
      sFeet: 798,
      lengthFeet: 8,
      lateralCenterFeet: 5.8,
      halfWidthFeet: 3.6,
      triggered: false,
    },
    {
      id: 'obs_cobble_3',
      type: 'cobble_strip',
      sFeet: 838,
      lengthFeet: 55,
      lateralCenterFeet: 0,
      halfWidthFeet: 13,
      triggered: false,
    },
    {
      id: 'obs_slick_4',
      type: 'water_slick',
      sFeet: 882,
      lengthFeet: 22,
      lateralCenterFeet: -4.2,
      halfWidthFeet: 4.5,
      triggered: false,
    },
    {
      id: 'obs_hay_8',
      type: 'hay_bale',
      sFeet: 922,
      lengthFeet: 8,
      lateralCenterFeet: -6.4,
      halfWidthFeet: 3.6,
      triggered: false,
    },
    {
      id: 'obs_gate_4',
      type: 'speed_gate',
      sFeet: 958,
      lengthFeet: 10,
      lateralCenterFeet: 0,
      halfWidthFeet: 4.2,
      triggered: false,
    },
  ];
}

export function createInitialSoapboxState(): SoapboxSimulationState {
  const initialRoad = getSoapboxRoadState(-SOAPBOX_START_RAMP_FEET);
  return {
    phase: 'skit',
    phaseTime: 0,
    sFeet: -SOAPBOX_START_RAMP_FEET,
    distanceFeet: 0,
    speedFtS: 0,
    mph: 0,
    maxSpeedMph: 0,
    lateralOffsetFeet: 0,
    lateralVelFtS: 0,
    steerInput: 0,
    steerAngleDeg: 0,
    pushTuckActive: false,
    brakeInput: false,
    brakeHeat: 0,
    isBrakeFading: false,
    isDrifting: false,
    driftAngleDeg: 0,
    driftStylePoints: 0,
    rollDeg: 0,
    rollVelDegS: 0,
    rollWarning: false,
    isRolledOver: false,
    airborneHeightFeet: 0,
    verticalVelFtS: 0,
    suspensionCompression: 0,
    bottomedOutCount: 0,
    onCobblestone: false,
    inWaterSlickTimer: 0,
    structuralIntegrity: 100,
    hypeMeter: 30,
    gateOpenProgress: 0,
    pushCount: 0,
    pushShoveQuality: 'none',
    hayBalesHit: 0,
    speedGatesCleared: 0,
    jumpsCompleted: 0,
    elapsedRaceTimeSec: 0,
    completedCourse: false,
    roadSurface: initialRoad.surface,
    sectionName: initialRoad.sectionName,
    roadCurvature: 0,
    statusBanner: {
      text: '🎺 Hype the Hilltop Crowd or Drop the Start Gate!',
      tone: 'info',
    },
    statusBannerTimer: 4.0,
    obstacles: createSoapboxCourseObstacles(),
    debris: [],
    hayBursts: [],
    sparkIntensity: 0,
    judgeScores: null,
  };
}

function setBanner(
  state: SoapboxSimulationState,
  text: string,
  tone: 'info' | 'good' | 'warn' | 'danger',
  duration = 2.1
): void {
  state.statusBanner = { text, tone };
  state.statusBannerTimer = duration;
}

/**
 * Handles discrete tap action during 'skit' (Hype tap) and 'start_ramp' (Crew Push / Push-Bar Shove).
 */
export function triggerSoapboxActionTap(
  state: SoapboxSimulationState,
  metrics: ComputedSoapboxMetrics
): {
  event: 'none' | 'hype_tap' | 'crew_push' | 'push_shove';
  shovePerfect: boolean;
} {
  if (state.phase === 'skit') {
    state.hypeMeter = clamp(state.hypeMeter + 18, 0, 100);
    setBanner(
      state,
      `🎺 Crowd Hype ${Math.round(state.hypeMeter)}%! Ready at the Start Gate!`,
      'good',
      1.6
    );
    return { event: 'hype_tap', shovePerfect: false };
  }

  if (state.phase === 'start_ramp') {
    state.pushCount += 1;
    const massFactor = clamp(290 / Math.max(180, metrics.totalMassLbs), 0.72, 1.25);

    // Check if inside the green Push-Bar Shove Window (-14..0 ft) and not yet shoved
    if (state.sFeet >= -16.5 && state.sFeet <= 0 && state.pushShoveQuality === 'none') {
      const isPerfect = state.sFeet >= -14.2 && state.sFeet <= 0;
      state.pushShoveQuality = isPerfect ? 'perfect' : 'good';
      const bonusFtS = (isPerfect ? 13.5 : 8.5) * massFactor;
      state.speedFtS = clamp(state.speedFtS + bonusFtS, 18, 68);
      state.mph = state.speedFtS * 0.681818;
      state.driftStylePoints += isPerfect ? 35 : 18;
      setBanner(
        state,
        isPerfect
          ? '🟢 PERFECT PUSH-BAR SHOVE! +9 MPH LAUNCH SURGE!'
          : '👍 GOOD CREW SHOVE! ONTO THE HILL!',
        'good',
        2.4
      );
      return { event: 'push_shove', shovePerfect: isPerfect };
    }

    // Standard starter chute crew sprint tap
    const tapBoost = 5.2 * massFactor;
    state.speedFtS = clamp(state.speedFtS + tapBoost, 12, 54);
    state.mph = state.speedFtS * 0.681818;
    return { event: 'crew_push', shovePerfect: false };
  }

  return { event: 'none', shovePerfect: false };
}

/**
 * Transitions immediately from 'skit' to 'start_ramp' (Mechanical Drop-Gate slams open!).
 */
export function dropSoapboxStartGate(
  state: SoapboxSimulationState,
  metrics: ComputedSoapboxMetrics
): void {
  if (state.phase !== 'skit') return;
  state.phase = 'start_ramp';
  state.phaseTime = 0;
  state.gateOpenProgress = 1;
  const massFactor = clamp(290 / Math.max(180, metrics.totalMassLbs), 0.75, 1.2);
  const hypeBonus = (state.hypeMeter / 100) * 5.5;
  state.speedFtS = (15.5 + hypeBonus) * massFactor;
  state.mph = state.speedFtS * 0.681818;
  setBanner(
    state,
    '🏁 GATE DROPPED! Tap PUSH & Hit the Green Shove Zone at the Lip!',
    'info',
    2.5
  );
}

function spawnRolloverDebris(state: SoapboxSimulationState): void {
  if (state.debris.length > 0) return;
  const road = getSoapboxRoadState(state.sFeet);
  const baseZ = road.zFeet + state.lateralOffsetFeet;
  const baseY = road.yFeet + state.airborneHeightFeet + 1.2;

  const kinds: SoapboxDebrisPiece['kind'][] = [
    'wheel_fl',
    'wheel_fr',
    'wheel_rl',
    'wheel_rr',
    'topper',
    'bumper',
  ];

  kinds.forEach((kind, idx) => {
    const angle = (idx / kinds.length) * Math.PI * 2 + 0.4;
    state.debris.push({
      id: `sb_debris_${kind}`,
      kind,
      xFeet: road.xFeet + (idx % 2 === 0 ? 1.5 : -1.5),
      yFeet: baseY + (kind === 'topper' ? 2.2 : 0.6),
      zFeet: baseZ + Math.sin(angle) * 2.5,
      vxFtS: state.speedFtS * 0.55 + Math.cos(angle) * 14,
      vyFtS: 14 + (idx % 3) * 6,
      vzFtS: state.lateralVelFtS * 0.5 + Math.sin(angle) * 18,
      rx: 0,
      ry: 0,
      rz: 0,
      vrx: (idx % 2 === 0 ? 1 : -1) * (5 + idx * 1.4),
      vry: 4 - idx * 1.1,
      vrz: (idx % 2 === 1 ? 1 : -1) * (6 + idx),
    });
  });
}

function finalizeSoapboxJudgeScorecard(
  state: SoapboxSimulationState,
  metrics: ComputedSoapboxMetrics,
  bestRecordFeet: number,
  bestTimeSec: number | null
): SoapboxJudgeScorecard {
  // 1. Speed & Line Judge (1..10)
  const distRatio = clamp(state.distanceFeet / SOAPBOX_COURSE_LENGTH_FEET, 0, 1);
  let speedRaw = distRatio * 6.8;
  if (state.completedCourse) {
    // Fast finish time bonus (sub-21s = elite, 25s = solid)
    const timeBonus = clamp((28 - state.elapsedRaceTimeSec) / 8.5, 0, 1) * 3.2;
    speedRaw = 7.0 + timeBonus;
  } else {
    speedRaw += clamp((state.maxSpeedMph - 25) / 35, 0, 1.5);
  }
  if (state.hayBalesHit === 0 && state.distanceFeet > 400) {
    speedRaw += 0.6;
  }
  const speedJudge = Math.round(clamp(speedRaw, 2, 10));

  // 2. Creativity & Craft Flair Judge (1..10)
  const baseCreativity = 4.2 + (metrics.creativityScore / 100) * 5.2;
  const heavyBonus = metrics.totalMassLbs >= 340 ? 0.8 : 0;
  const creativityJudge = Math.round(clamp(baseCreativity + heavyBonus, 3, 10));

  // 3. Showmanship, Drifts & Jumps Judge (1..10)
  const hypePts = (state.hypeMeter / 100) * 2.2;
  const shovePts =
    state.pushShoveQuality === 'perfect'
      ? 1.8
      : state.pushShoveQuality === 'good'
      ? 1.1
      : 0.4;
  const stylePts = clamp(state.driftStylePoints / 110, 0, 3.6);
  const jumpGatePts = clamp(
    state.jumpsCompleted * 0.9 + state.speedGatesCleared * 0.65,
    0,
    2.6
  );
  // Even a dramatic yard-sale rollover earns a spectator drama bonus!
  const dramaBonus = state.isRolledOver ? 1.2 : 0;
  const showmanshipJudge = Math.round(
    clamp(2.5 + hypePts + shovePts + stylePts + jumpGatePts + dramaBonus, 3, 10)
  );

  const totalScore = speedJudge + creativityJudge + showmanshipJudge;
  const starsEarned: 1 | 2 | 3 =
    totalScore >= 26 ? 3 : totalScore >= 20 ? 2 : 1;

  const newDistanceRecord = state.distanceFeet > bestRecordFeet;
  const newTimeRecord =
    state.completedCourse &&
    (bestTimeSec === null || state.elapsedRaceTimeSec < bestTimeSec);

  let runTitle = '🏁 Downhill Derby Contender!';
  if (state.completedCourse && state.elapsedRaceTimeSec <= 20.5) {
    runTitle = '👑 Hilltop Track Record Blitz!';
  } else if (state.completedCourse && state.hayBalesHit === 0) {
    runTitle = '🏆 Flawless Clean-Line Champion!';
  } else if (state.completedCourse) {
    runTitle = '🏁 1,000-Ft Finish Arch Conqueror!';
  } else if (state.isRolledOver) {
    runTitle = '💥 Two-Wheel Tilt & Yard-Sale Rollover!';
  } else if (state.structuralIntegrity <= 0) {
    runTitle = '🌾 Hay-Bale Demolition Derby!';
  }

  return {
    speedJudge,
    creativityJudge,
    showmanshipJudge,
    totalScore,
    starsEarned,
    runTitle,
    newDistanceRecord,
    newTimeRecord,
  };
}

/**
 * Steps the 120Hz Soapbox Derby physics simulation forward by `dt` seconds.
 */
export function stepSoapboxSimulation(
  state: SoapboxSimulationState,
  metrics: ComputedSoapboxMetrics,
  dt: number,
  bestRecordFeet: number,
  bestTimeSec: number | null
): SoapboxStepEvents {
  const events: SoapboxStepEvents = {
    gateDropped: false,
    pushShoveResult: null,
    hayBaleHit: false,
    waterSlickEntered: false,
    kickerLaunched: false,
    bottomedOut: false,
    speedGateCleared: false,
    driftChirp: false,
    rolledOver: false,
    finishedRun: false,
  };

  if (!Number.isFinite(dt) || dt <= 0) {
    return events;
  }

  state.phaseTime += dt;

  if (state.statusBannerTimer > 0) {
    state.statusBannerTimer = Math.max(0, state.statusBannerTimer - dt);
    if (state.statusBannerTimer === 0) {
      state.statusBanner = null;
    }
  }

  if (state.sparkIntensity > 0) {
    state.sparkIntensity = Math.max(0, state.sparkIntensity - dt * 2.8);
  }

  // Step flying crash debris if any exist
  for (const d of state.debris) {
    d.xFeet += d.vxFtS * dt;
    d.yFeet += d.vyFtS * dt;
    d.zFeet += d.vzFtS * dt;
    d.vyFtS -= 32.174 * dt;
    d.rx += d.vrx * dt;
    d.ry += d.vry * dt;
    d.rz += d.vrz * dt;
    const roadAtDebris = getSoapboxRoadState(d.xFeet);
    if (d.yFeet < roadAtDebris.yFeet + 0.45) {
      d.yFeet = roadAtDebris.yFeet + 0.45;
      d.vyFtS = Math.abs(d.vyFtS) * 0.42;
      d.vxFtS *= 0.86;
      d.vzFtS *= 0.86;
    }
  }

  // Smooth front wheel steering angle visual response
  const targetSteerDeg = state.steerInput * 26;
  state.steerAngleDeg += (targetSteerDeg - state.steerAngleDeg) * Math.min(1, dt * 14);

  // ============================================================================
  // PHASE 1: HILLTOP PAVILION SKIT
  // ============================================================================
  if (state.phase === 'skit') {
    state.hypeMeter = clamp(state.hypeMeter + dt * 4.5, 0, 100);
    if (state.phaseTime >= 3.4) {
      dropSoapboxStartGate(state, metrics);
      events.gateDropped = true;
    }
    return events;
  }

  // ============================================================================
  // PHASE 2: STEEP STARTER CHUTE (-40 ft .. 0 ft)
  // ============================================================================
  if (state.phase === 'start_ramp') {
    state.gateOpenProgress = Math.min(1, state.gateOpenProgress + dt * 6.5);
    const road = getSoapboxRoadState(state.sFeet);
    state.roadSurface = road.surface;
    state.sectionName = road.sectionName;

    // Gravity down the starter ramp + crew push momentum
    const gFtS2 = 32.174;
    const slopeAccel = gFtS2 * Math.sin(road.slopeRad) * 1.12;
    const holdBoost = state.pushTuckActive ? 7.5 : 0;
    state.speedFtS = clamp(state.speedFtS + (slopeAccel + holdBoost) * dt, 10, 68);
    state.mph = state.speedFtS * 0.681818;
    state.maxSpeedMph = Math.max(state.maxSpeedMph, state.mph);

    state.sFeet += state.speedFtS * dt;

    // Gentle steering alignment on starter chute
    state.lateralOffsetFeet = clamp(
      state.lateralOffsetFeet + state.steerInput * 10 * dt,
      -8,
      8
    );

    if (state.sFeet >= 0) {
      state.sFeet = 0;
      state.phase = 'racing';
      state.phaseTime = 0;
      if (state.pushShoveQuality === 'none') {
        if (state.pushTuckActive) {
          state.pushShoveQuality = 'good';
          state.speedFtS = clamp(state.speedFtS + 5.5, 12, 68);
          state.mph = state.speedFtS * 0.681818;
          state.maxSpeedMph = Math.max(state.maxSpeedMph, state.mph);
          events.pushShoveResult = 'good';
          setBanner(state, '👍 Clean Push-Off! Carve the Downhill Line!', 'good', 2.0);
        } else {
          state.pushShoveQuality = 'late';
          events.pushShoveResult = 'late';
          setBanner(state, '⚠️ Missed Push-Bar Shove! Hold TUCK for Speed!', 'warn', 2.0);
        }
      }
    }
    return events;
  }

  // ============================================================================
  // PHASE 3: DOWNHILL RACING COURSE (0 .. 1,000 FT)
  // ============================================================================
  if (state.phase === 'racing') {
    state.elapsedRaceTimeSec += dt;

    const road = getSoapboxRoadState(state.sFeet);
    state.roadSurface = road.surface;
    state.sectionName = road.sectionName;
    state.roadCurvature = road.curvature;
    const wasOnCobblestone = state.onCobblestone;
    state.onCobblestone = road.surface === 'cobblestone' && state.airborneHeightFeet <= 0.05;

    if (state.onCobblestone && !wasOnCobblestone && (!state.statusBanner || state.statusBanner.tone === 'info')) {
      if (metrics.roughTerrainRating >= 0.65) {
        setBanner(
          state,
          '🚜 COBBLESTONE SECTOR — All-Terrain Treads & Shocks Gliding Smoothly!',
          'good',
          1.7
        );
      } else if (metrics.roughTerrainRating <= 0.3) {
        setBanner(
          state,
          '🪨 COBBLESTONE RUMBLE! Thin Tires Chattering & Losing Speed!',
          'warn',
          1.7
        );
      }
    }

    if (state.inWaterSlickTimer > 0) {
      state.inWaterSlickTimer = Math.max(0, state.inWaterSlickTimer - dt);
    }

    // 1. Brake Heat & Fade Dynamics
    if (state.brakeInput && state.airborneHeightFeet <= 0.1) {
      const heatRate = (1.18 - metrics.brakeHeatResistance * 0.92) * 34;
      state.brakeHeat = clamp(state.brakeHeat + heatRate * dt, 0, 100);
      if (metrics.brakePower >= 0.95) {
        // Anchor or heavy brakes throw sparks
        state.sparkIntensity = Math.max(state.sparkIntensity, 0.45);
      }
    } else {
      const coolRate = 22 + metrics.brakeHeatResistance * 18;
      state.brakeHeat = clamp(state.brakeHeat - coolRate * dt, 0, 100);
    }
    state.isBrakeFading = state.brakeHeat > 75 && metrics.brakeHeatResistance < 0.98;

    // 2. Longitudinal Forces: Downhill Gravity, Rolling Resistance, Cobble Chatter, Aero Drag & Brakes
    const gFtS2 = 32.174;
    const massGravityScale = 1 + clamp((metrics.totalMassLbs - 240) / 550, -0.06, 0.14);
    const gravityAccel = gFtS2 * Math.sin(road.slopeRad) * 1.48 * massGravityScale;

    // Rolling resistance + cobblestone vibration penalty (mitigated by roughTerrainRating)
    const cobblePenalty = state.onCobblestone
      ? (1 - metrics.roughTerrainRating * 0.88) * 0.082
      : 0;
    const rollDecel = gFtS2 * (metrics.rollingResistance + cobblePenalty);

    // Aerodynamic drag (reduced by 18% when holding Push / Aero Tuck!)
    const effectiveCdA = metrics.aeroDragCdA * (state.pushTuckActive ? 0.82 : 1.0);
    const aeroDecel = 0.00145 * effectiveCdA * state.speedFtS * state.speedFtS;

    // Active Push / Aero Tuck also gives a slight downhill pumping boost
    const tuckPumpAccel =
      state.pushTuckActive && !state.brakeInput && state.airborneHeightFeet <= 0.05
        ? 3.2
        : 0;

    // Mechanical Brake Deceleration (reduced by 48% when brake fade is active above 75% heat,
    // and moderated during active steering drift so handbrake-drifts carry speed through hairpins)
    const fadeMultiplier = state.isBrakeFading ? 0.52 : 1.0;
    const driftBrakeMod =
      state.isDrifting && Math.abs(state.steerInput) > 0.25 ? 0.58 : 1.0;
    const brakeDecel =
      state.brakeInput && state.airborneHeightFeet <= 0.1
        ? metrics.brakePower * fadeMultiplier * driftBrakeMod * 30.0
        : 0;

    // Drift scrubbing deceleration
    const driftScrubDecel = state.isDrifting ? 3.2 : 0;

    const netAccel =
      gravityAccel +
      tuckPumpAccel -
      rollDecel -
      aeroDecel -
      brakeDecel -
      driftScrubDecel;

    state.speedFtS = clamp(state.speedFtS + netAccel * dt, 11, 92);
    state.mph = state.speedFtS * 0.681818;
    state.maxSpeedMph = Math.max(state.maxSpeedMph, state.mph);

    // 3. Steering, Road Curvature Centrifugal Push, Tire Grip & Power-Slide Drifting
    const speedRatio = clamp(state.speedFtS / 55, 0.25, 1.45);
    const waterGripMultiplier = state.inWaterSlickTimer > 0 ? 0.4 : 1.0; // Water slick cuts lateral tire grip by 60%!
    const cobbleGripMultiplier = state.onCobblestone
      ? 0.76 + metrics.roughTerrainRating * 0.24
      : 1.0;
    const downforceGripBonus = metrics.downforceFactor * speedRatio * 0.28;
    const effectiveGrip =
      (metrics.lateralGripMultiplier + downforceGripBonus) *
      waterGripMultiplier *
      cobbleGripMultiplier;

    // Centrifugal outward acceleration from road curvature kappa(s) * v^2
    // When road curves Right (curvature > 0), outward push is toward Left (-lateral)
    const centrifugalPushFtS2 =
      -road.curvature * state.speedFtS * state.speedFtS * 0.62;

    // Player steering lateral acceleration across the lane
    const steerAuthority = (29 + effectiveGrip * 15.5) * clamp(0.78 + speedRatio * 0.34, 0.78, 1.22);
    const cobbleLateralJitter = state.onCobblestone
      ? (1 - metrics.roughTerrainRating * 0.85) * Math.sin(state.sFeet * 2.1) * 3.2
      : 0;
    const steerAccelFtS2 = state.steerInput * steerAuthority + cobbleLateralJitter;

    // Lateral tire damping (reduced during water slicks or power-slide drift)
    const lateralDamping = state.inWaterSlickTimer > 0 ? 2.1 : state.isDrifting ? 3.1 : 5.4;
    state.lateralVelFtS +=
      (steerAccelFtS2 + centrifugalPushFtS2 - state.lateralVelFtS * lateralDamping) * dt;
    state.lateralVelFtS = clamp(state.lateralVelFtS, -34, 34);
    state.lateralOffsetFeet += state.lateralVelFtS * dt;

    // Power-Slide Drift initiation & sustain:
    // Tapping/holding Brake while steering at speed, OR exceeding lateral tire grip in a tight turn / water slick
    const corneringLoad =
      Math.abs(centrifugalPushFtS2 - steerAccelFtS2 * 0.55) /
      Math.max(0.45, effectiveGrip * 18);
    const driftThreshold = clamp(1.02 - metrics.driftAgility * 0.24, 0.68, 1.0);
    const wantsBrakeDrift =
      state.brakeInput &&
      Math.abs(state.steerInput) > 0.2 &&
      state.speedFtS > 22 &&
      state.airborneHeightFeet <= 0.1;
    const gripExceededDrift =
      (corneringLoad > driftThreshold ||
        (state.inWaterSlickTimer > 0 && Math.abs(state.steerInput) > 0.2)) &&
      state.speedFtS > 24 &&
      state.airborneHeightFeet <= 0.1;
    const sustainActiveDrift =
      state.isDrifting &&
      Math.abs(state.steerInput) > 0.25 &&
      state.speedFtS > 21 &&
      state.airborneHeightFeet <= 0.1 &&
      (Math.abs(road.curvature) > 0.003 ||
        corneringLoad > driftThreshold * 0.72 ||
        metrics.driftAgility >= 0.65);

    const wasDrifting = state.isDrifting;
    state.isDrifting = wantsBrakeDrift || gripExceededDrift || sustainActiveDrift;

    if (state.isDrifting) {
      const driftSign =
        state.steerInput !== 0
          ? Math.sign(state.steerInput)
          : Math.sign(state.lateralVelFtS || 1);
      const targetSlip =
        driftSign *
        clamp(14 + corneringLoad * 9 + metrics.driftAgility * 8, 12, 32);
      state.driftAngleDeg += (targetSlip - state.driftAngleDeg) * Math.min(1, dt * 10);
      state.driftStylePoints += dt * (24 + metrics.driftAgility * 18);
      if (!wasDrifting) {
        events.driftChirp = true;
      }
    } else {
      state.driftAngleDeg += (0 - state.driftAngleDeg) * Math.min(1, dt * 12);
    }

    // Road Curb Bumpers at lateralOffsetFeet in [-13, +13]
    if (Math.abs(state.lateralOffsetFeet) > 13.0) {
      const sign = Math.sign(state.lateralOffsetFeet);
      state.lateralOffsetFeet = sign * 13.0;
      state.lateralVelFtS = -sign * Math.abs(state.lateralVelFtS) * 0.45;
      state.speedFtS = Math.max(14, state.speedFtS * 0.96);
      state.mph = state.speedFtS * 0.681818;
      state.sparkIntensity = Math.max(state.sparkIntensity, 0.5);
    }

    // 4. Chassis Body Roll Angle & Two-Wheel Tilt / Critical Rollover Physics
    // Centrifugal force in turns + rapid steering creates roll torque proportional to h_CG / T_w
    const ssfInverse = 1 / Math.max(0.65, metrics.staticStabilityFactor);
    const netLateralG =
      (steerAccelFtS2 * 0.56 - centrifugalPushFtS2 * 0.68) / gFtS2;
    const stiffnessReduction = 1 / (1 + metrics.antiRollStiffness * 1.15);
    // Sliding sideways in a drift relieves lateral tire trip bind
    const driftRollRelief = state.isDrifting ? 0.76 : 1.0;
    const targetRollDeg = clamp(
      -netLateralG * 27 * ssfInverse * stiffnessReduction * driftRollRelief,
      -50,
      50
    );

    // Second-order spring-damper roll response with progressive counter-steer recovery
    const isCounterOrEasing =
      Math.abs(state.steerInput) < 0.15 ||
      Math.sign(targetRollDeg) !== Math.sign(state.rollDeg);
    const rollSpring = isCounterOrEasing ? 38 : 28;
    const rollDamp = isCounterOrEasing ? 9.2 : 6.8;
    const rollAccel =
      (targetRollDeg - state.rollDeg) * rollSpring - state.rollVelDegS * rollDamp;
    state.rollVelDegS += rollAccel * dt;

    // When past the 18° Two-Wheel Tilt Warning, progressive bump-stop resistance limits outward roll rate
    // so the player has ~0.75s of fair reaction time to counter-steer or ease off before criticalRolloverDeg!
    if (
      Math.abs(state.rollDeg) >= 17.5 &&
      Math.sign(state.rollVelDegS) === Math.sign(state.rollDeg)
    ) {
      state.rollVelDegS = clamp(state.rollVelDegS, -21, 21);
    }

    state.rollDeg += state.rollVelDegS * dt;

    // Cobblestone high-frequency suspension chatter
    if (state.onCobblestone) {
      const chatterAmp = (1 - metrics.roughTerrainRating * 0.78) * 0.38;
      state.suspensionCompression = clamp(
        0.18 + Math.abs(Math.sin(state.sFeet * 1.4)) * chatterAmp,
        0,
        0.95
      );
    }

    // Check Two-Wheel Tilt Warning (|rollDeg| > 18 deg)
    const prevWarning = state.rollWarning;
    state.rollWarning = Math.abs(state.rollDeg) > 18;
    if (state.rollWarning && !prevWarning) {
      setBanner(
        state,
        '⚠️ TWO-WHEEL TILT! Counter-Steer or Ease Off to Prevent Rollover!',
        'warn',
        1.8
      );
    }

    // Check Critical Rollover Threshold (32°..45° based on rolloverStabilityIndex)
    if (
      Math.abs(state.rollDeg) >= metrics.criticalRolloverDeg &&
      state.airborneHeightFeet <= 0.5
    ) {
      state.isRolledOver = true;
      state.rollDeg = Math.sign(state.rollDeg) * 95;
      state.sparkIntensity = 1.0;
      state.phase = 'finished';
      state.phaseTime = 0;
      spawnRolloverDebris(state);
      setBanner(
        state,
        `💥 ROLLED OVER AT ${Math.round(Math.abs(metrics.criticalRolloverDeg))}° IN ${state.sectionName.toUpperCase()}!`,
        'danger',
        4.0
      );
      state.judgeScores = finalizeSoapboxJudgeScorecard(
        state,
        metrics,
        bestRecordFeet,
        bestTimeSec
      );
      events.rolledOver = true;
      events.finishedRun = true;
      return events;
    }

    // 5. Airborne Kicker Jumps & Suspension Landing Compression / Bottoming-Out
    if (state.airborneHeightFeet > 0 || state.verticalVelFtS > 0) {
      state.airborneHeightFeet += state.verticalVelFtS * dt;
      state.verticalVelFtS -= gFtS2 * dt;
      state.suspensionCompression = Math.max(0, state.suspensionCompression - dt * 3);

      if (state.airborneHeightFeet <= 0) {
        const impactVel = Math.abs(state.verticalVelFtS);
        state.airborneHeightFeet = 0;
        state.verticalVelFtS = 0;

        // Compute landing suspension compression (0..1.3) relative to suspensionTravelMeters
        // Oak blocks (0.05m) bottom out (> 1.0), Leaf springs (0.16m) absorb cleanly (~0.75),
        // and Pogo / Coilover shocks (0.28..0.34m) cushion plushly (< 0.60) with a landing speed pump!
        const rawCompression =
          (impactVel / 22.5) * (0.135 / Math.max(0.06, metrics.suspensionTravelMeters));
        state.suspensionCompression = clamp(rawCompression, 0.25, 1.3);

        if (state.suspensionCompression > 1.0) {
          // CHASSIS BOTTOMED OUT! Sparks + speed loss + structural damage
          state.bottomedOutCount += 1;
          state.sparkIntensity = 1.0;
          state.speedFtS = Math.max(15, state.speedFtS * 0.78);
          state.mph = state.speedFtS * 0.681818;
          const damage = Math.round(18 * (100 / Math.max(45, metrics.structuralToughness)));
          state.structuralIntegrity = Math.max(0, state.structuralIntegrity - damage);
          events.bottomedOut = true;
          setBanner(
            state,
            '💥 SUSPENSION BOTTOMED OUT! Sparks & Speed Loss — Upgrade Shocks!',
            'danger',
            2.4
          );

          if (state.structuralIntegrity <= 0) {
            state.distanceFeet = Math.min(
              SOAPBOX_COURSE_LENGTH_FEET,
              Math.max(0, Math.floor(state.sFeet))
            );
            state.phase = 'finished';
            state.phaseTime = 0;
            spawnRolloverDebris(state);
            setBanner(
              state,
              `💥 CHASSIS SHATTERED ON JUMP LANDING AT ${state.distanceFeet} FT!`,
              'danger',
              4.0
            );
            state.judgeScores = finalizeSoapboxJudgeScorecard(
              state,
              metrics,
              bestRecordFeet,
              bestTimeSec
            );
            events.finishedRun = true;
            return events;
          }
        } else if (state.suspensionCompression < 0.62) {
          state.speedFtS = Math.min(92, state.speedFtS + 3.0);
          state.mph = state.speedFtS * 0.681818;
          state.maxSpeedMph = Math.max(state.maxSpeedMph, state.mph);
          state.driftStylePoints += 35;
          setBanner(
            state,
            '⚡ PRO COILOVER LANDING PUMP! +3 FT/S BOOST & +35 STYLE!',
            'good',
            2.1
          );
        } else {
          state.driftStylePoints += 25;
          setBanner(
            state,
            '🦘 PLUSH JUMP LANDING! Shocks Absorbed the Impact! +25 Style!',
            'good',
            2.1
          );
        }
      }
    } else {
      // Relax suspension compression smoothly back to rest
      state.suspensionCompression = Math.max(
        0,
        state.suspensionCompression - dt * 2.6
      );
    }

    // 6. Advance Along Course & Check Obstacles
    const prevS = state.sFeet;
    state.sFeet += state.speedFtS * dt;
    state.distanceFeet = Math.min(
      SOAPBOX_COURSE_LENGTH_FEET,
      Math.max(0, Math.floor(state.sFeet))
    );

    for (const obs of state.obstacles) {
      if (obs.triggered) continue;

      const obsStart = obs.sFeet - obs.lengthFeet * 0.5;
      const obsEnd = obs.sFeet + obs.lengthFeet * 0.5;
      const crossedS = state.sFeet >= obsStart && prevS <= obsEnd;
      if (!crossedS) continue;

      const latDist = Math.abs(state.lateralOffsetFeet - obs.lateralCenterFeet);

      if (obs.type === 'hay_bale') {
        if (latDist <= obs.halfWidthFeet + 1.4 && state.airborneHeightFeet < 2.2) {
          obs.triggered = true;
          state.hayBalesHit += 1;
          events.hayBaleHit = true;

          // Cowcatcher Steel Hay-Plow reduces slowdown & damage by up to 60%!
          const protection = metrics.hayPlowProtection;
          const speedRetained = 0.62 + protection * 0.26;
          state.speedFtS = Math.max(14, state.speedFtS * speedRetained);
          state.mph = state.speedFtS * 0.681818;
          const baseDmg = 24 * (1 - protection * 0.65);
          const scaledDmg = Math.round(
            baseDmg * (80 / Math.max(45, metrics.structuralToughness))
          );
          state.structuralIntegrity = Math.max(0, state.structuralIntegrity - scaledDmg);

          // Spawn golden flying straw burst event for 3D particle system
          state.hayBursts.push({
            id: Date.now() + state.hayBalesHit,
            sFeet: obs.sFeet,
            lateralFeet: obs.lateralCenterFeet,
            createdAt: state.elapsedRaceTimeSec,
          });

          setBanner(
            state,
            protection >= 0.5
              ? '🛡️ HAY-PLOW SMASHED THROUGH BALES! Minimal Speed Lost!'
              : '🌾 SMASHED HAY BALES! Speed & Hull Integrity Lost!',
            protection >= 0.5 ? 'warn' : 'danger',
            2.0
          );

          if (state.structuralIntegrity <= 0) {
            state.phase = 'finished';
            state.phaseTime = 0;
            spawnRolloverDebris(state);
            setBanner(
              state,
              `💥 SOAPBOX WRECKED IN HAY CHICANE AT ${state.distanceFeet} FT!`,
              'danger',
              4.0
            );
            state.judgeScores = finalizeSoapboxJudgeScorecard(
              state,
              metrics,
              bestRecordFeet,
              bestTimeSec
            );
            events.finishedRun = true;
            return events;
          }
        }
      } else if (obs.type === 'water_slick') {
        if (latDist <= obs.halfWidthFeet + 1.2 && state.airborneHeightFeet < 0.5) {
          obs.triggered = true;
          // Off-road knobby tires reduce soapy slick duration
          state.inWaterSlickTimer = 1.65 * (1 - metrics.roughTerrainRating * 0.45);
          state.rollVelDegS += (state.lateralOffsetFeet >= 0 ? 1 : -1) * 42;
          events.waterSlickEntered = true;
          setBanner(
            state,
            '🫧 SOAPY WATER SLICK! Lateral Tire Grip Cut by 60% — Counter-Steer!',
            'warn',
            2.1
          );
        }
      } else if (obs.type === 'kicker_jump') {
        if (latDist <= obs.halfWidthFeet + 1.2 && state.airborneHeightFeet <= 0.2) {
          obs.triggered = true;
          state.jumpsCompleted += 1;
          state.verticalVelFtS = clamp(14.5 + state.speedFtS * 0.16, 16, 26);
          state.airborneHeightFeet = 0.35;
          state.driftStylePoints += 30;
          events.kickerLaunched = true;
          setBanner(
            state,
            `🚀 LAUNCHED OFF TIMBER KICKER RAMP #${state.jumpsCompleted}!`,
            'good',
            2.1
          );
        }
      } else if (obs.type === 'speed_gate') {
        if (latDist <= obs.halfWidthFeet) {
          obs.triggered = true;
          state.speedGatesCleared += 1;
          state.speedFtS = Math.min(92, state.speedFtS + 6.0);
          state.mph = state.speedFtS * 0.681818;
          state.maxSpeedMph = Math.max(state.maxSpeedMph, state.mph);
          state.driftStylePoints += 25;
          events.speedGateCleared = true;
          setBanner(
            state,
            '⚡ THREADED SPEED GATE! +6 FT/S BOOST & +25 STYLE!',
            'good',
            1.9
          );
        }
      }
    }

    // 7. Check Course Completion at 1,000-Ft Checkered Finish Arch!
    if (state.sFeet >= SOAPBOX_COURSE_LENGTH_FEET) {
      state.sFeet = SOAPBOX_COURSE_LENGTH_FEET;
      state.distanceFeet = SOAPBOX_COURSE_LENGTH_FEET;
      state.completedCourse = true;
      state.phase = 'finished';
      state.phaseTime = 0;
      setBanner(
        state,
        `🏁 CROSSED THE 1,000-FT FINISH ARCH IN ${state.elapsedRaceTimeSec.toFixed(1)}s!`,
        'good',
        4.0
      );
      state.judgeScores = finalizeSoapboxJudgeScorecard(
        state,
        metrics,
        bestRecordFeet,
        bestTimeSec
      );
      events.finishedRun = true;
    }

    return events;
  }

  // ============================================================================
  // PHASE 4: FINISHED / POST-FINISH CELEBRATION ROLL-OUT
  // ============================================================================
  if (state.phase === 'finished') {
    if (state.completedCourse && !state.isRolledOver) {
      // Gentle celebratory coasting through the finish apron
      state.speedFtS = Math.max(0, state.speedFtS - 28 * dt);
      state.mph = state.speedFtS * 0.681818;
      state.sFeet = Math.min(1085, state.sFeet + state.speedFtS * dt);
      state.rollDeg *= Math.max(0, 1 - dt * 6);
      state.driftAngleDeg *= Math.max(0, 1 - dt * 6);
    }
  }

  return events;
}
