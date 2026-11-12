import { fetchIncidents, ack } from './api.js';

const POLL_MS = 2000; // R4
const board = document.querySelector('[data-testid="board"]');
const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const status = document.getElementById('status');

const incidents = new Map(); // id -> incident (merged across polls, so rows never vanish or lose state)
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

function rowHtml(i) {
  const done = acked.has(i.id);
  return `<li data-testid="incident-row" data-id="${esc(i.id)}" class="row ${esc(i.severity)}">
    <span class="id">${esc(i.id)}</span>
    <span class="sev">${esc(i.severity)}</span>
    <span class="what">${esc(i.service)} · ${esc(i.region)} · ${esc(i.summary)}</span>
    <time datetime="${esc(i.openedAt)}">${esc(local(i.openedAt))}</time>
    ${
      done
        ? '<span data-testid="acked" class="acked">acked</span>'
        : `<button type="button" data-testid="ack" ${pending.has(i.id) ? 'disabled' : ''}>Ack</button>`
    }
  </li>`;
}

function render() {
  const rows = [...incidents.values()].sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt)); // R1: newest first
  list.innerHTML = rows.map(rowHtml).join('');
  empty.hidden = rows.length > 0;
}

// R2: one delegated handler, so re-rendering never loses the click target.
list.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-testid="ack"]');
  if (!btn) return;
  const id = btn.closest('[data-testid="incident-row"]').dataset.id;
  if (pending.has(id) || acked.has(id)) return;
  pending.add(id);
  render();
  try {
    await ack(id);
    acked.add(id);
    status.textContent = '';
  } catch (err) {
    status.textContent = `Ack failed for ${id}: ${err.message}`;
  } finally {
    pending.delete(id);
    render();
  }
});

let loaded = false;
async function refresh() {
  try {
    const page = await fetchIncidents();
    for (const i of page.incidents) incidents.set(i.id, i);
    if (!loaded) {
      loaded = true;
      loader.hidden = true; // R3: gone once incidents are on screen
    }
    status.textContent = '';
    render();
  } catch (err) {
    status.textContent = `Could not refresh: ${err.message}`;
  }
}

await refresh();
setInterval(refresh, POLL_MS); // R4
