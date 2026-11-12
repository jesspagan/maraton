import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { StravaClient, StravaError, summarizeRuns } from '../src/strava.js';
import { MemoryTokenStore } from '../src/tokenStore.js';
import { createApp } from '../src/app.js';

function mockFetch(routes) {
  const calls = [];
  const fn = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    for (const [pattern, handler] of routes) {
      if (url.includes(pattern)) {
        const { status = 200, body } = await handler(url, init);
        return new Response(JSON.stringify(body), { status });
      }
    }
    return new Response('{"message":"not mocked"}', { status: 404 });
  };
  fn.calls = calls;
  return fn;
}

const base = { clientId: '123', clientSecret: 'secret', redirectUri: 'http://localhost:3000/auth/strava/callback' };

test('builds authorization URL with scopes and state', () => {
  const c = new StravaClient({ ...base, scopes: ['read', 'activity:read_all'], tokenStore: new MemoryTokenStore() });
  const u = new URL(c.getAuthorizationUrl('abc'));
  assert.equal(u.origin + u.pathname, 'https://www.strava.com/oauth/authorize');
  assert.equal(u.searchParams.get('client_id'), '123');
  assert.equal(u.searchParams.get('scope'), 'read,activity:read_all');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('state'), 'abc');
});

test('exchanges code and stores tokens', async () => {
  const store = new MemoryTokenStore();
  const fetch = mockFetch([['/oauth/token', (_u, init) => {
    const p = new URLSearchParams(init.body);
    assert.equal(p.get('grant_type'), 'authorization_code');
    assert.equal(p.get('code'), 'the-code');
    return { body: { access_token: 'a1', refresh_token: 'r1', expires_at: 9999999999, athlete: { id: 7, firstname: 'Ana', lastname: 'R' } } };
  }]]);
  const c = new StravaClient({ ...base, tokenStore: store, fetch });
  const athlete = await c.exchangeCode('the-code');
  assert.equal(athlete.id, 7);
  assert.deepEqual(store.tokens, { access_token: 'a1', refresh_token: 'r1', expires_at: 9999999999, athlete: { id: 7, firstname: 'Ana', lastname: 'R' } });
});

test('refreshes expired token once for concurrent requests', async () => {
  const store = new MemoryTokenStore({ access_token: 'old', refresh_token: 'r1', expires_at: 1000, athlete: { id: 7 } });
  const fetch = mockFetch([
    ['/oauth/token', () => ({ body: { access_token: 'new', refresh_token: 'r2', expires_at: 99999 } })],
    ['/api/v3/athlete', (_u, init) => {
      assert.equal(init.headers.Authorization, 'Bearer new');
      return { body: { id: 7 } };
    }],
  ]);
  const c = new StravaClient({ ...base, tokenStore: store, fetch, now: () => 2000 });
  await Promise.all([c.getAthlete(), c.getAthlete()]);
  assert.equal(fetch.calls.filter((x) => x.url.includes('/oauth/token')).length, 1);
  assert.equal(store.tokens.refresh_token, 'r2');
  assert.equal(store.tokens.athlete.id, 7);
});

test('paginates through all activities', async () => {
  const store = new MemoryTokenStore({ access_token: 'a', refresh_token: 'r', expires_at: 99999 });
  const fetch = mockFetch([['/athlete/activities', (u) => {
    const page = Number(new URL(u).searchParams.get('page'));
    return { body: page === 1 ? [{ id: 1 }, { id: 2 }] : [{ id: 3 }] };
  }]]);
  const c = new StravaClient({ ...base, tokenStore: store, fetch, now: () => 0 });
  const all = await c.getAllActivities({ perPage: 2 });
  assert.deepEqual(all.map((a) => a.id), [1, 2, 3]);
});

test('throws StravaError when not connected or API fails', async () => {
  const c = new StravaClient({ ...base, tokenStore: new MemoryTokenStore(), fetch: mockFetch([]) });
  await assert.rejects(c.getAthlete(), (e) => e instanceof StravaError && e.status === 401);

  const c2 = new StravaClient({ ...base, tokenStore: new MemoryTokenStore({ access_token: 'a', expires_at: 99999 }), fetch: mockFetch([['/athlete', () => ({ status: 429, body: { message: 'Rate Limit Exceeded' } })]]), now: () => 0 });
  await assert.rejects(c2.getAthlete(), (e) => e.status === 429 && e.body.message === 'Rate Limit Exceeded');
});

