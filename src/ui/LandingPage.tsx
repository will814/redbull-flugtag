import React, { useEffect } from 'react';
import { Volume2, VolumeX, Trophy, Sparkles, Play, Flame, Compass, Wrench, Gauge } from 'lucide-react';

export type GameModeId = 'landing' | 'flugtag' | 'soapbox' | 'coaster' | 'tandem';

export interface LandingPageProps {
  onSelectGame: (game: 'flugtag' | 'soapbox' | 'coaster' | 'tandem') => void;
  totalStars: number;
  flugtagBestDist: number;
  soapboxBestDist: number;
  soapboxBestTime: number | null;
  coasterBestDist: number;
  coasterBestThrill: number;
  tandemBestDist?: number;
  tandemBestTime?: number | null;
  muted: boolean;
  onToggleMute: () => void;
}

interface GameCardDefinition {
  id: 'flugtag' | 'soapbox' | 'coaster' | 'tandem';
  keyHint: string;
  badge: string;
  emoji: string;
  secondaryEmojis: string[];
  title: string;
  subtitle: string;
  tagline: string;
  launchPlatform: string;
  testRig: string;
  vehicleComponents: string[];
  obstacles: string[];
  ctaLabel: string;
  accentBorder: string;
  headerGradient: string;
  ctaGradient: string;
  pillBg: string;
}

