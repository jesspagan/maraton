import { readFile, writeFile, rm } from 'node:fs/promises';

/** Persists Strava OAuth tokens to a local JSON file (single-user). */
export class FileTokenStore {
  constructor(path = '.strava-tokens.json') {
    this.path = path;
  }

  async get() {
    try {
      return JSON.parse(await readFile(this.path, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async set(tokens) {
    await writeFile(this.path, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  }

  async clear() {
    await rm(this.path, { force: true });
  }
}

/** In-memory store, handy for tests. */
export class MemoryTokenStore {
  constructor(tokens = null) {
    this.tokens = tokens;
  }
  async get() { return this.tokens; }
  async set(tokens) { this.tokens = tokens; }
  async clear() { this.tokens = null; }
}
