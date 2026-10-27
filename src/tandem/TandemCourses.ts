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
}

export const DEFAULT_TANDEM_COURSE_ID: TandemCourseId = 'stalen_ros_canal';

export const TANDEM_COURSES: TandemCourseDef[] = [
  // ==========================================================================
  // COURSE 1: Stalen Ros Grand Canal (600 FT — Default Course)
  // ==========================================================================
  {
    id: 'stalen_ros_canal',
    name: 'Stalen Ros Grand Canal',
    subtitle: '600 FT Classic Dutch Over-Water Pier Sprint',
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
      'An extended 600-foot Dutch canal gauntlet featuring a 130-ft balance beam, 110-ft rhythm rollers, a 40-ft tilting seesaw bridge, dual water cannon batteries, and a 25-ft gap jump to the Golden Canal Bell.',
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
        name: 'SECTOR 2: NARROW CANAL BEAM',
        emoji: '📏',
        advice: 'Hold Centerline & Build Cadence!',
        startFt: 30,
        endFt: 160,
        widthFt: 3.0,
        color: '#4ade80',
      },
      {
        id: 'rollers',
        name: 'SECTOR 3: RHYTHM ROLLERS',
        emoji: '🌊',
        advice: 'Pump Cadence & Dampen Wobble!',
        startFt: 160,
        endFt: 270,
        widthFt: 3.0,
        color: '#facc15',
      },
      {
        id: 'seesaw',
        name: 'SECTOR 4: TILTING SEESAW BRIDGE',
        emoji: '⚖️',
        advice: 'Power Past Fulcrum at 330 FT!',
        startFt: 270,
        endFt: 390,
        widthFt: 3.0,
        color: '#fb923c',
      },
      {
        id: 'water_cannon',
        name: 'SECTOR 5: WATER CANNON GAUNTLET',
        emoji: '💦',
        advice: 'Counter-Lean Crosswind Blasts!',
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
  },

  // ==========================================================================
  // COURSE 2: Sunset Harbor Marathon (800 FT)
  // ==========================================================================
  {
    id: 'sunset_harbor',
    name: 'Sunset Harbor Marathon',
    subtitle: '800 FT Golden-Hour Pier Endurance Run',
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
      'An 800-foot golden-hour harbor crossing with 150 feet of rolling timber waves, an extended 44-ft seesaw span, three high-pressure water cannons, and a final gap jump into the sunset bell tower.',
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
        name: 'SECTOR 2: SUNSET PIER BEAM',
        emoji: '📏',
        advice: 'Steady Steering Across 175 FT!',
        startFt: 35,
        endFt: 210,
        widthFt: 3.0,
        color: '#4ade80',
      },
      {
        id: 'rollers',
        name: 'SECTOR 3: HARBOR SWELL ROLLERS',
        emoji: '🌊',
        advice: 'Hold Rhythm Over 150 FT of Swells!',
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
        name: 'SECTOR 5: TRIPLE CANNON BATTERY',
        emoji: '💦',
        advice: 'Brace Against 3 Crosswind Jets!',
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
  },

  // ==========================================================================
  // COURSE 3: Neon Cyber Marina (1,000 FT)
  // ==========================================================================
  {
    id: 'cyber_marina',
    name: 'Neon Cyber Marina',
    subtitle: '1,000 FT Twilight Electric Waterfront Sprint',
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
      'A 1,000-foot twilight marina circuit illuminated by cyan and magenta floodlights. Features a 220-ft laser balance beam, 190-ft high-frequency rollers, a 48-ft seesaw, and a high-speed gap jump.',
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
        name: 'SECTOR 2: LASER CAUSEWAY BEAM',
        emoji: '📏',
        advice: '220 FT Precision Balance Causeway!',
        startFt: 40,
        endFt: 260,
        widthFt: 3.0,
        color: '#4ade80',
      },
      {
        id: 'rollers',
        name: 'SECTOR 3: PULSE WAVE ROLLERS',
        emoji: '🌊',
        advice: '190 FT Sinusoidal Wave Section!',
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
        name: 'SECTOR 5: HYDRO PULSE CANNONS',
        emoji: '💦',
        advice: 'Counter-Lean Hydro Blasts!',
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
  },

  // ==========================================================================
  // COURSE 4: Kraken Storm Gauntlet (1,200 FT)
  // ==========================================================================
  {
    id: 'kraken_gauntlet',
    name: 'Kraken Storm Gauntlet',
    subtitle: '1,200 FT Ultimate North Sea Over-Water Pier',
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
      'The ultimate 1,200-foot North Sea pier marathon! Survive 265 feet of open causeway, 230 feet of heavy storm rollers, a 50-ft seesaw bridge, four relentless water cannon batteries, and the final leap to glory.',
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
        name: 'SECTOR 2: BREAKWATER CAUSEWAY',
        emoji: '📏',
        advice: '265 FT Narrow Breakwater Beam!',
        startFt: 45,
        endFt: 310,
        widthFt: 3.0,
        color: '#4ade80',
      },
      {
        id: 'rollers',
        name: 'SECTOR 3: KRAKEN TIDE ROLLERS',
        emoji: '🌊',
        advice: '230 FT Heavy Storm Rollers!',
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
        name: 'SECTOR 5: QUAD CANNON BARRAGE',
        emoji: '💦',
        advice: 'Survive 4 Water Cannon Blasts!',
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
  },
];

export function getTandemCourseById(id?: string): TandemCourseDef {
  if (!id) return TANDEM_COURSES[0];
  return TANDEM_COURSES.find((c) => c.id === id) || TANDEM_COURSES[0];
}
