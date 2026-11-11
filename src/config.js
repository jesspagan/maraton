import { StravaClient } from './strava.js';
import { FileTokenStore } from './tokenStore.js';

/** Builds a StravaClient from environment variables (.env locally, secrets in GitHub Actions). */
export function stravaFromEnv(env = process.env) {
  const port = Number(env.PORT) || 3000;
  return new StravaClient({
    clientId: env.STRAVA_CLIENT_ID,
    clientSecret: env.STRAVA_CLIENT_SECRET,
    redirectUri: env.STRAVA_REDIRECT_URI || `http://localhost:${port}/auth/strava/callback`,
    scopes: (env.STRAVA_SCOPES || 'read,activity:read_all').split(',').map((s) => s.trim()).filter(Boolean),
    tokenStore: new FileTokenStore(env.STRAVA_TOKEN_FILE || '.strava-tokens.json', {
      refreshToken: env.STRAVA_REFRESH_TOKEN || undefined,
    }),
  });
}
