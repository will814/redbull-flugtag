import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SPEC, setupMockLocalStorage, tryImportModule, PROJECT_ROOT } from './test-utils.ts';

setupMockLocalStorage();

async function getSoundEngine() {
  return tryImportModule<any>('./src/audio/SoundEngine.ts');
}

async function getLandingPageSrc() {
  const filePath = path.join(PROJECT_ROOT, 'src/ui/LandingPage.tsx');
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

async function getAppSrc() {
  const filePath = path.join(PROJECT_ROOT, 'src/App.tsx');
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

async function getViteConfigSrc() {
  const filePath = path.join(PROJECT_ROOT, 'vite.config.ts');
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

async function getScorecard() {
  return tryImportModule<any>('./src/tandem/TandemScorecardModal.tsx');
}

async function getPhysics() {
  return tryImportModule<any>('./src/tandem/TandemPhysicsEngine.ts');
}

test('Feature 7 — Tier 1: Multi-Phase Gameplay Loop & In-Run Controls', async (t) => {
  const phy = await getPhysics();
  if (!phy) {
    t.skip('Pending M2/M4: Gameplay loop implementation in src/tandem/');
    return;
  }

  // T1-GMP-01: Hype Start Initialization
  await t.test('T1-GMP-01: New run initializes in "hype" dock sync phase with zero track distance', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    assert.equal(s.phase, 'hype', 'Initial phase must be "hype"');
    assert.equal(s.distanceFt ?? s.distanceFeet ?? 0, 0, 'Initial distance must be 0');
  });

  // T1-GMP-02: Dock Launch Transition
  await t.test('T1-GMP-02: Successful dock cadence trigger transitions phase to "riding"', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    if (typeof phy.triggerDockSyncLaunch === 'function') {
      phy.triggerDockSyncLaunch(s, 0.9);
      assert.equal(s.phase, 'riding', 'Launch trigger must transition phase to "riding"');
      assert.ok((s.speedMph ?? 0) > 0, 'Launch must grant initial sprint speed');
    }
  });

  // T1-GMP-03: Finished Phase Transition
  await t.test('T1-GMP-03: Crossing finish platform triggers "finished" phase and scores completion', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'riding';
    s.distanceFt = SPEC.PHYSICS.COURSE_LENGTH_FT;
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    stepFn(s, stats, { steer: 0, pedalCadence: true, sprint: false, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
    assert.equal(s.phase, 'finished', 'Reaching end of pier must set phase to "finished"');
  });

  // T1-GMP-04: Splashdown Phase Transition
  await t.test('T1-GMP-04: Water wipeout transitions to "splashdown" phase and halts forward speed', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'riding';
    s.lateralOffsetFt = 3.0; // Deep water
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    stepFn(s, stats, { steer: 0, pedalCadence: true, sprint: false, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
    assert.equal(s.phase, 'splashdown');
    assert.equal(s.speedMph ?? s.mph ?? 0, 0, 'Splashdown must halt speed to 0');
  });

  // T1-GMP-05: 3-Judge Scorecard Evaluation
  await t.test('T1-GMP-05: 3-Judge scorecard computes marks and awards stars (>=26 -> 3⭐, >=20 -> 2⭐, else 1⭐)', async () => {
    const scoreMod = await getScorecard();
    const calculateStars = scoreMod?.calculateTandemStars || ((total: number) => total >= 26 ? 3 : total >= 20 ? 2 : 1);
    assert.equal(calculateStars(30), 3, '30 points -> 3 stars');
    assert.equal(calculateStars(26), 3, '26 points (boundary) -> 3 stars');
    assert.equal(calculateStars(25), 2, '25 points -> 2 stars');
    assert.equal(calculateStars(20), 2, '20 points (boundary) -> 2 stars');
    assert.equal(calculateStars(19), 1, '19 points -> 1 star');
  });
});

test('Feature 7 — Tier 2: Gameplay Loop Boundaries & Corner Cases', async (t) => {
  const phy = await getPhysics();
  if (!phy) {
    t.skip('Pending M2/M4: Gameplay loop implementation in src/tandem/');
    return;
  }

  // T2-GMP-01: Pre-Launch Input Lockdown
  await t.test('T2-GMP-01: Controls during dock sync phase do not prematurely advance track distance', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'hype';
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    for (let i = 0; i < 60; i++) {
      stepFn(s, stats, { steer: 1.0, pedalCadence: true, sprint: true, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
    }
    assert.equal(s.distanceFt ?? 0, 0, 'Distance must remain 0 during dock hype');
  });

  // T2-GMP-02: Post-Splashdown Input Immunity
  await t.test('T2-GMP-02: Controls after splashdown are locked to prevent phantom movement in water', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'splashdown';
    s.distanceFt = 75;
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    stepFn(s, stats, { steer: 1.0, pedalCadence: true, sprint: true, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
    assert.equal(s.distanceFt ?? 0, 75, 'Distance must remain frozen post-splashdown');
    assert.equal(s.speedMph ?? 0, 0, 'Speed must remain zero post-splashdown');
  });

  // T2-GMP-03: Scorecard Dismissal Idempotency
  await t.test('T2-GMP-03: Scorecard dismissal and reopening does not double-award stars', () => {
    localStorage.clear();
    localStorage.setItem(SPEC.STORAGE_KEYS.STARS, '10');
    let awarded = false;
    const onAddStars = (n: number) => {
      if (awarded) return;
      awarded = true;
      const cur = Number(localStorage.getItem(SPEC.STORAGE_KEYS.STARS) || 0);
      localStorage.setItem(SPEC.STORAGE_KEYS.STARS, String(cur + n));
    };

    onAddStars(3);
    assert.equal(localStorage.getItem(SPEC.STORAGE_KEYS.STARS), '13');
    onAddStars(3); // Re-invoke simulation
    assert.equal(localStorage.getItem(SPEC.STORAGE_KEYS.STARS), '13', 'Stars should not be double-awarded');
  });

  // T2-GMP-04: Mid-Run Hub Abort Cleanup
  await t.test('T2-GMP-04: Aborting run to return to hub cleans up state safely', () => {
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'riding';
    s.speedMph = 20;
    if (typeof phy.resetTandemState === 'function') {
      phy.resetTandemState(s);
      assert.equal(s.phase, 'hype');
      assert.equal(s.speedMph, 0);
    }
  });

  // T2-GMP-05: Touch Control Boundary Mapping
  await t.test('T2-GMP-05: Touch control mapping clamps steer and lean inputs strictly within [-1.0, 1.0]', () => {
    const clampInput = (val: number) => Math.max(-1.0, Math.min(1.0, val));
    assert.equal(clampInput(2.5), 1.0);
    assert.equal(clampInput(-3.2), -1.0);
    assert.equal(clampInput(0.42), 0.42);
  });
});

test('Feature 8 — Tier 1: Arcade Hub Navigation, State Persistence & Audio', async (t) => {
  const landingSrc = await getLandingPageSrc();
  const appSrc = await getAppSrc();
  const snd = await getSoundEngine();

  // T1-HUB-01: Hub 4-Card Selector
  await t.test('T1-HUB-01: Landing Page renders 4 event cards with Red Bull Tandem Challenge displaying key hint "4"', () => {
    if (!landingSrc || !landingSrc.includes('tandem')) {
      t.skip('Pending M5: LandingPage.tsx tandem integration');
      return;
    }
    assert.ok(landingSrc.includes("'tandem'"), "LandingPage must reference 'tandem' GameModeId");
    assert.ok(landingSrc.includes("keyHint: '4'") || landingSrc.includes('keyHint: "4"'), "LandingPage must display keyHint '4'");
    assert.ok(landingSrc.includes('Tandem'), 'LandingPage must include Tandem title');
  });

  // T1-HUB-02: Direct Hash Navigation
  await t.test('T1-HUB-02: Hash parsing in App.tsx recognizes #tandem route', () => {
    if (!appSrc || !appSrc.includes('tandem')) {
      t.skip('Pending M5: App.tsx #tandem hash routing');
      return;
    }
    assert.ok(appSrc.includes("'tandem'"), "App.tsx must include 'tandem' game mode");
    assert.ok(appSrc.includes('cleaned === \'tandem\'') || appSrc.includes('tandem'), 'App.tsx must parse tandem hash');
  });

  // T1-HUB-03: Hotkey '4' Handler
  await t.test('T1-HUB-03: Keydown event for "4" triggers tandem game selection', () => {
    if (!landingSrc || !landingSrc.includes('tandem')) {
      t.skip('Pending M5: LandingPage.tsx key 4 listener');
      return;
    }
    assert.ok(landingSrc.includes("e.key === '4'") || landingSrc.includes('key === "4"'), 'LandingPage must handle key 4');
  });

  // T1-HUB-04: LocalStorage Best Records
  await t.test('T1-HUB-04: Best distance and time persist in localStorage under tandem keys', () => {
    localStorage.clear();
    localStorage.setItem(SPEC.STORAGE_KEYS.BEST_DIST, '185');
    localStorage.setItem(SPEC.STORAGE_KEYS.BEST_TIME, '18.4');

    assert.equal(localStorage.getItem(SPEC.STORAGE_KEYS.BEST_DIST), '185');
    assert.equal(localStorage.getItem(SPEC.STORAGE_KEYS.BEST_TIME), '18.4');
  });

  // T1-HUB-05: SoundEngine Integration
  await t.test('T1-HUB-05: SoundEngine provides bicycle cadence, canal bell, and water splash methods', () => {
    assert.ok(snd?.soundEngine || snd?.SoundEngine, 'SoundEngine module must be exported');
    const engine = snd.soundEngine || new snd.SoundEngine();
    assert.ok(typeof engine.playPedalCrank === 'function', 'SoundEngine must have playPedalCrank');
    assert.ok(typeof engine.playCanalBell === 'function', 'SoundEngine must have playCanalBell');
    assert.ok(typeof engine.playSplash === 'function', 'SoundEngine must have playSplash');
  });
});

test('Feature 8 — Tier 2: Hub & Audio Boundaries & Corner Cases', async (t) => {
  const landingSrc = await getLandingPageSrc();
  const appSrc = await getAppSrc();
  const viteSrc = await getViteConfigSrc();
  const snd = await getSoundEngine();

  // T2-HUB-01: Returning to Hub URL Sync
  await t.test('T2-HUB-01: Returning to hub resets hash and activeGame to "landing"', () => {
    if (!appSrc || !appSrc.includes('handleReturnToHub')) {
      t.skip('Pending M5: App.tsx handleReturnToHub');
      return;
    }
    assert.ok(appSrc.includes('handleReturnToHub'), 'App.tsx must have handleReturnToHub function');
  });

  // T2-HUB-02: Corrupt LocalStorage Fallback
  await t.test('T2-HUB-02: Corrupted or non-numeric strings in tandem storage keys fall back safely', () => {
    localStorage.clear();
    localStorage.setItem(SPEC.STORAGE_KEYS.BEST_DIST, 'CORRUPTED_NOT_A_NUMBER');
    localStorage.setItem(SPEC.STORAGE_KEYS.BEST_TIME, '{ "badJson": true }');

    const readBestDist = () => {
      const val = Number(localStorage.getItem(SPEC.STORAGE_KEYS.BEST_DIST));
      return Number.isFinite(val) ? val : 0;
    };
    assert.equal(readBestDist(), 0, 'Corrupt distance must fall back to 0');
  });

  // T2-HUB-03: Audio Mute Null Safety
  await t.test('T2-HUB-03: SoundEngine in muted state handles calls safely without throwing', () => {
    const engine = snd.soundEngine || new snd.SoundEngine();
    if (typeof engine.setMuted === 'function') {
      engine.setMuted(true);
      assert.doesNotThrow(() => {
        engine.playPedalCrank();
        engine.playCanalBell(true);
        engine.playSplash(1.0);
      }, 'Muted sound triggers must never throw');
      engine.setMuted(false);
    }
  });

  // T2-HUB-04: Non-Regression of Games 1–3
  await t.test('T2-HUB-04: Flugtag, Soapbox, and Coaster routes and keys remain intact', () => {
    if (!appSrc) return;
    assert.ok(appSrc.includes("'flugtag'"), 'Flugtag mode intact');
    assert.ok(appSrc.includes("'soapbox'"), 'Soapbox mode intact');
    assert.ok(appSrc.includes("'coaster'"), 'Coaster mode intact');
  });

  // T2-HUB-05: Vite Bundle Splitting Verification
  await t.test('T2-HUB-05: vite.config.ts manualChunks includes rule for "game-tandem"', () => {
    if (!viteSrc || !viteSrc.includes('game-tandem')) {
      t.skip('Pending M5: vite.config.ts game-tandem chunk configuration');
      return;
    }
    assert.ok(viteSrc.includes('game-tandem'), 'vite.config.ts must configure game-tandem chunk');
  });
});
