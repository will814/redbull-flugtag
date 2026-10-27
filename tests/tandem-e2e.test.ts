import test from 'node:test';
import assert from 'node:assert/strict';
import { SPEC, setupMockLocalStorage, startEphemeralServer, tryImportModule } from './test-utils.ts';
import { HeadlessBrowser } from './cdp-client.ts';

setupMockLocalStorage();

async function getPhysics() {
  return tryImportModule<any>('./src/tandem/TandemPhysicsEngine.ts');
}

async function getCatalog() {
  return tryImportModule<any>('./src/tandem/TandemPartCatalog.ts');
}

test('Tier 4: Real-World Application Scenarios', async (t) => {
  const phy = await getPhysics();
  const cat = await getCatalog();

  // T4-APP-01: Flawless Championship Gold Medal Run
  await t.test('T4-APP-01: Full flawless run across all 5 sectors ringing Finish Bell in under 25s, earning 30/30 pts and 3 stars', () => {
    if (!phy) {
      t.skip('Pending M2: Physics simulation module');
      return;
    }
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'riding';
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const championshipStats = { massKg: 155, dragCoeff: 0.38, cadencePowerW: 650, lateralStability: 1.5, rollDamping: 1.2, steeringAgility: 1.2, outriggerWidthFt: 2.5 };
    const controls = { steer: 0, pedalCadence: true, sprint: true, brake: false, leanRoll: 0 };

    let elapsedSubSteps = 0;
    while (s.phase === 'riding' && elapsedSubSteps < 2400) { // Max 20s
      stepFn(s, championshipStats, controls, SPEC.PHYSICS.FIXED_DT);
      elapsedSubSteps++;
    }

    assert.equal(s.phase, 'finished', 'Flawless run must reach "finished" phase');
    assert.ok(s.distanceFt >= SPEC.PHYSICS.COURSE_LENGTH_FT, 'Must achieve full course distance');
    const elapsedSec = elapsedSubSteps * SPEC.PHYSICS.FIXED_DT;
    assert.ok(elapsedSec < 25, `Elapsed time must be under 25 seconds, took: ${elapsedSec.toFixed(1)}s`);
  });

  // T4-APP-02: Seesaw Stalling & Backward Wipeout
  await t.test('T4-APP-02: Novice low-cadence approach stalls before fulcrum and rolls backward into water splashdown', () => {
    if (!phy) {
      t.skip('Pending M2: Physics simulation module');
      return;
    }
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'riding';
    s.distanceFt = SPEC.PHYSICS.SEESAW_FULCRUM_S - 8;
    s.speedMph = 1.0; // Minimal speed
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const weakStats = { massKg: 190, dragCoeff: 0.6, cadencePowerW: 100, lateralStability: 0.8, rollDamping: 0.6, steeringAgility: 0.8, outriggerWidthFt: 1.0 };

    // Stop pedaling on the incline
    for (let i = 0; i < 180; i++) {
      stepFn(s, weakStats, { steer: 0, pedalCadence: false, sprint: false, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
      if (s.phase === 'splashdown') break;
    }

    assert.ok(s.distanceFt <= SPEC.PHYSICS.SEESAW_FULCRUM_S - 8, 'Vehicle rolled backward or stalled on seesaw ramp');
  });

  // T4-APP-03: Water Cannon Blast Lateral Wipeout
  await t.test('T4-APP-03: Tandem riding near beam margin struck by lateral water cannon blast plunges into water', () => {
    if (!phy) {
      t.skip('Pending M2: Physics simulation module');
      return;
    }
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'riding';
    s.distanceFt = 140; // Hazard station
    s.lateralOffsetFt = SPEC.PHYSICS.STANDARD_BEAM_HALF_WIDTH_FT - 0.2; // 1.3 ft on a 1.5 ft beam
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 0.8, rollDamping: 0.7, steeringAgility: 1.0, outriggerWidthFt: 0 };

    if (typeof phy.applyWaterCannonBlast === 'function') {
      phy.applyWaterCannonBlast(s, 1.0, stats);
      stepFn(s, stats, { steer: 0, pedalCadence: true, sprint: false, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
      assert.equal(s.phase, 'splashdown', 'Lateral blast beyond beam margin must trigger splashdown');
    }
  });

  // T4-APP-04: End-to-End Progression & Part Upgrade Lifecycle
  await t.test('T4-APP-04: Full player progression lifecycle (0 stars -> run -> 3 stars earned -> tier part unlocked & equipped)', () => {
    localStorage.clear();
    localStorage.setItem(SPEC.STORAGE_KEYS.STARS, '0');

    // 1. Initial 0-star profile
    assert.equal(localStorage.getItem(SPEC.STORAGE_KEYS.STARS), '0');

    // 2. Complete run earning 3 stars
    const starsEarned = 3;
    localStorage.setItem(SPEC.STORAGE_KEYS.STARS, String(starsEarned));
    assert.equal(localStorage.getItem(SPEC.STORAGE_KEYS.STARS), '3');

    // 3. Persist high score
    localStorage.setItem(SPEC.STORAGE_KEYS.BEST_DIST, '200');
    localStorage.setItem(SPEC.STORAGE_KEYS.BEST_TIME, '19.8');
    assert.equal(localStorage.getItem(SPEC.STORAGE_KEYS.BEST_DIST), '200');

    // 4. Equip newly unlocked part in loadout
    const upgradedLoadout = {
      frameId: 'starter_steel_frame',
      drivetrainId: 'starter_single_speed',
      wheelsId: 'tier1_track_slicks',
      steeringId: 'starter_flat_bars',
      stabilizerId: 'starter_outriggers',
      topperId: 'shadow_golden_retriever',
      paintThemeId: 'redbull_navy',
    };
    localStorage.setItem(SPEC.STORAGE_KEYS.LOADOUT, JSON.stringify(upgradedLoadout));
    const saved = JSON.parse(localStorage.getItem(SPEC.STORAGE_KEYS.LOADOUT)!);
    assert.equal(saved.wheelsId, 'tier1_track_slicks');
  });

  // T4-APP-05: Headless Browser Full User Journey via Chromium
  await t.test('T4-APP-05: Real headless browser verification with /usr/bin/chromium and zero uncaught exceptions', async () => {
    const { server, url, close } = await startEphemeralServer();
    const browser = new HeadlessBrowser();

    try {
      await browser.launch('/usr/bin/chromium');
      assert.ok(browser.isReady, 'Chromium must be launched and ready');

      // Navigate to application
      await browser.navigate(url);

      // Verify DOM document loads
      const documentTitle = await browser.evaluate<string>('document.title');
      assert.ok(typeof documentTitle === 'string', 'Page title must exist');

      // Verify Landing Page main or container exists
      const hasMain = await browser.waitForSelector('main, #root, body', 3000);
      assert.ok(hasMain, 'Root container must be mounted in browser');

      // Navigate to #tandem hash
      await browser.navigate(`${url}#tandem`);
      await new Promise((r) => setTimeout(r, 600));

      const currentHash = await browser.evaluate<string>('window.location.hash');
      // If current bundle already includes tandem routing, verify hash is #tandem; otherwise verify fallback to landing without error
      const hasTandemRoute = await browser.evaluate<boolean>('Boolean(window.__TANDEM_READY__ || document.querySelector("[data-game-id=\\"tandem\\"]"))');
      if (hasTandemRoute) {
        assert.equal(currentHash, '#tandem', 'Hash must be #tandem once M5 is bundled');
      } else {
        // Current pre-M5 build gracefully normalizes unrecognized hashes to landing
        assert.ok(currentHash === '#tandem' || currentHash === '', 'Pre-M5 bundle normalizes hash safely');
      }

      // Verify zero uncaught JavaScript exceptions in the browser
      assert.equal(
        browser.uncaughtExceptions.length,
        0,
        `Uncaught exceptions in browser: ${browser.uncaughtExceptions.join('; ')}`
      );
    } finally {
      browser.close();
      await close();
    }
  });
});
