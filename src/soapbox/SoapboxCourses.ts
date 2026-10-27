import { SoapboxObstacle } from './SoapboxPhysicsEngine';

export type SoapboxCourseId =
  | 'alpine_panorama'
  | 'canyon_plunge'
  | 'urban_downhill'
  | 'extreme_peak';

export type SoapboxDifficultyRating = 1 | 2 | 3 | 4;

export interface SoapboxCourseVisualTheme {
  skyColor: string;
  fogColor: string;
  fogDensity: number;
  hemiSkyColor: string;
  hemiGroundColor: string;
  sunColor: string;
  sunPosition: [number, number, number];
  grassColor: string;
  grassAltColor: string;
  asphaltColor: string;
  cobbleColor: string;
  curbColorPrimary: string;
  curbColorSecondary: string;
  sceneryType: 'alpine_pines' | 'desert_canyon' | 'urban_alleys' | 'snow_peaks';
}

export interface SoapboxCourseSector {
  sStartFeet: number;
  sEndFeet: number;
  name: string;
}

export interface SoapboxObstacleDef {
  id: string;
  type: 'hay_bale' | 'cobble_strip' | 'water_slick' | 'kicker_jump' | 'speed_gate';
  sFeet: number;
  lengthFeet: number;
  lateralCenterFeet: number;
  halfWidthFeet: number;
}

