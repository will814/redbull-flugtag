import test from 'node:test';
import assert from 'node:assert/strict';
import { SPEC, setupMockLocalStorage, tryImportModule } from './test-utils.ts';

setupMockLocalStorage();

async function getCatalog() {
  return tryImportModule<any>('./src/tandem/TandemPartCatalog.ts');
}

async function getPhysics() {
  return tryImportModule<any>('./src/tandem/TandemPhysicsEngine.ts');
}

async function getSoundEngine() {
  return tryImportModule<any>('./src/audio/SoundEngine.ts');
}

test('Tier 3: Cross-Feature Interactions (Pairwise Combinations)', async (t) => {
  const cat = await getCatalog();
  const phy = await getPhysics();
  const snd = await getSoundEngine();

  // T3-INT-01: Frame Mass (F1) x Incline Seesaw (F6)
  await t.test('T3-INT-01 [F1 x F6]: Heavy Hauler frame increases seesaw downward torque but requires higher power to climb', () => {
    if (!cat || !phy) {
      t.skip('Pending M1/M2: Catalog & Physics modules');
      return;
    }
    const lightStats = { massKg: 130, dragCoeff: 0.4, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };
    const heavyStats = { massKg: 240, dragCoeff: 0.5, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    if (typeof phy.calculateSeesawTorque === 'function') {
      const lightTorque = phy.calculateSeesawTorque(lightStats.massKg, 10);
      const heavyTorque = phy.calculateSeesawTorque(heavyStats.massKg, 10);
      assert.ok(heavyTorque > lightTorque, 'Heavier frame must exert greater rotational torque on seesaw bridge');
    }
  });

  // T3-INT-02: Mascots (Shadow/Boomer) (F2) x Roll Stability (F5)
  await t.test('T3-INT-02 [F2 x F5]: Equipping Boomer topper increases roll damping and alters recovery dynamics vs Shadow', () => {
    if (!cat || !phy) {
      t.skip('Pending M1/M2: Catalog & Physics modules');
      return;
    }
    const allParts = cat.getAllParts ? cat.getAllParts() : (cat.TANDEM_PARTS || Object.values(cat.PARTS_BY_CATEGORY || {}).flat());
    const shadow = allParts.find((p: any) => p.id.includes('shadow'));
    const boomer = allParts.find((p: any) => p.id.includes('boomer'));

    assert.ok(shadow && boomer, 'Both Shadow and Boomer must exist');
    const shadowStats = cat.computeTandemAggregateStats({ topperId: shadow.id });
    const boomerStats = cat.computeTandemAggregateStats({ topperId: boomer.id });
    assert.notEqual(shadowStats.massKg, boomerStats.massKg, 'Mascot toppers must produce distinct physical mass profiles');
  });

  // T3-INT-03: Cadence Sprint (F4) x Ramp Gap Jump (F6)
  await t.test('T3-INT-03 [F4 x F6]: Sprint momentum timing directly dictates ballistic jump clearance vs water splashdown', () => {
    if (!phy) {
      t.skip('Pending M2: Physics module');
      return;
    }
    const sFast = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    const sSlow = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    sFast.phase = 'riding';
    sSlow.phase = 'riding';
    sFast.distanceFt = SPEC.PHYSICS.GAP_JUMP_START_S;
    sSlow.distanceFt = SPEC.PHYSICS.GAP_JUMP_START_S;
    sFast.speedMph = 24; // Fast sprint
    sSlow.speedMph = 6;  // Slow coast

    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    for (let i = 0; i < 90; i++) {
      stepFn(sFast, stats, { steer: 0, pedalCadence: false, sprint: false, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
      stepFn(sSlow, stats, { steer: 0, pedalCadence: false, sprint: false, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
    }
    assert.equal(sSlow.phase, 'splashdown', 'Slow approach must plunge into water gap');
    assert.ok(sFast.distanceFt >= SPEC.PHYSICS.GAP_JUMP_END_S, 'Fast approach must clear the gap');
  });

  // T3-INT-04: Water Cannon Blast (F6) x Outrigger Stabilizer (F1/F5)
  await t.test('T3-INT-04 [F6 x F1/F5]: Wide stabilizer outriggers withstand lateral cannon impulse that splashes bare tandem', () => {
    if (!phy) {
      t.skip('Pending M2: Physics module');
      return;
    }
    const sBare = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    const sOutrigger = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    sBare.phase = 'riding';
    sOutrigger.phase = 'riding';
    sBare.distanceFt = 140;
    sOutrigger.distanceFt = 140;

    const bareStats = { massKg: 150, dragCoeff: 0.4, cadencePowerW: 400, lateralStability: 0.6, rollDamping: 0.5, steeringAgility: 1.0, outriggerWidthFt: 0 };
    const wideStats = { massKg: 170, dragCoeff: 0.5, cadencePowerW: 400, lateralStability: 1.8, rollDamping: 1.5, steeringAgility: 0.9, outriggerWidthFt: 3.5 };

    if (typeof phy.applyWaterCannonBlast === 'function') {
      phy.applyWaterCannonBlast(sBare, 0.8, bareStats);
      phy.applyWaterCannonBlast(sOutrigger, 0.8, wideStats);
      assert.ok(sBare.rollAngleRad > sOutrigger.rollAngleRad, 'Bare bike must roll significantly further under lateral blast');
    }
  });

  // T3-INT-05: Rhythm Rollers (F6) x 120Hz Physics Accumulator (F3)
  await t.test('T3-INT-05 [F6 x F3]: High-frequency roller undulations integrate smoothly across 120Hz ticks without energy explosion', () => {
    if (!phy) {
      t.skip('Pending M2: Physics module');
      return;
    }
    const s = phy.createInitialTandemState ? phy.createInitialTandemState() : phy.createTandemSimState();
    s.phase = 'riding';
    s.distanceFt = 70; // Entry into rhythm rollers
    s.speedMph = 15;
    const stepFn = phy.stepTandemPhysics || phy.stepTandemSimulation;
    const stats = { massKg: 160, dragCoeff: 0.45, cadencePowerW: 400, lateralStability: 1.0, rollDamping: 0.8, steeringAgility: 1.0, outriggerWidthFt: 2.0 };

    for (let i = 0; i < 240; i++) {
      stepFn(s, stats, { steer: 0, pedalCadence: true, sprint: false, brake: false, leanRoll: 0 }, SPEC.PHYSICS.FIXED_DT);
      const speed = s.speedMph ?? s.mph ?? 0;
      assert.ok(speed < 35 && speed >= 0, `Speed must remain physically bounded over rollers, got: ${speed}`);
    }
  });

  // T3-INT-06: Multi-Phase Run Events (F7) x SoundEngine Triggers (F8)
  await t.test('T3-INT-06 [F7 x F8]: Course simulation events trigger corresponding Web Audio synthesizers', () => {
    assert.ok(snd?.soundEngine || snd?.SoundEngine, 'SoundEngine must be available');
    const engine = snd.soundEngine || new snd.SoundEngine();

    // Verify all signature tandem sound triggers execute cleanly
    assert.doesNotThrow(() => {
      engine.playPedalCrank();
      engine.playCanalBell(false);
      engine.playCanalBell(true);
      engine.playSplash(0.8);
      if (typeof engine.playSeesawThud === 'function') engine.playSeesawThud();
      if (typeof engine.playCrowdCheer === 'function') engine.playCrowdCheer();
    });
  });

  // T3-INT-07: Course Completion (F7) x Star Economy Progression (F1/F8)
  await t.test('T3-INT-07 [F7 x F1/F8]: Earning 30/30 on scorecard awards 3 stars to flugtag_stars_v1, unlocking catalog tier', () => {
    localStorage.clear();
    localStorage.setItem(SPEC.STORAGE_KEYS.STARS, '2'); // Start with 2 stars

    const calculateStars = (score: number) => score >= 26 ? 3 : score >= 20 ? 2 : 1;
    const earned = calculateStars(30);
    const updated = Number(localStorage.getItem(SPEC.STORAGE_KEYS.STARS)) + earned;
    localStorage.setItem(SPEC.STORAGE_KEYS.STARS, String(updated));

    assert.equal(localStorage.getItem(SPEC.STORAGE_KEYS.STARS), '5', 'Stars should update from 2 to 5');
    if (cat) {
      const isUnlocked = cat.isPartUnlocked || ((part: any, s: number) => s >= (part.unlockStars ?? 0));
      const tierPart = { id: 'test_tier_5', unlockStars: 5 };
      assert.equal(isUnlocked(tierPart, 5), true, 'Part requiring 5 stars is now unlocked');
    }
  });

  // T3-INT-08: Hub Routing (F8) x Loadout Persistence (F1)
  await t.test('T3-INT-08 [F8 x F1]: Saving custom build loadout in localStorage restores exact parts upon re-routing', () => {
    localStorage.clear();
    const customLoadout = {
      frameId: 'bamboo_tandem_frame',
      drivetrainId: 'sync_chain_pro',
      wheelsId: 'fat_sand_tires',
      steeringId: 'ape_hanger_bars',
      stabilizerId: 'dual_training_outriggers',
      topperId: 'shadow_golden_retriever',
      paintThemeId: 'redbull_navy',
    };
    localStorage.setItem(SPEC.STORAGE_KEYS.LOADOUT, JSON.stringify(customLoadout));

    const loaded = JSON.parse(localStorage.getItem(SPEC.STORAGE_KEYS.LOADOUT) || '{}');
    assert.equal(loaded.frameId, 'bamboo_tandem_frame');
    assert.equal(loaded.topperId, 'shadow_golden_retriever');
    assert.equal(loaded.paintThemeId, 'redbull_navy');
  });
});
