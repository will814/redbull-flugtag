import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '..');
export const DIST_DIR = path.join(PROJECT_ROOT, 'dist');

/**
 * Standard in-memory LocalStorage mock for headless Node environments.
 */
export class MockLocalStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

/**
 * Ensures globalThis.localStorage is available in the current Node process.
 */
export function setupMockLocalStorage(): MockLocalStorage {
  const mock = new MockLocalStorage();
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      value: mock,
      writable: true,
      configurable: true,
    });
  } catch {}
  return mock;
}

/**
 * Spawns an ephemeral HTTP static server for testing application bundles.
 */
export async function startEphemeralServer(rootDir = DIST_DIR): Promise<{
  server: http.Server;
  url: string;
  port: number;
  close: () => Promise<void>;
}> {
  const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
  };

  const server = http.createServer(async (req, res) => {
    try {
      const rawPath = (req.url || '/').split('?')[0].split('#')[0];
      let relPath = rawPath === '/' || rawPath === '' ? 'index.html' : rawPath.replace(/^\/+/, '');
      let filePath = path.join(rootDir, relPath);

      let stat = null;
      try {
        stat = await fs.stat(filePath);
        if (stat.isDirectory()) {
          filePath = path.join(rootDir, 'index.html');
        }
      } catch {
        filePath = path.join(rootDir, 'index.html');
      }

      const content = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Content-Length': content.byteLength,
      });
      res.end(content);
    } catch (err: any) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found: ' + err.message);
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        return reject(new Error('Failed to obtain server ephemeral port'));
      }
      const port = addr.port;
      const url = `http://127.0.0.1:${port}`;
      resolve({
        server,
        port,
        url,
        close: () =>
          new Promise((res) => {
            server.close(() => res());
          }),
      });
    });
  });
}

/**
 * Authoritative interface constants from PROJECT.md and ORIGINAL_REQUEST.md
 */
export const SPEC = {
  CATEGORIES: ['frame', 'drivetrain', 'wheels', 'steering', 'stabilizer', 'topper'] as const,
  STORAGE_KEYS: {
    STARS: 'flugtag_stars_v1',
    LOADOUT: 'tandem_loadout_v1',
    SAVED_BUILDS: 'tandem_saved_builds_v1',
    BEST_DIST: 'tandem_best_dist_v1',
    BEST_TIME: 'tandem_best_time_v1',
  },
  PHYSICS: {
    FIXED_DT: 1 / 120, // 120Hz fixed timestep
    COURSE_LENGTH_FT: 600,
    STANDARD_BEAM_HALF_WIDTH_FT: 1.5, // 3.0 ft total width
    MIN_BEAM_HALF_WIDTH_FT: 1.3, // 2.6 ft narrow sections
    DEFAULT_CRITICAL_ROLL_RAD: (28 * Math.PI) / 180, // ~28 degrees
    SEESAW_FULCRUM_S: 330, // Seesaw fulcrum station in feet
    GAP_JUMP_START_S: 515,
    GAP_JUMP_END_S: 540,
    FINISH_BELL_S: 600,
  },
  SCORING: {
    MAX_TOTAL_POINTS: 30,
    STAR_TIERS: {
      THREE_STARS: 26,
      TWO_STARS: 20,
      ONE_STAR: 1,
    },
  },
};

/**
 * Dynamic module loader with safe fallback for progressive milestone testability.
 */
export async function tryImportModule<T = any>(relativePath: string): Promise<T | null> {
  const fullPath = path.resolve(PROJECT_ROOT, relativePath);
  try {
    return (await import(fullPath)) as T;
  } catch {
    return null;
  }
}
