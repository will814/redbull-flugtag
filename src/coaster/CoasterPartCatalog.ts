export type CoasterPartCategory =
  | 'chassis'
  | 'bogies'
  | 'restraints'
  | 'nose'
  | 'booster'
  | 'shell';

export interface CoasterCategoryTab {
  id: CoasterPartCategory;
  label: string;
  emoji: string;
  keyHint: string;
}

export const COASTER_CATEGORY_TABS: CoasterCategoryTab[] = [
  { id: 'chassis', label: 'Chassis', emoji: '🎢', keyHint: '1' },
  { id: 'bogies', label: 'Bogies', emoji: '🛞', keyHint: '2' },
  { id: 'restraints', label: 'Harness', emoji: '🔒', keyHint: '3' },
  { id: 'nose', label: 'Nose', emoji: '🦈', keyHint: '4' },
  { id: 'booster', label: 'LIM / Brakes', emoji: '⚡', keyHint: '5' },
  { id: 'shell', label: 'Shell', emoji: '🦮', keyHint: '6' },
];

export interface CoasterPart {
  id: string;
  name: string;
  category: CoasterPartCategory;
  emoji: string;
  primaryColor: string;
  secondaryColor: string;
  description: string;
  funTip: string;
  costStars: number;
  /** Mass in pounds (coaster cars range ~450 to 1,600 lbs total) */
  massLbs: number;
  /** Center of mass height offset in meters relative to rail centerline */
  comOffsetY: number;
  /** Upstop wheel clamping force & negative-G retention (0..45 per part) */
  upstopClamp: number;
  /** Side-friction wheel lateral G grip in banked helixes (0..45 per part) */
  lateralGrip: number;
  /** Rolling efficiency / aerodynamic top speed contribution (0..45 per part) */
  rollingSpeed: number;
  /** LIM launch & mid-course kinetic boost impulse (0..45 per part) */
  launchBoost: number;
  /** Active roll / tilt gyro stabilization authority (0..40 per part) */
  gyroStability: number;
  /** Eddy-current magnetic braking authority for hill trims & Station Bullseye stop (0..50 per part) */
  magnetBrakePower: number;
  /** Passenger restraint G-force safety & headbanging protection (0..45 per part) */
  restraintSafety: number;
  /** Structural bogie & frame toughness against high-G stress (0..45 per part) */
  toughness: number;
  /** Showmanship & crowd thrill multiplier (5..35) */
  thrillBonus: number;
}

export interface CoasterLoadout {
  chassis: string;
  bogies: string;
  restraints: string;
  nose: string;
  booster: string;
  shell: string;
  paintId: string;
}

export interface CoasterPaintTheme {
  id: string;
  name: string;
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
  railTintHex: string;
}

export const COASTER_PAINT_THEMES: CoasterPaintTheme[] = [
  {
    id: 'rb_hyper',
    name: 'Red Bull Hyper Navy & Crimson',
    primaryHex: '#1d4ed8',
    secondaryHex: '#dc2626',
    accentHex: '#facc15',
    railTintHex: '#ef4444',
  },
  {
    id: 'intamin_gold',
    name: 'Millennium Solar Gold',
    primaryHex: '#eab308',
    secondaryHex: '#0f172a',
    accentHex: '#38bdf8',
    railTintHex: '#f59e0b',
  },
  {
    id: 'neon_cyber',
    name: 'Cyberpunk LIM Magenta & Cyan',
    primaryHex: '#ec4899',
    secondaryHex: '#06b6d4',
    accentHex: '#a855f7',
    railTintHex: '#22d3ee',
  },
  {
    id: 'venom_viper',
    name: 'Steel Viper Emerald & Onyx',
    primaryHex: '#16a34a',
    secondaryHex: '#111827',
    accentHex: '#a3e635',
    railTintHex: '#22c55e',
  },
  {
    id: 'mine_copper',
    name: 'Runaway Copper & Rust',
    primaryHex: '#b45309',
    secondaryHex: '#451a03',
    accentHex: '#fbbf24',
    railTintHex: '#f97316',
  },
  {
    id: 'arctic_launch',
    name: 'Cryo Titanium & Ice',
    primaryHex: '#f8fafc',
    secondaryHex: '#0284c7',
    accentHex: '#38bdf8',
    railTintHex: '#0ea5e9',
  },
];

