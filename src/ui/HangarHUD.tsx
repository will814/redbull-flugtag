import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Undo2,
  Redo2,
  ChevronDown,
  ChevronUp,
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
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
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

const CATEGORY_TABS: Array<{ id: PartCategory; label: string; emoji: string; keyHint: string }> = [
  { id: 'wings', label: 'Wings', emoji: '🦅', keyHint: '1' },
  { id: 'topper', label: 'Topper', emoji: '🌮', keyHint: '2' },
  { id: 'chassis', label: 'Hull', emoji: '🪵', keyHint: '3' },
  { id: 'nose', label: 'Nose', emoji: '🚀', keyHint: '4' },
  { id: 'tail', label: 'Tail', emoji: '📐', keyHint: '5' },
  { id: 'trolley', label: 'Wheels', emoji: '🛹', keyHint: '6' },
];

export const HangarHUD: React.FC<HangarHUDProps> = React.memo(({
  loadout,
  metrics,
  selectedCategory,
  onSelectCategory,
  onEquipPart,
  onSelectPaint,
  onApplyPreset,
  onRandomizeCraft,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
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
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [customBuildName, setCustomBuildName] = useState('');
  const [justSavedToast, setJustSavedToast] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const activePartCardRef = useRef<HTMLButtonElement | null>(null);

  const categoryParts = useMemo(() => getPartsByCategory(selectedCategory), [selectedCategory]);
  const currentEquippedId = loadout[selectedCategory];

  // Precompute saved build summaries so computeCraftMetrics is not re-run inside map() on every render
  const savedBuildSummaries = useMemo(
    () =>
      savedBuilds.map((slot) => ({
        slot,
        chassis: getPartById(slot.loadout.chassis),
        wings: getPartById(slot.loadout.wings),
        topper: getPartById(slot.loadout.topper),
        nose: getPartById(slot.loadout.nose),
        metrics: computeCraftMetrics(slot.loadout),
      })),
    [savedBuilds]
  );

  // Scroll the equipped part card into view when switching categories
  useEffect(() => {
    if (!showPaintDrawer && !dockCollapsed && activePartCardRef.current) {
      activePartCardRef.current.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }
  }, [selectedCategory, showPaintDrawer, dockCollapsed]);

  // Clean up toast timer on unmount
  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // Desktop / Chromebook Keyboard Shortcuts in Hangar Mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        if (e.key === 'Escape') {
          (target as HTMLInputElement).blur();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          onRedo();
        } else {
          onUndo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        onRedo();
        return;
      }

      if (e.key === 'Escape' && showGarageModal) {
        e.preventDefault();
        setShowGarageModal(false);
        return;
      }

      if (showGarageModal) return;

      const idx = ['1', '2', '3', '4', '5', '6'].indexOf(e.key);
      if (idx !== -1 && CATEGORY_TABS[idx]) {
        e.preventDefault();
        setShowPaintDrawer(false);
        setDockCollapsed(false);
        onSelectCategory(CATEGORY_TABS[idx].id);
      } else if (e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setDockCollapsed(false);
        setShowPaintDrawer((v) => !v);
      } else if (e.key.toLowerCase() === 'w') {
        e.preventDefault();
        onToggleWindTunnel();
      } else if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        onRandomizeCraft();
      } else if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        onStartFlight();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    showGarageModal,
    onSelectCategory,
    onToggleWindTunnel,
    onRandomizeCraft,
    onStartFlight,
    onUndo,
    onRedo,
  ]);

  const balanceConfig =
    metrics.balanceStatus === 'balanced'
      ? {
          label: 'BALANCED GLIDER!',
          sub: 'Sweet Spot!',
          bg: 'bg-emerald-600/95 border-emerald-300',
        }
      : metrics.balanceStatus === 'nose_heavy'
      ? {
          label: 'NOSE HEAVY!',
          sub: 'Dives Fast!',
          bg: 'bg-amber-500/95 border-amber-200 text-slate-950',
        }
      : {
          label: 'TAIL HEAVY!',
          sub: 'Flips Up!',
          bg: 'bg-purple-600/95 border-purple-300',
        };

  const handleQuickSave = () => {
    onSaveCurrentBuild(customBuildName.trim() || undefined);
    setCustomBuildName('');
    setJustSavedToast(true);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setJustSavedToast(false), 1800);
  };

  return (
    <div className="safe-area-hud pointer-events-none fixed inset-0 z-10 flex flex-col justify-between">
      {/* TOP GROUP: Single-Row Header Bar + Mobile Telemetry Strip + Optional Wind Tunnel Banner */}
      <div className="flex flex-col gap-1">
        <div className="pointer-events-auto flex items-center justify-between gap-1.5 overflow-x-auto no-scrollbar rounded-2xl bg-slate-900/95 px-2.5 py-1.5 border border-white/15 shadow-xl">
          {/* Left: Brand & Stars & Record & Mute */}
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
              aria-pressed={muted}
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

          {/* Center: Kid-Friendly Balance Seesaw & Desktop Weight/Lift/Stability/Fun Meters */}
          <div className="flex shrink-0 items-center gap-2">
            {/* Animated Balance Seesaw Pill with Nose/Tail Orientation & Subtitle */}
            <div
              className={`flex items-center gap-1.5 rounded-xl border px-2 py-1 text-xs font-extrabold shadow ${balanceConfig.bg}`}
              title="Center of Gravity vs. Center of Lift Balance Seesaw"
            >
              <div className="relative flex h-5 w-12 items-center justify-between rounded-lg bg-black/30 px-1">
                <span className="text-[8px] font-black uppercase opacity-80">T</span>
                <div
                  className="h-1.5 w-6 rounded-full bg-yellow-300 transition-transform duration-300"
                  style={{ transform: `rotate(${-metrics.seesawTiltDeg}deg)` }}
                />
                <span className="text-[9px] leading-none">✈️</span>
                <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rotate-45 bg-white" />
              </div>
              <div className="leading-tight">
                <div className="text-[11px] sm:text-xs font-black tracking-wide">
                  {balanceConfig.label}
                </div>
                <div className="text-[10px] font-bold opacity-90 hidden sm:block">
                  {balanceConfig.sub}
                </div>
              </div>
            </div>

            {/* Desktop Weight, Lift, Stability & Fun Bars */}
            <div className="hidden lg:flex items-center gap-2.5 rounded-xl bg-slate-800/95 px-2.5 py-1 border border-white/10 text-xs">
              <div className="flex items-center gap-1" title="Aerodynamic Wing Lift">
                <span>🦅</span>
                <span className="font-bold text-sky-300">Lift</span>
                <div className="h-2 w-11 rounded-full bg-slate-700 overflow-hidden">
                  <div
                    className="h-full w-full origin-left bg-gradient-to-r from-sky-400 to-emerald-400 transition-transform duration-300"
                    style={{ transform: `scaleX(${metrics.liftScore / 100})` }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-1" title="Pitch Trim & Weathervane Stability">
                <span>🎯</span>
                <span className="font-bold text-emerald-300">Stab</span>
                <div className="h-2 w-10 rounded-full bg-slate-700 overflow-hidden">
                  <div
                    className="h-full w-full origin-left bg-gradient-to-r from-emerald-400 to-teal-300 transition-transform duration-300"
                    style={{ transform: `scaleX(${metrics.stabilityScore / 100})` }}
                  />
                </div>
              </div>

              <div
                className="flex items-center gap-1"
                title="Total Ramp Weight (Over 400 lbs triggers Heavyweight Cannonball inertia & splash!)"
              >
                <span>⚖️</span>
                <span
                  className={`font-bold ${
                    metrics.isOverWeightLimit
                      ? 'text-rose-400 animate-pulse'
                      : 'text-amber-300'
                  }`}
                >
                  {metrics.rampTotalMassLbs}/{MAX_FLUGTAG_WEIGHT_LBS} lb
                  {metrics.isOverWeightLimit ? ' ⚠️' : ''}
                </span>
              </div>

              <div className="flex items-center gap-1" title="Judge Creativity Score">
                <span>🎭</span>
                <span className="font-bold text-pink-300">Fun</span>
                <div className="h-2 w-10 rounded-full bg-slate-700 overflow-hidden">
                  <div
                    className="h-full w-full origin-left bg-gradient-to-r from-pink-500 to-amber-400 transition-transform duration-300"
                    style={{ transform: `scaleX(${metrics.creativityScore / 100})` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right: Undo/Redo, Wind Tunnel Fan, Mix, Save Build, Garage & FLY! */}
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className={`flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-xl border transition cursor-pointer ${
                canUndo
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-white/15 active:scale-95'
                  : 'bg-slate-900/50 text-slate-600 border-white/5 cursor-not-allowed'
              }`}
              title="Undo Change (Ctrl+Z)"
              aria-label="Undo Craft Change"
            >
              <Undo2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>

            <button
              onClick={onRedo}
              disabled={!canRedo}
              className={`flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-xl border transition cursor-pointer ${
                canRedo
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-white/15 active:scale-95'
                  : 'bg-slate-900/50 text-slate-600 border-white/5 cursor-not-allowed'
              }`}
              title="Redo Change (Ctrl+Y)"
              aria-label="Redo Craft Change"
            >
              <Redo2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>

            <button
              onClick={onToggleWindTunnel}
              aria-pressed={windTunnelActive}
              className={`flex items-center gap-1 rounded-xl px-2 sm:px-2.5 py-1 text-xs sm:text-sm font-extrabold border transition active:scale-95 cursor-pointer ${
                windTunnelActive
                  ? 'bg-emerald-500 text-slate-950 border-emerald-200 shadow-lg shadow-emerald-500/30'
                  : 'bg-slate-800 text-sky-200 border-sky-400/40 hover:bg-slate-700'
              }`}
              title="Test Craft in Wind Tunnel (W)"
            >
              <Wind className={`h-4 w-4 ${windTunnelActive ? 'animate-spin' : ''}`} />
              <span>{windTunnelActive ? 'FAN ON!' : 'TEST FAN'}</span>
            </button>

            <button
              onClick={onRandomizeCraft}
              className="flex items-center gap-1 rounded-xl bg-purple-600 hover:bg-purple-500 border border-purple-300/40 px-2 sm:px-2.5 py-1 text-xs sm:text-sm font-extrabold text-white active:scale-95 transition cursor-pointer"
              title="Random Funny Craft! (R — Undoable!)"
            >
              <Shuffle className="h-4 w-4" />
              <span className="hidden sm:inline">Mix!</span>
            </button>

            <button
              onClick={handleQuickSave}
              className={`flex items-center gap-1 rounded-xl border px-2 sm:px-2.5 py-1 text-xs sm:text-sm font-extrabold transition active:scale-95 cursor-pointer ${
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
              onClick={() => {
                setConfirmDeleteId(null);
                setShowGarageModal((v) => !v);
              }}
              aria-expanded={showGarageModal}
              className="flex items-center gap-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-amber-400/40 px-2 sm:px-2.5 py-1 text-xs sm:text-sm font-extrabold text-amber-200 active:scale-95 transition cursor-pointer"
              title="Open Saved Builds & Famous Presets"
            >
              <FolderOpen className="h-4 w-4 text-amber-300" />
              <span>Builds ({savedBuilds.length})</span>
            </button>

            <button
              onClick={onStartFlight}
              className="animate-pulse-glow flex items-center gap-1 rounded-xl bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-500 px-3 sm:px-4 py-1 font-display text-xs sm:text-base font-black text-slate-950 border-2 border-yellow-200 shadow-lg active:scale-95 transition cursor-pointer"
              title="Roll Out to the 30-Foot Flight Deck! (Space)"
            >
              <Rocket className="h-4 w-4" />
              <span>FLY IT!</span>
            </button>
          </div>
        </div>

        {/* COMPACT MOBILE / TABLET (<1024px) TELEMETRY BAR (Lift, Stability, Weight, Fun) */}
        <div className="pointer-events-auto flex lg:hidden items-center justify-center gap-2 self-center rounded-xl bg-slate-900/95 border border-white/15 px-3 py-1 text-[11px] shadow-md">
          <span className="font-extrabold text-sky-300">🦅 Lift {metrics.liftScore}%</span>
          <span className="text-slate-600">•</span>
          <span className="font-extrabold text-emerald-300">🎯 Stab {metrics.stabilityScore}%</span>
          <span className="text-slate-600">•</span>
          <span
            className={`font-extrabold ${
              metrics.isOverWeightLimit ? 'text-rose-400 animate-pulse' : 'text-amber-300'
            }`}
          >
            ⚖️ {metrics.rampTotalMassLbs}/{MAX_FLUGTAG_WEIGHT_LBS}lb
            {metrics.isOverWeightLimit ? ' (HEAVY!)' : ''}
          </span>
          <span className="text-slate-600">•</span>
          <span className="font-extrabold text-pink-300">🎭 Fun {metrics.creativityScore}%</span>
        </div>

        {/* WIND TUNNEL LIVE FEEDBACK BANNER */}
        {windTunnelActive && (
          <div className="pointer-events-none self-center rounded-xl bg-slate-900/95 border border-sky-400/50 px-3 py-0.5 text-center shadow-md">
            <div className="text-[11px] sm:text-xs font-extrabold text-sky-300">
              💨 WIND TUNNEL TEST:{' '}
              {metrics.isOverWeightLimit
                ? '⚠️ OVER 400 LB RULE! Extra ramp push inertia, but guaranteed MEGA CANNONBALL breakup!'
                : metrics.balanceStatus === 'balanced' && metrics.liftScore >= 45
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

      {/* MY GARAGE (SAVED CRAFTS & PRESETS MODAL WITH BACKDROP) */}
      {showGarageModal && (
        <div
          className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-slate-950/75 p-2 sm:p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="garage-modal-title"
          onClick={() => setShowGarageModal(false)}
        >
          <div
            className="rounded-3xl bg-slate-900/98 border-2 border-amber-400/80 p-3 sm:p-4 shadow-2xl max-w-xl w-full max-h-[80vh] overflow-y-auto no-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/15 pb-2 mb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xl">🏠</span>
                <span
                  id="garage-modal-title"
                  className="font-display text-sm sm:text-lg font-black text-amber-300"
                >
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleQuickSave();
                  }
                }}
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
                ⭐ My Saved Builds ({savedBuildSummaries.length})
              </div>
              {savedBuildSummaries.length === 0 ? (
                <div className="rounded-xl bg-slate-800/50 border border-white/10 p-3 text-center text-xs font-bold text-slate-400">
                  No saved crafts yet! Tap &ldquo;Save Craft!&rdquo; above to save your favorite designs!
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {savedBuildSummaries.map(
                    ({ slot, chassis, wings, topper, nose, metrics: slotMetrics }) => {
                      const isConfirming = confirmDeleteId === slot.id;
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
                              <span>{chassis.emoji}</span>
                              <span>{wings.emoji}</span>
                              <span>{topper.emoji}</span>
                              <span>{nose.emoji}</span>
                              <span className="ml-1 rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-extrabold text-amber-300">
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
                              onClick={() => {
                                if (isConfirming) {
                                  onDeleteSavedBuild(slot.id);
                                  setConfirmDeleteId(null);
                                } else {
                                  setConfirmDeleteId(slot.id);
                                }
                              }}
                              className={`rounded-xl px-2 py-1.5 text-xs font-black active:scale-95 cursor-pointer ${
                                isConfirming
                                  ? 'bg-rose-600 text-white border border-rose-200'
                                  : 'bg-rose-500/20 hover:bg-rose-500/40 text-rose-300'
                              }`}
                              title={isConfirming ? 'Tap again to confirm delete' : 'Delete Saved Craft'}
                            >
                              {isConfirming ? 'Sure?' : <Trash2 className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              )}
            </div>

            {/* Starter Famous Blueprints */}
            <div>
              <div className="text-xs font-black uppercase tracking-wider text-amber-300 mb-1.5">
                🏆 Famous Flugtag Starter Blueprints
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PRESET_BLUEPRINTS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => {
                      onApplyPreset(preset);
                      setShowGarageModal(false);
                    }}
                    className="flex items-center justify-between gap-2 rounded-xl bg-slate-800 hover:bg-indigo-600/80 border border-white/15 p-2.5 text-left text-xs sm:text-sm font-bold text-white transition active:scale-95 cursor-pointer"
                  >
                    <span>{preset.name}</span>
                    <span className="text-[11px] font-black text-amber-300">Load ▶</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM SNAP-SOCKET BUILDER DOCK */}
      <div className="pointer-events-auto flex flex-col gap-1.5 rounded-2xl bg-slate-900/95 p-2 border border-white/15 shadow-2xl">
        {/* Category Tabs + Paint Swatch Button + Collapse Toggle */}
        <div className="flex items-center justify-between gap-1 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1" role="tablist" aria-label="Craft Part Categories">
            {CATEGORY_TABS.map((tab) => {
              const isSelected = !showPaintDrawer && selectedCategory === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => {
                    setShowPaintDrawer(false);
                    setDockCollapsed(false);
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
              role="tab"
              aria-selected={showPaintDrawer}
              onClick={() => {
                setDockCollapsed(false);
                setShowPaintDrawer((v) => !v);
              }}
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

          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden md:flex items-center gap-1.5 text-[11px] font-bold text-slate-300">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              <span>
                {selectedCategory === 'wings' || selectedCategory === 'tail'
                  ? 'Symmetric L/R Pair • Drag/Scroll 3D to Spin & Zoom!'
                  : 'Tap 3D rings or cards to snap on! Drag/Scroll 3D to Spin & Zoom!'}
              </span>
            </div>

            <button
              onClick={() => setDockCollapsed((c) => !c)}
              aria-expanded={!dockCollapsed}
              aria-label={dockCollapsed ? 'Expand Part Dock' : 'Minimize Part Dock'}
              className="flex items-center gap-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/15 px-2 py-1 text-[11px] font-bold text-slate-200 cursor-pointer"
              title={dockCollapsed ? 'Show Part Cards' : 'Hide Part Cards to View 3D Craft'}
            >
              {dockCollapsed ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Parts</span>
                </>
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Horizontal Carousel of Parts or Paint Themes */}
        {!dockCollapsed &&
          (showPaintDrawer ? (
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
              {PAINT_THEMES.map((theme) => {
                const active = loadout.paintTheme === theme.id;
                return (
                  <button
                    key={theme.id}
                    aria-pressed={active}
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
                    ref={isEquipped ? activePartCardRef : null}
                    aria-pressed={isEquipped}
                    onClick={() => {
                      if (!isLocked) {
                        onEquipPart(selectedCategory, part.id);
                      }
                    }}
                    disabled={isLocked}
                    className={`relative flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-1.5 sm:py-2 text-left border-2 transition active:scale-95 min-w-[172px] sm:min-w-[198px] ${
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
                          <div className="mt-0.5 inline-block rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-extrabold text-amber-300 w-fit">
                            {part.kidBadge}
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-[11px] font-bold text-slate-300">
                            <span>⚖️ {part.massLbs}lb</span>
                            {part.wingAreaM2 > 0.5 && (
                              <span className="text-sky-300">
                                🦅 +{Math.round(part.wingAreaM2 * part.liftMultiplier)}
                              </span>
                            )}
                            <span>✨ +{part.creativityPoints}</span>
                          </div>
                        </>
                      )}
                    </div>

                    {isEquipped && !isLocked && (
                      <span className="absolute -top-1.5 -right-1.5 rounded-full bg-yellow-400 px-1.5 py-0.5 text-[10px] font-black text-slate-950 shadow">
                        ON
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
      </div>
    </div>
  );
});

