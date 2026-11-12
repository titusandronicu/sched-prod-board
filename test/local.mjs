// Local acceptance test against a mock API. node test/local.mjs  (needs dist/ built with API=http://localhost:4599/api)
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
const mk = (n, t) => ({ id: `INC-${n}`, service: 'svc', region: 'eu-west', summary: `s <b>${n}</b>`, severity: 'sev2', openedAt: t });
let list = [mk(2, '2026-11-12T03:03:00.000Z'), mk(1, '2026-11-12T02:00:00.000Z')];
const acks = [];
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  const send = (c, b, t = 'application/json') => { r.writeHead(c, { 'content-type': t, 'access-control-allow-origin': '*' }); r.end(typeof b === 'string' || Buffer.isBuffer(b) ? b : JSON.stringify(b)); };
  if (u.pathname === '/api/incidents') return setTimeout(() => send(200, { updatedAt: new Date().toISOString(), incidents: list, cursor: `c${list.length}` }), 700);
  if (u.pathname === '/api/ack') { acks.push(u.searchParams.get('id')); return send(200, { id: u.searchParams.get('id'), ackedAt: new Date().toISOString(), receipt: `r-${acks.length}` }); }
  try { send(200, readFileSync('dist' + (u.pathname === '/' ? '/index.html' : u.pathname)), u.pathname.endsWith('.js') ? 'text/javascript' : u.pathname.endsWith('.css') ? 'text/css' : 'text/html'); } catch { send(404, 'no', 'text/plain'); }
}).listen(4599);
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const b = await chromium.launch();
const ctx = (locale, tz) => b.newContext({ locale, timezoneId: tz });
const p = await (await ctx('en-GB', 'Europe/Berlin')).newPage();
p.on('console', m => console.log('console', m.type(), m.text())); p.on('pageerror', e => console.log('pageerror', e.message)); p.on('requestfailed', r => console.log('reqfail', r.url(), r.failure()?.errorText));
await p.goto('http://localhost:4599/');
ok(await p.getByTestId('loader').isVisible(), '4512 loader shows on open');
await p.getByTestId('incident-row').first().waitFor();
ok(await p.getByTestId('loader').isHidden(), '4512 loader gone once incidents are on screen');
ok((await p.getByTestId('incident-row').first().getAttribute('data-id')) === 'INC-2', '4511 newest first');
ok((await p.locator('.what').first().innerHTML()).includes('&lt;b&gt;'), 'API text is escaped');
list = [mk(3, '2026-11-12T04:00:00.000Z'), ...list];
await p.waitForFunction(() => document.querySelector('[data-testid=incident-row]').dataset.id === 'INC-3', null, { timeout: 5000 });
ok(true, '4511/4513 new incident on top without reload (within 5s)');
await p.locator('[data-id="INC-3"] [data-testid=ack]').click();
await p.locator('[data-id="INC-3"] [data-testid=acked]').waitFor();
ok(acks.join() === 'INC-3', '4511 Ack acks that incident and marks the row');
await p.waitForTimeout(2500);
ok(await p.locator('[data-id="INC-3"] [data-testid=acked]').isVisible(), 'acked mark survives a refresh');
const sha = await p.locator('meta[name=build]').getAttribute('content');
ok(sha && sha === (await p.getByTestId('build-sha').innerText()) && !sha.includes('__'), `R6 build sha in meta and footer (${sha})`);
const t = async (loc, tz) => { const pg = await (await ctx(loc, tz)).newPage(); await pg.goto('http://localhost:4599/'); await pg.locator('[data-id="INC-2"] time').waitFor(); return [await pg.locator('[data-id="INC-2"] time').innerText(), await pg.locator('[data-id="INC-2"] time').getAttribute('datetime')]; };
const [ber, d1] = await t('de-DE', 'Europe/Berlin'), [akl, d2] = await t('en-NZ', 'Pacific/Auckland'), [nyc, d3] = await t('en-US', 'America/New_York');
console.log({ ber, akl, nyc });
ok(ber.startsWith('12.11.') && ber.includes('04:03'), '4514 Berlin: day first, local zone');
ok(akl.startsWith('12/11/'), '4514 Auckland: day first');
ok(nyc.startsWith('11/11/') && nyc.includes('10:03'), '4514 New York: month first, previous day in local zone');
ok([d1, d2, d3].every((d) => d === '2026-11-12T03:03:00.000Z'), '4514 datetime keeps full UTC');
await b.close(); srv.close();