export const COASTER_PARTS: CoasterPart[] = [
  // ============================================================================
  // 1. CHASSIS (Coaster Car Chassis & Train Frames)
  // ============================================================================
  {
    id: 'cc_chassis_hyper',
    name: 'Hyper-Coaster Tubular Steel Car',
    category: 'chassis',
    emoji: '🎢',
    primaryColor: '#2563eb',
    secondaryColor: '#facc15',
    description:
      'CNC-bent chromoly steel stadium-seating coaster car with low floor pan and balanced bogie wheelbase.',
    funTip: 'Gold-standard hyper-coaster frame — handles vertical loops and camelbacks with poised balance.',
    costStars: 0,
    massLbs: 380,
    comOffsetY: 0.24,
    upstopClamp: 28,
    lateralGrip: 28,
    rollingSpeed: 30,
    launchBoost: 16,
    gyroStability: 18,
    magnetBrakePower: 18,
    restraintSafety: 26,
    toughness: 32,
    thrillBonus: 18,
  },
  {
    id: 'cc_chassis_minecart',
    name: 'Runaway Timber Minecart',
    category: 'chassis',
    emoji: '⛏️',
    primaryColor: '#92400e',
    secondaryColor: '#475569',
    description:
      'Riveted iron-strapped oak ore cart from an abandoned gold mine. Tall, boxy, and wildly dramatic over airtime hills!',
    funTip: 'High center of gravity makes banked helixes extra intense — lean hard into the turns!',
    costStars: 0,
    massLbs: 440,
    comOffsetY: 0.42,
    upstopClamp: 20,
    lateralGrip: 19,
    rollingSpeed: 24,
    launchBoost: 12,
    gyroStability: 10,
    magnetBrakePower: 14,
    restraintSafety: 20,
    toughness: 28,
    thrillBonus: 26,
  },
  {
    id: 'cc_chassis_bobsled',
    name: 'Carbon Alpine Bobsled Pod',
    category: 'chassis',
    emoji: '🛷',
    primaryColor: '#0284c7',
    secondaryColor: '#f8fafc',
    description:
      'Ultra-light monocoque carbon-Kevlar coaster pod with a razor-low floor that hugs the center spine tube.',
    funTip: 'Featherweight mass rockets out of the LIM launch track and carves the S-curve chicane effortlessly!',
    costStars: 1,
    massLbs: 285,
    comOffsetY: 0.16,
    upstopClamp: 26,
    lateralGrip: 33,
    rollingSpeed: 36,
    launchBoost: 24,
    gyroStability: 22,
    magnetBrakePower: 22,
    restraintSafety: 24,
    toughness: 25,
    thrillBonus: 22,
  },
  {
    id: 'cc_chassis_wing',
    name: 'Wide Wing-Coaster Outrigger Frame',
    category: 'chassis',
    emoji: '🦅',
    primaryColor: '#dc2626',
    secondaryColor: '#1e293b',
    description:
      'Cantilevered wing-coaster crossbeam that suspends riders & stability pods out beside the track rails.',
    funTip: 'Wide outrigger moment of inertia gives huge roll stability during the 32-ft Broken Rail Gap Jump!',
    costStars: 2,
    massLbs: 490,
    comOffsetY: 0.19,
    upstopClamp: 34,
    lateralGrip: 35,
    rollingSpeed: 28,
    launchBoost: 18,
    gyroStability: 30,
    magnetBrakePower: 20,
    restraintSafety: 30,
    toughness: 36,
    thrillBonus: 30,
  },
  {
    id: 'cc_chassis_loco',
    name: '2-Ton Steam Express Locomotive Car',
    category: 'chassis',
    emoji: '🚂',
    primaryColor: '#111827',
    secondaryColor: '#dc2626',
    description:
      'Cast-iron boiler locomotive lead car with brass steam dome and smokestack. Unstoppable downhill momentum!',
    funTip: 'Massive momentum crushes the 75-ft Vertical Loop, but you will need strong Magnet Brakes to stop in the Bullseye!',
    costStars: 2,
    massLbs: 680,
    comOffsetY: 0.34,
    upstopClamp: 32,
    lateralGrip: 24,
    rollingSpeed: 38,
    launchBoost: 10,
    gyroStability: 14,
    magnetBrakePower: 10,
    restraintSafety: 28,
    toughness: 42,
    thrillBonus: 28,
  },

  // ============================================================================
  // 2. BOGIES (Wheel Bogie Assemblies — Road, Side-Friction & Upstop Wheels)
  // ============================================================================
  {
    id: 'cc_bogie_steel',
    name: 'Classic Flanged Steel Bogies',
    category: 'bogies',
    emoji: '🛞',
    primaryColor: '#64748b',
    secondaryColor: '#cbd5e1',
    description:
      'Heavy-duty forged steel road wheels with basic under-rail upstop rollers and side-friction guide wheels.',
    funTip: 'Loud metallic coaster roar and solid durability, with moderate negative-G upstop clamp.',
    costStars: 0,
    massLbs: 150,
    comOffsetY: -0.14,
    upstopClamp: 24,
    lateralGrip: 24,
    rollingSpeed: 24,
    launchBoost: 0,
    gyroStability: 8,
    magnetBrakePower: 6,
    restraintSafety: 10,
    toughness: 32,
    thrillBonus: 14,
  },
  {
    id: 'cc_bogie_urethane',
    name: 'Pro Urethane Tri-Bogie Cluster',
    category: 'bogies',
    emoji: '🔵',
    primaryColor: '#0ea5e9',
    secondaryColor: '#facc15',
    description:
      'Spring-loaded 6-wheel-per-bogie polyurethane cluster wrapping Top Road, Side-Friction & Twin Bottom Upstop wheels tight around the tubular rail.',
    funTip: 'Maximum negative-G Upstop Clamp! Keeps your car locked onto the rails over violent Ejector Airtime hills!',
    costStars: 0,
    massLbs: 135,
    comOffsetY: -0.18,
    upstopClamp: 42,
    lateralGrip: 34,
    rollingSpeed: 32,
    launchBoost: 4,
    gyroStability: 14,
    magnetBrakePower: 10,
    restraintSafety: 16,
    toughness: 36,
    thrillBonus: 18,
  },
  {
    id: 'cc_bogie_gimbal',
    name: 'Zero-Car Pivoting Gimbal Bogies',
    category: 'bogies',
    emoji: '🧭',
    primaryColor: '#f59e0b',
    secondaryColor: '#1e293b',
    description:
      'Spherical multi-axis articulating bogie yokes that pivot smoothly through tight twisted transitions and helixes.',
    funTip: 'Absorbs huge lateral G-forces in the Banked Helix and Whip S-Curve Chicane without binding!',
    costStars: 1,
    massLbs: 145,
    comOffsetY: -0.16,
    upstopClamp: 34,
    lateralGrip: 44,
    rollingSpeed: 30,
    launchBoost: 2,
    gyroStability: 22,
    magnetBrakePower: 8,
    restraintSafety: 18,
    toughness: 38,
    thrillBonus: 20,
  },
  {
    id: 'cc_bogie_caster',
    name: 'Sketchy Backyard Caster Rollers',
    category: 'bogies',
    emoji: '🛒',
    primaryColor: '#ef4444',
    secondaryColor: '#94a3b8',
    description:
      'Hardware-store shopping-cart casters welded onto brackets with tiny gap-prone upstop hooks. Insanely fast and terrifying!',
    funTip: 'WARNING: Loose upstop clamp! Trim your speed with Magnet Brakes before the Camelback Airtime Hills or you will launch into orbit!',
    costStars: 1,
    massLbs: 75,
    comOffsetY: -0.08,
    upstopClamp: 11,
    lateralGrip: 13,
    rollingSpeed: 35,
    launchBoost: 8,
    gyroStability: 4,
    magnetBrakePower: 2,
    restraintSafety: 5,
    toughness: 14,
    thrillBonus: 34,
  },
  {
    id: 'cc_bogie_ceramic',
    name: 'Ceramic Mag-Bearing Speed Bogies',
    category: 'bogies',
    emoji: '⚡',
    primaryColor: '#a855f7',
    secondaryColor: '#38bdf8',
    description:
      'Silicon-nitride ceramic hybrid bearings inside aero carbon wheel shrouds with dual hydraulic upstop preload rams.',
    funTip: 'Blistering top speed through the 75-ft Vertical Loop while keeping strong negative-G upstop retention!',
    costStars: 2,
    massLbs: 120,
    comOffsetY: -0.17,
    upstopClamp: 37,
    lateralGrip: 32,
    rollingSpeed: 44,
    launchBoost: 10,
    gyroStability: 16,
    magnetBrakePower: 8,
    restraintSafety: 15,
    toughness: 33,
    thrillBonus: 24,
  },

  // ============================================================================
  // 3. RESTRAINTS (Passenger Harnesses & Lap Bars)
  // ============================================================================
  {
    id: 'cc_rest_buzzbar',
    name: 'Vintage Single-Position Buzz Bar',
    category: 'restraints',
    emoji: '🪵',
    primaryColor: '#f59e0b',
    secondaryColor: '#78350f',
    description:
      'Classic 1950s chrome lap bar that locks six inches above your thighs. Standing-up ejector airtime on every hill!',
    funTip: 'Huge Airtime Thrill bonus, but low negative-G passenger hold — watch your speed cresting the Camelbacks!',
    costStars: 0,
    massLbs: 35,
    comOffsetY: 0.04,
    upstopClamp: 8,
    lateralGrip: 8,
    rollingSpeed: 4,
    launchBoost: 0,
    gyroStability: 4,
    magnetBrakePower: 0,
    restraintSafety: 14,
    toughness: 14,
    thrillBonus: 32,
  },
  {
    id: 'cc_rest_tbar',
    name: 'Clamshell Hydraulic T-Bar',
    category: 'restraints',
    emoji: '🔒',
    primaryColor: '#38bdf8',
    secondaryColor: '#0f172a',
    description:
      'Anatomical dual-cylinder hydraulic lap bar that contours snugly around the waist while leaving the upper body free.',
    funTip: 'Great blend of upper-body freedom for leaning in turns and rock-solid negative-G airtime retention!',
    costStars: 0,
    massLbs: 55,
    comOffsetY: 0.05,
    upstopClamp: 22,
    lateralGrip: 18,
    rollingSpeed: 4,
    launchBoost: 0,
    gyroStability: 12,
    magnetBrakePower: 0,
    restraintSafety: 30,
    toughness: 24,
    thrillBonus: 22,
  },
  {
    id: 'cc_rest_ots',
    name: 'Over-The-Shoulder (OTS) Loop Harness',
    category: 'restraints',
    emoji: '🦺',
    primaryColor: '#ef4444',
    secondaryColor: '#facc15',
    description:
      'Padded horse-collar inversion harness with dual ratchet pawls and lateral head bolsters for high-G vertical loops.',
    funTip: 'Built for +5G loops and aggressive lateral helixes — dramatically reduces G-stress penalties!',
    costStars: 1,
    massLbs: 80,
    comOffsetY: 0.08,
    upstopClamp: 28,
    lateralGrip: 26,
    rollingSpeed: 2,
    launchBoost: 0,
    gyroStability: 14,
    magnetBrakePower: 0,
    restraintSafety: 40,
    toughness: 30,
    thrillBonus: 18,
  },
  {
    id: 'cc_rest_cage',
    name: 'Full-Body 6-Point Titanium Roll Cage',
    category: 'restraints',
    emoji: '🛡️',
    primaryColor: '#eab308',
    secondaryColor: '#1e293b',
    description:
      'Stunt-spec welded titanium overhead canopy cage with 6-point racing belts and shock-absorbing seat struts.',
    funTip: 'Ultimate structural & passenger protection — keeps riders locked in through extreme negative Gs and hard gap-jump landings!',
    costStars: 2,
    massLbs: 105,
    comOffsetY: 0.11,
    upstopClamp: 32,
    lateralGrip: 30,
    rollingSpeed: 2,
    launchBoost: 0,
    gyroStability: 18,
    magnetBrakePower: 0,
    restraintSafety: 45,
    toughness: 42,
    thrillBonus: 24,
  },

  // ============================================================================
  // 4. NOSE (Aero Nose Cones & Front Fairings)
  // ============================================================================
  {
    id: 'cc_nose_bullet',
    name: 'Bullet Launch Nose Cone',
    category: 'nose',
    emoji: '🚀',
    primaryColor: '#2563eb',
    secondaryColor: '#f8fafc',
    description:
      'Wind-tunnel sculpted parabolic nose fairing with integrated pitot speed tube that slices through headwinds at 85+ MPH.',
    funTip: 'Cuts aerodynamic drag so you carry plenty of speed through the 75-ft Vertical Loop and 32-ft Rail Gap!',
    costStars: 0,
    massLbs: 40,
    comOffsetY: -0.02,
    upstopClamp: 10,
    lateralGrip: 10,
    rollingSpeed: 24,
    launchBoost: 8,
    gyroStability: 8,
    magnetBrakePower: 4,
    restraintSafety: 6,
    toughness: 16,
    thrillBonus: 16,
  },
  {
    id: 'cc_nose_shark',
    name: 'Great White Coaster Shark Jaws',
    category: 'nose',
    emoji: '🦈',
    primaryColor: '#0284c7',
    secondaryColor: '#ffffff',
    description:
      'Ferocious sculpted Great White Shark snout with rows of 3D razor teeth, gills, and side pectoral canard fins!',
    funTip: 'Side pectoral fins generate aerodynamic downforce & huge bonus points in the Lagoon Water-Splash Skim!',
    costStars: 1,
    massLbs: 52,
    comOffsetY: 0.0,
    upstopClamp: 16,
    lateralGrip: 16,
    rollingSpeed: 20,
    launchBoost: 6,
    gyroStability: 12,
    magnetBrakePower: 6,
    restraintSafety: 8,
    toughness: 20,
    thrillBonus: 28,
  },
  {
    id: 'cc_nose_cowcatcher',
    name: 'Cast-Iron Locomotive Cowcatcher',
    category: 'nose',
    emoji: '🛤️',
    primaryColor: '#1e293b',
    secondaryColor: '#f59e0b',
    description:
      'Heavy-duty wedge-grilled iron locomotive pilot with a blazing brass headlamp and front downforce spoiler lip.',
    funTip: 'Forward nose weight & wedge spoiler push the front bogie down onto the rails over negative-G Camelback hills!',
    costStars: 1,
    massLbs: 95,
    comOffsetY: -0.1,
    upstopClamp: 26,
    lateralGrip: 14,
    rollingSpeed: 14,
    launchBoost: 2,
    gyroStability: 14,
    magnetBrakePower: 8,
    restraintSafety: 12,
    toughness: 30,
    thrillBonus: 22,
  },
  {
    id: 'cc_nose_cyber',
    name: 'Cyber Neon Splitter & Strobe Array',
    category: 'nose',
    emoji: '💫',
    primaryColor: '#06b6d4',
    secondaryColor: '#ec4899',
    description:
      'Active ground-effect carbon front splitter with dual vortex strakes and high-intensity LED launch strobes.',
    funTip: 'Combines high aero speed with active front downforce and magnetic field alignment on the LIM launch track!',
    costStars: 2,
    massLbs: 48,
    comOffsetY: -0.06,
    upstopClamp: 22,
    lateralGrip: 20,
    rollingSpeed: 26,
    launchBoost: 12,
    gyroStability: 16,
    magnetBrakePower: 8,
    restraintSafety: 10,
    toughness: 22,
    thrillBonus: 26,
  },

  // ============================================================================
  // 5. BOOSTER (Kinetic Boosters, Active Gyros & Eddy-Current Magnet Brakes)
  // ============================================================================
  {
    id: 'cc_boost_lim',
    name: 'Copper LIM Induction Boost Fins',
    category: 'booster',
    emoji: '⚡',
    primaryColor: '#d97706',
    secondaryColor: '#38bdf8',
    description:
      'Twin oxygen-free copper Linear Induction Motor (LIM) reaction blades mounted beneath the chassis spine.',
    funTip: 'Delivers a massive electromagnetic surge on the Station Launch Track plus balanced eddy-current braking!',
    costStars: 0,
    massLbs: 65,
    comOffsetY: -0.12,
    upstopClamp: 12,
    lateralGrip: 10,
    rollingSpeed: 18,
    launchBoost: 36,
    gyroStability: 10,
    magnetBrakePower: 26,
    restraintSafety: 8,
    toughness: 22,
    thrillBonus: 20,
  },
  {
    id: 'cc_boost_flywheel',
    name: 'Spinning Flywheel KERS Accumulator',
    category: 'booster',
    emoji: '⚙️',
    primaryColor: '#facc15',
    secondaryColor: '#0f172a',
    description:
      'High-RPM brass kinetic flywheel drum that stores energy on drops and discharges a mid-course torque surge on command!',
    funTip: 'Tap BOOST before the Vertical Loop or Broken Rail Gap Jump to discharge stored flywheel KERS power!',
    costStars: 1,
    massLbs: 85,
    comOffsetY: -0.05,
    upstopClamp: 14,
    lateralGrip: 14,
    rollingSpeed: 22,
    launchBoost: 32,
    gyroStability: 22,
    magnetBrakePower: 22,
    restraintSafety: 10,
    toughness: 26,
    thrillBonus: 22,
  },
  {
    id: 'cc_boost_gyro',
    name: 'Active Tilt-Stabilizer Gyroscope',
    category: 'booster',
    emoji: '🧭',
    primaryColor: '#10b981',
    secondaryColor: '#0f172a',
    description:
      'Twin counter-rotating gimbaled brass gyroscopes that actively lean into banked turns and hold the car level in mid-air!',
    funTip: 'Automatically damps lateral G-forces in the Helix and keeps your roll angle steady across the 32-ft Rail Gap Jump!',
    costStars: 1,
    massLbs: 78,
    comOffsetY: -0.08,
    upstopClamp: 18,
    lateralGrip: 30,
    rollingSpeed: 14,
    launchBoost: 18,
    gyroStability: 40,
    magnetBrakePower: 24,
    restraintSafety: 18,
    toughness: 28,
    thrillBonus: 20,
  },
  {
    id: 'cc_boost_magnet',
    name: 'Dual Neodymium Eddy-Current Brake Fins',
    category: 'booster',
    emoji: '🧲',
    primaryColor: '#ef4444',
    secondaryColor: '#e2e8f0',
    description:
      'High-flux Halbach neodymium permanent-magnet caliper arrays with copper heat-sink fins for frictionless eddy-current braking.',
    funTip: 'Unmatched stopping precision! Feather the brakes before airtime hills and park dead-center in the Golden Station Bullseye!',
    costStars: 1,
    massLbs: 72,
    comOffsetY: -0.14,
    upstopClamp: 22,
    lateralGrip: 16,
    rollingSpeed: 14,
    launchBoost: 20,
    gyroStability: 16,
    magnetBrakePower: 48,
    restraintSafety: 16,
    toughness: 30,
    thrillBonus: 18,
  },
  {
    id: 'cc_boost_rocket',
    name: 'Twin Cold-Gas Stunt Thrusters',
    category: 'booster',
    emoji: '🔥',
    primaryColor: '#f97316',
    secondaryColor: '#dc2626',
    description:
      'Dual high-pressure nitrogen & afterburner thruster nozzles bolted to the rear deck for explosive mid-course acceleration!',
    funTip: 'Insane launch and gap-jump speed — just make sure you brake early on the final run so you do not blow past the station!',
    costStars: 2,
    massLbs: 60,
    comOffsetY: 0.04,
    upstopClamp: 8,
    lateralGrip: 8,
    rollingSpeed: 28,
    launchBoost: 45,
    gyroStability: 8,
    magnetBrakePower: 14,
    restraintSafety: 6,
    toughness: 18,
    thrillBonus: 32,
  },

  // ============================================================================
  // 6. SHELL (Themed Coaster Car Shells & Toppers)
  // ============================================================================
  {
    id: 'cc_shell_rbpod',
    name: 'Red Bull Hyper-Pod Shell',
    category: 'shell',
    emoji: '🐂',
    primaryColor: '#2563eb',
    secondaryColor: '#dc2626',
    description:
      'Sleek Red Bull Racing composite coaster cowl with silver energy-can side pods and rear downforce winglet.',
    funTip: 'Clean aerodynamic profile with extra downforce over high-speed camelback hills.',
    costStars: 0,
    massLbs: 35,
    comOffsetY: 0.04,
    upstopClamp: 10,
    lateralGrip: 10,
    rollingSpeed: 12,
    launchBoost: 6,
    gyroStability: 8,
    magnetBrakePower: 4,
    restraintSafety: 8,
    toughness: 12,
    thrillBonus: 20,
  },
  {
    id: 'cc_shell_tnt',
    name: 'Gold Rush TNT Mine Shell',
    category: 'shell',
    emoji: '🧨',
    primaryColor: '#dc2626',
    secondaryColor: '#facc15',
    description:
      'Crate of red TNT dynamite sticks, T-handle blaster plunger, and glittering gold ore nuggets strapped behind the seats!',
    funTip: 'Crowd-pleasing western runaway train theme with explosive showmanship points!',
    costStars: 0,
    massLbs: 48,
    comOffsetY: 0.12,
    upstopClamp: 6,
    lateralGrip: 6,
    rollingSpeed: 8,
    launchBoost: 10,
    gyroStability: 6,
    magnetBrakePower: 4,
    restraintSafety: 6,
    toughness: 10,
    thrillBonus: 28,
  },
  {
    id: 'cc_shell_shadow',
    name: 'Shadow — Golden Retriever Co-Pilot',
    category: 'shell',
    emoji: '🦮',
    primaryColor: '#f59e0b',
    secondaryColor: '#ef4444',
    description:
      'Shadow the Golden Retriever wearing coaster goggles and a red bandana, leaning into every banked curve with ears flying!',
    funTip: 'Shadow instinctively leans into helixes (+Gyro Stability) and wins maximum adoration from the theme-park crowd!',
    costStars: 0,
    massLbs: 42,
    comOffsetY: 0.08,
    upstopClamp: 12,
    lateralGrip: 14,
    rollingSpeed: 10,
    launchBoost: 6,
    gyroStability: 14,
    magnetBrakePower: 6,
    restraintSafety: 10,
    toughness: 12,
    thrillBonus: 35,
  },
  {
    id: 'cc_shell_boomer',
    name: 'Boomer — Blue Great Dane Co-Pilot',
    category: 'shell',
    emoji: '🐕',
    primaryColor: '#f8fafc',
    secondaryColor: '#1e293b',
    description:
      'Boomer the noble Harlequin Great Dane standing tall on the rear deck with his gold-studded blue collar and wagging tail!',
    funTip: 'Boomer shifts his athletic weight across the 32-ft Rail Gap Jump and boosts your Thrill & Style score sky-high!',
    costStars: 0,
    massLbs: 54,
    comOffsetY: 0.11,
    upstopClamp: 12,
    lateralGrip: 14,
    rollingSpeed: 11,
    launchBoost: 8,
    gyroStability: 13,
    magnetBrakePower: 6,
    restraintSafety: 10,
    toughness: 14,
    thrillBonus: 35,
  },
  {
    id: 'cc_shell_trex',
    name: 'Roaring Coaster T-Rex',
    category: 'shell',
    emoji: '🦖',
    primaryColor: '#16a34a',
    secondaryColor: '#eab308',
    description:
      'Jurassic green T-Rex towering over the coaster car with snapping jaws, sharp white teeth, and golden dorsal spikes!',
    funTip: 'Massive theme-park spectacle bonus, though his tall head raises your center of gravity in banked turns!',
    costStars: 1,
    massLbs: 65,
    comOffsetY: 0.22,
    upstopClamp: 6,
    lateralGrip: 6,
    rollingSpeed: 8,
    launchBoost: 6,
    gyroStability: 4,
    magnetBrakePower: 4,
    restraintSafety: 6,
    toughness: 14,
    thrillBonus: 34,
  },
  {
    id: 'cc_shell_taco',
    name: 'Giant Crunchy Taco Shell',
    category: 'shell',
    emoji: '🌮',
    primaryColor: '#facc15',
    secondaryColor: '#22c55e',
    description:
      'Crispy golden corn tortilla shell arches around the riders, loaded with beef, lettuce, diced tomatoes, cheddar & guac!',
    funTip: 'Surprisingly aerodynamic U-shell cross-section and an instant crowd favorite on the Coaster Cam!',
    costStars: 1,
    massLbs: 44,
    comOffsetY: 0.1,
    upstopClamp: 8,
    lateralGrip: 10,
    rollingSpeed: 10,
    launchBoost: 6,
    gyroStability: 8,
    magnetBrakePower: 4,
    restraintSafety: 8,
    toughness: 10,
    thrillBonus: 32,
  },
  {
    id: 'cc_shell_couch',
    name: 'Living Room Couch Coaster',
    category: 'shell',
    emoji: '🛋️',
    primaryColor: '#ea580c',
    secondaryColor: '#facc15',
    description:
      'Plush tufted orange living-room sofa with rolled armrests and throw pillows bolted directly onto the coaster chassis!',
    funTip: 'Ultra-comfy cushions absorb high positive Gs at the bottom of the 75-ft Vertical Loop!',
    costStars: 2,
    massLbs: 70,
    comOffsetY: 0.14,
    upstopClamp: 8,
    lateralGrip: 8,
    rollingSpeed: 6,
    launchBoost: 4,
    gyroStability: 8,
    magnetBrakePower: 6,
    restraintSafety: 14,
    toughness: 14,
    thrillBonus: 33,
  },
];

