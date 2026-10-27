import {
  SOAPBOX_START_RAMP_FEET,
} from './SoapboxPartCatalog';
import { ComputedSoapboxMetrics } from './SoapboxMetrics';
import {
  SoapboxCourseId,
  SoapboxCourseDef,
  getSoapboxCourse,
} from './SoapboxCourses';

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

export type SoapboxDetachablePartSlot =
  | 'wheel_fl'
  | 'wheel_fr'
  | 'wheel_rl'
  | 'wheel_rr'
  | 'bumper'
  | 'topper';

export interface SoapboxPartDamageState {
  slot: SoapboxDetachablePartSlot;
  health: number; // 0.0 to 1.0 (1.0 = full health, 0.0 = broken/detached)
  isDetached: boolean;
  detachedAtS?: number;
}

export interface SoapboxDebrisItem {
  id: string;
  slot: SoapboxDetachablePartSlot;
  kind: SoapboxDetachablePartSlot; // backwards-compatible alias
  // Road-relative Frenet frame coordinates in feet:
  sFeet: number;          // longitudinal distance along track
  lateralFeet: number;    // lateral offset from centerline
  heightFeet: number;     // elevation above road surface
  // Linear velocities in ft/s:
  velSFtS: number;
  velLatFtS: number;
  velHeightFtS: number;
  // Rotation and angular velocities:
  rotation: { x: number; y: number; z: number };
  rotVel: { x: number; y: number; z: number };
  // Backwards-compatible Cartesian aliases:
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
  scale: number;
  lifeSeconds: number;
}

export type SoapboxDebrisPiece = SoapboxDebrisItem;

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
  damagePenalty?: number;
  partsLostCount?: number;
  wrecked?: boolean;
  courseId?: SoapboxCourseId;
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
  /** Active course ID */
  courseId?: SoapboxCourseId;
}

export interface SoapboxSimulationState {
  phase: SoapboxPhase;
  phaseTime: number;
  courseId: SoapboxCourseId;
  courseLengthFeet: number;
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
  debris: SoapboxDebrisItem[];
  hayBursts: SoapboxHayBurst[];
  sparkIntensity: number;
  judgeScores: SoapboxJudgeScorecard | null;

  // Destructible parts tracking & handling degradation
  parts: Record<SoapboxDetachablePartSlot, SoapboxPartDamageState>;
  attachedParts: Record<SoapboxDetachablePartSlot, boolean>;
  partHealth: Record<SoapboxDetachablePartSlot, number>;
  partsDetachedCount: number;
  isWrecked: boolean;
  wreckReason: string | null;
  steeringPullFtS2: number;
  pullYawRate: number;
  lostParts: Array<{ slot: SoapboxDetachablePartSlot; sFeet: number; reason: string }>;
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
  partDetached: SoapboxDetachablePartSlot | null;
  wrecked: boolean;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Evaluates the course road state at distance `sFeet`.
 * Routes evaluations through the active course definition.
 */
export function getSoapboxRoadState(
  sFeet: number,
  courseId: SoapboxCourseId = 'alpine_panorama'
): SoapboxRoadState {
  const course: SoapboxCourseDef = getSoapboxCourse(courseId);
  const s = clamp(sFeet, -course.startRampFeet - 10, course.lengthFeet + 140);

  const elev = course.getElevation(s);
  const center = course.getCenterline(s);
  const surface = course.getSurface(s);
  const sectionName = course.getSectionName(s);

  const xFeet = s;
  const yFeet = elev.yFeet;
  const zFeet = center.zFeet;

  const headingRad = Math.atan2(center.dzDs, 1);
  const slopeRad = Math.atan2(-elev.dyDs, 1);
  const denom = Math.pow(1 + center.dzDs * center.dzDs, 1.5);
  const curvature = clamp(center.d2zDs2 / Math.max(1e-5, denom), -0.035, 0.035);

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
    courseId,
  };
}

export function createSoapboxCourseObstacles(
  courseId: SoapboxCourseId = 'alpine_panorama'
): SoapboxObstacle[] {
  return getSoapboxCourse(courseId).generateObstacles();
}

