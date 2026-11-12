// Builds dist/ from app/: injects the API address, the session and the git sha. Usage:
//   API=https://... SESSION=v1.... node scripts/build.mjs
// The repo keeps placeholders, so the session never lands in git. R6: the sha goes in <meta name="build"> and the footer.
import { cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
const { API, SESSION } = process.env;
if (!API || !SESSION) { console.error('set API and SESSION'); process.exit(1); }
const sha = execSync('git rev-parse --short=12 HEAD').toString().trim();
if (execSync('git status --porcelain app scripts').toString().trim()) { console.error('uncommitted changes: the sha would not name this build'); process.exit(1); }
rmSync('dist', { recursive: true, force: true });
cpSync('app', 'dist', { recursive: true });
const sub = (f, pairs) => writeFileSync(f, pairs.reduce((s, [a, b]) => s.replaceAll(a, b), readFileSync(f, 'utf8')));
sub('dist/index.html', [['__BUILD_SHA__', sha]]);
sub('dist/config.js', [['__API__', API], ['__SESSION__', SESSION]]);
console.log(`built dist/ at ${sha}`);
