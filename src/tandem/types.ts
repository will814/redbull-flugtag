/**
 * Red Bull Tandem Bike Challenge (Game 4)
 * Core Data Models, Types, and Catalog Interfaces
 */

// ============================================================================
// 1. PART CATEGORIES & METADATA
// ============================================================================

export type TandemCategory =
  | 'frame'
  | 'drivetrain'
  | 'wheels'
  | 'steering'
  | 'stabilizer'
  | 'topper';

export interface TandemCategoryMeta {
  id: TandemCategory;
  label: string;
  shortLabel: string;
  emoji: string;
  description: string;
  keyHint: string;
}

// ============================================================================
// 2. PHYSICS STATS & DERIVED METRICS
// ============================================================================

export interface TandemStats {
  /** Total dry mass contribution of the part in kilograms (kg) */
  massKg: number;
  /** Aerodynamic drag coefficient contribution (dimensionless, Cd delta) */
  dragCoeff: number;
  /** Pedaling power output contribution from dual crew / gears in Watts (W) */
  cadencePowerW: number;
  /** Lateral balance stability index (0..100, resistance to beam tip-over) */
  lateralStability: number;
  /** Roll oscillation damping rating (0..100, mitigates seesaw & roller wobble) */
  rollDamping: number;
  /** Steering responsiveness & beam centering agility (0..100) */
  steeringAgility: number;
  /** Physical outrigger / stabilizer stance span in feet (ft) */
  outriggerWidthFt: number;
}

export type TandemDynoStatus =
  | 'ultra_stable'
  | 'balanced'
  | 'twitchy'
  | 'top_heavy';

export interface TandemDynoMetrics {
  /** Core aggregate physics stats used by 120Hz physics simulation */
  stats: TandemStats;
  /** Combined total mass in kg (bike parts + 140 kg Captain & Stoker crew) */
  totalMassKg: number;
  /** Dry tandem bicycle mass in kg (parts only) */
  bikeMassKg: number;
  /** Fixed crew mass in kg (72 kg Captain + 68 kg Stoker) */
  crewMassKg: number;
  /** Effective power-to-weight ratio in W/kg */
  powerToWeightRatioWKg: number;
  /** Critical roll angle before catastrophic beam tip-over (degrees, ~18°..42°) */
  rolloverThresholdDeg: number;
  /** Normalized 0..100 UI gauges for Dyno Rig and Workshop HUD */
  stabilityScore: number;
  speedScore: number;
  agilityScore: number;
  creativityScore: number;
  /** Dyno rig balance & handling diagnostic classification */
  dynoStatus: TandemDynoStatus;
  dynoStatusLabel: string;
  dynoAdvice: string;
}

// ============================================================================
// 3. 3D VISUAL DEFINITIONS
// ============================================================================

export interface TandemVisualDef {
  /** Procedural mesh style identifier mapped in TandemBike3DBuilder */
  meshStyle?: string;
  meshType?: string;
  /** Primary hex color */
  primaryColor: string;
  /** Secondary hex color */
  secondaryColor: string;
  /** Accent / decal / accessory hex color */
  accentColor?: string;
  /** Scale factor [x, y, z] or uniform number */
  scale?: [number, number, number] | number;
  /** Coordinate offset [x, y, z] in meters relative to frame socket */
  offset?: [number, number, number];
  /** PBR material properties */
  roughness?: number;
  metalness?: number;
  /** Special procedural feature (e.g. 'tail_wag', 'spinning_gears', 'flapping_ears') */
  specialFeature?: string;
  badgeEmoji?: string;
  detailFeatures?: string[];
  dimensions?: {
    lengthM?: number;
    widthM?: number;
    heightM?: number;
    wheelRadiusM?: number;
    outriggerSpanM?: number;
  };
}

// ============================================================================
// 4. PART DEFINITION & CATALOG ENTRY
// ============================================================================

export interface TandemPart {
  id: string;
  name: string;
  category: TandemCategory;
  unlockStars: number;
  costStars?: number;
  stats: TandemStats;
  description: string;
  tagline: string;
  emoji: string;
  visual: TandemVisualDef;
  creativityPoints: number;
  creativityBonus: number;
}

// ============================================================================
// 5. LOADOUT, PRESETS & PAINT THEMES
// ============================================================================

export interface TandemLoadout {
  name?: string;
  frameId: string;
  drivetrainId: string;
  wheelsId: string;
  steeringId: string;
  stabilizerId: string;
  topperId: string;
  paintThemeId: string;
}

export interface TandemPreset {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  badgeColor?: string;
  loadout: TandemLoadout;
}

export type TandemPaintThemeId =
  | 'redbull_navy'
  | 'neon_cyber'
  | 'sunset_fire'
  | 'toxic_lime'
  | 'arctic_glacier'
  | 'golden_bull';

export interface TandemPaintTheme {
  id: string;
  name: string;
  emoji: string;
  description?: string;
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
  frameHex: string;
  forkHex?: string;
  rimHex?: string;
  decalHex?: string;
  badgeColor?: string;
}

// ============================================================================
// 6. DOWNSTREAM SIMULATION & CONTROL CONTRACTS (Milestones 2, 4, 5)
// ============================================================================

export interface TandemControls {
  /** Lateral steering steer input (-1.0 left to +1.0 right) */
  steer: number;
  /** Active pedaling cadence impulse (Spacebar or touch cadence tap) */
  pedalCadence: boolean;
  /** Sprint burst modifier (Shift or touch sprint hold) */
  sprint: boolean;
  /** Coaster brake drag (Down arrow, S, or touch brake hold) */
  brake: boolean;
  /** Active rider lean balance correction (-1.0 left lean to +1.0 right lean) */
  leanRoll: number;
}

export type TandemPhase = 'hype' | 'riding' | 'splashdown' | 'finished';

export interface TandemSplashEvent {
  position: [number, number, number];
  intensity: number;
}

export interface TandemSimState {
  phase: TandemPhase;
  distanceFt: number;
  speedMph: number;
  rollAngleRad: number;
  lateralOffsetFt: number;
  cadenceRpm: number;
  seesawAngles: Record<string, number>;
  splashEvents: TandemSplashEvent[];
  timeElapsedSec: number;
  hypeEnergy: number;
  stokerSyncPct: number;
  isOffBeam: boolean;
  hasFinished: boolean;
  accumulatorSec?: number;
  courseId?: string;
  courseLengthFt?: number;
}

export interface TandemScorecard {
  creativityScore: number;
  showmanshipScore: number;
  distanceTimeScore: number;
  totalScore: number;
  starsEarned: 1 | 2 | 3;
  newDistanceRecord: boolean;
  newTimeRecord: boolean;
  finishTimeSec: number | null;
  completedCourse: boolean;
  distanceFt: number;
  courseId?: string;
  courseName?: string;
  courseLengthFt?: number;
}
