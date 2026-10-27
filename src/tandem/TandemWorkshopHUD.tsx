/**
 * Red Bull Tandem Bike Challenge (Game 4)
 * Tandem Workshop HUD & Interactive Dyno Rig Controls
 * File: src/tandem/TandemWorkshopHUD.tsx
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  TANDEM_CATEGORIES,
  TANDEM_CATEGORY_META,
  TANDEM_PAINT_THEMES,
  TANDEM_PRESETS,
  getTandemPartsByCategory,
  getTandemPartById,
  isPartUnlocked,
  computeTandemDynoMetrics,
} from './TandemPartCatalog.ts';
import type {
  TandemCategory,
  TandemLoadout,
  TandemDynoMetrics,
  TandemPaintThemeId,
} from './types.ts';
import { soundEngine } from '../audio/SoundEngine.ts';
import {
  Volume2,
  VolumeX,
  Zap,
  Shuffle,
  Sparkles,
  Lock,
  FolderOpen,
  Save,
  Trash2,
  Undo2,
  Redo2,
  AlertTriangle,
  RotateCcw,
  Sliders,
} from 'lucide-react';

export interface SavedTandemSlot {
  id: string;
  name: string;
  loadout: TandemLoadout;
  createdAt: number;
}

export interface TandemWorkshopHUDProps {
  loadout: TandemLoadout;
  metrics: TandemDynoMetrics;
  selectedCategory: TandemCategory;
  onSelectCategory: (cat: TandemCategory) => void;
  onEquipPart: (category: TandemCategory, partId: string) => void;
  onSelectPaint: (paintThemeId: TandemPaintThemeId | string) => void;
  onApplyPreset: (preset: TandemLoadout) => void;
  onRandomizeLoadout: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  totalStars: number;
  savedBuilds: SavedTandemSlot[];
  onSaveCurrentBuild: (customName?: string) => void;
  onDeleteSavedBuild: (id: string) => void;
  onLoadSavedBuild: (slot: SavedTandemSlot) => void;
  dynoActive: boolean;
  onToggleDyno: () => void;
  dynoTiltAngleDeg: number;
  onChangeDynoTiltAngle: (angleDeg: number) => void;
  onStartCourseRun: () => void;
  onReturnToHub: () => void;
  muted: boolean;
  onToggleMute: () => void;
  bestDistanceFeet?: number;
  bestTimeSec?: number | null;
}

export const TandemWorkshopHUD: React.FC<TandemWorkshopHUDProps> = ({
  loadout,
  metrics,
  selectedCategory,
  onSelectCategory,
  onEquipPart,
  onSelectPaint,
  onApplyPreset,
  onRandomizeLoadout,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  totalStars,
  savedBuilds,
  onSaveCurrentBuild,
  onDeleteSavedBuild,
  onLoadSavedBuild,
  dynoActive,
  onToggleDyno,
  dynoTiltAngleDeg,
  onChangeDynoTiltAngle,
  onStartCourseRun,
  onReturnToHub,
  muted,
  onToggleMute,
  bestDistanceFeet = 0,
  bestTimeSec = null,
}) => {
  const [showPresetsModal, setShowPresetsModal] = useState(false);
  const [hoveredPartId, setHoveredPartId] = useState<string | null>(null);
  const [customBuildName, setCustomBuildName] = useState('');
  const [autoRocking, setAutoRocking] = useState(false);
  const autoRockRef = useRef<number | null>(null);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        soundEngine.playSnapPop();
        if (showPresetsModal) {
          setShowPresetsModal(false);
        } else {
          onReturnToHub();
        }
      } else if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
        const catIdx = parseInt(e.key, 10) - 1;
        const cat = TANDEM_CATEGORIES[catIdx];
        if (cat) {
          soundEngine.playSnapPop();
          onSelectCategory(cat);
        }
      } else if (e.code === 'Space' && !showPresetsModal) {
        e.preventDefault();
        soundEngine.playAirhorn();
        onStartCourseRun();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedo && onRedo) onRedo();
        } else {
          if (canUndo && onUndo) onUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (canRedo && onRedo) onRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showPresetsModal, onReturnToHub, onSelectCategory, onStartCourseRun, canUndo, canRedo, onUndo, onRedo]);

  // Auto-rock simulation for Dyno Balance Rig
  useEffect(() => {
    if (!autoRocking) {
      if (autoRockRef.current) cancelAnimationFrame(autoRockRef.current);
      return;
    }
    const startTime = performance.now();
    const loop = (now: number) => {
      const elapsed = (now - startTime) / 1000;
      const angle = Math.sin(elapsed * 2.8) * Math.min(24, Math.max(10, metrics.rolloverThresholdDeg - 4));
      onChangeDynoTiltAngle(Number(angle.toFixed(1)));
      autoRockRef.current = requestAnimationFrame(loop);
    };
    autoRockRef.current = requestAnimationFrame(loop);
    return () => {
      if (autoRockRef.current) cancelAnimationFrame(autoRockRef.current);
    };
  }, [autoRocking, metrics.rolloverThresholdDeg, onChangeDynoTiltAngle]);

  const categoryParts = useMemo(
    () => getTandemPartsByCategory(selectedCategory),
    [selectedCategory]
  );

  const activePart = useMemo(
    () => getTandemPartById(loadout[`${selectedCategory}Id` as keyof TandemLoadout] as string, selectedCategory),
    [loadout, selectedCategory]
  );

  const hoveredPart = useMemo(
    () => (hoveredPartId ? getTandemPartById(hoveredPartId, selectedCategory) : null),
    [hoveredPartId, selectedCategory]
  );

  // Compute live preview metrics when hovering over an alternative part
  const previewMetrics = useMemo(() => {
    if (!hoveredPartId || hoveredPartId === (loadout[`${selectedCategory}Id` as keyof TandemLoadout] as string)) {
      return null;
    }
    const tentative = {
      ...loadout,
      [`${selectedCategory}Id`]: hoveredPartId,
    };
    return computeTandemDynoMetrics(tentative);
  }, [hoveredPartId, loadout, selectedCategory]);

  const displayMetrics = previewMetrics ?? metrics;

  // Metric deltas
  const stabilityDelta = previewMetrics ? previewMetrics.stabilityScore - metrics.stabilityScore : 0;
  const powerDelta = previewMetrics ? previewMetrics.stats.cadencePowerW - metrics.stats.cadencePowerW : 0;
  const agilityDelta = previewMetrics ? previewMetrics.agilityScore - metrics.agilityScore : 0;
  const massDelta = previewMetrics ? Number((previewMetrics.totalMassKg - metrics.totalMassKg).toFixed(1)) : 0;
  const rolloverDelta = previewMetrics ? Number((previewMetrics.rolloverThresholdDeg - metrics.rolloverThresholdDeg).toFixed(1)) : 0;

  // Weight distribution bias (Front vs Rear)
  const frontBiasPct = useMemo(() => {
    const total = displayMetrics.totalMassKg;
    const frontEstimate = 72 + (displayMetrics.stats.massKg - 140) * 0.48;
    return Math.max(35, Math.min(65, Math.round((frontEstimate / total) * 100)));
  }, [displayMetrics]);
  const rearBiasPct = 100 - frontBiasPct;

  // Critical tip warning
  const isRolloverRisk = Math.abs(dynoTiltAngleDeg) >= (displayMetrics.rolloverThresholdDeg - 2.0);
  const isWipeoutExceeded = Math.abs(dynoTiltAngleDeg) >= displayMetrics.rolloverThresholdDeg;

  // Status badge styling
  const statusColors: Record<TandemDynoMetrics['dynoStatus'], string> = {
    ultra_stable: 'bg-emerald-500/20 border-emerald-400 text-emerald-300',
    balanced: 'bg-sky-500/20 border-sky-400 text-sky-300',
    twitchy: 'bg-amber-500/20 border-amber-400 text-amber-300',
    top_heavy: 'bg-rose-500/20 border-rose-400 text-rose-300 animate-pulse',
  };

  const renderGauge = (
    label: string,
    valueStr: string,
    delta: number,
    percentVal: number,
    barColor: string
  ) => (
    <div className="flex flex-col gap-1 bg-slate-900/80 border border-slate-700/70 rounded-xl px-2.5 py-1.5 shadow-inner">
      <div className="flex items-center justify-between text-[11px] font-bold">
        <span className="text-slate-300">{label}</span>
        <span className="font-mono text-white">
          {valueStr}
          {delta !== 0 && (
            <span className={`ml-1 font-black ${delta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {delta > 0 ? `+${delta}` : delta}
            </span>
          )}
        </span>
      </div>
      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-200 ${barColor}`}
          style={{ width: `${Math.max(6, Math.min(100, percentVal))}%` }}
        />
      </div>
    </div>
  );

  return (
    <div
      data-testid="tandem-workshop-hud"
      className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 sm:p-4 select-none z-10"
    >
      {/* ===================================================================== */}
      {/* 1. TOP BAR: Return to Hub, Title, Best Scores, Stars & Dyno Toggle   */}
      {/* ===================================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Left: Arcade Hub & Title */}
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
              <span className="text-lg sm:text-xl">🚲</span>
              <h1 className="text-sm sm:text-base font-black tracking-tight text-white uppercase">
                Red Bull Tandem Lab
              </h1>
            </div>
            <p className="text-[10px] sm:text-xs text-amber-300 font-semibold">
              200-Ft Pier, Tilting Seesaws, Rhythm Whoops &amp; Finish Bell
            </p>
          </div>
        </div>

        {/* Right: Scores, Stars, Dyno, Presets, Undo/Redo & Audio */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 bg-slate-950/85 backdrop-blur-md border border-slate-700/80 rounded-2xl px-3 py-2 shadow-xl">
          <div className="flex items-center gap-3 px-2.5 py-1 bg-slate-900/90 rounded-xl border border-slate-800 text-xs font-mono">
            <div>
              <span className="text-slate-400 font-sans font-semibold">BEST: </span>
              <span className="text-amber-300 font-black">{bestDistanceFeet} FT</span>
            </div>
            <div className="h-3 w-px bg-slate-700" />
            <div>
              <span className="text-slate-400 font-sans font-semibold">TIME: </span>
              <span className="text-emerald-300 font-black">
                {bestTimeSec !== null ? `${bestTimeSec.toFixed(1)}s` : '--'}
              </span>
            </div>
            <div className="h-3 w-px bg-slate-700" />
            <div
              data-testid="workshop-star-counter"
              className="flex items-center gap-1 text-yellow-300 font-black font-sans"
              title="Shared Red Bull Judge Stars Pool"
            >
              <span>⭐</span>
              <span>{totalStars}</span>
            </div>
          </div>

          {/* Interactive Dyno Mode Toggle Switch */}
          <button
            type="button"
            data-testid="dyno-toggle-btn"
            onClick={() => {
              soundEngine.playRollersWhir();
              onToggleDyno();
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-black border transition cursor-pointer flex items-center gap-1.5 ${
              dynoActive
                ? 'bg-cyan-500 text-slate-950 border-cyan-300 shadow-lg shadow-cyan-500/40 animate-pulse'
                : 'bg-slate-800 hover:bg-slate-700 text-cyan-300 border-cyan-500/40'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{dynoActive ? '⚡ Dyno Rig: Active' : '⚡ Dyno Rig: Standby'}</span>
          </button>

          {/* Presets & Garage Button */}
          <button
            type="button"
            data-testid="presets-modal-btn"
            onClick={() => {
              soundEngine.playSnapPop();
              setShowPresetsModal(true);
            }}
            className="px-3 py-1.5 rounded-xl bg-indigo-600/90 hover:bg-indigo-500 text-white text-xs font-black border border-indigo-400/50 transition cursor-pointer flex items-center gap-1.5"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Presets &amp; Garage</span>
          </button>

          {/* Randomizer */}
          <button
            type="button"
            onClick={() => {
              soundEngine.playSnapPop();
              onRandomizeLoadout();
            }}
            className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-600 transition cursor-pointer"
            title="Randomize Tandem Build"
          >
            <Shuffle className="w-3.5 h-3.5" />
          </button>

          {/* Undo / Redo */}
          {onUndo && (
            <button
              type="button"
              disabled={!canUndo}
              onClick={() => {
                if (canUndo) {
                  soundEngine.playSnapPop();
                  onUndo();
                }
              }}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition ${
                canUndo
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-600 cursor-pointer'
                  : 'bg-slate-900/50 text-slate-600 border-slate-800 cursor-not-allowed'
              }`}
              title="Undo Part Swap (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
          )}

          {onRedo && (
            <button
              type="button"
              disabled={!canRedo}
              onClick={() => {
                if (canRedo) {
                  soundEngine.playSnapPop();
                  onRedo();
                }
              }}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition ${
                canRedo
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-600 cursor-pointer'
                  : 'bg-slate-900/50 text-slate-600 border-slate-800 cursor-not-allowed'
              }`}
              title="Redo Part Swap (Ctrl+Y)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Mute */}
          <button
            type="button"
            onClick={onToggleMute}
            className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-600 transition cursor-pointer"
            title={muted ? 'Unmute Audio' : 'Mute Audio'}
          >
            {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 2. MIDDLE: Interactive Dyno Telemetry Panel & Tilt Rig Controls      */}
      {/* ===================================================================== */}
      <div className="flex flex-col lg:flex-row items-start justify-between gap-3 my-auto pointer-events-none">
        {/* Left Telemetry Card */}
        <div className="pointer-events-auto w-full max-w-sm bg-slate-950/90 backdrop-blur-md border border-slate-700/80 rounded-2xl p-3 shadow-2xl flex flex-col gap-2.5">
          {/* Status Header */}
          <div className="flex items-center justify-between gap-2">
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider border ${
                statusColors[displayMetrics.dynoStatus]
              }`}
            >
              {displayMetrics.dynoStatusLabel}
            </span>
            <span className="text-[11px] font-mono font-bold text-slate-300">
              {displayMetrics.totalMassKg} kg (Bike {displayMetrics.bikeMassKg}kg + Crew 140kg)
              {massDelta !== 0 && (
                <span className={`ml-1 font-bold ${massDelta > 0 ? 'text-amber-400' : 'text-sky-300'}`}>
                  ({massDelta > 0 ? `+${massDelta}` : massDelta})
                </span>
              )}
            </span>
          </div>

          <p className="text-[11px] text-slate-300 leading-snug">
            {displayMetrics.dynoAdvice}
          </p>

          {/* 4 Core Telemetry Gauges */}
          <div className="grid grid-cols-2 gap-2">
            {renderGauge(
              'Cadence Power',
              `${displayMetrics.stats.cadencePowerW} W · ${Math.round(60 + (displayMetrics.stats.cadencePowerW / 700) * 80)} RPM`,
              powerDelta,
              displayMetrics.speedScore,
              'bg-amber-400'
            )}
            {renderGauge(
              'Rollover Limit',
              `±${displayMetrics.rolloverThresholdDeg}°`,
              rolloverDelta,
              Math.min(100, (displayMetrics.rolloverThresholdDeg / 40) * 100),
              'bg-cyan-400'
            )}
            {renderGauge(
              'Lateral Stability',
              `${displayMetrics.stabilityScore} / 100`,
              stabilityDelta,
              displayMetrics.stabilityScore,
              'bg-emerald-400'
            )}
            {renderGauge(
              'Steering Agility',
              `${displayMetrics.agilityScore} / 100`,
              agilityDelta,
              displayMetrics.agilityScore,
              'bg-indigo-400'
            )}
          </div>

          {/* Weight Distribution (Front vs Rear bias) */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-2 flex flex-col gap-1 text-[11px]">
            <div className="flex items-center justify-between font-bold">
              <span className="text-slate-400">Weight Distribution:</span>
              <span className="font-mono text-slate-200">
                Front {frontBiasPct}% | Rear {rearBiasPct}%
              </span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full flex overflow-hidden">
              <div className="bg-sky-400 transition-all duration-300" style={{ width: `${frontBiasPct}%` }} title="Front Bias (Captain 72kg + Fork)" />
              <div className="bg-amber-400 transition-all duration-300" style={{ width: `${rearBiasPct}%` }} title="Rear Bias (Stoker 68kg + Drive + Topper)" />
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>Captain (Front 72kg)</span>
              <span>Outriggers: {displayMetrics.stats.outriggerWidthFt.toFixed(1)} FT</span>
              <span>Stoker (Rear 68kg)</span>
            </div>
          </div>

          {/* Interactive Balance Tilt Rig Controls (Active when dynoActive is on) */}
          <div className="border-t border-slate-800/80 pt-2 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="text-cyan-300 flex items-center gap-1">
                <Sliders className="w-3.5 h-3.5" />
                <span>Tilt Balance Rig:</span>
              </span>
              <span
                data-testid="dyno-rollover-deg"
                className={`font-mono text-xs ${
                  isWipeoutExceeded
                    ? 'text-rose-400 font-black animate-pulse'
                    : isRolloverRisk
                    ? 'text-amber-300 font-bold'
                    : 'text-white'
                }`}
              >
                {dynoTiltAngleDeg > 0 ? `+${dynoTiltAngleDeg.toFixed(1)}°` : `${dynoTiltAngleDeg.toFixed(1)}°`}
              </span>
            </div>

            {/* Slider */}
            <input
              type="range"
              data-testid="dyno-tilt-slider"
              min="-35"
              max="35"
              step="0.5"
              value={dynoTiltAngleDeg}
              onChange={(e) => {
                setAutoRocking(false);
                onChangeDynoTiltAngle(parseFloat(e.target.value));
              }}
              className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
            />

            {/* Quick Tilt Action Buttons */}
            <div className="flex items-center gap-1.5 text-[10px] font-bold">
              <button
                type="button"
                onClick={() => {
                  setAutoRocking(false);
                  soundEngine.playSnapPop();
                  onChangeDynoTiltAngle(-15);
                }}
                className="flex-1 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
              >
                -15° Left
              </button>
              <button
                type="button"
                onClick={() => {
                  setAutoRocking(false);
                  soundEngine.playSnapPop();
                  onChangeDynoTiltAngle(0);
                }}
                className="flex-1 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 flex items-center justify-center gap-0.5 cursor-pointer"
              >
                <RotateCcw className="w-2.5 h-2.5" /> 0° Level
              </button>
              <button
                type="button"
                onClick={() => {
                  setAutoRocking(false);
                  soundEngine.playSnapPop();
                  onChangeDynoTiltAngle(15);
                }}
                className="flex-1 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
              >
                +15° Right
              </button>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playSnapPop();
                  setAutoRocking((prev) => !prev);
                }}
                className={`flex-1 py-1 rounded-lg border transition cursor-pointer ${
                  autoRocking
                    ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-black'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
              >
                {autoRocking ? '⏹ Stop' : '🔄 Rock'}
              </button>
            </div>

            {/* Hazard Rollover Callout */}
            {isWipeoutExceeded && (
              <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-rose-500/20 border border-rose-400 text-rose-300 text-[10px] font-black leading-tight animate-bounce">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>CRITICAL WIPEOUT! Roll exceeded ±{displayMetrics.rolloverThresholdDeg}°. Tandem would plunge into water!</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 3. BOTTOM DOCK: Categories, Paint Swatches, Part Cards & LAUNCH CTA  */}
      {/* ===================================================================== */}
      <div className="pointer-events-auto bg-slate-950/90 backdrop-blur-md border border-slate-700/80 rounded-2xl p-3 shadow-2xl flex flex-col gap-2.5">
        {/* Top of Dock: Category Tabs + Paint Theme Swatches */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* 6 Category Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            {TANDEM_CATEGORIES.map((cat) => {
              const meta = TANDEM_CATEGORY_META[cat];
              const isSelected = cat === selectedCategory;
              return (
                <button
                  key={cat}
                  type="button"
                  data-testid={`category-tab-${cat}`}
                  onClick={() => {
                    soundEngine.playSnapPop();
                    onSelectCategory(cat);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer border ${
                    isSelected
                      ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md shadow-amber-400/25'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
                  }`}
                >
                  <span>{meta.emoji}</span>
                  <span>{meta.shortLabel}</span>
                  <span className="text-[10px] opacity-65 font-mono">[{meta.keyHint}]</span>
                </button>
              );
            })}
          </div>

          {/* 6 Paint Theme Swatches */}
          <div className="flex items-center gap-1.5 bg-slate-900/90 px-2.5 py-1 rounded-xl border border-slate-800">
            <span className="text-[11px] font-bold text-slate-400 mr-1">🎨 Livery:</span>
            {TANDEM_PAINT_THEMES.map((theme) => {
              const active = loadout.paintThemeId === theme.id;
              return (
                <button
                  key={theme.id}
                  type="button"
                  data-testid={`paint-swatch-${theme.id}`}
                  onClick={() => {
                    soundEngine.playSnapPop();
                    onSelectPaint(theme.id);
                  }}
                  title={theme.name}
                  className={`w-5 h-5 rounded-full border-2 transition cursor-pointer ${
                    active ? 'border-white scale-125 shadow-md shadow-white/30' : 'border-slate-600 opacity-75 hover:opacity-100'
                  }`}
                  style={{
                    background: `linear-gradient(135deg, ${theme.primaryHex} 50%, ${theme.secondaryHex} 50%)`,
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Part Cards Grid & Launch CTA */}
        <div className="flex flex-col md:flex-row items-stretch gap-3">
          {/* Scrollable / Grid Part Cards */}
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 max-h-48 overflow-y-auto pr-1">
            {categoryParts.map((part) => {
              const currentId = loadout[`${selectedCategory}Id` as keyof TandemLoadout];
              const isEquipped = currentId === part.id;
              const unlocked = isPartUnlocked(part, totalStars);

              return (
                <button
                  key={part.id}
                  type="button"
                  data-testid={`part-card-${part.id}`}
                  onMouseEnter={() => setHoveredPartId(part.id)}
                  onMouseLeave={() => setHoveredPartId(null)}
                  onFocus={() => setHoveredPartId(part.id)}
                  onBlur={() => setHoveredPartId(null)}
                  onClick={() => {
                    if (unlocked) {
                      soundEngine.playSnapPop();
                      onEquipPart(selectedCategory, part.id);
                    }
                  }}
                  className={`relative flex flex-col justify-between p-2.5 rounded-xl border text-left transition cursor-pointer ${
                    isEquipped
                      ? 'bg-amber-400/20 border-amber-400 ring-2 ring-amber-400/40'
                      : unlocked
                      ? 'bg-slate-900/90 hover:bg-slate-800 border-slate-700'
                      : 'bg-slate-900/40 border-slate-800/80 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-xl">{part.emoji}</span>
                    {isEquipped ? (
                      <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-400 text-slate-950">
                        FIT
                      </span>
                    ) : !unlocked ? (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/40 flex items-center gap-0.5">
                        <Lock className="w-2.5 h-2.5" />
                        <span>{part.unlockStars}⭐</span>
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-1.5">
                    <div className="text-xs font-black text-white leading-tight line-clamp-1">
                      {part.name}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      {part.stats.massKg} kg · +{part.stats.cadencePowerW}W
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Part Overview & Prominent Red Bull Launch Button */}
          <div className="md:w-72 flex flex-col justify-between gap-2 bg-slate-900/90 border border-slate-700/80 rounded-xl p-2.5">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-black text-white">
                <span>{(hoveredPart ?? activePart)?.emoji}</span>
                <span className="truncate">{(hoveredPart ?? activePart)?.name}</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-snug mt-0.5 line-clamp-2">
                {(hoveredPart ?? activePart)?.description}
              </p>
              <div className="text-[10px] text-amber-300 font-bold mt-1 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>+{(hoveredPart ?? activePart)?.creativityBonus ?? 10} Creativity Bonus</span>
              </div>
            </div>

            {/* Launch CTA */}
            <button
              type="button"
              data-testid="launch-pier-btn"
              onClick={() => {
                soundEngine.playAirhorn();
                onStartCourseRun();
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-600 via-amber-500 to-yellow-400 hover:from-red-500 hover:to-yellow-300 active:scale-95 text-slate-950 font-black text-sm sm:text-base tracking-wider uppercase shadow-xl shadow-red-500/30 border-2 border-amber-200 transition cursor-pointer flex items-center justify-center gap-2"
            >
              <span>HIT THE PIER! 🚀</span>
            </button>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 4. PRESETS & SAVED BUILDS MODAL                                      */}
      {/* ===================================================================== */}
      {showPresetsModal && (
        <div className="pointer-events-auto fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-5 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <span>📋</span>
                <span>Tandem Presets &amp; Custom Saved Builds</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowPresetsModal(false)}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            {/* 4 Curated Presets */}
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-2">
                Official Red Bull Presets
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {TANDEM_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`preset-item-${preset.id}`}
                    onClick={() => {
                      soundEngine.playSnapPop();
                      onApplyPreset(preset.loadout);
                      setShowPresetsModal(false);
                    }}
                    className="flex flex-col gap-1 p-3 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-600/80 text-left transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{preset.emoji}</span>
                      <span className="font-black text-white text-sm">{preset.name}</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-snug">{preset.tagline}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Builds Persistence */}
            <div className="border-t border-slate-800 pt-3 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                  Custom Workshop Save Slots
                </h3>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Build name..."
                    value={customBuildName}
                    onChange={(e) => setCustomBuildName(e.target.value)}
                    className="px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playUnlockFanfare();
                      onSaveCurrentBuild(customBuildName || undefined);
                      setCustomBuildName('');
                    }}
                    className="px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Save className="w-3 h-3" /> Save Current
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {savedBuilds.map((slot) => (
                  <div
                    key={slot.id}
                    className="flex flex-col justify-between gap-2 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800"
                  >
                    <div>
                      <div className="text-xs font-bold text-white truncate">{slot.name}</div>
                      <div className="text-[10px] text-slate-400">
                        {new Date(slot.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          soundEngine.playSnapPop();
                          onLoadSavedBuild(slot);
                          setShowPresetsModal(false);
                        }}
                        className="flex-1 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold cursor-pointer"
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          soundEngine.playSnapPop();
                          onDeleteSavedBuild(slot.id);
                        }}
                        className="p-1 rounded-lg bg-rose-600/80 hover:bg-rose-500 text-white text-[11px] font-bold cursor-pointer"
                        title="Delete slot"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
                {savedBuilds.length === 0 && (
                  <div className="col-span-3 text-center text-xs text-slate-500 py-3">
                    No custom builds saved yet. Click &quot;Save Current&quot; to create your first build slot.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TandemWorkshopHUD;
