import { createServer } from 'node:http';
import { createApp } from './app.js';
import { appBaseUrl, stravaFromEnv } from './config.js';

const port = Number(process.env.PORT) || 3000;
const strava = stravaFromEnv();

createServer(createApp(strava)).listen(port, () => {
  console.log(`Maraton running at ${appBaseUrl()}`);
  console.log(`Strava redirect URI: ${strava.redirectUri}`);
  console.log(`→ On https://www.strava.com/settings/api the "Authorization Callback Domain" must be: ${new URL(strava.redirectUri).hostname}`);
});
