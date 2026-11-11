import { randomBytes, timingSafeEqual } from 'node:crypto';
import { StravaError, summarizeRuns } from './strava.js';

const STATE_COOKIE = 'strava_oauth_state';

/** Builds a plain node:http request handler around a StravaClient. */
export function createApp(strava) {
  return async function handler(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    try {
      if (req.method === 'GET' && url.pathname === '/') {
        const connected = await strava.isConnected();
        return html(res, 200, connected
          ? `<h1>Maraton</h1><p>Connected to Strava ✅</p>
             <ul><li><a href="/api/athlete">/api/athlete</a></li>
             <li><a href="/api/activities">/api/activities</a></li>
             <li><a href="/api/stats">/api/stats</a></li>
             <li><a href="/api/training-summary?days=28">/api/training-summary?days=28</a></li></ul>
             <form method="post" action="/auth/strava/disconnect"><button>Disconnect</button></form>`
          : `<h1>Maraton</h1><p><a href="/auth/strava">Connect with Strava</a></p>`);
      }

      if (req.method === 'GET' && url.pathname === '/auth/strava') {
        const state = randomBytes(16).toString('hex');
        res.setHeader('Set-Cookie', `${STATE_COOKIE}=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`);
        return redirect(res, strava.getAuthorizationUrl(state));
      }

      if (req.method === 'GET' && url.pathname === '/auth/strava/callback') {
        if (url.searchParams.get('error')) {
          return html(res, 400, `<p>Strava authorization was denied: ${escape(url.searchParams.get('error'))}</p><a href="/">Back</a>`);
        }
        const expected = parseCookies(req.headers.cookie)[STATE_COOKIE];
        const got = url.searchParams.get('state') || '';
        if (!expected || !safeEqual(expected, got)) {
          return json(res, 400, { error: 'Invalid OAuth state' });
        }
        const code = url.searchParams.get('code');
        if (!code) return json(res, 400, { error: 'Missing code' });
        await strava.exchangeCode(code);
        res.setHeader('Set-Cookie', `${STATE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
        return redirect(res, '/');
      }

      if (req.method === 'POST' && url.pathname === '/auth/strava/disconnect') {
        await strava.disconnect();
        return redirect(res, '/', 303);
      }

      if (req.method === 'GET' && url.pathname === '/api/athlete') {
        return json(res, 200, await strava.getAthlete());
      }

      if (req.method === 'GET' && url.pathname === '/api/stats') {
        return json(res, 200, await strava.getAthleteStats());
      }

      if (req.method === 'GET' && url.pathname === '/api/activities') {
        const q = url.searchParams;
        return json(res, 200, await strava.getActivities({
          before: intParam(q, 'before'),
          after: intParam(q, 'after'),
          page: intParam(q, 'page') ?? 1,
          perPage: Math.min(intParam(q, 'per_page') ?? 30, 200),
        }));
      }

      const activityMatch = url.pathname.match(/^\/api\/activities\/(\d+)$/);
      if (req.method === 'GET' && activityMatch) {
        return json(res, 200, await strava.getActivity(activityMatch[1]));
      }

      if (req.method === 'GET' && url.pathname === '/api/training-summary') {
        const days = Math.min(intParam(url.searchParams, 'days') ?? 28, 365);
        const after = Math.floor(Date.now() / 1000) - days * 86400;
        const activities = await strava.getAllActivities({ after });
        return json(res, 200, { days, ...summarizeRuns(activities) });
      }

      return json(res, 404, { error: 'Not found' });
    } catch (err) {
      if (err instanceof StravaError) {
        const status = err.status === 401 ? 401 : err.status === 429 ? 429 : 502;
        return json(res, status, { error: err.message, details: err.body });
      }
      console.error(err);
      return json(res, 500, { error: 'Internal server error' });
    }
  };
}

function intParam(params, name) {
  const v = params.get(name);
  if (v === null || v === '') return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((c) => c.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, v.join('=')]));
}

function safeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body, null, 2));
}

function html(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><meta charset="utf-8"><title>Maraton</title>${body}`);
}

function redirect(res, location, status = 302) {
  res.writeHead(status, { Location: location });
  res.end();
}
