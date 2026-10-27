/**
 * Red Bull Tandem Bike Challenge (Game 4)
 * Tandem Part Catalog, Mascot Definitions, Presets & Paint Themes
 */

import type {
  TandemCategory,
  TandemCategoryMeta,
  TandemPart,
  TandemStats,
  TandemLoadout,
  TandemPreset,
  TandemPaintTheme,
  TandemDynoMetrics,
  TandemDynoStatus,
} from './types.ts';

// ============================================================================
// 1. CATEGORIES & METADATA
// ============================================================================

export const TANDEM_CATEGORIES: TandemCategory[] = [
  'frame',
  'drivetrain',
  'wheels',
  'steering',
  'stabilizer',
  'topper',
];

export const CATEGORIES = TANDEM_CATEGORIES;

export const TANDEM_CATEGORY_META: Record<TandemCategory, TandemCategoryMeta> = {
  frame: {
    id: 'frame',
    label: 'Tandem Frame',
    shortLabel: 'Frame',
    emoji: '🚲',
    description: 'Structural chassis connecting Captain (front) and Stoker (rear). Governs frame rigidity, baseline mass, and center of gravity.',
    keyHint: '1',
  },
  drivetrain: {
    id: 'drivetrain',
    label: 'Dual Drivetrain',
    shortLabel: 'Drive',
    emoji: '⚙️',
    description: 'Synchronous crossover timing chain & gearing coupling both riders. Determines cadence power output and climb torque.',
    keyHint: '2',
  },
  wheels: {
    id: 'wheels',
    label: 'Wheelset & Tires',
    shortLabel: 'Wheels',
    emoji: '🛞',
    description: 'Contact points on the wooden pier beam. Influences rolling friction, beam edge grip, and cushion over rhythm whoops.',
    keyHint: '3',
  },
  steering: {
    id: 'steering',
    label: 'Steering & Handlebars',
    shortLabel: 'Steering',
    emoji: '🕹️',
    description: 'Dual linked handlebars. Controls steering agility, counter-steering responsiveness, and lateral balance corrections.',
    keyHint: '4',
  },
  stabilizer: {
    id: 'stabilizer',
    label: 'Stabilizer & Outriggers',
    shortLabel: 'Stabilizer',
    emoji: '🛟',
    description: 'External training wheels, buoyant pontoons, or hydrofoils. Defines critical rollover angle and roll damping.',
    keyHint: '5',
  },
  topper: {
    id: 'topper',
    label: 'Crew Mascot Topper',
    shortLabel: 'Topper',
    emoji: '🦮',
    description: 'Top-deck mascots (including Shadow and Boomer), aero wings, and horns. Grants showmanship and dynamic weight leverage.',
    keyHint: '6',
  },
};

// ============================================================================
// 2. 38-PART COMPONENT CATALOG
// ============================================================================

