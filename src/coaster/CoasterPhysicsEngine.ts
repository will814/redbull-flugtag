import { CoasterMetrics } from './CoasterMetrics';

export const COASTER_TRACK_LENGTH_FEET = 2000;
export const BULLSEYE_START_FEET = 1865;
export const BULLSEYE_CENTER_FEET = 1910;
export const BULLSEYE_END_FEET = 1955;
export const GAP_START_FEET = 1270;
export const GAP_END_FEET = 1302;
export const LAGOON_START_FEET = 1425;
export const LAGOON_END_FEET = 1575;

export type CoasterElementId =
  | 'station_launch'
  | 'vertical_loop'
  | 'banked_helix'
  | 'camelback_hills'
  | 'rail_gap_jump'
  | 'lagoon_splash'
  | 'whip_chicane'
  | 'brake_run';

export interface CoasterTrackSample {
  sFeet: number;
  /** World 3D position in feet: X = forward, Y = elevation, Z = lateral */
  xFeet: number;
  yFeet: number;
  zFeet: number;
  /** World 3D position in scene meters (1 ft = 0.3048 m, shifted so station is near origin) */
  xMeters: number;
  yMeters: number;
  zMeters: number;
  /** Orthonormal track tangent T(s) */
  tx: number;
  ty: number;
  tz: number;
  /** Orthonormal track normal N(s) (points from rails toward rider head, including bank & loop inversion) */
  nx: number;
  ny: number;
  nz: number;
  /** Orthonormal track lateral binormal B(s) = T x N (points toward right rail) */
  bx: number;
  by: number;
  bz: number;
  /** Explicit track banking angle in radians and degrees */
  bankRad: number;
  bankDeg: number;
  /** Normal curvature (1/m) along N and lateral curvature (1/m) along B */
  curvatureNormal: number;
  curvatureLateral: number;
  /** Track segment metadata */
  elementId: CoasterElementId;
  elementName: string;
  elementEmoji: string;
  elementCallout: string;
  isBrokenRailGap: boolean;
  isLagoonSplash: boolean;
  isBullseyeZone: boolean;
  isBrakeRun: boolean;
}

export type CoasterRidePhase =
  | 'station_countdown'
  | 'riding'
  | 'gap_airborne'
  | 'derailed'
  | 'completed';

export type CoasterOutcomeReason =
  | 'bullseye_stop'
  | 'brake_run_stop'
  | 'overshoot_bumper'
  | 'upstop_airtime_liftoff'
  | 'lateral_helix_derail'
  | 'gap_jump_miss'
  | 'loop_rollback'
  | 'stalled_mid_track';

export interface CoasterCheckpointAward {
  id: string;
  title: string;
  emoji: string;
  points: number;
  sFeet: number;
}

export interface CoasterPhysicsState {
  phase: CoasterRidePhase;
  sFeet: number;
  maxDistanceFeet: number;
  /** Forward speed along track in m/s and MPH */
  speedMps: number;
  speedMph: number;
  peakSpeedMph: number;
  /** Countdown timer in station (3.0 -> 0.0 s) */
  countdownSec: number;
  /** LIM launch charge (0..100%) accumulated by tapping BOOST during station countdown */
  limChargePct: number;
  /** Mid-course KERS / Kinetic Boost charge (0..100%) */
  kersChargePct: number;
  kersBoostActiveTimer: number;
  /** Live G-Forces felt by riders */
  verticalG: number;
  lateralG: number;
  peakPositiveG: number;
  peakNegativeG: number;
  peakLateralG: number;
  /** Accumulated airtime duration (seconds spent at G_normal <= 0.15G) */
  airtimeSeconds: number;
  /** Car roll offset relative to track bank (degrees) & angular velocity */
  carRollOffsetDeg: number;
  carRollVelDegPerSec: number;
  /** Bogie & upstop structural stress (0..100%) */
  bogieStressPct: number;
  /** Ballistic 3D position & velocity (in scene meters) used during Broken Rail Gap Jump or Derailment */
  worldX: number;
  worldY: number;
  worldZ: number;
  velX: number;
  velY: number;
  velZ: number;
  airborneTimeSec: number;
  /** Scoring & event tracking */
  loopCleared: boolean;
  helixCleared: boolean;
  camelbacksCleared: boolean;
  gapJumpCleared: boolean;
  lagoonSkimSeconds: number;
  stoppedInBullseye: boolean;
  bullseyePrecisionPct: number;
  checkpoints: CoasterCheckpointAward[];
  latestBannerText: string;
  latestBannerEmoji: string;
  bannerTimerSec: number;
  outcomeReason: CoasterOutcomeReason | null;
  outcomeTitle: string;
  outcomeSubtitle: string;
  elapsedRideSec: number;
}

const FEET_TO_METERS = 0.3048;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Smooth bell pulse between [a, b] peaking at 1.0 in the middle */
function bellPulse(s: number, a: number, b: number): number {
  if (s <= a || s >= b) return 0;
  const u = (s - a) / (b - a);
  return Math.pow(Math.sin(Math.PI * u), 2);
}

/**
 * Computes raw 3D coordinates (xFeet, yFeet, zFeet), explicit loop angle (0..2pi),
 * and explicit banking angle (degrees) for arc position sFeet in [0, 2000].
 */
