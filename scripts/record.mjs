// Records the live board in use (open-board, watch-board, ack-incident) and writes recordings/run.json.
// node scripts/record.mjs <board url>   -- acks ONE real incident (the newest), so run it once on purpose.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
const url = process.argv[2];
if (!url?.startsWith('https://')) { console.error('usage: node scripts/record.mjs https://<board>'); process.exit(1); }
mkdirSync('recordings/raw', { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, locale: 'en-GB', timezoneId: 'Europe/Berlin', recordVideo: { dir: 'recordings/raw', size: { width: 1280, height: 720 } } });
const p = await ctx.newPage();
const t0 = Date.now(); // the video starts when the page is created
const at = () => ((Date.now() - t0) / 1000).toFixed(1);
const run = { url, polls: [], events: [], receipt: null };
const ev = (name) => { run.events.push({ name, at: Number(at()) }); console.log(at().padStart(5), name); };
p.on('request', (r) => { if (r.url().includes('/incidents')) run.polls.push(Number(at())); });
p.on('console', (m) => { if (m.type() === 'info' && m.text().startsWith('ack ')) run.receipt = m.text(); });
const caption = (text) => p.evaluate((t) => { let d = document.getElementById('rec-caption'); if (!d) { d = document.createElement('div'); d.id = 'rec-caption'; d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;padding:8px 24px;background:#111;color:#fff;font:14px/1.3 ui-monospace,monospace;z-index:9'; document.body.append(d); } d.textContent = t; }, text);
await p.goto(url); ev('page opened');
await p.getByTestId('loader').waitFor({ state: 'visible', timeout: 2000 }).then(() => ev('loader visible')).catch(() => ev('loader already gone'));
await p.getByTestId('incident-row').first().waitFor({ timeout: 20000 }); ev('open-board: incidents on screen');
await p.waitForTimeout(3000);
await caption('recording caption (added by the recorder): watch-board, no reload'); ev('watch-board start');
await p.waitForTimeout(8000); ev('watch-board end');
const row = p.getByTestId('incident-row').first();
const id = await row.getAttribute('data-id'); run.ackedId = id;
await caption(`recording caption (added by the recorder): ack-incident ${id}`);
await p.waitForTimeout(1500);
ev(`ack-incident: click on ${id}`);
await row.getByTestId('ack').click();
await row.getByTestId('acked').waitFor({ timeout: 10000 }); ev('ack-incident: acked mark shown');
await caption(`recording caption (added by the recorder): receipt from the board's console: ${run.receipt?.split(' ').slice(3).join(' ')}`);
await p.waitForTimeout(4000);
run.sha = await p.locator('meta[name=build]').getAttribute('content');
run.footerSha = await p.getByTestId('build-sha').innerText();
const first = await p.getByTestId('incident-row').first().innerText();
run.firstRow = first.replace(/\s+/g, ' ');
const vid = p.video();
await ctx.close(); await b.close();
run.videoFile = await vid.path();
writeFileSync('recordings/run.json', JSON.stringify(run, null, 1));
console.log(JSON.stringify({ ackedId: run.ackedId, receipt: run.receipt, sha: run.sha, footerSha: run.footerSha, polls: run.polls.length, video: run.videoFile }, null, 1));
