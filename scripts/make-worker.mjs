// Bundles dist/ into one Worker module (worker/worker.js) that serves the files: no assets API, one upload.
// Run after scripts/build.mjs.
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
const types = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8' };
const files = Object.fromEntries(readdirSync('dist').map((f) => [f, { type: types[f.split('.').pop()], body: readFileSync(`dist/${f}`, 'utf8') }]));
const code = `const FILES = ${JSON.stringify(files)};
export default {
  fetch(request) {
    const path = new URL(request.url).pathname;
    const f = FILES[path === '/' ? 'index.html' : path.slice(1)];
    if (!f) return new Response('not found', { status: 404 });
    return new Response(f.body, { headers: { 'content-type': f.type, 'cache-control': 'no-store' } });
  },
};
`;
mkdirSync('worker', { recursive: true });
writeFileSync('worker/worker.js', code);
console.log(`worker/worker.js: ${code.length} bytes, ${Object.keys(files).length} files`);