function computeRawTrackGeometry(sRaw: number): {
  xFeet: number;
  yFeet: number;
  zFeet: number;
  loopThetaRad: number;
  bankDeg: number;
} {
  const s = clamp(sRaw, 0, COASTER_TRACK_LENGTH_FEET);

  // ---------------------------------------------------------------------------
  // 1. Forward X(s) and Vertical Loop progression
  //Between s = 230 and s = 470 (span = 240 ft), the track executes a true 360-deg
  // vertical clothoid loop (radius = 37.5 ft, height = 75 ft).
  // ---------------------------------------------------------------------------
  const loopStart = 230;
  const loopEnd = 470;
  const loopSpan = loopEnd - loopStart; // 240 ft
  const loopRadius = 37.5; // 75 ft tall loop!

  let xFeet = 0;
  let loopThetaRad = 0;

  if (s <= loopStart) {
    xFeet = s;
  } else if (s < loopEnd) {
    const u = (s - loopStart) / loopSpan; // 0..1
    // Smooth clothoid-like angle progression so entry and exit curvature blend smoothly
    loopThetaRad = 2 * Math.PI * u - 0.18 * Math.sin(2 * Math.PI * u);
    // Forward X traces loop circle + 24 ft net forward shift across the loop
    xFeet = loopStart + loopRadius * Math.sin(loopThetaRad) + 24 * u;
  } else {
    xFeet = loopStart + 24 + (s - loopEnd);
  }

  // ---------------------------------------------------------------------------
  // 2. Elevation Y(s) in feet
  // ---------------------------------------------------------------------------
  let yFeet = 42; // Boarding station height (42 ft)

  if (s < 230) {
    // 0..55 ft: Level Boarding Station & LIM Launch Track at y = 42 ft
    // 55..112 ft: Steep Top-Hat Climb up to y = 105 ft!
    // 112..215 ft: Plunging 65-deg First Drop from 105 ft down to y = 12 ft valley!
    // 215..230 ft: Level compression into the Vertical Loop entry at y = 12 ft
    const climbUp = smoothstep(52, 112, s);
    const dropDown = smoothstep(112, 212, s);
    yFeet = 42 + 63 * climbUp - 93 * dropDown;
  } else if (s < 470) {
    // 230..470 ft: 75-Ft 360-deg Vertical Clothoid Loop!
    // Bottom at y = 12 ft, Apex at y = 12 + 75 = 87 ft!
    yFeet = 12 + loopRadius * (1 - Math.cos(loopThetaRad));
  } else if (s < 900) {
    // 470..900 ft: Loop exit pullout (y = 12 ft) -> Rising Banked Helix (peaks at y = 46 ft) -> exits at y = 16 ft
    const toHelixBase = smoothstep(470, 540, s);
    const helixWave = bellPulse(s, 540, 890);
    yFeet = 12 + 4 * toHelixBase + 30 * helixWave;
  } else if (s < 1220) {
    // 900..1220 ft: Double Camelback Ejector Airtime Hills!
    // Hill 1 peaks at s = 985 ft (y = 58 ft), valley at s = 1060 ft (y = 14 ft), Hill 2 peaks at s = 1135 ft (y = 52 ft), exits at y = 16 ft
    const hill1 = bellPulse(s, 910, 1060);
    const hill2 = bellPulse(s, 1060, 1210);
    yFeet = 16 + 42 * hill1 + 36 * hill2;
  } else if (s < 1380) {
    // 1220..1380 ft: Broken Rail / 32-Ft Track Gap Jump!
    // Kicker ramp rises from 16 ft to 28 ft at s = 1270, arcs across [1270..1302] peaking at ~31.5 ft, catches at 1302 ft (y = 26.5 ft), descends to 6 ft by 1380
    const rampProfile = bellPulse(s, 1220, 1365);
    const postLandingDrop = smoothstep(1310, 1380, s);
    yFeet = 16 + 15.5 * rampProfile - 10 * postLandingDrop;
  } else if (s < 1620) {
    // 1380..1620 ft: Rockwork Tunnel & Lagoon Water-Splash Skim!
    // Dives down to y = 4.0 ft across [1425..1575] ft, then climbs back to y = 16 ft at 1620 ft
    const intoLagoon = smoothstep(1380, 1425, s);
    const outLagoon = smoothstep(1570, 1620, s);
    yFeet = 6 - 2.0 * intoLagoon + 12.0 * outLagoon;
  } else if (s < 1800) {
    // 1620..1800 ft: Overbanked Whip S-Curve Chicane (undulates between 16 ft and 24 ft, exiting at 18 ft)
    const chicaneHill = bellPulse(s, 1630, 1785);
    const toBrakeLevel = smoothstep(1740, 1800, s);
    yFeet = 16 + 8 * chicaneHill + 2 * toBrakeLevel;
  } else {
    // 1800..2000 ft: Level Final Eddy-Current Magnetic Brake Run & Golden Station Bullseye at y = 18 ft
    yFeet = 18;
  }

  // ---------------------------------------------------------------------------
  // 3. Lateral Z(s) in feet
  // ---------------------------------------------------------------------------
  let zFeet = 0;
  // Across the Vertical Loop (230..470 ft), shift Z smoothly from 0 to +8 ft so the exit rail passes beside the entry rail!
  const loopZShift = 8 * smoothstep(230, 470, s);
  // Sweeping 3D Banked Helix Turn (540..900 ft): curves out to Z = +85 ft and back!
  const helixZ = 77 * bellPulse(s, 535, 900);
  // Overbanked Whip S-Curve Chicane (1620..1800 ft): weaves left (-24 ft) then right (+22 ft)
  let chicaneZ = 0;
  if (s > 1615 && s < 1805) {
    const u = (s - 1615) / (1805 - 1615);
    chicaneZ = -24 * Math.sin(2 * Math.PI * u) * Math.sin(Math.PI * u);
  }
  zFeet = loopZShift + helixZ + chicaneZ;

  // ---------------------------------------------------------------------------
  // 4. Explicit Track Banking Angle bankDeg(s)
  // ---------------------------------------------------------------------------
  let bankDeg = 0;
  // Sweeping Banked Helix (540..900 ft): banks up to +50 deg into the turn
  bankDeg += 50 * bellPulse(s, 545, 895);
  // Overbanked Whip S-Curve Chicane (1620..1800 ft): rapid +45 deg to -45 deg whip!
  if (s > 1620 && s < 1800) {
    const u = (s - 1620) / (1800 - 1620);
    bankDeg += 46 * Math.sin(2 * Math.PI * u) * Math.sin(Math.PI * u);
  }

  return {
    xFeet,
    yFeet,
    zFeet,
    loopThetaRad,
    bankDeg,
  };
}

