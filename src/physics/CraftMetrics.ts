import {
  CraftLoadout,
  CraftPart,
  getPartById,
  MAX_FLUGTAG_WEIGHT_LBS,
  PILOT_MASS_LBS,
} from '../builder/PartCatalog';

export type BalanceStatus = 'nose_heavy' | 'balanced' | 'tail_heavy';

export interface ComputedCraftMetrics {
  parts: {
    chassis: CraftPart;
    wings: CraftPart;
    tail: CraftPart;
    nose: CraftPart;
    topper: CraftPart;
    trolley: CraftPart;
  };
  /** Weight of the flying glider + 145 lb pilot (once trolley drops away) */
  airborneMassLbs: number;
  /** Weight on the ramp including the wheeled launch trolley */
  rampTotalMassLbs: number;
  /** Airborne mass in kilograms for SI physics calculations */
  airborneMassKg: number;
  rampTotalMassKg: number;
  isOverWeightLimit: boolean;
  /** Center of Gravity along longitudinal axis (+forward/nose, -aft/tail) in meters */
  cgX: number;
  /** Center of Lift / Aerodynamic Center along longitudinal axis in meters */
  acX: number;
  /** Static margin (cgX - acX): ideal balanced glider is +0.05m to +0.35m */
  staticMargin: number;
  balanceStatus: BalanceStatus;
  /** Angle in degrees (-25 = nose down, 0 = level, +25 = tail down) for the Hangar Seesaw & Wind Tunnel */
  seesawTiltDeg: number;
  totalWingAreaM2: number;
  effectiveAspectRatio: number;
  effectiveLiftMultiplier: number;
  baseDragCoeff: number;
  pitchStability: number;
  structuralToughness: number;
  pushEfficiency: number;
  /** Kid-friendly 0-100 visual meter values */
  liftScore: number;
  weightScore: number;
  stabilityScore: number;
  creativityScore: number;
}

const LBS_TO_KG = 0.45359237;

export function computeCraftMetrics(loadout: CraftLoadout): ComputedCraftMetrics {
  const chassis = getPartById(loadout.chassis);
  const wings = getPartById(loadout.wings);
  const tail = getPartById(loadout.tail);
  const nose = getPartById(loadout.nose);
  const topper = getPartById(loadout.topper);
  const trolley = getPartById(loadout.trolley);

  const airborneParts = [chassis, wings, tail, nose, topper];
  const partsMassLbs = airborneParts.reduce((sum, p) => sum + p.massLbs, 0);
  const airborneMassLbs = partsMassLbs + PILOT_MASS_LBS;
  const rampTotalMassLbs = airborneMassLbs + trolley.massLbs;

  // Compute Center of Gravity (CG) along longitudinal axis (+X = nose, -X = tail)
  // Pilot sits near cockpit center (+0.04m)
  const pilotMoment = PILOT_MASS_LBS * 0.04;
  const partsMoment = airborneParts.reduce((sum, p) => sum + p.massLbs * p.cgOffsetX, 0);
  const cgX = (pilotMoment + partsMoment) / airborneMassLbs;

  // Compute Aerodynamic Center / Center of Lift (AC) weighted by surface area & lift effectiveness
  const totalWingAreaM2 = Math.max(
    1.5,
    airborneParts.reduce((sum, p) => sum + p.wingAreaM2, 0)
  );
  const aeroWeightedMoment = airborneParts.reduce(
    (sum, p) => sum + p.wingAreaM2 * Math.max(0.2, p.liftMultiplier) * p.acOffsetX,
    0
  );
  const aeroWeightDenom = Math.max(
    1.0,
    airborneParts.reduce((sum, p) => sum + p.wingAreaM2 * Math.max(0.2, p.liftMultiplier), 0)
  );
  const acX = aeroWeightedMoment / aeroWeightDenom;

  // Static margin: CG relative to AC.
  // Ideal balanced range: +0.02m to +0.34m (CG slightly in front of AC, balanced by tail elevator trim)
  const staticMargin = cgX - acX;

  let balanceStatus: BalanceStatus = 'balanced';
  if (staticMargin > 0.35) {
    balanceStatus = 'nose_heavy';
  } else if (staticMargin < -0.01) {
    balanceStatus = 'tail_heavy';
  }

  // Convert staticMargin into a visual seesaw tilt angle:
  // Ideal center is +0.17m -> 0 deg tilt.
  // > +0.35m tilts nose down (-deg); < -0.01m tilts tail down (+deg)
  const rawTilt = (0.17 - staticMargin) * 58;
  const seesawTiltDeg = Math.max(-26, Math.min(26, rawTilt));

  const effectiveAspectRatio = Math.max(2.2, wings.aspectRatio * 0.8 + tail.aspectRatio * 0.2);
  const effectiveLiftMultiplier =
    (wings.liftMultiplier * wings.wingAreaM2 +
      chassis.liftMultiplier * chassis.wingAreaM2 +
      tail.liftMultiplier * tail.wingAreaM2) /
    totalWingAreaM2;

  const baseDragCoeff = Math.max(
    0.035,
    chassis.dragCoeff + wings.dragCoeff + tail.dragCoeff + nose.dragCoeff + topper.dragCoeff
  );

  const pitchStability = Math.max(
    0.05,
    chassis.pitchStability + wings.pitchStability + tail.pitchStability + nose.pitchStability + topper.pitchStability
  );

  const structuralToughness =
    (chassis.toughness + wings.toughness + tail.toughness + nose.toughness + topper.toughness) / 5;

  const pushEfficiency = trolley.pushEfficiency ?? 1.0;

  // Kid-friendly 0-100 visual meters
  const liftScore = Math.min(100, Math.round(((totalWingAreaM2 * effectiveLiftMultiplier) / 18.5) * 100));
  const weightScore = Math.min(100, Math.round((rampTotalMassLbs / MAX_FLUGTAG_WEIGHT_LBS) * 100));
  const balancePenalty = Math.abs(staticMargin - 0.17) * 115;
  const stabilityScore = Math.max(10, Math.min(100, Math.round(pitchStability * 65 - balancePenalty + 25)));
  const rawCreativity = airborneParts.reduce((sum, p) => sum + p.creativityPoints, 0) + trolley.creativityPoints;
  const creativityScore = Math.min(100, Math.round((rawCreativity / 135) * 100));

  return {
    parts: { chassis, wings, tail, nose, topper, trolley },
    airborneMassLbs,
    rampTotalMassLbs,
    airborneMassKg: airborneMassLbs * LBS_TO_KG,
    rampTotalMassKg: rampTotalMassLbs * LBS_TO_KG,
    isOverWeightLimit: rampTotalMassLbs > MAX_FLUGTAG_WEIGHT_LBS,
    cgX,
    acX,
    staticMargin,
    balanceStatus,
    seesawTiltDeg,
    totalWingAreaM2,
    effectiveAspectRatio,
    effectiveLiftMultiplier,
    baseDragCoeff,
    pitchStability,
    structuralToughness,
    pushEfficiency,
    liftScore,
    weightScore,
    stabilityScore,
    creativityScore,
  };
}