export const TANDEM_PART_CATALOG: TandemPart[] = [
  // --------------------------------------------------------------------------
  // Category 1: Tandem Frame (6 parts: 0, 2, 4, 6, 8, 12 stars)
  // --------------------------------------------------------------------------
  {
    id: 'frame_cruiser',
    name: 'Double-Diamond Steel Cruiser',
    category: 'frame',
    emoji: '🚲',
    tagline: 'Classic heavy tubular steel twin-cockpit tandem frame. Sturdy, predictable, and low center of gravity.',
    unlockStars: 0,
    costStars: 0,
    stats: {
      massKg: 14.5,
      dragCoeff: 0.32,
      cadencePowerW: 40,
      lateralStability: 15,
      rollDamping: 8,
      steeringAgility: 6,
      outriggerWidthFt: 0,
    },
    description: 'Traditional welded steel tandem bicycle frame with twin triangular diamonds and oversized down tube. Absorbs vibrations across uneven wooden pier planks.',
    creativityPoints: 12,
    creativityBonus: 12,
    visual: {
      meshType: 'cruiser',
      meshStyle: 'cruiser',
      primaryColor: '#3b82f6',
      secondaryColor: '#1e293b',
      roughness: 0.5,
      metalness: 0.2,
      badgeEmoji: '🚲',
    },
  },
  {
    id: 'frame_alloy_road',
    name: 'Hydroformed Sport Alloy Tandem',
    category: 'frame',
    emoji: '⚡',
    tagline: 'Double-butted 6061-T6 aluminum tubes with reinforced lateral boom tube for increased sprint rigidity.',
    unlockStars: 2,
    costStars: 2,
    stats: {
      massKg: 11.2,
      dragCoeff: 0.28,
      cadencePowerW: 55,
      lateralStability: 14,
      rollDamping: 6,
      steeringAgility: 8,
      outriggerWidthFt: 0,
    },
    description: 'Lighter sport tandem chassis engineered for snappy power transfer across seesaws and reduced rolling inertia.',
    creativityPoints: 18,
    creativityBonus: 18,
    visual: {
      meshType: 'alloy_road',
      meshStyle: 'alloy_road',
      primaryColor: '#06b6d4',
      secondaryColor: '#f8fafc',
      roughness: 0.35,
      metalness: 0.6,
      badgeEmoji: '⚡',
    },
  },
  {
    id: 'frame_carbon_aero',
    name: 'Monocoque Carbon Aero Tandem',
    category: 'frame',
    emoji: '🪶',
    tagline: 'High-modulus carbon fiber monocoque frame with integrated airfoil tubes and internal cable routing.',
    unlockStars: 4,
    costStars: 4,
    stats: {
      massKg: 8.4,
      dragCoeff: 0.22,
      cadencePowerW: 75,
      lateralStability: 16,
      rollDamping: 5,
      steeringAgility: 10,
      outriggerWidthFt: 0,
    },
    description: 'Wind-tunnel sculpted tandem chassis slashing aerodynamic drag while delivering ultra-crisp pedal power directly to the rear hub.',
    creativityPoints: 25,
    creativityBonus: 25,
    visual: {
      meshType: 'carbon_aero',
      meshStyle: 'carbon_aero',
      primaryColor: '#0f172a',
      secondaryColor: '#ef4444',
      roughness: 0.25,
      metalness: 0.8,
      badgeEmoji: '🪶',
    },
  },
  {
    id: 'frame_heavy_cargo',
    name: 'Heavy Hauler Truss Frame',
    category: 'frame',
    emoji: '🏗️',
    tagline: 'Reinforced 4130 chromoly steel space-truss tandem with extended wheelbase and low-slung ballast tray.',
    unlockStars: 6,
    costStars: 6,
    stats: {
      massKg: 18.2,
      dragCoeff: 0.36,
      cadencePowerW: 50,
      lateralStability: 22,
      rollDamping: 12,
      steeringAgility: 4,
      outriggerWidthFt: 0,
    },
    description: 'Industrial-grade tandem frame built like a bridge. Heavy momentum easily tips seesaws and ignores gusty water-cannon blasts.',
    creativityPoints: 30,
    creativityBonus: 30,
    visual: {
      meshType: 'heavy_cargo',
      meshStyle: 'heavy_cargo',
      primaryColor: '#f97316',
      secondaryColor: '#334155',
      roughness: 0.6,
      metalness: 0.3,
      badgeEmoji: '🏗️',
    },
  },
  {
    id: 'frame_hydrofoil_truss',
    name: 'Titanium Hydro-Truss Tandem',
    category: 'frame',
    emoji: '🌊',
    tagline: '3D-printed aerospace grade-5 titanium lattice with water-channeling fairings and buoyant sealed down tubes.',
    unlockStars: 8,
    costStars: 8,
    stats: {
      massKg: 7.2,
      dragCoeff: 0.20,
      cadencePowerW: 90,
      lateralStability: 18,
      rollDamping: 7,
      steeringAgility: 12,
      outriggerWidthFt: 0,
    },
    description: 'Featherlight yet indestructible titanium exo-skeleton that skims water spray with low frontal area and supreme balance control.',
    creativityPoints: 38,
    creativityBonus: 38,
    visual: {
      meshType: 'hydrofoil_truss',
      meshStyle: 'hydrofoil_truss',
      primaryColor: '#e2e8f0',
      secondaryColor: '#0284c7',
      roughness: 0.2,
      metalness: 0.9,
      badgeEmoji: '🌊',
    },
  },
  {
    id: 'frame_rb_spaceframe',
    name: 'Red Bull F1 Monocoque Spaceframe',
    category: 'frame',
    emoji: '🏎️',
    tagline: 'Formula-1 inspired pre-preg carbon honeycomb monocoque with active ground-effect underbody tunnel.',
    unlockStars: 12,
    costStars: 12,
    stats: {
      massKg: 6.1,
      dragCoeff: 0.16,
      cadencePowerW: 110,
      lateralStability: 24,
      rollDamping: 9,
      steeringAgility: 14,
      outriggerWidthFt: 0,
    },
    description: 'The ultimate Red Bull racing chassis. Maximum structural rigidity, featherweight mass, and championship-winning balance telemetry.',
    creativityPoints: 50,
    creativityBonus: 50,
    visual: {
      meshType: 'rb_spaceframe',
      meshStyle: 'rb_spaceframe',
      primaryColor: '#1e293b',
      secondaryColor: '#facc15',
      accentColor: '#dc2626',
      roughness: 0.15,
      metalness: 0.85,
      badgeEmoji: '🏎️',
    },
  },

  // --------------------------------------------------------------------------
  // Category 2: Dual Drivetrain (6 parts: 0, 2, 4, 6, 8, 12 stars)
  // --------------------------------------------------------------------------
  {
    id: 'drivetrain_dual_chain',
    name: 'Dual-Chain Direct Sync',
    category: 'drivetrain',
    emoji: '⚙️',
    tagline: 'Steel timing chain connecting Captain and Stoker cranks 1:1, coupled with a robust single-speed rear freewheel.',
    unlockStars: 0,
    costStars: 0,
    stats: {
      massKg: 4.8,
      dragCoeff: 0.04,
      cadencePowerW: 260,
      lateralStability: 10,
      rollDamping: 4,
      steeringAgility: 4,
      outriggerWidthFt: 0,
    },
    description: 'Reliable mechanical dual-chain layout. Simple, durable, and forgiving of slight cadence desyncs on the launch dock.',
    creativityPoints: 10,
    creativityBonus: 10,
    visual: {
      meshType: 'dual_chain_sync',
      meshStyle: 'dual_chain_sync',
      primaryColor: '#64748b',
      secondaryColor: '#94a3b8',
      roughness: 0.4,
      metalness: 0.6,
      badgeEmoji: '⚙️',
    },
  },
  {
    id: 'drivetrain_singlespeed',
    name: 'Lightweight Overdrive Cog',
    category: 'drivetrain',
    emoji: '🚲',
    tagline: 'CNC aluminum timing chainring with an aggressive 53x14 sprint ratio for high flat-out speed.',
    unlockStars: 2,
    costStars: 2,
    stats: {
      massKg: 3.6,
      dragCoeff: 0.03,
      cadencePowerW: 310,
      lateralStability: 9,
      rollDamping: 3,
      steeringAgility: 5,
      outriggerWidthFt: 0,
    },
    description: 'Minimalist drivetrain stripped of derailleur pulleys to minimize friction and deliver raw sprint velocity.',
    creativityPoints: 16,
    creativityBonus: 16,
    visual: {
      meshType: 'direct_singlespeed',
      meshStyle: 'direct_singlespeed',
      primaryColor: '#cbd5e1',
      secondaryColor: '#0284c7',
      roughness: 0.3,
      metalness: 0.7,
      badgeEmoji: '🚲',
    },
  },
  {
    id: 'drivetrain_derailleur_21',
    name: '21-Speed Index Derailleur',
    category: 'drivetrain',
    emoji: '🎛️',
    tagline: 'Wide-range triple chainring and 7-speed cassette with bar-end friction shifters.',
    unlockStars: 4,
    costStars: 4,
    stats: {
      massKg: 4.4,
      dragCoeff: 0.035,
      cadencePowerW: 370,
      lateralStability: 11,
      rollDamping: 4,
      steeringAgility: 6,
      outriggerWidthFt: 0,
    },
    description: 'Versatile gear ratios allow spinning high cadence up seesaw ramps and blasting down rhythm rollers without spinning out.',
    creativityPoints: 22,
    creativityBonus: 22,
    visual: {
      meshType: 'derailleur_21',
      meshStyle: 'derailleur_21',
      primaryColor: '#475569',
      secondaryColor: '#e2e8f0',
      roughness: 0.4,
      metalness: 0.7,
      badgeEmoji: '🎛️',
    },
  },
  {
    id: 'drivetrain_planetary_hub',
    name: 'Sealed Dual Planetary Gearbox',
    category: 'drivetrain',
    emoji: '🪐',
    tagline: 'Internal 8-speed oil-bath planetary hub gear driven by a silent carbon belt drive.',
    unlockStars: 6,
    costStars: 6,
    stats: {
      massKg: 5.6,
      dragCoeff: 0.025,
      cadencePowerW: 410,
      lateralStability: 14,
      rollDamping: 6,
      steeringAgility: 5,
      outriggerWidthFt: 0,
    },
    description: 'Immune to splashing water and spray. Low center-of-gravity mass stabilizes the frame while maintaining continuous torque.',
    creativityPoints: 32,
    creativityBonus: 32,
    visual: {
      meshType: 'planetary_hub',
      meshStyle: 'planetary_hub',
      primaryColor: '#0f172a',
      secondaryColor: '#d97706',
      roughness: 0.3,
      metalness: 0.8,
      badgeEmoji: '🪐',
    },
  },
  {
    id: 'drivetrain_electronic_assist',
    name: 'Electronic Cadence Torque Multiplier',
    category: 'drivetrain',
    emoji: '🔋',
    tagline: 'Brushless bottom-bracket torque sensor that doubles rider pedal pulses with zero driveline lag.',
    unlockStars: 8,
    costStars: 8,
    stats: {
      massKg: 4.2,
      dragCoeff: 0.02,
      cadencePowerW: 460,
      lateralStability: 12,
      rollDamping: 5,
      steeringAgility: 7,
      outriggerWidthFt: 0,
    },
    description: 'High-tech cadence amplifier that keeps Captain and Stoker in flawless synchronization even through bumpy whoops.',
    creativityPoints: 40,
    creativityBonus: 40,
    visual: {
      meshType: 'electronic_assist',
      meshStyle: 'electronic_assist',
      primaryColor: '#06b6d4',
      secondaryColor: '#3b82f6',
      roughness: 0.25,
      metalness: 0.75,
      badgeEmoji: '🔋',
    },
  },
  {
    id: 'drivetrain_rb_turbo',
    name: 'Red Bull Ceramic Sprint Drive',
    category: 'drivetrain',
    emoji: '🚀',
    tagline: 'CeramicSpeed bearings, oversized carbon derailleur cage, and ovalized Q-Rings for explosive launch dock starts.',
    unlockStars: 12,
    costStars: 12,
    stats: {
      massKg: 3.1,
      dragCoeff: 0.015,
      cadencePowerW: 520,
      lateralStability: 15,
      rollDamping: 5,
      steeringAgility: 8,
      outriggerWidthFt: 0,
    },
    description: 'Unmatched 520W cadence transfer efficiency. Transfers every joule of rider sweat into blistering forward propulsion.',
    creativityPoints: 52,
    creativityBonus: 52,
    visual: {
      meshType: 'rb_turbo_gear',
      meshStyle: 'rb_turbo_gear',
      primaryColor: '#dc2626',
      secondaryColor: '#facc15',
      roughness: 0.15,
      metalness: 0.9,
      badgeEmoji: '🚀',
    },
  },

  // --------------------------------------------------------------------------
  // Category 3: Wheelset & Tires (6 parts: 0, 2, 4, 6, 8, 12 stars)
  // --------------------------------------------------------------------------
  {
    id: 'wheels_classic',
    name: '26" Spoked Alloy Wheelset',
    category: 'wheels',
    emoji: '🛞',
    tagline: '36-spoke box-section aluminum rims with all-condition semi-slick commuter tires.',
    unlockStars: 0,
    costStars: 0,
    stats: {
      massKg: 5.2,
      dragCoeff: 0.10,
      cadencePowerW: 25,
      lateralStability: 12,
      rollDamping: 6,
      steeringAgility: 6,
      outriggerWidthFt: 0,
    },
    description: 'Traditional tandem wheelset with high spoke count for heavy two-rider durability. Great beam traction and predictable rollover.',
    creativityPoints: 10,
    creativityBonus: 10,
    visual: {
      meshType: 'classic_spoke',
      meshStyle: 'classic_spoke',
      primaryColor: '#94a3b8',
      secondaryColor: '#1e293b',
      roughness: 0.45,
      metalness: 0.5,
      badgeEmoji: '🛞',
    },
  },
  {
    id: 'wheels_fat_floats',
    name: '29" Sand & Float Paddle Tires',
    category: 'wheels',
    emoji: '🛟',
    tagline: 'Extra-wide 3.8" buoyant balloon tires with directional water-paddling tread ribs.',
    unlockStars: 2,
    costStars: 2,
    stats: {
      massKg: 6.8,
      dragCoeff: 0.14,
      cadencePowerW: 15,
      lateralStability: 20,
      rollDamping: 10,
      steeringAgility: 4,
      outriggerWidthFt: 0,
    },
    description: 'Ultra-wide contact patch provides immense beam edge grip and cushioning over rhythm rollers, plus emergency buoyancy!',
    creativityPoints: 20,
    creativityBonus: 20,
    visual: {
      meshType: 'fat_floats',
      meshStyle: 'fat_floats',
      primaryColor: '#f97316',
      secondaryColor: '#1e293b',
      roughness: 0.6,
      metalness: 0.1,
      badgeEmoji: '🛟',
    },
  },
  {
    id: 'wheels_deep_dish',
    name: '700c Deep-V Aero Rims',
    category: 'wheels',
    emoji: '🏎️',
    tagline: '60mm carbon deep-section rims laced with bladed spokes and fast-rolling 28mm track rubber.',
    unlockStars: 4,
    costStars: 4,
    stats: {
      massKg: 4.1,
      dragCoeff: 0.065,
      cadencePowerW: 40,
      lateralStability: 11,
      rollDamping: 5,
      steeringAgility: 8,
      outriggerWidthFt: 0,
    },
    description: 'Reduces aerodynamic drag at high speed while stiffening lateral wheel flex during hard out-of-the-saddle sprints.',
    creativityPoints: 24,
    creativityBonus: 24,
    visual: {
      meshType: 'deep_dish_aero',
      meshStyle: 'deep_dish_aero',
      primaryColor: '#0f172a',
      secondaryColor: '#ef4444',
      roughness: 0.25,
      metalness: 0.8,
      badgeEmoji: '🏎️',
    },
  },
  {
    id: 'wheels_carbon_tri',
    name: 'Tri-Spoke Carbon Aero Blades',
    category: 'wheels',
    emoji: '🎯',
    tagline: 'Monocoque 3-spoke carbon composite wheelset engineered for high-speed time trials.',
    unlockStars: 6,
    costStars: 6,
    stats: {
      massKg: 3.6,
      dragCoeff: 0.05,
      cadencePowerW: 50,
      lateralStability: 13,
      rollDamping: 4,
      steeringAgility: 9,
      outriggerWidthFt: 0,
    },
    description: 'Slices through crosswinds and delivers razor-sharp steering feedback to the Captain on narrow beam sections.',
    creativityPoints: 34,
    creativityBonus: 34,
    visual: {
      meshType: 'carbon_tri_spoke',
      meshStyle: 'carbon_tri_spoke',
      primaryColor: '#1e293b',
      secondaryColor: '#38bdf8',
      roughness: 0.2,
      metalness: 0.85,
      badgeEmoji: '🎯',
    },
  },
  {
    id: 'wheels_hydroblade_mag',
    name: 'Magnesium Hydro-Blade Wheels',
    category: 'wheels',
    emoji: '🌊',
    tagline: 'Ultralight cast magnesium 5-blade wheels with integrated water-shedding turbine grooves.',
    unlockStars: 8,
    costStars: 8,
    stats: {
      massKg: 3.2,
      dragCoeff: 0.045,
      cadencePowerW: 60,
      lateralStability: 15,
      rollDamping: 6,
      steeringAgility: 10,
      outriggerWidthFt: 0,
    },
    description: 'Channels away puddle spray from wet wooden planks while maximizing rotational inertia recovery on the launch ramp.',
    creativityPoints: 42,
    creativityBonus: 42,
    visual: {
      meshType: 'hydroblade_mag',
      meshStyle: 'hydroblade_mag',
      primaryColor: '#e2e8f0',
      secondaryColor: '#06b6d4',
      roughness: 0.2,
      metalness: 0.9,
      badgeEmoji: '🌊',
    },
  },
  {
    id: 'wheels_rb_slicks',
    name: 'Red Bull Ultra-Low Rolling Track Slicks',
    category: 'wheels',
    emoji: '🏆',
    tagline: 'Full carbon disc rear wheel paired with ceramic-bearing front track wheel and compound-soft grip rubber.',
    unlockStars: 12,
    costStars: 12,
    stats: {
      massKg: 2.8,
      dragCoeff: 0.035,
      cadencePowerW: 75,
      lateralStability: 16,
      rollDamping: 6,
      steeringAgility: 11,
      outriggerWidthFt: 0,
    },
    description: 'Zero aerodynamic spoke turbulence and maximum kinetic roll efficiency for setting the course finish time world record.',
    creativityPoints: 55,
    creativityBonus: 55,
    visual: {
      meshType: 'rb_monocoque_slicks',
      meshStyle: 'rb_monocoque_slicks',
      primaryColor: '#1e293b',
      secondaryColor: '#facc15',
      roughness: 0.15,
      metalness: 0.9,
      badgeEmoji: '🏆',
    },
  },

  // --------------------------------------------------------------------------
  // Category 4: Steering & Handlebars (6 parts: 0, 2, 4, 6, 8, 12 stars)
  // --------------------------------------------------------------------------
  {
    id: 'steering_twin_cruiser',
    name: 'Twin Linked Cruiser Ape Bars',
    category: 'steering',
    emoji: '🕹️',
    tagline: 'Swept-back steel cruiser handlebars for both Captain and Stoker with an adjustable tie-rod link.',
    unlockStars: 0,
    costStars: 0,
    stats: {
      massKg: 3.4,
      dragCoeff: 0.08,
      cadencePowerW: 15,
      lateralStability: 18,
      rollDamping: 7,
      steeringAgility: 18,
      outriggerWidthFt: 0,
    },
    description: 'Relaxed upright riding posture gives wide peripheral view of beam obstacles and smooth, forgiving steering inputs.',
    creativityPoints: 12,
    creativityBonus: 12,
    visual: {
      meshType: 'twin_cruiser',
      meshStyle: 'twin_cruiser',
      primaryColor: '#64748b',
      secondaryColor: '#f59e0b',
      roughness: 0.4,
      metalness: 0.6,
      badgeEmoji: '🕹️',
    },
  },
  {
    id: 'steering_bullhorn_pursuit',
    name: 'Drop-Bar Bullhorn Pursuit Bars',
    category: 'steering',
    emoji: '🐂',
    tagline: 'Forward-swept aluminum pursuit bullhorns for aggressive out-of-the-saddle sprint leverage.',
    unlockStars: 2,
    costStars: 2,
    stats: {
      massKg: 2.6,
      dragCoeff: 0.05,
      cadencePowerW: 25,
      lateralStability: 14,
      rollDamping: 5,
      steeringAgility: 26,
      outriggerWidthFt: 0,
    },
    description: 'Lowers Captain torso profile to cut headwind while providing wide hand positions for aggressive counter-steering.',
    creativityPoints: 18,
    creativityBonus: 18,
    visual: {
      meshType: 'bullhorn_pursuit',
      meshStyle: 'bullhorn_pursuit',
      primaryColor: '#0f172a',
      secondaryColor: '#ef4444',
      roughness: 0.3,
      metalness: 0.7,
      badgeEmoji: '🐂',
    },
  },
  {
    id: 'steering_wide_trail',
    name: 'Wide MTB Low-Rise Trail Bars',
    category: 'steering',
    emoji: '🌲',
    tagline: '780mm wide aluminum riser bar with ergonomic lock-on grips and hydraulic steering damper.',
    unlockStars: 4,
    costStars: 4,
    stats: {
      massKg: 2.9,
      dragCoeff: 0.06,
      cadencePowerW: 20,
      lateralStability: 22,
      rollDamping: 9,
      steeringAgility: 30,
      outriggerWidthFt: 0,
    },
    description: 'Massive steering leverage allows Captain to instantly snap the front wheel back on track if the bike slips toward the beam edge.',
    creativityPoints: 22,
    creativityBonus: 22,
    visual: {
      meshType: 'wide_trail',
      meshStyle: 'wide_trail',
      primaryColor: '#15803d',
      secondaryColor: '#facc15',
      roughness: 0.35,
      metalness: 0.65,
      badgeEmoji: '🌲',
    },
  },
  {
    id: 'steering_ape_hangers',
    name: 'High-Rise Chopper Ape Hangers',
    category: 'steering',
    emoji: '🏍️',
    tagline: 'Sky-high 20" chromed chopper ape hangers with fringed leather grips and loud novelty horn.',
    unlockStars: 6,
    costStars: 6,
    stats: {
      massKg: 4.2,
      dragCoeff: 0.11,
      cadencePowerW: 10,
      lateralStability: 26,
      rollDamping: 11,
      steeringAgility: 22,
      outriggerWidthFt: 0,
    },
    description: 'Outrageous showmanship and immense lateral pendular leverage. The crowd roars as the Captain steers from above shoulder height!',
    creativityPoints: 38,
    creativityBonus: 38,
    visual: {
      meshType: 'ape_hangers',
      meshStyle: 'ape_hangers',
      primaryColor: '#f8fafc',
      secondaryColor: '#dc2626',
      roughness: 0.2,
      metalness: 0.9,
      badgeEmoji: '🏍️',
    },
  },
  {
    id: 'steering_clipon_aero',
    name: 'Low-Slung Dual Aero Clip-Ons',
    category: 'steering',
    emoji: '⚡',
    tagline: 'Carbon fiber TT triathlon extensions with molded forearm cups and electronic push-button shifting.',
    unlockStars: 8,
    costStars: 8,
    stats: {
      massKg: 2.1,
      dragCoeff: 0.035,
      cadencePowerW: 35,
      lateralStability: 15,
      rollDamping: 6,
      steeringAgility: 32,
      outriggerWidthFt: 0,
    },
    description: 'Ultra-low aerodynamic drag tuck. Minimizes torso frontal area on long straightaways while dampening twitchy steering.',
    creativityPoints: 36,
    creativityBonus: 36,
    visual: {
      meshType: 'clipon_low',
      meshStyle: 'clipon_low',
      primaryColor: '#0284c7',
      secondaryColor: '#38bdf8',
      roughness: 0.2,
      metalness: 0.8,
      badgeEmoji: '⚡',
    },
  },
  {
    id: 'steering_rb_dynamic',
    name: 'Red Bull Dynamic Linked Bars',
    category: 'steering',
    emoji: '🏎️',
    tagline: 'Fly-by-wire linked steering with integrated telemetry HUD display and active counter-steer torque servo.',
    unlockStars: 12,
    costStars: 12,
    stats: {
      massKg: 1.8,
      dragCoeff: 0.03,
      cadencePowerW: 45,
      lateralStability: 28,
      rollDamping: 10,
      steeringAgility: 42,
      outriggerWidthFt: 0,
    },
    description: 'Championship-grade steering precision. Captain and Stoker handlebars share harmonic balance correction for maximum beam stability.',
    creativityPoints: 52,
    creativityBonus: 52,
    visual: {
      meshType: 'rb_dynamic_linked',
      meshStyle: 'rb_dynamic_linked',
      primaryColor: '#1e293b',
      secondaryColor: '#facc15',
      roughness: 0.15,
      metalness: 0.85,
      badgeEmoji: '🏎️',
    },
  },

  // --------------------------------------------------------------------------
  // Category 5: Stabilizer & Outriggers (7 parts: 0, 0, 2, 4, 6, 8, 12 stars)
  // --------------------------------------------------------------------------
  {
    id: 'stabilizer_training_wheels',
    name: 'Dual Spring Training Outriggers',
    category: 'stabilizer',
    emoji: '🛟',
    tagline: 'Wide tubular steel outrigger struts with sprung polyurethane contact wheels. (Starter-friendly stability).',
    unlockStars: 0,
    costStars: 0,
    stats: {
      massKg: 4.5,
      dragCoeff: 0.08,
      cadencePowerW: 5,
      lateralStability: 35,
      rollDamping: 18,
      steeringAgility: 4,
      outriggerWidthFt: 2.4,
    },
    description: 'Extends 2.4 feet laterally on both sides of the rear axle. Catches the bike decking if the team tilts beyond 14 degrees.',
    creativityPoints: 8,
    creativityBonus: 8,
    visual: {
      meshType: 'training_wheels',
      meshStyle: 'training_wheels',
      primaryColor: '#3b82f6',
      secondaryColor: '#facc15',
      roughness: 0.45,
      metalness: 0.5,
      badgeEmoji: '🛟',
    },
  },
  {
    id: 'stabilizer_bare',
    name: 'Bare Beam Balance (Pro Zero-Outrigger)',
    category: 'stabilizer',
    emoji: '⚖️',
    tagline: 'Stripped pure two-wheel setup. Zero drag penalty, minimal mass, maximum purist skill challenge!',
    unlockStars: 0,
    costStars: 0,
    stats: {
      massKg: 0.5,
      dragCoeff: 0.01,
      cadencePowerW: 0,
      lateralStability: 2,
      rollDamping: 2,
      steeringAgility: 16,
      outriggerWidthFt: 0.0,
    },
    description: 'No outriggers or training wheels. You rely 100% on Captain steering counter-balance and Stoker pedaling rhythm. True Flugtag daredevil mode!',
    creativityPoints: 30,
    creativityBonus: 30,
    visual: {
      meshType: 'bare_balance',
      meshStyle: 'bare_balance',
      primaryColor: '#64748b',
      secondaryColor: '#94a3b8',
      roughness: 0.5,
      metalness: 0.3,
      badgeEmoji: '⚖️',
    },
  },
  {
    id: 'stabilizer_pool_pontoons',
    name: 'Twin Foam Pool Noodle Floats',
    category: 'stabilizer',
    emoji: '🏄',
    tagline: 'Vibrant neon EVA foam pontoons strapped to bamboo outrigger spars with neon zip-ties.',
    unlockStars: 2,
    costStars: 2,
    stats: {
      massKg: 3.8,
      dragCoeff: 0.12,
      cadencePowerW: 5,
      lateralStability: 45,
      rollDamping: 24,
      steeringAgility: 3,
      outriggerWidthFt: 3.2,
    },
    description: 'Ultra-wide 3.2-foot float span provides extreme roll damping and buoyant splash recovery if a wheel dips into the canal water.',
    creativityPoints: 22,
    creativityBonus: 22,
    visual: {
      meshType: 'pool_pontoons',
      meshStyle: 'pool_pontoons',
      primaryColor: '#06b6d4',
      secondaryColor: '#ec4899',
      roughness: 0.6,
      metalness: 0.1,
      badgeEmoji: '🏄',
    },
  },
  {
    id: 'stabilizer_hydroskis',
    name: 'Active Carbon Hydro-Skis',
    category: 'stabilizer',
    emoji: '🎿',
    tagline: 'Curved carbon fiber planing skis mounted on damped leaf springs that skim along water or beam rails.',
    unlockStars: 4,
    costStars: 4,
    stats: {
      massKg: 2.8,
      dragCoeff: 0.04,
      cadencePowerW: 10,
      lateralStability: 38,
      rollDamping: 16,
      steeringAgility: 8,
      outriggerWidthFt: 2.8,
    },
    description: 'Sleek low-drag hydrofoils generate dynamic righting lift as speed increases, stabilizing the tandem during fast gap landings.',
    creativityPoints: 28,
    creativityBonus: 28,
    visual: {
      meshType: 'carbon_hydroskis',
      meshStyle: 'carbon_hydroskis',
      primaryColor: '#0f172a',
      secondaryColor: '#f97316',
      roughness: 0.3,
      metalness: 0.7,
      badgeEmoji: '🎿',
    },
  },
  {
    id: 'stabilizer_gyro_flywheel',
    name: 'High-RPM Gyroscopic Flywheel',
    category: 'stabilizer',
    emoji: '🔄',
    tagline: 'Sealed counter-rotating brass flywheel housed in the bottom bracket spinning at 8,000 RPM.',
    unlockStars: 6,
    costStars: 6,
    stats: {
      massKg: 5.4,
      dragCoeff: 0.02,
      cadencePowerW: 0,
      lateralStability: 48,
      rollDamping: 28,
      steeringAgility: 6,
      outriggerWidthFt: 0.6,
    },
    description: 'Gyroscopic precession actively resists roll tip-over without needing wide physical outrigger struts. Sleek and narrow profile!',
    creativityPoints: 35,
    creativityBonus: 35,
    visual: {
      meshType: 'gyro_flywheel',
      meshStyle: 'gyro_flywheel',
      primaryColor: '#eab308',
      secondaryColor: '#334155',
      roughness: 0.2,
      metalness: 0.9,
      badgeEmoji: '🔄',
    },
  },
  {
    id: 'stabilizer_counterweight',
    name: 'Centrifugal Pendulum Keel',
    category: 'stabilizer',
    emoji: '⚓',
    tagline: 'Deep lead-bulb sailboat keel swinging beneath the frame centerline for self-righting physics.',
    unlockStars: 8,
    costStars: 8,
    stats: {
      massKg: 7.5,
      dragCoeff: 0.06,
      cadencePowerW: 0,
      lateralStability: 52,
      rollDamping: 26,
      steeringAgility: 4,
      outriggerWidthFt: 1.2,
    },
    description: 'Pendular gravity keel lowers center-of-gravity below the wheel axles. Any lateral tilt creates strong restoring torque!',
    creativityPoints: 42,
    creativityBonus: 42,
    visual: {
      meshType: 'counterweight_keel',
      meshStyle: 'counterweight_keel',
      primaryColor: '#334155',
      secondaryColor: '#f59e0b',
      roughness: 0.3,
      metalness: 0.8,
      badgeEmoji: '⚓',
    },
  },
  {
    id: 'stabilizer_rb_canards',
    name: 'Red Bull Ground-Effect Aero Canards',
    category: 'stabilizer',
    emoji: '🏎️',
    tagline: 'Carbon fiber dynamic vortex generators and ground-effect side outrigger wings.',
    unlockStars: 12,
    costStars: 12,
    stats: {
      massKg: 2.0,
      dragCoeff: 0.025,
      cadencePowerW: 20,
      lateralStability: 55,
      rollDamping: 22,
      steeringAgility: 12,
      outriggerWidthFt: 2.0,
    },
    description: 'Generates lateral ground-effect suction against the wooden pier beam, locking the bike upright at speeds above 12 MPH.',
    creativityPoints: 56,
    creativityBonus: 56,
    visual: {
      meshType: 'rb_aero_canards',
      meshStyle: 'rb_aero_canards',
      primaryColor: '#1e293b',
      secondaryColor: '#ef4444',
      roughness: 0.15,
      metalness: 0.85,
      badgeEmoji: '🏎️',
    },
  },

  // --------------------------------------------------------------------------
  // Category 6: Mascot Toppers & Themed Toppers (7 parts: 0, 0, 2, 4, 6, 8, 12 stars)
  // --------------------------------------------------------------------------
  {
    id: 'topper_shadow',
    name: 'Shadow — Golden Retriever Co-Pilot',
    category: 'topper',
    emoji: '🦮',
    tagline: 'Loyal golden dog with red bandana, floppy ears, panting pink tongue, and wagging tail riding between Captain and Stoker!',
    unlockStars: 0,
    costStars: 0,
    stats: {
      massKg: 12.0,
      dragCoeff: 0.05,
      cadencePowerW: 15,
      lateralStability: 12,
      rollDamping: 6,
      steeringAgility: 4,
      outriggerWidthFt: 0,
    },
    description: 'Beloved Flugtag & Soapbox mascot dog Shadow sits happily on the top tube, shifting his athletic golden weight to keep the tandem balanced on narrow beams. An instant crowd and judge favorite!',
    creativityPoints: 45,
    creativityBonus: 45,
    visual: {
      meshType: 'shadow_dog',
      meshStyle: 'shadow_dog',
      primaryColor: '#f59e0b',
      secondaryColor: '#fef3c7',
      accentColor: '#ef4444',
      roughness: 0.8,
      metalness: 0.05,
      specialFeature: 'tail_wag',
      badgeEmoji: '🦮',
      detailFeatures: ['red_bandana', 'floppy_ears', 'panting_tongue', 'wagging_tail'],
    },
  },
  {
    id: 'topper_boomer',
    name: 'Boomer — Blue Great Dane Mascot',
    category: 'topper',
    emoji: '🐶',
    tagline: 'Regal Harlequin / Blue Great Dane standing tall over the rear deck with gold-studded collar and proud posture!',
    unlockStars: 0,
    costStars: 0,
    stats: {
      massKg: 16.5,
      dragCoeff: 0.07,
      cadencePowerW: 15,
      lateralStability: 15,
      rollDamping: 8,
      steeringAgility: 3,
      outriggerWidthFt: 0,
    },
    description: 'Noble Great Dane co-pilot Boomer stands majestically over the Stoker seat. His tall athletic center of mass provides immense pendular balance authority while capturing the highest showmanship scores!',
    creativityPoints: 48,
    creativityBonus: 48,
    visual: {
      meshType: 'boomer_dog',
      meshStyle: 'boomer_dog',
      primaryColor: '#475569',
      secondaryColor: '#f8fafc',
      accentColor: '#2563eb',
      roughness: 0.8,
      metalness: 0.05,
      specialFeature: 'alert_ears',
      badgeEmoji: '🐶',
      detailFeatures: ['blue_collar_gold_studs', 'tall_ears', 'deep_chest', 'harlequin_markings'],
    },
  },
  {
    id: 'topper_bull_horns',
    name: 'Raging Bull Horns',
    category: 'topper',
    emoji: '🐂',
    tagline: 'Cast gold Red Bull horns with flared nostrils mounted on the Captain head tube.',
    unlockStars: 2,
    costStars: 2,
    stats: {
      massKg: 2.5,
      dragCoeff: 0.04,
      cadencePowerW: 10,
      lateralStability: 8,
      rollDamping: 3,
      steeringAgility: 5,
      outriggerWidthFt: 0,
    },
    description: 'Intimidates every seesaw and obstacle. Bold Red Bull styling adds front-end balance inertia and massive crowd hype.',
    creativityPoints: 25,
    creativityBonus: 25,
    visual: {
      meshType: 'rb_bull_horns',
      meshStyle: 'rb_bull_horns',
      primaryColor: '#eab308',
      secondaryColor: '#dc2626',
      accentColor: '#facc15',
      roughness: 0.3,
      metalness: 0.8,
      badgeEmoji: '🐂',
    },
  },
  {
    id: 'topper_rb_wings',
    name: 'Dual Aerodynamic Red Bull Wings',
    category: 'topper',
    emoji: '🪽',
    tagline: 'Carbon fiber Red Bull wings with curved winglets giving true Flugtag aerodynamic glide!',
    unlockStars: 4,
    costStars: 4,
    stats: {
      massKg: 3.2,
      dragCoeff: 0.02,
      cadencePowerW: 15,
      lateralStability: 14,
      rollDamping: 7,
      steeringAgility: 4,
      outriggerWidthFt: 0,
    },
    description: 'Gives you wings! Generates gentle aerodynamic lift during ramp gap jumps, softening hard landings and extending hang time.',
    creativityPoints: 35,
    creativityBonus: 35,
    visual: {
      meshType: 'rb_aero_wings',
      meshStyle: 'rb_aero_wings',
      primaryColor: '#1d4ed8',
      secondaryColor: '#facc15',
      accentColor: '#ef4444',
      roughness: 0.25,
      metalness: 0.7,
      badgeEmoji: '🪽',
    },
  },
  {
    id: 'topper_aero_fin',
    name: 'Carbon Dolphin Aero Fin',
    category: 'topper',
    emoji: '🦈',
    tagline: 'High-aspect-ratio vertical dorsal fin cutting through air and spray like an aquatic predator.',
    unlockStars: 6,
    costStars: 6,
    stats: {
      massKg: 1.8,
      dragCoeff: 0.015,
      cadencePowerW: 20,
      lateralStability: 12,
      rollDamping: 6,
      steeringAgility: 6,
      outriggerWidthFt: 0,
    },
    description: 'Acts as a directional aerodynamic rudder, automatically stabilizing the tandem bike in high-speed crosswinds over the lake.',
    creativityPoints: 38,
    creativityBonus: 38,
    visual: {
      meshType: 'aero_shark_fin',
      meshStyle: 'aero_shark_fin',
      primaryColor: '#0284c7',
      secondaryColor: '#38bdf8',
      roughness: 0.2,
      metalness: 0.85,
      badgeEmoji: '🦈',
    },
  },
  {
    id: 'topper_golden_bell',
    name: 'Giant Pier Finish Bell',
    category: 'topper',
    emoji: '🔔',
    tagline: 'Polished solid bronze ship bell with crimson clapper mounted proudly on the Stoker arch!',
    unlockStars: 8,
    costStars: 8,
    stats: {
      massKg: 6.5,
      dragCoeff: 0.08,
      cadencePowerW: 10,
      lateralStability: 16,
      rollDamping: 9,
      steeringAgility: 2,
      outriggerWidthFt: 0,
    },
    description: 'The iconic canal finish bell carried right on your bike! Chimes harmonically as you pedal and drives the crowd wild.',
    creativityPoints: 48,
    creativityBonus: 48,
    visual: {
      meshType: 'golden_bell',
      meshStyle: 'golden_bell',
      primaryColor: '#f59e0b',
      secondaryColor: '#b45309',
      accentColor: '#dc2626',
      roughness: 0.2,
      metalness: 0.9,
      badgeEmoji: '🔔',
    },
  },
  {
    id: 'topper_stratos',
    name: 'Red Bull Stratos Supersonic Capsule',
    category: 'topper',
    emoji: '🚀',
    tagline: 'Miniature Stratos space capsule with twin thruster trails and Felix Baumgartner jump visor.',
    unlockStars: 12,
    costStars: 12,
    stats: {
      massKg: 4.0,
      dragCoeff: 0.03,
      cadencePowerW: 25,
      lateralStability: 18,
      rollDamping: 8,
      steeringAgility: 5,
      outriggerWidthFt: 0,
    },
    description: 'The pinnacle showmanship trophy celebrating Red Bull Stratos. Maximum possible creativity score from all 3 judges!',
    creativityPoints: 60,
    creativityBonus: 60,
    visual: {
      meshType: 'rb_stratos_capsule',
      meshStyle: 'rb_stratos_capsule',
      primaryColor: '#f8fafc',
      secondaryColor: '#1e293b',
      accentColor: '#ef4444',
      roughness: 0.2,
      metalness: 0.8,
      badgeEmoji: '🚀',
    },
  },
];

