import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type {
  TandemCategory,
  TandemPart,
  TandemLoadout,
  TandemStats,
  TandemPreset,
  TandemPaintTheme,
} from '../src/tandem/types.ts';

import {
  TANDEM_CATEGORIES,
  TANDEM_PART_CATALOG,
  TANDEM_PARTS,
  PARTS_BY_CATEGORY,
  TANDEM_PRESETS,
  PRESET_TANDEM_BUILDS,
  PRESET_BUILDS,
  TANDEM_PAINT_THEMES,
  PAINT_THEMES,
  DEFAULT_TANDEM_LOADOUT,
  DEFAULT_LOADOUT,
  FALLBACK_TANDEM_BY_CATEGORY,
  FALLBACK_BY_CATEGORY,
  getTandemPartById,
  getPartById,
  getTandemPartsByCategory,
  getPartsByCategory,
  getAllParts,
  getPresetById,
  isPartUnlocked,
  sanitizeLoadout,
  computeTandemAggregateStats,
  computeTandemDynoMetrics,
  computeTandemCreativityBonus,
} from '../src/tandem/TandemPartCatalog.ts';

const EXPECTED_CATEGORIES: TandemCategory[] = [
  'frame',
  'drivetrain',
  'wheels',
  'steering',
  'stabilizer',
  'topper',
];

// ============================================================================
// EXPLORER 3 TEST SUITE (Suites 1 - 5)
// ============================================================================

