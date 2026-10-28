/**
 * Red Bull Tandem Bike Challenge (Game 4)
 * Multi-Course Over-Water Pier Catalog & Track Geometry Definitions
 *
 * Defines 4 extended over-water courses (600 FT to 1,200 FT) with distinct
 * atmospheric themes, sector layouts, rhythm rollers, seesaw bridges,
 * water cannon batteries, and kicker gap jumps.
 */

export type TandemCourseId =
  | 'stalen_ros_canal'
  | 'sunset_harbor'
  | 'cyber_marina'
  | 'kraken_gauntlet';

export type TandemSectorId =
  | 'dock'
  | 'beam_1'
  | 'rollers'
  | 'seesaw'
  | 'water_cannon'
  | 'gap_jump'
  | 'finish_bell';

export interface TandemCourseSectorDef {
  id: TandemSectorId;
  name: string;
  emoji: string;
  advice: string;
  startFt: number;
  endFt: number;
  widthFt: number;
  color: string;
}

export interface TandemCourseTheme {
  skyTopHex: string;
  skyHorizonHex: string;
  fogHex: string;
  fogDensity: number;
  waterHex: string;
  waterDeepHex: string;
  sunColorHex: string;
  sunIntensity: number;
  ambientIntensity: number;
  deckWoodHex: string;
  beamDeckHex: string;
}

export interface TandemCurveSegmentDef {
  id: string;
  name: string;
  direction: 'left' | 'right' | 's_curve';
  startFt: number;
  endFt: number;
  /** Peak lateral centerline offset in feet (+Z = starboard/right, -Z = port/left) */
  amplitudeFt: number;
  /** 1 = smooth single dogleg/bend, 2 = full S-curve chicane */
  halfWaves: 1 | 2;
}

export type TandemCourseObstacleType =
  | 'chicane_bollard'
  | 'foam_slick'
  | 'swing_pendulum'
  | 'wind_gust'
  | 'boost_pad';

export interface TandemCourseObstacleDef {
  id: string;
  name: string;
  type: TandemCourseObstacleType;
  emoji: string;
  /** Longitudinal center station in feet */
  distanceFt: number;
  /** Longitudinal span in feet */
  lengthFt: number;
  /** Lateral center offset on the pier in feet (- = left/port, + = right/starboard) */
  lateralCenterFt: number;
  /** Lateral half-width of obstacle hitbox in feet */
  halfWidthFt: number;
  /** Obstacle intensity multiplier */
  intensity: number;
  /** Angular frequency (rad/s) for swinging pendulum obstacles */
  swingFreqRadS?: number;
  /** Phase offset (rad) for swinging pendulum obstacles */
  swingPhaseRad?: number;
  /** Short HUD warning callout */
  warningText: string;
}

export interface TandemCenterlinePoint {
  /** Lateral offset of pier centerline in feet (+Z = right/starboard, -Z = left/port) */
  zFt: number;
  /** First derivative dz/ds (dimensionless) */
  dzDs: number;
  /** Second derivative d2z/ds2 (1/ft) */
  d2zDs2: number;
  /** Tangent heading angle in radians: atan(dz/ds) */
  headingRad: number;
  /** Signed curvature in rad/ft (+ = curving right, - = curving left) */
  curvatureRadFt: number;
  /** Active curve segment if inside a curve, otherwise null */
  activeCurve: TandemCurveSegmentDef | null;
  /** Instantaneous turn direction for HUD & physics */
  turnDirection: 'left' | 'right' | 'straight';
}

export interface TandemCourseDef {
  id: TandemCourseId;
  name: string;
  subtitle: string;
  emoji: string;
  difficultyStars: 1 | 2 | 3 | 4;
  difficultyLabel: 'Beginner' | 'Challenging' | 'Expert' | 'Extreme';
  lengthFt: number;
  parTimeSec: number;
  beamHalfWidthFt: number;
  rollersStartFt: number;
  rollersEndFt: number;
  rollerWavelengthFt: number;
  rollerAmplitudeFt: number;
  seesawFulcrumFt: number;
  seesawHalfLengthFt: number;
  seesawStartFt: number;
  seesawEndFt: number;
  waterCannonStationsFt: number[];
  takeoffRampStartFt: number;
  gapStartFt: number;
  gapEndFt: number;
  finishDeckStartFt: number;
  finishBellFt: number;
  description: string;
  badgeColor: string;
  theme: TandemCourseTheme;
  sectors: TandemCourseSectorDef[];
  curves: TandemCurveSegmentDef[];
  obstacles: TandemCourseObstacleDef[];
}

export const DEFAULT_TANDEM_COURSE_ID: TandemCourseId = 'stalen_ros_canal';

