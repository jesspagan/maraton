// Prints the Strava refresh token saved after "Connect with Strava": `npm run token`
import { readFileSync } from 'node:fs';

const file = process.env.STRAVA_TOKEN_FILE || '.strava-tokens.json';
try {
  const { refresh_token: token, athlete } = JSON.parse(readFileSync(file, 'utf8'));
  if (athlete?.firstname) console.log(`Connected as ${athlete.firstname} ${athlete.lastname ?? ''}`.trim());
  console.log('\nRefresh token (paste into the STRAVA_CLIENT_REFRESH_TOKEN GitHub secret):\n');
  console.log(token);
  console.log('\nKeep it private: anyone with it can read your Strava data.');
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
  console.error(`No ${file} yet. Run "npm start", open http://localhost:3000 and click "Connect with Strava" first.`);
  process.exit(1);
}