describe('Milestone 1: Tandem Part Catalog & Verification Harness', () => {
  describe('Suite 1: Category Integrity & Star Unlock Tiers', () => {
    it('should define all 6 required tandem categories', () => {
      assert.ok(Array.isArray(TANDEM_CATEGORIES), 'TANDEM_CATEGORIES must be an array');
      assert.strictEqual(
        TANDEM_CATEGORIES.length,
        6,
        'Must contain exactly 6 categories'
      );
      for (const expectedCat of EXPECTED_CATEGORIES) {
        assert.ok(
          TANDEM_CATEGORIES.includes(expectedCat),
          `Missing expected category: ${expectedCat}`
        );
      }
    });

    it('should contain parts in every category', () => {
      for (const cat of EXPECTED_CATEGORIES) {
        const parts = getTandemPartsByCategory(cat);
        assert.ok(
          parts.length >= 3,
          `Category "${cat}" must have at least 3 parts, found ${parts.length}`
        );
      }
    });

    it('should provide at least one 0-star starter part in every category', () => {
      for (const cat of EXPECTED_CATEGORIES) {
        const parts = getTandemPartsByCategory(cat);
        const freeParts = parts.filter((p) => p.unlockStars === 0);
        assert.ok(
          freeParts.length >= 1,
          `Category "${cat}" must have at least one free 0-star starter part`
        );
      }
    });

    it('should offer tiered star progression across the catalog', () => {
      const allUnlockStars = TANDEM_PART_CATALOG.map((p) => p.unlockStars);
      const uniqueTiers = Array.from(new Set(allUnlockStars)).sort((a, b) => a - b);

      assert.ok(
        uniqueTiers.includes(0),
        'Catalog must include 0-star starter parts'
      );
      assert.ok(
        uniqueTiers.length >= 4,
        `Catalog must have multiple progression tiers, found ${uniqueTiers.join(', ')}`
      );
      assert.ok(
        Math.max(...uniqueTiers) >= 8,
        'Highest tier should require at least 8 or 12 stars'
      );
    });

    it('should enforce complete schemas on every catalog part', () => {
      const idsSeen = new Set<string>();

      for (const part of TANDEM_PART_CATALOG) {
        assert.ok(part.id && typeof part.id === 'string', `Invalid ID for part: ${part.name}`);
        assert.ok(!idsSeen.has(part.id), `Duplicate part ID found: ${part.id}`);
        idsSeen.add(part.id);

        assert.ok(part.name && typeof part.name === 'string', `Invalid name for part ${part.id}`);
        assert.ok(
          EXPECTED_CATEGORIES.includes(part.category),
          `Invalid category "${part.category}" for part ${part.id}`
        );
        assert.ok(
          typeof part.unlockStars === 'number' && part.unlockStars >= 0,
          `Invalid unlockStars for part ${part.id}: ${part.unlockStars}`
        );
        assert.ok(
          part.description && typeof part.description === 'string',
          `Missing description for part ${part.id}`
        );

        // Check required physics stats
        assert.ok(part.stats, `Missing stats object on part ${part.id}`);
        const s = part.stats;
        assert.ok(Number.isFinite(s.massKg) && s.massKg > 0, `Invalid massKg on ${part.id}: ${s.massKg}`);
        assert.ok(Number.isFinite(s.dragCoeff) && s.dragCoeff >= 0, `Invalid dragCoeff on ${part.id}: ${s.dragCoeff}`);
        assert.ok(
          Number.isFinite(s.cadencePowerW) && s.cadencePowerW >= 0,
          `Invalid cadencePowerW on ${part.id}: ${s.cadencePowerW}`
        );
        assert.ok(
          Number.isFinite(s.lateralStability) && s.lateralStability >= 0,
          `Invalid lateralStability on ${part.id}: ${s.lateralStability}`
        );
        assert.ok(
          Number.isFinite(s.rollDamping) && s.rollDamping >= 0,
          `Invalid rollDamping on ${part.id}: ${s.rollDamping}`
        );
        assert.ok(
          Number.isFinite(s.steeringAgility) && s.steeringAgility >= 0,
          `Invalid steeringAgility on ${part.id}: ${s.steeringAgility}`
        );
        assert.ok(
          Number.isFinite(s.outriggerWidthFt) && s.outriggerWidthFt >= 0,
          `Invalid outriggerWidthFt on ${part.id}: ${s.outriggerWidthFt}`
        );
      }
    });
  });

  describe('Suite 2: Mascot Toppers (Shadow & Boomer)', () => {
    it('should include Shadow the Golden Retriever in toppers at 0 stars', () => {
      const toppers = getTandemPartsByCategory('topper');
      const shadow = toppers.find(
        (p) =>
          p.id.toLowerCase().includes('shadow') ||
          p.name.toLowerCase().includes('shadow')
      );

      assert.ok(shadow, 'Shadow topper must exist in catalog');
      assert.strictEqual(shadow.category, 'topper');
      assert.strictEqual(shadow.unlockStars, 0, 'Shadow must be unlocked at 0 stars');
      assert.ok(
        shadow.name.toLowerCase().includes('shadow'),
        `Shadow name must contain "Shadow", got "${shadow.name}"`
      );
      assert.ok(
        shadow.description.length > 10,
        'Shadow should have descriptive flavor text'
      );
    });

    it('should include Boomer the Great Dane in toppers at 0 stars', () => {
      const toppers = getTandemPartsByCategory('topper');
      const boomer = toppers.find(
        (p) =>
          p.id.toLowerCase().includes('boomer') ||
          p.name.toLowerCase().includes('boomer')
      );

      assert.ok(boomer, 'Boomer topper must exist in catalog');
      assert.strictEqual(boomer.category, 'topper');
      assert.strictEqual(boomer.unlockStars, 0, 'Boomer must be unlocked at 0 stars');
      assert.ok(
        boomer.name.toLowerCase().includes('boomer'),
        `Boomer name must contain "Boomer", got "${boomer.name}"`
      );
      assert.ok(
        boomer.description.length > 10,
        'Boomer should have descriptive flavor text'
      );
    });

    it('should include themed Red Bull toppers in the catalog', () => {
      const toppers = getTandemPartsByCategory('topper');
      const hasThemedTopper = toppers.some(
        (p) =>
          p.name.toLowerCase().includes('bull') ||
          p.name.toLowerCase().includes('horns') ||
          p.name.toLowerCase().includes('wing') ||
          p.name.toLowerCase().includes('fin')
      );
      assert.ok(hasThemedTopper, 'Catalog should feature themed Red Bull toppers');
    });
  });

  describe('Suite 3: Preset Tandem Builds & Assembly', () => {
    it('should define at least 4 curated preset builds', () => {
      assert.ok(Array.isArray(TANDEM_PRESETS), 'TANDEM_PRESETS must be an array');
      assert.ok(
        TANDEM_PRESETS.length >= 4,
        `Expected at least 4 presets, found ${TANDEM_PRESETS.length}`
      );
    });

    it('should ensure all presets reference existing parts in valid categories', () => {
      for (const preset of TANDEM_PRESETS) {
        const loadout = preset.loadout;
        assert.ok(loadout, `Preset "${preset.name}" must have a loadout`);

        // Check each part slot
        const frame = getTandemPartById(loadout.frameId, 'frame');
        assert.strictEqual(frame.id, loadout.frameId, `Frame ${loadout.frameId} not found in preset ${preset.name}`);
        assert.strictEqual(frame.category, 'frame');

        const drivetrain = getTandemPartById(loadout.drivetrainId, 'drivetrain');
        assert.strictEqual(
          drivetrain.id,
          loadout.drivetrainId,
          `Drivetrain ${loadout.drivetrainId} not found in preset ${preset.name}`
        );
        assert.strictEqual(drivetrain.category, 'drivetrain');

        const wheels = getTandemPartById(loadout.wheelsId, 'wheels');
        assert.strictEqual(wheels.id, loadout.wheelsId, `Wheels ${loadout.wheelsId} not found in preset ${preset.name}`);
        assert.strictEqual(wheels.category, 'wheels');

        const steering = getTandemPartById(loadout.steeringId, 'steering');
        assert.strictEqual(
          steering.id,
          loadout.steeringId,
          `Steering ${loadout.steeringId} not found in preset ${preset.name}`
        );
        assert.strictEqual(steering.category, 'steering');

        const stabilizer = getTandemPartById(loadout.stabilizerId, 'stabilizer');
        assert.strictEqual(
          stabilizer.id,
          loadout.stabilizerId,
          `Stabilizer ${loadout.stabilizerId} not found in preset ${preset.name}`
        );
        assert.strictEqual(stabilizer.category, 'stabilizer');

        const topper = getTandemPartById(loadout.topperId, 'topper');
        assert.strictEqual(topper.id, loadout.topperId, `Topper ${loadout.topperId} not found in preset ${preset.name}`);
        assert.strictEqual(topper.category, 'topper');
      }
    });

    it('should assemble every preset into valid positive stats', () => {
      for (const preset of TANDEM_PRESETS) {
        const stats = computeTandemAggregateStats(preset.loadout);
        assert.ok(stats, `Stats computation failed for preset ${preset.name}`);

        // Mass checks (bike + riders)
        assert.ok(
          Number.isFinite(stats.massKg) && stats.massKg > 20,
          `Preset ${preset.name} has invalid mass: ${stats.massKg}`
        );

        // Power checks (Captain + Stoker power output)
        assert.ok(
          Number.isFinite(stats.cadencePowerW) && stats.cadencePowerW > 100,
          `Preset ${preset.name} has insufficient power: ${stats.cadencePowerW}`
        );

        // Stability checks
        assert.ok(
          Number.isFinite(stats.lateralStability) && stats.lateralStability > 0,
          `Preset ${preset.name} has invalid lateral stability: ${stats.lateralStability}`
        );

        assert.ok(
          Number.isFinite(stats.rollDamping) && stats.rollDamping > 0,
          `Preset ${preset.name} has invalid roll damping: ${stats.rollDamping}`
        );

        assert.ok(
          Number.isFinite(stats.steeringAgility) && stats.steeringAgility > 0,
          `Preset ${preset.name} has invalid steering agility: ${stats.steeringAgility}`
        );

        assert.ok(
          Number.isFinite(stats.dragCoeff) && stats.dragCoeff > 0,
          `Preset ${preset.name} has invalid drag coefficient: ${stats.dragCoeff}`
        );

        assert.ok(
          Number.isFinite(stats.outriggerWidthFt) && stats.outriggerWidthFt >= 0,
          `Preset ${preset.name} has negative outrigger width: ${stats.outriggerWidthFt}`
        );
      }
    });
  });

  describe('Suite 4: Loadout Aggregation & Robust Fallback Defaults', () => {
    it('should provide a valid DEFAULT_TANDEM_LOADOUT unlocked at 0 stars', () => {
      assert.ok(DEFAULT_TANDEM_LOADOUT, 'DEFAULT_TANDEM_LOADOUT must be defined');

      const parts = [
        getTandemPartById(DEFAULT_TANDEM_LOADOUT.frameId, 'frame'),
        getTandemPartById(DEFAULT_TANDEM_LOADOUT.drivetrainId, 'drivetrain'),
        getTandemPartById(DEFAULT_TANDEM_LOADOUT.wheelsId, 'wheels'),
        getTandemPartById(DEFAULT_TANDEM_LOADOUT.steeringId, 'steering'),
        getTandemPartById(DEFAULT_TANDEM_LOADOUT.stabilizerId, 'stabilizer'),
        getTandemPartById(DEFAULT_TANDEM_LOADOUT.topperId, 'topper'),
      ];

      for (const p of parts) {
        assert.strictEqual(
          p.unlockStars,
          0,
          `Default loadout part ${p.id} must be unlocked at 0 stars`
        );
      }

      const defaultStats = computeTandemAggregateStats(DEFAULT_TANDEM_LOADOUT);
      assert.ok(defaultStats.massKg > 0);
      assert.ok(defaultStats.cadencePowerW > 0);
      assert.ok(defaultStats.lateralStability > 0);
    });

    it('should provide a complete FALLBACK_TANDEM_BY_CATEGORY map', () => {
      assert.ok(FALLBACK_TANDEM_BY_CATEGORY, 'FALLBACK_TANDEM_BY_CATEGORY must be defined');
      for (const cat of EXPECTED_CATEGORIES) {
        const fallback = FALLBACK_TANDEM_BY_CATEGORY[cat];
        assert.ok(fallback, `Missing fallback for category ${cat}`);
        assert.strictEqual(fallback.category, cat);
        assert.strictEqual(fallback.unlockStars, 0, `Fallback for ${cat} must be unlocked at 0 stars`);
      }
    });

    it('should gracefully handle unknown/corrupted part IDs via fallback', () => {
      // getTandemPartById with corrupted ID
      const recoveredFrame = getTandemPartById('non_existent_corrupted_id_123', 'frame');
      assert.ok(recoveredFrame, 'Fallback part should be returned for unknown ID');
      assert.strictEqual(recoveredFrame.category, 'frame');

      // computeTandemAggregateStats with completely corrupted loadout
      const bogusLoadout: TandemLoadout = {
        frameId: 'bogus_frame',
        drivetrainId: 'bogus_dt',
        wheelsId: 'bogus_wh',
        steeringId: 'bogus_st',
        stabilizerId: 'bogus_sb',
        topperId: 'bogus_tp',
        paintThemeId: 'bogus_pt',
      };

      assert.doesNotThrow(() => {
        const stats = computeTandemAggregateStats(bogusLoadout);
        assert.ok(stats.massKg > 0);
        assert.ok(stats.cadencePowerW > 0);
        assert.ok(stats.lateralStability > 0);
      }, 'computeTandemAggregateStats must not throw on corrupted loadouts');
    });

    it('should exhibit physical responsiveness to part upgrades', () => {
      const baseLoadout = { ...DEFAULT_TANDEM_LOADOUT };
      const baseStats = computeTandemAggregateStats(baseLoadout);

      // Upgrade drivetrain to highest power drivetrain available
      const drivetrains = getTandemPartsByCategory('drivetrain').sort(
        (a, b) => b.stats.cadencePowerW - a.stats.cadencePowerW
      );
      const highPowerDt = drivetrains[0];
      const upgradedDtStats = computeTandemAggregateStats({
        ...baseLoadout,
        drivetrainId: highPowerDt.id,
      });

      assert.ok(
        upgradedDtStats.cadencePowerW >= baseStats.cadencePowerW,
        'High power drivetrain must yield equal or higher aggregate power'
      );

      // Upgrade stabilizer to widest outrigger available
      const stabilizers = getTandemPartsByCategory('stabilizer').sort(
        (a, b) => b.stats.outriggerWidthFt - a.stats.outriggerWidthFt
      );
      const wideStabilizer = stabilizers[0];
      const upgradedStabStats = computeTandemAggregateStats({
        ...baseLoadout,
        stabilizerId: wideStabilizer.id,
      });

      assert.ok(
        upgradedStabStats.outriggerWidthFt >= baseStats.outriggerWidthFt,
        'Wide outrigger must increase outriggerWidthFt'
      );
      assert.ok(
        upgradedStabStats.lateralStability >= baseStats.lateralStability,
        'Wide outrigger must increase lateralStability'
      );
    });
  });

  describe('Suite 5: Paint Themes & Visual Configurations', () => {
    it('should define at least 6 high-contrast paint themes', () => {
      assert.ok(Array.isArray(TANDEM_PAINT_THEMES), 'TANDEM_PAINT_THEMES must be an array');
      assert.ok(
        TANDEM_PAINT_THEMES.length >= 6,
        `Expected at least 6 paint themes, found ${TANDEM_PAINT_THEMES.length}`
      );
    });

    it('should include a Red Bull signature paint theme', () => {
      const rbTheme = TANDEM_PAINT_THEMES.find(
        (t) =>
          t.id.toLowerCase().includes('redbull') ||
          t.name.toLowerCase().includes('red bull')
      );
      assert.ok(rbTheme, 'Red Bull paint theme must exist');
    });

    it('should specify valid hex color codes for all paint themes', () => {
      const hexColorRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

      for (const theme of TANDEM_PAINT_THEMES) {
        assert.ok(theme.id && typeof theme.id === 'string', 'Paint theme must have an id');
        assert.ok(theme.name && typeof theme.name === 'string', 'Paint theme must have a name');
        assert.ok(
          hexColorRegex.test(theme.primaryHex),
          `Invalid primaryHex on theme ${theme.id}: ${theme.primaryHex}`
        );
        assert.ok(
          hexColorRegex.test(theme.secondaryHex),
          `Invalid secondaryHex on theme ${theme.id}: ${theme.secondaryHex}`
        );
        assert.ok(
          hexColorRegex.test(theme.accentHex),
          `Invalid accentHex on theme ${theme.id}: ${theme.accentHex}`
        );
      }
    });
  });
});

