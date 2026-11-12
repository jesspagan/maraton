# maraton

Marathon training helper connected to the [Strava API](https://developers.strava.com/docs/reference/).
Zero dependencies — just Node.js 22+.

## Setup

1. Create a Strava API application at <https://www.strava.com/settings/api>.
   Set **Authorization Callback Domain** to `localhost`.
2. Clone and run the setup script:
   ```sh
   git clone https://github.com/jesspagan/maraton.git
   cd maraton
   npm run setup
   ```
   It checks your Node.js version, asks for your Client ID and Client Secret
   (saved to `.env`, which git ignores), runs the tests and can start the app.
3. Open <http://localhost:3000> and click **Connect with Strava**. Tokens are saved to
   `.strava-tokens.json` (git-ignored) and refreshed automatically when they expire.
4. Run `npm run token` to print the refresh token for the GitHub secret below.

## Using a GitHub Codespace

Codespaces can read your keys from GitHub, so you don't have to type them:

1. Add `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` and (once you have it) `STRAVA_CLIENT_REFRESH_TOKEN`
   as **Codespaces** secrets: repo → **Settings** → **Secrets and variables** → **Codespaces**.
   Secrets under **Actions** are *not* visible to Codespaces — add them in both places.
2. Restart the Codespace (or create a new one) so it picks them up.
3. Run `npm run setup`. It detects the keys and skips the questions.

In a browser Codespace the app lives at `https://<codespace-name>-3000.app.github.dev`, not
`localhost`. Until you have a refresh token, set Strava's **Authorization Callback Domain** to
that host (`npm run setup` prints it) so the **Connect with Strava** login can return to the app.
Once `STRAVA_CLIENT_REFRESH_TOKEN` is set, no login is needed.

## Storing your keys in GitHub

Keys are never committed. Store them as encrypted repository secrets instead:

1. On GitHub, open the repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
2. Add these three secrets:

   | Name | Value |
   | --- | --- |
   | `STRAVA_CLIENT_ID` | Client ID from <https://www.strava.com/settings/api> |
   | `STRAVA_CLIENT_SECRET` | Client Secret from the same page |
   | `STRAVA_CLIENT_REFRESH_TOKEN` | `refresh_token` from `.strava-tokens.json` after you connect once locally |

3. Go to **Actions** → **Strava connection check** → **Run workflow** to check they work.
   Because this repo is public, the run only says whether the connection works — it never
   shows your activities. Use `npm run summary` in your Codespace or on your computer to see them.

## Privacy (this repo is public)

- Secrets are encrypted by GitHub and never shown in logs or to visitors. Workflows triggered
  from forks don't receive them.
- Keep the Codespace port **Private** (the default). If it's made Public, anyone with the URL can
  read your Strava data through `/api/*`.
- `.env` and `.strava-tokens.json` are git-ignored — never commit them.

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