function getElementMetadata(sFeet: number): {
  elementId: CoasterElementId;
  elementName: string;
  elementEmoji: string;
  elementCallout: string;
} {
  if (sFeet < 160) {
    return {
      elementId: 'station_launch',
      elementName: '105-Ft Top-Hat LIM Launch',
      elementEmoji: '⚡',
      elementCallout: 'TAP BOOST TO SURGE OVER THE 105-FT TOP-HAT!',
    };
  }
  if (sFeet < 540) {
    return {
      elementId: 'vertical_loop',
      elementName: '75-Ft 360° Vertical Loop',
      elementEmoji: '🔄',
      elementCallout: 'VERTICAL LOOP! KEEP SPEED > 38 MPH FOR +5G INVERSION!',
    };
  }
  if (sFeet < 900) {
    return {
      elementId: 'banked_helix',
      elementName: '50° Sweeping Banked Helix',
      elementEmoji: '🌀',
      elementCallout: 'HOLD [D / LEAN RIGHT] INTO THE 50° HELIX TO CANCEL LATERAL Gs!',
    };
  }
  if (sFeet < 1220) {
    return {
      elementId: 'camelback_hills',
      elementName: 'Double Camelback Airtime Hills',
      elementEmoji: '⛰️',
      elementCallout: 'EJECTOR AIRTIME HILLS! WATCH NEGATIVE Gs ON UPSTOP WHEELS!',
    };
  }
  if (sFeet < 1380) {
    return {
      elementId: 'rail_gap_jump',
      elementName: '32-Ft Broken Rail Gap Jump',
      elementEmoji: '⚠️',
      elementCallout: 'BROKEN RAIL GAP AHEAD! KEEP ROLL LEVEL (±24°) IN MID-AIR!',
    };
  }
  if (sFeet < 1620) {
    return {
      elementId: 'lagoon_splash',
      elementName: 'Lagoon Water-Splash Trench',
      elementEmoji: '🌊',
      elementCallout: 'LAGOON WATER SKIM! COOLING BOGIES & SCORING SPLASH PTS!',
    };
  }
  if (sFeet < 1800) {
    return {
      elementId: 'whip_chicane',
      elementName: 'Overbanked Whip S-Curve',
      elementEmoji: '🐍',
      elementCallout: 'WHIP CHICANE! SNAP LEAN LEFT & RIGHT WITH THE TRACK!',
    };
  }
  return {
    elementId: 'brake_run',
    elementName: 'Golden Bullseye Brake Run',
    elementEmoji: '🎯',
    elementCallout: 'HOLD MAGNET BRAKES TO PARK INSIDE THE 🟢 GOLDEN BULLSEYE (1,865–1,955 FT)!',
  };
}

/**
 * Evaluates the exact 3D parametric rollercoaster spline at arc-length distance `sFeet` (0..2,000 ft).
 */