export const DEFAULT_COASTER_LOADOUT: CoasterLoadout = {
  chassis: 'cc_chassis_hyper',
  bogies: 'cc_bogie_urethane',
  restraints: 'cc_rest_tbar',
  nose: 'cc_nose_bullet',
  booster: 'cc_boost_lim',
  shell: 'cc_shell_shadow',
  paintId: 'rb_hyper',
};

export interface CoasterPreset {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  badgeColor: string;
  loadout: CoasterLoadout;
}

export const COASTER_PRESETS: CoasterPreset[] = [
  {
    id: 'preset_millennium_shadow',
    name: 'Shadow Hyper-Force 300',
    emoji: '🦮',
    tagline: 'Pro Urethane Bogies + LIM Induction + Shadow Co-Pilot (Balanced All-Rounder)',
    badgeColor: '#2563eb',
    loadout: {
      chassis: 'cc_chassis_hyper',
      bogies: 'cc_bogie_urethane',
      restraints: 'cc_rest_tbar',
      nose: 'cc_nose_bullet',
      booster: 'cc_boost_lim',
      shell: 'cc_shell_shadow',
      paintId: 'rb_hyper',
    },
  },
  {
    id: 'preset_bullseye_sniper',
    name: 'Boomer Wing-Gyro Sniper',
    emoji: '🎯',
    tagline: 'Wing Outrigger + Gimbal Bogies + Neodymium Magnet Brakes (Helix & Bullseye Master)',
    badgeColor: '#10b981',
    loadout: {
      chassis: 'cc_chassis_wing',
      bogies: 'cc_bogie_gimbal',
      restraints: 'cc_rest_ots',
      nose: 'cc_nose_cyber',
      booster: 'cc_boost_magnet',
      shell: 'cc_shell_boomer',
      paintId: 'neon_cyber',
    },
  },
  {
    id: 'preset_runaway_tnt',
    name: 'Gold Rush Runaway Express',
    emoji: '🧨',
    tagline: 'Timber Minecart + Backyard Casters + Cold-Gas Thrusters (High-Risk Airtime Chaos!)',
    badgeColor: '#f59e0b',
    loadout: {
      chassis: 'cc_chassis_minecart',
      bogies: 'cc_bogie_caster',
      restraints: 'cc_rest_buzzbar',
      nose: 'cc_nose_cowcatcher',
      booster: 'cc_boost_rocket',
      shell: 'cc_shell_tnt',
      paintId: 'mine_copper',
    },
  },
  {
    id: 'preset_apex_predator',
    name: 'Apex Shark Bobsled GT',
    emoji: '🦈',
    tagline: 'Carbon Bobsled Pod + Ceramic Speed Bogies + Active Gyro (Lagoon Skim & Loop Speedster)',
    badgeColor: '#06b6d4',
    loadout: {
      chassis: 'cc_chassis_bobsled',
      bogies: 'cc_bogie_ceramic',
      restraints: 'cc_rest_cage',
      nose: 'cc_nose_shark',
      booster: 'cc_boost_gyro',
      shell: 'cc_shell_rbpod',
      paintId: 'arctic_launch',
    },
  },
];

const PART_MAP = new Map<string, CoasterPart>(COASTER_PARTS.map((p) => [p.id, p]));

export function getCoasterPartById(id: string): CoasterPart {
  return PART_MAP.get(id) ?? COASTER_PARTS[0];
}

export function getCoasterPartsByCategory(category: CoasterPartCategory): CoasterPart[] {
  return COASTER_PARTS.filter((p) => p.category === category);
}

export function getCoasterPaintTheme(paintId: string): CoasterPaintTheme {
  return COASTER_PAINT_THEMES.find((t) => t.id === paintId) ?? COASTER_PAINT_THEMES[0];
}