export const TANDEM_PARTS = TANDEM_PART_CATALOG;

// Fast lookup maps
const PART_MAP = new Map<string, TandemPart>(
  TANDEM_PART_CATALOG.map((p) => [p.id, p])
);

export const PARTS_BY_CATEGORY: Record<TandemCategory, TandemPart[]> = {
  frame: TANDEM_PART_CATALOG.filter((p) => p.category === 'frame'),
  drivetrain: TANDEM_PART_CATALOG.filter((p) => p.category === 'drivetrain'),
  wheels: TANDEM_PART_CATALOG.filter((p) => p.category === 'wheels'),
  steering: TANDEM_PART_CATALOG.filter((p) => p.category === 'steering'),
  stabilizer: TANDEM_PART_CATALOG.filter((p) => p.category === 'stabilizer'),
  topper: TANDEM_PART_CATALOG.filter((p) => p.category === 'topper'),
};

// ============================================================================
// 3. FALLBACKS & DEFAULT LOADOUT
// ============================================================================

export const FALLBACK_TANDEM_BY_CATEGORY: Record<TandemCategory, TandemPart> = {
  frame: PART_MAP.get('frame_cruiser')!,
  drivetrain: PART_MAP.get('drivetrain_dual_chain')!,
  wheels: PART_MAP.get('wheels_classic')!,
  steering: PART_MAP.get('steering_twin_cruiser')!,
  stabilizer: PART_MAP.get('stabilizer_training_wheels')!,
  topper: PART_MAP.get('topper_shadow')!,
};