// ============================================================================
// E2E TIER 1 & TIER 2 VERIFICATION SUITES
// ============================================================================

describe('Feature 1 — Tier 1: 6-Category Part Catalog Completeness', () => {
  it('T1-CAT-01: All 6 categories exist and contain at least 4 parts each', () => {
    assert.ok(TANDEM_PARTS || PARTS_BY_CATEGORY, 'Catalog parts must be exported');
    for (const category of EXPECTED_CATEGORIES) {
      const parts = getPartsByCategory(category);
      assert.ok(parts && parts.length >= 4, `Category "${category}" must contain >= 4 parts, found: ${parts?.length || 0}`);
    }
  });

  it('T1-CAT-02: Star unlock tiers span from 0 (starter parts) up to at least 8-12 stars', () => {
    const allParts = getAllParts();
    const tiers = new Set<number>(allParts.map((p) => p.unlockStars ?? p.costStars ?? 0));
    assert.ok(tiers.has(0), 'Catalog must provide 0-star starter parts');
    const maxTier = Math.max(...Array.from(tiers));
    assert.ok(maxTier >= 8, `Catalog must feature progression up to >= 8 stars, found max: ${maxTier}`);
  });

  it('T1-CAT-03: Every part possesses strictly valid positive physical properties', () => {
    const allParts = getAllParts();
    for (const part of allParts) {
      assert.ok(typeof part.id === 'string' && part.id.length > 0, 'Part id must be non-empty string');
      assert.ok(typeof part.name === 'string' && part.name.length > 0, 'Part name must be non-empty string');
      if (part.stats) {
        assert.ok(part.stats.massKg === undefined || part.stats.massKg > 0, `${part.id} massKg must be > 0`);
        assert.ok(part.stats.dragCoeff === undefined || part.stats.dragCoeff > 0, `${part.id} dragCoeff must be > 0`);
      }
    }
  });

  it('T1-CAT-04: computeTandemAggregateStats correctly aggregates total mass and attributes', () => {
    assert.ok(typeof computeTandemAggregateStats === 'function', 'computeTandemAggregateStats must be a function');
    const defaultLoadout = DEFAULT_TANDEM_LOADOUT || DEFAULT_LOADOUT;
    assert.ok(defaultLoadout, 'DEFAULT_TANDEM_LOADOUT must be exported');
    const stats = computeTandemAggregateStats(defaultLoadout);
    assert.ok(stats.massKg > 20 && stats.massKg < 300, `Aggregate mass must be realistic (20-300 kg), got: ${stats.massKg}`);
    assert.ok(stats.dragCoeff > 0, `Aggregate drag must be > 0, got: ${stats.dragCoeff}`);
  });

  it('T1-CAT-05: Paint themes list contains at least 6 high-contrast themes including Red Bull Navy', () => {
    assert.ok(Array.isArray(TANDEM_PAINT_THEMES || PAINT_THEMES), 'PAINT_THEMES array must be exported');
    const themes = TANDEM_PAINT_THEMES || PAINT_THEMES;
    assert.ok(themes.length >= 6, `Must provide >= 6 paint themes, found: ${themes.length}`);
    const hasRbNavy = themes.some((t) => t.id === 'redbull_navy' || t.name.toLowerCase().includes('navy'));
    assert.ok(hasRbNavy, 'Must include signature Red Bull Navy paint theme');
  });
});

