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
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [onReturnToHub, showPresetsModal]);

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
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 sm:p-4 select-none z-10">
      {/* ===================================================================== */}
      {/* TOP BAR: Arcade Hub Return, Title, Track Dyno, Blueprints & Records */}
      {/* ===================================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="pointer-events-auto flex items-center gap-2 bg-slate-950/85 backdrop-blur-md border border-slate-700/80 rounded-2xl px-3 py-2 shadow-xl">
          <button
            type="button"
            onClick={() => {
              soundEngine.playSnapPop();
              onReturnToHub();
            }}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-100 text-xs sm:text-sm font-extrabold border border-slate-600 transition cursor-pointer"
          >
            ◀ Arcade Hub
          </button>

          <div className="pl-1 pr-2 border-l border-slate-700">
            <div className="flex items-center gap-1.5">
              <span className="text-lg sm:text-xl">🎢</span>
              <h1 className="text-sm sm:text-base font-black tracking-tight text-white uppercase">
                Red Bull Coaster Lab
              </h1>
            </div>
            <p className="text-[10px] sm:text-xs text-sky-300 font-semibold">
              2,000-Ft Loop, Helix, 32-Ft Rail Gap &amp; Golden Bullseye Brake Run
            </p>
          </div>
        </div>

        {/* Center/Right Controls: Records, Stars, Dyno, Presets, Undo/Redo, Mute */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 bg-slate-950/85 backdrop-blur-md border border-slate-700/80 rounded-2xl px-3 py-2 shadow-xl">
          <div className="flex items-center gap-3 px-2 py-0.5 bg-slate-900/90 rounded-xl border border-slate-800 text-xs">
            <div>
              <span className="text-slate-400 font-semibold">BEST: </span>
              <span className="text-amber-300 font-black">{bestDistanceFeet} FT</span>
            </div>
            <div className="h-3 w-px bg-slate-700" />
            <div>
              <span className="text-slate-400 font-semibold">HIGH SCORE: </span>
              <span className="text-emerald-300 font-black">{bestThrillScore} PTS</span>
            </div>
            <div className="h-3 w-px bg-slate-700" />
            <div className="flex items-center gap-1 text-yellow-300 font-black">
              <span>⭐</span>
              <span>{totalStars}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              soundEngine.playRollersWhir();
              onToggleDyno();
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
              dynoActive
                ? 'bg-cyan-500 text-slate-950 border-cyan-300 shadow-lg shadow-cyan-500/30'
                : 'bg-slate-800 hover:bg-slate-700 text-cyan-300 border-cyan-500/40'
            }`}
          >
            {dynoActive ? '⚡ Track Dyno ON' : '⚡ Track Dyno'}
          </button>

          <button
            type="button"
            onClick={() => {
              soundEngine.playSnapPop();
              setShowPresetsModal(true);
            }}
            className="px-3 py-1.5 rounded-xl bg-indigo-600/90 hover:bg-indigo-500 text-white text-xs font-extrabold border border-indigo-400/50 transition cursor-pointer"
          >
            📋 Blueprints
          </button>

          <button
            type="button"
            onClick={() => {
              soundEngine.playSnapPop();
              onRandomize();
            }}
            className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-600 transition cursor-pointer"
            title="Randomize Coaster Build"
          >
            🎲 Random
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
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition ${
                canUndo
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-600 cursor-pointer'
                  : 'bg-slate-900/50 text-slate-600 border-slate-800 cursor-not-allowed'
              }`}
              title="Undo Part Swap (Ctrl+Z)"
            >
              ↩ Undo
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
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition ${
                canRedo
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-600 cursor-pointer'
                  : 'bg-slate-900/50 text-slate-600 border-slate-800 cursor-not-allowed'
              }`}
              title="Redo Part Swap (Ctrl+Y)"
            >
              ↪ Redo
            </button>
          )}

          <button
            type="button"
            onClick={onToggleMute}
            className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-600 transition cursor-pointer"
            title={muted ? 'Unmute Audio' : 'Mute Audio'}
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* MIDDLE LEFT: Coaster Engineering Telemetry & Upstop Clamp Diagnostics */}
      {/* ===================================================================== */}
      <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-3 my-auto">
        <div className="pointer-events-auto w-full max-w-xs bg-slate-950/85 backdrop-blur-md border border-slate-700/80 rounded-2xl p-3 shadow-2xl flex flex-col gap-2">
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
        </div>
      </div>

      {/* ===================================================================== */}
      {/* BOTTOM DOCK: Category Tabs, Paint Swatches, Part Cards & BOARD BUTTON */}
      {/* ===================================================================== */}
      <div className="pointer-events-auto bg-slate-950/90 backdrop-blur-md border border-slate-700/80 rounded-2xl p-3 shadow-2xl flex flex-col gap-2.5">
        {/* Category Tabs + Paint Theme Swatches + Selected Part Info */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
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
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer border ${
                    isSelected
                      ? 'bg-sky-500 text-slate-950 border-sky-300 shadow-md shadow-sky-500/25'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
                  }`}
                >
                  <span>{tab.emoji}</span>
                  <span>{tab.label}</span>
                  <span className="text-[10px] opacity-65 font-mono">[{tab.keyHint}]</span>
                </button>
              );
            })}
          </div>

          {/* Paint Swatches */}
          <div className="flex items-center gap-1.5 bg-slate-900/90 px-2.5 py-1 rounded-xl border border-slate-800">
            <span className="text-[11px] font-bold text-slate-400 mr-1">🎨 Livery:</span>
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
                  className={`w-5 h-5 rounded-full border-2 transition cursor-pointer ${
                    active ? 'border-white scale-125 shadow-md' : 'border-slate-600 opacity-80'
                  }`}
                  style={{
                    background: `linear-gradient(135deg, ${theme.primaryHex} 50%, ${theme.secondaryHex} 50%)`,
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Part Cards Row + BOARD STATION Launch Button */}
        <div className="flex flex-col md:flex-row items-stretch gap-3">
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
                  className={`relative flex flex-col justify-between p-2.5 rounded-xl border text-left transition cursor-pointer ${
                    isEquipped
                      ? 'bg-sky-500/20 border-sky-400 ring-2 ring-sky-400/40'
                      : isUnlocked
                      ? 'bg-slate-900/90 hover:bg-slate-800 border-slate-700'
                      : canAfford
                      ? 'bg-amber-950/40 hover:bg-amber-900/40 border-amber-500/60'
                      : 'bg-slate-900/50 border-slate-800 opacity-65'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-xl">{part.emoji}</span>
                    {isEquipped ? (
                      <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-sky-400 text-slate-950">
                        FIT
                      </span>
                    ) : !isUnlocked ? (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/40">
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
          <div className="md:w-72 flex flex-col justify-between gap-2 bg-slate-900/90 border border-slate-700/80 rounded-xl p-2.5">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-black text-white">
                <span>{displayPart.emoji}</span>
                <span className="truncate">{displayPart.name}</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-snug mt-0.5 line-clamp-2">
                {displayPart.funTip}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                soundEngine.playAirhorn();
                onStartRide();
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-600 via-orange-500 to-amber-400 hover:from-red-500 hover:to-amber-300 active:scale-98 text-slate-950 font-black text-sm sm:text-base tracking-wide uppercase shadow-lg shadow-orange-500/30 border border-amber-200 transition cursor-pointer"
            >
              BOARD STATION! 🎢
            </button>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* PRESETS & SAVED BLUEPRINTS MODAL */}
      {/* ===================================================================== */}
      {showPresetsModal && (
        <div className="pointer-events-auto fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-5 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <span>📋</span>
                <span>Coaster Engineering Blueprints &amp; Saved Trains</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowPresetsModal(false)}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

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
                  className="flex flex-col gap-1 p-3 rounded-xl bg-slate-800/90 hover:bg-slate-750 border border-slate-600/80 text-left transition cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{preset.emoji}</span>
                    <span className="font-black text-white text-sm">{preset.name}</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-snug">{preset.tagline}</p>
                </button>
              ))}
            </div>

            <div className="border-t border-slate-800 pt-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-2">
                Custom Workshop Save Slots
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[0, 1, 2].map((slotIdx) => {
                  const saved = savedBlueprints[slotIdx];
                  return (
                    <div
                      key={slotIdx}
                      className="flex flex-col justify-between gap-2 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800"
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
                          className="flex-1 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold cursor-pointer"
                        >
                          Save
                        </button>
                        {saved && (
                          <button
                            type="button"
                            onClick={() => {
                              soundEngine.playSnapPop();
                              onLoadBlueprintSlot(slotIdx);
                              setShowPresetsModal(false);
                            }}
                            className="flex-1 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold cursor-pointer"
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