export const FALLBACK_BY_CATEGORY = FALLBACK_TANDEM_BY_CATEGORY;

export const DEFAULT_TANDEM_LOADOUT: TandemLoadout = {
  name: 'Default Tandem',
  frameId: 'frame_cruiser',
  drivetrainId: 'drivetrain_dual_chain',
  wheelsId: 'wheels_classic',
  steeringId: 'steering_twin_cruiser',
  stabilizerId: 'stabilizer_training_wheels',
  topperId: 'topper_shadow',
  paintThemeId: 'redbull_navy',
};

export const DEFAULT_LOADOUT = DEFAULT_TANDEM_LOADOUT;

// ============================================================================
// 4. PRESET BUILDS
// ============================================================================

export const TANDEM_PRESETS: TandemPreset[] = [
  {
    id: 'preset_sync_cruiser',
    name: '🐕 Shadow Sync Cruiser',
    emoji: '🦮',
    tagline: 'Classic cruiser frame with dual training outriggers, dual-chain timing, and Shadow the Golden Retriever on deck! (Maximum Stability)',
    badgeColor: '#3b82f6',
    loadout: {
      name: '🐕 Shadow Sync Cruiser',
      frameId: 'frame_cruiser',
      drivetrainId: 'drivetrain_dual_chain',
      wheelsId: 'wheels_classic',
      steeringId: 'steering_twin_cruiser',
      stabilizerId: 'stabilizer_training_wheels',
      topperId: 'topper_shadow',
      paintThemeId: 'redbull_navy',
    },
  },
  {
    id: 'preset_lake_speedster',
    name: '⚡ Lake Speedster Sprint GT',
    emoji: '⚡',
    tagline: 'Monocoque carbon frame, 21-speed derailleur, deep aero rims, bullhorns, and planing hydro-skis. (Sprint & Gap Jump Specialist)',
    badgeColor: '#06b6d4',
    loadout: {
      name: '⚡ Lake Speedster Sprint GT',
      frameId: 'frame_carbon_aero',
      drivetrainId: 'drivetrain_derailleur_21',
      wheelsId: 'wheels_deep_dish',
      steeringId: 'steering_bullhorn_pursuit',
      stabilizerId: 'stabilizer_hydroskis',
      topperId: 'topper_aero_fin',
      paintThemeId: 'neon_cyber',
    },
  },
  {
    id: 'preset_heavy_hauler',
    name: '🐶 Boomer Heavy Hauler',
    emoji: '🐶',
    tagline: 'Industrial cargo truss, planetary hub, fat float tires, ape hangers, twin pontoons, and Boomer the Great Dane! (Seesaw Momentum)',
    badgeColor: '#f97316',
    loadout: {
      name: '🐶 Boomer Heavy Hauler',
      frameId: 'frame_heavy_cargo',
      drivetrainId: 'drivetrain_planetary_hub',
      wheelsId: 'wheels_fat_floats',
      steeringId: 'steering_ape_hangers',
      stabilizerId: 'stabilizer_pool_pontoons',
      topperId: 'topper_boomer',
      paintThemeId: 'sunset_fire',
    },
  },
  {
    id: 'preset_winged_tandem',
    name: '🏆 Red Bull Winged Tandem',
    emoji: '🪽',
    tagline: 'F1 carbon monocoque, ceramic sprint drive, track slicks, fly-by-wire steering, aero canards, and dual Red Bull wings! (Record Breaker)',
    badgeColor: '#eab308',
    loadout: {
      name: '🏆 Red Bull Winged Tandem',
      frameId: 'frame_rb_spaceframe',
      drivetrainId: 'drivetrain_rb_turbo',
      wheelsId: 'wheels_rb_slicks',
      steeringId: 'steering_rb_dynamic',
      stabilizerId: 'stabilizer_rb_canards',
      topperId: 'topper_rb_wings',
      paintThemeId: 'golden_bull',
    },
  },
];