export function createInitialSoapboxState(
  courseId: SoapboxCourseId = 'alpine_panorama'
): SoapboxSimulationState {
  const course = getSoapboxCourse(courseId);
  const initialRoad = getSoapboxRoadState(-course.startRampFeet, courseId);

  const initialParts: Record<SoapboxDetachablePartSlot, SoapboxPartDamageState> = {
    wheel_fl: { slot: 'wheel_fl', health: 1.0, isDetached: false },
    wheel_fr: { slot: 'wheel_fr', health: 1.0, isDetached: false },
    wheel_rl: { slot: 'wheel_rl', health: 1.0, isDetached: false },
    wheel_rr: { slot: 'wheel_rr', health: 1.0, isDetached: false },
    bumper: { slot: 'bumper', health: 1.0, isDetached: false },
    topper: { slot: 'topper', health: 1.0, isDetached: false },
  };

  const initialAttachedParts: Record<SoapboxDetachablePartSlot, boolean> = {
    wheel_fl: true,
    wheel_fr: true,
    wheel_rl: true,
    wheel_rr: true,
    bumper: true,
    topper: true,
  };

  const initialPartHealth: Record<SoapboxDetachablePartSlot, number> = {
    wheel_fl: 1.0,
    wheel_fr: 1.0,
    wheel_rl: 1.0,
    wheel_rr: 1.0,
    bumper: 1.0,
    topper: 1.0,
  };

  return {
    phase: 'skit',
    phaseTime: 0,
    courseId: course.id,
    courseLengthFeet: course.lengthFeet,
    sFeet: -course.startRampFeet,
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
    onCobblestone: initialRoad.surface === 'cobblestone',
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
    obstacles: createSoapboxCourseObstacles(courseId),
    debris: [],
    hayBursts: [],
    sparkIntensity: 0,
    judgeScores: null,

    parts: initialParts,
    attachedParts: initialAttachedParts,
    partHealth: initialPartHealth,
    partsDetachedCount: 0,
    isWrecked: false,
    wreckReason: null,
    steeringPullFtS2: 0,
    pullYawRate: 0,
    lostParts: [],
  };
}

