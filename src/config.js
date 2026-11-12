import { StravaClient } from './strava.js';
import { FileTokenStore } from './tokenStore.js';

/**
 * Public address of the app. In a GitHub Codespace the app is reached through
 * a forwarded URL (https://<codespace>-3000.app.github.dev), not localhost.
 */
export function appBaseUrl(env = process.env) {
  const port = Number(env.PORT) || 3000;
  if (env.CODESPACE_NAME && env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN) {
    return `https://${env.CODESPACE_NAME}-${port}.${env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`;
  }
  return `http://localhost:${port}`;
}

function redirectUri(env) {
  const configured = env.STRAVA_REDIRECT_URI;
  // A localhost redirect can't work from a browser Codespace, so swap it for the forwarded URL.
  if (!configured || (env.CODESPACE_NAME && new URL(configured).hostname === 'localhost')) {
    return `${appBaseUrl(env)}/auth/strava/callback`;
  }
  return configured;
}

/** Builds a StravaClient from environment variables (.env locally, GitHub secrets in Codespaces/Actions). */
export function stravaFromEnv(env = process.env) {
  return new StravaClient({
    clientId: env.STRAVA_CLIENT_ID,
    clientSecret: env.STRAVA_CLIENT_SECRET,
    redirectUri: redirectUri(env),
    scopes: (env.STRAVA_SCOPES || 'read,activity:read_all').split(',').map((s) => s.trim()).filter(Boolean),
    tokenStore: new FileTokenStore(env.STRAVA_TOKEN_FILE || '.strava-tokens.json', {
      refreshToken: env.STRAVA_CLIENT_REFRESH_TOKEN || env.STRAVA_REFRESH_TOKEN || undefined,
    }),
  });
}
