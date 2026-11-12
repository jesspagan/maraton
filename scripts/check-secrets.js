// Blocks Strava access information (Client ID, Client Secret, tokens) from being committed.
//
//   node scripts/check-secrets.js           scan every tracked file (used by CI)
//   node scripts/check-secrets.js --staged  scan what's about to be committed (git pre-commit hook)
//
// A line can be allowed on purpose by adding the comment: secret-scan:allow
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const staged = process.argv.includes('--staged');

// Files that hold real credentials and must never be committed.
const FORBIDDEN_FILES = [
  { test: (f) => /(^|\/)\.env(\..+)?$/.test(f) && !f.endsWith('.env.example'), why: '.env files hold your keys' },
  { test: (f) => /tokens?\.json$/i.test(f), why: 'token files hold your Strava login' },
];

// Strava Client Secrets and access/refresh tokens are 40 hex characters; Client IDs are numbers.
const HEX40 = '[0-9a-fA-F]{40}';
const RULES = [
  { name: 'Strava Client ID', re: /STRAVA_\w*CLIENT_ID\s*[=:]\s*["']?\d{3,}/ },
  { name: 'Strava Client ID', re: /client_?id["']?\s*[=:]\s*["']?\d{4,}/i },
  { name: 'Strava secret or token', re: new RegExp(`STRAVA_\\w*(SECRET|TOKEN)\\s*[=:]\\s*["']?[^\\s"'$#{]{8,}`) },
  { name: 'Strava secret or token', re: new RegExp(`(secret|token|bearer)[\\w"' ]*[=:\\s]\\s*["']?${HEX40}\\b`, 'i') },
];

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

const files = (staged
  ? git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z')
  : git('ls-files', '-z')
).split('\0').filter(Boolean);

const problems = [];
for (const file of files) {
  const forbidden = FORBIDDEN_FILES.find((r) => r.test(file));
  if (forbidden) {
    problems.push(`${file}: this file must not be committed (${forbidden.why})`);
    continue;
  }
  let text;
  try {
    text = staged ? git('show', `:${file}`) : readFileSync(file, 'utf8');
  } catch {
    continue; // deleted or unreadable
  }
  if (text.includes('\0')) continue; // binary (e.g. logo.png)
  text.split('\n').forEach((line, i) => {
    if (line.includes('secret-scan:allow')) return;
    for (const rule of RULES) {
      if (rule.re.test(line)) {
        problems.push(`${file}:${i + 1}: looks like a ${rule.name}`);
        break;
      }
    }
  });
}

if (problems.length) {
  console.error('\x1b[31m✖ Strava access information found — not committing.\x1b[0m\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error('\nKeep keys in .env (ignored by git) or in GitHub secrets, never in the code.');
  console.error('If you already pushed a real key, reset it at https://www.strava.com/settings/api.');
  process.exit(1);
}
console.log(`✓ No Strava access information in ${files.length} ${staged ? 'staged' : 'tracked'} file(s).`);
