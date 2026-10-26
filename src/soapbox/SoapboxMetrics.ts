import {
  getSoapboxPartById,
  SOAPBOX_DRIVER_WEIGHT_LBS,
  SoapboxLoadout,
} from './SoapboxPartCatalog';

export type SoapboxHandlingStatus = 'planted' | 'tippy' | 'understeer' | 'drift_happy';

export interface ComputedSoapboxMetrics {
  totalMassLbs: number;
  cgX: number;
  cgHeightMeters: number;
  trackWidthMeters: number;
  staticStabilityFactor: number;
  rolloverStabilityIndex: number;
  criticalRolloverDeg: number;
  speedScore: number;
  gripScore: number;
  suspensionScore: number;
  brakeScore: number;
  roughTerrainRating: number;
  hayPlowProtection: number;
  structuralToughness: number;
  creativityScore: number;
  handlingStatus: SoapboxHandlingStatus;
  // Raw physics parameters for 120Hz simulation
  aeroDragCdA: number;
  downforceFactor: number;
  rollingResistance: number;
  lateralGripMultiplier: number;
  wheelRadiusMeters: number;
  suspensionTravelMeters: number;
  antiRollStiffness: number;
  brakePower: number;
  brakeHeatResistance: number;
  driftAgility: number;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function computeSoapboxMetrics(loadout: SoapboxLoadout): ComputedSoapboxMetrics {
  const chassis = getSoapboxPartById(loadout.chassis, 'chassis');
  const steering = getSoapboxPartById(loadout.steering, 'steering');
  const wheels = getSoapboxPartById(loadout.wheels, 'wheels');
  const suspension = getSoapboxPartById(loadout.suspension, 'suspension');
  const brakes = getSoapboxPartById(loadout.brakes, 'brakes');
  const topper = getSoapboxPartById(loadout.topper, 'topper');

  const parts = [chassis, steering, wheels, suspension, brakes, topper];

  const partsMassLbs = parts.reduce((sum, p) => sum + p.massLbs, 0);
  const totalMassLbs = Math.round(partsMassLbs + SOAPBOX_DRIVER_WEIGHT_LBS);

  // Weighted longitudinal Center of Gravity (driver sits near x = -0.05m)
  const weightedCgX =
    parts.reduce((sum, p) => sum + p.cgX * p.massLbs, 0) +
    -0.05 * SOAPBOX_DRIVER_WEIGHT_LBS;
  const cgX = clamp(weightedCgX / Math.max(1, totalMassLbs), -0.45, 0.45);

  // Vertical Center of Gravity height h_CG in meters
  const rawCgHeight =
    chassis.cgHeightOffsetMeters +
    steering.cgHeightOffsetMeters +
    wheels.cgHeightOffsetMeters +
    suspension.cgHeightOffsetMeters +
    brakes.cgHeightOffsetMeters +
    topper.cgHeightOffsetMeters;
  const cgHeightMeters = Number(clamp(rawCgHeight, 0.24, 0.82).toFixed(2));

  // Track Width T_w in meters (steering sets base stance, chassis/wheels/suspension adjust)
  const rawTrackWidth =
    steering.trackWidthMeters +
    chassis.trackWidthMeters +
    wheels.trackWidthMeters +
    suspension.trackWidthMeters;
  const trackWidthMeters = Number(clamp(rawTrackWidth, 1.0, 1.82).toFixed(2));

  // Static Stability Factor SSF = T_w / (2 * h_CG)
  // Typical range: 1.08 / (2 * 0.65) = 0.83 (very tippy) up to 1.74 / (2 * 0.28) = 3.10 (ultra-planted)
  const staticStabilityFactor = Number(
    (trackWidthMeters / Math.max(0.3, 2 * cgHeightMeters)).toFixed(2)
  );

  const antiRollStiffness = clamp(
    parts.reduce((sum, p) => sum + p.antiRollStiffness, 0),
    0.05,
    1.15
  );

  // Map SSF + anti-roll stiffness to 0..100 Rollover Stability Index
  const rawRolloverIndex =
    ((staticStabilityFactor - 0.82) / 1.45) * 72 + antiRollStiffness * 32;
  const rolloverStabilityIndex = Math.round(clamp(rawRolloverIndex, 14, 100));

  // Critical rollover threshold angle (32°..45° based on rolloverStabilityIndex)
  const criticalRolloverDeg =
    32 + (clamp(rolloverStabilityIndex, 0, 100) / 100) * 13;

  // Aerodynamic drag & downforce
  const aeroDragCdA = clamp(
    parts.reduce((sum, p) => sum + p.aeroDragCdA, 0),
    0.18,
    0.68
  );
  const downforceFactor = clamp(
    parts.reduce((sum, p) => sum + p.downforceFactor, 0),
    0,
    1.1
  );

  // Rolling resistance & wheel radius
  const rollingResistance = clamp(
    wheels.rollingResistanceFactor + steering.rollingResistanceFactor,
    0.006,
    0.02
  );
  const wheelRadiusMeters = wheels.wheelRadiusMeters || 0.26;

  // Top speed score (0..100): rewards low aero drag, low rolling resistance, and healthy downhill gravity momentum
  const gravityMassBonus = clamp((totalMassLbs - 210) / 240, 0, 1) * 18;
  const aeroSpeedPts = ((0.58 - aeroDragCdA) / 0.38) * 56;
  const rollSpeedPts = ((0.015 - rollingResistance) / 0.008) * 28;
  const speedScore = Math.round(
    clamp(aeroSpeedPts + rollSpeedPts + gravityMassBonus, 22, 100)
  );

  // Lateral cornering grip multiplier & Grip Score (0..100)
  const lateralGripMultiplier = clamp(
    wheels.asphaltGrip +
      steering.asphaltGrip +
      chassis.asphaltGrip +
      suspension.asphaltGrip +
      brakes.asphaltGrip +
      topper.asphaltGrip,
    0.58,
    1.72
  );
  const gripScore = Math.round(
    clamp(((lateralGripMultiplier - 0.58) / 1.02) * 84 + downforceFactor * 22, 20, 100)
  );

  // Rough terrain & cobblestone glide (0..1)
  const roughTerrainRating = Number(
    clamp(
      wheels.roughTerrainRating * 0.65 +
        suspension.roughTerrainRating * 0.45 +
        chassis.roughTerrainRating +
        steering.roughTerrainRating,
      0.05,
      1.0
    ).toFixed(2)
  );

  // Suspension travel & Suspension Score (0..100)
  const suspensionTravelMeters = clamp(
    suspension.suspensionTravelMeters +
      wheels.suspensionTravelMeters +
      steering.suspensionTravelMeters,
    0.05,
    0.48
  );
  const suspensionScore = Math.round(
    clamp(
      (suspensionTravelMeters / 0.38) * 62 + roughTerrainRating * 38,
      15,
      100
    )
  );

  // Brake power, fade resistance & Brake Score (0..100)
  const brakePower = clamp(
    brakes.brakePower + wheels.brakePower + topper.brakePower,
    0.45,
    1.45
  );
  const brakeHeatResistance = clamp(brakes.brakeHeatResistance, 0.2, 1.0);
  const brakeScore = Math.round(
    clamp(((brakePower - 0.42) / 0.92) * 68 + brakeHeatResistance * 32, 20, 100)
  );

  // Hay-bale plow protection (0..1)
  const hayPlowProtection = Number(
    clamp(
      brakes.hayPlowProtection +
        chassis.hayPlowProtection +
        steering.hayPlowProtection +
        wheels.hayPlowProtection +
        topper.hayPlowProtection,
      0,
      0.85
    ).toFixed(2)
  );

  // Drift agility
  const driftAgility = clamp(
    parts.reduce((sum, p) => sum + p.driftAgility, 0),
    0.2,
    1.45
  );

  // Structural toughness (0..100)
  const rawToughness =
    chassis.structuralToughness * 0.35 +
    steering.structuralToughness * 0.2 +
    wheels.structuralToughness * 0.2 +
    suspension.structuralToughness * 0.15 +
    brakes.structuralToughness * 0.1 +
    topper.structuralToughness * 0.2;
  const structuralToughness = Math.round(clamp(rawToughness, 25, 100));

  // Creativity & showmanship score (0..100)
  const rawCreativity = parts.reduce((sum, p) => sum + p.creativityBonus, 0);
  const creativityScore = Math.round(clamp(rawCreativity, 15, 100));

  // Handling status classification
  let handlingStatus: SoapboxHandlingStatus = 'planted';
  if (rolloverStabilityIndex < 46 || cgHeightMeters >= 0.58) {
    handlingStatus = 'tippy';
  } else if (driftAgility >= 0.92 || steering.id === 'sb_steer_caster' || wheels.id === 'sb_wheels_cheese') {
    handlingStatus = 'drift_happy';
  } else if (gripScore < 52 || cgX < -0.14) {
    handlingStatus = 'understeer';
  }

  return {
    totalMassLbs,
    cgX,
    cgHeightMeters,
    trackWidthMeters,
    staticStabilityFactor,
    rolloverStabilityIndex,
    criticalRolloverDeg,
    speedScore,
    gripScore,
    suspensionScore,
    brakeScore,
    roughTerrainRating,
    hayPlowProtection,
    structuralToughness,
    creativityScore,
    handlingStatus,
    aeroDragCdA,
    downforceFactor,
    rollingResistance,
    lateralGripMultiplier,
    wheelRadiusMeters,
    suspensionTravelMeters,
    antiRollStiffness,
    brakePower,
    brakeHeatResistance,
    driftAgility,
  };
}
