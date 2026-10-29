import React, { useEffect, useMemo, useState } from 'react';
import {
  COASTER_CATEGORY_TABS,
  COASTER_PAINT_THEMES,
  COASTER_PRESETS,
  CoasterLoadout,
  CoasterPart,
  CoasterPartCategory,
  getCoasterPartById,
  getCoasterPartsByCategory,
} from './CoasterPartCatalog';
import { CoasterMetrics, computeCoasterMetrics } from './CoasterMetrics';
import { soundEngine } from '../audio/SoundEngine';
import {
  Volume2,
  VolumeX,
  Zap,
  FolderOpen,
  Shuffle,
  Undo2,
  Redo2,
} from 'lucide-react';

export interface SavedCoasterBlueprint {
  name: string;
  loadout: CoasterLoadout;
  savedAt: string;
}

export interface CoasterBuilderHUDProps {
  loadout: CoasterLoadout;
  metrics: CoasterMetrics;
  activeCategory: CoasterPartCategory;
  onSelectCategory: (cat: CoasterPartCategory) => void;
  onSelectPart: (part: CoasterPart) => void;
  onSelectPaint: (paintId: string) => void;
  onApplyPreset: (loadout: CoasterLoadout) => void;
  onRandomize: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  unlockedPartIds: Set<string>;
  totalStars: number;
  bestDistanceFeet: number;
  bestThrillScore: number;
  dynoActive: boolean;
  onToggleDyno: () => void;
  muted: boolean;
  onToggleMute: () => void;
  onStartRide: () => void;
  onReturnToHub: () => void;
  savedBlueprints: Array<SavedCoasterBlueprint | null>;
  onSaveBlueprintSlot: (slotIdx: number) => void;
  onLoadBlueprintSlot: (slotIdx: number) => void;
}