export const PRESET_TANDEM_BUILDS = TANDEM_PRESETS;
export const PRESET_BUILDS = TANDEM_PRESETS;

// ============================================================================
// 5. PAINT THEMES
// ============================================================================

export const TANDEM_PAINT_THEMES: TandemPaintTheme[] = [
  {
    id: 'redbull_navy',
    name: 'Red Bull Racing Navy & Gold',
    emoji: '🐂',
    description: 'Signature matte navy frame with fiery red front fork and vibrant sun-yellow graphics.',
    primaryHex: '#1e293b',
    secondaryHex: '#ef4444',
    accentHex: '#facc15',
    frameHex: '#1e293b',
    forkHex: '#ef4444',
    rimHex: '#38bdf8',
    decalHex: '#f8fafc',
    badgeColor: '#1d4ed8',
  },
  {
    id: 'neon_cyber',
    name: 'Cyberpunk Synthwave',
    emoji: '⚡',
    description: 'High-voltage electric magenta frame with glowing cyan outriggers and laser violet accents.',
    primaryHex: '#ec4899',
    secondaryHex: '#06b6d4',
    accentHex: '#facc15',
    frameHex: '#ec4899',
    forkHex: '#06b6d4',
    rimHex: '#a855f7',
    decalHex: '#f8fafc',
    badgeColor: '#ec4899',
  },
  {
    id: 'sunset_fire',
    name: 'Flaming Lake Sunset',
    emoji: '🔥',
    description: 'Molten blaze orange frame with blazing crimson fork, marigold rims, and onyx trim.',
    primaryHex: '#ea580c',
    secondaryHex: '#dc2626',
    accentHex: '#fde047',
    frameHex: '#ea580c',
    forkHex: '#dc2626',
    rimHex: '#0f172a',
    decalHex: '#f8fafc',
    badgeColor: '#ea580c',
  },
  {
    id: 'toxic_lime',
    name: 'Venom Track Acid Lime',
    emoji: '🧪',
    description: 'Hyper-saturated acid lime frame with electric emerald fork, onyx trim, and neon green rims.',
    primaryHex: '#84cc16',
    secondaryHex: '#10b981',
    accentHex: '#facc15',
    frameHex: '#84cc16',
    forkHex: '#10b981',
    rimHex: '#0f172a',
    decalHex: '#f8fafc',
    badgeColor: '#65a30d',
  },
  {
    id: 'arctic_glacier',
    name: 'Alpine Glacial Titanium',
    emoji: '❄️',
    description: 'Crisp glacier white and brushed titanium frame with deep sapphire fork and ice cyan spokes.',
    primaryHex: '#f8fafc',
    secondaryHex: '#0284c7',
    accentHex: '#38bdf8',
    frameHex: '#f8fafc',
    forkHex: '#0284c7',
    rimHex: '#1e3a8a',
    decalHex: '#f8fafc',
    badgeColor: '#0284c7',
  },
  {
    id: 'golden_bull',
    name: 'Championship 24K Gold',
    emoji: '🏆',
    description: 'Polished mirror gold frame with carbon black fork, amber yellow rims, and championship accents.',
    primaryHex: '#eab308',
    secondaryHex: '#0f172a',
    accentHex: '#fef08a',
    frameHex: '#eab308',
    forkHex: '#0f172a',
    rimHex: '#d97706',
    decalHex: '#f8fafc',
    badgeColor: '#ca8a04',
  },
];