export interface SoapboxCourseDef {
  id: SoapboxCourseId;
  name: string;
  subtitle: string;
  tagline: string;
  description: string;
  difficulty: SoapboxDifficultyRating;
  difficultyStars: number;
  difficultyLabel: 'Beginner' | 'Challenging' | 'Expert' | 'Extreme';
  emoji: string;
  lengthFeet: number;
  startRampFeet: number;
  startElevationFeet: number;
  finishElevationFeet: number;
  totalElevationDropFeet: number;
  totalDropFeet: number;
  dropFeet: number;
  averageGradePercent: number;
  averageGradePct: number;
  avgGradePercent: number;
  maxDownhillGradePercent: number;
  peakGradePercent: number;
  surfaceType: string;
  hazardsDescription: string;
  parTimeSec: number;
  visualTheme: SoapboxCourseVisualTheme;
  theme: SoapboxCourseVisualTheme;
  sectors: SoapboxCourseSector[];
  getElevation: (s: number) => { yFeet: number; dyDs: number };
  sampleRoad: (s: number) => { yFeet: number; dyDs: number; bankRad: number };
  getCenterline: (s: number) => { zFeet: number; dzDs: number; d2zDs2: number };
  getSurface: (s: number) => 'asphalt' | 'cobblestone';
  getSectionName: (s: number) => string;
  generateObstacles: () => SoapboxObstacle[];
  obstacles: SoapboxObstacleDef[];
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / Math.max(1e-5, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Creates closed-form harmonic elevation evaluators guaranteeing G(s) = -dy/ds >= 0.05
 */
function createHarmonicElevation(params: {
  lengthFeet: number;
  startRampFeet: number;
  startElevationFeet: number;
  rampTopElevationFeet: number;
  finishElevationFeet: number;
  harmonics: Array<{ amplitude: number; phase: number; harmonicNumber: number }>;
}) {
  const {
    lengthFeet,
    startRampFeet,
    startElevationFeet,
    rampTopElevationFeet,
    finishElevationFeet,
    harmonics,
  } = params;

  const g0 = (startElevationFeet - finishElevationFeet) / lengthFeet;
  const rampSlope = -(rampTopElevationFeet - startElevationFeet) / startRampFeet;

  return function getElevation(s: number): { yFeet: number; dyDs: number } {
    if (s <= -startRampFeet) {
      return { yFeet: rampTopElevationFeet, dyDs: rampSlope };
    }
    if (s < 0) {
      const u = (s + startRampFeet) / startRampFeet;
      const yFeet = rampTopElevationFeet - u * (rampTopElevationFeet - startElevationFeet);
      return { yFeet, dyDs: rampSlope };
    }
    if (s > lengthFeet) {
      const deltaS = s - lengthFeet;
      return {
        yFeet: finishElevationFeet - 0.05 * deltaS,
        dyDs: -0.05,
      };
    }

    let sumGradeHarmonics = 0;
    let sumIntegralHarmonics = 0;

    for (const h of harmonics) {
      const freq = (2 * Math.PI * h.harmonicNumber) / lengthFeet;
      const angle = freq * s + h.phase;
      sumGradeHarmonics += h.amplitude * Math.cos(angle);
      sumIntegralHarmonics += (h.amplitude / freq) * (Math.sin(angle) - Math.sin(h.phase));
    }

    const downhillGrade = g0 + sumGradeHarmonics;
    const dyDs = -downhillGrade;
    const yFeet = startElevationFeet - g0 * s - sumIntegralHarmonics;

    return { yFeet, dyDs };
  };
}

function createCenterlineEvaluator(lengthFeet: number, waveFn: (s: number) => number) {
  const getRawZ = (dist: number): number => {
    if (dist <= 0) return 0;
    if (dist >= lengthFeet) return 0;
    const entry = smoothstep(0, 55, dist);
    const exit = 1 - smoothstep(lengthFeet - 65, lengthFeet, dist);
    return waveFn(dist) * entry * exit;
  };

  return function getCenterline(s: number): { zFeet: number; dzDs: number; d2zDs2: number } {
    const delta = 0.5;
    const zFeet = getRawZ(s);
    const zPlus = getRawZ(s + delta);
    const zMinus = getRawZ(s - delta);
    const dzDs = (zPlus - zMinus) / (2 * delta);
    const d2zDs2 = (zPlus - 2 * zFeet + zMinus) / (delta * delta);
    return { zFeet, dzDs, d2zDs2 };
  };
}

function createSampleRoad(
  getElevation: (s: number) => { yFeet: number; dyDs: number },
  getCenterline: (s: number) => { zFeet: number; dzDs: number; d2zDs2: number }
) {
  return function sampleRoad(s: number): { yFeet: number; dyDs: number; bankRad: number } {
    const elev = getElevation(s);
    const center = getCenterline(s);
    const denom = Math.pow(1 + center.dzDs * center.dzDs, 1.5);
    const curvature = clamp(center.d2zDs2 / Math.max(1e-5, denom), -0.035, 0.035);
    const bankRad = clamp(curvature * 2.8, -0.15, 0.15);
    return { yFeet: elev.yFeet, dyDs: elev.dyDs, bankRad };
  };
}

// ==============================================================================
// 1. ALPINE PANORAMA (1,000 FT, DROP: 111.5 FT, 1/4 BEGINNER)
// ==============================================================================
const alpineElevation = createHarmonicElevation({
  lengthFeet: 1000,
  startRampFeet: 40,
  startElevationFeet: 112.0,
  rampTopElevationFeet: 123.5,
  finishElevationFeet: 0.0,
  harmonics: [
    { amplitude: 0.024, phase: 0.0, harmonicNumber: 1 },
    { amplitude: 0.015, phase: Math.PI / 3, harmonicNumber: 2 },
  ],
});

const alpineCenterline = createCenterlineEvaluator(1000, (s) => {
  return (
    38 * Math.sin(0.0125 * s) +
    16 * Math.sin(0.026 * s - 0.6) +
    44 * Math.exp(-Math.pow((s - 620) / 68, 2)) * Math.sin(0.036 * (s - 540))
  );
});

const alpineTheme: SoapboxCourseVisualTheme = {
  skyColor: '#38bdf8',
  fogColor: '#bae6fd',
  fogDensity: 0.0022,
  hemiSkyColor: '#bae6fd',
  hemiGroundColor: '#166534',
  sunColor: '#fffbeb',
  sunPosition: [120, 180, 90],
  grassColor: '#15803d',
  grassAltColor: '#166534',
  asphaltColor: '#1e293b',
  cobbleColor: '#64748b',
  curbColorPrimary: '#dc2626',
  curbColorSecondary: '#f8fafc',
  sceneryType: 'alpine_pines',
};

const alpineSectors: SoapboxCourseSector[] = [
  { sStartFeet: 0, sEndFeet: 220, name: 'Pine Crest S-Bends' },
  { sStartFeet: 220, sEndFeet: 480, name: 'Cobblestone Village Descent' },
  { sStartFeet: 480, sEndFeet: 720, name: "Deadman's Hairpin Chute" },
  { sStartFeet: 720, sEndFeet: 1000, name: 'High-Speed Finish Boulevard' },
];

const alpineObstaclesDef: SoapboxObstacleDef[] = [
  { id: 'alp_bale_1', type: 'hay_bale', sFeet: 95, lengthFeet: 8, lateralCenterFeet: 6.2, halfWidthFeet: 2.2 },
  { id: 'alp_slick_1', type: 'water_slick', sFeet: 148, lengthFeet: 18, lateralCenterFeet: -2.0, halfWidthFeet: 4.8 },
  { id: 'alp_bale_2', type: 'hay_bale', sFeet: 186, lengthFeet: 8, lateralCenterFeet: -6.4, halfWidthFeet: 2.2 },
  { id: 'alp_gate_1', type: 'speed_gate', sFeet: 222, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'alp_cobble_1', type: 'cobble_strip', sFeet: 275, lengthFeet: 45, lateralCenterFeet: 0.0, halfWidthFeet: 9.0 },
  { id: 'alp_jump_1', type: 'kicker_jump', sFeet: 310, lengthFeet: 16, lateralCenterFeet: 0.0, halfWidthFeet: 6.5 },
  { id: 'alp_bale_3', type: 'hay_bale', sFeet: 385, lengthFeet: 8, lateralCenterFeet: 6.0, halfWidthFeet: 2.2 },
  { id: 'alp_slick_2', type: 'water_slick', sFeet: 412, lengthFeet: 20, lateralCenterFeet: 3.2, halfWidthFeet: 5.0 },
  { id: 'alp_cobble_2', type: 'cobble_strip', sFeet: 445, lengthFeet: 55, lateralCenterFeet: 0.0, halfWidthFeet: 9.0 },
  { id: 'alp_bale_4', type: 'hay_bale', sFeet: 462, lengthFeet: 8, lateralCenterFeet: -6.5, halfWidthFeet: 2.2 },
  { id: 'alp_bale_5', type: 'hay_bale', sFeet: 538, lengthFeet: 8, lateralCenterFeet: 5.8, halfWidthFeet: 2.2 },
  { id: 'alp_gate_2', type: 'speed_gate', sFeet: 542, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'alp_bale_6', type: 'hay_bale', sFeet: 620, lengthFeet: 8, lateralCenterFeet: -6.2, halfWidthFeet: 2.2 },
  { id: 'alp_slick_3', type: 'water_slick', sFeet: 668, lengthFeet: 22, lateralCenterFeet: -2.8, halfWidthFeet: 5.2 },
  { id: 'alp_jump_2', type: 'kicker_jump', sFeet: 720, lengthFeet: 18, lateralCenterFeet: 0.0, halfWidthFeet: 7.0 },
  { id: 'alp_bale_7', type: 'hay_bale', sFeet: 755, lengthFeet: 8, lateralCenterFeet: 6.6, halfWidthFeet: 2.2 },
  { id: 'alp_gate_3', type: 'speed_gate', sFeet: 768, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'alp_cobble_3', type: 'cobble_strip', sFeet: 835, lengthFeet: 50, lateralCenterFeet: 0.0, halfWidthFeet: 9.0 },
  { id: 'alp_bale_8', type: 'hay_bale', sFeet: 842, lengthFeet: 8, lateralCenterFeet: -6.0, halfWidthFeet: 2.2 },
  { id: 'alp_slick_4', type: 'water_slick', sFeet: 895, lengthFeet: 22, lateralCenterFeet: 1.5, halfWidthFeet: 5.0 },
  { id: 'alp_gate_4', type: 'speed_gate', sFeet: 958, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
];

export const alpinePanoramaCourse: SoapboxCourseDef = {
  id: 'alpine_panorama',
  name: 'Alpine Panorama',
  subtitle: 'Austrian Alpine Pass & Old Town Cobbles',
  tagline: 'Austrian Alpine Pass & Old Town Cobbles',
  description: 'Descend through pristine Austrian pine slopes into high-speed cobblestone hairpins.',
  difficulty: 1,
  difficultyStars: 1,
  difficultyLabel: 'Beginner',
  emoji: '🏔️',
  lengthFeet: 1000,
  startRampFeet: 40,
  startElevationFeet: 112.0,
  finishElevationFeet: 0.0,
  totalElevationDropFeet: 112.0,
  totalDropFeet: 112.0,
  dropFeet: 112.0,
  averageGradePercent: -11.2,
  averageGradePct: -11.2,
  avgGradePercent: -11.2,
  maxDownhillGradePercent: -15.1,
  peakGradePercent: -15.1,
  surfaceType: 'asphalt / cobble',
  hazardsDescription: 'Cobble strips, hay bales, kicker jumps',
  parTimeSec: 21.5,
  visualTheme: alpineTheme,
  theme: alpineTheme,
  sectors: alpineSectors,
  getElevation: alpineElevation,
  sampleRoad: createSampleRoad(alpineElevation, alpineCenterline),
  getCenterline: alpineCenterline,
  getSurface: (s) =>
    (s >= 250 && s <= 300) || (s >= 415 && s <= 475) || (s >= 810 && s <= 865)
      ? 'cobblestone'
      : 'asphalt',
  getSectionName: (s) => {
    for (const sec of alpineSectors) {
      if (s >= sec.sStartFeet && s <= sec.sEndFeet) return sec.name;
    }
    return s < 0 ? 'Starter Chute' : 'Finish Runout';
  },
  generateObstacles: () =>
    alpineObstaclesDef.map((def) => ({
      ...def,
      triggered: false,
    })),
  obstacles: alpineObstaclesDef,
};

// ==============================================================================
// 2. CANYON PLUNGE (1,150 FT, DROP: 157.0 FT, 2/4 CHALLENGING)
// ==============================================================================
const canyonElevation = createHarmonicElevation({
  lengthFeet: 1150,
  startRampFeet: 40,
  startElevationFeet: 145.0,
  rampTopElevationFeet: 157.0,
  finishElevationFeet: 0.0,
  harmonics: [
    { amplitude: 0.040, phase: -0.5, harmonicNumber: 1 },
    { amplitude: 0.022, phase: 1.0, harmonicNumber: 2 },
  ],
});

const canyonCenterline = createCenterlineEvaluator(1150, (s) => {
  return (
    44 * Math.sin(0.011 * s) +
    20 * Math.sin(0.022 * s + 0.4) +
    48 * Math.exp(-Math.pow((s - 740) / 75, 2)) * Math.sin(0.032 * (s - 660))
  );
});

const canyonTheme: SoapboxCourseVisualTheme = {
  skyColor: '#fdba74',
  fogColor: '#fed7aa',
  fogDensity: 0.0025,
  hemiSkyColor: '#ffedd5',
  hemiGroundColor: '#9a3412',
  sunColor: '#fff7ed',
  sunPosition: [140, 160, -80],
  grassColor: '#c2410c',
  grassAltColor: '#9a3412',
  asphaltColor: '#78350f',
  cobbleColor: '#92400e',
  curbColorPrimary: '#f97316',
  curbColorSecondary: '#ffedd5',
  sceneryType: 'desert_canyon',
};

const canyonSectors: SoapboxCourseSector[] = [
  { sStartFeet: 0, sEndFeet: 280, name: 'Sandstone Rim Ridge' },
  { sStartFeet: 280, sEndFeet: 580, name: 'Coyote Gulch Plunge' },
  { sStartFeet: 580, sEndFeet: 880, name: "Devil's Cavern Sweeper" },
  { sStartFeet: 880, sEndFeet: 1150, name: 'Dust Canyon Straightaway' },
];

const canyonObstaclesDef: SoapboxObstacleDef[] = [
  { id: 'can_bale_1', type: 'hay_bale', sFeet: 110, lengthFeet: 8, lateralCenterFeet: 6.0, halfWidthFeet: 2.2 },
  { id: 'can_gate_1', type: 'speed_gate', sFeet: 140, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'can_slick_1', type: 'water_slick', sFeet: 175, lengthFeet: 20, lateralCenterFeet: -2.5, halfWidthFeet: 5.0 },
  { id: 'can_bale_2', type: 'hay_bale', sFeet: 215, lengthFeet: 8, lateralCenterFeet: -6.2, halfWidthFeet: 2.2 },
  { id: 'can_gate_2', type: 'speed_gate', sFeet: 290, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'can_bale_3', type: 'hay_bale', sFeet: 330, lengthFeet: 8, lateralCenterFeet: 6.5, halfWidthFeet: 2.2 },
  { id: 'can_slick_2', type: 'water_slick', sFeet: 360, lengthFeet: 22, lateralCenterFeet: 3.0, halfWidthFeet: 5.0 },
  { id: 'can_jump_1', type: 'kicker_jump', sFeet: 380, lengthFeet: 18, lateralCenterFeet: 0.0, halfWidthFeet: 6.8 },
  { id: 'can_bale_4', type: 'hay_bale', sFeet: 480, lengthFeet: 8, lateralCenterFeet: -5.8, halfWidthFeet: 2.2 },
  { id: 'can_slick_3', type: 'water_slick', sFeet: 520, lengthFeet: 24, lateralCenterFeet: -1.8, halfWidthFeet: 5.2 },
  { id: 'can_bale_5', type: 'hay_bale', sFeet: 570, lengthFeet: 8, lateralCenterFeet: 6.4, halfWidthFeet: 2.2 },
  { id: 'can_gate_3', type: 'speed_gate', sFeet: 610, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'can_bale_6', type: 'hay_bale', sFeet: 680, lengthFeet: 8, lateralCenterFeet: -6.2, halfWidthFeet: 2.2 },
  { id: 'can_slick_4', type: 'water_slick', sFeet: 710, lengthFeet: 22, lateralCenterFeet: 2.5, halfWidthFeet: 5.0 },
  { id: 'can_bale_7', type: 'hay_bale', sFeet: 740, lengthFeet: 8, lateralCenterFeet: 6.0, halfWidthFeet: 2.2 },
  { id: 'can_jump_2', type: 'kicker_jump', sFeet: 750, lengthFeet: 18, lateralCenterFeet: 0.0, halfWidthFeet: 7.0 },
  { id: 'can_bale_8', type: 'hay_bale', sFeet: 820, lengthFeet: 8, lateralCenterFeet: -6.5, halfWidthFeet: 2.2 },
  { id: 'can_gate_4', type: 'speed_gate', sFeet: 860, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'can_bale_9', type: 'hay_bale', sFeet: 930, lengthFeet: 8, lateralCenterFeet: 5.8, halfWidthFeet: 2.2 },
  { id: 'can_slick_5', type: 'water_slick', sFeet: 970, lengthFeet: 24, lateralCenterFeet: -2.0, halfWidthFeet: 5.2 },
  { id: 'can_jump_3', type: 'kicker_jump', sFeet: 990, lengthFeet: 20, lateralCenterFeet: 0.0, halfWidthFeet: 7.2 },
  { id: 'can_bale_10', type: 'hay_bale', sFeet: 1040, lengthFeet: 8, lateralCenterFeet: -6.0, halfWidthFeet: 2.2 },
  { id: 'can_gate_5', type: 'speed_gate', sFeet: 1080, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
];

export const canyonPlungeCourse: SoapboxCourseDef = {
  id: 'canyon_plunge',
  name: 'Canyon Plunge',
  subtitle: 'Utah Sandstone Cliffs & Plunging Drop',
  tagline: 'Utah Sandstone Cliffs & Plunging Drop',
  description: 'Carve through towering desert gorges with heavy banked sweepers and treacherous dust washes.',
  difficulty: 2,
  difficultyStars: 2,
  difficultyLabel: 'Challenging',
  emoji: '🏜️',
  lengthFeet: 1150,
  startRampFeet: 40,
  startElevationFeet: 145.0,
  finishElevationFeet: 0.0,
  totalElevationDropFeet: 145.0,
  totalDropFeet: 145.0,
  dropFeet: 145.0,
  averageGradePercent: -12.6,
  averageGradePct: -12.6,
  avgGradePercent: -12.6,
  maxDownhillGradePercent: -18.8,
  peakGradePercent: -18.8,
  surfaceType: 'asphalt & washboard',
  hazardsDescription: 'Rough washboard, oil slicks, cliff drops',
  parTimeSec: 23.8,
  visualTheme: canyonTheme,
  theme: canyonTheme,
  sectors: canyonSectors,
  getElevation: canyonElevation,
  sampleRoad: createSampleRoad(canyonElevation, canyonCenterline),
  getCenterline: canyonCenterline,
  getSurface: () => 'asphalt',
  getSectionName: (s) => {
    for (const sec of canyonSectors) {
      if (s >= sec.sStartFeet && s <= sec.sEndFeet) return sec.name;
    }
    return s < 0 ? 'Starter Chute' : 'Finish Runout';
  },
  generateObstacles: () =>
    canyonObstaclesDef.map((def) => ({
      ...def,
      triggered: false,
    })),
  obstacles: canyonObstaclesDef,
};

// ==============================================================================
// 3. URBAN DOWNHILL BLITZ (1,050 FT, DROP: 146.5 FT, 3/4 EXPERT)
// ==============================================================================
const urbanElevation = createHarmonicElevation({
  lengthFeet: 1050,
  startRampFeet: 40,
  startElevationFeet: 135.0,
  rampTopElevationFeet: 146.5,
  finishElevationFeet: 0.0,
  harmonics: [
    { amplitude: 0.045, phase: 0.2, harmonicNumber: 1 },
    { amplitude: 0.025, phase: -0.8, harmonicNumber: 2 },
  ],
});

const urbanCenterline = createCenterlineEvaluator(1050, (s) => {
  return (
    28 * Math.sin(0.016 * s) +
    18 * Math.sin(0.032 * s - 0.3) +
    36 * Math.exp(-Math.pow((s - 420) / 50, 2)) * Math.sin(0.045 * (s - 380)) +
    38 * Math.exp(-Math.pow((s - 780) / 55, 2)) * Math.cos(0.042 * (s - 740))
  );
});

const urbanTheme: SoapboxCourseVisualTheme = {
  skyColor: '#818cf8',
  fogColor: '#c7d2fe',
  fogDensity: 0.002,
  hemiSkyColor: '#e0e7ff',
  hemiGroundColor: '#334155',
  sunColor: '#fef08a',
  sunPosition: [100, 200, 100],
  grassColor: '#475569',
  grassAltColor: '#334155',
  asphaltColor: '#1e293b',
  cobbleColor: '#64748b',
  curbColorPrimary: '#e11d48',
  curbColorSecondary: '#f8fafc',
  sceneryType: 'urban_alleys',
};

const urbanSectors: SoapboxCourseSector[] = [
  { sStartFeet: 0, sEndFeet: 260, name: 'Cathedral Stair Chute' },
  { sStartFeet: 260, sEndFeet: 540, name: 'Old Town Alley Chicanes' },
  { sStartFeet: 540, sEndFeet: 780, name: 'Plaza Roundabout Jump' },
  { sStartFeet: 780, sEndFeet: 1050, name: 'Harbor Promenade Sprint' },
];

const urbanObstaclesDef: SoapboxObstacleDef[] = [
  { id: 'urb_bale_1', type: 'hay_bale', sFeet: 85, lengthFeet: 8, lateralCenterFeet: 6.2, halfWidthFeet: 2.2 },
  { id: 'urb_slick_1', type: 'water_slick', sFeet: 130, lengthFeet: 18, lateralCenterFeet: -2.0, halfWidthFeet: 4.8 },
  { id: 'urb_bale_2', type: 'hay_bale', sFeet: 160, lengthFeet: 8, lateralCenterFeet: -6.2, halfWidthFeet: 2.2 },
  { id: 'urb_gate_1', type: 'speed_gate', sFeet: 190, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'urb_bale_3', type: 'hay_bale', sFeet: 240, lengthFeet: 8, lateralCenterFeet: 6.0, halfWidthFeet: 2.2 },
  { id: 'urb_jump_1', type: 'kicker_jump', sFeet: 280, lengthFeet: 16, lateralCenterFeet: 0.0, halfWidthFeet: 6.5 },
  { id: 'urb_bale_4', type: 'hay_bale', sFeet: 310, lengthFeet: 8, lateralCenterFeet: -6.4, halfWidthFeet: 2.2 },
  { id: 'urb_slick_2', type: 'water_slick', sFeet: 370, lengthFeet: 20, lateralCenterFeet: 3.0, halfWidthFeet: 5.0 },
  { id: 'urb_gate_2', type: 'speed_gate', sFeet: 390, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'urb_bale_5', type: 'hay_bale', sFeet: 410, lengthFeet: 8, lateralCenterFeet: 5.8, halfWidthFeet: 2.2 },
  { id: 'urb_bale_6', type: 'hay_bale', sFeet: 470, lengthFeet: 8, lateralCenterFeet: -6.0, halfWidthFeet: 2.2 },
  { id: 'urb_bale_7', type: 'hay_bale', sFeet: 560, lengthFeet: 8, lateralCenterFeet: 6.2, halfWidthFeet: 2.2 },
  { id: 'urb_jump_2', type: 'kicker_jump', sFeet: 590, lengthFeet: 18, lateralCenterFeet: 0.0, halfWidthFeet: 7.0 },
  { id: 'urb_bale_8', type: 'hay_bale', sFeet: 630, lengthFeet: 8, lateralCenterFeet: -6.5, halfWidthFeet: 2.2 },
  { id: 'urb_slick_3', type: 'water_slick', sFeet: 670, lengthFeet: 22, lateralCenterFeet: -1.5, halfWidthFeet: 5.0 },
  { id: 'urb_gate_3', type: 'speed_gate', sFeet: 690, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'urb_bale_9', type: 'hay_bale', sFeet: 720, lengthFeet: 8, lateralCenterFeet: 5.9, halfWidthFeet: 2.2 },
  { id: 'urb_jump_3', type: 'kicker_jump', sFeet: 790, lengthFeet: 18, lateralCenterFeet: 0.0, halfWidthFeet: 7.0 },
  { id: 'urb_bale_10', type: 'hay_bale', sFeet: 810, lengthFeet: 8, lateralCenterFeet: -6.0, halfWidthFeet: 2.2 },
  { id: 'urb_slick_4', type: 'water_slick', sFeet: 840, lengthFeet: 20, lateralCenterFeet: 2.8, halfWidthFeet: 5.0 },
  { id: 'urb_bale_11', type: 'hay_bale', sFeet: 890, lengthFeet: 8, lateralCenterFeet: 6.2, halfWidthFeet: 2.2 },
  { id: 'urb_bale_12', type: 'hay_bale', sFeet: 970, lengthFeet: 8, lateralCenterFeet: -6.0, halfWidthFeet: 2.2 },
  { id: 'urb_gate_4', type: 'speed_gate', sFeet: 990, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
];

export const urbanDownhillCourse: SoapboxCourseDef = {
  id: 'urban_downhill',
  name: 'Urban Downhill Blitz',
  subtitle: 'Old Town Alleys & Cathedral Stairs',
  tagline: 'Old Town Alleys & Cathedral Stairs',
  description: 'Navigate razor-tight cobblestone chicanes, stair drop kickers, and harbor promenade sprints.',
  difficulty: 3,
  difficultyStars: 3,
  difficultyLabel: 'Expert',
  emoji: '🏙️',
  lengthFeet: 1050,
  startRampFeet: 40,
  startElevationFeet: 135.0,
  finishElevationFeet: 0.0,
  totalElevationDropFeet: 135.0,
  totalDropFeet: 135.0,
  dropFeet: 135.0,
  averageGradePercent: -12.9,
  averageGradePct: -12.9,
  avgGradePercent: -12.9,
  maxDownhillGradePercent: -19.9,
  peakGradePercent: -19.9,
  surfaceType: 'cobblestone & curbs',
  hazardsDescription: 'Tight chicanes, curbs, kicker jumps',
  parTimeSec: 22.0,
  visualTheme: urbanTheme,
  theme: urbanTheme,
  sectors: urbanSectors,
  getElevation: urbanElevation,
  sampleRoad: createSampleRoad(urbanElevation, urbanCenterline),
  getCenterline: urbanCenterline,
  getSurface: (s) => (s <= 650 ? 'cobblestone' : 'asphalt'),
  getSectionName: (s) => {
    for (const sec of urbanSectors) {
      if (s >= sec.sStartFeet && s <= sec.sEndFeet) return sec.name;
    }
    return s < 0 ? 'Starter Chute' : 'Finish Runout';
  },
  generateObstacles: () =>
    urbanObstaclesDef.map((def) => ({
      ...def,
      triggered: false,
    })),
  obstacles: urbanObstaclesDef,
};

// ==============================================================================
// 4. EXTREME PEAK: THE STREIF DROP (1,250 FT, DROP: 208.0 FT, 4/4 EXTREME)
// ==============================================================================
const extremeElevation = createHarmonicElevation({
  lengthFeet: 1250,
  startRampFeet: 40,
  startElevationFeet: 195.0,
  rampTopElevationFeet: 208.0,
  finishElevationFeet: 0.0,
  harmonics: [
    { amplitude: 0.065, phase: -0.9, harmonicNumber: 1 },
    { amplitude: 0.035, phase: 0.4, harmonicNumber: 2 },
  ],
});

const extremeCenterline = createCenterlineEvaluator(1250, (s) => {
  return (
    48 * Math.sin(0.01 * s) +
    24 * Math.sin(0.021 * s - 0.8) +
    52 * Math.exp(-Math.pow((s - 480) / 70, 2)) * Math.sin(0.034 * (s - 420)) +
    46 * Math.exp(-Math.pow((s - 920) / 65, 2)) * Math.sin(0.028 * (s - 850))
  );
});

const extremeTheme: SoapboxCourseVisualTheme = {
  skyColor: '#0284c7',
  fogColor: '#e0f2fe',
  fogDensity: 0.0028,
  hemiSkyColor: '#f0f9ff',
  hemiGroundColor: '#0f172a',
  sunColor: '#ffffff',
  sunPosition: [150, 190, 120],
  grassColor: '#e2e8f0',
  grassAltColor: '#cbd5e1',
  asphaltColor: '#1e293b',
  cobbleColor: '#475569',
  curbColorPrimary: '#2563eb',
  curbColorSecondary: '#ffffff',
  sceneryType: 'snow_peaks',
};

const extremeSectors: SoapboxCourseSector[] = [
  { sStartFeet: 0, sEndFeet: 240, name: 'The Mausefalle 25% Plunge' },
  { sStartFeet: 240, sEndFeet: 560, name: 'Steep Hang Drift Glissade' },
  { sStartFeet: 560, sEndFeet: 890, name: 'Hausbergkante Mega Air' },
  { sStartFeet: 890, sEndFeet: 1250, name: 'Zielschuss Final Chute' },
];

const extremeObstaclesDef: SoapboxObstacleDef[] = [
  { id: 'ext_bale_1', type: 'hay_bale', sFeet: 90, lengthFeet: 8, lateralCenterFeet: 6.0, halfWidthFeet: 2.2 },
  { id: 'ext_slick_1', type: 'water_slick', sFeet: 130, lengthFeet: 22, lateralCenterFeet: -2.5, halfWidthFeet: 5.0 },
  { id: 'ext_gate_1', type: 'speed_gate', sFeet: 150, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'ext_bale_2', type: 'hay_bale', sFeet: 180, lengthFeet: 8, lateralCenterFeet: -6.2, halfWidthFeet: 2.2 },
  { id: 'ext_bale_3', type: 'hay_bale', sFeet: 270, lengthFeet: 8, lateralCenterFeet: 6.5, halfWidthFeet: 2.2 },
  { id: 'ext_jump_1', type: 'kicker_jump', sFeet: 290, lengthFeet: 20, lateralCenterFeet: 0.0, halfWidthFeet: 7.2 },
  { id: 'ext_slick_2', type: 'water_slick', sFeet: 310, lengthFeet: 24, lateralCenterFeet: 2.2, halfWidthFeet: 5.2 },
  { id: 'ext_bale_4', type: 'hay_bale', sFeet: 360, lengthFeet: 8, lateralCenterFeet: -6.0, halfWidthFeet: 2.2 },
  { id: 'ext_gate_2', type: 'speed_gate', sFeet: 390, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'ext_bale_5', type: 'hay_bale', sFeet: 450, lengthFeet: 8, lateralCenterFeet: 6.2, halfWidthFeet: 2.2 },
  { id: 'ext_slick_3', type: 'water_slick', sFeet: 490, lengthFeet: 24, lateralCenterFeet: -2.0, halfWidthFeet: 5.2 },
  { id: 'ext_bale_6', type: 'hay_bale', sFeet: 520, lengthFeet: 8, lateralCenterFeet: -6.4, halfWidthFeet: 2.2 },
  { id: 'ext_gate_3', type: 'speed_gate', sFeet: 580, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'ext_bale_7', type: 'hay_bale', sFeet: 610, lengthFeet: 8, lateralCenterFeet: 6.0, halfWidthFeet: 2.2 },
  { id: 'ext_slick_4', type: 'water_slick', sFeet: 660, lengthFeet: 24, lateralCenterFeet: 2.8, halfWidthFeet: 5.2 },
  { id: 'ext_jump_2', type: 'kicker_jump', sFeet: 680, lengthFeet: 22, lateralCenterFeet: 0.0, halfWidthFeet: 7.5 },
  { id: 'ext_bale_8', type: 'hay_bale', sFeet: 700, lengthFeet: 8, lateralCenterFeet: -6.2, halfWidthFeet: 2.2 },
  { id: 'ext_gate_4', type: 'speed_gate', sFeet: 750, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'ext_bale_9', type: 'hay_bale', sFeet: 790, lengthFeet: 8, lateralCenterFeet: 6.4, halfWidthFeet: 2.2 },
  { id: 'ext_slick_5', type: 'water_slick', sFeet: 830, lengthFeet: 24, lateralCenterFeet: -2.2, halfWidthFeet: 5.2 },
  { id: 'ext_bale_10', type: 'hay_bale', sFeet: 870, lengthFeet: 8, lateralCenterFeet: -6.0, halfWidthFeet: 2.2 },
  { id: 'ext_jump_3', type: 'kicker_jump', sFeet: 940, lengthFeet: 22, lateralCenterFeet: 0.0, halfWidthFeet: 7.5 },
  { id: 'ext_bale_11', type: 'hay_bale', sFeet: 960, lengthFeet: 8, lateralCenterFeet: 6.2, halfWidthFeet: 2.2 },
  { id: 'ext_gate_5', type: 'speed_gate', sFeet: 990, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'ext_slick_6', type: 'water_slick', sFeet: 1010, lengthFeet: 24, lateralCenterFeet: 2.0, halfWidthFeet: 5.2 },
  { id: 'ext_bale_12', type: 'hay_bale', sFeet: 1040, lengthFeet: 8, lateralCenterFeet: -6.2, halfWidthFeet: 2.2 },
  { id: 'ext_bale_13', type: 'hay_bale', sFeet: 1120, lengthFeet: 8, lateralCenterFeet: 6.0, halfWidthFeet: 2.2 },
  { id: 'ext_gate_6', type: 'speed_gate', sFeet: 1170, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'ext_bale_14', type: 'hay_bale', sFeet: 1190, lengthFeet: 8, lateralCenterFeet: -6.0, halfWidthFeet: 2.2 },
];

export const extremePeakCourse: SoapboxCourseDef = {
  id: 'extreme_peak',
  name: 'Extreme Peak: The Streif Drop',
  subtitle: 'Alpine Mausefalle 25.6% Vertical Drop',
  tagline: 'Alpine Mausefalle 25.6% Vertical Drop',
  description: 'The ultimate soap box crucible: dizzying speeds down the 25.6% Mausefalle chute and mega-air jumps.',
  difficulty: 4,
  difficultyStars: 4,
  difficultyLabel: 'Extreme',
  emoji: '❄️',
  lengthFeet: 1250,
  startRampFeet: 40,
  startElevationFeet: 195.0,
  finishElevationFeet: 0.0,
  totalElevationDropFeet: 195.0,
  totalDropFeet: 195.0,
  dropFeet: 195.0,
  averageGradePercent: -15.6,
  averageGradePct: -15.6,
  avgGradePercent: -15.6,
  maxDownhillGradePercent: -25.6,
  peakGradePercent: -25.6,
  surfaceType: 'frozen asphalt',
  hazardsDescription: 'Extreme hairpin plunges, speed traps',
  parTimeSec: 24.2,
  visualTheme: extremeTheme,
  theme: extremeTheme,
  sectors: extremeSectors,
  getElevation: extremeElevation,
  sampleRoad: createSampleRoad(extremeElevation, extremeCenterline),
  getCenterline: extremeCenterline,
  getSurface: () => 'asphalt',
  getSectionName: (s) => {
    for (const sec of extremeSectors) {
      if (s >= sec.sStartFeet && s <= sec.sEndFeet) return sec.name;
    }
    return s < 0 ? 'Starter Chute' : 'Finish Runout';
  },
  generateObstacles: () =>
    extremeObstaclesDef.map((def) => ({
      ...def,
      triggered: false,
    })),
  obstacles: extremeObstaclesDef,
};

// ==============================================================================
// COURSE CATALOG & EXPORTS
// ==============================================================================
export const SOAPBOX_COURSES: Record<SoapboxCourseId, SoapboxCourseDef> = {
  alpine_panorama: alpinePanoramaCourse,
  canyon_plunge: canyonPlungeCourse,
  urban_downhill: urbanDownhillCourse,
  extreme_peak: extremePeakCourse,
};

export const SOAPBOX_COURSE_LIST: SoapboxCourseDef[] = [
  alpinePanoramaCourse,
  canyonPlungeCourse,
  urbanDownhillCourse,
  extremePeakCourse,
];

export function getSoapboxCourse(id: SoapboxCourseId = 'alpine_panorama'): SoapboxCourseDef {
  return SOAPBOX_COURSES[id] ?? SOAPBOX_COURSES.alpine_panorama;
}

export function getSoapboxRoadElevation(s: number, courseId: SoapboxCourseId = 'alpine_panorama'): number {
  return getSoapboxCourse(courseId).getElevation(s).yFeet;
}

export function getSoapboxRoadGrade(s: number, courseId: SoapboxCourseId = 'alpine_panorama'): number {
  return -getSoapboxCourse(courseId).getElevation(s).dyDs;
}

export function getSoapboxRoadHeading(s: number, courseId: SoapboxCourseId = 'alpine_panorama'): number {
  const center = getSoapboxCourse(courseId).getCenterline(s);
  return Math.atan2(center.dzDs, 1);
}

export function getSoapboxRoadCurvature(s: number, courseId: SoapboxCourseId = 'alpine_panorama'): number {
  const center = getSoapboxCourse(courseId).getCenterline(s);
  const denom = Math.pow(1 + center.dzDs * center.dzDs, 1.5);
  return center.d2zDs2 / Math.max(1e-5, denom);
}
