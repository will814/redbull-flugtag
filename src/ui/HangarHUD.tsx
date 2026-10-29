import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CATEGORY_TABS,
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
  ArrowLeft,
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
  onReturnToHub?: () => void;
}

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
  onReturnToHub,
}) => {
  const [showGarageModal, setShowGarageModal] = useState(false);
  const [showPaintDrawer, setShowPaintDrawer] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [hoveredPartId, setHoveredPartId] = useState<string | null>(null);
  const [customBuildName, setCustomBuildName] = useState('');
  const [justSavedToast, setJustSavedToast] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const activePartCardRef = useRef<HTMLButtonElement | null>(null);

  const categoryParts = useMemo(
    () => getPartsByCategory(selectedCategory),
    [selectedCategory]
  );
  const currentEquippedId = loadout[selectedCategory];

  const previewMetrics = useMemo(() => {
    if (!hoveredPartId || hoveredPartId === currentEquippedId || showPaintDrawer) {
      return null;
    }
    if (!categoryParts.some((p) => p.id === hoveredPartId)) {
      return null;
    }
    return computeCraftMetrics({ ...loadout, [selectedCategory]: hoveredPartId });
  }, [hoveredPartId, currentEquippedId, showPaintDrawer, categoryParts, loadout, selectedCategory]);

  const displayMetrics = previewMetrics ?? metrics;
  const liftDelta = previewMetrics ? previewMetrics.liftScore - metrics.liftScore : 0;
  const stabilityDelta = previewMetrics
    ? previewMetrics.stabilityScore - metrics.stabilityScore
    : 0;
  const massDelta = previewMetrics
    ? previewMetrics.rampTotalMassLbs - metrics.rampTotalMassLbs
    : 0;
  const creativityDelta = previewMetrics
    ? previewMetrics.creativityScore - metrics.creativityScore
    : 0;

  // Precompute saved build summaries only when the Garage Modal is open
  const savedBuildSummaries = useMemo(() => {
    if (!showGarageModal) return [];
    return savedBuilds.map((slot) => ({
      slot,
      chassis: getPartById(slot.loadout.chassis),
      wings: getPartById(slot.loadout.wings),
      tail: getPartById(slot.loadout.tail),
      nose: getPartById(slot.loadout.nose),
      topper: getPartById(slot.loadout.topper),
      trolley: getPartById(slot.loadout.trolley),
      metrics: computeCraftMetrics(slot.loadout),
    }));
  }, [savedBuilds, showGarageModal]);

  const presetBuildSummaries = useMemo(() => {
    if (!showGarageModal) return [];
    return PRESET_BLUEPRINTS.map((preset) => ({
      preset,
      chassis: getPartById(preset.chassis),
      wings: getPartById(preset.wings),
      tail: getPartById(preset.tail),
      nose: getPartById(preset.nose),
      topper: getPartById(preset.topper),
      trolley: getPartById(preset.trolley),
      metrics: computeCraftMetrics(preset),
    }));
  }, [showGarageModal]);

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

  // Automatically reveal part cards when a 3D socket ring is clicked in the viewport
  useEffect(() => {
    setShowPaintDrawer(false);
    setDockCollapsed(false);
    setHoveredPartId(null);
  }, [selectedCategory]);

  // Desktop / Chromebook Keyboard Shortcuts in Hangar Mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        if (e.key === 'Escape') {
          e.preventDefault();
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

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'Escape') {
        if (showGarageModal) {
          e.preventDefault();
          setConfirmDeleteId(null);
          setShowGarageModal(false);
          return;
        }
        if (onReturnToHub) {
          e.preventDefault();
          onReturnToHub();
          return;
        }
      }

      if (e.key.toLowerCase() === 'g') {
        e.preventDefault();
        setConfirmDeleteId(null);
        setShowGarageModal((v) => !v);
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
      } else if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        onRandomizeCraft();
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        onToggleMute();
      } else if (
        (e.code === 'Space' || e.code === 'Enter') &&
        !e.repeat &&
        (!target || target.tagName !== 'BUTTON')
      ) {
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
    onToggleMute,
    onReturnToHub,
  ]);

  const balanceConfig =
    displayMetrics.balanceStatus === 'balanced'
      ? {
          label: 'BALANCED GLIDER!',
          sub: 'Sweet Spot!',
          bg: 'bg-emerald-600/95 border-emerald-300 text-white',
        }
      : displayMetrics.balanceStatus === 'nose_heavy'
      ? {
          label: 'NOSE HEAVY!',
          sub: 'Dives Fast!',
          bg: 'bg-amber-500/95 border-amber-200 text-slate-950',
        }
      : {
          label: 'TAIL HEAVY!',
          sub: 'Flips Up!',
          bg: 'bg-purple-600/95 border-purple-300 text-white',
        };

  const activePart = useMemo(
    () => getPartById(hoveredPartId ?? currentEquippedId),
    [hoveredPartId, currentEquippedId]
  );

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
    <div className="safe-area-hud pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-2 sm:p-3.5">
      {/* ===================================================================== */}
      {/* TOP BAR: Arcade Hub Return, Title, Records, Stars & Workshop Tools   */}
      {/* ===================================================================== */}
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Top-Left: Arcade Hub Return & Workshop Identity */}
          <div className="pointer-events-auto flex items-center gap-2 bg-slate-950/88 backdrop-blur-md border border-slate-700/80 rounded-2xl px-3 py-1.5 shadow-xl">
            {onReturnToHub && (
              <button
                type="button"
                onClick={onReturnToHub}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-100 text-xs sm:text-sm font-extrabold border border-slate-600 transition cursor-pointer"
                title="Return to Arcade Hub (Esc)"
              >
                ◀ Arcade Hub
              </button>
            )}

            <div className="pl-1 pr-2 border-l border-slate-700">
              <div className="flex items-center gap-1.5">
                <span className="text-lg sm:text-xl">✈️</span>
                <h1 className="font-display text-sm sm:text-base font-black tracking-tight text-white uppercase">
                  Red Bull Flugtag Workshop
                </h1>
              </div>
              <p className="text-[10px] sm:text-xs text-sky-300 font-semibold">
                30-Ft Pier Flight • Wind Tunnel &amp; 258-Ft World Record
              </p>
            </div>
          </div>

          {/* Top-Right: Best Record, Shared Stars, Wind Rig, Presets & Builds, Random, Undo/Redo & Mute */}
          <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 sm:gap-2 bg-slate-950/88 backdrop-blur-md border border-slate-700/80 rounded-2xl px-3 py-1.5 shadow-xl">
            <div className="flex items-center gap-2.5 px-2.5 py-1 bg-slate-900/90 rounded-xl border border-slate-800 text-xs font-mono">
              <div title="Best Flight Distance (World Record: 258 ft!)">
                <span className="text-slate-400 font-sans font-semibold">BEST: </span>
                <span className="text-amber-300 font-black">{bestDistanceFeet} FT</span>
              </div>
              <div className="h-3 w-px bg-slate-700" />
              <div
                className="flex items-center gap-1 text-yellow-300 font-black font-sans"
                title="Shared Red Bull Judge Stars Pool"
              >
                <span>⭐</span>
                <span>{totalStars}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={onToggleWindTunnel}
              aria-pressed={windTunnelActive}
              className={`px-3 py-1.5 rounded-xl text-xs font-black border transition cursor-pointer flex items-center gap-1.5 ${
                windTunnelActive
                  ? 'bg-cyan-500 text-slate-950 border-cyan-300 shadow-lg shadow-cyan-500/30 animate-pulse'
                  : 'bg-slate-800 hover:bg-slate-700 text-cyan-300 border-cyan-500/40'
              }`}
              title="Toggle Wind Tunnel Rig (W)"
            >
              <Wind className={`h-3.5 w-3.5 ${windTunnelActive ? 'animate-spin' : ''}`} />
              <span>{windTunnelActive ? 'Wind Rig: ON' : 'Wind Rig'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setConfirmDeleteId(null);
                setShowGarageModal((v) => !v);
              }}
              aria-expanded={showGarageModal}
              className="px-3 py-1.5 rounded-xl bg-indigo-600/90 hover:bg-indigo-500 text-white text-xs font-black border border-indigo-400/50 transition cursor-pointer flex items-center gap-1.5"
              title="Open Presets & Saved Builds (G)"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              <span>Presets &amp; Builds</span>
            </button>

            <button
              type="button"
              onClick={onRandomizeCraft}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-600 transition cursor-pointer flex items-center gap-1"
              title="Randomize Build (R)"
            >
              <Shuffle className="h-3.5 w-3.5 text-purple-300" />
              <span className="hidden sm:inline">Random</span>
            </button>

            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition ${
                canUndo
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-600 cursor-pointer'
                  : 'bg-slate-900/50 text-slate-600 border-slate-800 cursor-not-allowed'
              }`}
              title="Undo Change (Ctrl+Z)"
              aria-label="Undo Craft Change"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition ${
                canRedo
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-600 cursor-pointer'
                  : 'bg-slate-900/50 text-slate-600 border-slate-800 cursor-not-allowed'
              }`}
              title="Redo Change (Ctrl+Y)"
              aria-label="Redo Craft Change"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={onToggleMute}
              aria-pressed={muted}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-600 transition cursor-pointer"
              aria-label={muted ? 'Unmute Audio' : 'Mute Audio'}
              title={muted ? 'Unmute Audio (M)' : 'Mute Audio (M)'}
            >
              {muted ? (
                <VolumeX className="h-3.5 w-3.5 text-rose-400" />
              ) : (
                <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
              )}
            </button>
          </div>
        </div>

        {/* WIND TUNNEL LIVE FEEDBACK BANNER */}
        {windTunnelActive && (
          <div className="pointer-events-none self-center rounded-xl bg-slate-950/90 border border-cyan-400/60 px-3.5 py-1 text-center shadow-lg">
            <div className="text-[11px] sm:text-xs font-extrabold text-cyan-300">
              💨 WIND RIG:{' '}
              {displayMetrics.isOverWeightLimit
                ? '⚠️ OVER 400 LB RULE! Harder start push, but massive cannonball momentum & +1 Creativity Bonus!'
                : displayMetrics.balanceStatus === 'balanced' && displayMetrics.liftScore >= 45
                ? '✨ Awesome Lift & Balance! Ready for a huge flight!'
                : displayMetrics.balanceStatus === 'nose_heavy'
                ? '⬇️ Nose is heavy! Try bigger Wings or a lighter Nose Cone!'
                : displayMetrics.balanceStatus === 'tail_heavy'
                ? '⬆️ Back is heavy! Try a Sleek Nose or lighter Tail Fin!'
                : '🍞 Tiny wings! It will drop fast for a big cannonball splash!'}
            </div>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* MIDDLE-LEFT: Aerodynamic Telemetry, Balance Seesaw & Quick Builds     */}
      {/* ===================================================================== */}
      <div className="my-auto flex items-center justify-between pointer-events-none">
        <div className="pointer-events-auto w-full max-w-xs sm:max-w-sm bg-slate-950/88 backdrop-blur-md border border-slate-700/80 rounded-2xl p-3 shadow-2xl flex flex-col gap-2">
          {/* Status Header: Seesaw Balance Badge + Ramp Total Mass */}
          <div className="flex items-center justify-between gap-2">
            <div
              className={`flex items-center gap-1.5 rounded-xl border px-2 py-0.5 text-[11px] font-black shadow ${balanceConfig.bg}`}
              title="Center of Gravity Balance Seesaw (Tail ← → Nose)"
            >
              <div className="relative flex h-4 w-10 items-center justify-between rounded bg-black/30 px-1">
                <span className="text-[7px] font-black uppercase opacity-80">T</span>
                <div
                  className="h-1 w-5 rounded-full bg-yellow-300 transition-transform duration-300"
                  style={{ transform: `rotate(${-displayMetrics.seesawTiltDeg}deg)` }}
                />
                <span className="text-[8px] leading-none">✈️</span>
                <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rotate-45 bg-white" />
              </div>
              <span>{balanceConfig.label}</span>
            </div>

            <span
              className={`text-[11px] font-mono font-bold tabular-nums ${
                displayMetrics.isOverWeightLimit
                  ? 'text-rose-400 animate-pulse'
                  : 'text-slate-300'
              }`}
              title="Ramp Total Weight (Over 400 lbs triggers Heavyweight Inertia & +1 Creativity Bonus!)"
            >
              ⚖️ {displayMetrics.rampTotalMassLbs}/{MAX_FLUGTAG_WEIGHT_LBS} LBS
              {displayMetrics.isOverWeightLimit ? ' ⚠️' : ''}
              {massDelta !== 0 && (
                <span className={massDelta < 0 ? ' text-sky-300' : ' text-amber-300'}>
                  {' '}
                  ({massDelta > 0 ? `+${massDelta}` : massDelta})
                </span>
              )}
            </span>
          </div>

          {/* 3 Core Stat Bars: Lift, Pitch Stability, Judge Creativity */}
          <div className="space-y-1.5 text-[11px] font-extrabold">
            {[
              {
                label: '🦅 Wing Lift Power',
                val: displayMetrics.liftScore,
                delta: liftDelta,
                barCls: 'bg-sky-400',
              },
              {
                label: '🎯 Pitch Stability',
                val: displayMetrics.stabilityScore,
                delta: stabilityDelta,
                barCls: 'bg-emerald-400',
              },
              {
                label: '🎭 Judge Creativity',
                val: displayMetrics.creativityScore,
                delta: creativityDelta,
                barCls: 'bg-pink-400',
              },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex justify-between text-slate-200 mb-0.5">
                  <span>{row.label}</span>
                  <span>
                    {row.val}/100
                    {row.delta !== 0 && (
                      <span
                        className={
                          row.delta > 0 ? 'text-emerald-300 ml-1' : 'text-rose-400 ml-1'
                        }
                      >
                        ({row.delta > 0 ? `+${row.delta}` : row.delta})
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full transition-all duration-200 ${row.barCls}`}
                    style={{ width: `${Math.min(100, Math.max(6, row.val))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* 1-Click Quick Builds */}
          <div className="border-t border-slate-800/80 pt-2 flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              <span>⚡ Quick Builds:</span>
              <span className="text-sky-300 font-semibold">1-Click Equip</span>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {PRESET_BLUEPRINTS.map((preset) => {
                const isCurrent =
                  loadout.chassis === preset.chassis &&
                  loadout.wings === preset.wings &&
                  loadout.tail === preset.tail &&
                  loadout.nose === preset.nose &&
                  loadout.topper === preset.topper &&
                  loadout.trolley === preset.trolley;
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => onApplyPreset(preset)}
                    className={`truncate rounded-lg border px-1.5 py-1 text-left text-[10px] font-extrabold transition cursor-pointer ${
                      isCurrent
                        ? 'border-amber-400 bg-amber-400/20 text-amber-200'
                        : 'border-slate-700/80 bg-slate-900/80 text-slate-300 hover:border-amber-400/50 hover:text-white'
                    }`}
                    title={`Equip ${preset.name}`}
                  >
                    {preset.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* PRESETS & SAVED BUILDS MODAL                                          */}
      {/* ===================================================================== */}
      {showGarageModal && (
        <div
          className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-slate-950/80 p-3 sm:p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="garage-modal-title"
          onClick={() => setShowGarageModal(false)}
        >
          <div
            className="rounded-3xl bg-slate-900 border-2 border-slate-700 p-4 sm:p-5 shadow-2xl max-w-xl w-full max-h-[85dvh] overflow-y-auto no-scrollbar touch-pan-y"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/15 pb-2.5 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">✈️</span>
                <h2
                  id="garage-modal-title"
                  className="font-display text-base sm:text-lg font-black text-white uppercase tracking-wide"
                >
                  PRESETS &amp; SAVED BUILDS
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowGarageModal(false)}
                className="rounded-xl bg-slate-800 px-3 py-1 text-xs font-extrabold text-slate-200 hover:bg-slate-700 cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            {/* Official Presets */}
            <div className="mb-4">
              <div className="text-xs font-black uppercase tracking-wider text-amber-300 mb-2">
                Official Presets (4)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {presetBuildSummaries.map(
                  ({ preset, chassis, wings, tail, nose, topper, trolley, metrics: pMetrics }) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        onApplyPreset(preset);
                        setShowGarageModal(false);
                      }}
                      className="flex items-center justify-between gap-2 rounded-xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700 hover:border-amber-400 p-2.5 text-left transition active:scale-95 cursor-pointer"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="truncate text-xs sm:text-sm font-extrabold text-white">
                          {preset.name}
                        </span>
                        <div className="mt-0.5 flex items-center gap-1 text-xs sm:text-sm">
                          <span>{chassis.emoji}</span>
                          <span>{wings.emoji}</span>
                          <span>{tail.emoji}</span>
                          <span>{nose.emoji}</span>
                          <span>{topper.emoji}</span>
                          <span>{trolley.emoji}</span>
                          <span className="ml-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-300 tabular-nums">
                            ⚖️ {pMetrics.rampTotalMassLbs}lb
                          </span>
                        </div>
                      </div>
                      <span className="shrink-0 text-[11px] font-black text-amber-300">
                        Load ▶
                      </span>
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Saved Builds Row */}
            <div className="border-t border-slate-800 pt-3">
              <div className="text-xs font-black uppercase tracking-wider text-sky-300 mb-2">
                Saved Builds ({savedBuildSummaries.length})
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-slate-950/70 border border-slate-800 p-2 mb-2.5">
                <input
                  type="text"
                  aria-label="Custom craft name"
                  value={customBuildName}
                  onChange={(e) => setCustomBuildName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleQuickSave();
                    }
                  }}
                  placeholder="Custom build name (optional)..."
                  className="flex-1 rounded-xl bg-slate-900 px-3 py-1.5 text-xs sm:text-sm font-bold text-white placeholder-slate-400 border border-slate-700 focus:outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  onClick={handleQuickSave}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-3.5 py-1.5 font-display text-xs sm:text-sm font-black text-slate-950 shadow active:scale-95 transition cursor-pointer"
                >
                  {justSavedToast ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                  <span>{justSavedToast ? 'Saved!' : 'Save Build'}</span>
                </button>
              </div>

              {savedBuildSummaries.length === 0 ? (
                <div className="rounded-xl bg-slate-800/50 border border-white/10 p-3 text-center text-xs font-bold text-slate-400">
                  No custom builds saved yet. Click &ldquo;Save Build&rdquo; to save your design!
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {savedBuildSummaries.map(
                    ({
                      slot,
                      chassis,
                      wings,
                      tail,
                      nose,
                      topper,
                      trolley,
                      metrics: slotMetrics,
                    }) => {
                      const isConfirming = confirmDeleteId === slot.id;
                      return (
                        <div
                          key={slot.id}
                          className="flex items-center justify-between gap-2 rounded-2xl bg-slate-800/95 border border-sky-400/40 p-2.5 shadow"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              onApplyPreset(slot.loadout);
                              setShowGarageModal(false);
                            }}
                            className="flex flex-1 flex-col text-left min-w-0 cursor-pointer"
                          >
                            <div className="truncate font-display text-xs sm:text-sm font-black text-white">
                              {slot.name}
                            </div>
                            <div className="mt-1 flex items-center gap-1 text-sm sm:text-base">
                              <span>{chassis.emoji}</span>
                              <span>{wings.emoji}</span>
                              <span>{tail.emoji}</span>
                              <span>{nose.emoji}</span>
                              <span>{topper.emoji}</span>
                              <span>{trolley.emoji}</span>
                              <span className="ml-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-300 tabular-nums">
                                ⚖️ {slotMetrics.rampTotalMassLbs}lb
                              </span>
                            </div>
                          </button>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                onApplyPreset(slot.loadout);
                                setShowGarageModal(false);
                              }}
                              className="rounded-xl bg-sky-500 hover:bg-sky-400 px-2.5 py-1.5 text-xs font-black text-slate-950 active:scale-95 cursor-pointer"
                            >
                              Load
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (isConfirming) {
                                  onDeleteSavedBuild(slot.id);
                                  setConfirmDeleteId(null);
                                } else {
                                  setConfirmDeleteId(slot.id);
                                }
                              }}
                              aria-label={
                                isConfirming ? `Confirm delete ${slot.name}` : `Delete ${slot.name}`
                              }
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
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* BOTTOM DOCK: 6 Category Tabs, Paint, Part Cards & Primary Launch CTA  */}
      {/* ===================================================================== */}
      <div className="pointer-events-auto flex flex-col gap-2 rounded-2xl bg-slate-950/90 backdrop-blur-md p-2.5 sm:p-3 border border-slate-700/80 shadow-2xl">
        {/* Category Tabs + Paint Swatch Button + Orbit Hint & Collapse Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Craft Part Categories">
            {CATEGORY_TABS.map((tab, idx) => {
              const isSelected = !showPaintDrawer && selectedCategory === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  title={`${tab.label} (Key ${idx + 1})`}
                  onClick={() => {
                    setShowPaintDrawer(false);
                    setDockCollapsed(false);
                    onSelectCategory(tab.id);
                  }}
                  className={`flex items-center gap-1.5 rounded-xl px-2.5 sm:px-3 py-1.5 text-xs font-extrabold transition active:scale-95 whitespace-nowrap cursor-pointer border ${
                    isSelected
                      ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md'
                      : 'bg-slate-900 text-slate-200 hover:bg-slate-800 border-slate-700'
                  }`}
                >
                  <span>{tab.emoji}</span>
                  <span>{tab.label}</span>
                  <span className="text-[10px] opacity-65 font-mono">[{idx + 1}]</span>
                </button>
              );
            })}

            <button
              type="button"
              role="tab"
              aria-selected={showPaintDrawer}
              title="Paint Themes (Key P)"
              onClick={() => {
                setDockCollapsed(false);
                setShowPaintDrawer((v) => !v);
              }}
              className={`flex items-center gap-1.5 rounded-xl px-2.5 sm:px-3 py-1.5 text-xs font-extrabold transition active:scale-95 whitespace-nowrap cursor-pointer border ${
                showPaintDrawer
                  ? 'bg-pink-500 text-white border-pink-300 shadow-md'
                  : 'bg-slate-900 text-pink-300 hover:bg-slate-800 border-pink-400/30'
              }`}
            >
              <span>🎨</span>
              <span>Paint</span>
              <span className="text-[10px] opacity-65 font-mono">[P]</span>
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden lg:inline-block text-[10px] font-bold text-slate-400">
              🖱️ Drag 3D to Orbit • Scroll to Zoom • Click Sockets
            </span>

            {dockCollapsed && (
              <button
                type="button"
                onClick={onStartFlight}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-red-600 via-amber-500 to-yellow-400 px-3 py-1.5 text-xs font-black text-slate-950 border border-amber-200 shadow cursor-pointer"
              >
                <Rocket className="h-3.5 w-3.5" />
                <span>TO THE PIER! ✈️</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setDockCollapsed((c) => !c)}
              aria-expanded={!dockCollapsed}
              aria-label={dockCollapsed ? 'Expand Part Dock' : 'Minimize Part Dock'}
              className="flex items-center gap-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/15 p-1.5 text-xs font-bold text-slate-200 cursor-pointer"
              title={dockCollapsed ? 'Expand Part Dock' : 'Collapse Part Dock'}
            >
              {dockCollapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Part Cards Carousel + Right Active Part Summary & Primary Launch CTA */}
        {!dockCollapsed && (
          <div className="flex flex-col md:flex-row items-stretch gap-3">
            <div className="flex-1 min-w-0">
              {showPaintDrawer ? (
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar touch-pan-x py-1">
                  {PAINT_THEMES.map((theme) => {
                    const active = loadout.paintTheme === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
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
                <div
                  className="flex items-stretch gap-2 overflow-x-auto no-scrollbar touch-pan-x py-0.5"
                  onPointerLeave={() => setHoveredPartId(null)}
                >
                  {categoryParts.map((part: CraftPart) => {
                    const isEquipped = currentEquippedId === part.id;
                    const isLocked = totalStars < part.unlockStars;
                    const hasBalanceTendency = Math.abs(part.cgOffsetX) >= 0.25;

                    return (
                      <button
                        key={part.id}
                        type="button"
                        ref={isEquipped ? activePartCardRef : null}
                        aria-pressed={isEquipped}
                        aria-disabled={isLocked}
                        onPointerEnter={() => setHoveredPartId(part.id)}
                        onFocus={() => setHoveredPartId(part.id)}
                        onBlur={() =>
                          setHoveredPartId((prev) => (prev === part.id ? null : prev))
                        }
                        onClick={() => {
                          if (!isLocked) {
                            onEquipPart(selectedCategory, part.id);
                          }
                        }}
                        className={`relative flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-left border transition active:scale-95 min-w-[180px] sm:min-w-[205px] ${
                          isLocked
                            ? 'bg-slate-900/60 border-slate-800 opacity-65 cursor-not-allowed'
                            : isEquipped
                            ? 'bg-amber-400/20 border-amber-400 ring-2 ring-amber-400/40 cursor-pointer'
                            : 'bg-slate-900/90 border-slate-700 hover:bg-slate-800 cursor-pointer'
                        }`}
                      >
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

                        <div className="flex flex-col justify-center min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-1">
                            <span className="truncate text-xs font-black text-white">
                              {part.name}
                            </span>
                            {isEquipped && !isLocked ? (
                              <span className="shrink-0 rounded bg-amber-400 px-1.5 py-0.5 text-[9px] font-black uppercase text-slate-950">
                                EQUIPPED
                              </span>
                            ) : isLocked ? (
                              <span className="shrink-0 inline-flex items-center gap-0.5 rounded bg-amber-500/20 border border-amber-400/40 px-1.5 py-0.5 text-[9px] font-black text-amber-300">
                                🔒 {part.unlockStars}⭐
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            <span className="inline-block rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-300">
                              {part.kidBadge}
                            </span>
                            {hasBalanceTendency && (
                              <span
                                className="inline-block rounded bg-sky-500/20 border border-sky-400/30 px-1 py-0.5 text-[10px] font-extrabold text-sky-200"
                                title={
                                  part.cgOffsetX > 0
                                    ? 'Shifts balance toward Nose'
                                    : 'Shifts balance toward Tail'
                                }
                              >
                                {part.cgOffsetX > 0 ? 'Nose+' : 'Tail+'}
                              </span>
                            )}
                          </div>

                          <div className="mt-1 flex items-center gap-2 text-[10px] font-mono text-slate-300">
                            <span>{part.massLbs} lbs</span>
                            {part.category === 'trolley' && part.pushEfficiency ? (
                              <span className="text-emerald-300">
                                🛞 +{Math.round((part.pushEfficiency - 0.85) * 40)}
                              </span>
                            ) : part.wingAreaM2 > 0.5 ? (
                              <span className="text-sky-300">
                                🦅 +{Math.round(part.wingAreaM2 * part.liftMultiplier)}
                              </span>
                            ) : null}
                            <span className="text-amber-300">✨ +{part.creativityPoints}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Sub-panel: Active Part Overview & Primary Launch CTA */}
            <div className="md:w-72 flex flex-col justify-between gap-2 bg-slate-900/90 border border-slate-700/80 rounded-xl p-2.5 shrink-0">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-black text-white">
                  <span>{activePart.emoji}</span>
                  <span className="truncate">{activePart.name}</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-snug mt-0.5 line-clamp-2">
                  {activePart.kidBadge} • {activePart.massLbs} lbs • +{activePart.creativityPoints} Creativity Flair
                </p>
              </div>

              <button
                type="button"
                onClick={onStartFlight}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-600 via-amber-500 to-yellow-400 hover:from-red-500 hover:to-yellow-300 active:scale-95 text-slate-950 font-black text-sm sm:text-base tracking-wider uppercase shadow-xl shadow-red-500/30 border-2 border-amber-200 transition cursor-pointer flex items-center justify-center gap-2"
                title="Launch Flight Run (Space)"
              >
                <Rocket className="h-4 w-4" />
                <span>TO THE PIER! ✈️</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