export function evaluateCoasterTrack(sFeetInput: number): CoasterTrackSample {
  const safeInput = Number.isFinite(sFeetInput) ? sFeetInput : 0;
  const s = clamp(safeInput, 0, COASTER_TRACK_LENGTH_FEET);
  const ds = 0.5;
  const sPrev = clamp(s - ds, 0, COASTER_TRACK_LENGTH_FEET);
  const sNext = clamp(s + ds, 0, COASTER_TRACK_LENGTH_FEET);

  const cur = computeRawTrackGeometry(s);
  const prev = computeRawTrackGeometry(sPrev);
  const next = computeRawTrackGeometry(sNext);

  // Tangent T(s)
  let tx = next.xFeet - prev.xFeet;
  let ty = next.yFeet - prev.yFeet;
  let tz = next.zFeet - prev.zFeet;
  const tLen = Math.hypot(tx, ty, tz) || 1;
  tx /= tLen;
  ty /= tLen;
  tz /= tLen;

  // Reference Up vector N_ref (rotates smoothly 360 deg inside the Vertical Loop so there is zero singularity!)
  const refUpX = -Math.sin(cur.loopThetaRad);
  const refUpY = Math.cos(cur.loopThetaRad);
  const refUpZ = 0;

  // Gram-Schmidt orthogonalize N_ref against T(s)
  const dotTN = tx * refUpX + ty * refUpY + tz * refUpZ;
  let n0x = refUpX - dotTN * tx;
  let n0y = refUpY - dotTN * ty;
  let n0z = refUpZ - dotTN * tz;
  const n0Len = Math.hypot(n0x, n0y, n0z) || 1;
  n0x /= n0Len;
  n0y /= n0Len;
  n0z /= n0Len;

  // Unbanked lateral binormal B0 = T x N0
  const b0x = ty * n0z - tz * n0y;
  const b0y = tz * n0x - tx * n0z;
  const b0z = tx * n0y - ty * n0x;

  // Apply explicit track banking angle phi_bank around T(s)
  const bankRad = (cur.bankDeg * Math.PI) / 180;
  const cosB = Math.cos(bankRad);
  const sinB = Math.sin(bankRad);

  const nx = n0x * cosB + b0x * sinB;
  const ny = n0y * cosB + b0y * sinB;
  const nz = n0z * cosB + b0z * sinB;

  const bx = -n0x * sinB + b0x * cosB;
  const by = -n0y * sinB + b0y * cosB;
  const bz = -n0z * sinB + b0z * cosB;

  // Compute wheelbase-smoothed second-derivative curvature vector dT/ds_meters
  const dsCurv = 3.5;
  const sBack = clamp(s - dsCurv, 0, COASTER_TRACK_LENGTH_FEET);
  const sFwd = clamp(s + dsCurv, 0, COASTER_TRACK_LENGTH_FEET);
  const prevPrev = computeRawTrackGeometry(sBack);
  const nextNext = computeRawTrackGeometry(sFwd);

  let t1x = cur.xFeet - prevPrev.xFeet;
  let t1y = cur.yFeet - prevPrev.yFeet;
  let t1z = cur.zFeet - prevPrev.zFeet;
  const t1L = Math.hypot(t1x, t1y, t1z) || 1;
  t1x /= t1L;
  t1y /= t1L;
  t1z /= t1L;

  let t2x = nextNext.xFeet - cur.xFeet;
  let t2y = nextNext.yFeet - cur.yFeet;
  let t2z = nextNext.zFeet - cur.zFeet;
  const t2L = Math.hypot(t2x, t2y, t2z) || 1;
  t2x /= t2L;
  t2y /= t2L;
  t2z /= t2L;

  const dsMeters = Math.max(0.5, (sFwd - sBack) * 0.5) * FEET_TO_METERS;
  const dTx = (t2x - t1x) / dsMeters;
  const dTy = (t2y - t1y) / dsMeters;
  const dTz = (t2z - t1z) / dsMeters;

  const curvatureNormal = dTx * nx + dTy * ny + dTz * nz;
  const curvatureLateral = dTx * bx + dTy * by + dTz * bz;

  const meta = getElementMetadata(s);

  return {
    sFeet: s,
    xFeet: cur.xFeet,
    yFeet: cur.yFeet,
    zFeet: cur.zFeet,
    xMeters: cur.xFeet * FEET_TO_METERS,
    yMeters: cur.yFeet * FEET_TO_METERS,
    zMeters: cur.zFeet * FEET_TO_METERS,
    tx,
    ty,
    tz,
    nx,
    ny,
    nz,
    bx,
    by,
    bz,
    bankRad,
    bankDeg: cur.bankDeg,
    curvatureNormal,
    curvatureLateral,
    elementId: meta.elementId,
    elementName: meta.elementName,
    elementEmoji: meta.elementEmoji,
    elementCallout: meta.elementCallout,
    isBrokenRailGap: s >= GAP_START_FEET && s <= GAP_END_FEET,
    isLagoonSplash: s >= LAGOON_START_FEET && s <= LAGOON_END_FEET,
    isBullseyeZone: s >= BULLSEYE_START_FEET && s <= BULLSEYE_END_FEET,
    isBrakeRun: s >= 1800,
  };
}

export function createInitialCoasterPhysicsState(): CoasterPhysicsState {
  const startSample = evaluateCoasterTrack(0);
  return {
    phase: 'station_countdown',
    sFeet: 0,
    maxDistanceFeet: 0,
    speedMps: 0,
    speedMph: 0,
    peakSpeedMph: 0,
    countdownSec: 2.6,
    limChargePct: 35,
    kersChargePct: 100,
    kersBoostActiveTimer: 0,
    verticalG: 1.0,
    lateralG: 0.0,
    peakPositiveG: 1.0,
    peakNegativeG: 0.0,
    peakLateralG: 0.0,
    airtimeSeconds: 0,
    carRollOffsetDeg: 0,
    carRollVelDegPerSec: 0,
    bogieStressPct: 0,
    worldX: startSample.xMeters,
    worldY: startSample.yMeters,
    worldZ: startSample.zMeters,
    velX: 0,
    velY: 0,
    velZ: 0,
    airborneTimeSec: 0,
    loopCleared: false,
    helixCleared: false,
    camelbacksCleared: false,
    gapJumpCleared: false,
    lagoonSkimSeconds: 0,
    stoppedInBullseye: false,
    bullseyePrecisionPct: 0,
    checkpoints: [],
    latestBannerText: 'TAP BOOST REPEATEDLY TO CHARGE LIM LAUNCH COILS!',
    latestBannerEmoji: '⚡',
    bannerTimerSec: 3.0,
    outcomeReason: null,
    outcomeTitle: '',
    outcomeSubtitle: '',
    elapsedRideSec: 0,
  };
}

/**
 * Triggered when player presses SPACE / W / Up / BOOST button.
 * - During station countdown: charges the LIM capacitor bank (+18% per tap) and can trigger immediate launch when countdown < 0.7s!
 * - During riding: fires the Kinetic KERS / LIM Overdrive booster if KERS >= 25%!
 */
export function triggerCoasterActionTap(
  state: CoasterPhysicsState,
  metrics: CoasterMetrics
): { type: 'lim_charge' | 'lim_launch_perfect' | 'kers_boost' | 'none' } {
  if (state.phase === 'station_countdown') {
    state.limChargePct = clamp(state.limChargePct + 18, 0, 100);
    if (state.countdownSec <= 0.65) {
      // Green-light overdrive launch!
      const launchSpeedMps =
        19.5 +
        (state.limChargePct / 100) * 6.0 +
        (metrics.launchBoostPower / 100) * 5.0;
      state.phase = 'riding';
      state.countdownSec = 0;
      state.speedMps = launchSpeedMps;
      state.speedMph = launchSpeedMps * 2.23694;
      state.peakSpeedMph = Math.max(state.peakSpeedMph, state.speedMph);
      state.kersBoostActiveTimer = 0.65;
      state.latestBannerText = 'PERFECT GREEN-LIGHT LIM OVERDRIVE LAUNCH!';
      state.latestBannerEmoji = '🚀';
      state.bannerTimerSec = 2.4;
      return { type: 'lim_launch_perfect' };
    }
    return { type: 'lim_charge' };
  }

  if (state.phase === 'riding' && state.kersChargePct >= 25 && state.kersBoostActiveTimer <= 0.1) {
    state.kersChargePct = Math.max(0, state.kersChargePct - 45);
    state.kersBoostActiveTimer = 1.15;
    const impulseMps = 2.8 + (metrics.launchBoostPower / 100) * 3.2;
    state.speedMps = Math.min(43, state.speedMps + impulseMps);
    state.speedMph = state.speedMps * 2.23694;
    state.peakSpeedMph = Math.max(state.peakSpeedMph, state.speedMph);
    state.latestBannerText = 'KINETIC KERS BOOST ENGAGED!';
    state.latestBannerEmoji = '⚡';
    state.bannerTimerSec = 1.6;
    return { type: 'kers_boost' };
  }

  return { type: 'none' };
}

