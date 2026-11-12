// Prints a running summary for the last N days: `npm run summary -- 28`
import { stravaFromEnv } from './config.js';
import { summarizeRuns } from './strava.js';

const days = Number(process.argv[2]) || 28;
const strava = stravaFromEnv();
const after = Math.floor(Date.now() / 1000) - days * 86400;

try {
  const summary = { days, ...summarizeRuns(await strava.getAllActivities({ after })) };
  console.log(JSON.stringify(summary, null, 2));
} catch (err) {
  console.error(`Error: ${err.message}`);
  if (err.body) console.error(JSON.stringify(err.body));
  process.exit(1);
}
