import { createServer } from 'node:http';
import { createApp } from './app.js';
import { stravaFromEnv } from './config.js';

const port = Number(process.env.PORT) || 3000;

createServer(createApp(stravaFromEnv())).listen(port, () => {
  console.log(`Maraton running at http://localhost:${port}`);
});
