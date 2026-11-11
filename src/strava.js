const AUTH_URL = 'https://www.strava.com/oauth/authorize';
const TOKEN_URL = 'https://www.strava.com/oauth/token';
const DEAUTH_URL = 'https://www.strava.com/oauth/deauthorize';
const API_BASE = 'https://www.strava.com/api/v3';

// Refresh a bit before actual expiry to avoid racing the clock.
const EXPIRY_SKEW_SECONDS = 60;

export class StravaError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'StravaError';
    this.status = status;
    this.body = body;
  }
}

export class StravaClient {
  /**
   * @param {object} opts
   * @param {string} opts.clientId
   * @param {string} opts.clientSecret
   * @param {string} opts.redirectUri
   * @param {string[]} [opts.scopes]
   * @param {{get():Promise<any>, set(t:any):Promise<void>, clear():Promise<void>}} opts.tokenStore
   * @param {typeof fetch} [opts.fetch]
   * @param {() => number} [opts.now] current time in epoch seconds
   */
  constructor({ clientId, clientSecret, redirectUri, scopes = ['read', 'activity:read_all'], tokenStore, fetch: fetchImpl = globalThis.fetch, now = () => Math.floor(Date.now() / 1000) }) {
    if (!clientId || !clientSecret) {
      throw new Error('STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET are required');
    }
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
    this.scopes = scopes;
    this.tokenStore = tokenStore;
    this.fetch = fetchImpl;
    this.now = now;
    this.refreshing = null;
  }

  /** URL to send the user to so they can approve access. */
  getAuthorizationUrl(state) {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      approval_prompt: 'auto',
      scope: this.scopes.join(','),
    });
    if (state) params.set('state', state);
    return `${AUTH_URL}?${params}`;
  }

  /** Exchange the ?code= from the OAuth callback for tokens and persist them. */
  async exchangeCode(code) {
    const data = await this.#tokenRequest({ code, grant_type: 'authorization_code' });
    await this.#saveTokens(data);
    return data.athlete;
  }

  async isConnected() {
    return Boolean(await this.tokenStore.get());
  }

  /** Returns a valid access token, refreshing it if it has expired. */
  async getAccessToken() {
    const tokens = await this.tokenStore.get();
    if (!tokens) throw new StravaError('Not connected to Strava', { status: 401 });
    if (tokens.expires_at - EXPIRY_SKEW_SECONDS > this.now()) return tokens.access_token;

    // Deduplicate concurrent refreshes.
    this.refreshing ??= this.#tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token })
      .then(async (data) => {
        await this.#saveTokens({ ...data, athlete: tokens.athlete });
        return data.access_token;
      })
      .finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  async disconnect() {
    const tokens = await this.tokenStore.get();
    if (tokens) {
      try {
        const accessToken = await this.getAccessToken();
        await this.fetch(DEAUTH_URL, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
      } finally {
        await this.tokenStore.clear();
      }
    }
  }

  /** Authenticated GET against the Strava v3 API. */
  async get(path, query = {}) {
    const url = new URL(API_BASE + path);
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    const accessToken = await this.getAccessToken();
    const res = await this.fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    return this.#parse(res, `GET ${path}`);
  }

  getAthlete() {
    return this.get('/athlete');
  }

  async getAthleteStats() {
    const tokens = await this.tokenStore.get();
    const id = tokens?.athlete?.id ?? (await this.getAthlete()).id;
    return this.get(`/athletes/${id}/stats`);
  }

  /**
   * @param {object} [opts]
   * @param {number} [opts.before] epoch seconds
   * @param {number} [opts.after] epoch seconds
   * @param {number} [opts.page]
   * @param {number} [opts.perPage] max 200
   */
  getActivities({ before, after, page = 1, perPage = 30 } = {}) {
    return this.get('/athlete/activities', { before, after, page, per_page: perPage });
  }

  /** Fetches every activity in the range, following pagination. */
  async getAllActivities({ before, after, perPage = 200 } = {}) {
    const all = [];
    for (let page = 1; ; page++) {
      const batch = await this.getActivities({ before, after, page, perPage });
      all.push(...batch);
      if (batch.length < perPage) return all;
    }
  }

  getActivity(id) {
    return this.get(`/activities/${encodeURIComponent(id)}`);
  }

  async #tokenRequest(params) {
    const res = await this.fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.clientId, client_secret: this.clientSecret, ...params }),
    });
    return this.#parse(res, 'token request');
  }

  async #saveTokens(data) {
    await this.tokenStore.set({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      athlete: data.athlete ? { id: data.athlete.id, firstname: data.athlete.firstname, lastname: data.athlete.lastname } : undefined,
    });
  }

  async #parse(res, label) {
    const text = await res.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!res.ok) {
      throw new StravaError(`Strava ${label} failed with ${res.status}`, { status: res.status, body });
    }
    return body;
  }
}

/** Summarises runs for marathon training: total distance/time and weekly km. */
export function summarizeRuns(activities) {
  const runs = activities.filter((a) => a.sport_type === 'Run' || a.type === 'Run');
  const totalMeters = runs.reduce((s, a) => s + (a.distance || 0), 0);
  const totalSeconds = runs.reduce((s, a) => s + (a.moving_time || 0), 0);
  const weekly = {};
  for (const run of runs) {
    const week = isoWeek(new Date(run.start_date_local ?? run.start_date));
    weekly[week] = (weekly[week] || 0) + run.distance / 1000;
  }
  for (const k of Object.keys(weekly)) weekly[k] = Math.round(weekly[k] * 100) / 100;
  return {
    count: runs.length,
    totalKm: Math.round(totalMeters / 10) / 100,
    totalHours: Math.round(totalSeconds / 36) / 100,
    avgPaceMinPerKm: totalMeters ? Math.round((totalSeconds / 60 / (totalMeters / 1000)) * 100) / 100 : null,
    longestRunKm: runs.length ? Math.round(Math.max(...runs.map((r) => r.distance)) / 10) / 100 : 0,
    weeklyKm: weekly,
  };
}

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