export const TANDEM_COURSES: TandemCourseDef[] = [
  // ==========================================================================
  // COURSE 1: Stalen Ros Grand Canal (600 FT — Default Course)
  // ==========================================================================
  {
    id: 'stalen_ros_canal',
    name: 'Stalen Ros Grand Canal',
    subtitle: '600 FT Classic Dutch Canal S-Curves & Pier Gauntlet',
    emoji: '🌊',
    difficultyStars: 1,
    difficultyLabel: 'Beginner',
    lengthFt: 600,
    parTimeSec: 32.0,
    beamHalfWidthFt: 1.5,
    rollersStartFt: 160,
    rollersEndFt: 270,
    rollerWavelengthFt: 12,
    rollerAmplitudeFt: 1.0,
    seesawFulcrumFt: 330,
    seesawHalfLengthFt: 20,
    seesawStartFt: 310,
    seesawEndFt: 350,
    waterCannonStationsFt: [425, 475],
    takeoffRampStartFt: 499,
    gapStartFt: 515,
    gapEndFt: 540,
    finishDeckStartFt: 560,
    finishBellFt: 600,
    description:
      'An extended 600-foot Dutch canal gauntlet featuring serpentine S-curves, slalom bollards, slippery canal foam patches, a 110-ft rhythm roller bend, a 40-ft tilting seesaw bridge, swinging buoy gates, dual water cannons, and a 25-ft gap jump to the Golden Canal Bell.',
    badgeColor: '#0284c7',
    theme: {
      skyTopHex: '#38bdf8',
      skyHorizonHex: '#bae6fd',
      fogHex: '#bae6fd',
      fogDensity: 0.0032,
      waterHex: '#0284c7',
      waterDeepHex: '#0c4a6e',
      sunColorHex: '#fffbeb',
      sunIntensity: 1.85,
      ambientIntensity: 0.8,
      deckWoodHex: '#92400e',
      beamDeckHex: '#fde047',
    },
    sectors: [
      {
        id: 'dock',
        name: 'SECTOR 1: LAUNCH DOCK',
        emoji: '⚓',
        advice: 'Build Crew Sync & Launch!',
        startFt: 0,
        endFt: 30,
        widthFt: 8.0,
        color: '#38bdf8',
      },
      {
        id: 'beam_1',
        name: 'SECTOR 2: CANAL S-CURVE BEAM',
        emoji: '📏',
        advice: 'Steer the S-Curves & Dodge Bollards!',
        startFt: 30,
        endFt: 160,
        widthFt: 3.0,
        color: '#4ade80',
      },
      {
        id: 'rollers',
        name: 'SECTOR 3: CURVING RHYTHM ROLLERS',
        emoji: '🌊',
        advice: 'Pump Cadence Around the Sweeping Bend!',
        startFt: 160,
        endFt: 270,
        widthFt: 3.0,
        color: '#facc15',
      },
      {
        id: 'seesaw',
        name: 'SECTOR 4: TILTING SEESAW BRIDGE',
        emoji: '⚖️',
        advice: 'Line Up Straight & Power Past 330 FT!',
        startFt: 270,
        endFt: 390,
        widthFt: 3.0,
        color: '#fb923c',
      },
      {
        id: 'water_cannon',
        name: 'SECTOR 5: CANNON & CHICANE GAUNTLET',
        emoji: '💦',
        advice: 'Carve the S-Chicane & Counter-Lean Blasts!',
        startFt: 390,
        endFt: 515,
        widthFt: 3.0,
        color: '#38bdf8',
      },
      {
        id: 'gap_jump',
        name: 'SECTOR 6: RAMP GAP JUMP',
        emoji: '🚀',
        advice: 'Sprint > 19.5 MPH & Land Level!',
        startFt: 515,
        endFt: 560,
        widthFt: 3.0,
        color: '#f43f5e',
      },
      {
        id: 'finish_bell',
        name: 'SECTOR 7: GOLDEN CANAL BELL',
        emoji: '🔔',
        advice: 'Ring the Finish Bell at 600 FT!',
        startFt: 560,
        endFt: 600,
        widthFt: 8.0,
        color: '#fbbf24',
      },
    ],
    curves: [
      {
        id: 'canal_s_bend',
        name: 'Canal Entry S-Curve',
        direction: 's_curve',
        startFt: 42,
        endFt: 154,
        amplitudeFt: 9.5,
        halfWaves: 2,
      },
      {
        id: 'roller_left_sweep',
        name: 'Windmill Roller Left Sweep',
        direction: 'left',
        startFt: 166,
        endFt: 264,
        amplitudeFt: -8.5,
        halfWaves: 1,
      },
      {
        id: 'seesaw_entry_dogleg',
        name: 'Seesaw Approach Bend',
        direction: 'right',
        startFt: 272,
        endFt: 306,
        amplitudeFt: 5.0,
        halfWaves: 1,
      },
      {
        id: 'seesaw_exit_dogleg',
        name: 'Seesaw Exit Bend',
        direction: 'left',
        startFt: 354,
        endFt: 388,
        amplitudeFt: -5.5,
        halfWaves: 1,
      },
      {
        id: 'cannon_gauntlet_chicane',
        name: 'Cannon Gauntlet S-Chicane',
        direction: 's_curve',
        startFt: 394,
        endFt: 494,
        amplitudeFt: 11.0,
        halfWaves: 2,
      },
    ],
    obstacles: [
      {
        id: 'sr_bollard_1',
        name: 'Port Slalom Bollard',
        type: 'chicane_bollard',
        emoji: '🚧',
        distanceFt: 74,
        lengthFt: 4,
        lateralCenterFt: -0.78,
        halfWidthFt: 0.42,
        intensity: 0.9,
        warningText: 'BOLLARD LEFT — STEER RIGHT (D)!',
      },
      {
        id: 'sr_foam_1',
        name: 'Canal Algae Foam Patch',
        type: 'foam_slick',
        emoji: '🧼',
        distanceFt: 112,
        lengthFt: 18,
        lateralCenterFt: 0,
        halfWidthFt: 1.35,
        intensity: 0.85,
        warningText: 'FOAM SLICK — HOLD BALANCE (Q/E)!',
      },
      {
        id: 'sr_bollard_2',
        name: 'Starboard Slalom Bollard',
        type: 'chicane_bollard',
        emoji: '🚧',
        distanceFt: 144,
        lengthFt: 4,
        lateralCenterFt: 0.78,
        halfWidthFt: 0.42,
        intensity: 0.9,
        warningText: 'BOLLARD RIGHT — STEER LEFT (A)!',
      },
      {
        id: 'sr_wind_1',
        name: 'Windmill Crosswind Gust',
        type: 'wind_gust',
        emoji: '💨',
        distanceFt: 215,
        lengthFt: 24,
        lateralCenterFt: 0,
        halfWidthFt: 1.5,
        intensity: 0.85,
        warningText: 'CROSSWIND GUST — COUNTER-LEAN!',
      },
      {
        id: 'sr_boost_1',
        name: 'Seesaw Turbo Strip',
        type: 'boost_pad',
        emoji: '⚡',
        distanceFt: 298,
        lengthFt: 10,
        lateralCenterFt: 0.25,
        halfWidthFt: 0.55,
        intensity: 1.0,
        warningText: 'TURBO BOOST STRIP AHEAD!',
      },
      {
        id: 'sr_pendulum_1',
        name: 'Swinging Canal Buoy',
        type: 'swing_pendulum',
        emoji: '🎯',
        distanceFt: 372,
        lengthFt: 5,
        lateralCenterFt: 0,
        halfWidthFt: 0.45,
        intensity: 1.0,
        swingFreqRadS: 2.2,
        swingPhaseRad: 0.4,
        warningText: 'SWINGING BUOY GATE — TIME YOUR LINE!',
      },
      {
        id: 'sr_foam_2',
        name: 'Cannon Spray Slick',
        type: 'foam_slick',
        emoji: '🧼',
        distanceFt: 448,
        lengthFt: 18,
        lateralCenterFt: 0,
        halfWidthFt: 1.35,
        intensity: 0.95,
        warningText: 'WET DECK SLICK — STEADY HANDS!',
      },
      {
        id: 'sr_bollard_3',
        name: 'Pre-Ramp Pinch Bollard',
        type: 'chicane_bollard',
        emoji: '🚧',
        distanceFt: 486,
        lengthFt: 4,
        lateralCenterFt: -0.82,
        halfWidthFt: 0.4,
        intensity: 0.95,
        warningText: 'PINCH BOLLARD LEFT — LINE UP RAMP!',
      },
    ],
  },

  // ==========================================================================
  // COURSE 2: Sunset Harbor Marathon (800 FT)
  // ==========================================================================
  {
    id: 'sunset_harbor',
    name: 'Sunset Harbor Marathon',
    subtitle: '800 FT Golden-Hour Serpentine Pier Endurance Run',
    emoji: '🌅',
    difficultyStars: 2,
    difficultyLabel: 'Challenging',
    lengthFt: 800,
    parTimeSec: 42.0,
    beamHalfWidthFt: 1.5,
    rollersStartFt: 210,
    rollersEndFt: 360,
    rollerWavelengthFt: 12,
    rollerAmplitudeFt: 1.1,
    seesawFulcrumFt: 440,
    seesawHalfLengthFt: 22,
    seesawStartFt: 418,
    seesawEndFt: 462,
    waterCannonStationsFt: [565, 615, 655],
    takeoffRampStartFt: 669,
    gapStartFt: 685,
    gapEndFt: 710,
    finishDeckStartFt: 745,
    finishBellFt: 800,
    description:
      'An 800-foot golden-hour harbor crossing with sweeping S-curves, harbor chicane bollards, sea-foam slicks, 150 feet of curving timber waves, a 44-ft seesaw span, swinging buoy gates, and three high-pressure water cannons.',
    badgeColor: '#f97316',
    theme: {
      skyTopHex: '#fb923c',
      skyHorizonHex: '#fde68a',
      fogHex: '#fed7aa',
      fogDensity: 0.0028,
      waterHex: '#0369a1',
      waterDeepHex: '#1e1b4b',
      sunColorHex: '#fef08a',
      sunIntensity: 1.9,
      ambientIntensity: 0.78,
      deckWoodHex: '#78350f',
      beamDeckHex: '#fbbf24',
    },
    sectors: [
      {
        id: 'dock',
        name: 'SECTOR 1: HARBOR LAUNCH DOCK',
        emoji: '⚓',
        advice: 'Build Crew Sync & Launch!',
        startFt: 0,
        endFt: 35,
        widthFt: 8.0,
        color: '#38bdf8',
      },
      {
        id: 'beam_1',
        name: 'SECTOR 2: SUNSET SERPENTINE BEAM',
        emoji: '📏',
        advice: 'Carve the Harbor S-Curves Across 175 FT!',
        startFt: 35,
        endFt: 210,
        widthFt: 3.0,
        color: '#4ade80',
      },
      {
        id: 'rollers',
        name: 'SECTOR 3: HARBOR SWELL ROLLERS',
        emoji: '🌊',
        advice: 'Hold Rhythm Over 150 FT of Curving Swells!',
        startFt: 210,
        endFt: 360,
        widthFt: 3.0,
        color: '#facc15',
      },
      {
        id: 'seesaw',
        name: 'SECTOR 4: BASCULE SEESAW BRIDGE',
        emoji: '⚖️',
        advice: 'Climb & Tip the 440 FT Fulcrum!',
        startFt: 360,
        endFt: 520,
        widthFt: 3.0,
        color: '#fb923c',
      },
      {
        id: 'water_cannon',
        name: 'SECTOR 5: TRIPLE CANNON CHICANE',
        emoji: '💦',
        advice: 'Brace Against 3 Jets & Swinging Buoys!',
        startFt: 520,
        endFt: 685,
        widthFt: 3.0,
        color: '#38bdf8',
      },
      {
        id: 'gap_jump',
        name: 'SECTOR 6: SUNSET KICKER GAP',
        emoji: '🚀',
        advice: 'Full Sprint to Clear the Channel!',
        startFt: 685,
        endFt: 745,
        widthFt: 3.0,
        color: '#f43f5e',
      },
      {
        id: 'finish_bell',
        name: 'SECTOR 7: SUNSET BELL PAVILION',
        emoji: '🔔',
        advice: 'Ring the Harbor Bell at 800 FT!',
        startFt: 745,
        endFt: 800,
        widthFt: 8.0,
        color: '#fbbf24',
      },
    ],
    curves: [
      {
        id: 'harbor_entry_s',
        name: 'Harbor Sunset S-Curve',
        direction: 's_curve',
        startFt: 45,
        endFt: 202,
        amplitudeFt: 12.0,
        halfWaves: 2,
      },
      {
        id: 'swell_roller_bend',
        name: 'Harbor Swell S-Bend',
        direction: 's_curve',
        startFt: 216,
        endFt: 354,
        amplitudeFt: -10.5,
        halfWaves: 2,
      },
      {
        id: 'bascule_approach',
        name: 'Bascule Approach Hook',
        direction: 'right',
        startFt: 364,
        endFt: 412,
        amplitudeFt: 7.5,
        halfWaves: 1,
      },
      {
        id: 'bascule_exit',
        name: 'Bascule Exit Hook',
        direction: 'left',
        startFt: 466,
        endFt: 516,
        amplitudeFt: -8.0,
        halfWaves: 1,
      },
      {
        id: 'triple_cannon_slalom',
        name: 'Triple Cannon Slalom S-Curve',
        direction: 's_curve',
        startFt: 524,
        endFt: 664,
        amplitudeFt: 13.5,
        halfWaves: 2,
      },
    ],
    obstacles: [
      {
        id: 'sh_bollard_1',
        name: 'Harbor Port Bollard',
        type: 'chicane_bollard',
        emoji: '🚧',
        distanceFt: 82,
        lengthFt: 4,
        lateralCenterFt: -0.76,
        halfWidthFt: 0.42,
        intensity: 1.0,
        warningText: 'BOLLARD LEFT — KEEP RIGHT!',
      },
      {
        id: 'sh_foam_1',
        name: 'Kelp Foam Slick',
        type: 'foam_slick',
        emoji: '🧼',
        distanceFt: 135,
        lengthFt: 20,
        lateralCenterFt: 0,
        halfWidthFt: 1.4,
        intensity: 1.0,
        warningText: 'KELP FOAM SLICK — HOLD LEAN!',
      },
      {
        id: 'sh_bollard_2',
        name: 'Harbor Starboard Bollard',
        type: 'chicane_bollard',
        emoji: '🚧',
        distanceFt: 185,
        lengthFt: 4,
        lateralCenterFt: 0.76,
        halfWidthFt: 0.42,
        intensity: 1.0,
        warningText: 'BOLLARD RIGHT — KEEP LEFT!',
      },
      {
        id: 'sh_wind_1',
        name: 'Sea Breeze Crosswind',
        type: 'wind_gust',
        emoji: '💨',
        distanceFt: 280,
        lengthFt: 28,
        lateralCenterFt: 0,
        halfWidthFt: 1.5,
        intensity: 1.0,
        warningText: 'SEA BREEZE SQUALL — LEAN IN!',
      },
      {
        id: 'sh_pendulum_1',
        name: 'Harbor Bell Buoy Pendulum',
        type: 'swing_pendulum',
        emoji: '🎯',
        distanceFt: 388,
        lengthFt: 5,
        lateralCenterFt: 0,
        halfWidthFt: 0.46,
        intensity: 1.05,
        swingFreqRadS: 2.5,
        swingPhaseRad: 0.0,
        warningText: 'SWINGING HARBOR BUOY AHEAD!',
      },
      {
        id: 'sh_boost_1',
        name: 'Bascule Turbo Strip',
        type: 'boost_pad',
        emoji: '⚡',
        distanceFt: 408,
        lengthFt: 10,
        lateralCenterFt: -0.25,
        halfWidthFt: 0.55,
        intensity: 1.0,
        warningText: 'TURBO BOOST STRIP!',
      },
      {
        id: 'sh_bollard_3',
        name: 'Mid-Pier Chicane Bollard',
        type: 'chicane_bollard',
        emoji: '🚧',
        distanceFt: 495,
        lengthFt: 4,
        lateralCenterFt: -0.75,
        halfWidthFt: 0.42,
        intensity: 1.05,
        warningText: 'CHICANE BOLLARD LEFT!',
      },
      {
        id: 'sh_foam_2',
        name: 'Cannon Wash Slick',
        type: 'foam_slick',
        emoji: '🧼',
        distanceFt: 590,
        lengthFt: 20,
        lateralCenterFt: 0,
        halfWidthFt: 1.4,
        intensity: 1.05,
        warningText: 'CANNON WASH SLICK!',
      },
      {
        id: 'sh_pendulum_2',
        name: 'Sunset Gantry Pendulum',
        type: 'swing_pendulum',
        emoji: '🎯',
        distanceFt: 635,
        lengthFt: 5,
        lateralCenterFt: 0,
        halfWidthFt: 0.46,
        intensity: 1.1,
        swingFreqRadS: 2.7,
        swingPhaseRad: 1.2,
        warningText: 'SWINGING GANTRY BUOY!',
      },
      {
        id: 'sh_bollard_4',
        name: 'Ramp Entry Bollard',
        type: 'chicane_bollard',
        emoji: '🚧',
        distanceFt: 662,
        lengthFt: 4,
        lateralCenterFt: 0.8,
        halfWidthFt: 0.4,
        intensity: 1.0,
        warningText: 'BOLLARD RIGHT — SPRINT FOR RAMP!',
      },
    ],
  },

  // ==========================================================================
  // COURSE 3: Neon Cyber Marina (1,000 FT)
  // ==========================================================================
  {
    id: 'cyber_marina',
    name: 'Neon Cyber Marina',
    subtitle: '1,000 FT Twilight Electric Hairpins & Laser Chicanes',
    emoji: '⚡',
    difficultyStars: 3,
    difficultyLabel: 'Expert',
    lengthFt: 1000,
    parTimeSec: 52.0,
    beamHalfWidthFt: 1.5,
    rollersStartFt: 260,
    rollersEndFt: 450,
    rollerWavelengthFt: 12,
    rollerAmplitudeFt: 1.15,
    seesawFulcrumFt: 550,
    seesawHalfLengthFt: 24,
    seesawStartFt: 526,
    seesawEndFt: 574,
    waterCannonStationsFt: [700, 760, 815],
    takeoffRampStartFt: 844,
    gapStartFt: 860,
    gapEndFt: 885,
    finishDeckStartFt: 930,
    finishBellFt: 1000,
    description:
      'A 1,000-foot twilight marina circuit illuminated by cyan and magenta floodlights. Features tight laser hairpins, cyber slalom pylons, cryo-foam slicks, 190-ft high-frequency rollers, swinging neon pendulums, and a high-speed gap jump.',
    badgeColor: '#06b6d4',
    theme: {
      skyTopHex: '#1e1b4b',
      skyHorizonHex: '#312e81',
      fogHex: '#312e81',
      fogDensity: 0.0024,
      waterHex: '#0891b2',
      waterDeepHex: '#0f172a',
      sunColorHex: '#e0f2fe',
      sunIntensity: 1.75,
      ambientIntensity: 0.85,
      deckWoodHex: '#334155',
      beamDeckHex: '#22d3ee',
    },
    sectors: [
      {
        id: 'dock',
        name: 'SECTOR 1: CYBER LAUNCH PAD',
        emoji: '⚓',
        advice: 'Sync Stoker Cadence & Launch!',
        startFt: 0,
        endFt: 40,
        widthFt: 8.0,
        color: '#38bdf8',
      },
      {
        id: 'beam_1',
        name: 'SECTOR 2: LASER CHICANE CAUSEWAY',
        emoji: '📏',
        advice: '220 FT Precision S-Curves & Pylons!',
        startFt: 40,
        endFt: 260,
        widthFt: 3.0,
        color: '#4ade80',
      },
      {
        id: 'rollers',
        name: 'SECTOR 3: PULSE WAVE ROLLERS',
        emoji: '🌊',
        advice: '190 FT Sinusoidal Wave & Curve Section!',
        startFt: 260,
        endFt: 450,
        widthFt: 3.0,
        color: '#facc15',
      },
      {
        id: 'seesaw',
        name: 'SECTOR 4: CYBER PIVOT BRIDGE',
        emoji: '⚖️',
        advice: 'Charge the Fulcrum at 550 FT!',
        startFt: 450,
        endFt: 650,
        widthFt: 3.0,
        color: '#fb923c',
      },
      {
        id: 'water_cannon',
        name: 'SECTOR 5: HYDRO PULSE HAIRPINS',
        emoji: '💦',
        advice: 'Counter-Lean Hydro Blasts & Pendulums!',
        startFt: 650,
        endFt: 860,
        widthFt: 3.0,
        color: '#38bdf8',
      },
      {
        id: 'gap_jump',
        name: 'SECTOR 6: NEON SKY GAP JUMP',
        emoji: '🚀',
        advice: 'Hit 19.5+ MPH & Keep Roll Level!',
        startFt: 860,
        endFt: 930,
        widthFt: 3.0,
        color: '#f43f5e',
      },
      {
        id: 'finish_bell',
        name: 'SECTOR 7: MARINA GRAND BELL',
        emoji: '🔔',
        advice: 'Ring the 1,000 FT Finish Bell!',
        startFt: 930,
        endFt: 1000,
        widthFt: 8.0,
        color: '#fbbf24',
      },
    ],
    curves: [
      {
        id: 'laser_chicane_1',
        name: 'Laser Causeway S-Bend',
        direction: 's_curve',
        startFt: 48,
        endFt: 150,
        amplitudeFt: 13.0,
        halfWaves: 2,
      },
      {
        id: 'laser_chicane_2',
        name: 'Cyber Marina Left Hairpin',
        direction: 'left',
        startFt: 154,
        endFt: 254,
        amplitudeFt: -12.0,
        halfWaves: 1,
      },
      {
        id: 'pulse_roller_s',
        name: 'Pulse Roller S-Curve',
        direction: 's_curve',
        startFt: 266,
        endFt: 444,
        amplitudeFt: 12.5,
        halfWaves: 2,
      },
      {
        id: 'pivot_approach',
        name: 'Cyber Pivot Approach Sweep',
        direction: 'left',
        startFt: 454,
        endFt: 520,
        amplitudeFt: -9.5,
        halfWaves: 1,
      },
      {
        id: 'pivot_exit',
        name: 'Cyber Pivot Exit Sweep',
        direction: 'right',
        startFt: 580,
        endFt: 646,
        amplitudeFt: 9.5,
        halfWaves: 1,
      },
      {
        id: 'hydro_pulse_hairpin',
        name: 'Hydro Pulse S-Gauntlet',
        direction: 's_curve',
        startFt: 654,
        endFt: 838,
        amplitudeFt: -15.5,
        halfWaves: 2,
      },
    ],
    obstacles: [
      {
        id: 'cm_bollard_1',
        name: 'Neon Pylon Left',
        type: 'chicane_bollard',
        emoji: '🚧',
        distanceFt: 85,
        lengthFt: 4,
        lateralCenterFt: -0.74,
        halfWidthFt: 0.44,
        intensity: 1.1,
        warningText: 'NEON PYLON LEFT — STEER RIGHT!',
      },
      {
        id: 'cm_bollard_2',
        name: 'Neon Pylon Right',
        type: 'chicane_bollard',
        emoji: '🚧',
        distanceFt: 132,
        lengthFt: 4,
        lateralCenterFt: 0.74,
        halfWidthFt: 0.44,
        intensity: 1.1,
        warningText: 'NEON PYLON RIGHT — STEER LEFT!',
      },
      {
        id: 'cm_foam_1',
        name: 'Cryo-Coolant Slick',
        type: 'foam_slick',
        emoji: '🧼',
        distanceFt: 195,
        lengthFt: 22,
        lateralCenterFt: 0,
        halfWidthFt: 1.4,
        intensity: 1.15,
        warningText: 'CRYO SLICK — LOW TIRE GRIP!',
      },
      {
        id: 'cm_bollard_3',
        name: 'Causeway Exit Pylon',
        type: 'chicane_bollard',
        emoji: '🚧',
        distanceFt: 242,
        lengthFt: 4,
        lateralCenterFt: -0.74,
        halfWidthFt: 0.44,
        intensity: 1.1,
        warningText: 'PYLON LEFT — THREAD THE NEEDLE!',
      },
      {
        id: 'cm_wind_1',
        name: 'Turbine Crosswind Blast',
        type: 'wind_gust',
        emoji: '💨',
        distanceFt: 345,
        lengthFt: 30,
        lateralCenterFt: 0,
        halfWidthFt: 1.5,
        intensity: 1.15,
        warningText: 'TURBINE CROSSWIND — LEAN HARD!',
      },
      {
        id: 'cm_pendulum_1',
        name: 'Cyber Drone Pendulum 1',
        type: 'swing_pendulum',
        emoji: '🎯',
        distanceFt: 488,
        lengthFt: 5,
        lateralCenterFt: 0,
        halfWidthFt: 0.48,
        intensity: 1.15,
        swingFreqRadS: 2.9,
        swingPhaseRad: 0.5,
        warningText: 'SWINGING CYBER BUOY AHEAD!',
      },
      {
        id: 'cm_boost_1',
        name: 'Pivot Overdrive Pad',
        type: 'boost_pad',
        emoji: '⚡',
        distanceFt: 515,
        lengthFt: 12,
        lateralCenterFt: 0.2,
        halfWidthFt: 0.55,
        intensity: 1.1,
        warningText: 'OVERDRIVE BOOST PAD!',
      },
      {
        id: 'cm_bollard_4',
        name: 'Pivot Exit Pylon',
        type: 'chicane_bollard',
        emoji: '🚧',
        distanceFt: 615,
        lengthFt: 4,
        lateralCenterFt: 0.75,
        halfWidthFt: 0.44,
        intensity: 1.15,
        warningText: 'PYLON RIGHT — CUT INSIDE!',
      },
      {
        id: 'cm_foam_2',
        name: 'Hydro Pulse Slick',
        type: 'foam_slick',
        emoji: '🧼',
        distanceFt: 730,
        lengthFt: 22,
        lateralCenterFt: 0,
        halfWidthFt: 1.4,
        intensity: 1.2,
        warningText: 'HYDRO SLICK — WATCH YOUR ROLL!',
      },
      {
        id: 'cm_pendulum_2',
        name: 'Cyber Drone Pendulum 2',
        type: 'swing_pendulum',
        emoji: '🎯',
        distanceFt: 788,
        lengthFt: 5,
        lateralCenterFt: 0,
        halfWidthFt: 0.48,
        intensity: 1.2,
        swingFreqRadS: 3.1,
        swingPhaseRad: 1.8,
        warningText: 'FAST SWINGING BUOY GATE!',
      },
      {
        id: 'cm_wind_2',
        name: 'Marina Squall Tunnel',
        type: 'wind_gust',
        emoji: '💨',
        distanceFt: 810,
        lengthFt: 22,
        lateralCenterFt: 0,
        halfWidthFt: 1.5,
        intensity: 1.15,
        warningText: 'MARINA CROSSWIND SQUALL!',
      },
      {
        id: 'cm_bollard_5',
        name: 'Kicker Approach Pylon',
        type: 'chicane_bollard',
        emoji: '🚧',
        distanceFt: 834,
        lengthFt: 4,
        lateralCenterFt: -0.78,
        halfWidthFt: 0.42,
        intensity: 1.15,
        warningText: 'FINAL PYLON LEFT — HIT THE RAMP!',
      },
    ],
  },

  // ==========================================================================
  // COURSE 4: Kraken Storm Gauntlet (1,200 FT)
  // ==========================================================================
  {
    id: 'kraken_gauntlet',
    name: 'Kraken Storm Gauntlet',
    subtitle: '1,200 FT North Sea Maelstrom Curves & Obstacle Pier',
    emoji: '🐙',
    difficultyStars: 4,
    difficultyLabel: 'Extreme',
    lengthFt: 1200,
    parTimeSec: 62.0,
    beamHalfWidthFt: 1.5,
    rollersStartFt: 310,
    rollersEndFt: 540,
    rollerWavelengthFt: 12,
    rollerAmplitudeFt: 1.2,
    seesawFulcrumFt: 660,
    seesawHalfLengthFt: 25,
    seesawStartFt: 635,
    seesawEndFt: 685,
    waterCannonStationsFt: [835, 900, 965, 1005],
    takeoffRampStartFt: 1019,
    gapStartFt: 1035,
    gapEndFt: 1060,
    finishDeckStartFt: 1115,
    finishBellFt: 1200,
    description:
      'The ultimate 1,200-foot North Sea pier marathon! Survive relentless S-chicanes, storm bollards, Kraken ink/foam slicks, 230 feet of heavy storm rollers, a 50-ft seesaw bridge, swinging storm buoys, four water cannon batteries, and the final leap to glory.',
    badgeColor: '#ef4444',
    theme: {
      skyTopHex: '#1e293b',
      skyHorizonHex: '#64748b',
      fogHex: '#64748b',
      fogDensity: 0.0021,
      waterHex: '#0f766e',
      waterDeepHex: '#042f2e',
      sunColorHex: '#f1f5f9',
      sunIntensity: 1.7,
      ambientIntensity: 0.8,
      deckWoodHex: '#451a03',
      beamDeckHex: '#facc15',
    },
    sectors: [
      {
        id: 'dock',
        name: 'SECTOR 1: NORTH SEA DOCK',
        emoji: '⚓',
        advice: 'Max Hype & Launch into the Storm!',
        startFt: 0,
        endFt: 45,
        widthFt: 8.0,
        color: '#38bdf8',
      },
      {
        id: 'beam_1',
        name: 'SECTOR 2: SERPENT BREAKWATER BEAM',
        emoji: '📏',
        advice: '265 FT Double S-Curves & Bollards!',
        startFt: 45,
        endFt: 310,
        widthFt: 3.0,
        color: '#4ade80',
      },
      {
        id: 'rollers',
        name: 'SECTOR 3: KRAKEN TIDE ROLLERS',
        emoji: '🌊',
        advice: '230 FT Heavy Curving Storm Rollers!',
        startFt: 310,
        endFt: 540,
        widthFt: 3.0,
        color: '#facc15',
      },
      {
        id: 'seesaw',
        name: 'SECTOR 4: GALE SEESAW BRIDGE',
        emoji: '⚖️',
        advice: 'Sprint Up the 660 FT Fulcrum!',
        startFt: 540,
        endFt: 780,
        widthFt: 3.0,
        color: '#fb923c',
      },
      {
        id: 'water_cannon',
        name: 'SECTOR 5: QUAD CANNON MAELSTROM',
        emoji: '💦',
        advice: 'Survive 4 Cannon Blasts & Hairpins!',
        startFt: 780,
        endFt: 1035,
        widthFt: 3.0,
        color: '#38bdf8',
      },
      {
        id: 'gap_jump',
        name: 'SECTOR 6: ABYSSAL GAP JUMP',
        emoji: '🚀',
        advice: 'Full Sprint Across the Abyss!',
        startFt: 1035,
        endFt: 1115,
        widthFt: 3.0,
        color: '#f43f5e',
      },
      {
        id: 'finish_bell',
        name: 'SECTOR 7: KRAKEN VICTORY BELL',
        emoji: '🔔',
        advice: 'Conquer 1,200 FT & Ring the Bell!',
        startFt: 1115,
        endFt: 1200,
        widthFt: 8.0,
        color: '#fbbf24',
      },
    ],
    curves: [
      {
        id: 'breakwater_s_1',
        name: 'North Sea Breakwater S-Curve',
        direction: 's_curve',
        startFt: 52,
        endFt: 180,
        amplitudeFt: -14.5,
        halfWaves: 2,
      },
      {
        id: 'breakwater_s_2',
        name: 'Gale Force Double Chicane',
        direction: 's_curve',
        startFt: 184,
        endFt: 304,
        amplitudeFt: 15.0,
        halfWaves: 2,
      },
      {
        id: 'kraken_roller_twist',
        name: 'Kraken Tide Roller Serpent',
        direction: 's_curve',
        startFt: 316,
        endFt: 534,
        amplitudeFt: -14.0,
        halfWaves: 2,
      },
      {
        id: 'gale_bridge_entry',
        name: 'Tempest Seesaw Approach',
        direction: 'right',
        startFt: 544,
        endFt: 628,
        amplitudeFt: 11.5,
        halfWaves: 1,
      },
      {
        id: 'gale_bridge_exit',
        name: 'Whirlpool Seesaw Exit',
        direction: 'left',
        startFt: 690,
        endFt: 774,
        amplitudeFt: -11.5,
        halfWaves: 1,
      },
      {
        id: 'quad_cannon_maelstrom',
        name: 'Quad Cannon Maelstrom S-Gauntlet',
        direction: 's_curve',
        startFt: 784,
        endFt: 1012,
        amplitudeFt: 17.5,
        halfWaves: 2,
      },
    ],
    obstacles: [
      {
        id: 'kg_bollard_1',
        name: 'Breakwater Iron Bollard 1',
        type: 'chicane_bollard',
        emoji: '🚧',
        distanceFt: 90,
        lengthFt: 4,
        lateralCenterFt: 0.72,
        halfWidthFt: 0.45,
        intensity: 1.2,
        warningText: 'IRON BOLLARD RIGHT — STEER LEFT!',
      },
      {
        id: 'kg_foam_1',
        name: 'Kraken Sea-Foam Slick',
        type: 'foam_slick',
        emoji: '🧼',
        distanceFt: 145,
        lengthFt: 24,
        lateralCenterFt: 0,
        halfWidthFt: 1.45,
        intensity: 1.25,
        warningText: 'STORM FOAM SLICK — HOLD LEAN!',
      },
      {
        id: 'kg_bollard_2',
        name: 'Breakwater Iron Bollard 2',
        type: 'chicane_bollard',
        emoji: '🚧',
        distanceFt: 215,
        lengthFt: 4,
        lateralCenterFt: -0.72,
        halfWidthFt: 0.45,
        intensity: 1.2,
        warningText: 'IRON BOLLARD LEFT — STEER RIGHT!',
      },
      {
        id: 'kg_bollard_3',
        name: 'Breakwater Iron Bollard 3',
        type: 'chicane_bollard',
        emoji: '🚧',
        distanceFt: 278,
        lengthFt: 4,
        lateralCenterFt: 0.72,
        halfWidthFt: 0.45,
        intensity: 1.2,
        warningText: 'IRON BOLLARD RIGHT — THREAD LEFT!',
      },
      {
        id: 'kg_wind_1',
        name: 'North Sea Gale Squall',
        type: 'wind_gust',
        emoji: '💨',
        distanceFt: 380,
        lengthFt: 35,
        lateralCenterFt: 0,
        halfWidthFt: 1.5,
        intensity: 1.25,
        warningText: 'GALE SQUALL — COUNTER-LEAN HARD!',
      },
      {
        id: 'kg_foam_2',
        name: 'Roller Spray Slick',
        type: 'foam_slick',
        emoji: '🧼',
        distanceFt: 475,
        lengthFt: 22,
        lateralCenterFt: 0,
        halfWidthFt: 1.45,
        intensity: 1.25,
        warningText: 'SLIPPERY ROLLER DECK!',
      },
      {
        id: 'kg_pendulum_1',
        name: 'Kraken Anchor Buoy 1',
        type: 'swing_pendulum',
        emoji: '🎯',
        distanceFt: 585,
        lengthFt: 5,
        lateralCenterFt: 0,
        halfWidthFt: 0.5,
        intensity: 1.3,
        swingFreqRadS: 3.2,
        swingPhaseRad: 0.3,
        warningText: 'HEAVY SWINGING BUOY GATE!',
      },
      {
        id: 'kg_boost_1',
        name: 'Gale Bridge Turbo Pad',
        type: 'boost_pad',
        emoji: '⚡',
        distanceFt: 622,
        lengthFt: 12,
        lateralCenterFt: -0.2,
        halfWidthFt: 0.55,
        intensity: 1.15,
        warningText: 'TURBO BOOST PAD!',
      },
      {
        id: 'kg_bollard_4',
        name: 'Bridge Exit Bollard',
        type: 'chicane_bollard',
        emoji: '🚧',
        distanceFt: 735,
        lengthFt: 4,
        lateralCenterFt: -0.74,
        halfWidthFt: 0.45,
        intensity: 1.25,
        warningText: 'BOLLARD LEFT — HUG STARBOARD!',
      },
      {
        id: 'kg_bollard_5',
        name: 'Maelstrom Entry Bollard',
        type: 'chicane_bollard',
        emoji: '🚧',
        distanceFt: 810,
        lengthFt: 4,
        lateralCenterFt: 0.74,
        halfWidthFt: 0.45,
        intensity: 1.25,
        warningText: 'BOLLARD RIGHT — HUG PORT!',
      },
      {
        id: 'kg_foam_3',
        name: 'Maelstrom Cannon Slick',
        type: 'foam_slick',
        emoji: '🧼',
        distanceFt: 870,
        lengthFt: 24,
        lateralCenterFt: 0,
        halfWidthFt: 1.45,
        intensity: 1.3,
        warningText: 'MAELSTROM FOAM SLICK!',
      },
      {
        id: 'kg_pendulum_2',
        name: 'Kraken Anchor Buoy 2',
        type: 'swing_pendulum',
        emoji: '🎯',
        distanceFt: 932,
        lengthFt: 5,
        lateralCenterFt: 0,
        halfWidthFt: 0.5,
        intensity: 1.35,
        swingFreqRadS: 3.4,
        swingPhaseRad: 2.1,
        warningText: 'RAPID SWINGING ANCHOR BUOY!',
      },
      {
        id: 'kg_wind_2',
        name: 'Abyssal Crosswind Vortex',
        type: 'wind_gust',
        emoji: '💨',
        distanceFt: 985,
        lengthFt: 26,
        lateralCenterFt: 0,
        halfWidthFt: 1.5,
        intensity: 1.3,
        warningText: 'ABYSSAL CROSSWIND — HOLD LINE!',
      },
      {
        id: 'kg_bollard_6',
        name: 'Abyss Ramp Gate Bollard',
        type: 'chicane_bollard',
        emoji: '🚧',
        distanceFt: 1012,
        lengthFt: 4,
        lateralCenterFt: -0.78,
        halfWidthFt: 0.42,
        intensity: 1.25,
        warningText: 'FINAL GATE BOLLARD — FULL SPRINT!',
      },
    ],
  },
];

