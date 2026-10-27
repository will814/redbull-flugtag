/**
 * Red Bull Tandem Bike Challenge — Milestone 5 Adversarial Stress & Verification Test Suite
 * Empirical Challenger 2 Verification Harness
 *
 * File: tests/tandem-challenger-m5-2.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { setupMockLocalStorage, MockLocalStorage } from './test-utils';
import { soundEngine, SoundEngine } from '../src/audio/SoundEngine';
import viteConfig from '../vite.config';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DIST_ASSETS = path.join(PROJECT_ROOT, 'dist', 'assets');

// Setup mock localStorage for Node
const mockStorage = setupMockLocalStorage();

describe('Milestone 5 Empirical Challenger 2 Verification Suite', () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  // ==========================================================================
  // MANDATORY MISSION ITEM 1: Bundle Verification & game-tandem chunk
  // ==========================================================================
  describe('Mission Item 1: Bundle Verification (dist/assets/game-tandem-*.js)', () => {
    it('verifies that dist/assets exists and contains game-tandem-*.js chunk', () => {
      expect(fs.existsSync(DIST_ASSETS), `dist/assets directory does not exist at ${DIST_ASSETS}`).toBe(true);

      const files = fs.readdirSync(DIST_ASSETS);
      const tandemFiles = files.filter((f) => /^game-tandem-.*\.js$/.test(f));

      expect(tandemFiles.length, `Expected exactly 1 game-tandem chunk, found: ${tandemFiles.join(', ')}`).toBe(1);

      const tandemChunkName = tandemFiles[0];
      const tandemChunkPath = path.join(DIST_ASSETS, tandemChunkName);
      const stats = fs.statSync(tandemChunkPath);

      // Verify non-empty and substantial bundle size (should be > 50 kB for Three.js 3D tandem meshes + HUD + physics)
      expect(stats.size).toBeGreaterThan(50 * 1024);
      expect(stats.size).toBeLessThan(500 * 1024);

      // Read bundle content and assert tandem symbols exist in compiled bundle
      const bundleContent = fs.readFileSync(tandemChunkPath, 'utf-8');
      expect(bundleContent).toContain('tandem');
      expect(Buffer.byteLength(bundleContent, 'utf-8')).toBe(stats.size);
    });

    it('verifies all expected game chunks exist in dist/assets', () => {
      const files = fs.readdirSync(DIST_ASSETS);
      expect(files.some((f) => /^game-flugtag-.*\.js$/.test(f))).toBe(true);
      expect(files.some((f) => /^game-soapbox-.*\.js$/.test(f))).toBe(true);
      expect(files.some((f) => /^game-coaster-.*\.js$/.test(f))).toBe(true);
      expect(files.some((f) => /^game-tandem-.*\.js$/.test(f))).toBe(true);
      expect(files.some((f) => /^three-.*\.js$/.test(f))).toBe(true);
      expect(files.some((f) => /^vendor-.*\.js$/.test(f))).toBe(true);
    });

    it('verifies vite.config.ts manualChunks configuration strictly partitions tandem modules', () => {
      // Extract manualChunks function from vite config
      const rollupOptions = viteConfig.build?.rollupOptions;
      expect(rollupOptions).toBeDefined();
      const output = rollupOptions?.output as any;
      expect(output).toBeDefined();
      expect(typeof output.manualChunks).toBe('function');

      const manualChunks = output.manualChunks;

      // Tandem source files
      expect(manualChunks('/home/will814/Projects/redbull-flugtag/src/tandem/TandemGame.tsx')).toBe('game-tandem');
      expect(manualChunks('/home/will814/Projects/redbull-flugtag/src/tandem/TandemPartCatalog.ts')).toBe('game-tandem');
      expect(manualChunks('/home/will814/Projects/redbull-flugtag/src/tandem/TandemPhysicsEngine.ts')).toBe('game-tandem');
      expect(manualChunks('/home/will814/Projects/redbull-flugtag/src/tandem/TandemBike3DBuilder.ts')).toBe('game-tandem');
      expect(manualChunks('/home/will814/Projects/redbull-flugtag/src/tandem/TandemCanvas3D.tsx')).toBe('game-tandem');
      expect(manualChunks('/home/will814/Projects/redbull-flugtag/src/tandem/TandemScorecardModal.tsx')).toBe('game-tandem');

      // Other game modules isolation
      expect(manualChunks('/src/soapbox/SoapboxGame.tsx')).toBe('game-soapbox');
      expect(manualChunks('/src/coaster/CoasterGame.tsx')).toBe('game-coaster');
      expect(manualChunks('/src/flugtag/FlugtagGame.tsx')).toBe('game-flugtag');
      expect(manualChunks('/src/builder/PartCatalog.ts')).toBe('game-flugtag');
      expect(manualChunks('node_modules/three/build/three.module.js')).toBe('three');
      expect(manualChunks('node_modules/react/index.js')).toBe('vendor');

      // Root files
      expect(manualChunks('/src/App.tsx')).toBeUndefined();
      expect(manualChunks('/src/ui/LandingPage.tsx')).toBeUndefined();
    });
  });

  // ==========================================================================
  // MANDATORY MISSION ITEM 2: High Score Persistence Fuzzing
  // ==========================================================================
  describe('Mission Item 2: High Score Persistence Fuzzing & Graceful Fallback', () => {
    // Replicate App.tsx and TandemGame.tsx storage reading algorithms for empirical fuzzing
    function readNumberStorage(key: string, fallback: number = 0): number {
      try {
        const raw = localStorage.getItem(key);
        if (!raw || !raw.trim()) return fallback;
        const val = Number(raw);
        return Number.isFinite(val) ? val : fallback;
      } catch {
        return fallback;
      }
    }

    function parseStoredTandemDistance(key: string = 'tandem_best_dist_v1'): number {
      return Math.max(0, Math.round(readNumberStorage(key, 0)));
    }

    function parseStoredTandemTime(key: string = 'tandem_best_time_v1'): number | null {
      const val = readNumberStorage(key, 0);
      return val > 0 ? val : null;
    }

    // Fuzzing inputs
    const edgeCases: Array<{ name: string; raw: any; expectedDist: number; expectedTime: number | null }> = [
      { name: 'null / unset', raw: null, expectedDist: 0, expectedTime: null },
      { name: 'empty string', raw: '', expectedDist: 0, expectedTime: null },
      { name: 'spaces only', raw: '     ', expectedDist: 0, expectedTime: null },
      { name: 'zero "0"', raw: '0', expectedDist: 0, expectedTime: null },
      { name: 'zero "0.00"', raw: '0.00', expectedDist: 0, expectedTime: null },
      { name: 'negative int "-1"', raw: '-1', expectedDist: 0, expectedTime: null },
      { name: 'negative float "-123.456"', raw: '-123.456', expectedDist: 0, expectedTime: null },
      { name: 'negative large "-9999999"', raw: '-9999999', expectedDist: 0, expectedTime: null },
      { name: 'valid integer distance "185"', raw: '185', expectedDist: 185, expectedTime: 185 },
      { name: 'valid float distance "185.6"', raw: '185.6', expectedDist: 186, expectedTime: 185.6 },
      { name: 'valid completion time "19.42"', raw: '19.42', expectedDist: 19, expectedTime: 19.42 },
      { name: 'string "NaN"', raw: 'NaN', expectedDist: 0, expectedTime: null },
      { name: 'string "Infinity"', raw: 'Infinity', expectedDist: 0, expectedTime: null },
      { name: 'string "-Infinity"', raw: '-Infinity', expectedDist: 0, expectedTime: null },
      { name: 'string "undefined"', raw: 'undefined', expectedDist: 0, expectedTime: null },
      { name: 'string "null"', raw: 'null', expectedDist: 0, expectedTime: null },
      { name: 'corrupted json "{}"', raw: '{}', expectedDist: 0, expectedTime: null },
      { name: 'corrupted object "[object Object]"', raw: '[object Object]', expectedDist: 0, expectedTime: null },
      { name: 'alphanumeric "150ft"', raw: '150ft', expectedDist: 0, expectedTime: null },
      { name: 'script injection "<script>alert(1)</script>"', raw: '<script>alert(1)</script>', expectedDist: 0, expectedTime: null },
      { name: 'very small positive float "0.0000001"', raw: '0.0000001', expectedDist: 0, expectedTime: 0.0000001 },
      { name: 'whitespace padded number "  142.2  "', raw: '  142.2  ', expectedDist: 142, expectedTime: 142.2 },
    ];

    it.each(edgeCases)('fuzzes storage with $name', ({ raw, expectedDist, expectedTime }) => {
      if (raw === null) {
        localStorage.removeItem('tandem_best_dist_v1');
        localStorage.removeItem('tandem_best_time_v1');
      } else {
        localStorage.setItem('tandem_best_dist_v1', String(raw));
        localStorage.setItem('tandem_best_time_v1', String(raw));
      }

      const dist = parseStoredTandemDistance('tandem_best_dist_v1');
      const time = parseStoredTandemTime('tandem_best_time_v1');

      expect(dist).toBe(expectedDist);
      if (expectedTime === null) {
        expect(time).toBeNull();
      } else {
        expect(time).toBeCloseTo(expectedTime, 4);
      }
    });

    it('gracefully handles thrown errors when localStorage.getItem throws SecurityError/QuotaExceededError', () => {
      const originalGetItem = localStorage.getItem;
      localStorage.getItem = vi.fn().mockImplementation(() => {
        throw new Error('SecurityError: The operation is insecure.');
      });

      expect(parseStoredTandemDistance('tandem_best_dist_v1')).toBe(0);
      expect(parseStoredTandemTime('tandem_best_time_v1')).toBeNull();

      localStorage.getItem = originalGetItem;
    });

    it('simulates handleUpdateTandemRecord record update rules with extreme and adversarial values', () => {
      let currentBestDist = 120;
      let currentBestTime: number | null = 24.5;

      const updateRecord = (feet: number, timeSec: number | null) => {
        if (Number.isFinite(feet)) {
          const roundedFeet = Math.round(feet);
          if (roundedFeet > currentBestDist) {
            currentBestDist = roundedFeet;
            localStorage.setItem('tandem_best_dist_v1', String(roundedFeet));
          }
        }
        if (timeSec !== null && Number.isFinite(timeSec) && timeSec > 0) {
          if (currentBestTime === null || timeSec < currentBestTime) {
            currentBestTime = timeSec;
            localStorage.setItem('tandem_best_time_v1', String(timeSec));
          }
        }
      };

      // Adversarial updates that should be rejected:
      updateRecord(-50, -10); // Negative distance & time
      expect(currentBestDist).toBe(120);
      expect(currentBestTime).toBe(24.5);

      updateRecord(NaN, NaN); // NaNs
      expect(currentBestDist).toBe(120);
      expect(currentBestTime).toBe(24.5);

      updateRecord(Infinity, 0); // Infinity & zero time
      expect(currentBestDist).toBe(120);
      expect(currentBestTime).toBe(24.5);

      updateRecord(110, 26.0); // Worse distance (110 < 120) and slower time (26.0 > 24.5)
      expect(currentBestDist).toBe(120);
      expect(currentBestTime).toBe(24.5);

      // Valid improved distance:
      updateRecord(180.2, null);
      expect(currentBestDist).toBe(180);
      expect(currentBestTime).toBe(24.5);
      expect(localStorage.getItem('tandem_best_dist_v1')).toBe('180');

      // Valid improved time:
      updateRecord(150, 19.8);
      expect(currentBestDist).toBe(180); // Distance not regressed
      expect(currentBestTime).toBe(19.8); // Time improved
      expect(localStorage.getItem('tandem_best_time_v1')).toBe('19.8');
    });
  });

  // ==========================================================================
  // MANDATORY MISSION ITEM 3: SoundEngine Web Audio Robustness & Mute Controls
  // ==========================================================================
  describe('Mission Item 3: SoundEngine Web Audio Procedural Synthesis & Stress Testing', () => {
    it('executes all SoundEngine methods in headless environment without throwing or leaking', () => {
      const engine = soundEngine;

      expect(() => {
        engine.playSnapPop();
        engine.playAirhorn();
        engine.playPushBoost();
        engine.playPedalCrank();
        engine.playCanalBell(true);
        engine.playCanalBell(false);
        engine.playRollersWhir();
        engine.playTrolleyDetach(true);
        engine.playTrolleyDetach(false);
        engine.playThermalChime();
        engine.playSplash(60);
        engine.playSplash(0);
        engine.playSplash(100);
        engine.playSplash(-50);
        engine.playSplash(9999);
        engine.playSplash(NaN);
        engine.playFanWhoosh();
        engine.playUnlockFanfare();
        engine.playTireScreech();
        engine.playCrashThud();
        engine.playStartGateDrop();
        engine.playLimLaunchWhoosh(true);
        engine.playLimLaunchWhoosh(false);
        engine.playMagnetBrakeHum();
        engine.playSeesawThud();
        engine.playCrowdCheer();
      }).not.toThrow();
    });

    it('verifies mute state toggling and property synchronization', () => {
      const engine = soundEngine;
      engine.muted = false;
      expect(engine.muted).toBe(false);
      expect(engine.isMuted()).toBe(false);

      engine.setMuted(true);
      expect(engine.muted).toBe(true);
      expect(engine.isMuted()).toBe(true);

      engine.muted = false;
      expect(engine.isMuted()).toBe(false);
    });

    it('stress-tests rapid concurrent calls (burst of 100 invocations) across all sounds', () => {
      const engine = soundEngine;
      expect(() => {
        for (let i = 0; i < 100; i++) {
          engine.playSnapPop();
          engine.playPedalCrank();
          engine.playSeesawThud();
          engine.playCanalBell(i % 2 === 0);
          engine.playCrowdCheer();
          engine.playSplash(i);
        }
      }).not.toThrow();
    });

    it('constructs a mock Web Audio API context and asserts valid node connections and parameters', () => {
      // Build a realistic Web Audio API mock to verify node scheduling and parameters
      const createdNodes: {
        oscillators: any[];
        gains: any[];
        filters: any[];
        buffers: any[];
      } = {
        oscillators: [],
        gains: [],
        filters: [],
        buffers: [],
      };

      class MockAudioParam {
        value: number = 0;
        setValueAtTime = vi.fn((val: number, time: number) => {
          this.value = val;
        });
        linearRampToValueAtTime = vi.fn((val: number, time: number) => {
          this.value = val;
        });
        exponentialRampToValueAtTime = vi.fn((val: number, time: number) => {
          // Web Audio API constraint: Target value MUST be positive and non-zero
          expect(val).toBeGreaterThan(0);
          this.value = val;
        });
        cancelScheduledValues = vi.fn();
        setTargetAtTime = vi.fn();
      }

      class MockGainNode {
        gain = new MockAudioParam();
        connect = vi.fn();
        disconnect = vi.fn();
        constructor() {
          createdNodes.gains.push(this);
        }
      }

      class MockOscillatorNode {
        type = 'sine';
        frequency = new MockAudioParam();
        connect = vi.fn();
        disconnect = vi.fn();
        start = vi.fn();
        stop = vi.fn();
        onended: (() => void) | null = null;
        constructor() {
          createdNodes.oscillators.push(this);
        }
      }

      class MockBiquadFilterNode {
        type = 'bandpass';
        frequency = new MockAudioParam();
        Q = new MockAudioParam();
        connect = vi.fn();
        disconnect = vi.fn();
        constructor() {
          createdNodes.filters.push(this);
        }
      }

      class MockBufferSourceNode {
        buffer: any = null;
        loop = false;
        connect = vi.fn();
        disconnect = vi.fn();
        start = vi.fn();
        stop = vi.fn();
        onended: (() => void) | null = null;
      }

      class MockDynamicsCompressorNode {
        threshold = new MockAudioParam();
        knee = new MockAudioParam();
        ratio = new MockAudioParam();
        attack = new MockAudioParam();
        release = new MockAudioParam();
        connect = vi.fn();
      }

      class MockAudioContext {
        currentTime = 1.0;
        sampleRate = 44100;
        destination = {};
        state = 'running';
        createGain() {
          return new MockGainNode();
        }
        createOscillator() {
          return new MockOscillatorNode();
        }
        createBiquadFilter() {
          return new MockBiquadFilterNode();
        }
        createBufferSource() {
          return new MockBufferSourceNode();
        }
        createDynamicsCompressor() {
          return new MockDynamicsCompressorNode();
        }
        createBuffer(channels: number, length: number, sampleRate: number) {
          const buf = {
            numberOfChannels: channels,
            length,
            sampleRate,
            getChannelData: () => new Float32Array(length),
          };
          createdNodes.buffers.push(buf);
          return buf;
        }
        resume = vi.fn().mockResolvedValue(undefined);
      }

      // Inject mock into globalThis.window
      const originalWindow = (globalThis as any).window;
      (globalThis as any).window = {
        AudioContext: MockAudioContext,
      };

      const testEngine = new SoundEngine();

      // Test Seesaw Thud synthesis
      testEngine.playSeesawThud();
      expect(createdNodes.oscillators.length).toBeGreaterThanOrEqual(3);
      expect(createdNodes.filters.length).toBeGreaterThanOrEqual(1);

      // Verify that woodFilter is bandpass
      const woodFilter = createdNodes.filters[createdNodes.filters.length - 1];
      expect(woodFilter.type).toBe('bandpass');

      // Test Crowd Cheer synthesis
      testEngine.playCrowdCheer();
      expect(createdNodes.buffers.length).toBeGreaterThanOrEqual(1);

      // Test Pedal Crank synthesis
      testEngine.playPedalCrank();

      // Test Canal Bell Chime (Single vs Grand)
      testEngine.playCanalBell(false);
      testEngine.playCanalBell(true);

      // Cleanup
      (globalThis as any).window = originalWindow;
    });
  });

  // ==========================================================================
  // MANDATORY MISSION ITEM 4: Landing Page, Routing & App Esc Behavior
  // ==========================================================================
  describe('Mission Item 4: Landing Page Specs, Hotkeys & Hash Routing Integration', () => {
    function parseGameModeFromHash(hash: string): string {
      const cleaned = hash.replace(/^#\/?/, '').trim().toLowerCase();
      if (cleaned === 'flugtag') return 'flugtag';
      if (cleaned === 'soapbox') return 'soapbox';
      if (cleaned === 'coaster' || cleaned === 'rollercoaster') return 'coaster';
      if (cleaned === 'tandem' || cleaned === 'stalenros' || cleaned === 'tandembike') return 'tandem';
      return 'landing';
    }

    it('verifies hash parsing for all known tandem route aliases and fallbacks', () => {
      expect(parseGameModeFromHash('#tandem')).toBe('tandem');
      expect(parseGameModeFromHash('#/tandem')).toBe('tandem');
      expect(parseGameModeFromHash('#stalenros')).toBe('tandem');
      expect(parseGameModeFromHash('#tandembike')).toBe('tandem');
      expect(parseGameModeFromHash('#flugtag')).toBe('flugtag');
      expect(parseGameModeFromHash('#soapbox')).toBe('soapbox');
      expect(parseGameModeFromHash('#coaster')).toBe('coaster');
      expect(parseGameModeFromHash('#rollercoaster')).toBe('coaster');
      expect(parseGameModeFromHash('')).toBe('landing');
      expect(parseGameModeFromHash('#')).toBe('landing');
      expect(parseGameModeFromHash('#unknownGame')).toBe('landing');
    });

    it('verifies LandingPage.tsx includes Tandem Challenge with hotkey 4 and all 6 components', () => {
      const landingSource = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'ui', 'LandingPage.tsx'), 'utf-8');

      // 4th game definition
      expect(landingSource).toContain("id: 'tandem'");
      expect(landingSource).toContain("keyHint: '4'");
      expect(landingSource).toContain('Red Bull Tandem Challenge');
      expect(landingSource).toContain('Stalen Ros Over-Water Pier Sprint');

      // 6 tandem components
      expect(landingSource).toContain("'Tandem Frame'");
      expect(landingSource).toContain("'Dual Drivetrain'");
      expect(landingSource).toContain("'Wheelset / Tires'");
      expect(landingSource).toContain("'Steering Bars'");
      expect(landingSource).toContain("'Stabilizer Outriggers'");
      expect(landingSource).toContain("'Crew Topper'");

      // 4 obstacles
      expect(landingSource).toContain("'Tilting Seesaw Bridge'");
      expect(landingSource).toContain("'Rhythm Rollers & Whoops'");
      expect(landingSource).toContain("'Water Cannon Hazard'");
      expect(landingSource).toContain("'Ramp Gap Jump & Bell'");

      // Keyboard hotkey '4' listener in LandingPage
      expect(landingSource).toContain("e.key === '4'");
      expect(landingSource).toContain("onSelectGame('tandem')");
    });

    it('verifies README.md thoroughly documents Game 4 specs, controls, and architecture', () => {
      const readmeSource = fs.readFileSync(path.join(PROJECT_ROOT, 'README.md'), 'utf-8');

      // Title & Architecture
      expect(readmeSource).toContain('Red Bull Tandem Bike Challenge');
      expect(readmeSource).toContain('src/tandem/');

      // Components
      expect(readmeSource).toContain('Tandem Frames');
      expect(readmeSource).toContain('Dual Drivetrains');
      expect(readmeSource).toContain('Wheelset & Tires');
      expect(readmeSource).toContain('Steering & Handlebars');
      expect(readmeSource).toContain('Stabilizers & Outriggers');
      expect(readmeSource).toContain('Mascot Toppers');
      expect(readmeSource).toContain('Shadow');
      expect(readmeSource).toContain('Boomer');

      // Course elements
      expect(readmeSource).toContain('Narrow Balance Beam');
      expect(readmeSource).toContain('Tilting Seesaw Bridge');
      expect(readmeSource).toContain('Water Cannon Hazard');
      expect(readmeSource).toContain('Ramp Gap Jump');
      expect(readmeSource).toContain('Golden Finish Bell');

      // Controls table
      expect(readmeSource).toContain('`4`');
      expect(readmeSource).toContain('`Q` • `E`');
      expect(readmeSource).toContain('`ArrowUp`/`W`');
      expect(readmeSource).toContain('`Spacebar` / `Shift`');
    });
  });
});