export const PAINT_THEMES = TANDEM_PAINT_THEMES;

// ============================================================================
// 6. HELPER FUNCTIONS & QUERY APIS
// ============================================================================

export function getAllParts(): TandemPart[] {
  return TANDEM_PART_CATALOG;
}

export function getTandemPartsByCategory(category: TandemCategory): TandemPart[] {
  return PARTS_BY_CATEGORY[category] || [];
}

export const getPartsByCategory = getTandemPartsByCategory;

export function getTandemPartById(
  id: string | null | undefined,
  fallbackCategory: TandemCategory = 'frame'
): TandemPart {
  if (!id || typeof id !== 'string') {
    return FALLBACK_TANDEM_BY_CATEGORY[fallbackCategory];
  }
  const part = PART_MAP.get(id);
  if (part) {
    return part;
  }
  return FALLBACK_TANDEM_BY_CATEGORY[fallbackCategory];
}

export const getPartById = getTandemPartById;

export function getPresetById(id: string): TandemPreset {
  const found = TANDEM_PRESETS.find((p) => p.id === id);
  return found ?? TANDEM_PRESETS[0];
}

export function isPartUnlocked(
  part: TandemPart | { unlockStars?: number; costStars?: number } | null | undefined,
  stars: number
): boolean {
  if (!part) return false;
  const req = part.unlockStars ?? (part as any).costStars ?? 0;
  return stars >= req;
}