export function getTandemCourseById(id?: string): TandemCourseDef {
  if (!id) return TANDEM_COURSES[0];
  return TANDEM_COURSES.find((c) => c.id === id) || TANDEM_COURSES[0];
}

/**
 * Evaluates the continuous C^2 pier centerline offset, tangent slope, heading, and curvature
 * at longitudinal station `distanceFt` (in feet) for the given course.
 */
export function getCourseCenterline(
  distanceFt: number,
  courseId?: string
): TandemCenterlinePoint {
  const course = getTandemCourseById(courseId);
  let zFt = 0;
  let dzDs = 0;
  let d2zDs2 = 0;
  let activeCurve: TandemCurveSegmentDef | null = null;

  for (const seg of course.curves) {
    if (distanceFt >= seg.startFt && distanceFt <= seg.endFt) {
      const L = Math.max(1, seg.endFt - seg.startFt);
      const u = (distanceFt - seg.startFt) / L;
      const A = seg.amplitudeFt;

      if (seg.halfWaves === 1) {
        // Raised-cosine single bend: z(u) = A * 0.5 * (1 - cos(2*pi*u))
        const twoPiU = 2 * Math.PI * u;
        zFt += A * 0.5 * (1 - Math.cos(twoPiU));
        dzDs += ((A * Math.PI) / L) * Math.sin(twoPiU);
        // Single-lobe turn curvature aligned with bend direction A across u in (0, 1)
        d2zDs2 += ((A * Math.PI * Math.PI) / (L * L)) * Math.sin(Math.PI * u);
      } else {
        // Smooth C^2 S-curve: z(u) = A * 0.65 * (cos(pi*u) - cos(3*pi*u))
        const piU = Math.PI * u;
        const threePiU = 3 * Math.PI * u;
        zFt += A * 0.65 * (Math.cos(piU) - Math.cos(threePiU));
        dzDs +=
          ((A * 0.65 * Math.PI) / L) * (-Math.sin(piU) + 3 * Math.sin(threePiU));
        // Clean two-lobe S-curve curvature without 9x third-harmonic spikes
        d2zDs2 +=
          ((2 * A * Math.PI * Math.PI) / (L * L)) * Math.sin(2 * Math.PI * u);
      }
      activeCurve = seg;
      break;
    }
  }

  const headingRad = Math.atan(dzDs);
  const denom = Math.pow(1 + dzDs * dzDs, 1.5);
  const curvatureRadFt = d2zDs2 / denom;

  let turnDirection: 'left' | 'right' | 'straight' = 'straight';
  if (curvatureRadFt > 0.0005) {
    turnDirection = 'right';
  } else if (curvatureRadFt < -0.0005) {
    turnDirection = 'left';
  } else if (dzDs > 0.025) {
    turnDirection = 'right';
  } else if (dzDs < -0.025) {
    turnDirection = 'left';
  }

  return {
    zFt,
    dzDs,
    d2zDs2,
    headingRad,
    curvatureRadFt,
    activeCurve,
    turnDirection,
  };
}

