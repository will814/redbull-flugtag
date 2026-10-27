/**
 * Master E2E Test Suite Runner
 * Executes all 4 tiers of tests across all 8 features (93 total test cases).
 *
 * Usage:
 *   node --experimental-strip-types tests/e2e-suite.test.ts
 */

import './tandem-catalog.test.ts';
import './tandem-physics.test.ts';
import './tandem-gameplay.test.ts';
import './tandem-interactions.test.ts';
import './tandem-e2e.test.ts';
