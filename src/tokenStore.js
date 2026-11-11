import { readFile, writeFile, rm } from 'node:fs/promises';

/**
 * Persists Strava OAuth tokens to a local JSON file (single-user).
 *
 * If the file doesn't exist yet but a refresh token is provided (e.g. from the
 * STRAVA_REFRESH_TOKEN GitHub secret), it is used to bootstrap: the access
 * token is treated as expired, so the client fetches a fresh one on first use.
 */
export class FileTokenStore {
  constructor(path = '.strava-tokens.json', { refreshToken } = {}) {
    this.path = path;
    this.refreshToken = refreshToken;
  }

  async get() {
    try {
      return JSON.parse(await readFile(this.path, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      return this.refreshToken ? { access_token: null, refresh_token: this.refreshToken, expires_at: 0 } : null;
    }
  }

  async set(tokens) {
    await writeFile(this.path, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  }

  async clear() {
    this.refreshToken = undefined;
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