/**
 * Returns the nearest active or upcoming obstacle/curve callout within `lookaheadFt` (default 55 ft).
 */
export function getUpcomingCourseWarning(
  distanceFt: number,
  courseId?: string,
  lookaheadFt = 55
): {
  text: string;
  emoji: string;
  type: 'obstacle' | 'curve';
  distanceAheadFt: number;
} | null {
  const course = getTandemCourseById(courseId);

  for (const obs of course.obstacles) {
    const startEdge = obs.distanceFt - obs.lengthFt * 0.5;
    const endEdge = obs.distanceFt + obs.lengthFt * 0.5;
    if (distanceFt >= startEdge - lookaheadFt && distanceFt <= endEdge + 2) {
      return {
        text: obs.warningText,
        emoji: obs.emoji,
        type: 'obstacle',
        distanceAheadFt: Math.max(0, Math.round(startEdge - distanceFt)),
      };
    }
  }

  for (const curve of course.curves) {
    if (distanceFt >= curve.startFt - 40 && distanceFt <= curve.endFt - 10) {
      const cl = getCourseCenterline(Math.min(curve.endFt, distanceFt + 18), courseId);
      if (cl.turnDirection !== 'straight') {
        const dirLabel = cl.turnDirection === 'right' ? 'CURVE RIGHT ↱' : 'CURVE LEFT ↰';
        return {
          text: `${curve.name.toUpperCase()} — ${dirLabel}`,
          emoji: cl.turnDirection === 'right' ? '↱' : '↰',
          type: 'curve',
          distanceAheadFt: Math.max(0, Math.round(curve.startFt - distanceFt)),
        };
      }
    }
  }

  return null;
}

