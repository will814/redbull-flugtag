/**
 * Red Bull Tandem Bike Challenge — Milestone 2 Adversarial Stress Test Suite
 * Empirical Challenger 2 Verification Harness
 *
 * Rigorously stress-tests TandemPhysicsEngine.ts against:
 * 1. Sub-millimeter beam boundary (|z| = 1.499 ft vs 1.501 ft)
 * 2. Exact critical roll threshold (|roll| = thetaCrit - 0.005 vs thetaCrit + 0.005 rad)
 * 3. Violent counter-steer oscillations (+1.0 / -1.0 at 25 mph for 240 steps)
 * 4. Tap spamming and simultaneous sprint + brake inputs (speed >= 0, finite, bounded)
 * 5. Finish bell platform clamping (s >= 200 ft, phase: 'finished', post-finish immutability)
 * 6. Accumulator invariance and lag-spike resilience
 * 7. Multi-obstacle course navigation with real catalog presets
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIXED_DT,
  STANDARD_BEAM_HALF_WIDTH_FT,
  DEFAULT_CRITICAL_ROLL_RAD,
  GAP_TOUCHDOWN_CRITICAL_ROLL_RAD,
  FINISH_BELL_S,
  SEESAW_FULCRUM_S,
  GAP_JUMP_START_S,
  GAP_JUMP_END_S,
  createInitialTandemState,
  resetTandemState,
  triggerDockSyncLaunch,
  computeCriticalRollThreshold,
  getTrackElevationAtDistance,
  updateSeesawBridgeDynamics,
  calculateSeesawTorque,
  applyWaterCannonBlast,
  stepTandemPhysics,
  updateTandemSimulationWithAccumulator,
} from '../src/tandem/TandemPhysicsEngine.ts';
import {
  TANDEM_PRESETS,
  computeTandemAggregateStats,
} from '../src/tandem/TandemPartCatalog.ts';
import type { TandemStats, TandemControls } from '../src/tandem/types.ts';

const BASELINE_STATS: TandemStats = {
  massKg: 160,
  dragCoeff: 0.45,
  cadencePowerW: 400,
  lateralStability: 1.0,
  rollDamping: 0.8,
  steeringAgility: 1.0,
  outriggerWidthFt: 2.0,
};

const NEUTRAL_CONTROLS: TandemControls = {
  steer: 0,
  pedalCadence: false,
  sprint: false,
  brake: false,
  leanRoll: 0,
};

test('Milestone 2 Challenger — Adversarial Stress Suite', async (t) => {
  // ==========================================================================
  // VECTOR 1: Sub-Millimeter Beam Boundary
  // ==========================================================================
  await t.test('Vector 1: Sub-millimeter beam boundary (|z| = 1.499 ft vs 1.501 ft)', async (t1) => {
    await t1.test('Positive offset: z = +1.499 ft remains riding, z = +1.501 ft splashes down', () => {
      const sSafe = createInitialTandemState();
      sSafe.phase = 'riding';
      sSafe.lateralOffsetFt = 1.499;

      const sSplash = createInitialTandemState();
      sSplash.phase = 'riding';
      sSplash.lateralOffsetFt = 1.501;

      stepTandemPhysics(sSafe, BASELINE_STATS, NEUTRAL_CONTROLS, FIXED_DT);
      stepTandemPhysics(sSplash, BASELINE_STATS, NEUTRAL_CONTROLS, FIXED_DT);

      assert.strictEqual(sSafe.phase, 'riding', 'z = +1.499 ft must stay riding');
      assert.strictEqual(sSafe.isOffBeam, false, 'z = +1.499 ft must not be marked off-beam');

      assert.strictEqual(sSplash.phase, 'splashdown', 'z = +1.501 ft must trigger splashdown');
      assert.strictEqual(sSplash.isOffBeam, true, 'z = +1.501 ft must be marked off-beam');
      assert.strictEqual(sSplash.speedMph, 0, 'Splashdown must halt vehicle speed');
      assert.ok(sSplash.splashEvents.length >= 1, 'Splashdown event must be recorded');
    });

    await t1.test('Negative offset: z = -1.499 ft remains riding, z = -1.501 ft splashes down', () => {
      const sSafe = createInitialTandemState();
      sSafe.phase = 'riding';
      sSafe.lateralOffsetFt = -1.499;

      const sSplash = createInitialTandemState();
      sSplash.phase = 'riding';
      sSplash.lateralOffsetFt = -1.501;

      stepTandemPhysics(sSafe, BASELINE_STATS, NEUTRAL_CONTROLS, FIXED_DT);
      stepTandemPhysics(sSplash, BASELINE_STATS, NEUTRAL_CONTROLS, FIXED_DT);

      assert.strictEqual(sSafe.phase, 'riding', 'z = -1.499 ft must stay riding');
      assert.strictEqual(sSplash.phase, 'splashdown', 'z = -1.501 ft must trigger splashdown');
    });

    await t1.test('Dynamic drift across boundary triggers splashdown at exact timestep of breach', () => {
      const s = createInitialTandemState();
      s.phase = 'riding';
      s.speedMph = 15;
      s.lateralOffsetFt = 1.45; // 0.05 ft away from 1.50 ft edge

      let stepsUntilSplash = 0;
      for (let i = 0; i < 20; i++) {
        stepTandemPhysics(s, BASELINE_STATS, { ...NEUTRAL_CONTROLS, steer: 1.0 }, FIXED_DT);
        stepsUntilSplash++;
        if (s.phase === 'splashdown') break;
      }

      assert.strictEqual(s.phase, 'splashdown', 'Must splash down after drifting off beam');
      assert.ok(stepsUntilSplash <= 5, `Should breach beam in <= 5 steps, took ${stepsUntilSplash}`);
      assert.ok(Math.abs(s.lateralOffsetFt) >= STANDARD_BEAM_HALF_WIDTH_FT, 'Breach position >= half-width');
    });
  });

  // ==========================================================================
  // VECTOR 2: Exact Critical Roll Threshold
  // ==========================================================================
  await t.test('Vector 2: Exact critical roll threshold (|roll| = thetaCrit +/- 0.005 rad)', async (t2) => {
    const thetaCrit = computeCriticalRollThreshold(BASELINE_STATS);
    assert.ok(Math.abs(thetaCrit - DEFAULT_CRITICAL_ROLL_RAD) < 1e-5, 'Baseline thetaCrit equals default rad');

    await t2.test('Positive roll: thetaCrit - 0.005 rad remains riding, thetaCrit + 0.005 rad splashes down', () => {
      const sSafe = createInitialTandemState();
      sSafe.phase = 'riding';
      sSafe.rollAngleRad = thetaCrit - 0.005;

      const sTip = createInitialTandemState();
      sTip.phase = 'riding';
      sTip.rollAngleRad = thetaCrit + 0.005;

      stepTandemPhysics(sSafe, BASELINE_STATS, NEUTRAL_CONTROLS, FIXED_DT);
      stepTandemPhysics(sTip, BASELINE_STATS, NEUTRAL_CONTROLS, FIXED_DT);

      assert.strictEqual(sSafe.phase, 'riding', 'Roll below critical angle must stay riding');
      assert.strictEqual(sTip.phase, 'splashdown', 'Roll above critical angle must trigger splashdown');
    });

    await t2.test('Negative roll: -(thetaCrit - 0.005) rad remains riding, -(thetaCrit + 0.005) rad splashes down', () => {
      const sSafe = createInitialTandemState();
      sSafe.phase = 'riding';
      sSafe.rollAngleRad = -(thetaCrit - 0.005);

      const sTip = createInitialTandemState();
      sTip.phase = 'riding';
      sTip.rollAngleRad = -(thetaCrit + 0.005);

      stepTandemPhysics(sSafe, BASELINE_STATS, NEUTRAL_CONTROLS, FIXED_DT);
      stepTandemPhysics(sTip, BASELINE_STATS, NEUTRAL_CONTROLS, FIXED_DT);

      assert.strictEqual(sSafe.phase, 'riding', 'Negative roll below threshold must stay riding');
      assert.strictEqual(sTip.phase, 'splashdown', 'Negative roll beyond threshold must splashdown');
    });

    await t2.test('Restoring torque stabilizes safe roll angle toward 0', () => {
      const s = createInitialTandemState();
      s.phase = 'riding';
      s.rollAngleRad = thetaCrit - 0.05; // 0.05 rad below threshold

      // Step physics without steering or active lean: outriggers and gravity interact
      stepTandemPhysics(s, BASELINE_STATS, NEUTRAL_CONTROLS, FIXED_DT);

      assert.strictEqual(s.phase, 'riding');
      assert.ok(
        Math.abs(s.rollAngleRad) < thetaCrit - 0.05,
        `Outriggers should restore roll toward vertical: got ${s.rollAngleRad}`
      );
    });

    await t2.test('Wide vs narrow outrigger stability scaling across catalog loadouts', () => {
      const narrowStats: TandemStats = { ...BASELINE_STATS, outriggerWidthFt: 0.5 };
      const wideStats: TandemStats = { ...BASELINE_STATS, outriggerWidthFt: 4.5 };

      const thetaNarrow = computeCriticalRollThreshold(narrowStats);
      const thetaWide = computeCriticalRollThreshold(wideStats);

      assert.ok(thetaWide > thetaNarrow, `Wide outriggers (${thetaWide} rad) must exceed narrow (${thetaNarrow} rad)`);
      assert.ok(thetaNarrow >= (18 * Math.PI) / 180, 'Narrow outriggers still guarantee >= 18 deg');
      assert.ok(thetaWide <= (45 * Math.PI) / 180, 'Wide outriggers bounded <= 45 deg');
    });
  });

  // ==========================================================================
  // VECTOR 3: Violent Counter-Steer Oscillations
  // ==========================================================================
  await t.test('Vector 3: Violent counter-steer oscillations (+1.0 / -1.0 at 25 mph for 240 steps)', async (t3) => {
    await t3.test('1-step alternating steer (+1.0 / -1.0) maintains strict numerical stability', () => {
      const s = createInitialTandemState();
      s.phase = 'riding';
      s.speedMph = 25;
      s.distanceFt = 20;

      for (let i = 0; i < 240; i++) {
        const steer = i % 2 === 0 ? 1.0 : -1.0;
        stepTandemPhysics(s, BASELINE_STATS, { ...NEUTRAL_CONTROLS, steer, pedalCadence: true }, FIXED_DT);

        assert.ok(!Number.isNaN(s.speedMph), `Speed must not be NaN at step ${i}`);
        assert.ok(!Number.isNaN(s.rollAngleRad), `Roll angle must not be NaN at step ${i}`);
        assert.ok(!Number.isNaN(s.lateralOffsetFt), `Lateral offset must not be NaN at step ${i}`);
        assert.ok(Number.isFinite(s.speedMph), `Speed must be finite at step ${i}`);
        assert.ok(Number.isFinite(s.rollAngleRad), `Roll angle must be finite at step ${i}`);
        assert.ok(Number.isFinite(s.lateralOffsetFt), `Lateral offset must be finite at step ${i}`);
      }

      assert.strictEqual(s.phase, 'riding', '1-step rapid counter-steer must not throw bike off beam');
      assert.ok(Math.abs(s.lateralOffsetFt) < STANDARD_BEAM_HALF_WIDTH_FT, 'Must stay bounded on beam');
      assert.ok(s.speedMph >= 20 && s.speedMph <= 35, `Speed should remain healthy (~25 mph): got ${s.speedMph}`);
    });

    await t3.test('Multi-frequency square-wave steering sweeps remain bounded and finite', () => {
      for (const period of [2, 4, 8, 16]) {
        const s = createInitialTandemState();
        s.phase = 'riding';
        s.speedMph = 25;
        s.distanceFt = 20;

        for (let i = 0; i < 240; i++) {
          const steer = Math.floor(i / period) % 2 === 0 ? 1.0 : -1.0;
          stepTandemPhysics(s, BASELINE_STATS, { ...NEUTRAL_CONTROLS, steer, pedalCadence: true }, FIXED_DT);
        }

        assert.ok(!Number.isNaN(s.speedMph));
        assert.ok(!Number.isNaN(s.rollAngleRad));
        assert.ok(!Number.isNaN(s.lateralOffsetFt));
        assert.ok(Number.isFinite(s.speedMph));
        assert.ok(Number.isFinite(s.rollAngleRad));
        assert.ok(Number.isFinite(s.lateralOffsetFt));
      }
    });

    await t3.test('Simultaneous extreme steer (+1.0) and extreme lean (-1.0) counter-lean dynamics', () => {
      const s = createInitialTandemState();
      s.phase = 'riding';
      s.speedMph = 20;
      s.distanceFt = 20;

      for (let i = 0; i < 120; i++) {
        // High speed right turn with active left body lean
        stepTandemPhysics(
          s,
          BASELINE_STATS,
          { ...NEUTRAL_CONTROLS, steer: 1.0, leanRoll: -1.0, pedalCadence: true },
          FIXED_DT
        );
        assert.ok(!Number.isNaN(s.rollAngleRad));
        assert.ok(Number.isFinite(s.rollAngleRad));
      }
    });
  });

  // ==========================================================================
  // VECTOR 4: Tap Spamming & Simultaneous Contradictory Inputs
  // ==========================================================================
  await t.test('Vector 4: Tap spamming and simultaneous sprint + brake inputs', async (t4) => {
    await t4.test('High-frequency cadence tap spamming (toggled every tick for 240 steps)', () => {
      const s = createInitialTandemState();
      s.phase = 'riding';
      s.speedMph = 10;
      s.distanceFt = 20;

      for (let i = 0; i < 240; i++) {
        const pedalCadence = i % 2 === 0;
        stepTandemPhysics(s, BASELINE_STATS, { ...NEUTRAL_CONTROLS, pedalCadence }, FIXED_DT);

        assert.ok(s.speedMph >= 0, `Speed must never be negative during tap spam: step ${i} speed=${s.speedMph}`);
        assert.ok(Number.isFinite(s.speedMph), `Speed must be finite at step ${i}`);
        assert.ok(s.cadenceRpm >= 0, `Cadence RPM must be non-negative: ${s.cadenceRpm}`);
      }

      assert.ok(s.speedMph > 5, 'Tap spamming should maintain forward momentum');
    });

    await t4.test('Simultaneous Sprint + Brake + PedalCadence resolves with non-negative speed', () => {
      const s = createInitialTandemState();
      s.phase = 'riding';
      s.speedMph = 15;
      s.distanceFt = 30;

      for (let i = 0; i < 240; i++) {
        stepTandemPhysics(
          s,
          BASELINE_STATS,
          { ...NEUTRAL_CONTROLS, pedalCadence: true, sprint: true, brake: true },
          FIXED_DT
        );

        assert.ok(s.speedMph >= 0, `Speed must not drop below 0: step ${i} speed=${s.speedMph}`);
        assert.ok(Number.isFinite(s.speedMph), `Speed must be finite: ${s.speedMph}`);
      }

      assert.ok(s.speedMph < 5, `Brake drag dominates thrust at low speed: got ${s.speedMph}`);
    });

    await t4.test('Brake from dead stop on flat surface does not accelerate backwards', () => {
      const s = createInitialTandemState();
      s.phase = 'riding';
      s.speedMph = 0;
      s.distanceFt = 25;

      for (let i = 0; i < 60; i++) {
        stepTandemPhysics(s, BASELINE_STATS, { ...NEUTRAL_CONTROLS, brake: true }, FIXED_DT);
        assert.strictEqual(s.speedMph, 0, 'Braking at 0 mph on flat track must yield exactly 0 mph');
        assert.strictEqual(s.distanceFt, 25, 'Distance must not change');
      }
    });

    await t4.test('Simultaneous maximum steer + sprint + brake + tap spamming integrity', () => {
      const s = createInitialTandemState();
      s.phase = 'riding';
      s.speedMph = 12;

      for (let i = 0; i < 180; i++) {
        stepTandemPhysics(
          s,
          BASELINE_STATS,
          {
            steer: i % 4 < 2 ? 1.0 : -1.0,
            pedalCadence: i % 3 === 0,
            sprint: true,
            brake: true,
            leanRoll: i % 2 === 0 ? 0.5 : -0.5,
          },
          FIXED_DT
        );

        assert.ok(s.speedMph >= 0, `Speed >= 0: ${s.speedMph}`);
        assert.ok(Number.isFinite(s.speedMph), `Speed finite: ${s.speedMph}`);
        assert.ok(Number.isFinite(s.distanceFt), `Distance finite: ${s.distanceFt}`);
        assert.ok(Number.isFinite(s.rollAngleRad), `Roll finite: ${s.rollAngleRad}`);
      }
    });
  });

  // ==========================================================================
  // VECTOR 5: Finish Bell Platform Clamping & State Machine
  // ==========================================================================
  await t.test('Vector 5: Finish bell platform (distance >= 600 ft, phase: finished)', async (t5) => {
    await t5.test('Crossing finish line (s >= 600 ft) cleanly triggers finished phase and bell event', () => {
      const s = createInitialTandemState();
      s.phase = 'riding';
      s.distanceFt = FINISH_BELL_S - 0.1;
      s.speedMph = 25;

      const events = stepTandemPhysics(
        s,
        BASELINE_STATS,
        { ...NEUTRAL_CONTROLS, pedalCadence: true },
        FIXED_DT
      );

      assert.strictEqual(s.phase, 'finished', 'Phase must transition to finished');
      assert.strictEqual(s.hasFinished, true, 'hasFinished flag must be true');
      assert.strictEqual(events.bellRung, true, 'bellRung event must fire');
      assert.ok(s.distanceFt >= FINISH_BELL_S, `Distance (${s.distanceFt}) must be >= 600 ft`);
    });

    await t5.test('Starting at or beyond finish line immediately locks into finished phase', () => {
      const s = createInitialTandemState();
      s.phase = 'riding';
      s.distanceFt = FINISH_BELL_S;
      s.speedMph = 18;

      const events = stepTandemPhysics(
        s,
        BASELINE_STATS,
        { ...NEUTRAL_CONTROLS, pedalCadence: true },
        FIXED_DT
      );

      assert.strictEqual(s.phase, 'finished');
      assert.strictEqual(events.bellRung, true);
      assert.strictEqual(s.distanceFt, FINISH_BELL_S);
    });

    await t5.test('Post-finish immutability: subsequent physics steps cannot alter finished state', () => {
      const s = createInitialTandemState();
      s.phase = 'finished';
      s.hasFinished = true;
      s.distanceFt = FINISH_BELL_S + 0.15;
      s.speedMph = 22;

      for (let i = 0; i < 120; i++) {
        const events = stepTandemPhysics(
          s,
          BASELINE_STATS,
          { ...NEUTRAL_CONTROLS, steer: 1.0, pedalCadence: true, sprint: true },
          FIXED_DT
        );

        assert.strictEqual(s.phase, 'finished');
        assert.strictEqual(s.hasFinished, true);
        assert.strictEqual(s.distanceFt, FINISH_BELL_S + 0.15, 'Distance must remain strictly locked after finish');
        assert.strictEqual(events.splashOccurred, false, 'Cannot splashdown once finished');
      }
    });

    await t5.test('Splashdown takes precedence if tipped over before finish line', () => {
      const s = createInitialTandemState();
      s.phase = 'riding';
      s.distanceFt = FINISH_BELL_S - 5.0; // 5 ft before bell
      s.rollAngleRad = 1.0; // Heavily tipped (> crit roll)

      const events = stepTandemPhysics(s, BASELINE_STATS, NEUTRAL_CONTROLS, FIXED_DT);
      assert.strictEqual(s.phase, 'splashdown');
      assert.strictEqual(events.splashOccurred, true);
      assert.strictEqual(events.bellRung, false);
      assert.strictEqual(s.hasFinished, false);
    });
  });

  // ==========================================================================
  // VECTOR 6: Degenerate Inputs & Accumulator Stress
  // ==========================================================================
  await t.test('Vector 6: Degenerate inputs, lag spikes, and accumulator invariance', async (t6) => {
    await t6.test('Immunity to NaN, Infinity, negative, and zero dt values', () => {
      const s = createInitialTandemState();
      s.phase = 'riding';
      s.distanceFt = 10;
      s.speedMph = 8;

      const badDts = [NaN, Infinity, -Infinity, -0.05, 0, -1e-6];
      for (const badDt of badDts) {
        const events = stepTandemPhysics(s, BASELINE_STATS, { ...NEUTRAL_CONTROLS, pedalCadence: true }, badDt);
        assert.strictEqual(s.distanceFt, 10, `dt=${badDt} must not alter distance`);
        assert.strictEqual(s.speedMph, 8, `dt=${badDt} must not alter speed`);
        assert.strictEqual(events.splashOccurred, false);
      }
    });

    await t6.test('Massive browser lag spikes (dt = 5.0s, 10.0s) clamped cleanly without crash', () => {
      const s = createInitialTandemState();
      s.phase = 'riding';
      s.distanceFt = 10;
      s.speedMph = 10;

      updateTandemSimulationWithAccumulator(s, BASELINE_STATS, { ...NEUTRAL_CONTROLS, pedalCadence: true }, 5.0);
      assert.ok(!Number.isNaN(s.speedMph));
      assert.ok(!Number.isNaN(s.distanceFt));
      assert.ok(s.distanceFt > 10 && s.distanceFt < 50, 'Clamped lag advances reasonable distance');
    });

    await t6.test('Extreme and NaN controls inputs safely coerced without NaN propagation', () => {
      const s = createInitialTandemState();
      s.phase = 'riding';
      s.speedMph = 10;

      const badControls: any = {
        steer: NaN,
        pedalCadence: null,
        sprint: undefined,
        brake: false,
        leanRoll: Infinity,
      };

      stepTandemPhysics(s, BASELINE_STATS, badControls, FIXED_DT);
      assert.ok(!Number.isNaN(s.speedMph), 'Speed must not be NaN');
      assert.ok(!Number.isNaN(s.rollAngleRad), 'Roll must not be NaN');
      assert.ok(!Number.isNaN(s.lateralOffsetFt), 'Lateral offset must not be NaN');
    });
  });

  // ==========================================================================
  // VECTOR 7: Real Catalog Presets Course Dynamics & Gap Ballistics
  // ==========================================================================
  await t.test('Vector 7: Course dynamics and gap jump ballistics across catalog presets', async (t7) => {
    await t7.test('Sprint specialists (Lake Speedster & Red Bull Winged) successfully jump gap to Finish Bell', () => {
      for (const presetId of ['preset_lake_speedster', 'preset_winged_tandem']) {
        const preset = TANDEM_PRESETS.find((p) => p.id === presetId)!;
        const stats = computeTandemAggregateStats(preset.loadout);
        const s = createInitialTandemState();

        triggerDockSyncLaunch(s, 0.90);
        let steps = 0;
        while (s.phase === 'riding' && steps < 3600) {
          const isApproachingGap = s.distanceFt >= 140 && s.distanceFt <= 185;
          stepTandemPhysics(
            s,
            stats,
            { ...NEUTRAL_CONTROLS, pedalCadence: true, sprint: isApproachingGap },
            FIXED_DT
          );
          steps++;
        }

        assert.strictEqual(s.phase, 'finished', `${preset.name} must finish course`);
        assert.ok(s.distanceFt >= FINISH_BELL_S);
        assert.strictEqual(s.hasFinished, true);
      }
    });

    await t7.test('Boomer Heavy Hauler clears gap jump with sustained early momentum', () => {
      const preset = TANDEM_PRESETS.find((p) => p.id === 'preset_heavy_hauler')!;
      const stats = computeTandemAggregateStats(preset.loadout);
      const s = createInitialTandemState();

      triggerDockSyncLaunch(s, 1.0);
      let steps = 0;
      while (s.phase === 'riding' && steps < 3600) {
        // Build momentum earlier for heavy hauler (195 kg mass)
        const sprint = s.distanceFt >= 20 && (s as any).sprintStamina > 0.1;
        stepTandemPhysics(
          s,
          stats,
          { ...NEUTRAL_CONTROLS, pedalCadence: true, sprint },
          FIXED_DT
        );
        steps++;
      }

      assert.strictEqual(s.phase, 'finished', 'Heavy Hauler clears with early sprint');
      assert.ok(s.distanceFt >= FINISH_BELL_S);
    });

    await t7.test('Starter Sync Cruiser (360W) demonstrates realistic water gap splashdown at sub-threshold speed', () => {
      const preset = TANDEM_PRESETS.find((p) => p.id === 'preset_sync_cruiser')!;
      const stats = computeTandemAggregateStats(preset.loadout);
      const s = createInitialTandemState();

      triggerDockSyncLaunch(s, 0.85);
      let steps = 0;
      while (s.phase === 'riding' && steps < 3600) {
        stepTandemPhysics(
          s,
          stats,
          { ...NEUTRAL_CONTROLS, pedalCadence: true, sprint: s.distanceFt >= 150 },
          FIXED_DT
        );
        steps++;
      }

      assert.strictEqual(s.phase, 'splashdown', 'Cruiser below 19.5 mph falls into water gap');
      assert.ok(
        s.distanceFt >= GAP_JUMP_START_S && s.distanceFt < GAP_JUMP_END_S,
        `Splashdown occurs inside gap (160..185 ft): got ${s.distanceFt.toFixed(1)} ft`
      );
      assert.strictEqual(s.isOffBeam, true);
    });
  });
});