function awardCheckpointOnce(
  state: CoasterPhysicsState,
  id: string,
  title: string,
  emoji: string,
  points: number,
  sFeet: number
): void {
  if (state.checkpoints.some((c) => c.id === id)) return;
  state.checkpoints.push({ id, title, emoji, points, sFeet: Math.round(sFeet) });
  state.latestBannerText = `${title} (+${points} PTS)`;
  state.latestBannerEmoji = emoji;
  state.bannerTimerSec = 2.2;
}

/**
 * Steps the 120Hz rollercoaster physics simulation by `dt` seconds.
 */
export function stepCoasterPhysics(
  state: CoasterPhysicsState,
  metrics: CoasterMetrics,
  controls: { leanInput: number; brakeInput: boolean },
  dtRaw: number
): void {
  const dt = Math.min(dtRaw, 0.025);
  if (state.phase === 'completed') return;

  if (state.bannerTimerSec > 0) {
    state.bannerTimerSec = Math.max(0, state.bannerTimerSec - dt);
  }

  // ---------------------------------------------------------------------------
  // PHASE 1: STATION COUNTDOWN & CAPACITOR CHARGING
  // ---------------------------------------------------------------------------
  if (state.phase === 'station_countdown') {
    state.countdownSec = Math.max(0, state.countdownSec - dt);
    const sample = evaluateCoasterTrack(state.sFeet);
    state.worldX = sample.xMeters;
    state.worldY = sample.yMeters;
    state.worldZ = sample.zMeters;

    if (state.countdownSec <= 0) {
      const launchSpeedMps =
        18.5 +
        (state.limChargePct / 100) * 5.5 +
        (metrics.launchBoostPower / 100) * 4.8;
      state.phase = 'riding';
      state.speedMps = launchSpeedMps;
      state.speedMph = launchSpeedMps * 2.23694;
      state.peakSpeedMph = Math.max(state.peakSpeedMph, state.speedMph);
      state.kersBoostActiveTimer = 0.45;
      state.latestBannerText = `LIM LAUNCH AT ${Math.round(state.speedMph)} MPH!`;
      state.latestBannerEmoji = '⚡';
      state.bannerTimerSec = 2.0;
    }
    return;
  }

  state.elapsedRideSec += dt;

  // ---------------------------------------------------------------------------
  // PHASE 2: DERAILED BALLISTIC TUMBLE
  // ---------------------------------------------------------------------------
  if (state.phase === 'derailed') {
    state.airborneTimeSec += dt;
    state.velY -= 9.81 * dt;
    state.worldX += state.velX * dt;
    state.worldY += state.velY * dt;
    state.worldZ += state.velZ * dt;
    state.carRollOffsetDeg += state.carRollVelDegPerSec * dt;

    if (state.worldY <= 0.6 || state.airborneTimeSec >= 1.65) {
      state.worldY = Math.max(0.4, state.worldY);
      state.phase = 'completed';
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // PHASE 3: MID-AIR BALLISTIC FLIGHT ACROSS THE 32-FT BROKEN RAIL GAP JUMP
  // ---------------------------------------------------------------------------
  if (state.phase === 'gap_airborne') {
    state.airborneTimeSec += dt;
    const prevS = state.sFeet;
    const dsFeet = (state.speedMps / FEET_TO_METERS) * dt;
    state.sFeet = Math.min(COASTER_TRACK_LENGTH_FEET, prevS + dsFeet);
    state.maxDistanceFeet = Math.max(state.maxDistanceFeet, state.sFeet);

    const sample = evaluateCoasterTrack(state.sFeet);
    // Ballistic arc above the theoretical spline gap
    const gapProgress = clamp(
      (state.sFeet - GAP_START_FEET) / (GAP_END_FEET - GAP_START_FEET),
      0,
      1
    );
    const jumpArcMeters = Math.sin(Math.PI * gapProgress) * 1.45;
    state.worldX = sample.xMeters;
    state.worldY = sample.yMeters + jumpArcMeters;
    state.worldZ = sample.zMeters;

    // Zero-G ballistic airtime in the gap!
    state.verticalG = 0.0;
    state.lateralG = 0.0;
    state.peakNegativeG = Math.min(state.peakNegativeG, 0.0);
    state.airtimeSeconds += dt;

    // Crosswind torque tries to roll the car in mid-air; player lean + gyro stabilizes it!
    const crosswindTorque = Math.sin(state.elapsedRideSec * 7.5) * 34;
    const gyroDamping = 2.6 + (metrics.gyroTiltAuthority / 100) * 4.6;
    const playerRollTorque = -controls.leanInput * (145 + metrics.gyroTiltAuthority * 0.8);
    state.carRollVelDegPerSec +=
      (crosswindTorque + playerRollTorque - state.carRollVelDegPerSec * gyroDamping) * dt;
    state.carRollOffsetDeg = clamp(
      state.carRollOffsetDeg + state.carRollVelDegPerSec * dt,
      -55,
      55
    );

    // Check landing at GAP_END_FEET (1,302 ft)
    if (state.sFeet >= GAP_END_FEET) {
      const rollError = Math.abs(state.carRollOffsetDeg);
      if (rollError > 24 || state.speedMph < 30) {
        // Missed the receiving rails!
        state.phase = 'derailed';
        state.airborneTimeSec = 0;
        state.velX = sample.tx * state.speedMps * 0.65;
        state.velY = 4.5;
        state.velZ = sample.tz * state.speedMps + (state.carRollOffsetDeg > 0 ? 6 : -6);
        state.carRollVelDegPerSec = state.carRollOffsetDeg > 0 ? 220 : -220;
        state.outcomeReason = 'gap_jump_miss';
        state.outcomeTitle = 'MISSED RECEIVING RAILS ON GAP JUMP!';
        state.outcomeSubtitle =
          rollError > 24
            ? `Landed crooked at ${Math.round(rollError)}° roll (must be within ±24°)! Use A/D Lean or an Active Gyro!`
            : `Entered the 32-ft Broken Rail Gap too slowly (${Math.round(state.speedMph)} MPH)!`;
        return;
      }

      // Clean re-lock onto receiving tubular steel rails!
      state.phase = 'riding';
      state.gapJumpCleared = true;
      state.carRollOffsetDeg *= 0.35;
      state.carRollVelDegPerSec = 0;
      const landingBonus = rollError < 7 ? 240 : 160;
      awardCheckpointOnce(
        state,
        'gap_jump',
        rollError < 7 ? 'PERFECT 32-FT RAIL GAP RE-LOCK!' : '32-FT BROKEN RAIL GAP CLEARED!',
        '⚠️',
        landingBonus,
        state.sFeet
      );
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // PHASE 4: RIDING ON THE 3D TUBULAR STEEL RAILS
  // ---------------------------------------------------------------------------
  const sample = evaluateCoasterTrack(state.sFeet);

  // Enter Broken Rail Gap at 1,270 ft
  if (sample.isBrokenRailGap && !state.gapJumpCleared) {
    state.phase = 'gap_airborne';
    state.airborneTimeSec = 0;
    state.latestBannerText = 'AIRBORNE OVER 32-FT BROKEN RAIL GAP! KEEP LEVEL!';
    state.latestBannerEmoji = '⚠️';
    state.bannerTimerSec = 1.6;
    return;
  }

  // Recharge KERS on downhill drops
  if (sample.ty < -0.12) {
    state.kersChargePct = clamp(state.kersChargePct + 18 * dt, 0, 100);
  }
  if (state.kersBoostActiveTimer > 0) {
    state.kersBoostActiveTimer = Math.max(0, state.kersBoostActiveTimer - dt);
  }

  // Tangential acceleration along the rail:
  // 1. Gravity component along track tangent (-g * T_y), with downhill potential-energy recovery
  const g = 9.81;
  const gravitySlopeFactor = sample.ty < 0 ? 1.18 : 0.96;
  let accelMps2 = -g * sample.ty * gravitySlopeFactor;

  // 2. Station LIM launch sustaining thrust (0..54 ft) & Top-Hat crest anti-rollback assist (54..115 ft)
  if (state.sFeet < 54) {
    accelMps2 += 6.2 + (metrics.launchBoostPower / 100) * 5.2;
  } else if (state.sFeet >= 54 && state.sFeet < 115 && state.speedMps < 14.5) {
    // Anti-rollback magnetic coil on top-hat climb so default/heavy trains clear the 105-ft peak smoothly
    accelMps2 += 13.5;
  }

  // 3. Active KERS kinetic boost surge (mid-course or post-launch)
  if (state.kersBoostActiveTimer > 0 && state.sFeet >= 115) {
    accelMps2 += 5.4 + (metrics.launchBoostPower / 100) * 4.0;
  }

  // 4. Low-friction polyurethane/steel rolling resistance & aerodynamic drag
  const aeroFactor = 0.00118 * (1.24 - (metrics.topSpeedScore / 100) * 0.45);
  const massMomentumBonus = clamp((metrics.totalMassLbs - 650) / 1400, -0.1, 0.22);
  const dragDecel =
    0.11 * (1.15 - (metrics.topSpeedScore / 100) * 0.35) +
    aeroFactor * state.speedMps * state.speedMps * (1 - massMomentumBonus);
  accelMps2 -= dragDecel;

  // 5. Lagoon water-splash hydrodynamic drag + bogie cooling (1,425..1,575 ft)
  if (sample.isLagoonSplash) {
    state.lagoonSkimSeconds += dt;
    state.bogieStressPct = Math.max(0, state.bogieStressPct - 32 * dt);
    accelMps2 -= 0.95;
    if (state.lagoonSkimSeconds >= 0.35) {
      awardCheckpointOnce(
        state,
        'lagoon_splash',
        'LAGOON WATER-SPLASH SKIM!',
        '🌊',
        180,
        state.sFeet
      );
    }
  }

  // 6. Player Eddy-Current Magnet Brakes (brakeInput) & Station Bullseye Stator Array
  if (controls.brakeInput) {
    const baseBrakeDecel = 7.2 + (metrics.brakePowerScore / 100) * 9.5;
    if (state.sFeet >= BULLSEYE_START_FEET) {
      // Inside or past the Golden Bullseye Stop Zone (1,865..2,000 ft): full park clamping down to 0 MPH!
      accelMps2 -= baseBrakeDecel * 1.18;
    } else if (state.sFeet >= 1790) {
      // Approach Trim Zone (1,790..1,865 ft): rapidly trims high speed down to a ~7.5 MPH station approach creep
      // so holding brakes at 1,800 ft glides right into the 1,865-ft Golden Bullseye instead of stopping short!
      if (state.speedMps > 3.4) {
        accelMps2 -= baseBrakeDecel * 1.15;
      } else {
        accelMps2 += (3.4 - state.speedMps) * 4.0;
      }
    } else {
      // Mid-course hill trim braking
      accelMps2 -= baseBrakeDecel * 0.68;
    }
  } else if (state.sFeet >= 1850) {
    // Gentle passive eddy-current drag on the final brake run (requires player braking to park in Bullseye!)
    accelMps2 -= 1.15;
  }

  // Integrate speed & position
  state.speedMps = Math.max(0, state.speedMps + accelMps2 * dt);

  // Prevent stalling on mid-course hills/flats unless on the Final Brake Run (s >= 1800 ft) or Loop Rollback
  if (state.sFeet < 1800 && state.sFeet > 480 && state.speedMps < 15.5 && !controls.brakeInput) {
    state.speedMps = 15.5;
  }

  state.speedMph = state.speedMps * 2.23694;
  state.peakSpeedMph = Math.max(state.peakSpeedMph, state.speedMph);

  const dsFeet = (state.speedMps / FEET_TO_METERS) * dt;
  state.sFeet = Math.min(COASTER_TRACK_LENGTH_FEET, state.sFeet + dsFeet);
  state.maxDistanceFeet = Math.max(state.maxDistanceFeet, state.sFeet);

  const newSample = evaluateCoasterTrack(state.sFeet);
  state.worldX = newSample.xMeters;
  state.worldY = newSample.yMeters;
  state.worldZ = newSample.zMeters;

  // ---------------------------------------------------------------------------
  // COMPUTE LIVE VERTICAL & LATERAL G-FORCES
  // ---------------------------------------------------------------------------
  // Clothoid-smoothed normal acceleration along track normal N(s): a_n = v^2 * kappa_eff + g * N_y
  const rawKappa = newSample.curvatureNormal;
  const effectiveCurvatureNormal =
    rawKappa < 0
      ? clamp(rawKappa * 0.56, -0.062, 0)
      : clamp(rawKappa * 0.35, 0, 0.038);
  const rawVerticalG =
    (state.speedMps * state.speedMps * effectiveCurvatureNormal + g * newSample.ny) / g;
  state.verticalG = clamp(Number(rawVerticalG.toFixed(2)), -2.6, 5.8);

  if (state.verticalG > state.peakPositiveG) state.peakPositiveG = state.verticalG;
  if (state.verticalG < state.peakNegativeG) state.peakNegativeG = state.verticalG;
  if (state.verticalG <= 0.15) {
    state.airtimeSeconds += dt;
  }

  // Proper lateral acceleration along track binormal B(s):
  // In the Banked Helix and Whip S-Curve, uncompensated lateral Gs build up unless the player leans!
  const rawTrackLatG =
    (state.speedMps * state.speedMps * newSample.curvatureLateral + g * newSample.by) / g;
  // Also add centrifugal demand from bank angle so leaning into the bank direction cancels lateral G!
  const targetLeanDir = Math.sign(newSample.bankDeg);
  const bankDemandG =
    Math.abs(newSample.bankDeg) > 12
      ? targetLeanDir * ((state.speedMps / 24.5) * (Math.abs(newSample.bankDeg) / 45) * 1.32)
      : rawTrackLatG;

  const gyroAssist = (metrics.gyroTiltAuthority / 100) * 0.55;
  const playerLeanCancel = controls.leanInput * 1.35;
  const effectiveLatG = (bankDemandG - playerLeanCancel) * (1 - gyroAssist);
  state.lateralG = clamp(Number(effectiveLatG.toFixed(2)), -3.2, 3.2);
  state.peakLateralG = Math.max(state.peakLateralG, Math.abs(state.lateralG));

  // Update visual car roll offset & bogie stress
  const desiredRollDeg = state.lateralG * 15 * (0.8 + metrics.comHeightMeters * 1.35);
  state.carRollOffsetDeg += (desiredRollDeg - state.carRollOffsetDeg) * Math.min(1, dt * 8);

  // ---------------------------------------------------------------------------
  // CHECKPOINTS & ELEMENT COMPLETIONS
  // ---------------------------------------------------------------------------
  if (!state.loopCleared && state.sFeet >= 475) {
    state.loopCleared = true;
    awardCheckpointOnce(
      state,
      'vertical_loop',
      '360° VERTICAL LOOP CONQUERED!',
      '🔄',
      220,
      state.sFeet
    );
  }
  if (!state.helixCleared && state.sFeet >= 895) {
    state.helixCleared = true;
    awardCheckpointOnce(
      state,
      'banked_helix',
      '50° BANKED HELIX CARVED!',
      '🌀',
      180,
      state.sFeet
    );
  }
  if (!state.camelbacksCleared && state.sFeet >= 1215) {
    state.camelbacksCleared = true;
    awardCheckpointOnce(
      state,
      'camelback_hills',
      'DOUBLE CAMELBACK AIRTIME HILLS CLEARED!',
      '⛰️',
      200,
      state.sFeet
    );
  }

  // ---------------------------------------------------------------------------
  // CHECK DERAILMENT & FAILURE MODES
  // ---------------------------------------------------------------------------
  // 1. Loop Rollback if entering the Vertical Loop apex way too slowly
  if (state.sFeet >= 285 && state.sFeet <= 415 && state.speedMps < 6.5) {
    state.phase = 'derailed';
    state.airborneTimeSec = 0;
    state.velX = -4.0;
    state.velY = -2.0;
    state.velZ = 2.5;
    state.carRollVelDegPerSec = 140;
    state.outcomeReason = 'loop_rollback';
    state.outcomeTitle = 'STALLED AT VERTICAL LOOP APEX!';
    state.outcomeSubtitle =
      'Lost momentum upside-down in the 75-ft Vertical Loop! Charge the LIM launch coils or release brakes earlier!';
    return;
  }

  // 2. Negative-G Upstop Clamp Failure (Ejector Liftoff on Camelback Airtime Hills!)
  if (
    newSample.elementId === 'camelback_hills' &&
    state.verticalG < metrics.maxSafeNegativeG
  ) {
    const excessNegG = Math.abs(state.verticalG - metrics.maxSafeNegativeG);
    state.bogieStressPct = clamp(state.bogieStressPct + excessNegG * 95 * dt, 0, 100);
    if (state.bogieStressPct >= 98 || state.verticalG < metrics.maxSafeNegativeG - 0.35) {
      state.phase = 'derailed';
      state.airborneTimeSec = 0;
      state.velX = newSample.tx * state.speedMps * 0.85;
      state.velY = 9.5; // Launches skyward off the camelback crest!
      state.velZ = newSample.tz * state.speedMps + 3.5;
      state.carRollVelDegPerSec = 190;
      state.outcomeReason = 'upstop_airtime_liftoff';
      state.outcomeTitle = 'NEGATIVE-G UPSTOP CLAMP BLOWOUT!';
      state.outcomeSubtitle = `Pulled ${state.verticalG.toFixed(1)}G over the Camelback Crest (exceeding your ${metrics.maxSafeNegativeG}G Upstop Clamp limit)! Equip Urethane Bogies or tap Magnet Brakes before the crest!`;
      return;
    }
  }

  // 3. Lateral G / High-CoG Helix Tipping Derailment
  if (Math.abs(state.lateralG) > metrics.maxSafeLateralG) {
    const excessLatG = Math.abs(state.lateralG) - metrics.maxSafeLateralG;
    state.bogieStressPct = clamp(state.bogieStressPct + excessLatG * 72 * dt, 0, 100);
    if (state.bogieStressPct >= 100) {
      state.phase = 'derailed';
      state.airborneTimeSec = 0;
      state.velX = newSample.tx * state.speedMps * 0.7;
      state.velY = 5.2;
      state.velZ = Math.sign(state.lateralG) * 9.5;
      state.carRollVelDegPerSec = Math.sign(state.lateralG) * 240;
      state.outcomeReason = 'lateral_helix_derail';
      state.outcomeTitle = 'LATERAL G HELIX DERAILMENT!';
      state.outcomeSubtitle = `Uncompensated ${Math.abs(state.lateralG).toFixed(1)}G lateral force ripped the bogies off the rail! Lean into the banked curve (A/D) or equip Gimbal Bogies / Active Gyro!`;
      return;
    }
  } else {
    // Gradually relax bogie stress when within safe envelope
    state.bogieStressPct = Math.max(0, state.bogieStressPct - 14 * dt);
  }

  // ---------------------------------------------------------------------------
  // FINAL EDDY-CURRENT BRAKE RUN & GOLDEN STATION BULLSEYE (1,800..2,000 FT)
  // ---------------------------------------------------------------------------
  if (state.sFeet >= 1800 && state.speedMps <= 0.35) {
    state.speedMps = 0;
    state.speedMph = 0;
    state.phase = 'completed';

    if (state.sFeet >= BULLSEYE_START_FEET && state.sFeet <= BULLSEYE_END_FEET) {
      state.stoppedInBullseye = true;
      const distFromCenter = Math.abs(state.sFeet - BULLSEYE_CENTER_FEET);
      const halfSpan = (BULLSEYE_END_FEET - BULLSEYE_START_FEET) / 2; // 45 ft
      state.bullseyePrecisionPct = clamp(
        Math.round((1 - distFromCenter / halfSpan) * 100),
        15,
        100
      );
      const bullseyePts = 200 + Math.round((state.bullseyePrecisionPct / 100) * 180);
      awardCheckpointOnce(
        state,
        'bullseye_stop',
        `🎯 GOLDEN BULLSEYE STOP (${state.bullseyePrecisionPct}% PRECISION)!`,
        '🎯',
        bullseyePts,
        state.sFeet
      );
      state.outcomeReason = 'bullseye_stop';
      state.outcomeTitle = '🎯 PARKED IN THE GOLDEN STATION BULLSEYE!';
      state.outcomeSubtitle = `Stopped at ${Math.round(state.sFeet)} ft (${state.bullseyePrecisionPct}% Bullseye Accuracy) after a ${Math.round(state.peakSpeedMph)} MPH thrill ride!`;
    } else {
      state.stoppedInBullseye = false;
      state.bullseyePrecisionPct = 0;
      state.outcomeReason = 'brake_run_stop';
      state.outcomeTitle = 'BRAKE RUN COMPLETE!';
      state.outcomeSubtitle =
        state.sFeet < BULLSEYE_START_FEET
          ? `Stopped early at ${Math.round(state.sFeet)} ft (Golden Bullseye starts at ${BULLSEYE_START_FEET} ft). Release brakes slightly to glide into the green zone!`
          : `Stopped past the Bullseye at ${Math.round(state.sFeet)} ft! Brake slightly earlier next run!`;
    }
    return;
  }

  // Overshot the 2,000-ft station bumper!
  if (state.sFeet >= 1990) {
    state.sFeet = 1995;
    state.speedMps = 0;
    state.speedMph = 0;
    state.phase = 'completed';
    state.stoppedInBullseye = false;
    state.outcomeReason = 'overshoot_bumper';
    state.outcomeTitle = 'SLAMMED INTO FOAM ARRESTOR BUMPER (1,995 FT)!';
    state.outcomeSubtitle =
      'Completed the full 2,000-ft coaster circuit, but came into the station too hot! Hold Magnet Brakes (S / Space) at 1,800 ft to stop in the Golden Bullseye!';
  }
}