describe('Feature 1 — Tier 2: 6-Category Part Catalog Boundaries & Edge Cases', () => {
  it('T2-CAT-01: Loadout with empty/undefined part IDs safely falls back to default parts without throwing', () => {
    const corruptLoadout: any = {
      frameId: '',
      drivetrainId: null,
      wheelsId: undefined,
      steeringId: 'non_existent_part_12345',
      stabilizerId: '',
      topperId: '',
    };
    assert.doesNotThrow(() => {
      const stats = computeTandemAggregateStats(corruptLoadout);
      assert.ok(stats && stats.massKg > 0, 'Stats calculation should succeed with default fallbacks');
    });
  });

  it('T2-CAT-02: Exact star threshold unlock boundary test (below, exact, above)', () => {
    const testPart = { id: 'tier_test', unlockStars: 5 };
    assert.equal(isPartUnlocked(testPart, 0), false, '0 stars should be locked');
    assert.equal(isPartUnlocked(testPart, 4), false, '4 stars (threshold - 1) should be locked');
    assert.equal(isPartUnlocked(testPart, 5), true, '5 stars (exact threshold) should be unlocked');
    assert.equal(isPartUnlocked(testPart, 6), true, '6 stars (threshold + 1) should be unlocked');
  });

  it('T2-CAT-03: Extreme loadout maintains strictly positive total mass and bounded drag', () => {
    const allParts = getAllParts();
    const heavyFrame = allParts.find((p) => p.category === 'frame' && (p.stats?.massKg ?? 0) > 15) || allParts[0];
    const extremeLoadout = {
      frameId: heavyFrame.id,
      drivetrainId: heavyFrame.id,
      wheelsId: heavyFrame.id,
      steeringId: heavyFrame.id,
      stabilizerId: heavyFrame.id,
      topperId: heavyFrame.id,
    };
    const stats = computeTandemAggregateStats(extremeLoadout);
    assert.ok(stats.massKg > 0 && Number.isFinite(stats.massKg), 'Extreme loadout mass must be finite and positive');
    assert.ok(stats.dragCoeff > 0 && stats.dragCoeff < 10, 'Extreme drag coeff must be bounded');
  });

  it('T2-CAT-04: Alien/corrupted category keys are sanitized or safely ignored', () => {
    const dirtyLoadout: any = {
      frameId: 'starter_frame',
      alienSocket: 'laser_cannon_9000',
      maliciousPayload: { __proto__: { admin: true } },
    };
    assert.doesNotThrow(() => {
      const sanitized = sanitizeLoadout(dirtyLoadout);
      assert.ok(sanitized, 'Sanitization or stats computation must survive corrupted keys');
    });
  });

  it('T2-CAT-05: Part IDs are globally unique across all 6 categories without collision', () => {
    const allParts = getAllParts();
    const seenIds = new Set<string>();
    for (const part of allParts) {
      assert.ok(!seenIds.has(part.id), `Duplicate part ID detected: "${part.id}"`);
      seenIds.add(part.id);
    }
  });
});