const GAME_CARDS: GameCardDefinition[] = [
  {
    id: 'flugtag',
    keyHint: '1',
    badge: 'EVENT 01 • AERODYNAMIC FLIGHT',
    emoji: '✈️',
    secondaryEmojis: ['🐂', '🪂', '🌊'],
    title: 'Red Bull Flugtag',
    subtitle: 'Miami Bay 30-Ft Pier Flight',
    tagline:
      'Snap together wild homemade gliders in the Workshop, test your Center of Gravity & Lift in the Wind Tunnel, and launch off the 30-foot flight deck over Miami Bay!',
    launchPlatform: '30-Ft Flight Deck Pier over Miami Bay',
    testRig: 'Wind Tunnel & CoG/CoL Balance Gizmos',
    vehicleComponents: ['Hull', 'Wings', 'Tail', 'Nose', 'Topper', 'Trolley'],
    obstacles: [
      'Updraft Thermal Rings',
      'Stall & Pitch Recovery',
      '400 lb Weight Rule',
      '258 ft World Record Buoys',
    ],
    ctaLabel: 'LAUNCH FLUGTAG',
    accentBorder: 'border-sky-400/70 hover:border-yellow-300',
    headerGradient: 'from-sky-600 via-blue-700 to-indigo-900',
    ctaGradient: 'from-sky-400 via-amber-300 to-yellow-400 text-slate-950',
    pillBg: 'bg-sky-500/20 border-sky-400/40 text-sky-200',
  },
  {
    id: 'soapbox',
    keyHint: '2',
    badge: 'EVENT 02 • GRAVITY ROAD DERBY',
    emoji: '🏎️',
    secondaryEmojis: ['🛞', '🏔️', '🏁'],
    title: 'Red Bull Soap Box Derby',
    subtitle: 'Alpine Hilltop Gravity Road Race',
    tagline:
      'Engineer an unpowered downhill racer in the Workshop, test rollover stability & shocks on the Road Shaker Rig, and drop through the hilltop start gate down a 2,400-ft course!',
    launchPlatform: 'Hilltop Start Pavilion & Hinged Steel Drop-Gate (+269 Ft)',
    testRig: 'Road Shaker & Tilt Dyno Rig',
    vehicleComponents: ['Chassis', 'Steering Axle', 'Wheels', 'Suspension', 'Brakes', 'Topper'],
    obstacles: [
      'Hay-Bale Chicanes',
      'Cobblestone Chatter Zones',
      'Soapy Water Slicks',
      'Double Kicker Jumps & Hairpin',
    ],
    ctaLabel: 'LAUNCH SOAP BOX DERBY',
    accentBorder: 'border-amber-400/70 hover:border-yellow-300',
    headerGradient: 'from-amber-500 via-orange-600 to-red-800',
    ctaGradient: 'from-yellow-400 via-amber-400 to-orange-500 text-slate-950',
    pillBg: 'bg-amber-500/20 border-amber-400/40 text-amber-200',
  },
  {
    id: 'coaster',
    keyHint: '3',
    badge: 'EVENT 03 • EXTREME COASTER CIRCUIT',
    emoji: '🎢',
    secondaryEmojis: ['⚡', '🌀', '🔥'],
    title: 'Red Bull Extreme Rollercoaster',
    subtitle: 'Theme-Park Steel Coaster Circuit',
    tagline:
      'Build a custom coaster train in the Workshop, test upstop wheel clamping on the Track Dyno Rig, and launch through a 2,000-ft 3D steel circuit!',
    launchPlatform: 'Elevated Boarding Station & LIM Capacitor Launch Track',
    testRig: '3-Wheel-Set Upstop Bogies & Track Dyno Rig',
    vehicleComponents: [
      'Car Chassis',
      'Wheel Bogies',
      'Restraints',
      'Nose Cone',
      'LIM / Gyro Booster',
      'Shell / Topper',
    ],
    obstacles: [
      '75-Ft 360° Vertical Loop',
      '50° Banked 3D Helix',
      '32-Ft Broken Rail Gap Jump',
      'Lagoon Splash & Bullseye Brake Run',
    ],
    ctaLabel: 'LAUNCH EXTREME COASTER',
    accentBorder: 'border-fuchsia-400/70 hover:border-yellow-300',
    headerGradient: 'from-fuchsia-600 via-purple-700 to-indigo-950',
    ctaGradient: 'from-pink-400 via-amber-300 to-yellow-400 text-slate-950',
    pillBg: 'bg-fuchsia-500/20 border-fuchsia-400/40 text-fuchsia-200',
  },
  {
    id: 'tandem',
    keyHint: '4',
    badge: 'EVENT 04 • OVER-WATER SPRINT',
    emoji: '🚲',
    secondaryEmojis: ['🦮', '🐶', '🌊'],
    title: 'Red Bull Tandem Challenge',
    subtitle: 'Stalen Ros Over-Water Pier Sprint',
    tagline:
      'Engineer an outrageous two-person tandem bicycle in the Workshop, balance lateral roll & pedal cadence on the Dyno Rig, and sprint across a 200-ft obstacle pier over water to ring the finish bell!',
    launchPlatform: 'Launch Dock Sync Deck (+12 Ft over canal)',
    testRig: 'Balance Beam & Cadence Dyno Rig',
    vehicleComponents: [
      'Tandem Frame',
      'Dual Drivetrain',
      'Wheelset / Tires',
      'Steering Bars',
      'Stabilizer Outriggers',
      'Crew Topper',
    ],
    obstacles: [
      'Tilting Seesaw Bridge',
      'Rhythm Rollers & Whoops',
      'Water Cannon Hazard',
      'Ramp Gap Jump & Bell',
    ],
    ctaLabel: 'LAUNCH TANDEM CHALLENGE',
    accentBorder: 'border-emerald-400/70 hover:border-yellow-300',
    headerGradient: 'from-emerald-600 via-teal-700 to-cyan-950',
    ctaGradient: 'from-emerald-400 via-teal-300 to-cyan-400 text-slate-950',
    pillBg: 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200',
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({
  onSelectGame,
  totalStars,
  flugtagBestDist,
  soapboxBestDist,
  soapboxBestTime,
  coasterBestDist,
  coasterBestThrill,
  tandemBestDist,
  tandemBestTime,
  muted,
  onToggleMute,
}) => {
  // Support 1 / 2 / 3 hotkeys to jump straight into any environment
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (document.querySelector('[role="dialog"]')) return;

      if (e.key === '1') {
        e.preventDefault();
        onSelectGame('flugtag');
      } else if (e.key === '2') {
        e.preventDefault();
        onSelectGame('soapbox');
      } else if (e.key === '3') {
        e.preventDefault();
        onSelectGame('coaster');
      } else if (e.key === '4') {
        e.preventDefault();
        onSelectGame('tandem');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSelectGame]);

  const renderRecordBadge = (id: GameCardDefinition['id']) => {
    if (id === 'flugtag') {
      return flugtagBestDist > 0 ? (
        <div className="flex items-center gap-1.5 rounded-xl bg-sky-500/25 border border-sky-300/50 px-2.5 py-1 text-xs font-black text-sky-200">
          <Trophy className="h-3.5 w-3.5 shrink-0 text-yellow-300" aria-hidden="true" />
          <span>Best Flight: {Math.round(flugtagBestDist)} FT</span>
        </div>
      ) : (
        <div className="flex items-center gap-1 rounded-xl bg-white/10 border border-white/15 px-2.5 py-1 text-xs font-extrabold text-slate-200">
          <span>🎯 Goal: 258 FT Record</span>
        </div>
      );
    }

    if (id === 'soapbox') {
      return soapboxBestDist > 0 || (soapboxBestTime !== null && soapboxBestTime > 0) ? (
        <div className="flex items-center gap-1.5 rounded-xl bg-amber-500/25 border border-amber-300/50 px-2.5 py-1 text-xs font-black text-amber-200">
          <Trophy className="h-3.5 w-3.5 shrink-0 text-yellow-300" aria-hidden="true" />
          <span>
            Best Run: {Math.round(soapboxBestDist)} FT
            {soapboxBestTime !== null && soapboxBestTime > 0 ? ` • ${soapboxBestTime.toFixed(1)}s` : ''}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-1 rounded-xl bg-white/10 border border-white/15 px-2.5 py-1 text-xs font-extrabold text-slate-200">
          <span>🏁 Goal: 2,400 FT Finish Arch</span>
        </div>
      );
    }

    if (id === 'tandem') {
      const dist = tandemBestDist ?? 0;
      const time = tandemBestTime ?? null;
      return dist > 0 || (time !== null && time > 0) ? (
        <div className="flex items-center gap-1.5 rounded-xl bg-emerald-500/25 border border-emerald-300/50 px-2.5 py-1 text-xs font-black text-emerald-200">
          <Trophy className="h-3.5 w-3.5 shrink-0 text-yellow-300" aria-hidden="true" />
          <span>
            Best Sprint: {Math.round(dist)} FT
            {time !== null && time > 0 ? ` • ${time.toFixed(1)}s` : ''}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-1 rounded-xl bg-white/10 border border-white/15 px-2.5 py-1 text-xs font-extrabold text-slate-200">
          <span>🔔 Goal: 200 FT Finish Bell</span>
        </div>
      );
    }

    return coasterBestDist > 0 || coasterBestThrill > 0 ? (
      <div className="flex items-center gap-1.5 rounded-xl bg-fuchsia-500/25 border border-fuchsia-300/50 px-2.5 py-1 text-xs font-black text-fuchsia-200">
        <Trophy className="h-3.5 w-3.5 shrink-0 text-yellow-300" aria-hidden="true" />
        <span>
          Best Track: {Math.round(coasterBestDist)} FT
          {coasterBestThrill > 0 ? ` • ${Math.round(coasterBestThrill)} Pts` : ''}
        </span>
      </div>
    ) : (
      <div className="flex items-center gap-1 rounded-xl bg-white/10 border border-white/15 px-2.5 py-1 text-xs font-extrabold text-slate-200">
        <span>🎢 Goal: 2,000 FT &amp; Bullseye Stop</span>
      </div>
    );
  };

  return (
    <div className="relative h-full w-full overflow-y-auto no-scrollbar touch-pan-y bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white select-none">
      {/* Subtle decorative background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-28 -left-28 h-80 w-80 rounded-full bg-sky-500/15 blur-3xl" />
        <div className="absolute top-1/3 right-0 h-96 w-96 rounded-full bg-amber-500/15 blur-3xl" />
        <div className="absolute -bottom-28 left-1/3 h-80 w-80 rounded-full bg-fuchsia-500/15 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-full max-w-7xl flex-col justify-between px-3 py-3 sm:px-6 sm:py-5 gap-3 sm:gap-4">
        {/* TOP ARCADE HEADER BAR */}
        <header className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl bg-slate-900/90 border border-white/15 px-3.5 py-2.5 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div
              aria-hidden="true"
              className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-red-600 via-amber-500 to-yellow-400 text-2xl sm:text-3xl shadow-lg border-2 border-yellow-200"
            >
              🐂
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-base sm:text-2xl font-black tracking-wide text-white">
                  RED BULL DIY EXTREME ARCADE
                </h1>
                <span className="hidden md:inline-flex items-center gap-1 rounded-full bg-amber-400/20 border border-amber-300/50 px-2.5 py-0.5 text-[11px] font-black text-amber-300">
                  <Sparkles className="h-3 w-3" aria-hidden="true" /> 4 STANDALONE 3D SANDBOXES
                </span>
              </div>
              <p className="text-[11px] sm:text-xs font-bold text-slate-300">
                Choose an extreme engineering environment below — build your custom machine, test the physics, and impress the 3 Judges!
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-1.5 rounded-2xl bg-amber-400/20 border-2 border-amber-400/70 px-3 py-1.5 shadow"
              title="Shared Judge Stars — Unlocks parts across Flugtag, Soap Box Derby, Extreme Rollercoaster, and Tandem Challenge!"
            >
              <span className="text-base sm:text-lg" aria-hidden="true">⭐</span>
              <div className="leading-tight">
                <div className="font-display text-xs sm:text-sm font-black text-amber-300 tabular-nums">
                  {totalStars} STARS
                </div>
                <div className="text-[9px] font-extrabold uppercase tracking-wider text-amber-200/80 hidden sm:block">
                  Shared Workshop Unlocks
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onToggleMute}
              aria-pressed={muted}
              className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/15 active:scale-95 transition cursor-pointer shadow"
              aria-label={muted ? 'Unmute Arcade Audio' : 'Mute Arcade Audio'}
              title={muted ? 'Unmute Sound' : 'Mute Sound'}
            >
              {muted ? (
                <VolumeX className="h-5 w-5 text-rose-400" aria-hidden="true" />
              ) : (
                <Volume2 className="h-5 w-5 text-emerald-400" aria-hidden="true" />
              )}
            </button>
          </div>
        </header>

        {/* 4 GAME MODE CARDS GRID */}
        <main className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 my-auto">
          {GAME_CARDS.map((card) => (
            <div
              key={card.id}
              data-game-id={card.id}
              onClick={() => onSelectGame(card.id)}
              role="button"
              tabIndex={0}
              aria-label={`${card.title} — ${card.subtitle}. ${card.ctaLabel} (Shortcut Key ${card.keyHint})`}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectGame(card.id);
                }
              }}
              className={`group relative flex flex-col justify-between rounded-3xl bg-slate-900/90 border-2 ${card.accentBorder} overflow-hidden shadow-2xl transition-all duration-200 hover:-translate-y-1 hover:shadow-amber-400/10 cursor-pointer`}
            >
              {/* Card Top Banner */}
              <div>
                <div className={`bg-gradient-to-r ${card.headerGradient} p-3.5 sm:p-4 border-b border-white/15`}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="rounded-full bg-black/35 border border-white/20 px-2.5 py-0.5 text-[10px] font-black tracking-wider text-white uppercase">
                      {card.badge}
                    </span>
                    <span className="rounded-lg bg-black/35 border border-white/20 px-2 py-0.5 text-[10px] font-black text-amber-300">
                      Key {card.keyHint}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="font-display text-lg sm:text-xl font-black text-white leading-tight">
                        {card.title}
                      </h2>
                      <div className="text-xs sm:text-sm font-extrabold text-amber-200 mt-0.5">
                        {card.subtitle}
                      </div>
                    </div>
                    <div
                      aria-hidden="true"
                      className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-2xl bg-black/30 border-2 border-white/30 text-3xl sm:text-4xl shadow-inner group-hover:scale-110 transition-transform"
                    >
                      {card.emoji}
                    </div>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                    {renderRecordBadge(card.id)}
                    <div className="flex items-center gap-1 text-base" aria-hidden="true">
                      {card.secondaryEmojis.map((em, i) => (
                        <span key={i}>{em}</span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Card Body Specs */}
                <div className="p-3.5 sm:p-4 flex flex-col gap-2.5">
                  <p className="text-xs sm:text-[13px] font-bold text-slate-200 leading-relaxed">
                    {card.tagline}
                  </p>

                  {/* Launch Platform & Test Rig */}
                  <div className="rounded-2xl bg-slate-950/70 border border-white/10 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-300">
                      <Compass className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>Launch Platform</span>
                    </div>
                    <div className="text-xs font-extrabold text-white mt-0.5">
                      {card.launchPlatform}
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-[11px] font-bold text-emerald-300">
                      <Gauge className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span>Lab Dyno: {card.testRig}</span>
                    </div>
                  </div>

                  {/* 6 Vehicle Component Slots */}
                  <div className="rounded-2xl bg-slate-950/70 border border-white/10 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-sky-300 mb-1">
                      <Wrench className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>6 Vehicle Component Slots</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {card.vehicleComponents.map((comp) => (
                        <span
                          key={comp}
                          className={`rounded-lg border px-2 py-0.5 text-[10px] font-extrabold ${card.pillBg}`}
                        >
                          {comp}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Signature Obstacles & Physics */}
                  <div className="rounded-2xl bg-slate-950/70 border border-white/10 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-pink-300 mb-1">
                      <Flame className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>Signature Obstacles</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] font-bold text-slate-200">
                      {card.obstacles.map((obs) => (
                        <div key={obs} className="flex items-start gap-1 leading-snug">
                          <span className="text-amber-400 shrink-0" aria-hidden="true">•</span>
                          <span>{obs}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Card Footer CTA */}
              <div className="p-3.5 sm:p-4 pt-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectGame(card.id);
                  }}
                  className={`flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r ${card.ctaGradient} py-2.5 px-4 font-display text-xs sm:text-sm font-black border-2 border-white/80 shadow-lg group-hover:brightness-105 active:scale-95 transition cursor-pointer`}
                >
                  <Play className="h-4 w-4 shrink-0 fill-current" aria-hidden="true" />
                  <span>{card.ctaLabel}</span>
                </button>
              </div>
            </div>
          ))}
        </main>

        {/* BOTTOM FOOTER TIP */}
        <footer className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-900/75 border border-white/10 px-3.5 py-2 text-[11px] font-bold text-slate-300">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-amber-400/20 border border-amber-400/40 px-2 py-0.5 text-amber-300 font-black">
              PRO TIP
            </span>
            <span>
              Stars earned from Judge Scorecards in any event unlock wild new parts across all 4 workshops!
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-slate-400">
            <span>Press</span>
            <kbd className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-black text-amber-300 border border-white/15">
              1
            </kbd>
            <kbd className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-black text-amber-300 border border-white/15">
              2
            </kbd>
            <kbd className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-black text-amber-300 border border-white/15">
              3
            </kbd>
            <kbd className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-black text-amber-300 border border-white/15">
              4
            </kbd>
            <span>to launch or</span>
            <kbd className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-black text-amber-300 border border-white/15">
              Esc
            </kbd>
            <span>to return to Hub</span>
          </div>
        </footer>
      </div>
    </div>
  );
};

