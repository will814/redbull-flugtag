import React, { useState } from 'react';
import {
  CraftLoadout,
  CraftPart,
  getPartById,
  getPartsByCategory,
  MAX_FLUGTAG_WEIGHT_LBS,
  PAINT_THEMES,
  PartCategory,
  PRESET_BLUEPRINTS,
} from '../builder/PartCatalog';
import { ComputedCraftMetrics, computeCraftMetrics } from '../physics/CraftMetrics';
import {
  Volume2,
  VolumeX,
  Wind,
  Shuffle,
  Sparkles,
  Lock,
  Rocket,
  FolderOpen,
  Save,
  Trash2,
  Check,
} from 'lucide-react';

export interface SavedCraftSlot {
  id: string;
  name: string;
  loadout: CraftLoadout;
  createdAt: number;
}

interface HangarHUDProps {
  loadout: CraftLoadout;
  metrics: ComputedCraftMetrics;
  selectedCategory: PartCategory;
  onSelectCategory: (cat: PartCategory) => void;
  onEquipPart: (category: PartCategory, partId: string) => void;
  onSelectPaint: (paintId: CraftLoadout['paintTheme']) => void;
  onApplyPreset: (preset: CraftLoadout) => void;
  onRandomizeCraft: () => void;
  savedBuilds: SavedCraftSlot[];
  onSaveCurrentBuild: (customName?: string) => void;
  onDeleteSavedBuild: (id: string) => void;
  windTunnelActive: boolean;
  onToggleWindTunnel: () => void;
  onStartFlight: () => void;
  totalStars: number;
  bestDistanceFeet: number;
  muted: boolean;
  onToggleMute: () => void;
}

const CATEGORY_TABS: Array<{ id: PartCategory; label: string; emoji: string }> = [
  { id: 'wings', label: 'Wings', emoji: '🦅' },
  { id: 'topper', label: 'Topper', emoji: '🌮' },
  { id: 'chassis', label: 'Hull', emoji: '🪵' },
  { id: 'nose', label: 'Nose', emoji: '🚀' },
  { id: 'tail', label: 'Tail', emoji: '📐' },
  { id: 'trolley', label: 'Wheels', emoji: '🛹' },
];