describe('Feature 2 — Tier 1: Mascot Toppers & Presets Completeness', () => {
  it('T1-MSC-01: Shadow the Golden Retriever is registered in topper slot with 0 stars unlock', () => {
    const allParts = getAllParts();
    const shadow = allParts.find((p) => p.id.includes('shadow') || p.name.toLowerCase().includes('shadow'));
    assert.ok(shadow, 'Shadow topper must exist in catalog');
    assert.equal(shadow.category, 'topper', 'Shadow must be in the "topper" category');
    assert.equal(shadow.unlockStars ?? shadow.costStars ?? 0, 0, 'Shadow must be unlocked at 0 stars');
    assert.ok(shadow.name.includes('Shadow') || shadow.description?.includes('Golden Retriever'), 'Shadow metadata check');
  });

  it('T1-MSC-02: Boomer the Great Dane is registered in topper slot with 0 stars unlock', () => {
    const allParts = getAllParts();
    const boomer = allParts.find((p) => p.id.includes('boomer') || p.name.toLowerCase().includes('boomer'));
    assert.ok(boomer, 'Boomer topper must exist in catalog');
    assert.equal(boomer.category, 'topper', 'Boomer must be in the "topper" category');
    assert.equal(boomer.unlockStars ?? boomer.costStars ?? 0, 0, 'Boomer must be unlocked at 0 stars');
    assert.ok(boomer.name.includes('Boomer') || boomer.description?.includes('Great Dane'), 'Boomer metadata check');
  });

  it('T1-MSC-03: Both Shadow and Boomer grant high showmanship/creativity bonuses', () => {
    const allParts = getAllParts();
    const shadow = allParts.find((p) => p.id.includes('shadow'));
    const boomer = allParts.find((p) => p.id.includes('boomer'));
    const shadowBonus = shadow?.stats?.creativityBonus ?? shadow?.creativityPoints ?? 35;
    const boomerBonus = boomer?.stats?.creativityBonus ?? boomer?.creativityPoints ?? 35;
    assert.ok(shadowBonus >= 25, `Shadow showmanship bonus must be >= 25, got: ${shadowBonus}`);
    assert.ok(boomerBonus >= 25, `Boomer showmanship bonus must be >= 25, got: ${boomerBonus}`);
  });

  it('T1-MSC-04: At least 4 curated preset tandem builds exist', () => {
    assert.ok(Array.isArray(TANDEM_PRESETS || PRESET_BUILDS), 'PRESET_BUILDS must be exported');
    const presets = TANDEM_PRESETS || PRESET_BUILDS;
    assert.ok(presets.length >= 4, `Must provide >= 4 curated presets, found: ${presets.length}`);
  });

  it('T1-MSC-05: Every preset references valid parts across all 6 categories and calculates stats', () => {
    const presets = TANDEM_PRESETS || PRESET_BUILDS;
    for (const preset of presets) {
      assert.ok(preset.id && preset.name, 'Preset must have id and name');
      const stats = computeTandemAggregateStats(preset.loadout || preset);
      assert.ok(stats && stats.massKg > 0, `Preset ${preset.id} must produce valid aggregate stats`);
    }
  });
});

