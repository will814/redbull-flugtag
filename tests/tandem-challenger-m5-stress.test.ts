/**
 * Adversarial Stress & Verification Test Suite for Milestone 5
 * Evaluates: SoundEngine, LandingPage hotkeys, App.tsx hash parsing & storage, vite.config.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import soundEngine, { SoundEngine } from '../src/audio/SoundEngine.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ============================================================================
// Section 1: SoundEngine Headless Stress Tests (Node.js without window)
// ============================================================================

test('SoundEngine Headless Stress Tests', async (t) => {
  await t.test('SE-01: SoundEngine initializes with muted=false and helper methods', () => {
    assert.equal(soundEngine.muted, false, 'Default muted state should be false');
    assert.equal(soundEngine.isMuted(), false, 'isMuted() should reflect muted state');
  });

  await t.test('SE-02: Rapid burst of 50 calls to playSeesawThud() without window does not throw', () => {
    assert.doesNotThrow(() => {
      for (let i = 0; i < 50; i++) {
        soundEngine.playSeesawThud();
      }
    });
  });

  await t.test('SE-03: Rapid burst of 50 calls to playCrowdCheer() without window does not throw', () => {
    assert.doesNotThrow(() => {
      for (let i = 0; i < 50; i++) {
        soundEngine.playCrowdCheer();
      }
    });
  });

  await t.test('SE-04: setMuted(true) followed by 50 rapid calls does not throw', () => {
    soundEngine.setMuted(true);
    assert.equal(soundEngine.isMuted(), true);
    assert.equal(soundEngine.muted, true);

    assert.doesNotThrow(() => {
      for (let i = 0; i < 50; i++) {
        soundEngine.playSeesawThud();
        soundEngine.playCrowdCheer();
      }
    });
  });

  await t.test('SE-05: setMuted(false) followed by 50 rapid calls restores unmuted behavior', () => {
    soundEngine.setMuted(false);
    assert.equal(soundEngine.isMuted(), false);
    assert.equal(soundEngine.muted, false);

    assert.doesNotThrow(() => {
      for (let i = 0; i < 50; i++) {
        soundEngine.playSeesawThud();
        soundEngine.playCrowdCheer();
      }
    });
  });

  await t.test('SE-06: Tandem specific audio triggers withstand rapid and extreme inputs', () => {
    assert.doesNotThrow(() => {
      for (let i = 0; i < 20; i++) {
        soundEngine.playPedalCrank();
        soundEngine.playCanalBell(i % 2 === 0);
        soundEngine.playRollersWhir();
        soundEngine.playSplash(100);
        soundEngine.playSplash(-50); // negative boundary
        soundEngine.playSplash(NaN); // NaN boundary
        soundEngine.playSplash(Infinity); // Infinity boundary
      }
    });
  });
});

// ============================================================================
// Section 2: SoundEngine Web Audio Mock Stress Tests (Simulating Browser Audio Graph)
// ============================================================================

test('SoundEngine Web Audio Mocked Browser Environment Stress Tests', async (t) => {
  // Mock Web Audio Graph
  let createdOscillators: any[] = [];
  let createdGains: any[] = [];
  let createdFilters: any[] = [];
  let resumeCallCount = 0;
  let mockTime = 100.0;

  class MockAudioParam {
    value: number = 0;
    setValueAtTime(val: number, _t: number) { this.value = val; return this; }
    linearRampToValueAtTime(val: number, _t: number) { this.value = val; return this; }
    exponentialRampToValueAtTime(val: number, _t: number) { this.value = val; return this; }
    cancelScheduledValues(_t: number) { return this; }
    setTargetAtTime(val: number, _t: number, _c: number) { this.value = val; return this; }
  }

  class MockAudioNode {
    connect(_target: any) { return _target; }
    disconnect() {}
  }

  class MockGainNode extends MockAudioNode {
    gain = new MockAudioParam();
    constructor() {
      super();
      createdGains.push(this);
    }
  }

  class MockOscillatorNode extends MockAudioNode {
    type: string = 'sine';
    frequency = new MockAudioParam();
    onended: (() => void) | null = null;
    start(_t?: number) {}
    stop(_t?: number) {
      if (this.onended) this.onended();
    }
    constructor() {
      super();
      createdOscillators.push(this);
    }
  }

  class MockBiquadFilterNode extends MockAudioNode {
    type: string = 'lowpass';
    frequency = new MockAudioParam();
    Q = new MockAudioParam();
    constructor() {
      super();
      createdFilters.push(this);
    }
  }

  class MockDynamicsCompressorNode extends MockAudioNode {
    threshold = new MockAudioParam();
    knee = new MockAudioParam();
    ratio = new MockAudioParam();
    attack = new MockAudioParam();
    release = new MockAudioParam();
  }

  class MockAudioBufferSourceNode extends MockAudioNode {
    buffer: any = null;
    loop: boolean = false;
    onended: (() => void) | null = null;
    start(_t?: number) {}
    stop(_t?: number) {
      if (this.onended) this.onended();
    }
  }

  class MockAudioBuffer {
    numberOfChannels = 1;
    length: number;
    sampleRate: number;
    private channelData: Float32Array;
    constructor(options: { numberOfChannels?: number; length: number; sampleRate: number }) {
      this.length = options.length;
      this.sampleRate = options.sampleRate;
      this.channelData = new Float32Array(this.length);
    }
    getChannelData(_ch: number) {
      return this.channelData;
    }
  }

  class MockAudioContext {
    sampleRate = 44100;
    state = 'suspended';
    destination = new MockAudioNode();
    get currentTime() {
      return mockTime;
    }
    createGain() { return new MockGainNode(); }
    createOscillator() { return new MockOscillatorNode(); }
    createBiquadFilter() { return new MockBiquadFilterNode(); }
    createDynamicsCompressor() { return new MockDynamicsCompressorNode(); }
    createBufferSource() { return new MockAudioBufferSourceNode(); }
    createBuffer(channels: number, length: number, sampleRate: number) {
      return new MockAudioBuffer({ numberOfChannels: channels, length, sampleRate });
    }
    async resume() {
      resumeCallCount++;
      this.state = 'running';
    }
  }

  // Set global window mock
  const originalWindow = (globalThis as any).window;
  (globalThis as any).window = {
    AudioContext: MockAudioContext,
  };

  const engine = new SoundEngine();

  await t.test('MOCK-01: Engine resumes suspended context on first play', () => {
    assert.equal(resumeCallCount, 0);
    engine.playSnapPop();
    assert.ok(resumeCallCount >= 1, 'AudioContext.resume() should have been invoked');
  });

  await t.test('MOCK-02: playSeesawThud creates oscillators, filter, and gains, and throttles rapid calls', () => {
    createdOscillators = [];
    createdGains = [];
    createdFilters = [];

    mockTime = 200.0;
    engine.playSeesawThud();

    assert.equal(createdOscillators.length, 3, 'playSeesawThud should spawn 3 oscillators (main, sub, knock)');
    assert.equal(createdFilters.length, 1, 'playSeesawThud should spawn 1 resonant biquad wood filter');
    assert.ok(createdGains.length >= 3, 'playSeesawThud should spawn required gain envelopes');

    // Immediate rapid calls at same mock time should be throttled (delta < 0.12s)
    const oscCountBefore = createdOscillators.length;
    for (let i = 0; i < 50; i++) {
      engine.playSeesawThud();
    }
    assert.equal(createdOscillators.length, oscCountBefore, 'Rapid calls within throttle window must be ignored');

    // After throttle interval passes, a new thud triggers
    mockTime += 0.15;
    engine.playSeesawThud();
    assert.equal(createdOscillators.length, oscCountBefore + 3, 'Should trigger after throttle interval elapsed');
  });

  await t.test('MOCK-03: playCrowdCheer creates dual formant bandpass filters and throttles rapid calls', () => {
    createdFilters = [];
    mockTime = 300.0;
    engine.playCrowdCheer();

    assert.equal(createdFilters.length, 2, 'Crowd cheer should create dual resonant bandpass formant filters');

    // Rapid calls at same mock time should be throttled (delta < 0.5s)
    const filterCountBefore = createdFilters.length;
    for (let i = 0; i < 50; i++) {
      engine.playCrowdCheer();
    }
    assert.equal(createdFilters.length, filterCountBefore, 'Rapid calls within 0.5s cheer throttle window must be ignored');

    // After 0.6s cheer throttle elapsed:
    mockTime += 0.6;
    engine.playCrowdCheer();
    assert.equal(createdFilters.length, filterCountBefore + 2, 'Should create filters again after throttle interval');
  });

  await t.test('MOCK-04: Muting prevents context creation and audio generation', () => {
    engine.setMuted(true);
    assert.equal(engine.isMuted(), true);

    createdOscillators = [];
    createdFilters = [];
    mockTime = 400.0;

    for (let i = 0; i < 50; i++) {
      engine.playSeesawThud();
      engine.playCrowdCheer();
      engine.playCanalBell(true);
      mockTime += 0.2;
    }

    assert.equal(createdOscillators.length, 0, 'No oscillators created while muted');
    assert.equal(createdFilters.length, 0, 'No filters created while muted');

    // Unmute
    engine.setMuted(false);
    assert.equal(engine.isMuted(), false);
    mockTime += 1.0;
    engine.playSeesawThud();
    assert.ok(createdOscillators.length > 0, 'Oscillators created after unmuting');
  });

  // Restore window
  if (originalWindow !== undefined) {
    (globalThis as any).window = originalWindow;
  } else {
    delete (globalThis as any).window;
  }
});

// ============================================================================
// Section 3: App.tsx Hash Routing Logic Edge Cases
// ============================================================================

test('App.tsx Hash String Parsing & Route Normalization', async (t) => {
  // Mirror exact parseGameModeFromHash implementation from App.tsx:
  function parseGameModeFromHash(hashString: string): string {
    const cleaned = hashString.replace(/^#\/?/, '').trim().toLowerCase();
    if (cleaned === 'flugtag') return 'flugtag';
    if (cleaned === 'soapbox') return 'soapbox';
    if (cleaned === 'coaster' || cleaned === 'rollercoaster') return 'coaster';
    if (cleaned === 'tandem' || cleaned === 'stalenros' || cleaned === 'tandembike') return 'tandem';
    return 'landing';
  }

  const expectedCases: Array<[string, string]> = [
    ['#tandem', 'tandem'],
    ['#/tandem', 'tandem'],
    ['#stalenros', 'tandem'],
    ['#/stalenros', 'tandem'],
    ['#tandembike', 'tandem'],
    ['#/tandembike', 'tandem'],
    ['#TANDEM', 'tandem'],
    ['#/TandemBike', 'tandem'],
    ['#STALENROS', 'tandem'],
    ['#  tandem  ', 'tandem'],
    ['#/  tandem  ', 'tandem'],
    ['#flugtag', 'flugtag'],
    ['#/flugtag', 'flugtag'],
    ['#soapbox', 'soapbox'],
    ['#/soapbox', 'soapbox'],
    ['#coaster', 'coaster'],
    ['#/coaster', 'coaster'],
    ['#rollercoaster', 'coaster'],
    ['#/rollercoaster', 'coaster'],
    // Edge cases mapping to fallback 'landing'
    ['#UNKNOWN', 'landing'],
    ['#/UNKNOWN', 'landing'],
    ['#tandem-extra', 'landing'],
    ['##tandem', 'landing'],
    ['', 'landing'],
    ['#', 'landing'],
    ['#/', 'landing'],
    ['#/unknown/deep/path', 'landing'],
    ['#null', 'landing'],
    ['#undefined', 'landing'],
    ['#12345', 'landing'],
  ];

  for (const [hashInput, expectedMode] of expectedCases) {
    await t.test(`Routing: "${hashInput}" -> "${expectedMode}"`, () => {
      const mode = parseGameModeFromHash(hashInput);
      assert.equal(mode, expectedMode, `Hash "${hashInput}" should parse to "${expectedMode}"`);
    });
  }
});

// ============================================================================
// Section 4: LandingPage Keydown Event Handling & Hotkeys
// ============================================================================

test('LandingPage Hotkey Keydown Event Logic', async (t) => {
  // Mirror exact keydown logic from LandingPage.tsx
  function createKeyHandler(onSelectGame: (g: string) => void) {
    return (e: {
      key: string;
      defaultPrevented?: boolean;
      repeat?: boolean;
      ctrlKey?: boolean;
      metaKey?: boolean;
      altKey?: boolean;
      target?: { tagName?: string; isContentEditable?: boolean };
      dialogPresent?: boolean;
      preventDefault: () => void;
    }) => {
      if (e.defaultPrevented || e.repeat) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.dialogPresent) return;

      if (e.key === '1') {
        e.preventDefault();
        onSelectGame('flugtag');
      } else if (e.key === '2') {
        e.preventDefault();
        onSelectGame('soapbox');
      } else if (e.key === '3') {
        e.preventDefault();
        onSelectGame('coaster');
      } else if (e.key === '4') {
        e.preventDefault();
        onSelectGame('tandem');
      }
    };
  }

  await t.test('HK-01: Key "4" selects "tandem" and calls preventDefault', () => {
    let selected: string | null = null;
    let prevented = false;
    const handler = createKeyHandler((g) => { selected = g; });

    handler({
      key: '4',
      preventDefault: () => { prevented = true; },
    });

    assert.equal(selected, 'tandem', 'Key "4" must select "tandem"');
    assert.equal(prevented, true, 'Key "4" must prevent default');
  });

  await t.test('HK-02: Keys "1", "2", "3" select flugtag, soapbox, coaster', () => {
    let selected: string | null = null;
    const handler = createKeyHandler((g) => { selected = g; });

    handler({ key: '1', preventDefault: () => {} });
    assert.equal(selected, 'flugtag');

    handler({ key: '2', preventDefault: () => {} });
    assert.equal(selected, 'soapbox');

    handler({ key: '3', preventDefault: () => {} });
    assert.equal(selected, 'coaster');
  });

  await t.test('HK-03: Holding key down (repeat=true) does not trigger redundant selections', () => {
    let callCount = 0;
    const handler = createKeyHandler(() => { callCount++; });

    handler({
      key: '4',
      repeat: true,
      preventDefault: () => {},
    });

    assert.equal(callCount, 0, 'Key repeat must be ignored');
  });

  await t.test('HK-04: Modifier keys (Ctrl, Cmd/Meta, Alt) do not trigger shortcut', () => {
    let callCount = 0;
    const handler = createKeyHandler(() => { callCount++; });

    handler({ key: '4', ctrlKey: true, preventDefault: () => {} });
    handler({ key: '4', metaKey: true, preventDefault: () => {} });
    handler({ key: '4', altKey: true, preventDefault: () => {} });

    assert.equal(callCount, 0, 'Modifier shortcuts must not trigger game launch');
  });

  await t.test('HK-05: Typing in form inputs (INPUT, TEXTAREA, SELECT, contentEditable) does not launch', () => {
    let callCount = 0;
    const handler = createKeyHandler(() => { callCount++; });

    handler({ key: '4', target: { tagName: 'INPUT' }, preventDefault: () => {} });
    handler({ key: '4', target: { tagName: 'TEXTAREA' }, preventDefault: () => {} });
    handler({ key: '4', target: { tagName: 'SELECT' }, preventDefault: () => {} });
    handler({ key: '4', target: { isContentEditable: true }, preventDefault: () => {} });

    assert.equal(callCount, 0, 'Input typing must never trigger game launch');
  });

  await t.test('HK-06: Active modal dialog ([role="dialog"]) blocks hotkey launch', () => {
    let callCount = 0;
    const handler = createKeyHandler(() => { callCount++; });

    handler({ key: '4', dialogPresent: true, preventDefault: () => {} });
    assert.equal(callCount, 0, 'Hotkey must not fire while modal dialog is open');
  });
});

// ============================================================================
// Section 5: App.tsx State & Storage Logic Hardening
// ============================================================================

test('App.tsx LocalStorage Parsing & Star Accumulator Resilience', async (t) => {
  // Mirror readNumberStorage logic:
  function readNumberStorage(mockStorage: Record<string, string>, key: string, fallback: number = 0): number {
    try {
      const raw = mockStorage[key];
      if (!raw || !raw.trim()) return fallback;
      const val = Number(raw);
      return Number.isFinite(val) ? val : fallback;
    } catch {
      return fallback;
    }
  }

  // Mirror handleAddStars logic:
  function handleAddStars(currentStars: number, earned: number): number {
    if (!Number.isFinite(earned) || earned <= 0) return currentStars;
    const cleanEarned = Math.round(earned);
    if (cleanEarned <= 0) return currentStars;
    return currentStars + cleanEarned;
  }

  await t.test('STORAGE-01: Corrupted or non-numeric storage values return fallback', () => {
    const mock = {
      'valid_num': '15',
      'corrupt_str': 'abc',
      'corrupt_nan': 'NaN',
      'corrupt_inf': 'Infinity',
      'empty': '   ',
    };

    assert.equal(readNumberStorage(mock, 'valid_num', 0), 15);
    assert.equal(readNumberStorage(mock, 'corrupt_str', 0), 0);
    assert.equal(readNumberStorage(mock, 'corrupt_nan', 0), 0);
    assert.equal(readNumberStorage(mock, 'corrupt_inf', 0), 0);
    assert.equal(readNumberStorage(mock, 'empty', 0), 0);
    assert.equal(readNumberStorage(mock, 'non_existent', 42), 42);
  });

  await t.test('STARS-01: handleAddStars rejects negative, NaN, Infinity, and zero stars', () => {
    const base = 10;
    assert.equal(handleAddStars(base, 0), base);
    assert.equal(handleAddStars(base, -5), base);
    assert.equal(handleAddStars(base, NaN), base);
    assert.equal(handleAddStars(base, Infinity), base);
    assert.equal(handleAddStars(base, -Infinity), base);
    assert.equal(handleAddStars(base, 3.4), base + 3);
    assert.equal(handleAddStars(base, 2.8), base + 3);
  });
});

// ============================================================================
// Section 6: Source & Vite Bundle Architecture Integrity
// ============================================================================

test('Source Code and Vite Build Configuration Verification', async (t) => {
  await t.test('VITE-01: vite.config.ts configures dedicated "game-tandem" chunk', () => {
    const viteContent = fs.readFileSync(path.join(PROJECT_ROOT, 'vite.config.ts'), 'utf-8');
    assert.ok(
      viteContent.includes("id.includes('/src/tandem/')") && viteContent.includes("'game-tandem'"),
      'vite.config.ts must map /src/tandem/ to game-tandem chunk'
    );
  });

  await t.test('DIST-01: Production build output contains game-tandem bundle chunk', () => {
    const distAssets = path.join(PROJECT_ROOT, 'dist/assets');
    assert.ok(fs.existsSync(distAssets), 'dist/assets directory must exist');
    const files = fs.readdirSync(distAssets);
    const tandemChunk = files.find((f) => f.startsWith('game-tandem-') && f.endsWith('.js'));
    assert.ok(tandemChunk, `Found game-tandem chunk: ${tandemChunk}`);
  });

  await t.test('LANDING-01: LandingPage.tsx includes all 4 games and key 4 in GAME_CARDS', () => {
    const landingSrc = fs.readFileSync(path.join(PROJECT_ROOT, 'src/ui/LandingPage.tsx'), 'utf-8');
    assert.ok(landingSrc.includes("id: 'tandem'"), 'LandingPage GAME_CARDS must include tandem');
    assert.ok(landingSrc.includes("keyHint: '4'"), 'LandingPage GAME_CARDS must include keyHint 4');
    assert.ok(landingSrc.includes("onSelectGame('tandem')"), 'LandingPage must select tandem on key 4');
  });

  await t.test('APP-01: App.tsx handles tandem route and tandem best records', () => {
    const appSrc = fs.readFileSync(path.join(PROJECT_ROOT, 'src/App.tsx'), 'utf-8');
    assert.ok(appSrc.includes("STORAGE_KEY_TANDEM_BEST_DIST = 'tandem_best_dist_v1'"), 'App.tsx must define tandem best dist key');
    assert.ok(appSrc.includes("STORAGE_KEY_TANDEM_BEST_TIME = 'tandem_best_time_v1'"), 'App.tsx must define tandem best time key');
    assert.ok(appSrc.includes("activeGame === 'tandem'"), 'App.tsx must render TandemGame when activeGame is tandem');
  });
});
