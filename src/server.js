import { createServer } from 'node:http';
import { createApp } from './app.js';
import { StravaClient } from './strava.js';
import { FileTokenStore } from './tokenStore.js';

const port = Number(process.env.PORT) || 3000;

const strava = new StravaClient({
  clientId: process.env.STRAVA_CLIENT_ID,
  clientSecret: process.env.STRAVA_CLIENT_SECRET,
  redirectUri: process.env.STRAVA_REDIRECT_URI || `http://localhost:${port}/auth/strava/callback`,
  scopes: (process.env.STRAVA_SCOPES || 'read,activity:read_all').split(',').map((s) => s.trim()).filter(Boolean),
  tokenStore: new FileTokenStore(process.env.STRAVA_TOKEN_FILE || '.strava-tokens.json'),
});

createServer(createApp(strava)).listen(port, () => {
  console.log(`Maraton running at http://localhost:${port}`);
});