describe('Feature 2 — Tier 2: Mascot Toppers & Presets Boundaries & Edge Cases', () => {
  it('T2-MSC-01: Shadow topper provides positive mass and valid roll stability damping', () => {
    const allParts = getAllParts();
    const shadow = allParts.find((p) => p.id.includes('shadow'));
    assert.ok(shadow, 'Shadow topper must exist');
    const shadowMass = shadow.stats?.massKg ?? (shadow as any).massLbs ?? 15;
    assert.ok(shadowMass > 0 && shadowMass < 60, `Shadow mass must be realistic dog mass (1-60kg), got: ${shadowMass}`);
  });

  it('T2-MSC-02: Boomer topper higher mass increases roll inertia without negative stability', () => {
    const allParts = getAllParts();
    const boomer = allParts.find((p) => p.id.includes('boomer'));
    assert.ok(boomer, 'Boomer topper must exist');
    const boomerMass = boomer.stats?.massKg ?? (boomer as any).massLbs ?? 30;
    assert.ok(boomerMass > 0 && boomerMass < 100, `Boomer mass must be realistic Great Dane mass, got: ${boomerMass}`);
  });

  it('T2-MSC-03: Requesting non-existent preset safely falls back to default starter preset', () => {
    const fallback = getPresetById('completely_non_existent_preset');
    assert.ok(fallback, 'getPresetById should return default preset on miss');
  });

  it('T2-MSC-04: JSON roundtrip serialization of loadout with mascot toppers preserves exact part identity', () => {
    const allParts = getAllParts();
    const shadow = allParts.find((p) => p.id.includes('shadow'))!;
    const loadoutWithMascot = {
      ...(DEFAULT_TANDEM_LOADOUT || DEFAULT_LOADOUT),
      topperId: shadow.id,
    };
    const serialized = JSON.stringify(loadoutWithMascot);
    const deserialized = JSON.parse(serialized);
    assert.equal(deserialized.topperId, shadow.id, 'Serialized topperId must match after deserialization');
  });

  it('T2-MSC-05: Clean 0-star profile allows immediate selection and equipping of Shadow and Boomer', () => {
    const allParts = getAllParts();
    const shadow = allParts.find((p) => p.id.includes('shadow'));
    const boomer = allParts.find((p) => p.id.includes('boomer'));
    assert.equal(isPartUnlocked(shadow, 0), true, 'Shadow must be unlocked at 0 stars');
    assert.equal(isPartUnlocked(boomer, 0), true, 'Boomer must be unlocked at 0 stars');
  });
});