export function sanitizeLoadout(raw: any): TandemLoadout {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_TANDEM_LOADOUT };
  }
  return {
    name: typeof raw.name === 'string' ? raw.name : DEFAULT_TANDEM_LOADOUT.name,
    frameId: typeof raw.frameId === 'string' && raw.frameId ? raw.frameId : DEFAULT_TANDEM_LOADOUT.frameId,
    drivetrainId: typeof raw.drivetrainId === 'string' && raw.drivetrainId ? raw.drivetrainId : DEFAULT_TANDEM_LOADOUT.drivetrainId,
    wheelsId: typeof raw.wheelsId === 'string' && raw.wheelsId ? raw.wheelsId : DEFAULT_TANDEM_LOADOUT.wheelsId,
    steeringId: typeof raw.steeringId === 'string' && raw.steeringId ? raw.steeringId : DEFAULT_TANDEM_LOADOUT.steeringId,
    stabilizerId: typeof raw.stabilizerId === 'string' && raw.stabilizerId ? raw.stabilizerId : DEFAULT_TANDEM_LOADOUT.stabilizerId,
    topperId: typeof raw.topperId === 'string' && raw.topperId ? raw.topperId : DEFAULT_TANDEM_LOADOUT.topperId,
    paintThemeId: typeof raw.paintThemeId === 'string' && raw.paintThemeId ? raw.paintThemeId : DEFAULT_TANDEM_LOADOUT.paintThemeId,
  };
}