export function setBanner(
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
    state.speedFtS = clamp(state.speedFtS + tapBoost, 0, 54);
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

// ==============================================================================
// DESTRUCTIBLE PARTS & DAMAGE ROUTING
// ==============================================================================

export function damagePartSlot(
  state: SoapboxSimulationState,
  slot: SoapboxDetachablePartSlot,
  amount: number,
  eventsOrReason?: SoapboxStepEvents | string
): void {
  const part = state.parts[slot];
  if (!part || part.isDetached) return;

  part.health = Math.max(0, part.health - amount);
  state.partHealth[slot] = part.health;

  if (part.health <= 0 && state.attachedParts[slot]) {
    detachSoapboxPart(state, slot, eventsOrReason);
  }
}

export function detachSoapboxPart(
  state: SoapboxSimulationState,
  slot: SoapboxDetachablePartSlot,
  eventsOrReason?: SoapboxStepEvents | string
): void {
  if (!state.attachedParts[slot]) return;

  let reason = 'Impact Detachment';
  let events: SoapboxStepEvents | undefined = undefined;

  if (typeof eventsOrReason === 'string') {
    reason = eventsOrReason;
  } else if (eventsOrReason && typeof eventsOrReason === 'object') {
    events = eventsOrReason;
  }

  state.attachedParts[slot] = false;
  state.parts[slot].isDetached = true;
  state.parts[slot].health = 0;
  state.parts[slot].detachedAtS = state.sFeet;
  state.partHealth[slot] = 0;
  state.partsDetachedCount += 1;
  state.lostParts.push({ slot, sFeet: state.sFeet, reason });
  if (events) {
    events.partDetached = slot;
  }

  // Lateral offsets and ejection impulses per slot
  let sOffset = 0;
  let latOffset = 0;
  let heightOffset = 1.2;
  let vLatImpulse = 0;
  let vHeightImpulse = 14 + Math.random() * 6;
  let vsImpulse = state.speedFtS * 0.75 + Math.random() * 6;

  switch (slot) {
    case 'wheel_fl':
      sOffset = 2.7;
      latOffset = -2.2;
      vLatImpulse = -14 - Math.random() * 6; // Outward left
      break;
    case 'wheel_fr':
      sOffset = 2.7;
      latOffset = 2.2;
      vLatImpulse = 14 + Math.random() * 6;  // Outward right
      break;
    case 'wheel_rl':
      sOffset = -2.7;
      latOffset = -2.2;
      vLatImpulse = -12 - Math.random() * 5;
      break;
    case 'wheel_rr':
      sOffset = -2.7;
      latOffset = 2.2;
      vLatImpulse = 12 + Math.random() * 5;
      break;
    case 'bumper':
      sOffset = 4.2;
      latOffset = 0;
      vLatImpulse = (Math.random() - 0.5) * 8;
      vsImpulse = state.speedFtS * 0.6 + 10;
      break;
    case 'topper':
      sOffset = -1.2;
      latOffset = 0;
      heightOffset = 3.2;
      vHeightImpulse = 18 + Math.random() * 8; // High vertical launch
      vLatImpulse = (Math.random() - 0.5) * 12;
      break;
  }

  const road = getSoapboxRoadState(state.sFeet + sOffset, state.courseId);

  const debrisPiece: SoapboxDebrisItem = {
    id: `debris_${slot}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    slot,
    kind: slot,
    sFeet: state.sFeet + sOffset,
    lateralFeet: state.lateralOffsetFeet + latOffset,
    heightFeet: heightOffset,
    velSFtS: vsImpulse,
    velLatFtS: vLatImpulse,
    velHeightFtS: vHeightImpulse,
    rotation: { x: Math.random() * Math.PI, y: Math.random() * Math.PI, z: 0 },
    rotVel: {
      x: (Math.random() - 0.5) * 16,
      y: (Math.random() - 0.5) * 16,
      z: (Math.random() - 0.5) * 20,
    },
    xFeet: road.xFeet,
    yFeet: road.yFeet + heightOffset,
    zFeet: road.zFeet + state.lateralOffsetFeet + latOffset,
    vxFtS: vsImpulse,
    vyFtS: vHeightImpulse,
    vzFtS: vLatImpulse,
    rx: 0,
    ry: 0,
    rz: 0,
    vrx: 0,
    vry: 0,
    vrz: 0,
    scale: 1.0,
    lifeSeconds: 0,
  };

  debrisPiece.rx = debrisPiece.rotation.x;
  debrisPiece.ry = debrisPiece.rotation.y;
  debrisPiece.rz = debrisPiece.rotation.z;
  debrisPiece.vrx = debrisPiece.rotVel.x;
  debrisPiece.vry = debrisPiece.rotVel.y;
  debrisPiece.vrz = debrisPiece.rotVel.z;

  state.debris.push(debrisPiece);

  const slotLabels: Record<SoapboxDetachablePartSlot, string> = {
    wheel_fl: '💥 FRONT-LEFT WHEEL TORN OFF! STEERING PULLING LEFT!',
    wheel_fr: '💥 FRONT-RIGHT WHEEL TORN OFF! STEERING PULLING RIGHT!',
    wheel_rl: '💥 REAR-LEFT WHEEL LOST! OVERSTEER INSTABILITY!',
    wheel_rr: '💥 REAR-RIGHT WHEEL LOST! OVERSTEER INSTABILITY!',
    bumper: '🛡️ FRONT BUMPER SMASHED AWAY! NO MORE PLOW ARMOR!',
    topper: '🎭 TOPPER THROWN OFF BY SEVERE IMPACT!',
  };
  setBanner(state, slotLabels[slot], 'danger', 2.8);
}

export function applyDirectionalObstacleDamage(
  state: SoapboxSimulationState,
  metrics: ComputedSoapboxMetrics,
  obs: SoapboxObstacle,
  events?: SoapboxStepEvents
): void {
  const deltaLat = state.lateralOffsetFeet - obs.lateralCenterFeet;
  const speedScale = clamp(state.speedFtS / 32, 0.6, 1.8);
  const toughnessMod = 80 / Math.max(45, metrics.structuralToughness);
  const baseDamage = 0.55 * speedScale * toughnessMod;

  if (Math.abs(deltaLat) <= 0.8) {
    // 1. Frontal Head-On Impact -> Bumper
    if (state.attachedParts.bumper) {
      const plowMitigation = metrics.hayPlowProtection;
      const actualDmg = baseDamage * (1 - plowMitigation * 0.5);
      damagePartSlot(state, 'bumper', actualDmg, events);
    } else {
      // Bumper already gone: heavy damage splits across front wheels + chassis
      damagePartSlot(state, 'wheel_fl', baseDamage * 0.45, events);
      damagePartSlot(state, 'wheel_fr', baseDamage * 0.45, events);
      state.structuralIntegrity = Math.max(0, state.structuralIntegrity - 25);
    }
  } else if (deltaLat > 0.8) {
    // 2. Left-Side Flank Clip -> Front-Left / Rear-Left
    if (state.attachedParts.wheel_fl) {
      damagePartSlot(state, 'wheel_fl', baseDamage, events);
    } else if (state.attachedParts.wheel_rl) {
      damagePartSlot(state, 'wheel_rl', baseDamage * 0.8, events);
    } else {
      state.structuralIntegrity = Math.max(0, state.structuralIntegrity - 20);
    }
  } else {
    // 3. Right-Side Flank Clip -> Front-Right / Rear-Right
    if (state.attachedParts.wheel_fr) {
      damagePartSlot(state, 'wheel_fr', baseDamage, events);
    } else if (state.attachedParts.wheel_rr) {
      damagePartSlot(state, 'wheel_rr', baseDamage * 0.8, events);
    } else {
      state.structuralIntegrity = Math.max(0, state.structuralIntegrity - 20);
    }
  }
}

export function evaluateSoapboxWreckConditions(
  state: SoapboxSimulationState,
  _metrics: ComputedSoapboxMetrics,
  criticalRolloverDeg: number
): { isWrecked: boolean; reason: string } {
  // 1. 3+ Wheels Lost (Catastrophic Mobility Failure)
  const attachedWheels =
    (state.attachedParts.wheel_fl ? 1 : 0) +
    (state.attachedParts.wheel_fr ? 1 : 0) +
    (state.attachedParts.wheel_rl ? 1 : 0) +
    (state.attachedParts.wheel_rr ? 1 : 0);
  if (attachedWheels <= 1) {
    return { isWrecked: true, reason: 'Three or more wheels destroyed — catastrophic chassis drag!' };
  }

  // 2. Dual Front Wheel Axle Collapse
  if (!state.attachedParts.wheel_fl && !state.attachedParts.wheel_fr) {
    return { isWrecked: true, reason: 'Front axle collapsed — both front wheels torn off!' };
  }

  // 3. Dual Rear Wheel Axle Collapse
  if (!state.attachedParts.wheel_rl && !state.attachedParts.wheel_rr) {
    return { isWrecked: true, reason: 'Rear axle collapsed — both rear wheels lost!' };
  }

  // 4. Dual Same-Side Wheels Lost at Speed
  const lostLeftSide = !state.attachedParts.wheel_fl && !state.attachedParts.wheel_rl;
  const lostRightSide = !state.attachedParts.wheel_fr && !state.attachedParts.wheel_rr;
  if ((lostLeftSide || lostRightSide) && state.speedFtS > 22) {
    return { isWrecked: true, reason: 'High-speed roll trip — both wheels lost on one side!' };
  }

  // 5. Chassis Structural Exhaustion
  if (state.structuralIntegrity <= 0) {
    return { isWrecked: true, reason: 'Total hull collapse — structural integrity zero!' };
  }

  // 6. Critical Dynamic Rollover Exceeded
  if (Math.abs(state.rollDeg) >= criticalRolloverDeg && state.airborneHeightFeet <= 0.5) {
    return { isWrecked: true, reason: `Violent rollover crash at ${Math.round(Math.abs(state.rollDeg))}°!` };
  }

  return { isWrecked: false, reason: '' };
}

export function spawnWreckDebris(state: SoapboxSimulationState): void {
  const slots: SoapboxDetachablePartSlot[] = [
    'wheel_fl',
    'wheel_fr',
    'wheel_rl',
    'wheel_rr',
    'topper',
    'bumper',
  ];

  slots.forEach((slot) => {
    if (state.attachedParts[slot]) {
      detachSoapboxPart(state, slot, {
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
        partDetached: null,
        wrecked: false,
      });
    }
  });
}

export function triggerSoapboxWreck(
  state: SoapboxSimulationState,
  reason: string,
  metrics: ComputedSoapboxMetrics,
  bestRecordFeet: number,
  bestTimeSec: number | null,
  events: SoapboxStepEvents
): void {
  state.isWrecked = true;
  state.wreckReason = reason;
  state.phase = 'finished';
  state.phaseTime = 0;
  state.sparkIntensity = 1.0;
  events.wrecked = true;
  events.finishedRun = true;

  spawnWreckDebris(state);

  setBanner(state, `💥 WRECKED: ${reason.toUpperCase()}`, 'danger', 4.5);

  state.judgeScores = finalizeSoapboxJudgeScorecard(
    state,
    metrics,
    bestRecordFeet,
    bestTimeSec
  );
}

export function spawnRolloverDebris(state: SoapboxSimulationState): void {
  spawnWreckDebris(state);
}

export function finalizeSoapboxJudgeScorecard(
  state: SoapboxSimulationState,
  metrics: ComputedSoapboxMetrics,
  bestRecordFeet: number,
  bestTimeSec: number | null
): SoapboxJudgeScorecard {
  const courseLength = state.courseLengthFeet || 1000;
  const distRatio = clamp(state.distanceFeet / courseLength, 0, 1);
  let speedRaw = distRatio * 6.8;

  if (state.completedCourse) {
    const timeBonus = clamp((28 - state.elapsedRaceTimeSec) / 8.5, 0, 1) * 3.2;
    speedRaw = 7.0 + timeBonus;
  } else {
    speedRaw += clamp((state.maxSpeedMph - 25) / 35, 0, 1.5);
  }
  if (state.hayBalesHit === 0 && state.distanceFeet > 400) {
    speedRaw += 0.6;
  }

  // Part loss damage penalties:
  // -1.5 per lost wheel, -2.0 for lost topper
  const attachedWheels =
    (state.attachedParts.wheel_fl ? 1 : 0) +
    (state.attachedParts.wheel_fr ? 1 : 0) +
    (state.attachedParts.wheel_rl ? 1 : 0) +
    (state.attachedParts.wheel_rr ? 1 : 0);
  const lostWheels = 4 - attachedWheels;
  const topperLost = !state.attachedParts.topper;
  const damagePenalty = lostWheels * 1.5 + (topperLost ? 2.0 : 0);

  let speedJudge = Math.round(clamp(speedRaw - lostWheels * 1.5, 1, 10));

  // 2. Creativity Judge (1..10)
  const baseCreativity = 4.2 + (metrics.creativityScore / 100) * 5.2;
  const heavyBonus = metrics.totalMassLbs >= 340 ? 0.8 : 0;
  const topperDeduction = topperLost ? 2.0 : 0;
  let creativityJudge = Math.round(clamp(baseCreativity + heavyBonus - topperDeduction, 1, 10));

  // 3. Showmanship Judge (1..10)
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
  const dramaBonus = state.isRolledOver || state.isWrecked ? 1.2 : 0;
  let showmanshipJudge = Math.round(
    clamp(2.5 + hypePts + shovePts + stylePts + jumpGatePts + dramaBonus, 1, 10)
  );

  const totalScore = Math.max(3, speedJudge + creativityJudge + showmanshipJudge);
  const starsEarned: 1 | 2 | 3 =
    totalScore >= 26 ? 3 : totalScore >= 20 ? 2 : 1;

  const newDistanceRecord = state.distanceFeet > bestRecordFeet;
  const newTimeRecord =
    state.completedCourse &&
    (bestTimeSec === null || state.elapsedRaceTimeSec < bestTimeSec);

  return {
    speedJudge,
    creativityJudge,
    showmanshipJudge,
    totalScore,
    starsEarned,
    runTitle: state.isWrecked
      ? 'Spectacular Downhill Yard Sale'
      : totalScore >= 26
      ? 'Flawless Alpine Downhill Line'
      : 'Downhill Derby Finisher',
    newDistanceRecord,
    newTimeRecord,
    damagePenalty,
    partsLostCount: state.partsDetachedCount,
    wrecked: state.isWrecked,
    courseId: state.courseId,
  };
}

// ==============================================================================
// 120HZ SIMULATION TICK
// ==============================================================================

export function stepSoapboxSimulation(
  state: SoapboxSimulationState,
  metrics: ComputedSoapboxMetrics,
  dt: number,
  bestRecordFeet: number | null,
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
    partDetached: null,
    wrecked: false,
  };

  const recFeet = bestRecordFeet ?? 0;

  if (state.phase === 'finished') {
    state.phaseTime += dt;
    if (state.completedCourse && !state.isRolledOver && !state.isWrecked) {
      state.speedFtS = Math.max(0, state.speedFtS - 28 * dt);
      state.mph = state.speedFtS * 0.681818;
      state.sFeet = Math.min(state.courseLengthFeet + 85, state.sFeet + state.speedFtS * dt);
      state.rollDeg *= Math.max(0, 1 - dt * 6);
      state.driftAngleDeg *= Math.max(0, 1 - dt * 6);
    }
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

  // ----------------------------------------------------------------------------
  // Step Frenet 3D Tumbling Debris Ballistics
  // ----------------------------------------------------------------------------
  for (const d of state.debris) {
    d.sFeet += d.velSFtS * dt;
    d.lateralFeet += d.velLatFtS * dt;
    d.heightFeet += d.velHeightFtS * dt;
    d.velHeightFtS -= 32.174 * dt; // Gravity

    d.rotation.x += d.rotVel.x * dt;
    d.rotation.y += d.rotVel.y * dt;
    d.rotation.z += d.rotVel.z * dt;
    d.rx = d.rotation.x;
    d.ry = d.rotation.y;
    d.rz = d.rotation.z;
    d.lifeSeconds += dt;

    // Road surface bounce (restitution + friction)
    const groundFloor = 0.35;
    if (d.heightFeet <= groundFloor) {
      d.heightFeet = groundFloor;
      if (Math.abs(d.velHeightFtS) > 3.0) {
        d.velHeightFtS = Math.abs(d.velHeightFtS) * 0.42; // Bouncing coefficient
        d.velSFtS *= 0.84;                                // Road friction
        d.velLatFtS *= 0.84;
        d.rotVel.x *= 0.75;
        d.rotVel.y *= 0.75;
        d.rotVel.z *= 0.75;
      } else {
        d.velHeightFtS = 0;
        d.velSFtS *= Math.max(0, 1 - dt * 2.5);          // Sliding deceleration
        d.velLatFtS *= Math.max(0, 1 - dt * 2.5);
      }
    }

    // Curb reflection at track margins
    if (Math.abs(d.lateralFeet) > 15.0) {
      d.velLatFtS *= -0.3;
    }

    // Sync Cartesian coordinates
    const roadAtD = getSoapboxRoadState(d.sFeet, state.courseId);
    d.xFeet = roadAtD.xFeet;
    d.yFeet = roadAtD.yFeet + d.heightFeet;
    d.zFeet = roadAtD.zFeet + d.lateralFeet;
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
    const road = getSoapboxRoadState(state.sFeet, state.courseId);
    state.roadSurface = road.surface;
    state.sectionName = road.sectionName;

    // Gravity down the starter ramp + crew push momentum
    const gFtS2 = 32.174;
    const slopeAccel = gFtS2 * Math.sin(road.slopeRad) * 1.12;
    const holdBoost = state.pushTuckActive ? 7.5 : 0;
    // Speed floor is 0 so unbraked vehicles accelerate naturally from rest (v=0)
    state.speedFtS = clamp(state.speedFtS + (slopeAccel + holdBoost) * dt, 0, 68);
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
          state.speedFtS = clamp(state.speedFtS + 5.5, 0, 68);
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
  // PHASE 3: DOWNHILL RACING COURSE
  // ============================================================================
  if (state.phase === 'racing') {
    state.elapsedRaceTimeSec += dt;

    const road = getSoapboxRoadState(state.sFeet, state.courseId);
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

    // Rolling resistance + cobblestone vibration penalty (+0.028 per lost wheel)
    const attachedWheelsCount =
      (state.attachedParts.wheel_fl ? 1 : 0) +
      (state.attachedParts.wheel_fr ? 1 : 0) +
      (state.attachedParts.wheel_rl ? 1 : 0) +
      (state.attachedParts.wheel_rr ? 1 : 0);
    const missingWheels = 4 - attachedWheelsCount;
    const degradedRollingResistance = metrics.rollingResistance + missingWheels * 0.028;

    const cobblePenalty = state.onCobblestone
      ? (1 - metrics.roughTerrainRating * 0.88) * 0.082
      : 0;
    const rollDecel = gFtS2 * (degradedRollingResistance + cobblePenalty);

    // Aerodynamic drag
    const effectiveCdA = metrics.aeroDragCdA * (state.pushTuckActive ? 0.82 : 1.0);
    const aeroDecel = 0.00145 * effectiveCdA * state.speedFtS * state.speedFtS;

    // Active Push / Aero Tuck
    const tuckPumpAccel =
      state.pushTuckActive && !state.brakeInput && state.airborneHeightFeet <= 0.05
        ? 3.2
        : 0;

    // Mechanical Brake Deceleration
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

    // REMOVED ARTIFICIAL SPEED CLAMP: Speed floor is 0 so unbraked vehicles accelerate from rest
    state.speedFtS = clamp(state.speedFtS + netAccel * dt, 0, 92);
    state.mph = state.speedFtS * 0.681818;
    state.maxSpeedMph = Math.max(state.maxSpeedMph, state.mph);

    // 3. Steering, Road Curvature Centrifugal Push, Tire Grip & Power-Slide Drifting
    const speedRatio = clamp(state.speedFtS / 55, 0.25, 1.45);
    const waterGripMultiplier = state.inWaterSlickTimer > 0 ? 0.4 : 1.0;
    const cobbleGripMultiplier = state.onCobblestone
      ? 0.76 + metrics.roughTerrainRating * 0.24
      : 1.0;
    const downforceGripBonus = metrics.downforceFactor * speedRatio * 0.28;

    // Rear lateral grip reduction (drift/oversteer) when rear wheels are lost
    let rearGripModifier = 1.0;
    if (!state.attachedParts.wheel_rl || !state.attachedParts.wheel_rr) {
      rearGripModifier = 0.35; // 65% loss of rear axle traction
    }

    const effectiveGrip =
      (metrics.lateralGripMultiplier + downforceGripBonus) *
      waterGripMultiplier *
      cobbleGripMultiplier *
      rearGripModifier;

    // Centrifugal outward acceleration
    const centrifugalPushFtS2 =
      -road.curvature * state.speedFtS * state.speedFtS * 0.62;

    // Steering authority (reduced by 45% if either front wheel is missing)
    let steerAuthority = (29 + effectiveGrip * 15.5) * clamp(0.78 + speedRatio * 0.34, 0.78, 1.22);
    if (!state.attachedParts.wheel_fl || !state.attachedParts.wheel_fr) {
      steerAuthority *= 0.55;
    }

    const cobbleLateralJitter = state.onCobblestone
      ? (1 - metrics.roughTerrainRating * 0.85) * Math.sin(state.sFeet * 2.1) * 3.2
      : 0;
    const steerAccelFtS2 = state.steerInput * steerAuthority + cobbleLateralJitter;

    // Asymmetric yaw pull from missing left vs right wheels
    let steeringPullFtS2 = 0;
    if (!state.attachedParts.wheel_fl && state.attachedParts.wheel_fr) {
      steeringPullFtS2 = -14.0; // Left front missing -> pull left
    } else if (!state.attachedParts.wheel_fr && state.attachedParts.wheel_fl) {
      steeringPullFtS2 = 14.0;  // Right front missing -> pull right
    }
    if (!state.attachedParts.wheel_rl && state.attachedParts.wheel_rr) {
      steeringPullFtS2 += -6.0;
    } else if (!state.attachedParts.wheel_rr && state.attachedParts.wheel_rl) {
      steeringPullFtS2 += 6.0;
    }
    state.steeringPullFtS2 = steeringPullFtS2;
    state.pullYawRate = steeringPullFtS2 / 20.0;

    // Lateral tire damping
    const lateralDamping = state.inWaterSlickTimer > 0 ? 2.1 : state.isDrifting ? 3.1 : 5.4;
    state.lateralVelFtS +=
      (steerAccelFtS2 + centrifugalPushFtS2 + steeringPullFtS2 - state.lateralVelFtS * lateralDamping) * dt;
    state.lateralVelFtS = clamp(state.lateralVelFtS, -34, 34);
    state.lateralOffsetFeet += state.lateralVelFtS * dt;

    // Power-Slide Drift initiation
    const corneringLoad =
      Math.abs(centrifugalPushFtS2 - steerAccelFtS2 * 0.55) /
      Math.max(0.45, effectiveGrip * 18);
    const driftThreshold = clamp((1.02 - metrics.driftAgility * 0.24) * rearGripModifier, 0.35, 1.0);
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
      state.driftStylePoints += dt * (18 + Math.abs(state.driftAngleDeg) * 0.65);
      state.sparkIntensity = Math.max(state.sparkIntensity, 0.32);
    } else {
      state.driftAngleDeg *= Math.max(0, 1 - dt * 8);
    }

    // Road track barrier clamp
    if (Math.abs(state.lateralOffsetFeet) > 13.0) {
      const sign = Math.sign(state.lateralOffsetFeet);
      state.lateralOffsetFeet = sign * 13.0;
      state.lateralVelFtS = -sign * Math.abs(state.lateralVelFtS) * 0.45;
      state.speedFtS = Math.max(0, state.speedFtS * 0.96);
      state.mph = state.speedFtS * 0.681818;
      state.sparkIntensity = Math.max(state.sparkIntensity, 0.5);
    }

    // 4. Chassis Body Roll Angle & Rollover Threshold Reduction
    const ssfInverse = 1 / Math.max(0.65, metrics.staticStabilityFactor);
    const netLateralG =
      (steerAccelFtS2 * 0.56 - centrifugalPushFtS2 * 0.68) / gFtS2;
    const stiffnessReduction = 1 / (1 + metrics.antiRollStiffness * 1.15);
    const driftRollRelief = state.isDrifting ? 0.76 : 1.0;
    const targetRollDeg = clamp(
      -netLateralG * 27 * ssfInverse * stiffnessReduction * driftRollRelief,
      -50,
      50
    );

    const isCounterOrEasing =
      Math.abs(state.steerInput) < 0.15 ||
      Math.sign(targetRollDeg) !== Math.sign(state.rollDeg);
    const rollSpring = isCounterOrEasing ? 38 : 28;
    const rollDamp = isCounterOrEasing ? 9.2 : 6.8;
    const rollAccel =
      (targetRollDeg - state.rollDeg) * rollSpring - state.rollVelDegS * rollDamp;
    state.rollVelDegS += rollAccel * dt;

    if (
      Math.abs(state.rollDeg) >= 17.5 &&
      Math.sign(state.rollVelDegS) === Math.sign(state.rollDeg)
    ) {
      state.rollVelDegS = clamp(state.rollVelDegS, -21, 21);
    }

    state.rollDeg += state.rollVelDegS * dt;

    // Dynamic Rollover Threshold Reduction when outer wheel is missing
    let criticalRolloverDeg = metrics.criticalRolloverDeg;
    if (state.rollDeg < 0 && (!state.attachedParts.wheel_fl || !state.attachedParts.wheel_rl)) {
      criticalRolloverDeg *= 0.62;
    } else if (state.rollDeg > 0 && (!state.attachedParts.wheel_fr || !state.attachedParts.wheel_rr)) {
      criticalRolloverDeg *= 0.62;
    }

    // Check Two-Wheel Tilt Warning
    const prevWarning = state.rollWarning;
    state.rollWarning = Math.abs(state.rollDeg) > criticalRolloverDeg * 0.45;
    if (state.rollWarning && !prevWarning) {
      setBanner(
        state,
        '⚠️ TWO-WHEEL TILT! Counter-Steer or Ease Off to Prevent Rollover!',
        'warn',
        1.8
      );
    }

    // Check 5 Crash/Wreck Triggers
    const wreckCheck = evaluateSoapboxWreckConditions(state, metrics, criticalRolloverDeg);
    if (wreckCheck.isWrecked) {
      state.distanceFeet = Math.min(
        state.courseLengthFeet,
        Math.max(0, Math.floor(state.sFeet))
      );
      if (Math.abs(state.rollDeg) >= criticalRolloverDeg) {
        state.isRolledOver = true;
        state.rollDeg = Math.sign(state.rollDeg) * 95;
      }
      triggerSoapboxWreck(state, wreckCheck.reason, metrics, recFeet, bestTimeSec, events);
      return events;
    }

    // 5. Airborne Kicker Jumps & Suspension Landing Compression / Shock Routing
    if (state.airborneHeightFeet > 0 || state.verticalVelFtS > 0) {
      state.airborneHeightFeet += state.verticalVelFtS * dt;
      state.verticalVelFtS -= gFtS2 * dt;
      state.suspensionCompression = Math.max(0, state.suspensionCompression - dt * 3);

      if (state.airborneHeightFeet <= 0) {
        const impactVel = Math.abs(state.verticalVelFtS);
        state.airborneHeightFeet = 0;
        state.verticalVelFtS = 0;

        const rawCompression =
          (impactVel / 22.5) * (0.135 / Math.max(0.06, metrics.suspensionTravelMeters));
        state.suspensionCompression = clamp(rawCompression, 0.25, 1.3);

        if (state.suspensionCompression > 1.0) {
          // Bottomed out: damage topper via vertical inertia shock
          const bottomOutShock = (state.suspensionCompression - 0.95) * 1.6;
          damagePartSlot(state, 'topper', bottomOutShock, events);

          state.bottomedOutCount += 1;
          state.sparkIntensity = 1.0;
          state.speedFtS = Math.max(0, state.speedFtS * 0.78);
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
              state.courseLengthFeet,
              Math.max(0, Math.floor(state.sFeet))
            );
            triggerSoapboxWreck(
              state,
              'Chassis shattered on violent jump landing!',
              metrics,
              recFeet,
              bestTimeSec,
              events
            );
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
      state.suspensionCompression = Math.max(
        0,
        state.suspensionCompression - dt * 2.6
      );
    }

    // 6. Advance Along Course & Check Obstacles
    const prevS = state.sFeet;
    state.sFeet += state.speedFtS * dt;
    state.distanceFeet = Math.min(
      state.courseLengthFeet,
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

          // Directional obstacle collision damage routing
          applyDirectionalObstacleDamage(state, metrics, obs, events);

          const protection = metrics.hayPlowProtection;
          const speedRetained = 0.62 + protection * 0.26;
          state.speedFtS = Math.max(0, state.speedFtS * speedRetained);
          state.mph = state.speedFtS * 0.681818;
          const baseDmg = 24 * (1 - protection * 0.65);
          const scaledDmg = Math.round(
            baseDmg * (80 / Math.max(45, metrics.structuralToughness))
          );
          state.structuralIntegrity = Math.max(0, state.structuralIntegrity - scaledDmg);

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
            triggerSoapboxWreck(
              state,
              `Smashed into hay barrier chicane at ${state.distanceFeet} ft!`,
              metrics,
              recFeet,
              bestTimeSec,
              events
            );
            return events;
          }
        }
      } else if (obs.type === 'water_slick') {
        if (latDist <= obs.halfWidthFeet + 1.2 && state.airborneHeightFeet < 0.5) {
          obs.triggered = true;
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

    // 7. Check Course Completion at Checkered Finish Arch!
    if (state.sFeet >= state.courseLengthFeet) {
      state.sFeet = state.courseLengthFeet;
      state.distanceFeet = state.courseLengthFeet;
      state.completedCourse = true;
      state.phase = 'finished';
      state.phaseTime = 0;
      setBanner(
        state,
        `🏁 CROSSED THE ${state.courseLengthFeet.toLocaleString()}-FT FINISH ARCH IN ${state.elapsedRaceTimeSec.toFixed(1)}s!`,
        'good',
        4.0
      );
      state.judgeScores = finalizeSoapboxJudgeScorecard(
        state,
        metrics,
        recFeet,
        bestTimeSec
      );
      events.finishedRun = true;
    }

    return events;
  }

  return events;
}
