import {
  CoasterLoadout,
  CoasterPart,
  getCoasterPartById,
} from './CoasterPartCatalog';

export type CoasterSafetyStatus =
  | 'locked_in'
  | 'airtime_risk'
  | 'high_cog_tippy'
  | 'heavy_momentum';

export interface CoasterMetrics {
  /** Total loaded coaster car mass in lbs (riders + chassis + bogies + equipment, 450..1,600 lbs) */
  totalMassLbs: number;
  /** Effective vertical center-of-mass offset above the tubular track rails in meters */
  comHeightMeters: number;
  /** 0..100 Upstop Wheel clamping score (resists negative-G ejector liftoff on Camelbacks) */
  upstopClampScore: number;
  /** 0..100 Side-Friction Wheel & gimbal lateral G grip in Banked Helix & S-Curves */
  lateralGripScore: number;
  /** 0..100 Rolling speed & aerodynamic efficiency */
  topSpeedScore: number;
  /** 0..100 LIM capacitor launch & mid-course KERS boost authority */
  launchBoostPower: number;
  /** 0..100 Active gyro / player lean roll-damping authority */
  gyroTiltAuthority: number;
  /** 0..100 Eddy-current magnetic braking authority for hill trims & Station Bullseye stop */
  brakePowerScore: number;
  /** 0..100 Passenger harness & G-load protection */
  restraintSafetyScore: number;
  /** 0..100 Bogie & frame structural resilience */
  structuralToughness: number;
  /** 0..100 Crowd showmanship & coaster thrill rating */
  thrillScore: number;
  /** Maximum negative G-force the upstop wheels & restraints can sustain before rail liftoff (e.g. -1.4G .. -2.6G) */
  maxSafeNegativeG: number;
  /** Maximum uncompensated lateral G-force before bogie tipping risk */
  maxSafeLateralG: number;
  safetyStatus: CoasterSafetyStatus;
  safetyLabel: string;
  safetyHint: string;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function computeCoasterMetrics(loadout: CoasterLoadout): CoasterMetrics {
  const parts: CoasterPart[] = [
    getCoasterPartById(loadout.chassis),
    getCoasterPartById(loadout.bogies),
    getCoasterPartById(loadout.restraints),
    getCoasterPartById(loadout.nose),
    getCoasterPartById(loadout.booster),
    getCoasterPartById(loadout.shell),
  ];

  const ridersMassLbs = 320; // Twin coaster riders + helmets
  let partsMassLbs = 0;
  let weightedComY = ridersMassLbs * 0.36;

  let rawUpstop = 0;
  let rawLateral = 0;
  let rawSpeed = 0;
  let rawBoost = 0;
  let rawGyro = 0;
  let rawBrake = 0;
  let rawSafety = 0;
  let rawToughness = 0;
  let rawThrill = 0;

  for (const p of parts) {
    partsMassLbs += p.massLbs;
    weightedComY += p.massLbs * (0.28 + p.comOffsetY);
    rawUpstop += p.upstopClamp;
    rawLateral += p.lateralGrip;
    rawSpeed += p.rollingSpeed;
    rawBoost += p.launchBoost;
    rawGyro += p.gyroStability;
    rawBrake += p.magnetBrakePower;
    rawSafety += p.restraintSafety;
    rawToughness += p.toughness;
    rawThrill += p.thrillBonus;
  }

  const totalMassLbs = clamp(Math.round(ridersMassLbs + partsMassLbs), 450, 1600);
  const comHeightMeters = Number(
    clamp(weightedComY / totalMassLbs, 0.16, 0.62).toFixed(2)
  );

  // Normalize 0..100 engineering scores
  const upstopClampScore = clamp(Math.round((rawUpstop / 135) * 100), 12, 100);
  const lateralGripScore = clamp(Math.round((rawLateral / 130) * 100), 14, 100);
  const topSpeedScore = clamp(Math.round((rawSpeed / 135) * 100), 18, 100);
  const launchBoostPower = clamp(Math.round((rawBoost / 85) * 100), 15, 100);
  const gyroTiltAuthority = clamp(Math.round((rawGyro / 95) * 100), 12, 100);
  const brakePowerScore = clamp(Math.round((rawBrake / 80) * 100), 14, 100);
  const restraintSafetyScore = clamp(Math.round((rawSafety / 100) * 100), 15, 100);
  const structuralToughness = clamp(Math.round((rawToughness / 145) * 100), 18, 100);
  const thrillScore = clamp(Math.round((rawThrill / 145) * 100), 20, 100);

  // Negative-G threshold before upstop clamp blowout (e.g. -1.35G for sketchy casters up to -2.65G for urethane + OTS/cage)
  const maxSafeNegativeG = Number(
    (-1.22 - (upstopClampScore / 100) * 1.38 - (restraintSafetyScore / 100) * 0.25).toFixed(2)
  );
  const maxSafeLateralG = Number(
    (1.25 + (lateralGripScore / 100) * 1.45 - Math.max(0, comHeightMeters - 0.3) * 1.2).toFixed(2)
  );

  let safetyStatus: CoasterSafetyStatus = 'locked_in';
  let safetyLabel = 'UPSTOP LOCKED IN';
  let safetyHint =
    'Tri-wheel bogies and restraints are tightly clamped for Vertical Loops and Ejector Camelbacks!';

  if (upstopClampScore < 46) {
    safetyStatus = 'airtime_risk';
    safetyLabel = 'AIRTIME LIFTOFF RISK!';
    safetyHint = `Upstop clamp is loose (${maxSafeNegativeG}G max)! Feather Magnet Brakes before the Camelback Airtime Hills!`;
  } else if (comHeightMeters >= 0.37 && lateralGripScore < 65) {
    safetyStatus = 'high_cog_tippy';
    safetyLabel = 'HIGH CoG — LEAN IN HELIX!';
    safetyHint =
      'Tall center of gravity! Lean hard into the 50° Banked Helix and Whip S-Curve to cancel lateral Gs!';
  } else if (totalMassLbs >= 1020 && brakePowerScore < 55) {
    safetyStatus = 'heavy_momentum';
    safetyLabel = 'HEAVY TRAIN MOMENTUM';
    safetyHint =
      'High train weight carries huge speed — engage Magnet Brakes early to stop inside the Station Bullseye!';
  }

  return {
    totalMassLbs,
    comHeightMeters,
    upstopClampScore,
    lateralGripScore,
    topSpeedScore,
    launchBoostPower,
    gyroTiltAuthority,
    brakePowerScore,
    restraintSafetyScore,
    structuralToughness,
    thrillScore,
    maxSafeNegativeG,
    maxSafeLateralG,
    safetyStatus,
    safetyLabel,
    safetyHint,
  };
}