// ============================================================================
// 7. STATS & DYNO METRICS CALCULATORS
// ============================================================================

export function computeTandemAggregateStats(loadout: any): TandemStats {
  const safeLoadout = sanitizeLoadout(loadout);

  const frame = getTandemPartById(safeLoadout.frameId, 'frame');
  const drivetrain = getTandemPartById(safeLoadout.drivetrainId, 'drivetrain');
  const wheels = getTandemPartById(safeLoadout.wheelsId, 'wheels');
  const steering = getTandemPartById(safeLoadout.steeringId, 'steering');
  const stabilizer = getTandemPartById(safeLoadout.stabilizerId, 'stabilizer');
  const topper = getTandemPartById(safeLoadout.topperId, 'topper');

  const parts = [frame, drivetrain, wheels, steering, stabilizer, topper];

  // Base crew mass: 140 kg (Captain 72kg + Stoker 68kg)
  const partsMass = parts.reduce((sum, p) => sum + (p.stats?.massKg ?? 0), 0);
  const massKg = Number((partsMass + 140).toFixed(2));

  // Aerodynamic drag coefficient Cd
  const rawDrag = parts.reduce((sum, p) => sum + (p.stats?.dragCoeff ?? 0), 0);
  const dragCoeff = Number(Math.max(0.05, Math.min(2.5, rawDrag)).toFixed(3));

  // Cadence Power output in Watts
  const rawPower = parts.reduce((sum, p) => sum + (p.stats?.cadencePowerW ?? 0), 0);
  const cadencePowerW = Math.round(Math.max(120, rawPower));

  // Lateral balance stability
  const rawStability = parts.reduce((sum, p) => sum + (p.stats?.lateralStability ?? 0), 0);
  const lateralStability = Math.round(Math.max(1, rawStability));

  // Roll oscillation damping
  const rawDamping = parts.reduce((sum, p) => sum + (p.stats?.rollDamping ?? 0), 0);
  const rollDamping = Math.round(Math.max(1, rawDamping));

  // Steering agility
  const rawAgility = parts.reduce((sum, p) => sum + (p.stats?.steeringAgility ?? 0), 0);
  const steeringAgility = Math.round(Math.max(1, rawAgility));

  // Outrigger width in feet
  const rawWidth = parts.reduce((sum, p) => sum + (p.stats?.outriggerWidthFt ?? 0), 0);
  const outriggerWidthFt = Number(Math.max(0, rawWidth).toFixed(2));

  return {
    massKg,
    dragCoeff,
    cadencePowerW,
    lateralStability,
    rollDamping,
    steeringAgility,
    outriggerWidthFt,
  };
}

export function computeTandemCreativityBonus(loadout: any): number {
  const safeLoadout = sanitizeLoadout(loadout);

  const frame = getTandemPartById(safeLoadout.frameId, 'frame');
  const drivetrain = getTandemPartById(safeLoadout.drivetrainId, 'drivetrain');
  const wheels = getTandemPartById(safeLoadout.wheelsId, 'wheels');
  const steering = getTandemPartById(safeLoadout.steeringId, 'steering');
  const stabilizer = getTandemPartById(safeLoadout.stabilizerId, 'stabilizer');
  const topper = getTandemPartById(safeLoadout.topperId, 'topper');

  return (
    (frame.creativityBonus ?? frame.creativityPoints ?? 10) +
    (drivetrain.creativityBonus ?? drivetrain.creativityPoints ?? 10) +
    (wheels.creativityBonus ?? wheels.creativityPoints ?? 10) +
    (steering.creativityBonus ?? steering.creativityPoints ?? 10) +
    (stabilizer.creativityBonus ?? stabilizer.creativityPoints ?? 10) +
    (topper.creativityBonus ?? topper.creativityPoints ?? 10)
  );
}

export function computeTandemDynoMetrics(
  input: TandemStats | TandemLoadout | any
): TandemDynoMetrics {
  let stats: TandemStats;
  let loadout: TandemLoadout | undefined;

  if (input && typeof input === 'object' && 'massKg' in input && typeof input.massKg === 'number') {
    stats = input as TandemStats;
  } else {
    loadout = sanitizeLoadout(input);
    stats = computeTandemAggregateStats(loadout);
  }

  const crewMassKg = 140;
  const totalMassKg = stats.massKg;
  const bikeMassKg = Number(Math.max(5, totalMassKg - crewMassKg).toFixed(2));
  const powerToWeightRatioWKg = Number((stats.cadencePowerW / Math.max(1, totalMassKg)).toFixed(2));

  // Critical roll threshold before catastrophic wipeout (degrees: ~18°..42°)
  const rolloverThresholdDeg = Number(
    (18 + Math.min(1.0, stats.lateralStability / 100) * 16 + (Math.min(4.8, stats.outriggerWidthFt) / 4.8) * 8).toFixed(1)
  );

  const stabilityScore = Math.min(100, stats.lateralStability);
  const speedScore = Math.round(
    Math.min(100, Math.max(10, ((stats.cadencePowerW - 200) / 400) * 60 + ((1.0 - stats.dragCoeff) / 0.8) * 40))
  );
  const agilityScore = Math.min(100, stats.steeringAgility);
  const creativityScore = loadout ? computeTandemCreativityBonus(loadout) : 50;

  let dynoStatus: TandemDynoStatus = 'balanced';
  let dynoStatusLabel = 'BALANCED RUNNER';
  let dynoAdvice = 'Solid equilibrium between sprint speed and beam stability. Ready for launch!';

  if (stats.outriggerWidthFt >= 3.0 && stats.lateralStability >= 70) {
    dynoStatus = 'ultra_stable';
    dynoStatusLabel = 'ULTRA-STABLE DOCK';
    dynoAdvice = 'Maximum rollover resistance! Wide pontoons forgive balance errors, but watch beam margins at obstacle gates.';
  } else if (stats.outriggerWidthFt <= 0.5 && stats.steeringAgility >= 60) {
    dynoStatus = 'twitchy';
    dynoStatusLabel = 'TWITCHY SPEEDSTER';
    dynoAdvice = 'Zero outriggers deliver raw sprint speed and lightning agility, but require razor-sharp balance reflexes!';
  } else if (stats.lateralStability < 40 || (loadout && loadout.topperId === 'topper_stratos')) {
    dynoStatus = 'top_heavy';
    dynoStatusLabel = 'TOP-HEAVY WOBBLER';
    dynoAdvice = 'High center of gravity! Equip wider outriggers or stay dead-center on the seesaws!';
  }

  return {
    stats,
    totalMassKg,
    bikeMassKg,
    crewMassKg,
    powerToWeightRatioWKg,
    rolloverThresholdDeg,
    stabilityScore,
    speedScore,
    agilityScore,
    creativityScore,
    dynoStatus,
    dynoStatusLabel,
    dynoAdvice,
  };
}
