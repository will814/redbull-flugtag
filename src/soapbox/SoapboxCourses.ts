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
  const rampDrop = rampTopElevationFeet - startElevationFeet;
  const precomputed = harmonics.map((h) => {
    const freq = (2 * Math.PI * h.harmonicNumber) / lengthFeet;
    return {
      amplitude: h.amplitude,
      phase: h.phase,
      freq,
      ampOverFreq: h.amplitude / freq,
      sinPhase: Math.sin(h.phase),
    };
  });
  const numHarmonics = precomputed.length;

  return function getElevation(s: number): { yFeet: number; dyDs: number } {
    if (s < 0) {
      const u = (s + startRampFeet) / startRampFeet;
      const yFeet = rampTopElevationFeet - u * rampDrop;
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

    for (let i = 0; i < numHarmonics; i++) {
      const h = precomputed[i];
      const angle = h.freq * s + h.phase;
      sumGradeHarmonics += h.amplitude * Math.cos(angle);
      sumIntegralHarmonics += h.ampOverFreq * (Math.sin(angle) - h.sinPhase);
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
    const entry = smoothstep(0, 80, dist);
    const exit = 1 - smoothstep(lengthFeet - 90, lengthFeet, dist);
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
// 1. ALPINE PANORAMA (2,400 FT, DROP: 268.8 FT, 1/4 BEGINNER)
// ==============================================================================
const alpineElevation = createHarmonicElevation({
  lengthFeet: 2400,
  startRampFeet: 40,
  startElevationFeet: 268.8,
  rampTopElevationFeet: 280.8,
  finishElevationFeet: 0.0,
  harmonics: [
    { amplitude: 0.022, phase: 0.0, harmonicNumber: 1 },
    { amplitude: 0.012, phase: Math.PI / 3, harmonicNumber: 2 },
    { amplitude: 0.005, phase: -0.4, harmonicNumber: 3 },
  ],
});

const alpineCenterline = createCenterlineEvaluator(2400, (s) => {
  return (
    42 * Math.sin(0.0052 * s) +
    18 * Math.sin(0.0115 * s - 0.6) +
    32 * Math.exp(-Math.pow((s - 1480) / 160, 2)) * Math.sin(0.016 * (s - 1320))
  );
});

const alpineTheme: SoapboxCourseVisualTheme = {
  skyColor: '#38bdf8',
  fogColor: '#bae6fd',
  fogDensity: 0.0014,
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
  { sStartFeet: 0, sEndFeet: 400, name: 'Pine Crest S-Bends' },
  { sStartFeet: 400, sEndFeet: 820, name: 'Cobblestone Village Descent' },
  { sStartFeet: 820, sEndFeet: 1260, name: 'Edelweiss Meadow Sweepers' },
  { sStartFeet: 1260, sEndFeet: 1680, name: "Deadman's Hairpin Chute" },
  { sStartFeet: 1680, sEndFeet: 2040, name: 'Old Town Clocktower Chicane' },
  { sStartFeet: 2040, sEndFeet: 2400, name: 'High-Speed Finish Boulevard' },
];

const alpineObstaclesDef: SoapboxObstacleDef[] = [
  { id: 'alp_bale_1', type: 'hay_bale', sFeet: 120, lengthFeet: 8, lateralCenterFeet: 6.2, halfWidthFeet: 2.2 },
  { id: 'alp_slick_1', type: 'water_slick', sFeet: 210, lengthFeet: 18, lateralCenterFeet: -2.0, halfWidthFeet: 4.8 },
  { id: 'alp_bale_2', type: 'hay_bale', sFeet: 295, lengthFeet: 8, lateralCenterFeet: -6.4, halfWidthFeet: 2.2 },
  { id: 'alp_gate_1', type: 'speed_gate', sFeet: 375, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'alp_cobble_1', type: 'cobble_strip', sFeet: 490, lengthFeet: 55, lateralCenterFeet: 0.0, halfWidthFeet: 9.0 },
  { id: 'alp_jump_1', type: 'kicker_jump', sFeet: 610, lengthFeet: 16, lateralCenterFeet: 0.0, halfWidthFeet: 6.5 },
  { id: 'alp_bale_3', type: 'hay_bale', sFeet: 730, lengthFeet: 8, lateralCenterFeet: 6.0, halfWidthFeet: 2.2 },
  { id: 'alp_slick_2', type: 'water_slick', sFeet: 845, lengthFeet: 20, lateralCenterFeet: 3.2, halfWidthFeet: 5.0 },
  { id: 'alp_gate_2', type: 'speed_gate', sFeet: 960, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'alp_cobble_2', type: 'cobble_strip', sFeet: 1085, lengthFeet: 60, lateralCenterFeet: 0.0, halfWidthFeet: 9.0 },
  { id: 'alp_bale_4', type: 'hay_bale', sFeet: 1180, lengthFeet: 8, lateralCenterFeet: -6.5, halfWidthFeet: 2.2 },
  { id: 'alp_jump_2', type: 'kicker_jump', sFeet: 1290, lengthFeet: 18, lateralCenterFeet: 0.0, halfWidthFeet: 7.0 },
  { id: 'alp_bale_5', type: 'hay_bale', sFeet: 1395, lengthFeet: 8, lateralCenterFeet: 5.8, halfWidthFeet: 2.2 },
  { id: 'alp_gate_3', type: 'speed_gate', sFeet: 1490, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'alp_bale_6', type: 'hay_bale', sFeet: 1590, lengthFeet: 8, lateralCenterFeet: -6.2, halfWidthFeet: 2.2 },
  { id: 'alp_slick_3', type: 'water_slick', sFeet: 1695, lengthFeet: 22, lateralCenterFeet: -2.8, halfWidthFeet: 5.2 },
  { id: 'alp_cobble_3', type: 'cobble_strip', sFeet: 1810, lengthFeet: 55, lateralCenterFeet: 0.0, halfWidthFeet: 9.0 },
  { id: 'alp_jump_3', type: 'kicker_jump', sFeet: 1930, lengthFeet: 18, lateralCenterFeet: 0.0, halfWidthFeet: 7.0 },
  { id: 'alp_bale_7', type: 'hay_bale', sFeet: 2035, lengthFeet: 8, lateralCenterFeet: 6.6, halfWidthFeet: 2.2 },
  { id: 'alp_gate_4', type: 'speed_gate', sFeet: 2120, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'alp_bale_8', type: 'hay_bale', sFeet: 2210, lengthFeet: 8, lateralCenterFeet: -6.0, halfWidthFeet: 2.2 },
  { id: 'alp_slick_4', type: 'water_slick', sFeet: 2285, lengthFeet: 22, lateralCenterFeet: 1.5, halfWidthFeet: 5.0 },
  { id: 'alp_gate_5', type: 'speed_gate', sFeet: 2350, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
];

export const alpinePanoramaCourse: SoapboxCourseDef = {
  id: 'alpine_panorama',
  name: 'Alpine Panorama',
  subtitle: 'Austrian Alpine Pass & Old Town Cobbles',
  tagline: 'Austrian Alpine Pass & Old Town Cobbles',
  description: 'Descend 2,400 ft through pristine Austrian pine slopes into high-speed cobblestone hairpins.',
  difficulty: 1,
  difficultyStars: 1,
  difficultyLabel: 'Beginner',
  emoji: '🏔️',
  lengthFeet: 2400,
  startRampFeet: 40,
  startElevationFeet: 268.8,
  finishElevationFeet: 0.0,
  totalElevationDropFeet: 268.8,
  totalDropFeet: 268.8,
  dropFeet: 268.8,
  averageGradePercent: -11.2,
  averageGradePct: -11.2,
  avgGradePercent: -11.2,
  maxDownhillGradePercent: -15.1,
  peakGradePercent: -15.1,
  surfaceType: 'asphalt / cobble',
  hazardsDescription: 'Cobble strips, hay bales, kicker jumps',
  parTimeSec: 46.5,
  visualTheme: alpineTheme,
  theme: alpineTheme,
  sectors: alpineSectors,
  getElevation: alpineElevation,
  sampleRoad: createSampleRoad(alpineElevation, alpineCenterline),
  getCenterline: alpineCenterline,
  getSurface: (s) =>
    (s >= 455 && s <= 535) || (s >= 1045 && s <= 1130) || (s >= 1775 && s <= 1855)
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
// 2. CANYON PLUNGE (2,800 FT, DROP: 352.8 FT, 2/4 CHALLENGING)
// ==============================================================================
const canyonElevation = createHarmonicElevation({
  lengthFeet: 2800,
  startRampFeet: 40,
  startElevationFeet: 352.8,
  rampTopElevationFeet: 365.6,
  finishElevationFeet: 0.0,
  harmonics: [
    { amplitude: 0.035, phase: -0.5, harmonicNumber: 1 },
    { amplitude: 0.018, phase: 1.0, harmonicNumber: 2 },
    { amplitude: 0.009, phase: 0.3, harmonicNumber: 3 },
  ],
});

const canyonCenterline = createCenterlineEvaluator(2800, (s) => {
  return (
    48 * Math.sin(0.0046 * s) +
    22 * Math.sin(0.0095 * s + 0.4) +
    36 * Math.exp(-Math.pow((s - 1820) / 180, 2)) * Math.sin(0.014 * (s - 1650))
  );
});

const canyonTheme: SoapboxCourseVisualTheme = {
  skyColor: '#fdba74',
  fogColor: '#fed7aa',
  fogDensity: 0.0015,
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
  { sStartFeet: 0, sEndFeet: 480, name: 'Sandstone Rim Ridge' },
  { sStartFeet: 480, sEndFeet: 960, name: 'Coyote Gulch Plunge' },
  { sStartFeet: 960, sEndFeet: 1440, name: 'Red Rock Mesa Switchbacks' },
  { sStartFeet: 1440, sEndFeet: 1920, name: "Devil's Cavern Sweeper" },
  { sStartFeet: 1920, sEndFeet: 2380, name: 'Sidewinder Arroyo Drop' },
  { sStartFeet: 2380, sEndFeet: 2800, name: 'Dust Canyon Straightaway' },
];

const canyonObstaclesDef: SoapboxObstacleDef[] = [
  { id: 'can_bale_1', type: 'hay_bale', sFeet: 140, lengthFeet: 8, lateralCenterFeet: 6.0, halfWidthFeet: 2.2 },
  { id: 'can_gate_1', type: 'speed_gate', sFeet: 250, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'can_slick_1', type: 'water_slick', sFeet: 365, lengthFeet: 20, lateralCenterFeet: -2.5, halfWidthFeet: 5.0 },
  { id: 'can_bale_2', type: 'hay_bale', sFeet: 480, lengthFeet: 8, lateralCenterFeet: -6.2, halfWidthFeet: 2.2 },
  { id: 'can_gate_2', type: 'speed_gate', sFeet: 610, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'can_bale_3', type: 'hay_bale', sFeet: 730, lengthFeet: 8, lateralCenterFeet: 6.5, halfWidthFeet: 2.2 },
  { id: 'can_slick_2', type: 'water_slick', sFeet: 850, lengthFeet: 22, lateralCenterFeet: 3.0, halfWidthFeet: 5.0 },
  { id: 'can_jump_1', type: 'kicker_jump', sFeet: 965, lengthFeet: 18, lateralCenterFeet: 0.0, halfWidthFeet: 6.8 },
  { id: 'can_bale_4', type: 'hay_bale', sFeet: 1090, lengthFeet: 8, lateralCenterFeet: -5.8, halfWidthFeet: 2.2 },
  { id: 'can_slick_3', type: 'water_slick', sFeet: 1215, lengthFeet: 24, lateralCenterFeet: -1.8, halfWidthFeet: 5.2 },
  { id: 'can_bale_5', type: 'hay_bale', sFeet: 1340, lengthFeet: 8, lateralCenterFeet: 6.4, halfWidthFeet: 2.2 },
  { id: 'can_gate_3', type: 'speed_gate', sFeet: 1465, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'can_bale_6', type: 'hay_bale', sFeet: 1590, lengthFeet: 8, lateralCenterFeet: -6.2, halfWidthFeet: 2.2 },
  { id: 'can_slick_4', type: 'water_slick', sFeet: 1710, lengthFeet: 22, lateralCenterFeet: 2.5, halfWidthFeet: 5.0 },
  { id: 'can_bale_7', type: 'hay_bale', sFeet: 1825, lengthFeet: 8, lateralCenterFeet: 6.0, halfWidthFeet: 2.2 },
  { id: 'can_jump_2', type: 'kicker_jump', sFeet: 1940, lengthFeet: 18, lateralCenterFeet: 0.0, halfWidthFeet: 7.0 },
  { id: 'can_bale_8', type: 'hay_bale', sFeet: 2070, lengthFeet: 8, lateralCenterFeet: -6.5, halfWidthFeet: 2.2 },
  { id: 'can_gate_4', type: 'speed_gate', sFeet: 2195, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'can_bale_9', type: 'hay_bale', sFeet: 2310, lengthFeet: 8, lateralCenterFeet: 5.8, halfWidthFeet: 2.2 },
  { id: 'can_slick_5', type: 'water_slick', sFeet: 2430, lengthFeet: 24, lateralCenterFeet: -2.0, halfWidthFeet: 5.2 },
  { id: 'can_jump_3', type: 'kicker_jump', sFeet: 2545, lengthFeet: 20, lateralCenterFeet: 0.0, halfWidthFeet: 7.2 },
  { id: 'can_bale_10', type: 'hay_bale', sFeet: 2650, lengthFeet: 8, lateralCenterFeet: -6.0, halfWidthFeet: 2.2 },
  { id: 'can_gate_5', type: 'speed_gate', sFeet: 2735, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
];

export const canyonPlungeCourse: SoapboxCourseDef = {
  id: 'canyon_plunge',
  name: 'Canyon Plunge',
  subtitle: 'Utah Sandstone Cliffs & Plunging Drop',
  tagline: 'Utah Sandstone Cliffs & Plunging Drop',
  description: 'Carve 2,800 ft through towering desert gorges with heavy banked sweepers and treacherous dust washes.',
  difficulty: 2,
  difficultyStars: 2,
  difficultyLabel: 'Challenging',
  emoji: '🏜️',
  lengthFeet: 2800,
  startRampFeet: 40,
  startElevationFeet: 352.8,
  finishElevationFeet: 0.0,
  totalElevationDropFeet: 352.8,
  totalDropFeet: 352.8,
  dropFeet: 352.8,
  averageGradePercent: -12.6,
  averageGradePct: -12.6,
  avgGradePercent: -12.6,
  maxDownhillGradePercent: -18.8,
  peakGradePercent: -18.8,
  surfaceType: 'asphalt & washboard',
  hazardsDescription: 'Rough washboard, oil slicks, cliff drops',
  parTimeSec: 52.0,
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
// 3. URBAN DOWNHILL BLITZ (2,600 FT, DROP: 335.4 FT, 3/4 EXPERT)
// ==============================================================================
const urbanElevation = createHarmonicElevation({
  lengthFeet: 2600,
  startRampFeet: 40,
  startElevationFeet: 335.4,
  rampTopElevationFeet: 348.2,
  finishElevationFeet: 0.0,
  harmonics: [
    { amplitude: 0.038, phase: 0.2, harmonicNumber: 1 },
    { amplitude: 0.021, phase: -0.8, harmonicNumber: 2 },
    { amplitude: 0.011, phase: 0.5, harmonicNumber: 3 },
  ],
});

const urbanCenterline = createCenterlineEvaluator(2600, (s) => {
  return (
    34 * Math.sin(0.0064 * s) +
    20 * Math.sin(0.013 * s - 0.3) +
    28 * Math.exp(-Math.pow((s - 1040) / 140, 2)) * Math.sin(0.018 * (s - 940)) +
    30 * Math.exp(-Math.pow((s - 1920) / 150, 2)) * Math.cos(0.017 * (s - 1820))
  );
});

const urbanTheme: SoapboxCourseVisualTheme = {
  skyColor: '#818cf8',
  fogColor: '#c7d2fe',
  fogDensity: 0.0013,
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
  { sStartFeet: 0, sEndFeet: 440, name: 'Cathedral Stair Chute' },
  { sStartFeet: 440, sEndFeet: 900, name: 'Old Town Alley Chicanes' },
  { sStartFeet: 900, sEndFeet: 1360, name: 'Market Square Cobbles' },
  { sStartFeet: 1360, sEndFeet: 1780, name: 'Plaza Roundabout Jump' },
  { sStartFeet: 1780, sEndFeet: 2200, name: 'Tramway Viaduct Hairpins' },
  { sStartFeet: 2200, sEndFeet: 2600, name: 'Harbor Promenade Sprint' },
];

const urbanObstaclesDef: SoapboxObstacleDef[] = [
  { id: 'urb_bale_1', type: 'hay_bale', sFeet: 120, lengthFeet: 8, lateralCenterFeet: 6.2, halfWidthFeet: 2.2 },
  { id: 'urb_slick_1', type: 'water_slick', sFeet: 225, lengthFeet: 18, lateralCenterFeet: -2.0, halfWidthFeet: 4.8 },
  { id: 'urb_bale_2', type: 'hay_bale', sFeet: 330, lengthFeet: 8, lateralCenterFeet: -6.2, halfWidthFeet: 2.2 },
  { id: 'urb_gate_1', type: 'speed_gate', sFeet: 435, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'urb_bale_3', type: 'hay_bale', sFeet: 545, lengthFeet: 8, lateralCenterFeet: 6.0, halfWidthFeet: 2.2 },
  { id: 'urb_jump_1', type: 'kicker_jump', sFeet: 660, lengthFeet: 16, lateralCenterFeet: 0.0, halfWidthFeet: 6.5 },
  { id: 'urb_bale_4', type: 'hay_bale', sFeet: 775, lengthFeet: 8, lateralCenterFeet: -6.4, halfWidthFeet: 2.2 },
  { id: 'urb_slick_2', type: 'water_slick', sFeet: 890, lengthFeet: 20, lateralCenterFeet: 3.0, halfWidthFeet: 5.0 },
  { id: 'urb_gate_2', type: 'speed_gate', sFeet: 1005, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'urb_bale_5', type: 'hay_bale', sFeet: 1115, lengthFeet: 8, lateralCenterFeet: 5.8, halfWidthFeet: 2.2 },
  { id: 'urb_bale_6', type: 'hay_bale', sFeet: 1230, lengthFeet: 8, lateralCenterFeet: -6.0, halfWidthFeet: 2.2 },
  { id: 'urb_bale_7', type: 'hay_bale', sFeet: 1350, lengthFeet: 8, lateralCenterFeet: 6.2, halfWidthFeet: 2.2 },
  { id: 'urb_jump_2', type: 'kicker_jump', sFeet: 1465, lengthFeet: 18, lateralCenterFeet: 0.0, halfWidthFeet: 7.0 },
  { id: 'urb_bale_8', type: 'hay_bale', sFeet: 1580, lengthFeet: 8, lateralCenterFeet: -6.5, halfWidthFeet: 2.2 },
  { id: 'urb_slick_3', type: 'water_slick', sFeet: 1695, lengthFeet: 22, lateralCenterFeet: -1.5, halfWidthFeet: 5.0 },
  { id: 'urb_gate_3', type: 'speed_gate', sFeet: 1805, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'urb_bale_9', type: 'hay_bale', sFeet: 1920, lengthFeet: 8, lateralCenterFeet: 5.9, halfWidthFeet: 2.2 },
  { id: 'urb_jump_3', type: 'kicker_jump', sFeet: 2035, lengthFeet: 18, lateralCenterFeet: 0.0, halfWidthFeet: 7.0 },
  { id: 'urb_bale_10', type: 'hay_bale', sFeet: 2145, lengthFeet: 8, lateralCenterFeet: -6.0, halfWidthFeet: 2.2 },
  { id: 'urb_slick_4', type: 'water_slick', sFeet: 2255, lengthFeet: 20, lateralCenterFeet: 2.8, halfWidthFeet: 5.0 },
  { id: 'urb_bale_11', type: 'hay_bale', sFeet: 2365, lengthFeet: 8, lateralCenterFeet: 6.2, halfWidthFeet: 2.2 },
  { id: 'urb_bale_12', type: 'hay_bale', sFeet: 2465, lengthFeet: 8, lateralCenterFeet: -6.0, halfWidthFeet: 2.2 },
  { id: 'urb_gate_4', type: 'speed_gate', sFeet: 2535, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
];

export const urbanDownhillCourse: SoapboxCourseDef = {
  id: 'urban_downhill',
  name: 'Urban Downhill Blitz',
  subtitle: 'Old Town Alleys & Cathedral Stairs',
  tagline: 'Old Town Alleys & Cathedral Stairs',
  description: 'Navigate 2,600 ft of razor-tight cobblestone chicanes, stair drop kickers, and harbor promenade sprints.',
  difficulty: 3,
  difficultyStars: 3,
  difficultyLabel: 'Expert',
  emoji: '🏙️',
  lengthFeet: 2600,
  startRampFeet: 40,
  startElevationFeet: 335.4,
  finishElevationFeet: 0.0,
  totalElevationDropFeet: 335.4,
  totalDropFeet: 335.4,
  dropFeet: 335.4,
  averageGradePercent: -12.9,
  averageGradePct: -12.9,
  avgGradePercent: -12.9,
  maxDownhillGradePercent: -19.9,
  peakGradePercent: -19.9,
  surfaceType: 'cobblestone & curbs',
  hazardsDescription: 'Tight chicanes, curbs, kicker jumps',
  parTimeSec: 48.5,
  visualTheme: urbanTheme,
  theme: urbanTheme,
  sectors: urbanSectors,
  getElevation: urbanElevation,
  sampleRoad: createSampleRoad(urbanElevation, urbanCenterline),
  getCenterline: urbanCenterline,
  getSurface: (s) => (s <= 1600 ? 'cobblestone' : 'asphalt'),
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
// 4. EXTREME PEAK: THE STREIF DROP (3,200 FT, DROP: 499.2 FT, 4/4 EXTREME)
// ==============================================================================
const extremeElevation = createHarmonicElevation({
  lengthFeet: 3200,
  startRampFeet: 40,
  startElevationFeet: 499.2,
  rampTopElevationFeet: 513.2,
  finishElevationFeet: 0.0,
  harmonics: [
    { amplitude: 0.054, phase: -0.9, harmonicNumber: 1 },
    { amplitude: 0.029, phase: 0.4, harmonicNumber: 2 },
    { amplitude: 0.017, phase: -0.3, harmonicNumber: 3 },
  ],
});

const extremeCenterline = createCenterlineEvaluator(3200, (s) => {
  return (
    52 * Math.sin(0.0042 * s) +
    24 * Math.sin(0.0088 * s - 0.8) +
    38 * Math.exp(-Math.pow((s - 1240) / 180, 2)) * Math.sin(0.015 * (s - 1100)) +
    36 * Math.exp(-Math.pow((s - 2360) / 170, 2)) * Math.sin(0.013 * (s - 2200))
  );
});

const extremeTheme: SoapboxCourseVisualTheme = {
  skyColor: '#0284c7',
  fogColor: '#e0f2fe',
  fogDensity: 0.0014,
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
  { sStartFeet: 0, sEndFeet: 520, name: 'The Mausefalle 25% Plunge' },
  { sStartFeet: 520, sEndFeet: 1060, name: 'Steep Hang Drift Glissade' },
  { sStartFeet: 1060, sEndFeet: 1620, name: 'Alte Schneise Ice Chute' },
  { sStartFeet: 1620, sEndFeet: 2160, name: 'Seidlalm High-Speed S-Curves' },
  { sStartFeet: 2160, sEndFeet: 2680, name: 'Hausbergkante Mega Air' },
  { sStartFeet: 2680, sEndFeet: 3200, name: 'Zielschuss Final Chute' },
];

const extremeObstaclesDef: SoapboxObstacleDef[] = [
  { id: 'ext_bale_1', type: 'hay_bale', sFeet: 130, lengthFeet: 8, lateralCenterFeet: 6.0, halfWidthFeet: 2.2 },
  { id: 'ext_slick_1', type: 'water_slick', sFeet: 240, lengthFeet: 22, lateralCenterFeet: -2.5, halfWidthFeet: 5.0 },
  { id: 'ext_gate_1', type: 'speed_gate', sFeet: 350, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'ext_bale_2', type: 'hay_bale', sFeet: 460, lengthFeet: 8, lateralCenterFeet: -6.2, halfWidthFeet: 2.2 },
  { id: 'ext_bale_3', type: 'hay_bale', sFeet: 575, lengthFeet: 8, lateralCenterFeet: 6.5, halfWidthFeet: 2.2 },
  { id: 'ext_jump_1', type: 'kicker_jump', sFeet: 690, lengthFeet: 20, lateralCenterFeet: 0.0, halfWidthFeet: 7.2 },
  { id: 'ext_slick_2', type: 'water_slick', sFeet: 805, lengthFeet: 24, lateralCenterFeet: 2.2, halfWidthFeet: 5.2 },
  { id: 'ext_bale_4', type: 'hay_bale', sFeet: 920, lengthFeet: 8, lateralCenterFeet: -6.0, halfWidthFeet: 2.2 },
  { id: 'ext_gate_2', type: 'speed_gate', sFeet: 1030, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'ext_bale_5', type: 'hay_bale', sFeet: 1145, lengthFeet: 8, lateralCenterFeet: 6.2, halfWidthFeet: 2.2 },
  { id: 'ext_slick_3', type: 'water_slick', sFeet: 1260, lengthFeet: 24, lateralCenterFeet: -2.0, halfWidthFeet: 5.2 },
  { id: 'ext_bale_6', type: 'hay_bale', sFeet: 1375, lengthFeet: 8, lateralCenterFeet: -6.4, halfWidthFeet: 2.2 },
  { id: 'ext_gate_3', type: 'speed_gate', sFeet: 1490, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'ext_bale_7', type: 'hay_bale', sFeet: 1605, lengthFeet: 8, lateralCenterFeet: 6.0, halfWidthFeet: 2.2 },
  { id: 'ext_slick_4', type: 'water_slick', sFeet: 1720, lengthFeet: 24, lateralCenterFeet: 2.8, halfWidthFeet: 5.2 },
  { id: 'ext_jump_2', type: 'kicker_jump', sFeet: 1835, lengthFeet: 22, lateralCenterFeet: 0.0, halfWidthFeet: 7.5 },
  { id: 'ext_bale_8', type: 'hay_bale', sFeet: 1950, lengthFeet: 8, lateralCenterFeet: -6.2, halfWidthFeet: 2.2 },
  { id: 'ext_gate_4', type: 'speed_gate', sFeet: 2065, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'ext_bale_9', type: 'hay_bale', sFeet: 2180, lengthFeet: 8, lateralCenterFeet: 6.4, halfWidthFeet: 2.2 },
  { id: 'ext_slick_5', type: 'water_slick', sFeet: 2295, lengthFeet: 24, lateralCenterFeet: -2.2, halfWidthFeet: 5.2 },
  { id: 'ext_bale_10', type: 'hay_bale', sFeet: 2410, lengthFeet: 8, lateralCenterFeet: -6.0, halfWidthFeet: 2.2 },
  { id: 'ext_jump_3', type: 'kicker_jump', sFeet: 2525, lengthFeet: 22, lateralCenterFeet: 0.0, halfWidthFeet: 7.5 },
  { id: 'ext_bale_11', type: 'hay_bale', sFeet: 2635, lengthFeet: 8, lateralCenterFeet: 6.2, halfWidthFeet: 2.2 },
  { id: 'ext_gate_5', type: 'speed_gate', sFeet: 2740, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'ext_slick_6', type: 'water_slick', sFeet: 2845, lengthFeet: 24, lateralCenterFeet: 2.0, halfWidthFeet: 5.2 },
  { id: 'ext_bale_12', type: 'hay_bale', sFeet: 2945, lengthFeet: 8, lateralCenterFeet: -6.2, halfWidthFeet: 2.2 },
  { id: 'ext_bale_13', type: 'hay_bale', sFeet: 3035, lengthFeet: 8, lateralCenterFeet: 6.0, halfWidthFeet: 2.2 },
  { id: 'ext_gate_6', type: 'speed_gate', sFeet: 3110, lengthFeet: 12, lateralCenterFeet: 0.0, halfWidthFeet: 3.5 },
  { id: 'ext_bale_14', type: 'hay_bale', sFeet: 3155, lengthFeet: 8, lateralCenterFeet: -6.0, halfWidthFeet: 2.2 },
];

export const extremePeakCourse: SoapboxCourseDef = {
  id: 'extreme_peak',
  name: 'Extreme Peak: The Streif Drop',
  subtitle: 'Alpine Mausefalle 25.6% Vertical Drop',
  tagline: 'Alpine Mausefalle 25.6% Vertical Drop',
  description: 'The ultimate 3,200-ft soap box crucible: dizzying speeds down the 25.6% Mausefalle chute and mega-air jumps.',
  difficulty: 4,
  difficultyStars: 4,
  difficultyLabel: 'Extreme',
  emoji: '❄️',
  lengthFeet: 3200,
  startRampFeet: 40,
  startElevationFeet: 499.2,
  finishElevationFeet: 0.0,
  totalElevationDropFeet: 499.2,
  totalDropFeet: 499.2,
  dropFeet: 499.2,
  averageGradePercent: -15.6,
  averageGradePct: -15.6,
  avgGradePercent: -15.6,
  maxDownhillGradePercent: -25.6,
  peakGradePercent: -25.6,
  surfaceType: 'frozen asphalt',
  hazardsDescription: 'Extreme hairpin plunges, speed traps',
  parTimeSec: 56.0,
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
