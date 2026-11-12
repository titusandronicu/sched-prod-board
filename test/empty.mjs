// The quiet night: the API answers with no incidents. The loader must end, the empty state must show, the bar stays away.
// node test/empty.mjs  (needs dist/ built with API=http://localhost:4600/api)
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
let incidents = [];
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  const send = (c, b, t = 'application/json') => { r.writeHead(c, { 'content-type': t, 'access-control-allow-origin': '*' }); r.end(typeof b === 'string' || Buffer.isBuffer(b) ? b : JSON.stringify(b)); };
  if (u.pathname === '/api/incidents') return setTimeout(() => send(200, { updatedAt: new Date().toISOString(), incidents, cursor: `c${incidents.length}` }), 500);
  try { send(200, readFileSync('dist' + (u.pathname === '/' ? '/index.html' : u.pathname)), u.pathname.endsWith('.js') ? 'text/javascript' : u.pathname.endsWith('.css') ? 'text/css' : 'text/html'); } catch { send(404, 'no', 'text/plain'); }
}).listen(4600);
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('http://localhost:4600/');
ok(await p.getByTestId('loader').isVisible(), 'quiet night: the loader shows while waiting');
await p.getByTestId('empty').waitFor({ state: 'visible', timeout: 5000 });
ok(await p.getByTestId('loader').isHidden(), 'quiet night: the loader ends on an empty answer');
ok((await p.getByTestId('empty').innerText()) === 'No incidents.', 'quiet night: the empty state says so');
ok((await p.getByTestId('incident-row').count()) === 0 && (await p.getByTestId('new-bar').isHidden()), 'quiet night: no rows, no bar');
// The first incident of the night lands: it waits behind the bar like any other, and the empty line stays until the bar is clicked.
incidents = [{ id: 'INC-1', service: 'svc', region: 'eu', summary: 'first', severity: 'sev2', openedAt: '2026-11-12T01:00:00.000Z' }];
await p.getByTestId('new-bar').waitFor({ state: 'visible', timeout: 6000 });
ok((await p.getByTestId('new-bar').innerText()) === '1 new', 'quiet night: the first incident shows as "1 new"');
await p.getByTestId('new-bar').click();
ok((await p.getByTestId('incident-row').count()) === 1 && (await p.getByTestId('empty').isHidden()), 'quiet night: the bar click brings it in and hides the empty line');
await b.close(); srv.close();
