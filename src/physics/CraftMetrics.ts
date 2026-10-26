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

  let partsMassLbs = 0;
  let partsMoment = 0;
  let rawWingAreaM2 = 0;
  let aeroWeightedMoment = 0;
  let aeroWeightDenom = 0;
  let weightedLiftSum = 0;
  let dragSum = 0;
  let stabilitySum = 0;
  let toughnessSum = 0;
  let rawCreativity = trolley.creativityPoints;

  for (let i = 0; i < airborneParts.length; i++) {
    const p = airborneParts[i];
    partsMassLbs += p.massLbs;
    partsMoment += p.massLbs * p.cgOffsetX;
    rawWingAreaM2 += p.wingAreaM2;
    const effLift = Math.max(0.2, p.liftMultiplier);
    aeroWeightedMoment += p.wingAreaM2 * effLift * p.acOffsetX;
    aeroWeightDenom += p.wingAreaM2 * effLift;
    weightedLiftSum += p.liftMultiplier * p.wingAreaM2;
    dragSum += p.dragCoeff;
    stabilitySum += p.pitchStability;
    toughnessSum += p.toughness;
    rawCreativity += p.creativityPoints;
  }

  const airborneMassLbs = partsMassLbs + PILOT_MASS_LBS;
  const rampTotalMassLbs = airborneMassLbs + trolley.massLbs;

  // Compute Center of Gravity (CG) along longitudinal axis (+X = nose, -X = tail)
  // Pilot sits near cockpit center (+0.04m)
  const pilotMoment = PILOT_MASS_LBS * 0.04;
  const cgX = (pilotMoment + partsMoment) / airborneMassLbs;

  // Compute Aerodynamic Center / Center of Lift (AC) weighted by surface area & lift effectiveness
  const totalWingAreaM2 = Math.max(1.5, rawWingAreaM2);
  const acX = aeroWeightedMoment / Math.max(1.0, aeroWeightDenom);

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
  const effectiveLiftMultiplier = weightedLiftSum / totalWingAreaM2;
  const baseDragCoeff = Math.max(0.035, dragSum);
  const pitchStability = Math.max(0.05, stabilitySum);
  const structuralToughness = toughnessSum / airborneParts.length;
  const pushEfficiency = trolley.pushEfficiency ?? 1.0;

  // Kid-friendly 0-100 visual meters
  const liftScore = Math.min(100, Math.round(((totalWingAreaM2 * effectiveLiftMultiplier) / 18.5) * 100));
  const weightScore = Math.min(100, Math.round((rampTotalMassLbs / MAX_FLUGTAG_WEIGHT_LBS) * 100));
  const balancePenalty = Math.abs(staticMargin - 0.17) * 115;
  const stabilityScore = Math.max(10, Math.min(100, Math.round(pitchStability * 65 - balancePenalty + 25)));
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