export const CoasterBuilderHUD: React.FC<CoasterBuilderHUDProps> = ({
  loadout,
  metrics,
  activeCategory,
  onSelectCategory,
  onSelectPart,
  onSelectPaint,
  onApplyPreset,
  onRandomize,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  unlockedPartIds,
  totalStars,
  bestDistanceFeet,
  bestThrillScore,
  dynoActive,
  onToggleDyno,
  muted,
  onToggleMute,
  onStartRide,
  onReturnToHub,
  savedBlueprints,
  onSaveBlueprintSlot,
  onLoadBlueprintSlot,
}) => {
  const [hoveredPartId, setHoveredPartId] = useState<string | null>(null);
  const [showPresetsModal, setShowPresetsModal] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        soundEngine.playSnapPop();
        if (showPresetsModal) {
          setShowPresetsModal(false);
        } else {
          onReturnToHub();
        }
        return;
      }

      if (isInput || e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.code === 'KeyG') {
        e.preventDefault();
        soundEngine.playSnapPop();
        setShowPresetsModal((v) => !v);
        return;
      }

      if (showPresetsModal) return;

      if (e.code === 'KeyW') {
        e.preventDefault();
        soundEngine.playRollersWhir();
        onToggleDyno();
      } else if (e.code === 'KeyP') {
        e.preventDefault();
        soundEngine.playSnapPop();
        const curIdx = COASTER_PAINT_THEMES.findIndex((t) => t.id === loadout.paintId);
        const nextTheme = COASTER_PAINT_THEMES[(curIdx + 1) % COASTER_PAINT_THEMES.length];
        if (nextTheme) onSelectPaint(nextTheme.id);
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        soundEngine.playSnapPop();
        onRandomize();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        onToggleMute();
      } else if (e.code === 'Space') {
        if (document.activeElement instanceof HTMLButtonElement) return;
        e.preventDefault();
        soundEngine.playAirhorn();
        onStartRide();
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [
    onReturnToHub,
    showPresetsModal,
    onToggleDyno,
    onRandomize,
    onToggleMute,
    onStartRide,
    loadout.paintId,
    onSelectPaint,
  ]);

  const categoryParts = useMemo(
    () => getCoasterPartsByCategory(activeCategory),
    [activeCategory]
  );

  const previewMetrics = useMemo(() => {
    if (!hoveredPartId) return null;
    const hoveredPart = getCoasterPartById(hoveredPartId);
    if (!hoveredPart || loadout[hoveredPart.category] === hoveredPart.id) return null;
    return computeCoasterMetrics({
      ...loadout,
      [hoveredPart.category]: hoveredPart.id,
    });
  }, [hoveredPartId, loadout]);

  const activePart = getCoasterPartById(loadout[activeCategory]);
  const displayPart = hoveredPartId ? getCoasterPartById(hoveredPartId) : activePart;
  const massDelta = previewMetrics ? previewMetrics.totalMassLbs - metrics.totalMassLbs : 0;

  const safetyBadgeColors: Record<CoasterMetrics['safetyStatus'], string> = {
    locked_in: 'bg-emerald-500/20 border-emerald-400 text-emerald-300',
    airtime_risk: 'bg-rose-500/25 border-rose-400 text-rose-200 animate-pulse',
    high_cog_tippy: 'bg-amber-500/25 border-amber-400 text-amber-200',
    heavy_momentum: 'bg-sky-500/25 border-sky-400 text-sky-200',
  };

  const renderStatBar = (
    label: string,
    emoji: string,
    val: number,
    previewVal: number | null,
    barColor: string
  ) => {
    const delta = previewVal !== null ? previewVal - val : 0;
    return (
      <div className="flex flex-col gap-0.5 bg-slate-900/80 border border-slate-700/70 rounded-lg px-2.5 py-1.5">
        <div className="flex items-center justify-between text-[11px] font-bold tracking-wide">
          <span className="text-slate-300 flex items-center gap-1">
            <span>{emoji}</span>
            <span>{label}</span>
          </span>
          <span className="text-white font-mono">
            {previewVal ?? val}
            {delta !== 0 && (
              <span
                className={`ml-1 font-extrabold ${
                  delta > 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {delta > 0 ? `+${delta}` : delta}
              </span>
            )}
          </span>
        </div>
        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-200 ${barColor}`}
            style={{ width: `${Math.max(6, Math.min(100, previewVal ?? val))}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-2 sm:p-3.5 select-none z-10">
      {/* ===================================================================== */}
      {/* TOP BAR: UNIFIED WORKSHOP HEADER & CONTROLS                           */}
      {/* ===================================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Left: Arcade Hub Back Button + Event Title */}
        <div className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-slate-900/90 border border-white/15 px-3 py-1.5 shadow-xl backdrop-blur-md">
          <button
            type="button"
            onClick={() => {
              soundEngine.playSnapPop();
              onReturnToHub();
            }}
            className="flex items-center gap-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/15 px-2.5 py-1 text-xs font-extrabold text-amber-300 transition active:scale-95 cursor-pointer"
            title="Return to Arcade Hub (Esc)"
          >
            ◀ Arcade Hub
          </button>
          <div className="h-5 w-px bg-white/15" />
          <div className="flex items-center gap-2">
            <span className="text-xl">🎢</span>
            <div>
              <h1 className="font-display text-xs sm:text-sm font-black tracking-wide text-white uppercase leading-none">
                Red Bull Coaster Workshop
              </h1>
              <p className="text-[10px] font-bold text-sky-300/90">
                2,000-Ft Loop, Helix, 32-Ft Rail Gap &amp; Golden Bullseye Brake Run
              </p>
            </div>
          </div>
        </div>

        {/* Right: Best & Stars, Track Rig, Presets & Builds, Random, Undo/Redo, Mute */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-2xl bg-slate-900/90 border border-white/15 px-2.5 py-1.5 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-2 rounded-xl bg-slate-950/80 border border-white/10 px-2.5 py-1 text-xs font-black">
            <span className="text-amber-300">BEST: {bestDistanceFeet} FT</span>
            <span className="text-slate-600">|</span>
            <span className="text-emerald-300">SCORE: {bestThrillScore} PTS</span>
            <span className="text-slate-600">|</span>
            <span className="text-yellow-300">⭐ {totalStars}</span>
          </div>

          <button
            type="button"
            onClick={() => {
              soundEngine.playRollersWhir();
              onToggleDyno();
            }}
            className={`flex items-center gap-1 rounded-xl border px-2.5 py-1 text-xs font-black transition active:scale-95 cursor-pointer ${
              dynoActive
                ? 'bg-cyan-400 text-slate-950 border-white shadow-md'
                : 'bg-slate-800 hover:bg-slate-700 text-cyan-300 border-cyan-400/40'
            }`}
            title="Toggle Track G-Force Test Rig (W)"
          >
            <Zap className="h-3.5 w-3.5" />
            <span>{dynoActive ? 'Track Rig: ON' : 'Track Rig'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              soundEngine.playSnapPop();
              setShowPresetsModal(true);
            }}
            className="flex items-center gap-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-amber-400/40 px-2.5 py-1 text-xs font-black text-amber-300 transition active:scale-95 cursor-pointer"
            title="Presets & Saved Builds (G)"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            <span>Presets &amp; Builds</span>
          </button>

          <button
            type="button"
            onClick={() => {
              soundEngine.playSnapPop();
              onRandomize();
            }}
            className="flex items-center gap-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-purple-400/40 px-2 py-1 text-xs font-black text-purple-300 transition active:scale-95 cursor-pointer"
            title="Randomize Unlocked Parts (R)"
          >
            <Shuffle className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Random</span>
          </button>

          {onUndo && (
            <button
              type="button"
              disabled={!canUndo}
              onClick={() => {
                if (!canUndo) return;
                soundEngine.playSnapPop();
                onUndo();
              }}
              className="rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-35 border border-white/10 p-1.5 text-slate-200 transition cursor-pointer disabled:cursor-not-allowed"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
          )}

          {onRedo && (
            <button
              type="button"
              disabled={!canRedo}
              onClick={() => {
                if (!canRedo) return;
                soundEngine.playSnapPop();
                onRedo();
              }}
              className="rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-35 border border-white/10 p-1.5 text-slate-200 transition cursor-pointer disabled:cursor-not-allowed"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={onToggleMute}
            className="rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/15 p-1.5 text-slate-200 transition cursor-pointer"
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

      {/* ===================================================================== */}
      {/* MIDDLE LEFT: Coaster Engineering Telemetry & Upstop Clamp Diagnostics */}
      {/* ===================================================================== */}
      <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-3 my-auto">
        <div className="pointer-events-auto w-full max-w-xs bg-slate-950/88 backdrop-blur-md border-2 border-white/15 rounded-2xl p-3 shadow-2xl flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-black border ${
                safetyBadgeColors[(previewMetrics ?? metrics).safetyStatus]
              }`}
            >
              {(previewMetrics ?? metrics).safetyLabel}
            </span>
            <span className="text-[11px] font-mono font-bold text-slate-300">
              {previewMetrics ? previewMetrics.totalMassLbs : metrics.totalMassLbs} LBS
              {massDelta !== 0 && (
                <span
                  className={`ml-1 font-extrabold ${
                    massDelta > 0 ? 'text-amber-300' : 'text-sky-300'
                  }`}
                >
                  ({massDelta > 0 ? `+${massDelta}` : massDelta})
                </span>
              )}{' '}
              · CoM {previewMetrics ? previewMetrics.comHeightMeters : metrics.comHeightMeters}m
            </span>
          </div>

          <p className="text-[11px] text-slate-300 leading-snug">
            {(previewMetrics ?? metrics).safetyHint}
          </p>

          <div className="grid grid-cols-2 gap-1.5">
            {renderStatBar(
              'Upstop Clamp',
              '🛞',
              metrics.upstopClampScore,
              previewMetrics ? previewMetrics.upstopClampScore : null,
              'bg-cyan-400'
            )}
            {renderStatBar(
              'Lateral Grip',
              '🌀',
              metrics.lateralGripScore,
              previewMetrics ? previewMetrics.lateralGripScore : null,
              'bg-emerald-400'
            )}
            {renderStatBar(
              'LIM & Speed',
              '⚡',
              Math.round((metrics.topSpeedScore + metrics.launchBoostPower) / 2),
              previewMetrics
                ? Math.round((previewMetrics.topSpeedScore + previewMetrics.launchBoostPower) / 2)
                : null,
              'bg-amber-400'
            )}
            {renderStatBar(
              'Magnet Brakes',
              '🧲',
              metrics.brakePowerScore,
              previewMetrics ? previewMetrics.brakePowerScore : null,
              'bg-rose-400'
            )}
            {renderStatBar(
              'G-Harness',
              '🔒',
              metrics.restraintSafetyScore,
              previewMetrics ? previewMetrics.restraintSafetyScore : null,
              'bg-indigo-400'
            )}
            {renderStatBar(
              'Thrill Style',
              '🔥',
              metrics.thrillScore,
              previewMetrics ? previewMetrics.thrillScore : null,
              'bg-fuchsia-400'
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] bg-slate-900/90 rounded-lg px-2.5 py-1 border border-slate-800">
            <span className="text-slate-400 font-semibold">Upstop Negative-G Limit:</span>
            <span className="text-cyan-300 font-mono font-black">
              {previewMetrics ? previewMetrics.maxSafeNegativeG : metrics.maxSafeNegativeG}G
            </span>
          </div>

          {/* 1-Click Quick Builds Grid */}
          <div className="border-t border-white/10 pt-1.5">
            <div className="mb-1 flex items-center justify-between text-[9px] font-black uppercase tracking-wider text-slate-400">
              <span>⚡ Quick Builds:</span>
              <span>1-Click Equip</span>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {COASTER_PRESETS.map((preset) => {
                const isActive =
                  loadout.chassis === preset.loadout.chassis &&
                  loadout.bogies === preset.loadout.bogies &&
                  loadout.restraints === preset.loadout.restraints &&
                  loadout.nose === preset.loadout.nose &&
                  loadout.booster === preset.loadout.booster &&
                  loadout.shell === preset.loadout.shell;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      soundEngine.playSnapPop();
                      onApplyPreset(preset.loadout);
                    }}
                    className={`truncate rounded-lg border px-1.5 py-1 text-left text-[9.5px] tracking-tight font-extrabold transition cursor-pointer ${
                      isActive
                        ? 'border-sky-400 bg-sky-400/20 text-sky-200'
                        : 'border-white/10 bg-slate-900/80 text-slate-300 hover:border-sky-400/50 hover:text-white'
                    }`}
                    title={`Equip ${preset.name}`}
                  >
                    {preset.emoji} {preset.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* BOTTOM DOCK: Category Tabs, Paint Swatches, Part Cards & BOARD BUTTON */}
      {/* ===================================================================== */}
      <div className="pointer-events-auto bg-slate-950/92 backdrop-blur-md border-2 border-sky-400/50 rounded-3xl p-2 sm:p-3 shadow-2xl flex flex-col gap-2">
        {/* Category Tabs + Paint Theme Swatches + Orbit Hint */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1">
            {COASTER_CATEGORY_TABS.map((tab) => {
              const isSelected = tab.id === activeCategory;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    soundEngine.playSnapPop();
                    onSelectCategory(tab.id);
                  }}
                  title={`${tab.label} (Key ${tab.keyHint})`}
                  className={`px-2.5 py-1 rounded-xl text-xs font-black transition flex items-center gap-1 cursor-pointer border ${
                    isSelected
                      ? 'bg-sky-400 text-slate-950 border-white shadow-md scale-102'
                      : 'bg-slate-800/90 hover:bg-slate-700 text-slate-200 border-white/10'
                  }`}
                >
                  <span>{tab.emoji}</span>
                  <span>{tab.label}</span>
                  <span className={`text-[9px] font-bold ${isSelected ? 'text-slate-800' : 'text-slate-400'}`}>
                    [{tab.keyHint}]
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            {/* Paint Swatches */}
            <div
              className="flex items-center gap-1.5 bg-slate-900/90 px-2.5 py-1 rounded-xl border border-white/10"
              title="Cycle Livery Paint (Key P)"
            >
              <span className="text-[11px] font-bold text-slate-400 mr-1">
                🎨 Livery <span className="text-[9px] font-mono opacity-75">[P]</span>:
              </span>
              {COASTER_PAINT_THEMES.map((theme) => {
                const active = loadout.paintId === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => {
                      soundEngine.playSnapPop();
                      onSelectPaint(theme.id);
                    }}
                    title={theme.name}
                    className={`w-4 h-4 rounded-full border-2 transition cursor-pointer ${
                      active ? 'border-white scale-125 shadow-md' : 'border-slate-600 opacity-80'
                    }`}
                    style={{
                      background: `linear-gradient(135deg, ${theme.primaryHex} 50%, ${theme.secondaryHex} 50%)`,
                    }}
                  />
                );
              })}
            </div>

            <span className="hidden xl:inline-block text-[10px] font-bold text-slate-400">
              🖱️ Drag 3D to Orbit • Scroll to Zoom • Click Sockets
            </span>
          </div>
        </div>

        {/* Part Cards Row + BOARD STATION Launch Button */}
        <div className="flex flex-col md:flex-row items-stretch gap-2.5">
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {categoryParts.map((part) => {
              const isEquipped = loadout[activeCategory] === part.id;
              const isUnlocked = part.costStars === 0 || unlockedPartIds.has(part.id);
              const canAfford = totalStars >= part.costStars;

              return (
                <button
                  key={part.id}
                  type="button"
                  onMouseEnter={() => setHoveredPartId(part.id)}
                  onMouseLeave={() => setHoveredPartId(null)}
                  onFocus={() => setHoveredPartId(part.id)}
                  onBlur={() => setHoveredPartId(null)}
                  onClick={() => onSelectPart(part)}
                  className={`relative flex flex-col justify-between p-2.5 rounded-2xl border-2 text-left transition cursor-pointer ${
                    isEquipped
                      ? 'bg-gradient-to-b from-sky-500/25 to-slate-900 border-sky-400 shadow-lg'
                      : isUnlocked
                      ? 'bg-slate-900/90 hover:bg-slate-800/85 border-white/12 hover:border-sky-300/60'
                      : canAfford
                      ? 'bg-amber-950/40 hover:bg-amber-900/40 border-amber-500/60'
                      : 'bg-slate-900/50 border-slate-800 opacity-65'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-xl">{part.emoji}</span>
                    {isEquipped ? (
                      <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded-full bg-sky-400 text-slate-950">
                        EQUIPPED
                      </span>
                    ) : !isUnlocked ? (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-slate-800 text-amber-300 border border-amber-400/40">
                        🔒 {part.costStars}⭐
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-1.5">
                    <div className="text-xs font-extrabold text-white leading-tight line-clamp-2">
                      {part.name}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      {part.massLbs} lbs · Clamp +{part.upstopClamp}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Part Micro-Description + Big Launch CTA */}
          <div className="md:w-72 flex flex-col justify-between gap-2 bg-slate-900/90 border border-white/10 rounded-2xl p-2.5">
            <div>
              <div className="flex items-center justify-between text-xs font-black text-white">
                <span className="truncate">
                  {displayPart.emoji} {displayPart.name}
                </span>
                <span className="text-sky-300 shrink-0 ml-1">
                  {displayPart.massLbs} lbs
                </span>
              </div>
              <p className="text-[10px] text-slate-300 leading-snug mt-0.5 line-clamp-2">
                {displayPart.funTip}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                soundEngine.playAirhorn();
                onStartRide();
              }}
              className="w-full py-2.5 px-4 rounded-2xl bg-gradient-to-r from-red-600 via-orange-500 to-amber-400 hover:from-red-500 hover:to-amber-300 active:scale-95 text-slate-950 font-display font-black text-sm sm:text-base tracking-wide uppercase shadow-xl border-2 border-yellow-200 transition cursor-pointer"
              title="Board Station & Launch Coaster (Space)"
            >
              BOARD STATION! 🎢
            </button>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* PRESETS & SAVED BUILDS MODAL                                          */}
      {/* ===================================================================== */}
      {showPresetsModal && (
        <div
          className="pointer-events-auto fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="coaster-presets-modal-heading"
          onClick={() => setShowPresetsModal(false)}
        >
          <div
            className="bg-slate-900 border-4 border-sky-400 rounded-3xl max-w-2xl w-full p-5 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/15 pb-2">
              <h2
                id="coaster-presets-modal-heading"
                className="font-display text-lg sm:text-xl font-black text-sky-300 flex items-center gap-2"
              >
                <span>🎢</span>
                <span>PRESETS &amp; SAVED BUILDS</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowPresetsModal(false)}
                className="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-black cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-sky-300 mb-2">
                Official Presets (4)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {COASTER_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      soundEngine.playSnapPop();
                      onApplyPreset(preset.loadout);
                      setShowPresetsModal(false);
                    }}
                    className="flex flex-col gap-1 p-3 rounded-2xl bg-slate-800/90 hover:bg-slate-800 border-2 border-white/15 hover:border-sky-400 text-left transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{preset.emoji}</span>
                      <span className="font-display font-black text-white text-sm">{preset.name}</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-snug">{preset.tagline}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-white/15 pt-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-amber-300 mb-2">
                Saved Builds (3 Slots)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[0, 1, 2].map((slotIdx) => {
                  const saved = savedBlueprints[slotIdx];
                  return (
                    <div
                      key={slotIdx}
                      className="flex flex-col justify-between gap-2 p-2.5 rounded-2xl bg-slate-950/80 border border-white/10"
                    >
                      <div>
                        <div className="text-xs font-bold text-white">
                          Slot #{slotIdx + 1}: {saved ? saved.name : 'Empty Bay'}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {saved ? `Saved ${saved.savedAt}` : 'Save current coaster setup'}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            soundEngine.playSnapPop();
                            onSaveBlueprintSlot(slotIdx);
                          }}
                          className="flex-1 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-[11px] font-black cursor-pointer"
                        >
                          Save Build
                        </button>
                        {saved && (
                          <button
                            type="button"
                            onClick={() => {
                              soundEngine.playSnapPop();
                              onLoadBlueprintSlot(slotIdx);
                              setShowPresetsModal(false);
                            }}
                            className="flex-1 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[11px] font-black cursor-pointer"
                          >
                            Load
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
