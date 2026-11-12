// Records the same ack race against the new build: aim at one row, a real new incident lands, click where I aimed.
// Product's decision: the list holds still, a "N new" bar brings new incidents in. Expected: the row I meant gets the ack.
// node scripts/record-hold.mjs <board url> [meant incident id]   -- sends ONE real ack. Nothing is mocked.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
const [url, meant = 'INC-6881'] = process.argv.slice(2);
if (!url?.startsWith('https://')) { console.error('usage: node scripts/record-hold.mjs https://<board> [incident id]'); process.exit(1); }
mkdirSync('recordings/hold', { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, locale: 'en-GB', timezoneId: 'Europe/Berlin', recordVideo: { dir: 'recordings/hold', size: { width: 1280, height: 720 } } });
const p = await ctx.newPage();
const t0 = Date.now(); const at = () => Number(((Date.now() - t0) / 1000).toFixed(1));
const run = { url, meant, events: [], receipt: null };
const ev = (name, extra = {}) => { run.events.push({ name, at: at(), ...extra }); console.log(String(at()).padStart(5), name, JSON.stringify(extra)); };
p.on('console', (m) => { if (m.type() === 'info' && m.text().startsWith('ack ')) run.receipt = m.text(); });
const caption = (text) => p.evaluate((t) => { let d = document.getElementById('rec-caption'); if (!d) { d = document.createElement('div'); d.id = 'rec-caption'; d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;padding:8px 24px;background:#111;color:#fff;font:14px/1.3 ui-monospace,monospace;z-index:9'; document.body.append(d); } d.textContent = t; }, text);
const ids = () => p.locator('[data-testid=incident-row]').evaluateAll((r) => r.map((x) => x.dataset.id));
const stop = async (why) => { ev(why); await ctx.close(); await b.close(); process.exit(2); };

await p.goto(url);
await p.getByTestId('incident-row').first().waitFor(); ev('board open');
await p.mouse.move(640, 600);
await p.waitForTimeout(4000);
const btn = p.locator(`[data-id="${meant}"] [data-testid=ack]`);
if (!(await btn.count())) await stop(`the meant row ${meant} is not on the board: nothing clicked`);
const box = await btn.boundingBox();
const x = box.x + box.width / 2, y = box.y + box.height / 2;
const before = await ids();
await caption(`recording caption (added by the recorder): I mean to ack ${meant} (the sev1 row)`);
await p.mouse.move(x, y, { steps: 30 });
ev('aimed at the Ack of the meant row', { meant, x: Math.round(x), y: Math.round(y), rowIndex: before.indexOf(meant), topBefore: before[0] });
// Wait, like a person, for a real incident to land. The bar is what product asked for. No stability wait.
try { await p.getByTestId('new-bar').waitFor({ state: 'visible', timeout: 120000 }); } catch { await stop('no incident landed in 120 s: nothing clicked'); }
run.barText = await p.getByTestId('new-bar').innerText();
ev('a new incident landed: the bar shows', { bar: run.barText });
await p.waitForTimeout(150); // a person's reaction time
run.listBefore = await ids();
const under = await p.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-testid=incident-row]')?.dataset.id ?? null, [x, y]);
run.rowUnderPointer = under;
ev('click at the spot I aimed at', { rowUnderPointer: under, listUnchanged: run.listBefore.join() === before.join() });
await p.mouse.click(x, y);
await p.locator('[data-testid=acked]').first().waitFor({ timeout: 10000 });
run.ackedId = await p.locator('[data-testid=incident-row]:has([data-testid=acked])').first().getAttribute('data-id');
ev('acked mark shown', { ackedId: run.ackedId });
const rid = run.receipt?.split(' ').slice(3).join(' ');
await caption(`recording caption (added by the recorder): I meant ${meant}. The ack went to ${run.ackedId}. Receipt from the board's console: ${rid}`);
await p.waitForTimeout(3000);
const topNow = (await ids())[0];
await p.getByTestId('new-bar').click(); // bring the waiting incidents in
run.listAfter = await ids();
ev('clicked the bar: new incidents come in on top', { oldTop: topNow, newTop: run.listAfter[0], count: run.listAfter.length });
await p.waitForTimeout(3000);
run.sha = await p.locator('meta[name=build]').getAttribute('content');
const vid = p.video(); await ctx.close(); await b.close();
run.videoFile = await vid.path();
writeFileSync('recordings/hold-run.json', JSON.stringify(run, null, 1));
console.log(JSON.stringify({ meant, ackedId: run.ackedId, same: run.ackedId === meant, receiptId: run.receipt?.split(' ')[1], rowUnderPointer: under, bar: run.barText, sha: run.sha, video: run.videoFile }, null, 1));
