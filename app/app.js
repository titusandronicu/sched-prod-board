import { fetchIncidents, ack } from './api.js';

const POLL_MS = 2000; // R4
const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const bar = document.querySelector('[data-testid="new-bar"]');
const status = document.getElementById('status');

const shown = new Map(); // id -> incident: what the list on screen holds
const waiting = new Map(); // id -> incident: landed since, held behind the "N new" bar
const acked = new Set(); // ids acked on this page
const pending = new Set(); // acks in flight

// R5: the viewer's own time zone and locale order (dd/mm for EU locales). The full UTC value stays in datetime.
const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'medium' });
const local = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : fmt.format(d);
};
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const ackCell = (id) =>
  acked.has(id)
    ? '<span data-testid="acked" class="acked">acked</span>'
    : `<button type="button" data-testid="ack" ${pending.has(id) ? 'disabled' : ''}>Ack</button>`;

function rowHtml(i) {
  return `<li data-testid="incident-row" data-id="${esc(i.id)}" class="row ${esc(i.severity)}">
    <span class="id">${esc(i.id)}</span>
    <span class="sev">${esc(i.severity)}</span>
    <span class="what">${esc(i.service)} · ${esc(i.region)} · ${esc(i.summary)}</span>
    <time datetime="${esc(i.openedAt)}">${esc(local(i.openedAt))}</time>
    <span class="cell">${ackCell(i.id)}</span>
  </li>`;
}

// R1: newest first. The whole list is rebuilt only on the first load and when the "N new" bar is clicked,
// never by a poll, so rows never move or get replaced under the pointer.
function renderList() {
  const rows = [...shown.values()].sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt));
  list.innerHTML = rows.map(rowHtml).join('');
  empty.hidden = rows.length > 0;
}

function renderBar() {
  const n = waiting.size;
  bar.hidden = n === 0;
  bar.textContent = `${n} new`;
}

// Ack changes only its own row's cell. Nothing else on the page moves.
function renderAckCell(id) {
  const row = list.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (row) row.querySelector('.cell').innerHTML = ackCell(id);
}

// R2: one delegated handler. The row is read from the click, and it stays where it is.
list.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-testid="ack"]');
  if (!btn) return;
  const id = btn.closest('[data-testid="incident-row"]').dataset.id;
  if (pending.has(id) || acked.has(id)) return;
  pending.add(id);
  renderAckCell(id);
  try {
    await ack(id);
    acked.add(id);
    status.textContent = '';
  } catch (err) {
    status.textContent = `Ack failed for ${id}: ${err.message}`;
  } finally {
    pending.delete(id);
    renderAckCell(id);
  }
});

bar.addEventListener('click', () => {
  for (const [id, i] of waiting) shown.set(id, i);
  waiting.clear();
  renderList();
  renderBar();
});

let loaded = false;
async function refresh() {
  try {
    const page = await fetchIncidents();
    if (!loaded) {
      for (const i of page.incidents) shown.set(i.id, i);
      loaded = true;
      loader.hidden = true; // R3: gone once incidents are on screen
      renderList();
    } else {
      for (const i of page.incidents) if (!shown.has(i.id)) waiting.set(i.id, i);
      renderBar();
    }
    status.textContent = '';
  } catch (err) {
    status.textContent = `Could not refresh: ${err.message}`;
  }
}

await refresh();
setInterval(refresh, POLL_MS); // R4
