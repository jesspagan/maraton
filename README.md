# maraton

Marathon training helper connected to the [Strava API](https://developers.strava.com/docs/reference/).
Zero dependencies — just Node.js 20.6+.

## Setup

1. Create a Strava API application at <https://www.strava.com/settings/api>.
   Set **Authorization Callback Domain** to `localhost`.
2. Copy the env template and fill in your Client ID and Client Secret:
   ```sh
   cp .env.example .env
   ```
3. Start the server and open <http://localhost:3000>:
   ```sh
   npm start
   ```
4. Click **Connect with Strava** and approve access. Tokens are saved to
   `.strava-tokens.json` (git-ignored) and refreshed automatically when they expire.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/auth/strava` | Starts the OAuth flow (redirects to Strava) |
| GET | `/auth/strava/callback` | OAuth redirect target; exchanges the code for tokens |
| POST | `/auth/strava/disconnect` | Revokes access and deletes stored tokens |
| GET | `/api/athlete` | Authenticated athlete profile |
| GET | `/api/stats` | Athlete totals (recent / YTD / all-time) |
| GET | `/api/activities?page=&per_page=&before=&after=` | List activities (`before`/`after` are epoch seconds) |
| GET | `/api/activities/:id` | Single activity detail |
| GET | `/api/training-summary?days=28` | Runs only: total km, hours, avg pace, longest run, km per ISO week |

## Using the client directly

```js
import { StravaClient } from './src/strava.js';
import { FileTokenStore } from './src/tokenStore.js';

const strava = new StravaClient({
  clientId: process.env.STRAVA_CLIENT_ID,
  clientSecret: process.env.STRAVA_CLIENT_SECRET,
  redirectUri: process.env.STRAVA_REDIRECT_URI,
  tokenStore: new FileTokenStore(),
});
const runs = await strava.getAllActivities({ after: Date.now() / 1000 - 7 * 86400 });
```

## Tests

```sh
npm test
```