export const HangarHUD: React.FC<HangarHUDProps> = ({
  loadout,
  metrics,
  selectedCategory,
  onSelectCategory,
  onEquipPart,
  onSelectPaint,
  onApplyPreset,
  onRandomizeCraft,
  savedBuilds,
  onSaveCurrentBuild,
  onDeleteSavedBuild,
  windTunnelActive,
  onToggleWindTunnel,
  onStartFlight,
  totalStars,
  bestDistanceFeet,
  muted,
  onToggleMute,
}) => {
  const [showGarageModal, setShowGarageModal] = useState(false);
  const [showPaintDrawer, setShowPaintDrawer] = useState(false);
  const [customBuildName, setCustomBuildName] = useState('');
  const [justSavedToast, setJustSavedToast] = useState(false);

  const categoryParts = getPartsByCategory(selectedCategory);
  const currentEquippedId = loadout[selectedCategory];

  const balanceConfig =
    metrics.balanceStatus === 'balanced'
      ? {
          label: 'BALANCED GLIDER!',
          sub: 'Sweet Spot!',
          bg: 'bg-emerald-500/90 border-emerald-300',
        }
      : metrics.balanceStatus === 'nose_heavy'
      ? {
          label: 'NOSE HEAVY!',
          sub: 'Dives Fast!',
          bg: 'bg-amber-500/90 border-amber-300',
        }
      : {
          label: 'TAIL HEAVY!',
          sub: 'Flips Up!',
          bg: 'bg-purple-600/90 border-purple-300',
        };

  const handleQuickSave = () => {
    onSaveCurrentBuild(customBuildName.trim() || undefined);
    setCustomBuildName('');
    setJustSavedToast(true);
    setTimeout(() => setJustSavedToast(false), 1800);
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-1.5 sm:p-2.5">
      {/* TOP GROUP: Single-Row Header Bar + Optional Docked Wind Tunnel Banner */}
      <div className="flex flex-col gap-1">
        <div className="pointer-events-auto flex items-center justify-between gap-1.5 overflow-x-auto no-scrollbar rounded-2xl bg-slate-900/85 px-2.5 py-1.5 backdrop-blur-md border border-white/15 shadow-xl">
          {/* Left: Brand & Stars & Record */}
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-red-600 to-amber-500 px-2 py-1 font-display text-xs sm:text-sm font-bold tracking-wide shadow">
              <span>🐂</span>
              <span className="hidden md:inline">FLUGTAG</span>
            </div>

            <div
              className="flex items-center gap-1 rounded-xl bg-amber-400/20 border border-amber-400/50 px-2 py-1 text-xs sm:text-sm font-extrabold text-amber-300"
              title="Judge Stars Earned — Unlocks New Parts!"
            >
              <span>⭐</span>
              <span>{totalStars}</span>
            </div>

            <div
              className="flex items-center gap-1 rounded-xl bg-sky-500/20 border border-sky-400/40 px-2 py-1 text-xs sm:text-sm font-extrabold text-sky-200"
              title="Best Flight Distance (World Record is 258 ft!)"
            >
              <span>🏆</span>
              <span>{bestDistanceFeet} FT</span>
            </div>

            <button
              onClick={onToggleMute}
              className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 active:scale-95 transition cursor-pointer"
              aria-label={muted ? 'Unmute Sound' : 'Mute Sound'}
            >
              {muted ? (
                <VolumeX className="h-4 w-4 text-rose-400" />
              ) : (
                <Volume2 className="h-4 w-4 text-emerald-400" />
              )}
            </button>
          </div>

          {/* Center: Kid-Friendly Balance Seesaw & Weight/Lift Meters */}
          <div className="flex shrink-0 items-center gap-2">
            {/* Animated Balance Seesaw Pill */}
            <div
              className={`flex items-center gap-1.5 rounded-xl border px-2 py-1 text-xs font-extrabold text-white shadow ${balanceConfig.bg}`}
            >
              <div className="relative flex h-5 w-9 items-center justify-center rounded-lg bg-black/25 px-1">
                <div
                  className="h-1.5 w-7 rounded-full bg-yellow-300 transition-transform duration-300"
                  style={{ transform: `rotate(${-metrics.seesawTiltDeg}deg)` }}
                />
                <div className="absolute bottom-0.5 h-1.5 w-1.5 rotate-45 bg-white" />
              </div>
              <div className="leading-tight">
                <div className="text-[11px] sm:text-xs font-black tracking-wide">
                  {balanceConfig.label}
                </div>
              </div>
            </div>

            {/* Compact Weight, Lift & Fun Bars */}
            <div className="hidden lg:flex items-center gap-2 rounded-xl bg-slate-800/90 px-2.5 py-1 border border-white/10 text-xs">
              <div className="flex items-center gap-1">
                <span>🦅</span>
                <span className="font-bold text-sky-300">Lift</span>
                <div className="h-2 w-12 rounded-full bg-slate-700 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all duration-300"
                    style={{ width: `${metrics.liftScore}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-1">
                <span>⚖️</span>
                <span
                  className={`font-bold ${
                    metrics.isOverWeightLimit
                      ? 'text-rose-400 animate-pulse'
                      : 'text-amber-300'
                  }`}
                >
                  {metrics.rampTotalMassLbs}/{MAX_FLUGTAG_WEIGHT_LBS} lb
                </span>
              </div>

              <div className="flex items-center gap-1">
                <span>🎭</span>
                <span className="font-bold text-pink-300">Fun</span>
                <div className="h-2 w-10 rounded-full bg-slate-700 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-pink-500 to-amber-400 transition-all duration-300"
                    style={{ width: `${metrics.creativityScore}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right: Wind Tunnel Fan, Mix, Save Build, Garage & FLY! */}
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={onToggleWindTunnel}
              className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs sm:text-sm font-extrabold border transition active:scale-95 cursor-pointer ${
                windTunnelActive
                  ? 'bg-emerald-500 text-slate-950 border-emerald-200 shadow-lg shadow-emerald-500/30'
                  : 'bg-slate-800 text-sky-200 border-sky-400/40 hover:bg-slate-700'
              }`}
            >
              <Wind className={`h-4 w-4 ${windTunnelActive ? 'animate-spin' : ''}`} />
              <span>{windTunnelActive ? 'FAN ON!' : 'TEST FAN'}</span>
            </button>

            <button
              onClick={onRandomizeCraft}
              className="flex items-center gap-1 rounded-xl bg-purple-600 hover:bg-purple-500 border border-purple-300/40 px-2.5 py-1 text-xs sm:text-sm font-extrabold text-white active:scale-95 transition cursor-pointer"
              title="Random Funny Craft!"
            >
              <Shuffle className="h-4 w-4" />
              <span className="hidden sm:inline">Mix!</span>
            </button>

            <button
              onClick={handleQuickSave}
              className={`flex items-center gap-1 rounded-xl border px-2.5 py-1 text-xs sm:text-sm font-extrabold transition active:scale-95 cursor-pointer ${
                justSavedToast
                  ? 'bg-emerald-500 text-slate-950 border-emerald-200'
                  : 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border-emerald-400/40'
              }`}
              title="Save Current Craft Configuration"
            >
              {justSavedToast ? (
                <>
                  <Check className="h-4 w-4" />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span className="hidden sm:inline">Save</span>
                </>
              )}
            </button>

            <button
              onClick={() => setShowGarageModal((v) => !v)}
              className="flex items-center gap-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-amber-400/40 px-2.5 py-1 text-xs sm:text-sm font-extrabold text-amber-200 active:scale-95 transition cursor-pointer"
              title="Open Saved Builds & Famous Presets"
            >
              <FolderOpen className="h-4 w-4 text-amber-300" />
              <span>Builds ({savedBuilds.length})</span>
            </button>

            <button
              onClick={onStartFlight}
              className="animate-pulse-glow flex items-center gap-1 rounded-xl bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-500 px-3 sm:px-4 py-1 font-display text-xs sm:text-base font-black text-slate-950 border-2 border-yellow-200 shadow-lg active:scale-95 transition cursor-pointer"
            >
              <Rocket className="h-4 w-4" />
              <span>FLY IT!</span>
            </button>
          </div>
        </div>

        {/* WIND TUNNEL LIVE FEEDBACK BANNER */}
        {windTunnelActive && (
          <div className="pointer-events-none self-center rounded-xl bg-slate-900/85 border border-sky-400/50 px-3 py-0.5 text-center shadow-md backdrop-blur-sm">
            <div className="text-[11px] sm:text-xs font-extrabold text-sky-300">
              💨 WIND TUNNEL TEST:{' '}
              {metrics.balanceStatus === 'balanced' && metrics.liftScore >= 45
                ? '✨ Awesome Lift & Balance! Ready for a huge flight!'
                : metrics.balanceStatus === 'nose_heavy'
                ? '⬇️ Nose is heavy! Try bigger Wings or a lighter Nose Cone!'
                : metrics.balanceStatus === 'tail_heavy'
                ? '⬆️ Back is heavy! Try a Sleek Nose or lighter Tail Fin!'
                : '🍞 Tiny wings! It will drop fast for a big cannonball splash!'}
            </div>
          </div>
        )}
      </div>

      {/* MY GARAGE (SAVED CRAFTS & PRESETS MODAL) */}
      {showGarageModal && (
        <div className="pointer-events-auto self-center rounded-3xl bg-slate-900/95 border-2 border-amber-400/80 p-3 sm:p-4 shadow-2xl backdrop-blur-md max-w-xl w-full max-h-[68vh] overflow-y-auto no-scrollbar">
          <div className="flex items-center justify-between border-b border-white/15 pb-2 mb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xl">🏠</span>
              <span className="font-display text-sm sm:text-lg font-black text-amber-300">
                MY CRAFT GARAGE & SAVED BUILDS
              </span>
            </div>
            <button
              onClick={() => setShowGarageModal(false)}
              className="rounded-xl bg-slate-800 px-3 py-1 text-xs font-extrabold text-slate-200 hover:bg-slate-700 cursor-pointer"
            >
              Close ✕
            </button>
          </div>

          {/* Save Current Build Row */}
          <div className="flex items-center gap-2 rounded-2xl bg-slate-800/90 border border-emerald-400/40 p-2 mb-3">
            <input
              type="text"
              value={customBuildName}
              onChange={(e) => setCustomBuildName(e.target.value)}
              placeholder="Name your craft (or tap Save for cool auto-name!)"
              className="flex-1 rounded-xl bg-slate-950/80 px-3 py-1.5 text-xs sm:text-sm font-bold text-white placeholder-slate-400 border border-white/15 focus:outline-none focus:border-amber-400"
            />
            <button
              onClick={handleQuickSave}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-3.5 py-1.5 font-display text-xs sm:text-sm font-black text-slate-950 shadow active:scale-95 transition cursor-pointer"
            >
              <Save className="h-4 w-4" />
              <span>Save Craft!</span>
            </button>
          </div>

          {/* Saved Custom Builds List */}
          <div className="mb-3">
            <div className="text-xs font-black uppercase tracking-wider text-sky-300 mb-1.5">
              ⭐ My Saved Builds ({savedBuilds.length})
            </div>
            {savedBuilds.length === 0 ? (
              <div className="rounded-xl bg-slate-800/50 border border-white/10 p-3 text-center text-xs font-bold text-slate-400">
                No saved crafts yet! Tap &ldquo;Save Craft!&rdquo; above to save your favorite designs!
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {savedBuilds.map((slot) => {
                  const slotChassis = getPartById(slot.loadout.chassis);
                  const slotWings = getPartById(slot.loadout.wings);
                  const slotTopper = getPartById(slot.loadout.topper);
                  const slotNose = getPartById(slot.loadout.nose);
                  const slotMetrics = computeCraftMetrics(slot.loadout);

                  return (
                    <div
                      key={slot.id}
                      className="flex items-center justify-between gap-2 rounded-2xl bg-slate-800/95 border border-sky-400/40 p-2.5 shadow"
                    >
                      <button
                        onClick={() => {
                          onApplyPreset(slot.loadout);
                          setShowGarageModal(false);
                        }}
                        className="flex flex-1 flex-col text-left min-w-0 cursor-pointer"
                      >
                        <div className="truncate font-display text-xs sm:text-sm font-black text-white">
                          {slot.name}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-base">
                          <span>{slotChassis.emoji}</span>
                          <span>{slotWings.emoji}</span>
                          <span>{slotTopper.emoji}</span>
                          <span>{slotNose.emoji}</span>
                          <span className="ml-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-300">
                            ⚖️ {slotMetrics.rampTotalMassLbs}lb
                          </span>
                        </div>
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            onApplyPreset(slot.loadout);
                            setShowGarageModal(false);
                          }}
                          className="rounded-xl bg-sky-500 hover:bg-sky-400 px-2.5 py-1.5 text-xs font-black text-slate-950 active:scale-95 cursor-pointer"
                        >
                          Load
                        </button>
                        <button
                          onClick={() => onDeleteSavedBuild(slot.id)}
                          className="rounded-xl bg-rose-500/20 hover:bg-rose-500/40 p-1.5 text-rose-300 active:scale-95 cursor-pointer"
                          title="Delete Saved Craft"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Starter Famous Blueprints */}
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-amber-300 mb-1.5">
              🏆 Famous Flugtag Starter Blueprints
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_BLUEPRINTS.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => {
                    onApplyPreset(preset);
                    setShowGarageModal(false);
                  }}
                  className="flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-indigo-600/80 border border-white/15 p-2 text-left text-xs sm:text-sm font-bold text-white transition active:scale-95 cursor-pointer"
                >
                  <span>{preset.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM SNAP-SOCKET BUILDER DOCK */}
      <div className="pointer-events-auto flex flex-col gap-1.5 rounded-2xl bg-slate-900/90 p-2 backdrop-blur-md border border-white/15 shadow-2xl">
        {/* Category Tabs + Paint Swatch Button */}
        <div className="flex items-center justify-between gap-1 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1">
            {CATEGORY_TABS.map((tab) => {
              const isSelected = !showPaintDrawer && selectedCategory === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setShowPaintDrawer(false);
                    onSelectCategory(tab.id);
                  }}
                  className={`flex items-center gap-1.5 rounded-xl px-2.5 sm:px-3.5 py-1.5 text-xs sm:text-sm font-extrabold transition active:scale-95 whitespace-nowrap cursor-pointer ${
                    isSelected
                      ? 'bg-amber-400 text-slate-950 shadow-md border-2 border-yellow-200'
                      : 'bg-slate-800/90 text-slate-200 hover:bg-slate-700 border border-white/10'
                  }`}
                >
                  <span className="text-base sm:text-lg">{tab.emoji}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}

            <button
              onClick={() => setShowPaintDrawer((v) => !v)}
              className={`flex items-center gap-1.5 rounded-xl px-2.5 sm:px-3.5 py-1.5 text-xs sm:text-sm font-extrabold transition active:scale-95 whitespace-nowrap cursor-pointer ${
                showPaintDrawer
                  ? 'bg-pink-500 text-white shadow-md border-2 border-pink-200'
                  : 'bg-slate-800/90 text-slate-200 hover:bg-slate-700 border border-white/10'
              }`}
            >
              <span className="text-base sm:text-lg">🎨</span>
              <span>Paint</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-bold text-slate-400 pr-2">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span>Tap any part to snap on! Drag 3D craft to spin!</span>
          </div>
        </div>

        {/* Horizontal Carousel of Parts or Paint Themes */}
        {showPaintDrawer ? (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
            {PAINT_THEMES.map((theme) => {
              const active = loadout.paintTheme === theme.id;
              return (
                <button
                  key={theme.id}
                  onClick={() => onSelectPaint(theme.id)}
                  className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3.5 py-2 border-2 transition active:scale-95 cursor-pointer ${
                    active
                      ? 'bg-slate-800 border-yellow-400 shadow-lg scale-[1.02]'
                      : 'bg-slate-800/60 border-white/10 hover:bg-slate-800'
                  }`}
                >
                  <span className="text-xl">{theme.emoji}</span>
                  <div className="text-left">
                    <div className="text-xs sm:text-sm font-extrabold text-white">
                      {theme.name}
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <span
                        className="h-3 w-5 rounded-full border border-white/40"
                        style={{ backgroundColor: theme.bodyHex }}
                      />
                      <span
                        className="h-3 w-5 rounded-full border border-white/40"
                        style={{ backgroundColor: theme.wingHex }}
                      />
                      <span
                        className="h-3 w-5 rounded-full border border-white/40"
                        style={{ backgroundColor: theme.stripeHex }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex items-stretch gap-2 overflow-x-auto no-scrollbar py-0.5">
            {categoryParts.map((part: CraftPart) => {
              const isEquipped = currentEquippedId === part.id;
              const isLocked = totalStars < part.unlockStars;

              return (
                <button
                  key={part.id}
                  onClick={() => {
                    if (!isLocked) {
                      onEquipPart(selectedCategory, part.id);
                    }
                  }}
                  disabled={isLocked}
                  className={`relative flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-1.5 sm:py-2 text-left border-2 transition active:scale-95 min-w-[165px] sm:min-w-[190px] ${
                    isLocked
                      ? 'bg-slate-900/70 border-slate-700/80 opacity-65 cursor-not-allowed'
                      : isEquipped
                      ? 'bg-gradient-to-br from-indigo-900/90 to-slate-800 border-yellow-400 shadow-lg shadow-yellow-400/15 cursor-pointer'
                      : 'bg-slate-800/80 border-white/10 hover:border-sky-400/60 hover:bg-slate-800 cursor-pointer'
                  }`}
                >
                  {/* Big Part Emoji Badge */}
                  <div
                    className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl text-2xl sm:text-3xl shadow-inner"
                    style={{
                      backgroundColor: isLocked ? '#1e293b' : `${part.primaryColor}33`,
                      border: `2px solid ${isLocked ? '#475569' : part.primaryColor}`,
                    }}
                  >
                    {isLocked ? (
                      <Lock className="h-5 w-5 text-amber-400" />
                    ) : (
                      part.emoji
                    )}
                  </div>

                  {/* Part Name, Kid Badge & Mini Icons */}
                  <div className="flex flex-col justify-center min-w-0">
                    <div className="truncate text-xs sm:text-sm font-extrabold text-white">
                      {part.name}
                    </div>

                    {isLocked ? (
                      <div className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[11px] font-black text-amber-300">
                        <span>🔒 Need {part.unlockStars} ⭐</span>
                      </div>
                    ) : (
                      <>
                        <div className="mt-0.5 inline-block rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-300 w-fit">
                          {part.kidBadge}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[10px] font-bold text-slate-300">
                          <span>⚖️ {part.massLbs}lb</span>
                          {part.wingAreaM2 > 1 && (
                            <span>🦅 +{Math.round(part.wingAreaM2)}</span>
                          )}
                          <span>✨ +{part.creativityPoints}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {isEquipped && !isLocked && (
                    <span className="absolute -top-1.5 -right-1.5 rounded-full bg-yellow-400 px-1.5 py-0.5 text-[9px] font-black text-slate-950 shadow">
                      ON
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
