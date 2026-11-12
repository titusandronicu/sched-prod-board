// Local acceptance test against a mock API. node test/local.mjs  (needs dist/ built with API=http://localhost:4599/api)
// Covers SCHED-4511..4515: loader, newest first, Ack, 2 s refresh, local times, and product's decision (the list holds still,
// a "N new" bar brings new incidents in, Ack stays on the row), including the ack race that failed on the first build.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
const mk = (n, t) => ({ id: `INC-${n}`, service: 'svc', region: 'eu-west', summary: `s <b>${n}</b>`, severity: 'sev2', openedAt: t });
let list = [mk(3, '2026-11-12T03:03:00.000Z'), mk(2, '2026-11-12T02:30:00.000Z'), mk(1, '2026-11-12T02:00:00.000Z')];
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
const ctx = (locale, tz) => b.newContext({ locale, timezoneId: tz, viewport: { width: 1280, height: 720 } });
const p = await (await ctx('en-GB', 'Europe/Berlin')).newPage();
const ids = () => p.locator('[data-testid=incident-row]').evaluateAll((r) => r.map((x) => x.dataset.id));
await p.goto('http://localhost:4599/');
ok(await p.getByTestId('loader').isVisible(), '4512 loader shows on open');
await p.getByTestId('incident-row').first().waitFor();
ok(await p.getByTestId('loader').isHidden(), '4512 loader gone once incidents are on screen');
ok((await ids()).join() === 'INC-3,INC-2,INC-1', '4511 newest first');
ok((await p.locator('.what').first().innerHTML()).includes('&lt;b&gt;'), 'API text is escaped');
ok(await p.getByTestId('new-bar').isHidden(), '4515 no bar while nothing is waiting');

// A new incident lands. The list must hold still; the bar says so.
await p.evaluate(() => { document.querySelectorAll('[data-testid=incident-row]').forEach((r) => { r._mark = 'same-node'; }); });
const boxBefore = await p.locator('[data-id="INC-2"] [data-testid=ack]').boundingBox();
list = [mk(4, '2026-11-12T04:00:00.000Z'), ...list];
await p.getByTestId('new-bar').waitFor({ state: 'visible', timeout: 6000 });
ok((await p.getByTestId('new-bar').innerText()) === '1 new', '4515/4513 the bar shows "1 new" within the refresh time, no reload');
await p.waitForTimeout(2500); // at least one more poll
ok((await ids()).join() === 'INC-3,INC-2,INC-1', '4515 the list on screen did not change');
ok(await p.evaluate(() => [...document.querySelectorAll('[data-testid=incident-row]')].every((r) => r._mark === 'same-node')), '4515 rows were not replaced by a poll');
const boxAfter = await p.locator('[data-id="INC-2"] [data-testid=ack]').boundingBox();
ok(boxBefore.x === boxAfter.x && boxBefore.y === boxAfter.y, '4515 the bar appearing did not move any row');

// The race that failed on the first build: aim at INC-2, an incident lands, click where I aimed.
const x = boxBefore.x + boxBefore.width / 2, y = boxBefore.y + boxBefore.height / 2;
await p.mouse.move(x, y, { steps: 10 });
list = [mk(5, '2026-11-12T05:00:00.000Z'), ...list];
await p.waitForFunction(() => document.querySelector('[data-testid=new-bar]').textContent === '2 new', null, { timeout: 6000 });
await p.waitForTimeout(150);
await p.mouse.click(x, y);
await p.locator('[data-id="INC-2"] [data-testid=acked]').waitFor({ timeout: 5000 });
ok(acks.join() === 'INC-2', '4515 click where I aimed acked the row I meant (INC-2), not a neighbour');
const boxAcked = await p.locator('[data-id="INC-2"]').boundingBox();
ok(Math.abs(boxAcked.y - (boxBefore.y - 6)) < 14, '4515 Ack stays on its row (same place on screen)');
ok((await ids()).join() === 'INC-3,INC-2,INC-1', '4515 the list still holds still after the ack');

// Click the bar: waiting incidents come in at the top, newest first; the bar goes away; the acked mark survives.
await p.getByTestId('new-bar').click();
ok((await ids()).join() === 'INC-5,INC-4,INC-3,INC-2,INC-1', '4511/4515 the bar brings new incidents in at the top, newest first');
ok(await p.getByTestId('new-bar').isHidden(), '4515 the bar is gone once nothing waits');
ok(await p.locator('[data-id="INC-2"] [data-testid=acked]').isVisible(), 'acked mark survives the bar click');
await p.waitForTimeout(2500);
ok((await ids()).join() === 'INC-5,INC-4,INC-3,INC-2,INC-1' && (await p.getByTestId('new-bar').isHidden()), '4513 refresh adds nothing twice');

const sha = await p.locator('meta[name=build]').getAttribute('content');
ok(sha && sha === (await p.getByTestId('build-sha').innerText()) && !sha.includes('__'), `R6 build sha in meta and footer (${sha})`);
const t = async (loc, tz) => { const pg = await (await ctx(loc, tz)).newPage(); await pg.goto('http://localhost:4599/'); await pg.locator('[data-id="INC-3"] time').waitFor(); return [await pg.locator('[data-id="INC-3"] time').innerText(), await pg.locator('[data-id="INC-3"] time').getAttribute('datetime')]; };
const [ber, d1] = await t('de-DE', 'Europe/Berlin'), [akl, d2] = await t('en-NZ', 'Pacific/Auckland'), [nyc, d3] = await t('en-US', 'America/New_York');
console.log({ ber, akl, nyc });
ok(ber.startsWith('12.11.') && ber.includes('04:03'), '4514 Berlin: day first, local zone');
ok(akl.startsWith('12/11/'), '4514 Auckland: day first');
ok(nyc.startsWith('11/11/') && nyc.includes('10:03'), '4514 New York: month first, previous day in local zone');
ok([d1, d2, d3].every((d) => d === '2026-11-12T03:03:00.000Z'), '4514 datetime keeps full UTC');
await b.close(); srv.close();
