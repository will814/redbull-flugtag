import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  getSoapboxPartById,
  getSoapboxPartsByCategory,
  SOAPBOX_CATEGORIES,
  SOAPBOX_PAINT_THEMES,
  SOAPBOX_PRESETS,
  SoapboxLoadout,
  SoapboxPaintThemeId,
  SoapboxPartCategory,
} from './SoapboxPartCatalog';
import {
  ComputedSoapboxMetrics,
  computeSoapboxMetrics,
} from './SoapboxMetrics';
import {
  Volume2,
  VolumeX,
  Activity,
  Shuffle,
  Sparkles,
  Lock,
  FolderOpen,
  Save,
  Trash2,
  Check,
  Undo2,
  Redo2,
  ChevronDown,
  ChevronUp,
  Flag,
  X,
} from 'lucide-react';
import {
  SoapboxCourseId,
  SOAPBOX_COURSE_LIST,
  getSoapboxCourse,
} from './SoapboxCourses';

export interface SavedSoapboxSlot {
  id: string;
  name: string;
  loadout: SoapboxLoadout;
  createdAt: number;
}

interface SoapboxGarageHUDProps {
  selectedCourseId: SoapboxCourseId;
  onSelectCourse: (courseId: SoapboxCourseId) => void;
  loadout: SoapboxLoadout;
  metrics: ComputedSoapboxMetrics;
  selectedCategory: SoapboxPartCategory;
  onSelectCategory: (cat: SoapboxPartCategory) => void;
  onEquipPart: (category: SoapboxPartCategory, partId: string) => void;
  onSelectPaint: (paintId: SoapboxPaintThemeId) => void;
  onApplyPreset: (preset: SoapboxLoadout) => void;
  onRandomizeSoapbox: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  savedBuilds: SavedSoapboxSlot[];
  onSaveCurrentBuild: (customName?: string) => void;
  onDeleteSavedBuild: (id: string) => void;
  shakerRigActive: boolean;
  onToggleShakerRig: () => void;
  onStartRace: () => void;
  onReturnToHub: () => void;
  totalStars: number;
  bestRecordFeet: number;
  bestTimeSec: number | null;
  muted: boolean;
  onToggleMute: () => void;
}

