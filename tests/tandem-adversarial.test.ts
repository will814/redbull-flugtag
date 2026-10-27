/**
 * Red Bull Tandem Bike Challenge — Milestone 1 Adversarial Fuzzing & Stress Suite
 * Challenger 2 Empirical Test Harness
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  TANDEM_CATEGORIES,
  TANDEM_PART_CATALOG,
  TANDEM_PRESETS,
  TANDEM_PAINT_THEMES,
  DEFAULT_TANDEM_LOADOUT,
  FALLBACK_TANDEM_BY_CATEGORY,
  getTandemPartById,
  getTandemPartsByCategory,
  getAllParts,
  getPresetById,
  isPartUnlocked,
  sanitizeLoadout,
  computeTandemAggregateStats,
  computeTandemCreativityBonus,
  computeTandemDynoMetrics,
} from '../src/tandem/TandemPartCatalog.ts';

import type { TandemCategory, TandemLoadout, TandemStats } from '../src/tandem/types.ts';

const HEX_6_REGEX = /^#[0-9a-fA-F]{6}$/;

describe('Milestone 1 Adversarial Stress & Fuzzing Harness', () => {
  // ==========================================================================
  // 1. Paint Themes Hex Code Verification (Strict 6-char hex)
  // ==========================================================================
  describe('Adversarial 1: Paint Theme Hex Code Integrity', () => {
    it('should have exactly 6 paint themes defined', () => {
      assert.strictEqual(
        TANDEM_PAINT_THEMES.length,
        6,
        `Expected exactly 6 paint themes, found ${TANDEM_PAINT_THEMES.length}`
      );
    });

    it('every paint theme must have strictly valid 6-character hex codes (#RRGGBB)', () => {
      const colorKeys = [
        'primaryHex',
        'secondaryHex',
        'accentHex',
        'frameHex',
        'forkHex',
        'rimHex',
        'decalHex',
        'badgeColor',
      ] as const;

      for (const theme of TANDEM_PAINT_THEMES) {
        for (const key of colorKeys) {
          const val = (theme as any)[key];
          if (val !== undefined) {
            assert.ok(
              typeof val === 'string',
              `Theme "${theme.id}" key "${key}" is not a string: ${val}`
            );
            assert.ok(
              HEX_6_REGEX.test(val),
              `Theme "${theme.id}" key "${key}" must be a 6-character hex code (#RRGGBB), got "${val}"`
            );
          }
        }
      }
    });

    it('every catalog part visual must have valid hex colors', () => {
      for (const part of TANDEM_PART_CATALOG) {
        assert.ok(part.visual, `Part ${part.id} missing visual object`);
        assert.ok(
          HEX_6_REGEX.test(part.visual.primaryColor),
          `Part ${part.id} visual.primaryColor "${part.visual.primaryColor}" must match #RRGGBB`
        );
        assert.ok(
          HEX_6_REGEX.test(part.visual.secondaryColor),
          `Part ${part.id} visual.secondaryColor "${part.visual.secondaryColor}" must match #RRGGBB`
        );
        if (part.visual.accentColor) {
          assert.ok(
            HEX_6_REGEX.test(part.visual.accentColor),
            `Part ${part.id} visual.accentColor "${part.visual.accentColor}" must match #RRGGBB`
          );
        }
      }
    });
  });

  // ==========================================================================
  // 2. 0-Star Starter Availability & Assembly Permutations
  // ==========================================================================
  describe('Adversarial 2: Zero-Star Starter Availability & Cartesian Assembly', () => {
    it('every one of the 6 categories must have at least one 0-star starter part', () => {
      for (const cat of TANDEM_CATEGORIES) {
        const parts = getTandemPartsByCategory(cat);
        const zeroStarParts = parts.filter(
          (p) => (p.unlockStars === 0 || (p as any).costStars === 0)
        );
        assert.ok(
          zeroStarParts.length >= 1,
          `Category ${cat} must provide at least one 0-star starter part, found ${zeroStarParts.length}`
        );
      }
    });

    it('Shadow and Boomer must both be 0-star starters in topper category', () => {
      const toppers = getTandemPartsByCategory('topper');
      const shadow = toppers.find((t) => t.id === 'topper_shadow');
      const boomer = toppers.find((t) => t.id === 'topper_boomer');

      assert.ok(shadow, 'topper_shadow must exist in topper category');
      assert.strictEqual(shadow.unlockStars, 0, 'Shadow must have unlockStars === 0');

      assert.ok(boomer, 'topper_boomer must exist in topper category');
      assert.strictEqual(boomer.unlockStars, 0, 'Boomer must have unlockStars === 0');
    });

    it('every Cartesian combination of 0-star parts must assemble into a valid bike', () => {
      const zeroPartsByCategory: Record<TandemCategory, typeof TANDEM_PART_CATALOG> = {} as any;
      for (const cat of TANDEM_CATEGORIES) {
        zeroPartsByCategory[cat] = getTandemPartsByCategory(cat).filter(
          (p) => p.unlockStars === 0
        );
      }

      // Compute total combinations
      let totalCombinations = 1;
      for (const cat of TANDEM_CATEGORIES) {
        totalCombinations *= zeroPartsByCategory[cat].length;
      }
      assert.ok(totalCombinations >= 4, `Expected at least 4 zero-star combinations, got ${totalCombinations}`);

      // Assemble all combinations
      for (const frame of zeroPartsByCategory.frame) {
        for (const dt of zeroPartsByCategory.drivetrain) {
          for (const wheels of zeroPartsByCategory.wheels) {
            for (const steering of zeroPartsByCategory.steering) {
              for (const stab of zeroPartsByCategory.stabilizer) {
                for (const top of zeroPartsByCategory.topper) {
                  const loadout: TandemLoadout = {
                    frameId: frame.id,
                    drivetrainId: dt.id,
                    wheelsId: wheels.id,
                    steeringId: steering.id,
                    stabilizerId: stab.id,
                    topperId: top.id,
                    paintThemeId: 'redbull_navy',
                  };

                  const stats = computeTandemAggregateStats(loadout);
                  assert.ok(Number.isFinite(stats.massKg) && stats.massKg > 140, 'Mass must exceed crew 140kg');
                  assert.ok(Number.isFinite(stats.dragCoeff) && stats.dragCoeff > 0, 'Drag must be positive');
                  assert.ok(Number.isFinite(stats.cadencePowerW) && stats.cadencePowerW >= 120, 'Power >= 120W');
                  assert.ok(Number.isFinite(stats.lateralStability) && stats.lateralStability > 0, 'Stability > 0');
                  assert.ok(Number.isFinite(stats.rollDamping) && stats.rollDamping > 0, 'Roll damping > 0');
                  assert.ok(Number.isFinite(stats.steeringAgility) && stats.steeringAgility > 0, 'Agility > 0');
                  assert.ok(Number.isFinite(stats.outriggerWidthFt) && stats.outriggerWidthFt >= 0, 'Outrigger >= 0');

                  const dyno = computeTandemDynoMetrics(loadout);
                  assert.ok(Number.isFinite(dyno.rolloverThresholdDeg) && dyno.rolloverThresholdDeg >= 15, 'Rollover deg valid');
                  assert.ok(Number.isFinite(dyno.powerToWeightRatioWKg) && dyno.powerToWeightRatioWKg > 0, 'Power-to-weight valid');
                  assert.ok(dyno.dynoStatus, 'Dyno status must be populated');
                }
              }
            }
          }
        }
      }
    });
  });

  // ==========================================================================
  // 3. Fuzzing sanitizeLoadout
  // ==========================================================================
  describe('Adversarial 3: Fuzzing sanitizeLoadout', () => {
    const maliciousInputs = [
      null,
      undefined,
      '',
      '   ',
      'hello world',
      0,
      1,
      -1,
      NaN,
      Infinity,
      -Infinity,
      true,
      false,
      [],
      [1, 2, 'three'],
      {},
      { frameId: '' },
      { frameId: null },
      { frameId: undefined },
      { frameId: 12345 },
      { frameId: {} },
      { frameId: [] },
      { frameId: true },
      { frameId: '\x00\r\n\t\x1b[31m' },
      { frameId: '<script>alert("xss")</script>' },
      { frameId: 'DROP TABLE parts;--' },
      { frameId: 'a'.repeat(10000) },
      { __proto__: { frameId: 'polluted' } },
      { constructor: { prototype: { frameId: 'polluted' } } },
      new Date(),
      new RegExp('abc'),
      new Uint8Array([1, 2, 3]),
      new Error('boom'),
      () => {},
      Object.create(null),
    ];

    it('survives all known malicious input archetypes without throwing', () => {
      for (const input of maliciousInputs) {
        let result: any;
        assert.doesNotThrow(() => {
          result = sanitizeLoadout(input);
        });

        assert.ok(result && typeof result === 'object', 'Result must be an object');
        assert.strictEqual(typeof result.frameId, 'string', 'frameId must be string');
        assert.ok(result.frameId.length > 0, 'frameId must not be empty');
        assert.strictEqual(typeof result.drivetrainId, 'string', 'drivetrainId must be string');
        assert.ok(result.drivetrainId.length > 0, 'drivetrainId must not be empty');
        assert.strictEqual(typeof result.wheelsId, 'string', 'wheelsId must be string');
        assert.ok(result.wheelsId.length > 0, 'wheelsId must not be empty');
        assert.strictEqual(typeof result.steeringId, 'string', 'steeringId must be string');
        assert.ok(result.steeringId.length > 0, 'steeringId must not be empty');
        assert.strictEqual(typeof result.stabilizerId, 'string', 'stabilizerId must be string');
        assert.ok(result.stabilizerId.length > 0, 'stabilizerId must not be empty');
        assert.strictEqual(typeof result.topperId, 'string', 'topperId must be string');
        assert.ok(result.topperId.length > 0, 'topperId must not be empty');
        assert.strictEqual(typeof result.paintThemeId, 'string', 'paintThemeId must be string');
        assert.ok(result.paintThemeId.length > 0, 'paintThemeId must not be empty');
      }
    });

    it('survives 10,000 pseudorandom fuzz iterations with random shapes and types', () => {
      const randomValues = [
        null,
        undefined,
        '',
        '   ',
        'foo',
        'frame_cruiser',
        'unknown_part_9999',
        123,
        0,
        -999,
        NaN,
        Infinity,
        true,
        false,
        {},
        [],
        [null],
        { a: 1 },
        '🚀💥🔥🐶🦮',
        '\u0000\uFFFF',
        'a'.repeat(200),
      ];

      for (let i = 0; i < 10000; i++) {
        const randObj: any = {};
        const keys = ['frameId', 'drivetrainId', 'wheelsId', 'steeringId', 'stabilizerId', 'topperId', 'paintThemeId', 'extra_junk'];
        for (const k of keys) {
          if (Math.random() > 0.3) {
            randObj[k] = randomValues[Math.floor(Math.random() * randomValues.length)];
          }
        }

        const sanitized = sanitizeLoadout(randObj);
        assert.ok(sanitized.frameId && typeof sanitized.frameId === 'string');
        assert.ok(sanitized.drivetrainId && typeof sanitized.drivetrainId === 'string');
        assert.ok(sanitized.wheelsId && typeof sanitized.wheelsId === 'string');
        assert.ok(sanitized.steeringId && typeof sanitized.steeringId === 'string');
        assert.ok(sanitized.stabilizerId && typeof sanitized.stabilizerId === 'string');
        assert.ok(sanitized.topperId && typeof sanitized.topperId === 'string');
        assert.ok(sanitized.paintThemeId && typeof sanitized.paintThemeId === 'string');
      }
    });
  });

  // ==========================================================================
  // 4. Fuzzing computeTandemAggregateStats
  // ==========================================================================
  describe('Adversarial 4: Fuzzing computeTandemAggregateStats', () => {
    it('survives 10,000 randomized corrupt/unknown part IDs without NaN, Infinity, or throw', () => {
      const knownIds = TANDEM_PART_CATALOG.map((p) => p.id);
      const corruptPool = [
        '',
        '   ',
        'corrupted_id_xyz',
        'frame_999999',
        'undefined',
        'null',
        '__proto__',
        'constructor',
        'toString',
        'valueOf',
        '12345',
        'topper_nonexistent',
        null,
        undefined,
        123 as any,
        {} as any,
      ];

      for (let i = 0; i < 10000; i++) {
        const pick = () => {
          if (Math.random() < 0.3) {
            return corruptPool[Math.floor(Math.random() * corruptPool.length)];
          } else if (Math.random() < 0.6) {
            return knownIds[Math.floor(Math.random() * knownIds.length)];
          } else {
            return `random_fuzz_${Math.random()}_${i}`;
          }
        };

        const loadout = {
          frameId: pick(),
          drivetrainId: pick(),
          wheelsId: pick(),
          steeringId: pick(),
          stabilizerId: pick(),
          topperId: pick(),
          paintThemeId: pick(),
        };

        const stats = computeTandemAggregateStats(loadout);

        // Verification of mathematical boundaries:
        assert.ok(Number.isFinite(stats.massKg), `massKg must be finite, got ${stats.massKg}`);
        assert.ok(stats.massKg >= 140, `massKg must be >= 140kg (crew baseline), got ${stats.massKg}`);
        assert.ok(!Number.isNaN(stats.massKg), 'massKg must not be NaN');

        assert.ok(Number.isFinite(stats.dragCoeff), `dragCoeff must be finite, got ${stats.dragCoeff}`);
        assert.ok(stats.dragCoeff >= 0.05 && stats.dragCoeff <= 2.5, `dragCoeff bounded [0.05, 2.5], got ${stats.dragCoeff}`);

        assert.ok(Number.isFinite(stats.cadencePowerW), `cadencePowerW must be finite, got ${stats.cadencePowerW}`);
        assert.ok(stats.cadencePowerW >= 120, `cadencePowerW must be >= 120W, got ${stats.cadencePowerW}`);

        assert.ok(Number.isFinite(stats.lateralStability), `lateralStability must be finite, got ${stats.lateralStability}`);
        assert.ok(stats.lateralStability >= 1, `lateralStability must be >= 1, got ${stats.lateralStability}`);

        assert.ok(Number.isFinite(stats.rollDamping), `rollDamping must be finite, got ${stats.rollDamping}`);
        assert.ok(stats.rollDamping >= 1, `rollDamping must be >= 1, got ${stats.rollDamping}`);

        assert.ok(Number.isFinite(stats.steeringAgility), `steeringAgility must be finite, got ${stats.steeringAgility}`);
        assert.ok(stats.steeringAgility >= 1, `steeringAgility must be >= 1, got ${stats.steeringAgility}`);

        assert.ok(Number.isFinite(stats.outriggerWidthFt), `outriggerWidthFt must be finite, got ${stats.outriggerWidthFt}`);
        assert.ok(stats.outriggerWidthFt >= 0, `outriggerWidthFt must be >= 0, got ${stats.outriggerWidthFt}`);
      }
    });
  });

  // ==========================================================================
  // 5. Cross-Category Slot Mismatch (Equipping wheels into frame socket)
  // ==========================================================================
  describe('Adversarial 5: Cross-Category Slot Inversion / Substitution', () => {
    it('gracefully handles cross-category part equipping (e.g. wheels as frame)', () => {
      // Intentionally put a topper ID in frameId, a frame in topperId, etc.
      const crossLoadout: TandemLoadout = {
        frameId: 'topper_shadow',
        drivetrainId: 'frame_cruiser',
        wheelsId: 'steering_twin_cruiser',
        steeringId: 'wheels_classic',
        stabilizerId: 'topper_boomer',
        topperId: 'stabilizer_training_wheels',
        paintThemeId: 'redbull_navy',
      };

      assert.doesNotThrow(() => {
        const stats = computeTandemAggregateStats(crossLoadout);
        assert.ok(stats.massKg > 140);
        assert.ok(stats.cadencePowerW >= 120);
        assert.ok(stats.lateralStability >= 1);
      });
    });
  });

  // ==========================================================================
  // 6. Fuzzing computeTandemDynoMetrics
  // ==========================================================================
  describe('Adversarial 6: computeTandemDynoMetrics Robustness', () => {
    it('handles direct TandemStats inputs including boundary values', () => {
      const boundaryStats: TandemStats = {
        massKg: 145,
        dragCoeff: 0.1,
        cadencePowerW: 150,
        lateralStability: 5,
        rollDamping: 2,
        steeringAgility: 5,
        outriggerWidthFt: 0,
      };

      const metrics = computeTandemDynoMetrics(boundaryStats);
      assert.ok(Number.isFinite(metrics.rolloverThresholdDeg));
      assert.ok(metrics.rolloverThresholdDeg >= 18);
      assert.ok(Number.isFinite(metrics.powerToWeightRatioWKg));
      assert.ok(Number.isFinite(metrics.stabilityScore));
      assert.ok(Number.isFinite(metrics.speedScore));
      assert.ok(Number.isFinite(metrics.agilityScore));
      assert.ok(typeof metrics.dynoStatus === 'string');
      assert.ok(metrics.dynoStatusLabel.length > 0);
      assert.ok(metrics.dynoAdvice.length > 0);
    });

    it('evaluates status branches correctly across extreme configurations', () => {
      // Ultra-stable branch: outriggerWidthFt >= 3.0 && lateralStability >= 70
      const stableStats: TandemStats = {
        massKg: 160,
        dragCoeff: 0.5,
        cadencePowerW: 300,
        lateralStability: 80,
        rollDamping: 20,
        steeringAgility: 10,
        outriggerWidthFt: 3.5,
      };
      const stableMetrics = computeTandemDynoMetrics(stableStats);
      assert.strictEqual(stableMetrics.dynoStatus, 'ultra_stable');

      // Twitchy branch: outriggerWidthFt <= 0.5 && steeringAgility >= 60
      const twitchyStats: TandemStats = {
        massKg: 150,
        dragCoeff: 0.2,
        cadencePowerW: 400,
        lateralStability: 50,
        rollDamping: 10,
        steeringAgility: 70,
        outriggerWidthFt: 0.2,
      };
      const twitchyMetrics = computeTandemDynoMetrics(twitchyStats);
      assert.strictEqual(twitchyMetrics.dynoStatus, 'twitchy');

      // Top-heavy branch: lateralStability < 40
      const topHeavyStats: TandemStats = {
        massKg: 150,
        dragCoeff: 0.3,
        cadencePowerW: 300,
        lateralStability: 25,
        rollDamping: 5,
        steeringAgility: 30,
        outriggerWidthFt: 1.0,
      };
      const topHeavyMetrics = computeTandemDynoMetrics(topHeavyStats);
      assert.strictEqual(topHeavyMetrics.dynoStatus, 'top_heavy');
    });
  });

  // ==========================================================================
  // 7. Catalog Lookup & Boundary APIs
  // ==========================================================================
  describe('Adversarial 7: Catalog Query Edge Cases', () => {
    it('getTandemPartById with unknown id and arbitrary fallback category', () => {
      for (const cat of TANDEM_CATEGORIES) {
        const part = getTandemPartById('completely_missing_xyz', cat);
        assert.ok(part, `Fallback for ${cat} must return part`);
        assert.strictEqual(part.category, cat);
        assert.strictEqual(part.unlockStars, 0);
      }
    });

    it('isPartUnlocked handles edge cases (NaN, Infinity, negative stars)', () => {
      const part = { unlockStars: 4 };
      assert.strictEqual(isPartUnlocked(null, 5), false);
      assert.strictEqual(isPartUnlocked(undefined, 5), false);
      assert.strictEqual(isPartUnlocked(part, NaN), false);
      assert.strictEqual(isPartUnlocked(part, -5), false);
      assert.strictEqual(isPartUnlocked(part, Infinity), true);
      assert.strictEqual(isPartUnlocked(part, 3.999), false);
      assert.strictEqual(isPartUnlocked(part, 4.0), true);
    });

    it('getPresetById falls back to first preset on missing id', () => {
      const result = getPresetById('unknown_preset_123');
      assert.ok(result);
      assert.strictEqual(result.id, TANDEM_PRESETS[0].id);
    });
  });
});