test('summarizeRuns aggregates only runs', () => {
  const s = summarizeRuns([
    { sport_type: 'Run', distance: 10000, moving_time: 3000, start_date_local: '2026-11-02T08:00:00Z' },
    { sport_type: 'Run', distance: 21097, moving_time: 6600, start_date_local: '2026-11-08T08:00:00Z' },
    { sport_type: 'Ride', distance: 40000, moving_time: 4000, start_date_local: '2026-11-05T08:00:00Z' },
  ]);
  assert.equal(s.count, 2);
  assert.equal(s.totalKm, 31.1);
  assert.equal(s.longestRunKm, 21.1);
  assert.deepEqual(s.weeklyKm, { '2026-W45': 31.1 });
});

test('OAuth flow over HTTP: state check, callback, API proxy', async () => {
  const store = new MemoryTokenStore();
  const fetch = mockFetch([
    ['/oauth/token', () => ({ body: { access_token: 'a1', refresh_token: 'r1', expires_at: 9999999999, athlete: { id: 7 } } })],
    ['/api/v3/athlete', () => ({ body: { id: 7, firstname: 'Ana' } })],
  ]);
  const strava = new StravaClient({ ...base, tokenStore: store, fetch });
  const server = createServer(createApp(strava));
  await new Promise((r) => server.listen(0, r));
  const origin = `http://localhost:${server.address().port}`;
  try {
    const start = await globalThis.fetch(`${origin}/auth/strava`, { redirect: 'manual' });
    assert.equal(start.status, 302);
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    const cookie = start.headers.get('set-cookie').split(';')[0];

    const bad = await globalThis.fetch(`${origin}/auth/strava/callback?code=x&state=wrong`, { headers: { cookie }, redirect: 'manual' });
    assert.equal(bad.status, 400);

    const ok = await globalThis.fetch(`${origin}/auth/strava/callback?code=x&state=${state}`, { headers: { cookie }, redirect: 'manual' });
    assert.equal(ok.status, 302);
    assert.equal(store.tokens.access_token, 'a1');

    const athlete = await (await globalThis.fetch(`${origin}/api/athlete`)).json();
    assert.equal(athlete.firstname, 'Ana');
  } finally {
    server.close();
  }
});

test('FileTokenStore bootstraps from a refresh token when no file exists', async () => {
  const { FileTokenStore } = await import('../src/tokenStore.js');
  const store = new FileTokenStore('/nonexistent-dir/tokens.json', { refreshToken: 'seed' });
  const fetch = mockFetch([
    ['/oauth/token', (_u, init) => {
      assert.equal(new URLSearchParams(init.body).get('refresh_token'), 'seed');
      return { body: { access_token: 'fresh', refresh_token: 'seed', expires_at: 99999 } };
    }],
  ]);
  store.set = async (t) => { store.saved = t; };
  const c = new StravaClient({ ...base, tokenStore: store, fetch, now: () => 0 });
  assert.equal(await c.getAccessToken(), 'fresh');
  assert.equal(store.saved.access_token, 'fresh');
});

test('uses the Codespaces forwarded URL instead of localhost for the OAuth redirect', async () => {
  const { stravaFromEnv, appBaseUrl } = await import('../src/config.js');
  const env = {
    STRAVA_CLIENT_ID: '1', STRAVA_CLIENT_SECRET: 's',
    STRAVA_REDIRECT_URI: 'http://localhost:3000/auth/strava/callback',
    CODESPACE_NAME: 'fuzzy-pancake-abc', GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: 'app.github.dev',
  };
  assert.equal(appBaseUrl(env), 'https://fuzzy-pancake-abc-3000.app.github.dev');
  assert.equal(stravaFromEnv(env).redirectUri, 'https://fuzzy-pancake-abc-3000.app.github.dev/auth/strava/callback');
  assert.equal(stravaFromEnv({ ...env, CODESPACE_NAME: undefined }).redirectUri, 'http://localhost:3000/auth/strava/callback');
});