export const SoapboxGarageHUD: React.FC<SoapboxGarageHUDProps> = React.memo(({
  selectedCourseId,
  onSelectCourse,
  loadout,
  metrics,
  selectedCategory,
  onSelectCategory,
  onEquipPart,
  onSelectPaint,
  onApplyPreset,
  onRandomizeSoapbox,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  savedBuilds,
  onSaveCurrentBuild,
  onDeleteSavedBuild,
  shakerRigActive,
  onToggleShakerRig,
  onStartRace,
  onReturnToHub,
  totalStars,
  bestRecordFeet,
  bestTimeSec,
  muted,
  onToggleMute,
}) => {
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [showGarageModal, setShowGarageModal] = useState(false);
  const [showPaintDrawer, setShowPaintDrawer] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [hoveredPartId, setHoveredPartId] = useState<string | null>(null);
  const [customBuildName, setCustomBuildName] = useState('');
  const [justSavedToast, setJustSavedToast] = useState(false);
  const toastTimerRef = useRef<number | null>(null);
  const activePartCardRef = useRef<HTMLButtonElement | null>(null);

  const activeCourse = useMemo(
    () => getSoapboxCourse(selectedCourseId),
    [selectedCourseId]
  );

  const categoryParts = useMemo(
    () => getSoapboxPartsByCategory(selectedCategory),
    [selectedCategory]
  );
  const currentEquippedId = loadout[selectedCategory];

  const hoveredPart = useMemo(
    () =>
      hoveredPartId && !showPaintDrawer
        ? categoryParts.find((p) => p.id === hoveredPartId) ?? null
        : null,
    [hoveredPartId, showPaintDrawer, categoryParts]
  );

  const previewMetrics = useMemo(() => {
    if (!hoveredPart || hoveredPart.id === currentEquippedId) {
      return null;
    }
    return computeSoapboxMetrics({ ...loadout, [selectedCategory]: hoveredPart.id });
  }, [hoveredPart, currentEquippedId, loadout, selectedCategory]);

  const displayMetrics = previewMetrics ?? metrics;
  const speedDelta = previewMetrics ? previewMetrics.speedScore - metrics.speedScore : 0;
  const gripDelta = previewMetrics ? previewMetrics.gripScore - metrics.gripScore : 0;
  const stabilityDelta = previewMetrics
    ? previewMetrics.rolloverStabilityIndex - metrics.rolloverStabilityIndex
    : 0;
  const suspDelta = previewMetrics
    ? previewMetrics.suspensionScore - metrics.suspensionScore
    : 0;
  const brakeDelta = previewMetrics ? previewMetrics.brakeScore - metrics.brakeScore : 0;
  const massDelta = previewMetrics
    ? previewMetrics.totalMassLbs - metrics.totalMassLbs
    : 0;
  const cgHeightDelta = previewMetrics
    ? Number((previewMetrics.cgHeightMeters - metrics.cgHeightMeters).toFixed(2))
    : 0;
  const trackWidthDelta = previewMetrics
    ? Number((previewMetrics.trackWidthMeters - metrics.trackWidthMeters).toFixed(2))
    : 0;
  const tipLimitDelta = previewMetrics
    ? Math.round(previewMetrics.criticalRolloverDeg) - Math.round(metrics.criticalRolloverDeg)
    : 0;

  useEffect(() => {
    if (!showPaintDrawer && !dockCollapsed && activePartCardRef.current) {
      activePartCardRef.current.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }
  }, [selectedCategory, showPaintDrawer, dockCollapsed]);

  useEffect(() => {
    setShowPaintDrawer(false);
    setDockCollapsed(false);
    setHoveredPartId(null);
  }, [selectedCategory]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (isInput) {
        if (e.code === 'Escape') {
          e.preventDefault();
          (target as HTMLElement).blur();
        }
        return;
      }

      if (e.code === 'Escape') {
        e.preventDefault();
        if (showCourseModal) {
          setShowCourseModal(false);
        } else if (showGarageModal) {
          setShowGarageModal(false);
        } else if (showPaintDrawer) {
          setShowPaintDrawer(false);
        } else {
          onReturnToHub();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault();
        if (e.shiftKey) {
          onRedo();
        } else {
          onUndo();
        }
        return;
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
        e.preventDefault();
        onRedo();
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey || showCourseModal) return;

      if (e.code === 'KeyG') {
        e.preventDefault();
        setShowGarageModal((v) => !v);
        return;
      }

      if (showGarageModal) return;

      if (['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].includes(e.code)) {
        const idx = parseInt(e.code.replace('Digit', ''), 10) - 1;
        const cat = SOAPBOX_CATEGORIES[idx];
        if (cat) {
          setShowPaintDrawer(false);
          setDockCollapsed(false);
          onSelectCategory(cat.id);
        }
      } else if (e.code === 'KeyP') {
        e.preventDefault();
        setShowPaintDrawer((p) => !p);
        setDockCollapsed(false);
      } else if (e.code === 'KeyW') {
        e.preventDefault();
        onToggleShakerRig();
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        onRandomizeSoapbox();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        onToggleMute();
      } else if (e.code === 'Space') {
        if (document.activeElement instanceof HTMLButtonElement) return;
        e.preventDefault();
        onStartRace();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    showCourseModal,
    showGarageModal,
    showPaintDrawer,
    onReturnToHub,
    onUndo,
    onRedo,
    onSelectCategory,
    onToggleShakerRig,
    onRandomizeSoapbox,
    onToggleMute,
    onStartRace,
  ]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const handleSaveBuildClick = () => {
    onSaveCurrentBuild(customBuildName.trim() || undefined);
    setCustomBuildName('');
    setJustSavedToast(true);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setJustSavedToast(false);
    }, 1800);
  };

  const handlingBadge = useMemo(() => {
    switch (displayMetrics.handlingStatus) {
      case 'tippy':
        return {
          label: '⚠️ TIPPY — HIGH ROLLOVER RISK!',
          cls: 'bg-rose-500/25 border-rose-400 text-rose-200',
        };
      case 'drift_happy':
        return {
          label: '🌀 DRIFT-HAPPY POWER-SLIDER',
          cls: 'bg-purple-500/25 border-purple-400 text-purple-200',
        };
      case 'understeer':
        return {
          label: '🛞 HEAVY PLOW / UNDERSTEER',
          cls: 'bg-amber-500/25 border-amber-400 text-amber-200',
        };
      default:
        return {
          label: '✅ PLANTED APEX CORNERING',
          cls: 'bg-emerald-500/25 border-emerald-400 text-emerald-200',
        };
    }
  }, [displayMetrics.handlingStatus]);

  const activeCategoryPart = useMemo(
    () =>
      hoveredPart ??
      categoryParts.find((p) => p.id === currentEquippedId) ??
      categoryParts[0],
    [hoveredPart, categoryParts, currentEquippedId]
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-2 sm:p-3.5">
      {/* ==================================================================== */}
      {/* TOP BAR: UNIFIED WORKSHOP HEADER & CONTROLS                          */}
      {/* ==================================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Left: Arcade Hub Back Button + Event Title */}
        <div className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-slate-900/90 border border-white/15 px-3 py-1.5 shadow-xl backdrop-blur-md">
          <button
            type="button"
            onClick={onReturnToHub}
            className="flex items-center gap-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/15 px-2.5 py-1 text-xs font-extrabold text-amber-300 transition active:scale-95 cursor-pointer"
            title="Return to Arcade Hub (Esc)"
          >
            ◀ Arcade Hub
          </button>
          <div className="h-5 w-px bg-white/15" />
          <div className="flex items-center gap-2">
            <span className="text-xl">🏎️</span>
            <div>
              <h1 className="font-display text-xs sm:text-sm font-black tracking-wide text-white uppercase leading-none">
                Red Bull Soap Box Workshop
              </h1>
              <div className="text-[10px] font-bold text-amber-300/90">
                Gravity Racer Engineering &amp; Downhill Tuning
              </div>
            </div>
          </div>
        </div>

        {/* Right: Course Pill, Best & Stars, Shaker Rig, Presets & Builds, Random, Undo/Redo, Mute */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-2xl bg-slate-900/90 border border-white/15 px-2.5 py-1.5 shadow-xl backdrop-blur-md">
          {/* Course Selector Button */}
          <button
            type="button"
            onClick={() => setShowCourseModal(true)}
            className="flex items-center gap-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/60 px-2.5 py-1 text-xs font-black text-amber-200 transition active:scale-95 cursor-pointer"
            title="Choose Downhill Course"
          >
            <span>📍 {activeCourse.emoji}</span>
            <span>{activeCourse.name}</span>
            <span className="text-[10px] text-amber-300/80 hidden xl:inline">
              ({activeCourse.lengthFeet.toLocaleString()} FT)
            </span>
          </button>

          {/* Best Record & Shared Stars */}
          <div className="flex items-center gap-2 rounded-xl bg-slate-950/80 border border-white/10 px-2.5 py-1 text-xs font-black">
            <span className="text-amber-300">BEST: {bestRecordFeet} FT</span>
            {bestTimeSec !== null && (
              <>
                <span className="text-slate-600">|</span>
                <span className="text-emerald-300">TIME: {bestTimeSec.toFixed(1)}s</span>
              </>
            )}
            <span className="text-slate-600">|</span>
            <span className="text-yellow-300">⭐ {totalStars}</span>
          </div>

          {/* Shaker Dyno Rig Toggle */}
          <button
            type="button"
            onClick={onToggleShakerRig}
            className={`flex items-center gap-1 rounded-xl border px-2.5 py-1 text-xs font-black transition active:scale-95 cursor-pointer ${
              shakerRigActive
                ? 'bg-cyan-400 text-slate-950 border-white shadow-md'
                : 'bg-slate-800 hover:bg-slate-700 text-cyan-300 border-cyan-400/40'
            }`}
            title="Toggle Hydraulic Shaker & Rollover Tilt Rig (W)"
          >
            <Activity className="h-3.5 w-3.5" />
            <span>{shakerRigActive ? 'Shaker Rig: ON' : 'Shaker Rig'}</span>
          </button>

          {/* Presets & Saved Builds Modal */}
          <button
            type="button"
            onClick={() => setShowGarageModal(true)}
            className="flex items-center gap-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-amber-400/40 px-2.5 py-1 text-xs font-black text-amber-300 transition active:scale-95 cursor-pointer"
            title="Presets & Saved Builds (G)"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            <span>Presets &amp; Builds</span>
          </button>

          {/* Randomize */}
          <button
            type="button"
            onClick={onRandomizeSoapbox}
            className="flex items-center gap-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-purple-400/40 px-2 py-1 text-xs font-black text-purple-300 transition active:scale-95 cursor-pointer"
            title="Randomize Unlocked Parts (R)"
          >
            <Shuffle className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Random</span>
          </button>

          {/* Undo / Redo */}
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-35 border border-white/10 p-1.5 text-slate-200 transition cursor-pointer disabled:cursor-not-allowed"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className="rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-35 border border-white/10 p-1.5 text-slate-200 transition cursor-pointer disabled:cursor-not-allowed"
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>

          {/* Mute Toggle */}
          <button
            type="button"
            onClick={onToggleMute}
            className="rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/15 p-1.5 text-slate-200 transition cursor-pointer"
            title={muted ? 'Unmute Audio (M)' : 'Mute Audio (M)'}
          >
            {muted ? <VolumeX className="h-3.5 w-3.5 text-rose-400" /> : <Volume2 className="h-3.5 w-3.5 text-emerald-400" />}
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* MIDDLE LEFT: AUTOMOTIVE TELEMETRY & ROLLOVER STABILITY CARD          */}
      {/* ==================================================================== */}
      <div className="my-auto flex items-center justify-between pointer-events-none">
        <div className="pointer-events-auto w-[320px] sm:w-[376px] rounded-2xl bg-slate-950/88 border-2 border-white/15 p-2.5 sm:p-3 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between gap-1.5 border-b border-white/10 pb-1.5 mb-2">
            <span className="text-[11px] sm:text-xs font-black tracking-wide text-amber-300 uppercase truncate">
              {previewMetrics && hoveredPart
                ? `${hoveredPart.emoji} ${hoveredPart.name}`
                : loadout.name}
            </span>
            <span className="shrink-0 rounded-md bg-slate-800 px-1.5 py-0.5 text-[11px] font-black text-slate-200">
              ⚖️ {displayMetrics.totalMassLbs} lbs
              {massDelta !== 0 && (
                <span className={massDelta > 0 ? 'text-amber-300 ml-1' : 'text-emerald-300 ml-1'}>
                  ({massDelta > 0 ? `+${massDelta}` : massDelta})
                </span>
              )}
            </span>
          </div>

          {/* 5 Core Automotive Stat Bars with Live Hover Deltas */}
          <div className="space-y-1.5 text-[11px] font-extrabold">
            {[
              {
                label: '💨 Downhill Speed',
                val: displayMetrics.speedScore,
                delta: speedDelta,
                barCls: 'bg-sky-400',
              },
              {
                label: '🛞 Cornering Grip',
                val: displayMetrics.gripScore,
                delta: gripDelta,
                barCls: 'bg-emerald-400',
              },
              {
                label: '⚖️ Rollover Stability',
                val: displayMetrics.rolloverStabilityIndex,
                delta: stabilityDelta,
                barCls:
                  displayMetrics.rolloverStabilityIndex < 46
                    ? 'bg-rose-500'
                    : 'bg-amber-400',
              },
              {
                label: '🔩 Shocks & Cobbles',
                val: displayMetrics.suspensionScore,
                delta: suspDelta,
                barCls: 'bg-purple-400',
              },
              {
                label: '🛑 Brakes & Armor',
                val: displayMetrics.brakeScore,
                delta: brakeDelta,
                barCls: 'bg-red-400',
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

          {/* Center of Gravity Height, Track Width & SSF Readout */}
          <div className="mt-2.5 grid grid-cols-3 gap-1 rounded-xl bg-slate-900/95 border border-white/10 p-1.5 text-center text-[10px] font-bold">
            <div>
              <div className="text-slate-400">CoG Height</div>
              <div className="text-xs font-black text-yellow-300">
                {displayMetrics.cgHeightMeters.toFixed(2)}m
                {cgHeightDelta !== 0 && (
                  <span
                    className={
                      cgHeightDelta < 0 ? 'text-emerald-300 ml-0.5' : 'text-rose-400 ml-0.5'
                    }
                  >
                    ({cgHeightDelta > 0 ? `+${cgHeightDelta}` : cgHeightDelta})
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Track Width</div>
              <div className="text-xs font-black text-cyan-300">
                {displayMetrics.trackWidthMeters.toFixed(2)}m
                {trackWidthDelta !== 0 && (
                  <span
                    className={
                      trackWidthDelta > 0 ? 'text-emerald-300 ml-0.5' : 'text-rose-400 ml-0.5'
                    }
                  >
                    ({trackWidthDelta > 0 ? `+${trackWidthDelta}` : trackWidthDelta})
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Tip Limit</div>
              <div className="text-xs font-black text-emerald-300">
                {Math.round(displayMetrics.criticalRolloverDeg)}°
                {tipLimitDelta !== 0 && (
                  <span
                    className={
                      tipLimitDelta > 0 ? 'text-emerald-300 ml-0.5' : 'text-rose-400 ml-0.5'
                    }
                  >
                    ({tipLimitDelta > 0 ? `+${tipLimitDelta}` : tipLimitDelta}°)
                  </span>
                )}
              </div>
            </div>
          </div>

          <div
            className={`mt-2 rounded-xl border px-2 py-1 text-center text-[10px] font-black ${handlingBadge.cls}`}
          >
            {handlingBadge.label}
          </div>

          {/* 1-Click Quick Builds Grid */}
          <div className="mt-2 border-t border-white/10 pt-2">
            <div className="mb-1 flex items-center justify-between text-[9px] font-black uppercase tracking-wider text-slate-400">
              <span>⚡ Quick Builds:</span>
              <span>1-Click Equip</span>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {SOAPBOX_PRESETS.map((preset) => {
                const isActivePreset =
                  loadout.chassis === preset.chassis &&
                  loadout.wheels === preset.wheels &&
                  loadout.steering === preset.steering &&
                  loadout.suspension === preset.suspension &&
                  loadout.brakes === preset.brakes &&
                  loadout.topper === preset.topper;
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => onApplyPreset(preset)}
                    className={`truncate rounded-lg border px-1.5 py-1 text-left text-[9.5px] tracking-tight font-extrabold transition cursor-pointer ${
                      isActivePreset
                        ? 'border-amber-400 bg-amber-400/20 text-amber-200'
                        : 'border-white/10 bg-slate-900/80 text-slate-300 hover:border-amber-400/50 hover:text-white'
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

      {/* ==================================================================== */}
      {/* BOTTOM DOCK: 6 AUTOMOTIVE CATEGORY TABS, PART CARDS & LAUNCH CTA     */}
      {/* ==================================================================== */}
      <div className="pointer-events-auto flex flex-col gap-1.5 rounded-3xl bg-slate-950/92 border-2 border-amber-400/50 p-2 sm:p-3 shadow-2xl backdrop-blur-md">
        {/* Category Tabs Row + Paint Livery & Collapse Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex flex-wrap items-center gap-1">
            {SOAPBOX_CATEGORIES.map((cat, idx) => {
              const isSelected = selectedCategory === cat.id && !showPaintDrawer;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setShowPaintDrawer(false);
                    setDockCollapsed(false);
                    onSelectCategory(cat.id);
                  }}
                  title={`${cat.label} (Key ${idx + 1})`}
                  className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-black transition cursor-pointer ${
                    isSelected
                      ? 'bg-amber-400 text-slate-950 shadow-md scale-102'
                      : 'bg-slate-800/90 text-slate-200 hover:bg-slate-700 border border-white/10'
                  }`}
                >
                  <span>{cat.emoji}</span>
                  <span>{cat.shortLabel}</span>
                  <span className={`text-[9px] font-bold ${isSelected ? 'text-slate-800' : 'text-slate-400'}`}>
                    [{idx + 1}]
                  </span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => {
                setShowPaintDrawer((p) => !p);
                setDockCollapsed(false);
              }}
              className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-black transition cursor-pointer ${
                showPaintDrawer
                  ? 'bg-pink-500 text-white shadow-md'
                  : 'bg-slate-800/90 text-pink-300 hover:bg-slate-700 border border-pink-400/30'
              }`}
              title="Toggle Paint Livery Swatches (P)"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Paint</span>
              <span className="text-[9px] font-bold opacity-80">[P]</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden lg:inline-block text-[10px] font-bold text-slate-400">
              🖱️ Drag 3D to Orbit • Scroll to Zoom • Click Sockets
            </span>
            {dockCollapsed && (
              <button
                type="button"
                onClick={onStartRace}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-red-600 via-orange-500 to-amber-400 border border-yellow-200 px-3 py-1 text-xs font-black text-slate-950 shadow-lg active:scale-95 transition cursor-pointer"
                title="Start Downhill Derby Run (Space)"
              >
                <Flag className="h-3.5 w-3.5 fill-slate-950" />
                <span>DROP THE GATE! 🏁</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setDockCollapsed((c) => !c)}
              className="rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-white/10 p-1.5 text-slate-300 cursor-pointer"
              title={dockCollapsed ? 'Expand Part Dock' : 'Collapse Part Dock'}
            >
              {dockCollapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Paint Theme Swatches or Horizontal Part Cards + Bottom-Right Launch CTA */}
        {!dockCollapsed && (
          <div className="flex flex-col md:flex-row items-stretch gap-2 pt-0.5">
            <div className="flex-1 min-w-0">
              {showPaintDrawer ? (
                <div className="flex items-center gap-2 overflow-x-auto py-1 no-scrollbar">
                  {SOAPBOX_PAINT_THEMES.map((theme) => {
                    const active = loadout.paintTheme === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => onSelectPaint(theme.id)}
                        className={`flex shrink-0 items-center gap-2 rounded-2xl border-2 px-3 py-2 text-xs font-black transition cursor-pointer ${
                          active
                            ? 'bg-slate-800 border-amber-400 text-white shadow-lg'
                            : 'bg-slate-900/90 border-white/10 text-slate-300 hover:border-white/30'
                        }`}
                      >
                        <span className="flex items-center gap-1">
                          <span
                            className="h-4 w-4 rounded-full border border-white/40"
                            style={{ backgroundColor: theme.bodyHex }}
                          />
                          <span
                            className="h-4 w-4 rounded-full border border-white/40"
                            style={{ backgroundColor: theme.trimHex }}
                          />
                          <span
                            className="h-4 w-4 rounded-full border border-white/40"
                            style={{ backgroundColor: theme.accentHex }}
                          />
                        </span>
                        <span>{theme.name}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-stretch gap-2 overflow-x-auto py-1 no-scrollbar">
                  {categoryParts.map((part) => {
                    const isEquipped = currentEquippedId === part.id;
                    const isLocked = part.unlockStars > totalStars;

                    return (
                      <button
                        key={part.id}
                        ref={isEquipped ? activePartCardRef : null}
                        type="button"
                        aria-disabled={isLocked}
                        onMouseEnter={() => setHoveredPartId(part.id)}
                        onMouseLeave={() =>
                          setHoveredPartId((prev) => (prev === part.id ? null : prev))
                        }
                        onFocus={() => setHoveredPartId(part.id)}
                        onBlur={() =>
                          setHoveredPartId((prev) => (prev === part.id ? null : prev))
                        }
                        onClick={() => {
                          if (!isLocked) {
                            onEquipPart(selectedCategory, part.id);
                          }
                        }}
                        className={`group relative flex w-56 sm:w-64 shrink-0 flex-col justify-between rounded-2xl border-2 p-2.5 text-left transition ${
                          isLocked
                            ? 'bg-slate-900/75 border-slate-700/80 hover:border-amber-400/50 opacity-80 cursor-not-allowed'
                            : isEquipped
                            ? 'bg-gradient-to-b from-amber-500/25 to-slate-900 border-amber-400 shadow-lg cursor-pointer'
                            : 'bg-slate-900/90 border-white/12 hover:border-amber-300/60 hover:bg-slate-800/85 cursor-pointer'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xl">{part.emoji}</span>
                              <span className="font-display text-xs sm:text-sm font-black text-white leading-tight">
                                {part.name}
                              </span>
                            </div>
                            {isLocked ? (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-800 border border-amber-400/40 px-1.5 py-0.5 text-[10px] font-black text-amber-300">
                                <Lock className="h-2.5 w-2.5" /> {part.unlockStars}⭐
                              </span>
                            ) : isEquipped ? (
                              <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-black text-slate-950">
                                EQUIPPED
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-[11px] font-semibold text-slate-300 leading-snug line-clamp-2">
                            {part.tagline}
                          </p>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-white/10 pt-1.5 text-[10px] font-extrabold text-slate-300">
                          <span className="rounded bg-slate-800 px-1.5 py-0.5">
                            {part.massLbs} lbs
                          </span>
                          {part.category === 'chassis' && (
                            <span className="rounded bg-sky-950 text-sky-300 px-1.5 py-0.5">
                              {part.cgHeightOffsetMeters.toFixed(2)}m CoG
                            </span>
                          )}
                          {part.trackWidthMeters >= 0.9 && (
                            <span className="rounded bg-cyan-950 text-cyan-300 px-1.5 py-0.5">
                              {part.trackWidthMeters.toFixed(2)}m Track
                            </span>
                          )}
                          {part.category !== 'chassis' && part.cgHeightOffsetMeters <= -0.02 && (
                            <span className="rounded bg-emerald-950 text-emerald-300 px-1.5 py-0.5">
                              {part.cgHeightOffsetMeters}m CoG
                            </span>
                          )}
                          {part.category === 'wheels' && (
                            <span className="rounded bg-emerald-950 text-emerald-300 px-1.5 py-0.5">
                              Grip {Math.round(part.asphaltGrip * 100)}
                            </span>
                          )}
                          {part.roughTerrainRating >= 0.4 && (
                            <span className="rounded bg-purple-950 text-purple-300 px-1.5 py-0.5">
                              Cobble {Math.round(part.roughTerrainRating * 100)}%
                            </span>
                          )}
                          {part.suspensionTravelMeters >= 0.05 && (
                            <span className="rounded bg-indigo-950 text-indigo-300 px-1.5 py-0.5">
                              {Math.round(part.suspensionTravelMeters * 100)}cm Travel
                            </span>
                          )}
                          {part.brakePower >= 0.5 && (
                            <span className="rounded bg-rose-950 text-rose-300 px-1.5 py-0.5">
                              Brake {Math.round(part.brakePower * 100)}
                            </span>
                          )}
                          {part.downforceFactor >= 0.25 && (
                            <span className="rounded bg-sky-950 text-sky-300 px-1.5 py-0.5">
                              +{Math.round(part.downforceFactor * 100)}% Downforce
                            </span>
                          )}
                          {part.hayPlowProtection >= 0.3 && (
                            <span className="rounded bg-amber-950 text-amber-300 px-1.5 py-0.5">
                              -{Math.round(part.hayPlowProtection * 100)}% Hay Dmg
                            </span>
                          )}
                          {part.driftAgility >= 0.35 && (
                            <span className="rounded bg-fuchsia-950 text-fuchsia-300 px-1.5 py-0.5">
                              Drift +{Math.round(part.driftAgility * 100)}
                            </span>
                          )}
                          {part.creativityBonus >= 20 && (
                            <span className="rounded bg-pink-950 text-pink-300 px-1.5 py-0.5">
                              +{part.creativityBonus} Flair
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Active/Hovered Part Summary + Primary Launch CTA */}
            <div className="flex flex-col justify-between gap-2 md:w-72 shrink-0 rounded-2xl bg-slate-900/90 border border-white/10 p-2.5">
              {activeCategoryPart && (
                <div className="text-[11px]">
                  <div className="flex items-center justify-between font-black text-white">
                    <span className="truncate">
                      {activeCategoryPart.emoji} {activeCategoryPart.name}
                    </span>
                    <span className="text-amber-300 shrink-0 ml-1">
                      {activeCategoryPart.massLbs} lbs
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-slate-300 line-clamp-2">
                    {activeCategoryPart.tagline}
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={onStartRace}
                className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-red-600 via-orange-500 to-amber-400 hover:from-red-500 hover:to-yellow-300 border-2 border-yellow-200 px-4 py-2.5 font-display text-sm sm:text-base font-black text-slate-950 shadow-xl transition hover:scale-102 active:scale-95 cursor-pointer"
                title="Launch Downhill Derby Run (Space)"
              >
                <Flag className="h-4 w-4 fill-slate-950 shrink-0" />
                <span>DROP THE GATE! 🏁</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* PRESETS & SAVED SOAPBOX BUILDS MODAL                                 */}
      {/* ==================================================================== */}
      {showGarageModal && (
        <div
          className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="soapbox-presets-modal-heading"
          onClick={() => setShowGarageModal(false)}
        >
          <div
            className="flex w-full max-w-xl flex-col gap-3 rounded-3xl bg-slate-900 border-4 border-amber-400 p-4 sm:p-5 shadow-2xl max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/15 pb-2">
              <h2
                id="soapbox-presets-modal-heading"
                className="font-display text-lg sm:text-xl font-black text-amber-300"
              >
                🏎️ PRESETS &amp; SAVED BUILDS
              </h2>
              <button
                type="button"
                onClick={() => setShowGarageModal(false)}
                className="rounded-xl bg-slate-800 hover:bg-slate-700 px-3 py-1 text-xs font-black text-slate-200 cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            {/* 4 Official Soapbox Presets */}
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-sky-300 mb-2">
                Official Presets (4)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SOAPBOX_PRESETS.map((preset) => {
                  const m = computeSoapboxMetrics(preset);
                  const cPart = getSoapboxPartById(preset.chassis, 'chassis');
                  const tPart = getSoapboxPartById(preset.topper, 'topper');
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        onApplyPreset(preset);
                        setShowGarageModal(false);
                      }}
                      className="flex flex-col justify-between rounded-2xl bg-slate-800/90 hover:bg-slate-800 border-2 border-white/15 hover:border-amber-400 p-2.5 text-left transition cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-display text-xs sm:text-sm font-black text-white">
                          {preset.name}
                        </span>
                        <span className="text-lg">
                          {cPart.emoji}
                          {tPart.id !== 'sb_topper_none' ? tPart.emoji : ''}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] font-bold text-slate-300">
                        <span>💨 Spd {m.speedScore}</span>
                        <span>🛞 Grip {m.gripScore}</span>
                        <span>⚖️ Stab {m.rolloverStabilityIndex}</span>
                        <span>⚖️ {m.totalMassLbs} lbs</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Saved Custom Builds */}
            <div className="border-t border-white/10 pt-3 flex flex-col gap-2.5">
              <h3 className="text-xs font-black uppercase tracking-wider text-amber-300">
                Saved Builds ({savedBuilds.length})
              </h3>

              {/* Save Current Soapbox Build */}
              <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-950/70 border border-white/10 p-2">
                <input
                  type="text"
                  value={customBuildName}
                  onChange={(e) => setCustomBuildName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveBuildClick();
                    }
                  }}
                  placeholder="Custom build name (optional)..."
                  className="flex-1 rounded-xl bg-slate-800 border border-white/15 px-3 py-1.5 text-xs font-bold text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  onClick={handleSaveBuildClick}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-3 py-1.5 text-xs font-black text-slate-950 transition cursor-pointer"
                >
                  {justSavedToast ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                  <span>{justSavedToast ? 'Saved!' : 'Save Build'}</span>
                </button>
              </div>

              {savedBuilds.length === 0 ? (
                <div className="rounded-xl bg-slate-800/50 border border-white/10 p-3 text-center text-xs font-bold text-slate-400">
                  No custom builds saved yet. Click &ldquo;Save Build&rdquo; to save your design!
                </div>
              ) : (
                <div className="space-y-1.5">
                  {savedBuilds.map((slot) => (
                    <div
                      key={slot.id}
                      className="flex items-center justify-between gap-2 rounded-xl bg-slate-800/80 border border-white/10 px-3 py-2"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onApplyPreset(slot.loadout);
                          setShowGarageModal(false);
                        }}
                        className="flex-1 text-left text-xs font-black text-white hover:text-amber-300 cursor-pointer truncate"
                      >
                        {slot.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onApplyPreset(slot.loadout);
                          setShowGarageModal(false);
                        }}
                        className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-2.5 py-1 text-[11px] font-bold text-white cursor-pointer"
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteSavedBuild(slot.id)}
                        className="rounded-lg bg-rose-500/20 hover:bg-rose-500/40 p-1.5 text-rose-300 cursor-pointer"
                        title="Delete Saved Build"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* COURSE SELECTOR MODAL                                                */}
      {/* ==================================================================== */}
      {showCourseModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="soapbox-course-modal-heading"
          className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-md"
          onClick={() => setShowCourseModal(false)}
        >
          <div
            className="flex w-full max-w-2xl flex-col gap-3.5 rounded-3xl bg-slate-900 border-4 border-amber-400 p-4 sm:p-5 shadow-2xl max-h-[92dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/15 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🏔️</span>
                <h2
                  id="soapbox-course-modal-heading"
                  className="font-display text-lg sm:text-xl font-black text-amber-300 uppercase tracking-wide"
                >
                  Select Downhill Course
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowCourseModal(false)}
                className="rounded-xl bg-slate-800 hover:bg-slate-700 px-3 py-1 text-xs font-black text-slate-200 cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SOAPBOX_COURSE_LIST.map((course) => {
                const isSelected = course.id === selectedCourseId;
                return (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => {
                      onSelectCourse(course.id);
                      setShowCourseModal(false);
                    }}
                    className={`relative flex flex-col justify-between rounded-2xl p-3.5 text-left transition cursor-pointer border-3 ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-400 shadow-lg shadow-amber-500/20 ring-2 ring-amber-400'
                        : 'bg-slate-800/80 hover:bg-slate-800 border-white/15 hover:border-amber-400/70'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{course.emoji}</span>
                          <span className="font-display text-sm sm:text-base font-black text-white">
                            {course.name}
                          </span>
                        </div>
                        {isSelected && (
                          <span className="rounded-full bg-amber-400 text-slate-950 px-2 py-0.5 text-[10px] font-black uppercase">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-300 font-medium line-clamp-2">
                        {course.description}
                      </p>
                    </div>

                    <div className="mt-3 space-y-1.5 pt-2 border-t border-white/10 text-[11px] font-bold text-slate-300">
                      <div className="flex items-center justify-between">
                        <span>Drop / Length:</span>
                        <span className="text-yellow-300">
                          📉 -{course.dropFeet} ft / 📏 {course.lengthFeet.toLocaleString()} ft
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Avg Grade / Peak:</span>
                        <span className="text-orange-300">
                          {course.avgGradePercent}% / {course.peakGradePercent}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Difficulty:</span>
                        <span className="text-amber-400">
                          {'★'.repeat(course.difficultyStars)}{'☆'.repeat(5 - course.difficultyStars)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Surface:</span>
                        <span className="text-cyan-300 font-medium capitalize">
                          {course.surfaceType}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 italic">
                        Hazards: {course.hazardsDescription}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
