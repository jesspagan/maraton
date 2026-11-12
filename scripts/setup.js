// Interactive first-time setup: `npm run setup`
// - checks the Node.js version
// - uses your Strava keys from GitHub secrets when running in a Codespace,
//   otherwise creates .env and asks for your Strava Client ID / Secret
// - turns on the git hook that blocks committing keys
// - runs the tests
// - optionally starts the app so you can click "Connect with Strava"
import { existsSync, readFileSync, writeFileSync, copyFileSync, chmodSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { appBaseUrl } from '../src/config.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
const examplePath = join(root, '.env.example');
const inCodespace = process.env.CODESPACES === 'true';
const repoSlug = process.env.GITHUB_REPOSITORY || 'jesspagan/maraton';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

function step(n, title) {
  console.log(`\n${bold(`[${n}/4] ${title}`)}`);
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Don't echo what's typed (for the client secret).
      rl._writeToOutput = (s) => {
        if (s.startsWith(question)) rl.output.write(s);
        else if (s.includes('\n') || s.includes('\r')) rl.output.write('\n');
        else rl.output.write('*'.repeat(s.length));
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function confirm(question, defaultYes = true) {
  const a = (await ask(`${question} ${defaultYes ? '[Y/n]' : '[y/N]'} `)).toLowerCase();
  return a ? a.startsWith('y') : defaultYes;
}

function readEnv() {
  return readFileSync(envPath, 'utf8');
}

function getVar(text, name) {
  const m = text.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return m ? m[1].trim() : '';
}

function setVar(text, name, value) {
  const line = `${name}=${value}`;
  const re = new RegExp(`^${name}=.*$`, 'm');
  return re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
}

function mask(v) {
  return v.length <= 4 ? '****' : `${'*'.repeat(v.length - 4)}${v.slice(-4)}`;
}

console.log(bold('Maraton setup'));

// 1. Node version
step(1, 'Checking Node.js');
const major = Number(process.versions.node.split('.')[0]);
if (major < 22) {
  console.log(red(`Node.js ${process.versions.node} is too old. Install Node.js 22 or newer from https://nodejs.org and run this again.`));
  process.exit(1);
}
console.log(green(`Node.js ${process.versions.node} ✓`));

// Turn on the git hook that refuses commits containing Strava keys or tokens.
const hook = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root });
if (hook.status === 0) console.log(green('Commit safety check on ✓ (commits with Strava keys or tokens are blocked)'));
else console.log(yellow('Could not turn on the commit safety check (is this a git clone?).'));

// 2. Strava keys
step(2, 'Configuring Strava keys');
// Keys passed in by GitHub (Codespaces secrets) or exported in the shell win
// over .env, so there's nothing to ask for.
const fromGitHub = Boolean(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET);
const hasRefreshToken = Boolean(process.env.STRAVA_CLIENT_REFRESH_TOKEN || process.env.STRAVA_REFRESH_TOKEN);
let env = existsSync(envPath) ? readEnv() : '';
if (fromGitHub) {
  console.log(green(`Using STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET from your GitHub secrets ✓`));
  if (hasRefreshToken) console.log(green('Using STRAVA_CLIENT_REFRESH_TOKEN from your GitHub secrets ✓'));
} else {
  if (inCodespace) {
    console.log(yellow('You are in a Codespace, but your Strava keys were not passed in.'));
    console.log(yellow('Secrets added under "Actions" are only for workflows — Codespaces has its own list.'));
    console.log(`To skip this step next time, add STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET and`);
    console.log(`STRAVA_CLIENT_REFRESH_TOKEN at ${bold(`https://github.com/${repoSlug}/settings/secrets/codespaces`)}`);
    console.log(`then restart the Codespace. For now you can type them below.\n`);
  }
  if (!existsSync(envPath)) {
    copyFileSync(examplePath, envPath);
    console.log('Created .env from .env.example');
  } else {
    console.log('Found existing .env — press Enter to keep current values.');
  }
  console.log(`Find your keys at ${bold('https://www.strava.com/settings/api')}`);
  if (!inCodespace) console.log(`(Authorization Callback Domain there must be ${bold('localhost')})`);
  console.log('');

  env = readEnv();
  const currentId = getVar(env, 'STRAVA_CLIENT_ID');
  const currentSecret = getVar(env, 'STRAVA_CLIENT_SECRET');

  let id = await ask(`Client ID${currentId ? ` [${currentId}]` : ''}: `);
  id ||= currentId;
  while (!/^\d+$/.test(id)) {
    console.log(yellow('The Client ID is a number, e.g. 123456.'));
    id = await ask('Client ID: ');
  }

  let secret = await ask(`Client Secret${currentSecret ? ` [${mask(currentSecret)}]` : ''}: `, { hidden: true });
  secret ||= currentSecret;
  while (!/^[0-9a-f]{40}$/i.test(secret)) {
    console.log(yellow('The Client Secret is a 40-character code (letters a–f and numbers). Click "show" next to it on Strava to copy it.'));
    secret = await ask('Client Secret: ', { hidden: true });
  }

  env = setVar(env, 'STRAVA_CLIENT_ID', id);
  env = setVar(env, 'STRAVA_CLIENT_SECRET', secret);
  writeFileSync(envPath, env);
  if (process.platform !== 'win32') chmodSync(envPath, 0o600); // only you can read your keys
  console.log(green('Saved to .env ✓ (this file is ignored by git, so your keys stay private)'));
}

// 3. Tests
step(3, 'Running tests');
const tests = spawnSync(npm, ['test', '--silent'], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });
const output = `${tests.stdout}${tests.stderr}`;
const pass = output.match(/# pass (\d+)/)?.[1];
const fail = output.match(/# fail (\d+)/)?.[1];
if (tests.status === 0) {
  console.log(green(`All ${pass} tests passed ✓`));
} else {
  console.log(output);
  console.log(red(`${fail ?? 'Some'} test(s) failed. Setup is done, but something may be wrong with the code.`));
}

// 4. Start
step(4, 'Connecting to Strava');
const base = appBaseUrl({ ...process.env, PORT: process.env.PORT || getVar(env, 'PORT') || undefined });
if (hasRefreshToken) {
  console.log(`Already connected through your refresh token — no Strava login needed.`);
  console.log(`Start the app and open ${bold(`${base}/api/athlete`)}, or run ${bold('npm run summary')}.\n`);
} else {
  if (inCodespace) {
    const host = new URL(base).host;
    console.log(yellow(`In a Codespace, Strava must send you back to ${host} instead of localhost.`));
    console.log(`On ${bold('https://www.strava.com/settings/api')} set ${bold('Authorization Callback Domain')} to:`);
    console.log(`  ${bold(host)}\n`);
  }
  console.log(`Next: start the app, open ${bold(base)} and click ${bold('Connect with Strava')}.`);
  console.log(`After connecting, run ${bold('npm run token')} to get the refresh token for the`);
  console.log(`STRAVA_CLIENT_REFRESH_TOKEN GitHub secret.\n`);
}

if (await confirm('Start the app now?')) {
  console.log(`\nStarting… (press ${bold('Ctrl+C')} to stop)\n`);
  const child = spawn(npm, ['start'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  child.on('exit', (code) => process.exit(code ?? 0));
} else {
  console.log(`\nDone! Run ${bold('npm start')} whenever you're ready.`);
}
